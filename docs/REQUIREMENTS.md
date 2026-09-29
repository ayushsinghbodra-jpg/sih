# Requirements & Gap Checklist

**Project:** SentinelAgent — SIH26171, *On-device Visual Perception for Light-weight Browser Agents* (ISRO / Dept. of Space)
**Companion doc:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) — analysis, diagrams, target design
**Purpose:** the actionable counterpart to `ARCHITECTURE.md`. That doc says *what is wrong and what the target looks like*. This one says *what has to exist, and how you know it's done*.

**How to use:** every requirement has an ID, a source (which problem-statement clause or evaluation metric it satisfies), the current verified state, and an **acceptance criterion** you can actually test. Work the checklist in §10 order. Tick boxes as you go.

Legend: 🔴 blocks submission · 🟠 blocks a metric · 🟡 should fix · ⚪ post-submission

---

## Table of Contents

1. [Submission Blockers](#1-submission-blockers)
2. [Problem-Statement Compliance](#2-problem-statement-compliance)
3. [Evaluation-Metric Requirements](#3-evaluation-metric-requirements)
4. [Deck Requirements (page by page)](#4-deck-requirements-page-by-page)
5. [Code Requirements](#5-code-requirements)
6. [Evidence Requirements](#6-evidence-requirements)
7. [Security Requirements](#7-security-requirements)
8. [Real-World Deployment Requirements](#8-real-world-deployment-requirements)
9. [Consistency Requirements](#9-consistency-requirements)
10. [Prioritised Master Checklist](#10-prioritised-master-checklist)
11. [Definition of Done](#11-definition-of-done)

---

## 1. Submission Blockers

Hard blockers. Nothing else matters until these are closed.

| ID | Req | Priority | Status |
| :-- | :-- | :--: | :-- |
| **B-01** | **Team ID filled in** on the deck title page — currently blank | 🔴 | ☐ |
| **B-02** | **All three required sections have real prose**, not headings with screenshots under them. Q1/Q2/Q3 on page 2, methodology on page 3, feasibility on page 4, impact on page 5 | 🔴 | ☐ |
| **B-03** | **No false technical claim remains in the deck.** Six currently: blur, UI grounder, faces, no-raw-screenshots, MiniLM, TypeScript/Vite | 🔴 | ☐ |
| **B-04** | **Every cited arXiv ID / reference verified** against the source before it appears on a slide | 🔴 | ☐ |
| **B-05** | **Prior-art citations do not assert a false landscape.** Appendix A of `ARCHITECTURE.md` carries an explicit "verify before citing" warning — honour it | 🔴 | ☐ |

> **B-03 is the highest-risk blocker.** Six claims that a technical judge can falsify in one file-open each. See §4.2 for the exact replacement wording.

---

## 2. Problem-Statement Compliance

The PS makes six explicit demands. Map each to an implemented, demonstrable mechanism.

| # | PS clause (verbatim) | Mechanism required | Current | Acceptance criterion |
| :-- | :-- | :-- | :-- | :-- |
| **P-1** | *"a local Vision Transformer (ViT) or equivalent computer vision model 'reads' the user's screen and takes decision based on that"* | A CV model that actually runs on-device **and is fit for the task** | ⚠️ **partial** — ONNX Runtime Web genuinely runs, but the model is **COCO-80**, and `ui_grounding.js:410` maps `person→button`. `_mergeVisionWithDOM` (`:419`) then discards every vision box | Either (a) YOLO11n fine-tuned on a UI-element set, or (b) deck claims DOM grounding only. `ort.env.wasm.wasmPaths` **must** be set first or neither path initialises |
| **P-2** | *"sanitize the sensitive/PII data … before any network request is made"* | Redaction completes **before** `fetch`; it is a hard precondition | ✅ **met** — `content_script.js:282` redacts, `:316` builds, `:325` fetches | Prove by inspection: no `fetch`/`XHR`/`sendBeacon` exists outside `background.js:185` |
| **P-3** | *"blurring faces, blacking out passwords, and masking PII"* | Face + credential + PII redaction all functioning | ❌ **partially broken** — faces detected then discarded (`content_script.js:263`); large regions skipped (`redaction.js:56`); no OCR so static-text PII is missed | Every detected sensitive region is blacked out **and** labelled. No path where a box is created but not drawn |
| **P-4** | *"Only this anonymized, unidentifiable data should be transmitted"* | Payload structurally incapable of carrying a value | ✅ **met, and is the strongest asset** — `redaction.js:182-186` emits only `{id, type, label}` | `sensitive`, `pii_type`, `bbox`, `text`, `value` appear nowhere in the outbound object. Add a test asserting it |
| **P-5** | *"server … should be aware for this redaction scheme and can process data accordingly"* | Server prompt defines the `[REDACTED:*]` contract | ✅ **met** — `prompts.py:1-57` | Server returns valid actions against a redacted element list on the demo portal |
| **P-6** | *"Participants must balance the trade-offs between inference latency and the accuracy"* | Measured accuracy **and** measured latency, with the trade-off shown | ❌ **not met** — no accuracy number exists anywhere; latency exists but is unmeasurable on some paths | See §6. A metrics table with real figures for both axes |

**Additional PS clause — model choice:**

> *"Participants are free to use any **offline deployable (open-source/open-weights)** model on server side."*

| ID | Req | Priority | Status |
| :-- | :-- | :--: | :-- |
| **P-7** | Server-side reasoning model should be **open-weights and self-hostable** (Qwen2.5-VL, InternVL, etc.) with cloud as opt-in fallback | 🟠 | ☐ Currently Gemini-only (`vlm_client.py:6`). **The deck already claims Qwen2.5-VL — the deck is more compliant than the code** |

> ⚠️ Do **not** "fix" the deck to say Gemini. Fix the *code* to add a local open-weights path. Your deck is currently the more defensible of the two.

---

## 3. Evaluation-Metric Requirements

The five weighted criteria. For each, the requirement plus the specific number that proves it.

### Metric 1 — Accuracy of visual context (25%)

| ID | Requirement | Acceptance criterion |
| :-- | :-- | :-- |
| **M1-a** | DOM grounding returns pixel-accurate bounds | IoU ≥ 0.70 against `getBoundingClientRect` ground truth on 50 elements — trivial, it's the same source, so state it as *"exact by construction"* rather than implying a model |
| **M1-b** | Vision grounding contributes real signal | Measured F1 on a UI-element set. **Currently unmeasurable — the COCO model cannot do this task** |
| **M1-c** | Fused grounding beats either source alone | Report DOM-only vs vision-only vs fused on the same 50 elements |
| **M1-d** | Element recall is not silently capped | `.slice(0, 50)` at `content_script.js:213` truncates with **no signal to the model**. Either raise it, paginate it, or tell the model the list was truncated |
| **M1-e** | Target resolution is reliable | `target_id` validated against the request's own element ids; invalid ids trigger repair-retry, not a silent no-op (currently `prompts.py:36` *teaches* the wrong behaviour) |

### Metric 2 — Recall and precision for PII detection (20%)

| ID | Requirement | Acceptance criterion |
| :-- | :-- | :-- |
| **M2-a** | **Recall on rendered text** — not just form attributes | Currently ≈ 0. Requires a page-text scan (no OCR path exists) and a labelled test set |
| **M2-b** | Precision — no over-redaction of navigation and sign-in controls | The previous over-redaction bug proves this regressed once. Needs a regression test |
| **M2-c** | Checksum validation prevents false positives | Verhoeff / Luhn / mod-36 wired in and unit-tested against known-good and known-bad vectors |
| **M2-d** | Pattern ordering is correct | `sensitive_detector.js:22` tests Aadhaar **before** credit card, so a Visa renders as `[REDACTED:AADHAAR]`. Safe but misleading to the VLM |
| **M2-e** | Face detection contributes to recall | Currently the entire face path is a no-op. Fix before claiming |
| **M2-f** | Per-class precision/recall published | Table by class: password, OTP, CVV, card, Aadhaar, PAN, GSTIN, phone, email, face |

### Metric 3 — Precision of redaction (20%)

| ID | Requirement | Acceptance criterion |
| :-- | :-- | :-- |
| **M3-a** | Box and label **agree** | No region is labelled `[REDACTED:…]` while its pixels ship in the clear. `redaction.js:56` currently violates this |
| **M3-b** | Coordinate math is correct under DPR | Formula is sound (`naturalWidth / innerWidth`). Needs a test at DPR 1, 2, 3 and with a scrollbar present (`window.innerWidth` includes scrollbar width — use `clientWidth`) |
| **M3-c** | Large regions are handled, not skipped | Replace the `continue` with tiling |
| **M3-d** | Re-encoding doesn't leak | JPEG q=0.6 (`redaction.js:70`) chroma-subsamples around mask edges. Re-encode as PNG, or raise quality |
| **M3-e** | Extension's own UI is excluded | Your own sidebar currently ships unmasked every step |
| **M3-f** | Redaction is auditable by the user | Surface *"4 fields redacted: 1 password, 1 Aadhaar, 2 email"* in the popup. Makes the claim self-evidencing |
| **M3-g** | Server telemetry is truthful | `app.py:47` counts `sensitive`/`pii_type` fields the client structurally strips → **always prints `0`**. Client must send a count + hashed type list |

### Metric 4 — Client-side resource utilisation (20%)

| ID | Requirement | Acceptance criterion |
| :-- | :-- | :-- |
| **M4-a** | **A real measurement exists.** `content_script.js:378` and `popup.js:354` substitute the constant `"~14.5 MB"` | Replace with `usedJSHeapSize` delta measured **before and after inference**, reported as a delta |
| **M4-b** | Works on Firefox | `performance.memory` is Chromium-only. Use `performance.measureUserAgentSpecificMemory()` where available; report method in the UI |
| **M4-c** | Measures the agent, not the world | Current value is the whole content-script heap including the 10.9 MB model and 32 MB of wasm |
| **M4-d** | Model + runtime footprint is disclosed honestly | 10.9 MB ONNX + 33 MB `libs/`. State it. Do not claim 14.5 MB total when the payloads alone exceed it |
| **M4-e** | Inference is actually on-device | The `libs/*.wasm` binaries are likely never loaded (no `wasmPaths`). If they aren't, WebGPU/WASM claims are unverifiable — **fix and prove** |

### Metric 5 — End-to-end latency (15%)

| ID | Requirement | Acceptance criterion |
| :-- | :-- | :-- |
| **M5-a** | Five stages measured separately | Capture / perception / redaction / server / total — already instrumented at `content_script.js:244-375` |
| **M5-b** | Emitted on **every** exit path | Loop-guard termination `return`s at `:363` before telemetry is built at `:374` — currently **zero telemetry on that path** |
| **M5-c** | Server-internal time separated from network time | `app.py` measures `duration` but only `print`s it; it is not in the response. Return it |
| **M5-d** | Reported on a fixed machine, 3 page types | Add page type, DPR, and whether WebGPU or WASM was used |
| **M5-e** | Trade-off curve shown, not just two numbers | The PS asks to *balance* the trade-offs. Show accuracy vs latency as you tune the two-tier threshold |

---

## 4. Deck Requirements (page by page)

### 4.1 Page-by-page status

| Page | Required section | Status | Blockers |
| :-- | :-- | :-- | :-- |
| 1 | Title page | ⚠️ | Team ID blank; no one-line positioning |
| 2 | **Idea Title** — Q1 explanation, Q2 innovation, Q3 addresses-the-problem | ⚠️ | 3 false claims; Q2 contestable; Q3 covers 3 of 6 PS clauses |
| 3 | **Technical Approach** — methodology, technologies | ⚠️ | 4 claims not in the code (Qwen, MiniLM, TypeScript/Vite, ScreamJS) |
| 4 | **Feasibility & Viability** — feasibility, risks, mitigation | 🟡 | Good honest risk list, but **zero numbers** anywhere |
| 5 | **Impact & Benefits** — impact, benefits | 🟡 | Entirely generic; no differentiator, no figures |
| 6 | Research & references | ✅ | Verify arXiv IDs (B-04) |

### 4.2 False claims — exact replacement wording

Each row: current text → required text → what must be true first.

| # | Current claim | Replace with | Prerequisite |
| :-- | :-- | :-- | :-- |
| 1 | "Blur pixels + tag as `[REDACTED:PASSWORD]`" | "**Blackout** pixels + tag as `[REDACTED:PASSWORD]`" | none — code already correct |
| 2 | "Local AI model finds buttons, forms, links" | *"Option A (preferred):* 'Local YOLO11n fine-tuned on ScreenParse v2 finds buttons, forms, links' **Option B:*** 'DOM grounding extracts buttons, forms, links with pixel-accurate bounds'" | **A:** complete the fine-tune · **B:** delete the AI claim |
| 3 | "Passwords, **faces**, emails, PII found locally" / "No raw faces" | keep — but only after the face fix | 3-line fix, §5-C1 |
| 4 | "No raw screenshots" | keep — but only after the sidebar fix | 1-hour fix, §5-C5 |
| 5 | "VLM: Qwen2.5-VL-7B, Together.ai, HuggingFace" | **keep** — add the local open-weights path to the code (P-7) | server work, §5-C14 |
| 6 | "MiniLM-L6" | **delete the box entirely** — zero references in the repo | none |
| 7 | "TypeScript + Vite" | "**Chrome MV3 + ONNX Runtime Web** — no build step" | none |
| 8 | "ScreamJS" | **delete** — no such library, name appears garbled | none |
| 9 | "Existing redaction tools … redact and stop" | reframe as **two channels**: pixel destroyed / structural preserved | see §4.3 |

### 4.3 Q2 reframing (required — current version is contestable)

The current framing contrasts *passive* vs *acting* redaction. That fails: GUIGuard, CAPED and PrivAuto are all acting agents with redaction, and Anonymization-Enhanced already publishes type-preserving placeholders.

**Durable framing — two channels, one stable identity:**

| | Pixel channel | Structural channel |
| :-- | :-- | :-- |
| **Prior work** | destroyed | degraded or absent |
| **SentinelAgent** | **destroyed — irreversibly** | **preserved in full** |

> The agent receives `[REDACTED:PASSWORD]` with the element's `type` and `id` intact, cross-referenced to the blacked region by that same id. **It knows a credential field exists, acts on it, and never reads its value.**

Plus the three uncontested axes: **browser-native** (all prior art is phone-side) · **DOM ⊕ pixel fusion** · **Indian regulatory PII** (Aadhaar, PAN, GSTIN, IFSC, UPI-VPA — nobody else covers these).

### 4.4 Deck content still missing

| ID | Requirement | Priority |
| :-- | :-- | :--: |
| **D-01** | A metrics table on page 4 — the single biggest gap. Judges weigh 100% of the score on numbers and the deck has none | 🟠 |
| **D-02** | A limitations statement — no OCR, no shadow DOM, no cross-origin iframes, DOM-only for static text. Volunteering this reads as rigour | 🟠 |
| **D-03** | Indian PII named explicitly on page 2, not implied | 🟠 |
| **D-04** | A prior-art positioning table on page 2 | 🟡 |
| **D-05** | On the impact page: one concrete, non-generic differentiator instead of four audience segments | 🟡 |
| **D-06** | Latency/accuracy trade-off visual on page 4 | 🟠 |

---

## 5. Code Requirements

### 5.1 Phase 1 — make existing claims true (P0, ~1 day, ~15 lines)

| ID | Requirement | File:line | Closes |
| :-- | :-- | :-- | :-- |
| **C1** | Pass `redactedBoxes` into `redactPixels`; tag face boxes `sensitive: true` so they are actually drawn | `perception.js:81`, `content_script.js:263`, `redaction.js:53` | M3-a, M2-e, D-03 claim 3 |
| **C2** | Set `ort.env.wasm.wasmPaths` **before** `InferenceSession.create` | `ui_grounding.js:16-20` | M4-e, P-1 |
| **C3** | Delete the large-region `continue`; tile instead | `redaction.js:56` | M3-a, M3-c |
| **C4** | Replace `"~14.5 MB"` with a real before/after heap delta | `content_script.js:378`, `popup.js:354` | M4-a/b/c |
| **C5** | Hide the extension's own UI before `captureVisibleTab`; restore after | `background.js:137` | M3-e, claim 4 |
| **C6** | Propagate the `error` field so failures stop reporting as "Analysis complete" | `background.js:205`, `app.py:90-96`, `content_script.js:331` | demo reliability |
| **C7** | Remove invalid model IDs `gemini-3.5-flash-lite`, `gemini-3.5-flash` | `vlm_client.py:20-24` | demo reliability |
| **C8** | Server receives a redaction count + hashed type list; stop counting stripped fields | `app.py:47,63` | M3-g |

### 5.2 Phase 2 — make the PII guarantee real (P0, 3–5 days)

| ID | Requirement | Notes |
| :-- | :-- | :-- |
| **C9** | **Page-text scan** — `TreeWalker` over `body`, regex sweep, map matched span → bbox via `Range.getClientRects()`. Without this, recall on rendered PII stays ≈ 0 | M2-a |
| **C10** | Checksum validators behind a `validate()` interface: Verhoeff (Aadhaar), Luhn (card), mod-36 (GSTIN), PAN 4th-char entity whitelist | M2-c, P-3 |
| **C11** | Pattern registry as **data**, not code | maintainability |
| **C12** | Reorder patterns so Aadhaar does not swallow card numbers | M2-d |
| **C13** | Fix `+91 98765 43210` false negative (`\+91[\s-]?\d{10}` needs 10 consecutive digits) | M2-f |
| **C14** | Copy `value` through in `_normalizeDomInput`, or rely on C9's OCR path | `ui_grounding.js:91-98` |
| **C15** | Vendor BlazeFace weights locally; remove the `tfhub.dev` fetch | C1 prerequisite, privacy |
| **C16** | Re-encode redacted frame as **PNG** (JPEG q=0.6 chroma-subsamples at mask edges) | M3-d |

### 5.3 Phase 3 — make it reliable (P1, 3–4 days)

| ID | Requirement | Notes |
| :-- | :-- | :-- |
| **C17** | **Budget governor** — `maxSteps`, `maxWallMs`, `maxSpendUsd` | the "single-shot" guard at `content_script.js:644` is undone by `:237` |
| **C18** | Replace MutationObserver re-arm with an explicit FSM + VERIFY step | |
| **C19** | `parse_action(..., valid_ids)`; reject → repair prompt → **one** retry | M1-e |
| **C20** | Read or delete `pendingRerun` — currently written and never read, silently dropping user requests | `content_script.js:22` |
| **C21** | Cap `stepHistory` at 20, persist to `storage.session`, stop echoing the model's own `thought` back into the next prompt | |
| **C22** | Per-request Gemini client; remove module-global `genai.configure` | key cross-talk, `vlm_client.py:97` |
| **C23** | Emit telemetry on every exit path | M5-b |

### 5.4 Phase 4 — secure and compliant (P1, 3–4 days)

| ID | Requirement | Notes |
| :-- | :-- | :-- |
| **C24** | **Local open-weights VLM path** (Qwen2.5-VL) behind a router interface | P-7 |
| **C25** | Shared-secret auth + rate limit + body cap on `/act`; disable `/docs` in production | S-01 |
| **C26** | Make `SERVER_URL` configurable (storage or options page), not hardcoded | `background.js:4` |
| **C27** | **Approval gate** for `type` / submit / `navigate`, with a value preview the user can veto | S-02 |
| **C28** | `navigate` URL allow-list + scheme validation; no blind `https://` prefix | `action_executor.js:100`, `background.js:156` |
| **C29** | Remove `console.log` of payloads and typed values — a hostile page can read them | S-03 |
| **C30** | `if (window.__sentinelLoaded) return;` at the top of every injected file — re-injection is non-idempotent and throws `SyntaxError` | S-04 |
| **C31** | Fix `background.js:50-59` re-injection list to include `libs/*` | S-05 |

### 5.5 Dead code to delete

| Item | Location |
| :-- | :-- |
| `analyzeScreen_MOCK` + stale TODO | `content_script.js:36-44` |
| `pendingRerun`, `expectingMutation` | `content_script.js:22`, `:624` |
| `USE_REAL_SERVER` dead branch | `background.js:3, 207-218` |
| `TRIGGER_REANALYZE` — no sender exists | `background.js:231-238`, `content_script.js:435-444` |
| `STAGE_META`, `DEFAULT_META`, `sendButtonEl` | `popup.js:11-22, 29` |
| `perception/sample_data.js` — 0 references | extension bundle |
| `server/test_payload.json` — `PLACEHOLDER_BASE64_IMAGE_DATA` | unusable |
| `analyzeScreenSync`, `_extractFromLiveElement` (called, never defined), Canvas branch of `_loadImage` | perception |
| `gemini-3.5-flash*` | `vlm_client.py:20-24` |

---

## 6. Evidence Requirements

**This is the single largest gap in the project: there is currently no way to measure any of the five metrics.** Nothing in the repo can produce a number.

| ID | Requirement | Acceptance criterion |
| :-- | :-- | :-- |
| **E-01** | **Labelled PII test set.** Seed from `perceptionEngineer/sample/` — `passport.png` and `face1.png` are already real PII fixtures. Add `labels.json` with per-image ground-truth boxes and `pii_type` | ≥ 20 images covering all 10 classes, hand-labelled |
| **E-02** | **Detection harness** — precision, recall, F1 per class | Table published in the deck |
| **E-03** | **Pixel-redaction protocol** — IoU ≥ 0.30 against ground-truth boxes, the convention used in the WebPII line of work. No browser-based detector has published one | Recall + precision, published |
| **E-04** | **Masked-frame grounding experiment** — does blacking out ~30% of a frame degrade the VLM's grounding? This is the direct measure of the PS's "balance latency and accuracy" clause. Note the `GUI-Perturbed` finding that browser zoom alone causes significant grounding degradation — **also test at 125% / 150% zoom** | Accuracy at mask-ratio 0 / 15 / 30 / 45% |
| **E-05** | **Latency table** — 5 stages, fixed machine, 3 page types, DPR noted, WebGPU vs WASM noted | Reproducible numbers for the deck |
| **E-06** | **Memory delta** — before/after inference, Chrome **and** Firefox | Method stated in the UI and the deck |
| **E-07** | **M2-b regression test** — the over-redaction bug recurred once; sign-in and navigation controls must never be flagged | Test fails if a "Sign in" button is redacted |
| **E-08** | Sync or delete `perceptionEngineer/` — 4 of 5 files have diverged, and the extension copy **deleted** the better tiled face detector. Benchmarking the workbench measures code that doesn't ship | Single source of truth |

---

## 7. Security Requirements

| ID | Requirement | Priority | Current |
| :-- | :-- | :--: | :-- |
| **S-01** | Authenticated, rate-limited, body-capped `/act`; `/docs` disabled in production | 🔴 | Hardcoded public `ngrok-free.dev` URL, no auth, no rate limit, `/docs` open. URL is in the source, git history, **and the shipped `.xpi`** |
| **S-02** | Human approval before irreversible actions (`type`, submit, `navigate`) | 🔴 | Agent acts unilaterally. `redaction.js` deliberately hides what it typed, so the user can **neither see nor veto** it |
| **S-03** | No page-observable logging of payloads or typed values | 🔴 | `content_script.js:317` logs the full payload incl. base64 screenshot; `action_executor.js:90` logs the value being typed |
| **S-04** | Idempotent injection | 🟠 | Re-injection throws `SyntaxError`; creates duplicate MutationObserver and duplicate `onMessage` |
| **S-05** | Re-injection includes `libs/*` | 🟠 | Fallback path silently loses ONNX **and** BlazeFace |
| **S-06** | Remove unnecessary `web_accessible_resources` — the 10.9 MB model and 32 MB of wasm are exposed to `<all_urls>` for install-fingerprinting | 🟡 | `manifest.json:50-64` |
| **S-07** | Validate `event.origin` / `event.source` on the `postMessage` listener; drop the `"*"` target origin | 🟡 | `content_script.js:524-528`, `popup.js:78` |
| **S-08** | `history.pushState`/`replaceState` monkey-patch is guarded and restorable | 🟡 | Patched globally on every site, no idempotence guard, double-wrapped on re-injection |
| **S-09** | Encrypted or TTL'd chat history | 🟡 | Unbounded 60-item transcript in `storage.local` holding user prompts and model prose |
| **S-10** | Chrome `web_accessible_resources` does not expose the model/wasm | 🟡 | Same as S-06 |

---

## 8. Real-World Deployment Requirements

Beyond the evaluation criteria. These do not block SIH but they are what a technical judge asks when they ask *"would this actually work?"*

| ID | Requirement | Why |
| :-- | :-- | :-- |
| **D-01** | Onboarding + per-site consent screen | `<all_urls>` on every page with no opt-in fails Web Store review and destroys user trust |
| **D-02** | Firefox parity | `default_popup` set ⇒ `action.onClicked` never fires; `popup.html` not web-accessible ⇒ sidebar iframe blocked. `FIREFOX_SETUP.md` claims parity Firefox does not have |
| **D-03** | Model update mechanism | 10.9 MB model is baked in; a CV fix requires a full extension release |
| **D-04** | Cost model | 1 VLM call + full JPEG per step, per user. Unsustainable at scale; a loop bug burns quota invisibly |
| **D-05** | Unsupported-surface disclosure | Shadow DOM, cross-origin iframes, canvas/WebGL, native `<select>`, file pickers, date pickers, drag-drop |
| **D-06** | Synthetic keyboard events carry `key`/`code`/`beforeinput` | OTP fields, input masks, autocomplete widgets, CodeMirror/Monaco all silently fail |
| **D-07** | **Aadhaar masking is format-preserving by law** — UIDAI Reg. 21(mb) requires `xxxx-xxxx####`. Full blackout is *stricter* than required | Defensible, but **state that the choice exceeds the regulation** |
| **D-08** | Threat model states what redaction does *not* cover | It protects the transit path only. Local DOM still holds unmasked PII, and a `type` action can re-transmit it. DPDP Act 2023 / PCI-DSS |
| **D-09** | Test coverage + CI | Any refactor can silently regress the PII guarantee — which is the product |
| **D-10** | UI audit trail of what was redacted | Makes the privacy claim self-evidencing instead of asserted |

---

## 9. Consistency Requirements

Everything below must agree. Inconsistency between artifacts is the cheapest thing for a judge to catch.

| ID | Requirement |
| :-- | :-- |
| **C-01** | Deck tech stack ↔ `requirements.txt` ↔ actual imports (Qwen vs Gemini, MiniLM, TypeScript/Vite, ScreamJS) |
| **C-02** | README model matrix ↔ `vlm_client.py:20-24` — README claims `gemini-3.6-flash`, which appears nowhere in code |
| **C-03** | README multi-key claim ↔ `.env` reality — all three key vars hold one value, so rotation is a no-op |
| **C-04** | README biometric claim ↔ face path — README:73 and README:221 both assert face redaction that does not occur |
| **C-05** | `docs/contracts.md` ↔ actual action enum — missing `navigate`; id examples show `el_1` where reality is `el.id \|\| node_<i>` |
| **C-06** | Demo's "face photo" is an SVG circle, not a real face — BlazeFace would not fire on it even once C1 lands |
| **C-07** | `perceptionEngineer/` ↔ extension perception tree (see E-08) |

---

## 10. Prioritised Master Checklist

### Sprint 1 — Make the claims true (~1 day, ~15 lines)

Nothing here is new engineering. It closes the distance between what the deck says and what the code does.

- ☐ **C1** face boxes actually redacted
- ☐ **C2** `wasmPaths` set — proves the WebGPU claim
- ☐ **C3** large-region skip removed
- ☐ **C4** real heap delta replaces the constant
- ☐ **C5** own UI hidden before capture
- ☐ **C6** failures stop reporting as success
- ☐ **C7** invalid model IDs removed
- ☐ **C8** server redaction telemetry truthful
- ☐ **B-01** Team ID filled
- ☐ Deck §4.2 replacements 1, 6, 7, 8 applied (blur, MiniLM, TypeScript/Vite, ScreamJS)
- ☐ **B-04** arXiv IDs verified

**Unblocks:** 4 false claims → true, 2 more → deleted. Blocks the deck from being submitted with anything falsifiable in it.

### Sprint 2 — Make the PII guarantee real (~4 days)

- ☐ **C9** page-text scan with span→bbox mapping
- ☐ **C10** Verhoeff / Luhn / mod-36 / PAN-char4 validators
- ☐ **C11** pattern registry as data
- ☐ **C12** fix Aadhaar-before-card ordering
- ☐ **C13** fix `+91 98765 43210`
- ☐ **C15** vendor BlazeFace weights
- ☐ **C16** PNG re-encode
- ☐ **E-07** over-redaction regression test

**Unblocks:** M2-a — the difference between ≈0 and real recall. This is what makes the Indian-PII differentiator true rather than aspirational.

### Sprint 3 — Prove it (~3 days, runs parallel to 2)

- ☐ **E-01** labelled test set (seed from `perceptionEngineer/sample/`)
- ☐ **E-02** detection precision/recall per class
- ☐ **E-03** IoU ≥ 0.30 redaction protocol
- ☐ **E-04** masked-frame grounding experiment, incl. zoom levels
- ☐ **E-05** latency table
- ☐ **E-06** memory delta, both browsers
- ☐ **D-01** deck metrics table populated
- ☐ **D-06** trade-off visual

**Unblocks:** M1, M2, M3, M4, M5 — i.e. all five evaluation metrics, which are currently unevidenced.

### Sprint 4 — Make it reliable and secure (~5 days)

- ☐ **C17** budget governor
- ☐ **C18** FSM + VERIFY
- ☐ **C19** `target_id` validation + repair retry
- ☐ **C20** resolve `pendingRerun`
- ☐ **C23** telemetry on every exit path
- ☐ **C25** auth + rate limit
- ☐ **C26** configurable `SERVER_URL`
- ☐ **C27** approval gate
- ☐ **C28** URL allow-list
- ☐ **C29** remove payload/value logging
- ☐ **C30** idempotent injection
- ☐ **C31** include `libs/*` on re-injection

### Sprint 5 — Compliance and polish (~4 days)

- ☐ **C24** local open-weights VLM path (**P-7**)
- ☐ **E-08** sync or delete `perceptionEngineer/`
- ☐ **D-02** limitations statement in the deck
- ☐ **C-05..C-07** artifact consistency sweep
- ☐ Delete dead code (see §5.5)
- ☐ **D-07** Aadhaar format-preserving option + document the stricter choice
- ☐ **D-10** redaction audit trail in the UI

### Sprint 6 — Vision model (~1 day offline, independent)

- ☐ **P-1** fine-tune YOLO11n on ScreenParse v2 → export → replace `perception/models/yolo11n.onnx`
- ☐ Re-run **E-02** grounding F1
- ☐ **M1-d** raise or signal the 50-element cap

> Run this **early**. It is independent of everything else and it decides whether P-1 is satisfied or has to be softened on the deck. Starting it late is what forces the "Option B: DOM-only" fallback.

---

## 11. Definition of Done

The submission is ready when all of the following are true.

**Claims integrity**
- [ ] Every technical claim in the deck is true of the code as committed
- [ ] No claim depends on work that isn't merged
- [ ] All references verified against source
- [ ] All five `C-0x` consistency checks (§9) pass

**Problem-statement compliance**
- [ ] P-1 … P-6 demonstrable, and P-7 addressed
- [ ] Six-row PS-requirement table complete on page 2

**Evaluation metrics**
- [ ] M1-a … M1-e measured
- [ ] M2-a … M2-f measured and published
- [ ] M3-a … M3-g verified
- [ ] M4-a … M4-e measured, honestly, on both browsers
- [ ] M5-a … M5-e measured on a fixed machine
- [ ] **No metric is asserted without a number behind it**

**Reliability & safety**
- [ ] Loop terminates within budget on every demo page
- [ ] No failure path reports success
- [ ] `/act` is authenticated and rate-limited
- [ ] Approval gate works for `type` / submit / `navigate`
- [ ] No payload or typed value in page-observable logs

**Evidence**
- [ ] `eval/` harness runs end-to-end and regenerates the deck's numbers
- [ ] `tests/` fails if the over-redaction bug returns

**Honesty**
- [ ] Limitations stated on the slide
- [ ] Resource footprint disclosed without the "14.5 MB" constant
- [ ] Redaction coverage auditable by the user in the UI

---

**Cross-references**
- Diagrams, target design, traceable defects → [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Wire format → [`../sentinel-agent-extension/docs/contracts.md`](../sentinel-agent-extension/docs/contracts.md)
