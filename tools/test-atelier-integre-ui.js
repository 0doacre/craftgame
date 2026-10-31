"use strict";
const fs=require("fs"),path=require("path"),http=require("http"),assert=require("assert/strict");
const {chromium}=require(process.env.PW||"playwright"),D=require("../js/data"),Core=require("../js/engine");
const ROOT=path.resolve(__dirname,"..");
const server=http.createServer((req,res)=>{const file=path.resolve(ROOT,"."+new URL(req.url,"http://localhost").pathname.replace(/\/$/,"/index.html"));if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,b)=>{if(err)return res.writeHead(404).end();res.setHeader("Content-Type",({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".webp":"image/webp",".woff2":"font/woff2"})[path.extname(file)]||"application/octet-stream");res.end(b);});});
let browser,checks=0;const ok=(v,msg)=>{assert.ok(v,msg);checks++;};
// Une partie avancée artificielle a déjà terminé la relève du tutoriel.
function fixture(advanced=false){const E=Core.createEngine();if(advanced){E.state.meta.forcedDone=true;E.state.age=2;for(const z of ["plaine","riviere"]){E.state.zones[z]=true;E.state.pass[z]={done:true,paid:{}};}for(const id of ["manche","corde","eclat","laniere","couteau"])E.learn(id,true);for(const[id,n]of Object.entries({bois:30,corde:3,caillou:20,os:15,cuir:60,silex:10,laniere:50}))E.add(id,n);E.state.stats.crafts=1;}
  E.state.introSeen=true;E.state.flags.ver=D.VERSION;Object.assign(E.state.settings,{tuto:false,sound:false,visiteurs:false,theme:"light"});return E.serialize();}
async function open(p,raw){await p.addInitScript(raw=>{localStorage.setItem("eclat.save.v1",raw);Math.random=()=>.99;},raw);await p.goto("http://127.0.0.1:"+server.address().port+"/index.html");await p.waitForFunction(()=>!!window.__eclat);await p.locator('[data-tab="atelier"]').click();await p.waitForSelector("#atelier-equipe");}
async function run(){await new Promise(r=>server.listen(0,"127.0.0.1",r));browser=await chromium.launch(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{});
  for(const width of [320,390,800,1280]){const ctx=await browser.newContext({viewport:{width,height:950},serviceWorkers:"block",reducedMotion:"reduce"}),p=await ctx.newPage(),errors=[],network=[];p.on("pageerror",e=>errors.push(e.message));p.on("request",r=>{if(r.url().includes("eclat-comptes"))network.push(r.url());});
    const stage=JSON.parse(fixture());if(width===800)stage.settings.theme="dark";const raw=JSON.stringify(stage);await open(p,raw);
    ok(await p.evaluate(()=>window.__eclat.E.SAVE_VERSION===13),"moteur équipé dans index.html");
    ok(await p.locator("#ae-tool-percuteur_pierre").isVisible(),"outil visible dans le véritable onglet Atelier");
    ok(await p.evaluate(()=>document.getElementById("v-atelier").scrollWidth<=document.getElementById("views").clientWidth+2),"pas de débordement horizontal de l’Atelier");
    ok(await p.locator('#atelier-equipe [data-ae="harvest"], #atelier-equipe [data-goto]').count()===0,"ni récolte ni fiche dans l’Atelier");
    ok(await p.locator('.ae-posts').count()===0,"pas de doublon de l’établi quand c’est le seul poste");
    ok(!(await p.locator('#atelier-equipe').textContent()).includes('Pose tes ressources')&&!(await p.locator('#atelier-equipe').textContent()).includes('Un clic pour'),"textes explicatifs retirés");
    const tiles=await p.locator('.ae-resource').evaluateAll(nodes=>nodes.every(n=>{const btn=n.querySelector('button'),r=btn.getBoundingClientRect(),hasIc=btn.querySelector('.ic')||btn.querySelector('svg'),hasCount=btn.querySelector('[data-ae-count]');return r.height>=44&&r.width>=44&&hasIc&&hasCount;}));
    ok(tiles,"matières densifiées en tuiles d’icônes avec leur réserve");
    if(process.env.EQUIPMENT_SHOTS){fs.mkdirSync(process.env.EQUIPMENT_SHOTS,{recursive:true});await p.evaluate(()=>document.getElementById('views').scrollTop=0);await p.screenshot({path:path.join(process.env.EQUIPMENT_SHOTS,'atelier-epure-'+width+'.png')});}
    await p.locator('[data-tab="domaine"]').click();
    await p.locator('#v-domaine [data-hloop="lisiere:bois"]').first().click();
    await p.waitForFunction(()=>window.__eclat.E.count('bois')>=3);
    await p.locator('#v-domaine [data-hloop="lisiere:bois"]').first().click();
    ok(await p.evaluate(()=>window.__eclat.E.count('bois')>=3&&!window.__eclat.E.state.act),"récolte réelle dans le Domaine jusqu’à trois bois");
    await p.locator('[data-tab="atelier"]').click();
    await p.locator("#ae-item-bois").click();await p.locator("#ae-forge-tailler").click();
    await p.waitForFunction(()=>window.__eclat.E.count("manche")===1);checks++;
    ok(await p.evaluate(()=>window.__eclat.E.state.known.manche),"découverte partagée avec le Carnet");
    await p.locator('[data-tab="domaine"]').click();ok(await p.locator("#v-domaine.on").isVisible(),"Domaine conservé");
    await p.locator('[data-tab="carnet"]').click();ok(await p.locator("#v-carnet.on").isVisible(),"Carnet conservé");
    await p.evaluate(()=>window.__eclat.save());ok(await p.evaluate(raw=>localStorage.getItem("eclat.save.v1")===raw,raw),"partie habituelle préservée");
    ok(await p.evaluate(()=>!!JSON.parse(localStorage.getItem("eclat.preview.craft.v1")).known.manche),"sauvegarde de prévisualisation distincte");
    await p.reload();await p.waitForFunction(()=>!!window.__eclat);ok(await p.evaluate(()=>window.__eclat.E.count("manche"))===1,"rechargement de la vraie partie de test");
    ok(!network.length,"aucune synchronisation du profil expérimental vers les comptes habituels");
    await p.goto("http://127.0.0.1:"+server.address().port+"/index.html?atelier=classique");await p.waitForFunction(()=>!!window.__eclat);
    ok(await p.evaluate(()=>window.__eclat.E.SAVE_VERSION===12&&window.__eclat.E.count("manche")===0),"partie historique accessible séparément");
    ok(!errors.length,"aucune erreur JS : "+errors.join(";"));await ctx.close();console.log("✓ Atelier principal "+width);
  }
  const ctx=await browser.newContext({viewport:{width:1280,height:950},serviceWorkers:"block",reducedMotion:"reduce"}),p=await ctx.newPage(),errors=[];p.on("pageerror",e=>errors.push(e.message));await open(p,fixture(true));
  await p.locator('#ae-item-bois').click();
  await p.evaluate(()=>document.getElementById('views').scrollTop=document.getElementById('views').scrollHeight);
  await p.waitForSelector('.ae-mini:not([hidden])');
  ok(await p.locator('.ae-mini').evaluate(e=>{const b=e.getBoundingClientRect(),tabs=document.getElementById('tabs').getBoundingClientRect();return b.top>=0&&b.bottom<=tabs.top&&b.left>=0&&b.right<=innerWidth;}),"établi compact dans l’écran, au-dessus de la navigation");
  ok(await p.locator('#ae-mini-slot-0').getAttribute('aria-label')==='Retirer Bois',"matière visible dans l’établi compact hors écran");
  await p.locator('#ae-mini-forge').click();await p.waitForFunction(()=>window.__eclat.E.count('manche')>=1);checks++;
  await p.waitForTimeout(900);await p.evaluate(()=>window.__eclat.closeModal());
  await p.locator("#ae-build-0").click();await p.waitForFunction(()=>window.__eclat.E.count("etabli_amenage")===1);checks++;
  await p.waitForTimeout(900);await p.evaluate(()=>window.__eclat.closeModal());await p.waitForFunction(()=>!document.getElementById("app").inert);
  await p.locator("#ae-reserve").fill("0");await p.locator("#ae-reserve").press("Tab");await p.locator("#ae-sell-0").click();
  ok(await p.evaluate(()=>window.__eclat.E.state.ecus)>4.12,"vente finance embauche et avance dans le jeu réel");
  await p.locator("#ae-hire-0").click();await p.locator("#ae-fund-0").click();await p.locator("#ae-worker-0").click();await p.locator("#ae-merchant").check();
  await p.waitForFunction(()=>window.__eclat.E.atelierEconomyInfo().produced>0);checks++;
  await p.locator("#ae-order-couteau").click();await p.waitForFunction(()=>window.__eclat.E.count("couteau")===1);checks++;
  await p.waitForTimeout(900);await p.evaluate(()=>window.__eclat.closeModal());
  ok(await p.evaluate(()=>window.__eclat.E.atelierEconomyInfo().tool)==="couteau","amélioration partagée avec l’ouvrier du vrai jeu");
  if(process.env.EQUIPMENT_SHOTS){fs.mkdirSync(process.env.EQUIPMENT_SHOTS,{recursive:true});await p.evaluate(()=>document.getElementById("views").scrollTop=0);await p.screenshot({path:path.join(process.env.EQUIPMENT_SHOTS,"atelier-integre-1280.png")});}
  await p.evaluate(()=>{const g=window.__eclat;g.E.state.age=4;g.E.add("cuir",100);g.E.add("fibre",100);g.E.learn("gants",true);g.render(true);});
  await p.locator("#ae-legacy-1").click();await p.locator('[data-g="assembler"]').click();
  await p.evaluate(()=>{const g=window.__eclat;g.U.slots=["cuir","fibre",null];g.render(true);});
  await p.locator("#forge").click();await p.waitForFunction(()=>window.__eclat.E.count("gants")>=1);checks++;
  await p.locator('[data-ae="legacy"][data-value="0"]').click();ok(await p.locator("#atelier-equipe").isVisible(),"aller-retour avec les procédés des âges suivants");
  await p.evaluate(()=>{const g=window.__eclat;g.E.reset();g.E.state.introSeen=true;g.E.state.settings.tuto=false;g.render(true);});
  ok(await p.evaluate(()=>window.__eclat.E.count("couteau")===0&&window.__eclat.E.count("percuteur_pierre")===1),"nouveau départ conserve seulement l’outillage de départ");
  ok((await p.locator("#ae-result").textContent())==="","ancien résultat effacé après nouveau départ");
  ok(!errors.length,"économie intégrée sans erreurs : "+errors.join(";"));await ctx.close();console.log(checks+" contrôles d’intégration réussis.");
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
