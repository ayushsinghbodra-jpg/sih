import base64
import json
import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()


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
    """
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

        candidate_models = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3.6-flash"]
        last_error = None

        image_part = {
            "mime_type": "image/jpeg",
            "data": image_bytes
        }

        # Multi-key + Multi-model fallback matrix
        for key in keys:
            try:
                genai.configure(api_key=key)
            except Exception as e:
                continue

            for model_name in candidate_models:
                try:
                    model = genai.GenerativeModel(
                        model_name=model_name,
                        system_instruction=system_prompt,
                        generation_config={"temperature": 0.0, "response_mime_type": "application/json"}
                    )
                    response = model.generate_content([image_part, user_content])
                    if response and response.text:
                        return response.text
                except Exception as e:
                    last_error = e
                    continue

        if last_error:
            raise last_error
        raise RuntimeError("Empty response received from Gemini VLM across candidate keys and models.")
    except Exception as exc:
        raise RuntimeError(f"VLM call failed: {str(exc)}") from exc
