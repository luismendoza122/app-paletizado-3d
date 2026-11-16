# Agente de Paletizado 3D en Microsoft 365 Copilot

Agente solo para Paletizado 3D. No reemplaza a THEMENDO ni choca con él: tiene otro nombre, responde solo de Paletizado y manda lo demás a THEMENDO.

## Crearlo (5 minutos, con la cuenta de la empresa)
1. Abre https://m365.cloud.microsoft/chat → **Agentes** → **Crear agente** → pestaña **Configurar**.
2. **Nombre:** `Paletizado 3D – CEDI`
3. **Descripción:** `Ayuda a usar la app Paletizado 3D: toma de datos, reglas de arrume, reubicación, pedidos y la copia corporativa del PC.`
4. **Instrucciones:** copia todo el texto de `instrucciones-agente.txt`.
5. **Conocimiento:** sube `conocimiento-paletizado.md` (y, si quieres, `LEEME.txt` y `TI\FICHA-TI.md` de la copia).
6. **Búsqueda en la web:** apagada (así responde solo con lo del proyecto).
7. **Iniciadores de conversación:**
   - ¿Cómo tomo los datos de una posición?
   - ¿Qué significa BASE, MEDIO y TOPE?
   - La copia del PC no abre, ¿qué hago?
   - ¿Cómo agrego las posiciones x3, y1 y z1?
8. **Crear** → **Compartir** solo con las personas del CEDI que lo necesiten.

## Por qué no genera conflictos
- Nombre y alcance distintos a THEMENDO; no toca Recibo ni Inventario.
- No pide ni guarda claves, códigos ni datos personales.
- No da instrucciones para saltarse controles de TI.
- El conocimiento sale de la misma biblioteca de ayuda de la app (se arma solo con cada versión), así que dice lo mismo que la app.

## Actualizarlo
Cuando salga una versión nueva de la copia corporativa, vuelve a subir `conocimiento-paletizado.md` (reemplaza el anterior).
