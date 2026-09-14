/**
 * SentinelAgent popup.
 *
 * Renders pipeline status lines and real-time performance telemetry
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
    executed: { icon: "✨", className: "log-line--executed" },
    error: { icon: "⚠️", className: "log-line--error" },
  };

  const DEFAULT_META = { icon: "•" };

  const logEl = document.getElementById("log");
  const logEmptyEl = document.getElementById("logEmpty");
  const statusEl = document.getElementById("connectionStatus");
  const composerEl = document.getElementById("composer");
  const taskInputEl = document.getElementById("taskInput");
  const sendButtonEl = document.getElementById("sendButton");

  // Telemetry Elements
  const telemetryToggle = document.getElementById("telemetryToggle");
  const telemetryToggleText = document.getElementById("telemetryToggleText");
  const telemetryDrawer = document.getElementById("telemetryDrawer");
  const telemetryPillText = document.getElementById("telemetryPillText");

  const valCapture = document.getElementById("valCapture");
  const valPerception = document.getElementById("valPerception");
  const valRedact = document.getElementById("valRedact");
  const valServer = document.getElementById("valServer");
  const valTotal = document.getElementById("valTotal");
  const valMemory = document.getElementById("valMemory");
  const valElements = document.getElementById("valElements");

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
      const chevron = telemetryToggle.querySelector(".telemetry-bar__chevron");
      if (chevron) {
        chevron.style.transform = isOpen ? "rotate(180deg)" : "rotate(0deg)";
      }
    }
  }

  if (telemetryToggle) {
    telemetryToggle.addEventListener("click", toggleTelemetry);
  }

  // Suggestion Chips
  document.querySelectorAll(".suggestion-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const prompt = chip.getAttribute("data-prompt");
      if (prompt && taskInputEl) {
        taskInputEl.value = prompt;
        composerEl.dispatchEvent(new Event("submit", { cancelable: true }));
      }
    });
  });

  function appendLogLine(stage, detail, variant) {
    if (logEmptyEl && logEmptyEl.parentNode) {
      logEmptyEl.remove();
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

    // Auto scroll to latest response
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

      if (telemetryPillText) {
        telemetryPillText.textContent = `⚡ ${(t.total / 1000).toFixed(2)}s total (${t.clientTotal}ms client)`;
      }

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
    appendLogLine("task", taskGoal, "task");
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
