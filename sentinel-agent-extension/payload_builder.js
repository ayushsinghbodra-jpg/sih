// payload_builder.js - Sanitized Payload Construction Module
// Content script context: attaches buildPayload to window object.

/**
 * Builds the sanitized payload object ready for agent perception & decision server.
 *
 * @param {string} taskGoal - High-level task objective or user instruction
 * @param {string} redactedScreenshot - Sanitized base64 screenshot data URL
 * @param {Array<Object>} elements - Sanitized element array with bounding boxes and redacted labels
 * @param {Array<Object>} stepHistory - History of previous steps/actions taken
 * @returns {Object} - Formatted payload object
 */
function buildPayload(taskGoal, redactedScreenshot, elements, stepHistory = []) {
  return {
    task_goal: taskGoal,
    redacted_screenshot: redactedScreenshot,
    elements: elements,
    step_history: stepHistory
  };
}

// Attach to window for global access across content scripts without ES module imports
window.buildPayload = buildPayload;
