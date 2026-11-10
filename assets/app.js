/* AI-lähettiläät – sisältö luetaan content/-kansion tiedostoista. */
(function () {
  "use strict";

  const YEAR = 2027;
  const MONTHS = ["tammikuu", "helmikuu", "maaliskuu", "huhtikuu", "toukokuu", "kesäkuu",
    "heinäkuu", "elokuu", "syyskuu", "lokakuu", "marraskuu", "joulukuu"];
  const BREAK_MONTHS = { 6: "Kesätauko" };          // heinäkuu
  const JORY_MONTHS = { 5: "Jory: puolivuosikatsaus", 11: "Jory: vuosikatsaus" };

  // Kolme tilaa (huomiot.md). keys = hyväksytyt kirjoitusasut.
  const STATUSES = [
    { label: "Ideat / Arvioinnissa", c: "#fcb316", dark: true,
      keys: ["ideat", "idea", "arvioinnissa", "uusi idea"] },
    { label: "Työn alla", c: "#e64925",
      keys: ["työn alla", "testauksessa"] },
    { label: "Tuotannossa", c: "#009651",
      keys: ["tuotannossa"] }
  ];
  const IMPACT = [
    { key: "korkea roi", label: "Korkea ROI (€)", c: "#009651", pos: "1/2" },
    { key: "suuri vaikutus", label: "Suuri vaikutus / työläs", c: "#00adc5", pos: "1/3" },
    { key: "itsepalvelu", label: "Itsepalvelu", c: "#fcb316", pos: "2/2" },
    { key: "työläs", label: "Työläs / pieni merkitys", c: "#e64925", pos: "2/3" }
  ];
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
    const monthRe = new RegExp("^##\\s+(" + MONTHS.join("|") + ")\\s*[-–:]?\\s*(.*)$", "i");

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
          impact: f["vaikuttavuus"] || "", planner: f["planner"] || "", desc: f["kuvaus"] || ""
        });
      });
    }
    return { intro, cases };
  }

  const statusOf = (s) => STATUSES.find((x) => x.keys.some((k) => norm(s).startsWith(k)));
  const impactOf = (s) => IMPACT.find((x) => norm(s).replace(/\s+/g, " ").startsWith(x.key));

  function renderRoadmap(rm) {
    const introEl = $("#roadmap-intro");
    if (introEl) {
      const lines = rm.intro.split(/\r?\n/).map((l) => l.trim());
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

    const cases = rm.cases;
    // tilat
    const strip = $("#status-strip");
    strip.innerHTML = STATUSES.map((s) => {
      const n = cases.filter((c) => statusOf(c.status) === s).length;
      return '<div style="--c:' + s.c + '"><b>' + n + "</b><span>" + esc(s.label) + "</span></div>";
    }).join("");

    // tyypit
    const types = {};
    cases.forEach((c) => { const t = c.type || "Ei määritelty"; types[t] = (types[t] || 0) + 1; });
    const typeEl = $("#type-list");
    const tKeys = Object.keys(types).sort((a, b) => types[b] - types[a]);
    typeEl.innerHTML = tKeys.length
      ? tKeys.map((t) => "<li><span>" + esc(t) + "</span><b>" + types[t] + "</b></li>").join("")
      : '<li class="muted">Ei vielä käyttötapauksia</li>';

    // matriisi
    const mx = $("#matrix");
    let mh = '<div class="ax-y">Vaikutus →</div>';
    IMPACT.forEach((im) => {
      const [r, c] = im.pos.split("/");
      const n = cases.filter((x) => impactOf(x.impact) === im).length;
      mh += '<div class="cell" style="grid-row:' + r + ";grid-column:" + c + ";background:" + im.c + (im.key === "itsepalvelu" ? ";color:#1d1d1f" : "") + '"><b>' + n + "</b><span>" + esc(im.label) + "</span></div>";
    });
    mh += '<div class="ax-x">Työmäärä →</div>';
    mx.innerHTML = mh;

    // suodattimet
    const fArea = $("#f-area"), fStatus = $("#f-status"), fType = $("#f-type");
    const fill = (sel, vals) => {
      sel.innerHTML = '<option value="">Kaikki</option>' +
        vals.map((v) => '<option value="' + esc(v) + '">' + esc(v) + "</option>").join("");
    };
    const uniq = (k) => [...new Set(cases.map((c) => c[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fi"));
    fill(fArea, uniq("area")); fill(fStatus, uniq("status")); fill(fType, uniq("type"));

    const listEl = $("#uc-list");
    function draw() {
      const a = fArea.value, s = fStatus.value, t = fType.value;
      const shown = cases.filter((c) => (!a || c.area === a) && (!s || c.status === s) && (!t || c.type === t));
      if (!cases.length) {
        listEl.innerHTML = '<div class="empty" style="grid-column:1/-1">Käyttötapaukset lisätään, kun tiekartta valmistuu (marras–joulukuu 2026).</div>';
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
          (c.type ? '<span class="chip">' + esc(c.type) + "</span>" : "") +
          (c.impact ? '<span class="chip" style="border:1px solid ' + (im ? im.c : "#ccc") + '">' + esc(c.impact) + "</span>" : "") +
          "</div>" +
          (c.desc ? "<p style=\"font-size:.92rem;margin:0 0 6px\">" + inline(c.desc) + "</p>" : "") +
          (/^https?:\/\//i.test(c.planner) ? linkHtml("Avaa Plannerissa", c.planner) : "") +
          "</article>";
      }).join("");
    }
    [fArea, fStatus, fType].forEach((s) => s.addEventListener("change", draw));
    draw();
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
        el.innerHTML = "<h1>Hankkeiden arviointityökalu</h1><p class=\"lead\">Työkalun kuvaus lisätään myöhemmin.</p>" +
          '<p class="muted">Kuvaus päivittyy tälle sivulle automaattisesti, kun tiedostoon <code>content/tyokalu.md</code> lisätään sisältö.</p>';
        return;
      }
      el.innerHTML = window.marked ? marked.parse(md) : "<pre>" + esc(md) + "</pre>";
      el.querySelectorAll("a[href^='http']").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
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
  window.__AIL = { parseProgram, parseRoadmap, secondThursday };
  document.addEventListener("DOMContentLoaded", init);
})();
