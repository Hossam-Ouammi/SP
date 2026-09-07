# Contexte IA — Gestion collaborative de séances

## Objectif et périmètre

Application web monoposte/petite équipe, en français, qui centralise le planning de cours. Elle est conçue pour un administrateur métier, **Hossam**, et des collaborateurs. C'est une PWA Express + SQLite : aucune API tierce, aucune architecture SPA/framework côté client.

Le calendrier est la source de vérité. Une séance a un élève, un parent facultatif, une matière, un compte de travail, une date, une plage horaire, un statut, un indicateur d'essai et une description. L'application protège particulièrement les séances du compte `Hossam` : les collaborateurs voient le créneau comme indisponible mais jamais son contenu.

## Architecture d'exécution

```text
Navigateur (EJS + ES modules + FullCalendar)
  -> Express 5 (app.js, middleware global)
  -> routes/* (URL + autorisations + wrapper SSE/push)
  -> controllers/* (validation et règles métier)
  -> models/* (SQL explicite)
  -> SQLite database/database.db

Services transverses : sessions SQLite, audit/historique, SSE, web push,
backup CSV/email, verrous fichiers et export PDF Puppeteer.
```

`app.js` est l'unique point d'entrée. Il crée les dossiers nécessaires, configure les middlewares dans cet ordre : blocage IP, compression (sauf SSE), limites de débit, headers/no-cache, parsing, session SQLite, restauration d'appareil de confiance, origin/CSRF, fichiers statiques, routes, puis pages EJS. Au démarrage il initialise/migre SQLite et démarre les planificateurs push et backup. À l'arrêt SIGINT/SIGTERM, il ferme HTTP puis la base.

## Acteurs et autorisations

| Acteur | Capacités |
| --- | --- |
| Hossam (`est_admin`) | administration complète, indisponibilités, lecture de données Hossam, acceptation/refus de propositions |
| Collaborateur actif | lit calendrier/historique selon filtres, crée/modifie ses séances si non lecture seule, propose une séance dans une indisponibilité |
| Lecture seule | consultation uniquement |
| Compte non sécurisé | connecté, mais toutes les routes métier sont bloquées jusqu'au changement du mot de passe initial |
| Public | consulte seulement le calendrier occupé sur `/reservation` |

Les drapeaux utilisateurs sont `acces_active`, `mode_lecture_seule`, `peut_voir_monetisation`, `peut_voir_aujourdhui`, `peut_voir_indisponibilites`, `est_admin`, `doit_changer_mot_de_passe` et `session_version`.

## Règles métier déterminantes

1. Les créneaux de séances commencent uniquement à `:00` ou `:30`; les durées sont exprimées en minutes (UI : 60/90/120).
2. Une séance annulée ne bloque pas le planning. Toute autre séance qui chevauche une autre séance est refusée.
3. Une indisponibilité ne peut pas chevaucher une séance. Lorsqu'un « jour complet » est demandé, le système crée seulement les fragments libres de la journée pour préserver les séances déjà présentes.
4. Hors Hossam, créer une séance dans une indisponibilité est refusé. Le client convertit ce cas en proposition à traiter par Hossam.
5. Accepter une proposition crée ou déplace la séance dans une transaction immédiate, découpe/supprime le blocage consommé, et marque la proposition acceptée. Refuser ne touche pas le calendrier.
6. Le catalogue contrôle les valeurs de `matiere` et `compte`; supprimer une valeur la retire du choix sans réécrire les anciennes séances. Une table de tombstones empêche sa recréation automatique par migration.
7. Une séance d'essai est gratuite. En monétisation, une séance planifiée/reportée déjà terminée peut être traitée comme faite; le montant est durée réelle × tarif horaire/60.
8. Toute mutation importante crée une entrée d'historique. Ces entrées sont chaînées par `previous_hash`/`entry_hash`; supprimer une entrée oblige à recalculer la suite.

## Confidentialité Hossam

Cette règle est appliquée côté serveur, pas seulement dans l'interface. Les contrôleurs de séances, historique, monétisation, photos et push filtrent/masquent les données Hossam pour les non-administrateurs. Une séance masquée conserve date et heures mais devient « Indisponible ». Un collaborateur ne peut ni créer, modifier ni supprimer une séance de ce compte et ne peut pas proposer le déplacement d'une telle séance.

## API et flux principaux

Toutes les routes mutantes authentifiées requièrent le cookie de session, une origine same-origin et `X-CSRF-Token` obtenu depuis une réponse précédente. Les réponses sont JSON sauf les pages EJS, SSE et le PDF.

| Domaine | Routes | Comportement |
| --- | --- | --- |
| Auth | `/api/auth/login`, `logout`, `me`, `password` | login nom/email, bcrypt, verrouillage IP+compte, mot de passe initial, appareil de confiance |
| Séances | `/api/seances`, `options`, `:id`, `:id/statut` | CRUD, validation, conflits, catalogue, audit; routes mutantes notifiées en temps réel |
| Indisponibilités | `/api/indisponibilites` | lecture pour utilisateurs sécurisés; écriture Hossam uniquement |
| Propositions | `/api/propositions-seances`, `:id`, `:id/accepter`, `:id/refuser` | collaborateur soumet; Hossam édite/décide |
| Historique | `/api/historique`, `/:id` | lecture filtrée; suppression Hossam uniquement |
| Monétisation | `/api/monetisation`, `/releve` | statistiques, filtres et relevé HTML/PDF; accès par droit dédié |
| Administration | `/api/admin/*` | comptes, catalogue, droits, tarifs, sessions, appareils, audit auth, IP, maintenance, effacements; mot de passe Hossam requis pour opérations sensibles |
| Temps réel | `/api/realtime` | SSE authentifié; le client recharge les données sur un événement |
| Push | `/api/push/config|subscribe|unsubscribe|test` | VAPID, abonnement par navigateur, notifications d'événement et rappels planifiés |
| Public | `/reservation`, `/api/reservation-public`, `/events` | planning seulement, conversion de fuseau; `POST /reserver` renvoie volontairement 410 |

## Fichiers backend, responsabilité par fichier

### Configuration et middleware

- `config/security.config.js` : nom/durée des cookies de session et appareil reconnu.
- `config/backup.config.js` : activation, horaire/fuseau, rétention et SMTP des backups.
- `config/push.config.js` : paramètres de cadence/rappel push.
- `config/public-reservation.config.js` : fuseaux central/public, plage visible et durée nominale.
- `middleware/security.middleware.js` : CSP/headers, no-cache API, validation Origin/Referer, émission et validation CSRF, normalisation IP.
- `middleware/ip-blocklist.middleware.js` : refuse tôt une IP présente dans `blocked_ips`.
- `middleware/auth.middleware.js` : cookie/session, auto-login selector+validator, chargement utilisateur, gardes authentification/compte sécurisé/admin/Hossam/écriture/monétisation/indisponibilités.

### Contrôleurs

- `auth.controller.js` : normalise le login (dont alias), combine rate limit mémoire IP et verrou SQL de compte; hash bcrypt, rotation de session, cookie appareil optionnel, changement de mot de passe, logout et audit auth.
- `seances.controller.js` : cœur métier. Prépare/valide les champs, calcule fin/durée, contrôle catalogue et conflits, masque Hossam, transforme la réponse client, écrit CRUD + historique. Exporte volontairement ses helpers pour le workflow des propositions.
- `indisponibilites.controller.js` : normalise date/plage, détecte les chevauchements, décompose les jours complets en plages libres, journalise CRUD dans une transaction.
- `propositions-seances.controller.js` : soumission d'une séance obligatoirement dans une indisponibilité, édition Hossam, acceptation atomique (séance + découpage du blocage + statut), refus.
- `historique.controller.js` : liste/détail filtrés selon confidentialité et suppression admin avec rechaînage hash.
- `monetisation.controller.js` : normalisation de période/comptes, calcul des lignes et totaux, rendu d'un relevé HTML et conversion PDF via Puppeteer.
- `admin.controller.js` : contrôles sensibles protégés par reverification bcrypt du mot de passe admin; comptes, catalogue, droits, tarifs, sessions, IP, appareils, nettoyage et SQLite maintenance.
- `photos.controller.js` : lecture protégée des pièces jointes **legacy** uniquement; aucun upload actif.
- `public-reservation.controller.js` : projection sans données privées du calendrier, conversion timezone et SSE public; création publique désactivée.
- `push.controller.js` : expose clé VAPID, persiste/désactive abonnement, envoie test.
- `realtime.controller.js` : ouvre le SSE authentifié.

### Modèles et données

- `db.js` : wrapper promisifié `run/get/all`, transaction `BEGIN IMMEDIATE`, migrations idempotentes, création des tables/index, seed minimal Hossam/Abdo et catalogue. C'est la source de vérité du schéma.
- `utilisateur.model.js`, `seance.model.js`, `indisponibilite.model.js`, `proposition-seance.model.js` : SQL CRUD et recherches de conflits.
- `catalogue.model.js` : catalogue actif/supprimé, tarifs par compte et restauration.
- `historique.model.js` : création/détail/suppression et intégrité cryptographique du journal métier.
- `journal-auth.model.js` : audit des connexions et actions sensibles.
- `admin.model.js` : requêtes d'administration et purges coordonnées.
- `session.store.js` + `session.model.js` : implémentation Express-session persistée dans `sessions`.
- `trusted-device.model.js` : selector public + validator aléatoire haché, rotation et révocation d'appareils.
- `push-subscription.model.js` : abonnement navigateur, activité, dernière utilisation et clé de rappel du jour.
- `ip-blocklist.model.js` : liste IP persistante.
- `photo.model.js`, `public-reservation-device.model.js` : compatibilité historique; ce dernier n'est pas consommé par le parcours public actif.
- `session-secret.js`, `audit-secret.js`, `push-secret.model.js` : secrets chargés depuis variables d'environnement ou fichiers locaux non versionnés.

Tables : `utilisateurs`, `seances`, `indisponibilites`, `propositions_seances`, `historique_actions`, `historique` (legacy), `photos` (legacy), `catalogue_options`, `catalogue_options_supprimees`, `journal_auth`, `sessions`, `blocked_ips`, `trusted_devices`, `push_subscriptions`, `public_reservation_devices`.

### Services et opérations

- `utils/realtime.js` maintient les clients SSE et diffuse une mise à jour; `realtime-route.js` enveloppe les mutations pour diffuser SSE puis push.
- `utils/push-notifications.js` configure VAPID, envoie en concurrence limitée, retire les endpoints morts et calcule résumés minuit/rappels du jour tout en respectant droits et confidentialité.
- `utils/seances-backup-email.js` exporte les séances en CSV, nettoie la rétention et envoie via SMTP; `job-lock.js` empêche deux jobs/processus de s'exécuter simultanément.
- `utils/timezone.js` effectue les conversions explicites des fuseaux pour la vue publique; `security.js` fournit helpers cryptographiques; `screenshot-storage.js` gère des dossiers legacy/audit.
- `scripts/smoke-test.js` est le test E2E HTTP isolé; `run-push-jobs.js`, `run-seances-backup.js`, `maintenance-sqlite.js` sont les exécutions manuelles/cron. `e2e-browser-audit.js` et `scripts/legacy/*` ne sont pas du runtime.

## Front-end

`views/index.ejs` est la page principale rendue serveur : elle contient login, onglets Aujourd'hui/Tableau de bord/Indisponibilités/Stats/Monétisation/Historique/Administration, modales et les éléments DOM ciblés par le JS. `views/reservation.ejs` est une page publique plus petite.

- `public/js/http.js` centralise `fetch`, credentials same-origin, JSON, capture/renvoi CSRF et erreurs HTTP.
- `auth.js`, `admin.js`, `seances.js` sont des clients API fins; aucune règle de sécurité ne doit y être considérée comme fiable.
- `calendrier.js` encapsule FullCalendar : plugins, rendu, couleurs/masquage, mobile, plage horaire dynamique et clics/sélections remontés à `ui.js`.
- `ui.js` est le contrôleur d'interface monolithique. Son objet `etat` contient toutes les collections et sélections. Il hydrate les données, rend listes/cartes/modales, valide rapidement les conflits côté navigateur, pilote formulaires CRUD et propositions, navigation, statistiques/monétisation/admin/push et reconnecte le SSE. Le serveur reste l'autorité.
- `push.js` enregistre/actualise le service worker, gère permission, abonnement VAPID et cas Android.
- `public-reservation.js` rend les seuls blocs occupés avec FullCalendar, représente l'heure du fuseau public sur une grille UTC, rafraîchit par polling + SSE; il ne crée aucune réservation.
- `service-worker.js` ne met pas les pages en cache : il gère activation immédiate et affichage/clic des push. `manifest.webmanifest` et `icons/` portent la PWA.

## Sécurité, exploitation et limites

Mesures en place : bcrypt, sessions serveur HttpOnly/SameSite strict, rotation de session, CSRF + Origin, CSP et headers, compression, rate limit général/login/public, blocage IP persistant, verrouillage temporaire de compte, contrôle métier serveur, SSE sans compression, SQL paramétré, transactions et secrets hors Git.

À garder en tête pour une évolution : SQLite convient à une petite instance mais pas à de forts volumes multi-écrivains; `ui.js` est très volumineux et mélange orchestration/rendu; les photos et appareils de réservation publique sont du legacy; le flux public est un calendrier et non un tunnel de réservation; les champs/chaînes françaises apparaissent parfois mal décodés dans une console Windows, ce qui doit être vérifié avant toute réécriture de texte.

## Commandes et configuration

`npm start`, `npm run dev`, `npm test`, `npm run push:due`, `npm run backup:seances`, `npm run maintenance:sqlite`. Déploiement prévu : PM2 + Caddy, Node idéalement sur `127.0.0.1`, `TRUST_PROXY=true` derrière proxy TLS. Paramètres importants : `PORT`, `HOST`, `SESSION_SECRET`, `AUDIT_SECRET`, VAPID, fuseaux `CENTRAL_CALENDAR_TIMEZONE`/`PUBLIC_RESERVATION_TIMEZONE`, SMTP et backup.

## Instruction de travail pour une IA

Avant toute modification, lire `app.js`, `models/db.js`, le contrôleur et la route du domaine concerné, puis la partie de `ui.js` qui appelle l'API. Ne jamais contourner les gardes serveur ni remplacer le masquage Hossam par une règle uniquement front-end. Toute nouvelle mutation doit idéalement : valider serveur, utiliser une transaction lorsque plusieurs écritures sont liées, historiser si métier, puis passer par `notifierMiseAJourApplication` pour SSE/push. Toute évolution de schéma doit être idempotente dans `initialiserBaseDeDonnees` et compatible avec les données existantes.
