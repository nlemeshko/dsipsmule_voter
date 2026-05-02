document.addEventListener("DOMContentLoaded", function () {
  var preloader = document.getElementById("page-preloader");
  var audioPlayers = document.querySelectorAll("audio[data-listen-url]");
  var index;

  if (!preloader) {
    document.body.classList.remove("preloading");
  } else {
    window.setTimeout(function () {
      preloader.classList.add("hidden");
      document.body.classList.remove("preloading");

      window.setTimeout(function () {
        if (preloader.parentNode) {
          preloader.parentNode.removeChild(preloader);
        }
      }, 500);
    }, 2000);
  }

  for (index = 0; index < audioPlayers.length; index += 1) {
    bindAudioListenTracking(audioPlayers[index]);
  }
});

function bindAudioListenTracking(player) {
  var listenUrl = player.getAttribute("data-listen-url");

  if (!listenUrl) {
    return;
  }

  player.addEventListener("play", function () {
    if (player.getAttribute("data-listen-sent") === "true") {
      return;
    }

    player.setAttribute("data-listen-sent", "true");
    sendListenEvent(listenUrl);
  });
}

function sendListenEvent(listenUrl) {
  var xhr;

  try {
    xhr = new XMLHttpRequest();
    xhr.open("POST", listenUrl, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send("{}");
  } catch (error) {
    if (window.console && console.error) {
      console.error("Failed to save listen", error);
    }
  }
}
