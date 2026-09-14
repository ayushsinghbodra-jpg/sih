// background.js - SentinelAgent Service Worker (Manifest V3)

const USE_REAL_SERVER = true;
const SERVER_URL = "https://mushiness-mantis-seducing.ngrok-free.dev/act";

console.log("[SentinelAgent Background] Service worker initialized.");

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
        signal: AbortSignal.timeout(8000)
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
