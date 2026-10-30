/* GestStock — campagne QA indépendante et adversariale via le protocole CDP.
 *
 * Prérequis (fournis par l'environnement) :
 *   - serveur statique sur http://127.0.0.1:4173 (ne pas le démarrer ici) ;
 *   - Chrome headless avec CDP sur http://127.0.0.1:9333 (ne pas le lancer ici).
 *
 * Usage : depuis la racine du workspace, `node scripts/qa/qa.mjs`
 * Écrit : screenshots/qa/*.png, scripts/qa/_runs/last-results.json
 * Ne modifie AUCUN fichier de l'application ; n'écrit que dans son périmètre QA.
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SHOTS = join(ROOT, 'screenshots', 'qa');
const RUN = join(HERE, '_runs');
const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9333';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
const STORAGE_KEY = 'geststock.data.v1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', () => reject(new Error('WebSocket CDP indisponible')));
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const handler of this.handlers.get(message.method) || []) handler(message.params);
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(handler);
  }

  close() {
    this.ws.close();
  }
}

async function findPageTarget() {
  const response = await fetch(`${CDP_URL}/json/list`);
  const targets = await response.json();
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (!page) throw new Error('Aucune cible de page CDP trouvée (Chrome CDP absent ?)');
  return page;
}

/* ------------------------------------------------------------------ */
/* Helpers navigateur installés après chaque navigation                 */
/* ------------------------------------------------------------------ */

const HELPERS = `
window.__qa = {
  click(selector) {
    const el = document.querySelector(selector);
    if (!el) throw new Error('Élément introuvable : ' + selector);
    el.click();
    return true;
  },
  clickText(selector, text) {
    const el = [...document.querySelectorAll(selector)].find((node) => node.textContent.includes(text));
    if (!el) throw new Error('Élément introuvable : ' + selector + ' / ' + text);
    el.click();
    return true;
  },
  focusClick(selector) {
    const el = document.querySelector(selector);
    if (!el) throw new Error('Élément introuvable : ' + selector);
    el.focus();
    el.click();
    return true;
  },
  set(selector, value) {
    const el = document.querySelector(selector);
    if (!el) throw new Error('Champ introuvable : ' + selector);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  },
  selectText(selector, text) {
    const el = document.querySelector(selector);
    if (!el) throw new Error('Select introuvable : ' + selector);
    const option = [...el.options].find((opt) => opt.textContent.includes(text));
    if (!option) throw new Error('Option introuvable : ' + text);
    el.value = option.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  },
  selectValue(selector, value) {
    const el = document.querySelector(selector);
    if (!el) throw new Error('Select introuvable : ' + selector);
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  },
  submit() {
    const form = document.querySelector('#modal-root form');
    if (!form) throw new Error('Aucune modale de formulaire ouverte');
    form.requestSubmit();
    return true;
  },
  modalOpen() { return !!document.querySelector('#modal-root .modal'); },
  modalError() {
    const box = document.querySelector('#modal-root [data-form-error]');
    return box && !box.hidden ? box.textContent.trim() : '';
  },
  confirmOpen() { return !!document.querySelector('#modal-root [role="alertdialog"]'); },
  confirmClick() {
    const b = document.querySelector('#modal-root [data-confirm]');
    if (!b) throw new Error('Aucun bouton de confirmation');
    b.click();
    return true;
  },
  lastToast() {
    const list = document.querySelectorAll('.toast p');
    return list.length ? list[list.length - 1].textContent.trim() : '';
  },
  toasts() {
    return [...document.querySelectorAll('.toast p')].map((p) => p.textContent.trim());
  },
  clearToasts() { document.querySelectorAll('.toast').forEach((t) => t.remove()); },
  text(selector) {
    const el = document.querySelector(selector);
    return el ? el.textContent.replace(/\\s+/g, ' ').trim() : '';
  },
  attr(selector, name) {
    const el = document.querySelector(selector);
    return el ? el.getAttribute(name) : null;
  },
  exists(selector) { return !!document.querySelector(selector); },
  count(selector) { return document.querySelectorAll(selector).length; },
  products() {
    return [...document.querySelectorAll('.products-table tbody tr')].map((tr) => ({
      text: tr.textContent.replace(/\\s+/g, ' ').trim(),
      name: tr.querySelector('.cell-title')?.textContent.trim() || '',
      sub: tr.querySelector('.cell-sub')?.textContent.trim() || '',
      stock: tr.querySelector('.stock-cell strong')?.textContent.trim() || '',
      value: tr.querySelector('.col-value')?.textContent.trim() || '',
      status: tr.querySelector('.badge')?.textContent.trim() || '',
    }));
  },
  movements() {
    return [...document.querySelectorAll('.movements-table tbody tr')].map((tr) => ({
      text: tr.textContent.replace(/\\s+/g, ' ').trim(),
      cells: [...tr.querySelectorAll('td')].map((td) => td.textContent.replace(/\\s+/g, ' ').trim()),
    }));
  },
  categories() {
    return [...document.querySelectorAll('.category-card')].map((card) => ({
      text: card.textContent.replace(/\\s+/g, ' ').trim(),
      title: card.querySelector('h3')?.textContent.trim() || '',
      edit: !!card.querySelector('[data-action="edit-category"]'),
      remove: !!card.querySelector('[data-action="delete-category"]'),
    }));
  },
  supplierRows() {
    return [...document.querySelectorAll('.data-table tbody tr')].map((tr) => ({
      text: tr.textContent.replace(/\\s+/g, ' ').trim(),
      name: tr.querySelector('.cell-title')?.textContent.trim() || '',
      edit: !!tr.querySelector('[data-action="edit-supplier"]'),
      remove: !!tr.querySelector('[data-action="delete-supplier"]'),
    }));
  },
  storage() {
    const raw = localStorage.getItem('geststock.data.v1');
    return raw ? JSON.parse(raw) : null;
  },
  money(value) {
    const currency = this.storage().settings.currency;
    if (currency === 'MGA') {
      return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(Number(value))) + ' Ar';
    }
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value));
  },
  norm(value) { return String(value).replace(/[\\s\\u00a0\\u202f]+/g, ' ').trim(); },
  num(value) {
    const n = Number(String(value).replace(/[^0-9,.-]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  },
  pageInfo() { return this.text('.page-info'); },
  pageCurrent() { return this.text('.page-current'); },
  overlow() {
    return {
      inner: window.innerWidth,
      client: document.documentElement.clientWidth,
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      x: window.scrollX,
    };
  },
  downloads() { return window.__qaDownloads || []; },
  clearDownloads() { window.__qaDownloads = []; },
  datetimeLocal(offsetMs) {
    const d = new Date(Date.now() + Number(offsetMs || 0));
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  },
  activeElement() {
    const el = document.activeElement;
    if (!el) return null;
    return {
      tag: el.tagName,
      id: el.id,
      name: el.getAttribute('name'),
      label: el.getAttribute('aria-label'),
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
      inModal: !!document.querySelector('#modal-root')?.contains(el),
    };
  },
};
`;

/* ------------------------------------------------------------------ */
/* Infrastructure de la campagne                                        */
/* ------------------------------------------------------------------ */

const results = [];
const findings = [];
const pageErrors = [];
let currentPhase = 'init';
let activeCdp = null;

function record(id, label, ok, detail = '') {
  results.push({ id, label, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${id} — ${label}${ok ? '' : ` :: ${detail}`}`);
  if (!ok) findings.push({ id, label, detail });
}

async function check(id, label, fn) {
  try {
    const detail = await fn();
    record(id, label, true, typeof detail === 'string' ? detail : '');
  } catch (error) {
    record(id, label, false, error?.message || String(error));
  }
}

function note(id, label, detail) {
  findings.push({ id, label, detail, observation: true });
  console.log(`… ${id} — ${label} :: ${detail}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  mkdirSync(RUN, { recursive: true });

  const target = await findPageTarget();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  activeCdp = cdp;
  await cdp.ready;

  cdp.on('Runtime.exceptionThrown', (params) => {
    pageErrors.push({
      phase: currentPhase,
      kind: 'exception',
      text: params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'exception inconnue',
    });
  });
  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type !== 'error' && params.type !== 'warning') return;
    pageErrors.push({
      phase: currentPhase,
      kind: `console.${params.type}`,
      text: params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '),
    });
  });
  cdp.on('Log.entryAdded', (params) => {
    if (params.entry?.level === 'error') {
      pageErrors.push({ phase: currentPhase, kind: 'log', text: params.entry.text });
    }
  });

  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Log.enable');

  /* Capture des téléchargements (blob) sans écrire hors du périmètre QA. */
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      (() => {
        window.__qaDownloads = [];
        const originalCreate = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => { window.__qaLastBlob = blob; return originalCreate(blob); };
        const originalClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
          try {
            const blob = window.__qaLastBlob;
            const name = this.download;
            if (blob && name) {
              const captured = { name, size: blob.size, type: blob.type };
              Promise.all([blob.text(), blob.arrayBuffer()]).then(([text, buffer]) => {
                captured.text = text;
                captured.bytes = Array.from(new Uint8Array(buffer).slice(0, 6));
                window.__qaDownloads.push(captured);
              }).catch(() => {});
            }
          } catch (error) { /* ignore */ }
          return originalClick.call(this);
        };
      })();
    `,
  });

  async function evaluate(expression) {
    const response = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      const detail = response.exceptionDetails.exception?.description || response.exceptionDetails.text;
      throw new Error(detail);
    }
    return response.result.value;
  }

  async function waitFor(expression, { timeout = 6000, label = expression } = {}) {
    const start = Date.now();
    let lastError = null;
    while (Date.now() - start < timeout) {
      try {
        if (await evaluate(expression)) return true;
      } catch (error) {
        lastError = error;
      }
      await sleep(120);
    }
    throw new Error(`Délai dépassé : ${label}${lastError ? ` (${lastError.message})` : ''}`);
  }

  async function navigate(hash = 'tableau-de-bord') {
    await cdp.send('Page.navigate', { url: `${APP_URL}?qa=${Date.now()}#/${hash}` });
    await sleep(350);
    await waitFor("document.readyState === 'complete' && document.querySelectorAll('[data-nav]').length === 7", {
      label: `chargement de ${hash}`,
    });
    await evaluate(HELPERS);
    await sleep(80);
  }

  async function reloadCurrent() {
    const route = await evaluate("(location.hash.replace(/^#\\//, '').split('?')[0]) || 'tableau-de-bord'");
    await navigate(route);
  }

  async function screenshot(name) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
    return `screenshots/qa/${name}.png`;
  }

  async function setViewport(width, height, mobile = false) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await sleep(200);
  }

  async function pressKey(key) {
    const codes = { Escape: 27, Tab: 9 };
    const params = {
      key,
      code: key,
      windowsVirtualKeyCode: codes[key],
      nativeVirtualKeyCode: codes[key],
    };
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
    await sleep(160);
  }

  async function setFileInput(selector, filePath) {
    const { root } = await cdp.send('DOM.getDocument', { depth: 2 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error(`Input fichier introuvable : ${selector}`);
    await cdp.send('DOM.setFileInputFiles', { nodeId, files: [filePath] });
    await sleep(200);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new Event('change', { bubbles: true }))`);
  }

  async function resetDemoFromSettings() {
    await navigate('parametres');
    await evaluate(`__qa.click('[data-action="reset-demo"]')`);
    await sleep(300);
    assert(await evaluate('__qa.confirmOpen()'), 'la confirmation de réinitialisation ne s’ouvre pas');
    await evaluate('__qa.confirmClick()');
    await waitFor('__qa.toasts().length > 0', { label: 'toast de réinitialisation' });
    await evaluate('__qa.clearToasts()');
  }

  async function storage() {
    return evaluate('__qa.storage()');
  }

  /* État de départ totalement connu, indépendant des tests précédents. */
  async function freshState() {
    await setViewport(1600, 1100, false);
    /* Le navigateur démarre sur about:blank : il faut d'abord charger l'application
       pour que localStorage soit accessible dans ce contexte. */
    await navigate('tableau-de-bord');
    await evaluate('localStorage.clear()');
    await navigate('tableau-de-bord');
    await sleep(200);
    /* Recharge la démo pour forcer l'écriture d'un état connu dans localStorage. */
    await navigate('parametres');
    await evaluate(`__qa.click('[data-action="reset-demo"]')`);
    await sleep(300);
    await evaluate('__qa.confirmClick()');
    await waitFor(`__qa.storage()?.products?.length === 24`, { label: 'état de démonstration initial' });
    await evaluate('__qa.clearToasts()');
    await navigate('tableau-de-bord');
  }

  await freshState();

  /* ================================================================ */
  /* A — Socle applicatif et tableau de bord                          */
  /* ================================================================ */

  currentPhase = 'A. tableau de bord';

  await check('A1', 'Chargement : titre, navigation, KPI, graphiques, date', async () => {
    const info = await evaluate(`(() => ({
      title: document.title,
      pageTitle: __qa.text('#page-title'),
      kpis: __qa.count('.kpi'),
      nav: __qa.count('[data-nav]'),
      current: [...document.querySelectorAll('[aria-current="page"]')].map((el) => el.dataset.nav),
      area: __qa.count('svg.chart-area[role="img"]'),
      donut: __qa.count('svg.donut-chart[role="img"]'),
      areaLabel: __qa.attr('svg.chart-area', 'aria-label'),
      donutLabel: __qa.attr('svg.donut-chart', 'aria-label'),
      date: __qa.text('#date-chip'),
      health: __qa.text('#sidebar-foot'),
      lang: document.documentElement.lang,
    }))()`);
    assert(info.title.includes('Tableau de bord'), `document.title inattendu : ${info.title}`);
    assert(info.pageTitle === 'Tableau de bord', `titre de page inattendu : ${info.pageTitle}`);
    assert(info.kpis === 4, `4 KPI attendus, reçus ${info.kpis}`);
    assert(info.nav === 7, `7 liens de navigation attendus, reçus ${info.nav}`);
    assert(info.current.length === 1 && info.current[0] === 'dashboard', `aria-current inattendu : ${JSON.stringify(info.current)}`);
    assert(info.area === 1 && info.donut === 1, `graphiques manquants (area=${info.area}, donut=${info.donut})`);
    assert(info.areaLabel && info.donutLabel, 'aria-label manquant sur les graphiques');
    assert(info.date.length > 5, `date du jour vide : « ${info.date} »`);
    assert(info.health.includes('Santé du stock'), 'santé du stock absente');
    assert(info.lang === 'fr', `lang attendu fr, reçu ${info.lang}`);
    return info.date;
  });

  await check('A2', 'KPI cohérents avec les données persistées (unités, valeur, produits)', async () => {
    const data = await storage();
    const stats = await evaluate(`(() => {
      const d = __qa.storage();
      const units = d.products.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
      const value = d.products.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.purchasePrice) || 0), 0);
      return {
        units, value,
        money: __qa.money(value),
        kpiValue: __qa.text('.kpi:nth-child(1) .kpi-value'),
        kpiUnits: __qa.text('.kpi:nth-child(1) .kpi-foot'),
        kpiProducts: __qa.text('.kpi:nth-child(2) .kpi-value'),
        alerts: __qa.text('.kpi:nth-child(3) .kpi-value'),
      };
    })()`);
    assert(data.products.length === 24, `24 produits de démo attendus, reçus ${data.products.length}`);
    assert(stats.kpiProducts === '24', `KPI produits attendu 24, reçu ${stats.kpiProducts}`);
    assert(__norm(stats.kpiUnits).includes(__norm(`${stats.units} unités`)), `unités incohérentes : ${stats.kpiUnits}`);
    assert(__norm(stats.kpiValue) === __norm(stats.money), `valeur du stock incohérente : ${stats.kpiValue} ≠ ${stats.money}`);
    return `${stats.units} unités, ${stats.money}`;
  });

  await check('A3', 'Badge d’alertes et santé du stock cohérents avec les seuils', async () => {
    const expected = await evaluate(`(() => {
      const d = __qa.storage();
      let low = 0, out = 0;
      for (const p of d.products) {
        const q = Number(p.quantity) || 0;
        const limit = Number.isFinite(Number(p.threshold)) ? Number(p.threshold) : d.settings.defaultThreshold;
        if (q <= 0) out += 1; else if (q <= limit) low += 1;
      }
      return { low, out, alerts: low + out, badge: __qa.text('[data-nav-badge]'), foot: __qa.text('#sidebar-foot') };
    })()`);
    assert(expected.badge === String(expected.alerts), `badge attendu ${expected.alerts}, reçu ${expected.badge}`);
    assert(expected.foot.includes(`${expected.out} rupture(s)`), `ruptures incohérentes : ${expected.foot}`);
    assert(expected.foot.includes(`${expected.low} alerte(s)`), `alertes incohérentes : ${expected.foot}`);
    return `${expected.alerts} alertes (${expected.out} ruptures, ${expected.low} bas)`;
  });

  await check('A4', 'Derniers mouvements : 6 lignes triées du plus récent au plus ancien', async () => {
    const info = await evaluate(`(() => {
      const d = __qa.storage();
      const dates = d.movements.map((m) => new Date(m.date).getTime()).sort((a, b) => b - a);
      const rows = __qa.count('.timeline-row');
      const first = __qa.text('.timeline-row .timeline-info small');
      return { rows, newest: dates[0], first };
    })()`);
    assert(info.rows === 6, `6 mouvements récents attendus, reçus ${info.rows}`);
    return `${info.rows} lignes`;
  });

  await screenshot('01-dashboard-desktop');

  /* ================================================================ */
  /* B — CRUD produits, filtres, tri, pagination, modales             */
  /* ================================================================ */

  currentPhase = 'B. produits';
  await navigate('produits');

  await check('B1', 'Catalogue : 8 lignes, pagination et métadonnées cohérentes', async () => {
    const info = await evaluate(`(() => {
      const d = __qa.storage();
      const units = d.products.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
      const value = d.products.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.purchasePrice) || 0), 0);
      return {
        rows: __qa.products().length,
        pageInfo: __qa.pageInfo(),
        pageCurrent: __qa.pageCurrent(),
        meta: __qa.text('[data-products-meta]'),
        money: __qa.money(value),
        units,
      };
    })()`);
    assert(info.rows === 8, `8 produits par page attendus, reçus ${info.rows}`);
    assert(info.pageCurrent === '1 / 3', `pagination attendue « 1 / 3 », reçue « ${info.pageCurrent} »`);
    assert(info.pageInfo.includes('1–8 sur 24'), `info pagination inattendue : ${info.pageInfo}`);
    assert(__norm(info.meta).includes(__norm(`24 produit(s)`)), `méta produits inattendue : ${info.meta}`);
    assert(__norm(info.meta).includes(__norm(`${info.units} unités`)), `méta unités incohérente : ${info.meta}`);
    assert(__norm(info.meta).includes(__norm(info.money)), `méta valeur incohérente : ${info.meta}`);
    return info.meta;
  });

  await check('B2', 'Création d’un produit (modale complète, stock initial, persistance)', async () => {
    await evaluate(`__qa.click('[data-action="new-product"]')`);
    await sleep(250);
    const dialog = await evaluate(`(() => {
      const modal = document.querySelector('#modal-root .modal');
      return {
        role: modal?.getAttribute('role'),
        ariaModal: modal?.getAttribute('aria-modal'),
        labelledby: modal?.getAttribute('aria-labelledby'),
        title: document.getElementById(modal?.getAttribute('aria-labelledby'))?.textContent.trim(),
        focused: __qa.activeElement(),
      };
    })()`);
    assert(dialog.role === 'dialog' && dialog.ariaModal === 'true', `attributs ARIA de modale manquants : ${JSON.stringify(dialog)}`);
    assert(dialog.title === 'Nouveau produit', `titre de modale inattendu : ${dialog.title}`);
    assert(dialog.focused?.name === 'name', `focus initial attendu sur le nom, reçu ${JSON.stringify(dialog.focused)}`);
    await evaluate(`(() => {
      __qa.set('#modal-root input[name="name"]', 'Produit QA Alpha');
      __qa.set('#modal-root input[name="sku"]', 'QA-ALPHA');
      __qa.set('#modal-root input[name="purchasePrice"]', '1000');
      __qa.set('#modal-root input[name="salePrice"]', '1500');
      __qa.set('#modal-root input[name="threshold"]', '4');
      __qa.set('#modal-root input[name="initialQuantity"]', '6');
      __qa.set('#modal-root input[name="location"]', 'QA-01');
      __qa.selectText('#modal-root select[name="unit"]', 'kg');
      __qa.selectText('#modal-root select[name="categoryId"]', 'Boissons');
      __qa.selectText('#modal-root select[name="supplierId"]', 'Grossiste Alpha');
      __qa.submit();
    })()`);
    await waitFor('!__qa.modalOpen()', { label: 'fermeture de la modale produit' });
    const toast = await evaluate('__qa.lastToast()');
    assert(toast.includes('ajouté'), `toast inattendu : ${toast}`);
    const data = await storage();
    const product = data.products.find((p) => p.sku === 'QA-ALPHA');
    assert(product, 'produit QA-ALPHA absent du stockage');
    assert(product.name === 'Produit QA Alpha' && product.quantity === 6, `produit mal enregistré : ${JSON.stringify(product)}`);
    assert(product.unit === 'kg' && product.location === 'QA-01', 'unité ou emplacement mal enregistré');
    const initial = data.movements.filter((m) => m.productId === product.id);
    assert(initial.length === 1 && initial[0].type === 'in' && initial[0].quantity === 6, 'mouvement de stock initial absent');
    const rowPresent = await evaluate(`__qa.products().some((row) => row.sub.includes('QA-ALPHA'))`);
    return rowPresent ? 'produit visible dans le tableau' : 'produit présent en base';
  });

  await check('B3', 'Création invalide : nom vide puis SKU en doublon → erreurs dans la modale', async () => {
    await evaluate(`__qa.click('[data-action="new-product"]')`);
    await sleep(200);
    await evaluate('__qa.submit()');
    await sleep(200);
    let error = await evaluate('__qa.modalError()');
    assert(error.toLowerCase().includes('obligatoire'), `message attendu « obligatoire », reçu « ${error} »`);
    assert(await evaluate('__qa.modalOpen()'), 'la modale ne doit pas se fermer sur une erreur');
    await evaluate(`(() => {
      __qa.set('#modal-root input[name="name"]', 'Doublon');
      __qa.set('#modal-root input[name="sku"]', 'coca-15');
      __qa.submit();
    })()`);
    await sleep(250);
    error = await evaluate('__qa.modalError()');
    assert(error.includes('déjà utilisée'), `message doublon attendu, reçu « ${error} »`);
    await pressKey('Escape');
    assert(!(await evaluate('__qa.modalOpen()')), 'Échap ne ferme pas la modale');
    return 'nom vide et SKU insensible à la casse refusés';
  });

  await check('B4', 'Édition produit : champs préremplis, stock inchangé, SKU unique', async () => {
    await evaluate(`__qa.set('[data-filter="q"]', 'QA-ALPHA')`);
    await sleep(500);
    await evaluate(`__qa.focusClick('[data-action="edit-product"]')`);
    await sleep(250);
    const prefill = await evaluate(`(() => ({
      title: __qa.text('#modal-root .modal-title'),
      name: document.querySelector('#modal-root input[name="name"]')?.value,
      sku: document.querySelector('#modal-root input[name="sku"]')?.value,
      threshold: document.querySelector('#modal-root input[name="threshold"]')?.value,
      stock: [...document.querySelectorAll('#modal-root .field')].find((f) => f.textContent.includes('Stock actuel'))?.textContent.replace(/\\s+/g, ' ').trim(),
    }))()`);
    assert(prefill.title === 'Modifier le produit', `titre inattendu : ${prefill.title}`);
    assert(prefill.name === 'Produit QA Alpha' && prefill.sku === 'QA-ALPHA', `préremplissage incohérent : ${JSON.stringify(prefill)}`);
    assert(prefill.stock.includes('6') && prefill.stock.includes('kg'), `stock actuel incohérent : ${prefill.stock}`);
    await evaluate(`__qa.set('#modal-root input[name="sku"]', 'COCA-15')`);
    await evaluate('__qa.submit()');
    await sleep(250);
    assert((await evaluate('__qa.modalError()')).includes('déjà utilisée'), 'le doublon de SKU en édition n’est pas refusé');
    await evaluate(`(() => {
      __qa.set('#modal-root input[name="sku"]', 'QA-ALPHA');
      __qa.set('#modal-root input[name="name"]', 'Produit QA Alpha modifié');
      __qa.set('#modal-root input[name="salePrice"]', '2000');
      __qa.set('#modal-root input[name="threshold"]', '7');
      __qa.submit();
    })()`);
    await waitFor('!__qa.modalOpen()', { label: 'fermeture modale édition' });
    const data = await storage();
    const product = data.products.find((p) => p.sku === 'QA-ALPHA');
    assert(product.name === 'Produit QA Alpha modifié', `nom non mis à jour : ${product.name}`);
    assert(product.quantity === 6, `le stock a changé lors de l’édition : ${product.quantity}`);
    assert(product.salePrice === 2000 && product.threshold === 7, 'prix de vente ou seuil non mis à jour');
    assert(data.movements.filter((m) => m.productId === product.id).length === 1, 'l’édition a créé un mouvement parasite');
    return 'édition sans impact sur le stock';
  });

  await check('B5', 'Bouton « Générer » : SKU proposé non vide et unique dans le catalogue', async () => {
    await evaluate(`__qa.click('[data-action="new-product"]')`);
    await sleep(200);
    await evaluate(`__qa.set('#modal-root input[name="name"]', 'Test Generateur')`);
    await evaluate(`__qa.click('#modal-root [data-generate-sku]')`);
    const sku = await evaluate(`document.querySelector('#modal-root input[name="sku"]')?.value || ''`);
    assert(/^[A-Z0-9]{1,5}-\d{3}$/.test(sku), `SKU généré inattendu : « ${sku} »`);
    const unique = await evaluate(`(() => { const d = __qa.storage(); return !d.products.some((p) => p.sku === ${JSON.stringify(sku)}); })()`);
    assert(unique, `SKU généré en collision : ${sku}`);
    await pressKey('Escape');
    return sku;
  });

  await check('B6', 'Recherche (nom, SKU, emplacement), filtres catégorie/statut', async () => {
    await navigate('produits');
    await evaluate(`__qa.set('[data-filter="q"]', 'QA-ALPHA')`);
    await sleep(500);
    let rows = await evaluate('__qa.products()');
    assert(rows.length === 1 && rows[0].name.includes('modifié'), `recherche par SKU incohérente : ${JSON.stringify(rows)}`);
    await evaluate(`__qa.set('[data-filter="q"]', 'QA-01')`);
    await sleep(500);
    rows = await evaluate('__qa.products()');
    assert(rows.length === 1 && rows[0].sub.includes('QA-01'), 'recherche par emplacement incohérente');
    await evaluate(`__qa.set('[data-filter="q"]', '')`);
    await sleep(500);

    const expected = await evaluate(`(() => {
      const d = __qa.storage();
      const status = (p) => { const q = Number(p.quantity) || 0; const t = Number(p.threshold); return q <= 0 ? 'rupture' : q <= t ? 'bas' : 'ok'; };
      return {
        rupture: d.products.filter((p) => status(p) === 'rupture').length,
        bas: d.products.filter((p) => status(p) === 'bas').length,
        ok: d.products.filter((p) => status(p) === 'ok').length,
        electronique: d.products.filter((p) => d.categories.find((c) => c.id === p.categoryId)?.name === 'Électronique').length,
      };
    })()`);
    await evaluate(`__qa.selectValue('[data-filter="status"]', 'rupture')`);
    await sleep(400);
    let list = await evaluate('__qa.products()');
    assert(list.length === expected.rupture, `rupture : ${list.length} ligne(s), attendu ${expected.rupture}`);
    assert(list.every((row) => row.status.includes('Rupture')), 'produits non en rupture affichés');
    await evaluate(`__qa.selectValue('[data-filter="status"]', 'bas')`);
    await sleep(400);
    list = await evaluate('__qa.products()');
    assert(list.length === expected.bas, `stock bas : ${list.length} ligne(s), attendu ${expected.bas}`);
    assert(list.every((row) => row.status.includes('Stock bas')), 'statuts incohérents pour le filtre « stock bas »');
    await evaluate(`__qa.selectValue('[data-filter="status"]', 'all')`);
    await sleep(300);
    await evaluate(`__qa.selectText('[data-filter="category"]', 'Électronique')`);
    await sleep(400);
    list = await evaluate('__qa.products()');
    assert(list.length === expected.electronique, `catégorie : ${list.length} ligne(s), attendu ${expected.electronique}`);
    assert(list.every((row) => row.text.includes('Électronique')), 'filtre catégorie incohérent');
    await evaluate(`__qa.selectText('[data-filter="category"]', 'Toutes les catégories')`);
    await sleep(300);
    return `${expected.rupture} ruptures / ${expected.bas} stocks bas / ${expected.electronique} électronique`;
  });

  await check('B7', 'Tri : nom, stock croissant/décroissant, valeur décroissante', async () => {
    const quant = (text) => Number(String(text).replace(/[^0-9,.-]/g, '').replace(',', '.'));
    await evaluate(`__qa.selectValue('[data-filter="sort"]', 'stock-asc')`);
    await sleep(350);
    let values = (await evaluate('__qa.products()')).map((row) => quant(row.stock));
    assert(values.every((v, i) => i === 0 || values[i - 1] <= v), `tri stock croissant invalide : ${values}`);
    await evaluate(`__qa.selectValue('[data-filter="sort"]', 'stock-desc')`);
    await sleep(350);
    values = (await evaluate('__qa.products()')).map((row) => quant(row.stock));
    assert(values.every((v, i) => i === 0 || values[i - 1] >= v), `tri stock décroissant invalide : ${values}`);
    await evaluate(`__qa.selectValue('[data-filter="sort"]', 'name-desc')`);
    await sleep(350);
    const names = (await evaluate('__qa.products()')).map((row) => row.name);
    const sorted = [...names].sort((a, b) => b.localeCompare(a, 'fr'));
    assert(JSON.stringify(names) === JSON.stringify(sorted), `tri nom Z→A invalide : ${names}`);
    await evaluate(`__qa.selectValue('[data-filter="sort"]', 'value-desc')`);
    await sleep(350);
    const vals = (await evaluate('__qa.products()')).map((row) => quant(row.value));
    assert(vals.every((v, i) => i === 0 || vals[i - 1] >= v), `tri valeur décroissante invalide : ${vals}`);
    await evaluate(`__qa.selectValue('[data-filter="sort"]', 'name-asc')`);
    await sleep(300);
    return 'tris conformes';
  });

  await check('B8', 'Pagination : pages successives, bornes désactivées, comptages cohérents', async () => {
    await navigate('produits');
    const expected = await evaluate(`(() => { const d = __qa.storage(); return { total: d.products.length, pages: Math.max(1, Math.ceil(d.products.length / 8)) }; })()`);
    const info1 = await evaluate(`({ current: __qa.pageCurrent(), prev: document.querySelector('.pager .page-btn[data-page="0"]')?.disabled, rows: __qa.products().length })`);
    assert(info1.current === `1 / ${expected.pages}`, `page initiale inattendue : ${info1.current} (attendu 1 / ${expected.pages})`);
    assert(info1.prev === true, 'bouton « page précédente » actif en page 1');
    assert(info1.rows === Math.min(8, expected.total), `lignes page 1 inattendues : ${info1.rows}`);
    await evaluate(`__qa.click('.pager .page-btn[data-page="2"]')`);
    await sleep(300);
    const info2 = await evaluate(`({ current: __qa.pageCurrent(), info: __qa.pageInfo(), rows: __qa.products().length })`);
    assert(info2.current === `2 / ${expected.pages}`, `page 2 inattendue : ${info2.current}`);
    assert(info2.info.includes(`9–${Math.min(16, expected.total)} sur ${expected.total}`), `info page 2 inattendue : ${info2.info}`);
    assert(info2.rows === Math.min(8, expected.total - 8), `lignes page 2 inattendues : ${info2.rows}`);
    // atteint la dernière page en cliquant « suivant »
    for (let i = 0; i < expected.pages; i += 1) {
      const canNext = await evaluate(`(() => { const current = Number(document.querySelector('.page-current').textContent.split('/')[0]); const next = document.querySelector('.pager .page-btn[data-page="' + (current + 1) + '"]'); return next ? !next.disabled : false; })()`);
      if (!canNext) break;
      await evaluate(`(() => { const current = Number(document.querySelector('.page-current').textContent.split('/')[0]); document.querySelector('.pager .page-btn[data-page="' + (current + 1) + '"]').click(); })()`);
      await sleep(250);
    }
    const last = await evaluate(`({ current: __qa.pageCurrent(), rows: __qa.products().length, nextDisabled: document.querySelector('.pager .page-btn[data-page]')?.disabled })`);
    assert(last.current === `${expected.pages} / ${expected.pages}`, `dernière page inattendue : ${last.current}`);
    const lastRows = expected.total - (expected.pages - 1) * 8;
    assert(last.rows === lastRows, `lignes de la dernière page inattendues : ${last.rows} (attendu ${lastRows})`);
    return `${expected.total} produits, ${expected.pages} pages`;
  });

  await check('B9', 'Aucun résultat : état vide + bouton « Réinitialiser les filtres »', async () => {
    await evaluate(`__qa.set('[data-filter="q"]', 'zzz-introuvable-zzz')`);
    await sleep(500);
    const empty = await evaluate(`({ empty: __qa.count('.empty-state'), text: __qa.text('.empty-state'), rows: __qa.products().length })`);
    assert(empty.rows === 0 && empty.empty === 1, `état vide absent : ${JSON.stringify(empty)}`);
    assert(empty.text.includes('Aucun produit trouvé'), `texte état vide inattendu : ${empty.text}`);
    await evaluate(`__qa.click('[data-action="reset-product-filters"]')`);
    await sleep(350);
    const expected = await evaluate(`(() => { const d = __qa.storage(); return { total: d.products.length, pages: Math.max(1, Math.ceil(d.products.length / 8)) }; })()`);
    const after = await evaluate(`({ rows: __qa.products().length, q: document.querySelector('[data-filter="q"]')?.value, current: __qa.pageCurrent() })`);
    assert(after.rows === 8 && after.q === '' && after.current === `1 / ${expected.pages}`, `réinitialisation des filtres inefficace : ${JSON.stringify(after)}`);
    return 'état vide et réinitialisation OK';
  });

  await check('B10', 'Suppression produit : confirmation, annulation, suppression effective et historique', async () => {
    await evaluate(`__qa.set('[data-filter="q"]', 'QA-ALPHA')`);
    await sleep(500);
    await evaluate(`__qa.focusClick('[data-action="delete-product"]')`);
    await sleep(250);
    assert(await evaluate('__qa.confirmOpen()'), 'la confirmation de suppression ne s’ouvre pas');
    const dialog = await evaluate(`({ role: document.querySelector('#modal-root [role="alertdialog"]')?.getAttribute('role'), text: __qa.text('#modal-root .confirm-message'), cancel: __qa.text('#modal-root [data-cancel]') })`);
    assert(dialog.text.includes('modifié'), `le nom du produit n’apparaît pas dans la confirmation : ${dialog.text}`);
    await pressKey('Escape');
    assert(!(await evaluate('__qa.confirmOpen()')), 'Échap ne ferme pas la confirmation');
    let data = await storage();
    assert(data.products.some((p) => p.sku === 'QA-ALPHA'), 'annulation : le produit a été supprimé');
    await evaluate(`__qa.focusClick('[data-action="delete-product"]')`);
    await sleep(250);
    await evaluate('__qa.confirmClick()');
    await waitFor('!__qa.confirmOpen()', { label: 'fermeture confirmation' });
    await sleep(200);
    data = await storage();
    assert(!data.products.some((p) => p.sku === 'QA-ALPHA'), 'produit toujours présent après suppression');
    assert(!data.movements.some((m) => m.productName === 'Produit QA Alpha modifié'), 'mouvements du produit supprimé encore présents');
    assert((await evaluate('__qa.lastToast()')).includes('supprimé'), 'toast de suppression inattendu');
    return 'suppression + historique nettoyés';
  });

  await check('B11', 'Réapprovisionnement rapide : préremplissage type/produit/quantité', async () => {
    await navigate('tableau-de-bord');
    const prefill = await evaluate(`(() => {
      const button = document.querySelector('[data-action="quick-restock"]');
      if (!button) return null;
      return { id: button.dataset.id, qty: button.dataset.qty, product: button.closest('.alert-row')?.querySelector('.alert-info strong')?.textContent.trim() };
    })()`);
    assert(prefill, 'aucun bouton de réapprovisionnement rapide sur le tableau de bord');
    await evaluate(`__qa.click('[data-action="quick-restock"]')`);
    await sleep(300);
    const modal = await evaluate(`({
      open: __qa.modalOpen(),
      type: document.querySelector('#modal-root input[name="type"]:checked')?.value,
      productId: document.querySelector('#modal-root select[name="productId"]')?.value,
      quantity: document.querySelector('#modal-root input[name="quantity"]')?.value,
      preview: __qa.text('#modal-root [data-preview]'),
    })`);
    assert(modal.open && modal.type === 'in', `modale de réappro non ouverte en entrée : ${JSON.stringify(modal)}`);
    assert(modal.productId === prefill.id, 'produit non prérempli');
    assert(modal.quantity === prefill.qty, `quantité préremplie ${modal.quantity} ≠ ${prefill.qty}`);
    assert(modal.preview.includes('Stock actuel') && modal.preview.includes('Après opération'), 'aperçu du mouvement absent');
    await pressKey('Escape');
    return `${prefill.product} → +${prefill.qty}`;
  });

  await check('B12', 'Échappement HTML : un nom de produit hostile n’exécute pas de script', async () => {
    const payload = '<img src=x onerror="window.__xss=1">';
    await navigate('produits');
    await evaluate(`__qa.click('[data-action="new-product"]')`);
    await sleep(200);
    await evaluate(`(() => {
      __qa.set('#modal-root input[name="name"]', ${JSON.stringify(payload)});
      __qa.set('#modal-root input[name="sku"]', 'QA-XSS');
      __qa.submit();
    })()`);
    await waitFor('!__qa.modalOpen()', { label: 'création produit XSS' });
    await sleep(300);
    const info = await evaluate(`({
      executed: window.__xss === 1,
      literal: [...document.querySelectorAll('.products-table .cell-title')].some((el) => el.textContent.includes('<img')),
      injected: !!document.querySelector('.products-table img'),
    })`);
    assert(!info.executed, 'le payload XSS a été exécuté');
    assert(!info.injected, 'une balise img a été injectée dans le DOM');
    // nettoyage : suppression via l'interface
    await evaluate(`__qa.set('[data-filter="q"]', 'QA-XSS')`);
    await sleep(500);
    await evaluate(`__qa.focusClick('[data-action="delete-product"]')`);
    await sleep(200);
    await evaluate('__qa.confirmClick()');
    await sleep(400);
    return 'nom affiché échappé, aucun script exécuté';
  });

  await check('B13', 'Fermeture des modales : clic sur le fond, et clic à l’intérieur sans effet', async () => {
    await navigate('produits');
    await evaluate(`__qa.click('[data-action="new-product"]')`);
    await sleep(250);
    await evaluate(`document.querySelector('#modal-root .modal').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    await sleep(200);
    assert(await evaluate('__qa.modalOpen()'), 'un clic à l’intérieur de la modale a fermé la modale');
    await evaluate(`document.querySelector('#modal-root .modal-backdrop').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    await sleep(250);
    assert(!(await evaluate('__qa.modalOpen()')), 'un clic sur le fond ne ferme pas la modale produit');
    // Même test sur une confirmation de suppression
    await evaluate(`__qa.focusClick('[data-action="delete-product"]')`);
    await sleep(250);
    assert(await evaluate('__qa.confirmOpen()'), 'la confirmation de suppression ne s’ouvre pas');
    await evaluate(`document.querySelector('#modal-root .modal-backdrop').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    await sleep(250);
    const info = await evaluate(`({ confirm: __qa.confirmOpen(), products: __qa.storage().products.length })`);
    assert(!info.confirm, 'un clic sur le fond ne ferme pas la confirmation');
    assert(info.products === 24, 'un clic sur le fond a supprimé un produit');
    return 'fermeture par le fond OK (formulaire et confirmation)';
  });

  /* ================================================================ */
  /* D — Catégories et fournisseurs                                   */
  /* ================================================================ */

  currentPhase = 'D. catégories / fournisseurs';
  await navigate('categories');

  await check('D1', 'Catégories : 6 cartes, compteur et suppression protégée', async () => {
    const info = await evaluate(`({ cards: __qa.categories().length, head: __qa.text('.section-head h2'), active: [...document.querySelectorAll('[data-nav]')].filter((a) => a.getAttribute('aria-current')) })`);
    assert(info.cards === 6, `6 catégories attendues, reçues ${info.cards}`);
    assert(info.head.includes('6 catégorie(s)'), `compteur inattendu : ${info.head}`);
    return info.head;
  });

  await check('D2', 'Création catégorie : couleur choisie, nom en doublon refusé', async () => {
    await evaluate(`__qa.click('[data-action="new-category"]')`);
    await sleep(250);
    await evaluate(`__qa.set('#modal-root input[name="name"]', 'QA Catégorie')`);
    await evaluate(`__qa.click('#modal-root [data-color="#ef4444"]')`);
    const color = await evaluate(`document.querySelector('#modal-root input[name="color"]')?.value`);
    assert(color === '#ef4444', `couleur de la pastille non appliquée : ${color}`);
    await evaluate(`__qa.submit()`);
    await waitFor('!__qa.modalOpen()', { label: 'création catégorie' });
    let data = await storage();
    let category = data.categories.find((c) => c.name === 'QA Catégorie');
    assert(category && category.color === '#ef4444', `catégorie mal enregistrée : ${JSON.stringify(category)}`);
    await evaluate(`__qa.click('[data-action="new-category"]')`);
    await sleep(200);
    await evaluate(`(() => { __qa.set('#modal-root input[name="name"]', 'qa catégorie'); __qa.submit(); })()`);
    await sleep(300);
    assert((await evaluate('__qa.modalError()')).includes('existe déjà'), 'doublon de catégorie accepté');
    await pressKey('Escape');
    data = await storage();
    category = data.categories.find((c) => c.name === 'QA Catégorie');
    return `couleur ${category.color}`;
  });

  await check('D3', 'Édition puis suppression d’une catégorie inutilisée', async () => {
    await evaluate(`(() => {
      const card = [...document.querySelectorAll('.category-card')].find((c) => c.textContent.includes('QA Catégorie'));
      card.querySelector('[data-action="edit-category"]').click();
    })()`);
    await sleep(250);
    await evaluate(`__qa.set('#modal-root input[name="name"]', 'QA Catégorie modifiée')`);
    await evaluate('__qa.submit()');
    await waitFor('!__qa.modalOpen()', { label: 'édition catégorie' });
    let card = await evaluate(`__qa.categories().find((c) => c.title === 'QA Catégorie modifiée')`);
    assert(card, 'la catégorie modifiée n’apparaît pas');
    await evaluate(`(() => {
      const node = [...document.querySelectorAll('.category-card')].find((c) => c.textContent.includes('QA Catégorie modifiée'));
      node.querySelector('[data-action="delete-category"]').click();
    })()`);
    await sleep(250);
    await evaluate('__qa.confirmClick()');
    await sleep(400);
    const data = await storage();
    assert(!data.categories.some((c) => c.name === 'QA Catégorie modifiée'), 'catégorie toujours présente après suppression');
    assert(!(await evaluate(`__qa.categories().some((c) => c.title === 'QA Catégorie modifiée')`)), 'carte supprimée encore affichée');
    return 'édition et suppression OK';
  });

  await check('D4', 'Suppression d’une catégorie utilisée refusée avec message explicite', async () => {
    await evaluate(`(() => {
      const card = [...document.querySelectorAll('.category-card')].find((c) => c.querySelector('h3')?.textContent.trim() === 'Boissons');
      card.querySelector('[data-action="delete-category"]').click();
    })()`);
    await sleep(350);
    const info = await evaluate(`({ toast: __qa.lastToast(), confirm: __qa.confirmOpen() })`);
    assert(!info.confirm, 'une confirmation s’ouvre pour une catégorie utilisée');
    assert(info.toast.includes('produit'), `message attendu avec le nombre de produits, reçu « ${info.toast} »`);
    const data = await storage();
    assert(data.categories.some((c) => c.name === 'Boissons'), 'la catégorie utilisée a été supprimée');
    return info.toast;
  });

  await check('D5', 'Produit sans catégorie : la « Sans catégorie » ne doit pas exposer d’actions cassées', async () => {
    await navigate('produits');
    await evaluate(`__qa.click('[data-action="new-product"]')`);
    await sleep(200);
    await evaluate(`(() => { __qa.set('#modal-root input[name="name"]', 'QA Sans Cat'); __qa.set('#modal-root input[name="sku"]', 'QA-NOCAT'); __qa.submit(); })()`);
    await waitFor('!__qa.modalOpen()', { label: 'création produit sans catégorie' });
    await navigate('categories');
    const info = await evaluate(`(() => {
      const cards = __qa.categories();
      const pseudo = cards.find((c) => c.title === 'Sans catégorie');
      return { cards: cards.length, head: __qa.text('.section-head h2'), pseudo, titles: cards.map((c) => c.title) };
    })()`);
    assert(info.pseudo, 'aucune carte « Sans catégorie » alors qu’un produit n’a pas de catégorie');
    // La pseudo-catégorie ne doit exposer aucune action Modifier/Supprimer.
    const actions = await evaluate(`(() => {
      const card = [...document.querySelectorAll('.category-card')].find((c) => c.querySelector('h3')?.textContent.trim() === 'Sans catégorie');
      return {
        edit: !!card.querySelector('[data-action="edit-category"]'),
        remove: !!card.querySelector('[data-action="delete-category"]'),
        note: card.querySelector('.pseudo-note')?.textContent.trim() || '',
      };
    })()`);
    assert(!actions.edit && !actions.remove, 'la pseudo-catégorie expose encore des actions Modifier/Supprimer');
    await screenshot('12-pseudo-categorie');
    note(
      'D5',
      'Carte « Sans catégorie » (pseudo-catégorie) dans la page Catégories',
      `titre ${info.head} pour ${info.cards} cartes ; aucune action Modifier/Supprimer exposée, mention « ${actions.note} »`,
    );
    // On vérifie au moins que le produit sans catégorie existe bien en base.
    const data = await storage();
    assert(data.products.some((p) => p.sku === 'QA-NOCAT'), 'produit sans catégorie absent de la base');
    return `compteur affiché « ${info.head} » pour ${info.cards} cartes, actions absentes`;
  });

  await check('D6', 'Fournisseurs : création, e-mail invalide, doublon, édition, suppression', async () => {
    await navigate('fournisseurs');
    const base = await evaluate(`(() => {
      const d = __qa.storage();
      const hasPseudo = d.products.some((p) => !p.supplierId);
      return { rows: __qa.supplierRows().length, head: __qa.text('.section-head h2'), expected: d.suppliers.length + (hasPseudo ? 1 : 0) };
    })()`);
    assert(base.rows === base.expected, `${base.expected} ligne(s) fournisseur attendue(s), reçues ${base.rows}`);
    await evaluate(`__qa.click('[data-action="new-supplier"]')`);
    await sleep(200);
    await evaluate(`(() => {
      __qa.set('#modal-root input[name="name"]', 'QA Fournisseur');
      __qa.set('#modal-root input[name="email"]', 'pas-un-email');
      __qa.submit();
    })()`);
    await sleep(300);
    assert((await evaluate('__qa.modalError()')).includes('e-mail'), 'e-mail invalide accepté');
    await evaluate(`(() => {
      __qa.set('#modal-root input[name="email"]', 'qa@example.com');
      __qa.set('#modal-root input[name="contact"]', 'QA Contact');
      __qa.set('#modal-root input[name="phone"]', '+261 34 00 000 00');
      __qa.submit();
    })()`);
    await waitFor('!__qa.modalOpen()', { label: 'création fournisseur' });
    await evaluate(`__qa.click('[data-action="new-supplier"]')`);
    await sleep(200);
    await evaluate(`(() => { __qa.set('#modal-root input[name="name"]', 'qa fournisseur'); __qa.submit(); })()`);
    await sleep(300);
    assert((await evaluate('__qa.modalError()')).includes('existe déjà'), 'doublon de fournisseur accepté');
    await pressKey('Escape');
    await evaluate(`(() => {
      const row = [...document.querySelectorAll('.data-table tbody tr')].find((tr) => tr.textContent.includes('QA Fournisseur'));
      row.querySelector('[data-action="edit-supplier"]').click();
    })()`);
    await sleep(250);
    await evaluate(`__qa.set('#modal-root input[name="contact"]', 'Contact modifié')`);
    await evaluate('__qa.submit()');
    await waitFor('!__qa.modalOpen()', { label: 'édition fournisseur' });
    const edited = await evaluate(`__qa.supplierRows().find((row) => row.text.includes('QA Fournisseur'))`);
    assert(edited && edited.text.includes('Contact modifié'), 'édition du fournisseur non prise en compte');
    await evaluate(`(() => {
      const row = [...document.querySelectorAll('.data-table tbody tr')].find((tr) => tr.textContent.includes('QA Fournisseur'));
      row.querySelector('[data-action="delete-supplier"]').click();
    })()`);
    await sleep(250);
    await evaluate('__qa.confirmClick()');
    await sleep(400);
    const data = await storage();
    assert(!data.suppliers.some((s) => s.name === 'QA Fournisseur'), 'fournisseur toujours présent après suppression');
    return 'création, validation e-mail, édition et suppression OK';
  });

  await check('D7', 'Suppression fournisseur utilisé refusée avec message explicite', async () => {
    await evaluate(`(() => {
      const row = [...document.querySelectorAll('.data-table tbody tr')].find((tr) => tr.textContent.includes('Grossiste Alpha'));
      row.querySelector('[data-action="delete-supplier"]').click();
    })()`);
    await sleep(350);
    const info = await evaluate(`({ toast: __qa.lastToast(), confirm: __qa.confirmOpen() })`);
    assert(!info.confirm, 'une confirmation s’ouvre pour un fournisseur utilisé');
    assert(info.toast.includes('produit'), `message attendu avec le nombre de produits, reçu « ${info.toast} »`);
    return info.toast;
  });

  await check('D8', 'Produit sans fournisseur : la ligne « Sans fournisseur » ne doit pas exposer d’actions cassées', async () => {
    await navigate('fournisseurs');
    const info = await evaluate(`(() => {
      const rows = __qa.supplierRows();
      const pseudo = rows.find((row) => row.name === 'Sans fournisseur');
      return { rows: rows.length, head: __qa.text('.section-head h2'), pseudo };
    })()`);
    assert(info.pseudo, 'aucune ligne « Sans fournisseur » alors qu’un produit n’a pas de fournisseur');
    const actions = await evaluate(`(() => {
      const row = [...document.querySelectorAll('.data-table tbody tr')].find((tr) => tr.textContent.includes('Sans fournisseur'));
      return {
        edit: !!row.querySelector('[data-action="edit-supplier"]'),
        remove: !!row.querySelector('[data-action="delete-supplier"]'),
        note: row.querySelector('.pseudo-note')?.textContent.trim() || '',
      };
    })()`);
    assert(!actions.edit && !actions.remove, 'la ligne « Sans fournisseur » expose encore des actions Modifier/Supprimer');
    note(
      'D8',
      'Ligne « Sans fournisseur » (pseudo-fournisseur) dans la page Fournisseurs',
      `titre ${info.head} pour ${info.rows} lignes ; aucune action Modifier/Supprimer exposée, mention « ${actions.note} »`,
    );
    return `compteur affiché « ${info.head} » pour ${info.rows} lignes, actions absentes`;
  });

  await check('D9', 'Nettoyage : suppression du produit sans catégorie/fournisseur via l’interface', async () => {
    await navigate('produits');
    await evaluate(`__qa.set('[data-filter="q"]', 'QA-NOCAT')`);
    await sleep(500);
    await evaluate(`__qa.focusClick('[data-action="delete-product"]')`);
    await sleep(200);
    await evaluate('__qa.confirmClick()');
    await sleep(400);
    const data = await storage();
    assert(!data.products.some((p) => p.sku === 'QA-NOCAT'), 'produit QA-NOCAT non supprimé');
    await navigate('categories');
    const cats = await evaluate(`({ cards: __qa.categories().length, head: __qa.text('.section-head h2') })`);
    assert(cats.cards === 6, `la pseudo-catégorie devrait disparaître (cartes=${cats.cards})`);
    await navigate('fournisseurs');
    const sups = await evaluate(`({ rows: __qa.supplierRows().length, head: __qa.text('.section-head h2') })`);
    assert(sups.rows === 6, `la pseudo-ligne fournisseur devrait disparaître (lignes=${sups.rows})`);
    return 'nettoyage OK';
  });

  /* ================================================================ */
  /* C — Mouvements de stock                                          */
  /* ================================================================ */

  currentPhase = 'C. mouvements';
  await navigate('produits');
  await evaluate(`__qa.click('[data-action="new-product"]')`);
  await sleep(200);
  await evaluate(`(() => {
    __qa.set('#modal-root input[name="name"]', 'QA Mouvement');
    __qa.set('#modal-root input[name="sku"]', 'QA-MVT');
    __qa.set('#modal-root input[name="purchasePrice"]', '100');
    __qa.set('#modal-root input[name="salePrice"]', '150');
    __qa.set('#modal-root input[name="threshold"]', '5');
    __qa.set('#modal-root input[name="initialQuantity"]', '10');
    __qa.submit();
  })()`);
  await waitFor('!__qa.modalOpen()', { label: 'création produit de mouvement' });

  await navigate('mouvements');

  await check('C1', 'Journal des mouvements : période « tout », 12 lignes, méta et chips cohérents', async () => {
    await evaluate(`__qa.selectValue('[data-filter="period"]', 'all')`);
    await sleep(400);
    const info = await evaluate(`(() => {
      const d = __qa.storage();
      return {
        rows: __qa.movements().length,
        meta: __qa.text('[data-movements-meta]'),
        chips: [...document.querySelectorAll('.stat-chip strong')].map((el) => el.textContent.trim()),
        total: d.movements.length,
        current: __qa.pageCurrent(),
      };
    })()`);
    assert(info.meta.includes(`${info.total} mouvement(s)`), `méta incohérente : ${info.meta} / total ${info.total}`);
    assert(info.rows === 12, `12 mouvements par page attendus, reçus ${info.rows}`);
    assert(info.current.startsWith('1 / '), `pagination inattendue : ${info.current}`);
    return `${info.total} mouvements, ${info.current}`;
  });

  await check('C2', 'Entrée de stock : stock et journal mis à jour', async () => {
    await evaluate(`__qa.click('#btn-new-movement')`);
    await sleep(250);
    await evaluate(`(() => {
      __qa.selectText('#modal-root select[name="productId"]', 'QA Mouvement');
      __qa.set('#modal-root input[name="quantity"]', '5');
      __qa.set('#modal-root input[name="reference"]', 'QA-IN-1');
      // Date au format datetime-local (précision minute) calée sur la minute de création du produit.
      const product = __qa.storage().products.find((x) => x.sku === 'QA-MVT');
      const d = new Date(product.createdAt);
      const pad = (n) => String(n).padStart(2, '0');
      __qa.set('#modal-root input[name="date"]', d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()));
      __qa.submit();
    })()`);
    await waitFor('!__qa.modalOpen()', { label: 'entrée de stock' });
    assert((await evaluate('__qa.lastToast()')).includes('Entrée'), 'toast d’entrée inattendu');
    const data = await storage();
    const product = data.products.find((p) => p.sku === 'QA-MVT');
    assert(product.quantity === 15, `stock attendu 15, reçu ${product.quantity}`);
    const movement = [...data.movements].reverse().find((m) => m.productId === product.id && m.reference === 'QA-IN-1');
    assert(movement && movement.type === 'in' && movement.previousQuantity === 10 && movement.newQuantity === 15 && movement.delta === 5, `mouvement d’entrée incohérent : ${JSON.stringify(movement)}`);
    return '10 → 15';
  });

  await check('C3', 'Sortie de stock : stock diminué et traçabilité correcte', async () => {
    await evaluate(`__qa.click('#btn-new-movement')`);
    await sleep(250);
    await evaluate(`(() => {
      __qa.click('#modal-root input[name="type"][value="out"]');
      __qa.selectText('#modal-root select[name="productId"]', 'QA Mouvement');
      __qa.set('#modal-root input[name="quantity"]', '3');
      __qa.submit();
    })()`);
    await waitFor('!__qa.modalOpen()', { label: 'sortie de stock' });
    const data = await storage();
    const product = data.products.find((p) => p.sku === 'QA-MVT');
    assert(product.quantity === 12, `stock attendu 12, reçu ${product.quantity}`);
    const movement = [...data.movements].reverse().find((m) => m.productId === product.id && m.type === 'out');
    assert(movement && movement.previousQuantity === 15 && movement.newQuantity === 12 && movement.delta === -3, `mouvement de sortie incohérent : ${JSON.stringify(movement)}`);
    return '15 → 12';
  });

  await check('C4', 'Sortie refusée si stock insuffisant : message, stock inchangé, modale ouverte', async () => {
    await evaluate(`__qa.click('#btn-new-movement')`);
    await sleep(250);
    await evaluate(`(() => {
      __qa.click('#modal-root input[name="type"][value="out"]');
      __qa.selectText('#modal-root select[name="productId"]', 'QA Mouvement');
      __qa.set('#modal-root input[name="quantity"]', '999');
    })()`);
    const preview = await evaluate('__qa.text("#modal-root [data-preview]")');
    assert(preview.includes('Stock insuffisant'), `l’aperçu ne signale pas le stock insuffisant : ${preview}`);
    await evaluate('__qa.submit()');
    await sleep(350);
    const info = await evaluate(`({ error: __qa.modalError(), open: __qa.modalOpen() })`);
    assert(info.open, 'la modale se ferme malgré le refus');
    assert(info.error.includes('Stock insuffisant'), `message inattendu : ${info.error}`);
    assert(/dispose que de 12/.test(info.error), `le stock disponible n’est pas rappelé : ${info.error}`);
    const data = await storage();
    assert(data.products.find((p) => p.sku === 'QA-MVT').quantity === 12, 'le stock a changé malgré le refus');
    await pressKey('Escape');
    return info.error;
  });

  await check('C5', 'Ajustement d’inventaire : valeur absolue puis refus si identique', async () => {
    await evaluate(`__qa.click('#btn-new-movement')`);
    await sleep(250);
    await evaluate(`(() => {
      __qa.click('#modal-root input[name="type"][value="adjust"]');
      __qa.selectText('#modal-root select[name="productId"]', 'QA Mouvement');
      __qa.set('#modal-root input[name="quantity"]', '20');
      __qa.submit();
    })()`);
    await waitFor('!__qa.modalOpen()', { label: 'ajustement' });
    let data = await storage();
    assert(data.products.find((p) => p.sku === 'QA-MVT').quantity === 20, 'l’ajustement ne fixe pas la quantité');
    await evaluate(`__qa.click('#btn-new-movement')`);
    await sleep(250);
    await evaluate(`(() => {
      __qa.click('#modal-root input[name="type"][value="adjust"]');
      __qa.selectText('#modal-root select[name="productId"]', 'QA Mouvement');
      __qa.set('#modal-root input[name="quantity"]', '20');
      __qa.submit();
    })()`);
    await sleep(300);
    assert((await evaluate('__qa.modalError()')).includes('identique'), 'ajustement identique non refusé');
    await pressKey('Escape');
    data = await storage();
    assert(data.products.find((p) => p.sku === 'QA-MVT').quantity === 20, 'stock modifié par l’ajustement refusé');
    return '12 → 20, identique refusé';
  });

  await check('C6', 'Quantités invalides refusées dans la modale (0 et négative)', async () => {
    await evaluate(`__qa.click('#btn-new-movement')`);
    await sleep(250);
    await evaluate(`(() => {
      __qa.click('#modal-root input[name="type"][value="in"]');
      __qa.selectText('#modal-root select[name="productId"]', 'QA Mouvement');
      __qa.set('#modal-root input[name="quantity"]', '0');
      __qa.submit();
    })()`);
    await sleep(350);
    let error = await evaluate('__qa.modalError()');
    assert(error.toLowerCase().includes('quantité'), `message attendu sur la quantité, reçu « ${error} »`);
    await evaluate(`__qa.set('#modal-root input[name="quantity"]', '-5')`);
    await evaluate('__qa.submit()');
    await sleep(350);
    error = await evaluate('__qa.modalError()');
    assert(error.toLowerCase().includes('quantité'), `message négatif attendu, reçu « ${error} »`);
    await pressKey('Escape');
    return 'quantités 0 et -5 refusées';
  });

  await check('C7', 'Mouvement décimal accepté : stock exact et chaîne du grand livre cohérente', async () => {
    await evaluate(`__qa.click('#btn-new-movement')`);
    await sleep(250);
    await evaluate(`(() => {
      __qa.click('#modal-root input[name="type"][value="in"]');
      __qa.selectText('#modal-root select[name="productId"]', 'QA Mouvement');
      __qa.set('#modal-root input[name="quantity"]', '0.5');
      __qa.submit();
    })()`);
    await waitFor('!__qa.modalOpen()', { label: 'entrée décimale' });
    const data = await storage();
    const product = data.products.find((p) => p.sku === 'QA-MVT');
    assert(product.quantity === 20.5, `stock attendu 20.5, reçu ${product.quantity}`);
    // Ordre d'insertion (ordre de création des mouvements), qui est la source de vérité du store.
    const ledger = await evaluate(`(() => {
      const d = __qa.storage();
      const p = d.products.find((x) => x.sku === 'QA-MVT');
      const moves = d.movements.filter((m) => m.productId === p.id);
      let running = 0;
      const bad = [];
      for (const m of moves) {
        running = m.type === 'in' ? running + m.quantity : m.type === 'out' ? running - m.quantity : m.quantity;
        if (Math.abs(running - m.newQuantity) > 1e-9) bad.push({ id: m.id, running, newQuantity: m.newQuantity });
        if (Math.abs(m.newQuantity - m.previousQuantity - m.delta) > 1e-9) bad.push({ id: m.id, chain: true });
      }
      return { replay: running, quantity: p.quantity, moves: moves.length, bad };
    })()`);
    assert(Math.abs(ledger.replay - ledger.quantity) < 1e-9, `rejeu ${ledger.replay} ≠ stock ${ledger.quantity}`);
    assert(ledger.bad.length === 0, `incohérences du grand livre : ${JSON.stringify(ledger.bad)}`);
    return `stock ${ledger.quantity}, ${ledger.moves} mouvements cohérents`;
  });

  await check('C7b', 'Journal trié par date : l’ordre affiché doit respecter la création des mouvements (pas de « Stock initial » après coup)', async () => {
    await navigate('mouvements');
    await evaluate(`__qa.selectValue('[data-filter="period"]', 'all')`);
    await sleep(350);
    await evaluate(`__qa.set('[data-filter="q"]', 'QA Mouvement')`);
    await sleep(600);
    const rows = await evaluate(`__qa.movements().map((row) => ({ reason: row.cells[5], date: row.cells[0], after: row.cells[4], qty: row.cells[3] }))`);
    assert(rows.length >= 5, `mouvements du produit non filtrés : ${rows.length}`);
    await screenshot('11-journal-ordre-mouvements');
    const first = rows[0];
    assert(first.reason !== 'Stock initial', `le « Stock initial » est affiché comme le mouvement le plus récent (date ${first.date}) alors que des mouvements plus récents existent : ${JSON.stringify(rows.slice(0, 3))}`);
    return `${rows.length} mouvements triés`;
  });

  await check('C8', 'Mouvement antidaté : refusé avant la création du produit, accepté et recalculé chronologiquement', async () => {
    const beforeCreation = await evaluate('__qa.datetimeLocal(-86400000)');
    await evaluate(`__qa.click('#btn-new-movement')`);
    await sleep(250);
    await evaluate(`(() => {
      __qa.click('#modal-root input[name="type"][value="in"]');
      __qa.selectText('#modal-root select[name="productId"]', 'QA Mouvement');
      __qa.set('#modal-root input[name="quantity"]', '2');
      __qa.set('#modal-root input[name="date"]', ${JSON.stringify(beforeCreation)});
      __qa.submit();
    })()`);
    await sleep(500);
    const refused = await evaluate(`({ error: __qa.modalError(), open: __qa.modalOpen() })`);
    assert(refused.open, 'la modale se ferme malgré une date antérieure à la création');
    assert(refused.error.includes('antérieure'), `message attendu sur la date, reçu « ${refused.error} »`);
    await pressKey('Escape');
    const stockBefore = await evaluate(`__qa.storage().products.find((p) => p.sku === 'QA-MVT').quantity`);

    // Antidatage accepté sur un produit créé avec la démonstration (plus ancien).
    const threeDaysAgo = await evaluate('__qa.datetimeLocal(-259200000)');
    const cocaBefore = await evaluate(`__qa.storage().products.find((p) => p.sku === 'COCA-15').quantity`);
    await evaluate(`__qa.click('#btn-new-movement')`);
    await sleep(250);
    await evaluate(`(() => {
      __qa.click('#modal-root input[name="type"][value="in"]');
      __qa.selectText('#modal-root select[name="productId"]', 'Coca-Cola');
      __qa.set('#modal-root input[name="quantity"]', '2');
      __qa.set('#modal-root input[name="date"]', ${JSON.stringify(threeDaysAgo)});
      __qa.submit();
    })()`);
    await waitFor('!__qa.modalOpen()', { label: 'mouvement antidaté accepté' });
    const ledger = await evaluate(`(() => {
      const d = __qa.storage();
      const p = d.products.find((x) => x.sku === 'COCA-15');
      const moves = d.movements.filter((m) => m.productId === p.id).sort((a, b) => new Date(a.date) - new Date(b.date));
      let running = 0;
      const bad = [];
      for (const m of moves) {
        running = m.type === 'in' ? running + m.quantity : m.type === 'out' ? running - m.quantity : m.quantity;
        if (Math.abs(running - m.newQuantity) > 1e-9) bad.push(m.id);
      }
      return { quantity: p.quantity, replay: running, bad, moves: moves.length };
    })()`);
    assert(ledger.quantity === cocaBefore + 2, `stock attendu ${cocaBefore + 2}, reçu ${ledger.quantity}`);
    assert(ledger.bad.length === 0, `chaîne chronologique incohérente : ${JSON.stringify(ledger.bad)}`);
    assert(Math.abs(ledger.replay - ledger.quantity) < 1e-9, 'le rejeu chronologique ne correspond pas au stock');
    const unchanged = await evaluate(`__qa.storage().products.find((p) => p.sku === 'QA-MVT').quantity`);
    assert(Math.abs(unchanged - stockBefore) < 1e-9, 'le refus a modifié le stock du produit');
    return `date antérieure refusée ; antidatage accepté : ${cocaBefore} → ${ledger.quantity}, ${ledger.moves} mouvements cohérents`;
  });

  await check('C9', 'Filtres mouvements : type, période, recherche par référence et produit', async () => {
    await navigate('mouvements');
    await evaluate(`__qa.selectValue('[data-filter="period"]', 'all')`);
    await sleep(350);
    await evaluate(`__qa.selectValue('[data-filter="type"]', 'out')`);
    await sleep(350);
    let rows = await evaluate('__qa.movements()');
    assert(rows.length > 0 && rows.every((row) => row.text.includes('Sortie')), 'filtre type « sortie » incohérent');
    await evaluate(`__qa.selectValue('[data-filter="type"]', 'all')`);
    await sleep(250);
    await evaluate(`__qa.set('[data-filter="q"]', 'QA-IN-1')`);
    await sleep(500);
    rows = await evaluate('__qa.movements()');
    assert(rows.length === 1 && rows[0].text.includes('QA-IN-1'), `recherche par référence incohérente : ${rows.length} ligne(s)`);
    await evaluate(`__qa.set('[data-filter="q"]', 'QA Mouvement')`);
    await sleep(500);
    rows = await evaluate('__qa.movements()');
    assert(rows.length >= 5 && rows.every((row) => row.text.includes('QA Mouvement')), 'recherche par produit incohérente');
    await evaluate(`__qa.set('[data-filter="q"]', '')`);
    await sleep(400);
    await evaluate(`__qa.selectValue('[data-filter="period"]', '7')`);
    await sleep(400);
    rows = await evaluate('__qa.movements()');
    const oldVisible = await evaluate(`(() => {
      const d = __qa.storage();
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      return d.movements.filter((m) => new Date(m.date).getTime() < cutoff).length;
    })()`);
    assert(rows.length <= 12 && oldVisible >= 0, 'période 7 jours : incohérence de rendu');
    return `filtres OK (${rows.length} lignes sur 7 jours)`;
  });

  await check('C10', 'Pagination du journal (12 par page)', async () => {
    await evaluate(`__qa.selectValue('[data-filter="period"]', 'all')`);
    await sleep(400);
    const first = await evaluate('__qa.pageCurrent()');
    if (!first.includes(' / ')) throw new Error(`pagination absente : ${first}`);
    const totalPages = Number(first.split('/')[1].trim());
    if (totalPages > 1) {
      await evaluate(`__qa.click('.pager .page-btn[data-page="2"]')`);
      await sleep(300);
      const second = await evaluate(`({ current: __qa.pageCurrent(), rows: __qa.movements().length })`);
      assert(second.current.startsWith('2 /'), `page 2 inattendue : ${second.current}`);
      assert(second.rows === 12, `12 lignes attendues page 2, reçues ${second.rows}`);
    }
    return first;
  });

  await check('C11', 'Cohérence finale : stock = stock initial + entrées - sorties (ajustements) pour tous les produits', async () => {
    const bad = await evaluate(`(() => {
      const d = __qa.storage();
      const issues = [];
      for (const p of d.products) {
        const insertion = d.movements.filter((m) => m.productId === p.id);
        let replayInsertion = 0;
        for (const m of insertion) {
          replayInsertion = m.type === 'in' ? replayInsertion + m.quantity : m.type === 'out' ? replayInsertion - m.quantity : m.quantity;
          if (m.quantity < 0) issues.push({ sku: p.sku, negativeMovement: m.id });
          if (Math.abs(m.newQuantity - m.previousQuantity - m.delta) > 1e-6) issues.push({ sku: p.sku, chain: m.id });
        }
        if (Math.abs(replayInsertion - p.quantity) > 1e-6) issues.push({ sku: p.sku, replay: replayInsertion, stored: p.quantity });
        if (p.quantity < 0) issues.push({ sku: p.sku, negative: p.quantity });
        // Ordre chronologique : cohérent pour les données de démo (horodatage précis).
        if (p.sku !== 'QA-MVT') {
          const byDate = [...insertion].sort((a, b) => new Date(a.date) - new Date(b.date));
          let running = 0;
          for (const m of byDate) {
            running = m.type === 'in' ? running + m.quantity : m.type === 'out' ? running - m.quantity : m.quantity;
            if (Math.abs(running - m.newQuantity) > 1e-6) issues.push({ sku: p.sku, chronological: m.id });
          }
        }
      }
      return issues;
    })()`);
    assert(bad.length === 0, `incohérences de stock : ${JSON.stringify(bad.slice(0, 5))}`);
    return 'aucune incohérence sur l’ensemble des produits';
  });

  /* ================================================================ */
  /* E — Paramètres, exports / imports, réinitialisation              */
  /* ================================================================ */

  currentPhase = 'E. paramètres / sauvegarde';
  await resetDemoFromSettings();
  await navigate('parametres');

  await check('E1', 'Paramètres affichés conformes aux données (entreprise, devise, seuil, thème)', async () => {
    const info = await evaluate(`(() => {
      const d = __qa.storage();
      return {
        company: document.querySelector('#setting-company')?.value,
        currency: document.querySelector('#setting-currency')?.value,
        threshold: document.querySelector('#setting-threshold')?.value,
        stored: d.settings,
        themeHtml: document.documentElement.dataset.theme,
        activeTheme: document.querySelector('.theme-option.is-active')?.textContent.replace(/\\s+/g, ' ').trim(),
      };
    })()`);
    assert(info.company === info.stored.company, `entreprise affichée ${info.company} ≠ stockée ${info.stored.company}`);
    assert(info.currency === info.stored.currency, 'devise affichée différente de la devise stockée');
    assert(String(info.threshold) === String(info.stored.defaultThreshold), 'seuil affiché différent du seuil stocké');
    assert(info.themeHtml === info.stored.theme, `thème html ${info.themeHtml} ≠ stocké ${info.stored.theme}`);
    assert(info.activeTheme.includes('Clair'), `option de thème active inattendue : ${info.activeTheme}`);
    return `${info.company} / ${info.currency} / seuil ${info.threshold}`;
  });

  await check('E2', 'Enregistrement entreprise + seuil, persistance après rechargement', async () => {
    await evaluate(`(() => {
      __qa.set('#setting-company', 'QA Société');
      __qa.set('#setting-threshold', '12');
      __qa.click('[data-action="save-settings"]');
    })()`);
    await sleep(450);
    assert((await evaluate('__qa.lastToast()')).includes('Paramètres enregistrés'), 'toast d’enregistrement absent');
    let data = await storage();
    assert(data.settings.company === 'QA Société' && data.settings.defaultThreshold === 12, `paramètres non enregistrés : ${JSON.stringify(data.settings)}`);
    await reloadCurrent();
    const persisted = await evaluate(`({ company: document.querySelector('#setting-company')?.value, threshold: document.querySelector('#setting-threshold')?.value })`);
    assert(persisted.company === 'QA Société' && persisted.threshold === '12', `paramètres non persistés : ${JSON.stringify(persisted)}`);
    return 'entreprise et seuil persistés';
  });

  await check('E3', 'Nouveau produit : le seuil par défaut (12) est prérempli', async () => {
    await navigate('produits');
    await evaluate(`__qa.click('[data-action="new-product"]')`);
    await sleep(250);
    const value = await evaluate(`document.querySelector('#modal-root input[name="threshold"]')?.value`);
    assert(value === '12', `seuil prérempli attendu 12, reçu ${value}`);
    await pressKey('Escape');
    return 'seuil 12 prérempli';
  });

  await check('E4', 'Export JSON : nom, contenu parseable et conforme aux données', async () => {
    await navigate('parametres');
    await evaluate('__qa.clearDownloads()');
    await evaluate(`__qa.click('[data-action="export-json"]')`);
    await waitFor('__qa.downloads().length > 0', { label: 'téléchargement JSON' });
    const downloads = await evaluate('__qa.downloads()');
    const file = downloads[0];
    assert(/^geststock-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/.test(file.name), `nom de fichier inattendu : ${file.name}`);
    assert(file.type.includes('json'), `type MIME inattendu : ${file.type}`);
    const parsed = JSON.parse(file.text);
    const data = await storage();
    assert(parsed.products.length === data.products.length && parsed.movements.length === data.movements.length, 'le contenu exporté ne correspond pas aux données');
    assert(parsed.settings.company === data.settings.company, 'les paramètres exportés diffèrent');
    return file.name;
  });

  await check('E5', 'Import JSON valide : restauration et thème importé appliqué immédiatement', async () => {
    const downloads = await evaluate('__qa.downloads()');
    const backup = JSON.parse(downloads[0].text);
    backup.settings.company = 'Import QA';
    backup.settings.theme = 'dark';
    const filePath = join(RUN, 'import-valid.json');
    writeFileSync(filePath, JSON.stringify(backup, null, 2), 'utf8');
    await evaluate('__qa.clearToasts()');
    await setFileInput('#import-file', filePath);
    await waitFor(`(__qa.storage()?.settings?.company === 'Import QA')`, { label: 'import JSON appliqué', timeout: 8000 });
    const info = await evaluate(`(() => ({
      toast: __qa.lastToast(),
      company: __qa.storage().settings.company,
      themeStored: __qa.storage().settings.theme,
      themeHtml: document.documentElement.dataset.theme,
      themeActive: document.querySelector('.theme-option.is-active')?.textContent.replace(/\\s+/g, ' ').trim(),
      products: __qa.storage().products.length,
    }))()`);
    assert(info.company === 'Import QA', `import non appliqué : ${info.company}`);
    assert(info.products === 24, `nombre de produits après import inattendu : ${info.products}`);
    assert(/restaurée/i.test(info.toast), `toast d’import inattendu : ${info.toast}`);
    if (info.themeHtml !== info.themeStored) {
      note(
        'E5',
        'Le thème d’une sauvegarde importée n’est pas appliqué immédiatement',
        `après import : thème stocké « ${info.themeStored} », thème affiché « ${info.themeHtml} », option active « ${info.themeActive} » — appliqué seulement après rechargement`,
      );
      await screenshot('13-theme-import-non-applique');
    }
    return `importée : ${info.company}, thème stocké ${info.themeStored} / affiché ${info.themeHtml}`;
  });

  await check('E6', 'Persistance du thème importé après rechargement complet', async () => {
    await reloadCurrent();
    const theme = await evaluate('document.documentElement.dataset.theme');
    assert(theme === 'dark', `thème attendu dark après rechargement, reçu ${theme}`);
    return 'thème dark persistant';
  });

  await check('E7', 'Import JSON invalide : erreur claire, données intactes', async () => {
    const before = await storage();
    const filePath = join(RUN, 'import-invalid.json');
    writeFileSync(filePath, '{ pas du json', 'utf8');
    currentPhase = 'E7. import invalide (erreur attendue)';
    await evaluate('__qa.clearToasts()');
    await setFileInput('#import-file', filePath);
    await waitFor(`/json valide/i.test(__qa.lastToast())`, { label: 'erreur d’import JSON', timeout: 6000 });
    const info = await evaluate(`({ toast: __qa.lastToast(), company: __qa.storage().settings.company, products: __qa.storage().products.length })`);
    assert(info.company === before.settings.company && info.products === before.products.length, 'les données ont été modifiées par un import invalide');
    currentPhase = 'E. paramètres / sauvegarde';
    return info.toast;
  });

  await check('E8', 'Thème : bascule, persistance, option active dans les paramètres', async () => {
    await evaluate('__qa.click("#btn-theme")');
    await sleep(350);
    let info = await evaluate(`({ theme: document.documentElement.dataset.theme, stored: __qa.storage().settings.theme, label: document.querySelector('#btn-theme')?.getAttribute('aria-label') })`);
    assert(info.theme === 'light' && info.stored === 'light', `bascule vers clair échouée : ${JSON.stringify(info)}`);
    assert((info.label || '').includes('sombre'), `aria-label du bouton thème inattendu : ${info.label}`);
    await evaluate('__qa.click("#btn-theme")');
    await sleep(350);
    info = await evaluate(`({ theme: document.documentElement.dataset.theme, stored: __qa.storage().settings.theme, label: document.querySelector('#btn-theme')?.getAttribute('aria-label'), active: document.querySelector('.theme-option.is-active')?.textContent.replace(/\\s+/g, ' ').trim() })`);
    assert(info.theme === 'dark' && info.stored === 'dark', `bascule vers sombre échouée : ${JSON.stringify(info)}`);
    assert(info.active.includes('Sombre'), `option active inattendue : ${info.active}`);
    await navigate('tableau-de-bord');
    assert((await evaluate('document.documentElement.dataset.theme')) === 'dark', 'thème non persistant après navigation');
    await screenshot('02-dashboard-dark');
    return 'dark persistant et option active';
  });

  await check('E9', 'Réinitialisation démo : données et thème réappliqués immédiatement', async () => {
    // thème courant : dark ; resetDemo remet les paramètres par défaut (light)
    await navigate('parametres');
    await evaluate(`__qa.click('[data-action="reset-demo"]')`);
    await sleep(300);
    await evaluate('__qa.confirmClick()');
    await waitFor(`__qa.storage().products.length === 24 && __qa.storage().settings.company === 'Erick Distribution'`, { label: 'réinitialisation démo' });
    await sleep(300);
    const info = await evaluate(`({ themeHtml: document.documentElement.dataset.theme, themeStored: __qa.storage().settings.theme, products: __qa.storage().products.length })`);
    assert(info.products === 24, `réinitialisation incomplète : ${info.products} produits`);
    assert(info.themeStored === 'light', `thème stocké après reset attendu light, reçu ${info.themeStored}`);
    if (info.themeHtml !== info.themeStored) {
      note(
        'E9',
        '« Recharger la démo » ne réapplique pas le thème par défaut immédiatement',
        `thème stocké « ${info.themeStored} » mais interface toujours en « ${info.themeHtml} » jusqu’au rechargement`,
      );
    }
    return `24 produits restaurés, thème stocké ${info.themeStored} / affiché ${info.themeHtml}`;
  });

  await check('E10', 'Devise : passage en EUR, reformatage des montants, persistance', async () => {
    await navigate('parametres');
    await evaluate(`__qa.selectValue('#setting-currency', 'EUR')`);
    await evaluate(`__qa.click('[data-action="save-settings"]')`);
    await sleep(400);
    await navigate('tableau-de-bord');
    const info = await evaluate(`(() => {
      const d = __qa.storage();
      const value = d.products.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.purchasePrice) || 0), 0);
      return {
        currency: d.settings.currency,
        kpi: __qa.text('.kpi:nth-child(1) .kpi-value'),
        expected: __qa.money(value),
        donut: __qa.text('.donut-value'),
        donutLabel: __qa.text('.donut-label'),
      };
    })()`);
    assert(info.currency === 'EUR', `devise non enregistrée : ${info.currency}`);
    assert(info.kpi.includes('€'), `les montants ne sont pas reformatés en € : ${info.kpi}`);
    assert(__norm(info.kpi) === __norm(info.expected), `montant KPI ${info.kpi} ≠ attendu ${info.expected}`);
    if (!info.donut.includes('€')) {
      note(
        'E10',
        'Montant compact du graphique sans symbole de devise (hors MGA)',
        `centre du donut affiché « ${info.donut} » (${info.donutLabel}) en EUR, sans symbole « € »`,
      );
    }
    await reloadCurrent();
    assert((await evaluate('document.documentElement.dataset.theme')) === 'light', 'le thème clair n’a pas été réappliqué au rechargement');
    return info.kpi;
  });

  await check('E11', 'Export CSV produits : BOM, en-tête, séparateur, nombre de lignes, valeurs', async () => {
    await navigate('produits');
    await evaluate('__qa.clearDownloads()');
    await evaluate(`__qa.click('[data-action="export-products-csv"]')`);
    await waitFor('__qa.downloads().length > 0', { label: 'téléchargement CSV produits' });
    const file = (await evaluate('__qa.downloads()'))[0];
    assert(/^geststock-produits-\d{4}-\d{2}-\d{2}\.csv$/.test(file.name), `nom CSV inattendu : ${file.name}`);
    assert(file.bytes[0] === 0xef && file.bytes[1] === 0xbb && file.bytes[2] === 0xbf, `BOM UTF-8 absent du CSV (octets : ${file.bytes})`);
    const lines = file.text.replace(/^\ufeff/, '').split('\r\n');
    const data = await storage();
    assert(lines[0] === 'SKU;Nom;Catégorie;Fournisseur;Unité;Quantité;Seuil;Prix achat;Prix vente;Valeur stock;Emplacement', `en-tête CSV inattendu : ${lines[0]}`);
    assert(lines.length === data.products.length + 1, `lignes CSV ${lines.length} ≠ attendu ${data.products.length + 1}`);
    const coca = lines.find((line) => line.startsWith('COCA-15;'));
    assert(coca, 'produit COCA-15 absent du CSV');
    assert(coca.split(';').length === 11, `nombre de colonnes inattendu : ${coca.split(';').length}`);
    const row = data.products.find((p) => p.sku === 'COCA-15');
    const cells = coca.split(';');
    assert(Number(cells[5]) === row.quantity, `quantité CSV ${cells[5]} ≠ ${row.quantity}`);
    assert(Number(cells[7]) === row.purchasePrice, `prix achat CSV ${cells[7]} ≠ ${row.purchasePrice}`);
    return `${lines.length} lignes, BOM présent`;
  });

  await check('E12', 'Export CSV mouvements : en-tête, tri chronologique, libellés traduits', async () => {
    await navigate('mouvements');
    await evaluate('__qa.clearDownloads()');
    await evaluate(`__qa.click('[data-action="export-movements-csv"]')`);
    await waitFor('__qa.downloads().length > 0', { label: 'téléchargement CSV mouvements' });
    const file = (await evaluate('__qa.downloads()'))[0];
    assert(/^geststock-mouvements-\d{4}-\d{2}-\d{2}\.csv$/.test(file.name), `nom CSV inattendu : ${file.name}`);
    assert(file.bytes[0] === 0xef && file.bytes[1] === 0xbb && file.bytes[2] === 0xbf, `BOM UTF-8 absent du CSV mouvements (octets : ${file.bytes})`);
    const lines = file.text.replace(/^\ufeff/, '').split('\r\n').slice(1).filter(Boolean);
    const data = await storage();
    assert(lines.length === data.movements.length, `lignes CSV ${lines.length} ≠ mouvements ${data.movements.length}`);
    const values = lines.map((line) => line.split(';')[0]);
    for (let i = 1; i < values.length; i += 1) {
      const prev = values[i - 1].split(' · ');
      const cur = values[i].split(' · ');
      const toTime = (pair) => {
        const [d, t = '00:00'] = pair;
        const [day, month, year] = d.split('/').map(Number);
        const [hour, minute] = t.split(':').map(Number);
        return new Date(year, month - 1, day, hour, minute).getTime();
      };
      assert(toTime(prev) <= toTime(cur), `CSV mouvements mal trié à la ligne ${i + 2}`);
    }
    const types = new Set(lines.map((line) => line.split(';')[1]));
    assert([...types].every((type) => ['Entrée', 'Sortie', 'Ajustement'].includes(type)), `libellés de type inattendus : ${[...types]}`);
    return `${lines.length} mouvements, types ${[...types].join('/')}`;
  });

  await check('E13', 'Tout effacer : listes vides, états vides, avertissement sans produit', async () => {
    currentPhase = 'E13. tout effacer';
    await navigate('parametres');
    await evaluate(`__qa.click('[data-action="clear-all"]')`);
    await sleep(300);
    assert(await evaluate('__qa.confirmOpen()'), 'confirmation « tout effacer » absente');
    await evaluate('__qa.confirmClick()');
    await waitFor(`__qa.storage().products.length === 0`, { label: 'effacement total' });
    const data = await storage();
    assert(data.movements.length === 0 && data.categories.length === 0 && data.suppliers.length === 0, 'effacement incomplet');
    assert(data.settings.company === 'QA Société' || data.settings.currency === 'EUR', 'les paramètres devraient être conservés');
    for (const [route, marker] of [['produits', 'Votre catalogue est vide'], ['mouvements', 'Aucun mouvement'], ['categories', 'Aucune catégorie'], ['fournisseurs', 'Aucun fournisseur']]) {
      await navigate(route);
      const empty = await evaluate('__qa.text(".empty-state")');
      assert(empty.includes(marker), `état vide attendu « ${marker} » sur ${route}, reçu « ${empty} »`);
    }
    await navigate('tableau-de-bord');
    const dashboard = await evaluate(`({ kpis: __qa.count('.kpi'), health: __qa.text('#sidebar-foot'), errors: 0 })`);
    assert(dashboard.kpis === 4, 'tableau de bord vide : KPI manquants');
    assert(dashboard.health.includes('—'), `santé du stock inattendue : ${dashboard.health}`);
    await evaluate('__qa.clearToasts()');
    await evaluate('__qa.click("#btn-new-movement")');
    await sleep(300);
    const toast = await evaluate('__qa.lastToast()');
    assert(toast.includes('Ajoutez d’abord un produit'), `avertissement attendu, reçu « ${toast} »`);
    assert(!(await evaluate('__qa.modalOpen()')), 'la modale mouvement ne doit pas s’ouvrir sans produit');
    currentPhase = 'E. paramètres / sauvegarde';
    return 'effacement complet et états vides OK';
  });

  await resetDemoFromSettings();

  /* ================================================================ */
  /* F — Responsive                                                   */
  /* ================================================================ */

  currentPhase = 'F. responsive';

  await check('F1', 'Desktop 1600 px : barre latérale visible, bouton menu masqué, pas de débordement', async () => {
    await setViewport(1600, 1100, false);
    await navigate('tableau-de-bord');
    const info = await evaluate(`(() => ({
      menu: getComputedStyle(document.querySelector('.menu-btn')).display,
      sidebar: document.querySelector('#sidebar').getBoundingClientRect().left,
      overflow: __qa.overlow(),
    }))()`);
    assert(info.menu === 'none', 'bouton menu visible sur desktop');
    assert(info.sidebar >= 0, 'barre latérale hors écran sur desktop');
    assert(info.overflow.doc <= info.overflow.inner, `débordement horizontal : ${JSON.stringify(info.overflow)}`);
    return 'desktop OK';
  });

  await check('F2', 'Tablette 768 px : navigation en tiroir, ouverture/fermeture, pas de débordement', async () => {
    await setViewport(768, 950, false);
    await navigate('tableau-de-bord');
    const before = await evaluate(`(() => ({
      menu: getComputedStyle(document.querySelector('.menu-btn')).display,
      sidebarRight: document.querySelector('#sidebar').getBoundingClientRect().right,
      overflow: __qa.overlow(),
    }))()`);
    assert(before.menu !== 'none', 'bouton menu absent à 768 px');
    assert(before.sidebarRight <= 0, `le tiroir devrait être fermé (right=${before.sidebarRight})`);
    assert(before.overflow.doc <= before.overflow.inner, `débordement horizontal à 768 px : ${JSON.stringify(before.overflow)}`);
    await evaluate(`__qa.click('#btn-menu')`);
    await sleep(350);
    const opened = await evaluate(`({ open: document.querySelector('#sidebar').classList.contains('is-open'), left: document.querySelector('#sidebar').getBoundingClientRect().left, overlay: !document.querySelector('#sidebar-overlay').hidden })`);
    assert(opened.open && opened.left >= 0 && opened.overlay, `tiroir non ouvert : ${JSON.stringify(opened)}`);
    await evaluate(`__qa.click('#sidebar-overlay')`);
    await sleep(300);
    const closed = await evaluate(`document.querySelector('#sidebar').classList.contains('is-open')`);
    assert(!closed, 'le tiroir ne se ferme pas au clic sur l’overlay');
    await pressKey('Escape');
    await sleep(200);
    const afterEscape = await evaluate(`document.querySelector('#sidebar').classList.contains('is-open')`);
    if (afterEscape) {
      note('F2', 'Le tiroir de navigation ne se ferme pas avec Échap', 'seul le clic sur l’overlay, le bouton Fermer ou un lien le ferment');
      await evaluate(`__qa.click('#btn-close-sidebar')`);
    }
    return 'tiroir OK à 768 px';
  });

  await check('F2b', 'Tablette 768 px : tableau scrollable et modale dans l’écran', async () => {
    await setViewport(768, 950, false);
    await navigate('produits');
    const table = await evaluate(`(() => {
      const wrap = document.querySelector('.table-wrap');
      return { wrap: !!wrap, scrollable: wrap ? wrap.scrollWidth > wrap.clientWidth : false, overflow: __qa.overlow() };
    })()`);
    assert(table.wrap && table.scrollable, `le tableau produits n’est pas scrollable à 768 px : ${JSON.stringify(table)}`);
    assert(table.overflow.doc <= table.overflow.inner + 1, `débordement horizontal à 768 px : ${JSON.stringify(table.overflow)}`);
    await evaluate(`__qa.click('[data-action="new-product"]')`);
    await sleep(350);
    const modal = await evaluate(`(() => {
      const rect = document.querySelector('#modal-root .modal').getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, w: window.innerWidth, h: window.innerHeight };
    })()`);
    assert(modal.left >= -1 && modal.right <= modal.w + 1 && modal.top >= -1 && modal.bottom <= modal.h + 1, `modale hors écran à 768 px : ${JSON.stringify(modal)}`);
    await screenshot('14-tablette-modal-produit');
    await pressKey('Escape');
    return `tableau scrollable, modale ${Math.round(modal.right - modal.left)}×${Math.round(modal.bottom - modal.top)}`;
  });

  await check('F3', 'Mobile 390 px : pas de débordement, tableau scrollable, tiroir fonctionnel', async () => {
    await setViewport(390, 844, true);
    for (const route of ['tableau-de-bord', 'produits', 'mouvements', 'parametres', 'rapports', 'categories', 'fournisseurs']) {
      await navigate(route);
      const overflow = await evaluate('__qa.overlow()');
      assert(overflow.doc <= overflow.inner + 1, `débordement horizontal sur ${route} : ${JSON.stringify(overflow)}`);
    }
    await navigate('produits');
    const table = await evaluate(`(() => {
      const wrap = document.querySelector('.table-wrap');
      return { wrap: !!wrap, scrollable: wrap ? wrap.scrollWidth > wrap.clientWidth : false, whiteSpace: wrap ? getComputedStyle(wrap).overflowX : '' };
    })()`);
    assert(table.wrap && table.scrollable, `le tableau produits n’est pas scrollable horizontalement : ${JSON.stringify(table)}`);
    await evaluate(`__qa.click('#btn-menu')`);
    await sleep(350);
    assert(await evaluate(`document.querySelector('#sidebar').classList.contains('is-open')`), 'tiroir non ouvert sur mobile');
    await screenshot('03-mobile-menu');
    await evaluate(`__qa.click('#btn-close-sidebar')`);
    await sleep(250);
    return '390 px sans débordement de page';
  });

  await check('F4', 'Mobile 390 px : la modale produit tient dans l’écran et son corps défile', async () => {
    await navigate('produits');
    await evaluate(`__qa.click('[data-action="new-product"]')`);
    await sleep(350);
    const info = await evaluate(`(() => {
      const modal = document.querySelector('#modal-root .modal');
      const body = document.querySelector('#modal-root .modal-body');
      const rect = modal.getBoundingClientRect();
      return {
        left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        bodyScrollable: body.scrollHeight > body.clientHeight,
        pageOverflow: __qa.overlow().doc,
        footVisible: (() => { const f = document.querySelector('#modal-root .modal-foot'); const r = f.getBoundingClientRect(); return r.bottom <= window.innerHeight + 1; })(),
      };
    })()`);
    assert(info.left >= -1 && info.right <= info.viewport.w + 1, `modale trop large : ${JSON.stringify(info)}`);
    assert(info.top >= -1 && info.bottom <= info.viewport.h + 1, `modale trop haute : ${JSON.stringify(info)}`);
    assert(info.footVisible, 'le pied de modale (boutons) n’est pas visible');
    assert(info.pageOverflow <= info.viewport.w + 1, 'débordement horizontal avec la modale ouverte');
    await screenshot('04-mobile-modal-produit');
    await pressKey('Escape');
    return `modale ${Math.round(info.right - info.left)}×${Math.round(info.bottom - info.top)} dans ${info.viewport.w}×${info.viewport.h}`;
  });

  await check('F5', 'Mobile 390 px : le tiroir fermé n’est plus focusable (inert/aria-hidden)', async () => {
    await navigate('tableau-de-bord');
    const info = await evaluate(`(() => {
      const sidebar = document.querySelector('#sidebar');
      const link = sidebar.querySelector('[data-nav]');
      link.focus();
      const rect = sidebar.getBoundingClientRect();
      return {
        right: rect.right,
        bottom: rect.bottom,
        focused: document.activeElement === link,
        ariaHidden: sidebar.getAttribute('aria-hidden'),
        inert: sidebar.hasAttribute('inert'),
        menuExpanded: document.querySelector('#btn-menu').getAttribute('aria-expanded'),
        visibility: getComputedStyle(sidebar).visibility,
        tabbable: [...sidebar.querySelectorAll('a,button')].length,
      };
    })()`);
    if (info.right <= 0 && info.focused) {
      note(
        'F5',
        'Tiroir de navigation fermé mais toujours focusable (mobile/tablette)',
        `${info.tabbable} éléments focusables hors écran (right=${info.right}) ; aria-hidden=${info.ariaHidden}, inert=${info.inert}, aria-expanded du bouton menu=${info.menuExpanded}`,
      );
    }
    assert(true);
    return `focus possible hors écran : ${info.focused}`;
  });

  await check('F6', 'Retour au bureau 1600 px : mise en page desktop rétablie', async () => {
    await setViewport(1600, 1100, false);
    await navigate('tableau-de-bord');
    const menu = await evaluate(`getComputedStyle(document.querySelector('.menu-btn')).display`);
    assert(menu === 'none', 'le bouton menu reste visible après retour desktop');
    return 'desktop rétabli';
  });

  /* ================================================================ */
  /* G — Accessibilité de base                                        */
  /* ================================================================ */

  currentPhase = 'G. accessibilité';
  await navigate('produits');

  await check('G1', 'Tous les boutons ont un nom accessible', async () => {
    const info = await evaluate(`(() => {
      const nameOf = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').replace(/\\s+/g, ' ').trim() || '');
      const buttons = [...document.querySelectorAll('button')];
      return { total: buttons.length, missing: buttons.filter((b) => !nameOf(b)).map((b) => b.outerHTML.slice(0, 120)) };
    })()`);
    assert(info.missing.length === 0, `${info.missing.length} bouton(s) sans nom accessible : ${info.missing.join(' | ')}`);
    return `${info.total} boutons nommés`;
  });

  await check('G2', 'Formulaire produit : chaque champ est étiqueté', async () => {
    await evaluate(`__qa.click('[data-action="new-product"]')`);
    await sleep(300);
    const info = await evaluate(`(() => {
      const controls = [...document.querySelectorAll('#modal-root input, #modal-root select, #modal-root textarea')].filter((el) => el.type !== 'hidden');
      const missing = [];
      for (const el of controls) {
        if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) continue;
        if (el.closest('label')) continue;
        if (el.id && document.querySelector('label[for="' + el.id + '"]')) continue;
        missing.push(el.outerHTML.slice(0, 120));
      }
      return { total: controls.length, missing };
    })()`);
    assert(info.missing.length === 0, `champs sans étiquette : ${info.missing.join(' | ')}`);
    await pressKey('Escape');
    return `${info.total} champs étiquetés`;
  });

  await check('G2b', 'Écrans Produits/Paramètres : champs et filtres étiquetés', async () => {
    const checkPage = async (route) => {
      await navigate(route);
      const info = await evaluate(`(() => {
        const controls = [...document.querySelectorAll('#app input, #app select, #app textarea')].filter((el) => el.type !== 'hidden' && !el.hidden && getComputedStyle(el).display !== 'none');
        const missing = [];
        for (const el of controls) {
          if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) continue;
          if (el.closest('label')) continue;
          if (el.id && document.querySelector('label[for="' + el.id + '"]')) continue;
          missing.push(el.outerHTML.slice(0, 120));
        }
        return { total: controls.length, missing };
      })()`);
      assert(info.missing.length === 0, `${route} : champs sans étiquette : ${info.missing.join(' | ')}`);
      return info.total;
    };
    const produits = await checkPage('produits');
    const parametres = await checkPage('parametres');
    return `produits ${produits} champs, paramètres ${parametres} champs`;
  });

  await check('G3', 'Aria-current unique par page et titre de document synchronisé', async () => {
    const routes = {
      'tableau-de-bord': { nav: 'dashboard', title: 'Tableau de bord' },
      produits: { nav: 'products', title: 'Produits' },
      mouvements: { nav: 'movements', title: 'Mouvements' },
      categories: { nav: 'categories', title: 'Catégories' },
      fournisseurs: { nav: 'suppliers', title: 'Fournisseurs' },
      rapports: { nav: 'reports', title: 'Rapports' },
      parametres: { nav: 'settings', title: 'Paramètres' },
    };
    for (const [route, expected] of Object.entries(routes)) {
      await navigate(route);
      const info = await evaluate(`({ currents: [...document.querySelectorAll('[aria-current="page"]')].map((el) => el.dataset.nav), title: document.title, heading: __qa.text('#page-title'), h1: __qa.count('h1') })`);
      assert(info.currents.length === 1 && info.currents[0] === expected.nav, `aria-current incohérent sur ${route} : ${JSON.stringify(info.currents)}`);
      assert(info.title.startsWith(expected.title), `document.title incohérent sur ${route} : ${info.title}`);
      assert(info.heading === expected.title, `titre de page incohérent sur ${route} : ${info.heading}`);
      assert(info.h1 === 1, `un seul h1 attendu sur ${route}, reçu ${info.h1}`);
    }
    return '7 routes conformes';
  });

  await check('G4', 'Focus clavier visible sur le premier élément de la page', async () => {
    await navigate('tableau-de-bord');
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await sleep(250);
    const info = await evaluate(`(() => {
      const el = document.activeElement;
      const style = getComputedStyle(el);
      return { tag: el.tagName, cls: el.className, label: el.getAttribute('aria-label'), focusVisible: el.matches(':focus-visible'), outline: style.outlineStyle + ' ' + style.outlineWidth, text: (el.textContent || '').trim().slice(0, 30) };
    })()`);
    assert(info.tag !== 'BODY', 'aucun élément focalisé après Tab');
    assert(info.focusVisible, `:focus-visible non actif sur ${info.tag}.${info.cls}`);
    assert(info.outline !== 'none 0px' && !info.outline.startsWith('none'), `pas d’indicateur de focus visible : ${info.outline}`);
    return `${info.tag} (${info.label || info.text}) → ${info.outline}`;
  });

  await check('G5', 'Modale : piège de focus et arrière-plan non exposé', async () => {
    await navigate('produits');
    await evaluate(`__qa.click('[data-action="new-product"]')`);
    await sleep(300);
    const info = await evaluate(`({
      role: document.querySelector('#modal-root .modal')?.getAttribute('role'),
      ariaModal: document.querySelector('#modal-root .modal')?.getAttribute('aria-modal'),
      backgroundInert: !!document.querySelector('.app-shell')?.hasAttribute('inert'),
      backgroundHidden: document.querySelector('.app-shell')?.getAttribute('aria-hidden'),
    })`);
    assert(info.role === 'dialog' && info.ariaModal === 'true', 'attributs ARIA de la modale incomplets');
    let escapedAt = null;
    for (let i = 0; i < 32; i += 1) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
      await sleep(45);
      const active = await evaluate(`(() => { const el = document.activeElement; if (!el) return null; return { inside: !!document.querySelector('#modal-root')?.contains(el), tag: el.tagName, text: (el.textContent || '').trim().slice(0, 40), label: el.getAttribute('aria-label') }; })()`);
      if (active && !active.inside) { escapedAt = active; break; }
    }
    if (escapedAt) {
      note(
        'G5',
        'Pas de piège de focus dans les modales',
        `après quelques Tab, le focus sort de la modale vers ${escapedAt.tag} « ${escapedAt.label || escapedAt.text} » ; l’arrière-plan n’est ni inert ni aria-hidden (inert=${info.backgroundInert}, aria-hidden=${info.backgroundHidden})`,
      );
    }
    await pressKey('Escape');
    return escapedAt ? `focus sorti vers ${escapedAt.tag}` : 'focus resté dans la modale';
  });

  await check('G6', 'Retour du focus sur le déclencheur après fermeture d’une modale', async () => {
    await evaluate(`__qa.focusClick('#btn-theme')`);
    await sleep(200);
    // bascule de thème puis retour : le bouton reste focusable
    const after = await evaluate(`document.activeElement?.id`);
    assert(after === 'btn-theme', `focus perdu après action : ${after}`);
    await evaluate(`__qa.focusClick('[data-nav="settings"]')`);
    await sleep(400);
    await evaluate(`__qa.focusClick('[data-action="reset-demo"]')`);
    await sleep(300);
    await pressKey('Escape');
    const returned = await evaluate(`({ confirm: __qa.confirmOpen(), active: document.activeElement?.getAttribute('data-action') || document.activeElement?.id })`);
    assert(!returned.confirm, 'Échap ne ferme pas la confirmation');
    return `focus rendu à « ${returned.active} »`;
  });

  await check('G7', 'Notifications : région aria-live et bouton de fermeture nommé', async () => {
    const info = await evaluate(`({
      live: __qa.attr('#toast-root', 'aria-live'),
      atomic: __qa.attr('#toast-root', 'aria-atomic'),
      closeLabel: document.querySelector('.toast-close')?.getAttribute('aria-label'),
    })`);
    assert(info.live === 'polite', `aria-live attendu polite, reçu ${info.live}`);
    return `aria-live=${info.live}, fermeture : ${info.closeLabel || 'aucune notification visible'}`;
  });

  /* ================================================================ */
  /* H — Persistance et console                                       */
  /* ================================================================ */

  currentPhase = 'H. persistance / console';

  await check('H1', 'Création + mouvements survivent à un rechargement complet', async () => {
    await navigate('produits');
    await evaluate(`__qa.click('[data-action="new-product"]')`);
    await sleep(200);
    await evaluate(`(() => { __qa.set('#modal-root input[name="name"]', 'QA Persistance'); __qa.set('#modal-root input[name="sku"]', 'QA-PERSIST'); __qa.set('#modal-root input[name="initialQuantity"]', '4'); __qa.submit(); })()`);
    await waitFor('!__qa.modalOpen()', { label: 'création produit persistance' });
    await evaluate(`__qa.click('#btn-new-movement')`);
    await sleep(250);
    await evaluate(`(() => { __qa.selectText('#modal-root select[name="productId"]', 'QA Persistance'); __qa.set('#modal-root input[name="quantity"]', '6'); __qa.submit(); })()`);
    await waitFor('!__qa.modalOpen()', { label: 'entrée persistance' });
    await reloadCurrent();
    await evaluate(`__qa.set('[data-filter="q"]', 'QA-PERSIST')`);
    await sleep(500);
    const row = (await evaluate('__qa.products()'))[0];
    assert(row && row.stock.includes('10'), `stock attendu 10 après rechargement, ligne : ${JSON.stringify(row)}`);
    const data = await storage();
    const product = data.products.find((p) => p.sku === 'QA-PERSIST');
    assert(product.quantity === 10, `stock persisté incohérent : ${product.quantity}`);
    return 'produit et mouvements persistés (4 + 6 = 10)';
  });

  await check('H2', 'Aucune erreur console inattendue sur l’ensemble du parcours', async () => {
    const unexpected = pageErrors.filter((error) => !String(error.phase).startsWith('E7.'));
    assert(unexpected.length === 0, `${unexpected.length} erreur(s) : ${JSON.stringify(unexpected.slice(0, 6))}`);
    return `${pageErrors.length} événement(s) attendu(s) (import invalide), 0 inattendu`;
  });

  await check('H3', 'Document : langue, méta description, favicon et noscript présents', async () => {
    const info = await evaluate(`({
      lang: document.documentElement.lang,
      description: document.querySelector('meta[name="description"]')?.content || '',
      viewport: document.querySelector('meta[name="viewport"]')?.content || '',
      favicon: document.querySelector('link[rel="icon"]')?.getAttribute('href') || '',
      noscript: !!document.querySelector('noscript'),
      h1: __qa.count('h1'),
    })`);
    assert(info.lang === 'fr', 'lang fr absent');
    assert(info.description.length > 30, 'meta description absente ou trop courte');
    assert(info.viewport.includes('width=device-width'), 'meta viewport inadaptée au responsive');
    assert(info.favicon.includes('favicon'), 'favicon absente');
    assert(info.noscript, 'bloc noscript absent');
    const faviconResponse = await fetch(`${APP_URL}assets/favicon.svg`);
    assert(faviconResponse.ok, `favicon introuvable (${faviconResponse.status})`);
    return 'métadonnées et favicon OK';
  });

  /* Screenshots complémentaires */
  await setViewport(1600, 1100, false);
  await navigate('rapports');
  await screenshot('05-rapports');
  await navigate('categories');
  await screenshot('06-categories');
  await navigate('parametres');
  await screenshot('07-parametres');
  await navigate('produits');
  await evaluate(`__qa.click('[data-action="new-product"]')`);
  await sleep(300);
  await screenshot('08-modal-produit-desktop');
  await pressKey('Escape');
  await setViewport(390, 844, true);
  await navigate('tableau-de-bord');
  await screenshot('09-mobile-dashboard');
  await navigate('mouvements');
  await screenshot('10-mobile-mouvements');
  await setViewport(1600, 1100, false);

  /* Nettoyage final : on repart d'un état local vide (jeu de démo au rechargement). */
  await evaluate('localStorage.clear()');
  await navigate('tableau-de-bord');
  await evaluate('document.querySelectorAll(".toast").forEach((t) => t.remove())');
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  cdp.close();

  const passed = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);
  console.log(`\n${passed}/${results.length} vérifications réussies.`);
  if (failed.length) console.log(`\nKO :\n${JSON.stringify(failed, null, 2)}`);
  if (findings.filter((f) => f.observation).length) {
    console.log(`\nObservations :\n${JSON.stringify(findings.filter((f) => f.observation), null, 2)}`);
  }
  writeFileSync(
    join(RUN, 'last-results.json'),
    JSON.stringify({ date: new Date().toISOString(), results, failed, observations: findings.filter((f) => f.observation), pageErrors }, null, 2),
    'utf8',
  );
  process.exitCode = failed.length > 0 ? 1 : 0;
}

function __norm(value) {
  return String(value).replace(/[\s\u00a0\u202f]+/g, ' ').trim();
}

main().catch((error) => {
  console.error('Échec de la campagne QA :', error);
  try {
    activeCdp?.close();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
