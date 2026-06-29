"""
/api/ingest — Document upload and thesis extraction
Accepts PDF, TXT, JSON files and returns extracted thesis points.
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from services.ingest_service import extract_thesis_from_document
from services.persistence_service import save_ingestion

router = APIRouter()


@router.post("/ingest")
async def ingest_document(file: UploadFile = File(...)):
    """
    Upload an institutional document (10-K, analyst memo, PDF).
    Returns extracted thesis points for the Thesis Tracker™.
    
    Max file size: 10MB
    Supported: .pdf, .txt, .json, .docx
    """
    MAX_SIZE = 10 * 1024 * 1024  # 10MB

    # Validate file type
    allowed_types = {".pdf", ".txt", ".json", ".docx"}
    import os
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {allowed_types}"
        )

    # Read file
    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Max 10MB.")

    try:
        result = await extract_thesis_from_document(contents, file.filename or "document")
        file_size_kb = round(len(contents) / 1024, 1)
        await save_ingestion(file.filename or "document", file_size_kb, result)
        return {
            "filename": file.filename,
            "file_size_kb": file_size_kb,
            "extraction": result,
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")
