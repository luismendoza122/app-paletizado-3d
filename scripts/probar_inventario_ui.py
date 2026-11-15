# Prueba de las pantallas del inventario de estibas en Chrome (Playwright).
# Sirve para la práctica en el PC y para la nube real:
#   PAGINA=http://localhost:3100/inventario/ NUBE=http://localhost:3100 CODIGO=XXXX-XXXX-XXXX PROPIETARIO=token python scripts/probar_inventario_ui.py
#   PAGINA=https://luismendoza122.github.io/app-paletizado-3d/inventario/ CODIGO=XXXX-XXXX-XXXX python scripts/probar_inventario_ui.py
# Crea un inventario de prueba, agrega personas, cuenta desde "otro celular", pregunta a Aura y al final lo borra.
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

PAGINA = os.environ["PAGINA"].rstrip("/") + "/"
NUBE = os.environ.get("NUBE", "")
CODIGO = os.environ["CODIGO"]
PROPIETARIO = os.environ.get("PROPIETARIO", "")
extra = f"?nube={NUBE}" if NUBE else ""
fallas = []
errores = []

def ok(cond, texto):
    print(("✓ " if cond else "✗ ") + texto, flush=True)
    if not cond:
        fallas.append(texto)

def esperar(cond, segundos=20):
    fin = time.time() + segundos
    while time.time() < fin:
        try:
            if cond():
                return True
        except Exception:
            pass
        time.sleep(0.3)
    return False

with sync_playwright() as p:
    nav = p.chromium.launch()
    movil = dict(viewport={"width": 412, "height": 900}, is_mobile=True, has_touch=True, locale="es-CO")

    # ---------- Administrador con código ----------
    ctx = nav.new_context(**movil)
    pg = ctx.new_page()
    pg.on("dialog", lambda d: d.accept())
    pg.on("pageerror", lambda e: errores.append(f"admin: {e}"))
    pg.on("console", lambda m: m.type == "error" and not re.search(r"Failed to load resource|favicon", m.text) and errores.append(f"admin consola: {m.text}"))
    pg.goto(PAGINA + extra)
    pg.wait_for_selector("#v-login:not([hidden])")
    ok(pg.locator("#campo-pass").is_hidden(), "ingreso: solo pide el código (la contraseña está oculta)")
    pg.fill("#clave", "correo@ejemplo.com")
    ok(pg.locator("#campo-pass").is_visible(), "si se escribe un correo aparece la contraseña")
    pg.fill("#clave", "AAAA-BBBB-CCCC")
    pg.click("#form-login button[type=submit]")
    ok(esperar(lambda: "no válido" in pg.inner_text("#aviso")), "un código inventado no entra")
    pg.fill("#clave", CODIGO)
    pg.click("#form-login button[type=submit]")
    ok(esperar(lambda: pg.locator("#v-app").is_visible()), "con el código entra al panel")
    ok(pg.locator("#pest-admins").is_hidden(), "un administrador no ve la pestaña Administradores")

    # Nuevo inventario
    nombre = f"PRUEBA PANTALLAS {time.strftime('%H%M%S')}"
    time.sleep(1)
    if pg.locator("#dlg-inventario[open]").count() == 0:
        pg.click("#btn-nuevo-inv")
    pg.fill("#ni-nombre", nombre)
    pg.fill("#ni-fecha", time.strftime("%Y-%m-%d"))
    pg.click("#form-inventario button[value=ok]")
    ok(esperar(lambda: nombre in pg.inner_text("#sel-inventario")), "crea el inventario de prueba")

    # Persona con el pasillo LA52
    pg.click(".pestanas button[data-v=personas]")
    pg.fill("#p-nombre", "Prueba Pantalla")
    pg.locator("#p-pasillos label", has_text="LA52").first.click()
    pg.click("#form-persona button[type=submit]")
    ok(esperar(lambda: pg.locator("#dlg-enlace[open]").count() == 1), "al agregar la persona sale su enlace")
    enlace = pg.input_value("#en-url")
    ok("contar.html?t=" in enlace, f"enlace del operador: {enlace[:70]}…")
    pg.click("#en-cerrar")
    pg.click(".pestanas button[data-v=tablero]")
    pg.locator("#franja-estado button", has_text="Iniciar inventario").click()
    ok(esperar(lambda: "En curso" in pg.inner_text("#franja-estado")), "inicia el inventario")

    # ---------- Operador en otro celular ----------
    ctx2 = nav.new_context(**movil)
    op = ctx2.new_page()
    op.on("dialog", lambda d: d.accept())
    op.on("pageerror", lambda e: errores.append(f"operador: {e}"))
    op.goto(enlace)
    ok(esperar(lambda: op.locator("#p-bienvenida").is_visible() or op.locator("#p-lista").is_visible()), "el operador abre su enlace")
    if op.locator("#btn-comenzar").is_visible():
        op.click("#btn-comenzar")
    ok(esperar(lambda: op.locator("#p-lista").is_visible() and "LA52" in op.inner_text("#p-lista")), "ve su pasillo LA52")
    op.locator("#p-lista .asig", has_text="LA52").first.click()
    ok(esperar(lambda: op.locator("#p-planilla").is_visible()), "abre la planilla")
    casilla = op.locator("#p-planilla input").first
    casilla.fill("3+2")
    casilla.press("Tab")
    token = enlace.split("t=")[1].split("&")[0]
    ok(esperar(lambda: op.inner_text("#estado-guardado") == "Guardado ✓" and op.evaluate(f"Object.values(JSON.parse(localStorage.getItem('pendientes-{token}') || '{{}}')).every((x) => !Object.keys(x).length)"), 25), "lo que escribe se guarda en la nube")
    # El mismo enlace en un tercer celular queda bloqueado
    ctx3 = nav.new_context(**movil)
    otro = ctx3.new_page()
    otro.goto(enlace)
    ok(esperar(lambda: re.search(r"otro celular|amarrado|ya se abri", otro.inner_text("body"), re.I) is not None), "el enlace no abre en un tercer celular")

    # ---------- Aura con Copilot ----------
    pg.click(".pestanas button[data-v=aura]")
    ok(esperar(lambda: "Copilot" in pg.inner_text("#aura-estado")), "Aura dice que trabaja con Copilot")
    pg.fill("#aura-texto", "¿Cómo va el inventario?")
    pg.click("#aura-enviar")
    ok(esperar(lambda: "Inventario abierto" in pg.inner_text("#aura-mensajes")), "Aura contesta al instante cómo va")
    pg.fill("#aura-texto", "cuál es el horario del montacargas eléctrico nocturno")
    pg.click("#aura-enviar")
    ok(esperar(lambda: pg.locator("#aura-mensajes button", has_text="Preguntar a THEMENDO en Copilot").count() > 0), "lo que no sabe ofrece preguntar a THEMENDO en Copilot")
    pg.locator(".copilot-caja textarea").last.fill("El montacargas eléctrico nocturno trabaja de 10 pm a 6 am (respuesta de prueba).")
    pg.locator(".copilot-caja button", has_text="Guardar la respuesta").last.click()
    ok(esperar(lambda: "Respuesta de Copilot guardada" in pg.inner_text("#aura-mensajes")), "la respuesta de Copilot queda guardada")
    pg.click("#vig-revisar")
    ok(esperar(lambda: pg.locator("#vig-agentes .vig-agente").count() >= 2), "los agentes vigilantes revisan")

    # Limpieza: borrar la respuesta de prueba, cerrar y borrar el inventario
    pg.locator("#aura-resp-cuenta").click()
    for li in pg.locator("#aura-respuestas li").all():
        if "montacargas" in li.inner_text():
            li.locator("button").click()
            break
    pg.click(".pestanas button[data-v=tablero]")
    pg.locator("#franja-estado button", has_text="Cerrar inventario").click()
    esperar(lambda: "Cerrado" in pg.inner_text("#franja-estado"))
    pg.click("#btn-editar-inv")
    pg.fill("#ei-confirmar", nombre)
    pg.click("#ei-borrar")
    ok(esperar(lambda: nombre not in pg.inner_text("#sel-inventario")), "borra el inventario de prueba (queda copia en la nube)")

    # ---------- Cuenta principal ----------
    if PROPIETARIO:
        ctx4 = nav.new_context(**movil)
        ctx4.add_init_script(f"localStorage.setItem('inv-sesion', JSON.stringify({{ token: {json.dumps(PROPIETARIO)}, refresh: 'x', vence: Date.now() + 36e5 }}))")
        du = ctx4.new_page()
        du.on("dialog", lambda d: d.accept())
        du.on("pageerror", lambda e: errores.append(f"propietario: {e}"))
        du.goto(PAGINA + extra)
        ok(esperar(lambda: du.locator("#pest-admins").is_visible()), "la cuenta principal ve la pestaña Administradores")
        time.sleep(1)
        if du.locator("#dlg-inventario[open]").count():
            du.click("#ni-cancelar")
        du.click("#pest-admins")
        du.fill("#ad-nombre", "Admin de prueba")
        du.fill("#ad-dias", "7")
        du.click("#form-admin button[type=submit]")
        ok(esperar(lambda: re.search(r"[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}", du.inner_text("#ad-nuevo")) is not None), "crea un código de administrador y lo muestra una vez")
        ok(esperar(lambda: "Sin usar" in du.inner_text("#ad-lista")), "en la lista sale 'Sin usar' y la fecha de vencimiento")
        fila = du.locator("#ad-lista tr", has_text="Admin de prueba").first
        fila.locator("button", has_text="Quitar").click()
        ok(esperar(lambda: "Admin de prueba" not in du.inner_text("#ad-lista")), "quita al administrador de prueba")

    nav.close()

ok(not errores, "sin errores de JavaScript" + ("" if not errores else ": " + " | ".join(errores[:5])))
print(f"\n{'✗ ' + str(len(fallas)) + ' revisión(es) fallaron' if fallas else '✓ Todo bien'}")
sys.exit(1 if fallas else 0)
