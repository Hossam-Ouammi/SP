const { all, get, run, executerTransactionImmediate } = require("./db");

function id(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function listerEquipesDisponibles(professeurId) {
  const professeur = id(professeurId);
  if (!professeur) return [];
  return all(`
    SELECT u.id, u.public_id, u.nom
    FROM utilisateurs u
    JOIN utilisateur_roles r ON r.utilisateur_id = u.id AND r.role = 'handler'
    WHERE u.acces_active = 1 AND u.statut_compte = 'active' AND u.id <> ?
      AND NOT EXISTS (
        SELECT 1 FROM rattachements_professeurs rp
        WHERE rp.handler_id = u.id AND rp.professeur_id = ? AND rp.actif = 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM demandes_rattachement_equipe d
        WHERE d.handler_id = u.id AND d.professeur_id = ? AND d.statut = 'pending'
      )
    ORDER BY u.public_id COLLATE NOCASE, u.nom COLLATE NOCASE
  `, [professeur, professeur, professeur]);
}

async function creerDemandeRattachement({ professeurId, handlerId, description }) {
  const professeur = id(professeurId);
  const handler = id(handlerId);
  const texte = String(description || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!professeur || !handler || !texte) throw Object.assign(new Error("Equipe et description obligatoires."), { status: 400 });
  const disponible = (await listerEquipesDisponibles(professeur)).some((equipe) => Number(equipe.id) === handler);
  if (!disponible) throw Object.assign(new Error("Cette equipe n'est pas disponible."), { status: 409 });
  const result = await run(`
    INSERT INTO demandes_rattachement_equipe (professeur_id, handler_id, description)
    VALUES (?, ?, ?)
  `, [professeur, handler, texte]);
  return get("SELECT * FROM demandes_rattachement_equipe WHERE id = ?", [result.id]);
}

async function listerDemandesHandler(handlerId) {
  const handler = id(handlerId);
  if (!handler) return [];
  return all(`
    SELECT d.id, d.professeur_id, d.handler_id, d.description, d.statut, d.created_at,
      u.nom, u.email, u.public_id
    FROM demandes_rattachement_equipe d
    JOIN utilisateurs u ON u.id = d.professeur_id
    WHERE d.handler_id = ? AND d.statut = 'pending'
    ORDER BY d.created_at ASC, d.id ASC
  `, [handler]);
}

async function traiterDemandeRattachement({ demandeId, handlerId, reviewerId, accepter }) {
  const demande = id(demandeId);
  const handler = id(handlerId);
  const reviewer = id(reviewerId);
  if (!demande || !handler || !reviewer) return null;
  return executerTransactionImmediate(async () => {
    const row = await get(`
      SELECT d.*, u.nom, u.email, u.public_id
      FROM demandes_rattachement_equipe d
      JOIN utilisateurs u ON u.id = d.professeur_id
      WHERE d.id = ? AND d.handler_id = ? AND d.statut = 'pending'
    `, [demande, handler]);
    if (!row) return null;
    if (accepter) {
      await run(`
        INSERT OR IGNORE INTO utilisateur_roles (utilisateur_id, role)
        VALUES (?, 'professeur')
      `, [row.professeur_id]);
      await run(`
        UPDATE rattachements_professeurs
        SET actif = 0, fin_at = COALESCE(fin_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE handler_id = ? AND professeur_id = ? AND actif = 0
      `, [handler, row.professeur_id]);
      await run(`
        INSERT INTO rattachements_professeurs
          (handler_id, professeur_id, actif, debut_at, cree_par)
        VALUES (?, ?, 1, CURRENT_TIMESTAMP, ?)
      `, [handler, row.professeur_id, reviewer]);
    }
    await run(`
      UPDATE demandes_rattachement_equipe
      SET statut = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND statut = 'pending'
    `, [accepter ? "approved" : "rejected", reviewer, demande]);
    return { ...row, statut: accepter ? "approved" : "rejected" };
  });
}

module.exports = { listerEquipesDisponibles, creerDemandeRattachement, listerDemandesHandler, traiterDemandeRattachement };
