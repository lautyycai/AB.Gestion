const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const fmt = n => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0);
// Convierte una fecha en formato YYYY-MM-DD (como la guarda la base) a DD/MM/AAAA para mostrar en pantalla
const fmtFecha = iso => {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
};
// Convierte un timestamp (creado_en de un reporte) a DD/MM/AAAA HH:MM para mostrar en pantalla
const fmtFechaHora = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
};
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const MENSAJE_PASSWORD_INVALIDA = 'La contraseña tiene que tener al menos 8 caracteres, con una mayúscula, una minúscula y un número.';

function opts(arr, val) { return '<option value="TODOS">TODOS</option>' + arr.filter(Boolean).map(x => '<option value="' + esc(x) + '" ' + (x === val ? 'selected' : '') + '>' + esc(x) + '</option>').join('') }
// Convierte un trimestre en un número ordenable cronológicamente (año*10 + numero de trimestre).
// Tolera las formas en que se fue tipeando el valor en el catálogo: "T1 2026", "T1-2026",
// "T12026", "1T 2026", "2026 T1". También la palabra completa, número y año en cualquier orden:
// "1er trimestre 2026", "TRIMESTRE 1 2026", "TRIMESTRE 2026 1". Antes solo entraban las formas
// abreviadas: cualquier otra devolvía 0, se ordenaba antes que todo y el "último trimestre
// cargado" quedaba mal sin avisar.
function trimestreOrden(t) {
  const s = String(t == null ? '' : t).toUpperCase();
  let m = s.match(/T\s*[-\/]?\s*(\d)\D*(\d{4})/);
  if (!m) m = s.match(/(\d)\s*T\D*(\d{4})/);
  if (m) return parseInt(m[2], 10) * 10 + parseInt(m[1], 10);
  const invertido = s.match(/(\d{4})\D*T\s*(\d)/);
  if (invertido) return parseInt(invertido[1], 10) * 10 + parseInt(invertido[2], 10);
  // Palabra completa, en cualquiera de los tres órdenes en que se fue tipeando: el número antes
  // de "TRIMESTRE" ("1ER TRIMESTRE 2026"), después ("TRIMESTRE 1 2026"), o el año antes que el
  // número ("TRIMESTRE 2026 1") -- este último no entraba con el patrón anterior, que asumía que
  // el primer número después de "TRIMESTRE" es siempre el número de trimestre, nunca el año.
  let p = s.match(/(\d)[A-ZÑ]*\s*TRIMESTRE\D*(\d{4})/);
  if (p) return parseInt(p[2], 10) * 10 + parseInt(p[1], 10);
  p = s.match(/TRIMESTRE\D*?(\d)\D*(\d{4})/);
  if (p) return parseInt(p[2], 10) * 10 + parseInt(p[1], 10);
  p = s.match(/TRIMESTRE\D*?(\d{4})\D*(\d)\b/);
  if (p) return parseInt(p[1], 10) * 10 + parseInt(p[2], 10);
  return 0;
}
// Mismo formato que trimestreOrden(), pero para el trimestre calendario en curso
function trimestreOrdenActual() {
  const hoy = new Date();
  return hoy.getFullYear() * 10 + (Math.floor(hoy.getMonth() / 3) + 1);
}

// Dado el texto libre del campo "compañías con las que opera", separa qué compañías del catálogo
// están nombradas ahí (encontradas) de lo que sobra sin matchear (restante) -- típicamente
// compañías que el PAS ya tenía cargadas pero que hoy están inactivas en el catálogo. Antes esto se
// resolvía partiendo el texto por [,-/], lo que rompía cualquier compañía que llevara un guion o una
// barra en el nombre: al reabrir el formulario del PAS su casilla quedaba destildada y se perdía del
// registro al guardar. Acá se busca cada nombre del catálogo como palabra completa, de más largo a
// más corto, tapando lo ya encontrado para que un nombre corto no matchee adentro de uno largo ("HDI"
// adentro de "HDI-SEGUROS").
function separarCompaniasDelTexto(texto, catalogo) {
  const original = String(texto == null ? '' : texto).toUpperCase();
  if (!original.trim()) return { encontradas: [], restante: '' };
  let restante = ' ' + original + ' ';
  const encontradas = new Set();
  const porLargo = (catalogo || []).slice().sort((a, b) => String(b).length - String(a).length);
  porLargo.forEach(c => {
    const nombre = String(c).trim().toUpperCase();
    if (!nombre) return;
    const patron = new RegExp('(^|[^A-Z0-9ÁÉÍÓÚÜÑ])' + nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Z0-9ÁÉÍÓÚÜÑ]|$)');
    if (!patron.test(restante)) return;
    encontradas.add(c);
    restante = restante.replace(patron, (todo, antes, despues) => antes + ' '.repeat(nombre.length) + despues);
  });
  // Separadores sueltos: lo que separaba una compañía encontrada de una que quedó en "restante" (una
  // coma, un guion, una barra) no era parte de ninguna de las dos, y sin este recorte por fragmento
  // quedaba pegado al principio o al final ("SANCOR, / RIVADAVIA" en vez de "SANCOR, RIVADAVIA").
  const restanteLimpio = restante.replace(/\s+/g, ' ').trim().split(',')
    .map(s => s.trim().replace(/^[-\/,]+\s*/, '').replace(/\s*[-\/,]+$/, '').trim())
    .filter(Boolean).join(', ');
  return {
    encontradas: (catalogo || []).filter(c => encontradas.has(c)),
    restante: restanteLimpio,
  };
}

function companiasDelTexto(texto, catalogo) {
  return separarCompaniasDelTexto(texto, catalogo).encontradas;
}

// Representación canónica de "compañías con las que opera": las del catálogo activo, en el mismo
// orden alfabético en que las lee el checklist del formulario (leerFormPAS() las junta en ese orden,
// via querySelectorAll sobre las casillas ya ordenadas), seguidas de lo que no matchea ninguna
// compañía activa. Sin pasar por acá, comparar el valor crudo de la base contra lo que arma el
// formulario reporta un cambio en este campo aunque nadie lo haya tocado -- ver camposCambiados()
// en intentarGuardarPAS() (js/services/productores.js), que necesita los dos lados en la misma forma.
function companiasCanonico(texto, catalogo) {
  const { encontradas, restante } = separarCompaniasDelTexto(texto, catalogo);
  const ordenadas = encontradas.slice().sort((a, b) => a.localeCompare(b, 'es'));
  return [...ordenadas, ...(restante ? [restante] : [])].join(', ');
}

// Lo que queda del texto libre después de sacar las compañías del catálogo activo. El checklist de
// "Compañías con las que opera" solo puede mostrar (y dejar tildar) el catálogo activo -- así que sin
// esto, una compañía desactivada del catálogo desaparecía en silencio del registro de cada PAS que se
// editara después, apenas alguien tocara cualquier otra casilla del mismo campo.
function companiasSinMatchear(texto, catalogo) {
  return separarCompaniasDelTexto(texto, catalogo).restante;
}
