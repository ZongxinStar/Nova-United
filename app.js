(function () {
  "use strict";

  let data = normalizeData(window.NOVA_DATA || {});
  let editingPlayerIndex = -1;
  let editingMatchIndex = -1;
  let hasUnsavedExport = false;

  const playerForm = document.getElementById("player-form");
  const matchForm = document.getElementById("match-form");
  const playerStatus = document.getElementById("manager-status");
  const matchStatus = document.getElementById("match-status");

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[character]);
  }

  function safeInt(value) {
    return Math.max(0, Math.trunc(Number(value) || 0));
  }

  function makeId(prefix, index) {
    return `${prefix}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function normalizePositions(player) {
    const source = player.positions ?? player.position ?? player["位置"] ?? "";
    const values = Array.isArray(source) ? source : String(source).split(/[、,，/|;；]+/);
    return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
  }

  function positionLabel(player) {
    return Array.isArray(player.positions) ? player.positions.join(" / ") : "";
  }

  function normalizePlayer(player, index) {
    const rawNumber = player.number === "" || player.number == null ? null : Number(player.number);
    const normalized = {
      id: String(player.id || makeId("player", index)),
      name: String(player.name || player["姓名"] || "").trim(),
      number: Number.isFinite(rawNumber) ? Math.max(0, Math.trunc(rawNumber)) : null,
      positions: normalizePositions(player),
      photo: String(player.photo || player["照片"] || "").trim(),
      appearances: safeInt(player.appearances ?? player["出场"]),
      goals: safeInt(player.goals ?? player["进球"]),
      assists: safeInt(player.assists ?? player["助攻"])
    };
    if (!normalized.name) throw new Error(`第 ${index + 1} 行缺少球员姓名`);
    return normalized;
  }

  function normalizeMatch(match, index, playerIds) {
    const lineup = Array.isArray(match.lineup) ? match.lineup : [];
    const normalizedLineup = lineup.map(item => ({
      playerId: String(item.playerId || ""),
      role: item.role === "starter" ? "starter" : "substitute",
      goals: safeInt(item.goals),
      assists: safeInt(item.assists),
      captain: Boolean(item.captain),
      goalkeeper: Boolean(item.goalkeeper)
    })).filter(item => playerIds.has(item.playerId));
    let captainAssigned = false;
    let goalkeeperAssigned = false;
    normalizedLineup.forEach(item => {
      if (item.captain && captainAssigned) item.captain = false;
      if (item.goalkeeper && goalkeeperAssigned) item.goalkeeper = false;
      if (item.captain) captainAssigned = true;
      if (item.goalkeeper) goalkeeperAssigned = true;
    });
    return {
      id: String(match.id || makeId("match", index)),
      date: String(match.date || ""),
      time: String(match.time || ""),
      matchType: String(match.matchType || match["比赛类型"] || "").trim(),
      venue: String(match.venue || "").trim(),
      opponent: String(match.opponent || "").trim(),
      opponentGoals: safeInt(match.opponentGoals),
      lineup: normalizedLineup
    };
  }

  function normalizeUpcomingMatch(match, index) {
    const rawPrediction = match?.prediction;
    const prediction = rawPrediction && typeof rawPrediction === "object" ? {
      outcome: String(rawPrediction.outcome || "").trim(),
      teamGoals: safeInt(rawPrediction.teamGoals),
      opponentGoals: safeInt(rawPrediction.opponentGoals),
      scorers: Array.isArray(rawPrediction.scorers)
        ? rawPrediction.scorers.map(item => ({
          name: String(item?.name || "").trim(),
          goals: Math.max(1, safeInt(item?.goals))
        })).filter(item => item.name)
        : [],
      basis: String(rawPrediction.basis || "").trim()
    } : null;
    return {
      id: String(match.id || makeId("upcoming-match", index)),
      date: String(match.date || ""),
      time: String(match.time || ""),
      matchType: String(match.matchType || match["比赛类型"] || "").trim(),
      venue: String(match.venue || "").trim(),
      opponent: String(match.opponent || "").trim(),
      prediction
    };
  }

  function normalizeData(raw) {
    const team = raw && raw.team ? raw.team : { name: "Nova United", season: "2026" };
    const players = Array.isArray(raw?.players) ? raw.players.map(normalizePlayer) : [];
    const playerIds = new Set(players.map(player => player.id));
    const matches = Array.isArray(raw?.matches)
      ? raw.matches.map((match, index) => normalizeMatch(match, index, playerIds))
      : [];
    const futureMatches = Array.isArray(raw?.futureMatches)
      ? raw.futureMatches.map(normalizeUpcomingMatch)
      : [];
    return { team, players, matches, futureMatches };
  }

  function stat(label, value) {
    return `<div><strong>${escapeHTML(value)}</strong><span>${label}</span></div>`;
  }

  function teamGoals(match) {
    return match.lineup.reduce((sum, item) => sum + safeInt(item.goals), 0);
  }

  function playerTotals() {
    const totals = new Map(data.players.map(player => [player.id, { ...player }]));
    data.matches.forEach(match => match.lineup.forEach(item => {
      const player = totals.get(item.playerId);
      if (!player) return;
      player.appearances += 1;
      player.goals += item.goals;
      player.assists += item.assists;
    }));
    return data.players.map(player => totals.get(player.id));
  }

  function seasonRecord() {
    const record = { played: data.matches.length, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 };
    data.matches.forEach(match => {
      const goals = teamGoals(match);
      record.goalsFor += goals;
      record.goalsAgainst += match.opponentGoals;
      if (goals > match.opponentGoals) record.wins += 1;
      else if (goals < match.opponentGoals) record.losses += 1;
      else record.draws += 1;
    });
    record.goalDifference = record.goalsFor - record.goalsAgainst;
    return record;
  }

  function formatDate(date) {
    if (!date) return "日期待定";
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat("zh-CN", {
      year: "numeric", month: "long", day: "numeric"
    }).format(parsed);
  }

  function playerLabel(item, playerMap) {
    const player = playerMap.get(item.playerId);
    if (!player) return "未知球员";
    const badges = [
      item.captain ? '<span class="lineup-badge" title="队长">队长</span>' : "",
      item.goalkeeper ? '<span class="lineup-badge goalkeeper" title="门将">门将</span>' : ""
    ].join("");
    return `${escapeHTML(player.name)}${player.number == null ? "" : ` #${player.number}`}${badges}`;
  }

  function playerAvatar(player) {
    const initial = escapeHTML(player.name.slice(0, 1));
    if (!player.photo) return `<div class="player-avatar" aria-hidden="true">${initial}</div>`;
    return `<div class="player-avatar has-photo"><img src="${escapeHTML(player.photo)}" alt="${escapeHTML(player.name)}的照片" data-photo-fallback="${initial}"></div>`;
  }

  function attachPhotoFallbacks(container) {
    container.querySelectorAll("[data-photo-fallback]").forEach(image => {
      image.addEventListener("error", () => {
        const holder = image.parentElement;
        holder.classList.remove("has-photo");
        holder.textContent = image.dataset.photoFallback;
      }, { once: true });
    });
  }

  function eventList(match, field, unit, playerMap) {
    const entries = match.lineup.filter(item => item[field] > 0);
    return entries.length
      ? entries.map(item => `${playerLabel(item, playerMap)} × ${item[field]}${unit}`).join("、")
      : "暂无";
  }

  function compareRankingPlayers(board, a, b) {
    if (board.field === "goals") {
      return b.goals - a.goals
        || a.appearances - b.appearances
        || b.assists - a.assists
        || a.name.localeCompare(b.name, "zh-CN");
    }
    return b[board.field] - a[board.field] || a.name.localeCompare(b.name, "zh-CN");
  }

  function renderHome() {
    const heroNumber = document.getElementById("hero-number");
    if (!heroNumber) return;
    const firstPlayer = playerTotals()[0];
    heroNumber.textContent = firstPlayer?.number ?? "—";
    document.getElementById("hero-name").textContent = firstPlayer?.name || "等待球员数据";
    document.getElementById("hero-stats").innerHTML = firstPlayer
      ? stat("出场", firstPlayer.appearances) + stat("进球", firstPlayer.goals) + stat("助攻", firstPlayer.assists)
      : "";
    const seasonGrid = document.getElementById("season-record-grid");
    if (seasonGrid) {
      const record = seasonRecord();
      const items = [
        ["比赛", record.played], ["胜", record.wins], ["平", record.draws], ["负", record.losses],
        ["进球", record.goalsFor], ["失球", record.goalsAgainst], ["净胜球", record.goalDifference > 0 ? `+${record.goalDifference}` : record.goalDifference]
      ];
      seasonGrid.innerHTML = items.map(([label, value]) => `<div class="season-record-item"><strong>${value}</strong><span>${label}</span></div>`).join("");
    }
  }

  const playerNameCollator = new Intl.Collator("zh-CN-u-co-pinyin", {
    numeric: true,
    sensitivity: "base"
  });

  function comparePlayersForDisplay(a, b, field, direction) {
    let comparison = 0;

    if (field === "name") {
      comparison = playerNameCollator.compare(a.name, b.name);
    } else if (field === "number") {
      const aHasNumber = a.number != null;
      const bHasNumber = b.number != null;
      if (aHasNumber !== bHasNumber) return aHasNumber ? -1 : 1;
      comparison = safeInt(a.number) - safeInt(b.number);
    } else {
      comparison = safeInt(a[field]) - safeInt(b[field]);
    }

    if (comparison === 0) return playerNameCollator.compare(a.name, b.name);
    return direction === "desc" ? -comparison : comparison;
  }

  function renderPlayers() {
    const container = document.getElementById("player-grid");
    if (!container) return;
    const sortField = document.getElementById("player-sort-field")?.value || "name";
    const sortDirection = document.getElementById("player-sort-direction")?.value || "asc";
    const players = [...playerTotals()].sort((a, b) =>
      comparePlayersForDisplay(a, b, sortField, sortDirection)
    );
    container.innerHTML = players.length ? players.map((player, index) => {
      const numberLabel = player.number == null ? "号码待定" : `#${player.number}`;
      const positions = positionLabel(player);
      const detailLine = `${numberLabel}${positions ? ` · ${escapeHTML(positions)}` : ""}`;
      return `<article class="player-card">
        <div class="card-index">${String(index + 1).padStart(2, "0")}</div>
        <div class="card-number">${player.number ?? "—"}</div>
        <div class="card-identity">${playerAvatar(player)}<div><h3>${escapeHTML(player.name)}</h3><p>NOVA UNITED · ${detailLine}</p></div></div>
        <div class="card-stats">${stat("出场", player.appearances)}${stat("进球", player.goals)}${stat("助攻", player.assists)}</div>
      </article>`;
    }).join("") : '<p class="empty-message">暂时没有球员，请在管理数据页面添加球员。</p>';
    attachPhotoFallbacks(container);
  }

  function renderUpcomingMatches() {
    const container = document.getElementById("upcoming-match-grid");
    if (!container) return;
    const matchSortKey = match => `${match.date || "9999-12-31"}T${match.time || "23:59"}`;
    const matches = [...data.futureMatches].sort((a, b) => matchSortKey(a).localeCompare(matchSortKey(b)));
    container.innerHTML = matches.length ? matches.map(match => {
      const prediction = match.prediction;
      const predictedScorers = prediction?.scorers.length
        ? prediction.scorers.map(item => `${escapeHTML(item.name)} × ${item.goals}球`).join("、")
        : "暂未预测";
      const predictionPanel = prediction ? `<aside class="ai-prediction" aria-label="AI赛果预测">
        <div class="ai-prediction-head"><span>AI 预测</span><strong>${escapeHTML(prediction.outcome || "赛果待定")}</strong></div>
        <div class="ai-prediction-score"><span>预测比分</span><b>Nova United ${prediction.teamGoals} : ${prediction.opponentGoals} ${escapeHTML(match.opponent || "对手")}</b></div>
        <div class="ai-prediction-scorers"><span>预计进球</span><b>${predictedScorers}</b></div>
        <p>${escapeHTML(prediction.basis || "根据现有比赛数据生成")} · 仅供娱乐</p>
      </aside>` : "";
      return `<article class="match-card upcoming-match-card" data-result="upcoming">
        <div class="match-meta"><span>${escapeHTML(formatDate(match.date))}${match.matchType ? ` · ${escapeHTML(match.matchType)}` : ""}</span><span class="match-result upcoming-status">待开赛</span></div>
        <div class="match-scoreline"><h3>Nova United <span>vs</span> ${escapeHTML(match.opponent || "对手待定")}</h3><div class="upcoming-kickoff">${escapeHTML(match.time || "时间待定")}</div></div>
        <div class="match-details">
          <div class="match-detail-row"><b>比赛地点</b><span>${escapeHTML(match.venue || "地点待定")}</span></div>
          <div class="match-detail-row"><b>开球时间</b><span>${escapeHTML(match.time || "待定")}</span></div>
        </div>
        ${predictionPanel}
      </article>`;
    }).join("") : '<p class="empty-message">暂时没有未来比赛安排。</p>';
  }

  function renderMatches() {
    const container = document.getElementById("match-grid");
    if (!container) return;
    const playerMap = new Map(data.players.map(player => [player.id, player]));
    const matchSortKey = match => `${match.date || "0000-00-00"}T${match.time || "00:00"}`;
    const matches = [...data.matches].sort((a, b) => matchSortKey(b).localeCompare(matchSortKey(a)));
    container.innerHTML = matches.length ? matches.map(match => {
      const goals = teamGoals(match);
      const result = goals > match.opponentGoals ? "win" : goals < match.opponentGoals ? "loss" : "draw";
      const resultLabel = result === "win" ? "胜" : result === "loss" ? "负" : "平";
      const starters = match.lineup.filter(item => item.role === "starter");
      const substitutes = match.lineup.filter(item => item.role === "substitute");
      const list = entries => entries.length ? entries.map(item => playerLabel(item, playerMap)).join("、") : "暂无";
      return `<article class="match-card" data-result="${result}">
        <div class="match-meta"><span>${escapeHTML(formatDate(match.date))}${match.time ? ` · ${escapeHTML(match.time)}` : ""}${match.matchType ? ` · ${escapeHTML(match.matchType)}` : ""}</span><span class="match-result">${resultLabel}</span></div>
        <div class="match-scoreline"><h3>Nova United <span>vs</span> ${escapeHTML(match.opponent || "对手待定")}</h3><div class="match-score">${goals} : ${match.opponentGoals}</div></div>
        <div class="match-details">
          <div class="match-detail-row"><b>比赛地点</b><span>${escapeHTML(match.venue || "地点待定")}</span></div>
          <div class="match-detail-row"><b>首发球员</b><span>${list(starters)}</span></div>
          <div class="match-detail-row"><b>替补球员</b><span>${list(substitutes)}</span></div>
          <div class="match-detail-row"><b>进球</b><span>${eventList(match, "goals", "球", playerMap)}</span></div>
          <div class="match-detail-row"><b>助攻</b><span>${eventList(match, "assists", "次", playerMap)}</span></div>
        </div>
      </article>`;
    }).join("") : '<p class="empty-message">暂时没有比赛记录，请在管理数据页面添加第一场比赛。</p>';
  }

  function renderRankings() {
    const container = document.getElementById("ranking-grid");
    if (!container) return;
    const players = playerTotals();
    const boards = [
      { title: "射手榜", field: "goals", unit: "球", code: "GOALS" },
      { title: "助攻榜", field: "assists", unit: "次", code: "ASSISTS" },
      { title: "出场榜", field: "appearances", unit: "场", code: "APPEARANCES" }
    ];
    container.innerHTML = boards.map(board => {
      const sorted = [...players].sort((a, b) => compareRankingPlayers(board, a, b));
      return `<article class="ranking-card"><div class="ranking-head"><div><span>${board.code}</span><h3>${board.title}</h3></div><span class="ranking-count">${sorted.length}</span></div><ol>${sorted.map((player, index) => {
        const numberLabel = player.number == null ? "号码待定" : `#${player.number}`;
        const rankMeta = board.field === "goals" ? `${numberLabel} · ${player.appearances}场 · ${player.assists}助攻` : numberLabel;
        return `<li><span class="rank">${String(index + 1).padStart(2, "0")}</span><span class="rank-name"><b>${escapeHTML(player.name)}</b><small>${escapeHTML(rankMeta)}</small></span><strong>${player[board.field]}<small>${board.unit}</small></strong></li>`;
      }).join("")}</ol></article>`;
    }).join("");
  }

  function renderLineupEditor(selectedLineup = []) {
    const container = document.getElementById("lineup-editor");
    if (!container) return;
    const selected = new Map(selectedLineup.map(item => [item.playerId, item]));
    container.innerHTML = data.players.length ? data.players.map(player => {
      const item = selected.get(player.id) || { role: "none", goals: 0, assists: 0, captain: false, goalkeeper: false };
      const positions = positionLabel(player);
      return `<div class="lineup-row" data-player-id="${escapeHTML(player.id)}">
        <div class="lineup-player"><span>${escapeHTML(player.name)}</span><small>${player.number == null ? "号码待定" : `#${player.number}`}${positions ? ` · ${escapeHTML(positions)}` : ""}</small></div>
        <label>出场身份<select data-field="role"><option value="none"${item.role === "none" ? " selected" : ""}>未出场</option><option value="starter"${item.role === "starter" ? " selected" : ""}>首发</option><option value="substitute"${item.role === "substitute" ? " selected" : ""}>替补</option></select></label>
        <label>进球<input data-field="goals" type="number" min="0" value="${safeInt(item.goals)}"></label>
        <label>助攻<input data-field="assists" type="number" min="0" value="${safeInt(item.assists)}"></label>
        <label class="lineup-flag"><input data-field="captain" type="checkbox"${item.captain ? " checked" : ""}>队长</label>
        <label class="lineup-flag"><input data-field="goalkeeper" type="checkbox"${item.goalkeeper ? " checked" : ""}>门将</label>
      </div>`;
    }).join("") : '<p class="empty-message">请先添加球员，再录入比赛。</p>';
    updateCalculatedGoals();
  }

  function collectLineup() {
    return [...document.querySelectorAll(".lineup-row")].map(row => ({
      playerId: row.dataset.playerId,
      role: row.querySelector('[data-field="role"]').value,
      goals: safeInt(row.querySelector('[data-field="goals"]').value),
      assists: safeInt(row.querySelector('[data-field="assists"]').value),
      captain: row.querySelector('[data-field="captain"]').checked,
      goalkeeper: row.querySelector('[data-field="goalkeeper"]').checked
    })).filter(item => item.role !== "none");
  }

  function updateCalculatedGoals() {
    const output = document.getElementById("calculated-team-goals");
    if (!output) return;
    output.textContent = [...document.querySelectorAll('.lineup-row [data-field="goals"]')]
      .reduce((sum, input) => sum + safeInt(input.value), 0);
  }

  function renderManager() {
    const playerList = document.getElementById("manager-player-list");
    if (!playerList) return;
    playerList.innerHTML = data.players.length ? data.players.map((player, index) => `<tr><td>${escapeHTML(player.name)}</td><td>${player.number ?? "—"}</td><td>${escapeHTML(positionLabel(player) || "—")}</td><td>${player.photo ? "已设置" : "—"}</td><td>${player.appearances}</td><td>${player.goals}</td><td>${player.assists}</td><td><div class="row-actions"><button type="button" data-player-edit="${index}">编辑</button><button type="button" data-player-delete="${index}">删除</button></div></td></tr>`).join("") : '<tr><td colspan="8">暂无球员</td></tr>';
    const matchList = document.getElementById("manager-match-list");
    matchList.innerHTML = data.matches.length ? data.matches.map((match, index) => `<tr><td>${escapeHTML(match.date || "—")} ${escapeHTML(match.time || "")}</td><td>${escapeHTML(match.matchType || "—")}</td><td>${escapeHTML(match.opponent || "—")}</td><td>${teamGoals(match)} : ${match.opponentGoals}</td><td>${escapeHTML(match.venue || "—")}</td><td><div class="row-actions"><button type="button" data-match-edit="${index}">编辑</button><button type="button" data-match-delete="${index}">删除</button></div></td></tr>`).join("") : '<tr><td colspan="6">暂无比赛记录</td></tr>';
    if (editingMatchIndex < 0) renderLineupEditor();
  }

  function renderAll(message, target = "player", changed = false) {
    window.NOVA_DATA = data;
    renderHome();
    renderPlayers();
    renderUpcomingMatches();
    renderMatches();
    renderRankings();
    renderManager();
    if (changed) hasUnsavedExport = true;
    if (message) (target === "match" ? matchStatus : playerStatus).textContent = message;
  }

  function resetPlayerForm() {
    if (!playerForm) return;
    playerForm.reset();
    playerForm.querySelectorAll('input[name="positions"]').forEach(input => { input.checked = false; });
    playerForm.elements.photo.value = "";
    playerForm.elements.appearances.value = 0;
    playerForm.elements.goals.value = 0;
    playerForm.elements.assists.value = 0;
    editingPlayerIndex = -1;
    document.getElementById("save-player").textContent = "添加球员";
    document.getElementById("cancel-edit").hidden = true;
  }

  function resetMatchForm() {
    if (!matchForm) return;
    matchForm.reset();
    matchForm.elements.opponentGoals.value = 0;
    editingMatchIndex = -1;
    document.getElementById("save-match").textContent = "添加比赛";
    document.getElementById("cancel-match-edit").hidden = true;
    renderLineupEditor();
  }

  function selectedPlayerPositions() {
    if (!playerForm) return [];
    return [...playerForm.querySelectorAll('input[name="positions"]:checked')].map(input => input.value);
  }

  function setPlayerPositions(positions) {
    const selected = new Set(Array.isArray(positions) ? positions : []);
    playerForm.querySelectorAll('input[name="positions"]').forEach(input => {
      input.checked = selected.has(input.value);
    });
  }

  function parseCSV(text) {
    const clean = text.replace(/^\uFEFF/, "").trim();
    const firstLine = clean.split(/\r?\n/, 1)[0] || "";
    const delimiter = [",", "\t", ";"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let index = 0; index < clean.length; index += 1) {
      const character = clean[index];
      if (character === '"') {
        if (quoted && clean[index + 1] === '"') { field += '"'; index += 1; } else quoted = !quoted;
      } else if (character === delimiter && !quoted) {
        row.push(field.trim()); field = "";
      } else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && clean[index + 1] === "\n") index += 1;
        row.push(field.trim()); field = "";
        if (row.some(cell => cell !== "")) rows.push(row);
        row = [];
      } else field += character;
    }
    row.push(field.trim());
    if (row.some(cell => cell !== "")) rows.push(row);
    if (rows.length < 2) throw new Error("CSV 中没有可导入的球员数据");
    const aliases = { "姓名": "name", "name": "name", "号码": "number", "number": "number", "位置": "positions", "position": "positions", "positions": "positions", "照片": "photo", "photo": "photo", "出场": "appearances", "appearances": "appearances", "进球": "goals", "goals": "goals", "助攻": "assists", "assists": "assists" };
    const headers = rows[0].map(item => aliases[item.trim().toLowerCase()] || aliases[item.trim()]);
    if (!headers.includes("name")) throw new Error("CSV 必须包含“姓名”或 name 列");
    return rows.slice(1).map((cells, index) => {
      const player = {};
      headers.forEach((header, column) => { if (header) player[header] = cells[column] ?? ""; });
      return normalizePlayer(player, index);
    });
  }

  function parseDataFile(filename, text) {
    if (filename.toLowerCase().endsWith(".csv")) {
      return normalizeData({ team: data.team, players: parseCSV(text), matches: [] });
    }
    if (filename.toLowerCase().endsWith(".js")) {
      const match = text.trim().match(/^window\.NOVA_DATA\s*=\s*([\s\S]*?);?\s*$/);
      if (!match) throw new Error("无法识别该 data.js 文件");
      return normalizeData(JSON.parse(match[1]));
    }
    const parsed = JSON.parse(text);
    return Array.isArray(parsed)
      ? normalizeData({ team: data.team, players: parsed, matches: [] })
      : normalizeData(parsed);
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  if (playerForm) {
    playerForm.addEventListener("submit", event => {
      event.preventDefault();
      try {
        const player = normalizePlayer({
          id: editingPlayerIndex >= 0 ? data.players[editingPlayerIndex].id : undefined,
          name: playerForm.elements.name.value,
          number: playerForm.elements.number.value,
          positions: selectedPlayerPositions(),
          photo: playerForm.elements.photo.value,
          appearances: playerForm.elements.appearances.value,
          goals: playerForm.elements.goals.value,
          assists: playerForm.elements.assists.value
        }, editingPlayerIndex >= 0 ? editingPlayerIndex : data.players.length);
        const editing = editingPlayerIndex >= 0;
        if (editing) data.players[editingPlayerIndex] = player; else data.players.push(player);
        resetPlayerForm();
        renderAll(`${editing ? "已更新" : "已添加"} ${player.name}。请下载新的 data.js 保存修改。`, "player", true);
      } catch (error) { playerStatus.textContent = `保存失败：${error.message}`; }
    });

    document.getElementById("manager-player-list").addEventListener("click", event => {
      const editButton = event.target.closest("[data-player-edit]");
      const deleteButton = event.target.closest("[data-player-delete]");
      if (editButton) {
        editingPlayerIndex = Number(editButton.dataset.playerEdit);
        const player = data.players[editingPlayerIndex];
        playerForm.elements.name.value = player.name;
        playerForm.elements.number.value = player.number ?? "";
        setPlayerPositions(player.positions);
        playerForm.elements.photo.value = player.photo || "";
        playerForm.elements.appearances.value = player.appearances;
        playerForm.elements.goals.value = player.goals;
        playerForm.elements.assists.value = player.assists;
        document.getElementById("save-player").textContent = "保存修改";
        document.getElementById("cancel-edit").hidden = false;
        playerForm.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (deleteButton) {
        const index = Number(deleteButton.dataset.playerDelete);
        const player = data.players[index];
        if (confirm(`确定删除 ${player.name} 吗？该球员也会从已有比赛阵容中移除。`)) {
          data.players.splice(index, 1);
          data.matches.forEach(match => { match.lineup = match.lineup.filter(item => item.playerId !== player.id); });
          resetPlayerForm(); resetMatchForm();
          renderAll(`已删除 ${player.name}。请下载新的 data.js 保存修改。`, "player", true);
        }
      }
    });

    document.getElementById("cancel-edit").addEventListener("click", resetPlayerForm);
    document.getElementById("lineup-editor").addEventListener("input", event => {
      const field = event.target.dataset.field;
      if ((field === "captain" || field === "goalkeeper") && event.target.checked) {
        document.querySelectorAll(`[data-field="${field}"]`).forEach(input => {
          if (input !== event.target) input.checked = false;
        });
        const role = event.target.closest(".lineup-row").querySelector('[data-field="role"]');
        if (role.value === "none") role.value = "starter";
      }
      if ((field === "goals" || field === "assists") && safeInt(event.target.value) > 0) {
        const role = event.target.closest(".lineup-row").querySelector('[data-field="role"]');
        if (role.value === "none") role.value = "substitute";
      }
      updateCalculatedGoals();
    });

    matchForm.addEventListener("submit", event => {
      event.preventDefault();
      try {
        const lineup = collectLineup();
        if (!data.players.length) throw new Error("请先添加球员");
        if (!lineup.length) throw new Error("请至少选择一名首发或替补球员");
        const match = normalizeMatch({
          id: editingMatchIndex >= 0 ? data.matches[editingMatchIndex].id : undefined,
          date: matchForm.elements.date.value,
          time: matchForm.elements.time.value,
          matchType: matchForm.elements.matchType.value,
          venue: matchForm.elements.venue.value,
          opponent: matchForm.elements.opponent.value,
          opponentGoals: matchForm.elements.opponentGoals.value,
          lineup
        }, editingMatchIndex >= 0 ? editingMatchIndex : data.matches.length, new Set(data.players.map(player => player.id)));
        if (!match.date) throw new Error("请填写比赛日期");
        if (!match.opponent) throw new Error("请填写对手球队");
        const editing = editingMatchIndex >= 0;
        if (editing) data.matches[editingMatchIndex] = match; else data.matches.push(match);
        resetMatchForm();
        renderAll(`${editing ? "已更新" : "已添加"}对阵 ${match.opponent} 的比赛。请下载新的 data.js 保存修改。`, "match", true);
      } catch (error) { matchStatus.textContent = `保存失败：${error.message}`; }
    });

    document.getElementById("manager-match-list").addEventListener("click", event => {
      const editButton = event.target.closest("[data-match-edit]");
      const deleteButton = event.target.closest("[data-match-delete]");
      if (editButton) {
        editingMatchIndex = Number(editButton.dataset.matchEdit);
        const match = data.matches[editingMatchIndex];
        matchForm.elements.date.value = match.date;
        matchForm.elements.time.value = match.time;
        matchForm.elements.matchType.value = match.matchType;
        matchForm.elements.venue.value = match.venue;
        matchForm.elements.opponent.value = match.opponent;
        matchForm.elements.opponentGoals.value = match.opponentGoals;
        renderLineupEditor(match.lineup);
        document.getElementById("save-match").textContent = "保存比赛修改";
        document.getElementById("cancel-match-edit").hidden = false;
        matchForm.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (deleteButton) {
        const index = Number(deleteButton.dataset.matchDelete);
        const match = data.matches[index];
        if (confirm(`确定删除对阵 ${match.opponent} 的比赛吗？相关球员数据将自动扣除。`)) {
          data.matches.splice(index, 1);
          resetMatchForm();
          renderAll(`已删除对阵 ${match.opponent} 的比赛。请下载新的 data.js 保存修改。`, "match", true);
        }
      }
    });

    document.getElementById("cancel-match-edit").addEventListener("click", resetMatchForm);
    document.getElementById("data-file").addEventListener("change", async event => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const imported = parseDataFile(file.name, await file.text());
        if (!imported.players.length) throw new Error("文件中没有球员数据");
        if (confirm("导入将替换当前球员和比赛数据，确定继续吗？")) {
          data = imported;
          resetPlayerForm(); resetMatchForm();
          renderAll(`成功导入 ${data.players.length} 名球员和 ${data.matches.length} 场比赛。请下载新的 data.js 保存。`, "player", true);
        }
      } catch (error) { playerStatus.textContent = `导入失败：${error.message}`; }
      event.target.value = "";
    });

    document.getElementById("download-template").addEventListener("click", () => {
      const rows = [["姓名", "号码", "位置", "照片", "出场", "进球", "助攻"], ...data.players.map(player => [player.name, player.number ?? "", player.positions.join("、"), player.photo, player.appearances, player.goals, player.assists])];
      downloadFile("nova-united-player-template.csv", "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
      playerStatus.textContent = "CSV 模板已下载，可以用 Excel 打开并填写历史基础数据。";
    });

    document.getElementById("export-json").addEventListener("click", () => {
      downloadFile("nova-united-data.json", JSON.stringify(data, null, 2), "application/json;charset=utf-8");
      playerStatus.textContent = "包含球员和比赛的数据备份已导出。";
    });

    document.getElementById("export-data").addEventListener("click", () => {
      const serialized = JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
      downloadFile("data.js", `window.NOVA_DATA = ${serialized};\n`, "text/javascript;charset=utf-8");
      hasUnsavedExport = false;
      playerStatus.textContent = "新的 data.js 已下载。请用它替换网站文件夹中的旧 data.js。";
    });

    window.addEventListener("beforeunload", event => {
      if (!hasUnsavedExport) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  const playerSortField = document.getElementById("player-sort-field");
  const playerSortDirection = document.getElementById("player-sort-direction");
  playerSortField?.addEventListener("change", renderPlayers);
  playerSortDirection?.addEventListener("change", renderPlayers);

  renderAll();
})();
