# Rapport technique complet — calendrier Handler et évolution multi-utilisateur

> **Archive historique — non normative.** Ce rapport décrit un état intermédiaire
> du 7 septembre 2026 et peut mentionner des écrans ou workflows retirés depuis.
> Pour l'état actuel, suivre le code, [l'audit actuel](AUDIT-ACTUEL-2026-09-10.md)
> et le [guide de déploiement](DEPLOIEMENT-MULTI-UTILISATEUR.md).

Audit réalisé le 7 septembre 2026 sur le code présent dans le dépôt. Ce rapport
fait la différence entre ce qui a été vérifié dans le code et les limites qui
restent réellement ouvertes. Le dépôt était déjà très modifié avant cet audit ;
aucune modification non liée n'a été supprimée.

Légende : ✅ vérifié et couvert au moins par une régression ; 🟡 utilisable mais
avec une réserve ; 🟠 défaut ou décision produit à traiter avant d'en faire une
promesse générale ; ⚪ non vérifié dans un navigateur authentifié.

> **Mise à jour corrective (7 septembre 2026).** Les conclusions historiques
> désormais contraires au code courant dans les §§13–14, 25 et 28–30 — zones
> IANA publiques, conversions GMT, audit concurrent, scope HMAC, SuperAdmin,
> Push, SSE et structure du menu Calendrier — sont remplacées par
> [`RAPPORT-CORRECTIFS-2026-09-07.md`](RAPPORT-CORRECTIFS-2026-09-07.md). Ce
> document conserve l'état antérieur comme trace d'audit.

## 1. Résumé des modifications

L'évolution présente transforme l'application mono-utilisateur historique en
application multi-Handler : rôles séparés, rattachements de Professeurs, scopes
SQL, cycle de vie des comptes, audit, disponibilité, calendrier public
tokenisé, statistiques et administration.

Pour la demande « Calendrier » du Handler, les éléments suivants sont en place :

- plage métier par Handler, stockée dans utilisateurs
  (calendar_start_time, calendar_end_time), avec des pas de 30 minutes ;
- menu Calendrier réservé au Handler, panneau de réglages et FullCalendar
  alimenté par la plage effective ;
- réglage séparé du calendrier public : actif/inactif, fuseau, génération et
  rotation de lien secret ;
- calcul public d'abord en heure centrale, puis projection vers GMT, GMT+1 ou
  GMT+2 ;
- règles de disponibilité récurrentes/ponctuelles et exceptions, utilisées pour
  déterminer les créneaux publics ;
- migrations versionnées 0705 à 0708.

Trois correctifs ont été ajoutés pendant l'audit :

1. la migration append-only 2026090708 répare la reprise historique qui
   confondait fuseau personnel et fuseau du calendrier public, sans modifier
   la migration déjà appliquable 0707 ;
2. le calcul du calendrier public distingue désormais correctement un début
   à 00:00 d'une fin de journée, qui seule vaut 24:00 ;
3. les protections de modules Professeur sont appliquées côté serveur pour
   disponibilité/indisponibilité et monétisation, tout en laissant le Handler
   et le SuperAdmin travailler même si leurs flags valent 0.

## 2. Résultat de npm test

Commande exécutée à la racine :

~~~
npm test
~~~

Résultat : **succès, 14 tests de régression sur 14**.

La suite a notamment validé le bootstrap SuperAdmin, les scopes temps réel et
push, le cycle de vie, les règles de disponibilité, la migration d'horaires,
les transitions DST déjà couvertes, la conversion publique, le jeton public,
les réglages, l'isolation entre Handlers, le transfert de Professeur, les
analyses globales et les flags de modules.

Ce résultat ne remplace pas un test visuel authentifié de FullCalendar :
celui-ci reste ⚪, car aucun mot de passe de test n'a été saisi dans le
navigateur pendant l'audit.

## 3. Architecture complète

Le serveur est une application Express 5 CommonJS rendue par EJS, avec un
frontend JavaScript sans framework et SQLite comme stockage. Le trajet normal
est le suivant :

~~~
EJS / JS / FullCalendar
        ↓ fetch + X-CSRF-Token
middleware sécurité → authentification → scope métier → contrôleur
        ↓
modèle SQL paramétré → SQLite WAL / migrations
        ↓
SSE et push Web Push pour les mises à jour
~~~

Les responsabilités sont séparées :

- app.js installe les limites de débit, sessions, sécurité, routes, EJS, erreurs
  et démarrage de la base ;
- middleware/auth.middleware.js gère connexion, session, appareil de confiance,
  mot de passe obligatoire et capacités ;
- middleware/scope.middleware.js transforme les rôles/rattachements en scope
  exploitable par les contrôleurs ;
- controllers/ contient les validations HTTP et la composition métier ;
- models/ contient les requêtes, transactions et stockage ;
- utils/ contient les règles transverses : calendrier, fuseaux, audit,
  temps réel, push, sauvegarde ;
- public/js/ contient les écrans, et public/css/style.css le responsive ;
- models/migrations/ contient les migrations append-only.

Les routes API sont explicitement découpées : auth, account-lifecycle,
admin, admin-analytics, historique, disponibilités, équipe,
indisponibilités, monétisation, push, realtime, réservation publique,
propositions, statistiques, settings, séances et photos. Les pages publiques
de réservation sont sous /reservation/:token ; les anciennes routes publiques
globales répondent volontairement 404.

## 4. Base de données

SQLite est configuré en WAL, avec foreign_keys, busy_timeout et transactions
BEGIN IMMEDIATE. La table schema_migrations rend les migrations versionnées
idempotentes et sérialisées. Les tables et relations importantes sont :

| Domaine | Tables / clés principales | Rôle et intégrité |
|---|---|---|
| Identité | utilisateurs (id), utilisateur_roles (utilisateur_id, role) | compte, hash mot de passe, état, flags, tarif, version de session, réglages calendrier ; rôle non déduit d'un booléen UI |
| Organisation | rattachements_professeurs (handler_id, professeur_id) | association active d'un Professeur à son Handler, index partiel actif |
| Séances | seances, reconciliation_seances_legacy | séance scoppée par handler_id/intervenant_id, révision, suppression logique et reconciliation héritée |
| Disponibilité | disponibilites, exceptions_disponibilites | règles récurrentes ou ponctuelles et exceptions ; FK vers Handler/intervenant, CHECK de type/date/ordre, triggers de scope |
| Blocages et propositions | indisponibilites, propositions_seances | indisponibilités historiques et propositions, scoppées en migration multi-Handler |
| Calendrier public | public_reservation_devices et colonnes token_hash/public_calendar_* de utilisateurs | appareil de demande existant, lien public par Handler, token hashé et état du calendrier |
| Cycle de vie | demandes_inscription, tokens_compte | demande, approbation/refus, activation et reset à durée limitée |
| Session/sécurité | sessions, trusted_devices, journal_auth, blocked_ips | session persistée, validateurs d'appareil hashés, traçabilité connexion et blocage IP |
| Audit | historique, historique_actions | journal de consultation/activité et actions chaînées ; colonnes handler/intervenant ajoutées pour le scope |
| Produit | catalogue_options, catalogue_options_supprimees, photos | catalogue, corbeille de catalogue, pièces liées aux séances |
| Notifications | push_subscriptions | abonnement VAPID actif, appareil et dernière utilisation |

Les migrations 2026090701 à 0704 portent la fondation multi-Handler,
disponibilités, colonnes d'audit et format public_id. 0705 ajoute la plage
horaire Handler ; 0706 reconstruit les tables de disponibilité avec le contrat
explicite « 24:00 seulement comme fin » ; 0707 ajoute
public_calendar_timezone ; 0708 répare la confusion historique décrite en
section 14.

Les contraintes DB sont une bonne seconde ligne de défense : disponibilites
vérifie par trigger que le Handler porte le rôle Handler et que l'intervenant
est lui-même ou un Professeur activement rattaché. Les index suivent les
requêtes de scope (handler/intervenant/date, rôle, rattachement, état de
demande, expiration session).

## 5. Authentification et sessions

Les mots de passe sont hashés avec bcrypt (coût 12 dans le bootstrap).
Express-session est stocké dans SQLite ; le cookie est HttpOnly, SameSite=Strict
et Secure selon l'environnement. La session porte une version : une
réinitialisation ou révocation rend les anciennes sessions invalides.

La restauration par appareil de confiance ne stocke pas le secret brut : un
sélecteur et un validateur hashé sont utilisés. Les jetons d'activation/reset
ont un hash, une expiration et une consommation unique. Les réponses de reset
ne révèlent pas si l'identifiant existe.

Les gardes vérifient successivement l'authentification, l'état du compte, le
changement de mot de passe requis et, pour les mutations, le mode
lecture-seule. Les endpoints de connexion, demande de compte, reset et
confirmation sont limités séparément.

## 6. Rôles et scopes

Les rôles canoniques sont super_admin, handler et professeur. Une même personne
peut être Handler et SuperAdmin : le système ne suppose pas un utilisateur
nommé « Hossam » ni un identifiant fixe.

construireScopeAcces dans models/access-scope.model.js produit notamment :

- handlerOwnIds : le Handler dont la personne est propriétaire ;
- handlerProfesseurIds : Handlers auxquels elle est rattachée activement comme
  Professeur ;
- handlerIds : union des deux, sans élargissement global ;
- intervenantIds : l'utilisateur lui-même lorsqu'il peut intervenir.

Le filtre de lecture des séances est plus strict que le simple rôle : le
Handler voit ses séances de Handler ; le Professeur ne voit que ses propres
séances dans ses rattachements actifs. Les vérifications de Handler/intervenant
inaccessibles répondent comme une ressource inconnue plutôt que de divulguer
une autre équipe.

## 7. Hossam Handler + Super Admin

Le bootstrap n'embarque pas d'identifiants. Il ne crée un premier compte que
si les variables INITIAL_SUPERADMIN_* sont explicitement configurées. Ce
compte reçoit les rôles super_admin, handler et professeur, ainsi qu'un
rattachement à lui-même ; il doit changer son mot de passe.

Un compte qui cumule Handler et SuperAdmin garde son espace Handler propre :
le scope normal ne devient pas une lecture de toutes les équipes. Les analyses
et actions globales ne passent que par les routes /api/admin et
/api/admin-analytics, où le middleware verifierRoleSuperAdmin est installé.
✅ Cette séparation est vérifiée par les tests de scope et d'analyses globales.

## 8. Cycle de vie des comptes

Le flux est : demande publique → revue par Handler (sa propre équipe) ou
SuperAdmin (vue globale) → approbation → email d'activation → mot de passe
choisi par l'utilisateur → compte actif. Le refus, le renvoi d'activation et
le reset utilisent le même modèle de jetons courts et hashés.

Les routes legacy d'administration qui créaient directement un utilisateur,
supprimaient physiquement un compte ou imposaient un mot de passe sont
désactivées par 410. La suspension/révocation et l'invalidation de sessions
préservent l'historique. Les demandes sont limitées à 8 par 15 minutes et les
confirmations à 12 par 15 minutes.

## 9. Équipe

Un Handler liste et modifie uniquement ses Professeurs à travers
/api/equipe/professeurs. Il peut modifier les droits propres au Professeur,
son tarif et déclencher un reset ; il ne gère pas une autre équipe.

Le transfert d'un Professeur entre Handlers est une action SuperAdmin
spécifique, tracée et testée en mémoire puis en persistance. La relation active
de rattachement est la source de vérité des filtres de séances, règles de
disponibilité, notifications et calendrier public.

## 10. Séances

Les séances passent par des contrôleurs et un modèle scoppés, avec validation
de date/heure/durée, conflits, version/revision et suppression logique.
handler_id et intervenant_id isolent chaque équipe. Les propositions de
déplacement et les indisponibilités associées restent elles aussi dans ce
périmètre.

La plage du calendrier Handler est vérifiée côté serveur lors des écritures :
une séance doit appartenir à l'intervalle central effectif. Une séance existante
hors nouvelle plage n'est ni détruite ni déplacée implicitement : le changement
de réglage réclame une confirmation explicite.

## 11. Disponibilités

Les disponibilités sont des règles positives récurrentes (jour de semaine) ou
ponctuelles (date), sur des pas de 30 minutes. Une exception peut rendre une
plage indisponible ou disponible. Le moteur résout les règles, exceptions,
indisponibilités et séances avant de publier les créneaux.

Le contrat de minuit est unique : 00:00 en début signifie le début de la
journée ; 24:00 n'existe que comme fin de journée en base/API de
disponibilité. Une règle 00:00–02:00 est maintenant bien résolue. Les triggers
et le scope empêchent un Professeur ou un Handler d'injecter une règle dans
l'équipe d'autrui.

## 12. Calendrier central

La source de vérité est utils/calendar-hours.js :

- pas fixe : 30 minutes ;
- défauts héritant du FullCalendar privé : 08:00–23:30 ;
- 00:00 est accepté uniquement comme fin dans le réglage de plage, puis rendu
  24:00:00 pour FullCalendar ;
- début < fin, format HH:MM et alignement sur 00/30 sont imposés.

Le fuseau central est CENTRAL_CALENDAR_TIMEZONE, qui vaut par défaut
Africa/Casablanca. Il s'agit d'une vraie zone IANA, pas d'un nombre d'heures
ajoutées. La même plage est appliquée aux séances, disponibilités,
indisponibilités et lecture FullCalendar. Un Professeur hérite du calendrier
de son Handler ; il n'a pas de plage indépendante.

## 13. Nouveau menu Calendrier

Dans views/index.ejs et public/js/ui.js, le menu Calendrier et le panneau de
réglages sont rendus/activés pour le Handler, cachés pour un Professeur seul.
Le panneau permet de choisir début/fin par tranches de 30 minutes et affiche
le fuseau central comme référence non modifiable.

PATCH /api/settings/calendar refuse explicitement les champs de fuseau public
ou central. S'il existe dans le futur une séance, disponibilité, exception ou
indisponibilité qui sortirait de la nouvelle plage, il répond 409
CALENDAR_RANGE_DATA_WARNING. Le front demande une seconde confirmation avec
confirm_out_of_range:true ; il n'efface aucune donnée.

Réserve 🟡 : la carte de réglage est déplacée dans la section Calendrier par
JavaScript. Sans JavaScript, elle n'est pas mise à l'emplacement final ; il
faudrait la rendre directement dans la bonne section pour une progressive
enhancement complète.

## 14. Conversion GMT du calendrier public

Les trois choix nouveaux sont exactement :

| Valeur métier | Zone réellement employée | Nature |
|---|---|---|
| GMT | Etc/GMT | UTC+00 fixe |
| GMT+1 | Etc/GMT-1 | UTC+01 fixe |
| GMT+2 | Etc/GMT-2 | UTC+02 fixe |

Le code calcule le créneau central, puis convertit date et heure dans la zone
cible avec Intl. Une traversée de minuit public est découpée en morceaux par
jour et une fin à minuit est représentée 24:00 afin de rester sur le bon jour
de grille. Le lien public ne modifie jamais les données centrales.

Point de produit important 🟠 : « 08:00 central = 10:00 GMT+2 » n'est vrai
que lorsque le fuseau central est UTC+00. Avec la configuration réelle
Africa/Casablanca, l'écart dépend de l'offset marocain à la date donnée. Le
comportement actuel est une conversion de fuseaux correcte. Si le métier veut
toujours « ajouter deux heures à l'horloge centrale », il faut renommer les
choix et changer le contrat, ce qui est différent de GMT+2.

La migration 0707 avait repris timezone (fuseau personnel) dans le fuseau
public. C'était une confusion réelle. La migration append-only 0708 corrige
les comptes où la valeur publique est encore exactement la valeur personnelle
et où aucun choix UI historisé n'existe. Elle conserve les choix UI tracés.
Avant un déploiement d'une base existante, PUBLIC_RESERVATION_TIMEZONE doit
refléter la valeur historique ; sinon le repli est Europe/Paris. Une ancienne
valeur personnalisée perdue ne peut pas être reconstituée automatiquement.

## 15. Calendrier public

Le lien est un jeton aléatoire de 32 octets, stocké sous SHA-256. Le jeton brut
n'est renvoyé qu'au moment de sa création/régénération et n'est pas journalisé.
Un lien désactivé ou remplacé est inutilisable. Les anciens endpoints publics
globaux, y compris réservation, retournent 404.

GET /api/reservation-public/:token ne renvoie que date, heure_debut, heure_fin
et etat (disponible/indisponible). Aucun identifiant de Handler, Professeur,
élève, séance ou compte n'est exposé. Les créneaux sont déterminés seulement
avec le Handler actif, ses Professeurs actifs rattachés, les disponibilités,
exceptions, indisponibilités et séances. Il n'existe pas de création de
réservation publique dans ce flux.

La route publique est limitée à 120 requêtes / 5 min, compatible SSE, et le
frontend interroge un calendrier en lecture seule. ✅ Les tests couvrent la
confidentialité de réponse, l'isolation par token, la conversion, le minuit et
le changement d'année.

## 16. Statistiques

Les statistiques utilisent le scope courant : un Handler analyse son équipe,
un Professeur ses propres séances dans son rattachement. Le SuperAdmin dispose
d'une route d'analyse globale distincte. Les métriques de séances, durées,
statuts et agrégats ne font donc pas un SELECT global depuis l'espace de
travail ordinaire.

La séparation est saine, mais l'exactitude métier des indicateurs dépend
toujours des données héritées (statuts/durées de séance) : elle est testée à
un niveau de scope, pas par une recette financière exhaustive.

## 17. Monétisation

La monétisation est calculée à partir des séances dans le scope autorisé et du
tarif horaire attribué au compte ; le contrôleur peut générer un relevé.
L'accès est désormais réellement contrôlé côté serveur :

- SuperAdmin : autorisé ;
- Handler : autorisé sur son scope ;
- Professeur : autorisé seulement si peut_voir_monetisation vaut 1 ;
- Professeur non autorisé : 403 MONETISATION_ACCESS_DISABLED.

Le flag n'est donc plus seulement décoratif dans l'UI. Le détail de formule,
les arrondis et la fiscalité ne constituent pas encore une comptabilité
certifiée : validation métier/fiscale externe nécessaire avant facturation.

## 18. Historique

historique_actions reçoit des événements de sécurité et métier, avec auteur,
Handler, intervenant, libellé et détails ; les colonnes de scope sont indexées.
Le secret d'audit/HMAC protège la chaîne d'intégrité lorsque configuré.

L'API d'administration expose la consultation et le détail ; les anciennes
routes de purge globale retournent 410. Une fonction interne de suppression
historique peut subsister pour la gestion technique de données personnelles,
mais elle n'est pas une capacité offerte à l'interface normale. La politique
de rétention et la procédure RGPD doivent être écrites avant production.

Deux réserves d'intégrité sont à corriger avant une charge concurrente
importante. L'ajout de la chaîne HMAC lit le dernier hash puis insère sans
transaction commune : deux écritures parallèles peuvent partager le même
previous_hash et invalider la seconde entrée. En outre, handler_id et
intervenant_id servent au filtrage de l'audit mais ne participent pas encore au
HMAC. Une migration de format/version de signature et un append sérialisé dans
une transaction sont recommandés.

## 19. SSE / Push

Les mutations pertinentes émettent une notification applicative scoppée pour
mettre à jour les clients temps réel. La compression est désactivée sur SSE
pour ne pas bufferiser les événements. Les souscriptions Web Push sont liées à
l'utilisateur et aux scopes ; les endpoints expirés (404/410) sont désactivés.

Les tests realtime-scope et push-scope valident qu'un événement ne traverse
pas une frontière de Handler. En production, il faut surveiller la reprise des
connexions SSE et l'exécution planifiée des jobs push.

Réserve produit 🟡 : à l'intérieur d'une même équipe, le SSE diffuse
volontairement les métadonnées d'activité (acteur, action, message) à tous les
Professeurs rattachés. C'est cohérent pour une équipe collaborative, mais plus
large que la lecture HTTP individuelle des séances. La confidentialité attendue
doit être arbitrée explicitement.

## 20. Administration

Toutes les routes /api/admin requièrent authentification, compte sécurisé,
scope chargé puis rôle SuperAdmin. Elles couvrent les demandes, transfert de
Professeur, catalogue, flags, tarif, sessions, journal de connexion, IP
bannies, appareils de confiance et maintenance SQLite.

Les actions dangereuses historiques sont volontairement désactivées : création
directe, suppression physique d'utilisateur, reset imposé de mot de passe,
effacement global des séances et effacement global de l'historique répondent
410. La maintenance SQLite doit être protégée par des procédures
d'exploitation et un backup récent.

Réserve 🟡 : l'autorisation principale repose sur utilisateur_roles, mais
plusieurs protections de compte cible consultent encore le booléen historique
est_admin. Il existe donc deux sources de vérité pour reconnaître un
SuperAdmin. Il faut les unifier (contrôle de rôle ou synchronisation SQL) pour
ne jamais traiter comme cible ordinaire un SuperAdmin ayant est_admin=0.

## 21. Frontend complet

Le client charge les données avec public/js/http.js (CSRF et gestion d'erreur),
pilote le menu avec ui.js, puis délègue aux modules séances, calendrier,
disponibilités, équipe, compte, administration, statistiques, push et
réservation publique. FullCalendar est utilisé pour le calendrier privé et
public.

Les réglages de calendrier sont relus depuis /api/settings ; le client ne
suppose donc plus une plage hardcodée. Le public reçoit une grille de créneaux
sans actions de mutation. Les sections sensibles sont masquées par rôle, mais
la sécurité réelle est assurée par les gardes API et non par le masquage.

## 22. Design / responsive

Le CSS propose des points de rupture desktop/tablette/mobile, toolbar de
calendrier adaptable, cartes de réglages, légendes et navigation compacte. Le
parcours visuel de la page de connexion et le DOM/CSS ont été inspectés ;
l'écran authentifié n'a pas été ouvert sans identifiants autorisés. Donc la
qualité responsive authentifiée est ⚪ à vérifier manuellement.

Points UX positifs : séparation claire du calendrier central et du fuseau
public, avertissement avant réduction de plage, lien public isolé, libellés
de rôles. Points à améliorer 🟡 : style.css contient plusieurs blocs hérités
et redondants, et le déplacement JS de la carte Calendrier complique la
maintenance/accessibilité sans JavaScript.

## 23. Sécurité

Contrôles vérifiés :

- requêtes SQL paramétrées dans les modèles ;
- CSP, X-Content-Type-Options, Referrer-Policy, COOP/CORP, désactivation de
  x-powered-by ;
- vérification Origin/Referer et CSRF pour les mutations avec session ;
- cookies de session protégés, invalidation par session_version et appareils
  de confiance hashés ;
- limites de débit globales, login, cycle de vie et calendrier public ;
- token public aléatoire/hashé, comparaison sûre et réponse minimale ;
- scopes Handler/Professeur avant les lectures/écritures ;
- validation des formats, plages, rôles et transitions DB ;
- journaux de connexion, blocage IP et révocation d'appareils.

Risques résiduels : SQLite est un stockage à écriture unique, donc la montée en
charge multi-instance exige une base partagée ou une architecture adaptée ;
les secrets, URL d'application, SMTP, VAPID, sauvegardes et proxy de confiance
doivent être configurés hors dépôt ; il faut une revue de dépendances et un
scan dynamique avant exposition Internet.

Deux points précis complètent cette réserve. D'abord, une souscription Web Push
fait actuellement un UPSERT par endpoint en réattribuant son utilisateur :
connaître l'endpoint d'un autre compte permettrait un déni de notifications,
pas leur lecture. Le conflit doit être refusé si le propriétaire diffère.
Ensuite, TRUST_PROXY=true est sûr seulement si Node n'est jamais joignable
directement hors du proxy de confiance ; binding loopback/pare-feu et
X-Forwarded-* doivent être contrôlés en recette d'infrastructure.

## 24. Tests automatiques expliqués

| Test | Contrat vérifié |
|---|---|
| bootstrap-superadmin | aucun identifiant embarqué, bootstrap explicite |
| realtime-scope | diffusion SSE limitée au bon périmètre |
| push-scope | notifications push limitées au scope |
| account-lifecycle | demande, approbation, activation et reset |
| disponibilite-model | règles, exceptions, conflits et scope |
| calendar-hours-migration | 0705/0706/0707/0708, défauts et réparation fuseau |
| timezone-dst | conversions et transitions DST déjà prévues |
| public-calendar-timezone | GMT fixes, changement de date et extrémités |
| public-calendar-token | lien secret, confidentialité, minuit 00:00–02:00 |
| workspace-settings | permissions Handler, range, avertissement 409 et lien |
| multi-handler-isolation | aucune fuite d'équipe entre Handlers |
| professor-transfer | transfert administratif et persistance |
| admin-analytics | global réservé au SuperAdmin |
| module-access-flags | 403 Professeur sans flag, autorisation Professeur/Handler/SuperAdmin conforme |

Les tests sont des scripts Node avec bases temporaires ; ils ne constituent pas
une batterie navigateur end-to-end. En particulier, il manque un test
FullCalendar authentifié sur mobile et sur le pli DST IANA détaillé plus bas.

## 25. Matrice métier

| Exigence | État | Preuve / réserve |
|---|---|---|
| Plusieurs Handlers isolés | ✅ | rôles, rattachements, modèles scoppés et test isolation |
| Professeur rattaché, sans équipe étrangère | ✅ | scope + triggers disponibilité + transfert testé |
| Calendrier Handler 30 min | ✅ | util calendar-hours, UI et API |
| 00:00 fin de journée | ✅ | normalisation 24:00 et migration 0706 |
| Changer plage sans perdre données | ✅ | avertissement 409/confirmation, aucune suppression |
| Fuseau central non modifiable dans menu | ✅ | endpoint rejette le fuseau, UI en référence |
| GMT/GMT+1/GMT+2 public | ✅ | zones Etc/GMT fixes, projection après calcul |
| Exemple « central +2 » constant | 🟠 | ambigu avec central Africa/Casablanca, décision produit requise |
| Lien public privé sans identités | ✅ | token hashé, payload minimal, tests |
| IANA historique Europe/Paris en DST | 🟠 | pli/heure répétée non représentable correctement aujourd'hui |
| Administration globale seulement SuperAdmin | ✅ | router dédié et test analyses |
| Flags modules Professeur appliqués | ✅ | middleware + route + test |
| Flag Aujourd'hui comme protection API | 🟡 | c'est actuellement une visibilité UI ; /api/seances est partagé |
| Conservation visuelle publique 09:00–23:00 | 🟡 | la source unique choisit l'ancien privé 08:00–23:30 ; changement explicite de fenêtre |

## 26. Matrice permissions

| Action | SuperAdmin | Handler | Professeur |
|---|---:|---:|---:|
| Voir/éditer son calendrier central | oui (dans son scope Handler) | oui | non, hérite en lecture |
| Modifier le calendrier public de son Handler | oui s'il est aussi Handler dans cet espace | oui | non |
| Lire séances | global uniquement via admin ; sinon scope personnel | son équipe | ses propres séances rattachées |
| Gérer Professeurs | global admin | son équipe | non |
| Gérer disponibilités / indisponibilités | oui dans scope | oui | si flag peut_voir_indisponibilites=1 |
| Voir monétisation | oui | oui | si flag peut_voir_monetisation=1 |
| Voir onglet Aujourd'hui | oui | oui | si flag peut_voir_aujourdhui=1 (UI) |
| Statistiques globales | oui, route dédiée | son équipe | son activité |
| Transférer Professeur | oui | non | non |
| Gérer sessions/IP/audit global | oui | non | non |
| Consulter calendrier public | sans compte, avec token actif | idem | idem |

Les flags ne retirent jamais au Handler/SuperAdmin leurs propres outils :
c'est le contrat explicite testé. Ils sont des capacités de Professeur.

## 27. Matrice Frontend / API / Controller / Model / DB

| Fonction | Frontend | API / contrôleur | Modèle | Stockage |
|---|---|---|---|---|
| Plage calendrier | calendrier.js, ui.js | PATCH /api/settings/calendar, workspace-settings.controller | workspace-settings.model | utilisateurs.calendar_start_time/end_time |
| Calendrier public | ui.js, public-reservation.js | /api/settings/public-calendar ; /api/reservation-public/:token | public-calendar.model | token hash, actif, public_calendar_timezone |
| Disponibilité | disponibilites.js | /api/disponibilites, disponibilites.controller | disponibilite.model | disponibilites, exceptions_disponibilites |
| Séances | seances.js | /api/seances, seances.controller | seance.model | seances |
| Équipe | equipe.js | /api/equipe, equipe.controller | equipe/access-scope models | rattachements_professeurs, utilisateurs |
| Cycle compte | account-lifecycle.js | /api/account-lifecycle | account-lifecycle.model | demandes_inscription, tokens_compte |
| Monétisation | ui.js | /api/monetisation | monetisation/seance models | séances, tarifs utilisateurs |
| Stats | ui.js | /api/statistiques, /api/admin-analytics | seance/access scope | séances, utilisateurs |
| Audit | ui.js/admin.js | /api/historique, /api/admin/history | historique.model | historique, historique_actions |
| Push/SSE | push.js, http.js | /api/push, /api/realtime | push-subscription model | push_subscriptions, sessions |

## 28. Bugs et cas non traités

1. **DST IANA legacy : 🟠.** Un slot réel de 30 minutes peut devenir
   02:30→02:00 lors du retour d'heure Africa/Casablanca vers Europe/Paris
   (25 octobre 2026), ou sembler durer 90 minutes au printemps. L'API ne donne
   que des heures civiles et le client les pose sur une grille UTC artificielle.
   Les choix GMT fixes ne sont pas touchés.
2. **Pli du fuseau central : 🟠.** Les données métier sont date+heure sans
   offset ; une heure centrale répétée ne permet pas de savoir quelle occurrence
   était voulue.
3. **Sémantique de GMT+2 : 🟠.** La conversion actuelle est techniquement
   correcte mais peut différer du résultat métier attendu si « +2 » signifie
   un décalage relatif à l'horloge Maroc.
4. **Migration 0708 : 🟡.** Elle dépend de la valeur historique
   PUBLIC_RESERVATION_TIMEZONE au déploiement. Elle protège les choix UI tracés,
   mais pas une modification SQL manuelle non historisée.
5. **Fenêtre publique historique : 🟡.** Le public avait visuellement
   09:00–23:00, tandis que l'ancien privé était 08:00–23:30. La source unique
   retient 08:00–23:30 ; c'est cohérent mais pas une conservation littérale du
   public historique.
6. **Aujourd'hui : 🟡.** Son flag masque l'onglet Professeur, mais ne bloque
   pas /api/seances, nécessaire aussi au calendrier et aux statistiques.
7. **Tests visuels : 🟡.** Le script e2e-browser-audit est ancien et n'est pas
   dans npm test ; pas de couverture navigateur authentifiée/mobile actuelle.
8. **Exploitation SQLite : 🟡.** Pas de stratégie de cluster/backup/restauration
   vérifiée par test de reprise.
9. **Chaîne d'audit concurrente : 🟠.** Deux ajouts simultanés peuvent signer
   le même previous_hash car la lecture et l'insertion ne sont pas atomiques.
   Sérialiser l'append dans une transaction et ajouter un test Promise.all.
10. **Scope d'audit non signé : 🟡.** handler_id/intervenant_id ne sont pas
    inclus dans le HMAC alors qu'ils filtrent les vues. Versionner la signature
    avant de les ajouter, afin de conserver la vérification de l'historique.
11. **Double source SuperAdmin : 🟡.** utilisateur_roles et est_admin ne sont
    pas partout alignés. Remplacer les gardes cibles est_admin par le rôle
    canonique ou les synchroniser en base.
12. **Conflit endpoint Push : 🟡.** L'UPSERT peut réattribuer une souscription
    à un autre utilisateur (déni de service de notifications). Refuser ce
    conflit de propriétaire.
13. **Métadonnées SSE d'équipe : 🟡.** Tous les Professeurs d'un Handler
    reçoivent les métadonnées d'activité de l'équipe. Décision produit requise
    si les équipes ne doivent pas partager cette information.

Pour les IANA, la remédiation robuste est un projet séparé : API avec instants
ISO/offset en plus des champs existants, adaptateur de fuseau FullCalendar
(Luxon ou équivalent), test navigateur printemps/automne et UX pour l'heure
répétée. Ne pas convertir silencieusement Europe/Paris vers GMT+1 : ce serait
faux l'été.

## 29. Guide de recette manuelle

1. Démarrer avec une base de recette et un Handler ; vérifier que Calendrier
   est visible pour lui et absent pour un Professeur seul.
2. Régler 08:00–23:30, créer/modifier séance, règle et indisponibilité sur les
   bornes. Réduire la plage : attendre 409, annuler, puis confirmer ; contrôler
   que les anciennes données existent encore.
3. Tester une plage 00:00–02:00 et une disponibilité 00:00–02:00 ; le lien
   public doit montrer 00:00 et 01:30 disponibles, 02:00 indisponible.
4. Activer le calendrier public, ouvrir le lien en navigation privée et
   contrôler que ni nom de Handler ni nom de Professeur ni intitulé de séance
   ne sont exposés. Régénérer le lien et vérifier que l'ancien échoue.
5. Choisir GMT, GMT+1 et GMT+2 à une date sans transition ; vérifier la date,
   l'heure, le passage minuit et la non-modification du calendrier privé.
6. Avec un Professeur, tester chaque flag 0/1 : indisponibilités,
   monétisation et l'onglet Aujourd'hui ; vérifier aussi qu'un Handler reste
   autorisé même avec 0.
7. Tester deux Handlers et un transfert SuperAdmin de Professeur : aucune
   séance/règle/statistique ne doit être visible de l'autre côté avant/après
   selon le rattachement actif.
8. Réaliser une revue sur 360 px, 768 px et desktop avec une session
   authentifiée : menu, toolbar, panneaux et modal 409.
9. Avant d'annoncer les IANA : tester précisément printemps et automne avec
   central Africa/Casablanca vers Europe/Paris ; aujourd'hui le résultat est un
   échec attendu/documenté, pas un critère validé.

## 30. Production readiness

**Prêt sous conditions, pas « prêt sans réserve ».** Avant mise en production :

- fixer CENTRAL_CALENDAR_TIMEZONE, PUBLIC_RESERVATION_TIMEZONE historique
  (pour 0708), APP_BASE_URL/ACCOUNT_LIFECYCLE_APP_URL, SESSION_SECRET, secrets
  VAPID, SMTP et trust proxy dans les variables d'environnement ;
- sauvegarder la base et répéter une restauration avant migration ; conserver
  un export de schema_migrations ;
- exécuter npm test sur l'artefact cible, puis la recette manuelle ci-dessus ;
- décider formellement la sémantique « GMT+N absolu » versus « décalage relatif
  au calendrier central » ;
- soit limiter officiellement le calendrier public aux trois choix GMT fixes,
  soit financer la correction IANA/DST avec instants et tests navigateur ;
- corriger l'append d'audit concurrent, signer son scope dans un format
  versionné, unifier le rôle SuperAdmin, et refuser la réattribution Push ;
- arbitrer si les métadonnées SSE doivent être partagées à toute l'équipe ;
- mettre en place surveillance (erreurs, saturation SQLite, jobs push, backups,
  renouvellement secrets), HTTPS et rotation des secrets ;
- faire une revue sécurité dépendances/configuration avant exposition externe.

### Verdict explicite

**Idée métier : partiellement prête.** Le coeur — calendriers Handler,
isolation multi-équipe, disponibilité, lien public secret et choix GMT fixes —
est implémenté et couvert par 14/14 régressions. En revanche, on ne peut pas
promettre une représentation correcte de toutes les zones IANA aux changements
d'heure, ni interpréter sans décision le slogan « central +2 » avec le fuseau
central Maroc.

**Mise en production : 🟡 oui, si le périmètre public est limité à GMT/GMT+1/GMT+2
et si les prérequis d'exploitation/recette sont réalisés.** Pour une promesse
de fuseaux IANA complets ou une exigence absolue de conservation de l'ancienne
fenêtre publique, la mise en production doit attendre les corrections de la
section 28.
