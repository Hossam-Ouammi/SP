# Rapport de correction — 7 septembre 2026

> **Archive historique — non normative.** Ce correctif documente un état
> intermédiaire du 7 septembre 2026. Il peut donc contredire des évolutions
> ultérieures. Pour l'état actuel, suivre le code, [l'audit actuel](AUDIT-ACTUEL-2026-09-10.md)
> et le [guide de déploiement](DEPLOIEMENT-MULTI-UTILISATEUR.md).

Ce document remplace toutes les conclusions devenues obsolètes de
`RAPPORT-TECHNIQUE-COMPLET.md` relatives au calendrier public IANA, aux
conversions GMT, à l'audit, à SuperAdmin, Push, SSE et au menu Calendrier
(notamment §§13–14, 25 et 28–30). Il couvre les correctifs appliqués sur le
dépôt existant, sans réécriture des données métier ni des fonctions déjà
valides.

## Résultat vérifié

- `npm test` : **16/16 régressions réussies**.
- Les choix publics sont maintenant des offsets métier stricts : `GMT` = 0,
  `GMT+1` = +60 min et `GMT+2` = +120 min par rapport à l'horloge centrale.
  Ils ne sont pas des zones IANA et ne suivent aucun DST public.
- Les créneaux, disponibilités, dashboards, statistiques, monétisation et
  historique continuent de manipuler l'heure centrale inchangée.
- La migration append-only `2026090710_public_calendar_fixed_offset` convertit
  toute ancienne valeur IANA publique vers `GMT`, le seul choix non ambigu sans
  conversion géographique implicite.

### Preuves ciblées

| Contrat | Preuve automatisée |
|---|---|
| 08:00 → 08:00 / 09:00 / 10:00 | `public-calendar-timezone.test.js` |
| 15:30 + GMT+2 = 17:30 | `public-calendar-timezone.test.js` |
| 23:30 + GMT+1/+2 franchit minuit | `public-calendar-timezone.test.js` |
| Jour, mois, année et plusieurs `CENTRAL_CALENDAR_TIMEZONE` | `public-calendar-timezone.test.js` |
| Référence intégrée : GMT+2 → GMT+1 → GMT | `workspace-settings.test.js` : 08:00–09:00 central reste identique pour Handler/Professeur et devient 10–11, 09–10, 08–09 public |
| Le réglage public ne modifie pas le calendrier Handler/Professeur | `workspace-settings.test.js` |
| Réduction de plage : 409, confirmation, données conservées | `workspace-settings.test.js` |

## Réanalyse des anciens problèmes ouverts

| Ancien problème | Corrigé ? | Comment | Test / preuve |
|---|---|---|---|
| 1. DST IANA legacy du public | Oui, hors workflow | Le public n'accepte plus de zone IANA. Sa projection est une addition civile fixe ; le DST central reste une règle métier séparée. | `public-calendar-timezone`, `public-calendar-token` |
| 2. Heure centrale répétée au pli DST | Reste une limite de modèle | Les données centrales restent `date + heure` sans offset. Ce n'est pas utilisé pour calculer GMT/GMT+N public. | `timezone-dst` ; décision produit requise seulement si une occurrence DST ambiguë doit être distinguée |
| 3. Sémantique de GMT+2 ambiguë | Oui | Contrat explicite : `public = horloge centrale + offset`. | tests d'offset fixes |
| 4. Migration 0708 dépendante de l'environnement | Oui pour le contrat courant | 0708 reste historique et append-only ; 0710 normalise ensuite toute valeur non fixe à `GMT`. | `calendar-hours-migration` |
| 5. Fenêtre publique historique 09:00–23:00 | Réserve produit assumée | La fenêtre publique suit la plage centrale configurée, avec l'offset fixe. Aucun changement silencieux de données. | `workspace-settings`, `public-calendar-token` |
| 6. Flag « Aujourd'hui » et `/api/seances` | Inchangé, non bloquant dans ce périmètre | Le même endpoint est nécessaire au calendrier et aux statistiques ; le flag reste une capacité d'interface. | `module-access-flags` |
| 7. Absence de recette navigateur authentifiée | En attente de validation interactive | Une instance locale de recette et des comptes de test sont prêts ; l'entrée du mot de passe requiert une confirmation explicite au moment de la saisie. | contrôle navigateur local, à terminer |
| 8. Backup/restauration/cluster SQLite | Non vérifié en exploitation | Hors du dépôt de code ; un essai de sauvegarde puis restauration sur l'environnement cible reste requis. | procédure de déploiement à réaliser |
| 9. Append audit concurrent | Oui | Lecture du hash précédent, signature et insertion sont sérialisées par transaction SQLite `IMMEDIATE`. | `historique-audit-chain.test.js` avec append concurrents |
| 10. Scope audit non signé | Oui pour les nouvelles entrées | HMAC v2 inclut `handler_id` et `intervenant_id`; v1 reste vérifiable pour l'historique existant. | `historique-audit-chain.test.js` |
| 11. Double source SuperAdmin | Oui | `utilisateur_roles/super_admin` est canonique. `est_admin` est uniquement compatibilité/migration ou affichage legacy. | `superadmin-push-security.test.js`, `admin-analytics.test.js` |
| 12. Réattribution Push par endpoint | Oui | Un endpoint déjà détenu par A renvoie un conflit pour B ; la désactivation est scoppée par propriétaire. | `superadmin-push-security.test.js` |
| 13. Métadonnées SSE entre Professeurs | Oui | Le Handler reçoit les événements de son équipe ; le Professeur concerné reçoit un message minimal ; les autres n'en reçoivent pas. | `realtime-scope.test.js` |

## Correctifs structurels complémentaires

- Le panneau EJS « Calendrier » est désormais écrit directement dans
  `#calendrier-section`. Aucun JavaScript ne le déplace dans le DOM.
- Le choix visuel public ne présente que GMT, GMT+1 et GMT+2, avec le libellé
  « décalage affiché aux clients ».
- La documentation backend décrit désormais le stockage historique et le
  contrat fixe, sans annoncer de compatibilité IANA active.

## Classification `est_admin`

| Classe | État |
|---|---|
| Autorisation de sécurité | Migrée vers le rôle canonique `super_admin` |
| Affichage legacy | Ne confère aucun droit global |
| Compatibilité/migration base | Colonne conservée, non autoritative |

## Verdict à cet instant

- **Respect exact de l'idée métier : Oui.** Les heures publiques sont un
  décalage fixe de l'horloge centrale, sans conversion Casablanca/GMT ni DST
  public.
- **Sécurité : acceptable.** Les défauts audit, scope signé, SuperAdmin, Push
  et SSE identifiés ont une correction et une régression dédiée. La limite du
  pli DST central est documentée, mais indépendante de cette fonctionnalité.
- **UX : réserves.** La structure et les contrôles ont été corrigés, mais la
  recette visuelle authentifiée desktop/768/360 doit encore être exécutée.
- **Production : 🟡 READY WITH CONDITIONS.** Ne pas promouvoir en vert avant
  recette authentifiée, sauvegarde/restauration réelle, migration sur une copie
  de production et validation de la configuration d'infrastructure.
