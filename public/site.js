document.addEventListener("DOMContentLoaded", function () {
  var preloader = document.getElementById("page-preloader");
  var audioPlayers = document.querySelectorAll("audio.audio-player");
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
    enhanceAudioPlayer(audioPlayers[index]);
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

function enhanceAudioPlayer(player) {
  var shell;
  var playButton;
  var progress;
  var currentTime;
  var durationTime;
  var muteButton;
  var volume;

  if (player.getAttribute("data-enhanced") === "true") {
    return;
  }

  player.setAttribute("data-enhanced", "true");
  player.controls = false;
  player.classList.add("audio-player-native");

  shell = document.createElement("div");
  shell.className = "audio-shell";
  shell.innerHTML = [
    '<button class="audio-control audio-control-play" type="button" aria-label="Воспроизвести">',
    '<span class="audio-icon-play"></span>',
    "</button>",
    '<div class="audio-timeline">',
    '<span class="audio-time audio-time-current">00:00</span>',
    '<input class="audio-range audio-progress" type="range" min="0" max="100" step="0.1" value="0" aria-label="Перемотка" />',
    '<span class="audio-time audio-time-duration">00:00</span>',
    "</div>",
    '<div class="audio-volume-group">',
    '<button class="audio-control audio-control-mute" type="button" aria-label="Выключить звук">',
    '<span class="audio-icon-volume"></span>',
    "</button>",
    '<input class="audio-range audio-volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Громкость" />',
    "</div>",
    '<button class="audio-control audio-control-skip" type="button" aria-label="Перемотать на 10 секунд вперед">10</button>',
  ].join("");

  player.insertAdjacentElement("afterend", shell);

  playButton = shell.querySelector(".audio-control-play");
  progress = shell.querySelector(".audio-progress");
  currentTime = shell.querySelector(".audio-time-current");
  durationTime = shell.querySelector(".audio-time-duration");
  muteButton = shell.querySelector(".audio-control-mute");
  volume = shell.querySelector(".audio-volume");

  volume.value = String(player.volume);
  syncRangeFill(progress);
  syncRangeFill(volume);

  playButton.addEventListener("click", function () {
    if (player.paused) {
      player.play();
      return;
    }

    player.pause();
  });

  shell.querySelector(".audio-control-skip").addEventListener("click", function () {
    var nextTime = Math.min((player.currentTime || 0) + 10, player.duration || player.currentTime || 0);

    if (!Number.isFinite(nextTime)) {
      return;
    }

    player.currentTime = nextTime;
  });

  progress.addEventListener("input", function () {
    var duration = player.duration || 0;
    var nextTime = duration * (Number(progress.value) / 100);

    if (Number.isFinite(nextTime)) {
      player.currentTime = nextTime;
    }

    syncRangeFill(progress);
  });

  volume.addEventListener("input", function () {
    player.volume = Number(volume.value);
    player.muted = player.volume === 0;
    syncRangeFill(volume);
    updateMuteState(player, muteButton, volume);
  });

  muteButton.addEventListener("click", function () {
    if (player.muted || player.volume === 0) {
      player.muted = false;
      if (player.volume === 0) {
        player.volume = 0.7;
        volume.value = String(player.volume);
        syncRangeFill(volume);
      }
    } else {
      player.muted = true;
    }

    updateMuteState(player, muteButton, volume);
  });

  player.addEventListener("play", function () {
    pauseOtherPlayers(player);
    shell.classList.add("is-playing");
    playButton.setAttribute("aria-label", "Пауза");
  });

  player.addEventListener("pause", function () {
    shell.classList.remove("is-playing");
    playButton.setAttribute("aria-label", "Воспроизвести");
  });

  player.addEventListener("loadedmetadata", function () {
    updateTimeline(player, progress, currentTime, durationTime);
  });

  player.addEventListener("timeupdate", function () {
    updateTimeline(player, progress, currentTime, durationTime);
  });

  player.addEventListener("volumechange", function () {
    volume.value = String(player.muted ? 0 : player.volume);
    syncRangeFill(volume);
    updateMuteState(player, muteButton, volume);
  });

  player.addEventListener("ended", function () {
    shell.classList.remove("is-playing");
    playButton.setAttribute("aria-label", "Воспроизвести");
  });

  updateTimeline(player, progress, currentTime, durationTime);
  updateMuteState(player, muteButton, volume);
}

function updateTimeline(player, progress, currentTime, durationTime) {
  var duration = Number.isFinite(player.duration) ? player.duration : 0;
  var current = Number.isFinite(player.currentTime) ? player.currentTime : 0;
  var percent = duration > 0 ? (current / duration) * 100 : 0;

  progress.value = String(percent);
  currentTime.textContent = formatAudioTime(current);
  durationTime.textContent = formatAudioTime(duration);
  syncRangeFill(progress);
}

function updateMuteState(player, muteButton) {
  if (player.muted || player.volume === 0) {
    muteButton.classList.add("is-muted");
    muteButton.setAttribute("aria-label", "Включить звук");
    return;
  }

  muteButton.classList.remove("is-muted");
  muteButton.setAttribute("aria-label", "Выключить звук");
}

function pauseOtherPlayers(activePlayer) {
  var players = document.querySelectorAll("audio.audio-player");
  var index;

  for (index = 0; index < players.length; index += 1) {
    if (players[index] !== activePlayer) {
      players[index].pause();
    }
  }
}

function formatAudioTime(seconds) {
  var totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  var minutes = Math.floor(totalSeconds / 60);
  var remainder = totalSeconds % 60;

  return String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
}

function syncRangeFill(range) {
  var min = Number(range.min || 0);
  var max = Number(range.max || 100);
  var value = Number(range.value || 0);
  var percent = max > min ? ((value - min) / (max - min)) * 100 : 0;

  range.style.setProperty("--range-fill", percent + "%");
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
