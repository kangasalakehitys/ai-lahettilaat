/*! AI-käyttötapausten arviointityökalu – itsenäinen komponentti.
 *
 *  Käyttö millä tahansa sivulla:
 *    <link rel="stylesheet" href="ai-arviointi.css">
 *    <div id="ai-arviointi"></div>
 *    <script src="ai-arviointi.js"></script>
 *    <script>AIArviointi.mount(document.getElementById("ai-arviointi"), { storageKey: "oma-sivu" });</script>
 *
 *  Asetukset (kaikki valinnaisia): storageKey, centers, statuses, types, typeInfo, hidden, params,
 *  pptxUrl, font, org, title. hidden: ["status", "jory", "roadmapBlock"] piilottaa Tila- ja Jory-kentät
 *  sekä "Kopioi tiekarttalohkona" -painikkeen.
 *  Tiedot tallentuvat vain käyttäjän selaimeen. Jakaminen tapahtuu vientitiedostoilla (PDF, PPTX, CSV, JSON).
 */
(function (global) {
  "use strict";

  const VERSION = 1;
  const PARAM_TYPE = "ai-arviointi-parametrit";
  const DATA_TYPE = "ai-arviointi-arvioinnit";
  const MAX_CRITERIA = 15;
  const MAX_SEL = 4;
  const OTHER = "__muu__";
  const CENTER_LBL = "Palvelukeskus/Osasto";
  const SEL_COLORS = ["#de232f", "#28336c", "#00adc5", "#fcb316"];

  const DEFAULT_CENTERS = {
    "Strateginen johto": ["Hallintopalvelut", "Talous- ja tietohallintopalvelut", "Konserni- ja tukipalvelut", "Kehittämispalvelut", "Henkilöstöpalvelut"],
    "Sivistyskeskus": ["Varhaiskasvatus- ja esiopetuspalvelut", "Opetus- ja koulutuspalvelut", "Hyvinvointi- ja vapaa-aikapalvelut"],
    "Tekninen keskus": ["Maankäyttö", "Rakentaminen", "Ympäristö- ja rakennusvalvonta", "Ateria- ja siivouspalvelut"],
    "Kaupunki (yhteinen)": []
  };
  const DEFAULT_STATUSES = [
    { label: "Ideat", c: "#00adc5" },
    { label: "Arvioinnissa", c: "#fcb316", dark: true },
    { label: "Työn alla", c: "#e64925" },
    { label: "Testauksessa", c: "#28336c" },
    { label: "Tuotannossa", c: "#009651" },
    { label: "Hylätty / Odottaa", c: "#8a8c94" }
  ];
  const DEFAULT_TYPES = ["Sisällöntuotanto", "Tutkimus", "Koodaus", "Data-analyysi", "Ideointi ja strategia", "Automaatiot"];
  // Tyyppien kuvaukset (OpenAI: Identifying and scaling AI use cases – kuusi käyttötapaustyyppiä).
  const DEFAULT_TYPE_INFO = {
    "Sisällöntuotanto": { desc: "Tekstin, kuvien tai muun sisällön luonnostelu, muokkaus ja tiivistäminen.",
      ex: ["Tiedotteiden ja some-päivitysten luonnokset", "Päätösesitysten ja vastauskirjeiden ensimmäiset versiot", "Selkokielistäminen ja käännökset"] },
    "Tutkimus": { desc: "Tiedon haku, yhdistely ja tiivistäminen useista lähteistä.",
      ex: ["Lainsäädännön ja ohjeiden selvittäminen", "Muiden kuntien käytäntöjen vertailu", "Pitkien raporttien ja lausuntojen tiivistäminen"] },
    "Koodaus": { desc: "Koodin, kaavojen ja skriptien kirjoittaminen, korjaaminen ja selittäminen.",
      ex: ["Excel-kaavat ja makrot", "Power Automate- ja Power BI -toteutusten apu", "Pienet raportointi- ja tiedonsiirtoskriptit"] },
    "Data-analyysi": { desc: "Datan käsittely, analysointi ja havainnollistaminen päätöksenteon tueksi.",
      ex: ["Asiakaspalautteiden luokittelu ja teemat", "Kysynnän ennusteet (esim. ateriamäärät, tilojen käyttö)", "Tilastojen ja mittareiden tulkinta raportteihin"] },
    "Ideointi ja strategia": { desc: "Vaihtoehtojen ideointi, suunnittelun tuki ja oman ajattelun haastaminen.",
      ex: ["Työpajojen ja kehittämisideoiden ideointi", "Palvelukonseptien ja toimintamallien vaihtoehdot", "Riskien ja vaikutusten ennakkoarviointi"] },
    "Automaatiot": { desc: "Toistuvien työvaiheiden ja työnkulkujen automatisointi tekoälyn avulla.",
      ex: ["Lomakkeiden ja hakemusten esikäsittely ja ohjaus", "Palautteiden ja sähköpostien ohjaus oikealle käsittelijälle", "Rutiini-ilmoitukset ja muistutukset"] }
  };
  const TYPE_SOURCE = "https://openai.com/fi-FI/business/learn/identifying-and-scaling-ai-use-cases/";
  const PRIVACY = [
    { key: "vihrea", label: "Vihreä", desc: "julkinen tai sisäinen perustieto", c: "#009651", score: 100 },
    { key: "keltainen", label: "Keltainen", desc: "vaatii tarkastelun", c: "#fcb316", score: 60, dark: true },
    { key: "punainen", label: "Punainen", desc: "henkilötietoja tai salassa pidettävää", c: "#de232f", score: 20 }
  ];
  const GROUPS = {
    hyoty: { label: "Hyödyt toiminnassa", axis: "Vaikutus" },
    toteutus: { label: "Toteutettavuus ja kustannukset", axis: "Toteutettavuus (pieni työmäärä)" },
    riski: { label: "Riskit ja vastuullisuus", axis: "Riskien hallinta" }
  };
  // Nelikenttä: y = vaikutus, x = työmäärä. Järjestys: ylä-vasen, ylä-oikea, ala-vasen, ala-oikea.
  const QUADS = [
    { key: "roi", label: "Korkea ROI (€)", lines: ["Korkea ROI (€)"], c: "#009651",
      rec: "Nopea kokeilu: suuri vaikutus pienellä työllä. Etene pilottiin." },
    { key: "iso", label: "Suuri vaikutus / suuri työmäärä", lines: ["Suuri vaikutus /", "suuri työmäärä"], c: "#00adc5",
      rec: "Strateginen hanke: vaatii suunnittelun, resursoinnin ja vaiheistuksen." },
    { key: "itse", label: "Itsepalvelu", lines: ["Itsepalvelu"], c: "#fcb316",
      rec: "Itsepalvelu: kokeile valmiilla työkaluilla (esim. Copilot) omassa yksikössä." },
    { key: "heikko", label: "Suuri työmäärä / pieni merkitys", lines: ["Suuri työmäärä /", "pieni merkitys"], c: "#e64925",
      rec: "Ei nyt: kirjaa idea ja palaa siihen, kun tilanne muuttuu." }
  ];

  // Arviointikriteerit (14 kpl). Jokainen liukusäädin 1–5, jossa 5 on aina toiminnan kannalta paras.
  const BASE_PARAMS = {
    type: PARAM_TYPE, version: VERSION, name: "Oletusparametrit",
    criteria: [
      { id: "strateginen", group: "hyoty", name: "Strateginen merkitys", lo: "vähäinen", hi: "keskeinen",
        help: "Miten idea edistää kaupungin tai palvelukeskuksen tavoitteita? Kuinka tärkeään kehittämistarpeeseen se vastaa?" },
      { id: "ajansaasto", group: "hyoty", name: "Ajansäästö ja sujuvampi prosessi", lo: "vähän", hi: "paljon",
        help: "Kuinka paljon työaikaa säästyy, manuaalinen työ vähenee tai käsittelyaika lyhenee?" },
      { id: "laatu", group: "hyoty", name: "Palvelun laatu ja kuntalaiskokemus", lo: "ei muutosta", hi: "selvä kehitys",
        help: "Paraneeko palvelun nopeus, tarkkuus tai tasalaatuisuus? Vähenevätkö virheet?" },
      { id: "tyontekija", group: "hyoty", name: "Työntekijäkokemus", lo: "ei muutosta", hi: "selvä kehitys",
        help: "Poistaako ratkaisu rutiineja ja vapauttaa aikaa vaativampaan tai merkityksellisempään työhön?" },
      { id: "laajuus", group: "hyoty", name: "Käyttötarpeen laajuus", lo: "harva / harvoin", hi: "moni / päivittäin",
        help: "Kuinka monen työntekijän tai kuntalaisen arkeen idea vaikuttaa ja kuinka usein tehtävä toistuu?" },
      { id: "skaalattavuus", group: "hyoty", name: "Skaalattavuus", lo: "yksi käyttö", hi: "laajasti",
        help: "Voiko ratkaisua tai toimintatapaa hyödyntää muissa yksiköissä, palvelukeskuksissa tai tehtävissä?" },
      { id: "kiireellisyys", group: "hyoty", name: "Kiireellisyys", lo: "voi odottaa", hi: "kiireellinen",
        help: "Kuinka tärkeää ongelmaan on tarttua nyt? Mitä seuraa, jos kehittäminen siirtyy?" },
      { id: "uudistuminen", group: "hyoty", name: "Uudistumispotentiaali", lo: "nopeuttaa nykyistä", hi: "uusi toimintatapa",
        help: "Mahdollistaako tekoäly kokonaan uuden tai olennaisesti paremman toimintatavan?" },
      { id: "data", group: "toteutus", name: "Datan saatavuus ja laatu", lo: "puuttuu / heikko", hi: "valmiina",
        help: "Onko tarvittava tieto valmiina, hyvälaatuista ja laillisesti käytettävissä?" },
      { id: "kustannukset", group: "toteutus", name: "Kehitys- ja ylläpitokustannukset", lo: "suuret", hi: "pienet",
        help: "Lisenssit, kehitystyö, rajapintakutsut ja jatkuva ylläpito." },
      { id: "integraatiot", group: "toteutus", name: "Integraatiot", lo: "vaikea", hi: "helppo",
        help: "Kuinka helposti ratkaisu liittyy nykyisiin järjestelmiin ja päivittäisiin työkaluihin (esim. Microsoft 365)?" },
      { id: "valmius", group: "toteutus", name: "Valmius edetä", lo: "ei vielä", hi: "valmis aloittamaan",
        help: "Onko tarve selkeä, onko tekijöitä ja voiko kokeilun aloittaa pienesti?" },
      { id: "luotettavuus", group: "riski", name: "Luotettavuus ja virheiden seuraukset", lo: "vakavat seuraukset", hi: "vähäiset / helppo tarkistaa",
        help: "Kuinka vakavia seurauksia tekoälyn virheellä (esim. keksityllä tiedolla) olisi? Voiko ihminen tarkistaa tuloksen?" },
      { id: "kayttoonotto", group: "riski", name: "Käyttöönottovalmius", lo: "muutosvastarintaa", hi: "odotetaan",
        help: "Ovatko käyttäjät valmiita ottamaan ratkaisun käyttöön, vai jääkö se käyttämättä?" }
    ].map((c) => Object.assign({ weight: 1 }, c)),
    starMultiplier: 2,
    maxStars: 3,
    impactThreshold: 50,
    effortThreshold: 50,
    balance: 60,
    riskWeight: 20,
    privacyPenalty: { vihrea: 0, keltainen: 10, punainen: 25 },
    hourValue: 45
  };

  /* ---------- Apufunktiot ---------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").trim().toLowerCase();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r0 = (v) => Math.round(v);
  const str = (v, d) => (typeof v === "string" ? v.slice(0, 400) : d);
  const num = (v, a, b, d) => { const n = Number(v); return v == null || v === "" || !isFinite(n) ? d : clamp(n, a, b); };
  const uid = () => "uc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  const pad = (n) => (n < 10 ? "0" : "") + n;
  const isoDay = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const fiDate = (d) => d.getDate() + "." + (d.getMonth() + 1) + "." + d.getFullYear();
  const fiTime = (d) => d.getHours() + "." + pad(d.getMinutes());
  const fiNum = (v, dec) => Number(v).toLocaleString("fi-FI", { maximumFractionDigits: dec || 0 });
  const slug = (s) => norm(s).replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "arviointi";
  const privacyOf = (k) => PRIVACY.find((p) => p.key === k);
  const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
  let mounts = 0;

  /* ---------- Parametrien tarkistus ---------- */
  function normalizeParams(p, base) {
    if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error("Tiedosto ei ole parametritiedosto.");
    if (p.type && p.type !== PARAM_TYPE) throw new Error("Tiedoston tyyppi on \"" + p.type + "\", odotettiin \"" + PARAM_TYPE + "\".");
    const out = clone(base);
    out.type = PARAM_TYPE; out.version = VERSION;
    if (typeof p.name === "string" && p.name.trim()) out.name = p.name.trim().slice(0, 80);
    if (p.criteria !== undefined) {
      if (!Array.isArray(p.criteria) || !p.criteria.length) throw new Error("Kriteerilistan (criteria) pitää sisältää vähintään yksi kriteeri.");
      if (p.criteria.length > MAX_CRITERIA) throw new Error("Kriteerejä voi olla enintään " + MAX_CRITERIA + ".");
      const seen = {};
      out.criteria = p.criteria.map((c, i) => {
        if (!c || typeof c !== "object") throw new Error("Kriteeri " + (i + 1) + " on virheellinen.");
        const id = String(c.id || "").trim();
        if (!id) throw new Error("Kriteeriltä " + (i + 1) + " puuttuu tunniste (id).");
        if (seen[id]) throw new Error("Kriteerin tunniste \"" + id + "\" on kahdesti.");
        seen[id] = 1;
        if (!GROUPS[c.group]) throw new Error("Kriteerin \"" + id + "\" ryhmän (group) pitää olla hyoty, toteutus tai riski.");
        const def = base.criteria.find((x) => x.id === id) || BASE_PARAMS.criteria.find((x) => x.id === id) || {};
        return {
          id, group: c.group,
          name: str(c.name, def.name || id), help: str(c.help, def.help || ""),
          lo: str(c.lo, def.lo || ""), hi: str(c.hi, def.hi || ""),
          weight: num(c.weight, 0, 3, def.weight == null ? 1 : def.weight)
        };
      });
      ["hyoty", "toteutus"].forEach((g) => {
        if (!out.criteria.some((c) => c.group === g)) throw new Error("Ryhmässä \"" + GROUPS[g].label + "\" pitää olla vähintään yksi kriteeri.");
      });
    }
    out.starMultiplier = num(p.starMultiplier, 1, 5, out.starMultiplier);
    out.maxStars = Math.round(num(p.maxStars, 0, 5, out.maxStars));
    out.impactThreshold = num(p.impactThreshold, 10, 90, out.impactThreshold);
    out.effortThreshold = num(p.effortThreshold, 10, 90, out.effortThreshold);
    out.balance = num(p.balance, 0, 100, out.balance);
    out.riskWeight = num(p.riskWeight, 0, 50, out.riskWeight);
    out.hourValue = num(p.hourValue, 0, 1000, out.hourValue);
    if (p.privacyPenalty && typeof p.privacyPenalty === "object") {
      PRIVACY.forEach((pr) => { out.privacyPenalty[pr.key] = num(p.privacyPenalty[pr.key], 0, 100, out.privacyPenalty[pr.key]); });
    }
    return out;
  }

  function fixCase(c) {
    const o = c && typeof c === "object" ? c : {};
    const scores = {};
    if (o.scores && typeof o.scores === "object") {
      Object.keys(o.scores).forEach((k) => { const v = Number(o.scores[k]); if (isFinite(v)) scores[k] = clamp(Math.round(v), 1, 5); });
    }
    const s = (v) => (v == null ? "" : String(v));
    return {
      id: s(o.id) || uid(), name: s(o.name), center: s(o.center), unit: s(o.unit), owner: s(o.owner), type: s(o.type),
      problem: s(o.problem), aiHelp: s(o.aiHelp), status: s(o.status), privacy: privacyOf(o.privacy) ? o.privacy : "",
      jory: !!o.jory, scores, stars: Array.isArray(o.stars) ? o.stars.map(String) : [],
      hours: o.hours === "" || o.hours == null ? "" : num(o.hours, 0, 1e6, ""),
      cost: o.cost === "" || o.cost == null ? "" : num(o.cost, 0, 1e9, ""),
      created: s(o.created) || new Date().toISOString(), updated: s(o.updated) || new Date().toISOString()
    };
  }

  /* ---------- Laskenta ---------- */
  function groupScore(c, P, g) {
    let sw = 0, s = 0;
    P.criteria.forEach((cr) => {
      if (cr.group !== g) return;
      const v = c.scores[cr.id];
      if (v == null) return;
      const w = cr.weight * (c.stars.indexOf(cr.id) >= 0 ? P.starMultiplier : 1);
      if (!w) return;
      sw += w; s += w * (clamp(v, 1, 5) - 1) / 4;
    });
    return sw ? s / sw * 100 : null;
  }

  function evaluate(c, P) {
    const v = groupScore(c, P, "hyoty"), t = groupScore(c, P, "toteutus"), rs = groupScore(c, P, "riski");
    const impact = v == null ? 0 : v, feas = t == null ? 0 : t, safety = rs == null ? 100 : rs;
    const effort = 100 - feas, risk = 100 - safety, b = P.balance / 100;
    const penalty = P.privacyPenalty[c.privacy] || 0;
    const prio = clamp(b * impact + (1 - b) * feas - P.riskWeight * risk / 100 - penalty, 0, 100);
    const hi = impact >= P.impactThreshold, easy = effort < P.effortThreshold;
    const quad = QUADS[hi ? (easy ? 0 : 1) : (easy ? 2 : 3)];
    const benefit = (Number(c.hours) || 0) * 12 * P.hourValue, cost = Number(c.cost) || 0;
    const ratio = benefit > 0 && cost > 0 ? benefit / cost : null;
    const r = { impact, feas, effort, safety, risk, prio, quad, benefit, cost, ratio };
    r.recs = recommend(c, r);
    return r;
  }

  function recommend(c, r) {
    const out = [r.quad.rec];
    if (c.privacy === "punainen") out.push("Punainen tietosuojataso: tee tietosuoja- ja AI Act -arviointi ennen etenemistä ja harkitse jory-käsittelyä.");
    else if (c.privacy === "keltainen") out.push("Keltainen tietosuojataso: käy ratkaisu läpi tietosuojan ja tietoturvan asiantuntijan kanssa.");
    else if (!c.privacy) out.push("Valitse vielä tietosuoja- ja riskitaso.");
    if (r.risk >= 50) out.push("Virheiden seuraukset tai käyttöönoton haasteet ovat merkittäviä: suunnittele ihmisen tekemä tarkistus ja muutoksen tuki.");
    if (r.ratio != null) {
      out.push(r.ratio >= 1
        ? "Säästetyn työajan arvo on noin " + fiNum(r.ratio, 1) + "-kertainen kustannuksiin nähden."
        : "Säästetyn työajan arvo jää alle kustannusten (" + fiNum(r.ratio, 1) + "×). Perustele hyöty muulla tavoin.");
    }
    return out;
  }

  function ranked(P, list) {
    return list.map((c) => ({ c, e: evaluate(c, P) }))
      .sort((a, b) => b.e.prio - a.e.prio || a.c.name.localeCompare(b.c.name, "fi"));
  }

  /* ---------- SVG-kuviot ---------- */
  function quadrantSvg(points, P, label) {
    const S = 300, M = 30, W = S + M + 10, H = S + M + 6;
    const tx = M + S * P.effortThreshold / 100, ty = 6 + S * (1 - P.impactThreshold / 100);
    const top = 6, bot = 6 + S, right = M + S;
    const rects = [[M, top, tx - M, ty - top], [tx, top, right - tx, ty - top], [M, ty, tx - M, bot - ty], [tx, ty, right - tx, bot - ty]];
    let h = '<svg class="aia-quad" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(label || "Nelikenttä: vaikutus ja työmäärä") + '">';
    rects.forEach((r, i) => {
      const q = QUADS[i];
      h += '<rect x="' + r[0] + '" y="' + r[1] + '" width="' + Math.max(r[2], 0) + '" height="' + Math.max(r[3], 0) + '" fill="' + q.c + '" fill-opacity=".16" stroke="#fff" stroke-width="2"/>';
      const left = i % 2 === 0, upper = i < 2;
      const x = left ? r[0] + 8 : r[0] + r[2] - 8;
      q.lines.forEach((ln, k) => {
        const y = upper ? r[1] + 16 + k * 13 : r[1] + r[3] - 8 - (q.lines.length - 1 - k) * 13;
        h += '<text x="' + x + '" y="' + y + '" font-size="11" font-weight="700" fill="#1d1d1f" text-anchor="' + (left ? "start" : "end") + '">' + esc(ln) + "</text>";
      });
    });
    h += '<text x="' + (M + S / 2) + '" y="' + (H - 2) + '" font-size="11" fill="#5b5d66" text-anchor="middle">Työmäärä →</text>';
    h += '<text transform="translate(14 ' + (top + S / 2) + ') rotate(-90)" font-size="11" fill="#5b5d66" text-anchor="middle">Vaikutus →</text>';
    const seen = {};
    points.forEach((p) => {
      let x = M + S * clamp(p.x, 0, 100) / 100, y = top + S * (1 - clamp(p.y, 0, 100) / 100);
      const key = Math.round(x / 10) + ":" + Math.round(y / 10);
      const k = seen[key] = (seen[key] || 0) + 1;
      if (k > 1) { const a = k * 2.1; x += Math.cos(a) * 9 * Math.sqrt(k); y += Math.sin(a) * 9 * Math.sqrt(k); }
      x = clamp(x, M + 10, right - 10); y = clamp(y, top + 10, bot - 10);
      const r = p.n === "" || p.n == null ? 9 : 11;
      h += '<g><title>' + esc(p.title || "") + "</title>" +
        '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '" fill="' + esc(p.c) + '" stroke="#fff" stroke-width="2"/>' +
        (p.n === "" || p.n == null ? "" : '<text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" font-size="11" font-weight="700" fill="' + (p.tc || "#fff") + '" text-anchor="middle">' + esc(p.n) + "</text>") + "</g>";
    });
    return h + "</svg>";
  }

  // radarSvg(vals) yhdelle sarjalle tai radarSvg([{ color, name, vals }, ...]) usealle päällekkäin.
  function radarSvg(arg) {
    const multi = Array.isArray(arg) && arg.length && arg[0] && Array.isArray(arg[0].vals);
    const series = multi ? arg : [{ color: "#de232f", vals: arg }];
    const axes = series[0].vals, n = axes.length;
    const cx = 160, cy = 118, R = 72;
    const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    const aria = multi ? "Tutkakaavio: " + series.map((s) => s.name).join(", ") : "Tutkakaavio: " + axes.map((v) => v.label + " " + r0(v.v)).join(", ");
    let h = '<svg class="aia-radar" viewBox="-24 0 372 236" role="img" aria-label="' + esc(aria) + '">';
    [25, 50, 75, 100].forEach((lv) => {
      h += '<polygon points="' + axes.map((_, i) => pt(i, R * lv / 100).join(",")).join(" ") + '" fill="none" stroke="#e4e4e8"/>';
    });
    axes.forEach((_, i) => { const p = pt(i, R); h += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] + '" stroke="#e4e4e8"/>'; });
    series.forEach((s) => {
      h += '<polygon points="' + s.vals.map((v, i) => pt(i, R * clamp(v.v, 0, 100) / 100).map((z) => z.toFixed(1)).join(",")).join(" ") +
        '" fill="' + s.color + '" fill-opacity="' + (multi ? ".1" : ".22") + '" stroke="' + s.color + '" stroke-width="' + (multi ? "2.5" : "2") + '"><title>' + esc(s.name || "") + "</title></polygon>";
    });
    axes.forEach((v, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / n, cos = Math.cos(a), sin = Math.sin(a);
      const p = pt(i, R + 12);
      const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
      const y = p[1] + (sin > 0.3 ? 12 : sin < -0.3 ? -4 : 4);
      h += '<text x="' + p[0].toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="11" fill="#1d1d1f" text-anchor="' + anchor + '">' +
        esc(v.label) + (multi ? "" : ' <tspan font-weight="700">' + r0(v.v) + "</tspan>") + "</text>";
    });
    return h + "</svg>";
  }

  function radarVals(c, e) {
    const pr = privacyOf(c.privacy);
    return [
      { label: "Vaikutus", v: e.impact },
      { label: "Toteutettavuus", v: e.feas },
      { label: "Riskien hallinta", v: e.safety },
      { label: "Tietosuoja", v: pr ? pr.score : 50 }
    ];
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error("kirjasto ei latautunut (" + src + ")"));
      document.head.appendChild(s);
    });
  }

  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (x) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function storage(key) {
    return {
      get(name, d) { try { const v = localStorage.getItem(key + ":" + name); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
      set(name, v) { try { localStorage.setItem(key + ":" + name, JSON.stringify(v)); return true; } catch (e) { return false; } }
    };
  }

  /* ================================================================ */
  function mount(root, options) {
    if (!root) throw new Error("AIArviointi.mount: kohde-elementti puuttuu.");
    const o = Object.assign({
      storageKey: "ai-arviointi",
      centers: DEFAULT_CENTERS,
      statuses: DEFAULT_STATUSES,
      types: DEFAULT_TYPES,
      typeInfo: DEFAULT_TYPE_INFO,
      hidden: [],
      params: null,
      pptxUrl: "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js",
      font: "Century Gothic",
      org: "Kangasalan kaupunki",
      title: "AI-käyttötapausten arviointi"
    }, options || {});
    const DEF = o.params ? normalizeParams(o.params, BASE_PARAMS) : clone(BASE_PARAMS);
    const db = storage(o.storageKey);
    const ID = "aia" + (++mounts);
    const hide = (f) => (o.hidden || []).indexOf(f) >= 0;
    const showStatus = !hide("status"), showJory = !hide("jory");
    const statusOf = (s) => o.statuses.find((x) => norm(x.label) === norm(s));
    const statusColor = (s) => (statusOf(s) || { c: "#8a8c94" }).c;
    const dotColor = (c, e) => (showStatus ? statusColor(c.status) : e.quad.c);
    const isOpen = (c) => !/^(tuotannossa|hylätty|odottaa)/.test(norm(c.status));

    let params;
    try { params = normalizeParams(db.get("params", null) || {}, DEF); } catch (e) { params = clone(DEF); }
    params.criteria.forEach((cr) => { if (cr.hi === "selvä parannus") cr.hi = "selvä kehitys"; });
    const savedDraft = db.get("draft", null);
    const S = {
      params,
      sim: null,
      cases: (Array.isArray(db.get("cases", [])) ? db.get("cases", []) : []).map(fixCase),
      scenarios: (Array.isArray(db.get("scenarios", [])) ? db.get("scenarios", []) : []).filter((x) => x && x.params),
      draft: savedDraft && savedDraft.c ? fixCase(savedDraft.c) : null,
      dirty: !!(savedDraft && savedDraft.dirty),
      tab: db.get("tab", "arvioi"),
      evalStale: true,
      filt: { center: "", status: "" },
      yfilt: "",
      sel: Array.isArray(db.get("sel", null)) ? db.get("sel", null) : null,
      sortKey: "rank", sortDir: 1, topN: 5, openOnly: true, cmpA: "current", cmpB: "sim",
      ui: { centerOther: false, unitOther: false, showErrors: false, saveErr: "", saveWarn: "", lastSaved: null },
      importTarget: ""
    };
    S.sim = clone(S.params);
    if (!S.draft) S.draft = newCase();

    function newCase() {
      const c = fixCase({ status: o.statuses[0].label });
      S.params.criteria.forEach((cr) => { c.scores[cr.id] = 3; });
      return c;
    }
    const saveCases = () => db.set("cases", S.cases);
    const saveDraft = () => db.set("draft", { c: S.draft, dirty: S.dirty });
    const saveParams = () => db.set("params", S.params);
    const saveScen = () => db.set("scenarios", S.scenarios);
    const isSaved = () => S.cases.some((c) => c.id === S.draft.id);
    const centerNames = () => Array.from(new Set(Object.keys(o.centers).concat(S.cases.map((c) => c.center).filter(Boolean))));

    /* ---------- Runko ---------- */
    const TABS = [
      { id: "arvioi", label: "Arvioi" },
      { id: "omat", label: "Omat arvioinnit" },
      { id: "yhteenveto", label: "Yhteenveto" },
      { id: "vertailu", label: "Vertailu ja simulointi" },
      { id: "parametrit", label: "Parametrit" }
    ];
    root.classList.add("aia");
    root.innerHTML =
      '<div class="aia-tabs" role="tablist" aria-label="Arviointityökalu">' + TABS.map((t) =>
        '<button type="button" role="tab" class="aia-tab" id="' + ID + "-t-" + t.id + '" data-tab="' + t.id + '" aria-controls="' + ID + "-p-" + t.id + '" aria-selected="false">' +
        esc(t.label) + (t.id === "omat" ? ' <span class="aia-count" data-count></span>' : "") + "</button>").join("") + "</div>" +
      '<div class="aia-msg" role="status" aria-live="polite"></div>' +
      TABS.map((t) => '<div class="aia-panel" role="tabpanel" id="' + ID + "-p-" + t.id + '" aria-labelledby="' + ID + "-t-" + t.id + '" data-panel="' + t.id + '" hidden></div>').join("") +
      '<input type="file" accept=".json,application/json" class="aia-file" hidden>' +
      typeDialogHtml();
    const $ = (s) => root.querySelector(s);
    const panel = (id) => root.querySelector('[data-panel="' + id + '"]');
    const fileInput = $(".aia-file");
    const dialog = $(".aia-dialog");
    let msgTimer = null;

    function typeDialogHtml() {
      return '<dialog class="aia-dialog" aria-labelledby="' + ID + '-dlg-title">' +
        '<div class="aia-dlg-head"><h3 id="' + ID + '-dlg-title">Käyttötapausten tyypit</h3>' +
        '<button type="button" class="aia-dlg-x" data-act="dialog-close" aria-label="Sulje">×</button></div>' +
        '<p class="aia-note">Tyyppi kertoo, millaista työtä tekoäly tekee. Valinta on vapaaehtoinen ja auttaa vertailemaan käyttötapauksia.</p>' +
        '<dl class="aia-types">' + o.types.map((t) => {
          const inf = o.typeInfo[t] || {};
          return "<div><dt>" + esc(t) + "</dt><dd>" + esc(inf.desc || "") +
            (inf.ex && inf.ex.length ? "<ul>" + inf.ex.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") +
            '<button type="button" class="aia-btn small ghost" data-act="pick-type" data-type="' + esc(t) + '">Valitse tämä</button></dd></div>';
        }).join("") + "</dl>" +
        '<p class="aia-note">Lähde: <a href="' + TYPE_SOURCE + '" target="_blank" rel="noopener">OpenAI: Tekoälyn käyttötapausten tunnistaminen ja skaalaaminen</a></p>' +
        '<div class="aia-actions">' + '<button type="button" class="aia-btn primary" data-act="dialog-close">Sulje</button></div></dialog>';
    }

    function msg(text, kind) {
      const el = $(".aia-msg");
      el.className = "aia-msg" + (text ? " show " + (kind || "") : "");
      el.textContent = text || "";
      clearTimeout(msgTimer);
      if (text && kind !== "error") msgTimer = setTimeout(() => { el.className = "aia-msg"; el.textContent = ""; }, 6000);
    }

    function updateCount() { const el = $("[data-count]"); if (el) el.textContent = S.cases.length ? String(S.cases.length) : ""; }

    function showTab(id, focus) {
      if (!TABS.some((t) => t.id === id)) id = "arvioi";
      S.tab = id; db.set("tab", id);
      TABS.forEach((t) => {
        const on = t.id === id;
        $('[data-tab="' + t.id + '"]').setAttribute("aria-selected", String(on));
        $('[data-tab="' + t.id + '"]').tabIndex = on ? 0 : -1;
        panel(t.id).hidden = !on;
      });
      if (id === "arvioi") { if (S.evalStale) renderEval(); else refreshOpenBar(); }
      else if (id === "omat") renderList();
      else if (id === "yhteenveto") renderSummary();
      else if (id === "vertailu") renderSim();
      else renderParams();
      if (focus) $('[data-tab="' + id + '"]').focus();
    }

    const opts = (vals, sel, ph) => (ph != null ? '<option value="">' + esc(ph) + "</option>" : "") +
      vals.map((v) => "<option" + (v === sel ? " selected" : "") + ">" + esc(v) + "</option>").join("");
    const btn = (act, label, cls, extra) => '<button type="button" class="aia-btn' + (cls ? " " + cls : "") + '" data-act="' + act + '"' + (extra || "") + ">" + label + "</button>";
    const exportBtns = (scope) => '<div class="aia-export"><span>Lataa:</span>' +
      btn("pdf-" + scope, "PDF", "ghost") + btn("pptx-" + scope, "PowerPoint", "ghost") + btn("csv-" + scope, "CSV", "ghost") + btn("json-" + scope, "JSON", "ghost") + "</div>";
    const reqMark = '<span class="aia-req" aria-hidden="true">*</span><span class="aia-sr"> (pakollinen)</span>';

    function field(label, control, help, forId, req) {
      return '<div class="aia-field"><label class="aia-lbl" for="' + forId + '">' + esc(label) + (req ? " " + reqMark : "") + "</label>" + control +
        (help ? '<small class="aia-hint">' + help + "</small>" : "") + "</div>";
    }

    /* ---------- Arvioi: lomake ---------- */
    function initUi() {
      const c = S.draft, u = S.ui;
      u.centerOther = !!c.center && !has(o.centers, c.center);
      const units = u.centerOther ? [] : (o.centers[c.center] || []);
      u.unitOther = !u.centerOther && !!c.unit && units.indexOf(c.unit) < 0;
      u.showErrors = false; u.saveErr = "";
    }

    function unitRequired(c) {
      const u = S.ui;
      if (u.centerOther) return true;
      if (!c.center) return true;
      return (o.centers[c.center] || []).length > 0 || u.unitOther;
    }

    function unitFieldHtml() {
      const c = S.draft, u = S.ui, units = o.centers[c.center] || [];
      const textIn = (hidden) => '<input type="text" class="aia-other" id="' + ID + '-unittext" data-f="unitText" data-req="unitText" maxlength="60" placeholder="Kirjoita yksikön nimi" value="' +
        esc(u.unitOther || u.centerOther ? c.unit : "") + '"' + (hidden ? " hidden" : "") + ">";
      let ctl, forId = ID + "-unit";
      if (u.centerOther) { ctl = textIn(false); forId = ID + "-unittext"; }
      else if (!c.center) ctl = '<select id="' + ID + '-unit" disabled><option>Valitse ensin ' + esc(CENTER_LBL.toLowerCase()) + "</option></select>";
      else {
        ctl = '<select id="' + ID + '-unit" data-f="unit" data-req="unit">' +
          (units.length ? opts(units, u.unitOther ? null : c.unit, "Valitse yksikkö") : '<option value="">Kaikille yhteinen</option>') +
          '<option value="' + OTHER + '"' + (u.unitOther ? " selected" : "") + ">Muu, kirjoita nimi…</option></select>" + textIn(!u.unitOther);
      }
      return field("Yksikkö", ctl, "", forId, unitRequired(c));
    }

    function starHelp(P) {
      const hy = P.criteria.filter((c) => c.group === "hyoty" && c.weight > 0);
      const W = hy.reduce((s, c) => s + c.weight, 0), m = P.starMultiplier;
      if (!hy.length) return "";
      const base = 1 / W, star = m / (W - 1 + m);
      const pct = (v) => fiNum(v * 100) + " %";
      const allOne = hy.every((c) => c.weight === 1);
      return '<details class="aia-why"><summary>Mitä ×' + fiNum(m, 1) + " tarkoittaa?</summary>" +
        "<p>Tähdellä merkitty kriteeri lasketaan ryhmänsä keskiarvoon <b>" + fiNum(m, 1) + "-kertaisella painolla</b>, eli sen arvo vaikuttaa " +
        fiNum(m, 1) + " kertaa niin paljon kuin muiden saman ryhmän kriteerien.</p>" +
        "<p>Esimerkki: <i>Hyödyt toiminnassa</i> -ryhmässä on " + hy.length + " kriteeriä. Normaalisti yhden kriteerin osuus ryhmän pisteistä on " +
        (allOne ? "1/" + W + " (" + pct(base) + ")" : pct(base)) + ". Tähdellä merkittynä osuus on " +
        (allOne && m === Math.round(m) ? m + "/" + (W - 1 + m) + " (" + pct(star) + ")" : pct(star)) + ".</p>" +
        "<p>Tähdet eivät siis lisää pisteitä, vaan siirtävät painoa: muiden kriteerien osuus pienenee vastaavasti. " +
        "Merkitse tähdellä ne kriteerit, jotka ovat tämän käyttötapauksen kannalta ratkaisevia.</p></details>";
    }

    function openBarHtml() {
      const list = S.cases.slice().sort((a, b) => (b.updated > a.updated ? 1 : -1));
      return '<label class="aia-openbar-sel"><span>Avaa tallennettu arviointi</span><select data-open>' +
        '<option value="">' + (list.length ? "Valitse…" : "Ei tallennettuja") + "</option>" +
        list.map((c) => '<option value="' + esc(c.id) + '"' + (c.id === S.draft.id ? " selected" : "") + ">" + esc((c.name || "(nimetön)") + " · " + fiDate(new Date(c.updated))) + "</option>").join("") +
        "</select></label>" +
        '<div class="aia-openbar-btns">' + btn("import-one", "Tuo arviointi (JSON)", "ghost") + btn("new", "Uusi arviointi", "ghost") + "</div>";
    }
    function refreshOpenBar() { const el = panel("arvioi").querySelector("[data-openbar]"); if (el) el.innerHTML = openBarHtml(); }

    function renderEval() {
      S.evalStale = false;
      initUi();
      const c = S.draft, P = S.params, u = S.ui;
      let h = '<div class="aia-openbar" data-openbar>' + openBarHtml() + "</div>";
      h += '<div class="aia-eval"><div class="aia-form">';
      h += '<p class="aia-editing"><span data-editing></span> <span class="aia-reqnote">' + reqMark.replace(' aria-hidden="true"', "") .replace("(pakollinen)", "") + " = pakollinen tieto</span></p>";

      h += '<section class="aia-card"><h3><span class="aia-step">1</span>Perustiedot</h3>';
      h += field("Käyttötapauksen nimi", '<input type="text" id="' + ID + '-name" data-f="name" data-req="name" maxlength="140" aria-required="true" value="' + esc(c.name) + '" autocomplete="off">',
        "Nimeä mahdollisimman konkreettisesti.", ID + "-name", true);
      h += '<div class="aia-row2">' +
        field(CENTER_LBL, '<select id="' + ID + '-center" data-f="center" data-req="center" aria-required="true">' +
          opts(Object.keys(o.centers), u.centerOther ? null : c.center, "Valitse") +
          '<option value="' + OTHER + '"' + (u.centerOther ? " selected" : "") + ">Muu, kirjoita nimi…</option></select>" +
          '<input type="text" class="aia-other" id="' + ID + '-centertext" data-f="centerText" data-req="centerText" maxlength="60" placeholder="Kirjoita nimi" aria-label="' + CENTER_LBL + ', oma nimi" value="' +
          esc(u.centerOther ? c.center : "") + '"' + (u.centerOther ? "" : " hidden") + ">", "", ID + "-center", true) +
        '<div data-unitwrap>' + unitFieldHtml() + "</div></div>";
      h += '<div class="aia-row2">' +
        field("Omistaja (rooli tai tiimi)", '<input type="text" id="' + ID + '-owner" data-f="owner" maxlength="120" value="' + esc(c.owner) + '" placeholder="esim. Rakennusvalvonnan tiimi">', "", ID + "-owner") +
        '<div class="aia-field"><div class="aia-lblrow"><label class="aia-lbl" for="' + ID + '-type">Tyyppi (valinnainen)</label>' +
        '<button type="button" class="aia-info" data-act="type-info" aria-haspopup="dialog" title="Mitä tyypit tarkoittavat?">?<span class="aia-sr"> Mitä tyypit tarkoittavat?</span></button></div>' +
        '<select id="' + ID + '-type" data-f="type">' + opts(o.types, c.type, "Valitse") + "</select></div></div>";
      const area = (key, idS, label, help) => field(label, '<textarea id="' + ID + "-" + idS + '" data-f="' + key + '" data-req="' + key + '" rows="3" maxlength="200" aria-required="true">' + esc(c[key]) + "</textarea>" +
        '<small class="aia-counter" data-counter="' + key + '">' + c[key].length + " / 200</small>", help, ID + "-" + idS, true);
      h += area("problem", "problem", "Ongelma ja tavoite", "Mikä nykyisessä työssä on hidasta tai hankalaa? Mitä tavoitellaan ja kenelle?");
      h += area("aiHelp", "aihelp", "Miten tekoäly auttaa?", "Mitä tekoäly tekisi tai tukisi? Mitä tarvitaan, jotta idea etenee?");
      if (showStatus || showJory) {
        h += '<div class="aia-row2">' +
          (showStatus ? field("Tila", '<select id="' + ID + '-status" data-f="status">' + opts(o.statuses.map((s) => s.label), c.status) + "</select>", "", ID + "-status") : "<div></div>") +
          (showJory ? '<div class="aia-field"><span class="aia-lbl">Jory-huomio</span><label class="aia-check"><input type="checkbox" data-f="jory"' + (c.jory ? " checked" : "") + "> Vaatii johtoryhmän päätöstä</label></div>" : "") + "</div>";
      }
      h += '<fieldset class="aia-privacy" data-req="privacy"><legend class="aia-lbl">Tietosuoja ja riskitaso ' + reqMark + "</legend>" + PRIVACY.map((p) =>
        '<label style="--pc:' + p.c + '"><input type="radio" name="' + ID + '-privacy" value="' + p.key + '" data-f="privacy"' + (c.privacy === p.key ? " checked" : "") + ">" +
        "<span><b>" + esc(p.label) + "</b><small>" + esc(p.desc) + "</small></span></label>").join("") + "</fieldset>";
      h += "</section>";

      h += '<section class="aia-card"><h3><span class="aia-step">2</span>Arviointi</h3>' +
        '<p class="aia-note">Siirrä liukusäädintä tai valitse numero 1–5 (5 = toiminnan kannalta paras). Merkitse ★:llä enintään ' + P.maxStars +
        ' kriteeriä, jotka ovat tälle käyttötapaukselle tärkeimpiä. <b data-starcount></b></p>' + starHelp(P);
      Object.keys(GROUPS).forEach((g) => {
        const list = P.criteria.filter((cr) => cr.group === g);
        if (!list.length) return;
        h += '<fieldset class="aia-group"><legend>' + esc(GROUPS[g].label) + " <small>→ " + esc(GROUPS[g].axis) + "</small></legend>";
        list.forEach((cr) => {
          const i = P.criteria.indexOf(cr), iid = ID + "-c" + i;
          if (c.scores[cr.id] == null) c.scores[cr.id] = 3;
          const v = c.scores[cr.id], on = c.stars.indexOf(cr.id) >= 0;
          h += '<div class="aia-crit' + (cr.weight ? "" : " off") + '">' +
            '<div class="aia-crit-head"><button type="button" class="aia-star" data-star="' + i + '" aria-pressed="' + on + '" title="Avainkriteeri" aria-label="Avainkriteeri: ' + esc(cr.name) + '">★</button>' +
            '<label for="' + iid + '">' + esc(cr.name) + (cr.weight ? "" : " <em>(paino 0, ei vaikuta)</em>") + "</label>" +
            '<output for="' + iid + '" data-out="' + i + '">' + v + "</output></div>" +
            (cr.help ? '<p class="aia-help">' + esc(cr.help) + "</p>" : "") +
            '<div class="aia-scale"><input type="range" min="1" max="5" step="1" id="' + iid + '" data-score="' + i + '" value="' + v + '" aria-valuetext="' + v + '">' +
            '<div class="aia-steps" aria-hidden="true">' + [1, 2, 3, 4, 5].map((k) =>
              '<button type="button" tabindex="-1" data-step="' + i + '" data-v="' + k + '" class="' + (k === v ? "on" : "") + '">' + k + "</button>").join("") + "</div>" +
            '<div class="aia-ends"><span>1 = ' + esc(cr.lo) + "</span><span>5 = " + esc(cr.hi) + "</span></div></div></div>";
        });
        h += "</fieldset>";
      });
      h += "</section>";

      h += '<section class="aia-card"><h3><span class="aia-step">3</span>Hyöty–kustannus <small class="aia-opt">valinnainen</small></h3>' +
        '<p class="aia-note">Karkea arvio auttaa vertailemaan käyttötapauksia. Työtunnin arvo (' + fiNum(P.hourValue) + " €/h) on parametreissa.</p>" +
        '<div class="aia-row2">' +
        field("Säästetty työaika, tunti (h) / kk", '<input type="number" inputmode="decimal" min="0" step="1" id="' + ID + '-hours" data-f="hours" value="' + esc(c.hours) + '">', "Koko organisaatiossa yhteensä.", ID + "-hours") +
        field("Kustannusarvio, € / vuosi", '<input type="number" inputmode="decimal" min="0" step="100" id="' + ID + '-cost" data-f="cost" value="' + esc(c.cost) + '">', "Lisenssit, kehitys ja ylläpito.", ID + "-cost") +
        "</div></section>";
      h += "</div>";

      h += '<aside class="aia-result" aria-label="Tulos"><div data-result></div>' +
        '<div class="aia-actions">' + btn("save", "Tallenna arviointi", "primary", " data-savebtn") +
        btn("save-new", "Tallenna uutena", "", " data-savenew hidden") +
        (hide("roadmapBlock") ? "" : btn("copy-block", "Kopioi tiekarttalohkona", "", ' title="Valmis lohko content/tiekartta.md-tiedostoon"')) + "</div>" +
        '<p class="aia-savestate" data-savestate role="status" aria-live="polite"></p>' +
        exportBtns("one") + '<div data-block></div></aside></div>';
      panel("arvioi").innerHTML = h;
      updateResult();
    }

    function updateResult() {
      const c = S.draft, P = S.params, e = evaluate(c, P);
      const pnl = panel("arvioi");
      const el = pnl.querySelector("[data-result]");
      if (!el) return;
      let h = '<div class="aia-headline"><div class="aia-prio"><b>' + r0(e.prio) + "</b><span>Prioriteetti<br>/ 100</span></div>" +
        '<span class="aia-quadchip" style="--qc:' + e.quad.c + '">' + esc(e.quad.label) + "</span></div>";
      h += '<ul class="aia-recs">' + e.recs.map((r) => "<li>" + esc(r) + "</li>").join("") + "</ul>";
      h += quadrantSvg([{ x: e.effort, y: e.impact, n: "", c: e.quad.c, title: c.name || "Tämä käyttötapaus" }], P);
      h += barsHtml(e);
      h += radarSvg(radarVals(c, e));
      if (e.benefit > 0 || e.cost > 0) {
        h += '<p class="aia-benefit">Säästetyn työajan arvo noin <b>' + fiNum(e.benefit) + " € / v</b>" +
          (e.cost > 0 ? ", kustannus " + fiNum(e.cost) + " € / v" : "") + (e.ratio != null ? " → suhde <b>" + fiNum(e.ratio, 1) + "×</b>" : "") + "</p>";
      }
      el.innerHTML = h;
      const sc = pnl.querySelector("[data-starcount]");
      if (sc) sc.textContent = "Valittu " + c.stars.filter((id) => S.params.criteria.some((cr) => cr.id === id)).length + " / " + P.maxStars + ".";
      const ed = pnl.querySelector("[data-editing]");
      if (ed) ed.textContent = isSaved() ? "Muokkaat tallennettua arviointia" : "Uusi arviointi";
      updateSaveState();
    }

    function barsHtml(e) {
      const bar = (label, v, col) => '<div class="aia-bar"><span>' + label + '</span><i><b style="width:' + r0(v) + "%;background:" + col + '"></b></i><em>' + r0(v) + "</em></div>";
      return '<div class="aia-bars">' + bar("Vaikutus", e.impact, "#009651") + bar("Toteutettavuus", e.feas, "#00adc5") +
        bar("Työmäärä", e.effort, "#e64925") + bar("Riskitaso", e.risk, "#28336c") + "</div>";
    }

    function updateSaveState() {
      const pnl = panel("arvioi"), el = pnl.querySelector("[data-savestate]");
      if (!el) return;
      const saved = isSaved(), u = S.ui;
      const b = pnl.querySelector("[data-savebtn]"); if (b) b.textContent = saved ? "Tallenna muutokset" : "Tallenna arviointi";
      const bn = pnl.querySelector("[data-savenew]"); if (bn) bn.hidden = !saved;
      let cls = "", t = "";
      if (u.saveErr) { cls = "error"; t = u.saveErr; }
      else if (u.saveWarn) { cls = "warn"; t = u.saveWarn; }
      else if (S.dirty) { cls = "dirty"; t = saved ? "Tallentamattomia muutoksia." : "Ei vielä tallennettu."; }
      else if (saved) { cls = "ok"; t = "✓ Tallennettu" + (u.lastSaved ? " klo " + fiTime(u.lastSaved) : " " + fiDate(new Date(S.draft.updated))) + "."; }
      el.className = "aia-savestate " + cls;
      el.textContent = t;
    }

    function checkRequired() {
      const c = S.draft, u = S.ui, m = [];
      if (!c.name.trim()) m.push(["name", "Käyttötapauksen nimi"]);
      if (!c.center.trim()) m.push([u.centerOther ? "centerText" : "center", CENTER_LBL]);
      else if (unitRequired(c) && !c.unit.trim()) m.push([u.centerOther || u.unitOther ? "unitText" : "unit", "Yksikkö"]);
      if (!c.problem.trim()) m.push(["problem", "Ongelma ja tavoite"]);
      if (!c.aiHelp.trim()) m.push(["aiHelp", "Miten tekoäly auttaa"]);
      if (!c.privacy) m.push(["privacy", "Tietosuoja ja riskitaso"]);
      return m;
    }

    function markInvalid(list) {
      panel("arvioi").querySelectorAll("[data-req]").forEach((el) => {
        const bad = list.some((x) => x[0] === el.dataset.req);
        el.classList.toggle("aia-invalid", bad);
        if (el.tagName !== "FIELDSET") el.setAttribute("aria-invalid", String(bad));
      });
    }

    function validate(focus) {
      const list = checkRequired();
      S.ui.showErrors = true;
      markInvalid(list);
      S.ui.saveErr = list.length ? "Täytä vielä pakolliset tiedot: " + list.map((x) => x[1]).join(", ") + "." : "";
      updateSaveState();
      if (list.length && focus) {
        const el = panel("arvioi").querySelector('[data-req="' + list[0][0] + '"]');
        const target = el && el.tagName === "FIELDSET" ? el.querySelector("input") : el;
        if (target) { target.focus(); if (target.scrollIntoView) target.scrollIntoView({ block: "center", behavior: "smooth" }); }
      }
      return !list.length;
    }

    function touch() {
      S.dirty = true; S.ui.saveWarn = "";
      saveDraft();
      if (S.ui.showErrors) {
        const list = checkRequired();
        markInvalid(list);
        S.ui.saveErr = list.length ? "Täytä vielä pakolliset tiedot: " + list.map((x) => x[1]).join(", ") + "." : "";
      }
      updateResult();
    }

    function storeCase(c) {
      c.updated = new Date().toISOString();
      const i = S.cases.findIndex((x) => x.id === c.id);
      if (i >= 0) S.cases[i] = clone(c); else S.cases.push(clone(c));
      const ok = saveCases();
      S.dirty = false; S.ui.lastSaved = new Date(); S.ui.saveErr = "";
      S.ui.saveWarn = ok ? "" : "Selain esti tallennuksen (esim. yksityinen ikkuna). Arviointi on tallessa vain tämän sivun ollessa auki: lataa se JSON-tiedostona, ettei se katoa.";
      saveDraft(); updateCount(); refreshOpenBar(); updateResult();
      return ok;
    }

    function openCase(id, tabAfter) {
      const c = S.cases.find((x) => x.id === id);
      if (!c) return false;
      if (S.dirty && S.draft.id !== id && !global.confirm("Avoimessa arvioinnissa on tallentamattomia muutoksia. Hylätäänkö ne?")) { refreshOpenBar(); return false; }
      S.draft = clone(c); S.dirty = false; S.ui.lastSaved = null; S.ui.saveWarn = "";
      saveDraft(); S.evalStale = true;
      showTab(tabAfter || "arvioi");
      return true;
    }

    /* ---------- Omat arvioinnit ---------- */
    function filtered() {
      return S.cases.filter((c) => (!S.filt.center || c.center === S.filt.center) && (!showStatus || !S.filt.status || c.status === S.filt.status));
    }

    function caseChips(c, e, extra) {
      const st = statusOf(c.status), pr = privacyOf(c.privacy);
      return '<div class="aia-chips">' +
        (showStatus ? '<span class="aia-chip" style="background:' + statusColor(c.status) + ";color:" + (st && st.dark ? "#1d1d1f" : "#fff") + '">' + esc(c.status || "Ei tilaa") + "</span>" : "") +
        (extra || "") +
        '<span class="aia-chip" style="box-shadow:inset 0 0 0 1.5px ' + e.quad.c + '">' + esc(e.quad.label) + "</span>" +
        (pr ? '<span class="aia-chip"><i class="aia-dot" style="background:' + pr.c + '"></i>' + esc(pr.label) + "</span>" : "") +
        (showJory && c.jory ? '<span class="aia-chip jory">Jory</span>' : "") + "</div>";
    }

    function renderList() {
      const P = S.params;
      let h = '<div class="aia-toolbar">' +
        "<label>" + CENTER_LBL + '<select data-filt="center">' + opts(centerNames(), S.filt.center, "Kaikki") + "</select></label>" +
        (showStatus ? '<label>Tila<select data-filt="status">' + opts(o.statuses.map((s) => s.label), S.filt.status, "Kaikki") + "</select></label>" : "") +
        '<div class="aia-tb-btns">' + btn("import", "Tuo JSON", "ghost") + "</div></div>";
      if (showStatus) {
        h += '<div class="aia-status">' + o.statuses.map((s) => {
          const n = S.cases.filter((c) => norm(c.status) === norm(s.label)).length;
          return '<div style="--sc:' + s.c + '"><b>' + n + "</b><span>" + esc(s.label) + "</span></div>";
        }).join("") + "</div>";
      }
      if (!S.cases.length) {
        h += '<div class="aia-empty">Ei vielä tallennettuja arviointeja. Tee arviointi <button type="button" class="aia-link" data-act="goto-arvioi">Arvioi</button>-välilehdellä tai tuo JSON-tiedosto.</div>';
        panel("omat").innerHTML = h; return;
      }
      const items = ranked(P, filtered());
      h += exportBtns("list");
      if (!items.length) { h += '<div class="aia-empty">Ei arviointeja valituilla suodattimilla.</div>'; panel("omat").innerHTML = h; return; }
      h += '<div class="aia-grid2"><div class="aia-card"><h3>Salkkunäkymä</h3>' +
        quadrantSvg(items.map((it, i) => ({ x: it.e.effort, y: it.e.impact, n: i + 1, c: dotColor(it.c, it.e), tc: dotColor(it.c, it.e) === "#fcb316" ? "#1d1d1f" : "#fff", title: (i + 1) + ". " + it.c.name })), P, "Salkkunäkymä: käyttötapaukset nelikentässä") +
        '<p class="aia-note">' + (showStatus ? "Pallon väri kertoo tilan" : "Pallon väri kertoo nelikentän") + ", numero prioriteettijärjestyksen.</p></div><ol class=\"aia-list\">";
      items.forEach((it, i) => {
        const c = it.c, col = dotColor(c, it.e);
        h += '<li class="aia-item" style="--sc:' + col + '"><span class="aia-num"' + (col === "#fcb316" ? ' style="color:#1d1d1f"' : "") + ">" + (i + 1) + "</span><div>" +
          "<h4>" + esc(c.name || "(nimetön)") + "</h4>" +
          '<p class="aia-where">' + esc([c.center, c.unit].filter(Boolean).join(" · ") || CENTER_LBL + " puuttuu") + " · päivitetty " + esc(fiDate(new Date(c.updated))) + "</p>" +
          caseChips(c, it.e, '<span class="aia-chip">Prioriteetti ' + r0(it.e.prio) + "</span>") +
          '<div class="aia-item-btns">' + btn("open", "Avaa ja muokkaa", "small", ' data-id="' + esc(c.id) + '"') +
          btn("dup", "Monista", "small ghost", ' data-id="' + esc(c.id) + '"') + btn("del", "Poista", "small ghost danger", ' data-id="' + esc(c.id) + '"') + "</div></div></li>";
      });
      h += "</ol></div>";
      panel("omat").innerHTML = h;
    }

    /* ---------- Yhteenveto (enintään 4 käyttötapausta) ---------- */
    function selection() {
      const ids = S.cases.map((c) => c.id);
      if (!S.sel) S.sel = ranked(S.params, S.cases).slice(0, MAX_SEL).map((it) => it.c.id);
      S.sel = S.sel.filter((id) => ids.indexOf(id) >= 0).slice(0, MAX_SEL);
      return S.sel;
    }
    const selCases = () => selection().map((id) => S.cases.find((c) => c.id === id)).filter(Boolean);

    function renderSummary() {
      const P = S.params;
      let h = '<p class="aia-lead">Valitse enintään ' + MAX_SEL + " käyttötapausta ja vertaa niitä nelikentässä, tutkakaaviossa ja rinnakkain.</p>";
      if (!S.cases.length) {
        panel("yhteenveto").innerHTML = h + '<div class="aia-empty">Ei vielä tallennettuja arviointeja. Tee arviointi <button type="button" class="aia-link" data-act="goto-arvioi">Arvioi</button>-välilehdellä tai tuo JSON-tiedosto.</div>';
        return;
      }
      const sel = selection(), full = sel.length >= MAX_SEL;
      const pool = ranked(P, S.cases.filter((c) => !S.yfilt || c.center === S.yfilt || sel.indexOf(c.id) >= 0));
      h += '<div class="aia-card"><div class="aia-rank-head"><h3>Valitse vertailtavat (' + sel.length + " / " + MAX_SEL + ")</h3>" +
        '<label class="aia-small-sel">' + CENTER_LBL + ' <select data-yfilt>' + opts(centerNames(), S.yfilt, "Kaikki") + "</select></label></div>" +
        '<ul class="aia-pick">' + pool.map((it) => {
          const k = sel.indexOf(it.c.id), on = k >= 0;
          return '<li><label class="' + (on ? "on" : "") + '"' + (on ? ' style="--yc:' + SEL_COLORS[k] + '"' : "") + '><input type="checkbox" data-ysel="' + esc(it.c.id) + '"' + (on ? " checked" : "") + (!on && full ? " disabled" : "") + ">" +
            (on ? '<span class="aia-num" style="background:' + SEL_COLORS[k] + (SEL_COLORS[k] === "#fcb316" ? ";color:#1d1d1f" : "") + '">' + (k + 1) + "</span>" : '<span class="aia-num empty"></span>') +
            "<span><b>" + esc(it.c.name || "(nimetön)") + '</b><small class="aia-where">' + esc([it.c.center, it.c.unit].filter(Boolean).join(" · ")) + " · prioriteetti " + r0(it.e.prio) + "</small></span></label></li>";
        }).join("") + "</ul>" +
        (full ? '<p class="aia-note">Enintään ' + MAX_SEL + " valintaa. Poista ensin jokin valinta, jos haluat vaihtaa.</p>" : "") + "</div>";
      const cs = selCases();
      if (!cs.length) { panel("yhteenveto").innerHTML = h + '<div class="aia-empty">Valitse vähintään yksi käyttötapaus.</div>'; return; }
      const ev = cs.map((c) => evaluate(c, P));
      h += exportBtns("sel");
      h += '<div class="aia-grid2"><div class="aia-card"><h3>Nelikenttä</h3>' +
        quadrantSvg(cs.map((c, i) => ({ x: ev[i].effort, y: ev[i].impact, n: i + 1, c: SEL_COLORS[i], tc: SEL_COLORS[i] === "#fcb316" ? "#1d1d1f" : "#fff", title: (i + 1) + ". " + c.name })), P, "Valitut käyttötapaukset nelikentässä") +
        '</div><div class="aia-card"><h3>Tutkakaavio</h3>' +
        radarSvg(cs.map((c, i) => ({ color: SEL_COLORS[i], name: (i + 1) + ". " + c.name, vals: radarVals(c, ev[i]) }))) +
        '<ul class="aia-legend">' + cs.map((c, i) => '<li><i style="background:' + SEL_COLORS[i] + '"></i>' + (i + 1) + ". " + esc(c.name) + "</li>").join("") + "</ul></div></div>";
      h += '<div class="aia-ycards">' + cs.map((c, i) => {
        const e = ev[i], pr = privacyOf(c.privacy);
        const stars = S.params.criteria.filter((cr) => c.stars.indexOf(cr.id) >= 0).map((cr) => cr.name);
        return '<article class="aia-ycard" style="--yc:' + SEL_COLORS[i] + '"><div class="aia-ycard-head"><span class="aia-num" style="background:' + SEL_COLORS[i] +
          (SEL_COLORS[i] === "#fcb316" ? ";color:#1d1d1f" : "") + '">' + (i + 1) + "</span><h4>" + esc(c.name || "(nimetön)") + "</h4></div>" +
          '<p class="aia-where">' + esc([c.center, c.unit, c.type].filter(Boolean).join(" · ")) + "</p>" +
          '<div class="aia-prio sm"><b>' + r0(e.prio) + "</b><span>Prioriteetti / 100</span></div>" +
          '<span class="aia-quadchip" style="--qc:' + e.quad.c + '">' + esc(e.quad.label) + "</span>" +
          barsHtml(e) +
          '<p class="aia-yline"><b>Tietosuoja:</b> ' + (pr ? '<i class="aia-dot" style="background:' + pr.c + '"></i>' + esc(pr.label) : "–") + "</p>" +
          '<p class="aia-yline"><b>★ Avainkriteerit:</b> ' + (stars.length ? esc(stars.join(", ")) : "–") + "</p>" +
          (c.problem ? '<p class="aia-yline"><b>Ongelma ja tavoite:</b> ' + esc(c.problem) + "</p>" : "") +
          '<p class="aia-yline"><b>Suositus:</b> ' + esc(e.recs[0]) + "</p>" +
          btn("open", "Avaa muokattavaksi", "small", ' data-id="' + esc(c.id) + '"') + "</article>";
      }).join("") + "</div>";
      panel("yhteenveto").innerHTML = h;
    }

    /* ---------- Vertailu ja simulointi ---------- */
    const SIM_SLIDERS = [
      { k: "balance", label: "Vaikutuksen osuus prioriteetista", min: 0, max: 100, step: 5, fmt: (v) => r0(v) + " % vaikutus / " + r0(100 - v) + " % toteutettavuus" },
      { k: "riskWeight", label: "Riskien painoarvo", min: 0, max: 50, step: 1, fmt: (v) => "enintään −" + r0(v) + " p." },
      { k: "starMultiplier", label: "Avainkriteerin (★) kerroin", min: 1, max: 4, step: 0.5, fmt: (v) => "×" + fiNum(v, 1) },
      { k: "pen-keltainen", label: "Keltaisen tietosuojatason vähennys", min: 0, max: 50, step: 1, fmt: (v) => "−" + r0(v) + " p." },
      { k: "pen-punainen", label: "Punaisen tietosuojatason vähennys", min: 0, max: 60, step: 1, fmt: (v) => "−" + r0(v) + " p." },
      { k: "hourValue", label: "Työtunnin arvo", min: 20, max: 120, step: 1, fmt: (v) => r0(v) + " €/h" }
    ];
    const simGet = (P, k) => (k.indexOf("pen-") === 0 ? P.privacyPenalty[k.slice(4)] : P[k]);
    const simSet = (P, k, v) => { if (k.indexOf("pen-") === 0) P.privacyPenalty[k.slice(4)] = v; else P[k] = v; };

    function renderSim() {
      const X = S.sim;
      let h = '<p class="aia-lead">Kokeile, miten painotukset muuttavat järjestystä. Tallennetut arvioinnit lasketaan aina uudelleen alkuperäisistä vastauksista. ' +
        "▲/▼ näyttää muutoksen nykyisiin parametreihin verrattuna.</p>";
      if (!S.cases.length) {
        panel("vertailu").innerHTML = h + '<div class="aia-empty">Vertailuun tarvitaan tallennettuja arviointeja. Tee arviointeja tai tuo JSON-tiedosto <button type="button" class="aia-link" data-act="goto-omat">Omat arvioinnit</button>-välilehdellä.</div>';
        return;
      }
      h += '<div class="aia-grid2"><div class="aia-card"><h3>Mitä jos -painotukset</h3>';
      SIM_SLIDERS.forEach((s, i) => {
        const v = simGet(X, s.k), iid = ID + "-s" + i;
        h += '<div class="aia-sim"><div class="aia-crit-head"><label for="' + iid + '">' + esc(s.label) + '</label><output data-simout="' + s.k + '">' + esc(s.fmt(v)) + "</output></div>" +
          '<input type="range" id="' + iid + '" data-sim="' + s.k + '" min="' + s.min + '" max="' + s.max + '" step="' + s.step + '" value="' + v + '"></div>';
      });
      h += '<div class="aia-actions">' + btn("sim-apply", "Ota käyttöön", "primary", ' title="Tallentaa nämä painotukset parametreiksi"') + btn("sim-reset", "Palauta nykyisiin") + "</div>" +
        '<div class="aia-scen-save"><label class="aia-lbl" for="' + ID + '-scen">Tallenna skenaariona</label><div class="aia-inline">' +
        '<input type="text" id="' + ID + '-scen" maxlength="60" placeholder="esim. Painotus: nopeat hyödyt">' + btn("scen-save", "Tallenna") + "</div></div></div>";
      h += '<div class="aia-card"><h3>Salkku simuloiduilla painotuksilla</h3><div data-simquad></div></div></div>';
      h += '<div class="aia-card"><div class="aia-rank-head"><h3>Prioriteettijärjestys</h3><div class="aia-inline">' +
        (showStatus ? '<label class="aia-check"><input type="checkbox" data-opt="openOnly"' + (S.openOnly ? " checked" : "") + "> Vain avoimet (ei tuotannossa tai hylätty)</label>" : "") +
        '<label class="aia-small-sel">Korosta <select data-opt="topN">' + [3, 5, 10].map((n) => "<option" + (n === S.topN ? " selected" : "") + ">" + n + "</option>").join("") + "</select> parasta</label>" +
        "</div></div><div data-rank></div></div>";
      h += '<div class="aia-card"><h3>Skenaariot</h3><div data-scen></div></div>';
      panel("vertailu").innerHTML = h;
      updateSim();
    }

    function simPool() { return S.cases.filter((c) => !showStatus || !S.openOnly || isOpen(c)); }

    function updateSim() {
      const pnl = panel("vertailu");
      if (!pnl.querySelector("[data-rank]")) return;
      const pool = simPool();
      const base = ranked(S.params, pool), sim = ranked(S.sim, pool);
      const baseRank = {}; base.forEach((it, i) => { baseRank[it.c.id] = i + 1; });
      const rows = sim.map((it, i) => ({ c: it.c, e: it.e, rank: i + 1, delta: baseRank[it.c.id] - (i + 1) }));
      const key = S.sortKey, dir = S.sortDir;
      const val = {
        rank: (r) => r.rank, name: (r) => r.c.name, prio: (r) => r.e.prio, impact: (r) => r.e.impact, effort: (r) => r.e.effort,
        risk: (r) => r.e.risk, ratio: (r) => (r.e.ratio == null ? -1 : r.e.ratio), status: (r) => r.c.status
      }[key] || ((r) => r.rank);
      rows.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "string" ? x.localeCompare(y, "fi") : x - y) * dir || a.rank - b.rank; });
      const cols = [["rank", "#"], ["name", "Käyttötapaus"], ["prio", "Prioriteetti"], ["impact", "Vaikutus"], ["effort", "Työmäärä"], ["risk", "Riski"], ["ratio", "Hyöty / kust."]]
        .concat(showStatus ? [["status", "Tila"]] : []);
      let h = pool.length ? "" : '<div class="aia-empty">Ei avoimia käyttötapauksia. Poista rajaus nähdäksesi kaikki.</div>';
      if (pool.length) {
        h += '<div class="aia-tablewrap"><table class="aia-table"><thead><tr>' + cols.map((c) =>
          '<th scope="col" aria-sort="' + (key === c[0] ? (dir > 0 ? "ascending" : "descending") : "none") + '"><button type="button" data-sort="' + c[0] + '">' + c[1] +
          (key === c[0] ? (dir > 0 ? " ↑" : " ↓") : "") + "</button></th>").join("") + "</tr></thead><tbody>";
        rows.forEach((r) => {
          const d = r.delta;
          h += '<tr class="' + (r.rank <= S.topN ? "top" : "") + '"><td><b>' + r.rank + "</b>" +
            (d > 0 ? ' <span class="aia-up" title="Nousi ' + d + '">▲' + d + "</span>" : d < 0 ? ' <span class="aia-down" title="Laski ' + (-d) + '">▼' + (-d) + "</span>" : "") + "</td>" +
            "<td>" + esc(r.c.name || "(nimetön)") + '<small class="aia-where">' + esc([r.c.center, r.e.quad.label].filter(Boolean).join(" · ")) + "</small></td>" +
            "<td><b>" + r0(r.e.prio) + "</b></td><td>" + r0(r.e.impact) + "</td><td>" + r0(r.e.effort) + "</td><td>" + r0(r.e.risk) + "</td>" +
            "<td>" + (r.e.ratio == null ? "–" : fiNum(r.e.ratio, 1) + "×") + "</td>" +
            (showStatus ? '<td><span class="aia-dot" style="background:' + statusColor(r.c.status) + '"></span>' + esc(r.c.status) + "</td>" : "") + "</tr>";
        });
        h += "</tbody></table></div><p class=\"aia-note\">Korostettu = " + S.topN + " parasta (\"toteuta ensin\"). Järjestä klikkaamalla otsikkoa.</p>";
      }
      pnl.querySelector("[data-rank]").innerHTML = h;
      pnl.querySelector("[data-simquad]").innerHTML = sim.length
        ? quadrantSvg(sim.map((it, i) => ({ x: it.e.effort, y: it.e.impact, n: i + 1, c: dotColor(it.c, it.e), tc: dotColor(it.c, it.e) === "#fcb316" ? "#1d1d1f" : "#fff", title: (i + 1) + ". " + it.c.name })), S.sim)
        : '<p class="aia-note">Ei näytettäviä käyttötapauksia.</p>';
      renderScenarios();
    }

    function scenParams(k) {
      if (k === "current") return { name: "Nykyiset parametrit", p: S.params };
      if (k === "sim") return { name: "Simulointi (tallentamaton)", p: S.sim };
      const s = S.scenarios.find((x) => x.id === k);
      return s ? { name: s.name, p: s.params } : { name: "Nykyiset parametrit", p: S.params };
    }

    function renderScenarios() {
      const el = panel("vertailu").querySelector("[data-scen]");
      if (!el) return;
      let h = "";
      if (S.scenarios.length) {
        h += '<ul class="aia-scen">' + S.scenarios.map((s) => "<li><span><b>" + esc(s.name) + '</b><small class="aia-where">' + esc(s.saved ? fiDate(new Date(s.saved)) : "") + "</small></span>" +
          '<span class="aia-item-btns">' + btn("scen-load", "Simuloi", "small", ' data-id="' + esc(s.id) + '"') + btn("scen-dl", "JSON", "small ghost", ' data-id="' + esc(s.id) + '"') +
          btn("scen-del", "Poista", "small ghost danger", ' data-id="' + esc(s.id) + '"') + "</span></li>").join("") + "</ul>";
      } else {
        h += '<p class="aia-note">Ei tallennettuja skenaarioita. Säädä painotuksia ja tallenna ne nimellä, niin voit verrata eri painotusten kärkilistoja.</p>';
      }
      const choices = [["current", "Nykyiset parametrit"], ["sim", "Simulointi (tallentamaton)"]].concat(S.scenarios.map((s) => [s.id, s.name]));
      const sel = (k, cur) => '<select data-cmp="' + k + '">' + choices.map((c) => '<option value="' + esc(c[0]) + '"' + (c[0] === cur ? " selected" : "") + ">" + esc(c[1]) + "</option>").join("") + "</select>";
      if (!choices.some((c) => c[0] === S.cmpA)) S.cmpA = "current";
      if (!choices.some((c) => c[0] === S.cmpB)) S.cmpB = "sim";
      const pool = simPool();
      const list = (k) => {
        const sp = scenParams(k);
        const items = ranked(sp.p, pool).slice(0, S.topN);
        return "<ol>" + items.map((it) => "<li>" + esc(it.c.name || "(nimetön)") + " <b>" + r0(it.e.prio) + "</b></li>").join("") + "</ol>";
      };
      h += '<h4 class="aia-sub">Vertaa kärkilistoja (' + S.topN + " parasta)</h4>" +
        '<div class="aia-cmp"><div><label class="aia-lbl">A ' + sel("A", S.cmpA) + "</label>" + list(S.cmpA) + "</div>" +
        '<div><label class="aia-lbl">B ' + sel("B", S.cmpB) + "</label>" + list(S.cmpB) + "</div></div>";
      el.innerHTML = h;
    }

    /* ---------- Parametrit ---------- */
    const CALC_FIELDS = [
      { k: "balance", label: "Vaikutuksen osuus prioriteetista (%)", min: 0, max: 100, step: 5, help: "Loput tulee toteutettavuudesta." },
      { k: "riskWeight", label: "Riskien painoarvo (pistettä)", min: 0, max: 50, step: 1, help: "Suurin vähennys, kun riskiryhmän arvot ovat 1." },
      { k: "starMultiplier", label: "Avainkriteerin kerroin", min: 1, max: 5, step: 0.5, help: "★-merkityn kriteerin paino kerrotaan tällä." },
      { k: "maxStars", label: "Avainkriteerejä enintään", min: 0, max: 5, step: 1, help: "" },
      { k: "impactThreshold", label: "Nelikentän raja: vaikutus", min: 10, max: 90, step: 5, help: "Tätä suurempi vaikutus = ylärivi." },
      { k: "effortThreshold", label: "Nelikentän raja: työmäärä", min: 10, max: 90, step: 5, help: "Tätä pienempi työmäärä = vasen sarake." },
      { k: "pen-keltainen", label: "Keltaisen tietosuojatason vähennys", min: 0, max: 100, step: 1, help: "" },
      { k: "pen-punainen", label: "Punaisen tietosuojatason vähennys", min: 0, max: 100, step: 1, help: "" },
      { k: "hourValue", label: "Työtunnin arvo (€/h)", min: 0, max: 1000, step: 1, help: "Käytetään hyöty–kustannus-suhteessa." }
    ];

    function renderParams() {
      const P = S.params;
      let h = '<p class="aia-lead">Parametrit määräävät, miten vastauksista lasketaan pisteet. Jakamalla saman parametritiedoston yksiköt arvioivat samoilla säännöillä.</p>';
      h += '<div class="aia-card"><h3>Parametritiedosto</h3><div class="aia-row2">' +
        field("Parametrien nimi", '<input type="text" id="' + ID + '-pname" data-p="name" maxlength="80" value="' + esc(P.name) + '">', "", ID + "-pname") + "<div></div></div>" +
        '<div class="aia-actions">' + btn("params-dl", "Lataa parametrit (JSON)", "primary") + btn("params-ul", "Tuo parametrit (JSON)") +
        btn("params-reset", "Palauta oletukset", "ghost") + "</div></div>";
      h += '<div class="aia-card"><h3>Kriteerit ja painot</h3><p class="aia-note">Paino 0 = kriteeri ei vaikuta. Ohjetekstejä ja uusia kriteerejä (enintään ' + MAX_CRITERIA +
        ") voi muokata ladatussa JSON-tiedostossa ja tuoda sen takaisin.</p>" +
        '<div class="aia-tablewrap"><table class="aia-table aia-ptable"><thead><tr><th scope="col">Kriteeri</th><th scope="col">Ryhmä</th><th scope="col">Paino</th></tr></thead><tbody>';
      P.criteria.forEach((cr, i) => {
        h += '<tr><td><input type="text" aria-label="Kriteerin nimi" data-cname="' + i + '" maxlength="80" value="' + esc(cr.name) + '"></td>' +
          '<td><select aria-label="Ryhmä" data-cgroup="' + i + '">' + Object.keys(GROUPS).map((g) => '<option value="' + g + '"' + (g === cr.group ? " selected" : "") + ">" + esc(GROUPS[g].label) + "</option>").join("") + "</select></td>" +
          '<td><select aria-label="Paino" data-cweight="' + i + '">' + [0, 0.5, 1, 1.5, 2, 2.5, 3].map((w) => '<option value="' + w + '"' + (w === cr.weight ? " selected" : "") + ">" + fiNum(w, 1) + "</option>").join("") + "</select></td></tr>";
      });
      h += "</tbody></table></div></div>";
      h += '<div class="aia-card"><h3>Laskenta</h3><div class="aia-calc">';
      CALC_FIELDS.forEach((f, i) => {
        h += field(f.label, '<input type="number" id="' + ID + "-pf" + i + '" data-p="' + f.k + '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + simGet(P, f.k) + '">', f.help, ID + "-pf" + i);
      });
      h += "</div>" +
        '<details class="aia-formula"><summary>Näin pisteet lasketaan</summary><ul>' +
        "<li>Jokainen vastaus 1–5 muunnetaan asteikolle 0–100. Ryhmän pisteet ovat painotettu keskiarvo (★ = paino × kerroin).</li>" +
        "<li><b>Vaikutus</b> = Hyödyt toiminnassa. <b>Toteutettavuus</b> = Toteutettavuus ja kustannukset. <b>Työmäärä</b> = 100 − toteutettavuus. <b>Riskitaso</b> = 100 − Riskit ja vastuullisuus.</li>" +
        "<li><b>Prioriteetti</b> = osuus × vaikutus + (1 − osuus) × toteutettavuus − riskien painoarvo × riskitaso / 100 − tietosuojatason vähennys (0–100).</li>" +
        "<li><b>Hyöty / kustannus</b> = säästetyt tunnit × 12 × työtunnin arvo / vuosikustannus.</li></ul></details></div>";
      panel("parametrit").innerHTML = h;
    }

    function setParams(next, note) {
      S.params = next; S.sim = clone(next); S.evalStale = true; saveParams();
      if (note) msg(note, "ok");
    }

    function editParams(mut) {
      const cand = clone(S.params);
      mut(cand);
      try { setParams(normalizeParams(cand, DEF)); msg("Parametrit päivitetty.", "ok"); return true; }
      catch (err) { msg(err.message, "error"); renderParams(); return false; }
    }

    /* ---------- Tuonti ---------- */
    function importJson(text, target) {
      let obj;
      try { obj = JSON.parse(text); } catch (e) { msg("Tiedosto ei ole kelvollista JSONia: " + e.message, "error"); return; }
      if (obj && obj.type === PARAM_TYPE) {
        try { setParams(normalizeParams(obj, DEF), "Parametrit tuotu: " + (obj.name || "nimetön") + "."); }
        catch (err) { msg("Parametreja ei tuotu: " + err.message + " Nykyiset parametrit säilyivät.", "error"); }
        showTab(S.tab); return;
      }
      let list;
      if (Array.isArray(obj)) list = obj;
      else if (obj && Array.isArray(obj.cases)) list = obj.cases;
      else if (obj && typeof obj === "object" && (obj.name != null || obj.scores)) list = [obj];
      else { msg("Tiedostosta ei löytynyt arviointeja eikä parametreja.", "error"); return; }
      let added = 0, updated = 0, skipped = 0;
      const ids = [];
      list.forEach((raw) => {
        if (!raw || typeof raw !== "object") { skipped++; return; }
        const c = fixCase(raw);
        ids.push(c.id);
        const i = S.cases.findIndex((x) => x.id === c.id);
        if (i < 0) { S.cases.push(c); added++; }
        else if (c.updated > S.cases[i].updated) { S.cases[i] = c; updated++; }
        else skipped++;
      });
      const stored = saveCases(); updateCount();
      let note = "Tuotu: " + added + " uutta, " + updated + " päivitettyä" + (skipped ? ", " + skipped + " ennallaan (sama tai vanhempi versio)" : "") + ".";
      if (!stored) note += " Huom: selain esti tallennuksen, tiedot ovat tallessa vain tämän sivun ollessa auki.";
      if (obj && obj.params && JSON.stringify(obj.params) !== JSON.stringify(S.params)) {
        if (global.confirm("Tiedostossa on myös arvioinnin parametrit (\"" + (obj.params.name || "nimetön") + "\").\nOtetaanko ne käyttöön?\n\nPeruuta = säilytä nykyiset parametrit.")) {
          try { setParams(normalizeParams(obj.params, DEF)); note += " Parametrit otettiin käyttöön."; }
          catch (err) { note += " Parametreja ei voitu ottaa käyttöön: " + err.message; }
        }
      }
      msg(note, "ok");
      if (ids.length === 1) {
        if (openCase(ids[0], "arvioi")) msg(note + " Arviointi avattiin.", "ok");
        else showTab(S.tab);
      } else if (ids.length > 1) {
        S.sel = ranked(S.params, S.cases.filter((c) => ids.indexOf(c.id) >= 0)).slice(0, MAX_SEL).map((it) => it.c.id);
        db.set("sel", S.sel);
        S.evalStale = true;
        showTab(target === "one" ? "yhteenveto" : (S.tab === "arvioi" ? "yhteenveto" : S.tab));
      }
    }

    /* ---------- Viennit ---------- */
    const today = () => isoDay(new Date());
    const fname = (list, ext) => "ai-arviointi-" + (list.length === 1 ? slug(list[0].name) : "kaikki") + "-" + today() + "." + ext;

    function exportJson(list) {
      const data = { type: DATA_TYPE, version: VERSION, exported: new Date().toISOString(), org: o.org, params: S.params, cases: list };
      download(fname(list, "json"), JSON.stringify(data, null, 2), "application/json");
    }

    function exportCsv(list) {
      const P = S.params;
      const safe = (v) => { const s = v == null ? "" : String(v); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; };
      const cell = (v) => { const s = safe(v); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const head = ["Käyttötapauksen nimi", CENTER_LBL, "Yksikkö", "Omistaja", "Tyyppi", "Ongelma ja tavoite", "Miten tekoäly auttaa", "Tila",
        "Tietosuoja", "Jory-huomio", "Prioriteetti", "Vaikutus", "Toteutettavuus", "Työmäärä", "Riskitaso", "Nelikenttä", "Suositus",
        "Säästö h/kk", "Kustannus €/v", "Hyöty/kustannus"].concat(P.criteria.map((c) => c.name)).concat(["Avainkriteerit", "Parametrit", "Päivitetty", "Tunniste"]);
      const rows = ranked(P, list).map(({ c, e }) => [c.name, c.center, c.unit, c.owner, c.type, c.problem, c.aiHelp, c.status,
        (privacyOf(c.privacy) || {}).label || "", c.jory ? "Kyllä" : "Ei", r0(e.prio), r0(e.impact), r0(e.feas), r0(e.effort), r0(e.risk),
        e.quad.label, e.recs.join(" "), c.hours, c.cost, e.ratio == null ? "" : fiNum(e.ratio, 1)]
        .concat(P.criteria.map((cr) => (c.scores[cr.id] == null ? "" : c.scores[cr.id])))
        .concat([P.criteria.filter((cr) => c.stars.indexOf(cr.id) >= 0).map((cr) => cr.name).join(", "), P.name, c.updated.slice(0, 10), c.id]));
      const text = "﻿" + [head].concat(rows).map((r) => r.map(cell).join(";")).join("\r\n");
      download(fname(list, "csv"), text, "text/csv;charset=utf-8");
    }

    function roadmapBlock(c) {
      const e = evaluate(c, S.params);
      const one = (s) => String(s || "").replace(/\s+/g, " ").trim();
      return ["###",
        "- Käyttötapauksen nimi: " + one(c.name),
        "- Palvelualue: " + one(c.center),
        "- Yksikkö: " + one(c.unit),
        "- Tila: " + one(c.status),
        "- Tyyppi: " + one(c.type),
        "- Vaikuttavuus: " + e.quad.label,
        "- Tietosuoja: " + ((privacyOf(c.privacy) || {}).label || ""),
        "- Jory: " + (c.jory ? "Kyllä" : "Ei"),
        "- Prioriteetti: " + r0(e.prio),
        "- Kuvaus: " + one(c.problem),
        "- Planner: "].join("\n");
    }

    function exportPdf(list, heading, keepOrder) {
      const P = S.params, multi = list.length > 1;
      const items = keepOrder ? list.map((c) => ({ c, e: evaluate(c, P) })) : ranked(P, list);
      const colors = (i) => (keepOrder && i < MAX_SEL ? SEL_COLORS[i] : null);
      const head = '<header class="aia-ph"><span>' + esc(o.org) + " · " + esc(o.title) + "</span><span>" + fiDate(new Date()) + "</span></header>";
      const lastCol = showStatus ? "Tila" : "Tietosuoja";
      const lastVal = (c) => (showStatus ? c.status : ((privacyOf(c.privacy) || {}).label || "–"));
      let h = "";
      if (multi) {
        const top = items.slice(0, MAX_SEL);
        h += '<section class="aia-pp">' + head + "<h1>" + esc(heading) + "</h1><p>" + items.length + " käyttötapausta · parametrit: " + esc(P.name) + "</p>" +
          '<div class="aia-pgrid"><div>' + quadrantSvg(items.map((it, i) => ({ x: it.e.effort, y: it.e.impact, n: i + 1, c: colors(i) || dotColor(it.c, it.e) })), P) +
          radarSvg(top.map((it, i) => ({ color: SEL_COLORS[i], name: (i + 1) + ". " + it.c.name, vals: radarVals(it.c, it.e) }))) +
          '<ul class="aia-legend">' + top.map((it, i) => '<li><i style="background:' + SEL_COLORS[i] + '"></i>' + (i + 1) + ". " + esc(it.c.name) + "</li>").join("") + "</ul></div>" +
          '<table class="aia-ptab"><thead><tr><th>#</th><th>Käyttötapaus</th><th>Prio</th><th>Vaik.</th><th>Työm.</th><th>' + lastCol + "</th></tr></thead><tbody>" +
          items.map((it, i) => "<tr><td>" + (i + 1) + "</td><td>" + esc(it.c.name) + "<br><small>" + esc(it.c.center) + "</small></td><td><b>" + r0(it.e.prio) + "</b></td><td>" +
            r0(it.e.impact) + "</td><td>" + r0(it.e.effort) + "</td><td>" + esc(lastVal(it.c)) + "</td></tr>").join("") + "</tbody></table></div></section>";
      }
      items.forEach((it, i) => {
        const c = it.c, e = it.e, pr = privacyOf(c.privacy);
        h += '<section class="aia-pp">' + head + "<h1>" + (multi ? (i + 1) + ". " : "") + esc(c.name || "(nimetön)") + "</h1>" +
          '<p class="aia-pmeta">' + esc([c.center, c.unit, c.type, showStatus ? "Tila: " + c.status : ""].filter(Boolean).join(" · ")) + "</p>" +
          '<div class="aia-pscores">' + [["Prioriteetti", e.prio], ["Vaikutus", e.impact], ["Toteutettavuus", e.feas], ["Työmäärä", e.effort], ["Riskitaso", e.risk]]
            .map((b) => "<div><b>" + r0(b[1]) + "</b><span>" + b[0] + "</span></div>").join("") + "</div>" +
          '<div class="aia-pgrid"><div>' +
          "<h3>Ongelma ja tavoite</h3><p>" + esc(c.problem || "–") + "</p>" +
          "<h3>Miten tekoäly auttaa</h3><p>" + esc(c.aiHelp || "–") + "</p>" +
          "<p><b>Omistaja:</b> " + esc(c.owner || "–") + "<br><b>Tietosuoja:</b> " + esc(pr ? pr.label + " (" + pr.desc + ")" : "–") +
          (showJory ? "<br><b>Jory-huomio:</b> " + (c.jory ? "Kyllä" : "Ei") : "") + "<br><b>Nelikenttä:</b> " + esc(e.quad.label) +
          (e.benefit > 0 || e.cost > 0 ? "<br><b>Hyöty–kustannus:</b> " + fiNum(e.benefit) + " € / " + fiNum(e.cost) + " €" + (e.ratio != null ? " (" + fiNum(e.ratio, 1) + "×)" : "") : "") + "</p>" +
          "<h3>Suositus</h3><ul>" + e.recs.map((r) => "<li>" + esc(r) + "</li>").join("") + "</ul></div>" +
          "<div>" + quadrantSvg([{ x: e.effort, y: e.impact, n: "", c: e.quad.c }], P) + radarSvg(radarVals(c, e)) + "</div></div>" +
          '<table class="aia-ptab"><thead><tr><th>Kriteeri</th><th>Ryhmä</th><th>Arvo</th><th>Paino</th></tr></thead><tbody>' +
          P.criteria.map((cr) => "<tr><td>" + esc(cr.name) + "</td><td>" + esc(GROUPS[cr.group].label) + "</td><td>" + (c.scores[cr.id] == null ? "–" : c.scores[cr.id] + " / 5") +
            "</td><td>" + fiNum(cr.weight, 1) + (c.stars.indexOf(cr.id) >= 0 ? " ★ ×" + fiNum(P.starMultiplier, 1) : "") + "</td></tr>").join("") +
          "</tbody></table><p class=\"aia-pfoot\">Parametrit: " + esc(P.name) + " · päivitetty " + esc(c.updated.slice(0, 10)) + "</p></section>";
      });
      const node = document.createElement("div");
      node.className = "aia-print";
      node.innerHTML = h;
      document.body.appendChild(node);
      document.body.classList.add("aia-printing");
      const done = () => { document.body.classList.remove("aia-printing"); node.remove(); };
      global.addEventListener("afterprint", done, { once: true });
      setTimeout(() => global.print(), 60);
      msg("Valitse tulostusikkunasta \"Tallenna PDF-tiedostona\".", "ok");
    }

    async function exportPptx(list, keepOrder) {
      msg("Luodaan PowerPoint-esitystä…");
      try {
        if (!global.PptxGenJS) await loadScript(o.pptxUrl);
        const P = S.params, F = o.font;
        const items = keepOrder ? list.map((c) => ({ c, e: evaluate(c, P) })) : ranked(P, list);
        const hex = (s) => String(s).replace("#", "").toUpperCase();
        const p = new global.PptxGenJS();
        p.layout = "LAYOUT_WIDE"; p.title = o.title; p.company = o.org;
        const header = (s, t) => {
          s.addText(t, { x: 0.5, y: 0.3, w: 12.3, h: 0.7, fontFace: F, fontSize: 24, bold: true, color: "DE232F", fit: "shrink" });
          s.addText(o.org + " · " + o.title + " · " + fiDate(new Date()), { x: 0.5, y: 7.0, w: 12.3, h: 0.3, fontFace: F, fontSize: 9, color: "5B5D66" });
        };
        const quad = (s, x, y, size, pts) => {
          const lw = size * P.effortThreshold / 100, th = size * (1 - P.impactThreshold / 100);
          [[x, y, lw, th], [x + lw, y, size - lw, th], [x, y + th, lw, size - th], [x + lw, y + th, size - lw, size - th]].forEach((r, i) => {
            if (r[2] <= 0.01 || r[3] <= 0.01) return;
            const q = QUADS[i];
            s.addShape("rect", { x: r[0], y: r[1], w: r[2], h: r[3], fill: { color: hex(q.c), transparency: 80 }, line: { color: "FFFFFF", width: 1.5 } });
            s.addText(q.label, { x: r[0] + 0.05, y: i < 2 ? r[1] + 0.05 : r[1] + r[3] - 0.55, w: Math.max(r[2] - 0.1, 0.4), h: 0.5, fontFace: F, fontSize: 9, bold: true,
              color: "1D1D1F", valign: i < 2 ? "top" : "bottom", align: i % 2 ? "right" : "left", margin: 2 });
          });
          s.addText("Työmäärä →", { x, y: y + size + 0.03, w: size, h: 0.3, fontFace: F, fontSize: 10, color: "5B5D66", align: "center" });
          s.addText("Vaikutus →", { x: x - 0.25 - size / 2, y: y + size / 2 - 0.15, w: size, h: 0.3, fontFace: F, fontSize: 10, color: "5B5D66", align: "center", rotate: 270 });
          pts.forEach((pt) => {
            const d = pt.n === "" ? 0.28 : 0.34;
            const px = clamp(x + size * pt.x / 100, x + d / 2, x + size - d / 2), py = clamp(y + size * (1 - pt.y / 100), y + d / 2, y + size - d / 2);
            s.addShape("ellipse", { x: px - d / 2, y: py - d / 2, w: d, h: d, fill: { color: hex(pt.c) }, line: { color: "FFFFFF", width: 1.5 } });
            if (pt.n !== "") s.addText(String(pt.n), { x: px - d / 2, y: py - d / 2, w: d, h: d, fontFace: F, fontSize: 10, bold: true, color: pt.c === "#fcb316" ? "1D1D1F" : "FFFFFF", align: "center", valign: "middle", margin: 0 });
          });
        };
        const ptColor = (it, i) => (keepOrder && i < MAX_SEL ? SEL_COLORS[i] : dotColor(it.c, it.e));

        let s = p.addSlide();
        s.background = { color: "DE232F" };
        s.addText(o.title, { x: 0.7, y: 2.3, w: 11.9, h: 1.2, fontFace: F, fontSize: 40, bold: true, color: "FFFFFF" });
        s.addText(o.org + " · " + fiDate(new Date()) + " · " + items.length + " käyttötapaus" + (items.length === 1 ? "" : "ta") + " · parametrit: " + P.name,
          { x: 0.7, y: 3.6, w: 11.9, h: 0.6, fontFace: F, fontSize: 18, color: "FFFFFF" });

        if (items.length > 1) {
          s = p.addSlide(); header(s, keepOrder ? "Valitut käyttötapaukset" : "Prioriteettijärjestys");
          const hdr = ["#", "Käyttötapaus", CENTER_LBL, "Prioriteetti", "Vaikutus", "Työmäärä", "Nelikenttä", showStatus ? "Tila" : "Tietosuoja"]
            .map((t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: "28336C" } } }));
          const rows = [hdr].concat(items.slice(0, 13).map((it, i) => [String(i + 1), it.c.name, it.c.center, String(r0(it.e.prio)), String(r0(it.e.impact)),
            String(r0(it.e.effort)), it.e.quad.label, showStatus ? it.c.status : ((privacyOf(it.c.privacy) || {}).label || "–")]));
          s.addTable(rows, { x: 0.5, y: 1.15, w: 12.3, colW: [0.5, 4.0, 1.9, 1.1, 1.0, 1.0, 1.8, 1.0], fontFace: F, fontSize: 10, valign: "middle",
            border: { type: "solid", pt: 0.5, color: "E4E4E8" }, autoPage: false });
          if (items.length > 13) s.addText("+ " + (items.length - 13) + " muuta (katso CSV/PDF)", { x: 0.5, y: 6.6, w: 6, h: 0.3, fontFace: F, fontSize: 10, color: "5B5D66" });

          s = p.addSlide(); header(s, "Salkkunäkymä: vaikutus ja työmäärä");
          quad(s, 1.0, 1.2, 5.4, items.map((it, i) => ({ x: it.e.effort, y: it.e.impact, n: i + 1, c: ptColor(it, i) })));
          s.addText(items.slice(0, 16).map((it, i) => ({ text: (i + 1) + ". " + it.c.name + "  (" + r0(it.e.prio) + ")", options: { breakLine: true } })),
            { x: 7.2, y: 1.2, w: 5.6, h: 5.4, fontFace: F, fontSize: 11, color: "1D1D1F", valign: "top", fit: "shrink" });
        }

        items.forEach((it, i) => {
          const c = it.c, e = it.e, pr = privacyOf(c.privacy);
          s = p.addSlide();
          header(s, (items.length > 1 ? (i + 1) + ". " : "") + (c.name || "(nimetön)"));
          s.addText([c.center, c.unit, c.type].filter(Boolean).join(" · ") + (showStatus ? "   |   Tila: " + c.status : ""), { x: 0.5, y: 0.95, w: 12.3, h: 0.4, fontFace: F, fontSize: 13, color: "28336C" });
          [["Prioriteetti", e.prio, "DE232F"], ["Vaikutus", e.impact, "009651"], ["Työmäärä", e.effort, "E64925"], ["Riskitaso", e.risk, "28336C"]].forEach((b, k) => {
            const bx = 0.5 + k * 1.75;
            s.addShape("rect", { x: bx, y: 1.5, w: 1.6, h: 1.0, fill: { color: "F6F5F3" }, line: { color: b[2], width: 2 } });
            s.addText([{ text: String(r0(b[1])), options: { fontSize: 26, bold: true, color: b[2], breakLine: true } }, { text: b[0], options: { fontSize: 11, color: "5B5D66" } }],
              { x: bx, y: 1.5, w: 1.6, h: 1.0, fontFace: F, align: "center", valign: "middle" });
          });
          const runs = [];
          const para = (t, v) => {
            if (!v) return;
            runs.push({ text: t, options: { bold: true, color: "28336C", breakLine: true } });
            runs.push({ text: v, options: { breakLine: true } });
            runs.push({ text: " ", options: { fontSize: 5, breakLine: true } });
          };
          para("Ongelma ja tavoite", c.problem); para("Miten tekoäly auttaa", c.aiHelp); para("Suositus", e.recs.join(" "));
          para("Lisätiedot", "Omistaja: " + (c.owner || "–") + " · Tietosuoja: " + (pr ? pr.label : "–") + (showJory ? " · Jory-huomio: " + (c.jory ? "Kyllä" : "Ei") : "") +
            (e.ratio != null ? " · Hyöty/kustannus " + fiNum(e.ratio, 1) + "×" : ""));
          s.addText(runs, { x: 0.5, y: 2.7, w: 6.9, h: 4.2, fontFace: F, fontSize: 12, color: "1D1D1F", valign: "top", fit: "shrink" });
          quad(s, 8.4, 1.5, 4.4, [{ x: e.effort, y: e.impact, n: "", c: e.quad.c }]);
        });
        await p.writeFile({ fileName: fname(list, "pptx") });
        msg("PowerPoint ladattu.", "ok");
      } catch (err) { msg("PowerPointin luonti epäonnistui: " + err.message, "error"); console.error(err); }
    }

    function runExport(kind, list, heading, keepOrder) {
      if (!list.length) { msg("Ei vietäviä arviointeja.", "error"); return; }
      if (kind === "pdf") exportPdf(list, heading, keepOrder);
      else if (kind === "pptx") exportPptx(list, keepOrder);
      else if (kind === "csv") { exportCsv(list); msg("CSV ladattu.", "ok"); }
      else { exportJson(list); msg("JSON ladattu.", "ok"); }
    }

    function setScore(i, v) {
      const cr = S.params.criteria[i]; if (!cr) return;
      S.draft.scores[cr.id] = v;
      const pnl = panel("arvioi");
      const out = pnl.querySelector('[data-out="' + i + '"]'); if (out) out.textContent = v;
      const rg = pnl.querySelector('[data-score="' + i + '"]'); if (rg) { if (+rg.value !== v) rg.value = v; rg.setAttribute("aria-valuetext", String(v)); }
      pnl.querySelectorAll('[data-step="' + i + '"]').forEach((b) => b.classList.toggle("on", +b.dataset.v === v));
      touch();
    }

    /* ---------- Tapahtumat ---------- */
    root.addEventListener("click", async (ev) => {
      const t = ev.target;
      if (t === dialog) { dialog.close(); return; }   // taustan klikkaus sulkee
      const tab = t.closest("[data-tab]");
      if (tab) { showTab(tab.dataset.tab); return; }
      const step = t.closest("[data-step]");
      if (step) { setScore(+step.dataset.step, +step.dataset.v); return; }
      const star = t.closest("[data-star]");
      if (star) {
        const cr = S.params.criteria[+star.dataset.star]; if (!cr) return;
        const c = S.draft, i = c.stars.indexOf(cr.id);
        if (i >= 0) c.stars.splice(i, 1);
        else {
          const active = c.stars.filter((id) => S.params.criteria.some((x) => x.id === id));
          if (active.length >= S.params.maxStars) { msg("Voit valita enintään " + S.params.maxStars + " avainkriteeriä. Poista ensin jokin valinta.", "warn"); return; }
          c.stars.push(cr.id);
        }
        star.setAttribute("aria-pressed", String(c.stars.indexOf(cr.id) >= 0));
        touch(); return;
      }
      const sortB = t.closest("[data-sort]");
      if (sortB) {
        const k = sortB.dataset.sort;
        if (S.sortKey === k) S.sortDir = -S.sortDir; else { S.sortKey = k; S.sortDir = k === "rank" || k === "name" || k === "effort" || k === "risk" || k === "status" ? 1 : -1; }
        updateSim(); return;
      }
      const b = t.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act, id = b.dataset.id;
      const find = () => S.cases.find((c) => c.id === id);
      switch (act) {
        case "goto-arvioi": showTab("arvioi"); break;
        case "goto-omat": showTab("omat"); break;
        case "type-info":
          if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
          break;
        case "dialog-close":
          if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
          break;
        case "pick-type": {
          S.draft.type = b.dataset.type;
          const sel = panel("arvioi").querySelector("#" + ID + "-type"); if (sel) sel.value = S.draft.type;
          if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
          touch(); break;
        }
        case "save": {
          if (!validate(true)) { msg("Arviointia ei tallennettu: täytä pakolliset tiedot.", "error"); break; }
          const ok = storeCase(S.draft);
          msg(ok ? "Tallennettu selaimeesi: " + S.draft.name + "." : "Selain esti tallennuksen. Lataa arviointi JSON-tiedostona.", ok ? "ok" : "warn");
          break;
        }
        case "save-new": {
          if (!validate(true)) { msg("Arviointia ei tallennettu: täytä pakolliset tiedot.", "error"); break; }
          const d = clone(S.draft); d.id = uid(); d.name = S.draft.name + " (kopio)"; d.created = new Date().toISOString();
          S.draft = d;
          const ok = storeCase(S.draft);
          const n = panel("arvioi").querySelector("#" + ID + "-name"); if (n) n.value = d.name;
          msg((ok ? "Tallennettu uutena: " : "Luotu uutena (ei tallentunut selaimeen): ") + d.name + ". Voit nyt muuttaa nimeä ja tietoja.", ok ? "ok" : "warn");
          break;
        }
        case "new":
          if (S.dirty && !global.confirm("Hylätäänkö tallentamattomat muutokset?")) break;
          S.draft = newCase(); S.dirty = false; S.ui.lastSaved = null; S.ui.saveWarn = ""; saveDraft(); renderEval();
          { const n = root.querySelector("#" + ID + "-name"); if (n) n.focus(); }
          break;
        case "copy-block": {
          const text = roadmapBlock(S.draft);
          const ok = await copyText(text);
          const el = panel("arvioi").querySelector("[data-block]");
          el.innerHTML = '<p class="aia-note">' + (ok ? "Kopioitu leikepöydälle." : "Kopioi alla oleva teksti.") +
            " Liitä se <code>content/tiekartta.md</code>-tiedostoon otsikon <code>## Käyttötapaukset</code> alle ja lisää Planner-linkki.</p><pre class=\"aia-pre\">" + esc(text) + "</pre>";
          msg(ok ? "Tiekarttalohko kopioitu." : "Kopiointi ei onnistunut automaattisesti, kopioi teksti käsin.", ok ? "ok" : "warn");
          break;
        }
        case "pdf-one": case "pptx-one": case "csv-one": case "json-one":
          if (!S.draft.name.trim()) { msg("Anna käyttötapaukselle nimi ensin.", "error"); break; }
          runExport(act.split("-")[0], [S.draft], S.draft.name); break;
        case "pdf-list": case "pptx-list": case "csv-list": case "json-list":
          runExport(act.split("-")[0], filtered(), "AI-käyttötapausten salkku"); break;
        case "pdf-sel": case "pptx-sel": case "csv-sel": case "json-sel":
          runExport(act.split("-")[0], selCases(), "AI-käyttötapausten vertailu", true); break;
        case "import": case "params-ul": case "import-one":
          S.importTarget = act === "import-one" ? "one" : "";
          fileInput.value = ""; fileInput.click(); break;
        case "open":
          if (openCase(id)) root.scrollIntoView({ behavior: "smooth", block: "start" });
          break;
        case "dup": {
          const c = find(); if (!c) break;
          const d = clone(c); d.id = uid(); d.name = c.name + " (kopio)"; d.created = d.updated = new Date().toISOString();
          S.cases.push(d); saveCases(); updateCount(); renderList(); msg("Monistettu: " + d.name + ".", "ok");
          break;
        }
        case "del": {
          const c = find(); if (!c) break;
          if (!global.confirm("Poistetaanko arviointi \"" + c.name + "\" tästä selaimesta?")) break;
          S.cases = S.cases.filter((x) => x.id !== id); saveCases(); updateCount();
          if (S.draft.id === id) { S.dirty = true; saveDraft(); S.evalStale = true; }
          renderList(); msg("Poistettu.", "ok");
          break;
        }
        case "sim-apply":
          setParams(normalizeParams(S.sim, DEF), "Simuloidut painotukset otettiin käyttöön parametreiksi.");
          renderSim(); break;
        case "sim-reset": S.sim = clone(S.params); renderSim(); break;
        case "scen-save": {
          const inp = root.querySelector("#" + ID + "-scen");
          const name = (inp && inp.value.trim()) || "Skenaario " + (S.scenarios.length + 1);
          const sp = clone(S.sim); sp.name = name;
          const ex = S.scenarios.find((x) => x.name === name);
          if (ex) { ex.params = sp; ex.saved = new Date().toISOString(); }
          else S.scenarios.push({ id: uid(), name, params: sp, saved: new Date().toISOString() });
          saveScen(); if (inp) inp.value = ""; renderScenarios(); msg("Skenaario tallennettu: " + name + ".", "ok");
          break;
        }
        case "scen-load": {
          const sc = S.scenarios.find((x) => x.id === id); if (!sc) break;
          try { S.sim = normalizeParams(sc.params, S.params); } catch (err) { msg(err.message, "error"); break; }
          S.cmpB = "sim"; renderSim(); msg("Skenaario ladattu simulointiin: " + sc.name + ".", "ok");
          break;
        }
        case "scen-dl": {
          const sc = S.scenarios.find((x) => x.id === id); if (!sc) break;
          download("ai-arviointi-parametrit-" + slug(sc.name) + ".json", JSON.stringify(Object.assign({}, sc.params, { name: sc.name }), null, 2), "application/json");
          break;
        }
        case "scen-del":
          S.scenarios = S.scenarios.filter((x) => x.id !== id); saveScen(); renderScenarios(); break;
        case "params-dl":
          download("ai-arviointi-parametrit-" + slug(S.params.name) + ".json", JSON.stringify(S.params, null, 2), "application/json");
          msg("Parametrit ladattu.", "ok"); break;
        case "params-reset":
          if (!global.confirm("Palautetaanko oletusparametrit? Nykyiset painot ja kriteerimuutokset korvataan.")) break;
          setParams(clone(DEF), "Oletusparametrit palautettu."); renderParams(); break;
      }
    });

    root.addEventListener("input", (ev) => {
      const t = ev.target;
      if (t.dataset.score != null) { setScore(+t.dataset.score, +t.value); return; }
      const f = t.dataset.f;
      if (f === "centerText") { S.draft.center = t.value; touch(); return; }
      if (f === "unitText") { S.draft.unit = t.value; touch(); return; }
      if (f && (t.tagName === "TEXTAREA" || t.type === "text" || t.type === "number")) {
        S.draft[f] = t.type === "number" ? (t.value === "" ? "" : Math.max(0, Number(t.value))) : t.value;
        if (t.tagName === "TEXTAREA") { const cn = panel("arvioi").querySelector('[data-counter="' + f + '"]'); if (cn) cn.textContent = t.value.length + " / 200"; }
        touch(); return;
      }
      if (t.dataset.sim) {
        simSet(S.sim, t.dataset.sim, +t.value);
        const s = SIM_SLIDERS.find((x) => x.k === t.dataset.sim);
        const out = panel("vertailu").querySelector('[data-simout="' + t.dataset.sim + '"]'); if (out && s) out.textContent = s.fmt(+t.value);
        updateSim();
      }
    });

    root.addEventListener("change", (ev) => {
      const t = ev.target;
      if (t === fileInput) {
        const file = fileInput.files && fileInput.files[0]; if (!file) return;
        const target = S.importTarget;
        const rd = new FileReader();
        rd.onload = () => importJson(String(rd.result || ""), target);
        rd.onerror = () => msg("Tiedoston lukeminen epäonnistui.", "error");
        rd.readAsText(file, "utf-8");
        return;
      }
      if (t.matches("[data-open]")) { if (t.value) openCase(t.value); return; }
      if (t.dataset.f) {
        const k = t.dataset.f, pnl = panel("arvioi"), u = S.ui;
        if (k === "jory") S.draft.jory = t.checked;
        else if (k === "privacy") S.draft.privacy = t.value;
        else if (k === "center") {
          const txt = pnl.querySelector("#" + ID + "-centertext");
          u.centerOther = t.value === OTHER;
          S.draft.center = u.centerOther ? (txt ? txt.value.trim() : "") : t.value;
          if (txt) txt.hidden = !u.centerOther;
          S.draft.unit = ""; u.unitOther = false;
          pnl.querySelector("[data-unitwrap]").innerHTML = unitFieldHtml();
          if (u.centerOther && txt) txt.focus();
        } else if (k === "unit") {
          const txt = pnl.querySelector("#" + ID + "-unittext");
          u.unitOther = t.value === OTHER;
          S.draft.unit = u.unitOther ? (txt ? txt.value.trim() : "") : t.value;
          if (txt) { txt.hidden = !u.unitOther; if (u.unitOther) txt.focus(); }
          pnl.querySelector("[data-unitwrap] .aia-lbl").innerHTML = "Yksikkö" + (unitRequired(S.draft) ? " " + reqMark : "");
        } else if (t.tagName === "SELECT") S.draft[k] = t.value;
        else return;
        touch(); return;
      }
      if (t.dataset.filt) { S.filt[t.dataset.filt] = t.value; renderList(); return; }
      if (t.matches("[data-yfilt]")) { S.yfilt = t.value; renderSummary(); return; }
      if (t.dataset.ysel) {
        const sel = selection(), i = sel.indexOf(t.dataset.ysel);
        if (t.checked && i < 0) { if (sel.length >= MAX_SEL) { t.checked = false; msg("Voit valita enintään " + MAX_SEL + " käyttötapausta.", "warn"); return; } sel.push(t.dataset.ysel); }
        else if (!t.checked && i >= 0) sel.splice(i, 1);
        S.sel = sel; db.set("sel", sel); renderSummary(); return;
      }
      if (t.dataset.opt === "openOnly") { S.openOnly = t.checked; updateSim(); return; }
      if (t.dataset.opt === "topN") { S.topN = +t.value; updateSim(); return; }
      if (t.dataset.cmp) { if (t.dataset.cmp === "A") S.cmpA = t.value; else S.cmpB = t.value; renderScenarios(); return; }
      if (t.dataset.p) {
        const k = t.dataset.p;
        editParams((P) => { if (k === "name") P.name = t.value.trim() || "Nimetön"; else simSet(P, k, Number(t.value)); });
        if (CALC_FIELDS.some((x) => x.k === k)) t.value = simGet(S.params, k);
        return;
      }
      if (t.dataset.cname != null) { editParams((P) => { P.criteria[+t.dataset.cname].name = t.value.trim() || P.criteria[+t.dataset.cname].id; }); return; }
      if (t.dataset.cgroup != null) { editParams((P) => { P.criteria[+t.dataset.cgroup].group = t.value; }); return; }
      if (t.dataset.cweight != null) { editParams((P) => { P.criteria[+t.dataset.cweight].weight = Number(t.value); }); }
    });

    root.addEventListener("keydown", (ev) => {
      const tab = ev.target.closest && ev.target.closest("[data-tab]");
      if (!tab || (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft")) return;
      const i = TABS.findIndex((x) => x.id === tab.dataset.tab);
      const n = TABS[(i + (ev.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
      ev.preventDefault(); showTab(n.id, true);
    });

    updateCount();
    showTab(S.tab);

    return {
      getCases: () => clone(S.cases),
      getParams: () => clone(S.params),
      evaluate: (c, p) => evaluate(fixCase(c), p ? normalizeParams(p, DEF) : S.params)
    };
  }

  global.AIArviointi = { mount, evaluate: (c, p) => evaluate(fixCase(c), normalizeParams(p || {}, BASE_PARAMS)), normalizeParams, defaults: () => clone(BASE_PARAMS), version: VERSION };
})(window);
