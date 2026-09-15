/* ============== CONFIGURACIÓN SUPABASE ============== */
const SUPABASE_URL = "https://mgcrhcmpmqukclvjztmx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_IN_P4bukh-s5Zf9omiolkQ_bkepmtHd";
/* La sesión se guarda en sessionStorage, NO en localStorage (que es el valor por
 * defecto de Supabase). La diferencia importa:
 *
 *   localStorage   → la sesión sobrevive a cerrar el navegador. En una máquina
 *                    compartida, el siguiente que la abra entra con el usuario
 *                    del anterior, y los tokens se renuevan solos por semanas.
 *   sessionStorage → recargar la página o navegar NO desloguea, pero cerrar el
 *                    navegador sí.
 *
 * Con datos personales de casi mil productores adentro y equipos compartidos en
 * la oficina, el segundo es el comportamiento que corresponde. */
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,   // sobrevive a recargar la página, dentro de la misma pestaña
    autoRefreshToken: true, // renueva el token mientras la pestaña siga abierta
  },
});

/* Limpieza de tokens viejos: hasta este cambio la sesión vivía en localStorage,
 * y esos tokens siguen siendo válidos aunque ya nadie los lea. Quedarían dando
 * vueltas en cada máquina donde alguien usó la app. Se borran una sola vez. */
try {
  Object.keys(localStorage)
    .filter(k => k.startsWith('sb-') && k.includes('-auth-token'))
    .forEach(k => localStorage.removeItem(k));
} catch (e) {
  // Si el navegador no deja tocar localStorage, no es motivo para romper la app.
}
const URL_CREAR_USUARIO = "https://worker.lautibagnato.workers.dev";

// Supabase corta select('*') en 1000 filas por defecto: esto pagina hasta traer todo.
// El .order('id') NO es cosmético: sin un orden explícito Postgres no garantiza que dos consultas
// devuelvan las filas en el mismo orden, así que al pasar de 1000 filas una página podía repetir
// filas de la anterior o saltearse otras, y los totales salían mal sin ningún error visible.
const PAGE_SIZE = 1000;
async function fetchAllRows(tabla) {
  let filas = [];
  let desde = 0;
  let ordenar = true; // se apaga si la tabla no tiene columna id (ver más abajo)
  while (true) {
    let consulta = supa.from(tabla).select('*');
    if (ordenar) consulta = consulta.order('id', { ascending: true });
    const { data, error } = await consulta.range(desde, desde + PAGE_SIZE - 1);
    if (error) {
      // Si la tabla no tiene columna "id", Postgres devuelve 42703 (undefined_column).
      // Reintentamos sin ordenar en vez de dejar la app sin arrancar: se pierde la garantía
      // de paginación estable en esa tabla, pero sigue funcionando como funcionaba antes.
      if (ordenar && (error.code === '42703' || /column .*id.* does not exist/i.test(error.message || ''))) {
        console.warn(`fetchAllRows: "${tabla}" no tiene columna id, se pagina sin orden estable.`);
        ordenar = false;
        continue;
      }
      return { data: null, error };
    }
    filas = filas.concat(data || []);
    // Cortamos SOLO por página vacía, no por "incompleta": si el servidor recortara max-rows a un
    // valor menor a PAGE_SIZE, una página siempre daría length < PAGE_SIZE aunque quedaran más filas
    // por traer, y esto truncaría la base entera en silencio (mismo bug ya corregido en el Worker,
    // ver worker/crear-usuario.js). Con página vacía alcanza para saber que no hay más.
    if (!data || data.length === 0) break;
    desde += PAGE_SIZE;
    if (desde > 1000000) break; // cinturón de seguridad, no queremos un loop infinito
  }
  return { data: filas, error: null };
}
