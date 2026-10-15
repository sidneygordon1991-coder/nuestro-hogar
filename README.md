# Nuestro Hogar

PWA familiar construida con React + TypeScript + Supabase.

## Funcional en esta V1
- Registro e inicio de sesión con Supabase Auth.
- Crear un hogar o unirse con código de invitación.
- Dashboard responsive estilo app móvil.
- Listas compartidas.
- Calendario familiar.
- Presupuesto: ingresos, gastos y balance.
- Área familiar con código de invitación.
- RLS por hogar en Supabase.

## Ejecutar localmente
1. `npm install`
2. Copia `.env.example` a `.env.local` si deseas manejar las variables localmente.
3. `npm run dev`

## Build
`npm run build`

El proyecto usa únicamente la publishable key en el frontend. La autorización real está protegida por Row Level Security en Supabase.

### Diagnóstico financiero en Salud del hogar

La vista integra el mes y ambas quincenas, un margen proyectado con fórmula visible, liquidez registrada, reserva de emergencia declarada, cuotas mínimas frente al ingreso mensual esperado y hasta tres acciones priorizadas. La segunda quincena proyecta el cierre del mes conservando pendientes de la primera. Se respetan las reglas de aportes existentes.

Los movimientos futuros no son ingresos/gastos/ahorro reales. Cada categoría usa el mayor entre presupuesto restante y recurrentes pendientes para evitar duplicaciones. Los saldos bancarios, la reserva y las cuotas se muestran por separado: no se suman como ingresos ni se descuentan otra vez de la proyección. La reserva es un dato confirmado por el hogar, con fecha y meta personal de 1–12 meses; solo Finanzas con permiso de edición puede guardarla.

La evolución incluye tres meses completos y el actual marcado en curso, sin comparar porcentualmente un mes parcial con uno completo. Los datos faltantes se señalan; el análisis no implica conciliación bancaria. No se usa un servicio externo de IA.

La migración `20261015194610_household_financial_diagnosis.sql` agrega dos RPC con permisos de invocador y campos opcionales compatibles con respaldos anteriores. Validación: `npm test -- --run`, `npm run build` y los bloques reversibles de `supabase/tests/household_financial_diagnosis.sql` (cálculos de cuentas, fechas futuras, reserva cero, aislamiento, lectura, archivo y respaldo anterior).
