from .pool import open_pool, close_pool, create_tables
from .documents import (
    document_exists_by_hash,
    list_documents,
    delete_document,
    count_documents,
    insert_document,
    insert_chunks,
)
from .search import search_chunks, search_chunks_hybrid
from .settings import save_app_settings, load_app_settings
from .conversations import (
    create_conversation,
    update_conversation_title,
    list_conversations,
    get_conversation_messages,
    save_message,
    delete_conversation,
)

__all__ = [
    "open_pool", "close_pool", "create_tables",
    "document_exists_by_hash", "list_documents", "delete_document",
    "count_documents", "insert_document", "insert_chunks",
    "search_chunks", "search_chunks_hybrid",
    "save_app_settings", "load_app_settings",
    "create_conversation", "update_conversation_title", "list_conversations",
    "get_conversation_messages", "save_message", "delete_conversation",
]
