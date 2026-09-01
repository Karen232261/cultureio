"""
Updated classifier_service.py: Includes ORB Signature extraction and identification
"""

import os
import io
import base64
import requests
import torch
import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from PIL import Image
from typing import List
from transformers import CLIPModel, CLIPProcessor
from ultralytics import YOLO

app = FastAPI()
SHARED_SECRET = os.environ.get("CLASSIFIER_SECRET")

yolo = YOLO("yolov8n-oiv7.pt")

clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").eval()
clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

SCENE_TAXONOMY = {
    "an indoor scene": {
        "an office": {},
        "a school or classroom": {},
        "a party or celebration": {},
        "a home interior": {
            "a kitchen": {},
            "a living room": {},
            "a bedroom": {},
            "a bathroom": {},
        },
        "a restaurant or cafe": {},
        "a store or shopping mall": {},
        "a gym or fitness center": {},
        "a museum or art gallery": {},
        "a place of worship": {},
        "an airport or train station": {},
        "a hospital or clinic": {},
        "a library": {},
        "a theater or concert hall": {},
        "a hotel room": {},
    },
    "an outdoor scene": {
        "a lake or body of water": {},
        "a beach or ocean": {},
        "mountains": {},
        "a desert": {},
        "a forest or hiking trail": {},
        "a busy city street": {},
        "a grass plain or field": {},
        "a park or garden": {},
        "farmland or countryside": {},
        "a stadium or sports field": {},
        "a parking lot": {},
        "a bridge": {},
        "a famous landmark or monument": {},
        "a backyard or patio": {},
        "a snowy winter scene": {},
    },
}


class ClassifyRequest(BaseModel):
    imageUrl: str


def clip_scores(img, candidates):
    prompts = [f"a photo of {c}" for c in candidates]
    inputs = clip_processor(text=prompts, images=img, return_tensors="pt", padding=True)
    with torch.no_grad():
        probs = clip_model(**inputs).logits_per_image.softmax(dim=1)[0]
    ranked = sorted(zip(candidates, probs.tolist()), key=lambda x: -x[1])
    return [{"label": c, "confidence": round(p, 4)} for c, p in ranked]


def classify_hierarchy(img, node):
    """
    Walks down SCENE_TAXONOMY as deep as it goes, scoring the current
    level's candidates each time and descending into whichever branch
    won. Works for any depth -- add more nested dicts and this needs
    no changes. Returns the path taken, broadest label first.
    """
    path = []
    while isinstance(node, dict) and node:
        scores = clip_scores(img, list(node.keys()))
        top = scores[0]
        path.append(top)
        node = node[top["label"]]
    return path


@app.post("/classify")
def classify(req: ClassifyRequest, x_classifier_secret: str = Header(default=None)):
    if SHARED_SECRET and x_classifier_secret != SHARED_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    img_response = requests.get(req.imageUrl, timeout=15)
    if not img_response.ok:
        raise HTTPException(
            status_code=502,
            detail=f"Could not download image (status {img_response.status_code}): {req.imageUrl[:100]}",
        )
    try:
        img = Image.open(io.BytesIO(img_response.content)).convert("RGB")
        img.thumbnail((800, 800))
    except Exception:
        raise HTTPException(status_code=422, detail="Downloaded file is not a valid image")

    # objects (YOLO / Open Images)
    result = yolo.predict(source=img, conf=0.25, verbose=False)[0]
    objects = [
        {"label": yolo.names[int(b.cls[0])], "confidence": round(float(b.conf[0]), 4)}
        for b in result.boxes
    ]

    # scene hierarchy (CLIP) -- walks as deep as SCENE_TAXONOMY goes
    scene_path = classify_hierarchy(img, SCENE_TAXONOMY)

    return {
        "objects": objects,
        "scene": {"path": scene_path},  # broadest label first, most specific last
    }




# Initialize ORB detector (500 features is typically optimal for speed and precision)
orb = cv2.ORB_create(nfeatures=500)
bf_matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)


class SignatureRequest(BaseModel):
    imageUrl: str

class StoredSignature(BaseModel):
    imageId: str
    descriptors: List[List[int]]

class MatchRequest(BaseModel):
    snapshotBase64: str  # Base64 encoded snapshot from webcam
    targetSignatures: List[StoredSignature]


def extract_orb_descriptors(img_pil: Image.Image) -> List[List[int]]:
    cv_img = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2GRAY)
    keypoints, descriptors = orb.detectAndCompute(cv_img, None)
    
    if descriptors is None:
        return []
    return descriptors.tolist()


@app.post("/generate-signature")
def generate_signature(req: SignatureRequest):
    img_response = requests.get(req.imageUrl, timeout=15)
    if not img_response.ok:
        raise HTTPException(status_code=502, detail="Could not download image")
    
    img = Image.open(io.BytesIO(img_response.content)).convert("RGB")
    descriptors = extract_orb_descriptors(img)
    
    return {
        "descriptors": descriptors,
        "keypointCount": len(descriptors)
    }


@app.post("/match-snapshot")
def match_snapshot(req: MatchRequest):
    # Decode webcam snapshot
    try:
        header, encoded = req.snapshotBase64.split(",", 1) if "," in req.snapshotBase64 else ("", req.snapshotBase64)
        img_data = base64.b64decode(encoded)
        snapshot_pil = Image.open(io.BytesIO(img_data)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image string")

    #  Extract features from snapshot frame
    query_des = extract_orb_descriptors(snapshot_pil)
    if not query_des or len(query_des) < 10:
        return {"matched": False, "reason": "Insufficient features in webcam snapshot"}

    query_des_np = np.array(query_des, dtype=np.uint8)

    best_match_id = None
    max_good_matches = 0
    threshold_good_matches = 15  # Minimum valid feature correspondences to confirm match

    # Compare snapshot against stored signatures using Lowe's ratio test
    for item in req.targetSignatures:
        if not item.descriptors:
            continue
        
        train_des_np = np.array(item.descriptors, dtype=np.uint8)
        
        # k-NN matching (k=2)
        matches = bf_matcher.knnMatch(query_des_np, train_des_np, k=2)
        
        # Lowe's ratio test to filter out glare/string noise
        good_matches = 0
        for match_pair in matches:
            if len(match_pair) == 2:
                m, n = match_pair
                if m.distance < 0.75 * n.distance:
                    good_matches += 1

        if good_matches > max_good_matches:
            max_good_matches = good_matches
            best_match_id = item.imageId

    if max_good_matches >= threshold_good_matches:
        return {
            "matched": True,
            "imageId": best_match_id,
            "score": max_good_matches
        }

    return {"matched": False, "reason": "No confident photo match found", "topScore": max_good_matches}