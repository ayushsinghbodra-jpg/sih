/**
 * SentinelAgent popup.
 *
 * Renders pipeline status lines pushed by Person B's background.js /
 * content_script.js via chrome.runtime.sendMessage({stage, detail}),
 * and sends the task goal the user types back out for the pipeline to
 * pick up.
 *
 * Contract (see docs/contracts.md):
 *   chrome.runtime.sendMessage({stage: "<stage>", detail: "<text>"})
 *   stages: captured | detected | redacted | sent | server | executed
 *   (an unrecognized stage still renders, with a neutral icon, rather
 *   than being dropped or throwing)
 */

(function () {
  "use strict";

  const STAGE_META = {
    captured: { icon: "📷" },
    detected: { icon: "🔍" },
    redacted: { icon: "🔒", className: "log-line--redacted" },
    sent: { icon: "📡" },
    server: { icon: "🧠" },
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

  function setStatus(state, label) {
    statusEl.dataset.state = state;
    statusEl.textContent = label;
  }

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

    logEl.scrollTop = logEl.scrollHeight;
  }

  function handlePipelineMessage(msg) {
    if (!msg || typeof msg !== "object") return;

    // Timing payloads (Stage 6) are handled separately from chat-log
    // lines so they don't clutter the visible log.
    if (msg.type === "TIMINGS") {
      console.log("[SentinelAgent timings]", msg.timings);
      return;
    }

    if (!msg.stage) return;

    appendLogLine(msg.stage, msg.detail);

    if (msg.stage === "executed") {
      setStatus("done", "run complete");
    } else if (msg.stage === "error") {
      setStatus("error", "server error");
    } else {
      setStatus("running", "pipeline active");
    }
  }

  // chrome.runtime is undefined when popup.html is opened standalone in
  // a plain browser tab (Stage 3.4's fallback testing method) — guard
  // so that path doesn't throw.
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(handlePipelineMessage);
  } else {
    console.warn(
      "[SentinelAgent] chrome.runtime unavailable — running in standalone test mode. " +
      "Fire test messages manually, e.g.:\n" +
      "window.postMessage({stage:'captured', detail:'Captured screen'})"
    );
    // Standalone fallback so the popup is still testable in a plain tab
    // without the extension loaded, per Stage 3.4.
    window.addEventListener("message", (event) => handlePipelineMessage(event.data));
  }

  composerEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const taskGoal = taskInputEl.value.trim();
    if (!taskGoal) return;

    appendLogLine("task", `Task: "${taskGoal}"`, "task");
    setStatus("running", "starting…");

    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "START_TASK", task_goal: taskGoal });
    } else {
      console.log("[SentinelAgent] (standalone) would send START_TASK:", taskGoal);
    }

    taskInputEl.value = "";
    taskInputEl.focus();
  });
})();
