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
      // 1. PostMessage to parent frame (if inside in-page iframe)
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "SENTINEL_CLOSE_SIDEBAR" }, "*");
      }
      // 2. Send message to tab / runtime
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: "CLOSE_SIDEBAR" }).catch(() => {});
          }
        });
      }
      // 3. If running as Chrome native sidePanel or window
      if (typeof window.close === "function") {
        window.close();
      }
    });
  }

  if (telemetryToggle) {
    telemetryToggle.addEventListener("click", toggleTelemetry);
  }

  // Clear / New Task Action
  if (newChatBtn) {
    newChatBtn.addEventListener("click", () => {
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

  function appendLogLine(stage, detail, variant) {
    const emptyEl = document.getElementById("logEmpty");
    if (emptyEl && emptyEl.parentNode) {
      emptyEl.remove();
    }

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
    logEl.appendChild(line);

    // Auto scroll to latest row
    logEl.scrollTop = logEl.scrollHeight;
  }

  let lastMessageKey = "";
  let lastMessageTime = 0;

  function handlePipelineMessage(msg) {
    console.log("[SentinelAgent Popup] Received pipeline message:", msg);
    if (!msg || typeof msg !== "object") return;

    // Handle Live Performance Telemetry
    if (msg.type === "TIMINGS" && msg.timings) {
      const t = msg.timings;
      console.log("[SentinelAgent Telemetry Update]", t);

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

    // Deduplication guard: ignore identical stage + detail arriving within 300ms
    const now = Date.now();
    const key = `${msg.stage}::${msg.detail}`;
    if (key === lastMessageKey && now - lastMessageTime < 300) {
      console.log("[SentinelAgent Popup] Ignored rapid duplicate message:", key);
      return;
    }
    lastMessageKey = key;
    lastMessageTime = now;

    appendLogLine(msg.stage, msg.detail);

    if (msg.stage === "executed") {
      setStatus("done", "ready");
    } else if (msg.stage === "error") {
      setStatus("error", "server error");
    } else {
      setStatus("running", "reasoning…");
    }
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    console.log("[SentinelAgent Popup] chrome.runtime.onMessage listener attached.");
    chrome.runtime.onMessage.addListener(handlePipelineMessage);
  } else {
    window.addEventListener("message", (event) => handlePipelineMessage(event.data));
  }

  composerEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const taskGoal = taskInputEl.value.trim();
    if (!taskGoal) return;

    console.log("[SentinelAgent Popup] Submitting task goal:", taskGoal);
    appendLogLine("task", `Task: "${taskGoal}"`, "task");
    setStatus("running", "processing…");

    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "START_TASK", task_goal: taskGoal, taskGoal: taskGoal }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[SentinelAgent Popup] Error dispatching to background:", chrome.runtime.lastError.message);
        }
      });
    }

    taskInputEl.value = "";
    taskInputEl.focus();
  });
})();
