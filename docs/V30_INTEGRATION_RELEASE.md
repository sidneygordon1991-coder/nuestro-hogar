# Integración de Nuestro Hogar v30

Fecha: 17 de octubre de 2026. Base publicada: `b32506f6d76e41b1a054a5fb668e4030b8f5de8a` (v29).

## Procedencia y alcance

Se importó el código de `Nuestro_Hogar_v30_Codigo_Completo.zip`, SHA-256 `4fd20ee6c878746a2a185f354f872a226f9feea5d2e3d3f38d6d32ba15236e40`. Las 285 entradas del inventario coincidieron en tamaño y SHA-256. La importación original quedó conservada en el commit `b65d11fda6002aacf47b4bfa6b029c6349c2b8cd`, árbol `83dd1324961365ee90aa587c3eb7519dee224283`.

Se conservan React, TypeScript, Vite, Supabase, Lucide, Vitest y la PWA. No cambiaron dependencias, migraciones, SQL administrativo, Auth ni políticas RLS. La validación no modifica información financiera de producción.

## Comportamiento integrado

- Inicio con margen disponible, cuentas, presupuesto por rubro, metas, agenda y próximas acciones.
- Navegación lateral en escritorio y controles adaptados al móvil, fondo gris y acabados Verde, Azul, Negro y Morado. La preferencia anterior Tornasol se interpreta como Morado, conforme al paquete.
- Temas claro, oscuro y del sistema; controles de tema junto al hogar.
- Gráfica del saldo registrado y la proyección por quincena o mes. Los ingresos previstos se sitúan al cierre del período como supuesto explicado en la interfaz, no como fechas de cobro confirmadas.
- El margen parte de cuentas líquidas registradas; cuando no existen usa el resultado registrado del mes. Resta compromisos pendientes y ahorro del plan aún por apartar. No incorpora ingresos esperados ni descuenta el presupuesto variable restante.
- Personal es un filtro organizativo. No crea privacidad adicional frente a integrantes que ya tienen permiso de Finanzas. Las metas y alertas siguen siendo del hogar; la interfaz lo explica.

## Ajustes de integración

| Archivos | Corrección |
| --- | --- |
| `src/App.tsx`, `src/Finance.tsx`, `src/lib/paging.ts` | Completar páginas de movimientos, aportes e historiales; dividir consultas de repartos en lotes. Un error en una página invalida el resultado completo. |
| `src/HomeMoneyWorkspace.tsx` | Volver a consultar cuentas después de actualizar el resumen; ocultar margen y gráfica si no se pueden verificar saldos; aclarar el filtro Personal. |
| `src/Finance.tsx` | Ocultar cuentas y patrimonio incompletos, con reintento, cuando falla la lectura de sus saldos. |
| `src/home.css`, `src/refinement.css` | Importes completos sin puntos suspensivos y tarjetas financieras que caben en pantallas de 320 px. |
| `src/lib/shoppingList.ts` | No eliminar listas creadas durante una carrera entre dispositivos, preservando posibles artículos de otros miembros. |
| `src/MealsCenter.tsx` | Precisar el comentario sobre el guardado de ingredientes; no prometer atomicidad que el cliente no puede garantizar. |
| `tests/e2e/v30-integration.e2e.mjs` y pruebas asociadas | Regresiones para actualización de saldos, consultas de más de 1,000 registros, fallos de páginas y reintentos. |

## Validación

La línea base pasó 259 pruebas en 29 archivos. El paquete importado pasó 277 pruebas en 32 archivos. Los ajustes de integración pasaron 279 pruebas en 32 archivos y la compilación de producción.

La suite de navegador incluye navegación de todos los módulos, temas, acabados, permisos de solo lectura, accesibilidad automatizada, formularios sobre la navegación, correcciones de ahorro y recurrentes, errores y recuperación. Sus resultados finales se registran en el PR y en GitHub Actions; las pruebas usan datos sintéticos y un Supabase simulado.

La prueba de ciclo de vida nativo del service worker verificó v29 → v30, eliminación de la caché anterior, conservación de un marcador local y apertura del acceso sin conexión, sin errores JavaScript. Esto comprueba la carcasa PWA; no implica edición financiera sin conexión ni sincronización bancaria.

## Límites y recuperación

No se hizo una auditoría de la configuración viva de Supabase en esta integración. Las pruebas SQL se ejecutan en una base aislada. La comprobación visual usa Chromium y tamaños móviles/escritorio; la revisión en teléfonos físicos sigue siendo una comprobación manual aconsejable.

La creación simultánea de listas desde distintos dispositivos puede dejar una lista adicional; se prioriza preservar datos. El reemplazo de ingredientes sigue siendo una secuencia de operaciones de cliente con error visible, no una transacción de servidor. Estas mejoras futuras requieren un cambio backend separado.

Los commits de importación e integración permiten revertir el frontend sin migrar ni borrar datos. La actualización PWA se activa con el botón «Actualizar ahora» cuando está disponible.
