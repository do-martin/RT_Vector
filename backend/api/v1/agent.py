import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import agent as agent_runner
import db
from api.v1.settings import is_configured

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class AgentRequest(BaseModel):
    question: str
    history: list[ChatMessage] = []
    top_k: int = 5
    num_queries: int = 3
    conversation_id: int | None = None


@router.post("/agent")
async def run_agent(request: Request, body: AgentRequest):
    pool = request.app.state.db_pool

    settings = await db.load_app_settings(pool)
    if not settings or not is_configured(settings):
        raise HTTPException(status_code=400, detail="Kein Provider konfiguriert.")

    provider = settings["provider"]
    config = settings.get("config", {}).get(provider, {})
    history = [{"role": m.role, "content": m.content} for m in body.history]

    # Create or reuse conversation
    if body.conversation_id:
        conv_id = body.conversation_id
    else:
        conv_id = await db.create_conversation(pool)

    def _sse(data: dict) -> str:
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    async def generate():
        # Emit conversation ID so the client can track it
        yield _sse({"type": "conversation_id", "conversation_id": conv_id})

        collected_tokens: list[str] = []
        collected_sources: list[dict] = []
        collected_pipeline: list[dict] = []

        async for event in agent_runner.run(
            question=body.question,
            history=history,
            pool=pool,
            provider=provider,
            config=config,
            top_k=body.top_k,
            num_queries=body.num_queries,
        ):
            yield event
            # Collect data for persistence without blocking the stream
            if event.startswith("data: "):
                try:
                    data = json.loads(event[6:])
                    t = data.get("type")
                    if t == "token":
                        collected_tokens.append(data.get("token", ""))
                    elif t == "sources":
                        collected_sources = data.get("sources", [])
                    elif t == "status":
                        collected_pipeline.append({
                            "stage": data.get("stage"),
                            "message": data.get("message"),
                        })
                    elif t == "queries":
                        collected_pipeline.append({
                            "stage": "queries",
                            "message": f"{len(data.get('queries', []))} Suchanfragen",
                            "queries": data.get("queries", []),
                        })
                except Exception:
                    pass

        # Persist messages after streaming completes
        full_response = "".join(collected_tokens)
        if full_response:
            await db.save_message(pool, conv_id, "user", body.question)
            await db.save_message(
                pool, conv_id, "assistant", full_response,
                sources=collected_sources,
                pipeline=collected_pipeline,
            )
            await db.update_conversation_title(pool, conv_id, body.question)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
