/**
 * Writes apps/web/.env.production.local from deploy env for Vercel.
 * Set SOVEREIGN_ALPHA_API_URL or NEXT_PUBLIC_API_URL at build time.
 */
const fs = require("fs");
const path = require("path");

const apiRoot = (process.env.NEXT_PUBLIC_API_URL || process.env.SOVEREIGN_ALPHA_API_URL || "http://localhost:8000").replace(/\/$/, "");
const wsRoot = (process.env.NEXT_PUBLIC_WS_URL || apiRoot.replace(/^https:/, "wss:").replace(/^http:/, "ws:")).replace(/\/$/, "");

const lines = [
  `NEXT_PUBLIC_API_URL=${apiRoot}`,
  `NEXT_PUBLIC_WS_URL=${wsRoot}`,
];

const outPath = path.join(__dirname, "..", "apps", "web", ".env.production.local");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, lines.join("\n") + "\n");
console.log(`Wrote ${outPath}`);

// Legacy frontend-legacy config for backward compatibility
const legacyPath = path.join(__dirname, "..", "frontend-legacy", "config.js");
const legacyConfig = {
  API_BASE: `${apiRoot}/api`,
  WS_URL: `${wsRoot}/ws/telemetry`,
  HEALTH_URL: `${apiRoot}/health`,
};
fs.writeFileSync(
  legacyPath,
  `/** Auto-generated */\nwindow.SA_CONFIG = ${JSON.stringify(legacyConfig, null, 2)};\n`,
);
console.log(`Wrote ${legacyPath}`);
