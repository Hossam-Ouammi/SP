const { all, run, get } = require("./db");

async function listerIpsBloquees() {
  return all(`
    SELECT
      blocked_ips.*,
      utilisateurs.nom AS bloque_par_nom
    FROM blocked_ips
    LEFT JOIN utilisateurs ON utilisateurs.id = blocked_ips.cree_par
    ORDER BY created_at DESC
  `);
}

async function estIpBloquee(ip) {
  const resultat = await get(`SELECT ip FROM blocked_ips WHERE ip = ?`, [ip]);
  return !!resultat;
}

async function bloquerIp(ip, raison, utilisateurId) {
  return run(
    `INSERT OR REPLACE INTO blocked_ips (ip, raison, cree_par) VALUES (?, ?, ?)`,
    [ip, raison, utilisateurId]
  );
}

async function debloquerIp(ip) {
  return run(`DELETE FROM blocked_ips WHERE ip = ?`, [ip]);
}

module.exports = {
  listerIpsBloquees,
  estIpBloquee,
  bloquerIp,
  debloquerIp,
};
