/* Verifica la sintaxis de todo el JS del proyecto.
 * `node --check` acepta un archivo por vez, así que acá los recorremos.
 * Es el mismo chequeo que se hacía a mano antes de cada commit. */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const IGNORAR = new Set(['.git', 'node_modules', 'tests', '.claude']);

function archivosJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (IGNORAR.has(e.name)) return [];
    const completo = path.join(dir, e.name);
    if (e.isDirectory()) return archivosJs(completo);
    return e.name.endsWith('.js') ? [completo] : [];
  });
}

let fallos = 0;
for (const archivo of archivosJs(RAIZ)) {
  try {
    execFileSync(process.execPath, ['--check', archivo], { stdio: 'pipe' });
  } catch (e) {
    fallos++;
    console.error(`✗ ${path.relative(RAIZ, archivo)}`);
    console.error(String(e.stderr).trim());
  }
}

if (fallos) {
  console.error(`\n${fallos} archivo(s) con errores de sintaxis.`);
  process.exit(1);
}
console.log('Sintaxis OK en todos los archivos.');
