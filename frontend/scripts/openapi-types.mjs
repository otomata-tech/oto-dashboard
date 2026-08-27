#!/usr/bin/env node
/**
 * Dérive `src/types/api.generated.ts` du descriptif REST servi par oto-backend.
 *
 * Le dashboard ne recopie plus les contrats du backend à la main : il les DÉRIVE du
 * document OpenAPI que le backend produit depuis son registre de capacités
 * (`GET /api/openapi.json` — « dérivé du serveur à chaque requête : il décrit ce qui
 * tourne, pas une intention »).
 *
 *   node scripts/openapi-types.mjs           → (ré)écrit le fichier généré
 *   node scripts/openapi-types.mjs --check    → ne l'écrit PAS : compare, et sort 1
 *                                               avec le diff s'il a dérivé
 *
 * La SOURCE est le snapshot commité (`openapi/oto-openapi.json`), jamais le réseau :
 * la génération doit être reproductible hors ligne, sinon le contrôle CI mesurerait la
 * disponibilité du backend au lieu de mesurer la dérive. Rafraîchir le snapshot depuis
 * un backend vivant est un acte séparé et volontaire : `npm run api:refresh`.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SNAPSHOT = resolve(__dirname, "../openapi/oto-openapi.json");
export const PROVENANCE = resolve(__dirname, "../openapi/snapshot.json");
export const TARGET = resolve(__dirname, "../src/types/api.generated.ts");
const CLI = resolve(__dirname, "../node_modules/openapi-typescript/bin/cli.js");

/** En-tête du fichier généré, SANS horodatage : un fichier généré qui porte une date
 *  diffère à chaque exécution — le contrôle de dérive deviendrait illisible. */
const BANNER = `/**
 * FICHIER GÉNÉRÉ — NE PAS ÉDITER À LA MAIN.
 *
 * Dérivé de \`openapi/oto-openapi.json\` (snapshot du document OpenAPI servi par
 * oto-backend) via \`npm run api:gen\`. Une correction se fait EN AMONT : côté backend,
 * en déclarant ou corrigeant l'\`Output\` de la capacité, puis \`npm run api:refresh\` ici.
 *
 * Ce fichier n'est pas celui qu'on importe dans un écran : les types d'écran portent
 * des noms et vivent dans \`src/types/api.ts\`, qui s'y branche par des alias.
 */
`;

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** Un `operationId` dupliqué n'est pas un détail cosmétique : la surface typée est
 *  indexée dessus, donc un chemin écrase l'autre — silencieusement. On ne peut pas le
 *  corriger ici (c'est le backend qui nomme ses opérations), mais on refuse de le
 *  laisser passer sans le dire. */
export function duplicateOperationIds(doc) {
  const seen = new Map();
  for (const [path, verbs] of Object.entries(doc.paths ?? {})) {
    for (const [verb, op] of Object.entries(verbs)) {
      if (typeof op !== "object" || op === null || Array.isArray(op) || !op.operationId) continue;
      seen.set(op.operationId, [...(seen.get(op.operationId) ?? []), `${verb.toUpperCase()} ${path}`]);
    }
  }
  return [...seen].filter(([, at]) => at.length > 1);
}

export function warnDuplicates(doc) {
  const dups = duplicateOperationIds(doc);
  if (!dups.length) return;
  console.warn(`[api:types] ${dups.length} \`operationId\` dupliqués dans le document servi — les`);
  console.warn("            opérations concernées sont typées sous `paths`, pas sous `operations` :");
  for (const [id, at] of dups) console.warn(`            ${id} : ${at.join(" · ")}`);
}

/** Le document servi viole l'unicité des `operationId` (deux capacités servies à trois
 *  scopes réutilisent le même identifiant). Or `operations` est un objet indexé par cet
 *  identifiant : le générateur produit alors un fichier qui NE COMPILE PAS (TS2300 /
 *  TS2717), et l'ambiguïté ne se voit qu'au typecheck, très loin de sa cause.
 *
 *  On ne l'invente pas et on ne choisit pas de gagnant : on RETIRE l'`operationId` des
 *  occurrences en conflit. openapi-typescript type alors ces opérations directement sous
 *  `paths[...]`, chacune avec ses vrais paramètres — rien n'est perdu, rien n'est
 *  arbitré. La normalisation est annoncée à chaque exécution, et redevient un no-op le
 *  jour où le backend nomme ces opérations distinctement (c'est là qu'est le correctif).
 */
export function normalize(doc) {
  const dups = new Set(duplicateOperationIds(doc).map(([id]) => id));
  if (!dups.size) return doc;
  const copy = structuredClone(doc);
  for (const verbs of Object.values(copy.paths ?? {})) {
    for (const op of Object.values(verbs)) {
      if (typeof op !== "object" || op === null || Array.isArray(op)) continue;
      if (dups.has(op.operationId)) delete op.operationId;
    }
  }
  return copy;
}

/** Génère via le binaire d'openapi-typescript (son entrée supportée), pas via son API
 *  interne : le contrat de sortie est celui de l'outil, et rien de ce qu'on écrit ici
 *  ne peut le faire diverger d'une exécution manuelle de la CLI. */
export function render(doc) {
  const dir = mkdtempSync(resolve(tmpdir(), "oto-api-types-"));
  const input = resolve(dir, "openapi.json");
  const out = resolve(dir, "api.generated.ts");
  try {
    writeFileSync(input, JSON.stringify(normalize(doc)));
    execFileSync(process.execPath, [CLI, input, "-o", out], { stdio: ["ignore", "ignore", "inherit"] });
    return BANNER + readFileSync(out, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = readFileSync(SNAPSHOT, "utf8");
  const provenance = JSON.parse(readFileSync(PROVENANCE, "utf8"));
  if (provenance.sha256 && provenance.sha256 !== sha256(raw)) {
    console.error(
      "[api:types] le snapshot ne correspond plus à son empreinte (openapi/snapshot.json).\n" +
        "            Un document OpenAPI ne s'édite pas à la main : rafraîchis-le depuis le\n" +
        "            backend avec `npm run api:refresh`.",
    );
    process.exit(1);
  }
  const doc = JSON.parse(raw);
  warnDuplicates(doc);
  const generated = render(doc);

  if (!process.argv.includes("--check")) {
    writeFileSync(TARGET, generated);
    console.log(`[api:types] src/types/api.generated.ts régénéré (${generated.split("\n").length} lignes).`);
    process.exit(0);
  }
  const current = readFileSync(TARGET, "utf8");
  if (current === generated) {
    console.log("[api:types] à jour — le fichier généré correspond au snapshot commité.");
    process.exit(0);
  }
  console.error("[api:types] DÉRIVE : src/types/api.generated.ts ne correspond plus au snapshot commité.");
  console.error("            Régénère (`npm run api:gen`) et commite le résultat.\n");
  const a = current.split("\n");
  const b = generated.split("\n");
  let shown = 0;
  for (let i = 0; i < Math.max(a.length, b.length) && shown < 40; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) console.error(`  -${i + 1}: ${a[i]}`);
    if (b[i] !== undefined) console.error(`  +${i + 1}: ${b[i]}`);
    shown++;
  }
  if (shown >= 40) console.error("  … (diff tronqué)");
  process.exit(1);
}
