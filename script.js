// script.js
document.addEventListener("DOMContentLoaded", () => {
  // Counter demo
  const countEl = document.getElementById("count");
  const inc = document.getElementById("inc");
  const dec = document.getElementById("dec");
  let value = 0;

  function render() { countEl.textContent = value; }
  inc?.addEventListener("click", () => { value++; render(); });
  dec?.addEventListener("click", () => { value--; render(); });
  render();

  // Theme toggle (persists in localStorage)
  const toggle = document.getElementById("theme-toggle");
  const root = document.documentElement;
  const KEY = "prefers-light";

  // Load saved preference
  if (localStorage.getItem(KEY) === "true") root.classList.add("light");

  toggle?.addEventListener("click", () => {
    root.classList.toggle("light");
    localStorage.setItem(KEY, root.classList.contains("light"));
  });
});

