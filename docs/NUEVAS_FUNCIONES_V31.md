# Nuestro Hogar v31: nuevas funciones

v31 se construye sobre el rediseño v30. Agrega herramientas para el día a día del dinero: los días de pago reales, cuánto se puede gastar por día, el registro en tres toques, tarjetas de crédito, lo privado de cada persona, las cuentas entre la pareja, metas con ritmo, el plan para pagar deudas, la importación de estados de cuenta, los dólares, alertas útiles, ocultar montos, un ejemplo para empezar y el resumen de quincena para compartir.

## 1. Lo que ve el usuario

### Inicio
- **Días de pago reales.** Cada persona indica qué día cobra en cada quincena (por defecto el 15 y el último día del mes). La proyección de la quincena coloca los ingresos esperados en esos días, en lugar de asumirlos al final del período. Un ingreso atrasado aparece hoy.
- **"Puedes gastar Q X por día hasta el …".** Debajo del margen disponible: el margen dividido entre los días que faltan hasta el siguiente ingreso. Si no hay margen, lo dice claramente.
- **Tus tarjetas.** Por tarjeta: cuánto pagar para no generar intereses, fecha límite, uso del límite y pago mínimo. Las tarjetas por vencer o vencidas suben a "Lo importante hoy".
- **Entre ustedes este mes** (vista Compartido). A partir de los gastos compartidos con reparto calcula quién le debe a quién con el mínimo de transferencias ("Le pagas Q 450 a Andrea"). "Marcar como pagado" guarda la liquidación y queda en el historial.
- **Solo para ti** (vista Personal). Los movimientos privados de la persona, que nadie más ve.
- **Meta con ritmo.** "Aparta Q 350 por quincena para llegar a tiempo", o un aviso si la meta va atrasada.
- **Resumen de la quincena.** Ingresos, gastos, ahorro y logros comparados con la quincena anterior. Se comparte por el menú del teléfono (o se copia) y se guarda como imagen. Aparece en "Lo importante hoy" al cierre de cada quincena y en el menú de la gráfica.
- **Empieza en 3 minutos.** Si el hogar todavía no tiene movimientos ni presupuesto, una tarjeta guía a agregar cuentas y ofrece **Ver un ejemplo**: el Inicio completo con un hogar ficticio, sin guardar nada. También está en el aviso de bienvenida.

### En toda la app
- **Ocultar montos** (ícono de ojo junto al tema de día/noche). Cambia todos los montos por "Q •••••", también en avisos y notificaciones. Se recuerda en el dispositivo.
- **Registro en 3 toques.** Registrar → un movimiento reciente (chip) → Guardar. El monto va primero, con teclado numérico; la categoría se sugiere por la descripción; se elige Q o US$; y quién lo ve: Compartido, Personal o **Solo yo**. Al guardar hay una confirmación con vibración corta y "Registrar otro". El acceso directo "Registrar gasto" del ícono de la app abre este formulario.
- **Dólares.** Un movimiento en US$ se guarda en quetzales con el monto original y el tipo de cambio ("US$ 50 · Q 387.50"). El tipo de cambio de referencia del hogar se configura en Finanzas (7.75 por defecto).
- **Microinteracciones.** Las barras crecen al aparecer y los botones responden al toque. Todo se desactiva si el sistema pide reducir el movimiento.

### Finanzas
- Días de pago por persona y tipo de cambio del hogar en la configuración de ingresos.
- Panel de liquidaciones entre la pareja (en Aportes). El "Balance entre nosotros" del Resumen ya descuenta los pagos registrados.
- **Plan de deudas:** compara avalancha (primero la tasa más alta) y bola de nieve (primero el saldo más pequeño), con meses e intereses totales de cada estrategia.
- **Importar estado de cuenta (CSV):** detecta columnas de fecha, descripción y monto (o débito/crédito), sugiere categorías, marca posibles duplicados y deja revisar antes de guardar.
- Datos de tarjeta en las cuentas: día de corte, día de pago, pago mínimo, límite y tasa.

### Alertas (servidor)
- Rubro al 80% o más antes del día 20.
- Gasto inusual: al menos el doble del promedio del rubro y Q 300 más.
- Tarjeta con pago en los próximos 3 días (solo a su dueño si la tarjeta es personal).
- Los pagos recurrentes de mañana ya los cubría el aviso de "Pago próximo".
- Corren cada hora con la automatización del hogar y al abrir Inicio, sin duplicarse.
- Las notificaciones push ya no llegan a quien no tiene acceso al módulo (por ejemplo, avisos de finanzas a un adolescente sin acceso a Finanzas).

## 2. Privacidad
- `private_transactions` es una tabla aparte: solo su dueño la ve (RLS). No entra en totales del hogar, reportes, funciones del servidor ni respaldos. Si la persona sale del hogar, sus movimientos privados se eliminan.
- El campo "Personal" de un movimiento normal sigue significando reparto/propiedad, no privacidad. "Solo yo" es lo privado.
- Las liquidaciones (`finance_settlements`) sí entran en los respaldos.

## 3. Instalación en Supabase
Aplicar, en este orden, las migraciones nuevas sobre la base existente (SQL Editor o `supabase db push`):

1. `supabase/migrations/20261017120000_finance_experience_v31.sql`: días de pago, tipo de cambio, columnas de moneda, `private_transactions`, `finance_settlements` y la función `get_home_finance_source` (Inicio en una sola consulta).
2. `supabase/migrations/20261017121000_finance_alerts_and_backups.sql`: alertas y respaldos.
3. `supabase/migrations/20261017122000_finance_alerts_automation_push_access.sql`: alertas en la automatización horaria y filtro de push por permisos.
4. `supabase/migrations/20261017123000_save_transaction_currency.sql`: guardado atómico de movimientos en dólares.

Después, volver a desplegar la función `send-web-push` (`supabase functions deploy send-web-push`). Las migraciones que modifican funciones existentes se detienen con un error claro si la función no tiene la forma esperada, y se pueden ejecutar de nuevo sin efecto.

Si el frontend se publica antes que las migraciones, Inicio usa las consultas anteriores; las funciones nuevas que dependen de tablas nuevas mostrarán un error hasta aplicar el SQL. Lo recomendado es aplicar el SQL primero.

## 4. Código
| Tema | Archivos |
| --- | --- |
| Inicio y tarjetas nuevas | `src/HomeMoneyWorkspace.tsx`, `src/HomeExtras.tsx`, `src/lib/homeOverview.ts`, `src/home.css` |
| Tarjetas de crédito | `src/lib/creditCards.ts` |
| Liquidaciones | `src/lib/settlements.ts`, `src/HomeExtras.tsx`, `src/SettlementsPanel.tsx` |
| Moneda y montos ocultos | `src/lib/currency.ts`, `src/lib/money.ts` |
| Registro rápido | `src/GlobalCommandCenter.tsx`, `src/lib/quickEntry.ts`, `src/quick-entry.css` |
| Plan de deudas e importación | `src/DebtPlanner.tsx`, `src/lib/debtPlan.ts`, `src/ImportStatement.tsx`, `src/lib/csvImport.ts`, `src/finance-tools.css` |
| Resumen y ejemplo | `src/FortnightRecap.tsx`, `src/lib/recap.ts`, `src/DemoPreview.tsx`, `src/lib/demoData.ts` |
| Estilos globales | `src/styles.css` ahora es un índice de `src/styles/01-foundation.css` … `05-overlays.css` (mismo orden y contenido) |
| Piezas de Finanzas | `src/FinanceParts.tsx`: tipos, tarjetas y gráficas pequeñas que antes vivían dentro de `src/Finance.tsx` |

Pruebas nuevas: unitarias en `src/lib/*.test.ts`, escenarios SQL en `supabase/tests/finance_experience_v31.sql`, `finance_alerts_v31.sql`, `push_access_v31.sql`, `save_currency_v31.sql` y los escenarios de navegador `tests/e2e/quick-entry.e2e.mjs` y `tests/e2e/finance-tools.e2e.mjs`.

## 5. Limpieza de código
- `Finance.tsx` pasó de ~1,000 a ~910 líneas: sus piezas reutilizables están en `FinanceParts.tsx` y se quitaron importaciones y funciones que ya no se usaban.
- `styles.css` (150 KB en una sola hoja) quedó dividido en cinco archivos por área, sin cambiar el orden de las reglas.
- Inicio carga sus finanzas con una sola consulta (`get_home_finance_source`) en lugar de once.
- No se reformateó todo el proyecto con Prettier: cambiaría los ~300 archivos y varias pruebas que leen el código fuente. Si se quiere, conviene hacerlo en un commit aparte, solo de formato.

## Integración sobre la versión publicada

Ver [V31_INTEGRATION_RELEASE.md](V31_INTEGRATION_RELEASE.md) para las correcciones de permisos, importación CSV atómica, redondeo, validación y recuperación. La cuarta migración incluye `import_finance_transactions_once` para guardar movimientos y repartos juntos.
