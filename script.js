const cameraBtn = document.getElementById("camera-btn");
const galleryBtn = document.getElementById("gallery-btn");
const submitBtn = document.getElementById("submit-btn");

const cameraInput = document.getElementById("camera-input");
const galleryInput = document.getElementById("gallery-input");

const preview = document.getElementById("preview");
const statusText = document.getElementById("status");

let selectedFile = null;


// button actions
cameraBtn.addEventListener("click", () => {
  cameraInput.click();
});

galleryBtn.addEventListener("click", () => {
  galleryInput.click();
});

//file handling
cameraInput.addEventListener("change", handleFile);
galleryInput.addEventListener("change", handleFile);

function handleFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Please select an image.");
    return;
  }

  selectedFile = file;
  submitBtn.disabled = false;

  preview.innerHTML = "";

  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);
  img.style.maxWidth = "100%";
  img.style.marginTop = "15px";
  img.onload = () => URL.revokeObjectURL(img.src);

  preview.appendChild(img);
}


// upload to backend
submitBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  const formData = new FormData();
  formData.append("photo", selectedFile);

  statusText.textContent = "Uploading...";

  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error("Upload failed");
    }

    statusText.textContent = "Upload successful!";
    submitBtn.disabled = true;
  } catch (error) {
    console.error(error);
    statusText.textContent = "Upload failed. Please try again.";
  }
});

// prompt loading
document.addEventListener("DOMContentLoaded", fetchPrompt);

function fetchPrompt() {
  fetch("/api/prompt")
    .then(response => {
      if (!response.ok) {
        throw new Error("Failed to fetch prompt");
      }
      return response.json();
    })
    .then(data => {
      document.getElementById("prompt-text").textContent = data.prompt;
    })
    .catch(error => {
      console.error(error);
      document.getElementById("prompt-text").textContent =
        "Unable to load prompt. Please try again.";
    });
}
