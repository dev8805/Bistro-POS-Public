# Landing Page BistroPOS — Plan de Diseño

**Objetivo:** Crear una landing page profesional y limpia para vender BistroPOS a negocios retail pequeños y medianos en Colombia.

**Público:** Tiendas, minimercados, papelerías, ferreterías — cualquier negocio retail que necesite un punto de venta.

**Ruta:** Primera pantalla si el usuario NO ha iniciado sesión. Reemplaza el login como pantalla por defecto.

---

## Decisiones de Diseño

| Aspecto | Decisión |
|---|---|
| Color principal | `#047857` (emerald-700) + paleta armónica |
| Tono | Cercano, directo |
| WhatsApp | No |
| Redes sociales | No hay |
| Código promo | Solo en registro, NO en landing |
| Modo offline | No mencionar |
| Navegación | Landing = pantalla default si no hay sesión |
| Tipos de producto | Mencionar: Retail, Recetas, Servicios |

---

## Estructura

### 1. Navbar
- Logo BistroPOS
- Links: Beneficios · Precio
- **Botones:** "Iniciar Sesión" (secundario) · "Regístrate Gratis" (primario)

### 2. Hero Section
- Headline retail-focused
- Subtítulo breve orientado a negocios colombianos
- **CTA:** "Prueba Gratis 15 Días" → RegisterScreen
- Visual: ilustración o mockup limpio

### 3. Beneficios (6 cards)

| Módulo | Beneficio para retail |
|---|---|
| **Ventas rápidas** | Orden rápida, mesas. Cobra en segundos |
| **Inventario inteligente** | Control de stock, alertas de baja rotación |
| **Dashboard KPIs** | Ventas del día, ganancias, productos más vendidos |
| **Clientes y deudas** | Registro de clientes, cuentas por cobrar, historial |
| **Empleados y roles** | Cajero, Admin con permisos diferenciados |
| **Caja registradora** | Apertura/cierre de caja, control de efectivo, reportes |

### 4. Tipos de Producto
- **Retail** — Productos de venta directa con stock
- **Recetas** — Productos elaborados con control de ingredientes
- **Servicios** — Servicios sin inventario físico

### 5. Cómo Funciona (3 pasos)
1. Crea tu cuenta (30 segundos)
2. Configura tus productos
3. Empieza a vender

### 6. Pricing
- **Gratis 15 días** — todo desbloqueado
- Después: **$29,000 COP/mes** (primer pago cubre 2 meses)
- Sin contratos, cancela cuando quieras

### 7. Confianza
- Pagos seguros con Wompi
- Datos protegidos en la nube
- Multi-dispositivo: celular, tablet y PC

### 8. Footer
- Links: Términos, Privacidad
- © 2025 BistroPOS

---

## Checklist de Implementación

- [x] Crear `LandingScreen.tsx`
- [x] Hero con CTA → RegisterScreen
- [x] Sección beneficios con iconos Material Symbols
- [x] Sección tipos de producto (retail, recetas, servicios)
- [x] Sección "Cómo funciona" (3 pasos)
- [x] Sección pricing con badge "15 días gratis"
- [x] Sección confianza
- [x] Footer
- [x] Navbar con Iniciar Sesión / Regístrate
- [x] Responsive: mobile, tablet, desktop
- [x] Modificar App.tsx: landing como pantalla default sin sesión
- [x] Login/Register abren en nueva pestaña (window.open + hash)
- [x] App.tsx lee hash #login/#register para mostrar pantalla correcta
- [x] Mockups CSS: Dashboard, POS, Inventario
- [x] Feature rows alternados (estilo Wompi)
- [x] Sección dark para tipos de producto
- [x] CTA final con fondo verde
- [x] Sección "¿Qué es BistroPOS?"


