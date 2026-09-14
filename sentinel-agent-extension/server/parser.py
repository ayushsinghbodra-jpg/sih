import json
import re
from typing import Any, Dict

FALLBACK_ACTION: Dict[str, Any] = {
    "thought": "No actionable operation decided.",
    "action": "none",
    "target_id": None,
    "value": None
}


def parse_action(raw_text: str) -> Dict[str, Any]:
    """
    Parses the raw text output from the VLM into a strict action dictionary.
    Guaranteed to never raise an exception and always return a valid action dict.
    """
    if not isinstance(raw_text, str) or not raw_text.strip():
        return FALLBACK_ACTION.copy()

    # Step 1: Attempt direct JSON parsing
    try:
        parsed = json.loads(raw_text.strip())
        if isinstance(parsed, dict) and "action" in parsed:
            return {
                "thought": str(parsed.get("thought", "")),
                "action": str(parsed.get("action", "none")),
                "target_id": parsed.get("target_id"),
                "value": parsed.get("value")
            }
    except Exception:
        pass

    # Step 2: Fallback regex search for JSON substring
    try:
        match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if match:
            extracted = match.group(0)
            parsed = json.loads(extracted)
            if isinstance(parsed, dict) and "action" in parsed:
                return {
                    "thought": str(parsed.get("thought", "")),
                    "action": str(parsed.get("action", "none")),
                    "target_id": parsed.get("target_id"),
                    "value": parsed.get("value")
                }
    except Exception:
        pass

    # Step 3: Safe fallback
    return FALLBACK_ACTION.copy()
