#!/usr/bin/env node
// Push the riseup-cli session (cookies + commit hash) into the Convex `config`
// table so the dashboard's /refresh action can authenticate against RiseUp.
//
// Run this after `riseup login` (or `node riseup-cli-main/dist/cli.js login`)
// regenerates ~/.config/riseup-cli/session.json.
//
// Usage: node dashboard/scripts/push-session.mjs

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Resolve the CLI session path (matches SessionManager precedence) ---
function getSessionPath() {
  if (process.env.RISEUP_AUTH) return process.env.RISEUP_AUTH;
  const configDir = process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, "riseup-cli")
    : join(homedir(), ".config", "riseup-cli");
  return join(configDir, "session.json");
}

// --- Read VITE_CONVEX_URL from dashboard/.env.local ---
function getConvexUrl() {
  if (process.env.VITE_CONVEX_URL) return process.env.VITE_CONVEX_URL;
  const envPath = join(__dirname, "..", ".env.local");
  const env = readFileSync(envPath, "utf8");
  const match = env.match(/^VITE_CONVEX_URL=(.+)$/m);
  if (!match) throw new Error(`VITE_CONVEX_URL not found in ${envPath}`);
  return match[1].trim();
}

async function setConfig(convexUrl, key, value) {
  const res = await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "mutations:setConfig",
      args: { key, value },
      format: "json",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.status === "success") {
    console.log(`  + ${key} (${value.length} chars)`);
  } else {
    throw new Error(`${key}: ${JSON.stringify(body).slice(0, 300)}`);
  }
}

async function main() {
  const sessionPath = getSessionPath();
  let session;
  try {
    session = JSON.parse(readFileSync(sessionPath, "utf8"));
  } catch (e) {
    throw new Error(
      `Could not read session at ${sessionPath} — run \`riseup login\` first. (${e.message})`
    );
  }

  const { cookies, commitHash } = session;
  if (!cookies || !commitHash) {
    throw new Error(
      `Session at ${sessionPath} is missing cookies/commitHash — re-run \`riseup login\`.`
    );
  }

  const convexUrl = getConvexUrl();
  console.log(`Pushing session from ${sessionPath}`);
  console.log(`  -> ${convexUrl}`);

  await setConfig(convexUrl, "RISEUP_COOKIES", cookies);
  await setConfig(convexUrl, "RISEUP_COMMIT_HASH", commitHash);

  console.log("Done. Click Refresh in the dashboard.");
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
