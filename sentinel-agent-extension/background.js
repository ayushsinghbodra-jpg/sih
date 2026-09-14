// background.js - SentinelAgent Service Worker (Manifest V3)

const USE_REAL_SERVER = false;
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

  // 3. Status Relay: Relay {stage, detail} status updates from content script to popup
  if (message.stage && message.detail) {
    console.log(`[SentinelAgent Background] Relaying status [${message.stage}]: ${message.detail}`);
    // Fire-and-forget relay to popup; safely catch error if popup is not open
    chrome.runtime.sendMessage(message).catch(() => {
      // Expected when popup is closed; suppress runtime port error
    });
    sendResponse({ received: true });
    return false;
  }

  // 4. TRIGGER_REANALYZE: Broadcast reanalyze trigger between content script and popup/tabs
  if (message.type === "TRIGGER_REANALYZE") {
    console.log("[SentinelAgent Background] Forwarding TRIGGER_REANALYZE broadcast...");
    chrome.runtime.sendMessage(message).catch(() => {
      // Suppress error if popup is not open
    });

    // Also forward to active tab content script if sent from popup or elsewhere
    if (message.forwardToTab && sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, message).catch(() => {});
    }

    sendResponse({ received: true, broadcasted: true });
    return false;
  }

  // 5. START_TASK: Route task dispatch from popup to active tab content script
  if (message.type === "START_TASK") {
    const taskGoal = message.task_goal || message.taskGoal;
    console.log("[SentinelAgent Background] Forwarding START_TASK to active tab:", taskGoal);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "START_TASK", taskGoal, task_goal: taskGoal }).catch((err) => {
          console.warn("[SentinelAgent Background] Could not send START_TASK to content script (tab might be non-injectable):", err);
        });
      } else {
        console.warn("[SentinelAgent Background] No active tab found for START_TASK.");
      }
    });
    sendResponse({ status: "forwarded", taskGoal });
    return false;
  }

  return false;
});
