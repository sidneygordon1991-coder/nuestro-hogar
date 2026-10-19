# Pagos con crédito o dinero existente — v0.35.0

## Comportamiento

Regla elegida por el propietario: efectivo, débito, ahorro y transferencias a un comercio usan saldo existente, sin consumir presupuesto por defecto. Una compra con crédito consume presupuesto y aumenta la deuda. Todo desembolso sigue apareciendo en los gastos reales, incluso si queda fuera del presupuesto.

| Operación nueva | Presupuesto | Cuenta |
| --- | --- | --- |
| Compra con cuenta de crédito | Incluida en la quincena de la fecha de compra | Aumenta deuda; no reduce dinero líquido |
| Compra con efectivo, cuenta corriente/débito o ahorro | Excluida por defecto | Reduce el saldo de la cuenta elegida |
| Pago de tarjeta desde banco o efectivo | No genera un gasto adicional | Transferencia: reduce saldo y deuda |
| Transferencia entre cuentas propias | No genera ingreso ni gasto | Mueve el dinero entre cuentas |
| Gasto sin cuenta asignada | Incluido por prudencia | No ajusta un saldo individual |

En **Mi dinero → Movimientos → Agregar**, elegir Cuenta y revisar **Tratamiento del gasto**. Automático aplica la regla anterior. Las opciones Incluir en el presupuesto y Usar saldo existente permiten excepciones. Editar conserva la clasificación guardada hasta que la persona la cambie, incluso si se cambió el tipo de la cuenta. Los ciclos personales y el mes siguen las reglas de v0.34.0; esta versión no cambia las fechas ni los importes de los planes.

El acceso rápido y la importación de estados de cuenta presentan la misma regla. Las compras de listas y los pagos recurrentes nuevos la aplican en el servidor; su clasificación se puede modificar después en Movimientos. Las transferencias a comercios se registran como gastos de la cuenta bancaria, y los abonos entre cuentas se registran en **Cuentas → Transferir / pagar deuda**. La aplicación no convierte automáticamente las filas importadas en transferencias conciliadas: revisar posibles duplicados antes de importar un pago ya registrado.

## Implementación

- `src/lib/paymentBudget.ts`: regla explícita, validación de metadatos y mensajes de efecto.
- `src/PaymentBudgetField.tsx` y `src/styles/modules/payment-budget.css`: selector reutilizable y explicación accesible con iconos Lucide, temas y tamaños móviles.
- `src/finance/sections/FinanceDialogs.tsx`, `src/finance/useFinanceWorkspace.tsx`: creación con clasificación explícita y edición que conserva el historial.
- `src/GlobalCommandCenter.tsx`, `src/ImportStatement.tsx`, `src/ShoppingCheckoutDialog.tsx`, `src/finance/sections/FinanceRecurring.tsx`: coherencia entre vías de entrada. Los registros privados sin cuenta mantienen su flujo existente.
- `src/lib/formDrafts.ts`: evento de restauración para sincronizar el efecto mostrado con los controles recuperados.
- `supabase/migrations/20261019133751_payment_budget_defaults.sql`: clasificador privado, trigger BEFORE INSERT y actualización de los escritores existentes. No se ejecuta UPDATE sobre datos históricos.
- `src/lib/paymentBudget.test.ts`, `tests/e2e/payment-budget.e2e.mjs`, `supabase/tests/payment_budget_defaults.sql`: comprobaciones de saldos, presupuesto, deuda, reintentos, formularios, importaciones y aislamiento.
- `package.json`, `package-lock.json`, `public/sw.js`, `src/lib/release.test.ts`: versión 0.35.0 y caché PWA v35.

El campo `budget_included` sigue siendo NOT NULL. Su default NULL funciona únicamente como señal de inserción: el trigger lo reemplaza antes de validar la restricción. Los valores explícitos de copias de respaldo se conservan. La función del trigger y el clasificador son SECURITY INVOKER con search_path vacío. No se agrega ninguna API pública ni se amplían permisos de los escritores existentes.

Los reintentos conservan el payload original; un cambio posterior en el tipo de cuenta no reclasifica una solicitud ya guardada. Los reintentos antiguos con inclusión implícita siguen siendo compatibles. Cambiar datos de una solicitud ya guardada genera el conflicto existente, en lugar de guardar una segunda operación.

## Validación

Resultados finales de las comprobaciones locales y de publicación se consignan en el PR de esta versión. Las pruebas SQL se ejecutan con esquema y políticas reales reconstruidos en PostgreSQL embebido y registros sintéticos, sin copiar registros de producción. Las comprobaciones de producción son de metadatos, permisos y huellas de filas; no se crean movimientos de prueba en hogares reales.

La prueba PWA comprueba actualización v34 → v35, conservación de un marcador local, pantalla de acceso sin conexión y respaldo ante red lenta; no demuestra que una sesión autenticada pueda consultar datos financieros sin conexión.

## Límites y recuperación

Se requiere una cuenta de pago con el tipo correcto para ajustar su saldo. Un gasto sin cuenta conserva la inclusión prudente y lo advierte. Cuentas de tipo “otro” y deudas distintas de tarjeta conservan la inclusión prudente. No se deduce el tipo de cuenta a partir de su nombre ni se presenta el límite de crédito como efectivo disponible.

Actualizar la PWA cuando aparezca el aviso. Un cliente anterior puede seguir enviando una clasificación explícita: el servidor la respeta. Si se requiere volver a la regla anterior, restaurar DEFAULT true y las definiciones previas de los dos escritores mediante una nueva migración; el trigger puede permanecer porque solamente actúa sobre inserciones NULL. No cambiar las clasificaciones históricas ni borrar solicitudes de idempotencia. El frontend anterior puede desplegarse otra vez sin eliminar columnas ni registros.
