# Plan del video — Cómo crear una receta en Bistro

## 🎯 Idea en 1 minuto

```text
┌──────────────────────────────────────────────────────────────────┐
│ Dueño o administrador entra a Productos                          │
│         │                                                        │
│         ▼                                                        │
│ Abre Crear  →  elige Crear Receta                               │
│         │                                                        │
│         ▼                                                        │
│ Define nombre, categoría, precio y uso Para Venta               │
│         │                                                        │
│         ▼                                                        │
│ Cambia el costo de Manual a Ingredientes                        │
│         │                                                        │
│         ▼                                                        │
│ Agrega Carne molida + Masa con cantidades y unidades            │
│         │                                                        │
│         ▼                                                        │
│ Bistro calcula el costo  →  guarda la receta                    │
│         │                                                        │
│         ▼                                                        │
│ 🎉 Verifica badge Receta y cantidad Producible                  │
└──────────────────────────────────────────────────────────────────┘
```

Duración: **5:00 min** · Categoría: **Inventario** · Icono: `skillet`
Grabación en computador. Se enseña el modo **Ingredientes** y se explica brevemente cuándo usar **Manual**.

---

## 📋 Ficha

```text
┌─────────────────────┬────────────────────────────────────────────┐
│ Módulo              │ Crear receta                              │
│ Tipo de producto    │ Producto con Receta / PROCESSED           │
│ Punto de entrada    │ Productos → Crear → Crear Receta          │
│ Doc técnica         │ docs/caracteristicas/                     │
│                     │ flujo_creacion_productos.md               │
│ Público             │ Dueños y administradores                  │
│ Voz                 │ Azure TTS Jorge (es-MX), estilo chat      │
│ Encuadre            │ 1366×720, cursor negro y anillo ámbar     │
│ Conectividad        │ Requiere internet para crear la receta    │
└─────────────────────┴────────────────────────────────────────────┘
```

---

## ✅ Qué muestra / ❌ Qué NO muestra

```text
   MUESTRA                            NO MUESTRA
   ═══════                            ══════════
   ● Entrar desde Productos           ✗ Crear insumos manualmente
   ● Elegir Para Venta                  durante la grabación
   ● Nombre, categoría y precio       ✗ Recetas Solo Insumo
   ● Costo por Ingredientes           ✗ Editar o eliminar recetas
   ● Agregar dos insumos              ✗ Recetas de servicios
   ● Conversión de gramos a kg        ✗ Venta completa de la receta
   ● Costo calculado                  ✗ Compra o conteo de insumos
   ● Guardar y verificar              ✗ Flujo sin conexión
   ● Explicar costo Manual
   ● Explicar Producible
```

---

## 🎬 Storyboard

```text
   ⏱ 0:00 ┬─ B1  🎬 Resultado que vamos a lograr             10s
          │
   ⏱ 0:10 ┼─ B2  💡 Qué es una receta                       12s
          │
   ⏱ 0:22 ┼─ B3  📦 Insumos necesarios antes de empezar     12s
          │
   ⏱ 0:34 ┼─ B4  📂 Entrar a Productos                      10s
          │
   ⏱ 0:44 ┼─ B5  📂 Abrir Crear Receta                      10s
          │
   ⏱ 0:54 ┼─ B6  ⚙️ Elegir Para Venta                       15s   ┐
          │                                                      │
   ⏱ 1:09 ┼─ B7  ✏️ Nombre y categoría                       15s   │ DATOS
          │                                                      │
   ⏱ 1:24 ┼─ B8  💰 Precio de venta                           12s   ┘
          │
   ⏱ 1:36 ┼─ B9  ⚙️ Manual frente a Ingredientes             15s
          │
   ⏱ 1:51 ┼─ B10 ⚙️ Activar modo Ingredientes                10s
          │
   ⏱ 2:01 ┼─ B11 🔎 Buscar Carne molida Tutorial             15s   ┐
          │                                                      │
   ⏱ 2:16 ┼─ B12 ✏️ Indicar 50 gramos                        15s   │
          │                                                      │
   ⏱ 2:31 ┼─ B13 📦 Añadir el primer ingrediente             12s   │ RECETA
          │                                                      │
   ⏱ 2:43 ┼─ B14 📦 Añadir una unidad de masa                15s   │
          │                                                      │
   ⏱ 2:58 ┼─ B15 💰 Revisar el costo calculado               15s   ┘
          │
   ⏱ 3:13 ┼─ B16 🖼 Foto y apodos opcionales                 10s
          │
   ⏱ 3:23 ┼─ B17 ✅ Revisar los datos antes de guardar        15s
          │
   ⏱ 3:38 ┼─ B18 💾 Crear la receta                           15s
          │
   ⏱ 3:53 ┼─ B19 ✅ Verificar badge Receta                    15s   ┐
          │                                                      │
   ⏱ 4:08 ┼─ B20 📊 Entender Producible                       15s   │ RESULTADO
          │                                                      │
   ⏱ 4:23 ┼─ B21 💡 Cuándo usar costo Manual                 15s   ┘
          │
   ⏱ 4:38 ┼─ B22 ⚠️ Errores comunes                          15s
          │
   ⏱ 4:53 ┴─ B23 🎉 Cierre                                     7s

            Total: 5:00
```

---

## 📦 Datos de prueba

Los datos serán creados o verificados por el setup mediante la interfaz. No se usarán consultas directas a la base de datos.

```text
┌──────────────────────────────────────────────────────────────────┐
│ 🍳 Receta: Empanada Especial Tutorial                           │
├──────────────────────────────────────────────────────────────────┤
│ Uso              ▸ Para Venta                                  │
│ Categoría        ▸ Comidas                                     │
│ Precio           ▸ $3.000                                     │
│ Costo            ▸ Calculado por ingredientes                  │
├──────────────────────────────────────────────────────────────────┤
│ 🥩 Carne molida Tutorial                                       │
│ Inventario       ▸ 2 kg                                       │
│ Costo            ▸ $18.000 por kg                             │
│ Uso en receta    ▸ 50 g  →  $900                              │
├──────────────────────────────────────────────────────────────────┤
│ 🫓 Masa para empanada Tutorial                                 │
│ Inventario       ▸ 20 unidades                                │
│ Costo            ▸ $300 por unidad                            │
│ Uso en receta    ▸ 1 unidad  →  $300                          │
├──────────────────────────────────────────────────────────────────┤
│ Costo receta     ▸ $1.200                                     │
│ Producible       ▸ 20 unidades                                │
│                  ▸ mínimo entre carne (40) y masa (20)        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🎞️ Overlays anticipados

```text
Escena    Overlay                              Refuerza
──────    ───────                              ────────
  B2   ┌─ 📊 Producto normal vs receta   ──► Diferencia conceptual
       │  "Producto: tiene stock propio"
       │  "Receta: depende de sus insumos"

  B9   ┌─ ⚠️ Manual no descuenta stock   ──► Consecuencia no visible
       │  "Ingredientes sí controla insumos"
       │  "Manual usa un costo fijo"

  B20  ┌─ 📊 Cómo calcula Producible     ──► Insumo limitante
       │  Carne alcanza para 40
       │  Masa alcanza para 20 → Producible: 20
```

Estas son previsiones. La propuesta formal se hará después del guion, comparando cada afirmación con la interfaz visible.

---

## 🔗 Mapa técnico

```text
                         ProductsScreen.tsx
                  botón Crear → Crear Receta
                                │
                                ▼
                  ProcessedProductScreen.tsx  ◄── formulario
                                │
             ┌──────────────────┼──────────────────┐
             ▼                  ▼                  ▼
   CategorySelector.tsx  useImageUpload.ts  lib/recipeMath.ts
   nombre/categoría      foto opcional      costo y conversión
                                │
                                ▼
                    Frontend intenta guardar
                     ├─► products
                     └─► product_ingredients
                                │
                                ▼
                         useProducts.ts
                  catálogo + valor Producible
```

```text
   Reglas verificadas en la UI:
    ├─► Nombre y categoría son obligatorios
    ├─► Ingredientes exige al menos un insumo
    ├─► Manual exige costo mayor que cero
    ├─► Receta no maneja stock propio
    ├─► Para Venta habilita el precio
    └─► Crear o editar requiere conexión
```

---

## 🛠 Setup antes de grabar

```text
   ANTES DE ARRANCAR                              RESPONSABLE
   ─────────────────────────────────              ───────────

   1. Cerrar Chromium de grabaciones              usuario, si está abierto
   2. Verificar sesión en posbistro.online        perfil bistro-recording
   3. Verificar conexión a internet               script setup
   4. Abrir Productos                             script setup
   5. Buscar los dos insumos Tutorial             script setup
   6. Crear los que falten mediante la UI         script setup
   7. Verificar stock y costo de referencia       script setup
   8. Verificar que la receta aún no exista       script setup
   9. Dejar Productos listo para grabar           script setup
  10. Limpiar datos de prueba tras grabar         teardown por UI
```

```text
   ┌─ Estado listo para grabar ────────────────────────────────┐
   │ ✓ Sesión activa y negocio de grabación visible           │
   │ ✓ Conexión disponible                                    │
   │ ✓ Carne molida Tutorial disponible                       │
   │ ✓ Masa para empanada Tutorial disponible                 │
   │ ✓ Empanada Especial Tutorial no existe                   │
   │ ✓ Pantalla Productos abierta                             │
   └───────────────────────────────────────────────────────────┘
```

El script completo de setup, grabación y teardown se presentará para aprobación antes de ejecutarse.

---

## ⚠️ Riesgos

```text
   Riesgo                    Impacto              Mitigación
   ─────────────────────     ─────────────────    ────────────────────

   Falta un insumo           No aparece al        Setup lo crea por UI
                             buscar

   Costo o stock cambió      Resultado visual     Usar datos Tutorial
                             no coincide           aislados

   Receta ya existe          Guardado duplicado    Setup verifica nombre

   No hay internet           No permite crear      Comprobar antes de grabar

   Conversión incorrecta     Costo no da $1.200    Verificar 50 g frente a kg
```
