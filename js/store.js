/* GestStock — couche de données (pure, sans DOM).
 * L'état complet est persisté dans localStorage sous une seule clé JSON.
 * Toutes les mutations passent par l'API du store qui valide les données,
 * met à jour les stocks et enregistre les mouvements.
 */

import { uid, localDayKey, stockStatus, toDate, formatNumber } from './utils.js';

export const STORAGE_KEY = 'geststock.data.v1';
export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  company: 'Ma société',
  currency: 'MGA',
  defaultThreshold: 10,
  theme: 'light',
};

export const CURRENCIES = [
  { code: 'MGA', label: 'Ariary malgache (Ar)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'USD', label: 'Dollar américain ($)' },
  { code: 'GBP', label: 'Livre sterling (£)' },
  { code: 'CHF', label: 'Franc suisse (CHF)' },
];

export const UNITS = ['pièce', 'kg', 'L', 'carton', 'paquet', 'lot'];

export const MOVEMENT_TYPES = ['in', 'out', 'adjust'];

const DEFAULT_REASONS = { in: 'Réapprovisionnement', out: 'Vente', adjust: 'Inventaire' };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function round3(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

function requireText(value, label, max = 120) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} est obligatoire.`);
  if (text.length > max) throw new Error(`${label} ne peut pas dépasser ${max} caractères.`);
  return text;
}

function toNumber(value, label, { min = 0, max = 1e12, fallback } = {}) {
  if (value === '' || value === null || value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${label} est obligatoire.`);
  }
  const n = Number(String(value).replace(',', '.').trim());
  if (!Number.isFinite(n)) throw new Error(`${label} doit être un nombre valide.`);
  if (n < min) throw new Error(`${label} doit être supérieur ou égal à ${formatNumber(min)}.`);
  if (n > max) throw new Error(`${label} est trop élevé.`);
  return n;
}

function normalizeRef(value, list, label) {
  if (value === '' || value === null || value === undefined) return null;
  const id = String(value);
  if (!list.some((entry) => entry.id === id)) {
    throw new Error(`${label} sélectionné(e) est introuvable.`);
  }
  return id;
}

function normalizeColor(value, fallback = '#64748b') {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function normalizeSettings(raw = {}) {
  const settings = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    if (typeof raw.company === 'string' && raw.company.trim()) settings.company = raw.company.trim();
    if (CURRENCIES.some((c) => c.code === raw.currency)) settings.currency = raw.currency;
    const threshold = Number(raw.defaultThreshold);
    if (Number.isFinite(threshold) && threshold >= 0) settings.defaultThreshold = threshold;
    if (raw.theme === 'dark' || raw.theme === 'light') settings.theme = raw.theme;
  }
  return settings;
}

function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Sauvegarde invalide : le fichier ne contient pas un objet JSON.');
  }
  for (const key of ['products', 'categories', 'suppliers', 'movements']) {
    if (!Array.isArray(raw[key])) throw new Error(`Sauvegarde invalide : la liste « ${key} » est absente.`);
  }

  const now = new Date().toISOString();

  const categories = raw.categories.map((cat, index) => {
    if (!cat || typeof cat !== 'object') throw new Error('Sauvegarde invalide : une catégorie est illisible.');
    return {
      id: cat.id ? String(cat.id) : uid(),
      name: String(cat.name || `Catégorie ${index + 1}`).trim(),
      color: normalizeColor(cat.color),
      description: String(cat.description || ''),
    };
  });

  const suppliers = raw.suppliers.map((sup, index) => {
    if (!sup || typeof sup !== 'object') throw new Error('Sauvegarde invalide : un fournisseur est illisible.');
    return {
      id: sup.id ? String(sup.id) : uid(),
      name: String(sup.name || `Fournisseur ${index + 1}`).trim(),
      contact: String(sup.contact || ''),
      email: String(sup.email || ''),
      phone: String(sup.phone || ''),
      address: String(sup.address || ''),
      notes: String(sup.notes || ''),
    };
  });

  const settings = normalizeSettings(raw.settings);

  const products = raw.products.map((product) => {
    if (!product || typeof product !== 'object' || !String(product.name || '').trim()) {
      throw new Error('Sauvegarde invalide : un produit est incomplet (nom manquant).');
    }
    return {
      id: product.id ? String(product.id) : uid(),
      sku: String(product.sku || '').toUpperCase() || `SKU-${uid().slice(0, 6).toUpperCase()}`,
      name: String(product.name).trim(),
      categoryId: product.categoryId ? String(product.categoryId) : null,
      supplierId: product.supplierId ? String(product.supplierId) : null,
      purchasePrice: Math.max(0, Number(product.purchasePrice) || 0),
      salePrice: Math.max(0, Number(product.salePrice) || 0),
      quantity: Math.max(0, Number(product.quantity) || 0),
      threshold: Number.isFinite(Number(product.threshold)) && Number(product.threshold) >= 0
        ? Number(product.threshold)
        : settings.defaultThreshold,
      unit: UNITS.includes(product.unit) ? product.unit : 'pièce',
      location: String(product.location || ''),
      notes: String(product.notes || ''),
      createdAt: toDate(product.createdAt)?.toISOString() || now,
      updatedAt: toDate(product.updatedAt)?.toISOString() || now,
    };
  });

  const productIds = new Set(products.map((p) => p.id));

  const movements = raw.movements
    .filter((movement) => movement && typeof movement === 'object')
    .map((movement) => {
      const type = MOVEMENT_TYPES.includes(movement.type) ? movement.type : null;
      if (!type) return null;
      const quantity = Number(movement.quantity);
      const previousQuantity = Number(movement.previousQuantity);
      const newQuantity = Number(movement.newQuantity);
      const date = toDate(movement.date) || toDate(movement.createdAt) || new Date();
      const delta = Number.isFinite(Number(movement.delta)) ? Number(movement.delta) : round3(newQuantity - previousQuantity);
      return {
        id: movement.id ? String(movement.id) : uid(),
        productId: String(movement.productId || ''),
        productName: String(movement.productName || ''),
        type,
        quantity: Number.isFinite(quantity) ? Math.max(0, quantity) : Math.abs(delta),
        previousQuantity: Number.isFinite(previousQuantity) ? previousQuantity : 0,
        newQuantity: Number.isFinite(newQuantity) ? newQuantity : 0,
        delta: Number.isFinite(delta) ? delta : 0,
        reason: String(movement.reason || DEFAULT_REASONS[type]),
        reference: String(movement.reference || ''),
        note: String(movement.note || ''),
        date: date.toISOString(),
        createdAt: toDate(movement.createdAt)?.toISOString() || date.toISOString(),
      };
    })
    .filter(Boolean)
    .filter((movement) => productIds.has(movement.productId));

  return {
    version: SCHEMA_VERSION,
    settings,
    categories,
    suppliers,
    products,
    movements,
  };
}

/* ------------------------------------------------------------------ */
/* Données de démonstration                                            */
/* ------------------------------------------------------------------ */

const DEMO_CATEGORIES = [
  { name: 'Boissons', color: '#2563eb', description: 'Eaux, sodas, jus et cafés.' },
  { name: 'Épicerie', color: '#f59e0b', description: 'Riz, huiles, pâtes et produits de base.' },
  { name: 'Hygiène', color: '#14b8a6', description: 'Soins du corps et papier.' },
  { name: 'Électronique', color: '#8b5cf6', description: 'Accessoires téléphone et informatique.' },
  { name: 'Papeterie', color: '#ef4444', description: 'Fournitures de bureau et scolaires.' },
  { name: 'Ménage', color: '#0ea5e9', description: "Entretien de la maison et consommables." },
];

const DEMO_SUPPLIERS = [
  { name: 'Grossiste Alpha', contact: 'Rasoa Andrianina', email: 'contact@alpha.mg', phone: '+261 34 12 345 67', address: 'Ivato, Antananarivo' },
  { name: 'DistriPlus', contact: 'Jean-Marc Rakoto', email: 'commandes@distriplus.mg', phone: '+261 33 45 678 90', address: 'Analakely, Antananarivo' },
  { name: 'Océan Import', contact: 'Fatima Soulaimana', email: 'sales@ocean-import.mg', phone: '+261 32 11 223 33', address: 'Port, Toamasina' },
  { name: 'TechSupply', contact: 'Hery Ravelo', email: 'pro@techsupply.mg', phone: '+261 34 98 765 43', address: 'Ankorondrano, Antananarivo' },
  { name: 'Papeterie Centrale', contact: 'Nadia Bemiray', email: 'info@papeterie-centrale.mg', phone: '+261 33 77 889 90', address: 'Isoraka, Antananarivo' },
  { name: 'Maison Verte', contact: 'Luc Ramiandrisoa', email: 'hello@maisonverte.mg', phone: '+261 32 66 554 43', address: 'Antsirabe' },
];

/* category / supplier : index dans les tableaux ci-dessus */
const DEMO_PRODUCTS = [
  { sku: 'COCA-15', name: 'Coca-Cola 1,5 L', category: 0, supplier: 0, purchase: 2500, sale: 3500, unit: 'pièce', threshold: 24, status: 'ok', location: 'A1-01' },
  { sku: 'EAU-15', name: 'Eau minérale 1,5 L', category: 0, supplier: 0, purchase: 1200, sale: 2000, unit: 'pièce', threshold: 36, status: 'low', location: 'A1-02' },
  { sku: 'JUS-OR', name: "Jus d'orange 1 L", category: 0, supplier: 1, purchase: 4500, sale: 6000, unit: 'pièce', threshold: 12, status: 'ok', location: 'A1-03' },
  { sku: 'CAFE-250', name: 'Café moulu 250 g', category: 0, supplier: 0, purchase: 12000, sale: 15000, unit: 'pièce', threshold: 10, status: 'ok', location: 'A1-04' },
  { sku: 'RIZ-5', name: 'Riz parfumé 5 kg', category: 1, supplier: 2, purchase: 18000, sale: 22000, unit: 'paquet', threshold: 15, status: 'ok', location: 'B2-01' },
  { sku: 'HUILE-1', name: 'Huile végétale 1 L', category: 1, supplier: 2, purchase: 9000, sale: 12000, unit: 'pièce', threshold: 20, status: 'low', location: 'B2-02' },
  { sku: 'SUCRE-1', name: 'Sucre blanc 1 kg', category: 1, supplier: 2, purchase: 4000, sale: 5500, unit: 'paquet', threshold: 25, status: 'ok', location: 'B2-03' },
  { sku: 'LAIT-C', name: 'Lait concentré sucré', category: 1, supplier: 0, purchase: 3500, sale: 4500, unit: 'pièce', threshold: 18, status: 'ok', location: 'B2-04' },
  { sku: 'PATE-5', name: 'Pâtes alimentaires 500 g', category: 1, supplier: 2, purchase: 2500, sale: 3500, unit: 'paquet', threshold: 20, status: 'ok', location: 'B2-05' },
  { sku: 'SAVON', name: 'Savon de toilette', category: 2, supplier: 1, purchase: 1500, sale: 2200, unit: 'pièce', threshold: 30, status: 'ok', location: 'C1-01' },
  { sku: 'DENT-D', name: 'Dentifrice 100 ml', category: 2, supplier: 1, purchase: 3000, sale: 4500, unit: 'pièce', threshold: 15, status: 'low', location: 'C1-02' },
  { sku: 'PQ-4', name: 'Papier toilette x4', category: 2, supplier: 1, purchase: 4000, sale: 5500, unit: 'paquet', threshold: 12, status: 'out', location: 'C1-03' },
  { sku: 'SHAMP', name: 'Shampoing 400 ml', category: 2, supplier: 1, purchase: 8000, sale: 11000, unit: 'pièce', threshold: 8, status: 'ok', location: 'C1-04' },
  { sku: 'ECOUT', name: 'Écouteurs filaires', category: 3, supplier: 3, purchase: 15000, sale: 25000, unit: 'pièce', threshold: 6, status: 'ok', location: 'D1-01' },
  { sku: 'CHARGE', name: 'Chargeur USB-C 20 W', category: 3, supplier: 3, purchase: 20000, sale: 32000, unit: 'pièce', threshold: 5, status: 'low', location: 'D1-02' },
  { sku: 'BATT-10', name: 'Batterie externe 10 000 mAh', category: 3, supplier: 3, purchase: 45000, sale: 65000, unit: 'pièce', threshold: 4, status: 'out', location: 'D1-03' },
  { sku: 'USB-64', name: 'Clé USB 64 Go', category: 3, supplier: 3, purchase: 25000, sale: 38000, unit: 'pièce', threshold: 5, status: 'ok', location: 'D1-04' },
  { sku: 'CAHIER', name: 'Cahier 96 pages', category: 4, supplier: 4, purchase: 1800, sale: 2500, unit: 'pièce', threshold: 40, status: 'ok', location: 'E3-01' },
  { sku: 'STYLO', name: 'Stylos bille (lot de 10)', category: 4, supplier: 4, purchase: 2000, sale: 3000, unit: 'lot', threshold: 15, status: 'ok', location: 'E3-02' },
  { sku: 'A4-500', name: 'Ramette A4 500 feuilles', category: 4, supplier: 4, purchase: 14000, sale: 18000, unit: 'paquet', threshold: 10, status: 'ok', location: 'E3-03' },
  { sku: 'SURL', name: 'Surligneurs x4', category: 4, supplier: 4, purchase: 2500, sale: 3500, unit: 'lot', threshold: 12, status: 'ok', location: 'E3-04' },
  { sku: 'DETER', name: 'Détergent multi-surfaces 1 L', category: 5, supplier: 5, purchase: 6000, sale: 8500, unit: 'pièce', threshold: 15, status: 'ok', location: 'F2-01' },
  { sku: 'EPONGE', name: 'Éponges x5', category: 5, supplier: 5, purchase: 2000, sale: 3000, unit: 'paquet', threshold: 20, status: 'ok', location: 'F2-02' },
  { sku: 'SAC-30', name: 'Sacs poubelle 30 L (x20)', category: 5, supplier: 5, purchase: 5000, sale: 7000, unit: 'paquet', threshold: 12, status: 'low', location: 'F2-03' },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoAt(base, daysAgo, hour, minute = 0) {
  const d = new Date(base.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Répartit un total entier en `count` parts positives (somme exacte). */
function splitQuantity(total, count) {
  const parts = Array.from({ length: Math.max(1, count) }, () =>
    Math.max(1, Math.floor(total / Math.max(1, count))),
  );
  let diff = total - parts.reduce((sum, part) => sum + part, 0);
  let guard = 0;
  while (diff !== 0 && guard < 2000) {
    const idx = guard % parts.length;
    if (diff > 0) {
      parts[idx] += 1;
      diff -= 1;
    } else if (parts[idx] > 1) {
      parts[idx] -= 1;
      diff += 1;
    }
    guard += 1;
  }
  return parts;
}

/** État de démonstration complet et cohérent (stocks calculés à partir des mouvements). */
export function createSeedState(nowFn = () => new Date()) {
  const now = nowFn();
  const rand = mulberry32(0x5f3759df);
  const categories = DEMO_CATEGORIES.map((cat, index) => ({ id: `cat-${index + 1}`, ...cat }));
  const suppliers = DEMO_SUPPLIERS.map((sup, index) => ({ id: `sup-${index + 1}`, ...sup }));
  const products = [];
  const movements = [];
  let movementSeq = 0;
  let saleSeq = 0;

  DEMO_PRODUCTS.forEach((spec, index) => {
    const category = categories[spec.category];
    const supplier = suppliers[spec.supplier];
    const threshold = spec.threshold;
    const createdAt = isoAt(now, 30, 8, 15);

    let finalQuantity;
    if (spec.status === 'out') finalQuantity = 0;
    else if (spec.status === 'low') finalQuantity = Math.max(1, Math.round(threshold * (0.2 + rand() * 0.5)));
    else finalQuantity = Math.round(threshold * (1.4 + rand() * 2.4)) + 3;

    /* Certains produits ont reçu un réapprovisionnement récent (courbe des entrées vivante). */
    const hasRestock = rand() < 0.62;
    let initialQuantity;
    let restockQuantity = 0;
    let sold;
    if (hasRestock) {
      initialQuantity = Math.round(threshold * (0.8 + rand() * 1.6)) + 25;
      restockQuantity = Math.round(threshold * (0.7 + rand() * 1.4)) + 15;
      sold = initialQuantity + restockQuantity - finalQuantity;
      if (sold < 25) {
        initialQuantity += 30;
        sold += 30;
      }
    } else {
      sold = Math.round(45 + rand() * 140);
      initialQuantity = finalQuantity + sold;
    }

    const product = {
      id: `prod-${index + 1}`,
      sku: spec.sku,
      name: spec.name,
      categoryId: category.id,
      supplierId: supplier.id,
      purchasePrice: spec.purchase,
      salePrice: spec.sale,
      quantity: initialQuantity,
      threshold,
      unit: spec.unit,
      location: spec.location,
      notes: '',
      createdAt,
      updatedAt: createdAt,
    };

    const events = [
      {
        type: 'in',
        quantity: initialQuantity,
        reason: 'Stock initial',
        reference: `INIT-${String(index + 1).padStart(3, '0')}`,
        date: createdAt,
      },
    ];

    const restockDay = hasRestock ? 3 + Math.floor(rand() * 4) : null;
    if (hasRestock && restockQuantity > 0) {
      events.push({
        type: 'in',
        quantity: restockQuantity,
        reason: 'Réapprovisionnement',
        reference: `BL-${2000 + index}`,
        date: isoAt(now, restockDay, 9 + Math.floor(rand() * 6), Math.floor(rand() * 60)),
      });
    }

    const pushSales = (total, count, daysFrom, daysTo) => {
      if (total <= 0) return;
      const parts = splitQuantity(total, Math.min(count, total));
      parts.forEach((quantity) => {
        const span = Math.max(1, daysTo - daysFrom + 1);
        const daysAgo = daysFrom + Math.floor(rand() * span);
        events.push({
          type: 'out',
          quantity,
          reason: rand() < 0.88 ? 'Vente' : 'Casse / perte',
          reference: '',
          date: isoAt(now, daysAgo, 9 + Math.floor(rand() * 8), Math.floor(rand() * 60)),
        });
      });
    };

    if (hasRestock) {
      const preSales = Math.max(
        1,
        Math.min(Math.round(sold * (0.35 + rand() * 0.25)), initialQuantity - 2, sold - 2),
      );
      const postSales = sold - preSales;
      pushSales(preSales, 3, 8, 27);
      pushSales(postSales, 2, 1, Math.max(1, restockDay - 1));
    } else {
      pushSales(sold, 1 + Math.floor(rand() * 4), 1, 25);
    }

    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    let running = 0;
    let lastDate = createdAt;
    for (const event of events) {
      const previousQuantity = running;
      running = event.type === 'in' ? round3(running + event.quantity) : round3(running - event.quantity);
      const reference =
        event.type === 'out'
          ? event.reason === 'Vente'
            ? `TCK-${1200 + (++saleSeq)}`
            : ''
          : event.reference;
      movements.push({
        id: `mov-${++movementSeq}`,
        productId: product.id,
        productName: product.name,
        type: event.type,
        quantity: event.quantity,
        previousQuantity,
        newQuantity: running,
        delta: round3(running - previousQuantity),
        reason: event.reason,
        reference,
        note: '',
        date: event.date,
        createdAt: event.date,
      });
      if (new Date(event.date) > new Date(lastDate)) lastDate = event.date;
    }

    product.quantity = running;
    product.updatedAt = lastDate;
    products.push(product);
  });

  return {
    version: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS, company: 'Erick Distribution' },
    categories,
    suppliers,
    products,
    movements,
  };
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export function createStockStore({ storage = null, now = () => new Date() } = {}) {
  let state;

  if (storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) state = normalizeSnapshot(JSON.parse(raw));
    } catch (error) {
      console.warn('GestStock : données locales illisibles, chargement des données de démonstration.', error);
    }
  }
  if (!state) state = createSeedState(now);

  function commit() {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('GestStock : impossible de sauvegarder les données localement.', error);
    }
  }

  function findProduct(id) {
    const product = state.products.find((p) => p.id === id);
    if (!product) throw new Error('Produit introuvable.');
    return product;
  }

  function assertUniqueSku(sku, excludeId = null) {
    const exists = state.products.some(
      (p) => p.id !== excludeId && p.sku.toLowerCase() === String(sku).toLowerCase(),
    );
    if (exists) throw new Error(`La référence « ${sku} » est déjà utilisée par un autre produit.`);
  }

  /** Recalcule le grand livre d'un produit dans l'ordre chronologique des mouvements.
   * Indispensable pour rester cohérent lorsqu'un mouvement est antidaté. */
  function recomputeProductLedger(product) {
    const ledger = state.movements
      .filter((movement) => movement.productId === product.id)
      .sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt));
    let running = 0;
    for (const movement of ledger) {
      movement.previousQuantity = running;
      if (movement.type === 'in') running = round3(running + movement.quantity);
      else if (movement.type === 'out') running = round3(running - movement.quantity);
      else running = round3(movement.quantity);
      movement.newQuantity = running;
      movement.delta = round3(running - movement.previousQuantity);
    }
    product.quantity = running;
  }

  function appendMovement(product, data, nowDate) {
    const movement = {
      id: uid(),
      productId: product.id,
      productName: product.name,
      type: data.type,
      quantity: data.quantity,
      previousQuantity: 0,
      newQuantity: 0,
      delta: 0,
      reason: data.reason || DEFAULT_REASONS[data.type],
      reference: data.reference || '',
      note: data.note || '',
      date: data.date,
      createdAt: nowDate.toISOString(),
    };
    state.movements.push(movement);
    recomputeProductLedger(product);
    product.updatedAt = nowDate.toISOString();
    return movement;
  }

  return {
    /* ----------------------------- lecture ----------------------------- */
    getState() {
      return state;
    },
    getSettings() {
      return state.settings;
    },
    getProduct(id) {
      return state.products.find((p) => p.id === id) || null;
    },
    getCategory(id) {
      return state.categories.find((c) => c.id === id) || null;
    },
    getSupplier(id) {
      return state.suppliers.find((s) => s.id === id) || null;
    },
    getStats() {
      const products = state.products;
      const units = products.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
      const stockValue = products.reduce((sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.purchasePrice) || 0), 0);
      const saleValue = products.reduce((sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.salePrice) || 0), 0);
      const threshold = state.settings.defaultThreshold;
      let lowStock = 0;
      let outOfStock = 0;
      for (const product of products) {
        const status = stockStatus(product, threshold);
        if (status.key === 'bas') lowStock += 1;
        else if (status.key === 'rupture') outOfStock += 1;
      }
      const since = now().getTime() - 30 * 24 * 3600 * 1000;
      const movements30 = state.movements.filter((m) => new Date(m.date).getTime() >= since).length;
      return {
        totalProducts: products.length,
        totalUnits: units,
        stockValue,
        saleValue,
        potentialMargin: saleValue - stockValue,
        lowStock,
        outOfStock,
        alerts: lowStock + outOfStock,
        categories: state.categories.length,
        suppliers: state.suppliers.length,
        movements30,
      };
    },
    /** [{ key, date, inbound, outbound }] sur les N derniers jours (aujourd'hui inclus). */
    dailyFlow(days = 7) {
      const end = new Date(now());
      end.setHours(0, 0, 0, 0);
      const rows = [];
      for (let i = days - 1; i >= 0; i -= 1) {
        const date = new Date(end);
        date.setDate(end.getDate() - i);
        rows.push({ key: localDayKey(date), date: date.toISOString(), inbound: 0, outbound: 0 });
      }
      const index = new Map(rows.map((row) => [row.key, row]));
      for (const movement of state.movements) {
        if (movement.type !== 'in' && movement.type !== 'out') continue;
        const row = index.get(localDayKey(movement.date));
        if (!row) continue;
        if (movement.type === 'in') row.inbound += movement.quantity;
        else row.outbound += movement.quantity;
      }
      return rows;
    },
    /** Répartition par catégorie, triée par valeur décroissante. */
    categoryBreakdown() {
      const rows = state.categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        color: cat.color,
        description: cat.description,
        productCount: 0,
        units: 0,
        value: 0,
        saleValue: 0,
      }));
      const byId = new Map(rows.map((row) => [row.id, row]));
      const uncategorized = {
        id: '__none',
        name: 'Sans catégorie',
        color: '#94a3b8',
        description: '',
        productCount: 0,
        units: 0,
        value: 0,
        saleValue: 0,
      };
      for (const product of state.products) {
        const row = byId.get(product.categoryId) || uncategorized;
        row.productCount += 1;
        row.units += Number(product.quantity) || 0;
        row.value += (Number(product.quantity) || 0) * (Number(product.purchasePrice) || 0);
        row.saleValue += (Number(product.quantity) || 0) * (Number(product.salePrice) || 0);
      }
      if (uncategorized.productCount > 0) rows.push(uncategorized);
      return rows.sort((a, b) => b.value - a.value);
    },
    supplierBreakdown() {
      const rows = state.suppliers.map((sup) => ({
        id: sup.id,
        name: sup.name,
        contact: sup.contact,
        email: sup.email,
        phone: sup.phone,
        address: sup.address,
        productCount: 0,
        units: 0,
        value: 0,
      }));
      const byId = new Map(rows.map((row) => [row.id, row]));
      const none = { id: '__none', name: 'Sans fournisseur', contact: '', email: '', phone: '', address: '', productCount: 0, units: 0, value: 0 };
      for (const product of state.products) {
        const row = byId.get(product.supplierId) || none;
        row.productCount += 1;
        row.units += Number(product.quantity) || 0;
        row.value += (Number(product.quantity) || 0) * (Number(product.purchasePrice) || 0);
      }
      if (none.productCount > 0) rows.push(none);
      return rows.sort((a, b) => b.value - a.value);
    },
    topProducts(limit = 5) {
      return state.products
        .map((product) => ({
          ...product,
          value: (Number(product.quantity) || 0) * (Number(product.purchasePrice) || 0),
          category: state.categories.find((c) => c.id === product.categoryId) || null,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
    },
    restockList() {
      const threshold = state.settings.defaultThreshold;
      return state.products
        .map((product) => {
          const status = stockStatus(product, threshold);
          const limit = Number.isFinite(Number(product.threshold)) ? Number(product.threshold) : threshold;
          const suggested = Math.max(1, Math.ceil(limit * 2 - (Number(product.quantity) || 0)));
          return { product, status, suggested };
        })
        .filter((row) => row.status.key !== 'ok')
        .sort((a, b) => {
          if (a.status.rank !== b.status.rank) return b.status.rank - a.status.rank;
          const deficitA = (a.product.threshold || 0) - (a.product.quantity || 0);
          const deficitB = (b.product.threshold || 0) - (b.product.quantity || 0);
          return deficitB - deficitA;
        });
    },
    recentMovements(limit = 6) {
      return [...state.movements]
        .sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit)
        .map((movement) => ({
          ...movement,
          product: state.products.find((p) => p.id === movement.productId) || null,
        }));
    },

    /* ----------------------------- produits ---------------------------- */
    addProduct(input = {}) {
      const nowDate = now();
      const name = requireText(input.name, 'Le nom du produit', 80);
      const sku = requireText(input.sku, 'La référence (SKU)', 30).toUpperCase();
      assertUniqueSku(sku);
      const categoryId = normalizeRef(input.categoryId, state.categories, 'La catégorie');
      const supplierId = normalizeRef(input.supplierId, state.suppliers, 'Le fournisseur');
      const purchasePrice = toNumber(input.purchasePrice ?? 0, "Le prix d'achat", { fallback: 0 });
      const salePrice = toNumber(input.salePrice ?? 0, 'Le prix de vente', { fallback: 0 });
      const threshold = toNumber(input.threshold ?? state.settings.defaultThreshold, "Le seuil d'alerte", { fallback: state.settings.defaultThreshold });
      const initialQuantity = toNumber(input.initialQuantity ?? 0, 'Le stock initial', { fallback: 0 });
      const unit = UNITS.includes(input.unit) ? input.unit : 'pièce';

      const product = {
        id: uid(),
        sku,
        name,
        categoryId,
        supplierId,
        purchasePrice,
        salePrice,
        quantity: 0,
        threshold,
        unit,
        location: String(input.location || '').trim().slice(0, 40),
        notes: String(input.notes || '').slice(0, 500),
        createdAt: nowDate.toISOString(),
        updatedAt: nowDate.toISOString(),
      };
      state.products.push(product);

      if (initialQuantity > 0) {
        appendMovement(
          product,
          {
            type: 'in',
            quantity: initialQuantity,
            reason: 'Stock initial',
            reference: '',
            note: '',
            date: nowDate.toISOString(),
          },
          nowDate,
        );
      }
      commit();
      return clone(product);
    },
    updateProduct(id, input = {}) {
      const product = findProduct(id);
      const name = requireText(input.name ?? product.name, 'Le nom du produit', 80);
      const sku = requireText(input.sku ?? product.sku, 'La référence (SKU)', 30).toUpperCase();
      assertUniqueSku(sku, id);
      const categoryId = normalizeRef(input.categoryId !== undefined ? input.categoryId : product.categoryId, state.categories, 'La catégorie');
      const supplierId = normalizeRef(input.supplierId !== undefined ? input.supplierId : product.supplierId, state.suppliers, 'Le fournisseur');
      product.name = name;
      product.sku = sku;
      product.categoryId = categoryId;
      product.supplierId = supplierId;
      product.purchasePrice = toNumber(input.purchasePrice ?? product.purchasePrice, "Le prix d'achat", { fallback: product.purchasePrice });
      product.salePrice = toNumber(input.salePrice ?? product.salePrice, 'Le prix de vente', { fallback: product.salePrice });
      product.threshold = toNumber(input.threshold ?? product.threshold, "Le seuil d'alerte", { fallback: product.threshold });
      if (UNITS.includes(input.unit)) product.unit = input.unit;
      if (input.location !== undefined) product.location = String(input.location).trim().slice(0, 40);
      if (input.notes !== undefined) product.notes = String(input.notes).slice(0, 500);
      product.updatedAt = now().toISOString();
      commit();
      return clone(product);
    },
    deleteProduct(id) {
      const product = findProduct(id);
      state.products = state.products.filter((p) => p.id !== id);
      state.movements = state.movements.filter((m) => m.productId !== id);
      commit();
      return clone(product);
    },

    /* --------------------------- mouvements --------------------------- */
    recordMovement(input = {}) {
      const product = findProduct(input.productId);
      const type = MOVEMENT_TYPES.includes(input.type) ? input.type : null;
      if (!type) throw new Error('Type de mouvement invalide.');
      const quantity = toNumber(
        input.quantity,
        'La quantité',
        { min: type === 'adjust' ? 0 : 0.001 },
      );
      if (type === 'out' && quantity > product.quantity + 1e-9) {
        throw new Error(
          `Stock insuffisant : « ${product.name} » ne dispose que de ${formatNumber(product.quantity)} ${product.unit} en stock.`,
        );
      }
      if (type === 'adjust' && Math.abs(quantity - product.quantity) < 1e-9) {
        throw new Error('Le stock saisi est identique au stock actuel : aucun ajustement nécessaire.');
      }
      const nowDate = now();
      const date = toDate(input.date) || nowDate;
      if (date.getTime() > nowDate.getTime() + 5 * 60 * 1000) {
        throw new Error('La date du mouvement ne peut pas être dans le futur.');
      }
      const createdAt = toDate(product.createdAt);
      if (createdAt) {
        const earliest = new Date(createdAt);
        earliest.setSeconds(0, 0);
        if (date.getTime() < earliest.getTime()) {
          throw new Error('La date du mouvement ne peut pas être antérieure à la création du produit.');
        }
        /* Une date choisie dans la minute de création (précision minute) ne doit pas
           passer avant le mouvement « Stock initial ». */
        if (date.getTime() < createdAt.getTime()) date.setTime(createdAt.getTime());
      }
      const movement = appendMovement(
        product,
        {
          type,
          quantity: round3(quantity),
          reason: String(input.reason || '').trim() || DEFAULT_REASONS[type],
          reference: String(input.reference || '').trim().slice(0, 60),
          note: String(input.note || '').trim().slice(0, 500),
          date: date.toISOString(),
        },
        nowDate,
      );
      commit();
      return { ...movement };
    },

    /* --------------------------- catégories --------------------------- */
    addCategory(input = {}) {
      const name = requireText(input.name, 'Le nom de la catégorie', 50);
      const exists = state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase());
      if (exists) throw new Error(`La catégorie « ${name} » existe déjà.`);
      const category = {
        id: uid(),
        name,
        color: normalizeColor(input.color),
        description: String(input.description || '').trim().slice(0, 200),
      };
      state.categories.push(category);
      commit();
      return clone(category);
    },
    updateCategory(id, input = {}) {
      const category = state.categories.find((c) => c.id === id);
      if (!category) throw new Error('Catégorie introuvable.');
      const name = requireText(input.name ?? category.name, 'Le nom de la catégorie', 50);
      const exists = state.categories.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase());
      if (exists) throw new Error(`La catégorie « ${name} » existe déjà.`);
      category.name = name;
      if (input.color !== undefined) category.color = normalizeColor(input.color);
      if (input.description !== undefined) category.description = String(input.description).trim().slice(0, 200);
      commit();
      return clone(category);
    },
    deleteCategory(id) {
      const category = state.categories.find((c) => c.id === id);
      if (!category) throw new Error('Catégorie introuvable.');
      const used = state.products.filter((p) => p.categoryId === id).length;
      if (used > 0) {
        throw new Error(`Impossible de supprimer « ${category.name} » : ${used} produit(s) y sont rattachés.`);
      }
      state.categories = state.categories.filter((c) => c.id !== id);
      commit();
      return clone(category);
    },

    /* --------------------------- fournisseurs ------------------------- */
    addSupplier(input = {}) {
      const name = requireText(input.name, 'Le nom du fournisseur', 80);
      const exists = state.suppliers.some((s) => s.name.toLowerCase() === name.toLowerCase());
      if (exists) throw new Error(`Le fournisseur « ${name} » existe déjà.`);
      const supplier = {
        id: uid(),
        name,
        contact: String(input.contact || '').trim().slice(0, 80),
        email: String(input.email || '').trim().slice(0, 120),
        phone: String(input.phone || '').trim().slice(0, 40),
        address: String(input.address || '').trim().slice(0, 160),
        notes: String(input.notes || '').trim().slice(0, 300),
      };
      if (supplier.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplier.email)) {
        throw new Error("L'adresse e-mail n'est pas valide.");
      }
      state.suppliers.push(supplier);
      commit();
      return clone(supplier);
    },
    updateSupplier(id, input = {}) {
      const supplier = state.suppliers.find((s) => s.id === id);
      if (!supplier) throw new Error('Fournisseur introuvable.');
      const name = requireText(input.name ?? supplier.name, 'Le nom du fournisseur', 80);
      const exists = state.suppliers.some((s) => s.id !== id && s.name.toLowerCase() === name.toLowerCase());
      if (exists) throw new Error(`Le fournisseur « ${name} » existe déjà.`);
      const next = {
        name,
        contact: input.contact !== undefined ? String(input.contact).trim().slice(0, 80) : supplier.contact,
        email: input.email !== undefined ? String(input.email).trim().slice(0, 120) : supplier.email,
        phone: input.phone !== undefined ? String(input.phone).trim().slice(0, 40) : supplier.phone,
        address: input.address !== undefined ? String(input.address).trim().slice(0, 160) : supplier.address,
        notes: input.notes !== undefined ? String(input.notes).slice(0, 300) : supplier.notes,
      };
      if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) {
        throw new Error("L'adresse e-mail n'est pas valide.");
      }
      Object.assign(supplier, next);
      commit();
      return clone(supplier);
    },
    deleteSupplier(id) {
      const supplier = state.suppliers.find((s) => s.id === id);
      if (!supplier) throw new Error('Fournisseur introuvable.');
      const used = state.products.filter((p) => p.supplierId === id).length;
      if (used > 0) {
        throw new Error(`Impossible de supprimer « ${supplier.name} » : ${used} produit(s) y sont rattachés.`);
      }
      state.suppliers = state.suppliers.filter((s) => s.id !== id);
      commit();
      return clone(supplier);
    },

    /* ---------------------------- paramètres -------------------------- */
    updateSettings(patch = {}) {
      const next = { ...state.settings };
      if (patch.company !== undefined) next.company = requireText(patch.company, "Le nom de l'entreprise", 80);
      if (patch.currency !== undefined) {
        if (!CURRENCIES.some((c) => c.code === patch.currency)) throw new Error('Devise non prise en charge.');
        next.currency = patch.currency;
      }
      if (patch.defaultThreshold !== undefined) {
        next.defaultThreshold = toNumber(patch.defaultThreshold, "Le seuil d'alerte par défaut", { fallback: next.defaultThreshold });
      }
      if (patch.theme !== undefined) {
        if (patch.theme !== 'light' && patch.theme !== 'dark') throw new Error('Thème inconnu.');
        next.theme = patch.theme;
      }
      state.settings = next;
      commit();
      return { ...next };
    },

    /* -------------------------- sauvegarde ---------------------------- */
    exportData() {
      return JSON.stringify(state, null, 2);
    },
    importData(payload) {
      let raw = payload;
      if (typeof payload === 'string') {
        try {
          raw = JSON.parse(payload);
        } catch {
          throw new Error("Ce fichier n'est pas un JSON valide.");
        }
      }
      const next = normalizeSnapshot(raw);
      state = next;
      commit();
      return state;
    },
    resetDemo() {
      state = createSeedState(now);
      commit();
      return state;
    },
    clearAll() {
      state = {
        version: SCHEMA_VERSION,
        settings: { ...state.settings },
        categories: [],
        suppliers: [],
        products: [],
        movements: [],
      };
      commit();
      return state;
    },
  };
}
