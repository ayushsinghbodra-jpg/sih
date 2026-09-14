from typing import Any, Dict, List, Optional
from fastapi import FastAPI
from pydantic import BaseModel, Field

from parser import FALLBACK_ACTION, parse_action
from prompts import SYSTEM_PROMPT
from vlm_client import call_vlm

app = FastAPI(title="Sentinel Agent Server", version="1.0.0")


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
    """
    try:
        raw_vlm_response = call_vlm(
            system_prompt=SYSTEM_PROMPT,
            task_goal=payload.task_goal,
            elements=payload.elements,
            screenshot_base64=payload.redacted_screenshot
        )
        action_dict = parse_action(raw_vlm_response)
        return action_dict
    except Exception as exc:
        # Fallback gracefully with HTTP 200 to protect live pipeline demo
        print(f"[Warning] /act execution encountered error: {exc}")
        return FALLBACK_ACTION.copy()
