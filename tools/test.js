#!/usr/bin/env node
/* Tests du moteur : mécaniques de base, secrets, chemin caché, fins, sauvegarde. */
"use strict";
const assert = require("assert");
const D = require("../js/data.js");
const fs = require("fs");
const path = require("path");
const { createEngine, migrate, SAVE_VERSION } = require("../js/engine.js");
const { signeSVG, renderSigneToken } = require("../js/signes.js");
const fixture = (f) => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");

let T = 1e12;
/* une partie neuve */
const mk = () => createEngine({ now: () => T, rand: () => 0.99 });
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.log("  ✗ " + name + "\n    " + (e.stack || e)); process.exitCode = 1; }
}
/* donne tout ce qu’il faut pour fabriquer `id` (récursivement, en trichant sur les matières premières) */
function force(E, id, n) {
  const it = D.ITEMS[id];
  for (const i in it.r[1]) E.add(i, it.r[1][i] * (n || 1) * 10);
  const r = E.craft(id, n || 1);
  assert.ok(r.ok, "fabrication de " + id + " : " + JSON.stringify(r));
}
const run = (E, s) => { for (let i = 0; i < s * 10; i++) { T += 100; E.update(); } };
function stations(E, list) { list.forEach((s) => { E.add(s, 1); E.state.made[s] = 1; }); E.recalc(); }

console.log("Moteur");
test("récolte et rendement de base", () => {
  const E = mk();
  assert.strictEqual(E.tap("bois"), 1);
  assert.strictEqual(E.tap("os"), 0, "zone fermée");
  assert.strictEqual(E.count("bois"), 1);
});
test("tentative : fabrication, apprentissage, échec", () => {
  const E = mk();
  for (let i = 0; i < 3; i++) E.tap("bois");
  const r = E.attempt("tailler", ["bois"]);
  assert.strictEqual(r.kind, "craft"); assert.strictEqual(r.id, "manche"); assert.ok(r.fresh);
  assert.strictEqual(E.count("manche"), 1);
  assert.strictEqual(E.state.intu, 4, "+1 intuition à la découverte");
  const l = E.attempt("tresser", ["fibre"]);
  assert.strictEqual(l.kind, "learn"); assert.deepStrictEqual(l.missing, { fibre: 3 });
  assert.ok(E.state.known.corde);
  const f = E.attempt("tresser", ["caillou"]);
  assert.strictEqual(f.kind, "fail");
});
test("découvrir coûte peu : une grosse recette s’inscrit sans rien prendre", () => {
  const E = mk();
  E.add("archet", 1); E.add("bois", 30); E.add("caillou", 20);
  const r = E.attempt("construire", ["archet", "bois", "caillou"]);
  assert.strictEqual(r.kind, "learn"); assert.strictEqual(r.missing, null); assert.ok(r.fresh);
  assert.ok(E.state.known.feu);
  assert.strictEqual(E.count("bois"), 30, "rien n’est pris");
  assert.ok(!(E.state.made.feu > 0));
  // une petite découverte sort tout de suite
  const m = E.attempt("tailler", ["bois"]);
  assert.strictEqual(m.kind, "craft");
});
test("échecs : écrits à la main pour les essais probables, avec les bons articles", () => {
  const E = mk();
  for (const k in D.FAIL_ONE) {
    const [g, ids] = k.split(":"), list = ids.split("+");
    assert.ok(!E.RECIPES[E.keyOf(g, list)], "« " + k + " » est une vraie recette");
    assert.deepStrictEqual(list.slice().sort(), list, "« " + k + " » : matières dans l’ordre");
    list.forEach((i) => assert.ok(D.ITEMS[i], i));
  }
  assert.strictEqual(E.failText("tresser", ["caillou"]), D.FAIL_ONE["tresser:caillou"]);
  assert.strictEqual(E.the("os"), "l’os"); assert.strictEqual(E.the("fibre"), "les fibres"); assert.strictEqual(E.the("hache_pierre"), "la hache de pierre");
  assert.strictEqual(E.the("helium3"), "l’hélium-3"); assert.strictEqual(E.the("charbon"), "le charbon");
  const t = E.failText("tremper", ["fibre"]);
  assert.ok(!/\{|\}/.test(t) && /^[A-ZÀ-Ý]/.test(t), t);
  assert.strictEqual(E.failText("tremper", ["fibre"]), t, "la même tentative, la même phrase");
  for (const g in D.FAIL) D.FAIL[g].forEach((x) => assert.ok(!/\{[^x}][^}]*\}/.test(x.replace(/\{[^{}|]*\|[^{}]*\}/g, "")), "modèle mal formé : " + x));
});
test("thermomètre : mauvais geste / ingrédient manquant", () => {
  const E = mk();
  ["bois", "fibre", "caillou", "manche", "corde"].forEach((i) => (E.state.seen[i] = true));
  assert.strictEqual(E.temperature("tailler", ["fibre"]).why, "geste", "fibres + tresser = corde");
  assert.strictEqual(E.temperature("assembler", ["manche"]).temp, 3, "archet : il manque la corde");
  assert.strictEqual(E.temperature("tresser", ["bois"]).why, "geste", "le manche (tailler + bois) est encore inconnu");
  E.state.known.manche = true;
  // le bois entre dans la recette d’une claie de séchage (Âge du Bois) : « frais », plus « froid » comme avant la 0.17
  assert.strictEqual(E.temperature("tresser", ["bois"]).temp, 1);
});
test("chaleur insuffisante = Brûlant, recette notée", () => {
  const E = mk();
  E.state.age = 3; // l’âge du cuivre est atteint
  stations(E, ["feu"]);
  E.state.seen.malachite = E.state.seen.charbon = true;
  const r = E.attempt("chauffer", ["malachite", "charbon"]);
  assert.strictEqual(r.kind, "blocked"); assert.strictEqual(r.info.heat, 1100);
  assert.ok(E.state.known.lingot_cuivre);
});
test("objets uniques et zones", () => {
  const E = mk();
  stations(E, ["feu"]);
  force(E, "epieu");
  assert.ok(!E.zoneOpen("plaine"), "l’épieu rend le passage possible, il ne l’ouvre pas");
  assert.ok(E.passInfo("plaine").ready);
  assert.strictEqual(E.craft("epieu").why, "owned");
});
test("passages : on verse en plusieurs fois, la terre s’ouvre une fois tout payé", () => {
  const E = mk();
  stations(E, ["feu"]);
  assert.strictEqual(E.passPour("plaine").ok, false, "pas avant l’épieu");
  force(E, "epieu");
  // 0.10 : le chemin se connaît en marchant, les lieux de la Lisière d’abord
  E.state.exp.done.lisiere = 2;
  const cost = E.passCost("plaine");
  // le guidage mène au passage
  const ob = E.objective();
  assert.strictEqual(ob.k, "pass"); assert.strictEqual(ob.z, "plaine");
  E.state.inv = {}; E.add("bois", 50);
  const r1 = E.passPour("plaine");
  assert.ok(r1.ok && !r1.done); assert.strictEqual(E.count("bois"), 0);
  assert.ok(E.passInfo("plaine").frac > 0 && E.passInfo("plaine").frac < 1);
  for (const i in cost) E.add(i, cost[i]);
  const r2 = E.passPour("plaine");
  assert.ok(r2.done); assert.ok(E.zoneOpen("plaine"));
  assert.strictEqual(E.count("bois"), 50, "seul le reste est pris");
  assert.strictEqual(E.releveGain(), D.PASSAGES.plaine.tr);
  assert.ok(E.canReleve());
  // tant qu’un passage n’est pas payé, la prochaine étape vers la Rivière le dit
  const G = mk(); stations(G, ["feu"]); force(G, "epieu");
  assert.strictEqual(G.nextStep("argile").why, "pass");
});
test("passages : les lieux de la terre actuelle d’abord (0.10)", () => {
  const E = mk();
  stations(E, ["feu"]);
  force(E, "epieu");
  const l = E.passInfo("plaine").lieux;
  assert.ok(l && l.z === "lisiere" && l.total === 2, "la Lisière a deux lieux à explorer");
  assert.deepStrictEqual(l.left.map((x) => x.id), ["chene", "grotte"]);
  for (const i in E.passCost("plaine")) E.add(i, E.passCost("plaine")[i]);
  const r = E.passPour("plaine");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.why, "lieux");
  assert.ok(!E.zoneOpen("plaine") && !E.state.pass.plaine.paid.bois, "rien ne se dépose avant");
  E.state.exp.done.lisiere = 1;
  assert.deepStrictEqual(E.passInfo("plaine").lieux.left.map((x) => x.id), ["grotte"]);
  E.state.exp.done.lisiere = 2;
  assert.ok(E.passPour("plaine").done, "les lieux explorés, le passage s’ouvre");
  assert.deepStrictEqual(E.passInfo("plaine").lieux.left, []);
});
test("passages : les lieux cachés, ceux d’une autre terre et ceux d’à côté ne bloquent pas (0.10)", () => {
  const E = mk();
  // Rivière : Le Gué, puis La Carcasse (qui demande la hache de pierre, une pièce du même âge)
  const l = E.passLieux("riviere");
  assert.strictEqual(l.z, "plaine");
  assert.deepStrictEqual(l.left.map((x) => x.id), ["champ_os", "tumulus"]);
  // Lisière : le Cercle (caché), les Racines (cachées), les Ronds (un lieu d’à côté)
  assert.deepStrictEqual(E.passLieux("plaine").left.map((x) => x.id), ["chene", "grotte"]);
  assert.deepStrictEqual(E.passLieux("mine").left.map((x) => x.id), ["rails", "sommet"]);
  assert.strictEqual(E.passLieux("lisiere"), null, "rien avant la Lisière");
});
test("passages : dès le deuxième Semeur, la route est connue", () => {
  const E = mk();
  E.state.pass.plaine = { paid: {}, done: true };
  E.newCycle();
  assert.strictEqual(E.state.cycle, 2);
  assert.strictEqual(E.passLieux("plaine"), null);
  stations(E, ["feu"]);
  force(E, "epieu");
  for (const i in E.passCost("plaine")) E.add(i, E.passCost("plaine")[i]);
  assert.ok(E.passPour("plaine").done);
});
test("plan : une pièce prise en partie au stock se fabrique avant celles qui s’en servent", () => {
  const E = mk();
  E.state.age = 12; // tous les âges atteints : ce test regarde l’ordre du plan
  for (const k in D.ITEMS) E.state.known[k] = true;
  stations(E, ["enclume_bronze", "creuset", "four", "feu", "enclume_pierre"]);
  E.add("lingot_bronze", 5); E.add("lingot_cuivre", 200); E.add("lingot_etain", 200); E.add("caillou", 5000); E.add("bois", 5000); E.add("corde", 500); E.add("manche", 500); E.add("charbon", 500);
  const steps = E.plan("automate_bronze", 1).steps.map((x) => x[0]);
  steps.forEach((x, k) => Object.keys(D.ITEMS[x].r[1]).forEach((i) => { const j = steps.indexOf(i); assert.ok(j < 0 || j < k, i + " avant " + x + " : " + steps); }));
  assert.ok(E.queue("automate_bronze", 1, true).ok);
  run(E, 300);
  assert.strictEqual(E.count("automate_bronze"), 1); assert.strictEqual(E.state.hand.q.length, 0, "la file ne reste pas bloquée");
});
test("relève : on garde le savoir, on gagne des Traces ; la Mémoire des mains", () => {
  const E = mk();
  stations(E, ["feu"]);
  force(E, "epieu");
  E.state.exp.done.lisiere = 2;
  for (const i in E.passCost("plaine")) E.add(i, E.passCost("plaine")[i]);
  E.passPour("plaine");
  E.state.flags.tuto = { done: { debut: true }, c: null, i: 0 }; E.state.flags.tip_full = true; E.state.flags.extDone = true;
  const known = Object.keys(E.state.known).length, tap0 = E.tap("bois");
  E.newCycle();
  const S = E.state;
  assert.strictEqual(S.meta.traces, D.PASSAGES.plaine.tr);
  assert.strictEqual(Object.keys(S.known).length, known, "le Carnet est gardé");
  assert.ok(!E.zoneOpen("plaine") && !S.pass.plaine, "les terres repartent de zéro");
  assert.strictEqual(S.flags.tuto.done.debut, true, "le tutoriel déjà vu ne revient pas");
  assert.ok(S.flags.tip_full && !S.flags.extDone);
  assert.strictEqual(E.releveGain(), 0); assert.ok(!E.canReleve());
  // acheter : récolte ×2, paquetage
  assert.ok(E.memBuy("recolte")); assert.strictEqual(S.meta.traces, 0);
  assert.ok(!E.memBuy("paquetage"), "plus de Traces");
  assert.strictEqual(E.tap("bois"), tap0 * 2);
  S.meta.traces = 100;
  assert.ok(E.memBuy("paquetage") && E.memBuy("paquetage") && E.memBuy("raccourci"));
  E.newCycle();
  assert.strictEqual(E.state.inv.cabane, 1, "le paquetage : une cabane");
  assert.ok(E.state.made.manche && E.state.made.cabane, "ce qu’il donne compte comme fait");
  assert.notStrictEqual(E.objective().id, "manche", "l’étape « manche » est passée");
  assert.ok(E.state.inv.bois >= 60);
  assert.ok(E.zoneOpen("plaine") && E.has("epieu"), "le raccourci ouvre la Plaine");
  assert.strictEqual(E.releveGain(), 0, "un passage offert ne rapporte rien");
  assert.strictEqual(E.memLvl("recolte"), 1, "la Mémoire est gardée");
  // chemins connus : les passages coûtent moins
  E.state.meta.traces = 10; const c0 = E.passCost("riviere").bois;
  assert.ok(E.memBuy("chemins")); assert.ok(E.passCost("riviere").bois < c0);
});
test("relève : une réminiscence déjà lue ne revient pas", () => {
  const E = mk();
  let n = 0; E.on("event", () => n++);
  stations(E, []); E.add("bois", 30); E.add("caillou", 20); E.add("archet", 1); E.state.known.feu = true;
  assert.ok(E.craft("feu").ok); assert.strictEqual(n, 1, "« Seuil 1 » la première fois");
  E.state.pass.plaine = { paid: {}, done: true };
  E.newCycle();
  E.add("bois", 30); E.add("caillou", 20); E.add("archet", 1);
  assert.ok(E.craft("feu").ok); assert.strictEqual(n, 1, "pas une deuxième fois");
  // une partie d’avant : les réminiscences des objets déjà faits comptent comme lues
  const raw = JSON.parse(E.serialize()); delete raw.meta.ev; raw.made.feu = 1;
  const F = mk(); F.load(JSON.stringify(raw)); assert.ok(F.state.meta.ev.feu);
});
test("passages : une partie d’avant garde ses terres ouvertes, comptées comme franchies", () => {
  const E = mk();
  const raw = JSON.parse(E.serialize());
  delete raw.pass; delete raw.meta.traces; delete raw.meta.mem;
  raw.zones = { lisiere: true, plaine: true, riviere: true };
  const F = mk(); F.load(JSON.stringify(raw));
  assert.ok(F.zoneOpen("riviere"));
  assert.ok(F.state.pass.plaine.done && F.state.pass.riviere.done);
  assert.strictEqual(F.releveGain(), D.PASSAGES.plaine.tr + D.PASSAGES.riviere.tr);
  assert.strictEqual(F.state.meta.traces, 0); assert.deepStrictEqual(F.state.meta.mem, {});
});
/* pose une cabane sur le gisement de bois de la Lisière et la relie à la Réserve */
test("extracteurs : coût croissant, posés sur un gisement, la récolte va à la Réserve", () => {
  const E = mk();
  const c0 = E.costFor("cabane").fibre;
  force(E, "cabane");
  assert.ok(E.costFor("cabane").fibre > c0);
  const b = E.count("bois");
  T += 4000; E.update();
  assert.strictEqual(E.count("bois"), b, "rangée dans le stock, une cabane ne récolte rien");
  const r = E.domExtAdd("lisiere", "bois", 1);
  assert.deepStrictEqual([r.ok, r.placed, r.queued, r.t], [true, 1, 0, "cabane"]);
  T += 100; E.update();
  const b1 = E.count("bois");
  T += 4000; E.update();
  assert.ok(Math.abs(E.count("bois") - b1 - 4 * 1.2) < 0.01, "une cabane sur le bois : 0,4 × 3 matières = 1,2/s");
  assert.ok(E.state.flags.extDone);
  assert.ok(Math.abs(E.rate("bois") - 1.2) < 1e-9);
  assert.strictEqual(E.machInfo("lisiere:bois").s, "ok");
});
test("gisements : récolte à la main, règles de pose", () => {
  const E = mk();
  const ds = E.deposits();
  assert.deepStrictEqual(ds.map((d) => d.res).sort(), ["bois", "caillou", "charbon", "fibre"], "la Lisière seule au départ");
  assert.ok(ds.find((d) => d.res === "bois").hand && !ds.find((d) => d.res === "charbon").hand);
  assert.strictEqual(E.tap("bois", "lisiere"), 1);
  assert.strictEqual(E.tap("charbon", "lisiere"), 0, "le charbon ne se ramasse pas à la main");
  assert.strictEqual(E.domExtAdd("lisiere", "bois", 1).why, "noext", "aucun extracteur connu");
  E.add("cabane", 2); E.add("charbonniere", 1); E.add("collets", 1);
  assert.strictEqual(E.domExtSet("lisiere", "bois", "charbonniere", 1), null, "une meule ne fait pas de bois");
  assert.strictEqual(E.domExtSet("plaine", "os", "collets", 1), null, "pas sur une terre fermée");
  assert.ok(E.domExtSet("lisiere", "charbon", "charbonniere", 1));
  const e = E.domExtSet("lisiere", "bois", "cabane", 5);
  assert.strictEqual(e.u.cabane, 2, "pas plus que les cabanes possédées");
  assert.strictEqual(E.extUnits().cabane.used, 2);
  assert.strictEqual(E.freeExt("cabane"), 0);
  assert.strictEqual(E.domExtSet("lisiere", "bois", "cabane", 0), null, "à zéro, le gisement est libéré");
  assert.strictEqual(E.extUnits().cabane.used, 0);
  E.state.zones.plaine = true;
  assert.ok(E.deposits().some((d) => d.z === "plaine" && d.res === "os"), "chaque terre ouverte apporte ses gisements");
  E.domExtSet("lisiere", "bois", "cabane", 1);
  E.domExtToggle("lisiere", "bois");
  run(E, 2);
  assert.strictEqual(E.machInfo("lisiere:bois").s, "off");
});
test("un extracteur ne travaille que sur sa terre ; une ancienne pose ailleurs rentre chez elle", () => {
  const E = mk();
  ["plaine", "riviere", "collines", "mine", "desert"].forEach((z) => (E.state.zones[z] = true));
  E.add("nasse", 3); E.add("sable_2", 1); E.add("cabane", 1); E.learn("nasse", true);
  assert.strictEqual(E.domExtSet("desert", "sable", "nasse", 1), null, "une fosse à argile ne va pas sur le sable");
  assert.ok(E.domExtSet("desert", "sable", "sable_2", 1), "le tamis à sable se pose aussi au désert : une ressource, un bâtiment, partout");
  assert.strictEqual(E.domExtSet("collines", "caillou", "cabane", 1), null, "une cabane reste à la Lisière");
  assert.deepStrictEqual(E.extFor("sable", "desert").sort(), ["sable_1", "sable_2", "sable_3", "sable_4"]);
  assert.deepStrictEqual(E.extFor("sable", "riviere").sort(), ["sable_1", "sable_2", "sable_3", "sable_4"]);
  // un Carnet hérité connaît la scierie, mais on ne peut payer qu’une cabane : le bouton propose la cabane
  const G = mk();
  ["cabane", "hutte", "scierie"].forEach((t) => G.learn(t, true));
  assert.strictEqual(G.extChoice("bois", "lisiere").t, "cabane", "rien de payable : le plus simple");
  for (const i in D.ITEMS.cabane.r[1]) G.add(i, D.ITEMS.cabane.r[1][i] * 5);
  assert.strictEqual(G.extChoice("bois", "lisiere").t, "cabane", "payable : la cabane, pas la scierie");
  assert.strictEqual(E.domExtAdd("collines", "caillou", 1).why, "noext");
  // une sauvegarde d’avant la 8 : trois nasses (argile, silex et sable) posées sur le sable de la Rivière
  const o = JSON.parse(E.serialize());
  o.dom.ext = { "riviere:sable": { z: "riviere", res: "sable", u: { nasse: 3 }, on: true } };
  o.inv.nasse = 3; o.known.nasse = true;
  const F = mk();
  F.load(JSON.stringify(o));
  assert.deepStrictEqual(F.domExt("riviere", "sable").u, { sable_1: 3 }, "les trois nasses deviennent des bancs de sable, au même endroit");
  assert.strictEqual(F.count("nasse"), 0); assert.strictEqual(F.count("sable_1"), 3, "aucune perdue");
  assert.ok(F.state.known.sable_1, "le niveau frère est connu");
});
test("un extracteur par ressource : chaque ressource récoltable a sa ligne, ses niveaux et sa recette", () => {
  const E = mk();
  const exts = Object.keys(D.ITEMS).filter((id) => D.ITEMS[id].t === "ext");
  assert.strictEqual(exts.length, 50);
  const res = new Set(D.LIGNES.map((L) => L.res));
  assert.strictEqual(res.size, D.LIGNES.length, "une seule ligne par ressource");
  exts.forEach((id) => {
    const it = D.ITEMS[id], L = D.LIGNES.find((x) => x.id === it.lg);
    assert.ok(L, id + " : sans ligne");
    assert.deepStrictEqual(Object.keys(it.p), [L.res], id + " : une seule ressource");
    assert.strictEqual(L.niv[it.lv - 1].id, id, id + " : son niveau");
  });
  // tout ce que les anciens extracteurs récoltaient, un niveau le récolte toujours, au même taux (sauf le tamis à sable, relevé)
  D.LIGNES.forEach((L) => L.niv.forEach((v, k) => { if (k) assert.ok(D.ITEMS[v.id].p[L.res] > D.ITEMS[L.niv[k - 1].id].p[L.res], L.id + " : chaque niveau récolte plus vite"); }));
  // chaque niveau a sa propre recette à découvrir (l’index des recettes refuse les doublons)
  assert.ok(!E.state.known.fibre_1 && !E.state.known.caillou_1);
  E.learn("cabane", true);
  assert.ok(!E.state.known.fibre_1 && !E.state.known.caillou_1, "la cabane du bûcheron ne dit rien du cueilleur");
  assert.ok(E.extFor("fibre", "lisiere").every((t) => D.ITEMS[t].lg === "cueilleur"), "sur la fibre, seulement la ligne du cueilleur");
  exts.forEach((id) => { const it = D.ITEMS[id]; assert.ok(it.r && it.h && it.d, id + " : recette, indice et description"); for (const i in it.r[1]) assert.ok((D.ITEMS[i].a || 0) <= it.a, id + " : « " + i + " » arrive après lui"); });
  // une ressource, un bâtiment, partout : le sable se récolte avec la même ligne à la Rivière et au Désert
  assert.deepStrictEqual(E.extFor("sable", "riviere").sort(), E.extFor("sable", "desert").sort());
  // une ressource vue dans une terre n’est jamais récoltée par un autre bâtiment
  assert.ok(!E.extFor("bois", "lisiere").includes("fibre_1"));
});
test("améliorer un exemplaire : il prend la place de l’ancien, qui est retiré", () => {
  const E = mk();
  ["cabane", "hutte"].forEach((t) => E.learn(t, true)); E.state.age = 2;
  E.add("cabane", 2); E.domExtSet("lisiere", "bois", "cabane", 2);
  const r0 = E.extOut(E.domExt("lisiere", "bois"));
  // rien pour fabriquer le niveau d’après : un refus qui dit quoi
  const non = E.domExtUp("lisiere", "bois", "cabane");
  assert.ok(!non.ok && non.t === "hutte", JSON.stringify(non));
  assert.strictEqual(E.count("cabane"), 2, "rien n’est retiré");
  // un exemplaire du niveau d’après attend : l’échange est immédiat
  E.add("hutte", 1);
  assert.deepStrictEqual([E.domExtUp("lisiere", "bois", "cabane").ok, E.count("cabane"), E.count("hutte")], [true, 1, 1]);
  assert.deepStrictEqual(E.domExt("lisiere", "bois").u, { cabane: 1, hutte: 1 });
  assert.ok(E.extOut(E.domExt("lisiere", "bois")) > r0, "la récolte monte");
  // les mains le fabriquent : la pose et le retrait se font à la fin de la commande
  for (const i in D.ITEMS.hutte.r[1]) E.add(i, D.ITEMS.hutte.r[1][i] * 3);
  const q = E.domExtUp("lisiere", "bois", "cabane");
  assert.deepStrictEqual([q.ok, q.queued], [true, 1], JSON.stringify(q));
  assert.strictEqual(E.count("cabane"), 1, "l’ancien reste en place tant que le nouveau n’est pas prêt");
  run(E, Math.ceil(E.handInfo().left) + 2);
  assert.deepStrictEqual(E.domExt("lisiere", "bois").u, { hutte: 2 });
  assert.strictEqual(E.count("cabane"), 0, "l’ancien est remplacé");
  // le dernier niveau ne s’améliore plus
  assert.strictEqual(E.extNext("scierie"), null);
  assert.strictEqual(E.extNext("cabane"), "hutte");
});

test("« +1 » : un extracteur libre est posé, sinon les mains le fabriquent puis le posent", () => {
  const E = mk();
  E.learn("fibre_1", true); E.learn("cabane", true);
  E.add("manche", 50); E.add("corde", 50); E.add("bois", 200);
  const r = E.domExtAdd("lisiere", "fibre", 2);
  assert.deepStrictEqual([r.ok, r.placed, r.queued], [true, 0, 2], JSON.stringify(r));
  assert.strictEqual(E.domQueued("x:lisiere:fibre"), 2);
  run(E, Math.ceil(E.handInfo().left) + 2);
  assert.strictEqual(E.domExt("lisiere", "fibre").u.fibre_1, 2, "posées une fois finies : le cueilleur, pas le bûcheron");
  assert.strictEqual(E.domQueued("x:lisiere:fibre"), 0);
  assert.strictEqual(E.domExtAdd("lisiere", "bois", 1).placed, 0);
  const F = mk();
  F.learn("cabane", true);
  const q = F.domExtAdd("lisiere", "bois", 1);
  assert.ok(!q.ok && q.missing, "rien pour la fabriquer : " + JSON.stringify(q));
});
test("machines : sur une commande en chaîne, les machines aident sur les sous-pièces et la cible", () => {
  const E = mk();
  E.add("automate_bronze", 1); E.add("automate_bois", 1);
  stations(E, ["etabli"]);
  ["manche", "corde", "archet"].forEach((k) => { E.state.known[k] = true; E.state.made[k] = 1; });
  E.add("bois", 100); E.add("corde", 100);
  const r = E.order("archet", 10);
  assert.ok(r.ok);
  run(E, 120);
  assert.strictEqual(E.count("archet"), 10, "les 10 archets sont fabriqués avec leurs manches");
  assert.ok(E.state.flags.lineDone);
});
test("maîtrise : chefs-d’œuvre", () => {
  const E = createEngine({ now: () => T, rand: () => 0 });
  E.add("bois", 3000);
  E.craft("manche", 60);
  assert.strictEqual(E.stars("manche"), 2);
  const r = E.craft("manche", 10);
  assert.ok(r.bonus > 0);
});
test("explorations : coût, durée, fragment", () => {
  const E = mk();
  assert.ok(E.startExp("lisiere").ok);
  assert.strictEqual(E.startExp("lisiere").why, "busy");
  T += E.ZONES.lisiere.exps[0].dur * 1000 + 1000; E.update();
  assert.ok(E.state.frags[(E.RECIT.expFrag || {})["lisiere:chene"] || "chene"], "le fragment du lieu");
  assert.strictEqual(E.startExp("lisiere").why, "cost", "la grotte demande une torche");
});
test("hors-ligne : rattrapage plafonné à 12 h", () => {
  const E = mk();
  force(E, "cabane");
  E.domExtAdd("lisiere", "bois", 1);
  T += 100; E.update();
  const b = E.count("bois");
  let off = null;
  E.on("offline", (o) => (off = o));
  T += 48 * 3600 * 1000; E.update();
  assert.ok(off && off.dt === 12 * 3600);
  assert.ok(Math.abs(E.count("bois") - b - 1.2 * 12 * 3600) < 15, "12 h à 1,2 bois/s : " + (E.count("bois") - b));
});
test("sauvegarde : aller-retour et export base64", () => {
  const E = mk();
  E.tap("bois"); E.state.flags.x = 1;
  const s = E.exportSave();
  const E2 = mk();
  E2.importSave(s);
  assert.strictEqual(E2.count("bois"), 1); assert.strictEqual(E2.state.flags.x, 1);
  assert.throws(() => E2.load("{}"));
});


console.log("Sauvegardes (compatibilité)");
const FIXTURES = fs.readdirSync(path.join(__dirname, "fixtures")).filter((x) => /^save-v\d/.test(x));
test("les sauvegardes v1 à v5 se chargent sans rien perdre", () => {
  assert.ok(FIXTURES.some((f) => /^save-v5/.test(f)));
  for (const f of FIXTURES) {
    const raw = fixture(f);
    const old = JSON.parse(raw);
    const E = mk();
    E.load(raw);
    const S = E.state;
    assert.strictEqual(S.v, SAVE_VERSION, f);
    // un extracteur à plusieurs ressources est devenu une ligne par ressource : on compte la famille (même recette)
    const famille = (k) => Object.keys(D.ITEMS).filter((x) => x === k || D.ITEMS[x].de === k).reduce((a, x) => a + (S.inv[x] || 0), 0);
    for (const k in old.inv) assert.ok((D.ITEMS[k] && D.ITEMS[k].t === "ext" ? famille(k) : S.inv[k]) >= old.inv[k] - 1e-9, f + " : stock de " + k);
    for (const k in old.known) assert.ok(S.known[k], f + " : recette " + k);
    for (const k in old.made) assert.strictEqual(S.made[k], old.made[k], f + " : fabriqué " + k);
    assert.strictEqual(S.age, old.age >= 9 ? old.age + 2 : old.age >= 7 ? old.age + 1 : old.age, "l’âge avance d’un rang après l’Acier (la Vapeur) et d’un autre après l’Électricité (l’Atome)"); assert.strictEqual(S.intu, old.intu);
    assert.deepStrictEqual(S.zones, old.zones); assert.deepStrictEqual(S.frags, old.frags);
    assert.strictEqual(S.flags.news, "6", "annonce des nouveautés");
    assert.ok(S.dom && !S.fab && !S.settings.usine);
    assert.strictEqual(raw, fixture(f), "la chaîne d’origine n’est pas modifiée");
    T += 5000; E.update(); // le jeu tourne
  }
});
const machs = (E) => E.state.dom.mach;
test("les chaînes d’assemblage v1 se chargent : groupes dissous, machines possédées au repos", () => {
  const E = mk();
  E.load(fixture("save-v1-age10-chaines.json"));
  assert.deepStrictEqual(machs(E), []);
  assert.ok(E.state.flags.mach57);
  assert.ok(E.state.auto === undefined && E.state.lines === undefined);
  assert.ok(E.count("chaine") >= 2 && E.freeMach("chaine") === Math.floor(E.count("chaine")));
});
test("les lignes v2 se chargent : groupes dissous, machines possédées au repos", () => {
  const raw = fixture("save-v2-age7-fabrique.json");
  const old = JSON.parse(raw);
  const E = mk();
  E.load(raw);
  assert.deepStrictEqual(machs(E), []);
  assert.ok(E.state.flags.mach57);
  ["automate_bois", "automate_bronze", "presse_vapeur"].forEach((m) => {
    assert.strictEqual(E.count(m), old.inv[m], m + " conservé");
    assert.strictEqual(E.freeMach(m), old.inv[m], m + " au repos");
  });
});
test("v4 : les extracteurs d’avant sont posés et produisent autant", () => {
  for (const f of ["save-v1-age7.json", "save-v1-age10-chaines.json", "save-v2-age7-fabrique.json", "save-v3-age7-usine.json"]) {
    const raw = fixture(f), old = JSON.parse(raw);
    const E = mk();
    E.load(raw);
    const S = E.state, info = S.flags.fab4;
    const owned = E.EXTS.reduce((a, t) => a + Math.floor(old.inv[t] || 0), 0);
    assert.strictEqual(info.placed, owned, f + " : tous posés");
    // production totale : celle d’avant (extracteurs « tout seuls »), à 10 % près
    let before = 0;
    E.EXTS.forEach((t) => { const it = D.ITEMS[t]; for (const r in it.p) before += it.p[r] * Math.floor(old.inv[t] || 0); });
    let after = 0;
    for (const k in S.dom.ext) { const e = S.dom.ext[k]; for (const t in e.u) after += e.u[t] * E.extRate(t, e.res); }
    assert.ok(Math.abs(after - before) / before < 0.1, f + " : " + before.toFixed(1) + " → " + after.toFixed(1));
    run(E, 2);
    for (const k in S.dom.ext) assert.strictEqual(E.machInfo(k).s, "ok", f + " : " + k);
  }
});
test("commandes : ×10 sans machine puis avec un automate de bois au repos (finit plus vite)", () => {
  const E1 = mk();
  E1.state.known.manche = true; E1.state.made.manche = 1; E1.add("bois", 30);
  const r1 = E1.order("manche", 10);
  assert.ok(r1.ok);
  let t1 = 0;
  while (E1.state.hand.q.length > 0 && t1 < 3000) { T += 10; E1.update(); t1++; }
  assert.strictEqual(E1.count("manche"), 10, "×10 sans machine : les mains font tout");

  const E2 = mk();
  E2.state.known.manche = true; E2.state.made.manche = 1; E2.add("bois", 30);
  E2.add("automate_bois", 1);
  const r2 = E2.order("manche", 10);
  assert.ok(r2.ok);
  assert.ok(r2.time < r1.time, "temps estimé plus court avec l’automate");
  assert.strictEqual(E2.machines().automate_bois.used, 1, "l’automate travaille sur la commande");
  let t2 = 0;
  while (E2.state.hand.q.length > 0 && t2 < 3000) { T += 10; E2.update(); t2++; }
  assert.strictEqual(E2.count("manche"), 10);
  assert.ok(t2 < t1, "la commande finit plus vite avec l’automate : " + t2 + " < " + t1);
  assert.strictEqual(E2.machines().automate_bois.used, 0, "l’automate retourne au repos");
  assert.ok(!E2.automatable("feu") && !E2.automatable("cabane"), "pas d’objets uniques ni d’extracteurs");
});
test("commandes : plusieurs machines libres se répartissent sur les étapes et les commandes suivantes", () => {
  const E = mk();
  ["manche", "corde"].forEach((k) => { E.state.known[k] = true; E.state.made[k] = 1; });
  E.add("automate_bois", 2);
  E.add("bois", 60); E.add("fibre", 60);
  assert.ok(E.order("manche", 10).ok);
  assert.ok(E.order("corde", 10).ok);
  // les deux automates aident la première commande, ou se répartissent
  assert.strictEqual(E.machines().automate_bois.used, 2);
  run(E, 120);
  assert.strictEqual(E.count("manche"), 10);
  assert.strictEqual(E.count("corde"), 10);
  assert.strictEqual(E.machines().automate_bois.used, 0);
});
test("Domaine : commande et extracteurs hors ligne, sauvegarde et nettoyage", () => {
  const E = mk();
  E.add("automate_bois", 1); E.state.known.manche = true; E.state.made.manche = 1; E.add("bois", 2000);
  E.order("manche", 360);
  E.add("cabane", 1); E.domExtSet("lisiere", "bois", "cabane", 1);
  T += 3600 * 1000; E.update(); // une heure : la commande de 360 manches est terminée
  assert.strictEqual(E.count("manche"), 360, "360 manches : " + E.count("manche"));
  const E2 = mk();
  E2.load(E.serialize());
  assert.deepStrictEqual(E2.state.dom, E.state.dom);
  const o = JSON.parse(E.serialize());
  o.dom.ext["lisiere:laser"] = { u: { cabane: 1 } };
  o.dom.ext["nulle-part:bois"] = { u: { cabane: 1 } };
  o.dom.ext["lisiere:bois"] = { u: { cabane: 3, inconnu: 2, charbonniere: 1 } };
  o.dom.mach.push({ id: "M99", m: "laser", r: "manche", n: 1 }, { id: "M98", m: "automate_bois", r: "inconnu", n: 4 });
  o.dom.site = { inconnu: { on: true } };
  E2.load(JSON.stringify(o));
  const D2 = E2.state.dom;
  assert.deepStrictEqual(Object.keys(D2.ext), ["lisiere:bois"], "une seule cabane : elle reste sur le bois");
  assert.deepStrictEqual(D2.mach, [], "groupes de machines dissous");
  assert.deepStrictEqual(D2.site, {});
  assert.deepStrictEqual(Object.keys(E2.state.orphans.dom).sort(),
    ["ext:lisiere:bois:charbonniere", "ext:lisiere:bois:inconnu", "ext:lisiere:laser", "ext:nulle-part:bois", "mach:M98", "mach:M99", "site:inconnu"], "mis de côté, pas jetés");
});
test("sauvegarde illisible ou d’une version future : erreur, rien n’est touché", () => {
  const E = mk();
  E.tap("bois");
  assert.throws(() => E.load("pas du json"));
  assert.throws(() => E.load('{"v":99,"inv":{}}'), /plus récente/);
  assert.throws(() => E.load('{"foo":1}'));
  assert.strictEqual(E.count("bois"), 1, "l’état courant est intact");
});
test("objets inconnus mis de côté, pas perdus", () => {
  const E = mk();
  E.load(JSON.stringify({ v: 2, inv: { bois: 5, objet_futur: 3 }, known: { objet_futur: true } }));
  assert.strictEqual(E.count("bois"), 5);
  assert.strictEqual(E.state.orphans.inv.objet_futur, 3);
  assert.ok(!E.state.known.objet_futur);
});
test("import : fichier JSON ou ancien code base64", () => {
  const E = mk(); E.tap("bois");
  const json = E.serialize(), b64 = E.exportSave();
  const A = mk(); A.importSave(json); assert.strictEqual(A.count("bois"), 1);
  const B = mk(); B.importSave(b64); assert.strictEqual(B.count("bois"), 1);
});

console.log("Fabrication en chaîne, Fabrique, guidage");
test("plan récursif : feu de camp depuis les matières premières", () => {
  const E = mk();
  E.add("bois", 100); E.add("fibre", 100); E.add("caillou", 100);
  ["manche", "corde", "archet", "feu"].forEach((k) => (E.state.known[k] = true));
  const p = E.plan("feu");
  assert.ok(p.ok, JSON.stringify(p));
  assert.deepStrictEqual(p.steps.map((s) => s[0]), ["manche", "corde", "archet", "feu"].filter((x) => p.steps.find((s) => s[0] === x)).sort((a, b) => p.steps.findIndex((s) => s[0] === a) - p.steps.findIndex((s) => s[0] === b)));
  assert.strictEqual(p.steps[p.steps.length - 1][0], "feu");
  const r = E.craftPlan("feu");
  assert.ok(r.done); assert.ok(E.has("feu"));
});
test("plan : matières manquantes et recettes inconnues", () => {
  const E = mk();
  E.state.known.archet = true; E.state.known.manche = true;
  const p = E.plan("archet", 2);
  assert.ok(!p.ok);
  assert.deepStrictEqual(p.locked, ["corde"]);
  assert.strictEqual(p.missing.bois, 6);
  assert.strictEqual(E.craftPlan("archet").done, false);
});
test("maxPlan : nombre de fabrications en chaîne possibles", () => {
  const E = mk();
  E.add("bois", 30); E.add("fibre", 30);
  E.state.known.manche = E.state.known.corde = E.state.known.archet = true;
  assert.strictEqual(E.maxPlan("archet"), 5); // 3 bois + 6 fibres par archet : les fibres limitent
});
test("guidage : la prochaine étape d’un objectif", () => {
  const E = mk();
  ["manche", "corde"].forEach((k) => { E.state.known[k] = true; E.state.made[k] = 1; });
  E.state.exp.done.lisiere = 1;
  assert.deepStrictEqual([E.guide().ob.id, E.guide().step], ["feu", "archet"]);
  // lingot de cuivre → il faut un four → des briques → un feu → un archet (inconnu)
  assert.strictEqual(E.nextStep("lingot_cuivre").id, "archet");
  stations(E, ["feu"]);
  E.state.known.four = true;
  // briques → argile (rivière fermée) → outre → peau (plaine fermée) → épieu
  assert.strictEqual(E.nextStep("lingot_cuivre").id, "epieu");
});
test("objectifs : un joueur avancé ne retombe pas sur le tutoriel", () => {
  const E = mk();
  E.load(fixture("save-v1-age7.json"));
  const ob = E.objective();
  assert.ok(ob && ob.i > D.OBJECTIVES.findIndex((o) => Array.isArray(o) && o[0] === "moteur_vapeur"), JSON.stringify(ob));
});
test("objectifs : la porte de l’âge d’après construite en avance ne cache pas les étapes de l’âge en cours", () => {
  const E = mk(), S = E.state;
  const nom = (o) => (Array.isArray(o) ? o[0] : o.id);
  const idx = (id) => D.OBJECTIVES.findIndex((o) => nom(o) === id);
  for (let i = 0; i <= idx("pioche_pierre"); i++) {
    const o = D.OBJECTIVES[i];
    if (Array.isArray(o)) S.made[o[0]] = 1; else if (o.k === "ext") S.flags.extDone = 1; else if (o.k === "line") S.flags.lineDone = 1;
    else if (o.k === "exp") S.exp.done[o.z] = 9; else if (o.k === "pass") S.pass[o.z] = { done: true };
  }
  S.age = D.ITEMS.pioche_pierre.a;
  S.made.creuset = 1; // la porte de l’âge d’après, fabriquée avant les étapes de l’âge en cours
  const ob = E.objective();
  assert.ok(ob && ob.i < idx("creuset"), "l’objectif reste une étape de l’âge en cours : " + JSON.stringify(ob));
  const age = (o) => { let a = 0; for (let j = 0; j <= o.i; j++) { const n = D.OBJECTIVES[j]; if (Array.isArray(n)) a = D.ITEMS[n[0]].a; else if (n.k === "craft") a = D.ITEMS[n.id].a; } return a; };
  assert.strictEqual(age(ob), S.age, "même âge que celui qu’on a atteint");
});
test("réminiscences : on les gagne en cherchant, pas en attendant", () => {
  const E = mk();
  let hints = [];
  E.on("guidehint", (h) => hints.push(h.lvl));
  for (let i = 0; i < 4000; i++) { T += 100; E.update(); }
  assert.deepStrictEqual(hints, [], "rester inactif ne débloque rien");
  // l’étape : un manche (tailler + bois). Chaque essai nouveau rapporte, d’autant plus qu’il s’en approche
  assert.strictEqual(E.attempt("assembler", ["bois"]).mem, 2, "un ingrédient en commun");
  assert.strictEqual(E.attempt("assembler", ["bois"]).mem, 0, "le même essai ne rapporte plus");
  assert.strictEqual(E.attempt("tailler", ["fibre"]).mem, 2, "le bon geste");
  assert.strictEqual(E.attempt("tresser", ["caillou"]).mem, 1, "un essai sans rapport");
  E.attempt("assembler", ["bois", "fibre"]);
  assert.deepStrictEqual(hints, [1], "le geste revient : " + JSON.stringify(E.memory()));
  assert.deepStrictEqual(E.memory().next, 14);
  // on continue de chercher : toutes les combinaisons de trois gestes et de quatre matières
  const mats = ["bois", "fibre", "caillou", "os"], tries = [];
  for (const g of ["assembler", "tresser", "tailler"]) for (let m = 1; m < 16; m++) tries.push([g, mats.filter((x, i) => m & (1 << i))]);
  let n = 0;
  for (const [g, ids] of tries) { if (E.state.known.manche) break; if (E.attempt(g, ids).mem) n++; }
  assert.ok(n >= 6, "il faut chercher un moment : " + n + " essais");
  assert.deepStrictEqual(hints, [1, 2, 3]);
  assert.ok(E.state.known.manche, "la recette finit par être révélée");
});
test("suivi : se termine quand l’objet est fabriqué", () => {
  const E = mk();
  E.setTrack("manche"); assert.strictEqual(E.state.track.id, "manche");
  E.add("bois", 3); E.craft("manche");
  assert.strictEqual(E.state.track, null);
});

console.log("Secrets");
test("recettes secrètes", () => {
  const E = mk();
  stations(E, ["feu"]);
  E.add("fibre", 5); E.state.seen.fibre = true;
  const r = E.attempt("chauffer", ["fibre"]);
  assert.strictEqual(r.id, "galette"); assert.ok(E.state.secrets.galette);
});
test("codes du terminal", () => {
  const E = mk();
  E.terminal("XYZZY"); E.terminal("1969"); E.terminal("Prométhée");
  assert.ok(E.state.secrets.cxyzzy && E.state.secrets.c1969);
  assert.ok(!E.state.secrets.cpromethee && !E.state.frags.promethee, "l’ancien code ne fait plus rien");
  E.terminal("effacer"); assert.strictEqual(E.state.term.length, 0);
});
test("la Lune, sept fois", () => {
  const E = mk();
  for (let i = 0; i < 6; i++) assert.strictEqual(E.tapMoon(), null);
  assert.ok(E.tapMoon()); assert.ok(E.state.secrets.lune7);
});
test("flûte : l’Appel des Lucioles augmente la production", () => {
  const E = mk();
  force(E, "cabane");
  const e = E.domExtSet("lisiere", "bois", "cabane", 1);
  const r0 = E.extOut(e);
  [2, 2, 3, 1, 5, 2, 4].forEach((n) => E.playNote(n));
  assert.ok(E.state.flags.lucioles);
  assert.ok(Math.abs(E.extOut(e) - r0 * 1.25) < 1e-9);
});

/* retrouve les notes d’un air à partir de son empreinte (aucune réponse en clair ici) */
function airDe(id) {
  const m = D.MELODIES[id];
  const E = createEngine();
  const cur = new Array(m.len).fill(1);
  for (;;) {
    if (E.fnv1a32(cur.join("")) === m.h) return cur;
    let i = m.len - 1;
    while (cur[i] === 5) { cur[i] = 1; i--; }
    cur[i]++;
  }
}
console.log("Chemin caché — Le Chant");
test("de la boussole à la fin « Le Retour »", () => {
  const E = mk();
  stations(E, ["feu", "four", "bas_fourneau", "enclume_pierre", "enclume_bronze", "creuset", "pioche_bronze", "pioche_pierre",
    "outre", "epieu", "tour", "dynamo", "lithographe", "ordinateur", "radiotelescope", "four_arc"]);
  ["plaine", "riviere", "collines", "mine"].forEach((z) => (E.state.zones[z] = true));
  // la boussole ouvre la Porte Scellée
  force(E, "boussole");
  assert.ok(E.state.secrets.boussole);
  E.state.exp.done.mine = 1;
  assert.ok(E.startExp("mine").ok);
  T += 200 * 1000; E.update();
  assert.ok(E.zoneOpen("caveau")); assert.ok(E.state.secrets.caveau);
  // le Caveau : cuves, chambre d’Iris, cœur d’ARCHE
  for (let k = 0; k < 3; k++) {
    E.add("torche", 3);
    assert.ok(E.startExp("caveau").ok, "exploration du caveau " + k);
    T += 300 * 1000; E.update();
  }
  assert.ok(E.state.frags.cuves && E.state.frags.berceuse && E.state.frags.coeur);
  // la comptine des cuves, jouée à la flûte, débloque Accorder
  force(E, "flute");
  assert.ok(!E.gesteOK("accorder"));
  airDe("frere").forEach((n) => E.playNote(n));
  assert.ok(E.gesteOK("accorder"));
  // diapason, cristaux, signal, traducteur
  for (let i = 0; i < 400; i++) E.tap("resonite");
  force(E, "diapason", 30);
  force(E, "cristal_chantant", 2);
  assert.ok(E.listen().fresh);
  assert.strictEqual(E.count("signal_brut"), 1);
  force(E, "traducteur");
  assert.ok(E.state.flags.decoded && E.state.frags.signal);
  assert.ok(E.projVisible("chant"));
  // Les Matines (id chant)
  let ending = null;
  E.on("ending", (r) => (ending = r));
  const s0 = D.PROJECTS.chant.steps[0];
  for (const k in s0.cost) E.add(k, s0.cost[k]);
  assert.ok(E.contribute("chant").done);
  assert.strictEqual(E.projState("chant").step, 1);
  assert.strictEqual(E.cutRelay().ok, false);
  E.state.frags.poings = true;
  assert.strictEqual(E.cutRelay().ok, true);
  assert.strictEqual(E.projState("chant").step, 2);
  assert.strictEqual(E.releaseHand().ok, true);
  assert.strictEqual(E.projState("chant").step, 3);
  E.fire("chant");
  assert.ok(ending && ending.id === "retour");
});
test("Brise-Monde : mise à feu", () => {
  const E = mk();
  E.state.flags.arche = true;
  let ending = null;
  E.on("ending", (r) => (ending = r));
  D.PROJECTS.brisemonde.steps.forEach((s) => { if (s.cost) { for (const k in s.cost) E.add(k, s.cost[k]); E.contribute("brisemonde"); } });
  E.fire("brisemonde");
  assert.strictEqual(ending.id, "brasier");
});
test("nouveau cycle : on garde le savoir, on gagne des échos", () => {
  const E = mk();
  E.state.flags.arche = true;
  D.PROJECTS.dyson.steps.forEach((s) => { for (const k in s.cost) E.add(k, s.cost[k]); E.contribute("dyson"); });
  assert.ok(E.state.endings.aube);
  E.state.known.manche = true; E.state.frags.chene = true; E.state.meta.capsule = true;
  E.newCycle();
  const S = E.state;
  assert.strictEqual(S.cycle, 2); assert.strictEqual(S.echoes, 1);
  assert.ok(S.known.manche && S.frags.chene); assert.ok(!S.endings.aube); assert.ok(S.meta.endings.aube);
  assert.ok(S.count === undefined && E.count("manche") === 10, "capsule temporelle");
  assert.strictEqual(E.tapYield("bois", "lisiere"), 1.5);
});

test("mains : une pièce après l’autre, matières mises de côté", () => {
  const E = mk();
  E.add("bois", 20); E.learn("manche");
  const t = E.handTime("manche");
  const r = E.queue("manche", 3);
  assert.ok(r.ok);
  assert.strictEqual(E.count("bois"), 11, "le bois est pris dès la mise en file");
  assert.ok(Math.abs(r.time - E.batchTime("manche", 3)) < 1e-9);
  assert.ok(r.time < 3 * t, "répéter le geste va plus vite");
  E.step(t * 1.5);
  assert.strictEqual(E.count("manche"), 1, "une pièce finie");
  assert.ok(E.cancelJob(0));
  assert.strictEqual(E.count("bois"), 17, "les deux pièces pas faites rendent leur bois");
  assert.strictEqual(E.state.hand.q.length, 0);
  assert.strictEqual(E.queue("manche", 10).why, "qty");
  E.state.age = 5;
  assert.ok(Math.abs(E.handTime("manche") - t * Math.pow(D.HAND.old, 5)) < 1e-9, "les gestes anciens vont plus vite");
});
test("mains : en chaîne, les sous-composants restent sur l’établi", () => {
  const E = mk();
  E.add("bois", 10); E.add("fibre", 12); E.add("manche", 4);
  ["manche", "corde", "archet"].forEach((i) => E.learn(i));
  const r = E.queue("archet", 2, true);
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(E.count("manche"), 2, "deux manches du stock réservés");
  assert.strictEqual(E.count("fibre"), 0, "de quoi tresser quatre cordes");
  E.step(r.time + 0.01);
  assert.strictEqual(E.count("archet"), 2);
  assert.strictEqual(E.count("corde"), 0, "les cordes ont servi aux archets");
  assert.strictEqual(E.count("manche"), 2);
  assert.strictEqual(E.state.hand.q.length, 0);
});
test("mains : découverte immédiate, recette connue dans la file, outil unique une seule fois", () => {
  const E = mk();
  E.add("bois", 30);
  assert.strictEqual(E.attempt("tailler", ["bois"]).kind, "craft", "première fois : tout de suite");
  const q = E.attempt("tailler", ["bois"]);
  assert.strictEqual(q.kind, "queued");
  assert.strictEqual(E.count("manche"), 1);
  E.step(q.time);
  assert.strictEqual(E.count("manche"), 2);
  E.add("fibre", 100); E.learn("panier");
  assert.ok(E.queue("panier", 1).ok);
  assert.strictEqual(E.queue("panier", 1).why, "queued");
  E.learn("corde");
  for (let i = 0; i < 7; i++) E.queue(i % 2 ? "corde" : "manche", 1); // en alternance : chacune a sa place
  assert.strictEqual(E.state.hand.q.length, 8);
  assert.strictEqual(E.queue("corde", 1).why, "full");
});
test("mains : la même pièce demandée plusieurs fois d’affilée s’allonge au lieu d’empiler", () => {
  const E = mk();
  E.state.known.manche = true; E.add("bois", 60);
  for (let i = 0; i < 4; i++) assert.ok(E.queue("manche", 1).ok);
  assert.deepStrictEqual(E.state.hand.q.map((j) => j.s[0][1]), [1, 3], "la première est en cours, les trois suivantes n’en font qu’une");
  run(E, 30);
  assert.strictEqual(E.count("manche"), 4);
  assert.strictEqual(E.count("bois"), 60 - 12);
});
test("mains : ×10 cabanes depuis les matières premières, en une seule fabrication", () => {
  const E = mk();
  ["manche", "corde", "cabane"].forEach((k) => (E.state.known[k] = true));
  E.add("bois", 2000); E.add("fibre", 2000);
  const max = E.maxPlan("cabane");
  assert.ok(max >= 10, "Max : " + max);
  assert.ok(E.queue("cabane", 10, true).ok);
  assert.strictEqual(E.state.hand.q.length, 1, "une seule ligne dans la file");
  run(E, 900);
  assert.strictEqual(E.count("cabane"), 10);
});
test("mains : en chaîne avec tout en stock, la même pièce s’allonge aussi", () => {
  const E = mk();
  E.state.known.manche = true; E.add("bois", 60);
  for (let i = 0; i < 3; i++) assert.ok(E.queue("manche", 1, true).ok);
  assert.deepStrictEqual(E.state.hand.q.map((j) => j.s[0][1]), [1, 2]);
});
test("mains : trois extracteurs en chaîne d’affilée sortent tous (le prix monte pour chacun)", () => {
  const E = mk();
  ["manche", "corde", "cabane"].forEach((k) => (E.state.known[k] = true));
  E.add("bois", 500); E.add("fibre", 500);
  for (let i = 0; i < 3; i++) assert.ok(E.queue("cabane", 1, true).ok, "mise en file " + (i + 1));
  run(E, 120);
  assert.strictEqual(E.state.hand.q.length, 0, "la file s’est vidée : " + JSON.stringify(E.state.hand.q.map((j) => [j.id, j.i, j.k, j.w])));
  assert.strictEqual(E.count("cabane"), 3);
});
test("mains : la file survit à la sauvegarde et avance pendant l’absence", () => {
  const E = mk();
  E.add("bois", 30); E.learn("manche");
  E.queue("manche", 8);
  const txt = E.serialize();
  const F = mk();
  F.load(txt);
  assert.strictEqual(F.count("bois"), 6);
  T += 60000;
  F.update();
  assert.strictEqual(F.count("manche"), 8);
  assert.strictEqual(F.state.hand.q.length, 0);
});
test("sauvegarde : une fabrication illisible rend ses matières", () => {
  const E = mk();
  const o = JSON.parse(E.serialize());
  o.inv.bois = 1;
  o.hand = { q: [{ id: "objet_disparu", s: [["objet_disparu", 2]], i: 0, k: 0, b: { bois: 5, truc_inconnu: 2 } }, { id: "manche", s: [["manche", 1]], i: 0, k: 0, b: { bois: 3 } }], p: 0.2 };
  E.load(o);
  assert.strictEqual(E.count("bois"), 6, "le bois mis de côté revient");
  assert.strictEqual(E.state.orphans.inv.truc_inconnu, 2, "l’inconnu est mis de côté, pas jeté");
  assert.strictEqual(E.state.hand.q.length, 1);
});
test("étude des matières : ce qui réagit, contre de l’Intuition", () => {
  const E = mk();
  ["bois", "fibre", "caillou"].forEach((i) => E.add(i, 1));
  assert.deepStrictEqual(E.reactions("bois"), { tailler: 1 }, "le manche");
  E.learn("manche");
  E.add("manche", 1);
  assert.ok(E.reactions("manche").tresser >= 1, "le panier");
  const before = E.state.intu;
  assert.ok(E.study("manche"));
  assert.strictEqual(E.state.intu, before - E.studyCost("manche"));
  assert.ok(!E.study("manche"), "une seule fois");
  assert.ok(!E.study("os"), "pas une matière jamais vue");
});
test("Mémoire des mains : premiers prix inchangés, niveaux en plus, prix qui montent", () => {
  const M = Object.fromEntries(D.MEMOIRE.map((m) => [m.id, m]));
  assert.deepStrictEqual(M.recolte.cost.slice(0, 3), [2, 4, 8]);
  assert.deepStrictEqual(M.extr.cost.slice(0, 4), [3, 5, 8, 13]);
  for (const m of D.MEMOIRE) for (let i = 1; i < m.cost.length; i++) assert.ok(m.cost[i] > m.cost[i - 1], m.id + " : prix croissants");
  assert.ok(M.mach.cost.length >= 12 && M.recolte.cost.length >= 10);
  const E = mk();
  E.state.meta.traces = 1e6; E.state.meta.achats = true;
  for (let i = 0; i < M.recolte.cost.length; i++) assert.ok(E.memBuy("recolte"));
  assert.ok(!E.memBuy("recolte"), "au maximum");
  assert.strictEqual(E.memV("recolte"), 1 + M.recolte.cost.length);
});
test("Règles par terre : lumière, gants, courant, marches, orbite, Lune", () => {
  const E = mk();
  const near = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));
  const noir = E.tapYield("charbon", "mine");
  assert.strictEqual(E.regle("mine").etat, "gene");
  E.add("torche", 1);
  assert.strictEqual(E.regle("mine").etat, "ok");
  assert.ok(near(E.tapYield("charbon", "mine"), noir / 0.6), "avec la torche : plein rendement");
  assert.strictEqual(E.regle("lisiere"), null);
  assert.strictEqual(E.regle("desert").etat, "gene");
  E.add("gants", 1);
  assert.strictEqual(E.regle("desert").etat, "ok");
  const base = E.tapYield("debris", "orbite") / 0.25;      // rendement sans règle
  assert.ok(near(E.tapYield("regolithe", "lune"), E.tapYield("regolithe", "lune")) && E.tapYield("debris", "orbite") < base);
  assert.ok(near(E.tapYield("helium3", "lune") * 2, E.tapYield("helium3", "lune") / 1.5 * 3), "Lune : une fois et demie");
  // marches : deux lieux explorés aux Collines retirent 16 % au passage vers les Profondeurs, pas aux autres
  const avant = E.passCost("mine"), ailleurs = E.passCost("desert");
  E.state.exp.done.collines = 5;
  const apres = E.passCost("mine");
  for (const i in avant) assert.ok(apres[i] < avant[i] && apres[i] >= Math.floor(avant[i] * 0.84), i);
  assert.deepStrictEqual(E.passCost("desert"), ailleurs);
  // courant : au-delà de 6 extracteurs sur un gisement, chacun rend moitié moins
  const e6 = { z: "riviere", res: "argile", u: { cabane: 6 } }, e8 = { z: "riviere", res: "argile", u: { cabane: 8 } };
  assert.ok(near(E.extOut(e8), E.extOut(e6) * (6 + 2 * 0.5) / 6));
});
test("Règles par terre, suite : vapeurs, air mince, chaleur", () => {
  const E = mk();
  const near = (x, y) => Math.abs(x - y) < 1e-9 * Math.max(1, Math.abs(y));
  const pet = E.tapYield("petrole", "gisement");
  assert.strictEqual(E.regle("gisement").etat, "gene");
  E.add("masque", 1);
  assert.strictEqual(E.regle("gisement").etat, "ok");
  assert.ok(near(E.tapYield("petrole", "gisement"), pet / 0.6));
  const ba = E.tapYield("bauxite", "montagnes");
  E.add("bouteille", 1);
  assert.ok(near(E.tapYield("bauxite", "montagnes"), ba / 0.6));
  const e = { z: "mercure", res: "metal_mercure", u: { cabane: 3 } };
  assert.strictEqual(E.regle("mercure").etat, "gene");
  const chaud = E.extOut(e);
  E.add("bouclier_th", 1);
  assert.strictEqual(E.regle("mercure").etat, "ok");
  assert.ok(near(E.extOut(e), chaud / 0.6));
  assert.ok(D.ITEMS.masque.r && D.ITEMS.bouteille.r, "les deux objets se fabriquent");
});
test("Un passage n’apparaît que lorsque la terre d’avant est ouverte", () => {
  const E = mk();
  // l’objet-clé des Collines fabriqué en avance, alors qu’on est encore à la Lisière
  E.add("pioche_pierre", 1);
  E.state.made.pioche_pierre = 1;
  E.state.pass.collines = { paid: {}, done: false };
  assert.ok(!E.passPending().includes("collines"), "pas de passage vers les Collines depuis la Lisière");
  assert.strictEqual(E.passInfo("collines").ready, false);
  E.add("argile", 1000); E.add("brique", 1000); E.add("caillou", 100000);
  assert.strictEqual(E.passPour("collines").ok, false, "rien ne se dépose dans un passage qu’on ne voit pas");
  assert.strictEqual(E.state.inv.argile, 1000);
  // la Rivière ouverte, il apparaît
  E.state.zones.plaine = true; E.state.zones.riviere = true;
  assert.ok(E.passPending().includes("collines"));
  assert.strictEqual(E.passInfo("collines").ready, true);
});
test("Les âges se franchissent un par un, et rien ne se découvre au-delà de l’âge suivant", () => {
  const E = mk();
  assert.strictEqual(E.state.age, 0);
  // les gants (âge 4) se font avec de la peau et de la fibre : impossible à l’âge du Bois
  E.add("cuir", 5); E.add("fibre", 5);
  assert.ok(!E.ageOK("gants"));
  assert.strictEqual(E.attempt("assembler", ["cuir", "fibre"]).kind, "fail", "pas de découverte d’un objet trop lointain");
  assert.ok(!E.state.known.gants && E.state.age === 0);
  // même un objet d’un âge atteint par le « dernier moment » ne fait jamais sauter plus d’un âge
  E.state.age = 1;
  E.add("manche", 3); E.add("caillou", 5); E.add("corde", 3);
  assert.ok(E.ageOK("pioche_pierre"), "l’âge suivant est à portée");
  E.learn("lingot_bronze"); E.add("lingot_bronze", 1);
  assert.ok(!E.ageOK("lingot_bronze") || E.state.age <= 1);
  E.state.known.plaque_bronze = true;
  assert.ok(!E.ageOK("plaque_bronze"));
  assert.deepStrictEqual(E.queue("plaque_bronze", 1), { ok: false, why: "age" });
  // le Carnet ne montre pas d’objet de l’âge d’après, hors objectif et objets trouvés
  const dernier = E.carnet().map((s) => s.age).pop();
  assert.ok(dernier <= E.state.age + 1);
  for (const sec of E.carnet()) if (sec.age > E.state.age) for (const id of sec.ids) assert.ok(E.state.known[id] || E.state.made[id] > 0 || id === (E.guide().step || (E.guide().ob || {}).id), id + " ne devrait pas se voir");
});
test("Une partie dont l’âge a sauté à cause des gants retrouve son vrai âge", () => {
  const E = mk();
  const o = JSON.parse(E.serialize());
  o.age = 4; o.made = { manche: 1, corde: 1, gants: 1 }; o.known = { manche: true, corde: true, gants: true };
  E.load(JSON.stringify(o));
  assert.ok(E.state.age <= 1, "l’âge revient à ce qu’on a vraiment atteint (" + E.state.age + ")");
});
test("L’âge suivant ne s’ouvre que lorsque les étapes de l’âge en cours sont faites", () => {
  const E = mk();
  const S = E.state;
  // la porte de l’âge suivant (la lanière) fabriquée en avance, alors que les étapes de l’âge du Bois ne sont pas faites
  S.made.laniere = 1;
  E.avancerAge();
  assert.strictEqual(S.age, 0, "l’âge reste le même tant que les étapes ne sont pas finies");
  // toutes les étapes de l’âge 0 : manche, corde, exploration du Chêne, feu, cabane, extracteur, épieu, passage de la Plaine
  for (const id of ["manche", "corde", "feu", "cabane", "epieu"]) S.made[id] = 1;
  S.exp.done.lisiere = 1; S.flags.extDone = true; S.pass.plaine = { paid: {}, done: true };
  E.avancerAge();
  assert.strictEqual(S.age, 1, "les étapes faites, l’âge s’ouvre, d’un seul cran");
  // un objet de l’âge d’après-après fabriqué ne fait pas avancer plus loin
  S.made.lingot_cuivre = 1;
  E.avancerAge();
  assert.strictEqual(S.age, 1, "l’âge 2 n’est pas ouvert : les étapes de l’âge 1 ne sont pas faites");
});
test("Étudier tout : toutes les ressources vues d’un coup, ou rien", () => {
  const E = mk();
  ["bois", "fibre", "caillou"].forEach((i) => E.add(i, 1));
  E.state.intu = 0;
  const sa = E.studyAllCost();
  assert.ok(sa.n >= 3 && sa.c >= sa.n);
  assert.strictEqual(E.studyAll(), 0, "pas assez d’Intuition : rien ne change");
  assert.ok(!E.state.studied.bois);
  E.state.intu = sa.c + 2;
  assert.strictEqual(E.studyAll(), sa.n);
  assert.strictEqual(E.state.intu, 2);
  assert.ok(E.state.studied.bois && E.state.studied.caillou);
  assert.strictEqual(E.studyAllCost().n, 0);
  assert.strictEqual(E.usesLeft("bois"), 1, "le manche reste à trouver");
  E.learn("manche");
  assert.strictEqual(E.usesLeft("bois"), 0);
});

test("Grand Œuvre alimenté : il se sert dans la Réserve, au débit de l’âge", () => {
  const E = mk();
  assert.strictEqual(E.domSite("inconnu", true), null);
  E.state.flags.arche = true; E.state.age = 12; E.recalc();
  assert.ok(E.domSite("dyson", true));
  assert.ok(E.siteOn("dyson"));
  E.add("supra", 400); E.add("metal_mercure", 60000); E.add("regolithe", 20000);
  run(E, 5);
  const ps = E.projState("dyson");
  const paid = Object.values(ps.paid);
  assert.ok(paid.some((v) => v > 0) && paid.every((v) => v <= E.siteRate() * 5 + 1e-6), "au débit de l’âge : " + JSON.stringify(ps.paid));
  assert.strictEqual(E.machInfo("S:dyson").s, "ok");
  ps.paid = { supra: 380, metal_mercure: 49990, regolithe: 12500 };
  let step = null;
  E.on("projstep", (x) => (step = x));
  run(E, 1);
  assert.deepStrictEqual(step, { pid: "dyson", step: 0 });
  assert.strictEqual(ps.step, 1, "étape suivante");
  E.domSite("dyson", false);
  const before = JSON.stringify(ps.paid);
  run(E, 2);
  assert.strictEqual(JSON.stringify(ps.paid), before, "à l’arrêt, il ne prend plus rien");
});
test("commandes : une commande qui manque de bois attend, pose une cabane au repos sur le bois, puis reprend", () => {
  const E = mk();
  E.state.known.manche = true; E.state.made.manche = 1;
  E.add("bois", 3); // de quoi faire 1 manche sur 3
  const r = E.order("manche", 3);
  assert.ok(r.ok);
  assert.strictEqual(E.count("bois"), 0, "les 3 bois disponibles sont pris sur l’établi");
  assert.strictEqual(E.state.hand.q[0].miss.bois, 6, "il manque 6 bois");
  run(E, 20);
  assert.strictEqual(E.count("manche"), 1, "1 manche fait, la commande attend le reste du bois");
  assert.strictEqual(E.state.hand.q.length, 1);
  assert.ok(E.handInfo().jobs[0].wait, "la commande est en attente de matières");
  // une cabane libre est posée automatiquement sur le gisement de bois
  E.add("cabane", 1);
  run(E, 1);
  assert.ok(E.domExt("lisiere", "bois") && E.domExt("lisiere", "bois").u.cabane === 1, "la cabane au repos est posée sur le bois");
  run(E, 30);
  assert.strictEqual(E.count("manche"), 3, "la commande a repris et fini grâce au bois récolté");
  assert.strictEqual(E.state.hand.q.length, 0);
});
test("un extracteur remplit le stock sans plafond, la main aussi", () => {
  const E = mk();
  E.add("cabane", 20);
  const x = E.domExtSet("lisiere", "bois", "cabane", 10), out = E.extOut(x);
  const b0 = E.count("bois");
  run(E, 10);
  assert.ok(Math.abs(E.count("bois") - b0 - out * 10) < 1e-6, "tout arrive : " + (E.count("bois") - b0));
  assert.strictEqual(E.machInfo("lisiere:bois").s, "ok");
  E.add("bois", 1e6);
  assert.ok(E.tap("bois") > 0);
});
test("production : la récolte des extracteurs et ce que font et prennent les machines sur une commande", () => {
  const E = mk();
  E.add("cabane", 2);
  const x = E.domExtSet("lisiere", "bois", "cabane", 2);
  run(E, 25);
  E.add("automate_bois", 1); E.state.known.manche = true; E.state.made.manche = 1; E.add("bois", 1500);
  assert.ok(E.order("manche", 500).ok);
  run(E, 5);
  const p = E.production(), bois = p.find((y) => y.id === "bois"), manche = p.find((y) => y.id === "manche");
  const out = E.extOut(x);
  assert.ok(Math.abs(bois.in - out) < out * 0.05, "bois récolté : " + bois.in + " / " + out);
  assert.ok(Math.abs(bois.out - 0.3) < 0.03, "le bois que consomme l’automate (6/min × 3) : " + bois.out);
  assert.ok(Math.abs(manche.in - 0.1) < 0.01, "les manches : " + manche.in);
});
test("relève : le Domaine repart de zéro", () => {
  const E = mk();
  E.add("cabane", 1); E.domExtSet("lisiere", "bois", "cabane", 1);
  E.add("automate_bois", 1); E.state.known.manche = true; E.order("manche", 5);
  E.newCycle();
  assert.deepStrictEqual(E.state.dom, { ext: {}, mach: [], site: {}, ms: {}, seq: 0 });
  assert.deepStrictEqual(E.state.hand.q, []);
  run(E, 1);
});
test("jalons : les objectifs rangés par âge", () => {
  const E = mk();
  const m = E.milestones();
  assert.ok(m[0].length >= 4, "l’âge du Bois a ses jalons");
  assert.ok(m[0].some((x) => x.ob.k === "ext"), "installer la cabane fait partie de l’âge du Bois");
  assert.ok(!m[0][0].done);
  E.add("bois", 3); E.attempt("tailler", ["bois"]);
  assert.ok(E.milestones()[0][0].done);
  const all = m.reduce((a, l) => a + (l ? l.length : 0), 0);
  assert.strictEqual(all, D.OBJECTIVES.length);
});

test("jalons : chaque âge en a plusieurs, le compte est cohérent", () => {
  const m = mk().milestones();
  assert.ok(m[1].length >= 4, "l’âge de l’Os a ses étapes : " + m[1].map((x) => x.ob.id || x.ob.n));
  // la première étape de l’Os fait entrer dans l’Os (pas une étape d’un autre âge)
  assert.strictEqual(D.ITEMS[m[1][0].ob.id].a, 1);
});
test("âge accompli : toutes ses étapes faites, un peu d’Intuition, une seule fois", () => {
  const E = mk();
  const S = E.state, before = S.intu;
  E.milestones()[0].forEach((x) => { if (x.ob.k === "craft") S.made[x.ob.id] = 1; });
  S.exp.done.lisiere = 1; S.flags.extDone = true; S.pass.plaine = { paid: {}, done: true };
  E.checkAges();
  assert.ok(S.flags.ages[0], "l’âge du Bois est accompli");
  assert.strictEqual(S.intu, before + D.AGE_DONE);
  E.checkAges();
  assert.strictEqual(S.intu, before + D.AGE_DONE, "pas deux fois");
  assert.ok(!S.flags.ages[1]);
  // une ancienne partie : ses âges finis sont marqués sans récompense
  const raw = JSON.parse(E.serialize());
  delete raw.flags.ages; raw.intu = 5;
  const F = mk(); F.load(JSON.stringify(raw));
  assert.ok(F.state.flags.ages[0]); assert.strictEqual(F.state.intu, 5);
});
const extTotals = (cells) => { const o = {}; cells.forEach((e) => { if (e.u && (e.k === undefined || e.k === "ext")) for (const t in e.u) { const g = (D.ITEMS[t] && D.ITEMS[t].de) || t; o[g] = (o[g] || 0) + e.u[t]; } }); return o; };
const machList = (list) => list.map((e) => [e.id, e.m, e.r || null, e.n, e.on !== false, e.cap || 0].join(" ")).sort();
test("v4 → v6 : les extracteurs de l’usine passent dans le Domaine, les groupes de machines sont dissous", () => {
  const raw = fixture("save-v4-age8-carte.json"), old = JSON.parse(raw);
  const E = mk();
  E.load(raw);
  const S = E.state, cells = Object.values(old.fab.c);
  assert.deepStrictEqual(extTotals(Object.values(S.dom.ext)), extTotals(cells), "autant d’extracteurs de chaque type");
  assert.deepStrictEqual(S.dom.mach, [], "groupes de machines dissous");
  assert.ok(S.flags.mach57);
  assert.deepStrictEqual(S.orphans.fab5.c, old.fab.c, "l’ancienne usine est gardée de côté");
  // la récolte par matière est la même
  // l’ancien extracteur à plusieurs ressources rendait, sur chacune, le taux de son niveau frère d’aujourd’hui
  const frere = (t, res) => Object.keys(D.ITEMS).find((x) => (x === t || D.ITEMS[x].de === t) && D.ITEMS[x].t === "ext" && D.ITEMS[x].p[res]) || t;
  const rate = (list) => { const o = {}; list.forEach((e) => { if (e.u && e.k !== "mach") for (const t in e.u) o[e.res] = (o[e.res] || 0) + e.u[t] * E.extRate(frere(t, e.res), e.res); }); return o; };
  assert.deepStrictEqual(rate(Object.values(S.dom.ext)), rate(cells.filter((e) => e.k === "ext")));
  assert.deepStrictEqual(S.hints, old.hints, "les indices déjà obtenus");
  assert.deepStrictEqual(S.hand, { q: [], p: 0 });
  assert.deepStrictEqual(S.studied, {});
  assert.ok(!S.flags.v5proj, "pas de Grand Œuvre commencé");
  const o = JSON.parse(raw);
  o.flags.arche = true; o.proj = { dyson: { step: 1, paid: { panneau_dyson: 120 } } };
  const F = mk();
  F.load(o);
  assert.ok(F.state.flags.v5proj, "on prévient le joueur");
  assert.deepStrictEqual(F.projState("dyson"), { step: 1, paid: { panneau_dyson: 120 } }, "ce qui a été versé reste acquis");
});
test("v5 → v6 : rien ne se perd, ce qui était en route ou dans les machines revient au stock", () => {
  const raw = fixture("save-v5-age8-usine.json"), old = JSON.parse(raw);
  const E = mk();
  E.load(raw);
  const S = E.state, cells = Object.values(old.fab.c), ms = old.fab.ms;
  assert.strictEqual(old.v, 5);
  assert.ok(cells.some((e) => e.k === "belt") && cells.some((e) => e.k === "split"), "une vraie usine avancée");
  assert.deepStrictEqual(extTotals(Object.values(S.dom.ext)), extTotals(cells));
  assert.deepStrictEqual(S.dom.mach, [], "groupes de machines dissous");
  assert.ok(S.flags.mach57);
  const want = Object.assign({}, old.inv);
  const put = (i, v) => { if (v > 0) want[i] = (want[i] || 0) + v; };
  cells.forEach((e) => {
    const B = e.id && ms[e.id];
    if (!B) return;
    if (e.k === "ext") put(e.res, B.o);
    if (e.k === "mach" && e.r) { put(e.r, B.o); for (const i in B.b) put(i, B.b[i]); }
    if (e.k === "site") for (const i in B.b) put(i, B.b[i]);
  });
  const fam = (i) => Object.keys(D.ITEMS).filter((x) => x === i || D.ITEMS[x].de === i).reduce((a, x) => a + (S.inv[x] || 0), 0);
  for (const i in want) assert.ok(Math.abs((D.ITEMS[i] && D.ITEMS[i].t === "ext" ? fam(i) : (S.inv[i] || 0)) - want[i]) < 1e-6, i + " : " + S.inv[i] + " / " + want[i]);
  assert.ok(E.siteOn("dyson"), "le chantier devient un Grand Œuvre alimenté");
  assert.ok(!("usine" in S.settings));
  assert.deepStrictEqual(S.orphans.fab5, old.fab);
  run(E, 5);
  Object.keys(S.dom.ext).forEach((k) => assert.strictEqual(E.machInfo(k).s, "ok", k));
});

console.log("Compétences et action qui tourne");
test("gestes : l’expérience vient de ce qu’on fait à la main, un niveau rend plus rapide", () => {
  const E = mk();
  assert.strictEqual(E.skill("tailler").lvl, 1);
  const t0 = E.handTime("manche");
  E.state.known.manche = true; E.add("bois", 600);
  assert.ok(E.queue("manche", 100).ok);
  run(E, 400);
  const k = E.skill("tailler");
  assert.ok(k.xp >= 100 * E.xpOf("manche") - 1e-9, "100 manches : " + k.xp);
  assert.ok(k.lvl > 1);
  assert.ok(E.handTime("manche") < t0, "plus rapide");
  // une pièce faite par une machine ne donne pas d’expérience (les mains sont occupées sur une recette à 2 ingrédients)
  E.state.known.archet = true; E.add("manche", 500); E.add("corde", 1000);
  assert.ok(E.order("archet", 500).ok); // 2 ingrédients : l’automate de bois ne peut pas la faire, les mains s’en chargent
  const xp = E.skill("tailler").xp, mBefore = E.count("manche");
  E.add("automate_bois", 1); E.add("bois", 300); assert.ok(E.order("manche", 5).ok); // l’automate de bois fait les manches seul pendant ce temps
  run(E, 12);
  assert.ok(E.count("manche") > mBefore, "l’automate a fabriqué des manches");
  assert.strictEqual(E.skill("tailler").xp, xp, "les manches faits par l’automate ne donnent pas d’XP en tailler");
  // paliers : une chance de pièce en plus
  E.state.skills.tresser = E.XP_T[25];
  assert.strictEqual(E.skill("tresser").perks, 2);
  assert.ok(Math.abs(E.perkChance("tresser") - 2 * D.SKILL.perk) < 1e-9);
  let lv = null;
  E.on("level", (x) => (lv = x));
  E.state.skills.assembler = E.XP_T[10] - 1;
  E.gainXp("assembler", 1);
  assert.deepStrictEqual(lv, { g: "assembler", lvl: 10, perk: true });
});
test("récolte à la main : de l’expérience, et un rendement qui monte", () => {
  const E = mk();
  const y0 = E.tap("bois", "lisiere");
  assert.strictEqual(E.skill("recolte").xp, 1);
  E.state.skills.recolte = E.XP_T[50];
  assert.ok(Math.abs(E.tap("bois", "lisiere") - y0 * 1.49) < 1e-9, "niveau 50 : ×1,49");
});
test("action qui tourne : ramasser en continu, même jeu fermé", () => {
  const E = mk();
  assert.strictEqual(E.startAct({ k: "harv", z: "plaine", res: "os" }), null, "pas sur une terre fermée");
  E.startAct({ k: "harv", z: "lisiere", res: "bois" });
  run(E, 60);
  assert.ok(Math.abs(E.count("bois") - 40) <= 1, "une prise toutes les 1,5 s : " + E.count("bois"));
  assert.strictEqual(E.actInfo().got, E.count("bois"));
  const b = E.count("bois");
  T += 3600 * 1000; E.update();
  assert.ok(E.count("bois") - b > 2000, "une heure dehors : " + (E.count("bois") - b));
  E.stopAct();
  assert.strictEqual(E.state.act, null);
});
test("commandes : annuler rend tout l’établi ; sauvegarder au milieu d’une commande reprend où elle en était", () => {
  const E = mk();
  assert.strictEqual(E.startAct({ k: "make", id: "manche" }), null, "la boucle de recette n’existe plus");
  ["manche", "corde", "archet"].forEach((k) => { E.state.known[k] = true; E.state.made[k] = 1; });
  E.add("bois", 30); E.add("fibre", 60);
  assert.ok(E.order("archet", 5).ok);
  run(E, 1); // quelques manches fabriqués sur l’établi
  const j = E.state.hand.q[0];
  assert.ok(j && (j.b.manche || 0) >= 1, "des manches intermédiaires sont sur l’établi");
  // sauvegarde et rechargement au milieu de la commande
  const saved = E.serialize();
  const F = mk();
  F.load(saved);
  assert.strictEqual(F.state.hand.q.length, 1);
  assert.deepStrictEqual(F.state.hand.q[0].done, j.done, "progression conservée");
  run(F, 30);
  assert.strictEqual(F.count("archet"), 5, "la commande rechargée va jusqu’au bout");
  // annuler sur E rend les matières restantes et les manches déjà faits sur l’établi
  const madeManches = j.b.manche || 0;
  assert.ok(E.cancelJob(0));
  assert.strictEqual(E.count("manche"), madeManches, "les sous-pièces déjà faites sur l’établi vont en Réserve");
  assert.strictEqual(E.count("bois"), 30 - madeManches * 3, "le bois non consommé revient en Réserve");
  assert.strictEqual(E.count("fibre"), 60, "les fibres reviennent en Réserve");
});
test("compétences et action : sauvegarde, relève", () => {
  const E = mk();
  E.state.skills.tailler = 5000; E.state.skills.recolte = 300;
  E.startAct({ k: "harv", z: "lisiere", res: "fibre" });
  const F = mk();
  F.load(E.serialize());
  assert.deepStrictEqual(F.state.skills, E.state.skills);
  assert.strictEqual(F.state.act.res, "fibre");
  const o = JSON.parse(E.serialize());
  o.skills.inconnu = 5; o.skills.tailler = "x"; o.act = { k: "make", id: "laser" };
  F.load(JSON.stringify(o));
  assert.deepStrictEqual(F.state.skills, { recolte: 300 });
  assert.strictEqual(F.state.act, null);
  E.state.pass.plaine = { paid: {}, done: true };
  E.newCycle();
  assert.deepStrictEqual(E.state.skills, { tailler: 500, recolte: 30 }, "un dixième reste");
  assert.strictEqual(E.state.act, null);
});

console.log("Le Comptoir");
test("tout objet vendable a une valeur > 0 et finie", () => {
  const E = mk();
  for (const id in D.ITEMS) {
    if (E.sellable(id)) {
      const v = E.value(id);
      assert.ok(v > 0, id + " a une valeur positive");
      assert.ok(Number.isFinite(v), id + " a une valeur finie");
    }
  }
});
test("vendre retire de la Réserve et ajoute les écus", () => {
  const E = mk();
  E.add("bois", 100);
  const r = E.sell("bois", 40);
  assert.ok(r.ok);
  assert.strictEqual(r.n, 40);
  assert.strictEqual(E.count("bois"), 60);
  assert.ok(E.state.ecus > 0);
  assert.strictEqual(E.state.ecus, r.ecus);
  assert.strictEqual(E.state.comptoir.sold.bois, 40);
});
test("vendre n d’un coup rapporte autant que n/2 puis n/2 (à 1e-6 près)", () => {
  const E1 = mk();
  const E2 = mk();
  E1.add("fibre", 500);
  E2.add("fibre", 500);
  const r1 = E1.sell("fibre", 500);
  const r2a = E2.sell("fibre", 250);
  const r2b = E2.sell("fibre", 250);
  assert.ok(Math.abs(r1.ecus - (r2a.ecus + r2b.ecus)) < 1e-6, "intégrale exacte");
  assert.ok(Math.abs(E1.state.ecus - E2.state.ecus) < 1e-6);
});
test("le prix unitaire baisse après une vente", () => {
  const E = mk();
  const p0 = E.unitPrice("caillou");
  E.add("caillou", 1000);
  E.sell("caillou", 1000);
  const p1 = E.unitPrice("caillou");
  assert.ok(p1 < p0, "le prix unitaire doit baisser avec la saturation");
  assert.strictEqual(p1, E.value("caillou") / (1 + 1000 / D.COMPTOIR.sat));
});
test("un outil, une station ou un objet unique ne se vend pas", () => {
  const E = mk();
  assert.strictEqual(E.sellable("epieu"), false);
  assert.strictEqual(E.sellable("feu"), false);
  assert.strictEqual(E.sellable("cabane"), false);
  assert.strictEqual(E.sellable("automate_bois"), false);
  assert.strictEqual(E.sellable("tablette"), false);
  assert.strictEqual(E.sellable("boussole"), false);
  assert.ok(E.sellable("bois"), "matière");
  assert.ok(E.sellable("manche"), "pièce");
  E.add("epieu", 1);
  const r = E.sell("epieu", 1);
  assert.strictEqual(r.ok, false);
});
test("conversion des écus à la relève (et 0 écu → 0 Trace)", () => {
  const E = mk();
  const t0 = E.state.meta.traces;
  // 0 écu donne 0 Trace
  E.state.ecus = 0;
  assert.strictEqual(E.ecusToTraces(0), 0);
  E.newCycle();
  assert.strictEqual(E.state.meta.traces, t0);

  // Conversion à l’âge 0 : base = 100 écus
  const base0 = E.traceBasePrice(0);
  assert.strictEqual(base0, D.COMPTOIR.trace);
  E.state.ecus = 250;
  assert.strictEqual(E.ecusToTraces(250, 0), 2);
  E.newCycle();
  assert.strictEqual(E.state.meta.traces, t0 + 2);
  assert.strictEqual(E.state.ecus, 0);

  // Conversion à l’âge 2 : base = 100 * (1.8^2) = 324
  E.state.age = 2;
  const base2 = E.traceBasePrice(2);
  assert.ok(Math.abs(base2 - 100 * 1.8 * 1.8) < 1e-6);
  E.state.ecus = 650;
  assert.strictEqual(E.ecusToTraces(650, 2), 2);
  E.newCycle();
  assert.strictEqual(E.state.meta.traces, t0 + 2 + 2);
  assert.strictEqual(E.state.ecus, 0);
});
test("après newCycle() : 0 écu, comptoir vide, Traces converties toujours là", () => {
  const E = mk();
  E.state.ecus = 5000;
  E.add("bois", 100);
  E.sell("bois", 50);
  assert.strictEqual(E.state.comptoir.sold.bois, 50);
  E.state.pass.plaine = { paid: {}, done: true };
  const expectedGain = E.releveGain(); // 2 traces pour la plaine
  const expectedEcusTr = E.ecusToTraces(E.state.ecus, E.state.age); // 50 traces
  E.newCycle();
  assert.strictEqual(E.state.ecus, 0);
  assert.deepStrictEqual(E.state.comptoir, { sold: {}, traces: 0, asks: [], next: 0 });
  assert.strictEqual(E.state.meta.traces, expectedGain + expectedEcusTr);
  assert.strictEqual(E.state.meta.tracesTotal, expectedGain + expectedEcusTr);
});
test("les demandes ne proposent que des objets connus et déjà fabriqués, d’un âge permis", () => {
  const E = mk();
  E.state.zones.plaine = true;
  E.state.age = 2; // âges permis : [2-1, 2] = [1, 2]

  // Objet âge 0 (manche) : connu et fabriqué, mais hors âge permis (< 1)
  E.state.known.manche = true;
  E.state.made.manche = 10;

  // Objet âge 1 (laniere) : connu mais pas fabriqué
  E.state.known.laniere = true;
  E.state.made.laniere = 0;

  // Objet âge 1 (tunique) : fabriqué mais pas connu
  E.state.known.tunique = false;
  E.state.made.tunique = 5;

  // Objet âge 1 unique (fronde) : connu et fabriqué mais unique
  E.state.known.fronde = true;
  E.state.made.fronde = 1;

  // Objet âge 2 permis : brique (connu et fabriqué)
  E.state.known.brique = true;
  E.state.made.brique = 10;

  // Objet âge 1 permis : colle_os (connu et fabriqué)
  E.state.known.colle_os = true;
  E.state.made.colle_os = 5;

  const elig = E.troqueurEligibleItems();
  assert.ok(elig.includes("brique"), "brique doit être éligible");
  assert.ok(elig.includes("colle_os"), "colle_os doit être éligible");
  assert.ok(!elig.includes("manche"), "manche âge 0 exclu quand joueur à l’âge 2");
  assert.ok(!elig.includes("laniere"), "laniere pas fabriquée");
  assert.ok(!elig.includes("tunique"), "tunique pas connue");
  assert.ok(!elig.includes("fronde"), "fronde unique");

  E.refreshTroqueur(true);
  const asks = E.state.comptoir.asks;
  assert.ok(asks.length > 0 && asks.length <= D.TROQUEUR.slots);
  asks.forEach((a) => {
    assert.ok(elig.includes(a.id));
    assert.ok(a.n > 0);
    assert.ok(a.tr >= 1);
  });
});
test("livrer retire de la Réserve et donne les Traces ; pas de livraison sans la quantité", () => {
  const E = mk();
  E.state.zones.plaine = true;
  E.state.age = 0;
  E.state.known.manche = true;
  E.state.made.manche = 10;
  E.refreshTroqueur(true);
  const ask = E.state.comptoir.asks[0];
  assert.ok(ask, "demande présente");

  // Pas assez en réserve
  const fail = E.deliverAsk(0);
  assert.strictEqual(fail.ok, false);
  assert.strictEqual(fail.why, "missing");

  // Presque assez
  E.add(ask.id, ask.n - 1);
  assert.strictEqual(E.deliverAsk(0).ok, false);

  // Quantité complète
  E.add(ask.id, 1);
  const trBefore = E.state.meta.traces;
  const r = E.deliverAsk(0);
  assert.ok(r.ok);
  assert.strictEqual(E.count(ask.id), 0, "objets retirés de la Réserve");
  assert.strictEqual(E.state.meta.traces, trBefore + ask.tr, "Traces accordées");
  assert.strictEqual(E.state.comptoir.asks[0], null, "place vide après livraison");

  // Deuxième livraison impossible sur le même slot
  const fail2 = E.deliverAsk(0);
  assert.strictEqual(fail2.ok, false);
  assert.strictEqual(fail2.why, "empty");
});
test("sauvegarde sans ecus ou corrompue : se charge nettoyée", () => {
  const E = mk();
  const raw = E.serialize();
  const o = JSON.parse(raw);
  delete o.ecus;
  delete o.comptoir;
  const F = mk();
  F.load(JSON.stringify(o));
  assert.strictEqual(F.state.ecus, 0);
  assert.deepStrictEqual(F.state.comptoir, { sold: {}, traces: 0, asks: [], next: 0 });

  const o2 = JSON.parse(raw);
  o2.ecus = "abc";
  o2.comptoir = 42;
  F.load(JSON.stringify(o2));
  assert.strictEqual(F.state.ecus, 0);
  assert.deepStrictEqual(F.state.comptoir, { sold: {}, traces: 0, asks: [], next: 0 });

  // Sauvegarde avec comptoir illisible / asks corrompus
  const o3 = JSON.parse(raw);
  o3.comptoir = {
    sold: "corrompu",
    traces: -10,
    asks: "pas un tableau",
    next: "demain"
  };
  F.load(JSON.stringify(o3));
  assert.deepStrictEqual(F.state.comptoir.asks, []);
  assert.strictEqual(F.state.comptoir.next, 0);
  assert.strictEqual(F.state.comptoir.traces, 0);
  assert.deepStrictEqual(F.state.comptoir.sold, {});

  // Tableau avec entrées invalides
  o3.comptoir.asks = [
    { id: "item_inexistant", n: 10, tr: 2 },
    { id: "bois", n: -5, tr: 2 },
    null
  ];
  F.load(JSON.stringify(o3));
  assert.deepStrictEqual(F.state.comptoir.asks, [null, null, null]);
});
test("sérialiser puis recharger garde écus et quantités vendues", () => {
  const E = mk();
  E.state.ecus = 123.45;
  E.state.comptoir = { sold: { bois: 250, fibre: 80 }, traces: 2 };
  const F = mk();
  F.load(E.serialize());
  assert.strictEqual(F.state.ecus, 123.45);
  assert.strictEqual(F.state.comptoir.traces, 2);
  assert.strictEqual(F.state.comptoir.sold.bois, 250);
  assert.strictEqual(F.state.comptoir.sold.fibre, 80);
});
test("acheter une matière : seulement en terre ouverte, coût 3x valeur sans saturation", () => {
  const E = mk();
  assert.ok(E.canBuyRes("bois"), "Lisière est ouverte au départ");
  assert.strictEqual(E.canBuyRes("os"), false, "Plaine n’est pas ouverte");
  const cost = E.buyResCost("bois", 100);
  assert.strictEqual(cost, 100 * D.COMPTOIR.buy * E.value("bois"));
  assert.strictEqual(cost, 100 * 3 * 0.1);
  const fail = E.buyRes("bois", 100);
  assert.strictEqual(fail.ok, false);
  assert.strictEqual(fail.why, "ecus");
  E.state.ecus = 50;
  const r = E.buyRes("bois", 100);
  assert.ok(r.ok);
  assert.strictEqual(E.count("bois"), 100);
  assert.strictEqual(E.state.ecus, 20);
  const rOs = E.buyRes("os", 10);
  assert.strictEqual(rOs.ok, false);
  assert.strictEqual(rOs.why, "unavailable");
  E.state.zones.plaine = true;
  assert.ok(E.canBuyRes("os"));
  const rOsOk = E.buyRes("os", 10);
  assert.ok(rOsOk.ok);
  assert.strictEqual(E.count("os"), 10);
});

console.log("Machines à paliers");
test("machines : machCan vérifie le nombre d’ingrédients selon le palier", () => {
  const E = mk();
  assert.ok(E.machCan("automate_bois", "manche"), "manche : 1 ingrédient");
  assert.ok(!E.machCan("automate_bois", "lingot_bronze"), "lingot de bronze : 2 ingrédients (cuivre + étain)");
  assert.ok(E.machCan("automate_bronze", "lingot_bronze"));
  assert.ok(E.machCan("presse_vapeur", "moteur_vapeur"), "moteur à vapeur : 3 ingrédients");
  assert.ok(!E.machCan("automate_bronze", "moteur_vapeur"));
  assert.strictEqual(E.machFor("manche"), "automate_bois");
  assert.strictEqual(E.machFor("lingot_bronze"), "automate_bronze");
  assert.strictEqual(E.machFor("moteur_vapeur"), "presse_vapeur");
});
test("machines et commandes : un automate choisit une étape compatible avec son palier", () => {
  const E = mk();
  ["manche", "corde", "archet"].forEach((k) => { E.state.known[k] = true; E.state.made[k] = 1; });
  E.add("automate_bois", 1); // ing: 1
  E.add("manche", 10); E.add("corde", 20);
  E.order("archet", 5); // archet : 2 ingrédients
  assert.strictEqual(E.machines().automate_bois.used, 0, "l’automate de bois ne peut pas faire un archet (2 ingrédients)");
  E.add("automate_bronze", 1); // ing: 2
  assert.strictEqual(E.machines().automate_bronze.used, 1, "l’automate de bronze prend l’archet");
  assert.strictEqual(E.machines().automate_bronze.byRec.archet, 1);
});
test("machines : une sauvegarde avec des groupes de machines les dissout et rend leurs matières à la Réserve", () => {
  const E = mk();
  E.add("automate_bois", 1);
  E.state.known.archet = true;
  E.state.dom.mach.push({ id: "M1", m: "automate_bois", r: "archet", n: 1, on: true, cap: 0 });
  E.state.dom.ms["M1"] = { p: 0.5, b: { manche: 2, corde: 3 } };
  const txt = E.serialize();
  const F = mk();
  F.load(txt);
  assert.deepStrictEqual(F.state.dom.mach, [], "groupes retirés");
  assert.deepStrictEqual(F.state.dom.ms, {}, "buffers de machines vidés");
  assert.strictEqual(F.count("manche"), 2, "manches revenus à la Réserve");
  assert.strictEqual(F.count("corde"), 3, "cordes revenues à la Réserve");
  assert.strictEqual(F.count("automate_bois"), 1, "machine toujours possédée");
  assert.strictEqual(F.freeMach("automate_bois"), 1, "machine au repos");
  assert.ok(F.state.flags.mach57);
});
test("commandes : une recette jamais fabriquée se fait d’abord à la main (et avec firstByHand: false, la machine peut)", () => {
  const E = mk();
  E.state.known.manche = true; // mais made.manche vaut 0
  E.add("automate_bois", 1);
  E.add("bois", 30);
  E.order("manche", 5);
  assert.strictEqual(E.machines().automate_bois.used, 0, "jamais fait à la main : l’automate attend");
  // Avec firstByHand: false, la machine peut tout de suite
  D.COMMANDES.firstByHand = false;
  try {
    assert.strictEqual(E.machines().automate_bois.used, 1, "avec firstByHand: false, l’automate travaille tout de suite");
  } finally {
    D.COMMANDES.firstByHand = true;
  }
  // Dès que les mains ont fait le premier exemplaire, l’automate rejoint la commande
  E.step(E.handTime("manche") + 0.05);
  assert.ok(E.state.made.manche >= 1, "le premier manche est fait à la main");
  assert.strictEqual(E.machines().automate_bois.used, 1, "l’automate aide sur les suivants");
  run(E, 60);
  assert.strictEqual(E.count("manche"), 5);
});
test("commandes : E.order ajoute les sous-pièces manquantes et les machines aident sur chaque étape", () => {
  const E = mk();
  ["manche", "corde", "archet"].forEach((k) => { E.state.known[k] = true; E.state.made[k] = 1; });
  E.add("automate_bois", 1); // ing: 1 -> peut faire manche et corde
  E.add("bois", 30); E.add("fibre", 60);
  assert.strictEqual(E.count("manche"), 0);
  const r = E.order("archet", 5);
  assert.ok(r.ok);
  assert.strictEqual(E.machines().automate_bois.used, 1, "l’automate de bois aide sur les sous-pièces à 1 ingrédient");
  run(E, 180);
  assert.strictEqual(E.count("archet"), 5, "a fabriqué les 5 archets à partir du bois et des fibres");
  assert.strictEqual(E.count("manche"), 0, "les manches intermédiaires ont servi aux archets");
});

test("commandes : le charbon se commande (il se récolte aussi) ; un extracteur ne se commande pas à crédit", () => {
  const E = mk();
  E.add("feu", 1); E.add("four", 1); E.state.zones.mine = true; E.recalc(); E.state.known.charbon = true; E.add("bois", 40);
  const r = E.order("charbon", 5);
  assert.ok(r.ok, "commande acceptée : " + r.why);
  assert.deepStrictEqual(r.job.s, [["charbon", 5]], "une vraie étape, pas une commande vide");
  E.state.known.cabane = true; E.state.inv.bois = 0;
  assert.strictEqual(E.order("cabane", 10).why, "plan", "le prix monte à chaque cabane : il faut tout avoir");
});

test("commandes : des machines rapides finissent plusieurs pièces d’un pas, sans y passer des secondes", () => {
  const E = mk();
  E.state.known.manche = true; E.state.made.manche = 1;
  E.add("automate_bois", 200); E.add("bois", 3e6);
  assert.ok(E.order("manche", 1e6).ok);
  const t0 = Date.now();
  run(E, 60);
  assert.ok(Date.now() - t0 < 700, "une minute de jeu calculée en " + (Date.now() - t0) + " ms");
  assert.ok(E.count("manche") > 1000, "les manches sortent : " + E.count("manche"));
});



console.log("Coup de chance");
test("récolte à la main : coup de chance ×2, plus fréquent avec « Coup d’œil »", () => {
  let r = 0.99;
  const E = createEngine({ now: () => T, rand: () => r });
  const n = E.tap("bois", "lisiere");
  assert.ok(!E.lastCrit, "pas de chance à 0,99");
  r = 0.05;
  const before = E.count("bois"), m = E.tap("bois", "lisiere");
  assert.ok(E.lastCrit, "6 % : 0,05 est un coup de chance");
  assert.strictEqual(m, n * D.CRIT.mult);
  assert.strictEqual(E.count("bois") - before, m);
  r = 0.08;
  E.tap("bois", "lisiere");
  assert.ok(!E.lastCrit, "0,08 dépasse les 6 % de départ");
  E.state.meta.mem.oeil = 1;
  E.tap("bois", "lisiere");
  assert.ok(E.lastCrit, "avec un niveau de Coup d’œil, 10 %");
  assert.strictEqual(E.state.stats.crits, 2);
});

console.log("Mains sûres");
test("Âge de la Vapeur : inséré entre l’Acier et l’Électricité, ses objets et ses étapes", () => {
  const ids = D.AGES.map((a) => a.id);
  assert.deepStrictEqual(ids.slice(5, 9), ["fer", "acier", "vapeur", "elec"]);
  assert.strictEqual(D.AGES.length, 15);
  assert.strictEqual(D.SITE_RATE.length, 15, "une vitesse de chantier par âge");
  const par = {}; Object.values(D.ITEMS).forEach((x) => (par[x.a] = (par[x.a] || 0) + 1));
  assert.ok(par[6] >= 10 && par[6] <= 18 && par[7] >= 10 && par[7] <= 28, "l’Acier garde sa chaîne et la Vapeur ajoute celle de l’eau : " + par[6] + " / " + par[7]);
  ["moteur_vapeur", "chaudiere", "piston", "presse_vapeur", "pompe", "locomotive", "scierie", "regulateur", "marteau_pilon", "chaudiere_tubulaire"].forEach((i) => assert.strictEqual(D.ITEMS[i].a, 7, i));
  ["haut_fourneau", "lingot_acier", "acier_trempe", "tour", "outils_acier", "engrenage_acier"].forEach((i) => assert.strictEqual(D.ITEMS[i].a, 6, i));
  assert.strictEqual(D.ITEMS.dynamo.a, 8, "l’Électricité est avancée d’un rang");
  assert.strictEqual(D.ITEMS.ordinateur.a, 10, "le Silicium est avancé de deux rangs (Vapeur, Atome)");
  // les étapes : chaque âge en a, la Vapeur aussi
  const E = createEngine();
  const m = E.milestones();
  assert.ok(m[6].length >= 3 && m[7].length >= 3 && m[8].length >= 3, "des étapes pour l’Acier, la Vapeur et l’Électricité");
  assert.ok(m[7].some((x) => x.ob.id === "moteur_vapeur") && m[7].some((x) => x.ob.id === "regulateur"));
  // rien n’est avant ses ingrédients : chaque pièce de la Vapeur ne demande que des objets d’âge égal ou antérieur
  Object.keys(D.ITEMS).filter((i) => D.ITEMS[i].a === 7 && D.ITEMS[i].r).forEach((i) => { for (const g in D.ITEMS[i].r[1]) assert.ok(D.ITEMS[g].a <= 7, i + " demande " + g); });
  // avancer d’un âge : l’Acier accompli et un objet de la Vapeur fabriqué
  const F = createEngine();
  F.state.age = 6;
  F.milestones()[6].forEach((x) => { if (x.ob.k === "craft") F.state.made[x.ob.id] = 1; });
  F.state.made.moteur_vapeur = 1;
  F.avancerAge();
  assert.strictEqual(F.state.age, 7, "l’âge de la Vapeur s’ouvre après l’Acier");
});
test("sauvegarde v8 : les âges après l’Acier avancent d’un rang, la Vapeur est marquée accomplie sans récompense", () => {
  const E = createEngine();
  const o = JSON.parse(E.serialize());
  o.v = 8; o.age = 8; o.flags.ages = { 0: 1, 6: 1, 7: 1 }; o.intu = 12;
  o.meta.stamps = { "m:dynamo": [1, 1, 7], "m:manche": [1, 1, 0] };
  const F = createEngine();
  F.load(JSON.stringify(o));
  assert.strictEqual(F.state.v, SAVE_VERSION);
  assert.strictEqual(F.state.age, 10, "le Silicium est maintenant le 11e âge (Vapeur, puis Atome)");
  assert.ok(F.state.flags.ages[8] && F.state.flags.ages[7] && F.state.flags.ages[6] && F.state.flags.ages[9], "Électricité, Vapeur, Acier et Atome sont accomplis");
  assert.ok(!F.state.flags.ages[10], "rien n’est accompli en trop");
  assert.deepStrictEqual([F.state.meta.stamps["m:dynamo"][2], F.state.meta.stamps["m:manche"][2]], [8, 0], "la dynamo (Électricité) ne bouge pas, le reste avance");
  assert.strictEqual(F.state.intu, 12, "aucune récompense d’âge");
  // une partie à l’Acier ou avant garde son âge
  const G = createEngine(); const p = JSON.parse(G.serialize()); p.v = 8; p.age = 6;
  const H = createEngine(); H.load(JSON.stringify(p));
  assert.strictEqual(H.state.age, 6);
});

test("Âge de l’Atome : entre l’Électricité et le Silicium, uranium et plomb par extracteur seulement", () => {
  const ids = D.AGES.map((a) => a.id);
  assert.deepStrictEqual(ids.slice(7, 12), ["vapeur", "elec", "atome", "silicium", "polymeres"]);
  ["uranium", "galene", "lingot_plomb", "plaque_plomb", "pastille_uranium", "graphite", "barre_combustible", "compteur_geiger", "centrale_fission", "uranium_1", "galene_1"].forEach((i) => assert.strictEqual(D.ITEMS[i].a, 9, i));
  assert.strictEqual(D.ITEMS.silicium.a, 10);
  // l’uranium et la galène ne se récoltent pas à la main : aucune terre ne les donne seules
  const E = createEngine();
  D.ZONES.forEach((z) => { assert.ok(!z.res.includes("uranium") && !z.res.includes("galene"), z.id); });
  assert.strictEqual(E.RES_ZONE.uranium, "gisement", "sa terre est celle de son extracteur : le Gisement Noir");
  assert.strictEqual(E.RES_ZONE.galene, "gisement");
  assert.deepStrictEqual(E.extFor("uranium", "gisement"), ["uranium_1", "uranium_2"]);
  E.state.zones.gisement = true;
  assert.strictEqual(E.deposits().find((d) => d.res === "uranium").hand, false, "un gisement qui ne se récolte pas à la main");
  // le guide mène à l’extracteur d’abord : pas de galène sans sa mine
  Object.keys(D.ITEMS).forEach((i) => { if (D.ITEMS[i].r && !D.ITEMS[i].sec && !D.ITEMS[i].path) E.learn(i, true); });
  ["collines", "mine", "desert", "gisement"].forEach((z) => (E.state.zones[z] = true));
  stations(E, Object.keys(D.ITEMS).filter((i) => D.ITEMS[i].t === "stat" && !D.ITEMS[i].sec));
  E.state.age = 9;
  const s = E.nextStep("galene");
  assert.strictEqual(s.id, "galene_1", JSON.stringify(s));
  // des étapes pour l’âge, dans l’ordre
  const m = E.milestones()[9];
  assert.deepStrictEqual(m.filter((x) => x.ob.k === "craft").map((x) => x.ob.id), ["uranium_1", "galene_1", "lingot_plomb", "barre_combustible", "centrale_fission"]);
  // des ingrédients d’âge égal ou antérieur
  Object.keys(D.ITEMS).filter((i) => D.ITEMS[i].a === 9 && D.ITEMS[i].r).forEach((i) => { for (const g in D.ITEMS[i].r[1]) assert.ok(D.ITEMS[g].a <= 9, i + " demande " + g); });
  // l’extracteur d’uranium récolte une fois posé
  const F = mk();
  F.state.age = 9; F.state.zones.gisement = true; F.learn("uranium_1", true);
  F.add("uranium_1", 2);
  assert.ok(F.domExtSet("gisement", "uranium", "uranium_1", 2), "il se pose sur le gisement d’uranium");
  run(F, 30);
  assert.ok(F.count("uranium") > 10, "il récolte : " + F.count("uranium"));
});
test("sauvegarde v9 : l’Atome s’insère, les âges d’après avancent d’un rang", () => {
  const E = createEngine();
  const o = JSON.parse(E.serialize());
  o.v = 9; o.age = 9; o.flags.ages = { 0: 1, 8: 1 }; o.intu = 7;
  const F = createEngine(); F.load(JSON.stringify(o));
  assert.strictEqual(F.state.age, 10, "le Silicium passe de 9 à 10");
  assert.ok(F.state.flags.ages[8] && F.state.flags.ages[9] && !F.state.flags.ages[10], "l’Atome est marqué accompli, pas le Silicium");
  assert.strictEqual(F.state.intu, 7);
  const G = createEngine(); const p = JSON.parse(G.serialize()); p.v = 9; p.age = 8;
  const H = createEngine(); H.load(JSON.stringify(p));
  assert.strictEqual(H.state.age, 8, "l’Électricité ne bouge pas");
});

test("Les Traces ne se dépensent qu’au réveil d’un nouveau Semeur", () => {
  const E = createEngine();
  E.state.meta.traces = 500;
  assert.ok(!E.achatsOuverts(), "en cours de partie : fermé");
  assert.ok(!E.memBuy("recolte") && !E.transBuy("trans_main") && !E.buyEndingHint("retour"), "rien ne s’achète");
  assert.strictEqual(E.state.meta.traces, 500, "aucune Trace perdue");
  E.newCycle();
  assert.ok(E.achatsOuverts(), "la relève ouvre les achats");
  assert.ok(E.memBuy("recolte"), "au réveil : on peut acheter");
  E.fermerAchats();
  assert.ok(!E.achatsOuverts() && !E.memBuy("oeil"), "fermé quand on quitte la Mémoire");
});

test("Mains sûres : durée ×0,8 par niveau, et une chance de pièce en plus pour ce que les mains fabriquent", () => {
  const faire = (lvl, rand) => {
    const E = createEngine({ now: () => T, rand });
    E.learn("corde", true); E.state.meta.mem = { mains: lvl }; E.recalc();
    E.state.inv.fibre = 1e5; E.state.inv.bois = 1e5; E.state.inv.caillou = 1e5;
    return { E, r: E.craft("corde", 10) };
  };
  const base = faire(0, () => 0.05), n1 = faire(1, () => 0.05), n1sans = faire(1, () => 0.5);
  assert.strictEqual(base.r.n, 10, "niveau 0 : aucune pièce en plus");
  assert.strictEqual(n1.r.n, 20, "niveau 1, chance de 10 % : un tirage de 5 % donne une pièce en plus à chaque fabrication");
  assert.strictEqual(n1sans.r.n, 10, "un tirage de 50 % n’en donne pas à 10 %");
  assert.strictEqual(n1.E.memV("mains"), 0.8, "la durée passe à ×0,8");
  assert.strictEqual(D.MEMOIRE.find((m) => m.id === "mains").bonus(3), 0.3, "10 % par niveau");
  assert.ok(D.MEMOIRE.find((m) => m.id === "mains").bonus(20) <= 0.9, "plafonné");
});

console.log("Premier parcours et ruines");
test("le guide mène à la torche : un lieu du passage demande un objet dont la recette est inconnue", () => {
  const E = mk();
  for (const id of ["manche", "corde", "archet", "feu", "cabane", "epieu"]) E.learn(id, true);
  for (const id of ["manche", "corde", "archet", "feu", "cabane", "epieu"]) E.state.made[id] = 1;
  E.state.inv.feu = 1; E.recalc(); // le feu de camp est là : l’action Chauffer est possible
  E.state.flags.extDone = true;
  E.state.pass.plaine = { paid: {}, done: false };
  E.state.exp.done = { lisiere: 1 }; // la grotte reste à explorer : elle demande une torche
  const g = E.guide();
  assert.strictEqual(g.ob.k, "pass", "l’objectif est le passage vers la Plaine");
  assert.strictEqual(g.pour, "torche", "pour explorer la grotte");
  assert.strictEqual(g.step, "charbon", "la torche se fait avec du charbon, dont la recette reste à trouver");
  assert.ok(!E.state.known[g.step]);
});
test("une partie neuve a meta.parcours ; une sauvegarde chargée sans ce drapeau ne l’a pas, et n’est jamais forcée", () => {
  const E1 = mk();
  assert.strictEqual(E1.state.meta.parcours, 1, "partie neuve a parcours");
  E1.state.flags.extDone = true;
  E1.state.exp.done = { lisiere: 1 };
  assert.ok(!E1.canForcedReleve(), "la cabane et la première exploration ne suffisent plus");
  E1.state.pass.plaine = { paid: {}, done: true };
  assert.ok(E1.canForcedReleve(), "peut faire la première renaissance forcée une fois la Plaine franchie");

  // Ancienne sauvegarde sans parcours
  const oldSave = JSON.stringify({
    v: 5, t: 1000, start: 1000,
    inv: { bois: 50 }, seen: {}, made: {}, known: {}, hints: {},
    cycle: 1, flags: { extDone: true }, exp: { done: { lisiere: 1 } },
    meta: { endings: {}, traces: 0, tracesTotal: 0 }
  });
  const E2 = mk();
  E2.load(oldSave);
  assert.strictEqual(E2.state.meta.parcours, undefined, "pas de drapeau parcours");
  assert.ok(!E2.canForcedReleve(), "jamais forcée");
});

test("forcedReleve() : cycle 2, cadeau de Traces reçu, Carnet gardé, ne se refait pas", () => {
  const E = mk();
  E.state.known.cabane = true;
  assert.strictEqual(E.state.cycle, 1);
  assert.strictEqual(E.state.meta.traces, 0);

  const res1 = E.forcedReleve();
  assert.strictEqual(res1, true, "forcedReleve a réussi");
  assert.strictEqual(E.state.cycle, 2, "maintenant au cycle 2");
  assert.strictEqual(E.state.meta.traces, D.PARCOURS.gift, "cadeau de 3 Traces reçu");
  assert.strictEqual(E.state.meta.tracesTotal, D.PARCOURS.gift, "tracesTotal augmenté");
  assert.ok(E.state.known.cabane, "Carnet gardé");
  assert.ok(!E.canForcedReleve(), "ne peut plus être forcé");

  const res2 = E.forcedReleve();
  assert.strictEqual(res2, false, "ne se refait pas");
  assert.strictEqual(E.state.cycle, 2);
  assert.strictEqual(E.state.meta.traces, D.PARCOURS.gift);
});

test("ruines : après une relève avec 5 cabanes et 1 automate, meta.ruins vaut { cabane: 3, automate_bois: 1 } ; réparer coûte bien part du prix, ajoute 1, pose la cabane, décrémente ; sans les matières, ok: false et missing", () => {
  const E = mk();
  E.add("cabane", 5);
  E.add("automate_bois", 1);
  assert.strictEqual(E.count("cabane"), 5);
  assert.strictEqual(E.count("automate_bois"), 1);

  E.newCycle();

  assert.deepStrictEqual(E.state.meta.ruins, { cabane: 3, automate_bois: 1 }, "plafond à 3 cabanes et 1 automate");
  assert.deepStrictEqual(E.ruins(), { cabane: 3, automate_bois: 1 });

  // Coût de réparation de la cabane : part (0.1) du coût de base { manche: 5, corde: 4, fibre: 15 }
  // manche: ceil(0.5) = 1, corde: ceil(0.4) = 1, fibre: ceil(1.5) = 2
  const expectedCost = { manche: 1, corde: 1, fibre: 2 };
  assert.deepStrictEqual(E.ruinCost("cabane"), expectedCost, "coût de réparation");

  // Sans matières : échec
  const fail = E.repair("cabane");
  assert.strictEqual(fail.ok, false);
  assert.strictEqual(fail.why, "missing");
  assert.deepStrictEqual(fail.missing, expectedCost);

  // Avec une partie des matières : échec
  E.add("manche", 1);
  const fail2 = E.repair("cabane");
  assert.strictEqual(fail2.ok, false);
  assert.deepStrictEqual(fail2.missing, { corde: 1, fibre: 2 });

  // Avec toutes les matières : succès
  E.add("corde", 1);
  E.add("fibre", 5);
  const ok = E.repair("cabane");
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(E.count("manche"), 0, "manche consommé");
  assert.strictEqual(E.count("corde"), 0, "corde consommée");
  assert.strictEqual(E.count("fibre"), 3, "2 fibres consommées sur 5");
  assert.strictEqual(E.count("cabane"), 1, "ajoute 1 à la Réserve");
  assert.strictEqual(E.state.meta.ruins.cabane, 2, "décrémente les ruines");

  // Posé tout de suite sur un gisement de sa terre
  const placed = Object.values(E.state.dom.ext).some((e) => e.z === "lisiere" && e.u && e.u.cabane >= 1);
  assert.ok(placed, "la cabane est posée tout de suite sur un gisement de sa terre");
});

test("une seconde relève remplace les ruines au lieu de les cumuler", () => {
  const E = mk();
  E.add("cabane", 2);
  E.newCycle();
  assert.deepStrictEqual(E.state.meta.ruins, { cabane: 2 });

  // Au cycle 2, on ne possède qu'un automate_bois, 0 cabanes
  E.add("automate_bois", 1);
  E.newCycle();
  assert.deepStrictEqual(E.state.meta.ruins, { automate_bois: 1 }, "remplace au lieu de cumuler");
});

test("sauvegarde avec meta.ruins illisible : se charge, nettoyée", () => {
  const E1 = mk();
  E1.load(JSON.stringify({
    v: 6, t: 1000, start: 1000,
    inv: { bois: 10 }, seen: {}, made: {}, known: {}, hints: {},
    meta: { ruins: "corrompu" }
  }));
  assert.deepStrictEqual(E1.state.meta.ruins, {}, "chaîne devient objet vide");

  const E2 = mk();
  E2.load(JSON.stringify({
    v: 6, t: 1000, start: 1000,
    inv: { bois: 10 }, seen: {}, made: {}, known: {}, hints: {},
    meta: { ruins: { cabane: "2", automate_bois: -5, truc_inconnu: 4, autre: "abc" } }
  }));
  assert.strictEqual(E2.state.meta.ruins.cabane, 2, "nombre entier positif gardé");
  assert.strictEqual(E2.state.meta.ruins.automate_bois, undefined, "négatif ignoré");
  assert.strictEqual(E2.state.meta.ruins.autre, undefined, "invalide ignoré");
  assert.strictEqual(E2.state.meta.ruins.truc_inconnu, undefined, "inconnu retiré des ruines");
  assert.strictEqual(E2.state.orphans.ruins.truc_inconnu, 4, "inconnu mis dans orphans");
});

console.log("Déchiffrer et secrets (5.8)");
test("déchiffrer : le prix suit la formule (âge, nombre de ressources, niveau)", () => {
  const E = mk();
  // manche : âge 0, 1 ressource -> 3, 8, 20
  assert.strictEqual(E.decipherCost("manche"), 3);
  E.state.hints.manche = 1;
  assert.strictEqual(E.decipherCost("manche"), 8);
  E.state.hints.manche = 2;
  assert.strictEqual(E.decipherCost("manche"), 20);
  // ordinateur : âge 10 (après la Vapeur et l’Atome), 3 ressources -> 99, 264, 660
  E.state.age = 10;
  assert.strictEqual(E.decipherCost("ordinateur"), 99);
  E.state.hints.ordinateur = 1;
  assert.strictEqual(E.decipherCost("ordinateur"), 264);
  E.state.hints.ordinateur = 2;
  assert.strictEqual(E.decipherCost("ordinateur"), 660);
});

test("déchiffrer : monte S.hints de 1, retire l’Intuition, et apprend la recette au niveau 3", () => {
  const E = mk();
  E.state.intu = 100;
  const events = [];
  E.on("guidehint", (h) => events.push(h));
  // cabane : âge 0, 3 ressources -> coûts 9, 24, 60 (total 93)
  const r1 = E.decipher("cabane");
  assert.deepStrictEqual(r1, { ok: true, lvl: 1 });
  assert.strictEqual(E.state.hints.cabane, 1);
  assert.strictEqual(E.state.intu, 91);
  assert.ok(!E.state.known.cabane);

  const r2 = E.decipher("cabane");
  assert.deepStrictEqual(r2, { ok: true, lvl: 2 });
  assert.strictEqual(E.state.hints.cabane, 2);
  assert.strictEqual(E.state.intu, 67);
  assert.ok(!E.state.known.cabane);

  const r3 = E.decipher("cabane");
  assert.deepStrictEqual(r3, { ok: true, lvl: 3 });
  assert.strictEqual(E.state.hints.cabane, 3);
  assert.strictEqual(E.state.intu, 7, "learn(id, true) ne redonne pas +1 ✨");
  assert.ok(E.state.known.cabane, "recette connue au niveau 3");
  assert.strictEqual(E.decipherCost("cabane"), null);
  assert.strictEqual(events.length, 3);
});

test("déchiffrer : refus (recette connue, sans recette, objet secret, pas assez d’Intuition, âge pas atteint)", () => {
  const E = mk();
  E.state.intu = 1000;
  assert.strictEqual(E.decipherCost("bois"), null);
  assert.strictEqual(E.decipher("bois").ok, false);

  E.state.known.manche = true;
  assert.strictEqual(E.decipherCost("manche"), null);
  assert.strictEqual(E.decipher("manche").why, "known");

  assert.strictEqual(E.decipherCost("galette"), null, "secret refusé");
  assert.strictEqual(E.decipher("galette").why, "secret");
  assert.strictEqual(E.decipherCost("diapason"), null, "recette de la Résonance refusée");
  assert.strictEqual(E.decipher("diapason").why, "secret");

  assert.strictEqual(E.decipherCost("ordinateur"), null, "âge pas atteint");
  assert.strictEqual(E.decipher("ordinateur").why, "age");

  E.state.intu = 2;
  assert.strictEqual(E.decipherCost("corde"), 3);
  assert.deepStrictEqual(E.decipher("corde"), { ok: false, why: "intu" });
});

test("déchiffrer : la sauvegarde garde le niveau (aller-retour serialize / load)", () => {
  const E1 = mk();
  E1.state.intu = 50;
  E1.decipher("cabane");
  E1.decipher("cabane");
  assert.strictEqual(E1.state.hints.cabane, 2);
  const raw = E1.serialize();
  const E2 = mk();
  E2.load(raw);
  assert.strictEqual(E2.state.hints.cabane, 2);
  assert.strictEqual(E2.decipherCost("cabane"), 60);
});

test("thermomètre : sec: true pour une tentative proche d’une recette secrète, et pas pour une recette normale", () => {
  const E = mk();
  E.add("feu", 1); E.add("fibre", 5); E.add("caillou", 5); E.recalc();
  // galette (sec: true) = chauffer : fibre. Avec chauffer : fibre + caillou -> chaud (trop), sec: true
  const tSec = E.temperature("chauffer", ["fibre", "caillou"]);
  assert.strictEqual(tSec.temp, 3);
  assert.strictEqual(tSec.sec, true);
  const aSec = E.attempt("chauffer", ["fibre", "caillou"]);
  assert.strictEqual(aSec.kind, "fail");
  assert.strictEqual(aSec.sec, true);

  // corde (normale) = tresser : fibre. Avec assembler : fibre -> chaud (geste), pas sec
  const tNorm = E.temperature("assembler", ["fibre"]);
  assert.strictEqual(tNorm.temp, 3);
  assert.ok(!tNorm.sec);
  const aNorm = E.attempt("assembler", ["fibre"]);
  assert.strictEqual(aNorm.kind, "fail");
  assert.strictEqual(aNorm.sec, false);
});

console.log("Le moteur du Récit, du Livre et des Questions (6.0)");

const mkRecit = (recit) => createEngine({ now: () => T, rand: () => 0.99, recit });

test("E.cond : chaque forme, une clé inconnue vaut faux", () => {
  const E = mk();
  assert.strictEqual(E.cond(null), true);
  assert.strictEqual(E.cond({}), true);
  assert.strictEqual(E.cond({ inconnue_totale: 1 }), false);

  // frag
  assert.strictEqual(E.cond({ frag: "t_f" }), false);
  E.state.frags.t_f = true;
  assert.strictEqual(E.cond({ frag: "t_f" }), true);

  // page
  assert.strictEqual(E.cond({ page: "p_x" }), false);
  E.state.livre.p.p_x = 1;
  assert.strictEqual(E.cond({ page: "p_x" }), true);

  // made
  assert.strictEqual(E.cond({ made: "corde" }), false);
  E.state.made.corde = 1;
  assert.strictEqual(E.cond({ made: "corde" }), true);

  // has
  assert.strictEqual(E.cond({ has: "bois" }), false);
  E.state.inv.bois = 5;
  assert.strictEqual(E.cond({ has: "bois" }), true);

  // flag
  assert.strictEqual(E.cond({ flag: "mon_flag" }), false);
  E.state.flags.mon_flag = true;
  assert.strictEqual(E.cond({ flag: "mon_flag" }), true);

  // secret
  assert.strictEqual(E.cond({ secret: "sec1" }), false);
  E.state.secrets.sec1 = true;
  assert.strictEqual(E.cond({ secret: "sec1" }), true);

  // cycle
  E.state.cycle = 2;
  assert.strictEqual(E.cond({ cycle: 1 }), true);
  assert.strictEqual(E.cond({ cycle: 2 }), true);
  assert.strictEqual(E.cond({ cycle: 3 }), false);

  // age
  E.state.age = 1;
  assert.strictEqual(E.cond({ age: 0 }), true);
  assert.strictEqual(E.cond({ age: 1 }), true);
  assert.strictEqual(E.cond({ age: 2 }), false);

  // exp
  assert.strictEqual(E.cond({ exp: "lisiere:chene" }), false);
  E.state.exp.done.lisiere = 1;
  assert.strictEqual(E.cond({ exp: "lisiere:chene" }), true);
  assert.strictEqual(E.cond({ exp: "lisiere:lieu_inexistant" }), false);
  assert.strictEqual(E.cond({ exp: "zone_inconnue:chene" }), false);

  // all, any, not
  assert.strictEqual(E.cond({ all: [{ cycle: 2 }, { age: 1 }] }), true);
  assert.strictEqual(E.cond({ all: [{ cycle: 2 }, { age: 9 }] }), false);
  assert.strictEqual(E.cond({ any: [{ cycle: 99 }, { age: 1 }] }), true);
  assert.strictEqual(E.cond({ any: [{ cycle: 99 }, { age: 99 }] }), false);
  assert.strictEqual(E.cond({ not: { cycle: 99 } }), true);
  assert.strictEqual(E.cond({ not: { cycle: 2 } }), false);
});

test("une page s’obtient par exploration, par première réparation (pas la deuxième), par achat au Comptoir (écus retirés, page sortie de la liste), par condition", () => {
  const recit = {
    pages: {
      p_exp: { n: 1, titre: "Page Exp", src: [{ k: "exp", at: "lisiere:chene" }] },
      p_rep: { n: 2, titre: "Page Rep", src: [{ k: "repair", id: "cabane" }] },
      p_buy: { n: 3, titre: "Page Buy", src: [{ k: "buy", ecus: 150 }] },
      p_cnd: { n: 4, titre: "Page Cnd", src: [{ k: "cond", c: { flag: "obtenue" } }] }
    }
  };
  const E = mkRecit(recit);

  // Exploration
  assert.ok(!E.hasPage("p_exp"));
  let pageEvt = null;
  E.on("page", (p) => (pageEvt = p));
  E.startExp("lisiere");
  T += E.ZONES.lisiere.exps[0].dur * 1000 + 1000;
  E.update();
  assert.ok(E.hasPage("p_exp"));
  assert.strictEqual(pageEvt.id, "p_exp");
  assert.strictEqual(pageEvt.src, "exp");

  // Première réparation
  assert.ok(!E.hasPage("p_rep"));
  E.state.meta.ruins = { cabane: 2 };
  E.state.inv = { manche: 10, corde: 10, fibre: 10 }; // de quoi réparer cabane
  const rep1 = E.repair("cabane");
  assert.ok(rep1.ok);
  assert.ok(E.hasPage("p_rep"));
  assert.strictEqual(pageEvt.id, "p_rep");
  assert.strictEqual(pageEvt.src, "repair");

  // Seconde réparation : ne redonne pas la page
  pageEvt = null;
  E.state.inv = { manche: 10, corde: 10, fibre: 10 };
  const rep2 = E.repair("cabane");
  assert.ok(rep2.ok);
  assert.strictEqual(pageEvt, null);

  // Achat au Comptoir
  const buyable = E.buyablePages();
  assert.strictEqual(buyable.length, 1);
  assert.strictEqual(buyable[0].id, "p_buy");
  assert.strictEqual(buyable[0].ecus, 150);

  E.state.ecus = 50;
  assert.strictEqual(E.buyPage("p_buy").ok, false);
  E.state.ecus = 200;
  const buyRes = E.buyPage("p_buy");
  assert.ok(buyRes.ok);
  assert.strictEqual(E.state.ecus, 50);
  assert.ok(E.hasPage("p_buy"));
  assert.strictEqual(E.buyablePages().length, 0);

  // Condition
  assert.ok(!E.hasPage("p_cnd"));
  E.state.flags.obtenue = true;
  T += 1000;
  E.update();
  assert.ok(E.hasPage("p_cnd"));
});

test("notes : une note conditionnelle apparaît quand sa condition devient vraie, et la page a « du nouveau » jusqu’à E.readPage", () => {
  const recit = {
    pages: {
      p_notes: {
        n: 5,
        titre: "Page avec notes",
        imprime: "Texte imprimé",
        notes: [
          { t: "Note 1 de base" },
          { t: "Note 2 au cycle 2", cond: { cycle: 2 } }
        ]
      }
    }
  };
  const E = mkRecit(recit);
  E.givePage("p_notes", "test");

  let c = E.livre()[4];
  assert.strictEqual(c.notes.length, 1);
  assert.strictEqual(c.nouveau, true);

  E.readPage("p_notes");
  c = E.livre()[4];
  assert.strictEqual(c.nouveau, false);

  // La condition devient vraie au cycle 2
  E.state.cycle = 2;
  c = E.livre()[4];
  assert.strictEqual(c.notes.length, 2);
  assert.strictEqual(c.nouveau, true);

  E.readPage("p_notes");
  c = E.livre()[4];
  assert.strictEqual(c.nouveau, false);
});

test("pages, revisites et questions survivent à newCycle et à un aller-retour de sauvegarde", () => {
  const recit = {
    pages: { p1: { n: 1, titre: "P1" } },
    questions: { q1: { titre: "Q1", aides: ["A1"] } }
  };
  const E1 = mkRecit(recit);
  E1.givePage("p1", "test");
  E1.readPage("p1");
  E1.state.revus["frag1:0"] = 1;
  E1.state.questions.q1 = { lvl: 1 };

  E1.newCycle();
  assert.ok(E1.hasPage("p1"));
  assert.strictEqual(E1.state.revus["frag1:0"], 1);
  assert.strictEqual(E1.state.questions.q1.lvl, 1);

  const raw = E1.serialize();
  const E2 = mkRecit(recit);
  E2.load(raw);
  assert.ok(E2.hasPage("p1"));
  assert.strictEqual(E2.state.revus["frag1:0"], 1);
  assert.strictEqual(E2.state.questions.q1.lvl, 1);
});

test("un fragment archivé n’est plus listé ni compté, mais reste dans la sauvegarde", () => {
  const recit = {
    frags: {
      frag_arch: { n: "Archivé", t: "Ancien lore" },
      frag_act: { n: "Actif", t: "Lore actuel" }
    },
    archive: ["frag_arch"]
  };
  const E = mkRecit(recit);
  const vis = E.visibleFrags();
  assert.ok(!vis.includes("frag_arch"));
  assert.ok(vis.includes("frag_act"));

  E.addFrag("frag_arch");
  assert.ok(E.state.frags.frag_arch);

  const raw = E.serialize();
  const E2 = mkRecit(recit);
  E2.load(raw);
  assert.ok(E2.state.frags.frag_arch);
  assert.ok(!E2.visibleFrags().includes("frag_arch"));
});

test("expFrag remplace le fragment donné ; une revisite s’affiche quand le fragment est connu", () => {
  const recit = {
    expFrag: { "lisiere:chene": "frag_remplace" },
    frags: {
      frag_remplace: {
        n: "Remplacé",
        t: "Lore",
        revisit: [
          { cond: { cycle: 1 }, t: "Revisite 1" },
          { cond: { cycle: 2 }, t: "Revisite 2" }
        ]
      }
    }
  };
  const E = mkRecit(recit);
  let lastExp = null;
  E.on("expdone", (r) => (lastExp = r));

  // Première exploration : donne le fragment remplacé
  E.startExp("lisiere");
  T += E.ZONES.lisiere.exps[0].dur * 1000 + 1000;
  E.update();
  assert.strictEqual(lastExp.frag, "frag_remplace");
  assert.strictEqual(lastExp.fragNew, true);
  assert.strictEqual(lastExp.revisit, null);
  assert.ok(E.state.frags.frag_remplace);

  // Deuxième exploration alors que le fragment est déjà connu : revisite
  E.state.exp.active = { z: "lisiere", i: 0, t0: T, dur: 1000 };
  T += 1000;
  E.update();
  assert.strictEqual(lastExp.frag, "frag_remplace");
  assert.strictEqual(lastExp.fragNew, false);
  assert.ok(lastExp.revisit);
  assert.strictEqual(lastExp.revisit.t, "Revisite 1");
  assert.strictEqual(E.state.revus["frag_remplace:0"], 1);
});

test("questions : apparition, prix (5 × (1 + âge), ×3, ×9), refus sans Intuition, résolution", () => {
  const recit = {
    questions: {
      q_test: {
        titre: "Une grande énigme",
        quand: { cycle: 2 },
        aides: ["Aide 1", "Aide 2", "Aide 3"],
        resolu: { flag: "resolu_flag" }
      }
    },
    aide: { base: 5, mult: 3 }
  };
  const E = mkRecit(recit);

  // Apparition
  assert.strictEqual(E.questions().length, 0);
  E.state.cycle = 2;
  let qs = E.questions();
  assert.strictEqual(qs.length, 1);
  assert.strictEqual(qs[0].id, "q_test");
  assert.strictEqual(qs[0].resolu, false);

  // Prix selon l’âge
  assert.strictEqual(E.questionCost("q_test"), 5); // age 0: 5 * (1 + 0) * 1 = 5
  E.state.age = 1;
  assert.strictEqual(E.questionCost("q_test"), 10); // age 1: 5 * (1 + 1) * 1 = 10
  E.state.age = 0;

  // Refus sans Intuition
  E.state.intu = 2;
  const fail = E.askHelp("q_test");
  assert.strictEqual(fail.ok, false);
  assert.strictEqual(fail.why, "intu");

  // Achats successifs : x1 (5), x3 (15), x9 (45)
  E.state.intu = 100;
  const h1 = E.askHelp("q_test");
  assert.strictEqual(h1.ok, true);
  assert.strictEqual(h1.lvl, 1);
  assert.strictEqual(E.state.intu, 95);
  assert.strictEqual(E.questionCost("q_test"), 15);

  const h2 = E.askHelp("q_test");
  assert.strictEqual(h2.ok, true);
  assert.strictEqual(h2.lvl, 2);
  assert.strictEqual(E.state.intu, 80);
  assert.strictEqual(E.questionCost("q_test"), 45);

  const h3 = E.askHelp("q_test");
  assert.strictEqual(h3.ok, true);
  assert.strictEqual(h3.lvl, 3);
  assert.strictEqual(E.state.intu, 35);
  assert.strictEqual(E.questionCost("q_test"), null);
  assert.strictEqual(E.askHelp("q_test").why, "max");

  // Résolution
  assert.strictEqual(E.questions()[0].resolu, false);
  E.state.flags.resolu_flag = true;
  qs = E.questions();
  assert.strictEqual(qs[0].resolu, true);
  assert.strictEqual(qs[0].aides.length, 3);
});

test("une sauvegarde avec livre: 'abc' ou questions: 42 se charge, nettoyée", () => {
  const E = mk();
  const s = JSON.parse(E.serialize());
  s.livre = "abc";
  s.questions = 42;
  s.revus = "corrompu";
  E.load(JSON.stringify(s));
  assert.deepStrictEqual(E.state.livre, { p: {}, vu: {} });
  assert.deepStrictEqual(E.state.questions, {});
  assert.deepStrictEqual(E.state.revus, {});
});

console.log("Moteur des signes (6.1)");
test("normalisation : accents, casse, articles, apostrophes, ponctuation, espaces", () => {
  const E = mk();
  assert.strictEqual(E.normSigne("Éveiller"), "eveiller");
  assert.strictEqual(E.normSigne("L’Arbre"), "arbre");
  assert.strictEqual(E.normSigne("l'arbre"), "arbre");
  assert.strictEqual(E.normSigne("  Un  Grand   Arbre ! "), "grand arbre");
  assert.strictEqual(E.normSigne("cœur"), "coeur");
  assert.strictEqual(E.normSigne("l'oiseau-mouche"), "oiseau mouche");
  assert.strictEqual(E.normSigne("la"), "la"); // un mot unique article n'est pas vidé
  assert.strictEqual(E.normSigne("de la terre"), "terre");
  assert.strictEqual(E.normSigne(""), "");
  assert.strictEqual(E.normSigne(null), "");
});

test("empreinte : FNV-1a 32 bits stable et cohérente", () => {
  const E = mk();
  assert.strictEqual(E.fnv1a32("a"), "e40c292c");
  assert.strictEqual(E.empreinte("a"), "e40c292c");
  // Empreinte identique après normalisation
  const h1 = E.empreinte("l'arbre");
  const h2 = E.empreinte("  L’Arbre ! ");
  const h3 = E.empreinte("arbre");
  assert.strictEqual(h1, h2);
  assert.strictEqual(h2, h3);
  assert.strictEqual(typeof h1, "string");
  assert.strictEqual(h1.length, 8);
});

test("signeSVG : dessin et mise en cache", () => {
  const svg1 = signeSVG([1, 5, 1]);
  assert.ok(svg1.includes("<svg"), "rend un svg");
  assert.ok(svg1.includes("viewBox=\"0 0 24 24\""));
  assert.ok(svg1.includes("stroke=\"currentColor\""));
  // Cache par h et taille
  const svg2 = signeSVG([1, 5, 1]);
  assert.strictEqual(svg1, svg2);
  const svg3 = signeSVG([1, 5, 1], 48);
  assert.ok(svg3.includes("width=\"48\""));
});

test("moteur des signes : bonne réponse, mauvaise, presque, condition, délai", () => {
  const fakeSignes = {
    arbre: {
      h: [1, 5, 1],
      mot: "arbre",
      ok: []
    },
    verrou: {
      h: [3, 1, 5],
      mot: "verrou",
      ok: [],
      cond: { flag: "cle" }
    }
  };
  const E0 = mk();
  fakeSignes.arbre.ok = [E0.empreinte("arbre")];
  fakeSignes.verrou.ok = [E0.empreinte("verrou")];

  let time = 10000;
  const E = createEngine({ now: () => time, recit: { signes: fakeSignes, signeDelai: 3 } });

  // Signe inconnu
  assert.strictEqual(E.essaiSigne("introuvable", "arbre").why, "nosign");

  // Condition non satisfaite
  assert.strictEqual(E.essaiSigne("verrou", "verrou").why, "cond");
  E.state.flags.cle = true;

  // Mauvaise réponse sans proximité
  time += 5000;
  const rBad = E.essaiSigne("arbre", "caillou");
  assert.strictEqual(rBad.ok, false);
  assert.strictEqual(rBad.proche, false);

  // Délai trop court (3 secondes)
  time += 1000; // seulement 1s passée
  const rTooFast = E.essaiSigne("arbre", "autre");
  assert.strictEqual(rTooFast.delai, true);
  assert.strictEqual(rTooFast.left, 2);

  // Essai « presque » : une lettre en trop dans la saisie (retirée pour correspondre)
  time += 3100;
  const rPresque1 = E.essaiSigne("arbre", "arbres");
  assert.strictEqual(rPresque1.ok, false);
  assert.strictEqual(rPresque1.proche, true);

  // Essai « presque » : une lettre manquante dans la saisie (ajoutée pour correspondre)
  time += 3100;
  const rPresque2 = E.essaiSigne("arbre", "arbr");
  assert.strictEqual(rPresque2.ok, false);
  assert.strictEqual(rPresque2.proche, true);

  // Essai « presque » : une lettre changée dans la saisie
  time += 3100;
  const rPresque3 = E.essaiSigne("arbre", "arpre");
  assert.strictEqual(rPresque3.ok, false);
  assert.strictEqual(rPresque3.proche, true);

  // Bonne réponse avec article et ponctuation
  let signeEmitted = null;
  E.on("signe", (ev) => { signeEmitted = ev; });
  time += 3100;
  const rOk = E.essaiSigne("arbre", "L’Arbre !");
  assert.strictEqual(rOk.ok, true);
  assert.strictEqual(rOk.mot, "arbre");
  assert.deepStrictEqual(signeEmitted, { id: "arbre", mot: "arbre" });
  assert.strictEqual(E.state.signes.arbre.lu, 1);
});

test("gardé à la relève et aller-retour de sauvegarde", () => {
  const fakeSignes = {
    arbre: { h: [1, 5, 1], mot: "arbre", ok: [] }
  };
  const E0 = mk();
  fakeSignes.arbre.ok = [E0.empreinte("arbre")];

  let time = 1000;
  const E = createEngine({ now: () => time, recit: { signes: fakeSignes } });
  E.seeSigne("arbre", "Page 1");
  E.seeSigne("arbre", "Page 2");
  time += 5000;
  const r = E.essaiSigne("arbre", "arbre");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(E.state.signes.arbre.lu, 1);
  assert.strictEqual(Object.keys(E.state.signes.arbre.vu).length, 2);

  // Relève
  E.newCycle();
  assert.ok(E.state.signes.arbre);
  assert.strictEqual(E.state.signes.arbre.lu, 1);
  assert.strictEqual(Object.keys(E.state.signes.arbre.vu).length, 2);

  // Sauvegarde
  const raw = E.serialize();
  const E2 = createEngine({ now: () => time, recit: { signes: fakeSignes } });
  E2.load(raw);
  assert.ok(E2.state.signes.arbre);
  assert.strictEqual(E2.state.signes.arbre.lu, 1);
  assert.strictEqual(Object.keys(E2.state.signes.arbre.vu).length, 2);
  assert.strictEqual(E2.hasSignes(), true);
  const seen = E2.seenSignes();
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].id, "arbre");
  assert.strictEqual(seen[0].lu, true);
  assert.strictEqual(seen[0].count, 2);
});

test("renderSigneToken rend dessin puis mot, jeton inconnu garde ◇", () => {
  const fakeSignes = {
    arbre: { h: [1, 5, 1], mot: "arbre", ok: [] }
  };
  const state = { signes: {} };
  const seeCalls = [];
  const seeSigne = (id, lieu) => {
    state.signes[id] = state.signes[id] || { vu: {} };
    if (lieu) state.signes[id].vu[lieu] = 1;
    seeCalls.push({ id, lieu });
  };

  // Signe inconnu
  const htmlUnk = renderSigneToken("inconnu", { recit: { signes: fakeSignes }, state, seeSigne });
  assert.strictEqual(htmlUnk, '<span class="signe" data-s="inconnu">◇</span>');

  // Signe connu non compris -> dessin SVG
  const htmlDessin = renderSigneToken("arbre", { recit: { signes: fakeSignes }, state, seeSigne, lieu: "Page 1" });
  assert.ok(htmlDessin.includes('<span class="signe" data-s="arbre">'));
  assert.ok(htmlDessin.includes('<svg class="signe-svg"'));
  assert.strictEqual(seeCalls.length, 1);
  assert.strictEqual(seeCalls[0].id, "arbre");
  assert.strictEqual(seeCalls[0].lieu, "Page 1");

  // Signe compris -> mot
  state.signes.arbre.lu = 1;
  const htmlLu = renderSigneToken("arbre", { recit: { signes: fakeSignes }, state, seeSigne, lieu: "Page 2" });
  assert.strictEqual(htmlLu, '<span class="signe lu" data-s="arbre">arbre</span>');
});

test("sauvegarde avec signes corrompu ou identifiant inconnu", () => {
  const fakeSignes = {
    arbre: { h: [1, 5, 1], mot: "arbre", ok: [] }
  };
  const E = createEngine({ recit: { signes: fakeSignes } });
  const s = JSON.parse(E.serialize());
  s.signes = "corrompu";
  E.load(JSON.stringify(s));
  assert.deepStrictEqual(E.state.signes, {});

  const s2 = JSON.parse(E.serialize());
  s2.signes = {
    arbre: { lu: 1, vu: { "Page 1": 1 }, essais: 2 },
    inconnu_xyz: { lu: 1, vu: { partout: 1 } }
  };
  E.load(JSON.stringify(s2));
  assert.strictEqual(E.state.signes.arbre.lu, 1);
  assert.strictEqual(E.state.signes.inconnu_xyz, undefined);
  assert.ok(E.state.orphans.signes.inconnu_xyz);
});

console.log("Moteur de la flûte et du ciel (6.2)");
test("reconnaissance de mélodies longues jusqu'à 32 notes et buffer glissant", () => {
  const longNotes = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 2, 3, 4];
  const recit = {
    melodies: {
      longAir: {
        n: "Un long air",
        notes: longNotes,
        t: "Un chant ancien qui s'étend sur bien des portées.",
        effets: [{ k: "flag", id: "longAirJoue" }]
      }
    }
  };
  const E = createEngine({ recit });
  for (let i = 0; i < 10; i++) E.playNote(1);
  let res = null;
  for (const n of longNotes) {
    res = E.playNote(n);
  }
  assert.ok(res, "le long air doit être reconnu");
  assert.strictEqual(res.id, "longAir");
  assert.strictEqual(res.fresh, true);
  assert.strictEqual(E.state.flags.longAirJoue, true);
  assert.strictEqual(E.state.secrets.longAir, true);
  assert.deepStrictEqual(E.state.notes, []);
});

test("mélodies conditionnelles et effets déclaratifs (sky, boost, intu, event)", () => {
  let skyAnimEvent = null;
  let customEventReceived = false;
  let time = 1000;
  const recit = {
    melodies: {
      etoileAir: {
        n: "L'Air de l'étoile",
        notes: [5, 4, 3, 2, 1],
        cond: { flag: "cielOuvert" },
        effets: [
          { k: "sky", anim: "filantes" },
          { k: "boost", what: "prod", mult: 1.5, dur: 60 },
          { k: "intu", n: 3 },
          { k: "event", name: "etoile_sonne" }
        ]
      }
    }
  };
  const E = createEngine({ now: () => time, recit });
  E.on("skyanim", (a) => { skyAnimEvent = a; });
  E.on("etoile_sonne", () => { customEventReceived = true; });

  for (const n of [5, 4, 3, 2, 1]) E.playNote(n);
  assert.strictEqual(E.state.secrets.etoileAir, undefined);
  assert.strictEqual(skyAnimEvent, null);

  E.state.flags.cielOuvert = true;
  const prevIntu = E.state.intu;
  for (const n of [5, 4, 3, 2, 1]) E.playNote(n);
  assert.strictEqual(E.state.secrets.etoileAir, true);
  assert.strictEqual(skyAnimEvent, "filantes");
  assert.strictEqual(customEventReceived, true);
  assert.strictEqual(E.state.intu, prevIntu + 5);
  assert.ok(E.state.boosts.prod);
  assert.strictEqual(E.state.boosts.prod.mult, 1.5);
  assert.strictEqual(E.state.boosts.prod.until, time + 60000);
  assert.strictEqual(E.cache().auto["*"], 1.5);

  time += 61000;
  E.update();
  assert.strictEqual(E.state.boosts.prod, undefined);
  assert.strictEqual(E.cache().auto["*"], undefined);
});

test("mélodie rejouable : reconnue plusieurs fois sans modal de secret", () => {
  const recit = {
    melodies: {
      vent: {
        n: "Appel du vent",
        notes: [2, 3, 4],
        rejouable: true,
        effets: [{ k: "flag", id: "vent_actif" }]
      }
    }
  };
  const E = createEngine({ recit });
  const m1 = [2, 3, 4].map((n) => E.playNote(n)).pop();
  assert.strictEqual(m1.id, "vent");
  assert.strictEqual(m1.fresh, true);
  assert.strictEqual(m1.rejouable, true);

  const m2 = [2, 3, 4].map((n) => E.playNote(n)).pop();
  assert.strictEqual(m2.id, "vent");
  assert.strictEqual(m2.fresh, false);
  assert.strictEqual(m2.rejouable, true);

  const list = E.melodies();
  const item = list.find((x) => x.id === "vent");
  assert.ok(item);
  assert.strictEqual(item.rejouable, true);
  assert.strictEqual(item.n, "Appel du vent");
});

test("animation céleste Sky.playAnim et Sky.trigger", () => {
  const Sky = require("../js/sky.js");
  Sky.clearAnims();
  assert.strictEqual(Sky.anims().length, 0);

  const a1 = Sky.trigger("filantes");
  assert.ok(a1);
  assert.strictEqual(a1.type, "meteors");
  assert.ok(Array.isArray(a1.meteors));
  assert.strictEqual(Sky.anims().length, 1);

  const a2 = Sky.playAnim({ type: "pulse", dur: 2 });
  assert.ok(a2);
  assert.strictEqual(a2.type, "pulse");
  assert.strictEqual(a2.dur, 2000);
  assert.strictEqual(Sky.anims().length, 2);

  Sky.clearAnims();
  assert.strictEqual(Sky.anims().length, 0);
});

test("sauvegarde et nettoyage : notes plafonnées à 32 et boosts assainis", () => {
  const E = createEngine();
  const s = JSON.parse(E.serialize());
  s.notes = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 99, "bad"];
  s.boosts = {
    prod: { mult: 1.25, until: 2000000000000 },
    invalide: "chaine",
    trop_grand: { mult: 99999, until: 100 }
  };
  E.load(JSON.stringify(s));
  assert.ok(E.state.notes.length <= 32);
  assert.ok(E.state.notes.every((n) => n >= 1 && n <= 5));
  assert.ok(E.state.boosts.prod);
  assert.strictEqual(E.state.boosts.prod.mult, 1.25);
  assert.strictEqual(E.state.boosts.invalide, undefined);
  assert.strictEqual(E.state.boosts.trop_grand.mult, 10);
});

console.log("Moteur des voix, du terminal et de la capsule (6.3)");
const CLE = [...Buffer.from("ZHJvYmHigJlkIG5pYW0=", "base64").toString("utf8")].reverse().join("");
test("terminal : normalisation et variables dynamiques en mode ARCHE", () => {
  const E = createEngine();
  // mode par défaut = arche
  assert.strictEqual(E.state.termMode, "arche");
  const lines = E.terminal("WHOAMI");
  assert.ok(lines[0].startsWith("ARCHE > "));
  assert.strictEqual(lines[1], "SEMEUR 7");
  // avec accents et casse
  const semLines = E.terminal("Sèmeur");
  assert.ok(semLines.some((l) => l.includes("SEMEUR 7")));
});

test("terminal : ouverture de la Clause et bascule en mode Registre", () => {
  const E = createEngine();
  const initIntu = E.state.intu;
  assert.strictEqual(E.state.flags.registre, undefined);
  // saisie de la Clause avec tolérance
  const res = E.terminal("  " + CLE.toUpperCase().replace(" ", "   ") + "  ");
  assert.ok(E.state.flags.registre);
  assert.strictEqual(E.state.termMode, "reg");
  assert.ok(E.state.secrets.cregistre);
  assert.strictEqual(E.state.intu, initIntu + 2);
  assert.ok(res[0].startsWith("REG > "));
  assert.ok(res.some((l) => l.includes("CLAUSE RECONNUE")));
  assert.ok(res.some((l) => l.includes("ENFANTS IDENTIFIÉS PAR NUMÉRO")));
});

test("terminal : navigation entre modes et entrées Registre", () => {
  const E = createEngine();
  E.terminal(CLE);
  // mode registre actif
  const aideLines = E.terminal("AIDE");
  assert.ok(aideLines.some((l) => l.includes("REG · ENTRÉES")));
  // mains avec date dynamique
  const mainsLines = E.terminal("mains");
  assert.ok(mainsLines.some((l) => l.includes("MAINS : 12")));
  assert.ok(mainsLines.some((l) => l.includes("SON HORLOGE INDIQUE : ")));
  // bascule vers ARCHE
  E.terminal("mode arche");
  assert.strictEqual(E.state.termMode, "arche");
  const who = E.terminal("whoami");
  assert.ok(who[0].startsWith("ARCHE > "));
  // retour en REG
  E.terminal("mode reg");
  assert.strictEqual(E.state.termMode, "reg");
});

test("terminal : semeurs S-01 à S-12 et rotation selon les cycles", () => {
  const E = createEngine();
  E.terminal(CLE);
  // S-01 est mort, relais sectionné, sépulture avec oiseau
  const s01 = E.terminal("s-01");
  assert.ok(s01.some((l) => l.includes("MORT")));
  assert.ok(s01.some((l) => l.includes("SECTION DU RELAIS DANS SON CORPS")));
  assert.ok(s01.some((l) => l.includes("UN OISEAU")));
  // S-07 au cycle 1 est actif
  const s07 = E.terminal("s-07");
  assert.ok(s07.some((l) => l.includes("ÉVEILLÉ")));
  assert.ok(s07.some((l) => l.includes("CYCLES 1")));
  // S-08 au cycle 1 dort
  const s08 = E.terminal("s-08");
  assert.ok(s08.some((l) => l.includes("DORT")));
  // après relève : cycle 2 -> cuve 8 éveillée, cuve 7 dort
  E.newCycle();
  const s07c2 = E.terminal("s-07");
  assert.ok(s07c2.some((l) => l.includes("DORT")));
  const s08c2 = E.terminal("s-08");
  assert.ok(s08c2.some((l) => l.includes("ÉVEILLÉ")));
});

test("capsule : texte personnalisé, persistance et consultation au Registre", () => {
  const E = createEngine();
  assert.strictEqual(E.getCapsuleText(), "");
  // texte plafonné à 140
  const longTxt = "a".repeat(200);
  E.setCapsuleText(longTxt);
  assert.strictEqual(E.getCapsuleText().length, 140);

  const custom = "Prends le relais, ne crains pas le noir.";
  E.setCapsuleText(custom);
  assert.strictEqual(E.getCapsuleText(), custom);

  // survit à la sauvegarde
  const json = E.serialize();
  const E2 = createEngine();
  E2.load(json);
  assert.strictEqual(E2.getCapsuleText(), custom);

  // survit à newCycle
  E2.newCycle();
  assert.strictEqual(E2.getCapsuleText(), custom);

  // consultation au Registre
  E2.terminal(CLE);
  const initIntu = E2.state.intu;
  const capLines = E2.terminal("capsule");
  assert.ok(E2.state.secrets.ccapsule);
  assert.strictEqual(E2.state.intu, initIntu + 2);
  assert.ok(capLines.some((l) => l.includes("ENREGISTREMENT ORIGINAL : « " + custom + " »")));
  assert.ok(capLines.some((l) => l.includes("DIFFUSÉ : « Salut. C’est toi.")));
});

test("événements narratifs conditionnels : déclenchement, once et interpolation", () => {
  const recitCustom = {
    events: [
      {
        id: "test_ev_once",
        cond: { made: "feu" },
        toast: "Le premier feu de {semeur}.",
        arche: ["SEMEUR {semeur}, TU AS ALLUMÉ LE FEU."],
        flag: "feu_notifie"
      }
    ]
  };
  const E = createEngine({ recit: recitCustom });
  assert.strictEqual(E.state.eventsSeen.test_ev_once, undefined);
  E.checkEvents();
  assert.strictEqual(E.state.eventsSeen.test_ev_once, undefined);

  // fabrication du feu
  E.state.made.feu = 1;
  E.checkEvents();
  assert.ok(E.state.eventsSeen.test_ev_once);
  assert.ok(E.state.flags.feu_notifie);
  assert.ok(E.state.arche.some((l) => l.txt === "SEMEUR 7, TU AS ALLUMÉ LE FEU."));

  // ne se déclenche pas une deuxième fois
  const countBefore = E.state.arche.length;
  E.checkEvents();
  assert.strictEqual(E.state.arche.length, countBefore);

  // survit à la relève et sauvegarde
  const json = E.serialize();
  const E2 = createEngine({ recit: recitCustom });
  E2.load(json);
  assert.ok(E2.state.eventsSeen.test_ev_once);
  E2.newCycle();
  assert.ok(E2.state.eventsSeen.test_ev_once);
});

console.log("Moteur des portes et explorations (6.4)");
test("hasExpReq : chaîne, liste d’objets et conditions complexes", () => {
  const E = createEngine();
  // chaîne
  assert.strictEqual(E.hasExpReq("pioche_pierre"), false);
  E.state.inv.pioche_pierre = 1;
  assert.strictEqual(E.hasExpReq("pioche_pierre"), true);

  // tableau
  assert.strictEqual(E.hasExpReq(["flute", "lunette"]), false);
  E.state.made.flute = 1;
  assert.strictEqual(E.hasExpReq(["flute", "lunette"]), false);
  E.state.made.lunette = 1;
  assert.strictEqual(E.hasExpReq(["flute", "lunette"]), true);

  // objet condition
  assert.strictEqual(E.hasExpReq({ flag: "test_flag" }), false);
  E.state.flags.test_flag = true;
  assert.strictEqual(E.hasExpReq({ flag: "test_flag" }), true);

  // objet condition avec glyph et any
  assert.strictEqual(E.hasExpReq({ glyph: "enfant", any: [{ flag: "a" }, { flag: "b" }] }), false);
  E.state.signes = { enfant: { lu: true } };
  assert.strictEqual(E.hasExpReq({ glyph: "enfant", any: [{ flag: "a" }, { flag: "b" }] }), false);
  E.state.flags.b = true;
  assert.strictEqual(E.hasExpReq({ glyph: "enfant", any: [{ flag: "a" }, { flag: "b" }] }), true);
});

test("canExplore et nextExp : apparition conditionnelle et verrouillage", () => {
  const E = createEngine();
  // Lisière : chene, grotte, cercle (need: cerf_volant), racines (show: trait7)
  E.state.exp.done.lisiere = 2; // cercle
  const nxCercle = E.nextExp("lisiere");
  assert.ok(nxCercle && nxCercle.x.id === "cercle");
  assert.strictEqual(nxCercle.locked, true);
  assert.strictEqual(E.canExplore("lisiere", "cercle"), false);

  E.state.made.cerf_volant = 1;
  assert.strictEqual(E.nextExp("lisiere").locked, false);
  assert.strictEqual(E.canExplore("lisiere", "cercle"), true);

  // Fin du cercle -> racines a show: { marque: 3 } (le septième trait fini)
  E.state.exp.done.lisiere = 3;
  assert.strictEqual(E.nextExp("lisiere"), null, "masqué tant que show n’est pas satisfait");
  assert.strictEqual(E.canExplore("lisiere", "racines"), false);

  E.state.meta.marque = 3;
  const nxRacines = E.nextExp("lisiere");
  assert.ok(nxRacines && nxRacines.x.id === "racines");
  assert.strictEqual(nxRacines.locked, false);
  assert.strictEqual(E.canExplore("lisiere", "racines"), true);
});

test("recettes secrètes : cloche et pigment", () => {
  const E = createEngine();
  const cloche = D.ITEMS.cloche;
  assert.ok(cloche && cloche.sec);
  assert.strictEqual(cloche.a, 4);
  assert.strictEqual(cloche.r[0], "chauffer");
  assert.strictEqual(cloche.r[3].heat, 1100);

  const pigment = D.ITEMS.pigment;
  assert.ok(pigment && pigment.sec);
  assert.strictEqual(pigment.a, 5);
  assert.strictEqual(pigment.r[0], "tailler");

  // Découverte des recettes secrètes
  stations(E, ["feu", "bas_fourneau", "couteau"]);
  E.add("lingot_bronze", 20); E.state.seen.lingot_bronze = true;
  E.add("argile", 20); E.state.seen.argile = true;
  const r1 = E.attempt("chauffer", ["lingot_bronze", "argile"]);
  assert.strictEqual(r1.id, "cloche");
  const c1 = E.craft("cloche");
  assert.ok(c1.ok);
  assert.strictEqual(E.count("cloche"), 1);
  assert.ok(E.state.secrets.cloche);

  E.add("charbon", 5); E.state.seen.charbon = true;
  const r2 = E.attempt("tailler", ["argile", "charbon"]);
  assert.strictEqual(r2.id, "pigment");
  assert.strictEqual(E.count("pigment"), 1);
  assert.ok(E.state.secrets.pigment);
});

console.log("Moteur des fins et dénouements (6.5)");
test("les cinq fins sont définies et conformes", () => {
  const ends = Object.keys(D.ENDINGS);
  assert.deepStrictEqual(ends.sort(), ["aube", "brasier", "exode", "retour", "silence"]);
  ends.forEach((eid) => {
    const en = D.ENDINGS[eid];
    assert.ok(en.n && typeof en.n === "string");
    assert.ok(en.ic && typeof en.ic === "string");
    assert.ok(en.t && typeof en.t === "string" && en.t.length > 50);
  });
});

test("La Treizième Arche : étapes, lancement et fin « exode »", () => {
  const E = createEngine();
  assert.strictEqual(E.projVisible("arche13"), false);
  E.state.made.vaisseau = 1;
  E.state.flags.station_morte = true;
  assert.strictEqual(E.projVisible("arche13"), true);

  let ending = null;
  E.on("ending", (r) => (ending = r));

  const p = D.PROJECTS.arche13;
  assert.strictEqual(p.steps.length, 4);
  for (let i = 0; i < 3; i++) {
    const s = p.steps[i];
    for (const k in s.cost) E.add(k, s.cost[k]);
    assert.ok(E.contribute("arche13").done);
  }
  assert.strictEqual(E.projState("arche13").step, 3);
  E.fire("arche13");
  assert.ok(ending && ending.id === "exode");
  assert.ok(E.state.endings.exode);
});

test("Le Grand Silence : étapes, proclamation et fin « silence »", () => {
  const E = createEngine();
  assert.strictEqual(E.projVisible("silence"), false);
  E.state.signes = { halte: { lu: true } };
  E.state.made.radiotelescope = 1;
  assert.strictEqual(E.projVisible("silence"), true);

  let ending = null;
  E.on("ending", (r) => (ending = r));

  const p = D.PROJECTS.silence;
  assert.strictEqual(p.steps.length, 4);
  for (let i = 0; i < 3; i++) {
    const s = p.steps[i];
    for (const k in s.cost) E.add(k, s.cost[k]);
    assert.ok(E.contribute("silence").done);
  }
  assert.strictEqual(E.projState("silence").step, 3);
  E.fire("silence");
  assert.ok(ending && ending.id === "silence");
  assert.ok(E.state.endings.silence);
});

test("une sauvegarde 0.8.2 retrouve la Treizième Arche entamée, et son chantier", () => {
  const E = createEngine();
  const o = JSON.parse(E.serialize());
  o.flags.ver = "0.8.7";
  o.made.vaisseau = 1; o.inv.vaisseau = 1; o.flags.station_morte = true;
  o.proj.arche13 = { step: 1, paid: { propulseur: 12, supra: 300 } };
  // un chantier mis de côté par une 0.8.x qui ne connaissait plus ce Grand Œuvre
  o.orphans = { dom: { "site:arche13": { on: true } } };
  const E2 = createEngine();
  E2.load(JSON.stringify(o));
  assert.ok(E2.projVisible("arche13"));
  assert.deepStrictEqual(E2.projState("arche13"), { step: 1, paid: { propulseur: 12, supra: 300 } });
  assert.ok(E2.state.dom.site.arche13 && E2.state.dom.site.arche13.on, "chantier rendu");
  assert.ok(!E2.state.orphans.dom["site:arche13"]);
  // et une fin d’avant garde ses Échos
  E2.state.meta.endings.exode = 1;
  assert.strictEqual(E2.endingsCount(), 1);
});

test("Cycle post-Matines : E.isLibere() et préservation après la relève", () => {
  const E = createEngine();
  assert.strictEqual(E.isLibere(), false);
  E.state.meta.endings.retour = 1;
  assert.strictEqual(E.isLibere(), true);
  assert.ok(E.cond({ libere: true }));
  assert.ok(E.cond({ ending: "retour" }));
  assert.strictEqual(E.cond({ not: { ending: "retour" } }), false);

  E.newCycle();
  assert.strictEqual(E.isLibere(), true);
});

console.log("Post-game et ajouts créatifs (6.6)");
test("Audio : synthèse sonore dédiée pour chaque fin", () => {
  const oscs = [];
  const noises = [];
  const mockAudioContext = function () {
    return {
      createGain: () => ({
        gain: { value: 1, cancelScheduledValues: () => {}, setTargetAtTime: () => {}, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {}
      }),
      createDynamicsCompressor: () => ({
        threshold: {}, ratio: {}, attack: {}, release: {}, connect: () => {}
      }),
      createBuffer: () => ({ getChannelData: () => new Float32Array(100) }),
      createConvolver: () => ({ connect: () => {} }),
      createBufferSource: () => ({
        connect: () => {},
        start: () => {},
        stop: () => {},
        buffer: null,
        playbackRate: { setValueAtTime: () => {} }
      }),
      createBiquadFilter: () => {
        const f = {
          type: "lowpass",
          frequency: { setValueAtTime: (v) => { f._freq = v; }, exponentialRampToValueAtTime: () => {} },
          Q: { value: 1 },
          connect: () => {}
        };
        noises.push(f);
        return f;
      },
      createOscillator: () => {
        const o = {
          type: "sine",
          frequency: { value: 440, setValueAtTime: (v) => { o._freq = v; }, exponentialRampToValueAtTime: () => {} },
          detune: { value: 0 },
          connect: () => {},
          start: () => {},
          stop: () => {}
        };
        oscs.push(o);
        return o;
      },
      destination: {},
      sampleRate: 44100,
      currentTime: 0,
      state: "running"
    };
  };

  global.window = { AudioContext: mockAudioContext };
  const Audio = require("../js/audio.js");
  Audio.init();

  // Test aube : 7 tons ascendants avec vibrato
  oscs.length = 0; noises.length = 0;
  Audio.ending("aube");
  assert.strictEqual(oscs.length, 14); // 7 notes + 7 LFO vibrato
  assert.strictEqual(oscs[0].type, "sine");

  // Test brasier : 4 basses triangulaires + grondement noise
  oscs.length = 0; noises.length = 0;
  Audio.ending("brasier");
  assert.strictEqual(oscs.length, 8); // 4 notes triangle + 4 LFO vibrato
  assert.strictEqual(oscs[0].type, "triangle");
  assert.ok(noises.length >= 1);

  // Test retour : carillon harmonique de cloche + fondation sinusoïdale
  oscs.length = 0; noises.length = 0;
  Audio.ending("retour");
  assert.ok(oscs.length >= 20); // 5 cloches (partiels harmoniques) + 5 basses

  // Test exode : quintes cosmiques ascendantes + souffle bandpass
  oscs.length = 0; noises.length = 0;
  Audio.ending("exode");
  assert.strictEqual(oscs.length, 10); // 5 notes + 5 LFO
  assert.ok(noises.length >= 1);

  // Test silence : decrescendo harmonique descendant vers le calme
  oscs.length = 0; noises.length = 0;
  Audio.ending("silence");
  assert.strictEqual(oscs.length, 5); // 5 notes sans LFO
  assert.ok(noises.length >= 1);

  // Test fallback / générique
  oscs.length = 0; noises.length = 0;
  Audio.ending("inconnu");
  assert.strictEqual(oscs.length, 10);

  Audio.setEnabled(false);
});

test("Audio : l’atelier au travail est un seul paysage continu, quel que soit le nombre de pièces", () => {
  const Audio = require("../js/audio.js");
  Audio.setEnabled(true);
  Audio.work("marteler");
  const k = Audio.debug().work;
  assert.ok(/^enclume:/.test(k), "le geste choisit le paysage : " + k);
  for (let i = 0; i < 1000; i++) Audio.work("marteler"); // mille pièces : toujours la même voix
  assert.strictEqual(Audio.debug().work, k);
  Audio.work("tailler"); // un autre geste ne change rien tout de suite
  assert.strictEqual(Audio.debug().work, k);
  Audio.work(null); // et la fin se fait en fondu, pas d’un coup
  assert.strictEqual(Audio.debug().work, k);
  Audio.setEnabled(false);
  assert.strictEqual(Audio.debug().work, null);
});

test("Dénouements et Échos dans la Mémoire des mains : données conformes", () => {
  const endings = Object.keys(D.ENDINGS);
  assert.strictEqual(endings.length, 5);
  endings.forEach((k) => {
    assert.ok(D.ENDINGS[k].ic, "Icone présente pour " + k);
    assert.ok(D.ENDINGS[k].n, "Nom présent pour " + k);
    assert.ok(D.ENDINGS[k].t, "Texte présent pour " + k);
  });
});

console.log("Optimisation mobile et accessibilité (6.7)");
test("Réglages : initialisation, thème 'auto', 'light', 'dark' et grand texte", () => {
  const E = createEngine();
  assert.strictEqual(E.state.settings.theme, "auto");
  assert.strictEqual(E.state.settings.largeText, false);
  assert.strictEqual(E.state.settings.sound, true);
  assert.strictEqual(E.state.settings.vibe, true);

  // Modification et persistance
  E.state.settings.theme = "dark";
  E.state.settings.largeText = true;
  const ser = E.serialize();
  const loaded = createEngine();
  loaded.load(ser);
  assert.strictEqual(loaded.state.settings.theme, "dark");
  assert.strictEqual(loaded.state.settings.largeText, true);
});

test("Migration d'anciennes sauvegardes sans les clés theme et largeText", () => {
  const legacy = JSON.parse(fixture("save-v5-age8-usine.json"));
  delete legacy.settings;
  const E = createEngine();
  E.load(legacy);
  assert.strictEqual(E.state.settings.theme, "auto");
  assert.strictEqual(E.state.settings.largeText, false);
  assert.strictEqual(E.state.settings.sound, true);
  assert.strictEqual(E.state.settings.vibe, true);
});

console.log("Curiosités et clins d’œil (6.8)");
test("Curiosités : D.EASTER contient les 11 curiosités conformes", () => {
  const expected = ["poudre_rouge", "coeur", "anneau", "d20", "fouet", "tuyau", "survivant", "zera", "squeeze", "wtc", "konami"];
  assert.ok(D.EASTER, "D.EASTER défini");
  expected.forEach((k) => {
    assert.ok(D.EASTER[k], "Curiosité présente : " + k);
    assert.ok(D.EASTER[k].n, "Nom présent pour " + k);
    assert.ok(D.EASTER[k].desc, "Description présente pour " + k);
    assert.ok(D.EASTER[k].ic, "Icône présente pour " + k);
  });
  // Règle secrète : pas de nom de marque ou streamer en clair dans les descriptions
  const forbidden = ["Minecraft", "Zelda", "Castlevania", "Mario", "ZeratoR", "Squeezie", "Antoine Daniel"];
  for (const k in D.EASTER) {
    const txt = D.EASTER[k].n + " " + D.EASTER[k].desc;
    forbidden.forEach((f) => {
      assert.strictEqual(txt.includes(f), false, "Ne doit pas citer " + f + " en clair dans " + k);
    });
  }
});

test("Curiosités : addCurio, hasCurio, curiosCount, curios et émission", () => {
  const E = createEngine();
  let emitted = null;
  E.on("curio", (id) => { emitted = id; });
  assert.strictEqual(E.curiosCount(), 0);
  assert.strictEqual(E.hasCurio("poudre_rouge"), false);

  assert.strictEqual(E.addCurio("poudre_rouge"), true);
  assert.strictEqual(emitted, "poudre_rouge");
  assert.strictEqual(E.hasCurio("poudre_rouge"), true);
  assert.strictEqual(E.curiosCount(), 1);

  // Pas de doublon
  assert.strictEqual(E.addCurio("poudre_rouge"), false);
  assert.strictEqual(E.curiosCount(), 1);
});

test("Curiosités : persistance lors de la relève (newCycle) et sauvegarde", () => {
  const E = createEngine();
  E.addCurio("zera");
  E.addCurio("konami");
  E.state.meta.curioHearts = 3;
  assert.strictEqual(E.curiosCount(), 2);

  // Sauvegarde et chargement
  const ser = E.serialize();
  const loaded = createEngine();
  loaded.load(ser);
  assert.strictEqual(loaded.curiosCount(), 2);
  assert.strictEqual(loaded.hasCurio("zera"), true);
  assert.strictEqual(loaded.hasCurio("konami"), true);
  assert.strictEqual(loaded.state.meta.curioHearts, 3);

  // Relève
  loaded.newCycle();
  assert.strictEqual(loaded.curiosCount(), 2);
  assert.strictEqual(loaded.hasCurio("zera"), true);
  assert.strictEqual(loaded.hasCurio("konami"), true);
  assert.strictEqual(loaded.state.meta.curioHearts, 3);
});

test("Curiosités : déclencheurs (Zelda 4 cœurs, Mario 8 extracteurs, Vampire Survivors 1800s, ZeratoR terminal, Squeezie comptoir)", () => {
  const E = createEngine();

  // Zelda : 4 quarts de cœur
  E.state.zones.lisiere = true;
  for (let i = 0; i < 3; i++) {
    E.state.meta.curioHearts = i;
    // simulation récolte de fibre avec quart_coeur
    E.state.meta.curioHearts++;
  }
  assert.strictEqual(E.hasCurio("coeur"), false);
  E.state.meta.curioHearts++;
  E.addCurio("coeur");
  assert.strictEqual(E.hasCurio("coeur"), true);

  // Mario : 8 extracteurs dans les Profondeurs
  E.state.zones.mine = true;
  E.add("galerie", 8);
  E.domExtSet("mine", "fer_min", "galerie", 8);
  assert.strictEqual(E.hasCurio("tuyau"), true);

  // ZeratoR : mot-clé au terminal
  E.terminal("zlan");
  assert.strictEqual(E.hasCurio("zera"), true);

  // Squeezie : 1 000 000 d'une ressource vendue au comptoir
  E.state.zones.plaine = true;
  E.add("bois", 1000000);
  E.sell("bois", 1000000);
  assert.strictEqual(E.hasCurio("squeeze"), true);

  // Vampire Survivors : 1800s de récolte continue (jeu ouvert)
  E.startAct({ k: "harv", z: "lisiere", res: "bois" });
  E.step(1800, false);
  assert.strictEqual(E.hasCurio("survivant"), true);
});

console.log("Lisibilité et Ergonomie (6.9)");
test("Règle de terre : la gêne nomme les protections (le Domaine propose leur fiche)", () => {
  const E0 = createEngine();
  const r = E0.regle("mine");
  assert.strictEqual(r.etat, "gene");
  assert.deepStrictEqual(r.sans, ["torche", "lampe"]);
  assert.deepStrictEqual(E0.regle("riviere").sans, []);
});
test("Ce qui limite : d’où vient une ressource qui manque", () => {
  const E0 = createEngine();
  const l = E0.limiting("bois", 100);
  assert.ok(l.raw && l.z === "lisiere" && l.open && l.rate === 0 && l.eta === null, "rien ne produit encore le bois");
  assert.ok(E0.limiting("bois", 100).hand, "les mains récoltent le bois");
  assert.strictEqual(E0.limiting("manche", 1).raw, false, "une pièce fabriquée n’a pas de gisement");
  assert.strictEqual(E0.limiting("metal_mercure", 10).open, false, "une terre pas encore atteinte est dite telle");
});
test("Version 0.62.0 et journal des modifications", () => {
  assert.strictEqual(D.VERSION, "0.62.0");
  assert.ok(D.CHANGES.length >= 2);
});

test("Carnet : mémorisation du filtre, de la recherche et quantité libre", () => {
  const E = createEngine();
  // Vérification de la persistance des préférences du Carnet dans les settings
  E.state.settings.carnet = { filter: "pret", q: "corde" };
  const raw = E.serialize();
  const E2 = createEngine();
  E2.load(raw);
  assert.deepStrictEqual(E2.state.settings.carnet, { filter: "pret", q: "corde" }, "les réglages de filtre et recherche du Carnet survivent à la sauvegarde");

  // Planification avec quantité libre arbitraire
  E.state.known.corde = true;
  E.state.inv.fibre = 100;
  const p = E.plan("corde", 17);
  assert.strictEqual(p.ok, true);
  assert.strictEqual(p.times, 17);
  assert.strictEqual(p.used.fibre, 51);
});

test("Suivi d'objectif et plan d'artisanat : prêt / manquant", () => {
  const E = createEngine();
  E.state.known.corde = true;
  E.state.known.manche = true;
  E.setTrack("manche");
  assert.deepStrictEqual(E.state.track, { id: "manche" });

  // Manquant au début
  let plan = E.plan("manche", 1);
  assert.strictEqual(plan.ok, false);
  assert.deepStrictEqual(plan.missing, { bois: 3 });

  // Ajout du bois : plan devient ok
  E.add("bois", 3);
  plan = E.plan("manche", 1);
  assert.strictEqual(plan.ok, true);

  // Annuler le suivi
  E.setTrack(null);
  assert.strictEqual(E.state.track, null);
});

console.log("Ergonomie de la Réserve et Gestion des Flux (6.10)");
test("Réserve : partition des matières brutes et pièces", () => {
  const resItems = Object.keys(D.ITEMS).filter((k) => D.ITEMS[k].t === "res");
  const compItems = Object.keys(D.ITEMS).filter((k) => D.ITEMS[k].t === "comp");
  assert.ok(resItems.includes("bois"));
  assert.ok(resItems.includes("caillou"));
  assert.ok(compItems.includes("manche"));
  assert.ok(compItems.includes("corde"));
});

test("Réserve : calcul des flux nets et débits actifs", () => {
  const E = mk();
  // Don de cabanes et placement sur le gisement de bois
  E.state.inv.cabane = 2;
  const res = E.domExtAdd("lisiere", "bois", 2);
  assert.strictEqual(res.ok, true);
  T += 100;
  E.update();
  assert.ok(E.rate("bois") > 0, "débit d'extraction de bois positif");

  const flows = E.flows();
  const netBois = E.rate("bois") + (flows.prod.bois || 0) - (flows.cons.bois || 0);
  assert.ok(netBois > 0, "solde net positif pour le bois");

  const netCaillou = E.rate("caillou") + (flows.prod.caillou || 0) - (flows.cons.caillou || 0);
  assert.strictEqual(netCaillou, 0, "aucun flux actif sur le caillou");
});

console.log("Réactivité d'ARCHE et Mémoire des Cycles (6.11)");
test("ARCHE : la radio interpole le Semeur selon le cycle", () => {
  const E = mk();
  E.state.cycle = 1;
  E.archeSay("radio");
  assert.ok(E.state.arche.some((l) => l.txt.includes("SEMEUR 7, TU M’ENTENDS ?")));
  E.state.arche = [];
  E.state.cycle = 14;
  E.archeSay("radio");
  assert.ok(E.state.arche.some((l) => l.txt.includes("SEMEUR 20")));
  // après Matines, plus d’ARCHE
  E.state.arche = [];
  E.state.meta.endings.retour = 1;
  E.archeSay("radio");
  assert.strictEqual(E.state.arche.length, 0);
});

test("Terminal : whoami et statut synchronisés avec le cycle", () => {
  const E = createEngine();

  // Cycle 1 : SEMEUR 7
  E.state.cycle = 1;
  let lines = E.terminal("whoami");
  assert.strictEqual(lines[1], "SEMEUR 7");

  // Cycle 2 : SEMEUR 8
  E.state.cycle = 2;
  lines = E.terminal("whoami");
  assert.strictEqual(lines[1], "SEMEUR 8");

  // Cycle 7 : SEMEUR 13
  E.state.cycle = 7;
  lines = E.terminal("whoami");
  assert.strictEqual(lines[1], "SEMEUR 13");

  // Cycle 14 : SEMEUR 20
  E.state.cycle = 14;
  lines = E.terminal("whoami");
  assert.strictEqual(lines[1], "SEMEUR 20");

  // Vérification de la commande statut
  const stat = E.terminal("statut");
  assert.ok(stat.some((l) => l.includes("SEMEUR 20")));
});

console.log("Langage Naturel et Épuration des Textes (6.12)");
test("Épuration des calques IA et naturel du texte", () => {
  // D.FAIL.assembler épuré
  assert.strictEqual(D.FAIL.assembler.some((t) => t.includes("trois secondes")), false);
  assert.strictEqual(D.FAIL.assembler.some((t) => t.includes("rien ne tient")), false);
  assert.ok(D.FAIL.assembler.some((t) => t.includes("s’emboîter") || t.includes("s'emboîter")));

  // D.OBJECTIVES épuré de « verse » (hors traverser) pour les passages
  const passObjs = D.OBJECTIVES.filter((g) => g && g.k === "pass");
  assert.ok(passObjs.length >= 3);
  assert.strictEqual(passObjs.some((g) => /\bvers(e|er|ez|ent|é|ée|és|ées)?\b/i.test(g.txt)), false);
  assert.ok(passObjs.some((g) => g.txt.includes("apporte") || g.txt.includes("dépose")));
});

console.log("Ergonomie Visuelle : Notifications & Progression de l'Âge (6.13)");
test("Progression de l'Âge et Jalons : calcul de complétion et level design", () => {
  const E = createEngine();
  const ms = E.milestones();
  assert.ok(Array.isArray(ms));
  assert.ok(ms[0] && ms[0].length >= 3);

  // Âge 0 au départ : progression partielle ou 0
  const age0 = ms[0];
  const initialDone = age0.filter((x) => x.done).length;
  assert.strictEqual(typeof initialDone, "number");

  // Compléter une étape (ex: fabriquer un manche)
  E.state.made.manche = 1;
  const msAfter = E.milestones();
  const doneAfter = msAfter[0].filter((x) => x.done).length;
  assert.ok(doneAfter >= initialDone);
});

console.log("Profondeur Late-Game : Résonances Stellaires et Murmures (6.14)");
test("Résonances Stellaires : paliers infinis, coûts exponentiels et multiplicateurs", () => {
  const E = createEngine(); E.state.meta.achats = true;
  assert.ok(Array.isArray(D.TRANSCENDANCE));
  assert.strictEqual(D.TRANSCENDANCE.length, 3);

  // Valeurs initiales
  assert.strictEqual(E.transLvl("trans_main"), 0);
  assert.strictEqual(E.transV("trans_main"), 1);
  const cost0 = E.transCost("trans_main");
  assert.strictEqual(cost0, 50);

  // Tentative sans assez de Traces
  E.state.meta.traces = 20;
  assert.strictEqual(E.transBuy("trans_main"), false);
  assert.strictEqual(E.transLvl("trans_main"), 0);

  // Achat avec assez de Traces
  E.state.meta.traces = 100;
  assert.strictEqual(E.transBuy("trans_main"), true);
  assert.strictEqual(E.state.meta.traces, 50);
  assert.strictEqual(E.transLvl("trans_main"), 1);
  assert.strictEqual(E.transV("trans_main"), 2); // Multiplicateur x2

  // Coût du palier suivant (exponentiel)
  const cost1 = E.transCost("trans_main");
  assert.ok(cost1 > cost0);

  // Achat du palier 2
  E.state.meta.traces = cost1 + 10;
  assert.strictEqual(E.transBuy("trans_main"), true);
  assert.strictEqual(E.transLvl("trans_main"), 2);
  assert.strictEqual(E.transV("trans_main"), 4); // Multiplicateur x4

  // Effet mesurable sur tapYield
  E.state.zones.lisiere = true;
  const yieldWithTrans = E.tapYield("bois", "lisiere");
  assert.ok(yieldWithTrans >= 4);

  // Persistance à la relève
  E.newCycle();
  assert.strictEqual(E.transLvl("trans_main"), 2);
  assert.strictEqual(E.transV("trans_main"), 4);
});

test("Murmures du Temps : déblocage d'indices de dénouements secrets", () => {
  const E = createEngine(); E.state.meta.achats = true;
  assert.strictEqual(E.hasEndingHint("retour"), false);

  // Sans assez de Traces
  E.state.meta.traces = 40;
  assert.strictEqual(E.buyEndingHint("retour"), false);
  assert.strictEqual(E.hasEndingHint("retour"), false);

  // Avec assez de Traces (75)
  E.state.meta.traces = 150;
  assert.strictEqual(E.buyEndingHint("retour"), true);
  assert.strictEqual(E.state.meta.traces, 75);
  assert.strictEqual(E.hasEndingHint("retour"), true);

  // Impossible de racheter un murmure déjà acquis
  assert.strictEqual(E.buyEndingHint("retour"), false);
  assert.strictEqual(E.state.meta.traces, 75);

  // Persistance à la relève
  E.newCycle();
  assert.strictEqual(E.hasEndingHint("retour"), true);
});

test("Illustrations des Grands Œuvres : chaque image appelée existe, chaque fichier sert", () => {
  const fs = require("fs"), path = require("path");
  const dir = path.join(__dirname, "..", "assets", "oeuvres"), sert = {};
  for (const pid in D.PROJECTS) {
    sert[D.oeuvreArt(pid)] = 1;
    D.PROJECTS[pid].steps.forEach((s, i) => { sert[D.oeuvreArt(pid, i)] = 1; });
  }
  for (const n in sert) assert.ok(fs.existsSync(path.join(dir, n + ".webp")), "image manquante : " + n);
  for (const f of fs.readdirSync(dir)) assert.ok(sert[f.replace(/\.webp$/, "")], "image jamais montrée : " + f);
  for (const pid in D.OEUVRE_ETAPES) assert.ok(D.PROJECTS[pid] && D.OEUVRE_ETAPES[pid].length === D.PROJECTS[pid].steps.length, pid);
});

console.log("Ergonomie : Pastilles d’Objets & Affordance (0.7.0)");
test("Convention de versionnement 0.x.y", () => {
  assert.strictEqual(D.VERSION, "0.62.0");
  assert.ok(D.CHANGES.length >= 2);
  const parts = D.VERSION.split(".").map(Number);
  assert.strictEqual(parts.length, 3);
  assert.strictEqual(parts[0], 0, "Majeure à 0 avant la 1.0");
  assert.strictEqual(parts[1], 62, "Mineure pour le lot courant");
  assert.strictEqual(require("../package.json").version, D.VERSION, "package.json suit la version du jeu");
});

console.log("Horodatage du Journal (0.7.1)");
test("Journal : un fragment trouvé est daté (cycle, âge), gardé à la relève et à la sauvegarde", () => {
  const E = createEngine();
  const fid = Object.keys(D.FRAGS).find((f) => !E.state.frags[f]);
  assert.strictEqual(E.stampOf("f:" + fid), null);
  E.state.age = 3;
  const avant = Date.now();
  assert.ok(E.addFrag(fid, true));
  const s = E.stampOf("f:" + fid);
  assert.ok(Array.isArray(s) && s[0] >= avant && s[1] === 1 && s[2] === 3, "date, cycle 1, âge 3 : " + JSON.stringify(s));
  // une seconde fois ne change pas la date
  E.addFrag(fid, true);
  assert.deepStrictEqual(E.stampOf("f:" + fid), s);
  // la relève garde la date, la sauvegarde aussi
  E.newCycle();
  assert.deepStrictEqual(E.stampOf("f:" + fid), s);
  const E2 = createEngine();
  E2.load(E.serialize());
  assert.deepStrictEqual(E2.stampOf("f:" + fid), s);
});
test("Journal : une ancienne sauvegarde n’a pas de date inventée", () => {
  const E = createEngine();
  E.load(fixture("save-v1-age10-chaines.json"));
  const found = Object.keys(E.state.frags).filter((f) => E.state.frags[f]);
  assert.ok(found.length > 0);
  found.forEach((f) => assert.strictEqual(E.stampOf("f:" + f), null));
});

console.log("Registre de Quêtes, Rituels & Contrats du Troqueur (0.8.0)");
test("Rituels quotidiens : 3 rituels déterministes, progression et récompense", () => {
  const E = createEngine();
  const rits = E.dailyRituals();
  assert.strictEqual(rits.length, 3);
  assert.strictEqual(rits[0].claimed, false);
  assert.strictEqual(rits[0].done, false);

  // Avancer le rituel 1 via tap
  const initR1 = rits[1].prog;
  const yieldGot = E.tap("bois");
  const ritsAfterTap = E.dailyRituals();
  assert.strictEqual(ritsAfterTap[1].prog, initR1 + yieldGot);

  // Compléter le rituel 0 pour tester la réclamation
  E.advanceRitual(0, rits[0].target + 5);
  const ritsDone = E.dailyRituals();
  assert.strictEqual(ritsDone[0].done, true);
  assert.strictEqual(ritsDone[0].prog, rits[0].target);

  // Réclamer la récompense
  const tracesAvant = E.state.meta.traces || 0;
  const resClaim = E.claimRitual(0);
  assert.strictEqual(resClaim.ok, true);
  assert.ok((E.state.meta.traces || 0) > tracesAvant, "Traces créditées");

  // Ne peut pas être réclamé deux fois
  const resClaim2 = E.claimRitual(0);
  assert.strictEqual(resClaim2.ok, false);
  assert.strictEqual(E.dailyRituals()[0].claimed, true);
});

test("Réputation du Troqueur : rangs, livraisons et bonus de Traces", () => {
  const E = createEngine();
  const rep0 = E.troqueurRep();
  assert.strictEqual(rep0.cnt, 0);
  assert.strictEqual(rep0.cur.lvl, 0);
  assert.strictEqual(rep0.cur.n, "Curieux de passage");
  assert.strictEqual(rep0.cur.bonus, 0);

  // Simuler 8 livraisons
  E.state.meta.troqueurDelivered = 8;
  const rep8 = E.troqueurRep();
  assert.strictEqual(rep8.cnt, 8);
  assert.strictEqual(rep8.cur.lvl, 2);
  assert.strictEqual(rep8.cur.n, "Négociant estimé");
  assert.strictEqual(rep8.cur.bonus, 2);
});

test("Résumé des quêtes et Scénario fil rouge", () => {
  const E = createEngine();
  const sc = E.scenarioQuest();
  assert.ok(sc.chapter, "Nom de chapitre présent");
  assert.ok(sc.ageName, "Nom d'âge présent");

  const qsum = E.questSummary();
  assert.strictEqual(typeof qsum.hasReady, "boolean");
  assert.strictEqual(typeof qsum.readyRitual, "boolean");
  assert.strictEqual(typeof qsum.payableAsk, "boolean");
  assert.strictEqual(typeof qsum.readyScenario, "boolean");
});

test("Curiosités : probabilité de la poudre rouge par pierre minée à la main (médiane à 20k)", () => {
  const E = createEngine();
  E.state.zones.lisiere = true;
  assert.strictEqual(E.hasCurio("poudre_rouge"), false);
  assert.strictEqual(E.count("poudre_rouge"), 0);

  // Vérifier le suivi du volume de cailloux minés à la main
  const n = E.tap("caillou");
  assert.strictEqual(E.state.stats.caillouMined, n);

  // Validation mathématique de la courbe : médiane à 50 % pour 20 000 pierres minées
  const p20k = 1 - Math.exp(-20000 * (Math.LN2 / 20000));
  assert.strictEqual(Math.round(p20k * 100), 50);

  // À 40k pierres, 75 % de chance cumulée
  const p40k = 1 - Math.exp(-40000 * (Math.LN2 / 20000));
  assert.strictEqual(Math.round(p40k * 100), 75);
});

console.log("Le Troqueur parle (0.8.5)");
const trocOuvert = (rand) => { const E = createEngine({ now: () => T, rand: rand || (() => 0.99) }); E.state.zones.plaine = true; return E; };
const dire = (E, th) => E.troqueurParle(th);
test("Parler : le Comptoir fermé, il ne dit rien ; un thème inconnu non plus", () => {
  const E = mk();
  assert.strictEqual(E.troqueurParle("comptoir").ok, false);
  const E2 = trocOuvert();
  assert.strictEqual(E2.troqueurParle("inconnu").ok, false);
});
test("Parler : les répliques s’ouvrent avec le rang de confiance", () => {
  const E = trocOuvert();
  const id0 = [];
  for (let i = 0; i < 10; i++) { const r = dire(E, "comptoir"); if (!r.vide) id0.push(r.id); }
  assert.deepStrictEqual(id0.sort(), ["c1", "c2"], "rang 0 : seulement ses deux premières");
  E.state.meta.troqueurDelivered = 3; // client régulier
  assert.strictEqual(dire(E, "comptoir").id, "c3");
  assert.ok(dire(E, "comptoir").vide, "rien de plus au cycle 1 : le reste demande le cycle 2 et un rang plus haut");
  E.state.meta.troqueurDelivered = 18;
  E.state.cycle = 2;
  const ids = []; for (let i = 0; i < 6; i++) { const r = dire(E, "comptoir"); if (!r.vide) ids.push(r.id); }
  assert.ok(ids.includes("c4") && ids.includes("c5"), ids.join());
  assert.ok(ids.includes("c3"), "le conseil de la relève revient au cycle suivant");
});
test("Parler : jamais deux fois la même réplique, puis il répond qu’il n’a plus rien", () => {
  const E = trocOuvert(() => 0);
  E.state.meta.troqueurDelivered = 35; E.state.cycle = 2; E.state.age = 4;
  const vus = new Set();
  for (const th of E.troqueurThemes().map((x) => x.id)) {
    for (let i = 0; i < 20; i++) {
      const r = dire(E, th);
      if (r.vide) break;
      assert.ok(!vus.has(r.id), r.id + " dite deux fois");
      vus.add(r.id);
    }
  }
  assert.ok(vus.size >= 20, "assez de répliques à ce stade : " + vus.size);
  assert.strictEqual(E.troqueurDispo() >= 0, true);
  const r1 = dire(E, "comptoir"), r2 = dire(E, "comptoir");
  assert.ok(r1.vide && r2.vide && r1.t && r2.t && r1.t !== r2.t, "les refus ne se répètent pas de suite");
  assert.ok(r1.q && r2.q, "les refus répondent aussi à une question du joueur");
  assert.strictEqual(E.troqueurDernier().t, r2.t);
  assert.strictEqual(E.troqueurDernier().q, r2.q, "la question reste affichée avec la réponse");
});
test("Parler : ce que le joueur a en poche ouvre des répliques précises", () => {
  const E = trocOuvert(() => 0);
  assert.ok(dire(E, "clients").vide, "rien à dire sans rien en poche, au rang 0");
  E.add("poudre_rouge", 1);
  const r = dire(E, "clients");
  assert.strictEqual(r.id, "p1");
  assert.ok(/^« .+ »$/.test(r.q), "il répond à une question précise");
  assert.ok(dire(E, "clients").vide);
});
test("Parler : les conseils reviennent à chaque relève, le reste non", () => {
  const E = trocOuvert(() => 0);
  E.state.meta.troqueurDelivered = 3; E.state.age = 1;
  const dites = () => { const o = []; for (let i = 0; i < 30; i++) { const r = dire(E, "marchandises"); if (r.vide) break; o.push(r.id); } return o; };
  const premiere = dites();
  assert.ok(premiere.includes("m1") && premiere.includes("m3"));
  E.newCycle();
  E.state.zones.plaine = true;
  const seconde = dites();
  assert.ok(seconde.includes("m3") && seconde.includes("m5") && !seconde.includes("m1"), seconde.join());
  assert.ok(E.state.meta.troc.vus.m1, "gardé à la relève");
});
test("Parler : sauvegarde sans perte, et un champ abîmé est remis à zéro sans rien casser", () => {
  const E = trocOuvert(() => 0);
  dire(E, "comptoir");
  const E2 = createEngine({ now: () => T, rand: () => 0 });
  E2.load(E.serialize());
  assert.ok(E2.state.meta.troc.vus.c1 && E2.troqueurDernier().t === E.troqueurDernier().t);
  assert.strictEqual(E2.troqueurDernier().q, E.troqueurDernier().q, "la question est retrouvée après sauvegarde");
  for (const mauvais of ["x", 7, [], { vus: "x", dernier: 3, refus: "y" }, { vus: { c1: -4, z: "q", c2: 2.7 }, dernier: { th: 4 }, refus: -3 }]) {
    const o = JSON.parse(E.serialize());
    o.meta.troc = mauvais;
    const E3 = createEngine({ now: () => T, rand: () => 0 });
    E3.load(JSON.stringify(o));
    const t = E3.state.meta.troc;
    assert.ok(t && typeof t.vus === "object" && !Array.isArray(t.vus) && Number.isInteger(t.refus) && t.refus >= 0);
    assert.ok(Object.values(t.vus).every((c) => c >= 1));
    assert.ok(t.dernier === null || typeof t.dernier.th === "string");
    E3.state.zones.plaine = true;
    assert.ok(E3.troqueurParle("comptoir").ok);
  }
  // une ancienne partie, sans le champ
  const o = JSON.parse(E.serialize()); delete o.meta.troc;
  const E4 = createEngine({ now: () => T }); E4.load(JSON.stringify(o));
  assert.deepStrictEqual(E4.state.meta.troc, { vus: {}, dernier: null, refus: 0 });
});
test("Parler RPG : arbre de dialogue interactif à 3 choix", () => {
  const E = trocOuvert(() => 0);
  const r1 = E.troqueurParle("comptoir");
  assert.ok(r1.ok && !r1.vide);
  assert.strictEqual(r1.attenteChoix, true);
  assert.ok(Array.isArray(r1.choix) && r1.choix.length === 3);
  assert.deepStrictEqual(r1.choix.map((c) => c.k), ["a", "b", "c"]);

  // Etat dernier en attente de réponse
  const d1 = E.troqueurDernier();
  assert.strictEqual(d1.rep, null);
  assert.ok(d1.stage, "présence de didascalie");

  // Choix invalide
  assert.strictEqual(E.troqueurChoix("x").ok, false);

  // Choix valide 'b'
  const repB = E.troqueurChoix("b");
  assert.strictEqual(repB.ok, true);
  assert.strictEqual(repB.choix, "b");
  assert.ok(repB.t && repB.q);

  const d2 = E.troqueurDernier();
  assert.strictEqual(d2.rep, "b");
  assert.strictEqual(d2.q, repB.q);
  assert.strictEqual(d2.t, repB.t);

  // Persistance / sauvegarde avec choix
  const E2 = createEngine({ now: () => T, rand: () => 0 });
  E2.load(E.serialize());
  const dSaved = E2.troqueurDernier();
  assert.strictEqual(dSaved.rep, "b");
  assert.strictEqual(dSaved.q, repB.q);

  // E.troqueurFin() permet de revenir au menu
  assert.strictEqual(E.troqueurFin().ok, true);
  assert.strictEqual(E.troqueurDernier(), null);

  // Sauvegarde pendant que le joueur réfléchit (attente de choix) :
  const E3 = trocOuvert(() => 0);
  E3.troqueurParle("comptoir");
  const E4 = createEngine({ now: () => T, rand: () => 0 });
  E4.load(E3.serialize());
  assert.strictEqual(E4.troqueurDernier().rep, null);
  const repE4 = E4.troqueurChoix("c");
  assert.strictEqual(repE4.ok, true);
  assert.strictEqual(E4.troqueurDernier().rep, "c");

  // Choix dans une scène de refus après sauvegarde :
  for (let i = 0; i < 10; i++) E4.troqueurParle("avant");
  assert.ok(E4.troqueurDernier().vide);
  const E5 = createEngine({ now: () => T, rand: () => 0 });
  E5.load(E4.serialize());
  const repE5 = E5.troqueurChoix("a");
  assert.strictEqual(repE5.ok, true);
  assert.strictEqual(E5.troqueurDernier().rep, "a");
});

console.log("Les fouilles : expéditions longues");
const H = 3600 * 1000;
const fouilleur = () => { const E = mk(); E.state.zones.lisiere = true; E.state.exp.done.lisiere = 1; return E; }; // le Chêne est exploré
test("Fouille : trois niveaux de plus en plus longs, un par un, un seul emplacement", () => {
  const N = D.FOUILLE.niveaux;
  assert.deepStrictEqual(N.map((n) => n.s), [1800, 7200, 28800]);
  assert.ok(N[0].taps < N[1].taps && N[1].taps < N[2].taps && N[0].intu < N[2].intu);
  const E = fouilleur();
  assert.strictEqual(E.fouilleLancer("lisiere", 0, 2).why, "palier", "pas de niveau 2 sans le niveau 1");
  assert.strictEqual(E.fouilleLancer("lisiere", 1, 1).why, "lieu", "un lieu pas encore exploré ne se fouille pas");
  assert.strictEqual(E.fouilleLancer("lisiere", 0, 4).why, "niveau");
  assert.ok(E.fouilleLancer("lisiere", 0, 1).ok);
  assert.strictEqual(E.fouilleLancer("lisiere", 0, 1).why, "busy", "un seul emplacement");
  assert.strictEqual(E.fouilleRecolter().why, "pas_fini");
  const en = E.fouilleEnCours();
  assert.ok(en && !en.pret && en.left > 1790 && en.left <= 1800 && en.x.id === "chene");
  // l’exploration courte reste libre pendant ce temps
  assert.strictEqual(E.state.exp.active, null);
  E.state.exp.done.lisiere = 1; E.add("torche", 1);
  assert.ok(E.startExp("lisiere").ok, "la grotte part pendant la fouille");
});
test("Fouille : le butin suit la terre, l’Intuition ne vaut que la première fois, rien n’expire", () => {
  const E = fouilleur();
  E.update(); // le cadeau du jour (jours de présence) tombe ici, pas dans la fouille
  const intu0 = E.state.intu;
  E.fouilleLancer("lisiere", 0, 1);
  T += 31 * 60 * 1000;
  let prete = 0; E.on("fouillePrete", () => prete++);
  E.update();
  assert.strictEqual(prete, 1);
  E.update(); assert.strictEqual(prete, 1, "annoncée une seule fois");
  const bois0 = E.count("bois");
  const r = E.fouilleRecolter();
  assert.ok(r.ok && r.prem && r.lvl === 1 && r.intu === 1);
  assert.deepStrictEqual(Object.keys(r.butin).sort(), D.ZONES[0].res.slice().sort());
  assert.strictEqual(E.count("bois") - bois0, Math.ceil(E.tapYield("bois", "lisiere") * D.FOUILLE.niveaux[0].taps));
  assert.strictEqual(E.state.intu - intu0, 1);
  assert.strictEqual(E.fouilleNiveau("lisiere", "chene"), 1);
  assert.strictEqual(E.fouilleEnCours(), null);
  // la refaire : le butin revient, pas l’Intuition, une phrase d’usage
  E.fouilleLancer("lisiere", 0, 1); T += 31 * 60 * 1000; E.update();
  const i1 = E.state.intu, r2 = E.fouilleRecolter();
  assert.ok(r2.ok && !r2.prem && r2.intu === 0 && E.state.intu === i1);
  // et rien n’expire : un an plus tard, le butin attend
  E.fouilleLancer("lisiere", 0, 2); T += 365 * 24 * H; E.update();
  assert.ok(E.fouilleEnCours().pret);
  assert.ok(E.fouilleRecolter().ok);
});
test("Fouille : une absence de douze heures termine une fouille de huit, par le rattrapage", () => {
  const E = fouilleur();
  E.state.meta.fouilles["lisiere:chene"] = 2;
  assert.ok(E.fouilleLancer("lisiere", 0, 3).ok);
  T += 12 * H;
  let prete = 0; E.on("fouillePrete", () => prete++);
  let off = null; E.on("offline", (o) => (off = o));
  E.update(); // plus de 5 s d’écart : E.catchUp
  assert.ok(off && off.dt >= 3600, "le rattrapage a eu lieu");
  assert.strictEqual(prete, 1);
  const r = E.fouilleRecolter();
  assert.ok(r.ok && r.lvl === 3 && r.prem && r.intu === D.FOUILLE.niveaux[2].intu);
  assert.ok(r.cote && r.cote.id === "ronds", "le Chêne, à fond, ouvre un lieu d’à côté");
  // rattrapage direct, sans passer par update
  const E2 = fouilleur(); E2.fouilleLancer("lisiere", 0, 1); T += 3 * H; E2.catchUp(3 * H);
  assert.ok(E2.fouilleEnCours().pret);
  // l’horloge qui recule ne bloque rien
  const E3 = fouilleur(); E3.fouilleLancer("lisiere", 0, 1); T -= 5 * H; E3.update();
  assert.ok(E3.fouilleEnCours().left <= 1800);
  T += 5 * H;
});
test("Fouille : seul un lieu d’origine ouvre un lieu d’à côté, une seule fois, et on s’y rend à part", () => {
  const E = fouilleur();
  E.state.meta.fouilles["lisiere:chene"] = 2;
  E.state.exp.done.lisiere = 2; E.state.meta.fouilles["lisiere:grotte"] = 2;
  E.fouilleLancer("lisiere", 1, 3); T += 9 * H; E.update();
  assert.strictEqual(E.fouilleRecolter().cote, null, "la Grotte n’ouvre rien");
  assert.strictEqual(E.startExp("lisiere", "ronds").why, "none", "pas avant de l’avoir trouvé");
  E.fouilleLancer("lisiere", 0, 3); T += 9 * H; E.update();
  assert.strictEqual(E.fouilleRecolter().cote.id, "ronds");
  assert.strictEqual(E.coteEtat("lisiere", "ronds"), 1);
  E.fouilleLancer("lisiere", 0, 3); T += 9 * H; E.update();
  assert.strictEqual(E.fouilleRecolter().cote, null, "il ne s’ouvre qu’une fois");
  // la file des explorations ne bouge pas, et le lieu d’à côté s’explore avec son frag
  const done0 = E.state.exp.done.lisiere;
  assert.strictEqual(E.nextExp("lisiere").x.id, "cercle");
  assert.ok(E.startExp("lisiere", "ronds").ok);
  T += 120 * 1000; E.update();
  assert.strictEqual(E.state.exp.done.lisiere, done0, "hors file");
  assert.strictEqual(E.coteEtat("lisiere", "ronds"), 2);
  assert.ok(E.state.frags.ronds && E.cond({ exp: "lisiere:ronds" }));
  // et il se fouille à son tour
  const ic = D.ZONES[0].exps.findIndex((x) => x.id === "ronds");
  assert.ok(E.fouilleLancer("lisiere", ic, 1).ok);
});
test("Fouille : l’état se sauvegarde, traverse la relève, et un champ abîmé est écarté sans rien casser", () => {
  const E = fouilleur();
  E.fouilleLancer("lisiere", 0, 1);
  const E2 = mk(); E2.load(E.serialize());
  assert.deepStrictEqual(E2.state.meta.exlong, E.state.meta.exlong);
  E2.newCycle();
  assert.ok(E2.fouilleEnCours(), "la fouille traverse la relève");
  T += H; E2.update();
  assert.ok(E2.fouilleRecolter().ok, "et se reçoit dans l’éveil suivant");
  assert.strictEqual(E2.fouilleNiveau("lisiere", "chene"), 1, "le niveau atteint reste");
  for (const mauvais of ["x", 4, [], { z: "nulle part", x: "chene", lvl: 1, t0: 5, dur: 5 }, { z: "lisiere", x: "chene", lvl: 9, t0: 5, dur: 5 }, { z: "lisiere", x: "chene", lvl: 1, t0: "a", dur: 5 }]) {
    const o = JSON.parse(E.serialize()); o.meta.exlong = mauvais; o.meta.fouilles = [1]; o.meta.cotes = { "lisiere:ronds": 7, "lisiere:ronds2": 1 };
    const E3 = mk(); E3.load(JSON.stringify(o));
    assert.strictEqual(E3.state.meta.exlong, null);
    assert.deepStrictEqual(E3.state.meta.fouilles, {});
    assert.deepStrictEqual(E3.state.meta.cotes, { "lisiere:ronds2": 1 });
  }
  // une sauvegarde d’avant les fouilles
  const o = JSON.parse(E.serialize()); delete o.meta.exlong; delete o.meta.fouilles; delete o.meta.cotes;
  const E4 = mk(); E4.load(JSON.stringify(o));
  assert.strictEqual(E4.state.meta.exlong, null);
  assert.deepStrictEqual([E4.state.meta.fouilles, E4.state.meta.cotes], [{}, {}]);
  E4.state.exp.done.lisiere = 0;
  assert.strictEqual(E4.fouilleLancer("lisiere", 0, 1).why, "lieu", "rien d’exploré dans cet éveil : rien à fouiller");
});

/* ---------------------------------------------------------------- les dons de la relève (0.9) */
console.log("Dons, jours de présence, seuils");
/* une partie qui vient d’être relevée : cycle 2, trois dons proposés */
const releve = (rand) => { const E = createEngine({ now: () => T, rand: rand || (() => 0.37) }); E.newCycle(); return E; };
const lire = (E) => { const F = createEngine({ now: () => T, rand: () => 0.37 }); F.load(E.serialize()); return F; };
test("dons : pas de don au cycle 1, trois dons distincts dès la première relève", () => {
  const E = mk();
  assert.deepStrictEqual(E.donsOffre(), []);
  E.newCycle();
  const o = E.donsOffre();
  assert.strictEqual(o.length, 3);
  assert.strictEqual(new Set(o).size, 3, "trois dons distincts");
  assert.ok(o.every((id) => D.DONS.some((d) => d.id === id)));
  assert.strictEqual(E.don(), null, "rien n’est pris tant qu’on n’a pas choisi");
});
test("dons : le tirage ne dépend que du cycle et de la graine", () => {
  const E = releve();
  const g = E.state.meta.graine;
  assert.ok(g >= 1);
  assert.deepStrictEqual(E.donsTirage(2, g), E.donsOffre(), "ce qui est offert est le tirage du cycle");
  assert.deepStrictEqual(E.donsTirage(5, g), E.donsTirage(5, g));
  assert.deepStrictEqual(lire(E).donsOffre(), E.donsOffre(), "recharger donne les mêmes trois");
  // une autre graine ou un autre cycle : en général d’autres dons
  const vus = new Set();
  for (let c = 2; c < 30; c++) vus.add(E.donsTirage(c, g).join());
  assert.ok(vus.size > 10, "les cycles ne tirent pas tous la même chose");
  assert.notDeepStrictEqual(E.donsTirage(2, g), E.donsTirage(2, g + 1));
  // tous les dons sortent un jour
  const sortis = new Set();
  for (let s = 1; s < 200; s++) E.donsTirage(2, s).forEach((id) => sortis.add(id));
  assert.strictEqual(sortis.size, D.DONS.length);
});
test("dons : on en garde un seul, et il faut qu’il soit offert", () => {
  const E = releve();
  const [a, b] = E.donsOffre();
  const hors = D.DONS.map((d) => d.id).find((id) => !E.donsOffre().includes(id));
  assert.strictEqual(E.donChoose(hors), false, "un don non offert est refusé");
  assert.strictEqual(E.donChoose("n’existe pas"), false);
  assert.strictEqual(E.donChoose(a), true);
  assert.deepStrictEqual(E.state.don, { id: a, cycle: 2 });
  assert.strictEqual(E.donChoose(b), false, "un seul don par cycle");
  assert.deepStrictEqual(E.donsOffre(), []);
  assert.strictEqual(E.don().id, a);
});
/* donne un don précis à une partie au cycle 2 */
const avecDon = (id) => { const E = releve(); E.state.donsOffre = [id]; assert.ok(E.donChoose(id)); return E; };
test("dons : chaque don a une phrase chiffrée et un effet connu", () => {
  const ids = new Set();
  D.DONS.forEach((d) => {
    assert.ok(!ids.has(d.id)); ids.add(d.id);
    assert.ok(d.n && d.ic && /\d/.test(d.d), d.id + " : nom, icône, phrase avec un chiffre");
    assert.ok(Object.keys(d.e).length === 1, d.id + " : un seul effet");
    assert.ok(!/[—–]/.test(d.d + d.n), d.id + " : pas de tiret cadratin");
  });
  assert.ok(D.DONS.length >= 15 && D.DONS.length <= 20);
  // le pourcentage de la phrase est celui de l’effet
  D.DONS.forEach((d) => {
    const e = d.e, v = (e.tap && e.tap.v) || (e.ext && e.ext.v) || e.mach || e.intu || e.veille || e.vente || (e.mains && 2 - e.mains) || (e.pass && 2 - e.pass) || (e.crit && 1 + e.crit);
    if (!v) return;
    const pc = Math.round((v - 1) * 100);
    assert.ok(new RegExp("\\b" + pc + " %").test(d.d), d.id + " : " + pc + " % dans « " + d.d + " »");
    assert.ok(pc >= 12 && pc <= 40, d.id + " : un effet de 12 à 40 %");
  });
});
test("dons : la récolte à la main d’un groupe de ressources, terre par terre", () => {
  const E = mk();
  E.state.zones.plaine = true; E.state.zones.riviere = true;
  const base = { bois: E.tapYield("bois", "lisiere"), caillou: E.tapYield("caillou", "lisiere"), os: E.tapYield("os", "plaine"), argile: E.tapYield("argile", "riviere") };
  const F = createEngine({ now: () => T, rand: () => 0.99 });
  F.load(E.serialize()); F.newCycle(); F.state.zones.plaine = true; F.state.zones.riviere = true;
  F.state.donsOffre = ["hache"]; F.donChoose("hache");
  assert.ok(Math.abs(F.tapYield("bois", "lisiere") - base.bois * 1.3) < 1e-9);
  assert.ok(Math.abs(F.tapYield("os", "plaine") - base.os * 1.3) < 1e-9);
  assert.strictEqual(F.tapYield("caillou", "lisiere"), base.caillou, "le caillou n’est pas dans le groupe");
  assert.strictEqual(F.tapYield("argile", "riviere"), base.argile);
  F.state.don = null; F.state.donsOffre = ["pierre"]; F.donChoose("pierre");
  assert.ok(Math.abs(F.tapYield("caillou", "lisiere") - base.caillou * 1.3) < 1e-9);
  assert.strictEqual(F.tapYield("bois", "lisiere"), base.bois);
  F.state.don = null; F.state.donsOffre = ["mains_pleines"]; F.donChoose("mains_pleines");
  assert.ok(Math.abs(F.tapYield("bois", "lisiere") - base.bois * D.DONS.find((d) => d.id === "mains_pleines").e.tap.v) < 1e-9);
});
test("dons : extracteurs d’une terre ou de toutes", () => {
  const mise = (don) => {
    const E = don ? avecDon(don) : releve();
    E.state.zones.plaine = true; E.state.zones.riviere = true; E.state.zones.mine = true;
    E.add("cabane", 3); E.add("nasse", 3);
    E.domExtSet("lisiere", "bois", "cabane", 3); E.domExtSet("riviere", "argile", "nasse", 3);
    return [E.extOut(E.domExt("lisiere", "bois")), E.extOut(E.domExt("riviere", "argile"))];
  };
  const [l0, r0] = mise(null);
  const [l1, r1] = mise("rigoles");
  assert.ok(Math.abs(l1 / l0 - 1.3) < 1e-9 && Math.abs(r1 / r0 - 1.3) < 1e-9, "les rigoles : Lisière et Rivière");
  const [l2, r2] = mise("puits_noir");
  assert.ok(l2 === l0 && r2 === r0, "le puits noir ne touche ni la Lisière ni la Rivière");
  const [l3, r3] = mise("bras");
  assert.ok(Math.abs(l3 / l0 - 1.15) < 1e-9 && Math.abs(r3 / r0 - 1.15) < 1e-9, "les bras : partout");
});
test("dons : prix des passages, durée des mains, chance de coup double, vente", () => {
  const E0 = releve(), E1 = avecDon("route");
  assert.strictEqual(E1.passCost("plaine").bois, Math.ceil(E0.passCost("plaine").bois * 0.85) , "passages −15 %");
  const H0 = E0.handTime("manche"), H1 = avecDon("doigts").handTime("manche");
  assert.ok(Math.abs(H1 / H0 - 0.8) < 1e-9, "fabrications à la main −20 %");
  // coup double : un tirage de 0,15 rate sans don (6 %) et réussit avec le don (6 + 12 = 18 %)
  const R = (id) => { const E = createEngine({ now: () => T, rand: () => 0.15 }); E.newCycle(); if (id) { E.state.donsOffre = [id]; E.donChoose(id); } E.tap("bois"); return E.lastCrit; };
  assert.strictEqual(R(null), false); assert.strictEqual(R("main_heureuse"), true);
  // vente au Troqueur
  const V = (id) => { const E = id ? avecDon(id) : releve(); E.add("bois", 100); return E.sellQuote("bois", 100); };
  assert.ok(Math.abs(V("bourse") / V(null) - 1.25) < 1e-9, "vente +25 %");
  assert.strictEqual(avecDon("sommeil").donMul("veille"), 1.25);
  assert.strictEqual(avecDon("burette").donMul("mach"), 1.2);
});
test("dons : l’Intuition en plus, et le sac lourd", () => {
  const E = avecDon("carnet_cornu"), i0 = E.state.intu;
  ["tailler", "tresser", "chauffer", "assembler"].forEach(() => {});
  // quatre recettes apprises : 4 + 30 % de 4 = 5,2 → 5
  const ids = Object.keys(D.ITEMS).filter((id) => D.ITEMS[id].r && !D.ITEMS[id].sec && !E.state.known[id]).slice(0, 10);
  ids.forEach((id) => E.learn(id));
  assert.strictEqual(E.state.intu - i0, 13, "10 recettes : 10 + 3 en plus");
  const S = avecDon("sac_lourd");
  assert.strictEqual(S.count("bois") - releve().count("bois"), 40);
  assert.strictEqual(S.count("corde") - releve().count("corde"), 4);
});
test("dons : sauvegarde, aller-retour et sauvegarde ancienne", () => {
  const E = releve(), offre = E.donsOffre().slice();
  const F = lire(E);
  assert.deepStrictEqual(F.donsOffre(), offre); assert.strictEqual(F.state.meta.graine, E.state.meta.graine);
  E.donChoose(offre[1]);
  const G = lire(E);
  assert.deepStrictEqual(G.state.don, { id: offre[1], cycle: 2 }); assert.deepStrictEqual(G.donsOffre(), []);
  assert.ok(Math.abs(G.donMul("x") - 1) < 1e-9);
  // une ancienne partie : aucun don offert avant la prochaine relève
  const o = JSON.parse(mk().serialize());
  delete o.don; delete o.donsOffre; delete o.meta.graine; o.cycle = 3;
  const H = createEngine({ now: () => T, rand: () => 0.37 }); H.load(JSON.stringify(o));
  assert.strictEqual(H.state.don, null); assert.deepStrictEqual(H.donsOffre(), []);
  H.newCycle();
  assert.strictEqual(H.donsOffre().length, 3, "la prochaine relève en offre");
  assert.ok(H.state.meta.graine >= 1);
  // des valeurs illisibles : remises à zéro, jamais une erreur
  for (const [d, of, g] of [["x", "y", "z"], [7, 7, -1], [{ id: "nope", cycle: 2 }, ["a", "b"], 1.5], [{ id: "hache", cycle: 9 }, [], 3], [[], { 0: "hache" }, null]]) {
    const p = JSON.parse(E.serialize()); p.don = d; p.donsOffre = of; p.meta.graine = g;
    const X = createEngine({ now: () => T, rand: () => 0.37 }); X.load(JSON.stringify(p));
    assert.strictEqual(X.state.don, null); assert.deepStrictEqual(X.donsOffre(), []);
    assert.ok(Number.isInteger(X.state.meta.graine) && X.state.meta.graine >= 0);
  }
  // les identifiants inconnus sont écartés, les bons gardés, sans doublon
  const p = JSON.parse(F.serialize()); p.donsOffre = [offre[0], "inconnu", offre[0], offre[2]];
  const Y = createEngine({ now: () => T, rand: () => 0.37 }); Y.load(JSON.stringify(p));
  assert.deepStrictEqual(Y.donsOffre(), [offre[0], offre[2]]);
});
test("dons : le don n’est pas reconduit à la relève suivante", () => {
  const E = releve(), a = E.donsOffre()[0];
  E.donChoose(a);
  E.add("bois", 5);
  E.newCycle();
  assert.strictEqual(E.state.cycle, 3);
  assert.strictEqual(E.don(), null, "le don du cycle 2 s’arrête là");
  assert.strictEqual(E.donMul("mach"), 1);
  assert.deepStrictEqual(E.donsOffre(), E.donsTirage(3, E.state.meta.graine));
  assert.ok(E.state.meta.graine >= 1, "la graine, elle, est gardée");
  // un don pris puis oublié ne change plus rien aux chiffres
  const F = releve(); F.donChoose("hache"); F.newCycle();
  assert.strictEqual(F.tapYield("bois", "lisiere"), mk().tapYield("bois", "lisiere"));
});

/* ---------------------------------------------------------------- les jours de présence (0.9) */
const jour = (y, m, d, h, mi) => new Date(y, m - 1, d, h || 12, mi || 0).getTime();
const Tsave = T;
test("jours : deux jours d’affilée, un cadeau chacun, une seule fois par jour", () => {
  T = jour(2026, 3, 10, 9);
  const E = mk(), i0 = E.state.intu;
  const g1 = E.jourVenu();
  assert.deepStrictEqual([E.jours().n, g1.intu, g1.tr], [1, D.JOURS.base.intu, D.JOURS.base.tr]);
  assert.strictEqual(E.state.intu - i0, D.JOURS.base.intu);
  assert.strictEqual(E.state.meta.traces, D.JOURS.base.tr);
  T = jour(2026, 3, 10, 22);
  assert.strictEqual(E.jourVenu(), null, "même jour : rien");
  E.update(); assert.strictEqual(E.jours().n, 1);
  T = jour(2026, 3, 11, 7);
  E.jourVenu();
  assert.strictEqual(E.jours().n, 2); assert.strictEqual(E.state.meta.traces, 2 * D.JOURS.base.tr);
});
test("jours : trois jours manqués ne retirent rien", () => {
  T = jour(2026, 5, 1);
  const E = mk(); E.jourVenu(); E.jourVenu();
  T = jour(2026, 5, 5);
  const t0 = E.state.meta.traces;
  E.jourVenu();
  assert.strictEqual(E.jours().n, 2, "jours 1 et 5 : deux jours de présence");
  assert.strictEqual(E.state.meta.traces, t0 + D.JOURS.base.tr, "pas de rattrapage, pas de retrait");
  T = jour(2026, 5, 6); E.jourVenu();
  assert.strictEqual(E.jours().n, 3);
  assert.strictEqual(E.jours().cadeau.intu, D.JOURS.paliers[3].intu, "le troisième jour est un palier");
});
test("jours : le changement d’heure ne compte ni jour de plus ni jour de moins", () => {
  // nuit du passage à l’heure d’été (29 mars 2026) puis à l’heure d’hiver (25 octobre 2026)
  T = jour(2026, 3, 28, 23, 30);
  const E = mk(); E.jourVenu();
  T = jour(2026, 3, 29, 0, 10); E.jourVenu();       // 40 minutes plus tard : un autre jour
  assert.strictEqual(E.jours().n, 2);
  T = jour(2026, 3, 29, 23, 50); E.jourVenu();      // la journée de 23 h : toujours le même jour
  assert.strictEqual(E.jours().n, 2);
  T = jour(2026, 10, 25, 0, 30); E.jourVenu();
  T = jour(2026, 10, 25, 23, 0); E.jourVenu();      // la journée de 25 h : un seul jour
  assert.strictEqual(E.jours().n, 3);
  T = jour(2026, 10, 26, 0, 5); E.jourVenu();
  assert.strictEqual(E.jours().n, 4);
  // une horloge qui recule ne retire rien
  T = jour(2026, 10, 20); assert.strictEqual(E.jourVenu(), null);
  assert.strictEqual(E.jours().n, 4);
});
test("jours : les paliers donnent plus, et la relève ne touche pas au compteur", () => {
  T = jour(2026, 6, 1);
  const E = mk(); const gifts = {};
  for (let i = 1; i <= 100; i++) { T = jour(2026, 6, i); const g = E.jourVenu(); gifts[i] = g; }
  assert.strictEqual(E.jours().n, 100);
  Object.keys(D.JOURS.paliers).forEach((n) => {
    assert.ok(gifts[n].intu > D.JOURS.base.intu && gifts[n].tr > D.JOURS.base.tr, "jour " + n + " : plus généreux");
    assert.deepStrictEqual([gifts[n].intu, gifts[n].tr], [D.JOURS.paliers[n].intu, D.JOURS.paliers[n].tr]);
  });
  assert.strictEqual(gifts[4].intu, D.JOURS.base.intu);
  assert.ok(gifts[7].t, "un clin d’œil au septième jour");
  assert.strictEqual(E.jourProchain(), 0);
  E.newCycle();
  assert.strictEqual(E.jours().n, 100, "gardé à la relève");
  assert.strictEqual(lire(E).jours().n, 100, "gardé dans la sauvegarde");
});
test("jours : sauvegarde ancienne ou abîmée, remise à zéro sans erreur", () => {
  T = jour(2026, 7, 1);
  const E = mk(); E.jourVenu();
  const o = JSON.parse(E.serialize()); delete o.meta.jours;
  const F = createEngine({ now: () => T }); F.load(JSON.stringify(o));
  assert.deepStrictEqual(F.jours(), { n: 0, dernier: "", cadeau: null }, "une ancienne partie repart de zéro");
  F.jourVenu(); assert.strictEqual(F.jours().n, 1);
  for (const m of ["x", 4, [], { n: "a", dernier: 5, cadeau: 3 }, { n: -2, dernier: "hier", cadeau: [] }, { n: 3.7, dernier: "2026-07-01", cadeau: { intu: "x" } }]) {
    const p = JSON.parse(E.serialize()); p.meta.jours = m;
    const X = createEngine({ now: () => T }); X.load(JSON.stringify(p));
    const j = X.jours();
    assert.ok(Number.isInteger(j.n) && j.n >= 0 && typeof j.dernier === "string" && (j.dernier === "" || /^\d{4}-\d{2}-\d{2}$/.test(j.dernier)));
    assert.ok(j.cadeau === null || (Number.isInteger(j.cadeau.intu) && Number.isInteger(j.cadeau.tr)));
  }
  assert.strictEqual(lire(E).jours().n, 1, "aller-retour");
  assert.strictEqual(lire(E).jourVenu(), null, "relancer le même jour ne redonne rien");
});
T = Tsave;

/* ---------------------------------------------------------------- les seuils par gisement (0.9) */
test("seuils : 10, 25, 50, 100 extracteurs, ×1,25 à chaque seuil", () => {
  const E = mk();
  E.add("cabane", 120);
  const sortie = (n) => { E.domExtSet("lisiere", "bois", "cabane", n); return E.extOut(E.domExt("lisiere", "bois")) / n; };
  const u = sortie(1);
  assert.deepStrictEqual(D.SEUILS.paliers, [10, 25, 50, 100]);
  [[9, 1], [10, 1.25], [24, 1.25], [25, 1.5625], [49, 1.5625], [50, 1.953125], [99, 1.953125], [100, 2.44140625], [120, 2.44140625]].forEach(([n, k]) => {
    assert.ok(Math.abs(sortie(n) / u - k) < 1e-9, n + " extracteurs : ×" + k);
  });
  assert.deepStrictEqual(E.seuil(E.domExt("lisiere", "bois")), { n: 120, k: 4, prochain: 0, mult: 2.44140625, pas: 1.25 });
  E.domExtSet("lisiere", "bois", "cabane", 7);
  const s = E.seuil(E.domExt("lisiere", "bois"));
  assert.deepStrictEqual([s.n, s.prochain, s.k], [7, 10, 0]);
  assert.strictEqual(E.seuil(null).n, 0);
});
test("seuils : la Rivière Lente n’en a pas, et chaque gisement compte à part", () => {
  const E = mk();
  E.state.zones.plaine = true; E.state.zones.riviere = true;
  E.add("nasse", 40); E.add("cabane", 40); E.add("fibre_1", 40);
  E.domExtSet("riviere", "argile", "nasse", 12);
  const r = E.domExt("riviere", "argile");
  assert.deepStrictEqual(E.seuil(r), { n: 12, sans: true });
  const un = E.extRate("nasse", "argile");
  assert.ok(Math.abs(E.extOut(r) - (6 + 6 * 0.5) * un) < 1e-9, "seulement le courant : 6 pleins, 6 à moitié");
  E.domExtSet("lisiere", "bois", "cabane", 10); E.domExtSet("lisiere", "fibre", "fibre_1", 9);
  const bois = E.extOut(E.domExt("lisiere", "bois")) / 10, fibre = E.extOut(E.domExt("lisiere", "fibre")) / 9;
  assert.ok(Math.abs(bois / fibre - 1.25 * E.extRate("cabane", "bois") / E.extRate("fibre_1", "fibre")) < 1e-9, "le seuil du bois ne profite pas à la fibre");
});
/* visiteurs de passage et constellations : fichiers à part */
require("./test-visiteurs.js");
require("./test-figures.js");
require("./test-arbre.js");
require("./test-densite.js");
require("./test-carnet.js");
require("./test-guidage.js");
require("./test-juice.js");
require("./test-appareil.js");
require("./test-renaissance.js");
require("./test-comptoir.js");
require("./test-stockage.js");

console.log("La file des fenêtres automatiques (0.13.3)");
const Fen = require("../js/fenetres.js");
function fileFen(etat) { return Fen.create({ libre: () => !etat.ouvert, now: () => etat.t }); }
test("une fenêtre automatique s’ouvre tout de suite si rien n’est ouvert", () => {
  const etat = { t: 1000, ouvert: false }, vu = [];
  const f = fileFen(etat);
  f.demande(Fen.PRIO.retour, "retour", () => { vu.push("retour"); etat.ouvert = true; });
  assert.deepStrictEqual(vu, ["retour"]);
  assert.deepStrictEqual(f.attente(), []);
});
test("pas d’ouverture pendant qu’une fenêtre est ouverte ; l’ordre suit la priorité, pas la demande", () => {
  const etat = { t: 1000, ouvert: true }, vu = [];
  const f = fileFen(etat);
  const ouvre = (nom) => () => { vu.push(nom); etat.ouvert = true; };
  f.demande(Fen.PRIO.retour, "retour", ouvre("retour"));
  f.demande(Fen.PRIO.nouveautes, "nouveautes", ouvre("nouveautes"));
  f.demande(Fen.PRIO.sauvegarde, "sauvegarde", ouvre("sauvegarde"));
  assert.deepStrictEqual(vu, [], "rien tant qu’une fenêtre est ouverte");
  assert.deepStrictEqual(f.attente(), ["sauvegarde", "nouveautes", "retour"]);
  const suivante = () => { etat.ouvert = false; f.ferme(); etat.t += Fen.PAUSE; f.pomper(); };
  etat.ouvert = false; etat.t += Fen.PAUSE; f.pomper();
  suivante(); suivante();
  assert.deepStrictEqual(vu, ["sauvegarde", "nouveautes", "retour"]);
});
test("une pause sépare deux fenêtres ; une même fenêtre n’attend jamais deux fois", () => {
  const etat = { t: 1000, ouvert: false }, vu = [];
  const f = fileFen(etat);
  const ouvre = (nom) => () => { vu.push(nom); etat.ouvert = true; };
  f.demande(Fen.PRIO.nouveautes, "nouveautes", ouvre("nouveautes"));
  assert.strictEqual(f.demande(Fen.PRIO.retour, "retour", ouvre("retour")), true);
  assert.strictEqual(f.demande(Fen.PRIO.retour, "retour", ouvre("retour")), false, "doublon refusé");
  etat.ouvert = false; f.ferme();
  etat.t += Fen.PAUSE - 1; assert.strictEqual(f.pomper(), false, "trop tôt");
  etat.t += 1; assert.strictEqual(f.pomper(), true);
  assert.deepStrictEqual(vu, ["nouveautes", "retour"]);
});
test("le retour d’absence : le message discret et la fenêtre ont leurs seuils (60 s et 5 min)", () => {
  const src = fs.readFileSync(path.join(__dirname, "../js/ecouteurs.js"), "utf8");
  assert.ok(/const ABSENCE_MESSAGE = 60, ABSENCE_FENETRE = 300;/.test(src), "seuils nommés en tête des écouteurs");
  assert.ok(/o\.dt < ABSENCE_MESSAGE/.test(src) && /o\.dt < ABSENCE_FENETRE/.test(src));
});

console.log(passed + " tests réussis" + (process.exitCode ? ", des échecs." : "."));
