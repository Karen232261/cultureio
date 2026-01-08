const cameraBtn = document.getElementById("camera-btn");
const galleryBtn = document.getElementById("gallery-btn");

const cameraInput = document.getElementById("camera-input");
const galleryInput = document.getElementById("gallery-input");

const preview = document.getElementById("preview");

// button clicks

cameraBtn.addEventListener("click", () => {
  cameraInput.click(); // opens camera
});

galleryBtn.addEventListener("click", () => {
  galleryInput.click(); // opens gallery / files
});

// getting image file
cameraInput.addEventListener("change", handleFile);
galleryInput.addEventListener("change", handleFile);

function handleFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  // make sure file selected is an image
  if (!file.type.startsWith("image/")) {
    alert("Please select an image.");
    return;
  }

  console.log("Selected image:", file);

  // show preview
  preview.innerHTML = "";

  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);
  img.style.maxWidth = "100%";
  img.style.marginTop = "15px";
  img.onload = () => URL.revokeObjectURL(img.src);

  preview.appendChild(img);

  document.addEventListener("DOMContentLoaded", () => {
    fetchPrompt();
  });

  function fetchPrompt() {
    fetch("/api/prompt")
      .then(response => {
        if (!response.ok) {
          throw new Error("Failed to fetch prompt");
        }
        return response.json();
      })
      .then(data => {
        const promptElement = document.getElementById("prompt-text");
        promptElement.textContent = data.prompt;
      })
      .catch(error => {
        console.error(error);
        document.getElementById("prompt-text").textContent =
          "Unable to load prompt. Please try again.";
      });
  }

}



