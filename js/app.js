/* GestStock — interface utilisateur.
 * Application mono-page (hash router) sans dépendance, basée sur la couche de données `store.js`.
 */

import { createStockStore, CURRENCIES, UNITS } from './store.js';
import { areaChart, donutChart } from './charts.js';
import {
  clamp,
  debounce,
  downloadFile,
  escapeHtml,
  formatDate,
  formatDateShort,
  formatDateTime,
  formatDayLong,
  formatDayShort,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  initials,
  stockStatus,
  suggestSku,
  toCsv,
  toDatetimeLocal,
  todayStamp,
  unitLabel,
} from './utils.js';

/* ------------------------------------------------------------------ */
/* Icônes                                                              */
/* ------------------------------------------------------------------ */

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="9" rx="1.6"/><rect x="14" y="3" width="7" height="5" rx="1.6"/><rect x="14" y="12" width="7" height="9" rx="1.6"/><rect x="3" y="16" width="7" height="5" rx="1.6"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  swap: '<path d="M7 7h11l-3.5-3.5"/><path d="M17 17H6l3.5 3.5"/>',
  tag: '<path d="M20.6 13.4L13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  truck: '<path d="M1 4h14v12H1z"/><path d="M15 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.2"/><circle cx="18.5" cy="18.5" r="2.2"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 16v-5"/><path d="M12 16V6"/><path d="M17 16v-8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  x: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  upload: '<path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M4 5h16"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  alert: '<path d="M12 3l9 16H3z"/><path d="M12 9v4"/><circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  arrowRight: '<path d="M4 12h16"/><path d="M14 6l6 6-6 6"/>',
  arrowDownLeft: '<path d="M17 7L7 17"/><path d="M7 8v9h9"/>',
  arrowUpRight: '<path d="M7 17L17 7"/><path d="M17 16V7H8"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1.1" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  shield: '<path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  receipt: '<path d="M5 3h14v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>',
};

function icon(name, className = '') {
  const paths = ICONS[name] || ICONS.box;
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

/* ------------------------------------------------------------------ */
/* Référentiels de l'interface                                         */
/* ------------------------------------------------------------------ */

const ROUTE_PATHS = {
  dashboard: 'tableau-de-bord',
  products: 'produits',
  movements: 'mouvements',
  categories: 'categories',
  suppliers: 'fournisseurs',
  reports: 'rapports',
  settings: 'parametres',
};

const ROUTE_BY_PATH = Object.fromEntries(Object.entries(ROUTE_PATHS).map(([route, path]) => [path, route]));
ROUTE_BY_PATH[''] = 'dashboard';

const PAGE_META = {
  dashboard: { title: 'Tableau de bord', subtitle: 'Vue d’ensemble de votre stock et de vos flux.' },
  products: { title: 'Produits', subtitle: 'Catalogue, niveaux de stock, prix et emplacements.' },
  movements: { title: 'Mouvements', subtitle: 'Historique des entrées, sorties et ajustements de stock.' },
  categories: { title: 'Catégories', subtitle: 'Organisez votre catalogue par famille de produits.' },
  suppliers: { title: 'Fournisseurs', subtitle: 'Contacts, produits fournis et valeur du stock.' },
  reports: { title: 'Rapports', subtitle: 'Valorisation, marges et suggestions de réapprovisionnement.' },
  settings: { title: 'Paramètres', subtitle: 'Configuration, apparence et sauvegarde de vos données.' },
};

const NAV_GROUPS = [
  { title: 'Pilotage', items: [{ route: 'dashboard', label: 'Tableau de bord', icon: 'grid' }] },
  {
    title: 'Catalogue',
    items: [
      { route: 'products', label: 'Produits', icon: 'box', badge: true },
      { route: 'movements', label: 'Mouvements', icon: 'swap' },
      { route: 'categories', label: 'Catégories', icon: 'tag' },
      { route: 'suppliers', label: 'Fournisseurs', icon: 'truck' },
    ],
  },
  { title: 'Analyse', items: [{ route: 'reports', label: 'Rapports', icon: 'chart' }] },
  { title: 'Système', items: [{ route: 'settings', label: 'Paramètres', icon: 'settings' }] },
];

const MOVEMENT_META = {
  in: { label: 'Entrée', icon: 'arrowDownLeft', tone: 'success', verb: 'Entrée' },
  out: { label: 'Sortie', icon: 'arrowUpRight', tone: 'danger', verb: 'Sortie' },
  adjust: { label: 'Ajustement', icon: 'refresh', tone: 'info', verb: 'Ajustement' },
};

const MOVEMENT_REASONS = {
  in: ['Réapprovisionnement', 'Retour client', 'Transfert entrant', 'Stock initial', 'Autre'],
  out: ['Vente', 'Casse / perte', 'Transfert sortant', 'Consommation interne', 'Autre'],
  adjust: ['Inventaire', 'Correction d’erreur', 'Autre'],
};

const CATEGORY_COLORS = ['#2563eb', '#0ea5e9', '#14b8a6', '#10b981', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'];

const PRODUCT_SORTS = {
  'name-asc': (a, b) => a.name.localeCompare(b.name, 'fr'),
  'name-desc': (a, b) => b.name.localeCompare(a.name, 'fr'),
  'stock-asc': (a, b) => a.quantity - b.quantity,
  'stock-desc': (a, b) => b.quantity - a.quantity,
  'value-desc': (a, b) => b.quantity * b.purchasePrice - a.quantity * a.purchasePrice,
  'updated-desc': (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
};

/* ------------------------------------------------------------------ */
/* Initialisation                                                      */
/* ------------------------------------------------------------------ */

function getStorage() {
  try {
    const probe = '__geststock_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const memory = new Map();
    return {
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: (key) => memory.delete(key),
    };
  }
}

const store = createStockStore({ storage: getStorage() });
const app = document.getElementById('app');
const pageTitleEl = document.getElementById('page-title');
const pageSubtitleEl = document.getElementById('page-subtitle');
const toastRoot = document.getElementById('toast-root');

const filters = {
  products: { q: '', category: 'all', status: 'all', sort: 'name-asc', page: 1 },
  movements: { q: '', type: 'all', period: '30', page: 1 },
};

const settings = () => store.getSettings();
const money = (value) => formatMoney(value, settings().currency);
const esc = escapeHtml;
const productStatus = (product) => stockStatus(product, settings().defaultThreshold);
const categoryName = (id) => store.getCategory(id)?.name || 'Sans catégorie';
const supplierName = (id) => store.getSupplier(id)?.name || 'Sans fournisseur';

function currentRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTE_BY_PATH[hash] || 'dashboard';
}

/* ------------------------------------------------------------------ */
/* Thème, navigation, chrome                                           */
/* ------------------------------------------------------------------ */

function applyTheme() {
  document.documentElement.dataset.theme = settings().theme;
  syncThemeButton();
}

function syncThemeButton() {
  const button = document.getElementById('btn-theme');
  if (!button) return;
  const dark = settings().theme === 'dark';
  button.innerHTML = icon(dark ? 'sun' : 'moon');
  button.setAttribute('aria-label', dark ? 'Passer au thème clair' : 'Passer au thème sombre');
  button.title = dark ? 'Thème clair' : 'Thème sombre';
}

function toggleTheme() {
  store.updateSettings({ theme: settings().theme === 'dark' ? 'light' : 'dark' });
  applyTheme();
  if (currentRoute() === 'settings') render();
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = NAV_GROUPS.map(
    (group) => `
      <div class="nav-group">
        <p class="nav-title">${group.title}</p>
        ${group.items
          .map(
            (item) => `
            <a class="nav-link" data-nav="${item.route}" href="#/${ROUTE_PATHS[item.route]}">
              ${icon(item.icon, 'nav-icon')}
              <span>${item.label}</span>
              ${item.badge ? '<span class="nav-badge" data-nav-badge hidden></span>' : ''}
            </a>`,
          )
          .join('')}
      </div>`,
  ).join('');
}

function renderNavState() {
  const route = currentRoute();
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const active = link.dataset.nav === route;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const badge = document.querySelector('[data-nav-badge]');
  if (badge) {
    const alerts = store.getStats().alerts;
    badge.textContent = alerts > 99 ? '99+' : String(alerts);
    badge.hidden = alerts === 0;
  }
}

function renderSidebarFoot() {
  const stats = store.getStats();
  const total = stats.totalProducts;
  const healthy = Math.max(0, total - stats.alerts);
  const percent = total > 0 ? Math.round((healthy / total) * 100) : 0;
  const tone = percent >= 80 ? 'success' : percent >= 50 ? 'warning' : 'danger';
  document.getElementById('sidebar-foot').innerHTML = `
    <div class="stock-health">
      <div class="stock-health-head"><span>Santé du stock</span><strong>${total > 0 ? percent : '—'}${total > 0 ? ' %' : ''}</strong></div>
      <div class="meter meter-${tone}"><span style="width:${percent}%"></span></div>
      <p>${stats.outOfStock} rupture(s) · ${stats.lowStock} alerte(s)</p>
    </div>
    <p class="sidebar-version">GestStock 1.0 · données locales</p>`;
}

function renderStaticChrome() {
  document.getElementById('btn-menu').innerHTML = icon('menu');
  document.getElementById('btn-close-sidebar').innerHTML = icon('x');
  document.getElementById('btn-new-movement').innerHTML = `${icon('plus')}<span>Mouvement</span>`;
  const dateChip = document.getElementById('date-chip');
  dateChip.textContent = formatDayLong(new Date());
  renderSidebarFoot();
}

const MOBILE_QUERY = window.matchMedia('(max-width: 1024px)');

/** Rend le tiroir inerte et masqué aux lecteurs d'écran lorsqu'il est fermé sur mobile. */
function syncSidebarInert() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const open = sidebar.classList.contains('is-open');
  const hidden = MOBILE_QUERY.matches && !open;
  sidebar.inert = hidden;
  if (hidden) sidebar.setAttribute('aria-hidden', 'true');
  else sidebar.removeAttribute('aria-hidden');
  document.getElementById('btn-menu')?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.add('is-open');
  sidebar.inert = false;
  sidebar.removeAttribute('aria-hidden');
  document.getElementById('btn-menu')?.setAttribute('aria-expanded', 'true');
  const overlay = document.getElementById('sidebar-overlay');
  overlay.hidden = false;
  document.body.classList.add('sidebar-open');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.remove('is-open');
  const overlay = document.getElementById('sidebar-overlay');
  overlay.hidden = true;
  document.body.classList.remove('sidebar-open');
  syncSidebarInert();
}

/* ------------------------------------------------------------------ */
/* Notifications, modales, confirmations                               */
/* ------------------------------------------------------------------ */

function toast(message, tone = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.innerHTML = `
    <span class="toast-icon">${icon(tone === 'error' ? 'alert' : 'check')}</span>
    <p>${esc(message)}</p>
    <button class="toast-close" type="button" aria-label="Fermer la notification">${icon('x')}</button>`;
  toastRoot.appendChild(el);
  const remove = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  };
  el.querySelector('.toast-close').addEventListener('click', remove);
  setTimeout(remove, 4600);
}

let modalState = null;

function setAppInert(value) {
  const shell = document.querySelector('.app-shell');
  if (shell) shell.inert = Boolean(value);
}

function closeModal() {
  if (!modalState) return;
  const { root, previousFocus } = modalState;
  document.removeEventListener('keydown', onModalKeydown);
  root.remove();
  document.body.classList.remove('modal-open');
  modalState = null;
  setAppInert(false);
  if (previousFocus && typeof previousFocus.focus === 'function') {
    try {
      previousFocus.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }
}

function focusableElements(container) {
  return [...container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getClientRects().length > 0);
}

function trapTabKey(event, container) {
  if (event.key !== 'Tab') return;
  const focusables = focusableElements(container);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (!container.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function onModalKeydown(event) {
  if (!modalState) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
    return;
  }
  trapTabKey(event, modalState.root);
}

/**
 * Ouvre une modale contenant un formulaire.
 * `onSubmit` reçoit (FormData, form) et peut lever une Error pour afficher un message.
 */
function openModal({ title, subtitle = '', body, submitLabel = 'Enregistrer', cancelLabel = 'Annuler', hideSubmit = false, size = '', onSubmit = null, submitTone = 'primary' }) {
  closeModal();
  const previousFocus = document.activeElement;
  const root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head">
        <div>
          <h2 class="modal-title" id="modal-title">${esc(title)}</h2>
          ${subtitle ? `<p class="modal-subtitle">${esc(subtitle)}</p>` : ''}
        </div>
        <button class="icon-btn" type="button" data-close-modal aria-label="Fermer">${icon('x')}</button>
      </div>
      <form class="modal-form" novalidate>
        <div class="modal-body">${body}</div>
        <div class="form-error" data-form-error hidden></div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-close-modal>${esc(cancelLabel)}</button>
          ${hideSubmit ? '' : `<button type="submit" class="btn btn-${submitTone}" data-submit>${esc(submitLabel)}</button>`}
        </div>
      </form>
    </div>`;
  document.getElementById('modal-root').appendChild(root);
  document.body.classList.add('modal-open');
  setAppInert(true);

  const form = root.querySelector('form');
  const errorBox = form.querySelector('[data-form-error]');

  root.addEventListener('click', (event) => {
    if (event.target === root || event.target.closest('[data-close-modal]')) closeModal();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!onSubmit) {
      closeModal();
      return;
    }
    errorBox.hidden = true;
    const submitButton = form.querySelector('[data-submit]');
    submitButton?.setAttribute('disabled', 'disabled');
    try {
      const keepOpen = await onSubmit(new FormData(form), form);
      if (keepOpen === false) return;
      closeModal();
      render();
    } catch (error) {
      errorBox.textContent = error?.message || 'Une erreur est survenue.';
      errorBox.hidden = false;
      errorBox.scrollIntoView({ block: 'nearest' });
    } finally {
      submitButton?.removeAttribute('disabled');
    }
  });

  document.addEventListener('keydown', onModalKeydown);
  modalState = { root, form, previousFocus };
  requestAnimationFrame(() => {
    const first = form.querySelector('input:not([type="hidden"]):not([disabled]), select, textarea');
    first?.focus({ preventScroll: true });
  });
  return { root, form, close: closeModal };
}

function confirmDialog({ title, message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', tone = 'danger', iconName = 'alert' }) {
  closeModal();
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const root = document.createElement('div');
    root.className = 'modal-backdrop';
    root.innerHTML = `
      <div class="modal modal-sm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <div class="confirm-body">
          <span class="confirm-icon confirm-${tone}">${icon(iconName)}</span>
          <div>
            <h2 class="modal-title" id="confirm-title">${esc(title)}</h2>
            <div class="confirm-message">${message}</div>
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-cancel>${esc(cancelLabel)}</button>
          <button type="button" class="btn btn-${tone}" data-confirm>${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.getElementById('modal-root').appendChild(root);
    document.body.classList.add('modal-open');
    setAppInert(true);

    const finish = (value) => {
      document.removeEventListener('keydown', onKeydown);
      root.remove();
      document.body.classList.remove('modal-open');
      setAppInert(false);
      if (previousFocus?.focus) {
        try {
          previousFocus.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
      resolve(value);
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
        return;
      }
      trapTabKey(event, root);
    };
    root.addEventListener('click', (event) => {
      if (event.target === root || event.target.closest('[data-cancel]')) finish(false);
      if (event.target.closest('[data-confirm]')) finish(true);
    });
    document.addEventListener('keydown', onKeydown);
    requestAnimationFrame(() => root.querySelector('[data-confirm]')?.focus({ preventScroll: true }));
  });
}

/* ------------------------------------------------------------------ */
/* Petits fragments réutilisables                                      */
/* ------------------------------------------------------------------ */

function statusBadge(status) {
  return `<span class="badge badge-${status.tone}"><span class="badge-dot"></span>${status.label}</span>`;
}

function emptyState({ iconName = 'box', title, text = '', action = '' }) {
  return `
    <div class="empty-state">
      <span class="empty-icon">${icon(iconName)}</span>
      <h3>${esc(title)}</h3>
      ${text ? `<p>${esc(text)}</p>` : ''}
      ${action || ''}
    </div>`;
}

function paginationHTML({ target, page, totalPages, from, to, total }) {
  return `
    <div class="pagination">
      <p class="page-info">${from}–${to} sur ${total}</p>
      <div class="pager">
        <button class="page-btn" type="button" data-action="page" data-target="${target}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Page précédente">${icon('chevronLeft')}</button>
        <span class="page-current">${page} / ${totalPages}</span>
        <button class="page-btn" type="button" data-action="page" data-target="${target}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''} aria-label="Page suivante">${icon('chevronRight')}</button>
      </div>
    </div>`;
}

function reasonOptions(type, selected) {
  return MOVEMENT_REASONS[type]
    .map((reason) => `<option value="${esc(reason)}" ${reason === selected ? 'selected' : ''}>${esc(reason)}</option>`)
    .join('');
}

function movementBadge(type) {
  const meta = MOVEMENT_META[type];
  return `<span class="badge badge-${meta.tone}">${icon(meta.icon, 'icon-xs')}${meta.label}</span>`;
}

function movementQuantity(movement) {
  const sign = movement.delta > 0 ? '+' : '';
  const value = movement.type === 'adjust' ? movement.delta : movement.type === 'in' ? movement.quantity : -movement.quantity;
  return `${sign}${formatNumber(value)}`;
}

function productAvatar(product) {
  const category = store.getCategory(product.categoryId);
  const color = category?.color || '#64748b';
  return `<span class="product-avatar" style="--avatar-color:${color}">${esc(initials(product.name))}</span>`;
}

/* ------------------------------------------------------------------ */
/* Tableau de bord                                                     */
/* ------------------------------------------------------------------ */

function pageDashboard() {
  const stats = store.getStats();
  const flow = store.dailyFlow(7);
  const labels = flow.map((row) => formatDayShort(row.date));
  const totalIn = flow.reduce((sum, row) => sum + row.inbound, 0);
  const totalOut = flow.reduce((sum, row) => sum + row.outbound, 0);
  const categories = store.categoryBreakdown().filter((row) => row.value > 0);
  const alerts = store.restockList().slice(0, 5);
  const recent = store.recentMovements(6);

  const chart = areaChart({
    labels,
    series: [
      { name: 'Entrées', color: '#10b981', values: flow.map((row) => row.inbound) },
      { name: 'Sorties', color: '#ef4444', values: flow.map((row) => row.outbound) },
    ],
  });

  const donut = donutChart({
    items: categories.map((row) => ({ label: row.name, value: row.value, color: row.color })),
    centerLabel: 'Valeur totale',
    centerValue: formatMoneyCompact(stats.stockValue, settings().currency),
  });

  return `
    <div class="kpi-grid">
      <a class="kpi tone-primary" href="#/rapports">
        <span class="kpi-icon">${icon('wallet')}</span>
        <span class="kpi-body">
          <span class="kpi-label">Valeur du stock</span>
          <strong class="kpi-value">${money(stats.stockValue)}</strong>
          <span class="kpi-foot">${formatNumber(stats.totalUnits)} unités en stock</span>
        </span>
      </a>
      <a class="kpi tone-info" href="#/produits">
        <span class="kpi-icon">${icon('box')}</span>
        <span class="kpi-body">
          <span class="kpi-label">Produits référencés</span>
          <strong class="kpi-value">${formatNumber(stats.totalProducts)}</strong>
          <span class="kpi-foot">${stats.categories} catégories · ${stats.suppliers} fournisseurs</span>
        </span>
      </a>
      <a class="kpi tone-warning" href="#/produits">
        <span class="kpi-icon">${icon('alert')}</span>
        <span class="kpi-body">
          <span class="kpi-label">Alertes de stock</span>
          <strong class="kpi-value">${formatNumber(stats.alerts)}</strong>
          <span class="kpi-foot">${stats.outOfStock} rupture(s) · ${stats.lowStock} stock bas</span>
        </span>
      </a>
      <a class="kpi tone-success" href="#/mouvements">
        <span class="kpi-icon">${icon('swap')}</span>
        <span class="kpi-body">
          <span class="kpi-label">Mouvements (30 j)</span>
          <strong class="kpi-value">${formatNumber(stats.movements30)}</strong>
          <span class="kpi-foot">${formatNumber(totalIn)} entrées / ${formatNumber(totalOut)} sorties cette semaine</span>
        </span>
      </a>
    </div>

    <div class="dashboard-grid">
      <section class="card chart-card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Flux de stock</h2>
            <p class="card-sub">Entrées et sorties des 7 derniers jours</p>
          </div>
          <div class="chart-legend">
            <span class="legend-item"><span class="legend-dot" style="background:#10b981"></span>Entrées <strong>${formatNumber(totalIn)}</strong></span>
            <span class="legend-item"><span class="legend-dot" style="background:#ef4444"></span>Sorties <strong>${formatNumber(totalOut)}</strong></span>
          </div>
        </div>
        <div class="chart-wrap">${chart}</div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Répartition de la valeur</h2>
            <p class="card-sub">Par catégorie de produits</p>
          </div>
        </div>
        <div class="donut-layout">
          ${donut}
          <ul class="donut-legend">
            ${
              categories.length
                ? categories
                    .slice(0, 6)
                    .map(
                      (row) => `
                  <li>
                    <span class="donut-swatch" style="background:${row.color}"></span>
                    <span class="donut-name">${esc(row.name)}</span>
                    <span class="donut-percent">${stats.stockValue > 0 ? Math.round((row.value / stats.stockValue) * 100) : 0} %</span>
                  </li>`,
                    )
                    .join('')
                : '<li class="muted">Aucune valeur en stock</li>'
            }
          </ul>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">À réapprovisionner</h2>
            <p class="card-sub">${stats.alerts} produit(s) sous le seuil d’alerte</p>
          </div>
          <a class="link" href="#/produits">Tout voir ${icon('arrowRight', 'icon-sm')}</a>
        </div>
        ${
          alerts.length
            ? `<ul class="alert-list">
                ${alerts
                  .map(
                    ({ product, status, suggested }) => `
                  <li class="alert-row">
                    ${productAvatar(product)}
                    <span class="alert-info">
                      <strong>${esc(product.name)}</strong>
                      <small>${esc(product.sku)} · ${formatNumber(product.quantity)} / ${formatNumber(product.threshold)} ${unitLabel(product.unit)}</small>
                    </span>
                    ${statusBadge(status)}
                    <button class="btn btn-ghost btn-sm" type="button" data-action="quick-restock" data-id="${product.id}" data-qty="${suggested}" title="Réapprovisionner ${esc(product.name)}">
                      ${icon('plus', 'icon-sm')}<span>Réapprovisionner</span>
                    </button>
                  </li>`,
                  )
                  .join('')}
              </ul>`
            : emptyState({ iconName: 'check', title: 'Aucune alerte', text: 'Tous vos produits sont au-dessus de leur seuil de réapprovisionnement.' })
        }
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Derniers mouvements</h2>
            <p class="card-sub">Activité récente du stock</p>
          </div>
          <a class="link" href="#/mouvements">Tout voir ${icon('arrowRight', 'icon-sm')}</a>
        </div>
        ${
          recent.length
            ? `<ul class="timeline">
                ${recent
                  .map((movement) => {
                    const meta = MOVEMENT_META[movement.type];
                    return `
                  <li class="timeline-row">
                    <span class="timeline-icon timeline-${meta.tone}">${icon(meta.icon, 'icon-sm')}</span>
                    <span class="timeline-info">
                      <strong>${esc(movement.productName || categoryName(null))}</strong>
                      <small>${formatDateTime(movement.date)} · ${esc(movement.reason)}</small>
                    </span>
                    <span class="timeline-qty ${movement.delta > 0 ? 'is-positive' : 'is-negative'}">${movementQuantity(movement)}</span>
                  </li>`;
                  })
                  .join('')}
              </ul>`
            : emptyState({ iconName: 'swap', title: 'Aucun mouvement', text: 'Les entrées et sorties de stock apparaîtront ici.', action: '<button class="btn btn-primary btn-sm" type="button" data-action="new-movement">Enregistrer un mouvement</button>' })
        }
      </section>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Produits                                                            */
/* ------------------------------------------------------------------ */

function filteredProducts() {
  const state = store.getState();
  const { q, category, status, sort } = filters.products;
  const needle = q.trim().toLowerCase();
  const threshold = settings().defaultThreshold;

  const list = state.products.filter((product) => {
    if (category !== 'all' && product.categoryId !== category) return false;
    if (status !== 'all' && stockStatus(product, threshold).key !== status) return false;
    if (needle) {
      const haystack = [
        product.name,
        product.sku,
        product.location,
        categoryName(product.categoryId),
        supplierName(product.supplierId),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const comparator = PRODUCT_SORTS[sort] || PRODUCT_SORTS['name-asc'];
  return [...list].sort(comparator);
}

function pageProducts() {
  const state = store.getState();
  return `
    <div class="toolbar card">
      <div class="search-box">
        ${icon('search', 'search-icon')}
        <input type="search" data-filter="q" value="${esc(filters.products.q)}" placeholder="Rechercher un produit, un SKU, un emplacement…" aria-label="Rechercher un produit" />
      </div>
      <div class="toolbar-group">
        <select class="select" data-filter="category" aria-label="Filtrer par catégorie">
          <option value="all">Toutes les catégories</option>
          ${state.categories.map((cat) => `<option value="${cat.id}" ${filters.products.category === cat.id ? 'selected' : ''}>${esc(cat.name)}</option>`).join('')}
        </select>
        <select class="select" data-filter="status" aria-label="Filtrer par statut de stock">
          <option value="all" ${filters.products.status === 'all' ? 'selected' : ''}>Tous les statuts</option>
          <option value="ok" ${filters.products.status === 'ok' ? 'selected' : ''}>En stock</option>
          <option value="bas" ${filters.products.status === 'bas' ? 'selected' : ''}>Stock bas</option>
          <option value="rupture" ${filters.products.status === 'rupture' ? 'selected' : ''}>Rupture</option>
        </select>
        <select class="select" data-filter="sort" aria-label="Trier les produits">
          <option value="name-asc" ${filters.products.sort === 'name-asc' ? 'selected' : ''}>Nom (A → Z)</option>
          <option value="name-desc" ${filters.products.sort === 'name-desc' ? 'selected' : ''}>Nom (Z → A)</option>
          <option value="stock-asc" ${filters.products.sort === 'stock-asc' ? 'selected' : ''}>Stock croissant</option>
          <option value="stock-desc" ${filters.products.sort === 'stock-desc' ? 'selected' : ''}>Stock décroissant</option>
          <option value="value-desc" ${filters.products.sort === 'value-desc' ? 'selected' : ''}>Valeur décroissante</option>
          <option value="updated-desc" ${filters.products.sort === 'updated-desc' ? 'selected' : ''}>Modifiés récemment</option>
        </select>
      </div>
      <button class="btn btn-primary" type="button" data-action="new-product">${icon('plus', 'icon-sm')}<span>Nouveau produit</span></button>
    </div>

    <section class="card table-card">
      <div class="card-head">
        <div>
          <h2 class="card-title">Catalogue produits</h2>
          <p class="card-sub" data-products-meta>—</p>
        </div>
        <div class="table-actions">
          <button class="btn btn-outline btn-sm" type="button" data-action="export-products-csv">${icon('download', 'icon-sm')}<span>Exporter CSV</span></button>
        </div>
      </div>
      <div id="products-zone"></div>
    </section>`;
}

function renderProductsTable() {
  const zone = document.getElementById('products-zone');
  if (!zone) return;
  const list = filteredProducts();
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  filters.products.page = clamp(filters.products.page, 1, totalPages);
  const page = filters.products.page;
  const from = list.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(list.length, page * pageSize);
  const rows = list.slice((page - 1) * pageSize, page * pageSize);

  const meta = document.querySelector('[data-products-meta]');
  if (meta) {
    const units = list.reduce((sum, product) => sum + (Number(product.quantity) || 0), 0);
    const value = list.reduce((sum, product) => sum + (Number(product.quantity) || 0) * (Number(product.purchasePrice) || 0), 0);
    meta.textContent = `${formatNumber(list.length)} produit(s) · ${formatNumber(units)} unités · ${money(value)}`;
  }

  if (rows.length === 0) {
    const hasProducts = store.getState().products.length > 0;
    zone.innerHTML = emptyState({
      iconName: hasProducts ? 'search' : 'box',
      title: hasProducts ? 'Aucun produit trouvé' : 'Votre catalogue est vide',
      text: hasProducts
        ? 'Modifiez vos filtres ou ajoutez un nouveau produit à votre catalogue.'
        : 'Ajoutez votre premier produit pour commencer à suivre votre stock.',
      action: hasProducts
        ? '<button class="btn btn-outline btn-sm" type="button" data-action="reset-product-filters">Réinitialiser les filtres</button>'
        : '<button class="btn btn-primary btn-sm" type="button" data-action="new-product">Nouveau produit</button>',
    });
    return;
  }

  const body = rows
    .map((product) => {
      const status = productStatus(product);
      const category = store.getCategory(product.categoryId);
      const quantity = Number(product.quantity) || 0;
      const limit = Number(product.threshold) || settings().defaultThreshold || 1;
      const ratio = clamp((quantity / Math.max(1, limit * 2)) * 100, 3, 100);
      const tone = status.tone === 'success' ? 'success' : status.tone === 'warning' ? 'warning' : 'danger';
      return `
        <tr>
          <td>
            <div class="product-cell">
              ${productAvatar(product)}
              <div>
                <p class="cell-title">${esc(product.name)}</p>
                <p class="cell-sub">${esc(product.sku)}${product.location ? ` · ${esc(product.location)}` : ''}</p>
              </div>
            </div>
          </td>
          <td class="col-category"><span class="chip"><span class="dot" style="background:${category?.color || '#94a3b8'}"></span>${esc(categoryName(product.categoryId))}</span></td>
          <td class="hide-lg">${esc(supplierName(product.supplierId))}</td>
          <td>
            <div class="stock-cell">
              <strong>${formatNumber(quantity)} <small>${esc(unitLabel(product.unit))}</small></strong>
              <div class="meter meter-${tone}"><span style="width:${ratio}%"></span></div>
            </div>
          </td>
          <td class="num col-threshold">${formatNumber(product.threshold)}</td>
          <td class="num col-value">${money(quantity * product.purchasePrice)}</td>
          <td>${statusBadge(status)}</td>
          <td class="row-actions">
            <button class="icon-btn" type="button" data-action="edit-product" data-id="${product.id}" title="Modifier" aria-label="Modifier ${esc(product.name)}">${icon('edit', 'icon-sm')}</button>
            <button class="icon-btn danger" type="button" data-action="delete-product" data-id="${product.id}" title="Supprimer" aria-label="Supprimer ${esc(product.name)}">${icon('trash', 'icon-sm')}</button>
          </td>
        </tr>`;
    })
    .join('');

  zone.innerHTML = `
    <div class="table-wrap">
      <table class="data-table products-table">
        <thead>
          <tr>
            <th>Produit</th>
            <th class="col-category">Catégorie</th>
            <th class="hide-lg">Fournisseur</th>
            <th>Stock</th>
            <th class="num col-threshold">Seuil</th>
            <th class="num col-value">Valeur</th>
            <th>Statut</th>
            <th class="num">Actions</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${paginationHTML({ target: 'products', page, totalPages, from, to, total: list.length })}`;
}

/* ------------------------------------------------------------------ */
/* Mouvements                                                          */
/* ------------------------------------------------------------------ */

function filteredMovements() {
  const state = store.getState();
  const { q, type, period } = filters.movements;
  const needle = q.trim().toLowerCase();
  const nowTime = Date.now();
  const days = period === 'all' ? null : Number(period) || 30;
  const since = days ? nowTime - days * 24 * 3600 * 1000 : null;

  return [...state.movements]
    .filter((movement) => {
      if (type !== 'all' && movement.type !== type) return false;
      if (since && new Date(movement.date).getTime() < since) return false;
      if (needle) {
        const product = state.products.find((p) => p.id === movement.productId);
        const haystack = [movement.productName, product?.sku || '', movement.reason, movement.reference, movement.note]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.createdAt) - new Date(a.createdAt));
}

function pageMovements() {
  const state = store.getState();
  const since30 = Date.now() - 30 * 24 * 3600 * 1000;
  const last30 = state.movements.filter((movement) => new Date(movement.date).getTime() >= since30);
  const inbound = last30.filter((movement) => movement.type === 'in');
  const outbound = last30.filter((movement) => movement.type === 'out');
  const adjust = last30.filter((movement) => movement.type === 'adjust');
  const sum = (list) => list.reduce((total, movement) => total + (Number(movement.quantity) || 0), 0);

  return `
    <div class="toolbar card">
      <div class="search-box">
        ${icon('search', 'search-icon')}
        <input type="search" data-filter="q" value="${esc(filters.movements.q)}" placeholder="Rechercher un produit, un motif, une référence…" aria-label="Rechercher un mouvement" />
      </div>
      <div class="toolbar-group">
        <select class="select" data-filter="type" aria-label="Filtrer par type">
          <option value="all" ${filters.movements.type === 'all' ? 'selected' : ''}>Tous les types</option>
          <option value="in" ${filters.movements.type === 'in' ? 'selected' : ''}>Entrées</option>
          <option value="out" ${filters.movements.type === 'out' ? 'selected' : ''}>Sorties</option>
          <option value="adjust" ${filters.movements.type === 'adjust' ? 'selected' : ''}>Ajustements</option>
        </select>
        <select class="select" data-filter="period" aria-label="Filtrer par période">
          <option value="7" ${filters.movements.period === '7' ? 'selected' : ''}>7 derniers jours</option>
          <option value="30" ${filters.movements.period === '30' ? 'selected' : ''}>30 derniers jours</option>
          <option value="90" ${filters.movements.period === '90' ? 'selected' : ''}>90 derniers jours</option>
          <option value="all" ${filters.movements.period === 'all' ? 'selected' : ''}>Tout l’historique</option>
        </select>
      </div>
      <button class="btn btn-primary" type="button" data-action="new-movement">${icon('plus', 'icon-sm')}<span>Nouveau mouvement</span></button>
    </div>

    <div class="stat-chips">
      <div class="stat-chip">
        <span class="stat-chip-icon tone-success">${icon('arrowDownLeft', 'icon-sm')}</span>
        <span><span class="stat-chip-label">Entrées (30 j)</span><strong>${formatNumber(inbound.length)}</strong><small>${formatNumber(sum(inbound))} unités</small></span>
      </div>
      <div class="stat-chip">
        <span class="stat-chip-icon tone-danger">${icon('arrowUpRight', 'icon-sm')}</span>
        <span><span class="stat-chip-label">Sorties (30 j)</span><strong>${formatNumber(outbound.length)}</strong><small>${formatNumber(sum(outbound))} unités</small></span>
      </div>
      <div class="stat-chip">
        <span class="stat-chip-icon tone-info">${icon('refresh', 'icon-sm')}</span>
        <span><span class="stat-chip-label">Ajustements (30 j)</span><strong>${formatNumber(adjust.length)}</strong><small>inventaires et corrections</small></span>
      </div>
    </div>

    <section class="card table-card">
      <div class="card-head">
        <div>
          <h2 class="card-title">Journal des mouvements</h2>
          <p class="card-sub" data-movements-meta>—</p>
        </div>
        <div class="table-actions">
          <button class="btn btn-outline btn-sm" type="button" data-action="export-movements-csv">${icon('download', 'icon-sm')}<span>Exporter CSV</span></button>
        </div>
      </div>
      <div id="movements-zone"></div>
    </section>`;
}

function renderMovementsTable() {
  const zone = document.getElementById('movements-zone');
  if (!zone) return;
  const list = filteredMovements();
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  filters.movements.page = clamp(filters.movements.page, 1, totalPages);
  const page = filters.movements.page;
  const from = list.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(list.length, page * pageSize);
  const rows = list.slice((page - 1) * pageSize, page * pageSize);

  const meta = document.querySelector('[data-movements-meta]');
  if (meta) meta.textContent = `${formatNumber(list.length)} mouvement(s)`;

  if (rows.length === 0) {
    zone.innerHTML = emptyState({
      iconName: 'swap',
      title: 'Aucun mouvement',
      text: 'Aucune opération ne correspond à vos filtres pour cette période.',
      action: '<button class="btn btn-primary btn-sm" type="button" data-action="new-movement">Enregistrer un mouvement</button>',
    });
    return;
  }

  const body = rows
    .map((movement) => {
      const product = store.getProduct(movement.productId);
      const meta = MOVEMENT_META[movement.type];
      return `
        <tr>
          <td class="nowrap">${formatDateTime(movement.date)}</td>
          <td>
            <div class="product-cell compact">
              ${product ? productAvatar(product) : `<span class="product-avatar" style="--avatar-color:#94a3b8">?</span>`}
              <div>
                <p class="cell-title">${esc(movement.productName || product?.name || 'Produit supprimé')}</p>
                <p class="cell-sub">${esc(product?.sku || '')}</p>
              </div>
            </div>
          </td>
          <td>${movementBadge(movement.type)}</td>
          <td class="num"><span class="qty ${movement.delta > 0 ? 'is-positive' : movement.delta < 0 ? 'is-negative' : ''}">${movementQuantity(movement)}</span></td>
          <td class="num col-hide-sm">${formatNumber(movement.newQuantity)}</td>
          <td>${esc(movement.reason)}</td>
          <td class="hide-md">${movement.reference ? `<span class="mono">${esc(movement.reference)}</span>` : '<span class="muted">—</span>'}</td>
          <td class="num col-hide-sm" title="${esc(movement.note || '')}">${movement.note ? icon('receipt', 'icon-sm muted-icon') : '<span class="muted">—</span>'}</td>
        </tr>`;
    })
    .join('');

  zone.innerHTML = `
    <div class="table-wrap">
      <table class="data-table movements-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Produit</th>
            <th>Type</th>
            <th class="num">Quantité</th>
            <th class="num col-hide-sm">Stock après</th>
            <th>Motif</th>
            <th class="hide-md">Référence</th>
            <th class="num col-hide-sm">Note</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${paginationHTML({ target: 'movements', page, totalPages, from, to, total: list.length })}`;
}

/* ------------------------------------------------------------------ */
/* Catégories                                                          */
/* ------------------------------------------------------------------ */

function pageCategories() {
  const state = store.getState();
  const rows = store.categoryBreakdown();
  const realCount = state.categories.length;
  const uncategorized = rows.find((row) => row.id === '__none') || null;
  const headingSuffix = uncategorized
    ? ` · ${formatNumber(uncategorized.productCount)} produit(s) sans catégorie`
    : '';

  return `
    <div class="section-head">
      <div>
        <h2>${formatNumber(realCount)} catégorie(s)${headingSuffix}</h2>
        <p>Regroupez vos produits par famille pour analyser votre stock.</p>
      </div>
      <button class="btn btn-primary" type="button" data-action="new-category">${icon('plus', 'icon-sm')}<span>Nouvelle catégorie</span></button>
    </div>
    ${
      rows.length
        ? `<div class="category-grid">
            ${rows
              .map((category) => {
                const pseudo = category.id === '__none';
                return `
              <article class="category-card ${pseudo ? 'is-pseudo' : ''}">
                <span class="category-accent" style="background:${pseudo ? '#94a3b8' : category.color}"></span>
                <div class="category-card-head">
                  <div>
                    <h3>${esc(category.name)}</h3>
                    <p>${esc(pseudo ? 'Produits sans famille : affectez-leur une catégorie depuis la fiche produit.' : category.description || 'Sans description')}</p>
                  </div>
                  <span class="category-count">${formatNumber(category.productCount)} produit(s)</span>
                </div>
                <div class="category-stats">
                  <div><span>Unités</span><strong>${formatNumber(category.units)}</strong></div>
                  <div><span>Valeur</span><strong>${money(category.value)}</strong></div>
                </div>
                <div class="category-actions">
                  ${
                    pseudo
                      ? `<span class="pseudo-note">${icon('tag', 'icon-sm')} Produits non classés</span>`
                      : `<button class="btn btn-ghost btn-sm" type="button" data-action="edit-category" data-id="${category.id}">${icon('edit', 'icon-sm')}<span>Modifier</span></button>
                         <button class="icon-btn danger" type="button" data-action="delete-category" data-id="${category.id}" aria-label="Supprimer ${esc(category.name)}" title="Supprimer">${icon('trash', 'icon-sm')}</button>`
                  }
                </div>
              </article>`;
              })
              .join('')}
          </div>`
        : emptyState({
            iconName: 'tag',
            title: 'Aucune catégorie',
            text: 'Créez votre première catégorie pour organiser les produits du catalogue.',
            action: '<button class="btn btn-primary btn-sm" type="button" data-action="new-category">Créer une catégorie</button>',
          })
    }`;
}

/* ------------------------------------------------------------------ */
/* Fournisseurs                                                        */
/* ------------------------------------------------------------------ */

function pageSuppliers() {
  const state = store.getState();
  const rows = store.supplierBreakdown();
  const realCount = state.suppliers.length;
  const unassigned = rows.find((row) => row.id === '__none') || null;
  const headingSuffix = unassigned
    ? ` · ${formatNumber(unassigned.productCount)} produit(s) sans fournisseur`
    : '';

  return `
    <div class="section-head">
      <div>
        <h2>${formatNumber(realCount)} fournisseur(s)${headingSuffix}</h2>
        <p>Suivez vos partenaires et la valeur du stock qu’ils vous fournissent.</p>
      </div>
      <button class="btn btn-primary" type="button" data-action="new-supplier">${icon('plus', 'icon-sm')}<span>Nouveau fournisseur</span></button>
    </div>
    <section class="card table-card">
      <div class="card-head">
        <div>
          <h2 class="card-title">Répertoire fournisseurs</h2>
          <p class="card-sub">${formatNumber(realCount)} partenaire(s) enregistré(s)</p>
        </div>
      </div>
      ${
        rows.length
          ? `<div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Fournisseur</th>
                    <th>Contact</th>
                    <th class="hide-md">E-mail</th>
                    <th class="hide-md">Téléphone</th>
                    <th class="num">Produits</th>
                    <th class="num">Valeur du stock</th>
                    <th class="num">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows
                    .map((supplier) => {
                      const pseudo = supplier.id === '__none';
                      return `
                    <tr>
                      <td>
                        <div class="product-cell">
                          <span class="product-avatar" style="--avatar-color:${pseudo ? '#94a3b8' : '#6366f1'}">${esc(initials(supplier.name))}</span>
                          <div>
                            <p class="cell-title">${esc(supplier.name)}</p>
                            <p class="cell-sub">${esc(supplier.address || (pseudo ? 'Produits sans fournisseur' : 'Adresse non renseignée'))}</p>
                          </div>
                        </div>
                      </td>
                      <td>${esc(supplier.contact || '—')}</td>
                      <td class="hide-md">${supplier.email ? `<a class="link" href="mailto:${esc(supplier.email)}">${esc(supplier.email)}</a>` : '<span class="muted">—</span>'}</td>
                      <td class="hide-md">${supplier.phone ? `<a class="link" href="tel:${esc(supplier.phone.replace(/\s/g, ''))}">${esc(supplier.phone)}</a>` : '<span class="muted">—</span>'}</td>
                      <td class="num">${formatNumber(supplier.productCount)}</td>
                      <td class="num">${money(supplier.value)}</td>
                      <td class="row-actions">
                        ${
                          pseudo
                            ? '<span class="pseudo-note">Non affecté</span>'
                            : `<button class="icon-btn" type="button" data-action="edit-supplier" data-id="${supplier.id}" title="Modifier" aria-label="Modifier ${esc(supplier.name)}">${icon('edit', 'icon-sm')}</button>
                               <button class="icon-btn danger" type="button" data-action="delete-supplier" data-id="${supplier.id}" title="Supprimer" aria-label="Supprimer ${esc(supplier.name)}">${icon('trash', 'icon-sm')}</button>`
                        }
                      </td>
                    </tr>`;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>`
          : emptyState({
              iconName: 'truck',
              title: 'Aucun fournisseur',
              text: 'Ajoutez vos fournisseurs pour suivre les approvisionnements.',
              action: '<button class="btn btn-primary btn-sm" type="button" data-action="new-supplier">Ajouter un fournisseur</button>',
            })
      }
    </section>`;
}

/* ------------------------------------------------------------------ */
/* Rapports                                                            */
/* ------------------------------------------------------------------ */

function pageReports() {
  const stats = store.getStats();
  const categories = store.categoryBreakdown();
  const top = store.topProducts(5);
  const restock = store.restockList();
  const maxTop = Math.max(1, ...top.map((product) => product.value));

  return `
    <div class="kpi-grid kpi-grid-compact">
      <div class="kpi tone-primary">
        <span class="kpi-icon">${icon('wallet')}</span>
        <span class="kpi-body"><span class="kpi-label">Valorisation (achat)</span><strong class="kpi-value">${money(stats.stockValue)}</strong><span class="kpi-foot">${formatNumber(stats.totalUnits)} unités</span></span>
      </div>
      <div class="kpi tone-info">
        <span class="kpi-icon">${icon('chart')}</span>
        <span class="kpi-body"><span class="kpi-label">Valeur de vente potentielle</span><strong class="kpi-value">${money(stats.saleValue)}</strong><span class="kpi-foot">Au prix de vente actuel</span></span>
      </div>
      <div class="kpi tone-success">
        <span class="kpi-icon">${icon('wallet')}</span>
        <span class="kpi-body"><span class="kpi-label">Marge potentielle</span><strong class="kpi-value">${money(stats.potentialMargin)}</strong><span class="kpi-foot">${stats.saleValue > 0 ? Math.round((stats.potentialMargin / stats.saleValue) * 100) : 0} % de la valeur de vente</span></span>
      </div>
      <div class="kpi tone-warning">
        <span class="kpi-icon">${icon('alert')}</span>
        <span class="kpi-body"><span class="kpi-label">Réapprovisionnements</span><strong class="kpi-value">${formatNumber(restock.length)}</strong><span class="kpi-foot">Produits à commander</span></span>
      </div>
    </div>

    <div class="report-grid">
      <section class="card">
        <div class="card-head">
          <div><h2 class="card-title">Valorisation par catégorie</h2><p class="card-sub">Valeur d’achat du stock disponible</p></div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Catégorie</th><th class="num">Produits</th><th class="num">Unités</th><th class="num">Valeur achat</th><th class="num">Valeur vente</th></tr>
            </thead>
            <tbody>
              ${categories
                .map(
                  (category) => `
                <tr>
                  <td><span class="chip"><span class="dot" style="background:${category.color}"></span>${esc(category.name)}</span></td>
                  <td class="num">${formatNumber(category.productCount)}</td>
                  <td class="num">${formatNumber(category.units)}</td>
                  <td class="num">${money(category.value)}</td>
                  <td class="num">${money(category.saleValue)}</td>
                </tr>`,
                )
                .join('') || '<tr><td colspan="5" class="muted">Aucune donnée.</td></tr>'}
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                <th class="num">${formatNumber(categories.reduce((sum, c) => sum + c.productCount, 0))}</th>
                <th class="num">${formatNumber(categories.reduce((sum, c) => sum + c.units, 0))}</th>
                <th class="num">${money(stats.stockValue)}</th>
                <th class="num">${money(stats.saleValue)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div><h2 class="card-title">Top produits par valeur</h2><p class="card-sub">Les 5 plus gros postes de stock</p></div>
        </div>
        ${
          top.length
            ? `<div class="hbar-list">
                ${top
                  .map((product) => {
                    const width = clamp((product.value / maxTop) * 100, 2, 100);
                    const color = store.getCategory(product.categoryId)?.color || '#6366f1';
                    return `
                  <div class="hbar-row">
                    <div class="hbar-head"><span class="hbar-name">${esc(product.name)}</span><span class="hbar-value">${money(product.value)}</span></div>
                    <div class="hbar-track"><span style="width:${width}%;background:${color}"></span></div>
                  </div>`;
                  })
                  .join('')}
              </div>`
            : emptyState({ iconName: 'chart', title: 'Aucune valeur en stock' })
        }
      </section>
    </div>

    <section class="card">
      <div class="card-head">
        <div><h2 class="card-title">Suggestions de réapprovisionnement</h2><p class="card-sub">Produits sous le seuil d’alerte, quantités conseillées pour revenir à 2× le seuil</p></div>
        <span class="badge badge-warning">${formatNumber(restock.length)} à commander</span>
      </div>
      ${
        restock.length
          ? `<div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr><th>Produit</th><th>Fournisseur</th><th class="num">Disponible</th><th class="num">Seuil</th><th class="num">Suggestion</th><th>Statut</th><th class="num">Action</th></tr>
                </thead>
                <tbody>
                  ${restock
                    .map(
                      ({ product, status, suggested }) => `
                    <tr>
                      <td>
                        <div class="product-cell compact">
                          ${productAvatar(product)}
                          <div><p class="cell-title">${esc(product.name)}</p><p class="cell-sub">${esc(product.sku)}</p></div>
                        </div>
                      </td>
                      <td>${esc(supplierName(product.supplierId))}</td>
                      <td class="num">${formatNumber(product.quantity)}</td>
                      <td class="num">${formatNumber(product.threshold)}</td>
                      <td class="num"><strong>${formatNumber(suggested)}</strong> ${esc(unitLabel(product.unit))}</td>
                      <td>${statusBadge(status)}</td>
                      <td class="num"><button class="btn btn-outline btn-sm" type="button" data-action="quick-restock" data-id="${product.id}" data-qty="${suggested}">${icon('plus', 'icon-sm')}<span>Réapprovisionner</span></button></td>
                    </tr>`,
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
          : emptyState({ iconName: 'check', title: 'Stock sain', text: 'Aucun produit ne nécessite de réapprovisionnement pour le moment.' })
      }
    </section>

    <section class="card">
      <div class="card-head">
        <div><h2 class="card-title">Exports & sauvegarde</h2><p class="card-sub">Exportez vos données pour les analyser dans un tableur ou les conserver.</p></div>
      </div>
      <div class="export-actions">
        <button class="btn btn-outline" type="button" data-action="export-products-csv">${icon('download', 'icon-sm')}<span>Produits (CSV)</span></button>
        <button class="btn btn-outline" type="button" data-action="export-movements-csv">${icon('download', 'icon-sm')}<span>Mouvements (CSV)</span></button>
        <button class="btn btn-outline" type="button" data-action="export-json">${icon('database', 'icon-sm')}<span>Sauvegarde complète (JSON)</span></button>
      </div>
    </section>`;
}

/* ------------------------------------------------------------------ */
/* Paramètres                                                          */
/* ------------------------------------------------------------------ */

function pageSettings() {
  const state = store.getState();
  const stats = store.getStats();
  return `
    <div class="settings-grid">
      <section class="card settings-card">
        <div class="card-head">
          <div><h2 class="card-title">Entreprise</h2><p class="card-sub">Ces informations sont utilisées dans l’interface et les exports.</p></div>
        </div>
        <div class="form-grid">
          <label class="field span-2">
            <span>Nom de l’entreprise</span>
            <input id="setting-company" type="text" maxlength="80" value="${esc(state.settings.company)}" />
          </label>
          <label class="field">
            <span>Devise</span>
            <select id="setting-currency">
              ${CURRENCIES.map((currency) => `<option value="${currency.code}" ${state.settings.currency === currency.code ? 'selected' : ''}>${currency.label}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span>Seuil d’alerte par défaut</span>
            <input id="setting-threshold" type="number" min="0" step="1" value="${state.settings.defaultThreshold}" />
            <small>Utilisé pour les nouveaux produits, en unités.</small>
          </label>
        </div>
        <div class="card-foot">
          <button class="btn btn-primary" type="button" data-action="save-settings">${icon('check', 'icon-sm')}<span>Enregistrer</span></button>
        </div>
      </section>

      <section class="card settings-card">
        <div class="card-head">
          <div><h2 class="card-title">Apparence</h2><p class="card-sub">Choisissez le thème de l’application.</p></div>
        </div>
        <div class="theme-options">
          <button class="theme-option ${state.settings.theme === 'light' ? 'is-active' : ''}" type="button" data-action="set-theme" data-theme-choice="light">
            <span class="theme-preview theme-preview-light">${icon('sun')}</span>
            <span><strong>Clair</strong><small>Confortable en journée</small></span>
            ${state.settings.theme === 'light' ? `<span class="theme-check">${icon('check', 'icon-sm')}</span>` : ''}
          </button>
          <button class="theme-option ${state.settings.theme === 'dark' ? 'is-active' : ''}" type="button" data-action="set-theme" data-theme-choice="dark">
            <span class="theme-preview theme-preview-dark">${icon('moon')}</span>
            <span><strong>Sombre</strong><small>Reposant le soir</small></span>
            ${state.settings.theme === 'dark' ? `<span class="theme-check">${icon('check', 'icon-sm')}</span>` : ''}
          </button>
        </div>
      </section>

      <section class="card settings-card span-2">
        <div class="card-head">
          <div><h2 class="card-title">Sauvegarde & données</h2><p class="card-sub">Vos données sont stockées dans ce navigateur. Pensez à exporter régulièrement une sauvegarde.</p></div>
          <span class="badge badge-neutral">${formatNumber(stats.totalProducts)} produits · ${formatNumber(state.movements.length)} mouvements</span>
        </div>
        <div class="data-actions">
          <button class="btn btn-outline" type="button" data-action="export-json">${icon('download', 'icon-sm')}<span>Télécharger une sauvegarde (JSON)</span></button>
          <button class="btn btn-outline" type="button" data-action="import-json">${icon('upload', 'icon-sm')}<span>Restaurer une sauvegarde</span></button>
        </div>
        <input type="file" id="import-file" accept=".json,application/json" hidden />
        <div class="danger-zone">
          <div>
            <h3>Zone sensible</h3>
            <p>Recharger la démonstration remplace les données actuelles. Tout effacer supprime définitivement produits, mouvements, catégories et fournisseurs.</p>
          </div>
          <div class="danger-actions">
            <button class="btn btn-ghost" type="button" data-action="reset-demo">${icon('refresh', 'icon-sm')}<span>Recharger la démo</span></button>
            <button class="btn btn-danger" type="button" data-action="clear-all">${icon('trash', 'icon-sm')}<span>Tout effacer</span></button>
          </div>
        </div>
      </section>

      <section class="card settings-card span-2">
        <div class="card-head">
          <div><h2 class="card-title">À propos</h2><p class="card-sub">GestStock — application de gestion de stock.</p></div>
        </div>
        <dl class="about-list">
          <div><dt>Version</dt><dd>1.0.0</dd></div>
          <div><dt>Stockage</dt><dd>Local (navigateur, localStorage)</dd></div>
          <div><dt>Produits</dt><dd>${formatNumber(stats.totalProducts)}</dd></div>
          <div><dt>Mouvements</dt><dd>${formatNumber(state.movements.length)}</dd></div>
          <div><dt>Valeur du stock</dt><dd>${money(stats.stockValue)}</dd></div>
        </dl>
        <p class="settings-note">${icon('shield', 'icon-sm')} Aucune donnée n’est envoyée sur un serveur : tout reste sur cet appareil.</p>
      </section>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Page router                                                         */
/* ------------------------------------------------------------------ */

const PAGES = {
  dashboard: pageDashboard,
  products: pageProducts,
  movements: pageMovements,
  categories: pageCategories,
  suppliers: pageSuppliers,
  reports: pageReports,
  settings: pageSettings,
};

function render() {
  applyTheme();
  const route = currentRoute();
  const meta = PAGE_META[route];
  document.title = `${meta.title} · GestStock`;
  pageTitleEl.textContent = meta.title;
  pageSubtitleEl.textContent = meta.subtitle;
  const dateChip = document.getElementById('date-chip');
  if (dateChip) dateChip.textContent = formatDayLong(new Date());

  renderNavState();
  renderSidebarFoot();

  app.innerHTML = PAGES[route]();
  if (route === 'products') renderProductsTable();
  if (route === 'movements') renderMovementsTable();
  syncSidebarInert();
}

/* ------------------------------------------------------------------ */
/* Modales produits / mouvements / catégories / fournisseurs           */
/* ------------------------------------------------------------------ */

function openProductModal(productId = null) {
  const state = store.getState();
  const product = productId ? store.getProduct(productId) : null;
  if (productId && !product) {
    toast('Produit introuvable.', 'error');
    return;
  }
  const currencyLabel = CURRENCIES.find((c) => c.code === state.settings.currency)?.label || '';
  const body = `
    <div class="form-grid">
      <label class="field span-2">
        <span>Nom du produit *</span>
        <input name="name" type="text" required maxlength="80" value="${esc(product?.name || '')}" placeholder="Ex. Riz parfumé 5 kg" />
      </label>
      <label class="field">
        <span>Référence (SKU) *</span>
        <div class="input-group">
          <input name="sku" type="text" required maxlength="30" value="${esc(product?.sku || '')}" placeholder="Ex. RIZ-5" />
          <button class="btn btn-ghost btn-sm" type="button" data-generate-sku>Générer</button>
        </div>
      </label>
      <label class="field">
        <span>Unité</span>
        <select name="unit">
          ${UNITS.map((unit) => `<option value="${unit}" ${product?.unit === unit ? 'selected' : ''}>${unitLabel(unit)}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span>Catégorie</span>
        <select name="categoryId">
          <option value="">Sans catégorie</option>
          ${state.categories.map((cat) => `<option value="${cat.id}" ${product?.categoryId === cat.id ? 'selected' : ''}>${esc(cat.name)}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span>Fournisseur</span>
        <select name="supplierId">
          <option value="">Sans fournisseur</option>
          ${state.suppliers.map((sup) => `<option value="${sup.id}" ${product?.supplierId === sup.id ? 'selected' : ''}>${esc(sup.name)}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span>Prix d’achat (${esc(currencyLabel)})</span>
        <input name="purchasePrice" type="number" min="0" step="0.01" value="${product?.purchasePrice ?? 0}" />
      </label>
      <label class="field">
        <span>Prix de vente (${esc(currencyLabel)})</span>
        <input name="salePrice" type="number" min="0" step="0.01" value="${product?.salePrice ?? 0}" />
      </label>
      <label class="field">
        <span>Seuil d’alerte</span>
        <input name="threshold" type="number" min="0" step="1" value="${product?.threshold ?? state.settings.defaultThreshold}" />
      </label>
      <label class="field">
        <span>Emplacement</span>
        <input name="location" type="text" maxlength="40" value="${esc(product?.location || '')}" placeholder="Ex. A1-03" />
      </label>
      ${
        product
          ? `<div class="field">
              <span>Stock actuel</span>
              <p class="static-field">${formatNumber(product.quantity)} ${esc(unitLabel(product.unit))}</p>
              <small>Modifiez le stock via un mouvement (entrée, sortie, ajustement).</small>
            </div>`
          : `<label class="field">
              <span>Stock initial</span>
              <input name="initialQuantity" type="number" min="0" step="0.01" value="0" />
              <small>Un mouvement « Stock initial » sera enregistré.</small>
            </label>`
      }
    </div>`;

  const modal = openModal({
    title: product ? 'Modifier le produit' : 'Nouveau produit',
    subtitle: product ? `${product.sku} · stock actuel ${formatNumber(product.quantity)} ${unitLabel(product.unit)}` : 'Ajoutez un article au catalogue.',
    body,
    submitLabel: product ? 'Enregistrer les modifications' : 'Créer le produit',
    onSubmit: (formData) => {
      const values = Object.fromEntries(formData.entries());
      if (product) {
        store.updateProduct(product.id, values);
        toast('Produit mis à jour.');
      } else {
        store.addProduct(values);
        toast('Produit ajouté au catalogue.');
      }
    },
  });

  modal.root.querySelector('[data-generate-sku]')?.addEventListener('click', () => {
    const nameInput = modal.form.elements.name;
    modal.form.elements.sku.value = suggestSku(nameInput.value);
  });
}

function openMovementModal(prefill = {}) {
  const state = store.getState();
  if (state.products.length === 0) {
    toast('Ajoutez d’abord un produit avant d’enregistrer un mouvement.', 'error');
    return;
  }
  const defaultType = ['in', 'out', 'adjust'].includes(prefill.type) ? prefill.type : 'in';
  const productId = prefill.productId && store.getProduct(prefill.productId) ? prefill.productId : state.products[0].id;
  const product = store.getProduct(productId);
  const initialQuantity = Number(prefill.quantity) > 0 ? Number(prefill.quantity) : 1;
  const defaultReason = MOVEMENT_REASONS[defaultType][0];

  const body = `
    <div class="segmented" role="radiogroup" aria-label="Type de mouvement">
      ${[
        { value: 'in', label: 'Entrée', icon: 'arrowDownLeft' },
        { value: 'out', label: 'Sortie', icon: 'arrowUpRight' },
        { value: 'adjust', label: 'Ajustement', icon: 'refresh' },
      ]
        .map(
          (type) => `
        <label class="segmented-item">
          <input type="radio" name="type" value="${type.value}" ${defaultType === type.value ? 'checked' : ''} />
          <span>${icon(type.icon, 'icon-sm')}${type.label}</span>
        </label>`,
        )
        .join('')}
    </div>
    <div class="form-grid">
      <label class="field span-2">
        <span>Produit *</span>
        <select name="productId" required>
          ${state.products
            .map(
              (item) =>
                `<option value="${item.id}" ${item.id === productId ? 'selected' : ''}>${esc(item.name)} — ${formatNumber(item.quantity)} ${unitLabel(item.unit)} · ${esc(item.sku)}</option>`,
            )
            .join('')}
        </select>
      </label>
      <label class="field">
        <span data-qty-label>Quantité *</span>
        <input name="quantity" type="number" min="0.001" step="any" required value="${initialQuantity}" />
        <small data-qty-hint>Nombre d’unités à ajouter au stock.</small>
      </label>
      <label class="field">
        <span>Date</span>
        <input name="date" type="datetime-local" step="1" value="${toDatetimeLocal(new Date())}" />
      </label>
      <label class="field">
        <span>Motif</span>
        <select name="reason">${reasonOptions(defaultType, defaultReason)}</select>
      </label>
      <label class="field">
        <span>Référence</span>
        <input name="reference" type="text" maxlength="60" placeholder="Bon de livraison, facture, ticket…" />
      </label>
      <label class="field span-2">
        <span>Note</span>
        <textarea name="note" rows="2" maxlength="500" placeholder="Commentaire facultatif"></textarea>
      </label>
    </div>
    <div class="movement-preview" data-preview></div>`;

  const modal = openModal({
    title: 'Nouveau mouvement de stock',
    subtitle: 'Enregistrez une entrée, une sortie ou un ajustement d’inventaire.',
    body,
    submitLabel: 'Enregistrer le mouvement',
    onSubmit: (formData) => {
      const values = Object.fromEntries(formData.entries());
      const movement = store.recordMovement(values);
      toast(`${MOVEMENT_META[movement.type].verb} enregistrée : ${movement.productName}.`);
    },
  });

  const form = modal.form;
  const typeRadios = [...form.querySelectorAll('input[name="type"]')];
  const qtyLabel = form.querySelector('[data-qty-label]');
  const qtyHint = form.querySelector('[data-qty-hint]');
  const reasonSelect = form.elements.reason;
  const previewEl = form.querySelector('[data-preview]');
  const productSelect = form.elements.productId;
  const quantityInput = form.elements.quantity;

  const currentType = () => form.querySelector('input[name="type"]:checked')?.value || 'in';

  function updatePreview() {
    const selected = store.getProduct(productSelect.value);
    if (!selected) {
      previewEl.innerHTML = '';
      return;
    }
    const type = currentType();
    const raw = Number(quantityInput.value);
    const quantity = Number.isFinite(raw) ? raw : 0;
    const stock = Number(selected.quantity) || 0;
    let after;
    let delta;
    if (type === 'in') {
      after = stock + quantity;
      delta = quantity;
    } else if (type === 'out') {
      after = stock - quantity;
      delta = -quantity;
    } else {
      after = quantity;
      delta = quantity - stock;
    }
    const unit = unitLabel(selected.unit);
    const insufficient = type !== 'adjust' && after < 0;
    previewEl.innerHTML = `
      <div class="preview-stock"><span>Stock actuel</span><strong>${formatNumber(stock)} ${esc(unit)}</strong></div>
      <span class="preview-arrow">${icon('arrowRight', 'icon-sm')}</span>
      <div class="preview-stock"><span>Après opération</span><strong class="${insufficient ? 'text-danger' : ''}">${formatNumber(Math.max(0, after))} ${esc(unit)}</strong></div>
      <span class="preview-delta ${delta > 0 ? 'is-positive' : delta < 0 ? 'is-negative' : ''}">${delta > 0 ? '+' : ''}${formatNumber(delta)}</span>
      ${insufficient ? `<p class="preview-warning">${icon('alert', 'icon-sm')}Stock insuffisant : disponible ${formatNumber(stock)} ${esc(unit)}.</p>` : ''}`;
  }

  function syncType() {
    const type = currentType();
    qtyLabel.textContent = type === 'adjust' ? 'Nouvelle quantité en stock *' : 'Quantité *';
    qtyHint.textContent =
      type === 'adjust'
        ? 'Le stock sera fixé à cette valeur.'
        : type === 'in'
          ? 'Nombre d’unités à ajouter au stock.'
          : 'Nombre d’unités à retirer du stock.';
    reasonSelect.innerHTML = reasonOptions(type, MOVEMENT_REASONS[type][0]);
    updatePreview();
  }

  typeRadios.forEach((radio) => radio.addEventListener('change', syncType));
  productSelect.addEventListener('change', updatePreview);
  quantityInput.addEventListener('input', updatePreview);
  syncType();
}

function openCategoryModal(categoryId = null) {
  const category = categoryId ? store.getCategory(categoryId) : null;
  if (categoryId && !category) {
    toast('Catégorie introuvable.', 'error');
    return;
  }
  const colors = CATEGORY_COLORS.map(
    (color) =>
      `<button class="color-swatch ${category?.color === color || (!category && color === CATEGORY_COLORS[0]) ? 'is-active' : ''}" type="button" data-color="${color}" style="--swatch:${color}" aria-label="Couleur ${color}"></button>`,
  ).join('');

  const body = `
    <div class="form-grid">
      <label class="field span-2">
        <span>Nom de la catégorie *</span>
        <input name="name" type="text" required maxlength="50" value="${esc(category?.name || '')}" placeholder="Ex. Boissons" />
      </label>
      <label class="field span-2">
        <span>Description</span>
        <textarea name="description" rows="2" maxlength="200" placeholder="À quoi correspond cette catégorie ?">${esc(category?.description || '')}</textarea>
      </label>
      <div class="field span-2">
        <span>Couleur</span>
        <div class="color-row">
          <input type="color" name="color" value="${category?.color || CATEGORY_COLORS[0]}" aria-label="Couleur de la catégorie" />
          <div class="color-swatches">${colors}</div>
        </div>
      </div>
    </div>`;

  const modal = openModal({
    title: category ? 'Modifier la catégorie' : 'Nouvelle catégorie',
    subtitle: 'Les catégories structurent votre catalogue et les rapports.',
    body,
    submitLabel: category ? 'Enregistrer' : 'Créer la catégorie',
    onSubmit: (formData) => {
      const values = Object.fromEntries(formData.entries());
      if (category) {
        store.updateCategory(category.id, values);
        toast('Catégorie mise à jour.');
      } else {
        store.addCategory(values);
        toast('Catégorie créée.');
      }
    },
  });

  const colorInput = modal.form.elements.color;
  modal.root.querySelectorAll('[data-color]').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      colorInput.value = swatch.dataset.color;
      modal.root.querySelectorAll('[data-color]').forEach((item) => item.classList.toggle('is-active', item === swatch));
    });
  });
}

function openSupplierModal(supplierId = null) {
  const supplier = supplierId ? store.getSupplier(supplierId) : null;
  if (supplierId && !supplier) {
    toast('Fournisseur introuvable.', 'error');
    return;
  }
  const body = `
    <div class="form-grid">
      <label class="field span-2">
        <span>Nom du fournisseur *</span>
        <input name="name" type="text" required maxlength="80" value="${esc(supplier?.name || '')}" placeholder="Ex. Grossiste Alpha" />
      </label>
      <label class="field">
        <span>Personne de contact</span>
        <input name="contact" type="text" maxlength="80" value="${esc(supplier?.contact || '')}" />
      </label>
      <label class="field">
        <span>Téléphone</span>
        <input name="phone" type="tel" maxlength="40" value="${esc(supplier?.phone || '')}" />
      </label>
      <label class="field span-2">
        <span>E-mail</span>
        <input name="email" type="email" maxlength="120" value="${esc(supplier?.email || '')}" />
      </label>
      <label class="field span-2">
        <span>Adresse</span>
        <input name="address" type="text" maxlength="160" value="${esc(supplier?.address || '')}" />
      </label>
      <label class="field span-2">
        <span>Notes</span>
        <textarea name="notes" rows="2" maxlength="300">${esc(supplier?.notes || '')}</textarea>
      </label>
    </div>`;

  openModal({
    title: supplier ? 'Modifier le fournisseur' : 'Nouveau fournisseur',
    subtitle: 'Coordonnées et informations de contact.',
    body,
    submitLabel: supplier ? 'Enregistrer' : 'Créer le fournisseur',
    onSubmit: (formData) => {
      const values = Object.fromEntries(formData.entries());
      if (supplier) {
        store.updateSupplier(supplier.id, values);
        toast('Fournisseur mis à jour.');
      } else {
        store.addSupplier(values);
        toast('Fournisseur ajouté.');
      }
    },
  });
}

/* ------------------------------------------------------------------ */
/* Suppressions                                                        */
/* ------------------------------------------------------------------ */

async function deleteProduct(id) {
  const product = store.getProduct(id);
  if (!product) return;
  const ok = await confirmDialog({
    title: 'Supprimer ce produit ?',
    message: `<strong>${esc(product.name)}</strong> et tout son historique de mouvements seront définitivement supprimés.`,
    confirmLabel: 'Supprimer le produit',
    iconName: 'trash',
  });
  if (!ok) return;
  try {
    store.deleteProduct(id);
    toast('Produit supprimé.');
    render();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function deleteCategory(id) {
  const category = store.getCategory(id);
  if (!category) return;
  const used = store.getState().products.filter((product) => product.categoryId === id).length;
  if (used > 0) {
    toast(`« ${category.name} » est utilisée par ${used} produit(s) : réaffectez-les d’abord.`, 'error');
    return;
  }
  const ok = await confirmDialog({
    title: 'Supprimer cette catégorie ?',
    message: `La catégorie <strong>${esc(category.name)}</strong> sera supprimée.`,
    confirmLabel: 'Supprimer la catégorie',
    iconName: 'trash',
  });
  if (!ok) return;
  try {
    store.deleteCategory(id);
    toast('Catégorie supprimée.');
    render();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function deleteSupplier(id) {
  const supplier = store.getSupplier(id);
  if (!supplier) return;
  const used = store.getState().products.filter((product) => product.supplierId === id).length;
  if (used > 0) {
    toast(`« ${supplier.name} » fournit ${used} produit(s) : réaffectez-les d’abord.`, 'error');
    return;
  }
  const ok = await confirmDialog({
    title: 'Supprimer ce fournisseur ?',
    message: `Le fournisseur <strong>${esc(supplier.name)}</strong> sera supprimé de votre répertoire.`,
    confirmLabel: 'Supprimer le fournisseur',
    iconName: 'trash',
  });
  if (!ok) return;
  try {
    store.deleteSupplier(id);
    toast('Fournisseur supprimé.');
    render();
  } catch (error) {
    toast(error.message, 'error');
  }
}

/* ------------------------------------------------------------------ */
/* Paramètres et données                                               */
/* ------------------------------------------------------------------ */

function saveSettings() {
  const company = document.getElementById('setting-company')?.value ?? '';
  const currency = document.getElementById('setting-currency')?.value ?? settings().currency;
  const threshold = document.getElementById('setting-threshold')?.value ?? settings().defaultThreshold;
  try {
    store.updateSettings({ company, currency, defaultThreshold: threshold });
    toast('Paramètres enregistrés.');
    render();
  } catch (error) {
    toast(error.message, 'error');
  }
}

function exportProductsCsv() {
  const state = store.getState();
  const rows = [
    ['SKU', 'Nom', 'Catégorie', 'Fournisseur', 'Unité', 'Quantité', 'Seuil', 'Prix achat', 'Prix vente', 'Valeur stock', 'Emplacement'],
  ];
  for (const product of state.products) {
    rows.push([
      product.sku,
      product.name,
      categoryName(product.categoryId),
      supplierName(product.supplierId),
      unitLabel(product.unit),
      product.quantity,
      product.threshold,
      product.purchasePrice,
      product.salePrice,
      (Number(product.quantity) || 0) * (Number(product.purchasePrice) || 0),
      product.location,
    ]);
  }
  downloadFile(`geststock-produits-${todayStamp()}.csv`, '\ufeff' + toCsv(rows), 'text/csv;charset=utf-8');
  toast('Export CSV des produits téléchargé.');
}

function exportMovementsCsv() {
  const state = store.getState();
  const rows = [
    ['Date', 'Type', 'Produit', 'SKU', 'Quantité', 'Stock avant', 'Stock après', 'Motif', 'Référence', 'Note'],
  ];
  const sorted = [...state.movements].sort((a, b) => new Date(a.date) - new Date(b.date));
  for (const movement of sorted) {
    const product = state.products.find((p) => p.id === movement.productId);
    rows.push([
      formatDateTime(movement.date),
      MOVEMENT_META[movement.type]?.label || movement.type,
      movement.productName || product?.name || '',
      product?.sku || '',
      movement.quantity,
      movement.previousQuantity,
      movement.newQuantity,
      movement.reason,
      movement.reference,
      movement.note,
    ]);
  }
  downloadFile(`geststock-mouvements-${todayStamp()}.csv`, '\ufeff' + toCsv(rows), 'text/csv;charset=utf-8');
  toast('Export CSV des mouvements téléchargé.');
}

function exportBackup() {
  downloadFile(`geststock-sauvegarde-${todayStamp()}.json`, store.exportData(), 'application/json;charset=utf-8');
  toast('Sauvegarde JSON téléchargée.');
}

async function resetDemo() {
  const ok = await confirmDialog({
    title: 'Recharger les données de démonstration ?',
    message: 'Toutes les données actuelles seront remplacées par le jeu de démonstration. Cette action est irréversible.',
    confirmLabel: 'Recharger la démo',
    iconName: 'refresh',
  });
  if (!ok) return;
  store.resetDemo();
  toast('Données de démonstration rechargées.');
  render();
}

async function clearAllData() {
  const ok = await confirmDialog({
    title: 'Tout effacer ?',
    message: 'Produits, mouvements, catégories et fournisseurs seront définitivement supprimés. Pensez à exporter une sauvegarde avant de continuer.',
    confirmLabel: 'Tout effacer',
    iconName: 'trash',
  });
  if (!ok) return;
  store.clearAll();
  toast('Toutes les données ont été effacées.');
  render();
}

/* ------------------------------------------------------------------ */
/* Filtres dynamiques                                                  */
/* ------------------------------------------------------------------ */

const refreshProductsDebounced = debounce(() => {
  if (currentRoute() === 'products') renderProductsTable();
}, 220);

const refreshMovementsDebounced = debounce(() => {
  if (currentRoute() === 'movements') renderMovementsTable();
}, 220);

function onAppInput(event) {
  const control = event.target.closest('[data-filter]');
  if (!control || control.tagName !== 'INPUT') return;
  if (currentRoute() === 'products') {
    filters.products.q = control.value;
    filters.products.page = 1;
    refreshProductsDebounced();
  } else if (currentRoute() === 'movements') {
    filters.movements.q = control.value;
    filters.movements.page = 1;
    refreshMovementsDebounced();
  }
}

function onAppChange(event) {
  const control = event.target.closest('[data-filter]');
  if (!control || control.tagName !== 'SELECT') return;
  const value = control.value;
  if (currentRoute() === 'products') {
    if (control.dataset.filter === 'category') filters.products.category = value;
    if (control.dataset.filter === 'status') filters.products.status = value;
    if (control.dataset.filter === 'sort') filters.products.sort = value;
    filters.products.page = 1;
    renderProductsTable();
  } else if (currentRoute() === 'movements') {
    if (control.dataset.filter === 'type') filters.movements.type = value;
    if (control.dataset.filter === 'period') filters.movements.period = value;
    filters.movements.page = 1;
    renderMovementsTable();
  }
}

async function onAppClick(event) {
  const trigger = event.target.closest('[data-action]');
  if (!trigger || !app.contains(trigger)) return;
  const action = trigger.dataset.action;
  try {
    switch (action) {
      case 'new-product':
        openProductModal();
        break;
      case 'edit-product':
        openProductModal(trigger.dataset.id);
        break;
      case 'delete-product':
        await deleteProduct(trigger.dataset.id);
        break;
      case 'new-movement':
        openMovementModal();
        break;
      case 'quick-restock':
        openMovementModal({
          productId: trigger.dataset.id,
          type: 'in',
          quantity: Number(trigger.dataset.qty) || 1,
        });
        break;
      case 'new-category':
        openCategoryModal();
        break;
      case 'edit-category':
        openCategoryModal(trigger.dataset.id);
        break;
      case 'delete-category':
        await deleteCategory(trigger.dataset.id);
        break;
      case 'new-supplier':
        openSupplierModal();
        break;
      case 'edit-supplier':
        openSupplierModal(trigger.dataset.id);
        break;
      case 'delete-supplier':
        await deleteSupplier(trigger.dataset.id);
        break;
      case 'page': {
        const target = trigger.dataset.target;
        const page = Number(trigger.dataset.page) || 1;
        if (target === 'products') {
          filters.products.page = page;
          renderProductsTable();
        } else if (target === 'movements') {
          filters.movements.page = page;
          renderMovementsTable();
        }
        break;
      }
      case 'reset-product-filters':
        filters.products = { q: '', category: 'all', status: 'all', sort: 'name-asc', page: 1 };
        render();
        break;
      case 'save-settings':
        saveSettings();
        break;
      case 'set-theme':
        store.updateSettings({ theme: trigger.dataset.themeChoice });
        applyTheme();
        render();
        break;
      case 'export-products-csv':
        exportProductsCsv();
        break;
      case 'export-movements-csv':
        exportMovementsCsv();
        break;
      case 'export-json':
        exportBackup();
        break;
      case 'import-json':
        document.getElementById('import-file')?.click();
        break;
      case 'reset-demo':
        await resetDemo();
        break;
      case 'clear-all':
        await clearAllData();
        break;
      default:
        break;
    }
  } catch (error) {
    console.warn(error);
    toast(error?.message || 'Une erreur est survenue.', 'error');
  }
}

async function onDocumentChange(event) {
  if (event.target.id !== 'import-file') return;
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    store.importData(text);
    toast('Sauvegarde restaurée avec succès.');
    render();
  } catch (error) {
    console.warn(error);
    toast(error?.message || 'Import impossible.', 'error');
  }
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */

function init() {
  applyTheme();
  renderNav();
  renderStaticChrome();

  app.addEventListener('click', onAppClick);
  app.addEventListener('input', onAppInput);
  app.addEventListener('change', onAppChange);
  document.addEventListener('change', onDocumentChange);
  window.addEventListener('hashchange', () => {
    closeSidebar();
    render();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  });

  document.getElementById('btn-new-movement').addEventListener('click', () => openMovementModal());
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  document.getElementById('btn-menu').addEventListener('click', openSidebar);
  document.getElementById('btn-close-sidebar').addEventListener('click', closeSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

  MOBILE_QUERY.addEventListener('change', syncSidebarInert);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || modalState) return;
    if (document.getElementById('sidebar').classList.contains('is-open')) closeSidebar();
  });

  render();
}

init();
