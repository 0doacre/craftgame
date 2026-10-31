# Le combustible des centrales (0.58)

Suite de la grève (0.57) : les centrales qui s'arrêtent, non comme un événement au hasard mais comme un goulot prévisible.

## Règles (D.ATELIERS.combustibles, js/data.js)

- Quatre sources brûlent une unité d'un matériau de la Réserve toutes les « s » secondes : chaudière tubulaire (charbon, 40 s), centrale (charbon, 15 s), centrale à fission (uranium, 60 s), réacteur à fusion (hélium-3, 90 s). Le moulin, la vapeur récupérée, la dynamo et le réacteur chimique n'en veulent pas.
- Elles ne brûlent que **jeu ouvert** et **quand quelque chose travaille** ; jamais pendant l'absence (catchUp), pour ne jamais retrouver une centrale éteinte.
- Réserve vide : la source ne fournit plus (E.sourceMarche), l'énergie retombe (plancher 0,5 inchangé). Rien n'est perdu ; dès qu'il y a une unité, elle repart.
- Le goulot « combustible » apparaît quand il reste moins de 120 s (`combustibleAlerte`) ou à l'arrêt, avec le bouton Voir les Terres ; la page de l'énergie montre pour chaque source ce qu'elle brûle et pour combien de temps.
- État sauvegardé : `S.combu[source]` = la part d'unité en cours de combustion (0 à 1).

## À calibrer avec de vrais joueurs

Les durées (« s ») sont faibles devant le rythme d'un extracteur de charbon : le goulot ne devrait apparaître qu'à qui n'a pas d'extracteur du combustible, ou le vide pour ses recettes. À monter si c'est trop discret.
