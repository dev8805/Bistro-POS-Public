# Plan de Contingencia Offline y Formato de Registro Manual

## 1. El Desafío
Cuando no hay luz o internet, el negocio debe seguir operando. El registro manual (papel y lápiz) es inevitable. El problema es sincronizar esas ventas cuando vuelve el sistema sin perder horas digitando.

### Retos Detectados:
1.  **Ventas por Valor vs Cantidad:** ¿Cómo diferenciar "1 queso" (unidad) de "$5000 de queso" (valor)?
2.  **Múltiples Datos:** Se necesita registrar no solo productos, sino Método de Pago (Efectivo/Fiado) y Cliente.
3.  **Digitalización:** El sistema actual toma una foto y crea **UNA** orden. Si anotamos 20 ventas de diferentes clientes en una sola hoja larga, el sistema las mezclará todas en una sola cuenta gigante.

---

## 2. Estrategia Propuesta: "Las Comandas de Contingencia"

Para que el OCR (Gemini) y el flujo actual funcionen sin cambios mayores en el código, la unidad física (el papel) debe coincidir con la unidad lógica (la orden).

**Recomendación:** Imprimir hojas con **4 boletas/comandas por página** que se puedan cortar (o usar sin cortar, tomando foto a cada cuadrante).

### Estructura de la Comanda Manual:

Cada recuadro debe tener:
*   **Cuerpo (Tabla Simple):**
    *   **Cant:** Cantidad en **Unidades, Peso o Medida**.
        *   Admite: Enteros (`2`), Decimales (`1.5`, `1,3`), Fracciones (`1/2`, `1 1/4`) y Gramos (`450g`).
    *   **Producto / Detalle:** Nombre del ítem (ej. "Cebolla Cabezona", "Queso Costeño").
    *   **Valor ($):** SOLO para referencia visual del dueño (hacer cuentas manuales). El sistema **NO** usa esta columna.
*   **Pie:**
    *   **Método de Pago:** Checkboxes [ ] Efec [ ] Transf [ ] Crédito
    *   **Total Aprox:** Para control rápido del cajero.

---

## 3. Interpretación Inteligente de Cantidades (Gemini Vision)

El sistema está configurado para entender la escritura natural de cantidades, simplificando el trabajo del dueño:

1.  **Números Enteros (Unidades):**
    *   Escritura: `2` Coca Cola
    *   Sistema: `quantity: 2`

2.  **Decimales (Peso/Medida):**
    *   Escritura: `1.5` libras de Carne / `1,3` kg de Queso
    *   Sistema: `quantity: 1.5` / `quantity: 1.3` (Detecta punto o coma indistintamente).

3.  **Fracciones (Peso/Medida):**
    *   Escritura: `1/2` libra de Café / `1 1/4` de Arroz
    *   Sistema: Convierte automáticamente a decimal → `quantity: 0.5` / `quantity: 1.25`.

4.  **Gramos (Conversión Automática):**
    *   Escritura: `450g` o `450 gramos`
    *   Sistema: Si el producto base está en Libras, el sistema puede sugerir la conversión `0.99` (aprox 1 lb).

5.  **Inferencia de Unidad (Contexto de Base de Datos):**
    *   Escritura: `1/2` Papa (sin especificar "libra")
    *   Sistema: Busca "Papa" en BD → Ve que se vende por "Libra" → Asume `0.5` Libras.
    *   Escritura: `3` Huevos
    *   Sistema: Busca "Huevo" en BD → Ve que se vende por "Unidad" → Asume `3` Unidades.

6.  **Lenguaje Coloquial:**
    *   Escritura: `Media` cebolla, `Un cuarto` de queso, `Kilo y medio` de carne.
    *   Sistema: Gemini interpreta las palabras y las convierte a número: `0.5`, `0.25`, `1.5`.

*Nota:* No es necesario escribir el símbolo de moneda o precios en la columna cantidad. La ambigüedad se resuelve por el tipo de producto en la base de datos (si "Cebolla" se vende por Kilo, `1` se interpreta como 1 Kilo/Libra según configuración).

---

## 4. Flujo de Recuperación (Cuando vuelve la luz)

1.  El cajero tiene una pila de comandas físicas.
2.  Abre la App -> **Escanear Lista**.
3.  Toma foto a la **primera comanda**.
4.  El sistema detecta los productos.
    *   *Mejora Futura:* Si detecta "Crédito" o un nombre de cliente escrito, el sistema podría sugerir asignar la venta a ese usuario (actualmente sería manual).
5.  Confirma y crea la orden.
6.  Repite para las siguientes comandas.

---

## 5. Próximos Pasos (Implementación Técnica)

1.  **Diseñar el Formato Imprimible (HTML/PDF):** Ver archivo adjunto `docs/plans/plantilla-contingencia-offline.html`.
2.  **Ajustar Prompt OCR:** Asegurar que Gemini sepa interpretar la columna de "Valor" como un precio total del ítem y no una cantidad extraña.
3.  **Módulo de "Carga Masiva" (Opcional a futuro):** Permitir tomar una foto a una hoja completa con 4 comandas y que el sistema separe y cree 4 ordenes distintas (más complejo pero muy eficiente).
