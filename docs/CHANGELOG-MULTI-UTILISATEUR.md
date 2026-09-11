# Changelog — évolution multi-utilisateur

> **Historique des changements — non normatif.** Les lignes ci-dessous ne sont
> pas une spécification de la version actuelle et peuvent décrire des workflows
> retirés. Pour l'état actuel, suivre le code, [l'audit actuel](AUDIT-ACTUEL-2026-09-10.md)
> et le [guide de déploiement](DEPLOIEMENT-MULTI-UTILISATEUR.md).

## 2026-09-07 — rôles, espaces Handler et cycle de vie sécurisé

Cette évolution est intégrée au projet Express/EJS/SQLite existant. Elle remplace les règles d'accès liées à un nom de compte par des rôles et des scopes serveur, sans créer d'application ou de base parallèle.

| Fichier(s) | Modification | Pourquoi | Test / vérification associée |
| --- | --- | --- |
| `models/migrations/2026090701-multi-handler-foundation.js` | Ajout des rôles, identifiants publics, statuts de compte, rattachements, scopes sur les données métier, demandes et jetons. | Faire évoluer les données existantes sans suppression et poser la frontière Handler/Professeur. | Initialisation sur base isolée via les tests de cycle de vie et d'isolation. |
| `models/migrations/2026090702-availability-rules.js` | Ajout des règles de disponibilités récurrentes, ponctuelles et de leurs exceptions, avec contrôles SQLite de scope. | Modéliser les créneaux de travail sans détruire les indisponibilités historiques. | `scripts/disponibilite-model.test.js`. |
| `models/migrations/2026090703-historique-scope-columns.js` | Ajout de `handler_id` et `intervenant_id` à l'historique sans modifier le contenu signé. | Isoler l'audit tout en préservant la chaîne d'intégrité existante. | Test d'isolation multi-Handler. |
| `models/migrations/2026090704-public-id-format.js`, `models/account-lifecycle.model.js` | Identifiants publics stables `AD-…`, `HD-…`, `PR-…`, attribués automatiquement. | Ne plus dépendre du nom ou de l'ID SQLite dans les flux publics. | `scripts/account-lifecycle.test.js`. |
| `models/access-scope.model.js`, `middleware/scope.middleware.js` | Construction des rôles et scopes effectifs, gardes Handler/Super Admin et contrôles Handler/Professeur. | Faire respecter l'isolation par le backend, y compris sur appel API direct. | `scripts/multi-handler-isolation.test.js`. |
| `controllers/*`, `models/*`, `routes/*` des séances, propositions, indisponibilités, photos, statistiques, monétisation et historique | Lecture et mutation filtrées par `handler_id` et, pour un Professeur, par `intervenant_id`. | Empêcher les fuites ou modifications inter-équipe. | `scripts/multi-handler-isolation.test.js`; vérifications syntaxiques ciblées. |
| `controllers/account-lifecycle.controller.js`, `models/account-lifecycle.model.js`, `routes/account-lifecycle.routes.js`, `utils/account-email.js` | Demandes publiques, approbation scoped, activation, reset, renvoi de lien et notification de demande Professeur. | Fournir un onboarding sans mot de passe temporaire ni énumération de comptes. | `scripts/account-lifecycle.test.js`. |
| `controllers/equipe.controller.js`, `models/equipe.model.js`, `routes/equipe.routes.js`, `public/js/equipe.js` | Gestion de l'équipe par le Handler : Professeurs rattachés, statut, tarif, couleur, permissions et envoi de reset. | Donner au Handler les outils de gestion de son équipe, sans accès aux autres équipes. | Couverture d'isolation multi-Handler et contrôle de routes scoped. |
| `controllers/disponibilites.controller.js`, `models/disponibilite.model.js`, `routes/disponibilites.routes.js`, `public/js/disponibilites.js` | API et interface pour disponibilités positives et exceptions. | Permettre au Professeur ou à son Handler de déclarer les créneaux exploitables. | `scripts/disponibilite-model.test.js`. |
| `controllers/public-reservation.controller.js`, `models/public-calendar.model.js`, `routes/public-reservation.routes.js` | Calendrier public par Handler avec jeton haché; suppression des routes publiques globales. | Éviter l'agrégation ou la fuite d'informations entre équipes. | `scripts/public-calendar-token.test.js`. |
| `models/migrations/2026090705-handler-calendar-hours.js`, `models/migrations/2026090707-public-calendar-timezone.js`, `models/workspace-settings.model.js`, `controllers/workspace-settings.controller.js`, `routes/workspace-settings.routes.js`, `public/js/ui.js` | Plage métier centrale distincte du fuseau de représentation publique par Handler; lien public généré, désactivable et régénérable. | Empêcher qu'un changement d'affichage client convertisse les séances, disponibilités ou dashboards authentifiés, sans exposer le jeton brut. | `scripts/calendar-hours-migration.test.js`, `scripts/public-calendar-timezone.test.js`, `scripts/workspace-settings.test.js`. |
| `routes/admin-analytics.routes.js`, `controllers/statistiques.controller.js`, `controllers/monetisation.controller.js`, `public/js/admin-analytics.js` | Surface d'analyses globales explicitement réservée au Super Admin, avec vue Administration séparée. | Préserver le scope Handler sur les routes ordinaires malgré un compte à rôles cumulés. | `scripts/admin-analytics.test.js`; contrôle ESM/EJS ciblé. |
| `models/professeur-transfer.model.js`, `controllers/professeur-transfer.controller.js`, `routes/admin.routes.js` | Transfert atomique Super Admin d'un Professeur entre Handlers, avec rattachement historique, rotation de session et deux traces HMAC. | Réaffecter un Professeur sans réécrire les séances ni ouvrir de fuite d'ancien scope. | `scripts/professor-transfer.test.js`. |
| `controllers/realtime.controller.js`, `utils/realtime.js`, `utils/realtime-route.js`, `utils/push-notifications.js` | Diffusion SSE et notifications push restreintes à la portée pertinente, y compris pour un Super Admin hors de ses routes d'administration explicites. | Éviter qu'un Handler, Professeur ou compte multi-rôle reçoive un événement d'une autre équipe. | `scripts/realtime-scope.test.js`, `scripts/push-scope.test.js`. |
| `controllers/equipe.controller.js`, `controllers/admin.controller.js`, `controllers/auth.controller.js`, `controllers/account-lifecycle.controller.js`, `controllers/workspace-settings.controller.js`, `utils/realtime.js` | Fermeture des flux SSE actifs lorsqu'un scope, une session ou un lien public devient caduc (suspension, transfert, reset/révocation, déconnexion, expiration, désactivation/régénération du calendrier). | La rotation de session ou de jeton seule ne réévalue pas un flux SSE déjà ouvert. | `scripts/realtime-scope.test.js`; tests de transfert et de cycle de vie. |
| `routes/propositions-seances.routes.js` | Ajout de la garde d'écriture sur modification, acceptation et refus de proposition. | Empêcher un Handler en lecture seule de contourner l'interdiction de mutation. | `scripts/multi-handler-isolation.test.js`. |
| `models/db.js` | Bootstrap sans identifiants connus : création optionnelle d'un seul Super Admin par `INITIAL_SUPERADMIN_*`; catalogue neutre. | Éliminer les comptes et mots de passe par défaut, tout en conservant l'initialisation de la base existante. | Tests sur bases neuves temporaires. |
| `routes/admin.routes.js`, `controllers/historique.controller.js` | Séparation explicite de la vue Super Admin ; les flux admin directs de création/suppression/reset par mot de passe sont désactivés. | Empêcher un compte double rôle d'élargir silencieusement son dashboard Handler et supprimer les workflows non sûrs. | Test d'isolation et contrôle des routes `410` legacy. |
| `views/index.ejs`, `public/js/ui.js`, `public/js/auth.js`, `public/js/calendrier.js`, `public/css/style.css` | Formulaires demande/reset, navigation Équipe, visualisation multi-intervenants, réglages et analyses globales. | Adapter l'interface EJS existante au modèle multi-utilisateur sans migration de framework. | Contrôles syntaxiques EJS/ESM et tests API correspondants; recette visuelle à faire au déploiement. |
| `scripts/regression-suite.js`, `package.json` | `npm test` lance une suite isolée de régression; l'ancien smoke test reste hors de la suite d'acceptation. | Éviter qu'une exécution de test ne touche une base locale et couvrir les nouvelles frontières de sécurité. | `npm test` (10 scénarios). |
| `README.md`, `docs/DEPLOIEMENT-MULTI-UTILISATEUR.md`, `docs/account-lifecycle-contract.md`, `docs/AUDIT-TECHNIQUE-MULTI-UTILISATEUR.md` | Documentation de démarrage, déploiement, migration, cycle de vie, audit et tests mise à jour. | Éviter les consignes obsolètes et les anciens identifiants par défaut. | Relecture croisée avec les routes, migrations et scripts existants. |

## Comportements volontairement modifiés

- Une base neuve ne contient plus de compte métier ni de mot de passe connu.
- L'ancien calendrier public global est introuvable; un lien avec jeton Handler est nécessaire.
- La création directe de comptes, la suppression physique de comptes, le reset d'un mot de passe choisi par un administrateur, l'effacement global des séances et l'effacement de l'historique sont désactivés (`410`) au profit des workflows sécurisés.
- Un Super Admin qui est également Handler reste dans son scope Handler sur les routes ordinaires. L'accès global est explicite sous `/api/admin`.
- Le tarif est porté par l'intervenant et instantané sur la séance; un ancien libellé de catalogue n'est plus une identité ni une source de tarif.

## Couverture de régression attendue

```bash
npm test
```

La suite lance, sur des environnements isolés, les contrôles de scope temps réel, push, cycle de vie des comptes, disponibilités, calendrier public à jeton et réglages Handler, transfert, analyses globales et isolation entre deux Handlers. La liste exacte est dans `scripts/regression-suite.js`.

Pour une mise en production, compléter cette suite par une vérification manuelle des trois contextes : Handler, Professeur et Super Admin, ainsi qu'un essai de migration sur une copie de la base réelle.
