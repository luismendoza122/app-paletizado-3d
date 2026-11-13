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
    'En Calcular palet escribe las medidas y el peso de la caja: la app busca el mejor acomodo por capa (incluye girar cajas en bloques), cuántas capas caben por altura y peso, y lo muestra en 3D.'] },
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
