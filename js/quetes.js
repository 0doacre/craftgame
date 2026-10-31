/* ÉCLAT — l’objectif, les étapes de l’âge, le suivi et les Quêtes.
 * La carte d’objectif et sa prochaine action, le passage en cours, le suivi d’une
 * recette ; la fenêtre des Quêtes (scénario, rituels, Troqueur) et sa puce du haut. */
(function () {
  "use strict";

  function create(api) {
    const {
      E, A, D, U, esc, fmt, fmtTime, cap1, needText, icon, itemPill, ingHTML, gesteChip, mainIngredient, isRawGather,
      zoneName, floater, elCenter, toast, vibe, openModal, closeModal, swapModal, render, save, chainCraft, setTab
    } = api;
    const S = () => E.state;
    const I = D.ITEMS;
    const $ = (s, r) => (r || document).querySelector(s);

    /* ------------------------------------------------------------ OBJECTIF ET SUIVI
     * affichés par-dessus la carte */
    function goalCard() {
      const st = S();
      const g = E.guide();
      if (!g) {
        return st.flags.arche ? '<div class="card acc goal-card compact"><div class="lbl">Objectif</div><div class="name">Choisis ton Grand Œuvre</div><div class="small">Il t’attend dans les Terres, et dans le Cosmos de la Progression.</div></div>' : "";
      }
      const ob = g.ob;
      const reprise = E.repriseGoal && E.repriseGoal(g);
      if (reprise) {
        return '<div class="card acc goal-card"><div class="lbl">Terre familière · reprise</div><div class="name">Rétablir ' + esc(reprise.n) + '</div><p class="small">' + reprise.done + ' / ' + reprise.steps.length + ' équipements rétablis. Les recettes déjà réalisées sont regroupées ; les nouvelles découvertes gardent leur place.</p>' + nextAction(g) + '<details><summary>Voir les étapes connues</summary><ul class="small">' + reprise.steps.map(m => '<li>' + (m.done ? '✓ ' : '') + esc(I[m.ob.id].n) + '</li>').join('') + '</ul></details></div>';
      }
      const open = goalOpen();
      const title = ob.k === "craft" ? esc(I[ob.id].n) : esc(ob.n);
      // le compteur suit toujours l’âge où l’on est, même quand l’objectif vise déjà le suivant
      const ml = E.milestones()[st.age] || [], md = ml.filter((x) => x.done).length;
      // le premier âge d’abord : le compteur d’étapes n’a rien à dire avant
      const tard = st.age > 0 || md > 0;
      let h = '<div class="card acc goal-card' + (open ? "" : " compact") + '"><div class="ghead-row"><button class="ghead" data-goalt><span class="lbl">📜 Objectif</span><span class="gname">' + title + '</span><span class="zt">' + (open ? "▴" : "▾") + "</span></button>" +
        (tard && ob.k === "craft" ? '<button class="gmiles" data-arbre-obj title="Voir ton objectif dans ta progression">Progression</button>' : "") + "</div>";
      if (ml.length && tard) {
        const pct = Math.round((md / ml.length) * 100);
        h += '<button type="button" class="gprog-row" data-miles title="Les étapes de cet âge : ' + md + '/' + ml.length + ' faites">' +
          '<span class="gprog-track"><i style="width:' + pct + '%;background:' + esc(D.AGES[st.age].c) + '"></i></span>' +
          '<span class="gprog-txt">🏁 ' + (md === ml.length ? '★ Âge accompli' : esc(D.AGES[st.age].n) + ' · ' + md + '/' + ml.length + ' étapes') + '</span></button>';
      }
      h += nextAction(g);
      if (!open) return h + "</div>";
      // le détail, à la demande
      h += '<div class="gdetail small">' + esc(ob.txt || "") + "</div>";
      if (ob.k === "craft") {
        const it = I[ob.id];
        if (it.h && !st.known[ob.id]) h += '<div class="riddle small">« ' + esc(it.h) + " »</div>";
        if (g.step !== ob.id && I[g.step]) h += '<div class="tiny muted" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:4px">Il faut d’abord : ' + itemPill(g.step) + "</div>";
        h += '<div class="row wrap" style="margin-top:6px"><button class="btn small ghost" data-chemin="' + ob.id + '" data-tree="' + ob.id + '" title="Chemin : la route complète jusqu’à l’objet">Chemin</button>' + (st.track && st.track.id === ob.id ? "" : '<button class="btn small ghost" data-track="' + ob.id + '">Suivre</button>') + "</div>";
        const z = it.e && it.e.zone;
        if (z && D.PASSAGES[z] && !(st.pass[z] && st.pass[z].done)) {
          const c = E.passCost(z);
          h += '<div class="tiny muted" style="margin-top:6px">Ensuite, le passage <b>' + esc(D.PASSAGES[z].n) + "</b> vers " + esc(zoneName(z)) + " : " + Object.keys(c).map((i) => itemPill(i, { qty: c[i] })).join("") + ".</div>";
        }
      }
      return h + "</div>";
    }
    /* La prochaine chose à faire pour l’objectif, en une ligne : ramasser ce qui manque
     * (ici même), fabriquer d’un geste (les pièces intermédiaires comprises), ou aller
     * découvrir une recette à l’Atelier. Rien à retenir. */
    function nextAction(g) {
      const st = S(), ob = g.ob;
      const line = (inner) => '<div class="gact">' + inner + "</div>";
      if (ob.k === "exp") {
        if (st.exp.active) return line('<span class="small">🧭 En route… <b data-xl></b></span>');
        if (g.step) return line('<span class="small">Pour explorer : ' + esc(I[g.pour].n) + '.</span>') + nextAction({ ...g, ob: { k: "craft", id: g.pour } });
        return line('<button class="btn small pri" data-exp="' + ob.z + '">🧭 Explorer</button><span class="tiny muted">' + esc(E.ZONES[ob.z].n) + "</span>");
      }
      if (ob.k === "pass") {
        // un lieu de la terre actuelle demande un objet dont on ne connaît pas la recette (la torche) : le guide la montre avant le passage
        const un = (id) => (D.GENRE.p.split(" ").includes(id) ? "des " : D.GENRE.f.split(" ").includes(id) ? "une " : "un ") + I[id].n.toLowerCase();
        const manque = g.step && !st.known[g.step] && g.pour && I[g.pour] ? un(g.pour) : null;
        if (manque) {
          const lvl = st.hints[g.step] || 0, it0 = I[g.step];
          return line('<div class="grow" data-goto="' + g.step + '"><div class="small">🧭 Requis pour ' + (g.passageCost ? 'payer le passage' : 'le prochain lieu') + ' : <b>' + esc(manque) + "</b>. " +
            (g.step === g.pour ? "" : "Une recette à trouver. ") + (it0.h ? "<i>« " + esc(it0.h) + " »</i>" : "") + "</div>" +
            (lvl >= 1 ? '<div class="tiny muted">💭 L’action : ' + gesteChip(g.step) + "</div>" : "") +
            (lvl >= 2 ? '<div class="tiny muted">💭 Une des ressources : ' + icon(mainIngredient(g.step), "sm") + " " + esc(I[mainIngredient(g.step)].n) + "</div>" : "") +
            '</div><button class="btn small pri" data-gotab="labo">Labo</button>') + passHTML(ob.z);
        }
        return passHTML(ob.z);
      }
      if (ob.k === "ext") {
        const d = E.deposits().find((x) => { const c = E.extChoice(x.res, x.z); return c && (c.free > 0 || E.plan(c.t, 1).ok); });
        return d ? line('<button class="btn small pri" data-xadd="' + d.key + '" data-n="1">Poser ' + esc(I[E.extChoice(d.res, d.z).t].n.toLowerCase()) + " sur " + esc(I[d.res].n.toLowerCase()) + "</button>") : line('<span class="small">' + esc(ob.txt) + "</span>");
      }
      if (ob.k === "line") {
        const rec = st.known.manche && st.made.manche > 0 ? "manche" : Object.keys(st.known).find((k) => st.made[k] > 0 && E.automatable(k) && E.machCan("automate_bois", k));
        return line(rec ? '<button class="btn small pri" data-cr="' + rec + '" data-n="10">Commander : ' + esc(I[rec].n) + ' ×10</button>' : '<span class="small">' + esc(ob.txt) + "</span>");
      }
      const id = g.step, it = I[id];
      if (!it) return "";
      if (!st.known[id]) {
        const lvl = st.hints[id] || 0, nIng = it.r ? Object.keys(it.r[1]).length : 0;
        return line('<div class="grow" data-goto="' + id + '"><div class="small"><span class="step-badge">✦ Nouvelle recette' + (nIng ? ' · ' + nIng + ' ressource' + (nIng > 1 ? 's' : '') : '') + '</span> ' + (it.h ? "<i>« " + esc(it.h) + " »</i>" : "<b>Recette à trouver</b>") + "</div>" +
          (lvl >= 1 ? '<div class="tiny muted">💭 L’action : ' + gesteChip(id) + "</div>" : "") +
          (lvl >= 2 ? '<div class="tiny muted">💭 Une des ressources : ' + icon(mainIngredient(id), "sm") + " " + esc(I[mainIngredient(id)].n) + "</div>" : "") +
          '</div><button class="btn small pri" data-gotab="labo">Labo</button>');
      }
      if (E.queued(id) > 0) return line('<span class="small">✋ En cours : ' + esc(it.n.toLowerCase()) + ".</span>");
      const b = E.blocker(id);
      if (b && b.why !== "owned") return line('<span class="small">' + cap1(needText(id, b, true)) + '.</span><button class="btn small ghost" data-tree="' + id + '">Voir les prérequis</button>');
      if (b && b.why === "owned") return "";
      const p = E.plan(id, 1);
      const commande = E.orderStatus(id, 1).ok
        ? line('<button class="btn small pri" data-chain="' + id + '" title="Mains et machines disponibles, pièces intermédiaires comprises">Fabriquer : ' + esc(it.n) + '</button><span class="tiny muted">La commande attendra les matières manquantes.</span>')
        : line('<button class="btn small ghost" data-tree="' + id + '">Voir les prérequis</button>');
      if (p.ok) {
        const parts = p.steps.filter((x) => x[0] !== id).map((x) => esc(I[x[0]].n.toLowerCase()));
        return line('<button class="btn pri gmake" data-chain="' + id + '" title="' + (parts.length ? 'Composants compris : ' + parts.join(', ') : 'Fabriquer cette recette') + '">Fabriquer : ' + esc(it.n) + '</button>' + (parts.length ? '<span class="tiny muted">Composants compris.</span>' : ''));
      }
      // ce qui manque : d’abord ce qui se ramasse à la main, ici même
      const miss = Object.keys(p.missing);
      const hand = miss.find((k) => isRawGather(k) && E.ZONES[E.RES_ZONE[k]].res.includes(k));
      if (hand) {
        const z = E.RES_ZONE[hand], tot = Math.ceil((st.inv[hand] || 0) + p.missing[hand]);
        return commande + '<div class="gis gact">' + '<button class="gis-ic hand" data-harv="' + z + ":" + hand + '" aria-label="Récolter : ' + esc(I[hand].n) + '">' + icon(hand) + "</button>" +
          '<div class="grow"><div class="small">Il manque <b data-gleft="' + hand + '" data-q="' + tot + '">' + fmt(p.missing[hand]) + "</b> " + esc(I[hand].n.toLowerCase()) + " pour " + esc(it.n.toLowerCase()) + '.</div><div class="tiny muted">Touche l’icône, ou ▶ pour récolter en continu.</div></div>' +
          (st.act && st.act.k === "harv" && st.act.res === hand ? '<span class="tiny muted">en cours…</span>' : '<button class="btn small" data-hloop="' + z + ":" + hand + '">▶</button>') + "</div>";
      }
      const ext = miss.find((k) => isRawGather(k));
      if (ext) {
        // l’extracteur est déjà à toi : il ne tourne pas sur ce gisement (jamais posé, ou éteint)
        const ee = E.extEtat(ext), manque = '<span class="small" style="display:inline-flex;align-items:center;flex-wrap:wrap;gap:4px">Il manque ' + itemPill(ext, { qty: p.missing[ext], lack: true });
        if (ee && ee.etat === "libre") return commande + line(manque + " : " + esc(I[ee.t].n.toLowerCase()) + " attend d’être posé.</span>" + '<button class="btn small pri" data-xadd="' + ee.key + '" data-n="1">Poser</button>');
        if (ee && ee.etat === "arret") return commande + line(manque + " : ton extracteur est arrêté.</span>" + '<button class="btn small pri" data-xrun="' + ee.key + '">Relancer</button>');
        return commande + line(manque + " : cette ressource ne se récolte pas à la main. Pose un extracteur sur son gisement.</span>");
      }
      return commande + line('<span class="small" style="display:inline-flex;align-items:center;flex-wrap:wrap;gap:4px">Il manque : ' + miss.map((k) => itemPill(k, { qty: p.missing[k], lack: true })).join("") + ".</span>");
    }
    /* ce qui change la carte d’objectif (pour la redessiner au bon moment) */
    function goalSig() {
      const g = E.guide();
      if (!g) return "";
      if (g.ob.k !== "craft") return [g.ob.k, g.ob.z, S().exp.active ? 1 : 0, g.step, g.step && S().known[g.step], g.step && E.queued(g.step), JSON.stringify(S().exp.done), goalOpen()].join(":");
      const p = I[g.step] && S().known[g.step] ? E.plan(g.step, 1) : null;
      const a = S().act;
      const reprise = E.repriseGoal && E.repriseGoal(g);
      return g.step + ":" + (S().hints[g.step] || 0) + (p ? (p.ok ? 1 : Object.keys(p.missing).join()) : "?") + E.queued(g.step) + goalOpen() + (reprise ? ":reprise:" + reprise.done : "") + (a ? a.k + (a.id || a.res) : "");
    }
    /* l’objectif déplié ou non : pendant un Suivi, il reste replié (on peut le rouvrir un moment) pour laisser voir le Domaine */
    function goalOpen() {
      const st = S();
      if (st.track && I[st.track.id]) return !!U.goalPeek;
      return !!st.settings.goalOpen;
    }
    /* les jalons : ce qu’il y a à faire à chaque âge, et le premier pas vers le suivant */
    function mileName(ob) {
      if (ob.k === "craft") return itemPill(ob.id);
      return (ob.k === "exp" ? "🧭 " : ob.k === "ext" ? "⛏️ " : ob.k === "pass" ? "🚧 " : "🏭 ") + esc(ob.n);
    }
    function openMilestones() {
      const st = S(), ms = E.milestones(), cur = E.objective();
      st.flags.milesSeen = true;
      const curAgeList = ms[st.age] || [];
      const curDone = curAgeList.filter((x) => x.done).length;
      const curPct = curAgeList.length ? Math.round((curDone / curAgeList.length) * 100) : 0;
      let h = '<div class="kicker">Les étapes de l’Âge</div><h2>' + esc(D.AGES[st.age].n) + '</h2>' +
        '<div class="miles-top-bar"><div class="bar" style="margin:4px 0 6px"><i style="width:' + curPct + '%;background:' + esc(D.AGES[st.age].c) + '"></i></div>' +
        '<div class="row between tiny muted"><span>Progression de l’époque : <b>' + curDone + ' / ' + curAgeList.length + '</b></span><span>' + (curDone === curAgeList.length ? '★ Accompli' : curPct + ' %') + '</span></div></div>' +
        '<p class="small muted">Chaque âge a ses étapes. Fais-les toutes et l’âge est <b>accompli</b> : +' + D.AGE_DONE + " ✨ Intuition. Termine ces étapes et fabrique un objet de l’âge suivant pour y accéder. Les autres recettes du Carnet restent facultatives.</p>";
      ms.forEach((list, a) => {
        if (!list || a > st.age + 1) return;
        const done = list.filter((x) => x.done).length, next = a === st.age + 1, full = done === list.length;
        const shown = next ? list.filter((x) => !x.done).slice(0, 1) : list;
        if (!shown.length) return;
        const open = a === st.age || next || (!full && cur && list.some((x) => x.i === cur.i));
        h += '<details class="miles' + (full ? " full" : "") + '"' + (open ? " open" : "") + "><summary><b>" + (next ? "Vers l’âge suivant" : esc(D.AGES[a].n)) + '</b> <span class="tiny muted">' + (next ? esc(D.AGES[a].n) : full ? "✓ accompli" : done + " sur " + list.length) + "</span></summary>" +
          shown.map((x) => '<div class="mile' + (x.done ? " done" : cur && cur.i === x.i ? " cur" : "") + '"><span class="mk">' + (x.done ? "✓" : cur && cur.i === x.i ? "➜" : "○") + "</span>" + mileName(x.ob) + (cur && cur.i === x.i && !x.done ? ' <span class="badge" style="background:var(--acc);color:#fff">En cours</span>' : "") + "</div>").join("") + "</details>";
      });
      openModal({ reopen: openMilestones, html: h + '<div class="acts"><button class="btn pri" data-m="close">Fermer</button></div>' });
    }
    const WHY_STEP = { station: "Requis :", zone: "Nouvelle terre, ouverte par :", pass: "Passage à ouvrir :", unknown: "À faire :" };
    /* un passage vers une terre : ce qu’il coûte, ce qui est déjà déposé, et le bouton pour déposer */
    function passHTML(z, options = {}) {
      const p = E.passInfo(z), st = S();
      if (!p || !p.ready) return "";
      const chantier = ["plaine", "riviere"].includes(z) && window.EclatStyleMode === "vivant";
      const chantierLabel = z === "riviere" ? p.frac < .35 ? "Ancrer les pieux" : p.frac < .75 ? "Lier la charpente" : "Poser le tablier" : p.frac < .35 ? "Dégager le passage" : p.frac < .75 ? "Aménager le chemin" : "Marquer le sentier";
      // les lieux de la terre actuelle : le passage ne s’ouvre qu’une fois qu’on les connaît
      const lieux = p.lieux && p.lieux.left.length ? p.lieux : null;
      const l0 = lieux && lieux.left[0], expCost = (l0 && l0.cost) || {};
      const reqId = l0 ? Object.keys(expCost).find((k) => I[k] && I[k].r && st.known[k] && (st.inv[k] || 0) < expCost[k]) : null;
      const reqAct = reqId
        ? (E.queued(reqId) > 0
          ? '<span class="tiny muted">✋ En cours : ' + esc(I[reqId].n.toLowerCase()) + "</span>"
          : '<button class="btn small pri" data-chain="' + reqId + '">Fabriquer : ' + esc(I[reqId].n) + "</button>")
        : "";
      const explore = !p.done && lieux
        ? '<div class="small">Il reste ' + lieux.left.length + " lieu" + (lieux.left.length > 1 ? "x" : "") + " à explorer dans " + esc(zoneName(lieux.z)) + ".</div>" +
          '<div class="row wrap" style="margin:6px 0">' +
          (st.exp.active
            ? '<span class="tiny muted">🧭 En route…</span>'
            : reqAct + '<button class="btn small' + (reqId ? " ghost" : " pri") + '" data-exp="' + lieux.z + '">🧭 Explorer</button><span class="tiny muted">' + esc(lieux.left[0].n) + "</span>") +
          '<span class="tiny muted">' + lieux.done + " sur " + lieux.total + "</span></div>"
        : "";
      return '<div class="passbox"><div class="small"><b>🚧 ' + esc(p.P.n) + '</b> <span class="tiny muted">' + Math.floor(p.frac * 100) + ' %</span></div><div class="tiny muted">' + esc(p.P.t) + "</div>" +
        '<div class="bar pass"><i style="width:' + (p.frac * 100).toFixed(1) + '%"></i></div>' +
        (chantier && options.chantier ? (z === "riviere" ? window.EclatPasserelle.html(E) : window.EclatSentier.html(E)) : "") +
        explore +
        (p.done || lieux ? "" : '<div class="row wrap" style="margin:6px 0"><button class="btn small pri' + (p.can ? "" : " nope") + '" data-pour="' + z + '"' + (chantier ? ' title="Utiliser les matériaux disponibles pour faire avancer ces travaux"' : '') + '>🚧 ' + (chantier ? chantierLabel : "Déposer") + '</button><span class="tiny muted">Une fois franchi : +' + p.P.tr + " ✦ Souvenirs pour la prochaine relève</span></div>") +
        '<div class="passcost small">' +
        Object.keys(p.cost).map((i) => {
          const got = Math.min(p.cost[i], p.paid[i] || 0), ok = got >= p.cost[i], eta = passEta(p, i), have = st.inv[i] || 0;
          if (ok) return "";
          const manque = Math.max(0, p.cost[i] - got - have - E.queued(i));
          const times = I[i].r ? Math.ceil(manque / (I[i].r[2] || 1)) : 0;
          return '<div class="pass-resource"><button type="button" class="ing link" data-goto="' + i + '" title="' + esc(I[i].n) + ' : voir la fiche">' + icon(i, "sm") + '<span><b>' + esc(I[i].n) + '</b> ' + fmt(got) + ' / ' + fmt(p.cost[i]) + (chantier ? ' utilisés ' : ' déposés ') + '<span class="tiny muted">· tu en as ' + fmt(have) + (eta === "prêt" ? ' : de quoi finir' : eta ? ' · encore ' + eta : '') + '</span></span></button>' +
            (times && st.known[i] ? '<button type="button" class="btn small ghost" data-tree="' + i + '" data-n="' + times + '" title="Préparer les ressources manquantes du passage, avec leurs ingrédients">Préparer ×' + fmt(times * (I[i].r[2] || 1)) + '</button>' : '') + '</div>';
        }).join("") + "</div></div>";
    }
    /* combien de temps avant d’avoir de quoi payer une matière, à la production actuelle (extracteurs, machines) */
    function passEta(p, i) {
      const need = (p.left[i] || 0) - (S().inv[i] || 0);
      if (need <= 0) return "prêt";
      const x = E.production().find((y) => y.id === i), r = x ? x.net : 0;
      return r > 1e-6 ? "≈ " + fmtTime(need / r) : "";
    }
    function pour(z, btn) {
      const before = E.passInfo(z);
      const r = E.passPour(z), p = E.passInfo(z);
      if (!r.ok && r.why === "lieux") {
        A.fail(0);
        toast((r.lieux.left.length > 1 ? "Il reste " + r.lieux.left.length + " lieux" : "Il reste un lieu") + " à explorer dans " + esc(zoneName(r.lieux.z)) + " avant ce passage.", { key: "pour" });
        render(true);
        return;
      }
      if (!r.ok) {
        A.fail(0);
        toast("Dépôt impossible. Ressources manquantes : " + Object.keys(p.left).map((k) => fmt(p.left[k]) + " " + esc(I[k].n)).join(", ") + ".", { key: "pour" });
        return;
      }
      A.click(); vibe(10);
      if (["plaine", "riviere"].includes(z) && window.EclatStyleMode === "vivant") E.emit(z === "riviere" ? "passerellework" : "sentierwork", { from: before.frac, to: r.done ? 1 : p.frac, focus: !!btn.closest('#v-domaine') });
      const pt = elCenter(btn);
      if (!r.done) floater("🚧 " + Math.floor(p.frac * 100) + " %", pt.x, pt.y - 16, "var(--good)");
      render(true);
    }
    function stepBox(id, why, isTarget) {
      const st = S(), it = I[id];
      if (why === "pass") { const z = E.passPending().find((x) => E.ZONES[x].req === id); if (z) return '<div class="stepbox"><div class="tiny muted">' + WHY_STEP.pass + "</div>" + passHTML(z) + "</div>"; }
      let h = '<div class="stepbox">';
      if (!isTarget) h += '<div class="tiny muted">' + (WHY_STEP[why] || "Prochaine étape :") + '</div><div class="row" style="margin:4px 0">' + itemPill(id) + '</div>' + (it.h && !st.known[id] ? '<div class="riddle small">« ' + esc(it.h) + " »</div>" : "");
      if (!st.known[id]) {
        const lvl = st.hints[id] || 0;
        if (lvl >= 1) h += '<div class="memo">💭 L’action : ' + gesteChip(id) + "</div>";
        if (lvl >= 2) { const m = mainIngredient(id); h += '<div class="memo">💭 Une des ressources : ' + icon(m, "sm") + " " + esc(I[m].n) + "</div>"; }
      } else {
        const b = E.blocker(id);
        h += '<div class="rl small">' + gesteChip(id) + ingHTML(E.costFor(id), { check: true, link: true }) + "</div>";
        if (!b) h += '<div class="row wrap" style="margin-top:6px"><button class="btn small pri" data-chain="' + id + '">⚡ Fabriquer</button><button class="btn small" data-tree="' + id + '">🌳 Détail</button>' +
          (st.track && st.track.id === id ? "" : '<button class="btn small" data-track="' + id + '">🎯 Suivre</button>') + "</div>";
      }
      return h === '<div class="stepbox">' ? "" : h + "</div>";
    }

    /* la jauge des souvenirs : elle avance avec chaque combinaison nouvelle essayée */
    function memoryHTML(m, gain) {
      if (!m) return "";
      const f = Math.max(0, Math.min(1, (m.p - m.prev) / (m.next - m.prev)));
      const what = (["le geste", "une des ressources", "la recette entière"][m.lvl] || "") + (I[m.id] ? " de « " + I[m.id].n + " »" : "");
      return '<div class="memory"><div class="row between tiny"><span>💭 Souvenirs' + (gain ? ' <b class="gain">' + gain + "</b>" : "") + "</span><span class=\"muted\">prochain : " + what + "</span></div>" +
        '<div class="bar"><i style="width:' + (f * 100).toFixed(0) + '%"></i></div>' +
        (gain ? "" : '<div class="tiny dim">Chaque nouvelle combinaison tentée à l’Atelier réveille des souvenirs, surtout si elle se rapproche de ce que tu cherches.</div>') + "</div>";
    }
    function trackerHTML() {
      const t = S().track;
      if (!t || !I[t.id]) return "";
      const id = t.id, p = E.plan(id, 1);
      const ready = p.ok;
      let h = '<div class="card track' + (ready ? " ready" : "") + '"><div class="row between"><div class="lbl">🎯 Suivi d’artisanat</div><button class="btn small ghost" data-untrack title="Arrêter le suivi">✕</button></div>' +
        '<div class="row" style="margin:4px 0 6px">' + itemPill(id) + "</div>";
      if (E.queued(id) > 0) return h + '<div class="small">✋ En cours…</div></div>';
      if (ready) return h + '<div class="small" style="color:var(--good);font-weight:600">✓ Toutes les ressources sont réunies !</div><button class="btn small pri ready-pulse" style="margin-top:6px;width:100%" data-chain="' + id + '">⚡ Fabriquer ' + esc(I[id].n) + '</button></div>';
      const f = E.flows();
      const cost = I[id].r ? E.costFor(id) : {};
      if (Object.keys(cost).length > 0) {
        h += '<div class="row wrap" style="gap:4px;margin-bottom:6px">' + Object.keys(cost).map((k) => {
          const have = S().inv[k] || 0, req = cost[k], ok = have >= req;
          return '<span class="ing ' + (ok ? "paid" : "lack") + '" data-goto="' + k + '">' + icon(k, "sm") + esc(I[k].n) + ' ' + fmt(have) + '/' + fmt(req) + (ok ? ' ✓' : '') + '</span>';
        }).join("") + '</div>';
      }
      Object.keys(p.missing).forEach((k) => {
        if (p.locked.includes(k) || p.blocked[k]) return;
        const need = p.missing[k];
        const have = Math.floor(S().inv[k] || 0);
        const net = E.rate(k) + (f.prod[k] || 0) - (f.cons[k] || 0);
        const eta = net > 0 ? "≈ " + fmtTime(need / net) : isRawGather(k) ? "à récolter" : "";
        h += '<div class="cost-row" data-goto="' + k + '">' + icon(k, "sm") + '<span class="grow">' + esc(I[k].n) + '</span><span class="tiny" style="color:var(--bad)">il manque ' + fmt(need) + '</span><span class="tiny muted eta">' + eta + "</span></div>";
        void have;
      });
      p.locked.forEach((k) => { h += '<div class="why" style="display:flex;align-items:center;gap:6px">Recette inconnue : ' + itemPill(k, { unk: true }) + "</div>"; });
      Object.keys(p.blocked).forEach((k) => { const b = p.blocked[k]; h += '<div class="why" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' + itemPill(k) + " : " + needText(k, b, true) + "</div>"; });
      return h + "</div>";
    }

    function questChip() {
      const qBtn = $("#questBtn");
      if (!qBtn) return;
      const sum = E.questSummary();
      // la puce arrive avec le premier âge (ou dès qu’une quête est prête)
      qBtn.classList.toggle("hidden", !(S().age > 0 || sum.hasReady));
      const qSub = $("#questSub");
      const qDot = $("#questDot");
      const rits = sum.rituals;
      const doneRits = rits.filter((r) => r.claimed).length;
      if (qSub) qSub.textContent = doneRits + "/3";
      qBtn.setAttribute("aria-label", "Quêtes : " + doneRits + " sur 3" + (sum.hasReady ? " (récompense disponible)" : ""));
      qBtn.setAttribute("title", "Quêtes : " + doneRits + " sur 3 accomplies" + (sum.hasReady ? " · récompense à récupérer !" : " (toucher pour ouvrir)"));
      if (qDot) {
        if (sum.hasReady) {
          qDot.classList.remove("hidden");
          qBtn.classList.add("ready");
        } else {
          qDot.classList.add("hidden");
          qBtn.classList.remove("ready");
        }
      }
    }

    /* les jours de présence : un compteur discret, jamais une série */
    function joursHTML() {
      const J = E.jours();
      if (!(J.n > 0)) return "";
      const c = J.cadeau, nx = E.jourProchain();
      const gift = c ? [c.intu ? c.intu + " ✨" : "", c.tr ? c.tr + " ✦" : ""].filter(Boolean).join(" et ") : "";
      return '<div class="jours"><b>Jour ' + J.n + "</b>" + (gift ? ' <span class="tiny muted">· ton cadeau : ' + gift + "</span>" : "") +
        (c && c.t ? '<div class="tiny muted"><i>' + esc(c.t) + "</i></div>" : "") +
        (nx ? '<div class="tiny dim">Un cadeau plus gros au jour ' + nx + ".</div>" : "") + "</div>";
    }
    // La fenêtre a ses propres commandes ; les actions de la carte du Domaine
    // ne sont pas écoutées dans une fenêtre modale.
    function questNextHTML(sc) {
      const id = sc.targetId, it = id && I[id];
      if (it && !S().known[id]) return (it.h ? '<p class="small"><i>« ' + esc(it.h) + ' »</i></p>' : '') +
        '<button class="btn pri" data-m="qresume" data-tab="labo">Découvrir au Labo</button>';
      let h = sc.missKeys.length ? '<div class="small row wrap"><span class="muted">Il manque :</span> ' +
        sc.missKeys.map((k) => itemPill(k, { qty: sc.missing[k], lack: true })).join("") + '</div>' : '';
      if (it && it.r && E.orderStatus(id, 1).ok) h += '<button class="btn pri" data-m="qmake" data-id="' + id + '">Fabriquer : ' + esc(it.n) + '</button><p class="tiny muted">Mains et machines disponibles · attendra les matières manquantes.</p>';
      const res = sc.missKeys.find((k) => E.isRawRes(k) && E.zoneOpen(E.RES_ZONE[k]));
      if (res) {
        const ee = E.extEtat(res);
        if (ee) h += '<p class="small">' + (ee.etat === "libre" ? esc(I[ee.t].n) + ' attend d’être posé.' : 'Ton extracteur est arrêté.') + '</p>';
        h += '<button class="btn pri" data-gz="' + E.RES_ZONE[res] + '">Aller au gisement · ' + esc(zoneName(E.RES_ZONE[res])) + '</button>';
      } else h += '<button class="btn pri" data-m="qresume" data-tab="domaine">Reprendre l’objectif dans les Terres</button>';
      return h;
    }

    function openQuestsModal(initialTab) {
      U.questTab = initialTab || U.questTab || "scenario";
      const makeHTML = () => {
        const sum = E.questSummary();
        const sc = sum.scenario;
        const rits = sum.rituals;
        const tq = sum.troqueur;
        const rep = E.troqueurRep();
        const tab = U.questTab;

        let h = '<h2>Quêtes</h2>';
        h += '<div class="quest-tabs">' +
          '<button class="' + (tab === "scenario" ? "on" : "") + '" data-mqtab="scenario">📜 Objectifs' + (sc.ready ? ' <span class="qdot"></span>' : '') + '</button>' +
          '<button class="' + (tab === "rituals" ? "on" : "") + '" data-mqtab="rituals">🕯️ Rituels' + (sum.readyRitual ? ' <span class="qdot"></span>' : '') + '</button>' +
          '<button class="' + (tab === "troqueur" ? "on" : "") + '" data-mqtab="troqueur">⚖️ Troqueur' + (sum.payableAsk ? ' <span class="qdot"></span>' : '') + '</button>' +
          '</div>';

        if (tab === "scenario") {
          h += '<div class="quest-hero">' +
            '<div class="quest-chapter">' + esc(sc.chapter) + ' · ' + esc(sc.ageName) + '</div>' +
            '<div class="quest-titre">' + (sc.ob && sc.ob.n ? esc(sc.ob.n) : sc.ob && sc.ob.id ? esc(I[sc.ob.id].n) : "Objectif en cours") + '</div>' +
            (sc.txt ? '<div class="small muted" style="margin-bottom:8px"><i>« ' + esc(sc.txt) + ' »</i></div>' : '') +
            (sc.targetId ? '<div style="margin:8px 0">' + (sc.ob && sc.ob.id && sc.targetId !== sc.ob.id ? '<span class="tiny muted">Il faut d’abord : </span>' : '') + itemPill(sc.targetId) + '</div>' : '') +
            (sc.ready ? '<div class="small" style="color:var(--good);font-weight:600">✓ Prêt à fabriquer !</div><button class="btn pri" style="margin-top:8px;width:100%" data-m="qmake" data-id="' + sc.targetId + '">⚡ Fabriquer maintenant</button>'
              : questNextHTML(sc)) +
            '</div>';
        } else if (tab === "rituals") {
          h += joursHTML();
          h += '<div class="small muted" style="margin-bottom:8px">Trois rituels renouvelés chaque jour. Réclame tes récompenses une fois les objectifs atteints :</div>';
          rits.forEach((r, idx) => {
            const pct = Math.min(100, Math.floor((r.prog / r.target) * 100));
            const rewTxt = r.reward.tr ? '+' + r.reward.tr + ' ✦ Souvenirs' : r.reward.intu ? '+' + r.reward.intu + ' ✨ Intuition' : '+' + r.reward.ecus + ' écus';
            h += '<div class="ritual-card' + (r.done ? ' done' : '') + (r.claimed ? ' claimed' : '') + '">' +
              '<div class="ritual-head"><span class="ritual-ic">' + r.ic + '</span><div class="grow"><div class="ritual-title">' + esc(r.n) + '</div><div class="tiny muted">' + esc(r.d) + '</div></div>' +
              '<span class="reward-tag">' + rewTxt + '</span></div>' +
              '<div class="ritual-prog-bar"><i style="width:' + pct + '%"></i></div>' +
              '<div class="ritual-foot"><span class="tiny muted">' + fmt(r.prog) + ' / ' + fmt(r.target) + ' (' + pct + ' %)</span>' +
              (r.claimed ? '<span class="tiny" style="color:var(--good);font-weight:600">✓ Réclamé</span>'
                : r.done ? '<button class="btn small pri ready-pulse" data-m="claimrit" data-idx="' + idx + '">🎁 Réclamer</button>'
                : '<span class="tiny muted">En cours</span>') +
              '</div></div>';
          });
        } else if (tab === "troqueur") {
          h += '<div class="troqueur-rank">' +
            '<div class="troqueur-rank-name">⚖️ ' + esc(rep.cur.n) + ' (Rang ' + rep.cur.lvl + ')</div>' +
            '<div class="tiny muted">Contrats honorés : <b>' + rep.cnt + '</b>' + (rep.cur.bonus ? ' · +' + rep.cur.bonus + ' ✦ bonus par contrat' : '') + (rep.next ? ' · encore ' + (rep.next.req - rep.cnt) + ' pour ' + esc(rep.next.n) : ' · rang maximum') + '</div>' +
            '</div>';
          if (!E.comptoirOpen()) {
            h += '<p class="small muted center" style="padding:15px 0">Le Comptoir du Troqueur s’ouvrira lorsque tu auras atteint sa terre.</p>';
          } else if (!tq.length) {
            h += '<p class="small muted center" style="padding:15px 0">Aucune demande pour l’instant. Le Troqueur en prépare d’autres.</p>';
          } else {
            tq.forEach((ask, idx) => {
              if (!ask) return;
              const have = S().inv[ask.id] || 0, can = have >= ask.n;
              h += '<div class="contract-row">' +
                '<div class="row between"><div style="display:flex;align-items:center;gap:6px">' + itemPill(ask.id, { qty: ask.n }) + '</div><span class="small" style="font-weight:700;color:#ffd36b">+' + (ask.tr + (rep.cur.bonus || 0)) + ' ✦</span></div>' +
                '<div class="row between tiny" style="margin-top:4px"><span class="' + (can ? 'muted' : 'bad') + '">En réserve : ' + fmt(have) + ' / ' + fmt(ask.n) + '</span>' +
                '<button class="btn mini' + (can ? ' pri' : '') + '" data-m="delivask" data-idx="' + idx + '"' + (can ? '' : ' disabled') + '>Livrer</button></div>' +
                '</div>';
            });
          }
        }

        h += '<div class="acts" style="margin-top:12px"><button class="btn ghost" data-m="close">Fermer</button></div>';
        return h;
      };

      const modalObj = {
        html: makeHTML(),
        refresh: makeHTML,
        reopen: () => openQuestsModal(),
        on: {
          claimrit: (b) => {
            const idx = Number(b.dataset.idx);
            const res = E.claimRitual(idx);
            if (res.ok) {
              A.secret ? A.secret() : A.click();
              vibe([20, 60, 20]);
              toast("🎁 Récompense de rituel obtenue !", { key: "rit" });
              save();
              render(true);
              swapModal(Object.assign(modalObj, { html: makeHTML() }));
            }
            return true;
          },
          delivask: (b) => {
            const idx = Number(b.dataset.idx);
            const res = E.deliverAsk(idx);
            if (res.ok) {
              A.click();
              vibe(15);
              toast("✦ +" + (res.ask.tr + (res.bonus || 0)) + " Souvenirs !", { key: "troqueur" });
              save();
              render(true);
              swapModal(Object.assign(modalObj, { html: makeHTML() }));
            }
            return true;
          },
          qresume: (b) => {
            closeModal();
            setTab(b.dataset.tab);
            return true;
          },
          qmake: (b) => {
            const id = b.dataset.id;
            closeModal();
            chainCraft(b, id, 1);
            return true;
          }
        }
      };
      openModal(modalObj);
    }

    return { goalCard, goalSig, goalOpen, openMilestones, passHTML, pour, memoryHTML, trackerHTML, questChip, openQuestsModal };
  }

  window.EclatQuetes = { create };
})();
