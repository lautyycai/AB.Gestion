/* ============== BLOQUEO POR INACTIVIDAD ==============
 * La sesión de Supabase dura todo el día (ver auth.js) y eso está bien: lo que
 * no está bien es una pantalla con datos de productores abierta y desatendida
 * en la oficina. Esto NO cierra sesión ni pierde el trabajo en curso: al
 * desbloquear, se vuelve a dibujar la misma vista desde los datos que ya están
 * en memoria. "Continuar" reautentica contra Supabase con el mismo email de
 * la sesión activa (signInWithPassword), así que también repara sola el caso
 * en que el token ya haya vencido en segundo plano mientras estaba bloqueada.
 * Quien prefiera salir de verdad tiene el botón de cerrar sesión ahí mismo,
 * sin necesidad de acertar la contraseña primero.
 *
 * El difuminado (filter:blur) es solo visual -- no alcanza solo. El texto
 * real sigue entero en el DOM detrás del desenfoque: "Ver código fuente",
 * clic derecho → Inspeccionar, o Ctrl+A y copiar lo revela igual, sin
 * necesidad de sacar el blur. Por eso, además de difuminar, se vacía el
 * contenido real de #app -- lo único que puede tener datos de productores --
 * y se lo vuelve a dibujar recién al desbloquear con éxito.
 */
const INACTIVIDAD_LIMITE_MS = 30 * 60 * 1000;
const INACTIVIDAD_CHEQUEO_MS = 15 * 1000;
const INACTIVIDAD_EVENTOS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'wheel'];

let ultimaActividadEn = Date.now();
let bloqueadoPorInactividad = false;
let intervaloInactividad = null;

function registrarActividad() {
  ultimaActividadEn = Date.now();
}

function iniciarVigilanciaInactividad() {
  ultimaActividadEn = Date.now();
  INACTIVIDAD_EVENTOS.forEach(ev => document.addEventListener(ev, registrarActividad, { passive: true }));
  if (!intervaloInactividad) {
    intervaloInactividad = setInterval(() => {
      if (bloqueadoPorInactividad) return;
      if (Date.now() - ultimaActividadEn >= INACTIVIDAD_LIMITE_MS) mostrarBloqueoInactividad();
    }, INACTIVIDAD_CHEQUEO_MS);
  }
}

// Se llama al cerrar sesión (manual o por vencimiento): no tiene sentido seguir
// vigilando actividad ni dejar el candado colgado si ya no hay nadie logueado.
function detenerVigilanciaInactividad() {
  INACTIVIDAD_EVENTOS.forEach(ev => document.removeEventListener(ev, registrarActividad));
  if (intervaloInactividad) { clearInterval(intervaloInactividad); intervaloInactividad = null; }
  quitarBloqueoInactividad();
}

function mostrarBloqueoInactividad() {
  if (bloqueadoPorInactividad) return;
  bloqueadoPorInactividad = true;

  const raiz = document.getElementById('root');
  if (raiz) raiz.classList.add('difuminado');
  // El blur es cosmético: vaciar #app es lo que de verdad saca el dato real
  // del DOM mientras está bloqueado.
  const app = document.getElementById('app');
  if (app) app.innerHTML = '';

  const minutos = Math.round(INACTIVIDAD_LIMITE_MS / 60000);
  const overlay = document.createElement('div');
  overlay.id = 'bloqueo-inactividad';
  overlay.className = 'inactividad-overlay';
  overlay.innerHTML = `
    <div class="inactividad-box">
      <h2>Sesión inactiva</h2>
      <p>Pasaron ${minutos} minutos sin actividad en la página. Volvé a ingresar tu contraseña para continuar.</p>
      <form id="inactividad-form">
        <div class="pass-wrap"><input type="password" id="inactividad-pass" autocomplete="current-password" required><button type="button" class="pass-toggle" id="inactividad-pass-toggle"></button></div>
        <div id="inactividad-msg"></div>
        <button type="submit" id="inactividad-btn">Continuar</button>
      </form>
      <button type="button" class="inactividad-logout" id="inactividad-logout">Cerrar sesión</button>
    </div>`;
  document.body.appendChild(overlay);
  activarTogglePassword('inactividad-pass', 'inactividad-pass-toggle');
  document.getElementById('inactividad-pass').focus();

  document.getElementById('inactividad-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('inactividad-btn');
    const msg = document.getElementById('inactividad-msg');
    const passInput = document.getElementById('inactividad-pass');
    msg.innerHTML = '';
    btn.disabled = true; btn.textContent = 'Verificando...';

    const { data: { user } } = await supa.auth.getUser();
    const { error } = user
      ? await supa.auth.signInWithPassword({ email: user.email, password: passInput.value })
      : { error: { message: 'sin sesión' } };

    btn.disabled = false; btn.textContent = 'Continuar';
    if (error) {
      msg.innerHTML = '<div class="formerr">Contraseña incorrecta.</div>';
      passInput.value = '';
      passInput.focus();
      return;
    }
    quitarBloqueoInactividad();
  };

  document.getElementById('inactividad-logout').onclick = () => cerrarSesion();
}

function quitarBloqueoInactividad() {
  // Esta función también la llama detenerVigilanciaInactividad() en cada
  // logout, incluso cuando nunca se llegó a bloquear -- ahí #app no se vació
  // y no hay nada que redibujar (además, renderLogin() lo va a reemplazar
  // igual un instante después).
  const estabaBloqueado = bloqueadoPorInactividad;
  bloqueadoPorInactividad = false;
  ultimaActividadEn = Date.now();
  const raiz = document.getElementById('root');
  if (raiz) raiz.classList.remove('difuminado');
  const overlay = document.getElementById('bloqueo-inactividad');
  if (overlay) overlay.remove();
  // Se vació #app al bloquear (ver mostrarBloqueoInactividad): redibuja la
  // misma vista desde los datos que ya están en memoria, sin volver a pedirlos.
  if (estabaBloqueado && typeof render === 'function') render();
}
