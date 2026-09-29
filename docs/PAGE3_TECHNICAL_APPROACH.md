# Page 3 — Technical Approach (Preparation Target)

**Purpose:** The slide as it *should* exist at submission — nothing from current code, only the prepared/expected state.

---

## Slide Layout

Two panels, equal weight:

| Left: **Technology Stack** (corrected, verifiable) | Right: **Two-Channel Redaction Fork** (the architecture) |
| :--- | :--- |

---

## 1. Technology Stack (Left Panel)

```mermaid
graph TB
    subgraph CLIENT["CLIENT — Chrome MV3 / Firefox WebExtension<br/>No build step · No bundler"]
        direction TB
        CAP["Capture<br/>chrome.tabs.captureVisibleTab<br/>JPEG q=60 · visible viewport"]
        DOM["DOM Grounding<br/>getBoundingClientRect · 25 selectors<br/>Viewport cull · 50-element cap"]
        YOLO["UI Vision<br/>YOLO11n ONNX Runtime Web 1.19.2<br/>WebGPU → WASM-SIMD fallback<br/>ScreenParse v2 fine-tuned · INT8 · 10.9 MB"]
        FACE["Face Detection<br/>BlazeFace · Vendored weights<br/>No CDN fetch · Bundled in libs/"]
        PII["PII Engine<br/>Pattern Registry (data, not code)<br/>Aadhaar·PAN·GSTIN·IFSC·UPI<br/>Card·CVV·OTP·Password"]
        VAL["Checksum Validators<br/>Verhoeff (Aadhaar) · Luhn (Card)<br/>mod-36 (GSTIN) · PAN char-4"]
        RED["Redaction Engine<br/>Solid-black canvas #000000<br/>Typed label masking"]
    end

    CAP --> DOM
    DOM --> YOLO
    YOLO --> FACE
    FACE --> PII
    PII --> VAL
    VAL --> RED

    subgraph SERVER["SERVER — Python FastAPI"]
        AUTH["Auth + Rate Limit<br/>Shared secret · Body cap · /docs off"]
        ROUTER["Model Router<br/>Open-weights primary"]
        LOCAL["Local Qwen2.5-VL-7B<br/>Self-hosted · Open-weights"]
        CLOUD["Gemini Flash<br/>Opt-in fallback"]
        VERIF["Schema + target_id Validation<br/>Repair-retry once"]
    end

    RED --> AUTH
    AUTH --> ROUTER
    ROUTER --> LOCAL
    ROUTER --> CLOUD
    LOCAL --> VERIF
    CLOUD --> VERIF

    classDef ready fill:#efe,stroke:#080,stroke-width:2px
    classDef fix fill:#ffe,stroke:#e80,stroke-width:2px
    class DOM,CAP,PII,VAL,RED,AUTH,ROUTER,VERIF ready
    class YOLO,FACE,LOCAL fix
```

**Caption:** "Chrome MV3 · ONNX Runtime Web · ScreenParse-v2 YOLO11n · Qwen2.5-VL local"

---

## 2. Two-Channel Redaction Fork (Right Panel)

```mermaid
flowchart TD
    FUSE[Grounding Fusion<br/>DOM ∩ Vision ∩ BlazeFace ∩ OCR] --> DET[PII Detection<br/>Patterns + Verhoeff/Luhn/mod-36]
    
    DET --> RED[Redaction Engine]
    
    RED --> PIX["Pixel Channel<br/>solid-black #000000 fillRect<br/>DESTROYED — irreversibly"]
    RED --> STRUCT["Structural Channel<br/>[REDACTED:PASSWORD] [REDACTED:AADHAAR]<br/>PRESERVED — type + id intact"]
    
    PIX --> VLM["VLM sees only<br/>blacked-out regions"]
    STRUCT --> VLM
    STRUCT --> ACT["Agent acts on el_7<br/>knows credential field exists<br/>never reads value"]
    
    classDef destroyed fill:#fcc,stroke:#c00,stroke-width:2px
    classDef preserved fill:#cfc,stroke:#080,stroke-width:2px
    class PIX destroyed
    class STRUCT preserved
```

**Caption:** "Pixel channel destroyed · Structural channel preserved · Same element id bridges both"

---

## Slide-Ready Checklist

| Item | Status |
| :-- | :-- |
| YOLO11n fine-tuned on ScreenParse v2, exported, replaces stock model | ☐ |
| BlazeFace weights vendored in `libs/blazeface/`, no `tfhub.dev` fetch | ☐ |
| `ort.env.wasm.wasmPaths = chrome.runtime.getURL('libs/')` set before session | ☐ |
| Local Qwen2.5-VL-7B deployed, behind `ModelRouter` | ☐ |
| Verhoeff / Luhn / mod-36 / PAN-char4 validators wired | ☐ |
| Pattern registry as data (`perception/patterns.js`) | ☐ |
| Redaction: PNG re-encode (no JPEG chroma leakage) | ☐ |
| Payload contract: `{id, type, label}` only — no value field ever constructed | ☐ |

---

## What This Page Communicates

1. **Stack is real, auditable, and browser-native** — no hidden build, no TypeScript claim, no phantom MiniLM
2. **Architecture is the two-channel fork** — this is the only novel claim; everything else is implementation
3. **Open-weights primary** — PS-compliant; cloud is opt-in
4. **Indian PII is explicit** — validators named, not implied
5. **Everything on the left is either already true or fixable in one afternoon** — nothing is aspirational