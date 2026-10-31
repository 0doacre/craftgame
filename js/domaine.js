/* ÉCLAT — le Domaine : tout ce qui produit, en une page qui défile.
 * Les terres ouvertes (la plus récente en premier) et leurs gisements, les chaînes
 * de machines, le passage en cours et le Grand Œuvre. Le moteur fait le calcul ;
 * ici on affiche, et on traduit les gestes du joueur en appels au moteur. */
(function () {
  "use strict";

  const CAPS = [0, 10, 50, 100, 200, 500, 1000, 5000, 20000, 100000];
  const SHOWN = 2; // terres dépliées d’office ; les plus anciennes se replient

  function create(api) {
    const { E, A, D, U, esc, fmt, fmtNum, fmtTime, perMin, needText, limitHTML, deZone, sparks, icon, toast, openModal, closeModal, norm, vibe, floater, passHTML, render, quiet } = api;
    const uiSigne = api.uiSigne || (() => "");
    const recitInline = api.recitInline || ((t) => esc(t));
    const itemPill = api.itemPill || ((id) => esc(id));
    const I = D.ITEMS;
    const Decouvertes = window.EclatDecouvertesCarnet.create({ E, A, esc, openModal });
    const Plaine = window.EclatDecouvertesCarnet.create({ E, A, esc, openModal, zone: "plaine" });
    const Riviere = window.EclatDecouvertesCarnet.create({ E, A, esc, openModal, zone: "riviere" });
    const Collines = window.EclatDecouvertesCarnet.create({ E, A, esc, openModal, zone: "collines" });
    const S = () => E.state;
    const perTime = perMin;
    const plural = (n, w) => n + " " + w + (n > 1 ? "s" : "");
    /* le nom court d’un extracteur ou d’une machine, accordé : « 1 cabane », « 3 meules » */
    const nm = (id, n) => (n > 1 ? I[id].pl || I[id].n.toLowerCase() : I[id].sn || I[id].n.toLowerCase());
    const many = (id, n) => n + " " + nm(id, n);
    /* « Âge de l’Électricité » → « Électricité » */
    const ageShort = (a) => D.AGES[a].n.replace(/^Âge (du |de la |de l’|des |de )?/, "");

    /* ------------------------------------------------------------ données */
    function openZones() { return D.ZONES.filter((z) => E.zoneOpen(z.id)).map((z) => z.id); }
    /* un gisement se montre s’il se récolte à la main, s’il est exploité, ou si on connaît de quoi l’exploiter */
    function depShown(z, d) {
      if (d.hand || E.domExt(z, d.res)) return true;
      return E.extFor(d.res, z).some((t) => S().known[t] || E.count(t) >= 1);
    }
    // Un extracteur neuf peut révéler une ressource dans une terre ancienne repliée.
    // Le rappel reste jusqu’à sa pose, y compris après rechargement de la partie.
    function nouveauxGisementsHTML() {
      const deps = E.deposits().filter((d) => !d.hand && !E.domExt(d.z, d.res));
      return deps.map((d) => {
        const ch = E.extChoice(d.res, d.z);
        if (!ch || ch.free < 1) return "";
        return '<section class="dom-card dom-nouveau-gisement" data-new-deposit="' + d.key + '">' +
          '<div class="kicker">Gisement à exploiter</div><h3>' + icon(d.res) + ' ' + esc(I[d.res].n) + '</h3>' +
          '<p class="small">' + esc(I[ch.t].n) + ' attend d’être posé dans ' + esc(E.ZONES[d.z].n) + '. Ce gisement ne se récolte pas à la main.</p>' +
          '<div class="row wrap"><button class="btn pri" data-xadd="' + d.key + '" data-n="1">Poser ' + esc(I[ch.t].n.toLowerCase()) + '</button>' +
          '<button class="btn ghost" data-gz="' + d.z + '">Voir ' + esc(E.ZONES[d.z].n) + '</button></div></section>';
      }).join("");
    }
    function depRate(z, res) {
      const e = E.domExt(z, res);
      return e && E.machInfo(E.extKey(z, res)).s === "ok" ? E.extOut(e) : 0;
    }
    function zoneRate(z) { return E.zoneDeps(z).reduce((a, d) => a + depRate(z, d.res), 0); }

    /* ------------------------------------------------------------ la page */
    /* ------------------------------------------------------------ TERRES (0.39)
     * Une terre par écran, glissable ; l’illustration de la terre est le fond de la page.
     * Objectif, relève, Comptoir, production et œuvres sont des pastilles qui ouvrent un panneau. */
    const FOND_CARTE = { caveau: 1 };
    const fondDe = (z) => new URL("assets/terres/" + z + (FOND_CARTE[z] ? "-carte" : "-decor") + ".webp", document.baseURI).href;
    const vignetteDe = (z) => new URL("assets/terres/" + z + "-carte.webp", document.baseURI).href;
    function terreCourante() {
      const zs = openZones();
      if (!zs.length) return null;
      if (!zs.includes(U.zone)) U.zone = zs[zs.length - 1];
      return U.zone;
    }
    function allerTerre(z) {
      const zs = openZones();
      if (!zs.includes(z)) return false;
      U.zone = z; U.terrePanel = null;
      render(true);
      return true;
    }
    function terreVoisine(d) {
      const zs = openZones(), i = zs.indexOf(terreCourante());
      const j = Math.max(0, Math.min(zs.length - 1, i + d));
      if (j !== i) allerTerre(zs[j]);
    }
    function pastilleHTML(k, label, extra) {
      return '<button type="button" class="pastille terres-pastille' + (U.terrePanel === k ? " on" : "") + (extra || "") + '" data-terre-panel="' + k + '" aria-expanded="' + (U.terrePanel === k) + '">' + label + "</button>";
    }
    /* une ligne de gisement, compacte : un appui sur l’icône récolte, un appui sur le nom ouvre le gisement */
    function terreGisHTML(z, d) {
      const st = S(), res = d.res, key = E.extKey(z, res), e = E.domExt(z, res);
      const ch = E.extChoice(res, z), info = E.machInfo(key), rate = depRate(z, res);
      const can = ch ? (E.freeExt(ch.t) >= 1 || E.plan(ch.t, 1).ok) : false;
      const rateTxt = rate > 0 ? "+" + perTime(rate) : e && info.s === "off" ? "⏸" : "";
      const on = st.act && st.act.k === "harv" && st.act.res === res && st.act.z === z;
      const ic = d.hand ? '<button type="button" class="terre-recolte" data-harv="' + key + '" aria-label="Récolter : ' + esc(I[res].n) + '">' + icon(res) + "</button>" : '<span class="terre-recolte inerte">' + icon(res) + "</span>";
      return '<div class="gis gis-compact terre-gis' + (rate > 0 ? " gis-producing" : "") + '" data-gis="' + key + '">' + ic +
        '<button type="button" class="gis-compact-btn terre-gis-corps" data-gsheet="' + key + '" aria-label="' + esc(I[res].n) + ' : gérer les extracteurs"><span class="gis-compact-info"><span class="gis-compact-name">' + esc(I[res].n) + '</span><span class="terre-gis-ligne"><b class="gis-compact-c" data-c="' + res + '">' + fmt(st.inv[res] || 0) + '</b> <span class="dom-rate gis-compact-rate' + (rateTxt ? "" : " hidden") + '" data-rate="' + key + '">' + rateTxt + "</span>" + (d.hand ? '<span class="tiny muted terre-main">à la main</span>' : "") + "</span></span></button>" +
        (d.hand ? '<button type="button" class="mini harvest terre-boucle' + (on ? " on" : "") + '" data-hloop="' + key + '" aria-pressed="' + on + '" aria-label="' + (on ? "Arrêter la récolte en continu : " : "Récolter en continu : ") + esc(I[res].n) + '" title="Récolte en continu, même jeu fermé">' + (on ? "■" : "▶") + "</button>" : "") +
        (ch ? '<button type="button" class="mini terre-ajout' + (can ? "" : " nope") + '" data-xadd="' + key + '" data-n="1" aria-label="Poser ' + esc(nm(ch.t, 1)) + '">+ ' + esc(nm(ch.t, 1)) + "</button>" : "") + "</div>";
    }
    function terresView() {
      const st = S(), z = terreCourante();
      if (!z) return '<div class="terres"></div>';
      const Z = E.ZONES[z], zs = openZones();
      const sugRel = E.shouldSuggestReleve && E.shouldSuggestReleve();
      const g = E.guide();
      const goalTitle = g ? (g.ob.k === "craft" ? I[g.ob.id].n : g.ob.n) : "Objectif";
      const oeuvres = Object.keys(D.PROJECTS).filter((pid) => E.projVisible(pid) && E.projState(pid).step < D.PROJECTS[pid].steps.length);
      let h = '<div class="dom terres" data-terre-courante="' + z + '">';
      // les pastilles : une seule ligne de 40 px
      h += '<div class="terres-pastilles">' + pastilleHTML("obj", "📜 " + esc(goalTitle)) +
        (sugRel ? pastilleHTML("rel", "✦ Relais +" + sugRel.gain) : "") +
        (E.zoneOpen(D.COMPTOIR.zone) ? pastilleHTML("comptoir", "⚖️ Comptoir") : "") +
        (oeuvres.length ? pastilleHTML("oeuvre", "🏗️ Œuvre") : "") +
        (E.hasFactory && E.hasFactory() ? pastilleHTML("prod", "⚙️ Production") : "") +
        "</div>";
      h += nouveauxGisementsHTML();
      // la rangée des terres
      h += '<nav class="terres-rangee" aria-label="Les terres">';
      D.ZONES.forEach((land) => {
        const id = land.id;
        if (!E.zoneOpen(id)) return;
        const fermee = isZonePassed(id), cur = id === z;
        h += '<button type="button" class="terres-icone' + (cur ? " is-courante" : "") + (fermee ? " is-traversee" : "") + '" data-terre-go="' + id + '" aria-label="' + esc(E.ZONES[id].n) + (fermee ? ", terre traversée" : "") + '"' + (cur ? ' aria-current="true"' : "") + '><img src="' + vignetteDe(id) + '" alt="" loading="lazy" decoding="async"></button>';
      });
      h += "</nav>";
      // la page de la terre
      const i = zs.indexOf(z);
      h += '<section class="dom-terre terre-page" id="dt-' + z + '" data-terre="' + z + '">' +
        '<img class="terre-fond" src="' + fondDe(z) + '" alt="" decoding="async">' +
        '<div class="dom-th terre-tete"><button type="button" class="terre-nav" data-terre-nav="-1" aria-label="Terre précédente"' + (i <= 0 ? " disabled" : "") + '>‹</button>' +
        '<div class="terre-titre"><p class="kicker">' + esc(D.AGES[st.age].n) + '</p><h2>' + esc(Z.n) + '</h2></div>' +
        '<button type="button" class="terre-nav" data-terre-nav="1" aria-label="Terre suivante"' + (i >= zs.length - 1 ? " disabled" : "") + '>›</button></div>' +
        '<div class="terre-corps">';
      h += (regleHTML(z) || "").replace('class="dom-regle', 'class="terre-regle dom-regle');
      h += lieuHTML(z);
      const reprise = E.reprisePending ? E.reprisePending() : [];
      if (reprise.length) h += '<div class="dom-card dom-reprise"><div class="row wrap"><span class="grow small"><b>Reprendre l’installation</b> · ' + reprise.length + ' équipement(s)</span><button class="btn small" data-reprise>Plan de reprise</button></div></div>';
      const tip = hint();
      if (tip) h += '<div class="dom-tip">' + tip + "</div>";
      const deps = E.zoneDeps(z).filter((d) => depShown(z, d));
      h += '<div class="terre-gisements">';
      deps.forEach((d) => { h += terreGisHTML(z, d); });
      h += "</div>";
      if (!deps.some((d) => d.hand) && !deps.some((d) => E.domExt(z, d.res)) && deps.length) h += '<p class="tiny muted">Ces ressources nécessitent des extracteurs pour être récoltées.</p>';
      h += ruinsBlock(z, Object.keys(E.ruins()).filter((id) => I[id] && I[id].t === "ext" && E.extZones(id)[0] === z));
      h += '<div class="terre-bas">';
      if (z === "lisiere") h += Decouvertes.sceneHTML() + Decouvertes.studyHTML();
      if (z === "lisiere" && E.zoneOpen("plaine")) h += '<div class="sentier-retained">' + window.EclatSentier.html(E) + '<div class="row wrap"><button class="btn small" data-gz="plaine">Emprunter le sentier</button><button class="btn small ghost" data-sentier-replay>Revoir les travaux</button></div></div>';
      if (z === "plaine") h += Plaine.sceneHTML() + Plaine.studyHTML();
      if (z === "plaine" && E.zoneOpen("riviere")) h += '<div class="sentier-retained">' + window.EclatPasserelle.html(E) + '<div class="row wrap"><button class="btn small" data-gz="riviere">Emprunter la passerelle</button><button class="btn small ghost" data-passerelle-replay>Revoir les travaux</button></div></div>';
      if (z === "riviere") h += Riviere.studyHTML();
      if (z === "collines") h += Collines.studyHTML();
      if (z === zs[zs.length - 1]) {
        E.passPending().forEach((pz) => {
          const gd = E.guide();
          if (gd && gd.ob.k === "pass" && gd.ob.z === pz && !(["plaine", "riviere"].includes(pz) && window.EclatStyleMode === "vivant")) return;
          const p = E.passInfo(pz);
          if (p && p.ready) h += '<section class="dom-card dom-pass" id="dpass-' + pz + '"><h3>Vers ' + esc(E.ZONES[pz].n) + "</h3>" + passHTML(pz, { chantier: true }) + "</section>";
        });
      }
      h += E.territoiresHTML(z, esc, U.terresOpen && U.terresOpen[z]);
      h += '<button type="button" class="btn mini ghost btn-contempler" data-contempler="' + z + '" aria-label="Contempler l’aquarelle de cette terre : ' + esc(Z.n) + '">🖼️ Contempler</button>';
      h += "</div></div></section>";
      if (U.terrePanel) h += panneauTerres(U.terrePanel);
      return h + "</div>";
    }
    function panneauTerres(k) {
      const titres = { obj: "Objectif", rel: "Relais", comptoir: "Comptoir", oeuvre: "Grand Œuvre", prod: "Production" };
      let corps = "";
      if (k === "obj") corps = api.top();
      else if (k === "rel") {
        const s = E.shouldSuggestReleve && E.shouldSuggestReleve();
        corps = s ? '<p class="small">Les ressources deviennent lourdes à arracher et les mains fatiguent. En passant le relais maintenant, tu transmettras <b>+' + s.gain + ' Souvenirs</b> pour éveiller un Semeur aux récoltes démultipliées.</p><button class="btn pri" data-m="releve">Passer le relais (+' + s.gain + " ✦)</button>" : "";
      } else if (k === "comptoir") corps = E.zoneOpen(D.COMPTOIR.zone) ? comptoirHTML() : "";
      else if (k === "oeuvre") corps = Object.keys(D.PROJECTS).filter((pid) => E.projVisible(pid) && E.projState(pid).step < D.PROJECTS[pid].steps.length).map(oeuvreHTML).join("");
      else if (k === "prod") corps = (domaineMachinesSummary() + prodHTML()) || '<p class="small muted">Rien ne tourne encore ici : les machines et les extracteurs apparaîtront dans cette feuille.</p>';
      return '<div class="terres-panneau" role="dialog" aria-label="' + esc(titres[k] || "") + '"><div class="terres-panneau-tete"><b>' + esc(titres[k] || "") + '</b><button type="button" class="btn small" data-terre-panel="">Fermer</button></div><div class="terres-panneau-corps">' + corps + "</div></div>";
    }
    /* glisser à l’horizontale pour passer d’une terre à l’autre (le doigt, pas la souris) */
    (function swipe() {
      let x0 = null, y0 = 0;
      document.addEventListener("touchstart", (ev) => {
        const t = ev.target.closest && ev.target.closest(".terre-page");
        x0 = t && ev.touches.length === 1 && !ev.target.closest(".terres-rangee, .terres-panneau") ? ev.touches[0].clientX : null; y0 = ev.touches[0].clientY;
      }, { passive: true });
      document.addEventListener("touchend", (ev) => {
        if (x0 === null || U.tab !== "domaine") { x0 = null; return; }
        const t = ev.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
        x0 = null;
        if (Math.abs(dx) > 60 && Math.abs(dy) < 45 && Math.abs(dx) > Math.abs(dy) * 1.8) terreVoisine(dx < 0 ? 1 : -1);
      }, { passive: true });
    })();
    function view() {
      return terresView();
    }
    function ancienneView() {
      const st = S(), zs = openZones().reverse();
      const dense = U.compact();
      let h = '<div class="dom' + (dense ? " dom-dense" : "") + '">';
      h += api.top();
      const reprise = E.reprisePending ? E.reprisePending() : [];
      if (reprise.length) h += '<section class="dom-card dom-reprise"><div class="row wrap"><span class="grow small"><b>Reprendre l’installation</b> · ' + reprise.length + ' équipement(s) restant(s)</span><button class="btn small" data-reprise title="Choisir les équipements et vérifier le coût avant de reconstruire">Plan de reprise</button></div></section>';
      h += nouveauxGisementsHTML();
      const tip = hint();
      if (tip) h += '<div class="dom-tip">' + tip + "</div>";
      const sugRel = E.shouldSuggestReleve && E.shouldSuggestReleve();
      if (sugRel) {
        h += '<div class="card acc releve-alerte" style="margin:8px 0 10px;border-left:3px solid var(--acc);background:var(--panel2)">' +
          '<div class="row between items-center"><span class="step-badge">✦ Relais conseillé</span><b class="mgain">+' + sugRel.gain + ' ✦</b></div>' +
          '<p class="small" style="margin:6px 0 8px">Les ressources deviennent lourdes à arracher et les mains fatiguent. En passant le relais maintenant, tu transmettras <b>+' + sugRel.gain + ' Souvenirs</b> pour éveiller un Semeur aux récoltes démultipliées.</p>' +
          '<button class="btn pri small" data-m="releve" title="Voir les gains de Souvenirs et les bonus de la prochaine relève">Passer le relais (+' + sugRel.gain + ' ✦)</button></div>';
      }
      const all = U.domAll || zs.length <= SHOWN + 1;
      zs.forEach((z, i) => { if (all || i < SHOWN || U.domOpen === z) h += terreHTML(z); });
      if (!all) {
        const rest = zs.filter((z, i) => i >= SHOWN && U.domOpen !== z);
        if (rest.length) {
          const r = rest.reduce((a, z) => a + zoneRate(z), 0);
          h += '<button class="dom-more" data-dall title="Afficher ou replier les autres terres">' + plural(rest.length, "autre terre") + (r > 0 ? " · +" + perTime(r) + " en tout" : "") + '<span>voir ▾</span></button>';
        }
      } else if (zs.length > SHOWN + 1) h += '<button class="dom-more" data-dall title="Afficher ou replier les autres terres">Replier les terres anciennes<span>▴</span></button>';
      h += domaineMachinesSummary();
      if (E.zoneOpen(D.COMPTOIR.zone)) h += comptoirHTML();
      E.passPending().forEach((z) => {
        const g = E.guide();
        if (g && g.ob.k === "pass" && g.ob.z === z && !(["plaine", "riviere"].includes(z) && window.EclatStyleMode === "vivant")) return; // le chantier peint garde sa scène dans les Terres
        const p = E.passInfo(z);
        if (p && p.ready) h += '<section class="dom-card dom-pass" id="dpass-' + z + '"><h3>Vers ' + esc(E.ZONES[z].n) + "</h3>" + passHTML(z, { chantier: true }) + "</section>";
      });
      for (const pid in D.PROJECTS) if (E.projVisible(pid) && E.projState(pid).step < D.PROJECTS[pid].steps.length) h += oeuvreHTML(pid);
      h += prodHTML();
      const q = D.AGES[st.age].q;
      if (q) h += '<p class="dom-epi">« ' + esc(q) + " »</p>";
      return h + "</div>";
    }

    function ruinHTML(id, count) {
      const st = S(), it = I[id];
      const cost = E.ruinCost(id);
      const res = E.ruinResolve ? E.ruinResolve(id) : null;
      const can = res ? res.ok : Object.keys(cost).every((k) => (st.inv[k] || 0) >= cost[k]);
      const shownCost = res && res.ok ? res.cost : cost;
      const costTxt = Object.keys(shownCost).map((k) => itemPill(k, { qty: shownCost[k], lack: (st.inv[k] || 0) < shownCost[k] })).join(" ");
      const name = E.ruinName(id);
      const echo = E.ruinEcho ? E.ruinEcho(id) : "";
      return '<div class="dom-ruine" data-druin="' + id + '">' +
        '<div class="grow"><div class="small"><b>' + esc(name) + "</b> · réparer : " + costTxt + "</div>" +
        (echo ? '<div class="tiny dim serif ruin-echo">« ' + esc(echo) + " »</div>" : "") +
        (count > 1 ? '<div class="tiny muted">' + count + " ruines à cet endroit</div>" : "") +
        "</div>" +
        '<button class="btn small' + (can ? " pri" : " nope") + '" data-repair="' + id + '">Réparer</button>' +
        "</div>";
    }

    /* les ruines d’une terre ou des machines : un seul bloc replié, sous ce qui se récolte. Ouvert d’emblée quand
     * on peut déjà réparer quelque chose ; un bouton répare tout ce que la Réserve permet. */
    function ruinsBlock(key, ids) {
      const st = S(), ruins = E.ruins();
      ids = ids.filter((id) => ruins[id] > 0);
      if (!ids.length) return "";
      const can = (id) => E.ruinResolve ? E.ruinResolve(id).ok : Object.keys(E.ruinCost(id)).every((k) => (st.inv[k] || 0) >= E.ruinCost(id)[k]);
      const total = ids.reduce((n, id) => n + ruins[id], 0), ready = ids.filter(can);
      ids = ready.concat(ids.filter((id) => !ready.includes(id)));
      const open = U.ruinesOpen && U.ruinesOpen[key] !== undefined ? U.ruinesOpen[key] : ready.length > 0;
      return '<details class="dom-ruines" data-ruines="' + key + '"' + (open ? " open" : "") + '><summary data-ruines-sum="' + key + '">🛖 ' + total + (total > 1 ? " ruines" : " ruine") + " à relever" +
        (ready.length ? ' · <b>' + ready.length + " à portée</b>" : "") + "</summary>" +
        (ready.length > 1 ? '<div class="dom-ruines-all"><button class="btn small pri" data-repair-all="' + ids.join(",") + '" title="Réparer tout ce que ta Réserve peut relever">Tout réparer</button></div>' : "") +
        ids.map((id) => ruinHTML(id, ruins[id])).join("") + "</details>";
    }

    /* la règle de la terre, en une ligne : ce qui la distingue des autres */
    function regleHTML(z) {
      const r = E.regle(z);
      if (!r) return "";
      const ok = r.etat === "ok";
      // la gêne a sa solution : un appui ouvre la fiche de la protection que l’on connaît déjà (rien de plus : sans recette connue, pas de bouton)
      const prot = r.etat === "gene" ? r.sans.find((i) => I[i] && S().known[i]) : null;
      return '<p class="dom-regle' + (ok ? " ok" : r.etat === "gene" ? " gene" : "") + '"><b>' + esc(r.n) + "</b> · " + esc(ok && r.ok ? r.ok : r.t) +
        (prot ? ' <button class="btn small" data-goto="' + prot + '">Voir : ' + esc(I[prot].n) + "</button>" : "") + "</p>";
    }
    /* les terres qui ont un décor illustré (assets/terres/<id>-decor.webp) */
    const DECORS = { lisiere: 1, plaine: 1, riviere: 1, collines: 1, mine: 1, desert: 1, gisement: 1, montagnes: 1, orbite: 1, lune: 1, mercure: 1 };
    const CARNET_DECORS = { lisiere: "lisiere", plaine: "plaine", riviere: "riviere", collines: "collines", mine: "mine", desert: "desert", gisement: "gisement", montagnes: "montagnes", orbite: "orbite", lune: "lune", mercure: "mercure", caveau: "caveau" };

    function openContemplation(z) {
      const Z = E.ZONES[z];
      if (!Z) return;
      const st = S();
      const number = D.ZONES.findIndex((land) => land.id === z) + 1;
      const painted = z === "riviere" && st.age >= 7 ? "riviere-vapeur" : CARNET_DECORS[z] || null;
      const scene = painted ? "assets/carnet/lands/" + painted + ".webp" : DECORS[z] ? "assets/terres/" + z + "-decor.webp" : "assets/terres/" + z + "-carte.webp";
      const exps = Z.exps || [];
      const done = (st.exp && st.exp.done && st.exp.done[z]) || 0;
      const total = exps.length;
      const resList = (Z.res || []).map((r) => (icon(r, "sm") || "") + " <span>" + esc(I[r]?.n || r) + "</span>").join(" · ");
      const ageName = D.AGES[st.age]?.n || "";

      const html = '<div class="contemplation-modal">' +
        '<div class="kicker">Planche ' + number + ' · ' + esc(ageName) + '</div>' +
        '<h2>' + esc(Z.n) + '</h2>' +
        '<div class="contemplation-canvas" data-zoom="fit" id="contemplationCanvas" role="region" aria-label="Aquarelle de ' + esc(Z.n) + '">' +
          '<img class="contemplation-img" id="contemplationImg" src="' + scene + '" alt="Aquarelle grand format : ' + esc(Z.n) + '" decoding="async">' +
          '<button type="button" class="btn mini ghost contemplation-zoom-btn" id="contemplationZoomBtn" title="Agrandir les détails de l’aquarelle" aria-label="Agrandir les détails de l’aquarelle">🔍 Agrandir</button>' +
        '</div>' +
        '<p class="contemplation-desc">« ' + esc(Z.d || "") + ' »</p>' +
        '<div class="contemplation-meta">' +
          '<div class="contemplation-res"><small>Ressources de la terre :</small><div>' + (resList || "<span>Aucune</span>") + '</div></div>' +
          '<div class="contemplation-exp"><small>Lieux explorés :</small> <b>' + done + ' / ' + total + '</b></div>' +
        '</div>' +
        '<div class="acts carnet-acts">' +
          '<button class="btn pri" data-m="close">Refermer</button>' +
        '</div>' +
      '</div>';

      openModal({
        cls: "modal-contemplation",
        html,
        onOpen: (box) => {
          const canvas = box.querySelector("#contemplationCanvas");
          const img = box.querySelector("#contemplationImg");
          const btn = box.querySelector("#contemplationZoomBtn");
          if (!canvas || !img || !btn) return;
          const toggleZoom = () => {
            const isFull = canvas.getAttribute("data-zoom") === "full";
            const next = isFull ? "fit" : "full";
            canvas.setAttribute("data-zoom", next);
            btn.textContent = isFull ? "🔍 Agrandir" : "🔎 Ajuster";
            btn.setAttribute("title", isFull ? "Agrandir les détails de l’aquarelle" : "Ajuster la vue d’ensemble");
            btn.setAttribute("aria-label", isFull ? "Agrandir les détails de l’aquarelle" : "Ajuster la vue d’ensemble");
            if (A && A.click) A.click();
          };
          btn.addEventListener("click", toggleZoom);
          img.addEventListener("click", toggleZoom);
        }
      });
    }

    function isZonePassed(z) {
      const idx = D.ZONES.findIndex((land) => land.id === z);
      if (idx < 0) return false;
      const nextZ = D.ZONES[idx + 1]?.id;
      if (!nextZ) return false;
      const st = S();
      return !!(E.zoneOpen(nextZ) || (st.pass && st.pass[nextZ] && st.pass[nextZ].done));
    }

    function compactGisHTML(z, d) {
      const st = S(), res = d.res, key = E.extKey(z, res), e = E.domExt(z, res);
      const ch = E.extChoice(res, z);
      const info = E.machInfo(key), rate = depRate(z, res);
      const isVivant = (window.EclatStyleMode === "vivant" || (document.documentElement && document.documentElement.getAttribute("data-style-mode") === "vivant"));
      const illustratedSource = isVivant && window.ECLAT_ILLUSTRATIONS && window.ECLAT_ILLUSTRATIONS.hasSource(res);
      const can = ch ? (E.freeExt(ch.t) >= 1 || E.plan(ch.t, 1).ok) : false;
      const pAdd = (ch && E.projectExtractor) ? E.projectExtractor(z, res, ch.t, 1) : null;
      const projTip = pAdd ? ' (débit : ' + perTime(pAdd.curRate) + ' → ' + perTime(pAdd.projRate) + ')' : '';
      const rateTxt = rate > 0 ? '+' + perTime(rate) : (e && info.s === 'off' ? '⏸' : '');
      const isProducing = rate > 0;

      return '<div class="gis gis-compact' + (isVivant && isProducing ? ' gis-producing' : '') + '" data-gis="' + key + '">' +
        '<button type="button" class="gis-compact-btn" data-gsheet="' + key + '" title="' + esc(I[res].n) + ' : gérer les extracteurs" aria-label="' + esc(I[res].n) + ' : gérer les extracteurs">' +
          '<div class="gis-compact-node' + (d.hand ? ' hand' : '') + '">' + (isVivant && (d.hand || illustratedSource) ? livingNode(res) : icon(res)) + '</div>' +
          '<div class="gis-compact-info">' +
            '<span class="gis-compact-name">' + esc(I[res].n) + '</span>' +
            '<b class="gis-compact-c" data-c="' + res + '">' + fmt(st.inv[res] || 0) + '</b>' +
            '<span class="dom-rate gis-compact-rate' + (rate > 0 ? '' : ' hidden') + '" data-rate="' + key + '">' + rateTxt + '</span>' +
          '</div>' +
        '</button>' +
        (ch ? '<button type="button" class="mini lbl gis-compact-add' + (can ? '' : ' nope') + '" data-xadd="' + key + '" data-n="1" title="Poser ' + esc(nm(ch.t, 1)) + esc(projTip) + '" aria-label="Poser ' + esc(nm(ch.t, 1)) + '">+ ' + esc(nm(ch.t, 1)) + '</button>' : '') +
      '</div>';
    }

    function terreHTML(z) {
      const st = S(), Z = E.ZONES[z];
      const deps = E.zoneDeps(z).filter((d) => depShown(z, d));
      const decor = DECORS[z] ? ' style="--decor:url(' + new URL('assets/terres/' + z + '-decor.webp', document.baseURI).href + ')"' : "";
      const carnet = window.EclatStyleMode === "vivant";
      const number = D.ZONES.findIndex((land) => land.id === z) + 1;
      const painted = z === "riviere" && st.age >= 7 ? "riviere-vapeur" : CARNET_DECORS[z] || null;
      const scene = painted ? "assets/carnet/lands/" + painted + ".webp" : DECORS[z] ? "assets/terres/" + z + "-decor.webp" : null;
      const btnContempler = '<button type="button" class="btn mini ghost btn-contempler" data-contempler="' + z + '" title="Contempler l’aquarelle de cette terre : ' + esc(Z.n) + '" aria-label="Contempler l’aquarelle de cette terre : ' + esc(Z.n) + '">🖼️ Contempler</button>';
      const passed = isZonePassed(z);
      const closed = passed && !U.domAll && !(U.domLandsOpen && U.domLandsOpen[z]);
      let h;

      if (closed) {
        h = carnet
          ? '<section class="dom-terre carnet-terre dom-terre-fermee" id="dt-' + z + '">' +
            '<div class="carnet-running"><span>Terre traversée</span><span>Terre ' + number + '</span></div>' +
            '<div class="dom-th dom-closed-header"><div><h3>' + esc(Z.n) + '</h3></div>' +
            '<div class="row items-center dom-closed-acts">' + btnContempler +
            '<button type="button" class="btn mini ghost dom-land-toggle" data-land-toggle="' + z + '" aria-expanded="false" title="Déplier les détails de cette terre">▾ Déplier</button></div></div>'
          : '<section class="dom-terre dom-terre-fermee' + (decor ? " a-decor" : "") + '" id="dt-' + z + '"' + decor + '>' +
            '<div class="dom-th dom-closed-header"><h3>' + esc(Z.n) + '</h3>' +
            '<div class="row items-center dom-closed-acts">' + btnContempler +
            '<button type="button" class="btn mini ghost dom-land-toggle" data-land-toggle="' + z + '" aria-expanded="false" title="Déplier les détails de cette terre">▾ Déplier</button></div></div>';
        h += '<div class="dom-closed-res">';
        deps.forEach((d) => { h += compactGisHTML(z, d); });
        h += '</div>';
        h += ruinsBlock(z, Object.keys(E.ruins()).filter((id) => I[id] && I[id].t === "ext" && E.extZones(id)[0] === z));
        return h + "</section>";
      }

      const toggleOpenBtn = passed ? '<button type="button" class="btn mini ghost dom-land-toggle" data-land-toggle="' + z + '" aria-expanded="true" title="Replier cette terre">▴ Replier</button>' : '';
      if (carnet) {
        h = '<section class="dom-terre carnet-terre" id="dt-' + z + '"><div class="carnet-running"><span>' + (passed ? 'Terre traversée' : 'Les terres traversées') + '</span><span>Terre ' + number + '</span></div>' +
          '<div class="carnet-land-header' + (scene ? "" : " sans-paysage") + '"><div class="dom-th"><p class="kicker">' + esc(D.AGES[st.age].n) + '</p><h3>' + esc(Z.n) + '</h3>' + btnContempler + toggleOpenBtn +
          '<p class="carnet-observation">' + esc(Z.d || "") + '</p>' + lieuHTML(z) + '</div>' +
          (z === "lisiere" ? Decouvertes.sceneHTML() : z === "plaine" ? Plaine.sceneHTML() : scene ? '<figure class="carnet-landscape' + (painted ? "" : " carnet-landscape-existing") + '" data-contempler="' + z + '" tabindex="0" role="button" aria-label="Contempler l’aquarelle de ' + esc(Z.n) + '" title="Agrandir et contempler l’aquarelle de ' + esc(Z.n) + '"><img src="' + scene + '" alt="" loading="lazy" decoding="async"><figcaption>Planche ' + number + ' · ' + esc(Z.n) + ' · 🔍 Agrandir</figcaption></figure>' : '') + '</div>';
        if (z === "lisiere") h += Decouvertes.studyHTML();
        if (z === "lisiere" && E.zoneOpen("plaine")) h += '<div class="sentier-retained">' + window.EclatSentier.html(E) + '<div class="row wrap"><button class="btn small" data-gz="plaine">Emprunter le sentier</button><button class="btn small ghost" data-sentier-replay>Revoir les travaux</button></div></div>';
        if (z === "plaine") h += Plaine.studyHTML();
        if (z === "riviere") h += Riviere.studyHTML();
        if (z === "collines") h += Collines.studyHTML();
        if (z === "plaine" && E.zoneOpen("riviere")) h += '<div class="sentier-retained">' + window.EclatPasserelle.html(E) + '<div class="row wrap"><button class="btn small" data-gz="riviere">Emprunter la passerelle</button><button class="btn small ghost" data-passerelle-replay>Revoir les travaux</button></div></div>';
      } else {
        h = '<section class="dom-terre' + (decor ? " a-decor" : "") + '" id="dt-' + z + '"' + decor + '><div class="dom-th"><h3>' + esc(Z.n) + "</h3>" + btnContempler + toggleOpenBtn + lieuHTML(z) + "</div>";
      }
      h += regleHTML(z);
      h += E.territoiresHTML(z, esc, U.terresOpen && U.terresOpen[z]);
      deps.forEach((d) => { h += gisHTML(z, d); });
      h += ruinsBlock(z, Object.keys(E.ruins()).filter((id) => I[id] && I[id].t === "ext" && E.extZones(id)[0] === z));
      if (!deps.some((d) => d.hand) && !deps.some((d) => E.domExt(z, d.res)) && deps.length) h += '<p class="tiny muted">Ces ressources nécessitent des extracteurs pour être récoltées.</p>';
      void st;
      return h + "</section>";
    }
    /* le prochain lieu à explorer sur la terre, ou l’exploration en cours */
    function lieuHTML(z) {
      const st = S(), Z = E.ZONES[z], exps = Z.exps || [];
      if (!exps.length) return "";
      const done = st.exp.done[z] || 0, act = st.exp.active;
      const visible = exps.filter((x, idx) => idx < done || !x.show || E.cond(x.show));
      const n = visible.length;
      if (act && act.z === z) {
        const p = E.expProgress();
        return '<div class="dom-lieu"><span class="tiny">🧭 ' + esc(Z.exps[act.i].n) + ' · <b data-xl>' + (p ? fmtTime(p.left) : "") + '</b></span><div class="bar"><i data-xp style="width:' + (p ? (p.p * 100).toFixed(1) : 0) + '%"></i></div></div>';
      }
      const nx = E.nextExp(z);
      if (!nx) return '<span class="tiny muted">' + done + "/" + n + " lieux</span>";
      if (nx.locked) {
        const reqStr = nx.x.hidden ? nx.x.hidden : (typeof nx.x.need === "string" && I[nx.x.need] ? "il faut " + I[nx.x.need].n.toLowerCase() : Array.isArray(nx.x.need) ? "il faut " + nx.x.need.map((id) => (I[id] ? I[id].n.toLowerCase() : id)).join(", ") : "lieu verrouillé");
        return '<span class="tiny muted">' + done + "/" + n + " lieux · 🔒 " + esc(reqStr) + "</span>";
      }
      return '<button class="btn small" data-exp="' + z + '" title="Lancer cette exploration : elle avance toute seule">🧭 Explorer · ' + esc(nx.x.hidden ? "???" : nx.x.n) + "</button>";
    }
    function livingNodeSVG(res) {
      if (res === "bois") {
        return '<svg class="living-svg" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<g class="anim-tree">' +
          '<ellipse cx="33" cy="61" rx="22" ry="5" fill="#0d1117" opacity="0.6"/>' +
          '<path d="M26 60 C26 50 24 40 22 34 C25 36 29 36 32 30 C35 36 40 37 44 33 C42 41 40 50 40 60 Z" fill="#6a4427"/>' +
          '<path d="M27 60 C28 52 27 45 25 38" stroke="#4a2e18" stroke-width="2" stroke-linecap="round"/>' +
          '<path d="M34 60 C35 48 35 40 33 34" stroke="#4a2e18" stroke-width="2" stroke-linecap="round"/>' +
          '<circle cx="21" cy="28" r="14" fill="#245a33"/>' +
          '<circle cx="45" cy="28" r="14" fill="#245a33"/>' +
          '<circle cx="33" cy="18" r="16" fill="#2e703f"/>' +
          '<circle cx="26" cy="25" r="13" fill="#36864c"/>' +
          '<circle cx="40" cy="25" r="13" fill="#36864c"/>' +
          '<circle cx="33" cy="23" r="14" fill="#44a05d"/>' +
          '<ellipse cx="30" cy="15" rx="7" ry="4" fill="#5fc07b" opacity="0.75"/>' +
          '<ellipse cx="40" cy="20" rx="5" ry="3" fill="#5fc07b" opacity="0.6"/>' +
          '</g></svg>';
      }
      if (res === "caillou") {
        return '<svg class="living-svg" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<g class="anim-rock">' +
          '<ellipse cx="33" cy="59" rx="26" ry="6" fill="#0d1117" opacity="0.6"/>' +
          '<path d="M9 57 L16 46 L24 49 L27 58 Z" fill="#4b5563"/>' +
          '<path d="M16 46 L24 49 L22 57 L13 58 Z" fill="#6b7280"/>' +
          '<path d="M41 58 L46 48 L56 52 L59 58 Z" fill="#4b5563"/>' +
          '<path d="M46 48 L56 52 L53 58 L44 58 Z" fill="#6b7280"/>' +
          '<path d="M17 58 L22 30 L35 15 L48 27 L50 58 Z" fill="#374151"/>' +
          '<path d="M22 30 L35 15 L32 38 L19 50 Z" fill="#6b7280"/>' +
          '<path d="M35 15 L48 27 L39 34 L32 38 Z" fill="#9ca3af"/>' +
          '<path d="M32 38 L39 34 L43 58 L29 58 Z" fill="#4b5563"/>' +
          '<path d="M39 34 L48 27 L50 58 L43 58 Z" fill="#2d3748"/>' +
          '<path d="M32 23 L28 32 L31 42" stroke="#1f2937" stroke-width="1.5" stroke-linecap="round"/>' +
          '</g></svg>';
      }
      if (res === "silex") {
        return '<svg class="living-svg" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<g class="anim-flint">' +
          '<ellipse cx="33" cy="59" rx="23" ry="5" fill="#0d1117" opacity="0.6"/>' +
          '<path d="M13 56 C11 44 19 32 28 26 C37 20 51 25 54 39 C56 49 51 57 38 58 Z" fill="#d8dee9"/>' +
          '<path d="M16 54 C15 47 20 37 27 31 C34 25 46 29 49 40 C51 48 47 55 37 56 Z" fill="#e5e9f0"/>' +
          '<path d="M21 52 L26 33 L39 28 L47 38 L42 53 L29 55 Z" fill="#1e2430"/>' +
          '<path d="M26 33 L39 28 L35 44 L25 45 Z" fill="#3b4252"/>' +
          '<path d="M39 28 L47 38 L40 47 L35 44 Z" fill="#2e3440"/>' +
          '<path d="M25 45 L35 44 L31 54 L23 52 Z" fill="#434c5e"/>' +
          '<path d="M26 33 L39 28" stroke="#eceff4" stroke-width="1.8" stroke-linecap="round"/>' +
          '<polygon points="39,24 41,27 44,28 41,29 39,32 37,29 34,28 37,27" fill="#ffd36b"/>' +
          '</g></svg>';
      }
      if (res === "fibre") {
        return '<svg class="living-svg" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<g class="anim-fiber">' +
          '<ellipse cx="33" cy="60" rx="24" ry="5" fill="#0d1117" opacity="0.6"/>' +
          '<path d="M18 60 Q16 42 12 25" stroke="#2e6f40" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
          '<path d="M24 60 Q25 38 21 18" stroke="#3b874e" stroke-width="2.8" fill="none" stroke-linecap="round"/>' +
          '<path d="M33 60 Q34 35 33 14" stroke="#48a25e" stroke-width="3" fill="none" stroke-linecap="round"/>' +
          '<path d="M42 60 Q41 38 45 19" stroke="#3b874e" stroke-width="2.8" fill="none" stroke-linecap="round"/>' +
          '<path d="M48 60 Q50 42 54 26" stroke="#2e6f40" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
          '<path d="M15 42 Q10 38 8 40 Q13 45 16 43" fill="#48a25e"/>' +
          '<path d="M23 46 Q28 40 31 43 Q26 48 23 47" fill="#5fc07b"/>' +
          '<path d="M34 32 Q39 28 42 30 Q38 35 34 34" fill="#74d890"/>' +
          '<circle cx="12" cy="24" r="3.5" fill="#60a5fa"/>' +
          '<circle cx="21" cy="17" r="4" fill="#93c5fd"/>' +
          '<circle cx="33" cy="13" r="4.5" fill="#ffd36b"/>' +
          '<circle cx="45" cy="18" r="4" fill="#93c5fd"/>' +
          '<circle cx="54" cy="25" r="3.5" fill="#60a5fa"/>' +
          '</g></svg>';
      }
      if (res === "eau") {
        return '<svg class="living-svg" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<g class="anim-water">' +
          '<ellipse cx="33" cy="45" rx="28" ry="16" fill="#1e3a5f"/>' +
          '<ellipse cx="33" cy="45" rx="24" ry="13" fill="#2563eb"/>' +
          '<ellipse cx="33" cy="46" rx="19" ry="9" fill="#38bdf8"/>' +
          '<ellipse cx="33" cy="46" rx="14" ry="6" fill="none" stroke="#e0f2fe" stroke-width="1.6" opacity="0.8"/>' +
          '<ellipse cx="33" cy="46" rx="8" ry="3.5" fill="none" stroke="#ffffff" stroke-width="1.8"/>' +
          '<path d="M33 21 C33 21 30.5 25 30.5 27 C30.5 28.5 31.6 29.5 33 29.5 C34.4 29.5 35.5 28.5 35.5 27 C35.5 25 33 21 33 21 Z" fill="#bae6fd"/>' +
          '<circle cx="23" cy="30" r="2.2" fill="#bae6fd" opacity="0.85"/>' +
          '<circle cx="43" cy="29" r="2.2" fill="#bae6fd" opacity="0.85"/>' +
          '</g></svg>';
      }
      if (res === "sable") {
        return '<svg class="living-svg" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<g class="anim-sand">' +
          '<ellipse cx="33" cy="58" rx="27" ry="6" fill="#0d1117" opacity="0.5"/>' +
          '<path d="M10 56 Q22 36 33 42 Q44 48 56 56 Z" fill="#b48326"/>' +
          '<path d="M14 56 Q26 32 38 38 Q50 44 54 56 Z" fill="#d4a34b"/>' +
          '<path d="M18 56 Q30 26 42 34 Q52 42 50 56 Z" fill="#ecc94b"/>' +
          '<path d="M24 38 Q34 32 44 38" stroke="#fff1b0" stroke-width="1.5" fill="none"/>' +
          '<circle cx="28" cy="30" r="1.5" fill="#fff" opacity="0.8"/>' +
          '<circle cx="38" cy="27" r="1.2" fill="#fff" opacity="0.9"/>' +
          '</g></svg>';
      }
      if (res === "argile") {
        return '<svg class="living-svg" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<g class="anim-clay">' +
          '<ellipse cx="33" cy="58" rx="26" ry="6" fill="#0d1117" opacity="0.5"/>' +
          '<path d="M12 56 Q16 42 28 38 Q40 34 52 46 Q56 50 54 56 Z" fill="#7c2d12"/>' +
          '<path d="M16 54 Q20 38 32 34 Q44 30 50 44 Q52 50 48 54 Z" fill="#9a3412"/>' +
          '<path d="M20 50 Q24 34 36 32 Q44 30 46 42 Z" fill="#c2410c"/>' +
          '<ellipse cx="32" cy="40" rx="6" ry="2.5" fill="#ea580c" opacity="0.8"/>' +
          '<path d="M26 44 Q32 43 38 46" stroke="#fdba74" stroke-width="1.2" fill="none" opacity="0.75"/>' +
          '</g></svg>';
      }
      if (res === "os") {
        return '<svg class="living-svg" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<g class="anim-sand">' +
          '<ellipse cx="33" cy="58" rx="26" ry="6" fill="#0d1117" opacity="0.5"/>' +
          '<path d="M12 56 Q24 48 38 52 Q50 50 56 56 Z" fill="#927142"/>' +
          '<path d="M16 46 Q28 32 44 38 Q36 44 22 48 Z" fill="#e2e8f0"/>' +
          '<circle cx="16" cy="45" r="4.5" fill="#f8fafc"/>' +
          '<circle cx="18" cy="50" r="4" fill="#cbd5e1"/>' +
          '<path d="M28 50 C32 30 46 22 52 30" stroke="#f1f5f9" stroke-width="3" stroke-linecap="round" fill="none"/>' +
          '<path d="M38 52 C41 36 50 28 54 36" stroke="#e2e8f0" stroke-width="2.5" stroke-linecap="round" fill="none"/>' +
          '<path d="M12 56 Q14 42 10 36" stroke="#65a30d" stroke-width="2" fill="none"/>' +
          '<path d="M52 56 Q55 44 58 40" stroke="#84cc16" stroke-width="2" fill="none"/>' +
          '</g></svg>';
      }
      if (res === "cuir") {
        return '<svg class="living-svg" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<g class="anim-fiber">' +
          '<ellipse cx="33" cy="58" rx="25" ry="6" fill="#0d1117" opacity="0.5"/>' +
          '<line x1="16" y1="56" x2="24" y2="18" stroke="#78350f" stroke-width="3" stroke-linecap="round"/>' +
          '<line x1="50" y1="56" x2="42" y2="18" stroke="#78350f" stroke-width="3" stroke-linecap="round"/>' +
          '<path d="M21 24 Q33 20 45 24 Q48 36 44 48 Q33 52 22 48 Q18 36 21 24 Z" fill="#9a3412"/>' +
          '<path d="M24 26 Q33 23 42 26 Q45 36 41 46 Q33 49 25 46 Q21 36 24 26 Z" fill="#c2410c"/>' +
          '<line x1="20" y1="26" x2="23" y2="26" stroke="#fef08a" stroke-width="1.2"/>' +
          '<line x1="43" y1="26" x2="46" y2="26" stroke="#fef08a" stroke-width="1.2"/>' +
          '<line x1="21" y1="46" x2="24" y2="46" stroke="#fef08a" stroke-width="1.2"/>' +
          '<line x1="42" y1="46" x2="45" y2="46" stroke="#fef08a" stroke-width="1.2"/>' +
          '</g></svg>';
      }
      if (res === "malachite") {
        return '<svg class="living-svg" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<g class="anim-rock">' +
          '<ellipse cx="33" cy="59" rx="26" ry="6" fill="#0d1117" opacity="0.6"/>' +
          '<path d="M12 58 L18 32 L36 22 L52 35 L54 58 Z" fill="#27272a"/>' +
          '<path d="M18 32 L36 22 L33 42 L16 52 Z" fill="#3f3f46"/>' +
          '<path d="M36 22 L52 35 L42 45 L33 42 Z" fill="#52525b"/>' +
          '<path d="M22 36 Q30 28 40 32 Q44 42 36 46 Q26 44 22 36 Z" fill="#064e3b"/>' +
          '<path d="M25 38 Q30 32 37 35 Q40 41 35 44 Q28 42 25 38 Z" fill="#059669"/>' +
          '<path d="M28 39 Q31 35 35 37 Q37 40 33 42 Q30 41 28 39 Z" fill="#34d399"/>' +
          '<polygon points="34,31 36,35 40,36 36,37 34,41 32,37 28,36 32,35" fill="#a7f3d0"/>' +
          '</g></svg>';
      }
      if (res === "cassiterite") {
        return '<svg class="living-svg" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<g class="anim-rock">' +
          '<ellipse cx="33" cy="59" rx="26" ry="6" fill="#0d1117" opacity="0.6"/>' +
          '<path d="M14 58 L20 38 L35 44 L32 58 Z" fill="#18181b"/>' +
          '<path d="M20 38 L28 20 L38 28 L35 44 Z" fill="#3f3f46"/>' +
          '<path d="M28 20 L38 28 L32 14 Z" fill="#71717a"/>' +
          '<path d="M38 28 L52 36 L44 52 L35 44 Z" fill="#27272a"/>' +
          '<path d="M38 28 L50 24 L52 36 Z" fill="#52525b"/>' +
          '<polygon points="28,20 32,14 38,28" fill="#a1a1aa"/>' +
          '<polygon points="30,16 32,14 34,18" fill="#f4f4f5"/>' +
          '</g></svg>';
      }
      if (res === "fer_min") {
        return '<svg class="living-svg" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<g class="anim-flint">' +
          '<ellipse cx="33" cy="59" rx="26" ry="6" fill="#0d1117" opacity="0.6"/>' +
          '<path d="M14 58 L20 32 L34 16 L48 26 L52 58 Z" fill="#1c1917"/>' +
          '<path d="M20 32 L34 16 L32 38 L18 52 Z" fill="#44403c"/>' +
          '<path d="M34 16 L48 26 L38 36 L32 38 Z" fill="#78716c"/>' +
          '<path d="M24 34 L32 26 L36 32 L28 42 Z" fill="#c2410c"/>' +
          '<path d="M32 26 L38 22 L42 28 L36 32 Z" fill="#ea580c"/>' +
          '<path d="M28 42 L36 32 L40 44 L32 50 Z" fill="#9a3412"/>' +
          '<path d="M33 24 L36 22 L37 25" stroke="#fed7aa" stroke-width="1.5" stroke-linecap="round"/>' +
          '</g></svg>';
      }
      if (res === "charbon") {
        return '<svg class="living-svg" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<g class="anim-rock">' +
          '<ellipse cx="33" cy="59" rx="26" ry="6" fill="#0d1117" opacity="0.6"/>' +
          '<path d="M12 58 L18 36 L30 30 L40 38 L36 58 Z" fill="#09090b"/>' +
          '<path d="M18 36 L30 30 L26 48 L15 54 Z" fill="#18181b"/>' +
          '<path d="M30 30 L44 24 L54 36 L40 38 Z" fill="#27272a"/>' +
          '<path d="M44 24 L54 36 L52 58 L36 58 Z" fill="#09090b"/>' +
          '<path d="M26 34 L30 30 L38 34" stroke="#52525b" stroke-width="1.8" stroke-linecap="round"/>' +
          '<circle cx="28" cy="42" r="1.5" fill="#f97316" opacity="0.75"/>' +
          '<circle cx="38" cy="44" r="1.2" fill="#ef4444" opacity="0.8"/>' +
          '</g></svg>';
      }
      if (res === "quartz") {
        return '<svg class="living-svg" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<g class="anim-flint">' +
          '<ellipse cx="33" cy="59" rx="26" ry="6" fill="#0d1117" opacity="0.6"/>' +
          '<path d="M14 58 L20 44 L32 50 L30 58 Z" fill="#475569"/>' +
          '<path d="M36 58 L42 46 L54 52 L52 58 Z" fill="#475569"/>' +
          '<polygon points="22,50 26,26 33,32 30,54" fill="#cbd5e1"/>' +
          '<polygon points="26,26 31,18 36,24 33,32" fill="#f8fafc"/>' +
          '<polygon points="33,32 36,24 43,30 40,54" fill="#94a3b8"/>' +
          '<polygon points="32,48 37,20 44,24 42,50" fill="#e2e8f0"/>' +
          '<polygon points="37,20 42,12 47,18 44,24" fill="#ffffff"/>' +
          '<polygon points="44,24 47,18 51,26 48,50" fill="#cbd5e1"/>' +
          '<polygon points="41,11 43,14 46,15 43,16 41,19 39,16 36,15 39,14" fill="#ffd36b"/>' +
          '</g></svg>';
      }
      if (res === "petrole") {
        return '<svg class="living-svg" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<g class="anim-water">' +
          '<ellipse cx="33" cy="50" rx="27" ry="14" fill="#09090b"/>' +
          '<ellipse cx="33" cy="50" rx="23" ry="11" fill="#18181b"/>' +
          '<ellipse cx="33" cy="51" rx="17" ry="7" fill="#27272a"/>' +
          '<path d="M22 50 Q33 46 44 50" stroke="#818cf8" stroke-width="1.5" fill="none" opacity="0.7"/>' +
          '<path d="M25 53 Q33 49 41 53" stroke="#34d399" stroke-width="1.3" fill="none" opacity="0.6"/>' +
          '<circle cx="33" cy="36" r="5" fill="#18181b"/>' +
          '<circle cx="31.5" cy="34.5" r="1.5" fill="#6366f1" opacity="0.8"/>' +
          '<circle cx="24" cy="42" r="2.5" fill="#27272a"/>' +
          '<circle cx="42" cy="40" r="3" fill="#27272a"/>' +
          '</g></svg>';
      }
      return icon(res);
    }

    function livingNode(res) {
      if (window.ECLAT_ILLUSTRATIONS && window.ECLAT_ILLUSTRATIONS.hasSource(res)) {
        const src = window.ECLAT_ILLUSTRATIONS.getSource(res);
        return '<img class="living-carnet-img source-' + esc(res) + '" src="' + src + '" alt="" draggable="false" />';
      }
      return livingNodeSVG(res);
    }

    function spawnLivingParticles(x, y, res) {
      if (typeof motionOK === "function" && !motionOK()) return;
      const count = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        const p = document.createElement("div");
        p.className = "vivant-particle";
        const angle = Math.random() * Math.PI * 2;
        const dist = 28 + Math.random() * 46;
        const dur = 420 + Math.random() * 260;

        let content = "✦";
        if (res === "bois") {
          content = Math.random() > 0.4 ? "🍃" : "🪵";
          p.style.fontSize = (11 + Math.random() * 7) + "px";
        } else if (res === "caillou") {
          content = Math.random() > 0.5 ? "🪨" : "•";
          p.style.color = "#a0aec0";
          p.style.fontSize = (14 + Math.random() * 8) + "px";
        } else if (res === "silex") {
          content = "✦";
          p.style.color = Math.random() > 0.3 ? "#ffd36b" : "#ffffff";
          p.style.fontSize = (12 + Math.random() * 8) + "px";
        } else if (res === "fibre") {
          content = Math.random() > 0.5 ? "🌿" : "🌾";
          p.style.fontSize = (12 + Math.random() * 6) + "px";
        } else if (res === "eau") {
          content = "💧";
          p.style.fontSize = (11 + Math.random() * 7) + "px";
        } else if (res === "sable") {
          content = "•";
          p.style.color = "#ecc94b";
          p.style.fontSize = (12 + Math.random() * 6) + "px";
        } else if (res === "argile") {
          content = "•";
          p.style.color = "#c2410c";
          p.style.fontSize = (14 + Math.random() * 6) + "px";
        } else if (res === "os") {
          content = Math.random() > 0.4 ? "🦴" : "•";
          p.style.color = "#e5dfd3";
          p.style.fontSize = (12 + Math.random() * 6) + "px";
        } else if (res === "cuir") {
          content = Math.random() > 0.4 ? "🌾" : "•";
          p.style.color = "#c29b68";
          p.style.fontSize = (12 + Math.random() * 6) + "px";
        } else if (res === "malachite") {
          content = "✦";
          p.style.color = "#10b981";
          p.style.fontSize = (13 + Math.random() * 7) + "px";
        } else if (res === "cassiterite") {
          content = "✦";
          p.style.color = "#94a3b8";
          p.style.fontSize = (12 + Math.random() * 6) + "px";
        } else if (res === "fer_min") {
          content = "✦";
          p.style.color = Math.random() > 0.4 ? "#f97316" : "#ffd36b";
          p.style.fontSize = (13 + Math.random() * 7) + "px";
        } else if (res === "charbon") {
          content = Math.random() > 0.5 ? "•" : "✦";
          p.style.color = Math.random() > 0.3 ? "#334155" : "#ef4444";
          p.style.fontSize = (12 + Math.random() * 7) + "px";
        } else if (res === "quartz") {
          content = "✦";
          p.style.color = Math.random() > 0.5 ? "#c084fc" : "#ffffff";
          p.style.fontSize = (14 + Math.random() * 8) + "px";
        } else if (res === "petrole") {
          content = "💧";
          p.style.color = "#312e81";
          p.style.fontSize = (12 + Math.random() * 6) + "px";
        } else {
          content = "✦";
          p.style.color = "#ffd36b";
          p.style.fontSize = "14px";
        }

        p.textContent = content;
        p.style.left = x + "px";
        p.style.top = y + "px";
        const fx = document.getElementById("fx");
        if (fx) fx.appendChild(p);
        else document.body.appendChild(p);

        const midY = -14 - Math.random() * 22;
        const destX = Math.cos(angle) * dist;
        const destY = Math.abs(Math.sin(angle)) * dist * 0.75 + 12;

        if (p.animate) {
          p.animate([
            { transform: "translate(0, 0) scale(0.6) rotate(0deg)", opacity: 1 },
            { transform: "translate(" + (destX * 0.45) + "px, " + midY + "px) scale(1.15) rotate(" + (Math.random() * 100 - 50) + "deg)", opacity: 0.95, offset: 0.35 },
            { transform: "translate(" + destX + "px, " + destY + "px) scale(0.65) rotate(" + (Math.random() * 360) + "deg)", opacity: 0 }
          ], {
            duration: dur,
            easing: "cubic-bezier(0.25, 1, 0.4, 1)"
          }).onfinish = () => p.remove();
        } else {
          setTimeout(() => p.remove(), dur);
        }
      }
    }

    function gisHTML(z, d) {
      const st = S(), res = d.res, key = E.extKey(z, res), e = E.domExt(z, res);
      const ch = E.extChoice(res, z), q = E.domQueued("x:" + key);
      const info = E.machInfo(key), rate = depRate(z, res);
      const used = e ? Object.keys(e.u).map((t) => many(t, e.u[t])).join(", ") : "";
      let sub = fmt(st.inv[res] || 0);
      sub = 'Tu en as <span data-c="' + res + '">' + sub + "</span>" + (used ? " · " + esc(used) : "") + (q ? " · " + q + " en cours" : "");
      const right = e && info.s === "off" ? '<span class="dom-rate off">⏸ en pause</span>'
        : rate > 0 ? '<span class="dom-rate" data-rate="' + key + '">+' + perTime(rate) + "</span>"
        : d.hand ? '<span class="dom-rate hand">🖐️ à la main</span>' : "";
      let btns = "";
      if (d.hand) {
        const on = st.act && st.act.k === "harv" && st.act.res === res && st.act.z === z;
        btns += '<button class="mini harvest' + (on ? " on" : "") + '" data-hloop="' + key + '" aria-pressed="' + on + '" aria-label="' + (on ? "Arrêter de récolter : " : "Récolter en continu : ") + esc(I[res].n) + '" title="Récolte en continu, même jeu fermé">' + '<span class="bi">' + (on ? "■" : "▶") + '</span><span class="bl"> ' + (on ? "Arrêter" : "Récolter") + "</span>" + "</button>";
      }
      if (ch) {
        const free = E.freeExt(ch.t), can = free >= 1 || E.plan(ch.t, 1).ok;
        const pAdd = E.projectExtractor ? E.projectExtractor(z, res, ch.t, 1) : null;
        const projTip = pAdd ? ' (débit : ' + perTime(pAdd.curRate) + ' → ' + perTime(pAdd.projRate) + ')' : '';
        btns += '<button class="mini lbl' + (can ? "" : " nope") + '" data-xadd="' + key + '" data-n="1" title="Poser : ' + esc(I[ch.t].n) + esc(projTip) + '" aria-label="Poser : ' + esc(I[ch.t].n) + '"><span class="bi">+</span><span class="bl"> ' + esc(nm(ch.t, 1)) + "</span></button>";
      }
      const isVivant = (window.EclatStyleMode === "vivant" || (document.documentElement && document.documentElement.getAttribute("data-style-mode") === "vivant"));
      const illustratedSource = isVivant && window.ECLAT_ILLUSTRATIONS && window.ECLAT_ILLUSTRATIONS.hasSource(res);
      const isProducing = rate > 0;
      return '<div class="gis' + (isVivant && d.hand ? " gis-vivant" : "") + (isVivant && isProducing ? " gis-producing" : "") + '" data-gis="' + key + '">' +
        '<button class="gis-ic' + (d.hand ? " hand" : "") + (isVivant && d.hand ? " gis-ic-vivant" : "") + '"' + (d.hand ? ' data-harv="' + key + '" aria-label="Récolter : ' + esc(I[res].n) + '"' : ' tabindex="-1"') + ">" + (isVivant && (d.hand || illustratedSource) ? livingNode(res) : icon(res)) + "</button>" +
        '<button class="gis-body" data-gsheet="' + key + '" aria-label="Gisement : ' + esc(I[res].n) + '"><span class="gis-l1"><b>' + esc(I[res].n) + "</b>" + right + "</span>" +
        '<span class="gis-l2 tiny muted">' + sub + "</span></button>" +
        (btns ? '<div class="gis-b">' + btns + "</div>" : "") + "</div>";
    }

    /* ------------------------------------------------------------ machines & commandes */
    function machTierDesc(m) {
      const M = I[m];
      if (!M) return "";
      return M.ing === 1 ? "recettes à 1 ingrédient" : "recettes à " + M.ing + " ingrédients au plus";
    }
    function domaineMachinesSummary() {
      const st = S(), ms = E.machines();
      const owned = E.MACHINES.filter((m) => ms[m].own > 0);
      const machRuins = Object.keys(E.ruins()).filter((id) => I[id] && ["mach", "stat"].includes(I[id].t));
      const qLen = st.hand.q.length;
      if (!owned.length && !qLen && !machRuins.length) return "";
      const work = E.MACHINES.reduce((a, m) => a + ms[m].used, 0);
      const rest = E.MACHINES.reduce((a, m) => a + E.freeMach(m), 0);
      const parts = [];
      if (qLen) parts.push(plural(qLen, "commande"));
      if (owned.length) parts.push(work + " " + (work > 1 ? "machines" : "machine") + " au travail · " + rest + " au repos");
      if (machRuins.length) parts.push("🛖 ruines");
      return '<button class="dom-more dom-mach-link" data-tab2="machines" data-dmach>⚙️ ' +
        parts.join(" · ") + " · <span>voir ▸</span></button>";
    }
    function jobWorkersText(j) {
      const parts = [];
      j.steps.forEach((st) => {
        if (st.done >= st.n) return;
        const w = [];
        if (st.hands) w.push("✋ mains");
        const mTypes = Object.keys(st.machByType || {});
        mTypes.forEach((m) => w.push(many(m, st.machByType[m])));
        if (w.length) parts.push(w.join(" + ") + " → " + I[st.id].n.toLowerCase() + " (" + st.done + "/" + st.n + ")");
      });
      return parts.join(" · ");
    }
    function jobMissingText(j) {
      const keys = Object.keys(j.miss || {}).filter((k) => j.miss[k] > 1e-9);
      if (!keys.length) return "";
      return "il manque : " + keys.map((k) => fmt(Math.ceil(j.miss[k])) + " " + I[k].n.toLowerCase()).join(", ");
    }
    function machinesView(opts) {
      const hi = E.handInfo(), ms = E.machines();
      const owned = E.MACHINES.filter((m) => ms[m].own > 0);
      let h = '<div class="dom dom-mach-tab">';
      if (!(opts && opts.sansTitre)) {
        h += '<h2 class="title" style="margin-top:0">Machines &amp; commandes</h2>';
        h += '<p class="small muted" style="margin-top:-8px;margin-bottom:12px">Commandes compatibles accélérées par les machines, en complément des mains.</p>';
      }
      h += ruinsBlock("machines", Object.keys(E.ruins()).filter((id) => I[id] && ["mach", "stat"].includes(I[id].t)));

      h += '<h3 class="sub" style="margin-top:8px">Commandes en cours</h3>';
      if (hi && hi.jobs.length) {
        hi.jobs.forEach((j, idx) => {
          const it = I[j.id];
          const pct = Math.min(100, 100 * (j.frac || 0));
          const workTxt = jobWorkersText(j);
          const missTxt = jobMissingText(j);
          h += '<section class="dom-card mach-card" data-order-idx="' + idx + '">';
          h += '<div class="row between" style="align-items:center;gap:8px">' +
            '<div class="row grow" style="align-items:center;gap:8px">' + icon(j.id, "sm") +
            '<div class="grow"><b>' + esc(it.n) + (j.n > 1 ? " ×" + fmt(j.n) : "") + '</b>' +
            '<span class="tiny muted"> · ' + fmt(j.finalDone) + "/" + fmt(j.n) + (j.left > 0 && !j.wait ? " · ~" + fmtTime(j.left) : "") + '</span></div></div>' +
            '<button class="btn small ghost" data-mcancel="' + idx + '">Annuler</button>' +
            '</div>';
          h += '<div class="bar" style="margin:6px 0"><i data-opbar="' + idx + '" style="width:' + pct.toFixed(1) + '%"></i></div>';
          if (workTxt) h += '<div class="tiny good">' + esc(workTxt) + '</div>';
          if (missTxt) h += '<div class="tiny warn">' + esc(missTxt) + '</div>';
          else if (j.wait && !workTxt) h += '<div class="tiny muted">en attente de mains ou de machines</div>';
          if (j.steps.length > 1) {
            h += '<div class="tiny muted" style="margin-top:4px">' +
              j.steps.map((s) => (s.done >= s.n ? "✓ " : s.hands || s.machs ? "▸ " : "") + esc(I[s.id].n.toLowerCase()) + " " + s.done + "/" + s.n).join(" → ") +
              '</div>';
          }
          h += '</section>';
        });
      } else {
        h += '<p class="small muted" style="padding:6px 0 12px">Aucune commande en cours. Commandes disponibles dans l’Atelier ou le Carnet (×10, ×50, ×100, ×1000).</p>';
      }

      const cads = E.cadences ? E.cadences() : [];
      const elig = E.cadenceEligible ? E.cadenceEligible() : [];
      if (owned.length || cads.length) {
        h += '<h3 class="sub" style="margin-top:16px">🔄 Consignes (machines au repos)</h3>';
        h += '<p class="tiny muted" style="margin-top:-4px;margin-bottom:8px">Quand aucune commande ne les réclame, tes machines libres maintiennent ces réserves jusqu’au seuil choisi.</p>';
        if (cads.length) {
          cads.forEach((c) => {
            const it = I[c.id];
            const stBadge = c.status === "ok"
              ? '<span class="tiny good">▸ ' + c.machs + (c.machs > 1 ? " machines" : " machine") + " · +" + perTime(c.rate) + '</span>'
              : c.status === "full"
                ? '<span class="tiny good">✓ seuil atteint (' + fmt(c.cap) + ')</span>'
                : c.status === "starved"
                  ? '<span class="tiny warn">manque : ' + c.miss.map((k) => esc(I[k].n.toLowerCase())).join(", ") + '</span>'
                  : c.status === "busy"
                    ? '<span class="tiny muted">machines occupées sur les commandes</span>'
                    : '<span class="tiny muted">⏸ en pause</span>';
            h += '<section class="dom-card mach-card" data-cad-row="' + c.id + '" style="margin-bottom:8px">' +
              '<div class="row between" style="align-items:center;gap:8px">' +
              '<div class="row grow" style="align-items:center;gap:8px">' + icon(c.id, "sm") +
              '<div class="grow"><b>' + esc(it.n) + '</b> <span class="tiny muted">· <span data-c="' + c.id + '">' + fmt(c.have) + '</span> / ' + fmt(c.cap) + '</span>' +
              '<div>' + stBadge + '</div></div></div>' +
              '<div class="row wrap" style="gap:4px;align-items:center">' +
              [50, 100, 250, 500].map((q) => '<button class="btn mini' + (c.cap === q ? " pri" : " ghost") + '" data-cad-cap="' + c.id + '" data-n="' + q + '" title="Garder jusqu’à ' + q + ' en réserve">' + q + '</button>').join("") +
              '<button class="btn mini ghost" data-cad-toggle="' + c.id + '" title="' + (c.on ? "Mettre cette consigne en pause" : "Reprendre cette consigne") + '">' + (c.on ? "⏸" : "▶") + '</button>' +
              '<button class="btn mini ghost" data-cad-del="' + c.id + '" title="Retirer cette consigne" aria-label="Retirer ' + esc(it.n) + '">✕</button>' +
              '</div></div></section>';
          });
        }
        if (elig.length) {
          h += '<div class="row wrap" style="gap:6px;margin-top:6px;align-items:center"><span class="tiny muted">Ajouter :</span>' +
            elig.map((id) => '<button class="btn mini ghost" data-cad-add="' + id + '" title="Garder ' + esc(I[id].n.toLowerCase()) + ' en réserve automatiquement">+ ' + icon(id, "sm") + " " + esc(I[id].n) + '</button>').join("") +
            '</div>';
        } else if (!cads.length) {
          h += '<p class="tiny muted">Fabrique au moins une fois une recette automatisable pour la confier à tes machines au repos.</p>';
        }
      }

      h += '<h3 class="sub" style="margin-top:16px">Tes machines</h3>';
      if (owned.length) {
        owned.forEach((m) => {
          const info = ms[m], rest = Math.max(0, info.own - info.used);
          const recs = Object.keys(info.byRec || {});
          const workDesc = recs.length
            ? recs.map((r) => info.byRec[r] + " sur " + I[r].n.toLowerCase()).join(", ")
            : "0 au travail";
          h += '<section class="dom-card dom-mach-rest" data-mach-type="' + m + '" style="margin-bottom:8px">' +
            '<div class="row between" style="align-items:center">' +
            '<div class="row" style="align-items:center;gap:8px">' +
            icon(m) +
            '<div><b>' + esc(many(m, info.own)) + '</b>' +
            '<div class="tiny muted">' + esc(machTierDesc(m)) + '</div>' +
            '<div class="tiny ' + (info.used > 0 ? "good" : "muted") + '">' +
            (info.used > 0 ? esc(workDesc) + (rest > 0 ? " · " + rest + " au repos" : "") : rest + " au repos") +
            '</div></div></div>' +
            '</div></section>';
        });
      } else {
        h += '<p class="small muted" style="padding:6px 0">Tu n’as pas encore de machine. La première se découvre au Labo : l’automate de bois.</p>';
      }
      h += '</div>';
      return h;
    }

    /* ------------------------------------------------------------ Le Comptoir */
    function comptoirHTML() {
      const st = S();
      const phrases = [
        "« Encore toi. Montre-moi ce que tu as en trop. »",
        "Le Troqueur fait tinter ses écus en les comptant. Il n’a jamais l’air pressé.",
        "« Le bois ne vaut presque rien. Ce que tu en fais, si. »"
      ];
      const phrase = phrases[(st.cycle + st.age) % phrases.length];
      const count = E.troqueurCount ? E.troqueurCount() : 0;
      const hor = E.troqueurHoraire();
      const askLine = !hor.ouvert ? "Le Troqueur est en tournée · retour dans " + fmtTime(Math.max(0, (hor.ouvre - Date.now()) / 1000))
        : count === 0 ? "Aucune demande du Troqueur" : count === 1 ? "1 demande du Troqueur" : count + " demandes du Troqueur";
      return '<section class="dom-card dom-comptoir" id="dcomptoir">' +
        '<h3>🪙 Le Comptoir</h3>' +
        '<p class="small muted">' + esc(phrase) + '</p>' +
        '<div class="small" style="margin-top:6px"><b>' + esc(askLine) + '</b></div>' +
        '<div class="row wrap between" style="align-items:center;margin-top:8px">' +
        '<span class="small"><b>' + fmt(st.ecus || 0) + '</b> écus</span>' +
        '<button class="btn small pri" data-comptoir>Ouvrir le Comptoir</button>' +
        '</div></section>';
    }

    function comptoirSheet(tab) {
      let curTab = tab || "vendre";
      const mbox = () => document.querySelector("#modal .modal-box");

      function sellRowHTML(id) {
        const have = S().inv[id] || 0;
        const p = E.unitPrice(id);
        const n10 = Math.max(1, Math.floor(have * 0.1));
        const n50 = Math.max(1, Math.floor(have * 0.5));
        const nAll = Math.max(0, have - 100);
        const q10 = E.sellQuote(id, n10);
        const q50 = E.sellQuote(id, n50);
        const qAll = nAll > 0 ? E.sellQuote(id, nAll) : 0;
        return '<div class="comptoir-row" data-sline="' + id + '">' +
          '<div class="comptoir-head" data-goto="' + id + '" role="button" tabindex="0" title="' + esc(I[id].n) + ' (toucher pour inspecter)">' + icon(id, "sm") +
          '<div class="grow"><b>' + esc(I[id].n) + '</b><span class="tiny muted"> · tu en as <span data-c="' + id + '">' + fmt(have) + '</span></span></div>' +
          '<span class="tiny muted">' + fmtNum(p) + ' écu l’unité</span></div>' +
          '<div class="comptoir-btns">' +
          '<button class="btn mini" data-m="sell" data-id="' + id + '" data-n="' + n10 + '" title="Vendre 10 %"><b>10 %</b> <small>+' + fmtNum(q10) + '</small></button>' +
          '<button class="btn mini" data-m="sell" data-id="' + id + '" data-n="' + n50 + '" title="Vendre la moitié"><b>La moitié</b> <small>+' + fmtNum(q50) + '</small></button>' +
          '<button class="btn mini" data-m="sell" data-id="' + id + '" data-n="' + nAll + '"' + (nAll <= 0 ? ' disabled' : '') + ' title="Tout vendre, sauf 100"><b>Tout sauf 100</b> <small>' + (nAll > 0 ? '+' + fmtNum(qAll) : '−') + '</small></button>' +
          '</div></div>';
      }

      function buyResRowHTML(id) {
        const have = S().inv[id] || 0;
        const c1 = E.buyResCost(id, 1);
        const c100 = E.buyResCost(id, 100);
        const c1000 = E.buyResCost(id, 1000);
        const ecus = S().ecus || 0;
        return '<div class="comptoir-row" data-bline="' + id + '">' +
          '<div class="comptoir-head" data-goto="' + id + '" role="button" tabindex="0" title="' + esc(I[id].n) + ' (toucher pour inspecter)">' + icon(id, "sm") +
          '<div class="grow"><b>' + esc(I[id].n) + '</b><span class="tiny muted"> · tu en as <span data-c="' + id + '">' + fmt(have) + '</span></span></div>' +
          '<span class="tiny muted">' + fmtNum(c1) + ' écu l’unité</span></div>' +
          '<div class="comptoir-btns">' +
          '<button class="btn mini" data-m="buyres" data-id="' + id + '" data-n="100"' + (ecus < c100 ? ' disabled' : '') + '>+100 <small>' + fmt(c100) + ' écus</small></button>' +
          '<button class="btn mini" data-m="buyres" data-id="' + id + '" data-n="1000"' + (ecus < c1000 ? ' disabled' : '') + '>+1 000 <small>' + fmt(c1000) + ' écus</small></button>' +
          '</div></div>';
      }

      function buyPageRowHTML(p) {
        const ecus = S().ecus || 0;
        const can = ecus >= p.ecus;
        return '<div class="comptoir-row" data-bpage="' + esc(p.id) + '">' +
          '<div class="comptoir-head"><span class="sheet-ic" style="font-size:20px">📖</span>' +
          '<div class="grow"><b>' + (p.feuillet ? "Une feuille pliée" : "Page n° " + p.n) + '</b>' +
          (p.titre ? '<span class="tiny muted"> · ' + esc(p.titre) + '</span>' : '') +
          '</div>' +
          '<span class="tiny muted">' + fmt(p.ecus) + ' écus</span></div>' +
          '<div class="comptoir-btns">' +
          '<button class="btn mini' + (can ? ' pri' : '') + '" data-m="buypage" data-id="' + esc(p.id) + '"' + (can ? '' : ' disabled') + '>' +
          '<b>Acheter</b> <small>' + fmt(p.ecus) + ' écus</small></button>' +
          '</div></div>';
      }

      function askRowHTML(ask, i) {
        if (!ask) {
          return '<div class="comptoir-row" style="opacity:0.6;border-style:dashed">' +
            '<p class="small muted center" style="margin:4px 0">Emplacement vide · demande livrée</p></div>';
        }
        const have = S().inv[ask.id] || 0;
        const can = have >= ask.n;
        return '<div class="comptoir-row" data-aline="' + i + '">' +
          '<div class="comptoir-head" data-goto="' + ask.id + '" role="button" tabindex="0" title="' + esc(I[ask.id].n) + ' (toucher pour inspecter)">' + icon(ask.id, "sm") +
          '<div class="grow"><b>' + esc(I[ask.id].n) + '</b><span class="tiny muted"> · <span data-c="' + ask.id + '">' + fmt(have) + '</span> / ' + fmt(ask.n) + ' en poche</span></div>' +
          '<span class="small" style="font-weight:700">+' + ask.tr + ' ✦</span></div>' +
          '<div class="comptoir-btns">' +
          '<button class="btn mini' + (can ? ' pri' : '') + '" data-m="deliver" data-idx="' + i + '"' + (can ? '' : ' disabled') + '>' +
          '<b>Livrer</b> <small>contre +' + ask.tr + ' ✦</small></button>' +
          '</div></div>';
      }

      function comptoirModalHTML() {
        const st = S();
        let h = '<div class="sheet-h"><span class="sheet-ic">🪙</span><div class="grow"><h2>Le Comptoir</h2><div class="tiny muted">Le Troqueur · <span data-cecus>' + fmt(st.ecus || 0) + '</span> écus</div></div></div>';
        // à l’ouverture, ce que le Troqueur dit et ce que porte le bois du comptoir (données du récit)
        // à quoi servent les écus : ils deviennent des Souvenirs à la relève, avec un plafond mou
        const det = E.ecusDetail((st.ecus || 0));
        h += '<p class="tiny muted" style="margin:6px 0 0">À la relève, tes écus deviennent des ✦ Souvenirs : au prix de ton âge (' + fmt(E.traceBasePrice()) + ' écus le Souvenir), à plein tarif jusqu’à ' + fmt(det.seuil) + ' ✦ (ce que tes passages ont rapporté), puis à un quart.' +
          ((st.ecus || 0) > 0 ? ' Tes ' + fmt(st.ecus || 0) + ' écus en feraient <b>' + det.trace + '</b>.' : '') + '</p>';
        const parole = uiSigne("comptoir", "Le Comptoir");
        if (parole) h += '<div class="comptoir-signe lore small">' + parole + '</div>';
        h += '<div class="subtabs comptoir-tabs">' +
          '<button class="' + (curTab === "vendre" ? "on" : "") + '" data-m="ctab" data-t="vendre" title="Vendre ce qui encombre ta Réserve">Vendre</button>' +
          '<button class="' + (curTab === "acheter" ? "on" : "") + '" data-m="ctab" data-t="acheter" title="Acheter la ressource qui te manque">Acheter</button>' +
          '<button class="' + (curTab === "demandes" ? "on" : "") + '" data-m="ctab" data-t="demandes">Demandes</button>' +
          '<button class="' + (curTab === "parler" ? "on" : "") + '" data-m="ctab" data-t="parler">Parler</button>' +
          '</div>';

        if (curTab === "vendre") {
          const items = Object.keys(st.inv)
            .filter((id) => E.sellable(id) && (st.inv[id] || 0) >= 1)
            .sort((a, b) => E.sellQuote(b, st.inv[b]) - E.sellQuote(a, st.inv[a]));
          if (!items.length) {
            h += '<p class="small muted center" style="padding:20px 0" id="sell-empty">Rien à vendre dans ta Réserve pour l’instant. Récolte des ressources ou fabrique des pièces.</p>';
          } else {
            h += '<div class="comptoir-list" id="sell-list">' + items.map(sellRowHTML).join("") + '</div>';
          }
        } else if (curTab === "acheter") {
          const buyable = E.buyableRes();
          if (buyable.length) {
            h += '<div class="comptoir-list">' + buyable.map(buyResRowHTML).join("") + '</div>';
          } else {
            h += '<p class="small muted center" style="padding:20px 0">Aucune ressource disponible à l’achat pour l’instant.</p>';
          }
          const buyPages = E.buyablePages ? E.buyablePages() : [];
          if (buyPages.length) {
            h += '<h3 class="sub" style="margin-top:16px">Pages</h3>';
            h += '<div class="comptoir-list">' + buyPages.map(buyPageRowHTML).join("") + '</div>';
          }
        } else if (curTab === "parler") {
          const TR = (E.RECIT && E.RECIT.troc) || {};
          const last = E.troqueurDernier ? E.troqueurDernier() : null;
          if (!last) {
            h += '<div class="troc-parole"><p class="small muted"><i>' + esc(TR.intro || "") + '</i></p></div>';
            h += '<p class="tiny muted center">' + esc(TR.consigne || "") + '</p>';
            h += '<div class="troc-themes">' + E.troqueurThemes().map((th) =>
              '<button class="btn small' + (th.dispo ? " pri" : " nope") + '" data-m="parler" data-th="' + esc(th.id) + '">' + esc(th.n) + '</button>').join("") + '</div>';
          } else if (last.choix && !last.rep) {
            h += '<div class="troc-parole">';
            if (last.stage) h += '<p class="tiny muted troc-stage"><i>' + esc(last.stage) + '</i></p>';
            h += '<p class="serif troc-lui">' + String(recitInline(last.t, "Le Comptoir")).replace(/\n/g, "<br>") + '</p>';
            h += '</div>';
            h += '<p class="tiny muted center">Que réponds-tu ?</p>';
            h += '<div class="troc-choix">' + last.choix.map((c) =>
              '<button type="button" class="btn troc-rep" data-m="trocChoix" data-k="' + esc(c.k) + '">' +
              '<span class="troc-rep-k">' + esc(c.k.toUpperCase()) + '</span>' +
              '<span class="troc-rep-txt">' + String(recitInline(c.q, "Le Comptoir")) + '</span></button>'
            ).join("") + '</div>';
          } else {
            h += '<div class="troc-parole">';
            if (last.stage && !last.q) h += '<p class="tiny muted troc-stage"><i>' + esc(last.stage) + '</i></p>';
            if (last.q) h += '<p class="troc-moi">' + String(recitInline(last.q, "Le Comptoir")) + '</p>';
            h += '<p class="serif troc-lui">' + String(recitInline(last.t, "Le Comptoir")).replace(/\n/g, "<br>") + '</p>';
            h += '</div>';
            h += '<div class="row troc-fin-bar"><button type="button" class="btn small ghost" data-m="trocFin">← Poser une autre question</button></div>';
            h += '<div class="troc-themes">' + E.troqueurThemes().map((th) =>
              '<button class="btn small' + (th.dispo ? " pri" : " nope") + '" data-m="parler" data-th="' + esc(th.id) + '">' + esc(th.n) + '</button>').join("") + '</div>';
          }
        } else if (curTab === "demandes") {
          const asks = E.troqueurAsks ? E.troqueurAsks() : [];
          const hor = E.troqueurHoraire();
          if (!hor.ouvert) {
            h += '<p class="small muted center" style="padding:20px 0">Le Troqueur est parti en tournée. Il reprend ses demandes dans <b>' + fmtTime(Math.max(0, Math.ceil((hor.ouvre - Date.now()) / 1000))) +
              '</b>. Le Comptoir reste ouvert pour vendre et acheter.</p>';
          } else {
            if (!asks.length) {
              h += '<p class="small muted center" style="padding:20px 0">Le Troqueur n’a pas de demande pour l’instant. Fabrique des objets de ton âge, avec des ressources que tu récoltes.</p>';
            } else {
              h += '<div class="comptoir-list">' + asks.map(askRowHTML).join("") + '</div>';
            }
            h += '<p class="tiny muted center" style="margin:10px 0 6px">Il repart dans ' + fmtTime(Math.max(0, Math.ceil((hor.fin - Date.now()) / 1000))) + '. Ses demandes ne se renouvellent pas avant son retour.</p>';
          }
        }

        h += '<div class="acts"><button class="btn pri" data-m="close">Fermer</button></div>';
        return h;
      }

      function redraw() {
        const b = mbox();
        if (b) b.innerHTML = comptoirModalHTML();
        render(true);
        return true;
      }

      openModal({
        reopen: () => comptoirSheet(curTab), // revenir ici depuis une fiche ouverte d’une pastille
        html: comptoirModalHTML(),
        refresh: () => comptoirModalHTML(),
        on: {
          ctab: (b) => {
            curTab = b.dataset.t;
            A.click();
            return redraw();
          },
          parler: (b) => {
            const r = E.troqueurParle(b.dataset.th);
            if (r.ok && !r.vide) A.page(); else A.click();
            return redraw();
          },
          trocChoix: (b) => {
            const r = E.troqueurChoix ? E.troqueurChoix(b.dataset.k) : null;
            if (r && r.ok) A.page(); else A.click();
            return redraw();
          },
          trocFin: () => {
            if (E.troqueurFin) E.troqueurFin();
            A.click();
            return redraw();
          },
          sell: (b) => {
            const id = b.dataset.id, n = Number(b.dataset.n);
            const r = E.sell(id, n);
            if (!r.ok) {
              A.fail(0);
              toast("Impossible de vendre : " + (r.why === "missing" ? "tu n’en as plus assez." : "quantité invalide."), { key: "comptoir" });
              return redraw();
            }
            A.click(); vibe(8);
            toast("+" + fmtNum(r.ecus) + " écus (" + esc(I[id].n) + ")", { key: "comptoir" });
            const box = mbox();
            if (box) {
              const ecEl = box.querySelector("[data-cecus]");
              if (ecEl) ecEl.textContent = fmt(S().ecus || 0);
              const row = box.querySelector('[data-sline="' + id + '"]');
              if (row) {
                if ((S().inv[id] || 0) <= 0) {
                  row.remove();
                  const list = box.querySelector("#sell-list");
                  if (list && !list.children.length) {
                    list.outerHTML = '<p class="small muted center" style="padding:20px 0" id="sell-empty">Rien à vendre dans ta Réserve pour l’instant. Récolte des ressources ou fabrique des pièces.</p>';
                  }
                } else {
                  row.outerHTML = sellRowHTML(id);
                }
              }
            }
            render(true);
            return true;
          },
          deliver: (b) => {
            const idx = Number(b.dataset.idx);
            const r = E.deliverAsk(idx);
            if (!r.ok) {
              A.fail(0);
              toast("Impossible de livrer : " + (r.why === "missing" ? "tu n’en as plus assez." : "demande indisponible."), { key: "comptoir" });
              return redraw();
            }
            A.click(); vibe(10);
            toast("✦ +" + r.ask.tr + " Souvenir" + (r.ask.tr > 1 ? "s" : "") + " !", { key: "comptoir" });
            return redraw();
          },
          buyres: (b) => {
            const id = b.dataset.id, n = Number(b.dataset.n);
            const r = E.buyRes(id, n);
            if (!r.ok) {
              A.fail(0);
              toast("Pas assez d’écus.", { key: "comptoir" });
              return redraw();
            }
            A.click(); vibe(8);
            toast("Acheté : " + fmt(n) + " " + esc(I[id].n) + ".", { key: "comptoir" });
            return redraw();
          },
          buypage: (b) => {
            const id = b.dataset.id;
            const r = E.buyPage(id);
            if (!r.ok) {
              A.fail(0);
              toast("Pas assez d’écus.", { key: "comptoir" });
              return redraw();
            }
            A.click(); vibe(8);
            return redraw();
          }
        }
      });
    }

    /* ------------------------------------------------------------ Grand Œuvre */
    function oeuvreHTML(pid) {
      const P = D.PROJECTS[pid], ps = E.projState(pid), step = P.steps[ps.step], st = S(), on = E.siteOn(pid);
      // le chantier montre l’étape en cours
      let h = '<section class="dom-card dom-oeuvre"><h3>' + P.ic + " " + esc(P.n) + '</h3><img class="oeuvre-art oeuvre-art-compact" src="assets/oeuvres/' + D.oeuvreArt(pid, ps.step) + '.webp" alt="" loading="lazy" decoding="async"><div class="tiny muted">Étape ' + (ps.step + 1) + " sur " + P.steps.length + " · " + esc(step.n) + "</div>";
      if (step.cost) {
        h += Object.keys(step.cost).map((k) => {
          const paid = ps.paid[k] || 0;
          return '<div class="cost-row" data-goto="' + k + '" role="button" tabindex="0" title="' + esc(I[k].n) + ' (toucher pour inspecter)">' + icon(k, "sm") + '<span class="grow">' + esc(I[k].n) + '</span><span class="tiny" data-sp="' + pid + ":" + k + '">' + fmt(paid) + " / " + fmt(step.cost[k]) +
            '</span><div class="bar"><i style="width:' + (100 * paid / step.cost[k]).toFixed(1) + '%"></i></div></div>';
        }).join("");
        // la ressource qui limite : celle qui demande le plus de temps (ou que rien ne produit), avec d’où elle vient
        const lim = Object.keys(step.cost).map((k) => ({ k, rem: step.cost[k] - (ps.paid[k] || 0) - E.count(k) })).filter((x) => x.rem > 0 && E.isRawRes(x.k))
          .map((x) => ({ k: x.k, rem: x.rem, t: E.limiting(x.k, x.rem).eta })).sort((a, b) => (b.t === null) - (a.t === null) || b.t - a.t)[0];
        if (lim && !(step.need && !st.frags[step.need])) h += limitHTML(lim.k, lim.rem);
        if (step.need && !st.frags[step.need]) h += '<p class="why">Il faut d’abord atteindre ' + esc(D.FRAGS[step.need].n) + ".</p>";
        else h += '<div class="row wrap" style="margin-top:8px"><button class="btn small pri" data-contrib="' + pid + '" title="Déposer depuis ta Réserve ce qu’il demande">Fournir</button>' +
          '<button class="btn small' + (on ? " on" : "") + '" data-feed="' + pid + '">' + (on ? "Alimenté ✓" : "Alimenter") + "</button>" +
          '<span class="tiny muted">' + (on ? "Il se sert seul dans la Réserve : au plus " + perMin(E.siteRate()) + " pour chaque ressource." : "Une fois alimenté, il se sert seul dans la Réserve.") + "</span></div>";
      } else if (step.action === "relais") {
        const CH = (E.RECIT && E.RECIT.chant) || {};
        if (st.frags.coeur && st.frags.poings) h += '<p class="small">' + esc(CH.pret || "") + '</p>';
        else h += '<p class="why">' + esc(CH.manque || "") + '</p>';
      } else if (step.scene === "lacher") {
        h += '<p class="small">' + esc(((E.RECIT && E.RECIT.chant) || {}).lacher || "") + '</p>';
      } else if (step.fire) h += '<p class="small">Tout est prêt. La décision se prend dans le Cosmos.</p>';
      else if (step.melody) {
        const m = (D.MELODIES && D.MELODIES[step.melody]) || (E.allMelodies && E.allMelodies()[step.melody]);
        h += '<p class="small">Il ne reste qu’à jouer <b>' + esc(m ? m.n : step.melody) + "</b> sur la flûte (Journal).</p>";
      }
      return h + "</section>";
    }

    /* ------------------------------------------------------------ production */
    function prodHTML() {
      const P = E.production().filter((x) => x.in > 1e-4 || x.out > 1e-4), st = S();
      if (!P.length) return "";
      return '<details class="dom-card dom-prod"' + (U.prodOpen ? " open" : "") + ' data-prod><summary title="Plier ou déplier le tableau">Tout ce qui entre et sort, par ressource</summary>' +
        '<div class="u-pr u-ph tiny muted"><span class="grow">Ressource</span><span>entre</span><span>sort</span><span>réserve</span></div>' +
        P.slice(0, 30).map((x) => '<div class="u-pr" data-goto="' + x.id + '" role="button" tabindex="0" title="' + esc(I[x.id].n) + ' (toucher pour inspecter)">' + icon(x.id, "sm") + '<span class="grow ell">' + esc(I[x.id].n) + "</span>" +
          "<b>" + (x.in > 1e-4 ? "+" + perTime(x.in) : "") + "</b><i>" + (x.out > 1e-4 ? "−" + perTime(x.out) : "") + '</i><span data-c="' + x.id + '">' + fmt(st.inv[x.id] || 0) + "</span></div>").join("") + "</details>";
    }

    /* ------------------------------------------------------------ conseils */
    function hint() {
      if (quiet && quiet()) return null; // le tutoriel parle déjà
      const st = S(), us = E.extUnits();
      const exts = Object.keys(st.dom.ext).length, freeE = E.EXTS.filter((t) => us[t].own - us[t].used > 0);
      const vet = st.cycle > 1;
      if (!exts && !freeE.length && !st.hand.q.length && E.count("chaine") < 1) return null; // l’objectif dit quoi faire
      void vet;
      if (freeE.length && !st.flags.tip_freeExt) {
        const t = freeE[0], n = us[t].own - us[t].used;
        return "Tu as " + esc(many(t, n)) + " à poser : touche <b>+ " + esc(nm(t, 1)) + "</b> sur un gisement " + esc(deZone(I[t].z)) + ". " +
          '<button class="btn small ghost" data-tip="tip_freeExt" title="Fermer cette astuce">Compris</button>';
      }
      if (E.count("chaine") >= 1 && !st.flags.tip_chaine && !st.hand.q.length) {
        return "Ta <b>ligne d’assemblage</b> est prête : lance un lot de processeurs ou de pièces à l’Atelier. Elle aide les commandes de recettes que tes mains ont déjà fabriquées. " +
          '<button class="btn small pri" data-gotab="atelier">Préparer un lot</button> ' +
          '<button class="btn small ghost" data-tip="tip_chaine" title="Fermer cette astuce">Compris</button>';
      }
      const lone = Object.keys(D.PROJECTS).find((pid) => E.projVisible(pid) && !E.siteOn(pid) && E.projState(pid).step < D.PROJECTS[pid].steps.length);
      if (lone && !st.flags.tip_site) return "Active <b>Alimenter</b> pour approvisionner automatiquement ton Grand Œuvre depuis la Réserve. " + '<button class="btn small ghost" data-tip="tip_site" title="Fermer cette astuce">Compris</button>';
      return null;
    }

    /* ------------------------------------------------------------ fiches */
    const mbox = () => document.querySelector("#modal .modal-box");
    function extSheet(key) {
      const i = key.indexOf(":"), z = key.slice(0, i), res = key.slice(i + 1);
      const redraw = () => { const b = mbox(); if (b) b.innerHTML = extHTML(key); render(true); return true; };
      openModal({
        html: extHTML(key),
        refresh: () => extHTML(key),
        on: {
          eu: (b) => {
            const t = b.dataset.t, v = Number(b.dataset.v), cur = ((E.domExt(z, res) || { u: {} }).u[t]) || 0;
            if (v > 0 && E.freeExt(t) < v) feedback(E.domExtAdd(z, res, v, t), t); else { E.domExtSet(z, res, t, cur + v); A.click(); }
            return redraw();
          },
          eup: (b) => {
            const t = b.dataset.t, r = E.domExtUp(z, res, t);
            if (r.ok && r.queued) { A.click(); vibe(8); toast("✋ Amélioration commandée : " + esc(I[r.t].n) + ". Elle remplace un « " + esc(I[t].n.toLowerCase()) + " » dès qu’elle est finie.", { key: "xq" }); }
            else if (r.ok) { A.click(); vibe(8); }
            else {
              A.fail(0);
              const miss = r.missing ? Object.keys(r.missing).map((k) => fmt(r.missing[k]) + " " + esc(I[k].n.toLowerCase())).join(", ") : "";
              toast("Pas de quoi améliorer : " + esc(I[r.t || t].n.toLowerCase()) + (miss ? " : il manque " + miss : "") + ".", { key: "xq" });
            }
            return redraw();
          },
          toggle: () => { E.domExtToggle(z, res); A.click(); return redraw(); },
          clear: () => { const x = E.domExt(z, res); if (x) Object.keys(x.u).forEach((t) => E.domExtSet(z, res, t, 0)); A.click(); render(true); }
        }
      });
    }
    /* les seuils d’un gisement (D.SEUILS) : « 7 / 10 extracteurs, puis ×1,25 », ou pourquoi il n’y en a pas */
    function seuilHTML(e) {
      const q = E.seuil(e), x = (v) => "×" + String(Math.round(v * 100) / 100).replace(".", ",");
      if (q.sans) return '<p class="tiny muted">Cette terre n’a pas de seuils : le courant emporte déjà ce qui s’entasse.</p>';
      if (!q.prochain) return '<p class="tiny muted">Les quatre seuils sont passés : production ' + x(q.mult) + ".</p>";
      const prev = D.SEUILS.paliers[q.k - 1] || 0;
      return '<div class="seuil"><div class="tiny muted">' + q.n + " / " + q.prochain + " extracteurs, puis " + x(q.pas) + (q.k ? " · production déjà " + x(q.mult) : "") +
        '</div><div class="bar"><i style="width:' + Math.min(100, Math.max(0, ((q.n - prev) / (q.prochain - prev)) * 100)).toFixed(0) + '%"></i></div></div>';
    }
    function extHTML(key) {
      const i = key.indexOf(":"), z = key.slice(0, i), res = key.slice(i + 1);
      const e = E.domExt(z, res), us = E.extUnits(), info = E.machInfo(key), dep = E.zoneDeps(z).find((d) => d.res === res);
      const types = E.extFor(res, z).filter((t) => us[t].own > 0 || (e && e.u[t]) || S().known[t]);
      const rate = depRate(z, res);
      let h = '<div class="sheet-h">' + icon(res) + '<div class="grow"><h2>' + esc(I[res].n) + '</h2><div class="tiny muted">' + esc(E.ZONES[z].n) + "</div></div></div>";
      h += '<p class="small">' + (!e ? "Aucun extracteur actif." : info.s === "off" ? "En pause." : rate > 0 ? "Récolte : " + perTime(rate) + " (active hors ligne)." : "Démarrage…") + "</p>";
      h += seuilHTML(e);
      if (types.length) {
        const L = E.ligneDe(res);
        h += '<p class="tiny muted">' + (L ? "<b>" + esc(L.n) + "</b> : " : "") + "un bâtiment par ressource, qui monte de niveau. Chaque exemplaire récolte seulement ce gisement ; « Améliorer » en remplace un par le niveau d’après.</p>";
        h += '<div class="sheet-rows">' + types.map((t) => {
          const own = us[t].own, free = own - us[t].used, cur = (e && e.u[t]) || 0, nx = E.extNext(t);
          const pAdd = E.projectExtractor ? E.projectExtractor(z, res, t, 1) : null;
          const pUp = cur && nx && S().known[nx] && E.projectExtractorUpgrade ? E.projectExtractorUpgrade(z, res, t) : null;
          let up = "";
          if (cur && nx && S().known[nx] && I[nx].a <= S().age) {
            const upCostTxt = pUp ? (pUp.alreadyFree ? ' <span class="tiny" style="color:var(--good)">✓ disponible en réserve</span>' : ' <span class="tiny muted">· Coût : ' + Object.keys(pUp.cost).map((k) => itemPill(k, { qty: pUp.cost[k], lack: (S().inv[k] || 0) < pUp.cost[k] })).join(" ") + '</span>') : "";
            const upRateTxt = pUp ? '<div class="tiny" style="margin-top:2px">Débit après amélioration : <b>' + perTime(pUp.curRate) + ' → ' + perTime(pUp.projRate) + '</b>' + upCostTxt + '</div>' : "";
            up = '<button class="mini lbl" data-m="eup" data-t="' + t + '" aria-label="Améliorer un exemplaire : ' + esc(I[nx].n) + '" title="Remplacer 1 exemplaire par le niveau d’après (' + (pUp ? perTime(pUp.curRate) + ' → ' + perTime(pUp.projRate) : '') + ')" style="margin-top:6px">↑ Niveau ' + I[nx].lv + '</button>' + upRateTxt;
          }
          const addCostTxt = pAdd ? (pAdd.alreadyFree ? ' <span class="tiny" style="color:var(--good)">✓ 1 disponible à poser</span>' : ' <span class="tiny muted">· Coût cet exemplaire : ' + Object.keys(pAdd.cost).map((k) => itemPill(k, { qty: pAdd.cost[k], lack: (S().inv[k] || 0) < pAdd.cost[k] })).join(" ") + '</span>') : "";
          const addRateTxt = pAdd ? '<div class="tiny" style="margin-top:2px">Débit : <b>' + perTime(pAdd.curRate) + ' → ' + perTime(pAdd.projRate) + '</b>' + addCostTxt + '</div>' : "";
          return '<div class="u-row">' + icon(t, "sm") + '<span class="grow small"><span class="tiny muted">Niveau ' + I[t].lv + "</span> " + esc(I[t].n) + '<br><span class="tiny muted">' + perTime(E.extRate(t, res)) + " par exemplaire · " + (own ? "tu en as " + own + ", " + free + " à poser" : "à fabriquer : touche +") + "</span>" + addRateTxt + (up ? "<br>" + up : "") + "</span>" +
            '<button class="mini" data-m="eu" data-t="' + t + '" data-v="-1"' + (cur ? "" : " disabled") + ">−</button><b>" + cur + '</b><button class="mini" data-m="eu" data-t="' + t + '" data-v="1" aria-label="Un de plus">+</button>' +
            '<button class="mini" data-m="eu" data-t="' + t + '" data-v="10" aria-label="Dix de plus">+10</button></div>';
        }).join("") + "</div>";
      } else h += '<p class="small muted">Extracteur non découvert. Recette à chercher au Labo.</p>';
      if (dep && dep.hand) h += '<p class="tiny muted">Tu peux aussi récolter à la main : touche son icône dans les Terres, ou garde le doigt dessus.</p>';
      if (z === "mine") {
        const total = e ? Object.values(e.u).reduce((a, b) => a + b, 0) : 0;
        if (total >= 8 && E.addCurio) E.addCurio("tuyau");
        if (E.hasCurio && E.hasCurio("tuyau")) {
          h += '<p class="small" style="color:var(--good)">🟩 Un tuyau vert dépasse de la roche. Tu n’y descends pas.</p>';
        }
      }
      h += '<div class="acts">' + (e ? '<button class="btn" data-m="toggle">' + (e.on ? "Pause" : "Reprendre") + '</button><button class="btn ghost" data-m="clear">Tout retirer</button>' : "") + '<button class="btn pri" data-m="close">Fermer</button></div>';
      return h;
    }
    /* ce qu’un « +1 » a fait : posé, mis aux mains, ou pourquoi rien */
    function feedback(r, t, at) {
      if (r.placed || r.queued) {
        A.click(); vibe(8);
        if (r.placed && at) sparks(at.x, at.y, 10, "#ffd36b");
        if (at) floater((r.placed ? "+" + r.placed + " " : "") + (r.queued ? "✋ " + r.queued : ""), at.x, at.y - 14, "var(--good)");
        if (r.queued) toast("✋ Commande ajoutée : " + esc(many(t, r.queued)) + " (pose automatique sur ce gisement).", { key: "xq" });
        return;
      }
      A.fail(0);
      const miss = r.missing ? Object.keys(r.missing).map((k) => fmt(r.missing[k]) + " " + esc(I[k].n.toLowerCase())).join(", ") : "";
      toast(r.why === "full" ? "Commandes au maximum. Une place se libère à la fin d’une commande." :
        r.why === "noext" ? "Tu ne connais encore aucun extracteur pour ce gisement." :
          "Pas de quoi fabriquer " + esc(I[t].n.toLowerCase()) + (miss ? " : il manque " + miss : "") + ".", { key: "xq" });
    }

    /* ------------------------------------------------------------ récolte à la main */
    let hold = null;
    function harvest(btn) {
      const key = btn.dataset.harv, i = key.indexOf(":"), z = key.slice(0, i), res = key.slice(i + 1);
      const n = E.tap(res, z);
      if (!n) return;
      const crit = E.lastCrit;
      A.tap(res); vibe(crit ? [8, 30, 14] : 5);
      const rc = btn.getBoundingClientRect(), x = rc.left + rc.width / 2, y = rc.top + rc.height / 2;
      if (crit) {
        sparks(x, y, 16, "#ffd36b");
        floater("×2 !", x, y - 26, "#ffd36b");
        if (A.discover) A.discover();
      }
      const isVivant = (window.EclatStyleMode === "vivant" || (document.documentElement && document.documentElement.getAttribute("data-style-mode") === "vivant"));
      if (isVivant) {
        btn.classList.remove("hit"); void btn.offsetWidth; btn.classList.add("hit");
        spawnLivingParticles(x, y, res);
      }
      const row = btn.closest(".gis");
      let c = row && row.querySelector(".hcount");
      const now = performance.now();
      if (c && now - (Number(c.dataset.t) || 0) < 1200) c.dataset.n = Number(c.dataset.n) + n;
      else {
        if (c) c.remove();
        c = document.createElement("div");
        c.className = "hcount";
        c.dataset.n = n;
        if (row) row.appendChild(c);
      }
      c.dataset.t = now;
      c.textContent = "+" + fmt(Number(c.dataset.n)) + " " + I[res].n;
      c.classList.toggle("crit", crit);
      c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
      clearTimeout(c._tm);
      c._tm = setTimeout(() => { c.classList.add("out"); setTimeout(() => c.remove(), 400); }, 1100);
      const v = row && row.querySelector('[data-c="' + res + '"]');
      if (v) v.textContent = fmt(S().inv[res] || 0);
      btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop");
    }
    function down(ev) {
      const btn = ev.target.closest("[data-harv]");
      if (!btn) return false;
      ev.preventDefault();
      try { btn.setPointerCapture(ev.pointerId); } catch (e) { /* pas de capture possible */ }
      A.init && A.init();
      U.holding = true;
      if (btn.classList.contains("gis-ic-vivant")) btn.classList.add("holding");
      harvest(btn);
      const h = { id: ev.pointerId, btn };
      h.tm = setTimeout(function rep() { if (hold !== h) return; harvest(btn); h.tm = setTimeout(rep, 140); }, 380);
      hold = h;
      return true;
    }
    function up(ev) {
      if (!hold || (ev && ev.pointerId !== hold.id)) return;
      if (hold.btn) hold.btn.classList.remove("holding");
      clearTimeout(hold.tm);
      hold = null;
      U.holding = false;
      render();
    }

    function repriseSheet() {
      let quote = E.repriseQuote(), result = "";
      const signature = () => JSON.stringify(E.reprisePending().map(r => [r.i, r.left, E.repriseStatus(r)]));
      let last = signature();
      function html() {
        const p = S().meta.reprise;
        let h = '<h2 id="modalTitle">Plan de reprise</h2><p class="small">' + (p.inferred ? 'Plan proposé à partir des ruines conservées. Les emplacements pourront être ajustés dans les Terres.' : 'Installation de référence · Semeur ' + esc(String(p.cycle))) + '</p><p class="small">Choisis les équipements à reconstruire. Les terres fermées et les prérequis manquants attendent. Aucune dépense automatique plus tard.</p>';
        if (!E.reprisePending().length) return h + '<p role="status">Installation reconstituée.</p>' + (result ? '<p class="small">' + esc(result) + '</p>' : '') + '<button class="btn pri" data-m="close">Fermer</button>';
        h += '<div class="reprise-rows">' + E.reprisePending().map(r => {
          const i = r.i;
          const actions = quote.actions.filter(a => a.i === i), names = { place: 'poser', repair: 'réparer', order: 'commander' };
          const ready = Object.keys(names).map(k => { const n = actions.filter(a => a.kind === k).length; return n ? names[k] + ' ×' + n : ''; }).filter(Boolean).join(', ');
          return '<div class="row wrap reprise-row"><button class="btn small ghost" data-m="repriseSelect" data-i="' + i + '" aria-pressed="' + r.selected + '" aria-label="' + esc((r.selected ? 'Retirer ' : 'Inclure ') + I[r.id].n) + '">' + (r.selected ? '☑' : '☐') + '</button><span class="grow small">' + esc(I[r.id].n) + ' · reste ' + r.left + ' / ' + r.n + (r.z ? ' · ' + esc(E.ZONES[r.z].n) + ' / ' + esc(I[r.res].n) : '') + '<br><span class="tiny muted">' + esc(E.repriseStatus(r)) + (ready ? ' · ' + ready : '') + '</span></span></div>';
        }).join('') + '</div>';
        const costs = Object.entries(quote.cost).map(([id, n]) => esc(I[id].n) + ' ×' + fmt(n)).join(', ');
        h += '<p class="small"><b>Ce lancement : ' + quote.actions.length + ' opération(s)</b> · jusqu’à 24 par lancement. Réparations et poses sont immédiates ; les fabrications rejoignent les commandes.</p><p class="small">À dépenser ou réserver : <b>' + (costs || 'aucune ressource') + '</b>.</p>';
        if (!quote.actions.length && !result) h += '<p class="small">' + (E.repriseRows().filter(r => r.selected).every(r => E.repriseStatus(r) === 'Reconstitué') ? 'La sélection est déjà reconstituée.' : 'Aucun travail prêt. Termine les commandes, réunis les ressources ou rouvre les terres, puis actualise.') + '</p>';
        if (result) h += '<p role="status" class="small">' + esc(result) + '</p>';
        return h + '<div class="row wrap"><button class="btn pri" data-m="repriseApply" title="Exécuter uniquement les réparations, poses et commandes détaillées dans ce devis"' + (quote.actions.length ? '' : ' disabled') + '>Lancer ces travaux</button><button class="btn ghost" data-m="repriseRefresh" title="Recalculer les travaux possibles avec les ressources disponibles maintenant">Actualiser le devis</button></div>';
      }
      function redraw() { last = signature(); const box = document.querySelector('#modal .modal-box'); if (box) box.innerHTML = '<button class="modal-x" data-m="close" aria-label="Fermer">✕</button>' + html(); render(true); return true; }
      openModal({ html: html(), repriseLive: () => {
        if (signature() === last) return;
        quote = E.repriseQuote(); redraw();
      }, on: {
        repriseSelect: b => { E.repriseSelect(Number(b.dataset.i), !E.repriseRows()[Number(b.dataset.i)].selected); quote = E.repriseQuote(); result = ""; return redraw(); },
        repriseRefresh: () => { quote = E.repriseQuote(); result = "Devis actualisé."; return redraw(); },
        repriseApply: () => {
          const r = E.repriseApply(quote);
          result = r.ok ? r.applied + ' opération(s) lancée(s).' + (r.skipped ? ' Certains travaux attendent : le devis a changé.' : '') : 'La partie ou la sélection a changé. Actualise le devis.';
          quote = { actions: [], cost: {} }; return redraw();
        }
      } });
    }

    /* ------------------------------------------------------------ clics */
    function click(t, ev) {
      if (Decouvertes.click(t)) return true;
      if (Plaine.click(t)) return true;
      if (Riviere.click(t)) return true;
      if (Collines.click(t)) return true;
      let b;
      if ((b = t.closest("[data-contempler]"))) {
        if (A && A.page) A.page();
        openContemplation(b.dataset.contempler);
        return true;
      }
      if ((b = t.closest("[data-terre-go]"))) { A.click(); allerTerre(b.dataset.terreGo); return true; }
      if ((b = t.closest("[data-terre-nav]"))) { A.click(); terreVoisine(Number(b.dataset.terreNav)); return true; }
      if ((b = t.closest("[data-terre-panel]"))) { A.click(); const k = b.dataset.terrePanel; U.terrePanel = k && U.terrePanel !== k ? k : null; render(true); return true; }
      if (t.closest("[data-reprise]")) { repriseSheet(); return true; }
      if ((b = t.closest("[data-terre-maitrise] > summary"))) {
        const details = b.parentElement;
        U.terresOpen = U.terresOpen || {};
        U.terresOpen[details.dataset.terreMaitrise] = !details.open;
        return false;
      }
      if ((b = t.closest("[data-harv]"))) {
        // Le pointeur récolte à l’appui ; clavier et technologies d’assistance au clic.
        if (ev && ev.detail === 0) { A.init(); harvest(b); }
        return true;
      }
      if ((b = t.closest("[data-xadd]"))) {
        const key = b.dataset.xadd, i = key.indexOf(":"), z = key.slice(0, i), res = key.slice(i + 1);
        const ch = E.extChoice(res, z);
        if (!ch) return true;
        const r = E.domExtAdd(z, res, Number(b.dataset.n) || 1);
        const rc = b.getBoundingClientRect();
        feedback(r, ch.t, { x: rc.left + rc.width / 2, y: rc.top });
        render(true);
        return true;
      }
      if ((b = t.closest("[data-xrun]"))) {
        const key = b.dataset.xrun, i = key.indexOf(":");
        E.domExtToggle(key.slice(0, i), key.slice(i + 1), true);
        A.click();
        render(true);
        return true;
      }
      if ((b = t.closest("[data-land-toggle]"))) {
        const z = b.dataset.landToggle;
        U.domLandsOpen = U.domLandsOpen || {};
        U.domLandsOpen[z] = !U.domLandsOpen[z];
        A.click();
        render(true);
        return true;
      }
      if ((b = t.closest("[data-gsheet]"))) { A.click(); extSheet(b.dataset.gsheet); return true; }
      if ((b = t.closest("[data-mcancel]"))) {
        E.cancelJob(Number(b.dataset.mcancel));
        A.click();
        render(true);
        return true;
      }
      if ((b = t.closest("[data-cad-add]"))) {
        const rec = b.dataset.cadAdd;
        const r = E.setCadence && E.setCadence(rec, 100, true);
        if (r && r.ok) { A.click(); toast("🔄 Consigne : garder <b>" + esc(I[rec].n) + "</b> en réserve (jusqu’à 100)."); render(true); }
        return true;
      }
      if ((b = t.closest("[data-cad-cap]"))) {
        const rec = b.dataset.cadCap, q = Number(b.dataset.n) || 100;
        if (E.setCadence && E.setCadence(rec, q).ok) { A.click(); render(true); }
        return true;
      }
      if ((b = t.closest("[data-cad-toggle]"))) {
        const rec = b.dataset.cadToggle;
        const cur = S().dom.cadence && S().dom.cadence[rec];
        if (cur && E.setCadence && E.setCadence(rec, cur.cap, cur.on === false).ok) { A.click(); render(true); }
        return true;
      }
      if ((b = t.closest("[data-cad-del]"))) {
        const rec = b.dataset.cadDel;
        if (E.setCadence && E.setCadence(rec, null).ok) { A.click(); render(true); }
        return true;
      }
      if ((b = t.closest("[data-comptoir]"))) { A.click(); comptoirSheet(b.dataset.comptoir || "vendre"); return true; }
      if (t.closest("[data-dall]")) { U.domAll = !U.domAll; U.domOpen = null; A.click(); render(true); return true; }
      if ((b = t.closest("[data-feed]"))) {
        const pid = b.dataset.feed;
        E.domSite(pid, !E.siteOn(pid));
        A.click(); render(true);
        return true;
      }
      if ((b = t.closest("[data-contrib]"))) {
        const r = E.contribute(b.dataset.contrib);
        if (r.ok) { A.click(); vibe(10); } else { A.fail(0); toast("Dépôt impossible : ressources manquantes.", { key: "contrib" }); }
        render(true);
        return true;
      }
      if ((b = t.closest("[data-proj-act]"))) {
        const pid = b.dataset.projAct;
        if (pid === "chant") {
          const r = E.cutRelay();
          if (r.ok) { A.click(); vibe(30); toast("⚡ Le relais est coupé. Dans ta poitrine, quelque chose s’est tu."); render(true); }
          else { A.fail(0); toast(esc(((E.RECIT && E.RECIT.chant) || {}).manque || "")); }
        }
        return true;
      }
      if ((b = t.closest("[data-proj-scene]"))) {
        if (typeof api.openStillnessScene === "function") api.openStillnessScene();
        return true;
      }
      if ((b = t.closest("[data-ruines-sum]"))) {
        // le bloc se plie et se déplie sans être redessiné ; on retient l’état pour le prochain dessin
        const d = b.closest("details"), k = b.dataset.ruinesSum;
        U.ruinesOpen = U.ruinesOpen || {};
        U.ruinesOpen[k] = !d.open;
        return false;
      }
      if ((b = t.closest("[data-repair-all]"))) {
        const ids = b.dataset.repairAll.split(",").filter((id) => I[id]);
        const n = E.repairAll(ids);
        if (n > 0) { A.init(); A.click(); vibe([10, 30, 10]); toast("🛖 " + n + (n > 1 ? " ruines relevées." : " ruine relevée."), { key: "repair" }); }
        else { A.fail(0); toast("Rien à relever pour l’instant : il manque des ressources.", { key: "repair" }); }
        render(true);
        return true;
      }
      if ((b = t.closest("[data-repair]"))) {
        const id = b.dataset.repair;
        const r = E.repair(id);
        if (r.ok) {
          A.init(); A.click(); vibe([10, 30]);
          const it = I[id];
          const echoTxt = r.echo && r.firstInCycle ? ' <i>« ' + esc(r.echo) + ' »</i>' : "";
          if (it.t === "ext") toast("<b>" + esc(I[id].n) + "</b> : réparation faite, de nouveau au travail." + echoTxt, { key: "repair" });
          else toast("<b>" + esc(I[id].n) + "</b> : réparation faite. Elle est au repos, dans l’onglet Machines." + echoTxt, { key: "repair" });
        } else {
          A.fail(0);
          if (r.missing) toast("Il manque encore : " + Object.keys(r.missing).map((m) => r.missing[m] + " " + esc(I[m].n.toLowerCase())).join(", ") + ".", { key: "repair" });
          else toast("Impossible de réparer.", { key: "repair" });
        }
        render(true);
        return true;
      }
      if (t.closest("[data-prod]") && t.closest("summary")) { U.prodOpen = !t.closest("details").open; return false; }
      return false;
    }

    /* ------------------------------------------------------------ rafraîchir sans redessiner */
    function live(root) {
      if (!root) return;
      Decouvertes.live();
      Plaine.live();
      Riviere.live();
      Collines.live();
      if (U.mcur && U.mcur.repriseLive) U.mcur.repriseLive();
      root.querySelectorAll("[data-terre-compteur]").forEach((el) => {
        const [z, type] = el.dataset.terreCompteur.split(":"), t = E.terreMaitrise(z);
        if (t) el.textContent = t.phases[type === "production" ? 3 : 4].actuel;
      });
      root.querySelectorAll("[data-rate]").forEach((el) => {
        const key = el.dataset.rate, i = key.indexOf(":"), r = depRate(key.slice(0, i), key.slice(i + 1));
        el.textContent = r > 0 ? "+" + perTime(r) : "";
      });
      const hi = E.handInfo();
      root.querySelectorAll("[data-opbar]").forEach((el) => {
        const idx = Number(el.dataset.opbar), j = hi && hi.jobs[idx];
        if (j) el.style.width = Math.min(100, 100 * (j.frac || 0)).toFixed(1) + "%";
      });
      root.querySelectorAll("[data-sp]").forEach((el) => {
        const [pid, k] = el.dataset.sp.split(":"), P = D.PROJECTS[pid], ps = E.projState(pid), step = P && P.steps[ps.step];
        if (step && step.cost && step.cost[k]) el.textContent = fmt(ps.paid[k] || 0) + " / " + fmt(step.cost[k]);
      });
    }
    /* signature de ce qui change la mise en page : on ne redessine que si elle change */
    function sig() {
      const st = S(), ms = E.machines();
      return [U.zone, U.terrePanel || "", api.topSig ? api.topSig() : "", E.terresSignature(), JSON.stringify(st.exp.done), openZones().join(), JSON.stringify(st.dom.ext),
        Object.keys(st.dom.site).join(), E.EXTS.map((t) => E.freeExt(t)).join(), E.MACHINES.map((m) => ms[m].own + ":" + ms[m].used).join(),
        st.hand.q.length, st.exp.active ? st.exp.active.z : "", st.act ? st.act.k + (st.act.res || st.act.id) : "", E.passPending().join(), U.domAll, JSON.stringify(U.domLandsOpen || {}), U.compact(), Object.values(st.dom.ext).map((e) => e.on).join(),
        (E.zoneOpen(D.COMPTOIR.zone) ? "cp" + Math.floor(st.ecus || 0) + "a" + (E.troqueurCount ? E.troqueurCount() : 0) : ""), JSON.stringify(E.ruins()), E.reprisePending ? E.reprisePending().map(r => r.i + ":" + r.left).join() : ""].join("|");
    }

    /* une terre précise : on la déplie et on la montre */
    function focusZone(z) {
      if (!allerTerre(z)) render(true);
    }
    /* un extracteur vient d’être fabriqué ailleurs (Atelier, Carnet) : on le pose */
    function placeExt(t) {
      const r = E.domAutoExt(t);
      if (r) { toast(esc(I[t].n) + " au travail : " + esc(I[r.res].n.toLowerCase()) + ", " + esc(E.ZONES[r.z].n) + ".", { key: "xq" }); focusZone(r.z); }
      else toast(esc(I[t].n) + " : touche « + " + esc(nm(t, 1)) + " » sur un gisement " + esc(deZone(I[t].z)) + ".", { key: "xq" });
    }
    function placeMach(m) {
      toast(esc(I[m].n) + " : au repos, jusqu’à ta prochaine commande.", { key: "mq" });
    }

    function machSig() {
      const ms = E.machines(), hi = E.handInfo(), cads = E.cadences ? E.cadences() : [];
      return [
        (hi ? hi.jobs.map((j) => j.id + ":" + j.n + ":" + j.finalDone + ":" + j.wait + ":" + JSON.stringify(j.miss) + ":" + j.steps.map((s) => s.done + ":" + (s.hands ? 1 : 0) + ":" + s.machs).join(",")).join(";") : ""),
        E.MACHINES.map((m) => ms[m].own + ":" + ms[m].used + ":" + JSON.stringify(ms[m].byRec)).join(),
        cads.map((c) => c.id + ":" + c.cap + ":" + (c.on ? 1 : 0) + ":" + c.status + ":" + c.machs).join(";"),
        JSON.stringify(E.ruins())
      ].join("|");
    }

    return { view, terresView, live, sig, machSig, click, down, up, focusZone, placeExt, placeMach, extSheet, comptoirSheet, machinesView, openContemplation };
  }

  window.EclatDomaine = { create };
})();
