# Gestion collaborative de seances

Application web locale pour gerer des seances de cours entre plusieurs comptes, avec calendrier partage, historique, screenshots prives, controle d'acces et panneau d'administration.

## Stack

- Front-end : HTML, CSS, JavaScript vanilla
- Back-end : Node.js + Express
- Base de donnees : SQLite
- Upload : Multer
- Calendrier : FullCalendar

## Fonctionnalites principales

- Connexion par identifiant ou email
- Changement obligatoire du mot de passe initial
- Comptes avec lecture seule, droits monetisation, droits indisponibilites et droits "Aujourd'hui"
- Calendrier mensuel et hebdomadaire
- Ajout, modification, suppression et changement de statut d'une seance
- Gestion de screenshots prives
- Historique detaille des actions
- Monetisation par mois
- Releve mensuel telechargeable par compte
- Panneau d'administration reserve a Hossam

## Comptes initiaux

- `Hossam` / `123456`
- `Abdo` / `123456`

Emails par defaut :

- `hossam@test.com`
- `abdo@test.com`

Compatibilite legacy :

- `ami@test.com` reste accepte a la connexion pour l'ancien compte Abdo.

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

Mode developpement :

```bash
npm run dev
```

Smoke test automatise :

```bash
npm test
```

## Initialisation automatique

Au premier lancement, l'application cree automatiquement :

- la base SQLite `database/database.db`
- les tables necessaires
- les comptes initiaux
- le catalogue par defaut

Les seances de demonstration ne sont creees que si `SEED_DEMO_DATA=true`.

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
|-- scripts/
|-- storage/
`-- utils/
```

## Routes principales

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PATCH /api/auth/password`
- `POST /`
  Fallback de connexion du formulaire HTML.

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

### Screenshots

- `GET /api/photos/seance/:seanceId`
- `POST /api/photos/seance/:seanceId`
- `GET /api/photos/:photoId/file`

### Historique

- `GET /api/historique`
- `GET /api/historique/:id`
- `DELETE /api/historique/:id`

### Monetisation

- `GET /api/monetisation`
- `GET /api/monetisation/releve`

### Administration

- `GET /api/admin`
- `POST /api/admin/users`
- `DELETE /api/admin/users/:id`
- `POST /api/admin/catalogue-items`
- `DELETE /api/admin/catalogue-items/:id`
- `POST /api/admin/reset-password`
- `PATCH /api/admin/access`
- `PATCH /api/admin/read-only`
- `PATCH /api/admin/today-access`
- `PATCH /api/admin/unavailability-access`
- `PATCH /api/admin/monetisation-access`
- `PATCH /api/admin/hourly-rate`
- `GET /api/admin/audit-logins`
- `GET /api/admin/sessions`
- `POST /api/admin/sessions/revoke`
- `POST /api/admin/sessions/revoke-user`
- `POST /api/admin/sessions/revoke-sid`
- `GET /api/admin/blocked-ips`
- `POST /api/admin/blocked-ips`
- `DELETE /api/admin/blocked-ips/:ip`
- `DELETE /api/admin/trusted-devices/:id`
- `POST /api/admin/clear-seances`
- `POST /api/admin/clear-history`

## Notes

- Les mots de passe sont hashes avant stockage.
- Les screenshots sont stockes hors du dossier public.
- L'API applique une protection CSRF sur les actions non `GET`.
- Les comptes en lecture seule peuvent consulter mais pas modifier les donnees.
- Les scripts archives historiques ne font pas partie du runtime applicatif.
