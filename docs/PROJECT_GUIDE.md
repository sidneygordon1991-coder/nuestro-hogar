# Nuestro Hogar: proyecto, interfaz y código

Entrega del 15 de octubre de 2026, Guatemala (16 de octubre UTC). Documento preparado a partir del código real. Distingue la versión publicada y la propuesta 2.0, que todavía no se ha desplegado.

## 1. Versión entregada

- Aplicación: https://sidneygordon1991-coder.github.io/nuestro-hogar/
- Repositorio: https://github.com/sidneygordon1991-coder/nuestro-hogar
- Versión publicada: rama `main`, commit `f149832220f64951fce7199d3fc5e96b2625a281`, PWA v21. Su línea base pasó 165 pruebas/20 archivos y build.
- Propuesta: rama `feat/nuestro-hogar-2-premium`, PWA v22 preparada. El identificador exacto del código exportado está en `VERSIONES.txt` dentro del ZIP, para no confundirlo con producción.
- Código de la propuesta: 207 archivos rastreados, 114 bajo `src/`, 52 migraciones SQL y 8 archivos de pruebas SQL manuales. Hay además 13 casos de SQL aislado dentro de la suite automatizada.
- Verificación de la propuesta: **191 pruebas aprobadas en 22 archivos**, **14 escenarios de navegador aprobados** y **compilación de producción aprobada**.
- El `0.1.0` de `package.json` es la versión interna histórica del paquete; no representa la versión del caché PWA.

El ZIP conserva dos carpetas de código: `publicado-v21/` y `propuesta-2.0/`. Incluye esta guía, el PDF visual, el reporte por fases, inventarios y sumas SHA-256. Cada carpeta de código se puede revisar por separado; no se deben mezclar sus dependencias ni sus archivos. No es una copia de los datos personales, los archivos almacenados ni las cuentas de Supabase. No incluye `node_modules`, `dist`, `.git` ni archivos locales de secretos.

## 2. Qué es el proyecto

Nuestro Hogar es una aplicación web progresiva (PWA) para organizar finanzas y actividades de un hogar, con acceso individual y colaboración entre sus integrantes. Una misma cuenta puede pertenecer a más de un hogar. Cada hogar mantiene sus propios datos y permisos. El panel master administra recursos globales mediante operaciones autorizadas por el servidor.

Sigue siendo una PWA: se abre por enlace y se puede instalar desde un navegador compatible, sin generar un APK ni depender de una tienda de aplicaciones. El código incluye la interfaz, la lógica del cliente, las definiciones históricas de la base de datos, la función de notificaciones web y las pruebas disponibles.

## 3. Inventario funcional

| Área | Qué incluye | Archivo principal |
| --- | --- | --- |
| Acceso | Enlace de acceso por correo verificado, reenvío con espera, contraseña existente y recuperación | `src/EmailAuth.tsx` |
| Inicio | Saludo, balance del mes, distribución de ingresos, indicadores, agenda semanal, metas, favoritos y preparación del hogar | `src/HomeDashboard.tsx` |
| Finanzas | Ingresos, gastos, presupuesto, quincenas, reparto, metas, ahorro, recurrentes, cuentas y patrimonio | `src/Finance.tsx` |
| Agenda | Eventos familiares, recurrencias y consulta del calendario | `src/CalendarCenter.tsx` |
| Listas | Compras, tareas y listas compartidas con asignaciones, fechas, cantidades y notas | `src/ListsCenter.tsx` |
| Familia | Nombre del hogar, integrantes, invitaciones, roles, permisos por módulo, perfil y auditoría | `src/FamilyCenter.tsx` |
| Documentos | Bóveda, archivos privados o compartidos, categorías, vencimientos y consulta de adjuntos | `src/DocumentVault.tsx` |
| Comidas | Recetas, planificación de comidas y despensa | `src/MealsCenter.tsx` |
| Mantenimiento | Casa, vehículos y equipos; servicios y programación | `src/MaintenanceCenter.tsx` |
| Planeación | Objetivos del hogar, hitos y seguimiento | `src/PlanningCenter.tsx` |
| Salud del hogar | Diagnóstico financiero explicado, proyecciones, reserva y estado operativo | `src/HouseholdHealthCenter.tsx` |
| Cierre mensual | Revisión del mes, comparación y reporte PDF | `src/MonthlyCloseCenter.tsx` |
| Automatizaciones | Reglas y avisos asociados a actividades del hogar | `src/AutomationCenter.tsx` |
| Respaldos | Exportación, archivos, recuperación y controles de privacidad | `src/BackupCenter.tsx` |
| Diagnóstico técnico | Calidad, integridad y comprobaciones de funcionamiento | `src/DiagnosticCenter.tsx` |
| Administración master | Recursos, cuotas, hogares, membresías y auditoría, con segundo factor | `src/MasterPanel.tsx` |
| Notificaciones | Centro de alertas, lectura, limpieza, preferencias y suscripción web push | `src/NotificationCenter.tsx` |
| Búsqueda y alta rápida | Búsqueda global y creación de gasto, ingreso, tarea, compra, evento, documento y mantenimiento | `src/GlobalCommandCenter.tsx` |

El catálogo habitual contiene 13 módulos, además de Inicio. Acceso, notificaciones, personalización y master son capas adicionales, no otros hogares ni módulos duplicados.

## 4. Cómo está armada la interfaz

### Estructura general

`index.html` contiene el punto de montaje. `src/main.tsx` carga React, inicializa el tema, importa los estilos y registra el service worker. `src/App.tsx` coordina la sesión, la selección del hogar, los permisos, la navegación y la carga de cada módulo.

La navegación usa parámetros de URL y el historial del navegador; no utiliza React Router. Ejemplos:

```text
/nuestro-hogar/
/nuestro-hogar/?tab=presupuesto
/nuestro-hogar/?tab=presupuesto&finance=fortnight
/nuestro-hogar/?tab=familia
/nuestro-hogar/?tab=master
```

Los valores aceptados se normalizan en el cliente. La visibilidad de una pantalla no sustituye la autorización del servidor.

### Escritorio

Desde el diseño de escritorio, una barra lateral (`DesktopRail.tsx`) agrupa accesos del día, del hogar y de los planes. La cabecera muestra el hogar activo y las acciones globales. El contenido usa columnas para aprovechar el espacio: en Inicio, el balance y la agenda comparten la zona principal. El catálogo completo y los favoritos facilitan llegar a los módulos secundarios.

### Móvil

El contenido se organiza en una columna. El menú inferior tiene cinco accesos: **Inicio, Calendario, +, Finanzas y Familia**. El botón central abre Agregar rápido. Las demás áreas se abren desde el menú y los accesos del Inicio. La cabecera reorganiza sus botones según el ancho disponible.

Los formularios largos usan desplazamiento interno y espacio para las zonas seguras del dispositivo. Cuando se abre una ventana, menú o centro de alertas, se ocultan temporalmente el menú inferior y los avisos de instalación/actualización para que no cubran las acciones de guardado. Esta regla es compartida, no una corrección aislada de un formulario.

### Inicio

El orden principal es: saludo; balance y destino del ingreso; indicadores de ingreso, gasto y ahorro; agenda; avisos; progreso de meta; favoritos; catálogo completo y preparación inicial. La preferencia personal permite priorizar la agenda. `BalanceFlow.tsx` visualiza los movimientos registrados; el cierre estimado se presenta por separado.

### Acceso

`EmailAuth.tsx` contiene el formulario y los estados de envío, espera y recuperación. `AuthVisual.tsx` aporta la escena vectorial de hogar conectado. El modo claro/oscuro también se aplica antes de iniciar sesión. **La entrada principal actual es por correo; Google ya no aparece como opción en esta versión.**

### Componentes compartidos

| Elemento | Archivo |
| --- | --- |
| Contenedor, sesión, permisos y selección de hogar | `src/App.tsx` |
| Menú de módulos y cambio de tema | `src/AppMenu.tsx` |
| Barra de escritorio | `src/DesktopRail.tsx` |
| Preferencias de apariencia | `src/AppearancePanel.tsx`, `src/lib/appearance.ts` |
| Iconos detallados de módulos | `src/ModuleIcon.tsx` |
| Iconos de acciones | Biblioteca `lucide-react` |
| Notificaciones | `src/NotificationCenter.tsx`, `src/notifications.css` |
| Ventanas y manejo de foco | `src/lib/useDialogFocus.ts`, reglas comunes en `src/styles.css` |
| Cabecera y guía por módulo (propuesta) | `src/WorkspaceTitle.tsx`, `src/lib/moduleGuides.ts` |
| Foco de búsqueda y menú (propuesta) | `src/lib/useFocusTrap.ts` |
| Estados de carga | `src/ModuleLoading.tsx` y `Suspense` en `App.tsx` |
| Instalación y actualización PWA | `src/PwaInstallPrompt.tsx`, `src/PwaUpdatePrompt.tsx` |

## 5. Finanzas en detalle

`FinanceNavigation.tsx` muestra cinco secciones principales y seis dentro de Más. Al abrir una adicional, el menú mantiene visible el nombre de la sección activa.

| Sección | Identificador | Uso |
| --- | --- | --- |
| Resumen | `summary` | Balance, indicadores, tendencias, distribución y próximos pagos |
| Quincenas | `fortnight` | Del 1 al 15, del 16 al cierre real del mes y visión general |
| Ingresos | `income` | Movimientos recibidos y plan mensual por persona |
| Presupuesto | `budget` | Categorías y montos planeados |
| Movimientos | `transactions` | Consulta, alta, modificación y eliminación de ingresos/gastos |
| Recurrentes | `recurring` | Programaciones, vencimientos, pago y administración |
| Comparación | `comparison` | Comparación de resultados financieros |
| Aportes | `contributions` | Reglas y distribución de responsabilidades del hogar |
| Metas | `goals` | Metas de ahorro e historial editable de aportes |
| Patrimonio | `networth` | Activos, deudas y evolución patrimonial |
| Cuentas | `accounts` | Cuentas y transferencias |

**Aportes de ahorro** se administran en **Más > Metas**. No deben confundirse con la sección **Más > Aportes**, dedicada al reparto entre integrantes.

### Ingresos y quincenas

`MonthlyIncomePlan.tsx` y `src/lib/monthlyIncome.ts` separan lo esperado de lo recibido. Se puede planear cada mes por persona y distribuir el monto entre ambas quincenas. Un cero explícito se conserva como decisión del usuario. El plan no crea ingresos reales.

`FortnightBudget.tsx` y `src/lib/financePeriods.ts` agrupan el ingreso de los integrantes en el período correspondiente. Aplican las reglas elegidas: proporcional, partes iguales, porcentajes personalizados y reglas personales o por categoría. El cierre del mes respeta su número real de días y el arrastre se contempla una sola vez.

`GuidedFortnightClose.tsx` guía la revisión, señala pendientes y guarda una fotografía con una huella de los datos revisados. No paga movimientos ni bloquea el libro financiero por sí mismo.

### Ahorro y recurrentes

- El historial de ahorro permite filtrar por meta/período, cambiar monto, fecha o destino y eliminar con confirmación. Conserva el autor original y actualiza los saldos calculados.
- Editar una repetición actualiza los vencimientos pendientes y ajusta los días inexistentes al último día válido del mes.
- Eliminar una repetición la desactiva y cancela pendientes; conserva pagos anteriores y sus detalles históricos.
- El pago de un vencimiento usa una operación atómica e idempotente en el servidor. Las comprobaciones de concurrencia evitan confirmar un borrador desactualizado.
- La lógica de detalles históricos está centralizada en `src/lib/recurringDetails.ts`.

### Facturas y comprobantes

`TransactionReceipts.tsx` y `src/lib/receipts.ts` permiten adjuntar **PDF, JPG, PNG o WEBP**, con un límite de **15 MiB por archivo**. La evidencia se guarda en el bucket privado `finance-receipts`, vinculada al movimiento. Las fotos pueden optimizarse. Es posible registrar un detalle de compra en texto; no hay una extracción automática de productos garantizada ni una integración bancaria automática. Una falla de adjunto no debe borrar el movimiento financiero.

### Análisis financiero

`FinancialDiagnosis.tsx` y `src/lib/financialDiagnosis.ts` presentan proyección mensual y por quincena, liquidez registrada, reserva declarada, carga de deuda y hasta tres acciones priorizadas, con explicación y datos faltantes. Distinguen movimientos reales, expectativas y compromisos para evitar duplicar importes.

La reserva de emergencia es un dato expresamente declarado, no la suma automática de las cuentas. Su meta puede fijarse de 1 a 12 meses. El histórico muestra tres meses completos y el actual en curso. El cálculo es determinista; no usa una API externa de inteligencia artificial ni representa conciliación con un banco.

## 6. Diseño y estilos

La importación base en `src/main.tsx` sigue este orden:

```text
styles.css > theme-light.css > premium.css > studio.css > experience.css > refinement.css
```

En la versión publicada el orden termina en `experience.css`; la propuesta añade `refinement.css`. Los módulos también cargan hojas propias cuando corresponde. La cascada importa: no basta con editar una regla antigua si otra posterior la reemplaza.

| Archivo | Responsabilidad |
| --- | --- |
| `src/styles.css` | Base, controles, formularios, estructura y reglas compartidas de ventanas/zona segura |
| `src/theme-light.css` | Variables semánticas `--nh-*` y apariencia clara/oscura |
| `src/premium.css` | Tratamiento visual y componentes de la capa premium |
| `src/studio.css` | Composición de Inicio/Finanzas, barra de escritorio y adaptación de pantallas |
| `src/experience.css` | Ajustes visuales, jerarquía, densidad y consistencia compartida |
| `src/refinement.css` | Acabado 2.0: cabeceras, ayudas, tarjetas de compromisos y controles comunes |
| `src/finance-management.css` | Administración de ahorro y recurrentes |
| `src/fortnight-budget.css`, `src/monthly-income.css` | Planificación de quincenas e ingresos |
| `src/FinancialDiagnosis.css` | Presentación del diagnóstico financiero |
| `src/sharing.css`, `src/master.css` | Acceso, colaboración y administración |

Las preferencias incluyen acentos océano/iris/bosque, prioridad balance/agenda, hasta seis favoritos y portada. La apariencia personal se guarda en el navegador con una clave por usuario y hogar; no debe asumirse una sincronización automática entre dispositivos.

Para añadir interfaz, usar las variables de color existentes, mantener etiquetas y estados de carga/error/vacío y probar ambos temas. La navegación local de Finanzas usa `div` con `role="group"`: introducir un `nav` genérico puede activar estilos globales del menú principal. Para corregir botones tapados, revisar contenedores, altura disponible y desplazamiento; subir únicamente el `z-index` de un botón no resuelve los contextos de apilamiento.

## 7. Arquitectura y datos

| Capa | Tecnología | Papel |
| --- | --- | --- |
| Cliente | React 18 + TypeScript | Pantallas, formularios, estado y presentación |
| Herramientas | Vite 6 | Desarrollo y compilación estática |
| Identidad | Supabase Auth | Cuenta, sesión, enlace verificado, recuperación y MFA |
| Base de datos | PostgreSQL en Supabase | Datos de hogares y operaciones de negocio |
| Autorización | RLS, permisos y funciones SQL/RPC | Comprobación del acceso y operaciones sensibles |
| Archivos | Supabase Storage | Documentos, comprobantes y privacidad |
| Actualizaciones | Supabase Realtime | Suscripciones utilizadas por los componentes |
| Avisos web | Edge Function Deno + service worker | Envío y recepción de web push |
| Publicación | GitHub Pages + GitHub Actions | Alojamiento del cliente estático |

No existe una API Node/Express separada en este repositorio. El cliente consulta tablas y llama RPC de Supabase. La Edge Function de push está en `supabase/functions/send-web-push/`; usa configuración privada del servidor y no debe trasladarse al navegador.

Flujo habitual: acceso por correo > sesión > hogares del usuario > hogar activo > permisos > módulo > consulta/RPC bajo RLS > actualización de la interfaz. Los módulos se importan de forma diferida mediante `React.lazy` y `Suspense`.

### Mapa de datos orientativo

| Dominio | Entidades relevantes |
| --- | --- |
| Identidad y colaboración | Usuarios Auth, perfiles, hogares, membresías, `household_member_access`, `household_audit_log` |
| Finanzas | `transactions`, `budget_categories`, `budget_allocations`, `finance_income_plans`, `transaction_splits` |
| Ahorro | `savings_goals`, `goal_contributions` |
| Recurrentes | `recurring_transactions`, `recurring_transaction_occurrences` |
| Patrimonio | `finance_accounts`, `finance_assets`, `finance_transfers`, `finance_net_worth_snapshots` |
| Archivos | `household_documents`, `finance_receipts` y Storage |
| Organización | Listas, eventos, `pantry_items`, `recipes`, `meal_plan_entries`, `maintenance_schedules`, `household_planning_goals` |
| Seguimiento | `finance_fortnight_reviews`, `monthly_household_closures`, `notifications`, `household_backups` |
| Plataforma | Esquema privado `platform_security`: masters, settings, household_controls y audit |

Esta tabla es un mapa de lectura del código, no un volcado completo del esquema activo. Las relaciones y políticas detalladas están en las migraciones SQL.

## 8. Seguridad, master y almacenamiento

Las claves públicas utilizadas por el cliente no conceden administración global. La protección depende de Auth, RLS, permisos y comprobaciones de servidor. Los controles ocultos de la interfaz ayudan a orientar al usuario, pero no sustituyen esa seguridad.

El master se autoriza en el servidor y requiere MFA/TOTP con sesión de segundo factor para sus operaciones protegidas. No se asigna al primer usuario ni se obtiene editando el perfil. La concesión inicial se hace por una operación administrativa fuera de las migraciones; el ZIP no contiene una cuenta master ni códigos de autenticador.

El panel controla cuotas de archivos, máximo de miembros, archivo/reactivación de hogares, membresías y auditoría. Ser master no implica acceso automático a las finanzas de todos los hogares mediante los módulos habituales. La versión actual no ofrece borrado definitivo global de cuentas/hogares ni transferencia de propiedad.

**Referencias configuradas en el código y documentación actual:** base de datos 500 MB; archivos globales 1.000 MB; alta de hogar con 100 MB y 10 integrantes. Las cuotas de hogar admiten 1-1.000 MB y 1-50 integrantes dentro de la capacidad disponible. Se comprueba uso y asignación en servidor. Los avisos se activan al 80% y 95%. Las familias archivadas conservan archivos y cuota.

Estas cifras describen la configuración del proyecto, no una consulta de consumo en vivo ni una garantía permanente del plan del proveedor. Los límites de Supabase, SMTP, transferencia y otros servicios se administran por separado. El master no asigna CPU o RAM del proveedor ni cambia la suscripción. La base de datos guarda filas e índices; Storage guarda los archivos y maneja cuotas separadas.

## 9. Estructura del código

```text
nuestro-hogar/
  src/                         Componentes React, estilos y lógica del cliente
    lib/                       Cálculos, utilidades y 20 archivos de pruebas
  public/                      Iconos, manifest PWA y service worker
  supabase/
    migrations/                52 archivos del historial de esquema y reglas
    tests/                     8 archivos de pruebas SQL
    functions/send-web-push/    Función Deno para notificaciones
  docs/                        Guías históricas de acceso, master, finanzas y diseño
  .github/workflows/            Publicación en GitHub Pages
  .env.example                 Variables públicas de conexión
  package.json                 Dependencias y comandos
  package-lock.json            Versiones resueltas
  vite.config.ts               Base /nuestro-hogar/ y configuración de Vite
  index.html                   Documento inicial
```

Los documentos en `docs/` son guías por función escritas en distintos momentos. Por ejemplo, `GOOGLE_SIGN_IN_SETUP.md` es una referencia histórica: su presencia no significa que el acceso con Google esté habilitado actualmente. Para el flujo actual, leer `EMAIL_SIGN_IN_SETUP.md`.

## 10. Ejecutar el cliente localmente

Usar Node.js 24 y npm para reproducir el entorno del flujo de GitHub Actions. Descomprimir el ZIP, abrir una terminal dentro de la carpeta `nuestro-hogar` y ejecutar:

```bash
npm ci
```

Crear `.env.local` usando `.env.example` como referencia. Configurar:

```dotenv
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICA
```

Después:

```bash
npm run dev
```

Abrir la dirección que muestre Vite, habitualmente `http://localhost:5173/nuestro-hogar/`. La ruta base no es `/`. Para la sesión por correo, la URL local debe estar autorizada en los redirects de Supabase Auth del proyecto que se utilice.

**Conexión existente:** `.env.example` y los valores de respaldo de `src/lib/supabase.ts` apuntan al proyecto existente y contienen una clave pública, no una clave de servicio. Ejecutar el cliente contra ese proyecto trabaja con su backend real y conserva sus permisos. Para una instalación independiente, definir explícitamente las variables de otro proyecto antes de ejecutar o compilar y revisar los valores de respaldo.

Para verificar y preparar producción:

```bash
npm run test
npm run build
npm run preview
```

La compilación genera `dist/`. `npm run preview` sirve para revisar ese resultado, no crea por sí mismo un backend ni publica en GitHub.

## 11. Qué hace falta para una instalación independiente

El ZIP permite reconstruir el cliente. No convierte automáticamente una cuenta Supabase vacía en una réplica completa del servicio actual. Además del código, hay que preparar:

1. Un proyecto Supabase autorizado, con esquema, políticas RLS, funciones/RPC, triggers, permisos y buckets compatibles.
2. Configuración de Auth: correo habilitado, confirmación, Site URL, redirects, plantillas y SMTP. Las credenciales SMTP se guardan en Supabase, no en variables `VITE_*`.
3. Publicación de la función de web push, sus secretos y configuración de envío/programación, si se desean avisos push.
4. Alta administrativa segura de master y configuración de su autenticador.
5. Configuración de hosting/rutas y conexión del cliente al proyecto correcto.
6. Migración separada de datos y archivos, solo si se quiere trasladarlos y con los permisos adecuados.

Los SQL históricos son un historial de desarrollo, no una exportación normalizada del esquema activo. Algunos archivos antiguos comparten prefijos de fecha y tienen dependencias entre funciones. Antes de reconstruir una base vacía, revisar el orden y preparar una línea base comprobada; no asumir que un `supabase db push` directo reproducirá todo. Esta entrega no ejecuta migraciones ni cambia el backend publicado.

Las pruebas SQL manuales contienen escenarios reversibles y deben revisarse en un entorno de prueba con los roles y datos necesarios. No se ejecutaron contra la base de producción para generar este archivo.

## 12. Publicación y PWA

`.github/workflows/deploy-pages.yml` publica desde `main`: descarga el repositorio, instala con `npm ci`, ejecuta pruebas, compila y despliega `dist/` con GitHub Pages. El flujo actual usa Node 24. No es necesario un servidor Node permanente para servir el cliente.

La ruta `/nuestro-hogar/` está coordinada entre `vite.config.ts`, `public/manifest.webmanifest`, `public/sw.js` y las URLs de acceso. Si se cambia de dominio o carpeta, revisar todas esas ubicaciones y los redirects de Auth. No cambiar únicamente `base` en Vite.

`public/sw.js` mantiene el caché de la PWA y atiende push; `PwaUpdatePrompt.tsx` avisa de una versión nueva. La caché permite recuperar recursos de la interfaz, pero **no ofrece una cola general para guardar datos autenticados sin conexión**. Las consultas y cambios de datos dependen de la conexión al backend. Las notificaciones push requieren permisos y soporte del navegador/dispositivo.

## 13. Dónde cambiar cada cosa

| Quiero cambiar... | Revisar primero |
| --- | --- |
| La portada o el balance de Inicio | `HomeDashboard.tsx`, `BalanceFlow.tsx`, `experience.css` |
| El acceso o su escena visual | `EmailAuth.tsx`, `AuthVisual.tsx`, `sharing.css` |
| El catálogo o los favoritos | `lib/appearance.ts`, `AppearancePanel.tsx`, `AppMenu.tsx` |
| La navegación de escritorio/móvil | `DesktopRail.tsx`, `App.tsx`, `studio.css` |
| Colores y contraste | `theme-light.css`, variables `--nh-*`, `lib/themeParity.test.ts` |
| Los accesos de Finanzas | `FinanceNavigation.tsx`, `lib/financeNavigation.ts` |
| La planificación mensual/quincenal | `MonthlyIncomePlan.tsx`, `FortnightBudget.tsx`, `lib/monthlyIncome.ts`, `lib/financePeriods.ts` |
| Ahorro o recurrentes | `Finance.tsx`, `finance-management.css`, `lib/recurringDetails.ts` y RPC SQL |
| El análisis del hogar | `FinancialDiagnosis.tsx`, `lib/financialDiagnosis.ts`, `HouseholdHealthCenter.tsx` |
| Los comprobantes | `TransactionReceipts.tsx`, `lib/receipts.ts`, `lib/photoCompression.ts` |
| El menú de alta rápida | `GlobalCommandCenter.tsx`, reglas comunes en `styles.css` |
| Notificaciones | `NotificationCenter.tsx`, `notifications.css`, función `send-web-push`, `sw.js` |
| Master/cuotas | `MasterPanel.tsx`, `MasterSecurityGate.tsx`, `lib/platform.ts` y migraciones de plataforma |
| Reportes o respaldos | `lib/monthlyPdf.ts`, `MonthlyCloseCenter.tsx`, `BackupCenter.tsx`, `lib/fileBackup.ts` |

## 14. Estado y comprobaciones recomendadas al modificarlo

La carpeta publicada conserva la implementación actual. La propuesta agrega mejoras y una migración preparada, sin aplicarla a producción. Las pruebas automatizadas y la compilación de la propuesta se ejecutaron correctamente. Las pruebas cubren cálculos financieros, quincenas, ingresos, diagnóstico, comprobantes, respaldo, temas, distribución, seguridad de formularios, iconos, estados PWA y detalles de recurrentes, entre otras utilidades. No equivalen a una prueba real de todos los proveedores externos.

Al realizar cambios, comprobar el módulo afectado con edición y solo lectura, ambos temas, anchos móvil/escritorio, formularios con poco alto disponible, estados vacíos/error y concurrencia cuando haya operaciones financieras. Para un cambio de servidor, añadir o ajustar una migración y una prueba SQL reversible; para un cambio puramente visual, no se necesita tocar datos.

El código contiene los recursos y la estructura para seguir evolucionando la aplicación. No incluye sincronización bancaria, OCR garantizado, almacenamiento ilimitado, administración de infraestructura del proveedor ni una réplica de las cuentas o archivos reales.


## 15. Qué cambia en la propuesta 2.0

| Fase | Resultado implementado | Evidencia y límites |
| --- | --- | --- |
| 1. Auditoría | Línea base, módulos, dependencias, políticas y hallazgos | `docs/PREMIUM_2_AUDIT.md`; solo metadatos del servidor |
| 2. Interfaz | Cabeceras y ayudas coherentes en los 13 módulos, formularios y temas | Matriz de 104 combinaciones de módulo/tema/ancho |
| 3. Finanzas | Motor `lib/cashFlow.ts`, reales a la fecha, pendientes por persona y eliminación de doble descuento; libro de retiros preparado | 10 casos del motor y 13 de PostgreSQL aislado; migración sin aplicar |
| 4. Diagnóstico | Mismo cálculo, ahorro neto y acciones sobre margen condicional | 20 pruebas del diagnóstico; no inventa datos ni usa IA externa |
| 5. Experiencia | Correcciones de Listas/Diagnóstico, etiquetas accesibles, foco y orientación para uso individual | Pruebas de ventanas a 320 x 640, teclado y guardado |
| 6. Calidad | Suite Playwright, revisión de pull requests, bibliotecas separadas y PWA v22 preparada | 191 pruebas, 14 escenarios de navegador y build; falta integración del SQL con backend completo |

### Retiros de ahorro: preparados, todavía sin activar

La migración `20261016052021_savings_ledger_withdrawals.sql` conserva los aportes existentes y permite movimientos negativos como retiros. El servidor bloquea por meta, impide sobregiros por fecha y protege también ediciones o eliminaciones de aportes que financian un retiro posterior. Usa funciones con permisos del invocador y reintentos idempotentes.

El cliente pregunta si esa capacidad existe antes de mostrar Retirar. Si la migración no se ha aplicado, sigue permitiendo aportes y oculta la nueva opción. El retiro libera ahorro reservado y no crea un ingreso, gasto o transferencia bancaria. Si no existe presupuesto de ahorro positivo, no inventa una obligación de reponer lo retirado.

Las pruebas se ejecutaron en PostgreSQL aislado con permisos de prueba; no certifican el comportamiento de todos los triggers y RPC del backend real ni concurrencia entre conexiones. La activación requiere una prueba de integración y autorización. Las instrucciones están en `docs/PREMIUM_2_RELEASE.md`.

### Correcciones de consistencia

Inicio, Finanzas y Salud usan `buildCashFlow`. El motor suma en centavos, excluye movimientos futuros de cifras reales, conserva esos movimientos en la consulta, usa los planes mensuales actuales y calcula pendientes por persona. Para cada categoría toma el mayor entre su presupuesto pendiente y los recurrentes pendientes, evitando descontar ambos por separado.

Los datos tardíos de un hogar anterior no sustituyen los del hogar activo. Si falla la carga del resumen, se muestra un error con reintento; si falla la lista de hogares, no se invita a crear otro como si no existieran. Los borradores de ahorro se conservan cuando falla el guardado.

### Seguridad y pendientes reales

La revisión confirmó RLS en las 48 tablas públicas y las 4 tablas de plataforma, y falta de ejecución anónima para las RPC sensibles seleccionadas. El asesor conserva avisos sobre 50 funciones privilegiadas y dos extensiones en `public`; requieren revisión individual, no una sustitución masiva que pueda romper permisos. No se presenta el proyecto como certificado o libre de toda vulnerabilidad.

En Finanzas, **Personal define reparto y propiedad; no oculta el registro a otros integrantes que tienen acceso a ese módulo**. Los documentos privados sí conservan su aislamiento. Una privacidad financiera por registro debe diseñarse de forma completa, incluyendo RPC, búsquedas, cierres y respaldos; no se simula con un filtro de pantalla.

Para reproducir las pruebas de navegador:

```bash
npm ci
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
```

Se usa información ficticia interceptada. El flujo de revisión en GitHub no publica la app. La publicación desde `main` y la migración se mantienen pendientes de aprobación; no se modificaron registros reales.
