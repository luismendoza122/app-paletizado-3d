// Arma la copia corporativa de Paletizado 3D (se abre con PowerShell, sin instalar nada).
// Uso:  npm run build  y luego  node scripts/armar-corporativo.mjs
// Resultado: salida/Paletizado3D-Corporativo/  (app + lanzador + ficha para TI + agente de Copilot)
// La app original (www/) no se toca: se copia tal cual, sin las páginas que viven solo en la web.
import { cpSync, mkdirSync, existsSync, rmSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(raiz, 'www');
const salida = join(raiz, 'salida', 'Paletizado3D-Corporativo');
const SOLO_WEB = ['recibo', 'themendo', 'inventario'];

if (!existsSync(join(www, 'vendor', 'three', 'three.module.js')) || !existsSync(join(www, 'vendor', 'xlsx.full.min.js'))) {
  throw new Error('Falta www/vendor. Corre primero: npm install  y  npm run build');
}

rmSync(salida, { recursive: true, force: true });
mkdirSync(salida, { recursive: true });

// 1) Lanzador, núcleo, ficha de TI y Copilot
cpSync(join(raiz, 'corporativo'), salida, { recursive: true, filter: (r) => !r.endsWith('.gitattributes') });

// 2) La app, igual a la original
cpSync(www, join(salida, 'app'), {
  recursive: true,
  filter: (r) => !SOLO_WEB.some((c) => r === join(www, c) || r.startsWith(join(www, c) + sep)),
});

// 3) Conocimiento del agente de Copilot: la misma biblioteca de ayuda que trae la app
const { BIBLIOTECA } = await import(new URL('../www/js/biblioteca.js', import.meta.url));
const temas = [...new Set(BIBLIOTECA.map((f) => f.tema))];
const md = ['# Conocimiento de Paletizado 3D (CEDI)', '',
  'Sale de la biblioteca de ayuda de la app. Úsalo para responder sobre la app y las reglas del CEDI.', ''];
for (const t of temas) {
  md.push(`## ${t}`, '');
  for (const f of BIBLIOTECA.filter((x) => x.tema === t)) md.push(`### ${f.titulo}`, '', ...f.texto.map((p) => p + '\n'));
}
writeFileSync(join(salida, 'copilot', 'conocimiento-paletizado.md'), md.join('\n'));

// 4) PowerShell 5.1 y el Bloc de notas necesitan UTF-8 con BOM para leer bien las tildes
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const todos = (dir) => readdirSync(dir).flatMap((n) => {
  const r = join(dir, n);
  return statSync(r).isDirectory() ? todos(r) : [r];
});
for (const f of todos(salida).filter((f) => f.endsWith('.ps1') || f.endsWith('.txt'))) {
  let b = readFileSync(f);
  if (!b.subarray(0, 3).equals(BOM)) b = Buffer.concat([BOM, b]);
  // Saltos de línea de Windows
  const t = b.toString('utf8').replace(/\r?\n/g, '\r\n');
  writeFileSync(f, t, 'utf8');
}

// 5) Huellas SHA-256 de todo lo que se ejecuta o se entrega (TI puede revisarlas)
const version = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).version + '-corp.1';
const revisar = todos(salida).filter((f) => !f.includes(`${sep}TI${sep}`) && !f.endsWith('configuracion.json'));
const archivos = revisar.map((f) => ({
  ruta: relative(salida, f).split(sep).join('/'),
  bytes: statSync(f).size,
  sha256: createHash('sha256').update(readFileSync(f)).digest('hex'),
})).sort((a, b) => a.ruta.localeCompare(b.ruta));
mkdirSync(join(salida, 'TI'), { recursive: true });
writeFileSync(join(salida, 'TI', 'integridad.json'), JSON.stringify({ app: 'paletizado-3d-corporativo', version, archivos }, null, 2));

console.log(`Listo: ${relative(raiz, salida)} (${archivos.length} archivos con huella, versión ${version})`);
