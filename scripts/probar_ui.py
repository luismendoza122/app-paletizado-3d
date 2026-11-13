# Prueba de la interfaz en Chrome (la corre GitHub Actions: .github/workflows/probar-ui.yml)
import json, random, os, sys
os.makedirs('salida', exist_ok=True)
from playwright.sync_api import sync_playwright
random.seed(1)
ubic=[]; arts=[]
for i in range(1,17):
    cod=f"12-{i:03d}x1" if i%2 else f"12-{i:03d}x2"
    a=dict(CODIGO=f"12-{(i+1)//2:03d}x{1 if i%2 else 2}", ARTICULO=f"ARTICULO {i}", CODIGO_ARTICULO=str(1000+i),
      LARGO_A_MM=str(random.choice([300,400,350])), ANCHO_B_MM=str(random.choice([200,250,300])), ALTO_H_MM=str(random.choice([150,200,250,300])),
      PESO_KG=str(random.choice([3,6,9,12,15])), EMPAQUE='CAJA', LIQUIDO='NO', DELICADO='SI' if i%7==0 else 'NO')
    ubic.append(a)
ped=[dict(PEDIDO='P1',TIENDA='T1',CODIGO_ARTICULO=str(1000+i),CAJAS=random.choice([2,4,6])) for i in range(1,17)]
stub = """window.__hojas=null; window.XLSX={utils:{book_new:()=>({S:{}}),json_to_sheet:(f)=>({'!ref':'A1:B'+f.length,f}),aoa_to_sheet:(a)=>({a}),
 book_append_sheet:(l,h,n)=>{l.S[n]=h.f?h.f.length:0}},write:(l)=>{window.__hojas=l.S;return new Uint8Array([80,75,3,4])}};"""
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader']); 
    ctx=b.new_context(viewport={'width':390,'height':850}, accept_downloads=True)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(f"localStorage.setItem('paletizado3d:ubicaciones', {json.dumps(json.dumps(ubic))}); localStorage.setItem('paletizado3d:pedidos', {json.dumps(json.dumps(ped))});")
    pg.goto('http://localhost:5173/'); pg.wait_for_timeout(1000)
    with pg.expect_download() as d: pg.click('#excelTodo')
    d.value.save_as(f'salida/{d.value.suggested_filename}'); print('excel:', d.value.suggested_filename)
    # Posiciones x3, y1-y3, z1-z3 en un módulo
    pg.click('[data-ir="tomar"]'); pg.wait_for_timeout(400)
    pg.locator('.pos', has_text='05-001x1').first.click(); pg.wait_for_timeout(300)
    pg.locator('summary', has_text='Agregar posiciones').click()
    pg.click('#agregarTodas'); pg.wait_for_timeout(400)
    cods = pg.evaluate("JSON.parse(localStorage.getItem('paletizado3d:ubicaciones')).map(f=>f.CODIGO).filter(c=>c.startsWith('05-001'))")
    print('modulo 05-001:', cods)
    assert '05-001z3' in cods and '05-001y2' in cods
    pg.locator('.pos', has_text='05-001y1').first.click(); pg.wait_for_timeout(300)
    print('formulario y1:', pg.locator('form').last.inner_text()[:50].replace(chr(10),' '))
    pg.click('#cerrarPos')
    pg.click('[data-tab="agente"]'); pg.wait_for_timeout(300)
    with pg.expect_download() as d: pg.click('#diagExcel')
    d.value.save_as(f'salida/{d.value.suggested_filename}'); print('diag:', d.value.suggested_filename)
    print('whatsapp:', pg.locator('a[href^="https://wa.me"]').first.get_attribute('href')[:90])
    # pedidos -> video
    pg.evaluate("document.querySelector('[data-tab=pedidos], [data-ir=pedidos]')?.click()")
    pg.wait_for_timeout(300)
    if not pg.locator('#pedidoSel').count():
        pg.locator('nav button, nav a', has_text='Pedidos').first.click(); pg.wait_for_timeout(300)
    pg.select_option('#pedidoSel','P1'); pg.wait_for_timeout(1500)
    print('boton video:', pg.locator('#grabarVideo').count())
    pg.click('#grabarVideo')
    for k in range(24):
        pg.wait_for_timeout(5000); print(k, pg.inner_text('#video')[:100].replace(chr(10),' '))
        if pg.locator('video.video-palet').count(): break
    print(pg.locator('#video .nota').last.inner_text())
    dur = pg.evaluate("new Promise(r=>{const v=document.querySelector('video.video-palet'); v.onloadedmetadata=()=>r(v.duration); setTimeout(()=>r(v.duration),3000)})")
    print('duracion meta:', dur)
    pg.evaluate("(()=>{const v=document.querySelector('video.video-palet'); v.currentTime=8})()"); pg.wait_for_timeout(800)
    pg.locator('video.video-palet').screenshot(path='salida/cuadro-video.png')
    with pg.expect_download() as d: pg.click('#guardarVideo')
    d.value.save_as(f'salida/{d.value.suggested_filename}'); print('video:', d.value.suggested_filename)
    pg.screenshot(path='salida/pedido.png', full_page=False)
    print('errores:', errs); b.close()
sys.exit(1 if errs else 0)
