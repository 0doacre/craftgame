/* ÉCLAT — moteur de jeu.
 * Aucune dépendance au DOM : le même code tourne dans le navigateur et dans les
 * scripts de validation / simulation (tools/).
 */
(function (root) {
  "use strict";
  const BASE_DATA = root.ECLAT_DATA || (typeof require !== "undefined" ? require("./data.js") : null);
  const Territoires = root.EclatTerritoires || require("./territoires.js");

  // Un jeu de données isolé permet d'essayer un autre atelier sans modifier la
  // partie normale, ses index de recettes ni ses règles de sauvegarde.
  function withData(D) {

  const BASE_GESTES = ["assembler", "construire", "tresser", "tailler"];
  const UNIQUE = { tool: 1, stat: 1, upg: 1, curio: 1 };
  const SCALED = { ext: 1, auto: 1, mach: 1 };
  const OFFLINE_CAP = 12 * 3600; // secondes
  const MASTERY = [10, 50, 250, 1000];
  const SAVE_VERSION = D.CRAFT_EQUIPMENT ? 13 : 12;
  // Les commandes préparées avant la 0.21 terminent au prix de leur recette d’origine.
  const INPUTS_020 = {
    moteur_vapeur: { chaudiere: 1, piston: 2, engrenage_acier: 4 },
    plastique: { petrole: 3 }, resine: { petrole: 2, bois: 6 }, caoutchouc: { petrole: 2, charbon: 1 }
  };
  // Les lots engagés avant la 0.36 gardent leurs ingrédients réservés.
  const INPUTS_035 = { lentille: { verre: 1 }, brique_refr: { argile: 2, sable: 2 } };
  /* clés de l’état qui référencent des objets : nettoyées des identifiants inconnus au chargement */
  const ITEM_MAPS = ["inv", "seen", "made", "known", "hints", "pins", "studied"];

  const keyOf = (g, ids) => g + "|" + ids.slice().sort().join(",");

  /* Index des recettes : "geste|a,b,c" -> id de l’objet produit */
  const RECIPES = {};
  for (const id in D.ITEMS) {
    const it = D.ITEMS[id];
    it.id = id;
    if (it.r) {
      const k = keyOf(it.r[0], Object.keys(it.r[1]));
      if (RECIPES[k] && !D.CRAFT_EQUIPMENT) throw new Error("Recette en double : " + k + " (" + RECIPES[k] + " / " + id + ")");
      if (!RECIPES[k] || (D.CRAFT_EQUIPMENT?.fullGame && it.a > 3)) RECIPES[k] = id;
    }
  }
  const ZONES = {};
  D.ZONES.forEach((z) => (ZONES[z.id] = z));
  /* zone d’origine de chaque ressource */
  const RES_ZONE = {};
  D.ZONES.forEach((z) => z.res.forEach((r) => (RES_ZONE[r] = RES_ZONE[r] || z.id)));
  const MACHINES = Object.keys(D.ITEMS).filter((id) => D.ITEMS[id].t === "mach").sort((a, b) => D.ITEMS[a].spd - D.ITEMS[b].spd);
  /* Les gisements de chaque terre : ce qu’on y récolte à la main, puis ce que
   * produisent les extracteurs de la terre. */
  const EXTS = Object.keys(D.ITEMS).filter((id) => D.ITEMS[id].t === "ext");
  /* les terres où se pose un extracteur : celles de sa ressource (le sable est à la Rivière et au Désert) */
  const extZones = (id) => { const it = D.ITEMS[id]; return (it && (it.zs || (it.z ? [it.z] : []))) || []; };
  const ZONE_DEPS = {}; // zone → [{ res, hand }]
  D.ZONES.forEach((z) => {
    const list = z.res.slice();
    EXTS.forEach((id) => { if (extZones(id).includes(z.id)) for (const r in D.ITEMS[id].p) if (!list.includes(r)) list.push(r); });
    ZONE_DEPS[z.id] = list.map((r) => ({ res: r, hand: z.res.includes(r) }));
  });
  /* une ressource qui ne se récolte qu’avec un extracteur (l’uranium, la galène) : sa terre est celle de son extracteur, et le jeu
   * sait lequel la produit (le moins avancé) pour guider vers lui */
  const HAND = {}, EXT_OF = {};
  D.ZONES.forEach((z) => z.res.forEach((r) => (HAND[r] = true)));
  EXTS.slice().sort((a, b) => (D.ITEMS[a].a || 0) - (D.ITEMS[b].a || 0)).forEach((id) => {
    for (const r in D.ITEMS[id].p) { if (!EXT_OF[r]) EXT_OF[r] = id; if (!RES_ZONE[r]) RES_ZONE[r] = extZones(id)[0]; }
  });
  const extKey = (z, res) => z + ":" + res;
  /* avant la 0.17, un extracteur récoltait plusieurs ressources : le niveau qui descend de lui (champ de) et récolte celle-ci */
  const extFrere = (id, res) => { const g = D.ITEMS[id].de || id; return Object.keys(D.ITEMS).find((k) => (k === g || D.ITEMS[k].de === g) && D.ITEMS[k].t === "ext" && D.ITEMS[k].p && D.ITEMS[k].p[res]) || null; };
  /* un extracteur posé met tout son effort sur la matière de son gisement */
  const extRate = (id, r) => { const p = D.ITEMS[id] && D.ITEMS[id].p; return p && p[r] ? p[r] * Object.keys(p).length : 0; };
  /* un extracteur ne travaille que sur les gisements de sa propre terre */
  const extOk = (id, z, r) => !!(D.ITEMS[id] && extZones(id).includes(z) && extRate(id, r) > 0);
  /* Où étaient ces gisements sur la grille de l’ancienne usine (sauvegardes v4 et
   * v5) : ne sert plus qu’à la migration, pour savoir ce qu’exploitait chaque case. */
  const OLD_PATCH = {
    lisiere: [0, -7], plaine: [8, 0], riviere: [0, 8], collines: [-9, 0], mine: [9, -9], desert: [-10, 9],
    gisement: [10, 10], montagnes: [-11, -10], orbite: [0, -16], lune: [17, 0], mercure: [0, 17], caveau: [-17, 0]
  };
  const OLD_DEPOSITS = {}; // "x,y" → { z, res }
  D.ZONES.forEach((z, i) => {
    const far = 20 + i * 3, deps = ZONE_DEPS[z.id];
    const [cx, cy] = OLD_PATCH[z.id] || [Math.round(Math.cos(i * 2.4) * far), Math.round(Math.sin(i * 2.4) * far)];
    deps.forEach((d, j) => (OLD_DEPOSITS[(cx - (deps.length - 1) + 2 * j) + "," + cy] = { z: z.id, res: d.res }));
  });
  /* profondeur d’une recette (0 pour une matière brute) : sert à faire tourner les
   * machines qui font un ingrédient avant celles qui l’utilisent */
  const DEPTH = {};
  const depthOf = (id, seen) => {
    if (DEPTH[id] !== undefined) return DEPTH[id];
    const it = D.ITEMS[id];
    if (!it || !it.r || seen[id]) return 0;
    seen[id] = true;
    let d = 0;
    for (const i in it.r[1]) d = Math.max(d, depthOf(i, seen) + 1);
    return (DEPTH[id] = d);
  };
  for (const id in D.ITEMS) depthOf(id, {});
  const freshDom = () => ({ ext: {}, mach: [], site: {}, ms: {}, seq: 0 });

  function freshState(now) {
    return {
      v: SAVE_VERSION, t: now, start: now,
      ...(D.CRAFT_EQUIPMENT ? { craftProfile: "equipements-v1" } : {}),
      inv: { ...D.CRAFT_EQUIPMENT?.startEquipment },
      seen: Object.fromEntries(Object.keys(D.CRAFT_EQUIPMENT?.startEquipment || {}).map(id => [id, true])),
      made: { ...D.CRAFT_EQUIPMENT?.startEquipment },
      known: Object.fromEntries(Object.keys(D.CRAFT_EQUIPMENT?.startEquipment || {}).map(id => [id, true])), hints: {},
      intu: 3, zones: { lisiere: true }, flags: { ages: {} }, frags: {}, secrets: {},
      exp: { active: null, done: {} }, age: 0, territoires: { produit: {}, accompli: {} },
      dom: freshDom(), pins: {}, track: null, gt: { id: null, p: 0 }, tried: {}, pass: {},
      hand: { q: [], p: 0 }, studied: {}, skills: {}, act: null,
      proj: {}, endings: {},
      ecus: 0, comptoir: { sold: {}, traces: 0, asks: [], next: 0 }, ateliers: {},
      arche: [], term: [], notes: [],
      stats: { taps: 0, crafts: 0, tries: 0, play: 0, cyclePlay: 0, splits: {}, caillouMined: 0, visiteurs: 0, visiteursVus: 0, visiteursClins: 0 },
      visiteur: { next: 0, clins: {} },
      don: null, donsOffre: [],
      cycle: 1, echoes: 0, meta: { endings: {}, capsule: false, capsuleText: "", traces: 0, tracesTotal: 0, maxAge: 0, passEver: {}, mem: {}, ev: {}, ruins: {}, lastSplits: {}, bestSplits: {}, prevBestSplits: {}, lastCycle: null, curios: {}, curioHearts: 0, trans: {}, hints_endings: {}, troqueurDelivered: 0, rituals: {}, fouilles: {}, cotes: {}, exlong: null, jours: { n: 0, dernier: "", cadeau: null }, gestes: {}, gestesVu: {} },
      livre: { p: {}, vu: {} }, revus: {}, questions: {}, repaired: {}, signes: {}, boosts: {},
      eventsSeen: {}, termMode: "arche",
      settings: { sound: true, vibe: true, theme: "auto", largeText: false },
      pipAcc: 0, intuAcc: 0, moon: 0, introSeen: false
    };
  }

  /* Migration d’une sauvegarde vers la version courante. Ne supprime jamais
   * de donnée du joueur : ce qui n’a plus d’usage est rangé dans `orphans`. */
  function migrate(o) {
    const from = o.v || 1;
    if (o.craftProfile && (!D.CRAFT_EQUIPMENT || o.craftProfile !== "equipements-v1")) throw new Error("Cette partie d’essai appartient à un autre atelier.");
    if (from > SAVE_VERSION) throw new Error("Sauvegarde d’une version plus récente du jeu (v" + from + ")");
    if (from < 2) {
      // v1 : les « chaînes d’assemblage » automatisaient des recettes via `auto`.
      // v2 : elles deviennent des machines de la Fabrique, chacune affectée à une ligne.
      o.flags = o.flags || {};
      o.lines = [];
      o.lineSeq = 0;
      const slots = Math.floor((o.inv && o.inv.chaine) || 0);
      (o.auto || []).slice(0, slots).forEach((r) => {
        if (D.ITEMS[r]) o.lines.push({ id: "L" + ++o.lineSeq, r, m: "chaine", n: 1, on: true, cap: 0, acc: 0 });
      });
      if (o.lines.length) o.flags.lineDone = true;
      delete o.auto;
      delete o.autoAcc;
      o.pins = {};
      o.track = null;
      o.gt = { id: null, t: 0 };
      o.flags.news = "2";
      o.v = 2;
    }
    if (from < 3) {
      // v3 : la Fabrique devient une usine sur grille. Chaque ligne de production
      // devient une machine posée le long d’un tapis qui fait le tour de la Réserve.
      o.flags = o.flags || {};
      const r = fabFromLines(o.lines || []);
      o.fab = r.fab;
      if (r.placed || r.left) o.flags.fab3 = { placed: r.placed, left: r.left };
      delete o.lines;
      delete o.lineSeq;
      o.flags.news = "3";
      o.v = 3;
    }
    if (from < 4) {
      // v4 : les extracteurs ne récoltent plus « tout seuls » : ils travaillent posés
      // sur les gisements de la Fabrique. Ceux du joueur y sont posés et reliés à la
      // Réserve au chargement (voir E.load), pour que rien ne s’arrête.
      o.flags = o.flags || {};
      if (EXTS.some((t) => o.inv && o.inv[t] >= 1)) o.flags.fab4 = "todo";
      o.flags.news = "4";
      o.v = 4;
    }
    if (from < 5) {
      // v5 : la file des mains et l’étude des matières (ajoutées vides au chargement).
      // Un Grand Œuvre commencé garde ce qui a été versé ; il se poursuit désormais
      // par un chantier posé sur la carte, ce que la fenêtre des nouveautés explique.
      o.flags = o.flags || {};
      const proj = o.proj && typeof o.proj === "object" ? o.proj : {};
      if (Object.keys(proj).some((p) => proj[p] && (proj[p].step > 0 || Object.keys(proj[p].paid || {}).length))) o.flags.v5proj = true;
      o.flags.news = "5";
      o.v = 5;
    }
    if (from < 6) {
      // v6 : plus de grille ni de tapis. Les extracteurs, les machines et les chantiers
      // passent dans le Domaine (voir domFromFab) ; l’ancienne usine est gardée de côté.
      o.flags = o.flags || {};
      o.dom = domFromFab(o);
      if (o.fab && o.fab.c && Object.keys(o.fab.c).length) { o.orphans = o.orphans || {}; o.orphans.fab5 = o.fab; }
      delete o.fab;
      if (o.settings && typeof o.settings === "object") delete o.settings.usine;
      o.flags.news = "6";
      o.v = 6;
    }
    if (from < 7) {
      // v7 (0.7.2) : le Grand Œuvre caché a changé d’étapes en 6.5. Une partie d’avant
      // (flags.ver < 6.5) qui l’avait entamé repart de sa première étape, ce qu’elle y
      // avait mis revient à la Réserve. Le passage de version déclenche la copie de sécurité.
      const ver = String((o.flags && o.flags.ver) || "");
      const m = ver.match(/^(\d+)\.(\d+)/);
      const ancien = !m || Number(m[1]) < 6 || (Number(m[1]) === 6 && Number(m[2]) < 5);
      const ps = o.proj && o.proj.chant;
      if (ancien && ps && (ps.step | 0) < 3) {
        o.inv = o.inv || {};
        for (const i in ps.paid || {}) o.inv[i] = (o.inv[i] || 0) + (Number(ps.paid[i]) || 0);
        o.proj.chant = { step: 0, paid: {} };
      }
      o.v = 7;
    }
    if (from < 8) {
      // v8 : un extracteur par ressource (voir D.LIGNES). Le passage des exemplaires posés sur une autre ressource que celle
      // de leur objet vers le niveau frère se fait au chargement (checkDom), pour toutes les vieilles sauvegardes.
      o.v = 8;
    }
    if (from < 9) {
      // v9 : un âge de plus, la Vapeur, entre l’Acier (6) et l’Électricité. Tout âge d’avant 7 reste, les autres avancent d’un rang.
      // Qui a dépassé l’Acier a dépassé la Vapeur : son âge est marqué accompli, sans récompense.
      const apres = (a) => (Number(a) >= 7 ? Number(a) + 1 : Number(a));
      if (typeof o.age === "number") o.age = apres(o.age);
      o.flags = o.flags || {};
      if (o.flags.ages && typeof o.flags.ages === "object") {
        const ages = {};
        for (const k in o.flags.ages) ages[apres(k)] = o.flags.ages[k];
        if (ages[8] || o.age >= 8) ages[7] = 1;
        o.flags.ages = ages;
      }
      const st = o.meta && o.meta.stamps;
      if (st && typeof st === "object") for (const k in st) if (Array.isArray(st[k]) && st[k].length > 2) st[k][2] = apres(st[k][2]);
      o.v = 9;
    }
    if (from < 10) {
      // v10 : un âge de plus, l’Atome, entre l’Électricité (8) et le Silicium. Les âges d’avant 9 restent, les autres avancent d’un rang.
      const apres = (a) => (Number(a) >= 9 ? Number(a) + 1 : Number(a));
      if (typeof o.age === "number") o.age = apres(o.age);
      o.flags = o.flags || {};
      if (o.flags.ages && typeof o.flags.ages === "object") {
        const ages = {};
        for (const k in o.flags.ages) ages[apres(k)] = o.flags.ages[k];
        if (ages[10] || o.age >= 10) ages[9] = 1;
        o.flags.ages = ages;
      }
      const st = o.meta && o.meta.stamps;
      if (st && typeof st === "object") for (const k in st) if (Array.isArray(st[k]) && st[k].length > 2) st[k][2] = apres(st[k][2]);
      o.v = 10;
    }
    if (from < 11) {
      const q = o.hand && o.hand.q;
      if (Array.isArray(q)) q.forEach((j) => {
        if (j && Array.isArray(j.s) && j.s.some((s) => Array.isArray(s) && INPUTS_020[s[0]])) j.recettes020 = true;
      });
      o.v = 11;
    }
    if (from < 12) {
      const q = o.hand && o.hand.q;
      if (Array.isArray(q)) q.forEach((j) => {
        if (j && Array.isArray(j.s) && j.s.some((s) => Array.isArray(s) && INPUTS_035[s[0]])) j.recettes035 = true;
      });
      o.v = 12;
    }
    if (D.CRAFT_EQUIPMENT && from < 13) {
      const q = o.hand && o.hand.q;
      if (Array.isArray(q)) q.forEach(j => {
        if (!j || !Array.isArray(j.s)) return;
        j.ancienAtelier = true;
        if (j.s.some(s => Array.isArray(s) && D.CRAFT_EQUIPMENT.legacyInputs[s[0]])) j.recettesEquipements = true;
      });
      // Rattrapage des équipements de départ pour une partie déjà jouée.
      // Aucun stock existant ni âge n'est retiré pour financer ce rattrapage.
      if (o.stats && o.stats.crafts > 0) {
        for (const id of ["percuteur_pierre"].concat(o.zones && o.zones.plaine ? ["racloir_os"] : [])) {
          for (const key of ["inv", "made", "known", "seen"]) {
            o[key] = o[key] || {};
            if (!o[key][id]) o[key][id] = key === "inv" || key === "made" ? 1 : true;
          }
        }
      }
      o.v = 13;
    }
    if (D.CRAFT_EQUIPMENT) o.craftProfile = "equipements-v1";
    for (const [id, n] of Object.entries(D.CRAFT_EQUIPMENT?.startEquipment || {})) {
      for (const key of ["inv", "made", "known", "seen"]) {
        o[key] = o[key] || {};
        if (!o[key][id]) o[key][id] = key === "inv" || key === "made" ? n : true;
      }
    }
    return o;
  }

  /* v2 → v3 : chaque ligne de production devenait une machine posée sur la grille
   * de l’usine. La grille n’existe plus : on ne garde que les machines, que la v6
   * range dans le Domaine (voir domFromFab). */
  function fabFromLines(lines) {
    const fab = { c: {}, ms: {}, seq: 0 };
    const live = lines.filter((L) => L && D.ITEMS[L.r] && D.ITEMS[L.m] && D.ITEMS[L.m].t === "mach" && L.n > 0);
    live.forEach((L, i) => {
      fab.c["L" + i] = { k: "mach", id: "M" + ++fab.seq, m: L.m, r: L.r, n: Math.max(1, Math.floor(L.n)), on: L.on !== false, cap: Math.max(0, Math.floor(L.cap) || 0) };
    });
    return { fab, placed: live.length, left: 0 };
  }

  /* rend au stock d’une sauvegarde ce qui était en route (ou le met de côté si l’objet n’existe plus) */
  function backToInv(o, b) {
    if (!b || typeof b !== "object") return;
    for (const i in b) {
      const v = Number(b[i]);
      if (!(v > 0)) continue;
      if (D.ITEMS[i]) o.inv[i] = (o.inv[i] || 0) + v;
      else { o.orphans = o.orphans || {}; (o.orphans.inv = o.orphans.inv || {})[i] = (o.orphans.inv[i] || 0) + v; }
    }
  }
  /* v5 → v6 : la grille disparaît. Chaque exploitation rejoint son gisement, chaque
   * machine devient une chaîne du Domaine, chaque chantier un Grand Œuvre alimenté.
   * Ce que les extracteurs et les chantiers avaient en main rejoint la Réserve. */
  function domFromFab(o) {
    const dom = freshDom(), f = o.fab;
    if (!f || typeof f !== "object" || !f.c || typeof f.c !== "object") return dom;
    const ms = f.ms && typeof f.ms === "object" ? f.ms : {};
    dom.seq = Math.max(0, Math.floor(f.seq) || 0);
    const hasDep = (z, res) => !!z && !!ZONE_DEPS[z] && ZONE_DEPS[z].some((d) => d.res === res);
    for (const k in f.c) {
      const e = f.c[k];
      if (!e || typeof e !== "object") continue;
      const B = typeof e.id === "string" && ms[e.id] && typeof ms[e.id] === "object" ? ms[e.id] : null;
      if (e.k === "ext" && e.u && typeof e.u === "object") {
        let dep = OLD_DEPOSITS[k];
        if (!dep || dep.res !== e.res) {
          // une case qui n’était pas sur son gisement : la terre de ses extracteurs, sinon la première qui l’a
          const z = Object.keys(e.u).map((t) => D.ITEMS[t] && D.ITEMS[t].z).concat([RES_ZONE[e.res]]).find((x) => hasDep(x, e.res)) ||
            D.ZONES.map((x) => x.id).find((x) => hasDep(x, e.res));
          dep = z ? { z, res: e.res } : null;
        }
        if (dep) {
          const x = dom.ext[extKey(dep.z, dep.res)] || (dom.ext[extKey(dep.z, dep.res)] = { z: dep.z, res: dep.res, u: {}, on: false });
          for (const t in e.u) { const n = Math.floor(e.u[t]) || 0; if (n > 0) x.u[t] = (x.u[t] || 0) + n; }
          x.on = x.on || e.on !== false;
        }
        if (B && e.res) backToInv(o, { [e.res]: B.o });
      } else if (e.k === "mach" && typeof e.id === "string") {
        o.flags = o.flags || {};
        o.flags.mach57 = true;
        if (B) {
          backToInv(o, B.b);
          if (e.r) backToInv(o, { [e.r]: B.o });
        }
      } else if (e.k === "site" && typeof e.p === "string") {
        dom.site[e.p] = { on: true };
        if (B) backToInv(o, B.b);
      }
    }
    return dom;
  }

  function createEngine(opts) {
    opts = opts || {};
    const RECIT = opts.recit || D.RECIT || {};
    if (opts.recit && opts.recit.frags) {
      Object.assign(D.FRAGS, opts.recit.frags);
    }
    const now = opts.now || (() => Date.now());
    const rand = opts.rand || Math.random;
    const listeners = {};
    const E = { D, RECIPES, ZONES, RES_ZONE, MACHINES, keyOf, SAVE_VERSION, RECIT };
    let OFF = false; // vrai pendant le rattrapage d’une absence : pas de tirage de clin d’œil
    /* tirée de l’heure, sans toucher au hasard injecté : les simulations et les tests gardent leurs suites de tirages */
    const graineDuJour = () => (Math.floor(now()) % 2147483000) + 1;
    let S = freshState(now());
    S.meta.parcours = 1;
    S.meta.graine = graineDuJour(); // dons de la relève et horaires du Troqueur
    let C = null; // caches dérivés de l’état

    /* ------------------------------------------------------- événements */
    E.on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); };
    E.emit = (evt, a, b) => { (listeners[evt] || []).forEach((fn) => fn(a, b)); };
    Object.defineProperty(E, "state", { get: () => S });

    /* --------------------------------------------------------- outils */
    const item = (id) => D.ITEMS[id];
    const has = (id) => (S.inv[id] || 0) > 0;
    const count = (id) => S.inv[id] || 0;
    const REG = D.REGLES || {}; // une règle par terre (voir data.js)
    const isUnique = (it) => !!UNIQUE[it.t] || (it.t === "relic" && !!it.r);
    const isScaled = (it) => !!SCALED[it.t];
    E.item = item; E.has = has; E.count = count; E.isUnique = isUnique; E.isScaled = isScaled;

    function add(id, n) {
      if (!n) return;
      S.inv[id] = (S.inv[id] || 0) + n;
      if (S.inv[id] < 1e-9) S.inv[id] = 0;
      if (n > 0) markSeen(id);
    }
    /* l’ordre de découverte, pour trier les matières (les anciennes parties ont « true ») */
    function markSeen(id) {
      if (!S.seen[id]) { S.seen[id] = (S.seenSeq = (S.seenSeq || 0) + 1); E.emit("struct"); }
    }
    E.add = add;

    /* --------------------------------- Règles d'Écho des fins (deuxième prestige) */
    E.hasEchoFin = (k) => !!((S.meta && S.meta.endings && S.meta.endings[k] > 0) || (S.endings && S.endings[k]));
    E.activeEchoesFins = () => Object.keys(D.ECHOS_FINS || {}).filter((k) => E.hasEchoFin(k));

    /* -------------------------------------------------- effets dérivés */
    function recalc() {
      const c = { st: {}, heat: 0, tap: {}, auto: {}, intu: 0, exp: 1, pip: 0, aspd: 1, rates: {}, sky: false, arche: false, term: false, signal: false };
      const mulInto = (dst, src) => { for (const k in src) dst[k] = (dst[k] || 1) * src[k]; };
      for (const id in S.inv) {
        if (!(S.inv[id] > 0)) continue;
        const it = item(id); if (!it) continue;
        const e = it.e;
        if (e && isUnique(it)) {
          if (e.st) e.st.forEach((s) => {
            const cur = c.st[s.g] || (c.st[s.g] = { lvl: 0 });
            if (s.heat) cur.heat = Math.max(cur.heat || 0, s.heat);
            cur.lvl = Math.max(cur.lvl, s.lvl || 1);
          });
          if (e.tap) mulInto(c.tap, e.tap);
          if (e.auto) mulInto(c.auto, e.auto);
          if (e.intu) c.intu += e.intu;
          if (e.exp) c.exp *= e.exp;
          if (e.pip) c.pip += e.pip;
          if (e.aspd) c.aspd *= e.aspd;
          if (e.sky) c.sky = true;
          if (e.arche) c.arche = true;
          if (e.term) c.term = true;
          if (e.signal) c.signal = true;
        }
      }
      c.heat = c.st.chauffer ? c.st.chauffer.heat || 0 : 0;
      if (E.hasEchoFin("aube")) {
        c.heat = Math.max(600, c.heat + (c.heat > 0 ? 200 : 0));
      }
      if (E.hasEchoFin("exode")) c.exp *= 2;
      if (E.hasEchoFin("silence")) c.intu += 3;
      if (E.hasEchoFin("retour")) c.aspd *= 1.25;
      if (S.flags.lucioles) c.auto["*"] = (c.auto["*"] || 1) * 1.25;
      if (S.boosts) {
        const curT = now();
        for (const bk in S.boosts) {
          const b = S.boosts[bk];
          if (b && b.until > curT) {
            if (bk === "prod" || bk === "auto") {
              c.auto["*"] = (c.auto["*"] || 1) * (Number(b.mult) || 1);
            }
          }
        }
      }
      c.echo = 1 + 0.5 * (S.echoes || 0);
      C = c;
      return c;
    }
    E.recalc = recalc;
    E.cache = () => C || recalc();

    /* ------------------------------------------------------ gestes */
    function gesteOK(g) {
      if (BASE_GESTES.includes(g)) return true;
      if (g === "chauffer" && E.hasEchoFin("aube")) return true;
      if (g === "accorder") return !!S.flags.berceuse && has("flute");
      return !!E.cache().st[g];
    }
    E.gesteOK = gesteOK;
    E.gestes = () => D.GESTE_ORDER.filter(gesteOK);
    E.heat = () => E.cache().heat;
    E.level = (g) => (E.cache().st[g] ? E.cache().st[g].lvl : 0);

    /* station (non secrète) la moins avancée qui satisfait un geste, une chaleur, un niveau */
    function stationFor(g, heat, lvl) {
      let best = null;
      for (const id in D.ITEMS) {
        const it = D.ITEMS[id];
        if (!it.e || !it.e.st || it.sec) continue;
        for (const s of it.e.st) {
          if (s.g !== g || (heat && (s.heat || 0) < heat) || (lvl && (s.lvl || 1) < lvl)) continue;
          if (!best || it.a < D.ITEMS[best].a) best = id;
        }
      }
      return best;
    }
    E.stationFor = stationFor;

    /* ------------------------------------------------------ zones */
    function zoneOpen(zid) { return !!S.zones[zid]; }
    E.zoneOpen = zoneOpen;
    E.openZones = () => D.ZONES.filter((z) => zoneOpen(z.id));
    function recordSplit(zid) {
      if (!zid || zid === "lisiere") return;
      S.stats = S.stats || {};
      S.stats.splits = S.stats.splits || {};
      if (!S.stats.splits[zid]) {
        const cp = Number(S.stats.cyclePlay);
        S.stats.splits[zid] = Math.max(1, Math.round(Number.isFinite(cp) && cp > 0 ? cp : (S.stats.play || 1)));
      }
    }
    function unlockZone(zid) {
      if (S.zones[zid]) return;
      S.zones[zid] = true;
      recordSplit(zid);
      E.emit("zone", zid);
      E.emit("struct");
    }

    /* ------------------------------------------------------ Mémoire des mains (voir docs/PROGRESSION.md)
     * Les améliorations que les Semeurs se transmettent, achetées avec les Souvenirs. */
    const MEM = {};
    D.MEMOIRE.forEach((m) => (MEM[m.id] = m));
    const memLvl = (id) => (S.meta && S.meta.mem && S.meta.mem[id]) || 0;
    const memV = (id) => MEM[id].v(memLvl(id));
    E.memLvl = memLvl;
    E.memV = memV;
    E.memCost = (id) => MEM[id].cost[memLvl(id)]; // undefined : au maximum
    /* Les Souvenirs ne se dépensent qu’au réveil d’un nouveau Semeur : la fenêtre s’ouvre à la relève et se ferme au bouton « Terminé » ou au premier passage franchi */
    E.achatsOuverts = () => !!(S.meta && S.meta.achats);
    E.fermerAchats = () => { if (S.meta && S.meta.achats) { S.meta.achats = false; E.emit("struct"); } };
    E.memBuy = function (id) {
      const m = MEM[id], c = m && m.cost[memLvl(id)];
      if (!E.achatsOuverts() || c === undefined || S.meta.traces < c) return false;
      S.meta.traces -= c;
      S.meta.mem[id] = memLvl(id) + 1;
      recalc();
      E.emit("struct");
      return true;
    };


    /* ------------------------------------------------------ Les dons de la relève (voir D.DONS)
     * Trois dons tirés au hasard à chaque relève, on en garde un pour ce cycle. Le tirage ne dépend que
     * du numéro de cycle et d’une graine sauvegardée : le rouvrir ou recharger donne les mêmes trois. */
    const DON = {};
    D.DONS.forEach((d) => (DON[d.id] = d));
    const NODON = {};
    const donE = () => (S.don && DON[S.don.id] ? DON[S.don.id].e : NODON);
    E.donDef = (id) => DON[id] || null;
    /* graine et mélange : le même (graine, cycle) rend toujours les mêmes dons */
    function prng(a) {
      return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    E.donsTirage = function (cycle, graine) {
      graine = graine === undefined ? (S.meta && S.meta.graine) || 0 : graine;
      const r = prng((Math.imul(graine | 0, 2654435761) ^ Math.imul((cycle | 0) + 1, 40503)) | 0);
      r(); r();
      const pool = D.DONS.map((d) => d.id);
      const out = [];
      for (let i = 0; i < D.DONS_OFFRE && pool.length; i++) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
      return out;
    };
    /* les dons proposés en ce moment : vide au cycle 1, ou une fois le choix fait */
    E.donsOffre = () => (S.don ? [] : (S.donsOffre || []).filter((id) => DON[id]));
    E.don = () => (S.don && DON[S.don.id] ? DON[S.don.id] : null);
    E.donChoose = function (id) {
      if (S.don || !E.donsOffre().includes(id)) return false;
      S.don = { id, cycle: S.cycle };
      S.donsOffre = [];
      const paq = DON[id].e.paq;
      if (paq) for (const i in paq) { add(i, paq[i]); if (item(i).r) S.made[i] = Math.max(S.made[i] || 0, 1); }
      recalc();
      E.emit("struct");
      return true;
    };
    /* ce que le don change, pour les autres parties du moteur (1 : rien) */
    const donTap = (res) => { const t = donE().tap; return t && (t.r === "*" || t.r.includes(res)) ? t.v : 1; };
    const donExt = (z) => { const t = donE().ext; return t && (t.z === "*" || t.z.includes(z)) ? t.v : 1; };
    const donMul = (k) => donE()[k] || 1;
    function donIntu(n) { // l’Intuition en plus : la part qui n’est pas entière attend dans intuAcc
      const v = donE().intu;
      if (!v || !(n > 0)) return;
      S.intuAcc += n * (v - 1);
      const k = Math.floor(S.intuAcc);
      if (k >= 1) { S.intu += k; S.intuAcc -= k; }
    }
    E.donMul = donMul;

    /* ------------------------------------------------------ Résonances Stellaires (Transcendance) */
    const TRANS = {};
    (D.TRANSCENDANCE || []).forEach((t) => (TRANS[t.id] = t));
    const transLvl = (id) => (S.meta && S.meta.trans && S.meta.trans[id]) || 0;
    const transV = (id) => (TRANS[id] ? TRANS[id].v(transLvl(id)) : 1);
    E.transLvl = transLvl;
    E.transV = transV;
    E.transCost = (id) => (TRANS[id] ? TRANS[id].cost(transLvl(id)) : Infinity);
    E.transBuy = function (id) {
      const t = TRANS[id], c = t && t.cost(transLvl(id));
      if (!E.achatsOuverts() || !t || c === undefined || S.meta.traces < c) return false;
      S.meta.traces -= c;
      S.meta.trans = S.meta.trans || {};
      S.meta.trans[id] = transLvl(id) + 1;
      recalc();
      E.emit("struct");
      return true;
    };

    /* ------------------------------------------------------ Murmures du Temps */
    E.hasEndingHint = (k) => !!(S.meta && S.meta.hints_endings && S.meta.hints_endings[k]);
    E.buyEndingHint = function (k) {
      const cost = D.HINT_ENDING_COST || 75;
      if (!E.achatsOuverts() || E.hasEndingHint(k) || !D.ENDINGS || !D.ENDINGS[k] || S.meta.traces < cost) return false;
      S.meta.traces -= cost;
      S.meta.hints_endings = S.meta.hints_endings || {};
      S.meta.hints_endings[k] = true;
      E.emit("struct");
      return true;
    };

    /* ------------------------------------------------------ passages
     * L’objet qui ouvrait une terre rend son passage possible ; la terre s’ouvre quand
     * le passage est payé. On verse depuis la Réserve, en plusieurs fois si besoin. */
    const PASS = D.PASSAGES;
    function reachZone(zid) {
      if (!PASS[zid]) return unlockZone(zid);
      const p = S.pass[zid] || (S.pass[zid] = { paid: {}, done: false });
      if (p.done) return unlockZone(zid);
      E.emit("passage", zid);
      E.emit("struct");
    }
    E.passCost = function (zid) {
      let k = memV("chemins") * donMul("pass");
      if (E.hasEchoFin("brasier")) k *= 0.85;
      if ((S.cycle || 1) > 1 && ((S.meta && S.meta.maxAge) || 0) >= 3 && S.meta && S.meta.passEver && S.meta.passEver[zid]) k *= 0.7;
      for (const z in REG) {
        const m = REG[z].remise;
        if (m && m.vers === zid) k *= 1 - m.par * Math.min(m.max, (S.exp && S.exp.done && S.exp.done[z]) || 0);
      }
      const out = {};
      for (const i in PASS[zid].cost) out[i] = Math.max(1, Math.ceil(PASS[zid].cost[i] * k));
      return out;
    };
    /* Ce qu’il reste à explorer dans la terre d’avant pour franchir un passage :
     * le chemin se connaît en marchant. Ne comptent pas les lieux cachés, ceux
     * qu’ouvre un objet d’une terre plus lointaine (on ne peut pas les explorer avant),
     * ni les lieux d’à côté (ils s’ouvrent par une fouille). */
    E.passLieux = function (zid) {
      // le premier Semeur cherche son chemin ; les suivants se souviennent de la route
      if (S.cycle > 1) return null;
      const i = D.ZONES.findIndex((z) => z.id === zid), z = i > 0 ? D.ZONES[i - 1] : null;
      if (!z || !z.exps) return null;
      const done = (S.exp && S.exp.done && S.exp.done[z.id]) || 0;
      const req = z.exps.map((x, k) => ({ x, k })).filter((o) => !o.x.hidden && !o.x.need && !o.x.cote); // pas les lieux d’à côté, qui s’ouvrent par une fouille
      const left = req.filter((o) => o.k >= done).map((o) => ({ id: o.x.id, n: o.x.n, dur: o.x.dur, cost: o.x.cost }));
      return { z: z.id, n: z.n, done: req.length - left.length, total: req.length, left };
    };
    /* où en est un passage : possible (l’objet est fait), payé, ce qui reste */
    E.passInfo = function (zid) {
      const P = PASS[zid], p = S.pass[zid];
      if (!P) return null;
      const cost = E.passCost(zid), paid = (p && p.paid) || {}, left = {};
      let need = 0, got = 0;
      for (const i in cost) {
        const g = Math.min(cost[i], paid[i] || 0);
        need += cost[i]; got += g;
        if (g < cost[i]) left[i] = cost[i] - g;
      }
      const lieux = E.passLieux(zid);
      return { z: zid, P, cost, paid, left, lieux, ready: !!p && passAtteignable(zid), done: !!(p && p.done), frac: need ? got / need : 1, can: Object.keys(left).some((i) => (S.inv[i] || 0) >= 1) };
    };
    /* un passage n’apparaît que lorsque la terre d’avant est ouverte : l’objet-clé fabriqué en avance
     * (une pioche, un chariot…) le garde en réserve, sans le montrer ni le laisser payer */
    function passAtteignable(zid) {
      const i = D.ZONES.findIndex((z) => z.id === zid);
      return i <= 0 || zoneOpen(D.ZONES[i - 1].id);
    }
    E.passAtteignable = passAtteignable;
    E.passPending = () => Object.keys(PASS).filter((z) => S.pass[z] && !S.pass[z].done && passAtteignable(z));
    E.passPour = function (zid) {
      const p = S.pass[zid];
      if (!p || p.done || !passAtteignable(zid)) return { ok: false };
      // le passage ne s’ouvre qu’une fois les lieux de la terre actuelle explorés
      const lieux = E.passLieux(zid);
      if (lieux && lieux.left.length) { E.emit("struct"); return { ok: false, why: "lieux", lieux }; }
      const cost = E.passCost(zid), gave = {};
      for (const i in cost) {
        const g = Math.min(Math.floor(S.inv[i] || 0), cost[i] - (p.paid[i] || 0));
        if (g > 0) { add(i, -g); p.paid[i] = (p.paid[i] || 0) + g; gave[i] = g; }
      }
      const done = Object.keys(cost).every((i) => (p.paid[i] || 0) >= cost[i]);
      if (done) {
        p.done = true;
        if (S.meta.achats) S.meta.achats = false; // le premier passage du cycle ferme les achats
        recordSplit(zid);
        E.emit("passdone", { z: zid, tr: PASS[zid].tr });
        unlockZone(zid);
        checkAges();
      }
      E.emit("struct");
      return { ok: Object.keys(gave).length > 0, gave, done };
    };
    /* ------------------------------------------------------ la relève
     * Ce qu’un nouveau Semeur gagnerait maintenant : les Souvenirs des passages franchis.
     * Dès qu’au moins un passage non offert est franchi dans le cycle, les passages ouverts par Raccourci comptent aussi. */
    E.releveGain = () => {
      const hasPaid = Object.keys(S.pass || {}).some((z) => S.pass[z].done && !S.pass[z].free && PASS[z]);
      return hasPaid ? Object.keys(S.pass || {}).reduce((a, z) => a + (S.pass[z].done && PASS[z] ? PASS[z].tr : 0), 0) : 0;
    };
    E.canReleve = () => E.releveGain() > 0 || Object.keys(S.endings || {}).length > 0;

    /* ------------------------------------------------------ récolte */
    /* ------------------------------------------------------ compétences
     * Une par geste, et la récolte. L’expérience vient de ce qu’on fait soi-même. */
    const SK = D.SKILL;
    const SKILLS = D.GESTE_ORDER.concat(["recolte"]);
    const XP_T = [0, 0]; // XP_T[L] : expérience totale pour atteindre le niveau L
    for (let L = 2, acc = 0; L <= SK.max; L++) { acc += Math.floor(L - 1 + 300 * Math.pow(2, (L - 1) / 7)) / 4; XP_T[L] = Math.floor(acc * SK.k); }
    const levelOf = (xp) => { let L = 1; while (L < SK.max && xp >= XP_T[L + 1]) L++; return L; };
    const lvl = (g) => levelOf((S.skills && S.skills[g]) || 0);
    E.SKILLS = SKILLS;
    E.XP_T = XP_T;
    E.skill = function (g) {
      const xp = (S.skills && S.skills[g]) || 0, L = levelOf(xp), lo = XP_T[L], hi = L < SK.max ? XP_T[L + 1] : lo;
      return { g, xp, lvl: L, lo, hi, frac: hi > lo ? (xp - lo) / (hi - lo) : 1, perks: SK.perks.filter((p) => L >= p).length, next: SK.perks.find((p) => p > L) || null };
    };
    /* plus rapide à chaque niveau ; une chance de pièce en plus à chaque palier */
    const skillSpeed = (g) => 1 + SK.speed * (lvl(g) - 1);
    const perkChance = (g) => SK.perk * SK.perks.filter((p) => lvl(g) >= p).length;
    E.skillSpeed = skillSpeed;
    E.perkChance = perkChance;
    function gainXp(g, n) {
      if (!(n > 0) || !SKILLS.includes(g)) return;
      const before = lvl(g);
      S.skills[g] = (S.skills[g] || 0) + n;
      const after = lvl(g);
      if (after > before) E.emit("level", { g, lvl: after, perk: SK.perks.includes(after) });
    }
    E.gainXp = gainXp;
    /* l’expérience d’une pièce : le temps qu’elle demande à la main, en somme */
    const xpOf = (id) => { const it = item(id); return Math.max(1, Math.round(SK.xp * (H.base + H.age * (it.a || 0)) * (isUnique(it) ? H.unique : isScaled(it) ? H.scaled : 1))); };
    E.xpOf = xpOf;

    function dayKey() {
      const d = new Date(now());
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    function advanceRitual(idx, amount) {
      const m = S.meta;
      if (!m) return;
      const dk = dayKey();
      if (!m.rituals || m.rituals.day !== dk) {
        m.rituals = { day: dk, prog: [0, 0, 0], claimed: [false, false, false] };
      }
      m.rituals.prog[idx] = (m.rituals.prog[idx] || 0) + (amount || 1);
    }
    E.advanceRitual = advanceRitual;

    /* Une règle par terre (D.REGLES) : ce qu’elle change à la récolte à la main */
    const regleSans = (r) => !!(r && r.sans && r.sans.some((i) => count(i) >= 1));
    const regleTap = (zid) => { const r = REG[zid] && REG[zid].tap; return !r || regleSans(r) ? 1 : r.mult; };
    E.regle = function (zid) {
      const R = REG[zid];
      if (!R) return null;
      const bonus = R.tap && !R.tap.sans && R.tap.mult > 1;
      const av = R.tap && R.tap.sans ? R.tap : R.chaleur;
      return { n: R.n, t: R.t, ok: R.ok || "", etat: av && av.sans ? (regleSans(av) ? "ok" : "gene") : "neutre", bonus, sans: av && av.sans ? av.sans.slice() : [] };
    };
    function tapYield(res, zid) {
      const c = E.cache();
      return regleTap(zid) * (item(res).b || 1) * (c.tap[res] || 1) * (c.tap[zid] || 1) * (c.tap["*"] || 1) * c.echo * memV("recolte") * transV("trans_main") * skillSpeed("recolte") * donTap(res);
    }
    E.tapYield = tapYield;
    E.tap = function (res, zid) {
      zid = zid || RES_ZONE[res];
      if (!zoneOpen(zid) || !ZONES[zid].res.includes(res)) return 0;
      let n = tapYield(res, zid);
      if (!(n > 0)) return 0;
      // coup de chance : la récolte double, et l’interface fait des étincelles (ou triple avec l'Écho du Brasier)
      const hasBrasier = E.hasEchoFin("brasier");
      E.lastCrit = rand() < D.CRIT.chance + D.CRIT.up * memLvl("oeil") + (donE().crit || 0) + (hasBrasier ? 0.25 : 0);
      if (E.lastCrit) { n *= (hasBrasier ? 3 : D.CRIT.mult); S.stats.crits = (S.stats.crits || 0) + 1; }
      add(res, n);
      advanceRitual(1, n);
      S.stats.taps++;
      gainXp("recolte", SK.tapXp);
      // curiosités (easter eggs)
      if (!OFF && res === "caillou" && !E.hasCurio("poudre_rouge")) {
        S.stats.caillouMined = (S.stats.caillouMined || 0) + n;
        // Probabilité par pierre minée : médiane (50 %) à 20 000 pierres (p = ln(2)/20000)
        const pDrop = 1 - Math.exp(-n * (Math.LN2 / 20000));
        if (rand() < pDrop) {
          add("poudre_rouge", 1);
          addCurio("poudre_rouge");
        }
      }
      if (!OFF && (res === "fibre" || res === "os" || res === "sable" || res === "regolithe") && rand() < 1 / 4000) {
        add("quart_coeur", 1);
        S.meta.curioHearts = (S.meta.curioHearts || 0) + 1;
        if (S.meta.curioHearts >= 4) {
          addCurio("coeur");
        } else {
          E.emit("toast", "❤️ Un quart de cœur.");
        }
      }
      return n;
    };
    E.tapYieldOf = (res) => { const z = RES_ZONE[res]; return z && zoneOpen(z) ? tapYield(res, z) : 0; };
    /* ce que récoltent les extracteurs pour une matière (par seconde) */
    E.rate = (res) => {
      let r = 0;
      const c = E.cache();
      for (const k in S.dom.ext) {
        const e = S.dom.ext[k];
        if (e.res === res && machStat[k] && machStat[k].s === "ok") r += extOut(e, c);
      }
      return r;
    };

    /* un extracteur déjà possédé qui ne récolte pas une matière : « libre » (jamais posé) ou « arret » (posé, mais éteint) */
    E.extEtat = (res) => {
      const z = RES_ZONE[res];
      if (!z || !zoneOpen(z) || HAND[res] || E.rate(res) > 0) return null;
      const key = extKey(z, res), e = S.dom.ext[key];
      if (e && e.on === false && Object.keys(e.u).length) return { etat: "arret", z, key };
      const ch = E.extChoice(res, z);
      return ch && ch.free > 0 ? { etat: "libre", z, key, t: ch.t } : null;
    };

    /* d’où vient une ressource qui manque : sa terre, ce que les extracteurs en donnent (par seconde) et le temps qu’il faudrait pour q */
    E.isRawRes = (res) => { const it = item(res); return !!(it && it.t === "res" && RES_ZONE[res]); };
    E.limiting = (res, q) => {
      const it = item(res), z = RES_ZONE[res], raw = !!(it && it.t === "res" && z);
      const rate = raw ? E.rate(res) : 0;
      return { res, q, raw, z: raw ? z : null, open: raw ? zoneOpen(z) : true, rate, eta: rate > 0 ? q / rate : null, hand: raw && zoneOpen(z) ? E.tapYieldOf(res) > 0 : false };
    };

    /* ------------------------------------------------------ coûts */
    function costFor(id, k) {
      const it = item(id), base = it.r[1];
      if (!isScaled(it)) return base;
      const f = Math.pow(it.s || 1.15, k);
      const out = {};
      for (const i in base) out[i] = Math.ceil(base[i] * f);
      return out;
    }
    /* coût total de `times` fabrications, la première étant la n° `from` (par défaut : ce qu’on possède) */
    function totalCost(id, times, from) {
      const it = item(id), tot = {};
      if (isScaled(it)) {
        const owned = from === undefined ? count(id) : from;
        for (let k = 0; k < times; k++) {
          const c = costFor(id, owned + k);
          for (const i in c) tot[i] = (tot[i] || 0) + c[i];
        }
      } else for (const i in it.r[1]) tot[i] = it.r[1][i] * times;
      return tot;
    }
    E.costFor = (id) => costFor(id, count(id));
    E.totalCost = totalCost;

    /* Pourquoi une recette ne peut-elle pas être réalisée ? */
    function blocker(id, job) {
      const it = item(id), r = it.r, o = r[3] || {};
      if (!gesteOK(r[0])) return { why: "geste", g: r[0] };
      if (o.heat && E.heat() < o.heat) return { why: "heat", heat: o.heat };
      if (o.lvl && E.level(r[0]) < o.lvl) return { why: "lvl", lvl: o.lvl };
      if (E.equipmentCheck && !(job && job.ancienAtelier)) {
        const equipment = E.equipmentJobCheck(id, job, k => count(k) + (job && job.b && job.b[k] || 0));
        if (equipment) return equipment;
      }
      if (isUnique(it) && (S.made[id] || 0) > 0) return { why: "owned" };
      return null;
    }
    E.blocker = blocker;
    /* la station qui lèverait ce blocage (four plus chaud, enclume plus dure, station du geste) */
    E.blockStation = function (id, b) {
      b = b || blocker(id);
      const g = item(id).r[0];
      if (!b) return null;
      if (b.why === "equipment") return b.required;
      if (b.why === "heat") return stationFor("chauffer", b.heat, 0);
      if (b.why === "lvl") return stationFor(g, 0, b.lvl);
      if (b.why === "geste" && !(D.GESTES[g] && D.GESTES[g].secret)) return stationFor(g, 0, 0);
      return null;
    };

    function missingFor(id, times) {
      const tot = totalCost(id, times), miss = {};
      let any = false;
      for (const i in tot) {
        const lack = tot[i] - (S.inv[i] || 0);
        if (lack > 1e-9) { miss[i] = Math.ceil(lack); any = true; }
      }
      return any ? miss : null;
    }
    E.missingFor = missingFor;

    function maxCraftable(id, cap) {
      cap = cap || 100000;
      const it = item(id);
      if (!it || !it.r || blocker(id)) return 0;
      if (isUnique(it)) return missingFor(id, 1) ? 0 : 1;
      if (isScaled(it)) {
        let n = 0;
        const left = Object.assign({}, S.inv);
        while (n < Math.min(cap, 500)) {
          const c = costFor(id, count(id) + n);
          let ok = true;
          for (const i in c) if ((left[i] || 0) < c[i]) { ok = false; break; }
          if (!ok) break;
          for (const i in c) left[i] -= c[i];
          n++;
        }
        return n;
      }
      let n = cap;
      for (const i in it.r[1]) n = Math.min(n, Math.floor((S.inv[i] || 0) / it.r[1][i] + 1e-9));
      return Math.max(0, n);
    }
    E.maxCraftable = maxCraftable;

    E.stars = (id) => { const m = S.made[id] || 0; let s = 0; MASTERY.forEach((t) => { if (m >= t) s++; }); return s; };
    E.MASTERY = MASTERY;

    /* ------------------------------------------------------ fabrication */
    function learn(id, silent) {
      if (S.known[id]) return false;
      S.known[id] = true;
      const it = item(id);
      if (!silent && !it.sec) { S.intu += 1; donIntu(1); }
      E.emit("learn", id);
      E.emit("struct");
      return true;
    }
    E.learn = learn;
    /* La saveur d'une découverte : le texte de la recette (D.SAVEUR, sinon sa description) et, la première fois qu'on emploie un geste
     * qui n'est pas de départ, ce que ce geste veut dire (D.SAVEUR_GESTE, sinon sa description). Ne change rien dans la partie : une
     * partie plus ancienne qui a déjà fabriqué quelque chose avec ce geste ne revoit pas son introduction. */
    E.saveurDecouverte = function (id) {
      const it = item(id);
      if (!it) return { recette: "", geste: null };
      const recette = (D.SAVEUR && D.SAVEUR[id]) || it.d || "";
      const g = it.r && it.r[0];
      let geste = null;
      if (g && D.GESTES[g] && !BASE_GESTES.includes(g)) {
        const deja = Object.keys(S.made).some((k) => k !== id && S.made[k] > 0 && item(k) && item(k).r && item(k).r[0] === g);
        if (!deja) geste = { id: g, n: D.GESTES[g].n, texte: (D.SAVEUR_GESTE && D.SAVEUR_GESTE[g]) || D.GESTES[g].d };
      }
      return { recette, geste };
    };

    /* chefs-d’œuvre : chance de lot bonus selon la maîtrise */
    function bonusFor(it, times, main) {
      let bonus = 0;
      if (it.t !== "comp" && it.t !== "res") return 0;
      // « Mains sûres » : une chance de pièce en plus pour ce que les mains fabriquent (pas les machines)
      const mem = main && MEM.mains.bonus ? MEM.mains.bonus(memLvl("mains")) : 0;
      const aubeBonus = (E.hasEchoFin("aube") && it.r && (it.r[0] === "chauffer" || it.r[0] === "allier")) ? 0.25 : 0;
      const ch = Math.min(0.95, 0.04 * E.stars(it.id) + (it.r ? perkChance(it.r[0]) : 0) + mem + aubeBonus);
      if (ch > 0) {
        if (times <= 200) for (let k = 0; k < times; k++) { if (rand() < ch) bonus++; }
        else bonus = Math.floor(times * ch + rand());
      }
      return bonus;
    }

    function craft(id, times, quiet) {
      times = Math.max(1, Math.floor(times || 1));
      const it = item(id);
      if (!it || !it.r) return { ok: false, why: "none" };
      const b = blocker(id);
      if (b) return { ok: false, why: b.why, info: b };
      if (isUnique(it)) times = 1;
      const miss = missingFor(id, times);
      if (miss) return { ok: false, why: "qty", missing: miss };
      const tot = totalCost(id, times);
      for (const i in tot) add(i, -tot[i]);
      return makeIt(id, times, quiet);
    }
    E.craft = craft;
    /* les matières sont déjà prises : on fabrique. Avec `bench`, le résultat reste sur
     * l’établi (sous-composant d’une fabrication en chaîne) au lieu d’aller au stock. */
    function makeIt(id, times, quiet, bench) {
      const it = item(id);
      const bonus = bonusFor(it, times, true);
      const out = it.r[2] * (times + bonus);
      const first = !(S.made[id] > 0);
      S.made[id] = (S.made[id] || 0) + times;
      S.stats.crafts += times;
      advanceRitual(0, times);
      gainXp(it.r[0], xpOf(id) * times);
      if (bench && !isUnique(it) && !isScaled(it)) {
        bench[id] = (bench[id] || 0) + out;
        markSeen(id);
      } else add(id, out);
      if (!S.known[id]) learn(id, true);
      if (first) onFirstCraft(id);
      if (id === "corde") {
        const hr = new Date().getHours();
        if (!OFF && hr >= 0 && hr < 4 && rand() < (1 / 3000) * Math.min(times, 10)) {
          add("fouet_cuir", 1);
          addCurio("fouet");
        }
      }
      if (id === "statuette") {
        if (!OFF && rand() < (1 / 20000) * Math.min(times, 10)) {
          add("de_vingt", 1);
          addCurio("d20");
        }
      }
      if (isUnique(it) || isScaled(it)) { recalc(); E.emit("struct"); }
      if (S.track && S.track.id === id) { S.track = null; E.emit("tracked", id); E.emit("struct"); }
      if (!quiet) E.emit("crafted", id, { n: out, bonus: bonus * it.r[2], first });
      return { ok: true, n: out, bonus: bonus * it.r[2], first };
    }

    /* Les âges se franchissent un par un. Un objet n’est à la portée de la joueuse que si son âge est atteint
     * ou si c’est le suivant (la porte de l’âge d’après) ; les objets secrets et les airs n’ont pas d’âge. */
    /* L’âge suivant s’ouvre quand ses étapes de l’âge en cours sont toutes faites ET qu’on a fabriqué un de ses objets.
     * On peut fabriquer en avance la porte de l’âge d’après : l’âge n’avance qu’une fois l’âge en cours accompli. */
    function avancerAge(plus) {
      const fin = D.AGES.length - 1;
      while (S.age < fin) {
        const etapes = E.milestones()[S.age];
        if (etapes && !etapes.every((x) => x.done)) return;
        const prochain = (id) => { const it = item(id); return it && !it.sec && !it.path && it.t !== "curio" && it.t !== "relic" && it.a === S.age + 1; };
        if (!(plus && prochain(plus)) && !Object.keys(S.made).some((id) => S.made[id] > 0 && prochain(id))) return;
        setAge(S.age + 1);
      }
    }
    E.avancerAge = avancerAge;
    const ageOK = (id) => { const it = item(id); return !it || it.sec || it.path || it.t === "curio" || it.t === "relic" || it.a <= S.age + 1; };
    E.ageOK = ageOK;
    function onFirstCraft(id) {
      const it = item(id);
      if (isUnique(it) && S.meta && S.meta.ruins && S.meta.ruins[id]) delete S.meta.ruins[id];
      stamp("m:" + id);
      const e = it.e || {};
      if (!it.sec && !it.path) avancerAge(id); // un âge à la fois, et seulement quand ses étapes sont faites
      if (e.zone) reachZone(e.zone);
      if (e.once && e.once.intu) S.intu += e.once.intu;
      if (it.sec) {
        S.intu += 2;
        addSecret(id);
      }
      if (e.capsule) {
        S.meta.capsule = true;
        E.emit("capsulePrompt");
      }
      if (e.fireworks) E.emit("fx", "fireworks");
      if (e.arche && !S.flags.arche) { S.flags.arche = true; archeSay("radio"); }
      if (e.decode) decodeSignal();
      if (D.EVENTS[id] && !S.meta.ev[id]) { S.meta.ev[id] = 1; E.emit("event", { id, txt: interpolate(D.EVENTS[id]) }); }
      if (id === "cerf_volant" || id === "boussole") E.emit("struct");
      E.emit("discover", id);
      checkAges();
      checkEvents();
    }

    /* Un âge accompli : toutes ses étapes faites, même celles qu’on peut sauter.
     * Un peu d’Intuition en récompense, une fois par âge et par cycle. silent : sans
     * récompense (une ancienne partie, dont les âges finis le sont depuis longtemps). */
    function checkAges(silent) {
      const got = S.flags.ages || (S.flags.ages = {});
      E.milestones().forEach((l, a) => {
        if (!l || got[a] || !l.every((x) => x.done)) return;
        got[a] = 1;
        if (silent) return;
        S.intu += D.AGE_DONE; donIntu(D.AGE_DONE);
        E.emit("ageDone", { a, intu: D.AGE_DONE });
      });
    }
    E.checkAges = checkAges;

    function setAge(a) {
      S.age = a;
      E.emit("age", a);
      if (S.flags.arche && D.ARCHE["age" + a]) archeSay("age" + a);
      checkEvents();
    }

    function addSecret(id) {
      if (S.secrets[id]) return false;
      S.secrets[id] = true;
      E.emit("secret", id);
      return true;
    }
    E.addSecret = addSecret;

    /* La première pièce offerte : une trouvaille inscrite sans rien prendre donne un exemplaire,
     * si l’ouvrage est ordinaire (ni unique, ni à prix croissant) et coûte peu en tout. */
    function offerFirst(id) {
      const lim = D.PREMIERE_PIECE && D.PREMIERE_PIECE.max;
      const it = item(id);
      if (!(lim > 0) || !it || !it.r || it.sec || it.path || isUnique(it) || isScaled(it)) return false;
      if (it.t !== "comp" && it.t !== "res") return false;
      if (S.made[id] > 0 || blocker(id)) return false;
      const cost = totalCost(id, 1);
      if (Object.values(cost).reduce((a, b) => a + b, 0) > lim) return false;
      S.made[id] = 1;
      add(id, it.r[2] || 1);
      markSeen(id);
      onFirstCraft(id);
      E.emit("crafted", id, { n: it.r[2] || 1, bonus: 0, first: true, offered: true });
      return true;
    }
    /* Tentative libre à l’Atelier : le cœur du jeu.
     * Retourne {kind: craft|learn|blocked|owned|fail, ...} */
    E.attempt = function (g, ids, selection) {
      ids = Array.from(new Set(ids.filter(Boolean)));
      if (!ids.length) return { kind: "empty" };
      if (!gesteOK(g)) return { kind: "nogeste" };
      // L'identité d'une recette du prototype comprend son équipement et son
      // mode : retirer une aiguille des ingrédients ne doit pas confondre une
      // flûte et une aiguille, ou une tunique et des gants.
      let selectedRecipe = null;
      if (D.CRAFT_EQUIPMENT) {
        const historical = RECIPES[keyOf(g, ids)];
        const later = D.CRAFT_EQUIPMENT.fullGame && !selection && (!historical || !D.CRAFT_EQUIPMENT.recipes[historical]);
        if (!later) {
          if (!selection || !E.equipmentRecipe) return { kind: "equipment", why: "selection" };
          selectedRecipe = E.equipmentRecipe(selection.equipment, selection.mode, ids);
          if (!selectedRecipe || item(selectedRecipe).r[0] !== g) return { kind: "equipment", why: "incompatible" };
        }
      }
      S.stats.tries++;
      if (g === "tailler" && ids.includes("os") && (ids.includes("eclat") || ids.includes("silex")) && rand() < 1 / 20000) {
        add("de_vingt", 1);
        addCurio("d20");
      }
      if (g === "tresser" && (ids.includes("fibre") || ids.includes("cuir") || ids.includes("laniere"))) {
        const hr = new Date().getHours();
        if (hr >= 0 && hr < 4 && rand() < 1 / 3000) {
          add("fouet_cuir", 1);
          addCurio("fouet");
        }
      }
      let id = selectedRecipe || RECIPES[keyOf(g, ids)];
      if (id && !ageOK(id)) id = null; // un objet d’un âge trop lointain ne se découvre pas : l’essai ne donne rien
      if (id) {
        const b = blocker(id);
        if (b && b.why === "owned") return { kind: "owned", id };
        if (b) {
          const fresh = learn(id);
          return { kind: "blocked", id, info: b, temp: 4, fresh };
        }
        const miss = missingFor(id, 1);
        if (miss) {
          const fresh = learn(id);
          return { kind: "learn", id, missing: miss, fresh, temp: 4, offered: fresh && offerFirst(id) };
        }
        // une découverte se fabrique sur-le-champ ; une recette connue part dans la file des mains
        if (S.known[id]) {
          const q = E.queue(id, 1, false, undefined, selection);
          return q.ok ? { kind: "queued", id, time: q.time } : { kind: "busy", id, why: q.why };
        }
        // découvrir coûte peu : ce qui coûte cher s’inscrit sans rien prendre, on choisit ensuite
        const cost = totalCost(id, 1);
        if (Object.values(cost).reduce((a, b) => a + b, 0) > D.DISCOVER_FREE) {
          learn(id);
          return { kind: "learn", id, missing: null, fresh: true, temp: 4, cost, offered: offerFirst(id) };
        }
        learn(id);
        const res = craft(id, 1, true);
        E.emit("crafted", id, res);
        return Object.assign({ kind: "craft", id, fresh: true }, res);
      }
      const t = temperature(g, ids);
      const mem = remember(g, ids);
      return { kind: "fail", temp: t.temp, why: t.why, sec: !!t.sec, msg: failText(g, ids), mem };
    };

    /* les matières avec leur article : « le bois », « l’os », « les fibres » */
    const GF = new Set(D.GENRE.f.split(" ")), GP = new Set(D.GENRE.p.split(" "));
    function the(id) {
      const n = item(id).n, low = n.charAt(0).toLowerCase() + n.slice(1);
      if (GP.has(id)) return "les " + low;
      if (/^[aeiouyœæ]/i.test(low.normalize("NFD")) || /^hélium/i.test(low)) return "l’" + low;
      return (GF.has(id) ? "la " : "le ") + low;
    }
    E.the = the;
    /* Une phrase d’échec : écrite à la main pour les essais les plus probables, sinon tirée
     * d’un modèle du geste (toujours la même pour la même tentative). */
    function failText(g, ids) {
      const sorted = ids.slice().sort(), key = g + ":" + sorted.join("+");
      const x = ids.length > 1 ? ids.slice(0, -1).map(the).join(", ") + " et " + the(ids[ids.length - 1]) : the(ids[0]);
      const plural = ids.length > 1 || GP.has(ids[0]);
      let t = D.FAIL_ONE[key];
      if (!t && ids.length === 1 && D.FAIL_SOLO[g]) t = D.FAIL_SOLO[g];
      if (!t) {
        const pool = D.FAIL[g] || D.FAIL.assembler;
        let h = 0;
        for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        t = pool[h % pool.length];
      }
      t = t.replace(/\{([^{}|]*)\|([^{}]*)\}/g, (m, one, many) => (plural ? many : one)).replace(/\{x\}/g, x);
      // une majuscule en tête de chaque phrase (pas après « … », qui suspend la phrase)
      return t.charAt(0).toUpperCase() + t.slice(1).replace(/([.!?] )(\p{Ll})/gu, (m, p, c) => p + c.toUpperCase());
    }
    E.failText = failText;

    /* Thermomètre d’intuition : à quel point la tentative est-elle proche
     * d’une recette encore inconnue (et réalisable avec des matières déjà vues) ? */
    function temperature(g, ids) {
      let best = { temp: 0, why: "froid" };
      const set = new Set(ids);
      for (const k in RECIPES) {
        const rid = RECIPES[k];
        if (S.known[rid]) continue;
        const it = item(rid);
        if (it.path && !gesteOK("accorder")) continue;
        const rg = it.r[0];
        if (!gesteOK(rg)) continue;
        const rs = Object.keys(it.r[1]);
        if (!rs.every((i) => S.seen[i])) continue;
        const inter = rs.filter((i) => set.has(i)).length;
        if (!inter) continue;
        let t = 0, why = "";
        const same = inter === rs.length && set.size === rs.length;
        if (rg === g) {
          if (inter === set.size && rs.length - set.size === 1) { t = 3; why = "manque"; }
          else if (inter === rs.length && set.size - rs.length === 1) { t = 3; why = "trop"; }
          else { t = 2; why = "tiede"; }
        } else if (same) { t = 3; why = "geste"; }
        else { t = 1; why = "frais"; }
        if (t > best.temp) best = it.sec ? { temp: t, why, sec: true } : { temp: t, why };
        if (best.temp === 3) break;
      }
      return best;
    }
    E.temperature = temperature;

    /* Recettes connues qui utilisent toutes les matières données (raccourcis de l’Atelier). */
    E.knownWith = function (ids) {
      ids = ids.filter(Boolean);
      if (!ids.length) return [];
      return Object.keys(S.known).filter((id) => {
        const it = item(id);
        return it && it.r && ids.every((i) => it.r[1][i] !== undefined);
      });
    };
    E.usesOf = (id) => Object.keys(D.ITEMS).filter((k) => D.ITEMS[k].r && D.ITEMS[k].r[1][id] !== undefined);

    /* ------------------------------------------------------ planification récursive
     * Que faut-il fabriquer (sous-composants compris) pour obtenir `times` fois `id` ?
     * Retourne les étapes dans l’ordre (les plus profondes d’abord), les matières
     * manquantes, les recettes inconnues et les recettes bloquées. */
    E.plan = function (id, times) {
      times = Math.max(1, Math.floor(times || 1));
      const avail = Object.assign({}, S.inv);
      const crafts = {}, depth = {}, missing = {}, blocked = {}, locked = {}, used = {}, toolEdges = {};
      let guard = 0;
      function need(x, qty, d, root) {
        if (++guard > 5000 || d > 40) return;
        const it = item(x);
        if (!root) {
          const have = avail[x] || 0;
          const use = Math.min(have, qty);
          if (use > 0) used[x] = (used[x] || 0) + use;
          avail[x] = have - use;
          qty -= use;
          if (qty <= 1e-9) return;
        }
        const zid = RES_ZONE[x];
        const gather = !root && it.t === "res" && zid && zoneOpen(zid); // le charbon se récolte, mais « Fabriquer » le fabrique
        if (!it.r || gather) { missing[x] = (missing[x] || 0) + qty; return; }
        if (!S.known[x]) { locked[x] = true; missing[x] = (missing[x] || 0) + qty; return; }
        if (E.equipmentCheck) {
          const eq = E.equipmentCheck(x, k => count(k) + (crafts[k] || 0));
          if (eq) {
            toolEdges[x] = Object.keys(eq.missing);
            for (const k of toolEdges[x]) if (count(k) < eq.missing[k]) need(k, eq.missing[k] - count(k), d + 1, true);
          }
        }
        let b = blocker(x);
        if (b && b.why === "equipment" && !E.equipmentCheck(x, k => count(k) + (crafts[k] || 0))) b = null;
        if (b) { blocked[x] = b; if (b.why !== "owned") missing[x] = (missing[x] || 0) + qty; return; }
        const n = root ? qty : Math.ceil(qty / it.r[2]);
        crafts[x] = (crafts[x] || 0) + n;
        depth[x] = Math.max(depth[x] || 0, d);
        const cost = isScaled(it) ? totalCost(x, n, count(x) + queued(x)) : (() => { const c = {}; for (const i in it.r[1]) c[i] = it.r[1][i] * n; return c; })();
        for (const i in cost) need(i, cost[i], d + 1, false);
        if (!root) { const surplus = n * it.r[2] - qty; if (surplus > 0) avail[x] = (avail[x] || 0) + surplus; }
      }
      need(id, isUnique(item(id)) ? 1 : times, 0, true);
      for (const k in missing) missing[k] = Math.ceil(missing[k] - 1e-9);
      // chaque fabrication après celles qui lui fournissent des pièces (un tri par profondeur
      // ne suffit pas : une pièce prise en partie au stock n’a pas sa profondeur mise à jour)
      const order = [], seenO = {};
      const visit = (x) => {
        if (seenO[x]) return;
        seenO[x] = true;
        const it = item(x);
        Object.keys(it.r[1]).concat(toolEdges[x] || []).filter((i) => crafts[i]).sort((a, b) => depth[b] - depth[a]).forEach(visit);
        order.push(x);
      };
      Object.keys(crafts).sort((a, b) => depth[b] - depth[a]).forEach(visit);
      const steps = order.map((x) => [x, crafts[x]]);
      return { ok: !Object.keys(missing).length && !Object.keys(blocked).length, id, times, steps, missing, blocked, locked: Object.keys(locked), used };
    };
    /* Exécute un plan complet ; ne fait rien s’il manque quoi que ce soit. */
    E.craftPlan = function (id, times) {
      const p = E.plan(id, times);
      if (!p.ok) return Object.assign({ done: false }, p);
      let made = 0;
      for (const [x, n] of p.steps) {
        const r = craft(x, n, x !== id);
        if (!r.ok) return Object.assign({ done: false, failed: x }, p);
        made += n;
      }
      return Object.assign({ done: true, made }, p);
    };
    /* Nombre maximal de fabrications possibles en chaîne avec le stock actuel. */
    E.maxPlan = function (id, cap) {
      const it = item(id);
      if (!it || !it.r || !E.plan(id, 1).ok) return 0;
      if (isUnique(it)) return 1;
      let lo = 1, hi = Math.min(cap || 100000, isScaled(it) ? 200 : 100000);
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (E.plan(id, mid).ok) lo = mid; else hi = mid - 1;
      }
      return lo;
    };

    /* ------------------------------------------------------ les mains et les commandes
     * Une commande (dans S.hand.q) rassemble un objet, une quantité, ses étapes s
     * (des plus profondes aux plus proches, comme les donne E.plan) et son établi b.
     * Les matières disponibles sont mises sur l’établi dès le départ, et ce qui manque
     * y est tiré au fil des récoltes. Les machines libres et les mains y travaillent
     * ensemble. */
    const H = D.HAND;
    const machPool = []; // une entrée par machine possédée : { m, job, sIdx, rec }
    let hWork = { job: null, sIdx: -1, rec: null };

    /* une pièce seule ; les gestes d’un âge passé vont plus vite */
    function handTime(id, selection) {
      const it = item(id);
      const a = it.a || 0;
      const k = isUnique(it) ? H.unique : isScaled(it) ? H.scaled : 1;
      const old = Math.pow(H.old, Math.max(0, S.age - a));

      // 1. Progression selon l’âge : linéaire sur les deux premiers âges (0-1), courbée au-delà
      let baseT = H.base + H.age * a;
      if (a >= 2) {
        baseT = (H.base + H.age * a) * Math.pow(H.ageCurve || 1.08, a - 1);
      }

      // 2. Fatigue du cycle : ne s'applique que sur le front pionnier (au-delà du record des cycles précédents)
      let fatigue = 1;
      const gain = E.releveGain ? E.releveGain() : 0;
      const maxAge = (S.meta && S.meta.maxAge) || 0;
      if (gain > 0 && a >= 2 && a > maxAge) {
        // Chaque trace non récoltée alourdit le geste au-delà du dernier jalon connu
        fatigue *= (1 + 0.12 * Math.min(10, gain));
        const reach = Math.max(1 + (S.cycle || 1) * 2, maxAge > 0 ? maxAge + 1 : 0);
        const depassement = Math.max(0, a - reach);
        if (depassement > 0) {
          fatigue *= Math.pow(H.fatigueBase || 1.15, Math.min(6, depassement));
        }
      }

      // 3. Élan des Semeurs : chaque cycle passé rend les gestes plus vifs,
      // et la Mémoire fraîche accélère le rattrapage des âges déjà conquis aux cycles précédents
      let elan = Math.pow(1.2, Math.min(5, Math.max(0, (S.cycle || 1) - 1)));
      if (maxAge >= 3 && a >= 2 && a <= maxAge) {
        elan *= 1 + 0.15 * Math.min(6, maxAge - a + 1);
      }

      return (baseT * fatigue / elan) * Math.max(0.3, 1 - H.star * E.stars(id)) * k * old * memV("mains") * donMul("mains") / ((it.r ? skillSpeed(it.r[0]) : 1) * E.recetteTerreBonus(id) * (E.equipmentSpeed ? E.equipmentSpeed(id, selection) : 1));
    }
    E.handTime = handTime;
    /* répéter le même geste va de plus en plus vite : n pièces d’affilée prennent t × n^batch */
    const stepTime = (id, n, selection) => handTime(id, selection) * Math.pow(n, H.batch);
    const jobSelection = (j, id) => j?.ancienAtelier ? false : j?.id===id ? j.equipmentSelection : undefined;
    E.batchTime = stepTime;

    function stepDone(j, idx) {
      if (j.done && j.done[idx] !== undefined) return j.done[idx];
      return idx < j.i ? j.s[idx][1] : idx === j.i ? j.k : 0;
    }
    function syncJobPos(j) {
      if (!j.uid) {
        S.hand.nextUid = (S.hand.nextUid || 0) + 1;
        j.uid = "j" + S.hand.nextUid;
      }
      if (typeof j.paused !== "boolean") j.paused = false;
      if (!j.done || j.done.length !== j.s.length) {
        j.done = j.s.map((s, idx) => (idx < j.i ? s[1] : idx === j.i ? j.k : 0));
      }
      if (!j.hMade || j.hMade.length !== j.s.length) j.hMade = j.done.slice();
      if (!j.sp || j.sp.length !== j.s.length) j.sp = j.s.map(() => 0);
      if (!j.mAcc || j.mAcc.length !== j.s.length) j.mAcc = j.s.map(() => 0);
      if (!j.miss || typeof j.miss !== "object") j.miss = {};
      if (!j.uid) {
        S.hand.nextUid = (S.hand.nextUid || 0) + 1;
        j.uid = "j" + S.hand.nextUid;
      }
      if (j.paused === undefined) j.paused = false;
      let i = 0;
      while (i < j.s.length && j.done[i] >= j.s[i][1]) i++;
      j.i = i;
      j.k = i < j.s.length ? j.done[i] : 0;
    }

    /* pièces de `id` encore à faire dans la file */
    function queued(id) {
      let n = 0;
      S.hand.q.forEach((j) => j.s.forEach((s, i) => {
        if (s[0] === id) n += Math.max(0, s[1] - stepDone(j, i));
      }));
      return n;
    }
    E.queued = queued;

    /* Les travailleurs d'un atelier (0.41) entrent dans le même parc que les machines, sous un nom « sorte:famille » */
    const TRAV = D.TRAVAILLEURS || {};
    function workerOf(m) {
      const i = typeof m === "string" ? m.indexOf(":") : -1;
      if (i < 0 || !TRAV[m.slice(0, i)]) return null;
      return { kind: m.slice(0, i), fam: m.slice(i + 1), def: TRAV[m.slice(0, i)] };
    }
    /* L'énergie (0.44) : offre = chevaux de base + sources bâties ; demande = machines et travailleurs au travail. Le facteur
     * (offre / demande, au plus 1, au moins D.ATELIERS.plancherEnergie) ralentit machines et travailleurs, jamais les mains.
     * Recalculé une fois par seconde de jeu à partir du pool déjà assigné (pas d'appel à assignWorkers : pas de récursion). */
    let energieCache = 1, energieT = 0;
    /* 0.58 : une source à combustible marche tant qu'il lui reste de quoi brûler (une unité en réserve, ou la braise de la précédente) */
    function sourceMarche(id) {
      const f = (D.ATELIERS.combustibles || {})[id];
      if (!f) return true;
      return (S.inv[f.id] || 0) >= 1 || ((S.combu || {})[id] || 0) > 0;
    }
    E.sourceMarche = sourceMarche;
    /* secondes de marche restantes (réserve + braise), Infinity pour une source sans combustible */
    E.sourceReste = (id) => {
      const f = (D.ATELIERS.combustibles || {})[id];
      if (!f) return Infinity;
      return Math.floor(S.inv[f.id] || 0) * f.s + ((S.combu || {})[id] || 0) * f.s;
    };
    function energieRecalc() {
      const T = D.ATELIERS;
      let offre = T.baseCh;
      T.sources.forEach((s) => { if (count(s.id) > 0 && sourceMarche(s.id)) offre += s.ch; });
      const ch = {};
      T.paliers.forEach((p) => { ch[p.id] = p.ch; });
      let demande = 0;
      machPool.forEach((w) => {
        if (w.job === null && w.cad === null) return;
        const wk = workerOf(w.m);
        demande += wk ? D.TRAVAILLEURS[wk.kind].ch : ch[w.m] || 0;
      });
      energieCache = demande <= 0 ? 1 : Math.max(Math.min(1, T.plancherEnergie === undefined ? 1 : T.plancherEnergie), Math.min(1, offre / demande));
      return energieCache;
    }
    E.energieFacteur = () => energieCache;
    E.energieRecalc = energieRecalc;
    function machUnitRate(m, c, rec) {
      const wk = workerOf(m);
      if (wk) return rec ? wk.def.mult / Math.max(0.2, handTime(rec)) * energieCache * E.recetteTerreBonus(rec) : 0;
      const M = item(m);
      if (!M) return 0;
      let decay = 1;
      if (rec) {
        const it = item(rec);
        const recAge = it ? (it.a || 0) : 0;
        const maxAge = (S.meta && S.meta.maxAge) || 0;
        const effAge = maxAge >= 3 && recAge <= maxAge ? Math.max(1, recAge - 2) : recAge;
        if (effAge >= 2) {
          decay = Math.pow(H.machDecay || 1.08, effAge - 1);
        }
      }
      return ((M.spd / 60) / decay) * energieCache * (c || E.cache()).aspd * memV("mach") * transV("trans_mach") * donMul("mach") * E.recetteTerreBonus(rec);
    }
    function machReadyFor(m, rec, job) {
      const wk = workerOf(m);
      const fits = wk ? !!(item(rec) && item(rec).r && E.atelierDe(rec) === wk.fam && Object.keys(item(rec).r[1]).length <= wk.def.ing) : job && job.ancienAtelier
        ? Object.keys(jobInputs(job, rec)).length <= (item(m).ing !== undefined ? item(m).ing : 1)
        : E.machCan(m, rec);
      /* 0.54 : les bâtisseurs exécutent les chantiers du joueur, c'est-à-dire des constructions à prix croissant (extracteurs, machines) qu'il a lui-même mises dans sa file ; jamais de leur propre initiative */
      const chantier = !!(wk && wk.fam === "construction" && job && S.known[rec] && isScaled(item(rec)));
      if ((!E.automatable(rec) && !chantier) || !fits) return false;
      if (!E.hasEchoFin("retour") && D.COMMANDES && D.COMMANDES.firstByHand && !(S.made[rec] > 0)) return false;
      if (blocker(rec, job)) return false;
      return true;
    }
    function anyOwnedMachReadyFor(rec) {
      if (MACHINES.some((m) => Math.floor(count(m)) >= 1 && machReadyFor(m, rec))) return true;
      const a = S.ateliers && item(rec) && item(rec).r ? S.ateliers[E.atelierDe(rec)] : null;
      return !!(a && ((a.ouv > 0 && machReadyFor("ouvrier:" + E.atelierDe(rec), rec)) || (a.app > 0 && machReadyFor("apprenti:" + E.atelierDe(rec), rec))));
    }
    /* durée estimée d’une étape (n unités de x) avec les machines capables disponibles */
    function estStepTime(x, n, freeOnly, selection) {
      if (!(n > 0)) return 0;
      const c = E.cache();
      let mRate = 0;
      if (E.automatable(x) && !blocker(x)) {
        MACHINES.forEach((m) => {
          if (!E.machCan(m, x)) return;
          const cnt = freeOnly ? freeMach(m) : Math.floor(count(m));
          if (cnt > 0) mRate += cnt * machUnitRate(m, c, x);
        });
      }
      if (!(mRate > 0)) return stepTime(x, n, selection);
      const firstHand = D.COMMANDES && D.COMMANDES.firstByHand && !(S.made[x] > 0);
      if (firstHand) {
        const t1 = handTime(x, selection);
        if (n <= 1) return t1;
        const hRest = Math.max(1e-6, stepTime(x, n, selection) - t1);
        const hRate = (n - 1) / hRest;
        return t1 + (n - 1) / (hRate + mRate);
      }
      const hTotal = Math.max(1e-6, stepTime(x, n, selection));
      const hRate = n / hTotal;
      return n / (hRate + mRate);
    }
    /* durée approximative d’une commande de n exemplaires de id avec les machines libres */
    E.orderTime = function (id, times) {
      const p = E.plan(id, times);
      if (!p.steps.length) return handTime(id);
      return p.steps.reduce((a, [x, n]) => a + estStepTime(x, n, false), 0);
    };
    /* temps restant sur une commande en file */
    function jobTime(j, first) {
      syncJobPos(j);
      let t = 0;
      j.s.forEach((s, idx) => {
        const rem = Math.max(0, s[1] - j.done[idx] - (j.sp[idx] || 0));
        if (rem <= 0) return;
        const full = estStepTime(s[0], s[1], false, jobSelection(j,s[0]));
        t += full * (rem / s[1]);
      });
      if (first && S.hand.p > 0 && !MACHINES.some((m) => Math.floor(count(m)) > 0)) {
        let raw = 0;
        j.s.forEach((s, i) => { if (i >= j.i) raw += stepTime(s[0], s[1], jobSelection(j,s[0])); });
        return Math.max(0, raw - S.hand.p);
      }
      return Math.max(0, t);
    }
    /* prend `cost` sur l’établi d’abord, puis dans le stock ; rien s’il manque quelque chose */
    function take(cost, bench) {
      for (const i in cost) if ((bench[i] || 0) + (S.inv[i] || 0) + 1e-9 < cost[i]) return false;
      for (const i in cost) {
        const b = Math.min(bench[i] || 0, cost[i]);
        if (b > 0) { bench[i] -= b; if (bench[i] < 1e-9) delete bench[i]; }
        if (cost[i] - b > 1e-9) add(i, -(cost[i] - b));
      }
      return true;
    }
    /* tire vers l’établi des commandes ce qui est arrivé en Réserve, et pose les
     * extracteurs libres de la bonne terre sur les gisements des matières manquantes */
    function pullOrderInputs() {
      let units = null; // extracteurs libres, calculés une fois et seulement s’il manque quelque chose
      S.hand.q.forEach((j) => {
        syncJobPos(j);
        if (j.paused) return;
        for (const res in j.miss) {
          const pull = Math.min(j.miss[res], S.inv[res] || 0);
          if (pull > 1e-9) {
            add(res, -pull);
            j.b[res] = (j.b[res] || 0) + pull;
            j.miss[res] -= pull;
          }
          if (!(j.miss[res] > 1e-9)) { delete j.miss[res]; continue; }
          if (!units) {
            units = E.extUnits();
            units.free = EXTS.some((t) => units[t].own > units[t].used);
          }
          if (!units.free) continue;
          D.ZONES.forEach((z) => {
            if (!zoneOpen(z.id) || !(ZONE_DEPS[z.id] || []).some((d) => d.res === res)) return;
            E.extFor(res, z.id).sort((a, b) => extRate(b, res) - extRate(a, res)).forEach((t) => {
              const free = units[t].own - units[t].used;
              if (free < 1) return;
              units[t].used += assignExt(z.id, res, t, free);
              if (!S.flags.extDone) { S.flags.extDone = true; checkAges(); E.emit("struct"); }
            });
          });
          units.free = EXTS.some((t) => units[t].own > units[t].used);
        }
      });
    }
    function syncMachPool() {
      const want = [];
      MACHINES.slice().reverse().forEach((m) => {
        const n = Math.max(0, Math.floor(count(m)) - ((S.pannes || {})[m] || 0)); // 0.58 : les exemplaires en panne ne travaillent pas
        for (let i = 0; i < n; i++) want.push(m);
      });
      for (const fam in S.ateliers || {}) {
        const a = S.ateliers[fam];
        for (let i = 0; i < (a.ouv || 0); i++) want.push("ouvrier:" + fam);
        for (let i = 0; i < (a.app || 0); i++) want.push("apprenti:" + fam);
      }
      machPool.length = want.length;
      for (let i = 0; i < want.length; i++) {
        if (!machPool[i] || machPool[i].m !== want[i]) {
          machPool[i] = { m: want[i], job: null, sIdx: -1, rec: null, cad: null };
        }
      }
    }
    /* combien d’unités de l’étape (j, sIdx) peuvent être alimentées par l’établi (après
     * ce qui est déjà réservé par d’autres étapes en cours sur j) */
    function jobInputs(j, rec) {
      return (j.recettes020 && INPUTS_020[rec]) || (j.recettes035 && INPUTS_035[rec]) ||
        (j.recettesEquipements && D.CRAFT_EQUIPMENT && D.CRAFT_EQUIPMENT.legacyInputs[rec]) || item(rec).r[1];
    }
    function affordableUnits(j, sIdx, reserved) {
      const rec = j.s[sIdx][0], it = item(rec);
      const b = blocker(rec, j);
      if (b && b.why !== "owned") return 0;
      const cost = isScaled(it) ? costFor(rec, count(rec)) : jobInputs(j, rec);
      let maxU = j.s[sIdx][1] - j.done[sIdx];
      if (maxU <= 0) return 0;
      if (isScaled(it) || isUnique(it)) maxU = Math.min(maxU, 1);
      for (const i in cost) {
        const avail = Math.max(0, (j.b[i] || 0) - (reserved[i] || 0)) + (S.inv[i] || 0);
        maxU = Math.min(maxU, Math.floor((avail + 1e-9) / cost[i]));
      }
      return Math.max(0, maxU);
    }
    /* 0.51 : la production continue des travailleurs d'un métier, jusqu'au seuil du métier. */
    const autoAcc = {};
    let autoReserve = {};
    let composantsMemo = null, autoParFam = null;
    function autoPossible() { return TRAV.generalistes !== false; }
    function autoSeuil(fam) {
      const a = S.ateliers && S.ateliers[fam];
      return a && typeof a.seuil === "number" ? a.seuil : (TRAV.seuilDefaut === undefined ? 30 : TRAV.seuilDefaut);
    }
    /* les composants : ce qui sert d'ingrédient à une autre recette (ni bâtiments, ni machines, ni outils) rangés par métier */
    function autoRecettesDe(fam) {
      if (!autoParFam) {
        composantsMemo = new Set();
        for (const id in D.ITEMS) { const it = D.ITEMS[id]; if (it.r) for (const k in it.r[1]) composantsMemo.add(k); }
        autoParFam = {};
        composantsMemo.forEach((id) => {
          const it = D.ITEMS[id];
          if (!it || !it.r || it.sec || (it.t !== "comp" && it.t !== "res")) return;
          (autoParFam[E.atelierDe(id)] = autoParFam[E.atelierDe(id)] || []).push(id);
        });
      }
      return autoParFam[fam] || [];
    }
    function autoConfort(rec) {
      const c = TRAV.confort || { base: 20, parAge: 1.5, max: 200 }, a = Math.max(1, (item(rec) && item(rec).a) || 1);
      return Math.min(c.max, Math.round(c.base * Math.pow(c.parAge, a - 1)));
    }
    function autoCible(rec) { return Math.ceil(autoConfort(rec) * autoSeuil(E.atelierDe(rec)) / 100 - 1e-9); }
    /* ce que les commandes en cours de la file ont encore à prendre en Réserve : les travailleurs n'y touchent pas */
    function autoReserveCalc() {
      const r = {};
      S.hand.q.forEach((j) => {
        if (j.paused) return;
        j.s.forEach((st, i) => {
          const left = st[1] - (j.done[i] || 0);
          if (left <= 0) return;
          const cost = jobInputs(j, st[0]);
          for (const k in cost) r[k] = (r[k] || 0) + cost[k] * left;
        });
        for (const k in j.b) if (r[k]) r[k] = Math.max(0, r[k] - j.b[k]);
      });
      return r;
    }
    function autoCibles(fam) {
      const out = [];
      autoRecettesDe(fam).forEach((rec) => {
        const it = item(rec);
        if (!it || !it.r || !E.automatable(rec)) return;
        const cible = autoCible(rec), have = S.inv[rec] || 0;
        if (have >= cible - 1e-9) return;
        for (const i in it.r[1]) if ((S.inv[i] || 0) - (autoReserve[i] || 0) + 1e-9 < it.r[1][i]) return;
        out.push({ rec, ratio: have / Math.max(1, cible) });
      });
      return out.sort((a, b) => a.ratio - b.ratio);
    }
    E.seuilAtelier = autoSeuil;
    E.setSeuilAtelier = function (fam, pct) {
      if (!((D.ATELIERS || {}).familles || []).some((f) => f.id === fam)) return { ok: false, why: "inconnu" };
      const v = Math.max(0, Math.min(100, Math.round((Number(pct) || 0) / 10) * 10));
      S.ateliers = S.ateliers || {};
      const a = S.ateliers[fam] || (S.ateliers[fam] = { app: 0, ouv: 0 });
      a.seuil = v;
      assignWorkers(); domChanged(); E.emit("struct");
      return { ok: true, seuil: v };
    };
    E.confort = autoConfort;
    E.cibleAuto = autoCible;
    /* ce que les travailleurs d'un métier ont à faire : chaque composant connu, son stock, sa cible, et si on le fabrique */
    E.autoEtat = function (fam) {
      assignWorkers();
      const actifs = {};
      machPool.forEach((w) => { const wk = workerOf(w.m); if (wk && wk.fam === fam && w.cad) actifs[w.cad] = (actifs[w.cad] || 0) + 1; });
      return autoRecettesDe(fam).filter((rec) => E.automatable(rec)).map((rec) => {
        const it = item(rec), have = Math.floor(S.inv[rec] || 0), cible = autoCible(rec);
        let etat = actifs[rec] ? "marche" : "attend";
        if (have >= cible) etat = "plein";
        else if (S.ateliers[fam] && S.ateliers[fam].greve) etat = "greve";
        else if (!actifs[rec]) for (const i in it.r[1]) if ((S.inv[i] || 0) - (autoReserve[i] || 0) + 1e-9 < it.r[1][i]) { etat = "manque"; break; }
        return { id: rec, have, cible, etat, travailleurs: actifs[rec] || 0 };
      });
    };
    /* 0.51 : la voix des travailleurs. S.equipe = { fait: {métier: {recette: nombre}} (ce que leur production libre a fabriqué),
     * voix: {clé: dernier message} (pour ne pas répéter), histo: les derniers messages, retour: ce qu'ils ont fait pendant une absence }. */
    function eq() {
      let e = S.equipe;
      if (!e || typeof e !== "object") e = S.equipe = {};
      if (!e.fait || typeof e.fait !== "object") e.fait = {};
      if (!e.voix || typeof e.voix !== "object") e.voix = {};
      if (!Array.isArray(e.histo)) e.histo = [];
      return e;
    }
    function noteFait(fam, rec, n) {
      if (!(n > 0)) return;
      const f = eq().fait[fam] || (eq().fait[fam] = {});
      f[rec] = (f[rec] || 0) + n;
    }
    /* 0.57 : la fatigue des métiers et la grève (D.TRAVAILLEURS.fatigue). Rien ne bouge quand le jeu est fermé : les travailleurs se reposent (voir catchUp). */
    function annonce(fam, kind) { const e = eq(); e.annonces = (e.annonces || []).concat({ fam, kind }).slice(-8); }
    /* 0.58 : le combustible. Chaque source construite brûle sa part tant que quelque chose travaille ; rien ne brûle jeu fermé. */
    function combustionStep(dt) {
      const C = D.ATELIERS.combustibles;
      if (!C || !machPool.some((w) => w.job !== null || w.cad !== null)) return;
      const bien = S.combu || (S.combu = {});
      D.ATELIERS.sources.forEach((s) => {
        const f = C[s.id];
        if (!f || count(s.id) <= 0) return;
        let reste = bien[s.id] || 0;
        if (reste <= 0) {
          if ((S.inv[f.id] || 0) < 1) return; // plus rien à brûler : arrêtée
          S.inv[f.id] -= 1; reste = 1;
        }
        reste -= dt / f.s;
        if (reste < 0) reste = 0;
        bien[s.id] = reste;
      });
    }
    /* 0.58 : l'usure et les pannes des machines (D.ATELIERS.pannes) */
    function panneStep(dt) {
      const P = D.ATELIERS.pannes;
      if (!P) return;
      const us = S.usure || (S.usure = {}), pa = S.pannes || (S.pannes = {});
      const marche = {};
      machPool.forEach((w) => { if (!workerOf(w.m) && (w.job !== null || w.cad !== null)) marche[w.m] = true; });
      let change = false;
      MACHINES.forEach((m) => {
        const n = Math.floor(count(m));
        if (n <= 0) { if (pa[m]) { delete pa[m]; change = true; } return; }
        if (!marche[m]) { if (us[m] > 0) us[m] = Math.max(0, us[m] - dt / P.repos); return; }
        if ((pa[m] || 0) >= Math.ceil(n * P.partMax)) return;
        us[m] = (us[m] || 0) + dt / P.monte;
        if (us[m] >= 1) { us[m] = 0; pa[m] = (pa[m] || 0) + 1; change = true; }
      });
      if (change) { assignWorkers(); domChanged(); E.emit("struct"); }
    }
    E.panneCout = () => { const d = TRAV.apprenti; return Math.round(((D.ATELIERS.pannes || {}).cout || 3) * d.cout * Math.pow(TRAV.parAge || 1, Math.max(0, S.age - d.age))); };
    E.usure = (m) => ({ valeur: Math.min(1, (S.usure || {})[m] || 0), pannes: (S.pannes || {})[m] || 0 });
    E.reparer = function (m) {
      const P = D.ATELIERS.pannes, u = E.usure(m);
      if (!P || Math.floor(count(m)) <= 0) return { ok: false, why: "aucune" };
      if (!u.pannes && u.valeur < P.alerte) return { ok: false, why: "bon" };
      const cout = E.panneCout();
      if ((S.ecus || 0) + 1e-9 < cout) return { ok: false, why: "ecus", cout };
      S.ecus -= cout;
      if (u.pannes) S.pannes[m] = u.pannes - 1;
      (S.usure || (S.usure = {}))[m] = Math.min(S.usure[m] || 0, P.apres);
      assignWorkers(); domChanged(); E.emit("struct");
      return { ok: true, cout };
    };
    function fatigueStep(dt) {
      const F = TRAV.fatigue;
      if (!F || !autoPossible() || !S.ateliers) return;
      const occ = {}, tot = {};
      machPool.forEach((w) => {
        const wk = workerOf(w.m);
        if (!wk) return;
        tot[wk.fam] = (tot[wk.fam] || 0) + 1;
        if (w.job === null && w.cad !== null) occ[wk.fam] = (occ[wk.fam] || 0) + 1; // la fatigue vient de la production libre (le seuil, les ordres permanents), pas de la file que tu as toi-même lancée
      });
      for (const fam in S.ateliers) {
        const a = S.ateliers[fam];
        if (!(a.app || a.ouv)) continue;
        const t = (occ[fam] || 0) / Math.max(1, tot[fam] || 0), pression = 1 + F.energie * (1 - energieCache);
        const avant = a.fatigue || 0;
        const f = Math.max(0, Math.min(1.2, avant + dt * (t * pression / F.monte - (1 - t) / F.repos)));
        a.fatigue = f;
        if (!a.greve && f >= 1) { a.greve = true; a.alerte = true; annonce(fam, "greve"); assignWorkers(); E.emit("greve", { fam }); E.emit("struct"); }
        else if (a.greve && f <= F.reprise) { a.greve = false; a.alerte = false; annonce(fam, "reprise"); E.emit("reprise", { fam }); E.emit("struct"); }
        else if (!a.greve && !a.alerte && f >= F.alerte) { a.alerte = true; annonce(fam, "fatigue"); }
        else if (a.alerte && !a.greve && f < F.alerte - 0.15) a.alerte = false;
      }
    }
    /* le prix d'une prime : un multiple du prix d'un apprenti de l'âge (il suit le niveau des prix) */
    E.primeCout = (fam) => { const F = TRAV.fatigue || {}, d = TRAV.apprenti; return Math.round((F.prime || 2) * d.cout * Math.pow(TRAV.parAge || 1, Math.max(0, S.age - d.age))); };
    E.fatigue = (fam) => { const a = S.ateliers && S.ateliers[fam]; return { valeur: Math.min(1, (a && a.fatigue) || 0), greve: !!(a && a.greve), alerte: !!(a && a.alerte) }; };
    E.primeVerser = function (fam) {
      const a = S.ateliers && S.ateliers[fam], F = TRAV.fatigue;
      if (!F || !a || !(a.app || a.ouv)) return { ok: false, why: "personne" };
      if (!a.greve && (a.fatigue || 0) < F.alerte) return { ok: false, why: "repos" };
      const cout = E.primeCout(fam);
      if ((S.ecus || 0) + 1e-9 < cout) return { ok: false, why: "ecus", cout };
      S.ecus -= cout;
      const etaitGreve = !!a.greve;
      a.fatigue = F.apresPrime; a.greve = false; a.alerte = false;
      if (etaitGreve) annonce(fam, "reprise");
      assignWorkers(); domChanged(); E.emit("struct");
      return { ok: true, cout };
    };
    const manqueDepuis = {};
    const deNom = (id) => { const n = ((item(id) && item(id).n) || id).toLowerCase(); return (/^[aeiouyàâéèêëîïôöûüh]/.test(n) ? "d’" : "de ") + n; };
    const listeFait = (f) => Object.keys(f).sort((a, b) => f[b] - f[a]).slice(0, 4).map((r) => Math.floor(f[r]) + " × " + ((item(r) && item(r).n) || r).toLowerCase()).join(", ");
    function dire(fam, kind, id, txt, t) {
      const e = eq();
      e.voix[kind + ":" + fam + ":" + id] = t;
      const m = { t, fam, kind, id, txt };
      e.histo.push(m);
      const max = (D.VOIX && D.VOIX.histoMax) || 20;
      while (e.histo.length > max) e.histo.shift();
      return m;
    }
    E.voixHisto = (fam) => eq().histo.filter((m) => !fam || m.fam === fam).slice().reverse();
    /* ce que les travailleurs ont à dire maintenant (t : l'heure en ms). Chaque appel rend les nouveaux messages, une seule fois. */
    E.voix = function (t) {
      const V = D.VOIX;
      if (!V || !autoPossible()) return [];
      const e = eq(), out = [];
      const libre = (kind, fam, id) => !(e.voix[kind + ":" + fam + ":" + id] > t - V.cooldown * 1000);
      const gabarit = (fam, kind) => ((V.metiers[fam] || V.metiers.artisanat)[kind]);
      if (e.retour) {
        const r = e.retour; e.retour = null;
        Object.keys(r.fait).map((fam) => ({ fam, tot: Object.keys(r.fait[fam]).reduce((a, k) => a + r.fait[fam][k], 0) }))
          .filter((x) => x.tot >= 1).sort((a, b) => b.tot - a.tot).slice(0, 3)
          .forEach((x) => out.push(dire(x.fam, "retour", "-", gabarit(x.fam, "retour").replace("{liste}", listeFait(r.fait[x.fam])), t)));
      }
      const ann = e.annonces || []; e.annonces = [];
      ann.forEach((x) => { const g = (V.metiers[x.fam] || V.metiers.artisanat)[x.kind]; if (g) out.push(dire(x.fam, x.kind, "-", g, t)); });
      const prod = {};
      let prodLu = false;
      for (const fam in S.ateliers || {}) {
        const a = S.ateliers[fam];
        if (!(a.app || a.ouv) || autoSeuil(fam) <= 0) continue;
        // manque : un travailleur attend depuis plus de 30 s une matière
        const vus = {};
        E.autoEtat(fam).forEach((x) => {
          if (x.etat !== "manque") return;
          for (const i in item(x.id).r[1]) {
            if ((S.inv[i] || 0) - (autoReserve[i] || 0) + 1e-9 >= item(x.id).r[1][i]) continue;
            const k = fam + ":" + i; vus[k] = true;
            if (!manqueDepuis[k]) manqueDepuis[k] = t;
            if (t - manqueDepuis[k] >= V.manqueApres * 1000 && libre("manque", fam, i)) out.push(dire(fam, "manque", i, gabarit(fam, "manque").replace("{de}", deNom(i)), t));
            break;
          }
        });
        for (const k in manqueDepuis) if (k.indexOf(fam + ":") === 0 && !vus[k]) delete manqueDepuis[k];
        // prévision : ce que leur travail consomme viderait la Réserve en moins de 5 minutes
        const cons = {};
        machPool.forEach((w) => {
          const wk = workerOf(w.m);
          if (!wk || wk.fam !== fam || !w.cad || !w.rec) return;
          const r = machUnitRate(w.m, null, w.rec);
          for (const i in item(w.rec).r[1]) cons[i] = (cons[i] || 0) + r * item(w.rec).r[1][i];
        });
        for (const i in cons) {
          if (!prodLu) { E.production().forEach((p) => { prod[p.id] = p.net; }); prodLu = true; }
          const have = S.inv[i] || 0, net = prod[i];
          if (have > 0 && net < -1e-9 && have / -net < V.previsionSous && libre("prevision", fam, i) && libre("manque", fam, i)) out.push(dire(fam, "prevision", i, gabarit(fam, "prevision").replace("{de}", deNom(i)), t));
        }
      }
      return out;
    };
    /* 0.52 : les goulots. Un goulot est ce qui empêche un travailleur ou un ordre permanent d'avancer, descendu jusqu'à sa cause réelle
     * (pas d'extracteur, personne dans le métier qui fabrique la matière, recette jamais faite à la main, seuil à 0, énergie) avec ce qui le règle.
     * Lecture seule : un calcul sur l'état, rien dans la sauvegarde. Rend [{ id, kind, fam, ing, bloque: [recettes], poids, txt, action }], le plus gênant d'abord. */
    function causeRacine(i, prof, vus) {
      if (prof > 8 || vus[i]) return null;
      vus[i] = true;
      const it = item(i);
      if (!it) return null;
      if (!it.r) return { kind: Object.keys((S.dom && S.dom.ext) || {}).some((k) => S.dom.ext[k].res === i) ? "lent" : "extracteur", ing: i };
      const f2 = E.atelierDe(i);
      if (!E.automatable(i)) return { kind: "inconnue", ing: i, fam: f2 };
      if (!(S.made[i] > 0) && !E.hasEchoFin("retour") && D.COMMANDES && D.COMMANDES.firstByHand) return { kind: "main", ing: i, fam: f2 };
      const a = (S.ateliers && S.ateliers[f2]) || {};
      if (!(a.app || a.ouv)) return { kind: "personne", ing: i, fam: f2 };
      if (autoSeuil(f2) <= 0) return { kind: "seuil0", ing: i, fam: f2 };
      for (const j in it.r[1]) if ((S.inv[j] || 0) + 1e-9 < it.r[1][j]) { const c = causeRacine(j, prof + 1, vus); if (c) return c; }
      if ((S.inv[i] || 0) >= autoCible(i) - 1e-9) return { kind: "seuil", ing: i, fam: f2 };
      return null;
    }
    /* les pièces dont dépend l’objet suivi (S.track), de proche en proche, avec lui-même */
    function arbreSuivi() {
      const vus = {};
      const va = (id, p) => { if (!id || vus[id] || p > 8) return; vus[id] = true; const it = item(id); if (it && it.r && it.r[1]) Object.keys(it.r[1]).forEach((x) => va(x, p + 1)); };
      if (S.track && S.track.id) va(S.track.id, 0);
      return vus;
    }
    function lieObjectif(g) {
      const t = arbreSuivi();
      if (!Object.keys(t).length) return false;
      return !!(t[g.ing] || (g.ings || []).some((x) => t[x]));
    }
    E.goulots = function () {
      const liste = {};
      const ajoute = (c, fam, rec) => {
        if (!c) return;
        const parMetier = c.kind === "seuil0" || c.kind === "main" || c.kind === "personne";
        const id = c.kind + ":" + (parMetier ? c.fam : c.ing);
        const g = liste[id] || (liste[id] = { id, kind: c.kind, fam: c.fam || null, ing: c.ing, ings: [], fams: [], bloque: [], poids: 0 });
        if (c.ing && g.ings.indexOf(c.ing) < 0) g.ings.push(c.ing);
        if (fam && g.fams.indexOf(fam) < 0) g.fams.push(fam);
        if (rec && g.bloque.indexOf(rec) < 0) { g.bloque.push(rec); g.poids++; }
      };
      assignWorkers();
      for (const fam in S.ateliers || {}) {
        const a = S.ateliers[fam];
        if (!(a.app || a.ouv) || autoSeuil(fam) <= 0) continue;
        E.autoEtat(fam).forEach((x) => {
          if (x.etat !== "manque") return;
          for (const i in item(x.id).r[1]) {
            if ((S.inv[i] || 0) - (autoReserve[i] || 0) + 1e-9 >= item(x.id).r[1][i]) continue;
            ajoute(causeRacine(i, 0, { [x.id]: true }), fam, x.id);
            break;
          }
        });
      }
      for (const fam in S.ateliers || {}) if (S.ateliers[fam].greve && (S.ateliers[fam].app || S.ateliers[fam].ouv)) liste["greve:" + fam] = { id: "greve:" + fam, kind: "greve", fam, ing: null, ings: [], fams: [fam], bloque: [], poids: 3 };
      E.cadences().forEach((c) => {
        if (c.status !== "starved" || !c.miss.length) return;
        ajoute(causeRacine(c.miss[0], 0, { [c.id]: true }), E.atelierDe(c.id), c.id);
      });
      if (energieCache < 0.999 && machPool.some((w) => (w.job !== null || w.cad !== null))) {
        liste["energie:-"] = { id: "energie:-", kind: "energie", fam: null, ing: null, fams: [], bloque: [], poids: 1, pct: Math.round(energieCache * 100) };
      }
      /* 0.58 : une source qui brûle un combustible et qui n'en a plus (ou presque plus) */
      const CB = D.ATELIERS.combustibles || {};
      D.ATELIERS.sources.forEach((s) => {
        const f = CB[s.id];
        if (!f || count(s.id) <= 0 || !machPool.some((w) => w.job !== null || w.cad !== null)) return;
        const reste = E.sourceReste(s.id);
        if (reste > D.ATELIERS.combustibleAlerte) return;
        liste["combu:" + s.id] = { id: "combu:" + s.id, kind: "combustible", fam: null, ing: f.id, ings: [], fams: [], bloque: [], poids: 4, src: s.id, arret: reste <= 0, reste: Math.ceil(reste) };
      });
      const PN = D.ATELIERS.pannes;
      if (PN) MACHINES.forEach((m) => {
        const u = E.usure(m);
        if (Math.floor(count(m)) <= 0 || (!u.pannes && u.valeur < PN.alerte)) return;
        liste["panne:" + m] = { id: "panne:" + m, kind: "panne", fam: null, ing: null, ings: [], fams: [], bloque: [], poids: 3, src: m, pannes: u.pannes };
      });
      const nom = (id) => ((item(id) && item(id).n) || id).toLowerCase();
      const maj = (s) => s.charAt(0).toUpperCase() + s.slice(1);
      const F = (f) => { const x = ((D.ATELIERS || {}).familles || []).find((y) => y.id === f); return x ? x.n : f; };
      return Object.values(liste).map((g) => {
        const lot = g.ings && g.ings.length ? g.ings.slice(0, 3).map(nom).join(", ") + (g.ings.length > 3 ? " et " + (g.ings.length - 3) + " autres" : "") : "";
        const n = g.kind === "main" || g.kind === "personne" ? lot : g.ing ? nom(g.ing) : "";
        let txt = "", action = null;
        if (g.kind === "extracteur") {
          txt = "Manque : " + n + ". Aucun extracteur n’en récolte";
          action = { k: "terres", id: g.ing, label: "Voir les Terres" };
          const cand = E.extFor(g.ing).filter((t) => S.known[t] && S.made[t] > 0).sort((a, b) => extRate(b, g.ing) - extRate(a, g.ing));
          const ext = cand.find((t) => E.orderStatus(t, 1).ok) || cand[0]; // le plus rapide que tu peux payer maintenant
          if (ext) {
            const q = queued(ext) > 0;
            const bat = S.ateliers && S.ateliers.construction && (S.ateliers.construction.app || S.ateliers.construction.ouv);
            if (q) { txt += ". Un chantier est en cours"; action = null; }
            else action = { k: "chantier", id: ext, res: g.ing, label: "Lancer le chantier : " + nom(ext), bat: !!bat };
          }
        }
        else if (g.kind === "lent") { txt = maj(n) + " part plus vite qu’il ne se récolte"; action = { k: "terres", id: g.ing, label: "Ajouter un extracteur" }; }
        else if (g.kind === "personne") {
          txt = "Manque : " + n + " (" + F(g.fam) + "). Personne n’y travaille";
          const kind = S.age >= TRAV.ouvrier.age ? "ouvrier" : S.age >= TRAV.apprenti.age ? "apprenti" : null;
          action = kind ? { k: "embaucher", fam: g.fam, kind, label: "Embaucher", cout: E.coutEmbauche(g.fam, kind) } : { k: "metier", fam: g.fam, label: "Ouvrir " + F(g.fam) };
        }
        else if (g.kind === "main") { txt = "Jamais fabriqué à la main : " + n + ". Les travailleurs ne le peuvent pas encore"; action = { k: "fabriquer", id: g.ings[0], fam: g.fam, label: "Le fabriquer une fois" }; }
        else if (g.kind === "inconnue") { txt = "La recette de " + n + " n’est pas encore connue"; action = { k: "labo", id: g.ing, label: "Au Labo" }; }
        else if (g.kind === "seuil0") { txt = F(g.fam) + " est au repos : on n’y fabrique rien seul"; action = { k: "metier", fam: g.fam, label: "Régler le seuil" }; }
        else if (g.kind === "seuil") { txt = maj(n) + " est au seuil de " + F(g.fam) + " et il en faut plus"; action = { k: "metier", fam: g.fam, label: "Monter le seuil" }; }
        else if (g.kind === "greve") { txt = F(g.fam) + " : les travailleurs sont en grève, ils ne fabriquent plus rien seuls"; action = { k: "prime", fam: g.fam, cout: E.primeCout(g.fam), label: "Verser une prime" }; }
        else if (g.kind === "panne") {
          const mn = (item(g.src) && item(g.src).n) || g.src;
          txt = g.pannes ? "En panne : " + mn + (g.pannes > 1 ? " (" + g.pannes + " exemplaires)" : "") : mn + " est très usé : une panne approche";
          action = { k: "reparer", id: g.src, cout: E.panneCout(), label: (g.pannes ? "Réparer" : "Entretenir") + " · " + E.panneCout() + " écus" };
        }
        else if (g.kind === "combustible") {
          const src = (item(g.src) && item(g.src).n || g.src).toLowerCase();
          txt = g.arret ? "La " + src + " est à l’arrêt : plus de " + nom(g.ing) + " en réserve" : "La " + src + " n’a plus que " + g.reste + " s de " + nom(g.ing);
          action = { k: "terres", id: g.ing, label: "Voir les Terres" };
        }
        else if (g.kind === "energie") { txt = "L’énergie manque : travailleurs et machines tournent à " + g.pct + " %"; action = { k: "energie", label: "Voir l’énergie" }; }
        return Object.assign(g, { txt, action });
      }).map((g) => { g.lie = lieObjectif(g); return g; })
        .sort((a, b) => (b.kind === "energie") - (a.kind === "energie") || b.lie - a.lie || b.poids - a.poids || a.id.localeCompare(b.id)); // 0.59 : ce qui touche l’objectif suivi passe devant
    };
    /* affecte les machines restées libres après les commandes aux cadences de maintien de stock, puis les travailleurs libres à leur métier */
    function assignCadenceWorkers() {
      const cads = (S.dom && S.dom.cadence) || {};
      const keys = Object.keys(cads).filter((rec) => {
        const cd = cads[rec], it = item(rec);
        if (!cd || cd.on === false || !it || !it.r) return false;
        if ((S.inv[rec] || 0) >= (cd.cap || 0) - 1e-9) return false;
        const cost = it.r[1];
        for (const i in cost) if ((S.inv[i] || 0) + 1e-9 < cost[i]) return false;
        return true;
      });
      const assigned = {};
      keys.forEach((k) => { assigned[k] = 0; });
      machPool.forEach((w) => {
        if (w.job !== null) return;
        let best = null, bestCnt = Infinity;
        for (const rec of keys) {
          if (!machReadyFor(w.m, rec)) continue;
          if (assigned[rec] < bestCnt) { best = rec; bestCnt = assigned[rec]; }
        }
        if (best) {
          w.cad = best;
          w.rec = best;
          assigned[best]++;
        }
      });
      if (!autoPossible()) return;
      autoReserve = autoReserveCalc();
      const cibles = {}, pris = {};
      machPool.forEach((w) => {
        if (w.job !== null || w.cad !== null) return;
        const wk = workerOf(w.m);
        if (!wk) return;
        if (S.ateliers && S.ateliers[wk.fam] && S.ateliers[wk.fam].greve) return; // en grève : rien de libre (la file de commandes, elle, continue)
        const liste = cibles[wk.fam] || (cibles[wk.fam] = autoCibles(wk.fam));
        let best = null, bestCnt = Infinity;
        for (const c of liste) {
          if (!machReadyFor(w.m, c.rec)) continue;
          const n = pris[c.rec] || 0;
          if (n < bestCnt) { best = c.rec; bestCnt = n; }
        }
        if (best) { w.cad = best; w.rec = best; pris[best] = (pris[best] || 0) + 1; }
      });
    }
    /* répartit les machines possédées et les mains sur les étapes prêtes des commandes */
    function assignWorkers() {
      syncMachPool();
      machPool.forEach((w) => { w.job = null; w.sIdx = -1; w.rec = null; w.cad = null; });
      hWork = { job: null, sIdx: -1, rec: null };
      if (!S.hand.q.length) {
        assignCadenceWorkers();
        return;
      }

      const jobResv = S.hand.q.map(() => ({}));
      const stepMachs = S.hand.q.map((j) => { syncJobPos(j); return j.s.map(() => 0); });

      // 1. Les machines : par priorité de commande, puis étape la plus profonde
      const idle = {}; // une sorte de machine qui n’a rien trouvé : les suivantes de la même sorte non plus
      machPool.forEach((w) => {
        if (idle[w.m]) return;
        idle[w.m] = true;
        for (let jIdx = 0; jIdx < S.hand.q.length; jIdx++) {
          const j = S.hand.q[jIdx], resv = jobResv[jIdx];
          if (j.paused) continue;
          for (let sIdx = 0; sIdx < j.s.length; sIdx++) {
            const rec = j.s[sIdx][0];
            if (!machReadyFor(w.m, rec, j)) continue;
            const aff = affordableUnits(j, sIdx, resv);
            if (aff < 1) continue;
            w.job = j; w.sIdx = sIdx; w.rec = rec;
            idle[w.m] = false;
            stepMachs[jIdx][sIdx]++;
            const cost = jobInputs(j, rec);
            for (const i in cost) resv[i] = (resv[i] || 0) + cost[i];
            return;
          }
        }
      });

      // 2. Les mains : d’abord ce qu’aucune machine ne peut faire, sinon comme une machine de plus
      for (let pass = 0; pass < 2 && !hWork.job; pass++) {
        for (let jIdx = 0; jIdx < S.hand.q.length && !hWork.job; jIdx++) {
          const j = S.hand.q[jIdx], resv = jobResv[jIdx];
          if (j.paused) continue;
          for (let sIdx = 0; sIdx < j.s.length; sIdx++) {
            const rec = j.s[sIdx][0];
            if (j.done[sIdx] >= j.s[sIdx][1]) continue;
            if (E.equipmentCheck && !j.ancienAtelier && E.equipmentJobCheck(rec, j, k => count(k) + (j.b[k] || 0))) continue;
            if (pass === 0 && anyOwnedMachReadyFor(rec)) continue;
            // Sur une étape où des machines travaillent déjà, les mains peuvent aider sur la même unité
            const checkResv = stepMachs[jIdx][sIdx] > 0 ? {} : resv;
            const aff = affordableUnits(j, sIdx, checkResv);
            if (aff < 1) continue;
            hWork = { job: j, sIdx, rec };
            if (stepMachs[jIdx][sIdx] === 0) {
              const it = item(rec), cost = isScaled(it) ? costFor(rec, count(rec)) : jobInputs(j, rec);
              for (const i in cost) resv[i] = (resv[i] || 0) + cost[i];
            }
            break;
          }
        }
      }

      // 3. Une commande sur laquelle personne ne peut avancer est en attente
      S.hand.q.forEach((j, jIdx) => {
        if (j.paused) { j.w = 0; return; }
        const anyM = stepMachs[jIdx].some((n) => n > 0);
        const anyH = hWork.job === j;
        j.w = j.paused ? 0 : (anyM || anyH ? 0 : 1);
      });

      // 4. Les machines restées libres après les commandes maintiennent les stocks configurés
      assignCadenceWorkers();
    }

    /* Lance une commande (avec planification récursive des sous-composants).
     * Démarre même s’il manque des matières premières : elles seront tirées de la Réserve. */
    // Même décision pour tous les boutons et pour l'exécution ; consulter ne dépense rien.
    E.orderStatus = function (id, times) {
      times = Math.max(1, Math.floor(times || 1));
      const it = item(id);
      if (!it || !it.r || !S.known[id]) return { ok: false, why: "none" };
      if (!ageOK(id)) return { ok: false, why: "age" };
      const b = blocker(id);
      if (b && b.why !== "equipment") return { ok: false, why: b.why, info: b };
      if (S.hand.q.length >= H.max) return { ok: false, why: "full" };
      if (isUnique(it)) {
        times = 1;
        if (queued(id) > 0) return { ok: false, why: "queued" };
      }
      const p = E.plan(id, times);
      if (p.locked.length || Object.keys(p.blocked).length) return { ok: false, why: "plan", plan: p };
      if (!p.steps.length) return { ok: false, why: "none" };
      // un extracteur ou une machine coûte plus cher à chaque exemplaire : pas de commande à crédit
      if (isScaled(it) && !p.ok) return { ok: false, why: "plan", plan: p };
      return { ok: true, plan: p, times };
    };
    E.order = function (id, times, to) {
      const status = E.orderStatus(id, times);
      if (!status.ok) return status;
      times = status.times;
      const it = item(id), p = status.plan;
      const bench = {};
      for (const i in p.used) {
        bench[i] = p.used[i];
        add(i, -bench[i]);
      }
      const miss = {};
      for (const i in p.missing) if (p.missing[i] > 0) miss[i] = p.missing[i];
      const last = S.hand.q[S.hand.q.length - 1];
      if (p.steps.length === 1 && last && !last.equipmentSelection && !last.ancienAtelier && !last.recettes020 && !last.recettes035 && S.hand.q.length > 1 && last.id === id && last.s.length === 1 && !stepDone(last, 0) && !isScaled(it) && !isUnique(it) && (last.to || null) === (to || null)) {
        last.s[0][1] += times;
        for (const i in bench) last.b[i] = (last.b[i] || 0) + bench[i];
        last.miss = last.miss || {};
        for (const i in miss) last.miss[i] = (last.miss[i] || 0) + miss[i];
        pullOrderInputs();
        assignWorkers();
        E.emit("hand", { kind: "add", job: last });
        return { ok: true, job: last, time: jobTime(last, false), missing: Object.keys(last.miss).length ? Object.assign({}, last.miss) : null, merged: true };
      }
      const nextUid = () => {
        S.hand.nextUid = (S.hand.nextUid || 0) + 1;
        return "j" + S.hand.nextUid;
      };
      const j = {
        uid: nextUid(), paused: false,
        id, s: p.steps, i: 0, k: 0,
        done: p.steps.map(() => 0), hMade: p.steps.map(() => 0), sp: p.steps.map(() => 0), mAcc: p.steps.map(() => 0),
        b: bench, miss
      };
      if (typeof to === "string") j.to = to;
      S.hand.q.push(j);
      pullOrderInputs();
      assignWorkers();
      E.emit("hand", { kind: "add", job: j });
      return { ok: true, job: j, time: jobTime(j, S.hand.q.length === 1), missing: Object.keys(j.miss).length ? Object.assign({}, j.miss) : null };
    };

    /* met une fabrication dans la file ; avec `chain`, ses sous-composants aussi.
     * `to` : le gisement ("x:zone:res") où poser ce qui sortira */
    E.queue = function (id, times, chain, to, selection) {
      if (selection && E.normMode) selection = { equipment: selection.equipment, mode: E.normMode(selection.mode) };
      times = Math.max(1, Math.floor(times || 1));
      const it = item(id);
      if (!it || !it.r || !S.known[id]) return { ok: false, why: "none" };
      if (!ageOK(id)) return { ok: false, why: "age" };
      if (D.CRAFT_EQUIPMENT && selection && !E.equipmentChoices(id).some(c=>c.ready&&c.equipment===selection.equipment&&c.mode===(E.normMode?E.normMode(selection.mode):selection.mode))) return {ok:false,why:"equipment"};
      if (S.hand.q.length >= H.max) return { ok: false, why: "full" };
      if (isUnique(it)) {
        times = 1;
        if (queued(id) > 0) return { ok: false, why: "queued" };
      }
      let steps, bench = {};
      if (chain) {
        const p = E.plan(id, times);
        if (!p.ok) return { ok: false, why: "plan", plan: p };
        steps = p.steps;
        for (const i in p.used) bench[i] = p.used[i];
      } else {
        const b = blocker(id);
        if (b) return { ok: false, why: b.why, info: b };
        bench = totalCost(id, times, count(id) + queued(id));
        const miss = {};
        let any = false;
        for (const i in bench) if ((S.inv[i] || 0) + 1e-9 < bench[i]) { miss[i] = Math.ceil(bench[i] - (S.inv[i] || 0)); any = true; }
        if (any) return { ok: false, why: "qty", missing: miss };
        steps = [[id, times]];
      }
      for (const i in bench) add(i, -bench[i]);
      // la même pièce, déjà en attente juste avant : on l’allonge au lieu d’empiler (taper vite = ×N)
      const last = S.hand.q[S.hand.q.length - 1];
      if (steps.length === 1 && last && JSON.stringify(last.equipmentSelection||null)===JSON.stringify(selection||null) && !last.ancienAtelier && !last.recettes020 && !last.recettes035 && S.hand.q.length > 1 && last.id === id && last.s.length === 1 && !stepDone(last, 0) && !isScaled(it) && !isUnique(it) && (last.to || null) === (to || null)) {
        last.s[0][1] += times;
        for (const i in bench) last.b[i] = (last.b[i] || 0) + bench[i];
        assignWorkers();
        E.emit("hand", { kind: "add", job: last });
        return { ok: true, job: last, time: jobTime(last, false), merged: true };
      }
      const nextUid = () => {
        S.hand.nextUid = (S.hand.nextUid || 0) + 1;
        return "j" + S.hand.nextUid;
      };
      const j = {
        uid: nextUid(), paused: false,
        id, s: steps, i: 0, k: 0,
        done: steps.map(() => 0), hMade: steps.map(() => 0), sp: steps.map(() => 0), mAcc: steps.map(() => 0),
        b: bench, miss: {}
      };
      if (D.CRAFT_EQUIPMENT && selection) j.equipmentSelection = {equipment:selection.equipment,mode:E.normMode?E.normMode(selection.mode):selection.mode};
      if (typeof to === "string") j.to = to;
      S.hand.q.push(j);
      assignWorkers();
      E.emit("hand", { kind: "add", job: j });
      return { ok: true, job: j, time: jobTime(j, S.hand.q.length === 1) };
    };
    function findJobIndex(target) {
      if (typeof target === "number") return target >= 0 && target < S.hand.q.length ? target : -1;
      if (typeof target === "string") {
        const byUid = S.hand.q.findIndex((x) => x.uid === target);
        if (byUid >= 0) return byUid;
        const n = Number(target);
        if (Number.isInteger(n) && n >= 0 && n < S.hand.q.length) return n;
        return -1;
      }
      if (target && typeof target === "object") return S.hand.q.findIndex((x) => x === target || (x.uid && x.uid === target.uid));
      return -1;
    }
    E.findJobIndex = findJobIndex;
    E.findJob = (target) => {
      const idx = findJobIndex(target);
      return idx >= 0 ? S.hand.q[idx] : null;
    };
    E.pauseJob = function (target) {
      const j = E.findJob(target);
      if (!j || j.paused) return false;
      j.paused = true;
      const idx = S.hand.q.indexOf(j);
      if (idx === 0) S.hand.p = 0;
      assignWorkers();
      E.emit("hand", { kind: "pause", job: j });
      return true;
    };
    E.resumeJob = function (target) {
      const j = E.findJob(target);
      if (!j || !j.paused) return false;
      j.paused = false;
      assignWorkers();
      E.emit("hand", { kind: "resume", job: j });
      return true;
    };
    E.togglePauseJob = function (target) {
      const j = E.findJob(target);
      if (!j) return null;
      if (j.paused) E.resumeJob(target);
      else E.pauseJob(target);
      return j.paused;
    };
    E.prioritizeJob = function (target) {
      const idx = findJobIndex(target);
      if (idx <= 0) return false;
      const j = S.hand.q[idx];
      S.hand.q.splice(idx, 1);
      S.hand.q.unshift(j);
      S.hand.p = 0;
      assignWorkers();
      E.emit("hand", { kind: "priority", job: j });
      return true;
    };
    E.cancelJob = function (target) {
      const idx = findJobIndex(target);
      if (idx < 0) return false;
      const j = S.hand.q[idx];
      for (const i in j.b) add(i, j.b[i]);
      S.hand.q.splice(idx, 1);
      if (idx === 0) S.hand.p = 0;
      assignWorkers();
      E.emit("hand", { kind: "cancel", job: j });
      return true;
    };
    /* la file des commandes, pour l’affichage : étape en cours, temps restant, ce qui manque et qui y travaille */
    E.handInfo = function () {
      assignWorkers();
      let t = 0;
      const jobs = S.hand.q.map((j, n) => {
        syncJobPos(j);
        const s = j.s[Math.min(j.i, j.s.length - 1)], left = jobTime(j, n === 0);
        if (!j.paused) t += left;
        const tot = Math.max(1e-6, j.s.reduce((a, x) => a + estStepTime(x[0], x[1], false, jobSelection(j,x[0])), 0));
        const totalCrafts = j.s.reduce((a, x) => a + x[1], 0);
        const doneCrafts = j.s.reduce((a, x, idx) => a + j.done[idx] + (j.sp[idx] || 0), 0);
        const machs = {};
        machPool.forEach((w) => {
          if (w.job !== j) return;
          const cur = machs[w.m] || (machs[w.m] = { n: 0, rec: w.rec });
          cur.n++;
        });
        const stepList = j.s.map(([sid, sn], idx) => {
          const hands = hWork.job === j && hWork.sIdx === idx;
          let mCnt = 0;
          const machByType = {};
          machPool.forEach((w) => {
            if (w.job === j && w.sIdx === idx) {
              mCnt++;
              machByType[w.m] = (machByType[w.m] || 0) + 1;
            }
          });
          return { id: sid, n: sn, done: j.done[idx], hands, machs: mCnt, machByType };
        });
        const activeStep = (hWork.job === j && hWork.rec) || (Object.values(machs)[0] && Object.values(machs)[0].rec) || s[0];
        const miss = j.miss && Object.keys(j.miss).length ? Object.assign({}, j.miss) : null;
        return {
          uid: j.uid,
          paused: !!j.paused,
          id: j.id, n: j.s[j.s.length - 1][1],
          done: j.done[j.s.length - 1], finalDone: j.done[j.s.length - 1],
          total: totalCrafts, doneCrafts,
          step: activeStep, k: j.k, of: s[1], i: j.i, steps: stepList,
          frac: totalCrafts ? Math.min(1, doneCrafts / totalCrafts) : 0,
          left: j.paused ? null : left, remTime: left, at: j.paused ? null : t, wait: !!j.w, tot, miss,
          hand: hWork.job === j ? hWork.rec : null,
          machs
        };
      });
      return { jobs, left: t, full: S.hand.q.length >= H.max };
    };
    function finishJob(j, offline) {
      for (const i in j.b) add(i, j.b[i]);
      const idx = S.hand.q.indexOf(j);
      if (idx >= 0) S.hand.q.splice(idx, 1);
      if (idx === 0) S.hand.p = 0;
      if (!offline) E.emit("hand", { kind: "done", job: j });
    }
    function workStep(dt, offline) {
      let left = dt, guard = 0;
      const c = E.cache();
      while (left > 1e-9 && S.hand.q.length && guard++ < 20000) {
        pullOrderInputs();
        // Nettoyer les commandes déjà terminées
        let cleaned = false;
        for (let i = 0; i < S.hand.q.length; i++) {
          const j = S.hand.q[i];
          syncJobPos(j);
          if (j.i >= j.s.length) { finishJob(j, offline); cleaned = true; break; }
        }
        if (cleaned) continue;

        assignWorkers();

        // Quelles étapes (j, sIdx) ont au moins un travailleur actif ?
        const active = [];
        S.hand.q.forEach((j) => {
          j.s.forEach((s, sIdx) => {
            const rec = s[0];
            const hOn = hWork.job === j && hWork.sIdx === sIdx;
            let mRate = 0, mCnt = 0;
            machPool.forEach((w) => {
              if (w.job === j && w.sIdx === sIdx) { mRate += machUnitRate(w.m, c, rec); mCnt++; }
            });
            if (!hOn && !mCnt) return;
            let hRate = 0, hDur = 0;
            if (hOn) {
              const q = (j.hMade[sIdx] || 0) + 1;
              hDur = Math.max(1e-6, handTime(rec, jobSelection(j,rec)) * (Math.pow(q, H.batch) - Math.pow(q - 1, H.batch)));
              hRate = 1 / hDur;
            }
            const rate = hRate + mRate;
            if (rate > 1e-9) {
              const needTime = Math.max(0, (1 - (j.sp[sIdx] || 0)) / rate);
              active.push({ j, sIdx, rec, hOn, hRate, hDur, mRate, mCnt, rate, needTime });
            }
          });
        });

        if (!active.length) break;

        // on avance jusqu’à la prochaine pièce finie, mais jamais par pas plus petits que
        // `quant` : les machines rapides finissent alors plusieurs pièces d’un coup
        const quant = offline ? 1 : 0.1;
        let stepDt = Infinity;
        active.forEach((a) => { if (a.needTime < stepDt) stepDt = a.needTime; });
        stepDt = Math.max(0, Math.min(left, Math.max(stepDt, quant)));
        left -= stepDt;

        for (const a of active) {
          const { j, sIdx, rec, hOn, mRate, mCnt, rate } = a;
          j.sp[sIdx] = (j.sp[sIdx] || 0) + rate * stepDt;
          if (mCnt > 0) {
            j.mAcc[sIdx] = (j.mAcc[sIdx] || 0) + mRate * stepDt;
            j.byMach = j.byMach || {};
            j.byMach[rec] = true;
            if (!S.flags.lineDone) { S.flags.lineDone = true; checkAges(); E.emit("struct"); }
          }
          if (hOn && S.hand.q[0] === j && sIdx === j.i) {
            const t = handTime(rec, jobSelection(j,rec));
            S.hand.p = t * Math.pow(j.hMade[sIdx] + Math.min(1, j.sp[sIdx]), H.batch);
          }
          if (j.sp[sIdx] + 1e-9 >= 1) {
            const it = item(rec);
            const one = isScaled(it) || isUnique(it);
            let k = Math.min(Math.floor(j.sp[sIdx] + 1e-9), j.s[sIdx][1] - j.done[sIdx], one ? 1 : Infinity);
            const unit = isScaled(it) ? costFor(rec, count(rec)) : jobInputs(j, rec);
            for (const i in unit) k = Math.min(k, Math.floor(((j.b[i] || 0) + (S.inv[i] || 0) + 1e-9) / unit[i]));
            j.sp[sIdx] = Math.min(1, Math.max(0, j.sp[sIdx] - Math.max(k, 1)));
            const cost = isScaled(it) ? unit : Object.fromEntries(Object.entries(unit).map(([id, n]) => [id, n * k]));
            if (!(k >= 1) || !take(cost, j.b)) { j.w = 1; continue; }
            const last = sIdx === j.s.length - 1;
            // Un outil neuf appartient à l'atelier dès sa fabrication : une
            // couture en attente ne le monopolise pas. Les anciens lots gardent
            // leurs aiguilles comme ingrédients réservés à leur ancien prix.
            const reusable = !j.ancienAtelier && E.isEquipmentItem && E.isEquipmentItem(rec);
            // les pièces payées par l’avance des machines sont à elles, le reste aux mains
            const km = mCnt > 0 ? (hOn ? Math.min(k, Math.floor(j.mAcc[sIdx] + 1e-9)) : k) : 0, kh = k - km;
            if (km > 0) {
              j.mAcc[sIdx] = Math.max(0, j.mAcc[sIdx] - km);
              const out = produce(rec, km);
              if (!last && !one && !reusable) { j.b[rec] = (j.b[rec] || 0) + out; markSeen(rec); }
              else add(rec, out);
              if (!offline) E.emit("handdone", { id: rec, n: out, bonus: out - it.r[2] * km, first: false, last, mach: true });
            }
            if (kh > 0) {
              j.hMade[sIdx] = (j.hMade[sIdx] || 0) + kh;
              const r = makeIt(rec, kh, offline || !last, last || reusable ? null : j.b);
              if (!offline) E.emit("handdone", { id: rec, n: r.n, bonus: r.bonus, first: r.first, last });
            }
            if (last && j.to) deliver(j.to, rec, k);
            j.done[sIdx] += k;
            syncJobPos(j);
            if (S.hand.q[0] === j && j.done[sIdx] >= j.s[sIdx][1]) S.hand.p = 0;
            if (j.i >= j.s.length) finishJob(j, offline);
          }
        }
      }
      pullOrderInputs();
      assignWorkers();
    }

    /* ------------------------------------------------------ l’action qui tourne
     * Récolter une matière en continu (▶). Continue jeu fermé. */
    E.startAct = function (a) {
      if (!a || a.k !== "harv") return null;
      if (!zoneOpen(a.z) || !ZONES[a.z].res.includes(a.res)) return null;
      S.act = { k: "harv", z: a.z, res: a.res, p: 0, got: 0 };
      E.emit("act", S.act);
      runAct(0, false);
      return S.act;
    };
    E.stopAct = function (why) {
      if (!S.act) return;
      const a = S.act;
      S.act = null;
      E.emit("actstop", { act: a, why: why || "stop" });
    };
    E.actInfo = function () {
      const a = S.act;
      if (!a || a.k !== "harv") return null;
      return { k: "harv", z: a.z, res: a.res, frac: a.p, dur: SK.harvest / skillSpeed("recolte"), got: a.got };
    };
    function runAct(dt, offline) {
      const a = S.act;
      if (!a) return;
      if (a.k === "harv") {
        if (!zoneOpen(a.z)) { E.stopAct("zone"); return; }
        if (!offline) {
          a.durOnline = (a.durOnline || 0) + dt;
          if (a.durOnline >= 1800) {
            addCurio("survivant");
          }
        }
        a.p += dt * skillSpeed("recolte") / SK.harvest;
        while (a.p >= 1) { a.p -= 1; a.got += E.tap(a.res, a.z); }
        return;
      }
      E.stopAct("stop");
      void offline;
    }

    /* ------------------------------------------------------ étude des matières
     * Contre un peu d’Intuition, on étudie une matière : on sait alors, pour chaque
     * geste connu, combien de recettes encore inconnues s’en servent (parmi celles
     * qu’on peut tenter avec des matières déjà vues). À l’Atelier, les matières
     * étudiées qui réagissent avec le geste choisi sont marquées. */
    E.studyCost = (id) => {
      let c = 1 + Math.floor((item(id).a || 0) / 4);
      if (E.hasEchoFin("silence")) c = Math.max(1, Math.ceil(c / 2));
      return c;
    };
    E.study = function (id) {
      if (!item(id) || S.studied[id] || !S.seen[id]) return false;
      const c = E.studyCost(id);
      if (S.intu < c) return false;
      S.intu -= c;
      S.studied[id] = 1;
      advanceRitual(2, 1);
      E.emit("struct");
      return true;
    };
    /* Étudier tout : toutes les ressources vues et pas encore étudiées, d’un coup. */
    const studiable = () => Object.keys(S.seen).filter((id) => item(id) && !S.studied[id] && !isUnique(item(id)) && !isScaled(item(id)));
    E.studyAllCost = function () {
      const ids = studiable();
      return { n: ids.length, c: ids.reduce((t, id) => t + E.studyCost(id), 0) };
    };
    E.studyAll = function () {
      const ids = studiable(), c = ids.reduce((t, id) => t + E.studyCost(id), 0);
      if (!ids.length || S.intu < c) return 0;
      S.intu -= c;
      for (const id of ids) S.studied[id] = 1;
      E.emit("struct");
      return ids.length;
    };
    /* Nombre de recettes encore à trouver avec cette ressource, toutes actions confondues. */
    E.usesLeft = (id) => { const r = E.reactions(id); let n = 0; for (const g in r) n += r[g]; return n; };
    E.reactions = function (id, eligible) {
      const out = {};
      for (const k in RECIPES) {
        const rid = RECIPES[k], it = item(rid);
        if (S.known[rid] || it.r[1][id] === undefined) continue;
        if (eligible && !eligible(rid)) continue;
        if (it.path && !gesteOK("accorder")) continue;
        if (!gesteOK(it.r[0]) || !Object.keys(it.r[1]).every((i) => S.seen[i])) continue;
        out[it.r[0]] = (out[it.r[0]] || 0) + 1;
      }
      return out;
    };

    /* Déchiffrer : révéler une recette inconnue du Carnet étape par étape contre de l’Intuition. */
    E.decipherCost = function (id) {
      const it = item(id);
      if (!it || !it.r || S.known[id] || it.sec || it.path) return null;
      if ((it.a || 0) > S.age + 1) return null;
      const lvl = S.hints[id] || 0;
      if (lvl >= 3) return null;
      let c = Math.round(D.DECHIFFRER.cost[lvl] * (1 + (it.a || 0)) * Object.keys(it.r[1]).length);
      if (E.hasEchoFin("silence")) c = Math.max(1, Math.ceil(c / 2));
      return c;
    };
    E.decipher = function (id) {
      const it = item(id);
      if (!it || !it.r) return { ok: false, why: "none" };
      if (S.known[id]) return { ok: false, why: "known" };
      if (it.sec || it.path) return { ok: false, why: "secret" };
      if ((it.a || 0) > S.age + 1) return { ok: false, why: "age" };
      const lvl0 = S.hints[id] || 0;
      if (lvl0 >= 3) return { ok: false, why: "known" };
      const c = E.decipherCost(id);
      if (S.intu < c) return { ok: false, why: "intu" };
      S.intu -= c;
      const lvl = lvl0 + 1;
      S.hints[id] = lvl;
      if (lvl >= 3) learn(id, true);
      E.emit("guidehint", { id, lvl });
      E.emit("struct");
      return { ok: true, lvl };
    };

    /* ------------------------------------------------------ carnet */
    E.carnet = function () {
      const out = [];
      const suivant = {}; // ce que l’objectif en cours demande, même s’il est de l’âge d’après
      { const g = E.guide && E.guide(); if (g) { if (g.step) suivant[g.step] = true; if (g.ob && g.ob.id) suivant[g.ob.id] = true; } }
      for (let a = 0; a <= Math.min(S.age + 1, D.AGES.length - 1); a++) {
        const list = [];
        for (const id in D.ITEMS) {
          const it = D.ITEMS[id];
          if (!it.r || it.a !== a || it.path) continue;
          if (it.sec && !S.known[id]) continue;
          if (a > S.age && !S.known[id] && !(S.made[id] > 0) && !suivant[id]) continue; // la porte de l’âge d’après : seulement l’objectif et ce qu’on a déjà trouvé
          list.push(id);
        }
        out.push({ age: a, ids: list });
      }
      return out;
    };
    E.pathRecipes = () => Object.keys(D.ITEMS).filter((id) => D.ITEMS[id].path);
    E.togglePin = function (id) {
      if (S.pins[id]) delete S.pins[id]; else S.pins[id] = true;
      E.emit("struct");
      return !!S.pins[id];
    };
    E.setTrack = function (id) {
      S.track = id && (!S.track || S.track.id !== id) ? { id } : null;
      E.emit("struct");
      return S.track;
    };

    /* ------------------------------------------------------ objectifs et guidage */
    function normObj(o, i) {
      if (Array.isArray(o)) return { i, k: "craft", id: o[0], txt: o[1] };
      return Object.assign({ i }, o);
    }
    function objDone(o) {
      if (Array.isArray(o)) return (S.made[o[0]] || 0) > 0;
      if (o.k === "exp") return (S.exp.done[o.z] || 0) > ZONES[o.z].exps.findIndex((x) => x.id === o.x);
      if (o.k === "line") return !!S.flags.lineDone;
      if (o.k === "ext") return !!S.flags.extDone;
      if (o.k === "pass") return !!(S.pass && S.pass[o.z] && S.pass[o.z].done) || (!PASS[o.z] && zoneOpen(o.z));
      return true;
    }
    /* Le premier objectif non atteint après le plus avancé déjà atteint :
     * un joueur avancé ne revient jamais sur une étape d’apprentissage qu’il a sautée. */
    E.objective = function () {
      let last = -1;
      D.OBJECTIVES.forEach((o, i) => { if (objDone(o)) last = i; });
      for (let i = last + 1; i < D.OBJECTIVES.length; i++) if (!objDone(D.OBJECTIVES[i])) {
        const ob = normObj(D.OBJECTIVES[i], i);
        // Fabriquer en avance la porte de l’âge d’après (le creuset, par exemple) fait « sauter » les étapes d’avant :
        // mais l’âge n’avance que lorsque ses étapes sont faites. Tant qu’il en reste, l’objectif en est une, pas un objet d’un âge plus loin.
        if (ageDeLEtape(i) > S.age) {
          const reste = D.OBJECTIVES.findIndex((o, j) => j < i && ageDeLEtape(j) === S.age && !objDone(o));
          if (reste >= 0) return normObj(D.OBJECTIVES[reste], reste);
        }
        return ob;
      }
      // plus rien devant : avoir fabriqué en avance le dernier objet ne doit pas effacer les étapes de l’âge qui restent
      const reste = D.OBJECTIVES.findIndex((o, j) => ageDeLEtape(j) === S.age && !objDone(o));
      return reste >= 0 ? normObj(D.OBJECTIVES[reste], reste) : null;
    };
    /* l’âge d’une étape : celui de l’objet qui la précède (comme dans milestones) */
    function ageDeLEtape(i) {
      let a = 0;
      for (let j = 0; j <= i; j++) { const o = D.OBJECTIVES[j], n = normObj(o, j); if (n.k === "craft") a = item(n.id).a; }
      return a;
    }
    /* Les jalons : les objectifs rangés par âge (une action prend l’âge de l’objet qui la précède). */
    E.milestones = function () {
      const out = [];
      let a = 0;
      D.OBJECTIVES.forEach((o, i) => {
        const n = normObj(o, i);
        if (n.k === "craft") a = item(n.id).a;
        (out[a] = out[a] || []).push({ i, ob: n, done: objDone(o) });
      });
      return out;
    };
    /* Prochaine étape concrète vers un objet : une sous-recette inconnue, une station
     * qui manque, ou la clé d’une zone fermée. */
    function nextStep(target) {
      const seen = {};
      function walk(id, d, need) {
        if (d > 14 || seen[id]) return null;
        seen[id] = true;
        const it = item(id);
        if (!it) return null;
        const zid = RES_ZONE[id];
        if (zid && zoneOpen(zid)) {
          // une ressource que seul un extracteur récolte : il faut d’abord celui-là
          if (!HAND[id] && EXT_OF[id] && !(count(EXT_OF[id]) > 0)) return walk(EXT_OF[id], d + 1, 1) || { id: EXT_OF[id], why: "known" };
          return null; // se récolte
        }
        if (!it.r) {
          // matière première d’une zone fermée : il faut la clé de la zone
          const req = zid && ZONES[zid].req;
          if (req && req[0] !== "@") return walk(req, d + 1, 1) || (S.pass[zid] && !S.pass[zid].done ? { id: req, why: "pass", z: zid } : { id: req, why: "zone", z: zid });
          return null;
        }
        const equipment = E.equipmentCheck && E.equipmentCheck(id);
        if (equipment && equipment.required !== id) return walk(equipment.required, d + 1, 1) || { id: equipment.required, why: "equipment" };
        // sinon (y compris le charbon avant les Profondeurs) : on la fabrique
        if (isUnique(it) && (S.made[id] || 0) > 0) return null;
        const g = it.r[0], o = it.r[3] || {};
        if (g !== "accorder" && (!gesteOK(g) || (o.heat && E.heat() < o.heat) || (o.lvl && E.level(g) < o.lvl))) {
          const st = stationFor(g, o.heat, o.lvl);
          if (st && st !== id) return walk(st, d + 1, 1) || { id: st, why: "station" };
        }
        for (const i of Object.keys(it.r[1])) {
          const q = it.r[1][i] * Math.ceil((need || 1) / (it.r[2] || 1));
          if ((S.inv[i] || 0) >= q) continue; // déjà en Réserve : sa recette n’est pas une étape
          const w = walk(i, d + 1, q);
          if (w) return w;
        }
        if (!S.known[id]) return { id, why: "unknown" };
        return null;
      }
      return walk(target, 0, 1) || { id: target, why: S.known[target] ? "known" : "unknown" };
    }
    E.nextStep = nextStep;
    E.guide = function () {
      const ob = E.objective();
      if (!ob) return null;
      if (ob.k === "exp") {
        const nx = E.nextExp(ob.z), need = nx && nx.x.need;
        const ids = typeof need === "string" ? [need] : Array.isArray(need) ? need : [];
        for (const id of ids) if (item(id) && item(id).r && !hasExpReq(id)) {
          const s = nextStep(id);
          return { ob, step: s.id, why: s.why, pour: id };
        }
        for (const [id, n] of Object.entries(nx && nx.x.cost || {})) if (item(id) && item(id).r && count(id) < n) {
          const s = nextStep(id);
          return { ob, step: s.id, why: s.why, pour: id };
        }
        return { ob, step: null };
      }
      if (ob.k === "pass") {
        // le passage ne s’ouvre qu’une fois les lieux de la terre explorés, et un lieu peut demander un objet (la torche de la grotte) : le guide y mène
        const l = ob.z && E.passLieux(ob.z), nx = l && l.left.length ? E.nextExp(l.z) : null, cost = (nx && !nx.locked && nx.x.cost) || {};
        for (const i of Object.keys(cost)) {
          if (!item(i) || !item(i).r || (S.inv[i] || 0) >= cost[i]) continue;
          const s = nextStep(i);
          if (s && s.why === "unknown") return { ob, step: s.id, why: s.why, pour: i };
        }
        // Le paiement peut lui aussi demander une recette encore inconnue (briques, plaques…).
        const p = E.passInfo(ob.z);
        for (const i of Object.keys((p && p.left) || {})) {
          if (!item(i) || !item(i).r || (S.inv[i] || 0) >= p.left[i]) continue;
          const s = nextStep(i);
          if (s && s.why === "unknown") return { ob, step: s.id, why: s.why, pour: i, passageCost: true };
        }
        return { ob, step: null };
      }
      if (ob.k !== "craft") return { ob, step: null };
      const s = nextStep(ob.id);
      return { ob, step: s.id, why: s.why };
    };
    /* Réminiscences : des indices gratuits et progressifs, gagnés en cherchant.
     * Chaque combinaison nouvelle essayée à l’Atelier (et qui ne donne rien) fait
     * remonter des souvenirs sur l’étape en cours ; d’autant plus qu’elle s’en
     * approche (même geste, ingrédients en commun). Attendre ne donne rien, refaire
     * le même essai non plus. */
    function remember(g, ids) {
      const k = keyOf(g, ids);
      if (S.tried[k]) return 0;
      S.tried[k] = 1;
      const gd = E.guide();
      if (!gd || !gd.step || S.known[gd.step]) return 0;
      const it = item(gd.step);
      let pts = 1;
      if (it.r[0] === g) pts++;
      ids.forEach((i) => { if (it.r[1][i] !== undefined) pts++; });
      if (S.gt.id !== gd.step) S.gt = { id: gd.step, p: 0 };
      S.gt.p += pts;
      const lvl = S.hints[gd.step] || 0;
      let target = 0;
      D.GUIDE.tries.forEach((n, i) => { if (S.gt.p >= n) target = i + 1; });
      if (target > lvl) {
        S.hints[gd.step] = target;
        if (target >= 3) learn(gd.step, true);
        E.emit("guidehint", { id: gd.step, lvl: target });
        E.emit("struct");
      }
      return pts;
    }
    E.remember = remember;
    /* où en sont les souvenirs de l’étape en cours : { p, next } (points, seuil suivant) */
    E.memory = function () {
      const gd = E.guide();
      if (!gd || !gd.step || S.known[gd.step]) return null;
      const lvl = S.hints[gd.step] || 0, p = S.gt.id === gd.step ? S.gt.p || 0 : 0;
      const next = D.GUIDE.tries[lvl];
      return next === undefined ? null : { id: gd.step, p, prev: lvl ? D.GUIDE.tries[lvl - 1] : 0, next, lvl };
    };

    /* ------------------------------------------------------ explorations */
    function hasExpReq(need) {
      if (!need) return true;
      if (typeof need === "string") {
        return ((S.made && S.made[need]) > 0) || ((S.inv && S.inv[need]) > 0);
      }
      if (Array.isArray(need)) {
        return need.every((id) => ((S.made && S.made[id]) > 0) || ((S.inv && S.inv[id]) > 0));
      }
      if (typeof need === "object") {
        return cond(need);
      }
      return true;
    }
    E.hasExpReq = hasExpReq;

    function canExplore(zid, xid) {
      const z = ZONES[zid];
      if (!z || !z.exps) return false;
      let x;
      if (xid !== undefined) {
        x = typeof xid === "number" ? z.exps[xid] : z.exps.find((e) => e.id === xid);
      } else {
        const n = E.nextExp(zid);
        if (!n) return false;
        x = n.x;
      }
      if (!x) return false;
      if (x.show && !cond(x.show)) return false;
      if (x.need && !hasExpReq(x.need)) return false;
      return true;
    }
    E.canExplore = canExplore;

    E.nextExp = function (zid) {
      const z = ZONES[zid];
      const i = S.exp.done[zid] || 0;
      if (!z.exps || i >= z.exps.length) return null;
      const x = z.exps[i];
      if (x.cote) return null; // un lieu d’à côté ne fait pas partie de la file : il s’ouvre par une fouille
      if (x.show && !cond(x.show)) return null;
      const locked = x.need ? !hasExpReq(x.need) : false;
      return { x, i, locked };
    };
    E.expMult = () => E.cache().exp;
    E.startExp = function (zid, xid) {
      if (S.exp.active) return { ok: false, why: "busy" };
      let n = E.nextExp(zid);
      if (xid) { // un lieu d’à côté, déjà trouvé et pas encore exploré
        const i = ZONES[zid].exps.findIndex((e) => e.id === xid && e.cote);
        n = i >= 0 && E.coteEtat(zid, xid) === 1 ? { x: ZONES[zid].exps[i], i, locked: ZONES[zid].exps[i].need ? !hasExpReq(ZONES[zid].exps[i].need) : false, cote: true } : null;
      }
      if (!n || n.locked) return { ok: false, why: "none" };
      const x = n.x;
      if (x.cost) {
        for (const i in x.cost) if (count(i) < x.cost[i]) return { ok: false, why: "cost", missing: i };
        for (const i in x.cost) add(i, -x.cost[i]);
      }
      S.exp.active = { z: zid, i: n.i, t0: now(), dur: (x.dur * 1000) / E.expMult() };
      if (n.cote) S.exp.active.cote = true;
      E.emit("struct");
      return { ok: true };
    };
    E.expProgress = function () {
      const a = S.exp.active;
      if (!a) return null;
      return { z: a.z, i: a.i, p: Math.min(1, (now() - a.t0) / a.dur), left: Math.max(0, (a.t0 + a.dur - now()) / 1000) };
    };
    /* ----------------------------------------------------------- RÉCIT, LIVRE & QUESTIONS */
    function cond(c) {
      if (!c || typeof c !== "object") return true;
      const keys = Object.keys(c);
      if (keys.length === 0) return true;
      for (const k of keys) {
        const v = c[k];
        if (k === "frag") {
          if (!S.frags || !S.frags[v]) return false;
        } else if (k === "page") {
          const pKey = typeof v === "number" ? (v < 10 ? "p0" + v : "p" + v) : v;
          if (!S.livre || !S.livre.p || (!S.livre.p[v] && !S.livre.p[pKey])) return false;
        } else if (k === "signe" || k === "glyph") {
          if (!S.signes || !S.signes[v] || !S.signes[v].lu) return false;
        } else if (k === "made") {
          if (!((S.made && S.made[v]) > 0)) return false;
        } else if (k === "has") {
          if (!((S.inv && S.inv[v]) > 0)) return false;
        } else if (k === "flag") {
          if (!S.flags || !S.flags[v]) return false;
        } else if (k === "secret") {
          if (!S.secrets || !S.secrets[v]) return false;
        } else if (k === "ending") {
          if (!S.meta || !S.meta.endings || !S.meta.endings[v]) return false;
        } else if (k === "marque") {
          if (!(((S.meta && S.meta.marque) || 0) >= Number(v))) return false;
        } else if (k === "visible") {
          if (!projVisible(v)) return false;
        } else if (k === "registre") {
          if (!!(S.flags.registre || (S.secrets && S.secrets.cregistre)) !== !!v) return false;
        } else if (k === "feuillet") {
          if (!(S.meta && S.meta.feuillets && S.meta.feuillets[v])) return false;
        } else if (k === "libere") {
          if (!S.meta || !S.meta.endings || !S.meta.endings.retour) return false;
        } else if (k === "cycle") {
          if (!((S.cycle || 1) >= Number(v))) return false;
        } else if (k === "age") {
          if (!((S.age || 0) >= Number(v))) return false;
        } else if (k === "exp") {
          if (typeof v !== "string") return false;
          const parts = v.split(":");
          const zid = parts[0], xid = parts[1];
          const z = ZONES[zid];
          if (!z || !z.exps) return false;
          const idx = z.exps.findIndex((x) => x.id === xid);
          if (idx < 0) return false;
          if (z.exps[idx].cote) return !!(S.meta && S.meta.cotes && S.meta.cotes[zid + ":" + xid] === 2);
          if (!((S.exp && S.exp.done && S.exp.done[zid]) > idx)) return false;
        } else if (k === "all") {
          if (!Array.isArray(v) || !v.every(cond)) return false;
        } else if (k === "any") {
          if (!Array.isArray(v) || !v.some(cond)) return false;
        } else if (k === "not") {
          if (cond(v)) return false;
        } else {
          return false;
        }
      }
      return true;
    }
    E.cond = cond;

    function givePage(id, src) {
      S.livre = S.livre || { p: {}, vu: {} };
      S.livre.p = S.livre.p || {};
      S.livre.vu = S.livre.vu || {};
      if (S.livre.p[id]) return false;
      S.livre.p[id] = 1;
      stamp("p:" + id);
      const page = (RECIT.pages && RECIT.pages[id]) || {};
      E.emit("page", { id, n: page.n, src });
      E.emit("struct");
      return true;
    }
    E.givePage = givePage;
    E.hasPage = (id) => !!(S.livre && S.livre.p && S.livre.p[id]);

    E.readPage = function (id) {
      if (!S.livre || !S.livre.p || !S.livre.p[id]) return;
      const p = RECIT.pages && RECIT.pages[id];
      const vis = p && p.notes ? p.notes.filter((note) => !note.cond || cond(note.cond)).length : 0;
      S.livre.vu = S.livre.vu || {};
      S.livre.vu[id] = vis;
      E.emit("struct");
    };

    E.livre = function () {
      const res = [];
      const numToId = {};
      if (RECIT.pages) {
        for (const id in RECIT.pages) {
          const num = RECIT.pages[id].n;
          if (num >= 1 && num <= 32) numToId[num] = id;
        }
      }
      for (let n = 1; n <= 32; n++) {
        const id = numToId[n];
        if (id && S.livre && S.livre.p && S.livre.p[id]) {
          const p = RECIT.pages[id];
          const visNotes = (p.notes || []).filter((note) => !note.cond || cond(note.cond));
          const vuCount = (S.livre.vu && typeof S.livre.vu[id] === "number") ? S.livre.vu[id] : -1;
          const nouveau = vuCount === -1 || visNotes.length > vuCount;
          res.push({
            n,
            id,
            page: p,
            notes: visNotes,
            nouveau
          });
        } else {
          res.push({
            n,
            id: null,
            page: null,
            notes: [],
            nouveau: false
          });
        }
      }
      return res;
    };

    E.hasLivre = () => !!(S.livre && S.livre.p && Object.keys(S.livre.p).length > 0) || !!(S.meta && S.meta.feuillets && Object.keys(S.meta.feuillets).length);
    E.hasNewLivre = () => E.livre().some((c) => c.nouveau) || E.feuillets().some((f) => f.nouveau);

    /* ------------------------------------------------------- FEUILLETS ET NOTES DE NUIT
     * Rangés dans la méta (gardés à la relève) : { id: 1 }. Les notes de nuit ont pour id
     * « n<cuve>_<rang> ». */
    function giveFeuillet(id, src) {
      S.meta.feuillets = S.meta.feuillets || {};
      if (S.meta.feuillets[id]) return false;
      S.meta.feuillets[id] = 1;
      stamp("l:" + id);
      E.emit("feuillet", { id, src });
      E.emit("struct");
      return true;
    }
    E.giveFeuillet = giveFeuillet;
    function feuilletDef(id) {
      const F = RECIT.feuillets || {};
      if (F[id]) return { id, sig: F[id].qui, t: F[id].t, nuit: false };
      const m = /^n(\d+)_(\d)$/.exec(id);
      const N = m && RECIT.nuits && RECIT.nuits[m[1]];
      if (N && N.t[+m[2] - 1]) return { id, sig: N.sig, t: N.t[+m[2] - 1], nuit: true };
      return null;
    }
    E.feuillets = function () {
      const got = (S.meta && S.meta.feuillets) || {};
      const st = (S.meta && S.meta.stamps) || {};
      const vu = (S.meta && S.meta.feuilletsVus) || {};
      return Object.keys(got).map(feuilletDef).filter(Boolean)
        .map((f) => Object.assign(f, { nouveau: !vu[f.id], t0: (st["l:" + f.id] || [0])[0] }))
        .sort((a, b) => a.t0 - b.t0);
    };
    E.readFeuillets = function () {
      S.meta.feuilletsVus = S.meta.feuilletsVus || {};
      for (const id in S.meta.feuillets || {}) S.meta.feuilletsVus[id] = 1;
      E.emit("struct");
    };
    /* une note de nuit : au retour d’une absence d’au moins deux heures, à partir du cycle 2 */
    function nuit() {
      if ((S.cycle || 1) < 2 || E.isLibere()) return null;
      const cuve = 7 + (((S.cycle || 1) - 1) % 6);
      const N = RECIT.nuits && RECIT.nuits[cuve];
      if (!N) return null;
      S.meta.nuits = S.meta.nuits || {};
      const k = (S.meta.nuits[cuve] || 0) + 1;
      if (k > N.t.length) return null;
      S.meta.nuits[cuve] = k;
      const id = "n" + cuve + "_" + k;
      giveFeuillet(id, "nuit");
      return id;
    }
    E.nuit = nuit;
    /* Les noms : donner au Semeur de ce cycle le nom de l’enfant de sa cuve. Un essai par éveil ;
     * un autre nom est gardé comme surnom. Le même enfant renommé un tour plus tard : le visage. */
    E.nommer = function (txt) {
      const norm = normSigne(txt);
      if (!norm) return { ok: false, why: "empty" };
      S.meta.nomCycle = S.meta.nomCycle || 0;
      if (S.meta.nomCycle === S.cycle) return { ok: false, why: "deja" };
      S.meta.nomCycle = S.cycle;
      S.meta.nomsDonnes = S.meta.nomsDonnes || {};
      S.meta.nomsDonnes[S.cycle] = String(txt).trim().slice(0, 24);
      const cuve = 7 + (((S.cycle || 1) - 1) % 6);
      const vrai = RECIT.noms && RECIT.noms[cuve];
      if (!vrai || normSigne(vrai) !== norm) { E.emit("struct"); return { ok: false, surnom: true }; }
      S.meta.nommes = S.meta.nommes || {};
      const avant = (S.meta.nommes[cuve] || []).filter((c) => c < S.cycle);
      (S.meta.nommes[cuve] = S.meta.nommes[cuve] || []).push(S.cycle);
      S.meta.nomsDonnes[S.cycle] = vrai;
      addSecret("noms");
      const revoila = avant.length > 0;
      if (revoila) addSecret("visage");
      E.emit("struct");
      return { ok: true, revoila };
    };
    E.nomDuCycle = () => (S.meta && S.meta.nomsDonnes && S.meta.nomsDonnes[S.cycle]) || null;
    E.peutNommer = () => !!(S.meta && S.meta.nomCycle !== S.cycle) && !E.isLibere();

    /* le septième trait : une fenêtre de relève, trente secondes sans toucher (une fois par éveil) */
    E.graverTrait = function () {
      S.meta.marque = S.meta.marque || 0;
      if (S.meta.marque >= 3 || S.meta.marqueCycle === S.cycle) return 0;
      S.meta.marque++;
      S.meta.marqueCycle = S.cycle;
      stamp("t:" + S.meta.marque);
      E.emit("struct");
      return S.meta.marque;
    };
    E.marque = () => (S.meta && S.meta.marque) || 0;

    function checkPageSources() {
      for (const fid in RECIT.feuillets || {}) {
        if (S.meta.feuillets && S.meta.feuillets[fid]) continue;
        const src = RECIT.feuillets[fid].src || [];
        if (src.some((x) => x.k === "cond" && cond(x.c))) giveFeuillet(fid, "cond");
      }
      if (!RECIT.pages) return;
      for (const id in RECIT.pages) {
        if (S.livre && S.livre.p && S.livre.p[id]) continue;
        const page = RECIT.pages[id];
        if (!page.src) continue;
        for (const s of page.src) {
          if (s.k === "cond" && cond(s.c)) {
            givePage(id, "cond");
            break;
          }
        }
      }
    }
    E.checkPageSources = checkPageSources;

    E.buyablePages = function () {
      const list = [];
      if (!RECIT.pages) return list;
      for (const id in RECIT.pages) {
        if (S.livre && S.livre.p && S.livre.p[id]) continue;
        const page = RECIT.pages[id];
        if (!page.src) continue;
        for (const s of page.src) {
          if (s.k === "buy" && typeof s.ecus === "number") {
            list.push({ id, n: page.n, titre: page.titre, ecus: s.ecus });
            break;
          }
        }
      }
      list.sort((a, b) => a.n - b.n);
      for (const fid in RECIT.feuillets || {}) {
        if (S.meta.feuillets && S.meta.feuillets[fid]) continue;
        const b = (RECIT.feuillets[fid].src || []).find((x) => x.k === "buy");
        if (b) list.push({ id: "f:" + fid, n: 0, titre: "", feuillet: true, ecus: b.ecus });
      }
      return list;
    };

    E.buyPage = function (id) {
      const isF = String(id).indexOf("f:") === 0;
      if (!isF && (!RECIT.pages || !RECIT.pages[id])) return { ok: false, why: "nopage" };
      if (!isF && S.livre && S.livre.p && S.livre.p[id]) return { ok: false, why: "already" };
      const buyable = E.buyablePages().find((p) => p.id === id);
      if (!buyable) return { ok: false, why: "notbuyable" };
      if ((S.ecus || 0) < buyable.ecus) return { ok: false, why: "ecus" };
      S.ecus -= buyable.ecus;
      if (buyable.feuillet) giveFeuillet(id.slice(2), "buy");
      else givePage(id, "buy");
      E.emit("struct");
      return { ok: true, id };
    };

    E.revisit = function (fragId) {
      const F = D.FRAGS && D.FRAGS[fragId];
      if (!F || !Array.isArray(F.revisit)) return null;
      for (let i = 0; i < F.revisit.length; i++) {
        const r = F.revisit[i];
        if (!r.cond || cond(r.cond)) {
          return { frag: fragId, index: i, t: r.t };
        }
      }
      return null;
    };

    E.visibleFrags = function () {
      const arch = new Set(RECIT.archive || []);
      return Object.keys(D.FRAGS).filter((id) => !arch.has(id));
    };

    E.questionCost = function (id) {
      const q = RECIT.questions && RECIT.questions[id];
      if (!q) return null;
      const lvl = (S.questions && S.questions[id] && S.questions[id].lvl) || 0;
      if (lvl >= 3 || (q.aides && lvl >= q.aides.length)) return null;
      const cfg = RECIT.aide || { base: 5, mult: 3 };
      const age = S.age || 0;
      let c = cfg.base * (1 + age) * Math.pow(cfg.mult, lvl);
      if (E.hasEchoFin("silence")) c = Math.max(1, Math.ceil(c / 2));
      return c;
    };

    E.questions = function () {
      const list = [];
      if (!RECIT.questions) return list;
      S.questions = S.questions || {};
      for (const id in RECIT.questions) {
        const q = RECIT.questions[id];
        const active = !!S.questions[id] || !q.quand || cond(q.quand);
        if (active) {
          if (!S.questions[id]) { S.questions[id] = { lvl: 0 }; stamp("q:" + id); }
          const lvl = S.questions[id].lvl || 0;
          const resolu = !!(q.resolu && cond(q.resolu));
          if (resolu) stamp("qr:" + id);
          const cost = E.questionCost(id);
          list.push({
            id,
            titre: q.titre,
            lvl,
            resolu,
            aides: (q.aides || []).slice(0, lvl),
            cost
          });
        }
      }
      return list;
    };

    E.hasQuestions = () => E.questions().length > 0;

    E.askHelp = function (id) {
      const q = RECIT.questions && RECIT.questions[id];
      if (!q) return { ok: false, why: "noquestion" };
      S.questions = S.questions || {};
      if (!S.questions[id]) S.questions[id] = { lvl: 0 };
      const curLvl = S.questions[id].lvl || 0;
      const maxLvl = q.aides ? q.aides.length : 3;
      if (curLvl >= maxLvl || curLvl >= 3) return { ok: false, why: "max", lvl: curLvl };
      const cost = E.questionCost(id);
      if (cost === null) return { ok: false, why: "max", lvl: curLvl };
      if ((S.intu || 0) < cost) return { ok: false, why: "intu", lvl: curLvl, cost };
      S.intu -= cost;
      S.questions[id].lvl = curLvl + 1;
      E.emit("struct");
      return { ok: true, lvl: S.questions[id].lvl };
    };

    /* ------------------------------------------------------------- SIGNES */
    const LEADING_ARTICLES = new Set(["le", "la", "les", "l", "un", "une", "des", "du", "de", "d"]);
    const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

    function normSigne(txt) {
      if (txt === null || txt === undefined) return "";
      let s = String(txt).toLowerCase();
      s = s.replace(/œ/g, "oe").replace(/æ/g, "ae");
      s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      s = s.replace(/['’`´]/g, " ");
      s = s.replace(/[^a-z0-9\s]/g, " ");
      let words = s.trim().split(/\s+/).filter(Boolean);
      while (words.length > 1 && LEADING_ARTICLES.has(words[0])) {
        words.shift();
      }
      return words.join(" ");
    }

    function fnv1a32(str) {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(16).padStart(8, "0");
    }

    function isProche(norm, okSet) {
      if (!norm || !okSet || okSet.size === 0) return false;
      const len = norm.length;
      if (len > 1) {
        for (let i = 0; i < len; i++) {
          const v = norm.slice(0, i) + norm.slice(i + 1);
          if (okSet.has(fnv1a32(v))) return true;
        }
      }
      for (let i = 0; i < len; i++) {
        const cur = norm[i];
        const prefix = norm.slice(0, i);
        const suffix = norm.slice(i + 1);
        for (let c = 0; c < 26; c++) {
          const ch = ALPHABET[c];
          if (ch !== cur) {
            const v = prefix + ch + suffix;
            if (okSet.has(fnv1a32(v))) return true;
          }
        }
      }
      for (let i = 0; i <= len; i++) {
        const prefix = norm.slice(0, i);
        const suffix = norm.slice(i);
        for (let c = 0; c < 26; c++) {
          const ch = ALPHABET[c];
          const v = prefix + ch + suffix;
          if (okSet.has(fnv1a32(v))) return true;
        }
      }
      return false;
    }

    E.normSigne = normSigne;
    E.fnv1a32 = fnv1a32;
    E.empreinte = (txt) => fnv1a32(normSigne(txt));

    E.essaiSigne = function (id, txt) {
      const rec = opts.recit || D.RECIT || {};
      if (!rec.signes || !rec.signes[id]) {
        return { ok: false, proche: false, why: "nosign" };
      }
      const sDef = rec.signes[id];
      if (sDef.cond && !cond(sDef.cond)) {
        return { ok: false, proche: false, why: "cond" };
      }
      S.signes = S.signes || {};
      if (!S.signes[id]) S.signes[id] = { vu: {} };
      const st = S.signes[id];
      st.vu = st.vu || {};

      if (st.lu) {
        return { ok: true, proche: false, mot: sDef.mot, deja: true };
      }

      const curTime = now();
      const delaiSec = (typeof rec.signeDelai === "number") ? rec.signeDelai : 3;
      const delaiMs = delaiSec * 1000;
      if (st.last && (curTime - st.last < delaiMs)) {
        const left = Math.max(1, Math.ceil((delaiMs - (curTime - st.last)) / 1000));
        return { ok: false, proche: false, delai: true, left, why: "delai" };
      }
      st.last = curTime;
      st.essais = (st.essais || 0) + 1;

      const norm = normSigne(txt);
      if (!norm) {
        return { ok: false, proche: false, why: "empty" };
      }
      const h = fnv1a32(norm);
      const okSet = new Set(sDef.ok || []);

      if (okSet.has(h)) {
        st.lu = 1;
        stamp("s:" + id);
        if (id === "nourrice") addSecret("signature"); // l’ornement des scènes devient une signature
        advanceRitual(2, 1);
        E.emit("signe", { id, mot: sDef.mot });
        return { ok: true, proche: false, mot: sDef.mot };
      }

      const proche = isProche(norm, okSet);
      return { ok: false, proche };
    };

    E.seeSigne = function (id, lieu) {
      const rec = opts.recit || D.RECIT || {};
      if (!rec.signes || !rec.signes[id]) return;
      S.signes = S.signes || {};
      if (!S.signes[id]) S.signes[id] = { vu: {} };
      S.signes[id].vu = S.signes[id].vu || {};
      if (lieu) {
        S.signes[id].vu[String(lieu)] = 1;
      }
    };

    E.seenSignes = function () {
      const rec = opts.recit || D.RECIT || {};
      if (!S.signes || !rec.signes) return [];
      const list = [];
      for (const id in rec.signes) {
        const st = S.signes[id];
        if (!st) continue;
        const places = (st.vu && typeof st.vu === "object") ? Object.keys(st.vu) : [];
        if (places.length > 0 || st.lu) {
          list.push({
            id,
            def: rec.signes[id],
            lu: !!st.lu,
            lieux: places,
            count: places.length
          });
        }
      }
      return list;
    };

    E.hasSignes = function () {
      const rec = opts.recit || D.RECIT || {};
      if (!S.signes || !rec.signes) return false;
      for (const id in S.signes) {
        if (!rec.signes[id]) continue;
        const st = S.signes[id];
        if (!st) continue;
        if (st.lu) return true;
        if (st.vu && Object.keys(st.vu).length > 0) return true;
      }
      return false;
    };

    function finishExp(silent) {
      const a = S.exp.active;
      const x = ZONES[a.z].exps[a.i];
      S.exp.active = null;
      if (x.cote) { S.meta.cotes = S.meta.cotes || {}; S.meta.cotes[a.z + ":" + x.id] = 2; } // un lieu d’à côté ne compte pas dans la file
      else S.exp.done[a.z] = (S.exp.done[a.z] || 0) + 1;
      const locKey = a.z + ":" + x.id;
      if (RECIT.pages) {
        for (const pid in RECIT.pages) {
          if (S.livre && S.livre.p && S.livre.p[pid]) continue;
          const page = RECIT.pages[pid];
          if (!page.src) continue;
          for (const s of page.src) {
            if (s.k === "exp" && s.at === locKey) {
              givePage(pid, "exp");
              break;
            }
          }
        }
      }
      const rw = x.rw || {};
      if (rw.inv) for (const i in rw.inv) add(i, rw.inv[i]);
      if (rw.item) for (const i in rw.item) add(i, rw.item[i]);
      if (rw.intu) { S.intu += rw.intu; donIntu(rw.intu); }
      if (rw.flag) S.flags[rw.flag] = true;
      if (rw.flag === "caveau") unlockZone("caveau");
      if (rw.flag === "registre") openRegistre();
      for (const fid in RECIT.feuillets || {}) {
        if ((RECIT.feuillets[fid].src || []).some((x) => x.k === "exp" && x.at === locKey)) giveFeuillet(fid, "exp");
      }
      if (rw.secret) addSecret(rw.secret);
      if (a.z === "riviere" && S.cycle === 9 && !E.hasCurio("anneau") && count("anneau_lourd") === 0) {
        add("anneau_lourd", 1);
        E.emit("toast", "💍 Au fond du gué, un anneau tout simple.");
      }
      let fragId = rw.frag;
      if (RECIT.expFrag && RECIT.expFrag[locKey]) {
        fragId = RECIT.expFrag[locKey];
      }
      let fragNew = false;
      let revisit = null;
      if (fragId) {
        if (!S.frags[fragId]) {
          fragNew = addFrag(fragId, true);
        } else {
          revisit = E.revisit(fragId);
          if (revisit) {
            S.revus = S.revus || {};
            S.revus[fragId + ":" + revisit.index] = 1;
            stamp("r:" + fragId + ":" + revisit.index);
          }
        }
      }
      E.emit("expdone", { z: a.z, x, frag: fragId, fragNew, revisit, silent });
      checkAges();
      E.emit("struct");
    }

    /* l’horodatage du Journal (0.7.1) : quand une entrée est apparue, à quel cycle et à quel âge.
     * Clés : « f:fragment », « r:fragment:n » (revisite), « p:page », « s:signe », « q:question », « qr:question ».
     * Rangé dans la méta : gardé à la relève. Une entrée d’avant 0.7.1 n’a pas de date (on n’en invente pas). */
    function stamp(k) {
      const m = S.meta;
      m.stamps = m.stamps || {};
      if (!(k in m.stamps)) m.stamps[k] = [now(), S.cycle || 1, S.age || 0];
      return m.stamps[k];
    }
    E.stamp = stamp;
    E.stampOf = (k) => (S.meta && S.meta.stamps && S.meta.stamps[k]) || null;

    function addFrag(fid, quiet) {
      if (S.frags[fid]) return false;
      S.frags[fid] = true;
      stamp("f:" + fid);
      advanceRitual(2, 1);
      S.intu += 1;
      if (S.flags.arche && D.ARCHE[fid]) archeSay(fid);
      if (!quiet) E.emit("frag", fid);
      return true;
    }
    E.addFrag = addFrag;

    /* ------------------------------------------------------ ARCHE */
    function archeSay(key) {
      if (E.isLibere()) return; // après Matines, plus d’ARCHE
      let lines = D.ARCHE[key];
      if (!lines) return;
      if (!Array.isArray(lines) && typeof lines === "object") {
        const c = S.cycle || 1;
        if (lines[c]) lines = lines[c];
        else if (c >= 14 && lines["cycle14"]) lines = lines["cycle14"];
        else if (c >= 7 && lines["cycle7"]) lines = lines["cycle7"];
        else if (c >= 2 && lines["cycle2"]) lines = lines["cycle2"];
        else lines = lines.default || lines[1] || [];
      }
      lines.forEach((t) => S.arche.push({ t: now(), txt: interpolate(t) }));
      if (S.arche.length > 200) S.arche.splice(0, S.arche.length - 200);
      E.emit("arche", key);
    }
    E.archeSay = archeSay;

    /* ------------------------------------------------------ événements narratifs */
    function checkEvents() {
      const rec = opts.recit || D.RECIT || {};
      const evList = rec.events || [];
      if (!Array.isArray(evList) || !evList.length) return;
      S.eventsSeen = S.eventsSeen || {};
      for (const ev of evList) {
        if (!ev || !ev.id) continue;
        if (ev.once !== false && S.eventsSeen[ev.id]) continue;
        if (ev.cond && !cond(ev.cond)) continue;
        if (ev.arche && E.isLibere()) continue;
        S.eventsSeen[ev.id] = 1;
        if (ev.flag) S.flags[ev.flag] = true;
        if (ev.arche) {
          const lines = Array.isArray(ev.arche) ? ev.arche : [ev.arche];
          lines.forEach((t) => S.arche.push({ t: now(), txt: interpolate(t) }));
          if (S.arche.length > 200) S.arche.splice(0, S.arche.length - 200);
          E.emit("arche", ev.id);
        }
        if (ev.toast) {
          E.emit("toast", interpolate(ev.toast));
        }
        if (ev.emit) {
          E.emit(ev.emit, ev);
        }
      }
    }
    E.checkEvents = checkEvents;

    /* ------------------------------------------------------ ciel */
    E.tapMoon = function () {
      S.moon = (S.moon || 0) + 1;
      const ui = RECIT.ui || {};
      if (S.moon >= 7 && addSecret("lune7")) {
        S.intu += 3;
        return ui.lune7 || "";
      }
      if (S.moon > 7) return ui.lune8 || null;
      return null;
    };
    E.listen = function () {
      if (!E.cache().signal) return { ok: false };
      let fresh = false;
      if (!S.flags.signal) {
        S.flags.signal = true;
        add("signal_brut", 1);
        fresh = true;
        if (S.flags.arche) archeSay("signal");
        E.emit("struct");
      }
      return { ok: true, fresh, decoded: !!S.flags.decoded };
    };
    function decodeSignal() {
      S.flags.decoded = true;
      addFrag("signal", true);
      if (S.flags.arche) archeSay("decode");
      E.emit("decoded");
    }

    /* ------------------------------------------------------ flûte */
    function allMelodies() {
      const rec = opts.recit || D.RECIT || {};
      const res = Object.assign({}, D.MELODIES || {});
      if (rec.melodies) Object.assign(res, rec.melodies);
      return res;
    }
    E.allMelodies = allMelodies;

    /* un air se reconnaît à ses notes (données de test) ou à leur empreinte (len + h) */
    function airLen(m) { return m.notes ? m.notes.length : (m.len | 0); }
    function airMatch(m, tail) {
      if (m.notes) return tail.every((v, i) => v === m.notes[i]);
      return !!m.h && fnv1a32(tail.join("")) === m.h;
    }
    /* les notes d’un air déjà trouvé : celles que le joueur a jouées, retrouvées au besoin */
    function airNotes(id, m) {
      if (m.notes) return m.notes.slice();
      S.meta.airs = S.meta.airs || {};
      if (S.meta.airs[id]) return S.meta.airs[id].slice();
      const len = airLen(m);
      if (!m.h || len < 1 || len > 9) return null;
      const cur = new Array(len).fill(1);
      for (;;) {
        if (fnv1a32(cur.join("")) === m.h) { S.meta.airs[id] = cur.slice(); return cur.slice(); }
        let i = len - 1;
        while (i >= 0 && cur[i] === 5) { cur[i] = 1; i--; }
        if (i < 0) return null;
        cur[i]++;
      }
    }
    E.airNotes = (id) => { const m = allMelodies()[id]; return m ? airNotes(id, m) : null; };

    /* le Journal ne montre que les airs déjà trouvés */
    E.melodies = function () {
      const all = allMelodies();
      const list = [];
      for (const id in all) {
        const m = all[id];
        const known = !!(S.secrets && S.secrets[id]) || !!(S.meta.airs && S.meta.airs[id]);
        if (!known) continue;
        list.push({ id, n: m.n, notes: airNotes(id, m), t: m.t, rejouable: !!m.rejouable, known });
      }
      return list;
    };

    E.playNote = function (n) {
      S.notes = S.notes || [];
      S.notes.push(n);
      if (S.notes.length > 32) S.notes.shift();
      const all = allMelodies();
      for (const mid in all) {
        const m = all[mid];
        const len = airLen(m);
        if (!len || S.notes.length < len) continue;
        if (m.cond && !cond(m.cond)) continue;
        const tail = S.notes.slice(-len);
        if (airMatch(m, tail)) {
          S.notes = [];
          if (!m.notes) { S.meta.airs = S.meta.airs || {}; S.meta.airs[mid] = tail; }
          return melody(mid, m);
        }
      }
      return null;
    };
    /* une pause dans le jeu de flûte : l’air recommence à zéro */
    E.clearNotes = () => { S.notes = []; };
    /* ouvre le Registre : la clé tapée, l’air de la Lune ou la salle de la Lumière */
    function openRegistre() {
      const fresh = !S.flags.registre;
      S.flags.registre = true;
      S.termMode = "reg";
      if (addSecret("cregistre")) S.intu += 2;
      return fresh;
    }
    E.openRegistre = openRegistre;
    function melody(mid, mDef) {
      const all = allMelodies();
      const m = mDef || all[mid] || {};
      const isRejouable = !!m.rejouable;
      const counts = m.compte !== false;
      const fresh = counts ? addSecret(mid) : !(S.meta.airsVus && S.meta.airsVus[mid]);
      if (!counts) { S.meta.airsVus = S.meta.airsVus || {}; S.meta.airsVus[mid] = 1; }
      if (fresh && counts && mid !== "frere") S.intu += 2;

      if (mid === "appel" && !S.flags.lucioles) { S.flags.lucioles = true; recalc(); }
      if (mid === "frere") {
        if (fresh) S.intu += 2;
        if (!S.flags.berceuse && S.frags && (S.frags.cuves || S.frags.caveau)) {
          S.flags.berceuse = true;
          recalc();
        }
      }

      const effets = m.effets || m.effects;
      if (Array.isArray(effets)) {
        for (const eff of effets) {
          if (!eff || typeof eff !== "object") continue;
          if (eff.k === "flag" && eff.id) {
            S.flags[eff.id] = true;
            if (eff.id === "lucioles") recalc();
          } else if (eff.k === "meta" && eff.id) {
            S.meta[eff.id] = true;
          } else if (eff.k === "registre") {
            openRegistre();
          } else if (eff.k === "sky") {
            E.emit("skyanim", eff.anim || eff.id);
          } else if (eff.k === "boost") {
            S.boosts = S.boosts || {};
            const durSec = Number(eff.dur) || 1800;
            S.boosts[eff.what || "prod"] = { mult: Number(eff.mult) || 1.25, until: now() + durSec * 1000 };
            recalc();
          } else if (eff.k === "event" && (eff.name || eff.id)) {
            E.emit(eff.name || eff.id);
          } else if (eff.k === "unlock" && eff.id) {
            addSecret(eff.id);
          } else if (eff.k === "intu") {
            if (fresh) S.intu += (Number(eff.n) || 2); // rejouer un air ne rapporte plus rien
          }
        }
      }

      let ending = null;
      if (mid === "frere") {
        const ps = projState("chant");
        const st = D.PROJECTS && D.PROJECTS.chant && D.PROJECTS.chant.steps[ps.step];
        if (projVisible("chant") && st && st.melody === mid) {
          ps.step++;
          ending = endGame("retour");
        }
      }
      E.emit("melody", mid, fresh);
      E.emit("struct");
      return { id: mid, fresh, rejouable: isRejouable, ending };
    }

    /* ------------------------------------------------------ capsule */
    E.setCapsuleText = function (txt) {
      S.meta = S.meta || {};
      S.meta.capsuleText = String(txt || "").slice(0, 140);
      E.emit("struct");
      return S.meta.capsuleText;
    };
    E.getCapsuleText = function () {
      return (S.meta && typeof S.meta.capsuleText === "string") ? S.meta.capsuleText : "";
    };

    /* ------------------------------------------------------ terminal */
    function formatRealDate(d) {
      d = d || new Date();
      const days = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];
      const months = ["JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE"];
      const day = days[d.getDay()];
      const date = d.getDate();
      const month = months[d.getMonth()];
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      return day + " " + date + " " + month + ", " + h + " H " + m;
    }

    function interpolate(str) {
      if (typeof str !== "string") return str;
      const cyc = S.cycle || 1;
      const semeurNum = cyc + 6;
      const semeur = String(semeurNum);
      const semeurPad = semeurNum < 10 ? "0" + semeurNum : String(semeurNum);
      const semeurPrev = String(semeurNum - 1);
      const cuve = String(7 + ((cyc - 1) % 6));
      const precedents = String(semeurNum - 1);
      const cyclesPrecedents = String(cyc - 1);
      const capText = (S.meta && typeof S.meta.capsuleText === "string" && S.meta.capsuleText.trim()) ? S.meta.capsuleText.trim() : "(silence)";
      const age = String(S.age || 0);
      if (str.indexOf("{originaux}") >= 0) str = str.replace(/\{originaux\}/g, originauxTxt());
      if (str.indexOf("{noms}") >= 0) str = str.replace(/\{noms\}/g, nomsTxt());
      if (str.indexOf("{nom}") >= 0) str = str.replace(/\{nom\}/g, (RECIT.noms || {})[7 + ((cyc - 1) % 6)] || "");
      return str
        .replace(/\{iris\}/g, String(7 + ((cyc - 1) % 6)).padStart(2, "0"))
        .replace(/\{date\}/g, formatRealDate())
        .replace(/\{semeur\}/g, semeur)
        .replace(/\{semeur_pad\}/g, semeurPad)
        .replace(/\{semeur_prev\}/g, semeurPrev)
        .replace(/\{cycle\}/g, String(cyc))
        .replace(/\{cuve\}/g, cuve)
        .replace(/\{precedents\}/g, precedents)
        .replace(/\{cycles_precedents\}/g, cyclesPrecedents)
        .replace(/\{capsule\}/g, capText)
        .replace(/\{age\}/g, age);
    }
    E.interpolate = interpolate;
    /* la deuxième salle : les cinq premières fois, datées à l’heure du joueur */
    function originauxTxt() {
      const st = (S.meta && S.meta.stamps) || {};
      const ids = Object.keys(st).filter((k) => k.indexOf("m:") === 0 && D.ITEMS[k.slice(2)] && st[k][0]).sort((a, b) => st[a][0] - st[b][0]);
      const ui = RECIT.ui || {};
      if (!ids.length) return ui.vierges || "";
      const lines = ids.slice(0, 5).map((k) => "« " + D.ITEMS[k.slice(2)].n + " · " + formatRealDate(new Date(st[k][0])).toLowerCase() + " »");
      if (ids.length > 5) lines.push(String(ui.autres || "").replace("{n}", ids.length - 5));
      return lines.join("\n");
    }
    /* Matines : les noms des enfants qu’on a croisés (cuves des cycles joués) */
    function nomsTxt() {
      const NOMS = RECIT.noms || {};
      const nommes = Object.keys((S.meta && S.meta.nommes) || {});
      if (nommes.length) return " " + nommes.map((c) => NOMS[c]).filter(Boolean).join(", ") + ".";
      if (!(S.frags && (S.frags.berceuse || S.frags.quai))) return "";
      const seen = [];
      for (let c = 1; c <= Math.min(S.cycle || 1, 6); c++) seen.push(NOMS[7 + ((c - 1) % 6)]);
      return seen.length ? " " + seen.join(", ") + "." : "";
    }

    /* le Registre : une entrée calculée à partir de la partie (lignes sans « REG · ») */
    const pad2 = (n) => String(n).padStart(2, "0");
    const cuveOf = (c) => 7 + ((c - 1) % 6);
    function regLine(k, vars) {
      const reg = RECIT.registre || {};
      let t = reg[k] || "";
      for (const v in vars || {}) t = t.split("{" + v + "}").join(String(vars[v]));
      return t;
    }
    function registreEntry(cmd) {
      const reg = RECIT.registre || {};
      const cyc = S.cycle || 1;
      if (cmd === "aide" || cmd === "index" || cmd === "help" || cmd === "?") return reg.aide;
      if (cmd === "mains" || cmd === "main") return reg.mains;
      if (cmd === "licence" || cmd === "licences") return reg.licences;
      if (cmd === "clause") return reg.clause;
      if (cmd === "relais") return reg.relais;
      if (cmd === "cuves" || cmd === "cuve") return reg.cuves;
      if (cmd === "lueur" || cmd === "kher") return reg.lueur;
      if (cmd === "signal") return reg.signal;
      if (cmd === "nourrice") return reg.nourrice;
      if (cmd === "arche") return reg.arche;
      if (cmd === "troqueur") return reg.troqueur;
      if (cmd === "unite 12" || cmd === "unite12" || cmd === "unite") return reg.unite12;
      if (cmd === "halte") return reg.halte;
      if (cmd === "xyzzy" || cmd === "plugh") return reg.xyzzy;
      if (cmd === "1969") { if (addSecret("c1969")) S.intu += 3; return reg["1969"]; }
      if (cmd === "originaux" || cmd === "original") { S.flags.originaux_lu = true; return reg.originaux; }
      if (cmd === "capsule" || cmd === "capsules") { if (addSecret("ccapsule")) S.intu += 2; return reg.capsule; }
      if (cmd === "premieres fois" || cmd === "premiere fois" || cmd === "premieres") {
        const st = (S.meta && S.meta.stamps) || {};
        const ids = Object.keys(D.ITEMS).filter((id) => (S.known && S.known[id]) || (S.made && S.made[id] > 0));
        ids.sort((x, y) => ((st["m:" + x] || [Infinity])[0]) - ((st["m:" + y] || [Infinity])[0]));
        if (!ids.length) return reg.aucune;
        const lines = [reg.premieres].concat(ids.slice(0, 8).map((id) => {
          const sp = st["m:" + id];
          return regLine("premiere", { objet: D.ITEMS[id].n.toUpperCase(), quand: sp && sp[0] ? formatRealDate(new Date(sp[0])) : reg.sansDate });
        }));
        if (ids.length > 8) lines.push(regLine("autres", { n: ids.length - 8 }));
        return lines.join("\n");
      }
      if (cmd === "modifications" || cmd === "modification") {
        const mem = (S.meta && S.meta.mem) || {};
        const names = {};
        (D.MEMOIRE || []).forEach((x) => { names[x.id] = x.n; });
        const ks = Object.keys(mem).filter((k) => mem[k] > 0);
        return reg.modifs + "\n" + (ks.length ? ks.map((k) => (names[k] || k).toUpperCase() + " ×" + mem[k]).join(" · ") : reg.sansModif);
      }
      if (cmd === "endormissements" || cmd === "endormissement" || cmd === "releves") {
        if (cyc <= 1) return reg.endoAucun;
        const lines = [];
        for (let c = 1; c < cyc; c++) {
          const forcee = c === 1 && !!(S.meta && S.meta.forcedDone);
          lines.push(regLine("endo", { n: pad2(cuveOf(c)), par: forcee ? reg.parNourrice : reg.parMain }));
        }
        return lines.join("\n");
      }
      const sm = cmd.match(/^(?:s|semeur)\s*0?([1-9]|1[0-2])$/);
      if (sm) {
        const num = parseInt(sm[1], 10);
        if (num <= 6) return regLine("mort", { n: pad2(num) }) + (num === 1 ? "\n" + reg.oiseau : "");
        const cycles = [];
        for (let c = 1; c <= cyc; c++) if (cuveOf(c) === num) cycles.push(c);
        let out;
        if (!cycles.length) out = regLine("jamais", { n: pad2(num) });
        else {
          const awake = cuveOf(cyc) === num;
          const last = awake ? cycles[cycles.length - 2] : cycles[cycles.length - 1];
          const par = last === undefined ? "" : (last === 1 && S.meta.forcedDone ? reg.parNourrice : reg.parMain);
          out = regLine("vivant", { n: pad2(num), etat: awake ? reg.eveille : reg.dort, eveils: cycles.length, cycles: cycles.join(", "), par });
          if (last === undefined) out = out.split("\n").slice(0, 2).join("\n");
        }
        if (num === 7) out += "\n" + regLine("trait", { fini: ((S.meta && S.meta.marque) || 0) >= 3 ? reg.acheve : reg.inacheve });
        return out;
      }
      return null;
    }

    E.terminal = function (raw) {
      const rawStr = String(raw || "");
      const clean = rawStr.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const normCmd = clean.replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
      if (!normCmd) return [];
      const T = RECIT.terminal || D.TERMINAL || {};
      const reg = RECIT.registre || {};
      const cles = RECIT.cles || {};
      const h = fnv1a32(normCmd);
      const push = (pfx, out) => {
        const lines = [pfx + rawStr].concat(interpolate(out || "").split("\n").filter((l) => l !== "").map((l) => (pfx === "REG > " ? "REG · " + l : l)));
        S.term.push(...lines);
        if (S.term.length > 120) S.term.splice(0, S.term.length - 120);
        E.emit("struct");
        return lines;
      };
      const isReg = () => S.termMode === "reg" || (!S.termMode && S.flags.registre);

      if (normCmd === "effacer" || normCmd === "clear" || normCmd === "cls") { S.term = []; E.emit("struct"); return []; }

      // un clin d’œil (hors récit)
      if ((cles.zera || []).includes(h)) {
        addCurio("zera");
        return push(isReg() ? "REG > " : "ARCHE > ", D.EASTER && D.EASTER.zera ? D.EASTER.zera.desc : "");
      }
      // la clé du Registre, dans les deux modes
      if ((cles.registre || []).includes(h)) {
        openRegistre();
        return push("REG > ", reg.ouvert);
      }
      if (normCmd === "mode arche" || normCmd === "arche mode") {
        S.termMode = "arche";
        return push("ARCHE > ", T.modeArche);
      }
      if (normCmd === "mode reg" || normCmd === "mode registre") {
        if (S.flags.registre) { S.termMode = "reg"; return push("REG > ", reg.actif); }
        return push("ARCHE > ", T.refus);
      }

      if (isReg()) {
        const out = registreEntry(normCmd);
        return push("REG > ", out === null || out === undefined ? reg.inconnu : out);
      }

      let out;
      if (normCmd === "aide" || normCmd === "help" || normCmd === "?") out = T.aide;
      else if (normCmd === "1969") { if (addSecret("c1969")) S.intu += 3; out = T["1969"]; }
      else if (normCmd === "xyzzy" || normCmd === "plugh") { if (addSecret("cxyzzy")) S.intu += 3; out = T.xyzzy; }
      else if (normCmd === "signal") out = S.flags.decoded ? T.signal2 : S.flags.signal ? T.signal1 : T.signal0;
      else if (T[normCmd] && typeof T[normCmd] === "string") out = T[normCmd];
      else out = T.inconnu;
      return push("ARCHE > ", out);
    };

    /* ------------------------------------------------------ le Domaine
     * Chaque terre ouverte a ses gisements. On y pose des extracteurs, qui versent
     * leur récolte dans la Réserve. Les machines sont rangées en chaînes (une
     * recette, un type de machine, un nombre) : elles se servent dans la Réserve et
     * y déposent ce qu’elles font. Un Grand Œuvre « alimenté » se sert seul dans la
     * Réserve, à un débit qui dépend de l’âge. Rien ne dépend d’une position.
     * Le calcul se fait par pas de temps : il donne le même résultat jeu ouvert ou
     * fermé. */
    const machStat = {}; // état des gisements et des chantiers (non sauvegardé)
    let order = null;
    function domChanged() { order = null; E.emit("dom"); }
    function forgetDom() {
      for (const k in machStat) delete machStat[k];
      order = null;
      machPool.length = 0;
      hWork.job = null; hWork.sIdx = -1; hWork.rec = null;
      E.emit("dom");
    }
    E.machInfo = (k) => machStat[k] || { s: "wait", avg: 0 };

    E.automatable = (id) => {
      const it = item(id);
      return !!(it && it.r && S.known[id] && !isUnique(it) && !isScaled(it));
    };

    /* --- gisements et extracteurs */
    E.EXTS = EXTS;
    E.extZones = extZones;
    E.extRate = extRate;
    E.extKey = extKey;
    E.zoneDeps = (z) => ZONE_DEPS[z] || [];
    E.deposits = () => {
      const out = [];
      D.ZONES.forEach((z) => { if (zoneOpen(z.id)) ZONE_DEPS[z.id].forEach((d) => out.push({ z: z.id, res: d.res, hand: d.hand, key: extKey(z.id, d.res) })); });
      return out;
    };
    E.extOk = extOk;
    E.extFor = (r, z) => EXTS.filter((t) => (z ? extOk(t, z, r) : extRate(t, r) > 0));
    E.extUnits = function () {
      const out = {};
      EXTS.forEach((t) => (out[t] = { own: Math.floor(count(t)), used: 0 }));
      for (const k in S.dom.ext) { const u = S.dom.ext[k].u; for (const t in u) if (out[t]) out[t].used += u[t]; }
      return out;
    };
    const freeExt = (t) => { const u = E.extUnits()[t]; return u ? Math.max(0, u.own - u.used) : 0; };
    E.freeExt = freeExt;
    /* production d’une exploitation, par seconde */
    function extOut(e, c) {
      let r = 0, n = 0, f = 1;
      const rg = REG[e.z] && REG[e.z].ext;
      if (rg) { for (const t in e.u) n += e.u[t]; if (n > rg.max) f = (rg.max + (n - rg.max) * rg.mult) / n; }
      const ch = REG[e.z] && REG[e.z].chaleur;
      if (ch && !regleSans(ch)) f *= ch.mult;
      for (const t in e.u) {
        const it = item(t);
        if (it) r += e.u[t] * extRate(t, e.res) * (c.auto[e.z || it.z] || 1) * (c.auto["*"] || 1) * c.echo * memV("extr") * transV("trans_terre");
      }
      if (E.hasEchoFin("brasier")) r *= 1.25;
      return r * f * donExt(e.z) * seuilMult(e) * E.terreBonus(e.z);
    }
    E.extOut = (e) => extOut(e, E.cache());
    /* ---- Les seuils par gisement (D.SEUILS) : 10, 25, 50, 100 extracteurs, chacun ×1,25 ---- */
    const extCount = (e) => { let n = 0; for (const t in e.u) n += e.u[t]; return n; };
    const seuilMult = (e) => (REG[e.z] && REG[e.z].ext ? 1 : Math.pow(D.SEUILS.mult, D.SEUILS.paliers.filter((p) => extCount(e) >= p).length));
    /* l’état des seuils d’un gisement, pour la fiche : n extracteurs, le prochain seuil, le multiplicateur déjà gagné */
    E.seuil = function (e) {
      const n = e ? extCount(e) : 0, P = D.SEUILS.paliers;
      if (e && REG[e.z] && REG[e.z].ext) return { n, sans: true };
      const k = P.filter((p) => n >= p).length;
      return { n, k, prochain: P.find((p) => n < p) || 0, mult: Math.pow(D.SEUILS.mult, k), pas: D.SEUILS.mult };
    };
    E.domExt = (z, res) => S.dom.ext[extKey(z, res)] || null;
    /* le type d’extracteur que pose le bouton « + cabane » : le plus productif parmi
     * ceux qui attendent d’être posés, sinon le plus productif qu’on peut fabriquer
     * tout de suite, sinon le plus simple qu’on connaisse (un Carnet hérité d’une
     * relève connaît des extracteurs bien trop chers pour le début) */
    E.extChoice = function (res, z) {
      const types = E.extFor(res, z).sort((a, b) => extRate(b, res) - extRate(a, res));
      const free = types.find((t) => freeExt(t) >= 1);
      if (free) return { t: free, free: freeExt(free) };
      const known = types.filter((t) => S.known[t]);
      if (!known.length) return null;
      const can = known.find((t) => E.plan(t, 1).ok);
      return { t: can || known[known.length - 1], free: 0 };
    };
    /* pose jusqu’à n extracteurs libres du type t sur un gisement ; renvoie combien */
    function assignExt(z, res, t, n) {
      if (!zoneOpen(z) || !(ZONE_DEPS[z] || []).some((d) => d.res === res) || !extOk(t, z, res)) return 0;
      const k = Math.min(Math.floor(n), freeExt(t));
      if (!(k >= 1)) return 0;
      const key = extKey(z, res), e = S.dom.ext[key] || (S.dom.ext[key] = { z, res, u: {}, on: true });
      e.u[t] = (e.u[t] || 0) + k;
      if (z === "mine") {
        const tot = Object.values(e.u).reduce((a, b) => a + b, 0);
        if (tot >= 8) addCurio("tuyau");
      }
      domChanged();
      return k;
    }
    /* « +1 », « ×10 » : pose ce qui est libre, et fait fabriquer le reste par les
     * mains, qui le poseront ici une fois fini */
    E.domExtAdd = function (z, res, n, t) {
      n = Math.max(1, Math.floor(n || 1));
      const ch = t ? { t } : E.extChoice(res, z);
      if (!ch || !extOk(ch.t, z, res)) return { ok: false, why: "noext" };
      t = ch.t;
      const placed = assignExt(z, res, t, n);
      if (placed >= n) return { ok: true, placed, queued: 0, t };
      const q = E.queue(t, n - placed, true, "x:" + extKey(z, res));
      if (!q.ok) return { ok: placed > 0, placed, queued: 0, t, why: q.why, missing: q.missing || (q.plan && q.plan.missing) };
      return { ok: true, placed, queued: n - placed, t };
    };
    /* ---- Les lignes : un bâtiment par ressource, qui monte de niveau en niveau ---- */
    const LIGNE = {}; // ressource → ligne
    (D.LIGNES || []).forEach((L) => (LIGNE[L.res] = L));
    E.ligneDe = (res) => LIGNE[res] || null;
    E.ligneOf = (id) => { const it = item(id); return it && it.lg ? D.LIGNES.find((L) => L.id === it.lg) : null; };
    /* le niveau d’après (l’objet), ou null au dernier niveau */
    E.extNext = (id) => { const L = E.ligneOf(id), it = item(id); return L && it ? (L.niv[it.lv] ? L.niv[it.lv].id : null) : null; };
    E.extNiveaux = (res) => (LIGNE[res] ? LIGNE[res].niv.map((v) => v.id) : []);
    /* Améliorer un exemplaire posé : on fabrique le niveau d’après, il prend la place de l’ancien,
     * qui est retiré. Si un exemplaire du niveau d’après attend déjà, l’échange est immédiat. */
    E.domExtUp = function (z, res, from) {
      const e = S.dom.ext[extKey(z, res)], nx = E.extNext(from);
      if (!e || !(e.u[from] >= 1) || !nx || !S.known[nx]) return { ok: false, why: "niveau" };
      if (freeExt(nx) >= 1) { swapUp(z, res, from, nx); return { ok: true, placed: 1, queued: 0, t: nx }; }
      const q = E.queue(nx, 1, true, "u:" + z + ":" + res + ":" + from);
      if (!q.ok) return { ok: false, why: q.why, missing: q.missing || (q.plan && q.plan.missing), t: nx };
      return { ok: true, placed: 0, queued: 1, t: nx };
    };
    function swapUp(z, res, from, nx) {
      const key = extKey(z, res), e = S.dom.ext[key];
      if (e && e.u[from] >= 1 && count(from) >= 1) {
        e.u[from]--; if (!e.u[from]) delete e.u[from];
        add(from, -1);
      }
      assignExt(z, res, nx, 1);
    }
    /* nombre exact d’extracteurs d’un type sur un gisement (0 les retire) */
    E.domExtSet = function (z, res, t, n) {
      if (!zoneOpen(z) || !extOk(t, z, res) || !(ZONE_DEPS[z] || []).some((d) => d.res === res)) return null;
      const key = extKey(z, res);
      let e = S.dom.ext[key];
      const cur = (e && e.u[t]) || 0, v = Math.max(0, Math.min(Math.floor(n) || 0, cur + freeExt(t)));
      if (!e) {
        if (!v) return null;
        e = S.dom.ext[key] = { z, res, u: {}, on: true };
      }
      if (v) e.u[t] = v; else delete e.u[t];
      if (z === "mine" && e) {
        const tot = Object.values(e.u).reduce((a, b) => a + b, 0);
        if (tot >= 8) addCurio("tuyau");
      }
      if (!Object.keys(e.u).length) { delete S.dom.ext[key]; delete machStat[key]; }
      domChanged();
      return S.dom.ext[key] || null;
    };
    E.domExtToggle = function (z, res, on) {
      const e = S.dom.ext[extKey(z, res)];
      if (!e) return null;
      e.on = on === undefined ? !e.on : !!on;
      domChanged();
      return e;
    };
    /* Projections en lecture seule : bénéfice réel avant investissement */
    E.projectExtractor = function (z, res, t, countDelta) {
      countDelta = countDelta || 1;
      const key = extKey(z, res);
      const e = S.dom.ext[key];
      const curRate = e && machStat[key] && machStat[key].s === "ok" ? extOut(e, E.cache()) : 0;
      const simU = Object.assign({}, e ? e.u : {});
      simU[t] = (simU[t] || 0) + countDelta;
      const simE = { z, res, u: simU, on: true };
      const projRate = extOut(simE, E.cache());
      const free = freeExt(t);
      const needCraft = Math.max(0, countDelta - free);
      const cost = needCraft > 0 ? totalCost(t, needCraft, count(t)) : {};
      const missing = {};
      for (const k in cost) {
        const diff = cost[k] - (S.inv[k] || 0);
        if (diff > 1e-9) missing[k] = diff;
      }
      const b = blocker(t);
      return {
        z, res, t,
        curRate,
        projRate,
        gainRate: Math.max(0, projRate - curRate),
        cost,
        alreadyFree: free >= countDelta,
        free,
        missing: Object.keys(missing).length ? missing : null,
        blocker: b && b.why !== "owned" ? b : null
      };
    };

    E.projectExtractorUpgrade = function (z, res, fromType) {
      const nx = E.extNext(fromType);
      if (!nx || !S.known[nx]) return null;
      const key = extKey(z, res);
      const e = S.dom.ext[key];
      const curRate = e && machStat[key] && machStat[key].s === "ok" ? extOut(e, E.cache()) : 0;
      const simU = Object.assign({}, e ? e.u : {});
      simU[fromType] = Math.max(0, (simU[fromType] || 0) - 1);
      if (simU[fromType] === 0) delete simU[fromType];
      simU[nx] = (simU[nx] || 0) + 1;
      const simE = { z, res, u: simU, on: true };
      const projRate = extOut(simE, E.cache());
      const free = freeExt(nx);
      const cost = free >= 1 ? {} : costFor(nx, count(nx));
      const missing = {};
      for (const k in cost) {
        const diff = cost[k] - (S.inv[k] || 0);
        if (diff > 1e-9) missing[k] = diff;
      }
      const b = blocker(nx);
      return {
        z, res, from: fromType, to: nx,
        curRate,
        projRate,
        gainRate: Math.max(0, projRate - curRate),
        cost,
        alreadyFree: free >= 1,
        free,
        missing: Object.keys(missing).length ? missing : null,
        blocker: b && b.why !== "owned" ? b : null
      };
    };

    E.projectToolBenefit = function (toolId) {
      const it = item(toolId);
      if (!it || it.t !== "tool") return null;
      if (typeof E.equipmentSpeed === "function") {
        const pcfg = D.CRAFT_EQUIPMENT || (typeof E.equipmentCfg === "function" ? E.equipmentCfg() : null);
        const eq = pcfg && pcfg.equipment && pcfg.equipment[toolId];
        if (eq && eq.speed) {
          const list = [];
          for (const rec in eq.speed) {
            if (!S.known[rec]) continue;
            const curChoice = E.equipmentChoices(rec).find((c) => c.ready);
            const curT = handTime(rec, curChoice);
            const projT = handTime(rec, { equipment: toolId, mode: Object.keys(eq.modes || {})[0] });
            list.push({ recipe: rec, n: (item(rec) || {}).n, curT, projT, mult: eq.speed[rec] });
          }
          if (list.length) return { kind: "equipment", list };
        }
      }
      if (it.e) {
        const list = [];
        if (it.e.tap) {
          for (const k in it.e.tap) {
            const mult = it.e.tap[k];
            if (k === "*") list.push({ label: "Toutes les récoltes à la main", mult });
            else if (ZONES[k]) list.push({ label: "Récolte à la main (" + ZONES[k].n + ")", mult, zone: k });
            else if (item(k)) list.push({ label: "Récolte de " + item(k).n + " à la main", mult, res: k });
          }
        }
        if (it.e.auto) {
          for (const k in it.e.auto) {
            const mult = it.e.auto[k];
            list.push({ label: k === "*" ? "Débit de tous les extracteurs" : "Extracteurs (" + (ZONES[k]?.n || k) + ")", mult, auto: true });
          }
        }
        if (list.length) return { kind: "tool", list };
      }
      return null;
    };

    E.projectMachineOnRecipe = function (machId, recId) {
      if (!machReadyFor(machId, recId)) return null;
      const mRate = machUnitRate(machId, E.cache(), recId);
      if (!(mRate > 0)) return null;
      const hTime = handTime(recId);
      const mTime = 1 / mRate;
      return {
        mach: machId,
        rec: recId,
        mRate,
        hTime,
        mTime,
        ratePerMin: mRate * 60 * ((item(recId) && item(recId).r && item(recId).r[2]) || 1)
      };
    };

    E.AIDES = {
      etude: {
        kicker: "Atelier",
        titre: "L’étude des matières",
        texte: "Observer une ressource (icône 👁️) permet d’étudier ses caractéristiques. L’étude révèle les gestes compatibles (tailler, chauffer, tresser...) sans détruire la matière. C’est à partir de ces gestes que tu découvriras les nouvelles recettes de ton Carnet."
      },
      commandes: {
        kicker: "Atelier",
        titre: "Commandes et réservations",
        texte: "Quand tu lances une commande, les ingrédients nécessaires disponibles en Réserve sont réservés sur ton établi. Ce qui manque est extrait ou préparé au fur et à mesure. Les mains et les machines libres s’y consacrent. Mettre en pause une commande libère les travailleurs pour les autres ordres sans perdre la progression ni les matières réservées. Passer en priorité place la commande en tête de file."
      },
      maitrise: {
        kicker: "Domaine & Terres",
        titre: "Maîtrise des terres et transmission",
        texte: "Chaque terre propose cinq étapes d’accomplissement : équipement initial ou installation, exploration des lieux, grand ouvrage, production automatique et série de fabrications. Quand les cinq étapes sont franchies, la terre est maîtrisée : la relève transmet alors +5 % de débit permanent pour cette terre et ses recettes (jusqu’à +50 %). Les explorations et le savoir restent acquis entre les relèves."
      },
      releve: {
        kicker: "Mémoire des mains",
        titre: "La relève des Semeurs",
        texte: "Passer le relais convertit l’expérience de ton cycle en Souvenirs. Ce bilan distingue deux choses : les bonus et découvertes effectivement acquis, et les Souvenirs disponibles que tu pourras dépenser à ton éveil dans l’Arbre des réminiscences pour enrichir tes prochains départs."
      },
      ouvrier: {
        kicker: "Atelier équipé",
        titre: "Les travailleurs",
        texte: "Chaque métier a ses travailleurs : apprentis, puis ouvriers. Ils fabriquent à ta place les pièces du métier que tu as déjà faites une fois à la main, jusqu’au seuil que tu fixes. Ils se fatiguent à force de travailler seuls, et se mettent en grève s’ils sont poussés trop loin : une prime les remet au travail."
      },
      outils: {
        kicker: "Atelier équipé",
        titre: "Outils et gestes du métier",
        texte: "Chaque station et outil propose des modes de travail précis (tailler, couper, cuire, polir). Un outil plus affûté ou mieux adapté, comme le couteau de silex pour les lanières, divise le temps de fabrication sans consommer plus de matières par pièce."
      }
    };
    /* Pose un extracteur libre sur le gisement de sa terre où il manque le plus.
     * Sert au bot de simulation et aux parties d’avant la v4, dont les extracteurs
     * ne travaillaient sur aucun gisement. */
    E.domAutoExt = function (t) {
      const it = item(t);
      if (!it || it.t !== "ext" || freeExt(t) < 1) return null;
      const spots = [];
      extZones(t).filter(zoneOpen).forEach((z) => ZONE_DEPS[z].forEach((d) => { if (extRate(t, d.res) > 0) spots.push({ z, r: d.res }); }));
      if (!spots.length) return null;
      // viser ce que donneraient tous les extracteurs s’ils travaillaient partout,
      // en couvrant d’abord les matières qui ne sont pas encore extraites
      const target = {}, cur = {};
      EXTS.forEach((u) => { const n = Math.floor(count(u)); for (const r in item(u).p) target[r] = (target[r] || 0) + n * item(u).p[r]; });
      for (const k in S.dom.ext) { const e = S.dom.ext[k]; for (const u in e.u) cur[e.res] = (cur[e.res] || 0) + e.u[u] * extRate(u, e.res); }
      spots.forEach((sp) => {
        const d = (target[sp.r] || 0) - (cur[sp.r] || 0);
        sp.score = (cur[sp.r] ? 0 : 1000) + Math.abs(d) - Math.abs(d - extRate(t, sp.r));
      });
      spots.sort((a, b) => b.score - a.score);
      return assignExt(spots[0].z, spots[0].r, t, 1) ? { z: spots[0].z, res: spots[0].r } : null;
    };
    function placeOldExtractors() {
      let placed = 0;
      const power = (t) => Object.values(item(t).p).reduce((a, b) => a + b, 0);
      EXTS.slice().sort((a, b) => power(b) - power(a)).forEach((t) => { const n = freeExt(t); for (let i = 0; i < n; i++) if (E.domAutoExt(t)) placed++; });
      S.flags.fab4 = { placed };
    }

    /* --- machines */
    E.machines = function () {
      assignWorkers();
      const out = {};
      MACHINES.forEach((m) => (out[m] = { own: Math.floor(count(m)), used: 0, cad: 0, spd: item(m).spd, byRec: {} }));
      machPool.forEach((w) => {
        if ((w.job !== null || w.cad !== null) && out[w.m]) {
          out[w.m].used++;
          if (w.cad) out[w.m].cad++;
          if (w.rec) out[w.m].byRec[w.rec] = (out[w.m].byRec[w.rec] || 0) + 1;
        }
      });
      return out;
    };
    const freeMach = (m) => { const x = E.machines()[m]; return x ? Math.max(0, x.own - x.used) : 0; };
    E.freeMach = freeMach;
    /* Cadences d’atelier : maintien de stock automatique par les machines restées libres */
    E.setCadence = function (rec, cap, on) {
      const it = item(rec);
      if (!rec || !it || !it.r) return { ok: false, why: "none" };
      S.dom.cadence = S.dom.cadence || {};
      if (cap === null || cap === 0 || cap === false) {
        delete S.dom.cadence[rec];
        if (!Object.keys(S.dom.cadence).length) delete S.dom.cadence;
        assignWorkers();
        domChanged();
        E.emit("struct");
        return { ok: true, removed: true };
      }
      if (!E.automatable(rec)) return { ok: false, why: "not_automatable" };
      if (!E.hasEchoFin("retour") && D.COMMANDES && D.COMMANDES.firstByHand && !(S.made[rec] > 0)) return { ok: false, why: "first_by_hand" };
      const cur = S.dom.cadence[rec] || { cap: 100, on: true, acc: 0 };
      if (typeof cap === "number" && cap > 0) cur.cap = Math.max(1, Math.min(100000, Math.floor(cap)));
      if (on !== undefined) cur.on = !!on;
      S.dom.cadence[rec] = cur;
      assignWorkers();
      domChanged();
      E.emit("struct");
      return { ok: true, cadence: Object.assign({ id: rec }, cur) };
    };
    E.cadences = function () {
      assignWorkers();
      const cads = (S.dom && S.dom.cadence) || {};
      const c = E.cache();
      return Object.keys(cads).filter((rec) => item(rec) && item(rec).r).map((rec) => {
        const cd = cads[rec], it = item(rec);
        const have = Math.floor(S.inv[rec] || 0);
        const cap = cd.cap || 100;
        const on = cd.on !== false;
        let machs = 0, rate = 0;
        machPool.forEach((w) => {
          if (w.cad === rec) {
            machs++;
            rate += machUnitRate(w.m, c, rec) * (it.r[2] || 1);
          }
        });
        const miss = [];
        for (const i in it.r[1]) {
          if ((S.inv[i] || 0) + 1e-9 < it.r[1][i]) miss.push(i);
        }
        const hasCapableMach = anyOwnedMachReadyFor(rec);
        let status = "ok";
        if (!on) status = "off";
        else if (have >= cap) status = "full";
        else if (!hasCapableMach) status = "nomach";
        else if (miss.length) status = "starved";
        else if (machs === 0) status = "busy";
        return { id: rec, cap, on, have, machs, rate, miss, status };
      });
    };
    /* Chaîne manquante (Labo) : les objets intermédiaires qu’une recette demande et qui n’ont jamais
     * été fabriqués ni découverts, en descendant dans la chaîne. [] : rien ne manque à découvrir. */
    E.chaineManquante = function (id) {
      const out = [], seen = new Set();
      (function walk(x) {
        const it = item(x);
        if (!it || !it.r) return;
        for (const i in it.r[1]) {
          const ing = item(i);
          if (!ing || !ing.r || seen.has(i)) continue;
          seen.add(i);
          if (!S.known[i] && !(S.made[i] > 0)) out.push(i);
          walk(i);
        }
      })(id);
      return out;
    };
    /* Les apprentis (Atelier, 0.39) : une seule liste des travailleurs automatiques, pour l’affichage.
     * Un apprenti est soit un ordre permanent (cadence : une recette, une cible en Réserve) qui emploie
     * des machines, soit une machine libre en attente d’ordre. kind: "ordre" | "machine".
     * Pas de nouvel état dans la sauvegarde : c’est la lecture des cadences et du parc de machines. */
    E.apprentis = function () {
      const lignes = E.cadences().map((c) => ({
        kind: "ordre", id: c.id, cap: c.cap, have: c.have, on: c.on, status: c.status,
        machs: c.machs, rate: c.rate, miss: c.miss
      }));
      const ms = E.machines();
      const libres = [];
      for (const m in ms) {
        const free = ms[m].own - ms[m].used;
        if (ms[m].own > 0) libres.push({ kind: "machine", id: m, own: ms[m].own, used: ms[m].used, free, spd: ms[m].spd });
      }
      const bloques = lignes.filter((l) => l.status === "starved" || l.status === "nomach").length;
      return { ordres: lignes, machines: libres, bloques, eligible: E.cadenceEligible().length };
    };
    /* La famille d'atelier d'un objet : à la main d'abord (D.ATELIERS.de), sinon la matière première qui domine */
    const famMemo = {};
    const FAM_DE = {};
    ["de", "deAutres"].forEach((k) => { const t = (D.ATELIERS || {})[k] || {}; for (const f in t) t[f].split(" ").forEach((id) => { FAM_DE[id] = f; }); });
    E.atelierDe = function (id) {
      const C = (D.ATELIERS || {}).construction, it0 = item(id);
      if (C && it0 && C.types.includes(it0.t) && C.garde.indexOf(FAM_DE[id]) < 0) return "construction";
      if (FAM_DE[id]) return FAM_DE[id];
      if (id in famMemo) return famMemo[id];
      const votes = {}, BR = (D.ATELIERS || {}).brut || {};
      (function walk(x, d) {
        const it = item(x);
        if (!it || d > 12) return;
        if (d > 0 && FAM_DE[x]) { votes[FAM_DE[x]] = (votes[FAM_DE[x]] || 0) + 1; return; }
        if (!it.r) { if (BR[x]) votes[BR[x]] = (votes[BR[x]] || 0) + 1; return; }
        for (const i in it.r[1]) walk(i, d + 1);
      })(id, 0);
      let best = "artisanat", n = 0;
      for (const f of (D.ATELIERS || {}).priorite || []) if ((votes[f] || 0) > n) { best = f; n = votes[f]; }
      return (famMemo[id] = best);
    };
    /* le rang d'une embauche : le nombre d'embauches de ce type faites dans l'atelier (renvois compris, au moins le nombre de travailleurs). Renvoyer ne baisse pas le prix de la suivante (0.45.2). */
    E.rangEmbauche = function (fam, kind) {
      const a = (S.ateliers && S.ateliers[fam]) || {}, k = kind === "apprenti" ? "app" : "ouv";
      return Math.max(a[k] || 0, a[k + "H"] || 0);
    };
    E.coutEmbauche = function (fam, kind) {
      const d = TRAV[kind], a = (S.ateliers && S.ateliers[fam]) || {};
      return d ? Math.round(d.cout * Math.pow(TRAV.parAge || 1, Math.max(0, S.age - d.age)) * Math.pow(d.croiss, E.rangEmbauche(fam, kind))) : Infinity;
    };
    E.embaucher = function (fam, kind) {
      const d = TRAV[kind];
      if (!d || !((D.ATELIERS || {}).familles || []).some((f) => f.id === fam)) return { ok: false, why: "inconnu" };
      if (S.age < d.age) return { ok: false, why: "age" };
      if (!Object.keys(S.known).some((id) => item(id) && item(id).r && !item(id).sec && !isUnique(item(id)) && (!isScaled(item(id)) || fam === "construction") && E.atelierDe(id) === fam)) return { ok: false, why: "vide" };
      const key = kind === "apprenti" ? "app" : "ouv";
      if ((((S.ateliers || {})[fam] || {})[key] || 0) >= d.max) return { ok: false, why: "max" };
      const cout = E.coutEmbauche(fam, kind);
      if ((S.ecus || 0) + 1e-9 < cout) return { ok: false, why: "ecus", cout };
      S.ateliers = S.ateliers || {};
      const a = S.ateliers[fam] || (S.ateliers[fam] = { app: 0, ouv: 0 });
      S.ecus -= cout;
      a[key]++;
      a[key + "H"] = Math.max(a[key + "H"] || 0, a[key] - 1) + 1; // le rang compte toutes les embauches, renvois compris
      assignWorkers();
      domChanged();
      E.emit("struct");
      return { ok: true, cout };
    };
    /* Renvoyer un travailleur : sans remboursement, et le prix de l'embauche suivante ne baisse pas. */
    E.licencier = function (fam, kind) {
      const d = TRAV[kind], key = kind === "apprenti" ? "app" : "ouv", a = S.ateliers && S.ateliers[fam];
      if (!d) return { ok: false, why: "inconnu" };
      if (!a || !(a[key] > 0)) return { ok: false, why: "personne" };
      a[key + "H"] = Math.max(a[key + "H"] || 0, a[key]);
      a[key]--;
      assignWorkers();
      domChanged();
      E.emit("struct");
      return { ok: true, reste: a[key] };
    };
    /* Ce que font les travailleurs, atelier par atelier (lecture) */
    E.travailleurs = function () {
      assignWorkers();
      const out = {};
      for (const fam in S.ateliers || {}) out[fam] = { app: S.ateliers[fam].app || 0, ouv: S.ateliers[fam].ouv || 0, usedApp: 0, usedOuv: 0, byRec: {} };
      machPool.forEach((w) => {
        const wk = workerOf(w.m);
        if (!wk || !out[wk.fam]) return;
        if (w.job !== null || w.cad !== null) {
          out[wk.fam][wk.kind === "apprenti" ? "usedApp" : "usedOuv"]++;
          if (w.rec) out[wk.fam].byRec[w.rec] = (out[wk.fam].byRec[w.rec] || 0) + 1;
        }
      });
      return out;
    };
    E.cadenceEligible = function () {
      const cads = (S.dom && S.dom.cadence) || {};
      return Object.keys(D.ITEMS).filter((rec) => {
        if (cads[rec]) return false;
        if (!E.automatable(rec)) return false;
        if (!E.hasEchoFin("retour") && D.COMMANDES && D.COMMANDES.firstByHand && !(S.made[rec] > 0)) return false;
        return anyOwnedMachReadyFor(rec);
      });
    };
    E.hasFactory = () => EXTS.some((t) => count(t) > 0 || S.known[t]) || MACHINES.some((m) => count(m) > 0) ||
      Object.keys(S.dom.ext).length > 0 || S.hand.q.length > 0;
    E.machRate = (m, rec) => (item(m) && item(m).t === "mach" ? machUnitRate(m, null, rec) : 0);
    E.machCan = function (m, r) {
      const it = item(r), M = item(m);
      if (!it || !it.r || !M) return false;
      return Object.keys(it.r[1] || {}).length <= (M.ing !== undefined ? M.ing : 1);
    };
    E.machFor = function (r) {
      return MACHINES.find((m) => E.machCan(m, r)) || null;
    };
    /* ce que les mains ont fini pour un gisement y est posé */
    function deliver(to, id, n) {
      const it = item(id);
      if (!it || typeof to !== "string") return;
      if (to.slice(0, 2) === "x:" && it.t === "ext") {
        const i = to.indexOf(":", 2);
        assignExt(to.slice(2, i), to.slice(i + 1), id, n);
      } else if (to.slice(0, 2) === "u:" && it.t === "ext") { // une amélioration : zone:ressource:ancien niveau
        const [z, res, from] = to.slice(2).split(":");
        if (z && res && from) swapUp(z, res, from, id); else E.domAutoExt(id);
      }
    }
    /* pièces encore attendues pour un gisement ("x:zone:res") */
    E.domQueued = (to) => {
      let n = 0;
      S.hand.q.forEach((j) => {
        if (j.to !== to) return;
        const s = j.s[j.s.length - 1];
        const done = j.done ? j.done[j.s.length - 1] : (j.i === j.s.length - 1 ? j.k : 0);
        n += Math.max(0, s[1] - done);
      });
      return n;
    };

    /* --- chantiers des Grands Œuvres */
    E.domSite = function (pid, on) {
      if (!D.PROJECTS[pid]) return null;
      if (on) S.dom.site[pid] = { on: true };
      else { delete S.dom.site[pid]; delete machStat["S:" + pid]; }
      domChanged();
      return S.dom.site[pid] || null;
    };
    E.siteOn = (pid) => !!(S.dom.site[pid] && S.dom.site[pid].on);
    E.siteRate = () => D.SITE_RATE[Math.min(S.age, D.SITE_RATE.length - 1)] * E.cache().aspd;

    /* --- le calcul */
    function produce(id, k) {
      const it = item(id);
      const bonus = bonusFor(it, k);
      const first = !(S.made[id] > 0);
      S.made[id] = (S.made[id] || 0) + k;
      S.stats.crafts += k;
      if (!S.known[id]) learn(id, true);
      if (first) onFirstCraft(id);
      if (S.track && S.track.id === id) { S.track = null; E.emit("tracked", id); E.emit("struct"); }
      if (!S.flags.lineDone) { S.flags.lineDone = true; checkAges(); E.emit("struct"); }
      return it.r[2] * (k + bonus);
    }
    function runExt(key, e, dt, c) {
      const st = machStat[key] || (machStat[key] = { s: "wait", avg: 0 });
      let made = 0;
      const done = (s) => { st.s = s; st.avg += (1 - Math.exp(-dt / 5)) * (made / dt - st.avg); };
      if (!e.on) return done("off");
      const rate = extOut(e, c);
      if (!(rate > 0)) return done("idle");
      made = rate * dt;
      add(e.res, made);
      E.terreProduire(e.z, made);
      if (!S.flags.extDone) { S.flags.extDone = true; checkAges(); E.emit("struct"); }
      return done("ok");
    }
    /* Un Grand Œuvre alimenté se sert dans la Réserve : de quoi avancer l’étape en
     * cours, au plus `siteRate` par seconde et par matière. */
    function runSite(pid, dt) {
      const st = machStat["S:" + pid] || (machStat["S:" + pid] = { s: "wait", avg: 0 });
      const P = D.PROJECTS[pid];
      if (!P || !projVisible(pid)) { st.s = "idle"; return; }
      const ps = projState(pid), step = P.steps[ps.step];
      if (!step) { st.s = "done"; return; }
      if (!step.cost) { st.s = "act"; return; } // mise à feu, mélodie : ça se décide ailleurs
      if (step.need && !S.frags[step.need]) { st.s = "need"; return; }
      const lane = E.siteRate() * dt;
      let got = 0, done = true;
      st.miss = null;
      for (const i in step.cost) {
        const left = step.cost[i] - (ps.paid[i] || 0);
        if (left > 1e-9) {
          const q = Math.min(left, lane, S.inv[i] || 0);
          if (q > 0) { add(i, -q); ps.paid[i] = (ps.paid[i] || 0) + q; got += q; } else (st.miss = st.miss || {})[i] = "stock";
        }
        if ((ps.paid[i] || 0) < step.cost[i] - 1e-6) done = false;
      }
      st.avg += (1 - Math.exp(-dt / 5)) * (got / dt - st.avg);
      if (done) {
        ps.step++; ps.paid = {};
        E.emit("projstep", { pid, step: ps.step - 1 });
        E.emit("struct");
        if (ps.step >= P.steps.length) endGame(P.end);
        st.s = "ok";
        return;
      }
      st.s = got > 0 ? "ok" : "starved";
    }
    function runCadences(dt, c) {
      const cads = (S.dom && S.dom.cadence) || {};
      const keys = Object.keys(cads);
      const equipe = autoPossible() && Object.keys(S.ateliers || {}).some((f) => S.ateliers[f].app || S.ateliers[f].ouv);
      if (!keys.length && !equipe) return;
      assignWorkers();
      /* les ordres permanents du joueur, puis ce que les travailleurs fabriquent d'eux-mêmes (cible = seuil du métier, ingrédients hors réserves de la file) */
      const lignes = keys.map((rec) => ({ rec, cd: cads[rec], auto: false }));
      if (equipe) {
        const vus = new Set(keys);
        machPool.forEach((w) => {
          if (!w.cad || vus.has(w.cad)) return;
          vus.add(w.cad);
          lignes.push({ rec: w.cad, cd: { cap: autoCible(w.cad), on: true, acc: autoAcc[w.cad] || 0 }, auto: true });
        });
      }
      lignes.forEach(({ rec, cd, auto }) => {
        const it = item(rec);
        if (!cd || cd.on === false || !it || !it.r) return;
        let mRate = 0;
        machPool.forEach((w) => {
          if (w.cad === rec) mRate += machUnitRate(w.m, c, rec);
        });
        if (!(mRate > 0)) return;
        const outPerOp = it.r[2] || 1, cost = it.r[1];
        const room = Math.max(0, (cd.cap || 0) - (S.inv[rec] || 0));
        if (room <= 1e-9) { cd.acc = 0; if (auto) autoAcc[rec] = 0; return; }
        let maxOps = Math.ceil(room / outPerOp);
        for (const i in cost) maxOps = Math.min(maxOps, Math.floor(((S.inv[i] || 0) - (auto ? autoReserve[i] || 0 : 0) + 1e-9) / cost[i]));
        if (maxOps < 1) return;
        cd.acc = (cd.acc || 0) + mRate * dt;
        const k = Math.min(maxOps, Math.floor(cd.acc + 1e-9));
        if (k >= 1) {
          cd.acc = Math.max(0, cd.acc - k);
          for (const i in cost) add(i, -cost[i] * k);
          const out = produce(rec, k);
          add(rec, out);
          if (auto) noteFait(E.atelierDe(rec), rec, out);
          if ((S.inv[rec] || 0) >= (cd.cap || 0) - 1e-9) cd.acc = 0;
        }
        if (auto) autoAcc[rec] = cd.acc;
      });
    }
    function runDom(dt) {
      const c = E.cache();
      for (const k in S.dom.ext) runExt(k, S.dom.ext[k], dt, c);
      for (const p in S.dom.site) if (S.dom.site[p].on) runSite(p, dt);
    }

    /* --- ce qui entre et sort, par seconde */
    E.flows = function () {
      const prod = {}, cons = {};
      assignWorkers();
      machPool.forEach((w) => {
        if ((w.job === null && w.cad === null) || !w.rec) return;
        const it = item(w.rec);
        if (!it || !it.r) return;
        const r = machUnitRate(w.m, null, w.rec);
        prod[w.rec] = (prod[w.rec] || 0) + r * it.r[2];
        for (const i in it.r[1]) cons[i] = (cons[i] || 0) + r * it.r[1][i];
      });
      return { prod, cons };
    };
    /* Tout ce que le Domaine fait entrer et sortir, par matière (par seconde, en moyenne) :
     * la récolte des extracteurs et ce que font les machines, moins ce qu’elles consomment. */
    E.production = function () {
      const f = E.flows(), inn = Object.assign({}, f.prod);
      for (const k in S.dom.ext) {
        const e = S.dom.ext[k], st = machStat[k];
        if (st && st.s === "ok" && st.avg > 1e-6) inn[e.res] = (inn[e.res] || 0) + st.avg;
      }
      const ids = Object.keys(inn).concat(Object.keys(f.cons).filter((k) => !(k in inn)));
      return ids.map((id) => ({ id, in: inn[id] || 0, out: f.cons[id] || 0, net: (inn[id] || 0) - (f.cons[id] || 0) }))
        .sort((a, b) => b.in - a.in || b.out - a.out);
    };

    /* ------------------------------------------------------ grands œuvres */
    function projVisible(pid) {
      const p = D.PROJECTS[pid];
      if (!p) return false;
      if (pid === "chant") {
        const lu = (id) => !!(S.signes && S.signes[id] && S.signes[id].lu);
        const p21 = !!(S.livre && S.livre.p && S.livre.p.p21) && ["machine", "dormir", "enfant", "eveiller"].every(lu);
        const ps = S.proj && S.proj.chant;
        return !!((S.made.traducteur > 0) || (S.inv && S.inv.traducteur > 0) || (S.secrets && S.secrets.promesse) || p21 || (S.meta && S.meta.chant) || (ps && (ps.step > 0 || Object.keys(ps.paid || {}).length)));
      }
      // la Treizième Arche : un vaisseau, et le journal de la station (ou la dernière page du Livre)
      if (pid === "arche13") {
        return !!(((S.made.vaisseau > 0) || (S.inv && S.inv.vaisseau > 0)) && (!!S.flags.station_morte || (S.frags && S.frags.commandant) || !!S.flags.arche13 || (S.livre && S.livre.p && S.livre.p.p32)));
      }
      // le Grand Silence : le signe de la paume levée compris, et de quoi émettre au loin
      if (pid === "silence") {
        return !!((S.signes && S.signes.halte && S.signes.halte.lu) && ((S.made.radiotelescope > 0) || (S.flags && S.flags.radar) || (S.made.telegraphe > 0)));
      }
      if (p.req === "arche") return !!S.flags.arche;
      return (S.made[p.req] || 0) > 0;
    }
    function projState(pid) { return S.proj[pid] || (S.proj[pid] = { step: 0, paid: {} }); }
    E.projVisible = projVisible;
    E.projState = projState;
    E.cutRelay = function () {
      const ps = projState("chant");
      if (ps.step !== 1) return { ok: false, why: "step" };
      if (!S.frags.coeur || !S.frags.poings) return { ok: false, why: "prereq" };
      S.meta.chant = true;
      ps.step = 2;
      E.emit("projstep", { pid: "chant", step: 1 });
      E.emit("struct");
      return { ok: true };
    };
    E.releaseHand = function () {
      const ps = projState("chant");
      if (ps.step !== 2) return { ok: false, why: "step" };
      ps.step = 3;
      E.emit("projstep", { pid: "chant", step: 2 });
      E.emit("struct");
      return { ok: true };
    };
    E.contribute = function (pid) {
      if (!projVisible(pid)) return { ok: false };
      const p = D.PROJECTS[pid], ps = projState(pid);
      const st = p.steps[ps.step];
      if (!st || !st.cost) return { ok: false };
      if (st.need && !S.frags[st.need]) return { ok: false, why: "need" };
      let gave = 0, done = true;
      for (const i in st.cost) {
        const left = st.cost[i] - (ps.paid[i] || 0);
        const g = Math.min(left, Math.floor(count(i)));
        if (g > 0) { add(i, -g); ps.paid[i] = (ps.paid[i] || 0) + g; gave += g; }
        if ((ps.paid[i] || 0) < st.cost[i]) done = false;
      }
      let ending = null;
      if (done) {
        ps.step++; ps.paid = {};
        if (ps.step >= p.steps.length) ending = endGame(p.end);
      }
      E.emit("struct");
      return { ok: gave > 0 || done, gave, done, ending };
    };
    E.fire = function (pid) {
      const p = D.PROJECTS[pid], ps = projState(pid);
      const st = p.steps[ps.step];
      if (!st || !st.fire) return null;
      ps.step++;
      return endGame(p.end);
    };
    function endGame(eid) {
      const first = !S.endings[eid];
      S.endings[eid] = true;
      S.meta.endings[eid] = (S.meta.endings[eid] || 0) + 1;
      recalc();
      const en = D.ENDINGS[eid];
      const extra = (en.extra || []).filter((x) => (x.frag ? S.frags[x.frag] : true) && (x.flag ? S.flags[x.flag] || (S.meta && S.meta[x.flag]) : true)).map((x) => interpolate(x.t));
      const res = { id: eid, first, extra };
      E.emit("ending", res);
      E.emit("struct");
      return res;
    }
    E.endingsCount = () => Object.keys(S.meta.endings).length;
    E.isLibere = () => !!(S.meta && S.meta.endings && S.meta.endings.retour);
    function addCurio(id) {
      if (!D.EASTER || !D.EASTER[id]) return false;
      S.meta = S.meta || {};
      S.meta.curios = S.meta.curios || {};
      if (S.meta.curios[id]) return false;
      S.meta.curios[id] = now();
      E.emit("curio", id);
      return true;
    }
    E.addCurio = addCurio;
    E.hasCurio = (id) => !!(S.meta && S.meta.curios && S.meta.curios[id]);
    E.curiosCount = () => Object.keys((S.meta && S.meta.curios) || {}).length;
    E.curios = () => Object.assign({}, (S.meta && S.meta.curios) || {});

    /* ---------------------------------------------------- GESTES REMARQUÉS (SUCCÈS) */
    function markGeste(id) {
      if (!D.GESTES_REMARQUES || !D.GESTES_REMARQUES[id]) return false;
      S.meta = S.meta || {};
      S.meta.gestes = S.meta.gestes || {};
      if (S.meta.gestes[id]) return false;
      S.meta.gestes[id] = now();
      stamp("g:" + id);
      E.emit("geste", id);
      return true;
    }
    function checkGestes() {
      if (!D.GESTES_REMARQUES) return false;
      S.meta = S.meta || {};
      S.meta.gestes = S.meta.gestes || {};
      let changed = false;
      for (const id in D.GESTES_REMARQUES) {
        if (S.meta.gestes[id]) continue;
        const g = D.GESTES_REMARQUES[id];
        if (typeof g.when === "function" && g.when(S)) {
          S.meta.gestes[id] = now();
          stamp("g:" + id);
          changed = true;
          E.emit("geste", id);
        }
      }
      return changed;
    }
    E.markGeste = markGeste;
    E.checkGestes = checkGestes;
    E.hasGeste = (id) => !!(S.meta && S.meta.gestes && S.meta.gestes[id]);
    E.gestesCount = () => Object.keys((S.meta && S.meta.gestes) || {}).length;
    E.hasNewGeste = function () {
      if (!S.meta || !S.meta.gestes) return false;
      const vu = S.meta.gestesVu || {};
      for (const id in S.meta.gestes) {
        if (!vu[id]) return true;
      }
      return false;
    };
    E.readGestes = function () {
      if (!S.meta) return;
      S.meta.gestesVu = S.meta.gestesVu || {};
      for (const id in (S.meta.gestes || {})) S.meta.gestesVu[id] = true;
    };
    E.gestesList = function () {
      const out = [];
      for (const id in (D.GESTES_REMARQUES || {})) {
        const g = D.GESTES_REMARQUES[id];
        out.push({
          id,
          n: g.n,
          ic: g.ic,
          t: g.t,
          hint: g.hint,
          done: !!(S.meta && S.meta.gestes && S.meta.gestes[id]),
          at: (S.meta && S.meta.gestes && S.meta.gestes[id]) || null
        });
      }
      return out;
    };

    /* ----------------------------------------------------------- LE COMPTOIR
     * Marché tenu par le Troqueur dans la Plaine : on vend ce qui encombre la
     * Réserve contre des écus, et on achète des Souvenirs et des matières premières. */
    const VAL_CACHE = {};
    function valueOf(id) {
      if (VAL_CACHE[id] !== undefined) return VAL_CACHE[id];
      const it = D.ITEMS[id];
      if (!it) return 0;
      if (it.r) {
        const [, ing, qty] = it.r;
        let sum = 0;
        for (const i in ing) sum += valueOf(i) * ing[i];
        return (VAL_CACHE[id] = (sum / (qty || 1)) * D.COMPTOIR.work);
      }
      if (it.t === "res") {
        return (VAL_CACHE[id] = D.COMPTOIR.raw * Math.pow(D.COMPTOIR.rawAge, it.a || 0));
      }
      return (VAL_CACHE[id] = 0);
    }
    E.value = valueOf;

    E.sellable = function (id) {
      const it = D.ITEMS[id];
      if (!it) return false;
      if (it.t !== "res" && it.t !== "comp") return false;
      if (isUnique(it) || it.curio) return false; // un clin d’œil ne se vend nulle part
      return true;
    };

    E.soldCount = (id) => (S.comptoir && S.comptoir.sold && S.comptoir.sold[id]) || 0;

    E.unitPrice = function (id) {
      const v = valueOf(id);
      if (!(v > 0)) return 0;
      const q = E.soldCount(id), sat = D.COMPTOIR.sat;
      return v * donMul("vente") / (1 + q / sat);
    };

    E.sellQuote = function (id, n) {
      n = Math.floor(Number(n));
      if (!(n > 0) || !E.sellable(id)) return 0;
      const v = valueOf(id);
      if (!(v > 0)) return 0;
      const q = E.soldCount(id), sat = D.COMPTOIR.sat;
      return v * donMul("vente") * sat * Math.log((sat + q + n) / (sat + q));
    };

    E.sell = function (id, n) {
      n = Math.floor(Number(n));
      if (!(n > 0)) return { ok: false, why: "qty" };
      if (!E.sellable(id)) return { ok: false, why: "unsellable" };
      if (count(id) < n) return { ok: false, why: "missing" };
      const ecus = E.sellQuote(id, n);
      add(id, -n);
      S.ecus = (S.ecus || 0) + ecus;
      S.comptoir = S.comptoir || { sold: {}, traces: 0 };
      S.comptoir.sold = S.comptoir.sold || {};
      S.comptoir.sold[id] = (S.comptoir.sold[id] || 0) + n;
      if (S.comptoir.sold[id] >= 1000000) {
        if (addCurio("squeeze")) {
          E.emit("toast", "« Un million. Quelqu’un, quelque part, a dû appuyer très fort sur un bouton. »");
        }
      }
      E.emit("sold", { id, n, ecus });
      E.emit("struct");
      return { ok: true, n, ecus };
    };

    E.traceBasePrice = function (age) {
      const C = D.COMPTOIR;
      return C.trace * Math.pow(C.traceAge, (age !== undefined ? age : S.age) || 0);
    };
    E.traceCost = E.traceBasePrice;

    /* Ce que valent des écus à la relève. Au prix du Souvenir de l’âge atteint on obtient `brut` Souvenirs ; le plafond mou en laisse
     * le plein tarif jusqu’à `seuil` (les Souvenirs des passages du cycle, au moins D.COMPTOIR.plafond.plancher), puis `part` du reste. */
    E.ecusDetail = function (ecus, age, passages) {
      const e = ecus !== undefined ? ecus : (S.ecus || 0);
      const base = E.traceBasePrice(age);
      if (!(base > 0) || !(e > 0)) return { brut: 0, trace: 0, seuil: 0, plafonne: false };
      const brut = Math.floor(e / base);
      const P = passages !== undefined ? passages : E.releveGain();
      const C = D.COMPTOIR.plafond || { plancher: 0, part: 1 };
      const seuil = Math.max(P, C.plancher || 0);
      const trace = Math.min(brut, seuil) + Math.floor(Math.max(0, brut - seuil) * (C.part === undefined ? 1 : C.part));
      return { brut, trace, seuil, plafonne: trace < brut };
    };
    E.ecusToTraces = (ecus, age, passages) => E.ecusDetail(ecus, age, passages).trace;

    /* Arrondi à un nombre rond (ex. 1, 2, 5, 10, 25, 50, 100, 130...) */
    function roundNice(n) {
      if (n <= 5) return Math.max(1, Math.round(n));
      if (n <= 20) return Math.round(n / 2) * 2;
      if (n <= 100) return Math.round(n / 5) * 5;
      const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
      return Math.max(1, Math.round(n / p) * p);
    }
    E.roundNice = roundNice;

    /* Prochain passage à franchir (pour les Souvenirs de récompense) */
    E.nextPassageTraces = function () {
      const z = D.ZONES.map((x) => x.id).find((id) => D.PASSAGES[id] && !zoneOpen(id) && !(S.pass && S.pass[id] && S.pass[id].done));
      if (z && D.PASSAGES[z]) return D.PASSAGES[z].tr || 1;
      const passKeys = Object.keys(D.PASSAGES);
      const lastKey = passKeys[passKeys.length - 1];
      return (D.PASSAGES[lastKey] && D.PASSAGES[lastKey].tr) || 1;
    };

    /* Récompense d’une demande du Troqueur */
    E.troqueurReward = function () {
      const tr = E.nextPassageTraces();
      const share = (D.TROQUEUR && D.TROQUEUR.share) || 0.15;
      return Math.max(1, Math.round(share * tr));
    };

    /* Objets que le joueur sait fabriquer, déjà fabriqués, d’un âge permis */
    E.troqueurEligibleItems = function () {
      const minAge = Math.max(0, (S.age || 0) - 1);
      const maxAge = S.age || 0;
      const list = [];
      for (const id in S.known) {
        if (!S.known[id]) continue;
        const it = D.ITEMS[id];
        if (!it || !it.r) continue;
        if (it.sec) continue;
        if (isUnique(it) || isScaled(it)) continue;
        if (!(S.made && S.made[id] > 0)) continue;
        const a = it.a || 0;
        if (a < minAge || a > maxAge) continue;
        const v = valueOf(id);
        if (!(v > 0)) continue;
        list.push(id);
      }
      return list;
    };

    /* ---- Le Troqueur passe par à-coups (D.TROQUEUR) : des blocs de temps, ouverts ou fermés, tirés de la graine de la partie */
    const tqBloc = () => ((D.TROQUEUR && D.TROQUEUR.bloc) || 10800) * 1000;
    function tqTirage(k) { // un nombre dans [0, 1) qui ne dépend que de la graine et du bloc
      let a = (((S.meta && S.meta.graine) | 0) || 40503) ^ Math.imul(k | 0, 2654435761);
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    const tqTiree = (k) => tqTirage(k) < ((D.TROQUEUR && D.TROQUEUR.ouvre) || 0.6);
    function tqOuvertBloc(k) {
      if (tqTiree(k)) return true;
      const m = (D.TROQUEUR && D.TROQUEUR.maxFerme) || 3; // jamais plus de m blocs fermés de suite
      for (let j = 1; j <= m; j++) if (tqTiree(k - j)) return false;
      return true;
    }
    /* ouvert ou non, la fin de l’ouverture en cours (ms) ou le début de la prochaine */
    E.troqueurHoraire = function (t) {
      const B = tqBloc(), k0 = Math.floor((t === undefined ? now() : t) / B);
      let j = k0;
      if (tqOuvertBloc(k0)) {
        while (j - k0 < 48 && tqOuvertBloc(j + 1)) j++;
        return { ouvert: true, fin: (j + 1) * B };
      }
      while (j - k0 < 48 && !tqOuvertBloc(j)) j++;
      return { ouvert: false, ouvre: j * B };
    };

    /* matières premières d’une unité d’un objet : on remonte les recettes jusqu’à ce que le joueur récolte */
    function tqBrut(id, out, mult, depth) {
      const it = item(id);
      if (!it || depth > 30) return;
      if (it.t === "res" && (!it.r || tqTaux(id) > 0)) { out[id] = (out[id] || 0) + mult; return; }
      if (!it.r) { out[id] = (out[id] || 0) + mult; return; }
      const ing = it.r[1], q = it.r[2] || 1;
      for (const i in ing) tqBrut(i, out, (mult * ing[i]) / q, depth + 1);
    }
    /* ce que le joueur tire d’une matière par seconde : ses extracteurs, plus un peu de récolte à la main */
    function tqTaux(res) {
      let r = 0;
      const c = E.cache();
      for (const k in S.dom.ext) { const e = S.dom.ext[k]; if (e.res === res && e.on) r += extOut(e, c); }
      const z = RES_ZONE[res];
      if (z && zoneOpen(z) && ZONES[z].res.includes(res)) r += tapYield(res, z) * ((D.TROQUEUR && D.TROQUEUR.main) || 0.5);
      return r;
    }
    /* arrondi par défaut à deux chiffres significatifs : une demande ne dépasse jamais ce que la production permet */
    function tqPlancher(n) {
      if (n <= 10) return Math.floor(n);
      const d = Math.pow(10, Math.floor(Math.log10(n)) - 1);
      return Math.floor(n / d) * d;
    }
    /* Combien d’exemplaires le joueur produit en (minParTrace × récompense) minutes, la matière la plus lente fixant le rythme ;
     * 0 si une matière lui est inaccessible (aucun extracteur, aucune récolte à la main) ou si un seul exemplaire demande plus que ça. */
    E.troqueurQuantite = function (id, tr) {
      const TQ = D.TROQUEUR || {};
      const minutes = Math.max(TQ.minMin || 10, Math.min(TQ.minMax || 90, (TQ.minParTrace || 10) * (tr || 1)));
      const brut = {};
      tqBrut(id, brut, 1, 0);
      let parUnite = 0;
      for (const res in brut) {
        const r = tqTaux(res);
        if (!(r > 0)) return 0;
        parUnite = Math.max(parUnite, brut[res] / r);
      }
      if (!(parUnite > 0)) return 0;
      return tqPlancher((minutes * 60) / parUnite);
    };

    /* Nouvelle série de demandes (D.TROQUEUR.slots), valable jusqu’à la fin de l’ouverture en cours */
    E.refreshTroqueur = function (force) {
      if (!E.comptoirOpen() && !force) return false;
      const horaire = E.troqueurHoraire();
      if (!horaire.ouvert && !force) return false;
      const TQ = D.TROQUEUR || { slots: 3 };
      const tr = E.troqueurReward();
      const pool = E.troqueurEligibleItems().filter((id) => E.troqueurQuantite(id, tr) >= 1);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
      }
      const asks = pool.slice(0, TQ.slots || 3).map((id) => ({ id, n: E.troqueurQuantite(id, tr), tr }));
      S.comptoir = S.comptoir || { sold: {}, traces: 0, asks: [], next: 0 };
      S.comptoir.asks = asks;
      S.comptoir.next = horaire.ouvert ? horaire.fin : now() + tqBloc();
      E.emit("troqueur", { asks });
      E.emit("struct");
      return true;
    };
    /* met les demandes d’accord avec l’heure : une série par ouverture, rien pendant la fermeture */
    function syncTroqueur() {
      if (!E.comptoirOpen()) return;
      if (!S.comptoir) S.comptoir = { sold: {}, traces: 0, asks: [], next: 0 };
      const c = S.comptoir, h = E.troqueurHoraire();
      if (h.ouvert) {
        if (c.next !== h.fin) E.refreshTroqueur();
        else if (!(c.asks && c.asks.length) && E.troqueurEligibleItems().length > 0) E.refreshTroqueur();
      } else if ((c.asks && c.asks.length) || c.next !== h.ouvre) {
        c.asks = [];
        c.next = h.ouvre;
        E.emit("struct");
      }
    }
    /* Liste courante des demandes (vide quand le Troqueur est parti) */
    E.troqueurAsks = function () {
      syncTroqueur();
      return (S.comptoir && S.comptoir.asks) || [];
    };

    E.troqueurCount = () => (S.comptoir && S.comptoir.asks ? S.comptoir.asks.filter(Boolean).length : 0);

    /* Échelons et réputation auprès du Troqueur (0.8.0) */
    E.troqueurRep = function () {
      const cnt = S.meta.troqueurDelivered || 0;
      const ranks = [
        { lvl: 0, n: "Curieux de passage", req: 0, bonus: 0 },
        { lvl: 1, n: "Client régulier", req: 3, bonus: 1 },
        { lvl: 2, n: "Négociant estimé", req: 8, bonus: 2 },
        { lvl: 3, n: "Vieille connaissance", req: 18, bonus: 3 },
        { lvl: 4, n: "« Encore toi »", req: 35, bonus: 5 }
      ];
      let cur = ranks[0];
      for (const r of ranks) { if (cnt >= r.req) cur = r; }
      const next = ranks.find((r) => r.req > cnt) || null;
      return { cnt, cur, next };
    };

    /* ---------------------------------------------------- LE TROQUEUR PARLE
     * Une réplique à la fois, tirée parmi celles que le rang de confiance, le cycle, l’âge et
     * ce que le joueur a trouvé ou porte permettent. Rien ne se redit à l’identique : les
     * répliques entendues sont gardées dans S.meta.troc (jamais effacées à la relève), sauf les
     * conseils marqués « renouv », qui reviennent une fois par relève. */
    function trocState() {
      const m = S.meta;
      if (!m.troc || typeof m.troc !== "object" || Array.isArray(m.troc)) m.troc = { vus: {}, dernier: null, refus: 0 };
      return m.troc;
    }
    const trocData = () => RECIT.troc || {};
    function trocDispo(l) {
      const T = trocState();
      const v = T.vus[l.id];
      if (v && !(l.renouv && v < (S.cycle || 1))) return false;
      if (l.apres && !T.vus[l.apres]) return false;
      if ((l.rang || 0) > E.troqueurRep().cur.lvl) return false;
      return !l.cond || cond(l.cond);
    }
    function trocSceneChoix(d) {
      if (!d) return null;
      const T = trocData();
      if (d.id) {
        const l = (T.lignes || []).find((x) => x.id === d.id);
        return (l && l.choix) || d.choix || null;
      }
      const RS = T.refusScenes && T.refusScenes[d.th];
      return (RS && RS.choix) || d.choix || null;
    }
    E.troqueurThemes = function () {
      const T = trocData();
      return (T.themes || []).map((th) => ({ id: th.id, n: th.n, dispo: (T.lignes || []).filter((l) => l.th === th.id && trocDispo(l)).length }));
    };
    E.troqueurParle = function (th, choixKey) {
      if (!E.comptoirOpen()) return { ok: false, why: "closed" };
      const T = trocData(), st = trocState();
      if (!(T.themes || []).some((x) => x.id === th)) return { ok: false, why: "theme" };

      // Choix de réplique dans la scène en cours :
      if (choixKey) {
        if (!st.dernier || st.dernier.th !== th || st.dernier.rep) {
          return { ok: false, why: "choix" };
        }
        const choix = trocSceneChoix(st.dernier);
        if (!choix || !choix.length) return { ok: false, why: "choix" };
        const c = choix.find((x) => x.k === choixKey);
        if (!c) return { ok: false, why: "choix" };
        st.dernier.rep = choixKey;
        st.dernier.q = c.q;
        st.dernier.t = interpolate(c.t);
        E.emit("troc", st.dernier);
        E.emit("struct");
        return { ok: true, id: st.dernier.id, th, rep: choixKey, choix: choixKey, q: c.q, t: st.dernier.t };
      }

      const pool = (T.lignes || []).filter((l) => l.th === th && trocDispo(l));
      let out;
      if (pool.length) {
        const l = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
        st.vus[l.id] = S.cycle || 1;
        const initialT = interpolate(l.t);
        const initialQ = l.q || (l.choix && l.choix[0] && l.choix[0].q) || "";
        st.dernier = {
          id: l.id,
          th,
          stage: l.stage || "",
          q: initialQ,
          t: initialT,
          choix: l.choix || null,
          rep: null
        };
        out = { ok: true, id: l.id, th, vide: false, attenteChoix: !!(l.choix && l.choix.length), stage: l.stage || "", q: initialQ, t: initialT, choix: l.choix || null };
      } else {
        const R = T.refus || [];
        const i = st.refus | 0;
        st.refus = i + 1;
        const th0 = (T.themes || []).find((x) => x.id === th);
        const q = (th0 && th0.q) || "";
        const RS = T.refusScenes && T.refusScenes[th];
        const t = R.length ? interpolate(R[i % R.length]) : "";
        st.dernier = {
          id: null,
          th,
          refus: i,
          stage: (RS && RS.stage) || "",
          q,
          t,
          choix: (RS && RS.choix) || null,
          rep: null
        };
        out = { ok: true, th, vide: true, attenteChoix: !!(RS && RS.choix && RS.choix.length), refus: i, stage: (RS && RS.stage) || "", q, t, choix: (RS && RS.choix) || null };
      }
      E.emit("troc", out);
      E.emit("struct");
      return out;
    };
    E.troqueurChoix = function (k) {
      const st = trocState();
      if (!st || !st.dernier || st.dernier.rep) return { ok: false };
      const choix = trocSceneChoix(st.dernier);
      if (!choix || !choix.length) return { ok: false };
      return E.troqueurParle(st.dernier.th, k);
    };
    E.troqueurFin = function () {
      const st = trocState();
      if (!st || !st.dernier) return { ok: false };
      st.dernier = null;
      E.emit("troc", null);
      E.emit("struct");
      return { ok: true };
    };
    /* la dernière parole, qui reste affichée tant qu’il n’en dit pas une autre */
    E.troqueurDernier = function () {
      const d = S.meta && S.meta.troc && S.meta.troc.dernier;
      if (!d) return null;
      const T = trocData();
      if (d.id) {
        const l = (T.lignes || []).find((x) => x.id === d.id);
        if (!l) return null;
        return {
          id: l.id,
          th: d.th,
          vide: false,
          q: d.q || l.q || "",
          t: d.t || interpolate(l.t),
          stage: l.stage || d.stage || "",
          choix: l.choix || null,
          rep: d.rep || null
        };
      }
      const R = T.refus || [];
      const th0 = (T.themes || []).find((x) => x.id === d.th);
      const RS = T.refusScenes && T.refusScenes[d.th];
      return {
        id: null,
        th: d.th,
        vide: true,
        refus: d.refus | 0,
        stage: d.stage || (RS && RS.stage) || "",
        q: d.q || (th0 && th0.q) || "",
        t: d.t || (R.length ? interpolate(R[(d.refus | 0) % R.length]) : ""),
        choix: d.choix || (RS && RS.choix) || null,
        rep: d.rep || null
      };
    };
    E.troqueurDispo = () => E.troqueurThemes().reduce((a, x) => a + x.dispo, 0);

    /* Livrer une demande du Troqueur */
    E.deliverAsk = function (idx) {
      if (!S.comptoir || !S.comptoir.asks) return { ok: false, why: "no_asks" };
      idx = Number(idx);
      const ask = S.comptoir.asks[idx];
      if (!ask) return { ok: false, why: "empty" };
      if (count(ask.id) < ask.n) return { ok: false, why: "missing", need: ask.n, have: count(ask.id) };
      add(ask.id, -ask.n);
      const rep = E.troqueurRep();
      const bonusTr = rep.cur.bonus || 0;
      S.meta.troqueurDelivered = (S.meta.troqueurDelivered || 0) + 1;
      S.meta.traces = (S.meta.traces || 0) + ask.tr + bonusTr;
      S.meta.tracesTotal = (S.meta.tracesTotal || 0) + ask.tr + bonusTr;
      S.comptoir.asks[idx] = null;
      E.emit("delivered", { ask, idx, bonus: bonusTr });
      E.emit("struct");
      return { ok: true, ask, bonus: bonusTr };
    };

    /* ---------------------------------------------------- REGISTRE DE QUÊTES (0.8.0) */
    /* Les 3 rituels quotidiens des Semeurs (renouvelés à chaque nouveau jour réel) */
    E.dailyRituals = function () {
      const m = S.meta;
      const dk = dayKey();
      if (!m.rituals || m.rituals.day !== dk) {
        m.rituals = { day: dk, prog: [0, 0, 0], claimed: [false, false, false] };
      }
      const age = S.age || 0;
      const t1 = Math.max(10, 10 * (age + 1));
      const t2 = Math.max(80, 50 * (age + 1));
      const t3 = 1;
      const p = m.rituals.prog;
      const c = m.rituals.claimed;

      return [
        {
          id: "mains",
          n: "Façonnage des mains",
          d: "Façonner " + t1 + " objets à la main.",
          ic: "✋",
          target: t1,
          prog: Math.min(t1, p[0] || 0),
          done: (p[0] || 0) >= t1,
          claimed: !!c[0],
          reward: { tr: Math.max(2, Math.floor((age + 1) * 1.5)) }
        },
        {
          id: "terre",
          n: "Moisson de la terre",
          d: "Récolter " + t2 + " ressources brutes.",
          ic: "🌾",
          target: t2,
          prog: Math.min(t2, p[1] || 0),
          done: (p[1] || 0) >= t2,
          claimed: !!c[1],
          reward: { ecus: 25 * (age + 1), tr: 1 }
        },
        {
          id: "esprit",
          n: "Éveil de l’esprit",
          d: "Étudier une ressource ou percer un mystère.",
          ic: "✨",
          target: t3,
          prog: Math.min(t3, p[2] || 0),
          done: (p[2] || 0) >= t3,
          claimed: !!c[2],
          reward: { intu: 5 + age * 2 }
        }
      ];
    };

    /* Réclamer la récompense d’un rituel accompli */
    E.claimRitual = function (idx) {
      idx = Number(idx);
      const rits = E.dailyRituals();
      const r = rits[idx];
      if (!r || !r.done || r.claimed) return { ok: false, why: !r ? "invalid" : r.claimed ? "claimed" : "not_done" };
      S.meta.rituals.claimed[idx] = true;
      if (r.reward.tr) {
        S.meta.traces = (S.meta.traces || 0) + r.reward.tr;
        S.meta.tracesTotal = (S.meta.tracesTotal || 0) + r.reward.tr;
      }
      if (r.reward.intu) S.intu = (S.intu || 0) + r.reward.intu;
      if (r.reward.ecus) S.ecus = (S.ecus || 0) + r.reward.ecus;
      E.emit("ritual_claimed", { idx, ritual: r });
      E.emit("struct");
      return { ok: true, reward: r.reward };
    };

    /* Quête de Scénario (Fil rouge narratif par chapitre) */
    E.scenarioQuest = function () {
      const g = E.guide();
      const curAge = D.AGES[S.age] || D.AGES[0];
      const ob = g ? g.ob : E.objective();
      const targetId = g && g.step ? g.step : ob && ob.k === "craft" ? ob.id : null;
      const p = targetId && S.known[targetId] ? E.plan(targetId, 1) : null;
      const ready = p ? p.ok : false;
      const miss = p ? Object.keys(p.missing) : [];

      const chapterTitles = [
        "Chapitre I · L’Éveil des mains",
        "Chapitre II · Les Premiers outils",
        "Chapitre III · Le Tranchant du silex",
        "Chapitre IV · La Flamme et le cuivre",
        "Chapitre V · L’Alliage du bronze",
        "Chapitre VI · Le Marteau et le fer",
        "Chapitre VII · L’Acier",
        "Chapitre VIII · La Vapeur au travail",
        "Chapitre IX · L’Étincelle captive",
        "Chapitre X · Le Cœur de l’atome",
        "Chapitre XI · La Pensée du silicium",
        "Chapitre XII · L’Huile noire",
        "Chapitre XIII · L’Étoffe des composites",
        "Chapitre XIV · L’Envol spatial",
        "Chapitre XV · La Lumière stellaire"
      ];
      const chapter = chapterTitles[S.age] || ("Chapitre " + (S.age + 1));
      return {
        chapter,
        ageName: curAge.n,
        ob,
        step: g ? g.step : (ob ? ob.id : null),
        targetId,
        ready,
        missing: p ? p.missing : {},
        missKeys: miss,
        txt: (ob && ob.txt) || curAge.q || "",
        isArche: !!S.flags.arche
      };
    };

    /* Synthèse globale du Registre pour pastilles, alertes et notifications */
    E.questSummary = function () {
      const sc = E.scenarioQuest();
      const rits = E.dailyRituals();
      const tqAsks = E.troqueurAsks();
      const readyRitual = rits.some((r) => r.done && !r.claimed);
      const payableAsk = tqAsks.some((a) => a && (S.inv[a.id] || 0) >= a.n);
      const readyScenario = sc.ready;
      return {
        scenario: sc,
        rituals: rits,
        troqueur: tqAsks,
        hasReady: readyRitual || payableAsk || readyScenario,
        readyRitual,
        payableAsk,
        readyScenario
      };
    };

    function canBuyRes(id) {
      const it = D.ITEMS[id];
      if (!it || it.t !== "res") return false;
      return D.ZONES.some((z) => zoneOpen(z.id) && z.res.includes(id));
    }
    E.canBuyRes = canBuyRes;

    E.buyResCost = (id, n) => (Math.floor(Number(n)) || 0) * D.COMPTOIR.buy * valueOf(id);

    E.buyableRes = function () {
      const seen = {}, list = [];
      D.ZONES.forEach((z) => {
        if (!zoneOpen(z.id)) return;
        z.res.forEach((r) => {
          if (!seen[r]) { seen[r] = true; list.push(r); }
        });
      });
      return list;
    };

    E.buyRes = function (id, n) {
      n = Math.floor(Number(n));
      if (!(n > 0)) return { ok: false, why: "qty" };
      if (!canBuyRes(id)) return { ok: false, why: "unavailable" };
      const cost = E.buyResCost(id, n);
      if ((S.ecus || 0) < cost) return { ok: false, why: "ecus", need: cost };
      S.ecus -= cost;
      add(id, n);
      E.emit("bought", { kind: "res", id, n, ecus: cost });
      E.emit("struct");
      return { ok: true, id, n, ecus: cost };
    };

    E.comptoirOpen = () => zoneOpen(D.COMPTOIR.zone);

    /* ------------------------------------------------------ Les jours de présence (D.JOURS)
     * Un compteur de jours où le joueur est venu. Jamais une série : rien ne se remet à zéro. Le premier
     * lancement de chaque journée (jour local) compte un jour et laisse un petit cadeau. */
    E.jours = () => S.meta.jours;
    E.jourVenu = function () {
      const J = S.meta.jours, dk = dayKey();
      if (!(dk > J.dernier)) return null; // déjà compté aujourd’hui (ou l’horloge a reculé : on ne retire rien)
      J.n++; J.dernier = dk;
      const pal = D.JOURS.paliers[J.n], g = pal || D.JOURS.base;
      S.intu += g.intu;
      S.meta.traces = (S.meta.traces || 0) + g.tr;
      S.meta.tracesTotal = (S.meta.tracesTotal || 0) + g.tr;
      J.cadeau = { n: J.n, intu: g.intu, tr: g.tr, t: (pal && pal.t) || "" };
      E.emit("struct");
      return J.cadeau;
    };
    /* le prochain jour qui rapporte plus (pour la ligne discrète des Rituels) */
    E.jourProchain = () => { const J = S.meta.jours; return Object.keys(D.JOURS.paliers).map(Number).sort((x, y) => x - y).find((p) => p > J.n) || 0; };
    let jourVu = 0;

    /* Nouveau cycle : le Semeur suivant s’éveille. On garde le savoir. */
    const STATIONS = Object.keys(D.ITEMS).filter((k) => D.ITEMS[k].t === "stat" && !D.ITEMS[k].sec && !D.ITEMS[k].path);
    E.newCycle = function () {
      const old = S;
      const gain = E.releveGain();
      const ecusGain = E.ecusToTraces(old.ecus, old.age);
      const totalGain = gain + ecusGain;
      old.meta.traces = (old.meta.traces || 0) + totalGain;
      old.meta.tracesTotal = (old.meta.tracesTotal || 0) + totalGain;
      old.meta.maxAge = Math.max(old.meta.maxAge || 0, old.age || 0);
      old.meta.passEver = Object.assign({}, old.meta.passEver || {});
      for (const z in old.pass || {}) {
        if (old.pass[z] && old.pass[z].done && !old.pass[z].free && PASS[z]) old.meta.passEver[z] = true;
      }
      for (const z in old.zones || {}) {
        if (old.zones[z] && PASS[z] && !(old.pass && old.pass[z] && old.pass[z].free)) old.meta.passEver[z] = true;
      }
      if (old.comptoir) { old.comptoir.asks = []; old.comptoir.next = 0; }
      const cap = (D.RUINES && D.RUINES.cap) || 3;
      const ruins = {};
      EXTS.concat(MACHINES).concat(STATIONS).forEach((id) => {
        const cnt = Math.floor(old.inv[id] || 0);
        if (cnt > 0) ruins[id] = Math.min(cnt, isUnique(item(id)) ? 1 : cap);
      });
      old.meta.ruins = ruins;
      const curSplits = (old.stats && old.stats.splits && typeof old.stats.splits === "object") ? old.stats.splits : {};
      old.meta.bestSplits = (old.meta.bestSplits && typeof old.meta.bestSplits === "object") ? old.meta.bestSplits : {};
      const prevBest = Object.assign({}, old.meta.bestSplits);
      for (const z in curSplits) {
        const t = Math.floor(Number(curSplits[z]));
        if (t > 0 && (!old.meta.bestSplits[z] || t < old.meta.bestSplits[z])) old.meta.bestSplits[z] = t;
      }
      old.meta.lastSplits = Object.assign({}, curSplits);
      old.meta.prevBestSplits = prevBest;
      old.meta.lastCycle = {
        cycle: old.cycle || 1,
        play: Math.max(1, Math.round((old.stats && old.stats.cyclePlay) || (old.stats && old.stats.play) || 0)),
        zones: Object.keys(old.zones || {}).length
      };
      const n = freshState(now());
      n.known = old.known; n.hints = old.hints; n.frags = old.frags; n.secrets = old.secrets; n.studied = old.studied || {};
      n.seen = old.seen; n.meta = old.meta; n.meta.ruins = Object.assign({}, ruins); n.settings = old.settings; n.pins = old.pins || {};
      n.livre = old.livre ? JSON.parse(JSON.stringify(old.livre)) : { p: {}, vu: {} };
      n.revus = Object.assign({}, old.revus || {});
      n.questions = old.questions ? JSON.parse(JSON.stringify(old.questions)) : {};
      n.signes = old.signes ? JSON.parse(JSON.stringify(old.signes)) : {};
      n.repaired = Object.assign({}, old.repaired || {});
      n.eventsSeen = old.eventsSeen ? Object.assign({}, old.eventsSeen) : {};
      n.cycle = (old.cycle || 1) + 1;
      n.echoes = Object.values(old.meta.endings).reduce((a, b) => a + b, 0);
      n.intu = Math.max(3, old.intu); // l’Intuition se garde, comme le Carnet
      // les mains se souviennent un peu : une part de l’expérience reste
      for (const g in old.skills || {}) n.skills[g] = Math.floor((old.skills[g] || 0) * D.SKILL.keep);
      n.introSeen = true;
      n.stats = Object.assign({}, old.stats, { cyclePlay: 0, splits: {} });
      // le tutoriel déjà vu, les conseils déjà lus et la version vue ne reviennent pas
      for (const k in old.flags) if (k === "tuto" || k === "ver" || k === "milesSeen" || k === "roueSeen" || k.indexOf("tip_") === 0) n.flags[k] = old.flags[k];
      if (old.flags && (old.flags.registre || (old.secrets && old.secrets.cregistre))) n.flags.registre = true;
      // ce qui traverse la relève : Accorder, et la progression du Grand Œuvre caché
      if (old.flags && old.flags.berceuse) n.flags.berceuse = true;
      if (old.proj && old.proj.chant) n.proj.chant = JSON.parse(JSON.stringify(old.proj.chant));
      n.termMode = old.termMode || (n.flags.registre ? "reg" : "arche");
      if (old.meta.capsule) {
        n.flags.capsuleMsg = true;
        Object.assign(n.inv, { bois: 60, fibre: 60, caillou: 40, manche: 10, corde: 10 });
      }
      S = n;
      S.meta.achats = true; // les Souvenirs se dépensent maintenant, au réveil du nouveau Semeur
      // la Mémoire des mains : le paquetage, et les terres déjà connues
      // ce que le paquetage donne compte comme déjà fait (les étapes « manche », « corde »… passent)
      D.PAQUETAGE.slice(0, memLvl("paquetage")).forEach((kit) => { for (const i in kit) { add(i, kit[i]); if (item(i).r) S.made[i] = Math.max(S.made[i] || 0, 1); if (isUnique(item(i)) && S.meta.ruins && S.meta.ruins[i]) delete S.meta.ruins[i]; } });
      const racLvl = memLvl("raccourci");
      ["plaine", "riviere", "collines", "mine"].slice(0, racLvl).forEach((z) => {
        const tool = ZONES[z].req;
        S.inv[tool] = 1; S.made[tool] = 1; markSeen(tool);
        S.age = Math.max(S.age, item(tool).a || 0);
        S.pass[z] = { paid: {}, done: true, free: true };
        S.zones[z] = true;
      });
      if (racLvl >= 3 && D.ITEMS.hache_pierre) {
        S.inv.hache_pierre = 1; S.made.hache_pierre = 1; markSeen("hache_pierre");
      }
      // les dons de la relève : trois dons tirés pour ce cycle, aucun gardé du précédent
      if (!(n.meta.graine >= 1)) n.meta.graine = 1 + Math.floor(rand() * 2147483000);
      n.don = null;
      n.donsOffre = n.cycle >= 2 ? E.donsTirage(n.cycle, n.meta.graine) : [];
      forgetDom();
      recalc();
      checkGestes();
      E.emit("cycle", n.cycle);
      E.emit("struct");
    };

    /* Première renaissance obligatoire (fin du tutoriel) */
    /* la relève obligatoire : une fois, au cycle 1, quand le premier passage (la Plaine) est franchi : le joueur a déjà gagné ses premiers Souvenirs et sait ce que coûte un passage */
    E.canForcedReleve = () => !!(S.meta && S.meta.parcours && !S.meta.forcedDone && S.cycle === 1 && S.pass && S.pass.plaine && S.pass.plaine.done);
    E.forcedReleve = function () {
      if (S.meta.forcedDone || S.cycle !== 1) return false;
      S.meta.forcedDone = true;
      S.meta.reveilAt = now(); // le rappel du Domaine (« Un autre Semeur a pris le relais ») ne reste que quelques minutes
      const gift = (D.PARCOURS && D.PARCOURS.gift) || 3;
      S.meta.traces = (S.meta.traces || 0) + gift;
      S.meta.tracesTotal = (S.meta.tracesTotal || 0) + gift;
      E.newCycle();
      return true;
    };

    /* Indique si le Semeur actuel est encore en train de rattraper l’avancée de ses prédécesseurs */
    E.isCatchingUp = function () {
      if ((S.cycle || 1) <= 1) return false;
      const maxAge = (S.meta && S.meta.maxAge) || 0;
      const passEver = (S.meta && S.meta.passEver) || {};
      const everKeys = Object.keys(passEver).filter((z) => PASS[z]);
      if (!maxAge && !everKeys.length) return false;
      const newPass = Object.keys(S.pass || {}).some((z) => S.pass[z].done && !S.pass[z].free && !passEver[z]);
      if (newPass && (S.age || 0) >= maxAge) return false;
      const ratifyLeft = everKeys.some((z) => !zoneOpen(z));
      return (S.age || 0) < maxAge || (ratifyLeft && !newPass);
    };

    /* Détermine si la relève doit être activement proposée au joueur :
     * - Souvenirs disponibles à la relève
     * - Le joueur a rejoint puis dépassé son front pionnier (plus jamais en plein rattrapage)
     * - ET fatigue ressentie sur l’avancée nouvelle (âge dépassé, effort unitaire long, ou gain significatif) */
    E.shouldSuggestReleve = function () {
      if (!E.canReleve || !E.canReleve()) return null;
      const gain = E.releveGain ? E.releveGain() : 0;
      if (!(gain > 0)) return null;
      if (E.isCatchingUp && E.isCatchingUp()) return null;

      const maxAge = (S.meta && S.meta.maxAge) || 0;
      const passEver = (S.meta && S.meta.passEver) || {};
      const newPass = Object.keys(S.pass || {}).some((z) => S.pass[z].done && !S.pass[z].free && !passEver[z]);
      const reach = Math.max(1 + (S.cycle || 1) * 2, maxAge > 0 ? maxAge + 1 : 0);
      const ageDepasse = (S.age || 0) > reach;

      const traceSeuil = Math.max(6, Math.ceil(((S.meta && S.meta.tracesTotal) || 0) * 0.35));
      const beaucoupTraces = gain >= traceSeuil && (maxAge === 0 || newPass || (S.age || 0) > maxAge);

      const hi = E.handInfo ? E.handInfo() : { left: 0, jobs: [] };
      const j0 = hi.jobs && hi.jobs.length ? hi.jobs[0] : null;
      const longJob = !!(j0 && !j0.paused && !j0.wait && j0.n === 1 && (!j0.steps || j0.steps.length <= 1) && (item(j0.id).a || 0) > Math.max(1, maxAge) && j0.left > 30);

      if (ageDepasse || longJob || beaucoupTraces) {
        return {
          gain,
          reason: ageDepasse ? "age" : longJob ? "duree" : "traces",
          titre: "Les mains s’alourdissent",
          texte: "Ce Semeur s’essouffle. En passant le relais maintenant (+ " + gain + " ✦), le prochain Semeur repartira avec tes Souvenirs, des récoltes démultipliées et des gestes plus vifs."
        };
      }
      return null;
    };

    /* Les ruines : ce qu’un Semeur a construit attend le suivant */
    E.ruins = function () {
      const out = {};
      for (const id in (S.meta && S.meta.ruins) || {}) {
        if (S.meta.ruins[id] > 0) out[id] = S.meta.ruins[id];
      }
      return out;
    };
    E.ruinCost = function (id) {
      const it = item(id);
      if (!it || !it.r || !it.r[1]) return {};
      const part = (D.RUINES && D.RUINES.part) || 0.1;
      const cost = {};
      for (const k in it.r[1]) cost[k] = Math.ceil(it.r[1][k] * part);
      return cost;
    };
    /* Résout le coût d’une ruine depuis la Réserve : pièces directes d’abord, ou matières premières des sous-pièces connues */
    E.ruinResolve = function (id) {
      const it = item(id);
      if (!it || !(S.meta && S.meta.ruins && S.meta.ruins[id] > 0)) return { ok: false, why: "noruin" };
      const cost = E.ruinCost(id);
      const directMissing = {};
      for (const k in cost) {
        const have = S.inv[k] || 0;
        if (have < cost[k]) directMissing[k] = cost[k] - have;
      }
      if (!Object.keys(directMissing).length) return { ok: true, cost: Object.assign({}, cost), crafts: {} };
      const avail = Object.assign({}, S.inv);
      const used = {}, crafts = {};
      let failed = false, guard = 0;
      function need(x, qty, d) {
        if (failed || ++guard > 2000 || d > 40) { failed = true; return; }
        const have = Math.floor(avail[x] || 0);
        const use = Math.min(have, qty);
        if (use > 0) {
          used[x] = (used[x] || 0) + use;
          avail[x] = have - use;
          qty -= use;
        }
        if (qty <= 1e-9) return;
        const ix = item(x);
        const zid = RES_ZONE[x];
        const gather = ix && ix.t === "res" && zid && zoneOpen(zid);
        if (!ix || !ix.r || gather || !S.known[x] || blocker(x)) { failed = true; return; }
        const n = Math.ceil(qty / (ix.r[2] || 1));
        crafts[x] = (crafts[x] || 0) + n;
        for (const i in ix.r[1]) need(i, ix.r[1][i] * n, d + 1);
        const surplus = n * (ix.r[2] || 1) - qty;
        if (surplus > 0) avail[x] = (avail[x] || 0) + surplus;
      }
      for (const k in cost) need(k, cost[k], 0);
      if (failed) return { ok: false, why: "missing", missing: directMissing };
      return { ok: true, cost: used, crafts };
    };
    /* relève tout ce que la Réserve permet, parmi `ids` (ou toutes les ruines), une réparation à la fois ; renvoie combien */
    E.repairAll = function (ids) {
      let n = 0;
      const list = (ids || Object.keys(E.ruins())).filter((id) => item(id));
      let again = true;
      while (again) {
        again = false;
        for (const id of list) if (S.meta && S.meta.ruins && S.meta.ruins[id] > 0 && E.repair(id).ok) { n++; again = true; }
      }
      return n;
    };
    E.repair = function (id) {
      const it = item(id);
      if (!it || !(S.meta && S.meta.ruins && S.meta.ruins[id] > 0)) return { ok: false, why: "noruin" };
      if (isUnique(it) && (S.inv[id] || 0) >= 1) { delete S.meta.ruins[id]; return { ok: false, why: "owned" }; }
      const res = E.ruinResolve(id);
      if (!res.ok) return res;
      for (const k in res.cost) S.inv[k] -= res.cost[k];
      for (const c in res.crafts) {
        S.made[c] = (S.made[c] || 0) + res.crafts[c] * (item(c).r[2] || 1);
        markSeen(c);
      }
      add(id, 1);
      S.meta.ruins[id] -= 1;
      if (S.meta.ruins[id] <= 0) delete S.meta.ruins[id];
      // réparer vaut fabriquer : l’étape « fabrique une cabane » ou une station est faite (comme pour ce que donne le paquetage)
      const wasMade = (S.made[id] || 0) > 0;
      S.made[id] = Math.max(S.made[id] || 0, 1);
      markSeen(id);
      if (!wasMade && !it.sec && !it.path) {
        avancerAge(id);
        if (it.e && it.e.zone) reachZone(it.e.zone);
        checkAges();
      }
      S.repaired = S.repaired || {};
      const firstRepair = !S.repaired[id];
      S.repaired[id] = (S.repaired[id] || 0) + 1;
      S.flags = S.flags || {};
      S.flags.repairedCycle = S.flags.repairedCycle || {};
      const firstInCycle = !S.flags.repairedCycle[id];
      S.flags.repairedCycle[id] = 1;
      if (firstRepair && RECIT.pages) {
        for (const pid in RECIT.pages) {
          if (S.livre && S.livre.p && S.livre.p[pid]) continue;
          const page = RECIT.pages[pid];
          if (!page.src) continue;
          for (const s of page.src) {
            if (s.k === "repair" && s.id === id) {
              givePage(pid, "repair");
              break;
            }
          }
        }
      }
      if (it.t === "ext") E.domAutoExt(id);
      recalc();
      domChanged();
      E.emit("struct");
      return { ok: true, id, cost: res.cost, echo: E.ruinEcho(id), firstInCycle };
    };
    E.ruinEcho = function (id) {
      const it = item(id), ec = (D.RUINES && D.RUINES.echos) || {};
      return ec[id] || (it && ec[it.t]) || "";
    };
    E.ruinName = function (id) {
      const it = item(id);
      if (!it) return id;
      if (it.ruine) return it.ruine;
      if (it.t === "mach") return (it.sn || it.n) + " rouillé";
      return (it.sn || it.n) + " en ruine";
    };
    /* Miroir du cycle : compare le rythme d’ouverture des terres entre le cycle actuel (ou celui qui vient de s’achever)
     * et les cycles précédents. */
    E.cycleMirror = function () {
      const curMap = (S.stats && S.stats.splits) || {};
      const lastMap = (S.meta && S.meta.lastSplits) || {};
      const bestMap = (S.meta && S.meta.bestSplits) || {};
      const prevBestMap = (S.meta && S.meta.prevBestSplits) || {};
      const hasCur = Object.keys(curMap).length > 0;
      const activeSplits = hasCur ? curMap : lastMap;
      const refSplits = hasCur ? lastMap : prevBestMap;
      const recSplits = hasCur ? bestMap : prevBestMap;
      const rows = [];
      for (const z of D.ZONES) {
        if (z.id === "lisiere") continue;
        const cur = activeSplits[z.id] || 0;
        const prev = refSplits[z.id] || 0;
        const best = recSplits[z.id] || 0;
        if (!cur && !prev && !best) continue;
        const ref = prev || best;
        const speedup = cur > 0 && ref > cur ? Math.round((ref / cur) * 10) / 10 : 0;
        const isRecord = cur > 0 && ref > 0 && cur < (best || Infinity);
        rows.push({ z: z.id, n: z.n, cur, prev, best: best ? Math.min(best, cur || Infinity) : cur, speedup, isRecord });
      }
      return {
        cycle: hasCur ? (S.cycle || 1) : Math.max(1, (S.cycle || 2) - 1),
        isJustWoken: !hasCur && Object.keys(lastMap).length > 0,
        cyclePlay: Math.round((S.stats && S.stats.cyclePlay) || 0),
        lastCycle: (S.meta && S.meta.lastCycle) || null,
        rows
      };
    };

    /* ------------------------------------------------------ temps */
    function step(dt, offline) {
      const c = E.cache();
      checkPageSources();
      for (const r in c.rates) add(r, c.rates[r] * dt);
      pullOrderInputs();
      runDom(dt);
      pullOrderInputs();
      runAct(dt, offline);
      workStep(dt, offline);
      if(E.atelierEconomyStep)E.atelierEconomyStep(dt);
      runCadences(dt, c);
      if (!offline) { combustionStep(dt); panneStep(dt); fatigueStep(dt); }
      pullOrderInputs();
      if (!offline && c.pip > 0) {
        S.pipAcc += c.pip * dt;
        const open = [];
        D.ZONES.forEach((z) => { if (zoneOpen(z.id)) z.res.forEach((r) => open.push([r, z.id])); });
        while (S.pipAcc >= 1 && open.length) {
          S.pipAcc -= 1;
          const [r, z] = open[Math.floor(rand() * open.length)];
          add(r, tapYield(r, z));
        }
      }
      if (c.intu > 0) {
        S.intuAcc += (c.intu / 60) * dt;
        if (S.intuAcc >= 1) { const k = Math.floor(S.intuAcc); S.intu += k; S.intuAcc -= k; }
      }
      if (!offline) {
        S.stats.play += dt; // le temps passé à jouer, pas l’absence
        S.stats.cyclePlay = (S.stats.cyclePlay || 0) + dt;
      }
      E.terresCheck();
    }
    E.step = step;

    function checkTroqueur() { syncTroqueur(); }

    /* ===== FIGURES DU COSMOS (début) =====
     * Les fragments du Journal et les signes, vus comme des étoiles. Ne donne jamais le texte d'un fragment,
     * ni le nom d'un lieu pas encore exploré, ni le mot ou la réponse d'un signe pas encore compris.
     *   stars : un fragment retrouvé (« allumee »), ou le lieu repéré qui le garde (« pale »)
     *   rang  : la place du fragment dans sa terre, dans le catalogue entier (stable) */
    E.figures = function () {
      const vis = E.visibleFrags();
      const rangs = {}, cpt = {};
      vis.forEach((f) => { const z = D.FRAGS[f].z; rangs[f] = cpt[z] = (cpt[z] === undefined ? 0 : cpt[z] + 1); });
      const stars = [], noms = {};
      const pale = {};
      for (const zid in ZONES) {
        if (!zoneOpen(zid)) continue;
        const n = E.nextExp(zid);
        if (!n || n.x.hidden) continue; // un lieu qu’on ne voit pas encore ne se devine pas
        const fid = (RECIT.expFrag && RECIT.expFrag[zid + ":" + n.x.id]) || (n.x.rw && n.x.rw.frag);
        if (fid && rangs[fid] !== undefined && !S.frags[fid]) pale[fid] = zid;
      }
      const zones = Object.keys(ZONES);
      vis.forEach((f) => { const z = D.FRAGS[f].z; if (zones.indexOf(z) < 0) zones.push(z); });
      zones.forEach((z) => {
        vis.forEach((f) => {
          const F = D.FRAGS[f];
          if (F.z !== z) return;
          if (S.frags[f]) { stars.push({ id: f, z, etat: "allumee", rang: rangs[f], n: F.n || F.titre || "" }); noms[z] = true; }
          else if (pale[f]) stars.push({ id: f, z, etat: "pale", rang: rangs[f] });
        });
      });
      const signes = E.seenSignes().map((s) => {
        const o = { id: s.id, h: s.def.h.slice(), lu: s.lu, lieux: s.lieux.slice() };
        if (s.lu) o.mot = s.def.mot;
        return o;
      });
      return { stars, signes, noms: Object.keys(noms).reduce((a, z) => { a[z] = z; return a; }, {}) };
    };
    /* ===== FIGURES DU COSMOS (fin) ===== */

    /* ===== VISITEURS DE PASSAGE (début) =====
     * Le calendrier compte le temps de jeu actif (S.stats.play) : une absence ne l'avance pas, et
     * rien n'est tiré pendant le rattrapage. L'écran dit si une fenêtre ou le tutoriel bloque (ctx.bloque) :
     * le visiteur attend alors un moment libre. Données : D.VISITEURS. */
    let visCur = null; // le visiteur qui traverse en ce moment
    const VIS_SANS = { orbite: 1, lune: 1, mercure: 1, mine: 1, caveau: 1 }; // pas de ciel, pas de passant
    function visSt() {
      const v = S.visiteur && typeof S.visiteur === "object" ? S.visiteur : (S.visiteur = { next: 0, clins: {} });
      if (!(v.next >= 0)) v.next = 0;
      if (!v.clins || typeof v.clins !== "object") v.clins = {};
      return v;
    }
    function visDelai() { const d = D.VISITEURS.delai; return d[0] + rand() * (d[1] - d[0]); }
    function partJour(h) { return h < 6 || h >= 21 ? "night" : h < 8 ? "dawn" : h >= 18 ? "dusk" : "day"; }
    E.visiteurActif = () => !S.settings || S.settings.visiteurs !== false;
    E.setVisiteurs = function (on) {
      S.settings.visiteurs = !!on;
      visCur = null;
      visSt().next = (S.stats.play || 0) + visDelai(); // rallumés, ils ne tombent pas tout de suite
    };
    E.visiteursPossibles = function (zone, hour) {
      if (!zone || VIS_SANS[zone]) return [];
      const part = partJour(hour);
      return D.VISITEURS.liste.filter((x) => x.tps.includes(part) && (!x.terres || x.terres.includes(zone)));
    };
    /* un coup d'œil de l'écran, une fois tous les dixièmes de seconde : renvoie le visiteur qui arrive, ou null */
    E.visiteurPoll = function (ctx) {
      ctx = ctx || {};
      if (OFF || !E.visiteurActif()) return null;
      const v = visSt(), play = S.stats.play || 0;
      if (!(v.next > 0)) { v.next = play + visDelai(); return null; }
      if (visCur || play < v.next || ctx.bloque) return null;
      const zone = ctx.zone && zoneOpen(ctx.zone) ? ctx.zone : null;
      const hour = ctx.hour !== undefined ? ctx.hour : new Date().getHours();
      const poss = E.visiteursPossibles(zone, hour);
      if (!poss.length) return null; // pas le bon endroit ou la bonne heure : il attend
      let tot = 0;
      poss.forEach((x) => { tot += x.w || 1; });
      let r = rand() * tot, def = poss[poss.length - 1];
      for (const x of poss) { r -= x.w || 1; if (r < 0) { def = x; break; } }
      v.next = play + visDelai();
      S.stats.visiteursVus = (S.stats.visiteursVus || 0) + 1;
      visCur = { id: def.id, zone };
      return { id: def.id, ic: def.ic, css: def.css || "", n: def.n, aria: D.VISITEURS.txt.aria.replace("{n}", def.n.charAt(0).toUpperCase() + def.n.slice(1)), dur: D.VISITEURS.traversee };
    };
    E.visiteurEnCours = () => (visCur ? visCur.id : null);
    E.visiteurPartir = function () { visCur = null; };
    /* le lot : une matière de la terre (≈ 90 s de récolte à la main), un peu d'Intuition, et rarement le reste */
    E.visiteurToucher = function (id) {
      if (OFF || !visCur || visCur.id !== id) return null;
      const def = D.VISITEURS.liste.find((x) => x.id === id), L = D.VISITEURS.lot, zone = visCur.zone;
      visCur = null;
      if (!def) return null;
      const cand = ZONES[zone].res.filter((r) => tapYield(r, zone) > 0);
      const lot = { id, zone, res: null, qty: 0, intu: L.intu, objet: null, page: null, clin: null };
      if (cand.length) {
        lot.res = cand[Math.min(cand.length - 1, Math.floor(rand() * cand.length))];
        lot.qty = Math.max(1, Math.round(L.secondes * (skillSpeed("recolte") / SK.harvest) * tapYield(lot.res, zone)));
        add(lot.res, lot.qty);
      }
      S.intu += L.intu;
      const v = visSt();
      const r = rand();
      let seuil = 0;
      const pages = def.pg && E.comptoirOpen() ? Object.keys(RECIT.pages || {}).filter((p) => !(S.livre && S.livre.p && S.livre.p[p]) && (RECIT.pages[p].src || []).some((s) => s.k === "buy")) : [];
      if (pages.length) {
        seuil += L.page;
        if (r < seuil) { lot.page = pages[Math.min(pages.length - 1, Math.floor(rand() * pages.length))]; givePage(lot.page, "visiteur"); }
      }
      if (!lot.page && def.clin && !v.clins[id]) {
        seuil += L.clin;
        if (r < seuil) { v.clins[id] = 1; lot.clin = def.clin; S.stats.visiteursClins = (S.stats.visiteursClins || 0) + 1; }
      }
      if (!lot.page && !lot.clin && r >= seuil && r < seuil + L.objet) {
        const pieces = Object.keys(D.ITEMS).filter((k) => D.ITEMS[k].t === "comp" && (S.made[k] || 0) > 0 && (D.ITEMS[k].a || 0) <= S.age);
        if (pieces.length) { lot.objet = pieces[Math.min(pieces.length - 1, Math.floor(rand() * pieces.length))]; add(lot.objet, 1); }
      }
      S.stats.visiteurs = (S.stats.visiteurs || 0) + 1;
      E.emit("struct");
      return lot;
    };
    /* ===== VISITEURS DE PASSAGE (fin) ===== */

    /* Avance le temps jusqu’à maintenant. Gère aussi le hors-ligne. */
    let lastAgeCheck = 0;
    E.update = function () {
      const t = now();
      const dt = (t - S.t) / 1000;
      S.t = t;
      if (t - energieT > 1000) { energieT = t; energieRecalc(); }
      if (t - lastAgeCheck > 1500) { lastAgeCheck = t; avancerAge(); } // une étape finie peut ouvrir l’âge suivant
      if (S.boosts) {
        let boostExpired = false;
        for (const bk in S.boosts) {
          if (S.boosts[bk] && S.boosts[bk].until <= t) {
            delete S.boosts[bk];
            boostExpired = true;
          }
        }
        if (boostExpired) recalc();
      }
      if (t - jourVu > 30000 || t < jourVu) { jourVu = t; E.jourVenu(); } // un nouveau jour ? (au plus toutes les 30 s)
      if (!(dt > 0)) return 0;
      if (dt > 5) return E.catchUp(dt);
      step(dt, false);
      if (S.exp.active && t >= S.exp.active.t0 + S.exp.active.dur) finishExp(false);
      checkTroqueur();
      checkEvents();
      checkGestes();
      return dt;
    };

    E.catchUp = function (dt) {
      const absent = dt;
      const baseCap = memV("veille") * donMul("veille") * 3600 || OFFLINE_CAP;
      const maxCap = E.hasEchoFin("exode") ? Math.max(24 * 3600, baseCap) : baseCap;
      dt = Math.min(dt, maxCap);
      OFF = true;
      const before = Object.assign({}, S.inv);
      const faitAvant = S.equipe && S.equipe.fait ? JSON.parse(JSON.stringify(S.equipe.fait)) : {};
      const chunk = dt > 600 ? 10 : 1;
      let left = dt;
      try { while (left > 0) { const d = Math.min(chunk, left); step(d, true); left -= d; } } finally { OFF = false; }
      if (S.pannes && Object.keys(S.pannes).some((m) => S.pannes[m])) { S.pannes = {}; syncMachPool(); } // jeu fermé, l’atelier a réparé
      if (S.usure) S.usure = {};
      if (TRAV.fatigue && S.ateliers) { // pendant l’absence, les travailleurs se reposent
        for (const fam in S.ateliers) {
          const a = S.ateliers[fam];
          if (!a.fatigue) continue;
          a.fatigue = Math.max(0, a.fatigue - dt / TRAV.fatigue.repos);
          if (a.greve && a.fatigue <= TRAV.fatigue.reprise) { a.greve = false; a.alerte = false; }
          if (a.alerte && !a.greve && a.fatigue < TRAV.fatigue.alerte - 0.15) a.alerte = false;
        }
      }
      if (absent >= 7200) nuit();
      let exp = null;
      if (S.exp.active && now() >= S.exp.active.t0 + S.exp.active.dur) { exp = S.exp.active; finishExp(true); }
      const gains = {};
      for (const k in S.inv) {
        const g = S.inv[k] - (before[k] || 0);
        if (g >= 1) gains[k] = g;
      }
      if (absent >= ((D.VOIX && D.VOIX.retourApres) || 300) && S.equipe && S.equipe.fait) {
        const r = {};
        for (const fam in S.equipe.fait) for (const rec in S.equipe.fait[fam]) {
          const d = S.equipe.fait[fam][rec] - (((faitAvant[fam] || {})[rec]) || 0);
          if (d >= 1) (r[fam] = r[fam] || {})[rec] = d;
        }
        if (Object.keys(r).length) S.equipe.retour = { dt: absent, fait: r };
      }
      E.emit("offline", { dt, gains, exp });
      checkTroqueur();
      return dt;
    };

    /* ------------------------------------------------------ EXPÉDITIONS LONGUES (fouilles)
     * Un lieu déjà exploré (dans cet éveil, ou un lieu d’à côté) se fouille de nouveau : trois niveaux
     * (D.FOUILLE), de plus en plus longs, un seul à la fois, hors ligne. L’état est dans la méta (S.meta.exlong,
     * S.meta.fouilles, S.meta.cotes) : il traverse la relève, et rien n’expire. Le temps passé se lit sur
     * l’horloge, pas sur la simulation : une absence de douze heures termine une fouille de huit. Le butin
     * attend qu’on le reçoive (E.fouilleRecolter) : ressources de la terre, Intuition la première fois,
     * une parole du lieu, et parfois un lieu d’à côté. */
    const FOU = () => (D.FOUILLE && D.FOUILLE.niveaux) || [];
    const fouKey = (z, x) => z + ":" + x;
    E.fouilleNiveau = (z, xid) => (S.meta && S.meta.fouilles && S.meta.fouilles[fouKey(z, xid)]) || 0;
    /* un lieu d’à côté : 0 inconnu, 1 trouvé, 2 exploré */
    E.coteEtat = (z, xid) => (S.meta && S.meta.cotes && S.meta.cotes[fouKey(z, xid)]) || 0;
    E.fouilleLieuOk = function (z, i) {
      const Z = ZONES[z], x = Z && Z.exps[i];
      if (!x || !zoneOpen(z)) return false;
      return x.cote ? E.coteEtat(z, x.id) === 2 : i < (S.exp.done[z] || 0);
    };
    E.fouilleLancer = function (z, i, lvl) {
      lvl = Math.floor(Number(lvl));
      if (!(lvl >= 1 && lvl <= FOU().length)) return { ok: false, why: "niveau" };
      if (S.meta.exlong) return { ok: false, why: "busy" };
      if (!E.fouilleLieuOk(z, i)) return { ok: false, why: "lieu" };
      const x = ZONES[z].exps[i];
      if (lvl > E.fouilleNiveau(z, x.id) + 1) return { ok: false, why: "palier" };
      S.meta.exlong = { z, x: x.id, lvl, t0: now(), dur: FOU()[lvl - 1].s * 1000, pret: false };
      E.emit("struct");
      return { ok: true };
    };
    E.fouilleEnCours = function () {
      const a = S.meta && S.meta.exlong;
      if (!a) return null;
      const x = ZONES[a.z] && ZONES[a.z].exps.find((e) => e.id === a.x);
      if (!x) return null;
      const el = Math.max(0, now() - a.t0);
      return { z: a.z, x, lvl: a.lvl, niv: FOU()[a.lvl - 1], p: Math.min(1, el / a.dur), left: Math.max(0, (a.dur - el) / 1000), pret: el >= a.dur };
    };
    function fouilleCheck() {
      const a = S.meta && S.meta.exlong;
      if (!a) return;
      if (a.t0 > now()) a.t0 = now(); // l’horloge a reculé : la fouille repart de maintenant, elle ne se bloque pas
      if (!a.pret && now() >= a.t0 + a.dur) {
        a.pret = true;
        E.emit("fouillePrete", E.fouilleEnCours());
        E.emit("struct");
      }
    }
    E.fouilleCheck = fouilleCheck;
    /* ce que le lieu dit : sa parole du niveau la première fois, sinon une phrase d’usage */
    function fouillePhrase(key, lvl, prem) {
      const F = RECIT.fouille || {};
      const own = F.lignes && F.lignes[key] && F.lignes[key][lvl - 1];
      if (prem && own) return own;
      const g = (F.generiques && F.generiques[lvl - 1]) || [];
      const list = prem ? g : (F.refaite || g);
      if (!list.length) return "";
      let h = 0;
      for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 9973;
      return list[(h + lvl) % list.length];
    }
    E.fouillePhrases = function (z, xid) { // ce qu’on a déjà entendu à ce lieu, niveau par niveau
      const key = fouKey(z, xid), niv = E.fouilleNiveau(z, xid), own = (RECIT.fouille && RECIT.fouille.lignes && RECIT.fouille.lignes[key]) || [];
      const out = [];
      for (let l = 1; l <= niv; l++) if (own[l - 1]) out.push({ lvl: l, t: interpolate(own[l - 1]) });
      return out;
    };
    E.fouilleRecolter = function () {
      const en = E.fouilleEnCours();
      if (!en) { if (S.meta.exlong) S.meta.exlong = null; return { ok: false, why: "none" }; }
      if (!en.pret) return { ok: false, why: "pas_fini", left: en.left };
      const N = FOU()[en.lvl - 1], z = en.z, x = en.x, key = fouKey(z, x.id);
      const butin = {};
      for (const r of ZONES[z].res) { const n = Math.max(1, Math.ceil(tapYield(r, z) * N.taps)); butin[r] = n; add(r, n); }
      const prem = en.lvl > E.fouilleNiveau(z, x.id);
      let intu = 0, cote = null;
      if (prem) {
        intu = N.intu; S.intu += intu;
        S.meta.fouilles = S.meta.fouilles || {};
        S.meta.fouilles[key] = en.lvl;
        stamp("x:" + key + ":" + en.lvl);
        if (en.lvl === FOU().length) {
          const c = ((RECIT.fouille && RECIT.fouille.cotes) || []).find((q) => q.z === z && q.parent === x.id);
          S.meta.cotes = S.meta.cotes || {};
          if (c && !S.meta.cotes[fouKey(z, c.id)]) { S.meta.cotes[fouKey(z, c.id)] = 1; cote = { id: c.id, n: c.n }; stamp("x:" + fouKey(z, c.id)); }
        }
      }
      const phrase = interpolate(fouillePhrase(key, en.lvl, prem));
      S.meta.exlong = null;
      S.meta.fouillesFaites = (S.meta.fouillesFaites || 0) + 1;
      const res = { ok: true, z, x, lvl: en.lvl, niv: N, butin, intu, phrase, cote, prem };
      E.emit("fouille", res);
      checkAges();
      E.emit("struct");
      return res;
    };
    // la fouille se termine d’elle-même, jeu ouvert ou après une absence : on enveloppe update et catchUp
    {
      const upd = E.update, cu = E.catchUp;
      E.update = function () { const r = upd.apply(this, arguments); fouilleCheck(); return r; };
      E.catchUp = function () { const r = cu.apply(this, arguments); fouilleCheck(); return r; };
    }

    /* ------------------------------------------------------ sauvegarde */
    E.serialize = () => JSON.stringify(S);
    /* Lit une sauvegarde (chaîne JSON ou objet), la migre et la valide.
     * Ne modifie l’état courant que si tout s’est bien passé. */
    /* Domaine d’une sauvegarde : ce qui est illisible est mis de côté, pas jeté.
     * Les anciens groupes fixes de machines (S.dom.mach) sont dissous : leurs
     * tampons retournent à la Réserve et les machines restent possédées, au repos. */
    function checkDom(o) {
      const d = o.dom && typeof o.dom === "object" ? o.dom : freshDom();
      const aside = (k, v) => { o.orphans = o.orphans || {}; (o.orphans.dom = o.orphans.dom || {})[k] = v; };
      if (!d.ext || typeof d.ext !== "object") d.ext = {};
      if (!d.site || typeof d.site !== "object") d.site = {};
      d.seq = Math.max(0, Math.floor(d.seq) || 0);
      for (const k in d.ext) {
        const e = d.ext[k], i = k.indexOf(":"), z = k.slice(0, i), res = k.slice(i + 1);
        if (!e || typeof e !== "object" || !e.u || typeof e.u !== "object" || !(ZONE_DEPS[z] || []).some((x) => x.res === res)) {
          aside("ext:" + k, e); delete d.ext[k]; continue;
        }
        e.z = z; e.res = res; e.on = e.on !== false;
        for (const t in e.u) {
          const n = Math.max(0, Math.floor(e.u[t]) || 0);
          // v8 : un extracteur à plusieurs ressources est devenu une ligne par ressource ; ceux qui travaillaient une autre ressource que celle de leur objet passent au niveau frère de cette ressource
          const frere = D.ITEMS[t] && D.ITEMS[t].t === "ext" && n && !extRate(t, res) ? extFrere(t, res) : null;
          if (frere) {
            o.inv = o.inv || {};
            o.inv[t] = Math.max(0, (Number(o.inv[t]) || 0) - n);
            o.inv[frere] = (Number(o.inv[frere]) || 0) + n;
            if (o.made && o.made[t]) o.made[frere] = Math.max(o.made[frere] || 0, 1);
            delete e.u[t];
            e.u[frere] = (e.u[frere] || 0) + n;
            if (o.known && o.known[t]) o.known[frere] = true;
            continue;
          }
          if (!D.ITEMS[t] || D.ITEMS[t].t !== "ext" || !extRate(t, res) || !n) { if (n) aside("ext:" + k + ":" + t, n); delete e.u[t]; }
          // posé sur une autre terre que la sienne (permis avant la 5.3) : il rentre chez lui au chargement
          else if (!extZones(t).includes(z)) { const m = (o.flags.reExt = o.flags.reExt || {}); m[t] = (m[t] || 0) + n; delete e.u[t]; }
          else e.u[t] = n;
        }
        if (!Object.keys(e.u).length) delete d.ext[k];
      }
      // jamais plus d’extracteurs posés qu’on n’en possède
      const own = (t) => Math.floor(Number(o.inv[t]) || 0), used = {};
      for (const k in d.ext) for (const t in d.ext[k].u) {
        const v = Math.min(d.ext[k].u[t], Math.max(0, own(t) - (used[t] || 0)));
        used[t] = (used[t] || 0) + v;
        if (v) d.ext[k].u[t] = v; else delete d.ext[k].u[t];
      }
      for (const k in d.ext) if (!Object.keys(d.ext[k].u).length) delete d.ext[k];
      const recById = {};
      if (Array.isArray(d.mach) && d.mach.length > 0) {
        o.flags = o.flags || {};
        o.flags.mach57 = true;
        d.mach.forEach((e, idx) => {
          if (!e || typeof e !== "object" || !D.ITEMS[e.m] || D.ITEMS[e.m].t !== "mach" || (e.r && (!D.ITEMS[e.r] || !D.ITEMS[e.r].r))) {
            aside("mach:" + ((e && e.id) || idx), e);
          } else if (e.id && e.r) {
            recById[e.id] = e.r;
          }
        });
      }
      if (d.ms && typeof d.ms === "object") {
        for (const id in d.ms) {
          const B = d.ms[id];
          if (B && typeof B === "object") {
            backToInv(o, B.b);
            if (B.o && typeof B.o === "object") backToInv(o, B.o);
            else if (Number(B.o) > 0 && recById[id]) backToInv(o, { [recById[id]]: Number(B.o) });
            o.flags = o.flags || {};
            o.flags.mach57 = true;
          }
        }
      }
      d.mach = [];
      d.ms = {};
      // un chantier mis de côté quand son Grand Œuvre avait disparu (0.8.1) revient
      const od = o.orphans && o.orphans.dom;
      if (od) for (const k of Object.keys(od)) {
        const p = k.indexOf("site:") === 0 ? k.slice(5) : null;
        if (p && D.PROJECTS[p] && !d.site[p]) { d.site[p] = od[k]; delete od[k]; }
      }
      for (const p in d.site) {
        if (!D.PROJECTS[p]) { aside("site:" + p, d.site[p]); delete d.site[p]; } else d.site[p] = { on: !!d.site[p] && d.site[p].on !== false };
      }
      const cleanCad = {};
      if (d.cadence && typeof d.cadence === "object" && !Array.isArray(d.cadence)) {
        for (const rec in d.cadence) {
          const cd = d.cadence[rec], it = D.ITEMS[rec];
          if (cd && typeof cd === "object" && it && it.r && !isUnique(it) && !isScaled(it)) {
            const cap = Math.max(1, Math.min(100000, Math.floor(Number(cd.cap)) || 100));
            cleanCad[rec] = { cap, on: cd.on !== false, acc: Math.max(0, Number(cd.acc) || 0) };
          }
        }
      }
      if (Object.keys(cleanCad).length) d.cadence = cleanCad;
      else delete d.cadence;
      o.dom = d;
    }
    /* File des commandes d’une sauvegarde : une commande illisible est annulée et
     * ses matières rendues au stock (ou mises de côté si l’objet n’existe plus). */
    function checkHand(o) {
      const h = o.hand && typeof o.hand === "object" ? o.hand : {};
      const q = Array.isArray(h.q) ? h.q : [];
      const keep = [];
      const refund = (b) => {
        if (!b || typeof b !== "object") return;
        for (const i in b) {
          const v = Number(b[i]);
          if (!(v > 0)) continue;
          if (D.ITEMS[i]) o.inv[i] = (o.inv[i] || 0) + v;
          else { o.orphans = o.orphans || {}; (o.orphans.inv = o.orphans.inv || {})[i] = (o.orphans.inv[i] || 0) + v; }
        }
      };
      q.forEach((j) => {
        const ok = j && typeof j === "object" && D.ITEMS[j.id] && Array.isArray(j.s) && j.s.length &&
          j.s.every((s) => Array.isArray(s) && D.ITEMS[s[0]] && D.ITEMS[s[0]].r && s[1] >= 1) && j.b && typeof j.b === "object";
        if (!ok || keep.length >= D.HAND.max) { refund(j && j.b); return; }
        for (const i in j.b) if (!D.ITEMS[i] || !(Number(j.b[i]) > 0)) { refund({ [i]: j.b[i] }); delete j.b[i]; }
        j.s = j.s.map((s) => [s[0], Math.floor(s[1])]);
        if (D.CRAFT_EQUIPMENT) {
          j.ancienAtelier = j.ancienAtelier === true;
          j.recettesEquipements = j.recettesEquipements === true && j.s.some(s => !!D.CRAFT_EQUIPMENT.legacyInputs[s[0]]);
          const sel=j.equipmentSelection, nm=sel&&E.normMode?E.normMode(sel.mode):sel&&sel.mode;
          if (sel && D.CRAFT_EQUIPMENT.recipes[j.id]?.some(c=>c.equipment===sel.equipment&&c.mode===nm)) j.equipmentSelection={equipment:sel.equipment,mode:nm};
          else delete j.equipmentSelection;
        }
        j.recettes020 = j.recettes020 === true && j.s.some((s) => !!INPUTS_020[s[0]]);
        j.recettes035 = j.recettes035 === true && j.s.some((s) => !!INPUTS_035[s[0]]);
        if (Array.isArray(j.done) && j.done.length === j.s.length) {
          j.done = j.done.map((d, idx) => Math.max(0, Math.min(j.s[idx][1], Math.floor(Number(d)) || 0)));
        } else {
          const i0 = Math.max(0, Math.min(j.s.length, Math.floor(j.i) || 0));
          const k0 = Math.max(0, Math.floor(j.k) || 0);
          j.done = j.s.map((s, idx) => idx < i0 ? s[1] : idx === i0 ? Math.min(s[1], k0) : 0);
        }
        if (Array.isArray(j.hMade) && j.hMade.length === j.s.length) {
          j.hMade = j.hMade.map((d, idx) => Math.max(0, Math.min(j.done[idx], Math.floor(Number(d)) || 0)));
        } else {
          j.hMade = j.done.slice();
        }
        if (Array.isArray(j.sp) && j.sp.length === j.s.length) {
          j.sp = j.sp.map((v) => Math.max(0, Number(v) || 0));
        } else {
          j.sp = j.s.map(() => 0); // l’ancien S.hand.p comptait des secondes : la pièce en cours repart de zéro
        }
        if (Array.isArray(j.mAcc) && j.mAcc.length === j.s.length) {
          j.mAcc = j.mAcc.map((v) => Math.max(0, Number(v) || 0));
        } else {
          j.mAcc = j.s.map(() => 0);
        }
        const cleanMiss = {};
        if (j.miss && typeof j.miss === "object") {
          for (const k in j.miss) {
            const v = Number(j.miss[k]);
            if (D.ITEMS[k] && v > 0) cleanMiss[k] = v;
          }
        }
        j.miss = cleanMiss;
        let cur = j.done.findIndex((d, idx) => d < j.s[idx][1]);
        if (cur < 0) cur = j.s.length;
        j.i = cur;
        j.k = cur < j.s.length ? j.done[cur] : 0;
        if (typeof j.to !== "string") delete j.to;
        delete j.loop;
        keep.push(j);
      });
      o.hand = { q: keep, p: 0 };
      if (!o.studied || typeof o.studied !== "object") o.studied = {};
    }
    function parseSave(src) {
      const o = typeof src === "string" ? JSON.parse(src) : JSON.parse(JSON.stringify(src));
      if (!o || typeof o !== "object" || !o.inv || typeof o.inv !== "object") throw new Error("Ce n’est pas une sauvegarde d’Éclat.");
      migrate(o);
      const hadPass = !!o.pass && typeof o.pass === "object";
      // ce qui manquait avant certaines versions : à traiter une fois la partie chargée
      const mig = { pre63: !o.eventsSeen, pre071: !(o.meta && o.meta.stamps) };
      const base = freshState(now());
      for (const k in base) if (o[k] === undefined || o[k] === null && k !== "track") o[k] = base[k];
      o.meta = Object.assign({ endings: {}, capsule: false, capsuleText: "", traces: 0, tracesTotal: 0, curios: {}, curioHearts: 0, trans: {}, hints_endings: {}, troqueurDelivered: 0, rituals: {} }, o.meta);
      Territoires.normalize(o);
      if (!o.meta.curios || typeof o.meta.curios !== "object" || Array.isArray(o.meta.curios)) o.meta.curios = {};
      if (!o.meta.trans || typeof o.meta.trans !== "object" || Array.isArray(o.meta.trans)) o.meta.trans = {};
      if (!o.meta.hints_endings || typeof o.meta.hints_endings !== "object" || Array.isArray(o.meta.hints_endings)) o.meta.hints_endings = {};
      o.meta.curioHearts = Math.max(0, Math.floor(Number(o.meta.curioHearts)) || 0);
      o.meta.capsuleText = typeof o.meta.capsuleText === "string" ? o.meta.capsuleText.slice(0, 140) : "";
      if (!o.eventsSeen || typeof o.eventsSeen !== "object" || Array.isArray(o.eventsSeen)) o.eventsSeen = {};
      if (o.termMode !== "reg" && o.termMode !== "arche") o.termMode = (o.flags && o.flags.registre) ? "reg" : "arche";
      if (!o.meta.mem || typeof o.meta.mem !== "object") o.meta.mem = {};
      // les fouilles : niveaux atteints, lieux d’à côté trouvés, expédition en cours (rien n’expire, rien ne se perd)
      {
        const m = o.meta, isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
        const fo = {}, co = {};
        if (isObj(m.fouilles)) for (const k in m.fouilles) { const v = Math.floor(Number(m.fouilles[k])); if (v >= 1 && v <= 9) fo[k] = v; }
        if (isObj(m.cotes)) for (const k in m.cotes) { const v = Math.floor(Number(m.cotes[k])); if (v === 1 || v === 2) co[k] = v; }
        m.fouilles = fo; m.cotes = co;
        const a = m.exlong, nv = (D.FOUILLE && D.FOUILLE.niveaux) || [];
        m.exlong = (isObj(a) && ZONES[a.z] && ZONES[a.z].exps.some((e) => e.id === a.x) && Math.floor(a.lvl) >= 1 && Math.floor(a.lvl) <= nv.length && Number(a.t0) > 0 && Number(a.dur) > 0)
          ? { z: a.z, x: a.x, lvl: Math.floor(a.lvl), t0: Number(a.t0), dur: Number(a.dur), pret: !!a.pret } : null;
        m.fouillesFaites = Math.max(0, Math.floor(Number(m.fouillesFaites)) || 0);
      }
      // les dons de la relève : illisible, remis à zéro (jamais une erreur)
      o.meta.graine = Number.isInteger(o.meta.graine) && o.meta.graine >= 1 ? o.meta.graine : 0;
      {
        const dn = o.don, okId = (id) => typeof id === "string" && !!DON[id];
        const cyc = Math.floor(Number(o.cycle)) || 1;
        o.don = dn && typeof dn === "object" && !Array.isArray(dn) && okId(dn.id) && Math.floor(Number(dn.cycle)) === cyc ? { id: dn.id, cycle: cyc } : null;
        const of = Array.isArray(o.donsOffre) ? o.donsOffre.filter((id, i, a) => okId(id) && a.indexOf(id) === i).slice(0, D.DONS_OFFRE) : [];
        o.donsOffre = o.don ? [] : of;
      }
      // les jours de présence : un compteur, jamais une série
      {
        const j = o.meta.jours, ok = j && typeof j === "object" && !Array.isArray(j), cd = ok && j.cadeau;
        const nj = ok ? Math.floor(Number(j.n)) : 0;
        o.meta.jours = {
          n: nj >= 0 && Number.isFinite(nj) ? nj : 0,
          dernier: ok && typeof j.dernier === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.dernier) ? j.dernier : "",
          cadeau: cd && typeof cd === "object" && !Array.isArray(cd) ? { n: Math.max(0, Math.floor(Number(cd.n)) || 0), intu: Math.max(0, Math.floor(Number(cd.intu)) || 0), tr: Math.max(0, Math.floor(Number(cd.tr)) || 0), t: typeof cd.t === "string" ? cd.t.slice(0, 200) : "" } : null
        };
      }
      // ce que le Troqueur a déjà dit : un champ par défaut, des numéros de cycle, jamais plus
      {
        const t = o.meta.troc, ok = t && typeof t === "object" && !Array.isArray(t);
        const vus = {};
        if (ok && t.vus && typeof t.vus === "object" && !Array.isArray(t.vus)) {
          for (const id in t.vus) { const c = Math.floor(Number(t.vus[id])); if (c >= 1) vus[id] = c; }
        }
        const d = ok && t.dernier && typeof t.dernier === "object" ? t.dernier : null;
        o.meta.troc = {
          vus,
          dernier: d && typeof d.th === "string" ? {
            id: typeof d.id === "string" ? d.id : null,
            th: d.th,
            refus: Math.max(0, Math.floor(Number(d.refus)) || 0),
            rep: typeof d.rep === "string" ? d.rep : null,
            q: typeof d.q === "string" ? d.q : "",
            t: typeof d.t === "string" ? d.t : "",
            stage: typeof d.stage === "string" ? d.stage : "",
            choix: Array.isArray(d.choix) ? d.choix : null
          } : null,
          refus: Math.max(0, Math.floor(ok ? Number(t.refus) : 0) || 0)
        };
      }
      // les réminiscences déjà lues (avant qu’on les retienne) : celles des objets déjà faits
      if (!o.meta.ev || typeof o.meta.ev !== "object") { o.meta.ev = {}; for (const id in o.made || {}) if (o.made[id] > 0 && D.EVENTS[id]) o.meta.ev[id] = 1; }
      if (!o.meta.ruins || typeof o.meta.ruins !== "object" || Array.isArray(o.meta.ruins)) {
        o.meta.ruins = {};
      } else {
        const ruins = {};
        for (const id in o.meta.ruins) {
          const n = Math.floor(Number(o.meta.ruins[id]));
          if (Number.isFinite(n) && n > 0) {
            if (D.ITEMS[id]) ruins[id] = n;
            else { o.orphans = o.orphans || {}; (o.orphans.ruins = o.orphans.ruins || {})[id] = n; }
          }
        }
        o.meta.ruins = ruins;
      }
      // Front pionnier (maxAge et passEver) : nettoyage et reconstruction pour les parties déjà au-delà du cycle 1
      {
        let ma = Number.isFinite(Number(o.meta.maxAge)) ? Math.max(0, Math.floor(Number(o.meta.maxAge))) : 0;
        const pe = {};
        if (o.meta.passEver && typeof o.meta.passEver === "object" && !Array.isArray(o.meta.passEver)) {
          for (const z in o.meta.passEver) if (o.meta.passEver[z] && D.PASSAGES[z]) pe[z] = true;
        }
        if ((o.cycle || 1) > 1) {
          for (const id in o.meta.ev || {}) if (o.meta.ev[id] && D.ITEMS[id]) ma = Math.max(ma, D.ITEMS[id].a || 0);
          for (const id in o.meta.ruins || {}) if (D.ITEMS[id]) ma = Math.max(ma, D.ITEMS[id].a || 0);
          if (o.meta.reprise && typeof o.meta.reprise === "object") {
            for (const r of o.meta.reprise.rows || []) {
              if (r && D.ITEMS[r.id]) ma = Math.max(ma, D.ITEMS[r.id].a || 0);
              if (r && r.z && D.PASSAGES[r.z]) pe[r.z] = true;
            }
            for (const id of o.meta.reprise.objectifs || []) if (D.ITEMS[id]) ma = Math.max(ma, D.ITEMS[id].a || 0);
          }
          for (const z in (o.exp && o.exp.done) || {}) if (o.exp.done[z] > 0 && D.PASSAGES[z]) pe[z] = true;
          for (const z in o.meta.terres || {}) if (o.meta.terres[z] > 0 && D.PASSAGES[z]) pe[z] = true;
          let maxZIdx = -1;
          D.ZONES.forEach((z, idx) => { if (!z.secret && pe[z.id]) maxZIdx = Math.max(maxZIdx, idx); });
          if (maxZIdx > 0) {
            for (let i = 1; i <= maxZIdx; i++) {
              const zid = D.ZONES[i].id;
              if (!D.ZONES[i].secret && D.PASSAGES[zid]) pe[zid] = true;
            }
          }
        }
        o.meta.maxAge = ma;
        o.meta.passEver = pe;
      }
      // avant les passages : chaque terre déjà ouverte compte comme passage franchi
      if (!hadPass) {
        o.pass = {};
        for (const z in o.zones || {}) if (o.zones[z] && D.PASSAGES[z]) o.pass[z] = { paid: {}, done: true };
      }
      o.settings = Object.assign({ sound: true, vibe: true, theme: "auto", largeText: false }, o.settings);
      if (typeof o.settings.visiteurs !== "boolean") o.settings.visiteurs = true;
      if (!o.visiteur || typeof o.visiteur !== "object") o.visiteur = { next: 0, clins: {} };
      o.stats = Object.assign({ visiteurs: 0, visiteursVus: 0, visiteursClins: 0 }, o.stats);
      o.exp = Object.assign({ active: null, done: {} }, o.exp);
      o.stats = Object.assign({ taps: 0, crafts: 0, tries: 0, play: 0, cyclePlay: 0, splits: {}, caillouMined: 0 }, o.stats);
      if (!o.stats.splits || typeof o.stats.splits !== "object" || Array.isArray(o.stats.splits)) o.stats.splits = {};
      if (!Number.isFinite(Number(o.stats.cyclePlay)) || o.stats.cyclePlay < 0) o.stats.cyclePlay = o.stats.play || 0;
      for (const k of ["lastSplits", "bestSplits", "prevBestSplits"]) {
        if (!o.meta[k] || typeof o.meta[k] !== "object" || Array.isArray(o.meta[k])) o.meta[k] = {};
      }
      if (!o.meta.lastCycle || typeof o.meta.lastCycle !== "object" || Array.isArray(o.meta.lastCycle)) o.meta.lastCycle = null;
      o.gt = { id: o.gt && o.gt.id || null, p: (o.gt && o.gt.p) || 0 };
      if (!o.tried || typeof o.tried !== "object") o.tried = {};
      const ec = Number(o.ecus);
      o.ecus = Number.isFinite(ec) && ec >= 0 ? ec : 0;
      const cp = o.comptoir;
      if (!cp || typeof cp !== "object" || Array.isArray(cp)) {
        o.comptoir = { sold: {}, traces: 0, asks: [], next: 0 };
      } else {
        const sold = {};
        if (cp.sold && typeof cp.sold === "object" && !Array.isArray(cp.sold)) {
          for (const id in cp.sold) {
            const q = Number(cp.sold[id]);
            if (Number.isFinite(q) && q > 0) sold[id] = q;
          }
        }
        const tr = Math.max(0, Math.floor(Number(cp.traces)) || 0);
        let asks = [];
        if (Array.isArray(cp.asks)) {
          for (let i = 0; i < cp.asks.length; i++) {
            const a = cp.asks[i];
            if (a === null) {
              asks.push(null);
            } else if (a && typeof a === "object" && typeof a.id === "string" && D.ITEMS[a.id]) {
              const n = Math.floor(Number(a.n));
              const atr = Math.floor(Number(a.tr));
              if (n > 0 && atr > 0) asks.push({ id: a.id, n, tr: atr });
              else asks.push(null);
            } else {
              asks.push(null);
            }
          }
        }
        const nxt = Number(cp.next);
        const next = Number.isFinite(nxt) && nxt > 0 ? nxt : 0;
        o.comptoir = { sold, traces: tr, asks, next };
      }
      checkHand(o);
      checkDom(o);
      // compétences et action en cours : des nombres, et une action qui a un sens
      if (!o.skills || typeof o.skills !== "object") o.skills = {};
      for (const g in o.skills) { const v = Number(o.skills[g]); if (!(v >= 0) || !(D.GESTES[g] || g === "recolte")) delete o.skills[g]; else o.skills[g] = v; }
      const a = o.act;
      if (a && !(a.k === "harv" && ZONES[a.z] && D.ITEMS[a.res])) o.act = null;
      if (o.act && o.act.k === "harv") { o.act.p = Math.max(0, Math.min(1, Number(o.act.p) || 0)); o.act.got = Number(o.act.got) || 0; }
      // identifiants inconnus (objets retirés) : mis de côté, jamais perdus
      ITEM_MAPS.forEach((k) => {
        if (!o[k] || typeof o[k] !== "object") return;
        for (const id in o[k]) if (!D.ITEMS[id]) {
          o.orphans = o.orphans || {};
          (o.orphans[k] = o.orphans[k] || {})[id] = o[k][id];
          delete o[k][id];
        }
      });
      if (o.track && !D.ITEMS[o.track.id]) o.track = null;
      if (o.exp.active && !(ZONES[o.exp.active.z] && ZONES[o.exp.active.z].exps[o.exp.active.i])) o.exp.active = null;
      if (typeof o.age !== "number" || o.age < 0 || o.age >= D.AGES.length) o.age = 0;

      if (!o.livre || typeof o.livre !== "object" || Array.isArray(o.livre)) {
        o.livre = { p: {}, vu: {} };
      } else {
        const p = {};
        if (o.livre.p && typeof o.livre.p === "object" && !Array.isArray(o.livre.p)) {
          for (const id in o.livre.p) {
            if (!RECIT.pages || RECIT.pages[id]) {
              p[id] = 1;
            } else {
              o.orphans = o.orphans || {};
              (o.orphans.livre_p = o.orphans.livre_p || {})[id] = o.livre.p[id];
            }
          }
        }
        const vu = {};
        if (o.livre.vu && typeof o.livre.vu === "object" && !Array.isArray(o.livre.vu)) {
          for (const id in o.livre.vu) {
            const v = Math.floor(Number(o.livre.vu[id]));
            if (Number.isFinite(v) && v >= 0) {
              if (!RECIT.pages || RECIT.pages[id]) {
                vu[id] = v;
              } else {
                o.orphans = o.orphans || {};
                (o.orphans.livre_vu = o.orphans.livre_vu || {})[id] = v;
              }
            }
          }
        }
        o.livre = { p, vu };
      }

      if (!o.revus || typeof o.revus !== "object" || Array.isArray(o.revus)) {
        o.revus = {};
      } else {
        const rev = {};
        for (const k in o.revus) {
          if (typeof k === "string") rev[k] = 1;
        }
        o.revus = rev;
      }

      if (!o.questions || typeof o.questions !== "object" || Array.isArray(o.questions)) {
        o.questions = {};
      } else {
        const qlist = {};
        for (const id in o.questions) {
          if (RECIT.questions && !RECIT.questions[id]) {
            o.orphans = o.orphans || {};
            (o.orphans.questions = o.orphans.questions || {})[id] = o.questions[id];
          } else {
            const q = o.questions[id];
            let lvl = 0;
            if (q && typeof q === "object") lvl = Math.floor(Number(q.lvl)) || 0;
            else if (typeof q === "number") lvl = Math.floor(q) || 0;
            if (lvl < 0) lvl = 0;
            if (lvl > 3) lvl = 3;
            qlist[id] = { lvl };
          }
        }
        o.questions = qlist;
      }

      if (!o.repaired || typeof o.repaired !== "object" || Array.isArray(o.repaired)) {
        o.repaired = {};
      } else {
        const rep = {};
        for (const id in o.repaired) {
          const v = Math.floor(Number(o.repaired[id]));
          if (Number.isFinite(v) && v > 0) rep[id] = v;
        }
        o.repaired = rep;
      }

      if (!o.signes || typeof o.signes !== "object" || Array.isArray(o.signes)) {
        o.signes = {};
      } else {
        const slist = {};
        const rec = opts.recit || D.RECIT || {};
        for (const id in o.signes) {
          if (rec.signes && !rec.signes[id]) {
            o.orphans = o.orphans || {};
            (o.orphans.signes = o.orphans.signes || {})[id] = o.signes[id];
          } else {
            const item = o.signes[id];
            if (item && typeof item === "object" && !Array.isArray(item)) {
              const cleaned = {};
              if (item.lu) cleaned.lu = 1;
              if (item.vu && typeof item.vu === "object" && !Array.isArray(item.vu)) {
                const cleanVu = {};
                for (const place in item.vu) {
                  if (typeof place === "string" && item.vu[place]) cleanVu[place] = 1;
                }
                cleaned.vu = cleanVu;
              } else {
                cleaned.vu = {};
              }
              const essais = Math.floor(Number(item.essais));
              if (Number.isFinite(essais) && essais > 0) cleaned.essais = essais;
              const last = Number(item.last);
              if (Number.isFinite(last) && last > 0) cleaned.last = last;
              slist[id] = cleaned;
            }
          }
        }
        o.signes = slist;
      }

      if (!Array.isArray(o.notes)) {
        o.notes = [];
      } else {
        o.notes = o.notes.map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5).slice(-32);
      }

      if (!o.boosts || typeof o.boosts !== "object" || Array.isArray(o.boosts)) {
        o.boosts = {};
      } else {
        const cleanBoosts = {};
        for (const bk in o.boosts) {
          const b = o.boosts[bk];
          if (b && typeof b === "object" && Number.isFinite(b.mult) && Number.isFinite(b.until)) {
            const mult = Math.max(0.1, Math.min(10, Number(b.mult) || 1));
            cleanBoosts[bk] = { mult, until: Math.max(0, Number(b.until) || 0) };
          }
        }
        o.boosts = cleanBoosts;
      }
      Object.defineProperty(o, "_mig", { value: mig, enumerable: false });
      return o;
    }
    E.parseSave = parseSave;
    /* 0.41 : les ateliers de la partie sont remis d'aplomb, et l'ancienne boucle de l'argent (apprenti de l'établi,
     * marchand de lanières, taxes) est retirée : un apprenti embauché devient l'apprenti de l'Élevage, l'avance
     * non dépensée revient dans la bourse. Rien d'autre n'est perdu. */
    function migrerAteliers() {
      const fams = ((D.ATELIERS || {}).familles || []).map((f) => f.id), propre = {};
      const src = S.ateliers && typeof S.ateliers === "object" ? S.ateliers : {};
      fams.forEach((f) => {
        const a = src[f];
        if (!a || typeof a !== "object") return;
        const app = Math.max(0, Math.min((D.TRAVAILLEURS || {}).apprenti ? D.TRAVAILLEURS.apprenti.max : 0, Math.floor(Number(a.app) || 0)));
        const ouv = Math.max(0, Math.min((D.TRAVAILLEURS || {}).ouvrier ? D.TRAVAILLEURS.ouvrier.max : 0, Math.floor(Number(a.ouv) || 0)));
        const appH = Math.max(app, Math.min(99, Math.floor(Number(a.appH) || 0))), ouvH = Math.max(ouv, Math.min(99, Math.floor(Number(a.ouvH) || 0)));
        const seuil = Number.isFinite(Number(a.seuil)) && a.seuil !== null ? Math.max(0, Math.min(100, Math.round(Number(a.seuil) / 10) * 10)) : null;
        const fatigue = Math.max(0, Math.min(1.2, Number(a.fatigue) || 0));
        if (app || ouv || appH || ouvH || seuil !== null || fatigue > 0 || a.greve) { propre[f] = { app, ouv }; if (fatigue > 0) propre[f].fatigue = Math.round(fatigue * 1000) / 1000; if (a.greve === true && (app || ouv)) { propre[f].greve = true; propre[f].alerte = true; } else if (a.alerte === true) propre[f].alerte = true; if (appH > app) propre[f].appH = appH; if (ouvH > ouv) propre[f].ouvH = ouvH; if (seuil !== null) propre[f].seuil = seuil; }
      });
      S.ateliers = propre;
      const raw = S.atelierEconomy;
      if (raw && typeof raw === "object") {
        S.ecus = (S.ecus || 0) + Math.max(0, Number(raw.budget) || 0);
        if (raw.hired === true) { const a = S.ateliers.elevage || (S.ateliers.elevage = { app: 0, ouv: 0 }); a.app = Math.max(a.app, 1); }
      }
      delete S.atelierEconomy;
    }
    E.load = function (src) {
      const o = parseSave(src);
      S = o;
      migrerAteliers();
      if (!(S.meta.graine >= 1)) S.meta.graine = graineDuJour(); // une ancienne partie n’avait pas de graine avant la première relève
      forgetDom();
      recalc();
      const mig = o._mig || {};
      // une partie d’avant 6.3 ne reçoit pas d’un coup les messages d’événements déjà dépassés
      if (mig.pre63) for (const ev of RECIT.events || []) if (ev && ev.id && (!ev.cond || cond(ev.cond))) S.eventsSeen[ev.id] = 1;
      // une partie d’avant 0.7.1 : pas de fausse date sur ce qu’elle avait déjà
      if (mig.pre071) {
        S.meta.stamps = S.meta.stamps || {};
        for (const id in S.questions || {}) {
          if (!("q:" + id in S.meta.stamps)) S.meta.stamps["q:" + id] = 0;
          const q = RECIT.questions && RECIT.questions[id];
          if (q && q.resolu && cond(q.resolu) && !("qr:" + id in S.meta.stamps)) S.meta.stamps["qr:" + id] = 0;
        }
      }
      if (S.flags.fab4 === "todo") placeOldExtractors();
      if (S.flags.reExt) {
        for (const t in S.flags.reExt) for (let i = 0; i < S.flags.reExt[t]; i++) if (!E.domAutoExt(t)) break;
        delete S.flags.reExt;
      }
      // les gants (Désert) se fabriquaient dès la Plaine et faisaient sauter l’âge : on remet l’âge qu’on avait vraiment atteint
      if (S.made.gants && !S.flags.ageGants) {
        S.flags.ageGants = 1;
        let vrai = 0;
        for (const id in S.made) { const it = item(id); if (id !== "gants" && it && S.made[id] > 0 && !it.sec && !it.path && it.t !== "curio" && it.t !== "relic") vrai = Math.max(vrai, it.a || 0); }
        for (const z in S.zones) if (S.zones[z] && ZONES[z] && ZONES[z].req && item(ZONES[z].req)) vrai = Math.max(vrai, item(ZONES[z].req).a || 0);
        if (vrai < S.age) S.age = vrai;
      }
      if (!S.flags.ages) checkAges(true); // une partie d’avant les âges accomplis
      if (S.signes && S.signes.nourrice && S.signes.nourrice.lu) S.secrets.signature = true;
      checkGestes();
      E.emit("struct");
      return true;
    };
    E.reset = function () { S = freshState(now()); S.meta.parcours = 1; S.meta.graine = graineDuJour(); forgetDom(); recalc(); E.emit("struct"); };
    E.exportSave = () => {
      const s = E.serialize();
      return typeof btoa !== "undefined" ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, "utf8").toString("base64");
    };
    /* Accepte un fichier JSON comme un ancien code base64. */
    E.decodeSave = (txt) => {
      const t = String(txt || "").trim();
      if (t[0] === "{") return t;
      return typeof atob !== "undefined" ? decodeURIComponent(escape(atob(t))) : Buffer.from(t, "base64").toString("utf8");
    };
    E.importSave = (txt) => E.load(E.decodeSave(txt));

    if (D.CRAFT_EQUIPMENT) (root.EclatEquipements || require("./equipements.js")).attach(E);
    (root.EclatTransmission || require("./transmission.js")).attach(E);
    Territoires.attach(E);
    (root.EclatReprise || require("./reprise.js")).attach(E, createEngine);
    recalc();
    return E;
  }

  return { createEngine, freshState, migrate, SAVE_VERSION, withData };
  }

  const API = withData(BASE_DATA);
  root.EclatEngine = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
