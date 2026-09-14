# JSON Contracts (Stage 0 Alignment)

## 1. Elements Shape (From A -> Extension DOM Parser)
```json
[
  {
    "id": "elem_1",
    "tag": "button",
    "text": "Submit",
    "role": "button",
    "attributes": {
      "type": "submit",
      "name": "login"
    },
    "bbox": {
      "x": 120,
      "y": 340,
      "width": 100,
      "height": 40
    }
  }
]
```

## 2. Payload Shape (From B -> Server `/act` Endpoint)
```json
{
  "task": "Click the login button and sign in",
  "step": 1,
  "screenshot": "data:image/png;base64,...",
  "elements": [ ... ],
  "history": [
    {
      "action": "navigate",
      "url": "https://example.com"
    }
  ]
}
```

## 3. Action Shape (Server Response -> Extension Runner)
```json
{
  "action": "click",
  "target_id": "elem_1",
  "coordinates": {
    "x": 170,
    "y": 360
  },
  "value": null,
  "thought": "Found the submit button, clicking to proceed",
  "done": false
}
```
