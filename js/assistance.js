/* Aides aux testeurs : lecture des blocages, reprise et rapport local.
 * Ne change ni les recettes, ni les prix, ni l'ordonnancement de la production. */
(function(root){
  "use strict";
  const cap=(s,n=4000)=>String(s||"").slice(0,n);
  const known=(E,id)=>!!(E.D.ITEMS[id]&&(E.state.known[id]||E.state.seen[id]||E.state.made[id]));
  const name=(E,id)=>known(E,id)?E.D.ITEMS[id].n:"un élément encore inconnu";
  function goal(E){
    if(E.state.track?.id&&known(E,E.state.track.id))return {label:name(E,E.state.track.id),id:E.state.track.id};
    const g=E.guide?.(),o=g&&g.ob;
    return o?{label:cap(o.k==="craft"?E.D.ITEMS[o.id]?.n:o.n||o.txt,300),id:o.k==="craft"&&known(E,o.id)?o.id:null}:null;
  }
  function diagnostics(E){
    const hi=E.handInfo(),s=E.state;
    const jobs=hi.jobs.map((j,index)=>{
      const raw=s.hand.q[index],step=j.step||j.id;
      const base={index,id:j.id,label:name(E,j.id),step,state:"active",text:"Fabrication en cours.",action:{kind:"hands",label:"Voir les commandes"}};
      if(j.hand||Object.keys(j.machs||{}).length)return base;
      if(j.paused||raw.paused)return {...base,state:"paused",text:"Cette commande est en pause."};
      const it=E.D.ITEMS[step],b=it?.r&&E.blocker(step);
      if(b&&b.why!=="owned"&&b.why!=="equipment"){
        const station=E.blockStation(step,b);
        return {...base,state:"station",text:b.why==="heat"?"La chaleur disponible est insuffisante pour cette étape.":"Une station ou un geste requis manque pour cette étape.",action:station&&known(E,station)?{kind:"item",id:station,label:"Voir "+name(E,station)}:{kind:"tab",id:"atelier",label:"Voir l’Atelier"}};
      }
      const eq=E.equipmentJobCheck&&E.equipmentJobCheck(step,raw,id=>E.count(id)+(raw.b?.[id]||0));
      if(eq)return {...base,state:"equipment",text:"Un outil requis n’est plus disponible.",action:known(E,eq.required)?{kind:"item",id:eq.required,label:"Voir "+name(E,eq.required)}:{kind:"tab",id:"labo",label:"Voir les outils"}};
      const miss=Object.keys(j.miss||{}).filter(id=>j.miss[id]>1e-9);
      // Une ressource de l'étape en cours passe avant les besoins futurs de la chaîne.
      miss.sort((a,b)=>Number(!!it?.r?.[1][b])-Number(!!it?.r?.[1][a]));
      if(miss.length){
        const id=miss[0],n=Math.ceil(j.miss[id]),l=E.limiting(id,n);
        if(l.raw){
          const e=l.z&&E.domExt(l.z,id);
          return {...base,state:"resource",resource:id,missing:n,rate:l.rate,eta:l.eta,
            text:!l.open?"Une ressource nécessaire vient d’une terre encore fermée.":e?.on===false?"L’extraction de "+name(E,id)+" est en pause.":l.rate>0?"La commande attend "+name(E,id)+" ; l’extraction continue.":"Aucune extraction active de "+name(E,id)+" n’alimente cette commande.",
            action:l.open?{kind:"zone",id:l.z,label:"Voir le gisement"}:{kind:"tab",id:"carte",label:"Voir la carte"}};
        }
        return {...base,state:"component",resource:id,missing:n,text:"Il manque une pièce : "+name(E,id)+".",action:known(E,id)?{kind:"item",id,label:"Voir la pièce"}:{kind:"tab",id:"labo",label:"Chercher la recette"}};
      }
      const earlier=hi.jobs.slice(0,index).some(x=>x.hand||Object.keys(x.machs||{}).length);
      return {...base,state:earlier?"queue":"preparation",text:earlier?"Les mains ou les machines travaillent sur une commande précédente.":"Les pièces de cette commande sont encore en préparation."};
    });
    let worker=null;
    if(E.atelierEconomyInfo){
      const w=E.atelierEconomyInfo();
      if(w.hired){
        const text=w.status;
        const blocked=text!=="Découpe des lanières";
        worker={state:!w.working?"paused":E.count("etabli_amenage")<1?"post":!w.tool?"equipment":w.budget+1e-9<w.wage?"wage":E.missingFor("laniere",1)?"resource":"active",text,blocked,action:{kind:"worker",label:"Voir l’ouvrier"}};
      }
    }
    return {jobs,worker,blocked:jobs.filter(j=>j.state!=="active").length+(worker?.blocked?1:0)};
  }
  function snapshot(E){
    const w=E.atelierEconomyInfo?.();
    return {goal:goal(E),jobs:E.state.hand.q.map(ref=>({ref,id:ref.id,n:ref.s[ref.s.length-1][1]})),worker:w?{produced:w.produced,status:w.status}:null};
  }
  function resume(E,before){
    const completed=before.jobs.filter(j=>!E.state.hand.q.includes(j.ref)&&(j.ref.done?.[j.ref.done.length-1]||0)>=j.n).map(j=>({id:j.id,n:j.n,label:name(E,j.id)}));
    const d=diagnostics(E),w=E.atelierEconomyInfo?.();
    return {previousGoal:before.goal,currentGoal:goal(E),completed,ongoing:d.jobs.filter(j=>j.state==="active"),waiting:d.jobs.filter(j=>j.state!=="active"),worker:d.worker,workerProduced:w&&before.worker?Math.max(0,w.produced-before.worker.produced):0};
  }
  // L'export d'une sauvegarde est volontaire ; les données de compte ne sont jamais collectées.
  function clean(value){
    if(Array.isArray(value))return value.map(clean);
    if(!value||typeof value!=="object")return value;
    const out={};
    for(const [k,v]of Object.entries(value))if(!/token|password|motdepasse|authorization|cookie|credential|session|email|pseudo|account|cloud/i.test(k))out[k]=clean(v);
    return out;
  }
  const SESSION_KEY = "eclat.session.log";
  function getSessionLog() {
    try {
      if (typeof localStorage === "undefined") return [];
      const raw = localStorage.getItem(SESSION_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }
  function logSession(type, detail = {}) {
    try {
      if (typeof localStorage === "undefined") return;
      const list = getSessionLog();
      list.push({ date: new Date().toISOString(), type, ...detail });
      if (list.length > 200) list.splice(0, list.length - 200);
      localStorage.setItem(SESSION_KEY, JSON.stringify(list));
    } catch (_) {}
  }
  function clearSessionLog() {
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(SESSION_KEY);
    } catch (_) {}
  }
  let sessionFailed = false;
  function logSessionFail(detail = {}) {
    if (sessionFailed) return;
    sessionFailed = true;
    logSession("premier échec", detail);
  }

  function report(E,context,form,actions,build,journalSession){
    const observed=cap(form.observed).trim();
    if(!observed)throw new Error("Décris ce qui s’est passé avant de préparer le rapport.");
    const s=E.state;
    const r={format:"eclat-rapport-v1",date:new Date().toISOString(),jeu:{version:E.D.VERSION,build:build||null,profil:E.D.CRAFT_EQUIPMENT?"atelier-equipe":"classique",age:E.D.AGES[s.age]?.n,cycle:s.cycle,style:context.style||null,terre:E.ZONES[context.zone]?.n||null,ecran:cap(context.tab,40),geste:cap(context.geste,40),affichage:{largeur:context.width||null,hauteur:context.height||null},navigateur:cap(context.browser,300)},attendu:cap(form.expected),observe:observed,etapes:cap(form.steps),diagnostic:diagnostics(E),actionsRecentes:actions.slice(-20),journalSession:(journalSession||getSessionLog()).slice(-200)};
    if(form.includeSave)r.sauvegarde=clean(JSON.parse(E.serialize()));
    return r;
  }
  function create(api){
    const {E,D,U,esc,fmt,fmtTime,openModal,closeModal,setTab,goto,Dom,openHands,openGoals}=api;
    const recent=[];let draft={expected:"",observed:"",steps:"",includeSave:false},before=null;
    logSession("ouverture", {
      style: typeof window !== "undefined" && window.EclatStyleMode ? window.EclatStyleMode : "vivant",
      largeur: typeof innerWidth !== "undefined" ? innerWidth : null,
      hauteur: typeof innerHeight !== "undefined" ? innerHeight : null,
      age: E.D.AGES[E.state.age]?.n || null,
      version: E.D.VERSION
    });
    let hasMade = Object.values(E.state.made || {}).some(v => v > 0);
    E.on("crafted", (v) => {
      if (!hasMade) {
        hasMade = true;
        const id = typeof v === "string" ? v : v?.job?.id || v?.id;
        logSession("premier objet", { objet: id ? (D.ITEMS[id]?.n || id) : null });
      }
    });
    const add=(type,id)=>{recent.push({date:new Date().toISOString(),type,cycle:E.state.cycle,...(D.ITEMS[id]&&known(E,id)?{objet:D.ITEMS[id].n}:E.ZONES[id]&&E.zoneOpen(id)?{terre:E.ZONES[id].n}:{})});if(recent.length>20)recent.shift();};
    for(const evt of ["crafted","learn","zone","cycle","hand"])E.on(evt,(v)=>add(evt+(v?.kind?':'+cap(v.kind,20):''),typeof v==="string"?v:v?.job?.id));
    const catchUp=E.catchUp;
    E.catchUp=function(dt){const prior=before;before=snapshot(E);try{return catchUp.call(E,dt);}finally{before=prior;}};
    E.on("offline",o=>{if(before)o.resume=resume(E,before);});
    function actionHTML(a){return a?'<button type="button" class="btn small" data-assistance="action" data-kind="'+esc(a.kind)+'" data-id="'+esc(a.id||"")+'" title="'+esc(a.label)+'">'+esc(a.label)+'</button>':"";}
    function line(j){
      let text=esc(j.text);
      if(j.missing)text+=' Il manque '+fmt(j.missing)+' '+esc(name(E,j.resource))+'.';
      if(j.rate>0)text+=' '+fmt(j.rate*60)+'/min · environ '+fmtTime(j.eta)+' pour réunir ce manque, hors autres consommations.';
      return '<li><b>'+esc(j.label||"Ouvrier")+'</b><p class="small">'+text+'</p>'+actionHTML(j.action)+'</li>';
    }
    function diagnosticsHTML(){const d=diagnostics(E);return '<div class="kicker">Productions</div><h2>Qu’est-ce qui attend ?</h2><p class="small muted">L’état actuel de tes commandes et de ton ouvrier.</p><ul class="assistance-list">'+d.jobs.map(line).join("")+(d.worker?line({...d.worker,label:"Ouvrier"}):"")+'</ul>'+(!d.jobs.length&&!d.worker?'<p>Aucune production en attente. Tu peux reprendre ton objectif.</p>'+actionHTML({kind:"goal",label:"Reprendre l’objectif"}):"")+'<div class="acts"><button class="btn" data-assistance="report" title="Préparer un rapport de problème">Signaler un problème</button><button class="btn pri" data-m="close">Fermer</button></div>';}
    function openDiagnostic(){openModal({html:diagnosticsHTML(),refresh:diagnosticsHTML});}
    function resumeHTML(r){
      if(!r)return "";
      let h='<section class="assistance-reprise"><h3>Reprendre le fil</h3>';
      if(r.completed.length)h+='<p class="small"><b>Commandes terminées :</b> '+r.completed.slice(0,8).map(j=>esc(j.label)+' · '+fmt(j.n)+' fabrication'+(j.n>1?'s':'')).join(', ')+'.</p>';
      if(r.workerProduced)h+='<p class="small">Ton ouvrier a produit '+fmt(r.workerProduced)+' lanières.</p>';
      if(r.ongoing.length)h+='<p class="small">'+r.ongoing.length+' commande'+(r.ongoing.length>1?'s continuent':' continue')+' de progresser.</p>';
      if(r.waiting.length||r.worker?.blocked)h+='<ul class="assistance-list">'+r.waiting.slice(0,2).map(line).join('')+(r.worker?.blocked?line({...r.worker,label:"Ouvrier"}):'')+'</ul>'+actionHTML({kind:"diagnostic",label:"Voir toutes les productions"});
      if(r.previousGoal?.label)h+='<p class="small"><b>Avant ton départ :</b> '+esc(r.previousGoal.label)+'.</p>';
      if(r.currentGoal?.label)h+='<p class="small"><b>Objectif à reprendre :</b> '+esc(r.currentGoal.label)+'.</p>';
      return h+'</section>';
    }
    function readForm(box){draft={expected:box.querySelector('#report-expected')?.value||'',observed:box.querySelector('#report-observed')?.value||'',steps:box.querySelector('#report-steps')?.value||'',includeSave:box.querySelector('#report-save')?.checked===true};return draft;}
    function reportHTML(){return '<div class="kicker">Retour de test</div><h2>Signaler un problème</h2><p class="small">Télécharge un rapport à transmettre avec ton retour. Rien n’est envoyé automatiquement.</p><label class="assistance-field">Ce que tu attendais<textarea id="report-expected" maxlength="4000" rows="2">'+esc(draft.expected)+'</textarea></label><label class="assistance-field">Ce qui s’est passé <span class="tiny">(requis)</span><textarea id="report-observed" maxlength="4000" rows="3" required>'+esc(draft.observed)+'</textarea></label><label class="assistance-field">Comment le reproduire<textarea id="report-steps" maxlength="4000" rows="2">'+esc(draft.steps)+'</textarea></label><label class="assistance-check"><input type="checkbox" id="report-save"'+(draft.includeSave?' checked':'')+'> Joindre ma sauvegarde (progression et notes)</label><p class="tiny muted">Le rapport contient la version du jeu, l’âge, le style, la largeur d’écran, les blocages, le journal de session (au plus 200 événements locaux : ouvertures, premier objet, premier échec, onglets, fenêtres, départs et retours) et les dernières actions. Les identifiants de compte ne sont pas inclus.</p><p id="report-status" class="small" role="status"></p><div class="acts"><button class="btn pri" data-assistance="download" title="Télécharger le rapport de problème">Télécharger le rapport</button><button class="btn" data-assistance="copy" title="Copier le rapport dans le presse-papiers">Copier</button><button class="btn" data-m="close">Fermer</button></div>';}
    function openReport(){openModal({html:reportHTML(),onOpen:box=>{box.addEventListener('input',()=>readForm(box));box.addEventListener('change',()=>readForm(box));}});}
    async function build(){
      let controller;try{controller=navigator.serviceWorker?.controller;}catch(e){return null;}if(!controller||typeof MessageChannel==='undefined')return null;
      return new Promise(resolve=>{const channel=new MessageChannel(),done=v=>{clearTimeout(timer);channel.port1.close();resolve(v);},timer=setTimeout(()=>done(null),800);channel.port1.onmessage=e=>done(typeof e.data?.build==='string'?cap(e.data.build,40):null);try{controller.postMessage({type:'ECLAT_BUILD'},[channel.port2]);}catch(e){done(null);}});
    }
    async function exportReport(copy,button){
      const box=document.querySelector('#modal .modal-box'),status=box?.querySelector('#report-status');if(!box||!status)return;
      readForm(box);if(!draft.observed.trim()){status.textContent='Décris ce qui s’est passé.';box.querySelector('#report-observed').focus();return;}
      button.disabled=true;status.textContent='Préparation du rapport…';
      try{
        const data=report(E,{zone:U.zone,tab:U.tab,geste:U.geste,width:innerWidth,height:innerHeight,style:window.EclatStyleMode||"vivant",browser:navigator.userAgent},draft,recent,await build(),getSessionLog()),text=JSON.stringify(data,null,2);
        if(copy){await navigator.clipboard.writeText(text);status.textContent='Rapport copié. Tu peux le transmettre avec ton retour.';}
        else{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='eclat-rapport-'+Date.now()+'.json';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},1000);status.textContent='Rapport téléchargé. Tu peux le transmettre avec ton retour.';}
      }catch(e){status.textContent=copy?'Copie impossible ici. Tu peux télécharger le rapport.':'Le rapport n’a pas pu être préparé. Tes réponses restent dans cette fenêtre.';}finally{button.disabled=false;}
    }
    function act(a){
      closeModal();
      setTimeout(()=>{
        if(a.kind==='diagnostic')openDiagnostic();
        else if(a.kind==='hands')openHands();
        else if(a.kind==='goal')openGoals();
        else if(a.kind==='item'&&known(E,a.id))goto(a.id);
        else if(a.kind==='zone'&&E.zoneOpen(a.id)){setTab('domaine');Dom.focusZone(a.id);}
        else if(a.kind==='worker'){U.equipmentLegacy=false;setTab('labo');setTimeout(()=>document.getElementById('ae-worker-status')?.scrollIntoView({block:'center'}),80);}
        else if(a.kind==='tab'&&['atelier','labo','domaine','carte'].includes(a.id))setTab(a.id==='carte'?'carte':a.id);
      },80);
    }
    document.addEventListener('click',e=>{const b=e.target.closest('[data-assistance]');if(!b||b.disabled)return;
      const k=b.dataset.assistance;
      if(k==='action')act({kind:b.dataset.kind,id:b.dataset.id});
      else if(k==='report'||k==='diagnostic'){if(U.mcur)closeModal();setTimeout(k==='report'?openReport:openDiagnostic,80);}
      else if(k==='download'||k==='copy')exportReport(k==='copy',b);
    });
    function refresh(){
      const host=document.getElementById('hands');if(!host||U.tab!=='atelier')return;
      const visible=E.state.hand.q.length>0||E.atelierEconomyInfo?.().hired;
      let el=host.querySelector('[data-assistance-launcher]');
      if(!visible){el?.remove();return;}
      if(!el){el=document.createElement('div');el.className='assistance-launcher';el.dataset.assistanceLauncher='';el.innerHTML='<button class="btn small" data-assistance="diagnostic" title="Comprendre les attentes de tes productions">État des productions</button>';host.appendChild(el);}
    }
    return {refresh,resumeHTML,openReport,openDiagnostic};
  }
  const API={diagnostics,snapshot,resume,report,clean,create,getSessionLog,logSession,clearSessionLog,logSessionFail};root.EclatAssistance=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
