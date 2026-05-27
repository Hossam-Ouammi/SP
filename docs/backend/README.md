# README Backend - Gestion des seances

Ce document explique le backend du projet en lecture humaine. L'idee est de comprendre:

- ce que fait l'application
- comment une requete traverse le backend
- quelles sont les grandes regles metier
- ou se trouve chaque responsabilite dans le code

Pour une lecture beaucoup plus detaillee, voir aussi [REFERENCE.md](./REFERENCE.md).

## 1. Mission du backend

Le backend gere une application collaborative de gestion de seances de cours. Il ne fait pas seulement du CRUD. Il impose aussi des regles metier et de securite:

- authentification par login ou email
- changement obligatoire du mot de passe initial
- session serveur stockee en SQLite
- reconnexion automatique par appareil de confiance
- calendrier de seances partage
- duplication d'une seance existante cote interface pour creer plus vite une nouvelle occurrence
- creneaux d'indisponibilite geres par Hossam
- confidentialite stricte des seances du compte `Hossam`
- historique d'actions chaine par hash
- administration des comptes, sessions, IP bloquees et catalogue
- monetisation avec releves HTML/PDF
- notifications push web
- backup CSV quotidien des seances avec envoi email optionnel
- page publique `/reservation` qui affiche le planning, mais ne cree plus de reservation

## 2. Stack backend

- Runtime: Node.js en CommonJS
- Framework HTTP: Express 5
- Base de donnees: SQLite
- Sessions: `express-session` + store maison SQLite
- Hash mots de passe: `bcryptjs`
- Templates serveur: `ejs`
- Compression: `compression`
- Rate limiting: `express-rate-limit`
- Push web: `web-push`
- Export PDF: `puppeteer`
- Email backup: `nodemailer`

## 3. Carte du backend

Le coeur du backend est distribue comme suit:

- `app.js`: point d'entree, ordre des middlewares, montage des routes, gestion des erreurs, demarrage des planificateurs
- `config/`: constantes de configuration derivees de l'environnement
- `middleware/`: securite HTTP, auth, blocage IP, controle d'acces
- `routes/`: cartographie URL -> controleurs
- `controllers/`: logique HTTP et regles metier
- `models/`: acces base, persistance, migrations, sessions, historique
- `utils/`: services transverses comme SSE, push, backup et fuseaux horaires
- `scripts/`: execution manuelle des jobs et smoke tests

## 4. Bootstrap complet au demarrage

L'ordre de demarrage est important:

1. `app.js` cree l'application Express.
2. Le dossier `database/` est garanti.
3. Les dossiers de stockage legacy sont garantis pour pouvoir supprimer d'anciens fichiers associes.
4. Les headers de securite, le no-cache API, les parseurs JSON/form, puis les sessions sont montes.
5. Le middleware de restauration auto-login peut recreer une session avant toute route.
6. Les controles d'origine et CSRF protegent ensuite les requetes mutantes.
7. Les routes API et la page publique sont montees.
8. `demarrerServeur()` appelle `initialiserBaseDeDonnees()`.
9. La base prend un verrou `sqlite-init`, cree les tables manquantes et applique les migrations legacy.
10. Les planificateurs push et backup sont demarres.
11. Le serveur ecoute enfin sur `PORT` et `HOST`.

## 5. Chemin d'une requete

### 5.1 Requete API authentifiee

Une requete typique vers `/api/seances` traverse:

1. `verifierIpBlocklist`
2. compression HTTP
3. rate limit sur `/api/`
4. headers de securite
5. no-cache pour l'API
6. parsing JSON ou form
7. chargement ou creation de session
8. restauration auto-login si cookie appareil valide
9. verification `Origin` / `Referer`
10. verification CSRF pour les requetes non `GET`
11. middleware d'authentification de la route
12. middleware de securisation du compte
13. middleware de droit ecriture / droit admin / droit monetisation selon le cas
14. controleur
15. notification temps reel + push si la route est enveloppee par `notifierMiseAJourApplication`

### 5.2 Requete publique `/reservation`

La page publique est beaucoup plus simple:

1. pas d'authentification
2. affichage EJS de la page
3. lecture du planning via `/api/reservation-public`
4. conversion des heures du calendrier central vers le fuseau public
5. diffusion SSE publique pour forcer le refresh du planning en lecture seule

Important: `POST /api/reservation-public/reserver` renvoie volontairement `410 Gone`. La creation publique de reservation est desactivee dans l'etat actuel du code.

## 6. Regles metier transverses

### 6.1 Compte prive Hossam

Le mot `Hossam` n'est pas seulement un compte de seance. C'est aussi une regle de confidentialite.

- un utilisateur normal ne peut pas creer, modifier ou supprimer une seance du compte `Hossam`
- si une seance `Hossam` existe, elle est masquee cote API au lieu d'etre exposee telle quelle
- la seance masquee garde son horaire, mais son contenu est remplace par `Indisponible`
- les anciens fichiers associes a une seance `Hossam` restent proteges si la base en contient
- l'historique et la monetisation filtrent egalement ce compte pour les non-admins

### 6.2 Mot de passe temporaire

Les comptes initiaux sont crees avec `123456`, mais le backend les marque comme comptes a securiser:

- `doit_changer_mot_de_passe = 1`
- le compte peut se connecter
- mais les donnees metier restent bloquees tant que le mot de passe n'est pas remplace

### 6.3 Blocage des tentatives de connexion

Le systeme combine deux niveaux:

- blocage en memoire par IP apres trop de tentatives
- blocage persistant par compte via colonnes SQL `echecs_connexion`, `premier_echec_connexion_at`, `bloque_jusqua`

### 6.4 Historique a integrite chainee

Chaque entree d'historique contient:

- un `previous_hash`
- un `entry_hash`

L'historique fonctionne comme une chaine verifiable. Lorsqu'on supprime une entree, le backend rechaine toutes les suivantes.

### 6.5 Fichiers associes legacy

L'upload de fichiers depuis le formulaire de seance est desactive. La description suffit pour les notes de seance.

Le schema et quelques routes de lecture restent presents pour compatibilite avec d'anciennes donnees:

- stockage historique dans `storage/uploads`
- acces legacy via route protegee `/api/photos/:photoId/file`
- aucune route active ne permet d'ajouter de nouveaux fichiers

### 6.6 Monetisation

La monetisation ne depend pas seulement du statut manuel:

- une seance `planifiee` ou `reportee` dont l'heure de fin est passee peut etre traitee comme `faite`
- une seance `est_essai = 1` est gratuite
- le montant depend de la duree reelle et du tarif horaire du compte
- les comptes visibles dependent du profil utilisateur

### 6.7 Push

Deux familles de notifications existent:

- push evenementiels apres action sur les seances ou indisponibilites
- push planifies pour resume de minuit et rappels dans la journee

### 6.8 Backup

Le backup quotidien:

- exporte toutes les seances en CSV
- cree un fichier `backups/seances/seances-backup-YYYY-MM-DD.csv`
- envoie le fichier par email si SMTP est configure
- nettoie les anciens CSV generes par l'application selon `BACKUP_SEANCES_RETENTION_DAYS` (`60` par defaut)
- utilise un verrou disque pour eviter deux executions simultanees

## 7. Schema logique SQLite

Tables principales:

- `utilisateurs`: comptes, droits, etat de securite, tarif horaire, version de session
- `seances`: planning central, statut, duree, createur, dernier modificateur
- `indisponibilites`: blocages de calendrier, parfois jour complet
- `historique_actions`: historique moderne et verifiable
- `historique`: ancienne table legacy encore migree au besoin
- `photos`: anciens fichiers lies aux seances, conserves pour compatibilite
- `catalogue_options`: valeurs autorisees pour `matiere` et `compte`
- `catalogue_options_supprimees`: valeurs retirees du catalogue actif, gardees pour ne pas les recreer depuis les anciennes seances
- `journal_auth`: audit des connexions et actions sensibles
- `sessions`: stockage serveur des sessions Express
- `blocked_ips`: blacklist admin
- `trusted_devices`: auto-login par appareil
- `push_subscriptions`: abonnements push par navigateur

## 8. Routes API

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PATCH /api/auth/password`

### Seances

- `GET /api/seances`
- `GET /api/seances/options`
- `GET /api/seances/:id`
- `POST /api/seances`
- `PUT /api/seances/:id`
- `PATCH /api/seances/:id/statut`
- `DELETE /api/seances/:id`

### Indisponibilites

- `GET /api/indisponibilites`
- `POST /api/indisponibilites`
- `DELETE /api/indisponibilites/:id`

### Historique

- `GET /api/historique`
- `GET /api/historique/:id`
- `DELETE /api/historique/:id`

### Monetisation

- `GET /api/monetisation`
- `GET /api/monetisation/releve`

### Administration

- `GET /api/admin`
- `POST /api/admin/catalogue-items`
- `DELETE /api/admin/catalogue-items/:id`
- `POST /api/admin/catalogue-items/:id/restore`
- `POST /api/admin/users`
- `DELETE /api/admin/users/:id`
- `POST /api/admin/reset-password`
- `PATCH /api/admin/access`
- `PATCH /api/admin/read-only`
- `PATCH /api/admin/today-access`
- `PATCH /api/admin/unavailability-access`
- `PATCH /api/admin/monetisation-access`
- `PATCH /api/admin/hourly-rate`
- `POST /api/admin/sessions/revoke`
- `POST /api/admin/sessions/revoke-user`
- `POST /api/admin/sessions/revoke-sid`
- `POST /api/admin/clear-seances`
- `POST /api/admin/clear-history`
- `GET /api/admin/audit-logins`
- `GET /api/admin/sessions`
- `GET /api/admin/blocked-ips`
- `POST /api/admin/blocked-ips`
- `DELETE /api/admin/blocked-ips/:ip`
- `DELETE /api/admin/trusted-devices/:id`

### Temps reel / push / public

- `GET /api/realtime`
- `GET /api/push/config`
- `POST /api/push/subscribe`
- `POST /api/push/unsubscribe`
- `POST /api/push/test`
- `GET /reservation`
- `GET /api/reservation-public`
- `GET /api/reservation-public/events`
- `POST /api/reservation-public/reserver` -> desactive (`410`)

## 9. Dossiers et responsabilites

### `config/`

Lit l'environnement et fige les constantes runtime:

- securite cookies / sessions
- fuseaux reservation publique
- parametres rappels push
- horaire backup et SMTP

### `middleware/`

Contient les gardiens transverses:

- auth et autorisations
- CSRF et verification origine
- blacklist IP

### `routes/`

Couche tres fine qui assemble:

- middlewares de securite
- controleur cible
- wrappers de notification temps reel

### `controllers/`

Couche metier HTTP:

- valide les inputs
- applique les regles metier
- appelle les models
- prepare les reponses JSON ou fichiers
- journalise les actions

### `models/`

Couche persistance:

- SQL bas niveau
- migrations
- chargement des entites
- store de session
- audit et historique

### `utils/`

Services transverses:

- fuseaux horaires
- notifications push
- SSE
- stockage legacy des anciens fichiers associes
- backup CSV + SMTP

## 10. Fichiers les plus critiques

Si tu veux comprendre vite le backend, lis dans cet ordre:

1. `app.js`
2. `models/db.js`
3. `middleware/auth.middleware.js`
4. `middleware/security.middleware.js`
5. `controllers/seances.controller.js`
6. `controllers/auth.controller.js`
7. `controllers/admin.controller.js`
8. `controllers/monetisation.controller.js`
9. `utils/push-notifications.js`
10. `utils/seances-backup-email.js`

## 11. Scripts utiles

- `npm start`: lance le serveur
- `npm test`: lance `scripts/smoke-test.js`
- `npm run push:due`: execute une passe de rappels push avec verrou anti-chevauchement
- `npm run backup:seances`: force un backup CSV avec nettoyage de retention
- `npm run maintenance:sqlite`: verifie l'integrite SQLite, tronque le WAL si possible et lance `PRAGMA optimize`

Le smoke test verifie notamment:

- login formulaire et API
- changement de mot de passe
- alias `ami@test.com` -> `abdo@test.com`
- droits admin et droits indisponibilites
- confidentialite Hossam
- monetisation et export PDF
- calendrier public en lecture seule
- reset de mot de passe et revocation de sessions

## 12. Zones a noter pendant la maintenance

### Reservation publique partiellement desactivee

Le backend expose encore les routes et la page, mais la reservation effective est coupee. Le code sert aujourd'hui surtout de calendrier public de lecture.

### Catalogue et anciennes seances

La suppression d'une matiere ou d'un compte dans l'admin panel ne modifie pas les seances existantes. La valeur est retiree du catalogue actif et marquee dans `catalogue_options_supprimees`, ce qui empeche `models/db.js` de la recreer automatiquement depuis l'historique ou depuis les valeurs par defaut au prochain demarrage. Hossam peut ensuite restaurer une valeur supprimee depuis le meme panneau catalogue.

### Presence d'un modele `public-reservation-device`

Le fichier `models/public-reservation-device.model.js` existe, mais dans l'etat actuel:

- les routes publiques actives ne l'utilisent pas
- `models/db.js` cree maintenant la table `public_reservation_devices` et la colonne `seances.public_reservation_device_id`
- le backup CSV garde `public_reservation_device_id` pour rester compatible avec une eventuelle reactivation

Autrement dit, cette partie est prete cote schema, mais la fonctionnalite publique active reste en lecture seule.

### Session revocation utilisateur

Le fichier `models/session.model.js` contient une fonction legacy basee sur `LIKE` pour supprimer des sessions par utilisateur. Le flux admin principal utilise plutot `models/admin.model.js`, qui parse les sessions une par une.

## 13. Ou lire la reference exhaustive

La reference longue, fichier par fichier et fonction par fonction, se trouve ici:

- [REFERENCE.md](./REFERENCE.md)
