---
inclusion: always
---

# Bistro POS — Producto

Sistema de punto de venta para negocios minoristas en Colombia. PWA + Android híbrida orientada a tiendas y minimercados.

## Módulos del sistema

Cada módulo tiene su documentación en `docs/caracteristicas/`:

| Módulo | Archivo de documentación |
|--------|--------------------------|
| Ventas desktop (POS, EAN, pistola USB) | `flujo_ventas_desktop.md` |
| Ventas móvil/tablet (scanner, cámara, fotolistas) | `flujo_ventas_movil_tablet.md` |
| Venta por peso/medida (Kg, Lb, L) | `venta_por_peso_medida.md` |
| Compras e inventario (escaneo factura IA) | `flujo_compra_inventario.md` |
| Conteo de inventario (ajustes, mermas) | `conteo_inventario.md` |
| Cierre de turno (reporte diario, métodos de pago) | `reporte_cierre_turno.md` |
| Registro de mermas | `flujo_registro_mermas.md` |
| Registro de gastos | `flujo_registro_gasto.md` |
| Catálogo de productos (diagnóstico de stock) | `catalogo_productos.md` |
| Creación de productos | `flujo_creacion_productos.md` |
| Creación de promociones | `flujo_creacion_promociones.md` |
| Importación Excel (oculta temporalmente) | `flujo_importacion_excel.md` |
| Clientes y cuentas por cobrar (aging, abonos) | `clientes_cuentas_cobrar.md` |
| Deudas del negocio (cuentas por pagar) | `deudas_negocio.md` |
| Historial de ventas | `historial_ventas.md` |
| Anulación y devolución de ventas | `anulacion_devolucion_ventas.md` |
| Dashboard (KPIs, gráficos) | `dashboard.md` |
| Gestión de personal (roles, permisos) | `gestion_personal.md` |
| Visor de eventos y presencia (audit log) | `visor_eventos.md` |
| Autenticación (SMS OTP + Google OAuth) | `autenticacion_acceso.md` |
| Perfil de usuario | `perfil_usuario.md` |
| Suscripciones y pagos | `suscripciones_pagos.md` |
| Ajustes de facturación (datos negocio, impresora) | `ajustes_facturacion.md` |
| Impresión térmica QZ Tray (ESC/POS firmado) | `impresion_termica_qz.md` |
| Asistente IA RAG | `asistente_ia_rag.md` |
| Soporte humano vía Telegram | `soporte_humano_telegram.md` |
| Modo offline (Event Sourcing + cola sync) | `modo_offline.md` |
| Escaneo facturas IA (Gemini Vision) | `escaneo_facturas_ia.md` |
| Lector códigos de barras (pistola USB) | `lector_codigos_barras.md` |
| Analítica conversacional (edge function `ai-chat`) | `analitica_conversacional.md` |

## Regla obligatoria

Antes de tocar cualquier módulo documentado, revisar su archivo en `docs/caracteristicas/` para entender el comportamiento actual y no romper nada.
