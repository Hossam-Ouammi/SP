# Audit technique — évolution multi-utilisateur

## Périmètre et méthode

Cet audit décrit l’état du dépôt Express/EJS/SQLite après l’évolution multi-utilisateur. Il repose sur la lecture des routes, contrôleurs, modèles, migrations, middlewares, configuration et scripts de régression présents dans le projet.

Il ne constitue ni un test d’intrusion, ni une certification de conformité, ni la preuve qu’une configuration de production donnée est correcte. En particulier, les résultats d’exécution de la suite de tests doivent être conservés dans le pipeline ou le journal de déploiement : la section « Vérifications disponibles » décrit seulement les contrôles observables dans les scripts.

## Synthèse

L’application conserve son architecture initiale : un processus Node.js/Express, des vues EJS, des ressources JavaScript/CSS servies localement et une base SQLite. L’évolution ajoute une frontière métier par espace Handler au lieu de créer une application, une API ou une base parallèle.

Les points structurants observés sont les suivants :

- les rôles sont des capacités cumulables stockées en base : Super Admin, Handler et Professeur ;
- les données métier portent désormais un Handler propriétaire et, lorsque nécessaire, un intervenant ;
- les routes authentifiées construisent un scope serveur avant d’accéder aux données ;
- un Professeur n’a qu’un rattachement actif à la fois, garanti par un index unique SQLite ;
- l’administration globale est explicite et distincte des routes opérationnelles Handler ;
- le cycle de vie des comptes, les liens publics et les sessions évitent le stockage de jetons ou mots de passe en clair ;
- les migrations sont versionnées, transactionnelles et non destructives pour les données existantes.

## Architecture observée

| Couche | Éléments | Rôle dans l’architecture |
| --- | --- | --- |
| Entrée HTTP | app.js | Initialise SQLite, sessions, sécurité HTTP, compression, limites de débit, routes API, ressources statiques et vues EJS. |
| Interface | views, public/js, public/css | Conserve l’interface EJS et JavaScript natif ; FullCalendar reste servi localement. |
| Routes | routes | Applique les chaînes de middlewares puis délègue aux contrôleurs. Les domaines couvrent notamment séances, disponibilités, équipe, cycle de vie, historique, temps réel, push, calendrier public et administration. |
| Contrôleurs | controllers | Valident les entrées HTTP, sélectionnent le scope utile, préparent les réponses et définissent le scope de notification temps réel. |
| Domaine et persistance | models | Centralise les requêtes SQLite, les transactions immédiates, la résolution des rôles/scopes, les rattachements, les disponibilités, l’historique et les jetons. |
| Contrôles transverses | middleware, utils, config | Gère authentification, CSRF, Origin/Referer, sessions, IP, notifications SSE/push, e-mail, secrets et paramètres de déploiement. |

Le chemin nominal d’une requête métier authentifiée est : session valide → chargement de l’utilisateur → vérification du compte → construction du scope → garde de rôle ou de portée → contrôleur → modèle SQL scopé → notification SSE éventuellement scopée.

## Modèle d’accès et isolation

Le module models/access-scope.model.js calcule les rôles effectifs à partir de utilisateur_roles et des rattachements actifs. Il distingue :

- le Handler propriétaire de son propre espace ;
- le Professeur rattaché à un Handler actif ;
- l’intervenant, qui peut être le Handler lui-même ou un Professeur rattaché ;
- le Super Admin, dont la capacité globale n’élargit pas automatiquement les routes opérationnelles.

Cette dernière séparation est importante pour les comptes à rôles cumulés. Les routes ordinaires de séances, statistiques, monétisation et historique s’appuient sur le scope opérationnel. Les lectures globales demandent un routeur Super Admin explicite, par exemple /api/admin, /api/admin-analytics, avec un marqueur de contexte dédié.

Les garde-fous sont répartis sur plusieurs niveaux :

- verifierAuthentification relit l’utilisateur en base et contrôle son statut, son accès et sa version de session ;
- verifierCompteSecurise bloque les comptes qui doivent encore changer leur mot de passe ;
- chargerScopeAcces reconstruit la portée depuis la base à chaque requête ;
- les gardes de rôle et de portée refusent les identifiants Handler/intervenant hors scope ;
- verifierModeEcritureAutorise bloque l’écriture des comptes en lecture seule, hors Super Admin ;
- les requêtes des modèles filtrent les données selon handler_id et, pour un Professeur, intervenant_id.

Pour les disponibilités, la défense est aussi portée par SQLite : les déclencheurs des tables disponibilites et exceptions_disponibilites vérifient que le couple Handler/intervenant correspond à un Handler et à un rattachement actif. Un appel SQL direct incohérent est donc refusé même si un contrôleur était contourné.

## Migrations et compatibilité des données

Le runner models/migrations/index.js mémorise les migrations dans schema_migrations. Chaque migration non encore appliquée est exécutée dans une transaction SQLite immédiate ; la liste est append-only et vérifie l’unicité des versions.

| Version | Effet principal | Traitement des données existantes |
| --- | --- | --- |
| 2026090701_multi_handler_foundation | Ajoute les rôles, identifiants publics, statut/fuseau/couleur utilisateur, calendrier public, scopes métier, rattachements, demandes et jetons de compte. | Rattache les données legacy à un Handler initial choisi sans règle nominative. Les séances dont l’intervenant ne peut pas être prouvé vont dans reconciliation_seances_legacy au lieu d’être attribuées par déduction. |
| 2026090702_availability_rules | Crée disponibilites et exceptions_disponibilites avec index et déclencheurs de cohérence de scope. | N’écrase pas les indisponibilités existantes ; le nouveau modèle est complémentaire. |
| 2026090703_historique_scope_columns | Ajoute handler_id et intervenant_id à historique_actions. | Reprend les scopes explicitement présents sur les séances sans modifier les champs déjà signés de la chaîne d’intégrité. |
| 2026090704_public_id_format | Normalise les identifiants générés vers AD-…, HD-… et PR-…. | Préserve les identifiants non legacy choisis manuellement et ne remplace que les anciens identifiants opaques générés. |

Le bootstrap d’une base neuve ne crée pas de compte métier si les trois variables INITIAL_SUPERADMIN_NAME, INITIAL_SUPERADMIN_EMAIL et INITIAL_SUPERADMIN_PASSWORD ne sont pas fournies. Lorsqu’elles le sont, le premier compte reçoit les capacités nécessaires au démarrage. Ce mécanisme ne remplace pas une rotation de mot de passe.

## Flux métiers sensibles

### Comptes et rattachements

Une demande publique est créée pour le rôle Handler ou Professeur. Pour un Professeur, le Handler est choisi par identifiant public. La revue est limitée au Handler concerné pour les demandes Professeur, tandis que le Super Admin dispose de la vue globale explicite.

L’approbation crée un compte en attente d’activation, son rôle et, le cas échéant, le rattachement. Le lien d’activation et le lien de réinitialisation reposent sur 32 octets aléatoires encodés en base64url ; seul leur SHA-256 est stocké. Les jetons ont une expiration, un état d’usage et de révocation. L’activation, le reset, la suspension et le transfert s’appuient sur session_version pour invalider les sessions et appareils de confiance antérieurs.

Le transfert d’un Professeur est une opération Super Admin explicitement routée sous /api/admin/professeurs/:id/transfer. Il ferme le rattachement source, ouvre le rattachement destination dans une transaction, ne réécrit pas les séances historiques, invalide les sessions du Professeur, ferme ses flux SSE actifs et écrit une trace d’entrée et de sortie dans les deux historiques Handler.

### Planning, disponibilités et équipe

Les séances, indisponibilités, propositions, photos, statistiques et monétisation partagent le filtre Handler/intervenant. Un Handler peut gérer son équipe active ; un Professeur est limité à ses propres données dans son rattachement actif. Les disponibilités positives, ponctuelles, récurrentes et leurs exceptions sont séparées des indisponibilités de planning.

Les réglages Calendrier séparent la plage métier centrale du fuseau de représentation publique. La référence centrale commune est configurée côté exploitation; le Handler peut modifier seulement les bornes de sa plage et le fuseau du calendrier public. Un Professeur rattaché consulte la plage centrale héritée, sans pouvoir modifier la plage, le fuseau public ou le lien.

### Calendrier public

Le calendrier public ne possède plus de route globale. Les surfaces exposées sont /reservation/:token et /api/reservation-public/:token, avec un flux d’événements associé. Le jeton est un secret de possession ; sa valeur stockée est hachée. La disponibilité est calculée dans le temps métier central, puis seulement sa représentation est convertie vers le fuseau public du Handler. Les routes publiques ne créent pas de réservation et ne renvoient que des informations de disponibilité, sans identité d’intervenant, élève, matière ou détail de séance.

### Historique, temps réel et push

L’historique est consulté dans le scope opérationnel, ou globalement dans le mode administration Super Admin. Les entrées contiennent une chaîne HMAC avec previous_hash et entry_hash ; l’API de suppression renvoie volontairement une erreur d’immuabilité.

Les flux SSE sont ouverts après authentification et construction du scope. Les notifications sont envoyées avec un Handler et, lorsque utile, un intervenant ciblé. Les abonnements push rechargent également leur portée avant diffusion. Le transfert utilise en plus une fermeture ciblée des flux SSE du Professeur afin de ne pas conserver un flux établi avec une ancienne portée.

## Matrice synthétique des permissions

Légende : « propre » signifie les données de l’intervenant connecté ; « équipe » signifie le Handler propriétaire et ses Professeurs activement rattachés. Tous les accès authentifiés restent conditionnés au compte actif, au changement de mot de passe requis et, pour les mutations, au mode d’écriture.

| Fonction | Professeur | Handler | Super Admin |
| --- | --- | --- | --- |
| Consulter séances, indisponibilités, photos, statistiques et monétisation ordinaires | Propre, dans son rattachement actif | Équipe | Seulement s’il possède aussi une portée opérationnelle ; son rôle seul ne rend pas ces routes globales |
| Créer/modifier ses disponibilités et exceptions | Propre | Équipe | Même règle de portée opérationnelle |
| Créer/modifier des séances | Selon les contrôles intervenant du scope | Équipe | Même règle de portée opérationnelle |
| Proposer une séance | Oui, dans son espace | Oui, dans son équipe | Même règle de portée opérationnelle |
| Accepter, refuser ou administrer les propositions | Non | Oui, équipe | Si Super Admin dispose également de la portée Handler concernée |
| Gérer les Professeurs, leur statut, tarif, couleur, permissions et reset | Non | Oui, équipe | Les attributs globaux prévus sont administrables sous /api/admin ; la route d’équipe reste réservée au Handler propriétaire |
| Traiter les demandes d’inscription Professeur | Non | Oui, seulement ses demandes Professeur | Oui, toutes les demandes dans le routeur administration explicite |
| Modifier plage centrale / fuseau public | Non (lecture de la plage héritée) | Oui, son espace | Seulement via une fonction Administration explicite |
| Générer, activer ou révoquer un lien de calendrier public | Non | Oui, son espace | Seulement s’il est aussi Handler propriétaire |
| Consulter l’historique | Entrées propres dans son rattachement | Historique de son équipe | Global uniquement dans le mode administration explicite |
| Analyses/statistiques et relevés globaux | Non | Non | Oui, uniquement sous /api/admin-analytics |
| Transférer un Professeur entre Handlers | Non | Non | Oui, route administration Super Admin explicite |
| Administration de sécurité, IP, sessions et catalogue global | Non | Non | Oui, sous /api/admin |

Les visiteurs non authentifiés ne peuvent soumettre qu’une demande de compte, demander un reset sans divulgation de compte, suivre un lien d’activation/réinitialisation valide, ou consulter un calendrier public muni de son jeton.

## Contrôles de sécurité observés

- Mots de passe hachés avec bcrypt ; absence de compte ou mot de passe métier embarqué sur une base neuve.
- Session serveur SQLite, cookie HttpOnly, SameSite=Strict, durée définie et régénération de session lors de l’authentification.
- Appareil de confiance fondé sur un selector et un validator haché, avec rotation et vérification de session_version.
- Protection CSRF pour les mutations d’une session connectée, contrôle Origin/Referer et limites de débit générales, de connexion, de demande de compte, de reset et de calendrier public.
- En-têtes CSP, HSTS lorsque la requête est sécurisée, anti-clicjacking, nosniff, politique de permissions et désactivation du cache API.
- Validation des entrées et limites de taille JSON/formulaire dans Express.
- Jetons d’activation, reset et calendrier public conservés sous forme hachée ; révocation/régénération prévue selon le flux.
- Historique chaîné HMAC, lectures scopées, et endpoints de purge historiques désactivés.
- Filtrage de portée pour SSE et push, plus remise à zéro des sessions lors des changements de compte ou de rattachement.

## Vérifications disponibles dans le dépôt

La commande npm test exécute scripts/regression-suite.js. Ce runner crée un répertoire temporaire et attribue des bases SQLite isolées aux tests qui en ont besoin ; il efface les variables de bootstrap héritées, sauf pour le test dédié. À la lecture du runner, dix scénarios sont déclarés :

| Script | Contrôle visé par le script |
| --- | --- |
| scripts/bootstrap-superadmin.test.js | Création contrôlée du premier compte sur base vide sans identifiants embarqués. |
| scripts/realtime-scope.test.js | Filtrage de diffusion temps réel et fermeture ciblée de flux. |
| scripts/push-scope.test.js | Filtrage de portée des notifications push. |
| scripts/account-lifecycle.test.js | Demandes, approbation, activation, reset et protections de jeton. |
| scripts/disponibilite-model.test.js | Règles, exceptions et contraintes de scope de disponibilité. |
| scripts/public-calendar-token.test.js | Jeton de calendrier public, hachage et absence de fuite globale. |
| scripts/workspace-settings.test.js | Fuseau IANA, génération/révocation du lien public, confidentialité du jeton et garde Handler. |
| scripts/multi-handler-isolation.test.js | Cloisonnement entre deux espaces Handler. |
| scripts/professor-transfer.test.js | Transfert Super Admin, rattachements historiques, invalidation de sessions et scopes post-transfert. |
| scripts/admin-analytics.test.js | Séparation entre analyses globales Super Admin et analyses opérationnelles scopées. |

Le dépôt contient aussi npm run test:legacy-smoke, qui reste distinct de la suite de régression multi-utilisateur. Les scripts sont des preuves de couverture intentionnelle ; ils ne remplacent pas la conservation d’un résultat d’exécution vert avant déploiement.

## Risques résiduels et recommandations d’exploitation

1. **Secrets et environnement.** SESSION_SECRET, AUDIT_SECRET, SMTP et les variables de bootstrap doivent être fournis et protégés par l’environnement de production. Une fuite du secret d’audit réduit la valeur probatoire de la chaîne HMAC ; une fuite du secret de session permettrait d’attaquer les sessions.

2. **Lien public comme jeton porteur.** Le lien de calendrier est volontairement partageable. Sa divulgation par un utilisateur, un historique de navigateur, une capture d’écran ou un journal applicatif donne accès à la disponibilité publiée. La régénération et la désactivation limitent ce risque, mais ne remplacent pas une procédure de révocation en cas d’incident.

3. **SQLite et montée en charge.** SQLite convient au déploiement monoprocessus décrit ici, mais les écritures sont sérialisées. Une hausse durable de la concurrence, des fichiers joints ou des connexions SSE doit être précédée de métriques, sauvegardes testées, stratégie de restauration et, si nécessaire, d’une évolution de l’infrastructure de persistance.

4. **Migration d’instances existantes.** Les séances legacy dont l’intervenant est ambigu restent volontairement à réconcilier. Un déploiement doit être répété sur une copie de la base, puis suivi d’une revue de reconciliation_seances_legacy avant de considérer les répartitions par intervenant comme complètes.

5. **Journal d’audit.** L’API interdit sa suppression, mais l’intégrité HMAC dépend de la confidentialité et de la persistance du secret. Pour un besoin réglementaire fort, prévoir un archivage externe, des sauvegardes immuables et une procédure de vérification indépendante.

6. **Couverture à compléter en environnement réel.** Les scripts ciblent les frontières de sécurité principales, mais ils ne remplacent ni tests visuels/accessibilité des vues EJS, ni tests de charge SSE/SQLite, ni revue des flux e-mail réels. Une recette doit exercer séparément un Handler, un Professeur, un Super Admin et un lien public régénéré.

7. **Compte Super Admin.** Le dépôt inspecté ne présente pas de second facteur applicatif. Pour une production exposée, protéger l’accès Super Admin par une politique d’identité complémentaire, un réseau d’administration restreint et une supervision des connexions.

8. **Rétention des données personnelles.** Le code conserve des demandes, sessions, appareils, historique et informations de séance. La durée de conservation, les exports et les procédures de purge doivent être définis par l’exploitant selon son cadre juridique avant mise en production.

## Conclusion d’audit

Le projet a été étendu par couches autour de son socle existant. Les rôles, les rattachements actifs, les scopes serveur, les migrations conservatrices, les jetons hachés et les routes d’administration explicites forment une base cohérente pour isoler plusieurs équipes. La mise en production doit conserver cette discipline : secrets persistants, migration sur copie, exécution de npm test, recette des trois rôles et surveillance des données publiques ou administratives.
