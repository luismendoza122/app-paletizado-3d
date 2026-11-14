# Paletizado 3D en Azure – guía paso a paso

Qué se logra:
1. **La APK se compila en Azure DevOps**, con la llave de firma guardada como archivo seguro (no en el código).
2. **El diagnóstico con IA usa Azure OpenAI** (Microsoft Foundry) dentro de *tu* cuenta de Azure.

## ¿Por qué así quedan protegidos los datos?

| Riesgo | Cómo se cubre |
|---|---|
| Que la IA aprenda con datos del CEDI | Con los modelos de Azure OpenAI vendidos por Azure, Microsoft no usa tus preguntas ni respuestas para entrenar modelos y no las comparte con OpenAI ([Microsoft Learn – Datos, privacidad y seguridad](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)). |
| Que los datos viajen a cualquier país | El modelo se despliega como **Estándar** (regional) o **Data Zone**, **no Global**. Así se procesan en la región o la zona que elijas. |
| Que alguien saque la clave de la APK | La clave de Azure OpenAI vive solo en la **Función de Azure**. El celular guarda solo la dirección de la función y un código de acceso que se puede cambiar en cualquier momento. |
| Que salgan datos sensibles | La app envía solo un **resumen**: conteos, % de orden por pasillo, códigos de posición (ej. `12-001x1`) y clase BASE/MEDIO/TOPE. **No** envía nombres de artículos, códigos de artículo, pesos ni medidas. La función vuelve a filtrar y bota cualquier dato de más. |
| Que quede guardado | La función no guarda el resumen ni la respuesta. Microsoft hace un monitoreo de abuso; las empresas pueden pedir que se desactive (ver el mismo enlace). |

> **Copilot**: Microsoft 365 Copilot y Copilot Studio son para usar dentro de Teams, Word, etc. Para meter IA dentro de una app propia, la opción de Microsoft es **Azure OpenAI**. Usa los mismos modelos con las mismas garantías de privacidad empresarial.

> **Si la cuenta es de la empresa (Jerónimo Martins)**: antes de crear nada, pide a TI una suscripción o un grupo de recursos y su visto bueno. Esta guía sirve como documento para esa solicitud.

---

## Paso A. Crear el modelo de IA (Azure OpenAI)
1. Entra a **portal.azure.com** → busca **Microsoft Foundry** (o "Azure OpenAI") → **Crear**.
2. Grupo de recursos: `paletizado` (nuevo). Región: la que te recomiende TI (por ejemplo *East US 2*). Nombre: `paletizado-ia-luis`.
3. Cuando esté creado → **Ir a Foundry portal** → **Modelos** → **Implementar modelo**. Elige un modelo "mini" de los que aparezcan (más barato y suficiente para esto).
   - **Nombre de la implementación:** `diagnostico-paletizado`
   - **Tipo de implementación:** *Estándar* o *Data Zone Standard* (**no** *Global*).
4. En el recurso, abre **Claves y punto de conexión** y deja la página abierta. Vas a necesitar el **Punto de conexión** (`https://paletizado-ia-luis.openai.azure.com/`) y la **Clave 1**.
   **No pegues la clave en chats, correos ni en el código.**

## Paso B. Crear la Función de Azure (guarda la clave)
1. Portal → **Function App** → **Crear** → plan **Consumo flexible (Flex Consumption)**.
2. Nombre: `paletizado-ia-luis` (o el que esté libre). Pila: **Node.js 22**. Sistema operativo: Linux. La misma región del Paso A.
3. Ya creada → **Configuración → Variables de entorno** → agrega:

| Nombre | Valor |
|---|---|
| `AZURE_OPENAI_ENDPOINT` | el punto de conexión del Paso A |
| `AZURE_OPENAI_KEY` | la Clave 1 del Paso A (mejor aún: guárdala en un **Key Vault** y pon aquí la referencia) |
| `AZURE_OPENAI_DEPLOYMENT` | `diagnostico-paletizado` |
| `CORS_PERMITIDOS` | `https://localhost,capacitor://localhost` (agrega tu página de Vercel si la usas, separada por coma) |

4. **Guardar**. El código de la función se sube en el Paso C (pipeline 2).

## Paso C. Azure DevOps (compila la APK y publica la función)
1. Entra a **dev.azure.com** con la misma cuenta → crea una organización y un proyecto `Paletizado3D`.
2. **Pipelines → New pipeline → GitHub** → elige `luismendoza122/app-paletizado-3d` → *Existing Azure Pipelines YAML file*.

**Pipeline 1 – APK** (`/azure-pipelines.yml`, en una máquina Windows de Microsoft):
1. Elige `/azure-pipelines.yml` → **Run**. La APK queda en la ejecución → **Artifacts → paletizado-3d-apk**.
2. Firma fija (para que la APK se instale encima de la que ya tienes):
   - **Pipelines → Library → Secure files → + Secure file** → sube `paletizado.keystore`.
   - En el pipeline → **Edit → Variables** → crea `FIRMA_CLAVE` (marca **Keep this value secret**).
   - En `azure-pipelines.yml` cambia `usarFirma: false` por `usarFirma: true`.
   - La primera vez, Azure pide **Permit** para usar el archivo seguro. Acéptalo.

**Pipeline 2 – Función de IA** (`/azure/funcion-pipeline.yml`):
1. **Project settings → Service connections → New → Azure Resource Manager** → nombre `azure-paletizado` → tu suscripción y el grupo `paletizado`.
2. **New pipeline** → mismo repositorio → `/azure/funcion-pipeline.yml`.
3. **Variables** → `FUNCION_APP` = el nombre de la Function App del Paso B → **Run**.

> Organizaciones nuevas de Azure DevOps: Microsoft puede pedir un formulario para dar los minutos gratis de compilación en sus servidores. Si sale el error "No hosted parallelism", llena el formulario que indica el mensaje y espera la aprobación.

## Paso D. Conectar la app
1. Portal → tu Function App → **Funciones → diagnostico → Claves de función** → copia la clave **default**.
2. En **Información general** copia la dirección. La de la función es `https://<dirección>/api/diagnostico`.
3. En el celular: **Paletizado 3D → Ajustes → IA de diagnóstico (Azure)** → pega la dirección y el código → **Guardar IA**.
4. Ve a **Agente → Pedir diagnóstico a la IA**.

Si un celular se pierde: en la Function App **renueva la clave de la función**. El celular perdido queda sin acceso, y pegas la nueva clave en los demás.

## Costos
Azure OpenAI y Functions cobran por uso. Un diagnóstico es una consulta corta. Igual crea una **alerta de presupuesto** en *Cost Management → Presupuestos* (por ejemplo, aviso al 50 % y al 90 %).

## Probar la función en tu PC (opcional, PowerShell)
```powershell
cd azure\diagnostico-ia
copy local.settings.example.json local.settings.json   # pon tus valores; este archivo NO se sube a git
npm install
npm start          # requiere Azure Functions Core Tools
```
