/* ITERUM / Archive query interface v2 — documents and people */
(() => {
  "use strict";
  const form = document.getElementById("player-search-form");
  const results = document.getElementById("player-search-results");
  const queryInput = document.getElementById("player-search-query");
  const filters = document.getElementById("player-search-filters");
  const summary = document.getElementById("player-search-summary");
  if (!form || !results || !queryInput || !filters || !summary) return;

  let allResults = [];
  let activeId = null;
  let activeFilter = "all";

  const labelCount = n => n === 1 ? "1 запись" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14))
    ? n + " записи" : n + " записей";
  const kind = item => item.result_type === "person" ? "person" : "material";
  const key = item => kind(item) + ":" + item.id;

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }
  function showState(title, message, variant = "") {
    results.replaceChildren();
    const state = node("div", "search-ui-state" + (variant ? " " + variant : ""));
    state.append(node("div", "search-ui-state-symbol", variant === "is-loading" ? "⌁" : "⌕"));
    state.append(node("strong", "", title));
    state.append(node("p", "", message));
    results.append(state);
  }
  function updateSummary(text) {
    summary.textContent = text;
  }

  function dataBlock(label, value) {
    if (!value) return null;
    const item = node("div", "search-person-data-row");
    item.append(node("span", "search-person-data-label", label));
    item.append(node("strong", "search-person-data-value", value));
    return item;
  }
  function renderPersonReader(person) {
    const reader = node("article", "search-dossier-reader search-person-reader");
    const bar = node("div", "search-reader-overline");
    bar.append(node("span", "search-reader-kicker", "АРХИВ / ЛИЧНОЕ ДЕЛО"));
    bar.append(node("span", "search-reader-id", "ID " + String(person.id).slice(0, 8).toUpperCase()));
    reader.append(bar);

    const heading = node("div", "search-person-heading");
    if (person.photo_data) {
      const img = node("img", "search-person-photo");
      img.src = person.photo_data;
      img.alt = "Фотография: " + person.title;
      heading.append(img);
    } else {
      const placeholder = node("span", "search-person-silhouette");
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.textContent = "◌";
      heading.append(placeholder);
    }
    const info = node("div", "search-person-heading-text");
    info.append(node("span", "search-type-caption", "КАРТОЧКА ПЕРСОНЫ"));
    info.append(node("h3", "search-reader-title", person.title));
    info.append(node("p", "search-reader-meta", person.summary || "Роль не указана"));
    const state = node("span", "search-reader-status is-open", person.is_preview ? "ЧЕРНОВИК · ТОЛЬКО ДЛЯ АВТОРА" : "ДОСЬЕ ДОСТУПНО");
    info.append(state);
    heading.append(info);
    reader.append(heading);

    const facts = node("div", "search-person-data");
    const birth = dataBlock("ДАТА РОЖДЕНИЯ", person.birth_date);
    const job = dataBlock("ПРОФЕССИЯ", person.occupation);
    if (birth) facts.append(birth);
    if (job) facts.append(job);
    if (facts.childElementCount) reader.append(facts);

    for (const [title, value, number] of [
      ["Биография", person.biography, "01"],
      ["Связи с людьми", person.relationships, "02"],
      ["Хронология", person.chronology, "03"],
      ["Связанные материалы", person.related_materials, "04"]
    ]) {
      if (!value) continue;
      const section = node("section", "search-person-section");
      const head = node("div", "search-section-heading");
      head.append(node("span", "", number));
      head.append(node("h4", "", title));
      section.append(head);
      section.append(node("p", "search-person-prose", value));
      reader.append(section);
    }
    return reader;
  }

  function renderMaterialReader(item) {
    const read = Boolean(item.is_read);
    const reader = node("article", "search-dossier-reader search-material-reader");
    const top = node("div", "search-reader-overline");
    top.append(node("span", "search-reader-kicker",
      item.is_preview ? "ПРЕДПРОСМОТР / МАТЕРИАЛ" : "АРХИВ / МАТЕРИАЛ ДЕЛА"));
    top.append(node("span", "search-reader-id", "ID " + String(item.id).slice(0, 8).toUpperCase()));
    reader.append(top);
    reader.append(node("span", "search-type-caption", "ЦИФРОВОЕ ВЛОЖЕНИЕ"));
    reader.append(node("h3", "search-reader-title", item.title));
    reader.append(node("p", "search-reader-meta", item.case_title || "Текущее дело"));
    if (item.summary) reader.append(node("p", "search-reader-summary", item.summary));
    reader.append(node("span", "search-reader-status" + (read ? " is-open" : ""),
      item.is_preview ? "ЧЕРНОВИК · ТОЛЬКО ДЛЯ АВТОРА" : read ? "МАТЕРИАЛ ИЗУЧЕН" : "НЕ ИЗУЧЕНО"));

    if (read) {
      reader.append(node("div", "search-reader-divider"));
      reader.append(node("div", "search-reader-content", item.content || "Текст материала отсутствует."));
    } else {
      reader.append(node("p", "search-reader-hint",
        "Откройте документ, чтобы изучить его содержимое. Просмотр будет отмечен в материалах расследования."));
      const open = node("button", "admin-mini-button search-open-button", "ОТКРЫТЬ МАТЕРИАЛ");
      open.type = "button";
      open.addEventListener("click", async () => {
        open.disabled = true;
        open.textContent = "ОТКРЫВАЕМ…";
        try {
          const response = await fetch("/api/player/materials/" + encodeURIComponent(item.id) + "/read", {
            method: "POST", credentials: "same-origin"
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw Error(data.error || "Не удалось открыть материал.");
          item.is_read = 1;
          renderResults(key(item));
        } catch (error) {
          open.disabled = false;
          open.textContent = "ПОВТОРИТЬ";
          const hint = reader.querySelector(".search-reader-hint");
          if (hint) { hint.textContent = error.message; hint.classList.add("is-error"); }
        }
      });
      reader.append(open);
    }
    return reader;
  }

  function visibleResults() {
    return activeFilter === "all" ? allResults
      : allResults.filter(item => kind(item) === activeFilter);
  }
  function renderFilters() {
    filters.replaceChildren();
    if (!allResults.length) { filters.hidden = true; return; }
    filters.hidden = false;
    const people = allResults.filter(x => kind(x) === "person").length;
    const materials = allResults.length - people;
    for (const [id, title, count] of [
      ["all", "Все", allResults.length],
      ["person", "Люди", people],
      ["material", "Документы", materials]
    ]) {
      const button = node("button", "search-filter" + (id === activeFilter ? " is-active" : ""));
      button.type = "button";
      button.setAttribute("aria-pressed", String(id === activeFilter));
      button.append(node("span", "", title));
      button.append(node("span", "search-filter-count", count));
      button.addEventListener("click", () => {
        if (activeFilter === id) return;
        activeFilter = id;
        activeId = null;
        renderFilters();
        renderResults();
      });
      filters.append(button);
    }
  }

  function renderResults(preferred = null) {
    results.replaceChildren();
    const items = visibleResults();
    updateSummary("НАЙДЕНО: " + labelCount(allResults.length).toUpperCase());
    if (!allResults.length) {
      showState("Совпадений не найдено", "Попробуйте другую фамилию, название документа или более короткий запрос.");
      return;
    }
    if (!items.length) {
      showState("В этой категории нет записей", "Попробуйте вкладку «Все» или измените поисковый запрос.");
      return;
    }
    const target = items.find(x => key(x) === (preferred || activeId)) || items[0];
    activeId = key(target);
    const header = node("div", "search-results-header");
    header.append(node("span", "search-results-label", "ОБНАРУЖЕННЫЕ ЗАПИСИ"));
    header.append(node("span", "search-results-count", labelCount(items.length)));
    results.append(header);
    const layout = node("div", "search-results-layout");
    const list = node("div", "search-result-list");
    list.setAttribute("aria-label", "Результаты запроса");
    for (const item of items) {
      const person = kind(item) === "person";
      const button = node("button", "search-result-entry" +
        (key(item) === activeId ? " is-active" : "") + (person ? " is-person" : ""));
      button.type = "button";
      button.setAttribute("aria-pressed", String(key(item) === activeId));
      const heading = node("span", "search-result-heading");
      heading.append(node("span", "search-result-glyph", person ? "◌" : "▤"));
      const text = node("span", "search-result-heading-text");
      text.append(node("strong", "search-result-name", item.title));
      text.append(node("span", "search-result-type",
        person ? "ПЕРСОНА" : "ДОКУМЕНТ"));
      heading.append(text);
      button.append(heading);
      if (item.summary) button.append(node("span", "search-result-description", item.summary));
      const footer = node("span", "search-result-footer");
      footer.append(node("span", "search-result-case", item.case_title || "Текущее дело"));
      footer.append(node("span", "search-result-state" + (item.is_read || person ? " is-open" : ""),
        item.is_preview ? "ЧЕРНОВИК" : person ? "ДОСЬЕ" : item.is_read ? "ИЗУЧЕНО" : "НЕ ИЗУЧЕНО"));
      button.append(footer);
      button.addEventListener("click", () => {
        if (key(item) === activeId) return;
        // Preserve list scroll position as the right pane is updated.
        const scrollTop = list.scrollTop;
        renderResults(key(item));
        const nextList = results.querySelector(".search-result-list");
        if (nextList) nextList.scrollTop = scrollTop;
      });
      list.append(button);
    }
    layout.append(list, kind(target) === "person" ? renderPersonReader(target) : renderMaterialReader(target));
    results.append(layout);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const query = queryInput.value.trim();
    if (query.length < 2) {
      updateSummary("ТРЕБУЕТСЯ ЗАПРОС");
      showState("Слишком короткий запрос", "Введите не менее двух символов.");
      return;
    }
    activeId = null;
    activeFilter = "all";
    allResults = [];
    renderFilters();
    updateSummary("ВЫПОЛНЯЕТСЯ ПОИСК…");
    showState("Обработка запроса", "Сверяем сведения с доступными записями архива.", "is-loading");
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const caseId = typeof window.iterumSelectedCaseId === "function"
        ? window.iterumSelectedCaseId() : "";
      const path = "/api/player/search?q=" + encodeURIComponent(query) +
        (caseId ? "&caseId=" + encodeURIComponent(caseId) : "");
      const response = await fetch(path, { credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(data.error || "Не удалось выполнить поиск.");
      allResults = Array.isArray(data.results) ? data.results : [];
      renderFilters();
      renderResults();
    } catch (error) {
      updateSummary("ОШИБКА ПОИСКА");
      showState("Не удалось выполнить поиск", error.message, "is-error");
    } finally {
      if (submit) submit.disabled = false;
    }
  }, true);

  updateSummary("ОЖИДАНИЕ ЗАПРОСА");
  showState("Начните расследование", "Введите фамилию человека, название документа или ключевое слово.");
})();
