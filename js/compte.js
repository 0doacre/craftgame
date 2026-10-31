/* ÉCLAT — le menu, les réglages, les sauvegardes et le compte en ligne.
 * Exporter, importer, restaurer une copie ; la sauvegarde illisible, les nouveautés ;
 * la connexion, les emplacements et la synchronisation ; le menu, l’aide, la capsule. */
(function () {
  "use strict";

  function create(api) {
    const {
      E, ENGINE, A, D, U, Cloud, Tuto, esc, fmt, fmtTime, fmtDate, toast, openModal, closeModal, swapModal, simpleModal,
      save, backups, pushBackup, setTab, applyTheme, applyLargeText, volumes, intro, openMemoire, visiteurFin, App, Dom, checkUpdate
    } = api;
    const S = () => E.state;
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

    function stamp() {
      const d = new Date(), p = (n) => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "_" + p(d.getHours()) + "h" + p(d.getMinutes());
    }
    function download(name, text) {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
    }
    function downloadSave() {
      save();
      download("eclat-sauvegarde-" + stamp() + ".json", E.serialize());
      toast("💾 Sauvegarde téléchargée.");
    }
    /* Remplace la partie actuelle par une autre (fichier, code, copie de sécurité). */
    function replaceWith(raw, why) {
      let txt;
      try { txt = E.decodeSave(raw); E.parseSave(txt); } catch (e) { toast("Fichier illisible : " + esc(e.message)); return false; }
      if (!U.peutEcrire()) { toast("Cette page n’enregistre pas la partie pour l’instant : l’import est annulé."); return false; }
      if (!U.saveLocked) pushBackup(E.serialize(), why);
      E.load(txt);
      U.saveLocked = false; U.badSave = null;
      save();
      U.slots = [null, null, null]; U.last = null;
      setTab("domaine");
      toast("Partie chargée.");
      return true;
    }
    function pickFile(cb) {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = ".json,application/json,text/plain";
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => cb(String(r.result || ""));
        r.readAsText(f);
      };
      inp.click();
    }
    function backupMeta(b) {
      if (!b || !b.data) return null;
      try {
        const o = E.parseSave(E.decodeSave(b.data));
        const ageName = (D.AGES && D.AGES[o.age] && D.AGES[o.age].n) || "Âge inconnu";
        const semeur = ((o.cycle || 1) + 6) + "e";
        const playTime = fmtTime((o.stats && o.stats.play) || 0);
        const knownCount = Object.keys(o.known || {}).length;
        const traces = (o.meta && o.meta.traces) || 0;
        return { ageName, semeur, playTime, knownCount, traces };
      } catch (_) {
        return null;
      }
    }

    /* l'icône du compte : une silhouette (tête et épaules) */
    const COMPTE = '<svg class="gi gl compte-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4.2" fill="currentColor"/><path d="M3.5 21c0-4.7 3.8-8.2 8.5-8.2s8.5 3.5 8.5 8.2z" fill="currentColor"/></svg>';
    function openSaves() {
      const list = backups();
      const persistMsg = {
        accordee: '<div class="save-status ok"><span class="ss-ic">🔒</span><span>Le navigateur s’est engagé à garder cette partie.</span></div>',
        refusee: '<div class="save-status warn"><span class="ss-ic">⚠️</span><span>Le navigateur ne garantit pas la conservation de cette partie : télécharge une copie de temps en temps.</span></div>',
        absente: '<div class="save-status warn"><span class="ss-ic">⚠️</span><span>Ce navigateur ne permet pas de protéger la partie : télécharge une copie de temps en temps.</span></div>',
        inconnue: '<div class="save-status warn"><span class="ss-ic">⚠️</span><span>La protection de la partie n’a pas pu être vérifiée : télécharge une copie de temps en temps.</span></div>'
      }[U.persist] || "";

      openModal({
        cls: "saves-modal",
        html: '<div class="kicker">Partie &amp; Données</div>' +
          '<h2>Sauvegardes</h2>' +
          '<p class="small muted">Ta partie est conservée sur cet appareil. Garde un fichier de côté pour la mettre à l’abri.</p>' +
          persistMsg +
          '<div class="saves-actions-grid">' +
            '<button class="btn save-act-card pri" data-m="dl" title="Télécharger un fichier de sauvegarde au format JSON">' +
              '<span class="save-act-ic">⬇️</span>' +
              '<div class="save-act-info">' +
                '<b>Enregistrer un fichier</b>' +
                '<span class="tiny muted">Ta partie, à garder sur ton appareil</span>' +
              '</div>' +
            '</button>' +
            '<button class="btn save-act-card" data-m="up" title="Charger un fichier de sauvegarde JSON depuis ton appareil">' +
              '<span class="save-act-ic">⬆️</span>' +
              '<div class="save-act-info">' +
                '<b>Reprendre un fichier</b>' +
                '<span class="tiny muted">Remplace ta partie par celle du fichier</span>' +
              '</div>' +
            '</button>' +
          '</div>' +
          (list.length ?
            '<div class="saves-backups-section">' +
              '<div class="saves-sec-head">' +
                '<h3 class="sub">Copies de sécurité</h3>' +
                '<span class="tiny dim">' + list.length + ' disponible' + (list.length > 1 ? 's' : '') + '</span>' +
              '</div>' +
              '<div class="backups-list">' +
                list.map((b, i) => {
                  const m = backupMeta(b);
                  return '<div class="bk backup-card">' +
                    '<div class="bk-main">' +
                      '<div class="bk-head">' +
                        '<b class="bk-why">' + esc(b.why) + '</b>' +
                        '<span class="bk-time tiny muted">' + fmtDate(b.t) + '</span>' +
                      '</div>' +
                      (m ?
                        '<div class="bk-chips tiny">' +
                          '<span class="bk-chip age">🌿 ' + esc(m.ageName) + '</span>' +
                          '<span class="bk-chip semeur">Semeur ' + m.semeur + '</span>' +
                          '<span class="bk-chip play">⏱️ ' + m.playTime + '</span>' +
                        '</div>' :
                        '<div class="tiny muted">format v' + b.v + '</div>'
                      ) +
                    '</div>' +
                    '<div class="bk-actions">' +
                      '<button class="btn small pri" data-m="brs" data-i="' + i + '" title="Restaurer cette copie de sauvegarde">Restaurer</button>' +
                    '</div>' +
                  '</div>';
                }).join("") +
              '</div>' +
            '</div>' : "") +
          '<div class="acts"><button class="btn" data-m="close">Fermer</button></div>',
        on: {
          dl: () => { downloadSave(); return true; },
          up: () => { pickFile((txt) => confirmReplace(txt, "Avant le chargement d’un fichier")); return true; },
          bdl: (b) => { const k = backups()[Number(b.dataset.i)]; if (k) download("eclat-copie-" + stamp() + ".json", k.data); return true; },
          brs: (b) => { const k = backups()[Number(b.dataset.i)]; if (k) setTimeout(() => confirmReplace(k.data, "Avant la restauration d’une copie"), 80); }
        }
      });
    }
    function confirmReplace(txt, why) {
      let o;
      try { o = E.parseSave(E.decodeSave(txt)); } catch (e) { toast("Fichier illisible : " + esc(e.message)); return; }
      const st = S();
      const newAge = (D.AGES && D.AGES[o.age] && D.AGES[o.age].n) || "Âge inconnu";
      const curAge = (D.AGES && D.AGES[st.age] && D.AGES[st.age].n) || "Âge inconnu";
      const newRec = Object.keys(o.known || {}).length;
      const curRec = Object.keys(st.known || {}).length;
      const newSemeur = ((o.cycle || 1) + 6) + "e";
      const curSemeur = ((st.cycle || 1) + 6) + "e";
      const newPlay = fmtTime((o.stats && o.stats.play) || 0);
      const curPlay = fmtTime((st.stats && st.stats.play) || 0);

      openModal({
        cls: "confirm-load-modal",
        html: '<div class="kicker">Restauration</div>' +
          '<h2>Charger cette partie ?</h2>' +
          '<p class="small">Vérifie les informations ci-dessous avant de remplacer ta progression active :</p>' +
          '<div class="vs save-duel">' +
            '<div class="card duel-card incoming">' +
              '<div class="duel-badge" style="color:var(--good)">📥 Partie à charger</div>' +
              '<b>🌿 ' + esc(newAge) + '</b>' +
              '<div class="small muted">' +
                'Semeur ' + newSemeur + ' · ' + newRec + ' recettes connues<br>' +
                '⏱️ ' + newPlay + ' de jeu · ✦ ' + ((o.meta && o.meta.traces) || 0) + ' Souvenirs' +
              '</div>' +
            '</div>' +
            '<div class="card duel-card current">' +
              '<div class="duel-badge" style="color:var(--muted)">📱 Partie actuelle (archivée)</div>' +
              '<b>🌿 ' + esc(curAge) + '</b>' +
              '<div class="small muted">' +
                'Semeur ' + curSemeur + ' · ' + curRec + ' recettes connues<br>' +
                '⏱️ ' + curPlay + ' de jeu · ✦ ' + ((st.meta && st.meta.traces) || 0) + ' Souvenirs' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<p class="tiny dim">Ta partie actuelle sera remplacée, mais une copie de sécurité automatique est créée immédiatement avant.</p>' +
          '<div class="acts"><button class="btn" data-m="close">Annuler</button><button class="btn pri" data-m="go">Charger</button></div>',
        on: { go: () => { replaceWith(txt, why); } }
      });
    }
    function showBadSave() {
      const b = U.badSave;
      openModal({
        persistent: true,
        html: '<div class="kicker">Sauvegarde</div><h2>Ta partie n’a pas pu être lue</h2><p>Elle n’a <b>pas</b> été modifiée et reste sur cet appareil. Télécharge-la pour la garder en lieu sûr.</p>' +
          '<p class="tiny muted">Détail : ' + esc(b.err) + "</p>" +
          '<div class="acts" style="flex-direction:column"><button class="btn pri" data-m="dl">⬇️ Télécharger la sauvegarde illisible</button><button class="btn" data-m="up">⬆️ Charger un autre fichier</button>' +
          '<button class="btn ghost" data-m="fresh">Commencer une nouvelle partie (l’ancienne est mise à l’abri)</button></div>',
        on: {
          dl: () => { download("eclat-sauvegarde-illisible-" + stamp() + ".json", b.raw); return true; },
          up: () => { pickFile((txt) => { if (replaceWith(txt, "Avant le chargement d’un fichier")) closeModal(); }); return true; },
          fresh: () => {
            pushBackup(b.raw, "Sauvegarde illisible mise à l’abri");
            U.saveLocked = false; U.badSave = null;
            E.reset(); save(); setTab("domaine"); setTimeout(intro, 100);
          }
        }
      });
    }
    function showNews() {
      const st = S();
      const hasBackup = backups().some((b) => b.v < ENGINE.SAVE_VERSION);
      openModal({
        html: '<div class="kicker">Mise à jour ' + esc(D.VERSION) + "</div><h2>Ta partie a été conservée</h2>" +
          '<ul class="news">' + D.CHANGES.map((c) => "<li>" + esc(c) + "</li>").join("") + "</ul>" +
          (st.flags.mach57 ? '<p class="small">Tes machines ne sont plus fixées sur une recette : elles sont au repos et aident tes commandes. Les ressources qu’elles utilisaient sont revenues dans ta Réserve.</p>' : "") +
          (st.flags.news === "6" && Object.keys(st.dom.ext).length ? '<p class="small">Les tapis disparaissent : tes extracteurs sont maintenant rangés dans les <b>Terres</b>, terre par terre. Ils récoltent autant qu’avant, et ce qui se trouvait sur les tapis est revenu dans ta Réserve.</p>' : "") +
          (st.flags.v5proj ? '<p class="small">Ton Grand Œuvre est commencé, et tout ce que tu y as fourni est conservé. Dans les Terres, touche « Alimenter » pour qu’il se serve seul dans la Réserve.</p>' : "") +
          (hasBackup ? '<p class="small muted">Par précaution, une copie de ton ancienne sauvegarde a été mise de côté. Tu peux la télécharger ici ou plus tard depuis Menu → Sauvegardes.</p>' : "") +
          '<div class="acts">' + (hasBackup ? '<button class="btn" data-m="old">⬇️ Ancienne sauvegarde</button>' : "") + '<button class="btn pri" data-m="close">Continuer</button></div>',
        on: { old: () => { const k = backups().find((b) => b.v < ENGINE.SAVE_VERSION); if (k) download("eclat-ancienne-sauvegarde-v" + k.v + "-" + stamp() + ".json", k.data); return true; } },
        onClose: () => { st.flags.news = null; st.flags.ver = D.VERSION; delete st.flags.fab3; delete st.flags.fab4; delete st.flags.v5proj; delete st.flags.mach57; save(); }
      });
    }


    const summary = (o) => esc(D.AGES[o.age] ? D.AGES[o.age].n : "?") + " · " + fmtTime((o.stats && o.stats.play) || 0) + " de jeu · " + Object.keys(o.known || {}).length + " recettes";
    const busy = (b, txt) => { if (b) { b.disabled = true; b.dataset.t = b.textContent; b.textContent = txt || "Un instant…"; } };
    const unbusy = (b) => { if (b && b.isConnected) { b.disabled = false; if (b.dataset.t) b.textContent = b.dataset.t; } };
    async function openAccount(msg) {
      if (!Cloud.configured()) {
        simpleModal("Compte", "Pas encore de comptes", "<p>Les comptes en ligne ne sont pas encore ouverts sur ce jeu. En attendant, ta partie reste enregistrée sur cet appareil, et tu peux la télécharger dans Menu → Sauvegardes.</p>" +
          '<p class="tiny dim">Pour la personne qui publie le jeu : la marche à suivre est dans server/README.md.</p>');
        return;
      }
      const a = Cloud.account();
      if (!a || !a.token) { swapModal(loginModal(msg, a && a.pseudo)); return; }
      try { await Cloud.slots(); U.sync.err = null; } catch (e) { U.sync.err = e.message; }
      swapModal(accountModal(msg));
    }
    function loginModal(msg, pseudo) {
      const up = U.acMode === "up";
      return {
        cls: "account-modal",
        html: '<div class="kicker">Compte</div><h2>' + (up ? "Créer un compte" : "Se connecter") + "</h2>" +
          '<p class="small muted">Avec un compte, tes sauvegardes sont synchronisées en ligne et accessibles sur tous tes appareils.</p>' +
          '<div class="seg login-seg"><button data-m="tin" class="' + (up ? "" : "on") + '">🔑 J’ai un compte</button><button data-m="tup" class="' + (up ? "on" : "") + '">✨ Nouveau compte</button></div>' +
          '<div class="login-box">' +
            '<label class="fld"><span>Pseudo</span><input id="acP" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="24" placeholder="Ton nom de joueur" value="' + esc(pseudo || "") + '"></label>' +
            '<label class="fld"><span>Mot de passe</span><input id="acW" type="password" autocomplete="' + (up ? "new-password" : "current-password") + '" placeholder="Au moins 8 caractères"></label>' +
            (up ? '<label class="fld"><span>Confirme le mot de passe</span><input id="acW2" type="password" autocomplete="new-password" placeholder="Retape ton mot de passe"></label>' : "") +
          '</div>' +
          '<p class="small err" id="acErr">' + esc(msg || "") + "</p>" +
          '<div class="crypto-note"><span class="crypto-ic">🔒</span><span class="tiny dim">Chiffrement de bout en bout : ta partie est chiffrée sur ton appareil avant d’être envoyée. Personne ne peut la lire sans ton mot de passe.</span></div>' +
          '<div class="acts"><button class="btn" data-m="close">Annuler</button><button class="btn pri" data-m="go">' + (up ? "Créer le compte" : "Se connecter") + "</button></div>",
        onOpen: (box) => { const f = $(pseudo ? "#acW" : "#acP", box); if (f) f.focus(); },
        on: {
          tin: () => { U.acMode = "in"; swapModal(loginModal("", $("#acP").value)); return true; },
          tup: () => { U.acMode = "up"; swapModal(loginModal("", $("#acP").value)); return true; },
          go: (b) => { doLogin(b, up); return true; }
        }
      };
    }
    async function doLogin(b, up) {
      const p = $("#acP").value.trim(), w = $("#acW").value, err = $("#acErr");
      const say = (t) => { if (err) err.textContent = t; };
      if (!/^[\p{L}\p{N}_.-]{3,24}$/u.test(p)) return say("Le pseudo doit faire de 3 à 24 caractères : lettres, chiffres, tiret, point ou tiret bas.");
      if (up && w.length < 8) return say("Le mot de passe doit faire au moins 8 caractères.");
      if (up && w !== $("#acW2").value) return say("Les deux mots de passe ne sont pas identiques.");
      if (!w) return say("Il manque le mot de passe.");
      busy(b, up ? "Création…" : "Connexion…");
      say("");
      try {
        if (up) await Cloud.register(p, w); else await Cloud.login(p, w);
        A.discover();
        await afterLogin(up);
      } catch (e) { unbusy(b); say(e.message); }
    }
    async function afterLogin(isNew) {
      let list = [];
      try { if (!isNew) list = await Cloud.slots(); } catch (e) { swapModal(accountModal(e.message)); return; }
      if (!list.length) {
        await cloudPush({ force: true, quiet: true });
        swapModal(accountModal("Voilà : ta partie est maintenant gardée en ligne aussi."));
        updateCloudBtn();
        return;
      }
      const a = Cloud.account();
      const slot = (a && a.slot) || 1;
      if (!list.some((x) => x.slot === slot)) {
        swapModal(accountModal("Ce compte a des parties en ligne. Ouvre un emplacement pour en reprendre une."));
        updateCloudBtn();
        return;
      }
      let cloud = null;
      try { cloud = await Cloud.pull(slot); } catch (e) { swapModal(accountModal(e.message)); return; }
      chooseVersion(cloud, "Il y a déjà une partie dans l’emplacement " + slot + ".");
    }
    /* deux versions de la partie : le joueur choisit, l’autre part dans les copies */
    function chooseVersion(cloud, intro) {
      let o;
      try { o = E.parseSave(cloud.text); } catch (e) { swapModal(accountModal("La partie en ligne est illisible : " + e.message)); return; }
      swapModal({
        persistent: true,
        cls: "choose-version-modal",
        html: '<div class="kicker">Compte</div><h2>Quelle partie garder ?</h2><p class="small">' + esc(intro) + "</p>" +
          '<div class="vs save-duel">' +
            '<div class="card duel-card duel-cloud">' +
              '<div class="duel-badge" style="color:var(--good)">☁️ Emplacement ' + cloud.slot + ' (En ligne)</div>' +
              '<b>Partie du compte</b>' +
              '<div class="small muted">' + summary(o) + '<br>Envoyée le ' + esc(fmtDate(cloud.updated)) + '</div>' +
            '</div>' +
            '<div class="card duel-card duel-local">' +
              '<div class="duel-badge" style="color:var(--acc)">📱 Cet appareil (Local)</div>' +
              '<b>Partie locale</b>' +
              '<div class="small muted">' + summary(S()) + '</div>' +
            '</div>' +
          '</div>' +
          '<p class="tiny dim" style="margin-top:8px">Celle que tu ne gardes pas n’est pas perdue : elle va dans les copies de sécurité (Menu → Sauvegardes).</p>' +
          '<div class="acts" style="flex-direction:column">' +
            '<button class="btn pri" data-m="cloud">Prendre la partie en ligne</button>' +
            '<button class="btn" data-m="local">Garder celle de cet appareil</button>' +
          '</div>',
        on: {
          cloud: () => { if (replaceWith(cloud.text, "Avant de charger la partie du compte")) { Cloud.useSlot(cloud.slot); Cloud.adopt(cloud.rev, cloud.updated, cloud.slot); U.sync.conflict = null; updateCloudBtn(); } },
          local: () => { pushBackup(cloud.text, "Partie du compte, remplacée par celle de l’appareil"); U.sync.conflict = null; cloudPush({ force: true, manual: true, slot: cloud.slot }); }
        }
      });
    }
    function accountModal(msg) {
      const a = Cloud.account() || {};
      const c = U.sync.conflict;
      return {
        cls: "account-manage-modal",
        html: '<div class="kicker">Sauvegarde en ligne</div><h2>' + COMPTE + " " + esc(a.pseudo || "") + "</h2>" +
          '<div class="account-user-card">' +
            '<div class="auc-avatar">🌌</div>' +
            '<div class="auc-info">' +
              '<div class="auc-name"><b>' + esc(a.pseudo || "") + '</b></div>' +
              '<div class="tiny muted">' + (a.last ? "Dernier envoi (emplacement " + (a.slot || 1) + ") : " + esc(fmtDate(a.last)) : "Rien n’a encore été envoyé.") + '</div>' +
            '</div>' +
          '</div>' +
          (msg ? '<p class="small account-msg">' + esc(msg) + "</p>" : "") +
          (c ? '<div class="card warnc save-conflict-alert"><b>⚠️ Conflit de sauvegarde (emplacement ' + (c.slot || a.slot || 1) + ')</b><div class="small muted">Envoyée le ' + esc(fmtDate(c.updated)) + ', sans doute depuis un autre appareil.</div><button class="btn small pri" data-m="solve" style="margin-top:8px">Choisir la partie à garder</button></div>' : "") +
          (U.sync.err ? '<div class="save-status warn" style="margin:8px 0"><span class="ss-ic">⚠️</span><span>' + esc(U.sync.err) + '</span></div>' : "") +
          '<div class="saves-sec-head" style="margin-top:14px">' +
            '<h3 class="sub">Trois emplacements en ligne</h3>' +
            '<span class="tiny dim">Emplacement ' + (a.slot || 1) + ' actif</span>' +
          '</div>' +
          '<p class="tiny dim">L’envoi automatique va dans l’emplacement actif. Les autres gardent une partie de côté.</p>' +
          (a.legacy ? '<p class="tiny err">Le serveur des comptes n’est pas encore à jour : seule la première sauvegarde en ligne est disponible.</p>' : "") +
          '<div class="slots-container">' + [1, 2, 3].map(slotLine).join("") + '</div>' +
          '<div class="toggle account-toggle"><div><b>Envoi automatique</b><div class="tiny dim">régulièrement, et quand tu quittes le jeu</div></div><button class="btn small ' + (a.auto ? "pri" : "") + '" data-m="auto">' + (a.auto ? "Activé" : "Coupé") + "</button></div>" +
          '<div class="acts" style="flex-direction:column;margin-top:14px"><button class="btn pri" data-m="push">⬆️ Envoyer maintenant (emplacement ' + (a.slot || 1) + ')</button><button class="btn" data-m="pull">⬇️ Récupérer la partie en ligne</button>' +
          '<div class="account-subacts">' +
            '<button class="btn ghost small" data-m="pw">🔑 Changer mot de passe</button>' +
            '<button class="btn ghost small" data-m="out">🚪 Se déconnecter</button>' +
            '<button class="btn ghost small" data-m="del" style="color:var(--bad)">🗑️ Supprimer le compte</button>' +
          '</div>' +
          '<button class="btn" data-m="close" style="margin-top:8px">Fermer</button></div>',
        on: {
          auto: (b) => { Cloud.setAuto(!a.auto); b.textContent = Cloud.account().auto ? "Activé" : "Coupé"; a.auto = Cloud.account().auto; return true; },
          push: (b) => { busy(b, "Envoi…"); cloudPush({ manual: true }).then(() => swapModal(accountModal(U.sync.conflict ? "" : U.sync.err ? "" : "Partie envoyée."))); return true; },
          pull: (b) => {
            busy(b, "Téléchargement…");
            Cloud.pull().then((cl) => {
              if (!cl) swapModal(accountModal("L’emplacement actif est vide. Ouvre un emplacement ci-dessus pour reprendre une partie."));
              else chooseVersion(cl, "Voici la partie enregistrée en ligne.");
            }).catch((e) => swapModal(accountModal(e.message)));
            return true;
          },
          solve: (b) => { busy(b); Cloud.pull().then((cl) => cl && chooseVersion(cl, "Ta partie a avancé sur un autre appareil.")).catch((e) => swapModal(accountModal(e.message))); return true; },
          slot: (b) => { swapModal(slotModal(Number(b.dataset.i))); return true; },
          pw: () => { swapModal(passwordModal()); return true; },
          out: () => { Cloud.logout().then(updateCloudBtn); toast("Déconnexion effectuée. Partie conservée sur cet appareil."); },
          del: () => { swapModal(deleteModal()); return true; }
        }
      };
    }
    /* une ligne par emplacement dans la fenêtre Compte */
    function slotInfo(n) {
      const a = Cloud.account() || {};
      const m = (a.revs && a.revs[n]) || null;
      const active = (a.slot || 1) === n;
      return {
        slot: n,
        active,
        rev: m ? m.rev : active ? a.rev || 0 : 0,
        updated: m ? m.updated : active ? a.last || 0 : 0
      };
    }
    function slotLine(n) {
      const s = slotInfo(n);
      const off = (Cloud.account() || {}).legacy && n > 1;
      return '<div class="bk slot-card' + (s.active ? ' slot-active' : '') + '">' +
        '<div class="slot-badge-num">' + n + '</div>' +
        '<div class="grow slot-info">' +
          '<div class="slot-title-row">' +
            '<b>Emplacement ' + n + '</b>' +
            (s.active ? ' <span class="slot-status-pill active">Actif</span>' : ' <span class="slot-status-pill muted">Réserve</span>') +
          '</div>' +
          '<div class="tiny muted slot-date">' +
            (off ? "Serveur à mettre à jour" : s.rev ? "☁️ Sauvegardé le " + esc(fmtDate(s.updated)) : "⚪ Emplacement vide") +
          '</div>' +
        '</div>' +
        (off ? "" : '<button class="btn small" data-m="slot" data-i="' + n + '" title="Gérer l’emplacement ' + n + '">Gérer</button>') +
      '</div>';
    }
    function slotModal(n) {
      const s = slotInfo(n);
      return {
        cls: "slot-detail-modal",
        html: '<div class="kicker">Emplacement en ligne</div><h2>Emplacement ' + n + (s.active ? ' <span class="slot-status-pill active" style="vertical-align:middle;margin-left:6px">Actif</span>' : "") + '</h2>' +
          '<div class="slot-hero-card card">' +
            '<div class="sh-status">' +
              (s.rev ? '<span class="status-dot ok"></span> <b>Partie enregistrée</b> · ' + esc(fmtDate(s.updated)) : '<span class="status-dot empty"></span> <b>Emplacement vide</b>') +
            '</div>' +
            '<p class="small muted" style="margin:4px 0 0">' +
              (s.active ? "C’est l’emplacement actif pour cet appareil : les envois automatiques vont ici." : "Emplacement secondaire de réserve.") +
            '</p>' +
          '</div>' +
          '<p class="tiny dim">Prendre une partie la charge sur cet appareil et rend son emplacement actif. Déposer garde celle de cet appareil en ligne sans changer d’emplacement.</p>' +
          '<div class="acts" style="flex-direction:column">' +
          (s.rev ? '<button class="btn pri" data-m="pull">⬇️ Prendre cette partie</button>' : "") +
          '<button class="btn' + (s.rev ? "" : " pri") + '" data-m="push">⬆️ Déposer la partie de cet appareil</button>' +
          '<button class="btn" data-m="fresh">🆕 Nouvelle partie dans cet emplacement</button>' +
          (s.active ? "" : '<button class="btn" data-m="use">Rendre cet emplacement actif</button>') +
          (s.rev && !s.active ? '<button class="btn ghost" data-m="erase" style="color:var(--bad)">🗑️ Vider cet emplacement</button>' : "") +
          '<button class="btn" data-m="back">Retour</button></div>',
        on: {
          use: () => { Cloud.useSlot(n); swapModal(slotModal(n)); return true; },
          pull: (b) => {
            busy(b, "Téléchargement…");
            Cloud.pull(n).then((cl) => {
              if (!cl) swapModal(slotModal(n));
              else chooseVersion(cl, "Voici la partie de l’emplacement " + n + ".");
            }).catch((e) => swapModal(accountModal(e.message)));
            return true;
          },
          push: (b) => {
            if (s.rev) { swapModal(slotOverwriteModal(n, s.updated)); return true; }
            busy(b, "Envoi…");
            cloudPush({ manual: true, slot: n, force: true }).then(() => swapModal(slotModal(n)));
            return true;
          },
          fresh: () => { swapModal(newGameModal(n)); return true; },
          erase: (b) => {
            busy(b, "Suppression…");
            Cloud.erase(n).then(() => { toast("Emplacement " + n + " vidé."); swapModal(slotModal(n)); })
              .catch((e) => { unbusy(b); swapModal(accountModal(e.message)); });
            return true;
          },
          back: () => { swapModal(accountModal()); return true; }
        }
      };
    }
    /* repartir de zéro dans un emplacement : la partie de l’appareil reste dans son emplacement actuel,
     * celle qui occupait l’emplacement choisi part dans les copies de sécurité */
    function newGameModal(n) {
      const s = slotInfo(n);
      const prev = (Cloud.account() || {}).slot || 1;
      return {
        html: '<div class="kicker">Compte</div><h2>Nouvelle partie dans l’emplacement ' + n + ' ?</h2>' +
          (prev !== n ? '<p class="small">La partie de cet appareil est d’abord envoyée dans l’emplacement ' + prev + ', où tu pourras la retrouver.</p>' : "") +
          (s.rev ? '<p class="small err">La partie en ligne de l’emplacement ' + n + ' (envoyée le ' + esc(fmtDate(s.updated)) + ') sera remplacée. Elle est d’abord rangée dans les copies de sécurité de cet appareil (Menu → Sauvegardes).</p>' : "") +
          '<p class="tiny dim">L’emplacement ' + n + ' devient l’emplacement actif. Une copie de la partie de cet appareil est aussi gardée dans Menu → Sauvegardes.</p>' +
          '<div class="acts"><button class="btn" data-m="back">Annuler</button><button class="btn pri" data-m="go">Commencer</button></div>',
        on: {
          back: () => { swapModal(slotModal(n)); return true; },
          go: (b) => {
            busy(b, "Préparation…");
            (async () => {
              try {
                if (prev !== n) await cloudPush({ quiet: true, slot: prev });
                if (s.rev) {
                  const old = await Cloud.pull(n);
                  if (old) pushBackup(old.text, "Partie en ligne (emplacement " + n + ") remplacée par une nouvelle partie");
                }
                pushBackup(E.serialize(), "Avant une nouvelle partie");
                Cloud.useSlot(n);
                E.reset(); save(); U.slots = [null, null, null]; U.last = null;
                closeModal(); setTab("carte"); intro(); updateCloudBtn();
                cloudPush({ quiet: true, slot: n, force: true });
              } catch (e) { unbusy(b); swapModal(accountModal(e.message)); }
            })();
            return true;
          }
        }
      };
    }
    /* déposer sur un emplacement occupé : l’ancienne partie en ligne part dans les copies */
    function slotOverwriteModal(n, updated) {
      return {
        html: '<div class="kicker">Compte</div><h2>Remplacer l’emplacement ' + n + ' ?</h2>' +
          '<p class="small">La partie en ligne du ' + esc(fmtDate(updated)) + ' sera remplacée par celle de cet appareil.</p>' +
          '<p class="tiny dim">Celle qui est en ligne n’est pas gardée telle quelle : elle sera téléchargée avant d’être remplacée, puis rangée dans les copies de sécurité de cet appareil (Menu → Sauvegardes).</p>' +
          '<div class="acts"><button class="btn" data-m="back">Annuler</button><button class="btn pri" data-m="go">Remplacer</button></div>',
        on: {
          back: () => { swapModal(slotModal(n)); return true; },
          go: (b) => {
            busy(b, "Envoi…");
            (async () => {
              try {
                const old = await Cloud.pull(n);
                if (old) pushBackup(old.text, "Partie en ligne (emplacement " + n + ") remplacée");
                await cloudPush({ manual: true, slot: n, force: true });
                swapModal(slotModal(n));
              } catch (e) { unbusy(b); swapModal(accountModal(e.message)); }
            })();
            return true;
          }
        }
      };
    }
    function passwordModal() {
      return {
        html: '<div class="kicker">Compte</div><h2>Changer de mot de passe</h2>' +
          '<label class="fld"><span>Mot de passe actuel</span><input id="pw0" type="password" autocomplete="current-password"></label>' +
          '<label class="fld"><span>Nouveau mot de passe</span><input id="pw1" type="password" autocomplete="new-password"></label>' +
          '<label class="fld"><span>Confirme le nouveau mot de passe</span><input id="pw2" type="password" autocomplete="new-password"></label>' +
          '<p class="small err" id="pwErr"></p><p class="tiny dim">Tes parties en ligne (les trois emplacements) sont rechiffrées avec le nouveau mot de passe. Tes autres appareils devront se reconnecter.</p>' +
          '<div class="acts"><button class="btn" data-m="back">Retour</button><button class="btn pri" data-m="go">Changer</button></div>',
        on: {
          back: () => { swapModal(accountModal()); return true; },
          go: (b) => {
            const o = $("#pw0").value, n = $("#pw1").value, err = $("#pwErr");
            if (n.length < 8) { err.textContent = "Le nouveau mot de passe doit faire au moins 8 caractères."; return true; }
            if (n !== $("#pw2").value) { err.textContent = "Les deux nouveaux mots de passe ne sont pas identiques."; return true; }
            busy(b, "Chiffrement…");
            save();
            Cloud.changePassword(o, n, U.peutEcrire() ? E.serialize() : null).then(() => swapModal(accountModal("Mot de passe changé."))).catch((e) => { unbusy(b); err.textContent = e.message; });
            return true;
          }
        }
      };
    }
    function deleteModal() {
      return {
        html: '<div class="kicker">Compte</div><h2>Supprimer le compte ?</h2><p class="small">Le compte et les parties en ligne seront effacés du serveur. Ta partie reste sur cet appareil.</p>' +
          '<label class="fld"><span>Mot de passe</span><input id="dl0" type="password" autocomplete="current-password"></label><p class="small err" id="dlErr"></p>' +
          '<div class="acts"><button class="btn" data-m="back">Retour</button><button class="btn pri" style="background:var(--bad)" data-m="go">Supprimer</button></div>',
        on: {
          back: () => { swapModal(accountModal()); return true; },
          go: (b) => {
            busy(b, "Suppression…");
            Cloud.deleteAccount($("#dl0").value).then(() => { closeModal(); updateCloudBtn(); toast("Compte supprimé. Partie conservée sur cet appareil."); })
              .catch((e) => { unbusy(b); $("#dlErr").textContent = e.message; });
            return true;
          }
        }
      };
    }
    async function cloudPush(o) {
      o = o || {};
      const a = Cloud.account();
      if (!a || !a.token || U.sync.busy || U.saveLocked || !U.peutEcrire()) return null;
      U.sync.busy = true;
      try {
        save();
        // save() peut avoir découvert qu’une autre page a enregistré depuis : on n’envoie pas une partie périmée
        if (U.saveLocked || !U.peutEcrire()) return null;
        const r = await Cloud.push(E.serialize(), o);
        if (r.conflict) { U.sync.conflict = r; if (!o.quiet) toast("☁️ Une autre version de ta partie est en ligne (emplacement " + r.slot + "). Ouvre ☁️ pour choisir laquelle garder."); }
        else { U.sync.conflict = null; U.sync.err = null; if (o.manual && !U.mcur) toast("☁️ Partie envoyée."); }
        return r;
      } catch (e) {
        U.sync.err = e.message;
        if (o.manual || e.status === 401) toast("☁️ " + esc(e.message));
        return null;
      } finally {
        U.sync.busy = false;
        updateCloudBtn();
      }
    }
    function updateCloudBtn() {
      const b = $("#cloudBtn"), a = Cloud.account();
      if (!b) return;
      b.classList.toggle("hidden", !a);
      b.classList.toggle("warn", !!(a && (!a.token || U.sync.conflict)));
      b.title = !a ? "" : !a.token ? "Reconnecte-toi" : U.sync.conflict ? "Deux versions de ta partie" : "Compte : " + a.pseudo;
    }
    /* au démarrage : la partie a-t-elle avancé sur un autre appareil ? */
    async function cloudCheck() {
      const a = Cloud.account();
      updateCloudBtn();
      if (!a || !a.token || U.saveLocked || !U.peutEcrire()) return;
      try {
        const known = a.rev || 0;
        const cl = await Cloud.pull();
        if (!cl || cl.rev === known) return;
        const ask = () => { if (U.mcur) { setTimeout(ask, 1000); return; } chooseVersion(cl, "Ta partie en ligne a changé depuis ton dernier passage ici, sans doute sur un autre appareil."); };
        ask();
      } catch (e) { U.sync.err = e.message; updateCloudBtn(); }
    }
    function cloudTimers() {
      setInterval(() => {
        const a = Cloud.account();
        if (a && a.token && a.auto && !U.sync.conflict && Date.now() - (a.last || 0) > 4 * 60000) cloudPush({ quiet: true });
      }, 60000);
      document.addEventListener("visibilitychange", () => {
        const a = Cloud.account();
        if (document.hidden && a && a.token && a.auto && !U.sync.conflict && Date.now() - (a.last || 0) > 30000) cloudPush({ quiet: true, keepalive: true });
      });
    }

    function openMenu() {
      const st = S();
      const thMode = (st.settings && st.settings.theme) || "auto";
      const thLabels = { auto: "Auto", light: "Jour", dark: "Sombre" };
      const nextTh = { auto: "light", light: "dark", dark: "auto" };
      const ageName = D.AGES && D.AGES[st.age] ? D.AGES[st.age].n : "Âge du Bois";
      const echosList = E.activeEchoesFins ? E.activeEchoesFins() : Object.keys((st.meta && st.meta.endings) || {});
      const nbEchos = echosList.length;
      const hasComptoir = E.zoneOpen(D.COMPTOIR.zone);
      const styleLabels = { vivant: "Carnet", atlas: "Atlas", classique: "Classique" };
      const styleNext = { vivant: "atlas", atlas: "classique", classique: "vivant" };
      const curStyle = (typeof window !== "undefined" && window.EclatStyleMode) || "vivant";
      const isVivant = (typeof window !== "undefined" && (window.EclatStyleMode === "vivant" || (typeof document !== "undefined" && document.documentElement && document.documentElement.getAttribute("data-style-mode") === "vivant")));

      /* un réglage qui s’active ou se coupe : toujours le même interrupteur, toujours les mêmes mots */
      const sw = (k, label, on, title) => '<div class="toggle"><span id="mt-' + k + '">' + label + '</span><button class="btn small sw' + (on ? " on" : "") + '" role="switch" aria-checked="' + !!on + '" aria-labelledby="mt-' + k + '" data-m="' + k + '" title="' + esc(title) + '">' + (on ? "Activé" : "Désactivé") + "</button></div>";
      const setSw = (b, on) => { b.setAttribute("aria-checked", String(!!on)); b.classList.toggle("on", !!on); b.textContent = on ? "Activé" : "Désactivé"; };
      const sec = (id, ic, n, inner) => '<section class="menu-sec" id="msec-' + id + '"><div class="menu-sec-head"><span class="m-sec-ic">' + ic + '</span><h3 class="sub">' + n + "</h3></div>" + inner + "</section>";

      openModal({
        cls: "menu-modal",
        html: '<div class="menu-wrap">' +
          '<div class="menu-game-header">' +
            '<div class="menu-game-title">' +
              '<h2 class="m-title-text">ÉCLAT</h2>' +
              '<span class="m-version-badge">v' + esc(D.VERSION) + '</span>' +
            '</div>' +
            '<div class="menu-game-banner">' +
              '<div class="m-hero-cell"><span class="m-cell-lbl">Semeur</span><b class="m-cell-val">' + ((st.cycle || 1) + 6) + 'e</b></div>' +
              '<div class="m-hero-cell"><span class="m-cell-lbl">Âge</span><b class="m-cell-val">' + esc(ageName.replace(/^Âge du /, "").replace(/^Âge de l’/, "").replace(/^Âge de la /, "").replace(/^Âge des /, "")) + '</b></div>' +
              '<div class="m-hero-cell"><span class="m-cell-lbl">Souvenirs</span><b class="m-cell-val m-acc">✦ ' + fmt((st.meta && st.meta.traces) || 0) + '</b></div>' +
              '<div class="m-hero-cell"><span class="m-cell-lbl">Échos</span><b class="m-cell-val m-echo">🌅 ' + nbEchos + '/5</b></div>' +
            '</div>' +
          '</div>' +
          '<button class="btn pri wide resume-btn" data-m="close" title="Fermer le menu et reprendre la partie">Reprendre <span aria-hidden="true">›</span></button>' +
          '<nav class="menu-nav-bar" role="tablist" aria-label="Catégories du menu">' +
            '<button class="m-nav-tab on" data-mjump="jeu" role="tab" aria-selected="true" title="Ouvrir la rubrique Jeu"><span class="m-nav-ic">🎮</span> Jeu</button>' +
            '<button class="m-nav-tab" data-mjump="affichage" role="tab" aria-selected="false" title="Ouvrir la rubrique Affichage"><span class="m-nav-ic">🖥️</span> Affichage</button>' +
            '<button class="m-nav-tab" data-mjump="audio" role="tab" aria-selected="false" title="Ouvrir la rubrique Audio"><span class="m-nav-ic">🔊</span> Audio</button>' +
            '<button class="m-nav-tab" data-mjump="systeme" role="tab" aria-selected="false" title="Ouvrir la rubrique Système"><span class="m-nav-ic">⚙️</span> Système</button>' +
            '<button class="m-nav-tab" data-mjump="aide" role="tab" aria-selected="false" title="Ouvrir la rubrique Aide"><span class="m-nav-ic">❓</span> Aide</button>' +
          '</nav>' +
          sec("jeu", "🎮", "Jeu &amp; Raccourcis",
            '<div class="menu-grid game-grid">' +
              '<button class="btn m-card-btn m-card-mem" data-m="mem" title="Ce que tes Souvenirs t’offrent d’une partie à l’autre"><span class="m-card-icon">✦</span><span class="m-card-main"><b>Mémoire des mains</b><span class="tiny muted">' + ((st.meta && st.meta.traces) || 0) + ' Souvenirs disponibles</span></span></button>' +
              (hasComptoir ? '<button class="btn m-card-btn m-card-comp" data-m="comptoir" title="Vendre, acheter et répondre aux demandes du Troqueur"><span class="m-card-icon">🪙</span><span class="m-card-main"><b>Le Comptoir</b><span class="tiny muted">Troc &amp; commandes</span></span></button>' : "") +
            "</div>" +
            '<div class="toggle"><span id="mt-tuto">Guide des Semeurs <span class="tiny muted">' + Tuto.doneCount() + "/" + Tuto.chapters().length + ' vus</span></span><span class="row"><button class="btn small ghost" data-m="tutoAgain" title="Revoir les explications du guide depuis le début">Revoir</button>' +
            '<button class="btn small sw' + (Tuto.enabled() ? " on" : "") + '" role="switch" aria-checked="' + Tuto.enabled() + '" aria-labelledby="mt-tuto" data-m="tuto" title="Afficher ou masquer les explications du guide">' + (Tuto.enabled() ? "Activé" : "Désactivé") + "</button></span></div>" +
            sw("visiteurs", "Visiteurs de passage", E.visiteurActif(), "Laisser quelqu’un traverser le Domaine de temps en temps")) +
          sec("affichage", "🖥️", "Affichage &amp; Écran",
            (isVivant ? "" : '<div class="toggle"><span id="mt-theme">Thème</span><button class="btn small m-theme-btn" data-m="theme" aria-labelledby="mt-theme" title="Changer de thème : clair, sombre ou celui de ton appareil">' + thLabels[thMode] + "</button></div>") +
            (typeof window !== "undefined" && window.EclatSetStyleMode ? '<div class="toggle"><span id="mt-style">Style d’affichage</span><button class="btn small m-theme-btn" data-m="styleMode" aria-labelledby="mt-style" title="Carnet est le style du jeu. Atlas et Classique restent disponibles pour revenir à un ancien aspect si quelque chose s’affiche mal.">' + styleLabels[curStyle] + "</button></div>" : "") +
            sw("largeText", "Grand texte", st.settings.largeText, "Agrandir les textes de tout le jeu") +
            sw("barreBas", "Barre du bas masquée", st.settings.barreBas === "masquee", "La barre de navigation se range et ne laisse qu’une poignée ; elle vient quand on approche la souris du bas de l’écran ou qu’on touche la poignée. Désactivée (par défaut) : elle reste toujours visible.") +
            sw("compact", "Affichage compact", U.compact(), "Resserrer les Terres et le Carnet pour voir plus de choses d’un coup") +
            sw("carnet2", "Carnet sur deux colonnes", !st.settings.carnet1Col, "Afficher les recettes du Carnet sur deux colonnes (à partir de 360 px de large)") +
            sw("ambiance", "Ligne d’ambiance", st.settings.ambiance !== false, "Afficher une petite phrase sous l’en-tête qui change selon l’âge, le lieu et l’heure") +
            (App.ecranPossible() ? sw("ecran", "Garder l’écran allumé", st.settings.ecranAllume, "Empêcher la mise en veille de l’écran tant que le jeu est ouvert") : "")) +
          sec("audio", "🔊", "Audio &amp; Vibrations",
            sw("sound", "Son", st.settings.sound, "Couper ou remettre la musique et les bruitages") +
            '<div id="volGroup" class="vol-group' + (st.settings.sound ? "" : " hidden") + '">' +
            [["music", "Musique", "🎵"], ["amb", "Ambiance", "🍃"], ["sfx", "Bruitages", "🔨"]].map(([k, n, ic]) => {
              const v = Math.round(volumes()[k] * 100);
              return '<label class="toggle vol"><span class="vol-name"><span class="vol-ic">' + ic + '</span> ' + n + '</span><div class="vol-ctrl"><input type="range" min="0" max="100" step="5" value="' + v + '" data-vol="' + k + '"><span class="vol-val" id="vv-' + k + '">' + v + '%</span></div></label>';
            }).join("") +
            "</div>" +
            sw("vibe", "Vibrations", st.settings.vibe, "Faire vibrer l’appareil lors des actions importantes")) +
          sec("systeme", "⚙️", "Système &amp; Parties",
            '<div class="menu-grid">' +
              '<button class="btn m-card-btn" data-m="modeTest" title="Créer une copie locale pour tester librement la progression"><span class="m-card-icon">✎</span><b>Mode test</b></button>' +
              '<button class="btn m-card-btn" data-m="saves" title="Télécharger ta partie, la recharger ou restaurer une copie"><span class="m-card-icon">💾</span><b>Sauvegardes</b></button>' +
              '<button class="btn m-card-btn" data-m="account" title="Retrouver ta partie sur tous tes appareils"><span class="m-card-icon">'+COMPTE+'</span><b>Compte en ligne</b></button>' +
              (App.installable() ? '<button class="btn m-card-btn" data-m="installer" title="Ajouter Éclat à l’écran d’accueil de ton appareil"><span class="m-card-icon">📲</span><b>Installer le jeu</b></button>' : "") +
              (checkUpdate ? '<button class="btn m-card-btn" data-m="maj" title="Chercher tout de suite une nouvelle version du jeu"><span class="m-card-icon">🔄</span><span class="m-card-main"><b>Chercher une mise à jour</b><span class="tiny muted" id="maj-etat">Version ' + esc(D.VERSION) + '</span></span></button>' : "") +
            "</div>" +
            '<div class="menu-danger-zone"><button class="btn ghost danger-btn" data-m="reset" style="color:var(--bad)" title="Effacer ta progression et repartir de zéro">🗑️ Recommencer la partie</button></div>') +
          sec("aide", "❓", "Aide &amp; À propos",
            '<div class="menu-grid">' +
              '<button class="btn m-card-btn" data-assistance="diagnostic" title="Comprendre pourquoi une commande ou un ouvrier attend"><span class="m-card-icon">⏳</span><b>État des productions</b></button>' +
              '<button class="btn m-card-btn" data-assistance="report" title="Préparer un rapport local à transmettre avec ton retour"><span class="m-card-icon">🐞</span><b>Signaler un problème</b></button>' +
              '<button class="btn m-card-btn" data-m="help" title="Les mots du jeu et le rôle de chaque écran"><span class="m-card-icon">❓</span><b>Comment jouer</b></button>' +
              '<button class="btn m-card-btn" data-m="news" title="Ce qui a changé dans cette version"><span class="m-card-icon">📰</span><b>Nouveautés</b></button>' +
              '<button class="btn m-card-btn" data-m="credits" title="Les icônes, les polices et la musique"><span class="m-card-icon">📜</span><b>Crédits</b></button>' +
            "</div>") +
          '<div class="acts"><button class="btn pri m-close-btn" data-m="close" title="Fermer le menu et revenir au jeu">Fermer</button></div>' +
          '<p class="tiny dim center menu-footer">Éclat · du silex aux étoiles · version ' + esc(D.VERSION) + " · ⏱️ " + fmtTime(st.stats.play) + "</p>" +
        '</div>',
        onOpen: (box) => {
          /* Les rubriques sont de vrais onglets : une seule est affichée, la dernière ouverte est retenue pendant la session. */
          const navTabs = $$(".m-nav-tab", box), sections = $$(".menu-sec", box);
          const montrer = (id) => {
            if (!sections.some((x) => x.id === "msec-" + id)) id = "jeu";
            U.menuOnglet = id;
            sections.forEach((x) => { const on = x.id === "msec-" + id; x.hidden = !on; x.setAttribute("role", "tabpanel"); });
            navTabs.forEach((x) => { const on = x.dataset.mjump === id; x.classList.toggle("on", on); x.setAttribute("aria-selected", String(on)); x.tabIndex = on ? 0 : -1; });
            const bw = box.querySelector(".modal-box") || box; bw.scrollTop = 0;
          };
          navTabs.forEach((tabBtn) => {
            tabBtn.addEventListener("click", () => { montrer(tabBtn.dataset.mjump); A.init(); A.click(); });
            tabBtn.addEventListener("keydown", (e) => {
              let idx = navTabs.indexOf(tabBtn);
              if (e.key === "ArrowRight") idx = (idx + 1) % navTabs.length;
              else if (e.key === "ArrowLeft") idx = (idx + navTabs.length - 1) % navTabs.length;
              else if (e.key === "Home") idx = 0;
              else if (e.key === "End") idx = navTabs.length - 1;
              else return;
              e.preventDefault();
              navTabs[idx].focus();
              navTabs[idx].click();
            });
          });
          montrer(U.menuOnglet || "jeu");
          $$("[data-vol]", box).forEach((r) => {
            const k = r.dataset.vol;
            const valEl = box.querySelector("#vv-" + k);
            r.addEventListener("input", () => {
              const val = Number(r.value);
              if (valEl) valEl.textContent = val + "%";
              st.settings.vol = Object.assign(volumes(), { [k]: val / 100 });
              A.init(); A.setVolumes(st.settings.vol);
              if (k === "sfx") A.click();
            });
            r.addEventListener("change", save);
          });
        },
        on: {
          theme: (b) => {
            st.settings.theme = nextTh[st.settings.theme || "auto"];
            applyTheme();
            b.textContent = thLabels[st.settings.theme];
            save();
            return true;
          },
          styleMode: (b) => {
            const cur = window.EclatStyleMode || "vivant";
            window.EclatSetStyleMode(styleNext[cur] || "vivant");
            b.textContent = styleLabels[window.EclatStyleMode] || "Carnet";
            return true;
          },
          largeText: (b) => {
            st.settings.largeText = !st.settings.largeText;
            applyLargeText();
            setSw(b, st.settings.largeText);
            save();
            return true;
          },
          barreBas: (b) => { st.settings.barreBas = st.settings.barreBas === "masquee" ? "visible" : "masquee"; setSw(b, st.settings.barreBas === "masquee"); save(); if (U.appliquerBarre) U.appliquerBarre(); U.dirty = true; return true; },
          compact: (b) => { U.setCompact(!U.compact()); setSw(b, U.compact()); save(); U.dirty = true; return true; },
          carnet2: (b) => { st.settings.carnet1Col = !st.settings.carnet1Col; setSw(b, !st.settings.carnet1Col); save(); U.dirty = true; return true; },
          ambiance: (b) => { st.settings.ambiance = st.settings.ambiance === false ? true : false; setSw(b, st.settings.ambiance); save(); if (U.Ambiance) U.Ambiance.update(true); return true; },
          ecran: (b) => { st.settings.ecranAllume = !st.settings.ecranAllume; setSw(b, st.settings.ecranAllume); App.ecranAllume(); save(); return true; },
          installer: () => { App.installer(); },
          sound: (b) => {
            st.settings.sound = !st.settings.sound;
            A.init(); A.setEnabled(st.settings.sound);
            setSw(b, st.settings.sound);
            const vg = $("#volGroup");
            if (vg) vg.classList.toggle("hidden", !st.settings.sound);
            save();
            return true;
          },
          vibe: (b) => { st.settings.vibe = !st.settings.vibe; setSw(b, st.settings.vibe); save(); return true; },
          visiteurs: (b) => { E.setVisiteurs(!E.visiteurActif()); if (!E.visiteurActif()) visiteurFin(); setSw(b, E.visiteurActif()); save(); return true; },
          tuto: (b) => { Tuto.setEnabled(!Tuto.enabled()); setSw(b, Tuto.enabled()); return true; },
          tutoAgain: () => { Tuto.restart(); toast("💭 Guide réactivé. Les chapitres reviennent au fil de ta progression."); },
          modeTest: () => setTimeout(api.openTestMode, 80),
          saves: () => setTimeout(openSaves, 80),
          credits: () => setTimeout(() => simpleModal("Éclat", "Crédits",
            '<div class="small"><p><b>Icônes</b> : <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a>, par Lorc, Delapouite et leurs contributeurs, sous licence CC BY 3.0. Recolorées, dessin inchangé.</p>' +
            "<p><b>Polices</b> (licence SIL OFL 1.1) : Alegreya Sans, IM Fell English, Cinzel, Playfair Display, Special Elite, Caveat, Space Grotesk, IBM Plex Mono.</p>" +
            "<p>Musique et bruitages synthétisés dans le jeu.</p></div>", "Fermer"), 80),
          account: () => { openAccount(); return true; },
          help: () => setTimeout(openHelp, 80),
          mem: () => setTimeout(openMemoire, 80),
          comptoir: () => setTimeout(() => Dom.comptoirSheet(), 80),
          maj: (b) => {
            if (b.disabled) return true;
            const etat = b.querySelector("#maj-etat"), dit = (t) => { if (etat) etat.textContent = t; };
            b.disabled = true; dit("Recherche en cours…");
            (async () => {
              let r = "indisponible";
              try { r = await checkUpdate(); } catch (_) { /* on garde « indisponible » */ }
              b.disabled = false;
              if (r === "prete") { dit("Nouvelle version prête"); closeModal(); toast("✨ Nouvelle version prête : touche « Mettre à jour » en haut."); }
              else if (r === "a-jour") { dit("Éclat est à jour · version " + D.VERSION); toast("Éclat est à jour."); }
              else if (r === "hors-ligne") { dit("Pas de connexion : réessaie plus tard"); toast("Impossible de vérifier : pas de connexion."); }
              else { dit("Mise à jour manuelle indisponible ici"); toast("Cette page ne peut pas chercher de mise à jour (hors ligne ou installation non prise en charge)."); }
            })();
            return true; // la fenêtre reste ouverte pendant la recherche
          },
          news: () => setTimeout(() => simpleModal("Version " + esc(D.VERSION), "Nouveautés", '<ul class="news">' + D.CHANGES.map((c) => "<li>" + esc(c) + "</li>").join("") + "</ul>"), 80),
          reset: () => setTimeout(() => {
            openModal({ html: '<h2>Recommencer la partie ?</h2><p>Toute ta progression, tes secrets et tes fins seront effacés. Une copie de sécurité est gardée dans Menu → Sauvegardes.</p><div class="acts"><button class="btn" data-m="close">Annuler</button><button class="btn pri" style="background:var(--bad)" data-m="go">Tout effacer</button></div>',
              on: { go: () => { pushBackup(E.serialize(), "Avant de recommencer la partie"); if (window.EclatAssistance?.clearSessionLog) window.EclatAssistance.clearSessionLog(); E.reset(); save(); U.slots = [null, null, null]; U.last = null; setTab("carte"); intro(); } } });
          }, 80)
        }
      });
    }

    function openHelp() {
      simpleModal("Aide", "Comment jouer",
        '<div class="small">' +
        "<p><b>En bref.</b> Tu récoltes des ressources dans les Terres, tu découvres des recettes au Labo, puis tu produis à l’Atelier : des extracteurs, des machines et des travailleurs fabriquent pour toi. L’<b>objectif</b>, en haut des Terres, indique ta prochaine étape.</p>" +
        '<h3 class="sub">Les mots du jeu</h3><dl class="lexique">' +
        "<dt>Réserve</dt><dd>Tout ce que tu possèdes. Ce que tu récoltes ou fabriques y arrive, et chaque fabrication y prend ses ressources.</dd>" +
        "<dt>Terre, gisement</dt><dd>Une terre est un lieu du monde (la Lisière, la Plaine…). Chaque terre a ses gisements : un gisement est une ressource à récolter.</dd>" +
        "<dt>Récolter</dt><dd>Toucher l’icône d’un gisement (garder le doigt dessus pour continuer), ou toucher ▶ pour récolter en continu. Un appui rapporte parfois le double : un coup de chance.</dd>" +
        "<dt>Geste, recette</dt><dd>Une recette associe un geste (Tailler, Tresser…) à une à trois ressources. Tu les découvres au Labo, par essais. Chaque métier y a ses outils et ses mots pour les gestes.</dd>" +
        "<dt>Pièce</dt><dd>Un objet fabriqué qui sert à en fabriquer d’autres (manche, corde…).</dd>" +
        "<dt>Outil, amélioration</dt><dd>Ils agissent dès que tu les as : récolte plus forte, terre nouvelle, extracteurs plus rapides. Rien à poser.</dd>" +
        "<dt>Station</dt><dd>Feu, four, enclume, creuset… Elle reste au Labo et ouvre un geste, ou une chaleur plus forte. Quand une recette en demande une, le jeu la nomme.</dd>" +
        "<dt>Extracteur</dt><dd>Un bâtiment par ressource : le Bûcheron pour le bois, le Carrier pour la pierre, le Tanneur pour la peau… Il se pose sur un gisement de sa ressource (bouton « + cabane » sur le bois) et récolte seul, même quand le jeu est fermé. Il monte de niveau avec les âges : « Améliorer » remplace un exemplaire par le niveau d’après.</dd>" +
        "<dt>Machine</dt><dd>Automate, presse… Elle reste à l’Atelier et accélère tes commandes de pièces (une fois la pièce fabriquée à la main). Un automate de bois fait les recettes à 1 ingrédient, un automate de bronze jusqu’à 2, une presse ou un réacteur jusqu’à 3.</dd>" +
        "<dt>Métier</dt><dd>Chaque recette appartient à un métier : Artisanat, Élevage, Métallurgie, Chimie, Centrales, Électronique, Arts et lettres, Construction. Au Labo, un métier ne montre que ses outils, ses gestes et les ressources de ses recettes. À l’Atelier, il montre ce qu’il fabrique et qui s’en charge.</dd>" +
        "<dt>Travailleurs</dt><dd>Des apprentis, puis des ouvriers, que tu embauches en écus dans un métier (forgeron, éleveur, lettré…). Ils aident tes commandes et fabriquent seuls les pièces que le métier connaît, jusqu’au <b>seuil</b> que tu règles (au repos, au jour le jour, quelques réserves, bien garni, à ras bord), pourvu que tu les aies déjà faites une fois à la main. Ils te parlent quand ils manquent de ressource. Les bâtisseurs de la Construction exécutent les chantiers que tu lances.</dd>" +
        "<dt>Goulot</dt><dd>Ce qui empêche tes travailleurs d’avancer. L’Atelier remonte à la vraie cause (pas d’extracteur, personne dans le métier qui fabrique la pièce, énergie qui manque…) et propose un bouton qui la règle.</dd>" +
        "<dt>Énergie</dt><dd>Tes machines et tes travailleurs au travail consomment des chevaux. Quand tu en produis moins qu’ils n’en demandent, ils ralentissent, jusqu’à moitié vitesse. Les sources à flamme ou à atome (chaudière, centrale, fission, fusion) brûlent un combustible de ta Réserve : sans lui, elles s’arrêtent. Les machines s’usent aussi à force de travailler : une panne se répare contre quelques écus.</dd>" +
        "<dt>Commande</dt><dd>Ce que tu lances depuis le Carnet (×1, ×10, ×50, ×100, ×1 000, Max). Les ressources sont prises au fur et à mesure dans la Réserve, et les pièces manquantes sont ajoutées avant la pièce demandée.</dd>" +
        "<dt>Tes mains</dt><dd>Tout ce que tu fabriques passe par tes commandes (barre ✋ au-dessus des onglets). Tes machines et tes travailleurs t’y aident.</dd>" +
        "<dt>Passage</dt><dd>Pour entrer dans une nouvelle terre : il faut l’objet qui y mène, puis apporter ce que le passage demande.</dd>" +
        "<dt>Intuition ✨</dt><dd>Se gagne en découvrant. Sert à étudier une ressource (pour savoir avec quels gestes elle cache des recettes) et à déchiffrer une recette inconnue étape par étape.</dd>" +
        "<dt>Déchiffrer</dt><dd>Révéler une recette inconnue contre de l’Intuition : d’abord le geste, puis une des ressources, puis la recette entière.</dd>" +
        "<dt>Souvenirs ✦, relève</dt><dd>Chaque passage franchi laisse des Souvenirs. La relève recommence le monde en gardant tes recettes. Les Souvenirs servent à acheter des améliorations dans la Mémoire des mains.</dd>" +
        "<dt>Ruine</dt><dd>Ce qu’un Semeur a construit attend le suivant. Une ruine se répare sur place pour une fraction de son coût d’origine, sans repasser par l’Atelier.</dd>" +
        "<dt>Comptoir, écus</dt><dd>Marché tenu par le Troqueur dans la Plaine. On y vend ce qui encombre la Réserve contre des écus, et on y achète des ressources. Les écus servent aussi à embaucher. Les écus restants deviennent des Souvenirs à la relève.</dd>" +
        "<dt>Demande du Troqueur</dt><dd>Le Troqueur demande des objets fabriqués contre des Souvenirs. Livrer prend les objets dans la Réserve et donne les Souvenirs tout de suite. Les demandes se renouvellent régulièrement.</dd>" +
        "<dt>Âge, étapes</dt><dd>Le jeu avance d’âge en âge. 🏁 montre les étapes de l’âge en cours.</dd>" +
        "<dt>Signe</dt><dd>Un mot de l’écriture des Anciens. Tant que tu ne l’as pas compris, il reste dessiné. Touche-le pour proposer ce qu’il veut dire.</dd>" +
        "<dt>Grand Œuvre</dt><dd>Un chantier immense qui mène à une fin du jeu. Tu y verses des ressources de la Réserve, ou tu l’alimentes pour qu’il s’y serve seul.</dd></dl>" +
        '<h3 class="sub">Les écrans</h3>' +
        "<p><b>Terres.</b> Tes terres et leurs gisements, l’objectif, les passages et le Grand Œuvre. Des pastilles en haut ouvrent le Comptoir et la production. L’<b>Atlas</b> montre le monde, avec de la brume sur les terres que tu n’as pas encore atteintes : touche un lieu 🧭 pour l’explorer, chaque lieu raconte un morceau de l’histoire.</p>" +
        "<p><b>Labo.</b> Choisis un métier, un outil, un geste, pose jusqu’à trois ressources et lance le geste. Si l’essai échoue, le <b>thermomètre</b> indique si tu approches d’une recette ; ✦ marque une piste. « Étudier » (Intuition) montre les ressources qui cachent encore une recette.</p>" +
        "<p><b>Atelier.</b> <b>Produire</b> : tes métiers, leurs travailleurs, leur seuil, les goulots et l’énergie. <b>Carnet</b> : tes recettes ; <b>Fabriquer, ×10, ×50, ×100, ×1 000, Max</b> lancent des commandes et fabriquent aussi les pièces qui manquent, <b>🎯 Suivre</b> montre ce qui manque en haut des Terres. <b>Machines</b> : elles aident tes mains sur les commandes.</p>" +
        "<p><b>Progression.</b> Le <b>Chemin</b> (ce qui est fait, ce qui reste), les <b>Secrets</b>, tes <b>Gestes</b> et leurs niveaux, les <b>Fins</b> et la <b>Mémoire</b> (tes totaux). Sa dernière page, le <b>Cosmos</b>, s’ouvre plus tard.</p>" +
        "<p><b>Journal.</b> Fragments d’histoire, secrets, mélodies.</p>" +
        "<p><b>Niveaux.</b> Chaque geste, et la récolte, monte jusqu’au niveau 99 quand tu fabriques ou récoltes toi-même : 1 % plus rapide par niveau, et une chance d’avoir une pièce en plus aux niveaux 10, 25, 50, 75 et 99.</p>" +
        "<p><b>Jeu fermé.</b> Les extracteurs, les commandes, tes travailleurs et l’exploration continuent pendant 12 h au plus. À ton retour, ils te disent ce qu’ils ont fait.</p>" +
        "<p><b>Clavier et bouton Retour.</b> Sur ordinateur, Échap ferme la fenêtre ouverte. Sur téléphone, Retour ferme la fenêtre ouverte, puis ramène aux Terres ; une deuxième fois, il quitte le jeu.</p>" +
        "<p><b>Sauvegardes.</b> Dans le Menu : télécharge ta partie dans un fichier pour la garder à l’abri ou changer d’appareil.</p></div>", "Compris");
    }

    function promptCapsuleText() {
      const current = E.getCapsuleText ? E.getCapsuleText() : "";
      const html = '<div class="kicker">Capsule temporelle</div>' +
        '<h2>Ce que tu veux dire à celui qui viendra</h2>' +
        '<p class="small muted">Tu peux graver un message de 140 signes au plus pour le Semeur qui prendra la suite.</p>' +
        '<form id="capsuleForm" class="capsule-form">' +
        '<div class="fld">' +
        '<textarea id="capsuleInput" class="input" maxlength="140" rows="3" placeholder="Garde courage…">' + esc(current) + '</textarea>' +
        '<div class="tiny dim right" id="capsuleCharCount" style="margin-top:4px">' + (140 - current.length) + ' signes restants</div>' +
        '</div>' +
        '<div class="acts" style="margin-top:12px">' +
        '<button type="submit" class="btn pri">Graver</button>' +
        '<button type="button" class="btn" data-m="close">Passer</button>' +
        '</div>' +
        '</form>';
      openModal({
        html,
        onOpen: (box) => {
          const form = box.querySelector("#capsuleForm");
          const input = box.querySelector("#capsuleInput");
          const counter = box.querySelector("#capsuleCharCount");
          if (input) {
            setTimeout(() => { try { input.focus(); } catch (e) {} }, 100);
            input.addEventListener("input", () => {
              const rem = 140 - input.value.length;
              if (counter) counter.textContent = rem + " signes restants";
            });
          }
          if (form) {
            form.addEventListener("submit", (ev) => {
              ev.preventDefault();
              const val = input ? input.value.trim() : "";
              if (E.setCapsuleText) E.setCapsuleText(val);
              closeModal();
              toast("⏳ Ton message est scellé dans la capsule.");
            });
          }
        }
      });
    }

    return { openMenu, openAccount, openSaves, downloadSave, showBadSave, showNews, cloudTimers, cloudCheck, promptCapsuleText };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { create };
  if (typeof window !== "undefined") window.EclatCompte = { create };
})();
