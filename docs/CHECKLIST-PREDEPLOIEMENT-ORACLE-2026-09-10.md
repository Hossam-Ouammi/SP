# Checklist de pré-déploiement Oracle — version actuelle — 10 septembre 2026

> Mission de ce document : préparer un déploiement propre sans l'exécuter. Il
> remplace les anciennes procédures comme référence opérationnelle. Aucune
> commande destructive ou de production n'a été lancée pendant sa rédaction.

## 1. Vue d'ensemble retenue

Architecture cible unique :

```text
Navigateur HTTPS
      |
      v
Caddy : ports publics 80/443, certificat automatique
      |
      v
Node/Express : 127.0.0.1:3000, PM2 fork, une seule instance
      |
      v
SQLite propre : /var/lib/gestion-seances/database.db
      + fichiers privés / secrets persistants
```

Le serveur est une VM Oracle Cloud `VM.Standard.A1.Flex`, Oracle Linux 9 ARM64
(`aarch64`), 1 OCPU et 6 Go de RAM, IP publique `84.8.216.203`, utilisateur
SSH `opc`. Node `v22.22.2` et npm `10.9.7` y ont été observés. L'ancienne
application est dans `/home/opc/sp/sp_migration` et son ancienne base dans
`/home/opc/sp/sp_migration/database/database.db`.

Décisions retenues pour éviter les variantes inutiles :

- Node 22 LTS est conservé pour cette mise en ligne. Le verrou actuel exige au
  moins Node 22.12 via Puppeteer et Node 22.22.2 satisfait cette contrainte.
- PM2 reste en mode `fork`, `instances: 1`. Aucun cluster avec SQLite.
- Caddy sera le seul reverse proxy et terminera HTTPS.
- Le port 3000 restera exclusivement sur `127.0.0.1` et ne sera ouvert ni dans
  Oracle Cloud ni dans `firewalld`.
- Une nouvelle base sera créée. L'ancienne base ne sera ni importée, ni vidée,
  ni écrasée : elle sera archivée et conservée hors du runtime.
- Le Chromium ARM64 du système sera utilisé pour les PDF. Le Chrome x86-64
  téléchargé par Puppeteer est incompatible avec cette VM.
- Gmail SMTP sur le port 465 avec TLS implicite sera l'unique configuration
  email proposée, sous réserve que le propriétaire fournisse le compte choisi.
- Les exports CSV par email restent complémentaires. Une sauvegarde complète
  chiffrée de SQLite, des fichiers et des secrets est obligatoire.

## 2. État actuel et verdict

| Contrôle | État | Obligatoire avant GO | Preuve / action restante |
| --- | --- | --- | --- |
| Dépôt actuel analysé | OK | oui | Express/EJS/SQLite, 16 migrations et scripts actuels inspectés. |
| Régressions isolées | OK | oui | `npm test` : 33/33 le 10/09/2026. |
| Base neuve | OK dans les tests | oui | Le test vérifie un seul SuperAdmin, 16 migrations, aucune donnée métier, intégrité `ok`, 0 FK et absence de `lost_and_found`. |
| Node Oracle | OK | oui | `v22.22.2`, supérieur au minimum 22.12 requis par le verrou actuel. |
| Chromium Oracle ARM64 | OK isolément | oui | `/usr/bin/chromium-browser`, paquet aarch64 ; PDF de 8 384 octets produit. |
| Variables PDF persistantes | À faire | oui | Ajouter le chemin Chromium et le réglage sandbox au véritable environnement de service. |
| Version de release identifiable | Bloqué | oui | La VM n'a pas Git et le dossier ancien n'est pas une preuve de version. Créer une archive de release avec SHA-256 depuis le PC. |
| Domaine public | Entrée manquante | oui | Fournir le nom de domaine exact et l'accès à sa zone DNS. |
| DNS vers Oracle | À faire | oui | Créer un enregistrement A vers `84.8.216.203`, puis vérifier la résolution. |
| HTTPS/Caddy | À faire | oui | Installer/configurer Caddy après propagation DNS. |
| Pare-feu OCI + Linux | À vérifier | oui | Public : 80/443 ; SSH 22 limité si possible ; jamais 3000. |
| Secrets session/audit | À générer | oui | Deux valeurs différentes de 48 octets, stables et sauvegardées. |
| SMTP Gmail réel | Entrées manquantes | oui | Fournir l'adresse Gmail et créer un mot de passe d'application dédié. |
| Email activation/reset | Non testé réellement | oui | Réception réelle, destinataire, lien HTTPS, usage unique et expiration. |
| VAPID/Push | À configurer/tester | oui si Push annoncé | Générer une paire stable, sauvegarder, tester sur HTTPS réel. |
| Sauvegarde complète | Non mise en place | oui | Créer sauvegarde SQLite cohérente + fichiers + secrets, chiffrée et hors VM. |
| Restauration complète | Non prouvée | oui | Restaurer dans un répertoire isolé et contrôler intégrité/healthcheck. |
| Tests navigateur Oracle | Non exécutés | oui en préproduction | Ne jamais exécuter l'E2E destructif contre la vraie base de production. |
| Ancienne application | Encore active/à inventorier | oui | Identifier proxy, service PM2 et ports avant bascule ; ne rien supprimer. |

**Verdict actuel : NO-GO.** Le code et le reset propre sont testés, mais les
entrées propriétaire, la release traçable, HTTPS, SMTP, secrets, sauvegarde et
restauration ne sont pas encore validés.

## 3. Informations que le propriétaire doit fournir

Ne publier aucune de ces informations dans Git ou dans une capture publique.

1. Le domaine ou sous-domaine exact à utiliser, par exemple
   `planning.votre-domaine.tld`, et le fournisseur qui gère sa zone DNS.
2. L'adresse Gmail expéditrice retenue. Un compte dédié est préférable à une
   boîte personnelle.
3. Le nom affiché et l'adresse email du premier SuperAdmin.
4. Confirmation que les emails des futurs Handlers et SuperAdmins sont des
   destinataires autorisés à recevoir les exports CSV métier.
5. L'endroit hors VM choisi pour la sauvegarde chiffrée. La cible recommandée
   pour cette VM est un bucket privé Oracle Object Storage, avec une seconde
   copie contrôlée hors de l'instance.
6. L'adresse IP publique habituelle du propriétaire si l'accès SSH 22 doit être
   limité dans OCI à `/32`.

Le mot de passe initial, le mot de passe d'application Gmail, les secrets HMAC
et la clé VAPID privée ne doivent pas être envoyés dans le chat. Ils seront
générés ou saisis directement dans un terminal approprié au moment guidé.

## 4. Inventaire exact de l'environnement de production

Le fichier réel sera chargé par `app.js` depuis `.env` à la racine de la
release. Les commandes CLI du dépôt chargent le même fichier. Les variables
déjà injectées par PM2 ou le système ont priorité sur `.env` ; il faut donc
éviter deux sources contradictoires.

### 4.1 Variables obligatoires persistantes

| Variable | Valeur cible / source | Secret | Conservation et effet |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | non | Stable. Active les contrôles fail-closed. |
| `HOST` | `127.0.0.1` | non | Stable. Interdit l'écoute publique directe de Node. |
| `PORT` | `3000` | non | Stable. Accessible seulement depuis la VM. |
| `TRUST_PROXY` | `true` | non | Seulement avec Caddy maîtrisé devant Node. |
| `DATABASE_PATH` | `/var/lib/gestion-seances/database.db` | sensible | Stable. Doit désigner la nouvelle base après validation, jamais l'ancienne. |
| `SESSION_SECRET` | sortie aléatoire de 48 octets | oui | Sauvegarder chiffré. Une rotation déconnecte les sessions et affecte les dérivations liées aux liens publics. |
| `AUDIT_SECRET` | autre sortie aléatoire de 48 octets | oui | Sauvegarder chiffré. Ne pas faire de rotation sans procédure de continuité de l'historique HMAC. |
| `ACCOUNT_LIFECYCLE_APP_URL` | `https://DOMAINE-EXACT/` | non | Domaine requis. Origine de confiance des liens activation/reset. |
| `ACCOUNT_EMAIL_FROM` | `"Gestion des séances <ADRESSE_GMAIL>"` | non | Gmail doit autoriser cet expéditeur. |
| `ACCOUNT_EMAIL_DRY_RUN` | `false` | non | Obligatoire en production réelle. |
| `ACCOUNT_ACTIVATION_TOKEN_TTL_MINUTES` | `1440` | non | 24 h ; le code borne de 15 min à 7 jours. |
| `ACCOUNT_RESET_PASSWORD_TOKEN_TTL_MINUTES` | `15` | non | Maximum serveur volontaire : 15 minutes. |
| `SMTP_HOST` | `smtp.gmail.com` | non | Configuration Gmail choisie. |
| `SMTP_PORT` | `465` | non | Choix unique retenu avec TLS implicite. |
| `SMTP_SECURE` | `true` | non | Doit rester cohérent avec le port 465. |
| `SMTP_USER` | adresse Gmail complète | sensible | Compte émetteur. |
| `SMTP_PASS` | mot de passe d'application Google à 16 caractères | oui | Jamais le mot de passe principal. Sauvegarder dans le coffre ; régénérer après révocation/changement pertinent. |
| `PUSH_VAPID_SUBJECT` | `mailto:ADRESSE_GMAIL` | non | Contact valide du propriétaire Push. |
| `PUSH_VAPID_PUBLIC_KEY` | sortie publique de `web-push` | non | Stable. Changer la paire impose de réabonner les navigateurs. |
| `PUSH_VAPID_PRIVATE_KEY` | sortie privée correspondante | oui | Stable, sauvegardée chiffrée. |
| `PUSH_ENABLE_IN_MEMORY_REMINDERS` | `true` | non | Acceptable uniquement avec l'unique processus PM2. |
| `PUSH_REMINDER_TIMEZONE` | `Africa/Casablanca` | non | Fuseau des rappels Push. |
| `BACKUP_SEANCES_ENABLED` | `true` | non | Active l'ordonnanceur CSV intégré. |
| `BACKUP_SEANCES_EMAIL_FROM` | même valeur que `ACCOUNT_EMAIL_FROM` | non | Expéditeur des CSV. |
| `BACKUP_SEANCES_TIMEZONE` | `Africa/Casablanca` | non | Handler à 00:00 ; SuperAdmin à 00:00 et 12:00. |
| `BACKUP_SEANCES_DELIVERY_RETENTION_DAYS` | `180` | non | Conservation du registre technique anti-doublon. |
| `BACKUP_SEANCES_EMAIL_DRY_RUN` | `false` | non | Un `true` empêcherait les envois réels. |
| `CENTRAL_CALENDAR_TIMEZONE` | `Africa/Casablanca` | non | Référence métier centrale. |
| `CENTRAL_CALENDAR_TIMEZONE_LABEL` | `heure du Maroc` | non | Libellé affiché. |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/chromium-browser` | non | Obligatoire sur cette VM ARM64 pour éviter le Chrome x86-64 téléchargé. |
| `PUPPETEER_DISABLE_SANDBOX` | `true` initialement | non | Le seul test Oracle concluant utilisait `--no-sandbox`. À réévaluer après un test explicite avec sandbox ; Node ne doit jamais tourner comme root. |
| `PDF_GENERATION_TIMEOUT_MS` | `30000` | non | Délai PDF. |
| `PDF_GENERATION_MAX_CONCURRENT` | `1` | non | Adapté à 1 OCPU ; le code borne à 3. |
| `PDF_GENERATION_QUEUE_LIMIT` | `5` | non | File bornée ; le code borne à 20. |

Génération locale des deux secrets, une commande à la fois, sans les coller
dans un ticket :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Génération de la paire VAPID depuis la release dont les dépendances sont
installées :

```bash
npx web-push generate-vapid-keys
```

### 4.2 Variables uniquement pour le premier bootstrap

| Variable | Usage | Après création réussie |
| --- | --- | --- |
| `INITIAL_SUPERADMIN_NAME` | Nom du seul compte initial. | Retirer de l'environnement. |
| `INITIAL_SUPERADMIN_EMAIL` | Email réel du seul compte initial. | Peut être retiré. |
| `INITIAL_SUPERADMIN_PASSWORD` | Mot de passe initial conforme, 12 caractères minimum et 72 octets bcrypt maximum. | Retirer immédiatement puis changer via l'interface. |

Le compte bootstrap reçoit volontairement les rôles `super_admin`, `handler`
et `professeur`. Aucun compte par défaut n'est embarqué dans le code.

### 4.3 Variables temporaires du reset, jamais permanentes

`CLEAN_DATABASE_PATH`, `CLEAN_DATABASE_ARCHIVE_DIR` et
`CLEAN_INSTALL_CONFIRM=ARCHIVE_AND_INITIALIZE` servent uniquement à
`npm run reset:clean`. `CLEAN_INSTALL_CHILD` est interne au script et ne doit
jamais être défini manuellement.

### 4.4 Variables facultatives qu'il ne faut pas inventer

- `APP_BASE_URL` est seulement un alias de repli ; utiliser
  `ACCOUNT_LIFECYCLE_APP_URL` et ne pas définir les deux.
- `IP` est un ancien repli ; utiliser `HOST`.
- `ACCOUNT_EMAIL_DEV_OUTBOX_DIR`, `SEED_DEMO_DATA` et
  `E2E_BROWSER_AUDIT_DIR` sont réservées au développement/test.
- `PUBLIC_RESERVATION_SLOT_DURATION_MINUTES`,
  `PUBLIC_CALENDAR_TOKEN_BYTES` et `PUBLIC_CALENDAR_REFRESH_INTERVAL_MS` ont
  des défauts sûrs ; ne pas les ajouter sans besoin métier.
- `PUBLIC_RESERVATION_TIMEZONE` n'est lue que par une migration historique ;
  ne pas la définir pour une installation neuve.
- `BACKUP_SEANCES_DISABLED` est un coupe-circuit de compatibilité ; ne pas le
  définir en fonctionnement normal.
- Il n'existe aucune variable `SMTP_FROM` dans le code actuel.

## 5. Création du SMTP Gmail, clic par clic

Cette étape attend l'adresse Gmail exacte du propriétaire.

1. Ouvrir `https://myaccount.google.com/` et se connecter au compte émetteur.
2. Cliquer **Sécurité** dans la colonne gauche.
3. Dans **Comment vous vous connectez à Google**, ouvrir **Validation en deux
   étapes** et l'activer complètement si elle ne l'est pas.
4. Revenir à **Sécurité**, chercher **Mots de passe des applications** ou ouvrir
   directement `https://myaccount.google.com/apppasswords`.
5. Saisir un nom explicite, par exemple `Superprof Oracle production`, puis
   cliquer **Créer**.
6. Copier une seule fois le code de 16 caractères et le saisir directement
   comme `SMTP_PASS`. Ne pas le mettre dans Git, un email ou une capture.
7. Utiliser l'adresse Gmail complète comme `SMTP_USER`, `smtp.gmail.com`, port
   `465`, `SMTP_SECURE=true`.
8. Si l'option n'existe pas, vérifier : validation en deux étapes réellement
   active, compte non limité par une organisation, Advanced Protection non
   activée et configuration non exclusivement fondée sur des clés de sécurité.
9. Après changement du mot de passe principal Google ou révocation du mot de
   passe d'application, créer un nouveau code et mettre à jour la configuration
   avant de redémarrer PM2.

Tests obligatoires : envoi manuel isolé, activation d'un compte réel, reset
réel, vérification du destinataire/objet/lien HTTPS, échec du lien au second
usage et après 15 minutes. Vérifier aussi les spams et les limites d'envoi
Gmail avant d'activer les CSV pour tous les comptes.

## 6. Domaine, DNS, Caddy et HTTPS

Le domaine exact manque encore ; les commandes contenant `DOMAINE-EXACT`
restent donc des gabarits et ne doivent pas être exécutées telles quelles.

### DNS

Chez le fournisseur DNS :

1. Ouvrir la zone du domaine.
2. Ajouter un enregistrement **A**.
3. Nom/Hôte : le sous-domaine choisi, par exemple `planning`.
4. Valeur/Cible : `84.8.216.203`.
5. TTL : valeur par défaut ou 300 secondes pendant la préparation.
6. Ne pas créer d'AAAA tant que la VM n'est pas réellement configurée en IPv6.
7. Vérifier depuis le PC : `Resolve-DnsName DOMAINE-EXACT` ; la réponse A doit
   contenir `84.8.216.203`.

### Oracle Cloud Network

Dans la console OCI : **Networking** → **Virtual cloud networks** →
`vcn-20260517-1521` → sous-réseau de l'instance → **Security Lists** ou le NSG
attaché → **Add Ingress Rules**.

- TCP 80, source `0.0.0.0/0`, pour le challenge et la redirection HTTPS.
- TCP 443, source `0.0.0.0/0`, pour le site.
- TCP 22 : conserver, idéalement avec comme source `IP-PROPRIETAIRE/32` après
  validation d'un accès de secours.
- Ne créer aucune règle 3000.

### Caddy retenu

Avant installation, inventorier sans modifier :

```bash
sudo ss -lntp
sudo systemctl status caddy nginx --no-pager
sudo firewall-cmd --list-all
pm2 status
```

Si aucun proxy à conserver n'est identifié, l'installation Oracle Linux 9
prévue est :

```bash
sudo dnf install -y dnf-plugins-core
sudo dnf copr enable @caddy/caddy
sudo dnf install -y caddy
```

Configuration cible `/etc/caddy/Caddyfile` :

```caddyfile
DOMAINE-EXACT {
    reverse_proxy 127.0.0.1:3000
}
```

Contrôles avant activation :

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
sudo systemctl enable --now caddy
sudo systemctl status caddy --no-pager
curl -fsS https://DOMAINE-EXACT/health
```

Ne jamais passer `TRUST_PROXY=true` avec Node exposé publiquement. Le Push et
le service worker exigent un contexte HTTPS dans les navigateurs normaux.

## 7. Release et dépendances Oracle ARM64

Le dossier ancien n'est pas une release acceptable : Git n'est pas installé
sur la VM, les dates de fichiers montrent une version ancienne et la base y est
historique. La future release doit être transférée dans un nouveau répertoire,
avec au minimum : source actuelle, `package.json`, `package-lock.json`, hash
SHA-256, date et identifiant de commit si le PC en possède un.

Précontrôles prévus sur Oracle :

```bash
uname -m
node --version
npm --version
command -v chromium-browser
rpm -q --qf '%{NAME} %{VERSION}-%{RELEASE} %{ARCH}\n' chromium
```

Résultat attendu : `aarch64`, Node 22.12 ou supérieur dans la ligne 22 LTS,
et Chromium `aarch64` à `/usr/bin/chromium-browser`.

Installation de dépendances dans la nouvelle release :

```bash
export PUPPETEER_SKIP_DOWNLOAD=true
npm ci
npm rebuild sqlite3 --build-from-source
```

Le rebuild SQLite nécessite les outils de compilation et les en-têtes adaptés ;
leur installation sera vérifiée avant la commande. `npm ci` doit utiliser le
`package-lock.json` exact, jamais un `npm install` improvisé en production.

Le test Puppeteer Oracle a prouvé qu'un PDF peut être créé avec Chromium
système et les options `--no-sandbox`, `--disable-setuid-sandbox` et
`--disable-dev-shm-usage`. Le code actuel ajoute les deux premières options via
`PUPPETEER_DISABLE_SANDBOX=true`; il n'ajoute pas actuellement
`--disable-dev-shm-usage`. Une recette PDF de l'application exacte sur Oracle
reste donc obligatoire.

## 8. Base propre et bootstrap contrôlé

Le reset doit être fait application arrêtée. Il archive l'ancienne base par
l'API de sauvegarde SQLite, vérifie son intégrité, écrit un manifeste SHA-256,
crée une cible inexistante en staging, applique les 16 migrations, vérifie la
base puis renomme la cible. La source originale reste en place.

Chemins prévus :

```text
Source historique : /home/opc/sp/sp_migration/database/database.db
Archives :          /var/lib/gestion-seances/archives
Nouvelle base :     /var/lib/gestion-seances/database.db
```

Conditions obligatoires avant le reset : ancienne application arrêtée,
nouvelle cible inexistante, secrets forts déjà chargés, identifiants bootstrap
définis, espace disque vérifié et copie PC existante conservée.

Commande prévue, à exécuter seulement pendant la future étape guidée :

```bash
export DATABASE_PATH=/home/opc/sp/sp_migration/database/database.db
export CLEAN_DATABASE_PATH=/var/lib/gestion-seances/database.db
export CLEAN_DATABASE_ARCHIVE_DIR=/var/lib/gestion-seances/archives
export CLEAN_INSTALL_CONFIRM=ARCHIVE_AND_INITIALIZE
npm run reset:clean
```

Résultat obligatoire avant toute bascule :

- ancienne base annoncée intacte ;
- archive et manifeste présents, droits restrictifs et SHA-256 consigné ;
- nouvelle base contenant exactement un utilisateur ;
- rôles bootstrap exactement `handler`, `professeur`, `super_admin` ;
- 16 migrations enregistrées ;
- tables métier contrôlées vides ;
- aucune table `lost_and_found` ;
- `PRAGMA integrity_check` = `ok` ;
- `PRAGMA foreign_key_check` = zéro ligne ;
- aucun fichier `database.db-wal` ou `database.db-shm` résiduel après fermeture.

Après réussite seulement : retirer `INITIAL_SUPERADMIN_PASSWORD` et les trois
variables `CLEAN_*`, puis faire pointer le runtime sur la nouvelle base. Ne
supprimer ni l'ancienne base ni son archive.

## 9. PM2 et contrôles runtime

`ecosystem.config.js` impose déjà `fork`, une instance, `127.0.0.1:3000` et une
limite mémoire de 600 Mo. La configuration PDF doit être ajoutée à la source
d'environnement persistante, pas seulement exportée dans un shell temporaire.

La future séquence de contrôle sera :

```bash
pm2 startOrReload ecosystem.config.js --only superprof --update-env
pm2 save
pm2 status
pm2 env 0 | grep -E 'NODE_ENV|HOST|PORT|PUPPETEER_EXECUTABLE_PATH'
curl -fsS http://127.0.0.1:3000/health
```

Attendus : une seule ligne `superprof`, mode `fork`, statut stable `online`,
pas de boucle de redémarrage, health JSON `{"status":"ok"}`. Le compteur de
redémarrages observé sur l'ancien processus est déjà à 100 : il faut lire les
logs et distinguer l'historique avant d'accepter la nouvelle release.

```bash
pm2 logs superprof --lines 200 --nostream
sudo ss -lntp
```

Le seul listener Node acceptable est `127.0.0.1:3000`.

## 10. Push Web et VAPID

La paire VAPID doit être générée une fois, stockée dans le coffre et réutilisée
à chaque release. Si les variables manquent, le code crée
`database/.push-vapid-keys.json`; ce repli est fonctionnel mais moins explicite
pour une nouvelle production. Les variables sont donc retenues.

Test réel après HTTPS : se connecter sur un navigateur compatible, autoriser
les notifications, activer Push dans les réglages, envoyer le test, vérifier la
notification et les logs sans donnée secrète. Tester aussi révocation et
réabonnement. Une rotation VAPID invalide les abonnements existants.

## 11. Deux sauvegardes distinctes obligatoires

### Export métier par email

Le code crée les CSV en mémoire. Chaque Handler actif reçoit uniquement son
espace à 00:00. Chaque SuperAdmin actif reçoit l'export global à 00:00 et
12:00. Le registre `backup_email_deliveries` empêche un double envoi confirmé
et permet la reprise d'un échec. Le CSV neutralise les formules tableur et
n'exporte qu'une liste blanche de colonnes métier.

Ce CSV n'est pas restaurable : il ne contient pas les comptes, rôles,
historique, sessions, fichiers privés et secrets.

### Sauvegarde technique complète

La sauvegarde complète doit inclure :

1. un snapshot cohérent créé par l'API SQLite `.backup` ;
2. `storage/uploads/` ;
3. la configuration non secrète et le manifeste de release ;
4. `SESSION_SECRET`, `AUDIT_SECRET`, `PUSH_VAPID_PRIVATE_KEY` et SMTP depuis le
   coffre, sans les exposer dans l'archive en clair ;
5. hash SHA-256, date UTC, version Node et identifiant de release.

Plan unique recommandé : archive chiffrée quotidienne vers un bucket **privé**
Oracle Object Storage, politique de rétention, puis test mensuel de restauration
dans un répertoire isolé. Une copie située uniquement sur le même disque de la
VM ne protège pas contre la perte de l'instance ou du volume.

La restauration n'est validée que si la copie démarre séparément, passe
`integrity_check`, `foreign_key_check`, `/health`, permet une connexion et rend
un fichier privé autorisé. Aucun test de restauration ne doit viser le chemin
de production.

## 12. Recette de la release exacte

Sur une copie/préproduction isolée avec SMTP en dry-run et une base jetable :

```bash
npm test
node scripts/e2e-browser-audit.js
npm audit --omit=dev
```

L'E2E crée et modifie des données. Il est interdit de le lancer avec le
`DATABASE_PATH` de production ou les identifiants SMTP réels. Sur la production
fraîche, utiliser uniquement des tests manuels contrôlés : healthcheck,
connexion du SuperAdmin, création d'un compte test prévu, email réel, séance
test, tarif/snapshot, PDF, calendrier public et Push, puis supprimer les seules
données test via l'interface si cette suppression fait partie du parcours
autorisé.

## 13. Ordre strict des futures étapes guidées

Chaque étape doit être terminée et son résultat collé avant de passer à la
suivante.

1. Fournir domaine, fournisseur DNS, Gmail expéditeur, identité SuperAdmin et
   destination de sauvegarde.
2. Inventorier l'ancien runtime Oracle en lecture seule : listeners, Caddy ou
   Nginx, PM2, espace disque, services et permissions.
3. Figer la release locale : tests, statut Git revu, archive, manifeste et
   SHA-256. Ne pas inclure `.env`, bases, artefacts E2E ou `node_modules`.
4. Créer les répertoires neufs et transférer la release sans toucher à
   `/home/opc/sp/sp_migration`.
5. Installer/vérifier les dépendances système ARM64 et exécuter `npm ci` avec
   téléchargement Puppeteer désactivé.
6. Créer l'environnement de production, les secrets et VAPID ; vérifier les
   permissions sans afficher les valeurs.
7. Configurer Gmail et tester SMTP depuis une copie isolée.
8. Sauvegarder/archiver l'ancienne base, puis créer et contrôler la base neuve.
9. Démarrer une seule instance PM2 sur localhost ; vérifier logs et health.
10. Configurer DNS, règles OCI, `firewalld`, Caddy et HTTPS.
11. Tester email, PDF, Push, rôles, calendrier public et responsive sur le
    domaine réel.
12. Mettre en place la sauvegarde complète hors VM et réussir une restauration.
13. Faire la revue finale et seulement alors prononcer GO ou revenir en arrière.

## 14. Critères GO / NO-GO

GO uniquement si tous les éléments suivants sont prouvés : release exacte et
hashée, 33/33 tests, base propre contrôlée, un seul processus SQLite, secrets
forts persistants, SMTP réel, HTTPS valide, Node non public, PDF Oracle ARM64,
Push réel si annoncé, sauvegarde complète hors VM, restauration réussie et plan
de rollback conservant l'ancien runtime.

NO-GO immédiat si l'un de ces cas subsiste : domaine inconnu, secret exemple,
SMTP dry-run ou invalide, port 3000 public, plusieurs processus, base cible déjà
existante/non vérifiée, archive non contrôlée, restauration non testée, Chromium
x86-64 utilisé, logs en boucle ou E2E pointé vers la production.

## 15. Sources externes de référence

- Node recommande une ligne LTS pour la production et répertorie Node 22 comme
  LTS : <https://nodejs.org/en/about/previous-releases>
- Puppeteer 25 exige Node 22.12+ et son Chrome Linux fourni est x64 :
  <https://pptr.dev/next/guides/system-requirements>
- Puppeteer précise que Chrome for Testing Linux ARM64 n'est pas fourni :
  <https://pptr.dev/troubleshooting>
- Google : création et révocation des mots de passe d'application :
  <https://support.google.com/accounts/answer/185833>
- Installation officielle Caddy pour RHEL/CentOS et service systemd :
  <https://caddyserver.com/docs/install> et
  <https://caddyserver.com/docs/running>
- Oracle : ajout des règles d'entrée TCP 80/443 dans la Security List :
  <https://docs.oracle.com/en/learn/publish-webserver-using-oci/index.html>
- Les service workers/Push nécessitent un contexte HTTPS :
  <https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register>
