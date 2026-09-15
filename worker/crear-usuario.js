// Cloudflare Worker: crea, edita o elimina un usuario (Auth + fila en la tabla "usuarios")
// Solo lo puede ejecutar alguien logueado con rol = 'admin'.
// Body { action: 'eliminar', id } para borrar; sin "action" (o action:'crear') para crear.
//
// Este archivo es la copia versionada del Worker que corre en Cloudflare. NO se despliega solo:
// si lo tocás acá, hay que pegarlo también en el editor del Worker en Cloudflare.
//
// Variables de entorno que hay que cargar en Cloudflare (Settings del Worker → Variables):
//   SUPABASE_URL              = https://mgcrhcmpmqukclvjztmx.supabase.co   (no es secreta)
//   SUPABASE_ANON_KEY         = eyJ...                                     (no es secreta)
//   SUPABASE_SERVICE_ROLE_KEY = (Supabase → Project Settings → API → "service_role")
//                                Esta SÍ es secreta: cargala como "Encrypt" en Cloudflare.

const ALLOWED_ORIGINS = [
  'https://gestiongrupoab.com.ar',
];

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const ROLES_VALIDOS = ['admin', 'editor', 'carga_pas', 'viewer', 'jefe'];
// El id de usuario llega del body sin validar y se interpola directo en la URL de la Admin API de
// Supabase (con la service_role key puesta). Sin este chequeo, un id con "../" se sale de la ruta
// prevista y pega contra cualquier endpoint de Supabase con permisos totales.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES_CON_DUPLA = ['editor', 'carga_pas'];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// El front manda dupla_asignada como string (crear) y la tabla la guarda como text[]. Esto acepta
// las dos formas: si algún día el front pasa a mandar un array, no queda anidado como [["A","B"]].
function normalizarDuplas(valor) {
  if (Array.isArray(valor)) return valor.filter(Boolean);
  return valor ? [valor] : [];
}

// Rechaza contraseñas que ya aparecieron en filtraciones públicas conocidas, consultando
// HaveIBeenPwned. Los usuarios de la app tienen nombres de acceso predecibles
// (nombreapellido@...), así que una contraseña reusada de otro sitio filtrado es el camino
// más corto para entrar. Supabase trae este chequeo incorporado, pero se aplica en los
// endpoints del cliente y acá las cuentas se crean por la Admin API, que no pasa por ahí.
//
// Se usa k-anonymity: se envían SOLO los primeros 5 caracteres del hash SHA-1. Ni la
// contraseña ni el hash completo salen de este Worker.
//
// Ante cualquier falla del servicio devuelve false (no bloquea). Es a propósito: que
// HaveIBeenPwned esté caído no puede dejar al admin sin poder dar de alta a nadie.
async function passwordEnFiltraciones(password) {
  try {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
    const hash = Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const resp = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
    });
    if (!resp.ok) return false;
    const sufijo = hash.slice(5);
    const texto = await resp.text();
    return texto.split('\n').some(linea => linea.split(':')[0].trim() === sufijo);
  } catch (e) {
    return false;
  }
}

const MENSAJE_PASSWORD_FILTRADA = 'Esa contraseña aparece en filtraciones públicas de otros sitios, así que ya está en las listas que se usan para probar accesos. Elegí otra.';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Método no permitido' }, 405, headers);
    }

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return json({ error: 'Falta autenticación' }, 401, headers);
    }

    const admin = {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    };

    // 1) Validar el token contra Supabase y saber quién está llamando
    const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
    });
    if (!userResp.ok) {
      return json({ error: 'Token inválido' }, 401, headers);
    }
    const caller = await userResp.json();

    // 2) Chequear que quien llama sea admin
    const rolResp = await fetch(`${env.SUPABASE_URL}/rest/v1/usuarios?id=eq.${caller.id}&select=rol`, {
      headers: admin,
    });
    const rolData = await rolResp.json();
    if (!Array.isArray(rolData) || rolData.length === 0 || rolData[0].rol !== 'admin') {
      return json({ error: 'No tenés permiso para administrar usuarios' }, 403, headers);
    }

    // 3) Leer el body
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Body inválido' }, 400, headers);
    }

    // 3.1) Acción "eliminar"
    if (body && body.action === 'eliminar') {
      const targetId = body.id;
      if (!targetId) {
        return json({ error: 'Falta el id del usuario a eliminar' }, 400, headers);
      }
      if (!UUID_REGEX.test(targetId)) {
        return json({ error: 'El id del usuario no tiene el formato esperado' }, 400, headers);
      }
      if (targetId === caller.id) {
        return json({ error: 'No podés eliminar tu propio usuario' }, 400, headers);
      }

      const delAuthResp = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${targetId}`, {
        method: 'DELETE',
        headers: admin,
      });
      if (!delAuthResp.ok) {
        const errBody = await delAuthResp.json().catch(() => ({}));
        return json({ error: errBody.msg || errBody.message || 'No se pudo eliminar el usuario' }, 400, headers);
      }

      // Por si no hay borrado en cascada configurado, sacamos también la fila de "usuarios".
      // Antes no se miraba el resultado: si esto fallaba, la cuenta quedaba borrada de Auth pero
      // la fila seguía apareciendo en la lista de Usuarios y en "Ver perfil de", sin avisar nada.
      const delFilaResp = await fetch(`${env.SUPABASE_URL}/rest/v1/usuarios?id=eq.${targetId}`, {
        method: 'DELETE',
        headers: admin,
      });
      if (!delFilaResp.ok) {
        return json({
          error: 'Se eliminó la cuenta de acceso, pero no se pudo borrar su ficha de usuario. Va a seguir apareciendo en la lista hasta que se limpie a mano.',
        }, 500, headers);
      }

      return json({ ok: true }, 200, headers);
    }

    // 3.2) Acción "listar_correos" (trae el email real de cada usuario, la tabla "usuarios" no lo guarda)
    if (body && body.action === 'listar_correos') {
      let usuariosAuth = [];
      let page = 1;
      const PER_PAGE = 1000;
      while (true) {
        const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${PER_PAGE}`, {
          headers: admin,
        });
        if (!resp.ok) return json({ error: 'No se pudieron traer los emails' }, 400, headers);
        const data = await resp.json();
        const lote = data.users || [];
        usuariosAuth = usuariosAuth.concat(lote.map(u => ({ id: u.id, email: u.email })));
        // Cortamos SOLO por lote vacío, no por "lote incompleto": si el servidor recorta per_page
        // a un máximo menor al pedido, un lote siempre da length < PER_PAGE aunque queden más
        // páginas -- cortar por eso dejaba al resto de los usuarios sin email y sin ningún aviso.
        // Con lote vacío alcanza para saber que no hay más, y el cinturón de seguridad de abajo
        // sigue cubriendo el caso de que algo ande mal y nunca llegue un lote vacío.
        if (lote.length === 0) break;
        page++;
        if (page > 50) break; // cinturón de seguridad, no queremos un loop infinito
      }
      // Por si algún día la Admin API recortara página en vez de devolver vacía (repitiendo la
      // última en vez de cortar): un id repetido no rompe nada del lado del front porque arma un
      // mapa por id, pero de-duplicar acá es gratis y evita depender de eso.
      const usuariosUnicos = Object.values(Object.fromEntries(usuariosAuth.map(u => [u.id, u])));
      return json({ ok: true, usuarios: usuariosUnicos }, 200, headers);
    }

    // 3.3) Acción "editar_credenciales" (cambiar email de login y/o contraseña, sin depender de un mail real)
    if (body && body.action === 'editar_credenciales') {
      const targetId = body.id;
      if (!targetId) {
        return json({ error: 'Falta el id del usuario' }, 400, headers);
      }
      if (!UUID_REGEX.test(targetId)) {
        return json({ error: 'El id del usuario no tiene el formato esperado' }, 400, headers);
      }
      const cambios = {};
      if (body.email) cambios.email = body.email;
      if (body.password) {
        if (!PASSWORD_REGEX.test(body.password)) {
          return json({ error: 'La contraseña tiene que tener al menos 8 caracteres, con mayúscula, minúscula y número' }, 400, headers);
        }
        if (await passwordEnFiltraciones(body.password)) {
          return json({ error: MENSAJE_PASSWORD_FILTRADA }, 400, headers);
        }
        cambios.password = body.password;
      }
      if (Object.keys(cambios).length === 0) {
        return json({ error: 'No hay nada para actualizar' }, 400, headers);
      }
      if (cambios.email) cambios.email_confirm = true; // no hay mail real, evitamos que quede pendiente de confirmar

      const updResp = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${targetId}`, {
        method: 'PUT',
        headers: { ...admin, 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios),
      });
      const result = await updResp.json();
      if (!updResp.ok) {
        return json({ error: result.msg || result.error_description || result.message || 'No se pudo actualizar' }, 400, headers);
      }
      return json({ ok: true }, 200, headers);
    }

    // 3.4) Acción "crear" (por defecto)
    const { email, password, nombre_completo, rol, dupla_asignada } = body || {};
    if (!email || !password || !nombre_completo || !rol) {
      return json({ error: 'Faltan datos obligatorios' }, 400, headers);
    }
    if (!ROLES_VALIDOS.includes(rol)) {
      return json({ error: 'Rol inválido' }, 400, headers);
    }
    if (!PASSWORD_REGEX.test(password)) {
      return json({ error: 'La contraseña tiene que tener al menos 8 caracteres, con mayúscula, minúscula y número' }, 400, headers);
    }
    if (await passwordEnFiltraciones(password)) {
      return json({ error: MENSAJE_PASSWORD_FILTRADA }, 400, headers);
    }
    const duplas = normalizarDuplas(dupla_asignada);
    // El front ya valida esto, pero el Worker es el que escribe en la base: si llegara igual sin
    // dupla, se creaba un editor sin ninguna, que después no puede cargar ni editar nada.
    if (ROLES_CON_DUPLA.includes(rol) && duplas.length === 0) {
      return json({ error: 'Este rol necesita una dupla asignada' }, 400, headers);
    }

    // 4) Crear el usuario en Supabase Auth
    const createResp = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { ...admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const created = await createResp.json();
    if (!createResp.ok) {
      return json({ error: created.msg || created.error_description || created.message || 'No se pudo crear el usuario' }, 400, headers);
    }

    // 5) Crear la fila correspondiente en la tabla "usuarios"
    const insertResp = await fetch(`${env.SUPABASE_URL}/rest/v1/usuarios`, {
      method: 'POST',
      headers: { ...admin, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: created.id,
        nombre_completo,
        rol,
        dupla_asignada: ROLES_CON_DUPLA.includes(rol) ? duplas : null,
      }),
    });
    if (!insertResp.ok) {
      const err = await insertResp.text();
      // Si el perfil no se pudo guardar, deshacemos la cuenta de Auth. Antes se dejaba creada: era
      // una cuenta que SÍ podía loguearse, que no aparecía en la lista de Usuarios (esa lista sale
      // de la tabla "usuarios", no de Auth) y que por lo tanto no se podía borrar desde la app. Al
      // entrar, la persona veía "tu usuario no tiene un perfil asignado" y nadie sabía por qué.
      await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${created.id}`, {
        method: 'DELETE',
        headers: admin,
      }).catch(() => {});
      return json({ error: 'No se pudo guardar el perfil del usuario, no se creó nada: ' + err }, 500, headers);
    }

    return json({ ok: true, id: created.id }, 200, headers);
  },
};

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
