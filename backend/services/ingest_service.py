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
      "confidence": "HIGH"
    }
  ],
  "key_risks": ["Risk 1", "Risk 2"],
  "target_price": 220.00,
  "rating": "BUY"
}

Rules:
- Extract 3-6 specific, measurable thesis points only
- Each thesis point must have a numeric threshold if possible
- "metric" must be one of: Margins, Rates, Regulatory, Revenue, Growth, Macro
- Be precise and institutional in language
- If you cannot determine a value, use null"""


async def extract_thesis_from_document(file_bytes: bytes, filename: str) -> dict:
    """
    Main entry point: takes raw file bytes, returns extracted thesis.
    Supports: PDF, TXT, JSON
    """
    if not CEREBRAS_API_KEY:
        raise RuntimeError("CEREBRAS_API_KEY not set")

    # Extract text from document
    text = await _extract_text(file_bytes, filename)

    if not text or len(text.strip()) < 100:
        raise ValueError("Could not extract meaningful text from document. File may be image-based or empty.")

    # Truncate to avoid token limits — first 4000 chars is usually enough
    text_excerpt = text[:4000]

    # Call Cerebras to extract thesis
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

    # Ensure thesis_points have required fields
    for i, point in enumerate(result.get("thesis_points", [])):
        point.setdefault("id", i + 1)
        point.setdefault("status", "PENDING")
        point.setdefault("current_value", "Awaiting live data")

    return result


async def _extract_text(file_bytes: bytes, filename: str) -> str:
    """Extract raw text from various file types."""
    filename_lower = filename.lower()

    if filename_lower.endswith(".pdf"):
        return _extract_pdf_text(file_bytes)
    elif filename_lower.endswith(".txt"):
        return file_bytes.decode("utf-8", errors="ignore")
    elif filename_lower.endswith(".json"):
        data = json.loads(file_bytes.decode("utf-8"))
        return json.dumps(data, indent=2)
    else:
        # Try UTF-8 as fallback for docx/other text-like formats
        return file_bytes.decode("utf-8", errors="ignore")


def _extract_pdf_text(file_bytes: bytes) -> str:
    """Extract text from PDF using PyMuPDF."""
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text_parts = []
        for page in doc:
            text_parts.append(page.get_text())
        doc.close()
        return "\n".join(text_parts)

    except ImportError:
        raise RuntimeError("PyMuPDF not installed. Run: pip install pymupdf")
    except Exception as e:
        raise RuntimeError(f"PDF parsing failed: {e}")
