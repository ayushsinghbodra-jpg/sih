/**
 * ui_grounding.js
 * Model A — UI Grounding Engine for Client-Side Browser Agent
 *
 * Requirements:
 * 1. Pretrained YOLO11n ONNX Model Execution via ONNX Runtime Web.
 * 2. WebGPU runtime execution provider with WASM fallback.
 * 3. Pure DOM query fallback (querySelectorAll('button, input, a, select, textarea')) when ONNX is unavailable or slow.
 * 4. Image letterbox tensor pre-processing (640x640 float32 CHW) and YOLO NMS post-processing.
 */

class UIGroundingEngine {
  constructor(options = {}) {
    if (options.modelPath) {
      this.modelPath = options.modelPath;
    } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      this.modelPath = chrome.runtime.getURL('perception/models/yolo11n.onnx');
    } else {
      this.modelPath = './perception/models/yolo11n.onnx';
    }
    this.requestedBackend = options.backend || 'auto'; // 'webgpu', 'wasm', 'dom', 'auto'
    this.backend = 'dom-fallback';
    this.onnxSession = null;
    this.inputWidth = 640;
    this.inputHeight = 640;
    this.confidenceThreshold = options.confidenceThreshold || 0.25;
    this.iouThreshold = options.iouThreshold || 0.45;
  }

  /**
   * Initializes ONNX Runtime Web session testing WebGPU first, then WASM fallback.
   */
  async initialize(preferredBackend = null) {
    const backendChoice = preferredBackend || this.requestedBackend;

    if (backendChoice === 'dom') {
      this.backend = 'dom-fallback';
      console.log("[UIGrounding] Running in pure DOM query fallback mode.");
      return;
    }

    if (typeof ort === 'undefined') {
      console.warn("[UIGrounding] ONNX Runtime Web (ort) script not detected. Falling back to DOM element grounding.");
      this.backend = 'dom-fallback';
      return;
    }

    const providersToTry = backendChoice === 'webgpu' ? ['webgpu', 'wasm'] :
                          backendChoice === 'wasm' ? ['wasm'] : ['webgpu', 'wasm'];

    for (const ep of providersToTry) {
      try {
        console.log(`[UIGrounding] Attempting ONNX session creation with provider: ${ep}...`);
        this.onnxSession = await ort.InferenceSession.create(this.modelPath, {
          executionProviders: [ep]
        });
        this.backend = ep;
        console.log(`[UIGrounding] Successfully initialized YOLO11n ONNX model using backend: ${ep.toUpperCase()}`);
        return;
      } catch (err) {
        console.warn(`[UIGrounding] Failed to load ONNX session with ${ep}:`, err.message || err);
      }
    }

    console.warn("[UIGrounding] ONNX model load failed on all execution providers. Activated DOM Fallback.");
    this.backend = 'dom-fallback';
  }

  /**
   * Normalizes Person B flat array or other input formats into standard DOM tree shape.
   */
  _normalizeDomInput(domTree) {
    if (!domTree) return domTree;

    if (Array.isArray(domTree)) {
      return {
        tagName: "BODY",
        id: "body",
        rect: { x: 0, y: 0, width: 800, height: 600 },
        children: domTree.map((el, index) => {
          const rawTag = (el.tag || el.tagName || "div").toUpperCase();
          const rect = Array.isArray(el.bbox) && el.bbox.length === 4
            ? { x: el.bbox[0], y: el.bbox[1], width: el.bbox[2], height: el.bbox[3] }
            : (el.rect || { x: 0, y: 0, width: 0, height: 0 });
          const text = (el.innerText || el.text || el.textContent || "").trim();
          const attrs = {
            ...(el.attributes || {}),
            id: el.id || `node_${index}`,
            type: el.type || (rawTag === 'INPUT' ? 'text' : '')
          };
          return {
            id: el.id || `node_${index}`,
            tagName: rawTag,
            attributes: attrs,
            text: text,
            rect: rect,
            children: []
          };
        })
      };
    }

    return domTree;
  }

  /**
   * Extracts grounded UI elements using ONNX Vision (WebGPU/WASM) or DOM fallback.
   * @param {string|HTMLImageElement|HTMLCanvasElement} imageSource - Screen image / Base64 / Canvas
   * @param {Object|Element} domTree - DOM hierarchy object or Live DOM Document
   * @returns {Promise<Array<Object>>} List of grounded elements with bounding boxes
   */
  async extractElementsAsync(imageSource, domTree) {
    const normalizedDOM = this._normalizeDomInput(domTree);

    if (this.backend !== 'dom-fallback' && this.onnxSession) {
      try {
        const visionBoxes = await this._runYOLOInference(imageSource);
        if (visionBoxes && visionBoxes.length > 0) {
          // Augment vision detected bounding boxes with DOM attributes if available
          return this._mergeVisionWithDOM(visionBoxes, normalizedDOM);
        }
      } catch (e) {
        console.warn("[UIGrounding] Vision inference error, switching to DOM fallback:", e);
      }
    }

    // Fallback Plan: Pure DOM Queries / DOM Tree traversal
    return this.extractElements(imageSource, normalizedDOM);
  }

  /**
   * Main method to extract interactive elements from screen context.
   * Accepts:
   * 1. JSON DOM Tree object ({ tagName: "BODY", children: [...] })
   * 2. Raw HTML string ("<body><input type='password'>...</body>")
   * 3. Live DOM Element (document.body)
   */
  extractElements(imageSource, domTree) {
    const normalizedDOM = this._normalizeDomInput(domTree);
    const elements = [];

    if (typeof normalizedDOM === 'string') {
      const parsedDOM = this._parseHTMLString(normalizedDOM);
      if (parsedDOM) {
        this._traverseDOMTree(parsedDOM, elements);
      }
    } else if (normalizedDOM && typeof normalizedDOM === 'object' && !normalizedDOM.querySelectorAll) {
      this._traverseDOMTree(normalizedDOM, elements);
    } else if (normalizedDOM && normalizedDOM.querySelectorAll) {
      this._extractFromLiveElement(normalizedDOM, elements);
    } else if (typeof document !== 'undefined') {
      this._extractFromLiveDOM(elements);
    }

    return elements;
  }

  /**
   * Converts a raw HTML string into a structured DOM tree object with computed bounding boxes.
   */
  _parseHTMLString(htmlString) {
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      return this._convertElementToDOMTree(doc.body || doc.documentElement);
    }

    // Node environment fallback HTML parser
    return this._parseHTMLStringNodeFallback(htmlString);
  }

  _convertElementToDOMTree(element, yOffset = 50) {
    if (!element) return null;

    const children = [];
    let currentY = yOffset;

    Array.from(element.children || []).forEach((child, index) => {
      const tagName = child.tagName.toUpperCase();
      const attrs = {};
      Array.from(child.attributes || []).forEach(a => attrs[a.name] = a.value);

      const height = ['BUTTON', 'INPUT', 'SELECT'].includes(tagName) ? 40 : 30;
      const width = ['BUTTON', 'INPUT'].includes(tagName) ? 320 : 400;
      const x = 200;

      const nodeObj = {
        id: child.id || attrs.id || `${tagName.toLowerCase()}_${index + 1}`,
        tagName: tagName,
        attributes: attrs,
        text: (child.innerText || child.value || child.placeholder || child.textContent || '').trim(),
        rect: { x: x, y: currentY, width: width, height: height },
        children: []
      };

      currentY += height + 20;

      if (child.children && child.children.length > 0) {
        const subTree = this._convertElementToDOMTree(child, currentY);
        if (subTree && subTree.children) {
          nodeObj.children = subTree.children;
        }
      }

      children.push(nodeObj);
    });

    return {
      id: element.id || 'body',
      tagName: element.tagName ? element.tagName.toUpperCase() : 'BODY',
      rect: { x: 0, y: 0, width: 800, height: 600 },
      children: children
    };
  }

  _parseHTMLStringNodeFallback(htmlString) {
    // Regex extraction for Node environment when DOMParser is unavailable
    const tagRegex = /<(input|button|a|select|textarea)([^>]*)>(?:([\s\S]*?)<\/\1>)?/gi;
    const children = [];
    let match;
    let index = 1;
    let y = 100;

    while ((match = tagRegex.exec(htmlString)) !== null) {
      const tagName = match[1].toUpperCase();
      const attrString = match[2] || '';
      const textContent = match[3] || '';

      const attrs = {};
      const attrRegex = /([a-zA-Z0-9-]+)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrString)) !== null) {
        attrs[attrMatch[1].toLowerCase()] = attrMatch[2] || attrMatch[3] || attrMatch[4] || '';
      }

      children.push({
        id: attrs.id || attrs.name || `${tagName.toLowerCase()}_${index}`,
        tagName: tagName,
        attributes: attrs,
        text: (attrs.value || attrs.placeholder || textContent).trim(),
        rect: { x: 200, y: y, width: 320, height: 40 }
      });

      index++;
      y += 60;
    }

    return {
      tagName: "BODY",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      children: children
    };
  }

  /**
   * Runs YOLO11n Vision Model Inference using ONNX Runtime Web
   */
  async _runYOLOInference(imageSource) {
    const imageElement = await this._loadImage(imageSource);
    if (!imageElement) return [];

    const originalWidth = imageElement.width || 800;
    const originalHeight = imageElement.height || 600;

    // 1. Preprocess: Resize & normalize to float32 NCHW [1, 3, 640, 640]
    const { float32Data, scale, padX, padY } = this._preprocessImage(imageElement);
    const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, this.inputHeight, this.inputWidth]);

    // 2. Execute Inference
    const inputName = this.onnxSession.inputNames[0];
    const feeds = { [inputName]: inputTensor };
    const results = await this.onnxSession.run(feeds);

    const outputName = this.onnxSession.outputNames[0];
    const outputTensor = results[outputName];

    // 3. Postprocess YOLO output [1, 84, 8400]
    return this._postprocessYOLO(outputTensor.data, outputTensor.dims, originalWidth, originalHeight, scale, padX, padY);
  }

  /**
   * Preprocesses image element into float32 array in [1, 3, 640, 640] CHW format with letterbox padding.
   */
  _preprocessImage(imageElement) {
    const canvas = document.createElement('canvas');
    canvas.width = this.inputWidth;
    canvas.height = this.inputHeight;
    const ctx = canvas.getContext('2d');

    const origW = imageElement.width;
    const origH = imageElement.height;
    const scale = Math.min(this.inputWidth / origW, this.inputHeight / origH);
    const newW = Math.round(origW * scale);
    const newH = Math.round(origH * scale);
    const padX = Math.floor((this.inputWidth - newW) / 2);
    const padY = Math.floor((this.inputHeight - newH) / 2);

    ctx.fillStyle = '#777777';
    ctx.fillRect(0, 0, this.inputWidth, this.inputHeight);
    ctx.drawImage(imageElement, 0, 0, origW, origH, padX, padY, newW, newH);

    const imgData = ctx.getImageData(0, 0, this.inputWidth, this.inputHeight);
    const pixels = imgData.data;

    const float32Data = new Float32Array(1 * 3 * this.inputHeight * this.inputWidth);
    const channelSize = this.inputWidth * this.inputHeight;

    for (let i = 0; i < channelSize; i++) {
      float32Data[i] = pixels[i * 4] / 255.0;                   // Red
      float32Data[channelSize + i] = pixels[i * 4 + 1] / 255.0; // Green
      float32Data[2 * channelSize + i] = pixels[i * 4 + 2] / 255.0; // Blue
    }

    return { float32Data, scale, padX, padY };
  }

  /**
   * Parses YOLO output tensor [1, 84, 8400], calculates bounding boxes, and applies NMS.
   */
  _postprocessYOLO(data, dims, origW, origH, scale, padX, padY) {
    const numChannels = dims[1]; // 84 (4 box coords + 80 classes)
    const numAnchors = dims[2];  // 8400 predictions
    const boxes = [];

    for (let i = 0; i < numAnchors; i++) {
      let maxScore = 0;
      let maxClassId = -1;

      for (let c = 4; c < numChannels; c++) {
        const score = data[c * numAnchors + i];
        if (score > maxScore) {
          maxScore = score;
          maxClassId = c - 4;
        }
      }

      if (maxScore >= this.confidenceThreshold) {
        const cx = data[0 * numAnchors + i];
        const cy = data[1 * numAnchors + i];
        const w = data[2 * numAnchors + i];
        const h = data[3 * numAnchors + i];

        // Map back to original image space
        const x1 = Math.max(0, Math.round((cx - w / 2 - padX) / scale));
        const y1 = Math.max(0, Math.round((cy - h / 2 - padY) / scale));
        const boxW = Math.min(origW - x1, Math.round(w / scale));
        const boxH = Math.min(origH - y1, Math.round(h / scale));

        boxes.push({
          bbox: [x1, y1, boxW, boxH],
          confidence: Math.round(maxScore * 100) / 100,
          classId: maxClassId,
          source: 'vision_yolo'
        });
      }
    }

    // Apply Non-Maximum Suppression (NMS)
    const nmsBoxes = this._nonMaxSuppression(boxes);
    return nmsBoxes.map((b, idx) => ({
      id: `yolo_el_${idx + 1}`,
      type: this._mapYOLOClassToType(b.classId),
      bbox: b.bbox,
      confidence: b.confidence,
      sensitive: false
    }));
  }

  _nonMaxSuppression(boxes) {
    boxes.sort((a, b) => b.confidence - a.confidence);
    const selected = [];
    const active = new Array(boxes.length).fill(true);

    for (let i = 0; i < boxes.length; i++) {
      if (!active[i]) continue;
      selected.push(boxes[i]);

      for (let j = i + 1; j < boxes.length; j++) {
        if (!active[j]) continue;
        const iou = this._calculateIoU(boxes[i].bbox, boxes[j].bbox);
        if (iou > this.iouThreshold) {
          active[j] = false;
        }
      }
    }
    return selected;
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

  _mapYOLOClassToType(classId) {
    // Map COCO or custom classes to UI types
    const uiMap = { 0: 'button', 1: 'input', 2: 'link', 3: 'text', 63: 'input' };
    return uiMap[classId] || 'ui_element';
  }

  _mergeVisionWithDOM(visionBoxes, domTree) {
    const domElements = this.extractElements(null, domTree);
    if (domElements.length === 0) return visionBoxes;

    // Enhance DOM elements with vision bounding boxes if close match
    return domElements.map(domEl => {
      const match = visionBoxes.find(v => this._calculateIoU(v.bbox, domEl.bbox) > 0.3);
      if (match) {
        return {
          ...domEl,
          visionMatch: true,
          confidence: match.confidence,
          groundingSource: 'yolo_vision_augmented'
        };
      }
      return { ...domEl, groundingSource: 'dom_heuristic' };
    });
  }

  _loadImage(imageSource) {
    return new Promise(resolve => {
      if (typeof Image === 'undefined') return resolve(null);
      if (imageSource instanceof HTMLImageElement) return resolve(imageSource);
      if (typeof imageSource === 'string') {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = imageSource;
      } else {
        resolve(null);
      }
    });
  }

  /**
   * DOM Traversal & Live DOM query fallback methods
   */
  _traverseDOMTree(node, results) {
    if (!node) return;
    const tagName = (node.tagName || "").toUpperCase();
    if (this._isInteractiveElement(tagName, node.attributes) && node.rect) {
      const elId = node.id || node.attributes?.id || `el_${results.length + 1}`;
      results.push({
        id: elId,
        tagName: tagName,
        type: this._determineElementType(tagName, node.attributes),
        bbox: [
          Math.round(node.rect.x || 0),
          Math.round(node.rect.y || 0),
          Math.round(node.rect.width || 0),
          Math.round(node.rect.height || 0)
        ],
        text: (node.text || node.textContent || node.attributes?.placeholder || "").trim(),
        attributes: node.attributes || {},
        sensitive: false,
        groundingSource: 'dom_query_fallback'
      });
    }

    if (Array.isArray(node.children)) {
      node.children.forEach(child => this._traverseDOMTree(child, results));
    }
  }

  _extractFromLiveDOM(results) {
    const selectors = [
      'button', 'input', 'select', 'textarea', 'a[href]',
      '[role="button"]', '[role="link"]', '[role="textbox"]', '[role="checkbox"]',
      '[role="radio"]', '[role="switch"]', '[role="tab"]', '[role="option"]',
      '[role="combobox"]', '[role="listbox"]', '[role="menuitem"]',
      '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
      'ytd-rich-item-renderer a', 'ytd-video-renderer a', 'ytd-grid-video-renderer a',
      '#video-title', 'a#video-title-link', 'a#thumbnail'
    ].join(', ');
    const nodes = Array.from(document.querySelectorAll(selectors));

    nodes.forEach((el, index) => {
      if (el.closest && el.closest('#sentinel-sidebar-iframe, #sentinel-floating-launcher, [id^="sentinel-"]')) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const tagName = el.tagName.toUpperCase();
      const attrs = {};
      Array.from(el.attributes || []).forEach(attr => attrs[attr.name] = attr.value);

      let titleFromRenderer = "";
      if (!el.getAttribute("title") && (!el.innerText || el.innerText.trim().length < 5)) {
        const renderer = el.closest("ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, article");
        if (renderer) {
          titleFromRenderer = renderer.querySelector("#video-title, [id*='title'], h3")?.getAttribute("title") ||
                              renderer.querySelector("#video-title, [id*='title'], h3")?.innerText || "";
        }
      }

      // Extract best human-readable label
      const labelText = (
        el.getAttribute("title") ||
        titleFromRenderer ||
        el.querySelector("#video-title, [id*='title'], h1, h2, h3, h4")?.innerText ||
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        el.innerText ||
        el.value ||
        (el.labels && el.labels[0] ? el.labels[0].innerText : "") ||
        ""
      ).trim();

      results.push({
        id: el.id || `live_el_${index + 1}`,
        tagName: tagName,
        type: this._determineElementType(tagName, attrs),
        bbox: [
          Math.round(rect.x + window.scrollX),
          Math.round(rect.y + window.scrollY),
          Math.round(rect.width),
          Math.round(rect.height)
        ],
        text: labelText.replace(/\s+/g, " ").slice(0, 120),
        value: (el.value || el.innerText || ""),
        attributes: attrs,
        sensitive: false,
        groundingSource: 'dom_query_fallback'
      });
    });
  }

  _isInteractiveElement(tagName, attributes = {}) {
    if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(tagName)) return true;
    if (attributes.role && ['button', 'link', 'checkbox', 'radio', 'textbox', 'option', 'tab', 'switch', 'combobox'].includes(attributes.role.toLowerCase())) return true;
    return false;
  }

  _determineElementType(tagName, attributes = {}) {
    if (attributes.role) {
      const role = attributes.role.toLowerCase();
      if (['button', 'link', 'checkbox', 'radio', 'textbox', 'option', 'tab', 'switch', 'combobox'].includes(role)) {
        return role;
      }
    }
    if (tagName === 'INPUT') {
      const type = (attributes.type || 'text').toLowerCase();
      if (['button', 'submit', 'reset'].includes(type)) return 'button';
      if (['checkbox', 'radio'].includes(type)) return type;
      return 'input';
    }
    if (tagName === 'BUTTON') return 'button';
    if (tagName === 'A') return 'link';
    if (tagName === 'SELECT') return 'select';
    if (tagName === 'TEXTAREA') return 'textarea';
    return tagName.toLowerCase();
  }
}

if (typeof window !== 'undefined') {
  window.UIGroundingEngine = UIGroundingEngine;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UIGroundingEngine };
}
