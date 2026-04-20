document.addEventListener("DOMContentLoaded", () => {
  const preloader = document.getElementById("page-preloader");
  if (!preloader) {
    document.body.classList.remove("preloading");
    return;
  }

  window.setTimeout(() => {
    preloader.classList.add("hidden");
    document.body.classList.remove("preloading");

    window.setTimeout(() => {
      preloader.remove();
    }, 500);
  }, 2000);
});
