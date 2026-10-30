/* GestStock — génération des captures d'écran de documentation via CDP.
 *
 * Prérequis : serveur `node server.mjs` et Chrome headless avec --remote-debugging-port=9333.
 * Lancement : node scripts/screenshots.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9333';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
const SHOTS = join(process.cwd(), 'screenshots');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const target = (await (await fetch(`${CDP_URL}/json/list`)).json()).find(
  (item) => item.type === 'page' && item.webSocketDebuggerUrl,
);
if (!target) throw new Error('Aucune cible CDP trouvée.');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve);
  ws.addEventListener('error', reject);
});

let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(message.error.message));
  else entry.resolve(message.result);
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', {
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

async function navigate(hash) {
  await send('Page.navigate', { url: `${APP_URL}?shot=${Date.now()}#/${hash}` });
  await sleep(900);
  await evaluate("document.querySelectorAll('[data-nav]').length === 7");
}

async function capture(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`capture : screenshots/${name}.png`);
}

mkdirSync(SHOTS, { recursive: true });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1150, deviceScaleFactor: 1, mobile: false });

/* Part d'un jeu de démonstration propre. */
await navigate('tableau-de-bord');
await evaluate('localStorage.clear()');
await navigate('tableau-de-bord');

const pages = [
  ['dashboard', 'tableau-de-bord'],
  ['produits', 'produits'],
  ['mouvements', 'mouvements'],
  ['categories', 'categories'],
  ['fournisseurs', 'fournisseurs'],
  ['rapports', 'rapports'],
  ['parametres', 'parametres'],
];

for (const [name, route] of pages) {
  await navigate(route);
  await capture(name);
}

/* Thème sombre. */
await navigate('tableau-de-bord');
await evaluate('document.querySelector("#btn-theme").click()');
await sleep(500);
await capture('dark');
await evaluate('document.querySelector("#btn-theme").click()');
await sleep(300);

/* Mobile. */
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await navigate('tableau-de-bord');
await capture('mobile');

await send('Emulation.clearDeviceMetricsOverride');
ws.close();
console.log('Captures à jour.');
