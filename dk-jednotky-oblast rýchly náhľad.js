/*
 * DK – Jednotky kmeňa v oblasti (útoky a čísla na mape), verzia 3.1
 * Samostatný script bez Tampermonkey. Spúšťa sa kliknutím na odkaz v Rýchlej lište.
 * Po každom prechode na novú stránku hry je ho treba spustiť znova.
 *
 * Odkaz v Rýchlej lište (URL nahraď adresou, kde máš tento súbor):
 *   javascript:$.getScript('https://TVOJA-ADRESA/dk-jednotky-oblast.js');void(0);
 */
(function () {
  'use strict';
  if (typeof game_data === 'undefined') {
    alert('Script treba spustiť priamo v hre Divoké kmene.');
    return;
  }
  // Ak je script už načítaný (opakovaný klik v Rýchlej lište), len otvor panel
  if (window.__dktTribeTroops) { window.__dktTribeTroops.open(); return; }

  /* ---------- konfigurácia ---------- */
  const DELAY_MS = 350; // pauza medzi načítaniami hráčov
  const BTN_BOTTOM = '33vh'; // výška tlačidla
  const UNITS = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult', 'knight', 'snob', 'militia'];
  const LABEL = { spear: 'Kop', sword: 'Meč', axe: 'Sek', archer: 'Luk', spy: 'Špeh', light: 'LK', marcher: 'JL', heavy: 'ŤK', ram: 'Baran', catapult: 'Kat', knight: 'Pal', snob: 'Šľ', militia: 'Mil' };
  const POP = { spear: 1, sword: 1, axe: 1, archer: 1, spy: 2, light: 4, marcher: 5, heavy: 6, ram: 5, catapult: 8, knight: 10, snob: 100, militia: 0 };
  const PRESETS = {
    'Všetko': UNITS,
    'Deff': ['spear', 'sword', 'archer', 'heavy'],
    'Off': ['axe', 'light', 'marcher', 'ram', 'catapult']
  };
  const KEY = 'dkTribeTroops_' + game_data.world;
  const KEY_SEL = KEY + '_sel';
  const KEY_ROW = KEY + '_row';
  const DATA_VER = 4; // v4: ukladá aj počet útokov na dedinu
  const KEY_MAP = KEY + '_mapmode';
  const KEY_NOKN = KEY + '_noknight';
  const MODE = 'members_defense';
  const AVAIL_RE = /dostupn|v dedin|v dědin|available|in village|at home/i;
  const AWAY_RE = /mimo|cest|prich|away|outside|on the way|transit|incoming/i;

  /* ---------- pomocné ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const base = () => game_data.link_base_pure;
  const fmt = n => n.toLocaleString('sk-SK');

  async function getDoc(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    return new DOMParser().parseFromString(await r.text(), 'text/html');
  }

  function loadJSON(k) {
    try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; }
  }
  function saveJSON(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* plné úložisko */ }
  }

  /* ---------- načítanie dát ---------- */
  async function getMembers() {
    const doc = await getDoc(base() + 'ally&mode=' + MODE);
    let opts = [...doc.querySelectorAll('select[name="player_id"] option, select#player_id option')];
    if (!opts.length) {
      let best = [];
      doc.querySelectorAll('select').forEach(sel => {
        const o = [...sel.options].filter(x => /^\d+$/.test(x.value) && +x.value > 0);
        if (o.length > best.length) best = o;
      });
      opts = best;
    }
    let members = opts
      .filter(o => /^\d+$/.test(o.value) && +o.value > 0)
      .map(o => ({ id: o.value, name: o.textContent.trim() }));
    if (members.length < 2) {
      const d2 = await getDoc(base() + 'ally&mode=members');
      const seen = new Set();
      members = [];
      d2.querySelectorAll('a[href*="screen=info_player"]').forEach(a => {
        const m = a.getAttribute('href').match(/[?&]id=(\d+)/);
        if (m && !seen.has(m[1])) { seen.add(m[1]); members.push({ id: m[1], name: a.textContent.trim() }); }
      });
    }
    return members;
  }

  function buildGrid(rows) {
    const grid = [];
    rows.forEach((tr, r) => {
      grid[r] = grid[r] || [];
      let c = 0;
      for (const cell of tr.children) {
        while (grid[r][c]) c++;
        const rs = Math.max(1, parseInt(cell.getAttribute('rowspan'), 10) || 1);
        const cs = Math.max(1, parseInt(cell.getAttribute('colspan'), 10) || 1);
        for (let i = 0; i < rs; i++) {
          grid[r + i] = grid[r + i] || [];
          for (let j = 0; j < cs; j++) grid[r + i][c + j] = { cell, origin: i === 0 && j === 0 };
        }
        c += cs;
      }
    });
    return grid;
  }

  function parseTroops(doc) {
    const villages = [];
    const seen = new Set();
    for (const table of doc.querySelectorAll('table')) {
      if (table.querySelector('table')) continue;
      const rows = [...table.querySelectorAll('tr')];
      const hr = rows.findIndex(tr => tr.querySelector('img[src*="unit_"]'));
      if (hr < 0) continue;
      const grid = buildGrid(rows);
      const colUnit = {};
      (grid[hr] || []).forEach((g, c) => {
        if (!g || !g.origin) return;
        const img = g.cell.querySelector('img[src*="unit_"]');
        if (!img) return;
        const m = (img.getAttribute('src') || '').match(/unit_(\w+)\./);
        if (m && UNITS.includes(m[1])) colUnit[c] = m[1];
      });
      const cols = Object.keys(colUnit).map(Number);
      if (!cols.length) continue;
      // stĺpec s počtom útokov na dedinu: hlavička s ikonou útoku a číslom v zátvorke, napr. "(45)"
      let attCol = -1;
      (grid[hr] || []).forEach((g, c) => {
        if (attCol >= 0 || !g || !g.origin || (c in colUnit)) return;
        const img = g.cell.querySelector('img');
        const srcAttr = img ? (img.getAttribute('src') || '') : '';
        const txt = g.cell.textContent || '';
        if (/attack/i.test(srcAttr) || /^\s*\(\s*\d+\s*\)\s*$/.test(txt)) attCol = c;
      });
      let cur = null;
      for (let r = hr + 1; r < rows.length; r++) {
        const row = grid[r] || [];
        let m = null, nameCell = null;
        for (const g of row) {
          if (!g) continue;
          const mm = g.cell.textContent.match(/(\d{3})\|(\d{3})/);
          if (mm) { m = mm; nameCell = g.cell; break; }
        }
        if (!m) continue;
        const key = m[1] + '|' + m[2];
        if (!cur || cur.key !== key) {
          if (seen.has(key)) { cur = null; continue; }
          seen.add(key);
          cur = { key, x: +m[1], y: +m[2], name: nameCell.textContent.trim().replace(/\s+/g, ' '), attacks: null, rows: [] };
          if (attCol >= 0 && row[attCol]) cur.attacks = parseInt(row[attCol].cell.textContent.replace(/\D/g, ''), 10) || 0;
          villages.push(cur);
        }
        const units = {};
        let any = false;
        cols.forEach(c => {
          const g = row[c];
          if (!g) return;
          units[colUnit[c]] = parseInt(g.cell.textContent.replace(/\D/g, ''), 10) || 0;
          any = true;
        });
        if (!any) continue;
        const label = row
          .map((g, c) => (g && g.origin && !(c in colUnit)) ? g.cell.textContent.trim().replace(/\s+/g, ' ') : '')
          .filter(t => /[A-Za-z\u00C0-\u024F]/.test(t) && !/\d{3}\|\d{3}/.test(t))
          .join(' ');
        cur.rows.push({ label, units });
      }
    }
    return villages.filter(v => v.rows.length);
  }

  async function refresh(setStatus) {
    const members = await getMembers();
    if (!members.length) throw new Error('Nenašli sa členovia (máš oprávnenie vidieť jednotky členov?)');
    const data = { ver: DATA_VER, time: Date.now(), players: [] };
    for (let i = 0; i < members.length; i++) {
      setStatus(`Načítavam ${i + 1}/${members.length}: ${members[i].name}`);
      try {
        const doc = await getDoc(`${base()}ally&mode=${MODE}&player_id=${members[i].id}`);
        data.players.push({ id: members[i].id, name: members[i].name, villages: parseTroops(doc) });
      } catch (e) { /* preskoč */ }
      await sleep(DELAY_MS);
    }
    saveJSON(KEY, data);
    return data;
  }

  /* ---------- geometria ---------- */
  function inShape(s, x, y) {
    if (s.type === 'circle') return Math.hypot(x - s.x, y - s.y) <= s.r;
    const p = s.pts;
    let c = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  const rectPts = (a, b) => [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];

  function describe(s) {
    if (s.type === 'circle') return `kruh ${s.x}|${s.y}, r = ${s.r}`;
    return `tvar z ${s.pts.length} bodov`;
  }

  /* ---------- stav a vyúčtovanie ---------- */
  let data = loadJSON(KEY);
  if (data && data.ver !== DATA_VER) data = null;
  let rowIdx = loadJSON(KEY_ROW);
  let selPlayers = null; // null = všetci hráči, inak pole ID hráčov

  function sampleVillage() {
    let best = null;
    if (!data) return null;
    for (const p of data.players) for (const v of p.villages) if (!best || v.rows.length > best.rows.length) best = v;
    return best;
  }
  function autoRow() {
    const sv = sampleVillage();
    if (!sv) return 0;
    const i = sv.rows.findIndex(r => AVAIL_RE.test(r.label) && !AWAY_RE.test(r.label));
    if (i >= 0) return i;
    return sv.rows.length > 1 ? 1 : 0;
  }
  const curRow = () => (rowIdx !== null && rowIdx !== undefined ? rowIdx : autoRow());
  const rowOf = v => v.rows[Math.min(curRow(), v.rows.length - 1)];
  function srcLabel() {
    const sv = sampleVillage();
    if (!sv) return '';
    const r = sv.rows[Math.min(curRow(), sv.rows.length - 1)];
    return r.label || 'riadok ' + (curRow() + 1);
  }
  let sel = (loadJSON(KEY_SEL) || UNITS).filter(u => UNITS.includes(u));
  let excludeKnight = loadJSON(KEY_NOKN) === true; // vynechať dediny s paladínom (mobilný deff)
  let mapMode = loadJSON(KEY_MAP); // 'pop' | 'att' | 'both'
  if (!['pop', 'att', 'both'].includes(mapMode)) mapMode = 'pop';
  let shape = null;
  let highlight = [];
  let lastText = '';

  function calc(data, shape, sel, selPlayers) {
    const total = {};
    const perPlayer = [];
    const villagesDetail = [];
    let villagesCount = 0;
    let totalAttacks = 0;
    let skippedKnight = 0;

    for (const p of data.players) {
      if (selPlayers && !selPlayers.includes(p.id)) continue;
      const sum = {};
      let n = 0;
      let att = 0;
      for (const v of p.villages) {
        if (!inShape(shape, v.x, v.y)) continue;
        const ru = rowOf(v).units;
        if (excludeKnight && (ru.knight || 0) > 0) { skippedKnight++; continue; }
        n++;
        const vUnits = {};
        for (const u of sel) {
          vUnits[u] = ru[u] || 0;
          total[u] = (total[u] || 0) + vUnits[u];
          sum[u] = (sum[u] || 0) + vUnits[u];
        }
        const vPop = popOf(vUnits, sel);
        att += v.attacks || 0;
        totalAttacks += v.attacks || 0;
        villagesDetail.push({
          x: v.x,
          y: v.y,
          name: v.name,
          player: p.name,
          units: vUnits,
          pop: vPop,
          attacks: v.attacks == null ? null : v.attacks
        });
      }
      villagesCount += n;
      const any = sel.some(u => sum[u]);
      if (n && (any || att > 0)) {
        perPlayer.push({ name: p.name, n, sum, attacks: att });
      }
    }
    return { total, perPlayer, villages: villagesCount, villagesDetail, attacks: totalAttacks, skippedKnight };
  }

  const popOf = (sum, sel) => sel.reduce((a, u) => a + (sum[u] || 0) * POP[u], 0);

  /* ---------- UI: panel ---------- */
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;left:6px;bottom:${BTN_BOTTOM};z-index:99999;font:12px Arial,sans-serif;display:flex;flex-direction:column-reverse;align-items:flex-start;`;
  box.innerHTML = `
    <button id="dkt-toggle" style="padding:8px 10px;background:#7d510f;color:#fff;border:1px solid #3e2a07;border-radius:6px;font-weight:bold">🛡️ Jednotky v oblasti</button>
    <div id="dkt-panel" style="display:none;margin-bottom:4px;width:94vw;max-width:540px;max-height:calc(100vh - ${BTN_BOTTOM} - 60px);overflow:auto;background:#f4e4bc;border:2px solid #7d510f;border-radius:6px;padding:8px;color:#000">
      <div style="margin-bottom:6px"><button id="dkt-load">⟳ Načítať jednotky</button></div>
      <div style="margin-bottom:6px"><b>Kresliť na:</b>
        <select id="dkt-surface"><option value="map">Hlavná mapa</option><option value="mini">Minimapa</option></select>
        <button id="dkt-calmini">Kalibrovať minimapu</button>
        <button id="dkt-automini">Auto</button>
      </div>
      <div style="margin-bottom:2px"><b>Tvar:</b></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
        <button data-mode="circle">◯ Kruh</button>
        <button data-mode="rect">▭ Obdĺžnik</button>
        <button data-mode="poly">⬠ Mnohouholník</button>
        <button data-mode="free">✎ Voľná ruka</button>
        <button id="dkt-clear">✕ Zmazať tvar</button>
      </div>
      <div style="margin-bottom:6px">
        Kruh ručne: X <input id="dkt-x" type="number" style="width:52px"> Y <input id="dkt-y" type="number" style="width:52px">
        r <input id="dkt-r" type="number" value="10" step="0.5" style="width:46px">
        <button id="dkt-calc">Spočítať</button>
      </div>
      <div style="margin-bottom:6px"><b>Zdroj údajov:</b> <select id="dkt-src" style="max-width:62%"></select></div>
      <div style="margin-bottom:2px"><b>Filter hráčov:</b></div>
      <div id="dkt-players-filter" style="max-height:80px;overflow-y:auto;border:1px solid #7d510f;background:#fff;padding:4px;margin-bottom:6px;border-radius:4px"></div>
      <div style="margin-bottom:2px"><b>Jednotky:</b></div>
      <div id="dkt-presets" style="display:flex;gap:6px;margin-bottom:4px"></div>
      <div id="dkt-chips" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px"></div>
      <div style="margin-bottom:6px"><label><input type="checkbox" id="dkt-noknight"> <b>Vynechať dediny s paladínom</b> (mobilný deff)</label></div>
      <div style="margin-bottom:6px"><b>Na mape zobraziť:</b>
        <select id="dkt-mapmode">
          <option value="pop">Populáciu jednotiek</option>
          <option value="att">Počet útokov na dediny</option>
          <option value="both">Populáciu aj útoky</option>
        </select>
      </div>
      <div id="dkt-status" style="color:#5a3a00;margin-bottom:6px"></div>
      <div id="dkt-out"></div>
    </div>`;
  document.body.appendChild(box);

  const bar = document.createElement('div');
  bar.style.cssText = 'display:none;position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:100000;background:#f4e4bc;border:2px solid #7d510f;border-radius:6px;padding:6px;font:12px Arial,sans-serif;text-align:center;color:#000;max-width:96vw';
  bar.innerHTML = `
    <div id="dkt-hint" style="margin-bottom:4px"></div>
    <button id="dkt-done">✔ Hotovo</button>
    <button id="dkt-undo">↶ Späť</button>
    <button id="dkt-pan">✋ Posun mapy: vyp.</button>
    <button id="dkt-cancel">✕ Zrušiť</button>
    <div id="dkt-dbg" style="color:#900;margin-top:4px;font-size:11px"></div>`;
  document.body.appendChild(bar);

  const $ = id => document.getElementById(id);
  const setStatus = t => { $('dkt-status').textContent = t; };

  function cacheInfo() {
    if (!data) return setStatus('Dáta nie sú načítané – klikni na „Načítať jednotky“.');
    const n = data.players.reduce((a, p) => a + p.villages.length, 0);
    setStatus(`Dáta z ${new Date(data.time).toLocaleString('sk-SK')} • ${data.players.length} hráčov • ${n} dedín`);
  }

  function renderSrc() {
    const sel_ = $('dkt-src');
    sel_.innerHTML = '';
    const sv = sampleVillage();
    if (!sv) { sel_.innerHTML = '<option>(najprv načítaj jednotky)</option>'; return; }
    const o0 = document.createElement('option');
    o0.value = 'auto';
    o0.textContent = 'Automaticky (dostupné v dedine)';
    sel_.appendChild(o0);
    sv.rows.forEach((r, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = `${i + 1}. ${r.label || '(bez názvu)'}`;
      sel_.appendChild(o);
    });
    sel_.value = rowIdx === null || rowIdx === undefined ? 'auto' : String(rowIdx);
    sel_.onchange = () => {
      rowIdx = sel_.value === 'auto' ? null : +sel_.value;
      saveJSON(KEY_ROW, rowIdx);
      renderResult();
    };
  }

  function renderPlayersFilter() {
    const container = $('dkt-players-filter');
    container.innerHTML = '';
    if (!data || !data.players.length) {
      container.innerHTML = '<i>Žiadni hráči k dispozícii</i>';
      return;
    }

    const allChecked = !selPlayers;
    const topDiv = document.createElement('div');
    topDiv.innerHTML = `<label><input type="checkbox" id="dkt-p-all" ${allChecked ? 'checked' : ''}> <b>Všetci hráči</b></label>`;
    container.appendChild(topDiv);

    $('dkt-p-all').onchange = (e) => {
      selPlayers = e.target.checked ? null : data.players.map(p => p.id);
      renderPlayersFilter();
      renderResult();
    };

    data.players.forEach(p => {
      const isChecked = allChecked || selPlayers.includes(p.id);
      const div = document.createElement('div');
      div.style.marginLeft = '12px';
      div.innerHTML = `<label><input type="checkbox" class="dkt-p-item" value="${p.id}" ${isChecked ? 'checked' : ''}> ${esc(p.name)}</label>`;
      container.appendChild(div);
    });

    container.querySelectorAll('.dkt-p-item').forEach(chk => {
      chk.onchange = () => {
        const checkedBoxes = [...container.querySelectorAll('.dkt-p-item:checked')].map(cb => cb.value);
        if (checkedBoxes.length === data.players.length) {
          selPlayers = null;
        } else {
          selPlayers = checkedBoxes;
        }
        $('dkt-p-all').checked = (selPlayers === null);
        renderResult();
      };
    });
  }

  function availableUnits() {
    if (!data) return UNITS.filter(u => u !== 'militia');
    return UNITS.filter(u => data.players.some(p => p.villages.some(v => v.rows.some(r => r.units[u]))));
  }

  function renderFilter() {
    const avail = availableUnits();
    const pre = $('dkt-presets');
    pre.innerHTML = '';
    Object.keys(PRESETS).forEach(name => {
      const b = document.createElement('button');
      b.textContent = name;
      b.onclick = () => { sel = PRESETS[name].filter(u => avail.includes(u)); saveJSON(KEY_SEL, sel); renderFilter(); renderResult(); };
      pre.appendChild(b);
    });
    const chips = $('dkt-chips');
    chips.innerHTML = '';
    avail.forEach(u => {
      const on = sel.includes(u);
      const b = document.createElement('button');
      b.textContent = LABEL[u];
      b.style.cssText = `padding:4px 7px;border:1px solid #7d510f;border-radius:10px;background:${on ? '#7d510f' : '#fff'};color:${on ? '#fff' : '#000'}`;
      b.onclick = () => {
        sel = sel.includes(u) ? sel.filter(x => x !== u) : sel.concat(u);
        sel = UNITS.filter(x => sel.includes(x));
        saveJSON(KEY_SEL, sel);
        renderFilter();
        renderResult();
      };
      chips.appendChild(b);
    });
  }

  /* ---------- výpočet a výstup výsledkov s detailom dedín ---------- */
  function renderResult() {
    const out = $('dkt-out');
    if (!shape) { out.innerHTML = ''; highlight = []; return; }
    if (!data) { setStatus('Najprv načítaj jednotky.'); return; }

    const res = calc(data, shape, sel, selPlayers);
    highlight = res.villagesDetail;
    const cols = sel.filter(u => res.total[u]);
    // útoky poznáme, ak sa pri načítaní našiel stĺpec s útokmi
    const attKnown = data.players.some(p => p.villages.some(v => v.attacks != null));
    const byAtt = mapMode === 'att';

    let h = `<b>Oblasť: ${esc(describe(shape))}</b> • dediny v oblasti: ${res.villages} • hráči: ${res.perPlayer.length}` +
      (excludeKnight ? ` • vynechané s paladínom: ${res.skippedKnight}` : '') +
      (attKnown ? ` • útoky: <b style="color:${res.attacks > 0 ? '#b00000' : '#000'}">${fmt(res.attacks)}</b>` : '') +
      ` • zdroj: ${esc(srcLabel())}<br>`;
    if (!attKnown) {
      h += '<i style="color:#900">Počet útokov sa v načítaných dátach nenašiel. Klikni znova na „Načítať jednotky“ (stránka Obrana musí mať stĺpec s útokmi).</i><br>';
    }
    if (!cols.length && !(attKnown && res.attacks > 0)) {
      h += '<i>V oblasti nie sú žiadne vybrané jednotky.</i>';
      out.innerHTML = h;
      lastText = '';
      return;
    }

    const attTh = attKnown ? '<th title="Prichádzajúce útoky">⚔</th>' : '';
    const attTd = a => attKnown ? `<td align="right" style="${a > 0 ? 'color:#b00000;font-weight:bold' : 'color:#888'}">${fmt(a)}</td>` : '';

    // Sumár na hráča
    h += '<div style="margin-top:6px;font-weight:bold">Súhrn podľa hráčov:</div>';
    h += '<table style="border-collapse:collapse;width:100%;margin-top:2px;font-size:11px"><tr style="background:#c1a264"><th style="text-align:left">Hráč</th><th>Ded.</th>' +
      cols.map(u => `<th>${LABEL[u]}</th>`).join('') + '<th>Pop.</th>' + attTh + '</tr>';
    const sortedPlayers = res.perPlayer.slice().sort((a, b) =>
      byAtt ? (b.attacks - a.attacks) || (popOf(b.sum, sel) - popOf(a.sum, sel)) : popOf(b.sum, sel) - popOf(a.sum, sel));
    for (const p of sortedPlayers) {
      h += `<tr><td>${esc(p.name)}</td><td align="center">${p.n}</td>` +
        cols.map(u => `<td align="right">${fmt(p.sum[u] || 0)}</td>`).join('') + `<td align="right">${fmt(popOf(p.sum, sel))}</td>` + attTd(p.attacks) + '</tr>';
    }
    h += `<tr style="background:#c1a264;font-weight:bold"><td>SPOLU</td><td align="center">${res.villages}</td>` +
      cols.map(u => `<td align="right">${fmt(res.total[u])}</td>`).join('') + `<td align="right">${fmt(popOf(res.total, sel))}</td>` +
      (attKnown ? `<td align="right">${fmt(res.attacks)}</td>` : '') + '</tr></table>';

    // Zoznam jednotlivých dedín a ich jednotiek
    h += '<div style="margin-top:8px;font-weight:bold">Jednotky a útoky v jednotlivých dedinách:</div>';
    h += '<div style="max-height:160px;overflow-y:auto;border:1px solid #7d510f;background:#fff;padding:2px">';
    h += '<table style="border-collapse:collapse;width:100%;font-size:11px"><tr style="background:#e6d3a3;position:sticky;top:0"><th style="text-align:left">Dedina</th><th style="text-align:left">Hráč</th>' +
      cols.map(u => `<th>${LABEL[u]}</th>`).join('') + '<th>Pop.</th>' + attTh + '</tr>';

    const sortedVillages = res.villagesDetail.slice().sort((a, b) =>
      byAtt ? ((b.attacks || 0) - (a.attacks || 0)) || (b.pop - a.pop) : b.pop - a.pop);
    for (const v of sortedVillages) {
      h += `<tr><td>${v.x}|${v.y} ${esc(v.name)}</td><td>${esc(v.player)}</td>` +
        cols.map(u => `<td align="right">${fmt(v.units[u] || 0)}</td>`).join('') +
        `<td align="right"><b>${fmt(v.pop)}</b></td>` + attTd(v.attacks || 0) + '</tr>';
    }
    h += '</table></div>';
    h += '<button id="dkt-copy" style="margin-top:6px">Kopírovať</button>';
    out.innerHTML = h;

    lastText = `Oblasť: ${describe(shape)}, dedín: ${res.villages}\n` +
      cols.map(u => `${LABEL[u]}: ${res.total[u]}`).join(', ') + `\nCelková populácia: ${popOf(res.total, sel)}` +
      (attKnown ? `\nPrichádzajúce útoky: ${res.attacks}` : '') +
      (excludeKnight ? `\n(bez dedín s paladínom: ${res.skippedKnight})` : '');

    $('dkt-copy').onclick = () => {
      (navigator.clipboard ? navigator.clipboard.writeText(lastText) : Promise.reject())
        .then(() => setStatus('Skopírované.'), () => prompt('Skopíruj:', lastText));
    };
    cacheInfo();
  }

  /* ---------- mapa a minimapa: povrchy na kreslenie ---------- */
  let timer = null;
  const calib = { x: 0, y: 0 };
  let calibDone = false;
  let miniManual = null;

  const hasMap = () => typeof TWMap !== 'undefined' && TWMap && TWMap.map && typeof TWMap.map.pixelByCoord === 'function';
  const dbg = t => { const el = $('dkt-dbg'); if (el) el.textContent = t || ''; };

  function mapRect() {
    const cands = ['map', 'map_container', 'map_wrap']
      .map(id => document.getElementById(id))
      .filter(Boolean)
      .map(el => el.getBoundingClientRect())
      .filter(r => r.width > 20 && r.height > 20);
    if (hasMap() && cands.length) {
      try {
        const g = geo();
        const sz = TWMap.size;
        if (sz && sz[0] > 2 && sz[1] > 2) {
          let best = null, bestErr = 1e9;
          for (const r of cands) {
            const err = Math.abs(r.width / Math.abs(g.dx) - sz[0]) + Math.abs(r.height / Math.abs(g.dy) - sz[1]);
            if (err < bestErr) { bestErr = err; best = r; }
          }
          if (best && bestErr < 1.2) return best;
        }
      } catch (err) {}
    }
    const el = document.getElementById('map_container') || document.getElementById('map');
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 20 && r.height > 20) return r;
    }
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }

  function geo() {
    const m = TWMap.map;
    const pos = m.pos || [0, 0];
    const p0 = m.pixelByCoord(0, 0);
    const p1 = m.pixelByCoord(1, 1);
    const ts = TWMap.tileSize || [53, 38];
    let dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    if (!isFinite(dx) || !dx) dx = ts[0];
    if (!isFinite(dy) || !dy) dy = ts[1];
    return { bx: p0[0] - pos[0], by: p0[1] - pos[1], dx, dy, cx: calib.x, cy: calib.y };
  }

  const toScr = (g, x, y) => [g.bx + (x - g.cx + 0.5) * g.dx, g.by + (y - g.cy + 0.5) * g.dy];
  const toGame = (g, sx, sy) => [(sx - g.bx) / g.dx - 0.5 + g.cx, (sy - g.by) / g.dy - 0.5 + g.cy];

  function calibrate(e, g, rect) {
    try {
      if (typeof TWMap.map.coordByEvent !== 'function') return;
      const ce = TWMap.map.coordByEvent(e);
      if (!ce || !isFinite(ce[0]) || !isFinite(ce[1])) return;
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      calib.x = +ce[0] - Math.floor((sx - g.bx) / g.dx);
      calib.y = +ce[1] - Math.floor((sy - g.by) / g.dy);
      calibDone = true;
    } catch (err) {}
  }

  function miniEls() {
    let best = null, area = 0;
    document.querySelectorAll('[id*="minimap" i]').forEach(el => {
      if (/viewport|mover|marker/i.test(el.id) || el.closest('#dkt-panel')) return;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) return;
      if (r.width * r.height > area) { area = r.width * r.height; best = el; }
    });
    if (!best) return null;
    const vp = best.querySelector('[id*="viewport" i], [class*="viewport" i]') ||
      document.querySelector('[id*="minimap" i][id*="viewport" i]');
    return { cont: best, vp };
  }

  function pickViewport(cont, fx, fy) {
    const cr = cont.getBoundingClientRect();
    const want = fx / fy;
    let best = null, bestScore = 1e9;
    (cont.parentElement || cont).querySelectorAll('*').forEach(el => {
      const tag = el.tagName;
      if (['A', 'IMG', 'BUTTON', 'CANVAS', 'SELECT', 'INPUT'].includes(tag)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.width > cr.width * 0.7 || r.height > cr.height * 0.7) return;
      if (r.left < cr.left - 4 || r.top < cr.top - 4 || r.right > cr.right + 4 || r.bottom > cr.bottom + 4) return;
      const name = el.id + ' ' + (typeof el.className === 'string' ? el.className : '');
      const score = Math.abs(r.width / r.height - want) + (/viewport/i.test(name) ? 0 : 0.15);
      if (score < bestScore) { bestScore = score; best = el; }
    });
    return bestScore < 0.35 ? best : null;
  }

  function miniGeo() {
    if (miniManual) return { bx: miniManual.bx, by: miniManual.by, dx: miniManual.dx, dy: miniManual.dy, cx: 0, cy: 0 };
    const els = miniEls();
    if (!els || !hasMap()) return null;
    const mr = mapRect(), mg = geo();
    const sz = TWMap.size;
    const okSz = sz && sz[0] > 2 && sz[0] < 80 && sz[1] > 2 && sz[1] < 80;
    const fx = okSz ? +sz[0] : mr.width / Math.abs(mg.dx);
    const fy = okSz ? +sz[1] : mr.height / Math.abs(mg.dy);
    const vp = pickViewport(els.cont, fx, fy);
    if (!vp) return null;
    const cr = els.cont.getBoundingClientRect();
    const vr = vp.getBoundingClientRect();
    const sxm = vr.width / fx, sym = vr.height / fy;
    const d = (sxm + sym) / 2;
    if (!isFinite(d) || d < 0.3 || d > 100 || Math.abs(sxm - sym) > 0.3 * d) return null;
    const ucC = (mr.width / 2 - mg.bx) / mg.dx + calib.x;
    const vcC = (mr.height / 2 - mg.by) / mg.dy + calib.y;
    let uC = ucC, vC = vcC;
    const pos = TWMap.pos;
    if (okSz && pos && isFinite(pos[0]) && isFinite(pos[1])) {
      const c1 = [+pos[0] + fx / 2, +pos[1] + fy / 2];
      const c2 = [+pos[0], +pos[1]];
      const near = Math.hypot(c1[0] - ucC, c1[1] - vcC) <= Math.hypot(c2[0] - ucC, c2[1] - vcC) ? c1 : c2;
      uC = near[0]; vC = near[1];
    }
    return { bx: (vr.left + vr.width / 2 - cr.left) - uC * d, by: (vr.top + vr.height / 2 - cr.top) - vC * d, dx: d, dy: d, cx: 0, cy: 0 };
  }

  const surf = {
    map: { name: 'map', canvas: null, ready: () => hasMap(), rect: mapRect, geo: () => (hasMap() ? geo() : null) },
    mini: {
      name: 'mini', canvas: null,
      ready: () => !!miniEls(),
      rect: () => { const e = miniEls(); return e ? e.cont.getBoundingClientRect() : null; },
      geo: miniGeo
    }
  };

  function ensureCanvas(s) {
    if (!s.ready()) return null;
    const r = s.rect();
    if (!r) return null;
    if (!s.canvas) {
      s.canvas = document.createElement('canvas');
      s.canvas.style.cssText = 'position:fixed;pointer-events:none;touch-action:none;z-index:99990;';
      document.body.appendChild(s.canvas);
      bindCanvas(s);
    }
    s.canvas.style.left = r.left + 'px';
    s.canvas.style.top = r.top + 'px';
    const w = Math.round(r.width), h = Math.round(r.height);
    if (s.canvas.width !== w) s.canvas.width = w;
    if (s.canvas.height !== h) s.canvas.height = h;
    return s.canvas;
  }

  function drawShape(ctx, g, s, draft) {
    ctx.beginPath();
    if (s.type === 'circle') {
      const c = toScr(g, s.x, s.y);
      ctx.ellipse(c[0], c[1], Math.abs(s.r * g.dx), Math.abs(s.r * g.dy), 0, 0, Math.PI * 2);
    } else {
      s.pts.forEach((p, i) => {
        const q = toScr(g, p[0], p[1]);
        if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
      });
      if (!draft || s.closed) ctx.closePath();
    }
    if (!draft || s.type === 'circle' || s.closed) {
      ctx.fillStyle = 'rgba(255,0,0,0.15)';
      ctx.fill();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = draft ? 'rgba(0,80,200,0.95)' : 'rgba(200,0,0,0.95)';
    ctx.stroke();
  }

  /* --- Zobrazenie populácie a/alebo počtu útokov ako čísla priamo pri dedine na mape --- */
  function drawBubble(ctx, x, y, text, fg, bg) {
    ctx.font = 'bold 11px Arial';
    const w = ctx.measureText(text).width + 8;
    const h = 17;
    ctx.fillStyle = bg;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x - w / 2, y - h / 2, w, h, 4);
    else ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fg;
    ctx.fillText(text, x, y);
  }

  function drawMarks(ctx, g) {
    if (!highlight.length) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const both = mapMode === 'both';

    for (const v of highlight) {
      const q = toScr(g, v.x, v.y);
      const att = v.attacks || 0;

      if (mapMode === 'pop' || both) {
        // pri zobrazení oboch údajov je populácia nad stredom, útoky pod ním
        const dy = both && att > 0 ? -9 : 0;
        drawBubble(ctx, q[0], q[1] + dy, fmt(v.pop), v.pop > 0 ? '#ffeb3b' : '#cccccc', 'rgba(0, 0, 0, 0.8)');
      }
      if (mapMode === 'att' || both) {
        if (att > 0) {
          drawBubble(ctx, q[0], q[1] + (both ? 9 : 0), '⚔ ' + fmt(att), '#ffffff', 'rgba(190, 0, 0, 0.92)');
        } else if (mapMode === 'att') {
          // dedina bez útokov: malý šedý bod, aby bolo vidieť, že je v oblasti
          ctx.beginPath();
          ctx.arc(q[0], q[1], 4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(160, 160, 160, 0.9)';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }
      }
    }
  }

  function redraw() {
    const anything = shape || (drawing && drawing.draft);
    for (const s of [surf.map, surf.mini]) {
      try {
        if (!anything) {
          if (s.canvas) s.canvas.getContext('2d').clearRect(0, 0, s.canvas.width, s.canvas.height);
          continue;
        }
        const cv = ensureCanvas(s);
        if (!cv) continue;
        const ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, cv.width, cv.height);
        const g = s.geo();
        if (!g) continue;
        if (shape) { drawShape(ctx, g, shape, false); drawMarks(ctx, g); }
        if (drawing && drawing.draft) {
          let d = drawing.draft;
          if (d.type === 'rect') d = { type: 'poly', pts: rectPts(d.a, d.b), closed: true };
          drawShape(ctx, g, d, true);
        }
      } catch (err) {
        dbg('Chyba kreslenia: ' + err.message);
      }
    }
  }

  function ensureTimer() {
    if (!timer) timer = setInterval(redraw, 120);
  }

  let drawing = null;

  const HINT = {
    circle: 'Kruh: ťukni na stred a ťahaj prstom k okraju.',
    rect: 'Obdĺžnik: ťahaj prstom z jedného rohu do protiľahlého.',
    poly: 'Mnohouholník: ťukaj body po obvode, potom „Hotovo“.',
    free: 'Voľná ruka: ťahaj prstom okolo oblasti.'
  };

  function updateHint() {
    if (!drawing) return;
    let t = (drawing.surface.name === 'mini' ? '[Minimapa] ' : '') + HINT[drawing.mode];
    if (drawing.mode === 'poly') {
      const n = drawing.draft ? drawing.draft.pts.length : 0;
      t += ` Body: ${n}` + (n >= 3 ? ' (ťuk na prvý bod alebo „Hotovo“ uzavrie tvar)' : '');
    }
    $('dkt-hint').textContent = t;
  }

  function openBar(mode, s) {
    drawing = { mode, surface: s, draft: null, dragging: false, pan: false, calPts: [] };
    $('dkt-panel').style.display = 'none';
    updateHint();
    dbg('');
    $('dkt-done').style.display = mode === 'poly' ? '' : 'none';
    $('dkt-undo').style.display = mode === 'poly' ? '' : 'none';$('dkt-pan').textContent = '✋ Posun: vyp.';
    bar.style.display = 'block';
    applyPointerMode();
    redraw();
  }

  function startDrawing(mode) {
    const which = $('dkt-surface').value;
    const s = surf[which] || surf.map;
    if (s.name === 'map' && !hasMap()) { setStatus('Mapa nie je dostupná.'); return; }
    if (s.name === 'mini' && (!miniEls() || !s.geo())) { setStatus('Minimapa nie je pripravená.'); return; }
    ensureTimer();
    if (!ensureCanvas(s)) return;
    openBar(mode, s);
  }

  function applyPointerMode() {
    for (const s of [surf.map, surf.mini]) {
      if (s.canvas) s.canvas.style.pointerEvents = drawing && drawing.surface === s && !drawing.pan ? 'auto' : 'none';
    }
  }

  function stopDrawing() {
    drawing = null;
    bar.style.display = 'none';
    applyPointerMode();
    redraw();
  }

  function finish() {
    if (!drawing || !drawing.draft) { stopDrawing(); $('dkt-panel').style.display = 'block'; return; }
    const d = drawing.draft;
    let s = null;
    if (d.type === 'circle') {
      s = { type: 'circle', x: Math.round(d.x), y: Math.round(d.y), r: Math.max(0.5, Math.round(d.r * 2) / 2) };
      $('dkt-x').value = s.x; $('dkt-y').value = s.y; $('dkt-r').value = s.r;
    } else if (d.type === 'rect') {
      s = { type: 'poly', pts: rectPts(d.a, d.b) };
    } else if (d.pts.length >= 3) {
      s = { type: 'poly', pts: d.pts };
    }
    stopDrawing();
    $('dkt-panel').style.display = 'block';
    if (!s) { setStatus('Tvar potrebuje aspoň 3 body.'); return; }
    shape = s;
    redraw();
    renderResult();
  }

  function bindCanvas(s) {
    const rectOf = () => s.canvas.getBoundingClientRect();
    s.canvas.addEventListener('pointerdown', e => {
      if (!drawing || drawing.pan || drawing.surface !== s) return;
      try {
        e.preventDefault();
        try { s.canvas.setPointerCapture(e.pointerId); } catch (err) {}
        const r = rectOf();
        let g = s.geo();
        if (!g) return;
        if (s.name === 'map') { calibrate(e, g, r); g = s.geo(); }
        const p = toGame(g, e.clientX - r.left, e.clientY - r.top);
        if (!isFinite(p[0]) || !isFinite(p[1])) return;
        const m = drawing.mode;
        if (m === 'circle') { drawing.draft = { type: 'circle', x: p[0], y: p[1], r: 0 }; drawing.dragging = true; }
        else if (m === 'rect') { drawing.draft = { type: 'rect', a: p, b: p }; drawing.dragging = true; }
        else if (m === 'free') { drawing.draft = { type: 'poly', pts: [p] }; drawing.dragging = true; }
        else if (m === 'poly') {
          if (!drawing.draft) drawing.draft = { type: 'poly', pts: [] };
          const pts = drawing.draft.pts;
          if (pts.length >= 3 && Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) < 1.0) { finish(); return; }
          pts.push(p);
          updateHint();
        }
        redraw();
      } catch (err) {}
    });

    s.canvas.addEventListener('pointermove', e => {
      if (!drawing || !drawing.dragging || drawing.surface !== s) return;
      try {
        e.preventDefault();
        const g = s.geo();
        const r = rectOf();
        const p = toGame(g, e.clientX - r.left, e.clientY - r.top);
        const d = drawing.draft;
        if (d.type === 'circle') d.r = Math.hypot(p[0] - d.x, p[1] - d.y);
        else if (d.type === 'rect') d.b = p;
        else {
          const last = d.pts[d.pts.length - 1];
          if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 0.25) d.pts.push(p);
        }
        redraw();
      } catch (err) {}
    });

    const up = () => {
      if (!drawing || !drawing.dragging || drawing.surface !== s) return;
      drawing.dragging = false;
      try { finish(); } catch (err) {}
    };
    s.canvas.addEventListener('pointerup', up);
    s.canvas.addEventListener('pointercancel', up);
  }

  ['click', 'dblclick', 'mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'contextmenu', 'wheel']
    .forEach(t => window.addEventListener(t, e => {
      if (drawing && !drawing.pan && drawing.surface.canvas && e.target === drawing.surface.canvas) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
      }
    }, { capture: true, passive: false }));

  $('dkt-done').onclick = finish;
  $('dkt-undo').onclick = () => { if (drawing && drawing.draft && drawing.draft.pts) { drawing.draft.pts.pop(); updateHint(); redraw(); } };$('dkt-pan').onclick = () => {
    if (!drawing) return;
    drawing.pan = !drawing.pan;
    $('dkt-pan').textContent = '✋ Posun: ' + (drawing.pan ? 'zap.' : 'vyp.');
    applyPointerMode();
  };
  $('dkt-cancel').onclick = () => { stopDrawing();$('dkt-panel').style.display = 'block'; };

  $('dkt-toggle').onclick = () => {
    const p = $('dkt-panel');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
    if (p.style.display === 'block') { cacheInfo(); renderSrc(); renderPlayersFilter(); renderFilter(); }
  };

  box.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => startDrawing(b.dataset.mode); });

  $('dkt-load').onclick = async () => {
    const btn = $('dkt-load');
    btn.disabled = true;
    try {
      data = await refresh(setStatus);
      cacheInfo();
      renderSrc();
      renderPlayersFilter();
      renderFilter();
      renderResult();
    } catch (e) {
      setStatus('Chyba: ' + e.message);
    }
    btn.disabled = false;
  };

  $('dkt-calc').onclick = () => {
    const x = parseFloat($('dkt-x').value), y = parseFloat($('dkt-y').value), r = parseFloat($('dkt-r').value);
    if ([x, y, r].some(isNaN)) { setStatus('Zadaj X, Y a polomer.'); return; }
    shape = { type: 'circle', x, y, r };
    ensureTimer();
    redraw();
    renderResult();
  };

  $('dkt-calmini').onclick = () => setStatus('Použi automatické zosúladenie alebo predchádzajúce nastavenie minimapy.');
  $('dkt-automini').onclick = () => { miniManual = null; setStatus('Minimapa: zosúladené automaticky.'); };

  $('dkt-clear').onclick = () => {
    shape = null;
    highlight = [];
    stopDrawing();
    $('dkt-out').innerHTML = '';
  };

  $('dkt-noknight').checked = excludeKnight;
  $('dkt-noknight').onchange = () => {
    excludeKnight = $('dkt-noknight').checked;
    saveJSON(KEY_NOKN, excludeKnight);
    renderResult();
    redraw();
  };

  $('dkt-mapmode').value = mapMode;
  $('dkt-mapmode').onchange = () => {
    mapMode = $('dkt-mapmode').value;
    saveJSON(KEY_MAP, mapMode);
    renderResult();
    redraw();
  };

  renderSrc();
  renderPlayersFilter();
  renderFilter();
  ensureTimer();

  window.__dktTribeTroops = {
    open() {
      const p = $('dkt-panel');
      if (p && p.style.display === 'none') $('dkt-toggle').click();
    }
  };
  window.__dktTribeTroops.open(); // po spustení z lišty rovno otvor panel
})();
