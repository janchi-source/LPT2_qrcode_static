# LPT2 2026 — statická rozdeľovacia hra

Doobedňajšia rozdeľovacia hra z manuálu, ale s **vopred vypočítanými trasami**.
Každé dieťa má pevnú postupnosť 10 stanovíšť, ktorá sa počas hry nedá zmeniť.
Appka počas hry robí jedinú vec: pri skene overí, či dieťa stojí na stanovišti,
ktoré má podľa svojej trasy na rade, a povie, kam má ísť ďalej.

Že to vyjde, nie je otázka priebehu hry — je to dokázané vopred (`npm test`,
36 testov vrátane odohrania celej hry cez HTTP).

---

## Prečo staticky

Pôvodná appka rozdeľovala deti počas hry: kto do skupinky nepatril, šiel „o jednu
skupinku vyššie". To znamenalo, že sa čakalo na kolá, celý areál musel byť
zosynchronizovaný, a keď dieťa vypadlo, zdržalo ostatných.

Tu je to opačne. Trasy sú spočítané dopredu tak, aby výsledok sedel, a preto:

- **deti sú na sebe nezávislé** — nič sa nečaká, kým sa naskenujú všetci;
- **dieťa môže vypadnúť** — nikoho tým nezablokuje;
- **jeden QR kód vie prejsť celú hru sám** (`/api/simulacia`, test to robí);
- **zlý sken sa nikam nezapíše** — appka len povie, kam dieťa patrí;
- **hra sa dohrá aj bez appky** — celý priebeh je vytlačiteľný v `/rozpis.html`.

---

## Ako sa hra odohrá

1. **Registrácia.** Každé dieťa dostane **presne ten náramok, ktorý má v rozpise**.
   Číslo náramku určuje trasu aj skupinku, do ktorej sa nakoniec dostane. Toto je
   jediná vec, ktorá sa musí spraviť presne — na štítku je preto pod QR kódom aj meno.
2. **Rozdelenie podľa čísel.** Deti sa podľa čísel na náramkoch rozídu na svoje
   prvé stanovište (manuál, s. 2). Čísla sú rozdané v súvislých blokoch, takže
   stačí povedať „čísla 1–11 do zasadačky, 12–22 do záhrady…".
3. **Kolo.** Na stanovišti sa odohrá icebreaker. Potom animátor naskenuje všetky
   deti, ktoré tam sú. Appka pri každom skene ukáže veľkým písmom, **kam má dieťa ísť ďalej**.
4. **Presun.** Appka pri každom skene povie jednu z dvoch vecí — nič tretie
   manuál nepozná:
   - 🟢 **PATRÍ SEM** → ide so svojou skupinkou na **nasledujúce** stanovište v kruhu;
   - 🔴 **SEM NEPATRÍŠ** → prevádza sa do skupinky **o stanovište ďalej** a putuje
     odteraz s ňou. Appka vypíše červenou, kam ide a do ktorej skupinky.

   Nikdy sa nejde dozadu a nikdy sa nepreskakuje viac než o jedno stanovište.
5. **Koniec.** Po 10. stanovišti je každá skupinka kompletná vo svojej štvrti,
   aj so svojimi vezírmi.

Vezíri chodia so svojou skupinkou po kruhu a ich rozpis je **doslova tabuľka
zo strany 4 manuálu** (`/rozpis.html`, časť 3) — test ju porovnáva políčko po
políčku. Odtiaľ vychádza aj to, ktoré stanovište je čia štvrť: skupinka končí
tam, kde ju manuál necháva v poslednom kole (sk. 1 → sála, sk. 2 → čajovňa,
… sk. 10 → zasadačka).

---

## Prečo sú trasy práve tieto

Stanovištia idú do kruhu po areáli v poradí z manuálu (s. 3): zasadačka →
záhrada → mantinely → Panna Mária → pred skautskou → obývačka → tanečná →
oľga → čajovňa → sála → späť. Skupinky sa po ňom posúvajú vždy o jedno
stanovište, presne podľa tabuľky na s. 4:

```
skupinka g je v kole r na stanovišti (r − g + 1) mod 10
```

Dieťa má teda v každom kole na výber z dvoch krokov: **+1** (ide so skupinkou)
alebo **+2** (prevedú ho do skupinky o stanovište ďalej).

Keď k tomu pridáme, že dieťa nemá hrať tú istú aktivitu dvakrát (prejde
všetkých 10 stanovíšť) a na konci má skončiť vo svojej štvrti, zostane
z 512 možných postupností krokov **päť**:

| prevedení | kroky | |
|---|---|---|
| 0 | `1 1 1 1 1 1 1 1 1` | celú hru so svojou skupinkou |
| 2 | `2 1 1 1 1 1 1 1 2` | |
| 4 | `2 2 1 1 1 1 1 2 2` | |
| 6 | `2 2 2 1 1 1 2 2 2` | |
| 8 | `2 2 2 2 1 2 2 2 2` | putuje takmer každé kolo |

Nie je to voľba — je to všetko, čo pravidlá dovoľujú, a test to overuje hrubou
silou (prejde všetkých 512 možností). Vyplývajú z toho dve veci, s ktorými sa
nedá nič robiť:

- počet prevedení je vždy **párny** (0, 2, 4, 6 alebo 8);
- **piaty krok je vo všetkých piatich `+1`**, takže medzi 5. a 6. kolom
  neprevedú nikoho. Ktokoľvek by sa vtedy previedol, už by nestihol prejsť
  10 rôznych stanovíšť.

Voliť sa dá už len to, **koľko detí ide ktorou trasou** (`POCTY`
v `scripts/generuj-deti.py`). Pri súčasnom nastavení `1 · 2 · 2 · 2 · 3` sa
na stanovišti prevedie:

```
kolo       1  2  3  4  5  6  7  8  9
prevedie sa 9  7  5  3  0  3  5  7  9   detí z 10
```

Rovnováha je zaručená konštrukciou: všetky skupinky delia deti medzi trasy
rovnako, takže na každom stanovišti je v každom kole presne 10 detí — plus
jedno navyše zo skupiniek s 11 deťmi.

### Čo je tým zaručené (a čo testy overujú)

| | |
|---|---|
| **každý krok je len +1 alebo +2** — nikdy dozadu, nikdy o viac | presne podľa manuálu |
| šablóny sú presne tá päťka, ktorú dáva hrubá sila | nič sa nezabudlo ani nepridalo |
| každé dieťa prejde všetkých 10 stanovíšť **práve raz** | žiadna aktivita dvakrát |
| každé dieťa končí vo štvrti svojej skupinky | rozdelenie sedí s Excelom |
| žiadne dieťa nezačína vo svojej štvrti | rozdeľovanie má zmysel od 1. kola |
| rozpis skupiniek = **tabuľka zo s. 4 manuálu**, políčko po políčku | vezíri idú podľa manuálu |
| prevedenie posunie dieťa presne **o jednu skupinku** | nikto nepreskakuje pol areálu |
| na stanovišti je v každom kole **10 alebo 11 detí** | skupiny na aktivitu sú rovnako veľké |
| okrem 5. kola sa na stanovišti **obmenia aspoň 3 deti z 10** | partia je zakaždým cítiť iná |
| rôznych skupiniek na stanovišti: **5 → 1** | na začiatku premiešané, na konci rozdelené |
| deti jednej skupinky sa zlievajú a kompletné sú **až posledným skenom** | pointa vydrží do konca |

### Vedomé odchýlky od manuálu (podľa zadania)

- **Časový harmonogram (9:15–11:40) sa nepoužíva.** Kolo dieťaťa posúva sken, nie hodiny.
- **Manuál hovorí „poslané do nasledujúcej skupinky (o číslo vyššej)"**, lenže tá
  je o stanovište *pozadu* — dieťa by teda ostalo stáť na mieste a hralo tú istú
  aktivitu dvakrát. Podľa zadania sa preto prevádza do skupinky **o stanovište ďalej**.
  Smer po kruhu aj tabuľka zo s. 4 ostávajú nedotknuté.
- **Kto kedy „nepatrí", je vypočítané vopred**, nie podľa toho, ako hra dopadne.
  Vďaka tomu je isté, že sa deti rozdelia presne podľa Excelu.

---

## Stránky

| adresa | pre koho |
|---|---|
| `/scan.html` | **animátori na stanovišti** — vyber stanovište a skenuj |
| `/rozpis.html` | papierová záloha celej hry: rozdanie náramkov, štartové bloky, rozpis vezírov, kto má byť kde v ktorom kole |
| `/admin.html` | prehľad, kde deti sú, ručná oprava (override), reset |
| `/qr.html` | štítky na náramky na tlač (QR + číslo + meno) |

Skener je zámerne jediná pekná stránka — ostatné sú striedme a hlavne dobre
tlačiteľné.

### Override a heslo

V `/admin.html` sa dá každému dieťaťu nastaviť postup (0–10) natvrdo. Hodí sa,
keď sa vynechá sken, keď dieťa príde neskôr, alebo keď sa niekde stane zmätok.
Zmena sa zapíše do logu. Trasu override **nemení** — tá je pevná.

Zásahy, ktoré menia stav mimo pravidiel hry, sú za **heslom** — `sex`:

| akcia | heslo |
|---|---|
| skenovanie na stanovišti | **nie** — telefón má v ruke hociktorý animátor a zdržiavať ho prihlasovaním by hru brzdilo |
| override postupu | áno |
| simulácia (`/api/simulacia`) | áno |
| vynulovanie hry | áno + potvrdenie `ZMAZAT` |

Heslo overuje **server** (`lib/handler.js`), nie stránka — nedá sa obísť tým, že
si niekto pozrie zdroják alebo zavolá API priamo. Dá sa zmeniť premennou
prostredia `LPT2S_HESLO` bez zásahu do kódu.

V prehľade sa odomyká raz za kartu prehliadača (`sessionStorage`), takže po jej
zavretí je zamknuté späť — zabudnutý telefón neostane otvorený. Nie je to
ochrana pred útočníkom, je to poistka proti omylu a proti zvedavému dieťaťu
s telefónom.

---

## API

| endpoint | čo robí |
|---|---|
| `GET /api/info` | stanovištia, skupinky, animátori, štartové bloky |
| `GET /api/stav` | všetky deti + postup + kde práve stoja |
| `GET /api/rozpis?stanoviste=0&kolo=1` | kto má byť kde |
| `GET /api/log` | posledné skeny |
| `GET /api/db-test` | diagnostika databázy |
| `POST /api/sken` | `{ kod, stanoviste }` |
| `POST /api/override` | `{ id, postup }` |
| `POST /api/simulacia` | `{ kod }` — prežene jeden QR celou hrou |
| `POST /api/reset` | `{ potvrdenie: "ZMAZAT" }` |

---

## Nasadenie na Vercel

Projekt je bez závislostí, nič sa nebuildí — stačí ho nahrať a nastaviť databázu.

### Databáza — Supabase

Ukladá sa jediná vec: koľko stanovíšť má ktoré dieťa za sebou. V Supabase
(SQL Editor) na to stačia dve tabuľky:

```sql
create table lpt2s_postup (
  id text primary key,
  kroky smallint not null default 0,
  zmenene timestamptz not null default now()
);

create table lpt2s_log (
  id bigserial primary key,
  dieta text not null,
  naramok int,
  meno text,
  stanoviste smallint,
  kolo smallint,
  vysledok text,
  ts timestamptz not null default now()
);
```

`lpt2s_log` je len na náhľad v `/admin.html` — hra bez neho beží ďalej.

Na Verceli potom nastav premenné prostredia:

```
SUPABASE_URL                 https://<id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY    service_role kľúč (Project Settings → API)
```

Prečo *service_role* a nie *anon*: appka beží celá na serveri, do prehliadača sa
kľúč nikdy nedostane, a anon kľúč by pri zapnutom RLS zápis odmietol.

Názvy tabuliek sa dajú prepísať cez `LPT2S_TABULKA` a `LPT2S_TABULKA_LOG`.
Bez `SUPABASE_*` beží appka v **súborovom režime** — dobré na lokálnu skúšku,
na Verceli nie, tam je súborový systém len na čítanie.

**Prečo riadok na dieťa a nie jeden JSON dokument:** skenuje 10 telefónov naraz.
Každý sken sa dotkne len svojho riadku. Posun je navyše
`UPDATE … WHERE kroky = <očakávané>` — porovnanie aj zápis robí databáza v jednej
operácii, takže keď dvaja naskenujú to isté dieťa v tej istej sekunde, posunie sa
práve raz a sken sa nestratí.

Po nasadení otvor `/api/db-test`. Musí vrátiť `{"ok":true,"rezim":"supabase"}`
— a overuje aj to, že podmienený UPDATE naozaj **odmietne** posun zo starej
hodnoty. Keď tabuľky chýbajú, vypíše rovno SQL, ktoré ich vytvorí.

### Lokálne

```bash
npm start          # http://localhost:3000
```

Kamera funguje len na `https://` alebo na `localhost`. Na tábore sa teda skenuje
z nasadenej Vercel adresy; lokálne sa hlavne tlačí a testuje (kód sa dá zadať
aj ručne ako číslo náramku).

---

## Dáta detí

`data/deti.json` je vygenerované zo súboru „skupilnky – vytlačiť.xlsx".
Keď sa zoznam detí zmení:

```bash
pip3 install openpyxl
python3 scripts/generuj-deti.py ~/Downloads/'skupilnky - vytlačiť (1).xlsx'
python3 scripts/over-deti.py  ~/Downloads/'skupilnky - vytlačiť (1).xlsx'
npm test
```

**Zdrojom pravdy je hárok „skupinky pre animátorov", nie hárky 1.skupinka…
10.skupinka.** Tie sa v praxi opravujú menej dôsledne — v auguste 2026 v nich
chýbala Sofia Soláriková (sk. 4) a Benjamin Bros (sk. 1) v nich bol vedený ako
druhá „Hana Jankeje", takže v hárkoch vyzeralo, že jedno meno je tam dvakrát.
V prehľadovej tabuľke bolo pritom všetko správne.

Generátor si hárky po skupinkách aj tak načíta a **každý rozdiel vypíše**, nech
sa o ňom vie. `scripts/over-deti.py` ide na to z druhej strany: vezme hotový
`data/deti.json` a porovná ho s Excelom — mená, skupinky, animátorov, duplicity
aj súvislosť čísel náramkov. Vracia nenulový kód, keď niečo nesedí, takže sa dá
spustiť koľkokrát treba.

Generátor je deterministický (pevné seedy), takže rovnaký Excel dá vždy rovnaké
náramky. Podporené sú skupinky s 10 alebo 11 deťmi; pri inom počte to skript
povie a treba upraviť `POCTY`.

`POCTY` je jediné, čo sa pri trasách dá voliť (koľko detí ide ktorou z piatich
trás). Samotné trasy meniť netreba — iné pravidlá manuálu nedovoľujú.

`npm test` po zmene dát nie je formalita — presne on overuje, že hra vyjde.

---

## Testy

```bash
npm test
```

- `test/trasy.test.js` — všetky vlastnosti trás a rozdelenia z tabuľky vyššie,
  vrátane porovnania rozpisu vezírov s ručne prepísanou tabuľkou zo s. 4 manuálu
  a hrubou silou overenej päťky dovolených trás
- `test/sken.test.js` — vyhodnotenie skenu (správne, zlé, opakované, po dohratí)
- `test/api.test.js` — celá hra cez HTTP: 106 detí × 10 kôl = 1060 skenov bez
  jediného zlého, plus override, reset, rozpis a nezávislosť jedného QR kódu
- `test/supabase.test.js` — Supabase backend s podvrhnutým `fetch`: aké
  požiadavky idú do PostgRESTu, že kľúč nikdy nejde do URL, a že podmienený
  UPDATE odmietne posun zo starej hodnoty
