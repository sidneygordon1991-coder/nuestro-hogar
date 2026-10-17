# Integración de Nuestro Hogar v31

Fecha: 17 de octubre de 2026. Base publicada: `c777bda1066dfa41f4b27793ec64834ed073a917` (v30).

## Procedencia

Paquete: `Nuestro_Hogar_v31_Codigo_Completo.zip`. SHA-256: `217fd3a1fdbc22edd7f9ac86b5683c4ffaf4b47584f7b187a971c7d3f71e9b2e`. Las 325 entradas de su inventario coinciden en tamaño y SHA-256; el propio inventario es el archivo 326. El paquete deriva de v29 y contiene el rediseño v30. Se integró comparando con el paquete v30 original y la v30 publicada, conservando las correcciones de integración posteriores.

No cambiaron dependencias, claves públicas, Auth ni datos históricos. Se agregan cuatro migraciones y se actualiza `send-web-push`, conservando la verificación JWT existente y la autorización interna del despachador.

## Funciones

Días de pago por persona, orientación diaria del margen, registro rápido, moneda original en dólares, tarjetas de crédito, movimientos privados «Solo yo», liquidaciones entre integrantes, ritmo de metas, plan de deudas, importación CSV, alertas, ocultar montos, ejemplo ficticio y resumen compartible de quincena. Descripción funcional: [NUEVAS_FUNCIONES_V31.md](NUEVAS_FUNCIONES_V31.md).

«Personal» sigue siendo un filtro de propiedad/reparto. «Solo yo» usa otra tabla con RLS por dueño; no entra en los totales, alertas, reportes ni respaldos del hogar. El usuario necesita permiso de edición de Finanzas para escribir, incluso mediante API directa; un hogar archivado queda en solo lectura. Al salir del hogar se eliminan sus movimientos privados, conforme al diseño del paquete. Los administradores del proyecto de base de datos conservan sus privilegios técnicos.

Los importes registrados siguen en GTQ. El dólar usa un tipo de cambio configurado por el hogar, no una cotización bancaria en vivo. El cálculo diario, el plan de deudas y las proyecciones dependen de los registros y supuestos visibles de la aplicación. Las liquidaciones cierran saldos de reparto sin crear ingresos, gastos ni movimientos bancarios adicionales.

## Correcciones sobre el paquete

| Archivos | Resultado |
| --- | --- |
| `src/App.tsx` | Lectura agregada validada completa; fallback solo cuando falta la función del backend. Un fallo real no sustituye el resumen con cifras incompletas. El fallback conserva la paginación de v30. |
| `src/Finance.tsx`, `src/lib/paging.ts` | Se conservan consultas completas, lotes de repartos y ocultamiento de cuentas/patrimonio si falla una página. |
| `src/HomeMoneyWorkspace.tsx`, `src/home.css`, `src/refinement.css` | Se conservan actualización de saldos, errores explícitos e importes completos en móvil y escritorio. |
| `src/lib/shoppingList.ts` | Una carrera entre dispositivos no elimina listas ni sus posibles artículos. |
| `src/ImportStatement.tsx`, cuarta migración | CSV en bloques atómicos de 100 mediante `import_finance_transactions_once`, reutilizando el motor de movimientos y sus repartos. IDs estables permiten reintentar una respuesta perdida sin duplicar el bloque. Se exige completar la verificación de duplicados antes de importar. |
| `src/GlobalCommandCenter.tsx` | Un ID privado ya existente solo se confirma como guardado si los datos coinciden con el movimiento recuperado bajo RLS. |
| `src/FortnightRecap.tsx` | Comparativos de quincena paginados sin cortar movimientos o aportes. |
| `src/lib/currency.ts`, primera migración | Redondeo decimal por enteros y validación SQL de la equivalencia USD/GTQ; los importes originales no pueden contradecir el saldo registrado. |
| Primera migración | Lectura privada por dueño y políticas separadas de escritura que también respetan permisos y archivo del hogar. |

## Validación

La línea base publicada pasó 279 pruebas en 32 archivos. La integración pasó 351 pruebas en 39 archivos y la compilación de producción. El resultado final de las pruebas de navegador queda en el PR y en GitHub Actions.

Los 15 archivos de escenarios SQL se ejecutaron sobre PostgreSQL aislado (PGlite), reconstruyendo el esquema, funciones, RLS, triggers y permisos vigentes mediante metadatos de solo lectura. Se añadieron únicamente identidades, hogares y archivos ficticios. No se copiaron movimientos, archivos, usuarios ni configuraciones privadas reales. Pasaron los escenarios de privacidad entre miembros, restricciones de solo lectura, alertas, respaldos, master/MFA, comprobantes, ahorros, quincenas, USD, bloques CSV y recuperación.

La prueba nativa de service worker verificó v30 → v31, limpieza de caché anterior, conservación de un marcador local y acceso a la carcasa sin conexión, sin errores JavaScript. La PWA no ofrece sincronización bancaria ni promete edición financiera completa sin conexión. La revisión en teléfonos físicos sigue siendo manual.

## Publicación y recuperación

1. Aprobar las comprobaciones automáticas de la rama.
2. Aplicar las cuatro migraciones nuevas en el orden indicado en la documentación funcional; no volver a ejecutar el historial anterior sobre producción.
3. Actualizar `send-web-push` conservando `verify_jwt=true`.
4. Verificar esquema, RLS, permisos y advisors; publicar el frontend desde el PR y comprobar sus archivos públicos.

La estructura es aditiva y compatible con el frontend v30. Si hay que revertir la interfaz, puede publicarse el commit v30 sin eliminar tablas, columnas ni registros nuevos. No borrar tablas privadas, liquidaciones o columnas de moneda al recuperar la versión anterior. Para pausar solo las nuevas alertas, usar el SQL de recuperación adjunto: restaura las dos funciones que las invocan y mantiene los filtros de permisos y las protecciones de privacidad.

Los avisos previos de advisors (extensiones en `public`, funciones privilegiadas intencionalmente invocables y RLS sin políticas en el registro interno de idempotencia) se comparan con la revisión posterior. No se cambian permisos ajenos al alcance para silenciarlos.
