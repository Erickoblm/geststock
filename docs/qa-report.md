# Rapport QA — GestStock

**Campagne QA indépendante et adversariale**
Date : 30 octobre 2026 · Applicatif : GestStock 1.0 (HTML/CSS/JS sans dépendance)
Rapporteur : QA indépendant (`qa-verifier`) · Version du rapport : 1.0

> **Mise à jour du 30/10/2026** : les 5 défauts mineurs signalés ci-dessous ont été corrigés.
> Voir l'**addendum en fin de rapport** : recette rejouée à **69/69**, tests unitaires **20/20** et
> test d'intégration **13/13**.

---

## 1. Synthèse

| Indicateur | Résultat |
| --- | --- |
| Tests unitaires existants (`tests/store.test.mjs`) | **17 / 17 OK** |
| Test e2e existant (`scripts/smoke.mjs`, CDP) | **13 / 13 OK** |
| Vérifications QA indépendantes (`scripts/qa/qa.mjs`, 69 contrôles) | **68 OK / 1 KO** |
| Bugs bloquants | **0** |
| Bugs majeurs | **0** |
| Bugs mineurs (KO + constats confirmés) | **5 défauts mineurs** (dont 8 constats ponctuels) |
| Erreurs console inattendues | **0** sur l'ensemble du parcours |
| **Avis global** | **GO avec réserves** — application fonctionnelle et robuste sur le parcours nominal et la plupart des cas limites ; 5 défauts mineurs à corriger, aucun ne bloque une démonstration ou une mise à disposition encadrée. |

Points saillants :

- Le cœur métier est solide : CRUD produits/catégories/fournisseurs, entrées/sorties/ajustements, refus de stock insuffisant,
  protections de suppression, exports JSON/CSV, import JSON, réinitialisation, persistance localStorage et responsive fonctionnent.
- **Aucune faille XSS** détectée (échappement HTML systématique, y compris pour les noms hostiles).
- **Aucune incohérence de stock** : après une série de mouvements, `stock = stock initial + entrées − sorties (ajustements)` pour tous les produits.
- Le KO automatisé concerne **l'horodatage des mouvements à la minute**, qui peut désordonner le journal (stock correct, historique affiché incohérent). Les 4 autres défauts ont été confirmés par des constats ciblés (thème non réappliqué, pseudo-catégories/fournisseurs, montant compact sans devise, accessibilité des modales/tiroir).

---

## 2. Environnement et méthodologie

- Workspace : `C:\Users\ERICKO\Documents\deepseek-harness\default-workspace`
- Serveur statique existant : `http://127.0.0.1:4173` (non redémarré)
- Navigateur : Chrome headless déjà lancé, protocole DevTools sur `http://127.0.0.1:9333` (profil `.qa-chrome-profile`) ; pilotage via Node 24 (`WebSocket` + `fetch`), sans dépendance.
- Viewports testés : **1600 × 1100** (desktop), **768 × 950** (tablette), **390 × 844** (mobile, `mobile: true`).
- État de départ : `localStorage` vidé puis « Recharger la démo » pour forcer un état connu et persisté (24 produits / 6 catégories / 6 fournisseurs). `localStorage` vidé et démo restaurée en fin de campagne.
- Instrumentation :
  - `Runtime.evaluate` pour piloter les formulaires/clics et lire le DOM **et** le `localStorage` (clé `geststock.data.v1`), ce qui permet de comparer l'interface aux données réellement persistées ;
  - `Input.dispatchKeyEvent` pour les touches réelles **Échap** et **Tab** (fermeture de modale, focus visible, piège de focus) ;
  - `Emulation.setDeviceMetricsOverride` pour les paliers responsive ;
  - interception des téléchargements (`URL.createObjectURL` + `HTMLAnchorElement.click`) conservant le **nom, le type MIME, le texte et les premiers octets** de chaque fichier exporté (vérification du BOM UTF-8) ;
  - `DOM.setFileInputFiles` pour l'import d'une sauvegarde JSON réelle (export → modification → réimport).
- Captures : `screenshots/qa/` (14 fichiers, cf. § 9).
- Script rejouable : `scripts/qa/qa.mjs` ; résultats machine : `scripts/qa/_runs/last-results.json`.

---

## 3. Résultats des tests existants

### 3.1 Tests unitaires — `node tests/store.test.mjs`

**17 / 17 OK** (0 échec, 0 annulé). Le seul message sur stderr est le `console.warn` attendu du test « stockage corrompu ».

### 3.2 Test e2e CDP — `node scripts/smoke.mjs`

**13 / 13 vérifications réussies.** Le test a été exécuté depuis un répertoire de travail QA (`scripts/qa/_runs/smoke`) afin que ses captures ne modifient pas le dossier `screenshots/` de l'application ; il valide le chargement, la création/recherche/pagination produit, le refus de stock insuffisant, les filtres, le journal, le thème, les paramètres, la catégorie, le responsive mobile et l'absence d'erreurs JS.

---

## 4. Tableau des vérifications QA indépendantes (69 contrôles)

Légende : OK = comportement conforme ; KO = défaut confirmé (voir § 5).

### A. Socle applicatif et tableau de bord

| ID | Vérification | Statut |
| --- | --- | --- |
| A1 | Chargement : titre, navigation (7 liens), 4 KPI, graphiques SVG accessibles, date, `lang="fr"` | OK |
| A2 | KPI cohérents avec les données persistées (unités, valeur, produits) | OK |
| A3 | Badge d'alertes et « Santé du stock » cohérents avec les seuils | OK |
| A4 | Derniers mouvements : 6 lignes triées du plus récent au plus ancien | OK |

### B. CRUD produits, filtres, tri, pagination, modales

| ID | Vérification | Statut |
| --- | --- | --- |
| B1 | Catalogue : 8 lignes, pagination, méta (produits/unités/valeur) cohérentes | OK |
| B2 | Création produit complète (stock initial + mouvement « Stock initial », persistance) | OK |
| B3 | Nom vide refusé, SKU en doublon refusé (insensible à la casse), modale maintenue | OK |
| B4 | Édition produit préremplie, stock inchangé, unicité du SKU | OK |
| B5 | Bouton « Générer » : SKU proposé valide et unique | OK |
| B6 | Recherche nom/SKU/emplacement + filtres catégorie et statut (stock bas, rupture) | OK |
| B7 | Tris nom A→Z/Z→A, stock croissant/décroissant, valeur décroissante | OK |
| B8 | Pagination multi-pages, bornes désactivées, comptages | OK |
| B9 | État vide « Aucun produit trouvé » + réinitialisation des filtres | OK |
| B10 | Suppression produit : confirmation, annulation, suppression du produit **et de son historique** | OK |
| B11 | Réapprovisionnement rapide : type `in`, produit et quantité préremplis, aperçu | OK |
| B12 | Nom hostile `<img onerror=…>` affiché échappé, aucun script exécuté | OK |
| B13 | Modales : clic sur le fond ferme, clic à l'intérieur ne ferme pas (formulaire et confirmation) | OK |

### C. Mouvements de stock

| ID | Vérification | Statut |
| --- | --- | --- |
| C1 | Journal : période « tout », 12 lignes/page, méta et chips cohérents | OK |
| C2 | Entrée : stock 10 → 15, mouvement `previous/new/delta` corrects | OK |
| C3 | Sortie : stock 15 → 12, traçabilité correcte | OK |
| C4 | Sortie refusée si stock insuffisant : message avec stock disponible, modale maintenue, stock inchangé | OK |
| C5 | Ajustement absolu (12 → 20) puis refus si quantité identique | OK |
| C6 | Quantités 0 et négative refusées | OK |
| C7 | Quantité décimale acceptée ; chaîne du grand livre cohérente à l'insertion | OK |
| **C7b** | **Journal trié par date : le « Stock initial » ne doit pas apparaître comme le mouvement le plus récent** | **KO** |
| C8 | Mouvement antidaté accepté, stock total exact, chaîne chronologique non recalculée | OK* |
| C9 | Filtres type/période + recherche par référence et par produit | OK |
| C10 | Pagination du journal (12 par page) | OK |
| C11 | Cohérence finale : stock = stock initial + entrées − sorties (ajustements) pour tous les produits | OK |

\* C8 est OK sur l'invariant de stock, mais son constat alimente le bug n° 1 (voir § 5).

### D. Catégories et fournisseurs

| ID | Vérification | Statut |
| --- | --- | --- |
| D1 | 6 catégories, compteur, suppression protégée | OK |
| D2 | Création catégorie avec couleur choisie ; doublon de nom refusé | OK |
| D3 | Édition puis suppression d'une catégorie inutilisée | OK |
| D4 | Suppression d'une catégorie utilisée refusée avec message explicite | OK |
| D5 | Produit sans catégorie : la carte « Sans catégorie » ne doit pas exposer d'actions cassées | OK* |
| D6 | Fournisseurs : création, e-mail invalide refusé, doublon refusé, édition, suppression | OK |
| D7 | Suppression d'un fournisseur utilisé refusée avec message explicite | OK |
| D8 | Produit sans fournisseur : la ligne « Sans fournisseur » ne doit pas exposer d'actions cassées | OK* |
| D9 | Nettoyage des produits sans catégorie/fournisseur : les pseudo-entrées disparaissent | OK |

\* D5/D8 sont OK comme tests de non-régression fonctionnelle, mais les actions exposées sont défectueuses (bug n° 3).

### E. Paramètres, sauvegarde, exports

| ID | Vérification | Statut |
| --- | --- | --- |
| E1 | Paramètres affichés conformes aux données (entreprise, devise, seuil, thème) | OK |
| E2 | Enregistrement entreprise + seuil, persistance après rechargement | OK |
| E3 | Seuil par défaut prérempli dans la modale nouveau produit | OK |
| E4 | Export JSON : nom, MIME, contenu parseable conforme aux données | OK |
| E5 | Import JSON valide : restauration des données, toast de succès | OK* |
| E6 | Thème importé appliqué après rechargement complet | OK |
| E7 | Import JSON invalide : message clair, données intactes | OK |
| E8 | Bascule de thème, persistance, option active, `aria-label` du bouton | OK |
| E9 | Réinitialisation démo : 24 produits restaurés, paramètres par défaut | OK* |
| E10 | Devise EUR : reformatage des montants, persistance | OK* |
| E11 | Export CSV produits : BOM UTF-8 (EF BB BF), en-tête, séparateur `;`, lignes et valeurs | OK |
| E12 | Export CSV mouvements : BOM, en-tête, tri chronologique, libellés traduits | OK |
| E13 | « Tout effacer » : listes vides, états vides des 4 pages, avertissement sans produit | OK |

\* E5/E9/E10 sont OK sur la fonction principale, mais révèlent les bugs n° 2 et 4.

### F. Responsive

| ID | Vérification | Statut |
| --- | --- | --- |
| F1 | Desktop 1600 px : barre latérale visible, menu masqué, pas de débordement | OK |
| F2 | Tablette 768 px : tiroir fermé/ouvert/fermé (overlay), pas de débordement | OK |
| F2b | Tablette 768 px : tableau scrollable, modale dans l'écran | OK |
| F3 | Mobile 390 px : 7 pages sans débordement horizontal, tableau scrollable, tiroir opérationnel | OK |
| F4 | Mobile 390 px : modale produit dans l'écran, pied de modale visible | OK |
| F5 | Mobile 390 px : le tiroir fermé doit être retiré du parcours clavier/lecteur d'écran | OK* |
| F6 | Retour desktop 1600 px rétabli | OK |

\* F5 OK comme test de non-régression du tiroir, mais le constat révèle un défaut d'accessibilité (bug n° 5).

### G. Accessibilité de base

| ID | Vérification | Statut |
| --- | --- | --- |
| G1 | Tous les boutons ont un nom accessible (aria-label/titre/texte) | OK |
| G2 | Tous les champs de la modale produit sont étiquetés | OK |
| G2b | Champs et filtres des écrans Produits et Paramètres étiquetés | OK |
| G3 | `aria-current="page"` unique et correct sur les 7 routes ; `document.title` et `h1` synchronisés | OK |
| G4 | Focus clavier visible (`:focus-visible` : contour 2 px) | OK |
| G5 | Modale : attributs ARIA + comportement de piège de focus et arrière-plan | OK* |
| G6 | Retour du focus sur le déclencheur après Échap sur une confirmation | OK |
| G7 | Notifications : `aria-live="polite"`, bouton de fermeture nommé | OK |

\* G5 OK sur les attributs ARIA, mais le piège de focus est absent (bug n° 5).

### H. Persistance et console

| ID | Vérification | Statut |
| --- | --- | --- |
| H1 | Produit créé + mouvements survivent à un rechargement complet (4 + 6 = 10) | OK |
| H2 | Aucune erreur console inattendue sur l'ensemble du parcours | OK |
| H3 | `lang`, méta description, viewport, favicon (HTTP 200), `noscript`, un seul `h1` | OK |

**Total : 68 OK / 1 KO sur 69 contrôles automatisés.**

---

## 5. Bugs détaillés

> Aucun bug bloquant ni majeur. Les 5 défauts ci-dessous sont **mineurs** ; ils n'empêchent pas l'utilisation
> de l'application ni ne corrompent les quantités en stock.

### Bug n° 1 — Horodatage des mouvements à la minute : le journal peut être affiché dans un ordre incohérent

- **Sévérité : mineure** (KO C7b ; constat complémentaire C8)
- **Fichiers concernés** : `js/utils.js` (`toDatetimeLocal` : format `HH:MM` sans secondes), `js/app.js`
  (`openMovementModal` : date préremplie à la minute), `js/store.js` (`recordMovement` : date du mouvement reprise
  du formulaire alors que le mouvement « Stock initial » utilise un horodatage précis à la milliseconde).
- **Étapes de reproduction**
  1. Produits → « Nouveau produit » : nom `QA Mouvement`, SKU `QA-MVT`, stock initial `10`, puis créer.
  2. Dans la même minute, cliquer sur « Nouveau mouvement » : **Entrée** +5 sur ce produit, laisser la date
     préremplie (précision minute), enregistrer.
  3. Mouvements → période « Tout l'historique » → rechercher `QA Mouvement`.
- **Attendu** : le journal, trié du plus récent au plus ancien, présente d'abord l'entrée +5, puis le stock initial ;
  la colonne « Stock après » se lit 10 → 15 (ordre chronologique).
- **Obtenu** : le mouvement « Stock initial » (horodaté à la seconde près) est affiché **au-dessus** de l'entrée +5 ;
  la colonne « Stock après » se lit 10 → 15 → 12 → 20 → 20,5, ce qui est incohérent.
  La somme des mouvements et la quantité en stock restent exactes ; c'est l'ordre affiché qui est faux.
- **Preuve** : `screenshots/qa/11-journal-ordre-mouvements.png` (mouvement « Stock initial +10 / Stock après 10 »
  affiché au-dessus des mouvements à 15 / 12 / 20 / 20,5).
- **Impact / fréquence** : tout mouvement enregistré dans la minute qui suit la création d'un produit (cas fréquent
  en démonstration et en saisie rapide) affiche un historique incohérent ; les exports CSV trient aussi par date,
  donc l'anomalie se propage aux exports.
- **Constats complémentaires (C8)** : les mouvements **antidatés** sont acceptés sans avertissement. Le stock total
  reste juste, mais la chaîne `previousQuantity → newQuantity` n'est plus recalculée dans l'ordre chronologique :
  dans le test, 4 lignes sur 6 sont incohérentes en lecture par date.
- **Piste de correction (non appliquée — périmètre QA)** : conserver les secondes dans `toDatetimeLocal`/l'input
  (ou stocker un `createdAt` précis) et trier le journal par `createdAt` en cas d'égalité de date ; ajouter un
  avertissement pour les dates antidatées, ou recalculer la chaîne du grand livre.

### Bug n° 2 — Le thème importé ou réinitialisé n'est pas appliqué immédiatement

- **Sévérité : mineure** (constats E5 et E9)
- **Fichiers concernés** : `js/app.js` (`onDocumentChange` après `store.importData`, `resetDemo` : appellent
  `render()` mais pas `applyTheme()`).
- **Reproduction A — import**
  1. Paramètres → « Télécharger une sauvegarde (JSON) ».
  2. Modifier le fichier : `settings.theme = "dark"` (et `settings.company = "Import QA"`).
  3. « Restaurer une sauvegarde » avec ce fichier.
- **Attendu** : l'interface passe immédiatement en thème sombre, cohérente avec l'option « Sombre » désormais active.
- **Obtenu** : l'option « Sombre » est cochée dans Paramètres mais l'interface reste en thème clair ; il faut
  recharger la page pour que le thème soit appliqué (après rechargement, le thème persiste correctement).
- **Preuve** : `screenshots/qa/13-theme-import-non-applique.png` (option « Sombre » active, interface claire).
- **Reproduction B — réinitialisation** : passer en thème sombre, puis Paramètres → Zone sensible →
  « Recharger la démo » → les paramètres stockés repassent en `light`, mais l'interface reste sombre jusqu'au
  rechargement.
- **Impact** : incohérence visuelle temporaire et confusion sur le thème réellement actif ; sans perte de données.

### Bug n° 3 — Pseudo-catégorie « Sans catégorie » et pseudo-fournisseur « Sans fournisseur » exposent des actions cassées

- **Sévérité : mineure** (constats D5 et D8)
- **Fichiers concernés** : `js/store.js` (`categoryBreakdown`/`supplierBreakdown` ajoutent une ligne fictive
  `__none`), `js/app.js` (`pageCategories`/`pageSuppliers` rendent les boutons Modifier/Supprimer pour ces lignes,
  et le compteur de page utilise le nombre de lignes).
- **Étapes de reproduction**
  1. Produits → créer un produit **sans catégorie** et **sans fournisseur**.
  2. Catégories : une carte « Sans catégorie » apparaît avec les boutons « Modifier » et « Supprimer » ;
     le titre annonce « 7 catégorie(s) » alors qu'il n'y en a que 6.
     - « Modifier » → toast « Catégorie introuvable. » (aucune modale).
     - « Supprimer » → aucune action, aucun message (le dernier toast reste affiché).
  3. Fournisseurs : comportement identique sur la ligne « Sans fournisseur » (« Fournisseur introuvable. » /
     aucun effet), titre « 7 fournisseur(s) » pour 6 fournisseurs.
- **Attendu** : la pseudo-entrée de regroupement ne propose pas d'actions (ou propose « Réaffecter les produits »),
  et les compteurs n'incluent pas la pseudo-entrée.
- **Obtenu** : boutons actifs mais sans effet / avec un message d'erreur, et compteurs gonflés.
- **Preuve** : `screenshots/qa/12-pseudo-categorie.png` (carte « Sans catégorie », toast « Catégorie introuvable. »,
  « 7 catégorie(s) »).
- **Impact** : confusion et clics sans effet ; pas de risque de perte de données (les handlers ne font rien).

### Bug n° 4 — Montant compact du graphique sans symbole de devise pour les devises autres que MGA

- **Sévérité : mineure** (constat E10)
- **Fichier concerné** : `js/utils.js` (`formatMoneyCompact` n'ajoute le symbole que pour `MGA`).
- **Étapes de reproduction**
  1. Paramètres → Devise : **Euro (€)** → Enregistrer.
  2. Tableau de bord → lire le centre du donut « Répartition de la valeur ».
- **Attendu** : un montant compact avec devise, par exemple `4,1 M €`.
- **Obtenu** : `4,1 M` (sans `€`) ; de même `xx k` / `xx Md` sans symbole pour les autres devises.
- **Impact** : ambiguïté de lecture du montant central du graphique ; le reste de l'interface affiche bien `€`.

### Bug n° 5 — Accessibilité : piège de focus absent dans les modales et tiroir fermé toujours focusable

- **Sévérité : mineure** (constats G5 et F5)
- **Fichiers concernés** : `js/app.js` (`openModal`/`confirmDialog` : pas de piège de focus, arrière-plan non
  `inert`/`aria-hidden`), `init()` (tiroir : pas d'`aria-expanded`, pas de fermeture par Échap, pas de gestion
  du focus), `assets/styles.css` (tiroir masqué par `transform`, sans `visibility:hidden`).
- **Reproduction A — modale**
  1. Produits → « Nouveau produit ».
  2. Appuyer plusieurs fois sur **Tab**.
- **Attendu** : le focus reste dans la modale (cycle) et l'arrière-plan est inerte (`inert` ou `aria-hidden`).
- **Obtenu** : après quelques Tab, le focus sort de la modale vers l'arrière-plan (document BODY, puis éléments
  de la page) ; `.app-shell` n'est ni `inert` ni `aria-hidden`. Échap et le retour de focus sur le déclencheur
  fonctionnent en revanche correctement.
- **Reproduction B — tiroir mobile/tablette (≤ 1024 px)**
  1. À 390 px ou 768 px, tiroir fermé, tabuler depuis le début de la page.
- **Attendu** : les 9 éléments du tiroir fermé ne sont pas atteignables au clavier/lecteur d'écran.
- **Obtenu** : 9 éléments restent focalisables hors écran (`right=0`), sans `aria-hidden` ni `inert` ;
  le bouton menu n'expose pas `aria-expanded` ; **Échap ne ferme pas le tiroir** (seuls l'overlay, le bouton
  « Fermer » et les liens le ferment).
- **Impact** : navigation clavier/lecteur d'écran confuse ; aucun impact sur les utilisateurs souris.

---

## 6. Points d'amélioration (non bloquants, non classés bugs)

1. **CSV en français** : séparateur `;` (correct pour Excel FR) mais nombres décimaux au format `1.5` (point).
   Pour des unités comme `kg` ou `L`, Excel FR peut interpréter la décimale comme du texte. Harmoniser avec la virgule
   ou documenter l'import.
2. **Import JSON** : les quantités ne sont pas recalculées à partir des mouvements ; une sauvegarde modifiée à la main
   peut introduire un stock incohérent sans avertissement. Proposer un contrôle de cohérence (ou un avertissement).
3. **Stockage local indisponible** (quota, navigation privée) : `store.js` ne fait qu'un `console.warn` ; prévenir
   l'utilisateur que les données ne seront pas conservées.
4. **Dates** : aucune validation/garde-fou sur les dates futures ou antidatées (cf. bug n° 1) ; proposer un avertissement.
5. **Validations métier** : `prix de vente < prix d'achat` accepté (marge négative) et quantités décimales autorisées
   pour des unités « pièce » ; un avertissement ou une contrainte par unité serait utile.
6. **Tableaux** : ajouter `scope="col"` aux `th` et `aria-sort` sur la colonne de tri active.
7. **Fermeture de modale** : clic sur le fond/Échap ferme un formulaire déjà rempli sans confirmation ; envisager
   une confirmation si des modifications sont en cours.
8. **Multi-onglets** : dernier écrivain gagne (pas de synchronisation `storage`) ; un avertissement serait prudent.
9. **Tiroir** : ajouter `aria-expanded`, fermeture par Échap, focus sur le premier lien à l'ouverture.
10. **Route inconnue** : retombe silencieusement sur le tableau de bord ; une page 404 légère serait plus claire.

---

## 7. Limites de la campagne

- Téléchargements vérifiés par **interception du Blob** (nom, MIME, texte, premiers octets/BOM) : le fichier n'a pas été
  écrit sur disque, ce qui évite toute interaction avec la boîte de dialogue native du navigateur.
- Accessibilité : contrôles structurels (noms, labels, `aria-current`, focus visible, piège de focus, ordre clavier) ;
  **le contraste des couleurs et les lecteurs d'écran réels n'ont pas été mesurés**.
- Uniquement **Chrome headless** (pas de Firefox/Safari), un seul profil et un seul poste ; pas de test de charge
  ni de quota `localStorage`.
- Les interactions sont majoritairement des clics DOM via CDP (comportement équivalent aux clics utilisateur pour les
  handlers), les touches Tab/Échap étant envoyées via `Input.dispatchKeyEvent`.
- Les tests sont exécutés sur un serveur et un navigateur **fournis par l'environnement**, non redémarrés ; l'état
  `localStorage` a été réinitialisé avant et après la campagne.

---

## 8. Avis Go / No-Go

**GO avec réserves.**

- Aucun **bloquant** ni **majeur** : le parcours complet (produits, mouvements, catégories, fournisseurs, paramètres,
  exports/import, responsive, persistance) fonctionne, les données restent cohérentes et aucune erreur console
  inattendue n'a été observée.
- Les **5 défauts mineurs** doivent être corrigés avant une mise en production large, en priorité :
  1. horodatage des mouvements (bug n° 1) — impacte l'historique et les exports ;
  2. thème non réappliqué (bug n° 2) — incohérence visible ;
  3. accessibilité modales/tiroir (bug n° 5) — conformité et confort clavier.
- Les bugs n° 3 et n° 4 sont cosmétiques/fonctionnels mineurs et peuvent être planifiés sans bloquer une démonstration.
- **Recommandation** : GO pour démonstration / usage encadré ; GO pour production après correction des 5 mineurs et
  ré-exécution de `node tests/store.test.mjs`, `node scripts/smoke.mjs` et `node scripts/qa/qa.mjs`.

---

## 9. Artefacts

### Captures (`screenshots/qa/`)

| Fichier | Contenu |
| --- | --- |
| `01-dashboard-desktop.png` | Tableau de bord, 1600 px, thème clair |
| `02-dashboard-dark.png` | Tableau de bord, thème sombre persistant |
| `03-mobile-menu.png` | Tiroir de navigation ouvert, 390 px |
| `04-mobile-modal-produit.png` | Modale « Nouveau produit », 390 px |
| `05-rapports.png` | Page Rapports |
| `06-categories.png` | Page Catégories (6 catégories réelles) |
| `07-parametres.png` | Page Paramètres |
| `08-modal-produit-desktop.png` | Modale produit, 1600 px |
| `09-mobile-dashboard.png` | Tableau de bord, 390 px |
| `10-mobile-mouvements.png` | Journal des mouvements, 390 px |
| `11-journal-ordre-mouvements.png` | **Preuve bug n° 1** : « Stock initial » affiché avant des mouvements plus récents |
| `12-pseudo-categorie.png` | **Preuve bug n° 3** : carte « Sans catégorie » + actions cassées + compteur |
| `13-theme-import-non-applique.png` | **Preuve bug n° 2** : option « Sombre » active, interface claire |
| `14-tablette-modal-produit.png` | Modale produit, 768 px |

### Fichiers de test

- `scripts/qa/qa.mjs` — campagne QA indépendante (69 contrôles, captures, 1600/768/390 px, a11y, console, exports).
  Prérequis : serveur `http://127.0.0.1:4173` et Chrome CDP `http://127.0.0.1:9333` déjà lancés.
  Exécution : `node scripts/qa/qa.mjs` (code de sortie 1 si au moins un KO — attendu ici à cause du bug n° 1).
- `scripts/qa/_runs/last-results.json` — résultats machine de la dernière campagne (contrôles, KO, observations, erreurs console).
- `scripts/qa/_runs/import-valid.json` / `import-invalid.json` — fixtures d'import générées/utilisées par la campagne.

### Hygiène des données

Avant et après la campagne : `localStorage` vidé puis jeu de démonstration rechargé, afin de ne laisser aucun produit
de test (`QA-*`). Aucun fichier de l'application n'a été modifié (seuls `docs/qa-report.md`, `scripts/qa/**` et
`screenshots/qa/**` sont livrés par cette campagne).

---

## Addendum Lead — corrections post-recette et re-vérification (30/10/2026)

Les cinq défauts signalés ont été corrigés puis la recette complète a été rejouée.

### Correctifs appliqués

1. **Grand livre chronologique** — `store.js` recalcule le grand livre de chaque produit dans l'ordre des
   dates de mouvement (`previousQuantity`, `newQuantity`, `delta`, stock courant). Les secondes sont
   désormais prises en compte dans l'horodatage des mouvements, et une date saisie dans la minute de
   création du produit est calée sur l'instant de création. Une date antérieure à la création du
   produit ou dans le futur est refusée avec un message explicite.
2. **Thème immédiat** — `applyTheme()` est appelé à chaque rendu : l'import d'une sauvegarde et le
   rechargement de la démonstration appliquent immédiatement le thème stocké.
3. **Pseudo-catégories / pseudo-fournisseurs** — les cartes « Sans catégorie » et la ligne
   « Sans fournisseur » n'exposent plus d'actions Modifier/Supprimer ; elles affichent une mention
   « Produits non classés » / « Non affecté » et les compteurs ne comptent que les entités réelles.
4. **Montant compact** — `formatMoneyCompact()` ajoute le symbole de la devise (ex. « 4,1 M € »).
5. **Accessibilité** — piège de focus dans les modales et arrière-plan rendu `inert`, tiroir de
   navigation fermé rendu `inert`/`aria-hidden` en mobile, `aria-expanded` sur le bouton menu, fermeture
   du tiroir par Échap.
6. Correctifs complémentaires : seuil `0` conservé après import, mise à jour fournisseur atomique en
   cas d'e-mail invalide, meilleur état vide du catalogue, erreurs attendues journalisées en
   `console.warn`.

### Re-vérification

| Suite | Résultat |
| --- | --- |
| `node tests/store.test.mjs` | **20/20** (dont 3 tests ajoutés sur les dates et le recalcul) |
| `node scripts/smoke.mjs` | **13/13** |
| `node scripts/qa/qa.mjs` | **69/69** (2 observations informatives sur les pseudo-entités) |

Les attentes de la campagne QA ont été adaptées au nouveau comportement attendu : D5/D8 vérifient
l'absence d'actions sur les pseudo-entités, C8 vérifie le refus d'une date antérieure à la création
puis l'acceptation et le recalcul d'un mouvement antidaté valide, E13 tient compte du nouvel état vide
du catalogue. Le harnais QA charge désormais l'application avant `localStorage.clear()` (le navigateur
démarre sur `about:blank`, contexte où `localStorage` est inaccessible).
