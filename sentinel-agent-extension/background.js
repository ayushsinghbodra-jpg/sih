// background.js - SentinelAgent Service Worker (Manifest V3)

const USE_REAL_SERVER = true;
const SERVER_URL = "https://mushiness-mantis-seducing.ngrok-free.dev/act";

// Full-Height In-Page Assistant Launcher (Opera AI / Edge Copilot Style)
async function launchAssistant(tab) {
  if (!tab || !tab.id) return;
  if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("edge://") || tab.url?.startsWith("about:") || tab.url?.startsWith("chrome-extension://")) {
    console.warn("[SentinelAgent Background] Cannot run assistant on browser internal page:", tab.url);
    return;
  }

  // 1. First attempt: Direct execution in the page context
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (typeof window.toggleSentinelSidebar === "function") {
          window.toggleSentinelSidebar();
          return true;
        } else {
          window.dispatchEvent(new CustomEvent("SENTINEL_TOGGLE_REQUEST"));
          return false;
        }
      }
    });

    if (results && results[0]?.result === true) {
      console.log("[SentinelAgent Background] Sidebar toggled directly via executeScript.");
      return;
    }
  } catch (err) {
    console.warn("[SentinelAgent Background] Script execution attempt 1 had error:", err);
  }

  // 2. Second attempt: Message port
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SIDEBAR" });
    console.log("[SentinelAgent Background] Sidebar toggled via sendMessage.");
    return;
  } catch (err) {
    console.warn("[SentinelAgent Background] Tab not yet injected. Injecting all extension scripts into tab " + tab.id + "...", err);
  }

  // 3. Fallback: Full script re-injection
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [
        "perception/redaction_policy.js",
        "perception/sensitive_detector.js",
        "perception/ui_grounding.js",
        "perception/perception.js",
        "redaction.js",
        "payload_builder.js",
        "action_executor.js",
        "content_script.js"
      ]
    });
    setTimeout(async () => {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            if (typeof window.toggleSentinelSidebar === "function") {
              window.toggleSentinelSidebar(true);
            }
          }
        });
      } catch (e) {
        chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SIDEBAR" }).catch(console.error);
      }
    }, 100);
  } catch (injErr) {
    console.error("[SentinelAgent Background] Failed to inject scripts into tab:", injErr);
  }
}

// Context menu option to open Side Panel from right-click
function setupContextMenu() {
  if (typeof chrome !== "undefined" && chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "open_sentinel_side_panel",
        title: "🛡️ Open SentinelAgent Side Panel",
        contexts: ["all"]
      }, () => {
        if (chrome.runtime.lastError) {
          // ignore duplicate id warning
        }
      });
    });
  }
}

if (typeof chrome !== "undefined" && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    setupContextMenu();
  });
}

setupContextMenu();

if (typeof chrome !== "undefined" && chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "open_sentinel_side_panel" && tab) {
      launchAssistant(tab);
    }
  });
}

// Action Icon click handler
if (typeof chrome !== "undefined" && chrome.action?.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    launchAssistant(tab);
  });
}

// Keyboard shortcut handler
if (typeof chrome !== "undefined" && chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === "_execute_action" || command === "toggle_sentinel_panel") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) launchAssistant(tabs[0]);
      });
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[SentinelAgent Background] Received message:", message, "from sender:", sender);

  // 1. CAPTURE_AND_ANALYZE: Capture visible tab screenshot
  if (message.type === "CAPTURE_AND_ANALYZE") {
    console.log("[SentinelAgent Background] Capturing visible tab...");
    chrome.tabs.captureVisibleTab(
      sender.tab ? sender.tab.windowId : null,
      { format: "jpeg", quality: 60 },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error("[SentinelAgent Background] Screenshot capture failed:", chrome.runtime.lastError.message);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log("[SentinelAgent Background] Screenshot captured successfully (length: " + (dataUrl ? dataUrl.length : 0) + ")");
          sendResponse({ success: true, screenshot: dataUrl });
        }
      }
    );
    return true; // Keep channel open for async response
  }

  // 1.5. NAVIGATE_TAB: Execute tab navigation from agent action
  if (message.type === "NAVIGATE_TAB") {
    let targetUrl = message.url || "";
    if (targetUrl && !targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = "https://" + targetUrl;
    }
    console.log("[SentinelAgent Background] Handling NAVIGATE_TAB to:", targetUrl);

    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      chrome.tabs.update(tabId, { url: targetUrl }, (tab) => {
        sendResponse({ success: true, url: targetUrl });
      });
      return true;
    } else {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (tabs && tabs[0]?.id) {
          chrome.tabs.update(tabs[0].id, { url: targetUrl }, () => {
            sendResponse({ success: true, url: targetUrl });
          });
        } else {
          sendResponse({ success: false, error: "No active tab found" });
        }
      });
      return true;
    }
  }

  // 2. SEND_TO_SERVER: Send payload to backend server
  if (message.type === "SEND_TO_SERVER") {
    console.log("[SentinelAgent Background] Processing server payload:", message.payload);

    if (USE_REAL_SERVER) {
      fetch(SERVER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify(message.payload),
        signal: AbortSignal.timeout(30000)
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP error ${res.status}`);
          return res.json();
        })
        .then((data) => {
          console.log("[SentinelAgent Background] Real server response:", data);
          sendResponse(data);
        })
        .catch((err) => {
          console.error("[SentinelAgent Background] Server request failed:", err);
          sendResponse({ action: "none", target_id: null, value: null, error: err.message });
        });
    } else {
      // Mock branch: simulate network latency ~500ms
      setTimeout(() => {
        const mockResponse = {
          action: "click",
          target_id: "el_1",
          value: null
        };
        console.log("[SentinelAgent Background] Returning mock server response:", mockResponse);
        sendResponse(mockResponse);
      }, 500);
    }

    return true; // Keep channel open for async response
  }

  // 3. Status Log (Received from content_script.js - already delivered to popup via runtime broadcast)
  if (message.stage && message.detail) {
    console.log(`[SentinelAgent Background] Pipeline Status [${message.stage}]: ${message.detail}`);
    sendResponse({ received: true });
    return false;
  }

  // 4. TRIGGER_REANALYZE: Broadcast reanalyze trigger between content script and popup/tabs
  if (message.type === "TRIGGER_REANALYZE") {
    console.log("[SentinelAgent Background] Forwarding TRIGGER_REANALYZE broadcast...");
    if (message.forwardToTab && sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, message).catch(() => {});
    }
    sendResponse({ received: true, broadcasted: true });
    return false;
  }

  // 5. START_TASK: Route task dispatch from popup to active tab content script
  if (message.type === "START_TASK") {
    const taskGoal = message.task_goal || message.taskGoal;
    console.log("[SentinelAgent Background] Processing START_TASK for goal:", taskGoal);

    function dispatchToTab(targetTab) {
      if (!targetTab || !targetTab.id) {
        console.warn("[SentinelAgent Background] No active tab found to dispatch START_TASK.");
        chrome.runtime.sendMessage({ stage: "error", detail: "No active browser tab found. Please click into a webpage." }).catch(() => {});
        return;
      }

      console.log(`[SentinelAgent Background] Forwarding START_TASK to tab ${targetTab.id} (${targetTab.url || "webpage"}):`, taskGoal);

      chrome.tabs.sendMessage(targetTab.id, { type: "START_TASK", task_goal: taskGoal, taskGoal: taskGoal })
        .then((res) => {
          console.log("[SentinelAgent Background] Tab acknowledged START_TASK:", res);
        })
        .catch((err) => {
          console.warn("[SentinelAgent Background] Could not send START_TASK to content script:", err.message);
          chrome.runtime.sendMessage({
            stage: "error",
            detail: "Content script not active on this page. Please refresh the page tab."
          }).catch(() => {});
        });
    }

    // Query active tab prioritizing the last focused browser window
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0 && tabs[0].id) {
        dispatchToTab(tabs[0]);
      } else {
        // Fallback to any active tab across windows
        chrome.tabs.query({ active: true }, (fallbackTabs) => {
          if (fallbackTabs && fallbackTabs.length > 0) {
            dispatchToTab(fallbackTabs[0]);
          } else {
            dispatchToTab(null);
          }
        });
      }
    });

    sendResponse({ status: "forwarded", taskGoal });
    return false;
  }

  return false;
});
