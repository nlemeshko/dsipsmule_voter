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

  segments.forEach((segment) => {
    segment.addEventListener("pointerenter", (event) => showTooltip(segment, event));
    segment.addEventListener("pointermove", (event) => showTooltip(segment, event));
    segment.addEventListener("pointerleave", hideTooltip);
    segment.addEventListener("focus", () => showTooltip(segment));
    segment.addEventListener("blur", hideTooltip);
    segment.addEventListener("click", (event) => showTooltip(segment, event));
  });

  chart.addEventListener("pointerleave", hideTooltip);
});
