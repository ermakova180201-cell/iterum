(() => {
  const root = document.getElementById("player-material-list");
  if (!root) return;

  const labels = {
    publication: "ПУБЛИКАЦИЯ",
    document: "ДОКУМЕНТ",
    photo: "ФОТОГРАФИЯ",
    audio: "АУДИОЗАПИСЬ",
    map: "КАРТА / СХЕМА",
    other: "ДРУГОЙ МАТЕРИАЛ",
    dossier: "ДОСЬЕ ПЕРСОНЫ"
  };
  let materials = [];
  const viewer = document.getElementById("material-detail-window");
  const viewerHeading = document.getElementById("material-detail-heading");
  const viewerType = document.getElementById("material-detail-type");
  const viewerContent = document.getElementById("material-detail-content");
  const parentWindow = document.getElementById("materials-window");
  let openedId = null;
  let lastLauncher = null;

  function el(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function dateLabel(value) {
    if (!value) return "ДАТА НЕ УКАЗАНА";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" }).format(date).toUpperCase();
  }

  async function loadReaderFiles(item, target) {
    const section = el("section", "materials-attachments");
    section.append(el("h4", "materials-attachments-title", "ПРИКРЕПЛЁННЫЕ ФАЙЛЫ"));
    section.append(el("p", "materials-files-loading", "Проверяем вложения…"));
    target.append(section);
    try {
      const response = await fetch("/api/player/materials/" + encodeURIComponent(item.id) + "/files", { credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить список вложений.");
      section.replaceChildren(el("h4", "materials-attachments-title", "ПРИКРЕПЛЁННЫЕ ФАЙЛЫ"));
      if (!data.files.length) {
        section.append(el("p", "materials-files-loading", "К этому материалу файлы не прикреплены."));
        return;
      }
      for (const file of data.files) {
        const url = "/api/material-files/" + encodeURIComponent(file.id);
        const card = el("div", "materials-file-card");
        const info = el("div", "materials-file-info");
        info.append(el("strong", "", file.file_name));
        info.append(el("span", "", Math.max(1, Math.round(file.file_size / 1024)) + " КБ"));
        card.append(info);
        if (file.content_type.startsWith("image/")) {
          const image = document.createElement("img");
          image.className = "materials-file-image";
          image.src = url;
          image.alt = file.file_name;
          image.loading = "lazy";
          image.tabIndex = 0;
          image.setAttribute("role", "button");
          image.setAttribute("aria-label", "Открыть фотографию в увеличенном виде: " + file.file_name);
          image.title = "Нажмите, чтобы увеличить";
          const openImage = () => {
            const overlay = el("div", "materials-image-lightbox");
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-modal", "true");
            overlay.setAttribute("aria-label", file.file_name);
            const close = el("button", "materials-image-lightbox-close", "ЗАКРЫТЬ ✕");
            close.type = "button";
            const large = document.createElement("img");
            large.src = url;
            large.alt = file.file_name;
            const caption = el("div", "materials-image-lightbox-caption", file.file_name);
            overlay.append(close, large, caption);
            const closeOverlay = () => {
              overlay.remove();
              document.removeEventListener("keydown", onKeyDown);
            };
            const onKeyDown = event => {
              if (event.key === "Escape") closeOverlay();
            };
            close.addEventListener("click", closeOverlay);
            overlay.addEventListener("click", event => {
              if (event.target === overlay) closeOverlay();
            });
            document.addEventListener("keydown", onKeyDown);
            document.body.append(overlay);
            close.focus();
          };
          image.addEventListener("click", openImage);
          image.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openImage();
            }
          });
          card.append(image);
        } else if (file.content_type === "application/pdf") {
          const frame = document.createElement("iframe");
          frame.className = "materials-file-pdf";
          frame.src = url;
          frame.title = file.file_name;
          frame.loading = "lazy";
          card.append(frame);
        } else if (file.content_type.startsWith("audio/")) {
          const audio = document.createElement("audio");
          audio.controls = true;
          audio.preload = "none";
          audio.src = url;
          card.append(audio);
        }
        const link = el("a", "materials-file-open", "ОТКРЫТЬ ФАЙЛ");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener";
        card.append(link);
        section.append(card);
      }
    } catch (error) {
      section.replaceChildren(el("h4", "materials-attachments-title", "ПРИКРЕПЛЁННЫЕ ФАЙЛЫ"), el("p", "materials-files-loading is-error", error.message));
    }
  }


  function renderDossierReader(item) {
    const reader = el("article", "materials-reader materials-person-reader");
    const top = el("div", "materials-reader-top");
    top.append(el("span", "materials-reader-type", "СОХРАНЁННОЕ ДОСЬЕ"));
    top.append(el("time", "", "НАЙДЕНО: " + dateLabel(item.created_at)));
    reader.append(top);

    const identity = el("div", "materials-person-identity");
    if (item.photo_data) {
      const photo = document.createElement("img");
      photo.className = "materials-person-photo";
      photo.alt = "Фотография: " + item.title;
      photo.src = item.photo_data;
      photo.loading = "lazy";
      identity.append(photo);
    } else {
      const placeholder = el("span", "materials-person-placeholder", "◌");
      placeholder.setAttribute("aria-hidden", "true");
      identity.append(placeholder);
    }
    const info = el("div", "materials-person-identity-info");
    info.append(el("h3", "materials-reader-title", item.title));
    if (item.summary) info.append(el("p", "materials-reader-summary", item.summary));
    info.append(el("span", "materials-dossier-saved-mark", "СОХРАНЕНО В МАТЕРИАЛАХ ДЕЛА"));
    identity.append(info);
    reader.append(identity);

    const facts = el("div", "materials-person-facts");
    for (const [label, value] of [["ДАТА РОЖДЕНИЯ", item.birth_date],
      ["ПРОФЕССИЯ", item.occupation]]) {
      if (!value) continue;
      const fact = el("div", "materials-person-fact");
      fact.append(el("span", "", label), el("strong", "", value));
      facts.append(fact);
    }
    if (facts.childElementCount) reader.append(facts);

    for (const [heading, content] of [
      ["Биография", item.biography], ["Связи с людьми", item.relationships],
      ["Хронология", item.chronology], ["Связанные материалы", item.related_materials]
    ]) {
      if (!content) continue;
      const section = el("section", "materials-person-section");
      section.append(el("h4", "", heading), el("p", "", content));
      reader.append(section);
    }
    return reader;
  }

  function renderReader(item) {
    if (item.material_type === "dossier") return renderDossierReader(item);
    const reader = el("article", "materials-reader");
    const top = el("div", "materials-reader-top");
    top.append(el("span", "materials-reader-type", labels[item.material_type] || "МАТЕРИАЛ"));
    top.append(el("time", "", dateLabel(item.created_at)));
    const title = el("h3", "materials-reader-title", item.title);
    const meta = el("p", "materials-reader-meta", (item.case_title || "Дело") + (item.is_preview ? " · ЧЕРНОВИК / ПРЕДПРОСМОТР" : ""));
    const summary = el("p", "materials-reader-summary", item.summary || "Описание к материалу не добавлено.");
    const divider = el("div", "materials-reader-divider");
    const content = el("div", "materials-reader-content", item.content || "Текстовое содержание к этому материалу не добавлено.");
    reader.append(top, title, meta, summary, divider, content);
    loadReaderFiles(item, reader);

    if (item.is_preview) {
      reader.append(el("p", "materials-preview-note", "Это административный предпросмотр. Материал не опубликован и недоступен игрокам."));
    } else if (!item.is_read) {
      const action = el("button", "admin-mini-button materials-read-button", "ОТМЕТИТЬ КАК ИЗУЧЕННОЕ");
      action.type = "button";
      action.addEventListener("click", async () => {
        action.disabled = true;
        action.textContent = "СОХРАНЯЕМ…";
        try {
          const response = await fetch("/api/player/materials/" + encodeURIComponent(item.id) + "/read", {
            method: "POST", credentials: "same-origin"
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Не удалось отметить материал.");
          item.is_read = 1;
          // The compact catalogue has no read-status column; keep its list
          // stable and update only this detail window after marking as read.
          displayDetail(item);
        } catch (error) {
          action.disabled = false;
          action.textContent = "ПОВТОРИТЬ";
          reader.append(el("p", "materials-preview-note is-error", error.message));
        }
      });
      reader.append(action);
    } else {
      reader.append(el("span", "materials-read-label", "МАТЕРИАЛ ИЗУЧЕН"));
    }
    return reader;
  }

  function closeDetail(restoreFocus = true) {
    if (!viewer) return;
    viewer.hidden = true;
    openedId = null;
    if (viewerContent) viewerContent.replaceChildren();
    if (restoreFocus && lastLauncher && lastLauncher.isConnected && parentWindow && !parentWindow.hidden) {
      lastLauncher.focus();
    }
    lastLauncher = null;
  }

  function displayDetail(item) {
    if (!viewer || !viewerContent || !viewerHeading || !viewerType) return;
    openedId = item.id;
    viewerHeading.textContent = item.title;
    viewerType.textContent = item.material_type === "dossier"
      ? "КАРТОТЕКА ПЕРСОН / СОХРАНЁННОЕ ДОСЬЕ"
      : "СЛЕДСТВЕННЫЙ АРХИВ / " + (labels[item.material_type] || "МАТЕРИАЛ");
    viewerContent.replaceChildren(renderReader(item));
    if (viewer.hidden) {
      viewer.hidden = false;
      viewer.style.left = "50%";
      viewer.style.top = "50%";
      viewer.style.right = "auto";
      viewer.style.bottom = "auto";
      viewer.style.transform = "translate(-50%, -50%)";
      viewer.style.width = "";
      viewer.style.height = "";
      viewer.style.zIndex = String(Math.max(50, (parseInt(parentWindow?.style.zIndex || "30", 10) || 30) + 1));
      viewer.scrollTop = 0;
    }
  }

  function openDetail(item, sourceButton) {
    // Read from the current case-scoped list, not from old detached DOM.
    const current = materials.find(entry => entry.id === item.id);
    if (!current) return;
    lastLauncher = sourceButton;
    displayDetail(current);
    document.getElementById("material-detail-close")?.focus();
  }

  function section(title, subtitle, entries, emptyText, category) {
    const container = el("section", "materials-library-section is-" + category);
    const heading = el("div", "materials-library-heading");
    const labelsWrap = el("div", "materials-library-heading-text");
    labelsWrap.append(el("span", "materials-library-eyebrow", subtitle));
    labelsWrap.append(el("h3", "materials-library-title", title));
    heading.append(labelsWrap);
    container.append(heading);

    const list = el("div", "materials-library-list");
    if (!entries.length) {
      const blank = el("div", "materials-library-empty");
      blank.append(el("span", "materials-library-empty-icon", category === "dossiers" ? "◌" : "▤"));
      blank.append(el("p", "", emptyText));
      list.append(blank);
    } else {
      for (const item of entries) {
        const button = el("button", "materials-library-entry");
        button.type = "button";
        button.dataset.materialId = item.id;
        button.setAttribute("aria-label", "Открыть " + (item.material_type === "dossier" ? "досье: " : "материал: ") + item.title);
        const symbol = el("span", "materials-library-item-icon", item.material_type === "dossier" ? "◌" : "▤");
        symbol.setAttribute("aria-hidden", "true");
        const body = el("span", "materials-library-item-body");
        body.append(el("strong", "materials-library-item-title", item.title));
        const descriptor = item.is_preview ? "ЧЕРНОВИК" :
          item.material_type === "dossier" ? (item.summary || "ДОСЬЕ ПЕРСОНЫ") :
          (labels[item.material_type] || "МАТЕРИАЛ");
        body.append(el("span", "materials-library-item-meta", descriptor));
        const action = el("span", "materials-library-item-arrow", "↗");
        action.setAttribute("aria-hidden", "true");
        button.append(symbol, body, action);
        button.addEventListener("click", () => openDetail(item, button));
        list.append(button);
      }
    }
    container.append(list);
    return container;
  }

  function render() {
    root.replaceChildren();
    const all = materials.filter(item => item.material_type !== "email");
    const dossiers = all.filter(item => item.material_type === "dossier")
      .sort((a, b) => String(a.title).localeCompare(String(b.title), "ru"));
    const documents = all.filter(item => item.material_type !== "dossier")
      .sort((a, b) => (a.release_order || 0) - (b.release_order || 0) ||
        String(a.created_at || "").localeCompare(String(b.created_at || "")));
    const library = el("div", "materials-library");
    library.append(
      section("Досье людей", "СОХРАНЁННЫЕ КАРТОЧКИ", dossiers,
        "Пока нет найденных досье. Они сохраняются здесь после поиска по имени и фамилии.", "dossiers"),
      section("Документы", "МАТЕРИАЛЫ И УЛИКИ", documents,
        "Документы пока не доступны. Новые материалы появятся по мере расследования.", "documents")
    );
    root.append(library);
  }

  document.getElementById("material-detail-close")?.addEventListener("click", () => closeDetail());
  document.getElementById("material-detail-back")?.addEventListener("click", () => closeDetail());
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && viewer && !viewer.hidden &&
        !document.querySelector(".materials-image-lightbox")) {
      closeDetail();
    }
  });
  // When another app is opened the desktop manager hides the detail window;
  // clear its state too, leaving no stale dossier after switching cases.
  document.addEventListener("click", event => {
    if (viewer && !viewer.hidden && event.target.closest("[data-open-window]")) {
      closeDetail(false);
    }
  }, true);

  window.renderMaterialsArchive = function(items) {
    materials = (items || []).filter(item => item.material_type !== "email");
    // Case change or another app can hide the viewer without pressing Close.
    // Clear old record content even when the desktop manager hid it first.
    if (viewer && openedId &&
        (viewer.hidden || !materials.some(item => item.id === openedId))) {
      closeDetail(false);
    }
    render();
  };

})();