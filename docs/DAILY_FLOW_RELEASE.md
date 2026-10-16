# Organización diaria — PWA v23

Implementación autorizada a partir de la comparación con FamilyWall. Continúa la versión v22; no reconstruye la app ni modifica registros financieros. Rama: `feat/daily-family-flow`.

## Funciones y archivos

- Inicio: `HomeDashboard.tsx`, `HomeAgenda.tsx`, `lib/dailyAgenda.ts`. Hoy y próximos siete días, pendientes anteriores, filtro por responsable (incluye actividades sin asignación), comidas y mantenimiento. Se evita repetir el evento vinculado a un mantenimiento. Se pueden desplegar todas las actividades sin abandonar Inicio; los errores muestran agenda incompleta y reintento. Se respetan los permisos de cada módulo.
- Listas: `ListsCenter.tsx`. Alta breve con fecha, responsable y repetición desplegables; edición de nombres y elementos, listas fijadas para todo el hogar, rutinas diarias/semanales y rotación opcional en el orden mostrado. Completar conserva el registro y crea una sola próxima fecha futura; una rutina atrasada no genera una cascada de tareas perdidas. Desmarcar un registro anterior conserva la próxima tarea. Para cambiar o detener una rutina, editar la tarea pendiente. Eliminar la lista o limpiar completados sigue siendo una decisión explícita.
- Comidas: `MealsCenter.tsx`, `WeeklyShoppingDialog.tsx`, enlace de permisos en `App.tsx`. Compra semanal con vista previa, porciones, suma de ingredientes compatibles y descuento de despensa una sola vez por producto. Guarda una lista identificada por semana y permite actualizarla; se mantienen elementos manuales y compras completadas. No reserva ni descuenta físicamente existencias y no registra gastos.
- Presentación y ayuda: `daily-flow.css`, `main.tsx`, `lib/moduleGuides.ts`. Usa los temas existentes y las ventanas comunes con foco y acciones visibles en móvil.
- PWA: `public/sw.js`, `App.tsx`, `lib/release.test.ts`. Caché v23; aviso de actualización también antes de iniciar sesión y durante el alta del hogar.

## Servidor y compatibilidad

Migraciones aditivas `20261016141553_family_daily_flow.sql` y `20261016142118_list_routine_completion_compatibility.sql`, alineadas con los identificadores aplicados en el servidor. No aplicar otra vez ni ejecutar indiscriminadamente las migraciones históricas.

Las columnas nuevas tienen valores por defecto y se normalizan también al restaurar respaldos antiguos mediante `json_populate_recordset`. Las rutinas y referencias de compra se incluyen automáticamente en los respaldos existentes, que exportan filas completas.

Las RPC son SECURITY INVOKER, con `search_path` vacío y ejecución anónima revocada. Se conservan RLS, auditoría, referencias del hogar, recuperación y bloqueo de archivados. La generación semanal se serializa por hogar/semana y comprueba una huella del menú/despensa; si cambió la vista previa, exige recalcular antes de guardar. Las claves únicas evitan duplicar listas, ingredientes semanales u ocurrencias de rutina. La siguiente tarea se genera mediante un disparador de UPDATE, también cuando un cliente antiguo marca directamente el registro como completado. Restaurar registros completados con INSERT no avanza rutinas.

## Validación

- `src/lib/dailyFlow.test.ts`: PostgreSQL aislado con roles/RLS, cantidades, porciones, conversiones, stock vencido, unidades incompatibles, reintentos, vista previa desactualizada, conservación de compras/manuales, rotación, atrasos, UPDATE de clientes anteriores, respaldo antiguo y acceso anónimo/ajeno/lector. Incluye selección temporal y por responsable de Inicio.
- `supabase/tests/daily_flow_integration.sql`: integración aprobada con el esquema, roles, políticas, auditoría y restricciones reales; también prueba los helpers reales de restauración antigua. Identidades y hogares sintéticos con rollback completo. Las huellas de listas, elementos, comidas y despensa originales permanecieron iguales; ninguna cuenta de prueba persistió.
- Suite completa: 209 pruebas automatizadas en 23 archivos. Compilación de producción y 24 escenarios de navegador, incluidos los 14 anteriores. Matriz de temas claro/oscuro y anchos 320, 390, 768 y 1280; Axe en Inicio, Listas y compra semanal sin hallazgos críticos/graves en los escenarios cubiertos.

## Límites y pendientes

- Las existencias representan el inventario actual, sin reserva entre semanas. Revisar vencimientos futuros antes de cocinar. Solo se convierten unidades métricas exactas y alias de unidades; no se infieren densidades, tamaños de paquetes ni equivalencias entre tazas, libras y kilogramos. Un ingrediente sin vínculo a despensa no descuenta inventario por coincidencia de nombre. Las comidas sin receta/ingredientes y los avisos de unidades requieren revisión manual. No se descuentan compras anotadas en otras listas.
- Una compra semanal completada se conserva y no vuelve a crearse automáticamente para esa semana. Al recalcular se actualizan cantidades automáticas pendientes y se retiran las que ya no hacen falta; se conservan nombres/notas editados y elementos manuales.
- Se probaron bloqueos e idempotencia, pero no una prueba de carga distribuida con múltiples conexiones reales ni recuperación total de archivos.
- El asesor conserva los avisos de 50 funciones privilegiadas anteriores, dos extensiones públicas y una tabla privada con RLS sin políticas. También se observó el aviso de protección contra contraseñas filtradas deshabilitada; no se modificó configuración de Auth ni se contrató un plan. No se agregaron funciones SECURITY DEFINER.
- Contactos, comentarios, calendarios externos, ubicación y multimedia quedan fuera de esta entrega. No se añadieron servicios de pago obligatorios.

## Cómo probar

1. Actualizar/reabrir la PWA y entrar al hogar. Comparar Hoy y Esta semana; filtrar por responsable y abrir una comida o mantenimiento desde Inicio.
2. En Listas, fijar una lista, editar su nombre y corregir un elemento. Crear una tarea con fecha y repetición diaria/semanal; si hay varias personas, seleccionar responsables rotativos. Completarla y comprobar historial y próxima fecha.
3. En Comidas, planificar varias comidas con ingredientes vinculados y unidades compatibles. Abrir Preparar compra semanal, revisar cantidades y guardar. Repetir no debe duplicar la lista. Cambiar menú/despensa exige actualizar el cálculo; las compras completadas se conservan.
4. Usar un hogar de prueba para pruebas que creen movimientos o datos ficticios.
