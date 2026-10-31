# L'usure et les pannes (0.59)

Dernier volet de « quand le joueur a trop poussé » (après la grève 0.57 et le combustible 0.58).

## Règles (D.ATELIERS.pannes)

- Une usure de 0 à 1 par type de machine (`S.usure`), qui monte pendant qu'au moins un exemplaire travaille (2 700 s pour atteindre 1) et redescend au repos (1 200 s).
- À 1 : un exemplaire tombe en panne (`S.pannes`) et sort du parc de travail ; au plus la moitié (arrondie au-dessus) du parc d'un type à la fois.
- Prévenance : le goulot « usé » apparaît à 0,75. Entretenir (avant la panne) ou réparer coûte 3 fois le prix d'un apprenti de l'âge et ramène l'usure à 0,2.
- Jeu fermé : rien ne s'use, et les pannes sont réparées au retour (catchUp).
- Les mains et les travailleurs ne sont pas concernés (eux ont la fatigue).

À calibrer avec de vrais joueurs : `monte`.
