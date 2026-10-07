# Nuestro Hogar

PWA familiar construida con React + TypeScript + Supabase.

## Funcional en esta V1
- Registro e inicio de sesión con Supabase Auth.
- Crear un hogar o unirse con código de invitación.
- Dashboard responsive estilo app móvil.
- Listas compartidas.
- Calendario familiar.
- Presupuesto: ingresos, gastos y balance.
- Área familiar con código de invitación.
- RLS por hogar en Supabase.

## Ejecutar localmente
1. `npm install`
2. Copia `.env.example` a `.env.local` si deseas manejar las variables localmente.
3. `npm run dev`

## Build
`npm run build`

El proyecto usa únicamente la publishable key en el frontend. La autorización real está protegida por Row Level Security en Supabase.
