# Gate de carga de la pantalla de éxito (anti-salto) — 2026-06-04

## Resumen

La pantalla de éxito de una venta (`SuccessSidebar` en desktop/tablet, `SuccessScreen` en móvil) se montaba mostrando un estado incompleto y luego "saltaba" cuando llegaban señales asíncronas. El caso más visible: finalizar una venta en el móvil en modo Catálogo y ver cómo la sección "Enviar Comanda" aparecía de golpe al sincronizar el presence de una impresora conectada en otro equipo (la laptop).

El objetivo fue que el panel **se revele una sola vez, ya completo**, sin saltos ni estados intermedios.

---

## Diagnóstico

Al montar la pantalla, `receiptData` y el total ya están listos (`App.tsx` los setea antes de cambiar a `Screen.SUCCESS`). Los saltos venían de dos señales asíncronas:

1. **`printerConnected`** — la impresora local se confirma tras `reconnectPrinter()`. Afecta los bloques "Imprimir Comanda aquí" e "Imprimir Ticket".
2. **`availablePrinters`** — la lista de presence arranca vacía y se llena al llegar el `sync` de Supabase Realtime. Afecta el bloque "Enviar Comanda".

### Intento descartado

Un primer intento mostró un placeholder "Buscando impresoras…" basado en una bandera `isSyncing` que se apagaba en el primer evento `sync`. Falló porque el canal del *viewer* nunca llama a `track()`, así que el `sync` **no se dispara de forma fiable cuando no hay otras impresoras online** → el placeholder quedaba colgado para siempre. Se revirtió por completo.

---

## Solución implementada

Gate `isReady` en ambos componentes:

- Mientras `!isReady` → spinner sobrio centrado (`material-symbols-outlined progress_activity` con `animate-spin`), sobre el fondo del panel.
- Cuando `isReady` → se renderiza el panel completo y final una sola vez, con su animación de entrada (`fadeIn` en el sidebar, `scaleIn` en la tarjeta móvil).

**Condición de "listo"** (`useEffect` que observa `availablePrinters.length`):

```
si availablePrinters.length > 0  → isReady = true (inmediato)
si no                            → setTimeout(() => isReady = true, 800)
```

- Si hay una impresora online, el panel aparece rápido con ella ya visible (no espera los 800 ms).
- Si no hay ninguna, se revela a los 800 ms con el estado final correcto (incluido el caso "sin impresoras", donde el `sync` no es confiable).

El timeout es un único `setTimeout` por componente, fácil de ajustar.

---

## Archivos

| Archivo | Cambio |
|---------|--------|
| `components/SuccessSidebar.tsx` | Estado `isReady` + `useEffect`; contenido envuelto en gate (spinner / panel con `fadeIn`) |
| `screens/SuccessScreen.tsx` | Estado `isReady` + `useEffect`; tarjeta envuelta en gate (spinner / tarjeta con `scaleIn`) |

No se tocó `useKitchenPrinter.ts` ni `kitchenCommandService.ts` (presence intacto). `useAvailablePrinters()` sigue retornando `PrinterPresence[]`.

---

## Documentación actualizada

- `docs/caracteristicas/comandas_cocina.md` — nueva sección "Gate de carga de la pantalla de éxito (anti-salto)".

---

## Verificación

- `npx tsc --noEmit`: sin errores nuevos en los archivos modificados (los errores preexistentes en otros archivos no relacionados se mantienen igual).
