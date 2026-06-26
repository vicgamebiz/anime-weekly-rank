// app.js — 정적 data.json 한 번 fetch → 메모리 상태 → 렌더 (스펙 §8)
// 외부 API 직접 호출 없음. localStorage 사용 안 함. 탭/정렬 상태는 메모리 변수.

const state = {
  data: null,
  view: "global",        // 랭킹 탭: "global" | "seasonal" | "upcoming"
  sort: "trending",      // 글로벌: "trending" | "popularity"
  seasonSort: "trending", // 시즌: "trending" | "popularity" | "score"
  upcomingSort: "popularity", // 기대작: "popularity" | "trending" | "favourites"
  upcomingIdx: 0,        // 선택된 기대작 분기 인덱스
  region: null,          // 현재 권역 key
};

const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120">' +
    '<rect width="100%" height="100%" fill="#1e222c"/>' +
    '<text x="50%" y="50%" fill="#9aa1ad" font-size="9" text-anchor="middle" dy=".3em">no image</text>' +
    "</svg>"
  );

// ---- delta 배지 렌더 ----
function deltaBadge(delta) {
  if (delta === "new" || delta === "NEW") {
    return '<span class="delta-badge delta-new">NEW</span>';
  }
  if (delta == null || delta === "0") {
    return '<span class="delta-badge delta-same">–</span>';
  }
  const n = parseInt(delta, 10);
  if (isNaN(n)) return '<span class="delta-badge delta-same">–</span>';
  if (n > 0) return `<span class="delta-badge delta-up">▲${n}</span>`;
  return `<span class="delta-badge delta-down">▼${Math.abs(n)}</span>`;
}

function imgTag(src, cls, alt) {
  const safe = src || PLACEHOLDER;
  return `<img class="${cls}" loading="lazy" alt="${escapeHtml(alt || "")}" src="${safe}" ` +
    `onerror="this.onerror=null;this.src='${PLACEHOLDER}'" />`;
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ---- 공용 애니 카드 (글로벌/시즌 공용) ----
function metricHtml(it, sort) {
  if (sort === "popularity") {
    return `<span title="인기도: 작품을 등록한 이용자 수">👥 ${(it.popularity ?? 0).toLocaleString()}</span>`;
  }
  if (sort === "score") {
    // 평점 정렬에선 ★ 배지가 이미 점수를 보여주므로, 보조 정보로 화수/형식 표시
    const ep = it.episodes ? `📺 ${it.episodes}화` : (it.format || "");
    return ep ? `<span title="에피소드 / 형식">${escapeHtml(ep)}</span>` : "";
  }
  if (sort === "favourites") {
    return `<span title="즐겨찾기: 즐겨찾기에 추가한 이용자 수">♥ ${(it.favourites ?? 0).toLocaleString()}</span>`;
  }
  return `<span title="트렌딩: 이번 주 화제성 지수">🔥 ${it.trending ?? "-"}</span>`;
}

function animeCard(it, sort) {
  const score = it.score != null
    ? `<span class="score" title="평점: AniList 평균점수 (100점 만점)">★ ${it.score}</span>`
    : "";
  const href = it.url || "#";
  return `
    <a class="card" href="${escapeHtml(href)}" target="_blank" rel="noopener">
      <div class="card-cover">
        ${imgTag(it.cover, "", it.title_en)}
        <span class="rank-badge">${it.rank}</span>
        ${deltaBadge(it.delta)}
      </div>
      <div class="card-body">
        <p class="card-title">${escapeHtml(it.title_en || it.title_romaji)}</p>
        <p class="card-romaji">${escapeHtml(it.title_romaji || "")}</p>
        <div class="card-meta">${score}${metricHtml(it, sort)}</div>
      </div>
    </a>`;
}

// ---- 글로벌 Top20 ----
function renderGlobal() {
  const grid = document.getElementById("global-grid");
  const list = (state.data.global && state.data.global[state.sort]) || [];
  grid.innerHTML = list.length
    ? list.map((it) => animeCard(it, state.sort)).join("")
    : '<p class="empty">데이터가 없습니다.</p>';
}

// ---- 이번 분기 방영작 ----
function renderSeasonal() {
  const s = state.data.seasonal;
  const label = document.getElementById("season-label");
  if (label) label.textContent = s && s.label_ko ? `(${s.label_ko} 분기)` : "";
  const list = (s && s[state.seasonSort]) || [];
  const grid = document.getElementById("seasonal-grid");
  if (!grid) return;
  grid.innerHTML = list.length
    ? list.map((it) => animeCard(it, state.seasonSort)).join("")
    : '<p class="empty">이번 분기 데이터가 없습니다.</p>';
}

// ---- 분기별 기대작 (차기 + 차차기) ----
function seasonsUpcoming() {
  return (state.data.upcoming && state.data.upcoming.seasons) || [];
}

function renderUpcomingChips() {
  const chips = document.getElementById("upcoming-chips");
  const seasons = seasonsUpcoming();
  if (!chips) return;
  chips.innerHTML = seasons.map((s, i) =>
    `<button class="chip${i === state.upcomingIdx ? " active" : ""}" data-idx="${i}">` +
    `${escapeHtml(s.label_ko || (s.season + " " + s.season_year))}</button>`
  ).join("");
  chips.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.upcomingIdx = Number(btn.dataset.idx);
      renderUpcomingChips();
      renderUpcoming();
    });
  });
}

function renderUpcoming() {
  const seasons = seasonsUpcoming();
  const grid = document.getElementById("upcoming-grid");
  const label = document.getElementById("upcoming-label");
  if (!grid) return;
  const blk = seasons[state.upcomingIdx];
  if (!blk) {
    if (label) label.textContent = "";
    grid.innerHTML = '<p class="empty">기대작 데이터가 없습니다.</p>';
    return;
  }
  if (label) label.textContent = blk.label_ko ? `(${blk.label_ko})` : "";
  const list = blk[state.upcomingSort] || [];
  grid.innerHTML = list.length
    ? list.map((it) => animeCard(it, state.upcomingSort)).join("")
    : '<p class="empty">기대작 데이터가 없습니다.</p>';
}

// ---- 랭킹 탭 전환 ----
function setTabAvailable(view, available) {
  const btn = document.querySelector(`.rank-tab[data-view="${view}"]`);
  if (btn) btn.style.display = available ? "" : "none";
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".rank-tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".rank-view").forEach((v) => {
    const on = v.id === `${view}-view`;
    v.classList.toggle("active", on);
    v.hidden = !on;
  });
}

function wireRankTabs() {
  document.querySelectorAll(".rank-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
}

// ---- 권역 탭 ----
function renderTabs() {
  const tabs = document.getElementById("region-tabs");
  const regions = state.data.regions || {};
  const keys = Object.keys(regions);
  tabs.innerHTML = keys.map((k) => {
    const active = k === state.region ? " active" : "";
    return `<button class="tab-btn${active}" data-region="${k}" role="tab">` +
      `${escapeHtml(regions[k].label_ko)}</button>`;
  }).join("");
  tabs.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.region = btn.dataset.region;
      renderTabs();
      renderRegionPanel();
    });
  });
}

// ---- 권역 패널 (좌: Netflix 실시청 / 우: Trends 관심도) ----
function netflixRow(it) {
  const thumb = it.cover
    ? imgTag(it.cover, "row-thumb", it.title)
    : `<div class="row-thumb placeholder">—</div>`;
  const href = it.url || "#";
  const sub = it.anilist_id ? "AniList" : "Netflix";
  return `
    <a class="row" href="${escapeHtml(href)}" target="_blank" rel="noopener">
      <span class="row-rank">${it.rank}</span>
      ${thumb}
      <div class="row-body">
        <div class="row-title">${escapeHtml(it.title)}</div>
        <div class="row-sub">${escapeHtml(sub)} ${deltaBadge(it.delta)}</div>
      </div>
    </a>`;
}

function trendsRow(it) {
  const thumb = it.cover
    ? imgTag(it.cover, "row-thumb", it.title)
    : `<div class="row-thumb placeholder">—</div>`;
  const w = Math.max(2, Math.min(100, it.score || 0));
  return `
    <div class="row">
      <span class="row-rank">${it.rank}</span>
      ${thumb}
      <div class="row-body">
        <div class="row-title">${escapeHtml(it.title)}</div>
        <div class="row-sub">관심도 ${it.score ?? "-"}</div>
        <div class="score-bar" style="width:${w}%"></div>
      </div>
    </div>`;
}

function renderRegionPanel() {
  const panel = document.getElementById("region-panel");
  const region = (state.data.regions || {})[state.region];
  if (!region) {
    panel.innerHTML = '<p class="empty">권역 데이터가 없습니다.</p>';
    return;
  }
  const nf = region.netflix || [];
  const tr = region.trends || [];
  const nfHtml = nf.length
    ? `<div class="list">${nf.map(netflixRow).join("")}</div>`
    : '<p class="empty">이번 주 Netflix Top10 내 애니가 없습니다.</p>';
  const trHtml = tr.length
    ? `<div class="list">${tr.map(trendsRow).join("")}</div>`
    : '<p class="empty">이번 주 관심도 데이터 없음</p>';

  panel.innerHTML = `
    <div class="region-cols">
      <div>
        <h3 class="col-head">실시청 <span class="pill">Netflix Top10</span></h3>
        ${nfHtml}
      </div>
      <div>
        <h3 class="col-head">관심도 <span class="pill">Google Trends</span></h3>
        ${trHtml}
      </div>
    </div>`;
}

// ---- 헤더/푸터 ----
function renderMeta() {
  const gen = state.data.generated_at;
  let kst = "—";
  if (gen) {
    try {
      const d = new Date(gen);
      kst = d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    } catch (e) { kst = gen; }
  }
  document.getElementById("updated").textContent =
    `최종 갱신: ${kst} (KST)` + (state.data.week ? ` · ${state.data.week}` : "");

  const s = state.data.sources || {};
  document.getElementById("sources").innerHTML =
    "데이터 출처: " +
    `<a href="${escapeHtml(s.anilist || "#")}" target="_blank" rel="noopener">AniList</a> · ` +
    `<a href="${escapeHtml(s.netflix || "#")}" target="_blank" rel="noopener">Netflix Tudum</a> · ` +
    `<a href="${escapeHtml(s.trends || "#")}" target="_blank" rel="noopener">Google Trends</a>`;
  document.getElementById("notes").textContent = state.data.notes || "";
}

// ---- 정렬 토글 ----
function wireSortToggle() {
  document.querySelectorAll("#sort-toggle .toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.sort = btn.dataset.sort;
      document.querySelectorAll("#sort-toggle .toggle-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
      renderGlobal();
    });
  });
}

function wireSeasonToggle() {
  document.querySelectorAll("#season-sort-toggle .toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.seasonSort = btn.dataset.sort;
      document.querySelectorAll("#season-sort-toggle .toggle-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
      renderSeasonal();
    });
  });
}

function wireUpcomingToggle() {
  document.querySelectorAll("#upcoming-sort-toggle .toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.upcomingSort = btn.dataset.sort;
      document.querySelectorAll("#upcoming-sort-toggle .toggle-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
      renderUpcoming();
    });
  });
}

// ---- init ----
async function init() {
  const main = document.querySelector("main");
  try {
    const res = await fetch("./data.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (e) {
    main.innerHTML = `<p class="state-msg">데이터를 불러오지 못했습니다. (${escapeHtml(e.message)})<br/>` +
      "잠시 후 다시 시도해 주세요.</p>";
    return;
  }
  const keys = Object.keys(state.data.regions || {});
  state.region = keys[0] || null;

  renderMeta();
  wireSortToggle();
  wireSeasonToggle();
  wireUpcomingToggle();
  wireRankTabs();

  // 데이터 유무에 따라 탭 노출 결정
  const s = state.data.seasonal;
  const hasSeasonal = s && ((s.trending && s.trending.length) ||
    (s.popularity && s.popularity.length) || (s.score && s.score.length));
  setTabAvailable("seasonal", !!hasSeasonal);
  setTabAvailable("upcoming", seasonsUpcoming().length > 0);

  renderGlobal();
  renderSeasonal();
  renderUpcomingChips();
  renderUpcoming();
  switchView(state.view);

  renderTabs();
  renderRegionPanel();
}

document.addEventListener("DOMContentLoaded", init);
