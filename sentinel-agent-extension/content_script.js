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
    const captureResponse = await chrome.runtime.sendMessage({ type: "CAPTURE_AND_ANALYZE" });
    const screenshot = captureResponse?.screenshot || null;

    // b. Extract DOM tree (filtered to visible interactive elements in viewport)
    console.log("[SentinelAgent Pipeline] Step b: Extracting flattened DOM tree...");
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
    const response = await chrome.runtime.sendMessage({
      type: "SEND_TO_SERVER",
      payload
    });

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

    // o. Report execution status
    const completionLabel = actionObj.action === "none" ? "Analysis complete" : "Action executed";
    sendStatus("executed", completionLabel);
    console.log("[SentinelAgent Pipeline] === PIPELINE RUN COMPLETED ===");

  } catch (error) {
    console.error("[SentinelAgent ContentScript] Error during pipeline execution:", error);
    sendStatus("error", error.message || "Pipeline execution failed");
  } finally {
    isProcessing = false;
    if (pendingRerun && currentTaskGoal) {
      pendingRerun = false;
      setTimeout(() => {
        if (!isProcessing && currentTaskGoal) {
          runPipeline(currentTaskGoal);
        }
      }, 400);
    }
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

  return false;
});

/**
 * 5. MutationObserver Setup (Debounced at 400ms)
 * Watches for DOM mutations after an action and re-triggers pipeline without user intervention.
 */
const observer = new MutationObserver((mutations) => {
  if (!currentTaskGoal || isProcessing) {
    return;
  }

  // Filter out internal SentinelAgent UI modifications
  const hasExternalMutations = mutations.some(m => !m.target?.id?.startsWith?.("sentinel-"));
  if (!hasExternalMutations) return;

  if (mutationDebounceTimer) {
    clearTimeout(mutationDebounceTimer);
  }

  mutationDebounceTimer = setTimeout(() => {
    if (!currentTaskGoal || isProcessing) return;
    console.log("[SentinelAgent ContentScript] DOM mutation detected. Auto re-triggering pipeline for goal:", currentTaskGoal);
    runPipeline(currentTaskGoal);
  }, 400);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true
});
