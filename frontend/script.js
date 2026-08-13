const galleryBtn = document.getElementById("gallery-btn");
const submitBtn = document.getElementById("submit-btn");
const restartBtn = document.getElementById("restart-btn");
const galleryInput = document.getElementById("gallery-input");
const mainContent = document.getElementById("main-content");
const thankYouContent = document.getElementById("thank-you-content");
const preview = document.getElementById("preview");
<<<<<<< HEAD
const postUploadFields = document.getElementById("post-upload-fields");
=======
const postUploadFields = document.getElementById("post-upload-fields");
// Added for an uploading progress bar after hitting submit
const submitFill = document.getElementById("submit-fill");
const submitLabel = document.getElementById("submit-label");
>>>>>>> b6e19e8 (added upload progress bar after submission, removed the Next Steps section in index html)

// Window.location.pathname will give you "/test1"
// .substring(1) removes the slash, leaving just "test1"
const referralID = window.location.pathname.substring(1) || "direct-access";
console.log("Current NFC Tag Source:", referralID);

let selectedFile = null;
let userLocation = null;
let scanTimestamp = new Date().toISOString();

document.getElementById("timestamp").textContent = "Timestamp: " + new Date().toLocaleString();

// Location logic
if ("geolocation" in navigator) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      document.getElementById("location").textContent = `Location: ${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}`;
    },
    () => { document.getElementById("location").textContent = "Location: permission denied"; }
  );
}

galleryBtn.addEventListener("click", () => galleryInput.click());

galleryInput.addEventListener("change", handleFile);

function handleFile(event) {
  const file = event.target.files[0];
  if (!file || !file.type.startsWith("image/")) return;
  selectedFile = file;
  submitBtn.disabled = false;
  postUploadFields.style.display = "flex";
  preview.innerHTML = "";
  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);
  img.style.maxWidth = "100%";
  img.style.marginTop = "15px";
  img.style.borderRadius = "8px";
  preview.appendChild(img);
  postUploadFields.scrollIntoView({ behavior: 'smooth' });
}

submitBtn.addEventListener("click", async () => {
    const contactValue = document.getElementById("contact").value.trim();
    
    if (!contactValue) {
      alert("Please provide contact information before submitting.");
      return;
    }

  if (!selectedFile) return;
  submitBtn.disabled = true;
<<<<<<< HEAD
  submitBtn.textContent = "Uploading...";
  
  try {
    const extension = selectedFile.name.split('.').pop();
    const uniqueImageId = `img_${Date.now()}`; 
=======

  try {
    const extension = selectedFile.name.split('.').pop();
    const uniqueImageId = `img_${Date.now()}-${crypto.randomUUID()}`;
>>>>>>> b6e19e8 (added upload progress bar after submission, removed the Next Steps section in index html)
    const fileName = `${uniqueImageId}.${extension}`;

    const urlResponse = await fetch("/api/get-upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        contentType: selectedFile.type, 
        fileName: fileName // Send the specific filename to the server
      })
    });

    const { uploadUrl, publicUrl } = await urlResponse.json();

<<<<<<< HEAD
    const s3Response = await fetch(uploadUrl, {
      method: "PUT",
      body: selectedFile,
      headers: { "Content-Type": selectedFile.type }
    });

    if (!s3Response.ok) throw new Error("S3 Upload Failed");
=======
    await uploadWithProgress(uploadUrl, selectedFile);
>>>>>>> b6e19e8 (added upload progress bar after submission, removed the Next Steps section in index html)

    const saveResponse = await fetch("/api/save-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referralID: referralID,
        imageId: uniqueImageId,
        s3Url: publicUrl,        // Keep this for now for "Hybrid" support
        timestamp: scanTimestamp,
        location: userLocation,
        contact: document.getElementById("contact").value,
        caption: document.getElementById("caption").value
      })
    });
 
    const result = await saveResponse.json();
    if (!result.success) throw new Error("Database save failed");
    // NEW LOGIC: Use the local object URL we already created for the first preview
    const finalPreviewImg = document.getElementById("submitted-img-preview");
    const existingPreview = preview.querySelector("img");
    
    if (existingPreview) {
        finalPreviewImg.src = existingPreview.src;
    }
    
    mainContent.style.display = "none";
    thankYouContent.style.display = "flex";
    window.scrollTo(0, 0);

  } catch (err) {
    console.error(err);
    alert("Upload failed. Please try again.");
    submitBtn.disabled = false;
<<<<<<< HEAD
    submitBtn.textContent = "Submit";
  }
});

=======
    submitLabel.textContent = "Submit";
    submitFill.style.width = "0%";
  }
});

function uploadWithProgress(url, file) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        submitFill.style.width = pct + "%";
        submitLabel.textContent = `Uploading... ${pct}%`;
      }
    };

    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
      ? resolve()
      : reject(new Error("S3 Upload Failed"));
    xhr.onerror = () => reject(new Error("S3 Upload Failed"));

    xhr.send(file);
  });
}

>>>>>>> b6e19e8 (added upload progress bar after submission, removed the Next Steps section in index html)
restartBtn.addEventListener("click", () => { location.reload(); });