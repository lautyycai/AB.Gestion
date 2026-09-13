/* ============== SERVICIO: USUARIOS (tabla "usuarios" + Worker de Cloudflare) ============== */
async function obtenerUsuarios() {
  return supa.from('usuarios').select('*').order('nombre_completo', { ascending: true });
}

async function crearUsuario({ email, password, nombre_completo, rol, dupla_asignada }) {
  const bloqueo = demoBloqueoWorker(); if (bloqueo) return bloqueo;
  const { data: { session } } = await supa.auth.getSession();
  const resp = await fetch(URL_CREAR_USUARIO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ email, password, nombre_completo, rol, dupla_asignada }),
  });
  const result = await resp.json();
  return { resp, result };
}

// La tabla "usuarios" no guarda el email real (vive en Supabase Auth) — lo traemos vía el Worker
async function obtenerCorreosUsuarios() {
  const { data: { session } } = await supa.auth.getSession();
  const resp = await fetch(URL_CREAR_USUARIO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action: 'listar_correos' }),
  });
  const result = await resp.json();
  return { resp, result };
}

async function eliminarUsuario(id) {
  const bloqueo = demoBloqueoWorker(); if (bloqueo) return bloqueo;
  const { data: { session } } = await supa.auth.getSession();
  const resp = await fetch(URL_CREAR_USUARIO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
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
  const { data: { session } } = await supa.auth.getSession();
  const resp = await fetch(URL_CREAR_USUARIO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action: 'editar_credenciales', id, email, password }),
  });
  const result = await resp.json();
  return { resp, result };
}
