/* L’atelier par postes dans le jeu : même moteur, stock, terres et Carnet. */
(function(){
  "use strict";
  function create(api){
    const {E,D,U,A,esc,icon,render,save,toast,fmtTime}=api,I=D.ITEMS;
    let signature="",message="",lastHeat=null,lastSale=null,observedState=null;
    const currencyName=age=>{
      const a=age!==undefined?age:(E.state?.age||0);
      if(a<=1)return "rations de troc";
      if(a<=3)return "coquillages";
      if(a<=6)return "écus";
      if(a<=8)return "florins";
      return "crédits";
    };
    const money=(n,age)=>n.toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})+" "+currencyName(age);
    const name=id=>I[id]?.n||id;
    const label=(id,n,metier)=>((D.GESTES_METIER||{})[metier]||{})[id]||(D.GESTES[id]&&D.GESTES[id].n)||n; // le geste dans le langage du métier ouvert (0.56)
    const soundGesture=m=>({
      doux:"chauffer",vif:"chauffer",cuisson:"chauffer",fonte:"chauffer",chauffe:"chauffer",etouffee:"chauffer",
      decoupe:"tailler",tailler:"tailler",racler:"tailler",
      assembler:"assembler",construire:"assembler",tisser:"tresser",tresser:"tresser",
      marteler:"marteler",frappe:"marteler",battre:"marteler",
      polir:"usiner",tremper:"tremper",allier:"allier",
      distiller:"chauffer",electriser:"electriser",synthetiser:"synthetiser"
    })[m]||"assembler";
    const root=()=>document.getElementById("atelier-equipe");
    const button=(action,value,title,cls="",disabled=false)=>{
      const cur=currencyName();
      const help={
        study:"Étudier les ressources déjà vues en dépensant l’Intuition indiquée",
        place:"Choisir cette station",
        legacy:"Utiliser les procédés des âges après le Cuivre",
        slot:"Poser ou retirer une ressource dans cet emplacement",
        prepare:"Préparer les ressources, la station et l’outil pour : "+name(value),
        order:"Fabriquer : "+name(value)+", en préparant les pièces manquantes",
        order_missing:"Façonner les pièces manquantes depuis la réserve",
        clear:"Retirer toutes les ressources de l’établi et les remettre en réserve",
        cadence:"Garder 100 "+name(value)+" en réserve avec les machines au repos",
        cadence_toggle:"Mettre en pause ou réactiver la consigne pour : "+name(value),
        cadence_cap:"Ajuster la réserve visée par les machines (25, 50, 100, 250, 500)",
        cadence_del:"Retirer la consigne de réserve pour : "+name(value),
      };
      const explanation=help[action]||title.replace(/<[^>]*>/g,"");
      return '<button type="button" id="ae-'+action+'-'+esc(value||"0")+'" class="btn '+cls+'" data-ae="'+action+'" data-value="'+esc(value||"")+'" title="'+esc(explanation)+'"'+(disabled?' disabled':'')+'>'+title+'</button>';
    };
    const consumed=new Set(Object.values(I).filter(x=>x.r).flatMap(x=>Object.keys(x.r[1])));
    /* Les métiers (0.42) : l'établi s'organise par branche de métier, les mêmes que les ateliers de l'Atelier.
     * Un métier a ses outils (ceux qui servent à ses recettes) et ses gestes (ceux de ses recettes). */
    const isGrand=eq=>typeof eq==="string"&&eq.indexOf("ga_")===0;
    /* « outil/geste » → les métiers dont une recette l'emploie (calculé une fois) */
    let paires=null,pairesAge=-1;
    function pairesDesOutils(){
      /* seulement les recettes à portée de l'âge (un métier ne se dévoile pas avant son heure) */
      if(!paires||pairesAge!==E.state.age){pairesAge=E.state.age;paires={};const R=D.CRAFT_EQUIPMENT.recipes;for(const rid in R){if(!E.ageOK(rid))continue;R[rid].forEach(c=>{const k=c.equipment+"/"+c.mode;(paires[k]=paires[k]||new Set()).add(E.atelierDe(rid));});}}
      return paires;
    }
    /* Ce qu'il reste à découvrir, par métier et par outil/geste (mémorisé : ça parcourt toutes les recettes). */
    let restes=null,restesCle="";
    function resteADecouvrir(){
      const s=E.state,cle=s.age+"|"+Object.keys(s.known).length;
      if(restes&&restesCle===cle)return restes;
      restesCle=cle;restes={paires:{},grands:{}};
      const R=D.CRAFT_EQUIPMENT.recipes;
      for(const rid in R){
        if(s.known[rid]||!E.ageOK(rid))continue;
        const f=E.atelierDe(rid);
        R[rid].forEach(c=>{restes.paires[f+"|"+c.equipment+"/"+c.mode]=true;});
      }
      for(const id in I){
        if(I[id].r&&!I[id].sec&&!I[id].path&&!R[id]&&!s.known[id]&&E.ageOK(id))restes.grands[E.atelierDe(id)+"|"+I[id].r[0]]=true;
      }
      return restes;
    }
    function gestesDuMetier(f,filtrer){
      const R=resteADecouvrir();
      return (D.GESTE_ORDER||Object.keys(D.GESTES)).filter(g=>E.gesteOK(g)&&Object.keys(I).some(id=>I[id].r&&!I[id].sec&&!I[id].path&&!D.CRAFT_EQUIPMENT.recipes[id]&&I[id].r[0]===g&&E.atelierDe(id)===f&&E.ageOK(id))&&(!filtrer||R.grands[f+"|"+g]));
    }
    /* l'atelier du métier : un outil dont les gestes sont ceux des recettes du métier (à partir du Cuivre) */
    function atelierDuMetier(f,filtrer){
      const gestes=gestesDuMetier(f,filtrer);
      if(!gestes.length)return null;
      const modes={};gestes.forEach(g=>{modes[g]=D.GESTES[g].n;});
      return {id:"ga_"+f,n:"Atelier",geste:gestes[0],ready:true,modes};
    }
    /* filtrer : ne garder que les outils et gestes qui ont encore une recette à découvrir.
     * garde : l'outil et le geste d'une recette préparée depuis le Carnet restent, même épuisés, pour la fabriquer. */
    function outilsBruts(f,filtrer,garde){
      const P=pairesDesOutils(),R=resteADecouvrir(),out=[];
      E.equipmentList().filter(x=>x.ready).forEach(x=>{
        const modes={};
        for(const m in x.modes){
          if(!(P[x.id+"/"+m]&&P[x.id+"/"+m].has(f)))continue;
          if(filtrer&&!R.paires[f+"|"+x.id+"/"+m]&&!(garde&&garde.metier===f&&garde.eq===x.id&&garde.mode===m))continue;
          modes[m]=x.modes[m];
        }
        if(Object.keys(modes).length)out.push(Object.assign({},x,{modes}));
      });
      const haut={};
      out.forEach(t=>{if(t.family&&t.tier&&(!haut[t.family]||t.tier>haut[t.family]))haut[t.family]=t.tier;});
      const gardes=out.filter(t=>!(t.family&&t.tier&&t.tier<haut[t.family]));
      let at=atelierDuMetier(f,filtrer);
      if(filtrer&&garde&&garde.metier===f&&garde.eq==="ga_"+f&&!(at&&Object.hasOwn(at.modes,garde.mode))){
        const complet=atelierDuMetier(f,false);
        if(complet&&Object.hasOwn(complet.modes,garde.mode))at=at?Object.assign({},at,{modes:Object.assign({},at.modes,{[garde.mode]:complet.modes[garde.mode]})}):Object.assign({},complet,{modes:{[garde.mode]:complet.modes[garde.mode]}});
      }
      return at?gardes.concat([at]):gardes;
    }
    /* Quand tout est découvert, on remontre tout : le Labo ne doit pas se vider. */
    function toutDecouvert(){return !D.ATELIERS.familles.some(F=>outilsBruts(F.id,true,null).length>0);}
    function outilsDuMetier(f,garde){return outilsBruts(f,!toutDecouvert(),garde);}
    function metiersDispo(garde){
      const out=D.ATELIERS.familles.filter(F=>outilsDuMetier(F.id,garde).length>0);
      return out.length?out:[D.ATELIERS.familles[0]];
    }
    function work(){
      const s=E.state,f=s.flags;
      if(observedState!==s){signature="";message="";lastSale=null;messageSale="";observedState=s;}
      if(!f.equipmentBench||typeof f.equipmentBench!=="object")f.equipmentBench={metier:"artisanat",eq:"percuteur_pierre",mode:"tailler",slots:[]};
      const w=f.equipmentBench;
      w.slots=[...new Set((Array.isArray(w.slots)?w.slots:[]).filter(id=>I[id]))].slice(0,3);
      const garde=w.prepared?{metier:w.metier,eq:w.eq,mode:w.mode}:null;
      const metiers=metiersDispo(garde);
      if(!metiers.some(m=>m.id===w.metier))w.metier=metiers[0].id;
      let tools=outilsDuMetier(w.metier,garde);
      if(!tools.length)tools=E.equipmentList().filter(x=>x.ready).slice(0,1);
      if(!tools.some(x=>x.id===w.eq)){w.eq=tools[0].id;w.prepared=null;}
      const tool=tools.find(x=>x.id===w.eq);
      if(!Object.hasOwn(tool.modes,w.mode))w.mode=Object.keys(tool.modes)[0];
      if(!s.known[w.prepared])w.prepared=null;
      U.slots=[0,1,2].map(i=>w.slots[i]||null);
      if(isGrand(w.eq)){
        U.geste=w.mode;
        const parts=[...w.slots].sort().join(",");
        const recipe=Object.keys(I).find(id=>I[id].r&&!I[id].sec&&!D.CRAFT_EQUIPMENT.recipes[id]&&I[id].r[0]===w.mode&&Object.keys(I[id].r[1]).sort().join(",")===parts)||null;
        return {w,metiers,tools,tool,recipe};
      }
      const recipe=E.equipmentRecipe(w.eq,w.mode,w.slots);
      const reference=recipe||Object.keys(D.CRAFT_EQUIPMENT.recipes).find(id=>D.CRAFT_EQUIPMENT.recipes[id].some(c=>c.equipment===w.eq&&c.mode===w.mode));
      U.geste=reference?I[reference].r[0]:"assembler";
      return {w,metiers,tools,tool,recipe};
    }
    /* Une ressource est « utile » ici si une recette encore inconnue, dont tous les ingrédients ont été vus, la demande
     * avec cet outil et ce geste. Mémorisé par outil, geste et progression : le calcul parcourt les recettes. */
    /* 0.55 : le Labo enferme la découverte dans le métier ouvert. Les ressources montrées sont celles qui entrent dans au moins une recette du métier
     * (hors secrètes), jamais celles d'un autre : on sait pourquoi on les pose. Mémorisé par métier et par âge. */
    const memoMat={age:-1,v:{}};
    function matieresDuMetier(f){
      if(memoMat.age!==E.state.age){memoMat.age=E.state.age;memoMat.v={};}
      if(memoMat.v[f])return memoMat.v[f];
      const set=new Set();
      for(const id in I){const it=I[id];if(!it.r||it.sec||it.path||!E.ageOK(id)||E.atelierDe(id)!==f)continue;for(const k in it.r[1])set.add(k);}
      return memoMat.v[f]=set;
    }
    /* un assemblage dont la recette, pas encore trouvée, relève d'un autre métier : ici il ne donne rien (rien n'est révélé de l'autre métier) */
    function horsMetier(){
      const {w}=work(),parts=[...new Set(w.slots)].sort().join(",");
      if(!parts)return false;
      /* toutes les recettes qui prennent exactement ces ressources, avec n'importe quel outil : si aucune n'est du métier ouvert (ni déjà connue), rien ne se passe ici, et le thermomètre ne dit pas qu'elle existe ailleurs */
      const memes=Object.keys(I).filter(id=>I[id].r&&!I[id].sec&&!I[id].path&&E.ageOK(id)&&Object.keys(I[id].r[1]).sort().join(",")===parts);
      return memes.length>0&&memes.every(id=>!E.state.known[id]&&E.atelierDe(id)!==w.metier);
    }
    const memoUtile={cle:"",v:{}};
    function useful(id,w){
      const s=E.state,cle=[w.metier,w.eq,w.mode,Object.keys(s.known).length,Object.keys(s.seen).length].join("|");
      if(memoUtile.cle!==cle){memoUtile.cle=cle;memoUtile.v={};}
      if(id in memoUtile.v)return memoUtile.v[id];
      const dansMetier=rid=>E.atelierDe(rid)===w.metier;
      const eligible=isGrand(w.eq)?rid=>dansMetier(rid)&&!D.CRAFT_EQUIPMENT.recipes[rid]&&I[rid].r[0]===w.mode:rid=>dansMetier(rid)&&(D.CRAFT_EQUIPMENT.recipes[rid]||[]).some(c=>c.equipment===w.eq&&c.mode===w.mode);
      return memoUtile.v[id]=Object.values(E.reactions(id,eligible)).some(n=>n>0);
    }
    /* L'outil se choisit à l'icône (son nom est la légende) ; si l'outil a plusieurs gestes, ils s'affichent dessous en mots courts.
     * Le geste ne se redit pas dans le bouton de l'outil : l'icône suffit. */
    function iconeOutil(t){
      if(isGrand(t.id))return icon("etabli_amenage","sm");
      if(I[t.id])return icon(t.id,"sm");
      return t.item&&I[t.item]?icon(t.item,"sm"):api.gIc(t.geste||"assembler");
    }
    function actionsHTML(tools,w){
      const tool=tools.find(x=>x.id===w.eq)||tools[0];
      let h='<div class="ae-outils" role="group" aria-label="Outil">'+tools.map(t=>{
        const on=t.id===w.eq,nom=isGrand(t.id)?"Atelier":t.n;
        return '<button type="button" id="ae-tool-'+esc(t.id)+'" class="ae-chip ae-outil'+(on?' on':'')+'" data-ae="tool" data-value="'+esc(t.id)+'" aria-pressed="'+on+'" aria-label="'+esc(nom)+'" title="'+esc(nom)+'">'+iconeOutil(t)+'</button>';
      }).join('')+'</div>';
      h+='<p class="ae-legende">'+esc(isGrand(tool.id)?"Atelier":tool.n)+'</p>';
      const modes=Object.entries(tool.modes);
      h+='<div class="ae-gestes" role="group" aria-label="Geste">'+(modes.length>1?modes.map(([m,n])=>'<button type="button" id="ae-mode-'+esc(m)+'" class="ae-chip ae-geste'+(m===w.mode?' on':'')+'" data-ae="mode" data-value="'+esc(m)+'" aria-pressed="'+(m===w.mode)+'">'+esc(label(m,n,w.metier))+'</button>').join(''):'')+button("clear","","Vider","small ghost ae-vider",!w.slots.length)+'</div>';
      return h;
    }
    function body(mode){
      const {w,metiers,tools,tool,recipe}=work(),s=E.state,e=E.atelierEconomyInfo();
      if(mode==="eco")return economy(s,e);
      const raw=[...new Set(D.ZONES.filter(z=>E.zoneOpen(z.id)).flatMap(z=>z.res))];
      const duMetier=matieresDuMetier(w.metier);
      const ids=Object.keys(I).filter(id=>(raw.includes(id)||s.seen[id]||E.count(id)>0)&&(!E.isEquipmentItem(id)||consumed.has(id))&&(duMetier.has(id)||w.slots.includes(id))).sort((a,b)=>{
        const da=useful(a,w)?1:0,db=useful(b,w)?1:0;
        if(da!==db)return db-da;
        return (E.count(b)>=1?1:0)-(E.count(a)>=1?1:0);
      });
      const known=Object.keys(s.known).filter(id=>(E.atelierDe(id)===w.metier&&I[id]?.r)&&(!E.isUnique(I[id])||!(s.made[id]>0)));
      let h='';
      const releve=!mode&&E.shouldSuggestReleve&&E.shouldSuggestReleve();
      if(releve)h+='<section class="card releve-alerte"><b>✦ Passer le relais · +'+releve.gain+' Souvenirs</b><p class="small">'+esc(releve.texte)+'</p><button class="btn pri small" data-releve title="Voir les gains et les bonus permanents de la prochaine relève">Préparer la relève</button></section>';
      h+='<nav class="ae-posts ae-metiers" aria-label="Métiers">'+metiers.map(m=>button("metier",m.id,m.ic+' '+esc(m.n),m.id===w.metier?"pri":"")).join("")+'</nav>';
      h+='<div class="ae-layout"><section class="card ae-bench"><div class="ae-work"><div><div class="ae-slots">';
      for(let i=0;i<3;i++){const id=w.slots[i],need=w.prepared?I[w.prepared]?.r?.[1][id]:0;
        h+=button("slot",String(i),id?icon(id)+'<span>'+esc(name(id))+'</span><small data-ae-need="'+esc(id)+'" data-need="'+(need||0)+'"></small>':'+',id?"ae-filled":"ae-empty",!id);
      }
      let missingSub=null;
      if(w.prepared&&I[w.prepared]?.r){
        const req=I[w.prepared].r[1];
        for(const ing in req){
          if(E.count(ing)<req[ing]&&E.state.known[ing]&&E.maxPlan(ing)>=(req[ing]-E.count(ing))){
            missingSub=ing;break;
          }
        }
      }
      h+='</div>';
      if(w.prepared||w.slots.length){
        h+='<div class="ae-bench-subbar">'+(w.prepared?'<p class="ae-prepared">'+esc(name(w.prepared))+'</p>':'<span></span>');
        if(missingSub)h+=button("order_missing",missingSub,"⚡ Façonner "+esc(name(missingSub)),"small");
        h+='</div>';
      }
      h+='<div class="ae-actions">';
      h+=button("forge",w.mode,esc(label(w.mode,tool.modes[w.mode],w.metier)),"pri",!w.slots.length);
      if(recipe&&s.known[recipe]&&(tool.batch||1)>1&&!E.isUnique(I[recipe]))h+=button("batch",recipe,esc(label(w.mode,tool.modes[w.mode],w.metier))+' ×'+tool.batch+' · '+fmtTime(E.batchTime(recipe,tool.batch,{equipment:w.eq,mode:w.mode})),"",false);
      const heatCls=lastHeat?' ae-heat-'+lastHeat:'';
      h+='</div><p id="ae-result" class="small'+heatCls+'" role="status">'+esc(message)+'</p></div><aside class="ae-tools">'+actionsHTML(tools,w)+'</aside></div></section>';
      h+='<section class="card ae-stock"><div class="ae-stock-search"><input id="ae-search" type="search" aria-label="Chercher une ressource" placeholder="Chercher une ressource…" value="'+esc(U.equipmentSearch||"")+'"></div>';
      const filtre=s.settings.equipmentFilter||"utiles";
      const chip=(v,l,t)=>'<button type="button" class="ae-chip'+(filtre===v?' on':'')+'" data-ae="filtre" data-value="'+v+'" aria-pressed="'+(filtre===v)+'" title="'+esc(t)+'">'+l+'</button>';
      h+='<div class="ae-filtres" role="group" aria-label="Ressources à montrer">'+chip("utiles","✦ Utiles","Les ressources qui peuvent encore donner une recette avec cet outil et ce geste")+chip("tout","Tout","Toutes les ressources que tu as vues")+chip("reserve","En réserve","Seulement ce que tu as en stock")+'</div>';
      const study=E.studyAllCost();
      if(study.n)h+='<div class="ae-etude">'+button("study","","Étudier · ✨"+api.fmt(study.c),"small ghost",s.intu<study.c)+'<button type="button" class="btn-aide mini" data-aide="etude" title="Comprendre l’étude des ressources" aria-label="Comprendre l’étude des ressources">?</button></div>';
      h+='<p id="ae-discovery-empty" class="small muted" hidden></p><div class="ae-inventory">';
      for(const id of ids){const picked=w.slots.includes(id),reacts=E.equipmentHasDiscovery(id,w.eq,w.mode,w.metier);h+='<div class="ae-resource'+(reacts?' ae-reacts':'')+'" data-ae-resource="'+esc(id)+'" data-name="'+esc(name(id).toLowerCase())+'">'+button("item",id,icon(id,"sm")+'<span class="ae-item-name">'+esc(name(id))+'</span>'+(reacts?'<i class="ae-react-spark" title="Piste disponible">✦</i>':'')+'<b data-ae-count="'+esc(id)+'"></b>',picked?"ae-selected":"",!picked&&E.count(id)<1)+'</div>';
      }
      h+='</div></section></div>';
      h+='<div class="ae-mini" hidden aria-label="Établi compact"><span class="ae-mini-tool">'+esc(tool.n)+'</span>'+[0,1,2].map(i=>'<button type="button" id="ae-mini-slot-'+i+'" class="btn" data-ae="slot" data-value="'+i+'" aria-label="'+esc(w.slots[i]?'Retirer '+name(w.slots[i]):'Emplacement libre')+'"'+(w.slots[i]?'':' disabled')+'>'+(w.slots[i]?icon(w.slots[i],"sm"):'+')+'</button>').join('')+'<button type="button" id="ae-mini-forge" class="btn pri" data-ae="forge" data-value="'+esc(w.mode)+'">'+esc(label(w.mode,tool.modes[w.mode],w.metier))+'</button></div>';
      if(mode==="labo")return h;
      const cads=E.cadences?E.cadences():[];
      const cadsMap=Object.fromEntries(cads.map(c=>[c.id,c]));
      if(cads.length){
        const activeCount=cads.filter(c=>c.on&&c.status!=="off").length;
        const totalMachs=cads.reduce((acc,c)=>acc+c.machs,0);
        h+='<section class="card ae-cadences-panel"><details class="ae-cadences-details" open><summary class="ae-eco-summary" title="Afficher ou replier l’état des consignes de machines"><h3>⚙️ Consignes des machines ('+cads.length+')</h3><span class="small muted">'+activeCount+' active(s) · '+totalMachs+' mach.</span></summary><div class="ae-cad-grid">'+cads.map(c=>{
          let stBadge='';
          if(c.status==="ok") stBadge='<span class="ae-cad-badge ae-badge-ok">▸ '+c.machs+' mach. · +'+(api.perMin?api.perMin(c.rate):Math.round(c.rate*60)+'/min')+'</span>';
          else if(c.status==="full") stBadge='<span class="ae-cad-badge ae-badge-full">✓ Plein ('+(api.fmt?api.fmt(c.cap):c.cap)+')</span>';
          else if(c.status==="starved") stBadge='<span class="ae-cad-badge ae-badge-warn">⚠️ Manque : '+c.miss.map(m=>esc(name(m))).join(', ')+'</span>';
          else if(c.status==="busy") stBadge='<span class="ae-cad-badge ae-badge-muted">⏳ Machines occupées</span>';
          else if(c.status==="nomach") stBadge='<span class="ae-cad-badge ae-badge-warn">⚠️ Pas de machine</span>';
          else stBadge='<span class="ae-cad-badge ae-badge-off">⏸️ En pause</span>';
          return '<div class="ae-cad-card"><div class="ae-cad-info">'+icon(c.id,"sm")+'<div class="ae-cad-names"><b>'+esc(name(c.id))+'</b><span class="ae-cad-stock">'+(api.fmt?api.fmt(c.have):c.have)+' / '+(api.fmt?api.fmt(c.cap):c.cap)+'</span></div><div>'+stBadge+'</div></div><div class="ae-cad-acts">'+button("cadence_toggle",c.id,c.on?"⏸️":"▶️","mini ghost")+button("cadence_cap",c.id,c.cap+" ▾","mini ghost")+button("cadence_del",c.id,"✕","mini ghost")+'</div></div>';
        }).join('')+'</div></details></section>';
      }
      if(known.length)h+='<section class="card"><details class="ae-known-details" open><summary class="ae-eco-summary" title="Afficher ou replier les recettes déjà maîtrisées sur cette station"><h3>Recettes déjà maîtrisées sur cette station ('+known.length+')</h3><span class="small muted">Fabrication rapide</span></summary><div class="ae-known">'+known.map(id=>{
        const canCadence=E.automatable&&E.automatable(id)&&(E.hasEchoFin("retour")||!(D.COMMANDES?.firstByHand)||(s.made[id]>0));
        const cad=s.dom?.cadence?.[id];
        const c=cadsMap[id];
        let cadBtn='';
        if(canCadence){
          if(cad&&cad.on!==false)cadBtn=button("cadence_toggle",id,"⚙️ Actif","small pri",false)+button("cadence_cap",id,(cad.cap||100)+" ▾","small ghost",false);
          else if(cad&&cad.on===false)cadBtn=button("cadence_toggle",id,"⏸️ Pause","small ghost",false)+button("cadence_cap",id,(cad.cap||100)+" ▾","small ghost",false);
          else cadBtn=button("cadence",id,"⚙️ Consigne","small ghost",false);
        }
        let stLine='';
        if(cad&&c){
          if(c.status==="starved") stLine='<div class="ae-known-cad-status ae-badge-warn">⚠️ Ressources manquantes : '+c.miss.map(m=>esc(name(m))).join(', ')+'</div>';
          else if(c.status==="ok") stLine='<div class="ae-known-cad-status ae-badge-ok">⚙️ '+c.machs+' mach. · +'+(api.perMin?api.perMin(c.rate):Math.round(c.rate*60)+'/min')+' (réserve : '+(api.fmt?api.fmt(c.have):c.have)+'/'+(api.fmt?api.fmt(c.cap):c.cap)+')</div>';
          else if(c.status==="full") stLine='<div class="ae-known-cad-status ae-badge-full">✓ Réserve pleine ('+(api.fmt?api.fmt(c.have):c.have)+'/'+(api.fmt?api.fmt(c.cap):c.cap)+')</div>';
          else if(c.status==="busy") stLine='<div class="ae-known-cad-status ae-badge-muted">⏳ Machines occupées sur les commandes ('+(api.fmt?api.fmt(c.have):c.have)+'/'+(api.fmt?api.fmt(c.cap):c.cap)+')</div>';
          else if(c.status==="off") stLine='<div class="ae-known-cad-status ae-badge-off">⏸️ En pause ('+(api.fmt?api.fmt(c.have):c.have)+'/'+(api.fmt?api.fmt(c.cap):c.cap)+')</div>';
        }
        return '<div class="ae-cad-item-row"><div class="ae-cad-item-btns">'+button("prepare",id,esc(name(id)))+button("order",id,"Fabriquer","small")+cadBtn+'</div>'+stLine+'</div>';
      }).join("")+'</div></details></section>';
      if(!mode)h+=economy(s,e);
      return h;
    }
    /* l'ancienne carte « Faire vivre l'atelier » (bourse, apprenti de l'établi, troc de lanières) est retirée en 0.41 */
    function economy(){return '';}
    function sig(){const {w}=work(),s=E.state,e=E.atelierEconomyInfo(),rel=E.shouldSuggestReleve&&E.shouldSuggestReleve(),cadsSnap=E.cadences?E.cadences().map(c=>c.id+':'+c.have+':'+c.machs+':'+c.status).join(';'):'';return JSON.stringify([w,U.equipmentSearch,Object.keys(s.seen),Object.keys(s.known),Object.keys(s.studied),s.settings.equipmentFilter||"utiles",s.intu>=E.studyAllCost().c,E.equipmentList().map(x=>x.ready),E.count("etabli_amenage")>=1,s.age,s.act?.res,e.hired,e.working,e.budget>0,rel&&rel.gain,rel&&rel.reason,s.dom?.cadence,cadsSnap,lastHeat]);}
    function redraw(){U.dirty=true;render(true);live();save();}
    function view(){signature=sig();return api.goalHint()+'<div class="atelier-equipe" id="atelier-equipe">'+body()+'</div><div class="card" id="hands">'+api.handsHTML()+'</div>';}
    function laboView(){signature=sig();return '<header class="atl-titre"><h2>Labo</h2><p>Tes outils et tes gestes, métier par métier.</p></header><div class="atelier-equipe ae-lab" id="atelier-equipe">'+body("labo")+'</div>';}
    function ecoView(){signature=sig();return '<div class="atelier-equipe ae-prod" id="atelier-equipe">'+body("eco")+'</div>';}
    const rootMode=r=>r&&r.classList.contains("ae-lab")?"labo":r&&r.classList.contains("ae-prod")?"eco":undefined;
    const tabOK=()=>U.tab==="labo"||U.tab==="atelier";
    function live(){const r=root();if(!r||!tabOK()||U.equipmentLegacy)return;
      const next=sig();if(next!==signature){const ae=document.activeElement,focus=ae&&r.contains(ae)&&ae.id?{id:ae.id,start:ae.selectionStart,end:ae.selectionEnd}:null;const scroll=r.querySelector(".ae-inventory")?.scrollTop||0;r.innerHTML=body(rootMode(r));signature=next;const stock=r.querySelector(".ae-inventory");if(stock)stock.scrollTop=scroll;if(focus){const el=document.getElementById(focus.id);if(el){el.focus({preventScroll:true});try{el.setSelectionRange(focus.start,focus.end);}catch(_){}}}}
      const {w}=work(),e=E.atelierEconomyInfo(),query=(U.equipmentSearch||"").toLocaleLowerCase();
      let visible=0;
      const filtre=E.state.settings.equipmentFilter||"utiles";
      r.querySelectorAll("[data-ae-resource]").forEach(el=>{
        const id=el.dataset.aeResource,picked=w.slots.includes(id),b=el.querySelector('[data-ae="item"]'),n=E.count(id);
        el.hidden=!el.dataset.name.includes(query)||(!picked&&((filtre==="utiles"&&!useful(id,w))||(filtre==="reserve"&&n<1)));
        if(!el.hidden)visible++;
        b.disabled=!picked&&w.slots.length>=3; // un ingrédient à 0 se pose quand même : on voit ce qu’il faudrait réunir
        el.classList.toggle("ae-zero",n<1);
        b.classList.toggle("ae-selected",picked);
        b.setAttribute("aria-pressed",String(picked));
        b.setAttribute("aria-label",name(id)+', '+n.toLocaleString('fr-FR')+' en réserve'+(picked?', sur l’établi':''));
        b.title=name(id)+' · '+api.fmt(n);
        el.querySelector("[data-ae-count]").textContent=api.fmt(n);
      });
      const empty=r.querySelector('#ae-discovery-empty');
      if(empty){empty.hidden=visible>0;empty.innerHTML=query?'Aucune ressource ne correspond à cette recherche.':filtre==="utiles"?'Rien à découvrir ici avec cet outil et ce geste. Change d’outil, ou montre <button type="button" class="btn mini ghost" data-ae="filtre" data-value="tout">toutes les ressources</button>.':filtre==="reserve"?'Rien en réserve.':'Aucune ressource.';}
      const bench=r.querySelector('.ae-bench'),views=document.getElementById('views'),mini=r.querySelector('.ae-mini');
      if(mini)mini.hidden=!(w.slots.length&&bench.getBoundingClientRect().bottom<views.getBoundingClientRect().top);
      r.querySelectorAll("[data-ae-need]").forEach(el=>{const n=E.count(el.dataset.aeNeed),need=Number(el.dataset.need);el.textContent=need?'×'+need+' requis · '+Math.floor(n)+' disponibles'+(n<need?' · manque '+Math.ceil(need-n):' · prêt'):Math.floor(n)+' disponibles';});
      const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
      set("ae-wallet",money(E.state.ecus));
      const surplus=Math.max(0,Math.floor(E.count("laniere")-e.reserve)),quote=E.merchantQuote(surplus);
      set("ae-quote",(e.merchant?'Prochain passage : '+fmtTime(5-e.saleClock)+'. ':'Troc en pause. ')+surplus+' lanières → '+money(quote.net)+' nets (part clan : '+money(quote.tax)+').');
      set("ae-tax",'Paliers de '+e.quota+' lanières : 10 %, 20 %, 30 %, 40 %, puis 50 % de contribution au clan. Palier actuel : '+e.nextRate+' %. Renouvellement dans '+Math.ceil(60-e.clock)+' s. Net troqué : '+money(e.net)+' ; parts apprenti : '+money(e.wages)+'.');
      if(lastSale&&e.totalSold>lastSale.sold)messageSale='Dernier troc : +'+money(e.net-lastSale.net)+' · '+(e.totalSold-lastSale.sold)+' lanières';
      lastSale={sold:e.totalSold,net:e.net};set("ae-sale",messageSale);
    }
    let messageSale="";
    function prepare(id){if(!E.state.known[id])return;
      if(I[id]?.r&&!D.CRAFT_EQUIPMENT.recipes[id]){
        const g=I[id].r[0];
        Object.assign(work().w,{metier:E.atelierDe(id),eq:"ga_"+E.atelierDe(id),mode:g,slots:Object.keys(I[id].r[1]),prepared:id});
        message="Recette préparée : "+name(id);
        return;
      }
      const c=E.equipmentChoices(id).find(c=>c.ready);if(!c){message="Il faut d’abord : "+name(E.equipmentCheck(id)?.required||"un outil adapté");return;}Object.assign(work().w,{eq:c.equipment,mode:c.mode,metier:E.atelierDe(id),slots:Object.keys(I[id].r[1]),prepared:id});message="Recette préparée : "+name(id);}
    function forge(mode){const {w}=work();if(!w.slots.length){if(mode&&Object.hasOwn(work().tool.modes,mode)){w.mode=mode;w.prepared=null;}return;}w.mode=mode||w.mode;work();
      if(horsMetier()){lastHeat="froid";message="Ce geste ne donne rien avec ces ressources. Essaie un autre outil, une autre combinaison, ou un autre métier.";A.fail(0);redraw();return;}
      U.forging=true;let result;try{result=isGrand(w.eq)?E.attempt(w.mode,w.slots):E.attemptWith(w.eq,w.mode,w.slots);}finally{U.forging=false;}U.last=result;
      if(result.kind==="craft"||result.kind==="queued"){
        lastHeat="success";
        message=(result.kind==="craft"?"Fabriqué : ":"En cours : ")+name(result.id);
        A.craft(soundGesture(w.mode));
      }
      else if(result.kind==="learn"||result.kind==="blocked"){
        lastHeat="discover";
        message="Recette trouvée : "+name(result.id)+(result.missing?" · Il manque "+Object.entries(result.missing).map(([id,n])=>n+' '+name(id)).join(', '):result.info?' · '+api.needText(result.id,result.info):' · Inscrite dans le Carnet');
        if(result.offered){const o=I[result.id]?.r?.[2]||1;message+=" · Offerte par la maison : "+o+" "+name(result.id)+" dans ta Réserve";}
        A.discover();
      }
      else if(result.thermo){
        lastHeat=result.thermo.heat;
        if(typeof E.remember==="function"&&(result.thermo.heat==="brulant"||result.thermo.heat==="chaud")){
          E.remember(w.mode,w.slots);
        }
        message=result.thermo.label+" · "+result.thermo.text;
        A.fail(result.thermo.heat==="brulant"?3:result.thermo.heat==="chaud"?2:result.thermo.heat==="tiede"?1:0);
      }
      else if(result.kind==="fail"&&result.heat!==undefined){
        lastHeat=["froid","tiede","chaud","brulant"][result.heat]||"froid";
        const hLbl=["❄️ Froid","🌤️ Tiède","🌡️ Chaud","🔥 Brûlant"][result.heat]||"❄️ Froid";
        message=hLbl+(result.text?" · "+result.text:" · Aucune réaction avec ces ressources.");
        A.fail(result.heat||0);
      }
      else {
        lastHeat="froid";
        message=result.kind==="owned"?"Tu possèdes déjà cet objet.":"Ce geste ne donne rien avec ces ressources. Essaie un autre outil ou une autre combinaison.";
        A.fail(0);
      }
      if(result.fresh&&(result.kind==="craft"||result.kind==="learn"))api.fete({id:result.id,kick:"Nouvelle découverte",title:name(result.id),sub:I[result.id].u||""});
      redraw();
    }
    document.addEventListener("click",ev=>{const b=ev.target.closest("[data-ae]");if(!b||!tabOK()||!b.closest("#v-labo,#v-atelier")||b.disabled)return;const action=b.dataset.ae,id=b.dataset.value;
      if(action==="legacy"){U.equipmentLegacy=id==="1";redraw();return;}
      if(!root()?.contains(b))return;
      const {w,tools,tool}=work();A.init();
      if(action==="metier"){if(D.ATELIERS.familles.some(f=>f.id===id)){w.metier=id;w.prepared=null;}}
      else if(action==="filtre"){E.state.settings.equipmentFilter=["utiles","tout","reserve"].includes(id)?id:"utiles";redraw();return;}
      else if(action==="mode"){if(Object.hasOwn(tool.modes,id)){w.mode=id;w.prepared=null;}}
      else if(action==="study"){const n=E.studyAll();message=n?n+' ressources étudiées.':'Il manque de l’Intuition pour étudier ces ressources.';}
      else if(action==="action"){const [te,tm]=String(id).split("|"),t=tools.find(x=>x.id===te);if(t&&Object.hasOwn(t.modes,tm)){w.eq=te;w.mode=tm;w.prepared=null;}}
      else if(action==="tool"){w.eq=id;const t=tools.find(x=>x.id===id)||D.CRAFT_EQUIPMENT.equipment[id];if(t)w.mode=Object.keys(t.modes)[0];w.prepared=null;}
      else if(action==="item"){if(w.slots.includes(id))w.slots.splice(w.slots.indexOf(id),1);else if(w.slots.length<3)w.slots.push(id);w.prepared=null;}
      else if(action==="slot"){w.slots.splice(Number(id),1);w.prepared=null;}
      else if(action==="clear"){w.slots=[];w.prepared=null;message="Établi débarrassé.";redraw();return;}
      else if(action==="forge"){forge(id);return;}
      else if(action==="prepare")prepare(id);
      else if(action==="order"){const result=E.order(id,1);message=result.ok?"Commande lancée : "+name(id):"Il manque une recette ou un équipement : consulte le Carnet.";}
      else if(action==="order_missing"){const result=E.order(id,1);message=result.ok?"Façonnage lancé pour : "+name(id):"Ressources insuffisantes pour : "+name(id);if(typeof toast==="function")toast(message);}
      else if(action==="batch"){const result=E.queue(id,tool.batch||1,false,undefined,{equipment:w.eq,mode:w.mode});message=result.ok?"Série lancée avec "+name(w.eq):"Pas assez de ressources ou de place dans les commandes.";}
      else if(action==="cadence"){
        if(E.setCadence){
          const r=E.setCadence(id,100,true);
          if(r.ok){
            message="Consigne activée : garder 100 "+name(id)+" en réserve avec les machines libres.";
            if(typeof toast==="function")toast(message);
          }
        }
      }
      else if(action==="cadence_toggle"){
        if(E.setCadence){
          const cur=E.state.dom?.cadence?.[id];
          if(cur){
            const nextOn=!cur.on;
            E.setCadence(id,cur.cap,nextOn);
            message=nextOn?"Consigne réactivée pour "+name(id)+" ("+cur.cap+" max).":"Consigne en pause pour "+name(id)+".";
            if(typeof toast==="function")toast(message);
          }
        }
      }
      else if(action==="cadence_cap"){
        if(E.setCadence){
          const cur=E.state.dom?.cadence?.[id];
          if(cur){
            const tiers=[25,50,100,250,500];
            const curCap=cur.cap||100;
            const idx=tiers.indexOf(curCap);
            const nextCap=tiers[(idx+1)%tiers.length];
            E.setCadence(id,nextCap,cur.on);
            message="Réserve visée ajustée à "+nextCap+" pour "+name(id)+".";
            if(typeof toast==="function")toast(message);
          }
        }
      }
      else if(action==="cadence_del"){
        if(E.setCadence){
          E.setCadence(id,null);
          message="Consigne retirée pour "+name(id)+".";
          if(typeof toast==="function")toast(message);
        }
      }
      redraw();
    });
    document.addEventListener("input",ev=>{if(ev.target.id==="ae-search"){U.equipmentSearch=ev.target.value;live();}});
    document.addEventListener("change",ev=>{
      if(ev.target.id==="ae-discovery-mode"){const {w,tool}=work();if(Object.hasOwn(tool.modes,ev.target.value)){w.mode=ev.target.value;w.prepared=null;redraw();}return;}
      if(ev.target.id==="ae-autofund"&&E.workerAutoFund){E.workerAutoFund(ev.target.checked);live();save();return;}
      if(ev.target.id==="ae-merchant"||ev.target.id==="ae-reserve"){const on=document.getElementById("ae-merchant"),reserve=document.getElementById("ae-reserve");E.merchantConfigure(on.checked,reserve.value);live();save();}
    });
    return {view,laboView,ecoView,live,forge,prepare};
  }
  window.EclatAtelierEquipe={create};
})();
