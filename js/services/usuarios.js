/* ============== SERVICIO: USUARIOS (tabla "usuarios" + Worker de Cloudflare) ============== */
// Los fetch al Worker necesitan el token de la sesión activa. Si la sesión venció (o nunca se pudo
// leer), sin este chequeo `session` da null y `session.access_token` explota con un TypeError que
// la UI reportaba como "Error de red: Cannot read properties of null" — un mensaje que manda a
// diagnosticar lo que no es. Con esto, el mismo caso da un mensaje entendible.
async function tokenDeSesion() {
  const { data: { session } } = await supa.auth.getSession();
  if (!session) throw new Error('Tu sesión venció. Recargá la página y volvé a iniciar sesión.');
  return session.access_token;
}

async function obtenerUsuarios() {
  return supa.from('usuarios').select('*').order('nombre_completo', { ascending: true });
}

async function crearUsuario({ email, password, nombre_completo, rol, dupla_asignada }) {
  const bloqueo = demoBloqueoWorker(); if (bloqueo) return bloqueo;
  const token = await tokenDeSesion();
  const resp = await fetch(URL_CREAR_USUARIO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, password, nombre_completo, rol, dupla_asignada }),
  });
  const result = await resp.json();
  return { resp, result };
}

// La tabla "usuarios" no guarda el email real (vive en Supabase Auth) — lo traemos vía el Worker
async function obtenerCorreosUsuarios() {
  const token = await tokenDeSesion();
  const resp = await fetch(URL_CREAR_USUARIO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'listar_correos' }),
  });
  const result = await resp.json();
  return { resp, result };
}

async function eliminarUsuario(id) {
  const bloqueo = demoBloqueoWorker(); if (bloqueo) return bloqueo;
  const token = await tokenDeSesion();
  const resp = await fetch(URL_CREAR_USUARIO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'eliminar', id }),
  });
  const result = await resp.json();
  return { resp, result };
}

// Recibe el objeto de cambios tal cual y lo manda: así el llamador puede OMITIR un campo (y que
// quede como está en la base) en vez de verse obligado a mandarlo en null y pisarlo.
async function actualizarUsuario(id, cambios) {
  const bloqueo = demoBloqueo(); if (bloqueo) return bloqueo;
  return supa.from('usuarios').update(cambios).eq('id', id);
}

async function editarCredencialesUsuario({ id, email, password }) {
  const bloqueo = demoBloqueoWorker(); if (bloqueo) return bloqueo;
  const token = await tokenDeSesion();
  const resp = await fetch(URL_CREAR_USUARIO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'editar_credenciales', id, email, password }),
  });
  const result = await resp.json();
  return { resp, result };
}
