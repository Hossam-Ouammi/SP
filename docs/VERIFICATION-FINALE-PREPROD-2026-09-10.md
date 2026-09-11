# Vérification finale préproduction — 10 septembre 2026

> Périmètre : dépôt présent dans `E:\Projets_Perso\SP`, base SQLite locale en lecture seule, tests isolés et recette Chromium. Les anciennes spécifications ne sont pas considérées comme normatives.
>
> Résultat global : le code testé est cohérent sur ses parcours actifs, mais l’instance examinée ne peut pas être mise en production avant correction de la configuration, des données historiques et des sauvegardes.

## 1. Architecture reconstruite

| Couche | Réalité observée |
| --- | --- |
| Interface | EJS (`views/index.ejs` et `views/reservation.ejs`), JavaScript natif ES modules, CSS unique, FullCalendar. |
| HTTP | Express 5 dans `app.js` ; CSP, compression, limites de taille, sessions SQLite, CSRF/provenance, rate limits. |
| Authentification | Session `express-session` persistée en SQLite, cookie auto-login rotatif, rôles cumulables `super_admin` / `handler` / `professeur`. |
| API | Routes montées sous `/api/auth`, `/account-lifecycle`, `/seances`, `/equipe`, `/indisponibilites`, `/settings`, `/statistiques`, `/monetisation`, `/push`, `/realtime`, `/admin` et `/admin-analytics`. |
| Domaine | Contrôleurs → modèles SQLite → transactions `BEGIN IMMEDIATE` → journal d’historique HMAC → événement SSE/Push lorsque pertinent. |
| Persistance | SQLite unique, schéma legacy initialisé puis migrations versionnées append-only dans `schema_migrations`. |
| Services annexes | Réinitialisation/activation par Nodemailer, Push Web/VAPID, SSE, PDFs Puppeteer, export CSV de séances, maintenance SQLite. |
| Déploiement prévu | PM2 une instance `fork`, Node lié à `127.0.0.1:3000`, reverse proxy HTTPS de confiance avec `TRUST_PROXY=true`. |

Flux principal : `UI → http.js → route Express → authentification/scope/CSRF → contrôleur → modèle SQLite/transaction → historique/SSE/Push → JSON ou PDF → UI`.

## 2. Fonctionnalités réellement présentes

- Connexion, déconnexion, affichage du mot de passe, changement de mot de passe et appareil de confiance.
- Demande de compte, approbation/refus, activation à jeton et récupération de mot de passe à usage unique, plafonnée à 15 minutes.
- Espaces Handler isolés, professeurs rattachés, SuperAdmin global.
- Calendrier central, création par bouton/clic/glisser, règles de plage journalière, séances privées du Handler, indisponibilités personnelles des professeurs.
- Vue « Aujourd’hui », historique signé, statistiques par période ou globales.
- Équipe : professeurs, matières par Handler, grille de tarifs par matière/réalisateur et snapshots de tarif sur les séances.
- Monétisation par période ou globale, plusieurs réalisateurs, relevés PDF.
- Calendrier public tokenisé par Handler, lien stable désactivable, décalage horaire public fixe ; il expose les indisponibilités mais pas les données privées.
- Administration : demandes de comptes, accès, lecture seule, catalogue, sessions, appareils, IP bloquées, maintenance et analyses globales.
- SSE et Web Push authentifiés ; service worker de récupération après déploiement.
- API protégée de consultation de captures historiques de séance. Aucune interface actuelle ne crée de nouvelles captures.

## 3. Contradictions détectées

| Gravité | Contradiction constatée | Conséquence |
| --- | --- | --- |
| P1 | Le code contient les migrations `2026090901` et `2026090902`, mais la base active ne les liste pas encore. | Les tarifs par matière ne sont pas encore matérialisés dans cette DB. |
| P1 | 93 des 96 séances ont `handler_id` mais ni `intervenant_id` ni snapshot de tarif ; les 93 lignes correspondantes sont `a_reconcilier`. | Les répartitions et relevés historiques par réalisateur ne sont pas fiables. |
| P1 | `NODE_ENV=production` est configuré avec des secrets explicites faibles/exemples et un SMTP non résoluble/non valide. | Le nouveau contrôle refuse désormais le démarrage plutôt que d’utiliser une sécurité faible ; l’email réel reste indisponible. |
| P1 | Le répertoire `backups` ne contient pas de sauvegarde complète récente restaurée ; le plus récent fichier observé date du 8 juin 2026. | Une panne ou une migration ratée n’a pas de retour arrière prouvé. |
| P2 | L’UI ne consomme plus disponibilités positives/propositions, mais leurs APIs, tables et tests de compatibilité existent toujours. | Dette legacy et effet métier potentiel pour un client API externe. |
| P2 | L’ancien tarif global `/api/admin/hourly-rate` reste côté serveur alors que l’UI active est fondée sur les tarifs par matière. | Il faut décider s’il reste une compatibilité SuperAdmin ou doit être retiré. |
| P2 | Les artefacts E2E et une DB E2E sont encore suivis par Git, malgré les règles `.gitignore` pour les futures générations. | Historique Git bruyant et risque de committer des sorties de test. |
| P2 | `lost_and_found` contient 309 lignes sans consommateur runtime. | Données de récupération/forensiques à conserver et qualifier avant toute purge. |
| P2 | Les anciens rapports, le contexte IA et les références backend décrivent aussi des APIs legacy. | Ils portent désormais un avertissement d’archive ; le code exécuté reste l’autorité. |

Les anciens rapports marqués « archive historique — non normative » ne sont pas pris comme source de vérité.

## 4. Questions métier nécessitant décision

| ID | Zone | Version A | Version B | Recommandation | Risque si mauvais choix |
| --- | --- | --- | --- | --- | --- |
| Q1 | 93 séances legacy à réconcilier | Attribuer chaque séance au vrai réalisateur et renseigner le tarif historique applicable. | Les déclarer explicitement archivées/ignorées et les exclure des relevés individuels, avec une mention legacy. | A si le propriétaire peut fournir l’attribution et les tarifs ; sinon B documentée. | Mauvaise rémunération, relevé faux ou audit incomplet. |
| Q2 | Compatibilités sans UI | Conserver `/api/disponibilites`, `/api/propositions-seances`, `/api/admin/hourly-rate` et `/api/settings/public-calendar/regenerate` pour des consommateurs externes. | Les déprécier puis retirer proprement après confirmation qu’aucun client externe ne les appelle. | B, mais uniquement après inventaire des consommateurs externes. | Suppression d’une intégration inconnue ou maintien durable de règles contradictoires. |

Aucune décision n’a été prise arbitrairement sur ces deux sujets.

## 5. Backend sans frontend / consommateurs

| Élément | État | Décision actuelle |
| --- | --- | --- |
| `/api/disponibilites` (règles/exceptions positives) | Aucun module UI actuel ne l’appelle ; modèles, migration et tests existent. | Conservé provisoirement, Q2. |
| `/api/propositions-seances` | Aucun menu/UI actuel ; la création est déjà retirée par garde `410`. | Conservé provisoirement pour lecture/compatibilité, Q2. |
| `/api/settings/public-calendar/regenerate` | Ancienne route compatible ; elle garde le lien stable au lieu de le tourner. | Route conservée ; export frontend retiré. |
| `/api/admin/hourly-rate` | Ancien tarif global ; aucune action UI active ne l’atteint. | À décider en Q2. |
| `/api/photos` | Lecture de captures legacy sous scope de séance ; pas de création/UI moderne. | Conservé pour les archives, accès scoppé. |

## 6. Frontend sans backend

Aucun bouton, formulaire ou appel API actif sans route correspondante n’a été confirmé après lecture des imports EJS/UI, test de contrat API et recette navigateur. Le test `frontend-api-contract.test.js` vérifie les flux actifs importants et les formulaires retirés.

L’ancien export `regenererLienCalendrierPublic` a été supprimé de `public/js/workspace-settings.js` : il n’était importé ni utilisé par l’interface.

## 7. Code mort supprimé

| Élément | Ancien rôle | Vérification | Action |
| --- | --- | --- | --- |
| Export frontend de régénération du lien public | Appelait l’ancienne route de compatibilité. | Recherche dans `public`, `views` et imports : aucun consommateur. | Supprimé. |
| `public/js/availability-overview.js` et `public/js/disponibilites.js` | Anciennes vues de disponibilités positives. | Aucun script EJS ni import UI actif ; les références restantes sont des archives. | Déjà retirés dans l’arbre actif, conservés seulement dans l’historique Git. |

Aucune table, migration, capture ou donnée utilisateur n’a été supprimée pendant cette vérification.

## 8. Audit sécurité

### Contrôles présents et vérifiés

| Zone sensible | Contrôle observé |
| --- | --- |
| Authentification | bcrypt 12 rounds, rotation de session à la connexion, version de session, limitation login, suspension/lecture seule côté serveur. |
| Mots de passe | Politique 12+ caractères et rejet explicite au-delà des 72 octets bcrypt ; empêche la troncature silencieuse. |
| Reset/activation | Jetons hashés, usage unique, expiration reset bornée côté modèle à 15 minutes, réponse publique générique, limite 8/15 min. |
| Autorisation | `chargerScopeAcces`, vérifications Handler/Professeur/SuperAdmin et requêtes directes couvertes par les tests d’isolation. |
| CSRF | Jeton de session pour mutation authentifiée, contrôle Origin/Referer et Fetch Metadata ; API directe exige un en-tête explicite. |
| Données publiques | Calendrier public uniquement par token hashé ; URL globale sans token retourne 404. |
| Headers | CSP, `frame-ancestors 'none'`, HSTS sous HTTPS, no-store API, nosniff, COOP/CORP. |
| SSE / Push | SSE authentifié et scoppé ; Push appartient au compte, endpoint validé avant toute sortie réseau, timeout/agent HTTPS. |
| SQL / fichiers | Placeholders SQL, validation d’ID, photo lue uniquement après scope de séance, `sendFile` résolu dans le stockage prévu. |
| Admin | Routes SuperAdmin protégées ; anciens workflows dangereux renvoient `410`. |

### Corrections de cette passe

- Rejet fail-closed des `SESSION_SECRET` et `AUDIT_SECRET` explicitement faibles en production.
- Rejet de toute entrée mot de passe dépassant la limite réelle bcrypt.
- STARTTLS exigé sur SMTP de production lorsqu’il est utilisé ; parsing sûr du port SMTP.
- Validation renforcée d’endpoint Push et simulation exclusivement `NODE_ENV=test` pour la recette.
- Le healthcheck interroge maintenant SQLite et retourne `503` sans divulguer de chemin si la DB est indisponible.

Aucun P0 de sécurité confirmé n’a été trouvé dans le périmètre statique, API isolé et navigateur testé. Cela ne remplace pas un pentest ni une validation de l’hôte Oracle.

## 9. Audit base de données

Contrôle lecture seule de `database/database.db` :

| Contrôle | Résultat |
| --- | --- |
| `PRAGMA integrity_check` | `ok` |
| `PRAGMA foreign_key_check` | 0 violation |
| Séances | 96 au total |
| Séances legacy sans réalisateur/snapshot | 93 |
| Lignes `reconciliation_seances_legacy` à traiter | 93 |
| Schéma actif | 13 migrations jusqu’à `2026090803` |

Groupes utilisés : utilisateurs/rôles/rattachements, séances/indisponibilités, historique HMAC, sessions/appareils, Push/calendrier public et demandes/jetons.

`lost_and_found` n’est référencée par aucun code. Ses 309 lignes se répartissent sur les pages racines correspondant à `trusted_devices` (306) et `sessions` (3), ce qui ressemble à un artefact SQLite de récupération. Il faut faire une copie chiffrée, documenter son origine, puis décider son archivage ou sa suppression.

Le fichier `database.db.backup-corrupt` est effectivement corrompu (index de sessions incohérent) : ne jamais l’utiliser pour une restauration.

## 10. Audit migrations

Les migrations sont append-only, enregistrées dans `schema_migrations` et chacune est exécutée dans une transaction `BEGIN IMMEDIATE`.

- 15 migrations existent dans le code, de `2026090701_multi_handler_foundation` à `2026090902_normalize_handler_subject_keys`.
- La DB active n’a appliqué que les 13 premières.
- Sur une copie temporaire de la DB active, les migrations `0901` et `0902` se sont appliquées avec succès.
- La copie mise à niveau contient `matieres_handler` et `tarifs_realisateur_matiere`, 11 matières et 23 versions de tarif ; intégrité `ok`, 0 FK.

Ne modifiez jamais une migration déjà appliquée. Faites la mise à niveau de production uniquement après sauvegarde complète et test de la copie.

## 11. Audit frontend/backend

- `ui.js` orchestre les modules de domaine ; `http.js` remonte les erreurs HTTP ; le bootstrap ne laisse plus l’UI bloquée après une erreur de connexion.
- Les parcours UI vont vers des routes réellement montées, vérifiés statiquement par `frontend-api-contract.test.js`.
- La navigation de chaque rôle visible est cliquée pendant l’E2E ; aucune erreur console/pageerror n’est acceptée dans le scénario Push.
- Le Dashboard Handler utilise le calendrier unifié, sans ancien filtre disponibilité/séances.
- L’UI applique des nœuds DOM/`textContent` pour les données utilisateur examinées ; les `innerHTML` restants servent principalement aux templates constants et options contrôlées.

Dette maintenabilité P2 : `public/js/ui.js` est très volumineux ; il mérite une découpe progressive par écran, sans réécriture risquée avant le lancement.

## 12. Audit design / UX

Inspection visuelle réelle effectuée sur :

- Dashboard desktop 1440 px ;
- Monétisation desktop ;
- Monétisation mobile 390 px ;
- login/reset, navigation, statistiques, équipe, calendrier, administration et Push parcourus par l’E2E.

Résultats : structure de cartes, boutons primaires, formulaires et calendrier sont cohérents. Les résultats de statistiques/monétisation restent masqués avant « Calculer », les sélectionneurs de réalisateurs sont des listes déroulantes et le relevé apparaît après calcul.

Correction UX réalisée : à l’ouverture d’une section sur mobile, l’onglet actif est maintenant centré dans la barre horizontale ; l’E2E échoue si l’onglet actif est coupé.

## 13. Audit responsive / accessibilité

| Vérification | Résultat |
| --- | --- |
| Desktop 1440 px | Dashboard et monétisation rendus sans erreur. |
| Desktop 1366 px Professeur | navigation, calendrier et monétisation personnelle testés. |
| Mobile 390 px | onglet actif entièrement dans la barre horizontale, formulaire monétisation lisible. |
| Clavier / focus | boutons, labels et modales sont présents dans les parcours testés ; validation exhaustive lecteur d’écran non réalisée. |
| Couleurs | indisponibilités et statuts ont un texte/état associé ; contrôle de contraste automatisé non exécuté. |

À refaire manuellement sur un téléphone réel : calendrier dense, clavier virtuel, zoom 200 %, lecteur d’écran et navigateur Safari/Android.

## 14. Audit performance

- SQLite est appropriée pour l’architecture déclarée **monoprocessus** ; les écritures critiques passent par transactions/sérialisation locale.
- Les index de scope, date, indisponibilité, sessions et migrations existent dans le schéma.
- Le PDF est généré côté serveur avec une limite de concurrence ; le Push limite sa concurrence et son timeout.
- Aucun benchmark de charge, test de milliers de séances, ni test SSE à grande échelle n’a été exécuté.
- Risques P2 : gros module `ui.js`, calendrier FullCalendar volumineux et SQLite si plusieurs processus/VM écrivent la même DB.

## 15. Audit dépendances / versions

- Environnement de vérification : Node `v24.18.0`, npm `12.0.1`.
- `npm audit --omit=dev --json` : **0 vulnérabilité** (171 dépendances production, 209 total).
- Mises à jour mineures disponibles : FullCalendar 6.1.21, dotenv 17.4.2, EJS 5.0.2, express-rate-limit 8.7.0, Nodemailer 10.0.3.
- FullCalendar core 7 est une montée majeure : ne pas l’appliquer sans recette.
- `package.json` ne fixe pas encore une plage `engines.node` : documenter/pinner la version réellement installée sur Oracle avant déploiement.

## 16. Audit infrastructure

- `ecosystem.config.js` prévoit une seule instance PM2 `fork`, `HOST=127.0.0.1` et `TRUST_PROXY=true` : c’est cohérent **uniquement** derrière un reverse proxy HTTPS maîtrisé.
- Node ne doit jamais être exposé directement si `TRUST_PROXY=true`, sinon les en-têtes forwarded peuvent fausser la sécurité/cookie.
- La configuration locale déclarée production a un SMTP qui échoue en DNS (`ENOTFOUND`), port/secure textuels invalides et secrets de session/audit faibles.
- Les clés VAPID ne sont pas dans l’environnement observé ; l’application peut dépendre de `database/.push-vapid-keys.json`. Ce fichier doit alors être persistant et sauvegardé chiffré.
- L’accès à l’Oracle réel, au reverse proxy, aux certificats et au gestionnaire de secrets n’était pas disponible dans cet environnement : aucune conclusion sur leur état réel n’est possible.

## 17. Backup / restauration

Le script `npm run backup:seances` exporte des séances CSV et tente un email. Ce n’est **pas** une sauvegarde complète de production.

Une sauvegarde restaurable doit inclure :

1. la DB SQLite cohérente (via `.backup` SQLite, pas une simple copie de fichier en écriture) ;
2. `storage/uploads` et captures historiques nécessaires ;
3. `database/.session-secret`, `database/.audit-secret` et `database/.push-vapid-keys.json` si ces secrets ne sont pas en gestionnaire externe ;
4. la configuration non secrète, la version Node/package-lock et le manifeste de restauration.

Le dossier local de backups est ancien et aucune restauration complète réussie n’est documentée. C’est un blocage P1.

## 18. Corrections effectuées

| Correction | Preuve associée |
| --- | --- |
| Secrets faibles explicitement configurés refusés en production. | `production-secret-validation.test.js`. |
| Limite bcrypt 72 octets appliquée à connexion/changement/admin. | `password-security.test.js`. |
| SMTP : fallback de port cohérent, STARTTLS obligatoire en production, boîte de développement explicite uniquement en dry-run. | `smtp-tls-security.test.js` et `account-email-configuration.test.js`. |
| Reset E2E vérifie réellement l’email isolé, son destinataire, son objet et le lien à jeton. | `e2e-browser-audit.js`. |
| Push E2E déterministe sans désactiver la livraison production. | activation 201, test 200, mode `mock-test-only`. |
| Healthcheck SQLite réel. | réponse `ok` sur recette ; `503` prévu en cas d’échec DB. |
| Onglet mobile actif centré et assertion de visibilité. | recette Chromium mobile verte. |
| Export frontend mort de régénération du lien public supprimé. | contrat frontend mis à jour. |
| Archives techniques vieillies marquées non normatives. | entêtes dans les rapports/changelog concernés. |

## 19. Tests exécutés et résultats réels

| Commande / contrôle | Résultat réel |
| --- | --- |
| `npm test` | **31 / 31 tests réussis**. |
| `node scripts/e2e-browser-audit.js` | **réussi**, login/reset, navigation des rôles, Dashboard clic/glisser, statistiques, monétisation, PDF, isolation Professeur, Push et mobile. |
| `npm audit --omit=dev --json` | 0 vulnérabilité connue. |
| Analyse syntaxique | 145 fichiers CommonJS + 14 modules navigateur valides. |
| `git diff --check` | réussi (avertissements CRLF seulement, aucune erreur de whitespace). |
| DB active en lecture seule | integrity `ok`, 0 violation FK ; migrations en retard détectées. |
| Migration sur copie | `0901`/`0902` appliquées, 11 matières / 23 tarifs, integrity `ok`. |
| Résumés PDF UI/direct | HTTP 200, `application/pdf`, signature `%PDF` pour période, annuelle et globale. |

## 20. Tests impossibles dans l’environnement

- Réception réelle d’email depuis l’Oracle vers une boîte contrôlée.
- Livraison Push par un fournisseur externe sur un téléphone/navigateur de production.
- HTTPS, Caddy/Nginx, firewall, DNS et `TRUST_PROXY` de l’Oracle.
- Restauration d’une sauvegarde provenant de la production réelle.
- Charge concurrente réelle, Safari/iOS, lecteur d’écran réel.
- Le navigateur intégré de l’environnement Codex n’était pas connectable (client local requis absent). La recette Puppeteer isolée du projet a néanmoins été exécutée avec succès.

## 21. Checklist manuelle pour le propriétaire

- [ ] Générer et installer deux secrets aléatoires forts, puis vérifier que l’application démarre.
- [ ] Configurer le vrai SMTP et recevoir un email de reset dans une boîte contrôlée.
- [ ] Vérifier qu’un second clic reset ne crée pas un second lien, puis que le lien échoue après usage et après 15 minutes.
- [ ] Tester création/approbation/activation d’un compte réel.
- [ ] Tester Handler, Professeur et SuperAdmin sur deux espaces distincts.
- [ ] Vérifier le calendrier : clic, glisser, indisponibilité Professeur, séance privée Handler, collision visuelle.
- [ ] Changer un tarif de matière puis vérifier qu’une séance passée garde son snapshot.
- [ ] Vérifier statistiques/monétisation période et global, puis ouvrir les trois PDFs.
- [ ] Vérifier calendrier public avec lien actif, lien désactivé et décalage horaire.
- [ ] Tester logout, reset password, révocation de session et appareil de confiance.
- [ ] Vérifier Push sur HTTPS avec permission navigateur réelle.
- [ ] Restaurer une sauvegarde complète sur une machine isolée et exécuter `PRAGMA integrity_check`.
- [ ] Relire les 93 séances à réconcilier et décider Q1.
- [ ] Vérifier que Node n’est joignable que depuis le reverse proxy.

## 22. Problèmes restant ouverts

| Priorité | Élément | Statut |
| --- | --- | --- |
| P1 | SMTP/DNS/port/secure/identifiants réels | non configuré ou invalide dans l’environnement inspecté. |
| P1 | Secrets `SESSION_SECRET` et `AUDIT_SECRET` | valeurs explicites faibles ; démarrage volontairement bloqué jusqu’à correction. |
| P1 | Migration active `0901/0902` | testée sur copie, non appliquée à la DB active. |
| P1 | 93 séances legacy | décision Q1 et réconciliation/archivage requis. |
| P1 | Backup/restauration | aucune sauvegarde complète récente et restaurée. |
| P1 | `lost_and_found` et backup corrompu | conserver/analyser, ne pas purger/restaurer aveuglément. |
| P1 | Oracle/proxy/HTTPS | non vérifié depuis ce workspace. |
| P2 | APIs legacy / tarif global | décision Q2 requise. |
| P2 | VAPID seulement local | déplacer vers gestionnaire de secrets ou sauvegarder chiffré. |
| P2 | Artefacts E2E suivis dans Git | retirer de l’index dans une action Git revue séparément. |
| P2 | Découpage UI et tests de charge | amélioration après mise en ligne contrôlée. |

## 23. Ce que le propriétaire doit faire avant production

1. **Ne déployez pas encore.** Copiez la DB actuelle et les fichiers associés dans un emplacement chiffré.
2. Générez deux secrets différents : `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Placez les sorties dans `SESSION_SECRET` et `AUDIT_SECRET` du gestionnaire de secrets / `.env`. Ne les affichez pas dans Git ni dans un ticket.
3. Remplacez toutes les valeurs SMTP d’exemple par le serveur, port, mode TLS et mot de passe d’application fournis par votre fournisseur. Gardez `ACCOUNT_EMAIL_DRY_RUN=false` en production.
4. Sur une **copie** de la DB, démarrez cette version ; elle appliquera automatiquement `0901` et `0902`. Vérifiez le schéma et les données avant de toucher la production.
5. Traitez Q1 : fournir le mapping séance → réalisateur + tarif historique, ou signer une décision d’archivage/exclusion.
6. Mettez en place une vraie sauvegarde SQLite/fichiers/secrets et réalisez une restauration complète testée.
7. Vérifiez Oracle : reverse proxy HTTPS, certificat, firewall, Node localhost seulement, une seule instance PM2/SQLite.
8. Après mise à jour de configuration, faites les tests manuels de la section 21 avec une boîte email et un appareil réels.

## 24. Commandes finales de déploiement

À exécuter d’abord sur une préproduction/copie, puis seulement après validation sur Oracle :

```bash
npm ci
npm test
node scripts/e2e-browser-audit.js
npm audit --omit=dev
```

Sauvegarde SQLite cohérente avant migration (adapter les chemins, ne pas exposer les secrets) :

```bash
install -d -m 700 /srv/gestion-seances/backups/$(date -u +%F)
sqlite3 "$DATABASE_PATH" ".backup '/srv/gestion-seances/backups/$(date -u +%F)/database.db'"
sqlite3 "/srv/gestion-seances/backups/$(date -u +%F)/database.db" "PRAGMA integrity_check;"
```

Le démarrage de l’application applique les migrations versionnées automatiquement. Il n’existe pas de commande `npm run migrate` séparée.

```bash
pm2 startOrReload ecosystem.config.js --only superprof --update-env
pm2 status
curl -fsS http://127.0.0.1:3000/health
curl -fsS https://VOTRE-DOMAINE/health
```

Après un backup validé et avec une seule instance SQLite active :

```bash
npm run maintenance:sqlite
npm run backup:seances
```

Le dernier script reste un export CSV complémentaire ; il ne remplace pas le backup SQLite.

## 25. GO-LIVE checklist

- [ ] Secrets forts installés et démarrage sans erreur.
- [ ] SMTP réel testé : réception, usage unique, expiration.
- [ ] Copie DB migrée et validée ; production sauvegardée juste avant migration.
- [ ] Q1 résolue et 93 séances historiques traitées selon décision.
- [ ] Restauration complète exécutée et documentée.
- [ ] `lost_and_found` expliqué/sauvegardé ; backup corrompu écarté.
- [ ] HTTPS, proxy, firewall, `TRUST_PROXY` et PM2 une instance confirmés.
- [ ] VAPID persistant/sauvegardé et Push réel testé.
- [ ] `npm test`, E2E, audit dépendances et healthcheck verts sur la release exacte.
- [ ] Tests manuels Handler/Professeur/SuperAdmin/public effectués.
- [ ] Plan de rollback et contact de maintenance disponibles.

## 26. Verdict final

### 🟠 NOT READY YET

| Dimension | Verdict | Motif |
| --- | --- | --- |
| Sécurité du code | 🟡 acceptable avec réserves | Contrôles solides et tests verts ; secrets/configuration/proxy réel non validés. |
| Fonctionnel | 🟠 non prêt | Email réel, migration active et 93 séances historiques empêchent une confiance complète. |
| Design / UX | 🟡 acceptable avec réserves | Parcours et responsive testés ; validation mobile/accessibilité réelle encore à faire. |
| Performance | 🟡 acceptable avec réserves | Architecture monoprocessus cohérente ; aucune charge réelle. |
| Production globale | 🟠 NO-GO | Les P1 de configuration, données et restauration doivent être levés. |

Les bloquants sont limités et concrets : secrets, SMTP, migration + réconciliation, sauvegarde/restauration, puis vérification Oracle HTTPS/proxy. Une fois ces cinq points validés, une nouvelle passe courte peut raisonnablement viser un GO.
