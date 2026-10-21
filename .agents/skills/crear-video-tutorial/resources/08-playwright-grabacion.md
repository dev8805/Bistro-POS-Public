# Grabación automatizada con Playwright

Guía técnica del flujo de grabación de pantalla. **Actualizada julio 2026 —
splash como marcador de carga.**

---

## 🎯 Qué hace Playwright en este flujo

Playwright lanza Chromium usando un perfil persistente donde ya está iniciada
la sesión de Bistro, graba el video nativo (`recordVideo`) mientras ejecuta las
acciones del guion, y luego post-procesa con ffmpeg para reducir flicker.

**Estrategia para ocultar la carga de la página:**

```
┌─────────────────────────────────────────────────────────────────┐
│  CHROMIUM ABRE CON recordVideo                                  │
│                                                                 │
│  1. goto(url) + inyectar SPLASH inmediatamente                  │
│     ┌──────────────────────────┐                                │
│     │  █████████████████████   │  ← Splash oscuro con título    │
│     │   "Cómo cambiar tu PIN"  │     cubre TODA la pantalla     │
│     │       Bistro POS         │     (la carga ocurre detrás)   │
│     └──────────────────────────┘                                │
│                                                                 │
│  2. Esperar sidebar visible (app lista detrás del splash)       │
│  3. Desactivar animaciones CSS                                  │
│  4. Esperar 2s (estabilizar encoder)                            │
│  5. QUITAR SPLASH → este frame es el SEGUNDO 0 del video final  │
│                                                                 │
│  6. Acciones del guion (B1, B2, B3...)                          │
│  7. Cerrar contexto → video se guarda                           │
│                                                                 │
│  8. TRIM con re-encode preciso: corta todo antes del splash     │
│     removido (H.264 → corte exacto al frame, no keyframes)     │
│  9. Anti-flicker (hqdn3d) → MP4 final                          │
└─────────────────────────────────────────────────────────────────┘
```

El `splashTitle` se pasa como parámetro a `launchChromeWithProfile()`. Cada
video tiene su propio título en el splash.

**Ventajas de esta estrategia:**

- ✅ Una sola apertura (no precarga) — más rápido
- ✅ La carga NUNCA aparece en el video final (el splash la tapa)
- ✅ Trim preciso con re-encode (no depende de keyframes de WebM)
- ✅ El splash sirve como indicador visual de "ya cargó" durante el desarrollo
- ✅ 24-30 fps consistente
- ✅ Reproducible y escalable

---

## 🏗️ Estructura de archivos

```
Bistro/
├── .video-tools/                          ← aislado del proyecto
│   ├── package.json
│   ├── node_modules/                      ← Playwright + Chromium (~200 MB)
│   ├── shared/
│   │   ├── launch-chrome.mjs              ← lanza perfil + recordVideo + trim + post-proceso
│   │   ├── recorder.mjs                   ← logger de eventos
│   │   ├── fake-cursor.mjs                ← cursor SVG visible
│   │   └── safe-actions.mjs              ← safeClick, assertState, debugScreenshot
│   └── scripts/
│       ├── test-session.mjs               ← verifica sesión (sin grabar)
│       ├── cambiar-pin.mjs                ← script del primer video
│       └── [modulo].mjs                   ← 1 script por video
└── (scripts generan archivos FUERA del repo)

C:\Users\HP\OneDrive\Escritorio\TutorialesBistro\
└── [modulo]/
    ├── 01-plan.md
    ├── 02-guion.md
    ├── 03-checklist.md
    └── grabaciones/
        ├── pantalla.mp4               ← video final (publicar este)
        ├── pantalla-final.mp4         ← video con overlays incrustados
        ├── narracion.wav              ← audio TTS completo
        ├── tts/b1.wav...bN.wav        ← audio por bloque
        ├── overlays/*.webm            ← overlays HyperFrames
        ├── raw/*.webm                 ← WebM crudo de Playwright
        └── debug/                     ← screenshots si algo falla
```

---

## ⚙️ Configuración técnica (fija, ya implementada)

| Parámetro | Valor | Por qué |
|-----------|-------|---------|
| URL | `https://posbistro.online` | Producción, CDN, sin túnel |
| Perfil | `bistro-recording-profile` | Sesión persistente de Firebase Auth |
| Resolución | 1366x720 | Pantalla del usuario (1366x768) menos 48px de chrome del navegador |
| Framerate | 24fps (Playwright) → 30fps (ffmpeg) | Playwright graba a 24fps; ffmpeg lo normaliza a 30fps |
| Codec salida | H.264 (MP4) | Compatible con todos los players y editores |
| Anti-flicker | `hqdn3d` (spatial 3 + temporal 4) | Reduce parpadeos sin borronear textos |
| CRF | 18 | Alta calidad, visualmente sin pérdida |
| Cursor | SVG negro 40x40 inyectado via `page.evaluate` | Se mueve con 20 steps + 600ms de espera antes del click |
| Splash | Pantalla oscura `#111827` con título ámbar | Cubre la carga, se quita al estar lista la app |
| Trim | Re-encode H.264 (`-ss` antes de `-i`) | Corte preciso al frame (no keyframes de WebM) |
| Precarga | **NO** — apertura única | Más rápido; el splash cubre la carga |

---

## 🚀 Setup inicial (una sola vez — ya hecho)

### 1. Perfil de grabación + sesión

El perfil `bistro-recording-profile` ya existe en `C:\Users\HP\bistro-recording-profile`
con la sesión de `posbistro.online` iniciada como "Tienda de la Esquina".

Para verificar que sigue activo:

```bash
cd .video-tools
node scripts/test-session.mjs
```

Esperado:
```
✅ SESIÓN INICIADA — sidebar visible
   Negocio detectado: "Tienda de la Esquina"
✅ Todo listo para grabar.
```

Si no está activo (dice "Login visible: true"):

- El script detecta automáticamente la pantalla de login
- Hace auto-login con `3103015865` + PIN `1234`
- La sesión queda persistida para las próximas ejecuciones

### 2. Playwright + Chromium

Ya instalados en `.video-tools/`. Para reinstalar si se borra la carpeta:

```bash
cd .video-tools
npm install
npx playwright install chromium
```

### 3. ffmpeg

Ya instalado via winget (`Gyan.FFmpeg` en `%LOCALAPPDATA%\Microsoft\WinGet\Packages\`).
`launch-chrome.mjs` lo localiza automáticamente sin configuración adicional.

---

## 🎬 Flujo de grabación por video

### Paso 1 — Script de Playwright

Para cada video nuevo, el skill genera un archivo `.video-tools/scripts/[modulo].mjs`
con las acciones del guion. El script tiene esta estructura fija:

```javascript
// Duraciones objetivo por bloque (según 02-guion.md)
const BLOCK_DURATIONS_MS = { B1: 7000, B2: 10000, ... };

// moveAndClick: mueve el cursor explícitamente, espera 600ms, hace click
// Esto asegura que el espectador vea el cursor llegar antes del click.
const moveAndClick = async (locator, description) => {
    const box = await locator.boundingBox();
    await page.mouse.move(cx, cy, { steps: 20 });
    await page.waitForTimeout(600);
    await locator.click();
};

// finishBlock: completa la duración del bloque con pausa
// Cada bloque hace la acción rápido y espera el tiempo restante.
// Esto da espacio a la narración del usuario.
const finishBlock = async (blockName) => {
    const remaining = BLOCK_DURATIONS_MS[blockName] - elapsed;
    await page.waitForTimeout(remaining);
};
```

### Paso 2 — Aprobar el script

El skill muestra las acciones antes de ejecutar:

```
Acciones que va a ejecutar:
  B1: pantalla inicial (7s estático)
  B2: click dropdown → click "Mi Perfil" (10s total)
  B3: hover + click "Cambiar PIN" → modal (10s total)
  B4: tipear PIN en campo 1 (9s total)
  B5: tipear PIN en campo 2 (7s total)
  B6: click Guardar ⚠️ persiste cambio (10s total)
  B7: pantalla post-acción (10s total)
  B8: cierre (7s total)
```

El usuario aprueba con "grabá" u otra confirmación explícita.

### Paso 3 — Ejecutar

```bash
cd .video-tools
node scripts/[modulo].mjs
```

**Durante la ejecución:**
- Chromium se abre solo (no tocar mouse ni teclado)
- La app carga en `posbistro.online` (~5-15s según conexión)
- El script espera a que el sidebar sea visible antes de empezar
- Ejecuta los bloques con pausas para narración
- Cierra Chromium al terminar

**Salida automática:**

```
✅ WebM trimeado (sin los frames de carga inicial)
✅ MP4 H.264 con anti-flicker (este es el que se edita y publica)
✅ Log de acciones con timestamps
```

---

## 🖱️ Cursor visible

El cursor es un SVG negro (flechita) inyectado en el DOM via `page.evaluate()`.
Características:

- Sigue el `mousemove` del navegador en tiempo real
- Se mueve suavemente (20 steps en `mouse.move()`)
- Espera 600ms en el destino antes del click → el espectador lo ve llegar
- Anillo ámbar (color de marca Bistro) en cada click
- Persiste entre navegaciones (`addInitScript`)

---

## ✂️ Trim con splash (preciso al frame)

El splash oscuro cubre la pantalla durante toda la carga (~5-30s). Cuando se
quita, `launch-chrome.mjs` registra `appReadyOffsetMs` — el tiempo exacto en ms
desde que empezó la grabación hasta que el splash se removió.

El trim usa **re-encode** para cortar al frame exacto (no `-c copy` que
depende de keyframes y deja frames residuales):

```bash
ffmpeg -y -ss [offset] -i raw.webm \
  -c:v libx264 -preset fast -crf 18 \
  -pix_fmt yuv420p -r 30 -vsync cfr \
  -an -movflags +faststart \
  pantalla-trimmed.mp4
```

El video resultante empieza directamente con la app cargada y lista.

---

## 🎨 Post-procesamiento anti-flicker

Playwright `recordVideo` puede producir glitches/parpadeos en hardware sin GPU
dedicada (conocido en el issue tracker de Microsoft).

La solución aplicada es post-procesar con ffmpeg:

```bash
ffmpeg -i pantalla_raw.webm \
  -vf "hqdn3d=3:3:4:4" \
  -r 30 -vsync cfr \
  -c:v libx264 -preset medium -crf 18 \
  -pix_fmt yuv420p -movflags +faststart \
  pantalla.mp4
```

- `hqdn3d`: denoising 3D temporal-spatial (suaviza frames adyacentes)
- `r 30 + vsync cfr`: framerate constante 30fps
- `libx264 + crf 18`: H.264 alta calidad, compatible con todos los players
- `+faststart`: metadata al inicio para streaming

El WebM original se conserva como respaldo.

---

## 🛠️ Troubleshooting

### "No existe el perfil" o "user data directory is already in use"

```
El perfil bistro-recording-profile está siendo usado por otra instancia de Chromium.
Solución: cerrar todas las ventanas de Chromium que hayan quedado abiertas de
grabaciones anteriores.
```

### "Login visible: true" en test-session

```
La sesión expiró o Firebase Auth no persistió en este perfil.
Solución: el script test-session.mjs hace auto-login automáticamente con
  teléfono: 3103015865
  PIN:      1234
Ejecutar de nuevo y la sesión queda lista.
```

### "Botón Guardar está deshabilitado"

```
Los 2 inputs de PIN no tienen 4 dígitos cada uno.
Probable causa: el typeDelay es demasiado rápido y el input no procesó todos los dígitos.
Solución: aumentar typeDelayMs en el script (de 100 a 200).
```

### "safeClick falló" o "locator no encontrado"

```
La UI cambió desde la última grabación.
Solución:
  1. Revisar el debug screenshot en grabaciones/debug/fail-*.png
  2. Ajustar el selector en el script .mjs
  3. Volver a ejecutar
```

### El video dura 7-8 segundos (debería durar 70s)

```
ffmpeg usó los FPS incorrectos al encodear.
Probable causa: el archivo de timestamps no existe o es de una grabación anterior.
Solución: ejecutar el script de grabación de nuevo (genera un timestamps fresco).
```

### Flicker / parpadeos en el MP4

```
El filtro hqdn3d no fue suficiente.
Opciones más agresivas:
  - hqdn3d=6:6:8:8 (más suavizado)
  - nlmeans (más lento pero mejor calidad)
  - bwdif (deinterlacing, útil si hay líneas horizontales)
Cambiar el filtro en la función postProcessVideo() de launch-chrome.mjs.
```

---

## 📚 Referencias

- Playwright docs (videos): https://playwright.dev/docs/videos
- Playwright `launchPersistentContext`: https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context
- ffmpeg hqdn3d filter: https://ffmpeg.org/ffmpeg-filters.html#hqdn3d
- Issue flicker en Playwright: github.com/microsoft/playwright/issues/8913
