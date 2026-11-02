#!/usr/bin/env node
/**
 * Imágenes de la web y de las fichas de Mi Biblia, sacadas de la app de verdad.
 *
 * 1. En la app (/home/user/mibiblia), exportar la web:   npx expo export -p web
 *    (deja dist/, que git ignora; se puede borrar al acabar).
 * 2. Desde esta web:   node scripts/capturas.mjs [--app ../mibiblia] [--solo 01-inicio,04-laudes]
 *                      [--pasos capturas,grafico,iconos] [--tamanos web,google-play,iphone,ipad]
 *
 * Sirve dist/ con las cabeceras que necesita expo-sqlite en el navegador (como
 * scripts/a11y/axe.mjs de la app), pasa la bienvenida (España) y fotografía cada pantalla con el
 * Chromium de Playwright, en el estilo Básico claro, el domingo 1 de noviembre de 2026 (Todos los
 * Santos) a las 8:15. Playwright se carga desde los node_modules de la app: aquí no hay que
 * instalar nada.
 *
 * Pasos:
 * - capturas: las de la web (img/capturas/*.webp, la pantalla sola) y las de las tiendas, con un
 *   titular arriba sobre el azul marino de la marca (tienda/google-play/capturas,
 *   tienda/app-store/iphone-6.9 y tienda/app-store/ipad-13). Cada tamaño se fotografía a su
 *   resolución, sin reescalar.
 * - grafico: el gráfico destacado de Google Play (1024 × 500) y su copia para las redes
 *   (img/grafico.png).
 * - iconos: el de Google Play (512 × 512, opaco) y los de la web, desde los PNG del icono de la app.
 */
import { createRequire } from 'module';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import { dirname, extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
const APP = resolve(WEB, arg('app', '../mibiblia'));
const DIST = join(APP, 'dist');
const SOLO = list(arg('solo', ''));
const PASOS = list(arg('pasos', 'capturas,grafico,iconos'));
const TAMANOS = list(arg('tamanos', 'web,google-play,iphone,ipad'));
const { chromium } = createRequire(join(APP, 'package.json'))('playwright');

/** El día de las capturas: domingo, solemnidad de Todos los Santos, a la hora de Laudes. */
const AHORA = new Date('2026-11-01T08:15:00+01:00');

/**
 * Las pantallas, en el orden de las fichas. `titulo` y `antetitulo` son los de las tiendas;
 * `google` dice si va en Google Play, que admite 8 capturas de teléfono (la App Store, 10).
 */
const PANTALLAS = [
  { id: '01-inicio', ruta: '/', antetitulo: 'Mi Biblia', titulo: 'La Palabra y la liturgia de cada día', google: true },
  { id: '02-biblia', ruta: '/biblia/leer?b=22&c=23', antetitulo: 'La Biblia', titulo: 'La Biblia de Jerusalén, completa', google: true },
  { id: '03-versiculo', ruta: '/biblia/versiculo?osis=Matt.5.3', antetitulo: 'Notas', titulo: 'Cada versículo, con sus notas', google: true },
  { id: '04-laudes', ruta: '/liturgia/hora/laudes', antetitulo: 'Liturgia de las Horas', titulo: 'Reza con la Iglesia cada día', google: true },
  { id: '05-lecturas', ruta: '/liturgia/lecturas', antetitulo: 'Misa', titulo: 'Las lecturas de la Misa de hoy', google: true },
  { id: '06-rosario', ruta: '/oracion/rosario', antetitulo: 'Oración', titulo: 'El Santo Rosario, guiado', google: true, ajuste: 'verSiguiente' },
  { id: '07-comparar', ruta: '/estudio/comparar?osis=Matt.5.3', antetitulo: 'Estudio', titulo: 'Compara los evangelios', google: true },
  { id: '08-mapa', ruta: '/biblia/mapa/palestina-nt', antetitulo: 'Mapas', titulo: 'Sitúa cada pasaje en su tierra', google: true, ajuste: 'mapaDesdeGalilea' },
  { id: '09-utilidades', ruta: '/utilidades', antetitulo: 'Y mucho más', titulo: 'Gratis, sin anuncios y sin registro', google: false },
].filter((p) => !SOLO.length || SOLO.includes(p.id));

/**
 * Cada tamaño: el lienzo final y la pantalla de la app que va dentro. La pantalla se fotografía a
 * `escala` píxeles por punto, para que salga a su tamaño final sin reescalar.
 * - web: la pantalla sola, a 2× (img/capturas, webp).
 * - google-play: 1080 × 1920 (9:16). 1080 × 2400 no vale: Google no admite que el lado largo
 *   pase del doble del corto.
 * - iphone: 1320 × 2868, el de los iPhone de 6,9″ (App Store Connect admite también 1290 × 2796).
 * - ipad: 2064 × 2752, el del iPad de 13″.
 */
const TAMANOS_DEF = {
  web: { ancho: 430, alto: 932, escala: 2, salida: 'img/capturas', ext: 'webp' },
  'google-play': {
    lienzo: [1080, 1920], ancho: 430, marco: { x: 120, y: 368, w: 840, h: 1488 }, letra: 72, ante: 30, arriba: 92,
    salida: 'tienda/google-play/capturas', ext: 'png', solo: (p) => p.google,
  },
  iphone: {
    lienzo: [1320, 2868], ancho: 430, marco: { x: 130, y: 500, w: 1060, h: 2270 }, letra: 92, ante: 38, arriba: 140,
    salida: 'tienda/app-store/iphone-6.9', ext: 'png',
  },
  ipad: {
    lienzo: [2064, 2752], ancho: 820, radio: 0.035, marco: { x: 212, y: 520, w: 1640, h: 2112 }, letra: 112, ante: 46, arriba: 150,
    salida: 'tienda/app-store/ipad-13', ext: 'png',
  },
};
for (const t of Object.values(TAMANOS_DEF)) {
  if (!t.marco) continue;
  // el borde del marco (el «móvil») y la pantalla de dentro, que se fotografía a su medida
  t.bisel = Math.round(t.marco.w * 0.014);
  t.escala = (t.marco.w - 2 * t.bisel) / t.ancho;
  t.alto = Math.round((t.marco.h - 2 * t.bisel) / t.escala);
}

// ------------------------------------------------------------------ servir la exportación

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.ico': 'image/x-icon', '.wav': 'audio/wav',
};
const isFile = (p) => existsSync(p) && statSync(p).isFile();

/** La página HTML de una ruta: exacta, índice de carpeta o la de un segmento dinámico. */
function htmlFor(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const exact = join(DIST, ...parts);
  for (const c of [`${exact}.html`, join(exact, 'index.html')]) if (isFile(c)) return c;
  let dir = DIST;
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    const plain = join(dir, parts[i]);
    if (!last && existsSync(plain) && statSync(plain).isDirectory()) {
      dir = plain;
      continue;
    }
    const entries = existsSync(dir) ? readdirSync(dir) : [];
    const dyn = entries.find((e) => (last ? /^\[.+\]\.html$/ : /^\[.+\]$/).test(e));
    if (!dyn) break;
    if (last) return join(dir, dyn);
    dir = join(dir, dyn);
  }
  return join(DIST, 'index.html');
}

function servir() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const asset = join(DIST, path);
    const file = isFile(asset) ? asset : htmlFor(path);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      // expo-sqlite en la web usa SharedArrayBuffer
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cache-Control': 'no-cache',
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, () => ok(server)));
}

// ------------------------------------------------------------------ la app

/** Espera a que la app haya pintado y no quede nada cargando. */
async function asentar(page) {
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await page
    .waitForFunction(() => document.querySelector('[role="button"],[role="heading"],[role="tab"]'), null, { timeout: 600_000 })
    .catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[role="progressbar"]'), null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

/** La bienvenida (España), y que no salga el aviso de compartir la app (sale 2 días por semana). */
async function preparar(page, base) {
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await asentar(page);
  const spain = page.getByRole('radio', { name: /España/ }).or(page.getByRole('button', { name: /España/ })).first();
  if (!(await spain.isVisible().catch(() => false))) throw new Error('No se ve «España» en la bienvenida');
  await spain.click();
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(800);
    const start = page.getByRole('button', { name: 'Empezar', exact: true });
    if (await start.isVisible().catch(() => false)) {
      await start.click();
      break;
    }
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  }
  await asentar(page);
  await page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem('ajustes'));
    // la semana del 26 de octubre ya tiene sus dos días de aviso: el domingo 1 no sale
    a.state.shareBanner = { week: '2026-10-26', days: ['2026-10-26', '2026-10-27'] };
    a.state.theme = 'basico';
    localStorage.setItem('ajustes', JSON.stringify(a));
  });
}

/**
 * Lo que se hace en una pantalla antes de fotografiarla, como lo haría quien la usa: desplazarla un
 * poco para que se vea entera la parte importante.
 */
const AJUSTES = {
  /** Rosario: que se vea entero el botón «Siguiente» (en los móviles más bajos queda debajo). */
  verSiguiente: () => {
    const desplazable = (e) => e.scrollHeight > e.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY);
    const b = [...document.querySelectorAll('[role="button"]')].find((e) => e.textContent.trim() === 'Siguiente');
    if (!b) return;
    const falta = b.getBoundingClientRect().bottom - (window.innerHeight - 20);
    let s = b.parentElement;
    while (s && !desplazable(s)) s = s.parentElement;
    if (s && falta > 0) s.scrollTop += falta;
  },
  /**
   * Mapa de Palestina: de Galilea a Jerusalén (de partida se abre por el centro y, en los móviles
   * más bajos, Galilea queda cortada arriba). Si no cabe todo, manda Galilea.
   */
  mapaDesdeGalilea: () => {
    const desplazable = (e) => e.scrollHeight > e.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY);
    const rotulo = (nombre) => [...document.querySelectorAll('text')].find((e) => e.textContent.trim().toLowerCase() === nombre);
    const galilea = rotulo('galilea');
    const jerusalen = rotulo('jerusalén');
    if (!galilea || !jerusalen) return;
    let s = galilea.parentElement;
    while (s && !desplazable(s)) s = s.parentElement;
    if (!s) return;
    const y = (e, lado) => e.getBoundingClientRect()[lado] - s.getBoundingClientRect().top + s.scrollTop;
    const arriba = y(galilea, 'top') - 14;
    const abajo = y(jerusalen, 'bottom') + 14;
    s.scrollTop = Math.max(0, Math.min(arriba, (arriba + abajo) / 2 - s.clientHeight / 2));
  },
};

/** Lo que no debe salir en una captura. */
const MAL = /cargando|se ha producido un error|algo ha fallado|no se ha podido|sin conexión|quieres colaborar/i;

async function fotografiar(browser, base, nombre, crudas) {
  const t = TAMANOS_DEF[nombre];
  const context = await browser.newContext({
    viewport: { width: t.ancho, height: t.alto },
    deviceScaleFactor: t.escala,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    reducedMotion: 'reduce',
    colorScheme: 'light',
  });
  await context.clock.setFixedTime(AHORA);
  // las noticias no se pueden descargar desde aquí (CORS): que no lo intente
  await context.route(/vaticannews|vatican\.va/, (r) => r.abort());
  const page = await context.newPage();
  const fallos = [];
  page.on('pageerror', (e) => fallos.push(e.message));
  await preparar(page, base);
  const hechas = [];
  for (const p of PANTALLAS) {
    if (t.solo && !t.solo(p)) continue;
    await page.goto(base + p.ruta, { waitUntil: 'domcontentloaded' });
    await asentar(page);
    const ruta = new URL(page.url()).pathname;
    if (ruta === '/bienvenida') throw new Error(`${p.id}: sale la bienvenida`);
    const texto = await page.evaluate(() => document.body.innerText);
    const mal = texto.match(MAL);
    if (mal) throw new Error(`${p.id} (${nombre}): la pantalla dice «${mal[0]}»`);
    if (p.ajuste) {
      await page.evaluate(AJUSTES[p.ajuste]);
      await page.waitForTimeout(700);
    }
    const file = join(crudas, `${nombre}-${p.id}.png`);
    await page.screenshot({ path: file });
    hechas.push({ p, file });
    console.log(`  ${nombre} ${p.id} (${t.ancho}×${t.alto} a ${t.escala.toFixed(3)}×)`);
  }
  if (fallos.length) console.warn(`  avisos de la página en ${nombre}:`, fallos.slice(0, 3));
  await context.close();
  return hechas;
}

// ------------------------------------------------------------------ composiciones

const dataUrl = (file, type) => `data:${type};base64,${readFileSync(file).toString('base64')}`;

function fuentes() {
  const f = (n) => dataUrl(join(WEB, 'fuentes', n), 'font/woff2');
  return `
    @font-face { font-family: Literata; font-weight: 400; src: url(${f('literata-400.woff2')}); }
    @font-face { font-family: Literata; font-weight: 400; font-style: italic; src: url(${f('literata-400i.woff2')}); }
    @font-face { font-family: Literata; font-weight: 600; src: url(${f('literata-600.woff2')}); }
    @font-face { font-family: Inter; font-weight: 400; src: url(${f('inter-400.woff2')}); }
    @font-face { font-family: Inter; font-weight: 600; src: url(${f('inter-600.woff2')}); }`;
}

/** El fondo de la marca: el degradado azul marino del icono, más claro arriba, como su luz. */
const FONDO = `
  radial-gradient(ellipse 75% 36% at 50% 0%, rgba(132, 172, 232, 0.34), rgba(132, 172, 232, 0) 100%),
  linear-gradient(180deg, #054A8E 0%, #033B76 34%, #021F4B 100%)`;

const escapar = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function htmlTienda(t, p, img) {
  const [W, H] = t.lienzo;
  const m = t.marco;
  const radio = Math.round(m.w * (t.radio ?? 0.075));
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${fuentes()}
    html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
    body { background: ${FONDO}; position: relative; -webkit-font-smoothing: antialiased; }
    .cabeza { position: absolute; left: ${Math.round(W * 0.07)}px; right: ${Math.round(W * 0.07)}px; top: ${t.arriba}px;
      height: ${m.y - t.arriba - Math.round(t.letra * 0.55)}px; display: flex; flex-direction: column; align-items: center;
      justify-content: center; text-align: center; }
    .ante { font: 600 ${t.ante}px/1.2 Inter, sans-serif; letter-spacing: 0.16em; text-transform: uppercase; color: #F7B84B;
      margin: 0 0 ${Math.round(t.ante * 0.6)}px; }
    h1 { font: 600 ${t.letra}px/1.12 Literata, serif; color: #FFFFFF; margin: 0; text-wrap: balance; letter-spacing: -0.005em; }
    .marco { position: absolute; left: ${m.x}px; top: ${m.y}px; width: ${m.w}px; height: ${m.h}px; box-sizing: border-box;
      padding: ${t.bisel}px; border-radius: ${radio}px; background: #06152F;
      box-shadow: 0 0 0 ${Math.max(2, Math.round(t.bisel / 5))}px rgba(255, 255, 255, 0.16), 0 ${Math.round(m.w * 0.05)}px ${Math.round(m.w * 0.1)}px rgba(0, 8, 24, 0.55); }
    .marco img { display: block; width: 100%; height: 100%; border-radius: ${radio - t.bisel}px; }
  </style></head><body>
    <div class="cabeza"><p class="ante">${escapar(p.antetitulo)}</p><h1>${escapar(p.titulo)}</h1></div>
    <div class="marco"><img src="${img}" alt=""></div>
  </body></html>`;
}

/** Gráfico destacado: lo importante, en el centro (Google lo recorta por los lados en algunos sitios). */
function htmlGrafico(icono) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${fuentes()}
    html, body { margin: 0; width: 1024px; height: 500px; overflow: hidden; }
    body { -webkit-font-smoothing: antialiased; display: flex; align-items: center; justify-content: center; gap: 44px;
      background:
        radial-gradient(circle 320px at 275px 250px, rgba(132, 172, 232, 0.30), rgba(132, 172, 232, 0) 100%),
        linear-gradient(160deg, #054A8E 0%, #033B76 40%, #021F4B 100%); }
    img { width: 196px; height: 196px; border-radius: 44px;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.14), 0 18px 40px rgba(0, 8, 24, 0.5); }
    h1 { font: 600 88px/1 Literata, serif; color: #FFFFFF; margin: 0 0 18px; letter-spacing: -0.01em; }
    p { font: italic 400 29px/1.35 Literata, serif; color: #E3EAF6; margin: 0; }
    .sello { font: 600 17px/1 Inter, sans-serif; letter-spacing: 0.16em; text-transform: uppercase; color: #F7B84B; margin-top: 22px; font-style: normal; }
  </style></head><body>
    <img src="${icono}" alt="">
    <div><h1>Mi Biblia</h1><p>La Biblia de Jerusalén y la liturgia<br>de cada día</p><p class="sello">Sin anuncios · Sin registro</p></div>
  </body></html>`;
}

async function componer(browser, hechas, nombre) {
  const t = TAMANOS_DEF[nombre];
  const page = await browser.newPage({ viewport: t.lienzo ? { width: t.lienzo[0], height: t.lienzo[1] } : { width: 800, height: 600 } });
  for (const { p, file } of hechas) {
    const out = join(WEB, t.salida, `${p.id}.${t.ext}`);
    mkdirSync(dirname(out), { recursive: true });
    if (t.ext === 'webp') {
      const b64 = await page.evaluate(async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        return c.toDataURL('image/webp', 0.82).split(',')[1];
      }, dataUrl(file, 'image/png'));
      writeFileSync(out, Buffer.from(b64, 'base64'));
    } else {
      await page.setContent(htmlTienda(t, p, dataUrl(file, 'image/png')));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(200);
      await page.screenshot({ path: out });
    }
    console.log(`  → ${t.salida}/${p.id}.${t.ext}`);
  }
  await page.close();
}

/** Redimensiona un PNG en el navegador, a pasos (mejor que de una vez), y lo devuelve en PNG. */
async function redimensionar(page, src, lado, { redondo = 0 } = {}) {
  const b64 = await page.evaluate(
    async ({ src, lado, redondo }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      let lienzo = img;
      let w = img.naturalWidth;
      while (w / 2 >= lado) {
        w = Math.round(w / 2);
        const c = document.createElement('canvas');
        c.width = c.height = w;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(lienzo, 0, 0, w, w);
        lienzo = c;
      }
      const c = document.createElement('canvas');
      c.width = c.height = lado;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      if (redondo) {
        g.beginPath();
        g.roundRect(0, 0, lado, lado, lado * redondo);
        g.clip();
      }
      g.drawImage(lienzo, 0, 0, lado, lado);
      return c.toDataURL('image/png').split(',')[1];
    },
    { src, lado, redondo },
  );
  return Buffer.from(b64, 'base64');
}

async function iconos(browser) {
  const page = await browser.newPage();
  const icono = dataUrl(join(APP, 'assets/images/icon.png'), 'image/png');
  // Google Play: el de 512 de la app, a sangre; el PNG del lienzo es de 32 bits y todo opaco
  writeFileSync(join(WEB, 'tienda/google-play/icono-512.png'), await redimensionar(page, dataUrl(join(APP, 'assets/brand/icono-512.png'), 'image/png'), 512));
  // la web: cuadrados (iOS y la página redondean las esquinas) y el de la pestaña, redondeado
  for (const lado of [180, 192, 512]) writeFileSync(join(WEB, `img/icono-${lado}.png`), await redimensionar(page, icono, lado));
  writeFileSync(join(WEB, 'img/icono-32.png'), await redimensionar(page, icono, 32, { redondo: 0.22 }));
  await page.close();
  console.log('  → tienda/google-play/icono-512.png, img/icono-{32,180,192,512}.png');
}

async function grafico(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await page.setContent(htmlGrafico(dataUrl(join(WEB, 'img/icono-512.png'), 'image/png')));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(WEB, 'tienda/google-play/grafico-destacado-1024x500.png') });
  await page.screenshot({ path: join(WEB, 'img/grafico.png') });
  await page.close();
  console.log('  → tienda/google-play/grafico-destacado-1024x500.png, img/grafico.png');
}

// ------------------------------------------------------------------

async function main() {
  const browser = await chromium.launch();
  if (PASOS.includes('iconos')) await iconos(browser);
  if (PASOS.includes('grafico')) await grafico(browser);
  if (PASOS.includes('capturas')) {
    if (!isFile(join(DIST, 'index.html'))) throw new Error(`No está la web exportada en ${DIST}: npx expo export -p web`);
    const server = await servir();
    const base = `http://localhost:${server.address().port}`;
    const crudas = join(WEB, '.crudas');
    mkdirSync(crudas, { recursive: true });
    for (const nombre of TAMANOS) {
      console.log(nombre);
      const hechas = await fotografiar(browser, base, nombre, crudas);
      await componer(browser, hechas, nombre);
    }
    server.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
