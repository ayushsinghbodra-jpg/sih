// action_executor.js - SentinelAgent DOM Action Execution Engine
// Content script context: attaches functions to window object without ES module imports.

// 1. Module-level element registry mapping elementId -> DOM Node reference
const elementRegistry = new Map();
window.elementRegistry = elementRegistry;

/**
 * 2. Registers detected elements by resolving their bounding box centers to live DOM nodes.
 *
 * @param {Array<Object>} elements - Array of detected elements with id and bbox [x, y, w, h]
 */
window.registerElements = function(elements) {
  if (!Array.isArray(elements)) return;

  elementRegistry.clear();

  for (const element of elements) {
    if (!element || !element.id) continue;

    let targetNode = null;

    // First try resolving by bbox center coordinates
    if (Array.isArray(element.bbox) && element.bbox.length === 4) {
      const [x, y, w, h] = element.bbox;
      const centerX = Math.round(x + w / 2);
      const centerY = Math.round(y + h / 2);

      const nodesAtPoint = document.elementsFromPoint(centerX, centerY);

      if (nodesAtPoint && nodesAtPoint.length > 0) {
        // Prioritize interactive elements if available at the coordinate
        const interactiveNode = nodesAtPoint.find(node =>
          ["BUTTON", "INPUT", "TEXTAREA", "A", "SELECT"].includes(node.tagName) ||
          node.hasAttribute("role") ||
          node.hasAttribute("tabindex") ||
          node.onclick
        );

        targetNode = interactiveNode || nodesAtPoint[0];
      }
    }

    // Fallback: If id is a valid DOM id in the document
    if (!targetNode && element.id) {
      targetNode = document.getElementById(element.id);
    }

    if (targetNode) {
      elementRegistry.set(element.id, targetNode);
      console.log(`[SentinelAgent ActionExecutor] Registered element "${element.id}" -> <${targetNode.tagName.toLowerCase()} id="${targetNode.id}">`);
    } else {
      console.warn(`[SentinelAgent ActionExecutor] Could not resolve DOM node for element "${element.id}"`);
    }
  }

  console.log(`[SentinelAgent ActionExecutor] Element registry updated with ${elementRegistry.size} live nodes.`);
};

/**
 * Helper to dispatch framework-compatible input events (React, Vue, Angular)
 */
function setNativeValue(element, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    element.value = value;
  }
}

/**
 * 3. Executes an agent action against the registered DOM elements.
 *
 * @param {Object} actionPayload - { action, target_id, value }
 * @returns {Promise<boolean>} - Success status
 */
window.executeAction = async function(actionPayload) {
  if (!actionPayload || typeof actionPayload !== "object") {
    console.warn("[SentinelAgent ActionExecutor] Invalid action payload received:", actionPayload);
    return false;
  }

  const { action, target_id, value } = actionPayload;
  console.log(`[SentinelAgent ActionExecutor] Executing action: "${action}" | target: "${target_id}" | value:`, value);

  try {
    switch (action) {
      case "click": {
        const node = elementRegistry.get(target_id);
        if (!node) {
          console.warn(`[SentinelAgent ActionExecutor] Click target "${target_id}" not found in registry. Safe no-op.`);
          return false;
        }

        node.scrollIntoView({ behavior: "smooth", block: "center" });
        node.focus();
        node.click();

        // Dispatch simulated MouseEvents for custom click handlers
        node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));

        console.log(`[SentinelAgent ActionExecutor] Successfully clicked element "${target_id}".`);
        return true;
      }

      case "type": {
        const node = elementRegistry.get(target_id);
        if (!node) {
          console.warn(`[SentinelAgent ActionExecutor] Type target "${target_id}" not found in registry. Safe no-op.`);
          return false;
        }

        node.scrollIntoView({ behavior: "smooth", block: "center" });
        node.focus();

        const stringValue = value !== null && value !== undefined ? String(value) : "";
        setNativeValue(node, stringValue);

        // Dispatch comprehensive event sequence for single page apps (React, Vue, etc.)
        node.dispatchEvent(new Event("keydown", { bubbles: true }));
        node.dispatchEvent(new Event("keypress", { bubbles: true }));
        node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: stringValue }));
        node.dispatchEvent(new Event("change", { bubbles: true }));
        node.dispatchEvent(new Event("keyup", { bubbles: true }));

        console.log(`[SentinelAgent ActionExecutor] Successfully typed into element "${target_id}".`);
        return true;
      }

      case "scroll": {
        const scrollDistance = typeof value === "number" ? value : (value === "up" ? -300 : 300);
        window.scrollBy({ top: scrollDistance, behavior: "smooth" });
        console.log(`[SentinelAgent ActionExecutor] Successfully scrolled by ${scrollDistance}px.`);
        return true;
      }

      case "none": {
        console.log("[SentinelAgent ActionExecutor] Action is none. No DOM operation needed.");
        return true;
      }

      // NOT part of the agreed contract with Person C (click/type/scroll/none only) — kept only if C's server is confirmed to emit these; verify with C before relying on this branch, otherwise remove it.
      case "idle":
      case "wait": {
        console.log(`[SentinelAgent ActionExecutor] Action is ${action}. No DOM operation needed.`);
        return true;
      }

      default:
        console.warn(`[SentinelAgent ActionExecutor] Unknown action type: "${action}". Safe no-op.`);
        return false;
    }
  } catch (error) {
    console.error("[SentinelAgent ActionExecutor] Error executing action:", error);
    return false; // Never throw to prevent crashing the extension pipeline
  }
};
