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

  // Muuttaa rivit listoiksi: linkki tai "* teksti" → li, "- teksti" → aliviite,
  // "### Otsikko" → väliotsikko, muu teksti → otsikko (tai kappale).
  function renderLines(lines, plainAsHeading) {
    let html = "", open = false;
    const close = () => { if (open) { html += "</ul>"; open = false; } };
    const ensure = () => { if (!open) { html += "<ul>"; open = true; } };
    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const h = line.match(/^#{3,}\s+(.*)$/);
      if (h) { close(); html += "<h4>" + inline(h[1]) + "</h4>"; return; }
      const body = line.replace(/^[-*]\s+/, "");
      const m = body.match(LINK_RE);
      if (m) { ensure(); html += "<li>" + linkHtml(m[1], m[2]) + "</li>"; return; }
      if (/^-\s+/.test(line)) { ensure(); html += '<li class="sub">' + inline(body) + "</li>"; return; }
      if (/^\*\s+/.test(line)) { ensure(); html += "<li>" + inline(body) + "</li>"; return; }
      close();
      if (/^lisätään myöhemmin/i.test(line)) html += '<p class="muted">Lisätään myöhemmin.</p>';
      else if (/^\*[^*].*\*$/.test(line)) html += '<p class="intro">' + inline(line) + "</p>";
      else html += plainAsHeading ? "<h5>" + inline(line) + "</h5>" : "<p>" + inline(line) + "</p>";
    });
    close();
    return html;
  }

  // **lihava** ja *kursiivi* (teksti on jo escapattu)
  function fmt(s) {
    return esc(s)
      .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, "$1<em>$2</em>");
  }

  // Tekstin sisäiset linkit [a](b) ja muotoilut
  function inline(t) {
    let out = "", last = 0;
    const re = /\[([^\]]+)\]\(\s*([^)\s]+)\s*\)/g;
    let m;
    while ((m = re.exec(t))) {
      out += fmt(t.slice(last, m.index)) + linkHtml(m[1], m[2]);
      last = re.lastIndex;
    }
    return out + fmt(t.slice(last));
  }

  /* ---------- Kuukausiohjelma ---------- */
  function parseProgram(md) {
    const lines = md.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/);
    const months = {}, extras = [];
    let cur = null, curExtra = null, season = null, curPath = null;
    const monthRe = new RegExp("^##\\s+(" + MONTHS.join("|") + ")[\\s\\-–:]*(.*)$", "i");
    // "**Otsikko:** teksti" tai "* **Otsikko:** teksti"
    const field = (t, name) => t.match(new RegExp("^(?:[-*]\\s+)?\\*\\*\\s*" + name + "\\s*:?\\s*\\*\\*\\s*:?\\s*(.*)$", "i"));

    lines.forEach((line) => {
      const t = line.trim();
      if (/^-{3,}$/.test(t)) return;
      if (/^#\s+/.test(t)) {                       // pääotsikko, esim. "# … Kevätkausi (tammi–kesä)"
        const sm = t.match(/(kevätkausi|syyskausi).*$/i);
        if (sm) season = sm[0].trim();
        cur = null; curExtra = null; curPath = null; return;
      }
      if (/^(kevätkausi|syyskausi)/i.test(t)) { season = t; cur = null; curExtra = null; curPath = null; return; }
      const mm = t.match(monthRe);
      if (mm) {
        const idx = MONTHS.indexOf(mm[1].toLowerCase());
        cur = { idx, title: mm[2].trim(), season, desc: [], free: [], paid: [], goal: "", paths: [], meet: null, status: null, part: "desc" };
        months[idx] = cur; curExtra = null; curPath = null; return;
      }
      if (/^##\s+/.test(t) && !/^###/.test(t)) {
        cur = null; curPath = null; curExtra = { title: t.replace(/^##\s+/, ""), lines: [] }; extras.push(curExtra); return;
      }
      if (curExtra) { curExtra.lines.push(t); return; }
      if (!cur) return;
      let m;
      if ((m = t.match(/^tapaaminen\s*:\s*(.+)$/i))) { cur.meet = m[1]; return; }
      if ((m = t.match(/^tila\s*:\s*(.+)$/i))) { cur.status = norm(m[1]); return; }
      if ((m = field(t, "yhteinen tavoite"))) { cur.goal = m[1].trim(); cur.part = "goal"; curPath = null; return; }
      if ((m = t.match(/^(?:[-*]\s+)?\*\*\s*polku\s+([ab])\s*[:\-–]?\s*(.*?)\s*\*\*\s*(.*)$/i))) {
        const full = (m[2] + " " + m[3]).trim();
        const fm = full.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
        curPath = { key: m[1].toUpperCase(), name: fm ? fm[1] : full, focus: fm ? fm[2] : "", task: "", materials: [], sub: "task" };
        cur.paths.push(curPath); cur.part = "path"; return;
      }
      if (curPath) {
        if ((m = field(t, "tehtävä"))) { curPath.task = m[1].trim(); curPath.sub = "task"; return; }
        if ((m = field(t, "täsmämateriaalit"))) { curPath.sub = "mat"; if (m[1].trim()) curPath.materials.push(m[1].trim()); return; }
        if (!t) return;
        if (curPath.sub === "mat") curPath.materials.push(t);
        else curPath.task = (curPath.task + " " + t).trim();
        return;
      }
      if (cur.part === "goal") { if (t) cur.goal += " " + t; return; }
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
      if (mo.season) {
        const s = mo.idx < 6 ? seasons[0] : seasons[1];
        // "Kevätkausi (tammi–kesä)" säilyy, vanha pitkä muoto ilman sulkeita
        s.name = /:/.test(mo.season) ? mo.season.replace(/\s*\(.*\)\s*$/, "") : mo.season;
      }
    });
    const hasPaths = Object.values(data.months).some((mo) => mo.paths && mo.paths.length);
    const PATHS = { all: "Molemmat polut", A: "Polku A: Vasta-alkajat", B: "Polku B: Edistyneet" };
    const hashParts = decodeURIComponent(location.hash.replace(/^#kk-/, "")).split("&");
    const hashPath = (hashParts.find((p) => /^polku=/i.test(p)) || "").replace(/^polku=/i, "").toUpperCase();
    let pathSel = "all";
    try { const v = localStorage.getItem("ail-polku"); if (PATHS[v]) pathSel = v; } catch (e) { /* ei tallennusta */ }
    if (PATHS[hashPath]) pathSel = hashPath;
    let current = 0;

    let html = "";
    if (hasPaths) {
      html += '<div class="path-pick"><div class="path-switch" role="group" aria-label="Näytettävä oppimispolku">' +
        Object.keys(PATHS).map((k) => '<button type="button" data-path="' + k + '" aria-pressed="' + (k === pathSel) + '">' + esc(PATHS[k]) + "</button>").join("") +
        '</div><p class="note">Valitse oma polkusi. <b>A</b> sopii, jos tekoäly on vielä uutta, <b>B</b>, jos käytät Copilotia jo sujuvasti. Voit vaihtaa polkua minkä tahansa kuukauden kohdalla.</p></div>';
    }
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
      const p = e.target.closest(".path-switch button");
      if (p) {
        pathSel = p.dataset.path;
        el.querySelectorAll(".path-switch button").forEach((x) => x.setAttribute("aria-pressed", String(x === p)));
        try { localStorage.setItem("ail-polku", pathSel); } catch (err) { /* ei tallennusta */ }
        select(current, false);
        return;
      }
      const b = e.target.closest(".month");
      if (!b || b.disabled) return;
      select(+b.dataset.idx, true);
    });

    function pathsHtml(mo) {
      let shown = mo.paths.filter((p) => pathSel === "all" || p.key === pathSel);
      if (!shown.length) shown = mo.paths;
      const later = '<p class="muted">Lisätään myöhemmin.</p>';
      return '<div class="paths' + (shown.length === 1 ? " one" : "") + '">' + shown.map((p) =>
        '<article class="path-card ' + p.key.toLowerCase() + '">' +
        '<p class="path-key">Polku ' + esc(p.key) + "</p>" +
        "<h4>" + esc(p.name) + "</h4>" +
        (p.focus ? '<p class="path-focus">' + esc(p.focus) + "</p>" : "") +
        '<div class="mat"><h5>Tehtävä</h5>' + (p.task ? "<p>" + inline(p.task) + "</p>" : later) +
        "<h5>Täsmämateriaalit</h5>" + (renderLines(p.materials, false) || later) + "</div></article>").join("") + "</div>";
    }

    function select(idx, scroll) {
      current = idx;
      el.querySelectorAll(".month").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.idx === idx)));
      const mo = data.months[idx];
      const det = $("#month-detail");
      const meet = meetingText(idx, mo);
      let h = '<h3 style="text-transform:capitalize">' + esc(MONTHS[idx]) + " " + YEAR + "</h3>";
      h += '<p style="font-weight:700;font-size:1.1rem">' + esc(mo ? mo.title : "Ohjelma täydentyy") + "</p>";
      h += '<div class="meta">' + (meet ? "<span>Ryhmän tapaaminen: " + esc(meet) + " (max 1 h, Teams / livenä)</span>" : "") +
        (JORY_MONTHS[idx] ? "<span>" + esc(JORY_MONTHS[idx]) + "</span>" : "") + "</div>";
      if (mo && mo.paths.length) {
        h += mo.desc.map((d) => "<p>" + inline(d) + "</p>").join("");
        if (mo.goal) h += '<div class="goal"><h4>Yhteinen tavoite</h4><p>' + inline(mo.goal) + "</p></div>";
        h += pathsHtml(mo);
      } else if (mo) {
        h += mo.desc.map((d) => "<p>" + inline(d) + "</p>").join("");
        if (mo.goal) h += '<div class="goal"><h4>Yhteinen tavoite</h4><p>' + inline(mo.goal) + "</p></div>";
        h += '<div class="mat-cols"><div class="mat"><h4>Maksuttomat materiaalit</h4>' +
          (renderLines(mo.free, true) || '<p class="muted">Lisätään myöhemmin.</p>') + "</div>" +
          '<div class="mat"><h4>Maksulliset</h4>' + (renderLines(mo.paid, true) || '<p class="muted">Lisätään myöhemmin.</p>') + "</div></div>";
      } else {
        h += '<p class="muted">Kuukauden teema ja materiaalit lisätään myöhemmin.</p>';
      }
      det.innerHTML = h;
      if (scroll) det.scrollIntoView({ behavior: "smooth", block: "start" });
      if (scroll || /^#kk-/.test(location.hash)) {
        try { history.replaceState(null, "", "#kk-" + MONTHS[idx] + (pathSel !== "all" ? "&polku=" + pathSel.toLowerCase() : "")); } catch (e) { /* ei haittaa */ }
      }
    }

    const hash = hashParts[0];
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
      impactN: e ? e.impact : null, feasN: e ? e.feas : null, effortN: e ? e.effort : null,
      safetyN: e ? e.safety : null, riskN: e ? e.risk : null, ratio: e ? e.ratio : null,
      pscore: { vihrea: 100, keltainen: 60, punainen: 20 }[raw.privacy] || 50,
      updated: String(raw.updated || ""), planner: ""
    };
  }

  function importSnapshots(files) {
    const byMonth = {}, thrByMonth = {}, errors = [];
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
      if (params && !thrByMonth[month]) thrByMonth[month] = { impactThreshold: +params.impactThreshold || 50, effortThreshold: +params.effortThreshold || 50 };
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
      RM.snaps = RM.snaps.filter((x) => x.month !== month).concat([{ month, loaded, thr: thrByMonth[month] || null, cases: Object.values(byMonth[month]) }]);
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
    ["#f-area", "#f-status", "#f-type"].forEach((id) => { const el = $(id); if (el) el.addEventListener("change", drawFiltered); });
    const rank = $("#rm-rank");
    if (rank) rank.addEventListener("click", (e) => {
      const b = e.target.closest("[data-rsort]");
      if (!b) return;
      const k = b.dataset.rsort;
      if (RM.sortKey === k) RM.sortDir = -RM.sortDir;
      else { RM.sortKey = k; RM.sortDir = ["rank", "name", "effort", "risk", "status"].indexOf(k) >= 0 ? 1 : -1; }
      drawFiltered();
    });
    const help = $("#rm-quad-help"), dlg = $("#rm-quad-dlg");
    if (help && dlg) {
      help.addEventListener("click", () => {
        const body = window.AIArviointi && window.AIArviointi.quadInfoHtml ? window.AIArviointi.quadInfoHtml() : "";
        dlg.innerHTML = '<div class="aia-dlg-head"><h3 id="rm-quad-dlg-title">Nelikentän alueet</h3><button type="button" class="aia-dlg-x" data-close aria-label="Sulje">×</button></div>' +
          body + '<div class="aia-actions"><button type="button" class="aia-btn primary" data-close>Sulje</button></div>';
        if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
      });
      dlg.addEventListener("click", (e) => {
        if (e.target === dlg || e.target.closest("[data-close]")) { if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open"); }
      });
    }
    const ppt = $("#rm-pptx");
    if (ppt) ppt.addEventListener("click", exportTrackingPptx);
  }

  function renderTracking() {
    const snap = RM.snaps.find((x) => x.month === RM.month) || RM.snaps[RM.snaps.length - 1] || null;
    if (snap) RM.month = snap.month;
    const statusEl = $("#rm-status"), clear = $("#rm-clear"), monthly = $("#rm-monthly");
    if (statusEl) statusEl.innerHTML = snap
      ? "Näytetään tilanne <b>" + esc(monthLabel(snap.month)) + "</b> · " + snap.cases.length + " käyttötapausta · ladattu " + esc(fiDateTime(snap.loaded))
      : "Ei ladattuja tiedostoja. Alla näkyvät tiekarttaan kirjatut käyttötapaukset.";
    if (clear) clear.hidden = !RM.snaps.length;
    const ppt = $("#rm-pptx"); if (ppt) ppt.hidden = !RM.snaps.length;
    if (monthly) monthly.hidden = !RM.snaps.length;
    if (RM.snaps.length) renderMonthly();
    const cases = (snap ? snap.cases : []).concat(RM.mdCases)
      .slice().sort((a, b) => (b.prioN == null ? -1 : b.prioN) - (a.prioN == null ? -1 : a.prioN));
    renderCases(cases);
  }

  function monthlyRows() {
    let prevKeys = null;
    return RM.snaps.map((x) => {
      const keys = x.cases.map((c) => c.id || norm(c.name));
      const added = prevKeys ? keys.filter((k) => prevKeys.indexOf(k) < 0).length : null;
      prevKeys = keys;
      const pr = x.cases.filter((c) => c.prioN != null);
      return {
        month: x.month, total: x.cases.length, added,
        prod: x.cases.filter((c) => statusOf(c.status) && statusOf(c.status).label === "Tuotannossa").length,
        avg: pr.length ? Math.round(pr.reduce((a, c) => a + c.prioN, 0) / pr.length) : null,
        jory: x.cases.filter((c) => c.jory).length
      };
    });
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
      const rows = monthlyRows().map((r) =>
        "<tr" + (r.month === RM.month ? ' class="on"' : "") + "><td>" + esc(monthLabel(r.month)) + "</td><td>" + r.total + "</td><td>" + (r.added == null ? "–" : "+" + r.added) + "</td><td>" +
          r.prod + "</td><td>" + (r.avg == null ? "–" : r.avg) + "</td><td>" + r.jory + "</td></tr>").reverse().join("");
      table.innerHTML = '<table class="rm-table"><thead><tr><th scope="col">Kuukausi</th><th scope="col">Käyttötapauksia</th><th scope="col">Uusia</th>' +
        '<th scope="col">Tuotannossa</th><th scope="col">Keskim. prioriteetti</th><th scope="col">Jory-huomioita</th></tr></thead><tbody>' + rows + "</tbody></table>";
    }
  }

  const AREA_COLORS = ["#28336c", "#00adc5", "#fcb316", "#009651", "#e64925", "#8a8c94"];
  const curSnap = () => RM.snaps.find((x) => x.month === RM.month) || null;
  const curThr = () => { const sn = curSnap(); return (sn && sn.thr) || { impactThreshold: 50, effortThreshold: 50 }; };
  const hasScores = (c) => c.impactN != null && c.prioN != null;

  function renderCases(cases) {
    RM.cur = cases;
    const strip = $("#status-strip");
    if (strip) strip.innerHTML = STATUSES.map((st) => {
      const n = cases.filter((c) => statusOf(c.status) === st).length;
      return '<div style="--c:' + st.c + '"><b>' + n + "</b><span>" + esc(st.label) + "</span></div>";
    }).join("");
    const fill = (sel, vals) => {
      if (!sel) return;
      const keep = sel.value;
      sel.innerHTML = '<option value="">Kaikki</option>' + vals.map((v) => '<option value="' + esc(v) + '">' + esc(v) + "</option>").join("");
      if (vals.indexOf(keep) >= 0) sel.value = keep;
    };
    const uniq = (k) => [...new Set(cases.map((c) => c[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fi"));
    fill($("#f-area"), uniq("area")); fill($("#f-status"), uniq("status")); fill($("#f-type"), uniq("type"));
    drawFiltered();
  }

  function filteredCases() {
    const a = ($("#f-area") || {}).value, s = ($("#f-status") || {}).value, t = ($("#f-type") || {}).value;
    return RM.cur.filter((c) => (!a || c.area === a) && (!s || c.status === s) && (!t || c.type === t));
  }
  const rankedScored = (list) => list.filter(hasScores).slice().sort((a, b) => b.prioN - a.prioN || a.name.localeCompare(b.name, "fi"));

  function radarSeries(scored) {
    const avg = (arr, k) => arr.reduce((s, c) => s + (c[k] || 0), 0) / arr.length;
    const vals = (arr) => [
      { label: "Vaikutus", v: avg(arr, "impactN") }, { label: "Toteutettavuus", v: avg(arr, "feasN") },
      { label: "Riskien hallinta", v: avg(arr, "safetyN") }, { label: "Tietosuoja", v: avg(arr, "pscore") }];
    const series = [{ color: "#de232f", name: "Koko organisaatio (" + scored.length + ")", vals: vals(scored) }];
    const areas = [...new Set(scored.map((c) => c.area || "Muu"))].sort((a, b) => a.localeCompare(b, "fi"));
    if (areas.length > 1) areas.forEach((ar, i) => {
      const g = scored.filter((c) => (c.area || "Muu") === ar);
      series.push({ color: AREA_COLORS[i % AREA_COLORS.length], name: ar + " (" + g.length + ")", vals: vals(g) });
    });
    return series;
  }

  function drawFiltered() {
    const shown = filteredCases();
    const scored = rankedScored(shown);
    const missing = shown.length - scored.length;
    const A = window.AIArviointi;

    // tyypit
    const types = {};
    shown.forEach((c) => { const t = c.type || "Ei määritelty"; types[t] = (types[t] || 0) + 1; });
    const typeEl = $("#type-list"), tKeys = Object.keys(types).sort((a, b) => types[b] - types[a]);
    if (typeEl) typeEl.innerHTML = tKeys.length ? tKeys.map((t) => "<li><span>" + esc(t) + "</span><b>" + types[t] + "</b></li>").join("")
      : '<li class="muted">Ei käyttötapauksia</li>';

    // nelikenttä
    const quad = $("#rm-quad");
    if (quad) quad.innerHTML = A ? A.quadrantSvg(scored.map((c, i) => {
      const st = statusOf(c.status);
      return { x: c.effortN, y: c.impactN, n: i + 1, c: st ? st.c : "#8a8c94", tc: st && st.dark ? "#1d1d1f" : "#fff", title: (i + 1) + ". " + c.name + " – " + Math.round(c.prioN) + " p." };
    }), curThr(), "Nelikenttä: käyttötapaukset vaikutuksen ja työmäärän mukaan") : "";
    const note = $("#rm-quad-note");
    if (note) note.textContent = (scored.length ? "Numero = sijoitus prioriteettijärjestyksessä, väri = tila. " : "Lataa arviointityökalun JSON-tiedostot, niin käyttötapaukset näkyvät nelikentässä. ") +
      (missing > 0 ? missing + " käyttötapausta ilman arviointipisteitä ei näy nelikentässä, tutkakaaviossa eikä taulukossa (lataa niiden JSON-tiedosto uudelleen)." : "");

    // tutkakaavio
    const radar = $("#rm-radar");
    if (radar) {
      if (A && scored.length) {
        const ser = radarSeries(scored);
        radar.innerHTML = '<div class="aia-radarwrap"><div>' + A.radarSvg(ser) + '</div><ol class="aia-legend v">' +
          ser.map((x) => '<li><i style="background:' + x.color + '"></i><span>' + esc(x.name) + "</span></li>").join("") + "</ol></div>" +
          '<p class="note">Keskiarvot 0–100. Punainen = koko organisaatio, muut = palvelualueet.</p>';
      } else radar.innerHTML = '<p class="muted">Ei arviointipisteitä näytettäväksi.</p>';
    }

    // prioriteettijärjestys
    const rank = $("#rm-rank");
    if (rank) {
      if (!scored.length) rank.innerHTML = '<p class="muted">Ei arviointipisteitä näytettäväksi.</p>';
      else {
        const rows = scored.map((c, i) => ({ c, rank: i + 1 }));
        const key = RM.sortKey || "rank", dir = RM.sortDir || 1;
        const val = { rank: (r) => r.rank, name: (r) => r.c.name, prio: (r) => r.c.prioN, impact: (r) => r.c.impactN, effort: (r) => r.c.effortN, risk: (r) => r.c.riskN, status: (r) => r.c.status }[key] || ((r) => r.rank);
        rows.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "string" ? x.localeCompare(y, "fi") : x - y) * dir || a.rank - b.rank; });
        const cols = [["rank", "#"], ["name", "Käyttötapaus"], ["prio", "Kokonaispisteet"], ["impact", "Vaikutus"], ["effort", "Työmäärä"], ["risk", "Riski"], ["status", "Tila"]];
        const pbar = (v) => '<span class="aia-pbar"><i><b style="width:' + Math.round(v) + '%"></b></i><em>' + Math.round(v) + "</em></span>";
        rank.innerHTML = '<div class="rm-tablewrap"><table class="rm-rank-table"><thead><tr>' + cols.map((c) =>
          '<th scope="col" aria-sort="' + (key === c[0] ? (dir > 0 ? "ascending" : "descending") : "none") + '"><button type="button" data-rsort="' + c[0] + '">' + c[1] +
          (key === c[0] ? (dir > 0 ? " ↑" : " ↓") : "") + "</button></th>").join("") + "</tr></thead><tbody>" +
          rows.map((r) => {
            const st = statusOf(r.c.status);
            return "<tr><td>" + r.rank + "</td><td>" + esc(r.c.name) + '<small class="where">' + esc([r.c.area, r.c.unit].filter(Boolean).join(" · ")) + "</small></td>" +
              "<td>" + pbar(r.c.prioN) + "</td><td>" + Math.round(r.c.impactN) + "</td><td>" + Math.round(r.c.effortN) + "</td><td>" + Math.round(r.c.riskN) + "</td>" +
              '<td><i class="dot" style="background:' + (st ? st.c : "#ccc") + '"></i>' + esc(r.c.status || "–") + "</td></tr>";
          }).join("") + '</tbody></table></div><p class="note">Järjestä klikkaamalla otsikkoa.</p>';
      }
    }
    drawCards(shown);
  }

  function drawCards(shown) {
    const listEl = $("#uc-list");
    if (!listEl) return;
    if (!RM.cur.length) {
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

  /* ---------- Tiekartan seurannan PowerPoint ---------- */
  function loadScript(src) {
    return new Promise((res, rej) => {
      const el = document.createElement("script");
      el.src = src; el.async = true;
      el.onload = () => res(); el.onerror = () => rej(new Error("PowerPoint-kirjasto ei latautunut"));
      document.head.appendChild(el);
    });
  }

  async function exportTrackingPptx() {
    const msgEl = $("#rm-msg");
    const say = (t, cls) => { if (msgEl) { msgEl.textContent = t; msgEl.className = "rm-msg " + (cls || ""); } };
    const snap = curSnap();
    if (!snap) { say("Lataa ensin käyttötapaukset (JSON).", "error"); return; }
    say("Luodaan PowerPoint-esitystä…");
    try {
      const A = window.AIArviointi;
      if (!window.PptxGenJS) await loadScript((A && A.pptxUrl) || "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js");
      const F = "Century Gothic", hex = (c) => String(c).replace("#", "").toUpperCase();
      const shown = filteredCases(), scored = rankedScored(shown), thr = curThr();
      const filt = [["Palvelualue", ($("#f-area") || {}).value], ["Tila", ($("#f-status") || {}).value], ["Tyyppi", ($("#f-type") || {}).value]]
        .filter((x) => x[1]).map((x) => x[0] + ": " + x[1]).join(", ");
      const now = new Date(), today = now.getDate() + "." + (now.getMonth() + 1) + "." + now.getFullYear();
      const p = new window.PptxGenJS();
      p.layout = "LAYOUT_WIDE"; p.title = "AI-tiekartan seuranta"; p.company = "Kangasalan kaupunki";
      const header = (sl, t) => {
        sl.addText(t, { x: 0.5, y: 0.3, w: 12.3, h: 0.7, fontFace: F, fontSize: 24, bold: true, color: "DE232F" });
        sl.addText("Kangasalan kaupunki · AI-tiekartan seuranta · tilanne " + monthLabel(snap.month) + (filt ? " · " + filt : ""),
          { x: 0.5, y: 7.0, w: 12.3, h: 0.3, fontFace: F, fontSize: 9, color: "5B5D66" });
      };

      // 1 otsikko
      let sl = p.addSlide();
      sl.background = { color: "DE232F" };
      sl.addText("AI-tiekartan seuranta – tilanne " + monthLabel(snap.month), { x: 0.7, y: 2.2, w: 11.9, h: 1.2, fontFace: F, fontSize: 38, bold: true, color: "FFFFFF" });
      sl.addText("Kangasalan kaupunki · " + today + " · " + shown.length + " käyttötapausta" + (filt ? " · rajaus: " + filt : ""),
        { x: 0.7, y: 3.5, w: 11.9, h: 0.6, fontFace: F, fontSize: 18, color: "FFFFFF" });

      // 2 tilanne
      sl = p.addSlide(); header(sl, "Käyttötapausten tila");
      STATUSES.forEach((st, i) => {
        const n = shown.filter((c) => statusOf(c.status) === st).length, bx = 0.5 + i * 2.07;
        sl.addShape("rect", { x: bx, y: 1.15, w: 1.95, h: 1.0, fill: { color: "F6F5F3" }, line: { color: hex(st.c), width: 2 } });
        sl.addText([{ text: String(n), options: { fontSize: 26, bold: true, color: hex(st.c), breakLine: true } }, { text: st.label, options: { fontSize: 11, color: "1D1D1F" } }],
          { x: bx, y: 1.15, w: 1.95, h: 1.0, fontFace: F, align: "center", valign: "middle" });
      });
      if (RM.snaps.length) {
        const labels = RM.snaps.map((x) => monthLabel(x.month));
        sl.addChart(p.ChartType.bar, STATUSES.map((st) => ({ name: st.label, labels, values: RM.snaps.map((x) => x.cases.filter((c) => statusOf(c.status) === st).length) })), {
          x: 0.5, y: 2.4, w: 12.3, h: 4.5, barDir: "col", barGrouping: "stacked", chartColors: STATUSES.map((st) => hex(st.c)),
          showLegend: true, legendPos: "b", legendFontFace: F, legendFontSize: 11, catAxisLabelFontFace: F, valAxisLabelFontFace: F,
          showTitle: true, title: "Käyttötapaukset kuukausittain tiloittain", titleFontFace: F, titleFontSize: 13
        });
      }

      // 3 nelikenttä
      sl = p.addSlide(); header(sl, "Nelikenttä: vaikutus ja työmäärä");
      const qx = 1.0, qy = 1.2, size = 5.4;
      const lw = size * thr.effortThreshold / 100, th = size * (1 - thr.impactThreshold / 100);
      const quads = (A && A.QUADS) || [];
      [[qx, qy, lw, th], [qx + lw, qy, size - lw, th], [qx, qy + th, lw, size - th], [qx + lw, qy + th, size - lw, size - th]].forEach((r, i) => {
        const q = quads[i]; if (!q || r[2] <= 0.01 || r[3] <= 0.01) return;
        sl.addShape("rect", { x: r[0], y: r[1], w: r[2], h: r[3], fill: { color: hex(q.c), transparency: 80 }, line: { color: "FFFFFF", width: 1.5 } });
        sl.addText(q.label, { x: r[0] + 0.05, y: i < 2 ? r[1] + 0.05 : r[1] + r[3] - 0.55, w: Math.max(r[2] - 0.1, 0.4), h: 0.5, fontFace: F, fontSize: 9, bold: true,
          color: "1D1D1F", valign: i < 2 ? "top" : "bottom", align: i % 2 ? "right" : "left", margin: 2 });
      });
      sl.addText("Työmäärä →", { x: qx, y: qy + size + 0.03, w: size, h: 0.3, fontFace: F, fontSize: 10, color: "5B5D66", align: "center" });
      sl.addText("Vaikutus →", { x: qx - 0.25 - size / 2, y: qy + size / 2 - 0.15, w: size, h: 0.3, fontFace: F, fontSize: 10, color: "5B5D66", align: "center", rotate: 270 });
      scored.forEach((c, i) => {
        const st = statusOf(c.status), d = 0.32;
        const px = Math.min(Math.max(qx + size * c.effortN / 100, qx + d / 2), qx + size - d / 2), py = Math.min(Math.max(qy + size * (1 - c.impactN / 100), qy + d / 2), qy + size - d / 2);
        sl.addShape("ellipse", { x: px - d / 2, y: py - d / 2, w: d, h: d, fill: { color: hex(st ? st.c : "#8a8c94") }, line: { color: "FFFFFF", width: 1.5 } });
        sl.addText(String(i + 1), { x: px - d / 2, y: py - d / 2, w: d, h: d, fontFace: F, fontSize: 9, bold: true, color: st && st.dark ? "1D1D1F" : "FFFFFF", align: "center", valign: "middle", margin: 0 });
      });
      sl.addText(scored.slice(0, 15).map((c, i) => ({ text: (i + 1) + ". " + c.name + "  (" + Math.round(c.prioN) + ")", options: { breakLine: true } })),
        { x: 7.2, y: 1.2, w: 5.6, h: 5.4, fontFace: F, fontSize: 11, color: "1D1D1F", valign: "top", fit: "shrink" });

      // 4 prioriteettijärjestys
      sl = p.addSlide(); header(sl, "Prioriteettijärjestys");
      const hdr = ["#", "Käyttötapaus", "Palvelualue", "Kokonaispisteet", "Vaikutus", "Työmäärä", "Tila"].map((t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: "28336C" } } }));
      sl.addTable([hdr].concat(scored.slice(0, 15).map((c, i) => [String(i + 1), c.name, c.area, String(Math.round(c.prioN)), String(Math.round(c.impactN)), String(Math.round(c.effortN)), c.status]).map((r, i) =>
        r.map((v) => ({ text: v, options: { fill: { color: i % 2 ? "F6F5F3" : "FFFFFF" } } })))),
        { x: 0.5, y: 1.15, w: 12.3, colW: [0.5, 4.6, 2.3, 1.4, 1.1, 1.1, 1.3], fontFace: F, fontSize: 10, valign: "middle", border: { type: "solid", pt: 0.5, color: "E4E4E8" }, autoPage: false });
      if (scored.length > 15) sl.addText("+ " + (scored.length - 15) + " muuta", { x: 0.5, y: 6.65, w: 6, h: 0.3, fontFace: F, fontSize: 10, color: "5B5D66" });

      // 5 tutkakaavio
      sl = p.addSlide(); header(sl, "Tutkakaavio – kokonaisuus (keskiarvot 0–100)");
      if (scored.length) {
        const ser = radarSeries(scored);
        sl.addChart(p.ChartType.radar, ser.map((x) => ({ name: x.name, labels: x.vals.map((v) => v.label), values: x.vals.map((v) => Math.round(v.v)) })), {
          x: 0.8, y: 1.1, w: 11.7, h: 5.8, radarStyle: "standard", chartColors: ser.map((x) => hex(x.color)), lineSize: 2,
          valAxisMinVal: 0, valAxisMaxVal: 100, showLegend: true, legendPos: "r", legendFontFace: F, legendFontSize: 11, catAxisLabelFontFace: F, catAxisLabelFontSize: 12
        });
      }

      // 6 kuukausitaulukko
      sl = p.addSlide(); header(sl, "Kuukausittainen tilannekuva");
      const mh = ["Kuukausi", "Käyttötapauksia", "Uusia", "Tuotannossa", "Keskim. prioriteetti", "Jory-huomioita"].map((t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: "28336C" } } }));
      sl.addTable([mh].concat(monthlyRows().reverse().map((r) => [monthLabel(r.month), String(r.total), r.added == null ? "–" : "+" + r.added, String(r.prod), r.avg == null ? "–" : String(r.avg), String(r.jory)])),
        { x: 0.5, y: 1.15, w: 12.3, fontFace: F, fontSize: 12, valign: "middle", border: { type: "solid", pt: 0.5, color: "E4E4E8" }, autoPage: false });

      // 7 nelikentän selitteet
      sl = p.addSlide(); header(sl, "Nelikentän alueet");
      const runs = [];
      ((A && A.QUAD_INFO) || []).forEach((q) => {
        runs.push({ text: q.label, options: { bold: true, color: hex(q.c), breakLine: true } });
        runs.push({ text: q.text, options: { breakLine: true } });
        runs.push({ text: " ", options: { fontSize: 6, breakLine: true } });
      });
      runs.push({ text: "Lähde: OpenAI – Tekoälyn käyttötapausten tunnistaminen ja skaalaaminen", options: { color: "B81A24", hyperlink: { url: (A && A.SOURCE) || "https://openai.com/fi-FI/business/learn/identifying-and-scaling-ai-use-cases/" } } });
      sl.addText(runs, { x: 0.5, y: 1.15, w: 12.3, h: 5.6, fontFace: F, fontSize: 14, color: "1D1D1F", valign: "top" });

      await p.writeFile({ fileName: "ai-tiekartan-seuranta-" + snap.month + ".pptx" });
      say("PowerPoint ladattu.", "ok");
    } catch (err) { say("PowerPointin luonti epäonnistui: " + err.message, "error"); console.error(err); }
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
