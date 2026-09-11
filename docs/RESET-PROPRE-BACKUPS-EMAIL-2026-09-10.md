# Reset propre et sauvegardes email — 10 septembre 2026

## A. Ce qui existait avant

Le job produisait un CSV global sur disque, l'envoyait à une adresse fixe de
configuration et le nettoyait plus tard. Il ne séparait pas les espaces Handler
et ne possédait pas d'idempotence persistante. La création d'une base neuve
existait, mais aucune commande encadrée n'archivait l'ancienne base avant la
bascule.

## B. Ce qui a été modifié

- exports Handler et Admin distincts, filtrés en SQL ;
- destinataires issus des comptes actifs et de leurs rôles ;
- CSV à colonnes autorisées, générés uniquement en mémoire ;
- planification Handler quotidienne et Admin biquotidienne ;
- registre SQLite anti-doublon et reprise après échec ;
- commandes manuelles dédiées ;
- reset vers un fichier neuf avec archive SQLite et manifeste SHA-256 ;
- retrait de fonctions runtime objectivement inutilisées.

## C. Comment la nouvelle DB propre est initialisée

`npm run reset:clean` exige une confirmation explicite, un chemin cible absolu
inexistant, le bootstrap SuperAdmin et deux secrets forts distincts. La source
est contrôlée puis archivée avec l'API de backup SQLite. La cible temporaire est
créée par l'initialisation canonique de `models/db.js`, toutes les migrations
sont appliquées et son intégrité est vérifiée avant renommage atomique. La
source reste à sa place et `DATABASE_PATH` n'est jamais changé automatiquement.

La nouvelle base contient seulement le SuperAdmin bootstrap, avec les rôles
`super_admin`, `handler` et `professeur`. Les séances, historiques, sessions,
appareils, tokens et journaux sont vides. `lost_and_found` n'existe pas ; les
tables de compatibilité nécessaires au schéma peuvent exister mais restent vides.

## D. Ce qui est sauvegardé par email

Date, début, fin, durée, statut, élève, parent, matière, titre, réalisateur et
son identifiant public, essai, prix, paiement et tarif horaire figé. L'export
global ajoute le Handler et son identifiant public.

## E. Ce qui n'est volontairement jamais envoyé par email

Identifiants SQLite, descriptions libres, mots de passe ou hash, sessions,
cookies, tokens, secrets, validateurs d'appareils, clés VAPID, données Push,
journaux de sécurité et données d'autres espaces dans un export Handler.

## F. Comment fonctionne le backup Handler

À 00:00 dans `BACKUP_SEANCES_TIMEZONE`, les comptes actifs ayant le rôle
Handler et un email valide sont recherchés. Pour chacun, la requête porte
directement `WHERE seances.handler_id = ?`. Un CSV propre est joint à un email
envoyé à l'adresse du compte. Un compte suspendu/révoqué est exclu.

## G. Comment fonctionne le backup Admin

À 00:00 et 12:00, les séances de tous les espaces sont exportées avec leur
Handler. Chaque SuperAdmin actif ayant un email valide reçoit la même vue
globale. Aucun destinataire personnel n'est codé en dur.

## H. Comment sont déclenchés les jobs

Le planificateur démarré par `app.js` calcule le prochain minuit ou midi dans le
fuseau opérationnel. Le fuseau public n'intervient jamais. Les commandes
manuelles sont `npm run backup:handlers`, `npm run backup:admin` et
`npm run backup:seances`.

Flux Handler :

`scheduler → comptes Handler actifs → SELECT scoppé → projection autorisée → CSV en mémoire → Nodemailer → pièce jointe → registre sent/failed → nettoyage du registre`

Flux Admin :

`scheduler 00:00/12:00 → SuperAdmins actifs + SELECT global → CSV global en mémoire → Nodemailer → registre sent/failed`

Fichiers : `utils/seances-backup-email.js`, `models/backup-email.model.js`,
`config/backup.config.js`, `utils/job-lock.js`, migration
`2026091001-backup-email-deliveries.js` et scripts `run-*-backup.js`.

## I. Comment les doublons sont empêchés

Un verrou de job empêche le chevauchement local. En plus, une contrainte unique
porte sur type, scope, destinataire et occurrence. Un envoi `sent` est définitif
pour ce créneau ; un état `failed` est relançable, et un état `sending` devenu
ancien peut être repris après expiration du verrou logique.

## J. Tests exécutés

- reset sur SQLite temporaire : source, archive, hash, cible propre ;
- base inexistante, migrations et bootstrap ;
- isolation Handler A/B et exclusion d'un compte suspendu ;
- export Admin global ;
- absence de champs interdits et neutralisation des formules CSV ;
- SMTP indisponible, reprise et immutabilité des séances ;
- simulation midi/minuit et anti-doublon ;
- suite complète `npm test` et recette navigateur existante.

## K. Résultats

Au 10 septembre 2026, la suite de régression passe avec **33/33 tests**. La
recette Chromium passe également sur une base E2E créée depuis zéro : bootstrap,
login, rôles, création de séance par clic/glisser, navigation, isolation,
statistiques, monétisation, PDF, Push simulé et responsive mobile.
`npm audit --omit=dev` signale 0 vulnérabilité connue sur 171 dépendances de
production. Les contrôles syntaxiques et `git diff --check` ne signalent aucune
erreur (seulement les avertissements de conversion LF/CRLF du poste Windows).

## L. Risques restants

La bascule réelle n'a volontairement pas été lancée depuis ce workspace : le
chemin de la nouvelle base et les secrets de production doivent être choisis
sur le serveur. La réception SMTP réelle, le stockage externe de l'archive et
une restauration serveur complète doivent encore être prouvés sur Oracle.
Le CSV email reste une copie métier et non une restauration complète.

## M. Ce qui doit être configuré sur le serveur

Configurer `DATABASE_PATH`, les trois `INITIAL_SUPERADMIN_*` pour le premier
démarrage uniquement, `SESSION_SECRET`, `AUDIT_SECRET`, SMTP,
`BACKUP_SEANCES_ENABLED=true`, `BACKUP_SEANCES_TIMEZONE` et l'expéditeur.
Pour la bascule, fournir temporairement `CLEAN_DATABASE_PATH`,
`CLEAN_DATABASE_ARCHIVE_DIR` et
`CLEAN_INSTALL_CONFIRM=ARCHIVE_AND_INITIALIZE`. Après contrôle, pointer le
service vers la nouvelle base, retirer le mot de passe bootstrap et conserver
l'archive hors runtime dans un stockage chiffré.
