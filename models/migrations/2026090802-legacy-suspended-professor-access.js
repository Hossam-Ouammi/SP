/*
 * Repairs a narrow hole in the first multi-Handler migration.  That migration
 * created Professor roles only for legacy accounts that were active at the
 * time, leaving a suspended historical professor with no role to recover
 * after reactivation.
 */

async function trouverHandlerLegacy(get) {
  return get(`
    SELECT utilisateurs.id
    FROM utilisateurs
    INNER JOIN utilisateur_roles
      ON utilisateur_roles.utilisateur_id = utilisateurs.id
      AND utilisateur_roles.role = 'handler'
    ORDER BY
      CASE WHEN COALESCE(utilisateurs.est_admin, 0) = 1 THEN 0 ELSE 1 END,
      utilisateurs.id ASC
    LIMIT 1
  `);
}

module.exports = {
  version: "2026090802_legacy_suspended_professor_access",
  description:
    "Restaure les roles et rattachements des professeurs legacy suspendus",

  async up({ run, get, all }) {
    const handlerLegacy = await trouverHandlerLegacy(get);

    // A deliberately empty deployment has no Handler yet.  There is nothing
    // to repair until an operator creates the first workspace owner.
    if (!handlerLegacy?.id) {
      return;
    }

    // Limit this catch-up to historic Professor-shaped accounts with no
    // elevated Handler/SuperAdmin role. A formerly suspended account may have
    // been reactivated manually before this deployment, hence both active and
    // suspended states are eligible. Existing Professor roles are included so
    // a partially completed/manual repair also receives its missing active
    // attachment. Modern sign-up records are intentionally excluded so this
    // migration cannot auto-approve a pending account.
    const professeursOrphelins = await all(
      `
        SELECT utilisateurs.id
        FROM utilisateurs
        WHERE utilisateurs.id <> ?
          AND COALESCE(utilisateurs.est_admin, 0) = 0
          AND COALESCE(utilisateurs.statut_compte, 'active') IN ('active', 'suspendu')
          AND NOT EXISTS (
            SELECT 1
            FROM utilisateur_roles
            WHERE utilisateur_roles.utilisateur_id = utilisateurs.id
              AND utilisateur_roles.role IN ('super_admin', 'handler')
          )
          AND NOT EXISTS (
            SELECT 1
            FROM demandes_inscription
            WHERE demandes_inscription.utilisateur_id = utilisateurs.id
          )
        ORDER BY utilisateurs.id ASC
      `,
      [handlerLegacy.id]
    );

    for (const professeur of professeursOrphelins) {
      await run(
        `
          INSERT OR IGNORE INTO utilisateur_roles (
            utilisateur_id,
            role,
            accorde_par
          )
          VALUES (?, 'professeur', ?)
        `,
        [professeur.id, handlerLegacy.id]
      );

      // Do not rewrite another Handler's existing active assignment.  The
      // partial unique index also makes this safe if an unusual deployment
      // runs the migration body more than once.
      await run(
        `
          INSERT INTO rattachements_professeurs (
            handler_id,
            professeur_id,
            actif,
            cree_par
          )
          SELECT ?, ?, 1, ?
          WHERE NOT EXISTS (
            SELECT 1
            FROM rattachements_professeurs
            WHERE professeur_id = ? AND actif = 1
          )
        `,
        [handlerLegacy.id, professeur.id, handlerLegacy.id, professeur.id]
      );
    }
  },
};
