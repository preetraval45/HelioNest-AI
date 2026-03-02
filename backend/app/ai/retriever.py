"""RAG Retriever — semantic search over the HelioNest knowledge base using ChromaDB.

Run `python -m ai.embeddings.ingest` once to populate the vector store.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING

from app.core.logging import get_logger

if TYPE_CHECKING:
    pass

logger = get_logger(__name__)

KNOWLEDGE_BASE_DIR = Path(__file__).parent.parent.parent / "ai" / "knowledge_base"
CHROMA_PERSIST_DIR = Path(__file__).parent.parent.parent / "ai" / "chroma_db"
COLLECTION_NAME = "helionest_kb"

TOP_K = 4   # number of chunks to retrieve per query


@lru_cache(maxsize=1)
def _get_collection():
    """Lazy-load the ChromaDB collection. Cached for the process lifetime."""
    try:
        import chromadb
        from chromadb.config import Settings

        client = chromadb.PersistentClient(
            path=str(CHROMA_PERSIST_DIR),
            settings=Settings(anonymized_telemetry=False),
        )
        return client.get_collection(COLLECTION_NAME)
    except Exception as exc:
        logger.warning("ChromaDB collection not available: %s — RAG retrieval disabled.", exc)
        return None


async def retrieve_context(query: str, top_k: int = TOP_K) -> str:
    """Retrieve relevant knowledge base chunks for a query.

    Returns a formatted string ready to insert into an AI prompt,
    or an empty string if the knowledge base is not yet ingested.
    """
    collection = _get_collection()
    if collection is None:
        return ""

    try:
        results = collection.query(
            query_texts=[query],
            n_results=top_k,
            include=["documents", "metadatas"],
        )
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]

        if not docs:
            return ""

        chunks: list[str] = []
        for doc, meta in zip(docs, metas):
            source = meta.get("source", "unknown")
            chunks.append(f"[Source: {source}]\n{doc}")

        return "\n\n---\n\n".join(chunks)

    except Exception as exc:
        logger.warning("RAG retrieval error: %s", exc)
        return ""
