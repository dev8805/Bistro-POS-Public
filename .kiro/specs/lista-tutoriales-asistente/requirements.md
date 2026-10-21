# Requirements Document

## Introduction

Esta funcionalidad, **Lista de Tutoriales del Asistente**, permite mostrar dentro del asistente IA (RAG chat) una lista curada de tutoriales que el usuario puede seleccionar para leer la guía completa y literal directamente en el chat, sin invocar a Gemini. El objetivo es entregar contenido instructivo de forma instantánea, determinista y sin consumo de tokens, conservando intacta la conversación libre con Gemini para preguntas abiertas.

La fuente del contenido son los archivos markdown existentes en `docs/guias_usuario/`, empaquetados en la aplicación mediante importación `?raw` de Vite. El desarrollador define y amplía la lista en un único archivo de configuración ubicado en `components/rag`. Esta funcionalidad NO modifica el backend: no toca Supabase, edge functions ni Pinecone.

Cuando hay un tutorial abierto, el encabezado del asistente ofrece un control desplegable con la etiqueta de texto "Tutoriales" acompañada de una flecha hacia abajo (chevron) que indica que despliega una lista, sin ícono. Al activarlo muestra los demás tutoriales disponibles, permitiendo cambiar de guía sin volver al estado inicial.

## Requirements

### Requisito 1

**Historia de Usuario:** Como usuario del negocio, quiero ver una lista curada de tutoriales en la pantalla inicial del asistente, para descubrir rápidamente las guías disponibles sin tener que escribir una pregunta.

#### Criterios de Aceptación

1.1. WHILE el asistente está en estado inicial sin mensajes en la conversación, THE Sistema SHALL mostrar la lista de tutoriales definida en la configuración.

1.2. WHEN el Sistema muestra la lista de tutoriales, THE Sistema SHALL renderizar cada tutorial con su título.

1.3. WHEN el Sistema muestra la lista de tutoriales, THE Sistema SHALL presentar los tutoriales en el mismo orden en que están declarados en la configuración.

1.4. IF la configuración de tutoriales está vacía, THEN THE Sistema SHALL mostrar el estado inicial del asistente sin la lista de tutoriales y sin producir errores.

### Requisito 2

**Historia de Usuario:** Como usuario del negocio, quiero que al seleccionar un tutorial se muestre la guía completa dentro del chat, para leer las instrucciones de forma inmediata sin esperar una respuesta generada.

#### Criterios de Aceptación

2.1. WHEN un usuario selecciona un tutorial de la lista, THE Sistema SHALL mostrar el contenido completo y literal de la guía markdown asociada dentro del chat.

2.2. WHEN un usuario selecciona un tutorial de la lista, THE Sistema SHALL mostrar el contenido de la guía sin invocar a Gemini ni a la edge function `rag-chat`.

2.3. WHEN un usuario selecciona un tutorial de la lista, THE Sistema SHALL insertar primero una burbuja de usuario con el título del tutorial elegido y luego el contenido de la guía como respuesta del asistente.

2.4. WHEN el Sistema muestra el contenido de una guía que incluye imágenes o videos embebidos y mockups ASCII, THE Sistema SHALL renderizar dichos elementos usando el mecanismo de renderizado multimedia actual.

2.5. IF el contenido de la guía seleccionada no se puede cargar, THEN THE Sistema SHALL mostrar un mensaje de error claro en español y SHALL mantener el asistente operativo.

### Requisito 3

**Historia de Usuario:** Como usuario del negocio, quiero seguir haciendo preguntas libres al asistente después de abrir un tutorial, para resolver dudas adicionales sin perder la conversación.

#### Criterios de Aceptación

3.1. WHILE un tutorial está abierto en el chat, THE Sistema SHALL mantener habilitado el campo de escritura de mensajes.

3.2. WHEN un usuario envía una pregunta libre después de abrir un tutorial, THE Sistema SHALL procesar la pregunta a través del flujo de Gemini mediante la función `sendMessage`.

3.3. WHEN un usuario envía una pregunta libre después de abrir un tutorial, THE Sistema SHALL excluir el contenido completo de la guía del historial enviado a Gemini.

### Requisito 4

**Historia de Usuario:** Como usuario del negocio, quiero un control de texto "Tutoriales" con una flecha desplegable en el encabezado cuando tengo un tutorial abierto, para cambiar de guía sin reiniciar la conversación.

#### Criterios de Aceptación

4.1. WHILE hay al menos un tutorial abierto en el chat, THE Sistema SHALL mostrar en el encabezado del asistente el control desplegable con la etiqueta de texto "Tutoriales" y una flecha hacia abajo (chevron), sin ícono.

4.2. WHILE el asistente está en estado inicial sin mensajes, THE Sistema SHALL ocultar el control "Tutoriales" del encabezado.

4.3. WHEN un usuario activa el control "Tutoriales", THE Sistema SHALL desplegar los tutoriales disponibles distintos del tutorial actualmente abierto.

4.4. WHEN un usuario selecciona un tutorial desde el control "Tutoriales", THE Sistema SHALL mostrar la guía correspondiente con el mismo comportamiento definido en el Requisito 2.

4.5. WHEN un usuario cierra el control "Tutoriales" sin seleccionar ningún tutorial, THE Sistema SHALL conservar el tutorial actualmente abierto sin cambios.

### Requisito 5

**Historia de Usuario:** Como desarrollador, quiero definir y ampliar la lista de tutoriales en un único archivo de configuración, para agregar nuevas guías sin modificar la interfaz.

#### Criterios de Aceptación

5.1. THE Sistema SHALL leer la lista de tutoriales desde un único archivo de configuración ubicado en `components/rag`.

5.2. WHEN el desarrollador agrega una entrada de tutorial en la configuración con identificador, título y referencia al archivo markdown, THE Sistema SHALL incorporar ese tutorial a la lista inicial y al control "Lista de tutoriales" sin cambios adicionales en la interfaz.

5.3. THE Sistema SHALL obtener el contenido de cada tutorial desde los archivos markdown ubicados en `docs/guias_usuario/`.

5.4. IF dos o más entradas de la configuración declaran el mismo identificador, THEN THE Sistema SHALL tratar los identificadores duplicados como un error de configuración.

### Requisito 6

**Historia de Usuario:** Como usuario del negocio, quiero que las funciones actuales del asistente sigan funcionando igual, para no perder capacidades existentes al usar los tutoriales.

#### Criterios de Aceptación

6.1. WHEN un usuario reinicia la conversación, THE Sistema SHALL volver a mostrar el estado inicial con la lista de tutoriales.

6.2. WHILE el dispositivo está sin conexión, THE Sistema SHALL conservar el comportamiento actual del modo sin conexión del asistente.

6.3. THE Sistema SHALL conservar la pestaña BASE y los demás controles existentes del encabezado del asistente.

6.4. WHEN Gemini genera una respuesta con sugerencias de texto al final, THE Sistema SHALL mantener esas sugerencias para las respuestas generadas por Gemini.

### Requisito 7

**Historia de Usuario:** Como desarrollador, quiero una herramienta en la interfaz visible solo en desarrollo para agregar y previsualizar tutoriales, para no editar la configuración a mano cada vez.

#### Criterios de Aceptación

7.1. WHERE la app se ejecuta en modo desarrollo, THE Sistema SHALL mostrar el control de gestión de tutoriales en el asistente.

7.2. WHERE la app se ejecuta en producción, THE Sistema SHALL excluir del build y de la interfaz tanto el control de gestión de tutoriales como su panel.

7.3. WHILE el panel de gestión está disponible en modo desarrollo, THE Sistema SHALL detectar automáticamente los archivos markdown de `docs/guias_usuario/` y listarlos en el panel.

7.4. WHEN el desarrollador previsualiza una guía desde el panel, THE Sistema SHALL mostrarla en el chat con el mismo comportamiento definido en el Requisito 2.

7.5. WHEN el desarrollador agrega una guía desde el panel, THE Sistema SHALL mostrarla en la lista de tutoriales de la sesión y SHALL persistirla únicamente en localStorage sin afectar la configuración de producción.

7.6. WHEN el desarrollador solicita copiar la configuración de una guía, THE Sistema SHALL copiar al portapapeles el snippet de configuración compuesto por la línea de importación y la entrada del tutorial sin campo de ícono, listo para pegar en el archivo de configuración.

7.7. WHERE la app se ejecuta en producción, THE Sistema SHALL leer los tutoriales únicamente desde el archivo de configuración y SHALL ignorar cualquier dato almacenado en localStorage.

## Glossary

- **Asistente IA / RAG chat**: Componente de chat del sistema (`components/rag`) que responde preguntas del usuario combinando recuperación de contexto (Pinecone) y generación de lenguaje (Gemini).
- **Tutorial**: Entrada curada de la configuración que asocia un identificador, un título y una referencia a un archivo markdown de guía.
- **Guía completa**: Contenido literal e íntegro de un archivo markdown de `docs/guias_usuario/` que se muestra en el chat al seleccionar un tutorial.
- **Lista curada**: Conjunto ordenado de tutoriales definido por el desarrollador en el archivo de configuración.
- **Gemini**: Modelo de lenguaje usado para generar respuestas a preguntas libres del usuario.
- **Edge function `rag-chat`**: Función de backend que orquesta el flujo de recuperación y generación (HyDE → embedding → Pinecone → generación con Gemini). No se invoca al mostrar un tutorial.
- **Multimedia embebido**: Imágenes (`> 📸 Imagen:`), videos (`> 🎬 Video:`) y mockups ASCII que el renderizador de mensajes del asistente ya interpreta y muestra.
- **Estado inicial**: Situación del asistente sin mensajes en la conversación, en la que se muestra la lista de tutoriales.
- **Panel de gestión (dev)**: Herramienta de interfaz visible únicamente en modo desarrollo que permite descubrir, previsualizar y agregar tutoriales, y copiar su configuración para producción. No se incluye en el build de producción.
- **Overlay localStorage**: Conjunto de tutoriales agregados desde el panel de gestión durante una sesión de desarrollo, persistidos solo en localStorage. Se fusiona con la configuración únicamente en modo desarrollo y nunca se lee en producción.
- **Snippet de configuración**: Fragmento de código generado por el panel (línea de importación `?raw` más la entrada `{ id, title, content }`) listo para pegar en el archivo de configuración de producción.
