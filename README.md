# AI-lähettiläät 2027 – Kangasala

Kangasalan kaupungin AI-lähettiläiden koulutuskokonaisuus ja AI-tiekartan seuranta.

Sivusto: https://kangasalakehitys.github.io/ai-lahettilaat/

## Sisällön päivittäminen

Sivusto lukee sisällön suoraan `content/`-kansion tiedostoista. Muokkaa tiedostoa GitHubissa (kynä-ikoni → *Commit changes*), niin sivu päivittyy noin minuutissa. Koodia ei tarvitse muuttaa.

| Tiedosto | Mitä se sisältää |
|---|---|
| `content/kuukausiohjelma.md` | Kuukausien teemat, kuvaukset ja materiaalit (kalenteri) sekä alaosan linkit |
| `content/tiekartta.md` | Tiekartan johdanto ja tavoitteet sekä `## Käyttötapaukset` |
| `content/tyokalu.md` | Arviointityökalun esittelyteksti (näkyy työkalun yläpuolella) |
| `content/lahettilaat.xlsx` | Lähettiläät: yksi rivi per lähettiläs, sarakkeessa A palvelualue (otsikkorivi "Palvelualue"). Sivu näyttää määrät palvelualueittain. Pidä tiedostossa vain sarake A, koska tiedosto on julkisesti ladattavissa. |

### Kuukausiohjelma

- Uusi kuukausi alkaa rivillä `## kuukausi - Otsikko` (esim. `## lokakuu - Tekoäly ja asiakaspalvelu`).
- Ensimmäinen kappale on kuukauden kuvaus.
- Materiaalit kirjoitetaan otsikoiden `#### Maksuttomat` ja `#### Maksulliset` alle:
  - linkki omalle rivilleen: `[Linkin nimi](https://osoite)`
  - pelkkä tekstirivi = väliotsikko (esim. `Copilot ja agentit`)
  - `- teksti` = lisähuomio
- Valinnaiset rivit kuukauden kuvauksen alle:
  - `Tapaaminen: 14.1.2027 klo 13–14, Teams` (korvaa automaattisen päivämäärän, joka on kuukauden 2. torstai)
  - `Tila: valmis` / `Tila: käynnissä` / `Tila: tulossa` (muuten tila päätellään päivämäärästä)
- Muut `##`-otsikot (esim. `## Kansainväliset`) näkyvät sivun alaosan linkkilaatikoina.

### Tiekartan käyttötapaukset

Lisää `## Käyttötapaukset` -otsikon alle yksi lohko jokaista käyttötapausta kohti:

```
###
- Käyttötapauksen nimi: Rakennuslupien neuvonta-agentti
- Palvelualue: Tekninen keskus
- Yksikkö: Rakennusvalvonta
- Tila: Työn alla
- Tyyppi: Sisällöntuotanto
- Vaikuttavuus: Korkea ROI(€)
- Planner: https://...
```

- **Tila:** Ideat | Arvioinnissa | Työn alla | Testauksessa | Tuotannossa | Hylätty / Odottaa
- **Tyyppi:** Sisällöntuotanto | Tutkimus | Koodaus | Data-analyysi | Ideointi ja strategia | Automaatiot
- **Vaikuttavuus:** Korkea ROI (€) | Suuri vaikutus / suuri työmäärä | Itsepalvelu | Suuri työmäärä / pieni merkitys
- Valinnaiset: **Tietosuoja** (Vihreä | Keltainen | Punainen), **Jory** (Kyllä | Ei), **Prioriteetti** (0–100), **Kuvaus**

Arviointityökalun *Kopioi tiekarttalohkona* -painike tekee valmiin lohkon tähän muotoon (piilotettu Kangasalan sivulla, ks. `hidden` alla).

`<!-- ... -->`-merkkien välissä oleva teksti ei näy sivulla.

## Tiekartan seuranta: käyttötapausten lataus (JSON)

Etusivun *AI-tiekartan seuranta* -osioon voi ladata arviointityökalusta tallennetut JSON-tiedostot (yksi tai useampi kerralla). Sivu näyttää niistä käyttötapaussalkun tilan, tyypit, vaikuttavuuden ja kortit sekä kuukausittaisen tilannekuvan (pinottu pylväs tiloittain ja taulukko: käyttötapauksia, uusia, tuotannossa, keskimääräinen prioriteetti, jory-huomioita).

- Tiedostot luetaan vain katsojan selaimeen (localStorage), niitä ei julkaista sivustolle.
- Kuukausi määräytyy tiedoston vientipäivästä (`exported`); jos sitä ei ole, käytetään latauspäivää. Saman kuukauden uusi lataus korvaa kuukauden tilannekuvan.
- Omistajaa ei näytetä eikä tallenneta.
- `content/tiekartta.md`:n `## Käyttötapaukset`-lohkot näkyvät edelleen ladattujen rinnalla.

## Arviointityökalu

Työkalu on oma komponenttinsa kansiossa `assets/ai-arviointi/` (`ai-arviointi.js` ja `ai-arviointi.css`), joten sen voi liittää myös muille sivuille:

```html
<link rel="stylesheet" href="ai-arviointi.css">
<div id="ai-arviointi"></div>
<script src="ai-arviointi.js"></script>
<script>AIArviointi.mount(document.getElementById("ai-arviointi"), { storageKey: "oma-sivu" });</script>
```

- Arvioinnit tallentuvat vain käyttäjän omaan selaimeen. Mitään ei lähetetä palvelimelle.
- Tulokset viedään PDF-, PowerPoint-, CSV- (Excel, Microsoft Lists) tai JSON-muodossa. JSON-tiedoston voi tuoda takaisin, joten AI-lähettiläs voi koota yksiköiden arvioinnit yhteen.
- **Parametrit** (kriteerit, painot, nelikentän rajat, riskivähennykset, työtunnin arvo) ladataan ja tuodaan omana JSON-tiedostonaan. Kriteerejä voi olla enintään 15. Uuden kriteerin saa lisäämällä tiedoston `criteria`-listaan rivin, jossa on `id`, `group` (`hyoty`, `toteutus` tai `riski`), `name`, `help`, `lo`, `hi` ja `weight` (0–3).
- *Yhteenveto*-välilehdelle voi tuoda useita JSON-tiedostoja kerralla (esim. kaikkien yksiköiden tulokset). Se näyttää kaikki käyttötapaukset nelikentässä ja prioriteettijärjestyksessä kokonaispisteineen, ja enintään 4 valittua tarkemmin.
- *Vertailu ja simulointi* -välilehdellä painotuksia voi kokeilla ja tallentaa skenaarioiksi (piilotettu Kangasalan sivulla).
- `mount`-asetuksilla voi vaihtaa mm. palvelukeskukset/osastot ja yksiköt (`centers`), tilat (`statuses`), tyypit ja niiden ohjetekstit (`types`, `typeInfo`) ja oletusparametrit (`params`).
- `hidden` piilottaa osia: `"status"` (Tila), `"jory"` (Jory-huomio), `"roadmapBlock"` (*Kopioi tiekarttalohkona*), `"vertailu"` (*Vertailu ja simulointi* -välilehti) sekä latausmuodot `"pdf"`, `"csv"`, `"pptx"` ja `"json"`. Kangasalan sivulla (`tyokalu.html`) piilossa ovat tiekarttalohko, Vertailu ja simulointi sekä PDF- ja CSV-lataus.
- Tilojen ja tyyppien ohjetekstit (?-ponnahdusikkunat) ovat asetuksissa `statusInfo` ja `typeInfo`. Vaihepalkki pysyy näkyvissä vierittäessä sivun yläpalkin alla; etäisyyden voi säätää CSS-muuttujalla `--aia-sticky-top` (oletus 64px).
- Arviointi etenee viidessä vaiheessa (stepper). 1. vaihe on Ohjeet: sen teksti luetaan tiedostosta `content/tyokalu.md` (asetus `guideUrl`), ja sivun yläosassa näkyy tiedoston otsikko.
- Yhteenvedossa vertailuun voi valita enintään 30 käyttötapausta (oletuksena 10 parasta). Mukana on myös organisaation keskiarvo.
- Työtunnin arvoa voi muuttaa vaiheessa 4 (Hyöty–kustannus); muutos koskee kaikkia arviointeja.
- Pakolliset tiedot: nimi, palvelukeskus/osasto, yksikkö (jos palvelukeskuksella on yksiköitä), omistaja, ongelma ja tavoite, miten tekoäly auttaa sekä tietosuojataso. Palvelukeskukselle ja yksikölle voi valita *Muu* ja kirjoittaa oman nimen.

## Esikatselu omalla koneella

```
python -m http.server 8000
```

Avaa sitten selaimessa http://localhost:8000. Sivu ei toimi, jos sen avaa suoraan tiedostona, koska selain ei silloin anna lukea `content/`-tiedostoja.

## Huomioita

- Century Gothic -fonttia ei julkaista lisenssin vuoksi. Sivu käyttää koneelle asennettua Century Gothicia, ja jos sitä ei ole, tilalla on samantyylinen Questrial (Google Fonts).
- Intranet- ja Teams-linkit toimivat vain Kangasalan tunnuksilla. Sivu merkitsee ne tekstillä "vaatii kirjautumisen".
- Sivustolle ei lisätä henkilöiden nimiä.
