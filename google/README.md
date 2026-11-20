# Nube de Seguimiento de Recibo en Google

Reemplaza la función `recibo` de Supabase (que está bloqueada por cuota de
salida) con una **hoja de cálculo + Apps Script**. No hay cuota de salida: los
datos viven en una hoja y las fotos en Google Drive.

## Lo que cambia y lo que no

| | Antes (Supabase) | Ahora (Google) |
|---|---|---|
| Datos | Postgres | Hoja de cálculo `Recibo - nube` |
| Fotos | base64 dentro de la base | archivos en Drive (`fotos de evidencia`) |
| Luis entra con | correo y contraseña de Supabase | correo y clave que se guardan como hash |
| Equipos entran con | código general o personal | igual |
| El código de la página | `entorno.js` | el mismo archivo, con una línea cambiada |
| Tiempo real | 6 segundos | 20 segundos (Google no permite más) |

La página **no cambia de lógica**: `entorno.js` ya separa la nube del resto.
Solo se cambia el transporte.

## Paso a paso

### 1. La hoja

1. En Google Drive crea una hoja de cálculo llamada **Recibo - nube**.
2. Copia el ID de la dirección: en
   `https://docs.google.com/spreadsheets/d/`**`ESTE_ES_EL_ID`**`/edit`.

### 2. El script

1. Entra a <https://script.new> con la cuenta dueña de la carpeta
   *Seguimiento de Recibo* (la misma de Drive).
2. Borra lo que venga y pega todo el contenido de `google/Codigo.gs`.
3. Arriba, en `const ID_HOJA = '...'`, pon el ID del paso 1.
4. Guarda.

### 3. Preparar la nube (una sola vez)

En el editor de Apps Script, elige la función y dale Ejecutar:

1. `inicializar()` → crea las hojas `docs`, `equipo`, `miembros`, `sesiones` y `meta`.
2. `configurar('tu-correo@gmail.com', 'una-clave-larga')` → deja la clave de Luis
   guardada como hash + sal (la clave no queda escrita en el código).
3. Autoriza los permisos cuando Google los pida (hojas y Drive).

### 4. Publicar

1. **Implementar → Nueva implementación → Aplicación web**.
2. *Ejecutar como*: **Yo**.
3. *Quién tiene acceso*: **Cualquier persona**.
4. Copia la dirección `https://script.google.com/macros/s/.../exec`.

Esa dirección es la nube. No la compartas fuera del equipo: sin el código o la
sesión de Luis no entrega nada, pero es la puerta de entrada.

### 5. Conectar la página

En `www/recibo/entorno.js`, primera línea de configuración:

```js
const NUBE_GOOGLE = 'https://script.google.com/macros/s/.../exec';
```

Vacía = sigue con Supabase (así se puede volver atrás en un minuto).
Con la dirección = usa Google para todo: datos, fotos y Drive.

### 6. Pasar los datos que ya existen (opcional)

Los datos de Supabase siguen ahí. Para traerlos:

1. Exporta desde el panel de Supabase con `docs/EXPORTAR-EN-PANEL.sql`
   (funciona aunque la API responda 402).
2. Convierte los CSV a JSON:

   ```powershell
   node scripts/desde-csv-panel.mjs
   ```

3. Sube el `respaldo/recibo-panel-*.json` a la carpeta **Seguimiento de Recibo**
   de Drive y renómbralo **`recibo-importar.json`**.
   Si pesa más de 40 MB, pártelo antes con `node google/partir-respaldo.mjs`.
4. En Apps Script ejecuta `importarDesdeDrive()`.

Se puede repetir: actualiza lo que ya está y no duplica. Las fotos que vengan
en base64 se convierten en archivos de Drive y en la hoja queda solo la
referencia.

### 7. Probar

1. Abre la página.
2. Ajustes → **Nube del equipo** → escribe el código o inicia sesión.
3. Guarda una planilla en un equipo y mira que aparezca en otro en menos de
   30 segundos.
4. Toma una foto: debe quedar en Drive, dentro de `fotos de evidencia`.

## Cuotas de Google (plan gratuito)

| Límite | Valor | Qué significa |
|---|---|---|
| Ejecución por llamada | 6 minutos | ninguna operación tuya se acerca |
| Llamadas por día | ~20.000 | con 5 equipos y sondeo de 20 s: ~21.000… por eso el sondeo pregunta primero un número (`ping`) y solo baja datos si cambió |
| Disparadores | 90 min/día | no se usan |
| Hoja de cálculo | 10 millones de celdas | de sobra |

Si algún día el equipo crece, el ajuste es subir `CADA_MS` a 30 o 60 segundos.

## Respaldos

- `respaldar()` en Apps Script: deja un `respaldo-recibo-AAAAMMDD-HHMM.json`
  en la carpeta *Seguimiento de Recibo*.
- La hoja se puede descargar como Excel cuando quieras.
- Las fotos están en Drive, con su historial de versiones.

## Seguridad

- Las fotos y los respaldos viven en una carpeta de Drive que solo ve la cuenta
  dueña (el script entra como ella).
- La página no tiene llaves: el código de equipo y la sesión de Luis se validan
  en el servidor.
- Las sesiones vencen a los 30 días y se pueden cerrar todas volviendo a correr
  `configurar(...)`.

## Si algo falla

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| "Sin acceso: inicia sesión o escribe el código" | el código cambió o se quitó la persona | pedir invitación nueva |
| "Falta configurar la clave de Luis" | no se corrió `configurar(...)` | correrlo |
| "La nube está ocupada" | dos guardados al mismo tiempo | reintentar; el candado espera 20 s |
| "Documento demasiado grande" | planilla de más de 360.000 caracteres | dividirla en dos |
| Las fotos no aparecen | `NUBE_GOOGLE` vacío, o el archivo se borró de Drive | revisar la constante y la carpeta |
