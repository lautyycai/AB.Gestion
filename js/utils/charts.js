// Gráfico de líneas armado a mano en SVG (no hay librería de gráficos en el proyecto)
function svgLineChart(labels, values, color) {
  color = color || 'var(--accent)';
  const w = 560, h = 180, pad = 32;
  // Solo es "sin datos" si no hay trimestres. Un trimestre con producción real de 0 es un dato,
  // y antes se mostraba igual que si no existiera: se dibuja la línea plana en cero.
  if (!labels.length) {
    return '<div class="empty">Sin datos para mostrar</div>';
  }
  const max = Math.max(...values, 1);
  const stepX = labels.length > 1 ? (w - 2 * pad) / (labels.length - 1) : 0;
  const points = values.map((v, i) => ({
    x: pad + i * stepX,
    y: h - pad - (v / max) * (h - 2 * pad),
    v
  }));
  const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const circles = points.map(p =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${color}"></circle>` +
    `<text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" font-size="11" text-anchor="middle" fill="var(--ink)">${fmt(p.v)}</text>`
  ).join('');
  const xlabels = labels.map((l, i) =>
    `<text x="${(pad + i * stepX).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${esc(l)}</text>`
  ).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px" preserveAspectRatio="xMidYMid meet">
    <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="var(--line)"></line>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5"></path>
    ${circles}${xlabels}
  </svg>`;
}

const PALETA_COMPARAR = ['#1B8763', '#1B3A5C', '#2D6CA6', '#C1613F', '#5FA98A'];

// Rankings (top PAS, producción por ramo, desgloses que no son por compañía) no representan
// entidades distintas entre sí, así que en vez de un color por fila usan siempre --verde-marca
// con la intensidad decreciendo según la posición — el primero se ve pleno, el último más tenue.
function colorPorRanking(indice, total) {
  const opacidad = 1 - (indice / total) * 0.55;
  return `rgba(27, 135, 99, ${opacidad.toFixed(2)})`;
}

// Solo 3 marcas globales con color verificado. Para el resto, en vez de un hue libre por hash
// (que podía caer en cualquier tonalidad, incluida magenta/violeta), el hash elige un ÍNDICE
// dentro de una paleta fija y prolija — mismo nombre, siempre el mismo color de esos 10.
const PALETA_COMPANIAS = [
  '#1B8763', // verde marca
  '#1B3A5C', // azul marca
  '#2D6CA6', // azul medio
  '#5FA88D', // verde claro
  '#8AA8C4', // azul grisáceo claro
  '#3F6B52', // verde oscuro
  '#B08D57', // dorado apagado
  '#6D8CA6', // azul acero
  '#2F5D4F', // verde bosque
  '#9C7A4E', // ocre
];
const COLOR_COMPANIAS_OVERRIDE = {
  'ALLIANZ': '#003781',
  'HDI': '#E2001A',
  'BBVA': '#004481',
};
function colorParaCompania(nombre) {
  const key = String(nombre || '').trim().toUpperCase();
  if (COLOR_COMPANIAS_OVERRIDE[key]) return COLOR_COMPANIAS_OVERRIDE[key];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return PALETA_COMPANIAS[Math.abs(hash) % PALETA_COMPANIAS.length];
}

// Gráfico de barras horizontales apiladas: una fila por ramo, coloreada por compañía
function svgBarrasRamoCompania(ramoCompaniaMatrix, ramosOrdenados) {
  const filaAltura = 32, pad = 8, anchoBarra = 460, xBarra = 150, w = 700;
  const h = ramosOrdenados.length * filaAltura + pad * 2;
  if (!ramosOrdenados.length) return '<div class="empty">Sin datos para mostrar</div>';
  const maxRamoTotal = Math.max(...ramosOrdenados.map(r => Object.values(ramoCompaniaMatrix[r] || {}).reduce((s, v) => s + v, 0)), 1);

  const filas = ramosOrdenados.map((ramo, i) => {
    const y = pad + i * filaAltura;
    const companias = Object.entries(ramoCompaniaMatrix[ramo] || {}).sort((a, b) => b[1] - a[1]);
    const totalRamo = companias.reduce((s, [, v]) => s + v, 0);
    let x = xBarra;
    const segmentos = companias.map(([comp, valor]) => {
      const ancho = Math.max((valor / maxRamoTotal) * anchoBarra, 1);
      const seg = `<rect x="${x.toFixed(1)}" y="${y}" width="${ancho.toFixed(1)}" height="${filaAltura - 10}" fill="${colorParaCompania(comp)}" rx="2"><title>${esc(ramo)} · ${esc(comp)}: ${fmt(valor)}</title></rect>`;
      x += ancho;
      return seg;
    }).join('');
    const yTexto = y + (filaAltura - 10) / 2 + 4;
    return `<text x="0" y="${yTexto}" font-size="11" fill="var(--ink)">${esc(ramo)}</text>${segmentos}<text x="${(x + 6).toFixed(1)}" y="${yTexto}" font-size="11" fill="var(--muted)">${fmt(totalRamo)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px">${filas}</svg>`;
}

// Gráfico de líneas múltiples (una serie por elemento comparado) + leyenda, mismo criterio SVG a mano que svgLineChart
function svgMultiLineChart(labels, series) {
  const w = 680, h = 260, pad = 36;
  if (!labels.length || !series.length) {
    return '<div class="empty">Sin datos para mostrar</div>';
  }
  const max = Math.max(...series.flatMap(s => s.valores), 1);
  const stepX = labels.length > 1 ? (w - 2 * pad) / (labels.length - 1) : 0;
  const lineas = series.map((s, si) => {
    const color = s.color || PALETA_COMPARAR[si % PALETA_COMPARAR.length];
    const points = s.valores.map((v, i) => ({ x: pad + i * stepX, y: h - pad - (v / max) * (h - 2 * pad), v }));
    const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const circles = points.map(p =>
      `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${color}"><title>${esc(s.label)}: ${fmt(p.v)}</title></circle>`
    ).join('');
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5"></path>${circles}`;
  }).join('');
  const xlabels = labels.map((l, i) =>
    `<text x="${(pad + i * stepX).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${esc(l)}</text>`
  ).join('');
  const leyenda = series.map((s, si) =>
    `<span style="display:inline-flex;align-items:center;gap:6px;margin:4px 14px 4px 0;font-size:12px"><span style="width:10px;height:10px;border-radius:50%;background:${s.color || PALETA_COMPARAR[si % PALETA_COMPARAR.length]};display:inline-block"></span>${esc(s.label)}</span>`
  ).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px" preserveAspectRatio="xMidYMid meet">
    <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="var(--line)"></line>
    ${lineas}${xlabels}
  </svg><div style="margin-top:8px">${leyenda}</div>`;
}
