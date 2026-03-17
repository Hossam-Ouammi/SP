# Gestion collaborative de séances

Application web locale pour gérer des séances de cours entre plusieurs comptes, avec calendrier partagé, historique, screenshots privés, contrôle d'accès et panneau d'administration.

## Stack

- Front-end : HTML, CSS, JavaScript vanilla
- Back-end : Node.js + Express
- Base de données : SQLite
- Upload : Multer
- Calendrier : FullCalendar

## Fonctionnalités principales

- Connexion par identifiant ou email + mot de passe
- Changement obligatoire du mot de passe initial
- Calendrier mensuel et hebdomadaire
- Vue `Aujourd'hui`
- Ajout, modification, suppression et changement de statut d'une séance
- Gestion des screenshots
- Historique détaillé des actions
- Statistiques par compte
- Monétisation
- `Admin panel` pour Hossam

## Comptes initiaux

- `Hossam` / `123456`
- `Abdo` / `123456`

Au premier login avec un mot de passe temporaire, l'application force le changement de mot de passe.

## Lancement local

```bash
npm install
npm start
```

Puis ouvrir :

```text
http://localhost:3000
```

## Initialisation automatique

Au premier lancement, l'application crée automatiquement :

- la base SQLite `database/database.db`
- les tables nécessaires (`utilisateurs`, `seances`, `photos`, `historique_actions`, `sessions`, `catalogue_options`, `journal_auth`)
- les comptes initiaux

Les données d'exemple ne sont créées que si `SEED_DEMO_DATA=true`.

## Structure

```text
gestion-seances/
|-- app.js
|-- package.json
|-- README.md
|-- config/
|-- controllers/
|-- database/
|-- middleware/
|-- models/
|-- public/
|-- routes/
|-- storage/
`-- utils/
```

## Utilisation rapide

### Ajouter une séance

- Cliquer sur `Ajouter`
- Remplir `Étudiant` (obligatoire)
- Remplir `Parent` si nécessaire
- Choisir `Matière`, `Compte`, `Durée` et `Statut`
- Sélectionner la date et l'heure de début
- Ajouter des screenshots si besoin
- Cliquer sur `Enregistrer`

### Modifier une séance

- Cliquer sur une séance dans le calendrier
- Cliquer sur `Modifier`
- Changer les informations
- Sauvegarder

### Gérer les screenshots

- Ouvrir `Ajouter` ou `Modifier`
- Sélectionner une ou plusieurs images dans `Screenshots`
- Enregistrer la séance
- Ouvrir le détail de la séance pour voir ou télécharger les screenshots

## Routes principales

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PATCH /api/auth/password`

### Séances

- `GET /api/seances`
- `GET /api/seances/options`
- `GET /api/seances/:id`
- `POST /api/seances`
- `PUT /api/seances/:id`
- `PATCH /api/seances/:id/statut`
- `DELETE /api/seances/:id`

### Screenshots

- `GET /api/photos/seance/:seanceId`
- `POST /api/photos/seance/:seanceId`
- `GET /api/photos/:photoId/file`

### Historique

- `GET /api/historique`
- `GET /api/historique/:id`

### Monétisation

- `GET /api/monetisation`

### Administration

- `GET /api/admin`
- `POST /api/admin/users`
- `DELETE /api/admin/users/:id`
- `POST /api/admin/catalogue-items`
- `POST /api/admin/reset-password`
- `PATCH /api/admin/access`
- `PATCH /api/admin/read-only`
- `PATCH /api/admin/monetisation-access`
- `POST /api/admin/sessions/revoke`
- `POST /api/admin/sessions/revoke-user`
- `POST /api/admin/clear-seances`
- `POST /api/admin/clear-history`

## Notes

- Les mots de passe sont hashés avant stockage.
- Les screenshots sont stockés hors du dossier public.
- L'API applique une protection CSRF sur les actions non `GET`.
- Les comptes en lecture seule peuvent consulter mais pas modifier les données.
