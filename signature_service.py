# Run with: uvicorn signature_service:app --port 8002

import os
import io
import base64
from typing import List, Optional

import cv2
import numpy as np
import requests
from fastapi import FastAPI, HTTPException, Header
from PIL import Image
from pydantic import BaseModel

app = FastAPI()
SHARED_SECRET = os.environ.get("SIGNATURE_SECRET")  # set this in your PaaS env vars, same pattern as CLASSIFIER_SECRET

orb = cv2.ORB_create(nfeatures=500)
matcher = cv2.BFMatcher(cv2.NORM_HAMMING)

DESCRIPTOR_BYTES = 32  # ORB descriptors are always 32 bytes each
RATIO_TEST_THRESHOLD = 0.75  # Lowe's ratio test -- standard default


# image loading

def load_image_from_url(url: str) -> Image.Image:
    resp = requests.get(url, timeout=15)
    if not resp.ok:
        raise HTTPException(status_code=502, detail=f"Could not download image (status {resp.status_code})")
    try:
        return Image.open(io.BytesIO(resp.content)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=422, detail="Downloaded file is not a valid image")


def load_image_from_base64(b64: str) -> Image.Image:
    try:
        raw = base64.b64decode(b64.split(",")[-1])  # tolerates "data:image/jpeg;base64,...." prefixes
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid base64 image data")


# signature computation

def orb_descriptors(img: Image.Image) -> Optional[np.ndarray]:
    """Shared by /signature and /match so grayscale + ORB extraction isn't duplicated."""
    gray = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
    _, descriptors = orb.detectAndCompute(gray, None)
    return descriptors


def compute_signature(img: Image.Image) -> dict:
    descriptors = orb_descriptors(img)
    if descriptors is None:
        # e.g. a blank/low-texture image -- ORB found nothing to latch onto
        return {"orbDescriptors": None, "keypointCount": 0}
    return {
        "orbDescriptors": base64.b64encode(descriptors.tobytes()).decode("ascii"),
        "keypointCount": int(len(descriptors)),
    }


def decode_descriptors(b64_str: str) -> np.ndarray:
    return np.frombuffer(base64.b64decode(b64_str), dtype=np.uint8).reshape(-1, DESCRIPTOR_BYTES)


def good_match_count(query_desc: np.ndarray, candidate_desc: np.ndarray) -> int:
    """Ratio-test match count between two descriptor sets -- higher = more likely the same photo."""
    if query_desc is None or candidate_desc is None or len(query_desc) < 2 or len(candidate_desc) < 2:
        return 0
    knn = matcher.knnMatch(query_desc, candidate_desc, k=2)
    return sum(1 for m, n in knn if m.distance < RATIO_TEST_THRESHOLD * n.distance)


# request/response models
class SignatureRequest(BaseModel):
    imageUrl: str


class MatchCandidate(BaseModel):
    id: str
    orbDescriptors: Optional[str] = None


class MatchRequest(BaseModel):
    imageBase64: str
    candidates: List[MatchCandidate]
    minGoodMatches: int = 15  # tune this against real captures -- see note in server.js


def check_secret(x_signature_secret: Optional[str]):
    if SHARED_SECRET and x_signature_secret != SHARED_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


# routes

@app.post("/signature")
def signature(req: SignatureRequest, x_signature_secret: str = Header(default=None)):
    check_secret(x_signature_secret)
    return compute_signature(load_image_from_url(req.imageUrl))


@app.post("/match")
def match(req: MatchRequest, x_signature_secret: str = Header(default=None)):
    check_secret(x_signature_secret)

    query_desc = orb_descriptors(load_image_from_base64(req.imageBase64))
    if query_desc is None:
        return {"matchId": None, "score": 0, "reason": "no keypoints found in captured frame"}

    best_id, best_score = None, 0
    for candidate in req.candidates:
        if not candidate.orbDescriptors:
            continue
        score = good_match_count(query_desc, decode_descriptors(candidate.orbDescriptors))
        if score > best_score:
            best_id, best_score = candidate.id, score

    if best_score < req.minGoodMatches:
        return {"matchId": None, "score": best_score, "reason": "below confidence threshold"}

    return {"matchId": best_id, "score": best_score}