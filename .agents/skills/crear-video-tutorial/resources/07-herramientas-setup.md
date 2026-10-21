# Herramientas recomendadas y setup

Referencia de las herramientas del flujo. Ajustado al hardware del usuario
(Intel i3-5005U, GPU integrada, sin GPU dedicada) y a la decisión de:

- **Grabación de pantalla:** automática con Playwright (yo lo hago)
- **Zooms cinemáticos:** manuales en el editor (los hace el usuario)
- **Grabación de voz:** manual (la hace el usuario)
- **Modelos IA locales:** descartados por falta de GPU dedicada

---

## 🤖 Grabación de pantalla — Playwright (por defecto)

**Ubicación:** carpeta aislada `.video-tools/` en la raíz del workspace, fuera
del proyecto Bistro.

**Cómo funciona:**

1. El skill escribe un script `.mjs` con las acciones a ejecutar
2. El usuario abre Chrome con `--remote-debugging-port=9222`
3. El skill ejecuta el script → se conecta al Chrome existente vía CDP
4. Playwright graba WebM del viewport durante la ejecución
5. El WebM queda en `docs/videos_tutoriales/[modulo]/grabaciones/`

**Ventajas:**

- ✅ Repetible: si algo sale mal, se ejecuta de nuevo con el mismo resultado
- ✅ Consistente entre videos (mismo tamaño, mismo timing)
- ✅ Sin errores humanos (no hay typos, cursor mal posicionado, etc.)
- ✅ Escalable a 20+ videos con mínimo esfuerzo por cada uno
- ✅ El WebM se importa nativo en Cap.so, CapCut, DaVinci

**Limitaciones honestas:**

- ⚠️ Solo captura el viewport (contenido web), NO el chrome del sistema
  (barra de tabs, URL, taskbar de Windows). Si necesitás mostrar la URL o
  la ventana del navegador completa, tenés que grabar manualmente esa toma.
- ⚠️ El cursor del sistema operativo no se ve. Se puede inyectar un cursor
  "web" con CSS/JS que sí se ve moverse programáticamente.
- ⚠️ Salida en WebM (no MP4). Cloudinary acepta WebM y lo convierte al vuelo,
  así que no es problema para el TrainingScreen.

**Alternativa manual (fallback):** si Playwright falla o el usuario prefiere
grabar manualmente en algún caso puntual, se puede usar Cap.so, Cursorful o
ScreenArc como en el flujo anterior. El skill soporta ambos caminos.

Guía técnica completa: [08-playwright-grabacion.md](08-playwright-grabacion.md).

---

## 🎨 Zoom cinemático (post-grabación)

Los zooms los agrega el usuario **en el editor** después de recibir el WebM
de Playwright. Herramientas recomendadas:

### CapCut Desktop — recomendado

- **Web:** https://www.capcut.com/
- **Precio:** gratis (sin marca de agua opcional)
- **Ventajas:**
  - Timeline multi-pista muy claro
  - Efecto **Ken Burns / Zoom** con curvas de easing
  - Fácil sincronizar la voz con el video
  - Importa WebM nativo
  - Motor de render rápido para hardware modesto
- **Uso en este flujo:** editor principal para agregar zooms manuales al WebM
  de Playwright + sincronizar la voz narrada.

### Cap.so — alternativa integrada

- **Web:** https://cap.so
- **Precio:** gratis, open source
- **Ventajas:**
  - Editor + player integrados
  - Sin instalación pesada
- **Cuándo usarlo:** si preferís todo-en-uno y no querés instalar CapCut.

### DaVinci Resolve — solo si crece la producción

- **Web:** https://www.blackmagicdesign.com/products/davinciresolve
- **Advertencia:** en tu hardware (i3 sin GPU) va lento. No recomendado hasta
  que actualices equipo o el flujo lo justifique.

---

## 🎤 Grabación de audio (voz del usuario)

### Audacity — recomendado

- **Web:** https://www.audacityteam.org/
- **Precio:** gratis, open source
- **Ventajas:**
  - Grabar en WAV sin compresión
  - Editar cortes, silencios y ruido
  - Exportar a MP3 al final
- **Configuración recomendada:**
  - Grabación: **32-bit float, 48 kHz**
  - Exportación final: **MP3, 192 kbps mono**

### Grabadora de voz de Windows

- **Cuándo usarla:** grabación rápida, sin edición
- **Limitación:** calidad menor que Audacity, no permite editar

### Micrófono

Para tutoriales cortos el micrófono del headset ya alcanza si el cuarto es
silencioso. Si querés invertir más adelante:

- Nivel intermedio: Blue Yeti Nano, HyperX SoloCast (~$60-100 USD)
- Nivel pro: Rode NT-USB, Shure MV7 (~$150-250 USD)

---

## 📱 Grabación de dispositivos móviles (si aplica)

Para videos que muestren la app en tablet/celular físico:

### scrcpy

- **GitHub:** https://github.com/Genymobile/scrcpy
- **Precio:** gratis, open source
- **Qué hace:** espeja la pantalla del celular Android en el PC vía USB
- **Uso:** grabar la vista mesero/tablet como si fuera una ventana más del PC

**Nota:** Playwright NO puede grabar la app Android nativa (solo webviews).
Para grabar la APK de Bistro se usa scrcpy + Cap.so encima.

---

## 📝 Subtítulos (opcional)

### Cloudinary auto-subtitles

- Ya usás Cloudinary para hosting
- Al subir un video, se puede pedir generación automática de subtítulos
- https://cloudinary.com/documentation/video_ai_content_analysis

### Whisper API (OpenAI)

- **Endpoint:** `https://api.openai.com/v1/audio/transcriptions`
- **Precio:** ~$0.006 por minuto de audio
- **Modelo:** `whisper-1`, language `es`
- Para 20 videos de 5 min ≈ **$0.60 total**

### CapCut auto-caption

- Gratis, integrado en el editor
- Calidad decente para español
- Todo en el mismo flujo

---

## ☁️ Hosting de video final

### Cloudinary — el que ya usás

- **Cuenta actual:** `milenadelpilar`
- **URL base:** `https://res.cloudinary.com/milenadelpilar/video/upload/`
- **Ventajas:**
  - Streaming adaptativo automático
  - Thumbnails automáticos
  - Acepta WebM y lo convierte a MP4 al vuelo
  - Transformaciones (crop, quality, format)

### Alternativas

- **YouTube "No listado":** gratis, sin límite. Player menos integrable.
- **Firebase Storage:** ya tenés Firebase configurado. Más control, más costo
  por tráfico.
- **Cloudflare Stream:** $1/1000 min de visualización, pensado para video.

---

## 🎨 Recursos gratis útiles

### Iconos y assets

- [Material Symbols](https://fonts.google.com/icons) — ya usás en la app
- [Undraw](https://undraw.co/) — ilustraciones vectoriales gratis

### Música libre de derechos (para cuando se implemente branding)

- [YouTube Audio Library](https://studio.youtube.com/) — gratis, uso comercial
- [Uppbeat](https://uppbeat.io/) — gratis con atribución o $6.99/mes

### Mockups extras

- [Cleanshot.cloud](https://cleanshot.cloud/) — screenshots con marco laptop
- [Screenshot.rocks](https://screenshot.rocks/) — mockups gratis

---

## 🚀 Setup inicial (una sola vez)

Para arrancar con el flujo completo:

### 1. Playwright (para grabación automática)

Lo instala el skill la primera vez en `.video-tools/`. No requiere acción
manual del usuario. Ver [08-playwright-grabacion.md](08-playwright-grabacion.md).

### 2. Audacity (para voz)

Descargar desde https://www.audacityteam.org/ e instalar. ~30 MB.

### 3. CapCut Desktop (para montaje)

Descargar desde https://www.capcut.com/ e instalar. ~250 MB.

### 4. scrcpy (opcional, solo si vas a grabar Android)

Ver instrucciones en https://github.com/Genymobile/scrcpy/releases

**Tiempo total de setup:** ~15-30 minutos.

---

## 💰 Costos del flujo completo

Para 20 videos de 3-5 min cada uno:

| Concepto | Costo |
|---|---|
| Playwright + Chromium | $0 |
| Audacity | $0 |
| CapCut Desktop | $0 |
| scrcpy | $0 |
| Cloudinary hosting | Ya lo pagás |
| Whisper API subtítulos (opcional) | ~$1 total |
| **Total mensual** | **~$0** |

Cero suscripciones adicionales. El único gasto opcional son los subtítulos
automáticos si los querés.
