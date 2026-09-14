/* ============== FORMULARIO: NUEVA PRODUCCIÓN (carga de pólizas) ============== */
let filasCompaniaCount = 0;
let companiasDisponiblesForm = []; // compañías del PAS actual (si tiene declaradas); vacío = mostrar el catálogo completo

// Compañías que un PAS declaró tener, leídas del mismo campo que usa el checklist del formulario de PAS
function companiasDeclaradasPas(p) {
  return companiasDelTexto((p && p['COMPAÑÍAS CON LAS QUE OPERA']) || '', D.catalog.companias);
}

function abrirFormProduccion(p) {
  filasCompaniaCount = 0;
  // Una carga nueva no puede chocar con nadie: no hay foto ni versión previa.
  formProdOriginal = null;
  formProdVersion = null;
  companiasDisponiblesForm = companiasDeclaradasPas(p);
  const ramosOrdenados = [...D.catalog.ramos].sort((a, b) => a.localeCompare(b, 'es'));
  const trimestresOrdenados = [...D.catalog.trimestres].sort((a, b) => trimestreOrden(a) - trimestreOrden(b));
  const hoy = new Date().toISOString().slice(0, 10);

  const html = `
    <h2>Cargar producción</h2>
    <div class="modal-sub">${esc(p.PAS)} · ${esc(p.EJECUTIVO || '')}</div>
    <div class="formgrid">
      <div><label>Ramo</label><select id="f-ramo">${opts(ramosOrdenados, 'TODOS')}</select></div>
      <div><label>Trimestre</label><select id="f-trim">${opts(trimestresOrdenados, 'TODOS')}</select></div>
      <div><label>Organizador</label><input id="f-organizador" value="${esc(p.ORGANIZACIÓN || '')}"></div>
      <div><label>Fecha</label><input id="f-fecha" type="date" value="${hoy}"></div>
    </div>
    <div class="section">
      <label>Compañías y cantidad de pólizas</label>
      <div id="filas-compania"></div>
      <button type="button" class="btn-add" id="btn-add-compania">+ Agregar compañía</button>
    </div>
    <div id="form-prod-msg"></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="btn-cancelar-prod">Cancelar</button>
      <button class="btn-primary" id="btn-guardar-prod">Guardar carga</button>
    </div>`;
  abrirModal(html);
  agregarFilaCompania();
  document.getElementById('btn-add-compania').onclick = () => agregarFilaCompania();
  document.getElementById('btn-cancelar-prod').onclick = cerrarModal;
  document.getElementById('btn-guardar-prod').onclick = () => guardarProduccion(p);
}

function agregarFilaCompania(companiaExistente, cantidadExistente) {
  filasCompaniaCount++;
  const id = filasCompaniaCount;
  const companiasOrdenadas = [...(companiasDisponiblesForm.length ? companiasDisponiblesForm : D.catalog.companias)].sort((a, b) => a.localeCompare(b, 'es'));
  const div = document.createElement('div');
  div.className = 'companiarow';
  div.id = `fila-comp-${id}`;
  div.innerHTML = `<select id="fc-comp-${id}">${opts(companiasOrdenadas, companiaExistente || 'TODOS')}</select><input id="fc-cant-${id}" type="number" min="0" placeholder="Cantidad" value="${cantidadExistente ?? ''}"><button type="button" class="btn-del" data-fila="${id}">×</button>`;
  document.getElementById('filas-compania').appendChild(div);
  div.querySelector('.btn-del').onclick = () => { const f = document.getElementById(`fila-comp-${id}`); if (f) f.remove(); };
}

/* ============== FORMULARIO: EDITAR PRODUCCIÓN (corregir una carga existente) ============== */
async function abrirFormEditarProduccion(prod) {
  // Mismo refresco por acción que en el formulario de PAS: acá importa además
  // el detalle por compañía, que es lo que más se corrige entre dos personas.
  abrirModalCargando('Editar producción');
  const fresca = await refrescarProduccion(prod._id);
  if (!modalCargandoSigueAbierto()) return; // lo cerraron mientras cargaba
  if (fresca === null) return avisarRegistroBorrado('Editar producción', 'Otra persona eliminó esta carga mientras la tenías en pantalla. Ya no se puede editar.');
  if (fresca) prod = fresca;

  filasCompaniaCount = 0;
  companiasDisponiblesForm = companiasDeclaradasPas(D.producers.find(x => x._id === prod._pas_id));
  // Si esta carga ya tenía compañías que no están en la lista declarada del PAS, las mantenemos
  // disponibles igual — no queremos que "desaparezcan" del desplegable y se pierdan al guardar.
  if (companiasDisponiblesForm.length) {
    Object.keys(prod.COMPANIAS || {}).forEach(c => { if (!companiasDisponiblesForm.includes(c)) companiasDisponiblesForm.push(c); });
  }
  const ramosOrdenados = [...D.catalog.ramos].sort((a, b) => a.localeCompare(b, 'es'));
  const trimestresOrdenados = [...D.catalog.trimestres].sort((a, b) => trimestreOrden(a) - trimestreOrden(b));
  const fecha = prod.FECHA || new Date().toISOString().slice(0, 10);

  const html = `
    <h2>Editar producción</h2>
    <div class="modal-sub">${esc(prod.PAS)} · ${esc(prod.EJECUTIVO || '')}</div>
    <div class="formgrid">
      <div><label>Ramo</label><select id="f-ramo">${opts(ramosOrdenados, prod.RAMO)}</select></div>
      <div><label>Trimestre</label><select id="f-trim">${opts(trimestresOrdenados, prod.TRIMESTRE)}</select></div>
      <div><label>Organizador</label><input id="f-organizador" value="${esc(prod.ORGANIZADOR || '')}"></div>
      <div><label>Fecha</label><input id="f-fecha" type="date" value="${esc(fecha)}"></div>
    </div>
    <div class="section">
      <label>Compañías y cantidad de pólizas</label>
      <div id="filas-compania"></div>
      <button type="button" class="btn-add" id="btn-add-compania">+ Agregar compañía</button>
    </div>
    <div id="form-prod-msg"></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="btn-cancelar-prod">Cancelar</button>
      <button class="btn-primary" id="btn-guardar-prod">Guardar cambios</button>
    </div>`;
  abrirModal(html);
  const companiasExistentes = Object.entries(prod.COMPANIAS || {});
  if (companiasExistentes.length === 0) agregarFilaCompania();
  else companiasExistentes.forEach(([c, cant]) => agregarFilaCompania(c, cant));
  document.getElementById('btn-add-compania').onclick = () => agregarFilaCompania();
  document.getElementById('btn-cancelar-prod').onclick = cerrarModal;
  document.getElementById('btn-guardar-prod').onclick = () => guardarEdicionProduccion(prod);

  // Foto de la carga recién dibujada, para saber después qué tocó el usuario y
  // poder intercalar su cambio con el de otra persona. Va al final: las filas de
  // compañía se agregan una por una y antes de eso la foto saldría vacía.
  formProdOriginal = leerFormProduccion();
  formProdVersion = prod._version;
}

let fichaTrimPas = null;

// state.pas guarda el ID del PAS, no su nombre. Hay nombres repetidos en la base (vienen de la
// migración original), y mientras la navegación fue por nombre la ficha mostraba los datos de
// contacto del primer homónimo junto con la producción de TODOS ellos sumada: los números salían
// inflados y coherentes entre sí, así que no había forma de darse cuenta mirando la pantalla.
function ficha(pasId) {
  const p = D.producers.find(x => String(x._id) === String(pasId));
  if (!p) { state.view = 'productores'; state.pas = null; state.pagina = 1; return render() }

  if (fichaTrimPas !== p._id) {
    state.trimFicha = 'TODOS';
    state.chartCompania = null;
    state.chartRamo = null;
    state.chartEvo = 'TOTAL';
    fichaTrimPas = p._id;
  }

  const rowsCompletas = D.production.filter(x => x._pas_id === p._id);
  const trimestresDelPas = [...new Set(rowsCompletas.map(x => x.TRIMESTRE))].sort((a, b) => trimestreOrden(b) - trimestreOrden(a));
  const rows = state.trimFicha === 'TODOS' ? rowsCompletas : rowsCompletas.filter(x => x.TRIMESTRE === state.trimFicha);

  // Los (|| 0) no son de más: una producción sin detalle de compañías puede tener total_polizas
  // en NULL, y una sola de esas alcanzaba para que el KPI mostrara "NaN".
  const total = rows.reduce((s, x) => s + (+x.TOTAL || 0), 0);
  const comp = {}, ramo = {}, trim = {};
  rows.forEach(x => { Object.entries(x.COMPANIAS).forEach(([c, v]) => comp[c] = (comp[c] || 0) + (+v || 0)); ramo[x.RAMO] = (ramo[x.RAMO] || 0) + (+x.TOTAL || 0); });
  rowsCompletas.forEach(x => { trim[x.TRIMESTRE] = (trim[x.TRIMESTRE] || 0) + (+x.TOTAL || 0); });
  const comps = Object.entries(comp).sort((a, b) => b[1] - a[1]); const ramos = Object.entries(ramo).sort((a, b) => b[1] - a[1]); const hist = Object.entries(trim).sort((a, b) => trimestreOrden(a[0]) - trimestreOrden(b[0]));
  const puedeDatos = puedeEditarDatosPas(p);
  const puedeProd = puedeCargarProduccion(p);
  const botonesAccion = `${puedeDatos ? '<button class="btn-edit" id="btn-editar-pas">Editar datos</button>' : ''}${puedeProd ? '<button class="btn-primary" id="btn-cargar-prod">+ Cargar producción</button>' : ''}`;
  const selectorTrimestre = `<select class="select" id="fic-trim"><option value="TODOS" ${state.trimFicha === 'TODOS' ? 'selected' : ''}>Todos los trimestres</option>${trimestresDelPas.map(t => `<option value="${esc(t)}" ${t === state.trimFicha ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;

  // Gráficos de tendencia: siempre sobre rowsCompletas (todo el histórico), sin importar el filtro de trimestre de arriba
  const trimestresAsc = [...trimestresDelPas].reverse();
  const compTotalCompleto = {}, ramoTotalCompleto = {};
  rowsCompletas.forEach(x => { Object.entries(x.COMPANIAS).forEach(([c, v]) => compTotalCompleto[c] = (compTotalCompleto[c] || 0) + (+v || 0)); ramoTotalCompleto[x.RAMO] = (ramoTotalCompleto[x.RAMO] || 0) + (+x.TOTAL || 0); });
  const companiasDelPas = Object.entries(compTotalCompleto).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const ramosDelPas = Object.entries(ramoTotalCompleto).sort((a, b) => b[1] - a[1]).filter(([r]) => r).map(([r]) => r);
  if (!companiasDelPas.includes(state.chartCompania)) state.chartCompania = companiasDelPas[0] || null;
  if (!ramosDelPas.includes(state.chartRamo)) state.chartRamo = ramosDelPas[0] || null;

  const serieCompania = c => trimestresAsc.map(t => rowsCompletas.filter(x => x.TRIMESTRE === t).reduce((s, x) => s + (x.COMPANIAS[c] || 0), 0));
  const serieRamo = r => trimestresAsc.map(t => rowsCompletas.filter(x => x.TRIMESTRE === t && x.RAMO === r).reduce((s, x) => s + (x.TOTAL || 0), 0));
  // Producción de un ramo puntual, pero solo la parte que corresponde a una compañía puntual (para relacionar los dos gráficos)
  const serieRamoCompania = (r, c) => trimestresAsc.map(t => rowsCompletas.filter(x => x.TRIMESTRE === t && x.RAMO === r).reduce((s, x) => s + (x.COMPANIAS[c] || 0), 0));
  const serieTotal = () => trimestresAsc.map(t => rowsCompletas.filter(x => x.TRIMESTRE === t).reduce((s, x) => s + (x.TOTAL || 0), 0));

  const opcionesEvo = ['TOTAL', ...companiasDelPas.map(c => 'C:' + c), ...ramosDelPas.map(r => 'R:' + r)];
  const etiquetaEvo = v => v === 'TOTAL' ? 'Total' : v.startsWith('C:') ? 'Compañía: ' + v.slice(2) : 'Ramo: ' + v.slice(2);
  const datosEvo = state.chartEvo === 'TOTAL' ? serieTotal() : state.chartEvo.startsWith('C:') ? serieCompania(state.chartEvo.slice(2)) : state.chartEvo.startsWith('R:') ? serieRamo(state.chartEvo.slice(2)) : [];

  const selectCompania = `<select class="select" id="fic-chart-comp">${companiasDelPas.map(c => `<option value="${esc(c)}" ${c === state.chartCompania ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
  const selectRamo = `<select class="select" id="fic-chart-ramo">${ramosDelPas.map(r => `<option value="${esc(r)}" ${r === state.chartRamo ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>`;
  const selectEvo = `<select class="select" id="fic-chart-evo">${opcionesEvo.map(v => `<option value="${esc(v)}" ${v === state.chartEvo ? 'selected' : ''}>${esc(etiquetaEvo(v))}</option>`).join('')}</select>`;

  const cardCompanias = companiasDelPas.length ? selectCompania + svgLineChart(trimestresAsc, serieCompania(state.chartCompania), colorParaCompania(state.chartCompania)) : '<div class="empty">Sin producción</div>';
  const ramoDatos = state.chartCompania ? serieRamoCompania(state.chartRamo, state.chartCompania) : serieRamo(state.chartRamo);
  const cardRamos = ramosDelPas.length ? selectRamo + svgLineChart(trimestresAsc, ramoDatos) : '<div class="empty">Sin producción</div>';
  const cardEvo = selectEvo + svgLineChart(trimestresAsc, datosEvo);

  // Compañías por ramo: matriz completa (todo el historial) para el gráfico de barras apiladas
  const ramoCompaniaMatrix = {};
  rowsCompletas.forEach(x => {
    if (!ramoCompaniaMatrix[x.RAMO]) ramoCompaniaMatrix[x.RAMO] = {};
    Object.entries(x.COMPANIAS).forEach(([c, v]) => { ramoCompaniaMatrix[x.RAMO][c] = (ramoCompaniaMatrix[x.RAMO][c] || 0) + (+v || 0); });
  });
  const glosarioCompanias = companiasDelPas.map(c => `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-size:12px"><span style="width:12px;height:12px;border-radius:3px;background:${colorParaCompania(c)};display:inline-block;flex:none"></span>${esc(c)}</div>`).join('') || '<div class="empty">Sin compañías</div>';
  const cardCompaniasPorRamo = `<div class="card section"><h3>Compañías por ramo</h3><div style="display:flex;gap:24px;flex-wrap:wrap"><div style="flex:2;min-width:320px">${svgBarrasRamoCompania(ramoCompaniaMatrix, ramosDelPas)}</div><div style="flex:1;min-width:160px">${glosarioCompanias}</div></div></div>`;

  $('#app').innerHTML = `<div class="top"><div><button class="back" id="back">← Productores</button><h1 style="margin-top:12px">${esc(p.PAS)}</h1><div class="sub">Ficha 360° del productor</div></div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;align-self:flex-end">${selectorTrimestre}${botonesAccion}</div></div><div class="grid kpis"><div class="card kpi"><div class="label">Pólizas cargadas${state.trimFicha !== 'TODOS' ? ' (' + esc(state.trimFicha) + ')' : ''}</div><div class="num">${fmt(total)}</div></div><div class="card kpi"><div class="label">Compañías activas</div><div class="num">${fmt(comps.length)}</div></div><div class="card kpi"><div class="label">Ramos activos</div><div class="num">${fmt(ramos.length)}</div></div><div class="card kpi"><div class="label">Último trimestre cargado</div><div class="num" style="font-size:20px">${esc(hist.at(-1)?.[0] || '—')}</div></div></div><div class="grid two section"><div class="card"><h3>Datos del PAS</h3><div class="profile">${[['Organización', p.ORGANIZACIÓN], ['Vinculante', p.VINCULANTE], ['Ejecutivo', p.EJECUTIVO], ['Teléfono', p.TELÉFONO], ['Mail', p.MAIL], ['Estado', p.ESTADO], ['Zona', p.ZONA], ['Localidad / Prov.', p['LOCALIDAD/PROV']], ['Nacimiento', fmtFecha(p['FECHA DE NACIMIENTO'])], ['Observaciones', p.OBSERVACIONES]].map(([k, v]) => `<div class="field"><b>${esc(k)}</b>${esc(v || '—')}</div>`).join('')}<div class="field" style="grid-column:1/-1"><b>Compañías con las que opera</b>${esc(p['COMPAÑÍAS CON LAS QUE OPERA'] || '—')}</div></div></div><div class="card"><h3>Compañías con producción</h3>${cardCompanias}</div></div><div class="grid two section"><div class="card"><h3>Producción por ramo${state.chartCompania ? ' · ' + esc(state.chartCompania) : ''}</h3>${cardRamos}</div><div class="card"><h3>Evolución trimestral</h3>${cardEvo}</div></div>${cardCompaniasPorRamo}<div class="card section"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px"><h3 style="margin:0">Detalle de cargas${state.trimFicha !== 'TODOS' ? ' · ' + esc(state.trimFicha) : ''}</h3>${puedeProd && rowsCompletas.length ? `<button class="btn-danger" id="btn-borrar-todo-prod">Borrar todo</button>` : ''}</div><div class="tablewrap"><table class="table"><thead><tr><th>Trimestre</th><th>Ramo</th><th>Total</th><th>Ejecutivo</th><th>Organizador</th>${puedeProd ? '<th></th>' : ''}</tr></thead><tbody>${rows.sort((a, b) => trimestreOrden(b.TRIMESTRE) - trimestreOrden(a.TRIMESTRE)).map(x => `<tr><td>${esc(x.TRIMESTRE)}</td><td>${esc(x.RAMO)}</td><td>${fmt(x.TOTAL)}</td><td>${esc(x.EJECUTIVO)}</td><td>${esc(x.ORGANIZADOR)}</td>${puedeProd ? `<td><button class="btn-edit" data-editar-prod="${x._id}" title="Editar carga">✎</button> <button class="btn-del" data-eliminar-prod="${x._id}" title="Eliminar carga">×</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="${puedeProd ? 6 : 5}"><div class="empty">Sin cargas en este trimestre</div></td></tr>`}</tbody></table></div></div>`;
  $('#back').onclick = () => { state.view = 'productores'; state.pas = null; state.pagina = 1; render() };
  $('#fic-trim').onchange = e => { state.trimFicha = e.target.value; render() };
  if (companiasDelPas.length) document.getElementById('fic-chart-comp').onchange = e => { state.chartCompania = e.target.value; render() };
  if (ramosDelPas.length) document.getElementById('fic-chart-ramo').onchange = e => { state.chartRamo = e.target.value; render() };
  document.getElementById('fic-chart-evo').onchange = e => { state.chartEvo = e.target.value; render() };
  if (puedeDatos) {
    document.getElementById('btn-editar-pas').onclick = () => abrirFormPAS(p);
  }
  if (puedeProd) {
    document.getElementById('btn-cargar-prod').onclick = () => abrirFormProduccion(p);
    document.querySelectorAll('[data-editar-prod]').forEach(btn => {
      btn.onclick = () => {
        const prod = rows.find(x => String(x._id) === btn.dataset.editarProd);
        if (prod) abrirFormEditarProduccion(prod);
      };
    });
    document.querySelectorAll('[data-eliminar-prod]').forEach(btn => {
      btn.onclick = () => {
        const prod = rows.find(x => String(x._id) === btn.dataset.eliminarProd);
        if (!prod) return;
        confirmarAccion(`¿Eliminar la carga de ${prod.RAMO} (${prod.TRIMESTRE})? Esta acción no se puede deshacer.`, async () => {
          btn.disabled = true;
          const { error } = await eliminarProduccion(prod._id);
          if (error) { mostrarToast(error.message, 'error'); btn.disabled = false; return; }
          D = await cargarDatos();
          render();
        });
      };
    });
    const btnBorrarTodoProd = document.getElementById('btn-borrar-todo-prod');
    if (btnBorrarTodoProd) {
      btnBorrarTodoProd.onclick = () => {
        confirmarAccion(`¿Eliminar las ${rowsCompletas.length} cargas de ${p.PAS}? Es todo el historial de este PAS, sin importar el filtro de trimestre de arriba. Esta acción no se puede deshacer.`, async () => {
          btnBorrarTodoProd.disabled = true;
          const { data, error } = await eliminarProduccionesPas(p._id);
          btnBorrarTodoProd.disabled = false;
          if (error) { mostrarToast(error.message, 'error'); return; }
          if (typeof data === 'number' && data < rowsCompletas.length) {
            mostrarToast(`Se borraron ${data} de ${rowsCompletas.length} cargas — las demás pertenecen a otra dupla y no tenías permiso para borrarlas.`, 'error');
          }
          D = await cargarDatos();
          render();
        });
      };
    }
  }

  refrescarFichaEnSegundoPlano(p._id);
}

/* Refresco por acción, versión no bloqueante: al entrar a una ficha se vuelve a
 * consultar ese PAS y sus cargas. La pantalla se dibuja YA con lo que hay en
 * memoria —no se hace esperar a nadie— y recién se redibuja si la base tenía
 * algo distinto. Así, si otra persona corrigió un teléfono o agregó una carga,
 * aparece solo, sin F5.
 *
 * Solo se redibuja si algo cambió de verdad: render() rehace el DOM entero, y
 * hacerlo por gusto mueve el scroll y molesta al que está leyendo.
 *
 * El intervalo mínimo es lo que evita que los redibujados internos de la ficha
 * —cambiar el trimestre, cambiar un gráfico, que también pasan por render()—
 * disparen una consulta cada uno. */
const ESPERA_MINIMA_REFRESCO_FICHA = 5000;
let ultimoRefrescoFicha = { id: null, t: 0 };

function huellaFicha(pasId) {
  return JSON.stringify([
    (D.producers || []).find(x => String(x._id) === String(pasId)) || null,
    (D.production || []).filter(x => String(x._pas_id) === String(pasId)),
  ]);
}

async function refrescarFichaEnSegundoPlano(pasId) {
  const ahora = Date.now();
  if (ultimoRefrescoFicha.id === pasId && ahora - ultimoRefrescoFicha.t < ESPERA_MINIMA_REFRESCO_FICHA) return;
  ultimoRefrescoFicha = { id: pasId, t: ahora };

  const antes = huellaFicha(pasId);
  const productor = await refrescarProductor(pasId);
  if (productor !== null) await refrescarCargasDelPas(pasId); // si lo borraron, ya no hay cargas que traer
  if (huellaFicha(pasId) === antes) return;

  // El usuario ya se fue a otra pantalla: los datos quedaron actualizados en D,
  // pero redibujar ahora lo sacaría de donde está.
  if (state.view !== 'ficha' || String(state.pas) !== String(pasId)) return;

  // Con un formulario abierto tampoco: el modal quedaría flotando sobre una
  // pantalla que se movió sola, y el que está escribiendo no lo pidió.
  const overlay = document.getElementById('modal-overlay');
  if (overlay && overlay.style.display !== 'none') return;

  render();
}
