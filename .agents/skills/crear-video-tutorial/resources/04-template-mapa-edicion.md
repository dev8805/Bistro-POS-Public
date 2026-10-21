# Plantilla del mapa de edición

Este documento se genera **DESPUÉS** de que el usuario devuelva el audio grabado
con los timestamps por bloque. Convierte cada bloque del guion en una
**instrucción de montaje concreta** con tiempos reales del audio.

Archivo destino: `docs/videos_tutoriales/[modulo]/04-mapa-edicion.md`

---

## Formato esperado del input del usuario

Cuando el usuario devuelve el audio, debe pasar algo así:

```
Audio: docs/videos_tutoriales/mesas/grabaciones/narracion-v1.mp3
Duración total: 4:32

Timestamps por bloque:
B1: 0:00 - 0:09
B2: 0:09 - 0:22
B3: 0:22 - 0:38
B4: 0:38 - 0:51
B5: 0:51 - 1:15
...
Bn: 4:20 - 4:32

Grabaciones de pantalla disponibles:
- pantalla-v1.webm (0:00 - 4:35) ← generado por Playwright
- pantalla-v1.log ← log de acciones con timestamps
- toma-manual-impresora.mp4 (0:00 - 0:08) ← grabada aparte con cámara
```

**Con Playwright:** el mapa se apoya en el archivo `.log` que el skill produjo
junto al WebM. Ese log dice qué acción ocurrió en qué segundo del video, lo
que permite alinear cada bloque `Bn` del audio con el momento exacto del WebM.

Si el usuario no da esa info completa, PREGUNTAR antes de generar el mapa.

---

## Plantilla del mapa de edición

```markdown
# Mapa de edición — [Título del video]

**Audio:** `[ruta al archivo mp3]`
**Duración total:** X min Y s
**Editor recomendado:** Cap.so o CapCut Desktop
**Resolución objetivo:** 1920x1080, 30 fps

---

## 📐 Timeline general

```
0:00                             1:00                             2:00
│                                │                                │
├──[B1]──┬──[B2]──┬──[B3]────────┬──[B4]────┬──[B5]────────┬─────
│  hook  │ nueva  │ escaneo/     │ agregar  │ cobrar y     │ ...
│        │ venta  │ búsqueda     │ productos│ facturar     │
```

---

## 🎬 Escenas por bloque

### 0:00 - 0:09 → B1 (hook inicial)

**🎙️ Voz:**
> "En 3 minutos vas a aprender a manejar mesas en Bistro sin complicarte."

**📺 Visual a montar:**
| Rango del bloque | Contenido | Fuente |
|------------------|-----------|--------|
| 0:00 - 0:03 | Screenshot pantalla principal Bistro | `screenshots/inicio.png` |
| 0:03 - 0:09 | Vista general sin zoom | `pantalla-v1.webm` (0:00 - 0:06) |

**🔍 Zooms manuales sugeridos (agregar en el editor):**
- 0:05 - 0:09 → zoom del 100% al 130% centrado en botón **Mesas**
- Curva de easing: `ease-in-out`, duración 1s

**🎞️ Cortes y transiciones:**
- Fade in (0.3s) al comienzo
- Corte limpio a B2

**📝 Nota de edición:**
- Verificar que el zoom no se pase del borde de la imagen
- Volumen de audio: normal (0 dB)

---

### 0:09 - 0:22 → B2 (abrir Mesas)

**🎙️ Voz:**
> "Empezamos yendo a la sección **Mesas** desde el menú principal. Aquí ves
> todas las mesas del negocio."

**📺 Visual a montar:**
| Rango del bloque | Contenido | Fuente |
|------------------|-----------|--------|
| 0:09 - 0:14 | Grabación: cursor va al botón **Mesas** y hace clic | `grabaciones/pantalla-crear-mesa.mp4` (0:00 - 0:05) |
| 0:14 - 0:22 | Grabación: se ve la pantalla de mesas con todas las cards | `grabaciones/pantalla-crear-mesa.mp4` (0:05 - 0:13) |

**🎞️ Cortes:**
- Corte limpio al cambio de pantalla
- Zoom out ligero para mostrar el grid completo de mesas

---

### 0:22 - 0:38 → B3 (crear mesa nueva)

**🎙️ Voz:**
> "Para crear una mesa nueva tocamos en **+ Nueva mesa**, escribimos el nombre
> y elegimos cuántas sillas tiene."

**📺 Visual a montar:**
| Rango del bloque | Contenido | Fuente |
|------------------|-----------|--------|
| 0:22 - 0:26 | Cursor a botón **+ Nueva mesa**, clic | `grabaciones/pantalla-crear-mesa.mp4` (0:13 - 0:17) |
| 0:26 - 0:32 | Modal abierto, se escribe "Mesa 5" en el campo | `grabaciones/pantalla-crear-mesa.mp4` (0:17 - 0:23) |
| 0:32 - 0:38 | Selector de sillas, se elige 4, se guarda | `grabaciones/pantalla-crear-mesa.mp4` (0:23 - 0:29) |

**🎞️ Cortes:**
- Zoom sutil al modal al abrir
- Nada más

---

### [continuar bloque por bloque hasta Bn]

---

## ⚠️ FALTAN GRABAR

Bloques del guion que **no tienen contraparte visual disponible**:

- **B7** — necesita foto de la impresora térmica imprimiendo el ticket
  - Acción: sacar foto con el celular apoyada en la impresora
  - Formato: JPG horizontal, mínimo 1920x1080
- **B9** — necesita grabación de la vista mesero en tablet
  - Acción: iniciar scrcpy con celular, grabar 15s de la acción X
- **[otros bloques sin visual]**

---

## 🎨 Detalles de montaje global

**Música de fondo:** ninguna por ahora. Se agregará cuando se defina branding
(ver [06-branding-pendiente.md](06-branding-pendiente.md)).

**Intro/outro:** ninguna todavía. Dejar 1s de silencio al principio y al final
para poder agregar branding después sin recortar la narración.

**Subtítulos:** opcional. Si se quieren, ver sección "Subtítulos" abajo.

**Marca de agua:** ninguna todavía.

**Volumen del audio:**
- Voz: 0 dB (referencia)
- Verificar que no haya picos por encima de -6 dB
- Aplicar compresor suave si el volumen varía mucho

**Exportación final:**
- Formato: MP4
- Códec: H.264
- Resolución: 1920x1080
- Framerate: 30 fps
- Bitrate: 6-8 Mbps
- Audio: AAC 128 kbps

---

## 📝 Subtítulos (opcional)

Si se quieren generar subtítulos en español:

1. Subir el audio final a [Cloudinary](https://cloudinary.com/) — tiene
   generación automática de subtítulos SRT integrada.
2. O usar Whisper API (~$0.006 por minuto de audio):
   - Endpoint: `https://api.openai.com/v1/audio/transcriptions`
   - Modelo: `whisper-1`
   - Language: `es`
3. Revisar el SRT generado, corregir nombres de botones y términos técnicos.
4. Agregar el SRT como pista al video final en el editor.

---

## 🚀 Después del montaje

1. Exportar MP4 con la config de arriba
2. Revisar el video completo antes de subir (buscar cortes duros, audio mal
   sincronizado, texto ilegible)
3. Subir a Cloudinary:
   - Usar la misma cuenta `milenadelpilar` que ya está en `TrainingScreen.tsx`
   - Nombre del archivo en Cloudinary: `Como_[Accion]_en_Bistro.mp4`
   - Copiar la URL pública que empieza con `https://res.cloudinary.com/milenadelpilar/video/upload/vXXXXXX/`
4. Ir al archivo `05-snippet-training.md` — ahí está el objeto TypeScript
   listo para pegar en `TRAINING_VIDEOS`.
```

---

## Reglas al generar este mapa

1. **Un rango de tiempo por bloque**, con formato `MM:SS - MM:SS`.
2. **Listar los archivos fuente exactos** que se usan en cada rango.
3. **Sección obligatoria "🔍 Zooms manuales sugeridos"** por bloque, con:
   - Rango exacto (`MM:SS - MM:SS`)
   - Nivel de zoom (`100% → 130%`, `100% → 150%`, etc.)
   - Elemento objetivo (`centrado en botón X`, `sobre modal Y`)
   - Duración del zoom (`0.5s`, `1s`, `1.5s`) y easing (`ease-in-out`, `linear`)
4. **Nunca inventar timestamps ni assets.** Si el usuario no dio el dato,
   preguntar antes de generar el mapa.
5. **Usar el archivo `.log` de Playwright como fuente** para alinear cada
   bloque `Bn` con el momento exacto del WebM (Playwright registra qué acción
   ocurrió en qué milisegundo).
6. **Marcar todos los faltantes con `⚠️ FALTA GRABAR`** al final del documento.
7. **Cortes y transiciones son sugerencias**, el usuario los ajusta al montar.
8. **Preferir cortes limpios sobre transiciones sofisticadas.** Los fades
   sirven al principio y al final del video, nada más.
9. **Los zooms los agrega el usuario en el editor** — el WebM de Playwright
   viene "plano". El mapa debe darle instrucciones claras de dónde poner cada
   zoom para que el video no se vea estático.
