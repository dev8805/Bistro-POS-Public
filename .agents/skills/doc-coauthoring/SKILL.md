---
name: doc-coauthoring
description: Crea guías de usuario profesionales para Bistro POS en español, optimizadas para indexación RAG. Úsese cuando el usuario quiera crear una guía de cómo usar un módulo de Bistro, documentar un flujo para operadores de negocio, o generar contenido para el asistente IA. Disparadores: "crear guía", "guía de usuario", "documentar para el RAG", "cómo hacer una venta", "guía para operadores".
---

# Crear Guía de Usuario Bistro (RAG-ready)

## Cuándo usar esta skill

- Usuario quiere crear una guía de cómo usar un módulo de Bistro
- Usuario quiere documentar un flujo para operadores de negocio (cajeros, administradores)
- Usuario quiere generar archivos para indexar en `RagChatScreen`
- Usuario menciona: "guía", "manual", "como_hacer", "para el RAG"

---

## Flujo de trabajo

### Etapa 0 — Precarga de contexto (automática, sin preguntar)

Antes de hacer cualquier pregunta, ejecutar estos pasos:

1. Preguntar al usuario qué módulo o flujo quiere documentar (ej. "hacer una venta", "registrar un gasto")
2. Identificar el archivo técnico correspondiente en `docs/caracteristicas/` usando esta tabla:

| Módulo | Archivo técnico |
|--------|----------------|
| Ventas (desktop) | `flujo_ventas_desktop.md` |
| Ventas (móvil) | `flujo_ventas_movil_tablet.md` |
| Venta por peso | `venta_por_peso_medida.md` |
| Compra de inventario | `flujo_compra_inventario.md` |
| Conteo de inventario | `conteo_inventario.md` |
| Mermas | `flujo_registro_mermas.md` |
| Gastos | `flujo_registro_gasto.md` |
| Catálogo / Productos | `catalogo_productos.md` |
| Crear productos | `flujo_creacion_productos.md` |
| Promociones | `flujo_creacion_promociones.md` |
| Clientes / Cuentas por cobrar | `clientes_cuentas_cobrar.md` |
| Deudas del negocio | `deudas_negocio.md` |
| Historial de ventas | `historial_ventas.md` |
| Dashboard | `dashboard.md` |
| Personal / Empleados | `gestion_personal.md` |
| Asistente IA | `asistente_ia_rag.md` |
| Modo offline | `modo_offline.md` |

3. Leer ese archivo técnico completo con la herramienta `Read`
4. Identificar en el doc técnico: las acciones principales, los pasos clave, los errores conocidos y las limitaciones documentadas
5. Determinar el nombre del archivo de salida: `docs/guias_usuario/como_[accion].md`

No preguntar al usuario por contexto que ya está en el doc técnico. Solo preguntar si hay información que el doc técnico no cubre.

---

### Etapa 1 — Confirmar alcance (1 sola ronda de preguntas)

Hacer como máximo 3 preguntas al usuario:

1. **¿Qué rol usa este flujo?** (cajero, administrador, todos)
2. **¿Hay algún caso especial importante que el doc técnico no mencione?** (ej. "cuando no hay internet", "cuando el cliente paga en partes")
3. **¿Qué errores reportan más los operadores con este flujo?**

Si el usuario no sabe alguna respuesta, continuar con lo que hay en el doc técnico.

---

### Etapa 2 — Construir sección por sección

Usar el **template fijo de 5 secciones** (ver abajo). Construir una sección a la vez:

1. Anunciar qué sección se va a redactar
2. Mostrar un borrador de esa sección
3. Pedir al usuario que indique qué cambiar (no editar el doc directamente — decirle qué cambiar en chat)
4. Aplicar cambios con edición quirúrgica (`str_replace`, nunca reimprimir todo)
5. Confirmar que la sección quedó lista y pasar a la siguiente

**Orden recomendado:** ¿Para qué sirve? → Antes de empezar → Paso a paso → Errores comunes → Preguntas frecuentes

Al finalizar todas las secciones, releer el documento completo y verificar:
- Consistencia de nombres (mismos nombres de botones en todo el doc)
- Que ninguna sección asuma que el lector leyó otra sección
- Que no haya jerga técnica

---

### Etapa 3 — Prueba de lector (sub-agente)

Lanzar un sub-agente con solo el contenido de la guía (sin contexto de esta conversación) y pedirle que responda estas preguntas como si fuera un operador de tienda que nunca usó Bistro:

- "¿Cómo hago [acción principal del módulo]?"
- "¿Qué pasa si [error común del módulo]?"
- "¿Necesito [prerequisito] para poder hacer esto?"

Reportar qué respondió bien y qué no encontró en el documento. Corregir los puntos ciegos identificados.

---

## Template fijo: 5 secciones de cada guía Bistro

```markdown
# Cómo [acción principal] en Bistro

> Guía para: [Cajeros / Administradores / Todos]  
> Módulo: [nombre del módulo en la app]  
> Tiempo estimado: [X minutos]

---

## ¿Para qué sirve?

[2-3 líneas máximo. Explicar QUÉ problema resuelve este flujo para el negocio.
Sin mencionar tablas de base de datos, hooks ni componentes técnicos.
Ejemplo: "Esta función te permite registrar cuando un cliente te paga parte de lo que te debe,
y el dinero entra automáticamente a la caja si tienes un turno abierto."]

---

## Antes de empezar

- [Requisito 1 — ej: "Debes tener un turno de caja abierto"]
- [Requisito 2 — ej: "El cliente debe estar registrado en Clientes"]
- [Si no hay requisitos especiales, escribir: "No necesitas ninguna configuración previa."]

---

## Paso a paso

1. **[Nombre exacto del paso]**  
   [Una o dos líneas explicando la acción. Usar el nombre exacto del botón o pantalla como aparece en la app.]

2. **[Nombre exacto del paso]**  
   [Descripción]

3. **[Continuar hasta completar el flujo]**

> **Consejo:** [Tip práctico opcional — ej: "Si el monto es en efectivo, selecciona 'Efectivo' para que entre a la caja del turno."]

---

## Errores comunes

| Situación | Qué hacer |
|-----------|-----------|
| [Descripción del error o situación inesperada] | [Solución concreta en 1 línea] |
| [Ejemplo: "El botón 'Guardar' no aparece"] | [Ejemplo: "Verifica que ingresaste un monto mayor a $0"] |

---

## Preguntas frecuentes

**¿[Pregunta realista que haría un operador]?**  
[Respuesta directa y completa. La respuesta debe tener todo el contexto necesario — no decir "como se mencionó antes".]

**¿[Otra pregunta]?**  
[Respuesta]

**¿[Otra pregunta]?**  
[Respuesta]
```

---

## Reglas de escritura para RAG (obligatorias)

Estas reglas garantizan que el asistente IA pueda citar correctamente las guías:

### Lenguaje
- Español colombiano informal — usar **"tú"**, nunca "usted"
- Sin jerga técnica: no escribir "query", "RPC", "foreign key", "hook", "componente", "tabla de Supabase"
- Sustituir términos técnicos: "base de datos" → "el sistema", "registro" → "guarda", "null" → "vacío"

### Estructura RAG-friendly
- **Cada sección debe ser autocontenida**: alguien que lea solo esa sección debe poder entenderla sin haber leído las otras
- **Sin referencias cruzadas vagas**: no escribir "como se explicó antes" ni "ver sección anterior"
- **Usar los nombres exactos** de botones y pantallas tal como aparecen en la app (con mayúscula inicial si así aparecen)
- **Preguntas frecuentes en formato Q&A**: la pregunta debe ser una pregunta real que haría el operador; la respuesta debe ser completa por sí sola

### Longitud y formato
- Pasos numerados: máximo 2 líneas por paso
- Sección "¿Para qué sirve?": máximo 3 líneas
- Tabla de errores: máximo 6 filas (los más comunes, no todos los posibles)
- Preguntas frecuentes: mínimo 3, máximo 6

### Lo que NO debe aparecer en las guías
- Nombres de archivos `.tsx`, `.ts`, `.md`
- Nombres de funciones o hooks (`useProducts`, `addCashIn`, etc.)
- Referencias a tablas de base de datos (`client_transactions`, `inventory_lots`, etc.)
- Menciones de "código", "programación" o detalles de implementación
- El texto "[!WARNING]", "[!NOTE]" u otras marcas de docs técnicos

---

## Output

- **Carpeta**: `docs/guias_usuario/`
- **Nombre de archivo**: `como_[accion_en_infinitivo].md`  
  Ejemplos: `como_hacer_una_venta.md`, `como_registrar_un_gasto.md`, `como_gestionar_inventario.md`
- **Formato**: Markdown estándar (compatible con conversión a PDF)
- Crear la carpeta `docs/guias_usuario/` si no existe

---

## Checklist de calidad antes de terminar

```
- [ ] El archivo está en docs/guias_usuario/como_[accion].md
- [ ] Las 5 secciones del template están completas
- [ ] No hay jerga técnica ni nombres de código
- [ ] Cada sección es autocontenida (se puede leer sola)
- [ ] Los nombres de botones y pantallas coinciden exactamente con la app
- [ ] Las preguntas frecuentes tienen respuestas completas
- [ ] El sub-agente de prueba respondió correctamente las preguntas clave
- [ ] El usuario hizo una revisión final y aprobó
```
