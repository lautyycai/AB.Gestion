/* ============== SERVICIO: METAS (objetivo de pólizas por dupla/trimestre) ============== */
async function guardarMeta({ dupla, trimestre, objetivo_polizas }) {
  const bloqueo = demoBloqueo(); if (bloqueo) return bloqueo;
  const { data: { user } } = await supa.auth.getUser();
  return supa.from('metas').upsert(
    { dupla, trimestre, objetivo_polizas, creado_por: user ? user.id : null },
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
