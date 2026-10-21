---
name: generar-video-flow
description: Genera la estructura de escenas (máx 10s), lista de tomas de pantalla de Bistro POS, indicación de qué imágenes adjuntar y prompts cinematográficos limpios de nombres para Google Flow (Veo/Omni) y edición en Filmora. Úsese cuando el usuario quiera crear videos tutoriales o comerciales de Bistro POS combinando personajes reales en Google Flow y grabaciones de pantalla.
---

# Generador de Videos con Google Flow y Filmora para Bistro POS

Esta skill permite estructurar tutoriales y videos comerciales para Bistro POS, combinando:
1. **Google Flow (Veo / Omni)**: Generación de escenas cinemáticas de hasta 10 segundos utilizando los personajes y fondos oficiales del proyecto.
2. **Grabaciones reales de Bistro POS**: Captura nítida de la pantalla en móvil o desktop.
3. **Filmora**: Montaje final sincronizado (Speed Ramping, cortes ágiles y Chroma Key).

---

## 📂 Galería Oficial de Activos (Fondos y Caracteres)

Antes de generar cualquier propuesta, la skill debe consultar los archivos disponibles en:
`resources/FONDOS Y CARACTERES/`

### Caracteres Disponibles:
* **Don Carlos (Dueño / Tendero):** `don Carlos.jpeg`, `Don carlos 2.jpeg`
* **Laura (Cajera / Administradora):** `Laura-cajera.jpeg`, `laura cajera.jpeg`
* **El Proveedor (Distribuidor de Mercancía):** `proveedor.jpeg`
* **El Cliente (Comprador en mostrador):** `cliente.jpeg`

### Fondos de Tienda Disponibles:
* `Fondo_tienda_1_202608242029.jpeg` (Mostrador principal con estanterías y luz cálida)
* `fondo_tienda_2_202608242029.jpeg` (Interior con pasillos y productos)
* `fondo_tienda_3_202608242029.jpeg` (Área de caja / checkout)
* `fondo_tienda_4_202608242029.jpeg` (Vista amplia de minimarket)

---

## ⚠️ REGLA CRÍTICA DE PROMPTS Y FILTROS DE SEGURIDAD

Para evitar que el filtro de seguridad de Google bloquee la generación por "personas famosas":

1. **En la comunicación con el USUARIO:**
   * **SÍ** debes especificar claramente qué imagen de carácter y qué imagen de fondo debe seleccionar/adjuntar en Google Flow (ejemplo: *"Selecciona el carácter `don Carlos.jpeg` y el fondo `Fondo_tienda_1_202608242029.jpeg`"*).

2. **En el PROMPT para Google Flow:**
   * **NUNCA** uses nombres propios ("Don Carlos", "Laura", etc.).
   * Usa siempre referencias genéricas en inglés:
     - `The selected character...`
     - `An original fictional store owner...`
     - `The cashier behind the counter...`
     - `The customer holding the item...`

---

## 🎬 Flujo de Ejecución al Solicitar un Tutorial

Cuando el usuario pida un tutorial (ej: *"Quiero el tutorial de escaneo de compras con IA"*):

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Inspeccionar el Código de Bistro POS                     │
│    - Extraer rutas, botones y lógica exacta del módulo      │
├─────────────────────────────────────────────────────────────┤
│ 2. Seleccionar Activos Recomendados                         │
│    - Elegir las imágenes exactas de FONDOS Y CARACTERES     │
├─────────────────────────────────────────────────────────────┤
│ 3. Desglosar en Escenas (Máx 10s por escena)                │
│    - Intercalar: Google Flow (Contexto) ⇄ Grabación Bistro  │
├─────────────────────────────────────────────────────────────┤
│ 4. Lista de Grabaciones de Pantalla para el Usuario         │
│    - Qué abrir, qué accionar y segundos exactos             │
├─────────────────────────────────────────────────────────────┤
│ 5. Generar Prompts Seguros para Google Flow                 │
│    - Sin nombres propios, listos para copiar y pegar        │
├─────────────────────────────────────────────────────────────┤
│ 6. Guía de Montaje en Filmora                               │
│    - Pistas, Speed Ramping y Chroma Key                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 Estructura de Salida Obligatoria

Toda respuesta de la skill debe seguir estrictamente esta plantilla:

### 1. Resumen del Tutorial
* **Tema**: [Nombre de la función / tutorial]
* **Dispositivo**: [Móvil / Desktop / Ambos]
* **Personajes**: [Don Carlos / Laura / Proveedor / Cliente]
* **Duración total estimada**: [Ej. 30 - 45 segundos]

---

### 2. Activos a Seleccionar en Google Flow
Indica al usuario qué archivos adjuntar o seleccionar antes de generar cada escena:
* **Carácter a usar:** `[ej. don Carlos.jpeg]`
* **Fondo a usar:** `[ej. Fondo_tienda_1_202608242029.jpeg]`

---

### 3. Lista de Grabaciones Reales Requeridas (Para el Usuario)
* **Grabación 1 (X seg)**: [Ruta/Botón exacto de Bistro POS, qué acción hacer].
* **Grabación 2 (X seg)**: [Resultado, modal o ticket en Bistro POS].

---

### 4. Guion y Desglose de Escenas (Timeline para Filmora)

| Escena | Duración | Tipo de Clip | Activo / Origen | Acción / Narración |
| :--- | :--- | :--- | :--- | :--- |
| **01** | 0:00 - 0:07 | **Google Flow** | `don Carlos.jpeg` + `Fondo 1` | Introducción y recepción del problema/pedido. |
| **02** | 0:07 - 0:13 | **Bistro POS** | Grabación Pantalla | Muestra la interfaz en acción (acelerada 2x). |
| **03** | 0:13 - 0:19 | **Google Flow** | `don Carlos.jpeg` + `Fondo 1` | Reacción del personaje sosteniendo el teléfono/PC. |
| **04** | 0:19 - 0:26 | **Bistro POS** | Grabación Pantalla | Resultado exitoso guardado en el sistema. |
| **05** | 0:26 - 0:32 | **Google Flow** | `don Carlos.jpeg` | Cierre satisfactorio y despedida. |

---

### 5. Prompts Listos para Google Flow (Libres de Nombres)

Para cada escena de Google Flow, entrega el prompt en inglés con este formato:

#### Escena 01 (Apertura):
* **Adjuntar en Flow:** `[nombre_imagen_caracter.jpeg]` + `[nombre_imagen_fondo.jpeg]`
* **Prompt:**
```text
Cinematic 7-second video: The selected character is standing behind the retail counter, looking at the camera and explaining with friendly hand gestures and an upbeat expression. Warm natural store lighting, shallow depth of field, slow dolly-in, photorealistic 4k.
```

#### Escena 03 (Interacción con Dispositivo / Pantalla Verde):
* **Adjuntar en Flow:** `[nombre_imagen_caracter.jpeg]`
* **Prompt:**
```text
Close-up over-the-shoulder shot of the selected character holding a modern smartphone with a solid bright chroma green screen display (#00FF00). The character taps the screen with satisfaction. Soft blurred store background, warm ambient lighting, 4k realistic.
```

---

### 6. Instrucciones de Montaje para Filmora
* **Cámara rápida (Speed Ramp):** Dónde acelerar la grabación real (2x / 3x).
* **Composición:** Cómo colocar la grabación real sobre el chroma key o intercalada.
* **Transiciones:** Cortes sugeridos para mantener dinamismo.
