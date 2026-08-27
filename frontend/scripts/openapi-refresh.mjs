#!/usr/bin/env node
/**
 * Rafraîchit le snapshot du document OpenAPI depuis un backend VIVANT, puis
 * régénère les types dérivés.
 *
 *   npm run api:refresh                                   → prod (mcp.oto.cx)
 *   OTO_MCP_BASE=https://mcp.oto.ninja npm run api:refresh → preprod
 *
 * Acte volontaire, jamais automatique au build : rafraîchir le snapshot change le
 * contrat auquel le dashboard se compile. Le diff produit ici EST l'information —
 * il dit ce que le backend a changé depuis le dernier rafraîchissement.
 *
 * Échoue (sans rien écrire) si le backend ne répond pas : un snapshot commité vaut
 * mieux qu'un snapshot tronqué, et un contrat ne se devine pas.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PROVENANCE, SNAPSHOT, TARGET, render, sha256, warnDuplicates } from "./openapi-types.mjs";

const BASE = (process.env.OTO_MCP_BASE ?? "https://mcp.oto.cx").replace(/\/$/, "");
const URL_ = process.env.OTO_OPENAPI_URL ?? `${BASE}/api/openapi.json`;

/** Ce que le document décrit vraiment — la couverture est la mesure qui compte :
 *  une opération sans schéma de réponse est un type que le dashboard doit écrire
 *  à la main (dette `Capability.Output` côté backend). */
function coverageOf(doc) {
  let operations = 0;
  let withResponse = 0;
  let legacy = 0;
  for (const verbs of Object.values(doc.paths ?? {})) {
    for (const op of Object.values(verbs)) {
      if (typeof op !== "object" || op === null || Array.isArray(op)) continue;
      operations += 1;
      if ((op.tags ?? []).includes("_legacy")) legacy += 1;
      if (op.responses?.["200"]?.content?.["application/json"]?.schema) withResponse += 1;
    }
  }
  return { operations, withResponse, legacy, schemas: Object.keys(doc.components?.schemas ?? {}).length };
}

const resp = await fetch(URL_, { signal: AbortSignal.timeout(30000) });
if (!resp.ok) throw new Error(`[api:refresh] ${URL_} → HTTP ${resp.status}`);
const doc = await resp.json();

const before = readFileSync(SNAPSHOT, "utf8");
// Sérialisation FIGÉE (2 espaces, clés dans l'ordre servi) : le snapshot est un
// fichier versionné, son diff doit refléter le backend, pas un caprice de format.
const after = JSON.stringify(doc, null, 2) + "\n";
const coverage = coverageOf(doc);

writeFileSync(SNAPSHOT, after);
writeFileSync(
  PROVENANCE,
  JSON.stringify(
    { source: URL_, fetched_at: new Date().toISOString(), sha256: sha256(after), coverage },
    null,
    2,
  ) + "\n",
);
warnDuplicates(doc);
writeFileSync(TARGET, render(doc));

console.log(
  `[api:refresh] ${URL_} — ${coverage.operations} opérations · ${coverage.withResponse} avec un ` +
    `schéma de réponse · ${coverage.legacy} héritées · ${coverage.schemas} schémas nommés`,
);
console.log(before === after ? "[api:refresh] snapshot INCHANGÉ." : "[api:refresh] snapshot MIS À JOUR (le backend a bougé).");
