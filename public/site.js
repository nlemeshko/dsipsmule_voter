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
});

function initBlindPlayers() {
  const cards = document.querySelectorAll("[data-listen-card]");
  if (!cards.length) {
    return;
  }

  const modal = document.querySelector("[data-player-modal]");
  const modalFrame = document.querySelector("[data-player-modal-frame]");
  const closeButton = document.querySelector("[data-player-close]");

  if (closeButton && modal && modalFrame) {
    closeButton.addEventListener("click", () => {
      modal.close();
      modalFrame.replaceChildren();
    });

    modal.addEventListener("close", () => {
      modalFrame.replaceChildren();
    });
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

      if (modal && modalFrame) {
        modalFrame.replaceChildren(createPlayerIframe(playerSrc));
        modal.showModal();
      }

      status.textContent = "Плеер открыт. Прослушивание учтено в статистике.";

      window.setTimeout(() => {
        trigger.disabled = false;
      }, 1200);
    });
  });
}

function createPlayerIframe(src) {
  const iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.loading = "eager";
  iframe.allow = "autoplay; encrypted-media";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.title = "Плеер записи";
  iframe.setAttribute("frameborder", "0");
  return iframe;
}
