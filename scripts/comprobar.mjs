#!/usr/bin/env node
/**
 * Comprueba la web antes de subirla: accesibilidad con axe, enlaces y cómo se ve.
 *
 *   node scripts/comprobar.mjs [--app ../mibiblia] [--capturas /ruta/carpeta]
 *
 * Sirve la web como GitHub Pages, bajo /mibiblia-web/ (las carpetas dan su index.html y lo que no
 * existe, 404.html con estado 404), y con el Chromium de Playwright:
 * - pasa axe (WCAG 2.1 A y AA y buenas prácticas) en cada página, a 390 y a 1280 px de ancho, en
 *   modo claro y oscuro;
 * - mira que cada enlace, imagen, hoja de estilos e icono interno exista, y que cada #ancla
 *   tenga su id; los enlaces externos solo se listan;
 * - con --capturas, guarda una captura de cada página entera a cada tamaño.
 * Playwright y @axe-core/playwright se cargan desde los node_modules de la app.
 */
import { createRequire } from 'module';
import { createReadStream, existsSync, mkdirSync, statSync } from 'fs';
import { createServer } from 'http';
import { dirname, extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const APP = resolve(WEB, arg('app', '../mibiblia'));
const CAPTURAS = arg('capturas', '');
const req = createRequire(join(APP, 'package.json'));
const { chromium } = req('playwright');
const { AxeBuilder } = req('@axe-core/playwright');

const BASE = '/mibiblia-web/';
const PAGINAS = ['', 'privacidad.html', 'ayuda.html', 'tienda/', 'no/existe/esto'];
const TAMANOS = [
  { nombre: '390', width: 390, height: 844 },
  { nombre: '1280', width: 1280, height: 800 },
];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const isFile = (p) => existsSync(p) && statSync(p).isFile();

/** Lo que GitHub Pages serviría en esa ruta, o null. */
function fichero(pathname) {
  if (!pathname.startsWith(BASE)) return null;
  const rel = decodeURIComponent(pathname.slice(BASE.length));
  const p = join(WEB, rel);
  if (!p.startsWith(WEB)) return null;
  if (isFile(p)) return p;
  if (isFile(join(p, 'index.html'))) return rel === '' || rel.endsWith('/') ? join(p, 'index.html') : null;
  if (isFile(`${p}.html`)) return `${p}.html`;
  return null;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // GitHub Pages añade la barra a las carpetas
  const sinBarra = join(WEB, decodeURIComponent(url.pathname.slice(BASE.length)));
  if (url.pathname.startsWith(BASE) && !url.pathname.endsWith('/') && isFile(join(sinBarra, 'index.html'))) {
    res.writeHead(301, { Location: url.pathname + '/' });
    return res.end();
  }
  const f = fichero(url.pathname);
  const file = f ?? join(WEB, '404.html');
  res.writeHead(f ? 200 : 404, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, ok));
const origen = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
let problemas = 0;
const externos = new Set();
const rotos = [];
if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });

for (const esquema of ['light', 'dark']) {
  for (const t of TAMANOS) {
    const context = await browser.newContext({ viewport: { width: t.width, height: t.height }, colorScheme: esquema, locale: 'es-ES' });
    const page = await context.newPage();
    const fallos = [];
    page.on('response', (r) => {
      const u = new URL(r.url());
      if (u.origin === origen && r.status() >= 400 && !u.pathname.includes('/no/existe/')) fallos.push(`${r.status()} ${u.pathname}`);
    });
    page.on('pageerror', (e) => fallos.push(`error: ${e.message}`));
    for (const ruta of PAGINAS) {
      const resp = await page.goto(origen + BASE + ruta, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const nombre = ruta.replace(/[/.]+/g, '_').replace(/_$/, '') || 'inicio';
      const etiqueta = `${esquema} ${t.nombre} /${ruta}`;
      for (const v of axe.violations) {
        problemas++;
        console.log(`✗ ${etiqueta}: ${v.id} (${v.impact}) ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      }
      if (scroll > 0) {
        problemas++;
        console.log(`✗ ${etiqueta}: se desplaza ${scroll} px a lo ancho`);
      }
      if (!axe.violations.length && scroll <= 0) console.log(`✓ ${etiqueta} (HTTP ${resp.status()})`);
      if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, `${nombre}.${t.nombre}.${esquema}.png`), fullPage: true });
      // enlaces (una vez basta)
      if (esquema === 'light' && t.nombre === '390') {
        const refs = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('a[href]').forEach((a) => out.push(['a', a.getAttribute('href'), a.href]));
          document.querySelectorAll('img[src]').forEach((i) => out.push(['img', i.getAttribute('src'), i.src]));
          document.querySelectorAll('link[href]').forEach((l) => out.push(['link', l.getAttribute('href'), l.href]));
          return { refs: out, ids: [...document.querySelectorAll('[id]')].map((e) => e.id) };
        });
        for (const [tipo, crudo, abs] of refs.refs) {
          const u = new URL(abs);
          if (u.protocol === 'mailto:') continue;
          if (u.origin !== origen) {
            externos.add(abs);
            continue;
          }
          if (!fichero(u.pathname)) rotos.push(`/${ruta}: ${tipo} ${crudo} → ${u.pathname}`);
          if (u.hash && u.pathname === new URL(page.url()).pathname && !refs.ids.includes(decodeURIComponent(u.hash.slice(1))))
            rotos.push(`/${ruta}: ancla ${crudo} sin id`);
          if (u.hash && u.pathname !== new URL(page.url()).pathname) {
            // ancla en otra página: se mira su HTML
            const otra = await context.newPage();
            await otra.goto(abs);
            if (!(await otra.$(`[id="${decodeURIComponent(u.hash.slice(1))}"]`))) rotos.push(`/${ruta}: ancla ${crudo} sin id`);
            await otra.close();
          }
        }
      }
    }
    for (const f of fallos) {
      problemas++;
      console.log(`✗ ${esquema} ${t.nombre}: ${f}`);
    }
    await context.close();
  }
}
await browser.close();
server.close();

console.log(`\nEnlaces internos rotos: ${rotos.length}`);
rotos.forEach((r) => console.log('  ✗ ' + r));
console.log(`Enlaces externos (no se comprueban aquí): ${externos.size}`);
[...externos].sort().forEach((e) => console.log('  · ' + e));
console.log(`\nProblemas de axe y de anchura: ${problemas}`);
process.exit(problemas || rotos.length ? 1 : 0);
