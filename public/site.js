document.addEventListener("DOMContentLoaded", function () {
  var preloader = document.getElementById("page-preloader");
  var audioPlayers = document.querySelectorAll("audio.audio-player");
  var playPage = document.querySelector("[data-play-page='true']");
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

  if (playPage) {
    initPlayPage(playPage);
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
  var visualizerCanvas;
  var visualizer;
  var isScrubbing = false;

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
  ].join("");

  player.insertAdjacentElement("afterend", shell);

  if (player.getAttribute("data-visualizer") === "true") {
    visualizerCanvas = document.createElement("canvas");
    visualizerCanvas.className = "audio-visualizer";
    visualizerCanvas.setAttribute("aria-hidden", "true");
    shell.appendChild(visualizerCanvas);
    visualizer = createAudioVisualizer(player, visualizerCanvas);
  }

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

  progress.addEventListener("input", function () {
    isScrubbing = true;
    updateScrubPreview(player, progress, currentTime, durationTime);
    syncRangeFill(progress);
  });

  progress.addEventListener("change", function () {
    commitScrub(player, progress, currentTime, durationTime, function () {
      isScrubbing = false;
    });
  });

  progress.addEventListener("pointerdown", function () {
    isScrubbing = true;
  });

  progress.addEventListener("pointerup", function () {
    commitScrub(player, progress, currentTime, durationTime, function () {
      isScrubbing = false;
    });
  });

  progress.addEventListener("keyup", function (event) {
    if (
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "Home" ||
      event.key === "End" ||
      event.key === "PageUp" ||
      event.key === "PageDown"
    ) {
      commitScrub(player, progress, currentTime, durationTime, function () {
        isScrubbing = false;
      });
    }
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
    syncPagePlaybackState();

    if (visualizer) {
      visualizer.start();
    }
  });

  player.addEventListener("pause", function () {
    shell.classList.remove("is-playing");
    playButton.setAttribute("aria-label", "Воспроизвести");
    syncPagePlaybackState();

    if (visualizer) {
      visualizer.stop();
    }
  });

  player.addEventListener("loadedmetadata", function () {
    updateTimeline(player, progress, currentTime, durationTime);
  });

  player.addEventListener("timeupdate", function () {
    if (!isScrubbing) {
      updateTimeline(player, progress, currentTime, durationTime);
    }
  });

  player.addEventListener("volumechange", function () {
    volume.value = String(player.muted ? 0 : player.volume);
    syncRangeFill(volume);
    updateMuteState(player, muteButton, volume);
  });

  player.addEventListener("ended", function () {
    shell.classList.remove("is-playing");
    playButton.setAttribute("aria-label", "Воспроизвести");
    isScrubbing = false;
    syncPagePlaybackState();

    if (visualizer) {
      visualizer.stop();
    }
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

function updateScrubPreview(player, progress, currentTime, durationTime) {
  var duration = Number.isFinite(player.duration) ? player.duration : 0;
  var previewTime = duration > 0 ? duration * (Number(progress.value) / 100) : 0;

  currentTime.textContent = formatAudioTime(previewTime);
  durationTime.textContent = formatAudioTime(duration);
}

function commitScrub(player, progress, currentTime, durationTime, onComplete) {
  var duration = player.duration || 0;
  var nextTime = duration * (Number(progress.value) / 100);

  if (Number.isFinite(nextTime)) {
    player.currentTime = nextTime;
  }

  updateTimeline(player, progress, currentTime, durationTime);
  syncRangeFill(progress);
  if (typeof onComplete === "function") {
    onComplete();
  }
  window.setTimeout(function () {
    updateTimeline(player, progress, currentTime, durationTime);
  }, 30);
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

  syncPagePlaybackState();
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

function syncPagePlaybackState() {
  var hasPlayingAudio = Array.prototype.some.call(
    document.querySelectorAll("audio.audio-player"),
    function (player) {
      return !player.paused && !player.ended;
    },
  );

  document.body.classList.toggle("audio-reactive", hasPlayingAudio);
}

function initPlayPage(root) {
  var cards = Array.prototype.slice.call(root.querySelectorAll("[data-play-card]"));
  var queueButtons = Array.prototype.slice.call(root.querySelectorAll("[data-play-select]"));
  var prevButtons = Array.prototype.slice.call(root.querySelectorAll("[data-play-prev]"));
  var nextButtons = Array.prototype.slice.call(root.querySelectorAll("[data-play-next]"));
  var initialId = root.getAttribute("data-play-initial-id");
  var currentIndex = Math.max(0, cards.findIndex(function (card) {
    return card.getAttribute("data-play-card") === initialId;
  }));

  if (!cards.length || !queueButtons.length) {
    return;
  }

  function setActiveCard(nextIndex) {
    var safeIndex = ((nextIndex % cards.length) + cards.length) % cards.length;
    var activeCard = cards[safeIndex];
    var activeId = activeCard.getAttribute("data-play-card");
    var player;

    currentIndex = safeIndex;

    cards.forEach(function (card, index) {
      var isActive = index === safeIndex;
      card.hidden = !isActive;
      card.classList.toggle("is-active", isActive);
    });

    queueButtons.forEach(function (button) {
      var isSelected = button.getAttribute("data-play-select") === activeId;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-selected", isSelected ? "true" : "false");
    });

    player = activeCard.querySelector("audio.audio-player");
    if (player) {
      window.setTimeout(function () {
        player.play().catch(function () {
          return null;
        });
      }, 120);
    }
  }

  queueButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var participantId = button.getAttribute("data-play-select");
      var nextIndex = cards.findIndex(function (card) {
        return card.getAttribute("data-play-card") === participantId;
      });

      if (nextIndex >= 0) {
        setActiveCard(nextIndex);
      }
    });
  });

  prevButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      setActiveCard(currentIndex - 1);
    });
  });

  nextButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      setActiveCard(currentIndex + 1);
    });
  });

  cards.forEach(function (card, index) {
    var player = card.querySelector("audio.audio-player");

    if (!player) {
      return;
    }

    player.addEventListener("ended", function () {
      if (index === currentIndex) {
        setActiveCard(currentIndex + 1);
      }
    });
  });
}

function createAudioVisualizer(player, canvas) {
  var context = null;
  var source = null;
  var analyser = null;
  var dataArray = null;
  var animationFrameId = 0;
  var started = false;
  var audioContext = null;

  function resizeCanvas() {
    var width = canvas.clientWidth || 640;
    var height = canvas.clientHeight || 120;

    canvas.width = width;
    canvas.height = height;
  }

  function drawIdle() {
    var canvasContext = canvas.getContext("2d");
    var width = canvas.width || canvas.clientWidth || 640;
    var height = canvas.height || canvas.clientHeight || 120;
    var step = Math.max(10, Math.floor(width / 36));
    var x = 0;

    canvasContext.clearRect(0, 0, width, height);
    canvasContext.fillStyle = "rgba(255, 255, 255, 0.03)";
    canvasContext.fillRect(0, 0, width, height);
    canvasContext.fillStyle = "rgba(215, 224, 234, 0.35)";

    while (x < width) {
      canvasContext.fillRect(x, height * 0.45, Math.max(4, step * 0.45), height * 0.1);
      x += step;
    }
  }

  function ensureGraph() {
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      return false;
    }

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (!context) {
      context = canvas.getContext("2d");
    }

    if (!analyser) {
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;
      dataArray = new Uint8Array(analyser.frequencyBinCount);
    }

    if (!source) {
      source = audioContext.createMediaElementSource(player);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
    }

    return true;
  }

  function renderFrame() {
    var width = canvas.width;
    var height = canvas.height;
    var barWidth;
    var index;
    var value;
    var barHeight;
    var x;

    animationFrameId = window.requestAnimationFrame(renderFrame);
    analyser.getByteFrequencyData(dataArray);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(255, 255, 255, 0.03)";
    context.fillRect(0, 0, width, height);

    barWidth = width / dataArray.length;
    x = 0;

    for (index = 0; index < dataArray.length; index += 1) {
      value = dataArray[index] / 255;
      barHeight = Math.max(6, value * height * 0.92);
      context.fillStyle = "rgba(215, 224, 234, " + (0.3 + value * 0.7) + ")";
      context.fillRect(x, height - barHeight, Math.max(3, barWidth - 3), barHeight);
      x += barWidth;
    }
  }

  function start() {
    if (!ensureGraph()) {
      return;
    }

    resizeCanvas();

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(function () {
        return null;
      });
    }

    if (started) {
      return;
    }

    started = true;
    renderFrame();
  }

  function stop() {
    started = false;
    if (animationFrameId) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }
    drawIdle();
  }

  resizeCanvas();
  drawIdle();
  window.addEventListener("resize", resizeCanvas);

  return {
    start: start,
    stop: stop,
  };
}
