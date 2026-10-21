# Branding — pendiente para más adelante

**Estado:** el usuario dejó el branding para una fase posterior. Este documento
guarda las decisiones pendientes para que, cuando llegue el momento, el flujo
esté listo sin tener que rehacer los videos ya grabados.

---

## 🎯 Qué queda por definir

### 1. Intro (inicio del video)

Duración objetivo: **3-5 segundos**.

**Opciones a evaluar cuando se defina:**

- Intro estática: logo Bistro + tagline durante 3s con fade in/out
- Intro animada corta: logo aparece con leve animación (rotate/scale)
- Intro dinámica: montaje rápido de 3-4 pantallas de la app con música

### 2. Outro (final del video)

Duración objetivo: **3-5 segundos**.

**Opciones a evaluar:**

- "Fin del video" con logo y link a más tutoriales
- CTA: "Descarga la app" / "Contacta soporte"
- Fade to black simple con solo el logo

### 3. Marca de agua durante el video

**Opciones:**

- Logo pequeño en esquina inferior derecha con opacidad 30-40% durante todo el video
- Sin marca de agua (más limpio, menos protegido)
- Solo en momentos específicos (intro extendida)

### 4. Música de fondo

**Opciones:**

- Sin música (foco total en la voz)
- Música instrumental suave durante todo el video (~-24 dB, no compite con voz)
- Música solo en intro/outro

**Recursos sugeridos para música libre de derechos:**
- [YouTube Audio Library](https://studio.youtube.com/) — gratis, uso comercial
- [Uppbeat](https://uppbeat.io/) — gratis con atribución o $6.99/mes
- [Epidemic Sound](https://www.epidemicsound.com/) — $15/mes, buena para producciones profesionales

### 5. Paleta y tipografía en pantalla

Basadas en el design system de Bistro (`.kiro/steering/tech.md`):

- **Primary:** `amber-400` (#fbbf24) — hover `amber-500`
- **Secundario:** Emerald Dark (#102218)
- **Fondo:** `slate-50` (claro) / gris oscuro (dark)

**Tipografía sugerida:** la misma familia que usa la app (revisar
`tailwind.config.js`).

---

## 🛠️ Cuando se defina el branding

Este es el flujo propuesto para no tener que rehacer los videos ya grabados:

### Opción A — Branding manual en editor (rápido, no repetible)

1. Crear una vez la intro y outro en Cap.so, CapCut o DaVinci Resolve.
2. Exportar cada una como MP4 corto (3-5s).
3. Al montar cada video, agregar intro al principio y outro al final.

**Ventaja:** cero configuración técnica.
**Desventaja:** si cambia el branding, hay que rehacer los MP4 y volver a montar
cada video.

### Opción B — Branding programático con Remotion (repetible, más setup)

1. Instalar Remotion como proyecto separado (fuera de Bistro app).
2. Crear componentes React para intro y outro con la paleta Bistro.
3. Renderizar cada intro/outro con `npx remotion render`.
4. Componer con FFmpeg:
   ```bash
   ffmpeg -i intro.mp4 -i video-principal.mp4 -i outro.mp4 \
     -filter_complex "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a]" \
     -map "[v]" -map "[a]" video-final.mp4
   ```

**Ventaja:** si cambia el branding, se re-renderiza automático y se re-concatena
con todos los videos existentes.
**Desventaja:** requiere setup técnico y ~1 día de trabajo inicial.

**Referencia Remotion:** https://www.remotion.dev/

### Opción C — Branding por overlay en Cloudinary

Cloudinary permite aplicar transformaciones al vuelo. Se puede:

1. Subir intro y outro como assets separados en Cloudinary.
2. Usar la API de video overlay para concatenar con el video principal.
3. El `videoUrl` en `TRAINING_VIDEOS` apunta a la URL transformada.

**Ventaja:** cambio de branding sin re-subir videos.
**Desventaja:** más complejo, límites de transformaciones en plan gratis de
Cloudinary.

---

## 📝 Ajustes que necesita el skill cuando se implemente branding

Cuando se decida, actualizar en el skill:

1. **`SKILL.md`** — quitar la nota "sin intro/outro con branding todavía" en la
   Etapa 3.
2. **`02-template-guion.md`** — agregar bloque B0 (intro) y Bn+1 (outro) al
   guion, o mantenerlos fuera del conteo y solo mencionar duración.
3. **`04-template-mapa-edicion.md`** — agregar sección específica para intro y
   outro con el asset elegido.
4. **`05-template-snippet-training.md`** — recordar que la `duration` en
   TrainingScreen debe incluir intro y outro.
5. **Este archivo** — cambiar título a `06-branding-implementado.md` y
   documentar la decisión final.
