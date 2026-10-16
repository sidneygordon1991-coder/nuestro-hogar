# Experiencia conectada · PWA v26

Esta entrega construye sobre la PWA v25 y conserva su arquitectura, Auth, reglas de reparto y registros. No incorpora servicios de pago. La auditoría inicial verificó 216 pruebas y 31 escenarios de navegador.

## Funciones y archivos

| Área | Resultado | Archivos principales |
| --- | --- | --- |
| Compras | Listas permite registrar un único gasto por elementos completados y después adjuntar la factura, foto o archivo con el sistema existente. La selección queda fotografiada en datos aunque se limpie la lista. | `ShoppingCheckoutDialog.tsx`, `ListsCenter.tsx`, migración `connected_finance_workflows` |
| Ahorro | Cada meta se vincula a un rubro de ahorro por mes. La barra usa aportes menos retiros de ese mes hasta el corte real; una meta no se cuenta dos veces. | `GoalBudgetLinks.tsx`, `BudgetCategoryProgress.tsx`, `connectedFinance.ts`, `Finance.tsx` |
| Cuentas | Conciliar compara el saldo calculado con el confirmado. Conserva la diferencia y una huella de los registros; rechaza confirmaciones sobre un cálculo desactualizado. No genera ajustes contables. | `AccountReconciliation.tsx`, RPC `get_account_book_state` y `confirm_account_reconciliation` |
| Decisiones | Escenarios de ingreso, retraso, gasto y ahorro adicionales modifican únicamente una proyección hipotética sobre el cálculo existente. | `FinanceSimulator.tsx`, `connectedFinance.ts` |
| Simplicidad | La vista Esencial muestra Inicio, Familia, favoritos y sección actual. Ver todas las secciones amplía el menú. La vista Completa es el valor inicial. Ambas respetan permisos. | `AppearancePanel.tsx`, `appearance.ts`, `AppMenu.tsx`, `DesktopRail.tsx`, `App.tsx` |
| Continuidad | Nuevo movimiento y Agregar rápido —ingreso/gasto— conservan borradores locales durante siete días, por usuario/hogar/formulario. Recuperar es explícito. No hay envío automático al reconectar. Cerrar sesión borra los borradores. | `DraftForm.tsx`, `formDrafts.ts`, `GlobalCommandCenter.tsx`, `Finance.tsx` |
| Guardado seguro | Un identificador estable permite reintentar una solicitud. Cambiar sus datos tras un guardado incierto se rechaza. Se reutiliza `save_finance_transaction`, que crea movimiento, reparto y recurrente de forma atómica. | Migraciones `safe_finance_drafts` y `reuse_atomic_finance_save` |
| Colaboración | Comentarios por movimiento o elemento de lista. Cada autor puede eliminar los propios; acceso determinado por módulo y hogar. Paginación del historial y reintentos con identificador fijo. | `EntityComments.tsx`, `Finance.tsx`, `ListsCenter.tsx`, migración `collaboration_operational_visibility` |
| Master | Última copia de registros, aviso si supera 14 días y errores sin resolver detectados en los últimos siete días. Conserva el requisito master/MFA existente y no añade contenido de documentos a la vista global. | `MasterPanel.tsx`, `platform.ts`, migración `collaboration_operational_visibility` |
| Recuperación | Las seis tablas nuevas entran en el respaldo y su restauración. Los movimientos se recuperan antes que las ocurrencias que los referencian. Las conciliaciones importadas conservan el saldo histórico y se marcan como importadas. | Migraciones `connected_workflow_backup_support` y `connected_backup_completion` |
| Identidad instalada | Casa clara con corazón cálido sobre fondo azul/teal. PNG 192 y 512, variante maskable opaca y Apple Touch de 180. El manifiesto mantiene la identidad, ruta y alcance anteriores. | `public/icon-premium*`, `apple-touch-icon-premium.png`, `manifest.webmanifest`, `index.html`, `sw.js`, `scripts/render-pwa-icons.mjs` |

Los componentes nuevos usan los mismos colores semánticos y cambian con el tema. No hay migraciones destructivas ni modificaciones masivas de registros históricos. Las tablas nuevas tienen RLS; los RPC nuevos son invoker, con búsqueda de esquemas vacía y acceso anónimo revocado. Se agregan índices para las claves foráneas y se separan políticas de lectura y escritura.

## Verificación

- 240 pruebas automatizadas en 27 archivos, compilación TypeScript/Vite de producción y 43 escenarios de navegador cubiertos. La revisión CI ejecuta nuevamente la suite completa.
- El conjunto nuevo verifica respuesta perdida, conservación del identificador tras recarga, espera explícita tras reconexión, ahorro neto por mes, cuentas con datos desactualizados, permisos de lectura, comentarios y metadatos master.
- Vista móvil y escritorio: 320, 390, 768 y 1280 px. Los ensayos existentes recorren todos los módulos en temas claro y oscuro. Axe sin hallazgos graves o críticos en los casos cubiertos.
- Los cuatro PNG tienen dimensiones verificadas. El símbolo principal queda dentro del círculo de seguridad de la variante maskable; los fondos de Android y Apple son opacos.
- `supabase/tests/connected_experience_integration.sql` ejecuta sobre el esquema real usuarios y hogares ficticios dentro de una transacción que revierte. Comprueba reparto exacto, reintentos, cambio de solicitud, precisión de centavos, confirmación desactualizada, lector/otro miembro/externo, archivo, anónimo, respaldo y dos restauraciones consecutivas. Después no quedan identidades de prueba y el conteo original de movimientos se conserva.
- Los siete ensayos de respaldos de archivos existentes verifican bytes, SHA-256, rutas, límites de descompresión, familias distintas y conservación de archivos actuales. Esto es una comprobación del pipeline con respuestas simuladas; no equivale a una recuperación completa de Storage en un teléfono o entorno de desastre real.
- El asesor de seguridad conserva los avisos anteriores: 50 funciones privilegiadas públicas existentes, dos extensiones públicas, una tabla interna con RLS sin política y protección de contraseñas filtradas deshabilitada. Ninguna función pública nueva añade SECURITY DEFINER. Los avisos de rendimiento añadidos durante esta implementación quedaron corregidos; permanecen tres claves foráneas sin índice anteriores y avisos de índices aún no usados.

## Cómo probar

1. Actualizar la PWA desde su aviso. En Personalizar, seleccionar Esencial y elegir favoritos; abrir el menú y Ver todas las secciones.
2. En un hogar de prueba, completar productos de una lista de compras, Registrar gasto, indicar el total real y guardar. Adjuntar un comprobante. Volver a la lista y comprobar su acceso al comprobante y la ausencia de un segundo cargo por los mismos elementos.
3. En Finanzas → Presupuesto, vincular una meta con un rubro de tipo Ahorro. Registrar un aporte y un retiro; revisar el neto del mes.
4. En Cuentas, Conciliar una cuenta con un extracto o efectivo contado. Revisar diferencia e historial. Esta acción no mueve dinero.
5. Abrir Explorar una decisión en el resumen. Cambiar un supuesto y restablecerlo; revisar que los movimientos no cambian.
6. Empezar un movimiento y cerrar la ventana. Abrirla de nuevo y Recuperar borrador. Sin conexión se conserva localmente; después de reconectar se requiere pulsar Guardar.
7. En el detalle de un movimiento o el icono de comentarios de una lista, publicar un texto de prueba. Verificar desde otro integrante autorizado. Eliminar el comentario propio.
8. En master con doble verificación, revisar respaldo y errores de cada hogar. Los archivos adjuntos requieren un paquete de respaldo completo, no solamente la copia de registros.

## Límites y seguimiento

- Las operaciones financieras existentes marcadas Personal siguen definiendo reparto; los integrantes autorizados a Finanzas pueden verlas. Esta entrega no convierte esos registros históricos en privados. Una separación financiera personal verdaderamente privada exige revisar también reportes, búsquedas, respaldos y RPC privilegiados, y sigue como fase independiente.
- Los borradores son texto local del navegador, no una copia cifrada ni sincronizada entre teléfonos. No conservan adjuntos, contraseñas ni formularios de todos los módulos. En un dispositivo compartido se debe cerrar sesión.
- Se registra el total confirmado de la compra. No se infieren precios por producto ni se promete OCR de facturas. Las evidencias y el detalle manual existentes siguen disponibles.
- Faltan observaciones de uso con personas/familias reales y una recuperación de archivos en un entorno aislado de desastre. No se enviaron invitaciones ni correos de prueba.
- La PWA sigue siendo instalable. La actualización del icono del lanzador depende de Android, iOS y el navegador. La prueba automatizada confirma manifiesto y recursos; no prueba el lanzador físico. No se debe borrar información del sitio para forzar la actualización.
- Para volver al frontend v25 se puede revertir el commit de esta entrega; las tablas y los datos nuevos deben conservarse. No eliminar tablas para revertir una presentación.
