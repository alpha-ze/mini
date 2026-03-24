"""
AI-Powered Information Extraction using Google Gemini
"""

import os
import json
import re
from typing import Dict
import google.generativeai as genai


class AIInformationExtractor:
    
    def __init__(self, provider: str = "gemini"):
        self.model_loaded = False
        try:
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("GEMINI_API_KEY not set")
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel("gemini-2.0-flash")
            self.fallback_model = genai.GenerativeModel("gemini-2.0-flash-lite")
            self.model_loaded = True
            print("✅ Gemini info extractor ready (gemini-2.0-flash + 1.5-flash-8b fallback)")
        except Exception as e:
            print(f"⚠️ Gemini init failed: {e} — using regex fallback")

    def is_loaded(self) -> bool:
        return self.model_loaded

    def extract(self, text: str) -> Dict:
        if self.model_loaded:
            try:
                return self._extract_with_gemini(text)
            except Exception as e:
                print(f"⚠️ Gemini extraction failed: {e}")
        return self._basic_extraction(text)

    def _extract_with_gemini(self, text: str) -> Dict:
        prompt = f"""You are analyzing a grievance/complaint submitted via WhatsApp at a university.

Complaint: "{text}"

Identify what key information is MISSING that would help resolve this complaint faster.
Think about: location (room/building/area), time of occurrence, specific device or item affected, contact details, urgency level, previous attempts to resolve.

Respond with ONLY valid JSON, no markdown:
{{
  "extracted_info": {{
    "location": "extracted or null",
    "urgency": "high/medium/low",
    "category": "brief category",
    "details": "key details found"
  }},
  "missing_fields": ["field1", "field2"],
  "follow_up_questions": ["Question 1?", "Question 2?"],
  "completeness_score": 0.0
}}

Rules:
- follow_up_questions: max 3, short and specific, only ask what's truly missing
- completeness_score: 0.0 (very incomplete) to 1.0 (fully detailed)
- If the complaint is already detailed enough, return empty arrays and score >= 0.8"""

        # Try primary model, fall back to lighter model on quota errors
        for model in [self.model, getattr(self, 'fallback_model', None)]:
            if model is None:
                break
            try:
                response = model.generate_content(prompt)
                raw = response.text.strip()
                raw = re.sub(r'^```(?:json)?\s*', '', raw)
                raw = re.sub(r'\s*```$', '', raw)
                result = json.loads(raw)
                return {
                    "missing_fields": result.get("missing_fields", []),
                    "extracted_info": result.get("extracted_info", {}),
                    "follow_up_questions": result.get("follow_up_questions", []),
                    "completeness_score": float(result.get("completeness_score", 0.5))
                }
            except Exception as e:
                if '429' in str(e) or 'quota' in str(e).lower() or 'RESOURCE_EXHAUSTED' in str(e):
                    print(f"⚠️ Quota hit on {model.model_name}, trying fallback...")
                    continue
                raise e
        raise Exception("All Gemini models exhausted")

    def _basic_extraction(self, text: str) -> Dict:
        missing = []
        extracted = {}

        if re.search(r'room\s*\d+|block\s*[A-Z]|floor\s*\d+|hostel|lab\s*\d+', text, re.IGNORECASE):
            extracted['location'] = re.search(r'room\s*\d+|block\s*[A-Z]|floor\s*\d+|hostel|lab\s*\d+', text, re.IGNORECASE).group(0)
        else:
            missing.append('location')

        if any(w in text.lower() for w in ['urgent', 'emergency', 'immediately', 'asap']):
            extracted['urgency'] = 'high'
        else:
            missing.append('urgency')

        questions = []
        if 'location' in missing:
            questions.append("Where exactly is this issue located? (e.g. room number, building, area)")
        if 'urgency' in missing:
            questions.append("How urgent is this? Is it affecting your daily activities?")

        score = 1.0 - (len(missing) * 0.3)
        return {
            "missing_fields": missing,
            "extracted_info": extracted,
            "follow_up_questions": questions,
            "completeness_score": max(0.1, min(1.0, score))
        }
