"""
Document Ingestion Service
Parses PDF/10-K/analyst memos and extracts investment thesis points.
Uses PyMuPDF for PDF text extraction, then Cerebras to identify thesis assumptions.
"""
import io
import json
from typing import Optional

from cerebras_config import CEREBRAS_API_KEY
from services.chunked_extraction_service import extract_thesis_chunked


async def extract_thesis_from_document(file_bytes: bytes, filename: str) -> dict:
    """
    Main entry point: takes raw file bytes, returns extracted thesis.
    Supports: PDF, TXT, JSON, DOCX
    """
    if not CEREBRAS_API_KEY:
        raise RuntimeError("CEREBRAS_API_KEY not set")

    text, page_map = await _extract_text(file_bytes, filename)

    if not text or len(text.strip()) < 100:
        raise ValueError("Could not extract meaningful text from document. File may be image-based or empty.")

    result = await extract_thesis_chunked(text, page_map)

    result["raw_text"] = text
    result["raw_text_length"] = len(text)
    return result


async def _extract_text(file_bytes: bytes, filename: str) -> tuple[str, dict]:
    """Extract raw text from various file types. Returns (text, page_map)."""
    filename_lower = filename.lower()

    if filename_lower.endswith(".pdf"):
        return _extract_pdf_text(file_bytes)
    elif filename_lower.endswith(".docx"):
        return _extract_docx_text(file_bytes)
    elif filename_lower.endswith(".txt"):
        return file_bytes.decode("utf-8", errors="ignore"), {}
    elif filename_lower.endswith(".json"):
        data = json.loads(file_bytes.decode("utf-8"))
        return json.dumps(data, indent=2), {}
    else:
        return file_bytes.decode("utf-8", errors="ignore"), {}


def _extract_pdf_text(file_bytes: bytes) -> tuple[str, dict]:
    """Extract text from PDF using PyMuPDF with per-page refs."""
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text_parts = []
        page_map: dict = {}
        for i, page in enumerate(doc):
            page_num = i + 1
            page_text = page.get_text()
            text_parts.append(f"--- Page {page_num} ---\n{page_text}")
            if page_text.strip():
                page_map[str(page_num)] = [page_num]
        doc.close()
        return "\n".join(text_parts), page_map

    except ImportError:
        raise RuntimeError("PyMuPDF not installed. Run: pip install pymupdf")
    except Exception as e:
        raise RuntimeError(f"PDF parsing failed: {e}")


def _extract_docx_text(file_bytes: bytes) -> tuple[str, dict]:
    """Extract text from DOCX with paragraph-level page_refs for audit trail."""
    try:
        from docx import Document

        doc = Document(io.BytesIO(file_bytes))
        text_parts: list[str] = []
        page_map: dict[str, list[int]] = {}
        para_num = 0
        for p in doc.paragraphs:
            if not p.text.strip():
                continue
            para_num += 1
            text_parts.append(f"--- Paragraph {para_num} ---\n{p.text}")
            page_map[str(para_num)] = [para_num]
        full_text = "\n".join(text_parts)
        return full_text, {"paragraphs": list(range(1, para_num + 1)), **page_map}
    except ImportError:
        raise RuntimeError("python-docx not installed. Run: pip install python-docx")
    except Exception as exc:
        raise RuntimeError(f"DOCX parsing failed: {exc}") from exc
