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

        // Draw solid black filled rectangles over all sensitive bounding boxes (with 4px safety padding)
        ctx.fillStyle = "#000000";
        if (Array.isArray(elements)) {
          for (const el of elements) {
            if (el && el.sensitive === true && Array.isArray(el.bbox) && el.bbox.length === 4) {
              const [x, y, w, h] = el.bbox;
              const pad = 4;
              const rx = Math.max(0, x - pad);
              const ry = Math.max(0, y - pad);
              const rw = Math.min(width - rx, w + (pad * 2));
              const rh = Math.min(height - ry, h + (pad * 2));
              ctx.fillRect(rx, ry, rw, rh);
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
 * GUARANTEE: Never transmits user-typed private input values as labels.
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
      const piiTag = (el.pii_type || "SENSITIVE").toUpperCase();
      label = `[REDACTED:${piiTag}]`;
    } else {
      const domNode = domRegistry?.get?.(el.id);
      
      // 1. Resolve aria-labelledby (Google Forms / Google Sign-In question title resolution)
      let ariaLabelledByText = "";
      const ariaLabelledBy = domNode?.getAttribute?.("aria-labelledby");
      if (ariaLabelledBy) {
        const ids = ariaLabelledBy.trim().split(/\s+/);
        const texts = ids.map(id => document.getElementById(id)?.innerText?.trim()).filter(Boolean);
        if (texts.length > 0) {
          ariaLabelledByText = texts.join(" ").replace(/\s+/g, " ");
        }
      }

      // 2. Multi-layer title & label resolution (STRUCTURAL PROMPTS ONLY — NEVER TYPED VALUES)
      const titleAttr = domNode?.getAttribute?.("title")?.trim();
      const ariaLabel = domNode?.getAttribute?.("aria-label")?.trim();
      const dataValue = domNode?.getAttribute?.("data-value")?.trim();
      const nestedTitle = domNode?.querySelector?.("#video-title, [id*='title'], h1, h2, h3, h4, .yt-core-attributed-string")?.innerText?.trim();
      const innerText = (domNode?.tagName === "INPUT" || domNode?.tagName === "TEXTAREA") ? "" : domNode?.innerText?.trim();
      const placeholder = domNode?.getAttribute?.("placeholder")?.trim();
      const preText = (el.text || el.label || "").trim();

      // 3. Question container title for form inputs & radio options
      let questionTitle = "";
      if (domNode) {
        const role = domNode.getAttribute?.("role");
        const isRadioOrCheck = role === "radio" || role === "checkbox" || domNode.type === "radio" || domNode.type === "checkbox";
        const group = domNode.closest?.('[role="radiogroup"], [role="listitem"], .Qr7Oae, .geS5n, .m2, .form-group, fieldset, [jsmodel]');
        if (group) {
          const qText = group.querySelector?.('[role="heading"], .M7eMe, legend, .exportLabel, .title, .label, h1, h2, h3, h4, h5, .HoPnR')?.innerText?.trim();
          if (qText) {
            const optText = ariaLabel || dataValue || innerText;
            if (isRadioOrCheck && optText) {
              questionTitle = `${qText}: ${optText}`;
            } else if (!isRadioOrCheck) {
              questionTitle = qText;
            }
          }
        }
      }

      // 4. YouTube specific renderer title
      let rendererTitle = "";
      if (domNode && (!titleAttr && !nestedTitle && (!innerText || innerText.length < 5))) {
        const videoRenderer = domNode.closest?.("ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, article");
        if (videoRenderer) {
          rendererTitle = videoRenderer.querySelector?.("#video-title, [id*='title'], h3")?.getAttribute?.("title") ||
                          videoRenderer.querySelector?.("#video-title, [id*='title'], h3")?.innerText?.trim() || "";
        }
      }

      // 5. Associated <label> tag
      let forLabel = "";
      if (domNode?.labels && domNode.labels.length > 0) {
        forLabel = Array.from(domNode.labels).map(l => l.innerText.trim()).filter(Boolean).join(" ");
      } else if (domNode?.id) {
        forLabel = document.querySelector(`label[for="${domNode.id}"]`)?.innerText?.trim() || "";
      }

      // NEVER include user-typed password/credential input values as labels
      const resolved = ariaLabelledByText || questionTitle || forLabel || titleAttr || rendererTitle || nestedTitle || ariaLabel || placeholder || innerText || preText;

      if (resolved) {
        label = resolved.replace(/\s+/g, " ").slice(0, 120);
      } else {
        label = el.type || "input";
      }
    }

    return {
      id: el.id,
      type: el.type,
      label: label
    };
  });
};
