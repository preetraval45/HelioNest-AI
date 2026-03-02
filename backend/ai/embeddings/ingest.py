"""Knowledge Base Ingestion Script — embeds markdown docs into ChromaDB.

Run once (or after updating knowledge base docs):
    cd backend
    python -m ai.embeddings.ingest
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

# Add backend to path when running as script
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

KNOWLEDGE_BASE_DIR = Path(__file__).parent.parent / "knowledge_base"
CHROMA_PERSIST_DIR = Path(__file__).parent.parent / "chroma_db"
COLLECTION_NAME = "helionest_kb"
CHUNK_SIZE = 500        # characters per chunk
CHUNK_OVERLAP = 100     # overlap between adjacent chunks


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks, preferring paragraph boundaries."""
    paragraphs = re.split(r"\n{2,}", text.strip())
    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        if len(current) + len(para) < size:
            current = current + "\n\n" + para if current else para
        else:
            if current:
                chunks.append(current.strip())
            # Start new chunk with overlap from end of previous
            overlap_text = current[-overlap:] if len(current) > overlap else current
            current = overlap_text + "\n\n" + para if overlap_text else para

    if current:
        chunks.append(current.strip())

    return [c for c in chunks if len(c) > 50]


def strip_frontmatter(text: str) -> tuple[str, dict]:
    """Remove YAML frontmatter and return (content, metadata)."""
    meta: dict = {}
    if text.startswith("---"):
        end = text.find("---", 3)
        if end > 0:
            fm = text[3:end].strip()
            for line in fm.splitlines():
                if ":" in line:
                    key, _, val = line.partition(":")
                    meta[key.strip()] = val.strip().strip('"')
            text = text[end + 3:].strip()
    return text, meta


def ingest():
    """Ingest all markdown files from knowledge_base/ into ChromaDB."""
    try:
        import chromadb
        from chromadb.config import Settings
    except ImportError:
        print("ERROR: chromadb not installed. Run: pip install chromadb")
        sys.exit(1)

    CHROMA_PERSIST_DIR.mkdir(parents=True, exist_ok=True)

    client = chromadb.PersistentClient(
        path=str(CHROMA_PERSIST_DIR),
        settings=Settings(anonymized_telemetry=False),
    )

    # Delete existing collection to allow full re-ingest
    try:
        client.delete_collection(COLLECTION_NAME)
        print(f"Deleted existing collection '{COLLECTION_NAME}'")
    except Exception:
        pass

    collection = client.create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )

    md_files = list(KNOWLEDGE_BASE_DIR.glob("*.md"))
    if not md_files:
        print(f"No markdown files found in {KNOWLEDGE_BASE_DIR}")
        return

    all_docs: list[str] = []
    all_ids: list[str] = []
    all_metas: list[dict] = []

    for filepath in md_files:
        text = filepath.read_text(encoding="utf-8")
        content, meta = strip_frontmatter(text)
        chunks = chunk_text(content)

        source_name = filepath.stem
        print(f"  {filepath.name} → {len(chunks)} chunks")

        for i, chunk in enumerate(chunks):
            all_docs.append(chunk)
            all_ids.append(f"{source_name}__{i}")
            all_metas.append({
                "source": source_name,
                "title": meta.get("title", source_name),
                "category": meta.get("category", "general"),
                "chunk_index": i,
            })

    collection.add(documents=all_docs, ids=all_ids, metadatas=all_metas)
    print(f"\nIngested {len(all_docs)} chunks from {len(md_files)} documents into '{COLLECTION_NAME}'")
    print(f"ChromaDB stored at: {CHROMA_PERSIST_DIR}")


if __name__ == "__main__":
    print(f"Ingesting knowledge base from: {KNOWLEDGE_BASE_DIR}")
    ingest()
