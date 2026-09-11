# Déploiement multi-utilisateur

Ce guide décrit l'application telle qu'elle est exécutée aujourd'hui : Express 5 + EJS + SQLite, avec des espaces Handler isolés. Il complète le code, sans introduire de second service ni de seconde base.

## Avant le premier démarrage

1. Installez Node.js et les dépendances avec `npm install`.
2. Choisissez un répertoire persistant pour SQLite. Par défaut, la base est `database/database.db`; `DATABASE_PATH` permet de choisir un autre chemin absolu.
3. Sauvegardez une instance existante avant une mise à jour. Lorsque l'application est arrêtée, conservez la base SQLite et, s'ils existent, ses fichiers WAL/SHM. Conservez aussi `database/.session-secret` et `database/.audit-secret` lorsqu'ils sont utilisés.
4. Configurez le premier administrateur **avant le premier démarrage d'une base vide**. Il n'existe plus de compte ni de mot de passe par défaut.

Exemple PowerShell pour une instance locale neuve :

```powershell
$env:INITIAL_SUPERADMIN_NAME = "Administrateur"
$env:INITIAL_SUPERADMIN_EMAIL = "admin@example.test"
$env:INITIAL_SUPERADMIN_PASSWORD = "Un-secret-long-et-unique"
npm start
```

Les trois variables doivent être présentes pour qu'un premier compte soit créé. Ce compte reçoit les capacités `super_admin`, `handler` et `professeur`, afin de gérer sa propre équipe et l'administration globale. Une base vide sans ces variables reste volontairement sans compte. Après le bootstrap, retirez au minimum le mot de passe de bootstrap de l'environnement : ces variables ne sont pas un mécanisme de rotation de mot de passe.

## Variables de production

Configurez les variables dans le gestionnaire de service, ou copiez
`.env.example` vers `.env` sur le serveur. Le fichier `.env` est chargé au
démarrage et est ignoré par Git ; ne le commitez jamais.

```text
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
TRUST_PROXY=true
DATABASE_PATH=/var/lib/gestion-seances/database.db

# Secrets longs, aléatoires et persistants
SESSION_SECRET=...
AUDIT_SECRET=...

# Première instance seulement
INITIAL_SUPERADMIN_NAME=Administrateur
INITIAL_SUPERADMIN_EMAIL=admin@example.com
INITIAL_SUPERADMIN_PASSWORD=...

# Cycle de vie des comptes et SMTP
ACCOUNT_LIFECYCLE_APP_URL=https://planning.example.com/
ACCOUNT_EMAIL_FROM=no-reply@example.com
ACCOUNT_EMAIL_DRY_RUN=false
ACCOUNT_ACTIVATION_TOKEN_TTL_MINUTES=1440
ACCOUNT_RESET_PASSWORD_TOKEN_TTL_MINUTES=15
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@example.com
SMTP_PASS=...
```

Utilisez l'une des paires cohérentes : `SMTP_PORT=587` avec
`SMTP_SECURE=false` (STARTTLS obligatoire en production), ou `SMTP_PORT=465`
avec `SMTP_SECURE=true` (TLS implicite). Le port doit être numérique ; un
placeholder textuel n'est pas une configuration SMTP valide.

`ACCOUNT_LIFECYCLE_APP_URL` doit être une origine HTTPS explicite en production ; l'application ne la déduit jamais de l'en-tête `Host`. Sans URL valide ou sans SMTP, une approbation est enregistrée mais aucun lien d'activation ou de réinitialisation ne peut être livré. Après correction de la configuration, le réviseur peut renvoyer un lien. La boîte locale `storage/dev-emails/` n'est utilisée que lorsque `ACCOUNT_EMAIL_DRY_RUN=true` est défini explicitement hors production : elle ne simule jamais un email réellement envoyé.

`SESSION_SECRET` et `AUDIT_SECRET` sont recommandés en variables d'environnement. En production, une valeur explicitement fournie doit contenir au moins 32 octets aléatoires et ne peut pas être un placeholder : l'application refuse de démarrer sinon. S'ils ne sont pas définis, l'application crée des fichiers locaux à permissions restreintes dans `database/`; ils doivent alors survivre aux redéploiements.

La rotation de `SESSION_SECRET` invalide les sessions et change les valeurs
dérivées utilisées pour les liens publics stables. La rotation de
`AUDIT_SECRET` rend les nouvelles signatures d'historique incompatibles avec
l'ancienne chaîne sans procédure dédiée. Préparez ces rotations, ne les faites
pas lors d'un déploiement ordinaire.

Réglages opérationnels additionnels déjà pris en charge :

```text
CENTRAL_CALENDAR_TIMEZONE=Africa/Casablanca
CENTRAL_CALENDAR_TIMEZONE_LABEL="heure du Maroc"
PUSH_VAPID_SUBJECT=mailto:admin@example.com
BACKUP_SEANCES_ENABLED=true
BACKUP_SEANCES_TIMEZONE=Africa/Casablanca
BACKUP_SEANCES_DELIVERY_RETENTION_DAYS=180
```

Les destinataires proviennent exclusivement des comptes actifs : chaque rôle
`handler` reçoit son propre espace à 00:00 et chaque rôle `super_admin` reçoit
la vue globale à 00:00 et 12:00. Aucun destinataire global n'est codé en dur.
Le registre `backup_email_deliveries` rend chaque occurrence idempotente.

`BACKUP_SEANCES_*` produit un export CSV des séances, utile comme copie
complémentaire mais insuffisant pour restaurer l'application : il ne contient
ni la base SQLite complète, ni l'historique, les utilisateurs, les rôles, les
photos, les sessions ou les clés. Mettez en place une sauvegarde chiffrée du
fichier SQLite (et WAL/SHM lorsque présents), des fichiers privés et des
secrets, hors de la machine Oracle, puis testez une restauration sur une
instance isolée avant mise en production.

## Sauvegarde complète et restauration

### Reset propre sans suppression de l'ancienne base

Le reset est une bascule vers un **nouveau fichier SQLite**. Il ne vide et ne
supprime jamais la base courante. Arrêtez PM2, choisissez un chemin absolu
inexistant, puis lancez :

```bash
export CLEAN_DATABASE_PATH=/var/lib/gestion-seances/database-clean.db
export CLEAN_DATABASE_ARCHIVE_DIR=/var/lib/gestion-seances/archives
export CLEAN_INSTALL_CONFIRM=ARCHIVE_AND_INITIALIZE
export INITIAL_SUPERADMIN_NAME='Administrateur'
export INITIAL_SUPERADMIN_EMAIL='admin@example.com'
export INITIAL_SUPERADMIN_PASSWORD='mot-de-passe-initial-fort'
npm run reset:clean
```

La commande contrôle la source, produit une archive SQLite cohérente avec un
manifeste SHA-256, initialise la cible avec le schéma canonique et toutes les
migrations, puis vérifie que seul le SuperAdmin bootstrap existe. Elle laisse
`DATABASE_PATH` inchangé : examinez le résultat, puis pointez explicitement le
service vers `CLEAN_DATABASE_PATH`. Ne remplacez jamais la source par la cible.

### Exports email automatiques

- chaque Handler actif reçoit uniquement son espace à 00:00 ;
- chaque SuperAdmin actif reçoit l'export global à 00:00 et 12:00 ;
- les heures utilisent `BACKUP_SEANCES_TIMEZONE`, jamais le fuseau public ;
- les CSV sont créés en mémoire et ne restent pas sur le disque ;
- le registre technique bloque le double envoi d'une occurrence confirmée ;
- un échec SMTP ne modifie aucune donnée métier et reste relançable.

Commandes manuelles : `npm run backup:handlers`, `npm run backup:admin`, ou
`npm run backup:seances` pour les deux.

Le script `npm run backup:seances` reste un export CSV métier complémentaire ;
il ne remplace pas cette procédure. Avant le premier déploiement, exécutez et
consignez au moins une restauration sur une machine ou un répertoire isolé.

1. Définissez un répertoire de sauvegarde chiffré, hors du serveur Oracle, et
   vérifiez l'espace disponible.
2. Arrêtez proprement l'unique processus qui écrit la base :
   `pm2 stop superprof`.
3. Copiez `DATABASE_PATH` et, s'ils existent, les fichiers voisins
   `-wal` et `-shm`. Copiez aussi `storage/uploads/` : les captures liées aux
   séances y sont privées et ne sont pas dans SQLite. N'incluez pas la boîte de
   développement `storage/dev-emails/` dans une sauvegarde opérationnelle.
4. Sauvegardez les secrets de manière chiffrée dans le gestionnaire de secrets.
   Si `SESSION_SECRET`, `AUDIT_SECRET` ou les clés VAPID ne sont pas fournis par
   ce gestionnaire, conservez respectivement `database/.session-secret`,
   `database/.audit-secret` et `database/.push-vapid-keys.json` avec la même
   sauvegarde protégée. Leur perte invalide des sessions, l'audit ou le Push.
5. Calculez un SHA-256 de chaque archive, transférez-la hors de la machine,
   puis relancez l'application avec `pm2 start superprof`.

Pour tester la restauration, ne remplacez jamais l'instance active : créez une
copie de l'application et un répertoire de données neufs, restaurez-y la base,
ses éventuels fichiers WAL/SHM, `storage/uploads/` et les secrets nécessaires,
puis définissez un `DATABASE_PATH` propre à cette copie. Démarrez une seule
instance, vérifiez `GET /health`, `PRAGMA integrity_check`,
`PRAGMA foreign_key_check`, les migrations, un compte, une séance avec son
tarif figé et une photo authentifiée. Documentez la date, le hash de l'archive,
la version du code et le résultat. Sans cette preuve, le plan de reprise n'est
pas validé.

`CENTRAL_CALENDAR_TIMEZONE` est la référence métier commune aux séances,
disponibilités et espaces authentifiés. Le décalage affiché sur un calendrier
public n'est pas une variable globale : chaque Handler choisit `GMT+1`,
`GMT+2`, `GMT+3` ou `GMT+4` dans **Calendrier → Calendrier public**. Il représente strictement
+60, +120, +180 ou +240 minutes ajoutées à l'horloge centrale lors de la réponse
publique, après le calcul de la disponibilité centrale ; ce n'est jamais une
conversion IANA ni un mécanisme DST public.

## Reverse proxy

L'application peut écouter uniquement sur `127.0.0.1`; le proxy termine TLS. Avec Caddy :

```caddyfile
planning.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Activez `TRUST_PROXY=true` seulement lorsque le proxy en amont est réellement maîtrisé. Le cookie de session est alors correctement sécurisé derrière HTTPS.

Sur Oracle Linux, reconstruisez le module SQLite après l'installation si le binaire précompilé n'est pas compatible :

```bash
npm run oracle:rebuild-sqlite
```

`ecosystem.config.js` utilise volontairement un seul processus PM2 en mode
`fork`. Ne passez pas en cluster et ne démarrez pas plusieurs instances qui
écrivent la même base SQLite. Avec `TRUST_PROXY=true`, Node doit rester lié à
`127.0.0.1` et seul le reverse proxy maîtrisé doit pouvoir lui transmettre des
requêtes : une exposition directe ferait confiance à des en-têtes proxy fournis
par un client.

## Migrations et compatibilité des données

`initialiserBaseDeDonnees()` s'exécute au démarrage. Il applique les migrations versionnées, une seule fois, dans des transactions SQLite et mémorise leur exécution dans `schema_migrations`. Ne lancez pas de SQL de migration manuellement et ne modifiez pas une migration déjà livrée : ajoutez une nouvelle migration versionnée.

| Version | Effet conservatif |
| --- | --- |
| `2026090701_multi_handler_foundation` | Ajoute rôles, identifiants publics, statuts de compte, rattachements, scopes `handler_id`/`intervenant_id`, demandes et jetons. Les anciennes données sont rattachées au premier administrateur historique, ou au premier compte si aucun administrateur n'existait. Les séances dont l'intervenant ne peut pas être prouvé sont placées dans `reconciliation_seances_legacy`; elles ne sont pas devinées. |
| `2026090702_availability_rules` | Ajoute les disponibilités récurrentes, ponctuelles et les exceptions, avec des déclencheurs SQLite qui vérifient le rattachement Handler/Professeur. |
| `2026090703_historique_scope_columns` | Ajoute les scopes Handler/intervenant à l'historique sans modifier les champs signés par la chaîne d'intégrité. |
| `2026090704_public_id_format` | Remplace les anciens identifiants générés opaques par des identifiants stables `AD-…`, `HD-…` ou `PR-…`, sans réutiliser les identifiants déjà choisis manuellement. |
| `2026090705_handler_calendar_hours` | Ajoute la plage centrale `calendar_start_time` / `calendar_end_time` par Handler, partagée avec ses Professeurs sans réécrire les séances existantes. |
| `2026090706_availability_midnight` | Préserve la fin civile `00:00` dans les règles de disponibilité et les indisponibilités. |
| `2026090707_public_calendar_timezone` | Ajoute `public_calendar_timezone` séparément et copie de façon conservative l'ancienne valeur IANA publique lorsque nécessaire. |
| `2026090708_repair_public_calendar_timezone` | Corrige la reprise historique qui avait confondu fuseau personnel et choix public, sans écraser un choix UI tracé. |
| `2026090709_historique_hmac_v2_scope` | Versionne la signature audit : les nouvelles entrées HMAC v2 signent aussi `handler_id` et `intervenant_id`; les v1 restent vérifiables. |
| `2026090710_public_calendar_fixed_offset` | Normalise l'ancien stockage IANA vers `GMT` et réserve le workflow public aux offsets fixes `GMT`, `GMT+1`, `GMT+2`. |
| `2026090801_public_calendar_stable_link` | Remplace le renouvellement de lien par une URL publique stable, unique au Handler et stockée sous forme de hash. |
| `2026090802_legacy_suspended_professor_access` | Réconcilie de manière conservative les accès de Professeurs suspendus issus des données historiques. |
| `2026090803_trusted_device_expiration` | Ajoute l'expiration et la révocation atomique des appareils de confiance. |
| `2026090901_handler_subject_tariffs` | Ajoute les matières d'un Handler, les tarifs versionnés par matière/réalisateur et le snapshot de tarif sur les séances. |
| `2026090902_normalize_handler_subject_keys` | Normalise les clés Unicode des matières sans fusionner silencieusement deux historiques tarifaires distincts. |

Avant un déploiement sur une base existante, répétez la migration sur une copie de cette base, démarrez l'application et consultez les entrées éventuelles de `reconciliation_seances_legacy`. La migration ne supprime pas les séances, l'historique ou les comptes existants.

## Modèle d'accès

| Capacité | Portée effective |
| --- | --- |
| `professeur` | Ses propres séances, indisponibilités, statistiques, monétisation et historique dans son rattachement actif. |
| `handler` | Son équipe : lui-même comme intervenant et les Professeurs qui lui sont activement rattachés. Il gère l'équipe, les matières/tarifs par matière, les séances et les réglages de son espace. |
| `super_admin` | Fonctions globales uniquement sous `/api/admin` et `/api/admin-analytics`. Un compte qui est aussi Handler reste limité à son équipe sur les routes Handler ordinaires. |

Un Professeur ne peut avoir qu'un rattachement actif à la fois, grâce à une contrainte SQLite. Les contrôleurs appliquent le scope dans les requêtes serveur; une URL ou un corps JSON falsifié pour viser une autre équipe aboutit à une ressource introuvable ou refusée. Les mises à jour temps réel et les push emploient la même portée.

## Cycle de vie des comptes

- Une personne dépose une demande publique de type Handler ou Professeur. Pour un Professeur, seul l'identifiant public du Handler est exposé.
- Le Handler traite seulement les demandes Professeur de son équipe. Les demandes Handler sont traitées dans l'espace Super Admin.
- L'approbation crée un compte inactif, un rôle et, si nécessaire, son rattachement. Aucun mot de passe temporaire n'est communiqué.
- Le lien d'activation ou de réinitialisation contient un jeton aléatoire dans le fragment d'URL. Seul son SHA-256 est conservé; le jeton expire, est à usage unique et le précédent est révoqué lors d'un renvoi.
- L'activation, la réinitialisation et la suspension invalident les sessions/appareils concernés via la version de session.

Les routes du cycle de vie sont documentées dans [le contrat dédié](account-lifecycle-contract.md).

## Surface publique

Le planning public n'est jamais global :

```text
GET /reservation/:token
GET /api/reservation-public/:token
GET /api/reservation-public/:token/events
```

Les anciennes routes sans jeton renvoient `404`. Le calendrier public n'expose que les créneaux collectivement indisponibles ; les créneaux disponibles restent vides. Il ne divulgue ni intervenant, ni élève, ni matière, ni détail de séance et ne crée pas de réservation.

Le Handler enregistre le lien depuis **Calendrier → Calendrier public**. Il
règle à cet endroit un décalage fixe de l'horloge centrale affiché aux clients ;
ce réglage ne convertit jamais les séances, indisponibilités ou tableaux de
bord authentifiés, ni ne réalise de conversion IANA. L'URL est unique et
stable pour le Handler, et seul son hash SHA-256 est conservé. La désactivation
rend le lien introuvable sans le remplacer. Conservez donc le lien partagé dans
un canal adapté et désactivez-le en cas de doute.

## Contrôles de sécurité conservés

- mots de passe hachés avec bcrypt et politique de mot de passe à l'activation/réinitialisation ;
- sessions serveur SQLite, cookies `HttpOnly` et `SameSite=Strict`, appareils de confiance révocables ;
- contrôles Origin/Referer et CSRF sur les mutations authentifiées ;
- CSP, en-têtes de sécurité, absence de cache API et limites de débit ;
- blocage IP et journal d'authentification ;
- historique immuable avec chaîne d'intégrité ;
- permissions, lecture seule et statut de compte vérifiés côté serveur ;
- accès aux photos, statistiques, monétisation, indisponibilités, SSE et push restreints au même scope Handler/intervenant.

## Démarrer, vérifier et maintenir

```bash
npm start
npm test
npm run maintenance:sqlite
npm run backup:seances
```

`GET /health` répond `{"status":"ok"}` après l'initialisation de la base. `npm test` utilise des bases temporaires séparées : il ne réutilise pas `DATABASE_PATH` et ne doit pas modifier une base de développement ou de production.

La suite de régression couvre le cycle de vie des comptes, les disponibilités, l'isolation entre deux Handlers, le calendrier public à jeton et ses réglages, les transferts de Professeur, les analyses globales Super Admin, la diffusion SSE et le filtrage push. Lancez-la avant chaque déploiement, puis vérifiez dans l'interface un compte Handler, un compte Professeur et l'espace Super Admin.
