// Server contract requires elements as {id, type, label} only, and screenshot as raw base64 with no data URI prefix.
// redaction.js - SentinelAgent Privacy & Sanitization Engine

/**
 * Redacts sensitive pixel bounding boxes on an image screenshot.
 *
 * @param {string} screenshotBase64 - Base64 string of screenshot (with or without data URI scheme)
 * @param {Array<Object>} elements - Detected elements with bbox [x, y, w, h] and sensitive boolean flag
 * @returns {Promise<string>} - Resolves to raw base64 JPEG string (NO data URI prefix)
 */
window.redactPixels = function(screenshotBase64, elements) {
  return new Promise((resolve, reject) => {
    if (!screenshotBase64) {
      return resolve("");
    }

    // Strip existing data URI prefix if present before processing
    const rawBase64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageSrc = `data:image/jpeg;base64,${rawBase64}`;

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return reject(new Error("Failed to get 2D canvas rendering context"));
        }

        // Draw original screenshot
        ctx.drawImage(img, 0, 0, width, height);

        // Draw black filled rectangles over all sensitive bounding boxes
        ctx.fillStyle = "#000000";
        if (Array.isArray(elements)) {
          for (const el of elements) {
            if (el && el.sensitive === true && Array.isArray(el.bbox) && el.bbox.length === 4) {
              const [x, y, w, h] = el.bbox;
              ctx.fillRect(x, y, w, h);
            }
          }
        }

        // Export as base64 JPEG (quality: 0.6)
        const dataUrl = canvas.toDataURL("image/jpeg", 0.6);

        // Strip the data URI prefix before returning — server expects raw base64
        const sanitizedRawBase64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
        resolve(sanitizedRawBase64);
      } catch (err) {
        console.error("[SentinelAgent Redaction] Failed to redact pixels:", err);
        reject(err);
      }
    };

    img.onerror = (err) => {
      console.error("[SentinelAgent Redaction] Failed to load image for pixel redaction:", err);
      reject(new Error("Failed to load image for pixel redaction"));
    };

    img.src = imageSrc;
  });
};

/**
 * Sanitizes element labels and enforces the exact server contract: { id, type, label }.
 * Strips bbox, sensitive, and pii_type properties.
 *
 * @param {Array<Object>} elements - Array of detected elements ({id, type, bbox, sensitive, pii_type})
 * @param {Map<string, Element>} [domRegistry] - Optional map of element id -> DOM node
 * @returns {Array<{id: string, type: string, label: string}>} - Strict server contract array
 */
window.redactLabels = function(elements, domRegistry) {
  if (!Array.isArray(elements)) {
    return [];
  }

  return elements.map((el) => {
    if (!el) return { id: "", type: "element", label: "" };

    let label = "";

    if (el.sensitive === true) {
      const piiTag = (el.pii_type || "PII").toUpperCase();
      label = `[REDACTED:${piiTag}]`;
    } else {
      const domNode = domRegistry?.get?.(el.id);
      const innerText = domNode?.innerText?.trim();
      const ariaLabel = domNode?.getAttribute?.("aria-label")?.trim();

      if (innerText) {
        label = innerText.slice(0, 40);
      } else if (ariaLabel) {
        label = ariaLabel.slice(0, 40);
      } else {
        label = el.type || "button";
      }
    }

    return {
      id: el.id,
      type: el.type,
      label: label
    };
  });
};
