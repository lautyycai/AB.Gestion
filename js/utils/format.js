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
// "T12026", "1T 2026", "2026 T1". Antes solo entraba la primera: cualquier otra devolvía 0, se
// ordenaba antes que todo y el "último trimestre cargado" quedaba mal sin avisar.
function trimestreOrden(t) {
  const s = String(t == null ? '' : t).toUpperCase();
  let m = s.match(/T\s*[-\/]?\s*(\d)\D*(\d{4})/);
  if (!m) m = s.match(/(\d)\s*T\D*(\d{4})/);
  if (m) return parseInt(m[2], 10) * 10 + parseInt(m[1], 10);
  const invertido = s.match(/(\d{4})\D*T\s*(\d)/);
  if (invertido) return parseInt(invertido[1], 10) * 10 + parseInt(invertido[2], 10);
  return 0;
}
// Mismo formato que trimestreOrden(), pero para el trimestre calendario en curso
function trimestreOrdenActual() {
  const hoy = new Date();
  return hoy.getFullYear() * 10 + (Math.floor(hoy.getMonth() / 3) + 1);
}

// Dado el texto libre del campo "compañías con las que opera", devuelve qué compañías del catálogo
// están nombradas ahí. Antes esto se resolvía partiendo el texto por [,-/], lo que rompía cualquier
// compañía que llevara un guion o una barra en el nombre: al reabrir el formulario del PAS su
// casilla quedaba destildada y se perdía del registro al guardar. Acá se busca cada nombre del
// catálogo como palabra completa, de más largo a más corto, tapando lo ya encontrado para que un
// nombre corto no matchee adentro de uno largo ("HDI" adentro de "HDI-SEGUROS").
function companiasDelTexto(texto, catalogo) {
  const original = String(texto == null ? '' : texto).toUpperCase();
  if (!original.trim()) return [];
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
  return (catalogo || []).filter(c => encontradas.has(c));
}
