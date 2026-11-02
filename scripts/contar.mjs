#!/usr/bin/env node
/**
 * Cuenta los caracteres de los textos de tienda/index.html y apunta el total junto a cada uno.
 *
 *   node scripts/contar.mjs           cuenta, pone «N / máximo» en cada campo y lo lista
 *   node scripts/contar.mjs --comprobar   solo comprueba (falla si un número no está al día)
 *
 * Cada campo con límite es un <div class="campo" data-limite="N"> con su <input value="…"> o su
 * <textarea>…</textarea> y un <span class="cuenta">. Se cuenta como las tiendas: caracteres
 * (puntos de código), con los saltos de línea y los espacios, y las entidades HTML ya
 * convertidas. Si algún texto pasa de su límite, el script falla.
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'tienda', 'index.html');
const SOLO_COMPROBAR = process.argv.includes('--comprobar');

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodificar = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTIDADES[e.toLowerCase()] ?? m;
  });

const html = readFileSync(FILE, 'utf8');
const filas = [];
let mal = 0;
let desfasados = 0;
const nuevo = html.replace(/<div class="campo" data-limite="(\d+)">([\s\S]*?)\n\s*<\/div>/g, (bloque, lim, dentro) => {
  const limite = Number(lim);
  const id = dentro.match(/<label for="([^"]+)">([^<]*)<\/label>/);
  const input = dentro.match(/<input [^>]*value="([^"]*)"/);
  // el salto de línea justo después de <textarea> no cuenta (así lo lee el navegador)
  const area = dentro.match(/<textarea[^>]*>\n?([\s\S]*?)<\/textarea>/);
  const texto = decodificar(input ? input[1] : area ? area[1] : '');
  const n = [...texto].length;
  const cuenta = `${n} / ${limite}`;
  const antes = dentro.match(/<span class="cuenta">([^<]*)<\/span>/)?.[1];
  if (antes !== cuenta) desfasados++;
  if (n > limite) mal++;
  filas.push({ id: id?.[1], etiqueta: id?.[2], n, limite });
  return bloque.replace(/<span class="cuenta">[^<]*<\/span>/, `<span class="cuenta">${cuenta}</span>`);
});

for (const f of filas) {
  const marca = f.n > f.limite ? '✗' : '✓';
  console.log(`${marca} ${String(f.n).padStart(4)} / ${String(f.limite).padEnd(4)} ${f.id} (${f.etiqueta})`);
}
if (mal) {
  console.error(`\n${mal} textos pasan de su límite.`);
  process.exit(1);
}
if (SOLO_COMPROBAR) {
  if (desfasados) {
    console.error(`\n${desfasados} cuentas no están al día: node scripts/contar.mjs`);
    process.exit(1);
  }
  console.log('\nTodas las cuentas están al día.');
} else {
  if (nuevo !== html) writeFileSync(FILE, nuevo);
  console.log(`\n${filas.length} textos contados${nuevo !== html ? ' y apuntados en tienda/index.html' : ''}.`);
}
