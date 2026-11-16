# Prueba de la pestaña Calcular palet → "Armar palets de un pedido" (la corre GitHub Actions: probar-ui.yml).
# Necesita: npm start (http://localhost:5173). La nube se simula aquí mismo: no escribe nada en la nube real.
import json, os, sys, tempfile, time
os.makedirs('salida', exist_ok=True)
from playwright.sync_api import sync_playwright

fallas = []
def ok(c, t):
    print(('✓ ' if c else '✗ ') + t, flush=True)
    if not c: fallas.append(t)

# Artículos medidos: 3 de alimentos (pasillo 12) y 1 de no alimentos (pasillo 05)
def fila(cod, art, codart, l, a, h, peso, liquido='NO', delicado='NO'):
    return dict(CODIGO=cod, ARTICULO=art, CODIGO_ARTICULO=codart, LARGO_A_MM=str(l), ANCHO_B_MM=str(a), ALTO_H_MM=str(h), PESO_KG=str(peso),
                EMPAQUE='CAJA', LIQUIDO=liquido, DELICADO=delicado, ESTADO='COMPLETA')
ubic = [
    fila('12-001x1', 'ACEITE 3000ML', '7701001', 400, 300, 250, 18, liquido='SI'),
    fila('12-002x1', 'ARROZ 500G', '7701002', 400, 300, 250, 12),
    fila('12-004x1', 'GALLETAS SURTIDAS', '7701003', 400, 300, 200, 3, delicado='SI'),
    fila('05-001x1', 'DETERGENTE 1KG', '7709001', 400, 300, 250, 10),
]

def nube(route):
    b = json.loads(route.request.post_data or '{}')
    a = b.get('accion')
    r = {'ok': True}
    if a == 'quien': r = {'rol': 'ninguno', 'nombre': ''}
    elif a == 'conocimiento': r = {'conocimiento': []}
    elif a == 'config': r = {'config': None}
    elif a == 'posiciones': r = {'posiciones': [], 'version': 0}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(r))

errores = []
with sync_playwright() as p:
    nav = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = nav.new_context(viewport={'width': 390, 'height': 850}, accept_downloads=True)
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin='http://localhost:5173')
    ctx.route('**/functions/v1/paletizado', nube)
    ctx.route('https://m365.cloud.microsoft/**', lambda r: r.fulfill(status=200, content_type='text/html', body='<h1>Copilot de prueba</h1>'))
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.add_init_script(f"if (!sessionStorage.getItem('sembrado')) {{ localStorage.setItem('paletizado3d:ubicaciones', {json.dumps(json.dumps(ubic))}); sessionStorage.setItem('sembrado', '1'); }}")
    pg.goto('http://localhost:5173/'); pg.wait_for_timeout(1000)
    pg.click('[data-tab="calculadora"]'); pg.wait_for_timeout(400)
    ok('Armar palets de un pedido' in pg.inner_text('#contenido'), 'la pestaña tiene "Armar palets de un pedido"')

    # 1) Buscar y agregar un artículo
    pg.fill('#pBuscar', 'aceite'); pg.wait_for_timeout(200)
    ok(pg.locator('.sugerido').count() == 1, 'la búsqueda encuentra el aceite')
    pg.fill('[data-pnuevo="7701001"]', '40'); pg.click('[data-pagregar="7701001"]'); pg.wait_for_timeout(300)
    ok('40 cajas' in pg.inner_text('#armarPedido h3'), 'pedido con 40 cajas de aceite')

    # 2) Pegar una lista (como la que devuelve THEMENDO)
    pg.locator('#pPegarCaja summary').click()
    pg.fill('#pPegar', 'CODIGO;CAJAS\n7701002;40\n7701003 20\n9999999;5\n7701001;3 REVISAR')
    pg.click('#pAgregarLista'); pg.wait_for_timeout(300)
    h3 = pg.inner_text('#armarPedido h3')
    ok('3 artículos' in h3 and '100 cajas' in h3, f'la lista suma 100 cajas en 3 artículos ({h3})')
    avisos = pg.inner_text('#pAvisos')
    ok('9999999' in avisos and 'REVISAR' in avisos, 'avisa el código que no existe y el renglón para revisar')

    # 3) Cambiar una cantidad y quitar un artículo
    pg.fill('[data-pcajas="7701003"]', '20'); pg.dispatch_event('[data-pcajas="7701003"]', 'change'); pg.wait_for_timeout(200)

    # 4) Cargar un CSV con otro artículo (no alimentos)
    ruta = os.path.join(tempfile.gettempdir(), 'pedido-prueba.csv')
    open(ruta, 'w', encoding='utf-8').write('CODIGO;CANTIDAD\n7709001;10\n')
    pg.set_input_files('#pArchivo', ruta); pg.wait_for_timeout(500)
    ok('110 cajas' in pg.inner_text('#armarPedido h3'), 'el CSV agrega 10 cajas de detergente (110 en total)')

    # 5) Armar los palets
    pg.click('#pArmar'); pg.wait_for_timeout(1500)
    res = pg.inner_text('#resultadoArmado')
    palets = pg.locator('.palet-arm').count()
    ok(palets >= 3, f'arma {palets} palets (alimentos y no alimentos aparte)')
    ok('Sin alertas' in res, 'sin alertas de peso, altura ni delicados')
    zonas = [pg.locator('.palet-arm h3').nth(i).inner_text() for i in range(palets)]
    ok(any('no alimentos' in z for z in zonas) and any('Seco alimentos' in z for z in zonas), f'separa zonas: {zonas}')
    pesos = pg.evaluate("[...document.querySelectorAll('.palet-arm .nota b')].map(b => b.textContent)")
    print('palets:', pesos)
    primero = pg.locator('.palet-arm').first.locator('tr').nth(1).inner_text()
    ok('ACEITE' in primero, f'en el primer palet lo de abajo es el aceite (pesado): {primero[:40]}')
    ok('medidas 1.200 × 1.000 ×' in res, 'cada palet trae sus medidas')

    # 6) Datos para mover y Excel
    pg.click('#pMover'); pg.wait_for_timeout(1500)
    ok('Palet completo de cada artículo' in pg.inner_text('#pMoverRes'), 'datos para mover cada artículo')
    with pg.expect_download() as d: pg.click('#pExcel')
    d.value.save_as(f'salida/{d.value.suggested_filename}'); print('excel:', d.value.suggested_filename)
    ok(d.value.suggested_filename.startswith('armado-pedido'), 'descarga el Excel del armado')

    # 7) Ver en 3D
    pg.click('[data-ver3d="0"]'); pg.wait_for_timeout(1500)
    ok(pg.locator('#vistaArmado canvas').count() > 0, 'muestra el palet en 3D')

    # 8) Foto → THEMENDO: copia las instrucciones y abre Copilot
    with ctx.expect_page() as nueva:
        pg.click('#pFoto')
    copilot = nueva.value; copilot.wait_for_load_state()
    ok('m365.cloud.microsoft' in copilot.url, 'abre THEMENDO en Copilot')
    copilot.close()
    texto = pg.evaluate('navigator.clipboard.readText()')
    ok('CODIGO;CAJAS' in texto and 'No inventes' in texto, 'copia las instrucciones para THEMENDO')
    ok(pg.locator('#pPegarCaja').get_attribute('open') is not None, 'deja abierta la caja para pegar la respuesta')

    # 9) El agente responde sobre normas
    pg.click('[data-tab="agente"]'); pg.wait_for_timeout(300)
    pg.fill('#pregunta', '¿Cuánto peso puede levantar una persona según la norma?')
    pg.click('#formChat button'); pg.wait_for_timeout(600)
    ok('25 kg' in pg.inner_text('#chat'), 'el agente responde la Resolución 2400 (25 kg)')

    # 10) Lo armado queda guardado al volver
    pg.reload(); pg.wait_for_timeout(800); pg.click('[data-tab="calculadora"]'); pg.wait_for_timeout(300)
    ok('110 cajas' in pg.inner_text('#armarPedido h3'), 'el pedido sigue guardado al volver a abrir')
    pg.click('#pVaciar'); pg.wait_for_timeout(200); pg.click('.dialogo [data-r="1"]'); pg.wait_for_timeout(300)
    ok('El pedido está vacío' in pg.inner_text('#armarPedido'), 'vaciar pedido')

    ok(not errores, 'sin errores de JavaScript ' + ' | '.join(errores[:3]))
    nav.close()

if fallas:
    print(f'✗ {len(fallas)} fallaron'); sys.exit(1)
print('RESULTADO: BIEN')
