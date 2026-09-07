# Gestion collaborative de seances

Application web pour gerer des seances de cours entre plusieurs comptes, avec calendrier partage, historique, controle d'acces, monetisation et calendrier public en lecture seule.

## Stack

- Front-end : HTML, CSS, JavaScript vanilla
- Back-end : Node.js + Express
- Base de donnees : SQLite
- Calendrier : FullCalendar
- Production : PM2 + Caddy sur Oracle Cloud

## Fonctionnalites principales

- Connexion par identifiant ou email + mot de passe
- Changement obligatoire du mot de passe initial
- Creneaux d'indisponibilite geres par Hossam
- Calendrier mensuel, hebdomadaire et vue `Aujourd'hui`
- Ajout, modification, suppression et changement de statut d'une seance
- Duplication d'une seance existante pour recreer rapidement un creneau similaire
- Historique detaille des actions
- Statistiques par compte
- Monetisation
- Panneau d'administration pour Hossam
- Page publique `/reservation` pour consulter les creneaux occupes en lecture seule

## Documentation backend detaillee

- Vue d'ensemble backend : `docs/backend/README.md`
- Reference fichier par fichier : `docs/backend/REFERENCE.md`

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

Pour lancer les tests de fumee :

```bash
npm test
```

## Deploiement Oracle

Variables utiles derriere Caddy ou un autre reverse proxy :

```bash
HOST=127.0.0.1
PORT=3000
TRUST_PROXY=true
PUBLIC_RESERVATION_TIMEZONE=Europe/Paris
PUBLIC_RESERVATION_TIMEZONE_LABEL="heure de France"
CENTRAL_CALENDAR_TIMEZONE=Africa/Casablanca
CENTRAL_CALENDAR_TIMEZONE_LABEL="heure du Maroc"
PUSH_VAPID_SUBJECT=mailto:votre-adresse@example.com

# Backup quotidien des seances par email
BACKUP_SEANCES_ENABLED=true
BACKUP_SEANCES_EMAIL_TO=votre-adresse@example.com
BACKUP_SEANCES_TIMEZONE=Africa/Casablanca
BACKUP_SEANCES_RETENTION_DAYS=60
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=ton-adresse-gmail@gmail.com
SMTP_PASS=ton-app-password-gmail
```

Le serveur Node doit ecouter uniquement en local sur `127.0.0.1:3000`, puis Caddy expose le site en HTTPS sur les ports `80` et `443`.
Sur Oracle Linux, reconstruire `sqlite3` apres `npm install` pour eviter les binaires precompiles incompatibles avec la version GLIBC du systeme :

```bash
npm run oracle:rebuild-sqlite
```

PM2 peut utiliser la configuration fournie :

```bash
pm2 start ecosystem.config.js
pm2 save
```

Exemple de Caddyfile :

```caddyfile
superprof.84-8-216-203.sslip.io {
    reverse_proxy 127.0.0.1:3000
}
```

## Initialisation automatique

Au premier lancement, l'application cree automatiquement :

- la base SQLite `database/database.db`
- les tables necessaires
- les comptes initiaux

Les donnees d'exemple ne sont creees que si `SEED_DEMO_DATA=true`.

## Routes principales

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

### Reservation publique

- `GET /reservation`
- `GET /api/reservation-public`
- `POST /api/reservation-public/reserver`

### Backup seances

- Tous les jours a `00:00` heure du Maroc, l'application genere un CSV dans `backups/seances/`.
- Si SMTP est configure, ce CSV est envoye a `BACKUP_SEANCES_EMAIL_TO`.
- Les anciens CSV generes par l'application sont nettoyes apres `BACKUP_SEANCES_RETENTION_DAYS` jours, `60` par defaut.
- Pour tester manuellement :

```bash
npm run backup:seances
```

- Pour generer le fichier sans email :

```bash
BACKUP_SEANCES_EMAIL_DRY_RUN=true npm run backup:seances
```

### Maintenance SQLite

Pour verifier et optimiser legerement la base sans changer les donnees :

```bash
npm run maintenance:sqlite
```

Ce script execute `PRAGMA integrity_check`, tronque le WAL si possible et lance `PRAGMA optimize`.

### Indisponibilites

- `GET /api/indisponibilites`
- `POST /api/indisponibilites`
- `DELETE /api/indisponibilites/:id`

### Administration

- `GET /api/admin`
- `POST /api/admin/users`
- `DELETE /api/admin/users/:id`
- `POST /api/admin/catalogue-items`
- `DELETE /api/admin/catalogue-items/:id`
- `POST /api/admin/catalogue-items/:id/restore`
- `POST /api/admin/reset-password`
- `PATCH /api/admin/access`
- `PATCH /api/admin/read-only`
- `PATCH /api/admin/monetisation-access`
- `POST /api/admin/sessions/revoke`
- `POST /api/admin/sessions/revoke-user`
- `POST /api/admin/clear-seances`
- `POST /api/admin/clear-history`

## Notes

- Les mots de passe sont hashes avant stockage.
- L'API applique une protection CSRF sur les actions authentifiees non `GET`.
- Les comptes en lecture seule peuvent consulter mais pas modifier les donnees.
- La page publique `/reservation` affiche les creneaux en heure de France et ne cree pas de reservation.
- `POST /api/reservation-public/reserver` est volontairement desactive et renvoie `410 Gone`.
