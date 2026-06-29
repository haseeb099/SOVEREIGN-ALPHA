/**
 * api-wiring.js
 * Drop this <script src="api-wiring.js"></script> tag into index.html
 * BEFORE the closing </body> tag.
 * 
 * This file patches the existing prototype functions to call the real backend API
 * while keeping all existing mock fallbacks intact.
 * 
 * Backend URL is set in config.js (local dev) or injected at Vercel build time.
 */

const SA = window.SA_CONFIG || {};
const API_BASE = SA.API_BASE || "http://localhost:8000/api";
const WS_URL = SA.WS_URL || "ws://localhost:8000/ws/telemetry";
const HEALTH_URL = SA.HEALTH_URL || "http://localhost:8000/health";
const MAX_LOG_LINES = 500;

let isAnalyzing = false;
window._ingestedThesisPointsByAsset = window._ingestedThesisPointsByAsset || {};

function getIngestedThesisPoints(assetKey) {
  return window._ingestedThesisPointsByAsset[assetKey || currentAsset] || [];
}

function setIngestedThesisPoints(assetKey, points) {
  window._ingestedThesisPointsByAsset[assetKey || currentAsset] = points || [];
  window._ingestedThesisPoints = window._ingestedThesisPointsByAsset[assetKey || currentAsset];
}

function formatTelemetryTs(ts) {
  if (ts == null || ts === undefined) return "";
  const n = Number(ts);
  if (!Number.isFinite(n)) return "";
  if (n < 10000) return `(+${n}s)`;
  return "";
}

const RATING_TO_DISPLAY = { BULLISH: "BUY", NEUTRAL: "HOLD", BEARISH: "SELL" };
const RATING_COLORS = {
  BUY: "text-emerald-400",
  HOLD: "text-amber-400",
  SELL: "text-rose-400",
};

// ─── Error UX (Task 7) ───────────────────────────────────────────────────────

function initErrorUx() {
  if (document.getElementById("sa-toast-root")) return;

  const style = document.createElement("style");
  style.id = "sa-ux-styles";
  style.textContent = `
    @keyframes sa-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .sa-skeleton {
      color: transparent !important;
      border-radius: 4px;
      background: linear-gradient(90deg, rgba(55,65,81,0.35) 25%, rgba(75,85,99,0.55) 50%, rgba(55,65,81,0.35) 75%);
      background-size: 200% 100%;
      animation: sa-shimmer 1.4s ease-in-out infinite;
      user-select: none;
      min-height: 0.85em;
    }
    .sa-skeleton-block {
      border-radius: 6px;
      background: linear-gradient(90deg, rgba(55,65,81,0.35) 25%, rgba(75,85,99,0.55) 50%, rgba(55,65,81,0.35) 75%);
      background-size: 200% 100%;
      animation: sa-shimmer 1.4s ease-in-out infinite;
    }
    .sa-toast {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px solid;
      background: #121524;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      font-size: 12px;
      line-height: 1.4;
      color: #e5e7eb;
      animation: sa-toast-in 0.25s ease-out;
      max-width: 22rem;
    }
    @keyframes sa-toast-in {
      from { opacity: 0; transform: translateX(12px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .sa-toast-success { border-color: rgba(52,211,153,0.35); }
    .sa-toast-error { border-color: rgba(251,113,133,0.35); }
    .sa-toast-warning { border-color: rgba(251,191,36,0.35); }
    .sa-toast-icon { font-size: 14px; line-height: 1.2; flex-shrink: 0; font-weight: 700; }
    .sa-empty-state {
      padding: 1.25rem;
      text-align: center;
      border: 1px dashed rgba(255,255,255,0.08);
      border-radius: 8px;
      color: #6b7280;
      font-size: 11px;
      line-height: 1.5;
    }
    .sa-empty-state .material-icons {
      font-size: 28px;
      opacity: 0.35;
      display: block;
      margin: 0 auto 0.5rem;
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "sa-toast-root";
  root.className = "fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none";
  root.setAttribute("aria-live", "polite");
  document.body.appendChild(root);
}

function showToast(message, type = "error") {
  initErrorUx();
  const root = document.getElementById("sa-toast-root");
  if (!root || !message) return;

  const icons = { success: "✓", error: "✕", warning: "!" };
  const toast = document.createElement("div");
  toast.className = `sa-toast sa-toast-${type} pointer-events-auto`;
  toast.innerHTML = `
    <span class="sa-toast-icon" aria-hidden="true">${icons[type] || "!"}</span>
    <span>${message}</span>
  `;
  root.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.2s";
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

function readableApiError(e) {
  const msg = e?.message || String(e || "Unknown error");
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
    return "Cannot reach backend — is uvicorn running on port 8000?";
  }
  return msg.length > 140 ? `${msg.slice(0, 137)}…` : msg;
}

function setSkeleton(elementIds, active) {
  const ids = Array.isArray(elementIds) ? elementIds : [elementIds];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (active) {
      if (!el.dataset.saSkeleton) el.dataset.saSkeleton = el.textContent;
      el.classList.add("sa-skeleton");
    } else {
      el.classList.remove("sa-skeleton");
      delete el.dataset.saSkeleton;
    }
  });
}

function showEmptyState(containerId, message, icon = "inbox") {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div class="sa-empty-state">
      <span class="material-icons">${icon}</span>
      ${message}
    </div>
  `;
}

function showNewsSkeleton() {
  const container = document.getElementById("newsFeedList");
  if (!container) return;
  container.innerHTML = [1, 2, 3].map(() => `
    <div class="p-3 bg-[#111322] rounded-lg border border-gray-800 space-y-2">
      <div class="sa-skeleton-block h-3 w-full"></div>
      <div class="sa-skeleton-block h-2 w-2/3"></div>
    </div>
  `).join("");
}

function updateBackendStatus(status) {
  const label = document.getElementById("backendConnectionLabel");
  const dot = document.getElementById("backendStatusDot");
  const ping = document.getElementById("backendStatusPing");

  const states = {
    online: { text: "BACKEND ONLINE", labelClass: "text-emerald-400", dot: "bg-emerald-500", pingColor: "bg-emerald-400", ping: true },
    offline: { text: "BACKEND OFFLINE", labelClass: "text-rose-400", dot: "bg-rose-500", pingColor: "bg-rose-400", ping: false },
    loading: { text: "CONNECTING…", labelClass: "text-amber-400", dot: "bg-amber-500", pingColor: "bg-amber-400", ping: true },
    degraded: { text: "DEGRADED MODE", labelClass: "text-amber-400", dot: "bg-amber-500", pingColor: "bg-amber-400", ping: false },
  };
  const s = states[status] || states.offline;

  if (label) {
    label.textContent = s.text;
    label.className = `text-[11px] font-semibold tracking-widest uppercase mono-font ${s.labelClass}`;
  }
  if (dot) dot.className = `relative inline-flex rounded-full h-2 w-2 ${s.dot}`;
  if (ping) {
    ping.style.display = s.ping ? "" : "none";
    ping.className = `animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${s.pingColor}`;
  }
}

async function checkBackendHealth(showLoading = true) {
  if (showLoading) updateBackendStatus("loading");
  try {
    const resp = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(4000) });
    if (resp.ok) {
      updateBackendStatus("online");
      return true;
    }
    updateBackendStatus("offline");
    return false;
  } catch {
    updateBackendStatus("offline");
    return false;
  }
}

// ─── WebSocket Telemetry ─────────────────────────────────────────────────────
let ws = null;
let wsErrorToasted = false;

function connectTelemetryWebSocket() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    wsErrorToasted = false;
    updateBackendStatus("online");
    logTelemetry("[WS] Connected to Cerebras agent telemetry stream.");
    setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), 25000);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.agent && data.message && data.agent !== "HEARTBEAT") {
        logTelemetry(`[${data.agent}] ${data.message} ${formatTelemetryTs(data.ts)}`);
      }
    } catch (e) {}
  };

  ws.onclose = () => {
    updateBackendStatus("degraded");
    logTelemetry("[WS] Telemetry stream disconnected. Reconnecting in 3s...");
    setTimeout(connectTelemetryWebSocket, 3000);
  };

  ws.onerror = () => {
    updateBackendStatus("degraded");
    logTelemetry("[WS] Cannot connect to backend — running in mock mode.");
    if (!wsErrorToasted) {
      showToast("Telemetry stream unavailable — running in mock mode.", "warning");
      wsErrorToasted = true;
    }
  };
}

// Start WS connection on load
window.addEventListener("load", () => {
  initErrorUx();
  checkBackendHealth(true);
  setInterval(() => checkBackendHealth(false), 30000);
  connectTelemetryWebSocket();
  bindScenarioPersistence();
  bindFileUpload();
  bindCopilotTab();
  if (typeof currentAsset !== "undefined") {
    fetchLiveMarketData(currentAsset);
  }
});

function bindFileUpload() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener("click", (e) => {
    if (e.target === fileInput) return;
    fileInput.click();
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-emerald-500", "bg-emerald-500/[0.03]");
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("border-emerald-500", "bg-emerald-500/[0.03]");
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-emerald-500", "bg-emerald-500/[0.03]");
    const file = e.dataTransfer?.files?.[0];
    if (file) window.simulateDocumentUpload(file);
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) window.simulateDocumentUpload(file);
    fileInput.value = "";
  });
}

function bindCopilotTab() {
  const origSwitchTab = window.switchTab;
  if (!origSwitchTab) return;
  window.switchTab = function(tabId) {
    origSwitchTab(tabId);
    if (tabId === "copilot") {
      const box = document.getElementById("copilotResponseBox");
      const text = document.getElementById("copilotResponseText");
      if (box && text && !text.textContent?.trim()) {
        box.classList.remove("hidden");
        showEmptyState("copilotResponseText", "Ask a portfolio question to get cross-asset exposure analysis.", "smart_toy");
      }
    }
  };
}


// ─── Live Market Data ────────────────────────────────────────────────────────

async function fetchLiveMarketData(assetKey) {
  const marketSkeletonIds = ["targetPrice", "targetChange", "targetVolatility"];
  setSkeleton(marketSkeletonIds, true);
  clearMarketFallbackBadge();

  try {
    const resp = await fetch(`${API_BASE}/market/${assetKey}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    if (typeof ASSET_INTELLIGENCE_DB !== "undefined" && ASSET_INTELLIGENCE_DB[assetKey]) {
      ASSET_INTELLIGENCE_DB[assetKey].basePrice = data.price;
    }

    const priceEl = document.getElementById("targetPrice");
    const changeEl = document.getElementById("targetChange");
    const volEl = document.getElementById("targetVolatility");

    if (priceEl) {
      priceEl.textContent = typeof formatAssetPrice === "function"
        ? formatAssetPrice(data.price, assetKey)
        : (data.price >= 100
          ? `$${data.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : `$${data.price.toFixed(4)}`);
    }

    if (changeEl) {
      const sign = data.change_pct >= 0 ? "+" : "";
      changeEl.textContent = `${sign}${data.change_pct.toFixed(2)}%`;
      changeEl.className = `text-[10px] font-bold px-1.5 py-0.5 rounded ${
        data.change_pct >= 0
          ? "text-emerald-400 bg-emerald-500/10"
          : "text-rose-400 bg-rose-500/10"
      }`;
    }

    if (volEl) {
      volEl.textContent = `${data.volatility_30d.toFixed(1)}%`;
    }

    if (data.source === "fallback") {
      showMarketFallbackBadge(data.error);
      showToast(`Market data for ${assetKey} is stale — using last known price.`, "warning");
      if (data.error) logTelemetry(`[MARKET] Fallback reason: ${data.error}`);
    }

    if (typeof updateCasePriceLabels === "function") {
      updateCasePriceLabels(assetKey);
    }
    if (typeof debouncedUpdateSimulator === "function") {
      debouncedUpdateSimulator();
    }

    logTelemetry(`[MARKET] ${assetKey} live price loaded: $${data.price} (source: ${data.source})`);
    fetchLiveNews(assetKey);

  } catch (e) {
    logTelemetry(`[MARKET] Live fetch failed for ${assetKey} — using prototype values. Error: ${e.message}`);
    showToast(`Market data unavailable for ${assetKey}. Showing cached values.`, "warning");
  } finally {
    setSkeleton(marketSkeletonIds, false);
  }
}

function clearMarketFallbackBadge() {
  const badge = document.getElementById("marketDataBadge");
  if (badge) badge.remove();
}

function showMarketFallbackBadge(errorMsg) {
  clearMarketFallbackBadge();
  const priceEl = document.getElementById("targetPrice");
  if (!priceEl?.parentElement) return;
  const badge = document.createElement("span");
  badge.id = "marketDataBadge";
  badge.className = "block text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 mt-1";
  badge.title = errorMsg || "Using cached market data";
  badge.textContent = "Stale — last known price";
  priceEl.parentElement.appendChild(badge);
}


// ─── Live News Feed ──────────────────────────────────────────────────────────

async function fetchLiveNews(assetKey) {
  showNewsSkeleton();

  try {
    const resp = await fetch(`${API_BASE}/market/${assetKey}/news?limit=4`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    if (data.events && data.events.length > 0) {
      window.MOCK_EVENTS = data.events;
      buildEventFeed();
      logTelemetry(`[NEWS] Loaded ${data.events.length} live events for ${assetKey}`);
    } else {
      showEmptyState(
        "newsFeedList",
        "No live macro events for this asset. Prototype scenarios remain active.",
        "newspaper"
      );
      showToast(`No news events returned for ${assetKey}.`, "warning");
    }
  } catch (e) {
    logTelemetry(`[NEWS] Live fetch failed for ${assetKey}: ${e.message}`);
    showToast(`News feed failed for ${assetKey}. Using prototype events.`, "warning");
    if (typeof buildEventFeed === "function") buildEventFeed();
  }
}


// ─── Per-asset scenario state (Task 5) ───────────────────────────────────────

const SCENARIO_STORAGE_KEY = "sovereign_alpha_scenario_state";
const DEFAULT_SCENARIO = {
  margins: 18.5,
  rates: 4.5,
  regulatory: 1,
  sentiment: "Bullish",
};

function loadScenarioState() {
  try {
    const raw = localStorage.getItem(SCENARIO_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

function saveScenarioState(state) {
  try {
    localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

let scenarioState = loadScenarioState();

function readScenarioFromDOM() {
  return {
    margins: parseFloat(document.getElementById("simMargins")?.value || DEFAULT_SCENARIO.margins),
    rates: parseFloat(document.getElementById("simRates")?.value || DEFAULT_SCENARIO.rates),
    regulatory: parseInt(document.getElementById("simRegulatory")?.value || DEFAULT_SCENARIO.regulatory, 10),
    sentiment: document.getElementById("simSentiment")?.value || DEFAULT_SCENARIO.sentiment,
  };
}

function applyScenarioToDOM(scenario, runSimulator = true) {
  const marginsEl = document.getElementById("simMargins");
  const ratesEl = document.getElementById("simRates");
  const regEl = document.getElementById("simRegulatory");
  const sentimentEl = document.getElementById("simSentiment");

  if (marginsEl) marginsEl.value = scenario.margins;
  if (ratesEl) ratesEl.value = scenario.rates;
  if (regEl) regEl.value = scenario.regulatory;
  if (sentimentEl) sentimentEl.value = scenario.sentiment;

  if (runSimulator && typeof debouncedUpdateSimulator === "function") {
    debouncedUpdateSimulator();
  } else if (runSimulator && typeof updateSimulator === "function") {
    updateSimulator();
  }
}

function persistCurrentAssetScenario() {
  if (!currentAsset) return;
  scenarioState[currentAsset] = readScenarioFromDOM();
  saveScenarioState(scenarioState);
}

function bindScenarioPersistence() {
  ["simMargins", "simRates", "simRegulatory"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", persistCurrentAssetScenario);
  });
  document.getElementById("simSentiment")?.addEventListener("change", persistCurrentAssetScenario);
}


// ─── Asset hydration (PR1) ───────────────────────────────────────────────────

function updateCasePriceLabels(assetKey) {
  const assetData = ASSET_INTELLIGENCE_DB?.[assetKey];
  if (!assetData) return;
  const bear = assetData.basePrice * 0.75;
  const base = assetData.basePrice * 1.05;
  const bull = assetData.basePrice * 1.4;
  const fmt = (p) => (typeof formatAssetPrice === "function" ? formatAssetPrice(p, assetKey) : `$${p.toFixed(2)}`);

  const bearLbl = document.getElementById("bearCaseLabel");
  const baseLbl = document.getElementById("baseCaseLabel");
  const bullLbl = document.getElementById("bullCaseLabel");
  if (bearLbl) bearLbl.textContent = `Bear Case (${fmt(bear)})`;
  if (baseLbl) baseLbl.textContent = `Base Case (${fmt(base)})`;
  if (bullLbl) bullLbl.textContent = `Bull Case (${fmt(bull)})`;
}

async function loadAssetHistory(assetKey) {
  try {
    const resp = await fetch(`${API_BASE}/history/${assetKey}?limit=1`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.items?.[0] || null;
  } catch (e) {
    logTelemetry(`[HISTORY] Could not load prior run for ${assetKey}: ${e.message}`);
    return null;
  }
}

async function hydrateAssetUI(assetKey) {
  const assetData = ASSET_INTELLIGENCE_DB?.[assetKey];
  if (!assetData) return false;

  const bullEl = document.getElementById("bullVerdict");
  const bearEl = document.getElementById("bearVerdict");
  if (bullEl) bullEl.textContent = `"${assetData.bullVerdict}"`;
  if (bearEl) bearEl.textContent = `"${assetData.bearVerdict}"`;

  updateCasePriceLabels(assetKey);
  window._ingestedThesisPoints = getIngestedThesisPoints(assetKey);

  const historyItem = await loadAssetHistory(assetKey);
  if (historyItem) {
    patchMemoWithAIResponse(historyItem);
    if (historyItem.thesis_points?.length) {
      patchThesisTracker(historyItem.thesis_points);
    }
    logTelemetry(`[HISTORY] Restored prior analysis for ${assetKey} from cache.`);
    return true;
  }

  return false;
}

// ─── Patch: switchAsset ──────────────────────────────────────────────────────

const _originalSwitchAsset = window.switchAsset;
window.switchAsset = async function(assetKey) {
  if (currentAsset && currentAsset !== assetKey) {
    scenarioState[currentAsset] = readScenarioFromDOM();
    saveScenarioState(scenarioState);
  }

  _originalSwitchAsset(assetKey);

  const hadHistory = await hydrateAssetUI(assetKey);
  applyScenarioToDOM(scenarioState[assetKey] || { ...DEFAULT_SCENARIO }, !hadHistory);
  fetchLiveMarketData(assetKey);
};

window.patchAuditState = patchAuditState;
window.updateCasePriceLabels = updateCasePriceLabels;
window.patchMemoWithAIResponse = patchMemoWithAIResponse;


// ─── Patch: Real AI Analysis ─────────────────────────────────────────────────
// Override triggerImmediateRecalculation to call real backend

window.triggerImmediateRecalculation = async function() {
  if (isAnalyzing) return;
  isAnalyzing = true;

  const btn = document.getElementById("forceRecalcBtn");
  const btnLabel = document.getElementById("forceRecalcLabel");
  const loader = document.getElementById("statusPill");
  const analysisSkeletonIds = ["bullVerdict", "bearVerdict"];

  if (btn) btn.disabled = true;
  if (btnLabel) btnLabel.textContent = "Running 5-agent pipeline…";
  if (loader) loader.className = "h-2 w-2 rounded-full bg-amber-400 animate-ping";
  setSkeleton(analysisSkeletonIds, true);

  logTelemetry("[FORCE CYCLE] Sending to Cerebras WSE-3 agent pipeline...");

  const scenario = {
    margins: parseFloat(document.getElementById("simMargins")?.value || 18.5),
    rates: parseFloat(document.getElementById("simRates")?.value || 4.5),
    regulatory: ["Low", "Medium", "High"][parseInt(document.getElementById("simRegulatory")?.value || 1, 10) - 1],
    sentiment: document.getElementById("simSentiment")?.value || "Neutral",
  };

  try {
    const payload = {
      ticker: currentAsset,
      scenario: scenario,
    };
    const thesisPoints = getIngestedThesisPoints(currentAsset);
    if (thesisPoints.length) {
      payload.thesis_points = thesisPoints;
    }

    const resp = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();

    patchMemoWithAIResponse(data);

    if (data.thesis_points) {
      patchThesisTracker(data.thesis_points);
    }

    logTelemetry(
      `[PIPELINE] Complete in ${data.pipeline_elapsed_seconds}s — Rating: ${data.memo?.rating}`
    );
    showToast(`Analysis complete — ${RATING_TO_DISPLAY[data.memo?.rating] || data.memo?.rating || "done"}`, "success");

    if (loader) loader.className = "h-2 w-2 rounded-full bg-emerald-500";

  } catch (e) {
    logTelemetry(`[PIPELINE] Error: ${e.message}`);
    showToast(`Analysis pipeline failed: ${readableApiError(e)}`, "error");
    if (loader) loader.className = "h-2 w-2 rounded-full bg-rose-500";
  } finally {
    isAnalyzing = false;
    if (btn) btn.disabled = false;
    if (btnLabel) btnLabel.textContent = "FORCE RE-CALCULATION";
    setSkeleton(analysisSkeletonIds, false);
  }
};


function mapConfidenceToProbs(confidenceScore) {
  const health = Math.round(Math.min(100, Math.max(0, (confidenceScore / 10) * 100)));
  let bullProb = Math.round(health * 0.4);
  let bearProb = Math.max(5, Math.round((100 - health) * 0.5));
  let baseProb = 100 - bullProb - bearProb;
  if (baseProb < 0) {
    baseProb = 0;
    const total = bullProb + bearProb;
    if (total > 100) {
      bullProb = Math.round((bullProb / total) * 95);
      bearProb = 100 - bullProb;
    }
  }
  return { health, bullProb, baseProb, bearProb };
}

function patchAuditState(auditWarnings) {
  const indicator = document.getElementById("auditStateIndicator");
  if (!indicator) return;

  const warnings = auditWarnings || [];
  if (warnings.length > 0) {
    indicator.textContent = "WARNINGS IN FOOTNOTES";
    indicator.className = "font-semibold text-amber-400 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[10px]";
  } else {
    indicator.textContent = "CLEAN";
    indicator.className = "font-semibold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px]";
  }
  updateAuditDetails(warnings);
}

function updateAuditDetails(auditWarnings) {
  const details = document.getElementById("auditDetailsBody");
  if (!details) return;

  const checks = [
    { field: "Price Target", status: "pass", note: "Within scenario confidence band" },
    { field: "Rating", status: "pass", note: "Aligned with synthesis agent output" },
    { field: "Thesis Points", status: "pass", note: "Structural vectors validated" },
  ];

  if (auditWarnings?.length) {
    checks.forEach((c) => { c.status = "warn"; });
  }

  const icon = (s) => (s === "pass" ? "✓" : s === "warn" ? "!" : "✕");
  const color = (s) => (s === "pass" ? "text-emerald-400" : s === "warn" ? "text-amber-400" : "text-rose-400");

  let html = checks.map((c) => `
    <div class="flex items-start gap-2 text-[11px]">
      <span class="${color(c.status)} font-bold">${icon(c.status)}</span>
      <span><strong>${c.field}:</strong> ${c.note}</span>
    </div>
  `).join("");

  if (auditWarnings?.length) {
    html += `<div class="mt-2 pt-2 border-t border-gray-800 space-y-1">`;
    auditWarnings.forEach((w) => {
      html += `<div class="text-[11px] text-amber-400">⚠ ${w}</div>`;
    });
    html += `</div>`;
  }

  details.innerHTML = html;
}

function patchMemoWithAIResponse(data) {
  const memo = data.memo;
  if (!memo) return;

  const bullEl = document.getElementById("bullVerdict");
  if (bullEl && memo.bull_verdict) bullEl.textContent = `"${memo.bull_verdict}"`;

  const bearEl = document.getElementById("bearVerdict");
  if (bearEl && memo.bear_verdict) bearEl.textContent = `"${memo.bear_verdict}"`;

  const memoBody = document.getElementById("memoBody");
  if (memoBody && memo.summary) {
    const assetData = ASSET_INTELLIGENCE_DB?.[currentAsset];
    const ratingDisplay = RATING_TO_DISPLAY[memo.rating] || memo.rating || "HOLD";
    const targetStr = memo.price_target != null && typeof formatAssetPrice === "function"
      ? formatAssetPrice(memo.price_target, currentAsset)
      : `$${Number(memo.price_target || 0).toFixed(2)}`;

    memoBody.innerHTML = `
      <p class="font-bold text-white text-base mb-2">Executive Summary Target Analysis</p>
      <p class="mb-3">${memo.summary}</p>
      <p class="mb-3">Synthesis rating: <strong>${ratingDisplay}</strong> with 12M target <strong>${targetStr}</strong>.</p>
      <p class="font-semibold text-white mt-4 mb-2">Footnote Integrity & Internal Auditing Trail</p>
      <p id="memoFootnote">${
        (memo.audit_warnings?.length)
          ? `Cross-examination identified ${memo.audit_warnings.length} deviation(s) requiring review.`
          : "Cross-examination logs verify alignment across primary table values and raw footnotes. No catastrophic deviations identified."
      }</p>
      <details class="mt-4 border border-gray-800 rounded-lg overflow-hidden" id="auditDetails">
        <summary class="cursor-pointer px-4 py-2 bg-[#0c0d14] text-xs font-bold text-gray-300 hover:bg-gray-800/50 transition-colors">
          Continuous Audit Details
        </summary>
        <div class="p-4 space-y-2" id="auditDetailsBody"></div>
      </details>
    `;
  }

  const targetEl = document.getElementById("memoTarget");
  if (targetEl && memo.price_target != null) {
    targetEl.textContent = typeof formatAssetPrice === "function"
      ? formatAssetPrice(memo.price_target, currentAsset)
      : `$${Number(memo.price_target).toFixed(2)}`;
  }

  const ratingEl = document.getElementById("memoRating");
  if (ratingEl && memo.rating) {
    const display = RATING_TO_DISPLAY[memo.rating] || memo.rating;
    ratingEl.textContent = display;
    ratingEl.className = `text-lg xl:text-2xl font-black ${RATING_COLORS[display] || "text-white"} mt-1 truncate`;
  }

  if (memo.confidence_score != null) {
    const { health, bullProb, baseProb, bearProb } = mapConfidenceToProbs(memo.confidence_score);
    const confEl = document.getElementById("memoConfidence");
    if (confEl) confEl.textContent = `${health}%`;

    const overallHealth = document.getElementById("overallHealth");
    if (overallHealth) overallHealth.textContent = `${health}%`;

    const probMap = { probBear: bearProb, probBase: baseProb, probBull: bullProb };
    const barMap = { barBear: bearProb, barBase: baseProb, barBull: bullProb };
    Object.entries(probMap).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${val}%`;
    });
    Object.entries(barMap).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.style.width = `${val}%`;
    });
  }

  if (data.pipeline_elapsed_seconds != null) {
    const timeEl = document.getElementById("timeInfoMs");
    if (timeEl) timeEl.textContent = `${data.pipeline_elapsed_seconds}s`;
  }

  patchAuditState(memo.audit_warnings);
}


function patchThesisTracker(thesisPoints) {
  // Map thesis points to existing tracker DOM elements
  // The prototype uses ids like "thesis-1-status", "thesis-1-value"
  thesisPoints.forEach((point) => {
    const statusEl = document.getElementById(`thesis-${point.id}-status`);
    const valueEl = document.getElementById(`thesis-${point.id}-value`);

    if (statusEl) {
      const colors = {
        PASS: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
        RISK: "text-amber-400 bg-amber-500/10 border-amber-500/20",
        FAIL: "text-rose-400 bg-rose-500/10 border-rose-500/20",
        PENDING: "text-gray-400 bg-gray-800 border-gray-700",
      };
      statusEl.className = `px-2 py-1 text-[9px] font-bold rounded border ${colors[point.status] || colors.PENDING}`;
      statusEl.textContent = point.status;
    }

    if (valueEl && point.current_value) {
      valueEl.textContent = point.current_value;
    }
  });
}


// ─── Patch: Real Document Upload ─────────────────────────────────────────────

window.simulateDocumentUpload = async function(file) {
  const progressContainer = document.getElementById("parseProgress");
  const valEl = document.getElementById("progressVal");
  const barEl = document.getElementById("parseBar");

  if (progressContainer) progressContainer.classList.remove("hidden");

  // If we have an actual file, upload it to the real backend
  const fileInput = document.getElementById("fileInput");
  const actualFile = file || (fileInput && fileInput.files[0]);

  if (actualFile) {
    logTelemetry(`[INGESTION] Uploading ${actualFile.name} to extraction pipeline...`);

    // Animate progress bar while uploading
    let fakeProgress = 0;
    const timer = setInterval(() => {
      fakeProgress = Math.min(fakeProgress + 15, 85);
      if (valEl) valEl.textContent = `${fakeProgress}%`;
      if (barEl) barEl.style.width = `${fakeProgress}%`;
    }, 200);

    try {
      const formData = new FormData();
      formData.append("file", actualFile);

      const resp = await fetch(`${API_BASE}/ingest`, { method: "POST", body: formData });
      clearInterval(timer);

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      if (valEl) valEl.textContent = "100%";
      if (barEl) barEl.style.width = "100%";

      setTimeout(() => {
        if (progressContainer) progressContainer.classList.add("hidden");
        if (valEl) valEl.textContent = "0%";
        if (barEl) barEl.style.width = "0%";
      }, 500);

      const points = data.extraction?.thesis_points || [];
      logTelemetry(`[INGESTION] Extracted ${points.length} thesis points from ${actualFile.name}`);

      setIngestedThesisPoints(currentAsset, points);

      if (points.length) {
        patchThesisTracker(points);
        logTelemetry("[INGESTION] Thesis points stored — run Force Re-Calculation to analyze.");
      } else {
        showToast("Document parsed but no thesis points were extracted.", "warning");
      }

      const dropzone = document.getElementById("dropzone");
      if (dropzone) {
        const nameEl = dropzone.querySelector(".sa-upload-filename");
        if (nameEl) nameEl.textContent = actualFile.name;
        else {
          const p = document.createElement("p");
          p.className = "text-[10px] text-emerald-400 mt-2 sa-upload-filename";
          p.textContent = actualFile.name;
          dropzone.appendChild(p);
        }
      }

      showToast(`Ingested ${actualFile.name} — ${points.length} thesis point(s) extracted.`, "success");

    } catch (e) {
      clearInterval(timer);
      if (progressContainer) progressContainer.classList.add("hidden");
      if (valEl) valEl.textContent = "0%";
      if (barEl) barEl.style.width = "0%";
      logTelemetry(`[INGESTION] Upload failed: ${e.message}`);
      showToast(`Document upload failed: ${readableApiError(e)}`, "error");
    }

  } else {
    // No actual file selected — run original mock animation
    _mockIngestionAnimation(valEl, barEl, progressContainer);
  }
};

function _mockIngestionAnimation(valEl, barEl, progressContainer) {
  let val = 0;
  logTelemetry("[INGESTION STREAM] Reading private institutional data blocks...");
  const timer = setInterval(() => {
    val += Math.floor(Math.random() * 20) + 10;
    if (val >= 100) {
      val = 100;
      clearInterval(timer);
      setTimeout(() => {
        if (progressContainer) progressContainer.classList.add("hidden");
        if (valEl) valEl.textContent = "0%";
        if (barEl) barEl.style.width = "0%";
        logTelemetry("[INGESTION SUCCESS] Document parsed. Extracted 4 primary structural target points.");
        const marginSlider = document.getElementById("simMargins");
        if (marginSlider) {
          marginSlider.value = (parseFloat(marginSlider.value) + 1.2).toFixed(1);
          if (typeof updateSimulator === "function") updateSimulator();
        }
      }, 500);
    }
    if (valEl) valEl.textContent = `${val}%`;
    if (barEl) barEl.style.width = `${val}%`;
  }, 150);
}


// ─── Patch: Real Portfolio Copilot ───────────────────────────────────────────

window.submitCopilotQuery = async function() {
  const queryVal = document.getElementById("copilotQuery")?.value;
  if (!queryVal?.trim()) return;

  logTelemetry(`[COPILOT] Processing: "${queryVal}"`);
  const responseBox = document.getElementById("copilotResponseBox");
  const responseText = document.getElementById("copilotResponseText");

  if (responseBox) responseBox.classList.remove("hidden");
  if (responseText) {
    responseText.textContent = "";
    setSkeleton("copilotResponseText", true);
  }

  try {
    const portfolioContext = {
      ticker: currentAsset,
      price: parseFloat(document.getElementById("targetPrice")?.textContent?.replace(/[$,]/g, "") || 0),
      change_pct: 0,
      margins: document.getElementById("simMargins")?.value,
      rates: document.getElementById("simRates")?.value,
      sentiment: document.getElementById("simSentiment")?.value,
      rating: document.getElementById("memoRating")?.textContent?.trim() || "HOLD",
    };

    const resp = await fetch(`${API_BASE}/copilot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: queryVal, portfolio_context: portfolioContext }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    // Stream SSE response
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    if (responseText) {
      setSkeleton("copilotResponseText", false);
      responseText.textContent = "";
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          try {
            const data = JSON.parse(payload);
            if (data.delta) {
              fullText += data.delta;
              if (responseText) responseText.textContent = fullText;
            }
          } catch (e) {}
        }
      }
    }

    logTelemetry("[COPILOT] Response complete.");
    if (!fullText.trim() && responseText) {
      responseText.textContent = "No response returned from the copilot.";
      showToast("Copilot returned an empty response.", "warning");
    } else {
      showToast("Copilot response ready.", "success");
    }

  } catch (e) {
    setSkeleton("copilotResponseText", false);
    logTelemetry(`[COPILOT] Error: ${e.message} — using fallback response`);
    showToast(`Copilot query failed: ${readableApiError(e)}`, "error");
    if (responseText) {
      responseText.innerHTML = `
        Based on your target holdings, a persistent shift in interest rate curves affects 
        technology capitalization ratios significantly.<br><br>
        <strong>Identified Exposure:</strong><br>
        » Tech Equities: <strong>High Volatility Expansion (VIX delta: +4.2)</strong><br>
        » Commodity Offset Protection: <strong>Structural vectors verified.</strong><br><br>
        <strong>Recommendation:</strong> Consider adding 2.5% treasury index hedges.
      `;
    }
  }
};
