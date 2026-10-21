# Cómo gestionar colaboradores y empleados en Bistro

> 👤 Guía para: Administradores y dueños del negocio
> 🧩 Módulo: **Equipo** → **Empleados** (o **Inicio** → **Gestión** → **Empleados**) y **Egresos** → **Gastos**
> ⏱️ Tiempo estimado: 8–10 minutos

---

## ¿Para qué sirve?

En Bistro la gestión humana tiene **dos áreas integradas**:

1. **Personal y Nómina (Colaboradores)**: para registrar al equipo del negocio (meseros, cocineros, lavaplatos, personal de apoyo) sin obligarlos a tener usuario ni contraseña. Aquí gestionas sus fichas, consultas sus adelantos y registras sus pagos de turno, sueldo o vales.
2. **Acceso al POS (Usuarios y Roles)**: para definir qué personas pueden iniciar sesión en la aplicación, asignarles un rol (Cajero, Administrador, Mesero) y configurar exactamente qué botones o módulos pueden ver y usar.

Si buscas registrar un colaborador, anotar un vale de personal, pagar un turno, pagar nómina, crear un usuario para la caja, ajustar permisos o bloquear accesos, este es el lugar.

---

## Antes de empezar

- Necesitas el permiso **Gestionar Empleados** para entrar al módulo de personal.
- Para registrar un gasto o pago a personal desde **Gastos**, requieres el permiso **Registrar Gastos**.
- **Conexión a internet**: los módulos de usuarios y roles requieren internet; no operan offline.
- **Límites de usuarios**: los colaboradores del directorio no tienen límite. En cambio, los usuarios con inicio de sesión en el POS están sujetos a tu plan (Plan Estándar permite hasta 3 usuarios activos; Plan Pro ofrece usuarios ilimitados).

```
          ¿Qué tipo de registro necesitas?
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
   [ COLABORADOR ]                 [ USUARIO POS ]
  Personal de nómina              Quien entra a la app
  (cocina, meseros, etc.)         (cajeros, administradores)
  • No requiere teléfono/PIN      • Requiere teléfono y PIN
  • Sin límite de usuarios        • Asignado a un Rol y permisos
  • Pagos, vales y turnos         • Inicia turno y cobra ventas
```

---

## Paso a paso

El módulo de gestión cuenta con tres pestañas superiores para separar el personal operativo, los usuarios con acceso y la seguridad de los roles.

---

### Paso 1 — Elegir la pestaña en el módulo de Empleados

Entra desde el menú lateral en **Equipo** → **Empleados** (en celular, **Inicio** → **Gestión** → **Empleados**). Arriba verás las tres pestañas de trabajo:

```
┌──────────────────────────────────────────────┐
│ [👥 Personal y Nómina] [🔒 Acceso POS] [🛡️ Roles]│
└──────────────────────────────────────────────┘
```

- **Personal y Nómina**: directorio de colaboradores, registro de pagos, vales e historial de recibos.
- **Acceso al POS**: usuarios que inician sesión con teléfono y PIN en Bistro.
- **Roles y Permisos**: configuración de lo que puede hacer cada cargo en el sistema.

---

### Paso 2 — Registrar un nuevo colaborador

En la pestaña **Personal y Nómina**, pulsa el botón **+ Registrar Colaborador**:

```
┌─ Nuevo Colaborador ──────────────────────────┐
│ NOMBRE COMPLETO *                            │
│ ┌──────────────────────────────────────────┐ │
│ │ Carlos Gómez                             │ │
│ └──────────────────────────────────────────┘ │
│ CARGO O FUNCIÓN *                            │
│ ┌──────────────────────────────────────────┐ │
│ │ Elegir cargo...                       ▾  │ │
│ └──────────────────────────────────────────┘ │
│ TIPO DOC      NÚMERO (OPCIONAL)              │
│ ┌──────────┐  ┌────────────────────────────┐ │
│ │ CC     ▾ │  │ 1020304050                 │ │
│ └──────────┘  └────────────────────────────┘ │
│ TELÉFONO (OPCIONAL)                          │
│ ┌──────────────────────────────────────────┐ │
│ │ 3001234567                               │ │
│ └──────────────────────────────────────────┘ │
│ VINCULAR CON USUARIO DEL POS (OPCIONAL)      │
│ ┌──────────────────────────────────────────┐ │
│ │ Sin usuario de acceso al sistema       ▾ │ │
│ └──────────────────────────────────────────┘ │
│        [ Cancelar ]   [ Guardar ]            │
└──────────────────────────────────────────────┘
```

Solo **Nombre** y **Cargo** son obligatorios. Si el cargo no existe en la lista, puedes crearlo ahí mismo tocando `[ + Crear nuevo cargo ]`.

---

### Paso 3 — Tarjeta del colaborador y acciones rápidas

Cada persona registrada aparece en una tarjeta del directorio activo con su información principal y accesos directos:

```
┌──────────────────────────────────────────────┐
│ 👤 Carlos Gómez              [ ✏️ ]  [ 🗑️ ]   │
│    COCINERO · CC 1020304050                  │
│ ┌──────────────────────────────────────────┐ │
│ │ Tel: 3001234567                          │ │
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │       💳  [ Registrar Pago ]             │ │
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │       📄  [ Historial de Pagos ]         │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

- **Registrar Pago**: abre la ventana para pagar turnos, sueldos, anticipos o vales.
- **Historial de Pagos**: abre la lista detallada de movimientos, con comprobantes y visor de fotos.
- **Editar (✏️)**: modifica datos personales o cargo.
- **Desactivar (🗑️)**: retira al colaborador sin borrar su historial contable.

---

### Paso 4 — Registrar un pago o vale al colaborador

Al pulsar **Registrar Pago** en la tarjeta del colaborador, se abre el formulario de liquidación:

```
┌─ Registrar Pago: Carlos Gómez ───────────────┐
│ FOTO COMPROBANTE FIRMADO (OPCIONAL)          │
│ ┌──────────────────┐  ┌────────────────────┐ │
│ │    📷 Cámara     │  │     🖼️ Galería      │ │
│ └──────────────────┘  └────────────────────┘ │
│ CONCEPTO DEL PAGO *              [ + Crear ] │
│ ┌──────────────────────────────────────────┐ │
│ │ Turno                                 ▾  │ │
│ └──────────────────────────────────────────┘ │
│ VALOR A PAGAR ($) *                          │
│ ┌──────────────────────────────────────────┐ │
│ │ $ 50.000                                 │ │
│ └──────────────────────────────────────────┘ │
│ OBSERVACIONES (OPCIONAL)                     │
│ ┌──────────────────────────────────────────┐ │
│ │ Turno noche fin de semana                │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

Elige el concepto (Turno, Vale, Sueldo, Horas Extra, Bono) o crea uno nuevo en segundos. Si tienes el recibo en papel firmado, sube la foto con la cámara.

---

### Paso 5 — Definir si el dinero sale de caja

Debajo del monto, el sistema verifica si existe un turno de caja abierto:

```
┌─ Control de Salida de Dinero ────────────────┐
│ ¿EL DINERO SALE DE CAJA?                     │
│ ┌───────────────┐      ┌───────────────────┐ │
│ │    [ Sí ]     │      │      [ No ]       │ │
│ └───────────────┘      └───────────────────┘ │
│   Descuenta de caja      Fondos externos     │
│   (solo efectivo)        (no afecta arqueo)  │
│                                              │
│ MÉTODO DE PAGO                               │
│ ┌──────────────────────────────────────────┐ │
│ │ Efectivo (Disp: $180.000 COP)         ▾  │ │
│ └──────────────────────────────────────────┘ │
│ TOTAL A PAGAR: $50.000 COP                   │
│                                              │
│         [ Confirmar Pago ]                   │
└──────────────────────────────────────────────┘
```

```
                     ¿Hay caja abierta?
                             │
              ├── NO ──> Modo administrativo
              │          (no afecta ningún arqueo)
              │
              └── SÍ ──> ¿El dinero sale de caja?
                           │
             ├── SÍ ──> Efectivo físico descuenta
             │          del saldo del turno en caja
             │
             └── NO ──> Fondos externos (transferencia,
                        bolsillo personal, sin descuento)
```

> ⚠️ Solo el dinero en **Efectivo** descuenta del cajón físico. Si pagas por Nequi o transferencia bancaria, ese saldo no afecta las ventas de la caja.

---

### Paso 6 — Comprobante térmico y PDF de pago

Al confirmar el pago, la pantalla muestra el recibo generado con opciones inmediatas de entrega:

```
┌──────────────────────────────────────────────┐
│                    ✅                        │
│             Pago Completado                  │
│             $ 50.000 COP                     │
│    Turno. Se guardó el registro en gastos    │
│                                              │
│ ┌──────────────────┐  ┌────────────────────┐ │
│ │  🖨️ Tirilla (80mm) │  │   📄 Descargar PDF  │ │
│ └──────────────────┘  └────────────────────┘ │
│                                              │
│             [ Listo / Cerrar ]               │
└──────────────────────────────────────────────┘
```

- **Imprimir Tirilla**: imprime el comprobante en tu impresora térmica para que el colaborador lo firme.
- **Descargar PDF**: genera el comprobante digital para enviar por WhatsApp o correo.

---

### Paso 7 — Registrar gasto de colaborador desde Egresos

También puedes registrar el pago desde el módulo general de gastos. Entra a **Inicio** → **Finanzas** → **Egresos** → **Gastos** y selecciona **Pago a Personal**:

```
┌──────────────────────────────────────────────┐
│ ← Cambiar tipo de gasto   [ PAGO A PERSONAL ]│
├──────────────────────────────────────────────┤
│ FOTO DEL VALE O COMPROBANTE (OPCIONAL)       │
│ [ 📎 ]   [ 📷 Cámara ]   [ 🖼️ Galería ]      │
│                                              │
│ COLABORADOR *                    [ + Crear ] │
│ ┌──────────────────────────────────────────┐ │
│ │ 🔍 Buscar colaborador por nombre/cargo...│ │
│ └──────────────────────────────────────────┘ │
│ CONCEPTO DEL PAGO *              [ + Crear ] │
│ ┌──────────────────────────────────────────┐ │
│ │ Elegir concepto...                    ▾  │ │
│ └──────────────────────────────────────────┘ │
│ VALOR A PAGAR ($) *                          │
│ ┌──────────────────────────────────────────┐ │
│ │ $ 0                                      │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

Escribe el nombre del colaborador para seleccionarlo, o toca `[ + Crear ]` para agregarlo en ese mismo instante sin salir del formulario.

---

### Paso 8 — Crear un usuario con acceso al POS

Si necesitas que un cajero o mesero entre a la app con su propio usuario, ve a la pestaña **Acceso al POS** y completa el formulario:

```
┌─ Nuevo Empleado (Acceso POS) ────────────────┐
│ Nombre Completo *                            │
│ ┌──────────────────────────────────────────┐ │
│ │ Juan Pérez                               │ │
│ └──────────────────────────────────────────┘ │
│ Teléfono *                                   │
│ ┌──────────────────────────────────────────┐ │
│ │ 📞 300 123 4567                          │ │
│ └──────────────────────────────────────────┘ │
│ ℹ️ PIN por defecto: 1234                     │
│ Rol *                                        │
│ ┌──────────────────────────────────────────┐ │
│ │ 🏷️ Cajero                             ▾  │ │
│ └──────────────────────────────────────────┘ │
│     ⚙️ [ Ajustar permisos de este empleado ]  │
│                                              │
│           [ Guardar Empleado ]               │
└──────────────────────────────────────────────┘
```

El teléfono es el usuario de ingreso. Al crearse, su contraseña provisional es el **PIN 1234** (el empleado puede cambiarlo luego en su perfil).

---

### Paso 9 — Ajustar permisos personalizados

Si quieres darle o quitarle permisos a un usuario sin alterar al resto de su rol, toca **Ajustar permisos**:

```
┌─ Permisos: Juan Pérez ───────────────────────┐
│ Rol base: Cajero                             │
├──────────────────────────────────────────────┤
│ PUNTO DE VENTA                               │
│  ☑ Acceso al POS                             │
│  ☑ Finalizar Ventas   [ Automático ]         │
│  ☑ Abrir Turno        [ Automático ]         │
│  ☑ Aplicar Descuentos                        │
│  ☐ Anular Facturas                           │
│  ☐ Cierre de Caja                            │
│ INVENTARIO                                   │
│  ☑ Ver Productos                             │
│  ☐ Registrar Gastos                          │
├──────────────────────────────────────────────┤
│ [ ↺ Restablecer a rol ]         [ Aplicar ]  │
└──────────────────────────────────────────────┘
```

> 💡 La insignia **[ Automático ]** indica permisos activos por herencia de su rol. Si tocas la casilla, el permiso queda fijado expresamente para esa persona.

---

### Paso 10 — Pausar, reactivar o eliminar usuarios del POS

En la lista de la pestaña **Acceso al POS**, cada usuario cuenta con opciones de seguridad:

```
┌──────────────────────────────────────────────┐
│ JP  Juan Pérez       [ Cajero ]              │
│     📞 +573001234567                         │
│     [ Editar ] [ Permisos ] [ Pausar ] [ 🗑️ ] │
└──────────────────────────────────────────────┘
```

- **Pausar**: retira el acceso de inmediato y cierra su sesión activa. Es reversible (luego tocas **Activar**).
- **Eliminar (🗑️)**: revoca el acceso de forma definitiva. Sus ventas pasadas quedan guardadas intactas.
- **Dueño del negocio**: está protegido y no se puede pausar ni borrar.

---

### Paso 11 — Configurar roles del sistema

En la pestaña **Roles y Permisos**, administra los perfiles de tu empresa (Administrador, Cajero, Mesero, etc.):

```
┌─ Roles del Sistema ───────────┐
│  Cajero           2 usuarios  │
│  Mesero           3 usuarios  │
│  Administrador    1 usuario   │
│                               │
│  [ + Nuevo Rol ]              │
└───────────────────────────────┘
```

Toca un rol para marcar o desmarcar sus 16 permisos. Los cambios aplican de inmediato para todos los usuarios con ese cargo.

---

## Errores comunes

Aquí tienes las dudas y mensajes más habituales al gestionar personal y registrar sus gastos.

| Situación | Qué hacer |
|-----------|-----------|
| "Efectivo insuficiente en caja" | El monto en efectivo supera lo disponible en el cajón físico. Reduce la cantidad en efectivo, paga con fondos externos (`No`) o usa otro método de pago. |
| No aparece la pregunta "¿El dinero sale de caja?" | No hay ningún turno de caja abierto. El pago se registrará en modo administrativo sin descontar dinero físico. |
| El botón "Guardar Colaborador" no se activa | Verifica que hayas escrito el **Nombre completo** y seleccionado o creado un **Cargo**. |
| "Alcanzaste el límite de usuarios" en Acceso POS | El Plan Estándar permite hasta 3 usuarios de acceso al POS. Pasa al Plan Pro para tener usuarios ilimitados. *(Nota: los colaboradores de nómina no consumen este cupo).* |
| El empleado no puede iniciar sesión en la app | Revisa que su número tenga 10 dígitos y recuérdale que su PIN inicial es **1234**. |
| "No se puede eliminar un rol con empleados asignados" | Reasigna a los empleados a otro rol antes de borrarlo. Los roles del sistema (con candado) nunca se pueden borrar. |
| Pantalla "Sin conexión" | El módulo de usuarios y roles necesita conexión activa a internet. Conéctate a Wi-Fi o datos móviles. |

---

## Preguntas frecuentes

Respuestas a las preguntas más frecuentes sobre colaboradores, nómina, gastos y permisos en Bistro.

---

### FAQ — ¿Cuál es la diferencia entre un Colaborador y un Usuario del POS?

Un **Colaborador** es una persona de tu equipo de trabajo (cocinero, lavaplatos, mesero) para controlar pagos, turnos y adelantos sin necesidad de que inicie sesión en una pantalla. Un **Usuario del POS** es una cuenta con teléfono y PIN que ingresa a la aplicación a operar ventas o inventario. Un mismo trabajador puede estar en ambos listados si entra al sistema y además recibe pagos de nómina.

---

### FAQ — ¿Qué ocurre contablemente cuando un pago sale de caja?

```
¿Marcaste "Sí" en salida de caja?
           │
           ├── SÍ ──► Crea un egreso en "Gastos"
           │          Y genera salida en arqueo de caja
           │          (solo si el método es Efectivo)
           │
           └── NO ──► Crea el egreso en "Gastos" como
                      fondos externos.
                      No descuenta dinero del turno.
```

---

### FAQ — ¿Puedo pagar un turno o vale por Nequi o transferencia bancaria?

Sí. Puedes elegir Nequi, Daviplata o Transferencia tanto si el dinero sale de fondos externos como si marcas salida de caja. Ten en cuenta que los métodos digitales **nunca descuentan dinero del cajón físico** ni descuadran el efectivo esperado en el arqueo del turno.

---

### FAQ — ¿Cómo reimprimo un vale o comprobante antiguo de un colaborador?

1. Ve a **Equipo** → **Empleados** → pestaña **Personal y Nómina**.
2. Busca al colaborador y pulsa **Historial de Pagos**.
3. En la lista de movimientos verás cada fecha, concepto y monto con botones para **Imprimir Tirilla (80mm)** o **Ver Comprobante**.

---

### FAQ — ¿Los colaboradores de nómina gastan cupo del Plan Estándar?

No. El límite de 3 usuarios activos del Plan Estándar aplica únicamente a las personas que tienen **Acceso al POS** (quienes inician sesión con teléfono y PIN). En **Personal y Nómina** puedes registrar todos los colaboradores que necesite tu negocio sin costo adicional.

---

### FAQ — ¿Qué significa la etiqueta "Automático" en los permisos de un empleado?

Significa que ese permiso está activo porque su rol base se lo concede de manera natural (por ejemplo, tener *Acceso al POS* activa automáticamente *Finalizar Ventas*). Si pulsas la casilla, el permiso queda fijado individualmente para esa persona, permitiéndote quitárselo o dejárselo sin importar lo que tenga el rol general.

---

### FAQ — ¿Cómo cambia su clave o PIN un empleado con acceso al POS?

Al ser creado, entra con su teléfono y el PIN por defecto **1234**. Una vez dentro de Bistro, debe ir a su **Perfil** (ícono de usuario) y tocar la opción **Cambiar PIN** para fijar una clave personal de 4 dígitos. Si lo olvida, puede solicitar un código de acceso por SMS.

---

## Recursos multimedia *(opcional)*

| Tipo | Nombre sugerido | Qué mostraría |
|------|----------------|---------------|
| GIF | "Bistro — Registrar pago de turno a colaborador" | Tarjeta del colaborador → Registrar Pago → Concepto → Salida de caja → Tirilla |
| GIF | "Bistro — Registrar pago a personal desde Gastos" | Egresos → Gastos → Pago a Personal → Buscar colaborador → Confirmar |
| Imagen | "Bistro — Pestañas Personal y Nómina vs Acceso al POS" | Vista del header con los 3 tabs y vista de tarjetas de colaboradores |
