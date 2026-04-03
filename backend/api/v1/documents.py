from fastapi import APIRouter, HTTPException, Request

import db

router = APIRouter()


@router.get("/documents")
async def list_documents(request: Request):
    pool = request.app.state.db_pool
    return await db.list_documents(pool)


@router.delete("/documents/{document_id}")
async def delete_document(document_id: int, request: Request):
    pool = request.app.state.db_pool
    deleted = await db.delete_document(pool, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden.")
    return {"deleted": True}


@router.get("/status")
async def status(request: Request):
    pool = request.app.state.db_pool
    count = await db.count_documents(pool)
    return {"document_count": count}
