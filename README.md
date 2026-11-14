# Paletizado 3D – CEDI ATS R10 Valledupar

App para **ubicar cada producto en el pasillo correcto** y que, al recorrer la ruta de picking, el palet salga bien armado: pesado abajo, delicado arriba. Calcula y muestra los palets en 3D.

- **Web:** se publica en Vercel.
- **Página web:** https://luismendoza122.github.io/app-paletizado-3d/ (GitHub Pages; se publica sola con cada cambio en `main`).
- **Entorno THEMENDO:** https://luismendoza122.github.io/app-paletizado-3d/themendo/ — artefactos, habilidades y fuentes del agente THEMENDO en Microsoft 365 Copilot.
- **Seguimiento de Recibo:** https://luismendoza122.github.io/app-paletizado-3d/recibo/ — planillas de conferencias de recibo con nube del equipo (función `recibo` de Supabase).
- **APK de Android:** se compila sola en GitHub cada vez que se sube un cambio a `main`.
  Descarga: `https://github.com/luismendoza122/app-paletizado-3d/releases/latest/download/paletizado-3d.apk`

## Qué hace (versión 0.2)
| Pantalla | Para qué |
|---|---|
| Inicio | Avance por zona, cargar la hoja "Ubicaciones CEDI" o pedidos (.xlsx / CSV), descargar la APK |
| Tomar datos | Las 1.748 posiciones del CEDI ya cargadas. Por posición: artículo, código, A×B×H, peso, caja/bulto, líquido, delicado; marcar vacía; dividir en A y B. Si el código ya se tomó, autocompleta. Copiar los datos para la hoja |
| Agente | Diagnóstico, siguiente paso, mejoras por pasillo, movimientos prioritarios y preguntas (sin internet) |
| Ubicaciones | Cada posición con su artículo, clase BASE / MEDIO / TOPE y datos que faltan |
| Reubicar | Propone el nuevo orden dentro de cada pasillo (BASE → MEDIO → TOPE), sin cambiar de zona. Exporta el plan de movimientos |
| Pedidos | Arma cada pedido real en el orden de la ruta (1 o 2 estibas) con la ubicación actual y con la propuesta, y compara |
| Calcular palet | Palet de un solo artículo: cajas por capa × capas, altura, peso y vista 3D |
| Ajustes | Medidas del palet y reglas del CEDI (altura y peso máximos) |

Datos por posición: artículo, código, largo A × ancho B × alto H (mm), peso (kg), caja o bulto, líquido, delicado. **Las posiciones vacías no cuentan.**

## Probar en tu PC (Windows, PowerShell)
```powershell
cd app-paletizado-3d
npm install
npm run build
npm test
npm start
```
Abre http://localhost:5173

## Publicar en Vercel (una sola vez)
1. Entra a vercel.com con tu cuenta de GitHub → **Add New… → Project**.
2. Elige el repositorio **app-paletizado-3d** → **Import**.
3. No cambies nada (el archivo `vercel.json` ya dice cómo construirla) → **Deploy**.
4. Cada cambio que se suba a `main` se publica solo.

## La APK
- La compila GitHub Actions (`.github/workflows/apk.yml`) y la deja en **Releases** con el nombre `paletizado-3d.apk`.
- Si el repositorio es **privado**, el enlace de descarga solo funciona con tu sesión de GitHub abierta. Para que cualquier compañero la baje desde la página de Vercel, deja el repositorio **público** (no tiene claves ni datos del CEDI: los datos se cargan en cada equipo).
- Es una APK de prueba (debug). Para publicarla en Play Store hace falta firmarla.

## Estructura
```
www/                 app (HTML, CSS, JS sin frameworks)
  recibo/            Seguimiento de Recibo (index.html + entorno.js: nube del equipo y descargas)
  themendo/          página del Entorno THEMENDO
  js/motor/          cálculo: artículo, índice de arrume, palet de un artículo, orden de ruta, reubicación, simulación
  js/datos/          lectura de Excel/CSV y guardado en el equipo
  js/visor.js        3D (Three.js) y vista por capas
supabase/functions/  paletizado (posiciones y tareas) y recibo (planillas, artículos, ajustes y fotos)
scripts/             preparar.js (copia Three.js y SheetJS a www/vendor) y servidor local
test/                pruebas del motor (npm test)
```

## Reglas que usa
- Índice de arrume = 45 % peso + 30 % resistencia + 15 % densidad + 10 % alto. Bulto y líquido suben; delicado siempre TOPE.
- Líquido siempre de pie; bulto se puede acostar.
- Alimentos (pasillos 12–19) y no alimentos (05–11) nunca van en el mismo palet.
- Un delicado sin dato propio aguanta encima hasta 2 veces su peso (ajustable en el código: `delicadoCajasEncima`).
- Las medidas del palet en Ajustes vienen de ejemplo hasta que se confirmen con el CEDI.
