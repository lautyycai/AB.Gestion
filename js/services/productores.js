/* ============== SERVICIO: PRODUCTORES (PAS) ============== */

/* Nombre visible de cada columna, para los avisos de choque: nadie tiene por
 * qué saber que el teléfono se llama "telefono" adentro de la base. */
const ETIQUETA_CAMPO_PAS = {
  pas_nombre: 'Nombre del PAS',
  organizacion: 'Organización',
  vinculante: 'Vinculante',
  ejecutivo: 'Ejecutivo (dupla)',
  telefono: 'Teléfono',
  mail: 'Mail',
  fecha_nacimiento: 'Fecha de nacimiento',
  companias_opera: 'Compañías con las que opera',
  observaciones: 'Observaciones',
  estado: 'Estado',
  zona: 'Zona',
  localidad_prov: 'Localidad / Prov.',
};
const etiquetaPAS = campo => ETIQUETA_CAMPO_PAS[campo] || campo;
const listaEtiquetas = campos => campos.map(etiquetaPAS).join(', ');
const valorVisible = v => (v === null || v === undefined || String(v).trim() === '') ? '(vacío)' : String(v);

/* Foto del formulario en el momento de abrirlo, y versión que tenía la fila
 * entonces. Las llena abrirFormPAS(). Son la referencia contra la que se mide
 * QUÉ cambió el usuario: sin ellas habría que mandar el formulario entero y no
 * habría forma de distinguir "lo cambié yo" de "estaba así". Alcanza con una
 * variable suelta porque hay un solo formulario abierto por vez. */
let formPasOriginal = null;
let formPasVersion = null;

/* Lee el formulario y devuelve las columnas tal como van a la base.
 *
 * Se llama dos veces: al abrir el formulario (para la foto) y al guardar. Que
 * sea la MISMA función las dos veces es lo que hace confiable la comparación —
 * un campo que el usuario no tocó devuelve un valor idéntico por construcción,
 * sin depender de que dos lugares distintos normalicen igual. */
function leerFormPAS() {
  const val = id => document.getElementById(id).value.trim();
  return {
    pas_nombre: val('f-pas'),
    organizacion: val('f-org'),
    vinculante: val('f-vinc'),
    // El campo f-ejec ya viene resuelto desde el formulario (input oculto, select de duplas propias,
    // o select completo para admin), sea cual sea el rol — no hace falta bifurcar por perfil acá.
    ejecutivo: val('f-ejec') === 'TODOS' ? '' : val('f-ejec'),
    telefono: val('f-tel'),
    mail: val('f-mail'),
    fecha_nacimiento: val('f-fnac') || null,
    // El checklist solo puede tildar compañías activas del catálogo; lo que no matcheaba ninguna
    // (compañías desactivadas después de que el PAS ya las tuviera cargadas) quedó guardado aparte
    // por poblarChecklistCompanias() y se pega de vuelta acá, para no perderlo al guardar.
    companias_opera: [
      ...Array.from(document.querySelectorAll('#f-comp-lista input:checked')).map(cb => cb.value),
      ...(document.getElementById('f-comp-lista')?.dataset?.sinMatchear ? [document.getElementById('f-comp-lista').dataset.sinMatchear] : []),
    ].join(', '),
    observaciones: val('f-obs'),
    estado: val('f-estado') === 'TODOS' ? '' : val('f-estado'),
    zona: val('f-zona') === 'TODOS' ? '' : val('f-zona'),
    localidad_prov: val('f-loc'),
  };
}

async function guardarPAS(idExistente) {
  const btn = document.getElementById('btn-guardar-pas');
  const msg = document.getElementById('form-pas-msg');
  msg.innerHTML = '';

  const registro = leerFormPAS();
  if (!registro.pas_nombre) { msg.innerHTML = '<div class="formerr">El nombre del PAS es obligatorio.</div>'; return; }
  if (!registro.ejecutivo) { msg.innerHTML = '<div class="formerr">Falta elegir la dupla / ejecutivo.</div>'; return; }

  // Modo demostración: la validación ya corrió, el formulario se vio entero.
  // Acá es donde se cortaría la escritura.
  if (demoAvisoFormulario('form-pas-msg')) return;

  if (!idExistente) {
    btn.disabled = true; btn.textContent = 'Guardando...';
    // Pedimos el id de vuelta porque la ficha se abre por id, no por nombre (hay nombres
    // repetidos en la base): con el nombre solo, después de crear un PAS homónimo la app
    // abría la ficha del otro.
    const { data: guardado, error } = await supa.from('productores').insert(registro).select('id').single();
    btn.disabled = false; btn.textContent = 'Crear PAS';
    if (error) { msg.innerHTML = `<div class="formerr">No se pudo guardar: ${esc(error.message)}</div>`; return; }
    return exitoPAS(guardado, '');
  }

  // Edición: se manda SOLO lo que el usuario tocó, no el formulario entero. Es
  // lo que permite que dos personas editando campos distintos del mismo PAS no
  // se pisen — antes, cambiar la zona reescribía también el teléfono con el
  // valor viejo que tenía el formulario a la vista.
  const mios = formPasOriginal ? camposCambiados(formPasOriginal, registro) : Object.assign({}, registro);

  if (Object.keys(mios).length === 0) {
    msg.innerHTML = '<div class="formok">No cambiaste nada, no hay nada para guardar.</div>';
    setTimeout(() => { cerrarModal(); render(); }, 900);
    return;
  }

  btn.disabled = true; btn.textContent = 'Guardando...';
  const resultado = await intentarGuardarPAS(idExistente, mios, formPasVersion, []);
  btn.disabled = false; btn.textContent = 'Guardar cambios';
  if (resultado.ok) return exitoPAS({ id: idExistente }, resultado.aviso);
  // Si no se pudo, el aviso ya quedó puesto en el formulario por quien corresponda.
}

/* El guardado propiamente dicho, con reintento.
 *
 * Cada vuelta manda los campos con la versión que se cree vigente. Si la fila ya
 * no está en esa versión, alguien la modificó en el medio: se trae lo nuevo y se
 * mira si esa persona tocó ALGUNO de los campos que estamos por escribir.
 *   · No los tocó  → no hay nada que decidir. Se reintenta con la versión nueva
 *                    y el usuario se entera después, sin haber tenido que hacer nada.
 *   · Sí los tocó  → ahí sí hay que elegir, y elige la persona.
 *
 * `cambiosDelOtro` va acumulando lo que fueron cambiando los demás, para poder
 * contarlo todo junto al final. */
async function intentarGuardarPAS(idExistente, campos, version, cambiosDelOtro) {
  const msg = document.getElementById('form-pas-msg');

  // Segunda guarda de modo demostración, además de la de guardarPAS(): esta
  // función también la llama el botón de resolver un choque, y toda función que
  // escriba tiene que cortar por su cuenta (hay un test que lo verifica).
  if (demoAvisoFormulario('form-pas-msg')) return { ok: false };

  // Tres vueltas es de sobra: significa tres personas guardando el mismo
  // registro mientras esta pantalla intenta escribir. Insistir para siempre
  // podría dejar el botón colgado sin que nadie entienda por qué.
  for (let intento = 1; intento <= 3; intento++) {
    let consulta = supa.from('productores').update(campos).eq('id', idExistente);
    if (version !== null && version !== undefined) consulta = consulta.eq('version', version);

    // El .select() no es cosmético: sin él la respuesta no trae filas y no hay
    // forma de distinguir "se guardó" de "no encontró nada que guardar".
    const { data: filas, error } = await consulta.select('id');

    if (error) {
      msg.innerHTML = `<div class="formerr">No se pudo guardar: ${esc(error.message)}</div>`;
      return { ok: false };
    }
    if (filas && filas.length > 0) {
      return { ok: true, aviso: avisoDeFusion(cambiosDelOtro) };
    }

    // No encontró la fila con esa versión. Averiguamos por qué.
    const fresco = await refrescarProductor(idExistente);

    if (fresco === null) {
      msg.innerHTML = '<div class="formerr">Otra persona <b>eliminó</b> este productor mientras lo editabas. No hay dónde guardar los cambios.</div>';
      return { ok: false };
    }
    if (fresco === undefined) {
      // No pudimos ni consultar. No sabemos si fue un choque o un problema de
      // red, y adivinar sería peor: que decida la persona con la pantalla al día.
      msg.innerHTML = '<div class="formerr">No se pudo guardar y tampoco verificar por qué. <b>No se guardó nada.</b> Revisá la conexión y volvé a intentar; si sigue, recargá la página.</div>';
      return { ok: false };
    }

    // columnasDesdeProductor(fresco) trae "companias_opera" tal como está guardado en la base, pero
    // formPasOriginal lo tiene en la forma canónica que arma el checklist (orden alfabético, mayúsculas
    // del catálogo). Sin normalizar acá, cualquier PAS cuyo texto guardado no esté ya en esa forma
    // exacta figuraba como "el otro cambió las compañías" en cada choque, así lo haya tocado o no.
    const columnasFresco = columnasDesdeProductor(fresco);
    columnasFresco.companias_opera = companiasCanonico(columnasFresco.companias_opera, D.catalog.companias);
    const suyos = camposCambiados(formPasOriginal || {}, columnasFresco);
    const pisados = Object.keys(campos).filter(k => k in suyos && !mismoValor(campos[k], suyos[k]));

    if (pisados.length > 0) {
      pedirQueResuelvaElChoque(idExistente, campos, suyos, pisados, fresco);
      return { ok: false };
    }

    // Cambió otra cosa: los dos trabajos conviven. Se reintenta solo.
    Object.keys(suyos).forEach(k => { if (!cambiosDelOtro.includes(k)) cambiosDelOtro.push(k); });
    version = fresco._version;
  }

  msg.innerHTML = '<div class="formerr">Hay varias personas guardando este productor al mismo tiempo y no se pudo intercalar el cambio. <b>No se guardó nada.</b> Esperá unos segundos y volvé a intentar.</div>';
  return { ok: false };
}

// El aviso que se muestra cuando el guardado salió bien pero alguien más había
// tocado el registro. No es un error: es que la persona se entere de que la
// ficha ahora tiene además cambios que no hizo ella.
function avisoDeFusion(cambiosDelOtro) {
  if (!cambiosDelOtro || cambiosDelOtro.length === 0) return '';
  return `Mientras editabas, otra persona cambió ${listaEtiquetas(cambiosDelOtro)}. Eso se respetó: quedaron los dos cambios.`;
}

/* Los dos tocaron el mismo campo. Es el único caso que no se puede resolver
 * solo, así que se muestran los dos valores y elige la persona, campo por
 * campo. Nada se guardó todavía y lo que escribió sigue en el formulario. */
function pedirQueResuelvaElChoque(idExistente, campos, suyos, pisados, fresco) {
  const msg = document.getElementById('form-pas-msg');
  const tambien = Object.keys(suyos).filter(k => !pisados.includes(k));

  const filas = pisados.map(campo => `
    <div class="choque-campo">
      <b>${esc(etiquetaPAS(campo))}</b>
      <label><input type="radio" name="choque-${esc(campo)}" value="mio" checked> Lo que pusiste vos: <b>${esc(valorVisible(campos[campo]))}</b></label>
      <label><input type="radio" name="choque-${esc(campo)}" value="suyo"> Lo que guardó la otra persona: <b>${esc(valorVisible(suyos[campo]))}</b></label>
    </div>`).join('');

  msg.innerHTML = `
    <div class="formerr">
      <b>Los dos cambiaron lo mismo.</b> Mientras completabas el formulario, otra persona guardó cambios en ${pisados.length === 1 ? 'este campo' : 'estos campos'}.
      <b>Todavía no se guardó nada.</b> Elegí con qué valor queda cada uno:
      ${filas}
      ${tambien.length ? `<div class="choque-nota">Además cambió ${esc(listaEtiquetas(tambien))}. Eso se respeta tal como lo dejó.</div>` : ''}
      <div class="modal-actions"><button class="btn-primary" id="btn-resolver-choque">Guardar con lo elegido</button></div>
    </div>`;

  document.getElementById('btn-resolver-choque').onclick = async () => {
    const btn = document.getElementById('btn-guardar-pas');
    const elegidos = Object.assign({}, campos);
    // Quedarse con el valor de la otra persona es, simplemente, no escribir ese
    // campo: ya está así en la base.
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
    const resultado = await intentarGuardarPAS(idExistente, elegidos, fresco._version, []);
    btn.disabled = false; btn.textContent = 'Guardar cambios';
    if (resultado.ok) return exitoPAS({ id: idExistente }, resultado.aviso);
  };
}

// Cierre común de un guardado que salió bien.
async function exitoPAS(guardado, aviso) {
  const msg = document.getElementById('form-pas-msg');
  msg.innerHTML = '<div class="formok">Guardado correctamente.</div>';
  // El aviso de fusión va por toast y no adentro del formulario: el modal se
  // cierra solo enseguida, y esto la persona lo tiene que poder leer después.
  if (aviso) mostrarToast(aviso, 'ok');
  D = await cargarDatos();
  setTimeout(() => { cerrarModal(); state.pas = guardado ? guardado.id : null; state.view = state.pas ? 'ficha' : 'productores'; render(); }, 600);
}

// Borra un PAS entero (RPC del lado del servidor: valida permisos y borra en cascada)
async function eliminarPAS(pasId) {
  const bloqueo = demoBloqueo(); if (bloqueo) return bloqueo;
  return supa.rpc('eliminar_pas', { p_pas_id: pasId });
}
