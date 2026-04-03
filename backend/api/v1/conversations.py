from fastapi import APIRouter, HTTPException, Request

import db

router = APIRouter()


@router.get("/conversations")
async def list_conversations(request: Request):
    pool = request.app.state.db_pool
    return await db.list_conversations(pool)


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(request: Request, conversation_id: int):
    pool = request.app.state.db_pool
    return await db.get_conversation_messages(pool, conversation_id)


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(request: Request, conversation_id: int):
    pool = request.app.state.db_pool
    deleted = await db.delete_conversation(pool, conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Konversation nicht gefunden.")
    return {"ok": True}
