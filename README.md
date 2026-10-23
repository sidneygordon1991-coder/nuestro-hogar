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

### Correcciones v37.1

- En teléfonos, un hogar nuevo conserva visible «Agregar mis cuentas» y puede abrir Cuentas directamente. La regla que oculta el acceso duplicado de la cabecera ya no oculta los botones del contenido.
- Si falla la descarga inicial de la aplicación, aparece una pantalla con «Volver a cargar» en lugar de una página vacía. El reintento vuelve a abrir el acceso cuando se recupera la conexión.

### Experiencia más clara v38

- Inicio da prioridad al presupuesto restante de la quincena o del mes. Los saldos de cuentas se muestran por separado y la proyección identifica los ingresos por recibir. Pagos y ahorro se pueden desplegar; la vista Completa los muestra desde el inicio.
- El registro rápido comienza por monto, tipo, categoría y cuenta. Recuerda la categoría y cuenta después de un guardado confirmado, por usuario y hogar; conserva los controles de privacidad y los borradores. Fecha, nota y repetición de movimientos están en desplegables.
- La vista Esencial de Finanzas ofrece Resumen, Movimientos y Presupuesto. Las otras ocho secciones siguen disponibles en «Más»; la vista Completa conserva sus cinco accesos principales.
- Los hogares sin movimientos tienen una guía de cuentas, ingresos y presupuesto que reconoce los pasos completados en cualquier orden. Los fallos de consulta no se interpretan como cuentas sin configurar.
- El tema claro usa superficies cálidas y menos sombras, con los cuatro colores y el modo oscuro disponibles. Las gráficas explican su base y distinguen cifras registradas de proyecciones; una consulta fallida de cuentas permite seguir viendo la evolución de ingresos y gastos verificados.

Esta versión cambia la presentación y los accesos sin alterar las reglas de cálculo financiero ni requerir migraciones de base de datos.

### Corrección de quincenas v38.1

Ingresos permite guardar la primera quincena con inicio 29 y la segunda con inicio 14: los rangos son 29–13 y 14–28, sin intercambiar sus importes. Solo se introducen los dos días de inicio; los finales se calculan automáticamente. El mes seleccionado indica el inicio del ciclo completo. Inicio elige la quincena actual con esas mismas fechas, incluidos los comienzos diferidos por febrero.

La migración `20261022220000_allow_wrapping_fortnight_cycles.sql` amplía las restricciones de los días, conserva los planes guardados y no modifica movimientos, importes ni permisos. Es necesaria antes de publicar el formulario actualizado. Las pruebas PostgreSQL aisladas ejecutan esa migración exacta y verifican la persistencia del nuevo orden, los límites válidos y la conservación de los registros existentes.

### Experiencia visual e interactiva v39

- La gráfica de Inicio permite tocar una fecha o recorrerla con un control accesible al teclado. El detalle identifica saldos registrados, contexto y proyecciones; los movimientos futuros no se presentan como recibidos. Los rubros de presupuesto se pueden desplegar para consultar sus gastos.
- El registro rápido ofrece categorías y cuentas con iconos y búsqueda, conservando los campos originales para borradores, privacidad, sugerencias, reintentos y guardado. Las elecciones se siguen recordando tras confirmar el movimiento.
- Las metas muestran hitos del 25 %, 50 %, 75 % y 100 % calculados sobre ahorro neto. Se puede elegir una foto personal desde Inicio o Metas: queda solo en el navegador y perfil que la eligió, por hogar y meta, y se puede quitar. No se sube a Supabase ni se comparte entre dispositivos.
- Inicio muestra la relación de gastos incluidos con ingresos recibidos o esperados, con la base identificada. Los desplegables y barras tienen transiciones suaves; la preferencia de movimiento reducido desactiva las animaciones nuevas. Se conservan los cuatro colores y ambos temas.

Estas mejoras no requieren migraciones ni cambian los importes o reglas de cálculo financiero.

### Diagnóstico financiero en Salud del hogar

La vista integra el mes y ambas quincenas, un margen proyectado con fórmula visible, liquidez registrada, reserva de emergencia declarada, cuotas mínimas frente al ingreso mensual esperado y hasta tres acciones priorizadas. La segunda quincena proyecta el cierre del mes conservando pendientes de la primera. Se respetan las reglas de aportes existentes.

Los movimientos futuros no son ingresos/gastos/ahorro reales. Cada categoría usa el mayor entre presupuesto restante y recurrentes pendientes para evitar duplicaciones. Los saldos bancarios, la reserva y las cuotas se muestran por separado: no se suman como ingresos ni se descuentan otra vez de la proyección. La reserva es un dato confirmado por el hogar, con fecha y meta personal de 1–12 meses; solo Finanzas con permiso de edición puede guardarla.

La evolución incluye tres meses completos y el actual marcado en curso, sin comparar porcentualmente un mes parcial con uno completo. Los datos faltantes se señalan; el análisis no implica conciliación bancaria. No se usa un servicio externo de IA.

La migración `20261015194610_household_financial_diagnosis.sql` agrega dos RPC con permisos de invocador y campos opcionales compatibles con respaldos anteriores. Validación: `npm test -- --run`, `npm run build` y los bloques reversibles de `supabase/tests/household_financial_diagnosis.sql` (cálculos de cuentas, fechas futuras, reserva cero, aislamiento, lectura, archivo y respaldo anterior).

### Experiencia visual compartida

`experience.css` unifica superficies, tipografía, formularios, ventanas y navegación en ambos temas. Inicio combina balance, distribución de ingresos registrados y agenda, respetando los colores, favoritos y la prioridad de agenda elegidos por cada usuario. Finanzas conserva sus once secciones: tres accesos principales en la vista Esencial, cinco en la Completa y las adicionales en «Más» (el nombre de la sección activa permanece visible).

`BalanceFlow` muestra gastos, ahorro y margen con importes reales; señala cuando gastos y ahorro superan los ingresos. Salud del hogar presenta indicadores y acciones compactos, con fórmula, motivos, histórico y operación disponibles mediante desplegables accesibles. El acceso por correo conserva sus flujos de contraseña, recuperación y verificación y usa una escena vectorial adaptable al tema, con movimiento reducido cuando el dispositivo lo solicita. La actualización visual no requiere migraciones ni modifica registros financieros.

### Corregir aportes y recurrentes

En **Finanzas → Más → Metas**, el historial de **Aportes de ahorro** permite filtrar por meta/mes, editar monto, fecha o destino y eliminar con confirmación. La corrección mantiene el autor original y recalcula el ahorro y el progreso; las cuentas de solo lectura no muestran controles de escritura.

En **Finanzas → Más → Recurrentes**, **Tu programación recurrente** permite editar todos los datos y eliminar una repetición. Editar actualiza únicamente sus vencimientos pendientes, ajustando el día al último día válido de cada mes. Eliminar desactiva la programación y cancela sus pendientes; conserva los movimientos pagados y sus importes/descripciones históricos. Las correcciones de movimientos pagados se reflejan también en su detalle histórico. Las ventanas detectan cambios concurrentes y conservan el borrador si falla el guardado. El pago de un vencimiento es atómico e idempotente.

Las migraciones `finance_entry_management` y `finance_entry_helper_access` agregan detalles históricos opcionales, sincronización y RPC de invocador con permisos de Finanzas, sin claves elevadas en el cliente. Los escenarios de base de datos se documentan en `supabase/tests/finance_entry_management.sql`, con transacciones reversibles.
