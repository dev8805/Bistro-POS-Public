# Plantilla del plan del video

Usar esta plantilla para redactar `docs/videos_tutoriales/[modulo]/01-plan.md`.

**Regla:** este documento es el contrato antes de escribir el guion. Se aprueba
literalmente por el usuario. Si cambia después, se ajusta también el guion.

---

## Plantilla (copiar tal cual y completar)

```markdown
# Plan del video — [Título propuesto]

## 📌 Ficha rápida

| Campo | Valor |
|-------|-------|
| Título | Cómo [acción principal] en Bistro |
| Módulo | [nombre del módulo] |
| Doc técnica | `docs/caracteristicas/[archivo].md` |
| Público | Dueño / Cajero / Mesero / Administrador / Todos |
| Duración objetivo | X min Y s |
| Categoría en TrainingScreen | inicio / ventas / inventario / personal / reportes |
| Icono sugerido (Material Symbols) | `nombre_icono` |

## 🎯 Objetivo

Una sola frase que describe qué va a saber hacer el espectador después de ver
el video. Ejemplo:
> Al terminar este video, el usuario podrá crear una mesa, abrir una cuenta,
> agregar productos y cobrarla usando cualquier método de pago.

## ✅ Muestra

Lista de 4-8 acciones que el video SÍ va a mostrar:

- Cómo [acción concreta 1]
- Cómo [acción concreta 2]
- Cómo [acción concreta 3]
- ...

## ❌ NO muestra

Explícito para evitar scope creep:

- Configuración inicial de [X] (queda para otro video)
- Casos avanzados de [Y]
- Errores raros o edge cases
- ...

## 🎬 Escenas

Escenas en orden con duración estimada. La suma debe cuadrar con la duración
objetivo.

| # | Escena | Duración | Tipo de material |
|---|--------|----------|------------------|
| 1 | Hook inicial (frase que atrapa) | 0:10 | Screenshot con texto |
| 2 | Cómo llegar a [pantalla] | 0:20 | Grabación pantalla |
| 3 | Crear el primer registro | 0:45 | Grabación con narración |
| 4 | Editar o modificar | 0:30 | Grabación pantalla |
| 5 | Consultar el resultado | 0:25 | Screenshots + zoom |
| 6 | Cierre y llamada a la acción | 0:15 | Screenshot final |
|   | **Total** | **X:XX** | |

## 🛠️ Requisitos de grabación

**Datos de prueba a preparar en la app** (nombres específicos):
- Producto: `Café americano - $5.000`
- Cliente: `Juan Pérez - 3001234567`
- Mesa: `Mesa 5`
- Otros: [...]

**Dispositivos a preparar:**
- [ ] PC/laptop con Chrome en `posbistro.online`
- [ ] Celular Android con scrcpy (para vista mesero)
- [ ] Impresora térmica encendida y con papel
- [ ] Cámara del celular para foto del ticket físico

**Estado inicial de la app antes de grabar:**
- [ ] Sesión iniciada como [rol]
- [ ] Caja abierta con $50.000 base
- [ ] Categorías creadas: [X, Y, Z]
- [ ] [Otros pre-requisitos]

## ⚠️ Riesgos y notas

- Riesgo: si la impresora no imprime, tener screenshot de respaldo del ticket
- Nota: el escaneo de EAN puede fallar con luz mala, grabar en zona iluminada
- Nota: [otras cosas que pueden salir mal]

## 🔗 Pantallas y hooks involucrados

Referencia rápida al código fuente para saber qué pantallas se van a grabar:

- `screens/[Pantalla].tsx` — pantalla principal
- `hooks/use[X].ts` — lógica de negocio
- `components/[Componente].tsx` — componente clave
- ...
```

---

## Reglas al llenar la plantilla

1. **Título en imperativo o "Cómo + verbo":** "Cómo cobrar en Bistro", "Cómo
   crear productos". No usar títulos genéricos tipo "Ventas 101".
2. **Duración honesta:** si son 4 escenas de 45s c/u, el video dura ~3 min +
   intro/outro. No prometer 3 min y grabar 8.
3. **La sección NO muestra es obligatoria.** Fuerza a definir el scope.
4. **Datos de prueba con nombres específicos**, no "un producto genérico". El
   video se ve más profesional con datos coherentes ("Café americano", "Mesa 5").
5. **Marcar riesgos por adelantado** — es más barato preverlos que regrabar.
