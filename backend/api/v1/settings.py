from fastapi import APIRouter, Request
from pydantic import BaseModel

import db
import llm

router = APIRouter()


class SettingsRequest(BaseModel):
    provider: str
    config: dict  # { openai: {apiKey, model}, gemini: {...}, ... }


def _mask_settings(data: dict) -> dict:
    """Return settings with API keys replaced by a boolean 'apiKeySet'."""
    masked = {}
    for provider, cfg in data.get("config", {}).items():
        provider_masked = {k: v for k, v in cfg.items() if k != "apiKey"}
        provider_masked["apiKeySet"] = bool(cfg.get("apiKey"))
        masked[provider] = provider_masked
    return {
        "provider": data.get("provider", "openai"),
        "config": masked,
        "configured": _is_configured(data),
    }


def _is_configured(data: dict) -> bool:
    provider = data.get("provider", "")
    cfg = data.get("config", {}).get(provider, {})
    if provider in ("openai", "gemini", "claude"):
        return bool(cfg.get("apiKey"))
    if provider == "azure":
        return bool(
            cfg.get("apiKey") and cfg.get("endpoint") and cfg.get("deploymentName")
        )
    if provider == "ollama":
        return bool(cfg.get("baseUrl") and cfg.get("modelName"))
    return False


# Export for use in chat router
def is_configured(data: dict) -> bool:
    return _is_configured(data)


@router.get("/settings")
async def get_settings(request: Request):
    pool = request.app.state.db_pool
    data = await db.load_app_settings(pool)
    if not data:
        return {"provider": "openai", "config": {}, "configured": False}
    return _mask_settings(data)


@router.post("/settings")
async def save_settings(body: SettingsRequest, request: Request):
    pool = request.app.state.db_pool

    # Merge with existing: keep old API keys when new value is empty
    existing = await db.load_app_settings(pool) or {}
    existing_config = existing.get("config", {})

    merged_config = {}
    for provider, new_cfg in body.config.items():
        old_cfg = existing_config.get(provider, {})
        merged = {**old_cfg, **new_cfg}
        if not new_cfg.get("apiKey", "").strip():
            merged["apiKey"] = old_cfg.get("apiKey", "")
        merged_config[provider] = merged

    new_data = {"provider": body.provider, "config": merged_config}
    await db.save_app_settings(pool, new_data)

    active_cfg = merged_config.get(body.provider, {})
    return await llm.validate(body.provider, active_cfg)
