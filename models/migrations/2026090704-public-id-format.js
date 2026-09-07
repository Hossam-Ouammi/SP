const PREFIXES = Object.freeze({
  SUPER_ADMIN: "AD",
  HANDLER: "HD",
  PROFESSEUR: "PR",
});

function prefixePourRoles(roles = []) {
  const ensemble = new Set(roles);

  // A Handler who is also Super Admin keeps the Handler identifier: this is
  // the identifier intentionally shown in the public Handler selector.
  if (ensemble.has("handler")) {
    return PREFIXES.HANDLER;
  }

  if (ensemble.has("professeur")) {
    return PREFIXES.PROFESSEUR;
  }

  return PREFIXES.SUPER_ADMIN;
}

function estIdentifiantLegacyGenere(publicId) {
  return /^usr_[a-f0-9]{32}$/i.test(String(publicId || "").trim());
}

async function prochainIdentifiantPublic({ all, get, run }, prefixe) {
  const lignes = await all(
    "SELECT public_id FROM utilisateurs WHERE upper(public_id) LIKE ?",
    [`${prefixe}-%`]
  );
  let sequence = 0;

  for (const ligne of lignes) {
    const correspondance = new RegExp(`^${prefixe}-(\\d+)$`, "i").exec(
      String(ligne.public_id || "").trim()
    );

    if (correspondance) {
      sequence = Math.max(sequence, Number(correspondance[1]) || 0);
    }
  }

  for (let tentative = 1; tentative <= 10000; tentative += 1) {
    const candidat = `${prefixe}-${String(sequence + tentative).padStart(3, "0")}`;
    const collision = await get(
      "SELECT id FROM utilisateurs WHERE public_id = ? COLLATE NOCASE LIMIT 1",
      [candidat]
    );

    if (!collision) {
      return candidat;
    }
  }

  throw new Error("Impossible d'attribuer un identifiant public unique.");
}

module.exports = {
  version: "2026090704_public_id_format",
  description: "Identifiants publics stables AD/HD/PR",

  async up(context) {
    const { all, run } = context;
    const utilisateurs = await all(`
      SELECT utilisateurs.id, utilisateurs.public_id, utilisateur_roles.role
      FROM utilisateurs
      LEFT JOIN utilisateur_roles ON utilisateur_roles.utilisateur_id = utilisateurs.id
      ORDER BY utilisateurs.id ASC, utilisateur_roles.role ASC
    `);
    const rolesParUtilisateur = new Map();
    const publicIdsParUtilisateur = new Map();

    for (const utilisateur of utilisateurs) {
      const id = Number(utilisateur.id);
      if (!rolesParUtilisateur.has(id)) {
        rolesParUtilisateur.set(id, []);
        publicIdsParUtilisateur.set(id, utilisateur.public_id);
      }

      if (utilisateur.role) {
        rolesParUtilisateur.get(id).push(utilisateur.role);
      }
    }

    for (const [id, roles] of rolesParUtilisateur) {
      const publicId = String(publicIdsParUtilisateur.get(id) || "").trim();

      // Preserve any manually chosen/non-legacy public identifier. The only
      // generated values replaced here are the opaque ids introduced by 0701.
      if (publicId && !estIdentifiantLegacyGenere(publicId)) {
        continue;
      }

      const candidat = await prochainIdentifiantPublic(context, prefixePourRoles(roles));
      await run("UPDATE utilisateurs SET public_id = ? WHERE id = ?", [candidat, id]);
    }
  },
  PREFIXES,
  prefixePourRoles,
};
