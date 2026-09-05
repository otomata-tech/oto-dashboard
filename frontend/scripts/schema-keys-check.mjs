#!/usr/bin/env node
/**
 * Confronte les attributs de schéma de tableau que le dashboard LIT à ceux que la
 * plateforme DÉCLARE — dans les deux sens.
 *
 *   npm run schema:check                                   → prod (mcp.oto.cx)
 *   OTO_MCP_BASE=https://mcp.oto.ninja npm run schema:check → preprod
 *
 * ## Pourquoi ce contrôle existe
 *
 * La plateforme sert un avertissement (`unknown_keys_warning`) qui dit quels attributs
 * d'un schéma « ne sont lus par personne ». Elle ne sait que ce qu'ELLE interprète : son
 * validateur. Les attributs de PRÉSENTATION (`label`, `help`, `hint`…) n'existent que
 * pour un consommateur, et une première version de cet avertissement les a donc déclarés
 * morts. Six attributs ont été portés au retrait sur cette foi ; un seul l'était. Les
 * cinq autres étaient lus par un écran, en production. Le retrait a été arrêté à temps.
 *
 * Le seul chemin qui ferme cette classe est une confrontation entre les deux côtés. Ce
 * script l'exécute :
 *
 *   ① toute clé que le dashboard lit doit figurer dans ce que la plateforme connaît ;
 *   ② toute clé que la plateforme sert comme destinée au front doit être lue ici.
 *
 * ## Ce qu'il ne fait PAS : graver une liste
 *
 * Aucune liste d'attributs n'est écrite dans ce fichier, et il n'en existe aucun
 * instantané commité. Une liste recopiée deviendrait une seconde source de vérité, elle
 * dériverait, et elle reproduirait exactement le défaut qu'on corrige — un côté qui
 * croit savoir ce que l'autre lit. Les deux côtés sont donc DÉRIVÉS à chaque exécution :
 *
 *   - le côté dashboard, en analysant `src/types/api.ts` (l'interface `DatastoreField`)
 *     puis en exigeant, pour chaque membre, une preuve d'ACCÈS dans le code ;
 *   - le côté plateforme, en appelant `GET /api/datastore/schema/keys`.
 *
 * C'est aussi pour cela que ce contrôle dépend du réseau : il ne peut pas être hors
 * ligne sans cesser d'être un contrôle.
 *
 * ## Pourquoi l'interface, et pas seulement un grep
 *
 * `vue-tsc --build` est un cran bloquant du dépôt : aucun code typé ne peut lire un
 * attribut absent de `DatastoreField`. L'interface est donc un SUR-ENSEMBLE mécaniquement
 * garanti des lectures — c'est ce qui rend le sens ① complet. Elle serait en revanche
 * trop généreuse pour le sens ② (un membre déclaré puis abandonné passerait pour un
 * lecteur vivant), d'où l'exigence de preuve d'accès qui la resserre.
 *
 * ## Ce que la méthode ne peut pas voir — à lire avant de conclure « vert »
 *
 *   - un accès par clé calculée (`field[k]`) : aucun nom n'apparaît dans le source ;
 *   - le rest-spread de `DatastoreTable.vue` (`{ ...rest }` renvoyé au `PUT /schema`)
 *     transporte les attributs inconnus sans jamais les nommer ;
 *   - la preuve d'accès est textuelle : un `.label` porté par un tout autre objet
 *     compte comme une preuve. Le sens ② peut donc taire une promesse non tenue, il ne
 *     peut pas en inventer une ;
 *   - `readers: ["front"]` désigne LE FRONT, pas ce dashboard. Un attribut lu par un
 *     front tiers et par lui seul sera signalé ici comme promesse non tenue — le
 *     vocabulaire servi ne distingue pas encore les deux.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/** Le fichier qui déclare la forme d'une colonne de schéma, et le nom de l'interface. */
const TYPES = join(SRC, "types", "api.ts");
const INTERFACE = "DatastoreField";

/** Exclus du scan d'accès : les DÉCLARATIONS (où un nom apparaît sans être lu) et les
 *  tests (une fixture n'est pas une lecture du produit). */
const NOT_A_READ = [join(SRC, "types", "api.ts"), join(SRC, "types", "api.generated.ts")];
const isTest = (p) => /\.(spec|test)\.[tj]s$/.test(p);

const BASE = (process.env.OTO_MCP_BASE ?? "https://mcp.oto.cx").replace(/\/$/, "");
const URL_ = `${BASE}/api/datastore/schema/keys`;
const TOKEN = process.env.OTO_API_TOKEN ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// ① Le côté dashboard : ce que le code lit
// ─────────────────────────────────────────────────────────────────────────────

/** Les membres de `DatastoreField`, lus dans l'AST — pas au grep : un commentaire, une
 *  chaîne ou un type voisin ne doivent pas entrer dans la liste. */
function membresDeclares() {
  const src = ts.createSourceFile(TYPES, readFileSync(TYPES, "utf8"), ts.ScriptTarget.Latest, true);
  const noms = [];
  for (const st of src.statements) {
    if (!ts.isInterfaceDeclaration(st) || st.name.text !== INTERFACE) continue;
    for (const m of st.members) {
      if (!ts.isPropertySignature(m) || !m.name) continue;
      noms.push(ts.isIdentifier(m.name) ? m.name.text : m.name.getText(src).replace(/['"]/g, ""));
    }
  }
  if (!noms.length) {
    throw new Error(
      `[schema:check] interface \`${INTERFACE}\` introuvable (ou vide) dans ${relative(ROOT, TYPES)}.\n` +
        "  Ce contrôle DÉRIVE d'elle ce que le dashboard lit : sans elle il ne mesure rien.\n" +
        "  Si l'interface a été renommée ou déplacée, mettre à jour TYPES/INTERFACE en tête de ce fichier.",
    );
  }
  return noms;
}

/** Tous les fichiers de code du dashboard (hors déclarations et tests). */
function fichiersDeCode(dir = SRC, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      fichiersDeCode(p, out);
    } else if (/\.(ts|vue)$/.test(p) && !NOT_A_READ.includes(p) && !isTest(p)) {
      out.push(p);
    }
  }
  return out;
}

/** Les formes sous lesquelles une clé peut être LUE. Une clé lue par une seule d'entre
 *  elles suffit — c'est le pluriel qui compte : l'accès direct est le cas facile, la
 *  déstructuration et l'opérateur `in` sont ceux qu'un grep naïf manque. */
function formesDAcces(cle) {
  const k = cle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    [new RegExp(`\\.\\s*${k}\\b`), "accès direct"], //           f.label, f?.of
    [new RegExp(`\\[\\s*['"\`]${k}['"\`]\\s*\\]`), "accès indexé"], //  f["label"]
    [new RegExp(`['"\`]${k}['"\`]\\s+in\\s`), "opérateur in"], //       'fields' in f.of
    [new RegExp(`\\{[^{}]*\\b${k}\\b[^{}]*\\}\\s*=`), "déstructuration"], // const { hidden, ...r } = f
  ];
}

/** Pour chaque membre déclaré : la première preuve d'accès trouvée, ou rien. */
function preuvesDAcces(membres) {
  const preuve = new Map(membres.map((m) => [m, null]));
  const formes = new Map(membres.map((m) => [m, formesDAcces(m)]));
  for (const f of fichiersDeCode()) {
    const lignes = readFileSync(f, "utf8").split("\n");
    for (const m of membres) {
      if (preuve.get(m)) continue;
      for (let i = 0; i < lignes.length; i++) {
        const hit = formes.get(m).find(([re]) => re.test(lignes[i]));
        if (hit) {
          preuve.set(m, { fichier: `${relative(ROOT, f)}:${i + 1}`, forme: hit[1] });
          break;
        }
      }
    }
  }
  return preuve;
}

// ─────────────────────────────────────────────────────────────────────────────
// ② Le côté plateforme : ce que la route déclare
// ─────────────────────────────────────────────────────────────────────────────

async function clesServies() {
  const resp = await fetch(URL_, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
    signal: AbortSignal.timeout(30000),
  });
  if (resp.status === 401 || resp.status === 403) {
    const corps = await resp.text().catch(() => "");
    throw new Error(
      `[schema:check] ${URL_} → HTTP ${resp.status}\n` +
        `  ${corps.slice(0, 400)}\n\n` +
        (TOKEN
          ? "  Le jeton fourni n'ouvre pas ce geste. La route est une CONSTANTE de plateforme\n" +
            "  (aucune donnée d'org), mais elle n'est aujourd'hui atteignable ni par un jeton\n" +
            "  porté, ni sans authentification. Tant que ce n'est pas levé côté plateforme, ce\n" +
            "  contrôle ne peut pas s'exécuter — et il échoue plutôt que de passer au vert.\n"
          : "  Aucun jeton fourni : poser `OTO_API_TOKEN` dans l'environnement.\n"),
    );
  }
  if (!resp.ok) throw new Error(`[schema:check] ${URL_} → HTTP ${resp.status}`);
  const doc = await resp.json();
  const keys = doc?.keys;
  if (!Array.isArray(keys) || !keys.length || !keys.every((k) => typeof k?.key === "string")) {
    throw new Error(
      `[schema:check] ${URL_} a répondu 200 mais sans liste de clés exploitable.\n` +
        "  Un contrôle qui ne sait pas ce qu'il compare doit échouer, pas conclure.",
    );
  }
  return keys;
}

// ─────────────────────────────────────────────────────────────────────────────
// La confrontation
// ─────────────────────────────────────────────────────────────────────────────

const membres = membresDeclares();
const preuve = preuvesDAcces(membres);
const lues = membres.filter((m) => preuve.get(m));
const declareesSansAcces = membres.filter((m) => !preuve.get(m));

// Une trace de pile n'apprend rien à qui lit un journal de CI ; la cause, si. Le code
// de sortie reste 1 dans tous les cas : ne pas POUVOIR contrôler n'est pas « vert ».
const servies = await clesServies().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
const connues = new Set(servies.map((k) => k.key));
const pourLeFront = servies.filter((k) => (k.readers ?? []).includes("front"));

const lueNonServie = lues.filter((k) => !connues.has(k));
const serviePourRien = pourLeFront.filter((k) => !lues.includes(k.key));

console.log(`Plateforme  ${URL_}`);
console.log(`            ${servies.length} attributs déclarés, dont ${pourLeFront.length} annoncés lus par le front`);
console.log(`Dashboard   ${relative(ROOT, TYPES)} → ${INTERFACE}`);
console.log(`            ${membres.length} membres déclarés, ${lues.length} avec une preuve d'accès dans le code`);
if (declareesSansAcces.length) {
  console.log(
    `            (sans accès trouvé, donc comptés NON LUS : ${declareesSansAcces.join(", ")})`,
  );
}
console.log("");

if (!lueNonServie.length && !serviePourRien.length) {
  console.log("Les deux côtés disent la même chose.");
  process.exit(0);
}

for (const k of lueNonServie) {
  const p = preuve.get(k);
  console.error(
    `ÉCART  \`${k}\` — LUE ICI, INCONNUE DE LA PLATEFORME\n` +
      `       Lue en ${p.fichier} (${p.forme}), absente de ${URL_}.\n` +
      "       Le dashboard s'appuie sur un attribut que la plateforme ne connaît pas : il\n" +
      "       traverse la validation en silence, donc une faute de frappe y est invisible et\n" +
      "       l'avertissement `unknown_keys_warning` le dénoncera sur tous les tableaux.\n" +
      "       Geste : le faire déclarer côté plateforme (oto-backend, la déclaration des\n" +
      "       attributs de colonne du datastore), ou cesser de le lire ici.\n",
  );
}

for (const k of serviePourRien) {
  console.error(
    `ÉCART  \`${k.key}\` — SERVIE COMME LUE PAR LE FRONT, JAMAIS LUE ICI\n` +
      `       readers: [${(k.readers ?? []).join(", ")}] — « ${k.what} »\n` +
      "       Aucun accès dans le code du dashboard, et aucun membre correspondant dans\n" +
      `       ${INTERFACE}. La plateforme promet un lecteur qui n'existe pas : cet attribut\n` +
      "       est réputé vivant, donc jamais signalé, et personne ne le rend.\n" +
      "       Geste : le lire ici (l'ajouter à l'interface ET au rendu), ou retirer `front`\n" +
      "       de ses lecteurs côté plateforme — un attribut lu par un front TIERS et par lui\n" +
      "       seul appelle la même correction : le vocabulaire servi doit le distinguer.\n",
  );
}

console.error(
  `${lueNonServie.length} lue(s) et non servie(s), ${serviePourRien.length} servie(s) au front et jamais lue(s).`,
);
process.exit(1);
