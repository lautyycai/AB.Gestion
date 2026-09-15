/* ============== TESTS: js/utils/format.js ==============
 *
 * Correr con:   npm test
 *
 * Cubre las dos funciones puras que ordenan/interpretan texto libre tipeado en
 * el catálogo: trimestreOrden() (usada para ordenar y para saber "cuál es el
 * trimestre en curso") y separarCompaniasDelTexto()/companiasCanonico()
 * (usadas por el checklist de "Compañías con las que opera" y por la
 * detección de choques de la fusión de ediciones simultáneas). Ninguna de las
 * dos toca el DOM ni la red, así que se prueban directo, sin mocks.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils', 'format.js'), 'utf8');
const fabrica = new Function(`${SRC}
  return { trimestreOrden, separarCompaniasDelTexto, companiasCanonico, companiasDelTexto, companiasSinMatchear };`);
const { trimestreOrden, separarCompaniasDelTexto, companiasCanonico, companiasDelTexto, companiasSinMatchear } = fabrica();

describe('trimestreOrden', () => {
  test('formas abreviadas, en cualquiera de los órdenes en que se tipearon', () => {
    assert.strictEqual(trimestreOrden('T1 2026'), 20261);
    assert.strictEqual(trimestreOrden('T1-2026'), 20261);
    assert.strictEqual(trimestreOrden('T12026'), 20261);
    assert.strictEqual(trimestreOrden('1T 2026'), 20261);
    assert.strictEqual(trimestreOrden('2026 T1'), 20261);
    assert.strictEqual(trimestreOrden('t4/2025'), 20254);
  });

  test('palabra completa, en cualquiera de los tres órdenes', () => {
    assert.strictEqual(trimestreOrden('1er trimestre 2026'), 20261, 'número antes de la palabra');
    assert.strictEqual(trimestreOrden('TRIMESTRE 1 2026'), 20261, 'número después de la palabra');
    assert.strictEqual(trimestreOrden('TRIMESTRE 2026 1'), 20261, 'año antes que el número: el caso que el comentario prometía y no funcionaba');
    assert.strictEqual(trimestreOrden('4to trimestre 2025'), 20254);
    assert.strictEqual(trimestreOrden('1ro trimestre 2026'), 20261);
  });

  test('ordena cronológicamente, no alfabéticamente', () => {
    const valores = ['T4 2025', 'T1 2026', 'T2 2025'];
    const ordenado = [...valores].sort((a, b) => trimestreOrden(a) - trimestreOrden(b));
    assert.deepStrictEqual(ordenado, ['T2 2025', 'T4 2025', 'T1 2026']);
  });

  test('valor irreconocible devuelve 0, no rompe', () => {
    assert.strictEqual(trimestreOrden('cualquier cosa'), 0);
    assert.strictEqual(trimestreOrden(''), 0);
    assert.strictEqual(trimestreOrden(null), 0);
  });
});

describe('separarCompaniasDelTexto / companiasDelTexto / companiasSinMatchear', () => {
  const catalogo = ['SANCOR', 'RIVADAVIA', 'HDI', 'HDI-SEGUROS'];

  test('separa por palabra completa, no rompe nombres con guion o barra', () => {
    // Antes de partir por [,-/] esto rompía cualquier compañía con guion o barra en el nombre.
    const r = separarCompaniasDelTexto('SANCOR, RIVADAVIA', catalogo);
    assert.deepStrictEqual(r.encontradas.sort(), ['RIVADAVIA', 'SANCOR']);
    assert.strictEqual(r.restante, '');
  });

  test('un nombre corto no matchea adentro de uno largo que lo contiene', () => {
    const encontradas = companiasDelTexto('HDI-SEGUROS', catalogo);
    assert.deepStrictEqual(encontradas, ['HDI-SEGUROS']);
  });

  test('lo que no matchea ninguna compañía del catálogo (activo) queda en "restante", sin separadores sueltos pegados', () => {
    const catalogoSinRivadavia = ['SANCOR'];
    assert.strictEqual(companiasSinMatchear('SANCOR / RIVADAVIA', catalogoSinRivadavia), 'RIVADAVIA');
    assert.strictEqual(companiasSinMatchear('SANCOR - RIVADAVIA', catalogoSinRivadavia), 'RIVADAVIA');
    assert.strictEqual(companiasSinMatchear('SANCOR, RIVADAVIA', catalogoSinRivadavia), 'RIVADAVIA');
  });

  test('texto vacío no rompe', () => {
    assert.deepStrictEqual(separarCompaniasDelTexto('', catalogo), { encontradas: [], restante: '' });
    assert.deepStrictEqual(separarCompaniasDelTexto(null, catalogo), { encontradas: [], restante: '' });
  });
});

describe('companiasCanonico', () => {
  // Es la forma que arma leerFormPAS() a partir del checklist: alfabético, más lo que sobra al final.
  // intentarGuardarPAS() (js/services/productores.js) necesita poder pasar el valor CRUDO de la base
  // por acá y obtener lo mismo que ve formPasOriginal, o cualquier PAS cuyo texto guardado no esté ya
  // en esta forma exacta reporta un choque de "companias_opera" aunque nadie lo haya tocado.
  const catalogo = ['SANCOR', 'RIVADAVIA', 'HDI'];

  test('reordena alfabéticamente sin importar el orden de tipeo', () => {
    assert.strictEqual(companiasCanonico('RIVADAVIA, SANCOR', catalogo), 'RIVADAVIA, SANCOR');
    assert.strictEqual(companiasCanonico('SANCOR, RIVADAVIA', catalogo), 'RIVADAVIA, SANCOR');
  });

  test('es estable: aplicarla dos veces da lo mismo que aplicarla una', () => {
    const una = companiasCanonico('rivadavia,   Sancor', catalogo);
    const dos = companiasCanonico(una, catalogo);
    assert.strictEqual(dos, una);
  });

  test('agrega al final lo que no matchea ninguna compañía activa', () => {
    const catalogoSinHDI = ['SANCOR', 'RIVADAVIA'];
    assert.strictEqual(companiasCanonico('SANCOR, HDI', catalogoSinHDI), 'SANCOR, HDI');
  });
});
