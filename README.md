# AB Gestión

CRM de productores de seguros (PAS) y su producción por compañía/ramo/trimestre, con permisos por rol y por equipo ("dupla").

Este ambiente está sembrado con datos de prueba: los productores, teléfonos, mails y organizaciones son registros fabricados, no corresponden a ninguna persona real.

## Stack

Vanilla JS, sin build step. `index.html` carga los scripts como `<script src>` clásicos, mismo scope global. Backend: Supabase (Postgres + Auth), con un Worker de Cloudflare aparte para el alta de usuarios (`worker/`).

```
css/            → estilos
js/app.js       → router y arranque
js/auth.js      → login/logout/sesión
js/permissions.js → reglas de permiso del frontend
js/state.js     → estado global y carga de datos
js/supabase.js  → cliente de Supabase
js/services/    → un archivo por entidad (productores, produccion, usuarios, ...)
js/views/       → un archivo por pantalla (dashboard, productores, ficha, ...)
sql/            → esquema completo, RLS, funciones y permisos (documento de referencia)
worker/         → Worker de Cloudflare para alta/edición/baja de usuarios
tests/          → tests de permisos y chequeo de sintaxis
```

## Modelo de permisos

Cinco roles (Admin, Operaciones, Comercial, Jefe, Observador), con permisos aplicados en dos capas: el frontend decide qué mostrar, pero la autorización real está en la base de datos vía Row Level Security — no depende de la aplicación. El detalle completo (tablas, políticas, funciones, triggers) está en [`sql/2026-09-13-esquema-y-modelo-de-seguridad.sql`](sql/2026-09-13-esquema-y-modelo-de-seguridad.sql).

## Tests

```
npm test        # tests de permisos, concurrencia y modo demostración
npm run check   # sintaxis de todo el JS
```
