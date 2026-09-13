/* ============== TESTS DE PERMISOS ==============
 *
 * Correr con:   node --test tests/
 *
 * Qué cubre: las 6 funciones de js/permissions.js contra los 5 roles, con dupla
 * propia y ajena, más los casos de borde de tieneDupla().
 *
 * Qué NO cubre, y conviene tenerlo presente: esto verifica las reglas del
 * FRONTEND, que es lo que decide si un botón se muestra o no. La barrera real
 * es la RLS de Postgres. El valor de estos tests es que el navegador y la base
 * no se contradigan: si el front muestra un botón que la RLS después rechaza,
 * el usuario ve un error incomprensible; si lo esconde de más, reportan un bug
 * que no existe.
 *
 * Los nombres de dupla acá son inventados a propósito (DUPLA_A / DUPLA_B): este
 * repositorio es público y no van nombres reales de ejecutivos ni de productores.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

/* ---------- Cargador ----------
 * js/permissions.js es un script clásico: declara funciones sueltas y lee la
 * global `perfil`. No lo tocamos para poder testearlo (no queremos meterle un
 * module.exports a un archivo que en el navegador corre sin módulos). En vez de
 * eso lo evaluamos acá adentro, con `perfil` como variable de closure que
 * podemos ir cambiando desde los tests.
 */
function cargarPermisos() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'permissions.js'),
    'utf8'
  );
  const fabrica = new Function(`
    let perfil = null;
    let MODO_DEMO = false;
    ${src}
    return {
      setPerfil: (p) => { perfil = p; },
      setDemo: (v) => { MODO_DEMO = v; },
      tieneDupla,
      puedeEditarDatosPas,
      puedeCargarProduccion,
      puedeCrearPas,
      puedeEliminarPas,
      puedeEditarMetas
    };
  `);
  return fabrica();
}

const P = cargarPermisos();

/* Varias funciones devuelven `null` en vez de `false` (por el patrón
 * `p && tieneDupla(...)` y `perfil && (...)`). En la app da igual, porque se usan
 * como condición. Los tests preguntan por "permite / no permite", no por el tipo
 * exacto — el tipo se verifica aparte, más abajo, para dejarlo documentado. */
const permite = (v) => v === true;
const bloquea = (v) => !v;

const ROLES = ['admin', 'editor', 'carga_pas', 'jefe', 'viewer'];

const conRol = (rol, duplas = ['DUPLA_A']) =>
  P.setPerfil({ rol, dupla_asignada: duplas });

const PAS_PROPIO = { EJECUTIVO: 'DUPLA_A' };
const PAS_AJENO  = { EJECUTIVO: 'DUPLA_B' };

/* ============================================================
 * 1. La regla viva del CLAUDE.md
 * "Todo permiso que se le dé a un rol, se le da también a admin".
 * Hoy eso vive en un comentario. Acá pasa a ser algo que no se puede romper
 * sin que salte: el día que se agregue una séptima función y se olviden del
 * admin, este test falla.
 * ============================================================ */
describe('Invariante: admin puede todo', () => {
  test('las 6 funciones devuelven true para admin', () => {
    conRol('admin');
    assert.ok(permite(P.puedeEditarDatosPas(PAS_PROPIO)), 'editar datos (dupla propia)');
    assert.ok(permite(P.puedeEditarDatosPas(PAS_AJENO)),  'editar datos (dupla ajena)');
    assert.ok(permite(P.puedeCargarProduccion(PAS_AJENO)), 'cargar producción');
    assert.ok(permite(P.puedeCrearPas()),                  'crear PAS');
    assert.ok(permite(P.puedeEliminarPas(PAS_AJENO)),      'eliminar PAS');
    assert.ok(permite(P.puedeEditarMetas()),               'editar metas');
  });

  test('admin no depende de tener la dupla asignada', () => {
    P.setPerfil({ rol: 'admin', dupla_asignada: [] });
    assert.ok(permite(P.puedeEditarDatosPas(PAS_AJENO)));
    assert.ok(permite(P.puedeCargarProduccion(PAS_AJENO)));
    assert.ok(permite(P.puedeEliminarPas(PAS_AJENO)));
  });

  test('admin funciona incluso con dupla_asignada nula', () => {
    P.setPerfil({ rol: 'admin', dupla_asignada: null });
    assert.ok(permite(P.puedeEditarDatosPas(PAS_AJENO)));
  });
});

/* ============================================================
 * 2. Editar datos del PAS
 * admin siempre; editor y carga_pas solo en su dupla; jefe y viewer nunca.
 * ============================================================ */
describe('puedeEditarDatosPas', () => {
  const esperado = {
    propia: { admin: true, editor: true,  carga_pas: true,  jefe: false, viewer: false },
    ajena:  { admin: true, editor: false, carga_pas: false, jefe: false, viewer: false }
  };

  for (const rol of ROLES) {
    test(`${rol} · dupla propia → ${esperado.propia[rol] ? 'permite' : 'bloquea'}`, () => {
      conRol(rol);
      const r = P.puedeEditarDatosPas(PAS_PROPIO);
      assert.ok(esperado.propia[rol] ? permite(r) : bloquea(r));
    });

    test(`${rol} · dupla ajena → ${esperado.ajena[rol] ? 'permite' : 'bloquea'}`, () => {
      conRol(rol);
      const r = P.puedeEditarDatosPas(PAS_AJENO);
      assert.ok(esperado.ajena[rol] ? permite(r) : bloquea(r));
    });
  }
});

/* ============================================================
 * 3. Cargar producción — la regla de negocio más importante del archivo
 *
 * carga_pas ("Comercial") NO toca producción, ni siquiera en su propia dupla.
 * Eso hoy se sostiene por una sola línea: que puedeCargarProduccion() no
 * mencione 'carga_pas'. Si dentro de seis meses alguien agrega
 * `|| perfil.rol === 'carga_pas'` por comodidad, no explota nada: simplemente
 * un comercial empieza a poder cargar pólizas y nadie se entera.
 * ============================================================ */
describe('puedeCargarProduccion', () => {
  const esperado = {
    propia: { admin: true, editor: true,  carga_pas: false, jefe: false, viewer: false },
    ajena:  { admin: true, editor: false, carga_pas: false, jefe: false, viewer: false }
  };

  for (const rol of ROLES) {
    test(`${rol} · dupla propia → ${esperado.propia[rol] ? 'permite' : 'bloquea'}`, () => {
      conRol(rol);
      const r = P.puedeCargarProduccion(PAS_PROPIO);
      assert.ok(esperado.propia[rol] ? permite(r) : bloquea(r));
    });

    test(`${rol} · dupla ajena → ${esperado.ajena[rol] ? 'permite' : 'bloquea'}`, () => {
      conRol(rol);
      const r = P.puedeCargarProduccion(PAS_AJENO);
      assert.ok(esperado.ajena[rol] ? permite(r) : bloquea(r));
    });
  }

  test('carga_pas no carga producción ni con todas las duplas asignadas', () => {
    P.setPerfil({ rol: 'carga_pas', dupla_asignada: ['DUPLA_A', 'DUPLA_B'] });
    assert.ok(bloquea(P.puedeCargarProduccion(PAS_PROPIO)));
    assert.ok(bloquea(P.puedeCargarProduccion(PAS_AJENO)));
  });
});

/* ============================================================
 * 4. Eliminar PAS
 * El RPC eliminar_pas (server-side) deja borrar a admin siempre, y a editor
 * y carga_pas en su propia dupla si el PAS no tiene producción cargada
 * (sql/2026-09-11-eliminar-pas-carga-pas.sql, corrido).
 * ============================================================ */
describe('puedeEliminarPas', () => {
  const esperado = {
    propia: { admin: true, editor: true,  carga_pas: true,  jefe: false, viewer: false },
    ajena:  { admin: true, editor: false, carga_pas: false, jefe: false, viewer: false }
  };

  for (const rol of ROLES) {
    test(`${rol} · dupla propia → ${esperado.propia[rol] ? 'permite' : 'bloquea'}`, () => {
      conRol(rol);
      const r = P.puedeEliminarPas(PAS_PROPIO);
      assert.ok(esperado.propia[rol] ? permite(r) : bloquea(r));
    });

    test(`${rol} · dupla ajena → ${esperado.ajena[rol] ? 'permite' : 'bloquea'}`, () => {
      conRol(rol);
      const r = P.puedeEliminarPas(PAS_AJENO);
      assert.ok(esperado.ajena[rol] ? permite(r) : bloquea(r));
    });
  }
});

/* ============================================================
 * 5. Crear PAS — no depende de la dupla, solo del rol
 * ============================================================ */
describe('puedeCrearPas', () => {
  const esperado = { admin: true, editor: true, carga_pas: true, jefe: false, viewer: false };

  for (const rol of ROLES) {
    test(`${rol} → ${esperado[rol] ? 'permite' : 'bloquea'}`, () => {
      conRol(rol);
      const r = P.puedeCrearPas();
      assert.ok(esperado[rol] ? permite(r) : bloquea(r));
    });
  }
});

/* ============================================================
 * 6. Editar metas — admin y jefe fijan objetivos de otros.
 * Quedan afuera editor y carga_pas a propósito: no se fijan su propia meta.
 * ============================================================ */
describe('puedeEditarMetas', () => {
  const esperado = { admin: true, editor: false, carga_pas: false, jefe: true, viewer: false };

  for (const rol of ROLES) {
    test(`${rol} → ${esperado[rol] ? 'permite' : 'bloquea'}`, () => {
      conRol(rol);
      const r = P.puedeEditarMetas();
      assert.ok(esperado[rol] ? permite(r) : bloquea(r));
    });
  }
});

/* ============================================================
 * 7. Sin sesión: nada, nunca
 * ============================================================ */
describe('Sin perfil cargado', () => {
  test('las 6 funciones bloquean', () => {
    P.setPerfil(null);
    assert.ok(bloquea(P.puedeEditarDatosPas(PAS_PROPIO)));
    assert.ok(bloquea(P.puedeCargarProduccion(PAS_PROPIO)));
    assert.ok(bloquea(P.puedeCrearPas()));
    assert.ok(bloquea(P.puedeEliminarPas(PAS_PROPIO)));
    assert.ok(bloquea(P.puedeEditarMetas()));
    assert.ok(bloquea(P.tieneDupla('DUPLA_A')));
  });
});

/* ============================================================
 * 8. tieneDupla — casos de borde
 *
 * Acá está la parte interesante, porque la pertenencia a una dupla se resuelve
 * con un includes() sobre un array de strings. Todo lo que sea distinto de una
 * coincidencia exacta devuelve false EN SILENCIO: no hay error, simplemente el
 * usuario deja de ver el botón y nadie entiende por qué.
 * ============================================================ */
describe('tieneDupla · casos de borde', () => {
  test('dupla_asignada nula o ausente no rompe, bloquea', () => {
    P.setPerfil({ rol: 'editor', dupla_asignada: null });
    assert.ok(bloquea(P.tieneDupla('DUPLA_A')));

    P.setPerfil({ rol: 'editor' });
    assert.ok(bloquea(P.tieneDupla('DUPLA_A')));
  });

  test('array vacío bloquea', () => {
    P.setPerfil({ rol: 'editor', dupla_asignada: [] });
    assert.ok(bloquea(P.tieneDupla('DUPLA_A')));
  });

  test('un usuario con varias duplas pertenece a todas', () => {
    P.setPerfil({ rol: 'editor', dupla_asignada: ['DUPLA_A', 'DUPLA_B', 'DUPLA_C'] });
    assert.ok(permite(P.tieneDupla('DUPLA_A')));
    assert.ok(permite(P.tieneDupla('DUPLA_B')));
    assert.ok(permite(P.tieneDupla('DUPLA_C')));
    assert.ok(bloquea(P.tieneDupla('DUPLA_D')));
  });

  test('un PAS sin EJECUTIVO bloquea en vez de romper', () => {
    conRol('editor');
    assert.ok(bloquea(P.puedeEditarDatosPas({})));
    assert.ok(bloquea(P.puedeEditarDatosPas({ EJECUTIVO: null })));
  });

  test('p nulo o indefinido bloquea en vez de romper', () => {
    conRol('editor');
    assert.ok(bloquea(P.puedeEditarDatosPas(null)));
    assert.ok(bloquea(P.puedeEditarDatosPas(undefined)));
    assert.ok(bloquea(P.puedeCargarProduccion(null)));
    assert.ok(bloquea(P.puedeEliminarPas(null)));
  });

  /* Estos dos NO son un bug: documentan que la comparación es exacta. Están acá
   * porque son la causa más probable de un "a mí no me deja y debería dejarme"
   * durante el piloto — un espacio de más al cargar la dupla y el usuario queda
   * afuera sin ningún mensaje. Si alguna vez se decide normalizar (trim +
   * mayúsculas), estos dos tests son los que hay que dar vuelta. */
  test('la comparación distingue mayúsculas de minúsculas', () => {
    P.setPerfil({ rol: 'editor', dupla_asignada: ['DUPLA_A'] });
    assert.ok(bloquea(P.tieneDupla('dupla_a')));
  });

  test('los espacios sobrantes no se ignoran', () => {
    P.setPerfil({ rol: 'editor', dupla_asignada: ['DUPLA_A'] });
    assert.ok(bloquea(P.tieneDupla('DUPLA_A ')));
    assert.ok(bloquea(P.tieneDupla(' DUPLA_A')));
  });

  /* 'TODOS' está cargado como valor real en el catálogo de ejecutivos y además
   * se usa como centinela de "sin filtro" en los desplegables (ver opts() en
   * format.js). Acá se comporta como cualquier otro string: no hay ningún
   * tratamiento especial. Este test deja constancia de eso — si alguna vez se
   * resuelve la colisión del catálogo, revisar si esto sigue siendo lo deseado. */
  test('TODOS no recibe ningún tratamiento especial', () => {
    P.setPerfil({ rol: 'editor', dupla_asignada: ['TODOS'] });
    assert.ok(permite(P.tieneDupla('TODOS')));
    assert.ok(bloquea(P.tieneDupla('DUPLA_A')));

    P.setPerfil({ rol: 'editor', dupla_asignada: ['DUPLA_A'] });
    assert.ok(bloquea(P.tieneDupla('TODOS')));
  });
});

/* ============================================================
 * 9. Contrato de retorno
 *
 * Varias funciones devuelven null en vez de false. En la app no molesta porque
 * siempre se usan como condición, pero queda documentado acá: si alguien alguna
 * vez compara con === false, va a fallar y este test explica por qué.
 * ============================================================ */
describe('Contrato de retorno', () => {
  test('devuelven valores falsy, no necesariamente false', () => {
    conRol('editor');
    assert.strictEqual(P.puedeEditarDatosPas(null), null);

    P.setPerfil(null);
    assert.strictEqual(P.puedeCrearPas(), null);

    // puedeEditarMetas sí normaliza con !! y devuelve booleano real
    assert.strictEqual(P.puedeEditarMetas(), false);
  });
});
