/* ============== SERVICIO: DUPLAS (crear/borrar la propia, o cualquiera si sos admin) ============== */
async function crearDuplaPropia(nombre) {
  const bloqueo = demoBloqueo(); if (bloqueo) return bloqueo;
  return supa.rpc('crear_dupla_propia', { p_nombre: nombre });
}

async function eliminarDuplaPropia(nombre) {
  const bloqueo = demoBloqueo(); if (bloqueo) return bloqueo;
  return supa.rpc('eliminar_dupla_propia', { p_nombre: nombre });
}

async function eliminarDuplaAdmin(nombre) {
  const bloqueo = demoBloqueo(); if (bloqueo) return bloqueo;
  return supa.rpc('eliminar_dupla_admin', { p_nombre: nombre });
}
