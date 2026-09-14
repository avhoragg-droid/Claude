(function () {
  "use strict";

  const STORAGE_KEY = "scheduleApp:v1:entries";
  const THEME_KEY = "scheduleApp:v1:theme";
  const PARITY_KEY = "scheduleApp:v1:parity";

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
    return `${dayIdx}-${pair}-${sectionIdx}`;
  }
  function getEntry(id) {
    return entries[id] || { hw: "", note: "", done: false };
  }
  function setEntry(id, patch) {
    const current = getEntry(id);
    entries[id] = Object.assign({}, current, patch, { updatedAt: Date.now() });
    saveEntries();
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

  document.getElementById("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "schedule-notes-backup.json";
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
        entries = Object.assign({}, entries, imported);
        saveEntries();
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
  document.getElementById("groupLabel").textContent = `${SCHEDULE.group} · ${SCHEDULE.groupCode}`;

  // ---------- view switching ----------
  const scheduleView = document.getElementById("scheduleView");
  const homeworkView = document.getElementById("homeworkView");
  const dayTabsEl = document.getElementById("dayTabs");
  document.querySelectorAll(".view-switch__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".view-switch__btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const view = btn.dataset.view;
      scheduleView.classList.toggle("hidden", view !== "schedule");
      homeworkView.classList.toggle("hidden", view !== "homework");
      dayTabsEl.classList.toggle("hidden", view !== "schedule");
      if (view === "homework") renderHomeworkView();
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

  // ---------- day tabs ----------
  let activeDayIndex = todayIndex() ?? 0;

  function dayHasPendingHomework(dayIdx) {
    return Object.keys(entries).some((id) => {
      const [d] = id.split("-").map(Number);
      return d === dayIdx && entries[id].hw && entries[id].hw.trim() && !entries[id].done;
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
  }

  // ---------- now banner ----------
  function renderNowBanner() {
    const banner = document.getElementById("nowBanner");
    const today = todayIndex();
    if (today === null) {
      banner.textContent = "Сегодня выходной 🎉";
      banner.classList.remove("hidden");
      return;
    }
    const day = SCHEDULE.days[today];
    const pairKeys = Object.keys(day.pairs).map(Number).sort((a, b) => a - b);
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
      const sections = day.pairs[current];
      const label = sections.map(sectionLabel).join(" / ");
      banner.innerHTML = `Сейчас: <strong>${escapeHtml(label)}</strong> · до ${SCHEDULE.times[current - 1].split("–")[1]}`;
      banner.classList.remove("hidden");
    } else if (next) {
      const [start] = parseRange(SCHEDULE.times[next - 1]);
      const sections = day.pairs[next];
      const label = sections.map(sectionLabel).join(" / ");
      banner.innerHTML = `Следующая пара: <strong>${escapeHtml(label)}</strong> · в ${SCHEDULE.times[next - 1].split("–")[0]}`;
      banner.classList.remove("hidden");
    } else if (pairKeys.length) {
      banner.textContent = "На сегодня пар больше нет 👍";
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

  function renderLessons(dayIdx) {
    lessonsList.innerHTML = "";
    const day = SCHEDULE.days[dayIdx];
    const pairKeys = Object.keys(day.pairs).map(Number).sort((a, b) => a - b);

    if (!pairKeys.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = "<p>В этот день пар нет.</p>";
      lessonsList.appendChild(empty);
      renderNowBanner();
      return;
    }

    const today = todayIndex();
    const now = nowMinutes();

    pairKeys.forEach((pair) => {
      const sections = day.pairs[pair];
      const node = lessonCardTpl.content.cloneNode(true);
      const card = node.querySelector(".lesson-card");
      card.querySelector(".pair-num").textContent = pair;
      card.querySelector(".pair-time").textContent = SCHEDULE.times[pair - 1];

      const subjEl = card.querySelector(".lesson-card__subjects");
      const first = document.createElement("div");
      first.className = "subj-line";
      first.textContent = sectionLabel(sections[0]);
      subjEl.appendChild(first);
      if (sections.length > 1) {
        const sub = document.createElement("div");
        sub.className = "subj-sub";
        sub.textContent = "+ " + sections.slice(1).map(sectionLabel).join(", ");
        subjEl.appendChild(sub);
      }

      const badgesEl = card.querySelector(".lesson-card__badges");
      const hasHw = sections.some((_, i) => {
        const e = getEntry(lessonId(dayIdx, pair, i));
        return e.hw && e.hw.trim() && !e.done;
      });
      const hasNote = sections.some((_, i) => getEntry(lessonId(dayIdx, pair, i)).note?.trim());
      if (hasHw) badgesEl.appendChild(makeBadge("📝"));
      if (hasNote) badgesEl.appendChild(makeBadge("🗒"));

      if (dayIdx === today) {
        const [start, end] = parseRange(SCHEDULE.times[pair - 1]);
        if (now >= start && now < end) card.classList.add("is-current");
      }

      const sectionsWrap = card.querySelector(".sections");
      sections.forEach((section, sIdx) => {
        sectionsWrap.appendChild(buildSectionNode(dayIdx, pair, sIdx, section));
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

    renderNowBanner();
  }

  function makeBadge(icon) {
    const span = document.createElement("span");
    span.className = "badge-dot";
    span.textContent = icon;
    return span;
  }

  function buildSectionNode(dayIdx, pair, sIdx, section) {
    const node = sectionTpl.content.cloneNode(true);
    const root = node.querySelector(".section");
    const id = lessonId(dayIdx, pair, sIdx);
    const entry = getEntry(id);

    const typeBadge = root.querySelector(".type-badge");
    typeBadge.textContent = TYPE_SHORT[section.type] || section.type;
    typeBadge.classList.add(TYPE_CLASS[section.type] || "practice");

    root.querySelector(".section__subject").textContent = sectionLabel(section);

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

    const hwInput = root.querySelector(".hw-input");
    const noteInput = root.querySelector(".note-input");
    const doneInput = root.querySelector(".done-input");
    const saveStatus = root.querySelector(".save-status");

    hwInput.value = entry.hw || "";
    noteInput.value = entry.note || "";
    doneInput.checked = !!entry.done;

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

    hwInput.addEventListener("input", () => scheduleSave({ hw: hwInput.value }));
    noteInput.addEventListener("input", () => scheduleSave({ note: noteInput.value }));
    doneInput.addEventListener("change", () => {
      setEntry(id, { done: doneInput.checked });
      flashSaved();
      renderDayTabs();
    });

    return node;
  }

  // ---------- homework view ----------
  function renderHomeworkView() {
    const list = document.getElementById("homeworkList");
    const empty = document.getElementById("homeworkEmpty");
    const countBadge = document.getElementById("hwCount");
    list.innerHTML = "";

    const items = [];
    SCHEDULE.days.forEach((day, dayIdx) => {
      Object.keys(day.pairs).map(Number).forEach((pair) => {
        day.pairs[pair].forEach((section, sIdx) => {
          const id = lessonId(dayIdx, pair, sIdx);
          const entry = getEntry(id);
          if (entry.hw && entry.hw.trim()) {
            items.push({ id, dayIdx, pair, sIdx, section, entry });
          }
        });
      });
    });

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
      if (a.dayIdx !== b.dayIdx) return a.dayIdx - b.dayIdx;
      return a.pair - b.pair;
    });

    items.forEach((it) => {
      const card = document.createElement("article");
      card.className = "homework-card" + (it.entry.done ? " is-done" : "");

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
      body.appendChild(meta);

      const subject = document.createElement("div");
      subject.className = "homework-card__subject";
      subject.textContent = sectionLabel(it.section);
      body.appendChild(subject);

      const text = document.createElement("div");
      text.className = "homework-card__text";
      text.textContent = it.entry.hw;
      body.appendChild(text);

      if (it.entry.note && it.entry.note.trim()) {
        const note = document.createElement("div");
        note.className = "homework-card__note";
        note.textContent = "🗒 " + it.entry.note;
        body.appendChild(note);
      }

      const goto = document.createElement("button");
      goto.className = "homework-card__goto";
      goto.textContent = "Открыть →";
      goto.addEventListener("click", () => {
        document.querySelector('.view-switch__btn[data-view="schedule"]').click();
        activeDayIndex = it.dayIdx;
        renderDayTabs();
        renderLessons(activeDayIndex);
        requestAnimationFrame(() => {
          const cards = lessonsList.querySelectorAll(".lesson-card");
          const target = Array.from(cards)[Object.keys(SCHEDULE.days[it.dayIdx].pairs).map(Number).sort((a, b) => a - b).indexOf(it.pair)];
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            const body = target.querySelector(".lesson-card__body");
            body.classList.remove("hidden");
            target.classList.add("is-open");
          }
        });
      });

      card.appendChild(checkWrap);
      card.appendChild(body);
      card.appendChild(goto);
      list.appendChild(card);
    });
  }

  // ---------- init ----------
  renderDayTabs();
  renderLessons(activeDayIndex);
  renderHomeworkView();

  setInterval(() => {
    renderNowBanner();
    if (!manualParity) renderParityBtn();
  }, 60 * 1000);
})();
