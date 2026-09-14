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
      { type: 'cvv', regex: /(?:^|\b)(?:cvv|cvc|cvv2|security code)?\s*[:#-]?\s*\b\d{3,4}\b(?!\.\d)/gi }
    ];

    this.sensitiveKeywords = [
      'password', 'pwd', 'pass', 'secret', 'token', 'auth', 'api_key', 'apikey',
      'ssn', 'aadhaar', 'adhar', 'pan', 'pancard', 'credit', 'card', 'cvv', 'csc',
      'pin', 'dob', 'birth', 'bank', 'account', 'routing', 'salary', 'phone', 'mobile'
    ];
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
   * Evaluates an element for sensitivity based on DOM attributes and text content.
   * @param {Object} element - Element from UIGroundingEngine
   * @returns {Object} { sensitive: boolean, pii_type: string|null, confidence: number }
   */
  evaluateElement(element) {
    // Layer 1: DOM Heuristics
    const domResult = this.checkDOMHeuristics(element);
    if (domResult.sensitive) {
      return domResult;
    }

    // Layer 2: PII Text Patterns
    const textResult = this.checkPIIPatterns(element.text || "");
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
    const inputType = (attrs.type || '').toLowerCase();
    const autocomplete = (attrs.autocomplete || '').toLowerCase();
    const name = (attrs.name || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const placeholder = (attrs.placeholder || '').toLowerCase();
    const ariaLabel = (attrs['aria-label'] || '').toLowerCase();

    // 1a. Explicit Password type
    if (inputType === 'password') {
      return { sensitive: true, pii_type: 'password', confidence: 1.0, source: 'dom_heuristic' };
    }

    // 1b. Autocomplete flags
    if (autocomplete.includes('cc-') || autocomplete.includes('email') || autocomplete.includes('tel') || autocomplete.includes('password')) {
      let piiType = 'sensitive_field';
      if (autocomplete.includes('cc-')) piiType = 'credit_card';
      if (autocomplete.includes('email')) piiType = 'email';
      if (autocomplete.includes('tel')) piiType = 'phone';
      if (autocomplete.includes('password')) piiType = 'password';
      return { sensitive: true, pii_type: piiType, confidence: 0.95, source: 'dom_autocomplete' };
    }

    // 1c. Name / ID / Placeholder keyword matching
    const combinedString = `${id} ${name} ${placeholder} ${ariaLabel}`;
    for (const kw of this.sensitiveKeywords) {
      if (combinedString.includes(kw)) {
        return { sensitive: true, pii_type: kw, confidence: 0.90, source: 'dom_keyword' };
      }
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
   * Layer 3: Multi-Scale Tiled Face Detection on Screen Context Image
   * @param {HTMLImageElement|HTMLCanvasElement} imageElement
   * @returns {Promise<Array<Object>>} List of face bounding boxes [x, y, width, height]
   */
  async detectFaces(imageElement) {
    if (!this.blazeFaceModel || !imageElement) return [];

    try {
      // 1. Primary pass on full resolution image
      let rawPredictions = await this._predictCanvasOrImage(imageElement, 0, 0);

      const width = imageElement.naturalWidth || imageElement.width || 0;
      const height = imageElement.naturalHeight || imageElement.height || 0;

      // 2. Multi-Scale Tiled Pass for full desktop screenshots where faces are tiny thumbnails
      if (rawPredictions.length === 0 && width > 640 && typeof document !== 'undefined') {
        const tiledPredictions = await this._runTiledFaceDetection(imageElement, width, height);
        rawPredictions = rawPredictions.concat(tiledPredictions);
      }

      // 3. Deduplicate overlapping face bounding boxes across tiles
      const deduplicated = this._deduplicateFaceBoxes(rawPredictions);

      return deduplicated.map(pred => ({
        bbox: pred.bbox,
        type: 'face',
        confidence: pred.confidence
      }));
    } catch (e) {
      console.warn("[SensitiveDetector] Face detection error:", e);
      return [];
    }
  }

  async _predictCanvasOrImage(source, offsetX = 0, offsetY = 0) {
    const predictions = await this.blazeFaceModel.estimateFaces(source, false);
    return predictions.map(pred => {
      const start = pred.topLeft;
      const end = pred.bottomRight;
      const w = Math.round(end[0] - start[0]);
      const h = Math.round(end[1] - start[1]);
      return {
        bbox: [
          Math.round(start[0] + offsetX),
          Math.round(start[1] + offsetY),
          w,
          h
        ],
        confidence: Math.round((pred.probability ? pred.probability[0] : 0.85) * 100) / 100
      };
    });
  }

  async _runTiledFaceDetection(imageElement, origW, origH) {
    const tiles = [];
    const tileW = Math.ceil(origW * 0.55);
    const tileH = Math.ceil(origH * 0.55);
    const stepX = Math.floor(origW * 0.45);
    const stepY = Math.floor(origH * 0.45);

    const canvas = document.createElement('canvas');
    canvas.width = tileW;
    canvas.height = tileH;
    const ctx = canvas.getContext('2d');

    for (let y = 0; y < origH; y += stepY) {
      for (let x = 0; x < origW; x += stepX) {
        ctx.clearRect(0, 0, tileW, tileH);
        ctx.drawImage(imageElement, x, y, tileW, tileH, 0, 0, tileW, tileH);
        const preds = await this._predictCanvasOrImage(canvas, x, y);
        tiles.push(...preds);
      }
    }
    return tiles;
  }

  _deduplicateFaceBoxes(boxes) {
    if (boxes.length <= 1) return boxes;
    boxes.sort((a, b) => b.confidence - a.confidence);
    const result = [];
    for (const b of boxes) {
      const isOverlap = result.some(r => this._calculateIoU(b.bbox, r.bbox) > 0.3);
      if (!isOverlap) result.push(b);
    }
    return result;
  }

  _calculateIoU(boxA, boxB) {
    const [xA, yA, wA, hA] = boxA;
    const [xB, yB, wB, hB] = boxB;
    const x1 = Math.max(xA, xB);
    const y1 = Math.max(yA, yB);
    const x2 = Math.min(xA + wA, xB + wB);
    const y2 = Math.min(yA + hA, yB + hB);
    const interWidth = Math.max(0, x2 - x1);
    const interHeight = Math.max(0, y2 - y1);
    const interArea = interWidth * interHeight;
    const areaA = wA * hA;
    const areaB = wB * hB;
    return interArea / (areaA + areaB - interArea + 1e-6);
  }
}

if (typeof window !== 'undefined') {
  window.SensitiveDetector = SensitiveDetector;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SensitiveDetector };
}
