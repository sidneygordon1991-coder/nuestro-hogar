# Experiencia profesional · v0.40.0

Esta entrega une una portada más cuidada con comprobaciones concretas de las cifras. No modifica registros financieros, políticas de acceso ni el esquema de producción.

## Diseño y uso cotidiano

- Inicio incorpora un panorama editorial del mes, una ilustración vectorial propia y tres cifras reales: ingresos recibidos, gasto y ahorro neto. Respeta la vista personal o compartida y la preferencia de ocultar montos.
- «Comprobar cifras del mes» usa el mismo componente en Inicio y Finanzas: rango, fórmula, ahorro neto, gastos incluidos/excluidos y accesos a los registros de origen. El resultado del mes y el dinero en cuentas conservan significados separados.
- El diseño usa los colores semánticos existentes, las cuatro preferencias de acento, modo claro/oscuro y reducción de movimiento. Las tablas comparativas se pueden enfocar y desplazar con teclado y exponen encabezados a lectores de pantalla.
- El detalle de un movimiento conecta su efecto en presupuesto, ahorro, cuenta y deuda. Desde ahí se puede editar con el permiso existente, consultar comprobantes/comentarios y abrir Cuentas.
- El historial del movimiento consulta solo sus últimos 20 eventos y únicamente cuando el servidor permite ver la auditoría. La fuente actual aporta autor, acción y fecha; no se inventan motivos ni valores anteriores de cada campo.

## Consistencia financiera

`registeredLedger` centraliza el cálculo del movimiento real en centavos. Lo usan el motor de flujo, los totales de Finanzas, la evolución histórica y la comprobación del cierre. No incorpora ingresos futuros, planes, límites de crédito ni transferencias.

Una categoría de ahorro se cuenta como ahorro, no como gasto. Los retiros disminuyen el ahorro neto del rango sin crear ingresos. Un gasto fuera del presupuesto sí reduce el resultado real. Se corrigió una discrepancia del historial que podía presentar un ahorro como gasto; no se reescribieron transacciones para hacerlo.

Las tarjetas de comparación y las categorías comparan los mismos días transcurridos cuando el mes está en curso; cada fecha se limita al último día real del mes correspondiente. Los meses cerrados se comparan completos. Las gráficas y la tabla conservan totales mensuales y advierten que el mes actual es parcial. En los meses futuros se ocultan variaciones y comparaciones de categorías porque todavía no existe un período real que comparar. Si falla la carga del historial, se muestra el error y el reintento, sin reemplazarlo por ceros. Si el importe anterior era cero y el actual no lo es, se muestra «Sin base anterior» en lugar de una variación inventada del 100 %.

## Cierre y reportes

- El cierre permite contrastar las cuatro cifras principales con los registros visibles y enumera movimientos sin cuenta, conciliaciones al corte y pendientes del resumen.
- La falta de permisos o una consulta fallida se muestra expresamente; nunca equivale a una revisión correcta.
- El historial de conciliación informa lo que se comparó. No certifica por sí mismo que después no se editaron los registros: Cuentas conserva la comprobación de su huella y diferencias.
- Antes de cerrar un mes terminado, el usuario confirma que revisó cifras y pendientes. Se vuelve a pedir al servidor el resumen; si cambian las cifras o las operaciones, se actualiza la vista, se desmarca la confirmación y se conservan las notas y objetivos de ese intento.
- Esta segunda lectura es una comprobación del cliente, no un bloqueo transaccional nuevo. El servidor conserva su operación de cierre y su fotografía histórica existente. Las ediciones posteriores del libro se pueden detectar al contrastar esa fotografía, pero no se crean automáticamente versiones adicionales del cierre ni se bloquean movimientos.
- Las vistas parciales señalan que el mes anterior completo es solo una referencia. Ocultan variaciones porcentuales que podrían interpretarse como comparación de días equivalentes.
- El PDF conserva los números del resumen seleccionado, usa la identidad verde de la aplicación e identifica fecha del cálculo y del cierre cuando están disponibles. Explica si el corte es parcial y si las cifras pertenecen a una fotografía histórica.
- Los fallos recuperables de comprobación/cierre dejan una señal en el diagnóstico existente: acción, versión y ruta, sin importar montos, descripciones ni parámetros de sesión a ese evento.

## Backend de pruebas y comprobación técnica

`npm run db:preflight` comprueba mediante el catálogo de Supabase once tablas financieras/de acceso y siete funciones necesarias. Comprueba presencia, RLS, existencia de políticas y que las funciones seleccionadas no sean ejecutables por `anon`. No lee registros de hogares ni ejecuta migraciones. No certifica que cada política o función sea correcta.

Requiere Node 24 y estas variables del entorno seguro:

```bash
SUPABASE_PROJECT_ID=<referencia del proyecto de pruebas> npm run db:preflight
```

El token se toma de `SUPABASE_ACCESS_TOKEN`; no debe escribirse en el repositorio. El proyecto de producción conocido se rechaza por defecto. Su catálogo se puede observar expresamente con `--production-read-only`. En un entorno con proxy de red, Node 24 puede requerir `NODE_USE_ENV_PROXY=1`.

El flujo manual `Backend catalog check` espera los secretos `SUPABASE_STAGING_PROJECT_ID` y `SUPABASE_ACCESS_TOKEN` en el entorno GitHub `staging`. Nunca ejecuta restauraciones ni migraciones y no se dispara durante una publicación de la interfaz.

La comprobación de solo lectura del catálogo de producción pasó durante esta entrega. El acceso administrativo disponible permite inventariar el proyecto existente, pero la lista de organizaciones accesibles está vacía. **No se creó ni se restauró un backend staging**. Sigue pendiente obtener acceso de organización, revisar una exportación del esquema y realizar el ensayo completo de restauración/migraciones indicado en [Entornos y base de datos](ENTORNOS_Y_BASE_DE_DATOS.md). Las pruebas de navegador usan datos simulados; las pruebas PostgreSQL aisladas tampoco sustituyen esa validación integral.

Los permisos más granulares para acciones sensibles, el registro obligatorio de motivos y las versiones adicionales persistidas del cierre requieren un diseño de servidor, migraciones y pruebas en ese backend separado. Esta versión hace visibles los controles disponibles sin simular capacidades que el servidor todavía no ofrece.
