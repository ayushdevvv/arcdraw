try {
  var savedTheme = localStorage.getItem("arcdraw:theme");
  document.documentElement.dataset.theme = savedTheme === "dark" ? "dark" : "light";
  document.documentElement.style.colorScheme = document.documentElement.dataset.theme;
} catch (error) { /* use the default theme */ }
window.EXCALIDRAW_ASSET_PATH = "/";
