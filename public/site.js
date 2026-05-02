document.addEventListener("DOMContentLoaded", () => {
  const preloader = document.getElementById("page-preloader");
  if (!preloader) {
    document.body.classList.remove("preloading");
  } else {
    window.setTimeout(() => {
      preloader.classList.add("hidden");
      document.body.classList.remove("preloading");

      window.setTimeout(() => {
        preloader.remove();
      }, 500);
    }, 2000);
  }

  initBlindPlayers();
  initTelegramLoginWidgets();
});

function initBlindPlayers() {
  const cards = document.querySelectorAll("[data-listen-card]");
  if (!cards.length) {
    return;
  }

  cards.forEach((card) => {
    const trigger = card.querySelector("[data-listen-trigger]");
    const status = card.querySelector("[data-listen-status]");
    const listenUrl = card.dataset.listenUrl;
    const playerSrc = card.dataset.playerSrc;

    if (!trigger || !status) {
      return;
    }

    trigger.addEventListener("click", async () => {
      if (!playerSrc) {
        status.textContent = "Не удалось подготовить плеер для этой записи.";
        return;
      }

      trigger.disabled = true;
      status.textContent = "Запускаем запись...";

      try {
        await fetch(listenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: "{}",
        });
      } catch (error) {
        console.error("Failed to save listen", error);
      }

      window.open(playerSrc, "_blank", "noopener,noreferrer");

      status.textContent = "Плеер открыт в новой вкладке. Прослушивание учтено в статистике.";

      window.setTimeout(() => {
        trigger.disabled = false;
      }, 1200);
    });
  });
}

function initTelegramLoginWidgets() {
  const boxes = document.querySelectorAll("[data-telegram-login-box]");
  if (!boxes.length) {
    return;
  }

  boxes.forEach((box) => {
    const trigger = box.querySelector("[data-telegram-login-trigger]");
    const slot = box.querySelector("[data-telegram-login-slot]");
    const botUsername = box.dataset.telegramLogin;
    const authUrl = box.dataset.telegramAuthUrl;

    if (!trigger || !slot || !botUsername || !authUrl) {
      return;
    }

    trigger.addEventListener("click", () => {
      if (slot.dataset.loaded === "true") {
        slot.hidden = false;
        trigger.hidden = true;
        return;
      }

      const script = document.createElement("script");
      script.async = true;
      script.src = "https://telegram.org/js/telegram-widget.js?23";
      script.setAttribute("data-telegram-login", botUsername);
      script.setAttribute("data-size", "large");
      script.setAttribute("data-userpic", "false");
      script.setAttribute("data-auth-url", authUrl);

      slot.hidden = false;
      slot.dataset.loaded = "true";
      slot.appendChild(script);
      trigger.hidden = true;
    });
  });
}
