const input = document.getElementById("photo-input");

input.addEventListener("change", () => {
  const file = input.files[0];

  if (file) {
    console.log("Photo selected:", file);
    alert("Photo selected successfully!");
    // later: upload to server or process image
  }
});
