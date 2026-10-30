/* GestStock — graphiques SVG générés en chaînes de caractères (aucune dépendance). */

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function formatTick(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}

function niceMax(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.pow(10, Math.floor(Math.log10(value)));
  const fraction = value / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

function smoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  let path = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const midX = (prev.x + cur.x) / 2;
    path += ` C${midX},${prev.y} ${midX},${cur.y} ${cur.x},${cur.y}`;
  }
  return path;
}

/**
 * Graphique en aires à deux séries.
 * @param {{ labels: string[], series: { name: string, color: string, values: number[] }[], height?: number }} options
 */
export function areaChart({ labels, series, height = 260, width = 760 }) {
  const pad = { top: 18, right: 14, bottom: 34, left: 46 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const allValues = series.flatMap((s) => s.values);
  const max = niceMax(Math.max(1, ...allValues));
  const stepX = labels.length > 1 ? plotWidth / (labels.length - 1) : 0;
  const y = (value) => pad.top + plotHeight - (Math.max(0, value) / max) * plotHeight;
  const baseY = pad.top + plotHeight;

  const gridLines = [0, 1, 2, 3, 4]
    .map((index) => {
      const value = (max / 4) * index;
      const yPos = pad.top + plotHeight - (value / max) * plotHeight;
      return `<g>
        <line x1="${pad.left}" y1="${yPos}" x2="${width - pad.right}" y2="${yPos}" class="chart-grid" />
        <text x="${pad.left - 10}" y="${yPos + 4}" text-anchor="end" class="chart-axis">${formatTick(value)}</text>
      </g>`;
    })
    .join('');

  const xLabels = labels
    .map((label, index) => {
      const x = pad.left + stepX * index + (labels.length === 1 ? plotWidth / 2 : 0);
      return `<text x="${x}" y="${height - 12}" text-anchor="middle" class="chart-axis">${escapeXml(label)}</text>`;
    })
    .join('');

  const seriesMarkup = series
    .map((serie, serieIndex) => {
      const points = serie.values.map((value, index) => ({
        x: pad.left + stepX * index + (labels.length === 1 ? plotWidth / 2 : 0),
        y: y(value),
        value,
        label: labels[index],
      }));
      const line = smoothPath(points);
      const area = points.length
        ? `${line} L${points[points.length - 1].x},${baseY} L${points[0].x},${baseY} Z`
        : '';
      const dots = points
        .map(
          (point) =>
            `<circle cx="${point.x}" cy="${point.y}" r="3.2" fill="${serie.color}" stroke="var(--surface, #fff)" stroke-width="1.5"><title>${escapeXml(serie.name)} · ${escapeXml(point.label)} : ${formatTick(point.value)}</title></circle>`,
        )
        .join('');
      return `<g>
        <defs>
          <linearGradient id="area-grad-${serieIndex}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${serie.color}" stop-opacity="0.22" />
            <stop offset="100%" stop-color="${serie.color}" stop-opacity="0" />
          </linearGradient>
        </defs>
        ${area ? `<path d="${area}" fill="url(#area-grad-${serieIndex})" />` : ''}
        <path d="${line}" fill="none" stroke="${serie.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        ${dots}
      </g>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-area" role="img" aria-label="Flux de stock sur ${labels.length} jours">
    ${gridLines}${xLabels}${seriesMarkup}
  </svg>`;
}

/**
 * Anneau de répartition.
 * @param {{ items: { label: string, value: number, color: string }[], size?: number, thickness?: number, centerLabel?: string, centerValue?: string }} options
 */
export function donutChart({ items, size = 220, thickness = 26, centerLabel = '', centerValue = '' }) {
  const total = items.reduce((sum, item) => sum + Math.max(0, Number(item.value) || 0), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const gap = total > 0 ? Math.min(2.4, circumference * 0.008) : 0;

  let offset = 0;
  const segments = items
    .filter((item) => Number(item.value) > 0)
    .map((item) => {
      const fraction = Number(item.value) / total;
      const length = Math.max(0.5, fraction * circumference - gap);
      const markup = `<circle cx="${center}" cy="${center}" r="${radius}" fill="none"
        stroke="${item.color}" stroke-width="${thickness}"
        stroke-dasharray="${length} ${circumference - length}"
        stroke-dashoffset="${-offset}"
        transform="rotate(-90 ${center} ${center})">
        <title>${escapeXml(item.label)} : ${Math.round(fraction * 100)} %</title>
      </circle>`;
      offset += fraction * circumference;
      return markup;
    })
    .join('');

  const track =
    total > 0
      ? ''
      : `<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="var(--chart-track, #e2e8f0)" stroke-width="${thickness}" />`;

  return `<svg viewBox="0 0 ${size} ${size}" class="donut-chart" role="img" aria-label="Répartition de la valeur du stock">
    ${track}${segments}
    <text x="50%" y="47%" text-anchor="middle" class="donut-value">${escapeXml(centerValue)}</text>
    <text x="50%" y="60%" text-anchor="middle" class="donut-label">${escapeXml(centerLabel)}</text>
  </svg>`;
}
