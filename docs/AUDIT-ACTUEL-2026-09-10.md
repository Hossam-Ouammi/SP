# Audit actuel du dépôt — 10 septembre 2026

Ce document décrit uniquement l'état reconstruit depuis le dépôt et la base locale examinés le 10 septembre 2026. Les anciens prompts et rapports ne sont pas utilisés comme spécification. Les corrections réalisées pendant cet audit sont incluses dans l'état décrit ci-dessous.

Niveaux : **P0** critique, **P1** à corriger avant production, **P2** important mais non bloquant immédiatement, **P3** amélioration.

## 1. Architecture réelle actuelle

Application web monolithique Node.js/Express en CommonJS, rendue avec EJS et une interface JavaScript modulaire sans framework. SQLite est la source de données. FullCalendar rend les calendriers ; Puppeteer génère les relevés PDF ; Nodemailer gère les emails ; SSE et Web Push apportent le temps réel.

```text
Navigateur EJS
  → modules public/js (ui, calendrier, seances, equipe, push, ...)
  → fetch / EventSource
  → routes Express
  → auth + scope + provenance/CSRF + rate limits
  → controllers
  → models SQLite / transactions
  → historique HMAC, SSE ciblé, Push ciblé, email/PDF selon le cas
  → JSON / HTML / PDF vers le navigateur
```

Les chaînes majeures sont les suivantes :

| Fonction | UI / JS | Route | Contrôles | Stockage / effets |
| --- | --- | --- | --- | --- |
| Authentification et appareils | login-lifecycle.js, ui.js | `/api/auth`, `/api/account-lifecycle` | session, rate limits, provenance | utilisateurs, sessions, trusted_devices, tokens_compte, journal_auth, email |
| Planning | calendrier.js, seances.js, ui.js | `/api/seances`, `/api/dashboard` | rôle, rattachement, créneau, indisponibilité | seances, indisponibilites, historique, SSE, Push |
| Équipe et tarifs | equipe.js, ui.js | `/api/equipe` | Handler/SuperAdmin, scope Handler | utilisateurs, rattachements_professeurs, matieres_handler, tarifs_realisateur_matiere |
| Statistiques / monétisation | ui.js | `/api/statistiques`, `/api/monetisation` | période, scope, sélection autorisée | seances avec tarif figé ; PDF Puppeteer |
| Calendrier public | reservation.ejs, public-reservation.js | `/reservation`, `/api/reservation-public`, settings | jeton Handler, lecture publique limitée | public_id dérivé, réglages d'espace, indisponibilités |
| Admin | admin.js, ui.js | `/api/admin`, `/api/admin-analytics` | SuperAdmin | utilisateurs, rôles, rattachements, audit |
| Temps réel | ui.js, push.js, SW | `/api/realtime`, `/api/push` | session, scope destinataire, endpoint Push validé | push_subscriptions, SSE |

Les routeurs réellement montés dans `app.js` sont : auth, account lifecycle, admin, analytics admin, dashboard, historique, disponibilités legacy, équipe, indisponibilités, monétisation, push, realtime, réservation publique, propositions legacy, statistiques, settings, séances et photos. La page `/reservation` est publique ; le reste est protégé selon le routeur.

## 2. Fonctionnalités réellement présentes

- Connexion, affichage/masquage du mot de passe, sessions, déconnexion et appareils de confiance expirables.
- Demande de création de compte, activation et réinitialisation de mot de passe par jeton haché, unique et expirant.
- Rôles SuperAdmin, Handler et Professeur avec rattachements et scopes serveur.
- Calendrier central Handler et calendrier personnel Professeur ; création, modification, annulation, consultation et historique des séances.
- Gestion des indisponibilités personnelles des Professeurs. Un Handler visualise la disponibilité collective mais ne peut pas déclarer d'indisponibilité.
- Calendrier public stable propre à chaque Handler, conversion de fuseau configurée, avec seulement les créneaux indisponibles exposés.
- Équipe : rattachement, transfert et gestion des matières et tarifs versionnés par matière/réalisateur.
- Statistiques et monétisation à la demande par période ou globalement, sélection de réalisateurs autorisés et relevé PDF.
- Historique d'audit HMAC, SSE, Push, photos, administration et export CSV de séances.
- PWA/service worker avec mécanisme de récupération après déploiement.

## 3. Fonctionnalités supprimées détectées

Les éléments suivants ne font plus partie de l'interface courante et ne sont pas recréés :

- Vue UI de « disponibilités positives » ; les fichiers `public/js/availability-overview.js` et `public/js/disponibilites.js` sont supprimés.
- Workflow client de propositions de séances sur indisponibilité : appels, état, rendu calendrier, styles et notifications sont retirés du frontend.
- Formulaires administrateur génériques de création/suppression de comptes, réinitialisation directe, suppression globale des séances/de l'historique et tarif unique global. L'UI actuelle utilise les flux d'équipe et de cycle de compte.
- Libellés et contrôles qui contredisaient les tarifs versionnés par matière.

Le backend/table legacy correspondant n'est pas supprimé aveuglément : il reste une compatibilité/API historique sous accès contrôlé, détaillée dans les sections 4 et 8.

## 4. Backend orphelin détecté

| Élément | État constaté | Classification | Décision |
| --- | --- | --- | --- |
| `/api/disponibilites`, controller/model et tables de disponibilités positives | aucune UI courante ; certaines migrations et compatibilités historiques y font encore référence | 🟠 legacy métier | conserver temporairement, décision Q1 requise |
| `/api/propositions-seances`, controller/model/table | interface retirée ; création Professor répond 410 et actions Handler refusées ; lecture historique limitée | 🟠 legacy métier | conserver temporairement, décision Q1 requise |
| `/api/settings/public-calendar/regenerate` | aucune action UI actuelle ; le lien public est désormais stable et ne tourne plus | 🟡 compatibilité | conserver sans publicité jusqu'à décision/documentation API |
| anciennes options catalogue | utilisées par des migrations/fallback de données | 🟡 legacy technique | ne pas supprimer avant migration des données réelles |
| scheduler backup | monté via PM2 mais n'exporte que les séances CSV | 🟠 capacité partielle | remplacer/compléter par un vrai plan de restauration |

Aucun controller sans route valide, route vers module manquant, ni événement frontend actif sans endpoint n'a été trouvé après nettoyage.

## 5. Frontend orphelin détecté

Après suppression du flux de propositions et des formulaires admin legacy, les contrats vérifiés ne trouvent plus de :

- listener lié à un identifiant DOM inexistant ;
- fetch actif vers `/api/propositions-seances` ;
- filtres de l'ancien calendrier à deux modes ;
- styles `proposal-*` ou `availability-overview` sans composant ;
- formulaire admin caché mais encore manipulé par JavaScript.

Le test `frontend-api-contract.test.js` et le test de bootstrap UI contrôlent explicitement ces absences. Les modules calendrier, séance, équipe, monétisation, push, login lifecycle et service-worker ont tous une vue ou un appel réel.

## 6. Code/DB/tests/documentation legacy

| Élément | État | Action |
| --- | --- | --- |
| `docs/AI_CONTEXT.md`, anciens rapports/audits/changelog | décrivent Hossam, propositions et règles qui ne reflètent plus le runtime | à étiqueter archives datées, non normatives |
| `docs/backend/README.md` et `REFERENCE.md` | mentionnent comptes/mots de passe et gardes supprimés | à corriger ou marquer archive avant diffusion |
| `docs/RAPPORT-TECHNIQUE-COMPLET.md` | référence un fichier supprimé | archive, ne pas utiliser comme guide |
| `database/lost_and_found` | 309 lignes inattendues dans la DB locale | P1 : analyser avant toute purge |
| tables de disponibilité/propositions | anciennes fonctions conservées | décision métier Q1 avant suppression |
| `.env.example` | complet mais encore non suivi dans Git | l'ajouter volontairement au prochain commit |
| artefacts E2E dans `database/e2e-browser-artifacts` | exemples de test, non nécessaires au runtime | à sortir des commits de production ou documenter |

## 7. Contradictions détectées

| Zone | Constat | Gravité | Traitement |
| --- | --- | --- | --- |
| Code source / DB locale | le code contient les migrations `2026090901` et `2026090902` ; la DB locale examinée s'arrête à `2026090803` | P1 | migrer une copie, valider, puis déployer la migration |
| UI actuelle / APIs legacy | l'interface a retiré les disponibilités positives et propositions ; les routes/tables existent encore | P2, métier | question Q1, pas de suppression arbitraire |
| Documentation / code | plusieurs documents décrivent des workflows supprimés | P2 | README et guide de déploiement mis à jour ; archives à étiqueter |
| Backup annoncé / restauration possible | seul un CSV de séances est produit ; aucune restauration complète testée | P1 | mettre un vrai backup SQLite + fichiers + runbook |
| Email configuré / email délivrable | SMTP est renseigné mais le serveur ne résout pas via DNS dans l'environnement contrôlé | P1 | corriger réseau/DNS/SMTP puis tester un envoi réel |
| lien « régénérer » / lien stable | route compatibilité encore présente alors que le produit veut un lien stable | P2 | conserver temporairement ou retirer sous Q1 |

Les corrections techniques claires ont été faites. La seule contradiction qui demande une décision produit est présentée dans la section suivante.

## 8. Questions métier nécessitant ma réponse

| ID | Fonctionnalité | Version A | Version B | Recommandation | Risque si mauvais choix |
| --- | --- | --- | --- | --- | --- |
| Q1 | APIs legacy de disponibilités positives/propositions | les retirer progressivement : réponse 410 après période de compatibilité, export des données puis suppression route/controller/model/tables | les conserver comme API externe documentée, avec contrat, écran ou consommateurs identifiés | **A**, car l'UI, les tests récents et les gardes indiquent que le workflow est retiré | A pourrait casser un consommateur externe non identifié ; B conserve dette et surface d'attaque inutile |

**Question : Veux-tu conserver A ou B ?**

## 9. Bugs fonctionnels

### Corrigés

- Les formulaires et appels frontend de propositions supprimées pouvaient encore produire des parcours incohérents. Ils sont retirés et une indisponibilité devient une erreur claire.
- Les anciens formulaires admin cachaient des fonctionnalités qui n'avaient plus de workflow courant. Ils sont retirés.
- Un conflit de concurrence lors de la suppression d'historique a été protégé par transaction `BEGIN IMMEDIATE` et un test concurrent.
- La normalisation Unicode des matières Handler peut maintenant éviter des doublons techniques ou collisions de clé.
- La vérification E2E du dashboard correspond désormais au calendrier unifié réel ; l'assertion monétisation lit le bon objet `monetisation.periode`.
- Le E2E ne touche plus la base du dépôt : il utilise une base et des artefacts temporaires.

### Restants

- L'envoi réel d'email échoue tant que le DNS/SMTP de l'hébergeur n'est pas réparé.
- La DB locale/serveur doit recevoir les migrations récentes avant d'utiliser les tarifs par matière en production.
- Les 309 enregistrements `lost_and_found` doivent être expliqués avant une opération de maintenance de la base.

## 10. Audit sécurité

### Résultat

Aucun P0 confirmé après la seconde passe. Les protections importantes suivantes sont présentes et ont été testées :

- mots de passe bcrypt avec limite de longueur ;
- jetons activation/reset hachés, usage unique, expiration contrôlée ;
- sessions et appareils de confiance expirables côté serveur ;
- contrôle d'accès horizontal/vertical par rôle, Handler et rattachement ;
- validations côté serveur et listes blanches sur les mutations examinées ;
- vérification de provenance Origin/Referer pour mutations navigateur, avec cas Fetch Metadata ;
- rate limits pour auth et endpoints sensibles ;
- historique HMAC et test de concurrence ;
- SSE et Push scoppés au destinataire ;
- endpoint Push HTTPS uniquement, rejet des IP locales/privées/réservées, URL avec identifiants et résolution DNS sûre avant envoi : réduction du risque SSRF ;
- SMTP de production avec `requireTLS` même lorsque `SMTP_SECURE=false`.

### Routes sensibles auditéees

| Groupe de routes | Accès | Méthodes sensibles | Validation / autorisation | Risque et résultat |
| --- | --- | --- | --- | --- |
| `/api/auth` | public + session | login/logout/appareils | rate limit, session, contrôles de device | ✅ pas d'accès croisé testé |
| `/api/account-lifecycle` | public contrôlé | demande, activation, reset | jeton haché/TTL/usage unique, anti-enumération | ✅ ; SMTP externe reste P1 |
| `/api/seances` | privé | POST/PATCH/DELETE | rôle, scope, dates/heures, propriété | ✅ isolation Handler/Professeur testée |
| `/api/equipe` | Handler/SuperAdmin | rattacher, transférer, tarifs | scope Handler, IDs autorisés, validations | ✅ transfert/isolation testés |
| `/api/indisponibilites` | Professeur | POST/PATCH/DELETE | propriétaire obligatoire ; Handler refusé | ✅ testé |
| `/api/monetisation` et `/api/statistiques` | privé | calcul/PDF | période, sélection de réalisateurs dans scope | ✅ testés API et navigateur |
| `/api/settings` | Handler/SuperAdmin | calendrier public/réglages | scope workspace | ✅ jeton stable/temps public testés |
| `/api/admin` / `admin-analytics` | SuperAdmin | gestion globale | rôle canonique + scope | ✅ testés |
| `/api/push` | privé | abonnement/test | propriétaire, endpoint sécurisé | ✅ scope et SSRF testés |
| `/api/realtime` | privé | EventSource | session et audience ciblée | ✅ scope testé |
| `/api/photos` | privé | upload/lecture | route et scope applicatifs | 🟡 contrôle manuel limité, à revalider avec vrais fichiers |
| `/reservation` / `api/reservation-public` | public | lecture calendrier | jeton stable ; réponse limitée aux indisponibilités | ✅ test fuseau/jeton |

### Risques résiduels

- `TRUST_PROXY=true` n'est sûr que si Node est inaccessible directement depuis Internet derrière le reverse proxy Oracle.
- Les clés VAPID peuvent dépendre du fichier local `database/.push-vapid-keys.json` s'il n'y a pas de variables d'environnement : les sauvegarder chiffrées ou les mettre dans un gestionnaire de secrets.
- La rotation de `SESSION_SECRET` change le dérivé du lien public ; la rotation de `AUDIT_SECRET` nécessite un plan de continuité de vérification HMAC.
- Une livraison de mail réelle n'a pas pu être prouvée à cause du DNS SMTP défaillant.

## 11. Audit base de données

La DB locale lue sans modification est saine : `PRAGMA integrity_check = ok` et `foreign_key_check = 0 violation`.

| Groupe | Tables principales | Usage | État |
| --- | --- | --- | --- |
| Identité | utilisateurs, utilisateur_roles, rattachements_professeurs | comptes, rôles, équipe | ✅ |
| Planning | seances, indisponibilites, photos | calendrier et disponibilité | ✅ |
| Tarification récente | matieres_handler, tarifs_realisateur_matiere | tarifs par matière/version | ✅ dans le source, migration DB requise |
| Auth/sécurité | sessions, trusted_devices, tokens_compte, journal_auth, blocked_ips | session, reset, audit auth | ✅ |
| Audit | historique, historique_actions | journal HMAC | ✅ |
| Public/temps réel | public_reservation_devices, push_subscriptions | calendrier public, Push | ✅ |
| Schéma | schema_migrations | migrations appliquées | 🟠 DB locale en retard |
| Legacy | catalogue_options, catalogue_options_supprimees, disponibilites, exceptions_disponibilites, propositions_seances, reconciliation_seances_legacy | migration/compatibilité | 🟡 / Q1 |
| Forensique | lost_and_found | données à expliquer | 🟠 P1 |

La DB inspectée a 8 pages B-tree racine, dont celles de `sessions` et `trusted_devices` représentent respectivement 3 et 306 pages. La grande table `lost_and_found` contient 309 lignes : elle ne doit pas être supprimée sans origine, sauvegarde et décision documentée.

## 12. Audit migrations

Les migrations source sont ordonnées et chargées jusqu'à :

- `2026090701` à `2026090803` : calendrier public, accès legacy, expiration des appareils ;
- `2026090901-handler-subject-tariffs` : matières et tarifs versionnés par Handler/réalisateur ;
- `2026090902-normalize-handler-subject-keys` : normalisation de clés matières, avec gestion prudente de collisions.

Elles sont ajoutées sans réécrire les anciennes migrations. Les tests couvrent bootstrap DB vide, bootstrap legacy, calendrier, transferts et tarifs.

La DB locale réelle ne contient que les migrations jusqu'à `2026090803`. Procédure obligatoire avant production :

1. arrêter les écritures et sauvegarder une copie SQLite cohérente ;
2. restaurer la copie dans un environnement de préproduction ;
3. démarrer la version source, appliquer `0901` et `0902` ;
4. vérifier `integrity_check`, `foreign_key_check`, comptes, séances et tarifs historiques ;
5. seulement ensuite appliquer sur la base Oracle avec fenêtre de maintenance et rollback par restauration.

## 13. Audit frontend

- Les modules sont reliés via `views/index.ejs`, importés par `ui.js`, et les contrats d'API sont testés.
- Les actions à double soumission désactivent/rétablissent les boutons dans les flux contrôlés.
- Les erreurs API se transforment en messages utilisateur ; les états vides et chargements majeurs ont un rendu.
- Les modales ont reçu une gestion de focus, Escape et cycle Tab.
- Les rendus utilisent principalement `textContent` pour les données utilisateur dans les zones inspectées, réduisant le risque XSS.
- Le calendrier unifié est maintenant la représentation réelle ; les anciennes branches de filtre et propositions ont été retirées.
- L'E2E authentifié a vérifié login, navigation Handler/Professeur, dashboard, statistiques, monétisation, PDF, Push, dimensions desktop/mobile et absence d'erreurs console signalées.

Point à maintenir : `ui.js` reste un module très volumineux. Il fonctionne, mais son découpage par domaine (auth, modales, dashboard, monétisation, historique) est une dette P2 qui faciliterait les futures évolutions.

## 14. Audit design/UX

Inspection visuelle réelle réalisée sur desktop et mobile avec le navigateur automatisé :

- formulaires de monétisation, listes déroulantes, boutons de calcul et relevé PDF sont cohérents ;
- vues Professeur et Handler conservent une hiérarchie de titres, cartes, couleurs et boutons homogène ;
- relevés PDF HTML/Puppeteer présentent une en-tête, période, réalisateurs, totaux et lignes de séances lisibles ;
- les cas vides sont explicités, les actions retirées ne laissent plus de panneau vide ;
- modales et toasts améliorent le retour d'action.

P2 : la navigation mobile se déroule horizontalement ; elle ne provoque pas de débordement du document, mais les derniers items peuvent être moins immédiatement visibles. Une barre de navigation compacte/menu devrait être planifiée.

## 15. Audit responsive/accessibilité

Tests effectués : desktop, largeur mobile et contrôles navigateur. Aucun overflow horizontal du document n'a été observé dans le parcours E2E final.

Points positifs :

- labels présents sur les champs principaux ;
- focus initial/restauration et piège Tab dans les modales ;
- fermeture Escape ;
- boutons désactivés lorsque l'étape de formulaire n'est pas complète ;
- texte et statut accompagnent les couleurs dans les messages importants.

À améliorer (P2/P3) :

- remplacer le scroll horizontal de navigation mobile par un menu compact ;
- faire un audit lecteur d'écran manuel et une mesure de contraste systématique avant lancement ;
- ajouter des tests clavier Playwright/Puppeteer dédiés aux calendriers et sélecteurs multi-valeurs.

## 16. Audit performance

### Backend

- Les scopes Handler/professeur, agrégats de statistiques et monétisation ont des tests d'isolation ; aucune fuite N+1 bloquante n'a été confirmée dans les parcours échantillonnés.
- SQLite exige **un seul processus d'écriture** ; `ecosystem.config.js` utilise une instance fork, choix cohérent.
- PDF Puppeteer et email sont des opérations plus lourdes : la concurrence et les dépendances Chromium doivent être surveillées.
- Le CSV backup n'est pas une stratégie de reprise complète.

### Frontend

- Le calendrier et les appels sont déclenchés à l'ouverture des sections, plutôt qu'en polling général.
- SSE et Push sont scoppés, mais surveiller les connexions longues et les limites `REALTIME_MAX_*`.
- Le gros module `ui.js` est la principale dette de maintenabilité/performance de chargement, non un blocage mesuré.

## 17. Audit versions/dépendances

Environnement testé : Node `v24.18.0` et npm `12.0.1`.

- `npm audit --omit=dev --json` : **0 vulnérabilité** (171 dépendances production, 26 développement, 209 total).
- Les mises à jour disponibles sans saut majeur observées sont : FullCalendar `6.1.20 → 6.1.21`, dotenv `17.3.1 → 17.4.2`, ejs `5.0.1 → 5.0.2`, express-rate-limit `8.5.2 → 8.7.0`, nodemailer `10.0.1 → 10.0.3`.
- Aucune mise à jour massive n'a été faite aveuglément.
- `package.json` ne fixe pas encore `engines.node` : ajouter la version supportée et utiliser `npm ci` au déploiement.

## 18. Audit production/infrastructure

| Domaine | Constat | Niveau |
| --- | --- | --- |
| SMTP | résolution DNS du `SMTP_HOST` configuré échoue (`ENOTFOUND`) ; `ACCOUNT_EMAIL_DRY_RUN=false` | P1 |
| Migrations | serveur/local DB examinée en retard sur `0901/0902` | P1 |
| Sauvegarde | export CSV local de séances, pas de backup/restauration complète testée | P1 |
| DB forensique | `lost_and_found` contient 309 lignes sans justification | P1 |
| PM2 / SQLite | une instance fork et `HOST=127.0.0.1` cohérents ; jamais plusieurs processus/VM sur la même SQLite | P1 opérationnel |
| Proxy | `TRUST_PROXY=true` impose un reverse proxy fiable ; ne pas exposer Node directement | P1 opérationnel |
| HTTPS | requis pour cookies sûrs, Push, PWA et confiance proxy | P1 opérationnel |
| VAPID | clés potentiellement stockées sur disque local | P2 |
| PDF | Chromium/sandbox Oracle à valider sur l'hôte | P2 |
| Santé | `/health` ne teste pas la DB vivante | P2 |
| Logs | pas de secret brut relevé dans les corrections ; centralisation/rétention à définir | P2 |

## 19. Corrections réalisées

- Sécurisation SMTP en production : TLS exigé même avec `SMTP_SECURE=false`.
- Renforcement de provenance des mutations HTTP.
- Protection SSRF Push : protocole HTTPS, rejet de cibles locales/privées/réservées et contrôle DNS/connexion.
- Transactionnalité renforcée pour la suppression d'historique concurrente.
- Migration de normalisation des matières Handler et test de collisions.
- Suppression des fichiers, styles, état, appels API et rendu frontend des disponibilités positives/propositions retirées.
- Suppression de formulaires admin legacy cachés et de leurs listeners.
- Mise à jour du contrat frontend/API et du bootstrap afin d'empêcher la réintroduction de références mortes.
- E2E isolé de la DB de travail ; mise à jour du dashboard unifié et de l'assertion monétisation.
- Documentation de déploiement et exemple d'environnement enrichis : migrations récentes, SMTP/VAPID/backup, proxy/PM2, secrets.
- README relié au présent audit.

## 20. Code supprimé et justification

| Élément supprimé | Ancien rôle | Pourquoi devenu mort | Vérifications avant suppression |
| --- | --- | --- | --- |
| `public/js/availability-overview.js` | vue de disponibilités positives | interface actuelle ne l'importe plus | recherche de références, routes legacy conservées |
| `public/js/disponibilites.js` et styles associés | gestion UI disponibilité positive | remplacée par indisponibilités Professeur et projection dashboard | imports, EJS et tests contrôlés |
| appels/état/rendu `propositions-seances` côté client | proposer une séance pendant indisponibilité | route Professor retourne 410 ; workflow UI retiré | API, calendrier, CSS et contrat frontend inspectés |
| formulaires admin génériques cachés | créer/supprimer/reset/effacer/tarif global | contredisent cycle de compte et tarifs par matière | identifiants DOM, listeners et tests vérifiés |
| branches calendrier de l'ancien filtre | deux vues incompatibles | calendrier unifié est le comportement réellement livré | E2E dashboard adapté |

Aucune table, migration ou route legacy n'a été supprimée sans la décision Q1.

## 21. Tests ajoutés/modifiés

Ajoutés ou renforcés dans l'état audité :

- `push-endpoint-security.test.js` : SSRF Push, DNS privé, protocoles et endpoints non sûrs.
- `smtp-tls-security.test.js` et `account-email-configuration.test.js`.
- `request-provenance-security.test.js`.
- `trusted-device-expiration.test.js` et `password-security.test.js`.
- `transaction-isolation.test.js` et contrôle de concurrence de l'historique.
- `subject-tariffs.test.js`, `handler-availability-policy.test.js`, isolation multi-Handler et transfert Professeur.
- `frontend-api-contract.test.js` et `ui-bootstrap.test.js` après retrait du code UI legacy.
- `e2e-browser-audit.js` : base temporaire, dashboard unifié, monétisation/PDF, Push, responsive.

## 22. Résultats réels des tests

Exécutés le 10 septembre 2026 sur le workspace :

| Vérification | Résultat |
| --- | --- |
| `npm test` | **PASS — 30 tests réussis** |
| sécurité Push ciblée | PASS |
| tests SMTP/TLS/provenance | PASS |
| tests migrations, tarifs, isolation et historique | PASS |
| `node scripts/e2e-browser-audit.js` | **PASS — code de sortie 0** |
| E2E PDF | PASS — trois périodes, téléchargement et signature `%PDF` |
| E2E navigation/rôles/monétisation/Push | PASS |
| syntaxe `ui.js`, `seances.js` et E2E | PASS |
| `git diff --check` | PASS ; seuls avertissements CRLF Git, pas d'erreur d'espaces |
| `npm audit --omit=dev` | PASS — 0 vulnérabilité |

Tests impossibles ici :

- livraison réelle d'un email à une boîte externe, bloquée par `ENOTFOUND` SMTP ;
- restauration complète de production, car aucun runbook/backup complet n'existe ;
- migration de la DB active Oracle, à réaliser dans une fenêtre de maintenance ;
- validation réelle du reverse proxy/HTTPS Oracle et du sandbox Chromium de l'hôte.

## 23. Matrice Frontend/Backend/DB/Permissions/Tests

| Fonctionnalité | Frontend | Backend | DB | Permissions | Tests | État final |
| --- | --- | --- | --- | --- | --- | --- |
| Login / cycle compte | ✅ | ✅ | ✅ | public + session | ✅ | ✅ cohérent |
| Reset mot de passe | ✅ | ✅ | ✅ | token unique | ✅ | 🟡 SMTP P1 |
| Appareils de confiance | ✅ | ✅ | ✅ | propriétaire | ✅ | ✅ cohérent |
| Séances / dashboard | ✅ | ✅ | ✅ | Handler/Professeur scope | ✅ + E2E | ✅ cohérent |
| Indisponibilités Professeur | ✅ | ✅ | ✅ | propriétaire ; Handler refusé | ✅ | ✅ cohérent |
| Équipe / tarifs matière | ✅ | ✅ | 🟡 migration requise | Handler/SuperAdmin scope | ✅ | 🟡 déploiement DB |
| Statistiques | ✅ | ✅ | ✅ | scope | ✅ + E2E | ✅ cohérent |
| Monétisation / PDF | ✅ | ✅ | ✅ | scope | ✅ + E2E | ✅ cohérent |
| Calendrier public | ✅ | ✅ | ✅ | jeton public limité | ✅ | ✅ cohérent |
| SSE / Push | ✅ | ✅ | ✅ | audience/propriétaire | ✅ + E2E | ✅ cohérent |
| Admin | ✅ | ✅ | ✅ | SuperAdmin | ✅ | ✅ cohérent |
| Disponibilités positives legacy | ❌ | 🟡 | 🟡 | contrôlé | legacy | 🟠 Q1 |
| Propositions legacy | ❌ | 🟡 | 🟡 | contrôlé / 410 | legacy | 🟠 Q1 |
| Backup / restauration | ❌ | 🟡 CSV | 🟠 incomplet | exploitation | export seul | 🔴 P1 |

## 24. Problèmes restant ouverts

1. **P1** — SMTP/DNS réel indisponible : aucun email d'activation/reset ne pourra être envoyé jusqu'à correction.
2. **P1** — migrations `0901/0902` non appliquées à la DB examinée.
3. **P1** — aucune sauvegarde complète/restauration testée ; le CSV ne suffit pas.
4. **P1** — 309 lignes `lost_and_found` non expliquées.
5. **P2** — décision Q1 sur les APIs/tables legacy.
6. **P2** — clés VAPID locales, configuration Chromium Oracle, health check DB, version Node non fixée.
7. **P2** — navigation mobile à rendre plus compacte.
8. **P3** — archiver/étiqueter la documentation historique et découper progressivement `ui.js`.

## 25. Conditions bloquant la production

Avant de déclarer le déploiement prêt, il faut exactement :

1. Corriger le DNS/pare-feu/port/identifiants du serveur SMTP, puis envoyer et recevoir un vrai email d'activation et de reset.
2. Faire un backup cohérent de la DB actuelle, appliquer et vérifier `2026090901` et `2026090902` en préproduction puis production.
3. Mettre en place une sauvegarde restaurable complète : SQLite, photos, clés VAPID, variables/secrets requis ; documenter et exécuter au moins une restauration.
4. Examiner, sauvegarder et justifier les 309 lignes de `lost_and_found` avant nettoyage.
5. Confirmer Oracle : HTTPS, reverse proxy seul devant Node, `TRUST_PROXY=true`, une seule instance SQLite et dépendances Chromium PDF.

Ces cinq conditions, et non les améliorations P2/P3, empêchent la production.

## 26. Améliorations non bloquantes

- Décider Q1 puis supprimer proprement ou documenter les APIs legacy.
- Ajouter `engines.node`, déploiement `npm ci` et surveillance de versions patch.
- Rendre `/health` dépendant d'une vérification DB légère.
- Déplacer les clés VAPID vers un gestionnaire de secrets.
- Ajouter une navigation mobile compacte.
- Auditer le contraste et les parcours lecteur d'écran avec un utilisateur.
- Découper `ui.js` par domaines.
- Étiqueter explicitement tous les documents historiques « archive, non normatif ».

## 27. Verdict production

### 🟠 NOT READY YET

Le code source audité est fonctionnel, la régression complète et l'E2E sont verts, et aucun P0 de sécurité confirmé ne reste après corrections. La production reste bloquée par l'infrastructure et les données : SMTP non joignable, migrations non appliquées à la DB examinée, absence de restauration complète validée et contenu `lost_and_found` non expliqué.

