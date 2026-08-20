import io
import os
import requests
import torch
from fastapi import FastAPI, Header, HTTPException
from PIL import Image
from pydantic import BaseModel
from transformers import CLIPModel, CLIPProcessor
from ultralytics import YOLO

app = FastAPI()
SHARED_SECRET = os.environ.get("CLASSIFIER_SECRET")

# Load models
yolo = YOLO("yolov8n-oiv7.pt")
clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").eval()
clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

# Direct Map: Leaf Label -> Scene Hierarchy Path
TAXONOMY = {
    "an office": ["an indoor scene", "an office"],
    "a school or classroom": ["an indoor scene", "a school or classroom"],
    "a kitchen": ["an indoor scene", "a home interior", "a kitchen"],
    "a living room": ["an indoor scene", "a home interior", "a living room"],
    "a bedroom": ["an indoor scene", "a home interior", "a bedroom"],
    "a bathroom": ["an indoor scene", "a home interior", "a bathroom"],
    "a restaurant or cafe": ["an indoor scene", "a restaurant or cafe"],
    "a store or shopping mall": ["an indoor scene", "a store or shopping mall"],
    "a gym or fitness center": ["an indoor scene", "a gym or fitness center"],
    "a museum or art gallery": ["an indoor scene", "a museum or art gallery"],
    "an airport or train station": ["an indoor scene", "an airport or train station"],
    "a hospital or clinic": ["an indoor scene", "a hospital or clinic"],
    "a library": ["an indoor scene", "a library"],
    "a theater or concert hall": ["an indoor scene", "a theater or concert hall"],
    "a hotel room": ["an indoor scene", "a hotel room"],
    "a lake or body of water": ["an outdoor scene", "a lake or body of water"],
    "a beach or ocean": ["an outdoor scene", "a beach or ocean"],
    "mountains": ["an outdoor scene", "mountains"],
    "a desert": ["an outdoor scene", "a desert"],
    "a forest or hiking trail": ["an outdoor scene", "a forest or hiking trail"],
    "a busy city street": ["an outdoor scene", "a busy city street"],
    "a grass plain or field": ["an outdoor scene", "a grass plain or field"],
    "a park or garden": ["an outdoor scene", "a park or garden"],
    "farmland or countryside": ["an outdoor scene", "farmland or countryside"],
    "a stadium or sports field": ["an outdoor scene", "a stadium or sports field"],
    "a street": ["an outdoor scene", "a street"],
    "a bridge": ["an outdoor scene", "a bridge"],
    "sky view": ["an outdoor scene", "sky view"],
    "a backyard or patio": ["an outdoor scene", "a backyard or patio"],
    "a snowy or winter scene": ["an outdoor scene", "a snowy or winter scene"],
    "a computer, television, or phone screen": ["an indoor scene", "a computer, television, or phone screen"]
}

# Pre-compute CLIP Text Embeddings at startup
LEAF_LABELS = list(TAXONOMY.keys())
_text_inputs = clip_processor(text=[f"a photo of {lbl}" for lbl in LEAF_LABELS], return_tensors="pt", padding=True)
with torch.no_grad():
    _text_features = clip_model.get_text_features(**_text_inputs)
    TEXT_EMBEDS = _text_features / _text_features.norm(dim=-1, keepdim=True)

# Detection sets & constants
GROUP_PHOTO_MIN_PEOPLE = 3
PERSON_LABEL = {"Person", "Human face", "Human head"}
PET_LABELS = {"Dog", "Cat", "Bird", "Rabbit", "Hamster", "Guinea pig"}
ARTWORK_LABELS = {"Painting", "Picture frame", "Poster", "Sculpture"}
MIN_SCENE_CONFIDENCE = 0.35  # below 0.35, drop the specific subcategory and keep only indoor/outdoor
NATURE_SUBCATEGORIES = {
    "a lake or body of water", "a beach or ocean", "mountains", "a desert",
    "a forest or hiking trail", "a grass plain or field", "a park or garden",
    "farmland or countryside", "a snowy winter scene",
}

 
class ClassifyRequest(BaseModel):
    imageUrl: str
 
 
def primary_category_from(objects, scene_path):
    detected_set = {o["label"] for o in objects}
    person_count = sum(1 for o in objects if o["label"] == PERSON_LABEL)
 
    if person_count >= GROUP_PHOTO_MIN_PEOPLE:
        return "group_photo"
    if detected_set & PET_LABELS:
        return "pet_photo"
    if detected_set & ARTWORK_LABELS:
        return "artwork_photo"
    if not scene_path:
        return "unclassified"
 
    top_level = scene_path[0]["label"]
    most_specific = scene_path[-1]["label"]
    if top_level == "an outdoor scene":
        return "nature_photo" if most_specific in NATURE_SUBCATEGORIES else "outdoor"
    return "indoor" if top_level == "an indoor scene" else "unclassified"
 
 
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
 
    result = yolo.predict(source=img, conf=0.50, verbose=False)[0]
    objects = [
        {"label": yolo.names[int(b.cls[0])], "confidence": round(float(b.conf[0]), 4)}
        for b in result.boxes
    ]
 
    img_inputs = clip_processor(images=img, return_tensors="pt")
    with torch.no_grad():
        img_feat = clip_model.get_image_features(**img_inputs)
        img_feat = img_feat / img_feat.norm(dim=-1, keepdim=True)
        similarities = (img_feat @ TEXT_EMBEDS.T)[0]
        best_idx = torch.argmax(similarities).item()
 
    best_label = LEAF_LABELS[best_idx]
    best_score = round(float(torch.softmax(similarities * 100, dim=-1)[best_idx]), 4)
 
    if best_score >= MIN_SCENE_CONFIDENCE:
        scene_path = [{"label": lvl, "confidence": best_score} for lvl in TAXONOMY[best_label]]
    else:
        # Not confident enough to trust the specific subcategory -- keep only
        # the broad indoor/outdoor call from the same top match.
        broad_label = TAXONOMY[best_label][0]
        scene_path = [{"label": broad_label, "confidence": best_score}]
 
    return {
        "objects": objects,
        "scene": {"path": scene_path},
        "primaryCategory": primary_category_from(objects, scene_path),
    }
 