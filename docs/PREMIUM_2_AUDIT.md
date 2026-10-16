# Nuestro Hogar 2.0: auditoría y registro de validación

## Línea base

16 de octubre de 2026 UTC. Rama `feat/nuestro-hogar-2-premium`, origen `f149832220f64951fce7199d3fc5e96b2625a281`, árbol `4ca693019260e292605d8520181948bcfe0b1eb9`. Antes de modificar: árbol limpio, 165 pruebas/20 archivos aprobados y compilación Vite 6.4.4 correcta. React 18, TypeScript, Supabase JS 2.117.3 fijado, Lucide, Vitest y PWA v21. No hay API Node independiente ni React Router.

## Hallazgos comprobados en el código

| Prioridad | Hallazgo | Consecuencia | Corrección prevista |
| --- | --- | --- | --- |
| Alta | Inicio usa referencias antiguas de ingreso, mientras Finanzas admite planes por mes/persona | El cierre mostrado puede diferir entre módulos | Compartir cálculo de compromisos y planes mensuales |
| Alta | Inicio y el resumen de Finanzas suman movimientos futuros como reales; Salud los excluye | Balance y ahorro inconsistentes para la misma fecha | Separar registrado a la fecha de movimientos futuros visibles |
| Alta | Proyección de Inicio/Finanzas suma recurrentes variables además del presupuesto variable pendiente | Un compromiso puede descontarse dos veces | Máximo entre pendiente y presupuesto por categoría, como Salud |
| Alta | Las respuestas de datos/permisos en App no están ligadas a una generación del hogar/sesión | Una respuesta tardía puede reemplazar la vista actual | Invalidar respuestas anteriores y remontar estado por hogar/usuario |
| Media | Varias consultas fallidas se convierten en listas vacías/cero en el resumen | Un error puede parecer ausencia de movimientos | Estado explícito de error y reintento; no mostrar cero como dato verificado |
| Media | Componentes de sección, estados vacíos y ayudas están implementados de forma distinta | Densidad, lectura y orientación variables entre módulos | Componentes y estilos compartidos con verificación en todos los módulos |
| Media | El alta de ahorro borra el borrador antes de conocer el resultado | Una falla obliga a escribir el importe otra vez | Conservar importe y validar envío con fecha explícita |
| Pendiente de servidor | Ahorro admite importes positivos; no hay retiro explícito | No debe simularse un retiro como ingreso ni borrar historia | Requiere operación de libro validada y migración compatible antes de habilitarse |

## Superficie de módulos examinada

Se revisaron el shell y catálogo, Inicio, las once secciones de Finanzas, Agenda, Familia, Listas, Comidas, Documentos, Mantenimiento, Planeación, Salud, Cierre mensual, Automatizaciones, Respaldos, Diagnóstico, master, acceso, notificaciones, personalización y ventanas compartidas. Existe un contrato de colores semánticos `--nh-*` y pruebas de paridad claro/oscuro. La mejora lo amplía y conserva; no reemplaza la arquitectura.

## Seguridad y servicio

Se consultaron únicamente metadatos/políticas y el asesor de seguridad; no se leyeron registros de usuarios ni se modificaron datos reales. Se verificaron las políticas de Finanzas, documentos privados, comprobantes y membresías. Las claves del cliente son públicas. La función push usa credenciales únicamente en servidor. El acceso master y MFA siguen comprobándose en servidor.

El asesor informa 50 funciones `SECURITY DEFINER` públicas ejecutables por usuarios autenticados, dos extensiones en `public` (`pg_net`, `pg_trgm`) y una tabla interna de solicitudes con RLS sin políticas (denegación por defecto). Un aviso de función privilegiada no demuestra por sí mismo una fuga: requiere revisar permisos y controles de cada función antes de moverla o reemplazarla. No se cambian masivamente funciones ni políticas en producción como parte de una mejora visual.

Referencias de revisión: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable y https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public . El changelog revisado anuncia cambios TLS para clientes antiguos; no requiere cambiar las APIs del cliente React actual.

## Alcance de la validación

Las verificaciones de navegador usarán hogares y usuarios ficticios con peticiones interceptadas. Ningún resultado de una prueba interceptada se presentará como validación de escritura real o aislamiento real del servidor. Las futuras migraciones se prepararán y probarán por separado, sin aplicación automática a producción. Las pruebas SQL existentes y la inspección de RLS no sustituyen una prueba completa de un backend nuevo.

## Registro de fases

1. Auditoría: línea base y hallazgos documentados; rama creada.
2. Interfaz: `WorkspaceTitle.tsx`, `lib/moduleGuides.ts`, `refinement.css`, importación en `main.tsx`, cabeceras de los 13 módulos y contrato de temas. Pruebas de esta fase: 166 unitarias y compilación aprobadas. Navegador con datos ficticios: 13 módulos por 2 temas por 4 anchos (320/390/768/1440), ayudas desplegables, sin desbordamientos ni errores JS. Revisión visual de Documentos móvil y Planeación escritorio. No cambió el esquema. La prueba de anchos no implica revisar manualmente cada control.
3. Finanzas: pendiente.
4. Diagnóstico: pendiente.
5. Resto de módulos: pendiente.
6. Integración y entrega: pendiente.
