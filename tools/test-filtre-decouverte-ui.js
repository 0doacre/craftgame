"use strict";
const fs=require("fs"),path=require("path"),http=require("http"),assert=require("assert/strict");
const {chromium}=require(process.env.PW||"playwright"),D=require("../js/data"),Core=require("../js/engine");
const ROOT=path.resolve(__dirname,".."),equipped=fs.existsSync(path.join(ROOT,"js/equipements.js"));
const server=http.createServer((req,res)=>{const file=path.resolve(ROOT,"."+new URL(req.url,"http://localhost").pathname.replace(/\/$/,"/index.html"));if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader("Content-Type",({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".webp":"image/webp",".woff2":"font/woff2"})[path.extname(file)]||"application/octet-stream");res.end(data);});});
let checks=0;const check=(v,n)=>{assert.ok(v,n);checks++;};
function fixture(preview){
  const E=preview?Core.withData(require("../js/equipements").createData(D,{fullGame:true})).createEngine():Core.createEngine(),s=E.state;
  s.age=2;s.cycle=2;s.introSeen=true;s.meta.forcedDone=true;s.flags.ver=D.VERSION;s.stats.crafts=1;s.intu=100;
  Object.assign(s.settings,{tuto:false,sound:false,visiteurs:false,theme:"light"});
  for(const[id,it]of Object.entries(E.D.ITEMS))if(it.r)s.known[id]=1;
  for(const id of preview?["laniere","engrenage_bois"]:["manche","corde","laniere"])delete s.known[id];
  for(const id of ["bois","fibre","caillou","cuir","manche","corde","eclat","os","couteau","racloir_os"])E.add(id,id==="couteau"||id==="racloir_os"?1:20);
  s.studied=preview?{cuir:1,manche:1,bois:1}:{bois:1,fibre:1};
  if(preview)s.flags.equipmentBench={place:"etabli",eq:"couteau",mode:"couper",slots:[]};
  E.recalc();return E.serialize();
}
async function start(p,preview){
  await p.addInitScript(({raw,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,raw);}, {raw:fixture(preview),key:preview?"eclat.preview.craft.v1":"eclat.save.v1"});
  await p.goto("http://127.0.0.1:"+server.address().port+"/index.html"+(preview?"":"?atelier=classique"));
  await p.waitForFunction(()=>!!window.__eclat);
  for(let i=0;i<10;i++){await p.waitForTimeout(100);await p.evaluate(()=>window.__eclat.closeModal());}
  await p.locator('[data-tab="atelier"]').click();
}
async function main(){
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{})});
  try{
    for(const preview of equipped?[false,true]:[false])for(const width of [320,390,980]){
      const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:"block"}),p=await context.newPage(),errors=[];
      p.on("pageerror",e=>errors.push(e.message));await start(p,preview);
      const prefix=(preview?"équipé":"classique")+" "+width;
      if(!preview){
        await p.locator('[data-g="tailler"]').click();await p.locator('[data-filtres]').click();
        const filter=p.locator('[data-if="tryg"]');check((await filter.innerText()).includes("1"),prefix+" compteur limité au geste et aux matières étudiées");
        await filter.click();
        const ids=()=>p.locator('#v-atelier [data-inv]').evaluateAll(es=>es.map(e=>e.dataset.inv).sort());
        assert.deepEqual(await ids(),["bois"]);checks++;
        await p.locator('[data-inv="bois"]').click();const slots=await p.evaluate(()=>JSON.stringify(window.__eclat.U.slots));
        await p.locator('[data-g="tresser"]').click();assert.deepEqual(await ids(),["fibre"]);checks++;
        check(await p.evaluate(raw=>JSON.stringify(window.__eclat.U.slots)===raw,slots),prefix+" sélection conservée");
        await p.locator('[data-g="tailler"]').click();
        await p.evaluate(()=>window.__eclat.E.learn("manche",true));
        await p.waitForFunction(()=>document.querySelectorAll('#v-atelier [data-inv]').length===0);
        check((await p.locator('#v-atelier').innerText()).includes("Aucune ressource étudiée"),prefix+" état vide explicite après découverte");
        await p.evaluate(()=>window.__eclat.E.study("cuir"));
        await p.waitForSelector('[data-inv="cuir"]');assert.deepEqual(await ids(),["cuir"]);checks++;
        await p.locator('#iq').fill('bois');await p.waitForTimeout(250);assert.deepEqual(await ids(),[]);checks++;
        await p.locator('#iq').fill('');await p.waitForSelector('[data-inv="cuir"]');
        await p.evaluate(()=>window.__eclat.save());await p.reload();await p.waitForFunction(()=>!!window.__eclat);
        check(await p.evaluate(()=>window.__eclat.E.state.settings.inv.filter==="tryg"),prefix+" filtre sauvegardé");
        for(let i=0;i<5;i++){await p.waitForTimeout(100);await p.evaluate(()=>window.__eclat.closeModal());}
        await p.locator('[data-tab="atelier"]').click();
      }else{
        await p.locator('#ae-discovery-only').check();
        const ids=()=>p.locator('[data-ae-resource]:visible').evaluateAll(es=>es.map(e=>e.dataset.aeResource).sort());
        assert.deepEqual(await ids(),["cuir"]);checks++;
        await p.locator('#ae-item-cuir').click();const slots=await p.evaluate(()=>JSON.stringify(window.__eclat.E.state.flags.equipmentBench.slots));
        const tries=await p.evaluate(()=>window.__eclat.E.state.stats.tries);
        await p.locator('#ae-discovery-mode').selectOption('entailler');
        await p.waitForTimeout(150);assert.deepEqual(await ids(),["manche"]);checks++;
        check(await p.evaluate(n=>window.__eclat.E.state.stats.tries===n,tries),prefix+" changer le geste ne lance aucun essai");
        check(await p.evaluate(raw=>JSON.stringify(window.__eclat.E.state.flags.equipmentBench.slots)===raw,slots),prefix+" établi conservé");
        await p.locator('#ae-search').fill('cuir');await p.waitForTimeout(150);assert.deepEqual(await ids(),[]);checks++;
        await p.locator('#ae-search').fill('');
        await p.evaluate(()=>window.__eclat.E.learn("engrenage_bois",true));
        await p.waitForFunction(()=>[...document.querySelectorAll('[data-ae-resource]')].every(e=>e.hidden));
        check(await p.locator('#ae-discovery-empty').isVisible(),prefix+" filtre actualisé après découverte");
        await p.locator('#ae-discovery-mode').selectOption('couper');await p.waitForSelector('#ae-item-cuir:visible');
        await p.evaluate(()=>window.__eclat.save());await p.reload();await p.waitForFunction(()=>!!window.__eclat);
        for(let i=0;i<5;i++){await p.waitForTimeout(100);await p.evaluate(()=>window.__eclat.closeModal());}
        await p.locator('[data-tab="atelier"]').click();
        check(await p.locator('#ae-discovery-only').isChecked(),prefix+" filtre sauvegardé");
        await p.locator('#ae-discovery-only').uncheck();check((await ids()).includes("bois"),prefix+" retour à toutes les matières");
      }
      check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),prefix+" aucun débordement");
      check(errors.length===0,prefix+" sans erreur : "+errors.join('; '));
      if(process.env.DISCOVERY_SHOTS){fs.mkdirSync(process.env.DISCOVERY_SHOTS,{recursive:true});await p.screenshot({path:path.join(process.env.DISCOVERY_SHOTS,(preview?'equipe':'classique')+'-'+width+'.png')});}
      await context.close();
    }
    console.log(checks+" contrôles du filtre de découverte réussis.");
  }finally{await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
