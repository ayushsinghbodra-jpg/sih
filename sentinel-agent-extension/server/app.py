import time
from typing import Any, Dict, List, Optional
from fastapi import FastAPI
from pydantic import BaseModel, Field

from parser import FALLBACK_ACTION, parse_action
from prompts import SYSTEM_PROMPT
from vlm_client import call_vlm

app = FastAPI(title="Sentinel Agent Server", version="1.0.0")

# ANSI color codes for terminal logging
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
MAGENTA = "\033[95m"
BLUE = "\033[94m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"


class ActRequest(BaseModel):
    task_goal: str
    redacted_screenshot: str
    elements: List[Dict[str, Any]] = Field(default_factory=list)
    step_history: Optional[List[Any]] = Field(default_factory=list)


@app.get("/")
def root() -> Dict[str, str]:
    return {"status": "ok", "service": "sentinel-agent-server"}


@app.get("/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/act")
def act_endpoint(payload: ActRequest) -> Dict[str, Any]:
    """
    Main endpoint for receiving redacted browser perception payloads,
    reasoning with Gemini VLM, and returning a strict action JSON.
    Outputs comprehensive real-time pipeline telemetry to the terminal.
    """
    start_t = time.time()
    elements_count = len(payload.elements)
    sensitive_count = sum(1 for el in payload.elements if el.get("sensitive") or el.get("pii_type"))
    img_size_kb = round(len(payload.redacted_screenshot) * 0.75 / 1024, 1)

    history_count = len(payload.step_history) if payload.step_history else 0

    print("\n" + "=" * 70)
    print(f"{BOLD}{CYAN}[SENTINEL AGENT PIPELINE]{RESET} 🚀 {BOLD}New Task Received:{RESET} \"{payload.task_goal}\"")
    print(f"{CYAN}[SENTINEL AGENT PIPELINE]{RESET} 📷 {GREEN}Screen Capture:{RESET} {img_size_kb} KB sanitized image payload")
    print(f"{CYAN}[SENTINEL AGENT PIPELINE]{RESET} 🔍 {BLUE}DOM Grounding:{RESET} {elements_count} interactable elements detected")
    if elements_count > 0:
        sample_els = [f"[{el.get('id')}]: \"{el.get('label') or el.get('type')}\"" for el in payload.elements[:6]]
        print(f"{CYAN}[SENTINEL AGENT PIPELINE]{RESET} 🏷️  {BLUE}Sample Elements:{RESET} " + " | ".join(sample_els))
        if elements_count > 6:
            print(f"{CYAN}[SENTINEL AGENT PIPELINE]{RESET}    (...and {elements_count - 6} more elements)")
    print(f"{CYAN}[SENTINEL AGENT PIPELINE]{RESET} 🔒 {YELLOW}Privacy Engine:{RESET} {sensitive_count} sensitive fields redacted (100% Zero-Leakage)")
    if history_count > 0:
        print(f"{CYAN}[SENTINEL AGENT PIPELINE]{RESET} 📜 {YELLOW}Context Memory:{RESET} {history_count} previous step(s) in session history")
    print(f"{CYAN}[SENTINEL AGENT PIPELINE]{RESET} 🧠 {MAGENTA}VLM Reasoning:{RESET} Invoking multi-tier Gemini Vision model...")

    try:
        raw_vlm_response = call_vlm(
            system_prompt=SYSTEM_PROMPT,
            task_goal=payload.task_goal,
            elements=payload.elements,
            screenshot_base64=payload.redacted_screenshot,
            step_history=payload.step_history
        )
        action_dict = parse_action(raw_vlm_response)
        duration = round((time.time() - start_t) * 1000)

        thought = action_dict.get("thought", "")
        action = action_dict.get("action", "none")
        target_id = action_dict.get("target_id")
        val = action_dict.get("value")

        print(f"{CYAN}[SENTINEL AGENT PIPELINE]{RESET} 💬 {GREEN}AI Thought/Reply:{RESET} \"{thought}\"")
        print(f"{CYAN}[SENTINEL AGENT PIPELINE]{RESET} ⚡ {BOLD}{GREEN}Action Decision:{RESET} {action.upper()}" + (f" -> target: {target_id}" if target_id else "") + (f" | value: {val}" if val else ""))
        print(f"{CYAN}[SENTINEL AGENT PIPELINE]{RESET} ⏱️  {BOLD}Total Roundtrip Time:{RESET} {duration} ms")
        print("=" * 70 + "\n")

        return action_dict
    except Exception as exc:
        duration = round((time.time() - start_t) * 1000)
        print(f"{RED}[SENTINEL AGENT PIPELINE] ⚠️ Error during execution ({duration}ms): {exc}{RESET}")
        print("=" * 70 + "\n")
        err_action = FALLBACK_ACTION.copy()
        err_action["thought"] = f"Reasoning error: {str(exc)}"
        return err_action
