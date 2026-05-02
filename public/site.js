document.addEventListener("DOMContentLoaded", function () {
  var preloader = document.getElementById("page-preloader");

  if (!preloader) {
    document.body.classList.remove("preloading");
    return;
  }

  window.setTimeout(function () {
    preloader.classList.add("hidden");
    document.body.classList.remove("preloading");

    window.setTimeout(function () {
      if (preloader.parentNode) {
        preloader.parentNode.removeChild(preloader);
      }
    }, 500);
  }, 2000);
});
