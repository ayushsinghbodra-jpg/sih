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
  // Storage Key for Persistent Chat History
  const CHAT_HISTORY_KEY = "sentinel_chat_history";

  function escapeHTML(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Load and Restore Chat History on Startup
  function loadChatHistory() {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get([CHAT_HISTORY_KEY], (res) => {
        const history = res && res[CHAT_HISTORY_KEY];
        if (Array.isArray(history) && history.length > 0) {
          const emptyEl = document.getElementById("logEmpty");
          if (emptyEl) emptyEl.remove();
          history.forEach((item) => {
            if (item.role === "user") {
              renderUserMessage(item.text, false);
            } else if (item.role === "ai") {
              renderAIMessage(item.text, item.actionData, false);
            } else if (item.role === "error") {
              renderErrorMessage(item.text, false);
            }
          });
        }
      });
    }
  }

  function saveChatHistoryItem(role, text, actionData = null) {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get([CHAT_HISTORY_KEY], (res) => {
        const history = (res && res[CHAT_HISTORY_KEY]) || [];
        history.push({ role, text, actionData, timestamp: Date.now() });
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

  // Thinking Animation Management (LEFT-ALIGNED)
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
          <span class="thinking-subtext" id="thinkingSubtext">${escapeHTML(subtext)}</span>
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

  // Render User Message (RIGHT-ALIGNED)
  function renderUserMessage(text, persist = true) {
    const emptyEl = document.getElementById("logEmpty");
    if (emptyEl) emptyEl.remove();

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble--user";
    bubble.textContent = text;

    logEl.appendChild(bubble);
    logEl.scrollTop = logEl.scrollHeight;

    if (persist) {
      saveChatHistoryItem("user", text);
    }
  }

  // Render AI Response (LEFT-ALIGNED)
  function renderAIMessage(text, actionData = null, persist = true) {
    const emptyEl = document.getElementById("logEmpty");
    if (emptyEl) emptyEl.remove();

    hideThinking();

    const container = document.createElement("div");
    container.className = "chat-bubble--ai";

    const textEl = document.createElement("div");
    textEl.className = "chat-bubble--ai__text";
    textEl.textContent = text;
    container.appendChild(textEl);

    if (actionData) {
      const pill = document.createElement("div");
      pill.className = "action-pill";
      pill.innerHTML = `<span>⚡</span> <span>${escapeHTML(actionData)}</span>`;
      container.appendChild(pill);
    }

    const actionsBar = document.createElement("div");
    actionsBar.className = "chat-bubble--ai__actions";
    actionsBar.innerHTML = `
      <button type="button" class="chat-action-btn" title="Copy response">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
    `;
    const copyBtn = actionsBar.querySelector(".chat-action-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.style.color = "var(--teal-primary)";
          setTimeout(() => { copyBtn.style.color = ""; }, 1200);
        });
      });
    }
    container.appendChild(actionsBar);

    logEl.appendChild(container);
    logEl.scrollTop = logEl.scrollHeight;

    if (persist) {
      saveChatHistoryItem("ai", text, actionData);
    }
  }

  // Render Error Message (LEFT-ALIGNED)
  function renderErrorMessage(text, persist = true) {
    const emptyEl = document.getElementById("logEmpty");
    if (emptyEl) emptyEl.remove();

    hideThinking();

    const errBox = document.createElement("div");
    errBox.className = "chat-bubble--error";
    errBox.textContent = `⚠️ ${text}`;

    logEl.appendChild(errBox);
    logEl.scrollTop = logEl.scrollHeight;

    if (persist) {
      saveChatHistoryItem("error", text);
    }
  }

  let lastMessageKey = "";
  let lastMessageTime = 0;

  function handlePipelineMessage(msg) {
    if (!msg || typeof msg !== "object") return;

    // Handle Live Performance Telemetry
    if (msg.type === "TIMINGS" && msg.timings) {
      const t = msg.timings;
      console.log(`[SentinelAgent Telemetry] Total: ${t.total}ms | Capture: ${t.capture}ms | Perception: ${t.perception}ms | Redact: ${t.redact}ms | Server: ${t.server}ms | Memory: ${t.memory || "~14MB"}`);

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

    // Terminal / Console logging for all pipeline stages
    console.log(`[SentinelAgent Pipeline] [${msg.stage.toUpperCase()}]: ${msg.detail}`);

    // Deduplication guard
    const now = Date.now();
    const key = `${msg.stage}::${msg.detail}`;
    if (key === lastMessageKey && now - lastMessageTime < 300) {
      return;
    }
    lastMessageKey = key;
    lastMessageTime = now;

    // In the UI: Intermediate stages ONLY update the thinking card subtext (NO chat spam!)
    if (msg.stage === "captured") {
      showThinking("Captured screenshot. Grounding interactive elements...");
    } else if (msg.stage === "detected") {
      showThinking("Running local PII detectors & policy checks...");
    } else if (msg.stage === "redacted") {
      showThinking("Redacted private data locally. Consulting AI model...");
    } else if (msg.stage === "server" || msg.stage === "thought") {
      renderAIMessage(msg.detail);
      setStatus("done", "ready");
    } else if (msg.stage === "executed") {
      // If an action was executed and no thought was rendered, show the action confirmation
      if (msg.detail) {
        renderAIMessage("Action executed on page.", msg.detail);
      }
      setStatus("done", "ready");
    } else if (msg.stage === "error") {
      renderErrorMessage(msg.detail);
      setStatus("error", "server error");
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

    console.log(`[SentinelAgent Pipeline] 🚀 Submitting task: "${taskGoal}"`);
    renderUserMessage(taskGoal);
    showThinking("Analyzing page & privacy boundaries...");
    setStatus("running", "reasoning…");

    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "START_TASK", task_goal: taskGoal, taskGoal: taskGoal }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[SentinelAgent Popup] Error dispatching to background:", chrome.runtime.lastError.message);
          renderErrorMessage("Could not connect to active page tab. Please refresh the page.");
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
