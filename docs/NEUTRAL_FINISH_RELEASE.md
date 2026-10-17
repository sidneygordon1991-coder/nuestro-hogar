# Nuestro Hogar v29 — Acabados neutros y móvil compacto

## Resultado

La interfaz adopta las referencias compartidas: fondo gris común, tarjetas claras u oscuras según el tema, barra lateral de color profundo y acentos coordinados en acciones, gráficos y tarjeta principal. Personalizar ofrece Azul, Verde, Grafito y Tornasol, además de conservar Lavanda para las preferencias existentes. Cada acabado tiene vista previa antes de guardarlo. La elección permanece separada por cuenta, hogar y dispositivo; el interruptor de día/noche continúa junto al nombre del hogar.

En móvil se sustituye el encabezado extenso por un saludo compacto, se reúnen ingresos, compromisos y ahorro neto en la tarjeta del mes y se simplifican espacios e iconos. Registrar queda sobre una navegación inferior más delgada. Ambos se retiran cuando una superposición necesita ese espacio. Los formularios mantienen sus protecciones de Guardar. En escritorio las cifras disponen de mayor ancho dentro de sus tarjetas.

La gráfica ajusta su viewBox al ancho real para conservar etiquetas legibles. Ingresos y proyección se despliegan bajo el gráfico mediante un control accesible. Las quincenas, los enlaces a reglas de aportes, el cálculo del margen y los controles de presupuesto, cuentas, metas y agenda permanecen disponibles. El resumen utiliza un símbolo Q estable y conserva los centavos. Los avisos de presupuesto siguen usando amarillo y rojo con independencia del acabado elegido.

## Archivos modificados

| Archivos | Cambio |
| --- | --- |
| `src/theme-light.css`, `src/studio.css` | Superficies neutras y cinco paletas centralizadas; elimina definiciones de acento competidoras. |
| `src/neutral-finish.css`, `src/main.tsx` | Acabados, tipografía, tarjetas, selector, vista previa y adaptación móvil. |
| `src/lib/appearance.ts`, `src/AppearancePanel.tsx` | Catálogo tipado, compatibilidad de preferencias y selección guardada por identidad existente. |
| `src/DesktopRail.tsx` | Iconos Lucide de trazo uniforme en las cinco áreas principales. |
| `src/HomeDashboard.tsx`, `src/HomeMoneyWorkspace.tsx` | Encabezado compacto, cifras reutilizadas dentro de la tarjeta móvil, detalles desplegables y gráfica adaptable. |
| `src/lib/money.ts` | Formato visual Q sin depender del código de moneda elegido por Android. |
| `src/lib/appearance.test.ts`, `src/lib/money.test.ts`, `src/lib/themeParity.test.ts` | Compatibilidad, centavos, colores semánticos, contraste y superficies neutras. |
| `tests/e2e/neutral-finish.e2e.mjs`, `tests/e2e/premium.e2e.mjs` | Nuevos acabados y personalización; adaptación de comprobaciones al detalle desplegable. |
| `public/sw.js`, `src/lib/release.test.ts` | Actualización PWA v29. |

## Verificación

- Base publicada: commit `63a5211`, v28. Trabajo en `feat/neutral-palettes-mobile-v29`.
- `npm test`: **259 pruebas unitarias/SQL correctas**, 29 archivos.
- `npm run build`: TypeScript y compilación de producción correctos.
- Navegador: **67 escenarios verificados**. Una ejecución completa aprobó 65; dos comprobaciones nuevas confundían una lectura RPC de permisos master con una escritura. Se corrigió la clasificación de esa lectura y ambos escenarios aprobaron en su repetición específica. La validación de CI vuelve a ejecutar la suite completa antes de integrar.
- Las comprobaciones existentes recorren los módulos y formularios en claro/oscuro, navegación, permisos, cambios de hogar, aislamiento de respuestas tardías, ingresos futuros, gastos, ahorros, recurrentes, comprobantes y continuidad al volver a la pestaña.
- Las comprobaciones nuevas recorren cinco acabados por dos temas, 320/390/768/1440 px, fondo neutro constante, cifras conservadas, encabezado compacto, ausencia de desbordamiento, posición de Registrar, acceso a controles, vista previa, guardado, recarga y cambio de tema. Axe no detectó incidencias serias o críticas en las pantallas cubiertas. Los contrastes de texto y extremos de gradientes se comprueban además en los tests de paleta.
- Revisión de capturas de móvil y escritorio con datos sintéticos. No se utilizaron registros reales para las pruebas.
- PWA nativa: transición v28 → v29 mediante Actualizar ahora; caché anterior retirada, marcador local conservado, pantalla de acceso disponible sin conexión y cero errores JavaScript.
- `git diff --check`: correcto.

## Límites y reversión

No hay cambios de esquema, Auth, RLS ni datos financieros. Se conservan las reglas de cálculo; el cambio de formato solo afecta la presentación. El acabado se guarda en este dispositivo y no se sincroniza entre navegadores. La comprobación en teléfonos físicos continúa como validación manual de uso; las pruebas automatizadas emulan sus tamaños.

El acceso financiero continúa con los permisos actuales del hogar. La privacidad financiera individual completa y las conexiones bancarias no forman parte de esta mejora. Para revertir, se puede revertir el cambio de interfaz y publicar un nuevo número de caché del worker; no requiere recuperación de datos.
