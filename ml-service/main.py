"""
AI-Powered Grievance Management ML Service
FastAPI backend for NLP and ML features using OpenAI/Anthropic APIs
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from services.hybrid_classifier import HybridClassifier
from services.duplicate_detector import DuplicateDetector
from services.sla_predictor import SLAPredictor
from services.ai_info_extractor import AIInformationExtractor

app = FastAPI(
    title="DDGRS AI Service",
    description="Hybrid AI-powered grievance classification (DistilBERT + GPT-4/Claude)",
    version="2.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize AI services
# Classifier mode: "distilbert" (FREE), "openai", "anthropic", or "auto"
CLASSIFIER_MODE = os.getenv("CLASSIFIER_MODE", "auto")
AI_PROVIDER = os.getenv("AI_PROVIDER", "openai")

classifier = HybridClassifier(mode=CLASSIFIER_MODE)
duplicate_detector = DuplicateDetector()
sla_predictor = SLAPredictor()
info_extractor = AIInformationExtractor(provider=AI_PROVIDER)


# Request/Response Models
class ClassificationRequest(BaseModel):
    text: str
    threshold: float = 0.7


class ClassificationResponse(BaseModel):
    department: str
    confidence: float
    all_predictions: dict


class DuplicateCheckRequest(BaseModel):
    text: str
    recent_complaints: List[dict]
    time_window_hours: int = 72


class DuplicateCheckResponse(BaseModel):
    is_duplicate: bool
    similar_complaint: Optional[dict]
    similarity_score: float


class SLAPredictionRequest(BaseModel):
    department: str
    category: str
    description: str
    priority: str = "medium"


class SLAPredictionResponse(BaseModel):
    estimated_hours: float
    estimated_days: float
    confidence: float


class InfoExtractionRequest(BaseModel):
    text: str


class InfoExtractionResponse(BaseModel):
    missing_fields: List[str]
    extracted_info: dict
    follow_up_questions: List[str]
    completeness_score: float = 0.5


# Health check
@app.get("/")
async def root():
    classifier_info = classifier.get_info()
    return {
        "service": "DDGRS AI Service",
        "status": "running",
        "version": "2.0.0",
        "classifier": classifier_info,
        "features": [
            "Hybrid Classification (DistilBERT/GPT-4/Claude)",
            "Duplicate Detection",
            "SLA Prediction",
            "Smart Information Extraction"
        ]
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "models_loaded": {
            "classifier": classifier.is_loaded(),
            "duplicate_detector": duplicate_detector.is_loaded(),
            "sla_predictor": sla_predictor.is_loaded(),
            "info_extractor": info_extractor.is_loaded()
        }
    }


# Classification endpoint
@app.post("/classify", response_model=ClassificationResponse)
async def classify_grievance(request: ClassificationRequest):
    """
    Classify grievance text into department using DistilBERT
    """
    try:
        result = classifier.predict(request.text, request.threshold)
        return ClassificationResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Duplicate detection endpoint
@app.post("/check-duplicate", response_model=DuplicateCheckResponse)
async def check_duplicate(request: DuplicateCheckRequest):
    """
    Check if grievance is duplicate using sentence embeddings
    """
    try:
        result = duplicate_detector.check_duplicate(
            request.text,
            request.recent_complaints,
            request.time_window_hours
        )
        return DuplicateCheckResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# SLA prediction endpoint
@app.post("/predict-sla", response_model=SLAPredictionResponse)
async def predict_sla(request: SLAPredictionRequest):
    """
    Predict resolution time using ML model
    """
    try:
        result = sla_predictor.predict(
            request.department,
            request.category,
            request.description,
            request.priority
        )
        return SLAPredictionResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Information extraction endpoint
@app.post("/extract-info", response_model=InfoExtractionResponse)
async def extract_information(request: InfoExtractionRequest):
    """
    Extract information and identify missing fields
    """
    try:
        result = info_extractor.extract(request.text)
        return InfoExtractionResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
