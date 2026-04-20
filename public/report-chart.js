document.addEventListener("DOMContentLoaded", () => {
  const tooltip = document.getElementById("report-chart-tooltip");
  const chart = document.querySelector(".report-chart");
  const segments = document.querySelectorAll(".report-chart-segment");

  if (!tooltip || !chart || segments.length === 0) {
    return;
  }

  const hideTooltip = () => {
    tooltip.classList.remove("is-visible");
    tooltip.setAttribute("aria-hidden", "true");
  };

  const showTooltip = (segment, event) => {
    const text = segment.getAttribute("data-tooltip");
    if (!text) {
      hideTooltip();
      return;
    }

    const chartRect = chart.getBoundingClientRect();
    const x = event?.clientX ? event.clientX - chartRect.left : chartRect.width / 2;
    const y = event?.clientY ? event.clientY - chartRect.top : 16;

    tooltip.textContent = text;
    tooltip.style.left = `${Math.max(12, Math.min(x, chartRect.width - 12))}px`;
    tooltip.style.top = `${Math.max(12, Math.min(y, chartRect.height - 12))}px`;
    tooltip.classList.add("is-visible");
    tooltip.setAttribute("aria-hidden", "false");
  };

  segments.forEach((target) => {
    target.addEventListener("pointerenter", (event) => showTooltip(target, event));
    target.addEventListener("pointermove", (event) => showTooltip(target, event));
    target.addEventListener("pointerleave", hideTooltip);
    target.addEventListener("mouseenter", (event) => showTooltip(target, event));
    target.addEventListener("mousemove", (event) => showTooltip(target, event));
    target.addEventListener("mouseleave", hideTooltip);
    target.addEventListener("focus", () => showTooltip(target));
    target.addEventListener("blur", hideTooltip);
    target.addEventListener("click", (event) => showTooltip(target, event));
    target.addEventListener("touchstart", (event) => {
      const touch = event.touches?.[0];
      showTooltip(target, touch ? { clientX: touch.clientX, clientY: touch.clientY } : undefined);
    }, { passive: true });
  });

  chart.addEventListener("pointerleave", hideTooltip);
  document.addEventListener("scroll", hideTooltip, { passive: true });
});
