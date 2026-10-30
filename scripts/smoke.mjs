/* GestStock — test d'intégration de bout en bout via le protocole CDP.
 *
 * Prérequis :
 *   1. `node server.mjs` (application servie sur http://127.0.0.1:4173)
 *   2. Un Chrome/Chromium headless lancé avec --remote-debugging-port=9333
 *      (voir README, section « Vérifications »).
 *
 * Lancement : node scripts/smoke.mjs
 * Variables : CDP_URL (défaut http://127.0.0.1:9333), APP_URL (défaut http://127.0.0.1:4173/)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9333';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
const ROOT = process.cwd();
const SHOTS = join(ROOT, 'screenshots');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (event) => reject(new Error(`WebSocket CDP : ${event.message || 'erreur'}`)));
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
      const handlers = this.handlers.get(message.method) || [];
      for (const handler of handlers) handler(message.params);
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
  if (!page) throw new Error('Aucune cible de page CDP trouvée. Le navigateur est-il lancé avec --remote-debugging-port ?');
  return page;
}

const results = [];
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✔ ${name}`);
  } catch (error) {
    failures += 1;
    results.push({ name, ok: false, error: error.message });
    console.log(`✖ ${name} — ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion échouée');
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const target = await findPageTarget();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready;

  const pageErrors = [];
  cdp.on('Runtime.exceptionThrown', (params) => {
    pageErrors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'exception inconnue');
  });
  cdp.on('Log.entryAdded', (params) => {
    if (params.entry?.level === 'error') pageErrors.push(params.entry.text);
  });

  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });

  async function evaluate(expression) {
    const response = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result.value;
  }

  /* Chaque navigation force un rechargement complet (paramètre unique) : l'état
     JavaScript repart de zéro, seules les données localStorage sont conservées. */
  async function navigate(hash) {
    await cdp.send('Page.navigate', { url: `${APP_URL}?qa=${Date.now()}#/${hash}` });
    await sleep(1100);
    await evaluate(helpers);
  }

  async function screenshot(name) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
    return name;
  }

  const helpers = `
    window.__qa = {
      set(selector, value) {
        const el = document.querySelector(selector);
        if (!el) throw new Error('Élément introuvable : ' + selector);
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
      selectByText(selector, text) {
        const select = document.querySelector(selector);
        if (!select) throw new Error('Select introuvable : ' + selector);
        const option = [...select.options].find((o) => o.textContent.includes(text));
        if (!option) throw new Error('Option introuvable : ' + text);
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      },
      submitModal() {
        const form = document.querySelector('#modal-root form');
        if (!form) throw new Error('Aucune modale ouverte');
        form.requestSubmit();
      },
      modalError() {
        const error = document.querySelector('#modal-root [data-form-error]');
        return error && !error.hidden ? error.textContent : '';
      },
      click(selector) {
        const el = document.querySelector(selector);
        if (!el) throw new Error('Élément introuvable : ' + selector);
        el.click();
      },
      text(selector) {
        return document.querySelector(selector)?.textContent?.trim() || '';
      },
      rowTexts(selector = '.products-table tbody tr') {
        return [...document.querySelectorAll(selector)].map((row) => row.textContent.replace(/\\s+/g, ' ').trim());
      },
      lastToast() {
        const toasts = document.querySelectorAll('.toast p');
        return toasts.length ? toasts[toasts.length - 1].textContent.trim() : '';
      },
      clearToasts() {
        document.querySelectorAll('.toast').forEach((toast) => toast.remove());
      },
    };
  `;

  /* On repart d'un jeu de données connu pour que le test soit rejouable. */
  await navigate('parametres');
  await evaluate(`__qa.click('[data-action="reset-demo"]')`);
  await sleep(350);
  await evaluate(`__qa.click('#modal-root [data-confirm]')`);
  await sleep(700);
  await evaluate('__qa.clearToasts()');

  await navigate('tableau-de-bord');

  await check('la page se charge sans erreur JavaScript', async () => {
    const info = await evaluate(`({
      title: document.title,
      kpis: document.querySelectorAll('.kpi').length,
      nav: document.querySelectorAll('[data-nav]').length,
      heading: document.querySelector('#page-title')?.textContent,
      menuDisplay: getComputedStyle(document.querySelector('.menu-btn')).display,
    })`);
    assert(info.kpis === 4, `4 indicateurs attendus, reçu ${info.kpis}`);
    assert(info.nav === 7, `7 liens de navigation attendus, reçu ${info.nav}`);
    assert(info.heading === 'Tableau de bord', `titre inattendu : ${info.heading}`);
    assert(info.menuDisplay === 'none', 'le bouton menu doit être masqué sur desktop');
    assert(info.title.includes('Tableau de bord'), `document.title inattendu : ${info.title}`);
  });

  await check('création d’un produit via la modale', async () => {
    await navigate('produits');
    await evaluate(`__qa.click('[data-action="new-product"]')`);
    await sleep(350);
    assert(await evaluate('!!document.querySelector("#modal-root .modal")'), 'la modale produit ne s’ouvre pas');
    await evaluate(`(() => {
      __qa.set('input[name="name"]', 'Produit QA Test');
      __qa.set('input[name="sku"]', 'QA-001');
      __qa.set('input[name="purchasePrice"]', '5000');
      __qa.set('input[name="salePrice"]', '7500');
      __qa.set('input[name="threshold"]', '5');
      __qa.set('input[name="initialQuantity"]', '7');
      __qa.selectByText('select[name="unit"]', 'pièces');
      __qa.selectByText('select[name="categoryId"]', 'Boissons');
      __qa.submitModal();
    })()`);
    await sleep(700);
    assert(!(await evaluate('!!document.querySelector("#modal-root form")')), 'la modale aurait dû se fermer');
    const toast = await evaluate('__qa.lastToast()');
    assert(toast.includes('ajouté'), `toast inattendu : ${toast}`);
    const meta = await evaluate('__qa.text("[data-products-meta]")');
    assert(meta.includes('25 produit(s)'), `métadonnées produits inattendues : ${meta}`);
  });

  await check('recherche et affichage du stock initial', async () => {
    await evaluate(`__qa.set('[data-filter="q"]', 'Produit QA Test')`);
    await sleep(500);
    const rows = await evaluate('__qa.rowTexts()');
    assert(rows.length === 1, `${rows.length} ligne(s) au lieu d’une`);
    assert(rows[0].includes('QA-001'), 'le SKU est absent de la ligne');
    assert(rows[0].includes('7'), 'la quantité initiale est absente');
    await evaluate(`__qa.set('[data-filter="q"]', '')`);
    await sleep(500);
  });

  await check('pagination des produits', async () => {
    const before = await evaluate('__qa.text(".page-current")');
    await evaluate(`__qa.click('.pager .page-btn[data-page="2"]')`);
    await sleep(350);
    const after = await evaluate('__qa.text(".page-current")');
    assert(before === '1 / 4', `pagination initiale inattendue : ${before}`);
    assert(after === '2 / 4', `pagination après clic inattendue : ${after}`);
    await evaluate(`__qa.click('.pager .page-btn[data-page="1"]')`);
    await sleep(250);
  });

  await check('sortie de stock refusée si quantité insuffisante', async () => {
    await evaluate(`__qa.click('#btn-new-movement')`);
    await sleep(300);
    await evaluate(`(() => {
      __qa.click('#modal-root input[name="type"][value="out"]');
      __qa.selectByText('select[name="productId"]', 'Produit QA Test');
      __qa.set('input[name="quantity"]', '999');
      __qa.submitModal();
    })()`);
    await sleep(500);
    const error = await evaluate('__qa.modalError()');
    assert(error.includes('Stock insuffisant'), `message attendu « Stock insuffisant », reçu : ${error}`);
    assert(await evaluate('!!document.querySelector("#modal-root form")'), 'la modale doit rester ouverte après une erreur');
  });

  await check('sortie de stock valide puis entrée de stock', async () => {
    await evaluate(`(() => {
      __qa.set('input[name="quantity"]', '3');
      __qa.submitModal();
    })()`);
    await sleep(700);
    assert(!(await evaluate('!!document.querySelector("#modal-root form")')), 'la modale se ferme après une sortie valide');

    await evaluate(`__qa.set('[data-filter="q"]', 'Produit QA Test')`);
    await sleep(500);
    let row = (await evaluate('__qa.rowTexts()'))[0] || '';
    assert(row.includes('4'), `stock après sortie attendu 4, ligne : ${row}`);

    await evaluate(`__qa.click('#btn-new-movement')`);
    await sleep(300);
    await evaluate(`(() => {
      __qa.click('#modal-root input[name="type"][value="in"]');
      __qa.selectByText('select[name="productId"]', 'Produit QA Test');
      __qa.set('input[name="quantity"]', '10');
      __qa.submitModal();
    })()`);
    await sleep(700);
    await evaluate(`__qa.set('[data-filter="q"]', 'Produit QA Test')`);
    await sleep(500);
    row = (await evaluate('__qa.rowTexts()'))[0] || '';
    assert(row.includes('14'), `stock après entrée attendu 14, ligne : ${row}`);
    await evaluate(`__qa.set('[data-filter="q"]', '')`);
    await sleep(400);
  });

  await check('filtres de statut et de catégorie', async () => {
    await navigate('produits');
    await evaluate(`__qa.set('[data-filter="status"]', 'rupture')`);
    await sleep(400);
    const rows = await evaluate('__qa.rowTexts()');
    assert(rows.length >= 1, 'aucune rupture affichée');
    assert(rows.every((row) => row.includes('Rupture')), 'des produits non en rupture sont affichés');
    await evaluate(`__qa.set('[data-filter="status"]', 'all')`);
    await sleep(300);
    await evaluate(`__qa.selectByText('[data-filter="category"]', 'Électronique')`);
    await sleep(400);
    const categoryRows = await evaluate('__qa.rowTexts()');
    assert(categoryRows.length > 0 && categoryRows.every((row) => row.includes('Électronique')), 'filtre catégorie incohérent');
    await evaluate(`__qa.selectByText('[data-filter="category"]', 'Toutes les catégories')`);
    await sleep(300);
  });

  await check('navigation et journal des mouvements', async () => {
    await navigate('mouvements');
    const info = await evaluate(`({
      rows: document.querySelectorAll('.movements-table tbody tr').length,
      heading: document.querySelector('#page-title')?.textContent,
      meta: __qa.text('[data-movements-meta]'),
    })`);
    assert(info.heading === 'Mouvements', `titre inattendu : ${info.heading}`);
    assert(info.rows === 12, `12 mouvements attendus sur la page, reçu ${info.rows}`);
    assert(info.meta.includes('mouvement(s)'), `métadonnées inattendues : ${info.meta}`);
    await evaluate(`__qa.set('[data-filter="q"]', 'Produit QA Test')`);
    await sleep(500);
    const filtered = await evaluate('__qa.rowTexts(".movements-table tbody tr")');
    assert(filtered.length >= 2, 'les mouvements du produit QA ne sont pas filtrés');
  });

  await check('thème sombre appliqué et persistant', async () => {
    await navigate('tableau-de-bord');
    await evaluate('__qa.click("#btn-theme")');
    await sleep(350);
    let theme = await evaluate('document.documentElement.dataset.theme');
    assert(theme === 'dark', `thème attendu dark, reçu ${theme}`);
    await screenshot('qa-dark-dashboard');
    await evaluate('__qa.click("#btn-theme")');
    await sleep(250);
    theme = await evaluate('document.documentElement.dataset.theme');
    assert(theme === 'light', `thème attendu light, reçu ${theme}`);
  });

  await check('paramètres : enregistrement et prise en compte', async () => {
    await navigate('parametres');
    await evaluate(`(() => {
      __qa.set('#setting-company', 'QA Distribution');
      __qa.set('#setting-threshold', '12');
      __qa.click('[data-action="save-settings"]');
    })()`);
    await sleep(500);
    const toast = await evaluate('__qa.lastToast()');
    assert(toast.includes('Paramètres enregistrés'), `toast inattendu : ${toast}`);
    const threshold = await evaluate('document.querySelector("#setting-threshold").value');
    assert(threshold === '12', `seuil attendu 12, reçu ${threshold}`);
    const company = await evaluate('document.querySelector("#setting-company").value');
    assert(company === 'QA Distribution', `entreprise attendue QA Distribution, reçue ${company}`);
  });

  await check('création puis suppression d’une catégorie', async () => {
    await navigate('categories');
    await evaluate(`__qa.click('[data-action="new-category"]')`);
    await sleep(300);
    await evaluate(`(() => {
      __qa.set('#modal-root input[name="name"]', 'Catégorie QA');
      __qa.set('#modal-root textarea[name="description"]', 'Créée par le test automatisé.');
      __qa.submitModal();
    })()`);
    await sleep(600);
    const hasCategory = await evaluate(`[...document.querySelectorAll('.category-card')].some((card) => card.textContent.includes('Catégorie QA'))`);
    assert(hasCategory, 'la catégorie créée n’apparaît pas');

    await evaluate(`(() => {
      const card = [...document.querySelectorAll('.category-card')].find((c) => c.textContent.includes('Catégorie QA'));
      card.querySelector('[data-action="delete-category"]').click();
    })()`);
    await sleep(300);
    await evaluate(`__qa.click('#modal-root [data-confirm]')`);
    await sleep(500);
    const stillThere = await evaluate(`[...document.querySelectorAll('.category-card')].some((card) => card.textContent.includes('Catégorie QA'))`);
    assert(!stillThere, 'la catégorie supprimée est encore affichée');
  });

  await check('affichage mobile et tiroir de navigation', async () => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await navigate('tableau-de-bord');
    const info = await evaluate(`({
      menu: getComputedStyle(document.querySelector('.menu-btn')).display,
      sidebar: getComputedStyle(document.querySelector('.sidebar')).transform,
      overflow: document.documentElement.scrollWidth,
    })`);
    assert(info.menu !== 'none', 'le bouton menu devrait être visible sur mobile');
    assert(info.sidebar !== 'none', 'le tiroir devrait être masqué par défaut');
    assert(info.overflow <= 391, `débordement horizontal de la page : ${info.overflow}px`);
    await evaluate('__qa.click("#btn-menu")');
    await sleep(350);
    const opened = await evaluate('document.querySelector("#sidebar").classList.contains("is-open")');
    assert(opened, 'le tiroir ne s’ouvre pas');
    await screenshot('qa-mobile-dashboard');
    await evaluate('__qa.click("#btn-close-sidebar")');
    await sleep(250);
  });

  await cdp.send('Emulation.clearDeviceMetricsOverride');

  await check('aucune erreur JavaScript pendant le parcours', async () => {
    assert(pageErrors.length === 0, `erreurs console : ${pageErrors.join(' | ')}`);
  });

  cdp.close();
  const passed = results.filter((result) => result.ok).length;
  console.log(`\n${passed}/${results.length} vérifications réussies.`);
  if (failures > 0) {
    console.log(JSON.stringify(results.filter((result) => !result.ok), null, 2));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Échec du test d’intégration :', error);
  process.exitCode = 1;
});
