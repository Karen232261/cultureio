const cameraBtn = document.getElementById("camera-btn");
const galleryBtn = document.getElementById("gallery-btn");
const submitBtn = document.getElementById("submit-btn");

const cameraInput = document.getElementById("camera-input");
const galleryInput = document.getElementById("gallery-input");

const preview = document.getElementById("preview");

let selectedFile = null;
let userLocation = null;
let scanTimestamp = new Date().toISOString();

/* Timestamp */
document.getElementById("timestamp").textContent =
  "Timestamp: " + new Date().toLocaleString();

/* Location */
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

/* File selection */
cameraBtn.addEventListener("click", () => cameraInput.click());
galleryBtn.addEventListener("click", () => galleryInput.click());

cameraInput.addEventListener("change", handleFile);
galleryInput.addEventListener("change", handleFile);

function handleFile(event) {
  const file = event.target.files[0];
  if (!file || !file.type.startsWith("image/")) return;

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

/* Submit upload */
submitBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  const formData = new FormData();
  formData.append("photo", selectedFile);
  formData.append("timestamp", scanTimestamp);
  formData.append("location", JSON.stringify(userLocation));
  formData.append("contact", document.getElementById("contact").value);

  try {
    const res = await fetch("http://localhost:3000/upload", {
      method: "POST",
      body: formData
    });

    if (!res.ok) throw new Error("Upload failed");

    const data = await res.json();
    alert("Upload successful!");
    submitBtn.disabled = true;


    // fetch("/api/prompt")
    //   .then(r => r.json())
    //   .then(p => {
    //     document.getElementById("prompt-text").textContent = p.prompt;
    //   });

  } catch (err) {
    console.error(err);
    alert("Upload failed.");
  }
});
