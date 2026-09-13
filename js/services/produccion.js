/* ============== SERVICIO: PRODUCCIÓN (cargas de pólizas) ============== */

/* Nombre visible de cada campo, para los avisos de choque. */
const ETIQUETA_CAMPO_PROD = {
  ramo: 'Ramo',
  trimestre: 'Trimestre',
  organizador: 'Organizador',
  fecha: 'Fecha',
  detalle: 'Compañías y cantidades',
};
const CAMPOS_PROD = ['ramo', 'trimestre', 'organizador', 'fecha', 'detalle'];
const etiquetaProd = campo => ETIQUETA_CAMPO_PROD[campo] || campo;

/* Foto del formulario al abrirlo y versión que tenía la carga entonces. Es la
 * referencia para saber qué tocó el usuario. Ver la explicación larga en
 * js/services/productores.js, que hace lo mismo con los datos del PAS. */
let formProdOriginal = null;
let formProdVersion = null;

// El detalle por compañía, siempre ordenado: es lo que permite compararlo como
// un valor más. Sin un orden fijo, dos detalles idénticos podrían parecer
// distintos solo porque las filas se cargaron en otro orden.
function detalleOrdenado(detalle) {
  return [...(detalle || [])].sort((a, b) => String(a.compania).localeCompare(String(b.compania), 'es'));
}
function detalleDesdeCompanias(companias) {
  return detalleOrdenado(Object.entries(companias || {}).map(([compania, cantidad]) => ({ compania, cantidad: +cantidad || 0 })));
}
function textoDetalle(detalle) {
  return detalleOrdenado(detalle).map(d => `${d.compania}: ${d.cantidad}`).join(', ') || '(sin compañías)';
}

/* Lee el formulario de producción y devuelve la carga como la entiende el RPC.
 * Igual que en el formulario de PAS, se usa la MISMA función para la foto
 * inicial y para el guardado, así un campo intacto da un valor idéntico. */
function leerFormProduccion() {
  const filas = Array.from(document.querySelectorAll('#filas-compania .companiarow'));
  // Si el usuario agregó la misma compañía en más de una fila, se suman en vez de guardarse
  // como registros separados (podía pasar sin querer, sobre todo con listas largas de filas).
  const detalleMap = {};
  for (const fila of filas) {
    const id = fila.id.replace('fila-comp-', '');
    const comp = document.getElementById(`fc-comp-${id}`).value;
    const cant = parseInt(document.getElementById(`fc-cant-${id}`).value, 10);
    if (comp !== 'TODOS' && cant > 0) detalleMap[comp] = (detalleMap[comp] || 0) + cant;
  }
  return {
    ramo: document.getElementById('f-ramo').value,
    trimestre: document.getElementById('f-trim').value,
    organizador: document.getElementById('f-organizador').value.trim(),
    fecha: document.getElementById('f-fecha').value || null,
    detalle: detalleDesdeCompanias(detalleMap),
  };
}

// La misma carga, pero leída del objeto que tiene la app en memoria.
function registroDesdeProduccion(prod) {
  return {
    ramo: prod.RAMO,
    trimestre: prod.TRIMESTRE,
    organizador: prod.ORGANIZADOR,
    fecha: prod.FECHA,
    detalle: detalleDesdeCompanias(prod.COMPANIAS),
  };
}

// El detalle es una lista, no un valor suelto: se compara por su texto ordenado.
function mismoCampoProd(campo, a, b) {
  return campo === 'detalle' ? textoDetalle(a) === textoDetalle(b) : mismoValor(a, b);
}
function camposCambiadosProd(antes, despues) {
  const cambios = {};
  CAMPOS_PROD.forEach(k => { if (!mismoCampoProd(k, (antes || {})[k], despues[k])) cambios[k] = despues[k]; });
  return cambios;
}
const valorVisibleProd = (campo, v) =>
  campo === 'detalle' ? textoDetalle(v) : ((v === null || v === undefined || String(v).trim() === '') ? '(vacío)' : String(v));

async function guardarEdicionProduccion(prod) {
  const btn = document.getElementById('btn-guardar-prod');
  const msg = document.getElementById('form-prod-msg');
  msg.innerHTML = '';

  const registro = leerFormProduccion();
  if (registro.ramo === 'TODOS' || registro.trimestre === 'TODOS') { msg.innerHTML = '<div class="formerr">Elegí ramo y trimestre.</div>'; return; }
  if (demoAvisoFormulario('form-prod-msg')) return;
  if (registro.detalle.length === 0) { msg.innerHTML = '<div class="formerr">Agregá al menos una compañía con cantidad mayor a 0.</div>'; return; }

  // Qué tocó esta persona. A diferencia del PAS acá se manda igual la carga
  // entera —el RPC la reemplaza toda—, pero saber qué cambió cada uno es lo que
  // permite intercalar dos ediciones en vez de rechazar la segunda.
  const mios = formProdOriginal ? camposCambiadosProd(formProdOriginal, registro) : Object.assign({}, registro);

  if (Object.keys(mios).length === 0) {
    msg.innerHTML = '<div class="formok">No cambiaste nada, no hay nada para guardar.</div>';
    setTimeout(() => { cerrarModal(); render(); }, 900);
    return;
  }

  btn.disabled = true; btn.textContent = 'Guardando...';
  const resultado = await intentarGuardarProduccion(prod._id, registro, mios, formProdVersion, []);
  btn.disabled = false; btn.textContent = 'Guardar cambios';
  if (resultado.ok) return exitoProduccion(resultado.aviso);
}

/* Guardado con reintento, misma idea que en el PAS: si otra persona guardó en el
 * medio pero tocó campos distintos, se intercalan los dos cambios y listo; si
 * tocó los mismos, decide la persona.
 *
 * Una sola llamada transaccional (ver sql/2026-09-07-produccion-transaccional.sql): adentro se
 * actualiza la carga, se borra el detalle viejo y se inserta el nuevo. Antes eran tres llamadas
 * sueltas desde acá: si la última fallaba, el detalle por compañía ya estaba borrado y no había
 * forma de recuperarlo desde la app, y el mensaje que veía el usuario sonaba a error menor. */
async function intentarGuardarProduccion(id, registro, camposMios, version, cambiosDelOtro) {
  const msg = document.getElementById('form-prod-msg');

  // Segunda guarda de modo demostración: esta función también la llama el botón
  // de resolver un choque, y toda función que escriba corta por su cuenta.
  if (demoAvisoFormulario('form-prod-msg')) return { ok: false };

  for (let intento = 1; intento <= 3; intento++) {
    const { error } = await supa.rpc('guardar_produccion_completa', {
      p_produccion_id: id,
      p_ramo: registro.ramo,
      p_trimestre: registro.trimestre,
      p_organizador: registro.organizador,
      p_fecha: registro.fecha,
      p_total: registro.detalle.reduce((s, d) => s + d.cantidad, 0),
      p_detalle: registro.detalle,
      // Si otra persona editó esta carga mientras el formulario estaba abierto, el
      // RPC no encuentra la fila con esta versión y aborta ANTES de borrar el
      // detalle por compañía. Ver sql/2026-09-10-control-de-version.sql.
      p_version: version !== undefined ? version : null,
    });

    if (!error) return { ok: true, aviso: avisoDeFusionProd(cambiosDelOtro) };

    // Falló. Puede ser un choque de versión o cualquier otra cosa (permisos, red).
    // La forma de distinguirlo es mirar si la versión de la fila se movió.
    const fresca = await refrescarProduccion(id);

    if (fresca === null) {
      msg.innerHTML = '<div class="formerr">Otra persona <b>eliminó</b> esta carga mientras la editabas. No hay dónde guardar los cambios.</div>';
      return { ok: false };
    }
    if (fresca === undefined || version === null || version === undefined || fresca._version === version) {
      // La versión sigue igual (o no se pudo verificar): entonces el error no fue
      // un choque y no hay nada que fusionar. Se muestra tal cual vino.
      msg.innerHTML = `<div class="formerr">No se pudo guardar, no se modificó nada: ${esc(error.message)}</div>`;
      return { ok: false };
    }

    const suyos = camposCambiadosProd(formProdOriginal || {}, registroDesdeProduccion(fresca));
    const pisados = Object.keys(camposMios).filter(k => k in suyos && !mismoCampoProd(k, camposMios[k], suyos[k]));

    if (pisados.length > 0) {
      pedirQueResuelvaElChoqueProd(id, camposMios, suyos, pisados, fresca);
      return { ok: false };
    }

    // Tocaron cosas distintas: se parte de lo que hay ahora en la base y se le
    // aplica encima lo que cambió esta persona. Así conviven los dos.
    registro = Object.assign(registroDesdeProduccion(fresca), camposMios);
    Object.keys(suyos).forEach(k => { if (!cambiosDelOtro.includes(k)) cambiosDelOtro.push(k); });
    version = fresca._version;
  }

  msg.innerHTML = '<div class="formerr">Hay varias personas guardando esta carga al mismo tiempo y no se pudo intercalar el cambio. <b>No se guardó nada.</b> Esperá unos segundos y volvé a intentar.</div>';
  return { ok: false };
}

function avisoDeFusionProd(cambiosDelOtro) {
  if (!cambiosDelOtro || cambiosDelOtro.length === 0) return '';
  return `Mientras editabas, otra persona cambió ${cambiosDelOtro.map(etiquetaProd).join(', ')}. Eso se respetó: quedaron los dos cambios.`;
}

/* Los dos tocaron el mismo campo. Se muestran los dos valores y elige la
 * persona. Nada se guardó todavía. */
function pedirQueResuelvaElChoqueProd(id, camposMios, suyos, pisados, fresca) {
  const msg = document.getElementById('form-prod-msg');
  const tambien = Object.keys(suyos).filter(k => !pisados.includes(k));

  const filas = pisados.map(campo => `
    <div class="choque-campo">
      <b>${esc(etiquetaProd(campo))}</b>
      <label><input type="radio" name="choque-${esc(campo)}" value="mio" checked> Lo que pusiste vos: <b>${esc(valorVisibleProd(campo, camposMios[campo]))}</b></label>
      <label><input type="radio" name="choque-${esc(campo)}" value="suyo"> Lo que guardó la otra persona: <b>${esc(valorVisibleProd(campo, suyos[campo]))}</b></label>
    </div>`).join('');

  msg.innerHTML = `
    <div class="formerr">
      <b>Los dos cambiaron lo mismo.</b> Mientras completabas el formulario, otra persona guardó cambios en ${pisados.length === 1 ? 'este campo' : 'estos campos'}.
      <b>Todavía no se guardó nada.</b> Elegí con qué valor queda cada uno:
      ${filas}
      ${tambien.length ? `<div class="choque-nota">Además cambió ${esc(tambien.map(etiquetaProd).join(', '))}. Eso se respeta tal como lo dejó.</div>` : ''}
      <div class="modal-actions"><button class="btn-primary" id="btn-resolver-choque-prod">Guardar con lo elegido</button></div>
    </div>`;

  document.getElementById('btn-resolver-choque-prod').onclick = async () => {
    const btn = document.getElementById('btn-guardar-prod');
    const elegidos = Object.assign({}, camposMios);
    // Quedarse con lo de la otra persona es no escribir ese campo: ya está así.
    pisados.forEach(campo => {
      const marcado = document.querySelector(`input[name="choque-${campo}"]:checked`);
      if (marcado && marcado.value === 'suyo') delete elegidos[campo];
    });

    msg.innerHTML = '';
    if (Object.keys(elegidos).length === 0) {
      msg.innerHTML = '<div class="formok">Listo: quedó todo como lo dejó la otra persona. No hacía falta guardar nada.</div>';
      D = await cargarDatos();
      setTimeout(() => { cerrarModal(); render(); }, 1200);
      return;
    }

    btn.disabled = true; btn.textContent = 'Guardando...';
    const registro = Object.assign(registroDesdeProduccion(fresca), elegidos);
    const resultado = await intentarGuardarProduccion(id, registro, elegidos, fresca._version, []);
    btn.disabled = false; btn.textContent = 'Guardar cambios';
    if (resultado.ok) return exitoProduccion(resultado.aviso);
  };
}

async function exitoProduccion(aviso) {
  const msg = document.getElementById('form-prod-msg');
  msg.innerHTML = '<div class="formok">Cambios guardados correctamente.</div>';
  if (aviso) mostrarToast(aviso, 'ok');
  D = await cargarDatos();
  setTimeout(() => { cerrarModal(); render(); }, 600);
}

async function guardarProduccion(p) {
  const btn = document.getElementById('btn-guardar-prod');
  const msg = document.getElementById('form-prod-msg');
  msg.innerHTML = '';

  const registro = leerFormProduccion();
  if (registro.ramo === 'TODOS' || registro.trimestre === 'TODOS') { msg.innerHTML = '<div class="formerr">Elegí ramo y trimestre.</div>'; return; }
  if (demoAvisoFormulario('form-prod-msg')) return;
  if (registro.detalle.length === 0) { msg.innerHTML = '<div class="formerr">Agregá al menos una compañía con cantidad mayor a 0.</div>'; return; }

  btn.disabled = true; btn.textContent = 'Guardando...';
  // Igual que en la edición: una sola transacción. Antes, si fallaba el insert del detalle, quedaba
  // una carga huérfana sin ninguna compañía asociada y el usuario tenía que ir a buscarla a mano.
  // Acá no hay control de versión: una carga nueva no puede chocar con nadie.
  const { error } = await supa.rpc('crear_produccion_completa', {
    p_pas_id: p._id,
    p_ramo: registro.ramo,
    p_trimestre: registro.trimestre,
    p_ejecutivo: p.EJECUTIVO,
    p_organizador: registro.organizador,
    p_fecha: registro.fecha,
    p_total: registro.detalle.reduce((s, d) => s + d.cantidad, 0),
    p_detalle: registro.detalle,
  });

  btn.disabled = false; btn.textContent = 'Guardar carga';
  if (error) {
    msg.innerHTML = `<div class="formerr">No se pudo guardar, no se creó nada: ${esc(error.message)}</div>`;
    return;
  }
  msg.innerHTML = '<div class="formok">Carga guardada correctamente.</div>';
  D = await cargarDatos();
  setTimeout(() => { cerrarModal(); render(); }, 600);
}

// Borra una carga de producción puntual
async function eliminarProduccion(produccionId) {
  const bloqueo = demoBloqueo(); if (bloqueo) return bloqueo;
  return supa.rpc('eliminar_produccion', { p_produccion_id: produccionId });
}

// Borra todo el historial de producción de un PAS (solo lo que el usuario tiene permiso de tocar; ver retorno en el llamador)
async function eliminarProduccionesPas(pasId) {
  const bloqueo = demoBloqueo(); if (bloqueo) return bloqueo;
  return supa.rpc('eliminar_producciones_pas', { p_pas_id: pasId });
}
