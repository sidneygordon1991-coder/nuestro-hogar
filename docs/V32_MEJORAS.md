# Nuestro Hogar v32 · Revisión integral

Revisión de la versión publicada v31 (commit `4a2eb60`) en cuatro frentes: seguridad del servidor, exactitud financiera, robustez del código y experiencia/diseño. Todo cambio conserva los datos existentes; no se borra ninguna tabla ni columna.

## 1. Seguridad (aplicar primero)

Migración nueva: `supabase/migrations/20261018120000_security_null_safe_guards.sql` (idempotente). Escenario de prueba reversible: `supabase/tests/security_null_safe_v32.sql`.

| Problema | Riesgo | Corrección |
| --- | --- | --- |
| `set_household_member_access`, `set_household_member_responsibilities` y `rotate_household_invite_code` comparaban el rol con `not in (...)`. Para alguien **que no pertenece al hogar** el rol es `NULL` y la condición no se cumple, así que la función seguía. | **Crítico.** Una cuenta externa que conozca el id del hogar (por ejemplo, un exintegrante o un invitado con una segunda cuenta) podía volverse administradora o renovar y leer el código de invitación. | Guardas seguras ante `NULL` (`coalesce`) y `auth.uid()` obligatorio. |
| Códigos de invitación de 8 caracteres sin límite de intentos. | Alto: se podían adivinar por fuerza bruta. | Códigos de 16 caracteres (los cortos se renuevan), y `join_household` limita a 10 intentos fallidos cada 15 minutos. Un código inválido devuelve `null` y la app muestra el aviso. |
| Masters creados antes de `20261014013518` quedaron con `mfa_required=false`. | Medio: el panel master se abría solo con contraseña. | Todos los masters requieren MFA (el master debe tener su autenticador inscrito). |
| Faltaban índices por `household_id` en tablas usadas por RLS. | Rendimiento. | Índices `if not exists`, solo si la columna existe. |

> **Importante — historial de migraciones.** El archivo `20261007_initial_nuestro_hogar_schema.sql` solo contiene comentarios, y 31 migraciones sin hora (`20261013_*.sql`) se ordenan *después* de las que sí tienen hora. Reproducir el historial en una base vacía no funciona y, si se forzara, restauraría versiones antiguas y menos seguras de varias funciones y políticas. La base de producción no está afectada (se aplicó en otro orden), pero para un entorno nuevo hay que generar una línea base con `supabase db dump` desde producción. Recomendado: `select version,name from supabase_migrations.schema_migrations order by version;` y renombrar las migraciones sin hora con su versión real.

Edge function `send-web-push` (volver a desplegar):
- La cola de envío ya no se atasca: cada notificación recibe una decisión final (enviada, sin push activo, sin dispositivo, sin permiso). Antes, 100 avisos de personas sin push bloqueaban los envíos de todos durante una semana.
- Errores temporales del servicio push se reintentan 6 horas.
- Comparación del secreto en tiempo constante y sin exponer mensajes internos de la base.
- Ícono PNG (Android no muestra íconos SVG en notificaciones).

## 2. Exactitud financiera

| Corrección | Dónde |
| --- | --- |
| **Margen disponible / "Puedes gastar Q X por día"** con cuentas: ahora descuenta lo ya apartado en metas y lo que se debe pagar de tarjetas este mes. Antes el ahorro de las metas contaba como dinero libre. Una tarjeta que ya tiene un pago recurrente pendiente no se descuenta dos veces. Los tres indicadores siempre suman: Registrado − Pendiente − Reservado = Margen. "Ver cálculo" muestra cada línea. | `lib/homeOverview.ts` (`homeMargin`, `goalBalance`), `HomeMoneyWorkspace.tsx` |
| **Ahorro registrado como gasto** en un rubro de tipo Ahorro se contaba dos veces (como gasto y como ahorro pendiente). Ahora cuenta como ahorro en Inicio, Finanzas, Quincenas y el resumen de quincena. | `lib/cashFlow.ts`, `lib/financePeriods.ts`, `lib/recap.ts`, `Finance.tsx` |
| **Pagos recurrentes vencidos de meses anteriores** desaparecían el día 1. Ahora los de los dos meses anteriores siguen pendientes y vencidos, en Inicio y en Finanzas → Recurrentes, para pagarlos u omitirlos. | `App.tsx`, `Finance.tsx`, `lib/cashFlow.ts`, `lib/homeOverview.ts` |
| **Vista Personal** incluye tu parte de los gastos compartidos (según el reparto guardado). | `lib/homeOverview.ts` (`scopeSource`) |
| **Plan de deudas**: el pago mínimo estimado cubría solo el interés con tasas de tarjeta guatemaltecas (36–60 %), y la deuda "nunca bajaba". Ahora estima interés + 1 % del saldo. | `lib/debtPlan.ts` |
| **Uso de crédito** solo compara tarjetas con límite; una tarjeta pagada de más cuenta como activo. | `Finance.tsx` |
| **Resumen de quincena** en curso se compara con los mismos días de la quincena anterior (antes contra una quincena completa). | `lib/recap.ts`, `FortnightRecap.tsx` |
| **Porcentajes de metas** ya no redondean 99.5 % a "100 % completado". | `FinanceParts.tsx`, `App.tsx`, `HomeMoneyWorkspace.tsx` |
| **Importar estado de cuenta (CSV)**: detecta archivos con fecha mm/dd, acepta montos con `CR`/`DB`, cada movimiento existente solo marca un duplicado (dos compras iguales el mismo día ya no se ocultan), un ingreso nunca duplica un gasto, los pagos de tarjeta / transferencias / retiros quedan sin seleccionar para no contarse dos veces (los depósitos de nómina o salario no), y la categoría se sugiere por fila según la descripción. | `lib/csvImport.ts`, `ImportStatement.tsx` |
| **Cierre guiado de quincena** avisa si ya registraron pagos entre ustedes en el mes, para no transferir dos veces. | `GuidedFortnightClose.tsx` |
| **Balance entre nosotros**: si no se pueden leer las liquidaciones, lo dice en lugar de mostrar una deuda incorrecta. | `Finance.tsx` |

## 3. Robustez

- Canales en tiempo real con nombre único por pantalla: cambiar de mes en Agenda/Comidas o salir rápido de Inicio ya no deja canales colgados ni rompe el módulo.
- La app no queda en blanco si el navegador bloquea el almacenamiento (Safari "bloquear cookies").
- Cerrar sesión desvincula el dispositivo de las notificaciones push (en un teléfono compartido ya no llegan avisos de la persona anterior).
- Exportaciones CSV de Respaldos leen todas las filas (antes se cortaban en 1,000 sin aviso) y evitan fórmulas peligrosas en Excel.
- Agenda de Inicio consulta solo eventos vigentes (antes leía todo el historial).
- Notificaciones dentro de la app abren la sección correcta de Finanzas.
- El hogar abierto por última vez se recuerda en el dispositivo; un enlace `?household=` también lo elige.
- Service worker v32: si la red es lenta, la app instalada abre en 3.5 s con la versión guardada.
- Copiar el código de invitación funciona aunque el portapapeles esté bloqueado (iOS).

## 4. Experiencia y diseño

- **Simple por defecto.** La vista "Esencial" es la predeterminada en toda la navegación (barra lateral, barra inferior y menú): dinero del día a día, agenda, listas y familia. Los demás módulos aparecen al marcarlos como favoritos o con "Ver todas las secciones". "Cómo dividimos los gastos" aparece cuando hay dos o más integrantes. Quien ya guardó la vista completa la conserva. Si prefieres que los usuarios actuales sigan viendo todo, basta con cambiar `view:'essential'` por `view:'complete'` en `defaultAppearance` (`src/lib/appearance.ts`); la creación de hogares nuevos ya guarda la vista esencial.
- **Primer uso: "¿Para quién es?"** — Solo yo / En pareja / En familia. Para una sola persona, el asistente no pregunta cómo repartir gastos y la invitación es opcional.
- **Registrar en el centro de la barra inferior** del teléfono, siempre al alcance del pulgar y sin tapar contenido.
- **Movimientos agrupados por día** con el resultado neto de cada día. Los gastos se muestran en el color del texto; el rojo queda para excesos y saldos negativos.
- **Finanzas → Resumen** muestra primero el balance; el simulador y los atajos van después.
- Registro rápido: la descripción es opcional (usa el nombre de la categoría); para una persona sola no pregunta "¿De quién es?" y la cuenta solo aparece si hay cuentas.
- Mejor separación de tarjetas y bordes en el tema de noche; texto mínimo de 12 px; campos de 16 px en el teléfono (iOS ya no hace zoom); botones táctiles de 40 px; zona segura del iPhone respetada; etiquetas accesibles en botones de solo ícono y en el cambio de contraseña.
- Textos más claros: "Octubre de 2026" (antes "Octubre De 2026"), "Tu quincena", "Plan de pasos" (antes "roadmap"), "Estado de la app", "Lo que tienes y lo que debes".
- Hojas de estilo globales cargan antes que los módulos (orden predecible) y los refinamientos van en `src/v32.css`.

## 5. Cómo publicar

1. Aplicar `supabase/migrations/20261018120000_security_null_safe_guards.sql` en el SQL Editor (o `supabase db push`). Opcional: ejecutar `supabase/tests/security_null_safe_v32.sql` (todo se revierte).
2. Volver a desplegar la función: `supabase functions deploy send-web-push`.
3. `npm ci`, `npm test`, `npm run build`, `npx playwright install chromium`, `npm run test:e2e`.
4. Publicar el frontend (rama `main`).

Aplica la migración cuanto antes (corrige un fallo crítico). Es compatible en ambos sentidos: lo único que cambia de contrato es `join_household`. La app v32 acepta el error anterior y el `null` nuevo; con el frontend v31 y la migración ya aplicada, un código inválido simplemente no muestra mensaje hasta publicar v32.

## 6. Verificación hecha en esta revisión

El entorno de trabajo no tenía acceso a npm, así que se verificó con herramientas equivalentes:
- 300 pruebas unitarias del proyecto (incluidas las de contraste de colores y diseño) con un ejecutor compatible; 8 pruebas nuevas de los cálculos corregidos. Las 3 que no corren en ese ejecutor fallan igual en v31 (dependen de funciones propias de Vitest).
- Revisión de tipos con TypeScript en modo estricto (con tipos sustitutos para React y Supabase): sin errores nuevos respecto de v31.
- Revisión independiente del cambio completo (código, cálculos, SQL y service worker); sus observaciones se corrigieron.
- Compilación de la app y capturas en teléfono y escritorio, tema de día y de noche, con los datos simulados de las pruebas de navegador.
- Pendiente de ejecutar en tu equipo o en CI: `npm test`, `npm run build` (incluye `tsc` completo de los componentes) y `npm run test:e2e`. Se actualizaron las pruebas de navegador que describían el diseño anterior (botón Registrar y título de la quincena).

## 7. Siguientes pasos sugeridos

- Saldo entre integrantes acumulado entre meses (hoy se calcula por mes).
- Registrar transferencias directamente desde la importación CSV.
- Detectar suscripciones y pagos que se repiten para proponerlos como recurrentes.
- Cuentas en dólares (requiere una columna de moneda en `finance_accounts`).
- Reunir las 34 hojas de estilo en tokens → base → componentes → módulos.
