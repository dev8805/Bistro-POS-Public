# Requirements Document

## Introduction

Esta funcionalidad, **Soporte para Trial Vencido**, muestra una pantalla de bloqueo cuando la suscripción de un negocio está en estado de trial vencido, diferenciando la experiencia según el rol de quien inicia sesión. El administrador ve un mensaje explicativo, un botón "Hablar con soporte" que abre un chat de soporte dedicado y bidireccional, y la opción de cerrar sesión. El chat NO reutiliza el widget completo `RagChatWidget` (que muestra las pestañas CHAT/SOPORTE/BASE del asistente IA y no luce profesional en este contexto), sino un componente nuevo, dedicado y reducido llamado `SupportChatWidget`, que es un duplicado simplificado del `RagChatWidget` y muestra ÚNICAMENTE la conversación de soporte con el desarrollador: sin pestañas, sin chat IA, sin base de conocimiento, sin feedback 👍/👎 y sin tutoriales. Como en la pantalla de trial vencido no existe una pregunta previa al bot, el `SupportChatWidget` auto-escala al abrirse, creando la sesión de soporte con una pregunta original predefinida y un contexto de pantalla "Trial vencido", de modo que el cliente entra directo a la conversación con el desarrollador. La comunicación es bidireccional a través del flujo de soporte humano existente (`useSupportSession` / `support-escalate` / Telegram) y Supabase Realtime. El empleado ve un mensaje que lo invita a pedirle al administrador que renueve y la opción de cerrar sesión, sin acceso al chat. El `RagChatWidget` original y el asistente IA no se modifican; el `SupportChatWidget` es independiente y reutiliza el hook `useSupportSession` sin cambios. Los planes públicos y personalizados vencidos no se modifican.

## Glossary

- **Sistema**: La aplicación Bistro POS que evalúa el estado de la suscripción y decide qué pantalla mostrar.
- **TrialExpiredScreen**: Componente nuevo y autocontenido que renderiza la pantalla de bloqueo por trial vencido, con las variantes de administrador y empleado, y que monta el SupportChatWidget en la variante de administrador.
- **Trial_Vencido**: Estado en el que la suscripción del negocio está en periodo de prueba (`trial`) y su vigencia ya expiró, lo que impide el uso normal de la aplicación.
- **Administrador**: Usuario con el permiso `admin_settings` (dueño o encargado con acceso a configuración y suscripción).
- **Empleado**: Usuario sin el permiso `admin_settings`.
- **RagChatWidget**: Widget de chat existente del asistente IA que incluye las pestañas CHAT, SOPORTE y BASE, el chat con IA y la base de conocimiento. Este widget no se modifica en esta funcionalidad.
- **SupportChatWidget**: Componente nuevo, dedicado y reducido, duplicado simplificado del RagChatWidget, que muestra únicamente la conversación de soporte con el desarrollador, sin pestañas, sin chat IA, sin base de conocimiento, sin feedback y sin tutoriales. Reutiliza el hook `useSupportSession` sin modificarlo.
- **Chat_Soporte**: Conversación de soporte humano gestionada por el SupportChatWidget, apoyada en el flujo existente `useSupportSession`, la edge function `support-escalate` y el canal de Telegram del desarrollador.
- **Auto_Escalado**: Acción por la cual el SupportChatWidget, al abrirse, crea la sesión de soporte llamando a `useSupportSession.escalate` con una pregunta original predefinida y el contexto de pantalla "Trial vencido", sin requerir una pregunta previa del cliente.
- **Comunicacion_Bidireccional**: Intercambio en ambos sentidos en el que el cliente envía mensajes y adjuntos que llegan al desarrollador en Telegram, y el desarrollador responde en Telegram y esas respuestas aparecen en el Chat_Soporte del cliente.
- **Supabase_Realtime**: Mecanismo de suscripción en tiempo real que entrega al SupportChatWidget las respuestas del desarrollador sin recargar la pantalla.
- **canSeeAiAssistant**: Bandera existente que habilita el acceso al chat de soporte y que retorna verdadero para todos los negocios.

## Requirements

### Requisito 1

**Historia de Usuario:** Como administrador de un negocio con trial vencido, quiero ver una pantalla clara que explique el estado de la suscripción, para entender por qué la aplicación está bloqueada y qué hacer.

#### Criterios de Aceptación

1.1. WHILE la suscripción del negocio está en estado Trial_Vencido AND el usuario autenticado es Administrador, THE Sistema SHALL mostrar la TrialExpiredScreen con la variante de administrador.
1.2. WHILE se muestra la variante de administrador, THE TrialExpiredScreen SHALL mostrar un mensaje que explique que el periodo de prueba terminó.
1.3. WHILE se muestra la variante de administrador, THE TrialExpiredScreen SHALL mostrar un botón con la etiqueta "Hablar con soporte".
1.4. WHILE se muestra la variante de administrador, THE TrialExpiredScreen SHALL mostrar una acción para cerrar sesión.

### Requisito 2

**Historia de Usuario:** Como administrador con trial vencido, quiero abrir un chat de soporte dedicado y reducido, para escribirle al desarrollador sin ver las pestañas ni el chat de la IA.

#### Criterios de Aceptación

2.1. WHEN el Administrador activa el botón "Hablar con soporte", THE TrialExpiredScreen SHALL abrir el SupportChatWidget.
2.2. THE SupportChatWidget SHALL mostrar únicamente la conversación de soporte con el desarrollador.
2.3. THE SupportChatWidget SHALL ocultar las pestañas CHAT, SOPORTE y BASE.
2.4. THE SupportChatWidget SHALL ocultar el chat con la IA y la base de conocimiento.
2.5. THE SupportChatWidget SHALL ocultar las acciones de feedback 👍/👎 y los tutoriales.
2.6. THE SupportChatWidget SHALL mostrar un encabezado con el título "Soporte Bistro" y un botón para cerrar el widget.
2.7. THE SupportChatWidget SHALL presentarse como un panel centrado o lateral con un diseño limpio y profesional.
2.8. WHEN el Administrador cierra el SupportChatWidget, THE TrialExpiredScreen SHALL volver a mostrar la variante de administrador con el botón "Hablar con soporte".

### Requisito 3

**Historia de Usuario:** Como administrador con trial vencido, quiero entrar directo a la conversación con el desarrollador al abrir el chat, para no tener que escribirle primero a un bot.

#### Criterios de Aceptación

3.1. WHEN el SupportChatWidget se abre, THE SupportChatWidget SHALL ejecutar el Auto_Escalado invocando `useSupportSession.escalate`.
3.2. WHEN el SupportChatWidget ejecuta el Auto_Escalado, THE SupportChatWidget SHALL enviar el campo `original_question` con el texto "Solicitud de soporte: mi prueba gratuita terminó".
3.3. WHEN el SupportChatWidget ejecuta el Auto_Escalado, THE SupportChatWidget SHALL enviar el campo `user_screen` con el valor "Trial vencido".
3.4. WHEN el Auto_Escalado se completa, THE SupportChatWidget SHALL mostrar la conversación de soporte lista para que el Administrador escriba al desarrollador.

### Requisito 4

**Historia de Usuario:** Como administrador con trial vencido, quiero comunicarme en ambos sentidos con el desarrollador desde el chat dedicado, para resolver la renovación en una conversación en vivo.

#### Criterios de Aceptación

4.1. WHEN el Administrador envía un mensaje con texto o adjuntos desde el SupportChatWidget, THE Chat_Soporte SHALL entregar ese mensaje al desarrollador en Telegram reutilizando el flujo `useSupportSession` y la edge function `support-escalate`.
4.2. WHEN el desarrollador responde desde Telegram, THE SupportChatWidget SHALL mostrar la respuesta en el Chat_Soporte del Administrador mediante Supabase_Realtime.
4.3. WHILE el chat está abierto, THE Sistema SHALL entregar las respuestas del desarrollador sin exigir que el Administrador recargue o abandone la TrialExpiredScreen.
4.4. THE SupportChatWidget SHALL mostrar un chip con el "ID de tu negocio" que permita copiarlo.
4.5. THE SupportChatWidget SHALL mostrar el estado de la conversación con las etiquetas "Consulta enviada" y "Conectado con soporte".
4.6. THE SupportChatWidget SHALL mostrar una acción para "Terminar conversación".

### Requisito 5

**Historia de Usuario:** Como empleado de un negocio con trial vencido, quiero ver un mensaje que me indique qué hacer, para saber que debo avisarle al administrador.

#### Criterios de Aceptación

5.1. WHILE la suscripción del negocio está en estado Trial_Vencido AND el usuario autenticado es Empleado, THE Sistema SHALL mostrar la TrialExpiredScreen con la variante de empleado.
5.2. WHILE se muestra la variante de empleado, THE TrialExpiredScreen SHALL mostrar un mensaje que solicite pedirle al administrador que renueve la suscripción.
5.3. WHILE se muestra la variante de empleado, THE TrialExpiredScreen SHALL mostrar una acción para cerrar sesión.
5.4. WHILE se muestra la variante de empleado, THE TrialExpiredScreen SHALL ocultar el botón "Hablar con soporte".
5.5. WHILE se muestra la variante de empleado, THE TrialExpiredScreen SHALL abstenerse de montar el SupportChatWidget.

### Requisito 6

**Historia de Usuario:** Como responsable del producto, quiero que el chat de soporte esté disponible para todos los negocios, para que ningún cliente con trial vencido quede sin canal de contacto.

#### Criterios de Aceptación

6.1. THE Sistema SHALL habilitar el Chat_Soporte para todos los negocios manteniendo `canSeeAiAssistant` con valor verdadero.

### Requisito 7

**Historia de Usuario:** Como responsable del producto, quiero que el chat dedicado no altere el asistente IA existente, para no introducir regresiones en el widget actual.

#### Criterios de Aceptación

7.1. THE Sistema SHALL preservar sin cambios el componente RagChatWidget.
7.2. THE Sistema SHALL preservar sin cambios el asistente IA, su chat con IA y su base de conocimiento.
7.3. THE SupportChatWidget SHALL reutilizar el hook `useSupportSession` sin modificarlo.
7.4. THE SupportChatWidget SHALL implementarse como un componente independiente del RagChatWidget.

### Requisito 8

**Historia de Usuario:** Como responsable del producto, quiero que esta pantalla no altere los planes existentes, para no introducir regresiones en la facturación.

#### Criterios de Aceptación

8.1. THE Sistema SHALL preservar sin cambios el comportamiento de los planes públicos vencidos.
8.2. THE Sistema SHALL preservar sin cambios el comportamiento de los planes personalizados vencidos.
8.3. THE TrialExpiredScreen SHALL contener toda su lógica de presentación y montaje del SupportChatWidget sin requerir modificaciones en componentes ajenos al flujo de trial vencido.
