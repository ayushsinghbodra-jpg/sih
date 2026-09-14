let GroundingEngineRef = typeof UIGroundingEngine !== 'undefined' ? UIGroundingEngine : null;
let SensitiveDetectorRef = typeof SensitiveDetector !== 'undefined' ? SensitiveDetector : null;
let RedactionPolicyRef = typeof RedactionPolicy !== 'undefined' ? RedactionPolicy : null;

if (typeof require !== 'undefined') {
  if (!GroundingEngineRef) GroundingEngineRef = require('./ui_grounding.js').UIGroundingEngine;
  if (!SensitiveDetectorRef) SensitiveDetectorRef = require('./sensitive_detector.js').SensitiveDetector;
  if (!RedactionPolicyRef) RedactionPolicyRef = require('./redaction_policy.js').RedactionPolicy;
}

class PerceptionEngine {
  constructor(options = {}) {
    this.groundingEngine = new GroundingEngineRef(options);
    this.sensitiveDetector = new SensitiveDetectorRef(options);
    this.redactionPolicy = new RedactionPolicyRef(options);
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    await this.groundingEngine.initialize();
    await this.sensitiveDetector.initializeFaceDetector();
    this.initialized = true;
  }

  /**
   * Primary entry point for analyzing screen context and extracting redacted elements.
   * @param {string} screenshotBase64 - Base64 encoded JPEG/PNG image of screen.
   * @param {Object|Element} domTree - Flattened DOM tree representation or live DOM element.
   * @returns {Object} Result complying with contract: { elements: [...] }
   */
  async analyze(screenshotBase64, domTree) {
    const startTime = performance.now();

    if (!this.initialized) {
      await this.initialize();
    }

    // Step 1: UI Grounding - Extract elements via YOLO ONNX (WebGPU/WASM) or DOM fallback
    const rawElements = await this.groundingEngine.extractElementsAsync(screenshotBase64, domTree);

    // Step 2: Sensitive & PII Detection
    const evaluatedElements = rawElements.map(el => {
      const evaluation = this.sensitiveDetector.evaluateElement(el);
      return {
        ...el,
        sensitive: evaluation.sensitive,
        pii_type: evaluation.pii_type || null,
        confidence: evaluation.confidence
      };
    });

    // Step 3: Face Detection on Screen Image via BlazeFace
    let faceBoxes = [];
    if (screenshotBase64 && typeof Image !== 'undefined') {
      try {
        const img = await this._loadImage(screenshotBase64);
        if (img) {
          faceBoxes = await this.sensitiveDetector.detectFaces(img);
        }
      } catch (e) {
        console.warn("[PerceptionEngine] Face detection skipped:", e);
      }
    }

    // Step 4: Redaction Policy Application
    const policyOutput = this.redactionPolicy.applyPolicy(evaluatedElements, faceBoxes);

    const endTime = performance.now();
    const latencyMs = Math.round((endTime - startTime) * 100) / 100;

    return {
      elements: policyOutput.elements.map(el => ({
        id: el.id,
        type: el.type,
        bbox: el.bbox,
        sensitive: el.sensitive,
        ...(el.pii_type ? { pii_type: el.pii_type } : {})
      })),
      redactedBoxes: policyOutput.redactedBoxes,
      summary: {
        ...policyOutput.summary,
        latencyMs: latencyMs,
        groundingBackend: this.groundingEngine.backend
      }
    };
  }

  _loadImage(src) {
    return new Promise(resolve => {
      if (typeof Image === 'undefined') return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
}

// Global Singleton Instance
const _globalPerceptionEngine = new PerceptionEngine();

/**
 * Person A Single Exported Function (Contract Specification)
 * @param {string} screenshotBase64
 * @param {Object} domTree
 * @returns {Object} { elements: [...] }
 */
async function analyzeScreen(screenshotBase64, domTree) {
  return await _globalPerceptionEngine.analyze(screenshotBase64, domTree);
}

// Synchronous Fallback version for quick testing without top-level await
function analyzeScreenSync(screenshotBase64, domTree) {
  const grounding = new GroundingEngineRef();
  const detector = new SensitiveDetectorRef();
  const policy = new RedactionPolicyRef();

  const rawElements = grounding.extractElements(screenshotBase64, domTree);
  const evaluated = rawElements.map(el => {
    const res = detector.evaluateElement(el);
    return {
      ...el,
      sensitive: res.sensitive,
      pii_type: res.pii_type || null,
      confidence: res.confidence
    };
  });

  const output = policy.applyPolicy(evaluated);

  return {
    elements: output.elements.map(el => ({
      id: el.id,
      type: el.type,
      bbox: el.bbox,
      sensitive: el.sensitive,
      ...(el.pii_type ? { pii_type: el.pii_type } : {})
    })),
    redactedBoxes: output.redactedBoxes,
    summary: output.summary
  };
}

if (typeof window !== 'undefined') {
  window.PerceptionEngine = PerceptionEngine;
  window.analyzeScreen = analyzeScreen;
  window.analyzeScreenSync = analyzeScreenSync;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PerceptionEngine, analyzeScreen, analyzeScreenSync };
}
