# Gestion collaborative de seances

Application web locale pour gerer des seances de cours a deux, avec calendrier partage, authentification simple, CRUD complet et upload de screenshots.

## Stack

- Front-end : HTML, CSS, JavaScript vanilla
- Back-end : Node.js + Express
- Base de donnees : SQLite
- Upload : Multer
- Calendrier : FullCalendar

## Fonctionnalites

- Connexion par username + mot de passe
- Deux utilisateurs avec les memes permissions
- Calendrier mensuel et hebdomadaire
- Ajout, modification, suppression et changement de statut d'une seance
- Matieres en choix ferme : `Maths`, `Physique chimie`, `Python`, `C++`
- Compte en choix ferme : `Abdo`, `Yassine`
- Duree en cases a cocher : `1h`, `1h30`, `2h`
- Heure de fin calculee automatiquement
- Upload de screenshots
- Historique `cree_par` et `modifie_par`

## Structure

```text
gestion-seances/
|-- app.js
|-- package.json
|-- README.md
|-- database/
|   `-- database.db
|-- public/
|   |-- css/
|   |   `-- style.css
|   |-- js/
|   |   |-- auth.js
|   |   |-- calendrier.js
|   |   |-- seances.js
|   |   `-- ui.js
|   |-- uploads/
|   `-- index.html
|-- routes/
|   |-- auth.routes.js
|   |-- photos.routes.js
|   `-- seances.routes.js
|-- controllers/
|   |-- auth.controller.js
|   |-- photos.controller.js
|   `-- seances.controller.js
|-- models/
|   |-- db.js
|   |-- photo.model.js
|   |-- seance.model.js
|   `-- utilisateur.model.js
`-- middleware/
    `-- auth.middleware.js
```

## Installation

```bash
npm install
```

## Lancement

```bash
npm start
```

Puis ouvrir :

```text
http://localhost:3000
```

## Initialisation automatique

Au premier lancement, l'application cree automatiquement :

- la base SQLite `database/database.db`
- les tables `utilisateurs`, `seances` et `photos`
- deux utilisateurs de test
- quelques seances d'exemple

## Comptes de test

- `Hossam` / `123456`
- `Abdo` / `123456`

## Utilisation rapide

### Tester la connexion

- Ouvrir `http://localhost:3000`
- Se connecter avec un des deux comptes de test

### Tester l'ajout d'une seance

- Cliquer sur `Ajouter`
- Remplir `Etudiant`
- Choisir `Matiere`, `Compte`, `Duree` et `Statut`
- Selectionner la date et l'heure de debut
- Verifier que l'heure de fin se calcule automatiquement
- Cliquer sur `Enregistrer`

### Tester la modification

- Cliquer sur une seance dans le calendrier
- Cliquer sur `Modifier`
- Changer les informations puis sauvegarder

### Tester les screenshots

- Ouvrir `Ajouter` ou `Modifier`
- Selectionner une ou plusieurs images dans `Screenshots`
- Enregistrer la seance
- Ouvrir le detail de la seance pour voir les screenshots

## API principale

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Seances

- `GET /api/seances`
- `GET /api/seances/:id`
- `POST /api/seances`
- `PUT /api/seances/:id`
- `PATCH /api/seances/:id/statut`
- `DELETE /api/seances/:id`

### Screenshots

- `GET /api/photos/seance/:seanceId`
- `POST /api/photos/seance/:seanceId`

## Notes

- Le projet reste volontairement simple et pedagogique.
- L'authentification utilise une session Express.
- Les mots de passe sont hashes avant stockage.
- L'API refuse maintenant les dates invalides, les heures invalides et les seances qui depassent minuit.
