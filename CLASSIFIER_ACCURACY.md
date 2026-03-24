# Grievance Classifier Accuracy Report

**Model:** DistilBERT (zero-shot, no fine-tuning)  
**Test Date:** March 24, 2026  
**Test Size:** 10 samples  
**Overall Accuracy: 8/10 = 80%**

---

## Test Results

| # | Grievance Text | Expected | Predicted | Confidence | Result |
|---|---|---|---|---|---|
| 1 | My wifi is not working in the hostel room | IT / Network | Hostel | 85% | ❌ |
| 2 | The exam hall was too noisy during the test | Examination | Academic | 85% | ❌ |
| 3 | The library books are outdated and not available | Library | Library | 85% | ✅ |
| 4 | There is a water leakage in the corridor ceiling | Infrastructure | Infrastructure | 75% | ✅ |
| 5 | My attendance is marked wrong by the professor | Academic | Academic | 85% | ✅ |
| 6 | The hostel mess food quality is very poor | Hostel | Hostel | 95% | ✅ |
| 7 | My fee receipt was not issued by the accounts office | Administration | Administration | 95% | ✅ |
| 8 | The projector in classroom 301 is broken | Infrastructure | Infrastructure | 85% | ✅ |
| 9 | I cannot access the student portal login | IT / Network | IT / Network | 85% | ✅ |
| 10 | The professor did not return my assignment marks | Academic | Academic | 95% | ✅ |

---

## Summary

| Metric | Value |
|---|---|
| Total Tests | 10 |
| Correct | 8 |
| Incorrect | 2 |
| Accuracy | 80% |
| Avg Confidence (correct) | 86% |
| Avg Confidence (incorrect) | 85% |

---

## Failure Analysis

### Test 1 — IT / Network misclassified as Hostel
- Input: *"My wifi is not working in the hostel room"*
- The word **"hostel"** dominated the classification, overshadowing the actual issue (wifi/network)
- Fix: Add more IT/Network training examples that mention hostel context

### Test 2 — Examination misclassified as Academic
- Input: *"The exam hall was too noisy during the test"*
- "Exam hall" and "test" are semantically close to Academic in the model's embedding space
- Examination is a narrow sub-category of Academic, making it a hard boundary for zero-shot models
- Fix: Fine-tune with labeled examples distinguishing Examination vs Academic

---

## Why 80% is Acceptable

- This is a **zero-shot model** — it was never trained on university grievance data
- The bot shows the detected category to the user and allows them to **manually correct** it before submission, so misclassifications don't reach the database unchecked
- High-confidence correct predictions (95%) on clear-cut categories like Hostel, Administration, and Academic show the model works well for unambiguous complaints

---

## How to Improve Accuracy

| Approach | Expected Improvement | Effort |
|---|---|---|
| Fine-tune DistilBERT on labeled grievance data | +10–15% | High |
| Add more training examples for edge cases | +5–8% | Medium |
| Use GPT-4 / Claude for classification | +15–20% | Low (API cost) |
| Combine keyword rules with ML | +5–10% | Low |
