/* Atelier par équipements — profil expérimental isolé, Bois à Cuivre.
 * Aucun changement du contenu normal : createData retourne une copie indépendante.
 * Le navigateur normal ne charge pas ce module. */
(function (root) {
  "use strict";
  const clone = (x) => Array.isArray(x) ? x.map(clone) : x && typeof x === "object"
    ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, clone(v)])) : x;

  function createData(base, options = {}) {
    const D = clone(base), I = D.ITEMS;
    const legacyInputs = {};
    for (const id of ["outre", "tunique", "flute", "engrenage_bois"]) legacyInputs[id] = clone(I[id].r[1]);
    // Ces objets deviennent des outils requis, pas des matériaux incorporés.
    for (const id of ["outre", "tunique", "flute"]) delete I[id].r[1].aiguille;
    delete I.engrenage_bois.r[1].eclat;
    // Prix de prototype explicites ; aucune recette existante n'est supprimée.
    I.percuteur_pierre = { n: "Percuteur de pierre", a: 0, t: "tool", ic: "🪨",
      r: ["assembler", { caillou: 2 }, 1], u: "Prépare le bois, l’os et les éclats de silex.",
      h: "Deux galets de la Lisière : garde celui qui tient bien dans ta main." };
    I.racloir_os = { n: "Racloir en os", a: 1, t: "tool", ic: "🦴",
      r: ["tailler", { os: 3, caillou: 1 }, 1], u: "Découpe les peaux avant l’arrivée du silex.",
      h: "Une esquille d’os, amincie contre la pierre, pourrait séparer la peau en bandes." };
    I.polissoir = { n: "Dalle de polissage", a: 3, t: "tool", ic: "🪨",
      r: ["assembler", { caillou: 8, bois: 4 }, 1], u: "Travaille les surfaces avec du sable, consommé comme abrasif.",
      h: "Une pierre stable sur un support de bois : le sable fera le reste." };
    I.etabli_amenage = {n:"Établi aménagé",a:0,t:"tool",ic:"🪵",r:["assembler",{bois:10,corde:3,caillou:4},1],u:"Un poste stable où installer un ouvrier.",h:"Du bois lié par des cordes, calé sur quelques pierres."};

    /* 0.43 : un seul modèle outil + geste. Le geste d'une recette est celui de la recette (assembler, construire, tresser, tailler,
     * chauffer…) : l'outil dit seulement ce qu'il PERMET. Dans une famille d'outils, le palier le plus haut reprend les recettes du
     * précédent (Racloir puis Couteau, Feu puis Four) et le plus bas disparaît de l'écran quand on possède le plus haut.
     * Les anciens « modes » (doux, vif, étouffée, couper, coudre…) restent compris comme des synonymes du geste (MODES_ANCIENS). */
    const equipment = {
      mains: { n: "Mains", family: "main" },
      percuteur_pierre: { n: "Percuteur de pierre", item: "percuteur_pierre", family: "taille" },
      racloir_os: { n: "Racloir en os", item: "racloir_os", family: "coupe", tier: 1, batch: 5 },
      couteau: { n: "Couteau de silex", item: "couteau", family: "coupe", tier: 2, batch: 10, speed: { laniere: 2 }, benefit: "Couper : 2× plus vite" },
      aiguille: { n: "Aiguille en os", item: "aiguille", family: "couture" },
      feu: { n: "Feu de camp", item: "feu", family: "chauffe", tier: 1 },
      four: { n: "Four en argile", item: "four", family: "chauffe", tier: 2 },
      // plus des outils de départ : leurs recettes passent par l'Atelier (un seul usage chacun). Les objets restent des outils.
      pioche_pierre: { n: "Pioche de pierre", item: "pioche_pierre", family: "taille", hidden: true },
      enclume_pierre: { n: "Station de frappe", item: "enclume_pierre", requires: { percuteur_pierre: 1 }, family: "frappe", hidden: true },
      ciseau: { n: "Ciseau de cuivre", item: "ciseau", family: "taille", hidden: true },
      polissoir: { n: "Dalle de polissage", item: "polissoir", family: "abrasion", hidden: true }
    };
    const recipes = {};
    const put = (ids, eq) => ids.split(" ").forEach(id => { (recipes[id] || (recipes[id] = [])).push({ equipment: eq, mode: I[id].r[0] }); });
    for (const [id, it] of Object.entries(I)) if (it.r && it.a <= 3 && ["assembler", "construire", "tresser"].includes(it.r[0])) put(id, "mains");
    // Remplacer les choix par défaut, sans modifier le geste des recettes.
    for (const id of ["outre", "tunique"]) recipes[id] = [];
    put("outre tunique", "aiguille");
    put("manche aiguille eclat racloir_os", "percuteur_pierre");
    put("laniere", "racloir_os"); put("laniere engrenage_bois statuette", "couteau");
    put("flute", "aiguille");
    put("charbon epieu galette colle_os encre brique", "feu");
    put("charbon epieu galette colle_os encre brique creuset lingot_cuivre lingot_etain", "four");
    for (const id in recipes) for (const c of recipes[id]) { const eq = equipment[c.equipment]; (eq.modes || (eq.modes = {}))[c.mode] = D.GESTES[c.mode].n; }
    for (const id in equipment) equipment[id].modes = equipment[id].modes || {};
    const keys = new Set();
    for (const [id, choices] of Object.entries(recipes)) for (const choice of choices) {
      if (!equipment[choice.equipment] || !Object.hasOwn(equipment[choice.equipment].modes, choice.mode)) throw new Error("Équipement inconnu : " + id);
      const key = choice.equipment + ":" + choice.mode + ":" + Object.keys(I[id].r[1]).sort().join(",");
      if (keys.has(key)) throw new Error("Recettes ambiguës pour cet équipement : " + key);
      keys.add(key);
    }
    D.CRAFT_EQUIPMENT = { equipment, recipes, legacyInputs, fullGame:options.fullGame===true, startEquipment: options.gentleStart === false ? {} : { percuteur_pierre: 1 } };
    // Le parcours strict teste l'amorçage du percuteur. Le parcours progressif
    // conserve le manche comme premier objectif et fournit cet outil de départ.
    if (options.gentleStart === false) D.OBJECTIVES.unshift(["percuteur_pierre", "Assemble deux cailloux de la Lisière pour préparer ton percuteur."]);
    return D;
  }

  /* Les modes d'avant la 0.43, compris comme le geste de la recette qu'ils désignaient (anciennes commandes, anciennes sauvegardes) */
  const MODES_ANCIENS = { doux: "chauffer", vif: "chauffer", etouffee: "chauffer", cuisson: "chauffer", fonte: "chauffer", couper: "tailler", entailler: "tailler", coudre: "assembler", percer: "tailler", equarrir: "tailler", refendre: "tailler", polir: "tailler" };
  const normMode = (m) => MODES_ANCIENS[m] || m;

  function attach(E) {
    const cfg = E.D.CRAFT_EQUIPMENT;
    if (!cfg) return;
    E.normMode = normMode;
    const equipmentItems = new Set(Object.values(cfg.equipment).map(eq => eq.item).filter(Boolean));
    equipmentItems.add("etabli_amenage");
    E.isEquipmentItem = id => equipmentItems.has(id);
    const requirements = (id) => {
      const eq = cfg.equipment[id];
      if (!eq) return null;
      return Object.assign({}, eq.item ? { [eq.item]: 1 } : {}, eq.requires || {});
    };
    const missing = (id, available) => {
      const req = requirements(id);
      if (!req) return null;
      return Object.fromEntries(Object.entries(req).filter(([k, n]) => available(k) < n));
    };
    E.equipmentChoices = (recipe, available) => (cfg.recipes[recipe] || []).map(choice => {
      const lacks = missing(choice.equipment, available || E.count);
      return Object.assign({}, choice, { n: cfg.equipment[choice.equipment].n, missing: lacks, ready: Object.keys(lacks).length === 0 });
    }).sort((a,b) => (cfg.equipment[b.equipment].speed?.[recipe] || 1) - (cfg.equipment[a.equipment].speed?.[recipe] || 1));
    E.equipmentSpeed = (recipe, selection) => {
      if (selection === false) return 1; // Anciennes commandes : conserver leur rythme.
      const choice = selection ? E.equipmentChoices(recipe).find(c=>c.equipment===selection.equipment&&c.mode===normMode(selection.mode)&&c.ready) : E.equipmentChoices(recipe).find(c=>c.ready);
      return choice ? cfg.equipment[choice.equipment].speed?.[recipe] || 1 : 1;
    };
    E.equipmentJobCheck = (recipe, job, available) => {
      const selection = job?.id===recipe && job.equipmentSelection;
      if (!selection) return E.equipmentCheck(recipe, available);
      const lacks = missing(selection.equipment, available || E.count);
      return lacks && Object.keys(lacks).length ? {why:"equipment",equipment:selection.equipment,required:Object.keys(lacks)[0],missing:lacks} : null;
    };
    E.equipmentCheck = (recipe, available) => {
      const choices = E.equipmentChoices(recipe, available);
      if (!choices.length || choices.some(c => c.ready)) return null;
      // Préférer l'équipement le plus précoce pour ne pas guider vers le
      // couteau de la Rivière avant d'avoir fabriqué l'outre.
      choices.sort((a, b) => Math.max(...Object.keys(a.missing).map(k => E.item(k).a)) - Math.max(...Object.keys(b.missing).map(k => E.item(k).a)));
      const c = choices[0];
      return { why: "equipment", equipment: c.equipment, required: Object.keys(c.missing)[0], missing: c.missing };
    };
    E.equipmentList = () => Object.entries(cfg.equipment).filter(([, eq]) => !eq.hidden).map(([id, eq]) => Object.assign({ id, ready: Object.keys(missing(id, E.count)).length === 0 }, eq));
    // Même information que l'étude classique, limitée au geste exact de l'outil.
    // metier (facultatif, 0.55) : on ne compte que les recettes de ce métier (le Labo enferme la découverte dans le métier ouvert)
    E.equipmentHasDiscovery = (id, equipment, mode, metier) => {
      mode = normMode(mode);
      const eq = cfg.equipment[equipment];
      if (!E.state.studied[id] || !eq || !Object.hasOwn(eq.modes, mode) || Object.keys(missing(equipment, E.count)).length) return false;
      const reactions = E.reactions(id, recipe => (cfg.recipes[recipe] || []).some(c => c.equipment === equipment && c.mode === mode) && (!metier || E.atelierDe(recipe) === metier));
      return Object.values(reactions).some(n => n > 0);
    };
    const fixed = new Set(["feu", "four", "enclume_pierre", "polissoir"]);
    E.workplaceFor = id => fixed.has(id) ? id : "etabli";
    E.workplaceList = () => [{ id: "etabli", n: E.count("etabli_amenage")>=1?"Établi aménagé":"Établi", ready: true }, ...E.equipmentList().filter(x => fixed.has(x.id)).map(x => ({ ...x, n: x.id === "feu" ? "Foyer" : x.n }))];
    const matching = (place, ids) => {
      const parts = Array.from(new Set(ids.filter(Boolean))).sort().join(",");
      return Object.keys(cfg.recipes).filter(id => E.ageOK(id) && Object.keys(E.item(id).r[1]).sort().join(",") === parts)
        .flatMap(id => E.equipmentChoices(id).filter(c => E.workplaceFor(c.equipment) === place).map(c => ({ ...c, recipe: id })));
    };
    E.workplaceOptions = (place, ids) => {
      const seen = new Set();
      return matching(place, ids).filter(c => c.ready && !seen.has(c.recipe) && seen.add(c.recipe));
    };
    E.attemptAt = (place, ids) => {
      if (!ids.filter(Boolean).length) return { kind: "empty" };
      if (!E.workplaceList().some(x => x.id === place && x.ready)) return { kind: "equipment", why: "missing", equipment: place };
      const choices = E.workplaceOptions(place, ids);
      if (!choices.length) {
        const unavailable = matching(place, ids)[0];
        return unavailable ? { kind: "equipment", why: "missing", equipment: unavailable.equipment } : { kind: "equipment", why: "incompatible" };
      }
      // Une ambiguïté réelle demande un geste, sans révéler les recettes à découvrir.
      if (choices.length > 1) return { kind: "choice", options: choices.map(c => ({ equipment: c.equipment, mode: c.mode, action: cfg.equipment[c.equipment].modes[c.mode] })) };
      const c = choices[0];
      return { ...E.attemptWith(c.equipment, c.mode, ids), equipment: c.equipment, mode: c.mode };
    };
    E.equipmentRecipe = (equipment, mode, ids) => {
      mode = normMode(mode);
      const eq = cfg.equipment[equipment];
      if (!eq || !Object.hasOwn(eq.modes, mode) || Object.keys(missing(equipment, E.count)).length) return null;
      const parts = Array.from(new Set(ids.filter(Boolean))).sort().join(",");
      return Object.keys(cfg.recipes).find(id => cfg.recipes[id].some(c => c.equipment === equipment && c.mode === mode) && Object.keys(E.item(id).r[1]).sort().join(",") === parts) || null;
    };
    E.equipmentThermometer = (equipment, mode, ids) => {
      mode = normMode(mode);
      const parts = Array.from(new Set((ids || []).filter(Boolean))).sort();
      if (!parts.length) return null;
      const key = parts.join(",");
      const place = E.workplaceFor(equipment);
      // 1. Correspondance exacte sur le même poste (autre mode ou autre outil)
      const samePlace = Object.keys(cfg.recipes).filter(id => E.ageOK(id) && Object.keys(E.item(id).r[1]).sort().join(",") === key && cfg.recipes[id].some(c => E.workplaceFor(c.equipment) === place));
      if (samePlace.length) {
        const c = cfg.recipes[samePlace[0]].find(x => E.workplaceFor(x.equipment) === place) || cfg.recipes[samePlace[0]][0];
        const diffTool = c.equipment !== equipment;
        return {
          heat: "brulant",
          label: "🔥 Brûlant",
          text: diffTool
            ? "Les matières sont exactes sur cette station, mais il te faut un autre outil (" + cfg.equipment[c.equipment].n + ")."
            : "Les matières et l’outil sont exacts : essaie une autre allure ou un autre geste de cet outil."
        };
      }
      // 2. Correspondance exacte sur un autre station
      const otherPlace = Object.keys(cfg.recipes).filter(id => E.ageOK(id) && Object.keys(E.item(id).r[1]).sort().join(",") === key);
      if (otherPlace.length) {
        const c = cfg.recipes[otherPlace[0]][0];
        const targetPlace = E.workplaceList().find(x => x.id === E.workplaceFor(c.equipment))?.n || cfg.equipment[c.equipment].n;
        return {
          heat: "chaud",
          label: "🌡️ Chaud",
          text: "Ces matières forment bien une recette de ton âge, mais sur une autre station (" + targetPlace + ")."
        };
      }
      // 3. Ingrédient superflu : bonnes matières pour cet outil et ce geste, mais matière en trop
      const exactModeSuper = Object.keys(cfg.recipes).filter(id => {
        if (!E.ageOK(id) || E.state.known[id]) return false;
        if (!cfg.recipes[id].some(c => c.equipment === equipment && c.mode === mode)) return false;
        const req = Object.keys(E.item(id).r[1]);
        return req.length >= 2 && req.every(r => parts.includes(r)) && parts.length > req.length;
      });
      if (exactModeSuper.length) {
        return {
          heat: "brulant",
          label: "🔥 Brûlant",
          text: "Cet outil et ce geste reconnaissent ces matières, mais l’une d’entre elles est superflue sur l’établi."
        };
      }
      // 5. Ingrédients partiels pour cet outil et ce geste : préciser le nombre attendu
      const partial = Object.keys(cfg.recipes).filter(id => E.ageOK(id) && !E.state.known[id] && cfg.recipes[id].some(c => c.equipment === equipment && c.mode === mode) && parts.some(p => E.item(id).r[1][p]));
      if (partial.length) {
        const bestCand = partial.map(id => Object.keys(E.item(id).r[1])).sort((a,b) => b.length - a.length)[0];
        const totalCount = bestCand.length;
        const matchedCount = parts.filter(p => bestCand.includes(p)).length;
        const missingCount = Math.max(1, totalCount - matchedCount);
        const textDetail = totalCount > 1
          ? "Cet outil et ce geste travaillent bien ces matières, mais il manque " + missingCount + " ingrédient" + (missingCount > 1 ? "s" : "") + " (" + totalCount + " matières attendues)."
          : "Cet outil et ce geste travaillent bien l’une de ces matières, mais la combinaison d’ingrédients est incomplète.";
        return {
          heat: "tiede",
          label: "🌤️ Tiède",
          text: textDetail
        };
      }
      return {
        heat: "froid",
        label: "❄️ Froid",
        text: "Ce geste ne donne rien avec ces matières. Essaie un autre outil ou une autre combinaison."
      };
    };
    E.attemptWith = (equipment, mode, ids) => {
      mode = normMode(mode);
      const eq = cfg.equipment[equipment];
      if (!eq || !Object.hasOwn(eq.modes, mode)) return { kind: "equipment", why: "mode" };
      if (Object.keys(missing(equipment, E.count)).length) return { kind: "equipment", why: "missing", equipment };
      const parts = Array.from(new Set(ids.filter(Boolean))).sort();
      if (!parts.length) return { kind: "empty" };
      const recipe = E.equipmentRecipe(equipment, mode, parts);
      if (!recipe) return { kind: "equipment", why: "incompatible", equipment, mode, thermo: E.equipmentThermometer(equipment, mode, parts) };
      // Une mauvaise sélection ne doit ni révéler une recette incompatible,
      // ni dépenser de matière, ni contaminer les souvenirs du geste.
      return E.attempt(E.item(recipe).r[0], parts, { equipment, mode });
    };
    (root.EclatAtelierEconomy||require("./atelier-economie.js")).attach(E);
  }
  const API = { createData, attach };
  root.EclatEquipements = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
