/* ============== TESTS: EL MODO DEMO NO ESCRIBE ==============
 *
 * Correr con:   npm test
 *
 * Por qué existe este archivo:
 *
 * En modo demostración los datos que hay en memoria están enmascarados, y los
 * formularios de edición se prellenan con eso. Si una función de escritura no
 * tiene su guarda, apretar "Guardar" durante una demostración escribe el
 * nombre, el teléfono y el mail inventados ENCIMA de un registro real.
 *
 * Ya pasó de tener el modo demo publicado sin este bloqueo. Estos tests están
 * para que no vuelva a pasar: si alguien agrega una función que escribe en la
 * base y se olvida de la guarda, acá falla.
 *
 * Es una verificación sobre el texto del código, no sobre su ejecución: los
 * servicios dependen del cliente de Supabase y del DOM, que no existen fuera
 * del navegador. Cruda, pero atrapa exactamente el olvido que importa.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'js', 'services');
const DIR_VIEWS = path.join(__dirname, '..', 'js', 'views');

/* Las funciones que escriben, y con qué guarda tiene que cortar cada una.
 * - demoBloqueo         → devuelve { data, error } como Supabase
 * - demoBloqueoWorker   → devuelve { resp, result } como el Worker
 * - demoAvisoFormulario → escribe el aviso en el DOM y no devuelve nada */
const ESPERADO = {
  'productores.js': {
    guardarPAS: 'demoAvisoFormulario',
    eliminarPAS: 'demoBloqueo',
  },
  'produccion.js': {
    guardarEdicionProduccion: 'demoAvisoFormulario',
    guardarProduccion: 'demoAvisoFormulario',
    eliminarProduccion: 'demoBloqueo',
    eliminarProduccionesPas: 'demoBloqueo',
  },
  'metas.js': {
    guardarMeta: 'demoBloqueo',
    eliminarMeta: 'demoBloqueo',
  },
  'reportes.js': {
    crearReporte: 'demoBloqueo',
    eliminarReporte: 'demoBloqueo',
    actualizarEstadoReporte: 'demoBloqueo',
    actualizarRespuestaReporte: 'demoBloqueo',
  },
  'usuarios.js': {
    crearUsuario: 'demoBloqueoWorker',
    eliminarUsuario: 'demoBloqueoWorker',
    editarCredencialesUsuario: 'demoBloqueoWorker',
    actualizarUsuario: 'demoBloqueo',
  },
};

/* Devuelve el cuerpo de una función suelta (`async function nombre(...) { ... }`)
 * contando llaves. Alcanza para estos archivos, donde las funciones están todas
 * en el nivel superior. */
function cuerpoDe(src, nombre) {
  const inicio = src.search(new RegExp(`(async\\s+)?function\\s+${nombre}\\s*\\(`));
  if (inicio === -1) return null;

  // Hay que saltear la lista de parámetros antes de buscar la llave del cuerpo:
  // varias de estas funciones desestructuran (`guardarMeta({ dupla, ... })`) y
  // esa llave no es la que abre la función.
  const parenAbre = src.indexOf('(', inicio);
  if (parenAbre === -1) return null;
  let parens = 0, parenCierra = -1;
  for (let i = parenAbre; i < src.length; i++) {
    if (src[i] === '(') parens++;
    else if (src[i] === ')') { parens--; if (parens === 0) { parenCierra = i; break; } }
  }
  if (parenCierra === -1) return null;

  const abre = src.indexOf('{', parenCierra);
  if (abre === -1) return null;
  let nivel = 0;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === '{') nivel++;
    else if (src[i] === '}') {
      nivel--;
      if (nivel === 0) return src.slice(abre, i + 1);
    }
  }
  return null;
}

describe('El modo demostración no escribe en la base', () => {
  for (const [archivo, funciones] of Object.entries(ESPERADO)) {
    const src = fs.readFileSync(path.join(DIR, archivo), 'utf8');

    for (const [fn, guarda] of Object.entries(funciones)) {
      test(`${archivo} · ${fn} corta con ${guarda}()`, () => {
        const cuerpo = cuerpoDe(src, fn);
        assert.ok(cuerpo, `no se encontró la función ${fn} en ${archivo}`);
        assert.ok(
          cuerpo.includes(guarda + '('),
          `${fn} escribe en la base sin la guarda de modo demo. Agregale ${guarda}() al principio.`
        );
      });
    }
  }
});

/* Red de seguridad para lo que todavía no existe: si mañana alguien agrega una
 * escritura nueva en un servicio O EN UNA VISTA, este test la detecta aunque
 * no esté en la lista de arriba.
 *
 * Hasta el 2026-09-12 esto solo miraba js/services/ — y js/views/perfil.js
 * tenía tres llamadas a supa.rpc() puestas directo en la vista, salteando la
 * capa de servicios (y su guarda) por completo. El test estaba verde y el
 * agujero llevaba abierto desde que se escribió. Ahora recorre las dos
 * carpetas: los servicios son la lista fija de ESPERADO, las vistas se leen
 * dinámicamente (todo .js de la carpeta), porque ahí no hay una lista
 * cerrada de qué debería escribir -- cualquier archivo nuevo entra solo. */
describe('No hay escrituras sin guarda', () => {
  const ESCRITURA = /\.(insert|update|delete|upsert)\s*\(|\.rpc\s*\(\s*['"](eliminar|crear|guardar)/;

  function chequearArchivo(archivo, dir) {
    test(`${archivo} · toda función que escribe tiene su guarda`, () => {
      const src = fs.readFileSync(path.join(dir, archivo), 'utf8');
      const nombres = [...src.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g)].map(m => m[1]);

      for (const fn of nombres) {
        const cuerpo = cuerpoDe(src, fn) || '';
        if (!ESCRITURA.test(cuerpo)) continue; // no escribe, no aplica
        assert.ok(
          /demoBloqueo\(|demoBloqueoWorker\(|demoAvisoFormulario\(/.test(cuerpo),
          `${archivo} · ${fn}() escribe en la base y no tiene guarda de modo demo`
        );
      }
    });
  }

  for (const archivo of Object.keys(ESPERADO)) chequearArchivo(archivo, DIR);
  for (const archivo of fs.readdirSync(DIR_VIEWS).filter(f => f.endsWith('.js'))) chequearArchivo(archivo, DIR_VIEWS);
});
