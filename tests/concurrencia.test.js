/* ============== TESTS: DOS PERSONAS EDITANDO A LA VEZ ==============
 *
 * Correr con:   npm test
 *
 * Verifica que guardarPAS() no pise el trabajo de otra persona, y que cuando
 * los cambios no se pisan los intercale solo en vez de molestar al usuario.
 *
 * Los tests corren contra una base de mentira que imita lo que hace la de
 * verdad: el UPDATE filtra por version, y un disparador sube esa version en
 * cada escritura (ver sql/2026-09-10-control-de-version.sql). Que la version la
 * maneje la base falsa y no el test es lo que hace que estas pruebas signifiquen
 * algo: nadie le está diciendo al código la respuesta.
 *
 * Hay dos trampas concretas que estos tests existen para atrapar:
 *
 *   1. La detección de choque se apoya en el .select() del update. Sin él,
 *      Supabase devuelve data en null, la comprobación da "no se guardó"
 *      SIEMPRE, y la app pasa a rechazar TODAS las ediciones con un choque que
 *      no existe. Es un error de una sola palabra que deja el sistema sin poder
 *      editar nada.
 *   2. Si el formulario mandara todos los campos en vez de los que cambiaron,
 *      dos personas editando campos distintos se pisarían igual, y la fusión
 *      sería mentira aunque el resto funcione.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC_SERVICIO = fs.readFileSync(path.join(__dirname, '..', 'js', 'services', 'productores.js'), 'utf8');
const SRC_ESTADO = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');

const FILA_INICIAL = {
  id: 99, version: 7, pas_nombre: 'Un Productor', organizacion: 'ORG', vinculante: '',
  ejecutivo: 'DUPLA_A', telefono: '111', mail: '', fecha_nacimiento: null,
  companias_opera: '', cantidad_polizas_vigentes: 0, observaciones: '',
  estado: 'ACTIVO', zona: 'NORTE', localidad_prov: '',
};

/* Base de mentira con una sola fila. Imita lo que importa de Postgres:
 *   · un update con una version que no es la actual no encuentra nada
 *   · cada update que sí entra sube la version, como el disparador
 *   · un select devuelve el estado real de ese momento */
function crearBaseFalsa(fila) {
  const estado = { fila: fila === null ? null : Object.assign({}, fila), updates: [] };

  function ejecutar(q, unaSola) {
    if (q.op === 'update') {
      estado.updates.push({ campos: Object.assign({}, q.payload), filtros: q.filtros.slice() });
      const filtroVersion = q.filtros.find(([col]) => col === 'version');
      if (estado.fila === null) return { data: [], error: null };
      if (filtroVersion && filtroVersion[1] !== estado.fila.version) return { data: [], error: null };
      Object.assign(estado.fila, q.payload);
      estado.fila.version += 1; // el disparador de la base
      return { data: [{ id: estado.fila.id }], error: null };
    }
    if (estado.fila === null) return unaSola ? { data: null, error: null } : { data: [], error: null };
    const copia = Object.assign({}, estado.fila);
    return unaSola ? { data: copia, error: null } : { data: [copia], error: null };
  }

  const supa = {
    from() {
      const q = { op: 'select', filtros: [], payload: null };
      const api = {
        update(payload) { q.op = 'update'; q.payload = payload; return api; },
        insert(payload) { q.op = 'insert'; q.payload = payload; return api; },
        select() { return api; },
        eq(col, val) { q.filtros.push([col, val]); return api; },
        in() { return api; },
        maybeSingle() { return Promise.resolve(ejecutar(q, true)); },
        single() { return Promise.resolve(ejecutar(q, true)); },
        then(ok, mal) { return Promise.resolve(ejecutar(q, false)).then(ok, mal); },
      };
      return api;
    },
  };

  return { supa, estado };
}

/* Documento de mentira: los campos del formulario salen de `valores`, así un
 * test dice "el usuario escribió otro teléfono" cambiando una sola entrada. */
function crearDocumentoFalso(valores, registro) {
  const elementos = {};
  return {
    getElementById(id) {
      if (id === 'form-pas-msg') {
        return { set innerHTML(v) { registro.mensaje = v; }, get innerHTML() { return registro.mensaje; } };
      }
      if (id === 'btn-guardar-pas') return { disabled: false, textContent: '' };
      if (!elementos[id]) elementos[id] = { value: valores[id] !== undefined ? valores[id] : '', onclick: null };
      return elementos[id];
    },
    querySelectorAll() { return []; }, // sin compañías tildadas
    querySelector(selector) {
      // input[name="choque-telefono"]:checked
      const campo = (selector.match(/choque-([a-z_]+)/) || [])[1];
      return { value: registro.eleccion[campo] || 'mio' };
    },
    _elementos: elementos,
  };
}

const VALORES_BASE = {
  'f-pas': 'Un Productor', 'f-org': 'ORG', 'f-vinc': '', 'f-ejec': 'DUPLA_A',
  'f-tel': '111', 'f-mail': '', 'f-fnac': '', 'f-obs': '',
  'f-estado': 'ACTIVO', 'f-zona': 'NORTE', 'f-loc': '',
};

/* Arma el entorno completo: state.js y services/productores.js compartiendo la
 * misma base falsa, que es como funcionan de verdad. */
function preparar({ fila = FILA_INICIAL, escribe = {}, versionFoto = 7, MODO_DEMO = false } = {}) {
  const registro = { mensaje: '', toasts: [], eleccion: {}, recargas: 0 };
  const { supa, estado } = crearBaseFalsa(fila);

  // El formulario arranca con los valores de la fila y encima lo que tipeó el usuario.
  const valores = Object.assign({}, VALORES_BASE, escribe);
  const document = crearDocumentoFalso(valores, registro);

  // state.js, para usar el refresco y los comparadores de verdad.
  const estadoApi = new Function('document', 'supa', 'MODO_DEMO', 'console', `${SRC_ESTADO}
    return { refrescarProductor, columnasDesdeProductor, camposCambiados, mismoValor, ponerD: v => { D = v; }, verD: () => D };`
  )(document, supa, MODO_DEMO, { warn() {}, error() {}, log() {} });

  estadoApi.ponerD({ producers: [], production: [] });

  const entorno = {
    document, supa,
    D: { producers: [], production: [] },
    state: {},
    esc: s => String(s),
    cargarDatos: async () => { registro.recargas++; return { producers: [], production: [] }; },
    cerrarModal: () => {},
    render: () => {},
    mostrarToast: (m) => registro.toasts.push(m),
    setTimeout: () => {},
    demoAvisoFormulario: () => MODO_DEMO,
    demoBloqueo: () => (MODO_DEMO ? { data: null, error: { message: 'demo' } } : null),
    refrescarProductor: estadoApi.refrescarProductor,
    columnasDesdeProductor: estadoApi.columnasDesdeProductor,
    camposCambiados: estadoApi.camposCambiados,
    mismoValor: estadoApi.mismoValor,
  };

  const nombres = Object.keys(entorno);
  const api = new Function(...nombres, `${SRC_SERVICIO}
    return { guardarPAS, leerFormPAS, ponerFoto: (f, v) => { formPasOriginal = f; formPasVersion = v; } };`
  )(...nombres.map(n => entorno[n]));

  // La foto que habría tomado abrirFormPAS(): el formulario sin tocar.
  const documentoLimpio = crearDocumentoFalso(VALORES_BASE, registro);
  const fotoApi = new Function(...nombres, `${SRC_SERVICIO}; return { leerFormPAS };`)(
    ...nombres.map(n => (n === 'document' ? documentoLimpio : entorno[n]))
  );
  api.ponerFoto(fotoApi.leerFormPAS(), versionFoto);

  return { api, registro, estado, doc: document };
}

describe('guardarPAS · manda solo lo que cambió', () => {

  test('escribe únicamente el campo tocado, no el formulario entero', async () => {
    // Si mandara todo, cambiar la zona reescribiría el teléfono con el valor
    // viejo que tenía el formulario a la vista, y la fusión sería imposible.
    const { api, estado } = preparar({ escribe: { 'f-tel': '999' } });
    await api.guardarPAS(99);

    assert.strictEqual(estado.updates.length, 1);
    assert.deepStrictEqual(Object.keys(estado.updates[0].campos), ['telefono'],
      'mandó campos que el usuario no tocó');
    assert.strictEqual(estado.fila.telefono, '999');
  });

  test('filtra por la versión que tenía al abrir el formulario', async () => {
    const { api, estado } = preparar({ escribe: { 'f-tel': '999' }, versionFoto: 7 });
    await api.guardarPAS(99);

    const filtro = estado.updates[0].filtros.find(([col]) => col === 'version');
    assert.ok(filtro, 'no filtró por version: el guardado puede pisar cambios ajenos');
    assert.strictEqual(filtro[1], 7, 'mandó una versión distinta de la que tenía cargada');
  });

  test('pide .select() — sin él no se puede detectar el choque', () => {
    assert.ok(SRC_SERVICIO.includes(".select('id')"),
      'guardarPAS perdió el .select(): sin filas devueltas, TODA edición se reporta como choque');
  });

  test('si no cambió nada, no escribe', async () => {
    // Un guardado vacío ensuciaría la auditoría con un cambio que no existió.
    const { api, registro, estado, doc } = preparar({});
    await api.guardarPAS(99);

    assert.strictEqual(estado.updates.length, 0, 'escribió sin que hubiera nada que guardar');
    assert.match(registro.mensaje, /No cambiaste nada/);
  });

  test('un guardado normal confirma y recarga los datos', async () => {
    const { api, registro } = preparar({ escribe: { 'f-tel': '999' } });
    await api.guardarPAS(99);

    assert.match(registro.mensaje, /Guardado correctamente/, 'no confirmó un guardado válido');
    assert.doesNotMatch(registro.mensaje, /Otra persona/, 'reportó un choque inexistente');
    assert.strictEqual(registro.recargas, 1);
  });
});

describe('guardarPAS · cuando otra persona guardó en el medio', () => {

  test('si tocó OTRO campo, se intercalan los dos cambios sin molestar a nadie', async () => {
    const { api, registro, estado, doc } = preparar({ escribe: { 'f-tel': '999' } });

    // Otra persona cambió la zona y guardó: la versión ya no es la de la foto.
    estado.fila.zona = 'SUR';
    estado.fila.version = 8;

    await api.guardarPAS(99);

    assert.match(registro.mensaje, /Guardado correctamente/, 'rechazó un cambio que no pisaba nada');
    assert.strictEqual(estado.fila.telefono, '999', 'perdió el cambio de esta persona');
    assert.strictEqual(estado.fila.zona, 'SUR', 'pisó el cambio de la otra persona');
    assert.strictEqual(estado.updates.length, 2, 'no reintentó con la versión nueva');
    assert.ok(registro.toasts.some(t => /Zona/.test(t)),
      'no avisó que la otra persona había cambiado algo');
  });

  test('si tocó EL MISMO campo, no guarda y pide elegir', async () => {
    const { api, registro, estado, doc } = preparar({ escribe: { 'f-tel': '999' } });

    estado.fila.telefono = '555'; // la otra persona tocó lo mismo
    estado.fila.version = 8;

    await api.guardarPAS(99);

    assert.strictEqual(estado.fila.telefono, '555', 'pisó el cambio de la otra persona sin preguntar');
    assert.match(registro.mensaje, /Los dos cambiaron lo mismo/);
    assert.match(registro.mensaje, /Todavía no se guardó nada/);
    assert.match(registro.mensaje, /999/, 'no muestra el valor que puso esta persona');
    assert.match(registro.mensaje, /555/, 'no muestra el valor de la otra persona');
    assert.doesNotMatch(registro.mensaje, /Guardado correctamente/);
  });

  test('elegir "lo mío" en el choque escribe mi valor sobre la versión nueva', async () => {
    const { api, registro, estado, doc } = preparar({ escribe: { 'f-tel': '999' } });
    estado.fila.telefono = '555';
    estado.fila.version = 8;
    await api.guardarPAS(99);

    registro.eleccion = { telefono: 'mio' };
    await doc.getElementById('btn-resolver-choque').onclick();

    assert.strictEqual(estado.fila.telefono, '999');
    assert.match(registro.mensaje, /Guardado correctamente/);
  });

  test('elegir "lo suyo" no escribe ese campo', async () => {
    const { api, registro, estado, doc } = preparar({ escribe: { 'f-tel': '999' } });
    estado.fila.telefono = '555';
    estado.fila.version = 8;
    await api.guardarPAS(99);

    const updatesAntes = estado.updates.length;
    registro.eleccion = { telefono: 'suyo' };
    await doc.getElementById('btn-resolver-choque').onclick();

    assert.strictEqual(estado.fila.telefono, '555', 'escribió igual el valor descartado');
    assert.strictEqual(estado.updates.length, updatesAntes, 'mandó un update vacío');
    assert.match(registro.mensaje, /quedó todo como lo dejó la otra persona/);
  });

  test('si borraron el productor, avisa y no escribe', async () => {
    const { api, registro, estado, doc } = preparar({ escribe: { 'f-tel': '999' } });
    estado.fila = null; // lo eliminaron

    await api.guardarPAS(99);

    assert.match(registro.mensaje, /eliminó/, 'no avisó que el registro ya no existe');
    assert.doesNotMatch(registro.mensaje, /Guardado correctamente/);
  });
});

describe('guardar_produccion_completa · el frontend manda la versión', () => {
  const PROD = fs.readFileSync(path.join(__dirname, '..', 'js', 'services', 'produccion.js'), 'utf8');

  test('la llamada al RPC incluye p_version', () => {
    assert.ok(PROD.includes('p_version'),
      'la edición de producción dejó de mandar p_version: el RPC no puede detectar choques');
  });

  test('la carga se compara campo por campo, incluido el detalle', () => {
    assert.ok(PROD.includes('camposCambiadosProd'),
      'se perdió la comparación por campo: dos ediciones de campos distintos volverían a chocar');
  });
});

describe('La auditoría no muestra el contador de versión', () => {
  const AUD = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'auditoria.js'), 'utf8');

  test('version está en la lista de campos internos', () => {
    const fabrica = new Function(`${AUD}; return { esCampoInterno, diffCamposAuditoria };`);
    const { esCampoInterno, diffCamposAuditoria } = fabrica();

    assert.strictEqual(esCampoInterno('version'), true);
    assert.strictEqual(esCampoInterno('id'), true);
    assert.strictEqual(esCampoInterno('telefono'), false);

    // Un guardado real sube la versión: eso no tiene que aparecer como un cambio.
    const cambios = diffCamposAuditoria(
      { id: 1, version: 3, telefono: '111' },
      { id: 1, version: 4, telefono: '222' }
    );
    assert.deepStrictEqual(cambios.map(c => c.campo), ['telefono'],
      'la auditoría muestra el contador de versión y llena el historial de ruido');
  });
});
