// --- GLITTER EFFECT ---
export function rainGlitter(count = 50) {
  const overlay = document.getElementById("glitterOverlay");
  if (!overlay) return;
  overlay.innerHTML = "";

  const emojis = ["🐭", "✨", "☁️", "🌠"];

  for (let i = 0; i < count; i++) {
    const drop = document.createElement("div");
    drop.className = "glitter";
    drop.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    drop.style.left = `${Math.random() * 100}vw`;
    drop.style.animationDelay = `${Math.random()}s`;
    drop.style.fontSize = "0.85rem";
    overlay.appendChild(drop);
  }

  setTimeout(() => {
    overlay.innerHTML = "";
  }, 2000);
}

// --- TOAST ---
export function showToast(message, duration = 5000) {
  let toast = document.createElement("div");
  toast.className = "toast-message";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("hide");
  }, duration);

  toast.addEventListener("transitionend", () => {
    toast.remove();
  });

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  // Trigger fade in
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });
}
