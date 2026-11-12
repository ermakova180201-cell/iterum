/* ITERUM • Search Data v3: a case-scoped personnel catalogue, not a second document archive. */
(() => {
  "use strict";
  const form = document.getElementById("player-search-form");
  const firstInput = document.getElementById("player-search-first-name");
  const lastInput = document.getElementById("player-search-last-name");
  const results = document.getElementById("player-search-results");
  if (!form || !firstInput || !lastInput || !results) return;

  let records = [];
  let activeId = null;
  let lastCaseId = null;
  let serial = 0;
  let lastSearchedName = null;

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
  function welcome() {
    records = [];
    activeId = null;
    lastSearchedName = null;
    results.replaceChildren();

    const page = el("div", "search-personnel-welcome");
    const intro = el("div", "search-personnel-welcome-center");
    intro.append(el("span", "search-personnel-welcome-icon", "⌕"));
    intro.append(el("strong", "", "Введите имя и фамилию"));
    intro.append(el("p", "", "Чтобы открыть досье, введите имя и фамилию человека из материалов расследования."));
    page.append(intro);

    const guidance = el("div", "search-personnel-guides");
    const how = el("div", "search-personnel-guide");
    how.append(el("span", "search-personnel-guide-code", "01 / ПОИСК"));
    how.append(el("strong", "", "Укажите оба поля"));
    how.append(el("p", "", "Вводите имя и фамилию полностью. Отчество не требуется."));
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

  async function persistOpenedDossier(person, notice) {
    if (person.is_preview || !lastSearchedName) {
      notice.textContent = person.is_preview ? "ЧЕРНОВИК · ТОЛЬКО ДЛЯ АВТОРА" : "";
      return;
    }
    const { firstName, lastName, caseId } = lastSearchedName;
    notice.textContent = "СОХРАНЯЕМ В МАТЕРИАЛАХ ДЕЛА…";
    try {
      const response = await fetch(
        "/api/player/dossiers/" + encodeURIComponent(person.id) + "/discover",
        { method: "POST", credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ firstName, lastName, caseId }) }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(data.error || "Не удалось сохранить досье.");
      if (getCaseId() !== caseId) return;
      notice.textContent = "СОХРАНЕНО В «МАТЕРИАЛАХ ДЕЛА»";
      // Keep the existing Materials app in sync without reloading the entire
      // desktop, changing which window is open, or touching the inbox.
      const archiveResponse = await fetch("/api/player/archive", { credentials: "same-origin" });
      if (!archiveResponse.ok) return;
      const archiveData = await archiveResponse.json();
      if (getCaseId() !== caseId) return;
      if (typeof window.iterumUpdateCaseMaterials === "function") {
        window.iterumUpdateCaseMaterials(caseId, archiveData.materials || []);
      } else if (typeof window.renderMaterialsArchive === "function") {
        window.renderMaterialsArchive((archiveData.materials || []).filter(item =>
          item.case_id === caseId && item.material_type !== "email"));
      }
    } catch (error) {
      if (getCaseId() !== caseId) return;
      notice.textContent = "НЕ УДАЛОСЬ СОХРАНИТЬ: " + error.message;
      notice.classList.add("is-error");
    }
  }
  function showDossier(person, target) {
    target.replaceChildren(detail(person));
    if (person.is_preview) return;
    const note = el("p", "search-dossier-save-note", "СОХРАНЯЕМ В МАТЕРИАЛАХ ДЕЛА…");
    target.firstElementChild?.append(note);
    persistOpenedDossier(person, note);
  }

  function render(preferredId) {
    if (!records.length) {
        state("Досье не найдено", "Проверьте написание имени и фамилии. Досье может появиться по мере расследования.");
      return;
    }
    results.replaceChildren();
    const selected = records.find(x => x.id === (preferredId || activeId)) || records[0];
    activeId = selected.id;

    // A single match opens directly as a dossier — no redundant results sidebar.
    // For ambiguous names show one compact selector, not a separate result pane.
    if (records.length > 1) {
      const picker = el("div", "search-personnel-switcher");
      const info = el("div", "search-personnel-switcher-info");
      info.append(el("span", "search-personnel-switcher-kicker", "НЕСКОЛЬКО СОВПАДЕНИЙ"));
      info.append(el("p", "", "Выберите человека, чьё досье хотите открыть."));
      const control = el("div", "search-personnel-switcher-control");
      const label = el("label", "", "ПЕРСОНА");
      label.htmlFor = "search-personnel-picker";
      const select = el("select", "search-personnel-picker");
      select.id = "search-personnel-picker";
      for (const person of records) {
        const option = el("option", "", person.title + (person.summary ? " — " + person.summary : ""));
        option.value = person.id;
        select.append(option);
      }
      select.value = selected.id;
      control.append(label, select);
      picker.append(info, control);
      results.append(picker);
      select.addEventListener("change", () => {
        const next = records.find(person => person.id === select.value);
        if (!next) return;
        activeId = next.id;
        showDossier(next, profile);
      });
    }
    const profile = el("div", "search-personnel-profile");
    results.append(profile);
    showDossier(selected, profile);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const firstName = firstInput.value.trim();
    const lastName = lastInput.value.trim();
    if (firstName.length < 2 || lastName.length < 2) {
      state("Введите имя и фамилию", "Нужно заполнить оба поля полностью.");
      return;
    }
    const caseId = getCaseId();
    if (!caseId) {
      state("Сначала выберите дело", "Откройте дело на рабочем столе ITERUM и повторите запрос.");
      return;
    }
    const ticket = ++serial;
    state("Проверяем записи", "Поиск по опубликованным досье текущего дела.", "is-loading");
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const url = "/api/player/search?scope=people&firstName=" + encodeURIComponent(firstName) +
        "&lastName=" + encodeURIComponent(lastName) + "&caseId=" + encodeURIComponent(caseId);
      const response = await fetch(url, { credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(data.error || "Поиск временно недоступен.");
      if (ticket !== serial || getCaseId() !== caseId) return;
      records = Array.isArray(data.results) ? data.results.filter(x => x.result_type === "person") : [];
      lastSearchedName = { firstName, lastName, caseId };
      activeId = null;
      render();
    } catch (error) {
      if (ticket !== serial) return;
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
      firstInput.value = "";
      lastInput.value = "";
      welcome();
    }
  });
  lastCaseId = getCaseId();
  welcome();
})();
