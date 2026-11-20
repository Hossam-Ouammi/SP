// Calendar-only offline store. No passwords, session tokens or admin records.
const DB_NAME = "sp-offline-calendar-v1";
const MAX_AGE = 7 * 86400000;
const TAB_ID = crypto.randomUUID();
const READS = new Set(["/api/auth/me", "/api/seances", "/api/seances/options", "/api/indisponibilites", "/api/dashboard/indisponibilites", "/api/settings", "/api/equipe/professeurs", "/api/equipe/tarification", "/api/team-memberships/available"]);
const MUTATION = /^\/api\/(seances|indisponibilites)(?:\/(-?\d+)(?:\/(horaire|duree|statut|plage|dupliquer|repeter))?|\/(dupliquer-semaine))?$/;
let database, synchronisation, connexionPerdue = navigator.onLine === false, csrf = "";
const clone = value => structuredClone(value);
const erreur = (message, code = "OFFLINE_UNSUPPORTED") => Object.assign(new Error(message), { code });
const vide = () => ({ owner: null, profil: null, verifiedAt: 0, snapshots: {}, queue: [], mappings: {}, finished: {}, nextId: -Date.now() * 1000 });
function reinitialiser(state, extra = {}) {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, vide(), extra);
}

function ouvrirBase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(erreur("Le stockage local est indisponible. Aucune modification hors ligne n'a été enregistrée.", "OFFLINE_STORAGE"));
  });
  return database;
}
async function transaction(modifier = null) {
  const db = await ouvrirBase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", modifier ? "readwrite" : "readonly");
    const store = tx.objectStore("state");
    let result;
    const request = store.get("calendar");
    request.onsuccess = () => {
      const state = request.result || vide();
      try {
        result = modifier ? modifier(state) : state;
        if (modifier) store.put(state, "calendar");
      } catch (error) { reject(error); tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(erreur("Impossible d'enregistrer sur cet appareil. Aucune action n'a été mise en attente.", "OFFLINE_STORAGE"));
    tx.onabort = () => reject(erreur("Enregistrement local annulé.", "OFFLINE_STORAGE"));
  });
}
export function estHorsLigne() { return connexionPerdue || navigator.onLine === false; }
export async function etatOffline() {
  const state = await transaction();
  return { offline: estHorsLigne(), owner: state.owner, pending: state.queue.length,
    syncing: Boolean(synchronisation), ready: Boolean(state.profil && state.snapshots["/api/seances"]), error: state.syncError || "",
    operations: state.queue.map(op => ({ id: op.id, label: op.label, status: op.status, error: op.error })) };
}
function signaler() { window.dispatchEvent(new Event("sp-offline-state")); }
function reseau(disponible) { const change = connexionPerdue === disponible; connexionPerdue = !disponible; if (change) signaler(); }
const minutes = heure => { const [h, m] = String(heure || "00:00").split(":").map(Number); return h * 60 + m; };
const heure = n => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const jourSuivant = (date, jours) => new Date(Date.parse(`${date}T12:00:00Z`) + jours * 86400000).toISOString().slice(0, 10);
const fin = row => row.heure_fin === "00:00" ? 1440 : minutes(row.heure_fin);
const actif = row => row.statut_seance !== "annulee";
function identite(path) {
  const match = path.match(MUTATION);
  return match && { type: match[1], id: match[2] ? Number(match[2]) : null, action: match[3] || match[4] || "" };
}
function appliquer(state) {
  const data = {
    seances: clone(state.snapshots["/api/seances"]?.data?.seances || []),
    indisponibilites: clone((state.snapshots["/api/dashboard/indisponibilites"] || state.snapshots["/api/indisponibilites"])?.data?.indisponibilites || []),
  };
  for (const op of state.queue) {
    const cible = identite(op.path);
    const mapped = state.mappings[`${cible.type}/${cible.id}`];
    projeter(data, mapped && cible.id < 0 ? { ...op, path: op.path.replace(`/${cible.id}`, `/${mapped.id}`) } : op, state);
  }
  return data;
}
function projeter(data, op, state) {
  const cible = identite(op.path), body = op.body || {};
  const rows = data[cible.type];
  const source = rows.find(row => Number(row.id) === cible.id);
  const status = op.status === "conflict" ? "conflict" : "pending";
  let offset = 0;
  const fabriquer = row => ({ ...row, id: op.localId - offset++, offline_pending: true, offline_status: status });
  const supprimer = id => { data[cible.type] = data[cible.type].filter(row => Number(row.id) !== id); };
  const ajouterIndispo = row => {
    let plages = [[minutes(row.heure_debut), fin(row)]];
    for (const occupe of [...data.seances.filter(actif), ...data.indisponibilites]) {
      if (occupe.date !== row.date || Number(occupe.intervenant_id) !== Number(row.intervenant_id)) continue;
      const a = minutes(occupe.heure_debut), b = fin(occupe);
      plages = plages.flatMap(([debut, end]) => b <= debut || a >= end ? [[debut, end]] : [[debut, Math.min(end, a)], [Math.max(debut, b), end]].filter(([x, y]) => y > x));
    }
    return plages.map(([a, b]) => {
      const ligne = fabriquer({ ...row, heure_debut: heure(a), heure_fin: heure(b), jour_complet: 0 });
      data.indisponibilites.push(ligne); return ligne;
    });
  };
  const perso = { handler_id: body.handler_id || source?.handler_id || state.profil?.scope?.handlerOwnIds?.[0] || state.profil?.scope?.handlerIds?.[0] || state.owner, intervenant_id: body.intervenant_id || source?.intervenant_id || state.owner, cree_par: state.owner };
  if (op.method === "DELETE") { supprimer(cible.id); return {}; }
  if (cible.type === "indisponibilites") {
    let ajouts = [];
    if (cible.action === "dupliquer-semaine") {
      const sources = [...rows].filter(row => Number(row.intervenant_id) === state.owner && row.date >= body.semaine && row.date < jourSuivant(body.semaine, 7));
      for (const row of sources) ajouts.push(...ajouterIndispo({ ...row, date: jourSuivant(row.date, 7) }));
    } else {
      if (source) supprimer(source.id);
      const row = { ...source, ...body, ...perso };
      if (body.jour_complet) { row.heure_debut = "00:00"; row.heure_fin = "24:00"; }
      const dates = Array.isArray(body.dates) ? body.dates : [row.date];
      for (const date of dates) ajouts.push(...ajouterIndispo({ ...row, date }));
    }
    return { indisponibilite: ajouts[0], indisponibilites: ajouts, message: "Indisponibilité en attente de synchronisation." };
  }
  const copie = ["dupliquer", "repeter"].includes(cible.action);
  if (!source && cible.id) return {};
  let seance = { ...source, ...body, ...perso };
  if (cible.action === "statut") seance.statut_seance = body.statut_seance;
  if (copie) seance = { ...source, ...body, ...perso, est_essai: false, statut_seance: "planifiee" };
  if (!seance.statut_seance) seance.statut_seance = "planifiee";
  seance.duree_minutes = Number(seance.duree_minutes || 60);
  seance.heure_fin = heure(minutes(seance.heure_debut) + seance.duree_minutes);
  seance.intervenant_nom ||= data.seances.find(row => Number(row.intervenant_id) === Number(seance.intervenant_id))?.intervenant_nom || (Number(seance.intervenant_id) === state.owner ? state.profil?.utilisateur?.nom : "");
  const nombre = cible.action === "repeter" ? Number(body.nombre_semaines || 1) : !cible.id ? Number(body.nombre_semaines || 1) : 1;
  const resultats = [];
  if (source && !copie) supprimer(source.id);
  for (let index = 0; index < nombre; index++) {
    const row = { ...seance, date: jourSuivant(seance.date, (cible.action === "repeter" ? index + 1 : index) * 7),
      offline_pending: true, offline_status: status };
    row.libelle = `${row.matiere || "Séance"} — ${row.etudiant || ""}`;
    row.duree_label = `${row.duree_minutes} min`;
    if (!source || copie) Object.assign(row, fabriquer(row));
    if (cible.action === "repeter" || cible.action === "duree") {
      data.indisponibilites = data.indisponibilites.flatMap(indispo => {
        if (indispo.date !== row.date || Number(indispo.intervenant_id) !== Number(row.intervenant_id) || fin(indispo) <= minutes(row.heure_debut) || minutes(indispo.heure_debut) >= fin(row)) return [indispo];
        return [[minutes(indispo.heure_debut), minutes(row.heure_debut)], [fin(row), fin(indispo)]]
          .filter(([a, b]) => b > a).map(([a, b]) => fabriquer({ ...indispo, heure_debut: heure(a), heure_fin: heure(b) }));
      });
    }
    data.seances.push(row); resultats.push(row);
  }
  return { seance: resultats[0], seances: resultats, message: "Séance en attente de synchronisation." };
}

async function lireLocal(path) {
  const state = await transaction();
  if (!state.profil || Date.now() - state.verifiedAt > MAX_AGE || state.logoutRequired) throw erreur("Ouvrez l'application en ligne et connectez-vous pour préparer le mode hors ligne.", "OFFLINE_NOT_READY");
  const data = appliquer(state);
  if (path === "/api/auth/me") return clone(state.profil);
  if (path === "/api/seances") return { seances: data.seances };
  if (path === "/api/indisponibilites" || path === "/api/dashboard/indisponibilites") return { indisponibilites: data.indisponibilites };
  const saved = state.snapshots[path];
  if (!READS.has(path) || !saved) throw erreur("Cette rubrique nécessite une connexion Internet. Le calendrier reste accessible.");
  return clone(saved.data);
}

async function mettreEnAttente(path, method, body) {
  const cible = identite(path);
  if (!cible || !["POST", "PUT", "PATCH", "DELETE"].includes(method)) throw erreur("Cette action nécessite une connexion Internet.");
  const result = await transaction(state => {
    if (!state.profil || Date.now() - state.verifiedAt > MAX_AGE || state.logoutRequired) throw erreur("Reconnectez-vous avant de modifier le calendrier.", "OFFLINE_NOT_READY");
    const user = state.profil.utilisateur;
    if (Number(user?.mode_lecture_seule) === 1 || Number(user?.doit_changer_mot_de_passe) === 1) throw erreur("Ce compte ne peut pas modifier les données.");
    if (state.queue.length >= 200) throw erreur("200 modifications sont déjà en attente. Synchronisez avant de continuer.");
    const data = appliquer(state);
    const source = cible.id && data[cible.type].find(row => Number(row.id) === cible.id);
    if (cible.id && !source) throw erreur("Cet élément n'est pas disponible hors ligne.");
    if (source?.est_seance_confidentielle) throw erreur("Cet élément n'est pas modifiable.");
    if (cible.id > 0 && !source.offline_revision) throw erreur("Rechargez ce calendrier en ligne une fois avant de le modifier hors ligne.");
    if (source && (cible.type === "indisponibilites" ? Number(source.intervenant_id) !== state.owner
      : Number(source.handler_id) !== state.owner && Number(source.intervenant_id) !== state.owner)) throw erreur("Cet élément n'est pas modifiable par ce compte.");
    const count = Number(body?.nombre_semaines || 1);
    if (!Number.isInteger(count) || count < 1 || count > 52) throw erreur("Choisissez entre 1 et 52 semaines.");
    const op = { id: crypto.randomUUID(), path, method, body: clone(body), base: source?.offline_revision || "", localId: state.nextId,
      status: "pending", label: `${cible.type === "seances" ? "Séance" : "Indisponibilité"} · ${body?.date || source?.date || body?.semaine || ""} ${body?.heure_debut || source?.heure_debut || ""}`, createdAt: Date.now() };
    state.nextId -= 10000;
    // Validate the projection before committing its durable operation.
    const response = projeter(data, op, state);
    if (cible.type === "seances" && method !== "DELETE") {
      const nouveaux = response.seances || [];
      for (const row of nouveaux) {
        if (!row.date || !Number(row.intervenant_id) || !Number.isFinite(minutes(row.heure_debut)) || ![60, 90, 120].includes(row.duree_minutes) || fin(row) > 1440) throw erreur("Date, réalisateur ou durée de séance invalide.");
        if (data.seances.some(other => other !== row && actif(other) && other.date === row.date && Number(other.intervenant_id) === Number(row.intervenant_id) && minutes(other.heure_debut) < fin(row) && fin(other) > minutes(row.heure_debut))) throw erreur("Ce créneau contient déjà une séance sur cet appareil.");
      }
    }
    if (cible.type === "indisponibilites" && method !== "DELETE" && cible.action !== "dupliquer-semaine") {
      const dates = Array.isArray(body.dates) ? body.dates : [body.date || source?.date];
      const a = body.jour_complet ? 0 : minutes(body.heure_debut || source?.heure_debut);
      const b = body.jour_complet ? 1440 : fin({ heure_fin: body.heure_fin || source?.heure_fin });
      if (!dates.length || dates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) || !Number.isFinite(a) || !Number.isFinite(b) || b <= a || b - a < 30 || a % 30 || b % 30) throw erreur("Choisissez une date et une plage valide, par demi-heure.");
    }
    op.produced = (response.seances || response.indisponibilites || []).map(row => ({ id: row.id, date: row.date, heure_debut: row.heure_debut }));
    state.queue.push(op);
    return { response, operationId: op.id };
  });
  signaler(); return result;
}

async function enregistrerLecture(path, data, started, expectedOwner) {
  if (!READS.has(path)) return;
  await transaction(state => {
    if (path === "/api/auth/me") {
      const id = Number(data.utilisateur?.id);
      if (!id || state.logoutRequired || started < (state.logoutAt || 0)) return;
      if (state.owner !== id && state.queue.length) throw erreur("Des modifications appartiennent à un autre compte sur cet appareil. Reconnectez-vous à ce compte pour les synchroniser avant de changer de compte.", "OFFLINE_ACCOUNT");
      if (state.owner !== id) {
        if (started < (state.accountChangedAt || 0)) return;
        reinitialiser(state, { accountChangedAt: Date.now() });
      }
      state.owner = id; state.profil = clone(data); state.verifiedAt = Date.now();
    } else if (state.owner !== expectedOwner) {
      return;
    }
    if (state.owner && (!state.snapshots[path] || state.snapshots[path].savedAt <= started)) state.snapshots[path] = { data: clone(data), savedAt: started };
  });
}
async function brut(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options,
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...options.headers } });
  csrf = response.headers.get("x-csrf-token") || csrf;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || "Synchronisation refusée."), { status: response.status, code: data.code });
  return data;
}

export async function requeteAvecOffline(path, options, envoyer) {
  const method = String(options.method || "GET").toUpperCase();
  const url = new URL(path, location.origin);
  const local = url.origin === location.origin;
  const chemin = url.pathname;
  const started = Date.now();
  let state;
  try { state = local ? await transaction() : null; }
  catch (error) { if (!estHorsLigne()) return envoyer(); throw error; }
  if (chemin === "/api/auth/me" && state?.logoutRequired) {
    if (navigator.onLine !== false) {
      try { await brut("/api/auth/me"); await brut("/api/auth/logout", { method: "POST" }); await transaction(s => { s.logoutRequired = false; }); } catch (_) { /* no offline sign-in after a local logout */ }
    }
    throw Object.assign(erreur("Reconnectez-vous.", "OFFLINE_LOGGED_OUT"), { status: 401 });
  }
  const mutation = local && identite(chemin) && method !== "GET";
  const body = typeof options.body === "string" ? JSON.parse(options.body || "{}") : options.body || {};
  if (mutation && (estHorsLigne() || state.profil)) {
    // Persist BEFORE sending, even online: a disappearing connection must not
    // turn a successful server write into a duplicate on the next attempt.
    const { response, operationId } = await mettreEnAttente(chemin, method, body);
    if (!estHorsLigne()) {
      for (let tentative = 0; tentative < 2; tentative++) {
        await synchroniserOffline().catch(() => {});
        const actuel = await transaction();
        if (actuel.finished?.[operationId]) return actuel.finished[operationId];
        const operation = actuel.queue.find(op => op.id === operationId);
        if (operation?.status === "conflict") {
          await abandonnerOperation(operationId);
          throw Object.assign(new Error(operation.error), { status: operation.errorStatus || 409, code: operation.errorCode });
        }
        if (estHorsLigne() || !operation) break;
      }
    }
    return response;
  }
  if (estHorsLigne() && method !== "GET") throw erreur("Cette action est disponible uniquement en ligne.");
  try {
    const data = await envoyer(); reseau(true);
    if (chemin === "/api/auth/login" && data.utilisateur) {
      await transaction(s => { s.logoutRequired = false; });
      await enregistrerLecture("/api/auth/me", data, started, state.owner);
    }
    if (local && method === "GET") {
      // GETs from another account must never populate an old account's cache.
      await enregistrerLecture(chemin, data, started, state.owner);
      if (["/api/seances", "/api/indisponibilites", "/api/dashboard/indisponibilites"].includes(chemin) && (await transaction()).queue.length) return lireLocal(chemin);
    }
    return data;
  } catch (error) {
    if (chemin === "/api/auth/me" && error.status === 401) await transaction(s => { s.profil = null; });
    if (error.status || error.code) throw error;
    if (!local) throw error;
    reseau(false);
    if (method === "GET") return lireLocal(chemin);
    // A failed write can have reached the server. Never silently enqueue it
    // without an idempotency key; ask the user to check after reconnecting.
    throw erreur("Connexion interrompue. Vérifiez le calendrier à la reconnexion avant de recommencer cette action.", "OFFLINE_UNCERTAIN");
  }
}

export async function synchroniserOffline() {
  if (synchronisation || navigator.onLine === false) return synchronisation;
  const executer = async () => {
    let state = await transaction();
    if (!state.queue.length || !state.owner) return;
    const profil = await brut("/api/auth/me");
    if (Number(profil.utilisateur?.id) !== state.owner) throw erreur("Reconnectez-vous au compte qui possède les modifications en attente.", "OFFLINE_ACCOUNT");
    reseau(true);
    const owner = state.owner;
    const bloques = new Set();
    for (const original of state.queue) {
      state = await transaction();
      const op = state.queue.find(item => item.id === original.id);
      if (!op || state.owner !== owner) break;
      const cible = identite(op.path);
      const cle = `${cible.type}/${cible.id}`;
      if (op.status === "conflict" || bloques.has(cle)) { bloques.add(cle); continue; }
      const mapped = state.mappings[`${cible.type}/${cible.id}`];
      if (cible.id < 0 && !mapped) { bloques.add(cle); continue; }
      const path = cible.id < 0 ? op.path.replace(`/${cible.id}`, `/${mapped.id}`) : op.path;
      const base = op.replayRevision || mapped?.revision || op.base;
      try {
        const response = await brut(path, { method: op.method, body: JSON.stringify(op.body),
          headers: { "X-Offline-Operation": op.id, ...(base ? { "X-Offline-Revision": base } : {}) } });
        await transaction(s => {
          if (s.owner !== owner || !s.queue.some(item => item.id === op.id)) return;
          const resultats = response.seances || response.indisponibilites || (response.seance ? [response.seance] : response.indisponibilite ? [response.indisponibilite] : []);
          for (const produit of op.produced || []) {
            const reel = resultats.find(row => row.date === produit.date && row.heure_debut === produit.heure_debut);
            if (reel) s.mappings[`${cible.type}/${produit.id}`] = { id: reel.id, revision: reel.offline_revision };
          }
          const nouvelleRevision = response.seance?.offline_revision || response.indisponibilite?.offline_revision;
          if (nouvelleRevision && !["dupliquer", "repeter"].includes(cible.action)) {
            for (const suivant of s.queue) {
              const ident = identite(suivant.path);
              if (suivant.id !== op.id && ident.type === cible.type && ident.id === cible.id) suivant.replayRevision = nouvelleRevision;
            }
          }
          for (const [key, snapshot] of Object.entries(s.snapshots)) {
            const collection = cible.type === "seances" ? "seances" : "indisponibilites";
            if (!Array.isArray(snapshot.data?.[collection])) continue;
            let rows = snapshot.data[collection];
            if (cible.id && !["dupliquer", "repeter"].includes(cible.action)) rows = rows.filter(row => Number(row.id) !== Number(mapped?.id || cible.id));
            snapshot.data[collection] = [...rows.filter(row => !resultats.some(result => Number(result.id) === Number(row.id))), ...resultats];
          }
          s.queue = s.queue.filter(item => item.id !== op.id);
          s.finished ||= {};
          s.finished[op.id] = response;
          const anciennes = Object.keys(s.finished);
          for (const key of anciennes.slice(0, Math.max(0, anciennes.length - 200))) delete s.finished[key];
        });
      } catch (error) {
        if (!error.status || error.status >= 500 || error.status === 429 || error.status === 401) {
          if (!error.status) reseau(false);
          throw error;
        }
        await transaction(s => {
          const saved = s.queue.find(item => item.id === op.id);
          if (saved) { saved.status = "conflict"; saved.error = error.message; saved.errorStatus = error.status; saved.errorCode = error.code; }
        });
        bloques.add(cle);
      }
      signaler();
    }
    window.dispatchEvent(new Event("sp-offline-synced"));
  };
  synchronisation = (navigator.locks ? navigator.locks.request("sp-offline-sync", executer) : executer())
    .then(() => transaction(s => { s.syncError = ""; }))
    .catch(async error => {
      await transaction(s => { s.syncError = error.message; if (error.status === 401) s.profil = null; });
      if (error.status === 401) window.dispatchEvent(new Event("sp-offline-auth-required"));
      throw error;
    })
    .finally(() => { synchronisation = null; signaler(); });
  signaler(); return synchronisation;
}
export async function abandonnerOperation(id) {
  await transaction(s => {
    const op = s.queue.find(item => item.id === id);
    if (!op) return;
    const cible = identite(op.path);
    const produits = new Set((op.produced || []).map(row => row.id));
    if (cible.id) produits.add(cible.id);
    const supprimes = new Set([id]);
    // Transitive dependencies can reference fragments or a locally created copy.
    let changement = true;
    while (changement) {
      changement = false;
      for (const item of s.queue) {
        const other = identite(item.path);
        if (!supprimes.has(item.id) && other.type === cible.type && produits.has(other.id)) {
          supprimes.add(item.id); changement = true;
          for (const produit of item.produced || []) produits.add(produit.id);
        }
      }
    }
    s.queue = s.queue.filter(item => !supprimes.has(item.id));
  });
  signaler(); window.dispatchEvent(new Event("sp-offline-synced"));
}
export async function oublierDonneesOffline(logoutRequired = false) {
  await transaction(state => { reinitialiser(state, { logoutRequired, logoutAt: Date.now() }); });
  csrf = ""; signaler();
  if (typeof BroadcastChannel === "function") {
    const channel = new BroadcastChannel("sp-offline-account"); channel.postMessage({ type: "logout", from: TAB_ID }); channel.close();
  }
}
if (typeof BroadcastChannel === "function") {
  const channel = new BroadcastChannel("sp-offline-account");
  channel.onmessage = event => { if (event.data?.type === "logout" && event.data.from !== TAB_ID) location.reload(); };
}
window.addEventListener("online", () => { reseau(true); synchroniserOffline().catch(() => signaler()); });
window.addEventListener("offline", () => { reseau(false); });
window.addEventListener("focus", () => { synchroniserOffline().catch(() => {}); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") synchroniserOffline().catch(() => {}); });
window.setInterval(() => { if (document.visibilityState !== "hidden") synchroniserOffline().catch(() => {}); }, 15000);
