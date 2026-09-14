(function () {
  "use strict";

  // Рисованные SVG-иконки вместо системных эмодзи (спрайт — в index.html).
  function svgIcon(name, extraClass) {
    return `<svg class="icon${extraClass ? " " + extraClass : ""}"><use href="#icon-${name}"/></svg>`;
  }

  // ---------- выбор группы ----------
  const GROUP_KEY = "scheduleApp:v1:group";
  let currentGroup = GROUPS.find((g) => g.id === localStorage.getItem(GROUP_KEY));

  const groupPicker = document.getElementById("groupPicker");
  const groupPickerList = document.getElementById("groupPickerList");
  const groupPickerCancel = document.getElementById("groupPickerCancel");
  const appRoot = document.querySelector(".app");

  // Стабильный цвет и инициалы группы — чтобы группы было проще различать
  // с первого взгляда, без привязки к произвольным настройкам.
  function groupHue(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return h;
  }
  function groupAvatarGradient(id) {
    const hue = groupHue(id);
    return `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 45) % 360} 70% 45%))`;
  }
  function groupInitials(name) {
    const words = name.trim().split(/\s+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
    return letters.toUpperCase();
  }

  function renderGroupPickerList() {
    groupPickerList.innerHTML = "";
    GROUPS.forEach((g) => {
      const btn = document.createElement("button");
      btn.className = "group-picker__item" + (currentGroup && g.id === currentGroup.id ? " is-current" : "");
      const directionLine = g.direction
        ? `<div class="group-picker__item-direction">${escapeHtml(g.direction)}${g.profile ? " · " + escapeHtml(g.profile) : ""}</div>`
        : "";
      btn.innerHTML =
        `<div class="group-picker__item-avatar" style="background:${groupAvatarGradient(g.id)}">${escapeHtml(groupInitials(g.group))}</div>` +
        `<div class="group-picker__item-text">` +
        `<div class="group-picker__item-name">${escapeHtml(g.group)}</div>` +
        `<div class="group-picker__item-code">${escapeHtml(g.groupCode)}</div>` +
        directionLine +
        `</div>`;
      btn.addEventListener("click", () => {
        localStorage.setItem(GROUP_KEY, g.id);
        location.reload();
      });
      groupPickerList.appendChild(btn);
    });
  }

  function showGroupPicker(allowCancel) {
    renderGroupPickerList();
    groupPickerCancel.classList.toggle("hidden", !allowCancel);
    groupPicker.classList.remove("hidden");
    appRoot.classList.add("hidden");
  }
  function hideGroupPicker() {
    groupPicker.classList.add("hidden");
    appRoot.classList.remove("hidden");
  }
  groupPickerCancel.addEventListener("click", hideGroupPicker);

  if (!currentGroup) {
    showGroupPicker(false);
    return; // ждём выбора группы — остальной код инициализации ниже не выполняется
  }
  hideGroupPicker();
  const SCHEDULE = currentGroup;

  const STORAGE_KEY = "scheduleApp:v1:entries";
  const THEME_KEY = "scheduleApp:v1:theme";
  const PARITY_KEY = "scheduleApp:v1:parity";
  const HIDDEN_KEY = "scheduleApp:v1:hidden";

  const DAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

  // ---------- storage ----------
  function loadEntries() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  let entries = loadEntries();
  function saveEntries() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }
  function lessonId(dayIdx, pair, sectionIdx) {
    return `${SCHEDULE.id}-${dayIdx}-${pair}-${sectionIdx}`;
  }
  function extraLessonId(dayIdx, pair, extraId) {
    return `${SCHEDULE.id}-${dayIdx}-${pair}-extra-${extraId}`;
  }
  // id для секции из merged-списка (может быть обычной из расписания или добавленной на неделю).
  function idForSection(dayIdx, pair, i, section) {
    return section.__extraId ? extraLessonId(dayIdx, pair, section.__extraId) : lessonId(dayIdx, pair, i);
  }
  function getEntry(id) {
    return entries[id] || { hw: "", note: "", done: false, topic: "", dueDate: "", materials: "" };
  }
  function setEntry(id, patch) {
    const current = getEntry(id);
    entries[id] = Object.assign({}, current, patch, { updatedAt: Date.now() });
    saveEntries();
  }

  // ---------- hidden lessons (не хожу / показать снова) ----------
  function loadHidden() {
    try {
      const arr = JSON.parse(localStorage.getItem(HIDDEN_KEY));
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) {
      return new Set();
    }
  }
  let hiddenLessons = loadHidden();
  function saveHidden() {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(hiddenLessons)));
  }
  function isHidden(id) {
    return hiddenLessons.has(id);
  }
  function setHidden(id, hide) {
    if (hide) hiddenLessons.add(id);
    else hiddenLessons.delete(id);
    saveHidden();
  }
  let showHiddenLessons = false;

  // ---------- разовые изменения на одну неделю (отмена пары / внеплановая пара) ----------
  const WEEK_OVERRIDES_KEY = "scheduleApp:v1:weekOverrides";
  function loadWeekOverrides() {
    try {
      return JSON.parse(localStorage.getItem(WEEK_OVERRIDES_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  let weekOverrides = loadWeekOverrides();
  function saveWeekOverrides() {
    localStorage.setItem(WEEK_OVERRIDES_KEY, JSON.stringify(weekOverrides));
  }
  function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  // Ключ текущей недели — понедельник этой недели (та же опорная точка, что у чётности).
  function currentWeekKey() {
    return `${SCHEDULE.id}:${isoDate(mondayOf(new Date()))}`;
  }
  function getWeekEntry(weekKey) {
    return weekOverrides[weekKey] || { cancelled: [], extra: [] };
  }
  function isCancelledThisWeek(id) {
    return getWeekEntry(currentWeekKey()).cancelled.includes(id);
  }
  function setCancelledThisWeek(id, cancelled) {
    const key = currentWeekKey();
    const entry = getWeekEntry(key);
    const set = new Set(entry.cancelled);
    if (cancelled) set.add(id);
    else set.delete(id);
    weekOverrides[key] = { cancelled: Array.from(set), extra: entry.extra };
    saveWeekOverrides();
  }
  function getExtrasForDay(dayIdx) {
    return getWeekEntry(currentWeekKey()).extra.filter((e) => e.dayIdx === dayIdx);
  }
  function addExtraLesson(dayIdx, section) {
    const key = currentWeekKey();
    const entry = getWeekEntry(key);
    const id = `x${Date.now()}${Math.floor(Math.random() * 1000)}`;
    weekOverrides[key] = { cancelled: entry.cancelled, extra: [...entry.extra, { id, dayIdx, ...section }] };
    saveWeekOverrides();
    return id;
  }
  function removeExtraLesson(weekKey, extraId) {
    const entry = weekOverrides[weekKey];
    if (!entry) return;
    weekOverrides[weekKey] = { cancelled: entry.cancelled, extra: entry.extra.filter((e) => e.id !== extraId) };
    saveWeekOverrides();
  }
  // Для вкладки «Домашние задания» — доп. пары ищем по всем неделям этой группы,
  // чтобы незакрытое задание не терялось, даже если сама пара была только на прошлой неделе.
  function allExtrasForGroup() {
    const prefix = `${SCHEDULE.id}:`;
    const results = [];
    Object.keys(weekOverrides).forEach((key) => {
      if (!key.startsWith(prefix)) return;
      (weekOverrides[key].extra || []).forEach((extra) => results.push({ weekKey: key, extra }));
    });
    return results;
  }
  // Пары дня с учётом добавленных на эту неделю — общая точка для расписания и баннера.
  function mergedPairsForDay(dayIdx) {
    const day = SCHEDULE.days[dayIdx];
    const merged = {};
    Object.keys(day.pairs).forEach((p) => {
      merged[Number(p)] = day.pairs[p].slice();
    });
    getExtrasForDay(dayIdx).forEach((ex) => {
      if (!merged[ex.pair]) merged[ex.pair] = [];
      merged[ex.pair].push({
        subject: ex.subject,
        type: ex.type,
        teacher: ex.teacher,
        room: ex.room,
        __extraId: ex.id,
      });
    });
    return merged;
  }

  // ---------- audio recordings (IndexedDB) ----------
  const DB_NAME = "scheduleAppDB";
  const DB_STORE = "recordings";
  let dbPromise = null;
  function openRecordingsDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) {
            const store = db.createObjectStore(DB_STORE, { keyPath: "recId", autoIncrement: true });
            store.createIndex("lessonId", "lessonId", { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function addRecording(lessonIdVal, blob, durationSec) {
    const db = await openRecordingsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const req = tx.objectStore(DB_STORE).add({ lessonId: lessonIdVal, blob, durationSec, createdAt: Date.now() });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function getRecordings(lessonIdVal) {
    const db = await openRecordingsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).index("lessonId").getAll(lessonIdVal);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function deleteRecording(recId) {
    const db = await openRecordingsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(recId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function formatDuration(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  function formatDateTime(ts) {
    return new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  function extFromMime(mime) {
    if (!mime) return "webm";
    if (mime.includes("mp4")) return "m4a";
    if (mime.includes("ogg")) return "ogg";
    return "webm";
  }
  function pickMimeType() {
    if (!window.MediaRecorder) return "";
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    return candidates.find((c) => MediaRecorder.isTypeSupported(c)) || "";
  }

  let activeRecording = null; // { id, recorder, chunks, startedAt, stream }

  function updateRecordButtonsUI() {
    document.querySelectorAll(".record-btn").forEach((btn) => {
      const id = btn.dataset.lessonId;
      const timerEl = btn.parentElement.querySelector(".record-timer");
      const isThis = activeRecording && activeRecording.id === id;
      btn.innerHTML = isThis ? svgIcon("stop") + " Остановить" : svgIcon("mic") + " Записать пару";
      btn.classList.toggle("is-recording", !!isThis);
      btn.disabled = !!activeRecording && !isThis;
      if (timerEl) timerEl.classList.toggle("hidden", !isThis);
    });
  }

  async function startRecording(id) {
    if (activeRecording) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Этот браузер не поддерживает запись аудио.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      alert("Не удалось получить доступ к микрофону: " + err.message);
      return;
    }
    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const chunks = [];
    recorder.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    });
    recorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const durationSec = Math.round((Date.now() - activeRecording.startedAt) / 1000);
      activeRecording = null;
      updateRecordButtonsUI();
      try {
        await addRecording(id, blob, durationSec);
      } catch (err) {
        alert("Не удалось сохранить запись: " + err.message);
        return;
      }
      const listEl = document.querySelector(`.recordings-list[data-lesson-id="${id}"]`);
      if (listEl) refreshRecordingsList(id, listEl);
      updateRecCountBadge();
    });
    activeRecording = { id, recorder, chunks, startedAt: Date.now(), stream };
    recorder.start();
    updateRecordButtonsUI();
  }

  function stopRecording() {
    if (activeRecording) activeRecording.recorder.stop();
  }

  window.addEventListener("beforeunload", (e) => {
    if (activeRecording) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  setInterval(() => {
    if (!activeRecording) return;
    const timerEl = document.querySelector(`.record-timer[data-lesson-id="${activeRecording.id}"]`);
    if (timerEl) timerEl.textContent = formatDuration((Date.now() - activeRecording.startedAt) / 1000);
  }, 500);

  // Общий "плеер" (audio + дата/длительность) для карточки записи —
  // используется и в паре расписания, и во вкладке «Записи».
  function buildRecordingPlayer(rec) {
    const audio = document.createElement("audio");
    audio.controls = true;
    const url = URL.createObjectURL(rec.blob);
    audio.src = url;
    const meta = document.createElement("div");
    meta.className = "recording-item__meta";
    meta.textContent = `${formatDateTime(rec.createdAt)} · ${formatDuration(rec.durationSec)}`;
    return { audio, meta, url };
  }

  // Общий блок кнопок (Скачать [+ Открыть] + Удалить) для карточки записи.
  function buildRecordingActions(rec, url, { filename, gotoHandler, onDelete }) {
    const actions = document.createElement("div");
    actions.className = "recording-item__actions";

    const dl = document.createElement("a");
    dl.className = "recording-item__btn recording-item__btn--primary";
    dl.innerHTML = svgIcon("download") + " Скачать";
    dl.href = url;
    dl.download = filename;
    actions.appendChild(dl);

    if (gotoHandler) {
      const goto = document.createElement("button");
      goto.type = "button";
      goto.className = "recording-item__btn";
      goto.textContent = "Открыть в расписании →";
      goto.addEventListener("click", gotoHandler);
      actions.appendChild(goto);
    }

    const del = document.createElement("button");
    del.type = "button";
    del.className = "recording-item__btn recording-item__btn--danger";
    del.innerHTML = svgIcon("trash") + " Удалить";
    del.addEventListener("click", async () => {
      if (!confirm("Удалить эту запись без возможности восстановления?")) return;
      await deleteRecording(rec.recId);
      URL.revokeObjectURL(url);
      await onDelete();
    });
    actions.appendChild(del);

    return actions;
  }

  function renderRecordingItem(rec) {
    const wrap = document.createElement("div");
    wrap.className = "recording-item";
    const { audio, meta, url } = buildRecordingPlayer(rec);
    wrap.appendChild(audio);
    wrap.appendChild(meta);
    wrap.appendChild(
      buildRecordingActions(rec, url, {
        filename: `запись-${rec.lessonId}-${rec.recId}.${extFromMime(rec.blob.type)}`,
        onDelete: async () => {
          wrap.remove();
          updateRecCountBadge();
        },
      })
    );
    return wrap;
  }

  async function refreshRecordingsList(id, listEl) {
    const recs = await getRecordings(id);
    listEl.innerHTML = "";
    recs
      .sort((a, b) => b.createdAt - a.createdAt)
      .forEach((rec) => listEl.appendChild(renderRecordingItem(rec)));
  }

  async function getAllRecordings() {
    const items = [];
    for (const [dayIdx, day] of SCHEDULE.days.entries()) {
      for (const pair of Object.keys(day.pairs).map(Number)) {
        for (const [sIdx, section] of day.pairs[pair].entries()) {
          const id = lessonId(dayIdx, pair, sIdx);
          const recs = await getRecordings(id);
          recs.forEach((rec) => items.push({ rec, dayIdx, pair, section, id, isExtra: false }));
        }
      }
    }
    for (const { weekKey, extra } of allExtrasForGroup()) {
      const id = extraLessonId(extra.dayIdx, extra.pair, extra.id);
      const recs = await getRecordings(id);
      const section = { subject: extra.subject, type: extra.type, teacher: extra.teacher, room: extra.room };
      recs.forEach((rec) =>
        items.push({ rec, dayIdx: extra.dayIdx, pair: extra.pair, section, id, isExtra: true, isCurrentWeek: weekKey === currentWeekKey() })
      );
    }
    return items;
  }

  async function updateRecCountBadge() {
    const items = await getAllRecordings();
    const badge = document.getElementById("recCount");
    if (items.length > 0) {
      badge.textContent = items.length;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  function buildRecordingCard(item) {
    const { rec, dayIdx, pair, section, id, isExtra, isCurrentWeek } = item;
    const card = document.createElement("article");
    card.className = "homework-card recording-card";

    const body = document.createElement("div");
    body.className = "homework-card__body";

    const meta = document.createElement("div");
    meta.className = "homework-card__meta";
    meta.textContent = `${SCHEDULE.days[dayIdx].name} · пара ${pair} · ${SCHEDULE.times[pair - 1]}`;
    if (isExtra) meta.textContent += " · добавлено на неделю";
    body.appendChild(meta);

    const subject = document.createElement("div");
    subject.className = "homework-card__subject";
    subject.textContent = sectionLabel(section);
    body.appendChild(subject);

    const { audio, meta: info, url } = buildRecordingPlayer(rec);
    audio.className = "recording-card__audio";
    body.appendChild(audio);
    body.appendChild(info);

    const actions = buildRecordingActions(rec, url, {
      filename: `запись-${SCHEDULE.days[dayIdx].name}-пара${pair}-${rec.recId}.${extFromMime(rec.blob.type)}`,
      gotoHandler: !isExtra || isCurrentWeek ? () => goToLesson(dayIdx, pair) : null,
      onDelete: async () => {
        card.remove();
        updateRecCountBadge();
        const listEl = document.querySelector(`.recordings-list[data-lesson-id="${id}"]`);
        if (listEl) refreshRecordingsList(id, listEl);
        if (!document.querySelectorAll(".recording-card").length) {
          document.getElementById("recordingsEmpty").classList.remove("hidden");
        }
      },
    });

    body.appendChild(actions);
    card.appendChild(body);
    return card;
  }

  async function renderRecordingsListView() {
    const list = document.getElementById("recordingsListView");
    const empty = document.getElementById("recordingsEmpty");
    const items = await getAllRecordings();
    updateRecCountBadge();
    list.innerHTML = "";
    if (!items.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    items
      .sort((a, b) => b.rec.createdAt - a.rec.createdAt)
      .forEach((item) => list.appendChild(buildRecordingCard(item)));
  }

  function goToLesson(dayIdx, pair) {
    document.querySelector('.view-switch__btn[data-view="schedule"]').click();
    activeDayIndex = dayIdx;
    renderDayTabs();
    renderLessons(activeDayIndex);
    requestAnimationFrame(() => {
      const cards = lessonsList.querySelectorAll(".lesson-card");
      const pairKeys = Object.keys(SCHEDULE.days[dayIdx].pairs).map(Number).sort((a, b) => a - b);
      const target = Array.from(cards)[pairKeys.indexOf(pair)];
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.querySelector(".lesson-card__body").classList.remove("hidden");
        target.classList.add("is-open");
      }
    });
  }

  // ---------- theme ----------
  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }
  let theme = localStorage.getItem(THEME_KEY) || null;
  applyTheme(theme);
  document.getElementById("themeBtn").addEventListener("click", () => {
    theme = theme === null ? "light" : theme === "light" ? "dark" : null;
    if (theme === null) localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  });

  // ---------- parity (чётность недели) ----------
  // Неделя с 1 по 6 сентября 2026 (Вт–Сб) — нечётная. 1 сентября 2026 — вторник,
  // поэтому опорный понедельник этой недели — 31 августа 2026. От него считаем все остальные.
  const REFERENCE_ODD_MONDAY = new Date(2026, 7, 31); // понедельник недели, в которую входит 1 сентября 2026

  function mondayOf(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay(); // 0=Вс..6=Сб
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function autoParity(date) {
    const monday = mondayOf(date || new Date());
    const diffDays = Math.round((monday - REFERENCE_ODD_MONDAY) / 86400000);
    const weekIndex = Math.floor(diffDays / 7);
    const mod = ((weekIndex % 2) + 2) % 2; // защита от отрицательного остатка
    return mod === 0 ? "odd" : "even";
  }

  // null/отсутствует = автоопределение; "odd"/"even" = ручной выбор пользователя
  let manualParity = localStorage.getItem(PARITY_KEY) || null;
  function effectiveParity() {
    return manualParity || autoParity();
  }

  // ---------- занятия на конкретные даты ----------
  // Для дня недели, который сейчас открыт (dayIdx), вычисляем реальный
  // календарный день ЭТОЙ недели (той же, что взята за основу для чётности)
  // и проверяем по нему activeDates/exceptDates/fromDate/toDate секции —
  // так мы не показываем как «одновременные» занятия, которые на самом
  // деле идут в разные недели/даты.
  function calendarDateForDay(dayIdx) {
    const monday = mondayOf(new Date());
    const d = new Date(monday);
    d.setDate(d.getDate() + dayIdx);
    return d;
  }
  function ddmm(date) {
    return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  function isSectionActiveOnDate(section, date) {
    const cur = ddmm(date);
    if (section.activeDates) return section.activeDates.includes(cur);
    if (section.exceptDates && section.exceptDates.includes(cur)) return false;
    if (section.fromDate || section.toDate) {
      const year = date.getFullYear();
      if (section.fromDate) {
        const [fd, fm] = section.fromDate.split(".").map(Number);
        if (date < new Date(year, fm - 1, fd)) return false;
      }
      if (section.toDate) {
        const [td, tm] = section.toDate.split(".").map(Number);
        if (date > new Date(year, tm - 1, td, 23, 59, 59)) return false;
      }
    }
    return true;
  }
  function isSectionActiveForDay(dayIdx, section) {
    return isSectionActiveOnDate(section, calendarDateForDay(dayIdx));
  }

  const parityBtn = document.getElementById("parityBtn");
  function renderParityBtn() {
    const label = effectiveParity() === "odd" ? "Нечётная" : "Чётная";
    parityBtn.textContent = manualParity ? `Неделя: ${label}` : `Неделя: ${label} · авто`;
    parityBtn.title = manualParity
      ? "Задано вручную. Нажмите, чтобы вернуться к автоопределению"
      : "Определено автоматически. Нажмите, чтобы задать вручную";
  }
  parityBtn.addEventListener("click", () => {
    manualParity = manualParity === null ? "odd" : manualParity === "odd" ? "even" : null;
    if (manualParity === null) localStorage.removeItem(PARITY_KEY);
    else localStorage.setItem(PARITY_KEY, manualParity);
    renderParityBtn();
    renderLessons(activeDayIndex);
  });
  renderParityBtn();

  // ---------- PWA: установка на главный экран и офлайн-режим ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const installBtn = document.getElementById("installBtn");
  let deferredInstallPrompt = null;

  if (!isStandalone) {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      installBtn.classList.remove("hidden");
    });
    if (isIOS) installBtn.classList.remove("hidden");
  }

  installBtn.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installBtn.classList.add("hidden");
    } else if (isIOS) {
      alert(
        "Чтобы добавить приложение на главный экран:\n\n1. Нажмите кнопку «Поделиться» внизу экрана Safari (стрелка вверх в квадрате)\n2. Выберите «На экран «Домой»»\n3. Нажмите «Добавить»"
      );
    } else {
      alert("Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».");
    }
    menuPanel.classList.add("hidden");
  });

  // ---------- menu ----------
  const menuBtn = document.getElementById("menuBtn");
  const menuPanel = document.getElementById("menuPanel");
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    menuPanel.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!menuPanel.classList.contains("hidden") && !menuPanel.contains(e.target)) {
      menuPanel.classList.add("hidden");
    }
  });

  document.getElementById("switchGroupBtn").addEventListener("click", () => {
    menuPanel.classList.add("hidden");
    showGroupPicker(true);
  });

  document.getElementById("exportBtn").addEventListener("click", () => {
    const payload = {
      format: "scheduleApp-backup-v2",
      exportedAt: new Date().toISOString(),
      entries,
      hiddenLessons: Array.from(hiddenLessons),
      weekOverrides,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-backup-${isoDate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    menuPanel.classList.add("hidden");
  });

  document.getElementById("importInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (imported && imported.format === "scheduleApp-backup-v2") {
          entries = Object.assign({}, entries, imported.entries || {});
          (imported.hiddenLessons || []).forEach((id) => hiddenLessons.add(id));
          const incomingWeeks = imported.weekOverrides || {};
          Object.keys(incomingWeeks).forEach((key) => {
            const incoming = incomingWeeks[key];
            const existing = getWeekEntry(key);
            const cancelledSet = new Set([...(existing.cancelled || []), ...(incoming.cancelled || [])]);
            const extraById = new Map();
            [...(existing.extra || []), ...(incoming.extra || [])].forEach((ex) => extraById.set(ex.id, ex));
            weekOverrides[key] = { cancelled: Array.from(cancelledSet), extra: Array.from(extraById.values()) };
          });
        } else {
          entries = Object.assign({}, entries, imported); // старый формат экспорта (только заметки)
        }
        saveEntries();
        saveHidden();
        saveWeekOverrides();
        renderLessons(activeDayIndex);
        renderDayTabs();
        renderHomeworkView();
        alert("Данные импортированы.");
      } catch (err) {
        alert("Не удалось прочитать файл: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
    menuPanel.classList.add("hidden");
  });

  document.getElementById("clearBtn").addEventListener("click", () => {
    if (confirm("Удалить все домашние задания и заметки без возможности восстановления?")) {
      entries = {};
      saveEntries();
      renderLessons(activeDayIndex);
      renderDayTabs();
      renderHomeworkView();
    }
    menuPanel.classList.add("hidden");
  });

  // ---------- header ----------
  const groupLabelEl = document.getElementById("groupLabel");
  groupLabelEl.textContent = `${SCHEDULE.group} · ${SCHEDULE.groupCode}`;
  if (SCHEDULE.direction) groupLabelEl.title = SCHEDULE.direction + (SCHEDULE.profile ? " · " + SCHEDULE.profile : "");
  const groupAvatarEl = document.getElementById("groupAvatar");
  groupAvatarEl.textContent = groupInitials(SCHEDULE.group);
  groupAvatarEl.style.background = groupAvatarGradient(SCHEDULE.id);

  // ---------- view switching ----------
  const scheduleView = document.getElementById("scheduleView");
  const homeworkView = document.getElementById("homeworkView");
  const recordingsView = document.getElementById("recordingsView");
  const dayTabsEl = document.getElementById("dayTabs");
  document.querySelectorAll(".view-switch__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".view-switch__btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const view = btn.dataset.view;
      scheduleView.classList.toggle("hidden", view !== "schedule");
      homeworkView.classList.toggle("hidden", view !== "homework");
      recordingsView.classList.toggle("hidden", view !== "recordings");
      dayTabsEl.classList.toggle("hidden", view !== "schedule");
      if (view === "homework") renderHomeworkView();
      if (view === "recordings") renderRecordingsListView();
    });
  });

  // ---------- time helpers ----------
  function timeToMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }
  function parseRange(range) {
    const [start, end] = range.split("–");
    return [timeToMinutes(start), timeToMinutes(end)];
  }
  function todayIndex() {
    const jsDay = new Date().getDay(); // 0=Sun..6=Sat
    return jsDay === 0 ? null : jsDay - 1; // Mon=0..Sat=5
  }
  function nowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
  function pluralRu(n, one, few, many) {
    const mod100 = Math.abs(n) % 100;
    const mod10 = mod100 % 10;
    if (mod100 > 10 && mod100 < 20) return many;
    if (mod10 > 1 && mod10 < 5) return few;
    if (mod10 === 1) return one;
    return many;
  }
  function formatCountdown(totalMinutes) {
    const mins = Math.max(0, Math.round(totalMinutes));
    if (mins < 1) return "меньше минуты";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const parts = [];
    if (h > 0) parts.push(`${h} ${pluralRu(h, "час", "часа", "часов")}`);
    if (m > 0 || h === 0) parts.push(`${m} ${pluralRu(m, "минута", "минуты", "минут")}`);
    return parts.join(" ");
  }

  // ---------- day tabs ----------
  let activeDayIndex = todayIndex() ?? 0;

  function dayHasPendingHomework(dayIdx) {
    const prefix = `${SCHEDULE.id}-${dayIdx}-`;
    return Object.keys(entries).some((id) => {
      if (!id.startsWith(prefix)) return false;
      return !isHidden(id) && entries[id].hw && entries[id].hw.trim() && !entries[id].done;
    });
  }

  function renderDayTabs() {
    dayTabsEl.innerHTML = "";
    const today = todayIndex();
    SCHEDULE.days.forEach((day, idx) => {
      const btn = document.createElement("button");
      btn.className = "day-tab";
      if (idx === activeDayIndex) btn.classList.add("is-active");
      if (idx === today) btn.classList.add("is-today");
      btn.textContent = DAY_SHORT[idx];
      btn.title = day.name;
      if (dayHasPendingHomework(idx)) {
        const dot = document.createElement("span");
        dot.className = "day-tab__dot";
        btn.appendChild(dot);
      }
      btn.addEventListener("click", () => {
        activeDayIndex = idx;
        renderDayTabs();
        renderLessons(activeDayIndex);
      });
      dayTabsEl.appendChild(btn);
    });
    renderDeadlineBanner();
  }

  // ---------- now banner ----------
  function renderNowBanner() {
    const banner = document.getElementById("nowBanner");
    const today = todayIndex();
    if (today === null) {
      banner.innerHTML = svgIcon("sparkle") + " Сегодня выходной";
      banner.classList.remove("hidden");
      return;
    }
    const mergedPairs = mergedPairsForDay(today);
    const rawPairKeys = Object.keys(mergedPairs).map(Number).sort((a, b) => a - b);
    const visibleFor = (p) =>
      mergedPairs[p].filter((s, i) => {
        const id = idForSection(today, p, i, s);
        return !isHidden(id) && !isCancelledThisWeek(id) && isSectionActiveForDay(today, s);
      });
    const pairKeys = rawPairKeys.filter((p) => visibleFor(p).length > 0);
    const now = nowMinutes();
    let current = null;
    let next = null;
    for (const p of pairKeys) {
      const [start, end] = parseRange(SCHEDULE.times[p - 1]);
      if (now >= start && now < end) current = p;
      if (now < start && next === null) next = p;
    }
    if (current) {
      const [, end] = parseRange(SCHEDULE.times[current - 1]);
      const label = visibleFor(current).map(sectionLabel).join(" / ");
      const endStr = SCHEDULE.times[current - 1].split("–")[1];
      banner.innerHTML = `Сейчас ${current}-я пара: <strong>${escapeHtml(label)}</strong> · до ${endStr} <span class="now-banner__countdown">(ещё ${formatCountdown(end - now)})</span>`;
      banner.classList.remove("hidden");
    } else if (next) {
      const [start] = parseRange(SCHEDULE.times[next - 1]);
      const label = visibleFor(next).map(sectionLabel).join(" / ");
      const startStr = SCHEDULE.times[next - 1].split("–")[0];
      banner.innerHTML = `Следующая пара — ${next}-я: <strong>${escapeHtml(label)}</strong> · в ${startStr} <span class="now-banner__countdown">(через ${formatCountdown(start - now)})</span>`;
      banner.classList.remove("hidden");
    } else if (pairKeys.length) {
      banner.innerHTML = svgIcon("check-circle") + " На сегодня пар больше нет";
      banner.classList.remove("hidden");
    } else if (rawPairKeys.length) {
      banner.innerHTML = svgIcon("sparkle") + " Сегодня все пары скрыты";
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }
  }

  function sectionLabel(section) {
    return section.subject + (section.detail ? ` (${section.detail})` : "");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  const TYPE_CLASS = { "лекция": "lecture", "пр.": "practice", "лаб.": "lab" };
  const TYPE_SHORT = { "лекция": "Лекция", "пр.": "Практика", "лаб.": "Лабораторная" };

  // ---------- lessons list ----------
  const lessonsList = document.getElementById("lessonsList");
  const lessonCardTpl = document.getElementById("lessonCardTemplate");
  const sectionTpl = document.getElementById("sectionTemplate");

  // ---------- добавление пары на текущую неделю ----------
  let extraFormDayIdx = null;
  const addExtraBtn = document.getElementById("addExtraBtn");
  const addExtraForm = document.getElementById("addExtraForm");
  const extraSubjectInput = document.getElementById("extraSubject");
  const extraPairSelect = document.getElementById("extraPair");
  const extraTypeSelect = document.getElementById("extraType");
  const extraTeacherInput = document.getElementById("extraTeacher");
  const extraRoomInput = document.getElementById("extraRoom");

  SCHEDULE.times.forEach((time, i) => {
    const opt = document.createElement("option");
    opt.value = String(i + 1);
    opt.textContent = `${i + 1} пара · ${time}`;
    extraPairSelect.appendChild(opt);
  });

  function resetExtraForm() {
    addExtraForm.classList.add("hidden");
    addExtraBtn.classList.remove("hidden");
    extraSubjectInput.value = "";
    extraTeacherInput.value = "";
    extraRoomInput.value = "";
    extraTypeSelect.value = "пр.";
    extraPairSelect.value = "1";
  }
  function renderExtraForm(dayIdx) {
    extraFormDayIdx = dayIdx;
    resetExtraForm();
  }
  addExtraBtn.addEventListener("click", () => {
    addExtraBtn.classList.add("hidden");
    addExtraForm.classList.remove("hidden");
    extraSubjectInput.focus();
  });
  document.getElementById("extraCancelBtn").addEventListener("click", resetExtraForm);
  document.getElementById("extraSaveBtn").addEventListener("click", () => {
    const subject = extraSubjectInput.value.trim();
    if (!subject) {
      extraSubjectInput.focus();
      return;
    }
    addExtraLesson(extraFormDayIdx, {
      subject,
      pair: Number(extraPairSelect.value),
      type: extraTypeSelect.value,
      teacher: extraTeacherInput.value.trim(),
      room: extraRoomInput.value.trim(),
    });
    renderDayTabs();
    renderLessons(activeDayIndex);
  });

  function countHiddenTotal() {
    let count = 0;
    SCHEDULE.days.forEach((day, dayIdx) => {
      Object.keys(day.pairs).map(Number).forEach((pair) => {
        day.pairs[pair].forEach((_, i) => {
          const id = lessonId(dayIdx, pair, i);
          if (isHidden(id) || isCancelledThisWeek(id)) count++;
        });
      });
    });
    return count;
  }

  const hiddenToggleRow = document.getElementById("hiddenToggleRow");
  const toggleHiddenBtn = document.getElementById("toggleHiddenBtn");

  function updateHiddenCountUI() {
    const count = countHiddenTotal();
    hiddenToggleRow.classList.toggle("hidden", count === 0 && !showHiddenLessons);
    toggleHiddenBtn.classList.toggle("is-active", showHiddenLessons);
    const badge = count > 0 ? `<span class="count-badge">${count}</span>` : "";
    toggleHiddenBtn.innerHTML =
      (showHiddenLessons ? svgIcon("eye-off") + " Скрыть скрытые пары " : svgIcon("eye") + " Показать скрытые пары ") + badge;
  }

  toggleHiddenBtn.addEventListener("click", () => {
    showHiddenLessons = !showHiddenLessons;
    renderLessons(activeDayIndex);
  });

  function renderLessons(dayIdx) {
    lessonsList.innerHTML = "";
    const mergedPairs = mergedPairsForDay(dayIdx);
    const pairKeys = Object.keys(mergedPairs).map(Number).sort((a, b) => a - b);

    if (!pairKeys.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = "<p>В этот день пар нет.</p>";
      lessonsList.appendChild(empty);
      renderExtraForm(dayIdx);
      renderNowBanner();
      return;
    }

    const today = todayIndex();
    const now = nowMinutes();
    let renderedCount = 0;

    pairKeys.forEach((pair) => {
      const allSections = mergedPairs[pair];
      const entriesToShow = allSections
        .map((section, i) => ({ section, i, id: idForSection(dayIdx, pair, i, section) }))
        .filter(({ section, id }) => {
          if (section.__extraId) return true; // добавленные на неделю пары показываются всегда
          if (!isSectionActiveForDay(dayIdx, section)) return false; // в эту неделю этого занятия просто нет
          const suppressed = isHidden(id) || isCancelledThisWeek(id);
          return showHiddenLessons || !suppressed;
        });

      if (!entriesToShow.length) return; // вся пара скрыта, либо ни одно занятие не идёт на этой неделе

      renderedCount++;
      const visibleSections = entriesToShow.map((e) => e.section);
      const node = lessonCardTpl.content.cloneNode(true);
      const card = node.querySelector(".lesson-card");
      card.querySelector(".pair-num").textContent = pair;
      card.querySelector(".pair-time").textContent = SCHEDULE.times[pair - 1];

      const subjEl = card.querySelector(".lesson-card__subjects");
      const first = document.createElement("div");
      first.className = "subj-line";
      first.textContent = sectionLabel(visibleSections[0]);
      subjEl.appendChild(first);
      if (visibleSections.length > 1) {
        const sub = document.createElement("div");
        sub.className = "subj-sub";
        sub.textContent = "+ " + visibleSections.slice(1).map(sectionLabel).join(", ");
        subjEl.appendChild(sub);
      }
      const firstTopic = getEntry(entriesToShow[0].id).topic;
      if (firstTopic && firstTopic.trim()) {
        const topicLine = document.createElement("div");
        topicLine.className = "subj-topic";
        topicLine.textContent = "Тема: " + firstTopic.trim();
        subjEl.appendChild(topicLine);
      }

      const badgesEl = card.querySelector(".lesson-card__badges");
      const hasHw = entriesToShow.some(({ id }) => {
        const e = getEntry(id);
        return e.hw && e.hw.trim() && !e.done;
      });
      const hasNote = entriesToShow.some(({ id }) => getEntry(id).note?.trim());
      const hasExtra = entriesToShow.some(({ section }) => section.__extraId);
      if (hasExtra) badgesEl.appendChild(makeBadge("plus"));
      if (hasHw) badgesEl.appendChild(makeBadge("pencil"));
      if (hasNote) badgesEl.appendChild(makeBadge("note"));
      Promise.all(entriesToShow.map(({ id }) => getRecordings(id))).then((lists) => {
        if (lists.some((l) => l.length) && !badgesEl.querySelector(".badge-dot--rec")) {
          const b = makeBadge("mic");
          b.classList.add("badge-dot--rec");
          badgesEl.appendChild(b);
        }
      });

      if (dayIdx === today) {
        const [start, end] = parseRange(SCHEDULE.times[pair - 1]);
        if (now >= start && now < end) card.classList.add("is-current");
      }

      const sectionsWrap = card.querySelector(".sections");
      entriesToShow.forEach(({ section, i, id }) => {
        sectionsWrap.appendChild(buildSectionNode(dayIdx, pair, i, section, id));
      });

      const head = card.querySelector(".lesson-card__head");
      const body = card.querySelector(".lesson-card__body");
      head.addEventListener("click", () => {
        const willOpen = body.classList.contains("hidden");
        body.classList.toggle("hidden");
        card.classList.toggle("is-open", willOpen);
      });

      lessonsList.appendChild(node);
    });

    if (!renderedCount) {
      const hasSuppressedThisWeek = pairKeys.some((pair) =>
        mergedPairs[pair].some(
          (section, i) =>
            !section.__extraId &&
            isSectionActiveForDay(dayIdx, section) &&
            (isHidden(idForSection(dayIdx, pair, i, section)) || isCancelledThisWeek(idForSection(dayIdx, pair, i, section)))
        )
      );
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = hasSuppressedThisWeek
        ? "<p>Все пары в этот день скрыты.</p><p class=\"empty-state__hint\">Нажмите «Показать скрытые пары» выше, чтобы вернуть их.</p>"
        : "<p>На этой неделе в этот день пар нет.</p><p class=\"empty-state__hint\">Некоторые занятия идут только по определённым датам.</p>";
      lessonsList.appendChild(empty);
    }

    renderExtraForm(dayIdx);
    updateHiddenCountUI();
    renderNowBanner();
    updateRecordButtonsUI();
  }

  function makeBadge(iconName) {
    const span = document.createElement("span");
    span.className = "badge-dot";
    span.innerHTML = svgIcon(iconName);
    return span;
  }

  function buildSectionNode(dayIdx, pair, sIdx, section, idOverride) {
    const node = sectionTpl.content.cloneNode(true);
    const root = node.querySelector(".section");
    const id = idOverride || lessonId(dayIdx, pair, sIdx);
    const entry = getEntry(id);
    const isExtra = !!section.__extraId;

    const typeBadge = root.querySelector(".type-badge");
    typeBadge.textContent = TYPE_SHORT[section.type] || section.type;
    typeBadge.classList.add(TYPE_CLASS[section.type] || "practice");

    root.querySelector(".section__subject").textContent = sectionLabel(section);

    const hiddenPill = root.querySelector(".section__hidden-pill");
    if (!isExtra && isHidden(id)) {
      root.classList.add("is-hidden-lesson");
      hiddenPill.classList.remove("hidden");
    }
    const weekCancelledPill = root.querySelector(".section__week-cancelled-pill");
    if (!isExtra && isCancelledThisWeek(id)) {
      root.classList.add("is-hidden-lesson");
      weekCancelledPill.classList.remove("hidden");
    }
    const extraPill = root.querySelector(".section__extra-pill");
    if (isExtra) extraPill.classList.remove("hidden");

    const parityEl = root.querySelector(".section__parity");
    if (section.parity) {
      parityEl.textContent = section.parity === "odd" ? "Нечётная неделя" : "Чётная неделя";
      parityEl.classList.remove("hidden");
      if (section.parity !== effectiveParity()) root.style.opacity = "0.55";
    }

    root.querySelector(".section__teacher").textContent = section.teacher || "";
    root.querySelector(".section__room").textContent = section.room ? `Ауд. ${section.room}` : "";

    const noteMeta = root.querySelector(".section__note");
    if (section.note) {
      noteMeta.textContent = section.note;
      noteMeta.classList.remove("hidden");
    }

    const topicInput = root.querySelector(".topic-input");
    const hwInput = root.querySelector(".hw-input");
    const dueDateInput = root.querySelector(".due-date-input");
    const noteInput = root.querySelector(".note-input");
    const materialsInput = root.querySelector(".materials-input");
    const materialsLabel = root.querySelector(".materials-label");
    const materialsToggle = root.querySelector(".materials-toggle");
    const doneInput = root.querySelector(".done-input");
    const saveStatus = root.querySelector(".save-status");

    topicInput.value = entry.topic || "";
    hwInput.value = entry.hw || "";
    dueDateInput.value = entry.dueDate || "";
    noteInput.value = entry.note || "";
    materialsInput.value = entry.materials || "";
    doneInput.checked = !!entry.done;
    if (entry.materials && entry.materials.trim()) {
      materialsLabel.classList.remove("hidden");
      materialsToggle.classList.add("hidden");
    }
    materialsToggle.addEventListener("click", () => {
      materialsToggle.classList.add("hidden");
      materialsLabel.classList.remove("hidden");
      materialsInput.focus();
    });

    let saveTimer = null;
    function flashSaved() {
      saveStatus.textContent = "Сохранено";
      saveStatus.classList.add("is-visible");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveStatus.classList.remove("is-visible"), 1200);
    }

    let debounceTimer = null;
    function scheduleSave(patch) {
      setEntry(id, patch);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        flashSaved();
        renderDayTabs();
      }, 400);
    }

    topicInput.addEventListener("input", () => scheduleSave({ topic: topicInput.value }));
    hwInput.addEventListener("input", () => scheduleSave({ hw: hwInput.value }));
    dueDateInput.addEventListener("change", () => scheduleSave({ dueDate: dueDateInput.value }));
    noteInput.addEventListener("input", () => scheduleSave({ note: noteInput.value }));
    materialsInput.addEventListener("input", () => scheduleSave({ materials: materialsInput.value }));
    doneInput.addEventListener("change", () => {
      setEntry(id, { done: doneInput.checked });
      flashSaved();
      renderDayTabs();
    });

    const recordBtn = root.querySelector(".record-btn");
    const recordTimer = root.querySelector(".record-timer");
    const recordingsListEl = root.querySelector(".recordings-list");
    recordBtn.dataset.lessonId = id;
    recordTimer.dataset.lessonId = id;
    recordingsListEl.dataset.lessonId = id;
    recordBtn.addEventListener("click", () => {
      if (activeRecording && activeRecording.id === id) stopRecording();
      else if (!activeRecording) startRecording(id);
    });
    refreshRecordingsList(id, recordingsListEl);

    const visibilityBlock = root.querySelector(".section__visibility");
    const extraActionsBlock = root.querySelector(".section__extra-actions");

    if (isExtra) {
      visibilityBlock.remove();
      extraActionsBlock.classList.remove("hidden");
      const deleteBtn = root.querySelector(".extra-delete-btn");
      deleteBtn.addEventListener("click", () => {
        if (!confirm("Удалить эту пару без возможности восстановления?")) return;
        removeExtraLesson(currentWeekKey(), section.__extraId);
        renderDayTabs();
        renderLessons(activeDayIndex);
      });
    } else {
      extraActionsBlock.remove();
      const hideBtn = root.querySelector(".hide-btn:not(.week-cancel-btn)");
      function renderHideBtn() {
        if (isHidden(id)) {
          hideBtn.innerHTML = svgIcon("restore") + " Восстановить эту пару";
          hideBtn.classList.add("is-hidden");
        } else {
          hideBtn.innerHTML = svgIcon("ban") + " Не хожу — скрыть эту пару";
          hideBtn.classList.remove("is-hidden");
        }
      }
      renderHideBtn();
      hideBtn.addEventListener("click", () => {
        setHidden(id, !isHidden(id));
        renderDayTabs();
        renderLessons(activeDayIndex);
      });

      const weekCancelBtn = root.querySelector(".week-cancel-btn");
      function renderWeekCancelBtn() {
        if (isCancelledThisWeek(id)) {
          weekCancelBtn.innerHTML = svgIcon("calendar") + " Пара всё-таки будет на этой неделе";
          weekCancelBtn.classList.add("is-hidden");
        } else {
          weekCancelBtn.innerHTML = svgIcon("calendar-off") + " Пары не будет на этой неделе";
          weekCancelBtn.classList.remove("is-hidden");
        }
      }
      renderWeekCancelBtn();
      weekCancelBtn.addEventListener("click", () => {
        setCancelledThisWeek(id, !isCancelledThisWeek(id));
        renderDayTabs();
        renderLessons(activeDayIndex);
      });
    }

    return node;
  }

  // ---------- homework view ----------
  function dueDateUrgency(dueDateStr) {
    if (!dueDateStr) return "none";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr + "T00:00:00");
    const diffDays = Math.round((due - today) / 86400000);
    if (diffDays < 0) return "overdue";
    if (diffDays <= 1) return "soon";
    return "normal";
  }
  function formatDueDate(dueDateStr) {
    return new Date(dueDateStr + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  }
  const DUE_LABEL = { overdue: "Просрочено", soon: "Скоро", normal: "" };

  function collectHomeworkItems() {
    const items = [];
    SCHEDULE.days.forEach((day, dayIdx) => {
      Object.keys(day.pairs).map(Number).forEach((pair) => {
        day.pairs[pair].forEach((section, sIdx) => {
          const id = lessonId(dayIdx, pair, sIdx);
          const entry = getEntry(id);
          if (entry.hw && entry.hw.trim() && !isHidden(id)) {
            items.push({ id, dayIdx, pair, section, entry, isExtra: false });
          }
        });
      });
    });
    allExtrasForGroup().forEach(({ weekKey, extra }) => {
      const id = extraLessonId(extra.dayIdx, extra.pair, extra.id);
      const entry = getEntry(id);
      if (entry.hw && entry.hw.trim()) {
        items.push({
          id,
          dayIdx: extra.dayIdx,
          pair: extra.pair,
          section: { subject: extra.subject, type: extra.type, teacher: extra.teacher, room: extra.room },
          entry,
          isExtra: true,
          isCurrentWeek: weekKey === currentWeekKey(),
        });
      }
    });
    return items;
  }

  function renderHomeworkView() {
    const list = document.getElementById("homeworkList");
    const empty = document.getElementById("homeworkEmpty");
    const countBadge = document.getElementById("hwCount");
    list.innerHTML = "";

    const items = collectHomeworkItems();

    const pendingCount = items.filter((it) => !it.entry.done).length;
    if (pendingCount > 0) {
      countBadge.textContent = pendingCount;
      countBadge.classList.remove("hidden");
    } else {
      countBadge.classList.add("hidden");
    }

    if (!items.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    items.sort((a, b) => {
      if (a.entry.done !== b.entry.done) return a.entry.done ? 1 : -1;
      const aDue = a.entry.dueDate || "";
      const bDue = b.entry.dueDate || "";
      if (aDue !== bDue) {
        if (!aDue) return 1;
        if (!bDue) return -1;
        return aDue < bDue ? -1 : 1;
      }
      if (a.dayIdx !== b.dayIdx) return a.dayIdx - b.dayIdx;
      return a.pair - b.pair;
    });

    items.forEach((it) => {
      const urgency = it.entry.done ? "none" : dueDateUrgency(it.entry.dueDate);
      const card = document.createElement("article");
      card.className = "homework-card" + (it.entry.done ? " is-done" : "") + (urgency !== "none" ? ` is-due-${urgency}` : "");

      const checkWrap = document.createElement("div");
      checkWrap.className = "homework-card__check";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = !!it.entry.done;
      check.addEventListener("change", () => {
        setEntry(it.id, { done: check.checked });
        renderHomeworkView();
        renderDayTabs();
        if (!scheduleView.classList.contains("hidden")) renderLessons(activeDayIndex);
      });
      checkWrap.appendChild(check);

      const body = document.createElement("div");
      body.className = "homework-card__body";

      const meta = document.createElement("div");
      meta.className = "homework-card__meta";
      meta.textContent = `${SCHEDULE.days[it.dayIdx].name} · пара ${it.pair} · ${SCHEDULE.times[it.pair - 1]}`;
      if (it.isExtra) meta.textContent += " · добавлено на неделю";
      body.appendChild(meta);

      const subject = document.createElement("div");
      subject.className = "homework-card__subject";
      subject.textContent = sectionLabel(it.section);
      body.appendChild(subject);

      if (it.entry.topic && it.entry.topic.trim()) {
        const topic = document.createElement("div");
        topic.className = "homework-card__topic";
        topic.innerHTML = svgIcon("tag") + " " + escapeHtml(it.entry.topic.trim());
        body.appendChild(topic);
      }

      const text = document.createElement("div");
      text.className = "homework-card__text";
      text.textContent = it.entry.hw;
      body.appendChild(text);

      if (it.entry.dueDate) {
        const due = document.createElement("div");
        due.className = "homework-card__due";
        const label = DUE_LABEL[urgency];
        due.innerHTML = svgIcon("calendar") + ` Сдать до ${formatDueDate(it.entry.dueDate)}` + (label ? ` · ${label}` : "");
        body.appendChild(due);
      }

      if (it.entry.note && it.entry.note.trim()) {
        const note = document.createElement("div");
        note.className = "homework-card__note";
        note.innerHTML = svgIcon("note") + " " + escapeHtml(it.entry.note);
        body.appendChild(note);
      }

      card.appendChild(checkWrap);
      card.appendChild(body);
      if (!it.isExtra || it.isCurrentWeek) {
        const goto = document.createElement("button");
        goto.className = "homework-card__goto";
        goto.textContent = "Открыть →";
        goto.addEventListener("click", () => goToLesson(it.dayIdx, it.pair));
        card.appendChild(goto);
      }
      list.appendChild(card);
    });
  }

  // ---------- deadline banner + notifications ----------
  const NOTIFY_PREF_KEY = "scheduleApp:v1:notifyDeadlines";
  const NOTIFIED_KEY = "scheduleApp:v1:notifiedDeadlines";

  function notifyPrefEnabled() {
    return localStorage.getItem(NOTIFY_PREF_KEY) === "1";
  }
  function loadNotified() {
    try {
      return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function saveNotified(obj) {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(obj));
  }

  function computeDeadlineSummary() {
    const items = collectHomeworkItems().filter((it) => !it.entry.done);
    let overdue = 0;
    let soon = 0;
    items.forEach((it) => {
      const urgency = dueDateUrgency(it.entry.dueDate);
      if (urgency === "overdue") overdue++;
      else if (urgency === "soon") soon++;
    });
    return { overdue, soon, items };
  }

  function renderDeadlineBanner() {
    const banner = document.getElementById("deadlineBanner");
    const { overdue, soon } = computeDeadlineSummary();
    if (!overdue && !soon) {
      banner.classList.add("hidden");
      banner.innerHTML = "";
      return;
    }
    const parts = [];
    if (overdue) parts.push(`Просрочено: ${overdue}`);
    if (soon) parts.push(`Горит: ${soon}`);
    banner.className = "deadline-banner" + (overdue ? " is-overdue" : " is-soon");
    banner.innerHTML =
      svgIcon("bell") +
      `<span>${parts.join(" · ")}</span>` +
      `<button type="button" class="deadline-banner__goto">Домашние задания →</button>`;
    banner.querySelector(".deadline-banner__goto").addEventListener("click", () => {
      document.querySelector('.view-switch__btn[data-view="homework"]').click();
    });
  }

  function renderNotifyToggleBtn() {
    const btn = document.getElementById("notifyToggleBtn");
    if (!btn) return;
    const enabled = notifyPrefEnabled();
    const supported = "Notification" in window && "serviceWorker" in navigator;
    btn.querySelector("use").setAttribute("href", enabled ? "#icon-bell" : "#icon-bell-off");
    btn.querySelector(".notify-toggle-label").textContent = enabled
      ? "Уведомления о дедлайнах: включены"
      : "Уведомления о дедлайнах: выключены";
    btn.disabled = !supported;
    if (!supported) btn.querySelector(".notify-toggle-label").textContent = "Уведомления не поддерживаются браузером";
  }

  function checkAndNotifyDeadlines() {
    if (!notifyPrefEnabled()) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator)) return;

    const notified = loadNotified();
    const { items } = computeDeadlineSummary();
    let changed = false;

    items.forEach((it) => {
      const urgency = dueDateUrgency(it.entry.dueDate);
      if (urgency !== "overdue" && urgency !== "soon") return;
      if (notified[it.id] === urgency) return;
      notified[it.id] = urgency;
      changed = true;
      const title = urgency === "overdue" ? "Дедлайн просрочен" : "Дедлайн скоро горит";
      const body = `${sectionLabel(it.section)} — «${it.entry.hw.trim().slice(0, 80)}», сдать до ${formatDueDate(it.entry.dueDate)}`;
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body,
          icon: "icons/icon-192.png",
          badge: "icons/icon-192.png",
          tag: it.id,
        });
      });
    });

    if (changed) saveNotified(notified);
  }

  const notifyToggleBtn = document.getElementById("notifyToggleBtn");
  if (notifyToggleBtn) {
    notifyToggleBtn.addEventListener("click", () => {
      if (!("Notification" in window)) {
        alert("Этот браузер не поддерживает уведомления.");
        return;
      }
      if (!notifyPrefEnabled()) {
        Notification.requestPermission().then((perm) => {
          if (perm === "granted") {
            localStorage.setItem(NOTIFY_PREF_KEY, "1");
            renderNotifyToggleBtn();
            checkAndNotifyDeadlines();
          } else if (perm === "denied") {
            alert("Уведомления заблокированы в настройках браузера — разрешите их для этого сайта, чтобы включить.");
          }
        });
      } else {
        localStorage.setItem(NOTIFY_PREF_KEY, "0");
        renderNotifyToggleBtn();
      }
    });
  }

  // ---------- init ----------
  renderDayTabs();
  renderLessons(activeDayIndex);
  renderHomeworkView();
  updateRecCountBadge();
  renderDeadlineBanner();
  renderNotifyToggleBtn();
  checkAndNotifyDeadlines();

  setInterval(() => {
    renderNowBanner();
    if (!manualParity) renderParityBtn();
    renderDeadlineBanner();
    checkAndNotifyDeadlines();
  }, 60 * 1000);
})();
