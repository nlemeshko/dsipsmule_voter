document.addEventListener("DOMContentLoaded", function () {
  var preloader = document.getElementById("page-preloader");

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

  initBlindPlayers();
  initTelegramLoginWidgets();
});

function initBlindPlayers() {
  var cards = document.querySelectorAll("[data-listen-card]");
  var index;

  if (!cards.length) {
    return;
  }

  for (index = 0; index < cards.length; index += 1) {
    bindBlindPlayer(cards[index]);
  }
}

function bindBlindPlayer(card) {
  var trigger = card.querySelector("[data-listen-trigger]");
  var status = card.querySelector("[data-listen-status]");
  var listenUrl = card.getAttribute("data-listen-url");
  var playerSrc = card.getAttribute("data-player-src");

  if (!trigger || !status) {
    return;
  }

  trigger.addEventListener("click", function () {
    if (!playerSrc) {
      status.textContent = "Не удалось подготовить плеер для этой записи.";
      return;
    }

    trigger.disabled = true;
    status.textContent = "Запускаем запись...";

    sendListenEvent(listenUrl, function () {
      window.open(playerSrc, "_blank", "noopener,noreferrer");
      status.textContent = "Плеер открыт в новой вкладке. Прослушивание учтено в статистике.";

      window.setTimeout(function () {
        trigger.disabled = false;
      }, 1200);
    });
  });
}

function sendListenEvent(listenUrl, callback) {
  var xhr;

  if (!listenUrl) {
    callback();
    return;
  }

  try {
    xhr = new XMLHttpRequest();
    xhr.open("POST", listenUrl, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        callback();
      }
    };
    xhr.onerror = function () {
      callback();
    };
    xhr.send("{}");
  } catch (error) {
    if (window.console && console.error) {
      console.error("Failed to save listen", error);
    }
    callback();
  }
}

function initTelegramLoginWidgets() {
  var boxes = document.querySelectorAll("[data-telegram-login-box]");
  var index;

  if (!boxes.length) {
    return;
  }

  for (index = 0; index < boxes.length; index += 1) {
    bindTelegramLoginWidget(boxes[index]);
  }
}

function bindTelegramLoginWidget(box) {
  var trigger = box.querySelector("[data-telegram-login-trigger]");
  var slot = box.querySelector("[data-telegram-login-slot]");
  var botUsername = box.getAttribute("data-telegram-login");
  var authUrl = box.getAttribute("data-telegram-auth-url");

  if (!trigger || !slot || !botUsername || !authUrl) {
    return;
  }

  trigger.addEventListener("click", function () {
    var script;

    if (slot.getAttribute("data-loaded") === "true") {
      slot.hidden = false;
      trigger.hidden = true;
      return;
    }

    script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?23";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-auth-url", authUrl);

    slot.hidden = false;
    slot.setAttribute("data-loaded", "true");
    slot.appendChild(script);
    trigger.hidden = true;
  });
}
