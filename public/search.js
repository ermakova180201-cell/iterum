/* ITERUM • Search Data v3: a case-scoped personnel catalogue, not a second document archive. */
(() => {
  "use strict";
  const form = document.getElementById("player-search-form");
  const input = document.getElementById("player-search-query");
  const results = document.getElementById("player-search-results");
  const summary = document.getElementById("player-search-summary");
  if (!form || !input || !results || !summary) return;

  let records = [];
  let activeId = null;
  let lastCaseId = null;
  let serial = 0;

  function el(tag, className = "", text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = String(text);
    return result;
  }
  function getCaseId() {
    return typeof window.iterumSelectedCaseId === "function"
      ? window.iterumSelectedCaseId() : null;
  }
  function setStatus(value) { summary.textContent = value; }
  function declension(n) {
    const x = n % 100, last = n % 10;
    return n + " " + (x >= 11 && x <= 14 ? "досье"
      : last === 1 ? "досье" : "досье");
  }
  function welcome() {
    records = [];
    activeId = null;
    setStatus("ОЖИДАНИЕ ЗАПРОСА");
    results.replaceChildren();

    const page = el("div", "search-personnel-welcome");
    const intro = el("div", "search-personnel-welcome-center");
    intro.append(el("span", "search-personnel-welcome-icon", "⌕"));
    intro.append(el("strong", "", "Начните с имени"));
    intro.append(el("p", "", "Введите фамилию или имя, встретившееся в материалах дела. Досье откроется здесь."));
    page.append(intro);

    const guidance = el("div", "search-personnel-guides");
    const how = el("div", "search-personnel-guide");
    how.append(el("span", "search-personnel-guide-code", "01 / ПОИСК"));
    how.append(el("strong", "", "Не нужно полное ФИО"));
    how.append(el("p", "", "Достаточно части фамилии, имени или профессии. Например, имени, упомянутого в показаниях."));
    guidance.append(how);

    const where = el("div", "search-personnel-guide");
    where.append(el("span", "search-personnel-guide-code", "02 / ДОКУМЕНТЫ"));
    where.append(el("strong", "", "Где искать улики?"));
    where.append(el("p", "", "Письма, отчёты, фотографии и другие доказательства находятся отдельно — в «Материалах дела»."));
    const open = el("button", "search-personnel-open-materials", "ОТКРЫТЬ МАТЕРИАЛЫ ДЕЛА");
    open.type = "button";
    open.addEventListener("click", () => {
      const shortcut = document.querySelector('[data-open-window="materials-window"]');
      if (shortcut) shortcut.click();
    });
    where.append(open);
    guidance.append(where);
    page.append(guidance);
    results.append(page);
  }
  function state(title, detail, type = "") {
    results.replaceChildren();
    const box = el("div", "search-personnel-empty" + (type ? " " + type : ""));
    box.append(el("div", "search-personnel-empty-glyph", type === "is-loading" ? "⌁" : "⌕"));
    box.append(el("strong", "", title));
    box.append(el("p", "", detail));
    results.append(box);
  }
  function row(label, value) {
    if (!value) return null;
    const item = el("div", "search-personnel-fact");
    item.append(el("span", "search-personnel-fact-label", label));
    item.append(el("strong", "search-personnel-fact-value", value));
    return item;
  }
  function avatar(item, big = false) {
    if (item.photo_data) {
      const img = el("img", big ? "search-person-photo" : "search-personnel-avatar");
      img.alt = big ? "Фотография: " + item.title : "";
      img.src = item.photo_data;
      img.loading = "lazy";
      return img;
    }
    const placeholder = el("span", big ? "search-person-silhouette" : "search-personnel-avatar-placeholder", "◌");
    placeholder.setAttribute("aria-hidden", "true");
    return placeholder;
  }
  function detail(person) {
    const card = el("article", "search-dossier-reader search-person-reader");
    const over = el("div", "search-reader-overline");
    over.append(el("span", "search-reader-kicker", "ЛИЧНОЕ ДЕЛО / КАРТОТЕКА"));
    over.append(el("span", "search-reader-id", "№ " + String(person.id).slice(0, 8).toUpperCase()));
    card.append(over);

    const header = el("div", "search-person-heading");
    header.append(avatar(person, true));
    const headInfo = el("div", "search-person-heading-text");
    headInfo.append(el("span", "search-type-caption", "СВЕДЕНИЯ О ПЕРСОНЕ"));
    headInfo.append(el("h3", "search-reader-title", person.title));
    if (person.summary) headInfo.append(el("p", "search-reader-meta", person.summary));
    headInfo.append(el("span", "search-reader-status is-open",
      person.is_preview ? "ЧЕРНОВИК · ТОЛЬКО ДЛЯ АВТОРА" : "ДОСЬЕ ДОСТУПНО"));
    header.append(headInfo);
    card.append(header);

    const facts = el("div", "search-person-data");
    const birthday = row("ДАТА РОЖДЕНИЯ", person.birth_date);
    const occupation = row("МЕСТО РАБОТЫ / ПРОФЕССИЯ", person.occupation);
    if (birthday) facts.append(birthday);
    if (occupation) facts.append(occupation);
    if (facts.childElementCount) card.append(facts);

    for (const [number, title, content] of [
      ["01", "Биография", person.biography],
      ["02", "Связи с людьми", person.relationships],
      ["03", "Хронология", person.chronology],
      ["04", "Связанные материалы", person.related_materials]
    ]) {
      if (!content) continue;
      const section = el("section", "search-person-section");
      const heading = el("div", "search-section-heading");
      heading.append(el("span", "", number));
      heading.append(el("h4", "", title));
      section.append(heading);
      section.append(el("p", "search-person-prose", content));
      card.append(section);
    }
    return card;
  }
  function render(preferredId) {
    if (!records.length) {
      setStatus("НЕТ СОВПАДЕНИЙ");
      state("Досье не найдено", "Попробуйте другую фамилию, имя или часть слова. Новые карточки могут появиться по мере расследования.");
      return;
    }
    results.replaceChildren();
    const selected = records.find(x => x.id === (preferredId || activeId)) || records[0];
    activeId = selected.id;
    setStatus("НАЙДЕНО: " + declension(records.length).toUpperCase());

    const top = el("div", "search-results-header");
    top.append(el("span", "search-results-label", "НАЙДЕННЫЕ ПЕРСОНЫ"));
    top.append(el("span", "search-results-count", declension(records.length)));
    results.append(top);

    const layout = el("div", "search-results-layout");
    const list = el("div", "search-result-list");
    list.setAttribute("aria-label", "Найденные люди");
    for (const person of records) {
      const item = el("button", "search-result-entry is-person" + (person.id === activeId ? " is-active" : ""));
      item.type = "button";
      item.setAttribute("aria-pressed", String(person.id === activeId));
      const row = el("span", "search-result-heading");
      row.append(avatar(person));
      const wrap = el("span", "search-result-heading-text");
      wrap.append(el("strong", "search-result-name", person.title));
      wrap.append(el("span", "search-result-type", "ДОСЬЕ ПЕРСОНЫ"));
      row.append(wrap);
      item.append(row);
      if (person.summary) item.append(el("span", "search-result-description", person.summary));
      item.append(el("span", "search-result-state is-open", person.is_preview ? "ЧЕРНОВИК" : "ОТКРЫТЬ ДОСЬЕ"));
      item.addEventListener("click", () => {
        const previousScroll = list.scrollTop;
        render(person.id);
        const nextList = results.querySelector(".search-result-list");
        if (nextList) nextList.scrollTop = previousScroll;
      });
      list.append(item);
    }
    layout.append(list, detail(selected));
    results.append(layout);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const query = input.value.trim();
    if (query.length < 2) {
      setStatus("НЕДОСТАТОЧНО СИМВОЛОВ");
      state("Введите минимум два символа", "Можно использовать только часть имени или фамилии.");
      return;
    }
    const caseId = getCaseId();
    if (!caseId) {
      setStatus("ДЕЛО НЕ ВЫБРАНО");
      state("Сначала выберите дело", "Откройте дело на рабочем столе ITERUM и повторите запрос.");
      return;
    }
    const ticket = ++serial;
    setStatus("ПОИСК В КАРТОТЕКЕ…");
    state("Проверяем записи", "Поиск по опубликованным досье текущего дела.", "is-loading");
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const url = "/api/player/search?scope=people&q=" + encodeURIComponent(query) +
        "&caseId=" + encodeURIComponent(caseId);
      const response = await fetch(url, { credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(data.error || "Поиск временно недоступен.");
      if (ticket !== serial || getCaseId() !== caseId) return;
      records = Array.isArray(data.results) ? data.results.filter(x => x.result_type === "person") : [];
      activeId = null;
      render();
    } catch (error) {
      if (ticket !== serial) return;
      setStatus("ОШИБКА ПОИСКА");
      state("Не удалось получить сведения", error.message, "is-error");
    } finally {
      if (ticket === serial && submit) submit.disabled = false;
    }
  }, true);

  // Switching cases never lets one case's old search result remain visible in another.
  document.addEventListener("click", event => {
    if (!event.target.closest('[data-open-window="search-window"]')) return;
    const next = getCaseId();
    if (lastCaseId !== next) {
      serial += 1;
      lastCaseId = next;
      input.value = "";
      welcome();
    }
  });
  lastCaseId = getCaseId();
  welcome();
})();
