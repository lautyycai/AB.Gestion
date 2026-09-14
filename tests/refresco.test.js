/* ============== TESTS: REFRESCO POR ACCIÓN ==============
 *
 * Correr con:   npm test
 *
 * Cubre las funciones de js/state.js que vuelven a consultar la base en el
 * momento de usar un dato, en vez de confiar en lo que se bajó al iniciar
 * sesión (ver el bloque "REFRESCO POR ACCIÓN" en ese archivo).
 *
 * El test más importante de todos es el de modo demostración. Durante una
 * presentación los datos en pantalla son nombres inventados; una fila traída de
 * la base viene con el nombre REAL del productor. Si el refresco se activara
 * ahí, abrir un formulario mostraría el padrón verdadero delante del cliente.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');

/* Cliente de Supabase de mentira. `responder` recibe { tabla, filtros } y
 * devuelve lo mismo que devolvería Supabase: { data, error }.
 *
 * El constructor tiene que poder esperarse de las dos formas que usa el código:
 * terminando en .maybeSingle() y esperando la consulta directamente. Por eso
 * expone then(): un objeto con then es "esperable" con await igual que una
 * promesa. */
function supaFalso(responder, registro) {
  return {
    from(tabla) {
      const consulta = { tabla, filtros: [] };
      if (registro) registro.push(consulta);
      const api = {
        select() { return api; },
        eq(col, val) { consulta.filtros.push([col, val]); return api; },
        in(col, vals) { consulta.filtros.push([col, vals]); return api; },
        maybeSingle() { return Promise.resolve(responder(consulta)); },
        then(ok, mal) { return Promise.resolve(responder(consulta)).then(ok, mal); },
      };
      return api;
    },
  };
}

/* Evalúa state.js con sus dependencias reemplazadas. D y state se declaran
 * adentro del archivo, así que no se pueden pasar como parámetros (serían una
 * redeclaración): se manejan con los accesores que devuelve la fábrica. */
function preparar({ supa, MODO_DEMO = false }) {
  const document = { getElementById: () => null };
  const consola = { warn() {}, error() {}, log() {} };
  const nombres = ['document', 'supa', 'MODO_DEMO', 'console'];
  const valores = [document, supa, MODO_DEMO, consola];
  const fabrica = new Function(...nombres, `${SRC}
    return {
      mapearProductor, mapearProduccion, agruparCompanias, columnasDesdeProductor,
      refrescarProductor, refrescarProduccion, refrescarCargasDelPas,
      ponerD: v => { D = v; }, verD: () => D,
    };`);
  return fabrica(...valores);
}

// Fila de productores tal como la devuelve la base.
const filaProductor = (extra = {}) => Object.assign({
  id: 9, version: 8, pas_nombre: 'Nombre Nuevo', organizacion: 'ORG', vinculante: '',
  ejecutivo: 'DUPLA_A', telefono: '555', mail: '', fecha_nacimiento: null,
  companias_opera: '', cantidad_polizas_vigentes: 0, observaciones: '',
  estado: 'ACTIVO', zona: 'NORTE', localidad_prov: '',
}, extra);

const filaProduccion = (extra = {}) => Object.assign({
  id: 1, pas_id: 9, version: 4, ramo: 'AUTOS', trimestre: '1T2026',
  ejecutivo: 'DUPLA_A', organizador: '', total_polizas: 10, ultima_fecha: '2026-09-01',
}, extra);

// El comentario de mapearProductor/columnasDesdeProductor en js/state.js dice "si tocás uno de los
// dos mapeos, tocá el otro: hay un test que los compara" — hasta ahora no lo había (columnasDesde-
// Productor solo se usaba de plomería en tests/concurrencia.test.js, ningún assert los comparaba).
// Sin esto, un campo que se agregue a uno de los dos mapeos y se olvide en el otro no se nota:
// camposCambiados() (js/services/productores.js) compara las claves de leerFormPAS() contra las de
// columnasDesdeProductor(fresco), así que ese campo nunca entraría a "suyos" y la detección de
// choque de la fusión de ediciones dejaría pisar el cambio del otro sin avisar.
describe('mapearProductor / columnasDesdeProductor: mapeos espejados', () => {

  test('columnasDesdeProductor(mapearProductor(fila)) reconstruye la fila original, campo a campo', () => {
    const api = preparar({ supa: supaFalso(() => ({ data: null, error: null })) });
    const fila = filaProductor();
    const idaYVuelta = api.columnasDesdeProductor(api.mapearProductor(fila));

    // cantidad_polizas_vigentes no es parte de columnasDesdeProductor a propósito: no es un campo
    // del formulario, se calcula aparte. id/version tampoco: no son columnas de "datos del PAS".
    const { id, version, cantidad_polizas_vigentes, ...columnasEditables } = fila;
    assert.deepStrictEqual(idaYVuelta, columnasEditables);
  });

});

describe('refrescarProductor', () => {

  test('reemplaza la fila en memoria con la de la base, versión incluida', async () => {
    const api = preparar({ supa: supaFalso(() => ({ data: filaProductor(), error: null })) });
    api.ponerD({
      producers: [{ _id: 9, _version: 3, PAS: 'Nombre Viejo', 'TELÉFONO': '111' }],
      production: [{ _id: 1, _pas_id: 9, PAS: 'Nombre Viejo' }],
    });

    const fresco = await api.refrescarProductor(9);

    assert.strictEqual(fresco._version, 8, 'no trajo la versión nueva: el guardado se seguiría rechazando');
    assert.strictEqual(api.verD().producers[0].PAS, 'Nombre Nuevo');
    assert.strictEqual(api.verD().producers[0]['TELÉFONO'], '555');
  });

  test('propaga el nombre nuevo a las cargas de ese PAS', async () => {
    // Las cargas guardan el nombre copiado. Sin propagarlo, la ficha muestra el
    // nombre nuevo en el título y el viejo en la tabla de abajo.
    const api = preparar({ supa: supaFalso(() => ({ data: filaProductor(), error: null })) });
    api.ponerD({
      producers: [{ _id: 9, _version: 3, PAS: 'Nombre Viejo' }],
      production: [{ _id: 1, _pas_id: 9, PAS: 'Nombre Viejo' }, { _id: 2, _pas_id: 7, PAS: 'Otro PAS' }],
    });

    await api.refrescarProductor(9);

    assert.strictEqual(api.verD().production[0].PAS, 'Nombre Nuevo');
    assert.strictEqual(api.verD().production[1].PAS, 'Otro PAS', 'tocó las cargas de otro productor');
  });

  test('si la fila ya no existe devuelve null y la saca de memoria', async () => {
    const api = preparar({ supa: supaFalso(() => ({ data: null, error: null })) });
    api.ponerD({
      producers: [{ _id: 9, _version: 3, PAS: 'Borrado' }, { _id: 7, PAS: 'Sigue' }],
      production: [{ _id: 1, _pas_id: 9 }, { _id: 2, _pas_id: 7 }],
    });

    const resultado = await api.refrescarProductor(9);

    assert.strictEqual(resultado, null, 'no distinguió "lo borraron" de "no se pudo consultar"');
    assert.deepStrictEqual(api.verD().producers.map(x => x._id), [7], 'dejó un productor fantasma navegable');
    assert.deepStrictEqual(api.verD().production.map(x => x._id), [2], 'dejó cargas huérfanas');
  });

  test('si la consulta falla devuelve undefined y no toca nada', async () => {
    // Que se caiga la red no puede dejar a nadie sin poder editar: se sigue con
    // lo que había, y el control de versión queda igual como última barrera.
    const api = preparar({ supa: supaFalso(() => ({ data: null, error: { message: 'sin red' } })) });
    api.ponerD({ producers: [{ _id: 9, _version: 3, PAS: 'Original' }], production: [] });

    const resultado = await api.refrescarProductor(9);

    assert.strictEqual(resultado, undefined);
    assert.strictEqual(api.verD().producers[0].PAS, 'Original', 'borró o pisó datos ante un error de red');
  });

  test('en modo demostración NO consulta la base', async () => {
    // Si consultara, el formulario se llenaría con el nombre real del productor
    // delante del cliente. Además la demostración no guarda nada, así que
    // refrescar no aportaría nada.
    const consultas = [];
    const api = preparar({
      supa: supaFalso(() => { throw new Error('consultó la base en modo demostración'); }, consultas),
      MODO_DEMO: true,
    });
    api.ponerD({ producers: [{ _id: 9, PAS: 'Nombre Inventado' }], production: [] });

    const resultado = await api.refrescarProductor(9);

    assert.strictEqual(resultado, undefined);
    assert.strictEqual(consultas.length, 0, 'tocó la base durante una demostración');
    assert.strictEqual(api.verD().producers[0].PAS, 'Nombre Inventado', 'reemplazó el nombre enmascarado');
  });
});

describe('refrescarProduccion', () => {

  test('rearma la carga con su detalle por compañía', async () => {
    const api = preparar({
      supa: supaFalso(c => c.tabla === 'producciones'
        ? { data: filaProduccion({ version: 9, total_polizas: 30 }), error: null }
        : { data: [{ produccion_id: 1, compania: 'ALFA', cantidad: 20 }, { produccion_id: 1, compania: 'BETA', cantidad: 10 }], error: null }),
    });
    api.ponerD({
      producers: [{ _id: 9, PAS: 'Un PAS' }],
      production: [{ _id: 1, _pas_id: 9, _version: 4, TOTAL: 10, COMPANIAS: { ALFA: 10 } }],
    });

    const fresca = await api.refrescarProduccion(1);

    assert.strictEqual(fresca._version, 9);
    assert.deepStrictEqual(fresca.COMPANIAS, { ALFA: 20, BETA: 10 });
    assert.strictEqual(fresca.PAS, 'Un PAS', 'perdió el nombre del PAS');
    assert.strictEqual(api.verD().production[0].TOTAL, 30, 'no actualizó la carga adentro de D');
  });

  test('si la carga ya no existe devuelve null y la saca de la tabla', async () => {
    const api = preparar({
      supa: supaFalso(c => c.tabla === 'producciones' ? { data: null, error: null } : { data: [], error: null }),
    });
    api.ponerD({ producers: [], production: [{ _id: 1, _pas_id: 9 }, { _id: 2, _pas_id: 9 }] });

    const resultado = await api.refrescarProduccion(1);

    assert.strictEqual(resultado, null);
    assert.deepStrictEqual(api.verD().production.map(x => x._id), [2]);
  });

  test('en modo demostración NO consulta la base', async () => {
    const consultas = [];
    const api = preparar({
      supa: supaFalso(() => { throw new Error('consultó la base en modo demostración'); }, consultas),
      MODO_DEMO: true,
    });
    api.ponerD({ producers: [], production: [{ _id: 1, _pas_id: 9, TOTAL: 1 }] });

    assert.strictEqual(await api.refrescarProduccion(1), undefined);
    assert.strictEqual(consultas.length, 0, 'tocó la base durante una demostración');
  });
});

describe('refrescarCargasDelPas', () => {

  test('reemplaza el bloque entero: refleja altas y bajas de otra persona', async () => {
    // En memoria hay una carga (la 1). En la base ya no está, y en cambio hay
    // otras dos que agregó otro usuario.
    const api = preparar({
      supa: supaFalso(c => c.tabla === 'producciones'
        ? { data: [filaProduccion({ id: 5 }), filaProduccion({ id: 6, ramo: 'VIDA' })], error: null }
        : { data: [{ produccion_id: 5, compania: 'ALFA', cantidad: 3 }], error: null }),
    });
    api.ponerD({
      producers: [{ _id: 9, PAS: 'Un PAS' }],
      production: [{ _id: 1, _pas_id: 9 }, { _id: 2, _pas_id: 7, PAS: 'Ajeno' }],
    });

    assert.strictEqual(await api.refrescarCargasDelPas(9), true);

    const ids = api.verD().production.map(x => x._id).sort();
    assert.deepStrictEqual(ids, [2, 5, 6], 'no reflejó las altas y bajas del otro usuario');
    assert.strictEqual(api.verD().production.find(x => x._id === 2).PAS, 'Ajeno', 'pisó las cargas de otro PAS');
    assert.deepStrictEqual(api.verD().production.find(x => x._id === 5).COMPANIAS, { ALFA: 3 });
    assert.deepStrictEqual(api.verD().production.find(x => x._id === 6).COMPANIAS, {}, 'una carga sin detalle tiene que quedar vacía, no undefined');
  });

  test('si falla el detalle por compañía no toca nada', async () => {
    // A medias sería peor que no hacerlo: las cargas quedarían mostrando cero
    // pólizas por compañía, que se lee igual que "no cargó nada".
    const api = preparar({
      supa: supaFalso(c => c.tabla === 'producciones'
        ? { data: [filaProduccion({ id: 5 })], error: null }
        : { data: null, error: { message: 'sin red' } }),
    });
    api.ponerD({ producers: [], production: [{ _id: 1, _pas_id: 9, TOTAL: 99 }] });

    assert.strictEqual(await api.refrescarCargasDelPas(9), false);
    assert.deepStrictEqual(api.verD().production.map(x => x._id), [1], 'dejó las cargas a medio actualizar');
  });

  test('en modo demostración NO consulta la base', async () => {
    const consultas = [];
    const api = preparar({
      supa: supaFalso(() => { throw new Error('consultó la base en modo demostración'); }, consultas),
      MODO_DEMO: true,
    });
    api.ponerD({ producers: [], production: [] });

    assert.strictEqual(await api.refrescarCargasDelPas(9), false);
    assert.strictEqual(consultas.length, 0, 'tocó la base durante una demostración');
  });
});

describe('Los formularios refrescan antes de dibujarse', () => {
  const VISTA_PAS = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'productores.js'), 'utf8');
  const VISTA_FICHA = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'ficha.js'), 'utf8');

  test('abrirFormPAS espera a refrescarProductor', () => {
    assert.match(VISTA_PAS, /async function abrirFormPAS/, 'dejó de ser async: no puede esperar el refresco');
    assert.match(VISTA_PAS, /await refrescarProductor\(/, 'el formulario de PAS volvió a llenarse con datos de memoria');
  });

  test('abrirFormEditarProduccion espera a refrescarProduccion', () => {
    assert.match(VISTA_FICHA, /async function abrirFormEditarProduccion/, 'dejó de ser async: no puede esperar el refresco');
    assert.match(VISTA_FICHA, /await refrescarProduccion\(/, 'el formulario de producción volvió a llenarse con datos de memoria');
  });
});
