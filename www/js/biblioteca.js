// Biblioteca del agente: fichas con todo lo del proyecto (uso de la app, reglas del CEDI, cálculo,
// logística, WPMS/SAP, análisis de datos y solución de problemas). Funciona sin internet.
// Cada ficha: { tema, titulo, claves: palabras con que la buscan, texto: párrafos de la respuesta }.
// Para agregar conocimiento, agrega una ficha aquí (las claves en minúscula y sin tildes).

export const BIBLIOTECA = [
  // ───────────── Uso de la app ─────────────
  { tema: 'App', titulo: 'Qué hace la app', claves: ['app', 'sirve', 'para que', 'objetivo', 'proyecto', 'que hace'], texto: [
    'Paletizado 3D ayuda a ubicar cada producto en el pasillo correcto para que, al recorrer la ruta de picking, el palet salga bien armado: pesado abajo, delicado arriba.',
    'Pasos: 1) tomar los datos de cada posición, 2) la app calcula la clase de cada artículo (BASE, MEDIO, TOPE), 3) propone la reubicación dentro de cada pasillo, 4) la prueba con pedidos reales y la muestra en 3D o en video.'] },
  { tema: 'App', titulo: 'Pantallas de la app', claves: ['pantalla', 'pestana', 'menu', 'secciones', 'donde esta'], texto: [
    'Inicio: avance, cargar Excel y descargar Excel completo. Tomar datos: las posiciones por pasillo. Agente: diagnóstico y preguntas. Ubicaciones: clase de cada posición. Reubicar: plan de movimientos. Pedidos: armar pedidos reales y video. Calcular palet: palet de un solo artículo. Tareas: enlaces de WhatsApp y usuarios. Ajustes: medidas del palet y reglas.'] },
  { tema: 'Tomar datos', titulo: 'Cómo tomar los datos de una posición', claves: ['medir', 'medida', 'tomar dato', 'como tomo', 'pesar', 'formulario', 'llenar'], texto: [
    '1. Artículo y código como salen en la etiqueta o en el WPMS.',
    '2. Medidas de la caja: A = largo (lado más largo de la base), B = ancho, H = alto. Mide 3 cajas y anota la mayor (las cajas se abomban). Puedes escribir en mm, cm o m.',
    '3. Peso de una caja o bulto en kg.',
    '4. Empaque CAJA o BULTO; Líquido SÍ si tiene botellas, galones o bolsas con líquido; Delicado SÍ si se aplasta o se rompe.',
    '5. Si no hay artículo, "Marcar vacía": no cuenta. Si el código ya se tomó en otra posición, la app llena el resto sola.'] },
  { tema: 'Tomar datos', titulo: 'Medidas en mm, cm o metros', claves: ['metro', 'metros', 'centimetro', 'cm', 'milimetro', 'mm', 'unidad', 'convertir'], texto: [
    'Arriba del formulario eliges "Medidas en mm, cm o m". Si cambias de unidad, lo escrito se convierte solo. La app siempre guarda en milímetros: 0,4 m = 40 cm = 400 mm.',
    'Si una medida queda menor de 60 mm o mayor de 2.000 mm, avisa "revisa la unidad" y pide tocar Guardar otra vez.'] },
  { tema: 'Tomar datos', titulo: 'Agregar posiciones a un módulo (x3, y1…z3)', claves: ['agregar posicion', 'agregar', 'anadir', 'adicionar', 'x3', 'y1', 'y2', 'y3', 'z1', 'z2', 'z3', 'crear posicion', 'nueva posicion', 'subdividir modulo'], texto: [
    'Cada módulo trae fijas x1 y x2 (ej. 05-001x1, 05-001x2, luego 05-002x1…). Si el módulo tiene más, abre cualquiera de sus posiciones y toca "Agregar posiciones al módulo": elige x3, y1, y2, y3, z1, z2 o z3 y "Agregar" (o "Agregar todas").',
    'En la ruta quedan en este orden: x1, x2, x3, y1, y2, y3, z1, z2, z3. Se comparten con todos por la nube.',
    'Una posición agregada que no se llena (o se marca vacía) no cuenta en el avance.'] },
  { tema: 'Tomar datos', titulo: 'Borrar una posición agregada', claves: ['borrar', 'eliminar', 'quitar posicion', 'borrar posicion', 'me equivoque'], texto: [
    'Abre la posición agregada (x3, y1…z3) y toca "Borrar". x1 y x2 son fijas y no se pueden borrar.',
    'Si tenía datos, la app pregunta antes. El borrado llega a los demás celulares; si otra persona ya la había llenado, no se borra y queda su dato.'] },
  { tema: 'Tomar datos', titulo: 'Dato que no aplica', claves: ['no aplica', 'n/a', 'na', 'no corresponde', 'no tiene', 'sin dato'], texto: [
    'Si un dato no corresponde al artículo, toca "No aplica": en Código, Largo, Alto, Ancho y Peso hay un botón al lado del nombre; en Empaque, Líquido y Delicado es la tercera opción. La posición queda completa.',
    'Si no aplican las medidas o el peso, el artículo no entra al cálculo del palet (sin medidas no se puede acomodar). Empaque "no aplica" se calcula como caja; líquido y delicado "no aplica", como NO. En Excel se escribe NO APLICA o N/A.'] },
  { tema: 'Administración', titulo: 'Enlazar Google Drive (pestaña Drive)', claves: ['drive', 'google drive', 'carpeta', 'puente', 'apps script', 'enlazar drive', 'subir a drive'], texto: [
    'Pestaña Drive (solo administradores): pega la dirección de una o varias carpetas de Drive, una por línea, y toca "Crear el código del puente". También puedes tocar "Pedírselo a THEMENDO".',
    'Abre script.google.com con la cuenta dueña de las carpetas → Nuevo proyecto → pega el código → Guardar → Implementar → Nueva implementación → Aplicación web (Ejecutar como: Yo · Quién tiene acceso: Cualquier persona) → Autorizar.',
    'Copia la URL que termina en /exec, pégala en "Conectar el puente" y toca "Guardar y probar". Luego "Enviar Excel de Paletizado" guarda el Excel en la carpeta que elijas.',
    'El puente solo atiende a los administradores, solo escribe en esas carpetas y nunca borra: si reenvías, el archivo anterior va a la papelera de Drive.'] },
  { tema: 'Tomar datos', titulo: 'Dos artículos en una posición', claves: ['dividir', 'a y b', 'mitad', 'dos articulos', 'subposicion'], texto: [
    'Ya no se divide en A y B. Si el módulo tiene más espacios, agrégale posiciones (x3, y1…z3) y pon cada artículo en la suya.'] },
  { tema: 'Tomar datos', titulo: 'Posición vacía', claves: ['vacia', 'sin articulo', 'no hay producto', 'no cuenta'], texto: [
    'Si no hay artículo en la posición, toca "Marcar vacía". Las vacías no cuentan en los datos, en los indicadores ni en el cálculo.'] },
  { tema: 'Tomar datos', titulo: 'Autocompletar un artículo repetido', claves: ['autocompletar', 'repetido', 'mismo articulo', 'llena solo'], texto: [
    'Si el mismo código de artículo ya está completo en otra posición, al escribir el código la app copia medidas, peso y características. Revisa que coincidan.'] },
  { tema: 'Nube', titulo: 'Una sola información para todos', claves: ['nube', 'compartir', 'sincronizar', 'todos', 'misma informacion', 'subir'], texto: [
    'Lo que guarda Luis (con sesión) o un operador (con enlace de tarea) se sube a la nube y le llega a todos. Si no hay señal, queda en el celular con un punto ● y se envía solo al volver la conexión.',
    'Sin tarea ni sesión los datos quedan solo en ese celular.'] },
  { tema: 'Nube', titulo: 'Conflicto: otra persona cambió la misma posición', claves: ['conflicto', 'cambio al mismo tiempo', 'parametrizada', 'ya fue tomada', 'alerta', 'otra persona'], texto: [
    'Si dos personas cambian la misma posición (ej. 05-004x1), la segunda ve "⚠ Cambios al mismo tiempo" en Tomar datos, con los dos datos. Elige "Dejar la mía" o "Usar la suya". Todo cambio queda en el historial.'] },
  { tema: 'Tareas', titulo: 'Tareas por WhatsApp', claves: ['whatsapp', 'enlace', 'link', 'tarea', 'asignar', 'compartir tarea'], texto: [
    'En Tareas (con sesión de Luis): escribe a quién, elige pasillos y días de vigencia, y "Crear enlace". Sale un enlace para mandar por WhatsApp.',
    'El operador lo abre una vez con internet; después trabaja sin conexión. Al tocar "Terminar y enviar" se suben los datos y el enlace queda inhabilitado. Solo puede tocar los pasillos de su tarea.'] },
  { tema: 'Tareas', titulo: 'Errores del enlace de tarea', claves: ['enlace vencio', 'vencio', 'vencido', 'ya se uso', 'otro celular', 'anulada', 'no abre', 'error enlace'], texto: [
    '"Ya se usó": la tarea se envió y quedó cerrada. "Venció": pasó la fecha; crea otra. "Ya se abrió en otro celular": el enlace queda atado al primer celular que lo abre. "Anulada": Luis la anuló.'] },
  { tema: 'Tareas', titulo: 'Cuántos usuarios tiene la app', claves: ['usuarios', 'cuantos usuarios', 'descargada', 'celulares', 'instalada'], texto: [
    'En Tareas → "Usuarios de la app" (con sesión de Luis) se ve el total de celulares, cuántos con APK y cuántos por la web, y los activos de los últimos 7 días.'] },
  { tema: 'Sugerencias', titulo: 'Enviar una sugerencia', claves: ['sugerencia', 'sugerir', 'sugerencias', 'propuesta', 'idea', 'mejorar la app', 'reportar'], texto: [
    'En la pestaña Sugerencias elige el tipo (mejora de la app, ubicación o reubicación, dato equivocado, agente u otro), escribe la idea y toca "Enviar sugerencia". Funciona sin señal: se envía cuando vuelva la conexión.',
    'En "Mis sugerencias" ves el estado (nueva, en revisión, aprobada, hecha o descartada) y la respuesta de la administración. Toca "Ver respuestas" para actualizar.'] },
  { tema: 'Administración', titulo: 'Entrar como administrador', claves: ['administrador', 'admin', 'codigo de administrador', 'entrar', 'permisos'], texto: [
    'En Tareas → "Entrar como administrador" escribe el código personal que te entregaron (XXXX-XXXX-XXXX). Con él puedes crear y anular tareas, ver los usuarios, bajar y editar la información de todos, publicar los ajustes del palet, responder sugerencias y enseñar al agente.',
    'El código es personal: sirve en un solo celular (el primero donde se usa) y tiene fecha de vencimiento. Si te lo quitan o vence, deja de funcionar y hay que pedir uno nuevo. Desde la app no se puede cambiar el código del programa.'] },
  { tema: 'Administración', titulo: 'Enseñar al agente', claves: ['ensenar', 'leccion', 'aprenda', 'aprender', 'no supo', 'olvidar'], texto: [
    'Cuando el agente no sabe algo, la pregunta le llega a la administración. En la pestaña Agente → "Enseñar al agente" el administrador escribe la respuesta y toca "Enseñar": la lección llega a todos los celulares.',
    'También se puede escribir una lección nueva, convertir la respuesta de una sugerencia en lección, u "Olvidar" una que esté mal. Además, cada madrugada el agente recibe una lección nueva de logística (aprendizaje diario).'] },
  { tema: 'Administración', titulo: 'El agente aprende de Copilot (THEMENDO)', claves: ['copilot', 'themendo', 'cuaderno', 'leccion de copilot'], texto: [
    'Las lecciones que THEMENDO deja en Copilot y que se guardan en su Cuaderno también llegan al agente de la app. Solo pasan las de trabajo (logística, CEDI, inventarios, Excel, SAP, recibo, despacho…).',
    'Si una lección se descarta en el Cuaderno, el agente la olvida. También se puede olvidar desde Agente → "Enseñar al agente" → "Lo que ya aprendió".'] },
  { tema: 'Administración', titulo: 'Ajustes iguales para todos', claves: ['ajustes para todos', 'publicar ajustes', 'aplicar a todos', 'misma configuracion'], texto: [
    'En Ajustes, un administrador toca "Guardar y aplicar a todos los celulares". Los demás reciben las medidas del palet y el apoyo mínimo la próxima vez que abran la app con señal.'] },
  { tema: 'Reubicar', titulo: 'Plan de reubicación', claves: ['reubicar', 'reubicacion', 'plan', 'movimiento', 'mover', 'slotting'], texto: [
    'La pestaña Reubicar ordena cada pasillo por separado: BASE en los primeros módulos, MEDIO en el centro y TOPE al final, sin cambiar de zona. Mueve lo menos posible.',
    'Si hay "cadenas cerradas" (A va donde B y B donde A) hace falta una ubicación temporal libre. El plan se descarga en Excel; lo aprueba el supervisor y el cambio en el WPMS lo hace el CEDI.'] },
  { tema: 'Pedidos', titulo: 'Probar con pedidos reales', claves: ['pedido', 'tienda', 'probar', 'simular', 'comparar'], texto: [
    'Carga la hoja PEDIDOS (pedido, tienda, fecha, código, artículo, cajas, estibas) en Inicio. En Pedidos, la app arma cada pedido en el orden de la ruta con la ubicación actual y con la propuesta, y compara: cajas mal puestas, sobrepeso, delicados aplastados y palets por pedido.'] },
  { tema: 'Pedidos', titulo: 'Video del armado del palet', claves: ['video', 'grabar', 'mp4', 'animacion', 'caja por caja'], texto: [
    'Debajo de la vista 3D (Pedidos o Calcular palet) toca "🎬 Video del armado". Muestra cada caja en el orden en que se recoge, con artículo, código y ubicación. Sale en MP4 vertical; "Guardar o enviar video" lo comparte por WhatsApp.',
    'Mientras graba no cambies de pantalla. Dura entre unos 10 y 35 segundos según las cajas.'] },
  { tema: 'Excel', titulo: 'Exportar a Excel y editar en el PC', claves: ['excel', 'exportar', 'descargar', 'xlsx', 'pc', 'editar', 'hoja'], texto: [
    'Inicio → "Descargar Excel completo": hojas UBICACIONES, ARTICULOS, REUBICACION, PEDIDOS, PRUEBA_PEDIDOS y DIAGNOSTICO. En la APK se abre "Compartir" para guardarlo en Drive, Descargas o mandarlo.',
    'Puedes editar UBICACIONES o PEDIDOS en el PC (sin cambiar títulos ni CODIGO) y volverlo a cargar en Inicio. Lo que cambió se sube a la nube.'] },
  { tema: 'Excel', titulo: 'Diagnóstico', claves: ['diagnostico', 'informe', 'reporte', 'resumen'], texto: [
    'En la pestaña Agente: avance, zonas, mejoras y siguiente paso. Botones: "Diagnóstico en Excel", "Enviar por WhatsApp" (texto listo) y "Copiar".'] },
  { tema: 'Calcular', titulo: 'Calcular un palet de un solo artículo', claves: ['calcular', 'calculadora', 'un solo articulo', 'capas'], texto: [
    'En Calcular palet, abajo, escribe las medidas y el peso de la caja o elige el artículo: la app busca el mejor acomodo por capa (incluye girar cajas en bloques), cuántas capas caben por altura y peso, y lo muestra en 3D.'] },
  { tema: 'Calcular', titulo: 'Armar palets de un pedido con varios artículos', claves: ['armar palets', 'armar pedido', 'varios articulos', '100 cajas', 'lista de articulos', 'pedido de cajas', 'cuantos palets', 'multirreferencia'], texto: [
    '1. Calcular palet → "Armar palets de un pedido". Busca el artículo medido (código o nombre), escribe las cajas y toca Agregar. Repite con cada artículo; puedes cambiar las cajas o quitar (×).',
    '2. Orden: "Pesado primero" (recomendado: BASE → MEDIO → TOPE, delicados al final) u "Orden de la ruta". Deja marcado "Alimentos y no alimentos en palets aparte".',
    '3. Toca "Armar palets": sale cuántos palets, qué lleva cada uno de abajo hacia arriba, su peso con estiba, sus medidas (largo × ancho × alto) y las alertas. "Ver en 3D y video" muestra cada palet y "Descargar Excel del armado" deja la lista de carga.',
    'Solo entran artículos con medidas y peso completos; los demás salen en un aviso para tomarlos en "Tomar datos".'] },
  { tema: 'Calcular', titulo: 'Cargar la lista del pedido (Excel, CSV o pegar)', claves: ['importar lista', 'cargar excel pedido', 'csv pedido', 'pegar lista', 'codigo cajas'], texto: [
    'En Armar palets de un pedido: "Cargar Excel o CSV" lee la primera hoja con una columna de código (CODIGO, CODIGO_ARTICULO, SKU, EAN) y una de cantidad (CAJAS, CANTIDAD, BULTOS). También puedes pegar una lista en "Pegar una lista": una línea por artículo, por ejemplo 7701234;10, 7701234 10 o 10 x 7701234. Los códigos repetidos se suman y el peso del empaque (500G, 3000ML) no se toma como cantidad.'] },
  { tema: 'Calcular', titulo: 'Foto del pedido: THEMENDO arma la lista', claves: ['foto', 'fotografia', 'camara', 'imagen del pedido', 'foto del pedido', 'leer foto'], texto: [
    '1. En Armar palets de un pedido toca "📷 Foto del pedido → THEMENDO": la app copia las instrucciones y abre THEMENDO en Copilot.',
    '2. En Copilot pega el texto, adjunta la foto del pedido o la lista impresa (📎 o cámara) y envía.',
    '3. THEMENDO responde una lista CODIGO;CAJAS. Cópiala, vuelve a la app y pégala en "Pegar una lista" → "Agregar la lista al pedido".',
    'Lo que THEMENDO no lea bien viene marcado REVISAR y la app lo muestra aparte para corregirlo a mano.'] },
  { tema: 'Calcular', titulo: 'Peso y medidas para mover artículos', claves: ['mover articulo', 'peso del palet', 'medidas del palet', 'montacargas', 'estibador', 'cuanto pesa el palet', 'palet completo'], texto: [
    'Después de armar un pedido, "Datos para mover cada artículo" muestra cómo queda un palet completo de cada artículo: cajas por capa × capas (TI × HI), cajas, peso con estiba y altura. Úsalo para planear una reubicación o para saber si el equipo (estibador o montacargas) aguanta ese peso: la capacidad está en la placa del equipo. Cada palet armado del pedido también trae su peso y sus medidas.'] },
  { tema: 'Ajustes', titulo: 'Medidas del palet y reglas', claves: ['ajustes', 'altura maxima', 'peso maximo', 'configurar', 'voladizo'], texto: [
    'En Ajustes: largo, ancho y alto de la estiba, peso de la estiba vacía, carga máxima, altura máxima total, voladizo permitido y apoyo mínimo de cada caja. Vienen de ejemplo (1.200 × 1.000 mm, 1.800 mm, 1.000 kg) hasta que se confirmen con el CEDI.'] },
  { tema: 'APK', titulo: 'Instalar o actualizar la app', claves: ['instalar', 'actualizar', 'apk', 'mis apk', 'central', 'version nueva'], texto: [
    'La APK oficial está en Mis APK de la Central de Luis; cada versión nueva se instala encima. También está la página web en GitHub Pages (funciona en el navegador del celular).'] },
  { tema: 'APK', titulo: 'Conflicto de paquetes al instalar', claves: ['conflicto de paquetes', 'no se instalo', 'firma', 'no deja instalar', 'paquete'], texto: [
    'Android solo actualiza si la APK nueva tiene la misma firma. Desde la versión 0.4.6 la firma es fija. Si sale el error, sube o exporta tus datos, desinstala una vez e instala desde Mis APK. No mezcles con la APK de GitHub Releases hasta que tenga la misma firma.'] },
  { tema: 'Problemas', titulo: 'La vista 3D no aparece', claves: ['3d no', 'no se ve', 'visor', 'pantalla en blanco', 'no carga'], texto: [
    'La primera vez la vista 3D necesita que la app esté actualizada. Cierra y abre la app; si sigue, revisa que el celular tenga el navegador del sistema (WebView) actualizado en Play Store.'] },
  { tema: 'Problemas', titulo: 'No descarga el archivo', claves: ['no descarga', 'no guarda', 'no comparte', 'archivo'], texto: [
    'En la APK, al descargar se abre "Compartir": elige Drive, Archivos o WhatsApp. En el navegador baja a Descargas. Si nada funciona, usa el botón "Copiar" y pega en Excel.'] },
  { tema: 'Problemas', titulo: 'Desinstalar sin perder datos', claves: ['desinstalar', 'perder datos', 'respaldo', 'copia de seguridad'], texto: [
    'Antes de desinstalar: sube lo pendiente (Tareas → "Subir mis cambios") o descarga el Excel completo. Lo que está en la nube no se pierde; lo que solo está en el celular sí.'] },

  // ───────────── Reglas del CEDI ─────────────
  { tema: 'CEDI', titulo: 'Zonas y pasillos', claves: ['zona', 'zonas', 'pasillos', 'lacteos', 'temperado', 'congelado', 'fruver', 'seco', 'alimentos'], texto: [
    'Seco no alimentos: 05 al 11. Seco alimentos: 12 al 19. Lácteos: LA52, LA53, LA54. Temperado: TE62, TE63. Fruver: FV42. Congelado: CO31, CO32. Pilas y canastillas no son ubicaciones de artículos.',
    'Alimentos y no alimentos nunca van en el mismo palet.'] },
  { tema: 'CEDI', titulo: 'Módulos y códigos de ubicación', claves: ['modulo', 'codigo de ubicacion', '001', 'multiplos de 3', 'x1', 'x2', 'cuantas posiciones'], texto: [
    'Cada pasillo tiene módulos 001 a 056 sin los múltiplos de 3 (38 módulos). Cada módulo tiene fijas x1 y x2 y se le pueden agregar x3, y1–y3, z1–z3. Código: PASILLO-MODULOPOSICION (ej. 05-004x1, 05-004y2).',
    'Con x1 y x2 son 76 posiciones por pasillo y 1.748 en total.'] },
  { tema: 'CEDI', titulo: 'Ruta de picking', claves: ['ruta', 'recorrido', 'orden', 'secuencia', 'picking'], texto: [
    'Se entra a cada pasillo por el 001 hacia el 056, de lado a lado (001x1, 001x2, 002x1…). La secuencia empieza en 1 en cada zona. Lo primero que se recoge queda abajo en el palet; lo último, arriba.',
    'Una tarea se divide por pasillo y por cajas (5 a 200) y pide 1 o 2 estibas que se arman a la vez.'] },
  { tema: 'Cálculo', titulo: 'Índice de arrume', claves: ['indice', 'arrume', 'formula', 'puntaje', 'como calcula'], texto: [
    'Índice de 0 a 1 por artículo = 45 % peso + 30 % resistencia + 15 % densidad + 10 % alto (cada uno comparado con los demás artículos). Bulto +0,1 y líquido +0,1; delicado se multiplica por 0,2 (siempre queda TOPE).'] },
  { tema: 'Cálculo', titulo: 'Clases BASE, MEDIO y TOPE', claves: ['base', 'medio', 'tope', 'clase', 'que significa'], texto: [
    'BASE (índice ≥ 0,66): pesado y resistente, va al inicio del pasillo para quedar abajo. MEDIO: centro del pasillo. TOPE (< 0,33 o delicado): liviano o frágil, va al final para quedar arriba.',
    'Así cualquier tarea que empiece en un pasillo arranca con base firme.'] },
  { tema: 'Cálculo', titulo: 'Delicados, líquidos y bultos', claves: ['delicado', 'liquido', 'bulto', 'fragil', 'saco', 'botella', 'huevo'], texto: [
    'Delicado: arriba, nada pesado encima; aguanta hasta 2 veces su propio peso. Líquido: siempre de pie, preferible abajo, nunca encima de un delicado. Bulto (saco): base, se apoya plano, se puede acostar.'] },
  { tema: 'Cálculo', titulo: 'Estabilidad del palet', claves: ['estable', 'estabilidad', 'apoyo', 'centro de gravedad', 'se cae', 'voladizo', 'sobresale'], texto: [
    'Cada caja debe apoyarse al menos 70 % sobre lo de abajo. El centro de gravedad no debe alejarse más del 10 % del centro del palet. Las cajas no deben sobresalir del borde: 2,5 cm de sobresaliente pueden quitar 15–18 % de resistencia a la caja.'] },
  { tema: 'Cálculo', titulo: 'Cómo arma el palet en orden de ruta', claves: ['como arma', 'puntos extremos', 'algoritmo', 'motor', 'secuencia'], texto: [
    'El motor pone las cajas en el orden en que se recogen. Para cada caja prueba los "puntos extremos" (esquinas libres) y sus giros, y elige el lugar más bajo y pegado que cumpla apoyo, peso encima y centro de gravedad. Si no cabe, pasa a la segunda estiba.'] },
  { tema: 'CEDI', titulo: 'Quién aprueba los cambios', claves: ['aprueba', 'aprobar', 'quien aprueba', 'supervisor', 'autoriza', 'quien decide'], texto: [
    'La app propone; no ejecuta. La reubicación la aprueba el supervisor y el cambio de ubicación en el WPMS lo hace el CEDI. Recomendación: empezar con un pasillo piloto.'] },

  // ───────────── Logística ─────────────
  { tema: 'Logística', titulo: 'Palet estándar en Colombia', claves: ['palet estandar', 'estiba estandar', '1200', 'europeo', 'americano', 'medida del palet', 'colombia', 'estandar'], texto: [
    'El más usado en Colombia es 1,20 × 1,00 m (base ≈ 150 mm). Existen el europeo 1,20 × 0,80 m y el americano 1,219 × 1,016 m. La altura y el peso máximo dependen del rack, el vehículo y la regla del CEDI.'] },
  { tema: 'Logística', titulo: 'TI-HI (cajas por capa y capas)', claves: ['ti hi', 'tihi', 'ti-hi', 'cajas por capa', 'camas'], texto: [
    'TI = cajas por capa (cama); HI = número de capas. TI × HI = cajas por palet. Se usa para recibo, almacenamiento y pedidos de palet completo.'] },
  { tema: 'Logística', titulo: 'Arrume en columna vs trabado', claves: ['columna', 'trabado', 'ladrillo', 'patron', 'bct', 'compresion'], texto: [
    'En columna (esquina sobre esquina) las cajas pierden 12–20 % de resistencia; trabado (tipo ladrillo) pierde 45–54 % pero amarra mejor. Columna para cajas pesadas o débiles que se apilan alto; trabado en capas de arriba o carga liviana, siempre con película stretch.'] },
  { tema: 'Logística', titulo: 'Slotting (asignar ubicaciones)', claves: ['slotting', 'asignar ubicaciones', 'slap', 'acomodar bodega'], texto: [
    'Slotting es decidir en qué ubicación va cada producto para picar más rápido y armar mejor. Se cruza rotación (ABC), peso, tamaño, fragilidad y familia. En la investigación se llama SLAP (Storage Location Assignment Problem).'] },
  { tema: 'Logística', titulo: 'Análisis ABC', claves: ['abc', 'pareto', 'rotacion', 'frecuencia', '80 20'], texto: [
    'Ordena los códigos por líneas de pedido (no por valor): A ≈ 20 % de los códigos con 70–80 % de las líneas, B hasta ~95 % acumulado, C el resto. En Excel: =SI(acum<=0,8;"A";SI(acum<=0,95;"B";"C")). Cruza con peso: A pesados al inicio de la ruta, frágiles al final.'] },
  { tema: 'Logística', titulo: 'FIFO, FEFO y LIFO', claves: ['fifo', 'fefo', 'lifo', 'vencimiento', 'primero en entrar'], texto: [
    'FIFO: sale primero lo que entró primero. FEFO: sale primero lo que vence primero (alimentos, lácteos). LIFO: sale primero lo último que entró (poco usado en alimentos).'] },
  { tema: 'Logística', titulo: 'Picking', claves: ['picking', 'alistamiento', 'separacion', 'preparar pedido'], texto: [
    'Picking es recoger las cajas de un pedido en las ubicaciones. Su costo depende sobre todo del recorrido. Un buen slotting acerca lo de más rotación y ordena por peso para no rearmar el palet.'] },
  { tema: 'Logística', titulo: 'Indicadores de bodega', claves: ['indicador', 'kpi', 'otif', 'exactitud', 'productividad', 'medir resultados'], texto: [
    'Exactitud de inventario (%), OTIF (pedidos completos y a tiempo), cajas por hora por operador, % palets sin rearme, daños por manipulación, ocupación de ubicaciones. En este proyecto: cajas mal puestas, delicados aplastados y palets por pedido.'] },
  { tema: 'Logística', titulo: 'Ergonomía en el picking', claves: ['ergonomia', 'altura', 'espalda', 'levantar', 'cintura'], texto: [
    'Lo pesado a la altura de la cintura (aprox. 70–120 cm), nunca en lo alto ni pegado al piso si se puede evitar. Las cajas pesadas al inicio de la ruta también reducen esfuerzo al armar.'] },
  { tema: 'Logística', titulo: 'Película stretch y aseguramiento', claves: ['stretch', 'pelicula', 'envolver', 'zunchar', 'esquineros'], texto: [
    'Envolver desde la base (2–3 vueltas abajo amarrando el palet) y subir traslapando. Esquineros protegen las esquinas en cargas altas o frágiles.'] },

  // ───────────── WPMS / SAP / datos ─────────────
  { tema: 'Sistemas', titulo: 'WMS / WPMS', claves: ['wms', 'wpms', 'sistema de bodega', 'warehouse'], texto: [
    'El WMS (en el CEDI lo llaman WPMS) es el sistema que controla ubicaciones, recibos, tareas de picking, inventario y despachos. La app no cambia el WPMS: entrega el plan para que el CEDI haga los cambios allí.'] },
  { tema: 'Sistemas', titulo: 'SAP en bodegas', claves: ['sap', 'ewm', 'transaccion', 'mm', 'wm'], texto: [
    'SAP maneja materiales (MM), ventas (SD) y bodega (WM o EWM). En WM: LS01N/LS03N ubicaciones, LT01 crear orden de transporte, LT10 traslados, LX02 stock por ubicación. En EWM se manejan tareas y ubicaciones con el monitor de almacén. El maestro de materiales guarda medidas y peso por unidad.'] },
  { tema: 'Datos', titulo: 'Análisis de datos en Excel', claves: ['tabla dinamica', 'buscarv', 'excel formulas', 'analizar datos'], texto: [
    'Convierte el rango en tabla (Ctrl+T), usa tablas dinámicas para resumir por pasillo o clase, BUSCARX/BUSCARV para cruzar códigos y formato condicional para resaltar datos raros. El Excel de la app ya trae autofiltro en cada hoja.'] },
  { tema: 'Datos', titulo: 'Power BI', claves: ['power bi', 'tablero', 'dashboard', 'dax'], texto: [
    'Carga el Excel de la app en Power BI, relaciona ARTICULOS con PEDIDOS por CODIGO_ARTICULO y arma: avance por zona, mapa de calor por pasillo y Pareto ABC con medidas DAX (CALCULATE, ALL, RANKX).'] },

  // ───────────── Normas y estándares (CEDI) ─────────────
  { tema: 'Normas', titulo: 'Qué normas aplican en un CEDI', claves: ['norma', 'normas', 'iso', 'normatividad', 'estandares', 'que norma', 'reglamento'], texto: [
    'Estiba: ISO 6780 (medidas), ISO 8611 (ensayos y carga), ISO 445 (vocabulario). Cajas y unidad de carga: ISO 3394 (módulo 600 × 400) e ISO 3676 (unidad de carga 1.200 × 1.000). Etiquetas: GS1 (SSCC en GS1-128). Alimentos: Resolución 2674 de 2013 (BPM, almacenamiento). Seguridad: Resolución 2400 de 1979, Decreto 1072 de 2015 y Resolución 0312 de 2019 (SG-SST). Estibas de madera para exportar: NIMF 15. Transporte: EN 12195-1 y EUMOS 40509 (estabilidad). Racks: EN 15635 y EN 15512. Montacargas: ISO 3691-1. Gestión: ISO 9001, ISO 28000, ISO 45001 e ISO 14001.',
    'Las normas ISO y EN son voluntarias salvo que un cliente o el CEDI las exijan; las resoluciones colombianas sí son obligatorias. Pregúntame por cada una.'] },
  { tema: 'Normas', titulo: 'Estibas: ISO 6780, ISO 8611 e ISO 445', claves: ['iso 6780', 'iso 8611', 'iso 445', 'medidas de estiba', 'tamano de estiba', 'tipos de estiba'], texto: [
    'ISO 6780 reconoce seis medidas de estiba plana; las más usadas son 1.200 × 800 (europea), 1.200 × 1.000, 1.219 × 1.016 (americana, 48 × 40 pulgadas), 1.067 × 1.067 y 1.100 × 1.100 mm. También fija entradas y holguras para montacargas y estibadores.',
    'ISO 8611 trae los ensayos de la estiba y cómo calcular su carga de trabajo; ISO 445 define los nombres (larguero, taco, tabla, entrada). En el CEDI la de referencia es 1.200 × 1.000 mm; su carga máxima la da el fabricante y se escribe en Ajustes.'] },
  { tema: 'Normas', titulo: 'Módulo 600 × 400 (ISO 3394 e ISO 3676)', claves: ['iso 3394', 'iso 3676', 'modulo 600', '600 x 400', 'caja modular', 'unidad de carga'], texto: [
    'ISO 3394 da medidas de cajas de transporte basadas en el módulo 600 × 400 mm (y sus múltiplos y submúltiplos: 300 × 400, 300 × 200, 1.200 × 800…). ISO 3676 toma 1.200 × 1.000 mm como unidad de carga preferida.',
    'Para la app: cajas que son submúltiplos del módulo llenan la estiba sin huecos ni voladizo (por ejemplo 400 × 300 da 10 por capa en 1.200 × 1.000). Si un proveedor cambia la caja, vuelve a medirla.'] },
  { tema: 'Normas', titulo: 'Alimentos: Resolución 2674 de 2013 (almacenamiento)', claves: ['2674', 'resolucion 2674', 'invima', 'bpm', 'buenas practicas', 'pared', 'paredes', 'piso', 'separacion', '15 cm', '60 cm', 'alimentos almacenamiento'], texto: [
    'Artículo 28: rotación de primeras entradas, primeras salidas (PEPS); las pilas o estibas a mínimo 60 cm de las paredes perimetrales y sobre estibas limpias y en buen estado, elevadas mínimo 15 cm del piso, para inspeccionar, limpiar y fumigar.',
    'Devueltos y vencidos en área exclusiva e identificada, con registro; plaguicidas, detergentes y sustancias peligrosas en área separada y señalizada; congelación a −18 °C o menos. En el almacén no se hacen otras actividades.',
    'Artículo 29 (transporte): los alimentos no van directo sobre el piso del vehículo y no se transportan con sustancias peligrosas.'] },
  { tema: 'Normas', titulo: 'Seguridad: Resolución 2400 de 1979', claves: ['2400', 'resolucion 2400', 'carga maxima persona', '25 kg', 'levantar peso', 'cuanto peso', 'puede levantar', 'cuanto puede cargar', 'levantar', 'manipulacion manual', 'arrume seguro'], texto: [
    'Art. 392: carga máxima para levantar: 25 kg de carga compacta para un hombre y 12,5 kg para una mujer. Art. 390: nadie carga al hombro bultos de más de 50 kg (20 kg una mujer) y los bultos de 50 kg o más llevan su peso marcado.',
    'Art. 396: las pilas de cajas de cartón se estabilizan (esquineros y amarres) y nunca se arruma frente a extintores, hidrantes ni salidas de emergencia. Art. 440 y 441: los equipos de carga motorizados tienen su carga máxima en una placa visible y solo los manejan personas entrenadas y autorizadas.',
    'Pasillos interiores de trabajo: mínimo 1,20 m de ancho. Para la app: cajas de más de 25 kg son pesadas para una persona: van abajo, al inicio de la ruta y a la altura de la cintura.'] },
  { tema: 'Normas', titulo: 'SG-SST: Decreto 1072 de 2015 y Resolución 0312 de 2019', claves: ['sg-sst', 'sgsst', '1072', '0312', 'seguridad y salud', 'iso 45001', 'riesgos'], texto: [
    'En Colombia toda empresa debe tener el Sistema de Gestión de Seguridad y Salud en el Trabajo (Decreto 1072 de 2015) con los estándares mínimos de la Resolución 0312 de 2019. ISO 45001 es la norma internacional equivalente (voluntaria).',
    'En bodega se traduce en: matriz de riesgos (cargas, caídas de mercancía, montacargas), capacitación en levantamiento, inspección de racks y equipos y reporte de incidentes. Un plan de reubicación que baje lo pesado ayuda a reducir el riesgo de manipulación.'] },
  { tema: 'Normas', titulo: 'Etiqueta logística GS1: SSCC y GS1-128', claves: ['gs1', 'sscc', 'gs1-128', 'etiqueta logistica', 'codigo de barras', 'gtin', 'ean'], texto: [
    'Cada palet (unidad logística) se identifica con un SSCC único de 18 dígitos, codificado en GS1-128 con el identificador (00); es el único dato obligatorio de la etiqueta logística y va en el código de más abajo. Puede llevar además GTIN (01 o 02), lote (10) y vencimiento (17).',
    'El artículo (caja) se identifica con su GTIN/EAN. Si la foto de un pedido trae EAN en vez del código interno, hay que cruzarlo con el maestro antes de armar.'] },
  { tema: 'Normas', titulo: 'Estibas de madera para exportar: NIMF 15', claves: ['nimf 15', 'nimf', 'ispm 15', 'ica', 'sello ht', 'tratamiento termico', 'exportar estiba', 'madera'], texto: [
    'Las estibas y embalajes de madera que cruzan fronteras deben ir tratadas (térmico HT o fumigación MB) y con el sello NIMF 15 de un operador autorizado por el ICA (Resolución ICA 38438 de 2018). El sello lleva el país (CO), el registro del productor y el tratamiento.',
    'No aplica a estibas plásticas ni a madera de 6 mm o menos, ni a la distribución nacional entre CEDI y tiendas.'] },
  { tema: 'Normas', titulo: 'Estabilidad para transporte: EN 12195-1 y EUMOS 40509', claves: ['en 12195', 'eumos', '40509', 'amarre', 'aseguramiento de carga', 'estabilidad transporte', 'camion'], texto: [
    'EN 12195-1 calcula las fuerzas para amarrar la carga en vehículos. EUMOS 40509 prueba qué tan rígida es una unidad de carga: deformación permanente máxima 5 %, deformación durante el frenado máxima 10 % y desplazamiento entre capas máximo 2 %.',
    'En la práctica: capas parejas, sin voladizo, centro de gravedad al centro, película stretch amarrando la estiba y esquineros en cargas altas. La app avisa el centro de gravedad corrido y lo que no tiene apoyo suficiente.'] },
  { tema: 'Normas', titulo: 'Racks y montacargas: EN 15635, EN 15512 e ISO 3691-1', claves: ['rack', 'estanteria', 'en 15635', 'en 15512', 'iso 3691', 'montacargas', 'capacidad del rack', 'golpe al rack'], texto: [
    'EN 15512 es para diseñar racks de estibas; EN 15635 para usarlos: placa con la carga por nivel visible, inspección periódica por una persona competente (al menos una vez al año) y daños clasificados en verde (vigilar), ámbar (descargar pronto) y rojo (descargar ya).',
    'ISO 3691-1 son los requisitos de seguridad de los montacargas. Nunca pongas en un nivel un palet más pesado que la placa del rack ni subas uno más pesado de lo que dice la placa del equipo.'] },
  { tema: 'Normas', titulo: 'Gestión: ISO 9001, ISO 28000 e ISO 14001', claves: ['iso 9001', 'iso 28000', 'iso 14001', 'calidad', 'seguridad cadena', 'ambiental', 'auditoria'], texto: [
    'ISO 9001: procesos documentados y mejora continua (por ejemplo, un procedimiento de reubicación con indicadores). ISO 28000: seguridad de la cadena de suministro (control de accesos, sellos, trazabilidad). ISO 14001: gestión ambiental (reciclaje de película stretch, reparación de estibas).',
    'La app ayuda dejando trazabilidad: quién tomó cada dato, historial de cambios y Excel del plan.'] },
  { tema: 'Normas', titulo: 'Buenas prácticas de slotting en CEDI', claves: ['buenas practicas slotting', 'zona dorada', 'coi', 'cube per order', 'ubicar productos', 'criterios de ubicacion'], texto: [
    'No es una norma ISO: son prácticas aceptadas. 1) ABC por líneas de pedido: lo A cerca y en la zona dorada (cintura a hombro). 2) Pesado y resistente al inicio de la ruta y en el nivel bajo; liviano y delicado al final. 3) Índice COI (espacio que ocupa ÷ pedidos al mes): menor COI, más cerca. 4) Familias juntas y separar alimentos de no alimentos y químicos. 5) Perecederos con FEFO y frío separado. 6) Revisar cada temporada.',
    'Eso es justo lo que hace "Reubicar" con la clase BASE/MEDIO/TOPE y la ruta del pasillo.'] },
  { tema: 'Normas', titulo: 'Buenas prácticas para conformar el palet', claves: ['conformar palet', 'conformacion', 'armar bien', 'buenas practicas palet', 'reglas de arrume'], texto: [
    '1) Lo más pesado y resistente abajo; líquidos abajo y de pie; delicados arriba. 2) Sin voladizo: nada sale de la estiba. 3) Capas parejas y planas; huecos al centro, nunca en las esquinas. 4) Centro de gravedad al centro y bajo. 5) No pasar la altura ni el peso máximo (Ajustes). 6) Alimentos y no alimentos en palets distintos (BPM). 7) Película stretch desde la estiba, esquineros si es alto, y etiqueta en dos lados.',
    'En la app: "Armar palets de un pedido" aplica 1, 2, 4, 5 y 6 y avisa lo que no cumple.'] },

  // ───────────── Investigación ─────────────
  { tema: 'Investigación', titulo: 'Calculadoras gratuitas para comparar', claves: ['calculadora gratis', 'easycargo', 'premier tech', 'stow8', 'comparar resultados', 'herramientas'], texto: [
    'Gratis: Premier Tech Pallet Calculator, EasyCargo 3D, CarraGlobe, Freight Sidekick y Stow8 (15 al mes). De pago con prueba: Quick Pallet Maker y LoadOptimizer. "Hansatic" y "3PL Hub" no se pudieron verificar.'] },
  { tema: 'Investigación', titulo: 'Base teórica del cálculo', claves: ['mplp', 'dplp', 'guillotina', 'teoria', 'investigacion', 'paper'], texto: [
    'Un solo artículo: Manufacturer\'s Pallet Loading Problem (bloques y cortes de guillotina; Morabito, Lins, Birgin). Varios artículos: Distributor\'s Pallet Loading Problem, por capas con apoyo y compresión (Dell\'Amico y Magnani 2021). Slotting: SLAP con precedencia y peso (Trindade y otros 2021).'] },
];

const sinTildes = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const VACIAS = new Set(['como', 'para', 'que', 'cual', 'cuales', 'donde', 'cuando', 'porque', 'por', 'una', 'uno', 'unos', 'las', 'los', 'del', 'con', 'sin', 'este', 'esta', 'esto', 'eso', 'hay', 'hago', 'puedo', 'debo', 'tiene', 'tengo', 'quiero', 'sobre', 'mas', 'muy', 'app', 'la', 'el', 'de', 'en', 'se', 'me', 'mi', 'es', 'un', 'y', 'o', 'a', 'al', 'lo', 'le', 'su', 'sus']);
// Raíz sencilla: "borro", "borrar" y "borrando" quedan iguales.
const raiz = (w) => (w.length > 4 ? w.replace(/(ando|iendo|aron|ar|er|ir|as|es|os|a|o|e|s)$/, '') : w).slice(0, 6);
const palabrasDe = (t) => sinTildes(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !VACIAS.has(w));

// Busca las fichas que más se parecen a la pregunta. Devuelve [{ ficha, puntos }] de mayor a menor.
export function buscarEnBiblioteca(pregunta, fichas = BIBLIOTECA) {
  const t = ` ${sinTildes(pregunta)} `;
  const raices = palabrasDe(pregunta).map(raiz);
  if (!raices.length) return [];
  const enPregunta = new Set(raices);
  return fichas.map((ficha) => {
    let puntos = 0;
    for (const c of ficha.claves) {
      if (c.includes(' ')) { if (t.includes(` ${c} `) || t.includes(c)) puntos += 4; }
      else if (enPregunta.has(raiz(c)) || t.includes(` ${c} `)) puntos += 3;
    }
    const titulo = palabrasDe(ficha.titulo).map(raiz);
    const cuerpo = new Set(palabrasDe(ficha.texto.join(' ')).map(raiz));
    for (const r of raices) {
      if (titulo.includes(r)) puntos += 2;
      else if (cuerpo.has(r)) puntos += 0.5;
    }
    return { ficha, puntos };
  }).filter((x) => x.puntos >= 2).sort((a, b) => b.puntos - a.puntos);
}
