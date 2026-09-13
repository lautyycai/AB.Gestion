/* ============== AUDITORÍA (solo admin/jefe): historial de cambios en PAS, producción, usuarios, catálogos, metas y reportes ============== */
const TABLAS_AUDITORIA = {
  productores: 'PAS',
  producciones: 'Producción',
  produccion_companias: 'Producción por compañía',
  usuarios: 'Usuario',
  catalogos: 'Catálogo',
  metas: 'Meta',
  reportes: 'Reporte',
};
const OPERACIONES_AUDITORIA = { insert: 'Creó', update: 'Editó', delete: 'Eliminó' };

function resumenRegistroAuditoria(a) {
  const datos = a.datos_nuevos || a.datos_anteriores || {};
  if (a.tabla === 'productores') return datos.pas_nombre || `#${a.registro_id}`;
  if (a.tabla === 'producciones') return [datos.ramo, datos.trimestre].filter(Boolean).join(' · ') || `#${a.registro_id}`;
  if (a.tabla === 'produccion_companias') return [datos.compania, datos.cantidad != null ? `(${datos.cantidad})` : ''].filter(Boolean).join(' ') || `#${a.registro_id}`;
  if (a.tabla === 'usuarios') return datos.nombre_completo || `#${a.registro_id}`;
  if (a.tabla === 'catalogos') return [datos.tipo, datos.valor].filter(Boolean).join(': ') || `#${a.registro_id}`;
  if (a.tabla === 'metas') return [datos.dupla, datos.trimestre].filter(Boolean).join(' · ') || `#${a.registro_id}`;
  if (a.tabla === 'reportes') return datos.vista || `#${a.registro_id}`;
  return `#${a.registro_id}`;
}

// Campos que la auditoría guarda pero que no le dicen nada a quien la lee:
// "id" nunca cambia, y "version" es el contador de concurrencia, que sube en
// cada edición y llenaría el historial de renglones "version: 3 → 4".
function esCampoInterno(clave) {
  return clave === 'id' || clave === 'version';
}

// Compara dos snapshots (before/after) campo por campo; solo devuelve los que cambiaron
function diffCamposAuditoria(antes, despues) {
  const claves = [...new Set([...Object.keys(antes || {}), ...Object.keys(despues || {})])].filter(k => !esCampoInterno(k));
  const cambios = [];
  claves.forEach(k => {
    const a = antes ? antes[k] : undefined;
    const d = despues ? despues[k] : undefined;
    if (JSON.stringify(a) !== JSON.stringify(d)) cambios.push({ campo: k, antes: a, despues: d });
  });
  return cambios;
}

const valorAuditoria = v => (v === null || v === undefined || v === '') ? '—' : String(v);

async function cargarAuditoria() {
  const { data, error } = await obtenerAuditoria();
  auditoriaCache = error ? { error: error.message } : { rows: (data || []).map(enmascararFilaAuditoria) };
  render();
}

function vistaAuditoria() {
  if (perfil.rol !== 'admin' && perfil.rol !== 'jefe') { state.view = 'dashboard'; return render(); }

  if (auditoriaCache === null) {
    $('#app').innerHTML = `<div class="loading"><img src="logo-transparente.png" alt="Cargando"></div>`;
    cargarAuditoria();
    return;
  }
  if (auditoriaCache.error) {
    $('#app').innerHTML = `<div class="top"><div><h1>Auditoría</h1></div></div><div class="card"><div class="formerr">No se pudo cargar: ${esc(auditoriaCache.error)}</div></div>`;
    return;
  }

  const filas = auditoriaCache.rows;

  $('#app').innerHTML = `<div class="top"><div><h1>Auditoría</h1><div class="sub">${fmt(filas.length)} últimos cambios en PAS, producción, usuarios, catálogos, metas y reportes</div></div><button class="btn-secondary" id="btn-recargar-auditoria">Recargar</button></div><div class="card"><div class="tablewrap"><table class="table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Sobre</th><th></th></tr></thead><tbody>${filas.map(a => `<tr><td>${esc(fmtFechaHora(a.created_at))}</td><td>${esc(a.usuario_nombre || 'Usuario desconocido')}</td><td><span class="pill">${esc(OPERACIONES_AUDITORIA[a.accion] || a.accion)}</span> ${esc(TABLAS_AUDITORIA[a.tabla] || a.tabla)}</td><td>${esc(resumenRegistroAuditoria(a))}</td><td><button class="link" style="border:0;background:none;cursor:pointer;font-size:11px;padding:0" data-ver-auditoria="${a.id}">Ver detalle</button></td></tr>`).join('') || `<tr><td colspan="5"><div class="empty">Sin cambios registrados todavía</div></td></tr>`}</tbody></table></div></div>`;

  document.getElementById('btn-recargar-auditoria').onclick = () => { auditoriaCache = null; render(); };
  document.querySelectorAll('[data-ver-auditoria]').forEach(btn => {
    btn.onclick = () => {
      const a = filas.find(x => String(x.id) === btn.dataset.verAuditoria);
      if (a) abrirModalDetalleAuditoria(a);
    };
  });
}

function abrirModalDetalleAuditoria(a) {
  let cuerpo;
  if (a.accion === 'insert') {
    const campos = Object.entries(a.datos_nuevos || {}).filter(([k]) => !esCampoInterno(k));
    cuerpo = campos.map(([k, v]) => `<div class="auditoria-campo"><b>${esc(k)}</b><span>${esc(valorAuditoria(v))}</span></div>`).join('') || '<div class="empty">Sin datos</div>';
  } else if (a.accion === 'delete') {
    const campos = Object.entries(a.datos_anteriores || {}).filter(([k]) => !esCampoInterno(k));
    cuerpo = campos.map(([k, v]) => `<div class="auditoria-campo"><b>${esc(k)}</b><span>${esc(valorAuditoria(v))}</span></div>`).join('') || '<div class="empty">Sin datos</div>';
  } else {
    const cambios = diffCamposAuditoria(a.datos_anteriores, a.datos_nuevos);
    cuerpo = cambios.map(c => `<div class="auditoria-campo"><b>${esc(c.campo)}</b><span>${esc(valorAuditoria(c.antes))} → ${esc(valorAuditoria(c.despues))}</span></div>`).join('') || '<div class="empty">No hay cambios de valores (puede ser un guardado sin modificaciones reales)</div>';
  }

  const html = `
    <h2>${esc(OPERACIONES_AUDITORIA[a.accion] || a.accion)} ${esc(TABLAS_AUDITORIA[a.tabla] || a.tabla)}</h2>
    <div class="modal-sub">${esc(a.usuario_nombre || 'Usuario desconocido')} · ${esc(fmtFechaHora(a.created_at))} · ${esc(resumenRegistroAuditoria(a))}</div>
    <div class="section">${cuerpo}</div>
    <div class="modal-actions"><button class="btn-secondary" id="btn-cerrar-auditoria">Cerrar</button></div>`;
  abrirModal(html);
  document.getElementById('btn-cerrar-auditoria').onclick = cerrarModal;
}
