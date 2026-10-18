# Entornos, base de datos y calidad

Guía para trabajar sin tocar los datos reales de las familias: un proyecto de **prueba** separado, una línea base de la base de datos, tipos generados y las revisiones automáticas.

## 1. Por qué hace falta

- `20261007_initial_nuestro_hogar_schema.sql` solo tiene comentarios: las tablas base (`households`, `transactions`, `profiles`…) y varias funciones (`is_household_member`, `create_household`…) existen únicamente en producción.
- 31 migraciones sin hora (`20261013_*.sql`) se ordenan después de las que sí la tienen. Reproducirlas en orden de nombre no funciona en una base vacía y, si se forzara, restauraría versiones antiguas y menos seguras de funciones y políticas.
- Por eso hoy **no se puede levantar una copia limpia** del backend. Ejecutar la app en local apunta al servicio real.

## 2. Crear la línea base (una sola vez)

```bash
# Requiere acceso de administrador al proyecto de Supabase (no se copian datos, solo estructura).
SUPABASE_PROJECT_ID=<id de producción> npm run db:baseline
```

Requiere una versión instalada y autenticada de Supabase CLI; el script muestra la versión utilizada. No instala una versión flotante mediante `npx`.

Genera en `supabase/baseline/`:
- `migraciones_aplicadas.txt`: historial registrado en el proyecto enlazado.
- `schema.sql`: tablas, funciones, políticas RLS, triggers y permisos de `public`, `platform_security`, `sharing_security`, `household_integrity` y `finance_receipt_security`.

El archivo solo reemplaza una exportación anterior cuando termina correctamente. No incluye registros de hogares, contraseñas, roles de autenticación, archivos ni configuración de buckets. Debe revisarse antes de usarse.

**No mover el historial ni ejecutar `migration repair` en producción como parte de esta integración.** Una base exportada después de v33 ya contiene esas funciones: volver a aplicar migraciones históricas puede restablecer versiones antiguas. La consolidación del historial requiere un cambio separado, inventario de dependencias, punto de corte exacto y prueba completa en un proyecto aislado. El exportador por sí solo no hace reproducible el backend.

## 3. Proyecto de prueba (staging)

1. Crea un proyecto nuevo en Supabase (plan gratuito sirve), por ejemplo `nuestro-hogar-prueba`.
2. Revisa y restaura una exportación del esquema en el proyecto de prueba, junto con sus dependencias Auth/Storage. Aplica únicamente las migraciones posteriores a su punto de corte. No ejecutar todo el historial actual contra una base vacía.
3. Configura Auth (redirecciones a `http://localhost:5173/nuestro-hogar/` y a la URL de vista previa), SMTP de prueba y Storage (buckets `household-documents` y `finance-receipts`).
4. Despliega la función: `npx supabase functions deploy send-web-push`.
5. Copia `.env.example` a `.env.local` con la URL y la clave publicable **del proyecto de prueba**.
6. Ejecuta los escenarios SQL de `supabase/tests/` en el SQL Editor del proyecto de prueba (todos se revierten).

Regla: ninguna migración se aplica en producción sin haber pasado antes por prueba.

## 4. Tipos generados

```bash
SUPABASE_PROJECT_ID=<id-prueba> npm run db:types
```

Genera de forma atómica `src/lib/database.types.ts` con los tipos reales de tablas y funciones. Para usarlos: `createClient<Database>(url, key)` en `src/lib/supabase.ts`. Así TypeScript avisa si una consulta usa una columna que no existe. Conviene regenerarlos después de cada migración.

## 5. Revisiones automáticas

| Comando | Qué revisa |
| --- | --- |
| `npm run format:check` | Formato uniforme (Prettier 3.8.1, configuración en `.prettierrc.json`). `npm run format` lo corrige. |
| `npm test` | Pruebas unitarias (cálculos, importación, diseño, contraste). |
| `npm run typecheck` / `npm run build` | Tipos de TypeScript y compilación. |
| `npm run test:e2e` | Escenarios de navegador con datos simulados. |

`.github/workflows/quality.yml` corre todo en cada pull request. Las hojas de estilo y la documentación quedan fuera del formateo automático por ahora (las hojas se reorganizan en el sistema de diseño).

## 6. Métricas de uso y errores

La migración `20261018130000_platform_activity_metrics.sql` agrega al panel master la sección **Uso real**:
- Hogares que registraron algo cada semana (últimas 12 semanas): movimientos, ahorros, tareas, eventos o pagos.
- Hogares activos en 30 días, hogares nuevos y errores de la app sin resolver.

Solo cuenta filas por hogar y semana; no lee montos ni descripciones, y los movimientos "Solo yo" no participan. La métrica a vigilar es la primera: si sube semana a semana, la app se está usando de verdad.
