# Nuestro Hogar v33

v33 se construye sobre la v32 y tiene cuatro etapas: bases técnicas, sistema de diseño, Guatemala y funciones opcionales sin IA. Ningún cambio borra tablas ni columnas.

## Orden de publicación

1. Aplica las migraciones de la v32 si aún no lo hiciste. Luego aplica, en este orden y **primero en el proyecto de prueba**:
   - `supabase/migrations/20261018130000_platform_activity_metrics.sql`: alimenta la sección "Uso real" del panel master.
   - `supabase/migrations/20261018140000_guatemala_pay_cards_allowance.sql`: sueldo, cuotas de tarjeta, cuentas en dólares y mesada.
2. Ejecuta `supabase/tests/guatemala_v33.sql` en el proyecto de prueba. Termina en `rollback`, así que no deja datos.
3. Ejecuta `npm ci`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build` y `npm run test:e2e`.
4. Publica el frontend.

El frontend tolera un servidor sin la migración nueva. Las cuentas en dólares y las cuotas no aparecen, el resto sigue igual, y las páginas Sueldo y Mesada muestran un error de carga hasta que apliques la migración.

## Etapa 1 · Bases

- **Formato único** con Prettier (`npm run format`), revisado también en CI.
- **`Finance.tsx` dividido.** Antes eran 123 KB en un solo archivo (unas 4,800 líneas con formato). Ahora el estado y las acciones viven en `src/finance/useFinanceWorkspace.tsx` y cada sección en `src/finance/sections/`. Conserva los flujos existentes; se verifica mediante las pruebas de integración y diseño.
- **Scripts:** `npm run typecheck`, `npm run db:types` (tipos generados de la base) y `npm run db:baseline` (línea base de la base real). Ver `docs/ENTORNOS_Y_BASE_DE_DATOS.md`.
- **Métricas de uso** en el panel master: hogares activos por semana, altas y errores.

## Etapa 2 · Sistema de diseño

Ver `docs/SISTEMA_DE_DISENO.md` y `docs/PRUEBAS_CON_FAMILIAS.md` (guía para probar con 5 a 8 hogares antes de cada cambio grande).

- **Tokens** (`src/styles/00-tokens.css`):
  - tipo, espacio, radios, elevación, capas, movimiento
  - fuentes propias: Inter para la interfaz y Lora para títulos y cifras
- **Hojas de estilo ordenadas** en `layers/`, `components/` y `modules/`. Se quitaron 103 declaraciones anuladas y las reglas de clases que ya no existen.
- **Componentes** en `src/ui`: `Amount`, `EmptyState`, `Illustration` (12 ilustraciones propias con motivos de Guatemala), `Button`, `ProgressBar`.
- **Movimiento:** ventanas y hojas que suben o se asientan, y una cifra principal que cuenta hasta su valor. Todo se apaga con "reducir movimiento".
- **Etiquetas** en minúscula normal.

## Etapa 3 · Guatemala

| Función | Dónde | Detalle |
| --- | --- | --- |
| **Sueldo y prestaciones** | Mi plan | Calcula el líquido con IGSS laboral 4.83% (sin la bonificación incentivo) e ISR de asalariados: 5% hasta Q300,000 y luego Q15,000 + 7%. Usa la deducción única de Q48,000, la extraordinaria de Q3,024 (solo 2026) y la planilla del IVA. **El sueldo es privado:** solo lo ve su dueño y no entra en respaldos ni reportes. |
| **Bono 14 y aguinaldo** | Mi plan | Monto proporcional a los días trabajados de su periodo (1 jul–30 jun y 1 dic–30 nov) y fecha legal. Para el aguinaldo, la mitad en diciembre y la otra en la segunda quincena de enero. Plan de reparto entre deudas, ahorro, gastos de temporada y una parte libre. |
| **Visacuotas y extrafinanciamiento** | Cuentas, en cada tarjeta | Cuota, avance e intereses por venir. Lo que se cobra en meses siguientes ya no aparece como "para no pagar intereses" de este corte, en Finanzas ni en Inicio. |
| **Cuentas en dólares** | Cuentas | Saldo en US$ y su valor al cambio guardado; se indica como estimado si hay movimientos sin importe nativo o transferencias sin cambio histórico. Los reportes siguen en quetzales. |
| **Remesas** | Ingresos | Monto del mes, qué parte de los ingresos representa, tendencia de 6 meses y aviso si llegó menos o si el hogar depende mucho de ellas. Se detectan por la categoría "Remesas" o por el servicio de envío. |
| **Mesada** | Mi hogar | Frascos para gastar, ahorrar y compartir, una meta y pagos semanales, de quincena (15 y fin de mes) o mensuales. "Marcar pagada" la registra como gasto del hogar en un solo paso (`pay_allowance`). El adolescente ve su mesada aunque no vea las finanzas, y no puede pagarse ni editarla. |

Las reglas se verificaron con publicaciones de 2026 y el texto de los decretos (10-2012, 42-92, 76-78 y 78-89). Las cifras son estimaciones; la planilla del empleador tiene la última palabra.

## Etapa 4 · Funciones opcionales (sin IA)

Cada persona las enciende para sí misma en **Configuración → Funciones opcionales**. Vienen apagadas y se guardan por persona y hogar, como la apariencia. Todo se calcula en el dispositivo con los datos del hogar.

| Función | Dónde |
| --- | --- |
| Registrar con la voz: dictado del navegador más un intérprete local de montos, palabras, dólares y fechas. En Chrome, el audio lo procesa Google; la app solo recibe el texto. | Registrar |
| Preguntas rápidas: gasto por categoría y periodo, lo que queda del presupuesto, fecha de un pago fijo, ahorro y mayor gasto. | Finanzas → Resumen |
| Tu semana: comparada con una semana normal, el motivo y los pagos de los próximos 7 días. | Inicio |
| Pronóstico de 90 días: pagos fijos en su fecha, más el gasto y los ingresos de costumbre de los últimos 3 meses. Marca el punto más bajo. | Finanzas → Resumen |
| Suscripciones detectadas: cobros mensuales que no son pagos recurrentes, cambio de precio y costo al año. | Finanzas → Pagos recurrentes |
| Presupuesto base cero con arrastre: lo que falta por asignar y lo no usado de meses anteriores. | Finanzas → Presupuesto |

**Pospuesto a pedido:** lectura de notificaciones del banco, estados de cuenta en PDF y fotos de recibos.

## Verificación de la integración publicada

La evidencia actual, los archivos principales, las correcciones adicionales y los límites conocidos se documentan en [V33_INTEGRATION_RELEASE.md](V33_INTEGRATION_RELEASE.md). Esta versión pasó 423 pruebas unitarias y 17 escenarios SQL aislados contra la reconstrucción del esquema completo de referencia. Los resultados del navegador y despliegue se consultan en los checks de la pull request.

El cálculo de sueldo identifica el año de reglas (verificado hasta 2026). No extrapola automáticamente las deducciones de ISR a 2027. La consolidación del historial del backend y los tipos generados todavía requieren un trabajo separado; el exportador no hace reproducible por sí solo el esquema inicial.
