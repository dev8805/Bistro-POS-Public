# Formato de CONTEXT.md (Glosario de Dominio)

El archivo `CONTEXT.md` se ubica en la raíz del proyecto (`Bistro/CONTEXT.md`).
Su propósito exclusivo es definir el **lenguaje ubicuo** del negocio para evitar ambigüedades entre el usuario y la IA a lo largo del tiempo.

---

## Estructura

```markdown
# Bistro POS — Contexto del Dominio

Sistema POS (Punto de Venta) y administración para restaurantes y comercios, enfocado en operación offline-first, sincronización en la nube con Supabase e impresión de comprobantes.

## Términos del Dominio

**Negocio (`business`)**:
Entidad principal del comercio. Se identifica para lógica y consultas de usuario mediante `public_id` numérico, no por su UUID interno.
_Evitar_: Tienda, empresa, local.

**Comanda**:
Ticket de cocina o barra que contiene la orden de platillos y bebidas para su preparación. No representa un comprobante de pago.
_Evitar_: Factura, recibo, ticket de venta.

**Venta / Ticket de Venta**:
Registro completado de una transacción pagada por un cliente que descuenta inventario y suma al corte de caja.
_Evitar_: Comanda, orden abierta.

**Corte de Caja (Turno)**:
Cierre del turno operativo donde se cuadran los montos recibidos en efectivo, tarjeta o transferencias contra los registros del sistema.
_Evitar_: Cierre fiscal, arqueo diario.
```

---

## Reglas para `CONTEXT.md`

1. **Definiciones breves:** Máximo 1 o 2 oraciones. Define qué **ES** la entidad, no todo lo que hace su código.
2. **Usa `_Evitar_`:** Lista sinónimos engañosos o palabras ambiguas que la IA suele confundir.
3. **Solo términos del negocio:** No agregues términos de programación genéricos (como "Promise", "Hook", "Timeout", "Modal"). Solo conceptos del dominio de Bistro (ventas, mesas, comandas, recetas, lotes, mermas).
4. **Actualización en vivo:** Agrega el término en el instante en que quede acordado en la conversación.
