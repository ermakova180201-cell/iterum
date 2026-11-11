(() => {
  const form = document.getElementById("player-search-form");
  const results = document.getElementById("player-search-results");
  const queryInput = document.getElementById("player-search-query");
  if (!form || !results || !queryInput) return;

  let activeId = null;
  let currentResults = [];

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function showMessage(message, modifier = "") {
    results.replaceChildren(node("p", "search-state " + modifier, message));
  }

  function renderPersonReader(person) {
    const reader = node("article", "search-dossier-reader search-person-reader");
    reader.append(node("span", "search-reader-kicker",
      person.is_preview ? "ПРЕДПРОСМОТР / ДОСЬЕ ПЕРСОНЫ" : "КАРТОТЕКА ПЕРСОН / ДОСЬЕ"));
    const heading = node("div", "search-person-heading");
    if (person.photo_data) {
      const photo = node("img", "search-person-photo");
      photo.src = person.photo_data;
      photo.alt = "Фотография: " + person.title;
      heading.append(photo);
    } else {
      heading.append(node("span", "search-person-silhouette", "◌"));
    }
    const info = node("div", "search-person-heading-text");
    info.append(node("h3", "search-reader-title", person.title));
    if (person.summary) info.append(node("p", "search-reader-meta", person.summary));
    info.append(node("p", "search-reader-meta", person.case_title || "Текущее дело"));
    heading.append(info);
    reader.append(heading);
    const details = [
      ["Дата рождения", person.birth_date],
      ["Профессия / работа", person.occupation]
    ];
    for (const [label, value] of details) {
      if (!value) continue;
      const row = node("p", "search-person-fact");
      row.append(node("strong", "", label + ": "));
      row.append(document.createTextNode(value));
      reader.append(row);
    }
    for (const [headingText, value] of [
      ["Биография", person.biography],
      ["Связи с людьми", person.relationships],
      ["Хронология", person.chronology],
      ["Связанные материалы", person.related_materials]
    ]) {
      if (!value) continue;
      const section = node("section", "search-person-section");
      section.append(node("h4", "", headingText));
      section.append(node("p", "search-person-prose", value));
      reader.append(section);
    }
    if (person.is_preview) reader.append(node("span", "search-reader-status", "ЧЕРНОВИК / ВИДЕН ТОЛЬКО АДМИНИСТРАТОРУ"));
    return reader;
  }

  function renderReader(item, opened = Boolean(item.is_read)) {
    if (item.result_type === "person") return renderPersonReader(item);
    const reader = node("article", "search-dossier-reader");
    const eyebrow = node("span", "search-reader-kicker", item.is_preview ? "ПРЕДПРОСМОТР ЧЕРНОВИКА" : "МАТЕРИАЛ ДЕЛА");
    const title = node("h3", "search-reader-title", item.title);
    const meta = node("p", "search-reader-meta", item.case_title || "Текущее дело");
    const summary = node("p", "search-reader-summary", item.summary || "Краткое описание отсутствует.");
    const status = node("span", "search-reader-status" + (opened ? " is-open" : ""), item.is_preview ? "ЧЕРНОВИК / ПРЕДПРОСМОТР" : opened ? "ДОСЬЕ ОТКРЫТО" : "ДОСТУПНО К ОЗНАКОМЛЕНИЮ");
    reader.append(eyebrow, title, meta, summary, status);

    if (opened) {
      reader.append(node("div", "search-reader-divider"));
      reader.append(node("div", "search-reader-content", item.content || "Содержание досье не добавлено."));
    } else {
      const hint = node("p", "search-reader-hint", "Полный текст будет доступен после открытия досье. Открытие фиксируется в материалах расследования.");
      const open = node("button", "admin-mini-button search-open-button", "ОТКРЫТЬ ДОСЬЕ");
      open.type = "button";
      open.addEventListener("click", async () => {
        open.disabled = true;
        open.textContent = "ОТКРЫВАЕМ…";
        try {
          const response = await fetch("/api/player/materials/" + encodeURIComponent(item.id) + "/read", {
            method: "POST",
            credentials: "same-origin"
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Не удалось открыть досье.");
          item.is_read = 1;
          renderResults(currentResults, item.id);
        } catch (error) {
          open.disabled = false;
          open.textContent = "ПОВТОРИТЬ";
          hint.textContent = error.message;
          hint.classList.add("is-error");
        }
      });
      reader.append(hint, open);
    }
    return reader;
  }

  function renderResults(items, selectedId = null) {
    currentResults = items;
    results.replaceChildren();
    if (!items.length) {
      showMessage("По вашему запросу ничего не найдено. Попробуйте другое имя или ключевое слово.");
      return;
    }

    const header = node("div", "search-results-header");
    header.append(node("span", "search-results-label", "РЕЗУЛЬТАТЫ ПОИСКА"));
    header.append(node("span", "search-results-count", items.length + " НАЙДЕНО"));
    results.append(header);

    const layout = node("div", "search-results-layout");
    const list = node("div", "search-result-list");
    const item = items.find(entry => entry.id === selectedId) || items[0];
    activeId = item.id;

    for (const entry of items) {
      const button = node("button", "search-result-entry" + (entry.id === activeId ? " is-active" : "") + (entry.result_type === "person" ? " is-person" : ""));
      button.type = "button";
      button.setAttribute("aria-pressed", entry.id === activeId ? "true" : "false");
      const name = node("strong", "search-result-name", entry.title);
      const caseName = node("span", "search-result-case", entry.case_title || "Текущее дело");
      const description = node("span", "search-result-description", entry.summary || "Без краткого описания");
      const isPerson = entry.result_type === "person";
      const stateLabel = entry.is_preview ? "ЧЕРНОВИК" : isPerson ? "ДОСЬЕ ПЕРСОНЫ" : entry.is_read ? "ИЗУЧЕНО" : "НЕ ИЗУЧЕНО";
      const state = node("span", "search-result-state" + (isPerson || entry.is_read ? " is-open" : ""), stateLabel);
      button.append(name, caseName, description, state);
      button.addEventListener("click", () => renderResults(currentResults, entry.id));
      list.append(button);
    }

    layout.append(list, renderReader(item));
    results.append(layout);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const query = queryInput.value.trim();
    if (query.length < 2) {
      showMessage("Введите не менее двух символов.");
      return;
    }

    activeId = null;
    showMessage("Выполняется поиск по материалам и картотеке персон…", "is-loading");
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const caseId = typeof window.iterumSelectedCaseId === "function" ? window.iterumSelectedCaseId() : "";
      const searchUrl = "/api/player/search?q=" + encodeURIComponent(query) + (caseId ? "&caseId=" + encodeURIComponent(caseId) : "");
      const response = await fetch(searchUrl, {
        credentials: "same-origin"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Поиск не выполнен.");
      renderResults(data.results || []);
    } catch (error) {
      showMessage(error.message, "is-error");
    } finally {
      if (submit) submit.disabled = false;
    }
  }, true);

  showMessage("Введите имя, фамилию, должность или ключевое слово — поиск охватывает досье людей и документы дела.");
})();