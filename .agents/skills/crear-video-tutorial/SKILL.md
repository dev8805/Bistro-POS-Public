---
name: crear-video-tutorial
description: Crea videos tutoriales de módulos de Bistro POS en español Colombia (3-10 min).
  El usuario graba su propia voz — el skill genera plan, guion en bloques numerados,
  checklist de grabación y mapa de edición cuando el usuario devuelve el audio con
  timestamps. Disparadores: "crear video tutorial", "video de capacitación",
  "grabar tutorial de X", "video para TrainingScreen", "hacer tutorial".
---

# Crear Video Tutorial Bistro POS

## 🎯 Qué produce este skill

Un paquete completo para crear un video tutorial de 1-10 minutos sobre un módulo
de Bistro:

```
C:\Users\HP\OneDrive\Escritorio\TutorialesBistro\[modulo]/
├── 01-plan.md              ← alcance, escenas, aprobar antes de guion
├── 02-guion.md             ← narración por bloques numerados + visual sugerido
│                             + ayudas visuales (overlays) cuando aplica
├── 03-checklist.md         ← qué preparar antes de grabar (datos, dispositivos)
├── 04-mapa-edicion.md      ← generado DESPUÉS de que el usuario devuelva
│                             audio + timestamps
├── 05-snippet-training.md  ← objeto listo para pegar en TRAINING_VIDEOS
└── grabaciones/
    ├── pantalla.mp4        ← video Playwright (limpio, sin overlays)
    ├── narracion.wav       ← audio TTS
    ├── guion-tts.txt       ← texto para Azure TTS
    └── overlays/           ← clips animados con fondo transparente (HyperFrames)
        ├── B7-aclaracion-pin.webm
        └── ...
```

**Idioma**: español Colombia. **Duración objetivo**: 1-10 min. **Hosting final**:
Cloudinary (mismo formato que los videos ya en `TrainingScreen.tsx`).

---

## 🎬 División de responsabilidades

```
┌────────────────────────────┬──────┬────────────────────────────────────┐
│ FASE                       │ QUIÉN│ QUÉ                                │
├────────────────────────────┼──────┼────────────────────────────────────┤
│ Plan + guion + check       │ SKILL│ Genera 01-03 leyendo docs y código │
│ Análisis ayudas visuales   │ SKILL│ Compara narración vs UI real       │
│ Propuesta de overlays      │ SKILL│ Describe cada overlay propuesto    │
│ Aprobación overlays        │ USR  │ Aprobás/mejorás cada propuesta     │
│ Grabación pantalla         │ SKILL│ Automatiza con Playwright + WebM   │
│ Narración (voz IA)         │ SKILL│ Genera audio con Azure TTS (Jorge) │
│ Renderizado overlays       │ SKILL│ HyperFrames → .webm transparentes │
│ Montaje final              │ USR  │ Video + audio + overlays en Filmora│
│ Subir a Cloudinary         │ USR  │ Compartís URL con el skill         │
│ Snippet TrainingScreen     │ SKILL│ Genera 05-snippet-training.md      │
└────────────────────────────┴──────┴────────────────────────────────────┘
```

- **URL de grabación**: `https://posbistro.online` (producción, Firebase Hosting CDN)
- **Perfil de prueba**: "Tienda de la Esquina" (perfil del dueño en `bistro-recording-profile`)
- **Credenciales de prueba**: teléfono `3103015865`, PIN `1234`
- **Resolución de pantalla del usuario**: 1366x768
- **Resolución de grabación**: 1366x720
- **Método de grabación**: `playwright-recorder-plus` (H.264 two-pass pipeline — captura lossless + transcode calidad)
- **Animaciones CSS**: desactivadas en TODOS los videos (modales/dropdowns aparecen instantáneos)
- **Post-procesamiento**: NO necesario — `recorder-plus` produce MP4 final directamente
- **Audio muxeado inline**: la narración se integra al MP4 desde el script (sin montaje manual de audio)
- **Cursor visible**: SVG negro 40x40 con sombra circular, 20 steps + 600ms pre-click, anillo ámbar al clic
- **Narración**: Azure TTS voz `Jorge` (es-MX) estilo `chat`, velocidad 1.0, pausas 700ms. Herramienta: `bal4web.exe`
- **API key Azure Speech**: en `.video-tools/bal4web/azure-key.txt` (no subir a git)
- **Guion TTS**: `grabaciones/guion-tts.txt` (frases cortas, puntos, líneas vacías para pausas)
- **Idioma guion**: español Colombia (tuteo colombiano). Voz mexicana, texto colombiano.

## 🚀 Arranque rápido (cada vez que grabás)

```
Prerequisitos (ya están listos — no repetir):
  ✅ .video-tools/ con Playwright + Chromium en la raíz del workspace
  ✅ .video-tools/overlays-bistro/ con HyperFrames inicializado
  ✅ bistro-recording-profile en C:\Users\HP\bistro-recording-profile
  ✅ Sesión en posbistro.online iniciada en ese perfil
  ✅ ffmpeg instalado via winget (Gyan.FFmpeg)
  ✅ Node.js 22+ (requerido por HyperFrames)

Pasos de cada sesión (2 minutos máximo):
  1. Si hay un Chromium de grabaciones abierto → cerrarlo
     (si no está abierto, omitir este paso)
  2. Decirle a Kiro: "quiero un video de [módulo]"
     Kiro hace todo lo demás.
```

La sesión de `posbistro.online` **persiste** entre sesiones — no hay que loguearse de nuevo.

## 📋 Flujo completo de un video (referencia)

```
Kiro                              Vos
──────────────────────────────    ─────────────────────────────
Lee docs del módulo           →
Genera plan.md                ←   Aprobás el plan
Genera guion.md               ←   (Opcional) Ajustás textos
Analiza narración vs UI real
  → propone overlays          ←   Aprobás/mejorás los overlays
Genera TTS POR BLOQUE
  → tts/b1.wav..bN.wav
  → mide cada uno con ffprobe
  → block-timings.json
  → concatena narracion.wav
Actualiza BLOCK_DURATIONS_MS
  del script Playwright con
  los tiempos reales del audio
Genera script Playwright .mjs ←   Aprobás el script
Ejecuta grabación Playwright
  (audio ya en carpeta, se
   muxea con offset preciso)
  → pantalla.mp4 con audio ✅
Renderiza overlays (HyperFrames)
  → overlays/*.webm
Incrusta overlays en el video
  → pantalla-final.mp4         ←   Verificás el video final
                              ←   Subís a Cloudinary + enviás URL
Genera snippet TrainingScreen ←   Verificás en local (npm run dev)
```

---

## 🚨 Reglas de oro

1. **La narración la genera el skill con Azure TTS** (voz `Jorge` es-MX, estilo
   `chat`). El usuario NO graba su voz — solo verifica que suene bien.
2. **La pantalla la graba el skill con Playwright** conectándose al Chrome real
   del usuario (con su sesión iniciada). Ver
   [resources/08-playwright-grabacion.md](resources/08-playwright-grabacion.md)
   para el flujo técnico completo.
3. **Todo el material visual es real de la app** (grabaciones Playwright + fotos
   físicas). No se generan escenas con IA de video (Runway, Kling, Veo, etc.).
4. **El guion se divide en bloques numerados `B1`, `B2`, `B3`...** para que el
   usuario pueda devolver timestamps precisos por bloque después de grabar.
5. **Cada bloque = 1 idea narrativa continua** de ~5-15 segundos hablado.
6. **El plan se aprueba ANTES de escribir el guion.** No redactar guion sobre un
   plan sin confirmar.
7. **El script de Playwright se aprueba ANTES de ejecutarse.** El usuario debe
   ver qué acciones se van a automatizar antes de conectarse a su Chrome.
8. **Los overlays se proponen verificando el código real.** El skill lee el
   componente/pantalla que se graba y confirma que la información de la narración
   NO aparece en la UI. Solo entonces propone un overlay. No se inventan overlays
   sin evidencia del código.
9. **Los overlays se aprueban ANTES de renderizarse.** El usuario ve la
   propuesta completa (tipo, texto, posición) y puede aprobar, modificar o
   eliminar cada uno.
10. **La narración TTS se genera SIEMPRE antes de grabar el video, y por bloque
    separado.** Nunca al revés. Motivo: cada `bN.wav` se mide con `ffprobe` y su
    duración real alimenta `BLOCK_DURATIONS_MS` del script Playwright. Así el
    video de cada bloque dura EXACTAMENTE lo que dura su audio (con un buffer de
    +500ms al final). El `recorder-plus` muxea con offset preciso desde
    `rec.audio()` y no hace falta componer audio a mano con ffmpeg.
    Si se grabara al revés (video primero con duraciones inventadas y luego
    audio), el desfase se acumula bloque a bloque y al final el audio termina
    varios segundos antes que el video → los últimos bloques quedan sin voz.

---

## Cuándo usar esta skill

- Usuario pide un video tutorial de un módulo de Bistro POS
- Usuario menciona: "video", "tutorial", "capacitación", "grabar tutorial",
  "TrainingScreen", "video para clientes"
- Usuario devuelve un audio grabado con marcas de tiempo pidiendo el mapa de edición

---

## Flujo de trabajo

### Etapa 0 — Detectar módulo y precargar contexto (sin preguntar)

1. Identificar el módulo. Si el usuario dijo "video de mesas" o similar, mapear al
   archivo técnico en `docs/caracteristicas/`. Índice completo en la sección
   **Índice de módulos** más abajo.

2. Detectar si ya existe `C:\Users\HP\OneDrive\Escritorio\TutorialesBistro\[modulo]/` — si existe, preguntar
   si es continuación (llegó el audio + timestamps → saltar a Etapa 4) o
   rehacerlo desde cero.

3. Leer con `Read` el archivo técnico completo del módulo en
   `docs/caracteristicas/`.

4. Leer las pantallas y hooks involucrados con `Read` — buscar en `screens/`,
   `hooks/`, `components/` los archivos que el doc técnico menciona.

5. Revisar `screens/TrainingScreen.tsx` para conocer el estilo de descripción y
   categorías existentes (evita duplicados).

---

### Etapa 1 — Confirmar alcance (1 ronda, máx. 4 preguntas)

Antes de generar el plan:

1. ¿Público del video? (dueño / cajero / mesero / administrador / todos)
2. ¿Duración objetivo aproximada? (3, 5, 7, 10 min)
3. ¿Hay algún dispositivo especial que se muestre? (tablet mesero, impresora
   térmica, escáner USB, celular). Si sí, ¿los tenés físicamente o se muestran
   por foto/screenshot?
4. ¿Categoría en `TrainingScreen.tsx`? (inicio, ventas, inventario, personal,
   reportes). Si no está clara, sugerir según el módulo.

Si el usuario dice "vos elegí", tomar decisiones razonables y avanzar.

---

### Etapa 2 — Generar plan (aprobación obligatoria)

Crear `C:\Users\HP\OneDrive\Escritorio\TutorialesBistro\[modulo]/01-plan.md` usando la plantilla
[resources/01-template-plan.md](resources/01-template-plan.md).

El plan debe incluir:

- **Título propuesto** (imperativo, corto: "Cómo cobrar en Bistro")
- **Objetivo en una frase**
- **Público objetivo**
- **Duración objetivo**
- **Categoría** en `TrainingScreen.tsx`
- **✅ Muestra** — lista de 4-8 cosas que el video SÍ va a mostrar
- **❌ NO muestra** — lista explícita de qué queda fuera (evita scope creep)
- **Escenas** — 5-10 escenas cortas con nombre descriptivo y duración estimada.
  La suma de escenas debe cuadrar con la duración objetivo.
- **Requisitos de grabación** — qué datos de prueba tener listos, qué
  dispositivos preparar, qué estado de la app dejar antes de grabar
- **Riesgos / notas** — cosas que pueden salir mal o requerir grabación
  adicional

**Al terminar el plan, presentarlo al usuario y ESPERAR aprobación literal**
("aprobado", "sí", "ok", "avanza"). Cualquier crítica → editar el plan y volver
a presentar. No pasar a Etapa 3 sin aprobación.

---

### Etapa 3 — Generar guion y checklist

Una vez aprobado el plan, generar EN PARALELO:

#### 3.a — `02-guion.md`

Usar la plantilla [resources/02-template-guion.md](resources/02-template-guion.md).

Reglas del guion:

- **Bloques numerados `B1`, `B2`, `B3`...** — cada bloque = una idea narrativa
  continua que el usuario leerá de corrido. Duración objetivo por bloque:
  **5-15 segundos hablado** (≈ 15-45 palabras en español).
- **Formato de cada bloque:**

  ```markdown
  ### B1 — Nombre corto de la idea

  **🎙️ Narración** (~10s):
  > Texto exacto que el usuario va a leer en voz alta.

  **🎬 Visual sugerido:**
  - Screenshot de la pantalla X con zoom al botón Y
  - O: grabación de la acción Z durante N segundos
  - O: foto de la impresora térmica imprimiendo el ticket

  **🎞️ Overlay animado:** (solo si aplica — ver Etapa 3.5)
  - Tipo: tip / advertencia / callout
  - Texto: "..."
  - Posición: centro-inferior
  - Duración: Xs
  - Evidencia: [qué se verificó en el código]

  **📝 Notas para grabación:** (opcional)
  Cualquier detalle que ayude a preparar la toma.
  ```

- **Español Colombia natural, no acartonado.** Verbos en tuteo o usted según el
  público (dueños suelen tratar de usted a los cajeros; el video puede tutear).
  Evitar tecnicismos ("query", "hook", "endpoint"). Sustituir por palabras
  neutras: "el sistema", "la pantalla", "el listado".
- **Bloques con transición explícita al comienzo** cuando cambian de escena:
  "Ahora vamos a...", "Después de eso...", "El siguiente paso es...".
- **Nombres de botones, pantallas y campos en negrita** para que el usuario los
  enfatice al leer: "toca en **Nueva venta**", "ve a **Ajustes**".
- **Máximo 30-40 bloques por video** de 5 min. Si son más, el video es
  demasiado largo o los bloques demasiado cortos.
- **No incluir intro/outro con branding todavía.** Ver
  [resources/06-branding-pendiente.md](resources/06-branding-pendiente.md).
  Dejar B1 como "hook inicial" (frase que atrapa) y el último bloque como
  "cierre" (llamada a la acción o resumen).

#### 3.b — `03-checklist.md`

Usar la plantilla [resources/03-template-checklist.md](resources/03-template-checklist.md).

Lista concreta y accionable de:

- Datos de prueba a crear en la app (productos, mesas, empleados, etc.) con
  nombres específicos
- Dispositivos a preparar (celular con scrcpy, impresora conectada, cámara)
- Estado de la app previo a grabar (sesión iniciada, caja abierta, etc.)
- Software de grabación recomendado (Cap.so por defecto)
- Consejos de audio (lugar silencioso, distancia al micro, evitar plosivas)

---

### Etapa 3.5 — Análisis de ayudas visuales (overlays HyperFrames)

**Trigger:** inmediatamente después de generar el guion (Etapa 3).

**Objetivo:** determinar qué bloques del guion necesitan un overlay animado
porque la narración explica algo que NO se ve en la UI durante la grabación.

#### Proceso de análisis (por cada bloque)

```
POR CADA BLOQUE (B1, B2, B3...):

1. Extraer las AFIRMACIONES de la narración
   → ¿Qué dice la voz que el espectador debería entender?
   Ej: "cada persona cambia solo su propio PIN"
       "los puntitos son tu PIN oculto"

2. Leer el CÓDIGO del componente/pantalla que se está grabando
   → screens/ProfileScreen.tsx, el modal, etc.
   → Identificar QUÉ SE VE en la UI en ese momento exacto:
     - ¿Hay un label, hint, tooltip o texto visible que diga eso?
     - ¿Hay un icono o indicador visual que lo comunique?
     - ¿La acción de Playwright lo muestra (toast, badge, cambio de estado)?

3. Comparar narración vs UI visible:

   ┌──────────────────────┬─────────────────────────────────┐
   │ NARRACIÓN dice       │ UI MUESTRA algo equivalente?    │
   ├──────────────────────┼─────────────────────────────────┤
   │ Sí se ve en la UI    │ → NO necesita overlay           │
   │ NO se ve en la UI    │ → SÍ propone overlay            │
   └──────────────────────┴─────────────────────────────────┘

4. Si necesita overlay → documentar la propuesta en el guion
   Si NO necesita → no agregar nada, el video basta
```

#### Criterios para proponer un overlay

**SÍ se propone cuando:**
- La narración explica algo conceptual sin representación visual en pantalla
- La narración menciona una restricción/regla del sistema que no aparece como
  label, tooltip, badge o mensaje en la UI
- La narración describe algo que pasa "por debajo" (ej: "el sistema los está
  registrando" pero solo se ven puntos)
- La narración hace una advertencia que la UI no comunica visualmente

**NO se propone cuando:**
- La narración describe lo que el usuario ya está viendo (botón, modal, input)
- La acción de Playwright ya lo muestra visualmente (el clic, el tipeo, el toast)
- Hay un label/hint/placeholder en la UI que dice lo mismo que la voz
- Es una instrucción de navegación ("toca acá", "andá a tal menú") — eso ya se
  ve en la grabación

#### Formato de la propuesta en el guion

Cuando un bloque necesita overlay, se agrega esta sección al bloque en
`02-guion.md`:

```markdown
**🎞️ Overlay animado:**
- **Tipo:** tip / advertencia / callout / diagrama / etiqueta
- **Texto principal:** "Cada usuario cambia solo su propio PIN"
- **Texto secundario:** (opcional) "El dueño no puede cambiar el de otros"
- **Evidencia:** [qué se revisó en el código para confirmar que no se ve]
  Ej: "ProfileScreen.tsx no muestra ningún label sobre esta restricción
  cuando el modal está cerrado"
- **Posición:** centro-inferior / superior-derecha / lateral-izquierda
- **Animación:** slide-up + fade-out / scale-in + fade-out / etc.
- **Duración visible:** Xs (debe coincidir con la duración del bloque narrado)
- **Archivo salida:** `overlays/B[N]-[nombre-corto].webm`
```

#### Tipos de overlay disponibles

| Tipo | Icono | Uso | Color borde |
|------|-------|-----|-------------|
| **💡 Tip** | bombilla | Info adicional útil pero no crítica | amber-400 |
| **⚠️ Advertencia** | triángulo | Precaución, restricción importante | red-400 |
| **📌 Callout** | pin | Destacar un elemento o concepto | blue-400 |
| **📊 Diagrama** | gráfico | Explicar flujo o relación entre cosas | emerald-400 |
| **🏷️ Etiqueta** | tag | Nombre/función de un elemento señalado | slate-400 |

#### Estilo visual base (brand Bistro)

- **Fondo:** semitranslúcido oscuro (`#1a1a1a` al 90% opacidad)
- **Borde:** 2px del color del tipo (ver tabla arriba)
- **Texto principal:** blanco, 24px, semi-bold
- **Texto secundario:** slate-300, 18px, regular
- **Icono:** a la izquierda del texto, 32px
- **Border-radius:** 12px
- **Resolución del canvas:** 1366x720 (misma que la grabación)
- **Animación entrada:** slide desde abajo (200-300ms, ease-out)
- **Animación salida:** fade-out (300-400ms)

#### Presentación al usuario

Después del análisis, el skill presenta al usuario un resumen:

```markdown
## 🎞️ Ayudas visuales propuestas

Revisé el código de [pantalla] y encontré [N] bloques donde la narración
explica algo que no se ve en la UI:

| Bloque | Afirmación de la narración | ¿Se ve en UI? | Overlay propuesto |
|--------|---------------------------|---------------|-------------------|
| B4 | "Los puntitos son tu PIN" | ❌ No hay hint | 💡 Tip |
| B7 | "Cada uno cambia el suyo" | ❌ No hay label | ⚠️ Advertencia |

### Detalle de cada overlay:

**B4 — tip puntitos:**
- Texto: "Los puntos ocultan tu PIN — el sistema sí lo registra"
- Posición: inferior-centro
- Duración: 4s

**B7 — advertencia roles:**
- Texto: "Cada usuario cambia solo su propio PIN"
- Secundario: "El dueño no puede cambiar el de otros empleados"
- Posición: centro
- Duración: 6s

¿Aprobás estos overlays, querés cambiar algo, o eliminamos alguno?
```

**ESPERAR aprobación del usuario** antes de renderizar. El usuario puede:
- Aprobar todo → pasa a renderizar
- Modificar texto/posición/tipo → skill ajusta y vuelve a presentar
- Eliminar alguno → se quita
- Agregar uno nuevo → skill lo incluye

---

### Etapa 3.6 — Renderizar overlays e incrustar en el video

**Trigger:** el usuario aprueba los overlays propuestos.

**Herramienta:** [HyperFrames](https://github.com/heygen-com/hyperframes)
(open source, Apache 2.0, HTML → MP4/WebM determinista).

**¿Por qué HyperFrames y no Remotion?**
- Kiro genera HTML plano (no JSX/React) → más directo
- No necesita un proyecto React separado solo para overlays
- CLI no-interactivo, diseñado para agentes IA
- Apache 2.0 sin restricciones de licencia
- Mismas dependencias: Node.js + ffmpeg (ya instalados)

#### Setup (una sola vez por workspace)

```bash
# Ya hecho — proyecto en .video-tools/overlays-bistro/
npx -y hyperframes init overlays-bistro --non-interactive --example blank
npx -y hyperframes browser ensure
```

#### Flujo completo (el skill lo hace todo)

1. **Skill escribe el HTML** del overlay en
   `.video-tools/overlays-bistro/index.html`

   Ejemplo de un overlay tipo "advertencia":
   ```html
   <!doctype html>
   <html lang="es">
   <head>
     <meta charset="UTF-8" />
     <meta name="viewport" content="width=1366, height=720" />
     <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
     <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
     <style>
       * { margin: 0; padding: 0; box-sizing: border-box; }
       html, body { margin: 0; width: 1366px; height: 720px; overflow: hidden; }
       body { font-family: 'Inter', sans-serif; }
     </style>
   </head>
   <body>
     <div id="root" data-composition-id="B7-advertencia-roles"
          data-start="0" data-duration="7" data-width="1366" data-height="720">
       <div id="overlay" class="clip"
            data-start="0" data-duration="7" data-track-index="0"
            style="position:absolute; top:50%; left:50%;
                   transform:translate(-50%,-50%);
                   background:rgba(26,26,26,0.92);
                   border:2px solid #f87171; border-radius:12px;
                   padding:18px 28px; display:flex; align-items:center;
                   gap:14px; max-width:560px;
                   box-shadow:0 8px 32px rgba(0,0,0,0.5);">
         <span style="font-size:32px; flex-shrink:0;">⚠️</span>
         <div>
           <p style="color:white; font-size:22px; font-weight:600; line-height:1.3;">
             Cada usuario cambia solo su propio PIN
           </p>
           <p style="color:#cbd5e1; font-size:16px; margin-top:5px; line-height:1.3;">
             El dueño no puede cambiar el de otros empleados
           </p>
         </div>
       </div>
     </div>
     <script>
       window.__timelines = window.__timelines || {};
       const tl = gsap.timeline({ paused: true });
       tl.from("#overlay", { y: 40, opacity: 0, duration: 0.3, ease: "power2.out" }, 0);
       tl.to("#overlay", { opacity: 0, duration: 0.4 }, 6.2);
       window.__timelines["B7-advertencia-roles"] = tl;
     </script>
   </body>
   </html>
   ```

2. **Skill renderiza** el overlay con fondo transparente:
   ```bash
   npx -y hyperframes render --format webm --fps 30 --quality standard
     --output B7-advertencia-roles.webm
   ```
   → Mueve el `.webm` a `grabaciones/overlays/`

3. **Skill incrusta los overlays en el video** con ffmpeg:
   ```bash
   ffmpeg -y \
     -i grabaciones/pantalla.mp4 \
     -c:v libvpx-vp9 -i grabaciones/overlays/B7-advertencia-roles.webm \
     -filter_complex "[1:v]setpts=PTS+{SEG_INICIO}/TB[ovr];[0:v][ovr]overlay=0:0:enable='between(t,{SEG_INICIO},{SEG_FIN})'" \
     -c:v libx264 -crf 18 -preset fast -c:a copy \
     grabaciones/pantalla-final.mp4
   ```

   Para múltiples overlays, se encadenan en el `filter_complex`:
   ```bash
   ffmpeg -y \
     -i pantalla.mp4 \
     -c:v libvpx-vp9 -i overlays/B4-tip.webm \
     -c:v libvpx-vp9 -i overlays/B7-advertencia.webm \
     -filter_complex "
       [1:v]setpts=PTS+28/TB[ovr1];
       [2:v]setpts=PTS+53/TB[ovr2];
       [0:v][ovr1]overlay=0:0:enable='between(t,28,33)'[tmp];
       [tmp][ovr2]overlay=0:0:enable='between(t,53,60)'
     " \
     -c:v libx264 -crf 18 -preset fast -c:a copy \
     pantalla-final.mp4
   ```

4. **Entrega al usuario:**
   ```
   grabaciones/
   ├── pantalla.mp4             ← video original (respaldo)
   ├── pantalla-final.mp4       ← VIDEO FINAL con overlays incrustados
   ├── narracion.wav            ← audio TTS
   └── overlays/
       └── B7-advertencia-roles.webm  ← overlay suelto (respaldo)
   ```

   El usuario verifica `pantalla-final.mp4`:
   - Si está bien → sube a Cloudinary
   - Si quiere ajustes finos → usa los archivos sueltos en Filmora

#### Determinación del segundo de inserción

El skill calcula el segundo exacto basándose en:

1. **Si ya hay timestamps del audio** (narración TTS ya generada): usa la
   duración acumulada de los bloques previos.
2. **Si hay timestamps del usuario**: usa el inicio del bloque correspondiente.
3. **La duración del overlay** = campo `data-duration` del HTML.

#### Configuración técnica fija

| Parámetro | Valor |
|-----------|-------|
| Resolución | 1366x720 (misma que la grabación Playwright) |
| FPS | 30 |
| Formato overlay | WebM VP9 con canal alpha |
| Formato final | MP4 H.264 CRF 18 |
| Fondo overlay | Transparente (sin background en html/body) |
| Motor render | HyperFrames (Chrome Headless + ffmpeg) |
| Motor composición | ffmpeg filter_complex overlay |
| Animaciones | GSAP timelines (seekable, determinista) |
| Proyecto | `.video-tools/overlays-bistro/` |

**Tiempos de referencia** (i3-5005U @ 2.00GHz, video 73s, 1 overlay):
- Renderizar overlay HyperFrames: ~40s
- Componer overlay en video con ffmpeg: ~27s
- **Total:** ~67s por overlay

**Preview del overlay antes de incrustar:** el usuario puede abrir el `.webm`
en Chrome para verificar la animación antes de que el skill lo incruste.

No hay renderizado pesado adicional — Filmora solo compone las pistas.

---

### Etapa 4 — Grabar la pantalla con Playwright

**Trigger:** el usuario aprueba el guion y quiere que el skill grabe la pantalla.

**Referencia técnica completa:**
[resources/08-playwright-grabacion.md](resources/08-playwright-grabacion.md)

#### Arquitectura de grabación

Playwright lanza Chromium con el perfil `bistro-recording-profile` (donde ya
hay sesión iniciada) y usa `recordVideo` nativo (no CDP screencast).

**Flujo de splash (apertura única):**

1. Abre Chromium CON `recordVideo` → inyecta splash oscuro con título del video
2. La app carga por DETRÁS del splash (el espectador no ve nada de la carga)
3. Cuando la app está lista → quita el splash → ese frame es el segundo 0
4. Trim con re-encode preciso corta todo lo anterior (carga + splash)

**Configuración técnica fija:**

| Parámetro | Valor |
|-----------|-------|
| URL | `https://posbistro.online` (producción) |
| Perfil | `bistro-recording-profile` (`C:\Users\HP\bistro-recording-profile`) |
| Credenciales (si hay que reloguear) | teléfono `3103015865`, PIN `1234` |
| Resolución | 1366x720 (pantalla del usuario es 1366x768) |
| Animaciones CSS | Desactivadas durante la grabación (instantáneas) |
| Cursor | SVG negro 40x40 con sombra, 20 steps, 600ms pre-click |
| Post-procesamiento | ffmpeg H.264 + filtro `hqdn3d` anti-flicker |
| Salida | `grabaciones/pantalla.webm` (respaldo) + `pantalla.mp4` (publicar) |

#### Qué PUEDE grabar Playwright

```
✅ Todo el contenido de Bistro dentro del viewport (1366x720):
   - Sidebar, header, modales, formularios, toasts
   - Transiciones de pantalla (instantáneas por CSS override)
   - Cursor fake SVG moviéndose y haciendo clic
   - Tipeo en inputs (se ven los puntos/caracteres aparecer)
   - Dropdowns, bottom sheets, popups de la app

✅ Interacciones automatizables:
   - Navegar entre pantallas (click sidebar → nueva pantalla)
   - Abrir modales (click botón → modal aparece)
   - Llenar formularios (type → se ve el texto)
   - Hacer click en botones de acción (Guardar, Cancelar, etc.)
   - Scroll dentro de listas
```

#### Qué NO puede grabar Playwright

```
❌ NO puede grabar:
   - La barra de tabs / URL bar de Chrome
   - Notificaciones del sistema operativo (Windows)
   - Dispositivos físicos (impresora térmica imprimiendo, escáner USB)
   - La app Android nativa (APK de Bistro en celular)
   - Audio del sistema
   - Interacciones con popups del navegador (permisos, descargas)
   - Flujos que requieran SMS OTP en tiempo real
   - Elementos fuera del viewport (requieren scroll primero)

❌ Limitaciones de calidad:
   - ~25fps máximo (limitación interna de Playwright, no configurable)
   - Las animaciones CSS se desactivan para evitar escalonamiento
   - Sin GPU dedicada, puede haber leve flicker (mitigado con hqdn3d)
```

#### Qué debe hacer el usuario cuando Playwright no cubre

Para escenas que Playwright no puede grabar:

| Escena | Solución | Herramienta |
|--------|----------|-------------|
| Mostrar Chrome completo (URL bar visible) | Grabar manualmente | Cap.so / ShareX / Filmora |
| Mostrar impresora térmica imprimiendo | Grabar con cámara del celular | Cámara |
| Mostrar app Android (tablet/celular) | Grabar con scrcpy o cámara | scrcpy + Cap.so |
| Mostrar notificación push del sistema | Grabar manualmente | Cap.so / ShareX |
| Flujos multi-dispositivo (mesero + caja) | Grabaciones separadas + montaje | Cámara + Cap.so |

El usuario graba esas escenas y las guarda en `grabaciones/` con nombre
descriptivo (ej. `toma-impresora.mp4`). El mapa de edición indica en qué
segundo del audio poner cada toma.

#### Resumen del flujo paso a paso

1. **Skill escribe el script** (`.video-tools/scripts/[modulo].mjs`)
   - Incluye `splashTitle` con el título del video (ej: "Cómo cambiar tu PIN")
   - Usa `launchChromeWithProfile({ splashTitle, ... })` de `launch-chrome.mjs`
2. **Skill muestra las acciones al usuario** para aprobar
3. **Usuario confirma** con "grabá" o "ejecutá"
4. **Skill ejecuta:**
   - Inyecta splash con título → app carga detrás
   - Abre con recordVideo → quita splash cuando app lista → graba acciones
   - Trim con re-encode preciso (corta splash + carga)
   - Post-proceso ffmpeg (anti-flicker + H.264)
5. **Entrega:** `pantalla.mp4` (video limpio sin carga)

**Reglas de seguridad:**

- Nunca ejecutar sin aprobación explícita ("grabá", "dale", "ejecutá")
- Nunca clic en botones destructivos sin doble confirmación
- Si la sesión expiró → auto-login con credenciales del skill
- Si todo falla → usuario graba manualmente con Cap.so/Filmora

---

### Etapa 5 — Generar narración con Azure TTS (POR BLOQUE, ANTES de grabar)

**Trigger:** inmediatamente después de aprobar el guion (Etapa 3). Se ejecuta
SIEMPRE antes de la grabación de pantalla (Etapa 4). No al revés.

**¿Por qué antes y por bloque?**

Si se grabara la pantalla primero con duraciones inventadas (`BLOCK_DURATIONS_MS`
adivinadas en el script), el desfase entre voz y video se acumula bloque a
bloque hasta que el audio termina antes que el video y los últimos bloques
quedan sin voz. Al generar la narración por bloque ANTES y medir cada `bN.wav`,
las duraciones reales del audio se convierten en la fuente de verdad para el
script Playwright — el video de cada bloque dura EXACTAMENTE lo que su audio,
más un buffer fijo. Sincronización 1:1 sin adivinar.

**Configuración fija de la voz:**

| Parámetro | Valor |
|-----------|-------|
| Servicio | Microsoft Azure (con subscription key) |
| Voz | `Jorge` (es-MX-JorgeNeural) |
| Estilo | `chat` (conversacional) |
| Velocidad | `1.0` (normal) |
| Pausas entre oraciones | `700ms` (-e 700) |
| Protocolo | WebSocket (`--wss`) para mejor calidad (24 kHz) |
| Herramienta | `bal4web.exe` en `.video-tools/bal4web/` |
| Buffer entre bloques | `1000ms` de silencio (mayor a los 700ms internos entre oraciones → transición natural entre escenas) |
| Salida final | `grabaciones/narracion.wav` (concatenación) |
| Salidas por bloque | `grabaciones/tts/b1.wav`, `b2.wav`, ... (respaldo) |
| Timings calculados | `grabaciones/tts/block-timings.json` (para Playwright) |

**Flujo:**

1. Skill genera `grabaciones/tts/bN.txt` — un archivo por cada bloque del guion,
   con el texto puro de la narración de ese bloque (sin markdown, sin `**`, sin
   emojis, sin `>`). Ejemplo:
   ```
   tts/
   ├── b1.txt   ← "Hola. En este video vamos a ver..."
   ├── b2.txt   ← "Para empezar... vamos al menú lateral..."
   └── b7.txt   ← "Y listo. Así de fácil..."
   ```

2. Skill ejecuta `bal4web` UNA VEZ POR BLOQUE con `-enc utf8` OBLIGATORIO:
   ```bash
   bal4web -f tts/b1.txt -enc utf8 -w tts/b1.wav -s microsoft -l es-MX -n Jorge
     -r 1.0 -e 700 -st chat --ms-apikey [KEY] --ms-region eastus --wss
   ```

   > ⚠️ **CRÍTICO: `-enc utf8` no se puede omitir.** Sin ese flag, bal4web
   > lee los archivos como Windows-1252 (ANSI) y pronuncia mal las tildes,
   > ñ y demás caracteres no-ASCII. Ejemplo: si el `.txt` tiene "cómo",
   > bal4web sin `-enc utf8` lo pronuncia como "cÃ³mo" (los bytes UTF-8
   > multi-byte de "ó" (`C3 B3`) se leen como dos caracteres CP1252).
   > Todos los `.txt` que crea la skill están en UTF-8, así que este flag
   > es la única forma correcta de leerlos.

3. Skill mide cada `bN.wav` con `ffprobe`:
   ```bash
   ffprobe -v quiet -show_entries format=duration -of default=nokey=1:noprint_wrappers=1 tts/b1.wav
   ```

4. Skill genera `block-timings.json` con las duraciones reales + buffer:
   ```json
   {
     "buffer_ms": 1000,
     "blocks": {
       "B1": { "audio_ms": 5240, "total_ms": 6240 },
       "B2": { "audio_ms": 11080, "total_ms": 12080 },
       ...
     },
     "total_ms": 82420
   }
   ```

5. Skill concatena todos los `bN.wav` en `narracion.wav` insertando 1000ms de
   silencio entre bloques (ffmpeg con `anullsrc`):
   ```bash
   ffmpeg -y -f lavfi -t 1.0 -i anullsrc=r=24000:cl=mono
          -i b1.wav -i b2.wav ... 
          -filter_complex "[1:a][0:a][2:a][0:a][3:a]...concat=n=N:v=0:a=1[out]"
          -map "[out]" narracion.wav
   ```

6. Skill actualiza `BLOCK_DURATIONS_MS` del script Playwright con los valores
   de `block-timings.json → blocks[BN].total_ms`. Estos son los tiempos EXACTOS
   que Playwright va a esperar entre acciones. El audio (ya presente en
   `narracion.wav`) se muxea con offset preciso vía `rec.audio()`.

7. Entrega al usuario:
   - `narracion.wav` completo para verificar que suena bien
   - `tts/*.wav` individuales por si hay que regenerar un bloque
   - `block-timings.json` con las duraciones calibradas

**API key:** almacenada en `.video-tools/bal4web/azure-key.txt` (archivo local,
no se sube a git). El skill la lee de ahí automáticamente.

**Reglas del guion TTS (`tts/bN.txt`):**

- Español Colombia (tuteo: "toca", "busca", "escribe")
- Sin negritas ni formato markdown (es texto plano)
- Cada oración es una frase completa con punto final
- Línea vacía entre bloques = pausa larga (~1 segundo)
- `...` = pausa media dentro de una oración (~300ms)
- No empezar con pregunta retórica
- Hook: "Hola. En este video vamos a ver cómo [acción]."
- Nombres de botones/campos sin comillas ni asteriscos

**Formato del guion-tts.txt correcto:**
```
Hola. En este video vamos a ver cómo cambiar tu PIN en Bistro.

Empezamos entrando a tu perfil.

En el menú lateral izquierdo... toca tu avatar o el nombre del negocio.

Y elige Mi Perfil en el desplegable.
```
Formato esperado del usuario:

```
Audio: grabaciones/mesas_v1.mp3 (duración 4:32)
B1: 0:00 - 0:09
B2: 0:09 - 0:22
B3: 0:22 - 0:38
...
```

Con esa info generar `04-mapa-edicion.md` usando la plantilla
[resources/04-template-mapa-edicion.md](resources/04-template-mapa-edicion.md).

El mapa debe convertir cada bloque del guion en una **instrucción de montaje
concreta** con el rango de tiempo real:

```markdown
## 0:00 - 0:09 (B1 — hook inicial)

**Voz:** "En Bistro..."

**Poner encima:**
- 0:00-0:03 → screenshot `screens/01-inicio.png` centrado, sin zoom
- 0:03-0:09 → zoom lento (5%) al botón "Nueva venta"

**Cortes / transiciones:** fade in al inicio (0.3s)
**Nota de edición:** subir un poquito el volumen si suena bajo
```

Reglas para el mapa:

- **Un rango de tiempo por bloque** con formato `MM:SS - MM:SS`
- **Listar los assets visuales exactos** (nombre de archivo, si aplica)
- **Indicar cortes, zooms y transiciones** relativas al rango del bloque
- **Marcar puntos donde faltan grabaciones** con `⚠️ FALTA GRABAR:` y describir
- Si algún bloque del guion no tiene contraparte visual clara (porque el usuario
  no dijo qué grabó), pedir aclaración al final del mapa antes de considerarlo
  final

---

### Etapa 6 — Snippet para TrainingScreen

Al terminar el mapa de edición, generar
`05-snippet-training.md` usando la plantilla
[resources/05-template-snippet-training.md](resources/05-template-snippet-training.md).

Contiene el objeto TypeScript listo para pegar en el array `TRAINING_VIDEOS` de
`screens/TrainingScreen.tsx`:

```typescript
{
  id: '6', // siguiente ID disponible
  title: 'Cómo gestionar mesas',
  description: 'Aprende a crear, abrir cuentas y cobrar mesas paso a paso.',
  videoUrl: 'https://res.cloudinary.com/milenadelpilar/video/upload/vXXX/como_gestionar_mesas.mp4',
  duration: '4:32',
  category: 'ventas',
  icon: 'table_restaurant',
  hidden: true, // cambiar a false cuando esté publicado
}
```

Recordar al usuario:

- Subir el MP4 a Cloudinary → copiar la URL y reemplazar `vXXX/nombre.mp4`
- Cambiar `hidden: true` a `false` cuando esté aprobado para publicar
- Elegir un icono de Material Symbols que refleje el módulo

---

## Índice de módulos

Cada módulo tiene su doc técnica en `docs/caracteristicas/`:

| Módulo | Archivo técnico | Categoría sugerida |
|--------|----------------|--------------------|
| Autenticación (login, OTP) | `autenticacion_acceso.md` | inicio |
| Perfil de usuario | `perfil_usuario.md` | inicio |
| Ventas desktop (POS) | `flujo_ventas_desktop.md` | ventas |
| Ventas móvil / tablet | `flujo_ventas_movil_tablet.md` | ventas |
| Venta por peso o medida | `venta_por_peso_medida.md` | ventas |
| Lector códigos de barras | `lector_codigos_barras.md` | ventas |
| Historial de ventas | `historial_ventas.md` | ventas |
| Anulación / devolución | `anulacion_devolucion_ventas.md` | ventas |
| Mesas y cuentas | `mesas.md` | ventas |
| Comandas de cocina | `comandas_cocina.md` | ventas |
| Impresión térmica QZ Tray | `impresion_termica_qz.md` | ventas |
| Crear productos | `flujo_creacion_productos.md` | inventario |
| Catálogo de productos | `catalogo_productos.md` | inventario |
| Compras e inventario | `flujo_compra_inventario.md` | inventario |
| Conteo de inventario | `conteo_inventario.md` | inventario |
| Registro de mermas | `flujo_registro_mermas.md` | inventario |
| Registro de gastos | `flujo_registro_gasto.md` | inventario |
| Promociones | `flujo_creacion_promociones.md` | inventario |
| Etiquetas por categoría | `etiquetas_por_categoria.md` | inventario |
| Escaneo facturas IA | `escaneo_facturas_ia.md` | inventario |
| Importación Excel | `flujo_importacion_excel.md` | inventario |
| Clientes / cuentas por cobrar | `clientes_cuentas_cobrar.md` | reportes |
| Deudas del negocio | `deudas_negocio.md` | reportes |
| Dashboard | `dashboard.md` | reportes |
| Cierre de turno | `reporte_cierre_turno.md` | reportes |
| Analítica conversacional | `analitica_conversacional.md` | reportes |
| Gestión de personal | `gestion_personal.md` | personal |
| Visor de eventos | `visor_eventos.md` | personal |
| Modo offline | `modo_offline.md` | inicio |
| Asistente IA RAG | `asistente_ia_rag.md` | inicio |
| Ajustes de facturación | `ajustes_facturacion.md` | inicio |
| Suscripciones y pagos | `suscripciones_pagos.md` | inicio |

---

## Convenciones importantes

### Nomenclatura de archivos

- Carpeta del video: `C:\Users\HP\OneDrive\Escritorio\TutorialesBistro\[modulo]/` en snake_case sin acentos
  (ej: `mesas`, `crear_productos`, `impresora_termica`)
- Archivos numerados dentro: `01-plan.md`, `02-guion.md`, etc.
- **IMPORTANTE:** Esta carpeta está FUERA del repo Bistro para no ocupar espacio en producción.
  Los archivos de video, audio y documentos de producción no se suben al repo.
- **NO eliminar `docs/videos_tutoriales/`** del repo Bistro. Esa carpeta debe permanecer
  (aunque vacía) como placeholder para uso futuro. Al mover archivos al escritorio,
  solo mover el contenido, nunca borrar la carpeta padre.

### Categoría en TrainingScreen

Las 5 categorías disponibles (ver `TRAINING_CATEGORIES` en el archivo):

- `inicio` — Primeros Pasos (icono `rocket_launch`)
- `ventas` — Punto de Venta (icono `payments`)
- `inventario` — Inventario (icono `inventory`)
- `personal` — Personal (icono `badge`)
- `reportes` — Reportes (icono `bar_chart`)

### Formato del guion — checklist rápida

- ✅ Bloques numerados `B1`, `B2`, `B3`...
- ✅ Cada bloque tiene narración + visual sugerido
- ✅ Bloques con info no visible en UI incluyen `🎞️ Overlay animado`
- ✅ Duración por bloque: 5-15s (15-45 palabras)
- ✅ Español Colombia natural, sin tecnicismos ni diminutivos
- ✅ Nombres de botones/campos en **negrita**
- ✅ Transiciones explícitas al cambiar de escena
- ✅ **Instrucciones explícitas de acción** ("tocamos", "pulsamos", "elegimos",
  "vamos a...") — el video acompaña la voz, no la reemplaza
- ✅ **Verbos variados** entre bloques consecutivos para no sonar repetitivo —
  ver banco de vocabulario en [02-template-guion.md](resources/02-template-guion.md)
- ❌ Sin narrar la intro/outro con branding (queda para después)
- ❌ Repetir el mismo verbo 3 veces seguidas ("tocamos... tocamos... tocamos...")
- ❌ Usar diminutivos ("botoncito", "ventanita", "campito", "pedacito", etc.) — si algo es pequeño, decir "pequeño" o "corto". Tono profesional y directo.
- ❌ Proponer overlays sin verificar el código del componente primero

---

## Pendiente: branding

Cuando el usuario decida armar branding (intro/outro/marca de agua), se
implementará según [resources/06-branding-pendiente.md](resources/06-branding-pendiente.md).
Por ahora los guiones dejan hueco para insertar branding después sin
retocar la narración.

---

## Recursos de este skill

- [📋 Template de plan](resources/01-template-plan.md)
- [🎙️ Template de guion (bloques numerados)](resources/02-template-guion.md)
- [✅ Template de checklist de grabación](resources/03-template-checklist.md)
- [🎬 Template de mapa de edición](resources/04-template-mapa-edicion.md)
- [📦 Template de snippet TrainingScreen](resources/05-template-snippet-training.md)
- [🎨 Nota de branding (pendiente)](resources/06-branding-pendiente.md)
- [🛠️ Herramientas y setup recomendado](resources/07-herramientas-setup.md)
- [🤖 Grabación con Playwright (flujo automatizado)](resources/08-playwright-grabacion.md)
- [🎞️ Overlays animados con HyperFrames](resources/09-hyperframes-overlays.md)
