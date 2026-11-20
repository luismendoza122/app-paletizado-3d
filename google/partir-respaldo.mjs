// =====================================================================
//  Parte un respaldo grande en archivos que Google pueda importar
//
//  Apps Script no puede leer de una sola vez un archivo de mas de 50 MB.
//  Este script toma el JSON que sale de scripts/desde-csv-panel.mjs y lo
//  parte en recibo-importar-1.json, recibo-importar-2.json, ...
//
//  Uso:
//    node google/partir-respaldo.mjs respaldo/recibo-panel-20261119-2204.json
//
//  Luego sube cada parte a la carpeta "Seguimiento de Recibo" de Drive y
//  ejecuta en Apps Script: importarDesdeDrive('recibo-importar-1.json'),
//  despues la 2, y asi. Se pueden importar en cualquier orden.
// =====================================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const TOPE = 35 * 1024 * 1024 // 35 MB por parte, con margen

const entrada = process.argv[2]
if (!entrada) {
    console.error('Falta el archivo. Ejemplo:')
    console.error('  node google/partir-respaldo.mjs respaldo/recibo-panel-20261119-2204.json')
    process.exit(2)
}

const datos = JSON.parse(readFileSync(entrada, 'utf8'))
const docs = datos.recibo_docs || datos.docs || []
const equipo = datos.recibo_equipo || []
const miembros = datos.recibo_miembros || []

console.log('Documentos: ' + docs.length)
console.log('Personas  : ' + miembros.length)

// Se ordenan: primero lo liviano (config, articulos, planillas) y al final
// las fotos, que son las que hacen pesado el archivo.
const peso = (d) => JSON.stringify(d).length
const livianos = docs.filter((d) => d.coleccion !== 'fotos').sort((a, b) => peso(a) - peso(b))
const fotos = docs.filter((d) => d.coleccion === 'fotos')

const partes = []
let actual = []
let bytes = 0

function cerrar() {
    if (!actual.length) return
    partes.push(actual)
    actual = []
    bytes = 0
}

for (const d of [...livianos, ...fotos]) {
    const tam = peso(d)
    if (actual.length && bytes + tam > TOPE) cerrar()
    actual.push(d)
    bytes += tam
}
cerrar()

const carpeta = dirname(entrada)
const marca = basename(entrada).replace(/\.json$/i, '')

partes.forEach((lista, i) => {
    const nombre = 'recibo-importar-' + (i + 1) + '.json'
    const cuerpo = {
        formato: 2,
        origen: 'particion de ' + basename(entrada),
        generado: new Date().toISOString(),
        recibo_docs: lista,
        // El equipo y las personas van solo en la primera parte.
        recibo_equipo: i === 0 ? equipo : [],
        recibo_miembros: i === 0 ? miembros : [],
    }
    const texto = JSON.stringify(cuerpo)
    const destino = join(carpeta, nombre)
    writeFileSync(destino, texto, 'utf8')
    const cuenta = lista.reduce((m, d) => { m[d.coleccion] = (m[d.coleccion] || 0) + 1; return m }, {})
    console.log('')
    console.log(nombre + '  ' + (texto.length / 1024 / 1024).toFixed(1) + ' MB')
    for (const [k, v] of Object.entries(cuenta).sort()) console.log('  ' + k.padEnd(12) + v)
    if (i === 0) console.log('  (incluye equipo y personas)')
})

console.log('')
console.log('Sube las ' + partes.length + ' partes a la carpeta Seguimiento de Recibo de Drive')
console.log('y ejecuta en Apps Script: importarDesdeDrive("recibo-importar-1.json") y las demas.')
console.log('Archivo de referencia: ' + marca + '.json')
