/* ÉCLAT — l’Atelier et le Carnet.
 * L’établi (gestes, emplacements, matières, résultat), le Carnet et les Machines ;
 * l’œuvre et les commandes, les mains, l’action qui tourne, les niveaux des gestes ;
 * les fiches d’objets et l’arbre de fabrication. */
(function () {
  "use strict";

  function create(api) {
    const {
      E, A, D, U, Dom, Tuto, esc, norm, fmt, fmtNum, fmtTime, fmtHeat, perMin, cap1, needText, limitHTML, zoneName, GI, gi, gIc, icon,
      iconize, itemPill, TYPE, TYPE_HINT, badgeHTML, itD, descHTML, fxList, fxText, ingHTML, gesteChip, mainIngredient,
      floater, sparks, fete, elCenter, toast, vibe, openModal, closeModal, swapModal, render, save, setTab, subTabs,
      uiSigne, memoryHTML, progSwitchHTML
    } = api;
    const S = () => E.state;
    const I = D.ITEMS;
    const $ = (s, r) => (r || document).querySelector(s);
    const Atel = window.EclatAteliers ? window.EclatAteliers.create({ E, D }) : null;
    const Equipped = E.equipmentList && window.EclatAtelierEquipe ? window.EclatAtelierEquipe.create({...api,goalHint,handsHTML}) : null;

    /* ------------------------------------------------------------ ATELIER */
    /* l’étape clé de l’objectif, quand sa recette reste à trouver : la piste déjà donnée dans les Terres (rien de plus) reste sous les yeux à l’établi */
    function goalHint() {
      const g = E.guide();
      if (!g || !g.step) return "";
      const id = g.step, it = I[id], st = S(), lvl = st.hints[id] || 0;
      if (!it || st.known[id]) return "";
      const nIng = it.r ? Object.keys(it.r[1]).length : 0;
      const m = E.memory();
      const memBar = (m && m.id === id && m.p > 0) ? memoryHTML(m) : "";
      const dc = E.decipherCost(id);
      const canApply = lvl >= 1 && it.r && E.gesteOK(it.r[0]);
      let acts = "";
      if (canApply || dc !== null) {
        acts = '<div class="row wrap" style="gap:6px;margin-top:6px">';
        if (canApply) {
          acts += '<button class="btn small ghost" data-apply-hint="' + id + '" title="Sélectionner le geste et poser les indices connus sur l’établi">Poser l’indice sur l’établi</button>';
        }
        if (dc !== null) {
          const okIntu = (st.intu || 0) >= dc;
          const rev = ["Révéler le geste", "Révéler une ressource", "Révéler la recette entière"][lvl] || "Déchiffrer";
          acts += '<button class="btn small' + (okIntu ? "" : " ghost") + '" data-goal-decipher="' + id + '"' + (okIntu ? "" : " disabled") + ' title="' + rev + ' contre ' + dc + ' Intuition">✨ Déchiffrer · ' + dc + ' ✨</button>';
        }
        acts += '</div>';
      }
      return '<div class="card acc goal-hint"><div class="small"><span class="step-badge">✦ Nouvelle recette' + (nIng ? ' · ' + nIng + ' ressource' + (nIng > 1 ? 's' : '') : '') + '</span> ' + (it.h ? "<i>« " + esc(it.h) + " »</i>" : "<b>Recette à trouver</b>") + "</div>" +
        (lvl >= 1 ? '<div class="tiny muted">💭 L’action : ' + gesteChip(id) + "</div>" : "") +
        (lvl >= 2 ? '<div class="tiny muted">💭 Une des ressources : ' + icon(mainIngredient(id), "sm") + " " + esc(I[mainIngredient(id)].n) + "</div>" : "") +
        memBar + acts + "</div>";
    }
    /* Le Labo (0.39) : l’établi d’essai, rien d’autre. Les matières se choisissent dans une rangée,
     * la liste complète s’ouvre dans un panneau de la vue. */
    function recettesTrouvees() {
      const all = Object.keys(I).filter((id) => I[id].r && !I[id].sec && !I[id].path && !I[id].old && I[id].t !== "curio");
      return { n: all.filter((id) => S().known[id]).length, total: all.length };
    }
    function viewLabo() {
      const st = S();
      if (Equipped && st.age < 3) U.equipmentLegacy = false;
      if (Equipped && !U.equipmentLegacy) return Equipped.laboView();
      const rt = recettesTrouvees();
      let h = '<div class="labo"><div class="labo-tete">' + (Equipped ? '<button type="button" class="btn small ghost" data-ae="legacy" data-value="0">← Stations et outils</button>' : "") + '<button type="button" class="labo-compteur" data-tab2="carnet" title="Ouvrir le Carnet : toutes tes recettes trouvées">Recettes trouvées · ' + rt.n + " / " + rt.total + "</button></div>";
      if (!E.gesteOK(U.geste)) U.geste = "tailler";
      if (!(st.stats.crafts > 0) && !Tuto.active()) h += '<div class="tip">1. Choisis un <b>geste</b>. 2. Pose des <b>ressources</b> sur l’établi. 3. Lance le geste. Pour commencer : <b>Tailler</b> + <b>Bois</b>.</div>';
      // Le premier essai reste possible sans un aller-retour au Domaine.
      const firstWood = I.manche.r[1].bois;
      if (!(st.stats.crafts > 0) && E.count("bois") < firstWood) {
        const gathering = st.act && st.act.k === "harv" && st.act.res === "bois";
        h += '<div class="tip starter-harvest">' + (gathering
          ? 'Le bois arrive : ' + fmt(E.count("bois")) + '/' + firstWood + '. Attends d’en avoir ' + firstWood + ', touche sa tuile ci-dessous, puis <b>Tailler</b>.'
          : '<span>Il te faut ' + firstWood + ' bois pour commencer.</span><button class="btn pri" data-hloop="lisiere:bois">▶ Récolter du bois</button>') + '</div>';
      }
      h += goalHint();
      // l’explication des niveaux se lit une fois ; ensuite le bouton « Niveaux » rejoint l’établi et ne prend plus de ligne
      const niveauxTip = st.stats.crafts > 0 && !st.flags.tip_niveaux;
      if (niveauxTip) h += '<div class="sub-row"><span class="tiny muted">Le petit chiffre sur chaque action est son niveau. Il monte quand tu fabriques à la main.</span><button class="btn small ghost" data-skills title="Le niveau de chaque action et de la récolte">Niveaux</button><button class="btn small ghost" data-tip="tip_niveaux" title="Fermer cette astuce">Compris</button></div>';
      // une seule rangée, qu’on fait glisser : le haut du Labo laisse la place à l’établi
      const nG = D.GESTE_ORDER.filter((g) => E.gesteOK(g)).length + 1, wG = ($("#views") && $("#views").clientWidth || 360) - 24;
      h += '<div class="gestes' + (nG * 74 > wG ? " more" : "") + '">';
      let locks = 0;
      for (const g of D.GESTE_ORDER) {
        const G = D.GESTES[g];
        if (!E.gesteOK(g)) {
          if (G.secret || locks >= 1) continue; // une seule case « ??? » : assez pour annoncer la suite
          locks++;
          h += '<button class="geste lock" data-lock="' + g + '"><span class="gi">?</span><span class="gn">???</span></button>';
          continue;
        }
        h += '<button class="geste' + (U.geste === g ? " on" : "") + (G.secret ? " secret" : "") + '" data-g="' + g + '"><span class="gi">' + gIc(g) + '</span><span class="gn">' + G.n + "</span>" + (st.stats.crafts > 0 ? '<i class="glv">' + E.skill(g).lvl + "</i>" : "") + "</button>";
      }
      h += "</div>";
      const G = D.GESTES[U.geste];
      let heat = G.d;
      if (U.geste === "chauffer" || U.geste === "allier") heat = "🌡️ Ta meilleure chaleur : " + fmtHeat(E.heat());
      else if ((U.geste === "marteler" || U.geste === "electriser") && E.level(U.geste) > 1) heat = G.d + " (niveau " + E.level(U.geste) + ")";
      const mat = st.age >= 11 ? " m-labo" : st.age >= 6 ? " m-metal" : st.age >= 3 ? " m-pierre" : "";
      h += '<div class="card bench' + mat + '" id="bench"><div class="heat small"><span>' + esc(heat) + "</span>" +
        (st.stats.crafts > 0 && !niveauxTip ? '<button class="bench-clear" data-skills title="Le niveau de chaque action et de la récolte">Niveaux</button>' : "") +
        (U.slots.some(Boolean) ? '<button class="bench-clear" data-clear aria-label="Vider l’établi">✕ Vider</button>' : "") + '</div><div class="slots labo-etabli">';
      U.slots.forEach((id, i) => {
        if (i) h += '<span class="plus-sep">+</span>';
        if (id) h += '<button class="slot full labo-case" data-slot="' + i + '">' + icon(id) + '<span class="sn">' + esc(I[id].n) + '</span><span class="tiny muted" data-c="' + id + '">' + fmt(st.inv[id] || 0) + "</span></button>";
        else h += '<button class="slot labo-case" data-slot="' + i + '" title="Poser une ressource ici" aria-label="Emplacement libre : poser une ressource"><span class="plus">+</span></button>';
      });
      // le signe gravé sur le bouton reste à toucher même quand le bouton attend des ressources
      const mark = uiSigne("fabriquer", "L’Atelier");
      h += '</div><div class="forge-wrap"><button class="forge-btn labo-bouton" id="forge">' + gIc(U.geste) + " " + G.n.toUpperCase() + "</button>" +
        (mark ? '<span class="forge-mark">' + mark + "</span>" : "") + "</div></div>";
      h += '<div id="mbench" class="mbench hidden"><span class="mg">' + gIc(U.geste) + "</span>" +
        U.slots.map((id, i) => '<button class="mslot" data-slot="' + i + '">' + (id ? icon(id, "sm") : "+") + "</button>").join("") +
        '<button class="mforge" data-forge>' + gIc(U.geste) + " " + esc(G.n) + "</button></div>";
      h += '<div class="card result" id="result">' + resultHTML() + "</div>";
      h += labMatieres();
      return h + "</div>" + (U.labSearch ? labRecherche() : "");
    }
    /* la rangée de matières : les favorites, les plus récentes, puis ce qui est en stock */
    function labMatieres() {
      const st = S(), fv = favs();
      const score = (id) => (fv[id] ? 1e6 : 0) + (+st.seen[id] || 0) + (st.inv[id] >= 1 ? 1e3 : 0);
      const ids = invItems().slice().sort((a, b) => score(b) - score(a)).slice(0, 14);
      let h = '<div class="labo-matieres" role="group" aria-label="Matières récentes">';
      ids.forEach((id) => {
        const sel = U.slots.includes(id), stock = st.inv[id] >= 1;
        h += '<button class="inv labo-mat' + (sel ? " sel" : "") + (stock ? "" : " zero") + '" data-inv="' + id + '" title="' + esc(I[id].n) + '" aria-label="' + esc(I[id].n) + (stock ? "" : ", échantillon") + '">' + icon(id) +
          '<span class="n">' + esc(I[id].n) + "</span>" + (stock ? '<span class="c" data-c="' + id + '">' + fmt(st.inv[id]) + "</span>" : '<span class="labo-echantillon">échantillon</span>') + "</button>";
      });
      return h + '<button class="btn labo-plus" data-labsearch="1">Rechercher une matière</button></div>';
    }
    /* la liste complète, filtres compris, dans un panneau qui défile seul */
    function labRecherche() {
      return '<div class="labo-recherche" role="dialog" aria-label="Rechercher une matière"><div class="labo-recherche-tete"><b>Matières</b><button class="btn small" data-labsearch="0">Fermer</button></div><div class="labo-recherche-corps">' + invBlockHTML() + "</div></div>";
    }
    function invBlockHTML() {
      const st = S();
      const G = D.GESTES[U.geste];
      let h = "";
      const o = invOpts();
      const counts = invCounts();
      // recherche, tri et filtres quand il y a de quoi chercher
      const many = Object.keys(st.seen).length >= 8 || Object.keys(st.studied).length > 0 || !!U.iq || o.filter !== "tout";
      const nAct = (o.filter !== "tout" ? 1 : 0) + (o.sort !== "age" ? 1 : 0), filtreNom = (INV_FILTERS.find(([k]) => k === o.filter) || ["", ""])[1];
      const totalStock = Object.keys(st.inv).reduce((acc, k) => acc + (st.inv[k] || 0), 0);
      const inv = invItems();
      h += '<div class="sub-row inv-sub-row"><button type="button" class="btn small ghost' + (U.invFiche ? " on" : "") + '" data-fichemode aria-pressed="' + (U.invFiche ? "true" : "false") + '" title="Un appui sur une ressource ouvre sa fiche (comme un appui long)">ⓘ Fiches</button>' +
        (many ? '<span class="tiny muted">' + inv.length + (inv.length > 1 ? " ressources" : " ressource") + (o.filter !== "tout" ? " · " + esc(filtreNom) + (o.filter === "tryg" ? " · " + esc(G.n) : "") : "") + "</span>" : "") +
        "</div>" + studyAllHTML() +
        // la recherche reste affichée ; le tri et les filtres se rangent derrière « Filtres » (le chiffre dit combien sont actifs) et s’ouvrent sur place
        (many ? '<div class="inv-tools"><div class="search"><input id="iq" type="search" aria-label="Chercher une ressource" placeholder="Chercher une ressource…" value="' + esc(U.iq || "") + '" autocomplete="off" spellcheck="false">' +
        (U.iq ? '<button class="search-clear" data-clear-search="iq" aria-label="Effacer">✕</button>' : "") + '</div>' +
        '<button type="button" class="btn small ghost inv-fbtn' + (nAct ? " on" : "") + '" data-filtres aria-expanded="' + (U.invPanel ? "true" : "false") + '" aria-controls="invpanel" aria-label="Tri et filtres' + (nAct ? ", " + nAct + (nAct > 1 ? " actifs" : " actif") : "") + '">Filtres' + (nAct ? ' <b class="inv-fn">' + nAct + "</b>" : "") + (U.invPanel ? " ▴" : " ▾") + "</button></div>" +
        (U.invPanel ? '<div class="inv-panel" id="invpanel"><label class="tiny muted" for="isort">Trier par</label>' +
          '<select id="isort" title="Trier les ressources" aria-label="Trier les ressources">' + INV_SORTS.map(([k, n]) => '<option value="' + k + '"' + (o.sort === k ? " selected" : "") + ">" + n + "</option>").join("") + "</select>" +
          '<div class="filters wrap" role="group" aria-label="Filtrer">' + INV_FILTERS.map(([k, n, ic]) => {
            const cnt = counts[k] || 0;
            return '<button data-if="' + k + '" title="' + (INV_FT[k] || "") + '" class="' + (o.filter === k ? "on" : "") + '" aria-pressed="' + (o.filter === k) + '">' + (ic ? ic + " " : "") + n + '<span class="f-cnt">' + cnt + "</span></button>";
          }).join("") + "</div>" + (nAct ? '<button type="button" class="btn small ghost" data-fclear>Tout effacer</button>' : "") + "</div>" : "") : "");
      const flows = E.flows();
      const tile = (id) => {
        const sel = U.slots.includes(id), fav = favs()[id];
        const rxs = st.studied[id] && E.reactions(id), rx = rxs && rxs[U.geste];
        const spent = rxs && !Object.keys(rxs).length;
        const inR = E.rate(id) + (flows.prod[id] || 0);
        const outR = flows.cons[id] || 0;
        const net = inR - outR;
        const hasFlow = Math.abs(net) >= 1e-4;
        const flowCls = net > 1e-4 ? " pos" : net < -1e-4 ? " neg" : "";
        const flowTxt = net > 1e-4 ? "+" + perMin(net) : net < -1e-4 ? "-" + perMin(-net) : "";
        return '<button class="inv' + (sel ? " sel" : "") + (st.inv[id] >= 1 ? "" : " zero") + (I[id].t === "relic" ? " relic" : "") + (spent ? " spent" : "") + '" data-inv="' + id + '" title="' + esc(spent ? "Plus rien à trouver avec cette ressource, pour l’instant" : I[id].n + " : ouvrir sa fiche") + '" aria-label="' + esc(I[id].n) + ' : ouvrir sa fiche"' + ">" +
          (fav ? '<i class="fav">♥</i>' : "") +
          (rx ? '<i class="rx" title="Réagit avec cette action">✦' + (rx > 1 ? rx : "") + "</i>" : "") +
          icon(id) +
          '<span class="c" data-c="' + id + '">' + fmt(st.inv[id] || 0) + '</span>' +
          '<span class="c-flow' + flowCls + (hasFlow ? "" : " hidden") + '" data-flow="' + id + '">' + flowTxt + '</span>' +
          '<span class="n">' + esc(I[id].n) + "</span></button>";
      };
      if (!many) h += '<div class="inv-grid">' + inv.map(tile).join("") + "</div>";
      else if (o.sort === "age" && !U.iq) {
        // rangées par âge, les favorites en tête
        const groups = {};
        inv.forEach((id) => { const k = favs()[id] ? -1 : I[id].a; (groups[k] = groups[k] || []).push(id); });
        Object.keys(groups).map(Number).sort((a, b) => a - b).forEach((k) => {
          h += '<div class="inv-age">' + (k < 0 ? "♥ Favorites" : esc(D.AGES[k].n)) + '</div><div class="inv-grid">' + groups[k].map(tile).join("") + "</div>";
        });
      } else h += '<div class="inv-grid">' + inv.map(tile).join("") + "</div>";
      if (!inv.length) {
        const emptyMsg = o.filter === "tryg" ? "Aucune matière étudiée ne cache de recette à découvrir avec ce geste, pour l’instant. Tu peux étudier d’autres matières ou changer de geste."
          : o.filter === "fav" ? "Aucune ressource favorite. Appui long sur une ressource pour la marquer d’un ♥."
          : o.filter === "flow" ? "Aucun flux actif en ce moment. Pose des extracteurs ou lance des machines."
          : (U.iq || o.filter !== "tout" ? "Aucun résultat pour cette recherche ou ces filtres." : !(st.stats.crafts > 0) ? "Le bois récolté apparaîtra ici." : "Aucune ressource disponible. Récolte dans les Terres pour remplir ta Réserve.");
        h += '<p class="small muted center" style="padding:16px 0">' + emptyMsg + "</p>";
      }
      return h;
    }
    /* Étudier tout : une ligne au-dessus des ressources tant qu’il en reste deux à étudier. */
    function studyAllHTML() {
      const st = S(), sa = E.studyAllCost();
      if (sa.n < 2 || Object.keys(st.studied).length < 1) return "";
      const lack = st.intu < sa.c;
      return '<div class="study-all"><button class="btn small" data-study-all' + (lack ? " disabled" : "") + '>🔍 Étudier tout · ✨' + fmt(sa.c) + '</button><span class="tiny muted">' +
        (lack ? "Il te manque " + fmt(sa.c - st.intu) + " ✨ pour étudier les " + sa.n + " ressources." : sa.n + " ressources pas encore étudiées. Ensuite, le filtre 🔍 À tenter montre celles qui servent encore.") + "</span></div>";
    }
    const INV_SORTS = [
      ["age", "Par âge"],
      ["qty", "Plus nombreuses"],
      ["flow", "⚡ Flux actifs"],
      ["deficit", "⚠️ En déficit"],
      ["name", "Nom (A → Z)"],
      ["new", "Dernières trouvées"]
    ];
    const INV_FT = {
      tout: "Toutes tes ressources",
      flow: "Celles qui entrent ou sortent en ce moment",
      res: "Les ressources brutes, récoltées telles quelles",
      comp: "Les pièces fabriquées à l’Atelier",
      geste: "Celles qui servent au geste choisi",
      fav: "Celles que tu as marquées d’un ♥",
      new: "Celles qu’aucune recette connue n’utilise encore",
      try: "Les ressources étudiées qui cachent encore une recette",
      tryg: "Les matières étudiées qui cachent encore une recette avec le geste choisi"
    };
    const INV_FILTERS = [
      ["tout", "Tout", ""],
      ["flow", "En flux", "⚡"],
      ["res", "Brutes", "🪨"],
      ["comp", "Pièces", "⚙️"],
      ["geste", "Action", "✦"],
      ["fav", "Favoris", "♥"],
      ["new", "Inutilisées", "✨"],
      ["try", "À tenter", "🔍"],
      ["tryg", "À découvrir", "✦"]
    ];
    function invCounts() {
      const st = S(), fv = favs(), flows = E.flows();
      const used = {}, forG = {};
      for (const id in st.known) {
        const r = I[id] && I[id].r;
        if (!r) continue;
        for (const i in r[1]) { used[i] = true; if (r[0] === U.geste) forG[i] = true; }
      }
      const all = Array.from(new Set(Object.keys(st.inv).concat(Object.keys(st.seen)))).filter((id) => {
        const it = I[id];
        return it && (st.inv[id] >= 1 || st.seen[id]) && !E.isUnique(it) && !E.isScaled(it);
      });
      const c = { tout: all.length, flow: 0, res: 0, comp: 0, geste: 0, fav: 0, new: 0, try: 0, tryg: 0 };
      for (const id of all) {
        const it = I[id];
        const hasFlow = (E.rate(id) + (flows.prod[id] || 0) > 1e-4) || ((flows.cons[id] || 0) > 1e-4);
        if (hasFlow) c.flow++;
        if (it.t === "res") c.res++;
        else c.comp++;
        if (forG[id]) c.geste++;
        if (fv[id]) c.fav++;
        if (!used[id]) c.new++;
        if (st.studied[id] && E.usesLeft(id)) c.try++;
        if (st.studied[id] && E.reactions(id)[U.geste] > 0) c.tryg++;
      }
      return c;
    }
    const invOpts = () => Object.assign({ sort: "age", filter: U.invFilter || "tout" }, S().settings.inv, { filter: U.invFilter || (S().settings.inv && S().settings.inv.filter) || "tout" });
    const favs = () => S().settings.favs || (S().settings.favs = {});
    function quickRow(id) {
      const st = S(), it = I[id];
      const uniq = E.isUnique(it), owned = uniq && st.made[id] > 0;
      return '<div class="pin">' + icon(id, "sm") + '<span class="grow pn link-txt" data-goto="' + id + '">' + esc(it.n) + (uniq ? "" : ' <span class="tiny muted" data-c="' + id + '">(' + fmt(st.inv[id] || 0) + ")</span>") + "</span>" +
        (owned ? '<span class="tiny muted">✓</span>' : '<button class="btn small pri pin-make" data-cr="' + id + '" data-n="1" title="Fabriquer : ' + esc(it.n) + '" aria-label="Fabriquer : ' + esc(it.n) + '">⚡ +1</button>') + "</div>";
    }
    function pinsHTML() {
      const ids = Object.keys(S().pins).filter((id) => I[id] && I[id].r && S().known[id]);
      if (!ids.length) return "";
      return '<h3 class="sub" style="margin-top:4px">★ Épinglées</h3><div class="pins">' + ids.map(quickRow).join("") + "</div>";
    }
    function invItems() {
      const st = S(), o = invOpts(), q = norm(U.iq || ""), fv = favs();
      const flows = E.flows();
      const inRate = (id) => E.rate(id) + (flows.prod[id] || 0);
      const outRate = (id) => flows.cons[id] || 0;
      const netRate = (id) => inRate(id) - outRate(id);
      const actFlow = (id) => inRate(id) + outRate(id);

      const used = {}, forG = {};
      for (const id in st.known) {
        const r = I[id] && I[id].r;
        if (!r) continue;
        for (const i in r[1]) { used[i] = true; if (r[0] === U.geste) forG[i] = true; }
      }
      const byAge = (a, b) => I[a].a - I[b].a || (I[a].t === "res" ? -1 : 0) - (I[b].t === "res" ? -1 : 0) || I[a].n.localeCompare(I[b].n);
      const sorts = {
        age: byAge,
        name: (a, b) => I[a].n.localeCompare(I[b].n),
        qty: (a, b) => (st.inv[b] || 0) - (st.inv[a] || 0) || byAge(a, b),
        flow: (a, b) => actFlow(b) - actFlow(a) || Math.abs(netRate(b)) - Math.abs(netRate(a)) || byAge(a, b),
        deficit: (a, b) => {
          const netA = netRate(a), netB = netRate(b);
          const defA = netA < -1e-4 ? 1 : (outRate(a) > 0 && (st.inv[a] || 0) < 10 ? 0.5 : 0);
          const defB = netB < -1e-4 ? 1 : (outRate(b) > 0 && (st.inv[b] || 0) < 10 ? 0.5 : 0);
          if (defB !== defA) return defB - defA;
          if (netA !== netB) return netA - netB;
          return (st.inv[a] || 0) - (st.inv[b] || 0) || byAge(a, b);
        },
        new: (a, b) => (+st.seen[b] || 0) - (+st.seen[a] || 0) || byAge(b, a)
      };
      // une matière déjà eue reste dans la liste à 0 : sa place ne bouge pas, et on peut encore la poser sur l’établi
      // (une recette comprise propose alors de fabriquer ce qui manque)
      return Array.from(new Set(Object.keys(st.inv).concat(Object.keys(st.seen)))).filter((id) => {
        const it = I[id];
        if (!it || !(st.inv[id] >= 1 || st.seen[id])) return false;
        if (E.isUnique(it) || E.isScaled(it)) return false;
        if (q && !norm(it.n).includes(q)) return false;
        if (o.filter === "fav") return !!fv[id];
        if (o.filter === "flow") return inRate(id) > 1e-4 || outRate(id) > 1e-4;
        if (o.filter === "geste") return !!forG[id];
        if (o.filter === "res") return it.t === "res";
        if (o.filter === "comp") return it.t !== "res";
        if (o.filter === "new") return !used[id];
        if (o.filter === "try") return !!st.studied[id] && E.usesLeft(id) > 0;
        if (o.filter === "tryg") return !!st.studied[id] && E.reactions(id)[U.geste] > 0;
        return true;
      }).sort((a, b) => (o.sort !== "age" ? (fv[b] ? 1 : 0) - (fv[a] ? 1 : 0) : 0) || (sorts[o.sort] || byAge)(a, b));
    }
    const WHY = {
      froid: "Rien à façonner avec cette combinaison pour l’instant.",
      frais: "L’une de ces ressources s’emploie ailleurs, avec une autre action ou d’autres ressources.",
      tiede: "Cette action et ces ressources s’accordent bien. Cherche encore.",
      manque: "Bonne action, mais il manque une ressource.",
      trop: "Bonne action, mais l’une de ces ressources est superflue.",
      geste: "Les bonnes ressources, mais pas la bonne action."
    };
    /* au Labo : la première pièce offerte, et les intermédiaires qu’il reste à découvrir */
    function labExtra(r) {
      let h = "";
      if (r.offered) h += '<p class="small labo-offert">Tu gardes la première pièce : elle est dans ta Réserve.</p>';
      const manque = E.chaineManquante ? E.chaineManquante(r.id) : [];
      if (manque.length) h += '<p class="labo-chaine">À découvrir d’abord : ' + manque.slice(0, 3).map((i) => esc(S().known[i] || S().seen[i] ? I[i].n : "une pièce encore inconnue")).join(", ") + "</p>";
      return h;
    }
    function thermo(t) {
      const T = D.TEMPS[t];
      return '<div class="thermo labo-thermo"><span class="tname">' + T.n + '</span><span class="tiny muted">Froid → tiède → brûlant</span><meter min="0" max="4" value="' + t + '" aria-label="Thermomètre : ' + T.n + '">' + T.n + "</meter></div>";
    }
    function resultHTML() {
      const body = resultBody(U.last);
      // le résultat se garde après un essai, et se réduit d’un appui
      return body && U.last && S().stats.crafts >= 3 ? body + '<button class="btn small ghost result-x" data-resclose aria-label="Réduire le résultat">▴ Réduire</button>' : body;
    }
    function resultBody(r) {
      if(r&&r.kind==="equipment")return '<p>Pour cette fabrication, choisis la station et l’outil : touche « ← Stations et outils ».</p>';
      if (!r && S().stats.crafts >= 3) return ""; // déjà appris : la carte vide ne garde pas sa place (voir .result:empty)
      if (!r) return '<p class="small muted">Choisis un geste, pose jusqu’à trois ressources, puis lance-le. Le <b>thermomètre</b> indique si tu approches d’une recette.</p>';
      if (r.kind === "craft") {
        const it = I[r.id];
        let h = '<div class="row" style="align-items:flex-start">' + icon(r.id, "lg") + '<div class="grow">' +
          (r.fresh ? '<span class="new">Nouvelle découverte</span>' : "") +
          '<div class="rname">' + esc(it.n) + (E.isUnique(it) ? "" : " <span class='muted'>+" + fmt(r.n) + "</span>") + (r.bonus ? ' <span class="small" style="color:var(--intu)">★ chef-d’œuvre +' + fmt(r.bonus) + "</span>" : "") + "</div>" +
          descHTML(it) + (fxText(r.id) ? '<div class="small" style="color:var(--good);margin-top:4px">' + esc(fxText(r.id)) + "</div>" : "") + "</div></div>";
        if (!E.isUnique(it)) {
          h += '<div class="row wrap" style="margin-top:10px"><span class="small muted">' + gesteChip(r.id) + "</span>" + ingHTML(E.costFor(r.id), { check: true, link: true }) + "</div>";
          h += '<div class="row wrap" style="margin-top:8px">' + craftBtns(r.id) + "</div>";
        }
        return h;
      }
      if (r.kind === "learn") {
        // la carte suit ce qui se passe ensuite : en route dans tes mains, fabriqué, ou ce qui manque encore
        const made = (S().made[r.id] || 0) - (r.made0 || 0), q = E.queued(r.id);
        if (made > 0 && !q) { U.last = { kind: "craft", id: r.id, n: made, fresh: !r.made0 }; return resultBody(U.last); }
        const miss = q ? null : E.missingFor(r.id, 1);
        const head = '<div class="row">' + icon(r.id, "lg") + '<div class="grow">' + (r.fresh ? '<span class="new">Recette trouvée</span>' : "") + '<div class="rname">' + esc(I[r.id].n) + "</div>" + labExtra(r);
        if (q) return head + '<div class="small">✋ Commande ajoutée · Suivi au-dessus des onglets.</div></div></div>';
        // tout est là : le prix est affiché avant de fabriquer (une découverte ne prend jamais un gros stock d’office)
        if (!miss) return head + descHTML(I[r.id]) + (fxText(r.id) ? '<div class="small" style="color:var(--good);margin-top:4px">' + esc(fxText(r.id)) + "</div>" : "") +
          '<div class="row wrap small" style="margin-top:8px"><span class="muted">Ressources nécessaires (disponibles) :</span>' + ingHTML(E.costFor(r.id), { check: true, link: true }) + "</div>" +
          '<div class="row wrap" style="margin-top:8px">' + craftBtns(r.id) + "</div></div></div>";
        return head + '<div class="small">Recette découverte. Ressources manquantes :</div><div class="row wrap small" style="margin-top:4px;gap:4px">' +
          Object.keys(miss).map((i) => itemPill(i, { qty: miss[i], lack: true })).join("") + "</div>" +
          '<div class="row wrap" style="margin-top:8px"><button class="btn small pri" data-chain="' + r.id + '">⚡ Tout fabriquer</button><button class="btn small" data-tree="' + r.id + '">🌳 Détail</button><button class="btn small" data-track="' + r.id + '">🎯 Suivre</button></div></div></div>';
      }
      if (r.kind === "blocked") {
        const b = r.info;
        let msg = "Il te manque un outil.";
        if (b.why === "heat") msg = "Température insuffisante. Il faut au moins " + fmtHeat(b.heat) + " (tu atteins " + fmtHeat(E.heat()) + ").";
        if (b.why === "lvl") msg = U.geste === "marteler" ? "Ton enclume n’est pas assez dure pour ce métal." : "Il faudrait bien plus de puissance.";
        const st = b.why === "heat" ? E.stationFor("chauffer", b.heat) : b.why === "lvl" ? E.stationFor(I[r.id].r[0], 0, b.lvl) : null;
        return thermo(4) + '<div class="row" style="margin-top:6px">' + icon(r.id) + '<div class="grow"><b>' + esc(I[r.id].n) + '</b><div class="small">' + esc(msg) + "</div>" +
          (st ? '<div class="small" style="display:flex;align-items:center;gap:6px;margin-top:4px">Station nécessaire : ' + itemPill(st) + "</div>" : "") +
          (r.fresh ? '<div class="tiny muted">Recette notée dans le Carnet.</div>' : "") + "</div></div>";
      }
      if (r.kind === "owned") return '<p class="small">Tu possèdes déjà <b>' + esc(I[r.id].n) + "</b>.</p>";
      if (r.kind === "queued" || r.kind === "busy") {
        const it = I[r.id];
        const done = r.kind === "queued" && !E.queued(r.id);
        const msg = done ? "✓ Fabriqué : la pièce est rangée dans ta Réserve."
          : r.kind === "queued" ? "✋ Commande ajoutée. Durée estimée : " + fmtTime(r.time) + "."
          : r.why === "full" ? "Commandes au maximum. Une place se libère à la fin d’une commande."
          : r.why === "queued" ? "Déjà en cours." : "Impossible pour l’instant.";
        return '<div class="row" style="align-items:flex-start">' + icon(r.id, "lg") + '<div class="grow"><div class="rname">' + esc(it.n) + '</div><div class="small">' + msg + "</div>" +
          (E.isUnique(it) ? "" : '<div class="row wrap" style="margin-top:8px">' + craftBtns(r.id) + "</div>") + "</div></div>";
      }
      if (r.kind === "fail") {
        const m = E.memory();
        return thermo(r.temp) + '<p class="small" style="margin-top:8px">' + esc(r.msg) + '</p><p class="tiny muted">' + WHY[r.why] + "</p>" +
          (r.sec ? '<p class="small sec-heat">Une chaleur étrange : ce mélange cache quelque chose.</p>' : "") +
          (r.mem ? memoryHTML(m, "+" + r.mem) : m && !r.mem ? '<p class="tiny dim">Tu avais déjà tenté cette combinaison : aucun souvenir ne revient.</p>' : "");
      }
      return "";
    }
    function craftBtns(id) {
      const it = I[id];
      const status = E.orderStatus(id, 1);
      if (status.why === "queued" || status.why === "full") return '<span class="small muted">' + (status.why === "queued" ? 'Fabrication en cours.' : 'File de commandes pleine.') + '</span><button class="btn small ghost" data-hopen>Voir les commandes</button>';
      if (!status.ok) return '<button class="btn small ghost" data-tree="' + id + '" data-n="1" title="Voir les étapes et ce qui bloque la fabrication">Voir les prérequis</button>';
      if (E.isUnique(it)) return '<button class="btn small pri" data-cr="' + id + '" data-n="1" title="Commander 1 exemplaire, pièces comprises">Fabriquer</button>';
      // le prix d’un extracteur ou d’une machine monte à chaque exemplaire : pas de ×1000
      const sizes = E.isScaled(it) ? [10] : (D.COMMANDES && D.COMMANDES.sizes) || [10, 50, 100, 1000];
      const lbl = "Fabriquer";
      return '<button class="btn small pri" data-cr="' + id + '" data-n="1" title="Commander 1 exemplaire, pièces comprises">' + lbl + "</button>" +
        sizes.map((sz) => '<button class="btn small" data-cr="' + id + '" data-n="' + sz + '" title="Commander ' + sz + ' exemplaires d’un coup, pièces comprises">×' + sz + "</button>").join("") +
        '<button class="btn small" data-cr="' + id + '" data-n="max" title="Tout ce que ta Réserve permet, pièces comprises">Max</button>' +
        (E.isScaled(it) ? '' : '<button class="btn small" data-cr-custom="' + id + '" title="Saisir une quantité libre à fabriquer">…</button>');
    }

    /* ------------------------------------------------------------ CARNET */
    /* la quantité du Carnet : choisie une fois (en haut, elle reste visible en défilant), mémorisée, appliquée au bouton « Fabriquer » de chaque recette */
    const cqSizes = () => [1].concat((D.COMMANDES && D.COMMANDES.sizes) || [10, 50, 100, 1000], ["max"]);
    const cqNow = () => {
      const q = S().flags.carnetQty;
      return (typeof q === "number" && q > 0) || q === "max" ? q : 1;
    };
    /* la quantité mémorisée, ramenée à ce que cette recette accepte (une pièce unique : 1 ; un extracteur ou une machine : pas de ×50 ni plus) */
    function cqFor(it) {
      const q = cqNow();
      if (E.isUnique(it)) return 1;
      if (E.isScaled(it)) return q === 1 || q === 10 || q === "max" ? q : 10;
      return q;
    }
    function cqBarHTML() {
      const q = cqNow();
      const standard = cqSizes();
      const isCustom = typeof q === "number" && !standard.includes(q);
      return '<div class="qtybar" role="group" aria-label="Quantité à fabriquer"><span class="tiny muted">Quantité</span>' +
        standard.map((n) => '<button type="button" class="chipq' + (n === q ? " on" : "") + '" data-qty="' + n + '" title="' + (n === "max" ? "Tout ce que ta Réserve permet" : n === 1 ? "Un seul exemplaire" : n + " exemplaires d’un coup") + '" aria-pressed="' + (n === q) + '">' + (n === "max" ? "Max" : "×" + n) + "</button>").join("") +
        '<button type="button" class="chipq' + (isCustom ? " on" : "") + '" data-qty-custom title="Saisir une quantité libre" aria-label="Quantité libre" aria-pressed="' + isCustom + '">' + (isCustom ? "×" + q : "…") + "</button></div>";
    }
    function promptCarnetQty() {
      const current = cqNow();
      const def = current === "max" ? 10 : current;
      openModal({
        cls: "qty-modal",
        html: '<div class="kicker">Carnet</div>' +
          '<h2>Quantité libre</h2>' +
          '<p class="small muted">Choisis la quantité pour les commandes du Carnet.</p>' +
          '<form id="cqCustomForm" class="qty-form">' +
          '<div class="fld" style="margin:12px 0">' +
          '<input id="cqCustomIn" type="number" min="1" max="100000" class="input" value="' + def + '" required style="font-size:18px;padding:8px 12px;width:100%;box-sizing:border-box">' +
          '</div>' +
          '<div class="acts" style="display:flex;gap:8px;margin-top:14px">' +
          '<button type="submit" class="btn pri" style="flex:1">Appliquer</button>' +
          '<button type="button" class="btn" data-m="close" style="flex:1">Annuler</button>' +
          '</div>' +
          '</form>',
        onOpen: (box) => {
          const form = box.querySelector("#cqCustomForm");
          const input = box.querySelector("#cqCustomIn");
          if (input) { input.focus(); input.select(); }
          if (form) {
            form.addEventListener("submit", (ev) => {
              ev.preventDefault();
              const n = Math.max(1, Math.min(100000, Math.floor(Number(input.value) || 1)));
              S().flags.carnetQty = n;
              A.click();
              closeModal();
              render(true);
            });
          }
        }
      });
    }
    function promptCraftQty(id) {
      const it = I[id];
      if (!it) return;
      const max = E.maxPlan ? E.maxPlan(id) : 100000;
      openModal({
        cls: "qty-modal",
        html: '<div class="kicker">Fabrication</div>' +
          '<h2>' + esc(it.n) + '</h2>' +
          '<p class="small muted">Choisis la quantité exacte à commander' + (max > 0 ? ' (maximum possible : ' + fmt(max) + ')' : '') + '.</p>' +
          '<form id="crCustomForm" class="qty-form">' +
          '<div class="fld" style="margin:12px 0">' +
          '<input id="crCustomIn" type="number" min="1" max="100000" class="input" value="1" required style="font-size:18px;padding:8px 12px;width:100%;box-sizing:border-box">' +
          '</div>' +
          '<div class="acts" style="display:flex;gap:8px;margin-top:14px">' +
          '<button type="submit" class="btn pri" style="flex:1">Commander</button>' +
          '<button type="button" class="btn" data-m="close" style="flex:1">Annuler</button>' +
          '</div>' +
          '</form>',
        onOpen: (box) => {
          const form = box.querySelector("#crCustomForm");
          const input = box.querySelector("#crCustomIn");
          if (input) { input.focus(); input.select(); }
          if (form) {
            form.addEventListener("submit", (ev) => {
              ev.preventDefault();
              const n = Math.max(1, Math.min(100000, Math.floor(Number(input.value) || 1)));
              closeModal();
              handQueue(document.body, id, n, true);
            });
          }
        }
      });
    }
    function carnetBook() {
      const st = S(), book = E.carnet().map((s) => ({ age: s.age, ids: s.ids.slice() }));
      for (const id of Object.keys(st.known)) {
        const it = I[id]; if (!it || !it.r || it.path) continue;
        let sec = book.find((s) => s.age === it.a);
        if (!sec) { sec = { age: it.a, ids: [] }; book.push(sec); }
        if (!sec.ids.includes(id)) sec.ids.push(id);
      }
      return book;
    }
    function ageNavHTML(book) {
      if (U.q || U.carnetFilter === "ext" || book.length <= 1) return "";
      const st = S();
      const sorted = book.filter((s) => s.ids.some((id) => !I[id].sec && passFilter(id) && !hiddenOwned(id))).sort((a, b) => a.age - b.age);
      if (sorted.length <= 1) return "";
      const anyOpen = sorted.some((s) => U.carnetFilter !== "tout" || (U.openAges[s.age] !== undefined ? U.openAges[s.age] : s.age >= st.age));
      return '<div class="age-nav" role="navigation" aria-label="Accès rapide aux âges">' +
        '<button type="button" class="age-pill age-all" data-age-all title="' + (anyOpen ? "Replier tous les âges" : "Déplier tous les âges") + '" aria-label="' + (anyOpen ? "Replier tous les âges" : "Déplier tous les âges") + '">' + (anyOpen ? "▴ Plier" : "▾ Déplier") + "</button>" +
        sorted.map((s) => {
          const ag = D.AGES[s.age];
          const cur = s.age === st.age;
          return '<button type="button" class="age-pill' + (cur ? " cur" : "") + '" data-age-jump="' + s.age + '" style="--ac:' + ag.c + '" title="' + esc(ag.n) + '" aria-label="Aller à : ' + esc(ag.n) + '">Âge ' + (s.age + 1) + "</button>";
        }).join("") + "</div>";
    }
    function viewCarnet() {
      const st = S();
      const all = Object.keys(st.known).filter((id) => I[id] && I[id].r && !I[id].sec).length;
      const col1 = !!(st.settings && st.settings.carnet1Col);
      const dense = U.compact();
      let h = enteteAtelier("Carnet", all + (all > 1 ? " recettes apprises" : " recette apprise"));
      if (st.flags.tip_carnet === undefined) st.flags.tip_carnet = true;
      if (!st.flags.tip_carnet) {
        h += '<div class="tip">Retrouve tes recettes et choisis un lot à fabriquer. ×10 répète la recette dix fois ; les pièces intermédiaires sont fabriquées avec la commande. Les indices des autres recettes restent dans <b>À découvrir</b>. <button class="btn small ghost" data-tip="tip_carnet" title="Réduire l’aide du Carnet">Compris</button></div>';
      } else {
        h += '<div class="tip tip-mini"><span class="tiny muted">💡 Retrouve tes recettes et choisis un lot à fabriquer…</span> <button class="btn small ghost" data-tip-open="tip_carnet" title="Rouvrir l’aide du Carnet">Aide</button></div>';
      }
      const qNow = cqNow(), qTxt = qNow === "max" ? "Max" : "×" + qNow;
      const FILTRES = [["tout", "Apprises"], ["pret", "⚡ Prêtes"], ["craft", "Réalisables"], ["unk", "À découvrir"], ["ext", "Extracteurs"], ["tool", "Outils"], ["mach", "Machines"], ["pin", "★ Épinglées"]];
      const fNom = (FILTRES.find(([k]) => k === U.carnetFilter) || FILTRES[0])[1];
      h += '<div class="carnet-outils"><div class="search"><input id="cq" type="search" aria-label="Chercher une recette ou une ressource" placeholder="Chercher une recette ou une ressource…" value="' + esc(U.q || "") + '" autocomplete="off" spellcheck="false">' +
        (U.q ? '<button class="search-clear" data-clear-search="cq" aria-label="Effacer">✕</button>' : '') + '</div>' +
        (U.carnetFilter !== "unk" ? '<button type="button" class="btn small ghost' + (U.carnetPanel === "qty" ? " on" : "") + '" data-cpanel="qty" aria-expanded="' + (U.carnetPanel === "qty") + '" title="Combien d’exemplaires fabriquer d’un coup">' + qTxt + (U.carnetPanel === "qty" ? " ▴" : " ▾") + "</button>" : "") +
        '<button type="button" class="btn small ghost' + (U.carnetPanel === "filtres" ? " on" : "") + '" data-cpanel="filtres" aria-expanded="' + (U.carnetPanel === "filtres") + '" title="Choisir ce que la liste montre">' + esc(fNom) + (U.carnetPanel === "filtres" ? " ▴" : " ▾") + "</button></div>";
      if (U.carnetPanel === "qty" && U.carnetFilter !== "unk") h += cqBarHTML();
      const CF_T = { tout: "Toutes les recettes que tu connais", pret: "Celles que ta Réserve couvre entièrement, pièces comprises", craft: "Celles dont les pièces manquantes peuvent encore être fabriquées", unk: "Celles qu’il te reste à découvrir", ext: "Les bâtiments qui récoltent à ta place", tool: "Les outils et leurs améliorations", mach: "Les machines qui fabriquent seules", pin: "Tes épingles, en haut de l’Atelier" };
      if (U.carnetPanel === "filtres") h += '<div class="filters">' + FILTRES.map(([k, n]) =>
        '<button data-cf="' + k + '" title="' + (CF_T[k] || "") + '" class="' + (U.carnetFilter === k ? "on" : "") + '">' + n + "</button>").join("") + "</div>";
      h += ageNavHTML(carnetBook());
      return h + '<div id="clist" class="' + (col1 ? "cols-1" : "cols-2") + (dense ? " carnet-dense" : "") + '">' + carnetList() + "</div>";
    }

    /* Arbre vertical : largeur du téléphone, défilement natif, voisinage d’une recette. */
    const Arb = typeof window !== "undefined" ? window.EclatArbre : null;
    function arbreEl() { return document.getElementById("v-arbre"); }
    function arbreEtat(n) {
      if (n.etat === "fantome") return "À découvrir";
      if (n.etat === "allume") return S().made[n.id] > 0 ? "Déjà fabriqué" : "Recette découverte";
      return I[n.id].r ? "Recette à découvrir" : "Ressource découverte";
    }
    function arbrePortee(n) {
      return Arb && Arb.portee ? Arb.portee(n, E, D) : "pret";
    }
    function arbrePassPortee(n, f) {
      if (!f || f === "tout") return true;
      const p = arbrePortee(n);
      if (f === "portee") return p === "pret" || p === "presque";
      if (f === "pret") return p === "pret";
      if (f === "verrouille" || f === "bloque") return p === "bloque";
      return p === f;
    }
    function arbreCarte(n, centre) {
      const fant = n.etat === "fantome";
      const tag = centre ? "article" : "button";
      return '<' + tag + (centre ? ' tabindex="-1" aria-label="' + esc(fant ? "Recette à découvrir" : n.n) + '"' : ' type="button" data-arbsel="' + esc(n.cle) + '" title="Ouvrir cette branche : ses ingrédients et ses usages"') +
        ' class="arb-card ' + n.etat + (centre ? " sel" : "") + '" data-arbn="' + esc(n.cle) + '">' +
        (fant ? '<span class="arb-inconnu" aria-hidden="true">?</span>' : icon(n.id, "sm")) +
        '<span class="arb-card-corps"><span class="arb-l">' + esc(fant ? "Recette à découvrir" : n.n) + '</span>' +
        '<span class="arb-status">' + esc(arbreEtat(n)) + '</span>' +
        (n.objectif ? '<span class="arb-objectif">Objectif</span>' : '') + '</span></' + tag + '>';
    }
    /* la place d’une pastille dans son âge : les matières d’abord, puis les recettes de la moins profonde à la plus profonde, les pistes à la fin */
    function arbreRang(n, g) {
      if (n.etat === "fantome") return 99;
      if (n.etat === "vu") return 0;
      const it = I[n.id], dans = new Set(g.noeuds.filter((x) => x.age === n.age).map((x) => x.id));
      let d = 0;
      for (const k in it.r[1]) if (dans.has(k) && k !== n.id) { const x = g.noeuds.find((m) => m.id === k); d = Math.max(d, x ? arbreRang(x, { noeuds: g.noeuds.filter((m) => m.id !== n.id) }) : 0); }
      return 1 + d;
    }
    /* une pastille de la frise : une icône, un nom court, un état écrit pour le lecteur d’écran */
    function arbrePastille(n) {
      const fant = n.etat === "fantome", nom = fant ? "Recette à découvrir" : n.n;
      const pCat = arbrePortee(n);
      const neuf = n.etat === "allume" && !(S().made[n.id] > 0);
      const label = nom + ", " + arbreEtat(n).toLowerCase() + (neuf ? ", nouvelle recette" : "") + (n.objectif ? ", objectif" : "");
      return '<button type="button" class="arb-pas ' + n.etat + ' p-' + pCat + (n.objectif ? " obj" : "") + (neuf ? " neuf" : "") + '" data-arbsel="' + esc(n.cle) + '" data-arbn="' + esc(n.cle) + '" aria-label="' + esc(label) + '" title="Ouvrir : ses ingrédients et ses usages">' +
        (neuf ? '<span class="arb-dot-neuf" aria-hidden="true" title="Nouvelle recette"></span>' : '') +
        (fant ? '<span class="arb-inconnu" aria-hidden="true">?</span>' : icon(n.id, "sm")) + '<span class="arb-pas-n" aria-hidden="true">' + esc(fant ? "?" : nom) + '</span></button>';
    }
    function arbreResultats(q) {
      q = norm(q || "").trim();
      if (!q) return '<p class="small muted">Cherche une recette ou une ressource que tu connais.</p>';
      const hits = (U.arbreG ? U.arbreG.noeuds : []).filter((n) => n.id && norm(n.n).includes(q));
      hits.sort((a, b) => (norm(a.n).startsWith(q) ? 0 : 1) - (norm(b.n).startsWith(q) ? 0 : 1) || a.n.localeCompare(b.n, "fr"));
      return hits.length ? hits.slice(0, 8).map((n) => arbreCarte(n, false)).join("") : '<p class="small muted">Rien de tel parmi ce que tu connais.</p>';
    }
    function arbreBarre(g) {
      const f = U.arbreFiltre || "tout";
      const FILTRES = [
        ["tout", "Toutes", "Afficher toutes les pastilles"],
        ["portee", "À portée", "Afficher les recettes prêtes ou dont les matières sont récoltables"],
        ["pret", "Prêtes", "Afficher les recettes fabricables immédiatement avec ta Réserve"],
        ["verrouille", "Verrouillées", "Afficher les recettes avec un prérequis manquant ou non découvertes"]
      ];
      const counts = { tout: g.noeuds.length, portee: 0, pret: 0, verrouille: 0 };
      g.noeuds.forEach((n) => {
        const p = arbrePortee(n);
        if (p === "pret") { counts.pret++; counts.portee++; }
        else if (p === "presque") { counts.portee++; }
        else { counts.verrouille++; }
      });
      return '<div class="arb-barre">' +
        (U.arbreSel ? '<button type="button" class="btn small" data-arb="ensemble" title="Revenir à ta progression : ton âge, tes étapes et le prochain objectif">← Progression</button>' : '') +
        '<button type="button" class="btn small ouvre" data-arb="centre" aria-haspopup="dialog" title="Ouvre ton objectif du moment, et ce qu’il demande">Objectif</button>' +
        '<button type="button" class="btn small ghost" data-arb="chercher" aria-label="Chercher dans la progression" aria-expanded="' + !!U.arbreChercher + '">🔍</button></div>' +
        '<div class="filters arb-filtres" role="toolbar" aria-label="Filtrer les pastilles">' +
        FILTRES.map(([k, lbl, tip]) =>
          '<button type="button" data-arb-f="' + k + '" class="' + (f === k ? 'on' : '') + '" title="' + tip + '">' +
          lbl + ' <span class="f-cnt">' + (counts[k] || 0) + '</span></button>'
        ).join('') +
        '</div>' +
        '<div class="arb-chercher" role="search"' + (U.arbreChercher ? '' : ' hidden') + '><label for="arbq">Chercher dans la progression</label>' +
        '<input id="arbq" type="search" placeholder="Recette ou ressource" value="' + esc(U.arbreQ || '') + '" autocomplete="off" spellcheck="false">' +
        '<div id="arbres" class="arb-grille" aria-live="polite">' + arbreResultats(U.arbreQ) + '</div></div>';
    }
    function arbreEnsemble(g) {
      const etapes = E.milestones()[g.age] || [], faites = etapes.filter((x) => x.done).length;
      const objectif = g.noeuds.find((n) => n.objectif), ob = E.objective();
      const f = U.arbreFiltre || "tout";
      let h = '<header class="arb-entete"><h2>Ta progression</h2></header><section class="arb-progression"><h3>' + esc(D.AGES[g.age].n) + '</h3>' +
        '<p>' + faites + ' / ' + etapes.length + ' étapes accomplies</p><progress value="' + faites + '" max="' + Math.max(1, etapes.length) + '" aria-label="Étapes accomplies dans cet âge"></progress>';
      if (objectif) h += '<h3>Prochain objectif</h3>' + arbreCarte(objectif, false);
      else if (ob) h += '<h3>Prochain objectif</h3><p>' + esc(ob.txt || ob.n || 'Poursuivre l’exploration') + '</p>';
      else h += '<p>Tu as accompli les objectifs proposés.</p>';
      h += '</section><h3 class="arb-parcours-titre">Tes découvertes par âge</h3><div class="arb-legende" aria-hidden="true"><span><i class="allume"></i>trouvée</span><span><i class="vu"></i>matière vue</span><span><i class="fantome"></i>à trouver</span><span><i class="obj"></i>objectif</span><span><i class="neuf-i"></i>nouveau</span></div>';
      for (let a = 0; a <= g.max; a++) {
        const ns = g.noeuds.filter((n) => n.age === a);
        const ouverts = U.arbreAges || {};
        const visibles = f === "tout" ? ns : ns.filter((n) => arbrePassPortee(n, f));
        const ouvert = ouverts[a] !== undefined ? ouverts[a] : (f !== "tout" ? visibles.length > 0 : a === Math.min(g.age, g.max));
        /* Le décompte d'un âge = ce que montre la grille : les recettes trouvées, sur les recettes montrées (trouvées + cases « ? »). Les matières vues ont leur propre rangée ; une recette secrète n'entre dans le compte qu'une fois trouvée. */
        const estRecette = (n) => !(n.id && I[n.id] && !I[n.id].r);
        const recettesAge = ns.filter(estRecette);
        const c = recettesAge.filter((n) => n.etat === 'allume').length, tot = recettesAge.length;
        const compteTxt = f === "tout" ?
          (tot > 0 ? c + ' / ' + tot + ' recettes' : (c + ' connue' + (c > 1 ? 's' : ''))) :
          (visibles.length + ' ' + (f === 'pret' ? 'prête' + (visibles.length > 1 ? 's' : '') : f === 'portee' ? 'à portée' : 'verrouillée' + (visibles.length > 1 ? 's' : '')));
        h += '<details class="arb-age-groupe" data-arbage="' + a + '"' + (ouvert ? ' open' : '') + '><summary><span>' + esc(D.AGES[a].n) + '</span><span class="arb-age-compte"' + (f === 'tout' && tot > 0 ? ' aria-label="' + c + ' sur ' + tot + ' recettes connues"' : '') + '>' + compteTxt + '</span></summary>';
        const rang = new Map(visibles.map((n) => [n.cle, arbreRang(n, g)]));
        visibles.sort((x, y) => rang.get(x.cle) - rang.get(y.cle) || (x.n || "").localeCompare(y.n || "", "fr"));
        const estMatiere = (n) => n.id && I[n.id] && !I[n.id].r;
        const matieres = visibles.filter(estMatiere), recettes = visibles.filter((n) => !estMatiere(n));
        h += (recettes.length ? '<div class="arb-frise">' + recettes.map(arbrePastille).join('') + '</div>' : '<p class="small muted">' + (ns.length ? 'Aucune recette pour ce filtre.' : 'Rien découvert pour l’instant.') + '</p>') +
          (matieres.length ? '<h4 class="arb-sous">Matières vues</h4><div class="arb-frise arb-matieres">' + matieres.map(arbrePastille).join('') + '</div>' : '') + '</details>';
      }
      if (g.max < D.AGES.length - 1) h += '<p class="small muted">Les autres âges se dévoileront au fil de tes découvertes.</p>';
      return h;
    }
    function arbreBranche(g, cle) {
      const v = Arb.voisinage(g, cle);
      if (!v) return arbreEnsemble(g);
      const n = v.centre, it = n.id && I[n.id];
      let h = '<header class="arb-entete">' + ((U.arbreHistorique || []).length ? '<button type="button" class="btn small ghost" data-arb="retour" title="Revenir à la recette d’avant">← Revenir</button>' : '') + '<p class="small muted">' + esc(D.AGES[n.age].n) + '</p></header>';
      if (v.amont.length) {
        h += '<section class="arb-etape" aria-labelledby="arb-ingredients"><h3 id="arb-ingredients">' + (n.etat === 'fantome' ? 'Une piste pour commencer' : 'Utilise') + '</h3><div class="arb-frise arb-voisins">' + v.amont.map(arbrePastille).join('') + '</div></section><div class="arb-fleche" aria-hidden="true">↓</div>';
      }
      h += '<section class="arb-selection" aria-label="Objet sélectionné">' + arbreCarte(n, true) + '<div class="arb-actions">';
      const cibleId = n.id || (n.objectif && E.objective() && E.objective().k === 'craft' ? E.objective().id : null);
      if (cibleId) h += '<button type="button" class="btn small" data-chemin="' + esc(cibleId) + '" title="Chemin : la route complète jusqu’à l’objet">Chemin</button>';
      if (n.etat === 'allume') h += '<button type="button" class="btn small" data-carnet-rec="' + esc(n.id) + '">Ouvrir la recette dans le Carnet</button>';
      else if (it) h += '<button type="button" class="btn small" data-goto="' + esc(n.id) + '">Voir la fiche</button>';
      h += '</div>';
      if (n.etat === 'fantome' || (n.etat !== 'allume' && it.r)) h += '<p class="small muted">' + (n.etat === 'fantome' ? 'Essaie avec les ressources que tu as étudiées à l’Atelier.' : 'La recette reste à découvrir à l’Atelier.') + '</p>';
      h += '</section>';
      if (v.aval.length) {
        const connus = v.aval.filter((p) => p.etat !== 'fantome'), inconnus = v.aval.length - connus.length;
        const visibles = U.arbreTout ? connus : connus.slice(0, 8);
        h += '<div class="arb-fleche" aria-hidden="true">↓</div><section class="arb-etape" aria-labelledby="arb-usages"><h3 id="arb-usages">Sert à fabriquer</h3><div class="arb-frise arb-voisins">' + visibles.map(arbrePastille).join('') + '</div>';
        if (connus.length > visibles.length) h += '<button type="button" class="btn small wide" data-arb="tout" title="Afficher tous les usages connus">Voir les ' + connus.length + ' usages connus</button>';
        if (inconnus) h += '<p class="small arb-pistes">' + inconnus + (inconnus > 1 ? ' autres recettes restent à découvrir.' : ' autre recette reste à découvrir.') + '</p>';
        h += '</section>';
      } else h += '<p class="small muted">Aucun usage découvert pour le moment.</p>';
      return h;
    }
    function arbreBati(el) {
      if (!el || !Arb) return;
      const v = el.querySelector('#arbre'), scroll = v ? v.scrollTop : 0;
      const focus = document.activeElement, action = focus && focus.dataset && focus.dataset.arb;
      const recherche = focus && focus.id === 'arbq', caret = recherche ? focus.selectionStart : null;
      const ancien = U.arbreG && U.arbreG.noeuds.find((n) => n.cle === U.arbreSel);
      const signature = arbreSignature(Arb.graphe(E, D));
      U.arbreG = Arb.graphe(E, D);
      // une piste (fantôme) change de clé quand l’arbre change : la feuille ouverte sur elle se ferme
      if (U.arbreSel && ((ancien && ancien.etat === 'fantome' && el.dataset.sig !== signature) || !U.arbreG.noeuds.some((n) => n.cle === U.arbreSel))) { U.arbreSel = null; U.arbreHistorique = []; if (U.mcur && U.mcur.arbre) closeModal(); }
      el.innerHTML = progSwitchHTML() + arbreBarre(U.arbreG) + '<div id="arbre" class="arb-vue" tabindex="0" aria-label="Arbre des connaissances, défilement vertical">' + arbreEnsemble(U.arbreG) + '</div>';
      el.dataset.sig = arbreSignature(U.arbreG);
      el.querySelector('#arbre').scrollTop = scroll;
      el.querySelectorAll('details[data-arbage]').forEach((d) => d.addEventListener('toggle', () => { if (d.isConnected) (U.arbreAges || (U.arbreAges = {}))[d.dataset.arbage] = d.open; }));
      iconize(el);
      if (recherche) { const q = el.querySelector('#arbq'); q.focus({ preventScroll: true }); if (caret !== null) q.setSelectionRange(caret, caret); }
      if (action) { const b = el.querySelector('[data-arb="' + action + '"]'); if (b) b.focus({ preventScroll: true }); }
    }
    /* la feuille : la branche d’une recette dans une fenêtre qui monte du bas, l’arbre reste dessous. Une pastille de la feuille la fait passer à celle-là. */
    function arbreFeuille() {
      const o = { html: '<div class="arb-sheet-c">' + arbreBranche(U.arbreG, U.arbreSel) + '</div>', cls: 'arb-sheet', arbre: true,
        onClose: () => { U.arbreSel = null; U.arbreHistorique = []; U.arbreTout = false; } };
      if (U.mcur && U.mcur.arbre) { swapModal(o); const box = document.querySelector('#modal .modal-box'); if (box) box.insertAdjacentHTML('afterbegin', '<button class="modal-x" data-m="close" aria-label="Fermer">✕</button>'); }
      else openModal(o);
    }
    function arbreChoisir(cle, historique) {
      if (!U.arbreG || !U.arbreG.noeuds.some((n) => n.cle === cle)) return;
      if (historique && U.arbreSel && U.arbreSel !== cle) (U.arbreHistorique || (U.arbreHistorique = [])).push(U.arbreSel);
      U.arbreSel = cle; U.arbreTout = false;
      if (U.arbreChercher) { U.arbreChercher = false; U.arbreQ = ''; arbreBati(arbreEl()); }
      arbreFeuille();
      const c = document.querySelector('#modal .arb-selection .sel');
      if (c) c.focus({ preventScroll: true });
    }
    function arbreOuvrir(id) { if (!Arb) return; U.arbreVoirId = id || null; setTab('arbre'); }
    function arbreRendre(el) {
      if (!Arb) return;
      const id = U.arbreVoirId; U.arbreVoirId = null;
      const g = Arb.graphe(E, D);
      const premier = !el.firstElementChild;
      if (premier) U.arbreSel = null;
      if (!el.firstElementChild || el.dataset.sig !== arbreSignature(g)) arbreBati(el);
      if (id) { U.arbreHistorique = []; arbreChoisir(id); }
    }
    function arbreSignature(g) {
      return Arb.sig(g) + '|' + (E.milestones()[S().age] || []).map((x) => x.done ? 1 : 0).join('') + '|' + (E.objective() || {}).i + '|' + g.noeuds.map((n) => S().made[n.id] > 0 ? 1 : 0).join('');
    }
    function arbreMaj() {
      const el = arbreEl(); if (!el || !Arb || U.tab !== 'arbre' || (U.progTab && U.progTab !== 'chemin')) return;
      const g = Arb.graphe(E, D);
      if (el.dataset.sig !== arbreSignature(g)) arbreBati(el);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('input', (e) => { if (e.target.id === 'arbq') { U.arbreQ = e.target.value; const r = document.getElementById('arbres'); if (r) { r.innerHTML = arbreResultats(U.arbreQ); iconize(r); } } });
      document.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('[data-arb], [data-arb-f], [data-arbsel], [data-arbre-obj], [data-carnet-rec], [data-situer], [data-chemin], [data-ch-craft], [data-ch-harv], [data-ch-voir], [data-ch-atelier]');
        if (!b) return;
        if (b.dataset.chCraft) {
          e.stopPropagation(); A.click();
          chainCraft(b, b.dataset.chCraft, 1);
          const modalBox = document.querySelector("#modal .modal-box");
          if (modalBox && U.cheminId) { modalBox.innerHTML = treeHTML(U.cheminId, U.cheminTimes || 1); iconize(modalBox); }
          return;
        }
        if (b.dataset.chHarv) {
          e.stopPropagation(); A.click();
          const res = b.dataset.chHarv, zid = E.RES_ZONE ? E.RES_ZONE[res] : null;
          closeModal();
          if (zid && E.zoneOpen && E.zoneOpen(zid)) { setTab('domaine'); if (E.harvest) E.harvest(zid, res); }
          return;
        }
        if (b.dataset.chVoir) {
          e.stopPropagation(); A.click();
          closeModal();
          if (S().known[b.dataset.chVoir]) showInCarnet(b.dataset.chVoir);
          return;
        }
        if (b.hasAttribute('data-ch-atelier')) {
          e.stopPropagation(); A.click();
          closeModal();
          setTab('labo');
          return;
        }
        if (b.dataset.chemin) { e.stopPropagation(); A.click(); openTree(b.dataset.chemin, 1); return; }
        if (b.dataset.carnetRec) { e.stopPropagation(); if (U.mcur && U.mcur.arbre) closeModal(); if (S().known[b.dataset.carnetRec]) showInCarnet(b.dataset.carnetRec); return; }
        if (b.dataset.situer) { e.stopPropagation(); if (S().known[b.dataset.situer] && arbreVisible(b.dataset.situer)) arbreOuvrir(b.dataset.situer); return; }
        if (b.hasAttribute('data-arbre-obj')) { e.stopPropagation(); arbreOuvrir(objectifCle()); return; }
        if (!b.closest('#v-arbre, .arb-sheet-c')) return;
        e.stopPropagation(); A.click();
        if (b.dataset.arbsel) { arbreChoisir(b.dataset.arbsel, true); return; }
        if (b.dataset.arbF) {
          U.arbreFiltre = b.dataset.arbF;
          const el = arbreEl();
          arbreBati(el);
          if (el) { const scr = el.querySelector('#arbre'); if (scr) scr.scrollTop = 0; }
          return;
        }
        const a = b.dataset.arb, el = arbreEl();
        if (a === 'chercher') {
          U.arbreChercher = !U.arbreChercher; const p = el.querySelector('.arb-chercher'); p.hidden = !U.arbreChercher; b.setAttribute('aria-expanded', U.arbreChercher);
          if (U.arbreChercher) el.querySelector('#arbq').focus();
          return;
        }
        if (a === 'centre') { const cle = objectifCle(); if (cle) { U.arbreHistorique = []; arbreChoisir(cle); return; } }
        if (a === 'retour' && (U.arbreHistorique || []).length) { arbreChoisir(U.arbreHistorique.pop()); return; }
        if (a === 'tout') { U.arbreTout = true; arbreFeuille(); return; }
        U.arbreSel = null; U.arbreHistorique = [];
        if (U.mcur && U.mcur.arbre) closeModal();
        arbreBati(el);
        el.querySelector('#arbre').scrollTop = 0;
      }, true);
    }
    E.on('learn', () => { U.arbreNeuf = null; });

    function objectifCle() {
      if (!Arb) return null;
      const n = Arb.graphe(E, D).noeuds.find((x) => x.objectif);
      return n ? n.cle : null;
    }
    const arbreVisible = (id) => !!(Arb && I[id] && I[id].r && I[id].a <= S().age + 1 && !I[id].sec && !I[id].path && I[id].t !== "curio" && I[id].t !== "relic");
    /* fin ARBRE */

    function viewMachines() {
      let h = enteteAtelier("Machines et commandes", "Les commandes compatibles sont accélérées par les machines, en complément des mains.");
      h += Dom.machinesView ? Dom.machinesView({ sansTitre: true }) : "";
      return h;
    }
    function visibleRecipes() {
      const st = S();
      const ids = [];
      E.carnet().forEach((s) => s.ids.forEach((id) => ids.push(id)));
      Object.keys(S().known).forEach((id) => { if (I[id] && I[id].r && !ids.includes(id)) ids.push(id); });
      if (E.gesteOK("accorder")) E.pathRecipes().forEach((id) => ids.push(id));
      return [...new Set(ids)];
    }
    function hiddenOwned(id) {
      const it = I[id];
      return !U.showOwned && E.isUnique(it) && S().made[id] > 0 && U.carnetFilter !== "pin";
    }
    /* Le nom d’une recette encore inconnue reste caché (on cherche sans savoir ce qui va sortir),
     * sauf si le jeu l’a déjà dit : objectif, étape d’un âge, prochaine étape, objet déjà vu. */
    function namedSet() {
      const st = S(), out = {}, g = E.guide();
      E.milestones().forEach((l, a) => { if (l && a <= st.age + 1) l.forEach((x) => { if (x.ob.k === "craft") out[x.ob.id] = 1; }); });
      if (g && g.step) out[g.step] = 1;
      if (st.track) out[st.track.id] = 1;
      return out;
    }
    const nameShown = (id, set) => { const st = S(); return !!(st.known[id] || st.seen[id] || !I[id].r || (set || namedSet())[id]); };
    function carnetList() {
      const st = S();
      const q = norm(U.q);
      U.named = namedSet();
      let nHidden = 0;
      const keep = (id) => { if (!passFilter(id)) return false; if (hiddenOwned(id)) { nHidden++; return false; } return true; };
      let h = "";
      if (q) {
        const ids = visibleRecipes().filter((id) => {
          const it = I[id];
          if (!nameShown(id, U.named)) return false; // un nom caché ne se trouve pas en cherchant
          if (norm(it.n).includes(q)) return true;
          if (!st.known[id]) return false;
          return Object.keys(it.r[1]).some((i) => norm(I[i].n).includes(q));
        }).filter(passFilter);
        h += ids.length ? '<div class="list flat">' + ids.map(recCard).join("") + "</div>" : '<p class="small muted center">Aucune recette ne correspond.</p>';
        return h;
      }
      if (E.gesteOK("accorder") || E.pathRecipes().some((id) => st.known[id])) {
        const ids = E.pathRecipes().filter((id) => E.gesteOK('accorder') || st.known[id]).filter(keep);
        if (ids.length) h += '<details class="card age-sec" open><summary><span class="ic" style="border-color:#b36bff">🎵</span><span class="an">La Résonance</span></summary><div class="list">' + ids.map(recCard).join("") + "</div></details>";
      }
      // les extracteurs se rangent par bâtiment (Bûcheron, Cueilleur…), niveau après niveau, plutôt que par âge
      if (U.carnetFilter === "ext") {
        (D.LIGNES || []).forEach((L) => {
          const ids = L.niv.map((v) => v.id).filter(keep);
          if (!ids.length) return;
          const kn = L.niv.filter((v) => st.known[v.id]).length;
          h += '<details class="card age-sec" open><summary><span class="ic">' + L.ic + '</span><span class="an">' + esc(L.n) + '</span><span class="cnt">' + kn + "/" + L.niv.length + '</span></summary><div class="list">' + ids.map(recCard).join("") + "</div></details>";
        });
        return h || '<p class="small muted center">Aucun extracteur connu pour l’instant.</p>';
      }
      const book = carnetBook();
      const order = book.map((b, i) => i).sort((a, b) => {
        const rank = (x) => (book[x].age === st.age ? 0 : book[x].age === st.age + 1 ? 1 : book[x].age < st.age ? 2 + st.age - book[x].age : 2 + D.AGES.length + book[x].age);
        return rank(a) - rank(b);
      });
      for (const k of order) {
        const sec = book[k];
        const ids = sec.ids.filter((id) => !I[id].sec).filter(keep);
        if (!ids.length) continue;
        const ag = D.AGES[sec.age];
        const kn = sec.ids.filter((id) => st.known[id] && !I[id].sec).length;
        const freshCount = sec.ids.filter((id) => st.known[id] && !I[id].sec && !(st.made[id] > 0)).length;
        const open = U.carnetFilter !== "tout" || (U.openAges[sec.age] !== undefined ? U.openAges[sec.age] : sec.age >= st.age);
        h += '<details class="card age-sec" data-age="' + sec.age + '"' + (open ? " open" : "") + '><summary><span class="ic" style="background:' + ag.c + "22;border-color:" + ag.c + '66">' + (sec.age + 1) +
          '</span><span class="an">' + ag.n + '</span>' + (freshCount > 0 && U.carnetFilter !== 'unk' ? '<span class="badge-neuf mini-neuf" title="' + freshCount + ' nouvelle(s) recette(s)">' + freshCount + ' nouv.</span>' : '') + '<span class="cnt">' + (U.carnetFilter === 'unk' ? ids.length + ' à découvrir' : kn + ' apprises') + '</span></summary><div class="list">' + ids.map(recCard).join("") + "</div></details>";
      }
      const secrets = Object.keys(I).filter((id) => I[id].sec && st.known[id] && I[id].r).filter(keep);
      if (secrets.length) h += '<details class="card age-sec"' + (U.carnetFilter !== "tout" ? " open" : "") + '><summary><span class="ic">🗝️</span><span class="an">Curiosités</span><span class="cnt">' + secrets.length + '</span></summary><div class="list">' + secrets.map(recCard).join("") + "</div></details>";
      if (!h) h = '<p class="small muted center">Rien ici pour l’instant.</p>';
      if (nHidden || U.showOwned) h += '<p class="center"><button class="btn small ghost" data-owned title="Masquer ou montrer les objets déjà fabriqués">' + (U.showOwned ? "Cacher les objets déjà possédés" : "Voir les " + nHidden + " objets déjà possédés") + "</button></p>";
      return h;
    }
    function passFilter(id) {
      const st = S(), it = I[id];
      if (U.carnetFilter === "tout") return !!st.known[id];
      if (U.carnetFilter === "unk") return !st.known[id];
      if (U.carnetFilter === "pret" || U.carnetFilter === "craft") {
        const lot = window.EclatCarnet.lot(E, D, id, cqNow());
        if (!lot || !lot.n || !E.ageOK(id) || E.blocker(id)) return false;
        return U.carnetFilter === 'pret' ? Object.entries(lot.cout).every(([k, n]) => (st.inv[k] || 0) + 1e-9 >= n) : lot.plan.ok;
      }
      if (U.carnetFilter === "prod") return st.known[id] && ["ext", "upg", "mach", "tool", "stat"].includes(it.t);
      if (U.carnetFilter === "ext") return st.known[id] && it.t === "ext";
      if (U.carnetFilter === "tool") return st.known[id] && ["tool", "upg"].includes(it.t);
      if (U.carnetFilter === "mach") return st.known[id] && ["mach", "stat"].includes(it.t);
      if (U.carnetFilter === "pin") return !!st.known[id] && !!st.pins[id];
      return true;
    }
    function carnetLotHTML(id, lot) {
      lot = lot || window.EclatCarnet.lot(E, D, id, cqNow());
      if (!lot) return '';
      if (!lot.n) return '<p class="small muted">Max : aucun lot disponible avec ta Réserve actuelle.</p><div class="rl lot-cout">' + gesteChip(id) + ingHTML(E.costFor(id), { check: true, link: true }) + '</div>';
      const p = lot.plan, manques = Object.keys(p.missing), connus = {};
      manques.forEach((k) => { if (S().seen[k] || S().known[k] || lot.cout[k]) connus[k] = p.missing[k]; });
      let h = '<p class="lot-titre"><b>Lot ×' + fmt(lot.n) + '</b> · ' + fmt(lot.sortie) + (lot.sortie > 1 ? ' pièces produites' : ' pièce produite') +
        (lot.duree !== null ? ' <span class="tiny muted">· ⏱ ' + fmtTime(lot.duree) + '</span>' : '') + '</p>' +
        '<div class="rl lot-cout">' + gesteChip(id) + ingHTML(lot.cout, { check: true, link: true }) + '</div>';
      if (p.locked.length) h += '<p class="small why">Une recette intermédiaire reste à découvrir.</p>';
      else if (Object.keys(p.blocked).length) h += '<p class="small why">Une étape intermédiaire est bloquée. Consulte le détail du lot.</p>';
      if (Object.keys(connus).length) h += '<div class="small lot-manques"><span>À réunir :</span>' + ingHTML(connus, { link: true }) + '</div>';
      if (manques.length > Object.keys(connus).length) h += '<p class="small why">Une ressource encore inconnue est nécessaire.</p>';
      if (!manques.length && !Object.keys(p.blocked).length && !p.locked.length && p.steps.length > 1) h += '<p class="tiny muted lot-note">Avec fabrication des pièces intermédiaires.</p>';
      return h;
    }
    function carnetLive() {
      if (Date.now() - (U.carnetP || 0) < 1000) return;
      U.carnetP = Date.now();
      if (U.carnetFilter === 'pret' || U.carnetFilter === 'craft') {
        const sig = visibleRecipes().filter(passFilter).filter((id) => !hiddenOwned(id)).sort().join('|');
        if (sig !== U.carnetFiltreSig) { U.carnetFiltreSig = sig; const l = document.getElementById('clist'); if (l) { l.innerHTML = carnetList(); iconize(l); } }
      }
      document.querySelectorAll('#v-carnet [data-carnet-lot]').forEach((el) => {
        if (!el.getClientRects().length) return;
        const id = el.dataset.carnetLot, lot = window.EclatCarnet.lot(E, D, id, cqNow()), h = carnetLotHTML(id, lot);
        const card = el.closest('.rec'), state = String(lot.n > 0 && E.orderStatus(id, lot.n).ok);
        if (card.dataset.orderState !== state) { card.outerHTML = recCard(id); iconize(document.getElementById('clist')); return; }
        if (el._lotHTML !== h) { el.innerHTML = h; el._lotHTML = h; iconize(el); }
        const rec = el.closest('.rec'), ready = lot.n > 0 && E.orderStatus(id, lot.n).ok && lot.plan.ok, badge = rec.querySelector('.badge-ready');
        rec.classList.toggle('can-craft', ready);
        if (ready && !badge) rec.querySelector('.rt').insertAdjacentHTML('beforeend', '<span class="badge-ready">⚡ Lot prêt</span>');
        else if (!ready && badge) badge.remove();
      });
    }
    function recCard(id) {
      const st = S(), it = I[id];
      if (!st.known[id]) {
        const lvl = st.hints[id] || 0;
        const ing = Object.keys(it.r[1]);
        const big = mainIngredient(id);
        const shown = nameShown(id, U.named);
        return '<div class="rec unknown" data-rec="' + id + '" data-goto="' + id + '" title="Ouvrir sa fiche : ce qu’il faut pour la trouver"><div class="rh"><span class="ic unk">?</span><div class="grow" title="Voir la recette et ses usages" data-goto="' + id + '"><div class="rt">' + (shown ? esc(it.n) : '<span class="hid">???</span>') + badgeHTML(id) + '</div><div class="tiny muted">' + esc(fxText(id)) + "</div></div></div>" +
          (it.h ? '<div class="riddle small" style="margin-top:6px">« ' + esc(it.h) + " »</div>" : "") +
          '<div class="rl tiny muted">Action : ' + (lvl >= 1 ? gesteChip(id) : "?") + " · Ressource : " + (lvl >= 2 ? '<span class="ing">' + icon(big, "sm") + esc(I[big].n) + "</span>" : "?") + " · " + ing.length + " ressource" + (ing.length > 1 ? "s" : "") + "</div></div>";
      }
      const uniq = E.isUnique(it);
      const owned = uniq && (st.made[id] || 0) > 0;
      const stars = E.stars(id);
      const lot = window.EclatCarnet.lot(E, D, id, cqNow());
      const readyCraft = !owned && lot.n > 0 && E.orderStatus(id, lot.n).ok && lot.plan.ok;
      const isNew = !owned && !(st.made[id] > 0);
      let h = '<div class="rec' + (owned ? " owned" : "") + (readyCraft ? " can-craft" : "") + '" data-order-state="' + (lot.n > 0 && E.orderStatus(id, lot.n).ok) + '" data-rec="' + id + '"><div class="rh">' + icon(id) + '<div class="grow" title="Voir la recette et ses usages" data-goto="' + id + '"><div class="rt">' + esc(it.n) + badgeHTML(id) + (isNew ? '<span class="badge badge-neuf" title="Nouvelle recette découverte">✦ Nouveau</span>' : '') + (readyCraft ? '<span class="badge-ready">⚡ Lot prêt</span>' : '') + "</div>" +
        (stars ? '<div class="stars">' + "★".repeat(stars) + "</div>" : "") + '</div>' +
        (readyCraft && cqFor(it) !== 1 ? '<button class="btn mini pri quick-make" data-cr="' + id + '" data-n="1" title="Fabriquer 1 exemplaire">⚡ +1</button>' : '') +
        '<div class="small muted" data-c="' + id + '">' + (uniq ? (owned ? "✓" : "") : fmt(st.inv[id] || 0)) + "</div>" +
        '<button class="pinb' + (st.pins[id] ? " on" : "") + '" data-pin="' + id + '" title="Épingler cette recette en haut de l’Atelier" aria-label="Épingler cette recette en haut de l’Atelier">' + (st.pins[id] ? "★" : "☆") + "</button></div>";
      const fx = fxText(id);
      if (fx) h += '<div class="fx">' + esc(fx) + (E.isScaled(it) ? ' · <span class="muted">Construits : ' + fmt(Math.floor(st.inv[id] || 0)) + "</span>" : "") + "</div>";
      else if (E.isScaled(it)) h += '<div class="tiny muted" style="margin-top:3px">Construits : ' + fmt(Math.floor(st.inv[id] || 0)) + "</div>";
      if (!owned) h += '<div class="carnet-lot" data-carnet-lot="' + id + '">' + carnetLotHTML(id) + '</div>';
      const situerBtn = arbreVisible(id) ? '<button type="button" class="btn small ghost carnet-situer" data-situer="' + id + '" title="Situer dans la Progression" aria-label="Situer dans la Progression">Progression</button>' : "";
      if (!owned) {
        const b = E.blocker(id);
        if (!E.ageOK(id)) h += '<div class="rec-foot"><div class="why">Recette conservée. Fabrication disponible : ' + esc(D.AGES[it.a].n) + '.</div>' + (situerBtn ? '<div class="acts carnet-acts">' + situerBtn + '</div>' : '') + '</div>';
        else if (b && b.why !== "owned") h += '<div class="rec-foot"><div class="why">' + cap1(needText(id, b, true)) + '</div><div class="acts carnet-acts">' + craftBtns(id) + situerBtn + '</div></div>';
        else {
          const qn = cqFor(it), lbl = "Fabriquer";
          const treeLbl = lot.n ? "Détail du lot" : "Détail de la recette";
          const canOrder = lot.n > 0 && E.orderStatus(id, lot.n).ok;
          h += '<div class="acts carnet-acts">' + (canOrder ? '<button class="btn small pri make" data-cr="' + id + '" data-n="' + qn + '" data-lbl="' + lbl + '" title="Mains et machines disponibles, pièces intermédiaires comprises">' + lbl + (qn === 1 ? "" : qn === "max" ? " Max" : " ×" + qn) + '</button>' : '') +
            '<button class="btn small ghost" data-tree="' + id + '" data-n="' + qn + '" title="Les étapes de cette commande, et ce qu’il manque" aria-label="' + treeLbl + '">Détail</button>' +
            (st.track && st.track.id === id ? '<button class="btn small ghost icon-act auto-on" data-untrack title="Ne plus suivre" aria-label="Suivi">🎯</button>' : '<button class="btn small ghost icon-act" data-track="' + id + '" title="Suivre cette recette" aria-label="Suivre">🎯</button>') +
            situerBtn + "</div>";
        }
      } else if (situerBtn) {
        h += '<div class="acts carnet-acts">' + situerBtn + '</div>';
      }
      return h + "</div>";
    }

    /* pourquoi on ne peut pas fabriquer (n fois, en chaîne ou non), en une phrase */
    function whyNot(id, n, chain) {
      const it = I[id], b = E.blocker(id);
      if (E.handInfo().full) return "Commandes au maximum. Une place se libère à la fin d’une commande.";
      if (b && b.why === "owned") return "Tu possèdes déjà " + esc(it.n) + ".";
      if (!E.ageOK(id)) return esc(it.n) + " vient d’un âge que tu n’as pas encore atteint.";
      if (b) return esc(it.n) + " : " + esc(needText(id, b)) + ".";
      const names = (m) => Object.keys(m).map((k) => fmt(m[k]) + " " + esc(I[k].n)).join(", ");
      if (chain) {
        const p = E.plan(id, n);
        const raw = {};
        for (const k in p.missing) if (!p.locked.includes(k)) raw[k] = p.missing[k];
        return (Object.keys(raw).length ? "Il manque " + names(raw) + "." : "") +
          (p.locked.length ? " Recette encore inconnue : " + p.locked.map((k) => esc(I[k].n)).join(", ") + "." : "") || "Impossible pour l’instant.";
      }
      const m = E.missingFor(id, n);
      return m ? "Il manque " + names(m) + "." : "Impossible pour l’instant.";
    }

    /* ============================================================ ACTIONS */
    function putInSlot(id) {
      const i = U.slots.indexOf(id);
      if (i >= 0) { U.slots[i] = null; }
      else {
        const free = U.slots.indexOf(null);
        if (free < 0) { toast("Établi plein. Touche un emplacement pour le vider."); return; }
        U.slots[free] = id;
      }
      A.click();
      U.anchor = '[data-inv="' + id + '"]'; U.anchorAt = performance.now();
      render(true);
    }

    function forge() {
      if(Equipped&&!U.equipmentLegacy){Equipped.forge();return;}
      A.init();
      const ids = U.slots.filter(Boolean);
      if (!ids.length) return;
      const g = U.geste;
      U.forging = true;
      const r = E.attempt(g, ids);
      U.forging = false;
      U.last = r;
      if (r.kind === "learn") r.made0 = S().made[r.id] || 0;
      if (U.fromMini) toast(resultLine(r), { key: "forge" });
      const bench = $("#bench");
      const p = elCenter($("#forge"));
      strike(g, bench, r.kind === "craft" || r.kind === "queued");
      if (r.kind === "queued") {
        A.click();
        if (bench) { bench.classList.remove("glow"); void bench.offsetWidth; bench.classList.add("glow"); }
      } else if (r.kind === "busy") {
        A.fail(0);
      } else if (r.kind === "craft") {
        A.craft(g);
        if (r.fresh) { setTimeout(() => A.discover(), 180); fete({ id: r.id, kick: "Nouvelle découverte", title: I[r.id].n, sub: fxText(r.id), tier: I[r.id].sec ? 2 : 1 }); }
        sparks(p.x, p.y - 40, r.fresh ? 26 : 12);
        vibe(r.fresh ? [10, 40, 20] : 12);
        if (bench) { bench.classList.remove("glow"); void bench.offsetWidth; bench.classList.add("glow"); }
      } else if (r.kind === "learn" || r.kind === "blocked") {
        A.fail(4); if (r.fresh) setTimeout(() => A.discover(), 150);
        // trouver la recette, c’est déjà découvrir : la fabriquer viendra après
        if (r.fresh && !I[r.id].sec) {
          vibe([10, 40, 20]);
          fete({ id: r.id, kick: "Recette trouvée", title: I[r.id].n, sub: r.kind === "blocked" ? "Inscrite dans ton Carnet. " + cap1(needText(r.id, r.info)) + "." : "Inscrite dans ton Carnet, à fabriquer quand tu veux." });
        }
      } else {
        A.fail(r.temp || 0);
        vibe(20);
        if (window.EclatAssistance?.logSessionFail) window.EclatAssistance.logSessionFail({ geste: g, msg: r.msg });
        if (bench) { bench.classList.remove("shake"); void bench.offsetWidth; bench.classList.add("shake"); }
        // « Brûlant » : la bonne combinaison, il ne manque que la chaleur
        if (r.temp === 4) {
          const th = $(".thermo .tmark") || bench;
          if (th) { const q = elCenter(th); sparks(q.x, q.y, 10, "#ff4a3c"); }
          vibe([8, 30, 8]);
        }
      }
      render(true);
    }

    /* le résultat d’un essai en une ligne (quand la carte de résultat est hors de l’écran) */
    function resultLine(r) {
      const n = (id) => "<b>" + esc(I[id].n) + "</b>";
      if (r.kind === "craft") return r.fresh ? "✨ Nouvelle découverte : " + n(r.id) : "+" + fmt(r.n) + " " + n(r.id);
      if (r.kind === "queued") return "✋ " + n(r.id) + " : fin estimée dans " + fmtTime(r.time) + ".";
      if (r.kind === "learn") return "📖 Recette trouvée : " + n(r.id) + (r.missing ? ". Il manque " + Object.keys(r.missing).map((k) => fmt(r.missing[k]) + " " + esc(I[k].n)).join(", ") + "." : ". À fabriquer quand tu veux.");
      if (r.kind === "blocked") return "🔥 " + n(r.id) + " : " + needText(r.id, r.info, true) + ".";
      if (r.kind === "owned") return "Tu possèdes déjà " + n(r.id) + ".";
      if (r.kind === "busy") return "Tes mains sont occupées.";
      if (r.kind === "fail") return "<b>" + D.TEMPS[r.temp || 0].n + "</b> · " + esc(WHY[r.why] || "") + (r.sec ? " · Une chaleur étrange : ce mélange cache quelque chose." : "");
      return "";
    }
    /* l’outil du geste s’abat sur l’établi */
    function strike(g, bench, ok) {
      const fx = $("#fx");
      if (!fx || !bench || !bench.animate) return;
      const r = bench.getBoundingClientRect();
      const el = document.createElement("div");
      el.className = "strike";
      el.innerHTML = gIc(g);
      el.style.left = r.left + r.width / 2 - 27 + "px";
      el.style.top = r.top + 38 + "px";
      fx.appendChild(el);
      const swing = ["chauffer", "electriser", "graver", "synthetiser", "transmuter", "accorder"].includes(g)
        ? [{ transform: "scale(.4)", opacity: 0 }, { transform: "scale(1.25)", opacity: 1, offset: 0.45 }, { transform: "scale(1)", opacity: 0 }]
        : [{ transform: "translate(40px,-50px) rotate(55deg)", opacity: 0 }, { transform: "translate(18px,-30px) rotate(40deg)", opacity: 1, offset: 0.3 },
          { transform: "translate(0,6px) rotate(-18deg)", opacity: 1, offset: 0.55 }, { transform: "translate(6px,-6px) rotate(-6deg)", opacity: 0 }];
      el.animate(swing, { duration: ok ? 560 : 420, easing: "ease-in" }).onfinish = () => el.remove();
    }
    function celebrate(btn, id, n, bonus) {
      const p = elCenter(btn);
      A.craft(I[id].r[0]);
      floater("+" + fmt(n) + " " + I[id].n, p.x, p.y - 16, "var(--good)");
      if (bonus) setTimeout(() => floater("★ +" + fmt(bonus), p.x, p.y - 30, "var(--intu)"), 200);
      sparks(p.x, p.y, 8);
      vibe(10);
    }
    function craftFrom(btn) {
      const id = btn.dataset.cr;
      const n = btn.dataset.n === "max" ? E.maxPlan(id) : Number(btn.dataset.n);
      if (n > 0) return handQueue(btn, id, n, true);
      openTree(id, 1);
      return false;
    }
    function chainCraft(btn, id, times) { return handQueue(btn, id, times || 1, true); }
    /* toute commande part dans la file des commandes, où mains et machines avancent ensemble */
    function handQueue(btn, id, n) {
      A.init();
      // une commande de dix exemplaires ou plus : le guide n’a plus à l’expliquer
      if (n >= 10) S().flags.cmdBig = true;
      const r = E.order(id, n);
      if (!r.ok) {
        if (["plan", "age", "geste", "heat", "lvl"].includes(r.why)) { openTree(id, n); return false; }
        A.fail(0);
        toast(r.why === "full" ? "Limite atteinte : " + D.HAND.max + " commandes au maximum." : r.why === "queued" ? esc(I[id].n) + " : déjà en cours." : whyNot(id, n, true));
        return false;
      }
      A.click();
      const p = elCenter(btn);
      floater("✋ " + fmtTime(r.time), p.x, p.y - 16, "var(--muted)");
      const missKeys = r.missing ? Object.keys(r.missing).filter((k) => r.missing[k] > 1e-9) : [];
      const sub = r.job.s.length - 1;
      if (missKeys.length) {
        const mTxt = missKeys.map((k) => fmt(Math.ceil(r.missing[k])) + " " + esc(I[k].n.toLowerCase())).join(", ");
        toast("✋ Commande lancée : <b>" + esc(I[id].n) + "</b>" + (n > 1 ? " ×" + fmt(n) : "") + " · il manque : " + mTxt + ".");
      } else if (sub > 0) {
        toast("⚡ " + esc(I[id].n) + ", avec " + sub + " pièce" + (sub > 1 ? "s" : "") + " à fabriquer avant : fin estimée dans " + fmtTime(r.time) + ".");
      }
      render(true);
      return true;
    }
    function jobWorkersTag(j) {
      const parts = [];
      if (j.hand) parts.push("✋");
      for (const m in j.machs || {}) {
        const w = j.machs[m], it = I[m];
        const lbl = it ? (w.n > 1 ? it.pl || (it.sn || it.n.toLowerCase()) + "s" : it.sn || it.n.toLowerCase()) : m;
        parts.push(w.n + " " + lbl);
      }
      return parts.join(" + ");
    }
    function jobMissTag(j) {
      const ks = Object.keys(j.miss || {}).filter((k) => j.miss[k] > 1e-9);
      if (!ks.length) return "";
      return "il manque : " + ks.map((k) => fmt(Math.ceil(j.miss[k])) + " " + I[k].n.toLowerCase()).join(", ");
    }
    /* la file de « Tes mains » : ce qui est en cours, ce qui attend */
    function handsHTML() {
      const h = E.handInfo();
      if (!h.jobs.length) return '<span class="hh">✋</span><span class="grow tiny muted">Aucune commande en cours.</span>';
      const j = h.jobs[0], it = I[j.id];
      const missTxt = jobMissTag(j);
      const what = j.paused ? '<span class="paused" style="color:var(--muted);font-weight:bold">⏸ En pause</span>'
        : missTxt ? '<span style="color:var(--bad)">' + esc(missTxt) + "</span>"
        : j.wait ? '<span style="color:var(--bad)">en attente de mains ou de machines</span>'
        : j.steps.length > 1 ? "étape " + (j.i + 1) + "/" + j.steps.length + " · " + esc(I[j.step].n) : E.isUnique(it) ? "" : fmt(j.done) + "/" + fmt(j.n);
      const pct = Math.min(100, 100 * (j.frac || 0));
      const timeTxt = j.paused ? '<span class="tiny muted" data-hl="0">⏸ En pause</span>' : '<span class="tiny muted" data-hl="0">' + fmtTime(j.left) + "</span>";
      return '<span class="hh">✋</span>' + icon(j.id, "sm") + '<div class="grow hmain" data-hopen><div class="small ell"><b>' + esc(it.n) + "</b>" + (E.isUnique(it) ? "" : " ×" + fmt(j.n)) +
        ' <span class="tiny muted">' + what + '</span></div><div class="bar"><i data-hp style="width:' + pct.toFixed(1) + '%"></i></div></div>' +
        timeTxt + (h.jobs.length > 1 ? '<button class="hmore" data-hopen title="Voir toutes les commandes">+' + (h.jobs.length - 1) + "</button>" : "") +
        '<button class="hx" data-hcancel="' + esc(j.uid || 0) + '" aria-label="Annuler" title="Annuler cette commande">✕</button>';
    }
    /* ------------------------------------------------------------ l’action qui tourne */
    function startHarvest(key) {
      A.init();
      const i = key.indexOf(":"), z = key.slice(0, i), res = key.slice(i + 1);
      if (S().act && S().act.k === "harv" && S().act.res === res && S().act.z === z) { E.stopAct(); A.click(); render(true); return; }
      if (!E.startAct({ k: "harv", z, res })) { A.fail(0); toast(esc(I[res].n) + " ne se récolte pas à la main.", { key: "act" }); return; }
      A.click();
      toast("▶ Récolte en continu : " + esc(I[res].n.toLowerCase()) + ".", { key: "act" });
      render(true);
    }
    /* la barre au-dessus des onglets : la commande en tête de file, ou la récolte continue */
    function actBar() {
      const bar = $("#actbar"), a = E.actInfo(), hi = E.handInfo();
      if (!a && !hi.jobs.length) {
        if (!bar.classList.contains("hidden")) {
          bar.classList.add("hidden");
          bar.dataset.sig = "";
          document.body.classList.remove("has-act");
          document.documentElement.style.setProperty("--actbar-h", "0px");
        }
        return;
      }
      bar.classList.remove("hidden");
      document.body.classList.add("has-act");
      const h = bar.offsetHeight || 52;
      document.documentElement.style.setProperty("--actbar-h", h + "px");
      requestAnimationFrame(() => {
        const h2 = bar.offsetHeight;
        if (h2 && h2 !== h) document.documentElement.style.setProperty("--actbar-h", h2 + "px");
      });
      let sig, frac, line;
      if (hi.jobs.length) {
        const j = hi.jobs[0], w = jobWorkersTag(j), miss = jobMissTag(j);
        sig = "j:" + (j.uid || j.id) + ":" + (j.paused ? "p" : "a") + ":" + j.n + ":" + w + ":" + miss + ":" + hi.jobs.length + (a ? ":h" : "");
        frac = j.frac !== undefined ? j.frac : (j.tot ? 1 - (j.left || 0) / j.tot : 0);
        line = j.paused ? "⏸ En pause" : (E.isUnique(I[j.id]) ? fmtTime(j.left) : fmt(j.done) + "/" + fmt(j.n) + (miss ? " · " + miss : ""));
      } else {
        sig = "h:" + a.z + ":" + a.res; frac = a.frac; line = "+" + fmt(a.got);
      }
      if (bar.dataset.sig !== sig) {
        bar.dataset.sig = sig;
        let ic, name;
        if (hi.jobs.length) {
          const j = hi.jobs[0], w = jobWorkersTag(j);
          ic = icon(j.id, "sm");
          name = "Commande · " + esc(I[j.id].n) + (E.isUnique(I[j.id]) ? "" : " ×" + fmt(j.n)) +
            (j.paused ? ' <span class="tiny" style="color:var(--muted)">[⏸ En pause]</span>' : "") +
            (w ? " · " + esc(w) : "") +
            (hi.jobs.length > 1 ? ' <span class="tiny muted">+' + (hi.jobs.length - 1) + "</span>" : "");
        } else {
          ic = icon(a.res, "sm");
          name = "Récolte · " + esc(I[a.res].n);
        }
        bar.innerHTML = '<button class="ab-main" data-ab="' + (hi.jobs.length ? "hands" : "harvest") + '" aria-label="' + (hi.jobs.length ? "Voir les commandes en cours" : "Voir le gisement : " + esc(I[a.res].n)) + '">' + ic + '<span class="ab-t"><span class="ab-n">' + name + '</span><span class="ab-bar"><i></i></span></span><b class="ab-c"></b></button>' +
          (a ? '<button class="ab-x" data-ab="stop" aria-label="Arrêter la récolte : ' + esc(I[a.res].n) + '">■</button>' : "");
        iconize(bar);
      }
      bar.querySelector(".ab-bar i").style.width = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + "%";
      bar.querySelector(".ab-c").textContent = line;
    }
    /* les gestes et la récolte : niveaux, ce qu’ils donnent, le prochain palier */
    function skillName(g) { return g === "recolte" ? D.SKILL_RECOLTE.n : D.GESTES[g].n; }
    function skillsHTML() {
      const st = S();
      const shown = E.SKILLS.filter((g) => g === "recolte" || E.gesteOK(g) || (st.skills[g] || 0) > 0);
      return '<div class="kicker">Tes mains</div><h2>Gestes et récolte</h2><p class="small muted">Fabriquer à la main et récolter rapportent de l’expérience dans le geste correspondant. Chaque niveau rend le geste 1 % plus rapide (pour la récolte : 1 % de ressources en plus). Aux niveaux ' + D.SKILL.perks.join(", ") + ", tu gagnes une chance d’avoir une pièce en plus. À la relève, tu gardes un dixième de ta progression.</p>" +
        '<div class="skills">' + shown.map((g) => {
          const k = E.skill(g);
          return '<div class="skill"><span class="sk-ic">' + (g === "recolte" ? gi(GI.ui && GI.ui.recolte || "sickle") : gIc(g)) + '</span><div class="grow"><div class="row between"><b>' + esc(skillName(g)) + '</b><span class="sk-l">niv. ' + k.lvl + "</span></div>" +
            '<div class="bar"><i style="width:' + (k.frac * 100).toFixed(1) + '%"></i></div><div class="tiny muted">' + (k.lvl < D.SKILL.max ? fmt(k.hi - k.xp) + " d’expérience avant le niveau " + (k.lvl + 1) : "Niveau maximal") +
            (k.perks ? " · pièce en plus : " + Math.round(E.perkChance(g) * 100) + " %" : "") + (k.next ? " · palier au niveau " + k.next : "") + "</div></div></div>";
        }).join("") + '</div><div class="acts"><button class="btn pri" data-m="close">Fermer</button></div>';
    }
    function openSkills() { openModal({ html: skillsHTML() }); }
    /* la liste des commandes en détail : ce qui est en cours, qui y travaille, ce qui manque, et de quoi annuler */
    function handsSheet() {
      const hi = E.handInfo();
      const aideBtn = '<button type="button" class="btn-aide mini" data-aide="commandes" title="Comprendre les commandes et réservations" aria-label="Comprendre les commandes et réservations">?</button>';
      if (!hi.jobs.length) return '<div class="kicker">Commandes ' + aideBtn + '</div><h2>Aucune commande en cours</h2><div class="acts"><button class="btn pri" data-m="close">Fermer</button></div>';
      const activeJobs = hi.jobs.filter((j) => !j.paused);
      const title = hi.left > 0 ? "Fin estimée dans ~" + fmtTime(hi.left) : (activeJobs.length === 0 ? "Toutes les commandes sont en pause" : "Commandes en cours");
      return '<div class="kicker">Commandes ' + aideBtn + '</div><h2>' + title + '</h2><div class="picklist">' +
        hi.jobs.map((j, i) => {
          const w = jobWorkersTag(j), miss = jobMissTag(j);
          const sub = [];
          if (j.paused) sub.push("en pause · libère les mains et les machines");
          else {
            if (w) sub.push(w);
            if (miss) sub.push(miss);
            else if (j.wait) sub.push("en attente de mains ou de machines");
            else sub.push("fin estimée dans ~" + fmtTime(i ? j.at : j.left));
          }
          // ce qui bloque : d’où vient la ressource qui manque, et un accès à son gisement
          const lim = Object.keys(j.miss || {}).filter((k) => j.miss[k] > 1e-9).slice(0, 2).map((k) => limitHTML(k, j.miss[k])).join("");
          const pausedBadge = j.paused ? ' <span class="badge paused" style="color:var(--muted);font-weight:bold">[⏸ En pause]</span>' : "";
          const prioBtn = i > 0 ? '<button class="mini" data-m="hprio" data-uid="' + esc(j.uid) + '" title="Passer en tête de file" aria-label="Passer en priorité : ' + esc(I[j.id].n) + '">⭡ Priorité</button>' : "";
          const pauseBtn = '<button class="mini" data-m="hpause" data-uid="' + esc(j.uid) + '" title="' + (j.paused ? "Reprendre cette commande" : "Mettre en pause cette commande") + '" aria-label="' + (j.paused ? "Reprendre : " : "Mettre en pause : ") + esc(I[j.id].n) + '">' + (j.paused ? "▶ Reprendre" : "⏸ Pause") + '</button>';
          const cancelBtn = '<button class="mini" data-m="hc" data-uid="' + esc(j.uid) + '" data-i="' + i + '" title="Annuler cette commande" aria-label="Annuler : ' + esc(I[j.id].n) + '">✕</button>';
          return '<div class="pick' + (j.paused ? " paused" : "") + '" data-jid="' + esc(j.uid) + '">' + icon(j.id, "sm") + '<span class="grow"><b>' + esc(I[j.id].n) + '</b>' + (E.isUnique(I[j.id]) ? "" : " ×" + fmt(j.n) + " (" + fmt(j.done) + "/" + fmt(j.n) + ")") + pausedBadge +
            '<br><span class="tiny muted">' + esc(sub.join(" · ")) + "</span>" + lim + "</span>" +
            '<div class="pick-acts row gap" style="align-items:center;gap:4px">' + prioBtn + pauseBtn + cancelBtn + '</div></div>';
        }).join("") +
        '</div>' +
        (() => {
          const sugRel = E.shouldSuggestReleve && E.shouldSuggestReleve();
          if (!sugRel) return '';
          return '<div class="card acc releve-alerte" style="margin-top:10px;border-left:3px solid var(--acc)"><div class="small"><b>⏳ Commandes lentes :</b> ce Semeur approche du bout de son éveil. Passer le relais (+' + sugRel.gain + ' ✦) accélérera tes futures fabrications.</div><button class="btn pri small" style="margin-top:6px" data-m="releve">Passer le relais (+' + sugRel.gain + ' ✦)</button></div>';
        })() +
        '<p class="tiny muted">Annuler une commande rend ses ressources réservées à la Réserve.</p><div class="acts"><button class="btn pri" data-m="close">Fermer</button></div>';
    }
    function openHands() {
      openModal({
        html: handsSheet(), refresh: handsSheet,
        on: {
          hprio: (b) => {
            const uid = b.dataset.uid;
            if (E.prioritizeJob(uid)) { A.click(); toast("Commande passée en priorité."); }
            const box = $("#modal .modal-box");
            box.innerHTML = handsSheet(); iconize(box);
            render(true);
            return true;
          },
          hpause: (b) => {
            const uid = b.dataset.uid;
            const res = E.togglePauseJob(uid);
            if (res !== null) { A.click(); toast(res ? "Commande mise en pause." : "Commande reprise."); }
            const box = $("#modal .modal-box");
            box.innerHTML = handsSheet(); iconize(box);
            render(true);
            return true;
          },
          hc: (b) => {
            const target = b.dataset.uid || Number(b.dataset.i);
            const j = E.findJob(target);
            const name = j ? I[j.id].n : "Commande";
            if (E.cancelJob(target)) { A.click(); toast("Commande annulée : " + esc(name) + ". Ressources restituées."); }
            const box = $("#modal .modal-box");
            box.innerHTML = handsSheet(); iconize(box);
            render(true);
            return true;
          }
        }
      });
    }
    const handSig = () => S().hand.q.map((j) => j.id + ":" + j.i + ":" + j.k + ":" + (j.paused ? "p" : "a") + ":" + (j.w ? 1 : 0) + ":" + JSON.stringify(j.miss)).join("|");
    function studyHTML(id) {
      const st = S();
      const aideBtn = '<button type="button" class="btn-aide mini" data-aide="etude" title="Comprendre l’étude des matières" aria-label="Comprendre l’étude des matières">?</button>';
      if (!st.studied[id]) {
        const c = E.studyCost(id);
        return '<div class="study"><button class="btn small" data-m="study"' + (st.intu < c ? " disabled" : "") + ">🔍 Étudier · ✨" + c + '</button>' + aideBtn + '<span class="tiny muted">Pour savoir avec quelles actions la tenter.</span></div>';
      }
      const r = E.reactions(id), gs = D.GESTE_ORDER.filter((g) => r[g]);
      return '<div class="study"><span class="tiny muted">🔍 Étudiée.</span> ' + aideBtn + ' ' + (gs.length ? '<span class="tiny muted">Encore à trouver :</span> ' + gs.map((g) => '<span class="g">' + gIc(g) + " " + D.GESTES[g].n + " · " + r[g] + "</span>").join(" ")
        : '<span class="tiny muted">Rien de plus à tenter avec tes actions et tes ressources, pour l’instant.</span>') + "</div>";
    }
    /* Chemin complet vers une cible : échelle verticale des marches, de la plus profonde à la cible. */
    function treeHTML(id, n) {
      const times = Math.max(1, n || 1);
      const r = Arb && Arb.route ? Arb.route(E, D, id, times) : null;
      if (!r) return '<p class="small muted">Chemin introuvable.</p>';
      const st = S();
      let h = '<div class="kicker">Chemin vers la cible</div><div class="row items-center">' +
        (r.cible.anon ? '<span class="arb-inconnu" aria-hidden="true" style="font-size:20px;width:40px;height:40px">?</span>' : icon(id, "lg")) +
        '<div class="grow"><h2 style="margin:0">' + esc(r.cible.nom) + "</h2>" +
        '<div class="arb-chemin-prog"><span>' + r.compte.faites + ' / ' + r.compte.total + ' marches franchies</span>' +
        '<span>' + (r.pret ? '✓ Prêt' : 'En préparation') + '</span></div></div></div>';

      if (I[id] && !E.isUnique(I[id]) && !r.cible.anon) {
        h += '<div class="row" style="margin-top:6px"><button class="mini" data-m="tn" data-d="-1" title="Un de moins">−</button>' +
          '<b style="min-width:40px;text-align:center">×' + fmt(times) + '</b>' +
          '<button class="mini" data-m="tn" data-d="1" title="Un de plus">+</button>' +
          '<button class="btn small ghost" data-m="tmax" title="Nombre maximum selon la Réserve">Max</button></div>';
      }

      h += '<div class="arb-echelle" role="list" aria-label="Marches vers la cible">';
      r.marches.forEach((m, idx) => {
        const num = idx + 1;
        const isCible = !!m.isTarget;
        const etatLabel = m.etat === "fait" ? "Fait" : m.etat === "en_cours" ? "En cours" : m.etat === "a_trouver" ? "À trouver" : "Bloquée";
        h += '<div class="arb-marche ' + m.etat + (isCible ? ' cible' : '') + '" role="listitem">' +
          '<div class="arb-marche-rail"><span class="arb-marche-num">' + (m.etat === "fait" ? "✓" : num) + '</span></div>' +
          '<div class="arb-marche-corps"><div class="arb-marche-entete">' +
          (m.anon ? '<span class="arb-inconnu" aria-hidden="true" style="width:24px;height:24px;font-size:14px">?</span>' : icon(m.id, "sm")) +
          '<span class="arb-marche-nom">' + esc(m.nom) + '</span>' +
          (m.quantite > 1 ? '<span class="muted small">×' + fmt(m.quantite) + '</span>' : '') +
          '<span class="arb-badge ' + m.etat + '">' + etatLabel + '</span></div>';

        if (m.requis) {
          h += '<div class="arb-marche-requis">' + esc(m.requis) + '</div>';
        } else if (m.type === "res" && m.etat !== "fait" && !m.anon) {
          h += '<div class="arb-marche-manque">En stock : ' + fmt(m.enStock) + ' / ' + fmt(m.quantite) + '</div>';
        } else if (m.type === "craft" && m.etat !== "fait" && !m.anon) {
          h += '<div class="arb-marche-manque">Possédé : ' + fmt(m.enStock) + ' / ' + fmt(m.quantite) + '</div>';
        }
        h += '</div><div class="arb-marche-act">';

        if (m.action === "fabriquer") {
          const ready = m.id && S().known[m.id] && !E.blocker(m.id) && E.missingFor(m.id, 1) === null;
          h += '<button type="button" class="btn small' + (ready ? ' pri' : '') + '" data-ch-craft="' + esc(m.id) + '"' + (ready ? '' : ' disabled') + ' title="' + (ready ? 'Fabriquer immédiatement' : 'Ingrédients manquants') + '">Fabriquer</button>';
        } else if (m.action === "recolter") {
          h += '<button type="button" class="btn small" data-ch-harv="' + esc(m.id) + '" title="Récolter cette ressource">Récolter</button>';
        } else if (m.action === "voir") {
          if (m.anon) {
            h += '<button type="button" class="btn small ghost" data-ch-atelier="1" title="Découvrir cette recette à l’Atelier">Atelier</button>';
          } else if (I[m.id] && I[m.id].r) {
            h += '<button type="button" class="btn small ghost" data-ch-voir="' + esc(m.id) + '" title="Voir la recette dans le Carnet">Voir</button>';
          } else {
            h += '<button type="button" class="btn small ghost" data-goto="' + esc(m.id) + '" title="Voir la fiche">Fiche</button>';
          }
        }
        h += '</div></div>';
      });
      h += '</div>';

      h += '<div class="arb-chemin-pied acts"><button class="btn" data-m="close">Fermer</button>' +
        (st.track && st.track.id === id ? '<button class="btn ghost" data-m="untrack" title="Ne plus suivre cet objet">Ne plus suivre</button>' : '<button class="btn" data-m="track" title="Suivre cet objet en haut des Terres">🎯 Suivre</button>') +
        '<button class="btn pri" data-m="go"' + (r.peutToutFabriquer ? '' : ' disabled') + ' title="Lancer la fabrication en chaîne de toutes les étapes">⚡ Tout fabriquer (×' + fmt(times) + ')</button></div>';
      return h;
    }
    function openTree(id, n) {
      let times = Math.max(1, n || 1);
      U.cheminId = id;
      U.cheminTimes = times;
      const renderChemin = () => {
        U.cheminTimes = times;
        const box = document.querySelector("#modal .modal-box");
        if (box) { box.innerHTML = treeHTML(id, times); iconize(box); }
      };
      swapModal({
        html: treeHTML(id, times),
        cls: "arb-chemin-modal",
        on: {
          tn: (b) => { times = Math.max(1, times + Number(b.dataset.d) * (times >= 100 ? 10 : 1)); renderChemin(); return true; },
          tmax: () => { times = Math.max(1, E.maxPlan(id)); renderChemin(); return true; },
          track: () => { E.setTrack(id); toast("🎯 Suivi : <b>" + esc(I[id] ? I[id].n : "Objet") + "</b> (en haut des Terres)"); render(true); renderChemin(); return true; },
          untrack: () => { E.setTrack(null); render(true); renderChemin(); return true; },
          go: (b) => { if (chainCraft(b, id, times) !== false) closeModal(); return true; }
        }
      });
    }

    /* Aller à la recette d’un objet dans le Carnet (ou à sa zone s’il se récolte). */
    /* ------------------------------------------------------------ fenêtres de recettes
     * Toucher un objet ouvre sa fiche ; ses ingrédients, ce qu’il sert à fabriquer
     * et sa station sont cliquables. ← revient à la fiche précédente. */
    function goto(id) {
      if (!I[id]) return;
      // Curiosité : Anneau sans fard
      if (id === "anneau_lourd" && E.count("anneau_lourd") > 0) {
        E.take("anneau_lourd", E.count("anneau_lourd"));
        E.addCurio("anneau");
        toast("Il est très lourd pour sa taille. Tu le reposes.");
        render(true);
        return;
      }
      // Curiosité : Dé à vingt faces
      if (id === "de_vingt") {
        const st = S();
        st.meta = st.meta || {};
        st.meta.d20Rolls = (st.meta.d20Rolls || 0) + 1;
        const roll = st.meta.d20Rolls === 1 ? 20 : (Math.floor(Math.random() * 20) + 1);
        toast("🎲 Tu le lances : " + roll + ".");
      }
      // Curiosité : WTC (Antoine Daniel) - 10 ouvertures en moins de 20s
      const now = Date.now();
      if (U.inspectHist && U.inspectHist.id === id) {
        U.inspectHist.times = U.inspectHist.times.filter((t) => now - t <= 20000);
        U.inspectHist.times.push(now);
        if (U.inspectHist.times.length >= 10) {
          if (E.addCurio("wtc")) {
            U.wtcItalic = true;
          }
        }
      } else {
        U.inspectHist = { id, times: [now] };
      }
      U.rstack = [id];
      swapModal(recipeModal());
    }
    function recipeNav(id) {
      if (!I[id]) return;
      U.rstack = (U.rstack || []).concat(id).slice(-30);
      A.page();
      swapModal(recipeModal());
    }
    const recHere = () => (U.rstack && U.rstack.length ? U.rstack[U.rstack.length - 1] : null);
    function recipeModal() {
      const id = recHere(), it = I[id], st = S();
      const known = !!st.known[id], visible = known || visibleRecipes().includes(id) || !it.r;
      const uniq = E.isUnique(it), owned = uniq && (st.made[id] || 0) > 0;
      const nav = (k, extra) => '<button class="ing link" data-m="nav" data-id="' + k + '" title="Ouvrir sa fiche">' + (st.seen[k] || st.known[k] ? icon(k, "sm") : '<span class="ic sm unk">?</span>') + esc(I[k].n) + (extra || "") + "</button>";
      const isWtcItalic = U.wtcItalic;
      if (isWtcItalic) U.wtcItalic = false;
      let h = '<div class="rwin"' + (isWtcItalic ? ' style="font-style:italic"' : "") + '><div class="row">' + (known || !it.r || st.seen[id] ? icon(id, "lg") : '<span class="ic lg unk">?</span>') +
        '<div class="grow"><div class="kicker">' + TYPE[it.t] + (D.AGES[it.a] ? " · " + esc(D.AGES[it.a].n) : "") + "</div><h2 style=\"margin:0\">" + (nameShown(id) ? esc(it.n) : "Recette inconnue") + "</h2>" +
        (E.stars(id) ? '<div class="stars" title="Maîtrise : fabriqué ' + fmt(st.made[id] || 0) + ' fois">' + "★".repeat(E.stars(id)) + ' <span class="tiny muted">maîtrise</span></div>' : "") + "</div>" +
        (!uniq && !E.isScaled(it) && (st.inv[id] || 0) > 0 ? '<button class="pinb fav' + (favs()[id] ? " on" : "") + '" data-m="fav" aria-label="Ressource favorite" title="Ressource favorite (en tête de liste à l’Atelier)">' + (favs()[id] ? "♥" : "♡") + "</button>" : "") +
        (it.r && known ? '<button class="pinb' + (st.pins[id] ? " on" : "") + '" data-m="pin" aria-label="Épingler la recette en haut de l’Atelier" title="Épingler la recette en haut de l’Atelier">' + (st.pins[id] ? "★" : "☆") + "</button>" : "") + "</div>";
      if (!visible) {
        h += '<p class="small muted">Un objet d’un âge que tu n’as pas encore atteint. Avance dans le jeu pour en savoir plus.</p>';
      } else {
        // d’abord ce que fait l’objet (la couche « jeu »), puis le récit, à part
        if (known || !it.r) {
          if (it.u) h += '<p class="small">' + esc(it.u) + "</p>";
          else if (TYPE_HINT[it.t]) h += '<p class="tiny muted">' + TYPE_HINT[it.t] + "</p>";
          if (it.d) h += '<p class="serif rdesc"><i>' + esc(itD(it)) + "</i></p>";
        }
        // l’effet en vert, sauf ce que la ligne « jeu » dit déjà
        const plain = (t) => t.toLowerCase().replace(/[^a-zà-ÿ0-9]+/g, " ").trim();
        const fx = fxList(id).filter((f) => !(it.u && plain(it.u).includes(plain(f))));
        if (fx.length) h += '<p class="small" style="color:var(--good)">' + esc(fx.join(" · ")) + "</p>";
        const f = E.flows();
        const inR = E.rate(id) + (f.prod[id] || 0);
        const outR = f.cons[id] || 0;
        const netR = inR - outR;
        let flowInfo = "";
        if (inR > 1e-4 || outR > 1e-4) {
          const netStr = (netR > 1e-4 ? "+" : netR < -1e-4 ? "-" : "") + perMin(Math.abs(netR));
          const color = netR > 1e-4 ? "var(--good)" : netR < -1e-4 ? "var(--bad)" : "var(--muted)";
          flowInfo = ' · Solde : <b style="color:' + color + '">' + netStr + "</b>" +
            (inR > 1e-4 && outR > 1e-4 ? ' <span class="tiny muted">(+' + perMin(inR) + " / -" + perMin(outR) + ")</span>" : "");
        }
        h += '<p class="small muted">' + (uniq ? (owned ? "Tu le possèdes." : "Tu ne l’as pas encore.") : "Tu en as <b>" + fmt(st.inv[id] || 0) + "</b>" + flowInfo) + "</p>";
        const zid = E.RES_ZONE[id];
        if (zid) h += '<div class="row wrap small">Se récolte dans : <button class="ing link" data-m="zone" data-z="' + zid + '">' + (GI.zones && GI.zones[zid] ? gi(GI.zones[zid]) : E.ZONES[zid].ic) + " " + esc(zoneName(zid)) + "</button>" +
          (E.zoneOpen(zid) ? "" : ' <span class="tiny muted">(terre pas encore atteinte)</span>') + "</div>";
        if (it.r) {
          h += '<h3 class="sub">Recette</h3>';
          if (known) {
            const cost = E.costFor(id);
            h += '<div class="rrow">' + gesteChip(id) + '<span class="muted">donne ' + fmt(it.r[2]) + "</span></div>" +
              '<div class="rings">' + Object.keys(cost).map((k) => {
                const have = st.inv[k] || 0, lack = have + 1e-9 < cost[k];
                const ok = !lack;
                const canMake = lack && I[k].r && E.plan(k, Math.ceil(cost[k] - have)).ok;
                return '<button class="ring ' + (ok ? "ok" : "lack") + '" data-m="nav" data-id="' + k + '" title="Ouvrir sa fiche : ce qu’il faut, et ce que tu as">' + icon(k, "sm") +
                  '<span class="grow">' + esc(I[k].n) + (canMake ? ' <span class="can-make">(prêt à fabriquer)</span>' : "") + '</span>' +
                  '<span class="tiny">' + fmt(have) + " / " + fmt(cost[k]) + (ok ? " ✓" : "") + '</span><span class="go">›</span></button>';
              }).join("") + "</div>";
            const b = E.blocker(id), opt = it.r[3] || {};
            const station = b && b.why === "heat" ? E.stationFor("chauffer", b.heat, 0) : b && b.why === "lvl" ? E.stationFor(it.r[0], 0, b.lvl) : b && b.why === "geste" && it.r[0] !== "accorder" ? E.stationFor(it.r[0], 0, 0) : null;
            if (b && b.why !== "owned") h += '<p class="why">' + (station ? "Il faut d’abord : " + nav(station) + (b.why === "heat" ? " (" + fmtHeat(b.heat) + ")" : "") : cap1(needText(id, b))) + "</p>";
            else if (opt.heat || opt.lvl) {
              const sta = opt.heat ? E.stationFor("chauffer", opt.heat, 0) : E.stationFor(it.r[0], 0, opt.lvl);
              if (sta) h += '<p class="tiny muted">Station : ' + nav(sta) + (S().made[sta] || E.count(sta) >= 1 ? " ✓ tu l’as" : "") + "</p>";
            }
            if (E.automatable(id)) {
              const mneed = E.machFor(id);
              if (mneed && I[mneed]) {
                const pm = E.projectMachineOnRecipe ? E.projectMachineOnRecipe(mneed, id) : null;
                const compTxt = pm ? ' · ' + fmtTime(pm.hTime) + ' aux mains → <b>' + fmtTime(pm.mTime) + ' en machine</b> (~' + fmtNum(pm.ratePerMin) + '/min)' : '';
                h += '<p class="small muted">Machine : ' + esc(I[mneed].n) + " ou mieux" + compTxt + ' <span class="tiny dim">(dès qu’une machine libre y est affectée)</span></p>';
              }
            }
            if (it.t === "ext") {
              const ez = it.z || (E.extZones && E.extZones(id) && E.extZones(id)[0]);
              const eres = Object.keys(it.p || {})[0];
              if (ez && eres && E.zoneOpen(ez) && E.projectExtractor) {
                const pe = E.projectExtractor(ez, eres, id, 1);
                h += '<div class="card proj-box" style="margin:8px 0;padding:8px 10px;background:var(--bg-card,rgba(255,255,255,0.04));border-radius:6px">' +
                  '<div class="tiny kicker" style="color:var(--pri)">Bénéfice mesuré · ' + esc(E.ZONES[ez].n) + '</div>' +
                  '<div class="small"><b>' + esc(I[eres].n) + '</b> : débit actuel ' + perTime(pe.curRate) + ' → <b>' + perTime(pe.projRate) + '</b> (+' + perTime(pe.gainRate) + ')</div>' +
                  (E.isScaled(it) ? '<div class="tiny muted">Coût réel pour le ' + fmt(E.count(id) + 1) + 'e exemplaire (croissance d’échelle incluse).</div>' : '') +
                  '</div>';
              }
            }
            if (it.t === "tool" && E.projectToolBenefit) {
              const tb = E.projectToolBenefit(id);
              if (tb && tb.list && tb.list.length) {
                h += '<div class="card proj-box" style="margin:8px 0;padding:8px 10px;background:var(--bg-card,rgba(255,255,255,0.04));border-radius:6px">' +
                  '<div class="tiny kicker" style="color:var(--pri)">Bénéfice mesuré</div>' +
                  tb.list.map((b) => {
                    if (b.curT !== undefined && b.projT !== undefined) {
                      return '<div class="small">' + esc(b.n || b.recipe) + ' : <b>' + fmtTime(b.curT) + ' → ' + fmtTime(b.projT) + '</b> (' + b.mult + '× plus vite)</div>';
                    }
                    return '<div class="small">' + esc(b.label) + ' : <b>×' + b.mult + '</b></div>';
                  }).join("") +
                  '</div>';
              }
            }
            if (it.t === "mach") {
              h += '<div class="card proj-box" style="margin:8px 0;padding:8px 10px;background:var(--bg-card,rgba(255,255,255,0.04));border-radius:6px">' +
                '<div class="tiny kicker" style="color:var(--pri)">Capacité de la machine</div>' +
                '<div class="small">Automatise les recettes à ' + it.ing + ' ingrédient' + (it.ing > 1 ? 's' : '') + ' au plus · <b>' + fmtNum(it.spd) + ' op/min</b> dès qu’une commande lui est confiée.</div>' +
                (E.isScaled(it) ? '<div class="tiny muted">Coût réel pour le ' + fmt(E.count(id) + 1) + 'e exemplaire (croissance d’échelle incluse).</div>' : '') +
                '</div>';
            }
            if (!owned) {
              h += '<div class="row wrap rbtns">' + craftBtns(id).replace(/data-cr=/g, 'data-m="cr" data-cr=') +
                '<button class="btn small ghost" data-m="tree" title="Détail : les étapes de la commande et ce qu’il manque">🌳 Détail</button>' + (st.track && st.track.id === id ? "" : '<button class="btn small ghost" data-m="track" title="Suivre : ce qui manque s’affiche en haut des Terres, avec le temps estimé">🎯 Suivre</button>') + "</div>";
            }
          } else {
            const lvl = st.hints[id] || 0, big = mainIngredient(id), n = Object.keys(it.r[1]).length;
            if (it.h) h += '<div class="riddle small">« ' + esc(it.h) + " »</div>";
            h += '<p class="small muted">Action : ' + (lvl >= 1 ? gesteChip(id) : "?") + " · " + n + " ressource" + (n > 1 ? "s" : "") + (lvl >= 2 ? " dont " + nav(big) : "") + "</p>";
            const dc = E.decipherCost(id);
            if (dc !== null) {
              const rev = ["Révèle le geste.", "Révèle une des ressources.", "Révèle la recette entière."][lvl];
              const ok = st.intu >= dc;
              h += '<div class="decipher"><button class="btn small' + (ok ? " pri" : "") + '" data-m="decipher"' + (ok ? "" : " disabled") + ">✨ Déchiffrer : " + dc + " ✨</button>" +
                '<div class="tiny muted">' + rev + (ok ? "" : " Pas assez d’Intuition (tu as " + fmt(Math.floor(st.intu)) + " ✨).") + "</div></div>";
            }
            const m = E.memory();
            if (m && m.id === id) h += memoryHTML(m);
            else h += '<p class="tiny muted">À toi de la trouver à l’Atelier. Étudier les ressources aide à savoir quoi tenter.</p>';
          }
        }
        const uses = Object.keys(I).filter((k) => I[k].r && I[k].r[1][id] !== undefined);
        const ku = uses.filter((k) => st.known[k]), unk = uses.length - ku.length;
        if (uses.length) {
          // à ta portée : le geste maîtrisé et toutes les matières déjà vues ; les autres viendront plus tard
          const now = Object.values(E.reactions(id)).reduce((a, b) => a + b, 0), later = unk - now;
          const unkTxt = (now ? now + " à trouver dès maintenant" : "") + (now && later ? ", " : "") + (later ? later + " plus tard" : "");
          h += '<h3 class="sub">Sert à fabriquer</h3><div class="row wrap">' + ku.map((k) => nav(k)).join("") +
            (unk ? '<span class="tiny muted">' + (ku.length ? "et d’autres recettes encore inconnues : " : "Recettes encore inconnues : ") + unkTxt + "</span>" : "") + "</div>";
          if (unk && st.seen[id]) h += studyHTML(id);
        }
      }
      if (E.hasCurio && E.hasCurio("wtc")) {
        h += '<p class="small muted center" style="font-style:italic">« On coupe ? »</p>';
      }
      const back = U.rstack.length > 1;
      h += '<div class="acts">' + (back ? '<button class="btn" data-m="back">← ' + esc(I[U.rstack[U.rstack.length - 2]].n) + "</button>" : U.rfrom ? '<button class="btn" data-m="rfrom">← Retour</button>' : "") +
        (it.r && known ? '<button class="btn ghost" data-m="carnet" title="Voir sa recette dans le Carnet">📖 Carnet</button>' : "") + (known && arbreVisible(id) ? '<button class="btn ghost" data-m="arbre" title="Voir ses ingrédients et ses usages dans la Progression">🌳 Voir dans la Progression</button>' : "") + '<button class="btn pri" data-m="close">Fermer</button></div></div>';
      const redraw = () => { if (U.mcur && U.mcur.rec) swapModal(recipeModal()); };
      return {
        rec: true,
        html: h,
        onClose: () => { U.rstack = []; },
        on: {
          nav: (b) => { recipeNav(b.dataset.id); return true; },
          back: () => { U.rstack.pop(); A.page(); swapModal(recipeModal()); return true; },
          rfrom: () => { const f = U.rfrom; U.rfrom = null; closeModal(); if (f) setTimeout(f, 80); return true; },
          zone: (b) => { const z = b.dataset.z; if (E.zoneOpen(z)) { U.zone = z; setTimeout(() => { setTab("domaine"); Dom.focusZone(z); }, 60); } else { toast("Terre non atteinte."); return true; } },
          cr: (b) => { if (craftFrom(b) !== false) redraw(); return true; },
          chain: (b) => { const r = E.plan(id, 1); if (!r.ok) { setTimeout(() => openTree(id, 1), 60); return; } chainCraft(b, id, 1); redraw(); return true; },
          tree: () => { setTimeout(() => openTree(id, 1), 60); },
          track: () => { E.setTrack(id); A.click(); toast("🎯 Suivi : <b>" + esc(it.n) + "</b> (en haut des Terres)"); redraw(); return true; },
          pin: () => { E.togglePin(id); A.click(); redraw(); return true; },
          fav: () => { const f = favs(); if (f[id]) delete f[id]; else f[id] = 1; A.click(); redraw(); if (U.tab === "atelier" || U.tab === "labo") render(true); return true; },
          study: () => { if (E.study(id)) { A.discover(); if (U.tab === "atelier" || U.tab === "labo") render(true); } redraw(); return true; },
          decipher: () => { const r = E.decipher(id); if (r.ok) { if (r.lvl >= 3) A.discover(); save(); render(true); } redraw(); return true; },
          carnet: () => { setTimeout(() => showInCarnet(id), 60); },
          arbre: () => { setTimeout(() => arbreOuvrir(id), 60); }
        }
      };
    }

    /* ------------------------------------------------------------ L’ATELIER (production, 0.39)
     * Quoi produire, en quelle quantité, et qui s’en charge : les mains, un apprenti (un ordre
     * permanent avec une cible en Réserve) ou une machine. Aucun établi ici : il est au Labo. */
    const PROD_ETAT = { ok: "produit", full: "plein", starved: "attend une matière", nomach: "pas de machine capable", busy: "attend un travailleur", off: "en pause" };
    function prodRecettes() {
      const st = S(), pin = st.pins || {};
      const sel = Atel && U.atelierSel;
      const ids = Object.keys(st.known).filter((id) => (!sel || Atel.famille(id) === sel) && I[id] && I[id].r && !I[id].sec && !I[id].path && !I[id].old && !E.isUnique(I[id]) && !E.isScaled(I[id]));
      const can = (id) => (E.maxCraftable(id, 1000) > 0 ? 1 : 0);
      ids.sort((a, b) => can(b) - can(a) || (pin[b] ? 1 : 0) - (pin[a] ? 1 : 0) || I[b].a - I[a].a || I[a].n.localeCompare(I[b].n));
      return ids;
    }
    function prodQty(id) {
      const m = U.prodQty || "1";
      if (m === "max") return Math.max(1, Math.floor(E.maxCraftable(id, 1000)) || 1);
      return Number(m) || 1;
    }
    function prodWhy(id) {
      const ap = E.apprentis();
      if (ap.ordres.some((o) => o.id === id)) return "";
      if (!E.automatable(id)) return "Cette pièce ne peut pas encore être confiée.";
      if (!E.cadenceEligible().includes(id)) return E.machFor(id) ? "Fabrique-la d’abord une fois à la main, ou attends une machine libre." : "Il faut une machine capable de la fabriquer.";
      return "";
    }
    /* L'en-tête des trois pages de l'Atelier (Produire, Carnet, Machines) : les mêmes sous-onglets, le même titre */
    function enteteAtelier(titre, sous) {
      return subTabs("atelier", "carnet", "machines", "Produire", "Carnet", "Machines") +
        '<header class="atl-titre"><h2>' + esc(titre) + "</h2>" + (sous ? "<p>" + sous + "</p>" : "") + "</header>";
    }
    /* La vue d'ensemble : l'énergie, puis une carte par atelier que le joueur peut déjà montrer */
    function energieHTML() {
      const e = Atel.energie();
      const pct = e.demande <= 0 ? 0 : Math.min(100, Math.round(100 * e.demande / e.offre));
      const fmtc = (n) => fmt(Math.round(n));
      return '<button type="button" class="energie' + (e.ratio < 1 ? " is-juste" : "") + '" data-energie="1" aria-expanded="' + (U.energieSheet ? "true" : "false") + '" aria-label="Énergie : ' + fmtc(e.demande) + ' chevaux demandés sur ' + fmtc(e.offre) + ' disponibles. Ouvrir le détail">' +
        '<span class="energie-t">Énergie</span><span class="energie-barre"><i style="width:' + pct + '%"></i></span><span class="energie-v">' + fmtc(e.demande) + " / " + fmtc(e.offre) + ' ch ⓘ</span></button>' +
        '<p class="tiny muted energie-note">' + (e.ratio < 1 ? "Il manque de l’énergie : tes machines et tes ouvriers tournent à " + Math.round(100 * e.facteur) + " % de leur vitesse" + (e.facteur > e.ratio ? " (jamais moins de " + Math.round(100 * e.plancher) + " %)" : "") + ". Tes mains ne sont pas ralenties. " : "") + "Touche la jauge pour le détail.</p>";
    }
    /* le détail de l'énergie : ce qui consomme, ce qui fournit */
    function energieFeuille() {
      const e = Atel.energie(), c = (n) => fmt(Math.round(n));
      let h = '<div class="auto-feuille energie-feuille" role="dialog" aria-label="Énergie"><div class="auto-tete"><b>Énergie · ' + c(e.demande) + " / " + c(e.offre) + ' ch</b><button type="button" class="btn small" data-energie="0">Fermer</button></div><div class="auto-corps">';
      h += '<p class="small">Un <b>cheval</b> (ch) est une unité de force. Tes machines, tes apprentis et tes ouvriers en consomment <b>quand ils travaillent</b> ; tes mains n’en consomment pas. Ce que tu produis (la bête de trait, le moulin, plus tard la vapeur et l’électricité) fournit l’énergie à tous tes ateliers. <b>Si tu en manques, ils ralentissent proportionnellement, sans jamais descendre sous la moitié de leur vitesse.</b></p>';
      h += '<h3 class="sub">Ce qui consomme</h3>';
      h += e.conso.length ? e.conso.map((x) => '<div class="auto-ligne"><span class="grow">' + esc(x.n) + ' <span class="tiny muted">×' + x.nombre + "</span></span><b>" + c(x.ch) + " ch</b></div>").join("") : '<p class="small muted">Rien ne consomme : aucune machine ni aucun travailleur n’est au travail en ce moment.</p>';
      h += '<h3 class="sub">Ce qui fournit</h3>' + e.sources.map((x) => '<div class="auto-ligne"><span class="grow">' + esc(x.n) + (x.brule ? ' <span class="tiny muted">' + (x.arret ? "à l’arrêt : plus de " + esc(x.brule) : "brûle : " + esc(x.brule) + (x.reste < 3600 ? " · " + Math.floor(x.reste / 60) + " min " + (x.reste % 60) + " s" : "")) + "</span>" : "") + "</span><b>" + (x.arret ? "0" : "+" + c(x.ch)) + " ch</b></div>").join("");
      if (e.aConstruire.length) h += '<h3 class="sub">À construire</h3>' + e.aConstruire.map((x) => '<div class="auto-ligne"><span class="grow">' + esc(x.n) + '</span><span class="muted">+' + c(x.ch) + " ch</span></div>").join("");
      return h + "</div></div>";
    }
    function carteHTML(c) {
      const ech = c.echelles.map((e) => '<span class="atel-ech is-' + e.etat + '" title="' + esc(e.n) + (e.etat === "ferme" ? " : à partir de " + D.AGES[e.age].n.toLowerCase() : "") + '">' + esc(e.n) + "</span>").join("");
      const etat = c.etat === "bloque" ? '<span class="atel-etat is-bloque">à l’arrêt · ' + esc(c.cause) + "</span>"
        : c.etat === "marche" ? '<span class="atel-etat is-marche">+' + perMin(c.cadence / 60) + "</span>"
        : c.etat === "plein" ? '<span class="atel-etat">plein</span>' : "";
      const equipe = [c.apprentis ? c.apprentis + " apprenti" + (c.apprentis > 1 ? "s" : "") : "", c.ouvriers ? c.ouvriers + " ouvrier" + (c.ouvriers > 1 ? "s" : "") : "", c.machines ? c.machines + " machine" + (c.machines > 1 ? "s" : "") : "", (c.maitrise ? "maîtrisé" : c.recettes.length + " sur " + c.total + " recettes")].filter(Boolean).join(" · ");
      return '<button type="button" class="atel-carte is-' + c.etat + '" data-atelier="' + c.id + '"><span class="atel-ic" aria-hidden="true">' + c.ic + '</span><span class="atel-corps"><span class="atel-ligne"><b>' + esc(c.n) + '</b><span class="tiny muted">' + esc(equipe) + "</span>" + etat + '</span><span class="atel-echelle">' + ech + '</span></span><span class="atel-chev" aria-hidden="true">›</span></button>';
    }
    /* les boutons d'embauche d'un atelier (page de l'atelier) */
    function embaucheHTML(c) {
      return '<div class="atel-embauche">' + c.embauches.map((e) => {
        const renvoi = e.nombre > 0 ? '<button type="button" class="btn small ghost atel-renvoi' + (U.renvoiAttente === c.id + ":" + e.kind ? " is-confirme" : "") + '" data-renvoyer="' + c.id + ":" + e.kind + '" title="Renvoyer un ' + esc(e.n.toLowerCase()) + ' : aucun remboursement, et le prix de l’embauche suivante ne baisse pas">' + (U.renvoiAttente === c.id + ":" + e.kind ? "Confirmer le renvoi ?" : "Renvoyer") + "</button>" : "";
        if (e.pourquoi === "age") return '<span class="atel-ferme">' + esc(e.n) + " : à partir de " + esc(D.AGES[e.age].n.toLowerCase()) + "</span>";
        if (e.pourquoi === "max") return '<span class="atel-ferme">' + esc(Atel.nom(c.id, e.kind, true)) + " : " + e.nombre + " sur " + e.max + " (au complet)</span>" + renvoi;
        return renvoi + '<button type="button" class="btn small' + (e.pourquoi ? " ghost" : "") + '" data-embaucher="' + c.id + ":" + e.kind + '" title="' + esc(e.pourquoi === "ecus" ? "Il te manque des écus : vends au Comptoir ou au Troqueur" : "Embaucher") + '">Embaucher un ' + esc(e.n.toLowerCase()) + " · " + fmt(e.cout) + " écus" + (e.nombre ? " (" + e.nombre + ")" : "") + "</button>";
      }).join("") + "</div>";
    }
    /* la voix des travailleurs (0.51) : une carte à la fois, jamais par-dessus une fenêtre, qui se range seule ; toucher la carte ouvre le métier */
    const voix = { file: [], cur: null, tLast: 0, t: null };
    const ECH_PLANCHE = [0, 1, 2, 3, 4, 6, 7]; // les sept échelons du jeu sur les huit cases d’une planche (la case « Atome » est sautée)
    function voixPortrait(fam) {
      const P = ((D.VOIX || {}).planches || {})[fam];
      if (!P) return "";
      const ech = ECH_PLANCHE[Math.max(0, Math.min(6, (Atel.carte(fam) || {}).echelon || 0))], col = ech % 4, row = Math.floor(ech / 4);
      const W = 112, s = W / P.w;
      if (P.ligne) return '<span class="voix-portrait" aria-hidden="true" style="width:' + W + "px;height:" + Math.round(P.h * s) + "px;background-image:url(assets/travailleurs/planche-" + fam + ".jpg);background-size:" + Math.round(P.W * s) + "px " + Math.round(P.H * s) + "px;background-position:-" + Math.round(ech * P.w * s) + 'px 0"></span>';
      return '<span class="voix-portrait" aria-hidden="true" style="width:' + W + "px;height:" + Math.round(P.h * s) + "px;background-image:url(assets/travailleurs/planche-" + fam + ".jpg);background-size:" + Math.round(2000 * s) + "px " + Math.round(1116 * s) + "px;background-position:-" + Math.round((P.x + col * P.w) * s) + "px -" + Math.round((P.y + row * P.py) * s) + 'px"></span>';
    }
    function voixFerme() {
      clearTimeout(voix.t);
      const el = document.getElementById("voixCarte");
      if (el) el.remove();
      voix.cur = null;
    }
    function voixMontre(m) {
      voixFerme();
      voix.cur = m;
      const a = (S().ateliers || {})[m.fam] || {}, qui = Atel.nom(m.fam, a.ouv > 0 ? "ouvrier" : "apprenti"), F = D.ATELIERS.familles.find((f) => f.id === m.fam);
      const el = document.createElement("div");
      el.id = "voixCarte"; el.className = "voix-carte"; el.setAttribute("role", "status");
      el.innerHTML = voixPortrait(m.fam) + '<span class="voix-corps"><b class="voix-qui">' + esc(qui) + (F ? " · " + esc(F.n) : "") + '</b><span class="voix-txt">' + esc(m.txt) + "</span></span>" +
        '<button type="button" class="voix-x" aria-label="Fermer">×</button>';
      el.addEventListener("click", (ev) => {
        if (ev.target.closest(".voix-x")) { voixFerme(); return; }
        voixFerme(); U.atelierSel = m.fam; U.prodSel = null; setTab("atelier");
      });
      document.body.appendChild(el);
      voix.t = setTimeout(voixFerme, 14000);
    }
    function voixTick() {
      const now = Date.now();
      if (!Atel || now - voix.tLast < 3000 || (D.TRAVAILLEURS || {}).generalistes === false) return;
      voix.tLast = now;
      E.voix(now).forEach((m) => voix.file.push(m));
      if (!voix.cur && voix.file.length && !U.mcur && !(U.mq && U.mq.length)) voixMontre(voix.file.shift());
    }
    /* les goulots (0.52) : ce qui empêche les travailleurs d'avancer, la cause réelle, et un bouton qui la règle */
    function goulotsHTML(fam) {
      if (!E.goulots) return "";
      const tous = E.goulots(), gs = fam ? tous.filter((g) => g.fams.indexOf(fam) >= 0) : tous;
      if (!gs.length) return fam ? "" : "";
      const nom = (id) => (I[id] ? I[id].n.toLowerCase() : id);
      const lignes = gs.map((g) => {
        const a = g.action, lib = a ? (a.k === "reparer" ? esc(a.label) : a.k === "prime" ? "Verser une prime · " + fmt(a.cout) + " écus" : a.k === "embaucher" ? "Embaucher un " + esc(Atel.nom(a.fam, a.kind).toLowerCase()) + " · " + fmt(a.cout) + " écus" : esc(a.label)) : "";
        return '<li class="goulot is-' + g.kind + '"><span class="goulot-txt">' + (g.lie ? '<span class="goulot-lie" title="Sert à l’objet que tu suis">★ </span>' : "") + esc(g.txt) + (g.bloque.length ? '<span class="tiny muted"> · bloque : ' + esc(g.bloque.slice(0, 4).map(nom).join(", ")) + (g.bloque.length > 4 ? "…" : "") + "</span>" : "") + "</span>" +
          (a ? '<button type="button" class="btn small" data-goulot="' + esc(g.id) + '">' + lib + "</button>" : "") + "</li>";
      }).join("");
      if (fam) return '<div class="atel-goulots"><b class="tiny">À débloquer · ' + gs.length + '</b><ul class="goulots-liste">' + lignes + "</ul></div>";
      return '<div class="atel-goulots"><button type="button" class="prod-pastille-auto is-bloque" data-goulots="1" aria-expanded="' + (U.goulotsOuvert ? "true" : "false") + '">Goulots · ' + gs.length + (U.goulotsOuvert ? " ▴" : " ▾") + "</button>" +
        (U.goulotsOuvert ? '<ul class="goulots-liste">' + lignes + "</ul>" : "") + "</div>";
    }
    function goulotAgit(id) {
      const g = E.goulots().find((x) => x.id === id), a = g && g.action;
      if (!a) { render(true); return; }
      A.click();
      if (a.k === "embaucher") {
        const r = E.embaucher(a.fam, a.kind);
        if (r.ok) toast("🛠️ " + esc(Atel.nom(a.fam, a.kind)) + " embauché : " + fmt(r.cout) + " écus.", { key: "emb" });
        else toast(r.why === "ecus" ? "Il te manque " + fmt(Math.ceil(r.cout - (S().ecus || 0))) + " écus. Vends au Comptoir ou au Troqueur." : r.why === "max" ? "Le métier est au complet." : "Pas possible pour l’instant.", { key: "emb" });
        render(true); return;
      }
      if (a.k === "chantier") {
        const r = E.order(a.id, 1);
        if (r.ok) {
          const bat = (S().ateliers || {}).construction, eq = bat && (bat.app || bat.ouv);
          toast("🏗️ Chantier lancé : " + esc(I[a.id].n) + (eq ? ". Tes bâtisseurs s’en occupent." : ". Tu le construis à la main ; embauche un bâtisseur pour qu’il s’en charge."), { key: "emb" });
        } else toast(r.why === "plan" ? "Il manque des matières pour ce chantier : tout est dans la Réserve ou rien ne part." : r.why === "full" ? "La file des commandes est pleine." : "Pas possible pour l’instant.", { key: "emb" });
        render(true); return;
      }
      if (a.k === "reparer") {
        const r = E.reparer(a.id);
        if (r.ok) toast("🔧 Machine remise en état : " + fmt(r.cout) + " écus.", { key: "emb" });
        else toast(r.why === "ecus" ? "Il te manque " + fmt(Math.ceil(r.cout - (S().ecus || 0))) + " écus. Vends au Comptoir ou au Troqueur." : "Rien à réparer pour l’instant.", { key: "emb" });
        render(true); return;
      }
      if (a.k === "prime") {
        const r = E.primeVerser(a.fam);
        if (r.ok) toast("💰 Prime versée : " + fmt(r.cout) + " écus. Les travailleurs reprennent.", { key: "emb" });
        else toast(r.why === "ecus" ? "Il te manque " + fmt(Math.ceil(r.cout - (S().ecus || 0))) + " écus. Vends au Comptoir ou au Troqueur." : "Pas besoin de prime pour l’instant.", { key: "emb" });
        render(true); return;
      }
      if (a.k === "metier") { U.atelierSel = a.fam; U.prodSel = null; render(true); return; }
      if (a.k === "fabriquer") { U.atelierSel = a.fam; U.prodSel = a.id; render(true); return; }
      if (a.k === "energie") { U.energieSheet = true; render(true); return; }
      if (a.k === "labo") { setTab("labo"); return; }
      setTab("domaine");
    }
    /* le seuil d'un métier (0.51) : jusqu'où ses travailleurs fabriquent seuls, et où ils en sont */
    /* Construction n'a pas de seuil : ses bâtisseurs exécutent les chantiers que le joueur lance (une construction mise dans sa file) */
    function chantiersHTML(c) {
      const jobs = (S().hand && S().hand.q || []).filter((j) => E.atelierDe(j.id) === "construction");
      const equipe = (c.apprentis || 0) + (c.ouvriers || 0);
      const lignes = jobs.map((j) => {
        const tot = j.s.reduce((a, x) => a + x[1], 0), fait = j.done.reduce((a, x) => a + x, 0);
        return '<li class="atel-seuil-l"><b>' + esc(I[j.id].n) + '</b><span class="tiny muted">' + fait + " / " + tot + " étapes" + (j.paused ? " · en pause" : "") + "</span></li>";
      }).join("");
      return '<div class="atel-seuil"><div class="atel-seuil-t"><b>Chantiers</b><span class="tiny muted">' +
        (equipe ? "Tes bâtisseurs exécutent les constructions que tu lances. Ils ne construisent jamais de leur propre initiative, et seulement ce que tu as déjà construit une fois à la main." : "Embauche un bâtisseur : il exécutera les constructions que tu lances (extracteurs, machines), à ta place.") + "</span></div>" +
        (lignes ? '<ul class="atel-seuil-liste">' + lignes + "</ul>" : '<p class="tiny muted">Aucun chantier pour l’instant. Lance une construction depuis Produire, ou depuis un goulot (« Lancer le chantier »).</p>') + "</div>";
    }
    /* la fatigue d'un métier (0.57) : une jauge, ce que ça veut dire, et le remède quand c'est utile */
    function fatigueHTML(c) {
      if (!E.fatigue || !(c.apprentis || c.ouvriers)) return "";
      const f = E.fatigue(c.id), F = (D.TRAVAILLEURS || {}).fatigue;
      if (!F) return "";
      const etat = f.greve ? "En grève" : f.valeur >= F.alerte ? "Épuisés" : f.valeur >= F.reprise ? "Fatigués" : "En forme";
      const aide = f.greve ? "Ils ne fabriquent plus rien seuls. Ils reprennent quand ils ont soufflé, ou tout de suite contre une prime. Ta file de commandes continue."
        : f.valeur >= F.alerte ? "Encore un peu et ce sera la grève. Baisse le seuil pour les laisser souffler, embauche du renfort, ou verse une prime."
        : f.valeur >= F.reprise ? "Ils sentent la fatigue. Quand ils ont peu à faire, ils se reposent."
        : "Ils tiennent le rythme.";
      const nec = f.greve || f.valeur >= F.alerte;
      return '<div class="atel-fatigue is-' + (f.greve ? "greve" : f.valeur >= F.alerte ? "epuise" : "ok") + '"><div class="atel-fatigue-t"><b>Fatigue</b><span class="tiny">' + etat + '</span></div>' +
        '<progress value="' + Math.min(1, f.valeur).toFixed(3) + '" max="1" aria-label="Fatigue du métier : ' + etat + '"></progress><p class="tiny muted">' + esc(aide) + "</p>" +
        (nec ? '<button type="button" class="btn small" data-prime="' + c.id + '"' + ((S().ecus || 0) < E.primeCout(c.id) ? ' title="Il te manque des écus"' : "") + ">Verser une prime · " + fmt(E.primeCout(c.id)) + " écus</button>" : "") + "</div>";
    }
    function seuilHTML(c) {
      if (c.id === "construction") return chantiersHTML(c);
      if (!E.autoEtat || (D.TRAVAILLEURS || {}).generalistes === false) return "";
      const val = E.seuilAtelier(c.id), etats = E.autoEtat(c.id), PAL = (D.TRAVAILLEURS || {}).paliers || [];
      const sel = PAL.reduce((a, x) => (x.p <= val ? x : a), PAL[0] || { p: val, n: "", d: "" }); // le palier qui contient la valeur (une ancienne partie peut avoir 20 %)
      const equipe = (c.apprentis || 0) + (c.ouvriers || 0);
      const mot = { marche: "en cours", plein: "au seuil", manque: "manque de matière", attend: "en attente", greve: "en grève" };
      const lignes = etats.map((x) => '<li class="atel-seuil-l is-' + x.etat + '">' + icon(x.id, "sm") + "<b>" + esc(I[x.id].n) + "</b>" +
        '<span class="tiny muted">' + fmt(x.have) + " / " + fmt(x.cible) + " · " + mot[x.etat] + (x.travailleurs ? " · " + x.travailleurs + " au travail" : "") + "</span></li>").join("");
      return '<div class="atel-seuil"><div class="atel-seuil-t"><b>Seuil de stock</b><span class="tiny muted">' +
        (equipe ? "Tes travailleurs fabriquent seuls ce que le métier connaît, jusqu’à ce seuil." : "Embauche pour que le métier fabrique seul, jusqu’à ce seuil.") + "</span></div>" +
        '<div class="filters wrap" role="group" aria-label="Seuil de stock">' + PAL.map((x) =>
          '<button type="button" data-seuil="' + c.id + ":" + x.p + '" class="' + (x.p === sel.p ? "on" : "") + '" aria-pressed="' + (x.p === sel.p) + '">' + esc(x.n) + "</button>").join("") + "</div>" +
        '<p class="tiny muted atel-seuil-d">' + esc(sel.d) + "</p>" +
        (lignes ? '<ul class="atel-seuil-liste">' + lignes + "</ul>" : '<p class="tiny muted">Rien à fabriquer seul pour l’instant : il faut avoir fait une pièce du métier à la main.</p>') +
        (E.voixHisto(c.id).length ? '<div class="atel-voix"><b class="tiny">Ils ont dit</b>' + E.voixHisto(c.id).slice(0, 3).map((m) => '<p class="tiny muted">« ' + esc(m.txt) + " »</p>").join("") + "</div>" : "") + "</div>";
    }
    function viewAteliers() {
      const ap = E.apprentis();
      const n = ap.ordres.length + ap.machines.reduce((a, m) => a + m.used, 0);
      return '<div class="ateliers atl-page">' + enteteAtelier("Métiers", "Ce que tu fabriques, et qui s’en charge.") + energieHTML() + goulotsHTML() + '<p class="tiny muted atl-bourse">Bourse : ' + fmt(Math.floor(S().ecus || 0)) + " écus</p>" +
        '<div class="prod-entete"><button type="button" class="prod-pastille-auto' + (ap.bloques ? " is-bloque" : "") + '" data-autosheet="1" aria-expanded="' + (U.autoSheet ? "true" : "false") + '">Ce qui tourne · ' + n + (ap.bloques ? " · " + ap.bloques + " à voir" : "") + "</button></div>" +
        '<div class="atel-liste">' + Atel.liste().map(carteHTML).join("") + "</div></div>" + (U.autoSheet ? autoFeuille() : "") + (U.energieSheet ? energieFeuille() : "");
    }
    function viewAtelier() {
      if (Atel) {
        if (U.atelierSel && !Atel.connues(U.atelierSel).length) U.atelierSel = null;
        if (!U.atelierSel) return viewAteliers();
      }
      const st = S(), ap = E.apprentis();
      const liste = prodRecettes();
      if (!liste.includes(U.prodSel)) U.prodSel = liste[0] || null;
      const n = ap.ordres.length + ap.machines.reduce((a, m) => a + m.used, 0);
      const cA = Atel && U.atelierSel ? Atel.carte(U.atelierSel) : null;
      let h = '<div class="prod atl-page">' + subTabs("atelier", "carnet", "machines", "Produire", "Carnet", "Machines") +
        (cA ? '<div class="atel-tete"><button type="button" class="btn small" data-atelier-retour>← Métiers</button><b>' + cA.ic + " " + esc(cA.n) + '</b><span class="atel-echelle">' + cA.echelles.map((e) => '<span class="atel-ech is-' + e.etat + '">' + esc(e.n) + "</span>").join("") + "</span></div>" + embaucheHTML(cA) + seuilHTML(cA) + fatigueHTML(cA) + goulotsHTML(cA.id) + energieHTML() + '<p class="tiny muted atl-bourse">Bourse : ' + fmt(Math.floor(S().ecus || 0)) + " écus</p>" : "") +
        '<div class="prod-entete"><button type="button" class="prod-pastille-auto' + (ap.bloques ? " is-bloque" : "") + '" data-autosheet="1" aria-expanded="' + (U.autoSheet ? "true" : "false") + '">Ce qui tourne · ' + n +
        (ap.bloques ? " · " + ap.bloques + " à voir" : "") + "</button>" +
        "</div>";
      if (!liste.length) return h + '<p class="small muted center" style="padding:16px">Rien à produire pour l’instant. Découvre une recette au Labo : elle apparaît ici.</p></div>' + (U.autoSheet ? autoFeuille() : "") + (U.energieSheet ? energieFeuille() : "");
      h += '<div class="prod-choix" role="group" aria-label="Recettes connues"' + (U.prodTout ? " data-tout" : "") + ">";
      liste.slice(0, 80).forEach((id) => {
        const can = E.maxCraftable(id, 1000) > 0;
        h += '<button type="button" class="prod-recette' + (id === U.prodSel ? " on" : "") + (can ? "" : " zero") + '" data-prodsel="' + id + '" aria-pressed="' + (id === U.prodSel) + '">' + icon(id) + '<span class="n">' + esc(I[id].n) + '</span><span class="c" data-c="' + id + '">' + fmt(st.inv[id] || 0) + "</span></button>";
      });
      h += "</div>";
      const id = U.prodSel, it = I[id], q = prodQty(id), mode = U.prodQty || "1";
      const cost = {}; for (const i in it.r[1]) cost[i] = it.r[1][i] * q;
      const ordre = ap.ordres.find((o) => o.id === id);
      const why = prodWhy(id);
      h += '<section class="prod-fiche"><div class="row">' + icon(id, "lg") + '<div class="grow"><div class="rname">' + esc(it.n) + ' <span class="muted">×' + fmt(q) + "</span></div>" +
        '<div class="tiny muted">' + gesteChip(id) + " · à la main : " + fmtTime(E.handTime(id) * q) + "</div></div></div>" +
        '<div class="row wrap small" style="margin-top:6px">' + ingHTML(cost, { check: true, link: true }) + "</div>" +
        '<div class="prod-qty" role="group" aria-label="Quantité">' + [["1", "×1"], ["10", "×10"], ["50", "×50"], ["100", "×100"], ["500", "×500"], ["1000", "×1000"], ["max", "Max"]].map(([k, l]) => '<button type="button" data-prodq="' + k + '" class="' + (mode === k ? "on" : "") + '" aria-pressed="' + (mode === k) + '">' + l + "</button>").join("") + "</div></section>";
      h += '<div class="prod-qui"><button type="button" class="btn pri" data-prod="main">À la main</button>' +
        '<button type="button" title="Automatiser : les machines refabriquent seules jusqu’à la cible en Réserve" class="btn' + (why ? " ghost" : "") + '" data-prod="apprenti"' + (ordre ? " disabled" : "") + ">" + (ordre ? "Automatisé · " + fmt(ordre.have) + "/" + fmt(ordre.cap) : "Automatiser") + "</button>" +
        '<button type="button" class="btn ghost" data-tab2="machines">Machines</button></div>';
      if (why && !ordre) h += '<p class="tiny muted prod-why">' + esc(why) + "</p>";
      h += '<div class="prod-file" id="hands">' + handsHTML() + "</div>";
      h += "</div>";
      return h + (U.autoSheet ? autoFeuille() : "") + (U.energieSheet ? energieFeuille() : "");
    }
    /* « Ce qui tourne » : chaque ordre permanent, son état en mots, ses réglages */
    function autoFeuille() {
      const ap = E.apprentis();
      let h = '<div class="auto-feuille" role="dialog" aria-label="Ce qui tourne"><div class="auto-tete"><b>Ce qui tourne</b><button type="button" class="btn small" data-autosheet="0">Fermer</button></div><div class="auto-corps">';
      if (!ap.ordres.length) h += '<p class="small muted">Rien n’est automatisé. Choisis une recette, puis « Automatiser » : les machines la refabriquent seules jusqu’à la cible en Réserve.</p>';
      ap.ordres.forEach((o) => {
        const cls = o.status === "ok" ? "is-ok" : o.status === "full" ? "is-plein" : o.status === "off" ? "" : "is-bloque";
        const txt = o.status === "starved" && o.miss.length ? "manque : " + o.miss.map((i) => I[i].n).join(", ") : PROD_ETAT[o.status] || o.status;
        h += '<div class="auto-ligne apprenti ' + cls + '" data-auto="' + o.id + '">' + icon(o.id, "sm") + '<div class="grow"><b>' + esc(I[o.id].n) + '</b> <span class="tiny muted">' + fmt(o.have) + " / " + fmt(o.cap) + " en Réserve</span>" +
          '<div class="small auto-etat">' + (o.status === "ok" ? "Produit" : o.status === "full" ? "Plein" : o.status === "off" ? "En pause" : "À voir") + " · " + esc(txt) + (o.rate > 0 ? " · " + perMin(o.rate) : "") + "</div></div>" +
          '<div class="auto-act"><button type="button" class="btn small ghost" data-autocad="cap:' + o.id + ':-" aria-label="Cible moins dix">−</button><button type="button" class="btn small ghost" data-autocad="cap:' + o.id + ':+" aria-label="Cible plus dix">+</button>' +
          '<button type="button" class="btn small ghost" data-autocad="toggle:' + o.id + '">' + (o.on ? "Pause" : "Reprendre") + '</button><button type="button" class="btn small ghost" data-autocad="del:' + o.id + '" aria-label="Retirer">✕</button></div></div>';
      });
      ap.machines.forEach((m) => {
        h += '<div class="auto-ligne apprenti' + (m.free ? "" : " is-ok") + '">' + icon(m.id, "sm") + '<div class="grow"><b>' + esc(I[m.id].n) + '</b> <span class="tiny muted">×' + m.own + '</span><div class="small auto-etat">' + (m.free ? m.free + " libre" + (m.free > 1 ? "s" : "") : "Toutes au travail") + "</div></div></div>";
      });
      return h + "</div></div>";
    }
    /* les appuis de l’Atelier et du Labo */
    function prodClick(t) {
      let b;
      if ((b = t.closest("[data-atelier]"))) { A.click(); U.atelierSel = b.dataset.atelier; U.prodSel = null; render(true); return true; }
      if ((b = t.closest("[data-renvoyer]"))) {
        const cle = b.dataset.renvoyer, [fam, kind] = cle.split(":");
        if (U.renvoiAttente !== cle) { A.click(); U.renvoiAttente = cle; render(true); return true; }
        U.renvoiAttente = null;
        const r = E.licencier(fam, kind);
        if (r.ok) { A.click(); toast("👋 " + esc(Atel.nom(fam, kind)) + " renvoyé.", { key: "emb" }); } else A.fail(0);
        render(true); return true;
      }
      if ((b = t.closest("[data-prime]"))) {
        const r = E.primeVerser(b.dataset.prime);
        if (r.ok) { A.click(); toast("💰 Prime versée : " + fmt(r.cout) + " écus. Les travailleurs reprennent." , { key: "emb" }); }
        else { A.fail(0); toast(r.why === "ecus" ? "Il te manque " + fmt(Math.ceil(r.cout - (S().ecus || 0))) + " écus. Vends au Comptoir ou au Troqueur." : "Pas besoin de prime pour l’instant.", { key: "emb" }); }
        render(true); return true;
      }
      if ((b = t.closest("[data-goulots]"))) { U.goulotsOuvert = !U.goulotsOuvert; A.click(); render(true); return true; }
      if ((b = t.closest("[data-goulot]"))) { goulotAgit(b.dataset.goulot); return true; }
      if ((b = t.closest("[data-seuil]"))) {
        const [fam, pct] = b.dataset.seuil.split(":");
        if (E.setSeuilAtelier(fam, +pct).ok) A.click();
        render(true); return true;
      }
      if ((b = t.closest("[data-embaucher]"))) {
        U.renvoiAttente = null;
        const [fam, kind] = b.dataset.embaucher.split(":");
        const r = E.embaucher(fam, kind);
        if (r.ok) { A.click(); toast("🛠️ " + esc(Atel.nom(fam, kind)) + " embauché : " + fmt(r.cout) + " écus.", { key: "emb" }); }
        else { A.fail(0); toast(r.why === "ecus" ? "Il te manque " + fmt(Math.ceil(r.cout - (S().ecus || 0))) + " écus. Vends au Comptoir ou au Troqueur." : r.why === "max" ? "Le métier est au complet." : r.why === "age" ? "Pas encore : cet échelon arrive plus tard." : "Impossible pour l’instant.", { key: "emb" }); }
        render(true); return true;
      }
      if (t.closest("[data-atelier-retour]")) { A.click(); U.atelierSel = null; render(true); return true; }
      if ((b = t.closest("[data-energie]"))) { A.click(); U.energieSheet = b.dataset.energie === "1" ? !U.energieSheet : false; render(true); return true; }
      if ((b = t.closest("[data-cpanel]"))) { A.click(); U.carnetPanel = U.carnetPanel === b.dataset.cpanel ? null : b.dataset.cpanel; render(true); return true; }
      if (t.closest("[data-cf], [data-qty]")) U.carnetPanel = null;
      if (t.closest("[data-prodapprenti]")) { U.prodApprenti = !U.prodApprenti; return false; }
      if ((b = t.closest("[data-labsearch]"))) { A.click(); U.labSearch = b.dataset.labsearch === "1"; render(true); return true; }
      if ((b = t.closest("[data-autosheet]"))) { A.click(); U.autoSheet = b.dataset.autosheet === "1" ? !U.autoSheet : false; render(true); return true; }
      if ((b = t.closest("[data-prodsel]"))) { A.click(); U.prodSel = b.dataset.prodsel; render(true); return true; }
      if ((b = t.closest("[data-prodq]"))) { A.click(); U.prodQty = b.dataset.prodq; render(true); return true; }
      if ((b = t.closest("[data-prod]"))) {
        const id = U.prodSel; if (!id) return true;
        A.init();
        if (b.dataset.prod === "main") {
          const q = E.queue(id, prodQty(id));
          if (q.ok) { A.click(); toast("✋ " + esc(I[id].n) + " ×" + fmt(prodQty(id)) + " : fin estimée dans " + fmtTime(q.time) + ".", { key: "prod" }); }
          else { A.fail(0); toast(q.why === "full" ? "Commandes au maximum." : q.why === "queued" ? "Déjà en cours." : "Il manque des matières : récolte d’abord, ou lance « Tout fabriquer » depuis le Carnet.", { key: "prod" }); }
        } else if (b.dataset.prod === "apprenti") {
          const r = E.setCadence(id, Math.max(10, Math.floor(S().inv[id] || 0) + prodQty(id)), true);
          if (r.ok) { A.click(); toast("⚙️ Les machines refabriquent " + esc(I[id].n.toLowerCase()) + " jusqu’à la cible.", { key: "prod" }); }
          else { A.fail(0); toast(esc(prodWhy(id) || "Impossible pour l’instant."), { key: "prod" }); }
        }
        render(true); return true;
      }
      if ((b = t.closest("[data-autocad]"))) {
        const [k, id, d] = b.dataset.autocad.split(":"); A.click();
        const o = E.apprentis().ordres.find((x) => x.id === id); if (!o) return true;
        if (k === "cap") E.setCadence(id, Math.max(1, o.cap + (d === "+" ? 10 : -10)));
        else if (k === "toggle") E.setCadence(id, undefined, !o.on);
        else if (k === "del") E.setCadence(id, null);
        render(true); return true;
      }
      return false;
    }
    function showInCarnet(id) {
      const it = I[id];
      U.q = ""; U.carnetFilter = "tout"; U.openAges[it.a] = true;
      if (S().settings) S().settings.carnet = { filter: "tout", q: "" };
      if (E.isUnique(it) && S().made[id] > 0) U.showOwned = true;
      setTab("carnet");
      setTimeout(() => { const el = $('[data-rec="' + id + '"]'); if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); flash(el); } }, 60);
    }
    function flash(el) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
    const openItemInfo = (id) => goto(id);

    return { goulotsHTML, voixTick, prodClick, viewLabo, equipmentLive: Equipped ? Equipped.live : null, arbreMaj, arbreOuvrir, arbreRendre, viewAtelier, viewCarnet, viewMachines, carnetList, carnetLive, whyNot, putInSlot, forge, craftFrom, chainCraft, handsHTML, handSig, startHarvest, actBar, skillName, openSkills, openHands, openTree, goto, openItemInfo, promptCarnetQty, promptCraftQty };
  }

  window.EclatAtelier = { create };
})();
