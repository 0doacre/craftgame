/* 0.56.1 : le vocabulaire du jeu ne dérive pas. Les écrans s'appellent Terres, Labo, Atelier, Progression, Journal ; on dit « geste » (pas « action »),
 * « pièce » (pas « composant »), « métier » (pas « atelier » pour un métier). Ce test refuse les formules d'avant dans les textes que le joueur lit
 * (hors journal des versions D.CHANGES, qui garde l'histoire, et hors commentaires). */
"use strict";
const assert = require("assert/strict"), fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "js");
let passed = 0;
function test(n, fn) { try { fn(); passed++; console.log("  ✓ " + n); } catch (e) { console.log("  ✗ " + n + "\n    " + (e.stack || e)); process.exitCode = 1; } }
/* le texte d'un fichier sans ses commentaires, et sans le journal des versions */
function lisible(f) {
  let s = fs.readFileSync(path.join(dir, f), "utf8");
  const a = s.indexOf("D.CHANGES = ["); if (a >= 0) { const b = s.indexOf("\n  ];", a); s = s.slice(0, a) + (b > 0 ? s.slice(b) : ""); }
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const FICHIERS = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
const INTERDITS = [
  ["en haut du Domaine", "l'objectif est en haut des Terres"],
  ["Ouvre le Domaine", "l'onglet s'appelle Terres"],
  ["ouvrir le Domaine", "l'onglet s'appelle Terres"],
  ["dans le Domaine, touche", "l'onglet s'appelle Terres"],
  ["Récolte dans le Domaine", "l'onglet s'appelle Terres"],
  ["Voir dans l’arbre", "l'onglet s'appelle Progression"],
  ["Il manque un composant", "on dit pièce"],
  ["Actions et récolte", "on dit gestes"],
  ["Choisis une action", "on dit geste"],
  ["L’atelier est au complet", "un atelier du jeu est un métier"],
  ["← Ateliers", "la page s'appelle Métiers"],
  ["dans le Domaine", "l'onglet s'appelle Terres", ["recit.js", "ambiance.js", "journal.js", "visiteurs.js", "memoire.js"]],
  ["sur la Carte)", "la Carte s'appelle l'Atlas"],
  ["Postes et outils", "au Labo, on dit stations"],
  ["poste de travail", "au Labo, on dit station"],
  ["sur ce poste", "au Labo, on dit station"],
  ["sur un autre poste", "au Labo, on dit station"]
];
console.log("Langage du jeu (0.56.1)");
test("aucune formule d'avant dans les textes lus par le joueur", () => {
  const trouve = [];
  for (const f of FICHIERS) { const s = lisible(f); for (const [mot, pourquoi, sauf] of INTERDITS) if (!(sauf || []).includes(f) && s.includes(mot)) trouve.push(f + " : « " + mot + " » (" + pourquoi + ")"); }
  assert.deepEqual(trouve, []);
});
test("l'aide nomme les cinq écrans d'aujourd'hui et ses mots clés", () => {
  const s = fs.readFileSync(path.join(dir, "compte.js"), "utf8");
  const aide = s.slice(s.indexOf("function openHelp()"), s.indexOf('"Compris");', s.indexOf("function openHelp()")));
  for (const mot of ["<b>Terres.</b>", "<b>Labo.</b>", "<b>Atelier.</b>", "<b>Progression.</b>", "<b>Journal.</b>", "<dt>Métier</dt>", "<dt>Travailleurs</dt>", "<dt>Goulot</dt>", "<dt>Geste, recette</dt>"]) assert.ok(aide.includes(mot), mot);
});
test("typographie : apostrophes courbes et pas de tiret long dans les textes lus par le joueur", () => {
  const trouve = [];
  for (const f of FICHIERS) {
    const s = lisible(f);
    for (const m of s.matchAll(/[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]/g)) trouve.push(f + " : apostrophe droite « " + s.slice(Math.max(0, m.index - 12), m.index + 14) + " »");
    if (s.includes(" — ")) trouve.push(f + " : tiret long");
  }
  assert.deepEqual(trouve, []);
});
console.log(passed + " tests du langage réussis.");
