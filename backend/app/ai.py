"""Optional AI-written interpretation of the numbers (needs an Anthropic API key pasted in Settings)."""
from __future__ import annotations

import json

import httpx

API_URL = "https://api.anthropic.com/v1/messages"

SYSTEM = (
    "You are a remote-sensing analyst helping a student explain the output of a classical image-processing "
    "pipeline (colour clustering, thresholds, morphology). Be precise and honest: the percentages are estimates "
    "from colour and texture, not verified ground truth. Write plain English, no markdown headers, 150-220 words, "
    "in 2 short paragraphs: (1) what the numbers suggest about the area, (2) the main limitations and what to check next."
)


def call_claude(api_key: str, model: str, prompt: str, system: str = SYSTEM, max_tokens: int = 600) -> str:
    r = httpx.post(
        API_URL,
        headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": model, "max_tokens": max_tokens, "system": system, "messages": [{"role": "user", "content": prompt}]},
        timeout=60,
    )
    if r.status_code == 401:
        raise RuntimeError("Anthropic rejected the API key (401). Re-paste it in Settings.")
    if r.status_code == 404:
        raise RuntimeError(f"Model '{model}' was not found for this key. Change the model name in Settings.")
    if r.status_code >= 400:
        try:
            msg = r.json().get("error", {}).get("message", r.text[:200])
        except Exception:
            msg = r.text[:200]
        raise RuntimeError(f"Anthropic API error {r.status_code}: {msg}")
    data = r.json()
    return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()


def insight(summary: dict, api_key: str, model: str) -> str:
    prompt = "Analysis summary (JSON):\n" + json.dumps(summary, indent=2)[:6000]
    return call_claude(api_key, model, prompt)
