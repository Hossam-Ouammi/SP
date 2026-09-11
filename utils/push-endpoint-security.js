const dns = require("node:dns");
const https = require("node:https");
const net = require("node:net");

const MAX_ENDPOINT_LENGTH = 4096;

class ErreurEndpointPushNonSecurise extends Error {
  constructor(message = "Endpoint push non securise.") {
    super(message);
    this.name = "ErreurEndpointPushNonSecurise";
    this.code = "PUSH_ENDPOINT_UNSAFE";
    this.status = 400;
  }
}

function creerErreurEndpointPushNonSecurise(message) {
  return new ErreurEndpointPushNonSecurise(message);
}

function normaliserNomHote(nomHote) {
  return String(nomHote || "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function estIpv4PriveeOuReservee(adresse) {
  const octets = String(adresse || "")
    .split(".")
    .map((octet) => Number(octet));

  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true;
  }

  const [a, b, c] = octets;

  return Boolean(
    a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
  );
}

function developperIpv6(adresse) {
  let valeur = normaliserNomHote(adresse);

  if (!valeur || valeur.includes("%")) {
    return null;
  }

  if (valeur.includes(".")) {
    const separateurIpv4 = valeur.lastIndexOf(":");
    const ipv4 = valeur.slice(separateurIpv4 + 1);

    if (net.isIP(ipv4) !== 4) {
      return null;
    }

    const octets = ipv4.split(".").map(Number);
    valeur = `${valeur.slice(0, separateurIpv4)}:${((octets[0] << 8) | octets[1]).toString(
      16
    )}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const morceaux = valeur.split("::");

  if (morceaux.length > 2) {
    return null;
  }

  const gauche = morceaux[0] ? morceaux[0].split(":") : [];
  const droite = morceaux.length === 2 && morceaux[1] ? morceaux[1].split(":") : [];

  if (gauche.some((morceau) => !morceau) || droite.some((morceau) => !morceau)) {
    return null;
  }

  const total = gauche.length + droite.length;

  if ((morceaux.length === 1 && total !== 8) || total > 8) {
    return null;
  }

  const groupes = [
    ...gauche,
    ...Array(Math.max(0, 8 - total)).fill("0"),
    ...droite,
  ].map((morceau) => {
    if (!/^[0-9a-f]{1,4}$/i.test(morceau)) {
      return Number.NaN;
    }

    return Number.parseInt(morceau, 16);
  });

  return groupes.length === 8 && groupes.every(Number.isFinite) ? groupes : null;
}

function estIpv6PriveeOuReservee(adresse) {
  const groupes = developperIpv6(adresse);

  if (!groupes) {
    return true;
  }

  const estToutZero = groupes.every((groupe) => groupe === 0);
  const estBoucleLocale = groupes.slice(0, 7).every((groupe) => groupe === 0) && groupes[7] === 1;
  const estIpv4Compatible = groupes.slice(0, 6).every((groupe) => groupe === 0);
  const estIpv4Mappee =
    groupes.slice(0, 5).every((groupe) => groupe === 0) && groupes[5] === 0xffff;

  if (estToutZero || estBoucleLocale || estIpv4Compatible) {
    return true;
  }

  if (estIpv4Mappee) {
    const ipv4 = [
      groupes[6] >> 8,
      groupes[6] & 0xff,
      groupes[7] >> 8,
      groupes[7] & 0xff,
    ].join(".");

    return estIpv4PriveeOuReservee(ipv4);
  }

  const premier = groupes[0];

  return Boolean(
    (premier & 0xfe00) === 0xfc00 || // fc00::/7, local unique
      (premier & 0xffc0) === 0xfe80 || // fe80::/10, link-local
      (premier & 0xff00) === 0xff00 || // ff00::/8, multicast
      (groupes[0] === 0x2001 && groupes[1] === 0x0db8) || // documentation
      (groupes[0] === 0x0100 && groupes.slice(1).every((groupe) => groupe === 0))
  );
}

function estAdressePriveeOuReservee(adresse) {
  const nomHote = normaliserNomHote(adresse);
  const famille = net.isIP(nomHote);

  if (famille === 4) {
    return estIpv4PriveeOuReservee(nomHote);
  }

  if (famille === 6) {
    return estIpv6PriveeOuReservee(nomHote);
  }

  return false;
}

function verifierNomHotePush(nomHote) {
  const nomNormalise = normaliserNomHote(nomHote);

  if (!nomNormalise) {
    throw creerErreurEndpointPushNonSecurise("Endpoint push sans nom d'hote.");
  }

  if (
    nomNormalise === "localhost" ||
    nomNormalise === "localhost.localdomain" ||
    nomNormalise.endsWith(".localhost") ||
    nomNormalise.endsWith(".local")
  ) {
    throw creerErreurEndpointPushNonSecurise("Endpoint push local interdit.");
  }

  if (estAdressePriveeOuReservee(nomNormalise)) {
    throw creerErreurEndpointPushNonSecurise("Adresse endpoint push privee ou reservee.");
  }

  return nomNormalise;
}

function normaliserEndpointPush(endpoint) {
  const valeur = typeof endpoint === "string" ? endpoint.trim() : "";

  if (!valeur || valeur.length > MAX_ENDPOINT_LENGTH || /[\u0000-\u001f\u007f]/.test(valeur)) {
    throw creerErreurEndpointPushNonSecurise("Format endpoint push invalide.");
  }

  let url;

  try {
    url = new URL(valeur);
  } catch {
    throw creerErreurEndpointPushNonSecurise("Format endpoint push invalide.");
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.port === "0"
  ) {
    throw creerErreurEndpointPushNonSecurise("Endpoint push HTTPS invalide.");
  }

  verifierNomHotePush(url.hostname);
  return url.toString();
}

function normaliserResultatsResolution(adresses, familleParDefaut) {
  const resultat = Array.isArray(adresses) ? adresses : [adresses];

  return resultat
    .map((adresse) => {
      if (typeof adresse === "string") {
        return {
          address: adresse,
          family: net.isIP(adresse) || familleParDefaut || 0,
        };
      }

      return {
        address: String(adresse?.address || ""),
        family: Number(adresse?.family) || net.isIP(adresse?.address || "") || familleParDefaut || 0,
      };
    })
    .filter((adresse) => net.isIP(adresse.address) === adresse.family);
}

function creerLookupPushSecurise(resolver = dns.lookup) {
  if (typeof resolver !== "function") {
    throw new TypeError("Le resolver DNS push doit etre une fonction.");
  }

  return (nomHote, options, rappel) => {
    const callback = typeof options === "function" ? options : rappel;
    const optionsLookup = typeof options === "object" && options ? options : {};

    if (typeof callback !== "function") {
      throw new TypeError("Le callback DNS push est obligatoire.");
    }

    try {
      verifierNomHotePush(nomHote);
    } catch (error) {
      process.nextTick(() => callback(error));
      return;
    }

    const famille = Number(optionsLookup.family);
    const demande = {
      all: true,
      verbatim: true,
    };

    if (famille === 4 || famille === 6) {
      demande.family = famille;
    }

    if (Number.isInteger(optionsLookup.hints)) {
      demande.hints = optionsLookup.hints;
    }

    try {
      resolver(nomHote, demande, (erreur, adresses) => {
        if (erreur) {
          callback(erreur);
          return;
        }

        const adressesPubliques = normaliserResultatsResolution(adresses, famille).filter(
          ({ address }) => !estAdressePriveeOuReservee(address)
        );

        if (adressesPubliques.length === 0) {
          callback(
            creerErreurEndpointPushNonSecurise(
              "Le nom d'hote push ne resout vers aucune adresse publique."
            )
          );
          return;
        }

        if (optionsLookup.all) {
          callback(null, adressesPubliques);
          return;
        }

        callback(null, adressesPubliques[0].address, adressesPubliques[0].family);
      });
    } catch (error) {
      process.nextTick(() => callback(error));
    }
  };
}

function creerAgentPushSecurise(options = {}) {
  return new https.Agent({
    keepAlive: false,
    lookup: options.lookup || creerLookupPushSecurise(options.resolver),
  });
}

module.exports = {
  MAX_ENDPOINT_LENGTH,
  ErreurEndpointPushNonSecurise,
  estAdressePriveeOuReservee,
  normaliserEndpointPush,
  verifierNomHotePush,
  creerLookupPushSecurise,
  creerAgentPushSecurise,
};
