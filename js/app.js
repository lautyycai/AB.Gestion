// Se llama despues de refrescar `perfil` en memoria (crear/borrar dupla propia) para que el
// cuadro de usuario del sidebar lo refleje sin esperar a un renderShell() completo — el sidebar
// solo se dibuja una vez al arrancar la app, render() nunca lo vuelve a tocar.
function actualizarSidebarDuplas() {
  const el = document.getElementById('sidebar-duplas');
  if (el) el.textContent = (perfil.dupla_asignada || []).join(', ');
}

function renderShell() {
  root.innerHTML = `
    <div class="app">
      <header class="mobilebar">
        <button class="mobilebar-menu" id="btn-menu" aria-label="Abrir menú">${ICONO_MENU}</button>
        <div class="mobilebar-titulo">AB GESTIÓN</div>
      </header>
      <div class="side-backdrop" id="side-backdrop"></div>
      <aside class="side">
        <div class="brand-wrap" id="brand-home">
          <div class="brand-logo-sm"></div>
          <div>
            <div class="brand-gestion">GESTIÓN</div>
            <div class="brand-grupo">Grupo</div>
            <div class="brand-empresa">Alonso + Bernardi</div>
            <small class="brand-slogan">Seguros Junto a Vos</small>
          </div>
        </div>
        <nav class="nav">
          <button data-view="dashboard">${ICONO_GRID} <span>Dashboard</span></button>
          <button data-view="productores">${ICONO_PERSONA} <span>Productores</span></button>
          <button data-view="comparar">${ICONO_INTERCAMBIO} <span>Comparar</span></button>
          <button data-view="mis-reportes">${ICONO_CAMPANA} <span>Mis reportes</span></button>
          ${perfil.rol === 'admin' ? `<button data-view="reportes">${ICONO_SOBRE} <span>Reportes</span></button><button data-view="usuarios">${ICONO_PERSONAS} <span>Usuarios</span></button>` : ''}
          ${(perfil.rol === 'admin' || perfil.rol === 'jefe') ? `<button data-view="auditoria">${ICONO_RELOJ} <span>Auditoría</span></button>` : ''}
        </nav>
        <div class="nav" style="flex:none">
          <button data-view="perfil">${ICONO_TARJETA} <span>Perfil</span></button>
        </div>
        <div class="userbox">
          <b>${esc(perfil.nombre_completo || 'Usuario')}</b>
          <span class="rolpill">${esc(((ROLES_USUARIO.find(r => r.valor === perfil.rol) || {}).etiqueta || perfil.rol || '').toUpperCase())}</span>
          <div id="sidebar-duplas" style="margin-top:6px">${(perfil.dupla_asignada && perfil.dupla_asignada.length) ? perfil.dupla_asignada.map(esc).join(', ') : ''}</div>
          <button class="logout" id="btn-reportar" style="margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:8px">${ICONO_CHAT} Reportar algo</button>
          <button class="logout" id="btn-logout">Cerrar sesión</button>
        </div>
      </aside>
      <main class="main"><div id="app"></div></main>
    </div>
    <div id="modal-overlay" class="modal-overlay"></div>`;
  // En celular la barra lateral es un cajón que arranca fuera de pantalla (ver responsive.css):
  // se abre con el botón de la barra de arriba y se cierra al tocar el fondo, al elegir una vista
  // o con Escape. En escritorio nada de esto se ve, la barra está siempre a la vista.
  const sideEl = document.querySelector('.side');
  const backdropEl = document.getElementById('side-backdrop');
  const cerrarMenu = () => {
    sideEl.classList.remove('abierta');
    backdropEl.classList.remove('abierta');
    document.body.classList.remove('menu-abierto');
  };
  document.getElementById('btn-menu').onclick = () => {
    const abierta = sideEl.classList.toggle('abierta');
    backdropEl.classList.toggle('abierta', abierta);
    document.body.classList.toggle('menu-abierto', abierta);
  };
  backdropEl.onclick = cerrarMenu;

  // Cerrar el modal solo si el click empezó Y terminó en el fondo (overlay), nunca si arrancó
  // adentro del modal — así seleccionar texto con el mouse y soltar afuera no lo cierra por error.
  let modalMouseDownEnOverlay = false;
  const modalOverlayEl = document.getElementById('modal-overlay');
  document.onkeydown = e => {
    if (e.key !== 'Escape') return;
    // Si hay un modal abierto, Escape lo cierra a él primero; recién si no hay ninguno cierra el
    // cajón lateral. Antes Escape solo conocía el cajón: un modal abierto no se cerraba con nada
    // más que el botón o un click en el fondo.
    if (modalOverlayEl.style.display === 'flex') cerrarModal();
    else cerrarMenu();
  };
  modalOverlayEl.onmousedown = e => { modalMouseDownEnOverlay = (e.target === modalOverlayEl); };
  modalOverlayEl.onclick = e => { if (modalMouseDownEnOverlay && e.target === modalOverlayEl) cerrarModal(); };
  document.getElementById('btn-logout').onclick = () => cerrarSesion();
  document.getElementById('btn-reportar').onclick = () => abrirFormReporte();
  document.querySelectorAll('.nav button').forEach(b => b.onclick = () => {
    cerrarMenu();
    state.view = b.dataset.view;
    state.pas = null;
    if (b.dataset.view === 'productores') state.pagina = 1;
    if (b.dataset.view === 'reportes') reportesCache = null;
    if (b.dataset.view === 'mis-reportes') misReportesCache = null;
    if (b.dataset.view === 'usuarios') usuariosCache = null;
    if (b.dataset.view === 'perfil') perfilesCache = null;
    render();
  });
  document.getElementById('brand-home').onclick = () => { cerrarMenu(); state.view = 'dashboard'; state.pas = null; render(); };
  iniciarVigilanciaInactividad();
  render();
}

// Compartido entre el botón de la barra lateral y el cierre automático por inactividad
// (js/inactividad.js), que le pasa un mensaje para mostrar en la pantalla de login.
async function cerrarSesion(mensaje) {
  detenerVigilanciaInactividad();
  desuscribirRealtime();
  // Limpiamos perfil ANTES del signOut: el listener de onAuthStateChange usa perfil para saber
  // si el SIGNED_OUT fue una sesión vencida o este logout a propósito, y no pisar el mensaje.
  D = null; perfil = null;
  await supa.auth.signOut();
  renderLogin(mensaje);
}

/* ============== REPORTAR (comentarios / bugs de cualquier usuario) ============== */
function abrirFormReporte() {
  const html = `
    <h2>Reportar algo</h2>
    <div class="modal-sub">Contanos qué pasó o qué te gustaría que mejoremos</div>
    <div class="formgrid">
      <div class="full"><label>Mensaje</label><textarea id="f-reporte-msg" rows="5" placeholder="Contá qué pasa..."></textarea></div>
    </div>
    <div id="form-reporte-msg"></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="btn-cancelar-reporte">Cancelar</button>
      <button class="btn-primary" id="btn-enviar-reporte">Enviar</button>
    </div>`;
  abrirModal(html);
  document.getElementById('btn-cancelar-reporte').onclick = cerrarModal;
  document.getElementById('btn-enviar-reporte').onclick = enviarReporte;
}

async function enviarReporte() {
  const btn = document.getElementById('btn-enviar-reporte');
  const msg = document.getElementById('form-reporte-msg');
  msg.innerHTML = '';
  const texto = document.getElementById('f-reporte-msg').value.trim();
  if (!texto) { msg.innerHTML = '<div class="formerr">Escribí algo antes de enviar.</div>'; return; }

  btn.disabled = true; btn.textContent = 'Enviando...';
  const { error } = await crearReporte({ mensaje: texto, vista: state.view });
  btn.disabled = false; btn.textContent = 'Enviar';
  if (error) {
    msg.innerHTML = `<div class="formerr">No se pudo enviar: ${esc(error.message)}</div>`;
    return;
  }
  msg.innerHTML = '<div class="formok">¡Gracias! Lo recibimos.</div>';
  setTimeout(cerrarModal, 800);
}

const $ = s => document.querySelector(s);
function nav() { document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === state.view)) }

/* ============== HISTORIAL DEL NAVEGADOR ==============
 * Sin esto la app nunca registraba una entrada en el historial: el botón
 * "atrás" (y el gesto de deslizar en el celular, que es el mismo) salía del
 * sitio en vez de volver a la pantalla anterior.
 *
 * Como render() es el único lugar por donde pasan TODAS las vistas, alcanza
 * con engancharse acá: si la vista cambió respecto de la última anotada, se
 * agrega una entrada. Los redibujados que no cambian de vista —guardar algo,
 * un filtro, una actualización en tiempo real— no ensucian el historial.
 */
let restaurandoHistorial = false;

function sincronizarHistorial() {
  try {
    const actual = { view: state.view, pas: state.pas };
    const previo = history.state;
    if (previo && previo.view === actual.view && previo.pas === actual.pas) return;
    // La primera vez se reemplaza en vez de agregar, así el primer "atrás" ya
    // sale del sitio y no se come una pulsación sin efecto visible.
    if (previo) history.pushState(actual, '', location.href);
    else history.replaceState(actual, '', location.href);
  } catch (e) {
    // Si el navegador rechaza la operación, la app tiene que seguir andando.
    console.warn('No se pudo registrar la navegación en el historial:', e);
  }
}

window.addEventListener('popstate', e => {
  // Sin sesión no hay nada que restaurar (por ejemplo, "atrás" después de salir).
  if (!e.state || !perfil || !D) return;
  restaurandoHistorial = true;
  state.view = e.state.view;
  state.pas = e.state.pas;
  cerrarModal();
  render();
  restaurandoHistorial = false;
});

function render() {
  // Anotamos la vista en el historial, salvo cuando el redibujado viene
  // justamente de un "atrás" (ahí la entrada ya existe).
  if (!restaurandoHistorial) sincronizarHistorial();

  // Guardamos que elemento tenia el foco (y la posicion del cursor si era un input de texto) antes de redibujar
  const activo = document.activeElement;
  const activoId = activo && activo.id;
  const cursorPos = (activo && typeof activo.selectionStart === 'number') ? activo.selectionStart : null;

  // Si nos estamos yendo de una vista con suscripción realtime activa, la cortamos antes de dibujar la nueva
  if (vistaConSuscripcion && vistaConSuscripcion !== state.view) desuscribirRealtime();

  nav();
  if (state.view === 'dashboard') dashboard(); else if (state.view === 'productores') productores(); else if (state.view === 'comparar') comparar(); else if (state.view === 'reportes') vistaReportes(); else if (state.view === 'mis-reportes') vistaMisReportes(); else if (state.view === 'usuarios') vistaUsuarios(); else if (state.view === 'perfil') vistaPerfil(); else if (state.view === 'auditoria') vistaAuditoria(); else ficha(state.pas);

  // Le devolvemos el foco al elemento que lo tenia (ahora es un elemento nuevo, pero con el mismo id)
  if (activoId) {
    const nuevo = document.getElementById(activoId);
    if (nuevo) {
      nuevo.focus();
      if (cursorPos !== null && typeof nuevo.setSelectionRange === 'function') {
        try { nuevo.setSelectionRange(cursorPos, cursorPos) } catch (e) {}
      }
    }
  }
}

/* ============== PUNTO DE ENTRADA ============== */
(async function main() {
  renderLoading();
  const { data: { session } } = await supa.auth.getSession();
  if (session) {
    await iniciarApp();
  } else {
    renderLogin();
  }
})();
