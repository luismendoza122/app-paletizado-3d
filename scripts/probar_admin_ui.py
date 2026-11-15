# Prueba de interfaz: administración, sugerencias y enseñar al agente.
# La nube se simula aquí mismo (no escribe nada en la nube real). La corre GitHub Actions: probar-ui.yml
import json, sys
from playwright.sync_api import sync_playwright

CODIGO = 'PRUE-BA23-4567'
nube = {'sugerencias': [], 'preguntas': [], 'conocimiento': [], 'config': None, 'llamadas': []}

def responder(route):
    req = route.request
    if req.method == 'OPTIONS':
        return route.fulfill(status=200, body='ok')
    b = json.loads(req.post_data or '{}')
    a = b.get('accion')
    nube['llamadas'].append(a)
    es_admin = (req.headers.get('x-admin') or '').upper() == CODIGO
    def ok(d, s=200): route.fulfill(status=s, content_type='application/json', body=json.dumps(d))
    if a in ('registrar', 'pregunta') :
        if a == 'pregunta':
            nube['preguntas'].append({'id': len(nube['preguntas']) + 1, 'texto': b['texto'], 'veces': 1, 'estado': 'PENDIENTE'})
        return ok({'ok': True})
    if a == 'conocimiento': return ok({'conocimiento': [k for k in nube['conocimiento'] if k.get('activo', True)]})
    if a == 'config': return ok({'config': nube['config']})
    if a == 'quien': return ok({'rol': 'admin', 'nombre': 'Carlos Prueba'} if es_admin else {'rol': 'ninguno', 'nombre': '', 'motivo': 'Código no válido o ya fue quitado.'})
    if a == 'sugerir':
        nube['sugerencias'].insert(0, {'id': f'00000000-0000-0000-0000-00000000000{len(nube["sugerencias"]) + 1}', 'texto': b['texto'], 'categoria': b['categoria'], 'nombre': b.get('nombre'),
                                       'estado': 'NUEVA', 'respuesta': None, 'creado_en': '2026-11-14T20:00:00Z'})
        return ok({'ok': True})
    if a == 'mis_sugerencias': return ok({'sugerencias': nube['sugerencias']})
    if not es_admin: return ok({'error': 'Solo un administrador puede hacer esto.'}, 401)
    if a in ('admins', 'invitar_admin', 'quitar_admin'): return ok({'error': 'acción desconocida'}, 400)
    if a == 'usuarios': return ok({'total': 3, 'apk': 2, 'web': 1, 'activos7': 2, 'lista': []})
    if a == 'tareas': return ok({'tareas': []})
    if a == 'sugerencias':
        return ok({'sugerencias': [x for x in nube['sugerencias'] if not b.get('estado') or x['estado'] == b['estado']]})
    if a == 'responder_sugerencia':
        for x in nube['sugerencias']:
            if x['id'] == b['id']: x.update(estado=b['estado'], respuesta=b['respuesta'], respondido_por='Carlos Prueba')
        return ok({'ok': True})
    if a == 'preguntas': return ok({'preguntas': [q for q in nube['preguntas'] if q['estado'] == 'PENDIENTE']})
    if a == 'ensenar':
        nube['conocimiento'].insert(0, {'id': 50 + len(nube['conocimiento']), 'fecha': '2026-11-14', 'tema': 'Enseñado por administración', 'titulo': b['titulo'], 'contenido': b['contenido'], 'origen': 'ensenado', 'fuentes': []})
        for q in nube['preguntas']:
            if q['id'] == b.get('pregunta_id'): q['estado'] = 'ENSENADA'
        return ok({'ok': True, 'id': 50})
    if a == 'guardar_config':
        nube['config'] = {'datos': b['datos'], 'version': 1}
        return ok({'ok': True, 'version': 1})
    return ok({'error': 'acción desconocida'}, 400)

errores = []
with sync_playwright() as p:
    nav = p.chromium.launch()
    pg = nav.new_context(viewport={'width': 390, 'height': 850}).new_page()
    pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.route('**/functions/v1/paletizado', responder)
    pg.goto('http://localhost:5173/'); pg.wait_for_timeout(800)

    # 1. Un operador envía una sugerencia
    pg.click('[data-tab="sugerencias"]'); pg.wait_for_timeout(300)
    pg.fill('#formSug textarea[name=texto]', 'El aceite del pasillo 12 queda encima de los huevos'); pg.fill('#formSug input[name=nombre]', 'Operador 1')
    pg.click('#formSug button'); pg.wait_for_timeout(800)
    print('sugerencia en la nube:', len(nube['sugerencias']) == 1, '| se ve en Mis sugerencias:', 'aceite del pasillo 12' in pg.inner_text('main'))

    # 2. El agente no sabe algo → queda anotado
    pg.click('[data-tab="agente"]'); pg.wait_for_timeout(300)
    pg.fill('#pregunta', '¿A qué hora cierra el recibo de proveedores?'); pg.click('#formChat button'); pg.wait_for_timeout(600)
    print('pregunta anotada:', [q['texto'] for q in nube['preguntas']])

    # 3. Entrar como administrador con el código; no ve la sección de administradores
    pg.click('[data-tab="tareas"]'); pg.wait_for_timeout(300)
    print('campo contraseña oculto al inicio:', pg.locator('#campoClave').is_hidden())
    pg.fill('#formLogin input[name=usuario]', 'pru e-ba23-4567'.replace(' ', '')); pg.click('#formLogin button'); pg.wait_for_timeout(800)
    texto = pg.inner_text('main')
    print('entró como admin:', 'Carlos Prueba' in texto, '| no ve "Administradores":', 'Crear administrador' not in texto)
    pg.fill('#formLogin input[name=usuario]', 'x') if pg.locator('#formLogin').count() else None

    # 4. Responde la sugerencia y la convierte en lección
    pg.click('[data-tab="sugerencias"]'); pg.wait_for_timeout(800)
    f = pg.locator('form[data-sug]').first
    f.locator('select[name=estado]').select_option('APROBADA')
    f.locator('textarea[name=respuesta]').fill('Se pasa el aceite al inicio del pasillo 12 la próxima semana.')
    f.locator('button').first.click(); pg.wait_for_timeout(600)
    print('sugerencia respondida:', nube['sugerencias'][0]['estado'], '|', nube['sugerencias'][0]['respuesta'][:30])

    # 5. Enseña al agente la pregunta que no supo; el agente ya responde
    pg.click('[data-tab="agente"]'); pg.wait_for_timeout(800)
    fp = pg.locator('form[data-preg]').first
    fp.locator('textarea').fill('El recibo de proveedores cierra a las 4:00 p. m.; después solo con autorización del jefe.')
    fp.locator('button').first.click(); pg.wait_for_timeout(900)
    print('lección guardada:', len(nube['conocimiento']) == 1, '| pregunta marcada:', nube['preguntas'][0]['estado'])
    pg.fill('#pregunta', '¿a qué hora cierra el recibo?'); pg.click('#formChat button'); pg.wait_for_timeout(400)
    respuesta = pg.locator('#chat .msg').last.inner_text()
    print('agente aprendió:', '4:00 p. m.' in respuesta, '|', respuesta.replace(chr(10), ' ')[:120])

    # 6. Ajustes para todos
    pg.click('[data-tab="ajustes"]'); pg.wait_for_timeout(300)
    pg.fill('#aH', '1700'); pg.click('#ajustesTodos'); pg.wait_for_timeout(600)
    print('ajustes publicados:', (nube['config'] or {}).get('datos', {}).get('palet', {}).get('alturaMaxTotal'))

    # 7. Cerrar sesión: vuelve a pedir el código
    pg.click('[data-tab="tareas"]'); pg.wait_for_timeout(500)
    pg.click('#salirSesion'); pg.wait_for_timeout(300)
    print('salió:', pg.locator('#formLogin').count() == 1)
    print('errores:', errores)
    nav.close()

fallas = []
if len(nube['sugerencias']) != 1 or nube['sugerencias'][0]['estado'] != 'APROBADA': fallas.append('sugerencias')
if not nube['conocimiento']: fallas.append('ensenar')
if not nube['config']: fallas.append('config')
if errores: fallas.append('errores de página')
print('RESULTADO:', 'BIEN' if not fallas else 'FALLAS ' + ', '.join(fallas))
sys.exit(1 if fallas else 0)
