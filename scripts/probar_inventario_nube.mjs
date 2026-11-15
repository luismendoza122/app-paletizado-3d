// Prueba de la función "inventario" en la nube real (la corre GitHub; necesita un código de administrador de prueba).
// Crea un inventario de prueba, cuenta, verifica, descarga Excel y dashboard, pregunta a Aura y al final lo borra.
const BASE = 'https://nfrqrboqxcpgsagnmwqq.supabase.co/functions/v1/inventario';
const CODIGO = process.env.CODIGO_PRUEBA;
if (!CODIGO) { console.error('Falta CODIGO_PRUEBA'); process.exit(1); }
let fallas = 0;
const ok = (cond, txt) => { console.log(`${cond ? '✓' : '✗'} ${txt}`); if (!cond) fallas++; };
async function pedir(metodo, ruta, { cuerpo, admin = true, cel = 'cel-prueba-admin-01' } = {}) {
  const h = { 'Content-Type': 'application/json', 'x-dispositivo': cel };
  if (admin) h['x-admin'] = CODIGO;
  const r = await fetch(`${BASE}${ruta}`, { method: metodo, headers: h, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}

const t0 = Date.now();
let r = await pedir('GET', '/', { admin: false });
ok(r.status === 200 && r.body.ok, 'la función responde');
r = await pedir('GET', '/api/admin/config', { admin: false });
ok(r.status === 401, 'sin código no entra (401)');
r = await pedir('GET', '/api/admin/config');
ok(r.status === 200 && r.body.secciones?.length === 7, `con código entra y ve las 7 secciones (${r.status})`);
const pid = (c) => r.body.secciones.flatMap((s) => s.pasillos).find((p) => p.codigo === c).id;
const cfg = r.body;
r = await pedir('GET', '/api/admin/config', { cel: 'otro-celular-9999' });
ok(r.status === 401 && /otro celular/.test(r.body.error), `el código no sirve en otro celular: "${r.body.error}"`);
r = await pedir('GET', '/api/admin/quien');
ok(r.body.rol === 'admin', 'quién soy: administrador');
r = await pedir('GET', '/api/admin/administradores');
ok(r.status === 404, 'un administrador no ve la lista de administradores');

const nombre = `PRUEBA AUTOMÁTICA ${new Date().toISOString().slice(0, 16)}`;
r = await pedir('POST', '/api/admin/inventarios', { cuerpo: { nombre } });
ok(r.status === 201, `crear inventario de prueba (${r.status})`);
const inv = r.body.id;
const p1 = (await pedir('POST', `/api/admin/inventarios/${inv}/participantes`, { cuerpo: { nombre: 'Prueba Uno', pasillos: [pid('LA52')] } })).body;
const p2 = (await pedir('POST', `/api/admin/inventarios/${inv}/participantes`, { cuerpo: { nombre: 'Prueba Dos', pasillos: [pid('LA53')] } })).body;
ok(p1.token && p2.token, 'dos personas con enlace');
r = await pedir('GET', `/api/contar/${p1.token}`, { admin: false, cel: 'cel-uno-0001' });
ok(r.status === 200, 'el operador abre su enlace');
r = await pedir('GET', `/api/contar/${p1.token}`, { admin: false, cel: 'cel-intruso-01' });
ok(r.status === 423, 'el enlace queda amarrado al primer celular');
ok((await pedir('POST', `/api/admin/inventarios/${inv}/estado`, { cuerpo: { estado: 'en_curso' } })).status === 200, 'iniciar inventario');

async function contarTodo(token, cel, valor = () => '2') {
  let est = (await pedir('GET', `/api/contar/${token}`, { admin: false, cel })).body;
  for (const a of est.asignaciones.filter((x) => x.estado !== 'terminada')) {
    const casillas = a.modulos.flatMap((m) => a.colores.filter((c) => !a.celdas || a.celdas.includes(`${m}|${c.codigo}`)).map((c) => ({ modulo: m, color: c.codigo, expresion: valor(m, c.codigo) })));
    const g = await pedir('PUT', `/api/contar/${token}/asignaciones/${a.id}`, { admin: false, cel, cuerpo: { casillas } });
    if (g.status !== 200) console.log('  guardar:', g.status, JSON.stringify(g.body).slice(0, 200));
    est = (await pedir('POST', `/api/contar/${token}/asignaciones/${a.id}/terminar`, { admin: false, cel })).body;
  }
  return est;
}
await contarTodo(p1.token, 'cel-uno-0001');
let est = await contarTodo(p2.token, 'cel-dos-0002');
ok(est.asignaciones?.some((a) => a.tipo === 'verificacion' && a.pasillo.codigo === 'LA52'), 'al terminar le toca verificar el pasillo del compañero');
await contarTodo(p2.token, 'cel-dos-0002', (m, c) => (m === '004' && c === 'blanca' ? '7' : '2'));
await contarTodo(p1.token, 'cel-uno-0001');
r = await pedir('GET', `/api/admin/inventarios/${inv}/cruce/${pid('LA52')}`);
ok(r.body.estado === 'diferencias' && r.body.resumen.diferencia === 1, `cruce con 1 diferencia (${r.body.estado})`);
r = await pedir('GET', `/api/admin/inventarios/${inv}/cruce/${pid('LA53')}`);
ok(r.body.estado === 'cuadrado', 'el otro pasillo cuadra');
r = await pedir('GET', `/api/admin/inventarios/${inv}`);
ok(r.status === 200 && r.body.global.total > 0, `resumen: ${r.body.global?.total} estibas`);

r = await pedir('GET', `/api/admin/inventarios/${inv}/excel?elaboro=Prueba`);
const xls = r.body.archivo ? Buffer.from(r.body.archivo.base64, 'base64') : null;
ok(xls && xls.subarray(0, 2).toString() === 'PK', `Excel descargado (${xls ? xls.length : r.status} bytes) ${r.body.error || ''}`);
r = await pedir('GET', `/api/admin/inventarios/${inv}/dashboard?elaboro=Prueba`);
const html = r.body.archivo ? Buffer.from(r.body.archivo.base64, 'base64').toString() : '';
ok(html.includes('Según sistema vs contado'), `dashboard descargado (${html.length} letras)`);

r = await pedir('POST', '/api/admin/aura/chat', { cuerpo: { mensajes: [{ role: 'user', content: '¿Cómo va el inventario?' }], inventario_id: inv } });
ok(r.body.rapida && /Inventario abierto/.test(r.body.respuesta), 'Aura contesta al instante cómo va');
r = await pedir('POST', '/api/admin/aura/chat', { cuerpo: { mensajes: [{ role: 'user', content: '¿Qué pasillos tienen diferencias?' }], inventario_id: inv } });
ok(/LA52/.test(r.body.respuesta || ''), 'Aura dice qué pasillo tiene diferencias');
r = await pedir('POST', '/api/admin/aura/chat', { cuerpo: { mensajes: [{ role: 'user', content: 'cuál es el horario del montacargas eléctrico nocturno' }], inventario_id: inv } });
ok(r.body.copilot && /THEMENDO/.test(r.body.copilot.texto), 'lo que no sabe lo pasa a Copilot con el contexto');
r = await pedir('POST', '/api/admin/aura/vigilantes/revisar', { cuerpo: { inventario_id: inv } });
ok(r.body.alertas?.some((a) => a.tipo === 'diferencias_sin_reconteo'), 'los vigilantes ven la diferencia sin reconteo');

// Limpieza: cerrar y borrar el inventario de prueba (queda una copia en respaldos)
await pedir('POST', `/api/admin/inventarios/${inv}/estado`, { cuerpo: { estado: 'cerrado' } });
r = await pedir('DELETE', `/api/admin/inventarios/${inv}`, { cuerpo: { confirmar: nombre } });
ok(r.status === 200 && /^inventario-/.test(r.body.respaldo || ''), `inventario de prueba borrado con copia (${r.body.respaldo})`);
for (const o of (await pedir('GET', '/api/admin/operadores')).body.filter((x) => /^Prueba (Uno|Dos)$/.test(x.nombre))) await pedir('DELETE', `/api/admin/operadores/${o.id}`);
console.log(`\n${fallas ? `✗ ${fallas} revisión(es) fallaron` : '✓ Todo bien'} en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fallas ? 1 : 0);
