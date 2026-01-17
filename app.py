import os
import uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
from werkzeug.utils import secure_filename


# Flask setup
app = Flask(__name__)
CORS(app)  # allow frontend JS to call backend

UPLOAD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


# Cloudflare R2 setup

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY = os.getenv("R2_ACCESS_KEY")
R2_SECRET_KEY = os.getenv("R2_SECRET_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")

r2 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    region_name="auto",
)


# helper
def allowed_file(filename):
    ext = os.path.splitext(filename)[1].lower()
    return ext in UPLOAD_EXTENSIONS

# routes

@app.route("/upload", methods=["POST"])
def upload():
    if "photo" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["photo"]

    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Unsupported file type"}), 400

    # make filename
    ext = os.path.splitext(file.filename)[1].lower()
    filename = f"{uuid.uuid4()}{ext}"

    try:
        r2.upload_fileobj(
            file,
            R2_BUCKET_NAME,
            filename,
            ExtraArgs={
                "ContentType": file.content_type
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    # placeholder: ML would run here later

    return jsonify({
        "status": "success",
        "filename": filename
    })


@app.route("/api/prompt")
def get_prompt():
    # Placeholder prompt logic (replace with ML later)
    return jsonify({
        "prompt": "Take a photo of something that represents connection."
    })



# run locally
if __name__ == "__main__":
    app.run(debug=True)


