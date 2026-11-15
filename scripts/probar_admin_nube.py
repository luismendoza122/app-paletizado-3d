# Prueba la función "paletizado" en la nube real con un administrador de prueba.
# Uso (lo corre .github/workflows/probar-admin-nube.yml): CODIGO=XXXX-XXXX-XXXX python scripts/probar_admin_nube.py
# No cambia los ajustes de todos ni posiciones; lo que crea queda descartado u olvidado.
import json, os, sys, urllib.request, urllib.error

F = 'https://nfrqrboqxcpgsagnmwqq.supabase.co/functions/v1/paletizado'
K = 'sb_publishable_73XleY68KOLPlGw_DrlQsA__IQzwPB8'
CODIGO = os.environ['CODIGO']
DISP = 'prueba-ci-admin-0001'
fallas = []

def llamar(accion, datos=None, admin=None):
    cuerpo = json.dumps({'accion': accion, 'dispositivo': DISP, **(datos or {})}).encode()
    h = {'Content-Type': 'application/json', 'apikey': K}
    if admin: h['x-admin'] = admin
    try:
        with urllib.request.urlopen(urllib.request.Request(F, cuerpo, h), timeout=30) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')

def revisar(nombre, condicion, detalle=''):
    print(('BIEN ' if condicion else 'FALLA'), nombre, detalle)
    if not condicion: fallas.append(nombre)

s, r = llamar('quien', admin=CODIGO); revisar('quien con código', s == 200 and r.get('rol') == 'admin', r)
s, r = llamar('quien', admin='ZZZZ-ZZZZ-ZZZZ'); revisar('código falso', r.get('rol') == 'ninguno', r)
s, r = llamar('admins', admin=CODIGO); revisar('admin no ve administradores', s == 400, r)
s, r = llamar('invitar_admin', {'nombre': 'X'}, admin=CODIGO); revisar('admin no crea administradores', s == 400, r)
s, r = llamar('sugerencias'); revisar('sin código no ve sugerencias', s == 401, r)
s, r = llamar('usuarios', admin=CODIGO); revisar('admin ve usuarios', s == 200 and 'total' in r, {k: r.get(k) for k in ('total', 'apk', 'web')})
s, r = llamar('tareas', admin=CODIGO); revisar('admin ve tareas', s == 200 and 'tareas' in r)

s, r = llamar('sugerir', {'texto': '[PRUEBA AUTOMÁTICA] revisar la app', 'categoria': 'Otro', 'nombre': 'Prueba'}); sid = r.get('id')
revisar('sugerir (público)', s == 200 and sid, r)
s, r = llamar('sugerencias', {'estado': 'NUEVA'}, admin=CODIGO); revisar('admin ve la sugerencia', any(x['id'] == sid for x in r.get('sugerencias', [])))
s, r = llamar('responder_sugerencia', {'id': sid, 'estado': 'DESCARTADA', 'respuesta': '[PRUEBA] respondida'}, admin=CODIGO); revisar('responder', s == 200, r)
s, r = llamar('mis_sugerencias'); x = next((x for x in r.get('sugerencias', []) if x['id'] == sid), {})
revisar('el que sugirió ve la respuesta', x.get('estado') == 'DESCARTADA' and 'respondida' in (x.get('respuesta') or ''), x)

q = 'Pregunta de prueba automática número 7731 sobre el recibo'
llamar('pregunta', {'texto': q}); llamar('pregunta', {'texto': q + '?'})
s, r = llamar('preguntas', admin=CODIGO); pq = next((p for p in r.get('preguntas', []) if '7731' in p['texto']), None)
revisar('pregunta anotada y contada', pq is not None and pq['veces'] >= 2, pq)
s, r = llamar('ensenar', {'titulo': q, 'contenido': '[PRUEBA] respuesta de prueba automática', 'pregunta_id': pq and pq['id']}, admin=CODIGO); lid = r.get('id')
revisar('enseñar', s == 200 and lid, r)
s, r = llamar('conocimiento', {'limite': 200}); k = next((k for k in r.get('conocimiento', []) if k['id'] == lid), None)
revisar('la lección llega a todos', k is not None and k.get('origen') == 'ensenado', k and k['titulo'])
s, r = llamar('preguntas', admin=CODIGO); revisar('pregunta ya no está pendiente', not any('7731' in p['texto'] for p in r.get('preguntas', [])))
s, r = llamar('olvidar', {'id': lid}, admin=CODIGO); revisar('olvidar', s == 200)
s, r = llamar('conocimiento', {'limite': 200}); revisar('lección olvidada no llega', not any(k['id'] == lid for k in r.get('conocimiento', [])))

s, r = llamar('guardar_config', {'datos': {'palet': {'largo': 'x'}}}, admin=CODIGO); revisar('ajustes inválidos rechazados', s == 400, r)
s, r = llamar('config'); revisar('leer ajustes (público)', s == 200 and 'config' in r, r)

print('RESULTADO:', 'BIEN' if not fallas else 'FALLAS: ' + ', '.join(fallas))
sys.exit(1 if fallas else 0)
