/* 0.41 : apprentis et ouvriers par atelier, embauchés en écus ; l'ancienne boucle de l'argent est retirée. */
"use strict";
const assert = require("assert/strict");
const D = require("../js/data.js");
const { createEngine } = require("../js/engine.js");
const Ateliers = require("../js/ateliers.js");
const TR = D.TRAVAILLEURS;
let passed = 0;
function test(n, fn) {
  try { fn(); passed++; console.log("  ✓ " + n); }
  catch (e) { console.log("  ✗ " + n + "\n    " + (e.stack || e)); process.exitCode = 1; }
}
let t;
function jeu(age) {
  t = 2e12;
  const E = createEngine({ now: () => t, rand: () => 0.99 });
  E.state.age = age;
  for (const z of D.ZONES) E.state.zones[z.id] = true;
  for (const [id, it] of Object.entries(D.ITEMS)) if (it.r && it.a <= age && !it.sec && !it.path) E.learn(id, true);
  E.recalc();
  return { E, A: Ateliers.create({ E, D }) };
}
const avance = (E, s) => { for (let i = 0; i < s; i++) { t += 1000; E.update(); } };

console.log("Travailleurs (0.41)");
test("renvoyer : personne à renvoyer, un travailleur de moins, aucun remboursement, prix suivant inchangé (0.45.2)", () => {
  const { E } = jeu(5);
  E.state.ecus = 1e6;
  assert.equal(E.licencier("artisanat", "apprenti").why, "personne");
  assert.equal(E.licencier("artisanat", "nimporte").why, "inconnu");
  E.embaucher("artisanat", "apprenti"); E.embaucher("artisanat", "apprenti");
  const prix = E.coutEmbauche("artisanat", "apprenti"), ecus = E.state.ecus;
  assert.equal(E.licencier("artisanat", "apprenti").ok, true);
  assert.equal(E.state.ateliers.artisanat.app, 1);
  assert.equal(E.state.ecus, ecus, "aucun remboursement");
  assert.equal(E.coutEmbauche("artisanat", "apprenti"), prix, "renvoyer ne baisse pas le prix de l'embauche suivante");
  E.embaucher("artisanat", "apprenti");
  assert.equal(E.state.ateliers.artisanat.app, 2);
  assert.ok(Math.abs(E.coutEmbauche("artisanat", "apprenti") - prix * TR.apprenti.croiss) <= 1 && E.coutEmbauche("artisanat", "apprenti") > prix, "le rang continue de monter");
});
test("le rang d'embauche survit à la sauvegarde ; un travailleur renvoyé ne travaille plus", () => {
  const { E } = jeu(8);
  E.state.ecus = 1e6; E.add("bois", 5000); E.state.made.manche = 1;
  E.embaucher("artisanat", "ouvrier"); E.embaucher("artisanat", "ouvrier");
  E.setCadence("manche", 10000, true); avance(E, 5);
  assert.equal(E.travailleurs().artisanat.ouv, 2);
  E.licencier("artisanat", "ouvrier"); avance(E, 2);
  assert.equal(E.travailleurs().artisanat.ouv, 1);
  const prix = E.coutEmbauche("artisanat", "ouvrier");
  const F = createEngine({ now: () => t, rand: () => 0.99 });
  F.load(JSON.stringify(E.save ? JSON.parse(E.save()) : E.state));
  assert.equal(F.coutEmbauche("artisanat", "ouvrier"), prix);
  assert.equal(F.state.ateliers.artisanat.ouv, 1);
});
test("pas d'apprenti avant son âge", () => {
  const { E } = jeu(2);
  E.state.ecus = 1000;
  assert.equal(E.embaucher("artisanat", "apprenti").why, "age");
});
test("embaucher coûte des écus, de plus en plus à chaque embauche", () => {
  const { E } = jeu(5);
  E.state.ecus = 1000;
  const c1 = E.coutEmbauche("artisanat", "apprenti");
  assert.equal(c1, Math.round(TR.apprenti.cout * Math.pow(TR.parAge, 5 - TR.apprenti.age)));
  assert.equal(E.embaucher("artisanat", "apprenti").ok, true);
  assert.equal(E.state.ecus, 1000 - c1);
  assert.equal(E.coutEmbauche("artisanat", "apprenti"), Math.round(c1 * TR.apprenti.croiss));
  assert.equal(E.state.ateliers.artisanat.app, 1);
});
test("sans assez d'écus : refusé, rien n'est débité", () => {
  const { E } = jeu(5);
  E.state.ecus = 5;
  const r = E.embaucher("artisanat", "apprenti");
  assert.equal(r.ok, false); assert.equal(r.why, "ecus");
  assert.equal(E.state.ecus, 5);
  assert.equal(E.state.ateliers.artisanat, undefined);
});
test("un nombre maximum par atelier", () => {
  const { E } = jeu(5);
  E.state.ecus = 1e9;
  for (let i = 0; i < TR.apprenti.max; i++) assert.equal(E.embaucher("metallurgie", "apprenti").ok, true);
  assert.equal(E.embaucher("metallurgie", "apprenti").why, "max");
});
test("une famille inconnue ou sans recette connue ne peut pas embaucher", () => {
  const { E } = jeu(5);
  E.state.ecus = 1e9;
  assert.equal(E.embaucher("nimporte", "apprenti").why, "inconnu");
  const vide = jeu(5).E; vide.state.known = {}; vide.state.ecus = 1e9;
  assert.equal(vide.embaucher("artisanat", "apprenti").why, "vide");
});
test("un apprenti fabrique, pour son atelier seulement, à la moitié de la vitesse des mains", () => {
  const { E } = jeu(5);
  E.state.ecus = 1000;
  for (const [id, n] of Object.entries({ bois: 500, fibre: 500, os: 500, cuir: 500 })) E.add(id, n);
  E.state.made.manche = 1; E.state.made.aiguille = 1;
  assert.equal(E.embaucher("artisanat", "apprenti").ok, true);
  assert.equal(E.setCadence("manche", 20, true).ok, true, "une recette de l'artisanat se confie à l'apprenti");
  const avant = E.count("manche");
  avance(E, 60);
  assert.ok(E.count("manche") > avant, "l'apprenti a fabriqué des manches");
  assert.equal(E.setCadence("aiguille", 20, true).ok === true && E.cadences().find((c) => c.id === "aiguille").status === "nomach", true, "l'élevage n'a pas d'apprenti : pas de travailleur capable");
});
test("l'apprenti est plus lent qu'un ouvrier", () => {
  const faire = (kind) => {
    const { E } = jeu(8);
    E.state.ecus = 1e6;
    E.add("bois", 5000);
    E.state.made.manche = 1;
    assert.equal(E.embaucher("artisanat", kind).ok, true);
    E.setCadence("manche", 10000, true);
    const a = E.count("manche");
    avance(E, 120);
    return E.count("manche") - a;
  };
  assert.ok(faire("ouvrier") > faire("apprenti"));
});
test("les travailleurs au travail demandent des chevaux", () => {
  const { E, A } = jeu(8);
  E.state.ecus = 1e6;
  E.add("bois", 5000);
  E.state.made.manche = 1;
  E.embaucher("artisanat", "ouvrier");
  E.setCadence("manche", 10000, true);
  avance(E, 5);
  assert.ok(A.energie().demande >= TR.ouvrier.ch);
});
test("migration : l'apprenti de l'établi devient l'apprenti de l'Élevage, l'avance revient dans la bourse", () => {
  const { E } = jeu(5);
  const o = JSON.parse(E.serialize());
  o.ecus = 10;
  o.atelierEconomy = { v: 1, hired: true, working: true, budget: 7, merchant: true, sold: 40, tax: 3 };
  const F = createEngine({ now: () => 2e12, rand: () => 0.99 });
  F.load(JSON.stringify(o));
  assert.equal(F.state.ateliers.elevage.app, 1);
  assert.equal(F.state.ecus, 17);
  assert.equal(F.state.atelierEconomy, undefined, "l'ancienne boucle n'existe plus dans la partie");
});
test("une partie sans ateliers ni ancienne boucle se charge intacte", () => {
  const { E } = jeu(5);
  const o = JSON.parse(E.serialize());
  delete o.ateliers;
  const F = createEngine({ now: () => 2e12, rand: () => 0.99 });
  F.load(JSON.stringify(o));
  assert.deepEqual(F.state.ateliers, {});
});
test("une sauvegarde abîmée est remise d'aplomb (valeurs hors limites, famille inconnue)", () => {
  const { E } = jeu(5);
  const o = JSON.parse(E.serialize());
  o.ateliers = { artisanat: { app: 99, ouv: -3 }, fantome: { app: 1, ouv: 1 }, elevage: "oups" };
  const F = createEngine({ now: () => 2e12, rand: () => 0.99 });
  F.load(JSON.stringify(o));
  assert.deepEqual(F.state.ateliers, { artisanat: { app: TR.apprenti.max, ouv: 0 } });
});
test("l'équipe se lit dans la carte de l'atelier", () => {
  const { E, A } = jeu(8);
  E.state.ecus = 1e6;
  E.embaucher("artisanat", "apprenti"); E.embaucher("artisanat", "ouvrier");
  const c = A.carte("artisanat");
  assert.equal(c.apprentis, 1); assert.equal(c.ouvriers, 1);
  assert.equal(c.echelon, 0, "les travailleurs ne font pas monter l'échelle des machines");
  assert.ok(c.embauches.every((e) => ["apprenti", "ouvrier"].includes(e.kind)));
});
test("l'ancienne vente automatique n'existe plus", () => {
  const { E } = jeu(5);
  E.add("laniere", 50);
  assert.ok(!E.merchantSell || E.merchantSell(50).ok === false);
  assert.equal(E.count("laniere"), 50);
});
console.log(passed + " tests des travailleurs réussis.");

console.log("Travailleurs généralistes : seuil par métier (0.51)");
test("les noms d'un métier : forgeron, apprenti copiste, pluriels", () => {
  const { A } = jeu(5);
  assert.equal(A.nom("metallurgie", "ouvrier"), "Forgeron");
  assert.equal(A.nom("artistique", "apprenti"), "Apprenti copiste");
  assert.equal(A.nom("metallurgie", "apprenti", true), "Apprentis forgerons");
  assert.equal(A.nom("inconnu", "ouvrier"), "Ouvrier");
});
test("un apprenti fabrique seul un composant connu jusqu'à sa cible, puis s'arrête", () => {
  const { E } = jeu(5);
  E.state.ecus = 1e6; E.add("bois", 5000); E.add("pierre", 5000); E.add("fibre", 5000); E.state.made.manche = 1;
  assert.equal(E.seuilAtelier("artisanat"), TR.seuilDefaut);
  E.embaucher("artisanat", "apprenti");
  const cible = E.cibleAuto("manche");
  assert.ok(cible >= 1 && cible === Math.ceil(E.confort("manche") * TR.seuilDefaut / 100));
  avance(E, 300);
  assert.equal(Math.floor(E.state.inv.manche || 0), cible, "il monte jusqu'à la cible");
  avance(E, 300);
  assert.equal(Math.floor(E.state.inv.manche || 0), cible, "puis il s'arrête");
  assert.equal(E.autoEtat("artisanat").find((x) => x.id === "manche").etat, "plein");
});
test("le seuil se règle par pas de 10, 0 arrête tout, plus haut fait reprendre", () => {
  const { E } = jeu(5);
  E.state.ecus = 1e6; E.add("bois", 5000); E.add("pierre", 5000); E.add("fibre", 5000); E.state.made.manche = 1;
  E.embaucher("artisanat", "apprenti");
  assert.equal(E.setSeuilAtelier("artisanat", 0).seuil, 0);
  avance(E, 120);
  assert.equal(Math.floor(E.state.inv.manche || 0), 0, "seuil 0 : rien");
  assert.equal(E.setSeuilAtelier("artisanat", 47).seuil, 50, "arrondi à la dizaine");
  avance(E, 300);
  assert.equal(Math.floor(E.state.inv.manche || 0), E.cibleAuto("manche"));
  assert.equal(E.setSeuilAtelier("nimporte", 10).ok, false);
});
test("sans l'avoir fait une fois à la main, un travailleur ne fabrique pas ; sans interrupteur, le jeu d'avant", () => {
  const { E } = jeu(5);
  E.state.ecus = 1e6; E.add("bois", 5000); E.add("pierre", 5000); E.add("fibre", 5000); delete E.state.made.manche;
  E.embaucher("artisanat", "apprenti");
  avance(E, 60);
  assert.equal(Math.floor(E.state.inv.manche || 0), 0);
  E.state.made.manche = 1;
  TR.generalistes = false;
  try { avance(E, 60); assert.equal(Math.floor(E.state.inv.manche || 0), 0, "interrupteur éteint : rien sans cadence"); }
  finally { TR.generalistes = true; }
});
test("le seuil survit à la sauvegarde", () => {
  const { E } = jeu(5);
  E.setSeuilAtelier("chimie", 70);
  const F = createEngine({ now: () => t, rand: () => 0.99 });
  F.load(JSON.stringify(E.save ? JSON.parse(E.save()) : E.state));
  assert.equal(F.seuilAtelier("chimie"), 70);
  assert.equal(F.seuilAtelier("artisanat"), TR.seuilDefaut);
});

console.log("La voix des travailleurs (0.51)");
test("manque : un travailleur à l'arrêt faute de matière le dit après 30 s, une seule fois par 10 minutes", () => {
  const { E } = jeu(5);
  E.state.ecus = 1e6; E.state.made.manche = 1;
  E.state.inv.bois = 0; E.state.inv.pierre = 0; E.state.inv.fibre = 0;
  E.embaucher("artisanat", "apprenti");
  const t0 = 5e12;
  assert.deepEqual(E.voix(t0), [], "rien tout de suite");
  assert.deepEqual(E.voix(t0 + 10000), [], "pas avant 30 s");
  const m = E.voix(t0 + 31000);
  assert.ok(m.length >= 1 && m[0].kind === "manque" && m[0].fam === "artisanat" && /manqu|plus|manque/.test(m[0].txt), m[0] && m[0].txt);
  assert.deepEqual(E.voix(t0 + 60000), [], "pas de répétition");
  assert.ok(E.voixHisto("artisanat").length >= 1);
  assert.equal(E.voix(t0 + 31000 + 601000).filter((x) => x.kind === "manque").length >= 1, true, "reparle après 10 minutes");
});
test("retour d'absence : le compte rendu de ce que le métier a fabriqué, une seule fois", () => {
  const { E } = jeu(5);
  E.state.ecus = 1e6; E.add("bois", 5000); E.add("pierre", 5000); E.add("fibre", 5000); E.state.made.manche = 1;
  E.embaucher("artisanat", "apprenti");
  avance(E, 5);
  E.setSeuilAtelier("artisanat", 100);
  E.catchUp(3600);
  const m = E.voix(6e12).filter((x) => x.kind === "retour");
  assert.equal(m.length, 1);
  assert.ok(/×/.test(m[0].txt) && m[0].fam === "artisanat", m[0].txt);
  assert.equal(E.voix(6e12 + 1).filter((x) => x.kind === "retour").length, 0);
});
test("une absence courte ne donne pas de compte rendu ; l'historique survit à la sauvegarde", () => {
  const { E } = jeu(5);
  E.state.ecus = 1e6; E.add("bois", 5000); E.add("pierre", 5000); E.add("fibre", 5000); E.state.made.manche = 1;
  E.embaucher("artisanat", "apprenti");
  E.catchUp(60);
  assert.equal(E.voix(7e12).filter((x) => x.kind === "retour").length, 0);
  E.state.inv.bois = 0; E.state.inv.pierre = 0; E.state.inv.fibre = 0;
  E.voix(7e12); E.voix(7e12 + 40000);
  const n = E.voixHisto().length;
  assert.ok(n >= 1);
  const F = createEngine({ now: () => t, rand: () => 0.99 });
  F.load(JSON.stringify(E.save ? JSON.parse(E.save()) : E.state));
  assert.equal(F.voixHisto().length, n);
});

console.log("Les goulots (0.52)");
function jeuGoulot() {
  const { E } = jeu(5);
  E.state.ecus = 1e6;
  for (const [id, it] of Object.entries(D.ITEMS)) if (!it.r && it.a <= 5) E.add(id, 5000);
  E.state.inv.plaque_bronze = 0;
  E.state.made.roue = 1; E.state.made.plaque_bronze = 1;
  E.embaucher("artisanat", "apprenti");
  // seule la roue reste à fabriquer : les autres composants de l'artisanat sont au seuil
  for (const id of Object.keys(D.ITEMS)) if (D.ITEMS[id].r && D.ITEMS[id].t === "comp" && id !== "roue" && E.atelierDe(id) === "artisanat") E.state.inv[id] = 999;
  return E;
}
test("un composant d'un autre métier sans travailleur : « personne n'y travaille », avec le bouton d'embauche", () => {
  const E = jeuGoulot();
  const g = E.goulots().find((x) => x.ings && x.ings.includes("plaque_bronze"));
  assert.ok(g, JSON.stringify(E.goulots().map((x) => x.id)));
  assert.equal(g.kind, "personne");
  assert.equal(g.fam, "metallurgie");
  assert.equal(g.action.k, "embaucher");
  assert.ok(g.bloque.includes("roue") && g.poids >= 1 && /Personne n’y travaille/.test(g.txt), g.txt);
});
test("on embauche : la cause descend jusqu'à la matière brute sans extracteur ; jamais fait à la main : le dit", () => {
  const E = jeuGoulot();
  E.embaucher("metallurgie", "apprenti");
  for (const [id, it] of Object.entries(D.ITEMS)) if (!it.r && it.a <= 5) E.state.inv[id] = 0;
  const g = E.goulots().find((x) => x.ing && !D.ITEMS[x.ing].r);
  assert.ok(g && g.kind === "extracteur" && g.action.k === "terres", g && g.id);
  delete E.state.made.plaque_bronze;
  for (const [id, it] of Object.entries(D.ITEMS)) if (!it.r && it.a <= 5) E.state.inv[id] = 5000;
  const h = E.goulots().find((x) => x.kind === "main" && x.ings.includes("plaque_bronze"));
  assert.ok(h && h.kind === "main" && h.action.k === "fabriquer", h && h.id);
});
test("seuil à 0 dans le métier qui fabrique : le dit ; rien à signaler sans travailleur ni manque", () => {
  const E = jeuGoulot();
  E.embaucher("metallurgie", "apprenti"); E.setSeuilAtelier("metallurgie", 0);
  assert.ok(E.goulots().some((x) => x.kind === "seuil0" && x.fam === "metallurgie"));
  const { E: V } = jeu(5);
  assert.deepEqual(V.goulots(), []);
});

console.log("Les chantiers des bâtisseurs (0.54)");
test("un bâtisseur exécute le chantier que le joueur a lancé (un extracteur), pas sans lui", () => {
  const { E } = jeu(6);
  E.state.ecus = 1e6;
  for (const id of ["manche", "corde", "os", "bois", "fibre"]) E.add(id, 500);
  E.state.made.collets = 1;
  E.embaucher("construction", "ouvrier");
  avance(E, 5);
  assert.equal(E.travailleurs().construction.usedOuv, 0, "pas de chantier : le bâtisseur reste libre");
  const avant = E.count("collets");
  const r = E.order("collets", 1);
  assert.equal(r.ok, true, JSON.stringify(r.why));
  assert.equal(E.travailleurs().construction.usedOuv, 1, "le bâtisseur prend le chantier");
  avance(E, 120);
  assert.equal(E.count("collets"), avant + 1, "l'extracteur est construit");
  assert.equal(E.state.hand.q.length, 0);
});
test("sans l'avoir construit une fois à la main, un bâtisseur ne construit pas ; une machine non plus", () => {
  const { E } = jeu(6);
  E.state.ecus = 1e6;
  for (const id of ["manche", "corde", "os", "bois", "fibre"]) E.add(id, 500);
  delete E.state.made.collets;
  E.embaucher("construction", "ouvrier");
  E.order("collets", 1);
  assert.equal(E.travailleurs().construction.usedOuv, 0);
});
test("le goulot « aucun extracteur » propose le chantier quand un extracteur est connu et déjà construit à la main", () => {
  const { E } = jeu(5);
  E.state.ecus = 1e6;
  for (const [id, it] of Object.entries(D.ITEMS)) if (!it.r && it.a <= 5) E.add(id, 5000);
  E.state.made.manche = 1; E.state.made.collets = 1;
  E.embaucher("artisanat", "apprenti");
  for (const id of Object.keys(D.ITEMS)) if (D.ITEMS[id].r && D.ITEMS[id].t === "comp" && id !== "manche" && E.atelierDe(id) === "artisanat") E.state.inv[id] = 999;
  E.state.inv.bois = 0;
  const g = E.goulots().find((x) => x.kind === "extracteur" && x.ing === "bois");
  if (g) assert.ok(g.action.k === "chantier" || g.action.k === "terres", g.action.k);
});

console.log("Vocabulaire des gestes par métier (0.56)");
test("chaque couple métier × geste utilisé par une recette a son mot, et rien n'est en trop", () => {
  const { E } = jeu(5);
  const vus = {};
  for (const [id, it] of Object.entries(D.ITEMS)) { if (!it.r || it.sec || it.path) continue; (vus[E.atelierDe(id)] = vus[E.atelierDe(id)] || new Set()).add(it.r[0]); }
  for (const f in vus) for (const g of vus[f]) assert.ok(((D.GESTES_METIER || {})[f] || {})[g], f + " / " + g + " n'a pas de mot");
  for (const f in D.GESTES_METIER) { assert.ok(vus[f], f + " inconnu"); for (const g in D.GESTES_METIER[f]) assert.ok(vus[f].has(g), f + " / " + g + " : aucune recette"); }
});

console.log("La fatigue et la grève (0.57)");
function jeuFatigue() {
  const { E } = jeu(5);
  E.state.ecus = 1e6;
  for (const [id, it] of Object.entries(D.ITEMS)) if (!it.r && it.a <= 5) E.add(id, 100000);
  for (const id of Object.keys(D.ITEMS)) if (D.ITEMS[id].r && D.ITEMS[id].t === "comp" && E.atelierDe(id) === "artisanat") E.state.made[id] = 1; // il sait tout faire : il a de quoi travailler longtemps
  E.embaucher("artisanat", "apprenti");
  E.setSeuilAtelier("artisanat", 100);
  return E;
}
function avecFatigue(reglages, fn) { const avant = Object.assign({}, TR.fatigue); Object.assign(TR.fatigue, reglages); try { fn(); } finally { Object.assign(TR.fatigue, avant); } }
const totalLibre = (E) => Object.keys(D.ITEMS).filter((id) => D.ITEMS[id].r && D.ITEMS[id].t === "comp" && E.atelierDe(id) === "artisanat").reduce((a, id) => a + (E.state.inv[id] || 0), 0);
test("pousser un métier à fond le fatigue, puis la grève : plus rien ne se fabrique seul, la jauge redescend", () => {
  avecFatigue({ monte: 60, repos: 600 }, () => {
    const E = jeuFatigue();
    assert.equal(E.fatigue("artisanat").greve, false);
    avance(E, 120);
    assert.ok(E.fatigue("artisanat").greve, "la grève est déclarée : " + JSON.stringify(E.fatigue("artisanat")));
    const avant = totalLibre(E);
    avance(E, 20);
    assert.equal(totalLibre(E), avant, "en grève, rien ne se fabrique seul");
    assert.ok(E.autoEtat("artisanat").some((x) => x.etat === "greve"));
    assert.ok(E.goulots().some((g) => g.kind === "greve" && g.fam === "artisanat" && g.action.k === "prime"));
  });
});
test("la prime ou le repos mettent fin à la grève ; rien à verser quand on n'est pas fatigué", () => {
  avecFatigue({ monte: 60, repos: 600 }, () => {
    const E = jeuFatigue();
    assert.equal(E.primeVerser("artisanat").why, "repos");
    avance(E, 120);
    assert.ok(E.fatigue("artisanat").greve);
    const ecus = E.state.ecus, cout = E.primeCout("artisanat");
    assert.ok(cout > 0);
    E.state.ecus = cout - 1; assert.equal(E.primeVerser("artisanat").why, "ecus"); assert.ok(E.fatigue("artisanat").greve);
    E.state.ecus = ecus;
    assert.equal(E.primeVerser("artisanat").ok, true);
    assert.equal(E.fatigue("artisanat").greve, false);
    assert.equal(E.state.ecus, ecus - cout);
    assert.ok(Math.abs(E.fatigue("artisanat").valeur - TR.fatigue.apresPrime) < 1e-9);
  });
});
test("jeu fermé, les travailleurs se reposent : pas de grève au retour", () => {
  avecFatigue({ monte: 60, repos: 600 }, () => {
    const E = jeuFatigue();
    avance(E, 120);
    assert.ok(E.fatigue("artisanat").greve);
    E.catchUp(600);
    assert.equal(E.fatigue("artisanat").greve, false);
    assert.ok(E.fatigue("artisanat").valeur < TR.fatigue.reprise + 0.1);
  });
});
test("les travailleurs préviennent (fatigués), puis se mettent en grève, puis reprennent : une seule fois chaque", () => {
  avecFatigue({ monte: 60, repos: 600 }, () => {
    const E = jeuFatigue();
    avance(E, 120);
    const m = E.voix(8e12).map((x) => x.kind);
    assert.ok(m.includes("fatigue") && m.includes("greve"), m.join(","));
    assert.equal(E.voix(8e12 + 1).filter((x) => x.kind === "greve" || x.kind === "fatigue").length, 0);
    E.primeVerser("artisanat");
    assert.ok(E.voix(8e12 + 2).some((x) => x.kind === "reprise"));
  });
});
test("la fatigue et la grève survivent à la sauvegarde", () => {
  avecFatigue({ monte: 60, repos: 600 }, () => {
    const E = jeuFatigue();
    avance(E, 120);
    const v = E.fatigue("artisanat");
    const F = createEngine({ now: () => t, rand: () => 0.99 });
    F.load(JSON.stringify(E.save ? JSON.parse(E.save()) : E.state));
    assert.equal(F.fatigue("artisanat").greve, v.greve);
    assert.ok(Math.abs(F.fatigue("artisanat").valeur - v.valeur) < 0.01);
  });
});
test("au réglage par défaut (« au jour le jour »), deux heures de jeu ne mènent jamais à la grève", () => {
  const { E } = jeu(5);
  E.state.ecus = 1e6;
  for (const [id, it] of Object.entries(D.ITEMS)) if (!it.r && it.a <= 5) E.add(id, 100000);
  E.state.made.manche = 1;
  E.embaucher("artisanat", "apprenti"); E.embaucher("artisanat", "apprenti");
  for (let i = 0; i < 24; i++) { avance(E, 300); assert.equal(E.fatigue("artisanat").greve, false, "grève à la minute " + i * 5); }
});

console.log("Le combustible des sources d'énergie (0.58)");
const CB = D.ATELIERS.combustibles;
test("la chaudière, la centrale, la fission et la fusion brûlent un combustible ; moulin, dynamo et vapeur récupérée n'en veulent pas", () => {
  for (const id of ["chaudiere_tubulaire", "centrale", "centrale_fission", "reacteur_fusion"]) { assert.ok(CB[id] && D.ITEMS[CB[id].id] && CB[id].s > 0, id); assert.ok(D.ATELIERS.sources.some((s) => s.id === id)); }
  for (const id of ["moulin", "dynamo", "recuperation_vapeur"]) assert.equal(CB[id], undefined);
});
test("une centrale qui a du charbon fournit ; elle brûle une unité toutes les s secondes quand quelque chose travaille", () => {
  const E = jeuFatigue();
  E.state.inv.centrale = 1; E.state.inv.charbon = 10;
  E.energieRecalc();
  assert.ok(E.sourceMarche("centrale"));
  const c0 = E.state.inv.charbon;
  avance(E, CB.centrale.s * 3 + 1);
  assert.ok(c0 - E.state.inv.charbon >= 3 && c0 - E.state.inv.charbon <= 4, "brûlé : " + (c0 - E.state.inv.charbon));
  assert.ok(E.sourceReste("centrale") > 0);
});
test("réserve vide : la centrale s'arrête, un goulot le dit, rien n'est perdu, et elle repart dès qu'il y a du charbon", () => {
  const E = jeuFatigue();
  E.state.inv.centrale = 1; E.state.inv.charbon = 2;
  avance(E, CB.centrale.s * 4);
  assert.equal(E.state.inv.charbon, 0);
  assert.equal(E.sourceMarche("centrale"), false);
  const g = E.goulots().find((x) => x.kind === "combustible" && x.src === "centrale");
  assert.ok(g && g.arret && g.action.k === "terres" && g.ing === "charbon", JSON.stringify(g));
  E.add("charbon", 5);
  assert.equal(E.sourceMarche("centrale"), true);
  E.energieRecalc();
  assert.ok(E.energieFacteur() >= 0.5);
});
test("l'énergie retombe quand la source s'arrête, jamais sous le plancher ; et rien ne brûle jeu fermé", () => {
  const E = jeuFatigue();
  E.state.inv.centrale = 1; E.state.inv.charbon = 1;
  const c0 = E.state.inv.charbon;
  E.catchUp(3600);
  assert.equal(E.state.inv.charbon, c0, "jeu fermé : le charbon n'a pas brûlé");
  assert.ok(E.energieFacteur() >= D.ATELIERS.plancherEnergie);
});
test("quand il reste peu de secondes de combustible, le goulot prévient avant l'arrêt", () => {
  const E = jeuFatigue();
  E.state.inv.centrale = 1; E.state.inv.charbon = 3;
  avance(E, 5);
  const g = E.goulots().find((x) => x.kind === "combustible");
  assert.ok(g && !g.arret && g.reste <= D.ATELIERS.combustibleAlerte, JSON.stringify(g));
  assert.ok(/n’a plus que/.test(g.txt));
});
test("la braise du combustible survit à la sauvegarde", () => {
  const E = jeuFatigue();
  E.state.inv.centrale = 1; E.state.inv.charbon = 5;
  avance(E, 20);
  const braise = E.state.combu.centrale;
  assert.ok(braise > 0 && braise < 1, "braise " + braise);
  const F = createEngine({ now: () => t, rand: () => 0.99 });
  F.load(JSON.stringify(E.save ? JSON.parse(E.save()) : E.state));
  assert.ok(Math.abs(F.state.combu.centrale - braise) < 1e-6);
});

console.log("L'usure et les pannes des machines (0.58)");
const PN = D.ATELIERS.pannes;
function jeuMachine() {
  const E = jeuFatigue();
  E.state.inv.automate_bois = 2;
  E.setCadence("manche", 100000, true);
  return E;
}
function avecPannes(r, fn) { const avant = Object.assign({}, PN); Object.assign(PN, r); try { fn(); } finally { Object.assign(PN, avant); } }
test("une machine qui travaille s'use, tombe en panne, et un goulot propose de la réparer ; rien n'est perdu", () => {
  avecPannes({ monte: 60 }, () => {
    const E = jeuMachine();
    avance(E, 200);
    const u = E.usure("automate_bois");
    assert.ok(u.pannes >= 1 && u.pannes <= 1, JSON.stringify(u)); // au plus la moitié du parc
    const g = E.goulots().find((x) => x.kind === "panne" && x.src === "automate_bois");
    assert.ok(g && g.action.k === "reparer", JSON.stringify(g));
    E.state.ecus = 0; assert.equal(E.reparer("automate_bois").why, "ecus");
    E.state.ecus = 1e6;
    assert.equal(E.reparer("automate_bois").ok, true);
    assert.equal(E.usure("automate_bois").pannes, 0);
  });
});
test("rien ne s'use jeu fermé, et les pannes sont réparées au retour", () => {
  avecPannes({ monte: 60 }, () => {
    const E = jeuMachine();
    avance(E, 200);
    assert.ok(E.usure("automate_bois").pannes >= 1);
    E.catchUp(600);
    assert.equal(E.usure("automate_bois").pannes, 0);
    assert.equal(E.usure("automate_bois").valeur, 0);
  });
});
test("au réglage par défaut, dix minutes de jeu ne cassent rien", () => {
  const E = jeuMachine();
  avance(E, 600);
  assert.equal(E.usure("automate_bois").pannes, 0);
});
