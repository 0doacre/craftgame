# Le vocabulaire du jeu

Les mots que le joueur lit. Un mot par chose ; `tools/test-langage.js` refuse les formules d'avant dans les textes du jeu (hors journal des versions et commentaires).

| On dit | On ne dit plus | Notes |
|---|---|---|
| **Terres** (l'écran) | le Domaine | « le Domaine » reste dans les textes du récit (ambiance, histoire) comme nom poétique du lieu ; dans une consigne ou un bouton, c'est « les Terres » |
| **Atlas** (la carte du monde, sous les Terres) | la Carte | |
| **Labo** | l'Atelier (pour découvrir) | on y découvre, par essais |
| **Atelier** (l'écran) | | on y produit : Produire, Carnet, Machines |
| **Métier** | atelier (pour Artisanat, Métallurgie…) | la page de l'Atelier qui les liste s'appelle Métiers |
| **Progression** | l'Arbre | le Chemin, les Secrets, les Gestes, les Fins, la Mémoire, le Cosmos |
| **Station** (au Labo : Mains, Feu de camp, Enclume…) | poste, poste de travail | « Poste radio » et « Poste à moteur électrique » restent des noms d'objets ; l'**établi** est la surface où l'on pose les matières |
| **Geste** | action | Tailler, Tresser… ; au Labo, chaque métier a ses mots (`D.GESTES_METIER`) |
| **Pièce** | composant | un objet fabriqué qui sert à en fabriquer d'autres |
| **Souvenirs** | Traces | ce que laissent les passages |
| **Travailleurs** (apprentis, ouvriers) | | nommés par métier : forgeron, éleveur, lettré… (`D.TRAVAILLEURS.noms`) |
| **Seuil** (au repos … à ras bord) | pourcentage | `D.TRAVAILLEURS.paliers` |
| **Goulot** | | ce qui empêche un travailleur d'avancer |
| **Réserve** | stock, inventaire | tout ce que le joueur possède |

Pour ajouter une formule interdite : `INTERDITS` dans `tools/test-langage.js`.
