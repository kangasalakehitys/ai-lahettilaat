/* AI-lähettiläät – sisältö luetaan content/-kansion tiedostoista. */
(function () {
  "use strict";

  const YEAR = 2027;
  const MONTHS = ["tammikuu", "helmikuu", "maaliskuu", "huhtikuu", "toukokuu", "kesäkuu",
    "heinäkuu", "elokuu", "syyskuu", "lokakuu", "marraskuu", "joulukuu"];
  const BREAK_MONTHS = { 6: "Kesätauko" };          // heinäkuu
  const JORY_MONTHS = { 5: "Jory: puolivuosikatsaus", 11: "Jory: vuosikatsaus" };

  // Kuusi tilaa (huom2.txt), samat kuin arviointityökalussa. keys = hyväksytyt kirjoitusasut.
  const STATUSES = [
    { label: "Ideat", c: "#00adc5", keys: ["ideat", "idea", "uusi idea"] },
    { label: "Arvioinnissa", c: "#fcb316", dark: true, keys: ["arvioinnissa"] },
    { label: "Työn alla", c: "#e64925", keys: ["työn alla"] },
    { label: "Testauksessa", c: "#28336c", keys: ["testauksessa"] },
    { label: "Tuotannossa", c: "#009651", keys: ["tuotannossa"] },
    { label: "Hylätty / Odottaa", c: "#8a8c94", keys: ["hylätty", "odottaa"] }
  ];
  const IMPACT = [
    { keys: ["korkea roi"], label: "Korkea ROI (€)", c: "#009651", pos: "1/2" },
    { keys: ["suuri vaikutus"], label: "Suuri vaikutus / suuri työmäärä", c: "#00adc5", pos: "1/3" },
    { keys: ["itsepalvelu"], label: "Itsepalvelu", c: "#fcb316", pos: "2/2", dark: true },
    { keys: ["suuri työmäärä", "työläs"], label: "Suuri työmäärä / pieni merkitys", c: "#e64925", pos: "2/3" }
  ];
  const PRIVACY = { "vihreä": "#009651", "keltainen": "#fcb316", "punainen": "#de232f" };
  const BAR_COLORS = ["#de232f", "#28336c", "#00adc5", "#009651", "#e64925", "#fcb316"];

  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").trim().toLowerCase();

  async function getText(path) {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(path + " (" + r.status + ")");
    return r.text();
  }

  function fail(el, what, err) {
    if (el) el.innerHTML = '<p class="error">' + esc(what) + " ei latautunut: " + esc(err.message) +
      '</p><p class="muted">Sivu pitää avata verkkopalvelimen kautta (ei suoraan tiedostona).</p>';
    console.error(err);
  }

  /* ---------- Linkkirivit ---------- */
  const LINK_RE = /^\[([^\]]+)\]\(\s*([^)\s]+)\s*\)\s*$/;
  const needsLogin = (u) => /sharepoint\.com|teams\.microsoft\.com/i.test(u);

  function linkHtml(text, url) {
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text) + "</a>" +
      (needsLogin(url) ? '<span class="badge-login" title="Vaatii Kangasalan tunnukset">vaatii kirjautumisen</span>' : "");
  }

  // Muuttaa rivit listoiksi: linkki → li, "- teksti" → aliviite, muu teksti → otsikko (tai kappale).
  function renderLines(lines, plainAsHeading) {
    let html = "", open = false;
    const close = () => { if (open) { html += "</ul>"; open = false; } };
    const ensure = () => { if (!open) { html += "<ul>"; open = true; } };
    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const m = line.match(LINK_RE);
      if (m) { ensure(); html += "<li>" + linkHtml(m[1], m[2]) + "</li>"; return; }
      if (/^[-*]\s+/.test(line)) { ensure(); html += '<li class="sub">' + inline(line.replace(/^[-*]\s+/, "")) + "</li>"; return; }
      close();
      if (/^lisätään myöhemmin/i.test(line)) html += '<p class="muted">Lisätään myöhemmin.</p>';
      else html += plainAsHeading ? "<h5>" + inline(line) + "</h5>" : "<p>" + inline(line) + "</p>";
    });
    close();
    return html;
  }

  // Tekstin sisäiset linkit [a](b)
  function inline(t) {
    let out = "", last = 0;
    const re = /\[([^\]]+)\]\(\s*([^)\s]+)\s*\)/g;
    let m;
    while ((m = re.exec(t))) {
      out += esc(t.slice(last, m.index)) + linkHtml(m[1], m[2]);
      last = re.lastIndex;
    }
    return out + esc(t.slice(last));
  }

  /* ---------- Kuukausiohjelma ---------- */
  function parseProgram(md) {
    const lines = md.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/);
    const months = {}, extras = [];
    let cur = null, curExtra = null, season = null;
    const monthRe = new RegExp("^##\\s+(" + MONTHS.join("|") + ")[\\s\\-–:]*(.*)$", "i");

    lines.forEach((line) => {
      const t = line.trim();
      if (/^-{3,}$/.test(t)) return;
      if (/^(kevätkausi|syyskausi)/i.test(t)) { season = t; cur = null; curExtra = null; return; }
      const mm = t.match(monthRe);
      if (mm) {
        const idx = MONTHS.indexOf(mm[1].toLowerCase());
        cur = { idx, title: mm[2].trim(), season, desc: [], free: [], paid: [], meet: null, status: null, part: "desc" };
        months[idx] = cur; curExtra = null; return;
      }
      if (/^##\s+/.test(t) && !/^###/.test(t)) {
        cur = null; curExtra = { title: t.replace(/^##\s+/, ""), lines: [] }; extras.push(curExtra); return;
      }
      if (curExtra) { curExtra.lines.push(t); return; }
      if (!cur) return;
      let m;
      if ((m = t.match(/^tapaaminen\s*:\s*(.+)$/i))) { cur.meet = m[1]; return; }
      if ((m = t.match(/^tila\s*:\s*(.+)$/i))) { cur.status = norm(m[1]); return; }
      if (/^###\s+/.test(t) && !/^####/.test(t)) { cur.part = "free"; return; }
      if (/^####\s+maksuttomat/i.test(t)) { cur.part = "free"; return; }
      if (/^####\s+maksulliset/i.test(t)) { cur.part = "paid"; return; }
      if (cur.part === "desc") { if (t) cur.desc.push(t); }
      else cur[cur.part].push(t);
    });
    return { months, extras };
  }

  function secondThursday(year, month) {
    const d = new Date(year, month, 1);
    const first = (4 - d.getDay() + 7) % 7 + 1;
    return new Date(year, month, first + 7);
  }
  const fiDate = (d) => d.getDate() + "." + (d.getMonth() + 1) + "." + d.getFullYear();

  function monthStatus(idx, override) {
    if (override) {
      if (override.startsWith("valm")) return "valmis";
      if (override.startsWith("käyn") || override.startsWith("kayn")) return "kaynnissa";
      return "tulossa";
    }
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    if (y > YEAR || (y === YEAR && m > idx)) return "valmis";
    if (y === YEAR && m === idx) return "kaynnissa";
    return "tulossa";
  }
  const STATUS_LABEL = { valmis: "Valmis", kaynnissa: "Käynnissä", tulossa: "Tulossa" };

  function meetingText(idx, mo) {
    if (BREAK_MONTHS[idx]) return null;
    if (mo && mo.meet) return mo.meet;
    return "to " + fiDate(secondThursday(YEAR, idx));
  }

  function renderCalendar(data) {
    const el = $("#calendar");
    if (!el) return;
    const seasons = [
      { name: "Kevätkausi: perusteet ja AI-lähettiläiden käynnistys", from: 0, to: 5 },
      { name: "Syyskausi: syventävät taidot, hallinta ja verkostoituminen", from: 6, to: 11 }
    ];
    // käytä tiedoston kausiotsikoita, jos ne löytyvät
    Object.values(data.months).forEach((mo) => {
      if (mo.season) { const s = mo.idx < 6 ? seasons[0] : seasons[1]; s.name = mo.season.replace(/\s*\(.*\)\s*$/, ""); }
    });
    let html = "";
    seasons.forEach((s) => {
      html += '<p class="season">' + esc(s.name) + '</p><div class="cal">';
      for (let i = s.from; i <= s.to; i++) {
        const mo = data.months[i];
        const isBreak = BREAK_MONTHS[i] && !mo;
        const st = monthStatus(i, mo && mo.status);
        const meet = meetingText(i, mo);
        const theme = mo ? mo.title : (isBreak ? BREAK_MONTHS[i] : "Ohjelma täydentyy");
        html += '<button type="button" class="month' + (isBreak ? " break" : "") + '" data-idx="' + i + '" aria-pressed="false"' +
          (isBreak ? " disabled" : "") + ">" +
          '<span class="m-name">' + esc(MONTHS[i]) + (isBreak ? "" : ' <span class="chip ' + st + '">' + STATUS_LABEL[st] + "</span>") + "</span>" +
          '<span class="m-theme">' + esc(theme) + "</span>" +
          (meet ? '<span class="m-meet">Ryhmä: ' + esc(meet) + "</span>" : "") +
          (JORY_MONTHS[i] ? '<span class="tags"><span class="chip jory">' + esc(JORY_MONTHS[i]) + "</span></span>" : "") +
          "</button>";
      }
      html += "</div>";
    });
    html += '<div id="month-detail" class="month-detail" aria-live="polite"></div>';
    el.innerHTML = html;

    el.addEventListener("click", (e) => {
      const b = e.target.closest(".month");
      if (!b || b.disabled) return;
      select(+b.dataset.idx, true);
    });

    function select(idx, scroll) {
      el.querySelectorAll(".month").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.idx === idx)));
      const mo = data.months[idx];
      const det = $("#month-detail");
      const meet = meetingText(idx, mo);
      let h = '<h3 style="text-transform:capitalize">' + esc(MONTHS[idx]) + " " + YEAR + "</h3>";
      h += '<p style="font-weight:700;font-size:1.1rem">' + esc(mo ? mo.title : "Ohjelma täydentyy") + "</p>";
      h += '<div class="meta">' + (meet ? "<span>Ryhmän tapaaminen: " + esc(meet) + " (max 1 h, Teams / livenä)</span>" : "") +
        (JORY_MONTHS[idx] ? "<span>" + esc(JORY_MONTHS[idx]) + "</span>" : "") + "</div>";
      if (mo) {
        h += mo.desc.map((d) => "<p>" + inline(d) + "</p>").join("");
        h += '<div class="mat-cols"><div class="mat"><h4>Maksuttomat materiaalit</h4>' +
          (renderLines(mo.free, true) || '<p class="muted">Lisätään myöhemmin.</p>') + "</div>" +
          '<div class="mat"><h4>Maksulliset</h4>' + (renderLines(mo.paid, true) || '<p class="muted">Lisätään myöhemmin.</p>') + "</div></div>";
      } else {
        h += '<p class="muted">Kuukauden teema ja materiaalit lisätään myöhemmin.</p>';
      }
      det.innerHTML = h;
      if (scroll) det.scrollIntoView({ behavior: "smooth", block: "start" });
      try { history.replaceState(null, "", "#kk-" + MONTHS[idx]); } catch (e) { /* ei haittaa */ }
    }

    const hash = decodeURIComponent(location.hash.replace("#kk-", ""));
    const now = new Date();
    let start = MONTHS.indexOf(hash);
    if (start < 0) start = now.getFullYear() === YEAR ? now.getMonth() : 0;
    if (BREAK_MONTHS[start] && !data.months[start]) start += 1;
    select(start, MONTHS.indexOf(hash) >= 0);
  }

  function renderExtras(data) {
    const el = $("#extras");
    if (!el) return;
    if (!data.extras.length) { el.innerHTML = '<p class="muted">Ei lisättyjä linkkejä.</p>'; return; }
    el.innerHTML = data.extras.map((x) =>
      '<div class="panel"><h3>' + esc(x.title) + "</h3>" + renderLines(x.lines, false) + "</div>").join("");
  }

  /* ---------- Tiekartta ---------- */
  function parseRoadmap(md) {
    const clean = md.replace(/<!--[\s\S]*?-->/g, "");
    const parts = clean.split(/^##\s+käyttötapaukset\s*$/im);
    const intro = parts[0];
    const cases = [];
    if (parts[1]) {
      const body = parts[1].split(/^##\s+(?!#)/m)[0];
      body.split(/^###/m).slice(1).forEach((block) => {
        const lines = block.split(/\r?\n/);
        const head = lines.shift().replace(/^#+/, "").trim();
        const f = {};
        lines.forEach((l) => {
          const m = l.trim().match(/^[-*]?\s*([^:]+?)\s*:\s*(.*)$/);
          if (m && !/^https?$/i.test(m[1])) f[norm(m[1])] = m[2].trim();
        });
        const name = f["käyttötapauksen nimi"] || head;
        if (!name && !Object.keys(f).length) return;
        const st = statusOf(f["tila"]);
        cases.push({
          name: name || "(nimetön käyttötapaus)",
          area: f["palvelualue"] || "", unit: f["yksikkö"] || "",
          status: st ? st.label : (f["tila"] || ""), type: f["tyyppi"] || "",
          impact: f["vaikuttavuus"] || "", planner: f["planner"] || "", desc: f["kuvaus"] || "",
          privacy: f["tietosuoja"] || "", jory: /^(kyllä|kylla|k|x|true)$/i.test(f["jory"] || f["jory-huomio"] || ""),
          prio: f["prioriteetti"] || ""
        });
      });
    }
    return { intro, cases };
  }

  const statusOf = (s) => STATUSES.find((x) => x.keys.some((k) => norm(s).startsWith(k)));
  const impactOf = (s) => IMPACT.find((x) => x.keys.some((k) => norm(s).replace(/\s+/g, " ").startsWith(k)));

  /* ---------- Tiekartan seuranta: tiekartta.md + ladatut JSON-tilannekuvat ---------- */
  // Ladatut tiedostot luetaan vain tähän selaimeen (localStorage), niitä ei julkaista.
  const SNAP_KEY = "ail-seuranta";
  const PRIV_LABEL = { vihrea: "Vihreä", keltainen: "Keltainen", punainen: "Punainen" };
  const RM = { mdCases: [], snaps: [], month: "", cur: [] };
  const pad2 = (n) => (n < 10 ? "0" : "") + n;
  const monthLabel = (m) => { const p = String(m).split("-"); return +p[1] + "/" + p[0]; };
  const fiDateTime = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.getDate() + "." + (d.getMonth() + 1) + "." + d.getFullYear() + " klo " + d.getHours() + "." + pad2(d.getMinutes()); };

  function loadSnaps() {
    try {
      const v = JSON.parse(localStorage.getItem(SNAP_KEY) || "[]");
      return Array.isArray(v) ? v.filter((x) => x && /^\d{4}-\d{2}$/.test(x.month) && Array.isArray(x.cases)) : [];
    } catch (e) { return []; }
  }
  function saveSnaps() { try { localStorage.setItem(SNAP_KEY, JSON.stringify(RM.snaps)); return true; } catch (e) { return false; } }

  // Arviointityökalun käyttötapaus → tiekartan kortti. Omistajaa ei oteta mukaan.
  function toRoadmapCase(raw, params) {
    let e = null;
    if (window.AIArviointi) {
      try { e = window.AIArviointi.evaluate(raw, params || undefined); }
      catch (err) { try { e = window.AIArviointi.evaluate(raw); } catch (err2) { e = null; } }
    }
    const st = statusOf(raw.status);
    return {
      id: String(raw.id || ""), name: String(raw.name || "(nimetön käyttötapaus)"),
      area: String(raw.center || ""), unit: String(raw.unit || ""),
      status: st ? st.label : String(raw.status || ""), type: String(raw.type || ""),
      impact: e ? e.quad.label : "", desc: String(raw.problem || ""),
      privacy: PRIV_LABEL[raw.privacy] || "", jory: !!raw.jory,
      prio: e ? String(Math.round(e.prio)) : "", prioN: e ? e.prio : null,
      updated: String(raw.updated || ""), planner: ""
    };
  }

  function importSnapshots(files) {
    const byMonth = {}, errors = [];
    const now = new Date();
    let read = 0;
    files.forEach((f) => {
      let obj;
      try { obj = JSON.parse(f.text); } catch (e) { errors.push(f.name + ": ei kelvollista JSONia"); return; }
      if (obj && obj.type === "ai-arviointi-parametrit") { errors.push(f.name + ": parametritiedosto, ohitettiin"); return; }
      const list = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.cases)) ? obj.cases
        : (obj && typeof obj === "object" && (obj.name != null || obj.scores)) ? [obj] : null;
      if (!list || !list.length) { errors.push(f.name + ": ei käyttötapauksia"); return; }
      let d = obj && obj.exported ? new Date(obj.exported) : now;
      if (isNaN(d)) d = now;
      const month = d.getFullYear() + "-" + pad2(d.getMonth() + 1);
      const params = obj && !Array.isArray(obj) && obj.params ? obj.params : null;
      const m = byMonth[month] = byMonth[month] || {};
      list.forEach((raw) => {
        if (!raw || typeof raw !== "object") return;
        const c = toRoadmapCase(raw, params);
        const key = c.id || norm(c.name);
        if (!m[key] || c.updated > m[key].updated) m[key] = c;
        read++;
      });
    });
    const months = Object.keys(byMonth).sort();
    const loaded = new Date().toISOString();
    months.forEach((month) => {
      RM.snaps = RM.snaps.filter((x) => x.month !== month).concat([{ month, loaded, cases: Object.values(byMonth[month]) }]);
    });
    RM.snaps.sort((a, b) => a.month.localeCompare(b.month));
    const stored = months.length ? saveSnaps() : true;
    if (months.length) RM.month = RM.snaps[RM.snaps.length - 1].month;
    const msgEl = $("#rm-msg");
    if (msgEl) {
      let t = "";
      if (months.length) t = files.length + " tiedosto" + (files.length === 1 ? "" : "a") + " luettu: " + read + " käyttötapausta, " +
        (months.length === 1 ? "kuukausi " : "kuukaudet ") + months.map(monthLabel).join(", ") + ".";
      if (errors.length) t += (t ? " " : "") + "Ohitettiin: " + errors.join(" · ") + ".";
      if (!stored) t += " Huom: selain esti tallennuksen, tiedot näkyvät vain tämän sivun ollessa auki.";
      msgEl.textContent = t;
      msgEl.className = "rm-msg " + (errors.length || !stored ? (months.length ? "warn" : "error") : "ok");
    }
    renderTracking();
  }

  function renderRoadmapIntro(intro) {
    const introEl = $("#roadmap-intro");
    if (!introEl) return;
    const lines = intro.split(/\r?\n/).map((l) => l.trim());
    let h = "", list = false;
    lines.forEach((l) => {
      if (!l) return;
      if (/^#\s+/.test(l)) { h += '<p class="lead">' + inline(l.replace(/^#\s+/, "")) + "</p>"; return; }
      if (/^-\s*/.test(l)) { if (!list) { h += '<ul class="goals">'; list = true; } h += "<li>" + inline(l.replace(/^-\s*/, "")) + "</li>"; return; }
      if (list) { h += "</ul>"; list = false; }
      h += "<p>" + inline(l) + "</p>";
    });
    if (list) h += "</ul>";
    introEl.innerHTML = h;
  }

  function renderRoadmap(rm) {
    renderRoadmapIntro(rm.intro);
    RM.mdCases = rm.cases;
    RM.snaps = loadSnaps();
    if (RM.snaps.length) RM.month = RM.snaps[RM.snaps.length - 1].month;
    setupTracking();
    renderTracking();
  }

  let trackingReady = false;
  function setupTracking() {
    if (trackingReady) return;
    trackingReady = true;
    const file = $("#rm-file"), pick = $("#rm-pick"), clear = $("#rm-clear"), monthSel = $("#rm-month");
    if (pick && file) pick.addEventListener("click", () => { file.value = ""; file.click(); });
    if (file) file.addEventListener("change", () => {
      const list = Array.from(file.files || []);
      if (!list.length) return;
      Promise.all(list.map((f) => new Promise((res) => {
        const rd = new FileReader();
        rd.onload = () => res({ name: f.name, text: String(rd.result || "") });
        rd.onerror = () => res({ name: f.name, text: "" });
        rd.readAsText(f, "utf-8");
      }))).then(importSnapshots);
    });
    if (clear) clear.addEventListener("click", () => {
      if (!window.confirm("Poistetaanko ladatut käyttötapaustiedot tästä selaimesta?")) return;
      RM.snaps = []; RM.month = ""; saveSnaps();
      const m = $("#rm-msg"); if (m) { m.textContent = "Ladatut tiedot poistettu."; m.className = "rm-msg ok"; }
      renderTracking();
    });
    if (monthSel) monthSel.addEventListener("change", () => { RM.month = monthSel.value; renderTracking(); });
    const chart = $("#rm-chart");
    if (chart) chart.addEventListener("click", (e) => {
      const b = e.target.closest("[data-month]");
      if (b) { RM.month = b.dataset.month; renderTracking(); }
    });
    ["#f-area", "#f-status", "#f-type"].forEach((id) => { const el = $(id); if (el) el.addEventListener("change", drawCases); });
  }

  function renderTracking() {
    const snap = RM.snaps.find((x) => x.month === RM.month) || RM.snaps[RM.snaps.length - 1] || null;
    if (snap) RM.month = snap.month;
    const statusEl = $("#rm-status"), clear = $("#rm-clear"), monthly = $("#rm-monthly");
    if (statusEl) statusEl.innerHTML = snap
      ? "Näytetään tilanne <b>" + esc(monthLabel(snap.month)) + "</b> · " + snap.cases.length + " käyttötapausta · ladattu " + esc(fiDateTime(snap.loaded))
      : "Ei ladattuja tiedostoja. Alla näkyvät tiekarttaan kirjatut käyttötapaukset.";
    if (clear) clear.hidden = !RM.snaps.length;
    if (monthly) monthly.hidden = !RM.snaps.length;
    if (RM.snaps.length) renderMonthly();
    const cases = (snap ? snap.cases : []).concat(RM.mdCases)
      .slice().sort((a, b) => (b.prioN == null ? -1 : b.prioN) - (a.prioN == null ? -1 : a.prioN));
    renderCases(cases);
  }

  function renderMonthly() {
    const sel = $("#rm-month");
    if (sel) sel.innerHTML = RM.snaps.slice().reverse().map((x) =>
      '<option value="' + esc(x.month) + '"' + (x.month === RM.month ? " selected" : "") + ">" + esc(monthLabel(x.month)) + "</option>").join("");
    const max = Math.max(1, ...RM.snaps.map((x) => x.cases.length));
    const chart = $("#rm-chart");
    if (chart) {
      chart.innerHTML = '<div class="rm-bars">' + RM.snaps.map((x) => {
        const total = x.cases.length;
        const segs = STATUSES.map((st) => {
          const n = x.cases.filter((c) => statusOf(c.status) === st).length;
          return n ? '<i style="flex:' + n + ";background:" + st.c + '" title="' + esc(st.label) + ": " + n + '"></i>' : "";
        }).join("");
        const other = x.cases.filter((c) => !statusOf(c.status)).length;
        return '<button type="button" class="rm-col' + (x.month === RM.month ? " on" : "") + '" data-month="' + esc(x.month) + '" aria-pressed="' + (x.month === RM.month) +
          '" aria-label="' + esc(monthLabel(x.month)) + ": " + total + ' käyttötapausta"><b>' + total + "</b>" +
          '<span class="rm-stack" style="height:' + Math.max(6, Math.round(total / max * 160)) + 'px">' + segs +
          (other ? '<i style="flex:' + other + ';background:#c4c5cc" title="Tila puuttuu: ' + other + '"></i>' : "") + "</span>" +
          '<span class="rm-mlabel">' + esc(monthLabel(x.month)) + "</span></button>";
      }).join("") + "</div>" +
        '<ul class="rm-legend">' + STATUSES.map((st) => '<li><i style="background:' + st.c + '"></i>' + esc(st.label) + "</li>").join("") + "</ul>";
    }
    const table = $("#rm-table");
    if (table) {
      let prevKeys = null;
      const rows = RM.snaps.map((x) => {
        const keys = x.cases.map((c) => c.id || norm(c.name));
        const added = prevKeys ? keys.filter((k) => prevKeys.indexOf(k) < 0).length : null;
        prevKeys = keys;
        const pr = x.cases.filter((c) => c.prioN != null);
        const avg = pr.length ? Math.round(pr.reduce((a, c) => a + c.prioN, 0) / pr.length) : null;
        return "<tr" + (x.month === RM.month ? ' class="on"' : "") + "><td>" + esc(monthLabel(x.month)) + "</td><td>" + x.cases.length + "</td><td>" + (added == null ? "–" : "+" + added) + "</td><td>" +
          x.cases.filter((c) => statusOf(c.status) && statusOf(c.status).label === "Tuotannossa").length + "</td><td>" + (avg == null ? "–" : avg) + "</td><td>" +
          x.cases.filter((c) => c.jory).length + "</td></tr>";
      }).reverse().join("");
      table.innerHTML = '<table class="rm-table"><thead><tr><th scope="col">Kuukausi</th><th scope="col">Käyttötapauksia</th><th scope="col">Uusia</th>' +
        '<th scope="col">Tuotannossa</th><th scope="col">Keskim. prioriteetti</th><th scope="col">Jory-huomioita</th></tr></thead><tbody>' + rows + "</tbody></table>";
    }
  }

  function renderCases(cases) {
    RM.cur = cases;
    const strip = $("#status-strip");
    if (strip) strip.innerHTML = STATUSES.map((s) => {
      const n = cases.filter((c) => statusOf(c.status) === s).length;
      return '<div style="--c:' + s.c + '"><b>' + n + "</b><span>" + esc(s.label) + "</span></div>";
    }).join("");

    const types = {};
    cases.forEach((c) => { const t = c.type || "Ei määritelty"; types[t] = (types[t] || 0) + 1; });
    const typeEl = $("#type-list");
    const tKeys = Object.keys(types).sort((a, b) => types[b] - types[a]);
    if (typeEl) typeEl.innerHTML = tKeys.length
      ? tKeys.map((t) => "<li><span>" + esc(t) + "</span><b>" + types[t] + "</b></li>").join("")
      : '<li class="muted">Ei vielä käyttötapauksia</li>';

    const mx = $("#matrix");
    if (mx) {
      let mh = '<div class="ax-y">Vaikutus →</div>';
      IMPACT.forEach((im) => {
        const [r, c] = im.pos.split("/");
        const n = cases.filter((x) => impactOf(x.impact) === im).length;
        mh += '<div class="cell" style="grid-row:' + r + ";grid-column:" + c + ";background:" + im.c + (im.dark ? ";color:#1d1d1f" : "") + '"><b>' + n + "</b><span>" + esc(im.label) + "</span></div>";
      });
      mx.innerHTML = mh + '<div class="ax-x">Työmäärä →</div>';
    }

    const fill = (sel, vals) => {
      if (!sel) return;
      const keep = sel.value;
      sel.innerHTML = '<option value="">Kaikki</option>' + vals.map((v) => '<option value="' + esc(v) + '">' + esc(v) + "</option>").join("");
      if (vals.indexOf(keep) >= 0) sel.value = keep;
    };
    const uniq = (k) => [...new Set(cases.map((c) => c[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fi"));
    fill($("#f-area"), uniq("area")); fill($("#f-status"), uniq("status")); fill($("#f-type"), uniq("type"));
    drawCases();
  }

  function drawCases() {
    const listEl = $("#uc-list");
    if (!listEl) return;
    const cases = RM.cur;
    const a = ($("#f-area") || {}).value, s = ($("#f-status") || {}).value, t = ($("#f-type") || {}).value;
    const shown = cases.filter((c) => (!a || c.area === a) && (!s || c.status === s) && (!t || c.type === t));
    if (!cases.length) {
      listEl.innerHTML = '<div class="empty" style="grid-column:1/-1">Ei vielä käyttötapauksia. Lataa arviointityökalun JSON-tiedostot yllä, niin käyttötapaukset näkyvät tässä.</div>';
      return;
    }
    if (!shown.length) { listEl.innerHTML = '<div class="empty" style="grid-column:1/-1">Ei käyttötapauksia valituilla suodattimilla.</div>'; return; }
    listEl.innerHTML = shown.map((c) => {
      const st = statusOf(c.status), im = impactOf(c.impact);
      return '<article class="uc" style="--c:' + (st ? st.c : "#e4e4e8") + '">' +
        "<h4>" + esc(c.name) + "</h4>" +
        '<div class="where">' + esc([c.area, c.unit].filter(Boolean).join(" · ")) + "</div>" +
        '<div class="tags">' +
        (c.status ? '<span class="chip" style="background:' + (st ? st.c : "#eee") + ';color:' + (st && !st.dark ? "#fff" : "#1d1d1f") + '">' + esc(c.status) + "</span>" : "") +
        (c.prio ? '<span class="chip">Prioriteetti ' + esc(c.prio) + "</span>" : "") +
        (c.type ? '<span class="chip">' + esc(c.type) + "</span>" : "") +
        (c.impact ? '<span class="chip" style="border:1px solid ' + (im ? im.c : "#ccc") + '">' + esc(c.impact) + "</span>" : "") +
        (c.privacy ? '<span class="chip"><i class="dot" style="background:' + (PRIVACY[norm(c.privacy)] || "#ccc") + '"></i>Tietosuoja: ' + esc(c.privacy) + "</span>" : "") +
        (c.jory ? '<span class="chip jory">Jory</span>' : "") +
        "</div>" +
        (c.desc ? "<p style=\"font-size:.92rem;margin:0 0 6px\">" + inline(c.desc) + "</p>" : "") +
        (/^https?:\/\//i.test(c.planner) ? linkHtml("Avaa Plannerissa", c.planner) : "") +
        "</article>";
    }).join("");
  }

  /* ---------- Lähettiläät (Excel, vain sarake A) ---------- */
  async function renderAmbassadors() {
    const el = $("#ambassadors");
    if (!el) return;
    try {
      if (typeof XLSX === "undefined") throw new Error("Excel-lukija ei latautunut");
      const r = await fetch("content/lahettilaat.xlsx", { cache: "no-cache" });
      if (!r.ok) throw new Error("content/lahettilaat.xlsx (" + r.status + ")");
      const wb = XLSX.read(await r.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false });
      const counts = {};
      rows.forEach((row) => {
        const v = String(row[0] == null ? "" : row[0]).trim();
        if (!v || norm(v) === "palvelualue") return;
        counts[v] = (counts[v] || 0) + 1;
      });
      const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, "fi"));
      const total = keys.reduce((s, k) => s + counts[k], 0);
      const max = Math.max(1, ...keys.map((k) => counts[k]));
      el.innerHTML = '<div><div class="amb-total">' + total + '</div><p class="muted" style="margin:6px 0 0">AI-lähettilästä ' + keys.length + " palvelualueelta</p></div>" +
        '<ul class="bars">' + keys.map((k, i) =>
          '<li style="--c:' + BAR_COLORS[i % BAR_COLORS.length] + '"><span>' + esc(k) + '</span><span class="bar"><i style="width:' +
          Math.round(counts[k] / max * 100) + '%"></i></span><b>' + counts[k] + "</b></li>").join("") + "</ul>";
    } catch (err) { fail(el, "Lähettiläslista", err); }
  }

  /* ---------- Työkalusivu ---------- */
  async function renderTool() {
    const el = $("#tool");
    if (!el) return;
    try {
      const md = (await getText("content/tyokalu.md")).trim();
      if (!md) {
        el.innerHTML = "<h1>AI-käyttötapausten arviointityökalu</h1>";
        return;
      }
      // Sivulla näytetään vain otsikko; ohjeteksti näkyy työkalun 1. vaiheessa (Ohjeet).
      const m = md.match(/^#\s+(.+)$/m);
      el.innerHTML = "<h1>" + esc(m ? m[1].trim() : "AI-käyttötapausten arviointityökalu") + "</h1>";
    } catch (err) { fail(el, "Työkalun kuvaus", err); }
  }

  /* ---------- Navigaatio ---------- */
  function nav() {
    const btn = $(".nav-toggle"), menu = $(".nav");
    if (!btn || !menu) return;
    btn.addEventListener("click", () => {
      const open = menu.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
    menu.addEventListener("click", (e) => {
      if (e.target.closest("a")) { menu.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
    });
  }

  async function init() {
    nav();
    const y = $("#year"); if (y) y.textContent = new Date().getFullYear();
    if ($("#calendar")) {
      getText("content/kuukausiohjelma.md")
        .then((md) => { const d = parseProgram(md); renderCalendar(d); renderExtras(d); })
        .catch((e) => { fail($("#calendar"), "Kuukausiohjelma", e); });
    }
    if ($("#roadmap-intro")) {
      getText("content/tiekartta.md")
        .then((md) => renderRoadmap(parseRoadmap(md)))
        .catch((e) => fail($("#roadmap-intro"), "Tiekartta", e));
    }
    renderAmbassadors();
    renderTool();
  }

  // testejä varten
  window.__AIL = { parseProgram, parseRoadmap, secondThursday, toRoadmapCase };
  document.addEventListener("DOMContentLoaded", init);
})();
