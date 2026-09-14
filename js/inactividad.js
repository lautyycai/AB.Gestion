/* ============== BLOQUEO POR INACTIVIDAD ==============
 * La sesión de Supabase dura todo el día (ver auth.js) y eso está bien: lo que
 * no está bien es una pantalla con datos de productores abierta y desatendida
 * en la oficina.
 *
 * Antes esto no cerraba sesión: difuminaba la pantalla, vaciaba #app y pedía
 * la contraseña para "continuar" sin perder el estado en memoria. El límite
 * real de ese diseño: quien ya tiene la consola del navegador abierta en la
 * máquina desatendida puede seguir leyendo todo lo que sigue en `D`
 * (`copy(D.producers)`) y hasta levantar el candado a mano llamando a la
 * función global -- el bloqueo cosmético protegía de una mirada casual, no de
 * alguien con las manos en el teclado. Decisión de producto: a los 30 minutos
 * sin actividad, cierra sesión DE VERDAD (mismo camino que el botón "Cerrar
 * sesión"), no queda nada de la sesión anterior en memoria para leer ni para
 * desbloquear.
 */
const INACTIVIDAD_LIMITE_MS = 30 * 60 * 1000;
const INACTIVIDAD_CHEQUEO_MS = 15 * 1000;
const INACTIVIDAD_EVENTOS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'wheel'];

let ultimaActividadEn = Date.now();
let intervaloInactividad = null;

function registrarActividad() {
  ultimaActividadEn = Date.now();
}

function iniciarVigilanciaInactividad() {
  ultimaActividadEn = Date.now();
  INACTIVIDAD_EVENTOS.forEach(ev => document.addEventListener(ev, registrarActividad, { passive: true }));
  if (!intervaloInactividad) {
    intervaloInactividad = setInterval(() => {
      if (Date.now() - ultimaActividadEn >= INACTIVIDAD_LIMITE_MS) {
        cerrarSesion('Se cerró tu sesión por inactividad (30 minutos sin uso). Ingresá de nuevo para continuar.');
      }
    }, INACTIVIDAD_CHEQUEO_MS);
  }
}

// Se llama al cerrar sesión (manual, por vencimiento o por esta misma inactividad): no tiene
// sentido seguir vigilando actividad si ya no hay nadie logueado.
function detenerVigilanciaInactividad() {
  INACTIVIDAD_EVENTOS.forEach(ev => document.removeEventListener(ev, registrarActividad));
  if (intervaloInactividad) { clearInterval(intervaloInactividad); intervaloInactividad = null; }
}
