(function () {
  var UNITS = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult'];
  var POP = { spear: 1, sword: 1, axe: 1, archer: 1, spy: 2, light: 4, marcher: 5, heavy: 6, ram: 5, catapult: 8 };
  var FILL = ['spear', 'sword', 'archer', 'axe', 'spy', 'light', 'marcher', 'heavy'];
  var INF = ['spear', 'sword', 'archer', 'axe'];
  var CAV = ['spy', 'light', 'marcher', 'heavy'];
  var SPD = { spear: 18, sword: 22, axe: 18, archer: 18, spy: 9, light: 10, marcher: 10, heavy: 11, ram: 30, catapult: 30, knight: 10, snob: 35 };
  var cfg = { speed: 1, unitSpeed: 1 };
  var BT = { spear: 1020, sword: 1500, axe: 1320, archer: 1500, spy: 540, light: 1800, marcher: 2400, heavy: 3600 };
  var plan = [], sent = 0, srvOff = 0, wins = null, timer = null, curIdx = -1, busy = false, planNote = '', useHist = true, hist = {}, balMode = 'time', fB = 1, fS = 1, flt = null, maxDist = 0, dirty = false, saveT = null;

  var old = document.getElementById('twf_box');
  if (old) old.remove();
  var box = document.createElement('div');
  box.id = 'twf_box';
  box.style.cssText = 'position:fixed;top:50px;right:8px;z-index:99999;background:rgb(244,228,188);border:2px solid rgb(125,81,15);padding:8px;width:280px;max-height:80vh;overflow:auto;font-size:12px;';
  document.body.appendChild(box);

  function show(html) { box.innerHTML = html; }
  function log(t) { var l = document.getElementById('twf_log'); if (l) { l.innerHTML += t + '<br>'; } }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rnd(a, b) { return a + Math.floor(Math.random() * (b - a)); }
  function keyOf(v, t) { return v.id + '>' + (+t[0]) + '|' + (+t[1]); }
  function loadHist() { try { return JSON.parse(localStorage.getItem('twf_hist2')) || {}; } catch (e) { return {}; } }
  function saveHist(h) { try { localStorage.setItem('twf_hist2', JSON.stringify(h)); } catch (e) {} }
  function parseTargets(txt) {
    var re = /(?:^|\D)(\d{1,3})\s*[|\uFF5C\u2502]\s*(\d{1,3})(?!\d)/g, m, out = [], seen = {};
    while ((m = re.exec(txt)) !== null) {
      var k = (+m[1]) + '|' + (+m[2]);
      if (!seen[k]) { seen[k] = 1; out.push([m[1], m[2]]); }
    }
    return out;
  }
  var worldData = null;
  function esc(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function splitNames(t) { return t.split(/[\n;,]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function loadWorld() {
    if (worldData) return Promise.resolve(worldData);
    function dec(x) { try { return decodeURIComponent(String(x).replace(/\+/g, ' ')); } catch (e) { return x; } }
    function get(f) {
      return fetchText('/map/' + f + '.txt').then(function (r) {
        return r.text.split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return l.split(','); });
      });
    }
    return Promise.all([get('village'), get('player'), get('ally')]).then(function (a) {
      if (!a[0].length || !a[1].length) throw new Error('D\u00e1ta sveta sa nepodarilo na\u010d\u00edta\u0165.');
      var byP = {};
      var byC = {}, pById = {};
      a[0].forEach(function (v) {
        (byP[v[4]] = byP[v[4]] || []).push(v[2] + '|' + v[3]);
        byC[v[2] + '|' + v[3]] = { pid: v[4], pts: parseInt(v[5], 10) || 0 };
      });
      var players = a[1].map(function (p) { return { id: p[0], name: dec(p[1]), ally: p[2] }; });
      players.forEach(function (p) { pById[p.id] = p; });
      worldData = {
        players: players,
        allies: a[2].map(function (x) { return { id: x[0], name: dec(x[1]), tag: dec(x[2]) }; }),
        byP: byP,
        byC: byC,
        pById: pById
      };
      return worldData;
    });
  }
  function resolveTargets(pn, an) {
    return loadWorld().then(function (w) {
      var me = (window.game_data && game_data.player) ? String(game_data.player.id) : '';
      var myAlly = (window.game_data && game_data.player) ? String(game_data.player.ally) : '';
      var out = [], seen = {}, lines = [];
      function add(list) { list.forEach(function (c) { if (!seen[c]) { seen[c] = 1; out.push(c); } }); }
      pn.forEach(function (name) {
        var p = w.players.filter(function (q) { return q.name.toLowerCase() === name.toLowerCase(); })[0];
        if (!p) { lines.push('Hr\u00e1\u010d nen\u00e1jden\u00fd: ' + esc(name)); return; }
        if (p.id === me) { lines.push(esc(p.name) + ': vlastn\u00fd \u00fa\u010det, presko\u010den\u00e9'); return; }
        var c = w.byP[p.id] || [];
        add(c);
        lines.push('Hr\u00e1\u010d ' + esc(p.name) + ': ' + c.length + ' ded\u00edn');
      });
      an.forEach(function (name) {
        var a = w.allies.filter(function (q) { return q.tag.toLowerCase() === name.toLowerCase() || q.name.toLowerCase() === name.toLowerCase(); })[0];
        if (!a) { lines.push('Kme\u0148 nen\u00e1jden\u00fd: ' + esc(name)); return; }
        if (a.id === myAlly && myAlly !== '0') { lines.push('Kme\u0148 ' + esc(a.tag) + ': vlastn\u00fd kme\u0148, presko\u010den\u00e9'); return; }
        var members = w.players.filter(function (q) { return q.ally === a.id && q.id !== me; });
        var c = [];
        members.forEach(function (m) { c = c.concat(w.byP[m.id] || []); });
        add(c);
        lines.push('Kme\u0148 ' + esc(a.tag) + ': ' + c.length + ' ded\u00edn (' + members.length + ' hr\u00e1\u010dov)');
      });
      lines.push('<b>Nov\u00e9 ciele spolu: ' + out.length + '</b>');
      return { coords: out, report: lines.join('<br>') };
    });
  }
  function bLevel(b) {
    try { var l = parseInt(game_data.village.buildings[b], 10); return isNaN(l) ? 20 : l; } catch (e) { return 20; }
  }
  async function filterTargets(targets, f) {
    var w = await loadWorld();
    var me = (window.game_data && game_data.player) ? String(game_data.player.id) : '';
    var myAlly = (window.game_data && game_data.player) ? String(game_data.player.ally) : '0';
    var exAlly = {};
    f.ex.forEach(function (name) {
      var a = w.allies.filter(function (q) { return q.tag.toLowerCase() === name.toLowerCase() || q.name.toLowerCase() === name.toLowerCase(); })[0];
      if (a) exAlly[a.id] = 1;
    });
    var d = { pts: 0, ally: 0, own: 0 }, out = [];
    targets.forEach(function (t) {
      var rec = w.byC[(+t[0]) + '|' + (+t[1])];
      if (rec) {
        if (f.own && rec.pid === me) { d.own++; return; }
        var pl = w.pById[rec.pid];
        var al = pl ? pl.ally : '0';
        if (al !== '0' && ((f.own && al === myAlly) || exAlly[al])) { d.ally++; return; }
        if ((f.minP && rec.pts < f.minP) || (f.maxP && rec.pts > f.maxP)) { d.pts++; return; }
      }
      out.push(t);
    });
    return { targets: out, info: 'Vyraden\u00e9 ciele: ' + (targets.length - out.length) + ' (body ' + d.pts + ', kme\u0148 ' + d.ally + ', vlastn\u00e9 ' + d.own + ')<br>' };
  }
  var FIELDS = ['twf_c', 'twf_pl', 'twf_al', 'twf_n', 'twf_l', 'twf_ex', 'twf_minp', 'twf_maxp', 'twf_maxd', 'twf_bm', 'twf_lb', 'twf_ls'];
  var CHECKS = ['twf_h', 'twf_tw', 'twf_sh', 'twf_ow'];
  function saveForm() {
    if (!document.getElementById('twf_c')) return;
    var o = { f: {}, c: {}, rows: [] };
    FIELDS.forEach(function (id) { var el = document.getElementById(id); if (el) o.f[id] = el.value; });
    CHECKS.forEach(function (id) { var el = document.getElementById(id); if (el) o.c[id] = el.checked; });
    Array.prototype.forEach.call(document.getElementById('twf_rows').querySelectorAll('.twf_row'), function (r) {
      o.rows.push([r.querySelector('.twf_d').value, r.querySelector('.twf_t1').value, r.querySelector('.twf_t2').value]);
    });
    try { localStorage.setItem('twf_form', JSON.stringify(o)); } catch (e) {}
  }
  function restoreForm(addRow, rowsBox) {
    var o;
    try { o = JSON.parse(localStorage.getItem('twf_form')); } catch (e) { o = null; }
    if (!o) return;
    FIELDS.forEach(function (id) { var el = document.getElementById(id); if (el && o.f && o.f[id] !== undefined) el.value = o.f[id]; });
    CHECKS.forEach(function (id) { var el = document.getElementById(id); if (el && o.c && o.c[id] !== undefined) el.checked = o.c[id]; });
    if (o.rows && o.rows.length) {
      rowsBox.innerHTML = '';
      o.rows.forEach(function (r) { addRow(r[0], r[1], r[2]); });
    }
  }
  function savePlan() {
    try {
      localStorage.setItem('twf_plan', JSON.stringify({
        sent: sent,
        plan: plan.map(function (it) {
          return { v: { id: it.v.id, coord: it.v.coord, xy: it.v.xy, points: it.v.points, need: it.v.need }, t: it.t, use: it.use, tr: it.tr, sf: it.sf, st: it.st, state: it.state, key: it.key, w: it.w, sending: it.sending ? 1 : 0 };
        })
      }));
    } catch (e) {}
  }
  function showSavedPlan() {
    var holder = document.getElementById('twf_saved');
    if (!holder) return;
    var sp;
    try { sp = JSON.parse(localStorage.getItem('twf_plan')); } catch (e) { sp = null; }
    if (!sp || !sp.plan) return;
    var pend = sp.plan.filter(function (x) { return x.state === 0; }).length;
    if (!pend) return;
    holder.innerHTML = '<br>Ulo\u017een\u00fd pl\u00e1n: \u010dak\u00e1 ' + pend + ', odoslan\u00e9 ' + (sp.sent || 0) + ' z ' + sp.plan.length +
      '<br><button class=\x22btn\x22 id=\x22twf_rs\x22>Obnovi\u0165 pl\u00e1n</button> <button class=\x22btn\x22 id=\x22twf_rd\x22>Zmaza\u0165</button><hr>';
    document.getElementById('twf_rd').onclick = function () {
      try { localStorage.removeItem('twf_plan'); } catch (e) {}
      holder.innerHTML = '';
    };
    document.getElementById('twf_rs').onclick = function () {
      var unsure = 0;
      plan = sp.plan.map(function (it) {
        if (it.st === null) it.st = Infinity;
        if (it.sending && it.state === 0) { it.state = 2; unsure++; }
        it.sending = 0;
        return it;
      });
      sent = sp.sent || 0; curIdx = -1; busy = false;
      planNote = 'Obnoven\u00fd pl\u00e1n.<br>' + (unsure ? 'Pozor: ' + unsure + ' \u00fatok sa pri obnove str\u00e1nky odosielal, presko\u010den\u00fd. Skontroluj pr\u00edkazy na n\u00e1mest\u00ed.<br>' : '');
      savePlan();
      clearInterval(timer);
      timer = setInterval(tick, 500);
      tick();
    };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function cur() { return (window.game_data && game_data.village) ? game_data.village.id : ''; }
  function fetchText(url, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    return fetch(url, opts).then(function (r) { return r.text().then(function (t) { return { text: t, url: r.url }; }); });
  }
  function parse(t) { return new DOMParser().parseFromString(t, 'text/html'); }
  function fetchDoc(url) { return fetchText(url).then(function (r) { return parse(r.text); }); }

  function initClock() {
    var t = document.getElementById('serverTime'), d = document.getElementById('serverDate');
    if (t && d) {
      var tm = t.textContent.match(/\d+/g), dm = d.textContent.match(/\d+/g);
      if (tm && dm && tm.length >= 3 && dm.length >= 3) {
        srvOff = Date.UTC(+dm[2], +dm[1] - 1, +dm[0], +tm[0], +tm[1], +tm[2]) - Date.now();
        return;
      }
    }
    srvOff = -new Date().getTimezoneOffset() * 60000;
  }
  function srvNow() { return Date.now() + srvOff; }
  function fmt(ts) {
    var d = new Date(ts);
    return pad(d.getUTCDate()) + '.' + pad(d.getUTCMonth() + 1) + '. ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
  }
  function isoDate(ts) { var d = new Date(ts); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function isoTime(ts) { var d = new Date(ts); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()); }
  function addDays(iso, k) {
    var m = (iso || '').split('-');
    var t = Date.UTC(+m[0], +m[1] - 1, +m[2]) + k * 86400000;
    return isNaN(t) ? iso : isoDate(t);
  }
  function parseDT(d, t) {
    var m = (d || '').split('-'), tt = (t || '').split(':');
    return Date.UTC(+m[0], +m[1] - 1, +m[2], +tt[0], +tt[1], +(tt[2] || 0));
  }
  function dur(s) {
    s = Math.max(0, Math.round(s));
    var h = Math.floor(s / 3600), m = Math.floor((s - h * 3600) / 60), x = s - h * 3600 - m * 60;
    return h + ':' + pad(m) + ':' + pad(x);
  }

  function loadConfig() {
    return fetchText('/interface.php?func=get_config').then(function (r) {
      var d = new DOMParser().parseFromString(r.text, 'text/xml');
      var s = parseFloat((d.getElementsByTagName('speed')[0] || {}).textContent);
      var us = parseFloat((d.getElementsByTagName('unit_speed')[0] || {}).textContent);
      if (s) cfg.speed = s;
      if (us) cfg.unitSpeed = us;
    }).catch(function () {}).then(function () {
      return fetchText('/interface.php?func=get_unit_info');
    }).then(function (r) {
      var d = new DOMParser().parseFromString(r.text, 'text/xml');
      Object.keys(SPD).forEach(function (u) {
        var el = d.getElementsByTagName(u)[0];
        if (!el) return;
        var sp = parseFloat((el.getElementsByTagName('speed')[0] || {}).textContent);
        var pp = parseInt((el.getElementsByTagName('pop')[0] || {}).textContent, 10);
        if (sp) SPD[u] = sp;
        if (pp && POP[u] !== undefined) POP[u] = pp;
        var bt = parseFloat((el.getElementsByTagName('build_time')[0] || {}).textContent);
        if (bt && BT[u] !== undefined) BT[u] = bt;
      });
    }).catch(function () {});
  }

  function travelSec(use, xy, t) {
    var slow = 0;
    Object.keys(use).forEach(function (u) { slow = Math.max(slow, SPD[u] || 0); });
    var dx = xy[0] - t[0], dy = xy[1] - t[1];
    return Math.round(Math.sqrt(dx * dx + dy * dy) * slow * 60 / (cfg.speed * cfg.unitSpeed));
  }

  function getVillages() {
    return fetchDoc('/game.php?village=' + cur() + '&screen=overview_villages&mode=combined&page=-1').then(function (d) {
      var out = [];
      d.querySelectorAll('.quickedit-vn').forEach(function (el) {
        var id = el.getAttribute('data-id');
        var m = el.textContent.match(/\((\d+)\|(\d+)\)/);
        if (id) out.push({ id: id, coord: m ? m[1] + '|' + m[2] : id, xy: m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0] });
      });
      return out;
    });
  }

  function getPoints(id) {
    return fetchDoc('/game.php?village=' + id + '&screen=info_village&id=' + id).then(function (d) {
      var rows = d.querySelectorAll('table tr');
      for (var i = 0; i < rows.length; i++) {
        var c = rows[i].children;
        if (c.length === 2 && c[0].textContent.trim().length < 25 && !c[1].querySelector('table') && /(points|body|punkte|punkty)/i.test(c[0].textContent)) {
          var n = parseInt(c[1].textContent.replace(/\D/g, ''), 10);
          if (n > 0 && n < 1000000) return n;
        }
      }
      var cv = d.getElementById('content_value') || d.body;
      var m = cv.textContent.match(/(?:points|body|punkte|punkty)\s*:\s*([\d.,]+)/i);
      if (m) {
        var k = parseInt(m[1].replace(/\D/g, ''), 10);
        if (k > 0 && k < 1000000) return k;
      }
      return 0;
    });
  }

  function getTroops(id) {
    return fetchDoc('/game.php?village=' + id + '&screen=place').then(function (d) {
      var a = {};
      UNITS.forEach(function (u) {
        var e = d.getElementById('units_entry_all_' + u);
        a[u] = e ? (parseInt(e.textContent.replace(/\D/g, ''), 10) || 0) : 0;
      });
      var running = {};
      var cont = d.getElementById('commands_outgoings');
      var rows = cont ? cont.querySelectorAll('tr') : d.querySelectorAll('tr.command-row');
      rows.forEach(function (row) {
        var imgs = row.querySelectorAll('img');
        var isAtk = imgs.length === 0, bad = false;
        imgs.forEach(function (im) {
          var src = im.getAttribute('src') || '';
          if (src.indexOf('attack') >= 0) isAtk = true;
          if (src.indexOf('return') >= 0 || src.indexOf('back') >= 0 || src.indexOf('support') >= 0) bad = true;
        });
        if (!isAtk || bad) return;
        var m = row.textContent.match(/\((\d+)\|(\d+)\)/);
        if (m) running[(+m[1]) + '|' + (+m[2])] = 1;
      });
      return { avail: a, running: running };
    });
  }

  function pickUnit(list, rem, avail, use) {
    var fallback = null;
    for (var i = 0; i < list.length; i++) {
      var u = list[i];
      if ((avail[u] || 0) - (use[u] || 0) <= 0) continue;
      if (POP[u] <= rem) return u;
      if (!fallback) fallback = u;
    }
    return fallback;
  }

  function addTimes(v, use) {
    for (var u in use) {
      if (INF.indexOf(u) >= 0) v.tb = (v.tb || 0) + use[u] * (BT[u] || 0) * fB;
      else if (CAV.indexOf(u) >= 0) v.ts = (v.ts || 0) + use[u] * (BT[u] || 0) * fS;
    }
  }

  function fillFrom(list, target, avail, use) {
    var got = 0;
    for (var i = 0; i < list.length; i++) {
      if (got >= target) break;
      var u = list[i];
      var free = (avail[u] || 0) - (use[u] || 0);
      if (free <= 0) continue;
      var k = Math.min(free, Math.ceil((target - got) / POP[u]));
      if (k > 0) { use[u] = (use[u] || 0) + k; got += k * POP[u]; }
    }
    return got;
  }

  function compose(avail, need, cum) {
    var base = avail.ram > 0 ? 'ram' : (avail.catapult > 0 ? 'catapult' : null);
    if (!base) return null;
    var use = {};
    use[base] = 1;
    var rem = need - POP[base];
    if (balMode === 'time' && rem > 0) {
      var tb = (cum && cum.tb) || 0, ts = (cum && cum.ts) || 0;
      while (rem > 0) {
        var pref = tb <= ts ? INF : CAV, alt = tb <= ts ? CAV : INF;
        var pu = pickUnit(pref, rem, avail, use) || pickUnit(alt, rem, avail, use);
        if (!pu) return null;
        use[pu] = (use[pu] || 0) + 1;
        rem -= POP[pu];
        if (INF.indexOf(pu) >= 0) tb += (BT[pu] || 0) * fB; else ts += (BT[pu] || 0) * fS;
      }
      return use;
    }
    if (balMode === 'pop' && rem > 0) {
      var half = Math.floor(rem / 2);
      var gotC = fillFrom(CAV, half, avail, use);
      var gotI = fillFrom(INF, rem - gotC, avail, use);
      var left = rem - gotC - gotI;
      if (left > 0) left -= fillFrom(CAV, left, avail, use);
      return left > 0 ? null : use;
    }
    for (var i = 0; i < FILL.length && rem > 0; i++) {
      var u = FILL[i];
      var k = Math.min(avail[u] || 0, Math.ceil(rem / POP[u]));
      if (k > 0) { use[u] = k; rem -= k * POP[u]; }
    }
    return rem > 0 ? null : use;
  }

  function makePlan(vs, targets, n) {
    var queue = [];
    targets.forEach(function (t) { for (var k = 0; k < n; k++) queue.push(t); });
    var res = [], idx = 0, skipped = 0, used = {};
    var wcnt = wins ? wins.map(function () { return 0; }) : [];
    queue.forEach(function (t) {
      var placed = false;
      for (var tries = 0; tries < vs.length && !placed; tries++) {
        var vi = (idx + tries) - vs.length * Math.floor((idx + tries) / vs.length);
        var v = vs[vi];
        var key = keyOf(v, t);
        var tk = (+t[0]) + '|' + (+t[1]);
        if (used[key] || (useHist && ((hist[key] || 0) > srvNow() || (v.running && v.running[tk])))) continue;
        var ddx = v.xy[0] - t[0], ddy = v.xy[1] - t[1];
        if (maxDist && Math.sqrt(ddx * ddx + ddy * ddy) > maxDist) continue;
        var use = compose(v.avail, v.need, v);
        if (!use) continue;
        var tr = travelSec(use, v.xy, t);
        var sf = 0, st = Infinity, wsel = null;
        if (wins) {
          var order = wins.map(function (w, wi) { return wi; }).sort(function (a, b) { return (wcnt[a] - wcnt[b]) || (a - b); });
          for (var oi = 0; oi < order.length; oi++) {
            var w = wins[order[oi]];
            var g = (w.to - w.from) > 6000 ? 1500 : 0;
            var s1 = w.from - tr * 1000 + g, e1 = w.to - tr * 1000 - g;
            if (e1 >= srvNow() + 3000) { sf = s1; st = e1; wsel = order[oi]; break; }
          }
          if (wsel === null) continue;
          wcnt[wsel]++;
        }
        for (var u in use) v.avail[u] -= use[u];
        addTimes(v, use);
        used[key] = 1;
        res.push({ v: v, t: t, use: use, tr: tr, sf: sf, st: st, state: 0, key: key, w: wsel === null ? null : wins[wsel] });
        idx = (vi + 1) - vs.length * Math.floor((vi + 1) / vs.length);
        placed = true;
      }
      if (!placed) skipped++;
    });
    return { res: res, skipped: skipped, wcnt: wcnt };
  }

  function errText(d) {
    var e = d.querySelector('.error_box') || d.querySelector('.error');
    return e ? e.textContent.trim() : 'nezn\u00e1ma chyba (mo\u017eno bot-ochrana, sk\u00fas ru\u010dne)';
  }

  function sendOne(item) {
    var url = '/game.php?village=' + item.v.id + '&screen=place';
    return fetchDoc(url).then(function (d) {
      var form = d.getElementById('command-data-form');
      if (!form) throw new Error('Formul\u00e1r n\u00e1mestia sa nena\u0161iel.');
      var fd = new FormData(form);
      UNITS.concat(['knight', 'snob']).forEach(function (u) {
        if (fd.has(u)) fd.set(u, item.use[u] ? String(item.use[u]) : '');
      });
      fd.set('x', item.t[0]);
      fd.set('y', item.t[1]);
      if (fd.has('input')) fd.set('input', item.t[0] + '|' + item.t[1]);
      fd.set('attack', 'Attack');
      return fetchText(form.getAttribute('action') || url, { method: 'POST', body: fd });
    }).then(function (r) {
      var d2 = parse(r.text);
      var btn = d2.getElementById('troop_confirm_submit') || d2.getElementById('troop_confirm_go');
      if (!btn) throw new Error(errText(d2));
      var f2 = btn.closest('form');
      var fd2 = new FormData(f2);
      fd2.set(btn.getAttribute('name') || 'submit_confirm', btn.getAttribute('value') || 'OK');
      return fetchText(f2.getAttribute('action') || url, { method: 'POST', body: fd2 });
    }).then(function (r) {
      if (r.url.indexOf('info_command') < 0 && r.text.indexOf('info_command') < 0) {
        throw new Error(errText(parse(r.text)));
      }
    });
  }

  function closeBox() { clearInterval(timer); box.remove(); }
  function count(s) { return plan.filter(function (x) { return x.state === s; }).length; }

  function renderForm() {
    clearInterval(timer);
    var base = Math.ceil((srvNow() + 1800000) / 3600000) * 3600000;
    show('<b>Fake pomocn\u00edk</b><div id=\x22twf_saved\x22></div>Koordin\u00e1ty (500|500 501|502):<br>' +
      '<textarea id=\x22twf_c\x22 rows=\x226\x22 style=\x22width:250px\x22></textarea><div id=\x22twf_cnt\x22>Rozpoznan\u00e9 ciele: 0</div>' +
      'Hr\u00e1\u010di (men\u00e1, oddelen\u00e9 \u010diarkou):<br><textarea id=\x22twf_pl\x22 rows=\x222\x22 style=\x22width:250px\x22></textarea><br>' +
      'Kmene (tag alebo n\u00e1zov):<br><textarea id=\x22twf_al\x22 rows=\x222\x22 style=\x22width:250px\x22></textarea><br>' +
      '<button class=\x22btn\x22 id=\x22twf_res\x22>Prida\u0165 dediny hr\u00e1\u010dov/kme\u0148ov</button><div id=\x22twf_resmsg\x22></div>' +
      '<label><input id=\x22twf_sh\x22 type=\x22checkbox\x22> Zamie\u0161a\u0165 poradie cie\u013eov</label><br>' +
      'Body cie\u013ea od <input id=\x22twf_minp\x22 type=\x22number\x22 min=\x220\x22 style=\x22width:60px\x22> do <input id=\x22twf_maxp\x22 type=\x22number\x22 min=\x220\x22 style=\x22width:60px\x22><br>' +
      'Max. vzdialenos\u0165 (polia): <input id=\x22twf_maxd\x22 type=\x22number\x22 min=\x220\x22 style=\x22width:50px\x22><br>' +
      'Vynecha\u0165 kmene (tag/n\u00e1zov):<br><textarea id=\x22twf_ex\x22 rows=\x222\x22 style=\x22width:250px\x22></textarea><br>' +
      '<button class=\x22btn\x22 id=\x22twf_dipl\x22>Prida\u0165 partnerov z diplomacie</button><div id=\x22twf_dmsg\x22></div>' +
      '<label><input id=\x22twf_ow\x22 type=\x22checkbox\x22 checked> Vynecha\u0165 vlastn\u00fd kme\u0148 a vlastn\u00e9 dediny</label><br>' +
      'Fakov na cie\u013e: <input id=\x22twf_n\x22 type=\x22number\x22 value=\x221\x22 min=\x221\x22 style=\x22width:45px\x22><br>' +
      'Fake limit (v percent\u00e1ch): <input id=\x22twf_l\x22 type=\x22number\x22 value=\x221\x22 min=\x220\x22 step=\x220.1\x22 style=\x22width:45px\x22><br>' +
      'Vyv\u00e1\u017eenie pechota/jazda: <select id=\x22twf_bm\x22><option value=\x22time\x22>pod\u013ea \u010dasu verbovania</option><option value=\x22pop\x22>pod\u013ea popul\u00e1cie</option><option value=\x22off\x22>vypnut\u00e9</option></select><br>' +
      'Level kas\u00e1rn\u00ed <input id=\x22twf_lb\x22 type=\x22number\x22 min=\x220\x22 max=\x2230\x22 value=\x22' + bLevel('barracks') + '\x22 style=\x22width:40px\x22> stajne <input id=\x22twf_ls\x22 type=\x22number\x22 min=\x220\x22 max=\x2230\x22 value=\x22' + bLevel('stable') + '\x22 style=\x22width:40px\x22><br>' +
      '<label><input id=\x22twf_tw\x22 type=\x22checkbox\x22 checked> Pou\u017ei\u0165 \u010das dopadu (serverov\u00fd \u010das)</label><br>' +
      'Dni a \u010das dopadu:<div id=\x22twf_rows\x22></div><button class=\x22btn\x22 id=\x22twf_add\x22>+ Prida\u0165 \u010fal\u0161\u00ed de\u0148</button><br>' +
      '<label><input id=\x22twf_h\x22 type=\x22checkbox\x22 checked> Vynecha\u0165 kombin\u00e1cie, ktor\u00e9 u\u017e letia</label> <button class=\x22btn\x22 id=\x22twf_hc\x22>Vymaza\u0165 hist\u00f3riu</button><br>' +
      '<button class=\x22btn\x22 id=\x22twf_go\x22>Pripravi\u0165</button> <button class=\x22btn\x22 id=\x22twf_x\x22>Zavrie\u0165</button>');
    document.getElementById('twf_x').onclick = closeBox;
    var rowsBox = document.getElementById('twf_rows');
    function addRow(d, t1, t2) {
      var r = document.createElement('div');
      r.className = 'twf_row';
      r.style.marginBottom = '4px';
      r.innerHTML = 'De\u0148: <input type=\x22date\x22 class=\x22twf_d\x22 value=\x22' + d + '\x22><br>Od <input type=\x22time\x22 step=\x221\x22 class=\x22twf_t1\x22 value=\x22' + t1 + '\x22> do <input type=\x22time\x22 step=\x221\x22 class=\x22twf_t2\x22 value=\x22' + t2 + '\x22> <button class=\x22btn twf_del\x22>\u00d7</button>';
      r.querySelector('.twf_del').onclick = function () { if (rowsBox.children.length > 1) r.remove(); };
      rowsBox.appendChild(r);
    }
    addRow(isoDate(base), isoTime(base), isoTime(base + 3600000));
    document.getElementById('twf_add').onclick = function () {
      var last = rowsBox.lastElementChild;
      addRow(addDays(last.querySelector('.twf_d').value, 1), last.querySelector('.twf_t1').value, last.querySelector('.twf_t2').value);
    };
    var ta = document.getElementById('twf_c'), cn = document.getElementById('twf_cnt');
    var upd = function () { cn.textContent = 'Rozpoznan\u00e9 ciele: ' + parseTargets(ta.value).length; };
    ta.oninput = upd;
    ta.onchange = upd;
    ta.onpaste = function () { setTimeout(upd, 50); };
    document.getElementById('twf_res').onclick = function () {
      var msg = document.getElementById('twf_resmsg');
      var pn = splitNames(document.getElementById('twf_pl').value);
      var an = splitNames(document.getElementById('twf_al').value);
      if (!pn.length && !an.length) { msg.textContent = 'Zadaj aspo\u0148 jedn\u00e9ho hr\u00e1\u010da alebo kme\u0148.'; return; }
      msg.textContent = 'Na\u010d\u00edtavam d\u00e1ta sveta\u2026';
      resolveTargets(pn, an).then(function (r) {
        var seenC = {};
        parseTargets(ta.value).forEach(function (t) { seenC[(+t[0]) + '|' + (+t[1])] = 1; });
        var fresh = r.coords.filter(function (c) { return !seenC[c]; });
        if (fresh.length) ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + fresh.join(' ');
        upd();
        msg.innerHTML = r.report + (fresh.length < r.coords.length ? '<br>(u\u017e zadan\u00fdch: ' + (r.coords.length - fresh.length) + ')' : '');
      }).catch(function (e) { msg.textContent = 'Chyba: ' + e.message; });
    };
    document.getElementById('twf_dipl').onclick = function () {
      var msg = document.getElementById('twf_dmsg');
      msg.textContent = 'Na\u010d\u00edtavam diplomaciu\u2026';
      Promise.all([fetchDoc('/game.php?village=' + cur() + '&screen=ally&mode=contracts'), loadWorld()]).then(function (r) {
        var d = r[0], w = r[1];
        var myAlly = (window.game_data && game_data.player) ? String(game_data.player.ally) : '0';
        var seenA = {}, add = [], unk = [], enemy = 0;
        d.querySelectorAll('a[href*=\x22info_ally\x22]').forEach(function (a) {
          var m = (a.getAttribute('href') || '').match(/[?&]id=(\d+)/);
          if (!m || m[1] === myAlly || seenA[m[1]]) return;
          seenA[m[1]] = 1;
          var tbl = a.closest('table'), head = '';
          if (tbl) {
            var th = tbl.querySelector('th');
            head = (th ? th.textContent : '') + ' ' + (tbl.previousElementSibling ? tbl.previousElementSibling.textContent : '');
          }
          var kind = /nepriate|enem|war|vojn/i.test(head) ? 'e' : (/nap|neutr|pakt|spojen|allie|partner/i.test(head) ? 'p' : 'u');
          var al = w.allies.filter(function (q) { return q.id === m[1]; })[0];
          var name = al ? al.tag : a.textContent.trim();
          if (kind === 'p') add.push(name); else if (kind === 'e') enemy++; else unk.push(name);
        });
        var exEl = document.getElementById('twf_ex');
        var have = splitNames(exEl.value), lc = {};
        have.forEach(function (x) { lc[x.toLowerCase()] = 1; });
        var fresh = add.filter(function (x) { return !lc[x.toLowerCase()]; });
        if (fresh.length) exEl.value = (exEl.value.trim() ? exEl.value.trim() + ', ' : '') + fresh.join(', ');
        saveForm();
        msg.innerHTML = 'Pridan\u00ed partneri: ' + fresh.length + (fresh.length ? ' (' + esc(fresh.join(', ')) + ')' : '') +
          '<br>Nepriatelia presko\u010den\u00ed: ' + enemy +
          (unk.length ? '<br>Nezaraden\u00e9 (nepridan\u00e9, skontroluj ru\u010dne): ' + esc(unk.join(', ')) : '');
      }).catch(function (e) { msg.textContent = 'Chyba: ' + e.message; });
    };
    restoreForm(addRow, rowsBox);
    upd();
    showSavedPlan();
    box.oninput = box.onchange = function () { clearTimeout(saveT); saveT = setTimeout(saveForm, 400); };
    document.getElementById('twf_hc').onclick = function () {
      try { localStorage.removeItem('twf_hist2'); } catch (e) {}
      alert('Hist\u00f3ria odoslan\u00fdch kombin\u00e1ci\u00ed je vymazan\u00e1.');
    };
    document.getElementById('twf_go').onclick = function () {
      var targets = parseTargets(document.getElementById('twf_c').value);
      if (!targets.length) { alert('Zadaj koordin\u00e1ty (napr. 500|500) alebo pridaj dediny hr\u00e1\u010dov/kme\u0148ov.'); return; }
      if (document.getElementById('twf_sh').checked) {
        for (var si = targets.length - 1; si > 0; si--) {
          var sj = Math.floor(Math.random() * (si + 1));
          var tmp = targets[si]; targets[si] = targets[sj]; targets[sj] = tmp;
        }
      }
      useHist = document.getElementById('twf_h').checked;
      balMode = document.getElementById('twf_bm').value;
      var lvB = parseInt(document.getElementById('twf_lb').value, 10), lvS = parseInt(document.getElementById('twf_ls').value, 10);
      fB = Math.pow(0.94, isNaN(lvB) ? 20 : lvB);
      fS = Math.pow(0.94, isNaN(lvS) ? 20 : lvS);
      flt = {
        minP: parseInt(document.getElementById('twf_minp').value, 10) || 0,
        maxP: parseInt(document.getElementById('twf_maxp').value, 10) || 0,
        ex: splitNames(document.getElementById('twf_ex').value),
        own: document.getElementById('twf_ow').checked
      };
      maxDist = parseFloat(document.getElementById('twf_maxd').value) || 0;
      hist = loadHist();
      var n = Math.max(1, parseInt(document.getElementById('twf_n').value, 10) || 1);
      var limit = parseFloat(document.getElementById('twf_l').value) || 1;
      wins = null;
      if (document.getElementById('twf_tw').checked) {
        var list = [], rows = rowsBox.querySelectorAll('.twf_row');
        for (var ri = 0; ri < rows.length; ri++) {
          var dd = rows[ri].querySelector('.twf_d').value;
          var f = parseDT(dd, rows[ri].querySelector('.twf_t1').value);
          var t = parseDT(dd, rows[ri].querySelector('.twf_t2').value);
          if (isNaN(f) || isNaN(t)) { alert('Neplatn\u00fd de\u0148 alebo \u010das v riadku ' + (ri + 1) + '.'); return; }
          if (t <= f) t += 86400000;
          if (t > srvNow()) list.push({ from: f, to: t });
        }
        if (!list.length) { alert('V\u0161etky \u010dasov\u00e9 okn\u00e1 s\u00fa v minulosti.'); return; }
        list.sort(function (a, b) { return a.from - b.from; });
        wins = list;
      }
      saveForm();
      prepare(targets, n, limit);
    };
  }

  async function prepare(targets, n, limit) {
    show('<b>Na\u010d\u00edtavam nastavenia sveta a dediny\u2026</b><div id=\x22twf_log\x22></div>');
    var dropInfo = '';
    if (flt && (flt.minP || flt.maxP || flt.ex.length || flt.own)) {
      try {
        var fr = await filterTargets(targets, flt);
        targets = fr.targets;
        dropInfo = fr.info;
      } catch (e) {
        show('Chyba pri filtrovan\u00ed cie\u013eov: ' + esc(e.message) + '<br><button class=\x22btn\x22 id=\x22twf_b\x22>Sp\u00e4\u0165</button>');
        document.getElementById('twf_b').onclick = renderForm;
        return;
      }
      if (!targets.length) {
        show(dropInfo + 'Po filtroch nezostal \u017eiadny cie\u013e.<br><button class=\x22btn\x22 id=\x22twf_b\x22>Sp\u00e4\u0165</button>');
        document.getElementById('twf_b').onclick = renderForm;
        return;
      }
    }
    await loadConfig();
    log('R\u00fdchlos\u0165 sveta: ' + cfg.speed + ', jednotiek: ' + cfg.unitSpeed);
    var all = await getVillages();
    if (!all.length) { show('Nena\u0161li sa dediny v aktu\u00e1lnej skupine.<br><button class=\x22btn\x22 id=\x22twf_b\x22>Sp\u00e4\u0165</button>'); document.getElementById('twf_b').onclick = renderForm; return; }
    var vs = [];
    for (var i = 0; i < all.length; i++) {
      log((i + 1) + '/' + all.length + ' ' + all[i].coord);
      var pts = await getPoints(all[i].id);
      await sleep(rnd(150, 350));
      var av = await getTroops(all[i].id);
      await sleep(rnd(150, 350));
      if (!pts) { log('&nbsp;&nbsp;body sa nena\u0161li, preskakujem'); continue; }
      all[i].points = pts;
      all[i].avail = av.avail;
      all[i].running = av.running;
      all[i].need = Math.max(1, Math.ceil(pts * limit / 100 - 0.000001));
      vs.push(all[i]);
    }
    var diag = 'Dediny v skupine: ' + all.length + '<br>S n\u00e1jden\u00fdmi bodmi: ' + vs.length;
    var nb = 0, nc = 0, minArr = Infinity;
    vs.forEach(function (v) {
      if (v.avail.ram > 0 || v.avail.catapult > 0) nb++;
      var use = compose(v.avail, v.need, v);
      if (use) {
        nc++;
        targets.forEach(function (t) { minArr = Math.min(minArr, travelSec(use, v.xy, t)); });
      }
    });
    var nr = 0;
    vs.forEach(function (v) { nr += Object.keys(v.running || {}).length; });
    diag += '<br>N\u00e1jden\u00e9 be\u017eiace \u00fatoky: ' + nr;
    diag += '<br>S baranidlom/katapultom: ' + nb + '<br>Zvl\u00e1dnu min. popul\u00e1ciu: ' + nc;
    if (wins && nc) diag += '<br>Najkrat\u0161ia cesta: ' + dur(minArr) + ' (dopad najsk\u00f4r ' + fmt(srvNow() + minArr * 1000) + ', posledn\u00e9 okno kon\u010d\u00ed ' + fmt(Math.max.apply(null, wins.map(function (w) { return w.to; }))) + ')';
    if (vs.length) diag += '<br>Vzorka ' + vs[0].coord + ': body ' + vs[0].points + ', min. pop ' + vs[0].need + ', baranidl\u00e1 ' + vs[0].avail.ram + ', katapulty ' + vs[0].avail.catapult;
    var cap = 0;
    vs.forEach(function (v) { cap += (v.avail.ram || 0) + (v.avail.catapult || 0); });
    var p = makePlan(vs, targets, n);
    plan = p.res; sent = 0; curIdx = -1; busy = false;
    if (!plan.length) { show('Ni\u010d sa ned\u00e1 napl\u00e1nova\u0165.<br>' + diag + '<br><button class=\x22btn\x22 id=\x22twf_b\x22>Sp\u00e4\u0165</button>'); document.getElementById('twf_b').onclick = renderForm; return; }
    planNote = dropInfo + 'Po\u017eadovan\u00e9: ' + (targets.length * n) + ', napl\u00e1novan\u00e9: ' + plan.length +
      (p.skipped ? ', nenapl\u00e1novan\u00e9: ' + p.skipped + ' (ka\u017ed\u00fd fake potrebuje 1 baranidlo alebo katapult, dostupn\u00fdch spolu: ' + cap + '; \u010falej limit okna a u\u017e letiace kombin\u00e1cie)' : '') + '<br>';
    var popI = 0, popC = 0;
    plan.forEach(function (it) {
      for (var uu in it.use) {
        if (INF.indexOf(uu) >= 0) popI += it.use[uu] * POP[uu];
        else if (CAV.indexOf(uu) >= 0) popC += it.use[uu] * POP[uu];
      }
    });
    planNote += 'Popul\u00e1cia pechota ' + popI + ' / jazda ' + popC + '<br>';
    var tbS = 0, tsS = 0;
    vs.forEach(function (v) { tbS += v.tb || 0; tsS += v.ts || 0; });
    planNote += '\u010cas verbovania spolu: kas\u00e1rne ' + dur(tbS) + ' / staj\u0148a ' + dur(tsS) + '<br>';
    if (wins && wins.length > 1) {
      planNote += 'Pod\u013ea dn\u00ed: ' + wins.map(function (w, i) { return fmt(w.from).slice(0, 6) + ' ' + p.wcnt[i]; }).join(', ') + '<br>';
    }
    savePlan();
    clearInterval(timer);
    timer = setInterval(tick, 500);
    tick();
  }

  function pick() {
    var now = srvNow(), best = null, bestOpen = null;
    plan.forEach(function (it, i) {
      it.i = i;
      if (it.state !== 0) return;
      if (it.st < now) { it.state = 3; dirty = true; return; }
      if (it.sf <= now) { if (!bestOpen || it.st < bestOpen.st) bestOpen = it; }
      else if (!best || it.sf < best.sf) best = it;
    });
    return bestOpen || best;
  }

  function renderItem(it) {
    curIdx = it.i;
    var us = Object.keys(it.use).map(function (u) { return it.use[u] + '\u00d7 ' + u; }).join(', ');
    var tm = '';
    if (it.w) {
      tm = '<br>Cesta: ' + dur(it.tr) + '<br>Odosla\u0165 medzi: <b>' + fmt(it.sf) + '</b> a <b>' + fmt(it.st) + '</b>' +
        '<br>Okno dopadu: ' + fmt(it.w.from) + ' \u2013 ' + fmt(it.w.to);
    }
    show(planNote + 'Odoslan\u00e9: ' + sent + ', zme\u0161kan\u00e9: ' + count(3) + ', zost\u00e1va: ' + count(0) + '<br>' +
      '<b>Fake ' + (it.i + 1) + ' / ' + plan.length + '</b><br>' +
      'Z: ' + it.v.coord + ' (body ' + it.v.points + ', min. pop ' + it.v.need + ')<br>' +
      'Na: ' + it.t[0] + '|' + it.t[1] + '<br>Jednotky: ' + us + tm +
      '<div id=\x22twf_cd\x22></div>' +
      '<button class=\x22btn\x22 id=\x22twf_send\x22>Odosla\u0165</button> <button class=\x22btn\x22 id=\x22twf_skip\x22>Presko\u010di\u0165</button> <button class=\x22btn\x22 id=\x22twf_x\x22>Zavrie\u0165</button>' +
      '<div id=\x22twf_log\x22></div>');
    document.getElementById('twf_x').onclick = closeBox;
    document.getElementById('twf_skip').onclick = function () { it.state = 2; curIdx = -1; savePlan(); tick(); };
    document.getElementById('twf_send').onclick = function () {
      busy = true;
      document.getElementById('twf_send').disabled = true;
      it.sending = 1;
      savePlan();
      sendOne(it).then(function () {
        it.sending = 0;
        it.state = 1; sent++; hist = loadHist(); hist[it.key] = srvNow() + it.tr * 1000; saveHist(hist); busy = false; curIdx = -1; savePlan(); tick();
      }).catch(function (e) {
        it.sending = 0;
        savePlan();
        busy = false;
        log('Chyba: ' + e.message);
      });
    };
  }

  function updateCd(it) {
    var b = document.getElementById('twf_send'), c = document.getElementById('twf_cd');
    if (!b || !c || busy) return;
    if (!it.w) { b.disabled = false; c.innerHTML = ''; return; }
    var now = srvNow();
    if (now < it.sf) {
      b.disabled = true;
      c.innerHTML = 'Okno odoslania sa otvor\u00ed o <b>' + dur(Math.ceil((it.sf - now) / 1000)) + '</b>';
    } else {
      b.disabled = false;
      c.innerHTML = '<b style=\x22color:green\x22>M\u00f4\u017ee\u0161 odosla\u0165</b> \u2013 zost\u00e1va ' + dur(Math.floor((it.st - now) / 1000)) +
        '<br>Dopad by bol o ' + fmt(now + it.tr * 1000);
    }
  }

  function finish() {
    clearInterval(timer);
    try { localStorage.removeItem('twf_plan'); } catch (e) {}
    show('<b>Hotovo.</b> Odoslan\u00e9: ' + sent + ', zme\u0161kan\u00e9: ' + count(3) + ', presko\u010den\u00e9: ' + count(2) + '<br><button class=\x22btn\x22 id=\x22twf_x\x22>Zavrie\u0165</button>');
    document.getElementById('twf_x').onclick = closeBox;
  }

  function tick() {
    if (busy) return;
    var it = pick();
    if (dirty) { savePlan(); dirty = false; }
    if (!it) { finish(); return; }
    if (it.i !== curIdx) renderItem(it);
    updateCd(it);
  }

  initClock();
  renderForm();
})();
