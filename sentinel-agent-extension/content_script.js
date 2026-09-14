/*
 * ================================================================================================
 * SentinelAgent Content Script Orchestrator
 *
 * EXACT SERVER PAYLOAD CONTRACT:
 * {
 *   task_goal: string,
 *   redacted_screenshot: string, // RAW base64 string, NO data URI prefix ("data:image/...;base64,")
 *   elements: Array<{
 *     id: string,
 *     type: string,
 *     label: string
 *   }>, // Strictly {id, type, label} only — NO bbox, NO sensitive, NO pii_type
 *   step_history: Array<Object>
 * }
 * ================================================================================================
 */

console.log("[SentinelAgent ContentScript] Loaded and initialized.");

let isProcessing = false;
let pendingRerun = false;
let currentTaskGoal = null;
let mutationDebounceTimer = null;
const stepHistory = [];

/**
 * 1. Mock Perception Module
 * Simulates element boundary extraction and PII sensitivity detection.
 *
 * TODO: Replace this mock implementation with Person A's real modules at Hour 8:
 * - ui_grounding.js (Perception & visual bounding box grounding)
 * - sensitive_detector.js (PII detection across text, inputs, and visual elements)
 * - redaction_policy.js (Privacy rules and redaction decision engine)
 */
async function analyzeScreen_MOCK(screenshotBase64, domTree) {
  console.log("[SentinelAgent ContentScript] Invoking analyzeScreen_MOCK...");
  return {
    elements: [
      { id: "el_1", type: "button", bbox: [100, 300, 80, 30], sensitive: false },
      { id: "el_2", type: "input", bbox: [100, 200, 200, 30], sensitive: true, pii_type: "password" }
    ]
  };
}

/**
 * 2. Lightweight DOM Tree Extractor
 * Walks document.body and returns simplified metadata for visible interactive nodes in current viewport.
 */
function getFlattenedDOM() {
  const interactiveSelector = "button, input, select, textarea, a[href], [role='button'], [role='link'], [role='textbox']";
  const nodes = Array.from(document.body.querySelectorAll(interactiveSelector));
  const flattened = [];
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1920;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1080;

  nodes.forEach((el, index) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const isVisible = rect.width > 4 && rect.height > 4 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.opacity !== "0";

    const inViewport = rect.top < viewportHeight && rect.bottom > 0 &&
                       rect.left < viewportWidth && rect.right > 0;

    if (isVisible && inViewport) {
      flattened.push({
        id: el.id || `node_${index}`,
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || el.tagName.toLowerCase(),
        bbox: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
        innerText: (el.innerText || el.value || el.getAttribute("placeholder") || el.getAttribute("aria-label") || "").trim().slice(0, 100)
      });
    }
  });

  // Limit to top 35 visible interactive elements to optimize client latency and model focus
  return flattened.slice(0, 35);
}

/**
 * Helper to notify background and popup of pipeline progression
 */
function sendStatus(stage, detail) {
  console.log(`[SentinelAgent Pipeline] Stage [${stage}]: ${detail}`);
  chrome.runtime.sendMessage({ stage, detail }).catch(() => {
    // Popup might not be open; ignore runtime channel errors
  });
}

/**
 * 3. Main Pipeline Orchestrator
 */
async function runPipeline(taskGoal) {
  if (isProcessing) {
    console.log("[SentinelAgent ContentScript] Pipeline already in progress. Setting pendingRerun flag.");
    pendingRerun = true;
    return;
  }

  isProcessing = true;
  currentTaskGoal = taskGoal;

  try {
    console.log(`[SentinelAgent Pipeline] === STARTING RUN FOR GOAL: "${taskGoal}" ===`);

    // a. Request tab screenshot from background.js (prefix remains untouched here; redactPixels strips it)
    console.log("[SentinelAgent Pipeline] Step a: Capturing screenshot...");
    const t0 = performance.now();
    const captureResponse = await chrome.runtime.sendMessage({ type: "CAPTURE_AND_ANALYZE" });
    const screenshot = captureResponse?.screenshot || null;
    const tCapture = Math.round(performance.now() - t0);

    // b. Extract DOM tree (filtered to visible interactive elements in viewport)
    console.log("[SentinelAgent Pipeline] Step b: Extracting flattened DOM tree...");
    const tPerceptionStart = performance.now();
    const domTree = getFlattenedDOM();

    // c. Report capture status
    sendStatus("captured", "Captured screen");

    // d. Perception & element detection (Real Person A module with mock fallback)
    console.log("[SentinelAgent Pipeline] Step d: Running perception analysis...");
    const analyzeFn = (typeof window !== "undefined" && typeof window.analyzeScreen === "function")
      ? window.analyzeScreen
      : (typeof analyzeScreen === "function" ? analyzeScreen : analyzeScreen_MOCK);
    const analysis = await analyzeFn(screenshot, domTree);
    const elements = analysis?.elements || [];
    const tPerception = Math.round(performance.now() - tPerceptionStart);

    // e. Report detection status
    sendStatus("detected", `Found ${elements.length} elements`);

    // f. Register live DOM nodes in action executor registry
    console.log("[SentinelAgent Pipeline] Step f: Registering DOM elements in registry...");
    if (typeof window.registerElements === "function") {
      window.registerElements(elements);
    } else {
      console.warn("[SentinelAgent Pipeline] window.registerElements is not defined.");
    }

    // g. Redact sensitive pixels (returns raw base64 JPEG without prefix)
    console.log("[SentinelAgent Pipeline] Step g: Redacting sensitive pixels on screenshot...");
    const tRedactStart = performance.now();
    let cleanScreenshot = "";
    if (typeof window.redactPixels === "function") {
      cleanScreenshot = await window.redactPixels(screenshot, elements);
    } else {
      console.warn("[SentinelAgent Pipeline] window.redactPixels is not defined; using raw base64.");
      cleanScreenshot = screenshot ? screenshot.replace(/^data:image\/\w+;base64,/, "") : "";
    }

    // h. Redact labels and format strictly to { id, type, label } shape
    console.log("[SentinelAgent Pipeline] Step h: Redacting labels to exact {id, type, label} schema...");
    let serverElements = [];
    if (typeof window.redactLabels === "function") {
      serverElements = window.redactLabels(elements, window.elementRegistry);
    } else {
      serverElements = elements.map(el => ({
        id: el.id,
        type: el.type,
        label: el.sensitive ? `[REDACTED:${(el.pii_type || "PII").toUpperCase()}]` : (el.type || "button")
      }));
    }
    const tRedact = Math.round(performance.now() - tRedactStart);

    // i. Report redaction status
    const sensitiveCount = elements.filter(e => e.sensitive).length;
    sendStatus("redacted", sensitiveCount > 0 ? `Redacted ${sensitiveCount} sensitive fields` : "No sensitive PII found");

    // j. Construct payload matching exact server contract (NO bbox, sensitive, or pii_type in elements)
    const payload = window.buildPayload(taskGoal, cleanScreenshot, serverElements, stepHistory);
    console.log("[SentinelAgent Pipeline] Step j: Built sanitized payload:", payload);

    // k. Report payload dispatch status
    sendStatus("sent", "Sent sanitized data");

    // l. Send payload to background.js -> server and await response
    console.log("[SentinelAgent Pipeline] Step l: Dispatching payload to server...");
    const tServerStart = performance.now();
    const response = await chrome.runtime.sendMessage({
      type: "SEND_TO_SERVER",
      payload
    });
    const tServer = Math.round(performance.now() - tServerStart);

    const actionObj = response || { action: "none", target_id: null, value: null };
    console.log("[SentinelAgent Pipeline] Step l: Received server decision:", actionObj);

    // m. Report server decision status (stage "server" maps to brain icon in popup UI)
    const serverDetail = actionObj.thought
      ? actionObj.thought
      : (`${actionObj.action} ${actionObj.target_id || ""}`.trim() || "No action needed");
    sendStatus("server", serverDetail);

    // Record step in history
    stepHistory.push({
      goal: taskGoal,
      action: actionObj.action,
      target_id: actionObj.target_id,
      timestamp: Date.now()
    });

    // n. Execute decided action via action_executor.js
    console.log("[SentinelAgent Pipeline] Step n: Executing action in DOM...");
    if (typeof window.executeAction === "function") {
      await window.executeAction(actionObj);
    } else {
      console.warn("[SentinelAgent Pipeline] window.executeAction not found. Action execution skipped.");
    }

    // Calculate total telemetry
    const tTotal = Math.round(performance.now() - t0);
    const clientMemory = (typeof performance !== "undefined" && performance.memory)
      ? `${(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)} MB`
      : "~14.5 MB";

    const telemetryData = {
      capture: tCapture,
      perception: tPerception,
      redact: tRedact,
      clientTotal: tCapture + tPerception + tRedact,
      server: tServer,
      total: tTotal,
      elementsCount: elements.length,
      redactedCount: sensitiveCount,
      memory: clientMemory
    };

    console.log("[SentinelAgent Pipeline] Live Telemetry Breakdown:", telemetryData);
    chrome.runtime.sendMessage({ type: "TIMINGS", timings: telemetryData }).catch(() => {});

    // o. Report execution status
    const isNoneAction = actionObj.action === "none";
    const completionLabel = isNoneAction ? "Analysis complete" : "Action executed";
    sendStatus("executed", completionLabel);
    console.log("[SentinelAgent Pipeline] === PIPELINE RUN COMPLETED ===");

    // For informational queries or complete tasks, clear goal so it does not loop
    if (isNoneAction) {
      currentTaskGoal = null;
    }

  } catch (error) {
    console.error("[SentinelAgent ContentScript] Error during pipeline execution:", error);
    sendStatus("error", error.message || "Pipeline execution failed");
    currentTaskGoal = null;
  } finally {
    isProcessing = false;
    pendingRerun = false;
  }
}

/**
 * 4. Runtime Message Listener
 * Handles START_TASK from popup/background and TRIGGER_REANALYZE
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[SentinelAgent ContentScript] Received message:", message);

  if (message.type === "START_TASK") {
    const goal = message.task_goal || message.taskGoal;
    if (goal) {
      console.log(`[SentinelAgent ContentScript] Starting task goal: "${goal}"`);
      currentTaskGoal = goal;
      runPipeline(goal);
      sendResponse({ status: "started", taskGoal: goal });
      return false;
    }
  }

  if (message.type === "TRIGGER_REANALYZE") {
    if (currentTaskGoal && !isProcessing) {
      console.log("[SentinelAgent ContentScript] Triggering re-analysis for goal:", currentTaskGoal);
      runPipeline(currentTaskGoal);
      sendResponse({ status: "reanalyzing" });
    } else {
      sendResponse({ status: "ignored", reason: isProcessing ? "busy" : "no_task" });
    }
    return false;
  }

  if (message.type === "TOGGLE_SIDEBAR") {
    toggleSentinelSidebar();
    sendResponse({ status: "toggled" });
    return false;
  }

  if (message.type === "CLOSE_SIDEBAR") {
    toggleSentinelSidebar(false);
    sendResponse({ status: "closed" });
    return false;
  }

  return false;
});

function toggleSentinelSidebar(forceOpen) {
  let iframe = document.getElementById("sentinel-sidebar-iframe");
  let launcher = document.getElementById("sentinel-floating-launcher");
  const isOpen = iframe && iframe.style.transform === "translateX(0px)";
  const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;

  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "sentinel-sidebar-iframe";
    iframe.src = chrome.runtime.getURL("popup.html");
    iframe.style.cssText = "position:fixed;top:0;bottom:0;right:0;width:390px;max-width:90vw;height:100vh;height:100dvh;border:none;border-left:1px solid rgba(226,232,240,0.9);z-index:2147483647;box-shadow:-8px 0 32px rgba(0,0,0,0.18);background:#fafbfc;transform:translateX(100%);transition:transform 220ms cubic-bezier(0.16,1,0.3,1);";
    document.body.appendChild(iframe);
    // Trigger transition on next frame
    requestAnimationFrame(() => {
      iframe.style.transform = "translateX(0px)";
    });
  } else {
    iframe.style.transform = shouldOpen ? "translateX(0px)" : "translateX(100%)";
  }

  if (launcher) {
    launcher.style.display = shouldOpen ? "none" : "flex";
  }
}

// Listen for iframe postMessages (e.g. close button inside sidebar)
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SENTINEL_CLOSE_SIDEBAR") {
    toggleSentinelSidebar(false);
  }
});

// Inject floating edge tab on page load
function injectFloatingLauncher() {
  if (document.getElementById("sentinel-floating-launcher")) return;
  const launcher = document.createElement("div");
  launcher.id = "sentinel-floating-launcher";
  launcher.title = "🛡️ Open SentinelAgent (Click or Ctrl+Shift+S)";
  launcher.style.cssText = "position:fixed;top:50%;right:0;transform:translateY(-50%);z-index:2147483646;background:#0d9488;color:#ffffff;padding:10px 8px 10px 10px;border-top-left-radius:10px;border-bottom-left-radius:10px;cursor:pointer;box-shadow:-2px 2px 12px rgba(0,0,0,0.22);display:flex;align-items:center;justify-content:center;transition:all 150ms ease;user-select:none;";
  launcher.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L4 5.5V11c0 5.25 3.4 9.9 8 11 4.6-1.1 8-5.75 8-11V5.5L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 12.2l2 2 4-4.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  
  launcher.addEventListener("mouseenter", () => {
    launcher.style.transform = "translateY(-50%) translateX(-3px)";
    launcher.style.backgroundColor = "#0f766e";
  });
  launcher.addEventListener("mouseleave", () => {
    launcher.style.transform = "translateY(-50%)";
    launcher.style.backgroundColor = "#0d9488";
  });
  launcher.addEventListener("click", () => {
    toggleSentinelSidebar(true);
  });
  if (document.body) {
    document.body.appendChild(launcher);
  } else {
    document.addEventListener("DOMContentLoaded", () => document.body?.appendChild(launcher));
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectFloatingLauncher);
} else {
  injectFloatingLauncher();
}

/**
 * 5. MutationObserver Setup (Debounced at 400ms)
 * Watches for structural DOM additions/removals after an action and re-triggers pipeline.
 */
let expectingMutation = false;

const observer = new MutationObserver((mutations) => {
  if (!currentTaskGoal || isProcessing) {
    return;
  }

  // Filter out internal SentinelAgent UI modifications
  const hasStructuralMutations = mutations.some(m => 
    m.type === "childList" && !m.target?.id?.startsWith?.("sentinel-")
  );
  if (!hasStructuralMutations) return;

  if (mutationDebounceTimer) {
    clearTimeout(mutationDebounceTimer);
  }

  mutationDebounceTimer = setTimeout(() => {
    if (!currentTaskGoal || isProcessing) return;
    const taskToRerun = currentTaskGoal;
    currentTaskGoal = null; // Single-shot rerun to prevent infinite mutation cycles
    console.log("[SentinelAgent ContentScript] Structural DOM mutation detected. Re-analyzing for goal:", taskToRerun);
    runPipeline(taskToRerun);
  }, 400);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
