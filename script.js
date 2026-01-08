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

//file handling
cameraInput.addEventListener("change", handleFile);
galleryInput.addEventListener("change", handleFile);

function handleFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  //making sure file is an image
  if (!file.type.startsWith("image/")) {
    alert("Please select an image.");
    return;
  }

  console.log("Selected image:", file);

  preview.innerHTML = "";

  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);
  img.style.maxWidth = "100%";
  img.style.marginTop = "15px";
  img.onload = () => URL.revokeObjectURL(img.src);

  preview.appendChild(img);
}
