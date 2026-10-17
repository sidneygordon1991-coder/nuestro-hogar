# Nuestro Hogar v30 — Rediseño "Tu dinero, en perspectiva"

Esta versión cambia el acabado visual completo (barra lateral, cabecera, Inicio y navegación móvil) para que coincida con el concepto visual aprobado, deja cuatro colores seleccionables y corrige errores encontrados en una revisión completa del código.

## 1. Colores de la app

Se eligen en **Configuración** (barra lateral) o en **Personalizar mi espacio** (menú en móvil):

| Color | Identificador guardado | Uso |
| --- | --- | --- |
| Verde (predeterminado) | `forest` | Barra lateral verde bosque, como el concepto visual |
| Azul | `ocean` | Azul marino |
| Negro | `graphite` | Grafito casi negro |
| Morado | `iris` | Morado profundo |

- Las preferencias anteriores se respetan. El acabado retirado "Tornasol" (`aurora`) se abre automáticamente como **Morado**.
- El panel también permite elegir el tema **Automático / Día / Noche**. El interruptor de la cabecera muestra sol y luna en una sola píldora.
- Todos los colores salen de `src/theme-light.css` (variables `--nh-*`). El script de contraste verifica que cada color cumpla WCAG AA en día y en noche (textos 4.5:1, iconos y gráficas 3:1).

## 2. Inicio

| Bloque | Qué muestra | Cómo se calcula |
| --- | --- | --- |
| Dinero registrado | Saldo de efectivo, cuentas bancarias y de ahorro registradas | Saldo inicial + movimientos + transferencias hasta hoy. Si no hay cuentas registradas se muestra **Balance del mes** (ingresos − gastos − ahorro) |
| Pagos pendientes | Recurrentes pendientes y presupuesto fijo sin cubrir del mes | Igual que antes (`fixedCommitments`), sin duplicar presupuesto y recurrente |
| Ahorro reservado | Ahorro del plan del mes que aún falta apartar | Presupuesto de ahorro − aportes del mes |
| **Margen disponible** | Lo que queda libre hoy | Dinero registrado − pagos pendientes − ahorro reservado. "Ver cálculo" muestra cada término. No descuenta presupuesto variable ni suma ingresos esperados |
| Tu próxima quincena | Línea sólida: saldo registrado (con la semana anterior como contexto). Línea punteada: proyección | La proyección descuenta los pagos recurrentes pendientes en su fecha (los vencidos se aplican hoy) y suma el ingreso esperado del período el último día, porque ese ingreso no tiene fecha registrada |
| Aviso de la quincena | Cubierto / Revisa tus pagos / Saldo negativo | "Revisa" cuando el punto más bajo antes del ingreso queda por debajo del 20 % del saldo de hoy; "negativo" cuando baja de cero. "Explorar escenario" abre el simulador de Finanzas |
| Así va tu presupuesto | Rubros del mes con disponible y porcentaje | Ordenados por riesgo (excedidos y cerca del límite primero). Menú ⋮ para ver movimientos o ajustar |
| Lo importante hoy | Avisos urgentes y acciones concretas | Conciliar cuentas sin conciliación en 30 días, movimientos sin categoría y el siguiente pago. Si ya hay un aviso de pago, no se repite |
| Nuestra próxima meta | Meta de ahorro más próxima sin completar | Aportes hasta hoy / objetivo |

### Compartido / Personal
Aparece cuando el hogar tiene más de una persona y se recuerda por cuenta y hogar.

- **Compartido**: todo lo registrado en el hogar (comportamiento anterior).
- **Personal**: tus ingresos, los movimientos y recurrentes que registraste como *Personal*, tus aportes de ahorro y las cuentas que son tuyas y no compartidas. Los presupuestos son del hogar, por eso en Personal se muestran tus gastos por rubro sin presupuesto.

### Móvil
Saludo, selector Compartido/Personal, tarjeta de margen con "Registrado" y "Pendiente", gráfica, primer rubro del presupuesto, acción para hoy y botón **Registrar** fijo sobre la barra inferior. En otras secciones el botón queda como un botón flotante redondo.

## 3. Correcciones principales

**Dinero y cálculos**
- El margen ya no sale negativo por ignorar el dinero que hay en las cuentas.
- Los montos con centavos siempre muestran dos decimales (`Q 6,539.50`), con un solo formato en toda la app.
- Los saldos, el patrimonio, la comparación de 12 meses y los aportes ya no se cortan en 1,000 registros (`src/lib/paging.ts`).
- Sumas en centavos para evitar resultados como `-Q 0`.
- "Presupuesto utilizado" ya no incluye el ahorro en el denominador.
- Los movimientos con fecha futura no se cuentan en la dona ni en la comparación mensual.
- El plan de quincena ya no queda "parcial" por rubros o ingresos en cero.

**Datos**
- Borrar un movimiento pagado de un recurrente ya no puede duplicar el pago.
- Errores al reescribir repartos y recetas ahora se informan y no dejan datos duplicados o vacíos.
- Editar una cuenta o activo del hogar ya no lo asigna a quien edita.
- Reintentar un mantenimiento tras un error de sincronización ya no crea un duplicado.
- Compras rápidas y comidas usan siempre la misma lista de supermercado.

**Agenda, fechas y avisos**
- El calendario muestra los eventos del último día del mes y la primera ocurrencia de los eventos mensuales y anuales (`src/lib/calendarOccurrences.ts`). También muestra los eventos recurrentes creados hace más de dos años.
- Las fechas locales ya no saltan al día siguiente después de las 18:00 en Guatemala (`src/lib/localDate.ts`).
- El contador de la campana se actualiza cuando un aviso se lee desde Inicio o desde otro dispositivo.
- Los cambios rápidos de mes o semana ya no muestran datos de otro período.

**Experiencia**
- Los mensajes de "Guardado" ahora sí se ven, y las secciones ya no parpadean a pantalla de carga después de guardar.
- La sugerencia de instalación solo aparece si el navegador puede instalar la app (o en Safari de iPhone/iPad). Al cerrarla se oculta por 30 días.
- Los diálogos de Finanzas tienen nombre accesible, cierre con Escape y foco inicial.
- Los usuarios con permiso de solo lectura ya no ven botones de edición que no funcionan.
- Abrir un documento funciona en iPhone y en la app instalada.

**Seguridad y PWA**
- La recuperación de contraseña exige la misma contraseña fuerte que el registro.
- El service worker solo guarda páginas válidas, abre la ventana correcta al tocar una notificación y usa la caché `v30`.
- Si una pestaña antigua pide un módulo que ya no existe tras una actualización, se recarga una vez en lugar de mostrar el error.

**Limpieza de código**
- Se eliminaron componentes que no se usaban en `App.tsx` y cerca de 34 KB de reglas CSS de diseños anteriores sin uso. Las capturas de los 14 módulos, antes y después, son idénticas.
- `premium-home.css` y `neutral-finish.css` se reemplazaron por `shell.css` (barra lateral, cabecera, navegación) y `home.css` (Inicio).

## 4. Archivos nuevos

| Archivo | Para qué |
| --- | --- |
| `src/shell.css`, `src/home.css` | Estilos del nuevo diseño |
| `src/HomeToday.tsx` | Tarjeta "Lo importante hoy" |
| `src/BrandMark.tsx` | Logotipo casa con corazón |
| `src/lib/paging.ts` | Lectura completa de consultas paginadas |
| `src/lib/lazyRetry.ts` | Recuperación de módulos tras una actualización |
| `src/lib/calendarOccurrences.ts`, `src/lib/localDate.ts`, `src/lib/shoppingList.ts` | Fechas, repeticiones y lista de compras |
| `tests/e2e/home-design.e2e.mjs` | Pruebas del nuevo Inicio, colores, Compartido/Personal e instalación |

## 5. Verificación

```bash
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

No se agregaron migraciones SQL. El backend actual funciona sin cambios.
