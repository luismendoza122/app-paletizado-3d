// Función de Azure: recibe el resumen de la app y pide el diagnóstico a Azure OpenAI.
// Seguridad:
//  - authLevel 'function': sin el código de acceso (x-functions-key) responde 401.
//  - La clave de Azure OpenAI está en la configuración de la Function App (o en Key Vault), nunca en la APK.
//  - No se guarda nada: ni el resumen ni la respuesta quedan en registros (solo tamaños y errores).
import { app } from '@azure/functions';
import { limpiarResumen, llamarAzureOpenAI, encabezadosCors, LIMITE_BYTES } from '../logica.js';

app.http('diagnostico', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'function',
  handler: async (request, context) => {
    const cors = encabezadosCors(request.headers.get('origin'), process.env.CORS_PERMITIDOS);
    if (request.method === 'OPTIONS') return { status: 204, headers: cors };

    const texto = await request.text();
    if (texto.length > LIMITE_BYTES) return { status: 413, headers: cors, jsonBody: { error: 'Resumen demasiado grande.' } };
    let entrada;
    try { entrada = JSON.parse(texto); } catch { return { status: 400, headers: cors, jsonBody: { error: 'JSON inválido.' } }; }

    const limpio = limpiarResumen(entrada);
    if (!limpio.ok) return { status: 400, headers: cors, jsonBody: { error: limpio.error } };

    const config = { endpoint: process.env.AZURE_OPENAI_ENDPOINT, clave: process.env.AZURE_OPENAI_KEY, despliegue: process.env.AZURE_OPENAI_DEPLOYMENT };
    if (!config.endpoint || !config.clave || !config.despliegue) {
      context.error('Faltan AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY o AZURE_OPENAI_DEPLOYMENT en la configuración.');
      return { status: 500, headers: cors, jsonBody: { error: 'La función no está configurada todavía.' } };
    }
    try {
      const r = await llamarAzureOpenAI(limpio.resumen, config);
      context.log(`Diagnóstico entregado (${texto.length} bytes de entrada).`);
      return { status: 200, headers: cors, jsonBody: r };
    } catch (e) {
      context.error(`Error con Azure OpenAI: ${e.message}`);
      return { status: 502, headers: cors, jsonBody: { error: 'La IA de Azure no respondió. Intenta más tarde.' } };
    }
  },
});
