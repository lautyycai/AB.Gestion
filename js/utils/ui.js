/* ============== CAMPO DE CONTRASEÑA (ojo mostrar/ocultar) ============== */
// Envuelve un <input type="password"> ya existente en el HTML (por su id) con el botón de ojo.
// Se llama después de insertar el HTML del formulario, una vez que el input ya está en el DOM.
function activarTogglePassword(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!input || !btn) return;
  btn.innerHTML = ICONO_OJO;
  btn.onclick = () => {
    const mostrar = input.type === 'password';
    input.type = mostrar ? 'text' : 'password';
    btn.innerHTML = mostrar ? ICONO_OJO_TACHADO : ICONO_OJO;
  };
}

/* ============== BOTÓN "ACTUALIZAR" ==============
 *
 * Los datos se bajan al iniciar sesión y no se repite solo (salvo la ficha de un
 * PAS, que se refresca al entrar). Traer el conjunto entero en cada navegación
 * haría sentir la app más lenta, no más fresca, y una tabla que se redibuja sola
 * mientras alguien la está filtrando molesta.
 *
 * Entonces: se muestra hace cuánto se bajaron los datos y se deja el control en
 * la persona. El problema real nunca fue que el dato estuviera viejo, sino no
 * saber que lo estaba. */

function textoAntiguedadDatos() {
  if (!momentoUltimaCarga) return 'Sin actualizar';
  const segundos = Math.round((Date.now() - momentoUltimaCarga) / 1000);
  if (segundos < 45) return 'Actualizado recién';
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `Actualizado hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `Actualizado hace ${horas} h${resto ? ' ' + resto + ' min' : ''}`;
}

// El bloque va adentro del encabezado de la vista. Devuelve HTML; hay que llamar
// después a activarBotonActualizar() para que el botón haga algo.
function barraActualizar() {
  return `<div class="actualizar"><span id="antiguedad-datos">${esc(textoAntiguedadDatos())}</span><button class="btn-secondary" id="btn-actualizar" title="Volver a traer los datos desde el servidor">Actualizar</button></div>`;
}

let relojAntiguedadDatos = null;

function activarBotonActualizar() {
  const btn = document.getElementById('btn-actualizar');
  if (!btn) return;

  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = 'Actualizando...';
    try {
      D = await cargarDatos();
    } catch (e) {
      // Que falle la actualización no puede dejar la pantalla rota: se queda con
      // los datos que ya tenía, que siguen siendo válidos, solo que viejos.
      btn.disabled = false; btn.textContent = 'Actualizar';
      mostrarToast('No se pudieron actualizar los datos. Seguís viendo los anteriores.', 'error');
      return;
    }
    render();
    mostrarToast('Datos actualizados.', 'ok');
  };

  /* Un solo reloj para toda la app, que reescribe el cartel sin redibujar la
   * pantalla: si esto llamara a render() cada medio minuto, se perdería el
   * scroll y el foco de quien está trabajando, que es justo lo que queríamos
   * evitar al no refrescar solos. */
  if (!relojAntiguedadDatos) {
    relojAntiguedadDatos = setInterval(() => {
      const el = document.getElementById('antiguedad-datos');
      if (el) el.textContent = textoAntiguedadDatos();
    }, 30000);
  }
}

/* ============== MODAL ============== */
function abrirModal(html) {
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `<div class="modal-box">${html}</div>`;
  overlay.style.display = 'flex';
}
function cerrarModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.style.display = 'none';
  overlay.innerHTML = '';
}

/* Modal de espera para los formularios que antes de dibujarse vuelven a
 * consultar la base (ver "refresco por acción" en state.js). Es una consulta de
 * una fila, normalmente instantánea, pero con la oficina en una conexión lenta
 * el botón se sentiría muerto si no se mostrara nada.
 *
 * El id "modal-cargando" hace de seña: mientras esté en el DOM, el modal que
 * está abierto sigue siendo este. Si el usuario lo cerró (o abrió otra cosa)
 * mientras se esperaba la respuesta, quien llamó lo consulta con
 * modalCargandoSigueAbierto() y no le vuelve a abrir un formulario en la cara. */
function abrirModalCargando(titulo) {
  abrirModal(`<h2>${esc(titulo)}</h2><div id="modal-cargando" class="empty">Buscando los datos actuales…</div>`);
}
function modalCargandoSigueAbierto() {
  return !!document.getElementById('modal-cargando');
}

/* Para cuando el refresco descubre que la fila ya no existe: alguien la borró
 * mientras el otro miraba la pantalla vieja. Abrir el formulario igual sería
 * hacerle completar algo que no se va a poder guardar. */
function avisarRegistroBorrado(titulo, mensaje) {
  abrirModal(`<h2>${esc(titulo)}</h2><div class="formerr">${esc(mensaje)}</div><div class="modal-actions"><button class="btn-primary" id="btn-cerrar-borrado">Entendido</button></div>`);
  document.getElementById('btn-cerrar-borrado').onclick = () => { cerrarModal(); render(); };
}
// Reemplaza al confirm() nativo del navegador (bloquea la pagina y rompe la automatizacion de
// testing) por el modal propio del sitio. accion es un callback async que se ejecuta si el
// usuario confirma; si cancela, no pasa nada.
function confirmarAccion(mensaje, accion) {
  abrirModal(`<h2>¿Confirmar?</h2><div class="modal-sub">${esc(mensaje)}</div><div class="modal-actions"><button class="btn-secondary" id="btn-cancelar-confirm">Cancelar</button><button class="btn-danger" id="btn-confirmar-confirm">Sí, eliminar</button></div>`);
  document.getElementById('btn-cancelar-confirm').onclick = cerrarModal;
  document.getElementById('btn-confirmar-confirm').onclick = async () => {
    cerrarModal();
    await accion();
  };
}
// Reemplaza al alert() nativo (mismo problema que confirm(): bloquea la pagina y la automatizacion
// de testing se lo puede tragar en silencio) por una notificacion flotante propia. Se apila arriba
// del modal (z-index mas alto) porque la mayoria de estos mensajes aparecen justo despues de cerrar
// uno. Se cierra sola a los 7s o con la X, lo que pase primero.
function mostrarToast(mensaje, tipo) {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${tipo === 'ok' ? 'ok' : 'error'}`;
  el.innerHTML = `<span>${esc(mensaje)}</span><button aria-label="Cerrar">×</button>`;
  const quitar = () => el.remove();
  el.querySelector('button').onclick = quitar;
  root.appendChild(el);
  setTimeout(quitar, 7000);
}
