from flask import Flask, jsonify
import random

app = Flask(__name__)

PROMPTS = [
    "Take a photo of something that represents resilience.",
    "Capture an example of contrast.",
    "Find something that symbolizes balance.",
    "Photograph a moment of calm.",
]

@app.route("/api/prompt")
def get_prompt():
    prompt = random.choice(PROMPTS)
    return jsonify({"prompt": prompt})

# Render needs this
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
