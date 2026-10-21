# Plantilla del checklist de grabación

Usar esta plantilla para `docs/videos_tutoriales/[modulo]/03-checklist.md`.

**Objetivo:** que el usuario nunca empiece a grabar sin tener todo listo.
Regrabar por olvidos es lo más costoso del proceso.

---

## Plantilla

```markdown
# Checklist de grabación — [Título del video]

**Antes de encender el micro, verificar TODO lo de abajo.**

## 📋 1. Datos de prueba en Bistro

Crear en la app antes de grabar (con nombres realistas y coherentes):

### Productos
- [ ] `Café americano` — categoría **Bebidas** — $5.000
- [ ] `Sándwich jamón y queso` — categoría **Comida** — $12.000
- [ ] `[otros productos necesarios]`

### Clientes / Mesas / Empleados
- [ ] Cliente `Juan Pérez` — teléfono `3001234567`
- [ ] Mesa `Mesa 5` — 4 sillas
- [ ] Empleado `María` — rol **Cajero**
- [ ] `[otros según el módulo]`

### Estado inicial de caja e inventario
- [ ] Caja abierta con base `$50.000`
- [ ] Inventario del `Café americano` en `10 unidades`
- [ ] Turno del día de hoy iniciado
- [ ] `[otros según el módulo]`

## 💻 2. Software de grabación de pantalla

**Ruta por defecto — Playwright (el skill graba por vos):**

- [ ] `.video-tools/` instalado en la raíz del workspace (una sola vez)
- [ ] Chromium de grabaciones cerrado (si quedó abierto de sesión anterior)
- [ ] Guion aprobado y script `.mjs` generado por el skill
- [ ] Skill autorizado a ejecutar el script (aprobación explícita)

**No requiere acción manual del usuario**: Playwright lanza Chromium solo con
el perfil `bistro-recording-profile` donde ya hay sesión en `posbistro.online`.

Ver [08-playwright-grabacion.md](08-playwright-grabacion.md) para la guía completa.

**Ruta manual (fallback — solo si Playwright no cubre la escena):**

- [ ] **Cap.so** / **Filmora** / **ShareX** para grabar manualmente
- [ ] Guardar en `grabaciones/` con nombre descriptivo
- [ ] Editor de video: **CapCut Desktop** o **Filmora**

## 🎤 3. Grabación de audio

- [ ] Micrófono conectado y probado (grabar 10s de prueba)
- [ ] Lugar silencioso (sin ventiladores, ventanas cerradas)
- [ ] Sin eco (si hay eco, poner cortina o cojín cerca del micro)
- [ ] Distancia micro-boca: 15-20 cm
- [ ] Vaso de agua a mano
- [ ] Guion impreso o en pantalla secundaria (no en la que se está grabando)

**Software de grabación de audio recomendado:**
- [Audacity](https://www.audacityteam.org/) (gratis, Windows) — grabar en WAV, exportar a MP3
- Grabadora de voz de Windows (más rápido, menos calidad)

## 📱 4. Dispositivos físicos (según el video)

- [ ] Celular Android con **scrcpy** instalado y espejeando a PC
  - Instalar: https://github.com/Genymobile/scrcpy
- [ ] Impresora térmica **conectada, encendida y con papel**
- [ ] Escáner USB de códigos de barras probado
- [ ] Cámara del celular lista para foto del ticket físico
- [ ] Tablet Android con Bistro APK instalado (si se necesita vista mesero)

## 🖥️ 5. Estado del navegador y app

Esto aplica SOLO si grabás manualmente (Playwright no necesita estos pasos):

- [ ] Chrome abierto en `https://posbistro.online`
- [ ] Sesión iniciada como el rol correcto (ver plan)
- [ ] Ventana Chrome maximizada, sin extensiones visibles
- [ ] Barra de bookmarks OCULTA (Ctrl+Shift+B)
- [ ] Modo incógnito NO recomendado (borra estado offline)
- [ ] Zoom del navegador al 100% (Ctrl+0)
- [ ] Notificaciones de Windows silenciadas (modo No molestar)
- [ ] Cerrar apps que hagan sonido (Spotify, Slack, WhatsApp)

## 🎬 6. Preparación de tomas específicas

Repasar el guion y anotar aquí las tomas que necesitan preparación especial:

- **B3 — Escaneo de EAN:** producto físico con código de barras a mano
- **B5 — Impresión de ticket:** verificar que la impresora esté conectada y con papel
- **B7 — Split-screen mesero/caja:** scrcpy activo y ventana redimensionada al 50%
- **Bn — [tomas específicas del video]**

## ✅ 7. Prueba final antes de grabar

- [ ] Hacer una toma de prueba de 30s del bloque B1
- [ ] Revisar: ¿se ve bien la resolución? ¿se escucha el audio?
- [ ] Revisar: ¿el cursor se ve? ¿el zoom automático funciona?
- [ ] Verificar espacio en disco (al menos 5 GB libres para grabaciones)

---

## 🚀 Cuando todo esté OK

**Ruta Playwright (por defecto):**

1. Cerrar TODAS las ventanas de Chrome
2. Abrir Chrome con `--remote-debugging-port=9222`
3. Iniciar sesión en Bistro y dejar la pestaña en la pantalla inicial
4. Avisar al skill "listo, arrancá la grabación"
5. Esperar a que el skill termine (ver `grabaciones/pantalla-vN.webm`)
6. Grabar tu voz en paralelo o después con Audacity/Grabadora Windows
7. Devolver al asistente: audio + timestamps por bloque

**Ruta manual (fallback):**

1. Abrir Cap.so / Cursorful / herramienta elegida
2. Configurar formato de salida
3. Grabar cada bloque siguiendo el guion
4. Guardar en `docs/videos_tutoriales/[modulo]/grabaciones/`
5. Grabar audio con Audacity
6. Devolver al asistente: audio + timestamps por bloque
```

---

## Notas de uso del checklist

- **No cortar corners.** Un olvido pequeño (Spotify sonando, notificación de
  WhatsApp) obliga a regrabar todo.
- **La grabación de pantalla y la de audio se pueden hacer por separado** —
  muchas veces sale mejor así porque podés concentrarte en una cosa a la vez.
  Después se sincronizan en el editor guiándose por los timestamps.
- **Guardar las tomas crudas en `grabaciones/`** con nombres claros:
  - `pantalla-b1-b2-b3.mp4`
  - `pantalla-b4-mesa5-cobro.mp4`
  - `audio-narracion-v1.mp3`
- **Si algo sale mal en un bloque específico**, se puede regrabar solo ese
  bloque y remendar en el editor. El sistema de bloques está diseñado para eso.
