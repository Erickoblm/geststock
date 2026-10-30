/* GestStock — petits utilitaires partagés (aucune dépendance, utilisable dans Node et le navigateur). */

const numberFormatters = new Map();
const moneyFormatters = new Map();

const UNIT_LABELS = {
  'pièce': 'pièces',
  kg: 'kg',
  L: 'L',
  carton: 'cartons',
  paquet: 'paquets',
  lot: 'lots',
};

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

export function formatNumber(value, options = {}) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  const key = JSON.stringify(options);
  if (!numberFormatters.has(key)) {
    numberFormatters.set(key, new Intl.NumberFormat('fr-FR', options));
  }
  return numberFormatters.get(key).format(safe);
}

/** Formate un montant selon la devise configurée (MGA géré à part, sans dépendre d'un code ISO). */
export function formatMoney(value, currency = 'MGA') {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  if (currency === 'MGA') {
    return `${formatNumber(Math.round(safe), { maximumFractionDigits: 0 })} Ar`;
  }
  if (!moneyFormatters.has(currency)) {
    try {
      moneyFormatters.set(
        currency,
        new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 2 }),
      );
    } catch {
      moneyFormatters.set(currency, new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }));
    }
  }
  return moneyFormatters.get(currency).format(safe);
}

function currencySymbol(currency) {
  if (currency === 'MGA') return 'Ar';
  try {
    const parts = new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value || currency;
  } catch {
    return currency;
  }
}

/** Version compacte pour les très grands montants (ex. centre d'un graphique). */
export function formatMoneyCompact(value, currency = 'MGA') {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const symbol = currencySymbol(currency);
  if (abs >= 1_000_000_000) return `${formatNumber(n / 1_000_000_000, { maximumFractionDigits: 1 })} Md ${symbol}`;
  if (abs >= 1_000_000) return `${formatNumber(n / 1_000_000, { maximumFractionDigits: 1 })} M ${symbol}`;
  if (abs >= 100_000) return `${formatNumber(n / 1000, { maximumFractionDigits: 0 })} k ${symbol}`;
  return formatMoney(n, currency);
}

export function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value) {
  const d = toDate(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

export function formatDateShort(value) {
  const d = toDate(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function formatTime(value) {
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d);
}

export function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return '—';
  return `${formatDateShort(d)} · ${formatTime(d)}`;
}

export function formatDayShort(value) {
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(d);
}

export function formatDayLong(value) {
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Clé de jour locale (AAAA-MM-JJ), sans décalage UTC. */
export function localDayKey(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Valeur pour un <input type="datetime-local"> (avec les secondes pour un tri fiable). */
export function toDatetimeLocal(value = new Date()) {
  const d = toDate(value) || new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function todayStamp() {
  return localDayKey(new Date());
}

export function unitLabel(unit) {
  return UNIT_LABELS[unit] || unit || 'unité';
}

export function stockStatus(product, defaultThreshold = 10) {
  const quantity = Number(product?.quantity) || 0;
  const threshold = Number(product?.threshold);
  const limit = Number.isFinite(threshold) ? threshold : Number(defaultThreshold) || 0;
  if (quantity <= 0) return { key: 'rupture', label: 'Rupture', tone: 'danger', rank: 2 };
  if (quantity <= limit) return { key: 'bas', label: 'Stock bas', tone: 'warning', rank: 1 };
  return { key: 'ok', label: 'En stock', tone: 'success', rank: 0 };
}

export function suggestSku(name) {
  const base = String(name || 'PROD')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 5) || 'PROD';
  return `${base}-${Math.floor(100 + Math.random() * 900)}`;
}

export function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function debounce(fn, delay = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? '');
          return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(';'),
    )
    .join('\r\n');
}

export function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
