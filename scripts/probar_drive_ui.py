# (1) Posiciones A y B de antes se unen solas (ya no se dividen).
# (2) Prueba de la pestaña Drive de Paletizado: crea el código del puente con las direcciones, lo "publica" en un
# Google simulado (scripts/simular-google.cjs), conecta, envía el Excel y revisa la seguridad del puente.
# Necesita: npm start (http://localhost:5173) y node. No escribe nada en la nube real.
import json, sys, time, subprocess, threading, urllib.request
import os, tempfile
GS = os.path.join(tempfile.gettempdir(), 'puente-paletizado.gs')
from http.server import BaseHTTPRequestHandler, HTTPServer
sys.path.insert(0, 'scripts')
from playwright.sync_api import sync_playwright

CODIGO = 'PRUE-BA23-4567'
nube = {'puente': {'url': '', 'carpetas': []}}

class Verificar(BaseHTTPRequestHandler):  # hace de la función "paletizado" para el puente (acción quien)
    def do_POST(self):
        largo = int(self.headers.get('Content-Length') or 0); self.rfile.read(largo)
        rol = 'admin' if (self.headers.get('x-admin') or '').upper() == CODIGO else 'ninguno'
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers()
        self.wfile.write(json.dumps({'rol': rol}).encode())
    def log_message(self, *a): pass
threading.Thread(target=HTTPServer(('127.0.0.1', 3300), Verificar).serve_forever, daemon=True).start()

def responder(route):
    req = route.request
    if req.method == 'OPTIONS': return route.fulfill(status=200, body='ok')
    b = json.loads(req.post_data or '{}'); a = b.get('accion')
    es_admin = (req.headers.get('x-admin') or '').upper() == CODIGO
    def ok(d, s=200): route.fulfill(status=s, content_type='application/json', body=json.dumps(d))
    if a == 'quien': return ok({'rol': 'admin', 'nombre': 'Carlos Prueba'} if es_admin else {'rol': 'ninguno', 'nombre': ''})
    if a in ('registrar', 'pregunta'): return ok({'ok': True})
    if a == 'conocimiento': return ok({'conocimiento': []})
    if a == 'config': return ok({'config': None})
    if a == 'mis_sugerencias': return ok({'sugerencias': []})
    if not es_admin: return ok({'error': 'Solo un administrador puede hacer esto.'}, 401)
    if a == 'puente': return ok({'puente': nube['puente']})
    if a == 'guardar_puente':
        nube['puente'] = {'url': b.get('url', ''), 'carpetas': b.get('carpetas', [])}
        return ok({'ok': True, 'puente': nube['puente']})
    if a == 'usuarios': return ok({'total': 0, 'apk': 0, 'web': 0, 'activos7': 0, 'lista': []})
    if a in ('tareas', 'sugerencias', 'preguntas'): return ok({a: []})
    return ok({'error': 'acción desconocida'}, 400)

fallas, errores, sim = [], [], None
def ok(c, t):
    print(('✓ ' if c else '✗ ') + t, flush=True)
    if not c: fallas.append(t)
def esperar(pg, f, s=20):
    fin = time.time() + s
    while time.time() < fin:
        try:
            if f(): return True
        except Exception: pass
        pg.wait_for_timeout(300)
    return False
def textos(pg): return ' | '.join(pg.evaluate('window.__avisos'))

with sync_playwright() as p:
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={'width': 390, 'height': 850})
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin='http://localhost:5173')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.route('**/functions/v1/paletizado', responder)
    def a_google(ruta):
        r = ruta.fetch(url='http://localhost:3200/exec', method=ruta.request.method, post_data=ruta.request.post_data)
        ruta.fulfill(response=r)
    ctx.route('https://script.google.com/macros/s/**', a_google)
    pg.add_init_script("window.__avisos = []; document.addEventListener('DOMContentLoaded', () => new MutationObserver((m) => m.forEach((x) => x.addedNodes.forEach((n) => n.classList && n.classList.contains('toast') && window.__avisos.push(n.textContent)))).observe(document.body, { childList: true }));")
    # (1) Un celular con datos de antes: 05-001x1 dividida en A (con artículo) y B (vacía)
    viejo = nav.new_context(viewport={'width': 390, 'height': 850})
    filas = [{'CODIGO': '05-001x1', 'SECCION': 'Seco no alimentos', 'PASILLO': '05', 'MODULO': '001', 'POSICION': 'x1', 'SUBPOSICION': '', 'SECUENCIA_RUTA': 1, 'ESTADO': 'DIVIDIDA'},
             {'CODIGO': '05-001x1A', 'SECCION': 'Seco no alimentos', 'PASILLO': '05', 'MODULO': '001', 'POSICION': 'x1', 'SUBPOSICION': 'A', 'SECUENCIA_RUTA': 1.05, 'ARTICULO': 'ARROZ 500G', 'CODIGO_ARTICULO': '123', 'ESTADO': 'INCOMPLETA'},
             {'CODIGO': '05-001x1B', 'SECCION': 'Seco no alimentos', 'PASILLO': '05', 'MODULO': '001', 'POSICION': 'x1', 'SUBPOSICION': 'B', 'SECUENCIA_RUTA': 1.06, 'ESTADO': 'SIN REVISAR'}]
    viejo.add_init_script("if (!sessionStorage.getItem('sembrado')) { sessionStorage.setItem('sembrado', '1'); localStorage.setItem('paletizado3d:ubicaciones', " + json.dumps(json.dumps(filas)) + "); }")
    v = viejo.new_page(); v.on('pageerror', lambda e: errores.append(str(e)))
    v.route('**/functions/v1/paletizado', responder)
    v.goto('http://localhost:5173/'); v.wait_for_timeout(800)
    v.click('[data-tab="tomar"]'); v.wait_for_timeout(500)
    lista = v.inner_text('#contenido')
    ok('05-001x1A' not in lista and '05-001x1B' not in lista, 'ya no aparecen 05-001x1A ni 05-001x1B')
    ok('05-001x1' in lista and 'ARROZ 500G' in lista, 'el artículo de la A quedó en 05-001x1')
    guardado = v.evaluate("localStorage.getItem('paletizado3d:ubicaciones')")
    ok('x1A' not in guardado and 'DIVIDIDA' not in guardado, 'lo guardado en el celular ya no tiene A/B')
    v.reload(); v.wait_for_timeout(600); v.click('[data-tab="tomar"]'); v.wait_for_timeout(300)
    ok('05-001x1A' not in v.inner_text('#contenido'), 'al volver a abrir siguen unidas')
    viejo.close()

    pg.goto('http://localhost:5173/'); pg.wait_for_timeout(800)
    pg.click('[data-tab="drive"]'); pg.wait_for_timeout(300)
    ok('Solo la administración' in pg.inner_text('#contenido'), 'sin entrar como administrador la pestaña Drive no deja enlazar')
    pg.click('[data-tab="tareas"]'); pg.fill('#formLogin [name=usuario]', CODIGO); pg.click('#formLogin button'); pg.wait_for_timeout(1000)
    pg.click('[data-tab="drive"]')
    ok(esperar(pg, lambda: 'Sin conectar' in pg.inner_text('#drEstado')), 'administrador: pestaña Drive sin conectar')
    pg.fill('#drDirecciones', 'https://drive.google.com/drive/folders/1PALETIZADOAAAAAAAAAAAAAAA?usp=sharing\nhttps://drive.google.com/drive/folders/1PALETIZADOBBBBBBBBBBBBBBB')
    pg.click('#drCrear')
    codigo = pg.input_value('#drCodigo')
    ok('1PALETIZADOAAAAAAAAAAAAAAA' in codigo and '1PALETIZADOBBBBBBBBBBBBBBB' in codigo and '"metodo": "post"' in codigo, 'con las direcciones se crea el código del puente (2 carpetas)')
    pg.click('#drCopiar'); ok(pg.evaluate('navigator.clipboard.readText()') == codigo, 'copiar código')
    open(GS, 'w', encoding='utf-8').write(codigo)
    sim = subprocess.Popen(['node', 'scripts/simular-google.cjs', GS, '3200', 'http://127.0.0.1:3300/']); time.sleep(1.5)
    pg.fill('#drUrl', 'https://script.google.com/macros/s/PALETIZADO_1/exec'); pg.click('#drGuardar')
    ok(esperar(pg, lambda: 'Conectado' in pg.inner_text('#drEstado')), 'guardar y probar: conectado con sus carpetas')
    ok(nube['puente']['url'].endswith('/exec') and len(nube['puente']['carpetas']) == 2, 'la dirección del puente queda guardada en la nube')
    pg.select_option('#drCarpeta', '1PALETIZADOBBBBBBBBBBBBBBB'); pg.click('#drExcel')
    ok(esperar(pg, lambda: 'Guardado en Drive' in textos(pg), 30), 'envía el Excel de Paletizado a Drive')
    if 'Guardado en Drive' not in textos(pg): print('   avisos:', textos(pg))
    est = json.loads(urllib.request.urlopen('http://localhost:3200/_estado').read())
    f = [a for a in est['archivos'] if a['nombre'].startswith('paletizado-cedi')]
    ok(f and f[0]['carpeta'] == '1PALETIZADOBBBBBBBBBBBBBBB' and f[0]['tam'] > 3000, f"el Excel quedó en la carpeta elegida ({f[0]['tam'] if f else 0} bytes)")
    def post(c):
        q = urllib.request.Request('http://localhost:3200/exec', data=json.dumps(c).encode(), headers={'Content-Type': 'text/plain'})
        return json.loads(urllib.request.urlopen(q).read())
    ok(post({'tool': 'subir', 'input': {'nombre': 'x', 'base64': 'eA=='}, 'acceso': {'codigo': 'AAAA-BBBB-CCCC'}}).get('error', {}).get('code') == 'sin_acceso', 'el puente no atiende un código falso')
    pg.click('#drQuitar'); pg.click('.caja [data-r="1"]')
    ok(esperar(pg, lambda: 'Sin conectar' in pg.inner_text('#drEstado')), 'desconectar')
    nav.close()
if sim: sim.kill()
ok(not errores, 'sin errores de JavaScript ' + '; '.join(errores[:3]))
print('✓ Todo bien' if not fallas else f'✗ {len(fallas)} fallaron'); sys.exit(1 if fallas else 0)
