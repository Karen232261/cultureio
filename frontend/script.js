const cameraBtn = document.getElementById("camera-btn");
const galleryBtn = document.getElementById("gallery-btn");
const submitBtn = document.getElementById("submit-btn");
const restartBtn = document.getElementById("restart-btn");

const cameraInput = document.getElementById("camera-input");
const galleryInput = document.getElementById("gallery-input");

const mainContent = document.getElementById("main-content");
const thankYouContent = document.getElementById("thank-you-content");
const preview = document.getElementById("preview");

// The container for Contact and Caption that starts hidden
const postUploadFields = document.getElementById("post-upload-fields");

let selectedFile = null;
let userLocation = null;
let scanTimestamp = new Date().toISOString();


// Set the visual timestamp for the UI
document.getElementById("timestamp").textContent =
  "Timestamp: " + new Date().toLocaleString();

// Request Geolocation on load
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
  if (!file || !file.type.startsWith("image/")) return;

  selectedFile = file;
  submitBtn.disabled = false;

  // Show the hidden fields
  postUploadFields.style.display = "flex";

  // Clear previous and show new preview
  preview.innerHTML = "";
  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);
  img.style.maxWidth = "100%";
  img.style.marginTop = "15px";
  img.onload = () => URL.revokeObjectURL(img.src);
  preview.appendChild(img);
  
  // Smooth scroll to the new fields so the user sees them
  postUploadFields.scrollIntoView({ behavior: 'smooth' });
}


submitBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  // Update UI to show progress
  submitBtn.disabled = true;
  submitBtn.textContent = "Uploading...";

  const formData = new FormData();
  formData.append("photo", selectedFile);
  formData.append("timestamp", scanTimestamp);
  formData.append("location", JSON.stringify(userLocation));
  formData.append("contact", document.getElementById("contact").value);
  formData.append("caption", document.getElementById("caption").value);

  try {
    const res = await fetch("http://localhost:3000/upload", {
      method: "POST",
      body: formData
    });

    if (!res.ok) throw new Error("Upload failed");

    // Hide the form and show the Thank You page
    mainContent.style.display = "none";
    thankYouContent.style.display = "flex";
    
    // Ensure the user starts at the top of the new content
    window.scrollTo(0, 0);

  } catch (err) {
    console.error(err);
    alert("Upload failed. Please try again.");
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit";
  }
});


// Refresh the page to reset all fields and states for a new submission
restartBtn.addEventListener("click", () => {
  location.reload();
});