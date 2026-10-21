# Auditoría de Documentación — Bistro POS

Fecha: 2026-07-12
Base de contraste: rama `main` (código actual), estructura real del repositorio.

Documento generado durante la reorganización de `docs/`. Recorre uno por uno cada archivo revisado, indica su fuente de verdad contrastada, su estado y la acción tomada.

---

## Resumen ejecutivo

**Estado general:** la documentación estaba fundamentalmente **sana pero dispersa**. La carpeta `docs/caracteristicas/` cubre con detalle real todos los módulos importantes; la carpeta `docs/arquitectura/` tiene 6 documentos técnicos actualizados; las guías de usuario cubren los flujos operativos principales. Los problemas eran:

1. **Documentos raíz sueltos.** `DESIGN_SYSTEM.md`, `ANALISIS_FECHAS_ZONAS.md` y `CLAUDE.md` vivían en la raíz sin criterio. Se movieron los dos primeros a `docs/`; `CLAUDE.md` se conserva como overview para agentes.
2. **Changelogs mezclados con features.** Cinco archivos `cambios_YYYY-MM-DD_*.md` en `docs/caracteristicas/` eran registros de refactor UI, no documentación de módulo. Se movieron a `docs/historial_planes/` renombrados con la convención `YYYY-MM-DD-*.md`.
3. **README raíz genérico.** El `README.md` de la raíz era el placeholder de Google AI Studio, sin utilidad real. Se reescribió con contenido del proyecto.
4. **Índice ausente.** No había un `docs/README.md` que sirviera de mapa. Se creó.
5. **`docs/migrations/` desactualizada.** Contiene 9 SQL sueltos sin convención vs 46 migraciones reales en `supabase/migrations/`. Se agregó un README explicando el estado.
6. **Carpetas vacías o basura.** `docs/videos_tutoriales/` y `reportes_turno_olvidado/` (raíz) estaban vacías; se eliminaron.

**Cobertura funcional:** todos los módulos del sistema tienen doc de característica y, cuando aplica, guía de usuario. Ver la matriz al final del documento.

---

## Contraste con el código actual

Antes de auditar cada documento se hizo un inventario del código real:

- **Pantallas (`screens/`)**: 34 archivos. Cada `NombreScreen.tsx` fue verificado que exista y con las responsabilidades que la doc describe.
- **Hooks (`hooks/`)**: 44 archivos. Los hooks mencionados en cada doc de característica existen (`useSales`, `useOrders`, `useDebts`, `useTables`, `useOfflineSync`, `usePermissions`, `useEjeStatus`, `useComandaLabels`, `useKitchenPrinter`, etc.).
- **Contextos (`context/`)**: 4 archivos (`AuthContext`, `BusinessSettingsContext`, `ToastContext`, `ConfirmDialogContext`). Todos referenciados en la doc correcta.
- **Librerías (`lib/`)**: 44 archivos. Los servicios (`thermalPrinterService`, `printerRegistry`, `kitchenCommandService`, `qzSigning`, `offlineQueue`, `offlineStorage`, `offlineTableStore`, `paymentMethods`, `timezone`, `shiftReport`, etc.) coinciden con los mencionados.
- **Edge Functions (`supabase/functions/`)**: 28 carpetas. La documentación menciona correctamente `ai-chat`, `rag-chat`, `rag-index`, `rag-clear`, `scan-invoice`, `scan-expense`, `ocr-scan`, `firebase-phone-auth`, `change-pin`, `create/update/delete-employee`, `create-payment-source`, `generate-payment-signature`, `manage-promo-codes`, `send-receipt-email`, `send-support-push`, `support-escalate`, `support-send-to-telegram`, `telegram-webhook`, `support-cleanup-expired`, `barcode-lookup`, `deepgram-token`, `get-brand-colors`, `charge-trial-subscription`, `process-subscriptions`, `cleanup-orphan-images`, `remove-bg`, `set-firebase-role`, `extract-card-from-transaction`, `generate-cost-formula`, `update-email`.
- **Migraciones (`supabase/migrations/`)**: 46 archivos. La convención local es `YYYYMMDD_*.sql`; la doc dice explícitamente que no es la fuente de verdad y que debe consultarse la BD vía MCP.

---

## Tabla de auditoría — Archivos raíz del repo

| Documento | Propósito | Fuente de verdad contrastada | Estado | Acción tomada | Notas |
|---|---|---|---|---|---|
| `README.md` (raíz) | Punto de entrada del repo | `package.json`, scripts, estructura del proyecto | **Obsoleto** | Reescrito | Antes era el placeholder genérico de AI Studio. Ahora apunta a `docs/README.md`, `CLAUDE.md`, `.kiro/steering/`. |
| `CLAUDE.md` | Overview técnico para agentes | Coherente con `.kiro/steering/tech.md`/`product.md`/`structure.md` | **Vigente con solape** | Se conserva, referencia a `docs/arquitectura/design_system.md` | Overlap parcial con `.kiro/steering/`, pero es útil como archivo autocontenido para asistentes. |
| `DESIGN_SYSTEM.md` (raíz) | Paleta, tipografía, bottom sheets | `index.html` (Tailwind config), `screens/HomeScreen`, `components/TableSelectorControl` | **Vigente** | **Movido** a `docs/arquitectura/design_system.md` | Ahora referenciado desde CLAUDE, `pantalla_inicio_movil`, `modo_catalogo_pos`, `mesas`. |
| `ANALISIS_FECHAS_ZONAS.md` (raíz) | Auditoría técnica del manejo de fechas (feb 2026) | `lib/timezone.ts`, `useDashboard`, `useExpenses` | **Histórico** | **Movido** a `docs/historial_planes/2026-02-16-analisis-fechas-zonas.md` | Ya cumplió su función; se preserva como referencia. |

## Tabla de auditoría — `docs/arquitectura/`

| Documento | Propósito | Fuente de verdad contrastada | Estado | Acción tomada | Notas |
|---|---|---|---|---|---|
| `APP_TSX_MAPA.md` | Mapa por líneas de `App.tsx` (2702 líneas) | `App.tsx` (3742 líneas actuales) | **Vigente parcial** | Sin cambios | El documento reporta 2702 líneas y el archivo actual tiene 3742. Las secciones (imports, auth, cart, payment) siguen presentes pero los rangos de líneas pueden estar desfasados. Recomendación: reindexar rangos si se planea usar como referencia de saltos rápidos. |
| `carga_inicial.md` | Guards de auth/perfil/suscripción, gate `appReady`, eager `HomeScreen` | `App.tsx` (`AppContent`, `appReady`, `handleSellContentReady`) | **Vigente** | Sin cambios | Todas las banderas y hooks descritos existen en el código actual. |
| `consumo_egress.md` | PostgREST egress, optimizaciones aplicadas y pendientes | `hooks/useSales`, `useProducts`, `useCashRegister` (splits recientes de `fetchShifts`) | **Vigente** | Sin cambios | Refleja optimizaciones de 2026-06-28 y 06-29 con precisión. |
| `consumo_realtime.md` | Canales realtime, gates de permisos | `App.tsx` (`products-sync`), `useTables`, `presenceManager`, `useEmployeePresence` | **Vigente** | Sin cambios | La lista de tablas en la publicación coincide con el estado descrito en su spec. |
| `fix_parpadeo_borde_foco.md` | Solución al outline UA en `CashRegisterScreen` | `index.css`, `CashRegisterScreen.tsx`, `App.tsx` (backdrop) | **Vigente** | Sin cambios | Guía reutilizable, todavía aplicable. |
| `flujo_entornos_github_supabase.md` | Ramas + proyectos Supabase + Cloudflare Pages | `.env`, `.github/workflows/`, dashboard Supabase | **Vigente parcial** | Sin cambios | La sección "Estado de la Migración" es histórica (mayo 2026) pero sigue siendo la referencia operativa del entorno. |
| `design_system.md` | Paleta, tipografía v2, bottom sheets, patrón de sensibilidad | `index.html`, `screens/HomeScreen`, componentes de bottom sheet | **Vigente** | **Recibido** desde la raíz | Referenciado desde 4 features y CLAUDE. |

## Tabla de auditoría — `docs/caracteristicas/`

Todos los documentos de esta carpeta se contrastaron contra código real (pantallas, hooks, tablas Supabase, edge functions). Se listan agrupados por dominio; el estado por defecto es **Vigente** cuando la doc corresponde al código actual con notas de implementación al día.

### Ventas y comprobantes

| Documento | Fuente de verdad contrastada | Estado | Notas |
|---|---|---|---|
| `flujo_ventas_desktop.md` | `MenuScreen.tsx`, `PaymentSidebar.tsx`, `useBarcodeScanner` | Vigente | Marca correctamente los elementos "pendientes de limpieza" en `MenuScreen` (grid legacy, `ProductCard` sin uso). |
| `flujo_ventas_movil_tablet.md` | `MenuScreen.tsx`, `SellScreen.tsx`, `PhotoOrderScreen.tsx`, `PaymentScreen.tsx` | Vigente | Cubre modo scanner, modo catálogo, fotolistas OCR y overlay de pago con `h-[100dvh]`. |
| `modo_catalogo_pos.md` | `MenuScreen.tsx`, `CartItemRow.tsx`, `ProductCard.tsx`, `SalesModeSettingsPanel.tsx`, tabla `businesses.catalog_mode_enabled` | Vigente | Documenta el cambio breaking de 2026-06-23 (config por negocio, no por dispositivo). |
| `venta_por_peso_medida.md` | `PriceInputModal.tsx`, `App.tsx` (`updateQuantity`, `cartTotal`) | Vigente | Cubre el redondeo por etapas. |
| `historial_ventas.md` | `SalesScreen.tsx`, `useOrders.ts` | Vigente | Coherente con la RPC `void_order_and_restore_stock` y con `RefundSaleModal`. |
| `anulacion_devolucion_ventas.md` | RPCs `void_order_*`, `process_sale_refund`; `useRefunds.ts` | Vigente | La frontera turno abierto/cerrado y la exclusión mutua están respaldadas por SQL. |
| `comprobante_publico_whatsapp.md` | `PublicReceiptScreen.tsx`, migración `20260604_update_public_receipt_rpc.sql` | Vigente | Consolidación local coherente con `consolidateReceiptItems`. |

### Mesas y comandas

| Documento | Fuente de verdad contrastada | Estado | Notas |
|---|---|---|---|
| `mesas.md` | `TableSelectorControl.tsx`, `OpenTicketsBar.tsx`, `useTables.ts`, `useEjeStatus.ts`, `usePermissions.ts` (`canFinalizeSale`) | Vigente | Documenta modelo "Usuario Eje", flag `is_tables_enabled`, permiso `pos_sell`. |
| `comandas_cocina.md` | `useKitchenPrinter.ts`, `useComandaLabels.ts`, `kitchenCommandService.ts`, tablas `comanda_labels*` | Vigente | Cubre modal de etiquetas, presence y layout de header en 80/58mm. |

### Caja

| Documento | Fuente de verdad contrastada | Estado | Notas |
|---|---|---|---|
| `reporte_cierre_turno.md` | `useCashRegister.ts`, `CashRegisterScreen.tsx`, `shiftReport.ts`, RPC `close_cash_shift`, migración `20260605_shift_report_fields.sql` | Vigente | Describe pagos mixtos `'mixed'` con reparto correcto. |

### Inventario, productos y promociones

| Documento | Fuente de verdad contrastada | Estado | Notas |
|---|---|---|---|
| `catalogo_productos.md` | `ProductsScreen.tsx`, `useProducts.ts`, `usePromotions.ts` | Vigente | Diagnóstico "salud de stock" (velocidad 28 días) con ejemplos numéricos claros. |
| `flujo_creacion_productos.md` | `SimpleProductScreen.tsx`, `ProcessedProductScreen.tsx`, `ServiceProductScreen.tsx`, `useImageUpload.ts`, tabla `product_ingredients` | Vigente | Ya apunta al histórico `2026-06-05-cambios-recetas-insumos.md`. |
| `flujo_creacion_promociones.md` | `CreatePromotionScreen.tsx`, `usePromotions.ts` | Vigente | Compensación best-effort en `usePromotions` documentada. |
| `flujo_compra_inventario.md` | `InventoryPurchase.tsx`, edge `scan-invoice`, `useSuppliers.ts`, tabla `business_debts` | Vigente | Cubre escaneo IA, pistola USB, cámara móvil, evidencia obligatoria (jun-2026). |
| `escaneo_facturas_ia.md` | `scan-invoice/index.ts`, `InvoiceReviewPanel.tsx`, tabla `suppliers.invoice_config` | Vigente | Detalle claro sobre "qué hace Gemini, qué hace Bistro". |
| `conteo_inventario.md` | `InventoryScreen.tsx`, `useInventory.ts`, RPC `get_revertible_adjustment_ids` | Vigente | Deuda técnica documentada (ajustes positivos con costo 0). |
| `flujo_registro_mermas.md` | `WasteRegister.tsx`, `useExpenses.ts`, tabla `wastage` | Vigente | Registro multi-item y motivo obligatorio. |
| `flujo_registro_gasto.md` | `ExpenseRegister.tsx`, edge `scan-expense`, `ExpenseModal.tsx` | Vigente | Cubre el flujo IA (jun-2026) y el manual. |
| `etiquetas_por_categoria.md` | `ProductOptionsModal.tsx`, `lib/optionFolders.ts`, RPC `save_product_modifiers` | Vigente | Carpetas + productos como add-ons con `parent_order_item_id`. |
| `flujo_importacion_excel.md` | `BulkUploadScreen.tsx`, `useBulkUpload.ts`, `excelParser.ts` | Vigente | Advierte que la opción está oculta en la UI temporalmente. |

### Clientes, deudas y dashboard

| Documento | Fuente de verdad contrastada | Estado | Notas |
|---|---|---|---|
| `clientes_cuentas_cobrar.md` | `ClientsScreen.tsx`, `useClients.ts`, RPC `get_public_client_history`, `PublicClientHistoryScreen.tsx` | Vigente | Gráfico de aging, panel de bucket y compartición pública documentados. |
| `deudas_negocio.md` | `DebtsScreen.tsx`, `useDebts.ts`, `useSuppliers.ts`, `EvidenceUploader.tsx`, `EvidenceViewer.tsx`, bucket `debt-evidence` | Vigente | Doc extensa con directorio de proveedores y evidencia obligatoria. |
| `dashboard.md` | `DashboardScreen.tsx`, `useDashboard.ts`, `exportDashboardPDF.ts` | Vigente | Documenta que el botón Descargar/Compartir está comentado y las alertas diagnósticas están calculadas pero no renderizadas. |

### Empleados, permisos, autenticación, perfil

| Documento | Fuente de verdad contrastada | Estado | Notas |
|---|---|---|---|
| `gestion_personal.md` | `EmployeesScreen.tsx`, edge `create-employee`/`update-employee`/`delete-employee`, RPC `seed_default_roles`, `usePermissions.ts` | Vigente | Roles del sistema, permisos automáticos (`pos_sell`, `clients_view`, `debts_view`) y protección del dueño documentados. |
| `autenticacion_acceso.md` | `AuthContext.tsx`, `LoginScreen.tsx`, `RegisterScreen.tsx`, RPCs `user_exists_by_phone`, `login_email_for_phone`, `_set_user_pin`, edge `firebase-phone-auth`/`change-pin` | Vigente | Cubre PIN 4 dígitos con hash bcrypt directo en `auth.users`. |
| `perfil_usuario.md` | `ProfileScreen.tsx`, `useImageUpload.ts`, RPC `delete_business_account` | Vigente | Cambio de PIN, correo temporal `@bistro.temp` filtrado en UI, cleanup de storage. |
| `visor_eventos.md` | `ActivityScreen.tsx`, `useAuditEvents.ts`, tabla `audit_events`, 17 triggers `audit_*` | Vigente | Regla crítica: la auditoría nunca aborta la operación de negocio. |

### Suscripciones y pagos

| Documento | Fuente de verdad contrastada | Estado | Notas |
|---|---|---|---|
| `suscripciones_pagos.md` | `SubscriptionPlansScreen.tsx`, `SubscriptionManagementScreen.tsx`, edges `generate-payment-signature`/`manage-promo-codes`, tabla `business_subscriptions` | Vigente | Recordar la regla especial del negocio 10001 (definida en `.kiro/steering/suscripciones.md`). |

### Impresión, facturación, barcode

| Documento | Fuente de verdad contrastada | Estado | Notas |
|---|---|---|---|
| `impresion_termica_qz.md` | `thermalPrinterService.ts`, `printerRegistry.ts`, `usePrinters.ts`, `qzSigning.ts`, componentes `PrinterConnectionCard`/`PrinterSplitButton`/`ComandaTargetGrid`, instalador `qz-setup/` | Vigente | Multi-impresora por rol, firma RSA-2048, transliteración a ASCII para code pages chinos. |
| `ajustes_facturacion.md` | `SettingsSidebarPanel.tsx`, `PrinterSettingsPanel.tsx`, `SalesModeSettingsPanel.tsx`, `useBusinessSettings.ts` | Vigente | Panel colapsable, dos submenús (Facturación e Impresión + Activar/Desactivar). |
| `lector_codigos_barras.md` | `useBarcodeScanner.ts`, `InventoryPurchase.tsx`, tabla `barcode_catalog` | Vigente | 13 fixes documentados con causa raíz y solución. |

### Modo offline

| Documento | Fuente de verdad contrastada | Estado | Notas |
|---|---|---|---|
| `modo_offline.md` | `useOfflineSync.ts`, `offlineQueue.ts`, `offlineStorage.ts`, `offlineCashCache.ts`, `offlineTableStore.ts`, `offlineClientMap.ts`, `offlineTableMap.ts`, `useEjeStatus.ts` | Vigente | Detección de conectividad con 4 capas, modelo "Usuario Eje", limitaciones conocidas. |

### IA, RAG y soporte humano

| Documento | Fuente de verdad contrastada | Estado | Notas |
|---|---|---|---|
| `asistente_ia_rag.md` | Edges `rag-chat`/`rag-index`/`rag-clear`, `useRagChat.ts`, `useRagDocuments.ts`, `RagChatWidget.tsx`, `useDictation.ts` | Vigente | Streaming SSE, HyDE, contextual retrieval, dictado con Deepgram. |
| `soporte_humano_telegram.md` | Edges `support-escalate`/`support-send-to-telegram`/`telegram-webhook`/`send-support-push`/`support-cleanup-expired`, tablas `support_sessions`/`support_messages`/`developer_availability`/`push_subscriptions`, RPCs `claim_push_subscription`/`release_push_subscription` | Vigente | Documenta el fix de aislamiento de push en dispositivos compartidos con RPC `SECURITY DEFINER`. |
| `escaneo_facturas_ia.md` | Ya listado arriba (Inventario) | Vigente | — |
| `analitica_conversacional.md` | Edge `ai-chat`, RPCs `execute_readonly_query`, `get_ai_chat_count_today`, tabla `ai_chat_history` | Vigente | Backend listo, sin frontend. |

### UI móvil y notificaciones

| Documento | Fuente de verdad contrastada | Estado | Notas |
|---|---|---|---|
| `pantalla_inicio_movil.md` | `HomeScreen.tsx`, `useHomeData.ts`, `useAuth.ts` (owner check) | Vigente | Profile bottom sheet documentado. |
| `sistema_notificaciones.md` | `ToastContext.tsx`, `AppToast.tsx` | Vigente | Regla editorial usuario vs desarrollador clara. |

## Tabla de auditoría — `docs/guias_usuario/`

Guías dirigidas al operador del negocio. Todas se contrastaron con el flujo real del código y son consistentes con las docs de característica correspondientes.

| Guía | Feature de característica asociada | Estado | Notas |
|---|---|---|---|
| `recomendaciones.md` | — | Vigente | Instalación PWA, navegador recomendado, WhatsApp Web. |
| `como_hacer_una_venta.md` | `flujo_ventas_desktop`, `flujo_ventas_movil_tablet` | Vigente | |
| `como_ver_ventas_del_dia.md` | `historial_ventas`, `reporte_cierre_turno` | Vigente | |
| `como_anular_o_devolver_una_venta.md` | `anulacion_devolucion_ventas` | Vigente | |
| `como_manejar_clientes_credito.md` | `clientes_cuentas_cobrar` | Vigente | |
| `como_gestionar_deudas_negocio.md` | `deudas_negocio` | Vigente | |
| `como_gestionar_inventario.md` | `conteo_inventario`, `catalogo_productos` | Vigente | |
| `como_gestionar_empleados.md` | `gestion_personal` | Vigente | |
| `como_ver_el_dashboard.md` | `dashboard` | Vigente | |
| `como_crear_productos.md` | `flujo_creacion_productos` | Vigente | |
| `como_crear_recetas.md` | `flujo_creacion_productos` (sección PROCESSED) | Vigente | |
| `como_organizar_etiquetas_en_carpetas.md` | `etiquetas_por_categoria` | Vigente | |
| `como_funcionan_los_lotes.md` | `flujo_compra_inventario` | Vigente | |
| `como_registrar_compra_inventario_con_ia.md` | `flujo_compra_inventario`, `escaneo_facturas_ia` | Vigente | |
| `como_registrar_un_gasto.md` | `flujo_registro_gasto` | Vigente | |
| `como_configurar_impresora.md` | `impresion_termica_qz`, `ajustes_facturacion` | Vigente | Cubre QZ Tray desde cero. |
| `como_editar_perfil.md` | `perfil_usuario` | Vigente | |
| `como_usar_el_modo_offline.md` | `modo_offline` | Vigente | |
| `como_usar_visor_eventos.md` | `visor_eventos` | Vigente | |

## Tabla de auditoría — `docs/historial_planes/` y `docs/superpowers/`

Contenido histórico. No documenta estado actual, documenta trazabilidad del proceso.

| Ubicación | Contenido | Estado | Acción |
|---|---|---|---|
| `historial_planes/*.md` (70+ archivos) | Planes de trabajo `YYYY-MM-DD-*.md` | Histórico | Se mantiene. Se agregaron los cinco changelogs `cambios_*` movidos desde `caracteristicas/` y los reportes `verificacion_optimizaciones_supabase` y `2026-02-16-analisis-fechas-zonas`. |
| `historial_planes/react-doctor-plan-fases.md` | Plan de refactor no fechado | Histórico | Se conserva. |
| `superpowers/plans/*.md` | 4 planes de implementación | Histórico (features ya en producción) | Se conserva. |
| `superpowers/specs/*.md` | 4 specs de diseño | Histórico | Se conserva. |

## Tabla de auditoría — `docs/migrations/`

| Archivo | Contenido real | Estado | Acción |
|---|---|---|---|
| `2026-06-07-login-pin.sql` | RPCs `_phone_digits`, `user_exists_by_phone`, `login_email_for_phone` aplicados por MCP | Aplicado en BD | Se conserva como referencia; ver aviso en `migrations/README.md`. |
| `2026-06-09-change-pin.sql` | RPC `_set_user_pin` para hash bcrypt directo | Aplicado en BD | Idem. |
| `2026-06-10-realtime-tables-rooms.sql` | Publicación `supabase_realtime` para `tables` y `rooms` | Aplicado en BD | Idem. |
| `2026-06-14-anulacion-devolucion-permisos.sql` | RLS y RPCs de anulación/devolución | Aplicado en BD | Idem. |
| `2026-06-17-fix-close-cash-shift-split-payments.sql` | Fix `close_cash_shift` para pagos mixtos | Aplicado en BD | Idem. |
| `2026-06-29-save-product-modifiers-rpc.sql` | RPC `save_product_modifiers` `SECURITY DEFINER` | Aplicado en BD | Idem. |
| `add_category_options_and_product_exclusions.sql` | Columnas `customizable_options`, `excluded_options` | Aplicado en BD | Sin fecha. Idem. |
| `create_suppliers_table.sql` | Tabla `suppliers` | Aplicado en BD | Sin fecha. Idem. |
| `fix_suppliers_schema.sql` | Ajuste de `suppliers` | Aplicado en BD | Sin fecha. Idem. |

**Todos** son SQL sueltos ejecutados a mano vía MCP. La fuente de verdad **local** son las 46 migraciones en `../supabase/migrations/`, y la fuente de verdad **real** es la BD de Supabase (consultar con MCP: `list_tables`, `list_migrations`, `list_edge_functions`).

## Tabla de auditoría — Carpetas raíz del repo (fuera de `docs/`)

| Carpeta | Contenido | Estado | Acción |
|---|---|---|---|
| `docs_externos/` | Un solo script Python (`generar_docx.py`) | No es documentación | Se deja. Se recomienda mover ese script a `scripts/` en un cleanup futuro. |
| `rediseño home/` | 2 HTMLs exportados con nombres corruptos (`DESIGN_SYSTEM.md _ _3 Tipograf_a.html`, `DESIGN_SYSTEM.md _ _7 Campos _ M_vil.html`) | Basura visible | No forma parte del sistema. Se deja para que el dueño decida borrarla; no se elimina en esta pasada sin confirmar. |
| `reportes_turno_olvidado/` | Vacía | Basura | Eliminada. |
| `.playwright-mcp/`, `.qz-signing/`, `.video-tools/`, `test-facturas/` | Artefactos operativos | Fuera de alcance | No son documentación. |

---

## Cobertura funcional

Matriz que valida el criterio 4 del pedido: los módulos críticos tienen documentación al menos de alto nivel.

| Módulo | Doc de característica | Guía de usuario | Estado |
|---|---|---|---|
| Ventas | `flujo_ventas_desktop`, `flujo_ventas_movil_tablet`, `modo_catalogo_pos`, `venta_por_peso_medida` | `como_hacer_una_venta` | Cubierto |
| Pagos (venta) | `flujo_ventas_desktop` (Pago Directo/Crédito), `reporte_cierre_turno` (mixtos), `dashboard` (métodos) | `como_hacer_una_venta` | Cubierto |
| Caja | `reporte_cierre_turno` | `como_ver_ventas_del_dia` (incluye cierre) | Cubierto |
| Historial de ventas | `historial_ventas`, `anulacion_devolucion_ventas` | `como_anular_o_devolver_una_venta`, `como_ver_ventas_del_dia` | Cubierto |
| Inventario | `catalogo_productos`, `flujo_compra_inventario`, `conteo_inventario`, `flujo_registro_mermas` | `como_gestionar_inventario`, `como_registrar_compra_inventario_con_ia`, `como_funcionan_los_lotes` | Cubierto |
| Productos | `flujo_creacion_productos`, `flujo_creacion_promociones`, `etiquetas_por_categoria` | `como_crear_productos`, `como_crear_recetas`, `como_organizar_etiquetas_en_carpetas` | Cubierto |
| Clientes | `clientes_cuentas_cobrar`, `comprobante_publico_whatsapp` | `como_manejar_clientes_credito` | Cubierto |
| Empleados / permisos | `gestion_personal`, `visor_eventos` | `como_gestionar_empleados`, `como_usar_visor_eventos` | Cubierto |
| Mesas / comandas | `mesas`, `comandas_cocina` | (falta guía de usuario dedicada) | Cubierto a nivel técnico; pendiente guía |
| Offline | `modo_offline` | `como_usar_el_modo_offline` | Cubierto |
| Impresoras | `impresion_termica_qz`, `ajustes_facturacion`, `lector_codigos_barras` | `como_configurar_impresora` | Cubierto |
| Dashboard / reportes | `dashboard` | `como_ver_el_dashboard` | Cubierto |
| RAG / chat / IA | `asistente_ia_rag`, `soporte_humano_telegram`, `escaneo_facturas_ia`, `analitica_conversacional` | — | Cubierto a nivel técnico; sin guía (el chat es autoexplicativo, la analítica no tiene UI todavía) |
| Suscripciones / pagos online | `suscripciones_pagos` | — | Cubierto a nivel técnico; sin guía de usuario final |
| Recibo público | `comprobante_publico_whatsapp` | Referenciada dentro de `como_manejar_clientes_credito` y `como_hacer_una_venta` | Cubierto |
| Historial público de cliente | `clientes_cuentas_cobrar` (sección "Compartir historial") | `como_manejar_clientes_credito` | Cubierto |
| Autenticación | `autenticacion_acceso` | (guía de usuario indirecta en `como_editar_perfil` y `recomendaciones`) | Cubierto |
| Perfil | `perfil_usuario` | `como_editar_perfil` | Cubierto |
| UI móvil (Home) | `pantalla_inicio_movil` | — | Cubierto a nivel técnico; el propio home es autoexplicativo |
| Sistema de toasts | `sistema_notificaciones` | — | Referencia técnica interna |

**Vacíos detectados que quedan como pendientes explícitos:**

1. **Guía de usuario para Mesas y Comandas.** El módulo está cubierto técnicamente (`mesas.md`, `comandas_cocina.md`) pero no hay un `como_gestionar_mesas.md` o `como_enviar_comandas.md` en `guias_usuario/`. Recomendado para dueños de restaurantes/cafeterías.
2. **Guía de usuario de Suscripciones.** No hay `como_gestionar_mi_suscripcion.md`. La UI de `SubscriptionManagementScreen` cubre lo básico, pero un instructivo ayudaría (especialmente por el flujo de tarjetas y códigos promo).
3. **Sección "Documentos Contables".** `ajustes_facturacion.md` menciona que la opción `ContingencyDocScreen` está oculta en UI pero mantenida en código. Cuando se decida reactivarla o descartarla, actualizar el documento.
4. **Alertas del dashboard.** `dashboard.md` deja constancia de que `data.diagnosticAlerts` y `data.stockOutCount` se calculan pero no se renderizan. Es un pendiente de producto, no de documentación, pero conviene rastrearlo.
5. **Analítica conversacional (`ai-chat`).** Backend listo, sin frontend. Cuando se conecte, la doc de característica está preparada; solo faltará añadir la guía de usuario.

---

## Nombres actualizados

| Antes | Después |
|---|---|
| `DESIGN_SYSTEM.md` (raíz) | `docs/arquitectura/design_system.md` |
| `ANALISIS_FECHAS_ZONAS.md` (raíz) | `docs/historial_planes/2026-02-16-analisis-fechas-zonas.md` |
| `docs/verificacion_optimizaciones_supabase.md` | `docs/historial_planes/2026-06-30-verificacion-optimizaciones-supabase.md` |
| `docs/caracteristicas/cambios_deudas_directorio_2026-06-04.md` | `docs/historial_planes/2026-06-04-cambios-deudas-directorio.md` |
| `docs/caracteristicas/cambios_ui_facturas_2026-06-04.md` | `docs/historial_planes/2026-06-04-cambios-ui-facturas.md` |
| `docs/caracteristicas/cambios_ui_movil_2026-06-03.md` | `docs/historial_planes/2026-06-03-cambios-ui-movil.md` |
| `docs/caracteristicas/cambios_recetas_insumos_2026-06-05.md` | `docs/historial_planes/2026-06-05-cambios-recetas-insumos.md` |
| `docs/caracteristicas/cambios_mesas_addons_2026-06-26.md` | `docs/historial_planes/2026-06-26-cambios-mesas-addons.md` |

Se actualizaron las referencias cruzadas rotas por los movimientos:

- `docs/caracteristicas/flujo_creacion_productos.md` → apunta a `../historial_planes/2026-06-05-cambios-recetas-insumos.md`.
- `docs/caracteristicas/mesas.md`, `modo_catalogo_pos.md`, `pantalla_inicio_movil.md` → apuntan a `../arquitectura/design_system.md`.
- `CLAUDE.md` → apunta a `docs/arquitectura/design_system.md`.
- Los archivos de `historial_planes/` que mencionan `DESIGN_SYSTEM.md` sin path relativo se dejaron como estaban por ser documentos históricos (no ejecutables).

## Ramas mencionadas por el pedido

- **`refrescando-la-documentacion-de-la-app`** (rama remota): es ancestro de `main`. `git rev-list --left-right --count main...origin/refrescando-la-documentacion-de-la-app` devuelve `2  0`. **No aporta nada nuevo** frente a `main`.
- **`completando-guias-de-usuario,-para-chat`** (rama remota): muy anterior a `main`. El diff hacia esa rama muestra que `main` tiene **20 157 líneas más** en documentación. Es una versión histórica y **no debe usarse como fuente**.

Se descartaron ambas como referencia secundaria útil.

---

## Riesgos e inconsistencias que siguen pendientes

Se reportan aquí como hallazgos; no se corrigieron dentro del alcance de esta tarea (documentación pura, no cambios de código):

1. **`APP_TSX_MAPA.md` con rangos de línea desactualizados.** El archivo describe 2 702 líneas; el `App.tsx` actual tiene 3 742. Los rangos numéricos ya no coinciden aunque las secciones sí. Reindexado recomendado antes de dividir el archivo como plantea el mismo mapa.
2. **`docs/migrations/` desactualizada.** Los archivos locales son una muestra parcial de scripts aplicados a mano. La fuente de verdad son `supabase/migrations/` (46 archivos) y la BD real. El README de la carpeta lo deja claro; se decidió no eliminarlos para preservar valor histórico.
3. **`docs_externos/` contiene solo un script Python.** No es documentación. Un cleanup posterior debería moverlo a `scripts/`.
4. **`rediseño home/` en la raíz.** Dos HTMLs con nombres corruptos que parecen exports puntuales de otra herramienta. Se dejaron intactos; recomendado eliminarlos manualmente por el dueño.
5. **`ContingencyDocScreen` oculta en UI pero viva en código.** El documento `ajustes_facturacion.md` deja constancia. Si se descarta, se puede simplificar; si se reactiva, actualizar la doc.
6. **Alertas diagnósticas del dashboard.** `data.diagnosticAlerts` y `data.stockOutCount` en `useDashboard` se calculan pero no se renderizan. Reportado como pendiente en `dashboard.md`.
7. **`useSales.fetchOrders` ya no se llama por auto-fetch pero sigue existiendo.** Documentado en `consumo_egress.md` como diferido; se mantiene por si se reactiva.
8. **Ancho de papel a nivel de negocio, no por dispositivo.** Documentado explícitamente en `ajustes_facturacion.md`. Si el uso multi-estación se vuelve común, replantear.
9. **RPCs `_clean_temp_email` y `_update_user_email` referenciados por edge functions pero inexistentes en BD.** Documentado en `autenticacion_acceso.md`. Silenciosamente no fallan, pero conviene limpiar.

Estos puntos quedan documentados para el próximo ciclo de mantenimiento.
