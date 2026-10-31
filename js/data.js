/* ÉCLAT — du silex aux étoiles
 * Contenu du jeu : âges, gestes, matières, recettes, zones, explorations, lore.
 * Format d’une recette : r: [geste, {ingrédient: quantité}, quantité produite, {heat, lvl}]
 */
(function (root) {
  "use strict";
  const D = {};
  D.VERSION = "0.61.0";

  /* ------------------------------------------------------------------ ÂGES */
  D.AGES = [
    { id: "bois", n: "Âge du Bois", c: "#c58d4e", q: "Tout commence par un bâton." },
    { id: "os", n: "Âge de l’Os", c: "#e6d9b8", q: "Tout ce que laissent les bêtes peut servir." },
    { id: "pierre", n: "Âge de la Pierre", c: "#a7afb8", q: "Le premier tranchant." },
    { id: "cuivre", n: "Âge du Cuivre", c: "#e0814a", q: "La pierre verte cache un métal rouge." },
    { id: "bronze", n: "Âge du Bronze", c: "#d6a746", q: "Deux métaux tendres, un alliage dur." },
    { id: "fer", n: "Âge du Fer", c: "#cf6a52", q: "Le fer ne cède qu’au marteau." },
    { id: "acier", n: "Âge de l’Acier", c: "#8db0d6", q: "Le fer durcit : il plie, mais ne casse plus." },
    { id: "vapeur", n: "Âge de la Vapeur", c: "#cdb89c", q: "La vapeur se met à travailler pour toi." },
    { id: "elec", n: "Âge de l’Électricité", c: "#f2d13c", q: "Une étincelle captive." },
    { id: "atome", n: "Âge de l’Atome", c: "#4fb0ff", q: "Le cœur de la matière chauffe." },
    { id: "silicium", n: "Âge du Silicium", c: "#5fd394", q: "Le sable se met à penser." },
    { id: "polymeres", n: "Âge des Polymères", c: "#bd8cf0", q: "L’huile noire devient tout ce que tu veux." },
    { id: "composites", n: "Âge des Composites", c: "#43d6d6", q: "Plus léger que l’aluminium, plus dur que l’acier." },
    { id: "spatial", n: "Âge Spatial", c: "#8aa2ff", q: "Le ciel n’est plus un plafond." },
    { id: "stellaire", n: "Âge Stellaire", c: "#ffd27a", q: "Le Soleil est une ressource." }
  ];

  /* --------------------------------------------------------------- GESTES */
  D.GESTE_ORDER = ["assembler", "construire", "tresser", "tailler", "chauffer", "marteler", "allier", "tremper", "usiner",
    "electriser", "graver", "synthetiser", "stratifier", "transmuter", "accorder"];
  D.GESTES = {
    assembler: { n: "Assembler", ic: "✋", v: "assembler", d: "Réunir plusieurs ressources en un seul objet." },
    construire: { n: "Construire", ic: "🏗️", v: "construire", d: "Bâtir ce qui reste en place : un extracteur, une machine, une installation, une amélioration." },
    tresser: { n: "Tresser", ic: "🧶", v: "tresser", d: "Entrelacer ce qui est souple." },
    tailler: { n: "Tailler", ic: "🔪", v: "tailler", d: "Retirer ce qui est en trop : fendre, découper, affûter." },
    chauffer: { n: "Chauffer", ic: "🔥", v: "chauffer", d: "Cuire, fondre, réduire. La température dépend de ton meilleur feu : feu de camp, four, fourneau…" },
    marteler: { n: "Marteler", ic: "🔨", v: "marteler", d: "Battre le métal sur une enclume." },
    allier: { n: "Allier", ic: "⚗️", v: "allier", d: "Fondre plusieurs métaux ensemble dans un creuset." },
    tremper: { n: "Tremper", ic: "💧", v: "tremper", d: "Refroidir brutalement pour durcir." },
    usiner: { n: "Usiner", ic: "⚙️", v: "usiner", d: "Façonner avec la précision d’une machine." },
    electriser: { n: "Électriser", ic: "⚡", v: "électriser", d: "Raffiner et transformer par le courant." },
    graver: { n: "Graver", ic: "🔬", v: "graver", d: "Dessiner avec la lumière à l’échelle de l’atome." },
    synthetiser: { n: "Synthétiser", ic: "🧪", v: "synthétiser", d: "Recomposer les molécules." },
    stratifier: { n: "Stratifier", ic: "📚", v: "stratifier", d: "Empiler des couches et les cuire sous pression." },
    transmuter: { n: "Transmuter", ic: "✴️", v: "transmuter", d: "Réarranger la matière elle-même. Le vieux rêve des alchimistes." },
    accorder: { n: "Accorder", ic: "🎵", v: "accorder", d: "Faire vibrer la matière sur une seule note. Un geste oublié.", secret: true }
  };

  /* -------------------------------------------------------------- MATIÈRES
   * t : res (récoltable) · comp (composant) · tool (outil) · stat (station)
   *     ext (extracteur, répétable) · upg (amélioration) · mach (machine de production, répétable)
   *     curio (curiosité) · relic (relique trouvée)
   * e : effets — tap/auto {cible: mult}, zone, st (station), sky, arche, term,
   *     intu (✨/min), exp (vitesse d’exploration), pip, slots, aspd, once, flute
   * p : production par seconde (extracteurs), z : zone de l’extracteur, s : croissance du coût
   * spd : fabrications par minute (machines)
   */
  const I = (D.ITEMS = {});

  /* Âge 0 — Bois */
  I.bois = { n: "Bois", ic: "🪵", a: 0, t: "res", u: "Sert dans presque toutes les premières recettes.", d: "Dans une forêt, ce n’est pas ça qui manque." };
  I.fibre = { n: "Fibres", ic: "🌿", a: 0, t: "res", u: "Sert à tresser : cordes, paniers, cabanes.", d: "Des herbes longues et des lianes. Tu peux les plier et les nouer." };
  I.caillou = { n: "Pierre", ic: "🪨", a: 0, t: "res", u: "Sert au feu de camp, puis aux constructions lourdes.", d: "Cailloux, galets, blocs. Lourds, mais solides." };
  I.manche = { n: "Manche", sym: "╱", col: "#8a5a32", a: 0, t: "comp", r: ["tailler", { bois: 3 }, 1],
    u: "Sert dans les outils, l’archet à feu et la cabane.", d: "Un bâton bien droit, écorcé. L’ingrédient de base de tout jeu de survie.",
    h: "Une branche bien droite, écorcée au caillou, tient bien en main." };
  I.corde = { n: "Corde", ic: "🪢", a: 0, t: "comp", r: ["tresser", { fibre: 3 }, 1],
    u: "Sert à lier : archet à feu, cabane, collets.", d: "Trois brins tordus ensemble. Elle tient ton poids.",
    h: "Roule ces tiges sèches entre tes paumes : les brins se torsadent en un lien solide." };
  I.panier = { n: "Panier tressé", ic: "🧺", a: 0, t: "tool", r: ["tresser", { fibre: 15, manche: 2 }, 1],
    e: { tap: { lisiere: 2 } }, u: "Double ta récolte à la main dans la Lisière.", d: "Enfin de quoi porter plus que deux mains pleines.",
    h: "Deux branches ployées et une poignée d’herbes tressées, pour emporter toute la récolte." };
  I.archet = { n: "Archet à feu", ic: "🏹", a: 0, t: "comp", r: ["assembler", { manche: 1, corde: 2 }, 1],
    u: "Pour allumer le feu de camp.", d: "Un petit arc dont la corde fait tourner un bâton contre du bois. Tourne assez vite, et le bois finit par fumer.",
    h: "Une tige de bois qui tourne vite contre une bûche finit par fumer." };
  I.feu = { n: "Feu de camp", ic: "🔥", a: 0, t: "stat", r: ["assembler", { archet: 1, bois: 25, caillou: 15 }, 1],
    e: { st: [{ g: "chauffer", heat: 600 }] }, u: "Ouvre le geste Chauffer, jusqu’à 600 °C.", d: "Le premier feu que tu allumes toi-même.",
    h: "La braise prend dans les brindilles sèches, à l’abri d’un cercle de pierres." };
  I.charbon = { n: "Charbon", sym: "⬢", col: "#2b2b2b", a: 0, t: "res", r: ["chauffer", { bois: 4 }, 1, { heat: 600 }],
    u: "Sert dans la torche, le four en argile et la fonte des métaux.", d: "Du bois cuit sans flamme. Il brûle bien plus chaud que le bois.",
    h: "Le bois noirci sous la cendre brûle avec une chaleur bien plus dense." };
  I.epieu = { n: "Épieu durci", ic: "🗡️", a: 0, t: "tool", r: ["chauffer", { manche: 2 }, 1, { heat: 600 }],
    e: { zone: "plaine" }, u: "Ouvre le chemin vers la Plaine des Hautes Herbes.", d: "Une pointe passée au feu, dure comme de l’os. Avec ça en main, tu oses t’avancer dans la plaine.",
    h: "La cendre chaude a durci la pointe de cette branche." };
  I.cabane = { n: "Cabane de cueillette", sn: "cabane", pl: "cabanes", ic: "🛖", a: 0, t: "ext", z: "lisiere", s: 1.2, ruine: "Cabane effondrée",
    r: ["assembler", { manche: 5, corde: 4, fibre: 15 }, 1], p: { bois: 0.4, fibre: 0.4, caillou: 0.2 },
    u: "Pose-la sur un gisement de la Lisière : elle récolte à ta place.", d: "Un abri de branches où s’entasse ta cueillette. Le soir, des Lucioles tournent autour.",
    h: "Quelques perches liées en cône et garnies de feuillage coupent le vent de la nuit." };
  I.torche = { n: "Torche", ic: "🕯️", a: 0, t: "comp", r: ["assembler", { manche: 1, fibre: 2, charbon: 1 }, 1],
    u: "Pour explorer les lieux sombres, comme la Grotte aux Mains ou le Tumulus.", d: "Une flamme que tu peux emporter là où il fait noir.",
    h: "Une mèche d’herbe enduite de braise noire au bout d’un piquet éclaire la marche." };
  I.gants = { n: "Gants de peau", ic: "🧤", a: 4, t: "comp", r: ["assembler", { cuir: 2, fibre: 4 }, 1],
    u: "Aux mains, ils protègent du verre du Désert : sans eux, la récolte à la main rapporte moins là-bas.", d: "Deux peaux cousues à la forme de tes mains.",
    h: "Une double épaisseur de cuir cousue sur les paumes évite les brûlures à la forge." };
  I.masque = { n: "Masque filtrant", ic: "😷", a: 11, t: "comp", r: ["assembler", { caoutchouc: 2, plastique: 1 }, 1],
    u: "Sur le visage, il retient les vapeurs du Gisement Noir : sans lui, la récolte à la main rapporte moins là-bas.", d: "Une coque de plastique, un joint de caoutchouc.",
    h: "Une cartouche de charbon actif sur un masque en caoutchouc protège des vapeurs chimiques." };
  I.bouteille = { n: "Bouteille d’air", ic: "💨", a: 11, t: "comp", r: ["assembler", { aluminium: 2, caoutchouc: 1 }, 1],
    u: "Elle te donne de quoi respirer là-haut : sans elle, la récolte à la main rapporte moins aux Pics Fracturés.", d: "Un cylindre d’aluminium, un tuyau de caoutchouc.",
    h: "Une bouteille d’acier forgé sous haute pression stocke l’air respirable pour les interventions." };
  I.galette = { n: "Herbes grillées", ic: "🌾", a: 0, t: "curio", sec: true, r: ["chauffer", { fibre: 5 }, 1, { heat: 600 }],
    e: { once: { intu: 2 } },
    d: "Ça sent bon. Tu en mâches une bouchée, puis tu t’arrêtes : tu n’as jamais eu faim. Ni soif, d’ailleurs." };

  /* Âge 1 — Os */
  I.os = { n: "Os", ic: "🦴", a: 1, t: "res", u: "Sert dans l’aiguille, la colle d’os, le pic, les collets et le couteau.", d: "Les bêtes de la plaine laissent derrière elles des os solides." };
  I.cuir = { n: "Peau", ic: "🦌", a: 1, t: "res", u: "Sert dans les lanières, la fronde, l’outre et la tunique.", d: "Une peau séchée au soleil. Elle plie sans se déchirer." };
  I.aiguille = { n: "Aiguille en os", ic: "🪡", a: 1, t: "comp", r: ["tailler", { os: 2 }, 2],
    u: "Sert à coudre : outre, tunique.", d: "Un éclat d’os affiné, percé d’un chas.", h: "Une esquille d’os percée d’un trou fin guide le fil à travers les peaux." };
  I.laniere = { n: "Lanières", sym: "≈", col: "#9a6a42", a: 1, t: "comp", r: ["tailler", { cuir: 1 }, 2],
    u: "Sert à lier : fronde, outre, pic en os, haches.", d: "Des bandes de peau qui serrent plus fort en séchant.", h: "La peau découpée en rubans étroits fait des attaches très résistantes." };
  I.colle_os = { n: "Colle d’os", sym: "≋", col: "#d8c9a0", a: 1, t: "comp", r: ["chauffer", { os: 3 }, 2, { heat: 600 }],
    u: "Sert dans l’arc de chasse et la lampe de cuivre.", d: "Une pâte poisseuse qui durcit en séchant.", h: "Le jus d’os réduit sur le feu durcit en séchant et colle le bois." };
  I.arc = { n: "Arc de chasse", ic: "🎯", a: 1, t: "tool", r: ["assembler", { manche: 3, corde: 4, colle_os: 4 }, 1],
    e: { tap: { plaine: 2 } }, u: "Double ta récolte à la main dans la Plaine.", d: "Plus besoin d’approcher les bêtes.", h: "Un bois souple bandé par un lien solide envoie une flèche à distance." };
  I.fronde = { n: "Fronde", ic: "🪃", a: 1, t: "tool", r: ["tresser", { laniere: 4, cuir: 4 }, 1],
    e: { tap: { plaine: 2 } }, u: "Double ta récolte à la main dans la Plaine.", d: "Un caillou bien lancé vaut mieux qu’une longue course.",
    h: "Une poche de cuir tenue par deux lanières propulse les cailloux au loin." };
  I.outre = { n: "Outre en peau", ic: "👝", a: 1, t: "tool", r: ["assembler", { cuir: 8, laniere: 6, aiguille: 2 }, 1],
    e: { zone: "riviere" }, u: "Ouvre le chemin vers la Rivière.", d: "De l’eau pour la route. La rivière n’est plus si loin.",
    h: "Une peau cousue au point serré retient l’eau pour la traversée de la plaine." };
  I.pic_os = { n: "Pic en os", ic: "⛏️", a: 1, t: "tool", r: ["assembler", { manche: 1, os: 10, laniere: 4 }, 1],
    e: { tap: { caillou: 2 } }, u: "Double ta récolte de pierre à la main.", d: "Une pointe d’os emmanchée. La pierre cède plus vite.",
    h: "Un éclat d’os épais attaché au bout d’une perche fouille la terre dure sans casser." };
  I.collets = { n: "Collets", sn: "collet", pl: "collets", ic: "🪤", a: 1, t: "ext", z: "plaine", s: 1.2,
    r: ["assembler", { corde: 6, manche: 4, os: 8 }, 1], p: { os: 0.3, cuir: 0.25 },
    u: "Pose-les sur un gisement de la Plaine : ils récoltent des os et des peaux à ta place.", d: "Des pièges discrets. Quand tu repasses, il y a souvent quelque chose dedans.",
    h: "Une boucle de corde dissimulée près d’un os piège le gibier au passage." };
  I.tunique = { n: "Tunique de peau", ic: "🧥", a: 1, t: "tool", r: ["assembler", { cuir: 15, aiguille: 4, fibre: 20 }, 1],
    e: { tap: { "*": 1.5 } }, u: "Augmente ta récolte à la main de 50 %, dans toutes les terres.", d: "Au chaud, tu travailles plus longtemps et plus vite.",
    h: "Des peaux assemblées à l’aiguille protègent des herbes coupantes." };
  I.flute = { n: "Flûte en os", ic: "🎵", a: 1, t: "curio", sec: true, r: ["tailler", { os: 3, aiguille: 1 }, 1],
    e: { flute: true },
    u: "Se joue depuis le Journal.", d: "Un os creux percé de cinq trous. Le premier son qui en sort, tu l’as déjà entendu quelque part." };
  I.statuette = { n: "Figurine d’os", ic: "🗿", a: 1, t: "curio", sec: true, r: ["tailler", { os: 1, silex: 1 }, 1],
    e: { once: { intu: 3 } },
    d: "Tu sculptes une femme aux cheveux courts, une main levée, paume ouverte. Tu ne reconnais pas son visage, mais tu n’as pas eu besoin de modèle." };

  /* Âge 2 — Pierre */
  I.argile = { n: "Argile", ic: "🟫", a: 2, t: "res", u: "Sert aux briques et au four en argile, puis au creuset.", d: "Une terre grasse et collante, qui garde la forme qu’on lui donne." };
  I.silex = { n: "Silex", sym: "◆", col: "#3d4452", a: 2, t: "res", u: "Sert à tailler des éclats de silex.", d: "Une pierre noire, vitreuse, qui casse en arêtes vives." };
  I.sable = { n: "Sable", sym: "∴", col: "#c9b27a", a: 2, t: "res", u: "Sert au verre et aux briques réfractaires.", d: "Des milliards de grains. Il cache bien des choses." };
  I.eclat = { n: "Éclat de silex", sym: "✦", col: "#5b6b8c", a: 2, t: "comp", r: ["tailler", { silex: 2 }, 1],
    u: "Sert dans les rouages de bois, la hache, le couteau et la hutte.", d: "Un coup sec, au bon angle, et la pierre se fend. Le bord coupe mieux que tout ce que tu as eu en main.",
    h: "Un coup sec sur la tranche du silex détache une arête tranchante." };
  I.engrenage_bois = { n: "Rouage de bois", sym: "⚙", col: "#9a6b3c", a: 2, t: "comp", r: ["tailler", { manche: 2, eclat: 1 }, 2],
    u: "Sert dans l’automate de bois.", d: "Une petite roue dentée, taillée dans un bâton.", h: "Des crans réguliers taillés sur un disque de bois transmettent le mouvement d’un axe à l’autre." };
  I.automate_bois = { n: "Automate de bois", sn: "automate de bois", pl: "automates de bois", ic: "🪆", a: 2, t: "mach", s: 1.25, spd: 6, ing: 1, prof: 0, ruine: "Automate rouillé", r: ["assembler", { engrenage_bois: 6, corde: 10, caillou: 40 }, 1],
    u: "Mécanisme. Aide tes commandes sur les recettes à une seule ressource, une fois que tu les as fabriquées à la main.", d: "Il grince à chaque mouvement, mais il ne s’arrête jamais.",
    h: "Le contrepoids d’un bloc de pierre qui descend lentement entraîne une série d’engrenages." };
  I.hache_pierre = { n: "Hache de pierre", ic: "🪓", a: 2, t: "tool", r: ["assembler", { manche: 2, eclat: 4, laniere: 4 }, 1],
    e: { tap: { bois: 3, fibre: 2 } }, u: "Triple ta récolte de bois à la main et double celle de fibres. Pour explorer la Carcasse, à la Rivière.", d: "Les petits arbres tombent en quelques coups.",
    h: "Une arête de pierre ligaturée dans une fente de bois coupe les troncs." };
  I.couteau = { n: "Couteau de silex", ic: "🔪", a: 2, t: "tool", r: ["assembler", { eclat: 2, os: 6 }, 1],
    e: { tap: { plaine: 2 } }, u: "Double ta récolte à la main dans la Plaine.", d: "Une lame assez fine pour dépecer proprement.",
    h: "Un éclat de silex emmanché sur un os, pour trancher net sans s’entailler les doigts." };
  I.pioche_pierre = { n: "Pioche de pierre", ic: "⛏️", a: 2, t: "tool", r: ["assembler", { manche: 3, caillou: 40, corde: 6 }, 1],
    e: { zone: "collines", tap: { caillou: 2 } }, u: "Ouvre le chemin vers les Collines et double ta récolte de pierre à la main.", d: "Assez lourde pour entamer les collines et leurs veines colorées.",
    h: "Une pierre lourde fixée sur un long manche entame les bancs rocheux." };
  I.brique = { n: "Brique", ic: "🧱", a: 2, t: "comp", r: ["chauffer", { argile: 2 }, 1, { heat: 600 }],
    u: "Sert au four en argile, aux nasses et au bas-fourneau.", d: "De la boue cuite, dure comme de la pierre.", h: "L’argile cuite au foyer résiste à l’eau de pluie." };
  I.four = { n: "Four en argile", ic: "🏺", a: 2, t: "stat", r: ["assembler", { brique: 30, argile: 20, charbon: 10 }, 1],
    e: { st: [{ g: "chauffer", heat: 1100 }] }, u: "Chauffer monte jusqu’à 1 100 °C : métaux et briques.", d: "Une chambre de briques qui garde la chaleur toute la nuit.",
    h: "Un dôme de briques scellé de terre garde la chaleur du charbon toute la nuit." };
  I.nasse = { n: "Nasses et claies", sn: "nasse", pl: "nasses", ic: "🪣", a: 2, t: "ext", z: "riviere", s: 1.2,
    r: ["assembler", { manche: 8, corde: 6, brique: 4 }, 1], p: { argile: 0.3, silex: 0.2, sable: 0.3 },
    u: "Pose-les sur un gisement de la Rivière : elles récoltent argile, silex et sable à ta place.", d: "Des barrages de branches qui retiennent ce que la rivière charrie.",
    h: "Des parois de perches et de briques maintiennent la berge pour prélever la glaise." };
  I.hutte = { n: "Hutte de bûcheron", sn: "hutte", pl: "huttes", ic: "🏚️", a: 2, t: "ext", z: "lisiere", s: 1.2,
    r: ["assembler", { manche: 15, eclat: 6, corde: 10 }, 1], p: { bois: 1.2, fibre: 0.8, caillou: 0.6 },
    u: "Pose-la sur un gisement de la Lisière : elle récolte à ta place, plus vite qu’une cabane.", d: "Un abri solide, des lames de pierre à portée de main.",
    h: "Des perches robustes entaillées et chevillées abritent l’atelier de coupe." };
  I.cerf_volant = { n: "Cerf-volant", ic: "🪁", a: 2, t: "curio", sec: true, r: ["tresser", { fibre: 6, manche: 2, cuir: 1 }, 1],
    e: { once: { intu: 2 } },
    u: "Ouvre une exploration à la Lisière.", d: "Le vent l’emporte haut. En le suivant des yeux, tu remarques sous les arbres de la lisière un cercle parfait de pierres levées." };

  /* Âge 3 — Cuivre */
  I.malachite = { n: "Malachite", sym: "❖", col: "#2f8f5b", a: 3, t: "res", u: "Sert à fabriquer les lingots de cuivre.", d: "Une pierre verte et veinée, lourde pour sa taille. Il y a du métal là-dedans." };
  I.cassiterite = { n: "Cassitérite", sym: "▲", col: "#4b4b54", a: 3, t: "res", u: "Sert à fabriquer les lingots d’étain.", d: "Des cristaux sombres et lourds." };
  I.lingot_cuivre = { n: "Lingot de cuivre", sym: "Cu", col: "#c7713b", a: 3, t: "comp",
    r: ["chauffer", { malachite: 3, charbon: 1 }, 1, { heat: 1100 }],
    u: "Sert aux plaques de cuivre, au ciseau et au bronze.", d: "Ton premier métal, rouge et souple.",
    h: "Tu as remarqué la couleur de la roche verte après un feu de forêt ?" };
  I.enclume_pierre = { n: "Enclume de pierre", ic: "⚒️", a: 3, t: "stat", r: ["tailler", { caillou: 120 }, 1],
    e: { st: [{ g: "marteler", lvl: 1 }] }, u: "Ouvre le geste Marteler.", d: "Un bloc plat et dur, pour battre les métaux tendres.",
    h: "Un gros bloc de basalte aplani au percuteur encaisse les frappes répétées." };
  I.plaque_cuivre = { n: "Plaque de cuivre", sym: "▤", col: "#c7713b", a: 3, t: "comp", r: ["marteler", { lingot_cuivre: 1 }, 2],
    u: "Sert au fil de cuivre, au puits de mine et à la lampe.", d: "Du cuivre battu en feuille.", h: "Le cuivre rouge se laisse aplatir sous les coups de marteau." };
  I.fil_cuivre = { n: "Fil de cuivre", sym: "〰", col: "#c7713b", a: 3, t: "comp", r: ["tailler", { plaque_cuivre: 1 }, 3],
    u: "Sert au ressort de bronze, puis à tout ce qui touche à l’électricité.", d: "Fin et souple. Il conduit quelque chose, mais tu ne sais pas encore quoi.",
    h: "Des bandes étroites découpées dans une feuille de cuivre se roulent en liens souples." };
  I.lingot_etain = { n: "Lingot d’étain", sym: "Sn", col: "#a6a8ae", a: 3, t: "comp",
    r: ["chauffer", { cassiterite: 3, charbon: 1 }, 1, { heat: 1100 }],
    u: "Sert à fabriquer le bronze, avec le cuivre.", d: "Un métal gris et mou, qui crie quand on le plie.", h: "Ces galets noirs et pesants fondent vite sur la braise en un métal blanc." };
  I.creuset = { n: "Creuset", ic: "⚗️", a: 3, t: "stat", r: ["chauffer", { argile: 20, os: 15 }, 1, { heat: 1100 }],
    e: { st: [{ g: "allier" }] }, u: "Ouvre le geste Allier.", d: "Un pot réfractaire où les métaux fondent ensemble.",
    h: "La terre mélangée à de la poudre d’os cuite retient le métal en fusion." };
  I.puits = { n: "Puits de mine", sn: "puits", pl: "puits", ic: "🕳️", a: 3, t: "ext", z: "collines", s: 1.2,
    r: ["assembler", { manche: 20, corde: 12, plaque_cuivre: 6 }, 1], p: { malachite: 0.4, cassiterite: 0.2 },
    u: "Pose-le sur un gisement des Collines : il récolte la malachite ou la cassitérite à ta place.", d: "Un trou étayé, une poulie, des seaux cerclés de métal.",
    h: "Un conduit étayé de rondins pour piquer droit sur la veine de roche verte." };
  I.charbonniere = { n: "Meule de charbonnier", sn: "meule", pl: "meules", ic: "🌫️", a: 3, t: "ext", z: "lisiere", s: 1.2,
    r: ["assembler", { bois: 120, argile: 30, manche: 10 }, 1], p: { charbon: 0.3 },
    u: "Pose-la sur le gisement de charbon de la Lisière : elle le récolte à ta place.", d: "Une butte de terre qui fume pendant des jours. Dessous, le bois devient charbon.",
    h: "Une meule de bûches couverte de terre cuit le bois à l’étouffée." };
  I.ciseau = { n: "Ciseau de cuivre", ic: "🪛", a: 3, t: "tool", r: ["assembler", { lingot_cuivre: 6, manche: 3 }, 1],
    e: { tap: { collines: 2 } }, u: "Double ta récolte à la main dans les Collines.", d: "Un coin de métal pour fendre la roche le long de ses veines.",
    h: "Un coin de cuivre affûté entaille la pierre sans voler en éclats." };
  I.lampe = { n: "Lampe de cuivre", ic: "🪔", a: 3, t: "upg", r: ["assembler", { plaque_cuivre: 6, colle_os: 6, fibre: 20 }, 1],
    e: { exp: 1.25 }, u: "Tes explorations vont 1,25 fois plus vite.", d: "Une mèche de fibres brûle au creux d’une coupelle de cuivre.",
    h: "Une coupelle de métal clair garnie d’huile et d’une mèche éclaire le fond des galeries." };
  I.miroir = { n: "Miroir de cuivre", ic: "🪞", a: 3, t: "curio", sec: true, r: ["tailler", { plaque_cuivre: 1, sable: 3 }, 1],
    e: { once: { intu: 3 } },
    d: "Tu polis le métal au sable jusqu’à t’y voir. Pour la première fois, tu découvres ton visage. Dans ton iris gauche, en lettres minuscules, quelqu’un a gravé : « S-{iris} »." };

  /* Âge 4 — Bronze */
  I.lingot_bronze = { n: "Lingot de bronze", sym: "Bz", col: "#c8963e", a: 4, t: "comp",
    r: ["allier", { lingot_cuivre: 3, lingot_etain: 1 }, 4, { heat: 1100 }],
    u: "Sert aux plaques et aux ressorts de bronze, à la pioche et à l’enclume de bronze.", d: "Plus dur que chacun de ses parents.", h: "En fondant ensemble un peu d’étain blanc avec le cuivre rouge, la coulée donne un métal doré bien plus dur." };
  I.plaque_bronze = { n: "Plaque de bronze", sym: "▤", col: "#c8963e", a: 4, t: "comp", r: ["marteler", { lingot_bronze: 1 }, 2],
    u: "Sert dans presque tout ce qui est en bronze : engrenages, roues, outils, chariot, automate.", d: "Une feuille dorée qui sonne quand on la frappe.", h: "Ce bronze chauffé s’aplatit sous la masse sans se fendre." };
  I.engrenage = { n: "Engrenage de bronze", sym: "⚙", col: "#c8963e", a: 4, t: "comp", r: ["tailler", { plaque_bronze: 1 }, 2],
    u: "Sert à l’automate de bronze, au moulin à eau et aux courroies.", d: "Une roue qui en fait tourner une autre.", h: "Des dents régulières taillées sur une couronne de bronze transmettent la force sans glisser." };
  I.ressort = { n: "Ressort de bronze", sym: "⌇", col: "#c8963e", a: 4, t: "comp", r: ["marteler", { lingot_bronze: 1, fil_cuivre: 2 }, 2],
    u: "Sert à fabriquer l’automate de bronze.", d: "Il veut toujours revenir à sa forme.", h: "Une bande de bronze enroulée en spirale restitue l’effort quand on la relâche." };
  I.automate_bronze = { n: "Automate de bronze", sn: "automate de bronze", pl: "automates de bronze", ic: "🦿", a: 4, t: "mach", s: 1.25, spd: 15, ing: 2, prof: 0, r: ["assembler", { engrenage: 15, ressort: 8, plaque_bronze: 10 }, 1],
    u: "Mécanisme. Aide tes commandes sur les recettes à deux ressources au plus, une fois que tu les as fabriquées à la main. 15 fabrications par minute.", d: "Engrenages, ressorts, corps de bronze. Il ne se fatigue jamais.",
    h: "Un jeu d’engrenages et de ressorts enfermés dans un bâti répète son cycle tout seul." };
  I.hache_bronze = { n: "Hache de bronze", ic: "🪓", a: 4, t: "tool", r: ["assembler", { manche: 4, plaque_bronze: 10, laniere: 9 }, 1],
    e: { tap: { lisiere: 2 } }, u: "Double ta récolte à la main dans la Lisière.", d: "Un tranchant qui ne s’émousse presque plus.",
    h: "Un tranchant de bronze emmanché abat les arbres deux fois plus vite que la pierre." };
  I.pioche_bronze = { n: "Pioche de bronze", ic: "⛏️", a: 4, t: "tool", r: ["assembler", { manche: 6, lingot_bronze: 25, corde: 10 }, 1],
    e: { zone: "mine", tap: { collines: 2 } }, u: "Ouvre le chemin vers les Profondeurs. Double ta récolte à la main dans les Collines.", d: "Le bronze s’enfonce dans la roche là où la pierre rebondissait.",
    h: "Une pointe coulée dans le bronze entame les roches les plus dures sans s’émousser." };
  I.enclume_bronze = { n: "Enclume de bronze", ic: "⚒️", a: 4, t: "stat", r: ["assembler", { lingot_bronze: 45, caillou: 220 }, 1],
    e: { st: [{ g: "marteler", lvl: 2 }] }, u: "Marteler passe au niveau 2, pour battre le fer.", d: "Assez dure pour battre les métaux durs.",
    h: "Une masse de bronze calée sur un billot renvoie le choc du marteau." };
  I.roue = { n: "Roue cerclée", ic: "🛞", a: 4, t: "comp", r: ["assembler", { manche: 4, plaque_bronze: 1 }, 1],
    u: "Sert au chariot, au moulin à eau, aux brouettes et aux courroies.", d: "Des rayons de bois, un cercle de métal.", h: "Une jante de bronze cerclée sur des rayons de bois roule sur les cailloux sans casser." };
  I.chariot = { n: "Chariot", ic: "🐂", a: 5, t: "tool", r: ["assembler", { roue: 6, plaque_bronze: 20, corde: 30 }, 1],
    e: { auto: { "*": 1.25 } }, u: "Tous tes extracteurs récoltent 1,25 fois plus.", d: "Tu peux enfin emporter tes outils plus loin que le camp.",
    h: "Deux essieux de bronze sous de fortes planches : attelé à une bête, ça roule sans casser sous les grosses charges." };
  I.soufflet = { n: "Soufflet", ic: "🪗", a: 4, t: "comp", r: ["assembler", { cuir: 20, manche: 4, plaque_bronze: 3 }, 1],
    u: "Sert au bas-fourneau, puis au haut-fourneau.", d: "Une poche de peau entre deux planches : elle souffle sur la braise.",
    h: "Deux battants de bois articulés sur une poche de cuir envoient de l’air au cœur du foyer." };
  I.moulin = { n: "Moulin à eau", ic: "🎡", a: 4, t: "upg", r: ["assembler", { engrenage: 30, roue: 6, manche: 45 }, 1],
    e: { auto: { lisiere: 1.5, riviere: 1.5 } }, u: "Tes extracteurs de la Lisière et de la Rivière récoltent 1,5 fois plus.", d: "La rivière fait tourner la roue, jour et nuit.",
    h: "Le courant de la rivière fait tourner une roue à aubes qui entraîne les meules." };
  I.courroies = { n: "Courroies de cuir", ic: "➰", a: 4, t: "upg", r: ["assembler", { laniere: 40, roue: 6, engrenage: 10 }, 1],
    e: { aspd: 1.25 }, u: "Tes machines fabriquent 1,25 fois plus vite.", d: "Des boucles de cuir tendues d’une roue à l’autre, jusqu’à tes automates.",
    h: "Des bandes de cuir tendues d’un axe à l’autre déplacent le mouvement dans l’atelier." };
  I.brouette = { n: "Brouettes", ic: "🛒", a: 4, t: "upg", r: ["assembler", { roue: 3, manche: 15, plaque_bronze: 6 }, 1],
    e: { auto: { lisiere: 1.25, riviere: 1.25, collines: 1.25 } }, u: "Tes extracteurs de la Lisière, de la Rivière et des Collines récoltent 1,25 fois plus.", d: "Une caisse posée sur une roue : chaque voyage rapporte plus.",
    h: "Une roue calée sous une caisse de bois allège la charge des bras." };
  I.tamis = { n: "Tamis", sn: "tamis", pl: "tamis", ic: "🕸️", a: 5, t: "ext", z: "desert", s: 1.22,
    r: ["assembler", { manche: 30, plaque_bronze: 9, corde: 20 }, 1], p: { quartz: 0.25, sable: 0.5 },
    u: "Pose-le sur un gisement de quartz : il le récolte à ta place.", d: "Un grand cadre qui trie le sable des cristaux.", h: "Une grille de fils de bronze retient les éclats de quartz et laisse filer le sable." };
  I.anticythere = { n: "Mécanisme d’Anticythère", ic: "🕰️", a: 4, t: "curio", sec: true,
    r: ["assembler", { engrenage: 20, plaque_bronze: 4, tablette: 1 }, 1], e: { intu: 1, sky: true },
    u: "Rapporte 1 ✨ par minute. Ouvre le Ciel, dans le Cosmos.", d: "Des dizaines de roues dentées qui calculent le ciel. Deux aiguilles. L’une suit une étoile marquée d’un nom : Kher. L’autre suit une lueur qui n’est sur aucun cercle." };
  I.cloche = { n: "Cloche", ic: "🔔", a: 4, t: "curio", sec: true, r: ["chauffer", { lingot_bronze: 10, argile: 6 }, 1, { heat: 1100 }],
    u: "Sonne dans le lointain.", d: "Tu la fais tinter du bout de l’ongle. Le son reste longtemps dans l’air, comme s’il cherchait quelqu’un." };

  /* Âge 5 — Fer */
  I.fer_min = { n: "Minerai de fer", sym: "◣", col: "#8e3b2c", a: 5, t: "res", u: "Sert à fabriquer la loupe de fer, d’où l’on tire le fer.", d: "Une roche rouge sang, lourde de métal." };
  I.bas_fourneau = { n: "Bas-fourneau", ic: "🌋", a: 5, t: "stat", r: ["assembler", { brique: 130, soufflet: 3, argile: 95 }, 1],
    e: { st: [{ g: "chauffer", heat: 1300 }] }, u: "Chauffer monte jusqu’à 1 300 °C : fer, verre.", d: "Une cheminée de terre où le soufflet fait rugir la braise.",
    h: "Une haute cheminée de briques attisée par le souffle continu des soufflets fait fondre la roche rouge." };
  I.loupe = { n: "Loupe de fer", sym: "◍", col: "#6e4f42", a: 5, t: "comp", r: ["chauffer", { fer_min: 3, charbon: 2 }, 1, { heat: 1300 }],
    u: "Sert à fabriquer le lingot de fer.", d: "Une éponge de fer pleine de scories. Il faut encore la battre.", h: "La roche rouillée cuite dans la fournaise s’agglomère en un bloc de fer spongieux." };
  I.lingot_fer = { n: "Lingot de fer", sym: "Fe", col: "#8b9099", a: 5, t: "comp", r: ["marteler", { loupe: 1 }, 1, { lvl: 2 }],
    u: "Sert aux plaques de fer, aux clous et aux outils de fer, puis à l’acier.", d: "Du fer forgé, gris et têtu.", h: "Battre le fer rouge sur l’enclume chasse la crasse et resserre le métal en un bloc solide." };
  I.plaque_fer = { n: "Plaque de fer", sym: "▤", col: "#8b9099", a: 5, t: "comp", r: ["marteler", { lingot_fer: 1 }, 2, { lvl: 2 }],
    u: "Sert à la galerie étayée, puis à presque toutes les machines à vapeur.", d: "Une tôle épaisse.", h: "Le fer aplati en feuilles épaisses sert de blindage aux installations." };
  I.clous = { n: "Clous", ic: "🔩", a: 5, t: "comp", r: ["tailler", { lingot_fer: 1 }, 10],
    u: "Sert à la chaîne de fer, aux outils de fer, aux galeries et aux enclos.", d: "Il en faut toujours plus que prévu.", h: "Des pointes de fer à tête large solidarisent les charpentes d’un seul coup." };
  I.chainon = { n: "Chaîne de fer", sym: "⛓", col: "#8b9099", a: 5, t: "comp", r: ["marteler", { clous: 20 }, 1, { lvl: 2 }],
    u: "Sert à fabriquer le palan à chaîne.", d: "Des maillons de fer, solides et souples à la fois.", h: "Des maillons de fer chaud repliés les uns dans les autres forment un câble inusable." };
  I.outils_fer = { n: "Outils de fer", ic: "🧰", a: 5, t: "tool", r: ["assembler", { lingot_fer: 25, manche: 15, clous: 65 }, 1],
    e: { tap: { collines: 2, mine: 2, riviere: 2 } }, u: "Double ta récolte à la main dans la Rivière, les Collines et les Profondeurs.", d: "Marteau, hachette, burin, pelle.",
    h: "Des pinces et des marteaux forgés dans le fer améliorent tous les travaux d’atelier." };
  I.galerie = { n: "Galerie étayée", sn: "galerie", pl: "galeries", ic: "🚧", a: 5, t: "ext", z: "mine", s: 1.22,
    r: ["assembler", { manche: 50, clous: 65, plaque_fer: 10 }, 1], p: { fer_min: 0.4, charbon: 0.5 },
    u: "Pose-la sur un gisement des Profondeurs : elle récolte le minerai de fer ou le charbon à ta place.", d: "Des boisages cloués qui s’enfoncent dans la roche.", h: "Des madriers ceinturés de fer pour tenir la voûte : on peut creuser droit sous la montagne sans tout prendre sur la tête." };
  I.palan = { n: "Palan à chaîne", ic: "⛓️", a: 5, t: "upg", r: ["assembler", { chainon: 10, roue: 4, manche: 20 }, 1],
    e: { auto: { mine: 1.25, collines: 1.25 } }, u: "Tes extracteurs des Collines et des Profondeurs récoltent 1,25 fois plus.", d: "Les charges lourdes remontent toutes seules des galeries.",
    h: "Une chaîne passée dans un jeu de poulies démultiplie la force d’un bras." };
  I.enclos = { n: "Enclos d’élevage", sn: "enclos", pl: "enclos", ic: "🐐", a: 5, t: "ext", z: "plaine", s: 1.22,
    r: ["assembler", { clous: 95, bois: 320, corde: 50 }, 1], p: { os: 1.2, cuir: 1 },
    u: "Pose-le sur un gisement de la Plaine : il récolte les os ou les peaux à ta place.", d: "Plus besoin de chasser.", h: "Des clôtures serrées gardent le bétail rassemblé près du campement." };
  I.verre = { n: "Verre", sym: "◇", col: "#7fc9da", a: 5, t: "comp", r: ["chauffer", { sable: 4 }, 1, { heat: 1300 }],
    u: "Sert aux lentilles, puis au verre trempé et aux ampoules.", d: "Du sable, et tu vois au travers.", h: "La foudre a laissé des blocs transparents dans le sable de la plage." };
  I.poudre_quartz = { n: "Poudre de quartz", sym: "⋄", col: "#d9d4f0", a: 5, t: "comp", r: ["tailler", { quartz: 2 }, 4],
    u: "Sert à polir les lentilles et à renforcer les briques réfractaires.", d: "Un abrasif minéral fin, tiré des cristaux du Désert.",
    h: "Le quartz pilé très fin dans un mortier de fer donne une poudre blanche brillante." };
  I.lentille = { n: "Lentille", ic: "🔍", a: 5, t: "comp", r: ["tailler", { verre: 1, poudre_quartz: 1 }, 1],
    u: "Sert à la lunette astronomique, et bien plus tard au lithographe.", d: "Elle rapproche ce qui est loin.", h: "Un disque de verre frotté sur du sable fin prend une forme bombée qui grossit les détails." };
  I.lunette = { n: "Lunette astronomique", ic: "🔭", a: 5, t: "tool", r: ["assembler", { lentille: 3, plaque_bronze: 15 }, 1],
    e: { sky: true }, u: "Ouvre le Cosmos, la deuxième page du Journal.", d: "Pour regarder le ciel.",
    h: "Deux lentilles alignées dans un tube rapprochent les sommets lointains." };
  I.boussole = { n: "Boussole", ic: "🧭", a: 5, t: "curio", sec: true, r: ["assembler", { aiguille: 1, lingot_fer: 1, argile: 2 }, 1],
    e: { once: { intu: 2 } },
    u: "Ouvre une exploration dans les Profondeurs.", d: "L’aiguille ferrée flotte sur l’argile humide. Elle ne cherche pas le nord : elle penche vers le sol, vers les Profondeurs." };
  I.pigment = { n: "Pigment", ic: "🎨", a: 5, t: "curio", sec: true, r: ["tailler", { argile: 3, charbon: 2 }, 1],
    u: "Ouvre un geste à la Grotte aux Mains.", d: "De la terre de rivière et du noir de feu, écrasés ensemble. Tes doigts en restent marqués." };

  /* Âge 6 — Acier */
  I.brique_refr = { n: "Brique réfractaire", sym: "▦", col: "#b5532f", a: 5, t: "comp", r: ["chauffer", { argile: 2, sable: 1, poudre_quartz: 1 }, 1, { heat: 1100 }],
    u: "Sert au haut-fourneau et au four à arc.", d: "Elle ne craint plus aucune chaleur.", h: "L’argile mêlée de sable quartzeux encaisse des chaleurs qui feraient fondre la brique ordinaire." };
  I.haut_fourneau = { n: "Haut-fourneau", ic: "🏭", a: 6, t: "stat", r: ["assembler", { brique_refr: 220, plaque_fer: 70, soufflet: 7 }, 1],
    e: { st: [{ g: "chauffer", heat: 1700 }] }, u: "Chauffer monte jusqu’à 1 700 °C : assez pour l’acier.", d: "Une tour de feu cerclée de fer.",
    h: "Une tour de briques réfractaires alimentée en continu par le vent chaud produit du fer liquide." };
  I.lingot_acier = { n: "Lingot d’acier", sym: "Ac", col: "#9fb0c4", a: 6, t: "comp",
    r: ["allier", { lingot_fer: 2, charbon: 1 }, 2, { heat: 1700 }],
    u: "Sert dans l’acier trempé, les pistons, le moteur électrique et beaucoup de constructions : tour d’usinage, treuil, derrick…", d: "Du fer avec une pointe de carbone.", h: "Ce fer a traîné dans le charbon de forge, il a gardé de la souplesse." };
  I.bac_trempe = { n: "Bac de trempe", ic: "🛁", a: 6, t: "stat", r: ["assembler", { bois: 540, plaque_fer: 35, clous: 140 }, 1],
    e: { st: [{ g: "tremper" }] }, u: "Ouvre le geste Tremper.", d: "Un grand bac d’eau froide. Le métal brûlant y durcit d’un coup.",
    h: "Une cuve d’eau froide posée près de l’enclume saisit le métal au rouge." };
  I.acier_trempe = { n: "Acier trempé", sym: "Ac", col: "#5e86b8", a: 6, t: "comp", r: ["tremper", { lingot_acier: 1 }, 1],
    u: "Sert dans les engrenages d’acier, les roulements, les aimants, les outils d’acier, et dans beaucoup de constructions plus tard.", d: "Dur, et pourtant il plie sans casser.", h: "L’acier chauffé au rouge puis plongé d’un coup dans l’eau glacée ressort dur au point de rayer le fer." };
  I.lame = { n: "Lame trempée", sym: "⟋", col: "#5e86b8", a: 6, t: "comp", r: ["tremper", { plaque_fer: 2 }, 1],
    u: "Sert dans la scierie à vapeur et les outils d’acier.", d: "Son fil entame le bois d’un seul passage.", h: "Un tranchant d’acier affûté à l’eau tranche le cuir sans accroc." };
  I.verre_trempe = { n: "Verre trempé", sym: "◈", col: "#5ab8cf", a: 6, t: "comp", r: ["tremper", { verre: 2 }, 1],
    u: "Sert dans les cellules photovoltaïques, l’ordinateur et le réacteur chimique.", d: "Un verre qui ne se brise plus.", h: "Un coup d’air froid sur une plaque de verre brûlante la rend résistante aux chocs." };
  I.tour = { n: "Tour d’usinage", ic: "🗜️", a: 6, t: "stat", r: ["assembler", { lingot_acier: 55, engrenage: 70, manche: 35 }, 1],
    e: { st: [{ g: "usiner" }] }, u: "Ouvre le geste Usiner.", d: "Elle façonne le métal au dixième de millimètre.",
    h: "En faisant tourner la pièce contre un tranchant fixe, on tire des cylindres impeccables." };
  I.piston = { n: "Piston", sym: "▮", col: "#9fb0c4", a: 7, t: "comp", r: ["usiner", { lingot_acier: 2 }, 1],
    u: "Sert dans le moteur à vapeur.", d: "Il pousse, il tire, il recommence.", h: "La vapeur sous pression enfermée dans un cylindre étanche repousse un disque d’acier." };
  I.engrenage_acier = { n: "Engrenage d’acier", sym: "⚙", col: "#5e86b8", a: 6, t: "comp", r: ["usiner", { acier_trempe: 1 }, 2],
    u: "Sert dans le moteur à vapeur et la sonde pétrolière.", d: "Des dents qui ne cassent jamais.", h: "Des roues dentées taillées dans l’acier trempé encaissent l’effort des grosses machines sans s’user." };
  I.vis = { n: "Vis", sym: "⫶", col: "#9fb0c4", a: 6, t: "comp", r: ["usiner", { lingot_fer: 1 }, 8],
    u: "Sert dans les roulements à billes.", d: "Une hélice gravée dans le fer.", h: "Une tige filetée qui tourne dans un écrou maintient deux pièces avec un serrage puissant." };
  I.roulement = { n: "Roulement à billes", sym: "◉", col: "#9fb0c4", a: 6, t: "comp", r: ["usiner", { acier_trempe: 1, vis: 4 }, 2],
    u: "Sert dans la presse à vapeur.", d: "Il fait tourner les machines sans effort.", h: "Des billes d’acier logées entre deux anneaux tournent sans frottement ni échauffement." };
  I.chaudiere = { n: "Chaudière", ic: "♨️", a: 7, t: "comp", r: ["marteler", { plaque_fer: 8, clous: 30 }, 1, { lvl: 2 }],
    u: "Sert dans le moteur à vapeur.", d: "Un ventre de fer. L’eau y bout sous pression.", h: "Un réservoir d’eau en tôle rivetée placé sur le foyer accumule une vapeur brûlante." };
  I.moteur_vapeur = { n: "Moteur à vapeur", ic: "🚂", a: 7, t: "comp", r: ["assembler", { circuit_vapeur: 1, piston: 2, engrenage_acier: 4 }, 1],
    u: "Sert dans tout ce qui marche à la vapeur : presse, pompe, scierie, drague, treuil, chemin de fer. Et dans la dynamo.", d: "À chaque poussée du piston, les engrenages font un tour de plus.", h: "La bielle reliée au piston transforme la poussée de la vapeur en un mouvement rotatif continu." };
  I.presse_vapeur = { n: "Presse à vapeur", sn: "presse", pl: "presses", ic: "📠", a: 7, t: "mach", s: 1.25, spd: 40, ing: 3, prof: 0, r: ["assembler", { moteur_vapeur: 1, roulement: 8, plaque_fer: 20 }, 1],
    u: "Vapeur, 40 fabrications par minute. Aide tes commandes sur les recettes à trois ressources au plus, une fois que tu les as fabriquées à la main.", d: "Elle siffle et cogne toute la journée.",
    h: "Un vérin à vapeur applique une poussée de plusieurs tonnes sur les matrices de forge." };
  I.pompe = { n: "Pompe d’exhaure", ic: "⛽", a: 7, t: "upg", r: ["assembler", { moteur_vapeur: 4, plaque_fer: 55 }, 1],
    e: { auto: { mine: 1.5, collines: 1.5 } }, u: "Augmente de 50 % la récolte de tes extracteurs dans les Profondeurs et les Collines.", d: "Les galeries inondées se vident. Tu peux creuser plus profond.",
    h: "Un corps de pompe relié à la vapeur aspire l’eau accumulée au fond des puits de mine." };
  I.scierie = { n: "Scierie à vapeur", sn: "scierie", pl: "scieries", ic: "🪚", a: 7, t: "ext", z: "lisiere", s: 1.25,
    r: ["assembler", { moteur_vapeur: 2, lame: 7, bois: 360 }, 1], p: { bois: 3, fibre: 2, caillou: 2 },
    u: "Pose-la sur un gisement de la Lisière : elle récolte bois, fibres ou pierre à ta place.", d: "La forêt recule en hurlant.", h: "La vapeur entraîne un train de lames qui découpe les grumes de bois à la chaîne." };
  I.drague = { n: "Drague à vapeur", sn: "drague", pl: "dragues", ic: "⛴️", a: 7, t: "ext", z: "riviere", s: 1.25,
    r: ["assembler", { moteur_vapeur: 2, plaque_fer: 20, clous: 110 }, 1], p: { argile: 1.2, silex: 0.8, sable: 1.2 },
    u: "Pose-la sur un gisement de la Rivière : elle récolte argile, silex ou sable à ta place.", d: "Elle racle le lit de la rivière.", h: "Une chaîne de godets entraînée par la vapeur extrait le sable du fond du fleuve." };
  I.treuil = { n: "Treuil à vapeur", sn: "treuil", pl: "treuils", ic: "🪝", a: 7, t: "ext", z: "collines", s: 1.25,
    r: ["assembler", { moteur_vapeur: 2, corde: 70, lingot_acier: 20 }, 1], p: { malachite: 1.2, cassiterite: 0.6 },
    u: "Pose-le sur un gisement des Collines : il récolte malachite ou cassitérite à ta place.", d: "Les wagonnets remontent tout seuls.", h: "Un tambour d’acier enroule les câbles pour hisser les bennes chargées de minerai." };
  I.locomotive = { n: "Chemin de fer", ic: "🛤️", a: 7, t: "upg", r: ["assembler", { moteur_vapeur: 7, roue: 35, plaque_fer: 110 }, 1],
    e: { zone: "desert", auto: { "*": 1.5 } }, u: "Ouvre le chemin vers le Désert de Verre. Augmente de 50 % la récolte de tous tes extracteurs, dans toutes les terres.", d: "Des rails relient tous tes chantiers, jusqu’au désert.",
    h: "Une chaudière montée sur un châssis à essieux tire des convois lourds sur des rails d’acier." };
  I.outils_acier = { n: "Outils d’acier", ic: "🛠️", a: 6, t: "tool", r: ["assembler", { acier_trempe: 35, manche: 20, lame: 10 }, 1],
    e: { tap: { lisiere: 2, plaine: 2, mine: 2, desert: 2 } }, u: "Double ta récolte à la main dans la Lisière, la Plaine, les Profondeurs et le Désert.", d: "Des outils qui ne s’usent plus.", h: "Des ciseaux et mèches en acier trempé percent la roche et usinent le fer ordinaire." };

  /* Âge 7 — Vapeur : la chaudière, le piston, le moteur et ce qui en descend (presse, pompe, chemin de fer, extracteurs à vapeur)
   * sont rangés plus haut, avec l’acier dont ils sont faits ; voici ce que l’âge ajoute. */
  I.eau = { n: "Eau", sym: "≈", col: "#4c9ec4", a: 7, t: "res",
    u: "La pompe à bras la récolte à la Rivière. Sert dans le circuit de vapeur, les condenseurs et le refroidissement.", d: "Sous le tuyau de la pompe, un réservoir se remplit sans déborder." };
  I.tuyau_cuivre = { n: "Tuyau de cuivre", sym: "⊏", col: "#c7713b", a: 7, t: "comp", r: ["usiner", { plaque_cuivre: 2 }, 3],
    u: "Sert dans le circuit de vapeur, les condenseurs et les échangeurs thermiques.", d: "Un tube coudé qui se glisse entre les pièces du moteur.", h: "Le tube de cuivre étiré sans soudure conduit la vapeur sous pression sans risque de fuite." };
  I.circuit_vapeur = { n: "Circuit de vapeur", sym: "♨", col: "#90aab8", a: 7, t: "comp", r: ["assembler", { chaudiere: 1, tuyau_cuivre: 3, eau: 12 }, 1],
    u: "Sert dans le moteur à vapeur.", d: "L’eau bout dans la chaudière ; les tuyaux sifflent quand la pression monte.", h: "Un réseau de canalisations distribue la pression de la chaudière à toutes les machines de l’atelier." };
  I.condenseur = { n: "Condenseur", sym: "▤", col: "#70a4b5", a: 7, t: "comp", r: ["assembler", { tuyau_cuivre: 6, eau: 24, plaque_fer: 8 }, 1],
    u: "Sert dans la récupération de vapeur.", d: "Le tuyau serpente dans une cuve froide. À la sortie, la vapeur est redevenue de l’eau.", h: "Faire passer la vapeur dans un serpentin refroidi à l’eau la retransforme en liquide." };
  I.recuperation_vapeur = { n: "Récupération de vapeur", ic: "♨️", a: 7, t: "upg", r: ["assembler", { condenseur: 4, moteur_vapeur: 2, regulateur: 2 }, 1],
    e: { aspd: 1.25 }, u: "Augmente de 25 % la vitesse de toutes tes machines.", d: "Des conduites ramènent l’eau encore chaude vers les chaudières.", h: "Réinjecter l’eau condensée dans la chaudière réduit la consommation d’eau et de charbon." };
  I.soupape = { n: "Soupape de sûreté", sym: "◍", col: "#b9c2cc", a: 7, t: "comp", r: ["usiner", { ressort: 2, vis: 4 }, 1],
    u: "Sert dans le régulateur et dans la chaudière tubulaire.", d: "Elle s’ouvre toute seule quand la pression devient dangereuse.",
    h: "Un clapet maintenu par un ressort calibré évacue l’excès de vapeur avant la rupture de la cuve." };
  I.manometre = { n: "Manomètre", sym: "◔", col: "#d9c9a8", a: 7, t: "comp", r: ["assembler", { verre_trempe: 1, ressort: 1, plaque_cuivre: 2 }, 1],
    u: "Sert dans la chaudière tubulaire.", d: "Une aiguille qui dit la pression, sans avoir à deviner.",
    h: "Un tube métallique sensible à la déformation indique le niveau de pression dans la tuyauterie." };
  I.regulateur = { n: "Régulateur à boules", sym: "⚖", col: "#c7a76a", a: 7, t: "comp", r: ["assembler", { engrenage_acier: 2, ressort: 3, soupape: 1 }, 1],
    u: "Sert dans le marteau-pilon.", d: "Deux boules tournent plus vite quand le moteur s’emballe, et ferment l’arrivée de vapeur.",
    h: "Deux masselottes écartées par la rotation ferment l’arrivée de vapeur dès que le moteur s’emballe." };
  I.chaudiere_tubulaire = { n: "Chaudière tubulaire", ic: "🔥", a: 7, t: "upg", r: ["assembler", { chaudiere: 6, soupape: 4, manometre: 2 }, 1],
    e: { auto: { "*": 1.25 } }, u: "Augmente de 25 % la récolte de tous tes extracteurs, dans toutes les terres.", d: "Plus de surface de chauffe, donc plus de vapeur pour le même feu.",
    h: "Des dizaines de tubes de flamme traversant le réservoir d’eau augmentent le rendement de la chaudière." };
  I.marteau_pilon = { n: "Marteau-pilon", ic: "🔨", a: 7, t: "tool", r: ["assembler", { moteur_vapeur: 2, lame: 12, regulateur: 1 }, 1],
    e: { tap: { riviere: 2, collines: 2 } }, u: "Double ta récolte à la main dans la Rivière et les Collines.", d: "Un bloc d’acier tombe de haut, à intervalle régulier. Rien ne lui résiste.",
    h: "Une masse de forge de plusieurs tonnes levée par la vapeur retombe à volonté sur l’enclume." };

  /* Âge 8 — Électricité */
  I.bobine = { n: "Bobine de cuivre", sym: "◎", col: "#c7713b", a: 8, t: "comp", r: ["usiner", { fil_cuivre: 6 }, 1],
    u: "Sert dans les aimants, la dynamo, le moteur électrique, le poste radio et le radiotélescope.", d: "Des kilomètres de fil, enroulés spire contre spire.", h: "Le fil de cuivre enroulé en spires serrées autour d’un axe canalise le champ magnétique." };
  I.aimant = { n: "Aimant", ic: "🧲", a: 8, t: "comp", r: ["assembler", { acier_trempe: 2, bobine: 1 }, 1],
    u: "Sert dans la dynamo, le télégraphe et le moteur électrique.", d: "Il attire le fer. Tu passes un moment à jouer avec des clous.", h: "Le clou d’acier est resté collé à la génératrice et maintenant il attire la limaille." };
  I.dynamo = { n: "Dynamo", ic: "🔌", a: 8, t: "stat", r: ["assembler", { aimant: 10, bobine: 20, moteur_vapeur: 4 }, 1],
    e: { st: [{ g: "electriser", lvl: 1 }] }, u: "Ouvre le geste Électriser.", d: "La vapeur fait tourner des aimants dans des bobines, et le courant passe.",
    h: "Faire tourner des bobines de cuivre entre deux aimants produit du courant continu." };
  I.cuivre_pur = { n: "Cuivre pur", sym: "Cu", col: "#ff9a5c", a: 8, t: "comp", r: ["electriser", { lingot_cuivre: 2 }, 2],
    u: "Sert dans le four à arc, le réseau électrique et les puces.", d: "Raffiné par le courant, pur à 99,99 %.", h: "Le passage d’un courant dans un bain d’électrolyte dépose du cuivre débarrassé de tout résidu." };
  I.batterie = { n: "Batterie", ic: "🔋", a: 8, t: "comp", r: ["electriser", { plaque_cuivre: 2, lingot_etain: 1 }, 1],
    u: "Sert dans le télégraphe, l’éclairage électrique, le poste radio, le four à arc et l’ordinateur.", d: "De l’électricité en boîte.", h: "Deux plaques de métaux différents trempées dans l’acide fournissent du courant à la demande." };
  I.ampoule = { n: "Ampoule", ic: "💡", a: 8, t: "comp", r: ["assembler", { verre: 1, fil_cuivre: 2 }, 1],
    u: "Sert dans l’éclairage électrique et le poste radio.", d: "Le premier soir, tu restes longtemps à la regarder briller.", h: "Un filament métallique très fin sous une cloche de verre vide d’air s’allume sans se consumer." };
  I.cable = { n: "Câble électrique", sym: "⌁", col: "#c7713b", a: 8, t: "comp", r: ["tresser", { fil_cuivre: 4 }, 1],
    u: "Sert dans le télégraphe et les capteurs de forage.", d: "Tu tresses comme au premier jour, mais avec du métal.", h: "Plusieurs brins de cuivre tressés et gainés transportent le courant sur de longues distances." };
  I.telegraphe = { n: "Télégraphe", ic: "📟", a: 8, t: "upg", r: ["assembler", { cable: 20, batterie: 6, aimant: 4 }, 1],
    e: { intu: 1 }, u: "Te rapporte 1 Intuition ✨ par minute.", d: "Tu tapes des messages dans le vide. Parfois, tu jurerais qu’on te répond.",
    h: "Des impulsions électriques envoyées dans un fil font claquer un récepteur à l’autre bout de la ligne." };
  I.eclairage = { n: "Éclairage électrique", ic: "🏮", a: 8, t: "upg", r: ["assembler", { ampoule: 100, fil_cuivre: 300, batterie: 30 }, 1],
    e: { auto: { mine: 1.5 }, exp: 1.5 }, u: "Augmente de 50 % la récolte de tes extracteurs dans les Profondeurs. Tes explorations vont 1,5 fois plus vite.", d: "Les galeries s’illuminent d’un bout à l’autre.",
    h: "Des rangées d’ampoules alimentées par câble éclairent les chantiers jour et nuit." };
  I.radio = { n: "Poste radio", ic: "📻", a: 8, t: "tool", r: ["assembler", { bobine: 20, ampoule: 10, batterie: 10 }, 1],
    e: { arche: true }, u: "Capte les ondes radio.", d: "Surtout du bruit. Parfois autre chose.",
    h: "Une antenne reliée à une bobine réceptrice capte les signaux transmis par l’éther." };
  I.moteur_elec = { n: "Moteur électrique", ic: "🌀", a: 8, t: "comp", r: ["assembler", { bobine: 2, aimant: 2, lingot_acier: 2 }, 1],
    u: "Sert dans le réseau électrique, la pelleteuse, la foreuse électrique et presque toutes les constructions qui suivent.", d: "Presque silencieux.", h: "Une bobine alimentée en électricité au milieu d’un champ magnétique tourne sans fumée." };
  I.four_arc = { n: "Four à arc", ic: "⚡", a: 8, t: "stat", r: ["assembler", { brique_refr: 400, cuivre_pur: 120, batterie: 60 }, 1],
    e: { st: [{ g: "chauffer", heat: 3500 }] }, u: "Chauffer monte jusqu’à 3 500 °C : assez pour le silicium.", d: "Un éclair permanent enfermé dans des briques.",
    h: "Un arc électrique jaillissant entre deux électrodes de carbone atteint des températures extrêmes." };
  I.reseau = { n: "Réseau électrique", ic: "🗼", a: 8, t: "upg", r: ["assembler", { moteur_elec: 20, fil_cuivre: 600, cuivre_pur: 100 }, 1],
    e: { auto: { "*": 1.5 } }, u: "Augmente de 50 % la récolte de tous tes extracteurs, dans toutes les terres.", d: "Des pylônes relient tous tes chantiers.", h: "Des lignes de câbles reliant plusieurs générateurs alimentent tous les ateliers du secteur." };
  I.excavatrice = { n: "Pelleteuse électrique", sn: "pelleteuse", pl: "pelleteuses", ic: "🚜", a: 8, t: "ext", z: "desert", s: 1.25,
    r: ["assembler", { moteur_elec: 4, plaque_fer: 40, roue: 10 }, 1], p: { quartz: 1, sable: 2 },
    u: "Pose-la sur un gisement du Désert : elle récolte quartz ou sable à ta place.", d: "Elle avale les dunes.", h: "Une grande roue à godets mue par un moteur électrique débite le banc de quartz." };
  I.foreuse_elec = { n: "Foreuse électrique", sn: "foreuse", pl: "foreuses", ic: "🔧", a: 8, t: "ext", z: "mine", s: 1.25,
    r: ["assembler", { moteur_elec: 4, acier_trempe: 15, plaque_fer: 30 }, 1], p: { fer_min: 1.5, charbon: 1.5 },
    u: "Pose-la sur un gisement des Profondeurs : elle récolte minerai de fer ou charbon à ta place.", d: "Elle perce la roche en chantant.", h: "Un moteur électrique entraîne une mèche d’acier trempé dans la roche dure." };

  /* Âge 9 — Atome : le plomb et l’uranium se récoltent seulement par extracteur (jamais à la main) */
  I.uranium = { n: "Minerai d’uranium", sym: "☢", col: "#9bd13c", a: 9, t: "res", u: "Sert aux pastilles de combustible.", d: "Une roche noire, lourde, qui chauffe un peu dans la main. Elle te met mal à l’aise." };
  I.galene = { n: "Galène", sym: "◧", col: "#6b7482", a: 9, t: "res", u: "Sert à fondre le plomb.", d: "Un cristal gris, brillant et très lourd." };
  I.lingot_plomb = { n: "Lingot de plomb", sym: "Pb", col: "#7a8394", a: 9, t: "comp", r: ["chauffer", { galene: 3 }, 1, { heat: 400 }],
    u: "Sert aux plaques de plomb.", d: "Mou, lourd, gris sombre. Il arrête ce que l’œil ne voit pas.", h: "La galène grise fond facilement et donne un métal très lourd qui arrête les rayonnements." };
  I.plaque_plomb = { n: "Plaque de plomb", sym: "▭", col: "#808a9c", a: 9, t: "comp", r: ["marteler", { lingot_plomb: 2 }, 1],
    u: "Sert à la centrale à fission.", d: "Épaisse, froide, lourde à porter.", h: "Des tôles de plomb épaisses forment un blindage contre les rayonnements invisibles." };
  I.pastille_uranium = { n: "Pastille d’uranium", sym: "◉", col: "#b9e35a", a: 9, t: "comp", r: ["chauffer", { uranium: 4 }, 1, { heat: 1700 }],
    u: "Sert aux barres de combustible.", d: "Un petit cylindre de céramique noire. Il chauffe tout seul.", h: "Le minerai d’uranium purifié et compacté dégage une chaleur continue." };
  I.graphite = { n: "Graphite", sym: "▨", col: "#3b3f46", a: 9, t: "comp", r: ["chauffer", { charbon: 8 }, 1, { heat: 3000 }],
    u: "Sert à la centrale à fission.", d: "Du charbon cuit si fort qu’il en devient lisse et glissant.", h: "Le carbone chauffé à très haute température au four à arc s’ordonne en feuillets purs." };
  I.barre_combustible = { n: "Barre de combustible", sym: "▮", col: "#c0d86b", a: 9, t: "comp", r: ["assembler", { pastille_uranium: 6, acier_trempe: 2 }, 1],
    u: "Sert à la centrale à fission.", d: "Six pastilles empilées dans un tube d’acier fermé.", h: "Des pastilles d’uranium scellées dans une gaine étanche alimentent le cœur du réacteur." };
  I.compteur_geiger = { n: "Compteur Geiger", ic: "📟", a: 9, t: "upg", r: ["assembler", { ampoule: 2, cable: 6, batterie: 2 }, 1],
    e: { exp: 1.25 }, u: "Tes explorations vont 1,25 fois plus vite.", d: "Il crépite quand quelque chose chauffe dans la roche.", h: "Un tube ionisé traduit le passage des particules radioactives en crépitements audio." };
  I.centrale_fission = { n: "Centrale à fission", ic: "☢️", a: 9, t: "upg", r: ["assembler", { barre_combustible: 4, graphite: 30, plaque_plomb: 60 }, 1],
    e: { auto: { "*": 1.25 } }, u: "Augmente de 25 % la récolte de tous tes extracteurs, dans toutes les terres.", d: "Une tour blanche qui fume sans brûler. Elle ne s’arrête jamais.",
    h: "La chaleur des barres d’uranium contrôlées par le graphite produit de la vapeur en grande quantité." };

  /* Âge 10 — Silicium */
  I.quartz = { b: 0.5, n: "Quartz", sym: "◇", col: "#d9d4f0", a: 5, t: "res", u: "Sert dès le Fer à la poudre abrasive, puis au silicium.", d: "Des cristaux limpides, tirés du sable." };
  I.silicium = { n: "Silicium", sym: "Si", col: "#62758a", a: 10, t: "comp", r: ["chauffer", { quartz: 3, charbon: 2 }, 1, { heat: 3500 }],
    u: "Sert à fabriquer les plaquettes de silicium.", d: "Un métal qui n’en est pas tout à fait un.", h: "Le quartz fondu au four à arc avec du charbon libère un lingot gris métallique." };
  I.wafer = { n: "Plaquette de silicium", ic: "💿", a: 10, t: "comp", r: ["tailler", { silicium: 1 }, 4],
    u: "Sert dans les puces et les cellules photovoltaïques.", d: "Un disque miroir, parfaitement plat.", h: "Il nous faut du silicium bien plus fin pour en faire quelque chose d’utile." };
  I.lithographe = { n: "Lithographe", ic: "🔬", a: 10, t: "stat", r: ["assembler", { lentille: 90, moteur_elec: 15, acier_trempe: 90 }, 1],
    e: { st: [{ g: "graver" }] }, u: "Ouvre le geste Graver.", d: "Il dessine avec la lumière des traits plus fins qu’un cheveu.",
    h: "Un jeu d’optiques précises focalise la lumière pour insoler des tracés à l’échelle du micron." };
  I.puce = { n: "Puce", sym: "▣", col: "#3f9a68", a: 10, t: "comp", r: ["graver", { wafer: 1, cuivre_pur: 1 }, 2],
    u: "Sert dans les processeurs et les circuits imprimés.", d: "Des millions de minuscules interrupteurs.", h: "À cette échelle, seule la lumière est assez précise pour tracer un réseau." };
  I.processeur = { n: "Processeur", sym: "µP", col: "#2f7d55", a: 10, t: "comp", r: ["graver", { puce: 4 }, 1],
    u: "Sert dans l’ordinateur, les robots ouvriers, la ligne d’assemblage, le radiotélescope, et presque tout ce qui suit.", d: "Un caillou qui pense.", h: "Des millions de transistors gravés sur une puce traitent des calculs à haute vitesse." };
  I.cellule = { n: "Cellule photovoltaïque", sym: "▥", col: "#3550a0", a: 10, t: "comp", r: ["graver", { wafer: 1, verre_trempe: 1 }, 1],
    u: "Sert dans le filet orbital et le panneau de Dyson.", d: "Tu la tournes vers le soleil, et elle donne du courant.", h: "Une plaque de silicium exposée au rayonnement du soleil génère un courant continu." };
  I.circuit = { n: "Circuit imprimé", sym: "⌗", col: "#2f6b3f", a: 10, t: "comp", r: ["graver", { plaque_cuivre: 1, puce: 1 }, 2],
    u: "Sert dans les capteurs de forage et l’assembleur moléculaire.", d: "Une plaque de cuivre parcourue de pistes minuscules.", h: "Des pistes de cuivre gravées sur un support isolant relient les composants électroniques." };
  I.capteurs = { n: "Capteurs de forage", ic: "📶", a: 10, t: "upg", r: ["assembler", { circuit: 12, moteur_elec: 6, cable: 30 }, 1],
    e: { auto: { mine: 1.5, desert: 1.5 } }, u: "Augmente de 50 % la récolte de tes extracteurs dans les Profondeurs et le Désert.", d: "Tes engins sentent où creuser.",
    h: "Des têtes de mesure électroniques descendent dans les puits de forage pour sonder la géologie." };
  I.ordinateur = { n: "Ordinateur", ic: "🖥️", a: 10, t: "upg", r: ["assembler", { processeur: 15, batterie: 45, verre_trempe: 30 }, 1],
    e: { term: true, intu: 1, auto: { "*": 1.25 } }, u: "Ouvre le Terminal. Te rapporte 1 Intuition ✨ par minute et augmente de 25 % la récolte de tous tes extracteurs.", d: "Il calcule. Et il te parle.",
    h: "Un écran, de la mémoire et une puce : la machine exécute les calculs et pilote les appareils sans se tromper." };
  I.robots = { n: "Robots ouvriers", ic: "🤖", a: 10, t: "upg", r: ["assembler", { processeur: 45, moteur_elec: 75, acier_trempe: 180 }, 1],
    e: { auto: { "*": 1.5 } }, u: "Augmente de 50 % la récolte de tous tes extracteurs, dans toutes les terres.", d: "Ils ne dorment jamais.", h: "Des bras mécaniques pilotés par microprocesseur assemblent des pièces avec une précision constante." };
  I.chaine = { n: "Ligne d’assemblage", sn: "ligne d’assemblage", pl: "lignes d’assemblage", ic: "🏗️", a: 10, t: "mach", s: 1.3, spd: 120, ing: 3, prof: 1,
    r: ["assembler", { processeur: 10, moteur_elec: 20, lingot_acier: 150 }, 1],
    u: "Chaîne, 120 fabrications par minute. Aide tes commandes sur les recettes à trois ressources au plus, une fois que tu les as fabriquées à la main.", d: "Un tapis roulant et des bras articulés, pilotés par un cerveau de silicium.",
    h: "L’alignement des postes de travail mécanisés fait défiler les sous-ensembles en continu." };
  I.foreuse = { n: "Sonde pétrolière", ic: "🌪️", a: 8, t: "tool", r: ["assembler", { moteur_elec: 15, acier_trempe: 75, engrenage_acier: 90 }, 1],
    e: { zone: "gisement" }, u: "Ouvre le chemin vers le Gisement Noir.", d: "Une longue tige d’acier qui perce jusqu’à l’huile noire. Elle descend bien plus bas que la foreuse des Profondeurs.", h: "Une tête de forage diamantée guidée par capteurs perce jusqu’aux nappes de pétrole." };
  I.derrick = { n: "Derrick", sn: "derrick", pl: "derricks", ic: "🛢️", a: 10, t: "ext", z: "gisement", s: 1.25,
    r: ["assembler", { moteur_elec: 6, lingot_acier: 60, clous: 240 }, 1], p: { petrole: 1 },
    u: "Pose-le sur un gisement de pétrole, dans le Gisement Noir : il le récolte à ta place.", d: "Il hoche la tête et l’huile monte.", h: "Une tour métallique haubanée soutient les tiges de forage pour forer les puits profonds." };
  I.radiotelescope = { n: "Radiotélescope", ic: "📡", a: 10, t: "tool", r: ["assembler", { processeur: 15, plaque_fer: 450, bobine: 90 }, 1],
    e: { signal: true, sky: true }, u: "Ouvre le Cosmos. De là, tu peux écouter Kher.", d: "Une oreille géante tournée vers les étoiles.",
    h: "Une parabole orientable capte les ondes radio émises par les astres." };
  I.pip = { n: "Pip", ic: "🐞", a: 10, t: "curio", sec: true, r: ["assembler", { processeur: 1, moteur_elec: 1, laniere: 2 }, 1],
    e: { pip: 2 }, u: "Récolte à ta place, 2 fois par seconde, sur tes terres ouvertes.", d: "Un petit robot au bout d’une laisse de cuir. Il bipe quand il est content." };
  I.capsule = { n: "Capsule temporelle", ic: "⏳", a: 10, t: "curio", sec: true, r: ["assembler", { processeur: 1, verre_trempe: 2, plaque_fer: 2 }, 1],
    e: { capsule: true, once: { intu: 2 } }, u: "Agit à ta prochaine Relève.", d: "Tu y enregistres un message pour celui ou celle qui viendra après toi." };

  /* Âge 11 — Polymères */
  I.petrole = { b: 0.5, n: "Pétrole", sym: "●", col: "#17120e", a: 11, t: "res", u: "Se raffine en naphta pour les plastiques et le caoutchouc. Sert aussi dans la dynamite.", d: "Une huile sombre qui colle aux parois du seau." };
  I.soufre = { n: "Soufre", sym: "S", col: "#d4b348", a: 11, t: "res",
    u: "La soufrière le récolte dans les Collines. Sert à fabriquer le caoutchouc.", d: "Des cristaux jaunes se détachent de la roche friable." };
  I.naphta = { n: "Naphta", sym: "∽", col: "#cdb275", a: 11, t: "comp", r: ["chauffer", { petrole: 4 }, 3, { heat: 400 }],
    u: "Sert à synthétiser le plastique, la résine époxy et le caoutchouc.", d: "Un liquide clair recueilli à part pendant la chauffe du pétrole.", h: "La distillation du pétrole brut livre une fraction liquide inflammable pour l’industrie chimique." };
  I.bauxite = { b: 0.5, n: "Bauxite", sym: "◒", col: "#b8612f", a: 11, t: "res", u: "Sert à fabriquer l’aluminium.", d: "Une terre rouge qui cache un métal léger." };
  I.ilmenite = { b: 0.5, n: "Ilménite", sym: "◓", col: "#4a4a5c", a: 11, t: "res", u: "Sert à fabriquer le titane.", d: "Un sable noir et lourd." };
  I.terres_rares = { b: 0.2, n: "Terres rares", sym: "✳", col: "#8a6bbe", a: 11, t: "res", u: "Sert dans les aimants néodyme et les supraconducteurs.", d: "Pas si rares, mais si dispersées." };
  I.reacteur = { n: "Réacteur chimique", ic: "🧪", a: 11, t: "stat", r: ["assembler", { acier_trempe: 240, verre_trempe: 120, processeur: 40 }, 1],
    e: { st: [{ g: "synthetiser" }] }, u: "Ouvre le geste Synthétiser.", d: "Des cuves, et des tuyaux partout.",
    h: "Dans une cuve en inox sous pression, les produits se mélangent sans ronger les parois ni fuir." };
  I.plastique = { n: "Plastique", ic: "🧴", a: 11, t: "comp", r: ["synthetiser", { naphta: 3 }, 2],
    u: "Sert dans l’outillage électrique, la fibre de carbone et le graphène. Il en faut aussi pour le passage vers les Pics Fracturés.", d: "Tu peux lui donner toutes les formes et toutes les couleurs.", h: "Le naphta polymérisé donne une matière synthétique facile à mouler et insensible à l’humidité." };
  I.resine = { n: "Résine époxy", ic: "🍯", a: 11, t: "comp", r: ["synthetiser", { naphta: 2, bois: 6 }, 1],
    u: "Sert à fabriquer le composite carbone.", d: "Une colle qui durcit comme de la pierre.", h: "Ce polymère liquide additionné d’un durcisseur fige en un bloc solide et adhésif." };
  I.dynamite = { n: "Dynamite", ic: "🧨", a: 11, t: "comp", r: ["synthetiser", { petrole: 2, argile: 3 }, 3],
    e: { zone: "montagnes" }, u: "Ouvre le chemin vers les Pics Fracturés. Sert aussi dans la carrière et l’excavateur géant.", d: "Tu allumes la mèche, et tu cours.",
    h: "Pétrie dans de la poudre poreuse, la nitroglycérine ne saute plus au moindre choc : on fait sauter la roche sans risquer sa peau." };
  I.caoutchouc = { n: "Caoutchouc", sym: "◖", col: "#3b3b3b", a: 11, t: "comp", r: ["synthetiser", { naphta: 2, soufre: 1 }, 2],
    u: "Sert dans les tapis convoyeurs, les joints, les tuyaux souples et les protections.", d: "Tu l’étires entre les doigts ; dès que tu lâches, il reprend sa forme.", h: "La résine cuite avec un peu de soufre devient élastique et imperméable." };
  I.joint_souple = { n: "Joint d’étanchéité", sym: "◯", col: "#4b4b4b", a: 11, t: "comp", r: ["tailler", { caoutchouc: 1 }, 4],
    u: "Sert dans les échangeurs thermiques.", d: "Une rondelle qui s’écrase juste assez pour boucher le passage à l’eau.", h: "Une rondelle de caoutchouc serrée entre deux brides bloque les fuites de liquide et de gaz." };
  I.tuyau_souple = { n: "Tuyau souple", sym: "〰", col: "#454753", a: 11, t: "comp", r: ["tresser", { caoutchouc: 2, fibre: 4 }, 2],
    u: "Sert dans les échangeurs thermiques.", d: "La gaine de fibres empêche le tuyau de gonfler sous la pression.", h: "Une gaine de caoutchouc armée d’une tresse métallique résiste à la pression des circuits." };
  I.echangeur = { n: "Échangeur thermique", sym: "▥", col: "#91abb4", a: 11, t: "comp", r: ["assembler", { tuyau_cuivre: 8, tuyau_souple: 4, joint_souple: 6 }, 1],
    u: "Sert dans le refroidissement des machines.", d: "L’eau froide longe les conduites chaudes sans jamais s’y mélanger.", h: "Faire circuler deux fluides dans des faisceaux de tubes séparés transfère la chaleur de l’un à l’autre." };
  I.refroidissement = { n: "Refroidissement des machines", ic: "❄️", a: 11, t: "upg", r: ["assembler", { echangeur: 6, eau: 120, moteur_elec: 6 }, 1],
    e: { aspd: 1.5 }, u: "Augmente de 50 % la vitesse de toutes tes machines.", d: "Tu poses la main sur un carter qui était brûlant : il est à peine tiède.", h: "Une circulation d’eau déminéralisée évacue les calories produites par les moteurs." };
  I.convoyeurs = { n: "Tapis convoyeurs", ic: "📦", a: 11, t: "upg", r: ["assembler", { caoutchouc: 80, moteur_elec: 12, lingot_acier: 80 }, 1],
    e: { aspd: 1.5 }, u: "Tes machines fabriquent 50 % plus vite.", d: "Des bras chargent les pièces tout seuls, et les courroies défilent plus vite.",
    h: "Des bandes de caoutchouc armé motorisées acheminent les minerais d’un atelier à l’autre." };
  I.aluminium = { n: "Aluminium", sym: "Al", col: "#c4cad3", a: 11, t: "comp", r: ["electriser", { bauxite: 4, charbon: 1 }, 1],
    u: "Sert dans le titane et la céramique technique. Il en faut aussi pour le passage vers l’Orbite Basse.", d: "Autrefois plus précieux que l’or.", h: "L’électrolyse de la bauxite dans un bain de sels fondus dépose un métal blanc très léger." };
  I.titane = { n: "Titane", sym: "Ti", col: "#8f93a8", a: 11, t: "comp", r: ["chauffer", { ilmenite: 4, aluminium: 1 }, 1, { heat: 3500 }],
    u: "Sert dans beaucoup de recettes de l’espace : moteur-fusée, propulseur à fusion, autoclave, outillage électrique, excavateur géant. Il en faut aussi pour les passages vers l’Orbite Basse et la Lune.", d: "Léger, et il ne rouille pas.", h: "Ce minerai noir donne un métal tenace, qui ne rouille pas et résiste aux pires chaleurs." };
  I.aimant_neo = { n: "Aimant néodyme", sym: "Nd", col: "#7461b3", a: 11, t: "comp", r: ["allier", { terres_rares: 2, lingot_fer: 2 }, 1, { heat: 1700 }],
    u: "Sert à construire la centrale électrique.", d: "Petit et terriblement puissant.", h: "L’alliage de fer, de bore et de terre rare produit un aimant d’une puissance magnétique exceptionnelle." };
  I.centrale = { n: "Centrale électrique", ic: "🌩️", a: 11, t: "stat", r: ["assembler", { aimant_neo: 120, moteur_elec: 80, cuivre_pur: 600 }, 1],
    e: { st: [{ g: "electriser", lvl: 2 }], auto: { "*": 1.5 } }, u: "Tes extracteurs récoltent 50 % plus vite, dans toutes les terres.", d: "Des turbines géantes tournent jour et nuit.",
    h: "De puissantes turbines actionnées par la vapeur font tourner des alternateurs industriels." };
  I.outillage = { n: "Outillage électrique", ic: "🔧", a: 11, t: "tool", r: ["assembler", { titane: 60, plastique: 120, moteur_elec: 15 }, 1],
    e: { tap: { montagnes: 3, gisement: 3, desert: 2 } }, u: "Triple ta récolte à la main dans les Pics Fracturés et le Gisement Noir, et la double dans le Désert de Verre.", d: "Perceuse, tronçonneuse, marteau-piqueur.", h: "Des perceuses et meuleuses portatives à moteur électrique accélèrent l’usinage des pièces." };
  I.carriere = { n: "Carrière à ciel ouvert", sn: "carrière", pl: "carrières", ic: "🏔️", a: 11, t: "ext", z: "montagnes", s: 1.25,
    r: ["assembler", { dynamite: 80, moteur_elec: 10, acier_trempe: 60 }, 1], p: { bauxite: 1, ilmenite: 0.8, terres_rares: 0.3 },
    u: "Pose-la sur un gisement des Pics Fracturés : elle récolte la bauxite, l’ilménite ou les terres rares à ta place.", d: "Tu ne creuses plus : tu fais sauter.", h: "Une excavation à ciel ouvert approvisionne l’usine en roche de bauxite." };
  I.feu_artifice = { n: "Feu d’artifice", ic: "🎆", a: 11, t: "curio", sec: true, r: ["chauffer", { dynamite: 1, plaque_cuivre: 1 }, 1, { heat: 600 }],
    e: { once: { intu: 3 }, fireworks: true },
    d: "Le cuivre brûle vert et bleu. Des Lucioles tournent autour des étincelles. Tu ris, pour la première fois depuis ton éveil." };

  /* Âge 12 — Composites */
  I.fibre_carbone = { n: "Fibre de carbone", sym: "〰", col: "#262626", a: 12, t: "comp", r: ["chauffer", { plastique: 4 }, 2, { heat: 3500 }],
    u: "Sert à tresser le tissu de carbone.", d: "Un fil noir, plus solide que l’acier.", h: "Des fils de polymère cuits sous atmosphère neutre donnent des filaments de carbone pur très résistants." };
  I.tissu_carbone = { n: "Tissu de carbone", sym: "▦", col: "#2b2b2b", a: 12, t: "comp", r: ["tresser", { fibre_carbone: 4 }, 1],
    u: "Sert à fabriquer le composite carbone.", d: "Tu tresses du fil noir comme tu tressais les herbes de la Lisière.", h: "Le tissage des mèches de carbone produit une nappe souple prête pour l’imprégnation." };
  I.autoclave = { n: "Autoclave", ic: "⏲️", a: 12, t: "stat", r: ["assembler", { titane: 200, acier_trempe: 400, processeur: 100 }, 1],
    e: { st: [{ g: "stratifier" }] }, u: "Ouvre le geste Stratifier.", d: "Il règle la pression et la chaleur au degré près.",
    h: "Un caisson étanche chauffé sous vide chasse l’air des pièces pendant la cuisson des résines." };
  I.composite = { n: "Composite carbone", sym: "▩", col: "#1d3038", a: 12, t: "comp", r: ["stratifier", { tissu_carbone: 2, resine: 1 }, 1],
    u: "Sert dans la fusée, le vaisseau, les boucliers thermiques et bien d’autres. Il en faut aussi pour les passages vers l’Orbite Basse, la Lune et Mercure.", d: "Une plaque noire, légère, que rien ne raye.", h: "L’association de tissu de carbone et de résine époxy forme un matériau plus rigide que l’acier à poids égal." };
  I.ceramique = { n: "Céramique technique", sym: "◐", col: "#e8e2d6", a: 12, t: "comp", r: ["chauffer", { argile: 6, aluminium: 2 }, 1, { heat: 3500 }],
    u: "Sert dans le bouclier thermique et le moteur-fusée.", d: "De l’argile, comme tes premières briques. Celle-ci supporte la rentrée dans l’atmosphère.",
    h: "Des poudres réfractaires frittées à haute température résistent aux frottements violents." };
  I.bouclier_th = { n: "Bouclier thermique", ic: "🛡️", a: 12, t: "comp", r: ["stratifier", { ceramique: 4, composite: 1 }, 1],
    u: "Sert dans la fusée, l’alunisseur et la forge stellaire.", d: "Il encaisse 3 000 °C sans broncher.", h: "Des tuiles de céramique poreuse protègent la structure d’une rentrée atmosphérique." };
  I.graphene = { n: "Graphène", sym: "⬡", col: "#3a3a3a", a: 12, t: "comp", r: ["tailler", { charbon: 10, plastique: 1 }, 1],
    u: "Sert dans le réacteur à fusion, l’intelligence artificielle, la forge stellaire, le métamatériau et la matière exotique.", d: "Une couche d’atomes de carbone. Tu l’obtiens en arrachant des feuilles de charbon avec un ruban collant. Sérieusement.",
    h: "Un feuillet monoatomique de carbone conduit l’électricité avec une résistance quasi nulle." };
  I.supra = { n: "Supraconducteur", sym: "∞", col: "#5fc9f0", a: 12, t: "comp", r: ["allier", { terres_rares: 2, cuivre_pur: 3 }, 1, { heat: 3500 }],
    u: "Sert dans le propulseur à fusion, la base lunaire, le filet orbital, l’intelligence artificielle et bien d’autres.", d: "Le courant y circule sans perte, pour toujours.", h: "Refroidi sous son seuil critique, ce matériau conduit le courant sans aucune perte d’énergie." };
  I.moteur_fusee = { n: "Moteur-fusée", ic: "☄️", a: 12, t: "comp", r: ["assembler", { titane: 15, ceramique: 10, processeur: 3 }, 1],
    u: "Sert dans la fusée et l’alunisseur.", d: "Une tuyère qui crache le feu.", h: "La détente de gaz sous pression dans une tuyère réfractaire engendre une poussée continue." };
  I.fusee = { n: "Fusée", ic: "🚀", a: 12, t: "tool", r: ["assembler", { moteur_fusee: 25, composite: 400, bouclier_th: 60 }, 1],
    e: { zone: "orbite" }, u: "Ouvre le chemin vers l’Orbite Basse.", d: "Tu t’assieds tout en haut, au-dessus de tonnes de carburant.", h: "Une structure d’alliages légers et de réservoirs pressurisés franchit la haute atmosphère." };
  I.drones = { n: "Essaim de drones", ic: "🐝", a: 12, t: "upg", r: ["assembler", { composite: 200, processeur: 150, moteur_elec: 200 }, 1],
    e: { auto: { "*": 1.5 } }, u: "Tes extracteurs récoltent 50 % plus vite, dans toutes les terres.", d: "Des milliers de petites hélices bourdonnent au-dessus de tes gisements.", h: "Des engins légers guidés par capteurs effectuent des relevés cartographiques automatiques." };
  I.plateforme = { n: "Plateforme pétrolière", sn: "plateforme", pl: "plateformes", ic: "🛳️", a: 12, t: "ext", z: "gisement", s: 1.25,
    r: ["assembler", { composite: 50, moteur_elec: 40, acier_trempe: 150 }, 1], p: { petrole: 3 },
    u: "Pose-la sur un gisement du Gisement Noir : elle récolte le pétrole à ta place.", d: "Une ville flottante qui pompe l’huile.", h: "Ancrée au large par gros temps, elle tient bon pendant que le trépan attaque la roche sous l’eau." };
  I.excavateur = { n: "Excavateur géant", sn: "excavateur", pl: "excavateurs", ic: "🦣", a: 12, t: "ext", z: "montagnes", s: 1.25,
    r: ["assembler", { titane: 120, moteur_elec: 50, dynamite: 250 }, 1], p: { bauxite: 3, ilmenite: 2, terres_rares: 0.8 },
    u: "Pose-le sur un gisement des Pics Fracturés : il récolte la bauxite, l’ilménite ou les terres rares à ta place.", d: "Un monstre de titane qui mange les montagnes.", h: "Une roue-pelle géante décape les bancs de minerai sur des fronts de plusieurs dizaines de mètres." };

  /* Âge 13 — Spatial */
  I.debris = { b: 0.25, n: "Débris orbitaux", sym: "⁂", col: "#7a7f8a", a: 13, t: "res", u: "Sert à usiner l’alliage ancien. Il en faut aussi pour le passage vers la Lune.", d: "Des satellites morts, des panneaux, des boulons, qui tournent là depuis des milliers d’années." };
  I.helium3 = { b: 0.1, n: "Hélium-3", sym: "³He", col: "#7fd9e6", a: 13, t: "res", u: "Sert dans le propulseur à fusion, le réacteur à fusion, la matière exotique et l’antimatière. Il en faut aussi pour le passage vers Mercure.", d: "Rare sur Terre, abondant dans la poussière lunaire." };
  I.regolithe = { b: 0.5, n: "Régolithe", sym: "∷", col: "#9a9a9a", a: 13, t: "res", u: "Sert au passage vers Mercure, puis à un Grand Œuvre.", d: "La poussière grise de la Lune." };
  I.station_orbitale = { n: "Filet orbital", sn: "filet", pl: "filets", ic: "🛰️", a: 13, t: "ext", z: "orbite", s: 1.25,
    r: ["assembler", { composite: 280, supra: 45, cellule: 150 }, 1], p: { debris: 0.5 },
    u: "Pose-le sur un gisement de l’Orbite Basse : il récolte les débris orbitaux à ta place.", d: "Un filet qui ramasse les restes des Anciens.", h: "Des modules habitables assemblés en orbite basse constituent une base d’observation permanente." };
  I.alliage_ancien = { n: "Alliage ancien", sym: "Ω", col: "#a99cf0", a: 13, t: "comp", r: ["usiner", { debris: 5 }, 1],
    u: "Sert dans l’alunisseur, la base lunaire, le vaisseau interplanétaire et le réplicateur.", d: "Un métal que tu ne sais pas fabriquer. Les Anciens, si.", h: "Désossées sur les vieux satellites, ces ferrures ne ploient pas d’un millimètre sous la charge." };
  I.alunisseur = { n: "Alunisseur", ic: "🌙", a: 13, t: "tool", r: ["assembler", { moteur_fusee: 45, alliage_ancien: 200, bouclier_th: 90 }, 1],
    e: { zone: "lune" }, u: "Ouvre le chemin vers la Lune.", d: "Un petit pas pour un Semeur.", h: "Un module léger équipé de jambes d’atterrissage amortit le contact sur le sol lunaire." };
  I.base_lunaire = { n: "Base lunaire", sn: "base", pl: "bases", ic: "🏕️", a: 13, t: "ext", z: "lune", s: 1.25,
    r: ["assembler", { alliage_ancien: 200, supra: 90, processeur: 150 }, 1], p: { helium3: 0.5, regolithe: 1.5 },
    u: "Pose-la sur un gisement de la Lune : elle récolte l’hélium-3 ou le régolithe à ta place.", d: "Des dômes sous la lumière de la Terre.", h: "Des abris sous dôme pressurisés implantés sur la Lune accueillent les équipes de récolte." };
  I.propulseur = { n: "Propulseur à fusion", sym: "⇶", col: "#ffb347", a: 13, t: "comp", r: ["assembler", { supra: 10, helium3: 30, titane: 30 }, 1],
    u: "Sert dans le vaisseau interplanétaire, la forge stellaire et le réplicateur.", d: "Une petite étoile en bouteille.", h: "Un jet de plasma guidé par des aimants : la poussée est douce, mais elle ne faiblit jamais dans le vide." };
  I.reacteur_fusion = { n: "Réacteur à fusion", ic: "⚛️", a: 13, t: "upg", r: ["assembler", { supra: 280, helium3: 720, graphene: 390 }, 1],
    e: { auto: { "*": 1.5 } }, u: "Tes extracteurs récoltent 50 % plus vite, dans toutes les terres.", d: "De l’énergie, autant que tu en veux.", h: "Le confinement magnétique d’un plasma d’hélium génère une réaction thermonucléaire contrôlée." };
  I.vaisseau = { n: "Vaisseau interplanétaire", ic: "🛸", a: 13, t: "tool", r: ["assembler", { propulseur: 45, composite: 960, alliage_ancien: 480 }, 1],
    e: { zone: "mercure" }, u: "Ouvre le chemin vers Mercure.", d: "Cette fois, tu pars vers le Soleil.", h: "Une coque étanche en composite et un moteur à fusion : de quoi quitter l’orbite et tracer droit vers les autres mondes." };
  I.ia = { n: "Intelligence artificielle", ic: "🧠", a: 13, t: "upg", r: ["assembler", { processeur: 720, supra: 200, graphene: 280 }, 1],
    e: { aspd: 3, intu: 5 }, u: "Tes machines fabriquent trois fois plus vite. Te rapporte 5 ✨ par minute.", d: "Elle répond avant la fin de ta question. Tu reconnais la voix qui te parle depuis ton réveil.",
    h: "Des puces supraconductrices reliées en réseau : la machine apprend de ses erreurs et orchestre les chantiers sans faillir." };
  I.assembleur = { n: "Assembleur moléculaire", sn: "assembleur", pl: "assembleurs", ic: "🧬", a: 13, t: "mach", s: 1.3, spd: 600, ing: 3, prof: 2, r: ["assembler", { processeur: 30, supra: 10, circuit: 40 }, 1],
    u: "Robotique. Aide tes commandes sur les recettes à trois ressources au plus, une fois que tu les as fabriquées à la main. 600 fabrications par minute.", d: "Il assemble la matière atome par atome.",
    h: "Un bras microscopique piloté par laser positionne les structures atomiques une à une." };


  /* 0.45 : les maillons manquants de l'échelle des machines (une machine tous les deux âges environ). Vitesses et chevaux entre leurs voisines. */
  I.martinet = { n: "Martinet hydraulique", sn: "martinet", pl: "martinets", ic: "💧", a: 6, t: "mach", s: 1.25, spd: 25, ing: 2, prof: 0, r: ["assembler", { engrenage_acier: 10, roulement: 6, lingot_acier: 30 }, 1],
    u: "Hydraulique, 25 fabrications par minute. Aide tes commandes sur les recettes à deux ressources au plus, une fois que tu les as fabriquées à la main.", d: "Une roue, une chute d’eau, un marteau qui retombe sans fin.",
    h: "Une roue à augets entraîne un arbre à cames : la force de l’eau remplace le bras du forgeron." };
  I.poste_elec = { n: "Poste à moteur électrique", sn: "poste électrique", pl: "postes électriques", ic: "🔌", a: 8, t: "mach", s: 1.3, spd: 70, ing: 3, prof: 1, r: ["assembler", { moteur_elec: 5, cable: 25, plaque_fer: 40 }, 1],
    u: "Chaîne, 70 fabrications par minute. Aide tes commandes sur les recettes à trois ressources au plus, une fois que tu les as fabriquées à la main.", d: "Un moteur à chaque poste : plus d’arbre, plus de courroie, juste un bourdonnement.",
    h: "Un moteur électrique unitaire entraîne chaque machine : le poste se déplace où l’on veut dans l’atelier." };
  I.centre_num = { n: "Centre d’usinage numérique", sn: "centre d’usinage", pl: "centres d’usinage", ic: "🖥️", a: 12, t: "mach", s: 1.3, spd: 300, ing: 3, prof: 1, r: ["assembler", { processeur: 20, supra: 6, composite: 20 }, 1],
    u: "Robotique, 300 fabrications par minute. Aide tes commandes sur les recettes à trois ressources au plus, une fois que tu les as fabriquées à la main.", d: "Il suit un programme au micron près, sans qu’aucune main ne le guide.",
    h: "Des servomoteurs asservis par un calculateur déplacent l’outil le long de trajectoires programmées." };
  I.matrice = { n: "Matrice de fabrication", sn: "matrice", pl: "matrices", ic: "✴️", a: 14, t: "mach", s: 1.3, spd: 1500, ing: 3, prof: 2, r: ["assembler", { metamateriau: 10, matiere_exotique: 5, supra: 40 }, 1],
    u: "Synthèse, 1 500 fabrications par minute. Aide tes commandes sur les recettes à trois ressources au plus, une fois que tu les as fabriquées à la main.", d: "On lui donne de la matière brute ; elle rend l’objet fini.",
    h: "Un champ de confinement ordonne la matière, particule après particule, jusqu’à l’objet voulu." };

  /* Âge 14 — Stellaire */
  I.metal_mercure = { b: 0.5, n: "Métal mercurien", sym: "☿", col: "#c9a24a", a: 14, t: "res", u: "Sert dans le métamatériau, le panneau de Dyson et les Grands Œuvres.", d: "Mercure, démontée boulon par boulon." };
  I.forge_stellaire = { n: "Forge stellaire", ic: "🌟", a: 14, t: "stat", r: ["assembler", { propulseur: 45, graphene: 720, bouclier_th: 280 }, 1],
    e: { st: [{ g: "transmuter" }, { g: "chauffer", heat: 50000 }] }, u: "Ouvre le geste Transmuter. Chauffer y monte jusqu’à 50 000 °C.", d: "Même derrière le verre fumé, tu dois détourner les yeux.",
    h: "Bâtie tout contre l’étoile, la station capte le feu solaire pour fondre les matières les plus rebelles." };
  I.replicateur = { n: "Réplicateur", sn: "réplicateur", pl: "réplicateurs", ic: "🦾", a: 14, t: "ext", z: "mercure", s: 1.12,
    r: ["assembler", { processeur: 150, alliage_ancien: 150, propulseur: 9 }, 1], p: { metal_mercure: 3 },
    u: "Pose-le sur un gisement de Mercure : il récolte le métal mercurien à ta place.", d: "Il démonte la planète, et avec les morceaux il construit d’autres réplicateurs.", h: "Une unité de production autonome fabrique ses propres composants à partir de plans numériques." };
  I.metamateriau = { n: "Métamatériau", sym: "✶", col: "#d58cff", a: 14, t: "comp", r: ["stratifier", { graphene: 4, metal_mercure: 10 }, 1],
    u: "Sert dans le panneau de Dyson et les Grands Œuvres.", d: "Une matière qui plie la lumière.", h: "Une structure géométrique à l’échelle nanométrique dévie la trajectoire des ondes lumineuses." };
  I.matiere_exotique = { n: "Matière exotique", sym: "✺", col: "#9b59ff", a: 14, t: "comp", r: ["transmuter", { helium3: 10, graphene: 2 }, 1],
    u: "Sert dans un Grand Œuvre.", d: "Sa masse est négative. Tu refais la mesure trois fois.", h: "L’hélium-3 comprimé dans un réseau de graphène modifie localement le champ de gravité." };
  I.antimatiere = { n: "Antimatière", sym: "⊖", col: "#ff4fa3", a: 14, t: "comp", r: ["transmuter", { helium3: 20, supra: 1 }, 1],
    u: "Sert dans un Grand Œuvre.", d: "Un gramme suffit à raser une ville.", h: "Des antiparticules piégées dans un champ magnétique sous vide absolu libèrent une énergie totale au contact de la matière." };
  I.panneau_dyson = { n: "Panneau de Dyson", sym: "⬢", col: "#ffcf4a", a: 14, t: "comp",
    r: ["stratifier", { metamateriau: 2, cellule: 6, metal_mercure: 30 }, 1],
    u: "Sert dans les Grands Œuvres.", d: "Un miroir de la taille d’une ville, plus fin qu’une bulle de savon.", h: "Un réseau de capteurs solaires déployé autour de l’étoile collecte une fraction de son rayonnement." };
  I.diamant = { n: "Diamant", ic: "💎", a: 14, t: "comp", sec: true, r: ["chauffer", { graphene: 4 }, 1, { heat: 50000 }],
    d: "Sous une chaleur d’étoile, le carbone devient éternel." };
  I.bague = { n: "Bague de la promesse", ic: "💍", a: 14, t: "curio", sec: true, r: ["assembler", { diamant: 1, alliage_ancien: 1 }, 1],
    e: { once: { intu: 5 } },
    d: "La douzième bague, refaite. Tu la passes à ton doigt : elle est à ta taille." };
  I.philosophale = { n: "Pierre philosophale", ic: "🟡", a: 14, t: "curio", sec: true, r: ["transmuter", { caillou: 500 }, 1],
    e: { tap: { "*": 2 } },
    u: "Double ta récolte à la main dans toutes les terres.", d: "Ce que cherchaient les alchimistes, tiré du plus banal des cailloux. Elle ne change rien en or." };

  /* Curiosités (easter eggs) */
  I.poudre_rouge = { n: "Poudre rouge", ic: "🔴", col: "#e74c3c", sym: "✦", a: 2, t: "res", curio: true,
    d: "Une poudre fine et écarlate qui crépite doucement entre tes doigts.",
    u: "Sert à confectionner une torche rouge." };
  I.torche_rouge = { n: "Torche rouge", ic: "🏮", col: "#e74c3c", sym: "🔥", a: 2, t: "curio", curio: true, sec: true,
    r: ["assembler", { manche: 1, poudre_rouge: 1 }, 1],
    d: "Une torche qui brille d’une lueur rouge sans jamais chauffer.",
    h: "Cette poudre minérale rouge trouvée dans la roche brûle d’un éclat vif.",
    u: "Elle éclaire. Elle ne chauffe pas." };
  I.quart_coeur = { n: "Quart de cœur", ic: "❤️", a: 0, t: "curio", curio: true,
    d: "Un éclat écarlate en forme de cœur.",
    u: "Un fragment précieux venu d’un autre monde." };
  I.anneau_lourd = { n: "Anneau tout simple", ic: "💍", a: 0, t: "curio", curio: true,
    d: "Un anneau doré tout simple. Il est très lourd pour sa taille.",
    u: "Il semble vouloir retourner au courant de la rivière." };
  I.de_vingt = { n: "Dé à vingt faces", ic: "🎲", a: 1, t: "curio", curio: true,
    d: "Un caillou d’os taillé à vingt facettes. La première fois que tu l’as lancé, il a fait 20.",
    u: "Le hasard sourit aux audacieux." };
  I.fouet_cuir = { n: "Fouet de cuir", ic: "🪢", a: 1, t: "curio", curio: true,
    d: "Une corde de cuir tressée, lestée au bout. Elle claque toute seule quand tu passes près d’une chandelle.",
    u: "Elle ne sert à rien. Elle claque bien." };

  /* Chemin caché — la Résonance */
  I.resonite = { b: 0.5, n: "Résonite", sym: "◊", col: "#b36bff", a: 5, t: "res", d: "Un cristal violet qui vibre quand on chante près de lui." };
  I.diapason = { n: "Diapason", sym: "Ψ", col: "#c9a0ff", a: 5, t: "comp", path: true, r: ["accorder", { resonite: 5, lingot_bronze: 2 }, 1],
    d: "Il donne la note juste. Toujours la même.", h: "Une fourche de bronze taillée à deux branches résonne d’une note pure quand on la frappe." };
  I.cristal_chantant = { n: "Cristal chantant", ic: "🔮", a: 8, t: "comp", path: true, r: ["accorder", { resonite: 10, verre: 4 }, 1],
    d: "Il retient une mélodie et la répète à l’infini.", h: "Le quartz taillé soumis à une tension électrique vibre à une fréquence très stable." };
  I.traducteur = { n: "Traducteur", ic: "🗝️", a: 10, t: "relic", path: true, r: ["accorder", { signal_brut: 1, processeur: 4, cristal_chantant: 2 }, 1],
    e: { decode: true }, u: "Décode le signal de Kher.", d: "Il traduit l’intention plus que les mots.",
    h: "Ce programme compare les séquences de signaux reçus pour en extraire des régularités." };

  /* Reliques trouvées en exploration */
  I.tablette = { n: "Tablette des astres", sym: "⌖", col: "#857a66", a: 3, t: "relic", d: "Une pierre gravée de cercles et d’encoches pour des roues dentées qui n’existent plus." };
  I.partition = { n: "Vieille partition", ic: "📜", a: 5, t: "relic", old: true, d: "Une feuille de notes à l’encre pâlie. Les chiffres ne disent plus rien." };
  I.signal_brut = { n: "Signal de Kher", ic: "〽️", a: 10, t: "relic", d: "L’enregistrement brut du signal venu de Kher. Tu n’y comprends rien, pour l’instant." };

  /* Transmission : cinq recettes facultatives, sans monnaie supplémentaire. */
  I.encre = { n: "Encre", sym: "●", col: "#30333c", a: 1, t: "comp", r: ["chauffer", { charbon: 1, colle_os: 1 }, 2], u: "Sert aux feuillets de papyrus et à la presse d’imprimerie.", d: "Le noir reste sur le doigt longtemps après avoir refermé le pot.", h: "La poussière de charbon délayée dans un peu de colle tiède marque durablement." };
  I.papyrus = { n: "Feuillet de papyrus", sym: "▤", col: "#c8ad74", a: 2, t: "upg", r: ["assembler", { fibre: 12, encre: 2 }, 1], u: "Garde tes notes personnelles dans le Livre. Elles restent d’un cycle à l’autre.", d: "Tu laisses une place dans la marge pour la main qui viendra après la tienne.", h: "Des tiges de marais écrasées et séchées sous presse reçoivent la trace de l’encre." };
  I.papier = { n: "Papier", sym: "▧", col: "#d3cdb7", a: 7, t: "comp", r: ["assembler", { fibre: 6, eau: 2 }, 4], u: "Sert à construire la presse d’imprimerie.", d: "Les fibres se dispersent dans l’eau. Une fois séchées, elles tiennent en une feuille.", h: "Une pâte de fibres végétales délayée dans l’eau puis séchée sous presse donne des feuilles lisses." };
  I.presse_imprimer = { n: "Presse d’imprimerie", sym: "▥", col: "#847057", a: 7, t: "upg", r: ["assembler", { papier: 20, encre: 4, vis: 12 }, 1], u: "Copie les pages retrouvées dans le Livre sans abîmer les originaux.", d: "La même ligne sort sur plusieurs feuilles. L’erreur aussi, si tu l’as laissée.", h: "Des caractères en métal encrés et pressés sur le papier reproduisent un texte à l’identique." };
  I.serveur_archives = { n: "Serveur d’archives", sym: "▣", col: "#5fa78f", a: 10, t: "upg", r: ["assembler", { processeur: 8, circuit: 20, verre_trempe: 10 }, 1], u: "Fouille dans toutes les pages retrouvées et retrouve leurs sources.", d: "La machine retrouve en un instant la phrase que tu cherchais depuis trois veillées.", h: "Des baies de disques magnétiques conservent les données techniques de l’atelier." };
  D.TRANSMISSION = [
    { age: 2, ids: ["papyrus"], n: "Laisser une trace", d: "Une observation écrite peut atteindre un Semeur qui ne t’a jamais rencontré.", tech: "Le papyrus est fabriqué à partir de la moelle d’une plante précise, disposée en bandes. Le jeu regroupe ces végétaux sous le nom de fibres ; sa recette est une simplification." },
    { age: 7, ids: ["papier"], n: "Préparer des feuilles", d: "Un même support accueille des dessins, des comptes et des lettres.", tech: "Le papier se forme à partir de fibres dispersées dans l’eau, recueillies puis séchées. Il est différent du papyrus. Son classement à la Vapeur suit ici la disponibilité de l’eau dans le jeu, pas la date de son invention." },
    { age: 7, ids: ["presse_imprimer"], n: "Multiplier les exemplaires", d: "Les mots peuvent circuler sans que chaque main les recopie.", tech: "L’imprimerie reproduit une forme encrée sur un support. Copier conserve aussi les erreurs du modèle. Les copies du jeu signalent les originaux retrouvés ; elles ne créent aucune page du récit." },
    { age: 8, ids: ["radio"], n: "Porter une voix", d: "Un message arrive sans que quelqu’un apporte sa feuille.", tech: "La radio transmet un signal par ondes électromagnétiques. Transmettre un message et conserver un document sont deux fonctions distinctes." },
    { age: 10, ids: ["serveur_archives"], n: "Relier les archives", d: "Les documents gardent leur origine lorsqu’ils se répondent.", tech: "Internet relie des réseaux qui échangent des données selon des protocoles communs. Le serveur du jeu représente une archive locale ; avec la radio, il évoque la reconnexion des lieux, sans simuler Internet ni ajouter des habitants." },
    { age: 13, ids: ["serveur_archives", "ia"], n: "Interroger les traces", d: "La voix rapproche des mots que des mains différentes ont laissés.", tech: "Un modèle de langage apprend des régularités dans des exemples. Ses paramètres ne sont pas une copie fidèle d’une bibliothèque. Une recherche documentaire peut lui apporter des sources ; une réponse doit encore être vérifiée. Cet écran effectue une recherche locale, sans exécuter de LLM." }
  ];

  /* ---------------------------------------------------------------- LIGNES D’EXTRACTEURS
   * Un bâtiment par ressource : le bois a son Bûcheron, la pierre son Carrier, la peau son Tanneur…
   * Chaque ligne monte par niveaux (un par âge) ; chaque niveau est un extracteur qui ne récolte que la
   * ressource de sa ligne, et qui se pose sur tout gisement de cette ressource (sable : Rivière et Désert).
   * Chaque niveau a sa propre recette, à découvrir. Le taux et l’âge viennent de l’ancien extracteur à plusieurs
   * ressources dont il descend (champ de) : un exemplaire garde la même récolte qu’avant la 0.17.
   * niveau : { id, n, sn, pl, ic } pour un objet qui existait déjà, avec en plus { de, a, d, h, r, taux } pour un nouveau. */
  D.LIGNES = [
    { id: "bucheron", res: "bois", n: "Bûcheron", ic: "🪓", ph: "le bois", zs: ["lisiere"], niv: [
      { id: "cabane", n: "Cabane de bûcheron", sn: "cabane", pl: "cabanes", ic: "🛖" },
      { id: "hutte", n: "Hutte de bûcheron", sn: "hutte", pl: "huttes", ic: "🏚️" },
      { id: "scierie", n: "Scierie à vapeur", sn: "scierie", pl: "scieries", ic: "🪚" }] },
    { id: "cueilleur", res: "fibre", n: "Cueilleur", ic: "🌿", ph: "les fibres", zs: ["lisiere"], niv: [
      { id: "fibre_1", n: "Claie de séchage", sn: "claie", pl: "claies", ic: "🧺", de: "cabane", r: ["assembler", { manche: 5, corde: 6, bois: 12 }, 1],
        d: "Les tiges de fibre sèchent à l’air, étalées sur un cadre.", h: "Les tiges étalées sur des perches sèchent vite au soleil." },
      { id: "fibre_2", n: "Rouissoir", sn: "rouissoir", pl: "rouissoirs", ic: "🪺", de: "hutte", r: ["assembler", { brique: 6, argile: 15, bois: 40 }, 1],
        d: "Les tiges trempent dans l’eau stagnante jusqu’à lâcher leurs fibres. Ça sent fort.", h: "Laisser tremper les tiges dans un bassin d’eau aide à en détacher les fibres." },
      { id: "fibre_3", n: "Filature à vapeur", sn: "filature", pl: "filatures", ic: "🧵", de: "scierie", r: ["assembler", { moteur_vapeur: 2, roulement: 12, fibre: 300 }, 1],
        d: "Les bobines tournent sans s’arrêter et la fibre sort en fils réguliers.", h: "Des broches mécaniques animées par la vapeur tordent les mèches de fibres en fil continu." }] },
    { id: "carrier", res: "caillou", n: "Carrier", ic: "⛏️", ph: "la pierre", zs: ["lisiere"], niv: [
      { id: "caillou_1", n: "Carrière à main", sn: "carrière", pl: "carrières", ic: "🪨", de: "cabane", r: ["assembler", { manche: 6, caillou: 30, fibre: 8 }, 1],
        d: "Chaque coup de pic détache un bloc, que tu remontes à la corde.", h: "Des leviers de bois et des paniers solides aident à déloger les blocs de la falaise." },
      { id: "caillou_2", n: "Carrière à coins", sn: "carrière à coins", pl: "carrières à coins", ic: "⛰️", de: "hutte", r: ["assembler", { manche: 15, eclat: 12, caillou: 60 }, 1],
        d: "Des coins de bois enfoncés dans les fentes font éclater la roche en blocs nets.", h: "Enfoncer des coins durs dans les failles de la falaise détache des dalles régulières." },
      { id: "caillou_3", n: "Carrière à vapeur", sn: "carrière à vapeur", pl: "carrières à vapeur", ic: "🏗️", de: "scierie", r: ["assembler", { moteur_vapeur: 2, piston: 8, caillou: 400 }, 1],
        d: "Un marteau à vapeur frappe la roche à un rythme qui ne faiblit pas.", h: "Des marteaux perforateurs alimentés par la vapeur détachent des blocs de calcaire à la carrière." }] },
    { id: "chasseur", res: "os", n: "Chasseur", ic: "🏹", ph: "les os", zs: ["plaine"], niv: [
      { id: "collets", n: "Collets", sn: "collet", pl: "collets", ic: "🪤" },
      { id: "enclos", n: "Enclos d’élevage", sn: "enclos", pl: "enclos", ic: "🐐" }] },
    { id: "tanneur", res: "cuir", n: "Tanneur", ic: "🐂", ph: "la peau", zs: ["plaine"], niv: [
      { id: "cuir_1", n: "Fosse de tannage", sn: "fosse de tannage", pl: "fosses de tannage", ic: "🧶", de: "collets", r: ["assembler", { manche: 10, laniere: 8, caillou: 30 }, 1],
        d: "Les peaux trempent des jours dans une eau brune, puis sèchent, souples.", h: "Les peaux trempées dans une fosse calée de pierres deviennent souples et durables." },
      { id: "cuir_2", n: "Tannerie", sn: "tannerie", pl: "tanneries", ic: "🏭", de: "enclos", r: ["assembler", { bois: 250, clous: 60, laniere: 40 }, 1],
        d: "Des rangées de cuves, une odeur qui prend à la gorge, et du cuir en continu.", h: "De grandes cuves d’écorce et d’eau tannent les peaux par dizaines." }] },
    { id: "argilier", res: "argile", n: "Argilier", ic: "🧱", ph: "l’argile", zs: ["riviere"], niv: [
      { id: "nasse", n: "Argilière", sn: "argilière", pl: "argilières", ic: "🪣", d: "Une fosse ouverte au bord de l’eau, où l’argile se découpe en mottes.", h: "Des parois de perches et de briques maintiennent la berge pour prélever la glaise." },
      { id: "drague", n: "Drague à godets", sn: "drague", pl: "dragues", ic: "⛴️" }] },
    { id: "silex", res: "silex", n: "Mineur de silex", ic: "🔪", ph: "le silex", zs: ["riviere"], niv: [
      { id: "silex_1", n: "Gravière", sn: "gravière", pl: "gravières", ic: "🕳️", de: "nasse", r: ["assembler", { manche: 8, eclat: 8, brique: 3 }, 1],
        d: "Les silex roulés par le courant se ramassent entre les galets.", h: "En tamisant les graviers de la grève, on met la main sur les rognons de silex les plus nets." },
      { id: "silex_2", n: "Minière à silex", sn: "minière", pl: "minières", ic: "🚤", de: "drague", r: ["assembler", { moteur_vapeur: 2, plaque_fer: 15, corde: 60 }, 1],
        d: "Un puits profond où l’on descend chercher les gros rognons noirs.", h: "Un treuil à vapeur remonte les paniers de silex du puits d’extraction." }] },
    { id: "sablonnier", res: "sable", n: "Sablonnier", ic: "⏳", ph: "le sable", zs: ["riviere", "desert"], niv: [
      { id: "sable_1", n: "Sablière", sn: "sablière", pl: "sablières", ic: "🏖️", de: "nasse", r: ["assembler", { manche: 10, eclat: 4, fibre: 30 }, 1],
        d: "Une fosse où l’on pellette le sable, qu’on passe ensuite à la claie.", h: "Un tamis de fibres tendu au bord du banc recueille les grains de sable les plus fins." },
      { id: "sable_2", n: "Tamis à sable", sn: "tamis", pl: "tamis", ic: "🕸️", de: "tamis", taux: 1.8, r: ["assembler", { manche: 25, plaque_bronze: 6, fibre: 60 }, 1],
        d: "Un cadre qui laisse passer le sable fin et garde le reste.", h: "Une grille fine sépare la poussière de quartz des graviers du fleuve." },
      { id: "sable_3", n: "Pompe à sable", sn: "pompe à sable", pl: "pompes à sable", ic: "⚓", de: "drague", r: ["assembler", { moteur_vapeur: 2, piston: 6, roue: 8 }, 1],
        d: "Un gros tuyau aspire le sable du fond et le crache sur la rive.", h: "Une pompe à vapeur aspire le sable humide et l’envoie dans les bacs de décantation." },
      { id: "sable_4", n: "Pelleteuse à sable", sn: "pelleteuse à sable", pl: "pelleteuses à sable", ic: "🚜", de: "excavatrice", r: ["assembler", { moteur_elec: 4, plaque_fer: 30, vis: 40 }, 1],
        d: "Une large benne charge du sable à chaque passage.", h: "Une pelle mécanique articulée par des moteurs électriques charge les bennes de sable." }] },
    { id: "cuivre", res: "malachite", n: "Mineur de cuivre", ic: "🟢", ph: "la malachite", zs: ["collines"], niv: [
      { id: "puits", n: "Mine de cuivre", sn: "mine de cuivre", pl: "mines de cuivre", ic: "🕳️" },
      { id: "treuil", n: "Mine de cuivre à vapeur", sn: "mine à vapeur", pl: "mines à vapeur", ic: "🪝" }] },
    { id: "etain", res: "cassiterite", n: "Mineur d’étain", ic: "⚪", ph: "la cassitérite", zs: ["collines"], niv: [
      { id: "cassiterite_1", n: "Mine d’étain", sn: "mine d’étain", pl: "mines d’étain", ic: "⛏️", de: "puits", r: ["assembler", { manche: 20, lingot_cuivre: 6, corde: 12 }, 1],
        d: "Le minerai gris est lourd : on le remonte à part, seau après seau.", h: "Des pics de cuivre et des seaux suspendus aident à extraire le minerai noir." },
      { id: "cassiterite_2", n: "Mine d’étain à vapeur", sn: "mine d’étain à vapeur", pl: "mines d’étain à vapeur", ic: "🔗", de: "treuil", r: ["assembler", { moteur_vapeur: 2, chainon: 60, lingot_acier: 15 }, 1],
        d: "Une chaîne sans fin remonte les wagonnets d’étain.", h: "Des wagonnets tractés par un câble mécanique montent le minerai d’étain des galeries profondes." }] },
    { id: "charbonnier", res: "charbon", n: "Charbonnier", ic: "⚫", ph: "le charbon", zs: ["lisiere", "mine"], niv: [
      { id: "charbonniere", n: "Meule de charbonnier", sn: "meule", pl: "meules", ic: "🌫️" },
      { id: "charbon_2", n: "Mine de charbon", sn: "mine de charbon", pl: "mines de charbon", ic: "🚧", de: "galerie", r: ["assembler", { manche: 40, soufflet: 3, clous: 50 }, 1],
        d: "Des galeries noires, où la poussière colle à la gorge.", h: "La roche noire extraite en profondeur chauffe deux fois plus fort que le bois." },
      { id: "charbon_3", n: "Mine de charbon électrique", sn: "mine électrique", pl: "mines électriques", ic: "🔩", de: "foreuse_elec", r: ["assembler", { moteur_elec: 4, acier_trempe: 12, cable: 60 }, 1],
        d: "Les outils tournent au fond, alimentés par un câble qui court le long de la galerie.", h: "Des haveuses électriques abattent le front de taille sans asphyxier les galeries de fumée." }] },
    { id: "cristallier", res: "quartz", n: "Cristallier", ic: "💎", ph: "le quartz", zs: ["mine", "desert"], niv: [
      { id: "tamis", n: "Carrière de quartz", sn: "carrière de quartz", pl: "carrières de quartz", ic: "🕸️" },
      { id: "excavatrice", n: "Carrière de quartz mécanisée", sn: "carrière mécanisée", pl: "carrières mécanisées", ic: "🚜" }] },
    { id: "ferrier", res: "fer_min", n: "Mineur de fer", ic: "🔩", ph: "le minerai de fer", zs: ["mine"], niv: [
      { id: "galerie", n: "Mine de fer", sn: "mine de fer", pl: "mines de fer", ic: "🚧" },
      { id: "foreuse_elec", n: "Mine de fer électrique", sn: "mine électrique de fer", pl: "mines électriques de fer", ic: "🔧" }] },
    { id: "petrolier", res: "petrole", n: "Pétrolier", ic: "🛢️", ph: "le pétrole", zs: ["gisement"], niv: [
      { id: "derrick", n: "Derrick", sn: "derrick", pl: "derricks", ic: "🛢️" },
      { id: "plateforme", n: "Plateforme pétrolière", sn: "plateforme", pl: "plateformes", ic: "🛳️" }] },
    { id: "bauxite", res: "bauxite", n: "Mineur de bauxite", ic: "🏔️", ph: "la bauxite", zs: ["montagnes"], niv: [
      { id: "carriere", n: "Mine de bauxite", sn: "mine de bauxite", pl: "mines de bauxite", ic: "🏔️" },
      { id: "excavateur", n: "Mine de bauxite géante", sn: "mine géante de bauxite", pl: "mines géantes de bauxite", ic: "🦣" }] },
    { id: "ilmenite", res: "ilmenite", n: "Mineur d’ilménite", ic: "🪨", ph: "l’ilménite", zs: ["montagnes"], niv: [
      { id: "ilmenite_1", n: "Mine d’ilménite", sn: "mine d’ilménite", pl: "mines d’ilménite", ic: "⛰️", de: "carriere", r: ["assembler", { dynamite: 60, moteur_elec: 8, aluminium: 30 }, 1],
        d: "La roche noire se détache en grandes plaques lourdes.", h: "Ce sable noir le long de l’eau est gorgé de titane : il suffit de le laver pour en tirer le minerai." },
      { id: "ilmenite_2", n: "Mine d’ilménite géante", sn: "mine géante d’ilménite", pl: "mines géantes d’ilménite", ic: "🚛", de: "excavateur", r: ["assembler", { titane: 100, moteur_elec: 40, aluminium: 120 }, 1],
        d: "Des bennes de la taille d’une maison, pour des blocs entiers.", h: "Des engins de terrassement lourds augmentent le débit d’extraction de minerai de titane." }] },
    { id: "rares", res: "terres_rares", n: "Mineur de terres rares", ic: "🧪", ph: "les terres rares", zs: ["montagnes"], niv: [
      { id: "terres_1", n: "Mine de terres rares", sn: "mine de terres rares", pl: "mines de terres rares", ic: "🧲", de: "carriere", r: ["assembler", { moteur_elec: 8, dynamite: 40, plastique: 30 }, 1],
        d: "Un filon mince, suivi avec soin sur toute sa longueur.", h: "Le tri magnétique des concentrés sépare les terres rares pour les aimants puissants." },
      { id: "terres_2", n: "Mine de terres rares géante", sn: "mine géante de terres rares", pl: "mines géantes de terres rares", ic: "🚧", de: "excavateur", r: ["assembler", { moteur_elec: 40, titane: 80, aimant_neo: 30 }, 1],
        d: "Des aimants triment les grains utiles et laissent le reste.", h: "Des séparateurs magnétiques industriels traitent le minerai broyé pour isoler les fractions rares." }] },
    { id: "orbital", res: "debris", n: "Récupérateur orbital", ic: "🛰️", ph: "les débris orbitaux", zs: ["orbite"], niv: [
      { id: "station_orbitale", n: "Filet orbital", sn: "filet", pl: "filets", ic: "🛰️" }] },
    { id: "heliophage", res: "helium3", n: "Extracteur d’hélium", ic: "🎈", ph: "l’hélium-3", zs: ["lune"], niv: [
      { id: "base_lunaire", n: "Base d’hélium-3", sn: "base", pl: "bases", ic: "🏕️" }] },
    { id: "regolitier", res: "regolithe", n: "Terrassier lunaire", ic: "🌑", ph: "le régolithe", zs: ["lune"], niv: [
      { id: "regolithe_1", n: "Excavatrice lunaire", sn: "excavatrice lunaire", pl: "excavatrices lunaires", ic: "🏗️", de: "base_lunaire", r: ["assembler", { alliage_ancien: 120, moteur_fusee: 6, supra: 60 }, 1],
        d: "Des pelles automatiques raclent la poussière grise du sol lunaire.", h: "Un engin de terrassement sous vide racle la poussière lunaire pour en extraire l’hélium piégé." }] },
    { id: "eau", res: "eau", n: "Pompe à eau", ic: "💧", ph: "l’eau", zs: ["riviere"], niv: [
      { id: "eau_1", n: "Pompe à bras", sn: "pompe à bras", pl: "pompes à bras", ic: "💧", a: 7, s: 1.25, taux: 3, r: ["assembler", { piston: 2, plaque_cuivre: 6, manche: 4 }, 1],
        d: "Un levier remonte l’eau de la rivière dans un réservoir.", h: "Un balancier emmanché sur un corps de pompe en cuivre fait remonter l’eau du sous-sol." }] },
    { id: "soufre", res: "soufre", n: "Récolteur de soufre", ic: "🟡", ph: "le soufre", zs: ["collines"], niv: [
      { id: "soufre_1", n: "Soufrière", sn: "soufrière", pl: "soufrières", ic: "🟡", a: 11, s: 1.25, taux: 1.5, r: ["assembler", { acier_trempe: 20, vis: 40, roue: 10 }, 1],
        d: "Des racloirs détachent les croûtes jaunes ; les chariots les descendent de la colline.", h: "Les concrétions jaunes récoltées au bord des fumerolles vulcanisent la résine." }] },
    { id: "uranium", res: "uranium", n: "Mineur d’uranium", ic: "☢️", ph: "l’uranium", zs: ["gisement"], niv: [
      { id: "uranium_1", n: "Mine d’uranium", sn: "mine d’uranium", pl: "mines d’uranium", ic: "☢️", a: 9, s: 1.25, taux: 0.8, r: ["assembler", { moteur_elec: 5, acier_trempe: 25, ampoule: 30 }, 1],
        d: "Un puits étroit, éclairé en continu. On n’y reste jamais longtemps.", h: "Sous des plaques de plomb épaisses, les wagonnets remontent la roche luisante sans nous brûler les poumons." },
      { id: "uranium_2", n: "Puits d’uranium blindé", sn: "puits blindé", pl: "puits blindés", ic: "🛡️", a: 11, s: 1.25, taux: 2.4, de: "uranium_1",
        r: ["assembler", { lingot_plomb: 40, processeur: 6, verre_trempe: 20 }, 1],
        d: "Des sas doublés de plomb et des galeries ventilées, pour extraire l’uranium plus vite et plus profond.",
        h: "Des galeries renforcées de plomb et ventilées sécurisent l’extraction d’uranium." }
    ] },
    { id: "plomb", res: "galene", n: "Mineur de plomb", ic: "🔘", ph: "la galène", zs: ["gisement"], niv: [
      { id: "galene_1", n: "Mine de plomb", sn: "mine de plomb", pl: "mines de plomb", ic: "⛏️", a: 9, s: 1.25, taux: 1.2, r: ["assembler", { moteur_elec: 3, lingot_acier: 30, roue: 20 }, 1],
        d: "Les galeries suivent des veines grises, si lourdes que les wagons grincent.", h: "Des galeries bien étayées pour extraire le minerai lourd qui protège des rayonnements." },
      { id: "galene_2", n: "Mine de plomb mécanisée", sn: "mine de plomb mécanisée", pl: "mines de plomb mécanisées", ic: "🏗️", a: 11, s: 1.25, taux: 3.6, de: "galene_1",
        r: ["assembler", { moteur_elec: 12, lingot_acier: 80, cable: 60 }, 1],
        d: "Des treuils électriques et des convoyeurs remontent les blocs de galène en continu.",
        h: "L’abattage mécanisé du gisement de galène approvisionne les ateliers de fonderie en plomb." }
    ] },
    { id: "fondeur", res: "metal_mercure", n: "Fondeur de Mercure", ic: "🔥", ph: "le métal mercurien", zs: ["mercure"], niv: [
      { id: "replicateur", n: "Réplicateur", sn: "réplicateur", pl: "réplicateurs", ic: "🦾" }] }
  ];
  (function () {
    // 1) ce que rapportait chaque ancien extracteur, avant le partage : taux de la ressource × nombre de ressources
    const ancien = {}, modele = {};
    Object.keys(I).forEach((id) => { if (I[id].t === "ext") modele[id] = Object.assign({}, I[id]); });
    D.LIGNES.forEach((L) => L.niv.forEach((v) => {
      if (v.a !== undefined) { ancien[v.id] = v.taux; return; } // un extracteur tout neuf, sans ancêtre
      const g = v.de || v.id, o = modele[g];
      if (!o) throw new Error("Ligne " + L.id + " : ancien extracteur inconnu " + g);
      ancien[v.id] = v.taux || Math.round(o.p[L.res] * Object.keys(o.p).length * 1000) / 1000;
    }));
    D.LIGNES.forEach((L) => L.niv.forEach((v, k) => {
      const nouveau = v.a !== undefined, m = nouveau ? null : modele[v.de || v.id], it = I[v.id] || (I[v.id] = {});
      if (nouveau) Object.assign(it, { a: v.a, t: "ext", s: v.s, r: v.r, d: v.d, h: v.h });
      else if (v.de) Object.assign(it, { a: m.a, t: "ext", s: m.s, r: v.r, d: v.d, h: v.h });
      else { if (v.d) it.d = v.d; if (v.h) it.h = v.h; }
      Object.assign(it, { n: v.n, sn: v.sn, pl: v.pl, ic: v.ic, p: { [L.res]: ancien[v.id] }, z: L.zs[0], zs: L.zs.slice(), lg: L.id, lv: k + 1 });
      if (v.de) it.de = v.de; // l’ancien extracteur dont il descend : sert aux anciennes sauvegardes
      it.u = "Récolte " + L.ph + " à ta place, même quand le jeu est fermé.";
    }));
  })();

  /* ---------------------------------------------------------------- ZONES */
  D.ZONES = [
    { id: "lisiere", n: "La Lisière", ic: "🌲", res: ["bois", "fibre", "caillou"],
      d: "L’orée d’une forêt immense. Tu t’es réveillé ici.",
      exps: [
        { id: "chene", n: "Le Grand Chêne", dur: 30, rw: { inv: { bois: 15, fibre: 10 }, frag: "chene" } },
        { id: "grotte", n: "La Grotte aux Mains", dur: 150, cost: { torche: 1 }, rw: { frag: "grotte", intu: 2 } },
        { id: "cercle", n: "Le Cercle de Pierres", dur: 60, need: "cerf_volant", hidden: "Il faudrait se laisser porter par le vent pour apercevoir ce lieu d’en haut.", rw: { frag: "cercle", intu: 2 } },
        { id: "racines", n: "Sous les Racines", dur: 90, show: { marque: 3 }, hidden: "Sous les racines du vieux chêne, la terre sonne creux.", rw: { frag: "racines", intu: 2 } }
      ] },
    { id: "plaine", n: "La Plaine des Hautes Herbes", ic: "🌾", res: ["os", "cuir"], req: "epieu",
      d: "Des herbes plus hautes que toi, et des bêtes qui ne te craignent pas encore.",
      exps: [
        { id: "champ_os", n: "Le Champ des Os", dur: 60, rw: { inv: { os: 20 }, frag: "ossements" } },
        { id: "tumulus", n: "Le Tumulus", dur: 180, cost: { torche: 1 }, rw: { frag: "tumulus", intu: 2 } },
        { id: "tombe", n: "L’Arbre Seul", dur: 75, need: "pioche_pierre", show: { any: [{ frag: "carcasse2" }, { frag: "carcasse" }] }, hidden: "Un arbre pousse seul au milieu des herbes. Il faut de quoi creuser à son pied.", rw: { frag: "tombe", intu: 2 } },
        { id: "poings", n: "Les Six Poings", dur: 100, need: { frag: "cuves", glyph: "enfant" }, hidden: "Six poings restent fermés dans la poussière.", rw: { frag: "poings", intu: 3 } }
      ] },
    { id: "riviere", n: "La Rivière Lente", ic: "🏞️", res: ["argile", "silex", "sable"], req: "outre",
      d: "Une eau large et paresseuse, qui roule des galets noirs.",
      exps: [
        { id: "gue", n: "Le Gué", dur: 300, rw: { inv: { silex: 15, argile: 10 }, frag: "galet" } },
        { id: "carcasse", n: "La Carcasse", dur: 60, need: "hache_pierre", rw: { frag: "carcasse", intu: 2 } },
        { id: "escalier", n: "L’Escalier Noyé", dur: 90, need: "cloche", show: { any: [{ frag: "gue2" }, { frag: "galet" }] }, hidden: "Des marches de pierre s’enfoncent sous l’eau sombre.", rw: { frag: "escalier", intu: 2 } }
      ] },
    { id: "collines", n: "Les Collines Vertes", ic: "⛰️", res: ["malachite", "cassiterite", "caillou"], req: "pioche_pierre",
      d: "Des collines rondes, striées de veines vertes et sombres.",
      exps: [
        { id: "rails", n: "Les Rails Rouillés", dur: 300, rw: { inv: { malachite: 15 }, frag: "rails" } },
        { id: "sommet", n: "Le Sommet", dur: 360, rw: { item: { tablette: 1 }, frag: "vue", intu: 2 } },
        { id: "nid", n: "Le Replat", dur: 100, need: ["flute", "lunette"], show: { any: [{ frag: "vue2" }, { frag: "vue" }] }, hidden: "Un replat rocheux offre un abri contre le vent et une vue dégagée sur le ciel.", rw: { frag: "nid", intu: 2 } }
      ] },
    { id: "mine", n: "Les Profondeurs", ic: "🦇", res: ["fer_min", "charbon", "quartz"], req: "pioche_bronze",
      d: "Des galeries naturelles qui s’enfoncent sous les collines. Il y fait tiède. À cette profondeur, il devrait faire froid.",
      exps: [
        { id: "filon", n: "Le Filon Profond", dur: 60, cost: { torche: 2 }, rw: { inv: { fer_min: 20 }, frag: "porte" } },
        { id: "porte_scellee", n: "La Porte Scellée", dur: 90, need: "boussole", hidden: "Une porte lisse, sans poignée ni serrure. Le fer tremble quand il s’en approche.", rw: { flag: "caveau", frag: "caveau", secret: "caveau" } }
      ] },
    { id: "desert", n: "Le Désert de Verre", ic: "🏜️", res: ["quartz", "sable"], req: "locomotive",
      d: "Des dunes à perte de vue. Par endroits, le sable a fondu en dalles de verre.",
      exps: [
        { id: "ville", n: "La Ville Ensevelie", dur: 90, need: "gants", rw: { inv: { quartz: 20 }, frag: "journal" } },
        { id: "observatoire", n: "L’Observatoire", dur: 120, need: "lunette", rw: { frag: "registre", intu: 3 } },
        { id: "quai", n: "Le Quai", dur: 140, need: { glyph: "revenir" }, show: { frag: "journal" }, hidden: "Un signe sur la carte indique un quai enfoui sous les dunes.", rw: { frag: "quai", intu: 3 } }
      ] },
    { id: "gisement", n: "Le Gisement Noir", ic: "🛢️", res: ["petrole"], req: "foreuse",
      d: "Une plaine de bitume où l’huile suinte du sol.",
      exps: [{ id: "plateforme_r", n: "La Plateforme Rouillée", dur: 120, need: "masque", rw: { frag: "cendre", intu: 2 } }] },
    { id: "montagnes", n: "Les Pics Fracturés", ic: "🏔️", res: ["bauxite", "ilmenite", "terres_rares"], req: "dynamite",
      d: "Des montagnes éventrées par une catastrophe ancienne.",
      exps: [
        { id: "silo", n: "Le Silo", dur: 150, rw: { frag: "manifeste", intu: 2 } },
        { id: "radar", n: "Le Radar", dur: 180, need: "bouteille", rw: { frag: "radar", intu: 3 } }
      ] },
    { id: "orbite", n: "L’Orbite Basse", ic: "🛰️", res: ["debris"], req: "fusee",
      d: "Un anneau de débris tourne autour de la Terre. Les Anciens n’ont jamais rien redescendu.",
      exps: [
        { id: "station_morte", n: "La Station Morte", dur: 180, rw: { inv: { debris: 20 }, frag: "commandant" } },
        { id: "arche0", n: "Le Satellite", dur: 240, rw: { frag: "code_source", intu: 4 } }
      ] },
    { id: "lune", n: "La Lune", ic: "🌕", res: ["helium3", "regolithe"], req: "alunisseur",
      d: "Grise, silencieuse, et pas tout à fait vide.",
      exps: [
        { id: "tranquillite", n: "La Mer de la Tranquillité", dur: 240, rw: { frag: "plaque", intu: 2 } },
        { id: "base_vahl", n: "La Base", dur: 300, rw: { frag: "iris_lune", intu: 3 } },
        { id: "salle_registre", n: "La Lumière", dur: 300, show: { secret: "lune7" }, hidden: "Une lumière clignote à intervalles réguliers dans l’ombre d’un cratère.", rw: { frag: "salle_registre", flag: "registre", intu: 3 } }
      ] },
    { id: "mercure", n: "Mercure", ic: "☀️", res: ["metal_mercure"], req: "vaisseau",
      d: "La plus petite planète, si près du Soleil que le métal y coule.",
      exps: [{ id: "bras", n: "Les Bras Figés", dur: 300, rw: { inv: { metal_mercure: 200 }, frag: "bras" } }] },
    { id: "caveau", n: "Le Caveau des Semeurs", ic: "🔷", res: ["resonite"], req: "@caveau", secret: true,
      d: "Sous les Profondeurs, une salle immense baignée de lumière bleue.",
      exps: [
        { id: "cuves", n: "Les Cuves", dur: 60, rw: { frag: "cuves", intu: 3 } },
        { id: "chambre", n: "La Chambre", dur: 90, cost: { torche: 3 }, rw: { frag: "berceuse", intu: 3 } },
        { id: "coeur", n: "Le Cœur", dur: 120, need: "ordinateur", rw: { frag: "coeur", intu: 4 } },
        { id: "originaux", n: "La Deuxième Salle", dur: 150, need: { glyph: "dabord", any: [{ registre: true }, { page: "p27" }] }, hidden: "Dans la roche bleue, un seul signe marque la porte.", rw: { frag: "originaux", intu: 3 } }
      ] }
  ];

  /* ------------------------------------------------------------ FRAGMENTS */
  D.FRAGS = {}; // les textes des lieux sont dans js/recit.js

  /* ------------------------------------------------------ RÉMINISCENCES
   * Courtes scènes déclenchées à la première fabrication d’un objet. */
  D.EVENTS = {
    feu: "Le feu prend. Tu le regardes longtemps. Quelque part au fond de ta tête, une voix sans timbre dit : « Seuil 1. »",
    epieu: "La pointe noircit et durcit. Au loin, dans la plaine, une bête lève la tête vers la fumée.",
    eclat: "Le silex se fend net. Tu as frappé au bon endroit sans hésiter, alors que tu ne te souviens pas de l’avoir appris.",
    four: "La chaleur monte, les briques rougeoient. Quelque part sous la terre, quelque chose enregistre : « Seuil 3. »",
    lingot_cuivre: "Le métal coule, rouge vif. Tu sens qu’on te regarde faire, et que quelqu’un, quelque part, est content de toi.",
    lingot_bronze: "Deux métaux tendres, et ce qui sort du creuset est dur. Tu fais tinter le lingot contre une pierre, juste pour l’entendre.",
    lingot_fer: "Chaque coup de marteau fait jaillir des étincelles. La plupart retombent. Quelques-unes restent en l’air et clignotent : des Lucioles.",
    lunette: "Tu pointes la lunette vers le ciel. Les étoiles, la Lune, et une étoile rouge qui pulse lentement. Hier, il n’y avait rien à cet endroit.",
    moteur_vapeur: "La machine tousse, crache, puis prend son rythme. Tu n’es plus seul à travailler.",
    radio: "Des grésillements, puis une voix prononce un nom : « Semeur {semeur}. » Elle a quelque chose de familier.",
    silicium: "Le quartz fond et donne un métal bleuté, cassant comme du verre.",
    ordinateur: "L’écran s’allume, un curseur clignote. Tu n’as encore rien tapé quand une ligne apparaît : « BONJOUR, SEMEUR {semeur}. »",
    plastique: "L’huile noire devient une matière souple, de toutes les couleurs. Les Anciens en faisaient tout.",
    composite: "Tu soulèves la plaque noire d’un doigt. Ton premier manche pesait plus lourd.",
    fusee: "Le sol tremble, puis plus rien ne pèse. Par le hublot, la Terre est verte et bleue, et presque vide.",
    alunisseur: "La poussière grise se soulève sans bruit. Au-dessus de toi, la Terre tient derrière ton pouce.",
    vaisseau: "Cap sur le Soleil. La Terre devient un point bleu, puis rien.",
    automate_bois: "La marionnette se met en marche, clac, clac. Elle refait ton geste, puis le refait encore. Ce travail-là se fera sans toi.",
    presse_vapeur: "La presse siffle et cogne en cadence. Dans les Terres, toutes les machines s’accélèrent.",
    forge_stellaire: "Tu tiens un morceau d’étoile dans une cage d’aimants. À cette chaleur, même le carbone le plus fin deviendrait éternel. ARCHE ne dit rien pendant un moment, puis : « ESTIMATION : TU ES PRÊT. »",
    dynamite: "La mèche crépite. Un souvenir qui n’est pas à toi : du cuivre jeté dans les flammes, et le feu qui vire au vert.",
    moteur_elec: "Le moteur ronronne dans ta main comme un petit animal. Avec un cerveau et une laisse, il te suivrait partout.",
    verre_trempe: "Ce verre-là ne se brise plus. Avec une coque de fer et un cerveau pour s’en souvenir, il protégerait un message pendant des siècles."
  };

  /* ------------------------------------------------------------- ARCHE
   * Messages d’ARCHE, déclenchés par des événements.
   * Peut être un tableau de lignes ou un objet par cycle / seuil de cycle. */
  D.ARCHE = {}; // js/recit.js

  /* -------------------------------------------------------- MÉLODIES (flûte)
   * Trous numérotés de 1 à 5. */
  D.MELODIES = {}; // les airs (empreintes) sont dans js/recit.js

  /* -------------------------------------------------------------- SECRETS */
  D.SECRETS = [
    { id: "galette", k: "recette" }, { id: "statuette", k: "recette" }, { id: "flute", k: "recette" },
    { id: "cerf_volant", k: "recette" }, { id: "miroir", k: "recette" }, { id: "anticythere", k: "recette" },
    { id: "boussole", k: "recette" }, { id: "feu_artifice", k: "recette" }, { id: "pip", k: "recette" },
    { id: "capsule", k: "recette" }, { id: "diamant", k: "recette" }, { id: "bague", k: "recette" },
    { id: "philosophale", k: "recette" }, { id: "cloche", k: "recette" }, { id: "pigment", k: "recette" },
    { id: "appel", k: "air", n: "L’Appel des Lucioles" }, { id: "frere", k: "air", n: "Dormez-vous ?" },
    { id: "caveau", k: "lieu", n: "Le Caveau des Semeurs" },
    { id: "lune7", k: "ciel", n: "La Lumière sur la Lune" },
    { id: "c1969", k: "code", n: "Venus en paix" }, { id: "cxyzzy", k: "code", n: "Rien ne se passe" },
    { id: "cregistre", k: "code", n: "La clé du Registre" }, { id: "ccapsule", k: "code", n: "Le message" }
  ];

  /* ---------------------------------------------------- CURIOSITÉS (EASTER EGGS) */
  D.EASTER = {
    poudre_rouge: { n: "Poudre rouge", ic: "🔴", tier: 3, desc: "Une poudre rouge, qui crépite entre tes doigts." },
    coeur: { n: "Quart de cœur", ic: "❤️", tier: 3, desc: "Un fragment de réceptacle. Tu te sens un peu plus solide." },
    anneau: { n: "Anneau tout simple", ic: "💍", tier: 3, desc: "Au fond du gué, un anneau très lourd pour sa taille." },
    d20: { n: "Dé à vingt faces", ic: "🎲", tier: 3, desc: "Un caillou d’os taillé à vingt facettes. Tu le lances : 20." },
    fouet: { n: "Fouet de cuir", ic: "🪢", tier: 2, desc: "Une corde tressée la nuit, qui claque toute seule près des chandelles." },
    tuyau: { n: "Tuyau vert", ic: "🟩", tier: 2, desc: "Un tuyau vert dépasse de la roche dans les Profondeurs." },
    survivant: { n: "La demi-heure", ic: "⏱️", tier: 2, desc: "Tes mains tournent toutes seules depuis une demi-heure. Tu n’as jamais été aussi efficace, ni aussi seul." },
    zera: { n: "Événement", ic: "🎙️", tier: 2, desc: "ÉVÉNEMENT TROUVÉ. RÈGLEMENT : TOUT LE MONDE GAGNE." },
    squeeze: { n: "Le million", ic: "📦", tier: 2, desc: "Un million. Quelqu’un, quelque part, a dû appuyer très fort sur un bouton." },
    wtc: { n: "On coupe ?", ic: "✂️", tier: 2, desc: "Une transition sèche. On coupe ?" },
    konami: { n: "Haut, haut, bas, bas", ic: "⭐", tier: 2, desc: "Trente étoiles de plus brillent dans la nuit." }
  };

  /* --------------------------------------------------- GESTES REMARQUÉS (SUCCÈS) */
  D.GESTES_REMARQUES = {
    premiers_pas: {
      n: "Premiers pas", ic: "🪵",
      t: "Tailler un manche en bois dans la Lisière.",
      hint: "Retirer ce qui dépasse d’un bâton.",
      when: (st) => !!(st.made && st.made.manche)
    },
    premier_feu: {
      n: "La première flamme", ic: "🔥",
      t: "Allumer un feu de camp avant la nuit.",
      hint: "Réunir de quoi chauffer la matière.",
      when: (st) => !!(st.made && st.made.feu)
    },
    premiere_cabane: {
      n: "L’abri du gisement", ic: "🛖",
      t: "Poser un premier extracteur pour récolter à ta place.",
      hint: "Laisser un abri récolter sur un filon.",
      when: (st) => !!(st.inv && st.inv.cabane) || (st.dom && st.dom.gis && st.dom.gis.bois && st.dom.gis.bois.ext > 0) || !!(st.meta && st.meta.ruins && st.meta.ruins.cabane)
    },
    premiere_plaine: {
      n: "La première frontière", ic: "🌾",
      t: "Franchir le passage de la Plaine avec un épieu.",
      hint: "S’armer pour ouvrir l’accès aux hautes herbes.",
      when: (st) => !!(st.zones && st.zones.plaine)
    },
    premiere_releve: {
      n: "La relève des mains", ic: "✦",
      t: "Passer le relais et confier le savoir au Semeur suivant.",
      hint: "Laisser quelqu’un d’autre reprendre la route.",
      when: (st) => (st.cycle || 1) >= 2
    },
    premier_automate: {
      n: "Le souffle mécanique", ic: "⚙️",
      t: "Faire tourner une commande avec une machine.",
      hint: "Confier une tâche répétitive à un automate.",
      when: (st) => !!(st.inv && (st.inv.automate_bois || st.inv.automate_bronze || st.inv.automate_acier || st.inv.chaine)) || (st.dom && st.dom.gis && Object.values(st.dom.gis).some((g) => g && g.mach > 0))
    },
    premier_troc: {
      n: "Le premier troc", ic: "🪙",
      t: "Honorer une commande du Troqueur au Comptoir.",
      hint: "Répondre à la demande d’un marchand.",
      when: (st) => !!((st.comptoir && Object.keys(st.comptoir.sold || {}).length > 0) || (st.meta && st.meta.troqueurDelivered > 0))
    },
    premier_signe: {
      n: "La parole gravée", ic: "✍️",
      t: "Comprendre un premier signe des Anciens.",
      hint: "Trouver le sens d’un symbole dans la roche.",
      when: (st) => !!(st.signes && Object.keys(st.signes).length > 0)
    },
    premiere_etude: {
      n: "L’œil attentif", ic: "🔍",
      t: "Étudier une ressource à la loupe avec de l’Intuition.",
      hint: "Regarder une ressource de plus près.",
      when: (st) => !!(st.studied && Object.keys(st.studied).length > 0)
    },
    premier_dechiffrage: {
      n: "L’énigme percée", ic: "✨",
      t: "Déchiffrer une recette inconnue pas à pas.",
      hint: "Éclairer une recette que tu n’as pas encore trouvée.",
      when: (st) => !!(st.hints && Object.values(st.hints).some((v) => v >= 1))
    },
    premier_visiteur: {
      n: "La silhouette fugitive", ic: "🦋",
      t: "Surprendre un visiteur qui traverse les Terres.",
      hint: "Toucher quelqu’un qui ne fait que passer.",
      when: (st) => !!(st.stats && (st.stats.visiteurs >= 1 || st.stats.visiteursVus >= 1))
    },
    premier_don: {
      n: "Le don du réveil", ic: "🤲",
      t: "Recevoir la bénédiction d’un don au réveil d’un cycle.",
      hint: "Choisir une faveur pour le prochain Semeur.",
      when: (st) => !!(st.don || (st.meta && st.meta.jours && st.meta.jours.n > 0))
    },
    premier_air: {
      n: "Le chant dans l’os", ic: "🎶",
      t: "Retrouver une mélodie sur la flûte à cinq trous.",
      hint: "Jouer les bonnes notes dans le silence.",
      when: (st) => !!(st.secrets && Object.keys(D.MELODIES || {}).some((m) => st.secrets[m]))
    },
    premiere_constellation: {
      n: "Le dessin du ciel", ic: "🌌",
      t: "Relier les étoiles d’une constellation dans le Cosmos.",
      hint: "Relier ce qui brille dans la nuit.",
      when: (st) => !!(st.meta && st.meta.constellations && Object.keys(st.meta.constellations).length > 0)
    },
    ruines_relevees: {
      n: "L’héritage relevé", ic: "🔨",
      t: "Tout réparer d’un coup sur les ruines d’un cycle passé.",
      hint: "Relever ce que le précédent Semeur a laissé.",
      when: (st) => !!(st.repaired && Object.keys(st.repaired).length > 0)
    },
    chef_doeuvre: {
      n: "Le geste parfait", ic: "🏆",
      t: "Réaliser un chef-d’œuvre à l’Atelier.",
      hint: "Façonner un objet sans le moindre défaut.",
      when: (st) => !!(st.stats && st.stats.master >= 1)
    },
    douze_terres: {
      n: "Le tour du monde", ic: "🗺️",
      t: "Atteindre les douze terres, du sous-sol aux étoiles.",
      hint: "Fouler chaque contrée du monde connu.",
      when: (st) => D.ZONES.every((z) => st.zones && st.zones[z.id])
    },
    toutes_matieres: {
      n: "L’encyclopédie des mains", ic: "🔬",
      t: "Avoir étudié chaque ressource du monde.",
      hint: "Ne laisser aucune ressource brute inexplorée.",
      when: (st) => {
        const mats = Object.keys(D.ITEMS).filter((i) => D.ITEMS[i].t === "res" && !D.ITEMS[i].sec);
        return mats.length > 0 && mats.every((i) => st.studied && st.studied[i]);
      }
    },
    livre_complet: {
      n: "Le Livre des Semeurs", ic: "📖",
      t: "Retrouver les 32 pages du Livre des Semeurs.",
      hint: "Rassembler toutes les pages éparpillées.",
      when: (st) => !!(st.livre && st.livre.p && Object.keys(st.livre.p).length >= 32)
    },
    cinq_fins: {
      n: "Les cinq horizons", ic: "🌅",
      t: "Avoir contemplé les cinq fins d’Éclat.",
      hint: "Voir où chaque grand chemin conduit le monde.",
      when: (st) => !!(st.meta && st.meta.endings && Object.keys(st.meta.endings).length >= 5)
    }
  };

  /* ------------------------------------------------------- GRANDS ŒUVRES */
  D.PROJECTS = {
    dyson: { n: "La Sphère de Dyson", ic: "☀️", req: "arche", end: "aube",
      d: "Envelopper le Soleil d’un essaim de collecteurs et diriger son énergie vers un bouclier planétaire. Plus rien ne pourrait atteindre la Terre.",
      steps: [
        { n: "Lanceur de masse", d: "Un rail électromagnétique de cent kilomètres posé sur Mercure.", cost: { supra: 380, metal_mercure: 50000, regolithe: 12500 } },
        { n: "Premier anneau", d: "Les premiers panneaux prennent place autour du Soleil.", cost: { panneau_dyson: 750 } },
        { n: "L’Essaim", d: "Des millions de miroirs. Le Soleil s’assombrit pour le reste de l’univers.", cost: { panneau_dyson: 3000 } },
        { n: "Le Bouclier", d: "Diriger l’énergie de l’étoile vers la Terre.", cost: { metamateriau: 1000, processeur: 2500 } }
      ] },
    brisemonde: { n: "Le Brise-Monde", ic: "💥", req: "arche", end: "brasier",
      d: "Un canon à antimatière capable de briser une planète à douze années-lumière. La menace serait éliminée à la source.",
      steps: [
        { n: "Accélérateur annulaire", d: "Un anneau de supraconducteurs autour de la Lune.", cost: { supra: 1000, alliage_ancien: 1250, titane: 7500 } },
        { n: "Réserve d’antimatière", d: "Assez pour briser un monde.", cost: { antimatiere: 3750 } },
        { n: "Lentille gravitationnelle", d: "Pour que le rayon reste étroit pendant douze années-lumière de voyage.", cost: { matiere_exotique: 1500, metamateriau: 750 } },
        { n: "Mise à feu", d: "Il ne reste qu’à appuyer.", fire: true }
      ] },
    chant: { n: "", ic: "🔔", req: "traducteur", end: "retour", d: "",
      steps: [
        { n: "", d: "", cost: { cloche: 1, cristal_chantant: 380, alliage_ancien: 500, diapason: 75 } },
        { n: "", d: "", need: "coeur", action: "relais" },
        { n: "", d: "", scene: "lacher" },
        { n: "", d: "", melody: "frere", fire: true }
      ] },
    arche13: { n: "", ic: "🚀", req: "vaisseau", end: "exode", d: "",
      steps: [
        { n: "", d: "", cost: { titane: 2500, composite: 1500, metamateriau: 500 } },
        { n: "", d: "", cost: { propulseur: 30, supra: 800, helium3: 4000 } },
        { n: "", d: "", cost: { processeur: 1500, verre_trempe: 500, puce: 1000 } },
        { n: "", d: "", fire: true }
      ] },
    silence: { n: "", ic: "🛑", req: "radiotelescope", end: "silence", d: "",
      steps: [
        { n: "", d: "", cost: { cable: 1500, bobine: 500, batterie: 200 } },
        { n: "", d: "", cost: { diapason: 75, supra: 400, quartz: 2000 } },
        { n: "", d: "", cost: { processeur: 500, puce: 1000, cristal_chantant: 150 } },
        { n: "", d: "", fire: true }
      ] }
  };

  /* ---------------------------------------------------------------- FINS */
  D.ENDINGS = { // les textes sont dans js/recit.js
    aube: { n: "L’Aube Éternelle", ic: "☀️" },
    brasier: { n: "Le Brasier", ic: "💥" },
    retour: { n: "Les Matines", ic: "🔔" },
    exode: { n: "L’Exode", ic: "🚀" },
    silence: { n: "Le Grand Silence", ic: "🛑" }
  };
  D.HINT_ENDING_COST = 75;

  /* --------------------------------- RÈGLES D'ÉCHO DES FINS (DEUXIÈME PRESTIGE) */
  D.ECHOS_FINS = {
    aube: {
      id: "aube",
      n: "Foyer Perpétuel",
      ic: "☀️",
      sub: "L’Aube éternelle",
      d: "Le geste Chauffer est actif dès l’éveil (600 °C), les stations gagnent +200 °C, et les fontes/alliages ont +25 % de chance de pièce bonus."
    },
    brasier: {
      id: "brasier",
      n: "L’Onde de Choc",
      ic: "💥",
      sub: "Le Brasier",
      d: "25 % de chance de coup critique (×3) sur toutes les récoltes et extracteurs ; passages entre terres 15 % moins chers."
    },
    exode: {
      id: "exode",
      n: "La Voie des Étoiles",
      ic: "🚀",
      sub: "L’Exode",
      d: "Vitesse d’exploration doublée (durée ÷2) ; temps de veille hors-ligne étendu jusqu’à 24 h à plein rendement."
    },
    silence: {
      id: "silence",
      n: "L’Écho Cosmique",
      ic: "🌌",
      sub: "Le Grand Silence",
      d: "Régénération continue de +3 ✨ d’Intuition par minute ; coût en Intuition des indices et questions divisé par deux."
    },
    retour: {
      id: "retour",
      n: "L’Éveil Partagé",
      ic: "🕊️",
      sub: "Les Matines",
      d: "Les machines assemblent les recettes connues sans premier essai à la main ; vitesse de toutes les machines +25 %."
    }
  };

  /* ----------------------------------------------------------- OBJECTIFS */
  /* Un objectif est soit [objet, texte] (le fabriquer), soit une action :
   * { k: "exp", z: zone, x: exploration }, { k: "ext" } (poser et relier un extracteur)
   * ou { k: "line" } (faire tourner une machine). */
  D.OBJECTIVES = [
    ["manche", "Récolte du bois, puis taille un manche au Labo."],
    ["corde", "Tresse des fibres pour faire une corde."],
    { k: "exp", z: "lisiere", x: "chene", n: "Explorer le Grand Chêne", txt: "Explore le Grand Chêne depuis la Lisière. L’exploration avance seule." },
    ["feu", "La nuit tombe. Construis un feu de camp : il ouvre le geste Chauffer."],
    ["cabane", "Une cabane posée sur un gisement récolte à ta place."],
    { k: "ext", n: "Poser ta cabane", txt: "Dans les Terres, touche « + cabane » sur le bois : elle récolte même quand le jeu est fermé." },
    ["epieu", "L’épieu ouvre le chemin vers la Plaine."],
    { k: "pass", z: "plaine", n: "Vers la Plaine", txt: "Apporte les ressources du passage, en plusieurs fois si besoin." },
    ["laniere", "Découpe une peau en bandes."],
    { k: "exp", z: "plaine", x: "champ_os", n: "Explorer le Champ des Os", txt: "Explore le Champ des Os, au milieu de la Plaine." },
    ["aiguille", "Pour coudre une peau, il faut une aiguille."],
    ["collets", "Des collets dans la Plaine récoltent os et peaux sans toi."],
    ["outre", "Une outre pour porter de l’eau jusqu’à la Rivière."],
    { k: "pass", z: "riviere", n: "Vers la Rivière", txt: "Apporte les ressources de la passerelle." },
    ["eclat", "Les galets noirs de la rivière cachent un tranchant."],
    ["hache_pierre", "Avec un tranchant de pierre, tu abattrais bien plus de bois. Les outils multiplient tes récoltes."],
    ["pioche_pierre", "Les collines ont des veines colorées. Il te faut de quoi les entamer : la pioche ouvre le chemin vers les Collines."],
    { k: "pass", z: "collines", n: "Vers les Collines", txt: "Les Collines sont raides. Pour y monter, il faut des marches : dépose les matériaux nécessaires." },
    ["automate_bois", "Tes mains se lassent de refaire les mêmes gestes. Un automate les referait à ta place."],
    { k: "line", n: "Faire tourner ton automate", txt: "Lance une commande d’une recette à une ressource, déjà fabriquée à la main (des manches, des cordes, des éclats…) : ton automate s’y met tout seul." },
    ["four", "Le feu de camp ne chauffe plus assez. Le four en argile monte jusqu’à 1 100 °C."],
    ["lingot_cuivre", "La pierre verte des collines cache un métal."],
    ["enclume_pierre", "Le métal se travaille à coups de marteau, sur quelque chose de dur. L’enclume ouvre le geste Marteler."],
    ["plaque_cuivre", "Sur l’enclume, martèle une première plaque de cuivre."],
    ["lingot_etain", "La cassitérite des Collines cache un autre métal : fonds de l’étain pour préparer l’alliage."],
    ["charbonniere", "Construis une meule de charbonnier, puis pose-la dans la Lisière : elle alimentera les fontes sans brûler tout ton bois à la main."],
    ["creuset", "Il faudrait pouvoir fondre plusieurs métaux ensemble. Le creuset ouvre le geste Allier."],
    ["lingot_bronze", "Le métal rouge est trop mou. Allie-le."],
    ["automate_bronze", "Un automate de bronze travaillerait bien plus vite que ta marionnette de bois."],
    ["pioche_bronze", "Il te faut une pioche plus dure pour creuser vers les Profondeurs."],
    { k: "pass", z: "mine", n: "Vers les Profondeurs", txt: "Pour descendre, il faut un puits solide, tenu par du métal." },
    ["enclume_bronze", "Le fer ne se bat pas sur une simple pierre. Il te faut une enclume plus dure."],
    ["bas_fourneau", "Le minerai de fer demande plus de chaleur. Le bas-fourneau monte jusqu’à 1 300 °C."],
    ["lingot_fer", "Bats le fer."],
    ["chariot", "Un chariot porte tes outils plus loin que le camp : tous tes extracteurs récoltent plus."],
    ["poudre_quartz", "Le quartz des Profondeurs peut polir le verre : prépare une poudre abrasive pour ta lunette, puis les briques des fours."],
    ["lunette", "Une étoile rouge pulse dans le ciel. Il te faut la voir de plus près."],
    ["haut_fourneau", "Pour l’acier, il faut encore plus chaud. Le haut-fourneau monte jusqu’à 1 700 °C."],
    ["lingot_acier", "Fer et carbone, à très haute température."],
    ["bac_trempe", "Un grand bac d’eau froide pour durcir le métal brûlant d’un coup. Le bac ouvre le geste Tremper."],
    ["acier_trempe", "Plonge l’acier brûlant dans l’eau froide : il devient dur comme jamais."],
    ["tour", "Le tour d’usinage ouvre le geste Usiner, pour tailler le métal avec la régularité d’une machine."],
    ["engrenage_acier", "Taillés dans l’acier trempé, ces engrenages transmettent la force motrice sans faiblir ni casser."],
    ["roulement", "Des billes d’acier trempé dans leur cage : les roulements réduisent le frottement au cœur des futures machines."],
    ["martinet", "Une roue à eau peut battre le fer à ta place. Le martinet hydraulique aide tes commandes."],
    ["eau_1", "Pour alimenter une chaudière, il faut un débit régulier d’eau. Construis une pompe à bras pour la Rivière."],
    ["circuit_vapeur", "De l’eau dans la chaudière, des tuyaux pour conduire la vapeur : le moteur peut prendre forme."],
    ["moteur_vapeur", "Fais travailler la vapeur à ta place."],
    ["locomotive", "Au-delà des collines s’étend un désert de verre. Une voie de fer le traverserait, et la vapeur y tirerait un convoi."],
    { k: "pass", z: "desert", n: "Vers le Désert de Verre", txt: "Le verre brûle les roues. Une route le traverserait." },
    ["regulateur", "Un moteur à vapeur qui s’emballe se brise. Quelque chose doit le retenir."],
    ["presse_vapeur", "Une machine-outil à vapeur ferait tourner tes machines bien plus vite."],
    ["recuperation_vapeur", "La vapeur peut redevenir de l’eau dans un condenseur. Raccorde-le aux moteurs pour accélérer tes machines."],
    ["dynamo", "Capture l’étincelle. La dynamo ouvre le geste Électriser."],
    ["poste_elec", "Un moteur électrique sur chaque poste : plus besoin d’arbre ni de courroie."],
    ["radio", "Quelqu’un émet peut-être encore, quelque part."],
    ["four_arc", "Un éclair permanent, pour fondre ce que rien d’autre ne fond. Le four à arc monte jusqu’à 3 500 °C."],
    ["foreuse", "Sous le Gisement Noir, l’huile dort, et d’autres roches avec elle. Il te faut une sonde pour l’atteindre."],
    { k: "pass", z: "gisement", n: "Vers le Gisement Noir", txt: "L’huile dort loin sous la croûte. Il faut y creuser une tranchée." },
    ["uranium_1", "Dans la roche du Gisement Noir, quelque chose chauffe sans feu. Un extracteur peut le remonter."],
    ["galene_1", "Le Gisement Noir cache aussi de la galène : construis une mine de plomb, puis pose-la sur ce gisement. Ce minerai ne se récolte pas à la main."],
    ["lingot_plomb", "Pour s’en protéger, il faut un métal très lourd. La galène du Gisement Noir en donne."],
    ["barre_combustible", "L’uranium cuit, enfermé dans l’acier, devient un combustible."],
    ["centrale_fission", "De la chaleur sans flamme : fais-la travailler à ta place."],
    ["silicium", "Le quartz cache un métal qui pense."],
    ["lithographe", "La lumière peut graver des circuits plus fins qu’un cheveu. Le lithographe ouvre le geste Graver."],
    ["wafer", "Le silicium se taille en plaquettes minces et polies comme des miroirs."],
    ["puce", "La lumière grave des pistes de cuivre microscopiques sur le silicium."],
    ["processeur", "Plusieurs puces réunies exécutent des séries d’ordres sans jamais hésiter."],
    ["ordinateur", "Construis une machine qui calcule."],
    ["chaine", "Construis une ligne d’assemblage : ses machines aideront les commandes de recettes déjà fabriquées à la main. Lance ensuite un lot de processeurs ou de pièces pour tes prochains chantiers."],
    ["radiotelescope", "Une coupole géante tournée vers les étoiles pour capter les signaux du Cosmos."],
    ["reacteur", "Le réacteur chimique ouvre le geste Synthétiser : il recompose les molécules."],
    ["naphta", "Le pétrole contient plusieurs produits. Chauffe-le pour en séparer le naphta."],
    ["plastique", "Le naphta peut devenir une pièce moulée : essaie de le synthétiser."],
    ["soufre_1", "Le soufre des Collines donne de l’élasticité au caoutchouc. Construis une soufrière pour le récolter."],
    ["refroidissement", "Des tuyaux souples et des joints étanches font circuler l’eau fraîche autour des machines."],
    ["masque", "Les vapeurs du Gisement Noir sont toxiques. Fabrique un masque filtrant pour explorer la Plateforme Rouillée."],
    { k: "exp", z: "gisement", x: "plateforme_r", n: "Explorer la Plateforme Rouillée", txt: "Ton masque filtrant te protège des vapeurs. Explore la plateforme dans le Gisement Noir." },
    ["dynamite", "Les Pics Fracturés ne s’ouvriront qu’à l’explosif."],
    { k: "pass", z: "montagnes", n: "Vers les Pics Fracturés", txt: "Les Pics n’ont qu’un col. Il faut l’ouvrir, puis le tenir." },
    ["titane", "Le métal le plus noble des montagnes."],
    ["autoclave", "Pour les composites, il faut cuire sous pression. L’autoclave ouvre le geste Stratifier."],
    ["composite", "Il te faut le matériau des fusées : léger, et plus dur que l’acier."],
    ["centre_num", "Un calculateur peut guider un outil mieux qu’une main. Le centre d’usinage numérique."],
    ["fusee", "Construis une fusée pour monter en orbite."],
    { k: "pass", z: "orbite", n: "Vers l’Orbite", txt: "Il faut une rampe de lancement, et de quoi repartir." },
    ["alunisseur", "Pose le pied sur la Lune."],
    { k: "pass", z: "lune", n: "Vers la Lune", txt: "Pour rester sur la Lune, il faut de quoi s’y abriter." },
    ["reacteur_fusion", "Une étoile en bouteille. Tous tes extracteurs récoltent 1,5 fois plus vite."],
    ["vaisseau", "Cap sur Mercure."],
    { k: "pass", z: "mercure", n: "Vers Mercure", txt: "Si près du soleil, rien ne tient sans bouclier." },
    ["forge_stellaire", "Le cœur d’une étoile, à 50 000 °C. La forge stellaire ouvre le geste Transmuter."],
    ["matrice", "Il reste à fabriquer sans façonner : donne la matière, la matrice fait l’objet."]
  ];

  /* ------------------------------------------------- PASSAGES ET MÉMOIRE (voir docs/PROGRESSION.md)
   * Un passage par terre : l’objet qui ouvrait la terre le rend possible, la terre
   * s’ouvre quand il est payé (on verse depuis la Réserve, en plusieurs fois si besoin).
   * tr : les Souvenirs qu’il rapporte à la relève. Prix réglés avec tools/sim-passages.js :
   * première partie arrêtée vers les Collines (~25 min), chaque relève va une terre plus loin. */
  D.PASSAGES = {
    plaine: { n: "Le Sentier des Herbes", t: "Les herbes de la plaine sont plus hautes que toi. Il faut s’y frayer un chemin, et des pierres pour le marquer.", cost: { bois: 360, fibre: 240, caillou: 120 }, tr: 2 },
    riviere: { n: "La Passerelle", t: "La rivière est large et lente. Une passerelle de bois, liée de cuir et d’os, te mènerait sur l’autre rive.", cost: { bois: 10800, cuir: 1620, os: 2160 }, tr: 3 },
    collines: { n: "Les Marches", t: "Les collines sont raides. Des marches taillées dans la pierre et cuites dans l’argile y monteraient.", cost: { caillou: 48000, argile: 1920, brique: 480 }, tr: 5 },
    mine: { n: "Le Puits d’Entrée", t: "Pour descendre dans les Profondeurs, il faut un puits étayé, et du métal pour le tenir.", cost: { caillou: 64000, plaque_cuivre: 1920, lingot_bronze: 1280 }, tr: 8 },
    desert: { n: "La Route du Verre", t: "Le désert brûle les roues. Une route de planches, cerclée de bronze, le traverserait.", cost: { bois: 160000, plaque_bronze: 3000, roue: 400 }, tr: 12 },
    gisement: { n: "La Tranchée", t: "Le Gisement Noir dort loin sous la croûte. Une tranchée d’acier et de câbles y descendrait.", cost: { plaque_fer: 4500, lingot_acier: 1800, cable: 600 }, tr: 18 },
    montagnes: { n: "Le Col", t: "Les Pics Fracturés n’ont qu’un seul col. Il faut l’ouvrir, puis le tenir.", cost: { lingot_acier: 4500, plastique: 720, moteur_elec: 108 }, tr: 27 },
    orbite: { n: "La Rampe", t: "Il faut une rampe de lancement, et de quoi repartir.", cost: { aluminium: 4500, titane: 900, composite: 900 }, tr: 40 },
    lune: { n: "La Base avancée", t: "Pour rester sur la Lune, il faut de quoi s’y abriter.", cost: { titane: 4500, composite: 2700, debris: 6000 }, tr: 60 },
    mercure: { n: "Le Bouclier solaire", t: "Si près du soleil, rien ne tient sans bouclier.", cost: { regolithe: 18000, helium3: 4500, composite: 6000 }, tr: 90 }
  };
  /* Une règle par terre, à l’essai : ce qui change ici par rapport aux autres terres.
   * tap : la récolte à la main × mult, sauf si l’on a sur soi un des objets de « sans » ;
   * ext : au-delà de max extracteurs sur un même gisement, chacun rend mult ;
   * chaleur : les extracteurs de la terre rendent mult, sauf si l’on a sur soi un des objets de « sans » ;
   * remise : chaque lieu exploré ici retire par au prix du passage « vers », jusqu’à max fois. */
  D.REGLES = {
    riviere: { n: "Le courant", t: "L’eau emporte ce qui s’entasse. Au-delà de 6 extracteurs sur un même gisement, les suivants rendent moitié moins.", ext: { max: 6, mult: 0.5 } },
    collines: { n: "Les marches", t: "Chaque lieu exploré ici retire 8 % au prix du passage vers les Profondeurs, deux fois au plus.", remise: { vers: "mine", par: 0.08, max: 2 } },
    mine: { n: "Il fait noir", t: "Sans torche ni lampe sur toi, tes mains rapportent 40 % de moins.", ok: "Ta lumière tient : tes mains rapportent tout.", tap: { sans: ["torche", "lampe"], mult: 0.6 } },
    desert: { n: "Le verre coupe", t: "Sans gants de peau, tes mains rapportent 40 % de moins.", ok: "Tes gants tiennent : tes mains rapportent tout.", tap: { sans: ["gants"], mult: 0.6 } },
    orbite: { n: "Le vide", t: "Ici, tes mains ne rapportent que le quart. Ce sont les extracteurs qui travaillent.", tap: { mult: 0.25 } },
    gisement: { n: "Les vapeurs", t: "Le pétrole sent fort. Sans masque filtrant sur toi, tes mains rapportent 40 % de moins.", ok: "Ton masque tient : tes mains rapportent tout.", tap: { sans: ["masque"], mult: 0.6 } },
    montagnes: { n: "L’air est mince", t: "Sans bouteille d’air sur toi, tes mains rapportent 40 % de moins.", ok: "Ta bouteille tient : tes mains rapportent tout.", tap: { sans: ["bouteille"], mult: 0.6 } },
    mercure: { n: "La chaleur", t: "Sans bouclier thermique sur toi, tes extracteurs rendent 40 % de moins.", ok: "Ton bouclier tient : tes extracteurs rendent tout.", chaleur: { sans: ["bouclier_th"], mult: 0.6 } },
    lune: { n: "Tout est léger", t: "La pesanteur est faible : tes mains rapportent 50 % de plus.", tap: { mult: 1.5 } }
  };

  /* La Mémoire des mains : ce qu’un Semeur laisse au suivant, acheté avec les Souvenirs. */
  D.MEMOIRE = [
    { id: "recolte", n: "Mains calleuses", ic: "✋", d: "Récolte à la main ×{v}.", v: (l) => 1 + l, cost: [2, 4, 8, 18, 36, 70, 130, 240, 440, 800] },
    { id: "mains", n: "Mains sûres", ic: "⏱️", d: "Fabrication à la main : durée ×{v}, et {p} de chances de gagner une pièce en plus.", v: (l) => Math.round(Math.pow(0.8, l) * 100) / 100, bonus: (l) => Math.min(0.9, Math.round(l * 10) / 100), cost: [2, 4, 7, 13, 23, 45, 85, 160] },
    { id: "extr", n: "Mémoire des gisements", ic: "⛏️", d: "Production des extracteurs ×{v}.", v: (l) => 1 + 0.5 * l, cost: [3, 5, 8, 13, 23, 38, 62, 100, 180, 330, 600, 1100] },
    { id: "mach", n: "Rouages huilés", ic: "⚙️", d: "Vitesse des machines ×{v}.", v: (l) => 1 + 0.25 * l, cost: [5, 8, 13, 21, 36, 60, 98, 160, 290, 530, 960, 1750] },
    { id: "chemins", n: "Chemins connus", ic: "🚧", d: "Prix des passages ×{v}.", v: (l) => Math.round(Math.pow(0.9, l) * 100) / 100, cost: [4, 8, 16, 34, 70, 140, 270, 520] },
    { id: "paquetage", n: "Le paquetage", ic: "🎒", next: true, d: "Au réveil : {v}.", v: (l) => ["rien", "du bois, des fibres, des cailloux, 4 manches et 4 cordes", "la même chose, et une cabane", "la même chose, trois cabanes et un feu de camp"][l], cost: [2, 6, 15] },
    { id: "raccourci", n: "Raccourci", ic: "🗺️", next: true, d: "Au réveil : {v}.", v: (l) => ["rien", "la Plaine déjà ouverte, et ton épieu", "la Plaine et la Rivière déjà ouvertes", "jusqu’aux Collines déjà ouvertes, avec leurs outils", "jusqu’aux Profondeurs déjà ouvertes, avec leurs outils"][l], cost: [6, 15, 35, 75] },
    { id: "oeil", n: "Coup d’œil", ic: "✨", d: "Récolte à la main : {v} de chances de récolter le double.", v: (l) => Math.round((0.06 + 0.04 * l) * 100) + " %", cost: [3, 6, 12, 26, 52, 100, 190, 360] },
    { id: "veille", n: "Longues nuits", ic: "🌙", d: "Jeu fermé, le temps continue de compter jusqu’à {v} h.", v: (l) => 12 + 6 * l, cost: [4, 10, 30, 80] }
  ];
  /* Résonances Stellaires : améliorations infinies à coût exponentiel pour le late-game */
  D.TRANSCENDANCE = [
    {
      id: "trans_main",
      n: "Surmultiplication des mains",
      ic: "⚡",
      d: "Récolte à la main ×{v}.",
      v: (l) => Math.pow(2, l),
      cost: (l) => Math.round(50 * Math.pow(2.5, l))
    },
    {
      id: "trans_terre",
      n: "Pulsion des gisements",
      ic: "🌋",
      d: "Récolte des extracteurs ×{v}.",
      v: (l) => Math.round(Math.pow(1.75, l) * 100) / 100,
      cost: (l) => Math.round(70 * Math.pow(2.4, l))
    },
    {
      id: "trans_mach",
      n: "Surrégime des machines",
      ic: "⚙️",
      d: "Vitesse des machines et des commandes ×{v}.",
      v: (l) => Math.round(Math.pow(1.6, l) * 100) / 100,
      cost: (l) => Math.round(85 * Math.pow(2.3, l))
    }
  ];
  /* ce que contient le paquetage, niveau par niveau (cumulé) */
  D.PAQUETAGE = [{ bois: 60, fibre: 60, caillou: 30, manche: 4, corde: 4 }, { cabane: 1 }, { cabane: 2, feu: 1 }];

  /* ===== LES DONS DE LA RELÈVE (0.9) =====
   * À chaque relève (dès le cycle 2), le Semeur trouve trois dons tirés au hasard ; il en garde un
   * pour ce cycle seulement. Ils s’ajoutent à la Mémoire des mains.
   * e : { tap: { r: [ressources] | "*", v }, ext: { z: [terres] | "*", v }, mach, mains, pass, crit, intu, veille, vente, paq }
   *   tap   récolte à la main × v pour ces ressources ; ext : extracteurs × v dans ces terres ;
   *   mach  vitesse des machines × ; mains : durée des fabrications à la main × ; pass : prix des passages × ;
   *   crit  points de chance de récolte double en plus ; intu : Intuition gagnée × ; veille : temps d’absence compté × ;
   *   vente prix de vente au Troqueur × ; paq : matières en plus au réveil.
   * d : la phrase affichée, avec le chiffre. */
  D.DONS = [
    { id: "hache", n: "La hache usée", ic: "🪓", d: "À la main, le bois, les fibres, les os et le cuir rapportent 30 % de plus.", e: { tap: { r: ["bois", "fibre", "os", "cuir"], v: 1.3 } } },
    { id: "pierre", n: "La pierre tiède", ic: "🪨", d: "À la main, les cailloux, le silex, l’argile, le sable et le quartz rapportent 30 % de plus.", e: { tap: { r: ["caillou", "silex", "argile", "sable", "quartz"], v: 1.3 } } },
    { id: "pic", n: "Le pic cabossé", ic: "⛏️", d: "À la main, les minerais et le charbon rapportent 30 % de plus.", e: { tap: { r: ["malachite", "cassiterite", "fer_min", "charbon", "bauxite", "ilmenite", "terres_rares"], v: 1.3 } } },
    { id: "scaphandre", n: "Le scaphandre rapiécé", ic: "🧑‍🚀", d: "À la main, le pétrole, les débris, l’hélium 3, le régolithe et le métal de Mercure rapportent 40 % de plus.", e: { tap: { r: ["petrole", "debris", "helium3", "regolithe", "metal_mercure"], v: 1.4 } } },
    { id: "mains_pleines", n: "Les mains pleines", ic: "🤲", d: "Tout ce que tu récoltes à la main rapporte 12 % de plus.", e: { tap: { r: "*", v: 1.12 } } },
    { id: "sac_lourd", n: "Le sac lourd", ic: "🎒", d: "Tu te réveilles avec 40 bois, 40 fibres, 25 cailloux et 4 cordes de plus.", e: { paq: { bois: 40, fibre: 40, caillou: 25, corde: 4 } } },
    { id: "bras", n: "Les bras de la terre", ic: "🦾", d: "Tous tes extracteurs produisent 15 % de plus.", e: { ext: { z: "*", v: 1.15 } } },
    { id: "rigoles", n: "Les rigoles", ic: "💧", d: "Dans la Lisière, la Plaine, la Rivière, les Collines et le Désert, les extracteurs produisent 30 % de plus.", e: { ext: { z: ["lisiere", "plaine", "riviere", "collines", "desert"], v: 1.3 } } },
    { id: "puits_noir", n: "Le puits noir", ic: "🕳️", d: "Dans les Profondeurs, le Gisement Noir et les Pics Fracturés, les extracteurs produisent 30 % de plus.", e: { ext: { z: ["mine", "gisement", "montagnes"], v: 1.3 } } },
    { id: "ciel_clair", n: "Le ciel clair", ic: "🌌", d: "En Orbite, sur la Lune et sur Mercure, les extracteurs produisent 40 % de plus.", e: { ext: { z: ["orbite", "lune", "mercure"], v: 1.4 } } },
    { id: "burette", n: "La burette", ic: "🛢️", d: "Les machines vont 20 % plus vite.", e: { mach: 1.2 } },
    { id: "doigts", n: "Les doigts souples", ic: "🧵", d: "Les fabrications à la main durent 20 % de moins.", e: { mains: 0.8 } },
    { id: "route", n: "La route battue", ic: "🛤️", d: "Les passages coûtent 15 % de moins.", e: { pass: 0.85 } },
    { id: "main_heureuse", n: "La main heureuse", ic: "🍀", d: "Tes récoltes à la main ont 12 % de chances de plus de rapporter le double.", e: { crit: 0.12 } },
    { id: "carnet_cornu", n: "Le carnet cornu", ic: "📓", d: "Tu gagnes 30 % d’Intuition en plus.", e: { intu: 1.3 } },
    { id: "sommeil", n: "Le sommeil lourd", ic: "🛌", d: "Quand tu es absent, le temps compte 25 % plus longtemps.", e: { veille: 1.25 } },
    { id: "bourse", n: "La bourse du Troqueur", ic: "👛", d: "Le Troqueur te paie 25 % de plus pour ce que tu lui vends.", e: { vente: 1.25 } }
  ];
  D.DONS_OFFRE = 3; // combien de dons sont proposés à chaque relève

  /* ===== LES SEUILS PAR GISEMENT (0.9) =====
   * Quand un même gisement porte 10, 25, 50, 100 extracteurs, sa production est multipliée par mult à
   * chaque seuil. Pas de seuils là où une règle de terre limite déjà les extracteurs (la Rivière). */
  D.SEUILS = { paliers: [10, 25, 50, 100], mult: 1.25 };

  /* ===== LES JOURS DE PRÉSENCE (0.9) =====
   * Un compteur de jours où tu es venu. Jamais une série : rater un jour ne retire rien.
   * base : le petit cadeau de chaque jour ; paliers : un cadeau plus gros au jour n (t : une phrase en plus). */
  D.JOURS = {
    base: { intu: 2, tr: 1 },
    paliers: {
      3: { intu: 4, tr: 2 },
      7: { intu: 6, tr: 3, t: "Il est dangereux d’y aller seul. Prends ceci." },
      14: { intu: 8, tr: 5 },
      30: { intu: 12, tr: 8 },
      60: { intu: 16, tr: 12 },
      100: { intu: 25, tr: 20 }
    }
  };

  /* Coup de chance : de temps en temps, un appui récolte double (6 % au départ, +4 % par
   * niveau de « Coup d’œil » dans la Mémoire des mains). */
  D.CRIT = { chance: 0.06, up: 0.04, mult: 2 };

  /* Un âge accompli (toutes ses étapes faites) rapporte un peu d’Intuition. */
  D.AGE_DONE = 3;
  /* Découvrir coûte peu : une découverte qui demanderait plus que ça (en tout) ne prend
   * rien ; la recette s’inscrit, et on choisit ensuite de la fabriquer, prix affiché. */
  D.DISCOVER_FREE = 6;
  /* La première pièce est offerte (le Labo, 0.39) : une trouvaille inscrite sans rien prendre
   * donne tout de même un exemplaire, si l’ouvrage coûte au plus `max` matières en tout. Le
   * reste (quantités, temps, extracteurs, apprentis) se joue à l’Atelier. max: 0 désactive. */
  D.PREMIERE_PIECE = { max: 24 };

  /* Un Grand Œuvre alimenté se sert seul dans la Réserve : au plus ça par seconde et
   * par matière, à chaque âge (les améliorations qui accélèrent les machines comptent). */
  D.SITE_RATE = [3, 4, 6, 10, 14, 18, 30, 40, 50, 60, 70, 140, 300, 500, 1500];

  /* Les mains : fabriquer à la main prend du temps, une pièce après l’autre.
   * Durée d’une pièce (s) : (base + age × âge de l’objet) × (1 − star × étoiles de maîtrise)
   * × old^(âges d’écart avec l’objet), multipliée pour les objets uniques (outils,
   * stations…) et pour ceux dont le prix monte à chaque exemplaire (extracteurs, machines).
   * n pièces d’affilée : durée d’une pièce × n^batch. max : fabrications dans la file.
   * ageCurve : progression non-linéaire sur les âges avancés (les pièces complexes demandent du soin).
   * fatigueBase : pénalité arbitraire de fatigue du cycle quand le Semeur s'aventure trop loin sans relève.
   * machDecay : ralentissement des machines sur les objets d'âges élevés (aide sans annuler l'effort). */
  D.HAND = { base: 0.5, age: 0.2, star: 0.1, old: 0.75, batch: 0.6, unique: 3, scaled: 2, max: 8, ageCurve: 1.08, fatigueBase: 1.15, machDecay: 1.08 };

  /* Les gestes, et la récolte à la main, sont des compétences : chaque pièce faite à la
   * main (pas par une machine) et chaque récolte rapportent de l’expérience. Un niveau
   * rend le geste plus rapide (speed par niveau) ; certains paliers donnent une chance
   * de pièce en plus (perk par palier). À la relève, il reste keep de l’expérience.
   * La courbe est celle des grands jeux du genre, multipliée par k. */
  D.SKILL = { max: 99, k: 1, speed: 0.01, perks: [10, 25, 50, 75, 99], perk: 0.04, keep: 0.1, xp: 1, tapXp: 1, harvest: 1.5 };
  D.SKILL_RECOLTE = { n: "Récolte", ic: "🧺", d: "Récolter à la main, sur les gisements." };

  /* Réminiscences de guidage : quand le joueur cherche (combinaisons nouvelles à
   * l’Atelier), la narratrice présente les pistes comme des souvenirs. */
  D.GUIDE = {
    tries: [6, 14, 26], // souvenirs à réunir pour le geste, une ressource, puis la recette
    lines: [
      ["Tu retrouves le geste sans savoir où tu l’as appris : {g}.",
        "Tes doigts esquissent un mouvement tout seuls, avant que tu y penses : {g}.",
        "Un geste te revient, comme si tu l’avais fait mille fois : {g}."],
      ["Tu te souviens d’avoir vu quelqu’un tenir {i}, avant ton arrivée.",
        "Tu revois quelqu’un poser {i} sur une pierre plate. Tu ne reconnais pas son visage.",
        "Un souvenir qui n’est pas à toi remonte : une odeur, un bruit, et au milieu, nettement, {i}."],
      ["Tout te revient d’un coup. La recette s’inscrit dans ton Carnet.",
        "Tout se remet en place, comme si tu l’avais toujours su. La recette s’inscrit dans ton Carnet.",
        "Tu retrouves la suite des gestes. La recette s’inscrit dans ton Carnet."]
    ]
  };

  /* Le Comptoir : marché tenu par le Troqueur dans la Plaine */

  /* Les ateliers (0.40) et leurs travailleurs (0.41) : une seule source pour le moteur et l'interface.
   * Les valeurs (chevaux, âges, coûts) sont PROVISOIRES : elles se règlent ici. Étude :
   * docs/revue/etude-ateliers-a-travers-les-ages-0-39.md */
  D.ATELIERS = {
    familles: [
    { id: "artisanat", n: "Artisanat", ic: "🪵", d: "Le bois, les fibres, le verre, la brique." },
    { id: "construction", n: "Construction", ic: "🏗️", d: "Les extracteurs, les machines, les installations, les améliorations." },
    { id: "elevage", n: "Élevage", ic: "🐑", d: "Ce que laissent les bêtes : os, cuir, laine." },
    { id: "metallurgie", n: "Métallurgie", ic: "⚒️", d: "Les métaux, du cuivre à l’uranium." },
    { id: "chimie", n: "Chimie et matériaux", ic: "⚗️", d: "Le pétrole, les plastiques, les composites." },
    { id: "centrales", n: "Centrales", ic: "⚡", d: "L’énergie, de la bête de trait à la fusion." },
    { id: "electronique", n: "Électronique", ic: "🔌", d: "Des circuits aux processeurs et aux robots." },
    { id: "artistique", n: "Arts et lettres", ic: "✒️", d: "L’écriture, l’encre, la musique." }
  ],
    de: {
    artisanat: "manche corde archet torche eclat engrenage_bois brique brique_refr verre poudre_quartz lentille verre_trempe roue",
    elevage: "aiguille laniere colle_os gants soufflet",
    metallurgie: "lingot_cuivre plaque_cuivre fil_cuivre lingot_etain lingot_bronze plaque_bronze engrenage ressort loupe lingot_fer plaque_fer clous chainon lingot_acier acier_trempe lame engrenage_acier vis roulement piston tuyau_cuivre soupape chaudiere lingot_plomb plaque_plomb pastille_uranium cuivre_pur aluminium titane aimant aimant_neo supra alliage_ancien",
    chimie: "naphta plastique resine dynamite caoutchouc joint_souple tuyau_souple masque bouteille composite fibre_carbone tissu_carbone ceramique bouclier_th graphene metamateriau",
    centrales: "moteur_vapeur circuit_vapeur condenseur manometre regulateur bobine batterie moteur_elec barre_combustible graphite echangeur moteur_fusee propulseur panneau_dyson antimatiere matiere_exotique",
    electronique: "ampoule cable silicium wafer puce processeur cellule circuit",
    artistique: "papier encre"
  },
    deAutres: {
    artisanat: "panier feu epieu arc fronde hache_pierre pioche_pierre couteau four enclume_pierre creuset chariot brouette palan lampe courroies lunette",
    elevage: "outre pic_os tunique",
    metallurgie: "ciseau hache_bronze pioche_bronze enclume_bronze bas_fourneau haut_fourneau bac_trempe tour outils_fer outils_acier marteau_pilon foreuse outillage four_arc forge_stellaire convoyeurs",
    chimie: "autoclave",
    centrales: "moulin recuperation_vapeur chaudiere_tubulaire dynamo centrale centrale_fission reacteur reacteur_fusion refroidissement locomotive pompe fusee alunisseur vaisseau compteur_geiger",
    electronique: "telegraphe radio eclairage reseau capteurs ordinateur robots ia drones lithographe radiotelescope serveur_archives",
    artistique: "papyrus presse_imprimer"
  },
    brut: {
    os: "elevage", cuir: "elevage",
    bois: "artisanat", fibre: "artisanat", caillou: "artisanat", argile: "artisanat", silex: "artisanat", sable: "artisanat", quartz: "artisanat", poudre_rouge: "artisanat", resonite: "artisanat",
    malachite: "metallurgie", cassiterite: "metallurgie", fer_min: "metallurgie", galene: "metallurgie", bauxite: "metallurgie", ilmenite: "metallurgie", terres_rares: "metallurgie", metal_mercure: "metallurgie", uranium: "metallurgie",
    petrole: "chimie", soufre: "chimie",
    helium3: "centrales", regolithe: "centrales", debris: "centrales"
  },
    priorite: ["metallurgie", "chimie", "electronique", "centrales", "elevage", "artistique", "artisanat"],
    echelons: [
    /* 0.44.3 : l'échelle est celle de la force motrice et du guidage de la machine (les apprentis et les ouvriers sont une autre échelle, celle de la main-d'œuvre).
     * 0.45 : chaque marche a sa machine (une tous les deux âges environ). */
    { id: "manuel", n: "Manuel", age: 0 },
    { id: "mecanisme", n: "Mécanisme", age: 2 },
    { id: "hydraulique", n: "Hydraulique", age: 6 },
    { id: "vapeur", n: "Vapeur", age: 7 },
    { id: "chaine", n: "Chaîne", age: 8 },
    { id: "robotique", n: "Robotique", age: 12 },
    { id: "synthese", n: "Synthèse", age: 14 }
  ],
    paliers: [
    { id: "automate_bois", echelon: 1, ch: 3 },
    { id: "automate_bronze", echelon: 1, ch: 10 },
    { id: "martinet", echelon: 2, ch: 25 },
    { id: "presse_vapeur", echelon: 3, ch: 50 },
    { id: "poste_elec", echelon: 4, ch: 100 },
    { id: "chaine", echelon: 4, ch: 200 },
    { id: "centre_num", echelon: 5, ch: 600 },
    { id: "assembleur", echelon: 5, ch: 1500 },
    { id: "matrice", echelon: 6, ch: 5000 }
  ],
    sources: [
    { id: "moulin", ch: 20 }, { id: "recuperation_vapeur", ch: 40 }, { id: "chaudiere_tubulaire", ch: 60 },
    { id: "dynamo", ch: 150 }, { id: "centrale", ch: 600 }, { id: "centrale_fission", ch: 2000 },
    { id: "reacteur", ch: 5000 }, { id: "reacteur_fusion", ch: 20000 }
  ],
    baseCh: 10,
    /* 0.58 : les sources à flamme ou à atome brûlent un combustible de la Réserve, une unité toutes les « s » secondes, tant que le jeu est ouvert et que quelque chose travaille. Réserve vide : la source s'arrête (jamais de perte d'objet, la réserve se remplit comme avant). Les autres (moulin, vapeur récupérée, dynamo, réacteur chimique) n'en veulent pas. */
    combustibles: {
      chaudiere_tubulaire: { id: "charbon", s: 40 },
      centrale: { id: "charbon", s: 15 },
      centrale_fission: { id: "uranium", s: 60 },
      reacteur_fusion: { id: "helium3", s: 90 }
    },
    /* en dessous de ce nombre de secondes de réserve, on prévient */
    combustibleAlerte: 120,
    /* 0.58 : l'usure des machines. Une machine qui travaille s'use (monte : secondes de travail continu pour atteindre 1) ; à 1, un exemplaire tombe en panne et ne travaille plus jusqu'à réparation, au plus la moitié du parc d'un type à la fois. Au repos l'usure redescend (repos : secondes pour la vider). On prévient à « alerte ». Réparer ou entretenir coûte « cout » fois le prix d'un apprenti de l'âge, et ramène l'usure à « apres ». Jeu fermé : rien ne s'use, et toute panne est réparée au retour. */
    pannes: { monte: 2700, repos: 1200, alerte: 0.75, cout: 3, apres: 0.2, partMax: 0.5 },
    /* 0.44 : l'énergie agit. Machines et travailleurs tournent à offre / demande de leur vitesse, jamais en dessous de ce plancher (0,5 : la moitié). 1 : l'énergie ne ralentit rien. */
    plancherEnergie: 0.5,
    /* Construction : tout ce qui se bâtit (extracteur, machine, installation, amélioration), sauf ce qui appartient à un métier d'énergie,
     * de chimie, d'électronique ou de lettres (le moulin, la centrale, le réacteur, la presse…). */
    construction: { types: ["ext", "mach", "stat", "upg"], garde: ["centrales", "electronique", "chimie", "artistique"] }
  };
  /* Un apprenti travaille à la moitié de la vitesse des mains, un ouvrier à la même vitesse, pour les recettes de
   * son atelier. Embaucher coûte des écus (de plus en plus cher à chaque embauche), sans salaire ensuite. */
  /* 0.45.1 : le prix d'une embauche suit le niveau des prix. `cout` est le prix à l'âge où le travailleur s'ouvre ; à chaque âge de plus il est multiplié par
   * `parAge` (la même hausse que la valeur d'une matière au Comptoir, D.COMPTOIR.rawAge). Un apprenti coûte ainsi toujours une vingtaine de matières brutes
   * de l'âge, un ouvrier huit : embaucher tôt est moins cher qu'embaucher tard. 1 : prix fixe. */
  /* 0.51 : la voix des travailleurs (E.voix). Une phrase par métier et par sujet ; {de} devient « de bois », « d’éclat de silex » ; {liste} « 40 × corde, 12 × manche ».
   * cooldown : secondes avant de répéter le même sujet ; manqueApres : secondes d'attente d'une matière avant de le dire ; previsionSous : la Réserve
   * se viderait en moins de ce nombre de secondes ; retourApres : absence minimale (secondes) pour un compte rendu. */
  D.VOIX = {
    cooldown: 600, manqueApres: 30, previsionSous: 300, retourApres: 300, histoMax: 20,
    metiers: {
      artisanat: { retour: "Patron, pendant votre absence, nous avons fabriqué : {liste}.", manque: "Patron, nous manquons {de} à l’établi !", prevision: "Patron, nous allons bientôt manquer {de}.",
        fatigue: "Patron, les mains sont lasses : on ne tiendra pas ce rythme longtemps.", greve: "Patron, on pose les outils : grève, tant qu’on n’a pas soufflé !", reprise: "Patron, nous avons repris notre souffle et nous nous remettons à l’ouvrage." },
      construction: { retour: "Chef, le chantier n’a pas chômé : {liste}.", manque: "Chef, le chantier manque {de} !", prevision: "Chef, le chantier va bientôt manquer {de}.",
        fatigue: "Chef, les gars sont sur les rotules.", greve: "Chef, le chantier est à l’arrêt : les bâtisseurs font grève !", reprise: "Chef, le chantier repart." },
      elevage: { retour: "Patron, les bêtes ont donné pendant votre absence : {liste}.", manque: "Patron, l’étable manque {de} !", prevision: "Patron, l’étable va bientôt manquer {de}.",
        fatigue: "Patron, les bêtes et les bergers n’en peuvent plus.", greve: "Patron, plus personne à l’étable : grève !", reprise: "Patron, l’étable est de nouveau sur pied." },
      metallurgie: { retour: "Patron, la forge n’a pas refroidi : {liste}.", manque: "Patron, la forge manque {de} !", prevision: "Patron, bientôt la forge manquera {de}.",
        fatigue: "Patron, les forgerons n’ont plus de bras : le feu aura leur peau.", greve: "Patron, la forge est éteinte : les forgerons font grève !", reprise: "Patron, la forge se rallume." },
      chimie: { retour: "Patron, les cornues ont travaillé en votre absence : {liste}.", manque: "Patron, nous manquons {de} au laboratoire !", prevision: "Patron, nous allons bientôt manquer {de} au laboratoire.",
        fatigue: "Patron, nous avons les mains qui tremblent : il faut ralentir.", greve: "Patron, le laboratoire ferme boutique : grève des chimistes !", reprise: "Patron, le laboratoire reprend ses distillations." },
      centrales: { retour: "Patron, la centrale a tourné sans vous : {liste}.", manque: "Patron, la centrale manque {de} !", prevision: "Patron, la centrale va bientôt manquer {de}.",
        fatigue: "Patron, les équipes de la centrale sont à bout.", greve: "Patron, la centrale tourne au ralenti : les centraliers font grève !", reprise: "Patron, la centrale reprend son service." },
      electronique: { retour: "Patron, pendant votre absence, nous avons assemblé : {liste}.", manque: "Patron, il n’y a plus {de} pour les circuits !", prevision: "Patron, nous allons bientôt manquer {de}.",
        fatigue: "Patron, les yeux piquent sur les circuits : une pause s’impose.", greve: "Patron, les électroniciens débranchent : grève !", reprise: "Patron, les établis électroniques se rallument." },
      artistique: { retour: "Patron, le scriptorium a produit en votre absence : {liste}.", manque: "Patron, le scriptorium manque {de} !", prevision: "Patron, bientôt le scriptorium manquera {de}.",
        fatigue: "Patron, les plumes tremblent : le scriptorium est à bout.", greve: "Patron, le scriptorium se tait : les lettrés font grève !", reprise: "Patron, les lettrés reprennent la plume." }
    },
    /* les planches d'illustration (assets/travailleurs, 2000 × 1116) : origine (x, y) et taille (w, h) de la première case, pas vertical py entre les deux rangées ; 4 cases par rangée */
    planches: {
      /* 0.60 : les huit métiers ont une rangée de huit portraits (une case par âge) */
      artisanat: { w: 216, h: 300, W: 1728, H: 300 },
      construction: { w: 216, h: 300, W: 1728, H: 300 },
      elevage: { w: 216, h: 300, W: 1728, H: 300 },
      metallurgie: { w: 216, h: 300, W: 1728, H: 300 },
      chimie: { w: 216, h: 300, W: 1728, H: 300 },
      centrales: { w: 216, h: 300, W: 1728, H: 300 },
      electronique: { w: 216, h: 300, W: 1728, H: 300 },
      artistique: { w: 216, h: 300, W: 1728, H: 300 }
    }
  };
  /* 0.56 : le vocabulaire des gestes, métier par métier (affichage seulement, dans le Labo d'un métier). Les gestes gardent leur identifiant et leur nom général
   * ailleurs (Carnet, fiches, Progression, guide) ; docs/revue/probleme-gestes-metiers.md. Un geste absent d'un métier garde son nom général. */
  D.GESTES_METIER = {
    artisanat: { tailler: "Tailler", tresser: "Tresser", assembler: "Monter", chauffer: "Cuire", tremper: "Tremper" },
    construction: { construire: "Bâtir", tailler: "Équarrir", chauffer: "Étuver" },
    elevage: { assembler: "Coudre", tailler: "Tailler", chauffer: "Faire bouillir" },
    chimie: { assembler: "Conditionner", chauffer: "Distiller", synthetiser: "Synthétiser", tailler: "Découper", tresser: "Tisser", construire: "Monter", stratifier: "Stratifier" },
    metallurgie: { chauffer: "Fondre", marteler: "Marteler", tailler: "Étirer", assembler: "Monter", allier: "Allier", tremper: "Tremper", usiner: "Usiner", electriser: "Électrolyser" },
    centrales: { construire: "Bâtir", assembler: "Monter", usiner: "Bobiner", electriser: "Électriser", chauffer: "Pyrolyser", transmuter: "Transmuter", stratifier: "Stratifier" },
    electronique: { assembler: "Monter", tresser: "Câbler", construire: "Installer", chauffer: "Purifier", tailler: "Trancher", graver: "Graver" },
    artistique: { chauffer: "Macérer", construire: "Dresser", assembler: "Presser" }
  };
  D.TRAVAILLEURS = {
    parAge: 2.5,
    /* 0.51 : les travailleurs d'un métier fabriquent en continu, sans ordre, les composants connus de leur métier (déjà faits une fois à la main)
     * tant que leur stock est sous le seuil du métier (S.ateliers[métier].seuil, en %, par pas de 10) : seuil % du « stock de confort » de la
     * recette = base × parAge^(âge de la recette − 1), au plus max. generalistes: false rend le jeu d'avant (cadences seules). */
    generalistes: true,
    /* 0.57 : la fatigue et la grève. Chaque métier a une jauge de fatigue de 0 à 1. Elle MONTE pendant que le jeu est ouvert quand ses travailleurs fabriquent seuls (production libre et ordres permanents)
     * plus des deux tiers du temps (monte : secondes de travail continu pour la remplir ; l'énergie qui manque l'accélère de « energie » fois le manque) et DESCEND
     * quand ils se reposent (repos : secondes de repos complet pour la vider). À 1, grève : le métier ne fabrique plus rien seul (la file de commandes continue).
     * Elle s'arrête quand la fatigue retombe sous « reprise », ou tout de suite contre une prime (prime × le prix d'un apprenti de l'âge). Jeu fermé, les travailleurs se reposent. */
    fatigue: { monte: 1800, repos: 900, energie: 2, alerte: 0.7, reprise: 0.4, prime: 2, apresPrime: 0.3 },
    seuilDefaut: 10,
    /* les paliers du seuil, nommés (le joueur ne voit pas de pourcentage) : p = part du stock de confort jusqu'à laquelle on fabrique */
    paliers: [
      { p: 0, n: "À l’arrêt", d: "Personne ne fabrique seul : les travailleurs ne servent que ta file de commandes." },
      { p: 10, n: "Au jour le jour", d: "Juste de quoi ne pas être pris de court : une petite réserve de chaque pièce." },
      { p: 30, n: "Quelques provisions", d: "Un peu d’avance sur chaque pièce, de quoi tenir une absence." },
      { p: 50, n: "Bien garni", d: "Les étagères se remplissent à moitié : beaucoup de ressources partent en pièces." },
      { p: 100, n: "À ras bord", d: "Toute pièce connue monte jusqu’à la réserve pleine. Gourmand en ressources." }
    ],
    confort: { base: 20, parAge: 1.5, max: 200 },
    /* 0.51 : chaque métier a ses travailleurs, nommés d'après ce qu'ils font (affichage seulement : le jeu garde « apprenti » et « ouvrier ») */
    noms: {
      artisanat: { apprenti: "Apprenti artisan", ouvrier: "Artisan" },
      construction: { apprenti: "Apprenti bâtisseur", ouvrier: "Bâtisseur" },
      elevage: { apprenti: "Apprenti éleveur", ouvrier: "Éleveur" },
      metallurgie: { apprenti: "Apprenti forgeron", ouvrier: "Forgeron" },
      chimie: { apprenti: "Apprenti chimiste", ouvrier: "Chimiste" },
      centrales: { apprenti: "Apprenti centralier", ouvrier: "Centralier" },
      electronique: { apprenti: "Apprenti électronicien", ouvrier: "Électronicien" },
      artistique: { apprenti: "Apprenti copiste", ouvrier: "Lettré" }
    },
    apprenti: { n: "Apprenti", age: 3, mult: 0.5, ing: 2, ch: 1, cout: 40, croiss: 1.5, max: 3 },
    ouvrier: { n: "Ouvrier", age: 6, mult: 1, ing: 3, ch: 3, cout: 200, croiss: 1.5, max: 8 }
  };

  D.COMPTOIR = {
    zone: "plaine",   // le Comptoir s’ouvre avec cette terre
    raw: 0.1,         // valeur d’une matière première de l’âge 0, en écus
    rawAge: 2.5,      // ×2,5 par âge de la matière
    work: 1.25,       // bonus de travail par étape de recette
    sat: 2000,        // saturation : quantité qui divise le prix par deux pendant un cycle
    trace: 100,       // prix de le premier Souvenir, à l’âge 0
    traceAge: 1.8,    // ×1,8 par âge atteint
    traceUp: 1.5,     // ×1,5 à chaque Souvenir acheté pendant le cycle
    buy: 3,           // une matière achetée coûte 3 fois sa valeur
    /* À la relève, les écus deviennent des Souvenirs au plein tarif jusqu’à hauteur de ce que les passages du cycle
     * ont rapporté (au moins `plancher`), puis à `part` seulement au-delà : vendre reste toujours utile, mais ne remplace pas les passages. */
    plafond: { plancher: 3, part: 0.25 }
  };

  /* Les demandes du Troqueur : livrer des objets fabriqués contre des Souvenirs */
  /* Le Troqueur passe par à-coups : le temps se découpe en blocs de `bloc` secondes, chacun ouvert avec la probabilité `ouvre`
   * (tirée de la graine de la partie, donc la même hors ligne), jamais plus de `maxFerme` blocs fermés de suite. Une ouverture
   * apporte `slots` demandes, valables jusqu’à sa fermeture : pas de renouvellement dans une même ouverture.
   * Quantité d’une demande : ce que le joueur extrait en `minParTrace` minutes par Souvenir de récompense (entre `minMin` et `minMax`),
   * `main` appuis par seconde comptés pour la récolte à la main. */
  D.TROQUEUR = { slots: 3, share: 0.15, bloc: 10800, ouvre: 0.6, maxFerme: 3, minParTrace: 10, minMin: 10, minMax: 90, main: 0.5 };

  /* Le premier parcours : première renaissance obligatoire */
  D.PARCOURS = {
    gift: 3           // Souvenirs offerts lors de la relève obligatoire du cycle 1
  };

  /* Les ruines : ce qu’un Semeur a construit attend le suivant */
  D.RUINES = {
    cap: 3,           // nombre maximum d’exemplaires en ruine par machine ou extracteur
    part: 0.1,        // fraction du coût de base de la recette pour réparer
    echos: {
      cabane: "Les perches de frêne tenaient encore ; un nœud neuf suffit à tendre le toit.",
      carriere: "Le treuil grince puis reprend son pli, là où d’autres mains l’avaient laissé.",
      argiliere: "Sous la croûte sèche, la tranchée garde encore l’empreinte des pelles d’avant.",
      silo: "Les clayonnages ont blanchi au soleil, mais le fond est resté sec.",
      pecherie: "Les pieux de rive ont résisté au courant ; la nasse retrouve sa place.",
      pompe: "Un joint neuf amorce le cylindre : l’eau remonte aussitôt, claire et régulière.",
      charbonniere: "La meule froide sent encore la fumée lente du dernier Semeur.",
      mine_cuivre: "Les étais avaient fléchi sans rompre ; la galerie s’ouvre à nouveau.",
      mine_fer: "Sur le rail rouillé, la benne attendait à mi-pente.",
      mine_or: "Le tamis de bois porte encore quelques paillettes oubliées dans ses rainures.",
      sabliere: "Le vent avait recouvert la rampe, mais le châssis est intact.",
      mine_plomb: "La lampe accrochée à l’entrée avait gardé une mèche sèche.",
      soufriere: "Les conduits de pierre jaune fument dès qu’on dégage la bouche.",
      puits: "Le balancier d’acier repart d’un coup d’épaule, lourd et fidèle.",
      foreuse: "Les tiges de forage vibrent et retrouvent la veine profonde.",
      automate_bois: "Le contrepoids attendait à mi-course : sitôt tendu, l’échappement repart.",
      presse_mecanique: "Sous la graisse figée, la vis sans fin tourne sans jeu.",
      tour_vapeur: "La chaudière garde la trace des anciennes chauffes ; la soupape chante au premier souffle.",
      automate_elec: "Une étincelle franche au collecteur, et le bobinage reprend son ronronnement.",
      ligne_assemblage: "Les bras articulés s’alignent un à un sur leurs repères d’atelier.",
      ext: "Les fondations tenaient bon : quelques pièces suffisent à remettre l’ouvrage en route.",
      mach: "Sous la poussière du cycle passé, les engrenages n’attendaient qu’une main."
    }
  };

  /* Les commandes : le joueur commande un objet et une quantité, ses machines libres s’y mettent */
  D.COMMANDES = {
    firstByHand: true,     // la première fois qu’on fabrique une recette, c’est à la main
    sizes: [10, 50, 100, 1000]
  };

  /* Déchiffrer : révéler une recette inconnue étape par étape contre de l’Intuition */
  /* Illustrations des Grands Œuvres (assets/oeuvres/) : <id>.webp montre l’œuvre achevée ;
   * une étape qui a sa vignette la nomme ici, les autres reprennent l’œuvre entière. */
  D.OEUVRE_ETAPES = { dyson: ["dyson-1", "dyson-2", "dyson-3", "dyson-4"], brisemonde: ["brisemonde-1", "brisemonde-2", "brisemonde-3", "brisemonde-4"] };
  D.oeuvreArt = (pid, step) => ((D.OEUVRE_ETAPES[pid] || [])[step] || pid);

  D.DECHIFFRER = { cost: [3, 8, 20] };

  D.CHANGES = [
    "🏷️ Passe de vocabulaire. Un seul mot par chose : « ressource » partout (plus de « matière »), « essayer » et « essai » (plus de « tenter »), des « consignes » pour garder une réserve (plus de « stock » ni de « cadence »). Les paliers du seuil deviennent « À l’arrêt » et « Quelques provisions », la découverte se fait toujours « au Labo », et les voix des travailleurs ne parlent plus de « l’atelier ». Les anciens textes de l’apprenti à l’établi sont retirés.",
    "🧑‍🔧 Les portraits des travailleurs changent de nom de fichier : un téléphone qui garde un ancien morceau du jeu ne mélange plus ancien code et nouvelles images (le forgeron apparaissait en double).",
    "🏷️ Au Labo, le « poste » devient la « station » (Mains, Feu de camp, Enclume…) : « ← Stations et outils », « Choisir cette station », « sur cette station ». L’établi reste la surface où tu poses tes matières.",
    "🧑‍🔧 De nouveaux visages pour les travailleurs. Les huit métiers ont maintenant un même personnage qui traverse les âges, du Néolithique au futur : une personne par métier, reconnaissable d’un échelon à l’autre.",
    "⭐ Les goulots suivent ton objectif : ceux qui touchent l’objet que tu suis passent devant, marqués d’une étoile. Les textes qui parlaient encore d’« action » disent « geste » (fiches des stations, conseils, Labo), et l’ancien conseil sur « la part réservée de l’apprenti » décrit enfin les travailleurs d’aujourd’hui.",
    "🔧 L’usure des machines. Une machine qui travaille longtemps s’use ; à bout, un exemplaire tombe en panne et ne travaille plus (jamais plus de la moitié du parc d’un type à la fois). Un goulot te prévient quand une panne approche et propose d’entretenir ou de réparer contre quelques écus. Jeu fermé, rien ne s’use, et tout est réparé à ton retour.",
    "🔥 Les centrales ont faim. La chaudière, la centrale, la centrale à fission et le réacteur à fusion brûlent un combustible de ta Réserve (charbon, uranium, hélium-3) tant que le jeu est ouvert et que quelque chose travaille. Réserve vide, la source s’arrête et l’énergie baisse : un goulot te le dit (et te prévient quand il reste moins de deux minutes), la page de l’énergie montre combien de temps chaque source tient. Rien ne se perd, ça repart dès que tu as de quoi brûler, et rien ne brûle jeu fermé. Le moulin, la vapeur récupérée et la dynamo n’en veulent pas.",
    "✊ La fatigue et la grève. Chaque métier a une jauge de fatigue : elle monte quand ses travailleurs fabriquent seuls sans relâche (surtout si l’énergie manque), elle descend quand ils se reposent. Tes travailleurs te préviennent quand ils sont à bout ; à fond de jauge, ils se mettent en grève : plus rien ne se fabrique seul dans ce métier, mais ta file de commandes continue et rien n’est perdu. Ils reprennent quand ils ont soufflé, ou tout de suite contre une prime en écus (sur la page du métier ou depuis un goulot). Jeu fermé, ils se reposent : tu ne retrouves jamais une grève à ton retour.",
    "✒️ Typographie : toutes les apostrophes du jeu sont courbes (l’abri, d’os…), les tirets longs disparaissent des textes, et l’âge affiché dans l’en-tête du menu (« Os » au lieu de « Âge de l’Os ») est enfin raccourci comme prévu.",
    "📖 Passe de cohérence du langage. L’aide du jeu est réécrite : elle décrit les cinq écrans d’aujourd’hui (Terres, Labo, Atelier, Progression, Journal) et explique les métiers, les travailleurs, le seuil, les goulots et l’énergie. Partout, on dit les Terres (plus « le Domaine ») quand on parle de l’écran, la Progression (plus « l’arbre »), un geste (plus « une action »), une pièce (plus « un composant »), et la page des métiers de l’Atelier s’appelle Métiers.",
    "🗣️ Chaque métier parle son langage au Labo : le même geste s’y écrit selon le métier ouvert. « Chauffer » devient Fondre en Métallurgie, Cuire en Artisanat, Distiller en Chimie, Purifier en Électronique ; « Assembler » devient Coudre en Élevage, Monter en Métallurgie ; « Construire » devient Bâtir, Installer… Seul l’affichage change : les recettes et ta partie restent les mêmes, et ailleurs (Carnet, fiches, Progression) le nom général reste.",
    "🔬 Le Labo enferme la découverte dans le métier ouvert. Dans un métier, tu ne vois plus que les matières qui entrent dans ses recettes (et non toutes celles que tu as vues), les pistes ✦ ne comptent que ses recettes, et un assemblage qui relève d’un autre métier ne donne rien ici (le thermomètre ne révèle pas non plus qu’il existe ailleurs) : on le trouve en ouvrant le bon métier. Les recettes que tu connais déjà se fabriquent comme avant.",
    "🏷️ Le seuil de production libre se lit en mots, plus en pourcentages : au repos, au jour le jour, quelques réserves, bien garni, à ras bord. Il démarre à « au jour le jour » (au lieu d’un tiers du stock de confort), pour qu’un travailleur ne vide pas des matières dont tu as besoin sans que tu l’aies voulu. Le goulot « seuil à 0 % » devient « au repos ».",
    "🏗️ Les bâtisseurs ont un rôle : ils exécutent les chantiers que tu lances, c’est-à-dire les constructions à prix croissant (extracteurs, machines) que tu mets dans ta file, à ta place et sans que tu les fasses à la main. Jamais de leur propre initiative, et seulement ce que tu as déjà construit une fois toi-même. Construction apparaît dans les Ateliers dès que tu connais une construction. Dans un goulot « aucun extracteur n’en récolte », un bouton lance directement le chantier.",
    "🚧 Les goulots : quand tes travailleurs n’avancent pas, l’Atelier le dit et remonte à la vraie cause. « Goulots · 2 » en tête de l’Atelier (et sur la page du métier), avec un bouton qui la règle : voir les Terres quand aucun extracteur ne récolte la matière, embaucher quand personne ne fabrique la pièce d’un autre métier, fabriquer une fois à la main ce que les travailleurs ne peuvent pas encore, régler un seuil à 0 %, voir l’énergie. Une pastille apparaît sur l’onglet Atelier quand un nouveau goulot se présente.",
    "🗣️ Les travailleurs te parlent : à ton retour d’une absence (« Patron, pendant votre absence, l’atelier a fait : 40 × corde, 12 × manche »), quand ils manquent d’une matière depuis une demi-minute (« la forge manque de charbon ! »), et quand une matière va bientôt manquer. Une voix par métier, une carte à la fois, jamais par-dessus une fenêtre, avec un portrait qui suit l’échelon du métier ; toucher la carte ouvre le métier, où les derniers messages restent lisibles. La barre du bas reste visible par défaut (le masquage devient un réglage).",
    "⌄ La barre du bas peut se ranger d’elle-même et ne laisser qu’une fine poignée. Elle vient quand tu approches la souris du bas de l’écran ou que tu touches la poignée (ou la fais glisser vers le haut), et se range après ton choix. Le défilement ne la fait plus bouger. Menu → Affichage → « Barre du bas masquée » (désactivé par défaut) active ce comportement ; sinon la barre reste visible comme avant.",
    "🔨 Les travailleurs d’un métier fabriquent maintenant seuls, en continu, les pièces que ce métier connaît (déjà faits une fois à la main), jusqu’à un seuil que tu fixes par métier (au repos, au jour le jour, quelques réserves, bien garni, à ras bord), de plus en plus gros avec l’âge. Ils ne touchent pas à ce que réservent les commandes de ta file. Le réglage est sur la page de chaque métier, avec ce qu’ils fabriquent et où ils en sont.",
    "👷 Chaque métier a ses travailleurs, nommés d’après ce qu’ils font : artisan, bâtisseur, éleveur, forgeron, chimiste, centralier, électronicien, lettré (et leurs apprentis). Les boutons d’embauche, les renvois et la jauge d’énergie les nomment ainsi.",
    "🔘 Fin de l’harmonisation des boutons : les flèches des terres, le bouton d’arrêt de la récolte, les pastilles d’ingrédient et d’objet, et la ligne d’âge prennent l’octogone du jeu ; « Arbre » devient « Progression » ; l’aide ne promet plus de raccourcis clavier qui n’existent pas.",
    "✦ Les Traces s’appellent désormais les Souvenirs : ce que laissent les passages franchis, et que la relève transmet au Semeur suivant.",
    "💭 Le guide remis d’aplomb après la refonte : il montre l’objectif, le médaillon d’une nouvelle terre, le bouton Explorer, le Comptoir et le bouton Étudier du Labo (trois chapitres ne démarraient plus), et ses textes parlent des Terres et du Labo.",
    "✦ Les Souvenirs (des pas) et l’Intuition (des étincelles) ont chacun leur icône, qui étaient confondues. Le bouton du compte quitte l’en-tête : il est dans Menu → Système → Compte en ligne.",
    "📐 Le Labo occupe mieux l’espace : les matières se serrent (quatre colonnes sur téléphone, davantage sur grand écran), et sur grand écran l’établi reste en vue pendant que la liste des matières défile dans sa colonne.",
    "🧪 Au Labo, « Vider » rejoint la rangée des gestes (grisé quand l’établi est vide), et le message de l’établi (fabriqué, tiède, chaud, brûlant) prend un cadre de la D.A. dont la couleur dit la température.",
    "📊 Progression : le décompte d’un âge dit « trouvées / recettes » et correspond à la grille (les matières vues ont leur rangée à part, « Matières vues »). Le Cosmos devient la dernière page de la Progression, à côté de Mémoire, dès que tu as un instrument d’observation ; le Journal n’a plus qu’une page.",
    "🗂️ Le menu s’organise en cinq onglets (Jeu, Affichage, Audio, Système, Aide) : une rubrique à la fois, au lieu d’un long écran. Les sauvegardes se simplifient : un fichier à enregistrer, un fichier à reprendre, et les copies de sécurité en une ligne ; l’ancien code texte disparaît. L’icône du compte est une silhouette.",
    "🔲 Les ressources s’affichent nues, sans double cadre. Un bouton garde sa taille quand son état change (la récolte en continu garde la même taille en « ▶ » et en « ■ »), et un texte trop long rétrécit au lieu de déborder. L’objectif des Terres prend sa propre ligne sur téléphone. Les derniers grands nombres passent en k, M, G.",
    "🔘 Une seule grammaire de boutons : l’octogone de papier pour les actions, un chevron › quand un bouton ouvre une fenêtre, des onglets soulignés pour changer de page, de petits octogones pour les filtres, et les recettes de la Progression en tuiles octogonales colorées selon leur état. Les cadres se redimensionnent sans se déformer. Le bouton Progression, qui n’ouvrait rien, n’apparaît plus que pour revenir de la fiche d’une recette.",
    "🧹 Le menu est plus sobre (plus de grande illustration, les quatre rubriques sur une ligne, des lignes de réglage régulières), le bouton Aspect disparaît de l’en-tête (les styles vont disparaître) et les quatre boutons du haut ont la même taille ; les onglets des fenêtres suivent la forme des filtres des écrans.",
    "🎨 Harmonisation, suite : le Labo reçoit les mêmes cadres peints que l’Atelier et le Carnet, ses filtres suivent la même forme, et le Carnet et les Machines prennent la même marge.",
    "🎨 Passe d’harmonisation des écrans : la même marge sur le Labo, l’Atelier, la Progression et le Journal ; le même titre de page (le Labo en reçoit un) ; les mêmes filtres (rectangles, actif en rouge brique) ; les mêmes cartes peintes.",
    "👋 Tu peux renvoyer un apprenti ou un ouvrier depuis la page de l’atelier (deux touches pour confirmer). Aucun remboursement, et l’embauche suivante ne coûte pas moins cher : renvoyer pour réembaucher ne rapporte rien.",
    "🪙 Le prix d’une embauche suit le niveau des prix : un apprenti ou un ouvrier coûte toujours à peu près le même nombre de matières de ton âge. Embaucher tôt coûte moins cher qu’embaucher tard.",
    "⚙️ Quatre machines de plus, pour qu’il y en ait une tous les deux âges environ : le Martinet hydraulique (Acier), le Poste à moteur électrique (Électricité), le Centre d’usinage numérique (Composites) et la Matrice de fabrication (Stellaire). L’échelle d’un atelier compte maintenant sept marches : Manuel, Mécanisme, Hydraulique, Vapeur, Chaîne, Robotique, Synthèse.",
    "⚙️ L’échelle d’un atelier suit la machine : Manuel, Mécanisme, Vapeur, Chaîne, Robotique. Les apprentis et les ouvriers ne la font plus monter : ils sont une autre échelle, celle de la main-d’œuvre. Les descriptions des machines portent leur marche au lieu de « Palier 3 » partout.",
    "📱 Sur un très petit écran (320 px), les trois boutons du haut des Terres tiennent sur la largeur.",
    "⚡ La jauge d’énergie se voit aussi dans la page de chaque atelier (elle n’était que sur la liste des ateliers).",
    "⚡ L’énergie agit. Quand tes machines, tes apprentis et tes ouvriers demandent plus de chevaux que tu n’en produis, ils tournent plus lentement, jusqu’à la moitié de leur vitesse au plus. Tes mains ne sont jamais ralenties. Construis un moulin, une chaudière ou une centrale : la jauge de l’Atelier montre ce qui manque.",
    "✒️ Le métier Artistique devient Arts et lettres. Un métier dont toutes les recettes sont trouvées est maîtrisé : sa carte, dans l’Atelier, le dit (il reste utilisable). Ses recettes comptent « trouvées sur total » tant qu’il reste à découvrir.",
    "📜 Chaque recette trouvée dit sa saveur dans la fenêtre de découverte : une ou deux phrases, et la première fois qu’un geste nouveau (Marteler, Allier, Graver…) entre en jeu, ce qu’il veut dire. En attendant les textes définitifs, la description de la recette sert de texte.",
    "🏗️ Un seul modèle : un outil et un geste. Tout ce qui se bâtit (extracteurs, machines, installations, améliorations) se construit désormais : nouveau geste Construire et nouveau métier Construction. Au feu, plus de réglages : un seul geste, Chauffer, les recettes se distinguent par l’ingrédient. Le four reprend les recettes du feu, le couteau celles du racloir, et l’outil le plus haut cache le plus bas. La pioche, le poste de frappe, le ciseau et la dalle ne sont plus des outils de départ : leurs recettes passent par l’Atelier.",
    "🔥 Au Labo, l’outil se choisit à son icône (le nom s’affiche dessous) ; ses gestes apparaissent en un mot quand il en a plusieurs. Les gestes du feu changent de nom : Griller, Cuire, Étouffer ; le four : Cuire, Fondre.",
    "🔧 Au Labo, l’outil et le geste ne font plus qu’un seul choix (« Mains · Tresser », « Feu de camp · Cuire »), en puces qui passent à la ligne. Le Carnet est allégé : une ligne d’aide, la recherche, et deux boutons (quantité, filtres) qui s’ouvrent à la demande. Dans l’Atelier, la jauge d’énergie s’ouvre et détaille ce qui consomme et ce qui fournit.",
    "⚗️ Le Labo suit tes métiers : Artisanat, Élevage, Métallurgie, Centrales, Électronique, Arts et lettres. Chaque métier a ses outils et ses gestes, les mêmes branches que les ateliers de l’Atelier. Les écrans prennent toute la largeur, et le thermomètre se lit mieux sur le papier.",
    "👷 Les ateliers embauchent : un apprenti (dès le Cuivre) travaille à la moitié de la vitesse des mains, un ouvrier (dès l’Acier) à la même vitesse, pour les recettes de son atelier. Embaucher coûte des écus, de plus en plus à chaque embauche, sans salaire ensuite. L’ancienne vente automatique de lanières disparaît : ton apprenti de l’établi devient celui de l’Élevage, et son avance te revient.",
    "🏭 L’Atelier montre tes ateliers : Artisanat, Élevage, Métallurgie, Chimie, Centrales, Électronique, Arts et lettres, chacun avec son échelle : à la main, apprenti, ouvriers, machines, robots. Une jauge d’énergie en chevaux compare ce que tes machines demandent à ce que tu produis ; pour l’instant, elle ne ralentit encore rien.",
    "🗺️ Cinq onglets : Terres, Labo, Atelier, Arbre, Journal. Les Terres montrent une terre à la fois, avec son illustration en fond : glisse ou touche les médaillons pour passer de l’une à l’autre, et récolte d’un appui. La Carte devient l’Atlas, rangé sous les Terres.",
    "⚗️ Le Labo est l’établi pour essayer : tu peux poser toute matière déjà vue, même sans en avoir, et la première pièce d’une trouvaille t’est offerte. L’Atelier sert à produire : choisis une recette et une quantité, fabrique à la main ou confie-la à un apprenti. « Ce qui tourne » montre ce qui produit et ce qui bloque. Le Carnet et les Machines s’ouvrent depuis l’Atelier.",
    "🔨 Dans l’Atelier, les ressources s’affichent en tuiles compactes et épurées sous forme d’icônes et de réserves. Dans le Domaine, les terres déjà traversées se replient pour laisser place à leurs gisements sous forme de vignettes directes.",
    "📖 Finitions du Carnet et mesures : le style Carnet (papier) devient l’aspect par défaut des nouveaux joueurs, et le bouton du haut s’appelle désormais « Aspect ». Les pastilles de quêtes et de souvenirs ont un nom explicite.",
    "🖐️ Le bandeau de récolte et de commandes réserve sa place dans le défilement de chaque onglet sans masquer la dernière ligne.",
    "💡 L’aide en tête du Carnet se replie d’un appui sur « Compris » pour dégager l’écran, et reste rouvrable d’un appui sur « Aide ».",
    "📳 Les vibrations attendent ton premier geste sur l’écran avant de s’activer.",
    "🐞 Un journal de session local conserve tes derniers repères en mémoire et s’ajoute au signalement de problème si tu choisis d’en préparer un.",
    "🗺️ Les terres suivent mieux les âges. La Route du Verre s’ouvre avec le chemin de fer, à la Vapeur ; le quartz se trouve désormais aussi dans les Profondeurs, pour que l’Acier s’y fabrique. La sonde pétrolière arrive avec l’Électricité, et l’uranium et la galène se récoltent dans le Gisement Noir, où l’Atome et le Silicium se jouent. Le chariot ne ferme plus rien : il augmente toujours la récolte de 25 %. Les passages du Désert et des Pics sont ajustés. Ta partie en cours est conservée.",
    "📖 Une voie facultative relie les supports d’écriture, l’imprimerie et les archives au Livre : notes des Semeurs, registre de copies et recherche locale dans les pages retrouvées. Les découvertes et les recettes acquises restent conservées.",
    "⛏️ Le Cuivre se découvre étape par étape. Le chariot et le Désert arrivent au Fer : le quartz y fournit une poudre pour polir les lentilles et renforcer les briques réfractaires. La ligne d’assemblage prépare les grands chantiers après l’ordinateur.",
    "💾 Tes terres, tes stocks et tes âges acquis sont conservés. Les commandes de lentilles et de briques déjà lancées terminent avec leurs anciens ingrédients ; les nouvelles utilisent la poudre de quartz.",
    "✦ Deuxième couche de prestige liée aux fins : atteindre l’un des cinq dénouements éveille désormais une Règle d’Écho majeure pour toujours (Foyer Perpétuel, L’Onde de Choc, La Voie des Étoiles, L’Écho Cosmique, L’Éveil Partagé), visible dans le Journal et la Mémoire des mains.",
    "✦ Les gestes remarqués : 20 succès discrets jalonnent désormais ta route dans le Journal (onglet Gestes), sans récompense chiffrée, avec l’horodatage diégétique de chaque accomplissement (cycle, âge, date).",
    "🍃 Ligne d’ambiance : sous l’en-tête, une petite phrase discrète donne à voir et à sentir le monde vivant selon la terre où tu te trouves, ton âge et l’heure réelle (aube, jour, crépuscule, nuit). Toucher la ligne fait défiler une autre observation du moment, et elle peut se couper dans Menu → Affichage.",
    "📖 Carnet & fabrication : mémorisation du dernier filtre et de la recherche du Carnet, quantité libre à côté de ×10 et Max pour commander le volume exact souhaité, et ajustement des filtres de l’Arbre vers des termes de jeu (Toutes, À portée, Prêtes, Verrouillées).",
    "🌳 L’Arbre à portée : le filtre « À portée » réunit ce que tu peux fabriquer immédiatement ou presque avec ta Réserve, avec les filtres « Prêtes », « Presque » et « Pas encore ». Un point discret signale les nouvelles recettes découvertes que tu n’as pas encore fabriquées.",
    "🪜 Le chemin vers une cible : depuis une pastille de l’Arbre ou l’objectif du Domaine, le bouton « Chemin » ouvre toute la route jusqu’à l’objet en une échelle de marches (ce qui est fait, en cours, bloqué ou à trouver), avec l’action directe pour chaque marche, et « Tout fabriquer ».",
    "🏷️ Des mots d’interface, un par chose : la carte du Domaine s’appelle « Objectif » (plus « Scénario »), son bouton « Atelier » (plus « Tenter »), le badge d’une recette à trouver « Nouvelle recette » (plus « Étape clé »), et ce qu’il faut avoir s’écrit « Requis ». Les premières explications du guide sont plus courtes.",
    "👋 Au premier réveil, le choix du guide se fait dans la fenêtre d’ouverture : « Ouvrir les yeux » ou « Sans guide ». La bulle d’accueil qui venait se poser sur ton objectif disparaît.",
    "🌳 L’Arbre se lit en pastilles : chaque âge devient une frise d’icônes (matières vues, recettes trouvées, pistes à découvrir, ton objectif), plus facile à parcourir que des cartes. Toucher une pastille ouvre une feuille qui monte du bas avec ce que la recette utilise et ce qu’elle sert à fabriquer ; l’arbre reste visible dessous. La progression reste l’accueil de l’Arbre.",
    "🛖 Après une relève, les ruines tiennent dans un seul bloc replié sous ce qui se récolte, au lieu d’une carte par ruine qui repoussait les gisements. Quand tu peux relever quelque chose, le bloc s’ouvre et « Tout réparer » relève tout ce que ta Réserve permet. Réparer une ruine compte maintenant comme fabriquer l’objet : l’étape « fabrique une cabane » ne te redemande plus ce que tu viens de relever.",
    "🪙 Le Comptoir est dans le menu : tu y accèdes de n’importe quel écran.",
    "📱 Le jeu se tient mieux dans l’appareil : sur téléphone, le bouton Retour ferme la fenêtre ouverte, puis ramène au Domaine, et ne quitte qu’au second appui. L’onglet affiche (2) dans son titre quand une commande ou une exploration se termine pendant que le jeu est caché. Le menu propose « Garder l’écran allumé » et, quand l’appareil le permet, « Installer le jeu ». Sur ordinateur, les touches 1 à 6 changent d’écran.",
    "⚙️ Le menu est réorganisé en sections (Affichage, Son et vibrations, Jeu, Ma partie, Aide), avec les mêmes interrupteurs partout (Activé, Désactivé). Le thème sombre s’appelle « Sombre », le tutoriel « Guide », et « Tout recommencer » devient « Recommencer la partie ».",
    "🤏 L’affichage compact se règle dans le menu, pour le Domaine et le Carnet à la fois, et il resserre vraiment : chaque gisement tient sur une ligne basse, ses boutons ne gardent que leur symbole. Les boutons de bascule des pages disparaissent.",
    "⊞ Le Carnet sur deux colonnes marche enfin sur téléphone : les fiches se resserrent pour tenir côte à côte.",
    "✨ Plus de punch : un appui sur un bouton se voit (il s’enfonce, un anneau part du doigt) ; le visiteur attrapé fait « pop » et éclate en étincelles, avec son gain qui monte ; et les raretés ont un vrai moment. Une curiosité trouvée prend l’écran : rayons, secousse, coup sourd et vibrations, d’autant plus fort qu’elle est rare (la poudre rouge, le quart de cœur, le dé et l’anneau en haut de l’échelle). « Réduire les animations » garde le message et supprime mouvement et secousses.",
    "🌌 Le ciel du Cosmos s’affiche de nouveau : il restait noir, comme si le canvas avait été démonté aussitôt monté.",
    "🎯 Le guide ne se perd plus : fabriquer en avance le tout dernier objet laisse les étapes qui restent à faire, et une pièce déjà dans ta Réserve n’est plus demandée comme une étape.",
    "⛏️ Quand l’extracteur d’une matière est à toi mais ne la récolte pas, l’objectif le dit : il propose de le poser, ou de le relancer s’il est arrêté.",
    "🪙 Les écus gagnés au Comptoir pèsent moins lourd à la relève : ils deviennent des Souvenirs à plein tarif jusqu’à ce que tes passages ont rapporté, puis à un quart. Le calcul s’affiche au Comptoir et dans la fenêtre de relève.",
    "🧳 Le Troqueur demande selon ce que tu produis réellement : plus la matière demandée vient lentement, moins il en réclame. Il ne renouvelle plus ses demandes sans cesse et part en tournée de temps en temps, le Comptoir restant ouvert pour vendre et acheter.",
    "🔤 Les cartes de signes du Journal, les deux formulaires à ⏎ et les questions à réfléchir ont un nom pour le lecteur d’écran.",
    "💬 Les boutons qui ne disaient rien s’expliquent : une info-bulle dit ce que font Suivre, Épingler, Détail, ×10, Max, les filtres et les tris.",
    "💭 Le guide ralentit : une seule explication à la fois, et au plus une toutes les deux ou trois minutes.",
    "⭐ Trois chapitres nouveaux, au moment où ils servent : Suivre, Épingler, et commander d’un coup (×10, Max).",
    "📖 Qui a déjà pris l’habitude ne revoit rien : ces chapitres s’effacent si tu as déjà suivi une recette, épinglé ou commandé en lot.",
    "📖 Ergonomie générale : le Carnet propose une vue en deux colonnes sur écran large et un mode compact, avec un saut rapide vers chaque âge découvert et un repli global. Les épingles de l’Atelier s’affichent en vignettes compactes avec fabrication directe, le Domaine s’allège d’une vue resserrée mémorisée, l’objectif clarifie son accès à l’Arbre et aux étapes, et le menu regroupe ses raccourcis.",
    "💧 La Vapeur commence à la Rivière : une pompe à bras récolte l’eau, les tuyaux la conduisent à la chaudière et les condenseurs la récupèrent. Aux Polymères, raffine le pétrole en naphta et récolte le soufre des Collines pour fabriquer le caoutchouc. Les joints et les tuyaux souples servent au refroidissement des machines. Treize nouveaux objets, sans décaler les âges ni retirer tes découvertes.",
    "📖 L’Arbre et le Carnet ont chacun leur rôle. L’Arbre te situe dans la progression : il s’ouvre sur ton âge, tes étapes et le prochain objectif. Le Carnet garde les recettes et prépare les lots : il s’ouvre sur « Apprises », et chaque lot affiche son coût, ce qu’il produit, les ressources à réunir et une durée estimée. De l’un à l’autre : « Ouvrir la recette dans le Carnet » et « Situer dans l’Arbre ».",
    "☢️ Un âge de plus : l’Âge de l’Atome, entre l’Électricité et le Silicium. Deux ressources que seul un extracteur récolte, jamais tes mains : l’uranium (Profondeurs) et la galène (Collines). Onze nouveautés : mines d’uranium et de plomb, lingot et plaque de plomb, pastille d’uranium, graphite, barre de combustible, compteur Geiger (explorations ×1,25) et centrale à fission (extracteurs +25 %). Tes parties en cours sont conservées : chaque âge après l’Électricité avance d’un rang. « Chauffer du charbon » n’est plus un essai sans suite : à très haute température, il donne du graphite.",
    "🚂 Un âge de plus : l’Âge de la Vapeur, entre l’Acier et l’Électricité. L’Acier garde le haut-fourneau, l’acier trempé, les lames et les outils d’acier ; la Vapeur reçoit la chaudière, le piston, le moteur, la presse, la pompe, le chemin de fer et les extracteurs à vapeur, plus cinq nouveautés : soupape, manomètre, régulateur à boules, chaudière tubulaire et marteau-pilon. Tes parties en cours sont conservées : chaque âge après l’Acier avance d’un rang, et la Vapeur est comptée comme accomplie si tu l’as dépassée.",
    "🏗️ Chaque bâtiment a sa propre recette à découvrir, avec un nom qui lui ressemble : Claie de séchage et Rouissoir pour la fibre, Carrière à coins pour la pierre, Fosse de tannage et Tannerie pour la peau, Argilière, Gravière, Sablière, et des mines (cuivre, étain, charbon, fer, bauxite…). Dans le Carnet, trois nouveaux filtres : « Extracteurs » (rangés par bâtiment et par niveau), « Outils » et « Machines ».",
    "🏗️ Un extracteur par ressource : le Bûcheron pour le bois, le Carrier pour la pierre, le Tanneur pour la peau, le Charbonnier, le Sablier, les mineurs… Chaque bâtiment ne récolte que sa ressource et monte de niveau avec les âges (Cabane, Hutte, Scierie…). Dans la fiche d’un gisement, « ↑ Niveau 2 » remplace un exemplaire par le niveau d’après. Le sable et le charbon se récoltent avec le même bâtiment dans toutes leurs terres. Tes parties en cours sont converties : rien n’est perdu, chaque extracteur reste où il était.",
    "✦ Les Souvenirs ne se dépensent plus en pleine partie : la Mémoire des mains se consulte toujours, mais les achats ne s’ouvrent qu’au réveil d’un nouveau Semeur, après la relève. Ils se ferment avec le bouton « Terminé : commencer le cycle » ou au premier passage franchi, et les Souvenirs non dépensés attendent la relève suivante.",
    "🌅 La fenêtre de première relève est réécrite : elle s’appelle « Fin du premier cycle » et liste ce que tu gagnes (✦ Souvenirs), ce que tu gardes et ce qui repart de zéro. Le bouton « Passer le relais » est visible tout de suite. ⏱️ Mains sûres a enfin un vrai effet : fabrication à la main 20 % plus rapide par niveau, et 10 % de chances de gagner une pièce en plus.",
    "🌅 La première relève arrive plus tard : une fois la Plaine franchie, avec les ✦ Souvenirs du passage en plus des 3 offertes. Pour explorer la grotte, le guide t’aide à trouver la torche. Après l’éveil, un rappel en haut du Domaine dit ce que le nouveau Semeur a gardé et combien de Souvenirs il peut dépenser.",
    "🔎 Les ressources de l’Atelier remontent : la recherche reste en haut, et le tri et les filtres se rangent derrière un bouton « Filtres » (le chiffre dit combien sont actifs). Il s’ouvre sur place et se referme quand tu choisis.",
    "♿ Plus accessible : au clavier, Entrée pose une ressource sur l’établi (« i » ou Maj + Entrée ouvre sa fiche) et la Carte se parcourt lieu par lieu. Le bouton « ⓘ Fiches » remplace l’appui long, les champs et les liens ont un nom, et les textes sont au moins à 4,5:1 de contraste dans toutes les époques (les accents du Jour sont un peu plus sombres).",
    "🌳 Retrouver ses recettes dans l’arbre : une recherche (🔍) mène au nœud et ouvre ses ingrédients et ses usages ; le bouton vert ● ne laisse en lumière que ce que tu peux fabriquer maintenant, et un point vert les marque toujours.",
    "📖 Le Carnet va plus vite : une barre de quantité (×1 à Max) reste en haut et se souvient de ton choix ; chaque recette n’a plus qu’un bouton « Fabriquer ×N ». Les cartes sont plus courtes, et le détail et le suivi restent à portée.",
    "🛠️ L’Atelier est plus court : les actions tiennent sur une seule rangée qu’on fait glisser, l’établi est plus compact, et tes ressources se voient dès l’ouverture. Après un essai, le résultat se garde, et un bouton « Réduire » le range.",
    "🧱 Quand une commande ou un Grand Œuvre attend une ressource, le jeu dit laquelle, d’où elle vient, ce que tes extracteurs en produisent et le temps qu’il faudrait. Un bouton « Aller au gisement » mène à la bonne terre.",
    "🧭 Étape clé : sa piste (l’énigme et les indices déjà acquis) reste affichée à l’Atelier. Dans le Domaine, la gêne d’une terre (sans torche, sans gants…) propose la fiche de la protection que tu connais. Le bilan d’absence offre une suite utile, et le premier conseil montre le bouton « Récolter » en continu. L’Atelier se libère de ses rappels une fois appris.",
    "🌙 La première relève s’ouvre de nouveau (une erreur l’empêchait d’apparaître). Sur petit écran, la réglette des âges de l’arbre garde des cases de 44 px et défile.",
    "🔨 Fini le bruit répété à chaque pièce : tant qu’une commande avance, l’atelier fait un seul bruit de fond, continu, que tu fabriques une pièce ou mille. Le geste en cours le colore (cailloux, bois, braises, enclume, machines…) et l’âge choisit la pièce : atelier de bois, forge, vapeur, usine, laboratoire.",
    "🌳 L’arbre a son onglet, entre l’Atelier et le Carnet. Il garde la largeur de l’écran et se déplace du doigt ; ses traits sont plus discrets tant que tu n’as rien touché. Le Carnet redevient la seule liste.",
    "🗣️ Le Troqueur dialogue vraiment : à chaque sujet, tu poses ta question et il répond, au lieu de réciter une phrase dans le vide.",
    "🌳 L’arbre prend tout l’écran : une barre fine en haut, et le reste pour l’arbre. Un bouton « Voir dans l’arbre » sur la fiche d’un objet, et « Dans l’arbre » sur ton objectif, t’y emmènent tout droit.",
    "📜 Une colonne d’âges sur le bord de l’écran : touche un âge, ou glisse le doigt dessus, et l’arbre s’y rend.",
    "🔍 De plus loin, l’arbre se lit par âge : le nom de chaque âge et le nombre de recettes que tu y as trouvées. De plus près, les noms et les traits sont plus gros.",
    "⏳ Revenir après moins de cinq minutes n’ouvre plus de fenêtre : un petit message dit ce qui a été récolté. Au lancement, les fenêtres passent une à une, et le guide attend qu’elles soient fermées.",
    "🖼️ Les Grands Œuvres ont leur image : l’œuvre entière dans le Journal, l’étape en cours sur le chantier du Domaine. Les pages ont un fond discret, et la Veillée le sien.",
    "🌳 L’arbre du Carnet est lisible : il ne garde de place que pour ce que tu as trouvé, les âges lointains tiennent en un bandeau, et les traits qui sautaient des âges ne s’allument plus que si tu touches l’un de leurs bouts. Touche un objet : ses liens s’éclairent, et un bandeau dit de quoi il est fait et à quoi il sert ; ses puces mènent d’un objet à l’autre. Touche-le encore pour sa fiche.",
    "✋ Le vocabulaire des commandes est le même partout : tes mains, une commande, en cours, au repos. La barre dit « Commande · … », une commande sans personne pour la faire « attend une main ou une machine », et une machine sans travail est « au repos ».",
    "🗺️ La Carte et le Domaine sont illustrés : chaque terre a son île dessinée, et son paysage en fond de fiche.",
    "🔦 Les images se chargent au fur et à mesure ; le jeu reste jouable sans elles.",
    "🌱 Les premières terres prennent plus de temps : avant d’ouvrir un passage, il faut avoir exploré les lieux de la terre où tu es.",
    "🧭 La fenêtre d’un passage dit alors ce qu’il reste à explorer, avec un bouton pour lancer l’exploration.",
    "✨ Des retours discrets quand une chose réussit : une étincelle au thermomètre quand il passe à « brûlant », la nouvelle terre qui s’allume, la pastille d’Intuition qui apparaît.",
    "✦ Avant la relève, une liste dit ce qui est conservé et ce qui est remis à zéro, avec les Souvenirs gagnés ; au réveil, la partie commence par ce que le Semeur retrouve.",
    "🔇 Moins de choses d’un coup au début : les Quêtes et le compteur d’étapes arrivent avec le premier âge, et les messages s’espacent."
  ];



  /* ---------------------------------------------------- ÉCHECS (saveur)
   * {x} : les matières, avec leur article (« le bois et les fibres ») ; {a|b} : a si
   * une seule matière au singulier, b sinon (« {reste|restent} »). Une même tentative
   * donne toujours la même phrase ; deux tentatives différentes, rarement. */
  D.FAIL = {
    assembler: ["Tu tentes d’assembler {x}. Les pièces refusent de s’emboîter.", "Tu cherches un moyen d’unir {x}. Rien ne s’ajuste proprement.", "Tu ligatures {x} comme tu peux. Le premier geste défait tout.",
      "Tu disposes {x} sur l’établi. L’idée s’effondre avant de naître.", "Tu cales {x} ensemble. L’équilibre est bien trop fragile."],
    tresser: ["Tu tentes de tresser {x}. Tes doigts s’emmêlent.", "Tresser {x} ? Tu obtiens un nœud informe.", "Tu tresses {x}. On dirait vaguement un nid. Un nid raté.",
      "Tu croises et recroises {x}. Le tout se défait dès que tu lâches.", "Tu passes {x} dessus, dessous, dessus… et tu perds le fil."],
    tailler: ["Tu tailles {x}. Il n’en reste que des miettes.", "Ta lame glisse sur {x} sans rien en tirer d’utile.", "Tu entailles {x} longtemps. Le résultat ne ressemble à rien.",
      "Tu tailles {x} de toutes les façons possibles. Aucune n’est la bonne.", "Quelques coups secs sur {x}, et tu ramasses des éclats sans forme."],
    chauffer: ["Tu chauffes {x}. De la fumée, une mauvaise odeur, et rien d’autre.", "Tu tiens {x} au-dessus des flammes. Tu attends, tu attends encore. Rien.", "{x} {passe|passent} au feu. À la sortie, rien n’a changé, sauf la température.",
      "Tu laisses {x} sur les braises un long moment. Tu n’y gagnes que de la suie sur les doigts."],
    marteler: ["Tu martèles {x}. Le bruit résonne loin, mais rien ne change.", "Pan ! Pan ! Pan ! {x} {reste|restent} exactement comme avant.", "Tu tapes sur {x} jusqu’à en avoir mal au bras."],
    allier: ["Tu fonds {x} ensemble. Le mélange se sépare en refroidissant.", "{x} {refuse|refusent} de s’allier.", "Le creuset bouillonne, puis ne laisse qu’une croûte grise."],
    tremper: ["Pschhh ! {x} {siffle|sifflent} dans l’eau, et rien d’autre.", "Tu plonges {x} dans le bac. Seul changement : tout est mouillé.", "La vapeur se dissipe. {x} n’{a|ont} pas changé."],
    usiner: ["La machine grince sur {x} et s’arrête.", "Tu usines {x} : des copeaux brillants, et rien d’autre.", "Le tour recrache {x} en grinçant."],
    electriser: ["Zzzt ! {x} {crépite|crépitent}, puis plus rien.", "Le courant traverse {x} sans rien changer.", "Une odeur d’ozone, et rien d’autre."],
    graver: ["Le lithographe dessine de jolis motifs sur {x}. Ils ne servent à rien.", "La lumière glisse sur {x} sans y laisser de trace.", "Erreur de gravure : {x} ne {fait|font} pas un support valide."],
    synthetiser: ["Le réacteur bouillonne et ne rend qu’une boue verdâtre.", "{x} se {décompose|décomposent} en fumée âcre.", "La réaction s’emballe, puis s’éteint sans rien laisser de stable."],
    stratifier: ["Les couches se décollent à la sortie de l’autoclave.", "Tu empiles {x}. On dirait un millefeuille raté.", "La pression écrase {x} en une galette inutile."],
    transmuter: ["La forge stellaire rugit. Tout se réarrange, puis redevient exactement comme avant.", "Les atomes bougent un instant, puis reprennent leur place.", "Un éclair aveuglant. Puis rien. {x} te {nargue|narguent}."],
    accorder: ["Tu fais vibrer {x}. Le son est faux.", "{x} {chante|chantent}, mais pas la bonne note.", "Une dissonance grince dans l’air, puis se tait."]
  };
  /* un geste qui demande au moins deux matières, tenté avec une seule */
  D.FAIL_SOLO = {
    assembler: "{x}, et rien d’autre ? Pour assembler, il faut au moins deux ressources différentes.",
    allier: "Allier {x} avec… rien ? Pour un alliage, il faut au moins deux ressources différentes."
  };
  /* Les essais les plus probables du début, écrits à la main (clé : geste:matières, dans l’ordre alphabétique des identifiants). */
  D.FAIL_ONE = {
    "tresser:bois": "Tu tentes de tresser une bûche. Elle ne plie pas, et tu y gagnes une écharde.",
    "tresser:caillou": "Tu tentes de tricoter un caillou. Le caillou gagne.",
    "tresser:charbon": "Tu tresses du charbon. Tu as les doigts noirs jusqu’aux poignets, et rien d’autre.",
    "tresser:corde": "Tu tresses une corde avec… une corde. Elle est un peu plus épaisse, et beaucoup plus courte.",
    "tresser:manche": "Tu enroules le manche autour de rien. Il lui faudrait quelque chose de souple à tresser autour.",
    "tresser:archet": "Tu tresses la corde de l’archet. Il tourne moins bien qu’avant, et il ne tournait déjà pas si bien.",
    "tresser:torche": "Tu tresses les herbes de la torche. Elle s’effiloche. Il valait mieux la garder pour un coin sombre.",
    "tresser:galette": "Les herbes grillées s’effritent entre tes doigts. Pourtant ce geste, tu l’as déjà fait : une couronne d’herbes, sur une tête que tu ne reconnais pas.",
    "tresser:os": "Les os ne se tressent pas. Ils s’entrechoquent, avec un petit bruit sec qui te glace.",
    "tresser:cuir": "Tu tentes de tresser une peau entière. Trop large : il faudrait d’abord la découper.",
    "tresser:aiguille": "Tu tentes de tresser des aiguilles. Tu te piques. Deux fois.",
    "tailler:fibre": "Tu tailles les fibres en brins plus fins. Bravo : des fibres, en plus petit.",
    "tailler:corde": "Tu coupes la corde en morceaux. Te voilà avec plein de cordes trop courtes pour servir.",
    "tailler:charbon": "Tu tailles le charbon. Une poussière noire se dépose partout, surtout sur toi.",
    "tailler:manche": "Tu tailles le manche en pointe, puis en pointe plus fine, puis il n’y a plus de manche. Tu t’arrêtes à temps.",
    "tailler:archet": "Tu retailles l’archet. Il était très bien comme il était.",
    "tailler:torche": "Tu raccourcis la torche. Tout ce que tu y gagnes : elle brûle moins longtemps.",
    "tailler:galette": "Tu haches les herbes grillées. L’odeur est bonne, mais tu n’as toujours pas faim.",
    "tailler:laniere": "Des lanières encore plus fines. On dirait des cheveux de cuir.",
    "tailler:aiguille": "Tu affûtes l’aiguille. Elle était déjà pointue ; maintenant, elle est vexée.",
    "chauffer:caillou": "La pierre chauffe, chauffe… et reste une pierre. Une pierre chaude, au moins.",
    "chauffer:corde": "La corde se tord dans les flammes comme un serpent. Tu la retires juste à temps.",
    "chauffer:archet": "Tu approches l’archet du feu. L’archet sert à allumer le feu, pas l’inverse.",
    "chauffer:torche": "Tu allumes la torche, puis tu l’éteins. Mieux vaut la garder pour un endroit où il fait noir.",
    "chauffer:galette": "Les herbes grillées deviennent des herbes brûlées. Tu n’as toujours pas faim. Tu n’as jamais faim.",
    "chauffer:cuir": "La peau se racornit et sent le brûlé. Personne ne voudrait la porter.",
    "chauffer:laniere": "Les lanières se recroquevillent comme des feuilles mortes.",
    "chauffer:aiguille": "La pointe de l’aiguille rougit. Tu te brûles les doigts en la reprenant.",
    "chauffer:caillou+fibre": "Des herbes sur une pierre chaude : elles grillent un peu. Un souvenir te frôle, une odeur de repas que tu n’as jamais pris.",
    "assembler:bois+caillou": "Une bûche et des pierres, posées en cercle. On dirait un foyer, mais rien ne prend : il manque de quoi faire naître la braise.",
    "assembler:bois+fibre": "Tu attaches des herbes autour d’une bûche. On dirait un épouvantail pour souris.",
    "assembler:caillou+fibre": "Une pierre emballée dans des herbes. Joli paquet, mais inutile.",
    "assembler:caillou+manche": "Une pierre au bout d’un bâton… qui tombe dès que tu le lèves. Avec quoi tenait-elle, dans tes souvenirs ?",
    "tresser:bois+fibre": "Tu tresses des herbes autour d’une bûche. Trop grosse, trop raide : il faudrait un bois plus fin.",
    "tresser:caillou+fibre": "Tu emprisonnes une pierre dans un filet d’herbes. Te voilà avec un très joli presse-papier.",
    /* Âges de la Pierre et du Cuivre (écrites avec Gemini, relues : un échec ne prend jamais rien) */
    "tresser:argile": "Tu tentes de tresser des boudins d’argile. Ils collent à tes paumes et s’écrasent en bouillie.",
    "tailler:argile": "Tu donnes des coups de lame dans la motte d’argile. Chaque entaille se referme aussitôt.",
    "marteler:argile": "Tu abats ton marteau sur l’argile fraîche. Tu en reçois plein la figure, et la motte est juste un peu plus plate.",
    "tresser:silex": "Tresser du silex ? Tu t’abîmes les ongles sur les arêtes, et la pierre ne plie pas.",
    "chauffer:silex": "Le silex crépite dans la braise et lâche une esquille brûlante. Tu as failli y laisser un œil.",
    "marteler:silex": "Tu cognes le silex de toutes tes forces. Il s’écaille en poussière au lieu de se fendre nettement.",
    "tresser:sable": "Tu tentes de tresser du sable. Les grains coulent entre tes doigts, et le vent emporte le reste.",
    "tailler:sable": "Tailler du sable ? Ta lame passe au travers. Tu as juste déplacé un petit tas.",
    "marteler:sable": "Un grand coup de marteau dans le sable. Un nuage de poussière dans les yeux, et un cratère minuscule.",
    "tresser:eclat": "Tresser des éclats tranchants ? Tes doigts s’en souviendront longtemps.",
    "chauffer:eclat": "L’éclat rougit sur la braise et son fil se ternit. Tu le retires avant qu’il ne devienne cassant.",
    "marteler:eclat": "Tu frappes sur la lame de silex. Un éclat de plus vole à travers l’atelier, et elle n’en coupe pas mieux.",
    "tresser:brique": "Tu tentes de tresser de la terre cuite. La brique ne plie pas d’un millimètre. Tes doigts, si.",
    "tailler:brique": "Tu râpes la brique avec ta lame. Beaucoup de poussière rouge, et ta lame est émoussée.",
    "chauffer:brique": "La brique est déjà cuite. La remettre au feu ne sert à rien.",
    "marteler:brique": "Un coup sec sur la brique. Elle sonne, te renvoie le choc jusqu’au coude, et ne devient rien d’autre.",
    "tresser:engrenage_bois": "Tu tentes de tresser le rouage avec lui-même. Ses dents s’accrochent partout sauf là où tu veux.",
    "chauffer:engrenage_bois": "Le rouage se met à fumer, ses belles dents noircissent. Tu le retires du feu juste à temps.",
    "marteler:engrenage_bois": "Le bois craque sous le choc. Tu t’arrêtes avant qu’une dent ne saute.",
    "assembler:argile+sable": "Tu pétris l’argile et le sable à mains nues. Tu obtiens une boue rugueuse qui ne tient pas sa forme.",
    "assembler:argile+silex": "Tu enfonces le silex dans l’argile fraîche. Tes doigts répètent ce geste avec une certitude étrange, comme s’ils scellaient un caveau ancien.",
    "assembler:brique+manche": "Une brique au bout d’un bâton. Lourd, branlant, et la brique finit sur tes orteils.",
    "assembler:eclat+manche": "L’éclat posé sur le bois glisse dès que tu le lèves. Il faudrait un lien bien serré pour tenir la lame.",
    "tresser:malachite": "Tresser de la pierre verte ? Même ses veines les plus fines restent dures comme le roc.",
    "tailler:malachite": "Tu essaies de sculpter la pierre verte. Tes doigts esquissent un visage sous un casque rond, avant que la roche ne s’effrite.",
    "marteler:malachite": "Tu tapes sur le minerai vert. Au lieu de s’aplatir, il s’effrite en poussière d’émeraude.",
    "allier:malachite": "La malachite brute ne se mélange pas telle quelle. Il lui faut d’abord la chaleur d’un four, et du charbon.",
    "tresser:cassiterite": "Les cristaux sombres et lourds ne plient pas d’un pouce. Tes doigts se fatiguent pour rien.",
    "tailler:cassiterite": "La lame glisse sur les cristaux noirs sans même entamer leur surface.",
    "marteler:cassiterite": "Un grand coup de masse : la cassitérite crache des gravillons grisâtres, mais pas la moindre feuille.",
    "tresser:lingot_cuivre": "Tresser un bloc de métal rouge ? Même souple, il te tordrait les poignets avant de plier.",
    "tailler:lingot_cuivre": "Tailler le cuivre à la lame ne donne que des copeaux tordus. Pour lui donner forme, il vaut mieux le battre.",
    "chauffer:lingot_cuivre": "Le lingot rougeoie sur les braises. Sans moule où le couler, il refroidit tel qu’il était.",
    "tresser:plaque_cuivre": "Une feuille de métal ne se tresse pas : elle plisse, et ses coins te piquent les paumes.",
    "chauffer:plaque_cuivre": "La feuille de cuivre rougit et ondule sous la chaleur, comme une feuille morte. Puis elle refroidit, toute plate.",
    "marteler:plaque_cuivre": "Tu bats la plaque encore et encore. Elle s’étire un peu, et tu t’arrêtes avant de la percer.",
    "chauffer:fil_cuivre": "Le fil rougit d’un coup dans la flamme et commence à fondre par le milieu. Tu le retires avant qu’il ne parte en gouttes.",
    "marteler:fil_cuivre": "Tu martèles le fil de cuivre. Il s’aplatit en un ruban tout mou, que tu redresses tant bien que mal.",
    "assembler:fil_cuivre+manche": "Tu enroules le fil rouge autour du bois. Il brille au soleil, mais ne sert à rien.",
    "tresser:lingot_etain": "Tresser un lingot d’étain ? Il plie un peu en crissant, puis refuse d’aller plus loin.",
    "tailler:lingot_etain": "Le métal est tendre, mais le tailler au couteau ne laisse qu’un tas de rognures grises.",
    "chauffer:lingot_etain": "L’étain fond à toute vitesse et file entre les braises. Tu rattrapes l’essentiel avant qu’il ne se perde dans la cendre.",
    "marteler:lingot_etain": "Tu frappes l’étain sur la pierre. Il s’étale mollement en une galette terne et sans ressort.",
    "allier:cassiterite+malachite": "Deux minerais bruts dans le creuset ? Ils noircissent et s’encrassent sans jamais couler ensemble.",
    "assembler:lingot_cuivre+lingot_etain": "Tu poses le lingot rouge contre le lingot gris. Rien ne colle : pour les unir, il faut les fondre ensemble.",
    "assembler:engrenage_bois+lingot_cuivre": "Tu tentes d’emboîter le bois dans le métal. Un frisson te traverse : dans une autre vie, des machines bien plus grandes tournaient sous tes yeux."
  };
  /* le genre et le nombre des matières, pour les articles (le, la, l’, les) */
  D.GENRE = {
    f: "encre presse_imprimer poudre_quartz fibre caillou corde cabane torche galette cuir aiguille laniere colle_os fronde outre tunique flute statuette argile hache_pierre pioche_pierre brique nasse hutte malachite cassiterite enclume_pierre plaque_cuivre charbonniere lampe plaque_bronze hache_bronze pioche_bronze enclume_bronze roue courroies brouette loupe plaque_fer chainon galerie lentille lunette boussole brique_refr lame vis chaudiere presse_vapeur pompe scierie drague bobine dynamo batterie ampoule excavatrice foreuse_elec wafer puce cellule chaine foreuse capsule bauxite ilmenite terres_rares resine dynamite centrale carriere fibre_carbone ceramique fusee plateforme station_orbitale base_lunaire ia forge_stellaire matiere_exotique antimatiere bague philosophale resonite tablette partition",
    p: "fibre galette laniere collets nasse courroies brouette clous outils_fer vis outils_acier capteurs robots terres_rares convoyeurs debris"
  };

  D.TEMPS = [
    { n: "Froid", c: "#6aa8ff", m: "Rien ne se passe. Pas avec ça, pas pour l’instant." },
    { n: "Frais", c: "#7fd8f5", m: "Une de ces ressources cache encore une recette, avec une autre action ou d’autres ressources." },
    { n: "Tiède", c: "#ffd36b", m: "Cette action et ces ressources vont ensemble. Cherche encore." },
    { n: "Chaud", c: "#ff9a3c", m: "Tu y es presque !" },
    { n: "Brûlant", c: "#ff4a3c", m: "C’est la bonne combinaison !" }
  ];

  /* ------------------------------------------------------------ TERMINAL */
  D.TERMINAL = {}; // js/recit.js

  /* -------------------------------------------------------------- INTRO */
  D.INTRO = [
    "Tu te réveilles dans l’herbe, au bord d’une forêt. Tu ne te souviens de rien, même pas de ton nom.",
    "Tu regardes autour de toi. Tu ramasses un morceau de bois par terre et commences à l’écorcer.",
    "Un sourire naît au coin de tes lèvres : oui, ça, tu t’en souviens."
  ];

  /* ===== VISITEURS DE PASSAGE (début) =====
   * Quelqu'un ou quelque chose traverse le Domaine, de loin en loin. On le touche : un petit lot.
   * Calendrier en secondes de jeu actif (S.stats.play), jamais hors ligne.
   * lot.secondes : secondes de récolte à la main que vaut la matière ; objet, page, clin : chances.
   * tps : parties de la journée (nuit avant 6 h ou dès 21 h, aube avant 8 h, crépuscule dès 18 h, sinon jour).
   * terres : liste de terres, ou absent pour toutes (le Domaine seulement, jamais les lieux sans ciel).
   * pg : peut donner une page du Livre que le Comptoir vend (très rare).
   * clin : phrase complice, sans nom propre réel (voir docs/coffre/EASTER.md). */
  D.VISITEURS = {
    delai: [480, 1200],
    traversee: 12,
    lot: { secondes: 90, intu: 1, objet: 0.08, page: 0.02, clin: 0.03 },
    liste: [
      { id: "oiseau", ic: "🐦", n: "un oiseau", tps: ["day", "dawn", "dusk"], w: 3,
        t: "Un oiseau laisse tomber quelque chose." },
      { id: "papillon", ic: "🦋", n: "un papillon", tps: ["day"], terres: ["lisiere", "plaine", "riviere", "collines"], w: 2,
        t: "Un papillon se pose sur ta main, puis repart." },
      { id: "luciole", ic: "", css: "luciole", n: "une luciole", tps: ["night"], terres: ["lisiere", "plaine", "riviere", "collines", "desert"], w: 3,
        t: "La luciole tourne autour de ta main.",
        clin: "La luciole crie « Hé ! Écoute ! » d’une toute petite voix, puis repart, très contente d’elle." },
      { id: "colporteur", ic: "🎒", n: "un colporteur", tps: ["day", "dusk"], terres: ["plaine", "riviere", "collines", "desert", "montagnes"], w: 2, pg: true,
        t: "Le colporteur te tend un petit paquet et repart sans rien demander.",
        clin: "Le colporteur te tend un bâton : « C’est dangereux d’y aller seul. » Puis il le reprend : « Non, il est pour le suivant. »" },
      { id: "renard", ic: "🦊", n: "un renard", tps: ["dawn", "dusk", "night"], terres: ["lisiere", "plaine", "collines", "montagnes"], w: 2,
        t: "Un renard file entre tes pieds.",
        clin: "Un renard s’enroule en boule et file. Quelque part, des anneaux tintent." },
      { id: "chauve", ic: "🦇", n: "une chauve-souris", tps: ["dusk", "dawn"], w: 2,
        t: "Une chauve-souris te frôle la tête.",
        clin: "La chauve-souris passe devant la lune. Un instant, tu entends un orgue, très loin." }
    ],
    txt: {
      aria: "{n} passe. Touche pour voir.",
      page: "Il te laisse aussi une page du Livre."
    }
  };
  /* ===== VISITEURS DE PASSAGE (fin) ===== */

  /* Scènes d’éveil des Semeurs (cycles 2 et suivants) */
  D.EVEILS = {}; // js/recit.js

  /* ------------------------------------------------ EXPÉDITIONS LONGUES (fouilles)
   * Un lieu déjà exploré se fouille de nouveau, en trois niveaux de plus en plus longs, hors ligne.
   * s : durée en secondes ; taps : le butin vaut autant d’appuis de récolte à la main (qui suivent la
   * puissance du joueur : l’outil, la Mémoire, la règle de la terre) pour chaque ressource de la terre ;
   * intu : l’Intuition de la première fois. Le niveau n+1 demande d’avoir fini le niveau n. */
  D.FOUILLE = {
    niveaux: [
      { n: "Un tour", s: 1800, taps: 120, intu: 1 },
      { n: "Une fouille", s: 7200, taps: 600, intu: 2 },
      { n: "Tout retourner", s: 28800, taps: 2400, intu: 4 }
    ]
  };

  root.ECLAT_DATA = D;
  /* La saveur de la découverte (0.43) : le court texte du pop-up quand une recette est trouvée, et celui du premier emploi d'un geste.
   * Chaque recette a déjà sa description (`d`) : elle sert tant que rien n'est écrit ici. Pour écrire un texte :
   *   D.SAVEUR.<identifiant de la recette> = "Une ou deux phrases, 220 signes au plus."
   *   D.SAVEUR_GESTE.<geste> = "Ce que ce geste veut dire, au moment où on le comprend."
   * La liste de ce qui reste à écrire se génère avec `node tools/saveur-a-ecrire.js` (docs/revue/saveur-a-ecrire.md). */
  D.SAVEUR = {};
  D.SAVEUR_GESTE = {};
  /* Construire (0.43) : les bâtiments, extracteurs, machines, installations et améliorations ne s'assemblent plus : ils se construisent. */
  for (const id in D.ITEMS) {
    const it = D.ITEMS[id];
    if (it.r && it.r[0] === "assembler" && D.ATELIERS.construction.types.includes(it.t)) it.r[0] = "construire";
  }
  if (typeof module !== "undefined" && module.exports) module.exports = D;
  if (typeof require !== "undefined") {
    try { require("./recit.js"); } catch (_) {}
  }
})(typeof window !== "undefined" ? window : globalThis);
