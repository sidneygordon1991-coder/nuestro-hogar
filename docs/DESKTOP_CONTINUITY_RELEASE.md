# Espacio de escritorio y continuidad · PWA v27

## Correcciones

- `src/studio.css`: a partir de 1100 px, el shell usa todo el ancho disponible y la barra lateral queda a 18 px del borde. Se elimina el máximo de 1510 px y el desplazamiento que centraba la barra. Se conservan el ancho del menú, el espacio reservado para él y los márgenes interiores de las tarjetas. La distribución móvil sigue usando sus reglas actuales.
- `src/App.tsx`: la consulta de hogares depende de la identidad de la cuenta, no del objeto completo de sesión. Se sigue almacenando la sesión actualizada y se mantiene la renovación automática de Supabase. Confirmar la misma cuenta al recuperar foco, renovar el token o actualizar el usuario ya no activa el indicador global que desmontaba el módulo y sus formularios.
- `public/sw.js`, `src/lib/release.test.ts`: caché v27 para distribuir la corrección a las instalaciones existentes. La identidad y los iconos de v26 se conservan.

No se cambia la lógica de Auth, RLS ni base de datos. Cambiar realmente de cuenta sigue consultando sus hogares y reemplazando la interfaz anterior. Cerrar sesión sigue limpiando los borradores. La actualización manual de versión desde su aviso puede recargar la página deliberadamente.

## Verificación

- 240 pruebas automatizadas y compilación TypeScript/Vite aprobadas antes de la publicación.
- `tests/e2e/desktop-continuity.e2e.mjs`: seis casos nuevos aprobados. Comprueban en 390 y 1920 px eventos SIGNED_IN, TOKEN_REFRESHED y USER_UPDATED sin remontar el formulario ni consultar de nuevo los hogares. Se prueba además la recuperación real por visibilitychange a través del SDK instalado, la conservación de un pendiente escrito, cierre de sesión y cambio a otra cuenta.
- Los 14 módulos revisados en ambos temas ocupan un shell de 1920 px, con barra lateral alineada y sin desbordamiento. Se verifica también 2560 px y regreso a 390 px sin menú lateral ni espacio reservado de escritorio.
- El resto de la suite de navegador se ejecuta nuevamente para detectar cambios de disposición, formularios, foco, temas y finanzas. La revisión CI vuelve a ejecutar toda la suite.

## Cómo validar

Actualizar la app desde el aviso de versión. En escritorio, abrir Inicio, Finanzas y Agenda y comprobar que el contenido ocupa la ventana. En móvil, verificar la distribución habitual. Escribir un movimiento o pendiente sin guardarlo, cambiar de pestaña o aplicación y volver varias veces: deben seguir presentes el módulo y el texto. Comprobar por separado un cierre de sesión y un cambio de cuenta.

Esta corrección evita reinicios de la interfaz causados por notificaciones de la misma sesión. No puede impedir que el sistema operativo descarte por completo una aplicación o pestaña por falta de memoria; en ese caso se vuelve a cargar el documento y se mantienen los borradores locales compatibles.
