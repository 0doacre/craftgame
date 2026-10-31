/* ÉCLAT — interface : le noyau.
 * L’état de l’interface (U), les petits outils (formats, icônes, pastilles, toasts, fêtes),
 * les fenêtres, les vues et leur rafraîchissement, la sauvegarde, la boucle, le démarrage
 * et le service worker. Le reste vit dans des modules créés plus bas (MODULES). */
(function () {
  "use strict";
  const CRAFT_PREVIEW = window.ECLAT_CRAFT_PREVIEW === true;
  const D = CRAFT_PREVIEW ? window.EclatEquipements.createData(window.ECLAT_DATA,{fullGame:true}) : window.ECLAT_DATA;
  const ENGINE = CRAFT_PREVIEW ? window.EclatEngine.withData(D) : window.EclatEngine;
  const E = ENGINE.createEngine();
  const A = window.EclatAudio;
  const Sky = window.EclatSky;
  /* Clé historique conservée : c’est là que vivent les parties en cours. */
  const TEST_CONFIG = window.EclatModeTest.config(window.ECLAT_CRAFT_PREVIEW === true, location.href);
  const SAVE_KEY = TEST_CONFIG.key;
  const BACKUP_KEY = TEST_CONFIG.backups;
  const MAX_BACKUPS = 5;
  const S = () => E.state;
  const I = D.ITEMS;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

  /* ------------------------------------------------------------ état UI */
  const U = {
    tab: "domaine", geste: "tailler", slots: [null, null, null], last: null,
    invFilter: "tout", carnetFilter: "tout", journalTab: "fragments", cosmosTab: "ciel",
    q: "", showOwned: false,
    openAges: {}, dirty: true, lastRender: 0, mq: [], mcur: null,
    badges: { carnet: false, journal: false, cosmos: false, carte: false },
    pointer: { x: 0, y: 0 }, holding: null, saveLocked: false, badSave: null, updReg: null, wantReload: false,
    toastQ: [], toastAt: 0, toastT: 0, intuShown: false
  };
  /* les fenêtres que le jeu ouvre tout seul (voir js/fenetres.js) : une à la fois, par ordre de priorité */
  const Fen = window.EclatFenetres, FP = Fen.PRIO;
  U.fen = Fen.create({ libre: () => !U.mcur && !U.mq.length, now: () => Date.now() });

  /* ------------------------------------------------------------ formats */
  const UNITS = ["k", "M", "G", "T", "P", "E", "Z"];
  function fmt(n) {
    if (!(n > 0)) return "0";
    if (n < 10 && Math.abs(n - Math.round(n)) > 1e-6) return (Math.floor(n * 10) / 10).toFixed(1).replace(".", ",");
    if (n < 1000) return String(Math.floor(n + 1e-9));
    if (n >= 1e24) return n.toExponential(1).replace(".", ",").replace("e+", "e"); // au-delà des unités
    let u = -1, v = n;
    while (v >= 1000 && u < UNITS.length - 1) { v /= 1000; u++; }
    const s = v < 10 ? (Math.floor(v * 100) / 100).toFixed(2) : v < 100 ? (Math.floor(v * 10) / 10).toFixed(1) : Math.floor(v).toFixed(0);
    return s.replace(".", ",") + " " + UNITS[u];
  }
  function fmtNum(r) {
    const a = Math.abs(r);
    if (a < 0.095) return a.toFixed(2).replace(".", ",");
    if (a < 10) return a.toFixed(1).replace(".", ",");
    return fmt(a);
  }
  /* un débit (par seconde dans le moteur) se lit toujours par minute ; par heure s’il est infime */
  function perMin(r) { const a = Math.abs(r); return a * 60 >= 0.1 ? fmtNum(a * 60) + "/min" : fmtNum(a * 3600) + "/h"; }
  function fmtRate(r) { return r > 0 ? "+" + perMin(r) : ""; }
  function fmtTime(s) {
    s = Math.max(0, s);
    // sous dix secondes, au dixième (une pièce faite à la main, par exemple)
    if (s < 9.95 && Math.abs(s - Math.round(s)) > 0.05) return String(Math.round(s * 10) / 10).replace(".", ",") + " s";
    s = Math.round(s);
    if (s < 60) return s + " s";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    if (h) return h + " h " + String(m).padStart(2, "0");
    return m + " min" + (r ? " " + String(r).padStart(2, "0") : "");
  }
  const fmtHeat = (h) => h.toLocaleString("fr-FR") + " °C";
  /* Ce qui bloque une recette, en nommant toujours l’objet qui manque :
   * « il faut : Four en argile (1 100 °C) », jamais « il manque la station ». */
  function needText(id, b, html) {
    b = b || E.blocker(id);
    if (!b) return "";
    if (b.why === "equipment") return "il faut : "+(I[b.required] ? I[b.required].n : "un outil adapté");
    if (b.why === "owned") return "déjà possédé";
    const st = E.blockStation(id, b), g = D.GESTES[I[id].r[0]];
    const det = b.why === "heat" ? fmtHeat(b.heat) : b.why === "geste" ? "pour " + g.v : "plus solide, pour " + g.v;
    if (!st) return "action inconnue : " + g.n;
    return "il faut : " + (html ? itemPill(st) : I[st].n) + " (" + det + ")";
  }
  const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const fmtMul = (v) => "×" + String(Math.round(v * 100) / 100).replace(".", ",");
  function fmtDate(t) {
    const d = new Date(t);
    return d.toLocaleDateString("fr-FR") + " " + String(d.getHours()).padStart(2, "0") + "h" + String(d.getMinutes()).padStart(2, "0");
  }
  /* l’horodatage d’une entrée du Journal (0.7.1) : « Cycle 3 · Âge du Fer · 22 oct. 21:40 ».
   * court : « Cycle 3 · 22 oct. » pour les petites cases. Rien si l’entrée date d’avant l’horodatage. */
  function stampTxt(k, short) {
    const s = E.stampOf && E.stampOf(k);
    if (!s) return "";
    const d = new Date(s[0]);
    const o = { day: "numeric", month: "short" };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
    const day = d.toLocaleDateString("fr-FR", o);
    if (short) return "Cycle " + s[1] + " · " + day;
    const age = D.AGES[s[2]] ? " · " + D.AGES[s[2]].n : "";
    return "Cycle " + s[1] + age + " · " + day + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  const stampHTML = (k, short) => { const t = stampTxt(k, short); return t ? '<div class="stamp">' + esc(t) + "</div>" : ""; };

  function ink(hex) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#1a1208" : "#ffffff";
  }
  /* les icônes : un sprite (assets/icons.svg, game-icons.net) glissé dans la page au démarrage */
  const GI = window.ECLAT_ICONS || { items: {} };
  const gi = (name, cls) => '<svg class="gi' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="#gi-' + name + '"/></svg>';
  /* les pictogrammes des textes deviennent des icônes du sprite : dans le texte
   * seulement, jamais dans un attribut ni dans le terminal */
  const GLYPH = GI.glyphs || {};
  const glyphAlt = Object.keys(GLYPH).sort((a, b) => b.length - a.length).map((k) => k.replace(/\uFE0F/g, "")).join("|");
  const GLYPH_RE = new RegExp("(" + glyphAlt + ")\uFE0F?", "g"), GLYPH_T = new RegExp("(" + glyphAlt + ")");
  const glyphOf = (k) => GLYPH[k] || GLYPH[k + "\uFE0F"];
  /* ce qui se touche doit aussi se focaliser et se nommer : un lien vers une fiche devient un bouton au clavier, un champ sans libellé prend son texte d’aide */
  function a11y(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll("[data-goto]:not(button):not([tabindex])").forEach((e) => { e.setAttribute("role", "button"); e.setAttribute("tabindex", "0"); });
    root.querySelectorAll("input[placeholder]:not([aria-label])").forEach((e) => { if (!(e.labels && e.labels.length)) e.setAttribute("aria-label", e.getAttribute("placeholder")); });
  }
  function iconize(root) {
    a11y(root);
    if (!root || !glyphAlt) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (GLYPH_T.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    const list = [];
    while (w.nextNode()) list.push(w.currentNode);
    list.forEach((n) => {
      const p = n.parentNode;
      if (!p || (p.closest && p.closest("svg, textarea, .term, option"))) return;
      const frag = document.createDocumentFragment(), s = n.nodeValue;
      let last = 0;
      s.replace(GLYPH_RE, (m, k, i) => {
        if (i > last) frag.appendChild(document.createTextNode(s.slice(last, i)));
        const t = document.createElement("template");
        t.innerHTML = gi(glyphOf(k), "gl");
        frag.appendChild(t.content);
        last = i + m.length;
        return m;
      });
      if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
      p.replaceChild(frag, n);
    });
  }
  const gIc = (g) => (GI.gestes && GI.gestes[g] ? gi(GI.gestes[g]) : esc(D.GESTES[g].ic));
  function loadSprite() {
    fetch("assets/icons.svg").then((r) => (r.ok ? r.text() : "")).then((t) => {
      if (!t) return;
      const d = document.createElement("div");
      d.hidden = true;
      d.innerHTML = t;
      document.body.prepend(d);
    }).catch(() => { /* hors ligne sans cache : les icônes restent vides */ });
  }
  function icon(id, cls) {
    const it = I[id];
    if (!it) return "";
    const isVivant = (window.EclatStyleMode === "vivant" || (typeof document !== "undefined" && document.documentElement && document.documentElement.getAttribute("data-style-mode") === "vivant"));
    if (isVivant && window.ECLAT_ILLUSTRATIONS && window.ECLAT_ILLUSTRATIONS.hasItem(id)) {
      const src = window.ECLAT_ILLUSTRATIONS.getItem(id);
      return '<span class="ic carnet-ic ' + (cls || "") + '" data-item="' + esc(id) + '"><img class="carnet-img" src="' + src + '" alt="" loading="lazy" decoding="async" /></span>';
    }
    if (GI.items[id]) return '<span class="ic gic ' + (cls || "") + '">' + gi(GI.items[id]) + "</span>";
    if (it.sym) return '<span class="ic sym ' + (cls || "") + '" style="--c:' + it.col + ";--ink:" + ink(it.col) + '">' + esc(it.sym) + "</span>";
    return '<span class="ic ' + (cls || "") + '">' + it.ic + "</span>";
  }
  /* Pastille unifiée pour les objets cliquables dans les textes, objectifs et fiches */
  function itemPill(id, opt) {
    opt = opt || {};
    const it = I[id];
    if (!it) return esc(id);
    // même règle que la fiche : l’icône dès que l’objet est connu, vu, ou sans recette (ressource brute) ;
    // le nom reste toujours écrit, comme avant les pastilles
    const st = S();
    const known = opt.unk !== undefined ? !opt.unk : !!(st.known[id] || st.seen[id] || !it.r);
    const name = esc(it.n);
    const ic = known ? icon(id, "sm") : '<span class="ic sm unk">?</span>';
    const qty = opt.qty ? '<span class="pill-qty">' + fmt(opt.qty) + '</span> ' : '';
    const lackCls = opt.lack ? " lack" : "";
    const unkCls = !known ? " unk" : "";
    const extraCls = opt.cls ? " " + opt.cls : "";
    const title = name + " (toucher pour voir la fiche)";
    return '<span class="item-pill' + lackCls + unkCls + extraCls + '" data-goto="' + id + '" role="button" tabindex="0" title="' + title + '" aria-label="' + esc(it.n) + '">' +
      ic + qty + '<span class="pill-name">' + name + '</span></span>';
  }
  const TYPE = { res: "Ressource", comp: "Pièce", tool: "Outil", stat: "Station", ext: "Extracteur", upg: "Amélioration", mach: "Machine", auto: "Machine", curio: "Curiosité", relic: "Relique" };
  /* la sorte d’objet, en couleur ; un extracteur dit aussi sa terre, une machine son palier */
  function badgeHTML(id) {
    const it = I[id];
    let t = TYPE[it.t];
    if (it.t === "ext" && it.lg) { const L = E.ligneOf(id); t = (L ? L.n : t) + " · niveau " + it.lv; }
    else if (it.t === "mach" && it.ing) t += " · palier " + it.ing;
    return '<span class="badge t-' + it.t + '">' + esc(t) + "</span>";
  }
  /* ce que fait l’objet (couche « jeu »), puis son récit en italique */
  const itD = (it) => (E.interpolate ? E.interpolate(it.d) : it.d);
  const descHTML = (it) => (it.u ? '<div class="small">' + esc(it.u) + "</div>" : "") + (it.d ? '<div class="small muted"><i>' + esc(itD(it)) + "</i></div>" : "");
  /* ce que fait chaque sorte d’objet, en une phrase, sur sa fiche */
  const TYPE_HINT = {
    res: "Une ressource : elle se récolte sur un gisement.",
    comp: "Une pièce : elle sert à fabriquer d’autres objets.",
    tool: "Un outil : renforce tes récoltes à la main ou ouvre de nouveaux chemins.",
    stat: "Une station : elle reste à l’Atelier et ouvre une action ou une chaleur.",
    ext: "Récolte automatique (active hors ligne). À poser sur un gisement de la terre indiquée.",
    upg: "Une amélioration : son effet est permanent dès son obtention.",
    mach: "Une machine : elle reste à l’Atelier et accélère les commandes des recettes qu’elle sait faire.",
    curio: "Une curiosité : vestige insolite consigné dans ton Journal.",
    relic: "Une relique : mémoire préservée du monde ancien, découverte lors de tes explorations."
  };
  const zoneName = (z) => (E.ZONES[z] ? E.ZONES[z].n : z);
  /* « de » + nom de terre, contracté : du Désert de Verre, des Profondeurs, de la Lisière */
  const deZone = (z) => {
    const n = zoneName(z);
    return /^Le /.test(n) ? "du " + n.slice(3) : /^Les /.test(n) ? "des " + n.slice(4) : /^La /.test(n) ? "de la " + n.slice(3) : /^L’/.test(n) ? "de l’" + n.slice(2) : "de " + n;
  };
  const targetName = (k) => (k === "*" ? "toutes les terres" : E.ZONES[k] ? E.ZONES[k].n : I[k] ? I[k].n : k);
  const isRawGather = (id) => I[id] && I[id].t === "res" && E.RES_ZONE[id];
  /* ce qui limite : une ressource qui manque, d’où elle vient, ce qui la produit, et de quoi y aller (rien pour une pièce fabriquée : la commande la prend en charge) */
  function limitHTML(res, q) {
    const L = E.limiting(res, q);
    if (!L.raw || !(q > 0)) return "";
    const nm = I[res].n.toLowerCase();
    let t;
    if (!L.open) t = "vient " + deZone(L.z) + ", pas encore atteinte.";
    else if (L.rate > 0) t = "tes extracteurs en donnent " + perMin(L.rate) + " : environ " + fmtTime(L.eta) + " pour les " + fmt(Math.ceil(q)) + " qui manquent.";
    else t = "aucun extracteur n’en produit" + (L.hand ? " ; tes mains en récoltent." : ".");
    return '<div class="tiny limit"><b>' + cap1(nm) + "</b> : " + t + (L.open ? ' <button class="mini" data-gz="' + L.z + '">Aller au gisement</button>' : "") + "</div>";
  }

  function fxList(id) {
    const it = I[id], e = it.e || {}, out = [];
    if (e.zone) out.push("Ouvre le chemin vers " + zoneName(e.zone));
    if (e.st) e.st.forEach((s) => {
      const g = D.GESTES[s.g].n;
      if (s.heat) out.push(s.g === "chauffer" ? "Chauffer jusqu’à " + fmtHeat(s.heat) : g);
      else if ((s.lvl || 1) > 1) out.push(g + " les ressources plus dures");
      else out.push("Ouvre le geste " + g);
    });
    if (e.tap) for (const k in e.tap) out.push("Récolte à la main " + (k === "*" ? "partout" : E.ZONES[k] ? deZone(k).replace(/^de la /, "à la ").replace(/^du /, "au ").replace(/^des /, "aux ").replace(/^de l’/, "à l’") : ": " + targetName(k)) + " " + fmtMul(e.tap[k]));
    if (e.auto) for (const k in e.auto) out.push("Extracteurs " + (k === "*" ? "de toutes les terres" : deZone(k)) + " " + fmtMul(e.auto[k]));
    if (it.p) {
      const c = E.cache(), m = (c.auto[it.z] || 1) * (c.auto["*"] || 1) * c.echo;
      if (it.t === "ext") out.push("Se pose sur un gisement " + (it.zs && it.zs.length > 1 ? it.zs.map(deZone).join(" ou ") : deZone(it.z)) + " : " + Object.keys(it.p).map((r) => fmtRate(E.extRate(id, r) * m) + " " + I[r].n).join(" ou "));
      else out.push("Chacun : " + Object.keys(it.p).map((r) => fmtRate(it.p[r] * m) + " " + I[r].n).join(", "));
    }
    if (it.t === "mach") {
      out.push("Machine : " + fmtNum(it.spd * E.cache().aspd) + " fabrications/min");
      if (it.ing === 1) out.push("Recettes à 1 ingrédient");
      else if (it.ing) out.push("Recettes à " + it.ing + " ingrédients au plus");
    }
    if (e.intu) out.push("+" + e.intu + " ✨/min");
    if (e.exp) out.push("Explorations " + fmtMul(e.exp));
    if (e.sky) out.push("Ouvre le Cosmos");
    if (e.arche) out.push("Capte les ondes radio");
    if (e.term) out.push("Ouvre le terminal");
    if (e.signal) out.push("Écoute les signaux du ciel");
    if (e.aspd) out.push("Machines " + fmtMul(e.aspd));
    if (e.pip) out.push("Récolte seul " + perMin(e.pip));
    if (e.flute) out.push("Donne la flûte");
    if (e.decode) out.push("Décode le signal de Kher");
    return out;
  }
  const fxText = (id) => fxList(id).join(" · ");

  /* Liste d’ingrédients ; chaque ingrédient renvoie vers sa recette (ou sa zone). */
  function ingHTML(ing, opts) {
    opts = opts || {};
    return Object.keys(ing).map((i) => {
      const q = ing[i];
      const lack = (S().inv[i] || 0) + 1e-9 < q;
      return '<span class="ing' + (lack && opts.check ? " lack" : "") + (opts.link ? " link" : "") + '"' +
        (opts.check ? ' data-need="' + i + '" data-q="' + q + '"' : "") + (opts.link ? ' data-goto="' + i + '" title="Ouvrir sa fiche"' : "") + ">" +
        icon(i, "sm") + '<span class="q">' + fmt(q) + "</span> " + esc(I[i].n) + "</span>";
    }).join("");
  }
  function gesteChip(id) {
    const r = I[id].r, g = D.GESTES[r[0]], o = r[3] || {};
    let extra = "";
    if (o.heat) extra = " · " + fmtHeat(o.heat);
    if (o.lvl && o.lvl > 1) extra = " · niv. " + o.lvl;
    return '<span class="g">' + gIc(r[0]) + " " + g.n + extra + "</span>";
  }
  function mainIngredient(id) {
    const ing = I[id].r[1];
    return Object.keys(ing).sort((a, b) => ing[b] - ing[a])[0];
  }

  /* ------------------------------------------------------------ effets visuels */
  function floater(txt, x, y, color) {
    const f = document.createElement("div");
    f.className = "float";
    f.textContent = txt;
    f.style.left = x + "px"; f.style.top = (y - 30) + "px";
    if (color) f.style.color = color;
    $("#fx").appendChild(f);
    setTimeout(() => f.remove(), 900);
  }
  /* ceux qui demandent moins de mouvement n’ont pas d’étincelles : la couleur et le message suffisent */
  const motionOK = () => !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  function sparks(x, y, n, color) {
    if (!motionOK()) return;
    const fx = $("#fx");
    for (let i = 0; i < (n || 14); i++) {
      const s = document.createElement("div");
      s.className = "spark";
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 70;
      s.style.left = x + "px"; s.style.top = y + "px";
      s.style.setProperty("--dx", Math.cos(a) * d + "px");
      s.style.setProperty("--dy", Math.sin(a) * d - 20 + "px");
      if (color) { s.style.background = color; s.style.boxShadow = "0 0 8px " + color; }
      fx.appendChild(s);
      setTimeout(() => s.remove(), 750);
    }
  }
  /* Une fête : grande icône au centre, son nom, des étincelles. Elle ne bloque rien (on peut
   * continuer à toucher dessous). o : { id | ic, kick, title, sub } ; o.add : une ligne de plus
   * sur la fête en cours (une étape réussie au même moment qu’une découverte). */
  function fete(o) {
    if (!U.live || document.hidden) return; // pas au chargement, ni pendant le rattrapage d’une absence
    const cur = $(".cele");
    if (o.add && cur && performance.now() - (U.celeAt || 0) < 1200) {
      const l = document.createElement("div"); l.className = "ca"; l.textContent = o.add; $(".cb", cur).appendChild(l);
      return;
    }
    if (o.add) o = { ic: "🏁", kick: "Étape accomplie", title: o.title || "", sub: o.sub };
    // une recette trouvée : sa saveur, et le sens du geste la première fois qu'on l'emploie
    if (o.id && (o.kick === "Nouvelle découverte" || o.kick === "Recette trouvée") && E.saveurDecouverte) { const sv = E.saveurDecouverte(o.id); o.saveur = sv.recette; o.geste = sv.geste; }
    if (cur) cur.remove();
    clearTimeout(U.celeT);
    U.celeAt = performance.now();
    // le palier dit la rareté : 1 une trouvaille, 2 une rareté, 3 un moment qui se raconte
    const tier = Math.max(1, Math.min(3, o.tier || 1)), P = Jus.palier(tier), col = o.color || D.AGES[S().age].c;
    const el = document.createElement("div");
    el.className = "cele t" + tier;
    el.style.setProperty("--ms", P.ms + "ms");
    el.style.setProperty("--cc", col);
    el.innerHTML = (tier >= 3 ? '<div class="crays" aria-hidden="true"></div>' : "") +
      '<div class="cb">' + (o.id ? icon(o.id, "xl") : '<span class="ic xl">' + o.ic + "</span>") + '<div class="ck">' + esc(o.kick) + '</div><div class="cn">' + esc(o.title) + "</div>" +
      (o.saveur ? '<div class="cf">' + esc(o.saveur) + "</div>" : "") +
      (o.sub ? '<div class="cs">' + esc(o.sub) + "</div>" : "") +
      (o.geste ? '<div class="cg"><b>Nouveau geste · ' + esc(o.geste.n) + "</b> " + esc(o.geste.texte) + "</div>" : "") + "</div>";
    // le temps de lire : un peu plus long quand il y a du texte
    const lu = (o.saveur ? o.saveur.length : 0) + (o.geste ? o.geste.texte.length + 14 : 0), plus = lu ? Math.min(6000, 1200 + 28 * lu) : 0;
    el.style.setProperty("--ms", P.ms + plus + "ms");
    document.body.appendChild(el);
    sparks(innerWidth / 2, innerHeight * 0.4, P.sparks, col);
    if (tier === 1) vibe(P.vibre);
    else Jus.impact(tier, innerWidth / 2, innerHeight * 0.4, col);
    for (let k = 0; k < P.fireworks; k++) setTimeout(() => sparks(innerWidth * (0.2 + Math.random() * 0.6), innerHeight * (0.2 + Math.random() * 0.35), 30, ["#ffd36b", "#ff7ad9", "#5aa0ff", "#7fe08a"][k % 4]), 500 + k * 380);
    U.celeT = setTimeout(() => el.remove(), P.ms + plus);
  }
  function fireworks() {
    if (!motionOK()) return;
    const cols = ["#4fd1c5", "#7fe08a", "#5aa0ff", "#ffd36b", "#ff7ad9"];
    for (let k = 0; k < 6; k++) setTimeout(() => {
      sparks(innerWidth * (0.2 + Math.random() * 0.6), innerHeight * (0.15 + Math.random() * 0.35), 26, cols[k % cols.length]);
    }, k * 260);
  }
  /* Un message. Deux au plus à l’écran ; un même sujet (o.key, par défaut le texte) remplace le
   * précédent au lieu de s’empiler, sauf s’il est moins important (o.p). Sur la carte, ils
   * s’affichent sous l’objectif, pour ne jamais le cacher. */
  function toast(html, o) {
    o = o || {};
    // un message toutes les 800 ms : deux arrivent en rafale, le reste attend son tour
    const t0 = performance.now();
    if (t0 - (U.toastAt || 0) < 800) {
      const k = o.key || html, i = (U.toastQ || []).findIndex((x) => (x[1].key || x[0]) === k);
      if (i >= 0) U.toastQ[i] = [html, o];
      else if ((U.toastQ || []).length < 2) U.toastQ.push([html, o]);
      if (!U.toastT) U.toastT = setTimeout(() => { U.toastT = 0; const m = (U.toastQ || []).shift(); if (m) toast(m[0], m[1]); }, 800 - (t0 - (U.toastAt || 0)));
      return;
    }
    U.toastAt = t0;
    const box = $("#toasts"), key = o.key || html, p = o.p || 0;
    let kind = o.kind || o.type;
    if (!kind) {
      if (key === "nope" || /manque|plein|impossible|refusé|bloqué|ne se récolte pas|pas assez/i.test(html)) {
        kind = "warn";
      } else if (/curio|secret|découvert|⭐|✦|✨|fête/i.test(key) || /curiosité|secret|découvert|trouvaille|étoile/i.test(html)) {
        kind = "gold";
      } else if (/done|prêt|accompli|terminée|réussi|enregistré|sauvegardé/i.test(html) || /handdone|passdone|ageDone/i.test(key)) {
        kind = "good";
      } else {
        kind = "info";
      }
    }

    // Extraction ou attribution d’icône badge
    let ic = "";
    let bodyHtml = html;
    const mEmoji = html.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\u2300-\u23FF]|[\u2B50-\u2B55]|✓|⚠️|ℹ️|⚡|★|✦|✨)\s*/);
    if (mEmoji) {
      ic = mEmoji[1];
      bodyHtml = html.slice(mEmoji[0].length);
    } else {
      ic = kind === "good" ? "✓" : kind === "warn" ? "⚠️" : kind === "gold" ? "✨" : "ℹ️";
    }

    let t = Array.from(box.children).find((x) => x.dataset.k === key);
    if (t) {
      if (p < Number(t.dataset.p)) return;
      clearTimeout(t._tm);
      t.classList.remove("toast-out");
      t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
    } else {
      t = document.createElement("div");
      t.dataset.k = key;
      box.appendChild(t);
      while (box.children.length > 3) {
        const old = box.firstElementChild;
        if (old) old.remove();
      }
    }

    const dismiss = () => {
      if (t._dismissed) return;
      t._dismissed = true;
      clearTimeout(t._tm);
      t.classList.add("toast-out");
      setTimeout(() => { if (t.isConnected) t.remove(); }, 220);
    };

    t.className = "toast toast-" + kind;
    t.dataset.p = p;
    t.innerHTML = '<span class="toast-ic">' + ic + '</span><span class="toast-txt">' + bodyHtml + '</span><button class="toast-x" aria-label="Fermer" tabindex="-1">✕</button>';
    iconize(t);

    t.onclick = (e) => {
      e.stopPropagation();
      dismiss();
    };

    const plainLen = html.replace(/<[^>]+>/g, "").length;
    const duration = kind === "gold" ? Math.min(7000, Math.max(4500, 3000 + plainLen * 40)) : Math.min(4800, Math.max(2500, 2200 + plainLen * 30));
    t._tm = setTimeout(dismiss, duration);
  }
  let userInteracted = false;
  ["pointerdown", "touchstart", "mousedown", "keydown", "click"].forEach((evt) => {
    window.addEventListener(evt, () => { userInteracted = true; }, { capture: true, passive: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (window.EclatAssistance?.logSession) {
      if (document.visibilityState === "hidden") window.EclatAssistance.logSession("départ");
      else if (document.visibilityState === "visible") window.EclatAssistance.logSession("retour");
    }
  });
  window.addEventListener("pagehide", () => {
    if (window.EclatAssistance?.logSession) window.EclatAssistance.logSession("départ");
  });
  function vibe(ms) {
    if (!userInteracted && !(typeof navigator !== "undefined" && navigator.userActivation?.hasBeenActive)) return;
    if (S().settings.vibe && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* ignoré */ }
  }
  /* le jus : l’appui qui se voit, le choc des moments rares (js/juice.js) */
  const Jus = window.EclatJuice.create({ A, U, S, vibe, motionOK });
  function elCenter(el) {
    if (!el || !el.isConnected) return { x: U.pointer.x || innerWidth / 2, y: U.pointer.y || innerHeight / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* ------------------------------------------------------------ modales */
  function openModal(o) {
    // le focus clavier revient sur ce qui a ouvert la fenêtre, quand la dernière se ferme
    if (!U.mcur && !U.mq.length) U.mOpener = document.activeElement;
    U.mq.push(o);
    if (!U.mcur) nextModal();
  }
  function nextModal() {
    const m = $("#modal"), box = $(".modal-box", m);
    const o = U.mq.shift();
    if (!o) { U.mcur = null; m.classList.add("hidden"); $("#app").inert = false; return; }
    U.mcur = o;
    U.mAt = Date.now();
    m.className = "modal " + (o.cls || "");
    box.innerHTML = (o.persistent ? "" : '<button class="modal-x" data-m="close" aria-label="Fermer">✕</button>') + o.html;
    const ttl = $("h2", box);
    if (ttl) { ttl.id = "modalTitle"; box.setAttribute("aria-labelledby", "modalTitle"); box.removeAttribute("aria-label"); }
    else { box.removeAttribute("aria-labelledby"); box.setAttribute("aria-label", "Fenêtre"); }
    if (window.EclatAssistance?.logSession) {
      const modalName = ttl ? ttl.textContent.trim() : (o.title || "Fenêtre");
      window.EclatAssistance.logSession("fenêtre", { titre: modalName });
    }
    iconize(box);
    box.scrollTop = 0;
    box.tabIndex = -1;
    box.focus({ preventScroll: true });
    $("#app").inert = true;
    if (o.onOpen) o.onOpen(box);
    Tuto.tick(); // une bulle de tutoriel ne reste pas affichée sous une fenêtre qui s’ouvre
  }
  function closeModal() {
    const o = U.mcur;
    U.fen.ferme();
    $("#modal").classList.add("hidden");
    U.mcur = null;
    if (o && o.onClose) o.onClose();
    // une fenêtre ouverte entre-temps (une liste ouverte depuis une fiche) reste ouverte
    setTimeout(() => {
      if (!U.mcur) nextModal();
      if (!U.mcur) {
        const b = U.mOpener;
        U.mOpener = null;
        if (b && b.isConnected && b !== document.body && typeof b.focus === "function") b.focus({ preventScroll: true });
      }
    }, 60);
  }
  document.addEventListener("scroll", (e) => { if (e.target.classList && e.target.classList.contains("gestes")) U.gScroll = e.target.scrollLeft; }, true);
  /* une fenêtre qui vient de s’ouvrir sous le doigt ne se referme pas sur le même appui */
  const fresh = () => Date.now() - (U.mAt || 0) < 140;
  function setupModal() {
    const m = $("#modal"), box = $(".modal-box", m);
    box.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-hopen]") && U.mcur && !fresh()) { closeModal(); openHands(); return; }
      const custom = ev.target.closest("[data-cr-custom]");
      if (custom && U.mcur && !fresh()) { closeModal(); promptCraftQty(custom.dataset.crCustom); return; }
      const craft = ev.target.closest("[data-tree]");
      if (craft && U.mcur && !fresh()) { openTree(craft.dataset.tree, Number(craft.dataset.n) || 1); return; }
      // un passage à verser, une ressource à voir, depuis une fiche
      const pb = ev.target.closest("[data-pour]");
      if (pb && U.mcur && !fresh()) { pour(pb.dataset.pour, pb); if (U.mcur && U.mcur.refresh) box.innerHTML = U.mcur.refresh(); return; }
      const qtb = ev.target.closest("[data-mqtab]");
      if (qtb && U.mcur && !fresh()) { U.questTab = qtb.dataset.mqtab; A.click(); if (U.mcur.refresh) box.innerHTML = U.mcur.refresh(); return; }
      // « Aller au gisement » (une ressource qui manque) : la terre, dans le Domaine
      const zb = ev.target.closest("[data-gz]");
      if (zb && U.mcur && !fresh()) { const z = zb.dataset.gz; A.click(); U.zone = z; closeModal(); setTab("domaine"); setTimeout(() => Dom.focusZone(z), 80); return; }
      const gb = !ev.target.closest("[data-m]") && ev.target.closest("[data-goto]");
      if (gb && U.mcur) {
        A.click();
        vibe(8);
        const from = U.mcur.reopen || null;
        U.rfrom = from;
        goto(gb.dataset.goto);
        return;
      }
      const sb = !ev.target.closest("[data-m]") && ev.target.closest("[data-s]");
      if (sb && U.mcur && !fresh()) { A.click(); openSigneModal(sb.dataset.s); return; }
      const b = ev.target.closest("[data-m]");
      if (!b || !U.mcur || fresh()) return;
      const k = b.dataset.m;
      const h = U.mcur.on && U.mcur.on[k];
      if (h && h(b, ev) === true) return;
      closeModal();
    });
    m.addEventListener("click", (ev) => { if (ev.target === m && U.mcur && !U.mcur.persistent && !fresh()) closeModal(); });
  }
  function simpleModal(kicker, title, body, btn) {
    openModal({ html: (kicker ? '<div class="kicker">' + kicker + "</div>" : "") + "<h2>" + title + "</h2>" + body +
      '<div class="acts"><button class="btn pri" data-m="close">' + (btn || "Continuer") + "</button></div>" });
  }
  const Scenes = window.EclatScenes;
  const Sentier = window.EclatSentier.create({ E, A });
  const Passerelle = window.EclatPasserelle.create({ E, A });
  /* le Domaine : ce qui produit ; la Carte : où l’on est */
  const Dom = window.EclatDomaine.create({
    E, A, D, U, esc, fmt, fmtNum, fmtTime, perMin, needText, limitHTML, deZone, sparks, icon, itemPill, toast, openModal, closeModal, norm, vibe, floater, passHTML: (z, options) => passHTML(z, options), uiSigne, recitInline,
    openStillnessScene: () => openStillnessScene(),
    render: (f) => render(f), quiet: () => Tuto.active(),
    top: () => donsRepere() + reveilRepere() + goalCard() + '<div id="trackBox">' + trackerHTML() + "</div>",
    topSig: () => goalSig() + "|" + (S().track ? S().track.id : "") + "|" + E.donsOffre().length + "|" + (reveilRepere() ? "r" : "")
  });
  const Carte = window.EclatCarte.create({
    E, A, D, U, Dom, esc, fmt, fmtTime, toast, openModal, passHTML: (z, options) => passHTML(z, options), expWhy: (z) => expWhy(z), explore: (z, xid) => explore(z, xid), goto: (id) => goto(id), fouiller: (z, i, l) => fouiller(z, i, l), recolter: () => recolterFouille(), A,
    goDomaine: (z) => { U.zone = z; setTab("domaine"); Dom.focusZone(z); }
  });
  /* le tutoriel : des souvenirs qui guident la main, chapitre par chapitre */
  const Tuto = window.EclatTuto.create({ E, D, A, U, esc, fmtNum, Dom, save: () => save(), toast: (t) => toast(t) });
  /* un texte sur une ligne : valeurs calculées et signes, sans paragraphes */
  function recitInline(t, lieu) {
    if (!t) return "";
    const st = S();
    const cycle = (st && st.cycle) || 1;
    const semeur = cycle + 6;
    const age = (st && st.age) || 0;
    let s = esc(String(E.interpolate ? E.interpolate(String(t)) : t));
    s = s.replace(/\{cycle\}/g, cycle)
         .replace(/\{semeur\}/g, semeur)
         .replace(/\{age\}/g, age)
         .replace(/\[([a-zA-Z0-9_\u00C0-\u017F-]+)\]/g, (m, id) => {
           if (typeof renderSigneToken === "function") {
             return renderSigneToken(id, { recit: E.RECIT, state: st, seeSigne: (i, l) => E.seeSigne && E.seeSigne(i, l), esc, lieu });
           }
           return '<span class="signe" data-s="' + esc(id) + '">◇</span>';
         });
    return s;
  }
  /* une ligne de signes entièrement comprise se lit aussi en français, dessous */
  function lectureHTML(line) {
    const fr = typeof lectureLigne === "function" ? lectureLigne(line, { recit: E.RECIT, state: S() }) : "";
    return fr ? '<br><span class="lecture">« ' + esc(fr) + " »</span>" : "";
  }
  function recitHTML(t, lieu) {
    if (!t) return "";
    return String(t).split(/\n\n+/).map((p) => "<p>" + p.split("\n").map((l) => recitInline(l, lieu) + lectureHTML(l)).join("<br>") + "</p>").join("");
  }
  const loreHTML = (t, lieu) => '<div class="lore">' + recitHTML(t, lieu) + '</div>';
  /* les signes posés sur l’interface et dans les scènes (données : D.RECIT.interface) */
  function uiSigne(k, lieu) {
    const x = E.RECIT && E.RECIT.interface && E.RECIT.interface[k];
    if (!x || !x.t || (x.cond && !E.cond(x.cond))) return "";
    return recitInline(x.t, lieu).replace(/\n/g, "<br>");
  }
  /* l’ornement qui clôt une scène racontée ; fin : seulement pour les fins qu’il signe */
  function ornementHTML(lieu, delay, fin) {
    if ((typeof E.isLibere === "function" && E.isLibere()) || (S().meta && S().meta.endings && S().meta.endings.retour)) return "";
    const x = E.RECIT && E.RECIT.interface && E.RECIT.interface.ornement;
    if (!x || (fin && !(x.fins || []).includes(fin))) return "";
    const h = uiSigne("ornement", lieu);
    return h ? '<p class="scene-ornement" style="opacity:0;animation:fadeup 1.2s ' + delay + 's forwards">' + h + "</p>" : "";
  }

  /* ============================================================ SAUVEGARDES
   * Règles : on ne réécrit jamais une sauvegarde qu’on n’a pas su lire ; avant
   * toute migration, import ou restauration, une copie brute est mise de côté.
   * (Les fenêtres des sauvegardes sont dans js/compte.js.) */
  const verOf = (raw) => { try { return JSON.parse(raw).v || 1; } catch (e) { return 0; } };
  function backups() {
    try { const l = JSON.parse(localStorage.getItem(BACKUP_KEY) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; }
  }
  /* met une copie de côté ; renvoie vrai seulement si elle est bien relue dans la liste enregistrée */
  function pushBackup(raw, why) {
    if (!raw) return false;
    const list = backups();
    if (list[0] && list[0].data === raw) return true;
    list.unshift({ t: Date.now(), why, v: verOf(raw), data: raw });
    while (list.length > MAX_BACKUPS) list.pop();
    for (;;) {
      try {
        localStorage.setItem(BACKUP_KEY, JSON.stringify(list));
        return !!(backups()[0] && backups()[0].data === raw);
      } catch (e) {
        if (list.length <= 1) return false;
        list.pop();
      }
    }
  }
  /* une copie de secours de moins : de la place pour la partie quand le stockage est plein.
   * La plus récente reste toujours : c’est celle qui protège la partie qu’on vient peut-être de remplacer. */
  function libererBackups() {
    const l = backups();
    if (l.length <= 1) return false;
    l.pop();
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(l)); } catch (e) { return false; }
    return true;
  }
  /* L’écriture de la partie passe par js/stockage.js : un seul onglet enregistre (verrou), une page périmée
   * n’écrase rien, et un échec d’écriture laisse la partie en mémoire en le disant (barre #saveBar). */
  const Stk = window.EclatStockage.create({
    storage: { getItem: (k) => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v) },
    key: SAVE_KEY, lockName: TEST_CONFIG.lock, liberer: libererBackups, notify: (evt, info) => surStockage(evt, info)
  });
  U.peutEcrire = () => Stk.peutEcrire();
  /* l’affichage resserré (Domaine et Carnet) : un seul réglage, dans le menu. Les anciennes parties avaient deux réglages. */
  /* la barre du bas (0.51.1) : « visible » par défaut, ou « masquée » (une poignée, la barre vient au survol ou au toucher) */
  U.barreAuto = () => (S().settings || {}).barreBas === "masquee";
  U.compact = () => { const s = S().settings || {}; return s.compact !== undefined ? !!s.compact : !!(s.domDense || s.carnetDense); };
  U.setCompact = (on) => { const s = S().settings; s.compact = !!on; delete s.domDense; delete s.carnetDense; };
  function save() {
    if (U.saveLocked || !Stk.peutEcrire()) return false;
    return Stk.ecrire(E.serialize()).ok;
  }
  function loadSave() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { Stk.lire(null); return "none"; }
    Stk.lire(raw);
    if (!raw && CRAFT_PREVIEW && !TEST_CONFIG.active) {
      try {
        const original=localStorage.getItem("eclat.save.v1");
        if(original){E.load(original);return "ok";}
      } catch(e) { toast("La partie habituelle n’a pas pu être copiée. L’essai commence avec une nouvelle partie."); }
    }
    if (!raw) return "none";
    const v = verOf(raw);
    if (v > 0 && v < ENGINE.SAVE_VERSION) pushBackup(raw, "Avant la mise à jour " + D.VERSION);
    try {
      E.load(raw);
      return v < ENGINE.SAVE_VERSION ? "migrated" : "ok";
    } catch (e) {
      U.saveLocked = true;
      U.badSave = { raw, err: e.message };
      return "error";
    }
  }
  /* ------------------------------------------------------------ sauvegarde : pages concurrentes et échecs d’écriture */
  /* une fenêtre qui passe devant toutes les autres : on ne peut pas jouer sur une partie qui n’enregistre pas */
  function modalUrgente(o) { U.mq.unshift(o); U.mcur = null; nextModal(); }
  function barreSauvegarde() {
    const b = $("#saveBar");
    if (!b) return;
    const e = Stk.echec();
    b.classList.toggle("hidden", !e);
    if (e) b.innerHTML = '<span class="grow">⚠️ Ta partie n’est pas enregistrée sur cet appareil (stockage plein ou bloqué). Elle reste en mémoire tant que cette page est ouverte.</span>' +
      '<button class="btn small pri" data-u="export">💾 Télécharger</button><button class="btn small" data-u="retry">Réessayer</button>';
  }
  function modalAutrePage() {
    modalUrgente({
      persistent: true,
      html: '<div class="kicker">Sauvegarde</div><h2>Partie ouverte ailleurs</h2>' +
        "<p>Éclat est déjà ouvert dans un autre onglet ou une autre fenêtre. Une seule page à la fois peut enregistrer la partie ; sinon l’une effacerait les progrès de l’autre.</p>" +
        '<p class="small muted">Ferme l’autre page : celle-ci reprendra toute seule.</p>' +
        '<div class="acts" style="flex-direction:column"><button class="btn pri" data-m="reload">Recharger</button><button class="btn ghost" data-m="dl">⬇️ Télécharger la partie</button></div>',
      on: { reload: () => { location.reload(); return true; }, dl: () => { downloadSave(); return true; } }
    });
  }
  function modalPerimee() {
    modalUrgente({
      persistent: true,
      html: '<div class="kicker">Sauvegarde</div><h2>Cette page n’est plus à jour</h2>' +
        "<p>Ta partie a avancé dans un autre onglet ou une autre fenêtre. Cette page n’enregistre plus, pour ne pas effacer ces progrès.</p>" +
        '<div class="acts" style="flex-direction:column"><button class="btn pri" data-m="reload">Recharger la partie enregistrée</button>' +
        '<button class="btn" data-m="dl">⬇️ Télécharger celle de cette page</button>' +
        '<button class="btn ghost" data-m="keep">Garder celle de cette page…</button></div>',
      on: { reload: () => { location.reload(); return true; }, dl: () => { downloadSave(); return true; }, keep: () => { modalRemplacer(); return true; } }
    });
  }
  function modalRemplacer() {
    modalUrgente({
      persistent: true,
      html: '<div class="kicker">Sauvegarde</div><h2>Remplacer la partie enregistrée ?</h2>' +
        "<p>La partie de cette page prendra la place de celle de l’autre onglet, qui sera perdue pour le jeu. Elle est d’abord mise de côté dans les copies de secours (Menu → Sauvegardes).</p>" +
        '<div class="acts"><button class="btn" data-m="back">Annuler</button><button class="btn pri" data-m="go">Remplacer</button></div>',
      on: {
        back: () => { modalPerimee(); return true; },
        go: () => {
          let stocke = null;
          try { stocke = localStorage.getItem(SAVE_KEY); } catch (e) { /* illisible */ }
          // la partie de l’autre onglet n’est remplacée que si sa copie de secours est bien enregistrée
          if (stocke && !pushBackup(stocke, "Partie d’un autre onglet, remplacée par celle d’une page périmée")) {
            toast("La copie de secours de l’autre partie n’a pas pu être enregistrée : elle n’est pas remplacée. Télécharge celle de cette page, ou libère de la place et réessaie.", { key: "remplace", p: 2 });
            modalPerimee();
            return true;
          }
          if (!Stk.reprendreCettePage()) { modalAutrePage(); return true; }
          if (!save()) { toast("⚠️ La partie de cette page n’a pas pu être enregistrée. L’autre partie est intacte, mise de côté dans les copies de secours.", { key: "remplace", p: 2 }); modalPerimee(); return true; }
          toast("Partie de cette page enregistrée.");
        }
      }
    });
  }
  function surStockage(evt) {
    if (evt === "attente") modalAutrePage();
    else if (evt === "repris") location.reload(); // la partie a changé pendant l’attente : on repart de ce qui est enregistré
    else if (evt === "perime") modalPerimee();
    else if (evt === "echec") { barreSauvegarde(); toast("⚠️ Ta partie n’est pas enregistrée : stockage plein ou bloqué.", { key: "saveFail", p: 2 }); }
    else if (evt === "retabli") { barreSauvegarde(); toast("💾 Partie de nouveau enregistrée."); }
  }
  /* Le navigateur peut effacer le stockage d’un site : on lui demande de s’en abstenir, puis on lit sa réponse.
   * Une réponse autre que « accordée » n’est qu’un état à dire au joueur : l’export reste la vraie copie. */
  async function demanderPersistance() {
    let mem = null;
    try { mem = JSON.parse(safeStore.getItem("eclat.persist") || "null"); } catch (e) { mem = null; }
    // refusé récemment : on ne redemande pas tout de suite (certains navigateurs affichent une demande au joueur)
    if (mem && mem.etat === "refusee" && Date.now() - (mem.t || 0) < 7 * 86400000) { U.persist = "refusee"; return U.persist; }
    const etat = await window.EclatStockage.proteger(navigator);
    U.persist = etat;
    safeStore.setItem("eclat.persist", JSON.stringify({ etat, t: Date.now() }));
    if (etat !== "accordee" && !S().flags.tip_persist) {
      S().flags.tip_persist = 1;
      toast("Ton navigateur ne garantit pas la conservation de ta partie. Télécharge une copie de temps en temps (Menu → Sauvegardes).", { key: "persist", p: 2 });
    }
    return etat;
  }

  /* ------------------------------------------------------------ compte en ligne
   * le client (js/cloud.js) ; ses fenêtres sont dans js/compte.js */
  const safeStore = {
    getItem: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    setItem: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage bloqué */ } },
    removeItem: (k) => { try { localStorage.removeItem(k); } catch (e) { /* stockage bloqué */ } }
  };
  /* Les comptes en ligne ne sont coupés qu'en mode test (copie locale). Le mode « établi par postes » (CRAFT_PREVIEW) est devenu le jeu normal : il ne doit plus couper les comptes ni les ranger à part. */
  const CLOUD_PREFIX = TEST_CONFIG.active ? (CRAFT_PREVIEW ? "test.preview." : "test.") : "";
  const Cloud = window.EclatCloud.create({ storage: CLOUD_PREFIX ? {getItem:k=>safeStore.getItem(CLOUD_PREFIX+k),setItem:(k,v)=>safeStore.setItem(CLOUD_PREFIX+k,v),removeItem:k=>safeStore.removeItem(CLOUD_PREFIX+k)} : safeStore, server: () => TEST_CONFIG.active ? "" : safeStore.getItem("eclat.cloud") || (window.ECLAT_CONFIG || {}).cloud || "" });
  U.sync = { busy: false, conflict: null, err: null };
  /* remplace le contenu de la fenêtre ouverte (ou en ouvre une) */
  function swapModal(o) {
    if (!U.mcur) { openModal(o); return; }
    const box = $("#modal .modal-box");
    U.mcur = o;
    $("#modal").className = "modal " + (o.cls || "");
    box.innerHTML = (o.persistent ? "" : '<button class="modal-x" data-m="close" aria-label="Fermer">✕</button>') + o.html;
    const ttl = $("h2", box);
    if (ttl) { ttl.id = "modalTitle"; box.setAttribute("aria-labelledby", "modalTitle"); box.removeAttribute("aria-label"); }
    else { box.removeAttribute("aria-labelledby"); box.setAttribute("aria-label", "Fenêtre"); }
    if (window.EclatAssistance?.logSession) {
      const modalName = ttl ? ttl.textContent.trim() : (o.title || "Fenêtre");
      window.EclatAssistance.logSession("fenêtre", { titre: modalName });
    }
    iconize(box);
    box.scrollTop = 0;
    if (o.onOpen) o.onOpen(box);
  }

  /* ------------------------------------------------------------ thème */
  /* le carnet change d’habit avec l’époque (css/theme.css) ; la page tourne quand elle change */
  const EPOCH = ["pigments", "pigments", "pigments", "papyrus", "papyrus", "enluminure", "registre", "registre", "registre", "quadrille", "quadrille", "quadrille", "quadrille", "bord", "bord"];
  const ROMAN = (n) => [["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]].reduce((o, [r, v]) => { while (n >= v) { o += r; n -= v; } return o; }, "");
  function applyAge() {
    const a = S().age, ag = D.AGES[a], ep = EPOCH[a] || "pigments", body = document.body;
    body.dataset.carnetEra = a >= 13 ? "releves" : a >= 6 ? "registre" : "encre";
    document.documentElement.style.setProperty("--age", ag.c);
    const ok = ep + (a === D.AGES.length - 1 ? ":stellaire" : "");
    if (body.dataset.orn !== ok) {
      const first = !body.dataset.ep;
      body.dataset.ep = ep;
      body.dataset.orn = ok;
      const o = GI.ornaments || {}, name = o[a === 12 ? "stellaire" : ep];
      $("#orn").innerHTML = name ? gi(name, "o1") + (ep === "pigments" ? gi(name, "o2") : "") + (ep === "bord" ? "<i></i>" : "") : "";
      if (!first) { const v = $("#views"); v.classList.remove("turn"); void v.offsetWidth; v.classList.add("turn"); }
    }
    $("#ageName").textContent = ag.n.replace(/^Âge (du |de la |de l’|des |de )?/, "").replace(/^./, (c) => c.toUpperCase());
    $("#ageBtn").setAttribute("aria-label", ag.n + " : étapes de l’âge");
    const old = ep === "papyrus" || ep === "enluminure";
    $("#ageNum").textContent = "Âge " + (old ? ROMAN(a + 1) + " sur " + ROMAN(D.AGES.length) : (a + 1) + "/" + D.AGES.length) + (S().cycle > 1 ? " · Semeur " + (S().cycle + 6) + (E.nomDuCycle && E.nomDuCycle() ? " · " + E.nomDuCycle() : "") : "");
    const ms = (E.milestones && E.milestones()[a]) || [];
    const done = ms.filter((x) => x.done).length;
    const total = ms.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const barEl = $("#ageBar");
    if (barEl) barEl.style.width = pct + "%";
    const badgeEl = $("#ageProgBadge");
    if (badgeEl) {
      // « 0/5 » ne dit rien tant qu’aucune étape n’est faite
      badgeEl.textContent = done === total && total > 0 ? "✓" : done + "/" + total;
      badgeEl.className = "age-badge" + (done === total && total > 0 ? " done" : "") + (done || a > 0 ? "" : " hidden");
    }
  }

  /* ============================================================ VUES */
  /* les onglets arrivent quand ils ont quelque chose à montrer : l’Arbre et le Carnet à la première
   * recette, le Journal au premier lieu exploré, le Cosmos avec le ciel */
  /* cinq onglets : Terres (le Domaine), Labo, Atelier, Arbre, Journal ; la Carte (l’Atlas) se range sous les Terres,
   * le Carnet et les Machines dans l’Atelier, le Cosmos dans le Journal */
  const PARENT = { carte: "domaine", carnet: "atelier", machines: "atelier", cosmos: "arbre" };
  function tabAvailable(t) {
    const st = S();
    if (t === "cosmos") return E.cache().sky;
    if (t === "journal" && E.cache().sky) return true;
    if (t === "atelier") return st.stats.crafts > 0 || Object.keys(st.known).length >= 3;
    if (t === "carnet" || t === "arbre") return Object.keys(st.known).length > 0;
    if (t === "machines") return E.MACHINES.some((m) => (st.inv[m] || 0) > 0) || st.hand.q.length > 0;
    if (t === "journal") return Object.keys(st.frags).length > 0 || Object.keys(st.exp.done).length > 0 || Object.keys(st.secrets).length > 0 || (E.hasLivre && E.hasLivre()) || (E.hasQuestions && E.hasQuestions()) || (E.hasSignes && E.hasSignes());
    return true;
  }
  function setTab(t) {
    if (!tabAvailable(t)) t = "domaine";
    if (U.tab === "cosmos" && t !== "cosmos") Sky.unmount();
    const was = U.tab;
    if (t === 'arbre' && was !== 'arbre' && !U.arbreVoirId) { U.arbreSel = null; U.arbreHistorique = []; }
    const views = $("#views");
    U.viewScroll = U.viewScroll || {};
    if (was !== t) U.viewScroll[was] = views.scrollTop;
    if (was !== t && window.EclatAssistance?.logSession) {
      window.EclatAssistance.logSession("onglet", { tab: t });
    }
    U.tab = t;
    $$(".view").forEach((v) => { v.classList.toggle("on", v.id === "v-" + t); delete v.dataset.sig; });
    // le Labo et l’Atelier partagent des identifiants (#atelier-equipe, #hands) : la vue qu’on quitte est vidée
    ["v-labo", "v-atelier"].forEach((id) => { if (id !== "v-" + t) { const v = document.getElementById(id); if (v) v.innerHTML = ""; } });
    document.body.dataset.tab = t;
    $$("#tabs button").forEach((b) => { const on = b.dataset.tab === (PARENT[t] || t); b.classList.toggle("on", on); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    if (U.badges[t]) { U.badges[t] = false; updateBadges(); }
    if (t === "journal" || t === "carnet") A.page();
    render(true);
    views.scrollTop = was === t ? 0 : U.viewScroll[t] || 0;
    // la carte s’ouvre sur la terre où l’on est
    if (t === "carte" && was !== "carte" && U.viewScroll[t] === undefined) {
      const v = $("#views"), svg = $("#v-carte svg");
      if (svg) { const offset = svg.getBoundingClientRect().top - v.getBoundingClientRect().top; v.scrollTop = Math.max(0, offset + svg.getBoundingClientRect().height * Carte.focusY(U.zone) - v.clientHeight * 0.55); }
    }
  }
  function updateBadges() {
    S().flags.badges = Object.assign({}, U.badges); // les pastilles survivent à la fermeture
    $$("#tabs button").forEach((b) => {
      const k = b.dataset.tab, on = U.badges[k] || Object.keys(PARENT).some((c) => PARENT[c] === k && U.badges[c]);
      let d = $(".dot", b);
      if (on && !d) { d = document.createElement("i"); d.className = "dot"; b.appendChild(d); }
      if (!on && d) d.remove();
    });
    for (const k of ["atelier", "arbre", "journal"]) {
      const jb = $('#tabs [data-tab="' + k + '"]'), on = tabAvailable(k);
      if (on && jb.classList.contains("hidden") && U.tabsSeen) jb.classList.add("born"); // il vient d’apparaître
      jb.classList.toggle("hidden", !on);
    }
    U.tabsSeen = true;
    // un don de la relève attend d’être pris : une pastille sur le bouton Menu
    const mb = $("#menuBtn"), dd = $(".dot", mb), dpend = E.donsOffre().length > 0;
    if (dpend && !dd) { const d = document.createElement("i"); d.className = "dot dot-don"; mb.appendChild(d); }
    if (!dpend && dd) dd.remove();
    // l’Intuition se montre quand elle commence à servir
    $("#intuBtn").classList.toggle("hidden", Object.keys(S().known).length < 3 && !Object.keys(S().studied).length);
  }
  /* les onglets d’un même groupe (2 ou 3 pages) */
  const SUBT = { atelier: "Fabriquer et découvrir", machines: "Tes machines et ce qu’elles fabriquent", journal: "Ce que tu as trouvé et compris", cosmos: "Le ciel, les signes et les Grands Œuvres" };
  function subTabs(...args) {
    let list;
    if (args.length === 6) list = [[args[0], args[3]], [args[1], args[4]], [args[2], args[5]]];
    else list = [[args[0], args[2]], [args[1], args[3]]];
    const avail = list.filter(([t]) => tabAvailable(t));
    if (avail.length <= 1) return "";
    return '<div class="subtabs">' + avail.map(([t, lbl]) =>
      '<button data-tab2="' + t + '" title="' + (SUBT[t] || "") + '" class="' + (U.tab === t ? "on" : "") + '">' + lbl + (U.badges[t] ? ' <i class="dot"></i>' : "") + "</button>"
    ).join("") + "</div>";
  }
  /* la Progression : le Chemin (l’arbre), puis ce que le joueur a accompli */
  function progSwitchHTML() {
    if (!U.progTab) U.progTab = "chemin";
    const items = [["chemin", "Chemin", "Ce qui est fait, ce qui reste"], ["secrets", "Secrets", "Ce que tu as trouvé, sans rien révéler de plus"], ["gestes", "Gestes" + (E.hasNewGeste && E.hasNewGeste() ? " •" : ""), "Tes gestes remarqués et leurs niveaux"]];
    if (E.curiosCount && E.curiosCount() > 0) items.push(["curios", "Clins d’œil", "Les petits secrets trouvés en chemin"]);
    items.push(["fins", "Fins", "Les dénouements atteints et les Échos"], ["stats", "Mémoire", "Tes totaux, ton nom, tes réminiscences"]);
    /* Le Cosmos (le ciel, les figures, ARCHE, les Grands Œuvres) est la dernière page de la Progression ; il apparaît avec le premier instrument d'observation. */
    if (tabAvailable("cosmos")) items.push(["cosmos", "Cosmos" + (U.badges.cosmos ? " •" : ""), SUBT.cosmos]);
    const ici = U.tab === "cosmos" ? "cosmos" : U.progTab;
    return '<div class="filters prog-sw" role="group" aria-label="Progression">' + items.map(([k, n, t]) => '<button type="button" ' + (k === "cosmos" ? 'data-tab2="cosmos"' : 'data-pt="' + k + '"') + ' title="' + t + '" class="' + (ici === k ? "on" : "") + '">' + n + "</button>").join("") + "</div>";
  }
  function badge(t) { if (U.tab !== t) { U.badges[t] = true; updateBadges(); if (PARENT[t] === U.tab) render(true); } }

  /* un doigt reste appuyé sur une ressource (sa fiche va s’ouvrir) : on ne redessine pas dessous */
  const pressing = () => !!(U.lp && !U.lp.up);
  function render(force) {
    if (U.appliquerBarre) U.appliquerBarre();
    const now = performance.now();
    if (!force && now - U.lastRender < 120) { U.dirty = true; return; }
    if ((U.holding || pressing()) && !force) { U.dirty = true; return; }
    U.dirty = false; U.lastRender = now;
    applyAge();
    updateBadges();
    const el = $("#v-" + U.tab);
    const sc = $("#views").scrollTop;
    if (U.anchor && performance.now() - (U.anchorAt || 0) > 800) U.anchor = null; // un ancrage oublié ne sert plus
    const anc = U.anchor && findAnchor(el, U.anchor), ay = anc ? anc.getBoundingClientRect().top : 0;
    // garder le focus d’un champ de saisie pendant le rendu
    const ae = document.activeElement;
    const focus = ae && ae.id && el.contains(ae) ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd } : null;
    // un bouton sans identifiant (un lieu de la Carte, un lien de fiche) : on le retrouve à son nom après le redessin, pour que le clavier ne perde pas sa place
    // un bouton de liste (une ressource, une action, une quantité…) : même chose, retrouvé à son attribut de données
    let fsel = null;
    if (!focus && ae && ae !== document.body && el.contains(ae) && ae.dataset) {
      const k = ["inv", "g", "slot", "qty", "if", "cf", "jt", "pin", "tree", "track", "cr", "tab2", "filtres"].find((x) => ae.dataset[x] !== undefined);
      if (k) fsel = "[data-" + (k === "tab2" ? "tab2" : k) + '="' + String(ae.dataset[k]).replace(/"/g, "") + '"]' + (k === "cr" && ae.dataset.n ? '[data-n="' + ae.dataset.n + '"]' : "");
    }
    const fnom = !focus && ae && ae !== document.body && el.contains(ae) && ae.getAttribute("role") === "button" && ae.getAttribute("aria-label") ? ae.getAttribute("aria-label") : null;
    if (U.tab === "atelier") el.innerHTML = viewAtelier();
    else if (U.tab === "labo") el.innerHTML = viewLabo();
    else if (U.tab === "carnet") el.innerHTML = '<div class="atl-page">' + viewCarnet() + "</div>";
    else if (U.tab === "arbre") { // la Progression : le chemin (l’arbre se redessine lui-même, js/arbre.js) ou une page de ce que le joueur a accompli
      if (!U.progTab || U.progTab === "chemin") Atl.arbreRendre(el);
      else { delete el.dataset.sig; el.innerHTML = progSwitchHTML() + '<div class="prog-corps">' + viewJournal("progression") + "</div>"; }
    }
    else if (U.tab === "machines") { const g = Dom.machSig ? Dom.machSig() : ""; if (force || el.dataset.sig !== g) { el.innerHTML = '<div class="atl-page">' + viewMachines() + "</div>"; el.dataset.sig = g; } }
    else if (U.tab === "domaine") { const g = Dom.sig(); if (force || el.dataset.sig !== g) { el.innerHTML = Dom.view(); el.dataset.sig = g; } }
    else if (U.tab === "carte") { const g = Carte.sig(); if (el.dataset.sig !== g) { el.innerHTML = '<div class="carte-retour"><button type="button" class="btn small" data-tab2="domaine">← Terres</button></div>' + Carte.view(); el.dataset.sig = g; } }
    else if (U.tab === "journal") el.innerHTML = viewJournal();
    else if (U.tab === "cosmos") {
      if (U.cosmosTab === "figures") { const g = figuresSig(); if (el.dataset.sig !== g) { el.innerHTML = progSwitchHTML() + viewCosmos(); el.dataset.sig = g; mountCosmos(); } } // sans rien de vivant : on ne redessine que si quelque chose change
      else { delete el.dataset.sig; el.innerHTML = progSwitchHTML() + viewCosmos(); mountCosmos(); }
    }
    iconize(el);
    if (U.tab === "labo") { // la rangée des actions garde sa place d’un rendu à l’autre, et l’action choisie reste visible
      const gs = $(".gestes", el);
      if (gs) { gs.scrollLeft = U.gScroll || 0; const on = $(".geste.on", gs); if (on && (on.offsetLeft < gs.scrollLeft || on.offsetLeft + on.offsetWidth > gs.scrollLeft + gs.clientWidth)) gs.scrollLeft = Math.max(0, on.offsetLeft - 12); }
    }
    $$(".filters, .age-nav", el).forEach((bar) => {
      bar.classList.toggle("more", bar.scrollWidth > bar.clientWidth + 4);
      const on = $(".on, .cur", bar);
      if (on && (on.offsetLeft < bar.scrollLeft || on.offsetLeft + on.offsetWidth > bar.scrollLeft + bar.clientWidth)) {
        bar.scrollLeft = Math.max(0, on.offsetLeft - Math.round((bar.clientWidth - on.offsetWidth) / 2));
      }
    });
    $("#views").scrollTop = sc;
    // ce qu’on vient de toucher ne doit pas sauter : si un bloc s’est inséré au-dessus, on suit
    if (anc) { const a2 = findAnchor(el, U.anchor); if (a2) $("#views").scrollTop += a2.getBoundingClientRect().top - ay; }
    U.anchor = null;
    if (U.tab === "labo") { S().flags.bench = { g: U.geste, s: U.slots.slice() }; updMini(); }
    if (fsel) { const f = el.querySelector(fsel); if (f && f !== document.activeElement) f.focus({ preventScroll: true }); }
    if (fnom) { const f = Array.from(el.querySelectorAll('[role="button"]')).find((x) => x.getAttribute("aria-label") === fnom); if (f) f.focus({ preventScroll: true }); }
    if (focus) { const f = document.getElementById(focus.id); if (f) { f.focus(); try { f.setSelectionRange(focus.s, focus.e); } catch (e) { /* champ sans sélection */ } } }
    refresh();
    ambient();
    soundScene();
    checkForcedReleve();
  }
  /* l’ancrage : un sélecteur, ou { sel, idx } quand plusieurs éléments le partagent */
  function findAnchor(root, a) { return typeof a === "string" ? root.querySelector(a) : root.querySelectorAll(a.sel)[a.idx] || null; }
  const ANCHORS = ["data-g", "data-slot", "data-clear", "data-cr", "data-chain", "data-if", "data-track", "data-untrack", "data-tree", "data-clear-search"];
  function anchorFor(t) {
    const root = $("#v-" + U.tab);
    // depuis le petit établi (fixe à l’écran), c’est la liste visible qui doit rester en place
    if (t.closest("#mbench")) {
      const top = $("#views").getBoundingClientRect().top + 60;
      const tile = Array.from(root.querySelectorAll(".inv[data-inv]")).find((x) => x.getBoundingClientRect().top >= top);
      return tile ? '[data-inv="' + tile.dataset.inv + '"]' : null;
    }
    if (t.closest("#forge")) return "#forge";
    for (const a of ANCHORS) {
      const b = t.closest("[" + a + "]");
      if (!b) continue;
      const sel = "[" + a + '="' + b.getAttribute(a) + '"]';
      return { sel, idx: Array.from(root.querySelectorAll(sel)).indexOf(b) };
    }
    return null;
  }
  /* le petit établi : quand le grand est sorti de l’écran, ses cases et son bouton restent sous la main */
  function updMini() {
    const m = $("#mbench"), b = $("#bench");
    if (!m || !b) return;
    const atlasSheet = document.getElementById("atlasStylesheet");
    if (atlasSheet && !atlasSheet.disabled) m.style.top = Math.ceil($("#top").getBoundingClientRect().bottom + 6) + "px";
    const out = b.getBoundingClientRect().bottom < $("#views").getBoundingClientRect().top + 24;
    m.classList.toggle("hidden", !(out && U.tab === "labo" && U.slots.some(Boolean)));
  }
  /* la musique suit l’âge, l’ambiance suit l’endroit */
  function soundScene() {
    const z = U.zone || "lisiere";
    A.setScene({ age: S().age, tab: U.tab, zone: z, night: !Scenes.isNightless(z) && Scenes.daypart(new Date().getHours()) === "night", machines: workingMachines() });
    if (U.Ambiance) U.Ambiance.update();
  }
  /* l’atelier au travail : un bruit continu tant qu’une commande avance, choisi par le geste en cours (et l’âge), jamais un bruit par pièce */
  let workAt = 0;
  function workSound() {
    const now = performance.now();
    if (now - workAt < 500) return;
    workAt = now;
    let g = null;
    if (S().hand.q.length) {
      const j = E.handInfo().jobs.find((x) => !x.wait);
      if (j && I[j.step] && I[j.step].r) g = I[j.step].r[0];
    }
    A.work(g);
  }
  function workingMachines() {
    const ms = E.machines();
    return E.MACHINES.reduce((n, m) => n + ms[m].used, 0);
  }
  const VOL0 = { music: 0.5, amb: 0.6, sfx: 0.8 };
  const volumes = () => Object.assign({}, VOL0, S().settings.vol);

  /* ------------------------------------------------------------ rafraîchissement */
  /* une étape de l’âge franchie : on la fête (sur la fête de la découverte, si c’en est une) */
  function stepWatch() {
    const lists = E.milestones(), done = {};
    lists.forEach((l) => l && l.forEach((x) => { if (x.done) done[x.i] = x; }));
    const prev = U.doneObj;
    U.doneObj = done;
    if (!prev || !S().introSeen) return;
    const fresh = Object.keys(done).filter((i) => !prev[i]).map(Number);
    if (!fresh.length || fresh.length > 3) return; // plusieurs d’un coup : un chargement, pas un exploit
    const x = done[Math.max.apply(null, fresh)], list = lists.find((l) => l && l.some((y) => y.i === x.i)) || [];
    const name = x.ob.k === "craft" ? I[x.ob.id].n : x.ob.n, k = list.filter((y) => y.done).length, a = lists.indexOf(list);
    const where = a === S().age ? "cet âge" : D.AGES[a].n.replace("Âge", "l’âge");
    if (k === list.length) fete({ add: "🏆 " + D.AGES[a].n + " accompli · +" + D.AGE_DONE + " ✨", title: name, sub: "Toutes les étapes de " + where + " · +" + D.AGE_DONE + " ✨ Intuition" });
    else fete({ add: "🏁 Étape accomplie · " + k + " sur " + list.length, title: name, sub: k + " sur " + list.length + " pour " + where });
  }
  function refresh() {
    Sentier.live();
    Passerelle.live();
    const st = S();
    iconize($("#top"));
    iconize(document.querySelector(".tu-bub"));
    stepWatch();
    const intuNow = Math.floor(st.intu);
    if (intuNow > 0 && !U.intuShown) { const ib = $("#intuBtn"); if (ib) { ib.classList.remove("born"); void ib.offsetWidth; ib.classList.add("born"); } }
    U.intuShown = U.intuShown || intuNow > 0;
    $("#intu").textContent = intuNow;
    const ibEl = $("#intuBtn");
    if (ibEl) {
      ibEl.setAttribute("aria-label", "Intuition : " + fmt(intuNow));
      ibEl.setAttribute("title", "Intuition : " + fmt(intuNow) + " (toucher pour voir le détail)");
    }
    memChip();
    questChip();
    const xp = E.expProgress();
    const mini = $("#expMini");
    if (xp) {
      mini.classList.remove("hidden");
      mini.textContent = "🧭 " + fmtTime(xp.left);
      $$("[data-xp]").forEach((b) => (b.style.width = (xp.p * 100).toFixed(1) + "%"));
      $$("[data-xw]").forEach((b) => (b.style.left = (8 + 80 * xp.p).toFixed(1) + "%"));
      $$("[data-xl]").forEach((b) => (b.textContent = fmtTime(xp.left)));
    } else mini.classList.add("hidden");
    Tuto.tick();
    const hi = E.handInfo();
    Help.refresh();
    actBar();
    const hb = U.tab === "atelier" && $("#hands");
    if (hb) {
      const sig = handSig();
      if (hb.dataset.sig !== sig) { hb.innerHTML = handsHTML(); hb.dataset.sig = sig; }
      else hi.jobs.forEach((j, i) => {
        const l = hb.querySelector('[data-hl="' + i + '"]');
        if (l) l.textContent = fmtTime(i ? j.at : j.left);
        if (!i) { const b = hb.querySelector("[data-hp]"); if (b) b.style.width = (100 * (1 - j.left / j.tot)).toFixed(1) + "%"; }
      });
    }
    const view = $("#v-" + U.tab);
    $$("[data-c]", view).forEach((el) => {
      const id = el.dataset.c, it = I[id];
      if (!it || E.isUnique(it)) return;
      el.textContent = fmt(st.inv[id] || 0);
    });
    $$(".inv[data-inv]", view).forEach((el) => el.classList.toggle("zero", !(st.inv[el.dataset.inv] >= 1)));
    const rf = E.flows();
    $$("[data-flow]", view).forEach((el) => {
      const id = el.dataset.flow;
      const net = E.rate(id) + (rf.prod[id] || 0) - (rf.cons[id] || 0);
      if (Math.abs(net) < 1e-4) {
        if (!el.classList.contains("hidden")) el.classList.add("hidden");
      } else if (net > 1e-4) {
        el.textContent = "+" + perMin(net);
        el.className = "c-flow pos";
      } else {
        el.textContent = "-" + perMin(-net);
        el.className = "c-flow neg";
      }
    });
    $$("[data-need]", view).forEach((el) => el.classList.toggle("lack", (st.inv[el.dataset.need] || 0) + 1e-9 < Number(el.dataset.q)));
    $$("[data-cr]", view).forEach((b) => {
      // ×N et Max lancent une commande (qui démarre même s’il manque des ressources)
      const id = b.dataset.cr, n = b.dataset.n;
      if (n === "max") {
        const max = E.maxPlan(id);
        b.classList.toggle("nope", max < 1);
        b.textContent = (b.dataset.lbl ? b.dataset.lbl + " " : "") + "Max" + (max > 1 ? " (" + fmt(max) + ")" : "");
      } else {
        const ok = E.orderStatus(id, Number(n) || 1).ok;
        b.classList.toggle("nope", !ok);
        b.title = ok ? "Fabriquer avec les mains et les machines disponibles, pièces intermédiaires comprises" : whyNot(id, Number(n) || 1, true);
      }
    });
    $$("[data-chain]", view).forEach((b) => {
      const id = b.dataset.chain;
      b.classList.toggle("nope", !E.orderStatus(id, 1).ok);
    });
    $$("[data-gleft]", view).forEach((el) => { el.textContent = fmt(Math.max(0, Number(el.dataset.q) - (st.inv[el.dataset.gleft] || 0))); });
    $$("[data-exp]", view).forEach((b) => b.classList.toggle("nope", !!expWhy(b.dataset.exp)));
    if (U.tab === "domaine") { Dom.live($("#v-domaine")); soundScene(); }
    if (U.tab === "machines") { Dom.live($("#v-machines")); soundScene(); }
    if (U.tab === "carte") Carte.live($("#v-carte"));
    if ((U.tab === "labo" || U.tab === "atelier") && Atl.equipmentLive) Atl.equipmentLive();
    if (U.tab === "labo") {
      const f = $("#forge");
      if (f) f.disabled = !U.slots.some(Boolean);
    }
    if (U.tab === 'carnet') Atl.carnetLive();
  }

  /* ------------------------------------------------------------ ambiance */
  function ambient() {
    const app = $("#app");
    const ff = $$(".firefly");
    if (S().flags.lucioles && !ff.length) {
      for (let i = 0; i < 16; i++) {
        const f = document.createElement("div");
        f.className = "firefly";
        f.style.left = Math.random() * 100 + "%";
        f.style.top = 10 + Math.random() * 80 + "%";
        f.style.setProperty("--dx", (Math.random() - 0.5) * 160 + "px");
        f.style.setProperty("--dy", (Math.random() - 0.5) * 160 + "px");
        f.style.setProperty("--d", 6 + Math.random() * 8 + "s");
        f.style.animationDelay = -Math.random() * 8 + "s";
        app.appendChild(f);
      }
    } else if (!S().flags.lucioles && ff.length) ff.forEach((f) => f.remove());
    let pip = $(".pip");
    const showPip = E.cache().pip > 0 && U.tab === "domaine";
    if (showPip && !pip) { pip = document.createElement("div"); pip.className = "pip"; pip.textContent = "🐞"; app.appendChild(pip); }
    if (!showPip && pip) pip.remove();
  }

  /* pourquoi on ne peut pas explorer ce lieu tout de suite (rien si on peut) */
  function expWhy(z) {
    const st = S(), n = E.nextExp(z);
    if (!n) return "Tous les lieux disponibles sont explorés.";
    if (st.exp.active) return "Exploration déjà active. Prochain départ à la fin de l’exploration.";
    if (n.locked) {
      if (n.x.hidden) return n.x.hidden;
      if (typeof n.x.need === "string" && I[n.x.need]) return "Il te faut d’abord : " + esc(I[n.x.need].n) + ".";
      if (Array.isArray(n.x.need)) return "Il te faut d’abord : " + n.x.need.map((id) => esc(I[id] ? I[id].n : id)).join(", ") + ".";
      return "Ce lieu garde son secret pour l’instant.";
    }
    const lack = n.x.cost ? Object.keys(n.x.cost).filter((i) => (st.inv[i] || 0) < n.x.cost[i]) : [];
    if (!lack.length) return "";
    return "Il te manque " + lack.map((i) => fmt(n.x.cost[i] - Math.floor(st.inv[i] || 0)) + " " + esc(I[i].n) +
      (st.known[i] ? " (voir le Carnet)" : I[i].h ? " : « " + esc(I[i].h) + " »" : "")).join(", ") + ".";
  }

  /* ------------------------------------------------------------ thème et taille du texte */
  function applyTheme() {
    if (typeof document === "undefined") return;
    const st = S();
    const pref = (st.settings && st.settings.theme) || "auto";
    let dark = false;
    if (pref === "dark") dark = true;
    else if (pref === "light") dark = false;
    else if (typeof window !== "undefined" && window.matchMedia) {
      dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    if (window.EclatStyleMode === "vivant") dark = false;
    document.body.classList.toggle("theme-dark", dark);
    document.body.setAttribute("data-theme", dark ? "dark" : "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#151311" : "#f2eada");
  }

  function applyLargeText() {
    if (typeof document === "undefined") return;
    const st = S();
    const lt = !!(st.settings && st.settings.largeText);
    document.body.classList.toggle("large-text", lt);
  }

  /* lancer l’exploration du prochain lieu d’une terre */
  function explore(z, xid) {
    const why = xid ? (S().exp.active ? "Exploration déjà active. Prochain départ à la fin de l’exploration." : "") : expWhy(z);
    if (why) { A.fail(0); toast(why, { key: "nope" }); return; }
    const r = E.startExp(z, xid);
    if (r.ok) { A.init(); A.explore(); toast("🧭 Exploration lancée (autres actions disponibles)."); }
    render(true);
  }
  /* ------------------------------------------------------ fouilles (expéditions longues) */
  const FOU = () => ((E.RECIT || {}).fouille || {}).ui || {};
  function fouiller(z, i, lvl) {
    const r = E.fouilleLancer(z, i, lvl);
    if (!r.ok) { A.fail(0); toast(r.why === "busy" ? FOU().busy : r.why === "palier" ? (lvl === 2 ? FOU().avant1 : FOU().avant2) : "", { key: "nope" }); return; }
    A.init(); A.explore();
    toast("🧭 " + esc(FOU().parti || ""));
    render(true);
  }
  function recolterFouille() {
    const r = E.fouilleRecolter();
    if (!r.ok) { A.fail(0); if (r.why === "pas_fini") toast(esc(FOU().pasFini || ""), { key: "nope" }); }
  }

  function showOffline() {
    const o = U.offline;
    if (!o) return;
    U.offline = null;
    const list = o.top.map((k) => '<span class="ing">' + icon(k, "sm") + "+" + fmt(o.gains[k]) + " " + esc(I[k].n) + "</span>").join("");
    const auto = Object.keys(S().dom.ext).length > 0 || S().hand.q.length > 0;
    const full = [];
    // une sortie utile, sans compliquer la fermeture : lire la découverte, ou reprendre l’objectif
    const suite = o.exp ? '<button class="btn" data-m="journal">📖 Lire la découverte</button>' : E.guide() ? '<button class="btn" data-m="goal">🎯 Reprendre l’objectif</button>' : "";
    openModal({
      on: { journal: () => { setTab("journal"); }, goal: () => { setTab("domaine"); } },
      html: '<div class="kicker">Pendant ton absence · ' + fmtTime(o.dt) + "</div><h2>Bon retour !</h2>" +
      (list ? '<p class="small muted">Ressources récoltées et objets fabriqués :</p><div class="row wrap">' + list + "</div>"
        : '<p class="small">Rien n’a été récolté ni fabriqué pendant ton absence.' + (auto ? "" : " Pose une cabane sur un gisement : elle récolte même quand le jeu est fermé.") + "</p>") +
      (full.length ? '<p class="small">📦 La Réserve s’est remplie de ' + full.map((k) => esc(I[k].n.toLowerCase())).join(", ") + " : " + (full.length > 1 ? "leurs extracteurs se sont arrêtés" : "son extracteur s’est arrêté") + ". Une machine qui " + (full.length > 1 ? "les" : "le") + " transforme ferait de la place.</p>" : "") +
      (o.exp ? '<p class="small">🧭 Exploration terminée. Consulte le Journal.</p>' : "") +
        Help.resumeHTML(o.resume) +
        '<div class="acts">' + suite + '<button class="btn pri" data-m="close">Continuer</button></div>'
    });
  }

  /* ============================================================ MISES À JOUR
   * Une nouvelle version s’installe en arrière-plan puis attend ton accord :
   * tu peux télécharger ta sauvegarde avant de l’appliquer. */
  function showUpdate(reg) {
    U.updReg = reg;
    const bar = $("#updBar");
    bar.innerHTML = '<span class="grow">✨ Une nouvelle version d’Éclat est prête.</span><button class="btn small" data-u="save">💾 Ma sauvegarde</button><button class="btn small pri" data-u="go">Mettre à jour</button>';
    bar.classList.remove("hidden");
  }
  function applyUpdate() {
    const reg = U.updReg;
    save();
    if (U.peutEcrire()) pushBackup(E.serialize(), "Avant la mise à jour suivante");
    if (!reg || !reg.waiting) { location.reload(); return; }
    U.wantReload = true;
    reg.waiting.postMessage({ type: "SKIP_WAITING" });
    setTimeout(() => location.reload(), 3000);
  }
  /* « Chercher une mise à jour » (Menu > Système) : on interroge le serveur tout de suite au lieu d’attendre le
   * contrôle automatique (toutes les 30 min). Une version trouvée passe par la même barre que d’habitude, donc
   * avec le choix de télécharger la sauvegarde avant. Rend un des mots : prete, a-jour, hors-ligne, indisponible. */
  async function checkUpdate() {
    if (!("serviceWorker" in navigator) || !location.protocol.startsWith("http")) return "indisponible";
    const reg = U.swReg || await navigator.serviceWorker.getRegistration().catch(() => null);
    if (!reg) return "indisponible";
    if (navigator.onLine === false) return "hors-ligne";
    try { await reg.update(); } catch (_) { return "hors-ligne"; }
    if (reg.installing) {
      const w = reg.installing;
      await new Promise((done) => {
        const fin = () => { if (w.state === "installed" || w.state === "redundant" || w.state === "activated") done(); };
        w.addEventListener("statechange", fin); setTimeout(done, 20000); fin();
      });
    }
    if (reg.waiting && navigator.serviceWorker.controller) { showUpdate(reg); return "prete"; }
    return "a-jour";
  }
  function setupSW() {
    if (!("serviceWorker" in navigator) || !location.protocol.startsWith("http")) return;
    navigator.serviceWorker.register("sw.js").then((reg) => {
      U.swReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller && reg.waiting) showUpdate(reg); });
      });
      setInterval(() => reg.update().catch(() => { /* hors ligne */ }), 30 * 60 * 1000);
    }).catch(() => { /* hors ligne indisponible */ });
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (U.wantReload && !reloading) { reloading = true; location.reload(); }
    });
  }

  /* ============================================================ MODULES
   * créés après tout le noyau : chacun reçoit ce dont il a besoin, et rend ce que
   * le noyau et les modules suivants appellent (js/visiteurs.js, js/journal.js…) */
  /* la ligne d’ambiance sous l’en-tête */
  const Amb = window.EclatAmbiance.create({ E, D, U, $ });
  U.Ambiance = Amb;

  /* les visiteurs de passage */
  const Vis = window.EclatVisiteurs.create({ E, A, D, U, esc, fmt, toast, Tuto, sparks, floater, vibe, Jus });
  const { visiteurTick, visiteurFin } = Vis;

  /* le Journal et le Cosmos */
  const Jnl = window.EclatJournal.create({
    E, A, D, U, Sky, esc, fmt, fmtTime, icon, iconize, zoneName, toast, vibe, openModal, swapModal, render, save,
    subTabs, tabAvailable, stampTxt, stampHTML, recitInline, recitHTML, loreHTML, lectureHTML
  });
  const {
    openSigneModal, viewJournal, figuresSig, viewCosmos, mountCosmos, confirmFire, listen, skyTap, playNote,
    runTerminal
  } = Jnl;

  /* l’objectif, le suivi et les Quêtes */
  const Qst = window.EclatQuetes.create({
    E, A, D, U, esc, fmt, fmtTime, cap1, needText, icon, itemPill, ingHTML, gesteChip, mainIngredient, isRawGather,
    zoneName, floater, elCenter, toast, vibe, openModal, closeModal, swapModal, render, save,
    setTab,
    chainCraft: (b, id, n) => chainCraft(b, id, n) // défini plus bas (l’Atelier est créé après les Quêtes)
  });
  const {
    goalCard, goalSig, goalOpen, openMilestones, passHTML, pour, memoryHTML, trackerHTML, questChip, openQuestsModal
  } = Qst;

  /* la relève, les dons et la Mémoire des mains */
  const Mem = window.EclatMemoire.create({
    E, A, D, U, esc, fmt, fmtNum, fmtTime, perMin, zoneName, toast, vibe, openModal, closeModal, swapModal, simpleModal, render,
    save, setTab, pushBackup, recitInline, loreHTML, uiSigne, ornementHTML, playNote, Tuto, applyLargeText
  });
  const {
    intro, openStillnessScene, showEnding, confirmCycle, donsRepere, reveilRepere, openDons, openMemoire, openForcedReleve, memChip
  } = Mem;

  /* le menu, les sauvegardes et le compte en ligne */
  /* le jeu dans l’appareil : le bouton Retour, l’installation, le titre, l’écran allumé, le clavier (js/appareil.js) */
  const App = window.EclatAppareil.create({ E, U, toast, closeModal, setTab, tabVisible: (t) => tabAvailable(t) });
  const TestMode = window.EclatModeTest.create({E, D, config: TEST_CONFIG, esc, openModal, closeModal, save, render, setTab, canWrite: () => !U.saveLocked && Stk.peutEcrire()});
  const Cpt = window.EclatCompte.create({
    openTestMode: TestMode.open,
    E, ENGINE, A, D, U, Cloud, Tuto, esc, fmt, fmtTime, fmtDate, toast, openModal, closeModal, swapModal, simpleModal, save,
    backups, pushBackup, setTab, applyTheme, applyLargeText, volumes, intro, openMemoire, visiteurFin, App, Dom,
    checkUpdate: () => checkUpdate()
  });
  const {
    openMenu, openAccount, downloadSave, showBadSave, showNews, cloudTimers, cloudCheck, promptCapsuleText
  } = Cpt;

  /* l’Atelier et le Carnet */
  const Atl = window.EclatAtelier.create({
    E, A, D, U, Dom, Tuto, esc, norm, fmt, fmtNum, fmtTime, fmtHeat, perMin, cap1, needText, limitHTML, zoneName, GI, gi, gIc, icon,
    iconize, itemPill, TYPE, TYPE_HINT, badgeHTML, itD, descHTML, fxList, fxText, ingHTML, gesteChip, mainIngredient,
    floater, sparks, fete, elCenter, toast, vibe, openModal, closeModal, swapModal, render, save, setTab, subTabs,
    uiSigne, memoryHTML, progSwitchHTML
  });
  const {
    viewAtelier, viewLabo, prodClick, viewCarnet, viewMachines, carnetList, whyNot, putInSlot, forge, craftFrom, chainCraft, handsHTML,
    handSig, startHarvest, actBar, skillName, openSkills, openHands, openTree, goto, openItemInfo, promptCarnetQty,
    promptCraftQty
  } = Atl;

  const Help = window.EclatAssistance.create({
    E, D, U, esc, fmt, fmtTime, openModal, closeModal, setTab, goto, Dom, openHands,
    openGoals: () => openQuestsModal()
  });

  /* les écouteurs : le moteur et les gestes du joueur */
  const Ecu = window.EclatEcouteurs.create({
    App, E, A, D, U, Dom, Carte, esc, fmt, zoneName, deZone, icon, fxText, mainIngredient, floater, sparks, fete, fireworks,
    elCenter, toast, vibe, fresh, openModal, closeModal, simpleModal, render, refresh, save, setTab, badge,
    updateBadges, updMini, anchorFor, applyAge, applyUpdate, showOffline, stampHTML, recitInline, recitHTML, loreHTML,
    prodClick, FOU, explore, goalOpen, openMilestones, openQuestsModal, pour, openSigneModal, confirmFire, listen, skyTap,
    playNote, runTerminal, openMemoire, openDons, openForcedReleve, confirmCycle, showEnding, openStillnessScene,
    openMenu, openAccount, downloadSave, promptCapsuleText, goto, openItemInfo, carnetList, whyNot, putInSlot, forge,
    craftFrom, chainCraft, startHarvest, actBar, skillName, openSkills, openHands, openTree, promptCarnetQty, promptCraftQty
  });
  const { bindEngine, bindDom, checkForcedReleve } = Ecu;

  /* ============================================================ BOUCLE */
  /* une pastille sur l'onglet Atelier quand un nouveau goulot apparaît (0.52) ; elle part quand on ouvre l'Atelier */
  function goulotTick() {
    const t = Date.now();
    if (t - (U.goulotT || 0) < 3000) return;
    U.goulotT = t;
    if (!U.goulotVus) U.goulotVus = new Set();
    const ids = E.goulots().map((g) => g.id);
    if (U.tab === "atelier") { ids.forEach((i) => U.goulotVus.add(i)); return; }
    if (ids.some((i) => !U.goulotVus.has(i))) { ids.forEach((i) => U.goulotVus.add(i)); badge("atelier"); }
  }
  function loop() {
    E.update();
    visiteurTick();
    Amb.update();
    if (Atl.voixTick) Atl.voixTick();
    goulotTick();
    if (U.offline) U.fen.demande(FP.retour, "retour", showOffline);
    U.fen.pomper();
    if (U.dirty && !U.holding && !pressing()) render();
    workSound();
    if (U.tab === "arbre" && Date.now() - (U.arbreT || 0) > 400) { U.arbreT = Date.now(); Atl.arbreMaj(); } // l’arbre suit les découvertes
  }

  function boot() {
    setupModal();
    loadSprite();
    bindEngine();
    const status = loadSave();
    Stk.demanderVerrou();
    window.addEventListener("storage", Stk.surStorage);
    $("#saveBar").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-u]");
      if (!b) return;
      if (b.dataset.u === "export") downloadSave();
      if (b.dataset.u === "retry") { if (!save()) toast("Toujours impossible d’enregistrer. Télécharge ta partie pour la garder."); }
    });
    applyTheme();
    applyLargeText();
    if (typeof window !== "undefined" && window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if ((S().settings.theme || "auto") === "auto") applyTheme();
      });
    }
    A.setEnabled(S().settings.sound);
    A.setVolumes(volumes());
    Jus.press();
    if (status === "ok" || status === "migrated") E.update();
    bindDom();
    setTab("domaine");
    Amb.update(true);
    Object.assign(U.badges, S().flags.badges || {});
    if (S().settings && S().settings.carnet) {
      if (S().settings.carnet.filter) U.carnetFilter = S().settings.carnet.filter;
      if (S().settings.carnet.q) U.q = S().settings.carnet.q;
    }
    const bk = S().flags.bench;
    if (bk && Array.isArray(bk.s)) {
      if (D.GESTES[bk.g] && E.gesteOK(bk.g)) U.geste = bk.g;
      U.slots = [0, 1, 2].map((i) => (bk.s[i] && I[bk.s[i]] && S().seen[bk.s[i]] ? bk.s[i] : null));
    }
    if (status === "error") U.fen.demande(FP.sauvegarde, "sauvegarde", showBadSave);
    else if (!S().introSeen) U.fen.demande(FP.intro, "intro", () => intro());
    else {
      // une partie qui revient d’une version précédente voit une fois ce qui a changé
      // une correction (4.5.0 → 4.5.1) ne rouvre pas la fenêtre ; une nouvelle version (4.4 → 4.5), si
      const minor = (v) => String(v || "").split(".").slice(0, 2).join(".");
      if (S().flags.news || minor(S().flags.ver) !== minor(D.VERSION)) U.fen.demande(FP.nouveautes, "nouveautes", showNews);
      else S().flags.ver = D.VERSION;
      U.fen.demande(FP.retour, "retour", showOffline);
    }
    setTimeout(() => { U.live = true; }, 1500);
    setInterval(loop, 100);
    setInterval(refresh, 250);
    setInterval(() => {
      save();
      if (!U.persistAsked && S().stats.play >= 600) { U.persistAsked = true; demanderPersistance(); } // après dix minutes de jeu, pas dès l’arrivée
    }, 10000);
    setupSW();
    App.demarrer();
    TestMode.mount();
    if (!TEST_CONFIG.active) { cloudTimers(); setTimeout(cloudCheck, 1500); }
    U.applyTheme = applyTheme;
    U.applyLargeText = applyLargeText;
    U.itemPill = itemPill;
    window.__eclat = { E, U, Stk, demanderPersistance, render, save, backups, Cloud, Dom, Carte, toast, openMemoire, closeModal, itemPill, applyTheme };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
