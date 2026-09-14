import base64
import json
import logging
import os
from dotenv import load_dotenv
import google.generativeai as genai

# Load .env relative to this file's directory
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()
logger = logging.getLogger("sentinel.vlm")

# Track the last successfully working API key index
_current_key_index = 0

CANDIDATE_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.5-pro",
    "gemini-flash-latest",
    "gemini-pro-latest"
]


def get_api_keys() -> list:
    keys_str = os.getenv("GEMINI_API_KEYS") or ""
    keys = [k.strip() for k in keys_str.split(",") if k.strip()]
    single_key = os.getenv("GEMINI_API_KEY") or os.getenv("VLM_API_KEY")
    if single_key and single_key not in keys:
        keys.insert(0, single_key.strip())
    return keys


def call_vlm(system_prompt: str, task_goal: str, elements: list, screenshot_base64: str) -> str:
    """
    Calls the Gemini vision-language model with multi-key rotation and multi-model fallback.
    Automatically switches API keys and model tiers when quotas or rate limits are reached.
    """
    global _current_key_index
    try:
        keys = get_api_keys()
        if not keys:
            raise RuntimeError("No GEMINI_API_KEY configured in .env")

        # Clean base64 string if a data URI prefix was attached
        cleaned_b64 = screenshot_base64.strip()
        if "," in cleaned_b64:
            cleaned_b64 = cleaned_b64.split(",", 1)[1]
        cleaned_b64 = "".join(cleaned_b64.split())
        missing_padding = len(cleaned_b64) % 4
        if missing_padding:
            cleaned_b64 += "=" * (4 - missing_padding)

        image_bytes = base64.b64decode(cleaned_b64)

        user_content = (
            f"Task Goal: {task_goal}\n\n"
            f"Interactable Elements:\n{json.dumps(elements, indent=2)}\n\n"
            "Process the task goal against the screenshot and interactable elements according to your instructions, and respond with JSON only."
        )

        image_part = {
            "mime_type": "image/jpeg",
            "data": image_bytes
        }

        last_error = None
        num_keys = len(keys)

        # Iterate through keys starting from the last known good index
        for i in range(num_keys):
            idx = (_current_key_index + i) % num_keys
            key = keys[idx]
            masked_key = f"{key[:6]}...{key[-4:]}" if len(key) > 10 else "***"

            try:
                genai.configure(api_key=key)
            except Exception as e:
                logger.warning(f"[VLM] Failed to configure API key {masked_key}: {e}")
                continue

            # Iterate through model tiers
            for model_name in CANDIDATE_MODELS:
                try:
                    logger.info(f"[VLM] Invoking {model_name} with key {masked_key}...")
                    model = genai.GenerativeModel(
                        model_name=model_name,
                        system_instruction=system_prompt,
                        generation_config={"temperature": 0.0, "response_mime_type": "application/json"}
                    )
                    response = model.generate_content(
                        [image_part, user_content],
                        request_options={"timeout": 6.5}
                    )
                    if response and response.text:
                        _current_key_index = idx  # Remember active working key
                        return response.text
                except Exception as e:
                    last_error = e
                    err_msg = str(e).lower()
                    if "quota" in err_msg or "resourceexhausted" in err_msg or "429" in err_msg or "limit" in err_msg:
                        logger.warning(f"[VLM] Key {masked_key} quota/rate limit exhausted on {model_name}. Rotating to next API key/model...")
                        break  # Break model loop to switch key immediately
                    else:
                        logger.warning(f"[VLM] Model {model_name} failed with {masked_key}: {e}. Trying next candidate model...")
                        continue

        if last_error:
            raise last_error
        raise RuntimeError("Empty response received from Gemini VLM across candidate keys and models.")
    except Exception as exc:
        raise RuntimeError(f"VLM call failed: {str(exc)}") from exc
