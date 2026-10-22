# Nuestro Hogar

PWA familiar construida con React + TypeScript + Supabase.

## Estado y documentación

**v33:** ver [docs/V33_MEJORAS.md](docs/V33_MEJORAS.md) (sistema de diseño, Guatemala y funciones opcionales sin IA).
**v32:** ver [docs/V32_MEJORAS.md](docs/V32_MEJORAS.md) (seguridad, finanzas, robustez y diseño).


La rama `feat/nuestro-hogar-2-premium` contiene una propuesta revisable de la versión 2.0. No está desplegada y su migración de retiros no se aplica automáticamente.

- [Guía del proyecto, interfaz y código](docs/PROJECT_GUIDE.md)
- [Auditoría y resultados por fase](docs/PREMIUM_2_AUDIT.md)
- [Revisión y activación de la propuesta](docs/PREMIUM_2_RELEASE.md)

La aplicación reúne Inicio, Finanzas (once secciones), Agenda, Familia, Listas, Documentos, Comidas, Mantenimiento, Planeación, Salud del hogar, Cierre mensual, Automatizaciones, Respaldos y Diagnóstico. Incluye acceso por correo verificado, master/MFA, cuotas de archivos, notificaciones y personalización. La PWA y el aislamiento por hogar se conservan.

## Ejecutar localmente
1. `npm ci`
2. Copia `.env.example` a `.env.local` y configura la URL y la clave publicable de **un proyecto de pruebas**. Sin configuración válida se muestra un aviso y no se crea el cliente de Supabase. El proyecto de producción se rechaza en modo de pruebas.
3. `npm run dev`

El entorno de pruebas se identifica con una banda visible. `npm run test:e2e` compila un artefacto separado en `dist-e2e`, usa un proyecto ficticio y simula las respuestas: no requiere cuentas ni datos de producción. Para pruebas unitarias ejecuta `npm test`.

## Build
`npm run build`

El proyecto usa únicamente la publishable key en el frontend. La autorización real está protegida por Row Level Security en Supabase.

La configuración pública del despliegue existente está en `.env.production`; Vite la carga al ejecutar `npm run build`. Las variables del proceso tienen prioridad. La compilación rechaza configuraciones incompletas o inseguras. Las claves administrativas nunca deben usar el prefijo `VITE_`.

### Mejoras v37

Los importes se muestran con su valor real desde el primer render; una animación no los inicia en cero. Inicio distingue el saldo registrado del presupuesto y de los ingresos por recibir, y ofrece un único siguiente paso pendiente de preparación. La prueba de cambio de hogar espera el importe final y registra la respuesta anterior antes de liberarla.

El backend completo de pruebas sigue pendiente de una exportación revisada del esquema real: el historial actual no contiene las tablas iniciales. Consulta [Entornos y base de datos](docs/ENTORNOS_Y_BASE_DE_DATOS.md). Las pruebas simuladas y los escenarios SQL aislados no sustituyen esa restauración.

### Diagnóstico financiero en Salud del hogar

La vista integra el mes y ambas quincenas, un margen proyectado con fórmula visible, liquidez registrada, reserva de emergencia declarada, cuotas mínimas frente al ingreso mensual esperado y hasta tres acciones priorizadas. La segunda quincena proyecta el cierre del mes conservando pendientes de la primera. Se respetan las reglas de aportes existentes.

Los movimientos futuros no son ingresos/gastos/ahorro reales. Cada categoría usa el mayor entre presupuesto restante y recurrentes pendientes para evitar duplicaciones. Los saldos bancarios, la reserva y las cuotas se muestran por separado: no se suman como ingresos ni se descuentan otra vez de la proyección. La reserva es un dato confirmado por el hogar, con fecha y meta personal de 1–12 meses; solo Finanzas con permiso de edición puede guardarla.

La evolución incluye tres meses completos y el actual marcado en curso, sin comparar porcentualmente un mes parcial con uno completo. Los datos faltantes se señalan; el análisis no implica conciliación bancaria. No se usa un servicio externo de IA.

La migración `20261015194610_household_financial_diagnosis.sql` agrega dos RPC con permisos de invocador y campos opcionales compatibles con respaldos anteriores. Validación: `npm test -- --run`, `npm run build` y los bloques reversibles de `supabase/tests/household_financial_diagnosis.sql` (cálculos de cuentas, fechas futuras, reserva cero, aislamiento, lectura, archivo y respaldo anterior).

### Experiencia visual compartida

`experience.css` unifica superficies, tipografía, formularios, ventanas y navegación en ambos temas. Inicio combina balance, distribución de ingresos registrados y agenda, respetando los colores, favoritos y la prioridad de agenda elegidos por cada usuario. Finanzas conserva sus once secciones: cinco accesos principales y las adicionales en «Más» (el nombre de la sección activa permanece visible).

`BalanceFlow` muestra gastos, ahorro y margen con importes reales; señala cuando gastos y ahorro superan los ingresos. Salud del hogar presenta indicadores y acciones compactos, con fórmula, motivos, histórico y operación disponibles mediante desplegables accesibles. El acceso por correo conserva sus flujos de contraseña, recuperación y verificación y usa una escena vectorial adaptable al tema, con movimiento reducido cuando el dispositivo lo solicita. La actualización visual no requiere migraciones ni modifica registros financieros.

### Corregir aportes y recurrentes

En **Finanzas → Más → Metas**, el historial de **Aportes de ahorro** permite filtrar por meta/mes, editar monto, fecha o destino y eliminar con confirmación. La corrección mantiene el autor original y recalcula el ahorro y el progreso; las cuentas de solo lectura no muestran controles de escritura.

En **Finanzas → Más → Recurrentes**, **Tu programación recurrente** permite editar todos los datos y eliminar una repetición. Editar actualiza únicamente sus vencimientos pendientes, ajustando el día al último día válido de cada mes. Eliminar desactiva la programación y cancela sus pendientes; conserva los movimientos pagados y sus importes/descripciones históricos. Las correcciones de movimientos pagados se reflejan también en su detalle histórico. Las ventanas detectan cambios concurrentes y conservan el borrador si falla el guardado. El pago de un vencimiento es atómico e idempotente.

Las migraciones `finance_entry_management` y `finance_entry_helper_access` agregan detalles históricos opcionales, sincronización y RPC de invocador con permisos de Finanzas, sin claves elevadas en el cliente. Los escenarios de base de datos se documentan en `supabase/tests/finance_entry_management.sql`, con transacciones reversibles.
