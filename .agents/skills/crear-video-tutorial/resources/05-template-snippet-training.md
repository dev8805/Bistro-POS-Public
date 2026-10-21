# Plantilla del snippet para TrainingScreen

Archivo destino: `docs/videos_tutoriales/[modulo]/05-snippet-training.md`

**Objetivo:** entregar el objeto TypeScript listo para pegar en el array
`TRAINING_VIDEOS` de `screens/TrainingScreen.tsx`.

---

## Plantilla del snippet

```markdown
# Snippet para TrainingScreen — [Título]

## 📦 Objeto TypeScript listo para pegar

Abrir `screens/TrainingScreen.tsx`, buscar el array `TRAINING_VIDEOS` y agregar
al final (antes del `]`) el siguiente objeto:

​```typescript
{
    id: 'X', // reemplazar por el siguiente ID disponible (mirar el último id del array + 1)
    title: '[Título corto — máx. 30 caracteres]',
    description: '[Descripción — máx. 100 caracteres. Empezar con verbo: "Aprende a...", "Descubre cómo..."]',
    videoUrl: 'https://res.cloudinary.com/milenadelpilar/video/upload/vXXXXXXXXXX/nombre_del_archivo_en_cloudinary.mp4',
    duration: 'M:SS', // ej: '4:32'
    category: '[categoría]', // uno de: inicio | ventas | inventario | personal | reportes
    icon: '[nombre_material_symbol]', // ver sección "Iconos" abajo
    hidden: true, // cambiar a false cuando esté publicado y aprobado
},
​```

## 🖼️ Iconos Material Symbols sugeridos

Elegir el icono que mejor refleje el módulo. Referencia:
https://fonts.google.com/icons

### Ventas
- `point_of_sale` — POS general
- `payments` — pagos
- `credit_card` — tarjeta
- `qr_code_scanner` — escáner
- `receipt_long` — recibo/factura
- `table_restaurant` — mesas
- `soup_kitchen` — cocina/comandas
- `print` — impresora
- `add_shopping_cart` — nueva venta

### Inventario
- `inventory_2` — inventario
- `inventory` — stock
- `warehouse` — bodega
- `local_shipping` — compras
- `money_off` — mermas/gastos
- `sell` — promociones
- `receipt` — factura escaneada

### Reportes
- `bar_chart` — dashboard
- `insights` — analítica
- `assessment` — reportes
- `people` — clientes
- `credit_score` — deudas

### Personal e inicio
- `badge` — empleados
- `manage_accounts` — perfiles
- `person_add` — agregar personal
- `rocket_launch` — primeros pasos
- `login` — autenticación
- `settings` — ajustes
- `cloud_off` — modo offline
- `smart_toy` — IA / asistente

## 🚀 Pasos para publicar el video

### 1. Subir a Cloudinary

- Ingresar a la cuenta `milenadelpilar` (misma que aparece en los videos actuales)
- Ir a **Media Library** → **Upload**
- Configurar:
  - Folder: `videos_tutoriales` (o el que corresponda)
  - Public ID: `Como_[Accion]_En_Bistro` sin espacios, con guion bajo, primera
    letra de cada palabra en mayúscula
  - Access Mode: **Public**
- Al terminar la subida, copiar la URL que aparece en el detalle del asset.
  Debería empezar con `https://res.cloudinary.com/milenadelpilar/video/upload/vXXXXXXXXXX/`

### 2. Verificar thumbnail automático

Cloudinary genera thumbnails automáticos. Para verificar que se ve bien:

```
URL video:
https://res.cloudinary.com/milenadelpilar/video/upload/v1774468972/Como_Ejemplo.mp4

URL thumbnail (frame del segundo 1):
https://res.cloudinary.com/milenadelpilar/video/upload/so_1,w_640,c_scale,f_auto,q_auto/v1774468972/Como_Ejemplo.jpg
```

Si el frame 1 no es representativo, cambiar `so_1` por otro segundo (ej. `so_5`
para el frame en el segundo 5).

### 3. Editar `screens/TrainingScreen.tsx`

1. Abrir el archivo.
2. Buscar el array `TRAINING_VIDEOS`.
3. Agregar el objeto de arriba al final del array (antes del `]` de cierre).
4. Asignar el `id` correcto (siguiente número disponible).
5. Pegar la URL real de Cloudinary en `videoUrl`.
6. Definir el `duration` con el tiempo real del video final.
7. Verificar la categoría — debe existir en `TRAINING_CATEGORIES`.
8. Dejar `hidden: true` hasta que quieras publicarlo.

### 4. Probar en local

```bash
npm run dev
```

- Navegar a la pantalla de **Capacitación** en la app.
- Con `hidden: true` el video NO aparece. Cambiar temporalmente a `false` para
  ver que se reproduce bien.
- Verificar: thumbnail carga, click reproduce, duración correcta, controles
  visibles.

### 5. Publicar

- Cambiar `hidden: false`.
- Commit del cambio con Conventional Commits:
  ```
  feat(training): agregar video tutorial de [módulo]
  ```
- Deploy a Firebase Hosting (automático vía GitHub Actions al mergear a `main`).
```

---

## Reglas al generar el snippet

1. **Verificar el último `id` en `TRAINING_VIDEOS`** antes de asignar uno nuevo
   (leer el archivo con `Read`).
2. **`title` máximo 30 caracteres** — se recorta con `truncate` en la card.
3. **`description` máximo 100 caracteres** — se muestra con `line-clamp-2` en
   la card.
4. **Categoría debe existir en `TRAINING_CATEGORIES`.** Si el módulo no encaja
   en las 5 existentes, avisar al usuario antes de inventar una nueva.
5. **`hidden: true` por defecto.** El usuario decide cuándo cambiar a `false`.
6. **Nunca sobrescribir un objeto existente.** Siempre agregar al final del
   array.
