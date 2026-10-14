# Administración global de Nuestro Hogar

El acceso master es independiente de los roles de una familia. La navegación lo muestra únicamente a una cuenta autorizada por el servidor. Ruta: `?tab=master`.

## Recursos del plan gratuito

- Base de datos: referencia configurada de 500 MB; incluye tablas, índices y datos internos de Supabase. El panel muestra consumo global, no una estimación de base de datos por familia.
- Archivos: límite de aplicación de 1.000 MB. Supabase aplica sus propias cuotas de plan y transferencia por separado.
- Nueva familia: 100 MB de archivos y hasta 10 miembros, incluido el propietario.
- El master puede cambiar la cuota entre 1 y 1.000 MB y el máximo de miembros entre 1 y 50. No se permite bajar por debajo del uso o membresías actuales ni asignar cuotas cuya suma supere el límite global.
- Las familias archivadas conservan su cuota y archivos. Reducir su cuota libera asignación, siempre respetando sus archivos existentes.
- Una nueva familia necesita 100 MB sin asignar; si no hay capacidad, el servidor devuelve un mensaje para contactar al master.
- Las cuotas de archivos abarcan `household-documents` y `finance-receipts`. El consumo global contabiliza todos los buckets.
- Se avisa al llegar al 80% y al 95%. Cada archivo conserva el límite de 15 MiB establecido en los buckets.
- Las subidas incluyen una consulta previa de disponibilidad y un contador atómico del servidor que controla el tamaño final de Storage, incluso si dos subidas compiten por el mismo espacio.

El panel no modifica la suscripción ni permite asignar CPU, RAM o transferencia de Supabase. Esos recursos los administra el proveedor. No cambia las condiciones de pausa ni los respaldos del plan gratuito.

## Acciones

Configurar una familia permite ajustar recursos, archivarla en modo consulta y reactivarla. Administrar un miembro permite cambiar su rol o retirar su acceso al hogar. Se protegen el propietario y las cuentas master. Cada cambio exige el nombre exacto de la familia y un motivo que queda en el registro administrativo.

Archivar no elimina registros ni archivos. Retirar una membresía no borra la cuenta de autenticación ni sus registros históricos. Esta versión no ofrece eliminación definitiva de hogares o cuentas, transferencias de propiedad ni borrado global de archivos.

## Seguridad

La tabla de masters, configuraciones y auditoría viven en `platform_security`, un esquema privado, con RLS y sin acceso directo de clientes. Los RPC públicos son `SECURITY INVOKER`; llaman implementaciones privadas que comprueban la cuenta master contra la tabla del servidor, la confirmación de correo y el bloqueo de la cuenta. Ningún dato editable del perfil otorga ese acceso. No se incluye una clave de servicio en el navegador.

Ser master no incorpora automáticamente a una familia ni permite consultar sus finanzas a través de los módulos normales. Las operaciones globales son específicas y comprobadas. Los miembros mantienen el aislamiento por hogar.

El alta inicial de la cuenta master se realiza mediante una operación administrativa fuera de las migraciones. Las migraciones no contienen IDs o correos de cuentas reales ni conceden acceso automáticamente al primer usuario registrado.

## Validación

`supabase/tests/platform_master_permissions.sql` crea fixtures sintéticos y revierte todo al finalizar. Comprueba autorización, escalada por metadata, permisos de tablas privadas, aislamiento, confirmaciones, protección del propietario, cuotas asignadas y reales, límites de miembros y unión mediante RPC, archivado, restauración, revocación, integridad financiera y auditoría. La prueba de comprobantes se vuelve a ejecutar para comprobar recuperación y privacidad.

`npm test` y `npm run build` validan cliente, presentación y compilación. La revisión visual usa datos ficticios interceptados, sin iniciar sesión en una cuenta real, en ambos temas y anchos de 360, 390 y 1280 px. Los cambios de recursos reales deben validarse desde la sesión del propietario.
