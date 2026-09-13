/* ============== PERFIL: estadísticas de la dupla del usuario (o de quien elija admin/jefe) ============== */
// dupla_asignada es un array: un usuario puede tener varias duplas (la propia + las que se fue
// creando). Para "Ver perfil de" cada (usuario, dupla) es una fila separada — Opción A.
async function cargarPerfilesUsuarios() {
  const { data, error } = await obtenerUsuarios();
  perfilesCache = error ? { error: error.message } : {
    rows: (data || []).flatMap(u => (u.dupla_asignada || []).map(d => enmascararFilaUsuario({
      _key: `${u.id}::${d}`,
      id: u.id,
      nombre_completo: u.nombre_completo,
      dupla_asignada: d,
    }))),
  };
  renderVistaPerfil();
}

// Trae la tabla "metas" de nuevo y actualiza D.metas en memoria, sin recargar todo lo demás
async function recargarMetas() {
  const { data, error } = await obtenerMetas();
  if (error) return;
  D.metas = (data || []).map(r => ({ _id: r.id, dupla: r.dupla, trimestre: r.trimestre, objetivo_polizas: r.objetivo_polizas }));
  render();
}

function vistaPerfil() {
  if (canalMetas === null) {
    vistaConSuscripcion = 'perfil';
    canalMetas = suscribirseMetas(() => recargarMetas());
  }

  const puedeVerOtros = perfil.rol === 'admin' || perfil.rol === 'jefe';
  if (puedeVerOtros && perfilesCache === null) {
    $('#app').innerHTML = `<div class="loading"><img src="logo-transparente.png" alt="Cargando"></div>`;
    cargarPerfilesUsuarios();
    return;
  }
  renderVistaPerfil();
}

function renderVistaPerfil() {
  const puedeVerOtros = perfil.rol === 'admin' || perfil.rol === 'jefe';
  const tieneDupla = perfil.rol === 'editor' || perfil.rol === 'carga_pas';

  let duplaObjetivo = null;
  let nombreObjetivo = perfil.nombre_completo || '';
  let selectorHtml = '';

  if (puedeVerOtros) {
    if (perfilesCache && perfilesCache.error) {
      $('#app').innerHTML = `<div class="top"><div><h1>Perfil</h1></div></div><div class="card"><div class="formerr">No se pudieron cargar los usuarios: ${esc(perfilesCache.error)}</div></div>`;
      return;
    }
    const opciones = (perfilesCache && perfilesCache.rows) || [];
    if (!state.perfilObjetivoId && opciones.length) state.perfilObjetivoId = opciones[0]._key;
    const elegido = opciones.find(o => o._key === state.perfilObjetivoId);
    duplaObjetivo = elegido ? elegido.dupla_asignada : null;
    nombreObjetivo = elegido ? elegido.nombre_completo : '';
    selectorHtml = `<div class="card section"><div class="formgrid"><div class="full"><label>Ver perfil de</label><select id="perfil-selector">${opciones.map(o => `<option value="${esc(o._key)}" ${o._key === state.perfilObjetivoId ? 'selected' : ''}>${esc(o.nombre_completo)} (${esc(o.dupla_asignada)})</option>`).join('') || '<option>No hay usuarios con dupla asignada</option>'}</select></div></div></div>`;
  } else if (tieneDupla) {
    const misDuplas = perfil.dupla_asignada || [];
    if (!state.miDuplaSel || !misDuplas.includes(state.miDuplaSel)) state.miDuplaSel = misDuplas[0] || null;
    duplaObjetivo = state.miDuplaSel;
    if (misDuplas.length > 1) {
      selectorHtml = `<div class="card section"><div class="formgrid"><div class="full"><label>Tu dupla</label><select id="mi-dupla-selector">${misDuplas.map(d => `<option value="${esc(d)}" ${d === state.miDuplaSel ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div></div></div>`;
    }
  }

  // Solo admin, y solo si hay una dupla seleccionada: borra esa dupla para TODOS los usuarios que
  // la tengan (no solo el que se está viendo), a diferencia de "Tus duplas" que es por editor.
  const adminBorrarDuplaHtml = (perfil.rol === 'admin' && duplaObjetivo)
    ? `<div class="card section"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"><span class="sub" style="margin:0">Dupla ${esc(duplaObjetivo)}</span><button class="btn-danger" id="btn-eliminar-dupla-admin" data-dupla-admin="${esc(duplaObjetivo)}">Eliminar dupla</button></div></div>`
    : '';

  const cuerpo = duplaObjetivo
    ? renderEstadisticasDupla(duplaObjetivo)
    : '<div class="card"><div class="empty">Este perfil no tiene una dupla asociada, no hay estadísticas de producción para mostrar.</div></div>';

  const metaHtml = duplaObjetivo ? renderMetaDupla(duplaObjetivo) : '';
  const formMetaHtml = (duplaObjetivo && puedeEditarMetas()) ? renderFormMeta(duplaObjetivo) : '';

  const misDuplasEditor = perfil.rol === 'editor' ? (perfil.dupla_asignada || []) : [];
  // Con una sola dupla no tiene sentido ofrecer borrarla (el rol la necesita para operar)
  const tusDuplasHtml = misDuplasEditor.length > 1
    ? `<div class="card section"><h3>Tus duplas</h3>${misDuplasEditor.map(d => `<div class="barrow"><span>${esc(d)}</span><button class="btn-del" data-eliminar-dupla="${esc(d)}" title="Eliminar dupla">×</button></div>`).join('')}</div>`
    : '';

  const crearDuplaHtml = perfil.rol === 'editor'
    ? `<div class="card section"><h3>Crear nueva dupla</h3><div class="formgrid"><div class="full"><label>Nombre de la dupla</label><input id="perfil-nueva-dupla" placeholder="Ej: PEREZ/GOMEZ"></div></div><div id="perfil-dupla-msg"></div><div class="modal-actions" style="justify-content:flex-start"><button class="btn-primary" id="btn-crear-dupla">Crear dupla</button></div></div>`
    : '';

  $('#app').innerHTML = `<div class="top"><div><h1>Perfil</h1><div class="sub">${esc(nombreObjetivo)}${duplaObjetivo ? ' · ' + esc(duplaObjetivo) : ''}</div></div></div>${selectorHtml}${adminBorrarDuplaHtml}${metaHtml}${formMetaHtml}${cuerpo}${tusDuplasHtml}${crearDuplaHtml}`;

  if (puedeVerOtros) {
    const sel = document.getElementById('perfil-selector');
    if (sel) sel.onchange = e => { state.perfilObjetivoId = e.target.value; renderVistaPerfil(); };
  }
  const selMiDupla = document.getElementById('mi-dupla-selector');
  if (selMiDupla) selMiDupla.onchange = e => { state.miDuplaSel = e.target.value; renderVistaPerfil(); };
  document.querySelectorAll('[data-pas]').forEach(e => e.onclick = () => { state.pas = e.dataset.pas; state.view = 'ficha'; render(); });

  const btnEditarMeta = document.getElementById('btn-editar-meta');
  if (btnEditarMeta) {
    btnEditarMeta.onclick = () => {
      const input = document.getElementById('meta-objetivo');
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input.focus();
      input.select();
    };
  }

  const btnBorrarMeta = document.getElementById('btn-borrar-meta');
  if (btnBorrarMeta) {
    btnBorrarMeta.onclick = () => {
      const trimestre = btnBorrarMeta.dataset.trimMeta;
      confirmarAccion(`¿Eliminar la meta de ${duplaObjetivo} (${trimestre})? Esta acción no se puede deshacer.`, async () => {
        btnBorrarMeta.disabled = true;
        const { error } = await eliminarMeta(Number(btnBorrarMeta.dataset.borrarMeta));
        if (error) { mostrarToast(error.message, 'error'); btnBorrarMeta.disabled = false; return; }
        D = await cargarDatos();
        renderVistaPerfil();
      });
    };
  }

  if (formMetaHtml) {
    const selTrim = document.getElementById('meta-trim');
    const inputObjetivo = document.getElementById('meta-objetivo');
    selTrim.onchange = () => {
      const existente = (D.metas || []).find(m => m.dupla === duplaObjetivo && m.trimestre === selTrim.value);
      inputObjetivo.value = existente ? existente.objetivo_polizas : '';
    };
    document.getElementById('btn-guardar-meta').onclick = async () => {
      const btn = document.getElementById('btn-guardar-meta');
      const msg = document.getElementById('meta-msg');
      msg.innerHTML = '';
      const trimestre = selTrim.value;
      const objetivo = Number(inputObjetivo.value);
      if (!objetivo || objetivo <= 0) { msg.innerHTML = '<div class="formerr">Cargá un objetivo de pólizas mayor a cero.</div>'; return; }

      btn.disabled = true; btn.textContent = 'Guardando...';
      const { error } = await guardarMeta({ dupla: duplaObjetivo, trimestre, objetivo_polizas: objetivo });
      btn.disabled = false; btn.textContent = 'Guardar meta';
      if (error) { msg.innerHTML = `<div class="formerr">No se pudo guardar: ${esc(error.message)}</div>`; return; }
      msg.innerHTML = '<div class="formok">Meta guardada correctamente.</div>';
      D = await cargarDatos();
      setTimeout(renderVistaPerfil, 700);
    };
  }

  document.querySelectorAll('[data-eliminar-dupla]').forEach(btn => {
    btn.onclick = () => {
      const nombre = btn.dataset.eliminarDupla;
      confirmarAccion(`¿Eliminar la dupla "${nombre}"? Esta acción no se puede deshacer.`, async () => {
        btn.disabled = true;
        const { error } = await eliminarDuplaPropia(nombre);
        if (error) { mostrarToast(error.message, 'error'); btn.disabled = false; return; }
        if (state.miDuplaSel === nombre) state.miDuplaSel = null;
        D = await cargarDatos();
        perfil = await cargarPerfil();
        actualizarSidebarDuplas();
        renderVistaPerfil();
      });
    };
  });

  const btnEliminarDuplaAdmin = document.getElementById('btn-eliminar-dupla-admin');
  if (btnEliminarDuplaAdmin) {
    btnEliminarDuplaAdmin.onclick = () => {
      const nombre = btnEliminarDuplaAdmin.dataset.duplaAdmin;
      confirmarAccion(`¿Eliminar la dupla "${nombre}"? Se le saca a todos los usuarios que la tengan. Esta acción no se puede deshacer.`, async () => {
        btnEliminarDuplaAdmin.disabled = true;
        const { error } = await eliminarDuplaAdmin(nombre);
        if (error) { mostrarToast(error.message, 'error'); btnEliminarDuplaAdmin.disabled = false; return; }
        mostrarToast('Dupla eliminada correctamente.', 'ok');
        state.perfilObjetivoId = null;
        perfilesCache = null;
        D = await cargarDatos();
        vistaPerfil();
      });
    };
  }

  if (perfil.rol === 'editor') {
    document.getElementById('btn-crear-dupla').onclick = async () => {
      const btn = document.getElementById('btn-crear-dupla');
      const msg = document.getElementById('perfil-dupla-msg');
      msg.innerHTML = '';
      const nombre = document.getElementById('perfil-nueva-dupla').value.trim();
      if (!nombre) { msg.innerHTML = '<div class="formerr">Escribí un nombre para la dupla.</div>'; return; }
      if (D.catalog.ejecutivos.includes(nombre)) { msg.innerHTML = '<div class="formerr">Ya existe una dupla con ese nombre.</div>'; return; }

      btn.disabled = true; btn.textContent = 'Creando...';
      // El RPC agrega la dupla al catalogo Y la vincula a la fila propia de usuarios (dupla_asignada),
      // corriendo con permisos elevados (security definer) acotados a exactamente esta accion.
      const { error } = await crearDuplaPropia(nombre);
      btn.disabled = false; btn.textContent = 'Crear dupla';
      if (error) { msg.innerHTML = `<div class="formerr">No se pudo crear: ${esc(error.message)}</div>`; return; }
      msg.innerHTML = '<div class="formok">Dupla creada correctamente.</div>';
      state.miDuplaSel = nombre;
      D = await cargarDatos();
      perfil = await cargarPerfil();
      actualizarSidebarDuplas();
      const input = document.getElementById('perfil-nueva-dupla');
      if (input) input.value = '';
      setTimeout(renderVistaPerfil, 700);
    };
  }
}

/* ============== META TRIMESTRAL (objetivo de pólizas por dupla) ============== */
function renderMetaDupla(dupla) {
  const metasDupla = (D.metas || []).filter(m => m.dupla === dupla);
  if (!metasDupla.length) {
    return `<div class="card section"><h3>Meta trimestral</h3><div class="empty">Esta dupla todavía no tiene ninguna meta cargada.</div></div>`;
  }
  // Se muestra la meta del trimestre en curso. Si no hay una, la más reciente que ya haya empezado
  // (y recién en última instancia una futura). Antes se tomaba siempre la de mayor trimestre, así
  // que cargar por adelantado la meta del trimestre que viene hacía que el panel pasara a medir el
  // avance de un trimestre que ni arrancó: 0% y "faltan N pólizas" mientras el equipo iba bien.
  const ordenHoy = trimestreOrdenActual();
  const porFecha = [...metasDupla].sort((a, b) => trimestreOrden(b.trimestre) - trimestreOrden(a.trimestre));
  const meta = porFecha.find(m => trimestreOrden(m.trimestre) === ordenHoy)
    || porFecha.find(m => trimestreOrden(m.trimestre) <= ordenHoy)
    || porFecha[0];
  const esFutura = trimestreOrden(meta.trimestre) > ordenHoy;
  const objetivo = meta.objetivo_polizas || 0;
  const actual = D.production
    .filter(x => x.EJECUTIVO === dupla && x.TRIMESTRE === meta.trimestre)
    .reduce((s, x) => s + (+x.TOTAL || 0), 0);
  const pct = objetivo > 0 ? Math.min(100, actual / objetivo * 100) : 0;
  const diff = objetivo - actual;
  const textoDiff = diff > 0
    ? `Faltan ${fmt(diff)} pólizas`
    : diff === 0
      ? '¡Objetivo cumplido!'
      : `¡Objetivo cumplido! +${fmt(-diff)} de más`;

  const botonesMeta = puedeEditarMetas()
    ? `<div style="display:flex;gap:8px"><button class="btn-secondary" id="btn-editar-meta">Editar</button><button class="btn-danger" id="btn-borrar-meta" data-borrar-meta="${meta._id}" data-trim-meta="${esc(meta.trimestre)}">Eliminar meta</button></div>`
    : '';

  return `<div class="card section"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px"><h3 style="margin:0">Meta trimestral</h3>${botonesMeta}</div><div class="profile"><div class="field"><b>Dupla</b>${esc(dupla)}</div><div class="field"><b>Trimestre</b>${esc(meta.trimestre)}</div><div class="field"><b>Objetivo</b>${fmt(objetivo)}</div><div class="field"><b>Actual</b>${fmt(actual)}</div></div><div class="bar" style="margin-top:12px"><i style="width:${pct}%"></i></div><div class="sub" style="margin-top:8px">${textoDiff}</div>${esFutura ? `<p class="notice" style="margin-top:10px">La única meta cargada para esta dupla es la de ${esc(meta.trimestre)}, que todavía no empezó. El avance de arriba es el de ese trimestre, no el del actual.</p>` : ''}</div>`;
}

// Solo admin: alta/edición de la meta de la dupla seleccionada (RLS ya lo exige del lado del servidor, esto es solo la UI)
function renderFormMeta(dupla) {
  const trimestresOrdenados = [...D.catalog.trimestres].sort((a, b) => trimestreOrden(a) - trimestreOrden(b));
  const metasDupla = (D.metas || []).filter(m => m.dupla === dupla);
  const ultimaMeta = [...metasDupla].sort((a, b) => trimestreOrden(b.trimestre) - trimestreOrden(a.trimestre))[0];
  const trimInicial = ultimaMeta ? ultimaMeta.trimestre : trimestresOrdenados[0];
  const objetivoInicial = ultimaMeta ? ultimaMeta.objetivo_polizas : '';

  return `<div class="card section"><h3>Cargar / editar meta</h3><div class="formgrid">
    <div><label>Trimestre</label><select id="meta-trim">${trimestresOrdenados.map(t => `<option value="${esc(t)}" ${t === trimInicial ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
    <div><label>Objetivo de pólizas</label><input type="number" min="1" id="meta-objetivo" value="${esc(objetivoInicial)}" placeholder="Ej: 50"></div>
  </div><div id="meta-msg"></div><div class="modal-actions" style="justify-content:flex-start"><button class="btn-primary" id="btn-guardar-meta">Guardar meta</button></div></div>`;
}

function renderEstadisticasDupla(dupla) {
  const rows = D.production.filter(x => x.EJECUTIVO === dupla);
  const total = rows.reduce((s, x) => s + (+x.TOTAL || 0), 0);
  // Se cuenta y se rankea por id de PAS, no por nombre: hay nombres repetidos en la base y por
  // nombre dos PAS distintos caían en la misma fila del ranking con la producción sumada.
  const pasSet = new Set(rows.map(x => x._pas_id));
  const ramo = {}, comp = {}, trim = {}, porPas = {}, nombrePorPasId = {};
  rows.forEach(x => {
    ramo[x.RAMO] = (ramo[x.RAMO] || 0) + (+x.TOTAL || 0);
    Object.entries(x.COMPANIAS).forEach(([c, v]) => comp[c] = (comp[c] || 0) + (+v || 0));
    trim[x.TRIMESTRE] = (trim[x.TRIMESTRE] || 0) + (+x.TOTAL || 0);
    porPas[x._pas_id] = (porPas[x._pas_id] || 0) + (+x.TOTAL || 0);
    nombrePorPasId[x._pas_id] = x.PAS;
  });
  const topRamo = Object.entries(ramo).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topComp = Object.entries(comp).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topPas = Object.entries(porPas).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const trimestresAsc = [...new Set(rows.map(x => x.TRIMESTRE))].sort((a, b) => trimestreOrden(a) - trimestreOrden(b));
  const serieTotal = trimestresAsc.map(t => rows.filter(x => x.TRIMESTRE === t).reduce((s, x) => s + (x.TOTAL || 0), 0));
  const max = a => Math.max(...a.map(x => x[1]), 1);

  return `<div class="grid kpis"><div class="card kpi"><div class="label">Pólizas cargadas</div><div class="num">${fmt(total)}</div></div><div class="card kpi"><div class="label">PAS a cargo</div><div class="num">${fmt(pasSet.size)}</div></div><div class="card kpi"><div class="label">Ramos activos</div><div class="num">${fmt(topRamo.length)}</div></div><div class="card kpi"><div class="label">Compañías activas</div><div class="num">${fmt(topComp.length)}</div></div></div><div class="grid two section"><div class="card"><h3>Top PAS</h3>${topPas.map(([k, v], i) => `<div class="barrow"><span class="link" data-pas="${esc(k)}">${esc(nombrePorPasId[k])}</span><div class="bar"><i style="width:${v / max(topPas) * 100}%;background:${colorPorRanking(i, topPas.length)}"></i></div><b>${fmt(v)}</b></div>`).join('') || '<div class="empty">Sin producción</div>'}</div><div class="card"><h3>Evolución trimestral</h3>${svgLineChart(trimestresAsc, serieTotal)}</div></div><div class="grid two section"><div class="card"><h3>Producción por ramo</h3>${topRamo.map(([k, v], i) => `<div class="barrow"><span>${esc(k)}</span><div class="bar"><i style="width:${v / max(topRamo) * 100}%;background:${colorPorRanking(i, topRamo.length)}"></i></div><b>${fmt(v)}</b></div>`).join('') || '<div class="empty">Sin datos</div>'}</div><div class="card"><h3>Top compañías</h3>${topComp.map(([k, v]) => `<div class="barrow"><span>${esc(k)}</span><div class="bar"><i style="width:${v / max(topComp) * 100}%;background:${colorParaCompania(k)}"></i></div><b>${fmt(v)}</b></div>`).join('') || '<div class="empty">Sin datos</div>'}</div></div>`;
}
