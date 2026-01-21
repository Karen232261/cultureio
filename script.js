const cameraBtn = document.getElementById("camera-btn");
const galleryBtn = document.getElementById("gallery-btn");
const submitBtn = document.getElementById("submit-btn");

const cameraInput = document.getElementById("camera-input");
const galleryInput = document.getElementById("gallery-input");

const preview = document.getElementById("preview");

let selectedFile = null;
let userLocation = null;
let scanTimestamp = new Date().toISOString();

/* timestamp display */
document.getElementById("timestamp").textContent =
  "Timestamp: " + new Date().toLocaleString();

/* Location (permission-based) */
if ("geolocation" in navigator) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      };

      document.getElementById("location").textContent =
        `Location: ${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}`;
    },
    () => {
      document.getElementById("location").textContent =
        "Location: permission denied";
    }
  );
} else {
  document.getElementById("location").textContent =
    "Location: not supported";
}

cameraBtn.addEventListener("click", () => cameraInput.click());
galleryBtn.addEventListener("click", () => galleryInput.click());

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

/*submit upload*/
submitBtn.addEventListener("click", () => {
  if (!selectedFile) return;

  const formData = new FormData();
  formData.append("photo", selectedFile);
  formData.append("timestamp", scanTimestamp);
  formData.append("location", JSON.stringify(userLocation));
  formData.append(
    "contact",
    document.getElementById("contact").value
  );

  fetch("http://localhost:5000/upload", {
    method: "POST",
    body: formData
  })
    .then(res => res.json())
    .then(data => {
      alert("Upload successful!");
      submitBtn.disabled = true;
    })
    .catch(err => {
      console.error(err);
      alert("Upload failed.");
    });
});

/* get prompt */
document.addEventListener("DOMContentLoaded", () => {
  fetch("/api/prompt")
    .then(res => res.json())
    .then(data => {
      document.getElementById("prompt-text").textContent = data.prompt;
    })
    .catch(() => {
      document.getElementById("prompt-text").textContent =
        "Unable to load prompt.";
    });
});
