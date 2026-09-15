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
/**
 * 2. Lightweight DOM Tree Extractor
 * Walks document.body and returns simplified metadata for visible interactive nodes in current viewport.
 */
/**
 * Helper to extract accurate, human-readable labels from Google Forms, ARIA controls, inputs, and rich feeds.
 */
function extractRichElementLabel(el) {
  if (!el) return "";

  // 1. Resolve aria-labelledby (Google Forms, ARIA dialogs)
  const ariaLabelledBy = el.getAttribute?.("aria-labelledby");
  if (ariaLabelledBy) {
    const ids = ariaLabelledBy.trim().split(/\s+/);
    const texts = ids
      .map(id => document.getElementById(id)?.innerText?.trim())
      .filter(Boolean);
    if (texts.length > 0) {
      return texts.join(" ").replace(/\s+/g, " ");
    }
  }

  // 2. Direct aria-label, title, data-value
  const directAria = el.getAttribute?.("aria-label")?.trim();
  const directTitle = el.getAttribute?.("title")?.trim();
  const dataValue = el.getAttribute?.("data-value")?.trim();
  const role = el.getAttribute?.("role");

  // 3. For Google Forms / ARIA radio and checkboxes
  if (role === "radio" || role === "checkbox" || el.type === "radio" || el.type === "checkbox") {
    const optionText = directAria || dataValue || el.innerText?.trim() || "";
    const group = el.closest?.('[role="radiogroup"], [role="listitem"], .Qr7Oae, .geS5n, fieldset');
    const groupTitle = group?.querySelector?.('[role="heading"], .M7eMe, legend, .exportLabel, h2, h3, h4')?.innerText?.trim();
    if (groupTitle && optionText) {
      return `${groupTitle}: ${optionText}`;
    }
    if (optionText) return optionText;
  }

  // 4. For form inputs / textareas / selects (Google Forms question mapping)
  if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || role === "textbox") {
    if (el.labels && el.labels.length > 0) {
      const labelText = Array.from(el.labels).map(l => l.innerText.trim()).filter(Boolean).join(" ");
      if (labelText) return labelText;
    }
    if (el.id) {
      const forLabel = document.querySelector(`label[for="${el.id}"]`)?.innerText?.trim();
      if (forLabel) return forLabel;
    }
    const questionContainer = el.closest?.('[role="listitem"], .Qr7Oae, .geS5n, .m2, .form-group, fieldset, .field, [jsmodel]');
    if (questionContainer) {
      const questionTitle = questionContainer.querySelector?.('[role="heading"], .M7eMe, legend, .exportLabel, .title, .label, h1, h2, h3, h4, h5, .HoPnR')?.innerText?.trim();
      if (questionTitle) return questionTitle;
    }
    const placeholder = el.getAttribute?.("placeholder")?.trim();
    if (placeholder) return placeholder;
  }

  // 5. For buttons (Google Forms "Next", "Submit", "Back")
  if (el.tagName === "BUTTON" || role === "button") {
    const btnText = el.innerText?.trim() || el.querySelector?.("span")?.innerText?.trim() || directAria || directTitle;
    if (btnText) return btnText;
  }

  // 6. YouTube / Media card title extraction
  let titleFromRenderer = "";
  if (!directTitle && (!el.innerText || el.innerText.trim().length < 5)) {
    const renderer = el.closest?.("ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, article");
    if (renderer) {
      titleFromRenderer = renderer.querySelector?.("#video-title, [id*='title'], h3")?.getAttribute?.("title") ||
                          renderer.querySelector?.("#video-title, [id*='title'], h3")?.innerText?.trim() || "";
    }
  }

  // 7. General innerText and fallbacks
  const generalText = (
    directTitle ||
    titleFromRenderer ||
    directAria ||
    el.querySelector?.("#video-title, [id*='title'], h1, h2, h3, h4")?.innerText ||
    el.innerText ||
    el.value ||
    ""
  ).trim();

  return generalText.replace(/\s+/g, " ");
}

/**
 * 2. Lightweight DOM Tree Extractor
 * Walks document.body and returns simplified metadata for visible interactive nodes in current viewport.
 */
function getFlattenedDOM() {
  const interactiveSelector = [
    "button", "input", "select", "textarea", "a[href]",
    "[role='button']", "[role='link']", "[role='textbox']", "[role='checkbox']",
    "[role='radio']", "[role='switch']", "[role='tab']", "[role='option']",
    "[role='combobox']", "[role='listbox']", "[role='menuitem']",
    "[contenteditable='true']", "[tabindex]:not([tabindex='-1'])",
    ".VfPpkd-LgbsSe", "[jsname='LgbsSe']", "[jsaction*='click']",
    "ytd-rich-item-renderer a", "ytd-video-renderer a", "ytd-grid-video-renderer a",
    "#video-title", "a#video-title-link", "a#thumbnail"
  ].join(", ");

  const nodes = Array.from(document.querySelectorAll(interactiveSelector));
  const flattened = [];
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1920;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1080;

  nodes.forEach((el, index) => {
    if (el.closest && el.closest("#sentinel-sidebar-iframe, #sentinel-floating-launcher, [id^='sentinel-']")) return;

    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const isVisible = rect.width > 2 && rect.height > 2 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.opacity !== "0";

    const inViewport = rect.top < viewportHeight && rect.bottom > 0 &&
                       rect.left < viewportWidth && rect.right > 0;

    if (isVisible && inViewport) {
      const rawLabel = extractRichElementLabel(el);
      const labelText = rawLabel || el.getAttribute("role") || el.getAttribute("type") || el.tagName.toLowerCase();
      const liveVal = (el.tagName === "INPUT" || el.tagName === "TEXTAREA") ? (el.value || "") : (el.innerText || "");

      const isPrimaryControl = ["BUTTON", "INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
                               el.getAttribute("role") === "button" ||
                               el.classList.contains("VfPpkd-LgbsSe") ||
                               ["radio", "checkbox"].includes(el.getAttribute("role"));

      flattened.push({
        id: el.id || `node_${index}`,
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("role") || el.getAttribute("type") || el.tagName.toLowerCase(),
        bbox: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
        text: labelText.slice(0, 120),
        value: liveVal,
        innerText: labelText.slice(0, 120),
        _isPrimary: isPrimaryControl
      });
    }
  });

  // Prioritize primary action buttons & form inputs ahead of auxiliary links
  flattened.sort((a, b) => (b._isPrimary ? 1 : 0) - (a._isPrimary ? 1 : 0));

  // Limit to top 50 visible interactive elements (primary controls guaranteed to be included)
  return flattened.slice(0, 50).map(({ _isPrimary, ...rest }) => rest);
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

    // a. Request tab screenshot from background.js
    console.log("[SentinelAgent Pipeline] Step a: Capturing screenshot...");
    const t0 = performance.now();
    const captureResponse = await chrome.runtime.sendMessage({ type: "CAPTURE_AND_ANALYZE" });
    const screenshot = captureResponse?.screenshot || null;
    const tCapture = Math.round(performance.now() - t0);

    // b. Extract DOM tree
    console.log("[SentinelAgent Pipeline] Step b: Extracting flattened DOM tree...");
    const tPerceptionStart = performance.now();
    const domTree = getFlattenedDOM();

    // c. Report capture status
    sendStatus("captured", "Captured screen");

    // d. Perception & element detection
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

    // g. Redact sensitive pixels
    console.log("[SentinelAgent Pipeline] Step g: Redacting sensitive pixels on screenshot...");
    const tRedactStart = performance.now();
    let cleanScreenshot = "";
    if (typeof window.redactPixels === "function") {
      cleanScreenshot = await window.redactPixels(screenshot, elements);
    } else {
      console.warn("[SentinelAgent Pipeline] window.redactPixels is not defined; using raw base64.");
      cleanScreenshot = screenshot ? screenshot.replace(/^data:image\/\w+;base64,/, "") : "";
    }

    // Broadcast redacted image preview dataUrl for live visual verification in popup
    if (cleanScreenshot) {
      chrome.runtime.sendMessage({
        type: "REDACTED_IMAGE_PREVIEW",
        dataUrl: `data:image/jpeg;base64,${cleanScreenshot}`,
        sensitiveCount: elements.filter(e => e.sensitive).length
      }).catch(() => {});
    }

    // h. Redact labels and format strictly to { id, type, label } schema
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

    // j. Construct payload matching exact server contract
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

    // m. Report server decision status
    const serverDetail = actionObj.thought
      ? actionObj.thought
      : (`${actionObj.action} ${actionObj.target_id || ""}`.trim() || "No action needed");
    sendStatus("server", serverDetail);

    // Anti-duplicate loop guard: Check if identical action was already executed consecutively
    const lastStep = stepHistory.length > 0 ? stepHistory[stepHistory.length - 1] : null;
    const isDuplicateAction = lastStep &&
      lastStep.action === actionObj.action &&
      lastStep.target_id === actionObj.target_id &&
      String(lastStep.value || "") === String(actionObj.value || "") &&
      actionObj.action !== "none";

    // Record step in history
    stepHistory.push({
      step: stepHistory.length + 1,
      goal: taskGoal,
      action: actionObj.action,
      target_id: actionObj.target_id,
      value: actionObj.value,
      thought: actionObj.thought,
      timestamp: Date.now()
    });

    if (isDuplicateAction) {
      console.warn("[SentinelAgent Pipeline] Duplicate consecutive action detected. Ending execution loop to prevent cycling.");
      currentTaskGoal = null;
      sendStatus("executed", "Task completed (Loop guard engaged)");
      return;
    }

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

    // For informational queries or complete tasks, clear goal
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
      stepHistory.length = 0; // Fresh task session starts with clean context memory
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

function toggleSentinelSidebar(forceOpen, persist = true) {
  let iframe = document.getElementById("sentinel-sidebar-iframe");
  let launcher = document.getElementById("sentinel-floating-launcher");

  // Determine current open state reliably
  const isCurrentlyOpen = iframe && iframe.dataset.open === "true";
  const shouldOpen = forceOpen !== undefined ? forceOpen : !isCurrentlyOpen;

  if (persist && typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.set({ sentinel_sidebar_open: shouldOpen });
  }

  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "sentinel-sidebar-iframe";
    iframe.src = chrome.runtime.getURL("popup.html");
    iframe.setAttribute("allow", "clipboard-read; clipboard-write");
    iframe.style.cssText = [
      "position: fixed !important",
      "top: 0px !important",
      "bottom: 0px !important",
      "right: 0px !important",
      "width: 390px !important",
      "max-width: 90vw !important",
      "height: 100vh !important",
      "height: 100dvh !important",
      "border: none !important",
      "border-left: 1px solid rgba(226, 232, 240, 0.9) !important",
      "z-index: 2147483647 !important",
      "box-shadow: -8px 0 32px rgba(0, 0, 0, 0.18) !important",
      "background: #fafbfc !important",
      "display: block !important",
      "opacity: 1 !important",
      "visibility: visible !important",
      "transform: translateX(100%) !important",
      "transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1) !important"
    ].join("; ");

    // Append to documentElement so site DOM wipes never remove it
    (document.documentElement || document.body).appendChild(iframe);
  }

  if (shouldOpen) {
    iframe.dataset.open = "true";
    iframe.style.setProperty("display", "block", "important");
    iframe.style.setProperty("pointer-events", "auto", "important");
    requestAnimationFrame(() => {
      iframe.style.setProperty("transform", "translateX(0px)", "important");
    });
    if (launcher) launcher.style.setProperty("display", "none", "important");
  } else {
    iframe.dataset.open = "false";
    iframe.style.setProperty("transform", "translateX(100%)", "important");
    iframe.style.setProperty("pointer-events", "none", "important");
    if (launcher) launcher.style.setProperty("display", "flex", "important");
  }
}

// Global hook for direct script execution from background.js
window.toggleSentinelSidebar = toggleSentinelSidebar;
window.addEventListener("SENTINEL_TOGGLE_REQUEST", () => toggleSentinelSidebar());

// Listen for iframe postMessages (e.g. close button inside sidebar)
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SENTINEL_CLOSE_SIDEBAR") {
    toggleSentinelSidebar(false, true);
  }
});

// Auto-restore open state on new pages / tab navigation if previously opened
function restoreSidebarState() {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.get(["sentinel_sidebar_open"], (res) => {
      if (res && res.sentinel_sidebar_open === true) {
        toggleSentinelSidebar(true, false);
      }
    });
  }
}

// Listen for storage changes across tabs to keep open state in sync
if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.sentinel_sidebar_open !== undefined) {
      const shouldOpen = changes.sentinel_sidebar_open.newValue === true;
      toggleSentinelSidebar(shouldOpen, false);
    }
  });
}

// Keep sidebar alive across SPA history transitions (e.g. Google Search, YouTube, Twitter)
window.addEventListener("popstate", restoreSidebarState);
window.addEventListener("pageshow", restoreSidebarState);

['pushState', 'replaceState'].forEach((method) => {
  const original = history[method];
  if (original) {
    history[method] = function (...args) {
      const result = original.apply(this, args);
      setTimeout(restoreSidebarState, 80);
      return result;
    };
  }
});

// Inject floating edge tab on page load
function injectFloatingLauncher() {
  if (document.getElementById("sentinel-floating-launcher")) return;
  const launcher = document.createElement("div");
  launcher.id = "sentinel-floating-launcher";
  launcher.title = "🛡️ Open SentinelAgent (Click or Ctrl+Shift+S)";
  launcher.style.cssText = [
    "position: fixed !important",
    "top: 50% !important",
    "right: 0px !important",
    "transform: translateY(-50%) !important",
    "z-index: 2147483646 !important",
    "background: #0d9488 !important",
    "color: #ffffff !important",
    "padding: 10px 8px 10px 10px !important",
    "border-top-left-radius: 10px !important",
    "border-bottom-left-radius: 10px !important",
    "cursor: pointer !important",
    "box-shadow: -2px 2px 12px rgba(0, 0, 0, 0.22) !important",
    "display: flex !important",
    "align-items: center !important",
    "justify-content: center !important",
    "transition: all 150ms ease !important",
    "user-select: none !important"
  ].join("; ");

  launcher.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L4 5.5V11c0 5.25 3.4 9.9 8 11 4.6-1.1 8-5.75 8-11V5.5L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 12.2l2 2 4-4.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  
  launcher.addEventListener("mouseenter", () => {
    launcher.style.setProperty("transform", "translateY(-50%) translateX(-3px)", "important");
    launcher.style.setProperty("background-color", "#0f766e", "important");
  });
  launcher.addEventListener("mouseleave", () => {
    launcher.style.setProperty("transform", "translateY(-50%)", "important");
    launcher.style.setProperty("background-color", "#0d9488", "important");
  });
  launcher.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSentinelSidebar(true, true);
  });

  (document.documentElement || document.body).appendChild(launcher);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    injectFloatingLauncher();
    restoreSidebarState();
  });
} else {
  injectFloatingLauncher();
  restoreSidebarState();
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
