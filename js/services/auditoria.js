/* ============== SERVICIO: AUDITORÍA (tabla "audit_log", la llena el trigger fn_audit_log) ============== */
// Traemos los últimos 500 eventos — la tabla crece con cada edición/creación/borrado, así que no
// usamos fetchAllRows (traería todo el historial completo, que solo crece con el tiempo).
async function obtenerAuditoria() {
  return supa.from('audit_log').select('*').order('created_at', { ascending: false }).limit(500);
}
