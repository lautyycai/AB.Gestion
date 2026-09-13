# Cabeceras de seguridad — configuración de Cloudflare

Estado al 2026-09-11. Este archivo es la fuente de verdad de qué cabeceras
devuelve el sitio y por qué. **Se configura a mano en el panel de Cloudflare**,
igual que el Worker: si tocás algo allá, actualizá esto.

Existe por dos motivos. Uno, que la configuración no viva solo en la cabeza de
alguien. Dos, que ante una revisión externa se pueda mostrar la intención
documentada y no solo el resultado.

## Por qué

GitHub Pages no permite definir cabeceras propias. Como el tráfico pasa por el
proxy de Cloudflare, se agregan ahí, en el borde, sin tocar el código ni volver
a publicar. Son reversibles en un clic.

Antes de esto el sitio no devolvía **ninguna** cabecera de seguridad, que es lo
primero que mide cualquier escáner público.

---

## 1 · Las que se agregan

`Rules → Transform Rules → Modify Response Header → Create rule`
Expresión: aplicar a todo el tráfico. Acción **Set static** para cada una.

### Content-Security-Policy

Es la única que puede romper la aplicación, así que **se despliega en dos pasos**
(ver más abajo). Valor, en una sola línea:

```
default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://mgcrhcmpmqukclvjztmx.supabase.co wss://mgcrhcmpmqukclvjztmx.supabase.co https://openit.lautibagnato.workers.dev; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests
```

De dónde sale cada permiso, verificado contra el código y no supuesto:

| Directiva | Por qué ese valor |
|---|---|
| `script-src 'self' https://cdn.jsdelivr.net` | Lo único externo que se ejecuta es la librería de Supabase. **No lleva `'unsafe-inline'`**: la aplicación no tiene un solo bloque `<script>` inline ni un solo manejador en atributo HTML (`onclick=`, etc.), están todos asignados desde JavaScript. Esto es lo que hace que la política sirva de verdad. |
| `style-src ... 'unsafe-inline'` | Acá sí hace falta: las vistas generan HTML con atributos `style="..."`. Es la concesión honesta de esta política. Pesa poco porque el vector real de una inyección es el script, y ese lado quedó cerrado. Se elimina el día que los estilos en línea pasen a clases. |
| `connect-src` | Las tres únicas cosas con las que habla el navegador: la API de Supabase, su canal de tiempo real (`wss://`) y el Worker de alta de usuarios. Cualquier intento de mandar datos a otro lado queda bloqueado por el navegador. |
| `font-src https://fonts.gstatic.com` | Los archivos de las tipografías. La hoja de estilos viene de `fonts.googleapis.com`, que está en `style-src`. |
| `frame-ancestors 'none'` | Nadie puede embeber el sitio en un iframe. Cierra el secuestro de clics. |
| `base-uri 'self'` · `object-src 'none'` · `form-action 'self'` | Cierran tres caminos clásicos: reescribir la base de las URLs relativas, incrustar objetos, y redirigir el envío de un formulario a un servidor ajeno. |

**Despliegue en dos pasos, obligatorio:**

1. Crear la cabecera con el nombre **`Content-Security-Policy-Report-Only`**.
   Con ese nombre el navegador *no bloquea nada*: solo reporta en consola. Cero
   riesgo.
2. Recorrer la aplicación entera con la consola abierta: iniciar sesión, listado,
   ficha, editar un PAS, cargar producción, reportes, metas, auditoría, usuarios.
   Anotar cualquier violación.
3. Si la consola queda limpia, cambiar el nombre de la cabecera a
   **`Content-Security-Policy`** y volver a recorrer.

### Las demás (sin riesgo, se pueden poner todas juntas)

| Cabecera | Valor | Qué hace |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | El navegador no adivina el tipo de un archivo. Evita que algo subido como texto se ejecute como script. |
| `X-Frame-Options` | `DENY` | Redundante con `frame-ancestors`, pero los escáneres la siguen buscando por separado. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Al salir del sitio no se filtra la dirección completa que estaba viendo el usuario. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | Apaga capacidades del navegador que la aplicación no usa. Si alguna vez se inyectara código, no puede pedirlas. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Aísla la pestaña de otras ventanas que pudieran abrirla. |

---

## 2 · Las que se quitan

Misma regla, acción **Remove**. Hoy el sitio publica gratis cómo está construido:

```
x-github-request-id
x-github-edge-region
via
x-served-by
x-cache
x-cache-hits
x-timer
x-fastly-request-id
x-proxy-cache
access-control-allow-origin
```

Las primeras nueve anuncian que atrás hay GitHub Pages con Fastly adelante. No es
una vulnerabilidad, es reconocimiento regalado.

La última sí importa un poco más: GitHub devuelve `access-control-allow-origin: *`
en todo, lo que permite que cualquier sitio lea el contenido del nuestro desde el
navegador de un tercero. Para esta aplicación no hace falta y se saca sin efecto.

---

## 3 · HSTS, en dos tiempos

Obliga al navegador a no volver a intentar una conexión sin cifrar. Es potente y
**difícil de revertir**: mientras el plazo esté vigente, el navegador de cada
persona que ya visitó el sitio se niega a usar HTTP aunque nosotros queramos.

Por eso va en dos tiempos y **nunca con `preload`**, que es prácticamente
irreversible:

1. **Primero, plazo corto.** Como cabecera estática en la misma regla:
   `Strict-Transport-Security: max-age=300` (cinco minutos). Probar el sitio
   desde teléfono, desde incógnito y desde otra red.
2. **Después de unos días estable**, pasar a `SSL/TLS → Edge Certificates → HSTS`
   y activarlo con seis meses e `includeSubDomains`. Ahí se borra la cabecera
   estática de la regla, para que no queden dos.

## 4 · Versión mínima de TLS

`SSL/TLS → Edge Certificates → Minimum TLS Version` → **1.2**.

Deja afuera TLS 1.0 y 1.1, que están obsoletos y que todo escáner marca. Ningún
navegador de los últimos diez años se ve afectado.

Recordar que el modo SSL sigue siendo **Full**, no *Full (strict)*: está
explicado en `CLAUDE.md` y no hay que cambiarlo.

---

## 5 · Cómo verificar que quedó bien

```bash
curl -sI https://gestiongrupoab.com.ar/
```

Tienen que aparecer las cabeceras nuevas y **no** las de la lista de arriba.

Después, los dos escáneres públicos que va a usar cualquiera que audite:
`securityheaders.com` y el Observatory de Mozilla. Antes de esto el sitio sacaba
la peor nota posible por no devolver nada.

---

## 6 · La librería de Supabase

En `index.html` la librería dejó de cargarse como `@2` (versión flotante, sin
verificación) y pasó a estar fijada con su hash:

```
https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0
integrity="sha384-JBR+x8blGwjDRO63aHCGiZMD4VNiTR4ZUGA+N6ZKLf3zNt1fK8IBpcgPaMrxqWBp"
crossorigin="anonymous"
```

Con `@2`, si ese paquete se comprometiera, el sitio ejecutaba lo que le mandaran
sin preguntar. Ahora, si el archivo cambia un solo byte, el navegador se niega a
ejecutarlo.

**Para actualizar la versión** hay que recalcular el hash, o el sitio deja de
funcionar:

```bash
curl -s -o lib.js "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@NUEVA_VERSION"
node -e "const f=require('fs'),c=require('crypto');console.log('sha384-'+c.createHash('sha384').update(f.readFileSync('lib.js')).digest('base64'))"
```

Probar en local antes de publicar: si el hash no coincide, la aplicación no
arranca y la pantalla queda en blanco.
