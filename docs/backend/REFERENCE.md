# Reference backend detaillee

Ce document sert de lecture guidee du backend, fichier par fichier.

Important:

- je couvre toutes les fonctions et toutes les variables structurantes au niveau module
- je n'entre pas dans les variables de boucle triviales comme `index`, `row` ou `error` quand elles n'ont pas de sens metier
- pour un survol rapide, commence par [README.md](./README.md)

## 1. Point d'entree

### `app.js`

Role:
Monte toute l'application Express, organise l'ordre des middlewares, branche les routes, installe le gestionnaire d'erreurs et demarre le serveur.

Variables structurantes:

- `app`: instance Express centrale.
- `PORT`: port d'ecoute, `process.env.PORT` sinon `3000`.
- `HOST`: interface d'ecoute, `process.env.HOST` sinon `0.0.0.0`.
- `trustProxy`: booleen derive de `TRUST_PROXY`, decide si Express fait confiance au reverse proxy.

Fonctions:

- `appliquerNoCacheStatic(res)`: force `Cache-Control`, `Pragma` et `Expires` pour empecher le cache sur les assets servis par Express.
- `recupererEtatConnexionFormulaire(req)`: lit `login_error` et `login_username` dans la session, puis efface ces clefs. Cela permet a la page `/` d'afficher proprement la derniere erreur de connexion formulaire.
- `demarrerServeur()`: initialise la base, demarre les planificateurs push et backup, puis lance `app.listen`. En cas d'echec, log et `process.exit(1)`.

Ordre exact des middlewares:

1. creation du dossier `database/`
2. creation des dossiers legacy des anciens fichiers associes via `assurerDossiersScreenshots()`
3. `app.disable("x-powered-by")`
4. `app.set("trust proxy", ...)`
5. `verifierIpBlocklist`
6. `compression(...)` avec exception SSE
7. `rateLimit` sur `/api/`
8. `appliquerEnTetesSecurite`
9. `desactiverCacheApi`
10. `express.json`
11. `express.urlencoded`
12. `express-session` avec `SQLiteSessionStore`
13. `restaurerConnexionAutomatique`
14. `verifierOrigineRequete`
15. `verifierProtectionCsrf`
16. `attacherTokenCsrf`
17. `express.static` pour les vendors FullCalendar
18. `express.static` pour `public/`
19. montage des routes API
20. route `GET /health`
21. configuration EJS
22. page `GET /`
23. login formulaire `POST /`
24. fallback 404 API ou redirection `/`
25. error handler global

Notes importantes:

- la session utilise `rolling: true`: chaque requete valide repousse l'expiration
- le cookie de session est `httpOnly`, `sameSite=strict`, `secure=auto`
- aucun middleware d'upload n'est monte: la description de seance remplace les fichiers
- les routes non-API inconnues redirigent vers `/`

## 2. Configuration

### `config/security.config.js`

Role:
Centralise les noms et durees des cookies.

Variables:

- `SESSION_COOKIE_NAME`: nom du cookie de session Express.
- `SESSION_MAX_AGE_MS`: duree de vie d'une session serveur, 8 heures.
- `AUTO_LOGIN_COOKIE_NAME`: cookie de l'appareil de confiance.
- `AUTO_LOGIN_MAX_AGE_MS`: duree de vie du cookie appareil, 10 ans.

### `config/backup.config.js`

Role:
Lit les variables d'environnement du systeme de backup quotidien.

Fonctions:

- `lireBooleenEnv(nom, valeurParDefaut)`: convertit les formes `1/true/yes/on`.
- `lireNombreEnv(nom, valeurParDefaut)`: convertit en nombre sinon garde la valeur par defaut.

Variables exportees:

- `BACKUP_SEANCES_ENABLED`: vrai sauf si `BACKUP_SEANCES_DISABLED=true`.
- `BACKUP_SEANCES_EMAIL_TO`: destinataire du backup.
- `BACKUP_SEANCES_EMAIL_FROM`: expediteur force si besoin.
- `BACKUP_SEANCES_TIMEZONE`: fuseau de calcul du backup.
- `BACKUP_SEANCES_DAILY_HOUR` et `BACKUP_SEANCES_DAILY_MINUTE`: heure locale cible.
- `BACKUP_SEANCES_OUTPUT_DIR`: dossier de sortie CSV.
- `BACKUP_SEANCES_EMAIL_DRY_RUN`: cree le CSV sans envoi.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`: config mail.

### `config/push.config.js`

Role:
Definit la cadence des rappels push et le sujet VAPID.

Variables:

- `PUSH_VAPID_SUBJECT`: contact associe aux clefs VAPID.
- `PUSH_REMINDER_TIMEZONE`: fuseau de calcul des rappels.
- `PUSH_REMINDER_INTERVAL_HOURS`: periodicite des rappels de journee.
- `PUSH_REMINDER_START_HOUR` et `PUSH_REMINDER_END_HOUR`: plage horaire de rappel.
- `PUSH_DAILY_SUMMARY_HOUR`: heure du resume quotidien.
- `PUSH_REMINDER_GRACE_MINUTES`: fenetre de tolerance apres l'heure pile.
- `PUSH_REMINDER_POLL_INTERVAL_MS`: cadence du poller en memoire.
- `PUSH_ENABLE_IN_MEMORY_REMINDERS`: active ou non le planificateur interne. Par defaut, actif hors production sauf override explicite.

### `config/public-reservation.config.js`

Role:
Configure la page publique de reservation/lecture planning.

Variables:

- `PUBLIC_RESERVATION_COOKIE_NAME`: nom du cookie theorique de l'appareil public.
- `PUBLIC_RESERVATION_COOKIE_MAX_AGE_MS`: duree de vie du cookie appareil public.
- `PUBLIC_RESERVATION_ALLOWED_DURATIONS`: durees autorisees cote public, figees a `60/90/120`.
- `PUBLIC_RESERVATION_SLOT_DURATION_MINUTES`: duree par defaut retenue si l'env est valide.
- `PUBLIC_RESERVATION_TIMEZONE` et `PUBLIC_RESERVATION_TIMEZONE_LABEL`: fuseau et libelle public.
- `CENTRAL_CALENDAR_TIMEZONE` et `CENTRAL_CALENDAR_TIMEZONE_LABEL`: fuseau et libelle du calendrier interne.
- `PUBLIC_RESERVATION_DEFAULT_COMPTE`: compte par defaut si la reservation redevient active.
- `PUBLIC_RESERVATION_OWNER_EMAIL`: proprietaire theorique de la reservation publique.
- `PUBLIC_RESERVATION_SLOT_MIN_TIME` et `PUBLIC_RESERVATION_SLOT_MAX_TIME`: fenetre horaire affichee.

Fonction:

- `lireDureeParDefaut()`: force la duree env a l'une des valeurs autorisees.

## 3. Middlewares

### `middleware/security.middleware.js`

Role:
Protege l'application au niveau HTTP.

Fonctions:

- `genererTokenCsrf()`: cree un token CSRF aleatoire 32 octets en hex.
- `recupererPremiereValeurEntete(req, nomEntete)`: gere les headers potentiellement multiples comme `x-forwarded-proto`.
- `requeteEstSecurisee(req)`: deduit si la requete est HTTPS via `x-forwarded-proto`, `req.secure` ou `req.protocol`.
- `determinerOrigineAttendue(req)`: reconstruit `scheme://host` attendu pour les verifications d'origine.
- `origineCorrespond(origine, origineAttendue)`: compare un header `Origin` ou `Referer` apres normalisation URL.
- `appliquerEnTetesSecurite(req, res, next)`: pose CSP, Referrer-Policy, anti-frame, HSTS si HTTPS, etc.
- `desactiverCacheApi(req, res, next)`: interdit le cache pour les routes `/api/`.
- `verifierOrigineRequete(req, res, next)`: pour les methodes mutantes, bloque les requetes cross-origin.
- `attacherTokenCsrf(req, res, next)`: ajoute `X-CSRF-Token` dans la reponse pour toute session authentifiee.
- `verifierProtectionCsrf(req, res, next)`: compare le header `x-csrf-token` avec la session.
- `normaliserValeurIp(valeur)`: nettoie IPv4, IPv6 loopback, `::ffff:`, IP avec port, etc.
- `normaliserIpClient(req)`: retourne l'IP finale exploitable du client.

### `middleware/ip-blocklist.middleware.js`

Role:
Coupe tres tot les requetes venant d'IP bannies.

Fonction:

- `verifierIpBlocklist(req, res, next)`: recupere l'IP normalisee, interroge `blocked_ips`, renvoie `403` si l'IP est interdite.

### `middleware/auth.middleware.js`

Role:
Gere la session authentifiee, le cookie appareil de confiance et les droits d'acces.

Variables implicites:

- la session stocke `req.session.utilisateur`
- les metadonnees de session sont stockees sous `req.session.session_meta`
- le cookie auto-login contient `selector:validator`

Fonctions techniques:

- `obtenirOptionsCookie(req)`: options de cookie standard basees sur le contexte HTTPS.
- `obtenirOptionsCookieConnexionAutomatique(req)`: meme base, avec `maxAge` long terme.
- `recupererCookiesRequete(req)`: parse manuellement le header `Cookie`.
- `recupererCookieRequete(req, nomCookie)`: raccourci d'acces a un cookie.
- `detruireSession(req)`: encapsule `req.session.destroy` dans une promesse.
- `regenererSession(req)`: encapsule `req.session.regenerate`.
- `sauvegarderSession(req)`: encapsule `req.session.save`.
- `effacerCookieConnexionAutomatique(req, res)`: supprime le cookie appareil.
- `invaliderSessionEtCookie(req, res)`: detruit session et cookies si la confiance n'est plus valable.

Fonctions metier:

- `initialiserSessionAuthentifiee(req, utilisateur, options)`: recree une session propre, injecte les champs utilisateur utiles, pose le token CSRF et renseigne IP/user-agent/date de connexion.
- `restaurerConnexionAutomatique(req, res, next)`: sur `GET/HEAD/OPTIONS`, tente un login silencieux via `trusted_devices`. Verifie le `validator_hash`, la `session_version`, l'etat `acces_active`, puis fait tourner le secret appareil.
- `chargerUtilisateurAuthentifie(req, res)`: recharge l'utilisateur depuis la base a partir de la session et invalide si compte supprime, suspendu ou version de session obsolete.
- `verifierAuthentification(req, res, next)`: refuse en `401` si aucun utilisateur charge.
- `verifierCompteSecurise(req, res, next)`: refuse en `403` tant que le mot de passe initial n'a pas ete change.
- `utilisateurEstAdministrateur(utilisateur)`: vrai si `est_admin=1` ou email `hossam@test.com`.
- `utilisateurEstHossam(utilisateur)`: vrai si email `hossam@test.com`.
- `verifierAccesAdministratifHossam(req, res, next)`: protege tout l'espace admin.
- `verifierAccesHossamUniquement(req, res, next)`: reserve certaines actions au seul Hossam.
- `verifierModeEcritureAutorise(req, res, next)`: interdit les comptes lecture seule, sauf admin.
- `verifierAccesMonetisation(req, res, next)`: autorise Hossam ou les comptes explicitement marques.
- `verifierAccesIndisponibilites(req, res, next)`: autorise admin ou comptes ayant ce droit.

## 4. Routes

### `routes/auth.routes.js`

Role:
Expose l'API d'authentification.

Routes:

- `POST /login` -> `connecterUtilisateur`
- `POST /logout` -> `deconnecterUtilisateur`
- `GET /me` -> `recupererUtilisateurConnecte`
- `PATCH /password` -> `verifierAuthentification` puis `modifierMotDePasse`

### `routes/seances.routes.js`

Role:
Expose la CRUD des seances.

Pipeline:

- toute la route exige `verifierAuthentification`
- puis `verifierCompteSecurise`
- les mutations exigent aussi `verifierModeEcritureAutorise`
- les mutations sont enveloppees par `notifierMiseAJourApplication(..., "seances")`

### `routes/photos.routes.js`

Role:
Expose seulement les anciennes pieces jointes en lecture, pour compatibilite avec une base qui en contient deja.

Routes:

- `GET /:photoId/file`
- `GET /seance/:seanceId`

Note:

- aucun `POST` d'upload n'est expose.

### `routes/indisponibilites.routes.js`

Role:
Expose la lecture et la gestion des indisponibilites.

Regles:

- lecture: `verifierAccesIndisponibilites`
- ecriture: `verifierAccesHossamUniquement`

### `routes/historique.routes.js`

Role:
Expose l'historique metier.

Regles:

- lecture: authentification + compte securise
- suppression: en plus `verifierAccesAdministratifHossam`

### `routes/monetisation.routes.js`

Role:
Expose statistiques et releves de monetisation.

Regles:

- authentification
- compte securise
- acces monetisation

### `routes/admin.routes.js`

Role:
Expose toutes les actions sensibles d'administration.

Regle structurante:

- toutes les routes passent par `verifierAuthentification`, `verifierCompteSecurise`, `verifierAccesAdministratifHossam`

Pattern cle:

- presque toutes les mutations sont enveloppees par `notifierMiseAJourApplication`

### `routes/push.routes.js`

Role:
Expose la config VAPID et la gestion d'abonnements push.

### `routes/realtime.routes.js`

Role:
Expose le flux SSE prive authentifie.

### `routes/public-reservation.routes.js`

Role:
Separe les routes de page (`pageRouter`) et les routes API (`apiRouter`) du planning public.

### `routes/monetisation.routes.js`, `routes/push.routes.js`, `routes/realtime.routes.js`

Ce sont des routeurs minces. Leur vrai interet est surtout le chainage de middlewares d'acces.

## 5. Controleurs

### `controllers/auth.controller.js`

Role:
Gere login, logout, changement de mot de passe et exposition de l'utilisateur courant.

Variables structurantes:

- `tentativesConnexionParIp`: map en memoire par IP.
- `FENETRE_TENTATIVES_IP_MS`, `DUREE_BLOCAGE_IP_MS`, `MAX_TENTATIVES_IP`: politique anti-bruteforce IP.
- `FENETRE_TENTATIVES_COMPTE_MS`, `DUREE_BLOCAGE_COMPTE_MS`, `MAX_TENTATIVES_COMPTE`: politique anti-bruteforce compte.

Fonctions helper:

- `normaliserIdentifiantConnexion(identifiant)`: convertit les alias `ami` et `ami@test.com` vers Abdo.
- `creerErreurConnexion(status, message, options)`: standardise les erreurs de login avec metadata comme `retryAfter`.
- `obtenirUserAgent(req)`: tronque le user-agent.
- `nettoyerTentativesConnexionIp()`: purge les echecs IP expires et les blocages termines.
- `recupererBlocageConnexionActifParIp(req)`: retourne le nombre de secondes restantes si l'IP est encore bloquee.
- `enregistrerEchecConnexionIp(req)`: ajoute un echec et declenche un blocage IP si le seuil est atteint.
- `reinitialiserTentativesConnexionIp(req)`: vide l'historique de l'IP apres succes.
- `calculerSecondesRestantes(dateIso)`: utilitaire de compteur avant deblocage.
- `recupererBlocageCompteActif(utilisateur)`: lit `bloque_jusqua` pour un compte.
- `calculerNouvelEtatEchecConnexion(utilisateur)`: met a jour la fenetre de tentatives cote base.
- `sauvegarderSession(req)`: promisifie `session.save`.
- `obtenirOptionsCookie(req)`: options du cookie de session pour logout.
- `journaliserEvenementAuth(req, evenement)`: enregistre un evenement dans `journal_auth`.
- `valeurBooleenneActive(valeur)`: parse `remember_device`.
- `supprimerAppareilAutoLoginCourant(req)`: retire l'appareil courant si le cookie existe.
- `synchroniserConnexionAutomatique(req, res, utilisateur, rememberDevice)`: remplace l'etat auto-login courant. Soit retire le cookie, soit cree un `trusted_device`.

Fonction centrale:

- `authentifierConnexion(req, res, options)`: coeur du login. Verifie blocage IP, format des identifiants, existence du compte, etat du compte, blocage de compte, `bcrypt.compare`, mise a jour des compteurs, creation de session, rotation du cookie auto-login, emission du token CSRF et audit.

Fonctions exportees:

- `connecterUtilisateur(req, res)`: version API JSON du login.
- `connecterUtilisateurDepuisFormulaire(req, res)`: version formulaire HTML, persiste l'erreur en session puis redirige vers `/`.
- `modifierMotDePasse(req, res)`: verifie l'ancien mot de passe, applique la politique de complexite, change le hash, invalide tous les appareils de confiance de l'utilisateur puis recree une session propre.
- `deconnecterUtilisateur(req, res)`: journalise le logout, supprime l'appareil de confiance courant, detruit la session et nettoie les cookies.
- `recupererUtilisateurConnecte(req, res)`: recharge l'utilisateur depuis la base et garantit qu'un token CSRF est disponible.

### `controllers/seances.controller.js`

Role:
Gere la logique complete du calendrier interne.

Variables structurantes:

- `statutsSeanceValides`: `planifiee`, `faite`, `annulee`, `reportee`
- `statutsCreationValides`: creation seulement en `planifiee` ou `faite`
- `dureesValides`: `60`, `90`, `120`
- `valeursEssaiValides`: `0`, `1`
- `libellesChampHistorique`: dictionnaire d'affichage des champs audites
- `libellesStatutHistorique`: traduction lisible des statuts
- `comptePriveHossam`: cle `hossam`
- `libelleSeanceConfidentielle`: texte affiche aux non-admins

Helpers techniques:

- `normaliserTexte`, `normaliserCleCompte`, `estIdentifiantValide`
- `convertirHeureEnMinutes`, `convertirMinutesEnHeure`
- `estDateIsoValide`, `estHeureValide`, `estHeureFinLegacyValide`, `estHeureDebutSeanceValide`
- `calculerHeureFin(heureDebut, dureeMinutes)`: derive l'heure de fin a partir de la duree.
- `calculerDureeMinutes(heureDebut, heureFin)`: relit la duree si besoin.
- `formaterDuree(dureeMinutes)`: construit `1h`, `1h30`, `2h`, etc.

Helpers metier:

- `estIndisponibiliteJourComplet(indisponibilite)`: interprete le drapeau SQL.
- `utilisateurPeutVoirCompteHossam(utilisateur)`: vrai pour admin ou Hossam.
- `seanceEstCompteHossam(seance)`: detecte le compte confidentiel.
- `masquerSeanceConfidentiellePourClient(seance)`: conserve le creneau mais efface la substance de la seance.
- `construireMessageIndisponibilite(indisponibilite)`: transforme un conflit d'indisponibilite en message metier.
- `creneauSeanceEquivalent(seance, donneesSeance)`: compare date et plage horaire.
- `recupererConflitIndisponibilite(donneesSeance)`: cherche une indisponibilite chevauchante.
- `recupererConflitSeancePriveeHossam(donneesSeance, options)`: empeche qu'un utilisateur non autorise reserve par-dessus un creneau Hossam.

Helpers historique:

- `normaliserValeurHistorique(champ, valeur)`: adapte les valeurs pour l'audit lisible.
- `valeurComparableHistorique(champ, valeur)`: normalise les valeurs pour la detection de changement.
- `extraireEtatAuditSeance(seance)`: fabrique un snapshot stable de la seance.
- `construireDetailsCreation(etatSeance)`: enveloppe le snapshot de creation.
- `construireListeSuppression(etatSeance)`: fabrique une pseudo-diff avant -> `-`.
- `construireDetailsSuppression(etatSeance)`: payload complet de suppression.
- `construireListeChangements(avant, apres)`: calcule la diff de tous les champs suivis.
- `journaliserActionSeance(...)`: facade vers `creerEntreeHistorique`.

Helpers de transformation:

- `construireLibelleSeance(donneesSeance)`: `matiere - etudiant`.
- `construireDateHeureLocale(date, heure)`: transforme date + heure en `Date`.
- `calculerStatutSeanceAffiche(seance)`: une seance `planifiee/reportee` terminee dans le passe s'affiche comme `faite`.
- `normaliserValeurEssai(valeur)`: convertit formes booleennes en `0/1`.
- `recupererCatalogueSeances()`: charge le catalogue sous forme de tableaux simples.
- `validerDonneesSeance(donneesSeance, utilisateur)`: coeur des validations metier.
- `preparerDonneesSeance(donneesSeance)`: nettoie le body et complete `heure_fin`, `titre`, `prix`, `statut_paiement`.
- `transformerSeancePourClient(seance)`: construit la forme API standard avec `duree_label`, `statut_manuel`, `statut_auto`, etc.
- `transformerSeancePourClientSelonUtilisateur(seance, utilisateur)`: applique la confidentialite Hossam si necessaire.
- `filtrerCataloguePourUtilisateur(catalogue, utilisateur)`: retire le compte `Hossam` du select pour les non-admins.

Controllers exportes:

- `recupererToutesLesSeances(req, res)`: liste globale du planning.
- `recupererOptionsSeances(req, res)`: renvoie catalogue matieres/comptes filtre selon l'utilisateur.
- `recupererUneSeance(req, res)`: charge une seance par id.
- `ajouterSeance(req, res)`: valide, verifie indisponibilites et confidentialite, cree la seance, journalise la creation.
- `modifierSeance(req, res)`: relit l'existant, applique les memes controles, met a jour et journalise la diff.
- `changerStatutSeance(req, res)`: met a jour uniquement `statut_seance` et journalise la diff.
- `supprimerUneSeance(req, res)`: detache l'historique, supprime la seance dans une transaction, puis supprime les anciens fichiers associes si la base en contient.

### `controllers/photos.controller.js`

Role:
Gere uniquement la consultation securisee des anciens fichiers associes.

Helpers:

- `estIdentifiantValide`
- `utilisateurPeutVoirCompteHossam`
- `seanceEstCompteHossam`
- `transformerPhotoPourClient(photo)`: donne les URLs protegees legacy.
- `construireNomTelechargement(photo)`: nettoie le nom de fichier pour `Content-Disposition`.

Controllers:

- `recupererPhotosDuneSeance(req, res)`: retourne les anciens fichiers d'une seance si l'utilisateur y a droit.
- `recupererFichierPhoto(req, res)`: resout le chemin prive/legacy du fichier, applique le `Content-Disposition` inline ou attachment, puis sert le fichier.

### `controllers/indisponibilites.controller.js`

Role:
Gere les creneaux de blocage du calendrier.

Variables:

- `HEURE_DEBUT_JOUR_COMPLET = "00:00"`
- `HEURE_FIN_JOUR_COMPLET = "23:59"`

Helpers:

- `normaliserTexte`, `estIdentifiantValide`, `estDateIsoValide`
- `estHeureValide`, `estHeureCreneauValide`, `convertirHeureEnMinutes`
- `estIndisponibiliteJourComplet`
- `construireLibelleIndisponibilite`
- `transformerIndisponibilitePourClient`
- `construireDetailsCreation` et `construireDetailsSuppression`

Controllers:

- `recupererIndisponibilites(req, res)`: liste transformee.
- `ajouterIndisponibilite(req, res)`: gere jour complet ou plage simple, valide les tranches de 30 min, empeche les chevauchements, cree l'entree et l'historique.
- `supprimerUneIndisponibilite(req, res)`: supprime et journalise.

### `controllers/historique.controller.js`

Role:
Expose l'historique d'actions tout en respectant la confidentialite Hossam.

Helpers:

- `estIdentifiantValide`
- `obtenirUserAgent`
- `utilisateurPeutVoirCompteHossam`
- `entreeHistoriqueMentionneCompteHossam(entree)`: inspecte `details.seance.compte` et les changements de champ `compte`.
- `entreeHistoriqueConcerneCompteHossam(entree, cacheSeances)`: si l'entree ne mentionne rien directement, recharge la seance pour savoir si elle est liee a Hossam.
- `journaliserSuppressionHistorique(req, resultat, details)`: enregistre dans `journal_auth`.
- `verifierMotDePasseAdministrateur(req, motDePasseActuel)`: verifie le secret admin avant une suppression sensible.

Controllers:

- `recupererHistorique(req, res)`: charge jusqu'a 300 lignes et filtre les entrees Hossam pour les non-admins.
- `recupererDetailHistorique(req, res)`: charge une entree precise avec le meme filtre de confidentialite.
- `supprimerEntreeHistoriqueAdministration(req, res)`: exige le mot de passe actuel, supprime l'entree puis rechaine l'historique.

### `controllers/public-reservation.controller.js`

Role:
Pilote la page publique du planning.

Helpers:

- `normaliserTexte`
- `estDateIsoValide`
- `ajouterJoursIso(dateIso, nombreJours)`: manipule les dates ISO sans glissement de fuseau.
- `calculerDebutSemaine(dateIso)`: recule au lundi.
- `obtenirDatePubliqueCouranteIso()`: date du jour dans le fuseau public.
- `obtenirContexteSemaine(valeurReference)`: produit `date_reference`, `week_start`, `week_end`.
- `plageChevaucheSemaine(plage, contexteSemaine)`: sert a filtrer les blocages visibles.
- `convertirPlageCentraleVersPublique(date, heureDebut, heureFin)`: convertit du fuseau central vers le fuseau public.
- `listerSeancesParPlageDates(dateDebut, dateFin)`: recupere les seances non annulees dans un intervalle.
- `listerIndisponibilitesParPlageDates(dateDebut, dateFin)`: idem pour indisponibilites.
- `transformerPlagePourClient(...)`: uniformise un blocage pour le client public.
- `appliquerNoCache(res)`: version locale du no-cache.

Controllers:

- `afficherPageReservationPublique(req, res)`: rend `views/reservation.ejs`.
- `recupererPlanningReservationPublique(req, res)`: charge seances et indisponibilites, convertit les heures vers le fuseau public et renvoie `planning.blocages`.
- `reserverCreneauPublic(req, res)`: renvoie `410` avec message clair. Fonction volontairement desactivee.
- `ouvrirFluxPlanningPublic(req, res)`: ouvre un SSE public limite aux scopes `seances` et `indisponibilites`.

### `controllers/push.controller.js`

Role:
Expose les endpoints pour activer ou tester le push sur un navigateur.

Helpers:

- `normaliserTexte`

Controllers:

- `recupererConfigurationPush(req, res)`: renvoie la cle publique VAPID et les parametres de cadence.
- `enregistrerAbonnementPush(req, res)`: valide l'objet `subscription`, persiste l'abonnement actif.
- `supprimerAbonnementPush(req, res)`: desactive un abonnement existant pour l'utilisateur courant.
- `envoyerTestPush(req, res)`: retrouve l'abonnement courant et lui envoie une notification de test.

### `controllers/realtime.controller.js`

Role:
Expose le SSE prive pour les utilisateurs connectes.

Controller:

- `ouvrirFluxTempsReel(req, res)`: pose les headers SSE, enregistre le client, installe un heartbeat et libere le client a la fermeture de connexion.

### `controllers/monetisation.controller.js`

Role:
Calcule les stats financieres et genere des releves exportables.

Variables structurantes:

- `TARIFS_HORAIRES_PAR_DEFAUT`: fallback par compte si le catalogue n'a pas de tarif.
- `REGEX_MOIS_ISO` et `REGEX_ANNEE_ISO`: validation de filtre.

Helpers de temps/statut:

- `estHeureValide`, `estHeureFinLegacyValide`, `convertirHeureEnMinutes`
- `calculerDureeMinutes(seance)`: reconstruit la duree si la colonne SQL manque.
- `construireDateHeureLocale(date, heure)`
- `calculerStatutMonetisation(seance)`: traite une seance passee comme faite meme si son statut manuel etait encore `planifiee` ou `reportee`.
- `estSeanceGratuiteMonetisation(seance)`: vrai pour `est_essai`.
- `estSeanceFaiteMonetisation(seance)`
- `estSeanceFacturableMonetisation(seance)`
- `calculerMontantSeance(seance, tarifUnitaire)`
- `calculerMonetisationPourCompte(seances, nomCompte, tarifUnitaire)`: agregat par compte.

Helpers de filtrage:

- `normaliserCleCompte`
- `extraireCleMoisSeance`
- `lireFiltreMoisMonetisation`
- `lireModePeriodeMonetisation`
- `lireFiltreAnneeMonetisation`
- `lireListeComptesMonetisation`
- `lireFormatReleveMonetisation`
- `obtenirTarifHoraireParDefautCompte`
- `utilisateurPeutVoirCompteHossam(utilisateur)`: ici, la regle est stricte, seul l'email de Hossam voit le compte Hossam en monetisation.
- `peutAfficherCompteDansMonetisation`
- `construireContexteMonetisation(utilisateur, seances, catalogue)`: calcule les comptes visibles, les seances visibles et la map de catalogue.
- `obtenirTarifUnitaireCompte(compteVisible, comptesCatalogueParNom)`
- `listerMoisDisponibles`, `listerAnneesDisponibles`
- `filtrerSeancesParMois`, `filtrerSeancesParAnnee`
- `trierSeancesParDateEtHeure`

Helpers de presentation:

- `formaterMontantDh`
- `formaterDateReleve`
- `formaterMoisReleve`
- `formaterDateHeureGeneration`
- `formaterPlageHoraire`
- `echapperHtml`
- `normaliserNomFichier`

Helpers de generation de releve:

- `construirePeriodeReleveMonetisation(...)`: choisit entre vue mensuelle, annuelle ou globale.
- `filtrerSeancesPourPeriodeReleveMonetisation(...)`
- `formaterPeriodeReleveMonetisation(periode)`
- `decrirePeriodeReleveMonetisation(periode)`
- `construireNomFichierReleveMonetisation(periode, suffixeComptes, extension)`
- `genererPdfDepuisHtml(html)`: lance Puppeteer headless et exporte en A4.
- `construireHtmlReleveMonetisation(...)`: fabrique un HTML autonome avec resume par compte, detail des seances et CSS d'impression.

Controllers:

- `recupererMonetisation(req, res)`: valide les filtres, charge toutes les seances et le catalogue, applique la visibilite, agrege par compte et renvoie stats + periodes disponibles.
- `telechargerReleveMonetisation(req, res)`: valide filtres et comptes, calcule les lignes du releve, genere HTML ou PDF, puis sert le fichier en piece jointe.

### `controllers/admin.controller.js`

Role:
Regroupe toute l'administration sensible.

Helpers:

- `obtenirUserAgent`
- `normaliserTexte`
- `estEmailValide`
- `journaliserActionAdmin(req, actionType, resultat, details)`: ecrit dans `journal_auth`.
- `verifierMotDePasseAdministrateur(req, motDePasseActuel)`: demande une reverification du secret admin avant toute operation sensible.
- `repondreErreurVerification(...)`: helper de reponse + journalisation si le mot de passe courant est faux.

Controllers de lecture:

- `recupererVueAdministration(req, res)`: charge en parallele comptes, sessions, catalogue, journal auth, IP bloquees et trusted devices.
- `recupererJournalAuthentification(req, res)`: renvoie une fenetre paginee simple des logs.
- `recupererToutesLesSessions(req, res)`: expose les sessions actives parsees.
- `recupererIpsBloquees(req, res)`: expose la blacklist IP.

Catalogue:

- `ajouterElementCatalogueAdministration(req, res)`: ajoute une matiere ou un compte apres reverification du mot de passe et controle d'unicite.
- `supprimerElementCatalogueAdministration(req, res)`: retire la matiere ou le compte du catalogue actif, journalise le nombre de seances existantes conservees et ne modifie pas les seances historiques.

Comptes:

- `creerUtilisateurAdministration(req, res)`: valide nom/email, detecte les collisions nom/email croisees, genere un mot de passe temporaire fort, cree le compte et renvoie ce mot de passe.
- `supprimerUtilisateurAdministration(req, res)`: interdit l'auto-suppression et la suppression des admins, puis reattribue les traces vers l'admin courant.
- `reinitialiserMotDePasseCompte(req, res)`: genere un nouveau mot de passe temporaire et invalide les appareils auto-login du compte cible.
- `mettreAJourAccesUtilisateur(req, res)`: suspend ou reactive un compte et force la fermeture des appareils persistants si suspension.
- `mettreAJourLectureSeuleUtilisateur(req, res)`: active ou desactive la lecture seule.
- `mettreAJourAccesMonetisationUtilisateur(req, res)`: affiche ou masque le menu monetisation.
- `mettreAJourTarifCompteUtilisateur(req, res)`: modifie le tarif du compte de seance dans le catalogue.
- `mettreAJourAccesAujourdhuiUtilisateur(req, res)`: droit sur le module Aujourd'hui et les rappels.
- `mettreAJourAccesIndisponibilitesUtilisateur(req, res)`: droit de consultation des indisponibilites.

Sessions et securite:

- `revoquerSessionAdministration(req, res)`: ferme une session precise. Si c'est la session courante, le front doit se reauthentifier.
- `revoquerSessionsUtilisateurAdministration(req, res)`: ferme toutes les sessions actives d'un utilisateur.
- `revoquerSessionSpecifique(req, res)`: doublon plus defensif de revocation par `sid`.

Purge:

- `supprimerToutesLesSeancesAdmin(req, res)`: vide les seances et nettoie les anciens fichiers associes en conservant l'historique detache.
- `supprimerToutHistoriqueAdmin(req, res)`: vide historique et journal auth.

IP bloquees:

- `normaliserIpSaisie(ip)`: accepte IPv4/IPv6 et retire un port IPv4 si besoin.
- `bloquerNouvelleIp(req, res)`: interdit de bloquer l'IP courante, puis cree l'entree.
- `debloquerIpExistante(req, res)`: retire une IP de la blacklist.

Appareils de confiance:

- `revoquerAppareilAutoLoginAdministration(req, res)`: supprime un appareil `trusted_device`. Si l'appareil appartient a l'utilisateur courant, le cookie auto-login est aussi efface cote client.

## 6. Models et persistance

### `models/db.js`

Role:
Fournit la connexion SQLite, les wrappers SQL, les migrations et l'initialisation complete de la base.

Variables structurantes:

- `databaseDirectory`
- `databasePath`
- `activerDonneesExemple`
- `matieresParDefaut`
- `comptesParDefaut`
- `tarifsComptesParDefaut`
- `db`: instance `sqlite3.Database`

Helpers bas niveau:

- `obtenirTarifHoraireCompteParDefaut(compte)`: fallback de tarif par nom de compte.
- `run(sql, params)`: wrapper promesse pour `db.run`.
- `get(sql, params)`: wrapper promesse pour `db.get`.
- `all(sql, params)`: wrapper promesse pour `db.all`.
- `fermerBaseDeDonnees()`: ferme proprement la connexion.
- `ajouterJours(dateReference, nombreDeJours)` et `formaterDate(date)`: utilitaires de seed.

Helpers historique legacy:

- `trierObjetRecursivement(valeur)`
- `calculerHashHistorique(entree)`: HMAC SHA-256 de l'entree.
- `construireListeCreationHistorique(seance)`: ancien helper de diff creation.

Migrations schema `seances`:

- `ajouterColonneCompteSiNecessaire()`: ajoute `compte` et remplit les vides par `Abdo`.
- `ajouterColonneEssaiSiNecessaire()`: ajoute `est_essai` et le force a `0` si null.
- `ajouterColonneParentSiNecessaire()`: ajoute `parent`.
- `ajouterColonneUtilisateurIdSiNecessaire()`: ajoute `utilisateur_id`.
- `ajouterColonnesSeancesSystemeSiNecessaire()`: ajoute `duree_minutes`, timestamps, `revision`, `deleted_at`, `deleted_by`, puis retro-calcule les donnees manquantes.

Migrations schema `utilisateurs`:

- `ajouterColonnesSecuriteUtilisateursSiNecessaire()`: ajoute tous les champs de droits, version de session, blocage, horodatage, tarif, creation.
- `normaliserRolesUtilisateurs()`: force Hossam comme admin et lui donne tous les droits annexes.

Migrations schema `indisponibilites`:

- `ajouterColonneJourCompletIndisponibilitesSiNecessaire()`
- `ajouterColonnesIndisponibilitesSystemeSiNecessaire()`: ajoute `cree_par`, timestamps et recopie eventuellement l'ancien `utilisateur_id`.

Migrations catalogue et push:

- `ajouterColonneCreatedAtCatalogueSiNecessaire()`
- `ajouterColonneTarifHoraireCatalogueSiNecessaire()`: tente d'aligner les tarifs du catalogue avec les anciens utilisateurs puis avec les defaults.
- `ajouterColonnesPushSubscriptionsSiNecessaire()`
- `ajouterColonnesJournalAuthSiNecessaire()`: gere aussi la reprise de colonnes legacy `ip_adresse` et `details`.

Migrations de contenu:

- `synchroniserHistoriqueActionsSiNecessaire()`: copie les anciennes lignes `historique` vers `historique_actions` si la table moderne est vide.
- `marquerComptesTemporairesCommeASecuriser()`: detecte les hashes correspondant a `123456` et force `doit_changer_mot_de_passe`.
- `normaliserSeancesExistantes()`: harmonise noms de matieres, comptes, descriptions legacy, statut paiement et titre.
- `initialiserCatalogueParDefaut()`: injecte les matieres/comptes par defaut.
- `synchroniserCatalogueDepuisSeances()`: enrichit le catalogue a partir des valeurs deja presentes en base, sauf celles marquees comme supprimees dans `catalogue_options_supprimees`.
- `initialiserUtilisateursInitiaux()`: cree Hossam et Abdo si la table est vide.
- `normaliserNomsUtilisateurs()`: remplace `Ami` par `Abdo`.
- `normaliserEmailsUtilisateurs()`: remplace `ami@test.com` par `abdo@test.com` si possible.
- `initialiserSeancesExemple()`: seed optionnel active seulement si `SEED_DEMO_DATA=true` hors prod.

Fonction principale:

- `initialiserBaseDeDonnees()`: cree toutes les tables, les index, applique les migrations dans un ordre tres precis, injecte les comptes initiaux, sync le catalogue et, si demande, charge les seances d'exemple.

Tables creees ici:

- `utilisateurs`
- `seances`
- `indisponibilites`
- `historique`
- `historique_actions`
- `photos` (legacy, lecture/nettoyage uniquement)
- `catalogue_options`
- `catalogue_options_supprimees`
- `journal_auth`
- `sessions`
- `blocked_ips`
- `trusted_devices`
- `public_reservation_devices`
- `push_subscriptions`

Note importante:

- la colonne `seances.public_reservation_device_id` existe pour compatibilite avec une possible reservation publique reactivee
- les routes publiques actuelles restent en lecture seule et ne creent pas de seance

### `models/utilisateur.model.js`

Role:
Acces SQL aux utilisateurs.

Fonctions:

- `normaliserEmailUtilisateur(email)`: centralise l'alias `ami@test.com` -> `abdo@test.com`.
- `trouverUtilisateurParEmail(email)`: version complete avec hash mot de passe et droits.
- `trouverUtilisateurParNom(nom)`: version sans hash, utile cote admin.
- `trouverUtilisateurParNomOuEmail(identifiant)`: charge par nom ou email pour le login.
- `trouverUtilisateurParId(id)`: charge un profil sans hash.
- `trouverUtilisateurAvecMotDePasseParId(id)`: charge un profil avec hash.
- `creerUtilisateur(payload)`: insertion SQL avec droits explicites.
- `mettreAJourMotDePasseUtilisateur(id, motDePasseHash)`: change le hash, incremente `session_version` et retire l'etat temporaire.
- `reinitialiserMotDePasseUtilisateur(id, motDePasseHash)`: change le hash mais remet `doit_changer_mot_de_passe=1`.
- `mettreAJourEtatConnexionReussie(id, adresseIp)`: reset les echecs et memorise dernier login.
- `mettreAJourEtatEchecConnexion(id, nouvelEtat)`: persiste compteurs et blocage.
- `listerCompteUtilisateurs()`: listing simple de tous les comptes.

### `models/seance.model.js`

Role:
Acces SQL aux seances.

Variable:

- `requeteSeanceComplete`: projection riche avec createur, modificateur et `nombre_photos`.

Fonctions:

- `listerToutesLesSeances(utilisateurId)`: listing global ou filtre.
- `listerSeancesPourMonetisation(utilisateurId)`: projection plus legere pour les calculs financiers.
- `trouverSeanceParId(id, utilisateurId)`: lecture par id.
- `trouverSeanceCompteChevauchante(...)`: detecte les conflits horaires sur un meme compte.
- `creerSeance(donneesSeance)`: insert puis relit.
- `mettreAJourSeance(id, donneesSeance, utilisateurId)`: update complet puis relit.
- `mettreAJourStatutSeance(id, statutSeance, acteurId, utilisateurId)`: update cible.
- `supprimerSeance(id, utilisateurId)`: delete direct.

### `models/indisponibilite.model.js`

Role:
Acces SQL aux indisponibilites.

Variable:

- `requeteIndisponibiliteComplete`: projection enrichie du createur.

Fonctions:

- `listerToutesLesIndisponibilites()`
- `trouverIndisponibiliteParId(id)`
- `creerIndisponibilite(payload)`
- `supprimerIndisponibilite(id)`
- `trouverIndisponibiliteChevauchante(...)`: detecte le chevauchement horaire.

### `models/catalogue.model.js`

Role:
Gere les matieres et comptes autorises. Les suppressions creent une trace dans `catalogue_options_supprimees` pour que les anciennes valeurs ne reviennent pas au redemarrage depuis les seances historiques.

Variables:

- `typesCatalogueAutorises`
- `tarifsHorairesParDefautComptes`

Fonctions:

- `normaliserTypeCatalogue(type)`
- `normaliserValeurCatalogue(valeur)`
- `obtenirTarifHoraireCatalogueParDefaut(type, valeur)`
- `listerValeursCatalogueParType(type)`
- `listerCatalogueOptions()`
- `trouverValeurCatalogue(type, valeur)`
- `trouverValeurCatalogueParId(id)`
- `ajouterValeurCatalogue(type, valeur)`
- `mettreAJourTarifHoraireCompteCatalogue(id, tarifHoraire)`
- `compterUtilisationValeurCatalogue(type, valeur)`
- `supprimerValeurCatalogueParId(id)`: supprime du catalogue actif apres avoir enregistre la valeur comme volontairement supprimee.

### `models/historique.model.js`

Role:
Maintient l'historique moderne et son integrite.

Variables:

- `secretHistorique`: secret HMAC obtenu via `audit-secret`.

Fonctions utilitaires:

- `trierObjetRecursivement`
- `serialiserDetails(details)`
- `calculerHashEntree(entree)`
- `lireDetailsJson(detailsJson)`
- `transformerEntreeHistorique(entree, integriteValide)`
- `estHeureHistoriqueValide(heure, options)`
- `calculerDureeMinutesSeanceHistorique(seance)`
- `calculerMinutesDepuisHeure(heure)`
- `construireSnapshotSeanceHistorique(seance)`
- `enrichirDetailsAvecSeance(details, snapshotSeance)`

Fonctions metier:

- `detacherSeancesHistorique(seances)`: detache une ou plusieurs seances supprimees de l'historique, injecte leur snapshot dans `details_json`, met `seance_id` a `NULL` et rechaine tous les hashes.
- `recupererDernierHashHistorique()`
- `creerEntreeHistorique(payload)`
- `listerEntreesHistoriqueBrutes(limit)`
- `trouverEntreeHistoriqueParId(id)`
- `construireCarteIntegriteHistorique(entreesLimitee)`: recalcule toute la chaine jusqu'aux ids requis.
- `listerEntreesHistorique(limit)`
- `recupererEntreeHistoriqueDetail(id)`
- `supprimerEntreeHistoriqueParId(id)`: supprime une ligne puis recalcule les hashes des suivantes dans une transaction.

### `models/journal-auth.model.js`

Role:
Conserve l'audit d'authentification et des actions admin.

Fonctions:

- `enregistrerEvenementAuth(payload)`: insertion en base, avec `details_json` optionnel.
- `listerJournalAuth(limite)`: lecture enrichie avec nom/email utilisateur.
- `supprimerAncienJournal(jours)`: purge agee.

### `models/admin.model.js`

Role:
Fournit les operations de persistance avancee pour l'administration.

Helpers:

- `normaliserCleCompte(utilisateur)`: convertit les comptes speciaux en cles stables.
- `normaliserUtilisateurAdministration(utilisateur)`: ajoute la `cle`.
- `parserSessionBrute(sessionEnregistree, sessionCouranteSid)`: decode le JSON `sess` et produit une vue admin lisible.

Comptes:

- `listerComptesAdministration()`
- `trouverCompteParId(utilisateurId)`
- `trouverCompteParCle(cleCompte)`
- `trouverCompteParEmail(email)`
- `mettreAJourAccesCompte(utilisateurId, accesActive)`: incremente `session_version` pour invalider les sessions.
- `mettreAJourLectureSeuleCompte(utilisateurId, modeLectureSeule)`
- `mettreAJourAccesMonetisationCompte(utilisateurId, peutVoirMonetisation)`
- `mettreAJourTarifHoraireCompte(compteCatalogueId, tarifHoraire)`: delegue au catalogue.
- `mettreAJourAccesAujourdhuiCompte(utilisateurId, peutVoirAujourdhui)`
- `mettreAJourAccesIndisponibilitesCompte(utilisateurId, peutVoirIndisponibilites)`

Sessions:

- `listerSessionsActives(sessionCouranteSid)`: parse les sessions non expirees.
- `revoquerSession(sid)`
- `revoquerSessionsUtilisateur(utilisateurId, options)`: parse les sessions une a une et les ferme si elles appartiennent au bon utilisateur.

Purge:

- `supprimerTousLesScreenshotsStockes()`: vide `storage/uploads` pour nettoyer les anciens fichiers associes.
- `supprimerToutesLesSeances()`: detache l'historique, supprime les seances, puis supprime physiquement les anciens fichiers associes.
- `supprimerToutHistorique()`: vide historique et audit auth.

Catalogue:

- `recupererCatalogueAdministration()`
- `trouverElementCatalogue(type, valeur)`
- `ajouterElementCatalogue(type, valeur)`
- `trouverElementCatalogueParId(elementId)`
- `compterUtilisationElementCatalogue(type, valeur)`
- `supprimerElementCatalogue(elementId)`: retire uniquement l'element du catalogue actif; les seances deja creees gardent leur texte `matiere`/`compte`.

Suppression utilisateur:

- `supprimerUtilisateurAdministration(utilisateurId, utilisateurRemplacementId)`: operation transactionnelle qui reattribue `cree_par`, `modifie_par`, detache `utilisateur_id`, anonymise l'historique et l'audit, ferme les sessions et supprime l'utilisateur.

### `models/photo.model.js`

Role:
Acces SQL aux anciens fichiers associes.

Fonctions:

- `recupererPhotosParSeance(seanceId)`
- `trouverPhotoParId(photoId)`

### `models/session.store.js`

Role:
Implemente un store `express-session` adosse a SQLite.

Classe:

- `SQLiteSessionStore extends session.Store`

Methodes:

- `constructor(options)`: demarre un timer de nettoyage.
- `calculerExpiration(sessionData)`: deduit l'expiration depuis `cookie.expires` ou `cookie.maxAge`.
- `supprimerSessionsExpirees()`: delete SQL.
- `get(sid, callback)`: charge, verifie expiration, parse le JSON `sess`.
- `set(sid, sessionData, callback)`: `INSERT ... ON CONFLICT`.
- `destroy(sid, callback)`: suppression simple.
- `touch(sid, sessionData, callback)`: repousse l'expiration.

### `models/session.model.js`

Role:
Expose quelques lectures et suppressions de sessions.

Fonctions:

- `listerToutesLesSessions()`
- `trouverSessionParId(sid)`
- `supprimerSession(sid)`
- `supprimerSessionsUtilisateur(utilisateurId)`: methode legacy approximate basee sur `LIKE` dans le JSON.
- `compterSessionsActives()`

### `models/session-secret.js`

Role:
Genere ou lit le secret de session stocke sur disque.

Fonction:

- `recupererSecretSession()`: priorite a `SESSION_SECRET`, sinon fichier `database/.session-secret`.

### `models/audit-secret.js`

Role:
Genere ou lit le secret HMAC de l'historique.

Fonction:

- `recupererSecretAudit()`: priorite a `AUDIT_SECRET`, sinon fichier `database/.audit-secret`.

### `models/push-secret.model.js`

Role:
Gere les clefs VAPID du push.

Variables:

- `vapidPath`: `database/.push-vapid-keys.json`

Fonctions:

- `lireJsonDepuisFichier(chemin)`
- `recupererClesPushVapid()`: priorite aux variables d'env, sinon lecture ou generation du fichier local.

### `models/push-subscription.model.js`

Role:
Persiste les abonnements push navigateur.

Helpers:

- `normaliserTexte`
- `normaliserEndpoint`
- `normaliserSubscriptionPush(subscription)`: valide `endpoint`, `p256dh`, `auth`.
- `construireAbonnementNavigateur(row)`: reconstruit le format attendu par `web-push`.

Fonctions:

- `enregistrerOuMettreAJourAbonnementPush(...)`: insertion ou reactivation idempotente par `endpoint`.
- `trouverAbonnementPushParEndpoint(endpoint)`
- `trouverAbonnementPushActifUtilisateurParEndpoint(utilisateurId, endpoint)`
- `desactiverAbonnementPushParEndpoint(endpoint)`
- `desactiverAbonnementPushParId(id)`
- `listerAbonnementsPushActifs()`: joint aussi les droits utilisateur utiles aux rappels.
- `marquerAbonnementPushCommeUtilise(id)`
- `marquerRappelJourEnvoye(id, cleRappel)`

### `models/trusted-device.model.js`

Role:
Gere la connexion automatique par appareil de confiance.

Helpers cryptographiques:

- `hacherValidator(validator)`
- `genererSelector()`
- `genererValidator()`
- `analyserCookieAppareil(valeur)`
- `construireValeurCookieAppareil(selector, validator)`

Helpers de libelle:

- `detecterPlateforme(userAgent)`
- `detecterNavigateur(userAgent)`
- `construireLibelleAppareil(userAgent)`

Fonctions:

- `trouverAppareilAutoLoginParSelector(selector)`
- `trouverAppareilAutoLoginParId(id)`
- `creerAppareilAutoLogin({ utilisateurId, sessionVersion, adresseIp, userAgent })`: tente jusqu'a 5 fois pour eviter une collision `selector`.
- `renouvelerAppareilAutoLogin(appareilId, contexte)`: rotate le validator sans changer le selector.
- `supprimerAppareilAutoLoginParId(id)`
- `supprimerAppareilAutoLoginParSelector(selector)`
- `supprimerAppareilsAutoLoginUtilisateur(utilisateurId)`
- `listerAppareilsAutoLogin()`

### `models/ip-blocklist.model.js`

Role:
Acces a la blacklist IP.

Fonctions:

- `listerIpsBloquees()`
- `estIpBloquee(ip)`
- `bloquerIp(ip, raison, utilisateurId)`
- `debloquerIp(ip)`

### `models/public-reservation-device.model.js`

Role:
Modele dormant pour memoriser un appareil public de reservation.

Fonctions:

- `genererTokenPublic()`
- `genererTokenPublicUnique()`
- `trouverAppareilReservationPubliqueParToken(tokenPublic)`
- `creerAppareilReservationPublique({ etudiantNom, parentNom })`
- `trouverAppareilReservationPubliqueParId(id)`
- `mettreAJourProfilAppareilReservationPublique(id, profil)`
- `mettreAJourDerniereUtilisationAppareilReservationPublique(id)`

Important:

- ce modele n'est pas branche dans le flux public actuel
- la table correspondante n'est pas creee par `models/db.js`

## 7. Utilitaires

### `utils/security.js`

Role:
Outils de politique mot de passe.

Variables:

- `minuscules`, `majuscules`, `chiffres`, `caracteresSpeciaux`, `tousLesCaracteres`

Fonctions:

- `choisirCaractereAleatoire(caracteres)`
- `melangerCaracteres(caracteres)`
- `motDePasseRespectePolitique(motDePasse)`: au moins 12 caracteres avec minuscule, majuscule, chiffre, caractere special.
- `genererMotDePasseAleatoire(longueur)`: genere un mot de passe conforme.

### `utils/timezone.js`

Role:
Convertit des dates/heures entre fuseaux sans bibliotheque externe.

Fonctions:

- `obtenirFormateur(timeZone)`: cree un `Intl.DateTimeFormat` stable.
- `extraireParties(dateObjet, timeZone)`: extrait annee, mois, jour, heure, minute, seconde.
- `convertirDateHeureZonneeEnInstant(dateIso, heure, timeZone)`: calcule un instant UTC correspondant a une date/heure locale donnee.
- `convertirInstantEnDateHeureZonnee(dateObjet, timeZone)`: operation inverse.
- `convertirDateHeureEntreFuseaux(dateIso, heure, fuseauSource, fuseauCible)`: pont entre deux fuseaux.

### `utils/screenshot-storage.js`

Role:
Encapsule le stockage legacy des anciens fichiers associes.

Variables:

- `storageUploadsDirectory`
- `legacyPublicUploadsDirectory`

Fonctions:

- `assurerDossiersScreenshots()`
- `extraireNomFichierScreenshot(photoOuChemin)`
- `construireCheminPriveDepuisNom(nomFichier)`
- `construireCheminPublicLegacyDepuisNom(nomFichier)`
- `fichierExiste(chemin)`
- `deplacerFichier(source, destination)`
- `migrerScreenshotVersStockagePrive(photo)`: support de migration legacy `public/uploads` -> `storage/uploads`.
- `resoudreCheminScreenshot(photo)`: trouve le fichier dans le stockage prive ou legacy.

### `utils/realtime.js`

Role:
Bus SSE en memoire.

Variable:

- `clientsTempsReel`: `Set` de clients actifs.

Fonctions:

- `ecrireEvenement(client, eventName, data)`: ecrit un bloc SSE.
- `ajouterClientTempsReel({ res, utilisateurId, public, scopes })`
- `retirerClientTempsReel(client)`
- `configurerHeartbeatClient(client, intervalMs)`: envoie des `ping`.
- `diffuserMiseAJourApplication(payload)`: envoie `app-updated` a tous les clients, avec payload complet pour les clients prives et payload reduit pour les clients publics.

### `utils/realtime-route.js`

Role:
Relie une mutation HTTP au bus SSE et aux notifications push.

Fonctions:

- `valeurBooleenneActive(valeur)`: helper pour `jour_complet`.
- `determinerActionTempsReel(req, scope, reponseJson)`: infere une action semantique comme `seance_added`, `unavailability_deleted`, `history_updated`, etc.
- `notifierMiseAJourApplication(controller, scope)`: wrapper de controleur qui capture `res.json`, puis diffuse SSE et push si la reponse finale est un succes HTTP.

### `utils/push-notifications.js`

Role:
Service central des notifications push.

Variables:

- `webPushConfigure`: evite de reconfigurer `web-push`
- `rappelInterval`: timer du scheduler en memoire

Configuration:

- `configurerWebPush()`: charge les clefs VAPID et appelle `webpush.setVapidDetails`.
- `recupererClePubliqueVapid()`

Helpers de texte/date:

- `normaliserTexte`
- `normaliserCleCompte`
- `convertirHeureEnMinutes`
- `formaterDateLocale(date)`
- `extrairePartiesDate(date, timeZone)`
- `construireDateMilieuJour(partiesDate)`

Push evenementiel:

- `construireMessagePushEvenement(payload)`
- `evenementDoitDeclencherPush(payload)`
- `envoyerNotificationAbonnement(abonnementLigne, notification, options)`: gere aussi la desactivation auto des endpoints morts.
- `notifierEvenementApplicationPush(payload)`: envoie le push a tous les abonnements actifs sauf a l'acteur ayant provoque l'action.

Rappels "Aujourd'hui":

- `utilisateurPeutRecevoirRappelAujourdhui(utilisateur)`
- `seanceEstConfidentiellePourUtilisateur(utilisateur, seance)`
- `indisponibiliteChevaucheSeance(indisponibilite, seance)`
- `seanceDoitEtreMasqueeDansAujourdhui(utilisateur, seance, indisponibilites)`
- `obtenirSeancesProgrammeesPourUtilisateur(utilisateur, seances, indisponibilites, dateKey)`
- `obtenirSeancesRestantesAujourdhuiPourUtilisateur(utilisateur, seances, indisponibilites, partiesDate)`
- `construireNotificationRappel(seances, partiesDate)`
- `construireNotificationResumeMinuit(seances, partiesDate)`
- `envoyerResumeMinuitSiNecessaire()`
- `envoyerRappelsSeancesDuJourSiNecessaire()`
- `envoyerNotificationTestAbonnement(abonnementLigne)`
- `executerRappelsPushDus()`
- `demarrerPlanificateurRappelsPush()`

### `utils/seances-backup-email.js`

Role:
Genere les CSV de backup et envoie l'email.

Variables:

- `backupTimer`
- `backupEnCours`
- `colonnesBackupSeances`: ordre et mapping des colonnes CSV

Fonctions:

- `echapperCsv(valeur)`
- `convertirSeancesEnCsv(seances)`
- `obtenirDateLocaleBackup(date)`
- `obtenirNomFichierBackup(date)`
- `genererFichierBackupSeances(options)`: charge toutes les seances, ecrit le fichier CSV.
- `smtpEstConfigure()`
- `creerTransportSmtp()`
- `envoyerBackupSeancesParEmail(backup)`
- `executerBackupSeancesEmail(options)`: combine generation et envoi.
- `calculerProchaineExecution(dateReference)`: calcule la prochaine occurrence dans le fuseau de backup.
- `planifierProchainBackupSeances()`: installe un `setTimeout` unique jusqu'au prochain horaire.
- `demarrerPlanificateurBackupSeances()`

## 8. Scripts

### `scripts/run-push-jobs.js`

Role:
Lance manuellement une passe des rappels push.

Fonction:

- `main()`: initialise la base, execute `executerRappelsPushDus`, ferme la base et quitte avec code `0/1`.

### `scripts/run-seances-backup.js`

Role:
Lance manuellement un backup CSV et affiche un petit JSON de resultat.

Fonction:

- `main()`: initialise la base, execute `executerBackupSeancesEmail`, loggue chemin/nombre de seances/email envoye, ferme la base.

### `scripts/smoke-test.js`

Role:
Test d'integration backend bout en bout.

Variables structurantes:

- `root`
- `port`
- `baseUrl`
- `databasePath`
- `tinyPngPath`

Helpers:

- `sleep(ms)`
- `assert(condition, message)`
- `cleanupPath(target)`
- `waitForServer()`

Classe:

- `SessionClient`: mini client HTTP avec gestion de cookies et token CSRF.
  - `cookieHeader()`
  - `storeCookies(response)`
  - `request(method, pathname, body, extraHeaders)`

Scenario de test:

- demarrage d'un serveur isole sur base SQLite temporaire
- login admin par formulaire
- changement de mot de passe admin
- login utilisateur par alias `ami@test.com`
- changement de mot de passe utilisateur
- activation/desactivation des droits indisponibilites et monetisation
- creation d'indisponibilite
- verification de la confidentialite Hossam
- creation de seances facturables et gratuites
- verification de la page publique et de la conversion de fuseau
- verification que la reservation publique ne cree plus de seance
- verification des stats et du releve PDF de monetisation
- reset de mot de passe puis revocation des sessions utilisateur

### Scripts hors runtime principal

Le depot contient aussi:

- `scripts/e2e-browser-audit.js`
- `scripts/legacy/*`

Ils servent a de l'audit navigateur ou a d'anciens patchs. Ils ne font pas partie du cycle d'execution normal du backend actuel.

## 9. Resume mental du backend

Si tu veux retenir l'essentiel:

- `app.js` orchestre
- `models/db.js` cree et fait evoluer la base
- `middleware/auth.middleware.js` porte la session et les droits
- `controllers/seances.controller.js` porte le coeur metier du calendrier
- `controllers/admin.controller.js` porte les operations sensibles
- `controllers/monetisation.controller.js` porte les calculs financiers et les exports
- `utils/push-notifications.js` et `utils/seances-backup-email.js` gerent les taches planifiees

Le design general est simple mais coherent:

- couches separees
- SQL explicite
- securite raisonnablement serieuse
- confidentialite metier encodee dans les controleurs
- forte compatibilite legacy grace aux migrations au demarrage
