// js/uiIcons.js
(function () {
  function svg(pathMarkup, className) {
    const cls = String(className || "ui-action-icon").trim();
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" focusable="false">${pathMarkup}</svg>`;
  }

  function getIcon(name, options = {}) {
    const className = options.className || "ui-action-icon";
    switch (String(name || "").trim()) {
      case "magnifying-glass":
        return svg('<path d="m21 21-4.35-4.35"></path><circle cx="11" cy="11" r="6.5"></circle>', className);
      case "check":
        return svg('<path d="m5 13 4 4L19 7"></path>', className);
      case "arrow-path":
        return svg('<path d="M16 3h5v5"></path><path d="M21 8a9 9 0 1 0 2.64 6.36"></path>', className);
      case "arrow-up":
        return svg('<path d="m12 5-5 5"></path><path d="m12 5 5 5"></path><path d="M12 5v14"></path>', className);
      case "arrow-down":
        return svg('<path d="m12 19-5-5"></path><path d="m12 19 5-5"></path><path d="M12 19V5"></path>', className);
      case "trash":
        return svg('<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="m8 6 1 14h6l1-14"></path><path d="M10 10v7M14 10v7"></path>', className);
      case "plus":
        return svg('<path d="M12 5v14M5 12h14"></path>', className);
      case "document-text":
        return svg('<path d="M8 3h6l4 4v14H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"></path><path d="M14 3v5h5"></path><path d="M10 12h6M10 16h6"></path>', className);
      case "shield-check":
        return svg('<path d="M12 3 5 6v6c0 5 3.5 8 7 9 3.5-1 7-4 7-9V6l-7-3Z"></path><path d="m9 12 2 2 4-4"></path>', className);
      case "check-circle":
        return svg('<circle cx="12" cy="12" r="9"></circle><path d="m8.5 12.5 2.2 2.2 4.8-4.8"></path>', className);
      case "arrow-right-on-rectangle":
        return svg('<path d="M13 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6"></path><path d="M11 12h10"></path><path d="m18 7 5 5-5 5"></path>', className);
      case "x-mark":
        return svg('<path d="M6 6 18 18"></path><path d="m18 6-12 12"></path>', className);
      default:
        return "";
    }
  }

  window.__uiIcons = {
    get: getIcon
  };
})();
