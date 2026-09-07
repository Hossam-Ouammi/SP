# Gestion collaborative de séances

Application existante de gestion de séances, désormais organisée autour d'espaces d'équipe isolés. Elle conserve l'architecture Express 5, EJS, JavaScript natif, FullCalendar et SQLite du projet.

## Documentation utile

- [Déploiement multi-utilisateur](docs/DEPLOIEMENT-MULTI-UTILISATEUR.md) — prérequis, premier compte, migrations, sécurité et exploitation.
- [Changelog multi-utilisateur](docs/CHANGELOG-MULTI-UTILISATEUR.md) — modifications, raisons et couverture de test.
- [Contrat du cycle de vie des comptes](docs/account-lifecycle-contract.md) — demandes, activation et réinitialisation.
- [Audit technique multi-utilisateur](docs/AUDIT-TECHNIQUE-MULTI-UTILISATEUR.md) — architecture observée, matrice de permissions, migrations et risques résiduels.

Les anciens documents détaillant une logique nominative ou mono-compte sont des archives de contexte : ils ne constituent pas la référence d'exploitation. Les documents ci-dessus et le code des routes sont la source de vérité.

## Fonctionnement principal

- Trois capacités cumulables : `super_admin`, `handler` et `professeur`.
- Un Handler possède son espace et peut aussi être intervenant sans faux compte Professeur.
- Un Professeur a un seul rattachement Handler actif ; les lectures et mutations sont filtrées côté serveur par cet espace.
- Les demandes de compte, l'activation et les réinitialisations utilisent des liens à durée limitée et à usage unique.
- Les disponibilités récurrentes, ponctuelles et leurs exceptions sont séparées des indisponibilités historiques.
- Le calendrier public est isolé par Handler et accessible uniquement avec un jeton non devinable, régénérable et stocké haché ; aucune réservation publique n'est créée.
- L'Administration Super Admin inclut une vue d'analyses globales séparée des statistiques et de la monétisation d'un Handler.

## Démarrage local

```powershell
npm install

# Obligatoire sur une base vide : aucun compte ni mot de passe connu n'est créé.
$env:INITIAL_SUPERADMIN_NAME = "Administrateur"
$env:INITIAL_SUPERADMIN_EMAIL = "admin@example.test"
$env:INITIAL_SUPERADMIN_PASSWORD = "Choisir-un-secret-fort"

npm start
```

Ouvrir ensuite `http://localhost:3000`. Les trois variables de bootstrap ne servent qu'à créer le premier compte d'une base vide ; retirez-les de l'environnement après ce premier démarrage. Voir le guide de déploiement pour les variables de production et les migrations.

## Vérification

```bash
npm test
```

La suite crée ses propres bases SQLite temporaires et couvre les scopes Handler, le cycle de vie des comptes, les disponibilités, le calendrier public et ses réglages, les transferts, les analyses globales, le temps réel et les notifications push.

## Exploitation courante

```bash
npm run maintenance:sqlite
npm run backup:seances
```

Les paramètres de sauvegarde, SMTP, proxy, fuseau et calendrier public sont décrits dans le [guide de déploiement](docs/DEPLOIEMENT-MULTI-UTILISATEUR.md).
