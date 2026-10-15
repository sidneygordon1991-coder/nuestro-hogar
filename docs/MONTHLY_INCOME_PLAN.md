# Ingresos esperados por mes

Finanzas > Ingresos usa el selector mensual de Finanzas. Cada integrante tiene un ingreso esperado y una comparación con los ingresos reales de ese mes. Los cobros parciales se suman por la persona asociada al movimiento. Los importes se calculan en centavos y admiten dos decimales.

Guardar el plan solo escribe `finance_income_plans`, con clave única `(household_id, month, user_id)`. No crea movimientos, cobros recurrentes ni repartos. Un plan guardado de cero se conserva como cero y no se sustituye por la referencia. Cambiar el mes conserva los planes anteriores.

Los meses sin plan toman como punto de partida el ingreso general de referencia configurado en Aportes. Con la planificación quincenal, los nuevos repartos proporcionales usan el ingreso esperado de la quincena cuando está completo; si falta distribuirlo, usan el plan mensual guardado y después la referencia. Editar el plan no recalcula gastos existentes. Ver `FORTNIGHT_BUDGET.md`.

Esperado y Pendiente usan los valores guardados; los cambios del formulario se aplican al guardar. Recibido proviene únicamente de movimientos de tipo `income` cuya fecha cae en el mes. Los ingresos sin persona o de integrantes que ya no pertenecen al hogar se incluyen en el total recibido y se señalan aparte. Un excedente de una persona no cancela lo que aún se espera recibir de otra. El cierre estimado de Finanzas agrega los importes pendientes por persona al balance real, conservando la separación entre lo recibido y lo proyectado.

La nueva tabla usa RLS con permisos del módulo Finanzas, valida la pertenencia del integrante al guardar y registra cambios en auditoría. Conserva el bloqueo de familias archivadas y no permite mover registros entre hogares. Los planes se incluyen en los respaldos JSON y ZIP y en la restauración de registros faltantes; los respaldos antiguos siguen siendo compatibles.

Verificación: pruebas unitarias de meses separados, ceros explícitos, ingresos parciales, centavos, importes inválidos, excedentes y movimientos sin integrante. Pruebas en navegador con guardado, recarga, cambio de mes, solo lectura, fallos de lectura y escritura, ambos temas y pantallas de 320 a 1440 px. Los bloques de `supabase/tests/monthly_expected_income.sql` comprueban restricciones, restauración idempotente, solo lectura, archivo y acceso anónimo dentro de transacciones con ROLLBACK. Los datos del navegador son ficticios.
