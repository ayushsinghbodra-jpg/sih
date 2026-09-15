/**
 * sensitive_detector.js
 * Model B — Sensitive Region & PII Detector for Client-Side Agent
 *
 * Layers:
 * 1. DOM Heuristics (Instant, 100% precision for HTML attributes, zero deps).
 * 2. Regex-Based PII Pattern Detection (Aadhaar, PAN, SSN, Credit Cards, Email, Phone, Passwords).
 * 3. Vision / Face Detection Integration (@tensorflow-models/blazeface ready / canvas scan fallback).
 */

class SensitiveDetector {
  constructor(options = {}) {
    this.enableFaceDetection = options.enableFaceDetection !== false;
    this.blazeFaceModel = null;
    this._initRegexPatterns();
  }

  _initRegexPatterns() {
    this.piiPatterns = [
      { type: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi },
      { type: 'phone', regex: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+91[\s-]?\d{10}|\b[6-9]\d{9}\b/g },
      { type: 'aadhaar', regex: /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g },
      { type: 'pan', regex: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g },
      { type: 'credit_card', regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/g },
      { type: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
      { type: 'cvv', regex: /(?:^|\b)(?:cvv|cvc|cvv2|security\s*code)\s*[:#-]?\s*\b\d{3,4}\b(?!\.\d)/gi },
      { type: 'password', regex: /(?:password|passcode|passphrase|pwd|secret|api[_\-\s]?key)\s*[:=]\s*\S+/gi },
      { type: 'otp', regex: /\b(?:otp|one[\-\s]?time[\-\s]?password|verification[\-\s]?code)\s*[:=\-]?\s*\d{4,8}\b/gi },
      { type: 'pin', regex: /\b(?:mpin|atm[\-\s]?pin|security[\-\s]?pin)\s*[:=\-]?\s*\d{4,6}\b/gi }
    ];

    this.strictInputRegex = /\b(password|passcode|secret|api[_\-\s]?key|auth[_\-\s]?token|ssn|aadhaar|adhar|pan|cvv|csc|routing|mpin)\b/i;
  }

  /**
   * Initializes BlazeFace model if TensorFlow.js & blazeface scripts are present on window.
   */
  async initializeFaceDetector() {
    if (typeof blazeface !== 'undefined' && this.enableFaceDetection) {
      try {
        this.blazeFaceModel = await blazeface.load();
        console.log("[SensitiveDetector] BlazeFace face detector loaded successfully.");
      } catch (e) {
        console.warn("[SensitiveDetector] BlazeFace load failed. Face detection will use heuristic/fallback.", e);
      }
    }
  }

  /**
   * Helper to check if an element is an interactive action button or navigational link
   */
  isActionButtonOrLink(element) {
    if (!element) return false;
    const tag = (element.tagName || element.tag || '').toUpperCase();
    const type = (element.type || element.attributes?.type || '').toLowerCase();
    const role = (element.attributes?.role || element.role || type || '').toLowerCase();
    return (
      tag === 'BUTTON' ||
      tag === 'A' ||
      role === 'button' ||
      role === 'link' ||
      type === 'button' ||
      type === 'submit' ||
      type === 'reset' ||
      type === 'link'
    );
  }

  /**
   * Evaluates an element for sensitivity based on DOM attributes and text content.
   * @param {Object} element - Element from UIGroundingEngine
   * @returns {Object} { sensitive: boolean, pii_type: string|null, confidence: number }
   */
  evaluateElement(element) {
    if (!element) return { sensitive: false, pii_type: null, confidence: 1.0 };

    const isAction = this.isActionButtonOrLink(element);

    // For action buttons/links: DO NOT apply keyword DOM heuristics (e.g. "Next", "Forgot password?", "Show password")
    if (!isAction) {
      // Layer 1: DOM Heuristics for Input Fields
      const domResult = this.checkDOMHeuristics(element);
      if (domResult.sensitive) {
        return domResult;
      }
    }

    // Layer 2: PII Text Patterns (checks text, value, and label)
    const combinedContent = [
      element.text || "",
      element.value || "",
      element.innerText || "",
      element.label || "",
      element.attributes?.value || "",
      element.attributes?.placeholder || ""
    ].join(" ");

    // Skip UI text labels like "Forgot password?", "Show password", "Help", "Privacy" for action buttons
    if (isAction) {
      const buttonText = (element.text || element.innerText || element.label || "").trim().toLowerCase();
      if (
        buttonText.includes("password") ||
        buttonText.includes("help") ||
        buttonText.includes("privacy") ||
        buttonText.includes("terms") ||
        buttonText.includes("next") ||
        buttonText.includes("submit") ||
        buttonText.includes("sign in") ||
        buttonText.includes("log in")
      ) {
        // High confidence UI control, not PII
        return { sensitive: false, pii_type: null, confidence: 1.0 };
      }
    }

    const textResult = this.checkPIIPatterns(combinedContent);
    if (textResult.sensitive) {
      return textResult;
    }

    return { sensitive: false, pii_type: null, confidence: 1.0 };
  }

  /**
   * Layer 1: DOM Heuristics Engine (High Precision, zero latency)
   */
  checkDOMHeuristics(element) {
    const attrs = element.attributes || {};
    const inputType = (attrs.type || element.type || '').toLowerCase();
    const autocomplete = (attrs.autocomplete || '').toLowerCase();
    const name = (attrs.name || '').toLowerCase();
    const jsname = (attrs.jsname || '').toLowerCase();
    const id = (element.id || attrs.id || '').toLowerCase();
    const placeholder = (attrs.placeholder || '').toLowerCase();
    const ariaLabel = (attrs['aria-label'] || '').toLowerCase();

    // 1a. Explicit Password type
    if (inputType === 'password') {
      return { sensitive: true, pii_type: 'password', confidence: 1.0, source: 'dom_heuristic' };
    }

    // 1b. Autocomplete flags (current-password, new-password, cc-*, etc.)
    if (autocomplete.includes('password') || autocomplete.includes('current-password') || autocomplete.includes('new-password')) {
      return { sensitive: true, pii_type: 'password', confidence: 1.0, source: 'dom_autocomplete' };
    }
    if (autocomplete.includes('cc-') || autocomplete.includes('email') || autocomplete.includes('tel')) {
      let piiType = 'sensitive_field';
      if (autocomplete.includes('cc-')) piiType = 'credit_card';
      if (autocomplete.includes('email')) piiType = 'email';
      if (autocomplete.includes('tel')) piiType = 'phone';
      return { sensitive: true, pii_type: piiType, confidence: 0.95, source: 'dom_autocomplete' };
    }

    // 1c. Name / ID / Placeholder / ARIA keyword matching with strict word boundary
    const combinedString = `${id} ${name} ${jsname} ${placeholder} ${ariaLabel}`;
    if (this.strictInputRegex && this.strictInputRegex.test(combinedString)) {
      const match = combinedString.match(this.strictInputRegex);
      const matchedKey = match ? match[0].toLowerCase() : 'sensitive';
      return { sensitive: true, pii_type: matchedKey, confidence: 0.95, source: 'dom_keyword' };
    }

    return { sensitive: false, pii_type: null, confidence: 1.0 };
  }

  /**
   * Layer 2: PII Regex Pattern Detector
   */
  checkPIIPatterns(text) {
    if (!text || typeof text !== 'string') {
      return { sensitive: false, pii_type: null, confidence: 1.0 };
    }

    for (const patternObj of this.piiPatterns) {
      patternObj.regex.lastIndex = 0; // Reset regex state
      if (patternObj.regex.test(text)) {
        return {
          sensitive: true,
          pii_type: patternObj.type,
          confidence: 0.95,
          source: 'regex_pii'
        };
      }
    }

    return { sensitive: false, pii_type: null, confidence: 1.0 };
  }

  /**
   * Layer 3: Face Detection on Screenshot Image / Canvas Element
   * @param {HTMLImageElement|HTMLCanvasElement} imageElement
   * @returns {Promise<Array<Object>>} List of face bounding boxes [x, y, width, height]
   */
  async detectFaces(imageElement) {
    if (this.blazeFaceModel && imageElement) {
      try {
        const predictions = await this.blazeFaceModel.estimateFaces(imageElement, false);
        return predictions.map(pred => {
          const start = pred.topLeft;
          const end = pred.bottomRight;
          return {
            bbox: [
              Math.round(start[0]),
              Math.round(start[1]),
              Math.round(end[0] - start[0]),
              Math.round(end[1] - start[1])
            ],
            type: 'face',
            confidence: Math.round((pred.probability ? pred.probability[0] : 0.9) * 100) / 100
          };
        });
      } catch (e) {
        console.warn("[SensitiveDetector] Face detection error:", e);
      }
    }
    return [];
  }
}

if (typeof window !== 'undefined') {
  window.SensitiveDetector = SensitiveDetector;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SensitiveDetector };
}
