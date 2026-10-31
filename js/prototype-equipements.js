/* Interface d'essai autonome. Ne jamais utiliser la clé eclat.save.v1 ici. */
(function () {
  "use strict";
  const D = window.EclatEquipements.createData(window.ECLAT_DATA);
  const Engine = window.EclatEngine.withData(D), KEY = "eclat.prototype.equipements.v1";
  let E = Engine.createEngine(), eq = "mains", mode = "assembler", slots = [], signature = "", saveOK = true;
  let place = "etabli", prepared = null;
  let previousEconomy = null;
  const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
  const consumed = new Set(Object.values(D.ITEMS).filter(it=>it.r).flatMap(it=>Object.keys(it.r[1])));
  const $ = s => document.querySelector(s), name = id => D.ITEMS[id]?.n || id;
  const actionName = (equipment, id, fallback) => ({doux:"Chauffer doucement",vif:"Cuire",etouffee:"Carboniser",cuisson:"Cuire",fonte:"Fondre"})[id] || fallback;
  const seconds = n => n.toLocaleString("fr-FR",{maximumFractionDigits:2})+" s";
  const money=n=>n.toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})+" écus";
  const text = (tag, value, cls) => { const e = document.createElement(tag); e.textContent = value; if (cls) e.className = cls; return e; };
  function button(label, fn, cls, disabled) { const e=text("button",label,cls);e.type="button";e.disabled=!!disabled;e.onclick=fn;return e; }
  function notice(value) { $("#notice").textContent=value; }
  function pulse(selector){if(!reducedMotion.matches)$(selector).animate([{opacity:.65},{opacity:1}],{duration:320});}
  function filterInventory(){const clean=x=>x.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();const query=clean($("#resource-search").value.trim());let n=0;document.querySelectorAll("#inventory .resource").forEach(e=>{e.hidden=!clean(e.dataset.name).includes(query);if(!e.hidden)n++;});$("#empty-stock").hidden=n>0;}
  $("#resource-search").oninput=filterInventory;
  function neededSale(amount){if(amount<=1e-9)return 0;let low=0,high=1;while(E.merchantQuote(high).net<amount&&high<1e7)high*=2;while(low<high){const mid=Math.floor((low+high)/2);if(E.merchantQuote(mid).net+1e-9>=amount)high=mid;else low=mid+1;}return low;}
  function save() {
    if(!saveOK)return;
    try { localStorage.setItem(KEY,JSON.stringify({save:E.serialize(),eq,mode,slots,place,prepared})); }
    catch (_) { saveOK=false;notice("La partie d’essai ne peut pas être enregistrée sur cet appareil."); }
  }
  try {
    const stored=JSON.parse(localStorage.getItem(KEY)||"null");
    if(stored){E.load(stored.save);eq=stored.eq;mode=stored.mode;slots=Array.isArray(stored.slots)?stored.slots.filter(id=>D.ITEMS[id]).slice(0,3):[];place=stored.place||E.workplaceFor(eq);prepared=E.state.known[stored.prepared]?stored.prepared:null;}
  } catch (_) {saveOK=false;notice("La partie d’essai enregistrée est illisible. Elle reste conservée ; tu peux démarrer un nouvel essai.");}
  function reset(demo) {
    if(!confirm("Remplacer uniquement cette partie d’essai ?"))return;
    E=Engine.createEngine();eq="mains";mode="assembler";slots=[];place="etabli";prepared=null;saveOK=true;previousEconomy=null;$("#resource-search").value="";$("#sale-feedback").textContent="Les recettes du marchand apparaîtront ici.";
    if(demo==="chain"){
      const s=E.state;s.age=2;s.introSeen=true;s.flags.economyTrial=true;
      for(const z of ["plaine","riviere"]){s.zones[z]=true;s.pass[z]={done:true,paid:{}};}
      for(const id of ["manche","corde","eclat","laniere","racloir_os","couteau","etabli_amenage"])E.learn(id,true);
      for(const[id,n]of Object.entries({bois:30,fibre:20,corde:3,caillou:20,os:15,cuir:60,silex:10}))E.add(id,n);
      eq="percuteur_pierre";mode="tailler";slots=["os","caillou"];E.recalc();
    }else if(demo){
      const s=E.state;s.age=3;s.cycle=2;s.flags.extDone=true;s.flags.lineDone=true;s.introSeen=true;
      for(const z of ["plaine","riviere","collines"]){s.zones[z]=true;s.pass[z]={done:true,paid:{}};}
      for(const[id,it]of Object.entries(D.ITEMS))if(it.a<=3){if(it.r)E.learn(id,true);E.add(id,["res","comp"].includes(it.t)?100:1);if(it.r)s.made[id]=1;}
      E.recalc();
    }
    signature="";notice(demo?"Exemple au Cuivre chargé.":"Nouvelle partie d’essai.");draw(true);save();
  }
  $("#fresh").onclick=()=>reset(false);$("#demo").onclick=()=>reset(true);
  $("#chain-demo").onclick=()=>reset("chain");
  $("#build-post").onclick=()=>{E.learn("etabli_amenage",true);const r=E.order("etabli_amenage",1);notice(r.ok?"L’établi est en cours d’aménagement.":"L’aménagement attend des matériaux ou une place dans les commandes.");draw(true);save();};
  $("#hire-worker").onclick=()=>{const r=E.workerHire();notice(r.ok?"Un ouvrier rejoint ton établi.":r.why==="ecus"?"Vends quelques lanières pour financer l’embauche.":"Aménage d’abord l’établi et prépare un outil de découpe.");draw(true);save();};
  $("#fund-worker").onclick=()=>{notice(E.workerFund(1).ok?"Un écu mis de côté pour les salaires.":"Il te faut un ouvrier et un écu disponible.");draw(true);save();};
  $("#toggle-worker").onclick=()=>{E.workerSet(!E.atelierEconomyInfo().working);draw(true);save();};
  $("#withdraw-worker").onclick=()=>{E.workerWithdraw();draw(true);save();};
  const configureMerchant=()=>{E.merchantConfigure($("#merchant-on").checked,$("#merchant-reserve").value);draw(true);save();};
  $("#merchant-on").onchange=configureMerchant;$("#merchant-reserve").onchange=configureMerchant;
  $("#sell-surplus").onclick=()=>{const r=E.merchantSell(E.count("laniere"));notice(r.ok?"Vendu : "+r.n+" lanières · "+money(r.net)+" après taxe.":"Aucun surplus au-dessus de ta réserve.");draw(true);save();};
  function select(id,nextMode) {
    const item=E.equipmentList().find(x=>x.id===id&&x.ready);if(!item)return;
    eq=id;mode=Object.hasOwn(item.modes,nextMode)?nextMode:Object.keys(item.modes)[0];
    place=E.workplaceFor(eq);prepared=null;
    notice("");
    draw(true);save();
  }
  function prepare(id) {
    if(!E.state.known[id]||!D.CRAFT_EQUIPMENT.recipes[id])return;
    const choices=E.equipmentChoices(id),choice=choices.find(x=>x.ready);
    if(!choice){const b=E.equipmentCheck(id);notice("Il te faut d’abord : "+name(b.required)+".");return;}
    eq=choice.equipment;mode=choice.mode;place=E.workplaceFor(eq);prepared=id;
    slots=Object.keys(D.ITEMS[id].r[1]);notice("Prêt à fabriquer : "+name(id)+".");draw(true);save();
  }
  function finish(result) {
    if(result.equipment&&result.mode){eq=result.equipment;mode=result.mode;}
    if(result.kind==="equipment")notice(result.why==="missing"?"Il te faut : "+(E.equipmentList().find(x=>x.id===result.equipment)?.n||"un équipement adapté")+".":"Ces ressources ne donnent rien ici avec ce geste. Essaie un autre outil ou d’autres ressources.");
    else if(result.kind==="empty")notice("Pose des ressources sur l’établi.");
    else if(result.kind==="craft")notice("Fabriqué : "+name(result.id)+"."+(D.CRAFT_EQUIPMENT.equipment[result.id]?.benefit?" "+D.CRAFT_EQUIPMENT.equipment[result.id].benefit+".":""));
    else if(result.kind==="queued")notice("En cours : "+name(result.id)+".");
    else if(result.kind==="learn")notice("Recette trouvée : "+name(result.id)+(result.missing?". Il manque : "+Object.entries(result.missing).map(([k,n])=>n+" "+name(k)).join(", ")+".":". Tu peux la commander ci-dessous."));
    else if(result.kind==="owned")notice("Tu possèdes déjà cet objet.");
    else if(result.kind==="blocked")notice("Recette trouvée : "+name(result.id)+". Prépare d’abord "+name(E.blockStation(result.id,result.info))+".");
    else notice("Cette fabrication ne peut pas encore être lancée.");
    draw(true);save();
    if(result.fresh&&(result.kind==="craft"||result.kind==="learn"))pulse("#notice");
  }
  function perform(nextMode) { if(nextMode!==mode)prepared=null;mode=nextMode;finish(E.attemptWith(eq,mode,slots)); }
  $("#forge").onclick=()=>perform(mode);
  $("#batch").onclick=()=>{
    const id=E.equipmentRecipe(eq,mode,slots);if(id!=="laniere"||!E.state.known[id])return;
    const times=E.equipmentList().find(x=>x.id===eq)?.batch||1,r=E.queue(id,times,false,undefined,{equipment:eq,mode});
    notice(r.ok?"Découpe lancée : "+(D.ITEMS[id].r[2]*times)+" lanières avec "+name(eq)+".":r.why==="qty"?"Pas assez de ressources pour cette série.":"Impossible de lancer cette découpe pour le moment.");draw(true);save();
  };
  function draw(force) {
    const available=E.equipmentList(),ready=available.filter(x=>x.ready);
    const workplaces=E.workplaceList().filter(x=>x.ready);
    if(!workplaces.some(x=>x.id===place))place="etabli";
    const tools=ready.filter(x=>E.workplaceFor(x.id)===place);
    if(!tools.some(x=>x.id===eq)){eq=tools[0].id;mode=Object.keys(tools[0].modes)[0];prepared=null;}
    const selected=ready.find(x=>x.id===eq);if(!Object.hasOwn(selected.modes,mode))mode=Object.keys(selected.modes)[0];
    const s=E.state,info=E.handInfo();
    const economy=E.atelierEconomyInfo();
    const structural=[economy.hired,economy.produced>0,s.ecus>=economy.hire,E.count("etabli_amenage")>=1,place,prepared,eq,mode,slots.join(),s.age,Object.keys(s.seen).join(),Object.keys(s.known).join(),ready.map(x=>x.id).join(),info.jobs.map(j=>j.id).join(),JSON.stringify(s.zones),JSON.stringify(s.pass),s.exp.active?.z,s.exp.done&&JSON.stringify(s.exp.done)].join("|");
    if(force||structural!==signature){
      signature=structural;
      $("#workplaces").replaceChildren(...workplaces.map(x=>{const b=button(x.n,()=>{place=x.id;prepared=null;draw(true);save();},x.id===place?"on":"");b.dataset.workplace=x.id;b.setAttribute("aria-pressed",String(x.id===place));return b;}));
      $("#equipment-title").textContent=workplaces.find(x=>x.id===place)?.n||"Établi";
      $("#bench-card").classList.toggle("warm-post",place==="feu"||place==="four");
      const goal=E.guide(),id=goal?.step;
      const hint=id&&id!==goal?.ob?.id?D.ITEMS[id].h:null;
      const end=id&&D.ITEMS[id].a>3;
      $("#goal").replaceChildren(text("b",end?"Atelier au Cuivre":id?name(id):D.AGES[s.age].n),text("p",end?"Le prototype s’arrête au Cuivre. Tu peux explorer les recettes et les équipements de ces quatre âges.":hint||goal?.ob?.txt||"Explore les possibilités de ton atelier."));
      if(s.flags.economyTrial){
        const step=E.count("racloir_os")<1?["Un premier outil","Os + pierre, au percuteur : taille ton racloir."]:E.count("etabli_amenage")<1?["Un poste pour travailler","Aménage l’établi avec le bouton ci-dessous."]:!economy.hired?["Financer l’embauche","Coupe des lanières au racloir. Vends le surplus pour payer l’embauche puis une avance de salaire. Ajuste la réserve du marchand."]:E.count("couteau")<1?["Améliorer l’outillage","Avance un écu et mets l’ouvrier au travail. Fabrique ensuite le couteau depuis les recettes connues : il accélérera aussi sa découpe."]:["L’atelier travaille","Active le marchand, choisis ta réserve et surveille l’avance. Récolte des peaux pour alimenter la production."];
        $("#goal").replaceChildren(text("b",step[0]),text("p",step[1]));
      }
      const toolNames={feu:"Braises du foyer",four:"Chambre de cuisson",enclume_pierre:"Enclume et percuteur",polissoir:"Dalle de polissage"};
      $("#tool-title").textContent=place==="etabli"?"Tes outils":"Au poste";
      $("#tools").replaceChildren(...tools.map(x=>{const b=button(toolNames[x.id]||x.n,()=>select(x.id),x.id===eq?"on":"");b.append(text("small",Object.values(x.modes).map((n,i)=>actionName(x.id,Object.keys(x.modes)[i],n)).join(" · ")));if(x.benefit)b.append(text("small",x.benefit));b.dataset.equipment=x.id;b.setAttribute("aria-pressed",String(x.id===eq));return b;}));
      $("#modes").replaceChildren(...Object.entries(selected.modes).filter(([id])=>id!==mode).map(([id,n])=>{const b=button(actionName(eq,id,n),()=>perform(id),"wide",!slots.length);b.dataset.mode=id;return b;}));
      $("#slots").replaceChildren(...[0,1,2].map(i=>{const id=slots[i],b=button("",()=>{slots.splice(i,1);prepared=null;draw(true);save();},id?"filled-slot":"empty-slot",!id);if(id){b.append(text("span",D.ITEMS[id].ic||"","item-icon"),text("span",name(id)));const stock=text("small","","slot-stock");stock.dataset.slotItem=id;stock.dataset.need=prepared?(D.ITEMS[prepared].r[1][id]||0):0;b.append(stock);}else b.textContent="+";b.setAttribute("aria-label",id?"Retirer : "+name(id):"Emplacement libre");return b;}));
      $("#forge").textContent=actionName(eq,mode,selected.modes[mode]);
      $("#forge").dataset.mode=mode;
      $("#forge").disabled=!slots.length;$("#forge").title=slots.length?"":"Pose une ressource pour travailler.";
      $("#recipe-preview").textContent=prepared?"Recette préparée : "+name(prepared):"";
      const raw=[...new Set(D.ZONES.filter(z=>E.zoneOpen(z.id)).flatMap(z=>z.res))];
      const items=Object.keys(D.ITEMS).filter(id=>(!E.isEquipmentItem(id)||consumed.has(id))&&(raw.includes(id)||s.seen[id]||E.count(id)>0));
      $("#inventory").replaceChildren(...items.map(id=>{
        const box=text("div","","resource"),b=button("",()=>{if(slots.includes(id)){slots.splice(slots.indexOf(id),1);}else if(slots.length<3&&E.count(id)>=1){slots.push(id);}else return;prepared=null;draw(true);save();pulse("#slots");},"wide",E.count(id)<1&&!slots.includes(id));b.dataset.item=id;box.dataset.name=name(id);b.append(text("span",D.ITEMS[id].ic||"","item-icon"),text("span",name(id)));
        const count=text("b","0");count.dataset.count=id;b.append(count);const state=text("small","","resource-state");state.dataset.resourceState=id;box.append(b,state);
        if(raw.includes(id))box.append(button(s.act?.res===id?"Arrêter":"Récolter",()=>{if(E.state.act?.res===id)E.stopAct();else E.startAct({k:"harv",z:E.RES_ZONE[id],res:id});draw(true);save();},"harvest"+(s.act?.res===id?" is-harvesting":"")));
        if(D.ITEMS[id].t==="ext"&&E.count(id)>0)box.append(button("Installer",()=>{notice(E.domAutoExt(id)?"Exploitation installée.":"Aucun emplacement disponible.");draw(true);save();}));
        return box;
      }));
      filterInventory();
      const known=Object.keys(s.known).filter(id=>D.ITEMS[id]?.r&&D.ITEMS[id].a<=3);
      $("#recipes").replaceChildren(...known.map(id=>{const row=text("div","","row");row.append(button(name(id),()=>prepare(id)),button("Commander",()=>{const r=E.order(id,1);notice(r.ok?"Commande lancée : "+name(id)+".":"Prépare d’abord les équipements ou les recettes intermédiaires.");draw(true);save();}));return row;}));
      if(!known.length)$("#recipes").append(text("p","Tes découvertes apparaîtront ici.","muted"));
      const world=[];
      for(const z of D.ZONES.filter(z=>E.zoneOpen(z.id))){const next=E.nextExp(z.id);if(next){const b=button("Explorer · "+next.x.n,()=>{const r=E.startExp(z.id);notice(r.ok?"Exploration lancée.":"Cette exploration attend encore des préparatifs.");draw(true);save();},"",!!s.exp.active);world.push(b);}}
      for(const z of E.passPending()){const p=E.passInfo(z),box=text("div",p.P.n+" · "+Object.entries(p.left).map(([id,n])=>Math.ceil(n)+" "+name(id)).join(", "));box.append(button("Déposer",()=>{const r=E.passPour(z);notice(r.done?"Nouvelle terre ouverte.":r.why==="lieux"?"Explore d’abord les lieux de la terre précédente.":"Ressources déposées.");draw(true);save();}));world.push(box);}
      $("#world").replaceChildren(...world);
    }
    const recipe=E.equipmentRecipe(eq,mode,slots),cutting=recipe==="laniere"&&s.known.laniere;
    $("#batch").hidden=!cutting;$("#tool-benefit").hidden=!cutting;
    if(cutting){
      const times=selected.batch||1,selection={equipment:eq,mode},time=E.batchTime(recipe,times,selection);
      $("#batch").textContent="Couper ×"+times;
      const baseline=E.batchTime(recipe,times,{equipment:"racloir_os",mode:"couper"});
      $("#tool-benefit").textContent=(D.ITEMS[recipe].r[2]*times)+" lanières · "+seconds(time)+" avec "+name(eq)+(eq==="couteau"?" · 2× plus vite qu’au racloir.":E.count("couteau")>=1?" · Le couteau les coupe en "+seconds(baseline/2)+".":".");
    }
    const eco=E.atelierEconomyInfo();$("#economy-card").hidden=!s.known.laniere;
    $("#economy-wallet").textContent=money(s.ecus);
    $("#build-post").hidden=E.count("etabli_amenage")>=1;
    $("#hire-worker").hidden=eco.hired;$("#hire-worker").textContent="Embaucher · "+money(eco.hire);
    for(const id of ["fund-worker","toggle-worker","withdraw-worker"])$("#"+id).hidden=!eco.hired;
    $("#withdraw-worker").disabled=eco.working||eco.budget<=0;
    $("#toggle-worker").textContent=eco.working?"Mettre en pause":"Mettre au travail";
    $("#worker-info").textContent=eco.status+(eco.hired?" · "+name(eco.tool||"aucun"):"");
    $("#worker-progress").hidden=!eco.hired;$("#worker-progress").value=eco.progress;
    $("#worker-cadence").textContent=eco.hired?(eco.status==="Découpe des lanières"?"Prochaine fabrication dans "+seconds(Math.max(0,(1-eco.progress)*eco.duration))+" · ":"")+eco.produced+" lanières produites":"Découpe des lanières avec ton outillage.";
    $("#worker-pay").textContent="Salaire : "+money(eco.wage)+" par fabrication · Avance restante : "+money(eco.budget);
    const missing=Math.max(0,eco.hire+1-s.ecus);
    $("#hire-goal").hidden=eco.hired;$("#hire-goal").textContent=missing>1e-9?"Encore "+money(missing)+" pour embaucher et avancer 1 écu · "+neededSale(missing)+" lanières à vendre, hors réserve.":"Tu peux financer l’embauche et une avance de 1 écu.";
    $("#merchant-on").checked=eco.merchant;if(document.activeElement!==$("#merchant-reserve"))$("#merchant-reserve").value=eco.reserve;
    $("#merchant-tariff").textContent="Par minute : 10 % sur les "+eco.quota+" premières lanières, puis 20 %, 30 %, 40 % par tranche de "+eco.quota+", et 50 % au-delà. Seuil lié à la capacité de production, fixé pour la minute. Prochaine vente : tranche à "+eco.nextRate+" %. Remise à zéro dans "+Math.ceil(eco.period-eco.clock)+" s.";
    $("#merchant-info").textContent=eco.totalSold+" vendues · Brut : "+money(eco.gross)+" · Taxes : "+money(eco.tax)+" · Net : "+money(eco.net)+" · Salaires versés : "+money(eco.wages);
    $("#merchant-progress").value=eco.merchant?eco.saleClock:0;
    const surplus=Math.max(0,Math.floor(E.count("laniere")-eco.reserve)),quote=E.merchantQuote(surplus);
    $("#merchant-countdown").textContent=eco.merchant?"Prochain passage dans "+seconds(5-eco.saleClock)+(surplus?"":" · Aucun surplus"):"Ventes automatiques en pause";
    $("#sale-quote").textContent=surplus?surplus+" lanières → "+money(quote.net)+" nets":"Ta réserve est préservée";
    $("#sell-surplus").disabled=!surplus;$("#sell-surplus").title=surplus?"":"Aucun surplus au-dessus de la réserve.";
    $("#sale-breakdown").textContent=surplus?"Cette vente : "+money(quote.gross)+" brut − "+money(quote.tax)+" de taxe ("+Math.round(quote.tax/quote.gross*100)+" % effectifs).":"Baisse la réserve ou produis davantage pour vendre.";
    $("#sale-margin").textContent="Prochaine fabrication vendue : "+money(E.merchantQuote(D.ITEMS.laniere.r[2]).net-eco.wage)+" après salaire, hors coût des peaux.";
    $("#tax-current").textContent="Tranche actuelle : "+eco.nextRate+" % · "+eco.sold+" lanières vendues cette minute.";
    $("#tax-bands").replaceChildren(...[10,20,30,40,50].map((rate,i)=>{const li=text("li",rate+" %",rate===eco.nextRate?"active":"");if(rate===eco.nextRate)li.setAttribute("aria-current","step");li.append(text("small",i===4?"> "+4*eco.quota:(i*eco.quota+1)+"–"+((i+1)*eco.quota)));return li;}));
    $("#tax-period").value=eco.clock;
    if(previousEconomy&&eco.totalSold>previousEconomy.sold){$("#sale-feedback").textContent="Dernière vente : +"+money(eco.net-previousEconomy.net)+" · "+(eco.totalSold-previousEconomy.sold)+" lanières";pulse("#economy-wallet");}
    if(previousEconomy&&eco.produced>previousEconomy.produced)pulse("#worker-progress");
    previousEconomy={sold:eco.totalSold,net:eco.net,produced:eco.produced};
    document.querySelectorAll("[data-count]").forEach(e=>{const id=e.dataset.count,picked=slots.includes(id),n=E.count(id),full=slots.length>=3&&!picked;e.textContent=Math.floor(n).toLocaleString("fr-FR");e.parentElement.disabled=!picked&&(n<1||full);e.parentElement.setAttribute("aria-pressed",String(picked));e.closest(".resource").classList.toggle("is-selected",picked);const label=e.closest(".resource").querySelector(".resource-state");label.textContent=picked?"Posé · clic pour retirer":n<1?"En réserve : 0":full?"Établi plein":"Prêt à poser";e.parentElement.title=label.textContent;});
    document.querySelectorAll("[data-slot-item]").forEach(e=>{const n=Math.floor(E.count(e.dataset.slotItem)),need=Number(e.dataset.need);e.textContent=need?(n<need?"Il manque "+(need-n):"Prêt")+" · "+n+" / "+need:"En réserve : "+n;});
    $("#job-card").hidden=!info.jobs.length;
    $("#jobs").replaceChildren(...info.jobs.map((j,i)=>{const selected=E.state.hand.q[i].equipmentSelection;const box=text("div",name(j.id)+" · "+(j.wait?"En attente":"En cours · "+seconds(j.left))+(selected?" · "+name(selected.equipment):""),"job"),p=document.createElement("progress");p.max=1;p.value=j.frac;p.setAttribute("aria-label","Avancement de "+name(j.id));box.append(p,button("Annuler",()=>{E.cancelJob(i);draw(true);save();}));return box;}));
  }
  draw(true);setInterval(()=>{E.update();draw(false);},250);setInterval(save,5000);
  window.addEventListener("pagehide",save);
  // Exposé uniquement pour les vérifications du prototype, jamais dans la page normale.
  window.__eclatEquipmentPrototype={get E(){return E;},D,prepare,draw:()=>draw(true)};
})();
