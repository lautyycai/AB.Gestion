/* ============== FORMULARIO: NUEVO / EDITAR PAS ============== */
async function abrirFormPAS(pasExistente) {
  const esEdicion = !!pasExistente;
  let p = pasExistente || {};

  // Refresco por acción: el formulario se llena con lo que hay en la base AHORA,
  // no con lo que se descargó al iniciar sesión. Sin esto, quien deja la pestaña
  // abierta toda la tarde edita sobre datos viejos sin enterarse, y al guardar
  // se lo rechaza el control de versión (sql/2026-09-10-control-de-version.sql).
  // Con esto, el choque solo puede pasar si dos personas tienen el formulario
  // abierto a la vez.
  if (esEdicion) {
    abrirModalCargando('Editar PAS');
    const fresco = await refrescarProductor(p._id);
    if (!modalCargandoSigueAbierto()) return; // lo cerraron mientras cargaba
    if (fresco === null) return avisarRegistroBorrado('Editar PAS', 'Otra persona eliminó este productor mientras lo tenías en pantalla. Ya no se puede editar.');
    if (fresco) p = fresco;
  }
  const duplaFija = perfil.rol === 'editor' || perfil.rol === 'carga_pas';
  const misDuplasForm = perfil.dupla_asignada || [];
  const ejecutivosOrdenados = [...D.catalog.ejecutivos].sort((a, b) => a.localeCompare(b, 'es'));
  const estadosOrdenados = [...D.catalog.estados].sort((a, b) => a.localeCompare(b, 'es'));
  const zonasOrdenadas = [...D.catalog.zonas].sort((a, b) => a.localeCompare(b, 'es'));

  const html = `
    <h2>${esEdicion ? 'Editar PAS' : 'Nuevo PAS'}</h2>
    <div class="modal-sub">${esEdicion ? esc(p.PAS) : 'Cargar un nuevo productor asesor de seguros'}</div>
    <div class="formgrid">
      <div class="full"><label>PAS (nombre)</label><input id="f-pas" value="${esc(p.PAS || '')}" placeholder="Nombre completo"></div>
      <div><label>Organización</label><input id="f-org" value="${esc(p.ORGANIZACIÓN || '')}"></div>
      <div><label>Vinculante</label><input id="f-vinc" value="${esc(p.VINCULANTE || '')}"></div>
      <div>
        <label>Ejecutivo (dupla)</label>
        ${duplaFija
      ? (misDuplasForm.length > 1
        ? `<select id="f-ejec">${misDuplasForm.map(d => `<option value="${esc(d)}" ${d === (p.EJECUTIVO || misDuplasForm[0]) ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>`
        : `<input class="readonly" readonly value="${esc(misDuplasForm[0] || '')}"><input type="hidden" id="f-ejec" value="${esc(misDuplasForm[0] || '')}">`)
      : `<select id="f-ejec">${opts(ejecutivosOrdenados, p.EJECUTIVO || 'TODOS')}</select>`}
      </div>
      <div><label>Teléfono</label><input id="f-tel" value="${esc(p.TELÉFONO || '')}"></div>
      <div><label>Mail</label><input id="f-mail" type="email" value="${esc(p.MAIL || '')}"></div>
      <div><label>Fecha de nacimiento</label><input id="f-fnac" type="date" value="${esc(p['FECHA DE NACIMIENTO'] || '')}"></div>
      <div><label>Estado</label><select id="f-estado">${opts(estadosOrdenados, p.ESTADO || 'TODOS')}</select></div>
      <div><label>Zona</label><select id="f-zona">${opts(zonasOrdenadas, p.ZONA || 'TODOS')}</select></div>
      <div class="full"><label>Localidad / Prov. <span style="font-weight:400;color:var(--muted)">(sugiere según la zona, pero podés escribir una nueva)</span></label><input id="f-loc" list="datalist-loc" value="${esc(p['LOCALIDAD/PROV'] || '')}"><datalist id="datalist-loc"></datalist></div>
      <div class="full"><label>Compañías con las que opera</label><input id="f-comp-buscar" placeholder="Buscar compañía..."><div id="f-comp-lista" class="checklist"></div></div>
      <div class="full"><label>Observaciones</label><textarea id="f-obs" rows="2">${esc(p.OBSERVACIONES || '')}</textarea></div>
    </div>
    <div id="form-pas-msg"></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="btn-cancelar-pas">Cancelar</button>
      <button class="btn-primary" id="btn-guardar-pas">${esEdicion ? 'Guardar cambios' : 'Crear PAS'}</button>
    </div>`;
  abrirModal(html);
  document.getElementById('btn-cancelar-pas').onclick = cerrarModal;
  document.getElementById('btn-guardar-pas').onclick = () => guardarPAS(esEdicion ? p._id : null);
  actualizarLocalidadesPorZona(p.ZONA || 'TODOS');
  document.getElementById('f-zona').onchange = e => actualizarLocalidadesPorZona(e.target.value);
  poblarChecklistCompanias(p['COMPAÑÍAS CON LAS QUE OPERA'] || '');

  // Foto del formulario recién llenado: es contra esto que se compara al guardar
  // para saber qué tocó el usuario y mandar solo eso. Va DESPUÉS de poblar las
  // compañías, que se dibujan aparte — tomada antes, la lista de compañías
  // figuraría como un cambio en cada guardado y chocaría contra todo el mundo.
  formPasOriginal = esEdicion ? leerFormPAS() : null;
  formPasVersion = esEdicion ? p._version : null;
}

// Arma la lista con checkbox de todas las compañías del catálogo, tildando las que el PAS ya tenía cargadas.
// Lo que el PAS tenía cargado y no matchea ninguna compañía activa (por lo general, una que se
// desactivó del catálogo) no tiene casilla para mostrarse -- se guarda en un data-attribute para que
// leerFormPAS() lo pegue de vuelta al guardar y no se pierda en silencio.
function poblarChecklistCompanias(valorExistente) {
  const yaTenia = new Set(companiasDelTexto(valorExistente, D.catalog.companias));
  const companiasOrdenadas = [...D.catalog.companias].sort((a, b) => a.localeCompare(b, 'es'));
  const cont = document.getElementById('f-comp-lista');
  cont.dataset.sinMatchear = companiasSinMatchear(valorExistente, D.catalog.companias);
  cont.innerHTML = companiasOrdenadas.map(c => {
    const marcado = yaTenia.has(c);
    return `<label data-nombre="${esc(c.toLowerCase())}"><input type="checkbox" value="${esc(c)}" ${marcado ? 'checked' : ''}>${esc(c)}</label>`;
  }).join('') || '<div class="sinresultados">No hay compañías cargadas en el catálogo.</div>';

  document.getElementById('f-comp-buscar').oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    cont.querySelectorAll('label').forEach(l => {
      l.style.display = l.dataset.nombre.includes(q) ? 'flex' : 'none';
    });
  };
}

// Arma la lista de localidades sugeridas para una zona, en base a lo que ya existe cargado en la base
function actualizarLocalidadesPorZona(zona) {
  const datalist = document.getElementById('datalist-loc');
  if (!datalist) return;
  const fuente = zona === 'TODOS' ? D.producers : D.producers.filter(p => p.ZONA === zona);
  const localidades = [...new Set(fuente.map(p => p['LOCALIDAD/PROV']).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  datalist.innerHTML = localidades.map(l => `<option value="${esc(l)}">`).join('');
}

const FILAS_POR_PAGINA = 50;

function productores() {
  // Esto se dibuja UNA sola vez al entrar a la vista (el buscador no se vuelve a crear en cada
  // letra). El reset de state.pagina a 1 vive en el handler de navegación (app.js), no acá: esta
  // función también se re-ejecuta en cualquier render() completo estando YA en la vista (desbloqueo
  // por inactividad, "atrás" del navegador) — resetear la página acá adentro devolvía de la 14 a la
  // 1 en esos casos, no solo al entrar de verdad a la vista.
  const botonNuevo = puedeCrearPas() ? `<button class="btn-primary" id="btn-nuevo-pas">+ Nuevo PAS</button>` : '';
  $('#app').innerHTML = `<div class="top"><div><h1>Productores</h1><div class="sub" id="prod-sub">Base de PAS</div></div><div class="filters" style="align-items:center"><input class="search" id="search" placeholder="Buscar PAS, organización, ejecutivo..." value="${esc(state.q)}">${botonNuevo}${barraActualizar()}</div></div><div class="card"><div id="prod-tabla"></div></div>`;
  activarBotonActualizar();
  $('#search').oninput = e => { state.q = e.target.value; state.pagina = 1; renderTablaProductores() };
  if (puedeCrearPas()) document.getElementById('btn-nuevo-pas').onclick = () => abrirFormPAS(null);
  renderTablaProductores();
}

// Encabezado de columna con desplegable de filtro (además del buscador de texto libre)
function filtroColumnaHtml(campo, etiqueta, valores) {
  return `<div class="th-filtro"><span>${etiqueta}</span><select class="th-select" data-filtro-prod="${campo}">${opts(valores, state.fProd[campo])}</select></div>`;
}

function renderTablaProductores() {
  const f = state.fProd;
  // Los campos internos (los que empiezan con "_", como _id) quedan afuera del buscador: antes
  // entraban en el texto buscado y escribir "12" te devolvía todo PAS cuyo id contuviera un 12.
  const textoBuscable = p => Object.entries(p).filter(([k]) => !k.startsWith('_')).map(([, v]) => v).join(' ');
  let list = D.producers.filter(p =>
    textoBuscable(p).toLowerCase().includes(state.q.toLowerCase()) &&
    (f.organizacion === 'TODOS' || p['ORGANIZACIÓN'] === f.organizacion) &&
    (f.vinculante === 'TODOS' || p.VINCULANTE === f.vinculante) &&
    (f.ejecutivo === 'TODOS' || p.EJECUTIVO === f.ejecutivo) &&
    (f.estado === 'TODOS' || p.ESTADO === f.estado) &&
    (f.zona === 'TODOS' || p.ZONA === f.zona) &&
    (f.localidad === 'TODOS' || p['LOCALIDAD/PROV'] === f.localidad)
  );
  list = list.slice().sort((a, b) => (a.PAS || '').localeCompare(b.PAS || '', 'es'));

  const distintos = campo => [...new Set(D.producers.map(p => p[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  const totalPaginas = Math.max(1, Math.ceil(list.length / FILAS_POR_PAGINA));
  if (state.pagina > totalPaginas) state.pagina = totalPaginas;
  if (state.pagina < 1) state.pagina = 1;
  const desde = (state.pagina - 1) * FILAS_POR_PAGINA;
  const pagina = list.slice(desde, desde + FILAS_POR_PAGINA);

  $('#prod-sub').textContent = `Base de PAS · ${fmt(list.length)} resultados`;
  $('#prod-tabla').innerHTML = `<div class="tablewrap"><table class="table"><thead><tr><th>PAS</th><th>${filtroColumnaHtml('organizacion', 'Organización', distintos('ORGANIZACIÓN'))}</th><th>${filtroColumnaHtml('vinculante', 'Vinculante', distintos('VINCULANTE'))}</th><th>${filtroColumnaHtml('ejecutivo', 'Ejecutivo', distintos('EJECUTIVO'))}</th><th>${filtroColumnaHtml('estado', 'Estado', distintos('ESTADO'))}</th><th>${filtroColumnaHtml('zona', 'Zona', distintos('ZONA'))}</th><th>${filtroColumnaHtml('localidad', 'Localidad', distintos('LOCALIDAD/PROV'))}</th><th>Pólizas vigentes</th><th></th></tr></thead><tbody>${pagina.map(p => `<tr><td class="link" data-pas="${esc(p._id)}">${esc(p.PAS)}</td><td>${esc(p.ORGANIZACIÓN)}</td><td>${esc(p.VINCULANTE)}</td><td>${esc(p.EJECUTIVO)}</td><td><span class="pill">${esc(p.ESTADO)}</span></td><td>${esc(p.ZONA)}</td><td>${esc(p['LOCALIDAD/PROV'])}</td><td>${fmt(p['CANTIDAD DE PÓLIZAS VIGENTES'])}</td><td>${puedeEliminarPas(p) ? `<button class="btn-del" data-eliminar-pas="${p._id}" data-nombre-pas="${esc(p.PAS)}" title="Eliminar PAS">×</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="9"><div class="empty">Sin resultados</div></td></tr>`}</tbody></table></div><div class="pagbar" style="display:flex;align-items:center;gap:10px;justify-content:flex-end;padding:14px 4px 2px;font-size:12px;color:var(--muted)"><button class="back" id="pag-prev" ${state.pagina <= 1 ? 'disabled' : ''} style="${state.pagina <= 1 ? 'opacity:.5;cursor:default' : ''}">← Anterior</button><span>${state.pagina} de ${totalPaginas}</span><button class="back" id="pag-next" ${state.pagina >= totalPaginas ? 'disabled' : ''} style="${state.pagina >= totalPaginas ? 'opacity:.5;cursor:default' : ''}">Siguiente →</button><span style="display:flex;align-items:center;gap:5px;margin-left:8px"><span>Ir a:</span><input type="number" id="pag-input" min="1" max="${totalPaginas}" value="${state.pagina}" style="width:56px;padding:6px 7px"></span></div>`;

  document.querySelectorAll('[data-filtro-prod]').forEach(sel => {
    sel.onchange = () => { state.fProd[sel.dataset.filtroProd] = sel.value; state.pagina = 1; renderTablaProductores(); };
  });
  document.querySelectorAll('[data-pas]').forEach(e => e.onclick = () => { state.pas = e.dataset.pas; state.view = 'ficha'; render() });
  document.querySelectorAll('[data-eliminar-pas]').forEach(btn => {
    btn.onclick = () => {
      const nombre = btn.dataset.nombrePas;
      confirmarAccion(`¿Eliminar el PAS "${nombre}"? Esta acción no se puede deshacer.`, async () => {
        btn.disabled = true;
        const { error } = await eliminarPAS(Number(btn.dataset.eliminarPas));
        if (error) { mostrarToast(error.message, 'error'); btn.disabled = false; return; }
        D = await cargarDatos();
        renderTablaProductores();
      });
    };
  });
  const prevBtn = document.getElementById('pag-prev');
  const nextBtn = document.getElementById('pag-next');
  const pagInput = document.getElementById('pag-input');
  if (prevBtn) prevBtn.onclick = () => { if (state.pagina > 1) { state.pagina--; renderTablaProductores(); } };
  if (nextBtn) nextBtn.onclick = () => { if (state.pagina < totalPaginas) { state.pagina++; renderTablaProductores(); } };
  if (pagInput) {
    const irAPagina = () => {
      let n = parseInt(pagInput.value, 10);
      if (isNaN(n)) return;
      if (n < 1) n = 1;
      if (n > totalPaginas) n = totalPaginas;
      state.pagina = n;
      renderTablaProductores();
    };
    pagInput.onkeydown = e => { if (e.key === 'Enter') irAPagina(); };
    // onchange en vez de onblur: onblur también se dispara cuando el re-render destruye el input,
    // y en ese caso releía el número viejo y revertía el cambio de página que lo había disparado
    // (tocar "Siguiente" con el cursor en este campo parecía no hacer nada).
    pagInput.onchange = irAPagina;
  }
}
