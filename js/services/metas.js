/* ============== SERVICIO: METAS (objetivo de pólizas por dupla/trimestre) ============== */
// creado_por lo completa solo un trigger a partir de la sesión (fn_metas_autor, mismo patrón que
// el autor de reportes); no hace falta mandarlo.
async function guardarMeta({ dupla, trimestre, objetivo_polizas }) {
  const bloqueo = demoBloqueo(); if (bloqueo) return bloqueo;
  return supa.from('metas').upsert(
    { dupla, trimestre, objetivo_polizas },
    { onConflict: 'dupla,trimestre' }
  );
}

async function eliminarMeta(id) {
  const bloqueo = demoBloqueo(); if (bloqueo) return bloqueo;
  return supa.from('metas').delete().eq('id', id);
}

async function obtenerMetas() {
  return fetchAllRows('metas');
}

// Suscripción realtime para la vista Perfil: se dispara ante cualquier cambio en la tabla "metas"
function suscribirseMetas(onChange) {
  return supa.channel('metas-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'metas' }, onChange)
    .subscribe();
}
