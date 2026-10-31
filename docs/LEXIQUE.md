# Lexique d’Éclat

Un mot par idée, partout : interface, tutoriel, aide, objectifs, messages. Ce fichier est l’**unique glossaire** : avant d’écrire un texte affiché, vérifier ici le mot à employer, et lire `docs/STYLE.md` (le ton, comment écrire). `tools/test-langage.js` refuse dans les textes du jeu les formules d’avant ; pour en interdire une de plus, la lister dans `INTERDITS`.

Dernière refonte : 0.61 (passe de vocabulaire du 31 octobre 2026, réponses du porteur du projet). L’histoire des choix est dans `docs/revue/vocabulaire.md`, `docs/revue/langage-0-56.md` et `docs/revue/decisions-metiers-0-42.md`.

## Les écrans

| Mot | Sens | On ne dit plus |
|---|---|---|
| **Terres** | L’écran de ce qui se récolte : une terre à la fois. Dans une consigne ou un bouton, toujours « les Terres ». | le Domaine (voir plus bas), la Carte, une « zone » |
| **Atlas** | La carte du monde, rangée sous les Terres. | la Carte |
| **Labo** | L’écran où l’on découvre, par essais : métier, outil, station, geste, ressources sur l’établi. | l’Atelier (pour découvrir) |
| **Atelier** | L’écran où l’on produit : **Métiers** (travailleurs, seuil, goulots, énergie), **Carnet** (les recettes connues), **Machines**. Jamais le nom d’un lieu de travail, ni celui d’un métier. | « atelier » pour un métier ; « l’atelier » dans la bouche d’un travailleur |
| **Progression** | Le chemin, les secrets, les gestes remarqués, les fins, la Mémoire, le cosmos. | l’Arbre |
| **Journal** | Le récit et les souvenirs. | |

## Ressources, pièces, objets

| Mot | Sens |
|---|---|
| **Ressource** | Ce qui se récolte sur un gisement, et ce qu’on pose sur l’établi. **Un seul mot à l’écran** : jamais « matière » ni « matière première » (le mot reste permis dans le récit et les fiches : « la matière transparente »). |
| **Pièce** | Objet fabriqué qui sert à en fabriquer d’autres (manche, corde). Jamais « composant ». |
| **Objet** | Mot général pour tout ce qui se possède. |
| **Réserve** | Tout ce que le joueur possède. Un chiffre direct, « disponible » ou « en poche » suffisent ; ne pas répéter « en réserve » à chaque quantité. Jamais « stock » ni « inventaire » à l’écran. |
| **Outil** | Ce qui permet un geste ; il monte de palier (Racloir puis Couteau). |
| **Station** | Là où l’on travaille, au Labo : Mains, Feu de camp, Four, Enclume… Un message de blocage la nomme toujours (« il faut : Four en argile (1 100 °C) »). Jamais « poste » ni « poste de travail » (« Poste radio » et « Poste à moteur électrique » restent des noms d’objets). |
| **Établi** | La surface où l’on pose jusqu’à trois ressources, au Labo. |
| **Amélioration** | Agit dès qu’on l’a : extracteurs ou machines plus rapides. |
| **Extracteur** | Un bâtiment par ressource (Bûcheron, Carrier, Charbonnier…), posé sur un gisement et qui récolte seul. Il monte de **niveaux** avec les âges. |
| **Machine** | Reste à l’Atelier et accélère les commandes des recettes qu’elle sait faire (une fois la pièce faite à la main). Nom court : « 2 automates de bois ». |
| **Gisement** | Une ressource dans une terre. |

## Métiers, gestes, travailleurs

| Mot | Sens |
|---|---|
| **Métier** | Une famille de recettes : Artisanat, Élevage, Métallurgie, Chimie, Centrales, Électronique, Arts et lettres, Construction. Les noms de métiers et de travailleurs ci-dessous sont **en cours de révision** (question 14 de la passe). |
| **Geste** | Tailler, Tresser, Chauffer, Construire… Partout dans l’interface ; au Labo, chaque métier a ses mots pour les gestes (`D.GESTES_METIER`). Jamais « action » ni « mode ». |
| **Recette** | Un geste, appliqué à une à trois ressources. On la **découvre** au Labo et on **essaie** : un **essai** réussi la révèle. |
| **Travailleurs** | Apprentis, puis ouvriers, **embauchés** en écus dans un métier. Nommés d’après ce qu’ils font (`D.TRAVAILLEURS.noms`). |
| **Seuil** | Jusqu’où les travailleurs d’un métier fabriquent seuls. Cinq paliers nommés, sans pourcentage : **À l’arrêt**, **Au jour le jour**, **Quelques provisions**, **Bien garni**, **À ras bord**. |
| **Consigne** | « Garder N d’une pièce en réserve » : une recette confiée aux machines libres, avec une réserve visée. Jamais « cadence », « maintien de stock », « ordre permanent ». |
| **Goulot** | Ce qui empêche un travailleur d’avancer, remonté à sa vraie cause, avec un bouton qui la règle. Une étoile ★ marque ceux qui touchent l’objet suivi. |
| **Énergie** | Mesurée en chevaux (ch) : ce que les machines et les travailleurs au travail demandent, contre ce que la bête de trait et les sources fournissent. Au-dessous de 100 %, tout ralentit (jamais sous la moitié). |
| **Combustible** | Ce que brûlent la chaudière, la centrale, la fission et la fusion. Réserve vide : la source s’arrête. |
| **Fatigue, grève, prime** | La fatigue d’un métier monte quand ses travailleurs fabriquent seuls sans relâche ; pleine, c’est la **grève** ; une **prime** (« Verser une prime » : on verse un paiement) les remet au travail. |
| **Usure, panne** | Une machine qui travaille s’use ; à bout, un exemplaire tombe en **panne**. On l’**entretient** (avant) ou on la **répare** (après) contre des écus. |

## Les verbes

| Idée | Mot | À éviter |
|---|---|---|
| Prendre une ressource sur un gisement | **récolter** | ramasser, cueillir, collecter |
| Créer un objet | **fabriquer** | œuvrer, faire, produire, crafter |
| Trouver une recette | **découvrir** | inventer |
| Tester une combinaison au Labo | **essayer**, un **essai** | tenter, une tentative |
| Révéler une recette inconnue contre de l’Intuition | **déchiffrer** | débloquer, acheter |
| Étudier une ressource | **étudier** (avec de l’Intuition) | analyser |
| Mettre un extracteur sur un gisement | **poser** | installer, placer |
| Lancer une fabrication en lot au Carnet | **commander** | |
| Approvisionner un passage ou un Grand Œuvre | **déposer, apporter, fournir** | verser un solide, donner, payer |
| Laisser un Grand Œuvre puiser seul | **alimenter** | |
| Payer une prime, un salaire | **verser** (c’est un paiement) | |
| Recruter un travailleur | **embaucher** | accueillir, inviter |

## Tes mains et tes commandes

Quatre mots seulement, partout : **tes mains**, une **commande**, **en cours**, **au repos**.

| Mot | Sens |
|---|---|
| **Tes mains** | La part du joueur : une seule commande à la fois, à la main. Les statuts parlent de commandes : « Aucune commande en cours », « Commande ajoutée ». Jamais « queue » ni « slot ». |
| **Commande** | Fabrication lancée depuis le Carnet (×1, ×10, ×50, ×100, ×1 000, Max). Jamais « fabrication », « tâche » ni « job ». |
| **en cours** | Ce que quelqu’un fait avancer. Jamais « en fabrication ». |
| **attendre** | Une commande que personne ne peut avancer est « en attente de mains ou de machines ». |
| **au repos** | Une machine sans travail est **au repos** ; avec du travail, elle est **au travail**. |
| **fin estimée** | Une commande se termine : « Fin estimée dans ~4 s ». Ne pas annoncer un délai garanti. |

## Progression

| Mot | Sens |
|---|---|
| **Âge**, **étapes** | Le jeu avance d’âge en âge ; 🏁 montre les étapes (jamais « jalons »). |
| **Objectif** | La prochaine chose à faire, en haut des Terres. |
| **Nouvelle recette**, **Requis :** | Le badge d’une recette que l’objectif demande ; ce qu’il faut avoir. |
| **Passage** | Ce qu’il faut apporter pour entrer dans une nouvelle terre. |
| **Intuition ✨** | Se gagne en découvrant ; sert à étudier une ressource et à déchiffrer une recette inconnue. |
| **Souvenirs ✦** | Laissés par chaque passage franchi ; achètent la Mémoire des mains. Jamais « Traces ». |
| **Comptoir, écus** | Marché tenu par le Troqueur dans la Plaine. |
| **Demande du Troqueur**, **Parler** | Marchandage ; onglet du Comptoir où le Troqueur répond. |
| **Relève** | Recommencer le monde en gardant ses recettes (bouton : « Passer le relais »). |
| **Ruine**, **Grand Œuvre**, **Signe** | Voir l’aide du jeu. |
| **Guide**, **Sans guide** | Le tutoriel. Jamais « Tutoriel » à l’écran. |

## Chiffres

- Un débit se lit **par minute** (`perMin` dans `js/ui.js`), par heure s’il est infime. Jamais « /s ».
- Une chaleur s’écrit « 1 100 °C » (`fmtHeat`).
- Un bouton dit ce qu’il fait ou ce qu’il pose. Pas de « +1 » nu.

## Typographie

Apostrophes courbes (’), pas de tiret long hors des commentaires et du journal des versions, tutoiement quand on s’adresse au joueur.

## En attente de décision

- **Le Domaine** : dans l’interface c’est « les Terres ». Le porteur propose que le lieu du joueur porte **un nom qui change à chaque âge** (Campement, Halte, Foyer ou Hameau, Village, Oppidum, Cité, Ville, Métropole, Complexe, Mégalopole) à la place de « Domaine » dans le récit et les réglages. À instruire (qui porte le nom ? combien d’âges ?).
- **Les noms des métiers et des travailleurs** : trois jeux de propositions du porteur à départager (voir `docs/revue/decisions-metiers-0-42.md`, section finale).
- **Les textes de découverte** (`D.SAVEUR`, `D.SAVEUR_GESTE`) : 0 sur 218 écrits.
