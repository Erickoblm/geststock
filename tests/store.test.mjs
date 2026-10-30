import test from 'node:test';
import assert from 'node:assert/strict';

import { createStockStore, createSeedState, STORAGE_KEY, SCHEMA_VERSION } from '../js/store.js';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

function freshStore() {
  const storage = memoryStorage();
  const store = createStockStore({ storage });
  return { store, storage };
}

function emptyStore() {
  const { store } = freshStore();
  store.clearAll();
  return store;
}

function replayQuantity(movements, productId) {
  let quantity = 0;
  for (const movement of movements.filter((m) => m.productId === productId).sort((a, b) => new Date(a.date) - new Date(b.date))) {
    if (movement.type === 'in') quantity += movement.quantity;
    else if (movement.type === 'out') quantity -= movement.quantity;
    else quantity = movement.quantity;
  }
  return quantity;
}

test('les données de démonstration sont complètes et cohérentes', () => {
  const seed = createSeedState(() => new Date('2026-10-30T09:00:00+03:00'));
  assert.equal(seed.version, SCHEMA_VERSION);
  assert.equal(seed.categories.length, 6);
  assert.equal(seed.suppliers.length, 6);
  assert.equal(seed.products.length, 24);
  assert.ok(seed.movements.length > 30);
  for (const product of seed.products) {
    assert.ok(product.quantity >= 0);
    assert.ok(product.threshold >= 0);
    assert.equal(replayQuantity(seed.movements, product.id), product.quantity);
  }
  assert.ok(seed.products.some((p) => p.quantity === 0));
});

test('un nouveau store persiste les données et les recharge', () => {
  const storage = memoryStorage();
  const store = createStockStore({ storage });
  const product = store.addProduct({ name: 'Test', sku: 'test-1', initialQuantity: 5, purchasePrice: 100 });
  const second = createStockStore({ storage });
  const reloaded = second.getProduct(product.id);
  assert.ok(reloaded);
  assert.equal(reloaded.name, 'Test');
  assert.equal(reloaded.sku, 'TEST-1');
  assert.equal(reloaded.quantity, 5);
  assert.ok(storage.getItem(STORAGE_KEY));
});

test('création de produit : validations et stock initial', () => {
  const { store } = freshStore();
  const product = store.addProduct({
    name: '  Produit démo  ',
    sku: 'demo-42',
    initialQuantity: '12',
    purchasePrice: '1500',
    salePrice: '2000',
    threshold: 5,
    unit: 'kg',
  });
  assert.equal(product.name, 'Produit démo');
  assert.equal(product.sku, 'DEMO-42');
  assert.equal(product.quantity, 12);
  assert.equal(product.unit, 'kg');
  const movements = store.getState().movements.filter((m) => m.productId === product.id);
  assert.equal(movements.length, 1);
  assert.equal(movements[0].type, 'in');
  assert.equal(movements[0].reason, 'Stock initial');
  assert.equal(movements[0].newQuantity, 12);

  assert.throws(() => store.addProduct({ name: '', sku: 'X' }), /nom/i);
  assert.throws(() => store.addProduct({ name: 'Sans SKU' }), /référence|sku/i);
  assert.throws(() => store.addProduct({ name: 'Doublon', sku: 'DEMO-42' }), /déjà utilisée/i);
  assert.throws(() => store.addProduct({ name: 'Catégorie inconnue', sku: 'CAT-X', categoryId: 'nope' }), /introuvable/i);
  assert.throws(() => store.addProduct({ name: 'Prix', sku: 'PRIX', purchasePrice: -1 }), /prix/i);
});

test('mise à jour et suppression d’un produit', () => {
  const { store } = freshStore();
  const product = store.addProduct({ name: 'Ancien', sku: 'OLD-1', initialQuantity: 3 });
  store.updateProduct(product.id, { name: 'Nouveau', sku: 'NEW-1', threshold: 2 });
  const updated = store.getProduct(product.id);
  assert.equal(updated.name, 'Nouveau');
  assert.equal(updated.sku, 'NEW-1');
  assert.equal(updated.quantity, 3, 'le stock ne doit pas être modifié par la fiche produit');

  const other = store.addProduct({ name: 'Autre', sku: 'OTHER' });
  assert.throws(() => store.updateProduct(product.id, { sku: other.sku }), /déjà utilisée/i);

  store.deleteProduct(product.id);
  assert.equal(store.getProduct(product.id), null);
  assert.equal(store.getState().movements.filter((m) => m.productId === product.id).length, 0);
  assert.throws(() => store.deleteProduct('inconnu'), /introuvable/i);
});

test('mouvements : entrée, sortie et stock insuffisant', () => {
  const { store } = freshStore();
  const product = store.addProduct({ name: 'Article', sku: 'ART-1', initialQuantity: 10 });
  const entry = store.recordMovement({ productId: product.id, type: 'in', quantity: 5, reason: 'Réapprovisionnement' });
  assert.equal(entry.previousQuantity, 10);
  assert.equal(entry.newQuantity, 15);
  assert.equal(store.getProduct(product.id).quantity, 15);

  const exit = store.recordMovement({ productId: product.id, type: 'out', quantity: 4, reason: 'Vente', reference: 'TCK-1' });
  assert.equal(exit.newQuantity, 11);
  assert.equal(store.getProduct(product.id).quantity, 11);

  assert.throws(
    () => store.recordMovement({ productId: product.id, type: 'out', quantity: 12 }),
    /stock insuffisant/i,
  );
  assert.equal(store.getProduct(product.id).quantity, 11);
  assert.equal(store.getState().movements.filter((m) => m.productId === product.id).length, 3);
});

test('mouvements : ajustement, validations de base', () => {
  const { store } = freshStore();
  const product = store.addProduct({ name: 'Article', sku: 'ART-2', initialQuantity: 10 });
  const adjustment = store.recordMovement({ productId: product.id, type: 'adjust', quantity: 7, reason: 'Inventaire' });
  assert.equal(adjustment.previousQuantity, 10);
  assert.equal(adjustment.newQuantity, 7);
  assert.equal(adjustment.delta, -3);
  assert.equal(store.getProduct(product.id).quantity, 7);

  assert.throws(() => store.recordMovement({ productId: product.id, type: 'in', quantity: 0 }), /quantité/i);
  assert.throws(() => store.recordMovement({ productId: product.id, type: 'out', quantity: -5 }), /quantité/i);
  assert.throws(() => store.recordMovement({ productId: product.id, type: 'invalid', quantity: 1 }), /type/i);
  assert.throws(() => store.recordMovement({ productId: 'inconnu', type: 'in', quantity: 1 }), /introuvable/i);
  assert.throws(() => store.recordMovement({ productId: product.id, type: 'adjust', quantity: 7 }), /identique/i);
});

test('mouvements : la quantité peut être décimale', () => {
  const { store } = freshStore();
  const product = store.addProduct({ name: 'Café en vrac', sku: 'CAFE-V', initialQuantity: 1.5, unit: 'kg' });
  store.recordMovement({ productId: product.id, type: 'out', quantity: 0.25 });
  assert.equal(store.getProduct(product.id).quantity, 1.25);
});

test('catégories : unicité et suppression protégée', () => {
  const { store } = freshStore();
  const category = store.addCategory({ name: 'Nouvelle famille', color: '#123456' });
  assert.equal(category.color, '#123456');
  assert.throws(() => store.addCategory({ name: 'nouvelle famille' }), /existe déjà/i);

  const product = store.addProduct({ name: 'Produit', sku: 'CAT-1', categoryId: category.id });
  assert.ok(product);
  assert.throws(() => store.deleteCategory(category.id), /produit/i);

  store.deleteProduct(product.id);
  store.deleteCategory(category.id);
  assert.equal(store.getCategory(category.id), null);
  assert.throws(() => store.deleteCategory('inconnue'), /introuvable/i);
});

test('fournisseurs : validation e-mail et suppression protégée', () => {
  const { store } = freshStore();
  const supplier = store.addSupplier({ name: 'Nouveau fournisseur', email: 'test@example.com' });
  assert.ok(supplier);
  assert.throws(() => store.addSupplier({ name: 'Nouveau fournisseur' }), /existe déjà/i);
  assert.throws(() => store.addSupplier({ name: 'Email cassé', email: 'pas-un-email' }), /e-mail/i);

  const product = store.addProduct({ name: 'Produit', sku: 'SUP-1', supplierId: supplier.id });
  assert.throws(() => store.deleteSupplier(supplier.id), /produit/i);
  store.deleteProduct(product.id);
  store.deleteSupplier(supplier.id);
  assert.equal(store.getSupplier(supplier.id), null);
});

test('statistiques et sélecteurs', () => {
  const store = emptyStore();
  const category = store.addCategory({ name: 'Catégorie A', color: '#112233' });
  const cheap = store.addProduct({ name: 'Pas cher', sku: 'A-1', categoryId: category.id, initialQuantity: 10, purchasePrice: 100, salePrice: 150, threshold: 20 });
  const dear = store.addProduct({ name: 'Cher', sku: 'A-2', categoryId: category.id, initialQuantity: 2, purchasePrice: 1000, salePrice: 1200, threshold: 5 });
  assert.ok(cheap && dear);

  const stats = store.getStats();
  assert.equal(stats.totalProducts, 2);
  assert.equal(stats.totalUnits, 12);
  assert.equal(stats.stockValue, 10 * 100 + 2 * 1000);
  assert.equal(stats.saleValue, 10 * 150 + 2 * 1200);
  assert.equal(stats.lowStock, 2);
  assert.equal(stats.outOfStock, 0);
  assert.equal(stats.alerts, 2);

  const breakdown = store.categoryBreakdown();
  assert.equal(breakdown.length, 1);
  assert.equal(breakdown[0].productCount, 2);
  assert.equal(breakdown[0].value, 3000);

  const restock = store.restockList();
  assert.equal(restock.length, 2);
  assert.equal(restock[0].product.id, cheap.id);
  assert.equal(restock[0].suggested, 30);

  const flow = store.dailyFlow(7);
  assert.equal(flow.length, 7);
  assert.equal(flow.reduce((sum, row) => sum + row.inbound, 0), 12);
});

test('restockList classe les ruptures avant les stocks bas', () => {
  const store = emptyStore();
  store.addProduct({ name: 'Rupture', sku: 'R-1', initialQuantity: 0, threshold: 10 });
  const low = store.addProduct({ name: 'Bas', sku: 'R-2', initialQuantity: 4, threshold: 10 });
  const list = store.restockList();
  assert.equal(list[0].status.key, 'rupture');
  assert.equal(list[1].product.id, low.id);
});

test('export / import JSON : aller-retour complet', () => {
  const { store } = freshStore();
  const snapshot = store.exportData();
  assert.ok(snapshot.includes('"products"'));

  const { store: other } = freshStore();
  other.importData(snapshot);
  assert.equal(other.getState().products.length, store.getState().products.length);
  assert.equal(other.getState().movements.length, store.getState().movements.length);
  assert.equal(other.getSettings().company, store.getSettings().company);

  assert.throws(() => other.importData('{ pas du json'), /json/i);
  assert.throws(() => other.importData(JSON.stringify({ products: [] })), /sauvegarde invalide/i);
  assert.throws(() => other.importData(JSON.stringify({ products: [{}], categories: [], suppliers: [], movements: [] })), /produit/i);
});

test('import : les mouvements orphelins sont écartés', () => {
  const { store } = freshStore();
  const data = JSON.parse(store.exportData());
  data.movements.push({ id: 'x', productId: 'produit-inexistant', type: 'in', quantity: 1 });
  store.importData(data);
  assert.ok(store.getState().movements.every((m) => store.getProduct(m.productId)));
});

test('paramètres : validation devise, thème et seuil', () => {
  const { store } = freshStore();
  const settings = store.updateSettings({ company: 'Nouvelle société', currency: 'EUR', defaultThreshold: 25, theme: 'dark' });
  assert.equal(settings.company, 'Nouvelle société');
  assert.equal(settings.currency, 'EUR');
  assert.equal(settings.defaultThreshold, 25);
  assert.equal(settings.theme, 'dark');

  assert.throws(() => store.updateSettings({ company: '   ' }), /entreprise/i);
  assert.throws(() => store.updateSettings({ currency: 'BTC' }), /devise/i);
  assert.throws(() => store.updateSettings({ theme: 'fluo' }), /thème/i);
  assert.throws(() => store.updateSettings({ defaultThreshold: -5 }), /seuil/i);
});

test('réinitialisation et effacement', () => {
  const { store } = freshStore();
  store.clearAll();
  assert.equal(store.getState().products.length, 0);
  assert.equal(store.getState().movements.length, 0);
  assert.equal(store.getState().categories.length, 0);

  store.resetDemo();
  assert.equal(store.getState().products.length, 24);
});

test('un stockage corrompu est remplacé par la démonstration', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: 'données illisibles' });
  const store = createStockStore({ storage });
  assert.equal(store.getState().products.length, 24);
});

test('un mouvement antidaté recalcule le grand livre dans l’ordre chronologique', () => {
  let current = new Date('2026-01-10T10:00:00.000Z');
  const store = createStockStore({ storage: memoryStorage(), now: () => new Date(current) });
  store.clearAll();
  const product = store.addProduct({ name: 'Rétroactif', sku: 'RETRO-1', initialQuantity: 10 });

  current = new Date('2026-01-10T10:10:00.000Z');
  const backdatedIn = store.recordMovement({
    productId: product.id,
    type: 'in',
    quantity: 5,
    date: '2026-01-10T10:05:00.000Z',
  });
  const backdatedOut = store.recordMovement({
    productId: product.id,
    type: 'out',
    quantity: 3,
    date: '2026-01-10T10:02:00.000Z',
  });

  const ledger = store
    .getState()
    .movements.filter((movement) => movement.productId === product.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt));

  let running = 0;
  for (const movement of ledger) {
    assert.equal(movement.previousQuantity, running, `previousQuantity incohérent pour ${movement.type}`);
    running = movement.type === 'in' ? running + movement.quantity : running - movement.quantity;
    assert.equal(movement.newQuantity, running, `newQuantity incohérent pour ${movement.type}`);
    assert.equal(movement.delta, movement.quantity * (movement.type === 'in' ? 1 : -1));
  }
  assert.equal(store.getProduct(product.id).quantity, 12);
  const storedIn = ledger.find((movement) => movement.id === backdatedIn.id);
  const storedOut = ledger.find((movement) => movement.id === backdatedOut.id);
  assert.equal(storedIn.newQuantity, 12);
  assert.equal(storedOut.newQuantity, 7);
});

test('un mouvement antérieur à la création du produit ou futur est refusé', () => {
  let current = new Date('2026-01-10T10:00:00.000Z');
  const store = createStockStore({ storage: memoryStorage(), now: () => new Date(current) });
  store.clearAll();
  const product = store.addProduct({ name: 'Daté', sku: 'DATE-1', initialQuantity: 5 });

  current = new Date('2026-01-10T10:10:00.000Z');
  assert.throws(
    () => store.recordMovement({ productId: product.id, type: 'in', quantity: 1, date: '2026-01-09T10:00:00.000Z' }),
    /antérieure/i,
  );
  assert.throws(
    () => store.recordMovement({ productId: product.id, type: 'in', quantity: 1, date: '2026-01-10T12:00:00.000Z' }),
    /futur/i,
  );
  assert.equal(store.getProduct(product.id).quantity, 5);
});

test('le seuil 0 survit à un export/import', () => {
  const { store } = freshStore();
  const product = store.addProduct({ name: 'Seuil zéro', sku: 'ZERO-1', threshold: 0 });
  const { store: other } = freshStore();
  other.importData(store.exportData());
  assert.equal(other.getProduct(product.id).threshold, 0);
});

test('les libellés et référentiels exposés sont valides', () => {
  const { store } = freshStore();
  const state = store.getState();
  for (const product of state.products) {
    assert.ok(['pièce', 'kg', 'L', 'carton', 'paquet', 'lot'].includes(product.unit));
    if (product.categoryId) assert.ok(store.getCategory(product.categoryId));
    if (product.supplierId) assert.ok(store.getSupplier(product.supplierId));
  }
  for (const movement of state.movements) {
    assert.ok(['in', 'out', 'adjust'].includes(movement.type));
    assert.equal(movement.productName, store.getProduct(movement.productId)?.name);
  }
});
