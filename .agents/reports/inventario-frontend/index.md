# Inventario funcional y visual — Bistro POS

Este inventario describe **qué pantallas tiene la app, dónde está cada cosa y qué hace cada botón**, pensado para un diseñador que va a redibujar la app **sin ver el código**. Es solo lectura: ningún archivo fuente fue modificado.

Bistro POS es un punto de venta (POS) para tiendas y minimercados en Colombia. Funciona como PWA en el navegador y como app Android (Capacitor), con layout de escritorio y layout móvil distintos.

## Documentos

| Archivo | Contenido |
|---------|-----------|
| [01-mapa-general.md](./01-mapa-general.md) | Roles y qué ve cada uno, árbol de navegación completo (sidebar, nav móvil, drawer, header) y los flujos principales (día normal + primer uso / onboarding). |
| [02-pantallas-venta.md](./02-pantallas-venta.md) | Ficha detallada de cada pantalla del flujo de **venta** (Punto de Venta, Mesas, Orden Rápida, Pago, Éxito, Escanear fotolista, Caja/Turno, Historial de ventas). |
| [03-pantallas-gestion.md](./03-pantallas-gestion.md) | Ficha detallada de las pantallas de **gestión y guardas** (Inicio, Productos, Inventario, Estadísticas, Clientes, Proveedores, Empleados, Actividad, Perfil, Asistente IA, Suscripciones, Login/Registro, pantallas de bloqueo). |
| [04-componentes.md](./04-componentes.md) | Componentes compartidos (botones, tarjetas, inputs, modales, toasts, badges, nav): variantes, cómo se ven y en qué pantallas aparecen. |

## Cómo leer una ficha de pantalla

Cada ficha sigue el mismo orden: propósito → cómo se llega / quién la ve → layout desktop y móvil → contenido mostrado → acciones (botones/inputs) → estados (vacío, cargando, error, sin conexión, bloqueado, éxito) → modales que abre → textos clave → componentes y archivo → problemas visuales detectados.

> Convención: cuando algo no se puede confirmar en el código, se marca como **SUPOSICIÓN**. No se repite la auditoría de tokens (paleta hex, conteo de clases); eso ya está en `auditoria-design-system-tokens.md`.
