// ITERUM: person dossier editor + published case-scoped player cards.
(function () {
  "use strict";
  function byId(id) { return document.getElementById(id); }
  const admin = byId("admin-panel");
  const adminForm = byId("dossier-form");
  const adminList = byId("dossier-admin-list");
  const status = byId("dossier-status");
  const caseSelect = byId("dossier-case");
  const photoInput = byId("dossier-photo");
  const photoPreview = byId("dossier-photo-preview");
  let dossiers = [];
  let editingId = null;
  let currentPhoto = "";
  let loadedAdmin = false;

  async function api(url, options) {
    const response = await fetch(url, Object.assign({ credentials: "same-origin" }, options || {}));
    let data;
    try { data = await response.json(); } catch { throw Error("Сервер вернул неожиданный ответ."); }
    if (!response.ok) throw Error(data.error || "Не удалось выполнить запрос.");
    return data;
  }
  function note(message, error) {
    status.textContent = message || "";
    status.style.color = error ? "#e9a8a1" : "#c4b18d";
  }
  function element(tag, className, content) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = String(content);
    return el;
  }
  function field(name) { return adminForm.elements.namedItem(name); }
  function showPhoto(data) {
    photoPreview.hidden = !data;
    if (data) photoPreview.src = data; else photoPreview.removeAttribute("src");
  }
  function resetForm() {
    const selectedCase = caseSelect.value;
    adminForm.reset();
    if ([...caseSelect.options].some(x => x.value === selectedCase)) caseSelect.value = selectedCase;
    currentPhoto = "";
    editingId = null;
    showPhoto("");
    byId("dossier-form-heading").textContent = "Новое досье";
    byId("dossier-delete").hidden = true;
    note("Создание нового досье. Сначала оно будет сохранено как черновик.");
  }
  function editDossier(d) {
    editingId = d.id;
    for (const key of ["fullName", "roleName", "birthDate", "occupation", "biography",
      "relationships", "chronology", "relatedMaterials", "authorNotes"]) {
      const dbKey = key.replace(/[A-Z]/g, match => "_" + match.toLowerCase());
      field(key).value = d[dbKey] || "";
    }
    caseSelect.value = d.case_id;
    field("isPublished").checked = d.is_published === 1;
    currentPhoto = d.photo_data || "";
    photoInput.value = "";
    showPhoto(currentPhoto);
    byId("dossier-form-heading").textContent = "Редактирование: " + d.full_name;
    byId("dossier-delete").hidden = false;
    adminForm.scrollIntoView({ block: "start", behavior: "smooth" });
    note("Изменения не появятся у игроков, пока досье не опубликовано.");
  }
  function renderAdmin() {
    adminList.replaceChildren();
    if (!dossiers.length) {
      adminList.append(element("p", "dossier-note", "Досье пока нет. Нажмите «Новое досье»."));
      return;
    }
    for (const d of dossiers) {
      const btn = element("button", "dossier-admin-card");
      btn.type = "button";
      if (d.photo_data) {
        const img = element("img");
        img.src = d.photo_data;
        img.alt = "";
        btn.append(img);
      }
      btn.append(element("strong", "", d.full_name));
      btn.append(element("small", "", (d.case_title || "") + (d.role_name ? " · " + d.role_name : "")));
      btn.append(element("em", "", d.is_published === 1 ? "Опубликовано" : "Черновик"));
      btn.addEventListener("click", () => editDossier(d));
      adminList.append(btn);
    }
  }
  async function refreshAdmin() {
    const data = await api("/api/admin/dossiers");
    dossiers = data.dossiers || [];
    renderAdmin();
  }
  async function loadAdmin() {
    if (admin.hidden) return;
    try {
      await api("/api/admin/dossiers/initialize", { method: "POST" });
      const info = await api("/api/admin/overview");
      const old = caseSelect.value;
      caseSelect.replaceChildren();
      for (const c of (info.cases || [])) {
        const option = element("option", "", c.title + " · " + c.case_code);
        option.value = c.id;
        caseSelect.append(option);
      }
      if ([...caseSelect.options].some(x => x.value === old)) caseSelect.value = old;
      await refreshAdmin();
      loadedAdmin = true;
      if (!caseSelect.options.length) {
        note("Создайте дело в разделе управления архивом, затем добавьте досье.", true);
      } else {
        note("Досье сохраняются в базе сайта. Неопубликованные записи видны только администратору.");
      }
    } catch (error) { note(error.message, true); }
  }
  async function compressPhoto(file) {
    if (!file) return currentPhoto;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw Error("Для фотографии подходят JPG, PNG или WEBP.");
    }
    if (file.size > 5 * 1024 * 1024) throw Error("Исходная фотография должна быть меньше 5 МБ.");
    const localUrl = URL.createObjectURL(file);
    try {
      const picture = new Image();
      picture.src = localUrl;
      await picture.decode();
      const maxSide = 600;
      const ratio = Math.min(1, maxSide / Math.max(picture.naturalWidth, picture.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(picture.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(picture.naturalHeight * ratio));
      canvas.getContext("2d").drawImage(picture, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/webp", .78);
      if (data.length > 550000) throw Error("Фотография слишком большая даже после уменьшения.");
      return data;
    } finally { URL.revokeObjectURL(localUrl); }
  }
  photoInput.addEventListener("change", async () => {
    if (!photoInput.files[0]) return;
    try {
      currentPhoto = await compressPhoto(photoInput.files[0]);
      showPhoto(currentPhoto);
      note("Фотография готова. Нажмите «Сохранить досье».");
    } catch (error) { note(error.message, true); photoInput.value = ""; }
  });
  byId("dossier-remove-photo").addEventListener("click", () => {
    currentPhoto = "";
    photoInput.value = "";
    showPhoto("");
  });
  byId("dossier-new").addEventListener("click", resetForm);
  byId("dossier-refresh").addEventListener("click", loadAdmin);
  byId("dossier-delete").addEventListener("click", async () => {
    if (!editingId || !confirm("Удалить досье без возможности восстановления?")) return;
    try {
      await api("/api/admin/dossiers/" + editingId, { method: "DELETE" });
      resetForm();
      await refreshAdmin();
      note("Досье удалено.");
    } catch (error) { note(error.message, true); }
  });
  adminForm.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = byId("dossier-submit");
    const id = editingId;
    if (!caseSelect.value) { note("Сначала выберите дело.", true); return; }
    if (field("fullName").value.trim().split(/\s+/u).length < 2) {
      note("Укажите фамилию и имя. Игроку понадобятся оба слова для поиска.", true);
      field("fullName").focus();
      return;
    }
    submit.disabled = true;
    note("Сохраняем досье…");
    try {
      const payload = { caseId: caseSelect.value, photoData: currentPhoto,
        isPublished: field("isPublished").checked };
      for (const key of ["fullName","roleName","birthDate","occupation","biography",
        "relationships","chronology","relatedMaterials","authorNotes"]) {
        payload[key] = field(key).value;
      }
      const result = await api("/api/admin/dossiers" + (id ? "/" + id : ""), {
        method: id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      await refreshAdmin();
      const saved = dossiers.find(x => x.id === result.id);
      if (saved) editDossier(saved);
      note("Сохранено в базе ITERUM. " + (payload.isPublished
        ? "Опубликованная карточка видна игрокам активного дела."
        : "Черновик скрыт от игроков."));
    } catch (error) { note(error.message, true); }
    finally { submit.disabled = false; }
  });

  // Authentication state changes after login are reflected on the existing admin panel.
  const observer = new MutationObserver(() => {
    if (!admin.hidden && !loadedAdmin) loadAdmin();
    if (admin.hidden) loadedAdmin = false;
  });
  observer.observe(admin, { attributes: true, attributeFilter: ["hidden"] });
  if (!admin.hidden) loadAdmin();
})();
