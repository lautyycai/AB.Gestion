/* ============== REPORTES (solo admin): comentarios/bugs enviados por los usuarios ============== */
const ESTADOS_REPORTE = [
  { valor: 'pendiente', etiqueta: 'Pendiente' },
  { valor: 'en_revision', etiqueta: 'En revisión' },
  { valor: 'resuelto', etiqueta: 'Resuelto' },
];

async function cargarReportes() {
  const { data, error } = await obtenerReportes();
  reportesCache = error ? { error: error.message } : { rows: (data || []).map(enmascararFilaReporte) };
  render();
}

function vistaReportes() {
  if (perfil.rol !== 'admin') { state.view = 'dashboard'; return render(); }

  if (canalReportesAdmin === null) {
    vistaConSuscripcion = 'reportes';
    canalReportesAdmin = suscribirseReportesAdmin(() => cargarReportes());
  }

  if (reportesCache === null) {
    $('#app').innerHTML = `<div class="loading"><img src="logo-transparente.png" alt="Cargando"></div>`;
    cargarReportes();
    return;
  }
  if (reportesCache.error) {
    $('#app').innerHTML = `<div class="top"><div><h1>Reportes</h1></div></div><div class="card"><div class="formerr">No se pudieron cargar los reportes: ${esc(reportesCache.error)}</div></div>`;
    return;
  }

  const filas = reportesCache.rows.slice().sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
  const pendientes = filas.filter(r => (r.estado || 'pendiente') === 'pendiente').length;

  $('#app').innerHTML = `<div class="top"><div><h1>Reportes</h1><div class="sub">${fmt(filas.length)} recibidos · ${fmt(pendientes)} pendientes</div></div><button class="btn-secondary" id="btn-recargar-reportes">Recargar</button></div><div class="card"><div class="tablewrap"><table class="table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Vista</th><th>Mensaje</th><th>Estado</th><th>Respuesta</th><th></th></tr></thead><tbody>${filas.map(r => {
    const resuelto = (r.estado || 'pendiente') === 'resuelto';
    return `<tr style="${resuelto ? 'color:var(--muted);background:#fafbfc' : ''}"><td>${esc(fmtFechaHora(r.creado_en))}</td><td>${esc(r.usuario_nombre || '—')}</td><td>${esc(r.vista || '—')}</td><td class="celda-texto">${esc(r.mensaje)}</td><td><select class="select" style="padding:5px 8px;font-size:11px" data-cambiar-estado="${r.id}">${ESTADOS_REPORTE.map(e => `<option value="${e.valor}" ${e.valor === (r.estado || 'pendiente') ? 'selected' : ''}>${esc(e.etiqueta)}</option>`).join('')}</select></td><td class="celda-texto celda-texto-corta">${r.respuesta ? `<div style="margin-bottom:4px">${esc(r.respuesta)}</div>` : ''}<button class="link" style="border:0;background:none;cursor:pointer;font-size:11px;padding:0" data-responder="${r.id}">${r.respuesta ? 'Editar respuesta' : 'Responder'}</button></td><td>${resuelto ? `<button class="btn-del" data-eliminar-reporte="${r.id}" title="Eliminar">×</button>` : ''}</td></tr>`;
  }).join('') || `<tr><td colspan="7"><div class="empty">No hay reportes todavía</div></td></tr>`}</tbody></table></div></div>`;

  document.getElementById('btn-recargar-reportes').onclick = () => { reportesCache = null; render(); };
  document.querySelectorAll('[data-eliminar-reporte]').forEach(btn => {
    btn.onclick = () => {
      confirmarAccion('¿Eliminar este reporte? Esta acción no se puede deshacer.', async () => {
        const id = btn.dataset.eliminarReporte;
        btn.disabled = true;
        const { error } = await eliminarReporte(id);
        if (error) { mostrarToast('No se pudo eliminar: ' + error.message, 'error'); btn.disabled = false; return; }
        reportesCache.rows = reportesCache.rows.filter(r => String(r.id) !== id);
        render();
      });
    };
  });
  document.querySelectorAll('[data-cambiar-estado]').forEach(sel => {
    sel.onchange = async () => {
      const id = sel.dataset.cambiarEstado;
      sel.disabled = true;
      const { error } = await actualizarEstadoReporte(id, sel.value);
      sel.disabled = false;
      if (error) { mostrarToast('No se pudo actualizar: ' + error.message, 'error'); return; }
      const row = reportesCache.rows.find(r => String(r.id) === id);
      if (row) row.estado = sel.value;
      render();
    };
  });
  document.querySelectorAll('[data-responder]').forEach(btn => {
    btn.onclick = () => {
      const r = reportesCache.rows.find(x => String(x.id) === btn.dataset.responder);
      if (r) abrirModalResponder(r);
    };
  });
}

function abrirModalResponder(r) {
  const html = `
    <h2>Responder reporte</h2>
    <div class="modal-sub">${esc(r.usuario_nombre || 'Usuario')} · ${esc(fmtFechaHora(r.creado_en))} · ${esc(r.vista || '—')}</div>
    <div class="field" style="margin-top:12px"><b>Mensaje original</b>${esc(r.mensaje)}</div>
    <div class="formgrid" style="margin-top:14px">
      <div class="full"><label>Tu respuesta</label><textarea id="f-respuesta" rows="4" placeholder="Escribí una respuesta...">${esc(r.respuesta || '')}</textarea></div>
    </div>
    <div id="form-respuesta-msg"></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="btn-cancelar-respuesta">Cancelar</button>
      <button class="btn-primary" id="btn-guardar-respuesta">Guardar respuesta</button>
    </div>`;
  abrirModal(html);
  document.getElementById('btn-cancelar-respuesta').onclick = cerrarModal;
  document.getElementById('btn-guardar-respuesta').onclick = () => guardarRespuesta(r.id);
}

async function guardarRespuesta(id) {
  const btn = document.getElementById('btn-guardar-respuesta');
  const msg = document.getElementById('form-respuesta-msg');
  msg.innerHTML = '';
  const texto = document.getElementById('f-respuesta').value.trim();

  btn.disabled = true; btn.textContent = 'Guardando...';
  const { error } = await actualizarRespuestaReporte(id, texto || null);
  btn.disabled = false; btn.textContent = 'Guardar respuesta';
  if (error) {
    msg.innerHTML = `<div class="formerr">No se pudo guardar: ${esc(error.message)}</div>`;
    return;
  }
  const row = reportesCache.rows.find(r => String(r.id) === String(id));
  if (row) row.respuesta = texto;
  msg.innerHTML = '<div class="formok">Guardado.</div>';
  setTimeout(() => { cerrarModal(); render(); }, 500);
}

/* ============== MIS REPORTES: semáforo de mis propios reportes (para cualquier usuario) ============== */
const SEMAFORO_REPORTE = {
  pendiente: { color: '#C1613F', bg: '#F8ECE8', etiqueta: 'Reporte abierto' },
  en_revision: { color: '#d97706', bg: '#fffbeb', etiqueta: 'En revisión' },
  resuelto: { color: '#16a34a', bg: '#f0fdf4', etiqueta: 'Reporte cerrado' },
};
function pillSemaforo(estado) {
  const e = SEMAFORO_REPORTE[estado] || SEMAFORO_REPORTE.pendiente;
  return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:${e.bg};color:${e.color};font-size:11px;font-weight:700"><span style="width:8px;height:8px;border-radius:50%;background:${e.color};display:inline-block"></span>${esc(e.etiqueta)}</span>`;
}

async function cargarMisReportes() {
  const { data, error } = await obtenerReportes();
  misReportesCache = error ? { error: error.message } : { rows: (data || []).filter(r => r.usuario_id === perfil.id) };
  render();
}

function vistaMisReportes() {
  if (canalMisReportes === null) {
    vistaConSuscripcion = 'mis-reportes';
    canalMisReportes = suscribirseMisReportes(perfil.id, () => cargarMisReportes());
  }

  if (misReportesCache === null) {
    $('#app').innerHTML = `<div class="loading"><img src="logo-transparente.png" alt="Cargando"></div>`;
    cargarMisReportes();
    return;
  }
  if (misReportesCache.error) {
    $('#app').innerHTML = `<div class="top"><div><h1>Mis reportes</h1></div></div><div class="card"><div class="formerr">No se pudieron cargar: ${esc(misReportesCache.error)}</div></div>`;
    return;
  }

  const filas = misReportesCache.rows.slice().sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));

  $('#app').innerHTML = `<div class="top"><div><h1>Mis reportes</h1><div class="sub">${fmt(filas.length)} enviados</div></div><button class="btn-secondary" id="btn-recargar-mis-reportes">Recargar</button></div>${filas.map(r => `<div class="card section"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span class="sub">${esc(fmtFechaHora(r.creado_en))} · ${esc(r.vista || '—')}</span>${pillSemaforo(r.estado || 'pendiente')}</div><p style="margin:10px 0 0">${esc(r.mensaje)}</p>${r.respuesta ? `<div style="margin-top:10px;padding:10px;background:#F0EDE6;border-radius:8px;font-size:13px"><b style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px">Respuesta</b>${esc(r.respuesta)}</div>` : ''}</div>`).join('') || '<div class="card"><div class="empty">Todavía no mandaste ningún reporte</div></div>'}`;

  document.getElementById('btn-recargar-mis-reportes').onclick = () => { misReportesCache = null; render(); };
}
