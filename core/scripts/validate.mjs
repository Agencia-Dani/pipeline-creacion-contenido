#!/usr/bin/env node
// Validador del contrato de workflows (core/contracts/workflow-manifest.md v1).
// Uso: node core/scripts/validate.mjs   (desde cualquier directorio del repo)
// Exit 0 = todo en verde · Exit 1 = violaciones del contrato.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ENGINES = ["n8n", "openclaw", "script"];
const STATUSES = ["draft", "active", "paused", "inactive", "retired"];
const TRIGGER_TYPES = ["cron", "form", "webhook", "conversation", "manual"];
const FILTER_TYPES = ["number", "string", "list", "object", "boolean"];
const FILTER_SCOPES = ["client", "run"];
const STAGE_KEYS = [
  "colectar", "normalizar", "filtrar_scorear", "enriquecer",
  "generar", "calidad", "entregar", "notificar",
];

// Patrones de secretos reales (los placeholders tipo <ANTHROPIC_API_KEY> o secret_xxx no matchean)
const SECRET_PATTERNS = [
  [/sk-ant-[A-Za-z0-9-]{20,}/, "Anthropic API key"],
  [/sk-[A-Za-z0-9]{32,}/, "API key genérica (sk-...)"],
  [/secret_[A-Za-z0-9]{20,}/, "Notion token"],
  [/ghp_[A-Za-z0-9]{20,}/, "GitHub token"],
  [/xox[bpars]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/apify_api_[A-Za-z0-9]{20,}/, "Apify token"],
  [/eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "JWT"],
];

let errors = [];
let checks = 0;
const fail = (where, msg) => errors.push(`✗ [${where}] ${msg}`);
const ok = () => checks++;

function check(where, cond, msg) {
  cond ? ok() : fail(where, msg);
}

// ---------- 1. Manifests de workflows ----------
const wfRoot = join(REPO, "Workflows");
const wfDirs = readdirSync(wfRoot).filter(
  (d) => statSync(join(wfRoot, d)).isDirectory(),
);

for (const dir of wfDirs) {
  const where = `Workflows/${dir}`;
  check(where, dir.startsWith("workflow-"), "la carpeta debe llamarse workflow-<id>");
  const manifestPath = join(wfRoot, dir, "workflow.yaml");
  if (!existsSync(manifestPath)) {
    fail(where, "falta workflow.yaml (todo workflow debe tener manifest)");
    continue;
  }
  let m;
  try {
    m = YAML.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    fail(where, `workflow.yaml no parsea: ${e.message}`);
    continue;
  }

  // Campos obligatorios
  for (const f of ["contract_version", "id", "name", "description", "engine", "status", "owner", "triggers", "inputs", "stages", "outputs", "runbook", "cost_per_run"]) {
    check(where, m?.[f] !== undefined && m?.[f] !== null, `falta el campo obligatorio '${f}'`);
  }
  if (!m) continue;

  check(where, m.contract_version === 1, `contract_version desconocida: ${m.contract_version}`);
  check(where, dir === `workflow-${m.id}`, `id '${m.id}' no coincide con la carpeta '${dir}' (debe ser workflow-<id>)`);
  check(where, ENGINES.includes(m.engine), `engine '${m.engine}' no es válido (${ENGINES.join("|")})`);
  check(where, STATUSES.includes(m.status), `status '${m.status}' no es válido (${STATUSES.join("|")})`);

  // Triggers
  const triggers = Array.isArray(m.triggers) ? m.triggers : [];
  check(where, triggers.length >= 1, "triggers debe tener al menos un elemento");
  for (const t of triggers) {
    check(where, TRIGGER_TYPES.includes(t?.type), `trigger.type '${t?.type}' no es válido`);
    if (t?.type === "cron") {
      check(where, !!t.schedule, "trigger cron sin 'schedule'");
      check(where, !!t.timezone, "trigger cron sin 'timezone' (OBLIGATORIA — incidente real de TZ)");
    }
  }

  // Inputs
  check(where, !!m.inputs?.client_config, "falta inputs.client_config");
  const filters = m.inputs?.filters;
  check(where, Array.isArray(filters), "inputs.filters debe ser una lista (puede ser vacía)");
  for (const f of filters ?? []) {
    check(where, /^[a-z][a-z0-9_]*$/.test(f?.key ?? ""), `filtro con key inválida '${f?.key}' (snake_case)`);
    check(where, FILTER_TYPES.includes(f?.type), `filtro '${f?.key}' con type inválido '${f?.type}'`);
    check(where, FILTER_SCOPES.includes(f?.scope), `filtro '${f?.key}' con scope inválido '${f?.scope}' (client|run)`);
  }
  const creds = m.inputs?.credentials;
  check(where, Array.isArray(creds), "inputs.credentials debe ser una lista (puede ser vacía)");
  for (const c of creds ?? []) {
    check(where, typeof c === "string" && /^[a-z][a-z0-9_]*$/.test(c),
      `credencial '${c}' debe ser un NOMBRE snake_case (nunca un valor)`);
  }

  // Stages: exactamente las 8 etapas canónicas, sin vacíos
  const stages = m.stages ?? {};
  for (const k of STAGE_KEYS) {
    const v = stages[k];
    check(where, typeof v === "string" && v.trim() !== "",
      `stage '${k}' falta o está vacío (usar "n/a" si no aplica)`);
  }
  for (const k of Object.keys(stages)) {
    check(where, STAGE_KEYS.includes(k), `stage desconocido '${k}' (las 8 etapas canónicas de PLAN.md §2.4)`);
  }

  // Outputs
  const outputs = Array.isArray(m.outputs) ? m.outputs : [];
  check(where, outputs.length >= 1, "outputs debe tener al menos un elemento");
  for (const o of outputs) {
    check(where, !!o?.type, "output sin 'type'");
    check(where, !!o?.destination_native, `output '${o?.type}' sin 'destination_native'`);
    check(where, ["pending", "yes"].includes(o?.registered), `output '${o?.type}': registered debe ser pending|yes`);
  }

  // Runbook
  for (const f of ["setup", "start", "stop", "test"]) {
    check(where, !!m.runbook?.[f], `runbook sin '${f}'`);
  }
}

// ---------- 2. Configs de clientes ----------
const clientsRoot = join(REPO, "clients");
const workflowIds = wfDirs.map((d) => d.replace(/^workflow-/, ""));
if (existsSync(clientsRoot)) {
  for (const cdir of readdirSync(clientsRoot)) {
    const cpath = join(clientsRoot, cdir);
    if (!statSync(cpath).isDirectory()) continue;
    const esPlantilla = cdir.startsWith("_");
    for (const f of readdirSync(cpath).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))) {
      const where = `clients/${cdir}/${f}`;
      const wfId = basename(f).replace(/\.ya?ml$/, "");
      check(where, workflowIds.includes(wfId),
        `el archivo debe llamarse <workflow-id>.yaml — '${wfId}' no es un workflow existente (${workflowIds.join(", ")})`);
      try {
        const cfg = YAML.parse(readFileSync(join(cpath, f), "utf8"));
        if (!esPlantilla) {
          check(where, cfg?.cliente === cdir, `'cliente: ${cfg?.cliente}' no coincide con la carpeta '${cdir}'`);
        }
        for (const k of Object.keys(cfg ?? {})) {
          check(where, /^[a-z][a-z0-9_]*$/.test(k), `clave '${k}' no es snake_case`);
        }
      } catch (e) {
        fail(where, `no parsea: ${e.message}`);
      }
    }
  }
}

// ---------- 3. Escaneo de secretos en archivos versionados ----------
let tracked = [];
try {
  tracked = execSync("git ls-files", { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
} catch {
  fail("repo", "no se pudo listar archivos con git ls-files");
}
// También los archivos nuevos aún sin trackear (que van a entrar al próximo commit)
try {
  const untracked = execSync("git ls-files --others --exclude-standard", { cwd: REPO, encoding: "utf8" })
    .split("\n").filter(Boolean);
  tracked.push(...untracked);
} catch { /* ya reportado arriba */ }

const TEXT_EXT = /\.(md|ya?ml|json|js|mjs|py|txt|sql|sh|env|csv)$/i;
for (const file of tracked) {
  if (!TEXT_EXT.test(file)) continue;
  if (file.includes("node_modules/")) continue;
  let content;
  try {
    content = readFileSync(join(REPO, file), "utf8");
  } catch {
    continue;
  }
  for (const [re, label] of SECRET_PATTERNS) {
    if (re.test(content)) {
      // Este propio archivo define los patrones — se excluye a sí mismo
      if (file.endsWith("core/scripts/validate.mjs")) continue;
      fail(file, `posible secreto real en el repo (${label}) — los secretos viven en los motores, JAMÁS en git`);
    } else {
      ok();
    }
  }
}

// ---------- Resultado ----------
console.log(`\nValidador del contrato — ${wfDirs.length} workflows, ${checks} checks OK, ${errors.length} errores\n`);
if (errors.length) {
  for (const e of errors) console.error(e);
  console.error("\n❌ El contrato NO se cumple. Corregir antes de commitear/deployar.");
  process.exit(1);
}
console.log("✅ Todo en verde: manifests, configs de clientes y escaneo de secretos.");
