# SentinelAgent JSON & Message Contracts

---

## 1. Elements Shape (From Person A -> Perception DOM Parser)
```json
[
  {
    "id": "el_1",
    "type": "button",
    "label": "Sign In"
  },
  {
    "id": "el_2",
    "type": "input",
    "label": "[REDACTED:PASSWORD]"
  },
  {
    "id": "el_3",
    "type": "input",
    "label": "[REDACTED:EMAIL]"
  }
]
```

---

## 2. Server Request Payload (From Person B -> Server `POST /act`)
```json
{
  "task_goal": "log in and continue",
  "redacted_screenshot": "<base64 JPEG without prefix>",
  "elements": [
    {"id": "el_1", "type": "button", "label": "Sign In"},
    {"id": "el_2", "type": "input", "label": "[REDACTED:PASSWORD]"},
    {"id": "el_3", "type": "input", "label": "[REDACTED:EMAIL]"}
  ],
  "step_history": []
}
```

---

## 3. Server Response Action (Server -> Person B Action Runner)
```json
{
  "action": "click",
  "target_id": "el_1",
  "value": null
}
```
*Valid `action` values:* `"click"`, `"type"`, `"scroll"`, `"none"`  
*`value`:* `string` (for `"type"`) or `null` (for `"click"` / `"scroll"` / `"none"`).

---

## 4. Extension UI Pipeline Events (Person B Background -> Popup UI)
Sent via `chrome.runtime.sendMessage({ stage: "<stage>", detail: "<text>" })`:

| Stage Key | Icon | Description | Example Detail |
| :--- | :---: | :--- | :--- |
| `captured` | 📷 | Tab screenshot taken | `"Captured screen"` |
| `detected` | 🔍 | Interactive DOM elements detected | `"Found 8 elements"` |
| `redacted` | 🔒 | Sensitive data masked on-device (Highlighted Orange) | `"password, email, face"` |
| `sent` | 📡 | Sanitized payload dispatched to server | `"Dispatched payload to /act"` |
| `server` | 🧠 | VLM reasoning action received | `"Action: click Sign In"` |
| `executed` | ✅ | Action executed in active tab (Highlighted Green) | `"Action completed successfully"` |
| `error` | ⚠️ | Server or execution error | `"VLM request timeout"` |

---

## 5. Popup Task Trigger (Popup UI -> Person B Background)
Sent when the user enters a prompt and submits the composer:
```json
{
  "type": "START_TASK",
  "task_goal": "log into my account and navigate to dashboard"
}
```
*(Open integration item: Pending final listener sign-off from Person B in `background.js`)*
