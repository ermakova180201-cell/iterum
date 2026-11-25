/* ITERUM / dossier card: shared visual template for search and saved profiles. */
(() => {
  "use strict";
  function node(tag, cls, value) {
    const item = document.createElement(tag);
    if (cls) item.className = cls;
    if (value !== undefined) item.textContent = String(value);
    return item;
  }
  function icon(name, className) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", className || "");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const paths = {
      folder: ["M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
      file: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M8 13h8", "M8 17h7"],
      eye: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z", "M12 9a3 3 0 1 0 .01 6.01A3 3 0 0 0 12 9z"],
      image: ["M3 3h18v18H3z", "M7.5 9h.01", "M3 17l6-6 4 4 3-3 5 5"]
    };
    for (const d of paths[name] || paths.file) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  }
  function formatDate(value) {
    const text = String(value || "");
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return iso ? iso[3] + "." + iso[2] + "." + iso[1] : text;
  }
  function valueRow(label, value) {
    const item = node("div", "iterum-dossier-fact");
    item.append(node("dt", "iterum-dossier-fact-name", label));
    item.append(node("dd", "iterum-dossier-fact-value", value || "Нет сведений"));
    return item;
  }
  function statusClass(value) {
    if (/(погиб|умер|скончал)/iu.test(value || "")) return "is-deceased";
    if (/(пропал|розыск)/iu.test(value || "")) return "is-missing";
    return "is-living";
  }

  // One identical responsive layout regardless of where the player opens the dossier.
  window.iterumCreateDossierCard = (person, options = {}) => {
    const card = node("article", "iterum-dossier-reference");
    const header = node("header", "iterum-dossier-banner");
    const mark = node("span", "iterum-dossier-brand", "I T E R U M");
    const title = node("span", "iterum-dossier-banner-title", "ДОСЬЕ ПЕРСОНЫ");
    header.append(mark, node("span", "iterum-dossier-banner-rule"), title);
    card.append(header);

    const panel = node("section", "iterum-dossier-profile-panel");
    const grid = node("div", "iterum-dossier-profile-grid");

    const portrait = node("div", "iterum-dossier-portrait");
    const portraitFrame = node("div", "iterum-dossier-portrait-frame");
    if (person.photo_data) {
      const img = node("img", "iterum-dossier-portrait-image");
      img.alt = "Фотография: " + (person.title || person.full_name || "");
      img.src = person.photo_data;
      img.loading = "lazy";
      portraitFrame.append(img);
    } else {
      portraitFrame.append(node("div", "iterum-dossier-portrait-missing", "ФОТО НЕ ДОБАВЛЕНО"));
    }
    portrait.append(portraitFrame);

    const identity = node("div", "iterum-dossier-identity");
    identity.append(node("h3", "iterum-dossier-person-name", person.title || person.full_name || "Без имени"));
    const state = node("div", "iterum-dossier-status-line");
    state.append(node("span", "iterum-dossier-status-label", "СТАТУС:"));
    const statusText = String(person.life_status || person.summary || "").trim();
    const status = node("span", "iterum-dossier-status " + statusClass(statusText), statusText || "Не указан");
    state.append(status);
    identity.append(state);

    const facts = node("dl", "iterum-dossier-facts");
    for (const [label, value] of [
      ["ДАТА РОЖДЕНИЯ:", formatDate(person.birth_date)],
      ["МЕСТО ПРОЖИВАНИЯ:", person.residence],
      ["ПРОФЕССИЯ / ДОЛЖНОСТЬ:", person.occupation],
      ["МЕСТО РАБОТЫ:", person.workplace],
      ["СЕМЕЙНОЕ ПОЛОЖЕНИЕ:", person.marital_status],
      ["СУПРУГ / СУПРУГА:", person.spouse],
      ["ДЕТИ:", person.children]
    ]) facts.append(valueRow(label, value));
    identity.append(facts);

    const biography = node("aside", "iterum-dossier-biography");
    const bioTitle = node("h4", "iterum-dossier-biography-title", "КРАТКАЯ БИОГРАФИЯ");
    biography.append(bioTitle, node("p", "iterum-dossier-biography-text", person.biography || "Биографические сведения отсутствуют."));
    grid.append(portrait, identity, biography);
    panel.append(grid);
    card.append(panel);

    const attachments = node("section", "iterum-dossier-documents-panel");
    const documentTitle = node("h4", "iterum-dossier-documents-title");
    const folder = node("span", "iterum-dossier-folder-icon");
    folder.append(icon("folder"));
    documentTitle.append(folder, node("span", "", "ПРИКРЕПЛЁННЫЕ ДОКУМЕНТЫ"));
    attachments.append(documentTitle);
    attachments.append(node("div", "dossier-attachment-area"));
    card.append(attachments);
    if (options.isPreview) {
      const note = node("div", "iterum-dossier-preview-warning", "ЧЕРНОВИК · ТОЛЬКО ДЛЯ АВТОРА");
      card.append(note);
    }
    if (options.isArchived) {
      const note = node("div", "iterum-dossier-archive-mark", "СОХРАНЕНО В МАТЕРИАЛАХ ДЕЛА");
      card.append(note);
    }
    return card;
  };

  window.iterumRenderDossierFiles = async (dossierId, target) => {
    if (!target || !/^[a-f0-9]{32}$/.test(String(dossierId || ""))) return;
    target.replaceChildren(node("p", "iterum-dossier-files-loading", "ЗАГРУЖАЕМ ДОКУМЕНТЫ…"));
    try {
      const response = await fetch("/api/player/dossiers/" + dossierId + "/files", { credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(data.error || "Не удалось получить документы.");
      if (!target.isConnected) return;
      target.replaceChildren();
      const files = Array.isArray(data.files) ? data.files : [];
      if (!files.length) {
        target.append(node("p", "iterum-dossier-files-empty", "Документы к этому досье пока не прикреплены."));
        return;
      }
      for (const file of files) {
        const url = "/api/dossier-files/" + encodeURIComponent(file.id);
        const details = node("details", "iterum-dossier-file");
        const summary = node("summary", "iterum-dossier-file-summary");
        const fileIcon = node("span", "iterum-dossier-file-icon");
        fileIcon.append(icon(file.content_type?.startsWith("image/") ? "image" : "file"));
        summary.append(fileIcon);
        const label = node("span", "iterum-dossier-file-name", file.file_name);
        summary.append(label);
        const view = node("span", "iterum-dossier-file-view");
        view.append(icon("eye"));
        view.setAttribute("aria-hidden", "true");
        summary.append(view);
        details.append(summary);
        const preview = node("div", "iterum-dossier-file-preview");
        const link = node("a", "iterum-dossier-file-open", "ОТКРЫТЬ В ОТДЕЛЬНОМ ОКНЕ");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener";
        preview.append(link);
        details.append(preview);
        let loaded = false;
        details.addEventListener("toggle", () => {
          if (!details.open || loaded) return;
          loaded = true;
          if (file.content_type?.startsWith("image/")) {
            const img = node("img", "iterum-dossier-file-image");
            img.alt = file.file_name;
            img.src = url;
            img.loading = "lazy";
            preview.prepend(img);
          } else if (file.content_type === "application/pdf") {
            const pdf = node("iframe", "iterum-dossier-file-pdf");
            pdf.title = file.file_name;
            pdf.src = url;
            pdf.loading = "lazy";
            preview.prepend(pdf);
          }
        });
        target.append(details);
      }
    } catch (error) {
      if (target.isConnected) {
        target.replaceChildren(node("p", "iterum-dossier-files-error", error.message));
      }
    }
  };
})();
