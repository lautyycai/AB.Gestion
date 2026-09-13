/* ============== PERMISOS ============== */
// Nota: el modo demostración NO se bloquea acá. Los botones y formularios
// tienen que verse y abrirse para poder mostrar el sistema; lo que se bloquea
// es el guardado, en los servicios. Ver js/demo.js.
// dupla_asignada ahora es un array (un usuario puede tener varias duplas: la propia + las que
// se fue creando con "Crear nueva dupla"). Este helper centraliza el chequeo de pertenencia.
function tieneDupla(dupla) {
  return !!(perfil && perfil.dupla_asignada && perfil.dupla_asignada.includes(dupla));
}
// Datos del PAS (nombre, organización, zona, etc.): admin, editor y carga_pas (solo sus propias duplas)
function puedeEditarDatosPas(p) {
  if (!perfil) return false;
  if (perfil.rol === 'admin') return true;
  if (perfil.rol === 'editor' || perfil.rol === 'carga_pas') return p && tieneDupla(p.EJECUTIVO);
  return false;
}
// Producción (cargas de pólizas): admin y editor únicamente (carga_pas NO toca producción)
function puedeCargarProduccion(p) {
  if (!perfil) return false;
  if (perfil.rol === 'admin') return true;
  if (perfil.rol === 'editor') return p && tieneDupla(p.EJECUTIVO);
  return false;
}
function puedeCrearPas() {
  return perfil && (perfil.rol === 'admin' || perfil.rol === 'editor' || perfil.rol === 'carga_pas');
}
// Borrar un PAS entero pasa por el RPC eliminar_pas (security definer). Del lado
// del servidor: admin siempre puede; editor y carga_pas pueden en su propia
// dupla, pero SOLO si el PAS no tiene producción cargada (para no perder
// historial sin querer) — sql/2026-09-11-eliminar-pas-carga-pas.sql, corrido.
function puedeEliminarPas(p) {
  if (!perfil) return false;
  if (perfil.rol === 'admin') return true;
  if (perfil.rol === 'editor' || perfil.rol === 'carga_pas') return p && tieneDupla(p.EJECUTIVO);
  return false;
}
// Metas por dupla: admin y jefe tienen CRUD completo (fijan y controlan el objetivo de otros,
// por eso quedan afuera editor/carga_pas/viewer). La RLS debe reflejar esta misma regla del lado
// del servidor — esto solo muestra/oculta el formulario y el botón de borrar en el front.
function puedeEditarMetas() {
  return !!perfil && (perfil.rol === 'admin' || perfil.rol === 'jefe');
}
