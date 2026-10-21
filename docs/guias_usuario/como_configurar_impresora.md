# Cómo configurar la impresora y los datos del ticket en Bistro

> 👤 **Guía para:** Administradores (y cualquier usuario con permiso de Ajustes)
> 🧩 **Módulo:** **Ajustes de Facturación** (panel lateral) + **QZ Tray** (programa de impresión)
> ⏱️ **Tiempo estimado:** 5–10 minutos la primera vez en cada computador · 1 minuto en los siguientes arranques

---

## ¿Para qué sirve?

Desde **Ajustes de Facturación** configuras los datos que aparecen en los tickets de venta y facturas PDF: **Nombre en Facturas**, **NIT / Identificación**, **Teléfono de Contacto** y **Dirección Física**. Y con la ayuda del programa **QZ Tray** puedes imprimir tickets en tu impresora térmica **sin que aparezca ningún diálogo** en cada impresión.

Si quieres **cambiar el nombre en los tickets**, **actualizar el NIT del negocio**, **conectar la impresora térmica**, **configurar el ancho del rollo** (80mm o 58mm), **cambiar los datos del recibo** o **arreglar tickets que salen cortados o sin información del negocio**, aquí es donde se hace todo. Estos mismos datos también aparecen en los comprobantes de email que se envían a los clientes.

---

## ¿Qué es QZ Tray y por qué se necesita?

Los navegadores (Chrome, Edge, etc.) no pueden enviar tickets directamente a una impresora térmica por seguridad. **QZ Tray** es un programa gratuito que se instala en el computador y hace de puente: Bistro le envía el ticket y QZ Tray lo manda a la impresora.

> 💡 Se instala **una sola vez por computador**. Después funciona solo: cada vez que enciendes el PC, QZ Tray arranca automáticamente.

```
Bistro POS  ──►  QZ Tray  ──►  Impresora térmica
 (navegador)     (programa)      (papel)
```

---

## Antes de empezar

- Ten la impresora térmica **encendida y conectada** al computador (por USB o red) antes de empezar.
- La impresora debe estar **instalada en Windows** como cualquier impresora (que aparezca en "Dispositivos e impresoras"). Si Windows no la reconoce, instala primero el driver del fabricante.
- Conoce el ancho del rollo de papel: **80mm (Estándar)** o **58mm (Compacto)**.
- Necesitas permiso de **Ajustes** en tu usuario para abrir el panel. Si no ves el botón **Ajustes**, pide a un administrador que te lo habilite.

```
¿Qué necesitas para imprimir sin diálogos?
  │
  ├── 1. Impresora instalada en Windows
  │
  ├── 2. QZ Tray instalado
  │
  └── 3. Configurador de Bistro ejecutado (1 clic)
```

> 🎥 **Video 1 — Verificación de la impresora en el PC:** `https://res.cloudinary.com/milenadelpilar/video/upload/v1786317146/verificar_impresora_instalada_db0er2.mp4`
> _En este video se muestra cómo confirmar que la impresora térmica está encendida, conectada y reconocida por Windows. Abre **Configuración → Dispositivos e impresoras** (o busca "Impresoras" en el menú Inicio) y verifica que tu impresora aparezca en la lista. Si no aparece, primero instala el driver del fabricante antes de continuar con los siguientes pasos._

---

## Paso a paso

Para dejar la impresora lista hay que: instalar QZ Tray, ejecutar el configurador de Bistro (un clic) y conectar la impresora desde el panel de Ajustes.

Los dos primeros pasos (instalar QZ y el configurador) están disponibles como descargas en **Capacitación → "Conectar Impresora"** dentro de la app, o directamente desde estos enlaces:

- **Descargar QZ Tray (sitio oficial):** [qz.io/download](https://qz.io/download/)
- **Descargar Configurador de Bistro (.zip):** [Configurador-Impresora-Bistro.zip](https://hjjmwipqquynjopkswvu.supabase.co/storage/v1/object/public/Recursos/Configurador-Impresora-Bistro.zip)

---

### Paso 1 — Instalar QZ Tray (solo la primera vez)

1. En la app, ve a **Capacitación** y abre la tarjeta **"Conectar Impresora"**. Toca el botón **"1. Descargar QZ Tray"** o entra directo al sitio oficial: [qz.io/download](https://qz.io/download/).
2. Descarga el instalador para Windows e instálalo con **Siguiente** hasta el final. Es gratis.
3. Al terminar verás un **icono verde** junto al reloj de Windows (abajo a la derecha). Eso significa que QZ Tray está corriendo.

> ⚠️ Si no ves el icono, abre QZ Tray desde el menú Inicio de Windows.

> 🎥 **Video 2 — Instalación de QZ Tray:** `https://res.cloudinary.com/milenadelpilar/video/upload/v1786312548/DESCARGAR_E_INSTALA_QZ_puifhj.mp4`
> _En este video se muestra cómo descargar QZ Tray desde el sitio oficial, ejecutar el instalador para Windows y completar la instalación tocando **Siguiente** hasta el final. Al terminar, se confirma que el icono verde de QZ Tray aparece junto al reloj de Windows, señal de que el programa quedó corriendo correctamente._

---

### Paso 2 — Ejecutar el configurador de Bistro (un clic)

Este paso le dice a QZ Tray que confíe en Bistro, para que **no muestre el aviso "Untrusted website" en cada impresión**. Se hace una sola vez por computador.

> 🎥 **Video 3 — Instalación del configurador de Bistro:** `https://res.cloudinary.com/milenadelpilar/video/upload/v1786312548/configurador_BISTRO_iwkurm.mp4`
> _En este video se muestra cómo descomprimir el archivo `.zip` del configurador, hacer doble clic en **`Configurar-Impresora-Bistro.bat`**, aceptar el aviso de permisos de Windows con **Sí** y esperar el mensaje **"LISTO"**. Este paso hace que QZ Tray confíe en Bistro y deje de mostrar el aviso "Untrusted website" en cada impresión. Recuerda mantener `override.crt` en la misma carpeta que el `.bat`._

1. En la misma tarjeta **"Conectar Impresora"**, toca **"2. Configurador Bistro (.zip)"** para descargar el paquete, o usa este enlace directo: [Configurador-Impresora-Bistro.zip](https://hjjmwipqquynjopkswvu.supabase.co/storage/v1/object/public/Recursos/Configurador-Impresora-Bistro.zip).
2. **Descomprime** el archivo `.zip` (clic derecho → Extraer todo). Verás tres archivos: `Configurar-Impresora-Bistro.bat`, `override.crt` y `LEEME.txt`.
3. Haz **doble clic** en **`Configurar-Impresora-Bistro.bat`**.
4. Windows mostrará un aviso pidiendo permisos: toca **Sí**.
5. Espera el mensaje **"LISTO"** y cierra la ventana.

> ⚠️ **Importante:** mantén `override.crt` siempre en la **misma carpeta** que el `.bat`. No los separes ni muevas uno solo.

---

### Paso 3 — Registrar y elegir tus impresoras desde Bistro

Abre el panel de impresión: **en celular**, toca **Más** en la barra inferior y luego **Configuración → Facturación e Impresión**; **en computador**, clic en **Ajustes** al fondo del menú lateral izquierdo y luego en **Facturación e Impresión**.

En ese panel, en la sección **Impresoras Registradas**, toca **"+ Agregar impresora"**. Bistro pedirá a QZ Tray la lista de impresoras instaladas en el computador y eligirás la que quieras agregar. Puedes **agregar varias** (por ejemplo, una en el mostrador y otra en la cocina).

Cada impresora de la lista muestra su estado (punto **verde — "conectada"**) y dos botones para asignarla como **predeterminada por uso**:

- **Predet. Ticket** — la impresora donde saldrán los tickets de venta y el reporte de cierre.
- **Predet. Comanda** — la impresora donde saldrán las comandas de cocina.

Pueden ser **la misma** impresora o **dos distintas** (ej. ticket en el mostrador, comanda en la cocina). Para quitar una impresora de la lista, toca el ícono de **eliminar** (papelera) y confirma.

Elige también el **ancho del papel** (80mm o 58mm) según tu rollo.

> 💡 **Impresora de cocina por red (LAN):** instálala primero en Windows como impresora de **puerto TCP/IP** apuntando a su IP fija (puerto 9100). Una vez instalada en Windows, aparece en la lista de "Agregar impresora" igual que una USB, y puedes asignarla como **Predet. Comanda**.

> 💡 Al volver a abrir Bistro, las impresoras se reconectan automáticamente.

> ⚠️ Si al tocar **Agregar impresora** aparece "QZ Tray no disponible", revisa que QZ Tray esté corriendo (icono verde junto al reloj).

> 🎥 **Video 4 — Conectar la impresora en Bistro:** `https://res.cloudinary.com/milenadelpilar/video/upload/v1786551882/FACTURACION_E_IMPRESION_lycx0v.mp4`
> _En este video se muestra cómo, desde **Ajustes → Facturación e Impresión → Impresoras Registradas**, tocar **"+ Agregar impresora"** para que Bistro pida a QZ Tray la lista de impresoras del computador y seleccionar la deseada. Luego se asigna como **Predet. Ticket** o **Predet. Comanda**, se elige el ancho del papel (80mm o 58mm) y se confirma que la impresora quede con el punto verde de "conectada"._

---

## Errores comunes

| Situación | Qué hacer |
|-----------|-----------|
| Al tocar **Conectar** dice "No se pudo conectar a QZ Tray" | Verifica que QZ Tray esté instalado y corriendo (icono verde junto al reloj de Windows). Si no, ábrelo desde el menú Inicio. |
| Aparece el aviso "Untrusted website" o "Action Required" en cada impresión | No ejecutaste el configurador (Paso 2) o QZ no se reinició. Vuelve a ejecutar `Configurar-Impresora-Bistro.bat` y reinicia QZ Tray. |
| El diálogo dice "Bistro POS" pero no deja marcar **Allow** al marcar **Remember** | Falta confiar el certificado. Ejecuta el configurador (Paso 2) — es exactamente lo que resuelve esto. |
| La impresora no aparece en la lista al conectar | Revisa que esté encendida, conectada e instalada en Windows (que aparezca en "Dispositivos e impresoras"). |
| El ticket sale cortado o con texto ilegible | El ancho del papel no coincide. Cambia entre **80mm** y **58mm** y vuelve a imprimir. |
| El botón **Guardar** está gris | Si dice "Guardado", no hay cambios. Si dice "Guardar" y está gris, revisa que el NIT no tenga el aviso rojo de formato. |
| Los datos del ticket no cambiaron tras guardar | Verifica que tocaste **Guardar** y viste "Guardado correctamente" en verde. |

**Diagnóstico de impresión:**

```
¿Aparece un diálogo al imprimir?
  │
  ├── "Untrusted website" ──► Falta el configurador (Paso 2)
  │
  ├── Dice "Bistro POS" pero ──► Ejecuta el configurador
  │   no deja marcar Allow        y reinicia QZ Tray
  │
  └── No aparece nada ──► ✅ Todo correcto
```

---

## Preguntas frecuentes

### FAQ — ¿Tengo que instalar QZ Tray en cada computador?

Sí. QZ Tray y el configurador de Bistro se instalan **una vez por cada computador** donde quieras imprimir. Después de eso, todo es automático en ese equipo.

---

### FAQ — ¿Esto funciona para cualquier usuario que inicie sesión?

Sí. La configuración es del **computador**, no del usuario. Una vez que un PC tiene QZ Tray y el configurador ejecutado, cualquier empleado que inicie sesión en Bistro desde ese computador puede imprimir sin diálogos.

---

### FAQ — ¿Necesito internet para imprimir?

No. La impresión es entre Bistro, QZ Tray y la impresora, todo local. Funciona sin internet.

---

### FAQ — ¿Cómo cambio los datos que salen en el ticket (nombre, NIT, teléfono, dirección)?

En el panel **Ajustes → Facturación e Impresión**, la sección **Datos Comerciales** tiene cuatro campos que aparecen en el ticket:

- **Nombre en Facturas:** nombre comercial del encabezado (ej. *Minimercado La Esquina*). Si lo dejas vacío, usa el nombre del negocio del sistema.
- **NIT / Identificación:** escríbelo con el formato exacto (ej. `901.234.567-8`). Solo acepta dígitos, puntos, espacios y guiones; si pones letras, se bloquea el guardado con un aviso rojo.
- **Teléfono de Contacto:** el número al pie del ticket (ej. `+57 300 123 4567`).
- **Dirección Física:** la dirección del negocio (ej. `Calle 85 # 11-53, Local 1`).

Toca **Guardar** al pie del panel: verás "Guardado correctamente" en verde. Si el botón queda gris, revisa que el NIT no tenga el aviso rojo de formato.

---

### FAQ — ¿Puedo tener un nombre diferente en los tickets al de la app?

Sí. El campo **Nombre en facturas** es independiente del nombre del negocio en el sistema. Puedes tener el nombre interno "Mi Tienda SAS" y que los tickets digan "Minimercado La Esquina".

---

### FAQ — ¿Los tickets de ventas anteriores cambian si actualizo el nombre o el NIT?

Sí. Los datos del ticket se leen al momento de reimprimir, no al momento de la venta. Si cambias el nombre, todas las reimpresiones futuras mostrarán el nuevo nombre, incluso para ventas pasadas.

---

### FAQ — ¿Cómo imprimo el ticket al terminar una venta?

En la pantalla de venta exitosa, el botón **"Imprimir Ticket"** imprime directo en la impresora marcada como **Predet. Ticket**. La **flecha ▼** a la derecha del botón te deja elegir otra impresora para esa impresión, y la que elijas queda como la nueva predeterminada.

Si **no hay ninguna impresora registrada** o la predeterminada **se desconectó**, el botón mostrará **"Conectar impresora"**: al tocarlo se abre el panel lateral de Impresora (el mismo de Ajustes) para conectarla en el momento, y al cerrarlo regresas a la venta sin perder la información.

---

### FAQ — ¿Puedo conectar dos impresoras al mismo tiempo?

Sí. Bistro permite **registrar varias impresoras** y asignar cuál se usa para cada cosa: una como **Predet. Ticket** (mostrador) y otra como **Predet. Comanda** (cocina). Se configuran en **Ajustes → Impresoras Registradas**. Un caso típico es ticket por USB en el mostrador y comanda en una impresora de cocina conectada por red (LAN).

---

### FAQ — ¿Cómo conecto la impresora de la cocina por red (WiFi/LAN)?

La impresora de cocina debe tener puerto de red (Ethernet/RJ45 o WiFi). Conéctala al router y, en **Windows**, agrégala como impresora de **puerto TCP/IP estándar** con su IP fija (puerto 9100). Una vez instalada en Windows, aparece en la lista de **"Agregar impresora"** de Bistro como cualquier otra; agrégala y márcala como **Predet. Comanda**. Sigue necesitando QZ Tray corriendo en el computador (es el puente hacia la impresora).

---

### FAQ — ¿Qué pasa si cambio el ancho del papel a 58mm pero mi rollo es de 80mm?

El ticket se imprimirá con un layout más estrecho, dejando espacios en blanco a los lados. No daña la impresora, pero queda mal presentado. Cambia el ancho al valor correcto y vuelve a imprimir.
