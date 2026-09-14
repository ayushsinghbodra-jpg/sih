/**
 * redaction_policy.js
 * Confidence-based Redaction Decision Engine
 *
 * Policy Strategy:
 * - Safety-biased redaction (when uncertain -> REDACT ANYWAY).
 * - Threshold rule: confidence < 0.6 or flagged sensitive => mark for redaction.
 */

class RedactionPolicy {
  constructor(options = {}) {
    this.confidenceThreshold = options.confidenceThreshold || 0.6;
    this.safetyBiased = options.safetyBiased !== false;
  }

  /**
   * Applies safety-biased redaction rules to grounded elements & visual face detections.
   * @param {Array<Object>} elements - List of grounded UI elements
   * @param {Array<Object>} faceBoxes - List of detected face bounding boxes
   * @returns {Object} { elements, redactedBoxes, summary }
   */
  applyPolicy(elements, faceBoxes = []) {
    const redactedBoxes = [];
    let sensitiveCount = 0;

    const processedElements = elements.map(el => {
      const copy = { ...el };

      // Confidence-based decision logic
      // Rule 1: Explicit sensitive flag set by detector
      // Rule 2: Low detection confidence (< 0.6) in safety-biased mode forces redaction
      const isLowConfidence = copy.confidence !== undefined && copy.confidence < this.confidenceThreshold;
      const shouldRedact = copy.sensitive || (this.safetyBiased && isLowConfidence);

      if (shouldRedact) {
        copy.sensitive = true;
        copy.redacted = true;
        sensitiveCount++;

        redactedBoxes.push({
          id: `redact_${copy.id}`,
          bbox: copy.bbox,
          reason: copy.pii_type || (isLowConfidence ? 'low_confidence_uncertainty' : 'sensitive_data'),
          confidence: copy.confidence || 1.0
        });
      } else {
        copy.sensitive = false;
        copy.redacted = false;
      }

      return copy;
    });

    // Add visual face redaction boxes
    faceBoxes.forEach((face, idx) => {
      redactedBoxes.push({
        id: `redact_face_${idx + 1}`,
        bbox: face.bbox,
        reason: 'face_pii',
        confidence: face.confidence || 0.95
      });
      sensitiveCount++;
    });

    return {
      elements: processedElements,
      redactedBoxes: redactedBoxes,
      summary: {
        totalElements: processedElements.length,
        sensitiveElements: sensitiveCount,
        redactedBoxesCount: redactedBoxes.length,
        confidenceThreshold: this.confidenceThreshold,
        safetyBiasedMode: this.safetyBiased
      }
    };
  }
}

if (typeof window !== 'undefined') {
  window.RedactionPolicy = RedactionPolicy;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RedactionPolicy };
}
