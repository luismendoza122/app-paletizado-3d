# Instrucciones para GitHub Copilot – Paletizado 3D (CEDI ATS R10 Valledupar)

## Qué es
App móvil (web + APK de Android con Capacitor) para tomar los datos de cada posición de picking del CEDI, calcular la clase de arrume de cada artículo (BASE / MEDIO / TOPE), proponer la reubicación dentro de cada pasillo y probarla con pedidos reales en 3D y en video.

El dueño (Luis) trabaja en **Windows**, está aprendiendo Node.js y prefiere explicaciones en **español claro, paso a paso**.

## Reglas de trabajo
1. **Todo en español**: nombres de variables y funciones (`tipoEstiba`, `ubicacion`, `posiciones`), textos de la interfaz y comentarios breves.
2. **Sin frameworks ni compilador**: HTML, CSS y JavaScript en módulos ES (`www/`). Las bibliotecas (Three.js, SheetJS) se copian a `www/vendor` con `npm run build` y se cargan con `importmap`.
3. **Móvil primero**: se usa en bodega, con guantes y poca señal. Botones de mínimo 48 px, pocos campos y funcionamiento sin conexión (los cambios quedan pendientes y se envían al volver la señal).
4. **Medidas** siempre guardadas en milímetros y peso en kg. El formulario acepta mm, cm o m y convierte.
5. **Reglas del negocio** (ver `docs/conocimiento-del-negocio.md`) mandan sobre cualquier preferencia técnica:
   - Cada módulo tiene x1 y x2 fijas; se pueden agregar x3, y1–y3, z1–z3 y solo esas se pueden borrar.
   - Las posiciones vacías o agregadas sin llenar no cuentan en el avance.
   - "NO APLICA" es un valor válido: deja la posición completa, pero sin medidas o peso el artículo no entra al cálculo.
   - Alimentos (12–19) y no alimentos (05–11) nunca van en el mismo palet.
   - La app propone; no ejecuta. Los cambios en el WPMS los hace el CEDI.
6. **No borrar datos en la nube**: se marcan (`ESTADO: 'BORRADA'`) y el historial se conserva.
7. **Comandos para PowerShell**: usa `npm run ...`; nada de scripts de bash para el usuario final.
8. Al terminar un cambio: `npm test` y un resumen de 3 a 5 líneas.

## Seguridad (obligatorio)
- Todo texto que venga del usuario, de Excel o de la nube se inserta con la función `esc()` antes de usar `innerHTML`.
- Nunca poner claves en el código. La app solo lleva la URL de Supabase y la llave **publicable**; la llave de servicio vive en la función `supabase/functions/paletizado`.
- Las tablas `paletizado_*` tienen RLS activo **sin políticas**: no agregar políticas para `anon`.
- Toda acción nueva de la función valida y recorta sus datos (ver `limpiarDatos`) y revisa permisos (`esLuis` o el token de la tarea).
- La llave de firma de la APK (`*.keystore`) nunca va al repositorio; se pasa con `FIRMA_ARCHIVO` y `FIRMA_CLAVE`.
- Revisa `SEGURIDAD.md` antes de tocar la nube, las tareas por enlace o la firma.

## Estructura
- `www/js/motor/` cálculo puro (sin DOM): artículo, índice de arrume, palet de un artículo, armado en orden de ruta, reubicación, simulación.
- `www/js/datos/` layout del CEDI, importar Excel/CSV, guardado local y nube.
- `www/js/app.js` pantallas y eventos; `visor.js` 3D y video; `exportar.js` Excel; `agente.js` + `biblioteca.js` agente sin internet.
- `supabase/` función y tablas. `test/` pruebas con `node --test`. `scripts/` preparar, servidor local, firma y compilación de la APK.

## Comandos (PowerShell)
```powershell
npm install        # bibliotecas
npm test           # pruebas
npm run build      # copia Three.js y SheetJS a www/vendor
npm start          # http://localhost:5173
npm run apk        # compila la APK en salida\paletizado-3d.apk
```

## Pruebas
- Toda función nueva del motor o de datos lleva prueba en `test/`.
- Las pruebas no usan el DOM: la lógica va en módulos puros y `app.js` solo la conecta.
