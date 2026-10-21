# Capturas del inventario frontend — Bistro POS

Capturas reales tomadas con Playwright sobre la app en ejecución (`npm run dev`, localhost:3000), con sesión autenticada en el negocio de ejemplo **"Tienda de la Esquina"** (usuario Manuel Castillo, rol Administrador).

- **Desktop:** viewport 1440×900
- **Móvil:** viewport 390×844
- Fecha de captura: 1 de octubre de 2026

> Las capturas usan datos reales del negocio de prueba (productos, precios, categorías colombianas). Sirven para que el diseñador vea proporciones, densidad y jerarquía reales, no mocks.

## Índice de capturas

| Archivo | Pantalla | Vista | Qué muestra |
|---|---|---|---|
| `01-login-desktop.png` | Login | Desktop | Pantalla de ingreso con 3 métodos (PIN, SMS, Google) + panel ilustrativo izquierdo "Tu negocio te espera" |
| `02-venta-pos-desktop.png` | Punto de Venta (SellScreen) | Desktop | Pantalla principal POS: sidebar izquierdo, barra de acciones superior (Crear/Egresos/Abonos/Cerrar turno), buscador + chips de categoría, grilla de ProductCards, panel de pedido derecho vacío |
| `02-venta-pos-movil.png` | Punto de Venta | Móvil | Mismo POS en móvil: header compacto, nav inferior (Inicio/Vender/Turno/Ayuda) |
| `03-dashboard-desktop.png` | Estadísticas (Dashboard) | Desktop (full page) | KPIs, gráficos de ventas, métricas del negocio |
| `04-productos-desktop.png` | Productos (catálogo) | Desktop | Listado/gestión de productos del catálogo |
| `05-inventario-desktop.png` | Inventario | Desktop | Vista de inventario físico / stock |
| `06-clientes-desktop.png` | Clientes | Desktop | Clientes y cuentas por cobrar |
| `07-empleados-desktop.png` | Empleados | Desktop | Gestión de personal, roles |
| `08-historial-ventas-desktop.png` | Historial de ventas | Desktop | Listado de ventas realizadas |
| `09-actividad-desktop.png` | Actividad (visor de eventos) | Desktop | Log de eventos / presencia de empleados |
| `09-actividad-movil.png` | Actividad | Móvil | Mismo visor en móvil con nav inferior |
| `10-inicio-movil.png` | Inicio (HomeScreen) | Móvil | Hub móvil (solo existe como vista móvil) |
| `11-pos-movil-elige-categoria.png` | Punto de Venta | Móvil | **Estado vacío** del POS móvil: "Elige una categoría" (en móvil NO muestra productos hasta elegir categoría, a diferencia del desktop) |
| `12-pos-movil-productos.png` | Punto de Venta | Móvil | Grilla de productos tras elegir categoría "Bebidas" |
| `13-pos-carrito-lleno-desktop.png` | Punto de Venta | Desktop | **Carrito con contenido**: panel de pedido derecho con 2 ítems, acciones por ítem (Modificador/Descuento/Eliminar) y total $8.200 |
| `14-pago-cobro-desktop.png` | Pago / Cobro (PaymentScreen/Sidebar) | Desktop | Pantalla/panel de cobro tras "Procesar Pago" |

## Hallazgo de UX detectado durante la captura

**POS móvil vs desktop difieren en el estado inicial:** en desktop la grilla muestra todos los productos de inmediato; en móvil muestra un empty state "Elige una categoría / Selecciona una categoría arriba para ver sus productos" y obliga a elegir una categoría primero. Ver `11-pos-movil-elige-categoria.png` vs `02-venta-pos-desktop.png`. Es una diferencia de flujo que el diseñador debe conocer.

## Capturas NO tomadas (y por qué)

- **Pantallas de registro/recuperación de contraseña (RegisterScreen, ForgotPasswordScreen):** alcanzables sin login, pero no se capturaron en esta tanda por foco en el flujo autenticado principal. Se pueden añadir fácilmente.
- **Rutas públicas (recibo /t/..., historial cliente /ch/...):** requieren un token/ID real de una venta o cliente; no se generó uno en esta sesión.
- **Modales específicos** (crear producto, descuento, crear cliente, confirmaciones): no se abrieron uno por uno en esta tanda. El carrito lleno y la pantalla de pago sí quedaron capturados como muestra del flujo transaccional.
- **Suscripción, Perfil, Asistente IA, creación de productos/promos:** no recorridos en esta tanda; accesibles desde el sidebar (Ajustes/Crear) y el botón Asistente IA.

Estas quedan como ampliación opcional: el entorno de captura está configurado y funcionando, así que una segunda pasada puede completarlas.
