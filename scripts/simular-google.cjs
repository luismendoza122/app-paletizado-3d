// Simula Google (Apps Script + Drive) para probar el código del puente que genera la app.
// node scripts/simular-google.cjs <codigo-del-puente.gs> <puerto> [url-para-verificar]
// (solo para pruebas: Drive en memoria; UrlFetchApp con curl)
const http = require('http'); const fs = require('fs'); const vm = require('vm'); const crypto = require('crypto'); const { execFileSync } = require('child_process');
const [, , archivoCodigo, puerto = '3200', verificarEn] = process.argv;
const carpetas = new Map(); // id → { nombre, archivos: [] , padre }
const archivos = [];
function carpeta(id) { if (!carpetas.has(id)) carpetas.set(id, { nombre: 'Carpeta ' + id.slice(0, 6), padre: null }); const c = carpetas.get(id);
  return { getId: () => id, getName: () => c.nombre, getUrl: () => 'https://drive.google.com/drive/folders/' + id, getParents: () => { let d = !!c.padre; return { hasNext: () => d, next: () => { d = false; return carpeta(c.padre); } }; },
    getFilesByName: (n) => { const l = archivos.filter((a) => a.carpeta === id && a.nombre === n && !a.papelera); let i = 0; return { hasNext: () => i < l.length, next: () => { const a = l[i++]; return { setTrashed: (v) => { a.papelera = v; } }; } }; },
    createFile: (blob) => { const a = { id: 'f' + (archivos.length + 1), carpeta: id, nombre: blob.nombre, tipo: blob.tipo, bytes: blob.bytes, papelera: false }; archivos.push(a); return { getId: () => a.id, getName: () => a.nombre, getUrl: () => 'https://drive.google.com/file/d/' + a.id }; } };
}
const cache = new Map();
const ctx = {
  DriveApp: { getFolderById: (id) => { if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) throw new Error('No existe'); return carpeta(id); } },
  Utilities: { base64Decode: (s) => [...Buffer.from(s, 'base64')], newBlob: (bytes, tipo, nombre) => ({ bytes: Buffer.from(bytes), tipo, nombre }),
    computeDigest: (_a, t) => [...crypto.createHash('sha256').update(t).digest()], base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64url'), DigestAlgorithm: { SHA_256: 'sha256' } },
  CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) || null, put: (k, v) => cache.set(k, v) }) },
  UrlFetchApp: { fetch: (url, op) => {
    const args = ['-s', '-o', '-', '-w', '\n%{http_code}', '-X', (op.method || 'get').toUpperCase(), url];
    for (const [k, v] of Object.entries(op.headers || {})) args.push('-H', `${k}: ${v}`);
    if (op.payload) args.push('-H', 'Content-Type: ' + (op.contentType || 'application/json'), '--data-binary', op.payload);
    const out = execFileSync('curl', args, { encoding: 'utf8' }); const i = out.lastIndexOf('\n');
    return { getResponseCode: () => Number(out.slice(i + 1)), getContentText: () => out.slice(0, i) };
  } },
  ContentService: { createTextOutput: (t) => ({ texto: t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
};
vm.createContext(ctx); vm.runInContext(fs.readFileSync(archivoCodigo, 'utf8'), ctx);
if (verificarEn) vm.runInContext(`VERIFICAR.url = ${JSON.stringify(verificarEn)};`, ctx);
http.createServer((req, res) => {
  let cuerpo = ''; req.on('data', (d) => { cuerpo += d; }); req.on('end', () => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (req.url.startsWith('/_estado')) { res.writeHead(200, cors); return res.end(JSON.stringify({ archivos: archivos.map(({ bytes, ...a }) => ({ ...a, tam: bytes.length })) })); }
    try {
      const out = req.method === 'GET' ? ctx.doGet() : ctx.doPost({ postData: { contents: cuerpo } });
      res.writeHead(200, cors); res.end(out.texto);
    } catch (e) { res.writeHead(500, cors); res.end(JSON.stringify({ error: { message: String(e) } })); }
  });
}).listen(Number(puerto), () => console.log('Google simulado en', puerto));
