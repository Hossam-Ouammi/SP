# Gestion collaborative de séances

Application existante de gestion de séances, désormais organisée autour d'espaces d'équipe isolés. Elle conserve l'architecture Express 5, EJS, JavaScript natif, FullCalendar et SQLite du projet.

## Documentation utile

- [Vérification finale préproduction](docs/VERIFICATION-FINALE-PREPROD-2026-09-10.md) — résultat des contrôles réels, blocages et checklist go-live.
- [Reset propre et sauvegardes email](docs/RESET-PROPRE-BACKUPS-EMAIL-2026-09-10.md) — nouvelle base, exports scoppés et procédure Oracle.
- [Audit actuel du dépôt](docs/AUDIT-ACTUEL-2026-09-10.md) — architecture, fonctionnalités présentes, corrections et conditions de production.
- [Déploiement multi-utilisateur](docs/DEPLOIEMENT-MULTI-UTILISATEUR.md) — prérequis, premier compte, migrations, sécurité et exploitation.
- [Changelog multi-utilisateur](docs/CHANGELOG-MULTI-UTILISATEUR.md) — modifications, raisons et couverture de test.
- [Contrat du cycle de vie des comptes](docs/account-lifecycle-contract.md) — demandes, activation et réinitialisation.

Les anciens audits et changelogs sont des archives de contexte. Pour l'exploitation, utilisez l'audit actuel, le guide de déploiement et le code exécuté.

## Fonctionnement principal

- Trois capacités cumulables : `super_admin`, `handler` et `professeur`.
- Un Handler possède son espace et peut aussi être intervenant sans faux compte Professeur.
- Un Professeur a un seul rattachement Handler actif ; les lectures et mutations sont filtrées côté serveur par cet espace.
- Les demandes de compte, l'activation et les réinitialisations utilisent des liens à durée limitée et à usage unique.
- Les indisponibilités sont déclarées par les Professeurs ; le Dashboard Handler calcule leur disponibilité commune sans exposer les données privées aux clients.
- Le calendrier public est isolé par Handler, avec une URL stable non devinable stockée sous forme de hash et un décalage d'affichage fixe ; aucune réservation publique n'est créée.
- Les tarifs sont définis par matière et par réalisateur, versionnés pour préserver le montant des séances passées.
- L'Administration Super Admin inclut une vue d'analyses globales séparée des statistiques et de la monétisation d'un Handler.

## Démarrage local isolé (recommandé)

Cette commande crée une base de développement séparée et ne modifie jamais
`database/database.db`. Elle évite aussi un conflit avec une instance déjà
lancée sur le port 3000.

```powershell
npm install

# Facultatif : copiez .env.example vers .env puis renseignez SMTP pour tester
# les emails réels de création de compte et récupération de mot de passe.

# Choisir un fichier qui n'existe pas encore pour créer une nouvelle instance.
$env:DATABASE_PATH = Join-Path $PWD "database\local-dev.db"
$env:PORT = "3001"

# Obligatoire sur cette nouvelle base vide.
$env:INITIAL_SUPERADMIN_NAME = "Administrateur local"
$env:INITIAL_SUPERADMIN_EMAIL = "admin.local@example.test"
# 12+ caractères, avec majuscule, minuscule, chiffre et caractère spécial.
$env:INITIAL_SUPERADMIN_PASSWORD = "AdminLocal!2026"

npm start
```

Ouvrir ensuite `http://localhost:3001` et se connecter avec l'email et le mot
de passe ci-dessus. L'application demandera de changer ce mot de passe au
premier accès.

Les trois variables `INITIAL_SUPERADMIN_*` ne créent un compte **que si la
base indiquée par `DATABASE_PATH` ne contient encore aucun utilisateur**. Elles
ne réinitialisent jamais un mot de passe et n'ajoutent jamais d'admin à une
base existante. Si `local-dev.db` existe déjà, utilisez son compte initial ou
choisissez un autre nom de fichier : ne supprimez pas une base qui contient des
données utiles.

Pour démarrer la base existante du projet, sans créer de compte :

```powershell
Remove-Item Env:DATABASE_PATH -ErrorAction SilentlyContinue
$env:PORT = "3000"
npm start
```

Il faut alors se connecter avec un compte déjà présent ou passer par le flux
de réinitialisation de mot de passe. Voir le guide de déploiement pour les
variables de production et les migrations.

## Vérification

```bash
npm test
```

La suite crée ses propres bases SQLite temporaires et couvre les scopes Handler, le cycle de vie des comptes, les indisponibilités, les tarifs par matière versionnés, le calendrier public et ses réglages, les transferts, les analyses globales, le temps réel et les notifications push.

## Exploitation courante

```bash
npm run maintenance:sqlite
npm run backup:seances
npm run backup:handlers
npm run backup:admin
```

Les paramètres de sauvegarde, SMTP, proxy, fuseau et calendrier public sont décrits dans le [guide de déploiement](docs/DEPLOIEMENT-MULTI-UTILISATEUR.md).
