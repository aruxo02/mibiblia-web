# Mi Biblia — web de la app

Página de presentación, política de privacidad, ayuda y fichas de las tiendas de la app
**Mi Biblia** para Android e iOS (`com.lopezotero.mibiblia`), publicada con GitHub Pages:

- Presentación: https://aruxo02.github.io/mibiblia-web/
- Política de privacidad: https://aruxo02.github.io/mibiblia-web/privacidad.html (la que abre la
  app en Ajustes › Apoya el mantenimiento y la que se da en las dos tiendas)
- Ayuda (URL de asistencia de Apple): https://aruxo02.github.io/mibiblia-web/ayuda.html
- Ficha para las tiendas: https://aruxo02.github.io/mibiblia-web/tienda/

Es de Mi Biblia, no de la app «Biblia de Jerusalén», que tiene su propia web
(aruxo02.github.io/biblia-jerusalen).

## Qué hay

| Ruta | Contenido |
| --- | --- |
| `index.html` | Presentación de la app |
| `privacidad.html` | Política de privacidad: el texto de `docs/privacidad.md` de la app, desde «Última actualización» |
| `ayuda.html` | Preguntas frecuentes y contacto |
| `404.html` | La página de «no existe» de GitHub Pages |
| `tienda/index.html` | Textos para copiar con su número de caracteres, respuestas a los cuestionarios de las dos tiendas y suscripciones de apoyo |
| `tienda/google-play/` | Icono de 512 × 512, gráfico destacado de 1024 × 500 y 8 capturas de teléfono de 1080 × 1920 |
| `tienda/app-store/iphone-6.9/` | 9 capturas de iPhone de 6,9″ (1320 × 2868) |
| `tienda/app-store/ipad-13/` | 9 capturas de iPad de 13″ (2064 × 2752) |
| `css/`, `fuentes/`, `img/` | Estilos, letras (Literata e Inter, licencia OFL) e imágenes; `img/capturas/` son las de la portada (webp) |
| `scripts/` | Los que hacen las imágenes, cuentan los caracteres y comprueban la web (abajo) |
| `.nojekyll` | Que GitHub Pages sirva los ficheros tal cual |

Es HTML estático, sin dependencias ni compilación: se edita el fichero y GitHub Pages lo
publica en un minuto. Todas las rutas son relativas, así que funciona bajo `/mibiblia-web/`; la
única excepción es `404.html`, que GitHub enseña en cualquier dirección y lleva
`<base href="/mibiblia-web/">` (si la web cambiara de dirección, hay que cambiar esa línea).

Los colores son los del icono y del estilo Básico de la app (`constants/brand.ts`): azul marino
`#033B76` / `#021F4B`, dorado `#F7B84B` y el rojo de la cinta `#E2383F`. La cabecera y la portada
van siempre en azul marino; el resto sigue el modo claro u oscuro del sistema.

## Activar GitHub Pages (una sola vez)

Settings → Pages → Build and deployment → Source: **Deploy from a branch** → Branch:
**main** y carpeta **/ (root)** → Save. El repositorio tiene que ser público (o de un plan que
permita Pages en privados).

## Cuando haya fichas en las tiendas

1. **Esta web:** en `index.html`, cambia los dos botones «Muy pronto» por los enlaces de Google
   Play y del App Store. Hay un comentario justo encima con el código: cada
   `<span class="boton pronto">` pasa a ser un `<a class="boton" href="…">`.
   - Google Play: `https://play.google.com/store/apps/details?id=com.lopezotero.mibiblia`
   - App Store: `https://apps.apple.com/app/id…`, con el número que da App Store Connect.
2. **La app:** en `/home/user/mibiblia/services/shareApp.ts`, pon el enlace de la App Store en
   `STORE_URLS.ios` (hasta entonces «Compartir la app» va sin enlace en iPhone). El de Google Play
   (`STORE_URLS.android`) ya está y funciona en cuanto la ficha se publica.
3. Si el nombre de la App Store acaba siendo otro (las alternativas están en la ficha), no hace
   falta cambiar nada aquí: la web habla de «Mi Biblia», que es el nombre de la app.

## Los textos de las fichas

Están en `tienda/index.html`, cada uno con su límite (`data-limite`). Después de cambiar uno:

```bash
node scripts/contar.mjs              # cuenta los caracteres y los apunta junto a cada texto
node scripts/contar.mjs --comprobar  # solo comprueba (falla si alguno pasa del límite)
```

Cuenta como las tiendas: caracteres, con espacios y saltos de línea.

## Regenerar las imágenes

Las capturas son de la app de verdad: su exportación web, fotografiada con el Chromium de
Playwright. El script es `scripts/capturas.mjs` y usa los `node_modules` de la app (aquí no hay
que instalar nada).

```bash
# 1. En la app, exportar la web (deja dist/, que git ignora)
cd /home/user/mibiblia && npx expo export -p web

# 2. Desde esta web, todas las imágenes (unos 5 minutos)
cd /home/user/mibiblia-web && node scripts/capturas.mjs

#    o solo una parte
node scripts/capturas.mjs --pasos capturas --solo 04-laudes,06-rosario --tamanos iphone,ipad
node scripts/capturas.mjs --pasos grafico,iconos

# 3. Borrar la exportación
rm -rf /home/user/mibiblia/dist
```

Qué hace:

- Sirve `dist/`, pasa la bienvenida eligiendo España y abre cada pantalla en el estilo Básico
  claro, el **domingo 1 de noviembre de 2026 (Todos los Santos) a las 8:15**, para que Inicio,
  Laudes, las lecturas y el Rosario tengan buen contenido. Quita el aviso de compartir la app
  (que sale dos días por semana) y no descarga noticias.
- Si una pantalla dice «Cargando», un error o enseña la bienvenida, se para.
- Fotografía cada tamaño a su resolución final, sin reescalar: la web a 2× (430 × 932 puntos),
  Google Play a 430 × 771, iPhone a 430 × 935 e iPad a 820 × 1063 puntos.
- Las de las tiendas llevan arriba un antetítulo en dorado y un titular en blanco sobre el
  degradado azul marino del icono, con la pantalla en un marco. Los titulares están en
  `PANTALLAS`, al principio del script; las rutas de cada pantalla, también.
- `--pasos iconos` saca `tienda/google-play/icono-512.png` de `assets/brand/icono-512.png` (opaco)
  y los iconos de la web de `assets/images/icon.png`; `--pasos grafico`, el gráfico destacado y
  su copia para las redes (`img/grafico.png`).

Las capturas sin componer quedan en `.crudas/` (ignorada por git).

## Comprobar la web

```bash
node scripts/comprobar.mjs [--capturas /tmp/web]
```

Sirve la web como GitHub Pages (bajo `/mibiblia-web/`, con su 404) y, a 390 y a 1280 px y en modo
claro y oscuro, pasa axe (WCAG 2.1 A y AA y buenas prácticas), mira que nada se salga a lo ancho y
que no haya enlaces internos rotos ni anclas sin destino. Con `--capturas` guarda una captura de
cada página.

Contacto: López Otero · moilopote@gmail.com
