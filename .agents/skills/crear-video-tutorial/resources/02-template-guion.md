# Plantilla del guion (bloques numerados)

Usar esta plantilla para redactar `docs/videos_tutoriales/[modulo]/02-guion.md`.

**Regla clave:** cada bloque `Bn` es una **idea narrativa continua** que el usuario
lee de corrido. La numeración sirve para que después devuelva timestamps del
tipo "B3: 0:22 - 0:38" y el skill sepa qué visual poner ahí.

---

## Estructura del archivo

```markdown
# Guion — [Título del video]

**Módulo:** [nombre]
**Duración estimada:** X min Y s (basado en velocidad de lectura ~150 palabras/min)
**Bloques totales:** N

---

## 📖 Cómo grabar este guion

1. Leer el guion completo una vez antes de grabar (para tono y ritmo).
2. Grabar en un solo take, de corrido. **No cortar entre bloques.** Las pausas
   naturales al pasar de un bloque a otro son suficientes.
3. Los números de bloque `B1`, `B2`... **NO se leen en voz alta.** Son solo
   referencia para el montaje.
4. Al terminar, apuntar en qué segundo del audio empieza cada bloque:
   ```
   B1: 0:00 - 0:09
   B2: 0:09 - 0:22
   B3: 0:22 - 0:38
   ...
   ```
5. Pasar al asistente el audio + los timestamps para que genere el mapa de
   edición.

**Tip de audio:**
- Grabar en cuarto silencioso, sin eco
- Micrófono a 15-20 cm de la boca
- Evitar plosivas ("p", "t") apuntando ligeramente al costado del micro
- Hablar con energía pero natural, como si le explicaras a un amigo

---

## 🎙️ Guion por bloques

### B1 — [Nombre corto de la idea, ej: "hook inicial"]

**Narración** (~10s):
> Aquí va el texto EXACTO que el usuario va a leer en voz alta. Sin marcar
> nombres técnicos. Nombres de botones y pantallas en **negrita** para que él
> los enfatice al leer.

**🎬 Visual sugerido:**
- Screenshot de la pantalla inicial de Bistro con zoom al botón principal
- O: grabación de 4s del cursor moviéndose hacia el botón

**🤖 Acción Playwright:** (si aplica)
- Si el bloque no requiere interacción con la app (ej. hook inicial), omitir
- Si sí requiere: describir la acción (`click en avatar`, `type "1234"`, etc.)
- El script `.mjs` de la Etapa 4 traducirá esto a código Playwright

**📝 Notas de grabación:** (opcional)
- Tono energético, hook fuerte
- Preparar screenshot antes de grabar

---

### B2 — [Nombre corto]

**Narración** (~8s):
> "Para empezar, tocamos en **Nueva venta**, que está arriba a la derecha en
> la pantalla principal."

**🎬 Visual sugerido:**
- Grabación pantalla: cursor va desde el centro al botón **Nueva venta** y hace clic
- Zoom sutil al botón durante la narración

---

### B3 — [Nombre corto]

**Narración** (~12s):
> "Ahora vemos la lista de productos. Buscamos el que queremos vender, o
> escaneamos el código de barras si tenemos pistola conectada."

**🎬 Visual sugerido:**
- Grabación pantalla: se abre `MenuScreen`, cursor pasa por el buscador
- Split o cut a: mano con escáner USB apuntando a producto real

**📝 Notas:**
- Si el escáner no funciona en la toma, tener screenshot de respaldo del EAN detectado

---

### B4 — ...

[Continuar con los bloques necesarios]

---

## 🎬 Cierre — Bloque final

### Bn — Cierre

**Narración** (~10s):
> "Y así de fácil manejas [X] en Bistro. Si te sirvió el video, revisa el resto
> de la sección de capacitación para aprender más funciones."

**🎬 Visual sugerido:**
- Screenshot de la pantalla de Capacitación con el video actual resaltado
- Fade to black al final (1s)

---

## 📊 Resumen del guion

| Bloque | Descripción corta | Duración estimada | Tipo visual |
|--------|-------------------|-------------------|-------------|
| B1 | Hook inicial | 0:10 | Screenshot |
| B2 | Abrir Nueva venta | 0:08 | Grabación |
| B3 | Buscar producto / escanear | 0:12 | Grabación + real |
| ... | ... | ... | ... |
| Bn | Cierre | 0:10 | Screenshot |
| **Total** | | **X:XX** | |

---

## ✍️ Reglas de redacción de la narración

### Español Colombia natural

- ✅ "Vamos a", "tocamos", "veamos", "revisemos"
- ✅ Tuteo colombiano con el espectador: "toca", "escribe", "elige", "busca"
- ✅ Usted solo si se habla de terceros formales ("el administrador puede...")
- ❌ Voseo argentino: "tocá", "escribí", "pulsalo", "buscá", "elegí"
- ❌ "Se procede a", "se lleva a cabo", "el usuario deberá"
- ❌ "Query", "hook", "endpoint", "RPC", "componente"
- ❌ **Diminutivos prohibidos:** "botoncito", "ventanita", "campito", "pedacito",
  "pequeñito", "cosita", etc. Si algo es pequeño → decir "pequeño" o "corto".
  El tono es profesional y directo, no infantilizado.
- ✅ Sustituir por: "el sistema", "la pantalla", "el listado", "los datos"

### Longitud de bloque

- **5-15 segundos hablado** = 15-45 palabras en español
- Si un bloque pasa de 45 palabras → dividir en dos bloques
- Si un bloque tiene menos de 15 palabras → unir con el siguiente

### Transiciones entre bloques

Cuando cambia de escena o de idea, empezar el bloque con conector explícito:

- "Ahora vamos a..."
- "El siguiente paso es..."
- "Después de eso..."
- "Una vez guardado..."
- "Por último..."

### Nombres de botones y pantallas

Siempre en **negrita** para que el usuario los enfatice:

- ✅ "toca en **Nueva venta**"
- ✅ "ve a **Ajustes** → **Facturación**"
- ❌ "toca en nueva venta"

### Números y cantidades

- Precios: leer completo — "cinco mil pesos", no "5000"
- Cantidades: números completos si son <20 — "tres productos", no "3 productos"
- Excepción: cuando el número es parte del nombre — "Mesa 5", "Turno 2"

### Hook inicial (B1)

Saludo profesional, corto y al grano. La descripción del video (de qué trata,
para qué sirve) ya está en la card de `TrainingScreen.tsx` — el usuario la leyó
antes de darle play. El B1 solo saluda y arranca.

- ✅ "Hola, en este video vamos a ver cómo cambiar tu PIN en Bistro."
- ✅ "Hola, vamos a aprender a registrar una venta paso a paso."
- ✅ "Hola, te voy a mostrar cómo gestionar mesas en Bistro."
- ❌ "¿Quieres cambiar tu PIN?" (pregunta retórica — no usar)
- ❌ "Hola, bienvenidos a este tutorial de Bistro POS sobre..." (demasiado largo)
- ❌ "En menos de un minuto lo tienes listo sin llamar a nadie..." (eso va en la
  descripción de la card, no en el video)

**Formato fijo:** "Hola, [en este video vamos a / te voy a mostrar / vamos a
aprender a] + [acción principal]."

### Cierre (Bn)

- Resumen corto de lo aprendido O
- Llamada a la acción (ver otro video, ir a la doc)

---

## 🎯 Errores comunes al redactar

- ❌ Bloques demasiado largos (>15s) — dividir
- ❌ Repetir el mismo verbo 3+ veces seguidas ("tocamos... tocamos... tocamos")
  → usar el banco de vocabulario de la sección siguiente
- ❌ Jerga técnica sin explicar
- ❌ Tono neutro sin energía — el video se siente aburrido
- ❌ Instrucciones vagas sin referencia espacial ("haz clic ahí" sin decir dónde)


---

## 📚 Banco de vocabulario para acciones (evitar repetición)

**Regla:** en un video de 5 minutos vas a decir "hacer clic" o "tocar" unas 30
veces. Si usás siempre el mismo verbo suena robótico. Rotá entre estas
alternativas.

### 👆 Acción principal: click / toque / pulsación

Formas neutras (funcionan en desktop y móvil):

| Verbo | Ejemplo en contexto |
|-------|---------------------|
| **tocamos / toca** | "toca en **Nueva venta**" |
| **pulsamos / pulsa** | "pulsa el botón **Guardar**" |
| **presionamos / presiona** | "presiona **Confirmar**" |
| **damos clic en / dale clic a** | "dale clic a la mesa que queremos abrir" |
| **hacemos clic en / haz clic en** | "hacemos clic en el ícono del carrito" |
| **seleccionamos / selecciona** | "selecciona la categoría **Bebidas**" |
| **elegimos / elige** | "elige el método de pago" |
| **marcamos / marca** | "marca la casilla **Aplicar descuento**" |
| **abrimos / abre** | "abre el menú desplegable" |
| **activamos / activa** | "activa el interruptor **Modo oscuro**" |
| **desactivamos / desactiva** | "desactiva la opción **Notificaciones**" |

### 🚪 Acción de navegación: entrar / ir a una pantalla

| Verbo | Ejemplo |
|-------|---------|
| **vamos a / ve a** | "vamos a la sección **Inventario**" |
| **entramos a / entra a** | "entra a **Ajustes**" |
| **ingresamos a / ingresa a** | "ingresa al módulo de **Clientes**" |
| **nos dirigimos a** | "nos dirigimos al **Dashboard**" |
| **abrimos** | "abre la pantalla de **Ventas**" |
| **pasamos a** | "pasamos a la vista de **Historial**" |
| **cambiamos a** | "cambia a la pestaña **Deudas**" |

### ⌨️ Acción de escritura: ingresar datos

| Verbo | Ejemplo |
|-------|---------|
| **escribimos / escribe** | "escribe el nombre del producto" |
| **ponemos / pon** | "pon el precio en el campo de la derecha" |
| **ingresamos / ingresa** | "ingresa la cantidad" |
| **completamos / completa** | "completa los datos del cliente" |
| **llenamos / llena** | "llena el formulario con la información básica" |
| **capturamos / captura** | "captura el número de identificación" |

### 📸 Acciones específicas de Bistro

| Verbo | Ejemplo |
|-------|---------|
| **escaneamos / escanea** | "escanea el código de barras" |
| **fotografiamos / fotografía** | "fotografía la factura del proveedor" |
| **imprimimos / imprime** | "imprime el ticket de la venta" |
| **cobramos / cobra** | "cobra la cuenta con la forma de pago elegida" |
| **abonamos / abona** | "abona parte de la deuda del cliente" |
| **anulamos / anula** | "anula la venta desde el historial" |

### 📍 Referencias espaciales (para decir dónde está)

Combinar con los verbos de arriba:

| Ubicación | Ejemplo completo |
|-----------|------------------|
| **arriba a la derecha** | "el botón está arriba a la derecha" |
| **arriba a la izquierda** | "el menú se abre arriba a la izquierda" |
| **abajo del todo** | "el total aparece abajo del todo" |
| **al lado de X** | "al lado del nombre del producto" |
| **encima de X** | "encima de la lista aparece el buscador" |
| **debajo de X** | "debajo del logo hay un menú" |
| **en el centro** | "en el centro de la pantalla vemos..." |
| **en la esquina superior derecha** | "el ícono del usuario está en la esquina superior derecha" |
| **en la barra de arriba** | "en la barra de arriba tenemos las opciones" |
| **en el panel lateral** | "en el panel lateral izquierdo aparecen las categorías" |
| **el primer / el último** | "tocamos el primer producto de la lista" |
| **la fila de** | "en la fila de **Café americano** vemos el precio" |

### 🔀 Sinónimos para "botón" y "elemento de UI"

Para no repetir "botón" mil veces:

| En vez de "botón" | Cuándo usarlo |
|-------------------|---------------|
| **la opción** | genérico para menús y listas |
| **el acceso** | cuando lleva a otra pantalla ("el acceso a Ventas") |
| **el ícono** | cuando es solo un símbolo sin texto |
| **la tarjeta** | para cards (`Mesa 5`, un producto en el catálogo) |
| **el chip** | para píldoras pequeñas (filtros, categorías) |
| **el interruptor** | para switches/toggles |
| **la casilla** | para checkboxes |
| **el selector** | para dropdowns |
| **el campo** | para inputs de texto |
| **el enlace** | para links |
| **la pestaña** | para tabs |
| **el ítem** | genérico para elementos de una lista |
| **la fila** | para filas de una tabla |

### 🎬 Conectores entre bloques (transiciones habladas)

Para no empezar todos los bloques con "y ahora":

| Conector | Cuándo usarlo |
|----------|---------------|
| **"Ahora vamos con..."** | cambio de escena mayor |
| **"El siguiente paso es..."** | secuencia lineal |
| **"Una vez guardado..."** | después de una acción exitosa |
| **"Con eso listo..."** | cerrar una acción y abrir otra |
| **"Sigamos con..."** | transición fluida |
| **"Lo que viene es..."** | anticipar el próximo bloque |
| **"Pasamos entonces a..."** | cambio de contexto claro |
| **"Ya que tenemos X, ahora..."** | encadenar resultado con acción |
| **"Antes de continuar..."** | insertar aclaración o tip |
| **"Fijate que..."** | destacar un detalle importante |
| **"Como ves..."** | referenciar algo visible en pantalla |

### 💡 Reglas de rotación

1. **No usar el mismo verbo dos bloques seguidos.** Si B3 dice "tocamos",
   B4 usa "seleccionamos", "abrimos" o "elegimos".
2. **Máximo 2 veces el mismo verbo por bloque.** Si el bloque tiene 3 acciones,
   rotar entre 2-3 verbos distintos.
3. **Alternar entre nosotros (tocamos) y tuteo (tocá / toca).** El tuteo
   directo genera cercanía; el "nosotros" genera compañerismo. Combinar
   ambos hace la voz más viva.
4. **Cuando puedas, describí el objetivo antes de la acción.** No "toca en
   Nueva venta", mejor "para empezar una venta nueva, tocamos acá arriba en
   **Nueva venta**".
5. **Usá referencias espaciales explícitas.** No "hacé clic ahí", sino "hacé
   clic en el botón **Guardar** que está abajo a la derecha".

### ✅ Ejemplo bueno vs malo

**❌ Malo** (repetitivo y seco):
> "Hacemos clic en Nueva venta. Hacemos clic en el producto. Hacemos clic en
> Cobrar. Hacemos clic en Efectivo. Hacemos clic en Confirmar."

**✅ Bueno** (variado y natural):
> "Para arrancar una venta, tocamos arriba en **Nueva venta**. Se abre el
> catálogo — seleccionamos el producto que queremos. Cuando ya tenemos todo
> en el carrito, pulsamos **Cobrar** abajo a la derecha. Elegimos **Efectivo**
> como método de pago y confirmamos con **Guardar venta**."

Misma información, mismas 5 acciones, pero fluye como una explicación humana.
