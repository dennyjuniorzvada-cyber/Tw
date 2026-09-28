(function () {
  var UNITS = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult'];
  var POP = { spear: 1, sword: 1, axe: 1, archer: 1, spy: 2, light: 4, marcher: 5, heavy: 6, ram: 5, catapult: 8 };
  var FILL = ['spear', 'sword', 'archer', 'axe', 'spy', 'light', 'marcher', 'heavy'];
  var SPD = { spear: 18, sword: 22, axe: 18, archer: 18, spy: 9, light: 10, marcher: 10, heavy: 11, ram: 30, catapult: 30, knight: 10, snob: 35 };
  var cfg = { speed: 1, unitSpeed: 1 };
  var plan = [], sent = 0, srvOff = 0, win = null, timer = null, curIdx = -1, busy = false, planNote = '';

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
        var c = rows[i].querySelectorAll('td');
        if (c.length >= 2 && /(points|body|punkte|punkty)/i.test(c[0].textContent)) {
          var n = parseInt(c[1].textContent.replace(/\D/g, ''), 10);
          if (n) return n;
        }
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
      return a;
    });
  }

  function compose(avail, need) {
    var base = avail.ram > 0 ? 'ram' : (avail.catapult > 0 ? 'catapult' : null);
    if (!base) return null;
    var use = {};
    use[base] = 1;
    var rem = need - POP[base];
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
    var res = [], idx = 0, skipped = 0;
    queue.forEach(function (t) {
      var placed = false;
      for (var tries = 0; tries < vs.length && !placed; tries++) {
        var vi = (idx + tries) - vs.length * Math.floor((idx + tries) / vs.length);
        var v = vs[vi];
        var use = compose(v.avail, v.need);
        if (!use) continue;
        var tr = travelSec(use, v.xy, t);
        var sf = 0, st = Infinity;
        if (win) {
          var g = (win.to - win.from) > 6000 ? 1500 : 0;
          sf = win.from - tr * 1000 + g;
          st = win.to - tr * 1000 - g;
          if (st < srvNow() + 3000) continue;
        }
        for (var u in use) v.avail[u] -= use[u];
        res.push({ v: v, t: t, use: use, tr: tr, sf: sf, st: st, state: 0 });
        idx = (vi + 1) - vs.length * Math.floor((vi + 1) / vs.length);
        placed = true;
      }
      if (!placed) skipped++;
    });
    return { res: res, skipped: skipped };
  }

  function errText(d) {
    var e = d.querySelector('.error_box') || d.querySelector('.error');
    return e ? e.textContent.trim() : 'neznáma chyba (možno bot-ochrana, skús ručne)';
  }

  function sendOne(item) {
    var url = '/game.php?village=' + item.v.id + '&screen=place';
    return fetchDoc(url).then(function (d) {
      var form = d.getElementById('command-data-form');
      if (!form) throw new Error('Formulár námestia sa nenašiel.');
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
    show('<b>Fake pomocník</b><br>Koordináty (500|500 501|502):<br>' +
      '<textarea id="twf_c" rows="3" style="width:250px"></textarea><br>' +
      'Fakov na cieľ: <input id="twf_n" type="number" value="1" min="1" style="width:45px"><br>' +
      'Fake limit (v percentách): <input id="twf_l" type="number" value="1" min="0" step="0.1" style="width:45px"><br>' +
      '<label><input id="twf_tw" type="checkbox" checked> Použiť čas dopadu (serverový čas)</label><br>' +
      'Dopad od: <input id="twf_d1" type="date" value="' + isoDate(base) + '"> <input id="twf_t1" type="time" step="1" value="' + isoTime(base) + '"><br>' +
      'Dopad do: <input id="twf_d2" type="date" value="' + isoDate(base + 3600000) + '"> <input id="twf_t2" type="time" step="1" value="' + isoTime(base + 3600000) + '"><br>' +
      '<button class="btn" id="twf_go">Pripraviť</button> <button class="btn" id="twf_x">Zavrieť</button>');
    document.getElementById('twf_x').onclick = closeBox;
    document.getElementById('twf_go').onclick = function () {
      var targets = (document.getElementById('twf_c').value.match(/\d{1,3}\|\d{1,3}/g) || []).map(function (s) { return s.split('|'); });
      if (!targets.length) { alert('Zadaj koordináty, napr. 500|500'); return; }
      var n = Math.max(1, parseInt(document.getElementById('twf_n').value, 10) || 1);
      var limit = parseFloat(document.getElementById('twf_l').value) || 1;
      win = null;
      if (document.getElementById('twf_tw').checked) {
        var f = parseDT(document.getElementById('twf_d1').value, document.getElementById('twf_t1').value);
        var t = parseDT(document.getElementById('twf_d2').value, document.getElementById('twf_t2').value);
        if (isNaN(f) || isNaN(t) || f >= t) { alert('Neplatné časové okno (od musí byť pred do).'); return; }
        if (t <= srvNow()) { alert('Časové okno je v minulosti.'); return; }
        win = { from: f, to: t };
      }
      prepare(targets, n, limit);
    };
  }

  async function prepare(targets, n, limit) {
    show('<b>Načítavam nastavenia sveta a dediny…</b><div id="twf_log"></div>');
    await loadConfig();
    log('Rýchlosť sveta: ' + cfg.speed + ', jednotiek: ' + cfg.unitSpeed);
    var all = await getVillages();
    if (!all.length) { show('Nenašli sa dediny v aktuálnej skupine.<br><button class="btn" id="twf_b">Späť</button>'); document.getElementById('twf_b').onclick = renderForm; return; }
    var vs = [];
    for (var i = 0; i < all.length; i++) {
      log((i + 1) + '/' + all.length + ' ' + all[i].coord);
      var pts = await getPoints(all[i].id);
      await sleep(rnd(150, 350));
      var av = await getTroops(all[i].id);
      await sleep(rnd(150, 350));
      if (!pts) { log('&nbsp;&nbsp;body sa nenašli, preskakujem'); continue; }
      all[i].points = pts;
      all[i].avail = av;
      all[i].need = Math.max(1, Math.ceil(pts * limit / 100 - 0.000001));
      vs.push(all[i]);
    }
    var p = makePlan(vs, targets, n);
    plan = p.res; sent = 0; curIdx = -1; busy = false;
    if (!plan.length) { show('Nič sa nedá naplánovať (málo jednotiek, baranidlo/katapult alebo dopad v okne je nedosiahnuteľný).<br><button class="btn" id="twf_b">Späť</button>'); document.getElementById('twf_b').onclick = renderForm; return; }
    planNote = p.skipped ? 'Nenaplánované: ' + p.skipped + ' (málo jednotiek alebo nestihne okno)<br>' : '';
    clearInterval(timer);
    timer = setInterval(tick, 500);
    tick();
  }

  function pick() {
    var now = srvNow(), best = null, bestOpen = null;
    plan.forEach(function (it, i) {
      it.i = i;
      if (it.state !== 0) return;
      if (it.st < now) { it.state = 3; return; }
      if (it.sf <= now) { if (!bestOpen || it.st < bestOpen.st) bestOpen = it; }
      else if (!best || it.sf < best.sf) best = it;
    });
    return bestOpen || best;
  }

  function renderItem(it) {
    curIdx = it.i;
    var us = Object.keys(it.use).map(function (u) { return it.use[u] + '× ' + u; }).join(', ');
    var tm = '';
    if (win) {
      tm = '<br>Cesta: ' + dur(it.tr) + '<br>Odoslať medzi: <b>' + fmt(it.sf) + '</b> a <b>' + fmt(it.st) + '</b>' +
        '<br>Okno dopadu: ' + fmt(win.from) + ' – ' + fmt(win.to);
    }
    show(planNote + 'Odoslané: ' + sent + ', zmeškané: ' + count(3) + ', zostáva: ' + count(0) + '<br>' +
      '<b>Fake ' + (it.i + 1) + ' / ' + plan.length + '</b><br>' +
      'Z: ' + it.v.coord + ' (body ' + it.v.points + ', min. pop ' + it.v.need + ')<br>' +
      'Na: ' + it.t[0] + '|' + it.t[1] + '<br>Jednotky: ' + us + tm +
      '<div id="twf_cd"></div>' +
      '<button class="btn" id="twf_send">Odoslať</button> <button class="btn" id="twf_skip">Preskočiť</button> <button class="btn" id="twf_x">Zavrieť</button>' +
      '<div id="twf_log"></div>');
    document.getElementById('twf_x').onclick = closeBox;
    document.getElementById('twf_skip').onclick = function () { it.state = 2; curIdx = -1; tick(); };
    document.getElementById('twf_send').onclick = function () {
      busy = true;
      document.getElementById('twf_send').disabled = true;
      sendOne(it).then(function () {
        it.state = 1; sent++; busy = false; curIdx = -1; tick();
      }).catch(function (e) {
        busy = false;
        log('Chyba: ' + e.message);
      });
    };
  }

  function updateCd(it) {
    var b = document.getElementById('twf_send'), c = document.getElementById('twf_cd');
    if (!b || !c || busy) return;
    if (!win) { b.disabled = false; c.innerHTML = ''; return; }
    var now = srvNow();
    if (now < it.sf) {
      b.disabled = true;
      c.innerHTML = 'Okno odoslania sa otvorí o <b>' + dur(Math.ceil((it.sf - now) / 1000)) + '</b>';
    } else {
      b.disabled = false;
      c.innerHTML = '<b style="color:green">Môžeš odoslať</b> – zostáva ' + dur(Math.floor((it.st - now) / 1000)) +
        '<br>Dopad by bol o ' + fmt(now + it.tr * 1000);
    }
  }

  function finish() {
    clearInterval(timer);
    show('<b>Hotovo.</b> Odoslané: ' + sent + ', zmeškané: ' + count(3) + ', preskočené: ' + count(2) + '<br><button class="btn" id="twf_x">Zavrieť</button>');
    document.getElementById('twf_x').onclick = closeBox;
  }

  function tick() {
    if (busy) return;
    var it = pick();
    if (!it) { finish(); return; }
    if (it.i !== curIdx) renderItem(it);
    updateCd(it);
  }

  initClock();
  renderForm();
})();
