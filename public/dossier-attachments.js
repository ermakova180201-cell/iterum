/* ITERUM dossier attachments: shared, access-controlled player reader. */
(() => {
  "use strict";
  function el(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }
  window.iterumRenderDossierFiles = async (dossierId, target) => {
    if (!target || !/^[a-f0-9]{32}$/.test(String(dossierId || ""))) return;
    target.replaceChildren();
    const section = el("section", "dossier-linked-files");
    section.append(el("h4", "dossier-linked-title", "ПРИКРЕПЛЁННЫЕ ДОКУМЕНТЫ"));
    const status = el("p", "dossier-linked-status", "Загружаем список документов…");
    section.append(status);
    target.append(section);
    try {
      const response = await fetch("/api/player/dossiers/" + dossierId + "/files", { credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(data.error || "Не удалось получить документы.");
      if (!target.isConnected) return;
      const files = Array.isArray(data.files) ? data.files : [];
      if (!files.length) {
        // Empty attachments should not clutter the case dossier.
        target.replaceChildren();
        return;
      }
      status.remove();
      for (const file of files) {
        const url = "/api/dossier-files/" + encodeURIComponent(file.id);
        const details = el("details", "dossier-linked-item");
        const summary = el("summary", "dossier-linked-item-heading");
        const type = file.content_type === "application/pdf" ? "PDF" : "ИЗОБРАЖЕНИЕ";
        summary.append(el("span", "dossier-linked-file-icon", file.content_type === "application/pdf" ? "▤" : "▧"));
        const label = el("span", "dossier-linked-file-label");
        label.append(el("strong", "", file.file_name));
        label.append(el("small", "", type + " · " + Math.max(1, Math.round(file.file_size / 1024)) + " КБ"));
        summary.append(label);
        summary.append(el("span", "dossier-linked-chevron", "▾"));
        details.append(summary);
        const preview = el("div", "dossier-linked-preview");
        const link = el("a", "dossier-linked-open", "ОТКРЫТЬ ФАЙЛ В НОВОЙ ВКЛАДКЕ");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener";
        preview.append(link);
        details.append(preview);
        let loaded = false;
        details.addEventListener("toggle", () => {
          if (!details.open || loaded) return;
          loaded = true;
          if (file.content_type.startsWith("image/")) {
            const img = el("img", "dossier-linked-image");
            img.alt = file.file_name;
            img.src = url;
            img.loading = "lazy";
            preview.prepend(img);
          } else if (file.content_type === "application/pdf") {
            const frame = el("iframe", "dossier-linked-pdf");
            frame.title = file.file_name;
            frame.src = url;
            frame.loading = "lazy";
            preview.prepend(frame);
          }
        });
        section.append(details);
      }
    } catch (error) {
      if (target.isConnected) status.textContent = error.message;
    }
  };
})();
