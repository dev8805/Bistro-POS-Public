# Guardado Correcto de Tarjetas en Suscripciones (Wompi) Plan de Implementación

**Objetivo:** Modificar el flujo de suscripción para que el pago inicial genere también una **Fuente de Pago (*Payment Source*) reutilizable** en Supabase (`payment_sources`), habilitando futuras renovaciones automáticas, y eliminar el flujo fallido del Trial de $0.
**Arquitectura:** Migrar del Wompi Drop-In (Widget Web que no devuelve tokens de tarjeta) hacia un modelo donde la app levanta el formulario de tarjeta nativo o usa un `Acceptance Token` explícito antes de generar la transacción real mediante llamadas directas al backend desde Edge Functions.
**Tech Stack:** React, TailwindCSS, TypeScript, Supabase, Wompi REST API.
---

## ✅ Decisiones de Negocio Confirmadas

Basado en la retroalimentación, hemos definido las siguientes reglas claras para la implementación:

1. **Uso de Dos Vías de Pago (Tarjetas vs PSE/Nequi):** 
   - Se guardarán tarjetas **solo** si eligen explícitamente pagar con tarjeta (para habilitar auto-renovación). 
   - Si el usuario prefiere pagar con otros métodos (PSE, Nequi) se seguirá usando el Widget actual de Wompi (pago de una sola vez) y el usuario deberá entrar cada mes a renovar.

2. **Flujo de $0 (Trial) Confirmado:** 
   - El nuevo usuario entra a sus 14 días de prueba **sin necesidad de ingresar tarjeta**. 
   - Una vez finalizada la prueba, se le solicitará el primer cobro. Allí su tarjeta quedará guardada de forma predeterminada, pero el usuario tendrá siempre la libertad de **eliminar su tarjeta** en la pestaña de "Métodos de Pago" si así lo desea.

3. **¿Qué es el "Drop-In"?:** 
   - Es el nombre técnico que usamos para el **Widget de Wompi** (La ventanita o ventana emergente que abre Wompi en tu sitio web donde la gente pone sus datos, PSE o escanea QR de Bancolombia). Al omitir la ventana de Wompi y construir nuestro propio formulario, cobramos directamente usando la API, lo cual es necesario para guardar tarjetas.

---

## Plan Operativo de Migración (Usando la Alternativa de Formulario Propio en Modal)

*Considerando que aceptemos la lógica de forzar que los pagos recurrentes nazcan de un Formulario Nativo (igual al modal de la pantalla de gestión).*

### Tarea 1: Eliminar el Flujo de Tokenización Condicional ($0)

**Archivos:**
- Modify: `screens/SubscriptionPlansScreen.tsx`

**Paso 1: Eliminar función de Trial con Tarjeta**
Se elimina `handleCardTrialPlan(...)` entero, de manera que la app no use Wompi al solicitar una prueba.

```tsx
// 1. Eliminar la función useCallback `handleCardTrialPlan` por completo. (Líneas 328-431 aprox.)
```

**Paso 2: Ajustar lógica the `handleSelectPlan`**
Simplificamos la lógica de entrada al plan.

```tsx
    const handleSelectPlan = (plan: Plan) => {
        if (hasUsedTrial) {
            // Irá directo al modal local de pago con tarjeta en el Tarea 2
            setFlowStep('payment_form_modal'); // NUEVO ESTADO
            setSelectedPlan(plan);
            return;
        }

        if (plan.trial_duration > 0) {
            handleStartTrial(plan);
        } else {
            setFlowStep('payment_form_modal');
            setSelectedPlan(plan);
        }
    };
```

---

### Tarea 2: Modal de Tarjeta Propio e Integración de Payment Sources

**Archivos:**
- Modify: `screens/SubscriptionPlansScreen.tsx`

**Paso 1: Nuevo estado y renderizado condicional de checkout interno**
Re-utilizaremos la lógica del formulario de "Agregar Tarjeta" que existe en `SubscriptionManagementScreen`, pero al instante de guardar la tarjeta, cobra la primera mensualidad usando una Edge Function (o RPC) de Supabase.

```tsx
// Añadir estado:
const [cardForm, setCardForm] = useState({ number: '', cvc: '', expMonth: '', expYear: '', cardHolder: '' });

// Antes de `if (flowStep === 'promo_success')`, añadir la renderización condicional:
if (flowStep === 'payment_form_modal') {
    return (
        <div className="min-h-screen w-full flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-xl border border-gray-200">
                <h3 className="text-xl font-bold mb-4">Finalizar compra - {selectedPlan?.name}</h3>
                <p className="text-sm font-bold mb-4 text-emerald-600">Total a pagar ahora: ${selectedPlan?.price_monthly.toLocaleString('es-CO')} COP</p>
                <form onSubmit={handleCustomPaymentSubmit} className="space-y-4">
                    {/* Renderizar Inputs idénticos a AddCardModal: number, cvc, expMonth, expYear, cardHolder */}
                    <button type="submit" disabled={processingPlanId !== null} className="w-full bg-emerald-600 text-white font-bold p-3 rounded">
                       {processingPlanId ? 'Procesando...' : 'Pagar y Guardar Tarjeta'}
                    </button>
                    <button type="button" onClick={() => setFlowStep('plans')} className="w-full mt-2 text-gray-500 font-bold p-3">Volver</button>
                </form>
            </div>
        </div>
    )
}
```

**Paso 2: Transacción Combinada FrontEnd/Wompi (`handleCustomPaymentSubmit`)**

```tsx
const handleCustomPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.business_id || !selectedPlan) return;
    setProcessingPlanId(selectedPlan.id);
    setError(null);

    try {
        // 1. Obtener Token de Tarjeta hacia sandbox Wompi
        const tokenRes = await fetch('https://sandbox.wompi.co/v1/tokens/cards', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${WOMPI_PUBLIC_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                number: cardForm.number.replace(/\s/g, ''),
                cvc: cardForm.cvc,
                exp_month: cardForm.expMonth,
                exp_year: cardForm.expYear,
                card_holder: cardForm.cardHolder
            })
        });

        const tokenData = await tokenRes.json();
        if (tokenData.error) throw new Error(tokenData.error.reason);

        const token = tokenData.data; // Aquí tenemos token.id (temporal!)
        
        // 2. Insertar Source "Token" Inicialmente y guardar info de la tarjeta en `payment_sources`
        const { data: sourceData, error: sourceError } = await supabase
            .from('payment_sources')
            .insert({
                business_id: profile.business_id,
                wompi_source_id: token.id, // Ojo, esto es temporal hasta reemplazar por el Wompi Payment Source real en el backend.
                card_last_four: token.last_four,
                card_brand: token.brand,
                card_exp_month: token.exp_month,
                card_exp_year: token.exp_year,
                is_active: true,
                is_default: true
            })
            .select().single();

        if (sourceError) throw sourceError;

        // 3. ENVIAR a Edge Function `process-initial-payment` el token, monto y negocio
        const chargeRes = await fetch(`${SUPABASE_URL}/functions/v1/process-initial-payment`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ 
                 planId: selectedPlan.id, 
                 paymentSourceId: sourceData.id, 
                 businessId: profile.business_id 
             })
        });
        const chargeData = await chargeRes.json();
        if (!chargeData.success) throw new Error(chargeData.error);

        // Si la Edge Function cobró exitosamente:
        await checkSubscription();
        setFlowStep('payment_success');

    } catch (err: any) {
         setError(err.message || 'Error realizando el cobro');
    } finally {
         setProcessingPlanId(null);
    }
};
```

---

### Tarea 3: Edge Function (Procesamiento Seguro con Llave Privada)

**Archivos:**
- Create: `supabase/functions/process-initial-payment/index.ts`

**Paso 1: Implementar Cobro Interno Wompi**
Esta función tomará el Token Temporal de la tarjeta emitido en el frontend, y lo transformará usando la `WOMPI_PRIVATE_KEY` y el `ACCEPTANCE_TOKEN` del comercio en una **transacción**. Esta Edge Function se convierte en la responsable de actualizar `subscription_invoices` y `business_subscriptions`.

*(Nota Técnica: Al usar la API Privada para transacciones de cobro directo `/v1/transactions`, Wompi cargará la tarjeta enviada desde el frontend construyendo un cobro silencioso sin requerir abrir el Widget visual).*

---

### Siguiente Paso

El plan está **aprobado**. Queda listo para ser implementado cuando lo decidas dividiendo el pago en dos botones dentro del modal de planes: una opción de `"Pagar Fijo con Tarjeta"` y otra opción `"Otros métodos (PSE/Nequi sin autorenovación)"`.
