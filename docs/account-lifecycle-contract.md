# Contrat — demandes de compte, activation et réinitialisation

> Référence de l'API de cycle de vie des comptes. Pour le premier compte, les
> migrations et les variables de production, consulter
> [le guide de déploiement](DEPLOIEMENT-MULTI-UTILISATEUR.md).

Ce module est conçu pour être monté sans modifier les API existantes :

```js
const accountLifecycleRoutes = require("./routes/account-lifecycle.routes");
app.use("/api/account-lifecycle", accountLifecycleRoutes);
```

Le montage doit rester après les middlewares globaux de session, d'origine et
de CSRF. Les routes protégées chargent ensuite `req.scope` via
`chargerScopeAcces`.

## Schéma attendu

Le runner de migrations P0 doit fournir les éléments suivants. Toutes les dates
sont UTC au format que SQLite sait lire avec `julianday`.

```sql
-- Ajouts à utilisateurs
ALTER TABLE utilisateurs ADD COLUMN public_id TEXT COLLATE NOCASE;
ALTER TABLE utilisateurs ADD COLUMN statut_compte TEXT DEFAULT 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_utilisateurs_public_id
  ON utilisateurs(public_id COLLATE NOCASE)
  WHERE public_id IS NOT NULL;

CREATE TABLE utilisateur_roles (
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'handler', 'professeur')),
  accorde_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (utilisateur_id, role)
);

CREATE TABLE rattachements_professeurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handler_id INTEGER NOT NULL REFERENCES utilisateurs(id),
  professeur_id INTEGER NOT NULL REFERENCES utilisateurs(id),
  actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
  debut_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fin_at TEXT,
  cree_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_rattachements_professeurs_actif_unique
  ON rattachements_professeurs(professeur_id)
  WHERE actif = 1;
CREATE INDEX idx_rattachements_professeurs_handler_actif
  ON rattachements_professeurs(handler_id, actif);

CREATE TABLE demandes_inscription (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  email TEXT NOT NULL,
  role_demande TEXT NOT NULL,
  handler_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  statut TEXT NOT NULL DEFAULT 'pending'
    CHECK (statut IN ('pending', 'approved', 'rejected', 'activated')),
  utilisateur_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  reviewed_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  refusal_reason TEXT,
  activated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_demandes_inscription_handler_pending
  ON demandes_inscription(handler_id, statut, created_at);

CREATE TABLE tokens_compte (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  demande_id INTEGER REFERENCES demandes_inscription(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('activation', 'reset_password')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tokens_compte_utilisateur_type
  ON tokens_compte(utilisateur_id, type, expires_at);
```

`statut_compte` utilise les valeurs `active`, `en_attente_activation`,
`suspendu`, `revoque` et `archive`. Une demande approuvée crée un compte avec
`acces_active = 0` et `statut_compte = 'en_attente_activation'`; aucun mot de
passe temporaire n'est créé ni renvoyé.

Les contraintes de rôle (`handler`/`professeur`) et de cible Handler sont aussi
validées dans le modèle applicatif. Une indexation unique partielle sur l'email
des demandes `pending` reste une optimisation de défense en profondeur ; le
module sérialise déjà la vérification et l'insertion dans une transaction
`BEGIN IMMEDIATE`.

Les comptes historiques doivent recevoir `statut_compte = 'active'` et un
`public_id` unique lors de la migration. Le module ne remplace pas les règles
de migration des comptes existants.

## Routes à monter

| Méthode | Route | Accès | Objet |
| --- | --- | --- | --- |
| `GET` | `/handlers` | public | Retourne uniquement `handler_ids` (aucun nom, email ou ID interne). |
| `POST` | `/requests` | public | Demande de compte avec `nom`, `email` et rôle `handler` ou `professeur`. Pour un Professeur : `handler_public_id` obligatoire. |
| `POST` | `/password-resets` | public | Demande un lien à partir de `identifiant`, `email` ou `public_id`; réponse non énumérante. |
| `POST` | `/activation` | public | Définit le mot de passe avec `{ token, nouveau_mot_de_passe }`. |
| `POST` | `/password-resets/confirm` | public | Définit le mot de passe avec `{ token, nouveau_mot_de_passe }`. |
| `GET` | `/requests` | Handler | Liste uniquement les demandes `pending` de Professeurs ciblant le Handler courant. |
| `POST` | `/requests/:id/approve` | Handler | Crée le compte inactif, le rôle, le rattachement et l'email d'activation pour une demande Professeur de son équipe. |
| `POST` | `/requests/:id/reject` | Handler | Refuse une demande Professeur de son équipe. `raison` optionnelle. |
| `POST` | `/requests/:id/resend-activation` | Handler | Révoque le lien précédent et tente d'envoyer un nouveau lien pour son équipe. |

Un compte cumulant les rôles Super Admin et Handler reste volontairement limité
à son équipe sur ces routes ordinaires. Les opérations globales du Super Admin
passent par les routes explicites suivantes, sous `/api/admin` :

| Méthode | Route | Objet |
| --- | --- | --- |
| `GET` | `/account-requests` | Liste globale des demandes en attente. |
| `POST` | `/account-requests/:id/approve` | Approuve une demande Handler ou Professeur. |
| `POST` | `/account-requests/:id/reject` | Refuse une demande en attente. |
| `POST` | `/account-requests/:id/resend-activation` | Révoque puis renvoie un lien d'activation. |

Les contrôles de scope sont faits côté serveur, indépendamment de l'interface.
Une demande qui n'appartient pas à l'équipe courante est traitée comme
introuvable; un Super Admin ne reçoit une portée globale que via le routeur
Administration explicite.

## Sécurité des jetons et e-mail

- Le jeton brut est généré avec `crypto.randomBytes(32)` puis stocké seulement
  sous forme de SHA-256 dans `tokens_compte`.
- Les jetons expirent, sont consommés une fois et les liens précédents du même
  type sont révoqués à chaque renvoi/réinitialisation.
- Les liens e-mail placent le jeton dans le fragment (`#activation?token=...`),
  jamais dans le chemin ou les paramètres envoyés par le navigateur au serveur.
- L'activation et le reset appliquent la politique de mot de passe existante,
  changent `session_version` et suppriment les appareils de confiance.
- Les demandes de reset et de création ont une réponse volontairement générique
  pour ne pas révéler la présence d'un compte ou d'une demande déjà existante.
- Aucun endpoint ne renvoie de mot de passe temporaire ou de jeton brut.

Variables de configuration :

```text
ACCOUNT_LIFECYCLE_APP_URL=https://app.example.test/
ACCOUNT_EMAIL_FROM=no-reply@example.test
ACCOUNT_EMAIL_DRY_RUN=false
ACCOUNT_ACTIVATION_TOKEN_TTL_MINUTES=1440
ACCOUNT_RESET_PASSWORD_TOKEN_TTL_MINUTES=60
```

Le transport réutilise `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` et
`SMTP_PASS` existants. En production, `ACCOUNT_LIFECYCLE_APP_URL` doit être une
origine HTTPS explicitement configurée : il n'est jamais déduit de l'en-tête
`Host` d'une requête.
