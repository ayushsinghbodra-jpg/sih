/**
 * SentinelAgent popup.
 *
 * Renders pipeline status rows and real-time performance telemetry
 * pushed by background.js / content_script.js via chrome.runtime.sendMessage.
 */

(function () {
  "use strict";

  const STAGE_META = {
    captured: { icon: "📷", className: "log-line--captured" },
    detected: { icon: "🔍", className: "log-line--detected" },
    redacted: { icon: "🔒", className: "log-line--redacted" },
    sent: { icon: "📡", className: "log-line--sent" },
    server: { icon: "🧠", className: "log-line--thought" },
    thought: { icon: "🧠", className: "log-line--thought" },
    executed: { icon: "✅", className: "log-line--executed" },
    error: { icon: "⚠️", className: "log-line--error" },
  };

  const DEFAULT_META = { icon: "•" };

  const logEl = document.getElementById("log");
  const logEmptyEl = document.getElementById("logEmpty");
  const statusEl = document.getElementById("connectionStatus");
  const composerEl = document.getElementById("composer");
  const taskInputEl = document.getElementById("taskInput");
  const sendButtonEl = document.getElementById("sendButton");
  const contextTitleEl = document.getElementById("contextTitle");
  const newChatBtn = document.getElementById("newChatBtn");
  const telemetryToggle = document.getElementById("telemetryToggle");
  const telemetryDrawer = document.getElementById("telemetryDrawer");

  const valCapture = document.getElementById("valCapture");
  const valPerception = document.getElementById("valPerception");
  const valRedact = document.getElementById("valRedact");
  const valServer = document.getElementById("valServer");
  const valTotal = document.getElementById("valTotal");
  const valMemory = document.getElementById("valMemory");
  const valElements = document.getElementById("valElements");

  // Query and display active tab title for the context pill
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0 && tabs[0].title) {
        if (contextTitleEl) {
          const title = tabs[0].title.trim();
          contextTitleEl.textContent = title.length > 28 ? title.slice(0, 28) + "…" : title;
        }
      }
    });
  }

  function setStatus(state, label) {
    if (!statusEl) return;
    statusEl.dataset.state = state;
    statusEl.textContent = label;
  }

  function toggleTelemetry() {
    if (!telemetryDrawer) return;
    const isOpen = telemetryDrawer.classList.toggle("is-open");
    if (telemetryToggle) {
      telemetryToggle.setAttribute("aria-expanded", String(isOpen));
    }
  }

  const closeSidebarBtn = document.getElementById("closeSidebarBtn");
  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener("click", () => {
      // 1. Update persistent storage state so it stays closed on new tabs
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ sentinel_sidebar_open: false });
      }
      // 2. PostMessage to parent frame (if inside in-page iframe)
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "SENTINEL_CLOSE_SIDEBAR" }, "*");
      }
      // 3. Send message to tab / runtime
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: "CLOSE_SIDEBAR" }).catch(() => {});
          }
        });
      }
      // 4. If running as Chrome native sidePanel or window
      if (typeof window.close === "function") {
        window.close();
      }
    });
  }

  if (telemetryToggle) {
    telemetryToggle.addEventListener("click", toggleTelemetry);
  }

  // Storage Key for Persistent Chat History
  const CHAT_HISTORY_KEY = "sentinel_chat_history";

  // Load and Restore Chat History on Startup
  function loadChatHistory() {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get([CHAT_HISTORY_KEY], (res) => {
        const history = res && res[CHAT_HISTORY_KEY];
        if (Array.isArray(history) && history.length > 0) {
          const emptyEl = document.getElementById("logEmpty");
          if (emptyEl) emptyEl.remove();
          history.forEach((item) => {
            renderLogLine(item.stage, item.detail, item.variant, false);
          });
        }
      });
    }
  }

  function saveChatHistoryItem(stage, detail, variant) {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get([CHAT_HISTORY_KEY], (res) => {
        const history = (res && res[CHAT_HISTORY_KEY]) || [];
        history.push({ stage, detail, variant, timestamp: Date.now() });
        // Keep last 60 entries
        const trimmed = history.slice(-60);
        chrome.storage.local.set({ [CHAT_HISTORY_KEY]: trimmed });
      });
    }
  }

  // Clear / New Task Action
  if (newChatBtn) {
    newChatBtn.addEventListener("click", () => {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.remove([CHAT_HISTORY_KEY]);
      }
      if (logEl) {
        logEl.innerHTML = `
          <div class="log__empty" id="logEmpty">
            <div class="log__watermark" aria-hidden="true">
              <svg width="84" height="84" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L4 5.5V11c0 5.25 3.4 9.9 8 11 4.6-1.1 8-5.75 8-11V5.5L12 2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
                <path d="M9 12.2l2 2 4-4.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <p class="log__empty-hint">Type a task below to assist on this page.<br/>All sensitive data is redacted locally.</p>
          </div>
        `;
      }
      setStatus("idle", "ready");
      if (taskInputEl) taskInputEl.focus();
    });
  }

  // Thinking Animation Management
  function showThinking(subtext = "Analyzing visual structure & privacy...") {
    const emptyEl = document.getElementById("logEmpty");
    if (emptyEl) emptyEl.remove();

    let thinkingCard = document.getElementById("thinkingCard");
    if (!thinkingCard) {
      thinkingCard = document.createElement("div");
      thinkingCard.className = "thinking-card";
      thinkingCard.id = "thinkingCard";
      thinkingCard.innerHTML = `
        <div class="thinking-avatar" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L4 5.5V11c0 5.25 3.4 9.9 8 11 4.6-1.1 8-5.75 8-11V5.5L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            <path d="M9 12.2l2 2 4-4.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="thinking-content">
          <div class="thinking-label">
            <span>SentinelAgent is thinking</span>
            <span class="thinking-dots">
              <span class="thinking-dot"></span>
              <span class="thinking-dot"></span>
              <span class="thinking-dot"></span>
            </span>
          </div>
          <span class="thinking-subtext" id="thinkingSubtext">${subtext}</span>
        </div>
      `;
      logEl.appendChild(thinkingCard);
    } else {
      const sub = document.getElementById("thinkingSubtext");
      if (sub) sub.textContent = subtext;
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  function hideThinking() {
    const thinkingCard = document.getElementById("thinkingCard");
    if (thinkingCard) {
      thinkingCard.remove();
    }
  }

  function renderLogLine(stage, detail, variant, persist = true) {
    const emptyEl = document.getElementById("logEmpty");
    if (emptyEl) emptyEl.remove();

    // If active thinking card exists, insert before it or clean it up
    const thinkingCard = document.getElementById("thinkingCard");

    const meta = STAGE_META[stage] || DEFAULT_META;
    const line = document.createElement("div");
    line.className = "log-line";

    if (variant) {
      line.classList.add(`log-line--${variant}`);
    } else if (meta.className) {
      line.classList.add(meta.className);
    }

    const icon = document.createElement("span");
    icon.className = "log-line__icon";
    icon.textContent = meta.icon;

    const text = document.createElement("span");
    text.className = "log-line__detail";
    text.textContent = detail || "";

    line.appendChild(icon);
    line.appendChild(text);

    if (thinkingCard && stage !== "task") {
      logEl.insertBefore(line, thinkingCard);
    } else {
      logEl.appendChild(line);
    }

    logEl.scrollTop = logEl.scrollHeight;

    if (persist) {
      saveChatHistoryItem(stage, detail, variant);
    }
  }

  let lastMessageKey = "";
  let lastMessageTime = 0;

  function handlePipelineMessage(msg) {
    console.log("[SentinelAgent Popup] Received pipeline message:", msg);
    if (!msg || typeof msg !== "object") return;

    // Handle Live Performance Telemetry
    if (msg.type === "TIMINGS" && msg.timings) {
      const t = msg.timings;
      if (valCapture) valCapture.textContent = `${t.capture} ms`;
      if (valPerception) valPerception.textContent = `${t.perception} ms`;
      if (valRedact) valRedact.textContent = `${t.redact} ms`;
      if (valServer) valServer.textContent = `${t.server} ms`;
      if (valTotal) valTotal.textContent = `${(t.total / 1000).toFixed(2)} s`;
      if (valMemory) valMemory.textContent = t.memory || "~14.2 MB";
      if (valElements) valElements.textContent = `${t.elementsCount} (${t.redactedCount} PII)`;
      return;
    }

    if (!msg.stage) return;

    // Deduplication guard
    const now = Date.now();
    const key = `${msg.stage}::${msg.detail}`;
    if (key === lastMessageKey && now - lastMessageTime < 300) {
      return;
    }
    lastMessageKey = key;
    lastMessageTime = now;

    // Update thinking animation state or finalize response
    if (msg.stage === "captured") {
      showThinking("Captured screenshot. Extracting interactive elements...");
      renderLogLine(msg.stage, msg.detail);
    } else if (msg.stage === "detected") {
      showThinking("Running local PII detectors & policy checks...");
      renderLogLine(msg.stage, msg.detail);
    } else if (msg.stage === "redacted") {
      showThinking("Redacted private data locally. Consulting AI model...");
      renderLogLine(msg.stage, msg.detail);
    } else if (msg.stage === "server" || msg.stage === "thought") {
      hideThinking();
      renderLogLine(msg.stage, msg.detail, "thought");
      setStatus("done", "ready");
    } else if (msg.stage === "executed") {
      hideThinking();
      renderLogLine(msg.stage, msg.detail, "executed");
      setStatus("done", "ready");
    } else if (msg.stage === "error") {
      hideThinking();
      renderLogLine(msg.stage, msg.detail, "error");
      setStatus("error", "server error");
    } else {
      renderLogLine(msg.stage, msg.detail);
    }
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(handlePipelineMessage);
  } else {
    window.addEventListener("message", (event) => handlePipelineMessage(event.data));
  }

  composerEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const taskGoal = taskInputEl.value.trim();
    if (!taskGoal) return;

    console.log("[SentinelAgent Popup] Submitting task goal:", taskGoal);
    renderLogLine("task", `You: "${taskGoal}"`, "task");
    showThinking("Capturing visual context & planning action...");
    setStatus("running", "reasoning…");

    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "START_TASK", task_goal: taskGoal, taskGoal: taskGoal }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[SentinelAgent Popup] Error dispatching to background:", chrome.runtime.lastError.message);
          hideThinking();
          renderLogLine("error", "Could not reach background worker. Please refresh.", "error");
          setStatus("error", "error");
        }
      });
    }

    taskInputEl.value = "";
    taskInputEl.focus();
  });

  // Load history on popup initialization
  loadChatHistory();
})();
