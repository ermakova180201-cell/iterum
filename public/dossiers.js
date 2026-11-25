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

  const linkedFileInput = byId("dossier-files-input");
  const linkedFileUpload = byId("dossier-files-upload");
  const linkedFileList = byId("dossier-files-list");
  const linkedFileMessage = byId("dossier-files-message");
  function attachmentNote(message, isError) {
    linkedFileMessage.textContent = message || "";
    linkedFileMessage.style.color = isError ? "#e9a8a1" : "#c4b18d";
  }
  async function refreshAttachedFiles() {
    const dossierId = editingId;
    if (!dossierId) {
      linkedFileInput.disabled = true;
      linkedFileUpload.disabled = true;
      linkedFileInput.value = "";
      linkedFileList.replaceChildren(element("p", "dossier-note", "Сначала сохраните досье, затем прикрепляйте документы."));
      attachmentNote("");
      return;
    }
    linkedFileInput.disabled = false;
    linkedFileUpload.disabled = false;
    linkedFileList.replaceChildren(element("p", "dossier-note", "Загрузка вложений…"));
    try {
      const data = await api("/api/admin/dossiers/" + dossierId + "/files");
      if (editingId !== dossierId) return;
      linkedFileList.replaceChildren();
      if (!Array.isArray(data.files) || !data.files.length) {
        linkedFileList.append(element("p", "dossier-note", "Документы ещё не прикреплены."));
        return;
      }
      for (const file of data.files) {
        const wrap = element("div", "dossier-file-admin-row");
        const name = element("div", "dossier-file-admin-name");
        name.append(element("strong", "", file.file_name));
        const amount = Math.max(1, Math.ceil((file.file_size || 0) / 1024));
        name.append(element("small", "", amount + " КБ · " + (file.is_published === 1 ? "ВИДНО ИГРОКУ" : "ЧЕРНОВИК")));
        const controls = element("div", "dossier-file-admin-actions");
        const link = element("a", "", "Просмотреть");
        link.href = "/api/dossier-files/" + encodeURIComponent(file.id);
        link.target = "_blank";
        link.rel = "noopener";
        const toggle = element("button", "", file.is_published === 1 ? "Скрыть" : "Опубликовать");
        toggle.type = "button";
        toggle.addEventListener("click", async () => {
          toggle.disabled = true;
          try {
            await api("/api/admin/dossier-files/" + file.id + "/publish", {
              method: "PATCH", headers: { "content-type": "application/json" },
              body: JSON.stringify({ isPublished: file.is_published !== 1 })
            });
            await refreshAttachedFiles();
            attachmentNote(file.is_published === 1 ? "Документ скрыт от игроков." : "Документ опубликован: он доступен игроку после открытия досье.");
          } catch (error) {
            toggle.disabled = false;
            attachmentNote(error.message, true);
          }
        });
        const remove = element("button", "", "Удалить");
        remove.type = "button";
        remove.addEventListener("click", async () => {
          if (!confirm("Удалить документ «" + file.file_name + "» из досье?")) return;
          remove.disabled = true;
          try {
            await api("/api/admin/dossier-files/" + file.id, { method: "DELETE" });
            await refreshAttachedFiles();
            attachmentNote("Документ удалён.");
          } catch (error) {
            remove.disabled = false;
            attachmentNote(error.message, true);
          }
        });
        controls.append(link, toggle, remove);
        wrap.append(name, controls);
        linkedFileList.append(wrap);
      }
    } catch (error) {
      if (editingId !== dossierId) return;
      linkedFileList.replaceChildren(element("p", "dossier-note", "Не удалось загрузить файлы."));
      attachmentNote(error.message, true);
    }
  }
  linkedFileUpload.addEventListener("click", async () => {
    if (!editingId) { attachmentNote("Сначала сохраните новое досье.", true); return; }
    const files = Array.from(linkedFileInput.files || []);
    if (!files.length) { attachmentNote("Выберите хотя бы один файл.", true); return; }
    if (files.length > 8) { attachmentNote("За один раз можно добавить до 8 документов.", true); return; }
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (files.some(f => !allowed.includes(f.type) || f.size > 1024 * 1024)) {
      attachmentNote("Допустимые форматы: PDF, JPG, PNG, WEBP, размер каждого — до 1 МБ.", true);
      return;
    }
    const dossierId = editingId;
    const form = new FormData();
    for (const file of files) form.append("files", file);
    linkedFileUpload.disabled = true;
    attachmentNote("Сохраняем вложения…");
    try {
      await api("/api/admin/dossiers/" + dossierId + "/files", { method: "POST", body: form });
      if (editingId !== dossierId) return;
      linkedFileInput.value = "";
      await refreshAttachedFiles();
      attachmentNote("Файлы добавлены как черновики. Чтобы показать их игрокам, нажмите «Опубликовать» напротив каждого документа.");
    } catch (error) {
      attachmentNote(error.message, true);
    } finally {
      linkedFileUpload.disabled = !editingId;
    }
  });

  function resetForm() {
    const selectedCase = caseSelect.value;
    adminForm.reset();
    if ([...caseSelect.options].some(x => x.value === selectedCase)) caseSelect.value = selectedCase;
    currentPhoto = "";
    editingId = null;
    refreshAttachedFiles();
    showPhoto("");
    byId("dossier-legacy").hidden = true;
    byId("dossier-legacy-text").textContent = "";
    byId("dossier-form-heading").textContent = "Новое досье";
    byId("dossier-delete").hidden = true;
    note("Создание нового досье. Сначала оно будет сохранено как черновик.");
  }
  function editDossier(d) {
    editingId = d.id;
    for (const key of ["fullName", "birthDate", "residence", "occupation", "workplace",
      "maritalStatus", "spouse", "children", "lifeStatus", "biography", "authorNotes"]) {
      const dbKey = key.replace(/[A-Z]/g, match => "_" + match.toLowerCase());
      field(key).value = d[dbKey] || "";
    }
    const legacy = byId("dossier-legacy");
    const legacyText = [
      ["Роль в расследовании", d.role_name], ["Другие связи", d.relationships],
      ["Хронология", d.chronology], ["Связанные материалы", d.related_materials]
    ].filter(item => item[1]).map(item => item[0] + ":\n" + item[1]).join("\n\n");
    legacy.hidden = !legacyText;
    byId("dossier-legacy-text").textContent = legacyText;
    caseSelect.value = d.case_id;
    field("isPublished").checked = d.is_published === 1;
    currentPhoto = d.photo_data || "";
    photoInput.value = "";
    showPhoto(currentPhoto);
    byId("dossier-form-heading").textContent = "Редактирование: " + d.full_name;
    byId("dossier-delete").hidden = false;
    adminForm.scrollIntoView({ block: "start", behavior: "smooth" });
    note("Изменения не появятся у игроков, пока досье не опубликовано.");
    refreshAttachedFiles();
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
      btn.append(element("small", "", (d.case_title || "") + (d.life_status ? " · " + d.life_status : "")));
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
      for (const key of ["fullName","birthDate","residence","occupation","workplace",
        "maritalStatus","spouse","children","lifeStatus","biography","authorNotes"]) {
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
