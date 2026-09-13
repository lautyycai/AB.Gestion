/* ============== COMPARAR: helpers de datos y gráfico multi-línea ============== */
const DIMENSIONES_COMPARAR = [
  { valor: 'ZONA', etiqueta: 'Zona' },
  { valor: 'PAS', etiqueta: 'PAS' },
  { valor: 'ORGANIZACION', etiqueta: 'Organización' },
  { valor: 'EJECUTIVO', etiqueta: 'Ejecutivo / Dupla' },
  { valor: 'COMPANIA', etiqueta: 'Compañía' },
  { valor: 'RAMO', etiqueta: 'Ramo' },
];

function itemsParaDimension(dim) {
  if (dim === 'ZONA') return [...D.catalog.zonas].sort((a, b) => a.localeCompare(b, 'es'));
  // Comparar es por nombre a propósito (se comparan etiquetas, no fichas), pero deduplicamos:
  // con nombres repetidos en la base el mismo PAS aparecía dos veces en la lista y tildar uno
  // dejaba los dos marcados. Ojo: una serie de un nombre repetido suma a todos sus homónimos.
  if (dim === 'PAS') return [...new Set(D.producers.map(p => p.PAS).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  // Ídem PAS, y por el mismo motivo pero al revés: acá la lista NO puede salir del catálogo.
  // ORGANIZADOR es un campo de texto libre en cada carga (precargado desde la organización del
  // PAS, pero editable al cargar producción — ver ficha.js), así que puede no coincidir con
  // ninguna entrada del catálogo. Si la lista saliera de D.catalog.organizaciones, elegir una
  // organización cuyo texto real difiere (un typo, una edición) mostraba la serie en cero sin
  // ningún aviso: filasParaDimension() filtra por igualdad exacta contra este mismo campo.
  if (dim === 'ORGANIZACION') return [...new Set(D.production.map(x => x.ORGANIZADOR).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  if (dim === 'EJECUTIVO') return [...D.catalog.ejecutivos].sort((a, b) => a.localeCompare(b, 'es'));
  if (dim === 'COMPANIA') return [...D.catalog.companias].sort((a, b) => a.localeCompare(b, 'es'));
  if (dim === 'RAMO') return [...D.catalog.ramos].sort((a, b) => a.localeCompare(b, 'es'));
  return [];
}

// Serie de producción por trimestre para un elemento puntual de una dimensión (siempre sobre TODA la base)
function serieComparar(dim, valor, trimestres) {
  if (dim === 'COMPANIA') {
    return trimestres.map(t => D.production.filter(x => x.TRIMESTRE === t).reduce((s, x) => s + (x.COMPANIAS[valor] || 0), 0));
  }
  if (dim === 'ZONA') {
    const pasesEnZona = new Set(D.producers.filter(p => p.ZONA === valor).map(p => p.PAS));
    return trimestres.map(t => D.production.filter(x => x.TRIMESTRE === t && pasesEnZona.has(x.PAS)).reduce((s, x) => s + (x.TOTAL || 0), 0));
  }
  const campo = dim === 'PAS' ? 'PAS' : dim === 'ORGANIZACION' ? 'ORGANIZADOR' : dim === 'EJECUTIVO' ? 'EJECUTIVO' : 'RAMO';
  return trimestres.map(t => D.production.filter(x => x.TRIMESTRE === t && x[campo] === valor).reduce((s, x) => s + (x.TOTAL || 0), 0));
}

// Todas las filas de producción que corresponden a un elemento puntual de una dimensión (todo el histórico)
function filasParaDimension(dim, valor) {
  if (dim === 'COMPANIA') return D.production.filter(x => (x.COMPANIAS[valor] || 0) > 0);
  if (dim === 'ZONA') {
    const pasesEnZona = new Set(D.producers.filter(p => p.ZONA === valor).map(p => p.PAS));
    return D.production.filter(x => pasesEnZona.has(x.PAS));
  }
  const campo = dim === 'PAS' ? 'PAS' : dim === 'ORGANIZACION' ? 'ORGANIZADOR' : dim === 'EJECUTIVO' ? 'EJECUTIVO' : 'RAMO';
  return D.production.filter(x => x[campo] === valor);
}

// Ranking (top 8) de un campo simple (PAS, RAMO, ORGANIZADOR) dentro de un conjunto de filas
function rankingPorCampo(filas, campo, top = 8) {
  const acc = {};
  filas.forEach(x => { const k = x[campo]; if (k) acc[k] = (acc[k] || 0) + (x.TOTAL || 0); });
  return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, top);
}

// Ranking (top 8) de compañías dentro de un conjunto de filas (la cantidad está en x.COMPANIAS, no en un campo directo)
function rankingCompanias(filas, top = 8) {
  const acc = {};
  filas.forEach(x => Object.entries(x.COMPANIAS).forEach(([c, v]) => { acc[c] = (acc[c] || 0) + v; }));
  return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, top);
}

const TIPOS_DESGLOSE = [
  { valor: 'PAS', etiqueta: 'PAS' },
  { valor: 'RAMO', etiqueta: 'Ramos' },
  { valor: 'COMPANIA', etiqueta: 'Compañías' },
  { valor: 'ORGANIZACION', etiqueta: 'Organizaciones' },
];

function rankingParaTipo(tipo, filas) {
  if (tipo === 'PAS') return rankingPorCampo(filas, 'PAS');
  if (tipo === 'RAMO') return rankingPorCampo(filas, 'RAMO');
  if (tipo === 'COMPANIA') return rankingCompanias(filas);
  if (tipo === 'ORGANIZACION') return rankingPorCampo(filas, 'ORGANIZADOR');
  return [];
}

function bloqueRanking(titulo, datos, tipo) {
  if (!datos.length) return `<div class="card"><h3>${esc(titulo)}</h3><div class="empty">Sin datos</div></div>`;
  const max = datos[0][1] || 1;
  return `<div class="card"><h3>${esc(titulo)}</h3>${datos.map(([k, v], i) => `<div class="barrow"><span>${esc(k)}</span><div class="bar"><i style="width:${v / max * 100}%;background:${tipo === 'COMPANIA' ? colorParaCompania(k) : colorPorRanking(i, datos.length)}"></i></div><b>${fmt(v)}</b></div>`).join('')}</div>`;
}

const MAX_SELECCION_COMPARAR = 6;

function comparar() {
  // Al tildar un checkbox se re-renderiza toda la vista: guardamos scroll y texto buscado para no perderlos
  const listaAnterior = document.getElementById('cmp-lista');
  const scrollAnterior = listaAnterior ? listaAnterior.scrollTop : 0;
  const buscadorAnterior = document.getElementById('cmp-buscar');
  const textoBuscado = buscadorAnterior ? buscadorAnterior.value : '';

  const items = itemsParaDimension(state.cmpDim);
  const trimestresGlobal = [...new Set(D.production.map(x => x.TRIMESTRE))].sort((a, b) => trimestreOrden(a) - trimestreOrden(b));
  const dimActual = DIMENSIONES_COMPARAR.find(d => d.valor === state.cmpDim) || DIMENSIONES_COMPARAR[0];

  const selectDim = `<select class="select" id="cmp-dim">${DIMENSIONES_COMPARAR.map(d => `<option value="${d.valor}" ${d.valor === state.cmpDim ? 'selected' : ''}>${esc(d.etiqueta)}</option>`).join('')}</select>`;

  const checklistItems = items.map(it => {
    const marcado = state.cmpSel.includes(it);
    const deshabilitado = !marcado && state.cmpSel.length >= MAX_SELECCION_COMPARAR;
    return `<label data-nombre="${esc(it.toLowerCase())}"><input type="checkbox" value="${esc(it)}" ${marcado ? 'checked' : ''} ${deshabilitado ? 'disabled' : ''}>${esc(it)}</label>`;
  }).join('') || '<div class="sinresultados">No hay elementos para esta dimensión.</div>';

  const series = state.cmpSel.map(valor => ({ label: valor, valores: serieComparar(state.cmpDim, valor, trimestresGlobal), color: state.cmpDim === 'COMPANIA' ? colorParaCompania(valor) : undefined }));

  // Desglose: un solo selector (PAS/Ramos/Compañías/Organizaciones, se omite el que coincide con la dimensión elegida) aplicado a todos los elementos tildados
  const opcionesDesglose = TIPOS_DESGLOSE.filter(d => d.valor !== state.cmpDim);
  if (!opcionesDesglose.some(d => d.valor === state.cmpDesglose)) state.cmpDesglose = opcionesDesglose[0] ? opcionesDesglose[0].valor : null;
  const selectDesglose = `<select class="select" id="cmp-desglose-tipo">${opcionesDesglose.map(d => `<option value="${d.valor}" ${d.valor === state.cmpDesglose ? 'selected' : ''}>${esc(d.etiqueta)}</option>`).join('')}</select>`;
  const desglose = state.cmpSel.length ? `<div class="card section"><h3>Desglose</h3><div class="formgrid"><div class="full"><label>Ver ranking de</label>${selectDesglose}</div></div><div class="grid two section">${state.cmpSel.map(valor => bloqueRanking(valor, rankingParaTipo(state.cmpDesglose, filasParaDimension(state.cmpDim, valor)), state.cmpDesglose)).join('')}</div></div>` : '';

  $('#app').innerHTML = `<div class="top"><div><h1>Comparar</h1><div class="sub">Compará producción entre distintos elementos de la base</div></div></div><div class="grid two section"><div class="card"><h3>¿Qué querés comparar?</h3><div class="formgrid"><div class="full"><label>Dimensión</label>${selectDim}</div></div><div class="section"><label>Elegí hasta ${MAX_SELECCION_COMPARAR} — ${esc(dimActual.etiqueta.toLowerCase())}</label><input id="cmp-buscar" placeholder="Buscar..." value="${esc(textoBuscado)}"><div id="cmp-lista" class="checklist">${checklistItems}</div></div></div><div class="card"><h3>Evolución trimestral comparada</h3>${state.cmpSel.length ? svgMultiLineChart(trimestresGlobal, series) : '<div class="empty">Elegí al menos un elemento para comparar</div>'}</div></div>${desglose}`;

  document.getElementById('cmp-dim').onchange = e => { state.cmpDim = e.target.value; state.cmpSel = []; render(); };
  const selectorDesglose = document.getElementById('cmp-desglose-tipo');
  if (selectorDesglose) selectorDesglose.onchange = e => { state.cmpDesglose = e.target.value; render(); };
  document.querySelectorAll('#cmp-lista input[type=checkbox]').forEach(cb => {
    cb.onchange = () => {
      if (cb.checked) { if (!state.cmpSel.includes(cb.value)) state.cmpSel = [...state.cmpSel, cb.value]; }
      else { state.cmpSel = state.cmpSel.filter(v => v !== cb.value); }
      render();
    };
  });
  const filtrarLista = q => {
    const qq = q.trim().toLowerCase();
    document.querySelectorAll('#cmp-lista label').forEach(l => { l.style.display = l.dataset.nombre.includes(qq) ? 'flex' : 'none'; });
  };
  const buscador = document.getElementById('cmp-buscar');
  buscador.oninput = e => filtrarLista(e.target.value);
  if (textoBuscado) filtrarLista(textoBuscado);
  const listaNueva = document.getElementById('cmp-lista');
  if (listaNueva) listaNueva.scrollTop = scrollAnterior;
}
