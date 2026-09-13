/* ============== MODO DEMO ==============
 *
 * Reemplaza los datos identificatorios por otros inventados, SOLO en pantalla.
 * La base no se toca: esto corre después de cargarDatos(), sobre el objeto que
 * ya está en memoria. Salir del modo demo es recargar sin el parámetro.
 *
 * Se activa agregando ?demo=1 a la dirección:
 *     https://gestiongrupoab.com.ar/?demo=1
 *
 * Sin ese parámetro este archivo no hace absolutamente nada, así que tenerlo
 * publicado no cambia el comportamiento para los usuarios reales.
 *
 * PARA QUÉ SIRVE Y PARA QUÉ NO: sirve para mostrar el sistema sin exponer el
 * padrón real. NO es una medida de seguridad — los datos verdaderos igual
 * viajan al navegador, como siempre. Es una máscara de presentación.
 *
 * QUÉ NO SE ENMASCARA, a propósito:
 *   - EJECUTIVO: es de lo que dependen los permisos por dupla (ver
 *     permissions.js). Si se cambiara acá, el usuario dejaría de coincidir con
 *     su propia dupla y no podría editar nada durante la demostración.
 *   - ZONA y LOCALIDAD: no identifican a nadie y, cambiadas, la demostración
 *     queda irreal.
 *   - Compañías, ramos, trimestres y cantidades: son datos estructurales, no
 *     personales, y son los que hacen que los números se vean creíbles.
 */

/* Vuelto a la normalidad el 2026-09-12: el modo demostración ya no está
 * forzado para todos (era temporal, para la presentación del 2026-09-10).
 * Ahora es opt-in con ?demo=1 — entrar a la dirección de siempre muestra
 * los datos tal como están, con lectura y escritura normales. */
const MODO_DEMO = new URLSearchParams(location.search).has('demo');

/* Cuántos productores muestra la demostración. Por defecto, 50.
 *
 * Enmascarar los nombres no oculta los números del negocio: el tablero seguiría
 * mostrando el total de pólizas, los rankings y la producción por compañía sobre
 * el padrón entero. Recortar el conjunto es lo que evita exponer el volumen
 * comercial además de la identidad.
 *
 * Se puede cambiar con ?max=N. Un número mayor al padrón (?max=9999) muestra
 * todos. Un valor inválido vuelve al valor por defecto. Esto solo afecta al modo
 * demostración: con ?real=1 se ven siempre todos. */
const LIMITE_DEMO_POR_DEFECTO = 50;

const LIMITE_DEMO = (() => {
  const crudo = new URLSearchParams(location.search).get('max');
  if (crudo === null) return LIMITE_DEMO_POR_DEFECTO;
  const v = parseInt(crudo, 10);
  return Number.isFinite(v) && v > 0 ? v : LIMITE_DEMO_POR_DEFECTO;
})();

const DEMO_NOMBRES = [
  'Agustín','Alejandra','Andrés','Ana','Bruno','Beatriz','Carlos','Carla','Damián','Daniela',
  'Emiliano','Elena','Facundo','Florencia','Gastón','Gabriela','Hernán','Inés','Ignacio','Irene',
  'Joaquín','Julieta','Leandro','Lucía','Martín','Mariana','Nicolás','Noelia','Octavio','Olivia',
  'Pablo','Paula','Ramiro','Rocío','Santiago','Sofía','Tomás','Valeria','Víctor','Verónica',
];

const DEMO_APELLIDOS = [
  'Aguirre','Álvarez','Benítez','Bianchi','Cabrera','Carrizo','Domínguez','Duarte','Escobar','Esquivel',
  'Ferreyra','Figueroa','Gallardo','Godoy','Herrera','Ibarra','Juárez','Ledesma','Luna','Maldonado',
  'Medina','Miranda','Navarro','Ocampo','Olivera','Paredes','Peralta','Quiroga','Ramírez','Rivas',
  'Sarmiento','Sosa','Tejada','Toledo','Urquiza','Valdez','Vega','Villalba','Zabala','Zárate',
];

const DEMO_ORGS = [
  'Organización Norte','Organización Sur','Organización Litoral','Organización Cuyo',
  'Grupo Andino','Grupo Pampa','Grupo Delta','Grupo Sierra',
  'Asesores Reunidos','Asesores del Centro','Red Atlántica','Red Continental',
  'Consultora Aurora','Consultora Zenit','Alianza Comercial','Enlace Asegurador',
];

/* ---------- Bloqueo de escritura ----------
 *
 * En modo demostración los botones y formularios funcionan con normalidad: se
 * abren, validan y se completan igual que siempre. Lo único que no ocurre es el
 * guardado. Así se puede mostrar cómo se carga y se edita sin escribir nada en
 * la base — que además estaría mal, porque los formularios se prellenan con los
 * datos enmascarados y guardarían nombres inventados sobre registros reales.
 */
const AVISO_DEMO = 'Modo demostración: el formulario funciona igual, pero los cambios no se guardan.';

/* Resultado con la misma forma que devuelve Supabase, para las funciones que
 * retornan { data, error }. Se usa como guarda al principio del servicio:
 *     const bloqueo = demoBloqueo(); if (bloqueo) return bloqueo;               */
function demoBloqueo() {
  return MODO_DEMO ? { data: null, error: { message: AVISO_DEMO } } : null;
}

/* Ídem para los servicios que hablan con el Worker y devuelven { resp, result }. */
function demoBloqueoWorker() {
  return MODO_DEMO ? { resp: { ok: false }, result: { error: AVISO_DEMO } } : null;
}

/* Para los formularios que escriben el mensaje en el DOM en vez de devolverlo.
 * Va en verde a propósito: en una demostración esto no es un error, es lo
 * esperado, y en rojo parecería que algo falló. */
function demoAvisoFormulario(idMensaje) {
  if (!MODO_DEMO) return false;
  const el = document.getElementById(idMensaje);
  if (el) el.innerHTML = `<div class="formok">${AVISO_DEMO}</div>`;
  return true;
}

/* Hash determinista: el mismo texto de entrada da siempre el mismo resultado.
 * Es lo que hace que un productor se llame igual en la tabla, en su ficha y en
 * el ranking del tablero. Dos semillas distintas para que nombre y apellido no
 * queden correlacionados. */
function demoHash(texto, semilla) {
  let x = semilla >>> 0;
  for (let i = 0; i < texto.length; i++) x = (Math.imul(x, 31) + texto.charCodeAt(i)) >>> 0;
  return x;
}

/* Asigna un nombre inventado por cada nombre real, sin repetir: ante una
 * colisión avanza a la combinación siguiente hasta encontrar una libre. Con 968
 * productores y 1.600 combinaciones esto pasa seguido, y sin resolverlo dos
 * productores distintos aparecerían con el mismo nombre. */
function crearAsignador(hacerValor) {
  const asignados = new Map();
  const usados = new Set();
  return function (real) {
    if (real === null || real === undefined || real === '') return real;
    const clave = String(real);
    if (asignados.has(clave)) return asignados.get(clave);

    // Arranca en 0: la variación entre claves la aporta hacerValor() con su
    // propio hash. Si arrancara en el hash, el contador de "vueltas" que usan
    // los generadores nacería en un número enorme.
    let i = 0;
    let valor;
    let intentos = 0;
    do {
      valor = hacerValor(clave, i);
      i++;
      intentos++;
    } while (usados.has(valor) && intentos < 5000);

    usados.add(valor);
    asignados.set(clave, valor);
    return valor;
  };
}

/* Asignadores a nivel de módulo (no adentro de enmascararDatos): así el mismo
 * nombre real da siempre el mismo nombre inventado en CUALQUIER pantalla que
 * lo consulte, no solo en la que llamó primero a cargarDatos(). Auditoría,
 * Usuarios y Perfil bajan sus datos por su cuenta, en otro momento, y tienen
 * que coincidir con lo que ya se ve en Productores. */
const nombrePas = crearAsignador((clave, i) => {
  const CN = DEMO_NOMBRES.length, CA = DEMO_APELLIDOS.length;
  // i avanza el nombre; cada vuelta completa de nombres avanza el apellido.
  // Así se recorre la grilla entera (1.600 combinaciones) en vez de la
  // diagonal, que daba apenas 40 y repetía nombres por todos lados.
  const n = DEMO_NOMBRES[(demoHash(clave, 131) + i) % CN];
  const a = DEMO_APELLIDOS[(demoHash(clave, 977) + Math.floor(i / CN)) % CA];
  // Agotada la grilla, se agrega un segundo apellido en vez de repetir.
  const vuelta = Math.floor(i / (CN * CA));
  return vuelta === 0 ? `${n} ${a}` : `${n} ${a} ${DEMO_APELLIDOS[vuelta % CA]}`;
});

// Los vinculantes son apellidos de personas reales (o siglas). Se enmascaran
// con el mismo criterio, en mayúsculas, que es como están cargados.
const nombreVinculante = crearAsignador((clave, i) => {
  const CA = DEMO_APELLIDOS.length;
  const a = DEMO_APELLIDOS[(demoHash(clave, 211) + i) % CA];
  const vuelta = Math.floor(i / CA);
  return (vuelta === 0 ? a : `${a} ${DEMO_APELLIDOS[vuelta % CA]}`).toUpperCase();
});

const nombreOrg = crearAsignador((clave, i) => {
  const base = DEMO_ORGS[(i + demoHash(clave, 53)) % DEMO_ORGS.length];
  const vuelta = Math.floor(i / DEMO_ORGS.length);
  return vuelta === 0 ? base : `${base} ${vuelta + 1}`;
});

// Personal interno (usuarios/staff de Grupo A+B), no productores: pool y semilla
// propios para que no comparta grilla con nombrePas -- son dos universos
// distintos y no hace falta que "agoten" el mismo cupo de combinaciones.
const nombreUsuario = crearAsignador((clave, i) => {
  const CN = DEMO_NOMBRES.length, CA = DEMO_APELLIDOS.length;
  const n = DEMO_NOMBRES[(demoHash(clave, 421) + i) % CN];
  const a = DEMO_APELLIDOS[(demoHash(clave, 733) + Math.floor(i / CN)) % CA];
  const vuelta = Math.floor(i / (CN * CA));
  return vuelta === 0 ? `${n} ${a}` : `${n} ${a} ${DEMO_APELLIDOS[vuelta % CA]}`;
});

// Teléfono y fecha de nacimiento inventados a partir de un id numérico
// (productores.id / registro_id de auditoría -- el mismo id en las dos
// tablas), para que salgan iguales en Productores y en el detalle de
// Auditoría. Mezcla extra: los id de la base son correlativos, y sin esto los
// teléfonos y las fechas de nacimiento salían en secuencia, que se nota.
function datosPersonalesDemo(idNumerico) {
  let h = demoHash(String(idNumerico), 313);
  // El >>>0 del final no es decorativo: ^= devuelve un entero CON SIGNO, y
  // con h negativo salían teléfonos como "11 -1548-5499" y años de
  // nacimiento anteriores a 1960.
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; h = (h ^ (h >>> 13)) >>> 0;
  return {
    telefono: `11 ${4000 + (h % 6000)}-${1000 + ((h >>> 8) % 9000)}`,
    fechaNacimiento: `${1960 + (h % 40)}-${String(1 + ((h >>> 4) % 12)).padStart(2, '0')}-${String(1 + ((h >>> 12) % 28)).padStart(2, '0')}`,
  };
}

// Mail inventado a partir del nombre YA enmascarado (nombrePas(real)), para
// que no delate el nombre real por otra vía.
function mailDemo(nombreEnmascarado) {
  return `${nombreEnmascarado.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.')}@ejemplo.com`;
}

function enmascararDatos(D) {
  if (!MODO_DEMO || !D) return D;

  // El recorte va ANTES de enmascarar: no tiene sentido inventarle nombre a 968
  // productores para después descartar 918. La producción se filtra a los que
  // quedan, o los rankings y la ficha mostrarían cargas de productores que ya
  // no están en el listado.
  if (LIMITE_DEMO && Array.isArray(D.producers) && D.producers.length > LIMITE_DEMO) {
    D.producers = D.producers.slice(0, LIMITE_DEMO);
    const idsQueQuedan = new Set(D.producers.map(p => p._id));
    D.production = (D.production || []).filter(r => idsQueQuedan.has(r._pas_id));
  }

  (D.producers || []).forEach(p => {
    const { telefono, fechaNacimiento } = datosPersonalesDemo(p._id);
    p['PAS'] = nombrePas(p['PAS']);
    p['ORGANIZACIÓN'] = nombreOrg(p['ORGANIZACIÓN']);
    p['VINCULANTE'] = nombreVinculante(p['VINCULANTE']);
    p['TELÉFONO'] = p['TELÉFONO'] ? telefono : p['TELÉFONO'];
    p['MAIL'] = p['MAIL'] ? mailDemo(p['PAS']) : p['MAIL'];
    if (p['FECHA DE NACIMIENTO']) p['FECHA DE NACIMIENTO'] = fechaNacimiento;
    // Texto libre: puede contener cualquier cosa, se vacía entero.
    if (p['OBSERVACIONES']) p['OBSERVACIONES'] = '—';
  });

  // La producción trae el nombre del PAS copiado: hay que pasarlo por el mismo
  // asignador o la ficha y los rankings mostrarían nombres distintos del listado.
  (D.production || []).forEach(r => {
    r['PAS'] = nombrePas(r['PAS']);
    if (r['ORGANIZADOR']) r['ORGANIZADOR'] = nombreOrg(r['ORGANIZADOR']);
  });

  // El catálogo alimenta los desplegables de filtro: si no se enmascara igual,
  // el filtro por organización deja de coincidir con lo que muestra la tabla.
  if (D.catalog && Array.isArray(D.catalog.organizaciones)) {
    D.catalog.organizaciones = D.catalog.organizaciones.map(nombreOrg);
  }
  if (D.catalog && Array.isArray(D.catalog.vinculantes)) {
    D.catalog.vinculantes = D.catalog.vinculantes.map(nombreVinculante);
  }

  // Con el conjunto recortado, los desplegables quedarían llenos de opciones
  // que no filtran nada. Se limitan a los valores que de verdad aparecen.
  if (LIMITE_DEMO && D.catalog) {
    const presentes = campo => new Set(D.producers.map(p => p[campo]).filter(Boolean));
    if (Array.isArray(D.catalog.organizaciones)) {
      const usadas = presentes('ORGANIZACIÓN');
      D.catalog.organizaciones = D.catalog.organizaciones.filter(o => usadas.has(o));
    }
    if (Array.isArray(D.catalog.vinculantes)) {
      const usados = presentes('VINCULANTE');
      D.catalog.vinculantes = D.catalog.vinculantes.filter(v => usados.has(v));
    }
  }

  return D;
}

/* ---------- Auditoría, Usuarios y Perfil ----------
 *
 * enmascararDatos() solo corre sobre lo que trae cargarDatos() al iniciar
 * sesión (D.producers/D.production/D.catalog). Auditoría, Usuarios y Perfil
 * bajan sus propios datos por separado, cuando se entra a esa pantalla, y
 * hasta acá no pasaban por ningún enmascarado -- en modo demo mostraban el
 * dato real con la barra de abajo asegurando "datos reemplazados". Estas tres
 * funciones les aplican el mismo criterio, reusando los asignadores de
 * arriba para que un productor o un usuario interno salga con el mismo
 * nombre inventado en cualquier pantalla que lo muestre.
 *
 * A diferencia de D.producers (que usa las claves ya mapeadas, tipo 'PAS'),
 * estas tres reciben filas tal como las devuelve Supabase: columnas de la
 * base (pas_nombre, organizacion, telefono, nombre_completo...).
 */

function enmascararFilaAuditoria(a) {
  if (!MODO_DEMO || !a) return a;

  const enmascararProductor = obj => {
    if (!obj) return obj;
    const copia = { ...obj };
    const nombreMasked = 'pas_nombre' in copia ? nombrePas(obj.pas_nombre) : null;
    if (nombreMasked !== null) copia.pas_nombre = nombreMasked;
    if ('organizacion' in copia) copia.organizacion = nombreOrg(obj.organizacion);
    if ('vinculante' in copia) copia.vinculante = nombreVinculante(obj.vinculante);
    if (copia.telefono) copia.telefono = datosPersonalesDemo(a.registro_id).telefono;
    if (copia.mail) copia.mail = mailDemo(nombreMasked || 'productor');
    if (copia.fecha_nacimiento) copia.fecha_nacimiento = datosPersonalesDemo(a.registro_id).fechaNacimiento;
    // Texto libre, mismo criterio que en enmascararDatos: se vacía entero.
    if (copia.observaciones) copia.observaciones = '—';
    return copia;
  };

  const enmascararProduccion = obj => {
    if (!obj) return obj;
    const copia = { ...obj };
    if (copia.organizador) copia.organizador = nombreOrg(obj.organizador);
    return copia;
  };

  // usuarios/catalogos/metas/reportes: agregados a Auditoría el 2026-09-13,
  // después de que esta función se escribiera la primera vez. Sin esto, el
  // "Sobre" y el detalle de una fila de auditoría sobre estas tablas mostraban
  // el dato real (nombre de un usuario interno, valor de catálogo) aunque el
  // resto de la fila ya estuviera en modo demo.
  const enmascararUsuarioAuditado = obj => {
    if (!obj) return obj;
    const copia = { ...obj };
    if (copia.nombre_completo) copia.nombre_completo = nombreUsuario(obj.nombre_completo);
    return copia;
  };

  // Solo organizacion/vinculante se enmascaran acá, mismo criterio que en
  // D.catalog: ejecutivo (duplas) no se toca porque de eso dependen los
  // permisos, y zona/localidad no identifican a nadie.
  const enmascararCatalogoAuditado = obj => {
    if (!obj) return obj;
    const copia = { ...obj };
    if (copia.tipo === 'organizacion' && copia.valor) copia.valor = nombreOrg(obj.valor);
    if (copia.tipo === 'vinculante' && copia.valor) copia.valor = nombreVinculante(obj.valor);
    return copia;
  };

  // El usuario_nombre DE LA FILA DE REPORTES (quién lo mandó) es distinto del
  // usuario_nombre del registro de auditoría (quién hizo la acción auditada,
  // ya enmascarado más abajo) -- acá se enmascara el primero.
  const enmascararReporteAuditado = obj => {
    if (!obj) return obj;
    const copia = { ...obj };
    if (copia.usuario_nombre) copia.usuario_nombre = nombreUsuario(obj.usuario_nombre);
    return copia;
  };

  const copia = { ...a };
  if (copia.usuario_nombre) copia.usuario_nombre = nombreUsuario(a.usuario_nombre);
  if (a.tabla === 'productores') {
    copia.datos_nuevos = enmascararProductor(a.datos_nuevos);
    copia.datos_anteriores = enmascararProductor(a.datos_anteriores);
  } else if (a.tabla === 'producciones') {
    copia.datos_nuevos = enmascararProduccion(a.datos_nuevos);
    copia.datos_anteriores = enmascararProduccion(a.datos_anteriores);
  } else if (a.tabla === 'usuarios') {
    copia.datos_nuevos = enmascararUsuarioAuditado(a.datos_nuevos);
    copia.datos_anteriores = enmascararUsuarioAuditado(a.datos_anteriores);
  } else if (a.tabla === 'catalogos') {
    copia.datos_nuevos = enmascararCatalogoAuditado(a.datos_nuevos);
    copia.datos_anteriores = enmascararCatalogoAuditado(a.datos_anteriores);
  } else if (a.tabla === 'reportes') {
    copia.datos_nuevos = enmascararReporteAuditado(a.datos_nuevos);
    copia.datos_anteriores = enmascararReporteAuditado(a.datos_anteriores);
  }
  // produccion_companias y metas no tienen nada identificatorio (compania,
  // cantidad · dupla, trimestre, objetivo): no necesitan pasar por acá.
  return copia;
}

// Usuarios existentes (pantalla "Usuarios") y el selector de "Ver perfil de"
// (pantalla "Perfil"): ambas listas de personal interno, no de productores.
function enmascararFilaUsuario(u) {
  if (!MODO_DEMO || !u) return u;
  const copia = { ...u };
  if (copia.nombre_completo) copia.nombre_completo = nombreUsuario(u.nombre_completo);
  if (copia.email) copia.email = mailDemo(nombreUsuario(u.nombre_completo || u.id));
  return copia;
}

// Reportes (pantalla admin "Reportes"): se enmascara quién lo mandó, no el
// contenido -- el mensaje/respuesta es feedback sobre el sistema, no un dato
// personal de un productor, y vaciarlo dejaría la demostración sin nada que
// mostrar en una de las pantallas que más conviene exhibir.
function enmascararFilaReporte(r) {
  if (!MODO_DEMO || !r) return r;
  const copia = { ...r };
  if (copia.usuario_nombre) copia.usuario_nombre = nombreUsuario(r.usuario_nombre);
  return copia;
}

/* Aviso permanente en pantalla. Existe para que nadie confunda una demostración
 * con datos reales, ni al revés: si la barra no está, lo que se ve es real. */
function marcarModoDemo() {
  if (!MODO_DEMO || document.getElementById('demo-barra')) return;
  const barra = document.createElement('div');
  barra.id = 'demo-barra';
  barra.textContent = 'MODO DEMOSTRACIÓN · datos reemplazados · solo lectura';
  barra.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#8A5C12;' +
    'color:#fff;font:600 11px/1 system-ui,sans-serif;letter-spacing:.08em;text-align:center;' +
    'padding:6px 8px;text-transform:uppercase;pointer-events:none';
  document.body.appendChild(barra);
}

/* La barra se agrega sola: así activar el modo demo no requiere tocar ningún
 * archivo más allá de la línea de cargarDatos(). Se cuelga de <body>, no de
 * #root, así que sobrevive a los redibujados de la app. */
if (MODO_DEMO) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', marcarModoDemo);
  else marcarModoDemo();
}
