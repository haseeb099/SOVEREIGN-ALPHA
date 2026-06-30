"""
Document Ingestion Service
Parses PDF/10-K/analyst memos and extracts investment thesis points.
Uses PyMuPDF for PDF text extraction, then Cerebras to identify thesis assumptions.
"""
import json
import io
from typing import Optional
from cerebras.cloud.sdk import Cerebras
from cerebras_config import CEREBRAS_API_KEY, CEREBRAS_MODEL

EXTRACTION_PROMPT = """You are a senior investment analyst AI. You have been given raw text from an institutional investment document (10-K filing, analyst memo, research note, or earnings call transcript).

Your job is to extract the core INVESTMENT THESIS ASSUMPTIONS — the specific, measurable claims the document makes about why this asset should perform well.

Return a JSON object with this exact structure:
{
  "ticker_guess": "TSLA",
  "document_type": "Analyst Memo",
  "thesis_points": [
    {
      "id": 1,
      "text": "Operating margins will remain above 18% by FY2025",
      "metric": "Margins",
      "threshold": "18%",
      "timeframe": "FY2025",
      "confidence": "HIGH",
      "page_refs": [3, 4]
    }
  ],
  "key_risks": ["Risk 1", "Risk 2"],
  "target_price": 220.00,
  "rating": "BUY",
  "page_refs": {"summary": [1], "risks": [12]}
}

Rules:
- Extract 3-6 specific, measurable thesis points only
- Each thesis point must have a numeric threshold if possible
- Include page_refs (1-indexed page numbers) where evidence was found
- "metric" must be one of: Margins, Rates, Regulatory, Revenue, Growth, Macro
- Be precise and institutional in language
- If you cannot determine a value, use null"""


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

    text_excerpt = text[:4000]

    client = Cerebras(api_key=CEREBRAS_API_KEY)

    response = client.chat.completions.create(
        model=CEREBRAS_MODEL,
        messages=[
            {"role": "system", "content": EXTRACTION_PROMPT},
            {"role": "user", "content": f"Extract investment thesis from this document:\n\n{text_excerpt}"},
        ],
        response_format={"type": "json_object"},
        max_tokens=1200,
        temperature=0.2,
    )

    result = json.loads(response.choices[0].message.content)

    if page_map and "page_refs" not in result:
        result["page_refs"] = page_map

    for i, point in enumerate(result.get("thesis_points", [])):
        point.setdefault("id", i + 1)
        point.setdefault("status", "PENDING")
        point.setdefault("current_value", "Awaiting live data")
        if "page_refs" not in point and page_map:
            point.setdefault("page_refs", page_map.get(str(i + 1), []))

    for key in ("target_price", "ticker_guess", "rating", "document_type"):
        if result.get(key) is None:
            result.pop(key, None)

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
