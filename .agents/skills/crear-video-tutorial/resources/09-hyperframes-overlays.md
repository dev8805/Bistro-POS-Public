# 🎞️ Overlays animados con HyperFrames

## Qué es

HyperFrames es un framework open source (Apache 2.0) de HeyGen que convierte
HTML + CSS + animaciones GSAP en video MP4/WebM determinista. Lo usamos para
generar clips cortos con fondo transparente que el usuario superpone en Filmora.

**Repo:** https://github.com/heygen-com/hyperframes
**Docs:** https://hyperframes.heygen.com/introduction
**Requisitos:** Node.js 22+, ffmpeg (ya instalado)

---

## Por qué HyperFrames y no Remotion

| Criterio | HyperFrames | Remotion |
|----------|-------------|----------|
| Authoring | HTML plano + data-attributes | React/JSX |
| Generación por agente | Nativo (HTML que cualquier LLM genera) | Posible pero más complejo |
| Setup | `npx hyperframes init` y listo | Proyecto React completo |
| Licencia | Apache 2.0 (libre total) | Gratis ≤3 personas, pago después |
| Transparencia | WebM VP9 alpha | ProRes/WebM alpha |
| Dependencia React | No requiere | Sí requiere |

**Decisión:** HyperFrames encaja mejor porque Kiro genera HTML directamente,
no necesita mantener un proyecto React separado, y es 100% libre.

---

## Setup (una sola vez)

```bash
# Desde la raíz del workspace
cd .video-tools
npx hyperframes init overlays-bistro
```

Estructura resultante:
```
.video-tools/overlays-bistro/
├── compositions/          ← HTMLs de cada overlay (Kiro los genera)
├── package.json
└── hyperframes.config.js  ← configuración base
```

---

## Anatomía de un overlay HTML

```html
<div id="root" data-composition-id="B7-advertencia-roles"
     data-start="0" data-width="1366" data-height="720">

  <!-- El overlay propiamente dicho -->
  <div id="overlay" class="clip"
       data-start="0" data-duration="6" data-track-index="0"
       style="position:absolute; bottom:80px; left:50%;
              transform:translateX(-50%);
              background:rgba(26,26,26,0.92);
              border:2px solid #f87171; border-radius:12px;
              padding:16px 24px; display:flex; align-items:center;
              gap:12px; max-width:600px;">
    <span style="font-size:32px;">⚠️</span>
    <div>
      <p style="color:white; font-size:24px; font-weight:600; margin:0;">
        Cada usuario cambia solo su propio PIN
      </p>
      <p style="color:#cbd5e1; font-size:18px; margin:4px 0 0;">
        El dueño no puede cambiar el de otros empleados
      </p>
    </div>
  </div>

  <!-- Animación GSAP (seekable) -->
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <script>
    const tl = gsap.timeline({ paused: true });
    // Entrada: slide-up + fade-in (0.3s)
    tl.from("#overlay", { y: 40, opacity: 0, duration: 0.3, ease: "power2.out" }, 0);
    // Salida: fade-out (0.4s) — empieza 0.4s antes del final
    tl.to("#overlay", { opacity: 0, duration: 0.4 }, 5.5);
    // Registrar timeline para HyperFrames
    window.__timelines = window.__timelines || {};
    window.__timelines["B7-advertencia-roles"] = tl;
  </script>
</div>
```

### Reglas del HTML

- `data-composition-id`: identificador único (usar `B[N]-[nombre-corto]`)
- `data-width` / `data-height`: siempre `1366` x `720` (resolución de grabación)
- `data-duration`: duración total del clip en segundos
- Sin `background` en el `#root` → transparencia
- Usar `class="clip"` en el elemento principal
- GSAP timeline registrada en `window.__timelines`

---

## Comando de renderizado

```bash
npx -y hyperframes render --format webm --fps 30 --quality standard --output B7-advertencia-roles.webm
```

El comando se ejecuta desde `.video-tools/overlays-bistro/` donde el `index.html`
contiene el overlay a renderizar. Después se mueve el `.webm` generado a
`docs/videos_tutoriales/[modulo]/grabaciones/overlays/`.

### Flujo para renderizar un overlay

1. Editar `.video-tools/overlays-bistro/index.html` con el HTML del overlay
2. Ejecutar `npx -y hyperframes render --format webm --fps 30 --quality standard --output [nombre].webm`
3. Mover el `.webm` a `grabaciones/overlays/`
4. Restaurar `index.html` para el siguiente overlay (o mantener uno por branch)

### Flags importantes

| Flag | Valor | Por qué |
|------|-------|---------|
| `--format webm` | WebM VP9 con alpha | Filmora soporta alpha en WebM directamente |
| `--fps 30` | 30fps | Suficiente para overlays suaves |
| `--quality standard` | CRF 18 | Visualmente lossless |

### Preview y uso en Filmora

El mismo archivo `.webm` sirve para ambas cosas:
- **Preview:** abrilo en Chrome (soporta VP9 alpha, fondo transparente)
- **Filmora:** arrastralo a una pista encima del video, la transparencia funciona

**⚠️ NO usar `--format mov` (ProRes 4444)** — Filmora no soporta ProRes con
alpha. Eso es para Premiere/DaVinci/Final Cut.

---

## Estilo visual base (Design System Bistro)

Todos los overlays siguen esta base visual:

### Colores por tipo

| Tipo | Icono | Borde | Uso |
|------|-------|-------|-----|
| 💡 Tip | bombilla | `#fbbf24` (amber-400) | Info adicional útil |
| ⚠️ Advertencia | triángulo | `#f87171` (red-400) | Restricción/precaución |
| 📌 Callout | pin | `#60a5fa` (blue-400) | Destacar concepto |
| 📊 Diagrama | gráfico | `#34d399` (emerald-400) | Flujo/relación |
| 🏷️ Etiqueta | tag | `#94a3b8` (slate-400) | Nombre/función |

### Estilos comunes

```css
/* Tarjeta base */
background: rgba(26, 26, 26, 0.92);
border: 2px solid [color-del-tipo];
border-radius: 12px;
padding: 16px 24px;
max-width: 600px;

/* Texto principal */
color: white;
font-family: 'Inter', sans-serif;
font-size: 24px;
font-weight: 600;

/* Texto secundario */
color: #cbd5e1;
font-size: 18px;
font-weight: 400;

/* Icono */
font-size: 32px;
```

### Animaciones estándar

| Animación | GSAP | Duración |
|-----------|------|----------|
| Entrada slide-up | `from(el, { y: 40, opacity: 0, ease: "power2.out" })` | 0.3s |
| Entrada scale-in | `from(el, { scale: 0.8, opacity: 0, ease: "back.out" })` | 0.4s |
| Salida fade-out | `to(el, { opacity: 0 })` | 0.3-0.4s |
| Salida slide-down | `to(el, { y: 30, opacity: 0 })` | 0.3s |

### Posiciones

| Nombre | CSS |
|--------|-----|
| centro-inferior | `bottom: 80px; left: 50%; transform: translateX(-50%)` |
| centro | `top: 50%; left: 50%; transform: translate(-50%, -50%)` |
| superior-derecha | `top: 60px; right: 40px` |
| inferior-izquierda | `bottom: 80px; left: 40px` |

---

## Integración con el mapa de edición (04-mapa-edicion.md)

Cuando hay overlays, el mapa de edición incluye una línea extra por bloque:

```markdown
## 0:53 - 1:03 (B7 — Aclaración importante)

**Voz:** "Recordá una cosa: cada persona..."

**Video:** pantalla.mp4 (estado post-modal cerrado)

**Overlay:** `overlays/B7-advertencia-roles.webm` @ 0:53 → pista 2, duración 7s

**Instrucción Filmora:** arrastrá el .webm a la pista de overlay, inicio en 0:53
```

---

## Checklist antes de renderizar

- [ ] El usuario aprobó la propuesta de overlays (texto, tipo, posición)
- [ ] El HTML usa la resolución correcta (1366x720)
- [ ] El HTML NO tiene background en el root (transparencia)
- [ ] La duración del overlay coincide con la duración del bloque narrado
- [ ] La animación de salida termina ANTES del final del data-duration
- [ ] El texto es legible (≤2 líneas, fuente ≥18px)
- [ ] Se usa Inter como font-family (o la que esté cargada)

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| Overlay sale con fondo negro en Filmora | Verificar que el archivo es `.webm` VP9 con alpha (no MP4) |
| Texto cortado | Reducir font-size o aumentar max-width |
| Animación no se ve | Verificar que el timeline esté en `window.__timelines` |
| HyperFrames no encuentra ffmpeg | Verificar `ffmpeg` en PATH (winget install Gyan.FFmpeg) |
| Node version error | HyperFrames requiere Node.js 22+ |
| Chrome no encontrado | Ejecutar `npx -y hyperframes browser ensure` |
| Error "Not a directory" | Ejecutar desde dentro de `.video-tools/overlays-bistro/` |
| Preview en Chrome no muestra transparencia | Verificar que no hay background en html/body del HTML |
