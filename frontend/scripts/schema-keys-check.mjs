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
 * ## La base : `schema-keys-dette.txt`
 *
 * Au premier passage, ce contrôle trouvait DIX écarts réels. Un témoin qui naît rouge
 * n'est jamais lu — personne n'aurait plus jamais distingué le onzième. Le fichier voisin
 * liste donc les écarts CONNUS, et le contrôle échoue sur ce qui n'y figure pas.
 *
 * Ce n'est pas une liste de clés recopiée — ce serait exactement ce qu'on refuse ici. Ce
 * sont des ÉCARTS : chaque ligne dit qu'à une date donnée, les deux côtés ne disaient pas
 * la même chose sur un attribut. Elle ne remplace ni le code ni la route ; les deux
 * restent dérivés à chaque exécution.
 *
 * Elle ne doit que DÉCROÎTRE, et le contrôle échoue dans les deux sens pour cela : un
 * écart nouveau la contourne, et un écart RÉGLÉ qui y traîne encore la fait échouer aussi
 * — sinon une dette soldée y dort pour toujours, et le jour où elle revient, elle rentre
 * sans un mot.
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

/** La DETTE connue — ce que ce contrôle sait déjà, et ne redit pas. Ce n'est pas une
 *  liste de clés recopiée : c'est une liste d'ÉCARTS constatés, chacun daté par le
 *  fichier lui-même. Elle ne remplace aucun des deux côtés, elle les regarde diverger. */
const DETTE = join(ROOT, "scripts", "schema-keys-dette.txt");
const LUE_NON_SERVIE = "lue-non-servie";
const SERVIE_NON_LUE = "servie-non-lue";

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
// La dette : ce qu'on sait déjà, et qui ne doit que décroître
// ─────────────────────────────────────────────────────────────────────────────

/** Les écarts déjà connus, `"<sens> <clé>"` → numéro de ligne (pour pouvoir dire OÙ
 *  retirer une dette réglée). Un fichier illisible ou une ligne mal formée FAIT ÉCHOUER :
 *  une base de témoin qu'on n'arrive pas à lire n'est pas une base vide. */
function detteConnue() {
  let brut;
  try {
    brut = readFileSync(DETTE, "utf8");
  } catch {
    throw new Error(
      `[schema:check] base de dette introuvable : ${relative(ROOT, DETTE)}\n` +
        "  Ce contrôle échoue sur ce qui n'y figure PAS. Sans elle il ne sait pas ce qui est\n" +
        "  déjà connu, et il redirait tout — un témoin qui crie tout ne se lit plus.\n" +
        "  Un fichier vide est une réponse valable (« plus aucune dette ») : le créer vide.",
    );
  }
  const connue = new Map();
  brut.split("\n").forEach((ligne, i) => {
    const l = ligne.trim();
    if (!l || l.startsWith("#")) return;
    const [sens, cle, ...reste] = l.split(/\s+/);
    if (reste.length || !cle || (sens !== LUE_NON_SERVIE && sens !== SERVIE_NON_LUE)) {
      throw new Error(
        `[schema:check] ${relative(ROOT, DETTE)}:${i + 1} — ligne illisible : « ${l} »\n` +
          `  Format attendu : \`${LUE_NON_SERVIE}|${SERVIE_NON_LUE} <clé>\`, une par ligne.`,
      );
    }
    if (connue.has(`${sens} ${cle}`)) {
      throw new Error(
        `[schema:check] ${relative(ROOT, DETTE)}:${i + 1} — \`${sens} ${cle}\` est déjà ` +
          `ligne ${connue.get(`${sens} ${cle}`)}. Une dette comptée deux fois se retire à moitié.`,
      );
    }
    connue.set(`${sens} ${cle}`, i + 1);
  });
  return connue;
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

// Une trace de pile n'apprend rien à qui lit un journal de CI ; la cause, si. Le code
// de sortie reste 1 dans tous les cas : ne pas POUVOIR contrôler n'est pas « vert ».
async function ou_echouer(f) {
  try {
    return await f();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

const membres = await ou_echouer(membresDeclares);
const preuve = preuvesDAcces(membres);
const lues = membres.filter((m) => preuve.get(m));
const declareesSansAcces = membres.filter((m) => !preuve.get(m));

const servies = await ou_echouer(clesServies);
const connues = new Set(servies.map((k) => k.key));
const pourLeFront = servies.filter((k) => (k.readers ?? []).includes("front"));

/** Les écarts CONSTATÉS aujourd'hui, les deux sens confondus. */
const ecarts = [
  ...lues
    .filter((k) => !connues.has(k))
    .map((k) => ({ sens: LUE_NON_SERVIE, cle: k })),
  ...pourLeFront
    .filter((k) => !lues.includes(k.key))
    .map((k) => ({ sens: SERVIE_NON_LUE, cle: k.key, servie: k })),
];

const dette = await ou_echouer(detteConnue);
const vus = new Set(ecarts.map((e) => `${e.sens} ${e.cle}`));
const nouveaux = ecarts.filter((e) => !dette.has(`${e.sens} ${e.cle}`));
const reglees = [...dette.entries()].filter(([id]) => !vus.has(id));

console.log(`Plateforme  ${URL_}`);
console.log(`            ${servies.length} attributs déclarés, dont ${pourLeFront.length} annoncés lus par le front`);
console.log(`Dashboard   ${relative(ROOT, TYPES)} → ${INTERFACE}`);
console.log(`            ${membres.length} membres déclarés, ${lues.length} avec une preuve d'accès dans le code`);
if (declareesSansAcces.length) {
  console.log(
    `            (sans accès trouvé, donc comptés NON LUS : ${declareesSansAcces.join(", ")})`,
  );
}
console.log(`Dette       ${relative(ROOT, DETTE)} — ${dette.size} ligne(s), ${ecarts.length} écart(s) constaté(s)`);
console.log("");

if (!nouveaux.length && !reglees.length) {
  console.log(
    dette.size
      ? `Aucun écart hors de la dette connue (${dette.size} ligne(s) restent à régler).`
      : "Les deux côtés disent la même chose, et la dette est soldée.",
  );
  process.exit(0);
}

for (const e of nouveaux.filter((e) => e.sens === LUE_NON_SERVIE)) {
  const p = preuve.get(e.cle);
  console.error(
    `ÉCART  \`${e.cle}\` — LUE ICI, INCONNUE DE LA PLATEFORME\n` +
      `       Lue en ${p.fichier} (${p.forme}), absente de ${URL_}.\n` +
      "       Le dashboard s'appuie sur un attribut que la plateforme ne connaît pas : il\n" +
      "       traverse la validation en silence, donc une faute de frappe y est invisible et\n" +
      "       l'avertissement `unknown_keys_warning` le dénoncera sur tous les tableaux.\n" +
      "       Geste : le faire déclarer côté plateforme (oto-backend, la déclaration des\n" +
      "       attributs de colonne du datastore), ou cesser de le lire ici.\n",
  );
}

for (const e of nouveaux.filter((e) => e.sens === SERVIE_NON_LUE)) {
  console.error(
    `ÉCART  \`${e.cle}\` — SERVIE COMME LUE PAR LE FRONT, JAMAIS LUE ICI\n` +
      `       readers: [${(e.servie.readers ?? []).join(", ")}] — « ${e.servie.what} »\n` +
      "       Aucun accès dans le code du dashboard, et aucun membre correspondant dans\n" +
      `       ${INTERFACE}. La plateforme promet un lecteur qui n'existe pas : cet attribut\n` +
      "       est réputé vivant, donc jamais signalé, et personne ne le rend.\n" +
      "       Geste : le lire ici (l'ajouter à l'interface ET au rendu), ou retirer `front`\n" +
      "       de ses lecteurs côté plateforme — un attribut lu par un front TIERS et par lui\n" +
      "       seul appelle la même correction : le vocabulaire servi doit le distinguer.\n",
  );
}

for (const [id, ligne] of reglees) {
  console.error(
    `DETTE RÉGLÉE  \`${id}\` n'est plus un écart — retirer sa ligne.\n` +
      `              ${relative(ROOT, DETTE)}:${ligne} porte encore cette dette. Les deux côtés\n` +
      "              se sont rejoints : la laisser dormir ferait mentir la liste sur ce qu'elle\n" +
      "              coûte encore, et le jour où l'écart revient, il rentrerait sans un mot.\n" +
      "              Geste : supprimer la ligne, dans le commit qui a réglé l'écart.\n",
  );
}

if (nouveaux.length) {
  console.error(
    `${nouveaux.length} écart(s) hors de la dette connue. Les régler, ou — si c'est une DÉCISION —\n` +
      `les inscrire dans ${relative(ROOT, DETTE)} par un commit qui dit pourquoi.`,
  );
}
if (reglees.length) {
  console.error(`${reglees.length} ligne(s) de dette à retirer.`);
}
process.exit(1);
