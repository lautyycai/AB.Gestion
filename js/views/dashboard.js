const filteredProduction = () => D.production.filter(x => (state.org === 'TODOS' || x.ORGANIZADOR === state.org) && (state.pasSel === 'TODOS' || x.PAS === state.pasSel));

function dashboard() {
  const rows = filteredProduction(); const total = rows.reduce((s, x) => s + (+x.TOTAL || 0), 0);
  const pasSet = new Set(rows.map(x => x._pas_id));
  const ramo = {}, comp = {};
  rows.forEach(x => { ramo[x.RAMO] = (ramo[x.RAMO] || 0) + (+x.TOTAL || 0); Object.entries(x.COMPANIAS).forEach(([c, v]) => comp[c] = (comp[c] || 0) + (+v || 0)); });
  // El ranking se calcula sobre las filas YA filtradas. Antes se armaba con la producción completa
  // y el filtro solo decidía qué PAS aparecían en la lista: el KPI de arriba mostraba el total
  // filtrado y esta tabla los totales globales, dos números distintos sin nada que lo indicara.
  // Además se agrupa por id y no por nombre, para no sumar en una sola fila a dos PAS homónimos.
  const porPasId = {}, nombrePorPasId = {};
  rows.forEach(x => { porPasId[x._pas_id] = (porPasId[x._pas_id] || 0) + (+x.TOTAL || 0); nombrePorPasId[x._pas_id] = x.PAS; });
  const topP = Object.entries(porPasId).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topC = Object.entries(comp).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topRamoDash = Object.entries(ramo).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = a => Math.max(...a.map(x => x[1]), 1);

  // Desplegable 1: organizador (siempre habilitado, lista completa)
  const organizadoresTodos = [...new Set(D.production.map(x => x.ORGANIZADOR).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  // Desplegable 2: PAS -> solo se completa y habilita si ya elegiste un organizador puntual
  const exigeOrg = state.org !== 'TODOS';
  const pasDisponibles = exigeOrg
    ? [...new Set(D.production.filter(x => x.ORGANIZADOR === state.org).map(x => x.PAS))].sort((a, b) => a.localeCompare(b, 'es'))
    : [];

  // Dupla comercial asociada al organizador elegido (dato informativo, no un filtro clickeable)
  let duplaTexto = '';
  if (exigeOrg) {
    const duplas = [...new Set(D.production.filter(x => x.ORGANIZADOR === state.org).map(x => x.EJECUTIVO).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    duplaTexto = duplas.length === 1 ? duplas[0] : (duplas.length > 1 ? duplas.join(' + ') + ' (compartido)' : '—');
  }

  $('#app').innerHTML = `<div class="top"><div><h1>Dashboard</h1><div class="sub">Visión ejecutiva de productores y producción</div></div><div class="filters"><select class="select" id="forg">${opts(organizadoresTodos, state.org)}</select><select class="select" id="fpas" ${exigeOrg ? '' : 'disabled'}>${exigeOrg ? opts(pasDisponibles, state.pasSel) : '<option>Elegí un organizador primero</option>'}</select>${exigeOrg ? `<span class="pill" style="align-self:center;white-space:nowrap">Dupla: ${esc(duplaTexto)}</span>` : ''}${barraActualizar()}</div></div><div class="grid kpis"><div class="card kpi"><div class="kpi-icon" style="background:rgba(27,135,99,.12);color:#1B8763">${ICONO_DOC}</div><div class="label">Pólizas cargadas</div><div class="num">${fmt(total)}</div></div><div class="card kpi"><div class="kpi-icon" style="background:rgba(27,58,92,.12);color:#1B3A5C">${ICONO_PERSONA}</div><div class="label">PAS en producción</div><div class="num">${fmt(pasSet.size)}</div></div><div class="card kpi"><div class="kpi-icon" style="background:rgba(45,108,166,.12);color:#2D6CA6">${ICONO_EDIFICIO}</div><div class="label">Compañías</div><div class="num">${fmt(D.catalog.companias.length)}</div></div><div class="card kpi"><div class="kpi-icon" style="background:rgba(193,97,63,.12);color:#C1613F">${ICONO_MALETIN}</div><div class="label">Organizaciones</div><div class="num">${fmt(D.catalog.organizaciones.length)}</div></div></div><div class="grid two section"><div class="card"><h3>${ICONO_BARRAS}Producción por ramo</h3>${topRamoDash.map(([k, v], i) => `<div class="barrow"><span>${esc(k)}</span><div class="bar"><i style="width:${v / max(topRamoDash) * 100}%;background:${colorPorRanking(i, topRamoDash.length)}"></i></div><b>${fmt(v)}</b></div>`).join('') || '<div class="empty">Sin datos</div>'}</div><div class="card"><h3>${ICONO_ESTRELLA}Top PAS</h3>${topP.map(([k, v], i) => `<div class="barrow"><span style="display:flex;align-items:center;gap:6px">${medalla(i)}<span class="link" data-pas="${esc(k)}">${esc(nombrePorPasId[k])}</span></span><div class="bar"><i style="width:${v / max(topP) * 100}%;background:${colorPorRanking(i, topP.length)}"></i></div><b>${fmt(v)}</b></div>`).join('')}</div></div><div class="grid two section"><div class="card"><h3>${ICONO_EDIFICIO}Top compañías</h3>${topC.map(([k, v]) => `<div class="barrow"><span>${esc(k)}</span><div class="bar"><i style="width:${v / max(topC) * 100}%;background:${colorParaCompania(k)}"></i></div><b>${fmt(v)}</b></div>`).join('')}</div><div class="card"><h3>${ICONO_BASE}Estado de la base</h3><div class="profile"><div class="field"><b>PAS totales</b>${fmt(D.producers.length)}</div><div class="field"><b>Con teléfono</b>${fmt(D.producers.filter(p => p.TELÉFONO).length)}</div><div class="field"><b>Con mail</b>${fmt(D.producers.filter(p => p.MAIL).length)}</div><div class="field"><b>Con organización</b>${fmt(D.producers.filter(p => p.ORGANIZACIÓN).length)}</div></div><p class="notice">Los filtros se aplican a la producción. La ficha individual consulta toda la información disponible.</p></div></div>`;
  activarBotonActualizar();
  $('#forg').onchange = e => { state.org = e.target.value; state.pasSel = 'TODOS'; render() };
  if (exigeOrg) $('#fpas').onchange = e => { state.pasSel = e.target.value; render() };
  document.querySelectorAll('[data-pas]').forEach(e => e.onclick = () => { state.pas = e.dataset.pas; state.view = 'ficha'; render() })
}
