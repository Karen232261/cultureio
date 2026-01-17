from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from datetime import datetime
from boxsdk import JWTAuth, Client
import os
import random

# app setup
app = Flask(__name__)
CORS(app)  # allow frontend on a different domain

auth = JWTAuth.from_settings_file("box_config.json")
client = Client(auth)

BOX_FOLDER_ID = "361352241411"

# upload configuration
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "heic"}

def allowed_file(filename):
    return "." in filename and \
           filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

# example prompts (replace later with ML)
PROMPTS = [
    "Take a photo that represents home to you.",
    "Capture something that shows movement.",
    "Photograph an object that holds personal meaning.",
    "Take a picture of something easily overlooked.",
    "Capture a moment of contrast."
]

# routes

@app.route("/api/prompt", methods=["GET"])
def get_prompt():
    prompt = random.choice(PROMPTS)
    return jsonify({"prompt": prompt}), 200

@app.route("/upload", methods=["POST"])
def upload():
    if "photo" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["photo"]

    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Invalid file type"}), 400

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = secure_filename(file.filename)
    save_name = f"{timestamp}_{filename}"

    uploaded_file = client.folder(BOX_FOLDER_ID).upload_stream(
        file.stream,
        save_name
    )

    return jsonify({
        "status": "success",
        "box_file_id": uploaded_file.id
    }), 200
    
# run locally
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

