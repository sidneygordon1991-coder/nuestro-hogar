# Cabecera integrada · PWA v25

## Cambios

El contexto del hogar y el encabezado del módulo se presentan en una única cabecera. El selector de familia conserva el nombre completo y el tema a su lado, con una fecha breve y la fecha completa disponible como descripción. El título del módulo, su icono, Guía rápida y las acciones propias aparecen inmediatamente debajo. La descripción se conserva dentro de la guía desplegable.

Se integraron Finanzas, Agenda, Familia, Listas, Documentos, Comidas, Mantenimiento, Planeación, Salud, Cierre mensual, Automatizaciones, Respaldos y Diagnóstico. Inicio incorpora su saludo en la misma cabecera. La cabecera se desplaza con la página y las acciones del módulo conservan sus manejadores y estado originales.

En móvil quedan visibles menú, búsqueda y alertas. La personalización se abre desde el menú o Inicio; Familia conserva el acceso a Mi perfil. En escritorio también se mantiene el avatar y la barra lateral. Agregar rápido sigue en la navegación inferior y en la barra lateral. La pantalla master mantiene su flujo independiente de acceso y MFA.

## Implementación

- `src/WorkspaceHeading.tsx`: contexto y portal React para ubicar la fila del módulo en la cabecera sin trasladar su lógica de negocio. Mantiene una presentación local cuando se utiliza sin el contexto del shell.
- `src/WorkspaceTitle.tsx`: título compacto y ayuda desplegable sin eliminar explicaciones.
- `src/App.tsx`, `src/AppMenu.tsx`, `src/GlobalCommandCenter.tsx`, `src/main.tsx` y `src/workspace-header.css`: composición de cabecera, accesos, etiquetas accesibles y estilos con la paleta compartida.
- Los 13 módulos y `src/HomeDashboard.tsx` usan la fila reutilizable. El lienzo de Inicio adapta las filas de la agenda para conservar la preferencia Agenda primero sin espacios vacíos ni solapamiento.
- `tests/e2e/workspace-header.e2e.mjs` verifica la integración. El contrato de temas incluye la nueva hoja; `public/sw.js` y la prueba de versión avanzan a v25.

## Verificación

- Línea base: 215 pruebas aprobadas antes de modificar.
- Compilación de producción y resultado final de 216 pruebas en 24 archivos aprobados.
- 31 escenarios de navegador aprobados, incluidos los 27 existentes. Los nuevos comprueban las cabeceras de los 13 módulos, nombres largos, cambio de hogar, tema inmediato, guías, acciones que abren formularios, acceso a personalización y distribución Agenda primero.
- Anchos de 320, 390, 768 y 1280 px, con una comprobación adicional a 1100 px para Agenda primero. Sin desbordamiento horizontal en los casos cubiertos. Axe sin hallazgos críticos o graves en las pantallas revisadas. Revisión visual del encabezado en ambos temas.
- En el mismo caso sintético de Finanzas, a 390 px el selector mensual pasa de comenzar aproximadamente en 422 px a 154 px: se recuperan unos 268 px para el contenido. La ganancia real varía según el nombre del hogar y el título/acciones del módulo.

## Alcance y prueba manual

No se modifican consultas, registros reales, esquema, Auth, RLS, permisos ni reglas financieras. No hay nuevas dependencias ni recursos de pago. Los ensayos de interfaz usan respuestas sintéticas. Nombres y títulos largos se ajustan a varias líneas para mantenerlos legibles; abrir Guía rápida amplía la cabecera deliberadamente.

Actualizar la PWA, recorrer los módulos y comprobar el selector de hogar, tema, búsqueda y alertas. Abrir y cerrar una guía. Probar una acción propia, por ejemplo Movimiento o Mi perfil, y comprobar que el formulario y su botón Guardar siguen accesibles en móvil. Usar un hogar de prueba para guardar datos ficticios.
