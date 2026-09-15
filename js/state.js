const root = document.getElementById('root');

let D = null;       // datos ya transformados (mismo formato que usaba data.js)
let perfil = null;  // { id, nombre_completo, rol, dupla_asignada }
let reportesCache = null; // { rows } o { error } — se carga bajo demanda al entrar a la vista Reportes
let misReportesCache = null; // ídem, para la vista "Mis reportes" (filtrada a los propios)
let usuariosCache = null; // { rows } o { error } — lista de usuarios existentes, para editar nombre/rol/dupla
let perfilesCache = null; // { rows } o { error } — usuarios con dupla, para que admin/jefe elijan de quién ver el Perfil
let auditoriaCache = null; // { rows } o { error } — historial de cambios (tabla "auditoria", la llena un trigger)
let momentoUltimaCarga = null; // cuándo se bajó el conjunto que está en pantalla (lo usa el botón "Actualizar")

// Realtime: canal activo de cada vista + cuál de todas tiene la suscripción viva (o null)
let canalReportesAdmin = null;
let canalMisReportes = null;
let canalMetas = null;
let vistaConSuscripcion = null;

// Corta la suscripción realtime activa, sea cual sea. Se llama desde render() al cambiar de vista, y desde el logout.
function desuscribirRealtime() {
  if (vistaConSuscripcion === 'reportes' && canalReportesAdmin) { supa.removeChannel(canalReportesAdmin); canalReportesAdmin = null; }
  if (vistaConSuscripcion === 'mis-reportes' && canalMisReportes) { supa.removeChannel(canalMisReportes); canalMisReportes = null; }
  if (vistaConSuscripcion === 'perfil' && canalMetas) { supa.removeChannel(canalMetas); canalMetas = null; }
  vistaConSuscripcion = null;
}

let state = { view: 'dashboard', org: 'TODOS', pasSel: 'TODOS', q: '', pas: null, pagina: 1, trimFicha: 'TODOS', chartCompania: null, chartRamo: null, chartEvo: 'TOTAL', cmpDim: 'ZONA', cmpSel: [], cmpDesglose: null, perfilObjetivoId: null, miDuplaSel: null,
  // Filtros por columna de la tabla de Productores (independientes del buscador de texto)
  fProd: { organizacion: 'TODOS', vinculante: 'TODOS', ejecutivo: 'TODOS', estado: 'TODOS', zona: 'TODOS', localidad: 'TODOS' } };

/* ============== CARGA Y TRANSFORMACIÓN DE DATOS ============== */

/* Las dos funciones que traducen una fila de la base al objeto que usa la app.
 * Están sueltas —y no adentro de cargarDatos()— porque el refresco por acción
 * (más abajo) vuelve a traer filas de a una y tiene que armarlas EXACTAMENTE
 * igual que la carga inicial. Si se duplicara el mapeo, la fila refrescada
 * tendría campos distintos que el resto y las pantallas mostrarían cualquier
 * cosa para ese registro. */
function mapearProductor(r) {
  return {
    _id: r.id,
    // Número de versión al momento de leer la fila. Se manda de vuelta al
    // guardar: si no coincide con el de la base, es que otra persona modificó
    // la fila mientras esta pantalla la tenía abierta. Ver
    // sql/2026-09-10-control-de-version.sql.
    _version: r.version,
    'ORGANIZACIÓN': r.organizacion,
    'PAS': r.pas_nombre,
    'VINCULANTE': r.vinculante,
    'EJECUTIVO': r.ejecutivo,
    'TELÉFONO': r.telefono,
    'MAIL': r.mail,
    'FECHA DE NACIMIENTO': r.fecha_nacimiento,
    'COMPAÑÍAS CON LAS QUE OPERA': r.companias_opera,
    'CANTIDAD DE PÓLIZAS VIGENTES': r.cantidad_polizas_vigentes,
    'OBSERVACIONES': r.observaciones,
    'ESTADO': r.estado,
    'ZONA': r.zona,
    'LOCALIDAD/PROV': r.localidad_prov,
  };
}

/* El camino inverso de mapearProductor(): del objeto que usa la app a los
 * nombres de columna de la base. Lo necesita la fusión de cambios, que compara
 * "con qué datos se llenó el formulario" contra "qué hay ahora en la base" y
 * necesita las dos cosas en el mismo idioma.
 *
 * Si tocás uno de los dos mapeos, tocá el otro: hay un test que los compara. */
function columnasDesdeProductor(p) {
  return {
    pas_nombre: p['PAS'],
    organizacion: p['ORGANIZACIÓN'],
    vinculante: p['VINCULANTE'],
    ejecutivo: p['EJECUTIVO'],
    telefono: p['TELÉFONO'],
    mail: p['MAIL'],
    fecha_nacimiento: p['FECHA DE NACIMIENTO'],
    companias_opera: p['COMPAÑÍAS CON LAS QUE OPERA'],
    observaciones: p['OBSERVACIONES'],
    estado: p['ESTADO'],
    zona: p['ZONA'],
    localidad_prov: p['LOCALIDAD/PROV'],
  };
}

/* Comparación de valores para la fusión. La base guarda NULL donde el
 * formulario devuelve cadena vacía, y los espacios de más no son un cambio:
 * sin normalizar, abrir un formulario y guardarlo sin tocar nada figuraría como
 * "cambié doce campos" y todo choque sería un choque. */
function mismoValor(a, b) {
  const norm = v => (v === null || v === undefined) ? '' : String(v).trim();
  return norm(a) === norm(b);
}

// Qué campos cambiaron entre dos versiones del mismo registro. Devuelve solo
// los distintos, con el valor nuevo: es lo único que hace falta mandar a la base.
function camposCambiados(antes, despues) {
  const cambios = {};
  Object.keys(despues || {}).forEach(k => {
    if (!mismoValor((antes || {})[k], despues[k])) cambios[k] = despues[k];
  });
  return cambios;
}

function mapearProduccion(r, nombrePas, companias, ejecutivoActual) {
  return {
    _id: r.id,
    _pas_id: r.pas_id,
    _version: r.version, // ídem: control de concurrencia al guardar

    'PAS': nombrePas || '(desconocido)',
    'RAMO': r.ramo,
    'TRIMESTRE': r.trimestre,
    // Se toma del productor ACTUAL, no de esta fila: producciones.ejecutivo es una copia hecha al
    // crear la carga que no se actualiza si el PAS cambia de dupla -- el mismo motivo por el que
    // crear_produccion_completa y los RPC de borrado dejaron de confiar en esta columna (ver
    // sql/2026-09-13-corregir-ejecutivo-produccion.sql). Sin este join en vivo, las estadísticas de
    // Perfil/Dashboard/Comparar seguían sumando el historial completo a la dupla vieja para siempre.
    // Cae a r.ejecutivo solo si no se encontró el productor (caller no pasó el dato).
    'EJECUTIVO': ejecutivoActual !== undefined ? (ejecutivoActual || r.ejecutivo) : r.ejecutivo,
    'ORGANIZADOR': r.organizador,
    'TOTAL': r.total_polizas,
    'FECHA': r.ultima_fecha,
    'COMPANIAS': companias || {},
  };
}

// Agrupa las filas de produccion_companias por carga: { [produccion_id]: { compania: cantidad } }
function agruparCompanias(detalleRows) {
  const porProduccion = {};
  (detalleRows || []).forEach(d => {
    if (!porProduccion[d.produccion_id]) porProduccion[d.produccion_id] = {};
    porProduccion[d.produccion_id][d.compania] = (porProduccion[d.produccion_id][d.compania] || 0) + (+d.cantidad || 0);
  });
  return porProduccion;
}

async function cargarDatos() {
  const [{ data: productoresRows, error: e1 }, { data: produccionesRows, error: e2 },
         { data: detalleRows, error: e3 }, { data: catalogoRows, error: e4 },
         { data: metasRows, error: e5 }] = await Promise.all([
    fetchAllRows('productores'),
    fetchAllRows('producciones'),
    fetchAllRows('produccion_companias'),
    fetchAllRows('catalogos'),
    fetchAllRows('metas'),
  ]);
  if (e1 || e2 || e3 || e4 || e5) {
    console.error(e1, e2, e3, e4, e5);
    throw new Error('No se pudieron cargar los datos desde Supabase.');
  }

  const pasIdToNombre = {};
  const pasIdToEjecutivo = {};
  const producers = (productoresRows || []).map(r => {
    pasIdToNombre[r.id] = r.pas_nombre;
    pasIdToEjecutivo[r.id] = r.ejecutivo;
    return mapearProductor(r);
  });

  const companiasPorProduccion = agruparCompanias(detalleRows);

  const production = (produccionesRows || []).map(r =>
    mapearProduccion(r, pasIdToNombre[r.pas_id], companiasPorProduccion[r.id], pasIdToEjecutivo[r.pas_id]));

  const porTipo = t => [...new Set((catalogoRows || []).filter(c => c.tipo === t && c.activo !== false).map(c => c.valor))];
  const catalog = {
    ejecutivos: porTipo('ejecutivo'),
    organizaciones: porTipo('organizacion'),
    companias: porTipo('compania'),
    vinculantes: porTipo('vinculante'),
    ramos: porTipo('ramo'),
    trimestres: porTipo('trimestre'),
    estados: porTipo('estado'),
    zonas: porTipo('zona'),
    localidades: porTipo('localidad_prov'),
  };

  const metas = (metasRows || []).map(r => ({
    _id: r.id,
    dupla: r.dupla,
    trimestre: r.trimestre,
    objetivo_polizas: r.objetivo_polizas,
  }));

  // Modo demo (?demo=1): reemplaza nombres y datos de contacto por otros
  // inventados, en memoria. Sin el parámetro devuelve el objeto sin tocar.
  // Ver js/demo.js.
  // Momento en que se bajó lo que está en pantalla. Lo muestra el botón
  // "Actualizar": el problema real no es que el dato esté viejo, es no saber
  // que lo está. Ver barraActualizar() en js/utils/ui.js.
  momentoUltimaCarga = Date.now();

  return enmascararDatos({ producers, production, catalog, metas });
}


/* ============== REFRESCO POR ACCIÓN ==============
 *
 * cargarDatos() se corre al iniciar sesión y no se repite sola: una pestaña
 * abierta a la mañana muestra los datos de la mañana toda la tarde. Eso tiene
 * dos consecuencias molestas — se edita sobre información vieja sin saberlo, y
 * el control de versión rechaza el guardado (sql/2026-09-10-control-de-version.sql)
 * obligando a recargar la página entera.
 *
 * Estas funciones vuelven a consultar UNA fila (o las cargas de UN productor)
 * en el momento en que se la va a usar, y la reemplazan adentro de D. Es una
 * consulta de unas pocas filas, no las ~2.500 de la carga inicial, así que se
 * puede hacer en cada acción sin que se note.
 *
 * QUÉ DEVUELVEN — los tres valores significan cosas distintas:
 *   · el objeto  → se leyó bien, y ya quedó actualizado dentro de D
 *   · null       → la fila YA NO EXISTE (alguien la borró)
 *   · undefined  → no se pudo consultar (red, permisos). Quien llama sigue con
 *                  lo que tenía: preferimos datos viejos a no dejar trabajar.
 *
 * MODO DEMOSTRACIÓN: no refrescan nada. Los datos de D están enmascarados con
 * nombres inventados (js/demo.js) y una fila traída de la base vendría con el
 * nombre REAL del productor, que es justo lo que la demostración esconde. Como
 * en modo demostración además no se guarda nada, no se pierde nada al no
 * refrescar. */

async function refrescarProductor(id) {
  if (MODO_DEMO) return undefined;

  const { data, error } = await supa.from('productores').select('*').eq('id', id).maybeSingle();
  if (error) { console.warn('No se pudo refrescar el productor', id, error); return undefined; }
  if (!data) {
    // Lo borraron. Lo sacamos de memoria junto con sus cargas: si no, la ficha
    // lo sigue encontrando y se puede seguir navegando un registro fantasma.
    D.producers = (D.producers || []).filter(x => String(x._id) !== String(id));
    D.production = (D.production || []).filter(x => String(x._pas_id) !== String(id));
    return null;
  }

  const fresco = mapearProductor(data);
  const i = (D.producers || []).findIndex(x => String(x._id) === String(id));
  if (i >= 0) D.producers[i] = fresco; else D.producers.push(fresco);

  // Las cargas de producción guardan el nombre del PAS copiado (no lo leen de
  // producers), así que si le cambiaron el nombre hay que propagarlo o la ficha
  // muestra el nombre nuevo arriba y el viejo en la tabla de cargas.
  (D.production || []).forEach(x => { if (String(x._pas_id) === String(id)) x.PAS = fresco.PAS; });

  return fresco;
}

async function refrescarProduccion(id) {
  if (MODO_DEMO) return undefined;

  const [{ data: fila, error: e1 }, { data: detalle, error: e2 }] = await Promise.all([
    supa.from('producciones').select('*').eq('id', id).maybeSingle(),
    supa.from('produccion_companias').select('*').eq('produccion_id', id),
  ]);
  if (e1 || e2) { console.warn('No se pudo refrescar la carga', id, e1 || e2); return undefined; }
  if (!fila) {
    // Ídem: la carga la borró otra persona, la sacamos de la tabla en memoria.
    D.production = (D.production || []).filter(x => String(x._id) !== String(id));
    return null;
  }

  const pasActual = (D.producers || []).find(x => String(x._id) === String(fila.pas_id)) || {};
  const fresca = mapearProduccion(fila, pasActual.PAS, agruparCompanias(detalle)[fila.id], pasActual.EJECUTIVO);
  const i = (D.production || []).findIndex(x => String(x._id) === String(id));
  if (i >= 0) D.production[i] = fresca; else D.production.push(fresca);

  return fresca;
}

/* Todas las cargas de un PAS de una vez: es lo que necesita la ficha, que las
 * muestra como tabla y como gráficos. Reemplaza el bloque entero en vez de fila
 * por fila, así también se reflejan las cargas que otra persona agregó o borró.
 * Devuelve true si pudo, false si no (acá no hay "ya no existe": un PAS sin
 * cargas es un resultado válido). */
async function refrescarCargasDelPas(pasId) {
  if (MODO_DEMO) return false;

  const { data: filas, error } = await supa.from('producciones').select('*').eq('pas_id', pasId);
  if (error) { console.warn('No se pudieron refrescar las cargas del PAS', pasId, error); return false; }

  let detalle = [];
  const ids = (filas || []).map(f => f.id);
  if (ids.length) {
    const { data, error: e2 } = await supa.from('produccion_companias').select('*').in('produccion_id', ids);
    // Sin el detalle las cargas quedarían en cero pólizas por compañía, que se
    // ve igual que "no cargó nada". Mejor no tocar nada y dejar lo que había.
    if (e2) { console.warn('No se pudo refrescar el detalle por compañía', pasId, e2); return false; }
    detalle = data || [];
  }

  const porProduccion = agruparCompanias(detalle);
  const pasActual = (D.producers || []).find(x => String(x._id) === String(pasId)) || {};
  const frescas = (filas || []).map(f => mapearProduccion(f, pasActual.PAS, porProduccion[f.id], pasActual.EJECUTIVO));

  D.production = (D.production || []).filter(x => String(x._pas_id) !== String(pasId)).concat(frescas);
  return true;
}
