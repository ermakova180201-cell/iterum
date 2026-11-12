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
  let selectedId = null;
  let filters = { type: "all", status: "all", caseId: "all", query: "", sort: "order" };

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

  function makeSelect(label, options, value, onChange) {
    const wrap = el("label", "materials-filter");
    wrap.append(el("span", "", label));
    const select = document.createElement("select");
    for (const option of options) {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      select.append(node);
    }
    select.value = value;
    select.addEventListener("change", () => onChange(select.value));
    wrap.append(select);
    return wrap;
  }

  function filteredMaterials() {
    const query = filters.query.toLocaleLowerCase("ru-RU");
    return materials.filter(item => {
      if (filters.type !== "all" && item.material_type !== filters.type) return false;
      if (filters.caseId !== "all" && item.case_id !== filters.caseId) return false;
      if (filters.status === "unread" && item.is_read) return false;
      if (filters.status === "read" && !item.is_read) return false;
      if (filters.status === "draft" && !item.is_preview) return false;
      if (filters.status !== "draft" && filters.status !== "all" && item.is_preview) return false;
      if (query && ![item.title, item.summary, item.content, item.case_title, item.biography, item.relationships].some(value => String(value || "").toLocaleLowerCase("ru-RU").includes(query))) return false;
      return true;
    }).sort((a, b) => {
      if (filters.sort === "newest" || filters.sort === "oldest") {
        const delta = new Date(a.created_at || 0) - new Date(b.created_at || 0);
        return filters.sort === "newest" ? -delta : delta;
      }
      return (a.release_order || 0) - (b.release_order || 0) || String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });
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
          render();
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

  function render() {
    root.replaceChildren();
    const toolbar = el("div", "materials-toolbar");
    const searchWrap = el("label", "materials-search");
    searchWrap.append(el("span", "", "ПОИСК ПО НАЗВАНИЮ И СОДЕРЖАНИЮ"));
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Введите ключевое слово…";
    search.value = filters.query;
    search.addEventListener("input", () => {
      filters.query = search.value;
      renderContent();
    });
    searchWrap.append(search);
    toolbar.append(searchWrap);

    const cases = [{ value: "all", label: "Все дела" }];
    const caseMap = new Map();
    for (const item of materials) if (item.case_id) caseMap.set(item.case_id, item.case_title || "Дело");
    for (const [value, label] of caseMap) cases.push({ value, label });
    toolbar.append(makeSelect("ДЕЛО", cases, filters.caseId, value => { filters.caseId = value; renderContent(); }));

    const types = [
      { value: "all", label: "Все типы" },
      { value: "document", label: "Документы" },
      { value: "dossier", label: "Досье людей" },
      { value: "publication", label: "Публикации" },
      { value: "photo", label: "Фотографии" },
      { value: "audio", label: "Аудиозаписи" },
      { value: "map", label: "Карты и схемы" },
      { value: "other", label: "Другое" }
    ];
    toolbar.append(makeSelect("ТИП", types, filters.type, value => { filters.type = value; renderContent(); }));
    const statusOptions = [
      { value: "all", label: "Все материалы" },
      { value: "unread", label: "Не изучено" },
      { value: "read", label: "Изучено" },
      ...(materials.some(item => item.is_preview) ? [{ value: "draft", label: "Черновики (предпросмотр)" }] : [])
    ];
    toolbar.append(makeSelect("СОСТОЯНИЕ", statusOptions, filters.status, value => { filters.status = value; renderContent(); }));
    const sortOptions = [
      { value: "order", label: "По порядку дела" },
      { value: "newest", label: "Сначала новые" },
      { value: "oldest", label: "Сначала старые" }
    ];
    toolbar.append(makeSelect("СОРТИРОВКА", sortOptions, filters.sort, value => { filters.sort = value; renderContent(); }));
    root.append(toolbar);

    const content = el("div", "materials-catalog-content");
    content.id = "materials-catalog-content";
    root.append(content);
    renderContent();
  }

  function renderContent() {
    const content = document.getElementById("materials-catalog-content");
    if (!content) return;
    content.replaceChildren();
    const listItems = filteredMaterials();
    const heading = el("div", "materials-catalog-heading");
    heading.append(el("span", "materials-catalog-kicker", "КАТАЛОГ МАТЕРИАЛОВ"));
    heading.append(el("span", "materials-catalog-count", listItems.length + " / " + materials.length));
    content.append(heading);

    if (!listItems.length) {
      content.append(el("p", "materials-empty", "Материалы по выбранным условиям не найдены."));
      return;
    }
    if (!listItems.some(item => item.id === selectedId)) selectedId = listItems[0].id;
    const layout = el("div", "materials-catalog-layout");
    const list = el("div", "materials-catalog-list");
    for (const item of listItems) {
      const button = el("button", "materials-catalog-entry" + (item.id === selectedId ? " is-active" : ""));
      button.type = "button";
      button.setAttribute("aria-pressed", item.id === selectedId ? "true" : "false");
      button.append(el("span", "materials-entry-type", item.is_preview ? "ЧЕРНОВИК" : labels[item.material_type] || "МАТЕРИАЛ"));
      button.append(el("strong", "materials-entry-title", item.title));
      button.append(el("span", "materials-entry-case", item.case_title || "Дело"));
      button.append(el("span", "materials-entry-date", dateLabel(item.created_at)));
      button.append(el("span", "materials-entry-status", item.is_preview ? "ПРЕДПРОСМОТР" : item.is_read ? "ИЗУЧЕНО" : "НОВОЕ"));
      button.addEventListener("click", () => { selectedId = item.id; renderContent(); });
      list.append(button);
    }
    layout.append(list, renderReader(listItems.find(item => item.id === selectedId)));
    content.append(layout);
  }

  window.renderMaterialsArchive = function(items) {
    materials = (items || []).filter(item => item.material_type !== "email");
    if (!materials.some(item => item.id === selectedId)) selectedId = materials[0]?.id || null;
    if (!materials.length) {
      root.replaceChildren(el("p", "materials-empty", "Других открытых материалов пока нет."));
      return;
    }
    render();
  };
})();