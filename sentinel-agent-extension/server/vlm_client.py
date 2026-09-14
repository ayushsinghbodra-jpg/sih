import base64
import json
import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY") or os.getenv("VLM_API_KEY")
if api_key:
    genai.configure(api_key=api_key)


def call_vlm(system_prompt: str, task_goal: str, elements: list, screenshot_base64: str) -> str:
    """
    Calls the Gemini vision-language model with the system prompt, task goal,
    interactable elements list, and base64-encoded screenshot.
    """
    try:
        current_api_key = os.getenv("GEMINI_API_KEY") or os.getenv("VLM_API_KEY")
        if not current_api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured in .env")

        genai.configure(api_key=current_api_key)

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
        raise RuntimeError("Empty response received from Gemini VLM across candidate models.")
    except Exception as exc:
        raise RuntimeError(f"VLM call failed: {str(exc)}") from exc
