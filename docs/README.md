# Documentación de Bistro POS

Punto de entrada de la documentación del proyecto. Aquí encuentras arquitectura, comportamiento por módulo, guías de operación para el usuario final y el archivo histórico de planes de trabajo.

> Alcance: sistema de punto de venta para negocios minoristas en Colombia (PWA + Android). Stack en `../CLAUDE.md` y en `../.kiro/steering/tech.md`.

---

## Cómo está organizada esta carpeta

```
docs/
├── README.md                       ← este archivo (índice maestro)
├── auditoria_documentacion.md      ← estado de cada documento (vigente/parcial/histórico)
├── arquitectura/                   ← visión técnica del sistema
├── caracteristicas/                ← comportamiento real, módulo por módulo
├── guias_usuario/                  ← manuales para el operador del negocio
├── historial_planes/               ← planes de trabajo ya ejecutados (archivo histórico)
├── superpowers/                    ← specs de implementación ya cumplidas (archivo)
├── migrations/                     ← ⚠️ scripts SQL locales desactualizados (ver aviso interno)
└── previews/                       ← previsualizaciones HTML del formato de tickets/comandas
```

Cada carpeta tiene un rol distinto:

| Carpeta | Para qué sirve |
|---|---|
| `arquitectura/` | Cómo está construido el sistema por dentro: `App.tsx`, carga inicial, egress, realtime, entornos, design system. Léelo antes de tocar código base. |
| `caracteristicas/` | Un archivo por módulo funcional. Describe qué hace, qué tablas toca, qué permisos exige y qué NO hace. Es la fuente principal para entender comportamiento real. |
| `guias_usuario/` | Instructivos para dueños y cajeros. Lenguaje simple, sin jerga técnica. |
| `historial_planes/` | Planes de trabajo fechados (`YYYY-MM-DD-*.md`). No documentan estado actual, documentan cómo llegamos aquí. Se preservan para trazabilidad. |
| `superpowers/` | Specs y plans generados para features grandes (favoritos, modificadores, login PIN, evidencia). Ya implementados; se conservan como archivo. |
| `migrations/` | Scripts SQL aplicados a mano vía MCP. **No sustituyen** a `../supabase/migrations/`, que es la fuente de verdad local. Ver `migrations/README.md`. |
| `previews/` | HTMLs a tamaño real de comandas y tickets, útiles cuando se ajusta el formato ESC/POS. |

---

## 🏛️ Arquitectura (visión técnica)

Léelos primero si vas a tocar código base o infraestructura.

- [`arquitectura/APP_TSX_MAPA.md`](./arquitectura/APP_TSX_MAPA.md) — Mapa del `App.tsx` por líneas y responsabilidades.
- [`arquitectura/carga_inicial.md`](./arquitectura/carga_inicial.md) — Guards (auth → perfil → suscripción) y gate `appReady`.
- [`arquitectura/consumo_egress.md`](./arquitectura/consumo_egress.md) — PostgREST egress: qué consulta pesa, qué se optimizó, qué queda pendiente.
- [`arquitectura/consumo_realtime.md`](./arquitectura/consumo_realtime.md) — Supabase Realtime: canales activos, mensajes por acción, gates por permiso.
- [`arquitectura/flujo_entornos_github_supabase.md`](./arquitectura/flujo_entornos_github_supabase.md) — Ramas `main` / `pruebas`, proyectos `pos2` / `pos2-pruebas`, deploy en Cloudflare Pages.
- [`arquitectura/fix_parpadeo_borde_foco.md`](./arquitectura/fix_parpadeo_borde_foco.md) — Diagnóstico y solución del outline UA que parpadeaba en `CashRegisterScreen`.
- [`arquitectura/design_system.md`](./arquitectura/design_system.md) — Paleta "Warm Bistro", tokens, tipografía, patrón de bottom sheets. Antes vivía en la raíz como `DESIGN_SYSTEM.md`.

---

## 🧩 Características por módulo

Un archivo por módulo. Es la referencia obligatoria antes de tocar cualquier flujo.

### Ventas
- [`caracteristicas/flujo_ventas_desktop.md`](./caracteristicas/flujo_ventas_desktop.md) — POS desktop en modo EAN (pistola USB, atajos de teclado).
- [`caracteristicas/flujo_ventas_movil_tablet.md`](./caracteristicas/flujo_ventas_movil_tablet.md) — Modo Scanner y Catálogo en móvil/tablet, `PhotoOrderScreen` (fotolistas IA).
- [`caracteristicas/modo_catalogo_pos.md`](./caracteristicas/modo_catalogo_pos.md) — POS con tarjetas visuales (grid, carrito expandido, add-ons).
- [`caracteristicas/venta_por_peso_medida.md`](./caracteristicas/venta_por_peso_medida.md) — Productos por Kg/L/etc.: `PriceInputModal`, redondeo por etapas.
- [`caracteristicas/historial_ventas.md`](./caracteristicas/historial_ventas.md) — `SalesScreen`: consulta y reimpresión de ventas cerradas.
- [`caracteristicas/anulacion_devolucion_ventas.md`](./caracteristicas/anulacion_devolucion_ventas.md) — Anular (turno abierto) vs Devolver (turno cerrado). Exclusión mutua.
- [`caracteristicas/comprobante_publico_whatsapp.md`](./caracteristicas/comprobante_publico_whatsapp.md) — Página pública `/t/<orden>-<hash>` para compartir por WhatsApp.

### Mesas y comandas
- [`caracteristicas/mesas.md`](./caracteristicas/mesas.md) — Selector desde carrito, permiso `pos_sell`, `OpenTicketsBar` en tablet, offline "Usuario Eje".
- [`caracteristicas/comandas_cocina.md`](./caracteristicas/comandas_cocina.md) — Impresión local + envío remoto por Realtime, `ComandaLabelModal`.

### Caja y turno
- [`caracteristicas/reporte_cierre_turno.md`](./caracteristicas/reporte_cierre_turno.md) — Reporte diario, fuentes de datos, métodos de pago fijos, pagos mixtos.

### Inventario
- [`caracteristicas/catalogo_productos.md`](./caracteristicas/catalogo_productos.md) — `ProductsScreen`: pestañas Retail/Receta/Insumo/Servicio/Promoción, diagnóstico "salud de stock".
- [`caracteristicas/flujo_creacion_productos.md`](./caracteristicas/flujo_creacion_productos.md) — `SimpleProductScreen`, `ProcessedProductScreen`, `ServiceProductScreen`.
- [`caracteristicas/flujo_creacion_promociones.md`](./caracteristicas/flujo_creacion_promociones.md) — Combos (tabla `promotions` + `promotion_items`).
- [`caracteristicas/etiquetas_por_categoria.md`](./caracteristicas/etiquetas_por_categoria.md) — Modificadores por categoría, carpetas y productos como add-ons.
- [`caracteristicas/flujo_compra_inventario.md`](./caracteristicas/flujo_compra_inventario.md) — Compra con IA, evidencia obligatoria, offline.
- [`caracteristicas/conteo_inventario.md`](./caracteristicas/conteo_inventario.md) — `InventoryScreen`: conteo físico, ajustes, historial revertible.
- [`caracteristicas/flujo_registro_mermas.md`](./caracteristicas/flujo_registro_mermas.md) — Merma multi-item, motivos, cálculo automático de valor.
- [`caracteristicas/flujo_registro_gasto.md`](./caracteristicas/flujo_registro_gasto.md) — Gastos operativos con escaneo IA (Gemini).
- [`caracteristicas/flujo_importacion_excel.md`](./caracteristicas/flujo_importacion_excel.md) — Carga masiva desde plantilla `.xlsx` (opción actualmente oculta en UI).

### Clientes y proveedores
- [`caracteristicas/clientes_cuentas_cobrar.md`](./caracteristicas/clientes_cuentas_cobrar.md) — Fiado, aging, historial público del cliente.
- [`caracteristicas/deudas_negocio.md`](./caracteristicas/deudas_negocio.md) — Cuentas por pagar, directorio de proveedores, evidencia.

### Dashboard y reportes
- [`caracteristicas/dashboard.md`](./caracteristicas/dashboard.md) — KPIs, gráficos, cálculo de utilidad real, alertas.

### Empleados, roles y auditoría
- [`caracteristicas/gestion_personal.md`](./caracteristicas/gestion_personal.md) — Roles del sistema, permisos, herencia automática.
- [`caracteristicas/visor_eventos.md`](./caracteristicas/visor_eventos.md) — `ActivityScreen`: tabla `audit_events`, triggers, presencia.

### Autenticación y acceso
- [`caracteristicas/autenticacion_acceso.md`](./caracteristicas/autenticacion_acceso.md) — SMS OTP + PIN + Google, RPCs de teléfono, PIN de 4 dígitos.
- [`caracteristicas/perfil_usuario.md`](./caracteristicas/perfil_usuario.md) — `ProfileScreen`, cambio de PIN, eliminación de cuenta.

### Suscripciones y pagos online
- [`caracteristicas/suscripciones_pagos.md`](./caracteristicas/suscripciones_pagos.md) — Wompi, trial 20 días, tarjetas guardadas, códigos promo.

### Impresión y facturación
- [`caracteristicas/impresion_termica_qz.md`](./caracteristicas/impresion_termica_qz.md) — QZ Tray, firma RSA, multi-impresora por rol, instalador cliente.
- [`caracteristicas/ajustes_facturacion.md`](./caracteristicas/ajustes_facturacion.md) — Datos del ticket, ancho de papel, panel de impresora por rol.
- [`caracteristicas/lector_codigos_barras.md`](./caracteristicas/lector_codigos_barras.md) — Pistola USB, prioridad inter-instancia, catálogo global `barcode_catalog`.

### Modo offline
- [`caracteristicas/modo_offline.md`](./caracteristicas/modo_offline.md) — Event Sourcing + IndexedDB, cola de sync, modelo "Usuario Eje" para mesas.

### Asistente IA
- [`caracteristicas/asistente_ia_rag.md`](./caracteristicas/asistente_ia_rag.md) — RAG con Pinecone + Gemini, streaming SSE, feedback y handoff.
- [`caracteristicas/soporte_humano_telegram.md`](./caracteristicas/soporte_humano_telegram.md) — Escalación al desarrollador vía Forum Topics + Web Push.
- [`caracteristicas/escaneo_facturas_ia.md`](./caracteristicas/escaneo_facturas_ia.md) — Compra con IA (Gemini Vision), constructor matemático híbrido.
- [`caracteristicas/analitica_conversacional.md`](./caracteristicas/analitica_conversacional.md) — Edge function `ai-chat` (backend listo, sin UI).

### UI móvil
- [`caracteristicas/pantalla_inicio_movil.md`](./caracteristicas/pantalla_inicio_movil.md) — `HomeScreen` para móvil: KPIs, bottom sheets, action sheets.
- [`caracteristicas/acceso_directo_pantalla_inicio_gastos.md`](./caracteristicas/acceso_directo_pantalla_inicio_gastos.md) — Acceso directo e instalación PWA dedicada para Gastos en móviles y tablets.
- [`caracteristicas/sistema_notificaciones.md`](./caracteristicas/sistema_notificaciones.md) — Toasts globales, reglas editoriales, catálogo offline.

---

## 📖 Guías de usuario

Manuales para el operador del negocio. Están escritas para dueño, cajero o mesero.

- [`guias_usuario/recomendaciones.md`](./guias_usuario/recomendaciones.md) — Recomendaciones iniciales (navegador, instalación PWA, WhatsApp).
- [`guias_usuario/como_hacer_una_venta.md`](./guias_usuario/como_hacer_una_venta.md)
- [`guias_usuario/como_ver_ventas_del_dia.md`](./guias_usuario/como_ver_ventas_del_dia.md)
- [`guias_usuario/como_anular_o_devolver_una_venta.md`](./guias_usuario/como_anular_o_devolver_una_venta.md)
- [`guias_usuario/como_manejar_clientes_credito.md`](./guias_usuario/como_manejar_clientes_credito.md)
- [`guias_usuario/como_gestionar_deudas_negocio.md`](./guias_usuario/como_gestionar_deudas_negocio.md)
- [`guias_usuario/como_gestionar_inventario.md`](./guias_usuario/como_gestionar_inventario.md)
- [`guias_usuario/como_gestionar_empleados.md`](./guias_usuario/como_gestionar_empleados.md)
- [`guias_usuario/como_ver_el_dashboard.md`](./guias_usuario/como_ver_el_dashboard.md)
- [`guias_usuario/como_crear_productos.md`](./guias_usuario/como_crear_productos.md)
- [`guias_usuario/como_crear_recetas.md`](./guias_usuario/como_crear_recetas.md)
- [`guias_usuario/como_organizar_etiquetas_en_carpetas.md`](./guias_usuario/como_organizar_etiquetas_en_carpetas.md)
- [`guias_usuario/como_funcionan_los_lotes.md`](./guias_usuario/como_funcionan_los_lotes.md)
- [`guias_usuario/como_registrar_compra_inventario_con_ia.md`](./guias_usuario/como_registrar_compra_inventario_con_ia.md)
- [`guias_usuario/como_registrar_un_gasto.md`](./guias_usuario/como_registrar_un_gasto.md)
- [`guias_usuario/como_configurar_impresora.md`](./guias_usuario/como_configurar_impresora.md)
- [`guias_usuario/como_editar_perfil.md`](./guias_usuario/como_editar_perfil.md)
- [`guias_usuario/como_usar_el_modo_offline.md`](./guias_usuario/como_usar_el_modo_offline.md)
- [`guias_usuario/como_usar_visor_eventos.md`](./guias_usuario/como_usar_visor_eventos.md)

---

## 🗂️ Archivo histórico

Documentos que ya no reflejan el estado actual del código, pero se conservan como registro de cómo se llegó aquí.

- [`historial_planes/`](./historial_planes/) — Planes de trabajo fechados (`YYYY-MM-DD-*.md`). Incluye los changelogs recientes de UI (facturas, móvil), refactors de mesas, migraciones puntuales y análisis técnicos como el de manejo de fechas.
- [`superpowers/`](./superpowers/) — Specs y plans generados para features grandes ya implementadas.
- [`migrations/`](./migrations/) — Scripts SQL locales aplicados a mano vía MCP. **Desactualizados frente a `../supabase/migrations/`**; ver `migrations/README.md`.

---

## Reglas del proyecto

Están en `../.kiro/steering/` (se cargan automáticamente al agente):

- `product.md` — módulos del producto y su documentación asociada.
- `tech.md` — stack técnico, variables de entorno, comandos.
- `structure.md` — convenciones de archivos por carpeta (`screens/`, `hooks/`, `lib/`, …).
- `code-conventions.md` — idioma, tono, análisis de impacto, formato de commits.
- `react-patterns.md` — anti-patterns a evitar y patrón base de componente.
- `spec-idioma.md` — todo el flujo de Spec en español.
- `suscripciones.md` — regla especial del negocio 10001.

## Auditoría

El estado individual de cada documento (vigente, parcial, obsoleto, faltante…) está en [`auditoria_documentacion.md`](./auditoria_documentacion.md).
