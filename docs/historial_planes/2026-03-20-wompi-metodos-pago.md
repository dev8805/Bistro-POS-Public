# Sincronización de Métodos de Pago a Producción (Wompi) Plan de Implementación

**Objetivo:** Reparar el formulario "Agregar Nuevo Método" en la gestión de suscripciones para que envíe los tokens a la API de Wompi de Producción correctamente y subsane el error grave del guardado literal (`'token'`) en la base de datos que corrompe la API.
**Arquitectura:** Centralización de credenciales usando `src/config/wompi.ts` e importándolas dentro de `SubscriptionManagementScreen.tsx`.
**Tech Stack:** React, TypeScript, Supabase, Wompi REST API.
---

## ❓ ¿Cómo paso Wompi a Producción?

Para confirmar que tu aplicación apunta al entorno real (donde se cobra dinero de verdad), debes validar dos cosas muy simples:

1. **La Llave Pública (Public Key):** Actualmente, en `src/config/wompi.ts` tienes definida una clave de producción (`pub_prod_SBOikcfiz2DnChtvAPpSchII3DYeHNIY`). Las claves "reales" siempre empiezan por `pub_prod_`. Las de prueba por `pub_test_`. 
2. **La URL Base (Endpoint):** 
   - Para Pruebas (Test): `https://sandbox.wompi.co/v1/`
   - Para Producción (Real): `https://production.wompi.co/v1/`

Si ya activaste tu cuenta Wompi comercial, solo debes constatar que la llave pública definida en `config/wompi.ts` sea la llave de Producción de tu negocio. El plan que detallo abajo hará que toda la aplicación la respete globalmente.

---

## Plan Operativo de Sincronización (SubscriptionManagementScreen)

### Tarea 1: Limpiar Llaves Harcodeadas y Uniformizar Importaciones

**Archivos:**
- Modify: `screens/SubscriptionManagementScreen.tsx`

**Paso 1: Remover constantes internas**
Eliminar la línea que define de forma forzosa la clave de pruebas y reemplazar la importación de configuración central añadiendo la llave global.

```tsx
// Modificar cerca de Linea ~10:
// Agregar import { WOMPI_PUBLIC_KEY } from '../src/config/wompi';
// Borrar la linea: const WOMPI_PUB_KEY = "pub_test_xP1A6jE1Z5bMYr1M9RofbEqX9m2zX7x1"; 
```


### Tarea 2: Corregir API Endpoint de Tokenización (Producción)

**Archivos:**
- Modify: `screens/SubscriptionManagementScreen.tsx`

**Paso 1: Conmutar URL y Auth de Fetch**
En la función `handleAddCard`, cambiar la URL de Wompi para que dependa del ambiente oficial de Producción y use la nueva constante central.

```tsx
// Dentro de `const handleAddCard = async (e: React.FormEvent) => { ... }`
// Reemplazar el fetch antiguo por:

const tokenRes = await fetch('https://production.wompi.co/v1/tokens/cards', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${WOMPI_PUBLIC_KEY}`, // <-- Llave maestra ahora en producción
        'Content-Type': 'application/json'
    },
    // body queda igual...
```

### Tarea 3: Reparar Bug en Base de Datos de `wompi_source_id`

**Archivos:**
- Modify: `screens/SubscriptionManagementScreen.tsx`

**Paso 1: Reemplazar el literal 'token'**
En el insert de Supabase, justo después del fetch, reescribiremos el envío correcto de la propiedad hacia tu tabla `payment_sources`. Además nos aseguraremos de que las tarjetas nuevas se marquen como predeterminadas si ya existen otras activas o no, para que las Edge Functions usen la última tarjeta válida ingresada.

```tsx
// Dentro del bloque: const { error } = await supabase.from('payment_sources').insert(...)
// Modificar el parámetro `wompi_source_id`:

const { error } = await supabase
    .from('payment_sources')
    .insert({
        business_id: profile.business_id,
        card_token: token.id,
        card_last_four: token.last_four,
        card_brand: token.brand,
        card_exp_month: token.exp_month,
        card_exp_year: token.exp_year,
        wompi_source_id: token.id, // CORRECCIÓN CRITICA AQUÍ: En lugar de 'token' string manual
        is_active: true,
        is_default: true // Que la nueva tarjeta siempre asuma el rol predeterminado para cobros
    });
```
