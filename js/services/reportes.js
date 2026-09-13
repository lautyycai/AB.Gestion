/* ============== SERVICIO: REPORTES (tabla "reportes" + su suscripción realtime) ============== */
// usuario_id y usuario_nombre los completa solo un trigger a partir de la sesión
// (ver sql/2026-09-11-autor-reportes-desde-sesion.sql); no hace falta mandarlos.
async function crearReporte({ mensaje, vista }) {
  const bloqueo = demoBloqueo(); if (bloqueo) return bloqueo;
  return supa.from('reportes').insert({ mensaje, vista });
}

async function obtenerReportes() {
  return fetchAllRows('reportes');
}

async function eliminarReporte(id) {
  const bloqueo = demoBloqueo(); if (bloqueo) return bloqueo;
  return supa.from('reportes').delete().eq('id', id);
}

async function actualizarEstadoReporte(id, estado) {
  const bloqueo = demoBloqueo(); if (bloqueo) return bloqueo;
  return supa.from('reportes').update({ estado }).eq('id', id);
}

async function actualizarRespuestaReporte(id, respuesta) {
  const bloqueo = demoBloqueo(); if (bloqueo) return bloqueo;
  return supa.from('reportes').update({ respuesta }).eq('id', id);
}

// Suscripción realtime para la vista de Reportes (admin): se dispara ante cualquier cambio en la tabla
function suscribirseReportesAdmin(onChange) {
  return supa.channel('reportes-admin')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reportes' }, onChange)
    .subscribe();
}

// Suscripción realtime para "Mis reportes": filtrada a los reportes del propio usuario
function suscribirseMisReportes(usuarioId, onChange) {
  return supa.channel('reportes-mios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reportes', filter: `usuario_id=eq.${usuarioId}` }, onChange)
    .subscribe();
}
