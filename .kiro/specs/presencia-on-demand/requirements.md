# Requirements Document

## Introduction

Esta funcionalidad **optimiza el consumo de Supabase Realtime de la presencia de empleados** (canal `presence:business-X`). Supabase factura los mensajes de presencia (`track`/`join`/`leave`/`sync`) y su costo crece con el número de dispositivos conectados (fan-out tipo N²).

Hoy **cada usuario re-publica su presencia de forma continua** (un heartbeat periódico) solo por tener la app abierta, **aunque nadie esté mirando** la pantalla de Actividad. Pero la presencia solo la consume esa pantalla (`ActivityScreen`), que únicamente abren los administradores.

Se aplica el **modelo "on-demand"** que usan las grandes plataformas: el estado **online** (quién está conectado) se mantiene barato con el join del canal, mientras que el **refresco de actividad** (activo/inactivo) solo ocurre **mientras un observador tiene abierta la pantalla de Actividad**. Cuando nadie observa, no hay gasto recurrente de presencia.

El objetivo de negocio es **eliminar el gasto continuo de presencia cuando nadie la está viendo, sin perder la coordinación** (quién está conectado y quién está activo) cuando un administrador sí abre la pantalla de Actividad.

## Glossary

- **Canal_Presencia**: El canal singleton de Supabase Realtime `presence:business-X` gestionado por `lib/presenceManager.ts`, compartido por emisores y observadores del negocio.
- **Emisor**: Un dispositivo con sesión iniciada que anuncia su propia presencia (vía `hooks/usePresenceBroadcast.ts`).
- **Observador**: Un dispositivo con la pantalla de Actividad (`screens/ActivityScreen.tsx` → `hooks/useEmployeePresence.ts`) abierta, que consume la presencia de los demás.
- **Estado_Online**: La condición de "conectado" de un Emisor, derivada de su `join` al Canal_Presencia (presente mientras la app esté abierta).
- **Refresco_Actividad**: La re-publicación (`track`) del Emisor que actualiza su `last_activity_at` para distinguir activo/inactivo.
- **Senal_Observacion**: Un mensaje de broadcast que envía el Observador para indicar que está mirando la presencia, al cual responden los Emisores.
- **Ventana_Observacion**: El lapso durante el cual un Emisor considera que está siendo observado tras recibir una Senal_Observacion.
- **Actividad_Local**: La marca de tiempo `last_activity_at` que cada Emisor mantiene en memoria a partir de la interacción real del usuario, sin publicarla por sí sola.
- **Pantalla_Actividad**: La pantalla `ActivityScreen` donde el administrador ve los empleados conectados y su estado.

## Requirements

### Requisito 1: Estado online siempre disponible

**Historia de Usuario:** Como administrador, quiero seguir viendo qué empleados están conectados aunque no estén refrescando su actividad, para saber quién tiene la app abierta.

#### Criterios de Aceptación

1. WHEN un Emisor inicia sesión y abre la app, THE Canal_Presencia SHALL registrar su Estado_Online mediante un único `track` inicial (join).
2. WHILE un Emisor tiene la app abierta y con conexión, THE Canal_Presencia SHALL mantener su Estado_Online sin requerir Refresco_Actividad continuo.
3. WHEN un Emisor cierra la app o pierde la conexión, THE Canal_Presencia SHALL reflejar su salida (`leave`) para los Observadores.

### Requisito 2: Refresco de actividad solo bajo observación

**Historia de Usuario:** Como dueño del negocio, quiero que los dispositivos no re-publiquen su actividad cuando nadie está mirando la pantalla de Actividad, para no gastar mensajes de presencia innecesarios.

#### Criterios de Aceptación

1. WHILE ningún Observador está enviando Senal_Observacion, THE Emisor SHALL no ejecutar Refresco_Actividad periódico.
2. WHILE un Emisor está dentro de una Ventana_Observacion, THE Emisor SHALL ejecutar Refresco_Actividad publicando su Actividad_Local.
3. WHEN finaliza la Ventana_Observacion sin nuevas Senal_Observacion, THE Emisor SHALL dejar de ejecutar Refresco_Actividad y conservar su Estado_Online.

### Requisito 3: Señal de observación de la pantalla de Actividad

**Historia de Usuario:** Como administrador, quiero que al abrir la pantalla de Actividad los dispositivos empiecen a reportar su actividad, para ver el estado activo/inactivo en vivo.

#### Criterios de Aceptación

1. WHEN un Observador monta la Pantalla_Actividad, THE Observador SHALL emitir una Senal_Observacion de inmediato y luego de forma periódica mientras la pantalla siga abierta.
2. WHEN un Observador desmonta la Pantalla_Actividad, THE Observador SHALL dejar de emitir Senal_Observacion.
3. WHEN un Emisor recibe una Senal_Observacion, THE Emisor SHALL iniciar o renovar su Ventana_Observacion y ejecutar un Refresco_Actividad.

### Requisito 4: Precisión de activo/inactivo bajo observación

**Historia de Usuario:** Como administrador, quiero que el estado activo/inactivo refleje la actividad real del empleado mientras observo, para distinguir quién está trabajando.

#### Criterios de Aceptación

1. THE Emisor SHALL actualizar su Actividad_Local ante la interacción real del usuario (mouse, teclado, toque) sin publicarla por sí sola.
2. WHEN un Emisor ejecuta un Refresco_Actividad, THE Emisor SHALL publicar el valor actual de su Actividad_Local.
3. WHILE un Emisor está en una Ventana_Observacion y no ha tenido interacción reciente, THE Observador SHALL clasificarlo como inactivo según la ventana de 3 minutos existente.
4. WHILE la pestaña del Emisor está oculta, THE Emisor SHALL no ejecutar Refresco_Actividad.

### Requisito 5: Cero gasto recurrente sin observador

**Historia de Usuario:** Como dueño del negocio, quiero que cuando ningún administrador esté en la pantalla de Actividad, la presencia no genere mensajes recurrentes, para reducir el consumo de Realtime.

#### Criterios de Aceptación

1. WHILE ningún Observador tiene abierta la Pantalla_Actividad, THE Canal_Presencia SHALL no recibir Refresco_Actividad de ningún Emisor.
2. WHILE ningún Observador tiene abierta la Pantalla_Actividad, THE Canal_Presencia SHALL generar mensajes de presencia únicamente por eventos de Estado_Online (join/leave) y por transiciones significativas.

### Requisito 6: Transiciones significativas y reconexión

**Historia de Usuario:** Como administrador, quiero que cambios importantes (abrir/cerrar caja) y la recuperación de red sigan reflejándose, para que la información no quede obsoleta.

#### Criterios de Aceptación

1. WHEN un Emisor abre o cierra un turno de caja, THE Emisor SHALL publicar su presencia actualizada con el nuevo estado de caja.
2. WHEN un Emisor recupera la conexión a internet, THE Emisor SHALL re-publicar su presencia para restablecer su Estado_Online.

### Requisito 7: No-regresión de la pantalla de Actividad

**Historia de Usuario:** Como administrador, quiero que la pantalla de Actividad siga mostrando la misma información de empleados, para no perder funcionalidad por la optimización.

#### Criterios de Aceptación

1. THE Pantalla_Actividad SHALL seguir listando los empleados con sesión iniciada a partir de `profiles.is_signed_in`.
2. WHILE la Pantalla_Actividad está abierta, THE Pantalla_Actividad SHALL enriquecer cada empleado con su estado activo/inactivo y dispositivo a partir del Canal_Presencia.
3. THE optimización SHALL no requerir cambios de esquema ni migraciones de base de datos.
