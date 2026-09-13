/* ============== PANTALLA DE CARGA ============== */
function renderLoading() {
  root.innerHTML = `<div class="loading"><img src="logo-transparente.png" alt="Cargando"></div>`;
}

/* ============== PANTALLA DE LOGIN ============== */
function renderLogin(errorMsg) {
  root.innerHTML = `
    <div class="loginwrap">
      <div class="loginbox">
        <h1>AB Gestión</h1>
        <p>Ingresá con tu usuario para continuar</p>
        <form id="login-form">
          <label>Usuario</label>
          <input type="email" id="login-email" placeholder="tuusuario@abgestion.sistema" required>
          <label>Contraseña</label>
          <div class="pass-wrap"><input type="password" id="login-pass" required><button type="button" class="pass-toggle" id="login-pass-toggle"></button></div>
          ${errorMsg ? `<div class="loginerr">${esc(errorMsg)}</div>` : ''}
          <button type="submit" id="login-btn">Ingresar</button>
        </form>
      </div>
    </div>`;
  activarTogglePassword('login-pass', 'login-pass-toggle');
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.disabled = true; btn.textContent = 'Ingresando...';
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-pass').value;
    const { error } = await supa.auth.signInWithPassword({ email, password });
    if (error) {
      renderLogin('Usuario o contraseña incorrectos.');
      return;
    }
    await iniciarApp();
  };
}

/* ============== CARGA DE PERFIL (rol / dupla) ============== */
// Devuelve { perfil, falla } — 'falla' distingue "este usuario no tiene fila en usuarios" de
// "no se pudo consultar" (red caída, timeout). Antes las dos cosas devolvían null y el arranque
// cerraba la sesión diciendo "no tenés perfil asignado", mandando a buscar un problema de
// permisos que no existía cuando en realidad se había cortado la conexión un segundo.
async function cargarPerfilDetallado() {
  const { data: { user }, error: errUser } = await supa.auth.getUser();
  if (errUser) return { perfil: null, falla: 'conexion' };
  if (!user) return { perfil: null, falla: 'sesion' };
  const { data, error } = await supa.from('usuarios').select('*').eq('id', user.id).maybeSingle();
  if (error) return { perfil: null, falla: 'conexion' };
  if (!data) return { perfil: null, falla: 'sin_perfil' };
  return { perfil: data, falla: null };
}
// Wrapper para los llamadores que solo quieren refrescar el perfil ya logueado (perfil.js).
// Si la consulta falla, deja el perfil que ya había en memoria en vez de dejarlo en null.
async function cargarPerfil() {
  const { perfil: nuevo } = await cargarPerfilDetallado();
  return nuevo || perfil;
}

/* ============== ARRANQUE DE LA APP ============== */
async function iniciarApp() {
  renderLoading();
  const { perfil: cargado, falla } = await cargarPerfilDetallado();
  perfil = cargado;
  if (!perfil) {
    if (falla === 'conexion') {
      // No cerramos sesión por un problema de red: se puede reintentar sin volver a loguearse.
      root.innerHTML = `<div class="pageerr"><div class="formerr">No se pudo conectar con el servidor para cargar tu perfil. Revisá la conexión y volvé a intentar.</div><div class="modal-actions" style="justify-content:center"><button class="btn-primary" id="btn-reintentar-perfil">Reintentar</button></div></div>`;
      const btn = document.getElementById('btn-reintentar-perfil');
      if (btn) btn.onclick = () => iniciarApp();
      return;
    }
    await supa.auth.signOut();
    renderLogin('Tu usuario no tiene un perfil asignado. Contactá al administrador.');
    return;
  }
  renderLoading();
  try {
    D = await cargarDatos();
  } catch (err) {
    root.innerHTML = `<div class="pageerr"><div class="formerr">Error cargando datos: ${esc(err.message)}</div></div>`;
    return;
  }
  renderShell();
}

/* ============== SESIÓN VENCIDA ============== */
// La app queda abierta todo el día. Cuando el refresh token se vence, Supabase emite SIGNED_OUT
// y hasta ahora no lo escuchaba nadie: la pestaña seguía mostrando la app y cada acción fallaba
// con un "JWT expired" que no le decía nada al usuario. Ahora lo devolvemos al login.
supa.auth.onAuthStateChange((evento) => {
  if (evento !== 'SIGNED_OUT') return;
  if (!perfil) return; // el logout manual ya limpia perfil y dibuja el login por su cuenta
  detenerVigilanciaInactividad();
  desuscribirRealtime();
  D = null; perfil = null;
  renderLogin('Tu sesión venció. Ingresá de nuevo para continuar.');
});
