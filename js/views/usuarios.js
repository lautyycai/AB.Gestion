/* ============== USUARIOS (solo admin): crear cuentas nuevas vía Cloudflare Worker ============== */
const ROLES_USUARIO = [
  { valor: 'admin', etiqueta: 'Admin' },
  { valor: 'editor', etiqueta: 'Operaciones' },
  { valor: 'carga_pas', etiqueta: 'Comercial' },
  { valor: 'viewer', etiqueta: 'Observador' },
  { valor: 'jefe', etiqueta: 'Jefe' },
];
const necesitaDupla = rol => rol === 'editor' || rol === 'carga_pas';

function vistaUsuarios() {
  if (perfil.rol !== 'admin') { state.view = 'dashboard'; return render(); }

  $('#app').innerHTML = `<div class="top"><div><h1>Usuarios</h1><div class="sub">Crear cuentas nuevas para acceder a la app</div></div></div>
    <div class="card" style="max-width:520px">
      <h3>Nuevo usuario</h3>
      <div class="formgrid">
        <div class="full"><label>Nombre completo</label><input id="us-nombre" placeholder="Nombre y apellido"></div>
        <div class="full"><label>Email</label><input id="us-email" type="email" placeholder="usuario@abgestion.sistema"></div>
        <div class="full"><label>Contraseña temporal</label><div class="pass-wrap"><input id="us-pass" type="password" placeholder="Mínimo 8 caracteres, con mayúscula, minúscula y número"><button type="button" class="pass-toggle" id="us-pass-toggle"></button></div></div>
        <div><label>Rol</label><select id="us-rol">${ROLES_USUARIO.map(r => `<option value="${r.valor}" ${r.valor === 'editor' ? 'selected' : ''}>${r.etiqueta}</option>`).join('')}</select></div>
        <div id="us-dupla-wrap"><label>Dupla asignada</label><select id="us-dupla"><option value="" disabled selected>Elegí una dupla</option>${[...D.catalog.ejecutivos].sort((a, b) => a.localeCompare(b, 'es')).map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join('')}</select></div>
      </div>
      <div id="us-msg"></div>
      <div class="modal-actions" style="justify-content:flex-start">
        <button class="btn-primary" id="btn-crear-usuario">Crear usuario</button>
      </div>
    </div>
    <div class="section" id="usuarios-lista-wrap"></div>`;

  const actualizarDuplaVisible = () => {
    document.getElementById('us-dupla-wrap').style.display = necesitaDupla(document.getElementById('us-rol').value) ? 'block' : 'none';
  };
  document.getElementById('us-rol').onchange = actualizarDuplaVisible;
  actualizarDuplaVisible();
  activarTogglePassword('us-pass', 'us-pass-toggle');

  document.getElementById('btn-crear-usuario').onclick = async () => {
    const btn = document.getElementById('btn-crear-usuario');
    const msg = document.getElementById('us-msg');
    msg.innerHTML = '';
    const nombre_completo = document.getElementById('us-nombre').value.trim();
    const email = document.getElementById('us-email').value.trim();
    const password = document.getElementById('us-pass').value;
    const rol = document.getElementById('us-rol').value;
    const dupla_asignada = document.getElementById('us-dupla').value;

    if (!nombre_completo || !email || !password) { msg.innerHTML = '<div class="formerr">Completá nombre, email y contraseña.</div>'; return; }
    if (!PASSWORD_REGEX.test(password)) { msg.innerHTML = `<div class="formerr">${MENSAJE_PASSWORD_INVALIDA}</div>`; return; }
    if (necesitaDupla(rol) && !dupla_asignada) { msg.innerHTML = '<div class="formerr">Este rol necesita una dupla asignada.</div>'; return; }

    btn.disabled = true; btn.textContent = 'Creando...';
    try {
      const { resp, result } = await crearUsuario({ email, password, nombre_completo, rol, dupla_asignada });
      btn.disabled = false; btn.textContent = 'Crear usuario';
      if (!resp.ok) { msg.innerHTML = `<div class="formerr">${esc(result.error || 'No se pudo crear el usuario')}</div>`; return; }
      msg.innerHTML = '<div class="formok">Usuario creado correctamente.</div>';
      document.getElementById('us-nombre').value = '';
      document.getElementById('us-email').value = '';
      document.getElementById('us-pass').value = '';
      document.getElementById('us-dupla').selectedIndex = 0;
      usuariosCache = null;
      renderListaUsuarios();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Crear usuario';
      msg.innerHTML = `<div class="formerr">Error de red: ${esc(err.message)}</div>`;
    }
  };

  renderListaUsuarios();
}

async function cargarUsuarios() {
  const { data, error } = await obtenerUsuarios();
  if (error) { usuariosCache = { error: error.message }; renderListaUsuarios(); return; }
  const filas = data || [];

  // Si el Worker no contesta seguimos mostrando la lista, pero dejamos anotado que los emails NO
  // se pudieron leer. Importa: sin esa marca el formulario de edición mostraba el campo de email
  // vacío, el admin lo completaba creyendo que faltaba llenarlo, y eso le CAMBIABA el email de
  // login al usuario. Ahora, sin emails, el campo va bloqueado.
  let emailsCargados = false;
  try {
    const { resp, result } = await obtenerCorreosUsuarios();
    if (resp.ok && Array.isArray(result.usuarios)) {
      const mapaEmails = Object.fromEntries(result.usuarios.map(u => [u.id, u.email]));
      filas.forEach(f => { f.email = mapaEmails[f.id] || ''; });
      emailsCargados = true;
    }
  } catch (e) { /* si falla, seguimos sin emails precargados, no bloqueamos la lista */ }

  usuariosCache = { rows: filas.map(enmascararFilaUsuario), emailsCargados };
  renderListaUsuarios();
}

function renderListaUsuarios() {
  const wrap = document.getElementById('usuarios-lista-wrap');
  if (!wrap) return;

  if (usuariosCache === null) {
    wrap.innerHTML = `<div class="card"><h3>Usuarios existentes</h3><div class="empty">Cargando...</div></div>`;
    cargarUsuarios();
    return;
  }
  if (usuariosCache.error) {
    wrap.innerHTML = `<div class="card"><h3>Usuarios existentes</h3><div class="formerr">No se pudieron cargar: ${esc(usuariosCache.error)}</div></div>`;
    return;
  }

  const filas = usuariosCache.rows;
  wrap.innerHTML = `<div class="card"><h3>Usuarios existentes</h3><div class="tablewrap"><table class="table"><thead><tr><th>Nombre</th><th>Rol</th><th>Dupla</th><th></th></tr></thead><tbody>${filas.map(u => `<tr><td>${esc(u.nombre_completo || '—')}</td><td><span class="pill">${esc((ROLES_USUARIO.find(r => r.valor === u.rol) || {}).etiqueta || u.rol || '')}</span></td><td>${(u.dupla_asignada && u.dupla_asignada.length) ? u.dupla_asignada.map(esc).join(', ') : '—'}</td><td><button class="btn-edit" data-editar-usuario="${u.id}">Editar</button>${u.id !== perfil.id ? ` <button class="btn-del" data-eliminar-usuario="${u.id}" data-nombre-usuario="${esc(u.nombre_completo || '')}" title="Eliminar usuario">×</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="4"><div class="empty">No hay usuarios</div></td></tr>`}</tbody></table></div></div>`;

  document.querySelectorAll('[data-editar-usuario]').forEach(btn => {
    btn.onclick = () => {
      const u = usuariosCache.rows.find(x => String(x.id) === btn.dataset.editarUsuario);
      if (u) abrirModalEditarUsuario(u);
    };
  });
  document.querySelectorAll('[data-eliminar-usuario]').forEach(btn => {
    btn.onclick = () => {
      const nombre = btn.dataset.nombreUsuario;
      confirmarAccion(`¿Eliminar al usuario "${nombre}"? Esta acción no se puede deshacer.`, async () => {
        btn.disabled = true;
        try {
          const { resp, result } = await eliminarUsuario(btn.dataset.eliminarUsuario);
          if (!resp.ok) { mostrarToast(result.error || 'No se pudo eliminar el usuario', 'error'); btn.disabled = false; return; }
          usuariosCache = null;
          renderListaUsuarios();
        } catch (err) {
          mostrarToast('Error de red: ' + err.message, 'error');
          btn.disabled = false;
        }
      });
    };
  });
}

function abrirModalEditarUsuario(u) {
  const ejecutivosOrdenados = [...D.catalog.ejecutivos].sort((a, b) => a.localeCompare(b, 'es'));
  // Si la dupla actual del usuario fue desactivada, no aparece en D.catalog.ejecutivos: sin esto,
  // ninguna <option> queda "selected" y el navegador elige la primera alfabética en su lugar. Antes
  // eso se guardaba en silencio al tocar "Guardar cambios" sin que nadie tocara el campo. Se agrega
  // como opción aparte, marcada, para que quede seleccionada y no se reasigne sola.
  const duplaActual = u.dupla_asignada && u.dupla_asignada[0];
  const duplaActualInactiva = !!duplaActual && !ejecutivosOrdenados.includes(duplaActual);
  const opcionesDupla = duplaActualInactiva ? [duplaActual, ...ejecutivosOrdenados] : ejecutivosOrdenados;
  // Si el usuario no tenía ninguna dupla (por ejemplo, era Observador y se le está por dar un rol
  // que sí necesita una), ninguna <option> de abajo puede quedar "selected" -- sin este placeholder
  // el navegador elegía la primera alfabética y "Guardar cambios" la escribía sin que nadie la haya
  // tocado, con la validación de más abajo pasando de largo porque el valor no estaba vacío.
  const necesitaPlaceholder = !duplaActual;
  const emailsDisponibles = !!(usuariosCache && usuariosCache.emailsCargados);
  const html = `
    <h2>Editar usuario</h2>
    <div class="modal-sub">${esc(u.nombre_completo || '')}</div>
    <div class="formgrid">
      <div class="full"><label>Nombre completo</label><input id="eu-nombre" value="${esc(u.nombre_completo || '')}"></div>
      <div><label>Rol</label><select id="eu-rol">${ROLES_USUARIO.map(r => `<option value="${r.valor}" ${r.valor === u.rol ? 'selected' : ''}>${r.etiqueta}</option>`).join('')}</select></div>
      <div id="eu-dupla-wrap"><label>Dupla asignada</label><select id="eu-dupla">${necesitaPlaceholder ? '<option value="" disabled selected>Elegí una dupla</option>' : ''}${opcionesDupla.map(e => `<option value="${esc(e)}" ${e === duplaActual ? 'selected' : ''}>${esc(e)}${e === duplaActual && duplaActualInactiva ? ' (ya no está activa)' : ''}</option>`).join('')}</select>${duplaActualInactiva ? `<div class="notice" style="margin-top:6px">Esta dupla ya no está activa en el catálogo. Se conserva tal cual si no la cambiás.</div>` : ''}${(u.dupla_asignada && u.dupla_asignada.length > 1) ? `<div class="notice" style="margin-top:6px">Además tiene: ${u.dupla_asignada.slice(1).map(esc).join(', ')} (se conservan al guardar)</div>` : ''}</div>
      <div class="full"><label>Usuario/email</label><input id="eu-email" type="email" value="${esc(u.email || '')}" ${emailsDisponibles ? '' : 'readonly class="readonly"'}>${emailsDisponibles ? '' : '<div class="notice" style="margin-top:6px">No se pudo leer el email actual de este usuario, así que el campo queda bloqueado para no cambiárselo sin querer. Cerrá y recargá la lista de usuarios para poder editarlo.</div>'}</div>
      <div class="full"><label>Nueva contraseña <span style="font-weight:400;color:var(--muted)">(dejar vacío para no cambiarla)</span></label><div class="pass-wrap"><input id="eu-pass" type="password" placeholder="Mínimo 8 caracteres, con mayúscula, minúscula y número"><button type="button" class="pass-toggle" id="eu-pass-toggle"></button></div></div>
    </div>
    <div id="eu-msg"></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="btn-cancelar-eu">Cancelar</button>
      <button class="btn-primary" id="btn-guardar-eu">Guardar cambios</button>
    </div>`;
  abrirModal(html);

  const actualizarDuplaEu = () => {
    document.getElementById('eu-dupla-wrap').style.display = necesitaDupla(document.getElementById('eu-rol').value) ? 'block' : 'none';
  };
  document.getElementById('eu-rol').onchange = actualizarDuplaEu;
  actualizarDuplaEu();
  activarTogglePassword('eu-pass', 'eu-pass-toggle');

  document.getElementById('btn-cancelar-eu').onclick = cerrarModal;
  document.getElementById('btn-guardar-eu').onclick = async () => {
    const btn = document.getElementById('btn-guardar-eu');
    const msg = document.getElementById('eu-msg');
    msg.innerHTML = '';
    const nombre_completo = document.getElementById('eu-nombre').value.trim();
    const rol = document.getElementById('eu-rol').value;
    // El select solo maneja la dupla "principal" (indice 0) — las que el editor se haya creado
    // despues (indice 1 en adelante) se preservan tal cual, no hay UI todavia para tocarlas ahi.
    const duplaPrincipal = document.getElementById('eu-dupla').value;
    const otrasDuplas = (u.dupla_asignada || []).slice(1);
    const nuevoEmail = document.getElementById('eu-email').value.trim();
    // Solo es un cambio de email si sabemos cuál era el anterior (ver emailsDisponibles arriba).
    const emailCambio = emailsDisponibles && nuevoEmail && nuevoEmail !== (u.email || '');
    const nuevaPass = document.getElementById('eu-pass').value;

    if (!nombre_completo) { msg.innerHTML = '<div class="formerr">El nombre no puede quedar vacío.</div>'; return; }
    // Se valida el valor del select, no el array armado: el array siempre daba truthy y esta
    // validación nunca llegaba a dispararse, con lo que se podía guardar una dupla vacía.
    if (necesitaDupla(rol) && !duplaPrincipal) { msg.innerHTML = '<div class="formerr">Este rol necesita una dupla asignada.</div>'; return; }
    if (emailsDisponibles && !nuevoEmail) { msg.innerHTML = '<div class="formerr">El usuario/email no puede quedar vacío.</div>'; return; }
    if (nuevaPass && !PASSWORD_REGEX.test(nuevaPass)) { msg.innerHTML = `<div class="formerr">${MENSAJE_PASSWORD_INVALIDA}</div>`; return; }

    // Si el rol nuevo no usa duplas, NO mandamos el campo: quedan guardadas como estaban. Antes
    // se mandaba null y pasar a alguien a Observador (aunque fuera un segundo, por error) le
    // borraba todas las duplas, incluidas las que se había creado él y no se podían recuperar.
    const cambios = { nombre_completo, rol };
    if (necesitaDupla(rol)) cambios.dupla_asignada = [duplaPrincipal, ...otrasDuplas];

    btn.disabled = true; btn.textContent = 'Guardando...';
    const { error } = await actualizarUsuario(u.id, cambios);
    if (error) {
      btn.disabled = false; btn.textContent = 'Guardar cambios';
      msg.innerHTML = `<div class="formerr">No se pudo guardar: ${esc(error.message)}</div>`;
      return;
    }

    if (emailCambio || nuevaPass) {
      try {
        const { resp, result } = await editarCredencialesUsuario({ id: u.id, email: emailCambio ? nuevoEmail : undefined, password: nuevaPass || undefined });
        if (!resp.ok) {
          btn.disabled = false; btn.textContent = 'Guardar cambios';
          msg.innerHTML = `<div class="formerr">Los datos se guardaron, pero no se pudo cambiar el usuario/contraseña: ${esc(result.error || '')}</div>`;
          return;
        }
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Guardar cambios';
        msg.innerHTML = `<div class="formerr">Los datos se guardaron, pero falló la conexión al cambiar el usuario/contraseña: ${esc(err.message)}</div>`;
        return;
      }
    }

    btn.disabled = false; btn.textContent = 'Guardar cambios';
    msg.innerHTML = '<div class="formok">Guardado correctamente.</div>';
    usuariosCache = null;
    setTimeout(() => { cerrarModal(); cargarUsuarios(); }, 500);
  };
}
