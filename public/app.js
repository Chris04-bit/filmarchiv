const GENRES = [
  "Action", "Abenteuer", "Thriller", "Krieg", "Science Fiction",
  "Romance", "Comedy", "Animiert", "Slice of Life", "Drama", "Fantasy"
];

const RATINGS = ["10", "9", "8", "7", "6", "5", "4-0"];

let WATCH = {};
let ARCHIVE = [];
let RETRO = [];
let PACKS = [];

async function loadData() {
  try {
    const [watchRes, archiveRes, retroRes, packsRes] = await Promise.all([
      fetch('/api/watch'),
      fetch('/api/archive'),
      fetch('/api/retro'),
      fetch('/api/packs')
    ]);

    const watchRows = await watchRes.json();
    const archiveRows = await archiveRes.json();
    const retroRows = await retroRes.json();
    PACKS = await packsRes.json();

    WATCH = {};
    GENRES.forEach(g => WATCH[g] = []);

    watchRows.forEach(row => {
      if (!WATCH[row.genre]) WATCH[row.genre] = [];
      WATCH[row.genre].push({
        id: row.id,
        title: row.title,
        duration: row.duration || undefined
      });
    });

    ARCHIVE = archiveRows;
    RETRO = retroRows;

    render();
  } catch (err) {
    console.error('Fehler beim Laden der Daten:', err);
  }
}

const searchEl = document.getElementById("film-search");
const clearEl = document.getElementById("clear");
const watchEl = document.getElementById("watch-list");
const archiveEl = document.getElementById("archive-list");
const retroEl = document.getElementById("retro-list");
const statsEl = document.getElementById("stats");
const liveEl = document.getElementById("live");
const noteEl = document.getElementById("search-note");
const statsPanel = document.getElementById("stats");
const viewPanel = document.getElementById("view-switch");
const watchSection = document.getElementById("watch");
const archivSection = document.getElementById("archiv");
const retroSection = document.getElementById("retro");
let view = "normal";
let pickedGenre = null;
let scrollToHit = false;
let scrollTimer = 0;

// Modal-Status
let modalMode = null;      // "watch" | "archive" | "retro"
let editingId = null;      // null = neu, sonst ID

function ratingLabel(rating) {
  return rating <= 4 ? "4-0" : String(rating);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlight(title, query) {
  const safe = escapeHtml(title);
  const needle = query.trim();
  if (!needle) return safe;
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
  return safe.replace(re, (match) => "<mark>" + match + "</mark>");
}

function titleList(films, query, type) {
  return '<ul class="titles">' + films.map((film) => {
    const title = typeof film === 'string' ? film : film.title;
    const id = film.id;
    return `
      <li>
        <span class="dot" aria-hidden="true"></span>
        <a class="film" href="https://www.google.com/search?q=${encodeURIComponent(title + ' Film')}" target="_blank" rel="noopener noreferrer">
          ${highlight(title, query)}
        </a>
        <div class="film-actions">
          <button type="button" class="edit" data-type="${type}" data-id="${id}" title="Bearbeiten">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
          </button>
          <button type="button" class="delete" data-type="${type}" data-id="${id}" title="Löschen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </li>`;
  }).join("") + "</ul>";
}

function watchList(films, query) {
  return '<ul class="titles">' + films.map((film) => {
    const dur = film.duration ? `<span class="duration">${escapeHtml(film.duration)}</span>` : "";
    return `
      <li>
        <span class="dot" aria-hidden="true"></span>
        <a class="film" href="https://www.google.com/search?q=${encodeURIComponent(film.title + ' Film')}" target="_blank" rel="noopener noreferrer">
        
          ${highlight(film.title, query)}
        </a>
        ${dur}
        <div class="film-actions">
          <button type="button" class="send-archive" data-id="${film.id}" data-title="${escapeHtml(film.title)}" title="Send to Archive">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              <path d="M12 11v6"/>
              <path d="M9 14l3 3 3-3"/>
            </svg>
          </button>
          <button type="button" class="edit" data-type="watch" data-id="${film.id}" title="Bearbeiten">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
          </button>
          <button type="button" class="delete" data-type="watch" data-id="${film.id}" title="Löschen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </li>`;
  }).join("") + "</ul>";
}

function render() {
  const query = searchEl.value;
  const needle = query.trim().toLowerCase();
  const hit = (title) => !needle || title.toLowerCase().includes(needle);
  clearEl.classList.toggle("show", needle.length > 0);

    // ===== WATCH =====
    const watchTotal = GENRES.reduce((sum, genre) => sum + (WATCH[genre] || []).length, 0);
    document.getElementById("watch-count").textContent = watchTotal + (watchTotal === 1 ? " filmabend" : " Filmabende");

    // Pack-Dropdown HTML erzeugen
    let packMenuHtml = '';
    if (!PACKS.length) {
      packMenuHtml = `<p style="padding:1rem;color:var(--muted);font-size:0.85rem;">Keine Packs verfügbar</p>`;
    } else {
      packMenuHtml = PACKS.map(p => `
        <button type="button" class="pack-btn" data-pack="${p.id}">
          ${p.name}
          ${p.description ? `<span>${p.description}</span>` : ''}
        </button>
      `).join('');
    }
    
    let watchHtml = `
      <button type="button" class="add-btn" data-add="watch">+ Film zur Watchlist</button>
    
      <div class="pack-import" id="pack-import">
        <button type="button" class="pack-toggle" id="pack-toggle">
          Filmpaket importieren
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div class="pack-menu" id="pack-menu">
          ${packMenuHtml}
        </div>
      </div>
    `;

  const watchGroups = GENRES.map((genre) => ({
    genre,
    films: (WATCH[genre] || []).filter((film) => hit(film.title)),
  })).filter((group) => (needle ? group.films.length > 0 : true));

  let watchHits = 0;
  if (watchGroups.length > 0) {
    watchHtml += watchGroups.map((group) => {
      watchHits += group.films.length;
      const body = group.films.length
        ? watchList(group.films, query)
        : '<p class="empty"></p>';
      return `<article><h2 class="genre">${escapeHtml(group.genre)}</h2>${body}</article>`;
    }).join("");
  }
  watchEl.innerHTML = watchHtml;

  // ===== ARCHIVE STATS =====
  const counts = GENRES.map((genre) => ({
    genre,
    count: ARCHIVE.filter((film) => film.genre === genre).length,
  }));
  statsEl.innerHTML =
    `<p class="total"><button type="button" data-genre="" aria-pressed="${pickedGenre ? "false" : "true"}">Gesamt: ${ARCHIVE.length} ${ARCHIVE.length === 1 ? "Film" : "Filme"}</button></p>` +
    `<ul class="counts">${counts.map((item) =>
      `<li><button type="button" data-genre="${escapeHtml(item.genre)}" aria-pressed="${pickedGenre === item.genre ? "true" : "false"}">${escapeHtml(item.genre)}: <strong>${item.count}</strong></button></li>`
    ).join("")}</ul>`;

  // ===== ARCHIVE LIST =====
  const pool = ARCHIVE.filter((film) => !pickedGenre || film.genre === pickedGenre);
  const groups = RATINGS.map((label) => ({
    label,
    films: pool.filter((film) => hit(film.title) && ratingLabel(film.rating) === label)
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title, "de")),
  })).filter((group) => (needle || pickedGenre ? group.films.length > 0 : true));

  const archiveHits = groups.reduce((sum, group) => sum + group.films.length, 0);

  // Add-Button ganz oben
  let archiveHtml = `<button type="button" class="add-btn" data-add="archive">+ Film zum Archiv</button>`;

  if (pickedGenre && groups.length === 0) {
    archiveHtml += `<p class="panel empty">Keine Filme in ${escapeHtml(pickedGenre)}.</p>`;
  } else if (groups.length > 0) {
    const head = pickedGenre ? `<p class="picked">${escapeHtml(pickedGenre)}</p>` : "";
    archiveHtml += head + groups.map((group) => {
      let body;
      if (group.films.length === 0) {
        body = `<p class="empty">Keine Filme</p>`;
      } else if (view === "normal" || pickedGenre) {
        body = titleList(group.films, query, "archive");
      } else {
        body = GENRES.map((genre) => {
          const filmsInGenre = group.films.filter((film) => film.genre === genre);
          if (!filmsInGenre.length) return "";
          return `<div class="genre-block"><h3>${escapeHtml(genre)}</h3>${titleList(filmsInGenre, query, "archive")}</div>`;
        }).join("");
      }
      return `<article><h2 class="score">${escapeHtml(group.label)}</h2>${body}</article>`;
    }).join("");
  }
  archiveEl.innerHTML = archiveHtml;

  // ===== RETRO =====
  const retroItems = RETRO.filter((item) => hit(item.title));
  const retroHits = retroItems.length;
  document.getElementById("retro-count").textContent = RETRO.length + (RETRO.length === 1 ? " good memory" : " Classics");

  // Add-Button ganz oben
  let retroHtml = `<button type="button" class="add-btn" data-add="retro">+ Retro-Eintrag</button>`;
  if (retroItems.length > 0) {
    retroHtml += `<article>${titleList(retroItems, query, "retro")}</article>`;
  }
  retroEl.innerHTML = retroHtml;

  // Sichtbarkeit
  const total = watchHits + archiveHits + retroHits;
  watchSection.hidden = Boolean(needle) && watchHits === 0;
  archivSection.hidden = Boolean(needle) && archiveHits === 0;
  retroSection.hidden = Boolean(needle) && retroHits === 0;
  statsPanel.hidden = Boolean(needle) && !pickedGenre;
  viewPanel.hidden = Boolean(needle) || Boolean(pickedGenre);

  if (needle && total === 0) {
    noteEl.hidden = false;
    noteEl.textContent = `Nichts gefunden für „${query.trim()}“.`;
  } else {
    noteEl.hidden = true;
    noteEl.textContent = "";
  }

  liveEl.textContent = needle ? `${total} Treffer.` : "";

  if (scrollToHit && needle && total > 0) {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(goToFirstHit, 60);
  }
  scrollToHit = false;
}

function goToFirstHit() {
  const mark = document.querySelector("main mark");
  if (!mark) return;
  const section = mark.closest("section");
  if (section && NAV[section.id]) setCurrent(section.id);
  const header = document.querySelector("header");
  const offset = (header ? header.offsetHeight : 0) + 16;
  const top = mark.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function pickGenre(genre) {
  pickedGenre = pickedGenre === genre ? null : genre;
  render();
  if (pickedGenre) document.getElementById("archive-list").scrollIntoView({ behavior: "smooth", block: "start" });
}

function setView(next) {
  view = next;
  document.getElementById("view-normal").className = next === "normal" ? "glow" : "quiet";
  document.getElementById("view-genre").className = next === "genre" ? "glow" : "quiet";
  document.getElementById("view-normal").setAttribute("aria-pressed", String(next === "normal"));
  document.getElementById("view-genre").setAttribute("aria-pressed", String(next === "genre"));
  render();
}

const NAV = { watch: "nav-watch", archiv: "nav-archiv", retro: "nav-retro" };

function setCurrent(id) {
  Object.keys(NAV).forEach((section) => {
    const on = section === id;
    const btn = document.getElementById(NAV[section]);
    if (on) btn.setAttribute("aria-current", "true");
    else btn.removeAttribute("aria-current");
  });
}

function jump(id) {
  setCurrent(id);
  document.getElementById(id).scrollIntoView({ behavior: "smooth", block: "start" });
}

// ========== MODAL LOGIK ==========
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modal-title");
const modalFields = document.getElementById("modal-fields");
const modalSave = document.getElementById("modal-save");
const modalCancel = document.getElementById("modal-cancel");

function openModal(type, id = null, existing = null) {
  modalMode = type;
  editingId = id;

  modalTitle.textContent = id ? "Film bearbeiten" : "Film hinzufügen";

  let html = "";

  if (type === "watch") {
    html = `
      <label>Genre</label>
      <select id="field-genre">
        ${GENRES.map(g => `<option value="${g}" ${existing?.genre === g ? "selected" : ""}>${g}</option>`).join("")}
      </select>
      <label>Titel</label>
      <input type="text" id="field-title" value="${existing?.title || ""}" placeholder="Filmtitel">
      <label>Dauer (optional)</label>
      <input type="text" id="field-duration" value="${existing?.duration || ""}" placeholder="z.B. 2h 15m">
    `;
  } else if (type === "archive") {
    html = `
      <label>Titel</label>
      <input type="text" id="field-title" value="${existing?.title || ""}" placeholder="Filmtitel">
      <label>Bewertung (1–10)</label>
      <input type="number" id="field-rating" min="1" max="10" value="${existing?.rating || 7}">
      <label>Genre</label>
      <select id="field-genre">
        ${GENRES.map(g => `<option value="${g}" ${existing?.genre === g ? "selected" : ""}>${g}</option>`).join("")}
      </select>
    `;
  } else if (type === "retro") {
    html = `
      <label>Titel</label>
      <input type="text" id="field-title" value="${existing?.title || ""}" placeholder="Titel">
    `;
  }

  modalFields.innerHTML = html;
  modal.classList.add("open");
  document.getElementById("field-title")?.focus();
}

function closeModal() {
  modal.classList.remove("open");
  modalMode = null;
  editingId = null;
}

modalCancel.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

modalSave.addEventListener("click", async () => {
  const title = document.getElementById("field-title")?.value.trim();
  if (!title) return alert("Bitte einen Titel eingeben.");

  let url = "";
  let method = editingId ? "PUT" : "POST";
  let body = {};

  if (modalMode === "watch") {
    url = editingId ? `/api/watch/${editingId}` : "/api/watch";
    body = {
      genre: document.getElementById("field-genre").value,
      title,
      duration: document.getElementById("field-duration").value.trim() || null
    };
  } else if (modalMode === "archive") {
    url = editingId ? `/api/archive/${editingId}` : "/api/archive";
    body = {
      title,
      rating: Number(document.getElementById("field-rating").value) || 7,
      genre: document.getElementById("field-genre").value
    };
  } else if (modalMode === "retro") {
    url = editingId ? `/api/retro/${editingId}` : "/api/retro";
    body = { title };
  }

  try {
    // 1. Film speichern (neu oder bearbeitet)
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    // 2. Falls wir von "→ Archiv" kommen: Original aus Watchlist löschen
    if (window._pendingWatchDelete) {
      await fetch(`/api/watch/${window._pendingWatchDelete}`, { method: "DELETE" });
      window._pendingWatchDelete = null;
    }

    closeModal();
    await loadData();
  } catch (err) {
    console.error(err);
    alert("Fehler beim Speichern");
  }
});

// Event-Delegation für Edit / Delete / Add / Send-to-Archive
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

        // Pack-Dropdown öffnen/schließen
    if (btn.id === "pack-toggle" || btn.closest("#pack-toggle")) {
    document.getElementById("pack-import").classList.toggle("open");
    return;
    }

    // Klick außerhalb schließt das Dropdown
    if (!btn.closest("#pack-import")) {
    document.getElementById("pack-import")?.classList.remove("open");
    }

    // Film-Paket importieren
    if (btn.classList.contains("pack-btn")) {
    const packId = btn.dataset.pack;
    const packName = btn.childNodes[0].textContent.trim();

    document.getElementById("pack-import").classList.remove("open");

    if (!confirm(`Möchtest du „${packName}“ in deine Watchlist importieren?\n\nDie Filme werden zur Watchlist hinzugefügt.`)) {
        return;
    }

    try {
        const res = await fetch('/api/packs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId })
        });

        const data = await res.json();

        if (!res.ok) {
        alert(data.error || 'Fehler beim Import');
        } else {
        alert(data.message);
        await loadData();
        }
    } catch (err) {
        console.error(err);
        alert('Fehler beim Importieren');
    }
    return;
    }

    // Film-Paket importieren
    if (btn.classList.contains("pack-btn")) {
    const packId = btn.dataset.pack;
    const packName = btn.textContent;

    if (!confirm(`Möchtest du wirklich „${packName}“ in deine Watchlist importieren?\n\nBereits vorhandene Filme werden nicht automatisch übersprungen.`)) {
        return;
    }

    btn.disabled = true;
    btn.textContent = "Importiere...";

    try {
        const res = await fetch('/api/packs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId })
        });

        const data = await res.json();

        if (!res.ok) {
        alert(data.error || 'Fehler beim Import');
        } else {
        alert(data.message);
        await loadData();
        }
    } catch (err) {
        console.error(err);
        alert('Fehler beim Importieren');
    } finally {
        btn.disabled = false;
        // Text wiederherstellen
        btn.textContent = packId === 'top250' 
        ? 'Top 250 Filme importieren' 
        : 'Top 250 der 80er importieren';
    }
    return;
    }

  // === Ins Archiv verschieben ===
  if (btn.classList.contains("send-archive")) {
    const watchId = btn.dataset.id;
    const title = btn.dataset.title;

    modalMode = "archive";
    editingId = null;
    window._pendingWatchDelete = watchId;

    modalTitle.textContent = "Ins Archiv übernehmen";

    modalFields.innerHTML = `
      <label>Titel</label>
      <input type="text" id="field-title" value="${title}" placeholder="Filmtitel">
      <label>Bewertung (1–10)</label>
      <input type="number" id="field-rating" min="1" max="10" value="7">
      <label>Genre</label>
      <select id="field-genre">
        ${GENRES.map(g => `<option value="${g}">${g}</option>`).join("")}
      </select>
    `;

    modal.classList.add("open");
    setTimeout(() => document.getElementById("field-title")?.focus(), 50);
    return;
  }

  // Löschen
  if (btn.classList.contains("delete")) {
    const type = btn.dataset.type;
    const id = btn.dataset.id;
    if (!confirm("Wirklich löschen?")) return;

    try {
      await fetch(`/api/${type}/${id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      console.error(err);
      alert("Fehler beim Löschen");
    }
    return;
  }

  // Bearbeiten
  if (btn.classList.contains("edit")) {
    const type = btn.dataset.type;
    const id = Number(btn.dataset.id);

    let existing = null;

    if (type === "watch") {
      for (const genre of Object.keys(WATCH)) {
        const found = (WATCH[genre] || []).find(f => Number(f.id) === id);
        if (found) {
          existing = { ...found, genre };
          break;
        }
      }
    } else if (type === "archive") {
      existing = ARCHIVE.find(f => Number(f.id) === id);
    } else if (type === "retro") {
      existing = RETRO.find(f => Number(f.id) === id);
    }

    if (!existing) {
      console.warn("Eintrag nicht gefunden", type, id);
      return;
    }

    openModal(type, id, existing);
    return;
  }

  // Hinzufügen
  if (btn.classList.contains("add-btn")) {
    window._pendingWatchDelete = null;
    openModal(btn.dataset.add);
  }
});

// Bestehende Event-Listener
searchEl.addEventListener("input", () => { scrollToHit = true; render(); });
clearEl.addEventListener("click", () => {
  searchEl.value = "";
  scrollToHit = false;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  searchEl.focus();
});
statsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-genre]");
  if (!button) return;
  pickGenre(button.getAttribute("data-genre") || null);
});
document.getElementById("nav-watch").addEventListener("click", () => jump("watch"));
document.getElementById("nav-archiv").addEventListener("click", () => jump("archiv"));
document.getElementById("nav-retro").addEventListener("click", () => jump("retro"));
document.getElementById("view-normal").addEventListener("click", () => setView("normal"));
document.getElementById("view-genre").addEventListener("click", () => setView("genre"));

const observer = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  const id = visible.target.id;
  if (NAV[id]) setCurrent(id);
}, { rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] });
observer.observe(document.getElementById("watch"));
observer.observe(document.getElementById("archiv"));
observer.observe(document.getElementById("retro"));

    // Element noch nicht da → kurz warten und nochmal versuchen
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.warn('pack-menu Element wurde nicht gefunden');
}


// Start
loadData();
render();
