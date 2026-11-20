const crypto = require("crypto");
const { get, run, executerTransactionImmediate } = require("../models/db");

const champs = {
  seances: ["id", "date", "heure_debut", "heure_fin", "duree_minutes", "etudiant", "parent", "matiere", "compte", "est_essai", "statut_seance", "handler_id", "intervenant_id", "tarif_horaire_applique", "updated_at"],
  indisponibilites: ["id", "date", "heure_debut", "heure_fin", "jour_complet", "raison", "handler_id", "intervenant_id", "updated_at"],
};
const hash = valeur => crypto.createHash("sha256").update(JSON.stringify(valeur)).digest("hex");
function revisionOffline(table, ligne) {
  return hash(champs[table].map(champ => ligne?.[champ] ?? null));
}
function erreurOffline(status, message, code = "OFFLINE_CONFLICT") {
  return Object.assign(new Error(message), { status, code });
}

// Runs AFTER the route's usual authentication, role and write-access checks.
// The mutation, history and receipt share one transaction; no response escapes
// before COMMIT. A lost response can therefore be retried without duplicating.
async function executerAvecRecuOffline(controller, req, res, next, scope) {
  const operationId = req.get?.("X-Offline-Operation");
  if (!operationId) return controller(req, res, next);
  if (!champs[scope] || !/^[a-zA-Z0-9-]{16,80}$/.test(operationId)) {
    throw erreurOffline(400, "Opération hors ligne invalide.", "OFFLINE_INVALID");
  }
  const chemin = req.originalUrl.split("?")[0];
  if (!/^\/api\/(seances|indisponibilites)(?:\/\d+(?:\/(horaire|duree|statut|plage|dupliquer|repeter))?|\/dupliquer-semaine)?$/.test(chemin)) {
    throw erreurOffline(400, "Cette action nécessite une connexion.", "OFFLINE_UNSUPPORTED");
  }
  const revision = req.get("X-Offline-Revision") || "";
  const empreinte = hash([req.method, chemin, req.body, revision]);
  const resultat = await executerTransactionImmediate(async () => {
    const recu = await get("SELECT * FROM offline_operations WHERE utilisateur_id = ? AND operation_id = ?", [req.utilisateur.id, operationId]);
    if (recu) {
      if (recu.request_hash !== empreinte) throw erreurOffline(409, "Cette opération a déjà été utilisée avec d'autres données.");
      return { status: recu.status_code, payload: JSON.parse(recu.response_json), replay: true };
    }
    if (req.params.id) {
      const ligne = await get(`SELECT * FROM ${scope} WHERE id = ?`, [req.params.id]);
      const autorise = ligne && (scope === "indisponibilites"
        ? Number(ligne.intervenant_id) === Number(req.utilisateur.id)
        : (req.scope?.handlerOwnIds || []).map(Number).includes(Number(ligne.handler_id)) || Number(ligne.intervenant_id) === Number(req.utilisateur.id));
      if (!autorise) throw erreurOffline(404, "Cet élément n'est plus accessible.");
      if (!revision || revisionOffline(scope, ligne) !== revision) {
        throw erreurOffline(409, "Cet élément a changé depuis votre dernière connexion. Votre modification est conservée, mais n'a pas été appliquée.");
      }
    }
    let status = 200, payload;
    const reponse = {
      locals: res.locals,
      status(code) { status = code; return this; },
      json(value) { payload = value; return this; },
    };
    await controller(req, reponse, error => { throw error; });
    if (status >= 400 || payload === undefined) {
      throw erreurOffline(status >= 400 ? status : 500, payload?.message || "Action non appliquée.", payload?.code || "OFFLINE_REJECTED");
    }
    await run("INSERT INTO offline_operations (utilisateur_id, operation_id, request_hash, status_code, response_json) VALUES (?, ?, ?, ?, ?)",
      [req.utilisateur.id, operationId, empreinte, status, JSON.stringify(payload)]);
    return { status, payload, replay: false };
  });
  res.locals.offlineReplay = resultat.replay;
  return res.status(resultat.status).json(resultat.payload);
}
module.exports = { revisionOffline, executerAvecRecuOffline };
