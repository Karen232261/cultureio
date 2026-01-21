import os
import uuid
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import boto3
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

UPLOAD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")

r2 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name="auto",
)

def allowed_file(filename):
    return os.path.splitext(filename)[1].lower() in UPLOAD_EXTENSIONS

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/upload", methods=["POST"])
def upload():
    file = request.files.get("photo")
    if not file or not allowed_file(file.filename):
        return jsonify({"error": "Invalid file"}), 400

    filename = f"{uuid.uuid4()}{os.path.splitext(file.filename)[1].lower()}"

    # NEW metadata
    timestamp = request.form.get("timestamp")
    location = request.form.get("location")
    contact = request.form.get("contact")

    r2.upload_fileobj(
        file,
        R2_BUCKET_NAME,
        filename,
        ExtraArgs={"ContentType": file.content_type}
    )

    # temp logging
    print("Timestamp:", timestamp)
    print("Location:", location)
    print("Contact:", contact)

    return jsonify({"status": "success", "filename": filename})

@app.route("/api/prompt")
def get_prompt():
    return jsonify({
        "prompt": "Take a photo of something that represents connection."
    })

if __name__ == "__main__":
    app.run(debug=True)
