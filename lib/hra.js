// Statická rozdeľovacia hra LPT2 2026 — herné jadro.
//
// Celá hra je VOPRED VYPOČÍTANÁ. Každé dieťa má pevnú trasu 10 stanovíšť,
// ktorá sa počas hry nedá zmeniť. Jediné, čo sa počas hry ukladá, je počet
// splnených krokov na dieťa (0–10) a log skenov.
//
// Dôsledok: deti sú na sebe NEZÁVISLÉ. Nikto nečaká na „ukončenie kola",
// dieťa, ktoré vypadne, nikoho nezablokuje, a jeden QR kód vie prejsť celú
// hru sám (to sa dá aj otestovať — /api/simulacia).
//
// ---------------------------------------------------------------------------
// AKO SA DIEŤA POHYBUJE (manuál, s. 2)
// ---------------------------------------------------------------------------
// Stanovíšť je 10 a idú do KRUHU po areáli (manuál, s. 3). Skupinky sa po ňom
// posúvajú vždy o jedno stanovište ďalej, presne podľa tabuľky na s. 4:
//
//     skupinka g je v kole r na stanovišti (r − g + 1) mod 10
//
// Dieťa má v každom kole na výber presne z dvoch vecí — nič iné manuál nepozná:
//
//   • PATRÍ SEM  → ide so svojou skupinkou na nasledujúce stanovište   (+1)
//   • NEPATRÍ SEM → prevedú ho do skupinky o stanovište ďalej a putuje
//                   odteraz s ňou                                      (+2)
//
// Nikdy sa nejde dozadu a nikdy sa nepreskakuje viac ako o jedno stanovište.
//
// ---------------------------------------------------------------------------
// PREČO SÚ TRASY PRÁVE TIETO
// ---------------------------------------------------------------------------
// Keď k tomu pridáme podmienku, že dieťa nemá hrať tú istú aktivitu dvakrát
// (prejde všetkých 10 stanovíšť) a na konci má skončiť vo svojej štvrti,
// zostane z 512 možných postupností krokov PÄŤ. Doslova päť — dá sa to
// vyskúšať hrubou silou a test to aj robí (test/trasy.test.js).
//
// Vyzerajú takto (2 = „nepatríš sem, ideš ďalej"):
//
//     prevedení 0:  1 1 1 1 1 1 1 1 1
//     prevedení 2:  2 1 1 1 1 1 1 1 2
//     prevedení 4:  2 2 1 1 1 1 1 2 2
//     prevedení 6:  2 2 2 1 1 1 2 2 2
//     prevedení 8:  2 2 2 2 1 2 2 2 2
//
// Dve veci z toho vyplývajú a nedá sa s nimi nič robiť:
//   – počet prevedení je vždy párny (0, 2, 4, 6 alebo 8),
//   – piaty krok (medzi 5. a 6. kolom) je vo VŠETKÝCH piatich +1, takže práve
//     v tomto jedinom kole nikoho nikam neprevedú.
//
// Koľko detí ide ktorou trasou, sa už voliť dá — a podľa toho vychádza, koľko
// detí sa v ktorom kole na stanovišti obmení (viď POCTY v scripts/generuj-deti.py).
//
// ---------------------------------------------------------------------------
// ČO JE TÝM ZARUČENÉ (overuje test/trasy.test.js)
// ---------------------------------------------------------------------------
//   1. každý krok je len +1 alebo +2 — nikdy dozadu, nikdy o viac
//   2. každé dieťa prejde všetkých 10 stanovíšť práve raz
//   3. každé dieťa končí vo štvrti svojej skupinky (rozdelenie sedí s Excelom)
//   4. rozpis skupiniek sedí s tabuľkou na s. 4 manuálu, políčko po políčku
//   5. na každom stanovišti je v každom kole 10 alebo 11 detí
//   6. okrem 5. kola sa na každom stanovišti obmenia aspoň 3 deti z 10
//
// ---------------------------------------------------------------------------
// ODCHÝLKY OD MANUÁLU (vedomé, vyžiadané v zadaní)
// ---------------------------------------------------------------------------
// • Časový harmonogram (9:15–11:40) sa nepoužíva. Kolo dieťaťa posúva sken.
// • Manuál hovorí „poslané do nasledujúcej skupinky (o číslo vyššej)", ale tá
//   je o stanovište POZADU — dieťa by teda ostalo stáť na mieste a hralo tú
//   istú aktivitu dvakrát. Podľa zadania sa preto prevádza do skupinky
//   o stanovište ĎALEJ. Smer po kruhu aj tabuľka zo s. 4 ostávajú.
// • Kto kedy „nepatrí", je vypočítané vopred, nie podľa toho, ako hra dopadne.
//   Vďaka tomu je isté, že sa deti rozdelia presne podľa Excelu.

const udaje = require('../data/deti.json');

const POCET = 10; // stanovíšť = skupiniek = kôl

// Päť trás, ktoré pravidlá dovoľujú. Zapísané ako posuny od domovského
// stanovišťa H, jeden na kolo; posledný je vždy 0, čiže doma.
// Poradie zodpovedá počtu prevedení: 0, 2, 4, 6, 8.
//
//                    kolo:  1  2  3  4  5  6  7  8  9 10
const SABLONY = [
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 0], // 0 prevedení — celú hru so svojou skupinkou
  [9, 1, 2, 3, 4, 5, 6, 7, 8, 0], // 2 prevedenia — hneď na začiatku a na konci
  [7, 9, 1, 2, 3, 4, 5, 6, 8, 0], // 4 prevedenia
  [5, 7, 9, 1, 2, 3, 4, 6, 8, 0], // 6 prevedení
  [3, 5, 7, 9, 1, 2, 4, 6, 8, 0], // 8 prevedení — putuje takmer každé kolo
];

// Poradie POĽA = fyzický kruh po areáli, nie abeceda. Písmená sú len menovky
// aktivít z manuálu (s. 2–3); rotácia ide po tomto poradí, preto je D pred C.
const STANOVISTIA = [
  { i: 0, letter: 'A', nazov: 'Vymenia sa všetci tí', miesto: 'zasadačka', material: 'stoličky' },
  { i: 1, letter: 'B', nazov: 'Signál', miesto: 'záhrada', material: 'mäkká loptička' },
  { i: 2, letter: 'D', nazov: 'Toaleťák', miesto: 'mantinely', material: 'toaleťák' },
  { i: 3, letter: 'C', nazov: 'Duangango', miesto: 'pri Panne Márii', material: '—' },
  { i: 4, letter: 'E', nazov: 'Zoradenie', miesto: 'pred skautskou búdkou', material: '—' },
  { i: 5, letter: 'F', nazov: 'Telefón', miesto: 'obývačka', material: '—' },
  { i: 6, letter: 'G', nazov: 'Pantomíma', miesto: 'tanečná', material: 'kartičky na pantomímu' },
  { i: 7, letter: 'H', nazov: 'Kreslenie', miesto: 'oľga', material: 'tabuľa, fixky, kartičky' },
  { i: 8, letter: 'I', nazov: 'Hádaj na čo myslím', miesto: 'čajovňa', material: '—' },
  { i: 9, letter: 'J', nazov: 'Rómeo a Júlia', miesto: 'sála', material: 'šatky na oči' },
];

const DETI = udaje.deti;
const ANIMATORI = udaje.animatori;

// Index podľa QR kódu aj podľa čísla náramku — sken hľadá v oboch.
const PODLA_KODU = new Map();
for (const d of DETI) {
  PODLA_KODU.set(d.id.toUpperCase(), d);
  PODLA_KODU.set(String(d.naramok), d);
}

function modulo(n, m) { return ((n % m) + m) % m; }

// Domovské stanovište (štvrť) skupinky. Vychádza z tabuľky na s. 4 manuálu:
// kde manuál necháva skupinku v poslednom kole, tam je jej štvrť.
function domovskeStanoviste(skupina) { return modulo(POCET - skupina, POCET); }

// Opačný smer: ktorej skupinke patrí štvrť na tomto stanovišti (1–10).
function skupinkaStvrte(stanoviste) { return modulo(POCET - stanoviste, POCET) || POCET; }

// Trasa dieťaťa: pole 10 indexov stanovíšť, jeden na kolo.
// Toto je JEDINÉ miesto, kde trasa vzniká — nikde sa neukladá ani neupravuje.
function trasa(skupina, trieda) {
  const H = domovskeStanoviste(skupina);
  const sablona = SABLONY[trieda];
  if (!sablona) throw new Error(`Neznáma trieda trasy: ${trieda}`);
  return sablona.map((posun) => modulo(H + posun, POCET));
}

function trasaDietata(dieta) { return trasa(dieta.skupina, dieta.trieda); }

// Kde je ktorá skupinka v ktorom kole — priamo tabuľka zo s. 4 manuálu.
function kdeJeSkupinka(skupina, r) { return modulo(r - skupina + 1, POCET); }

// Opačne: ktorá skupinka je v kole r na tomto stanovišti (1–10).
function skupinkaNaStanovisti(st, r) { return modulo(r + 1 - st, POCET) || POCET; }

// V ktorej skupinke dieťa v danom kole je.
function skupinkaDietata(dieta, r) {
  return skupinkaNaStanovisti(trasaDietata(dieta)[r], r);
}

// Je dieťa v kole r vo svojej vlastnej skupinke? Pri trase bez prevedení platí
// od začiatku; pri ostatných až v poslednom kole — presne ako v manuáli, kde
// sa deti prehadzujú, kým sa skupinky nerozdelia.
function jeVoSvojej(dieta, r) { return skupinkaDietata(dieta, r) === dieta.skupina; }

function najdiDieta(kod) {
  if (kod == null) return null;
  const k = String(kod).trim().toUpperCase();
  if (!k) return null;
  return PODLA_KODU.get(k)
    // „007" aj „7" musia trafiť to isté dieťa — animátor píše ručne to, čo vidí.
    || PODLA_KODU.get(String(parseInt(k.replace(/^D/, ''), 10)))
    || null;
}

function stanoviste(i) { return STANOVISTIA[i] || null; }

function popisStanovista(i) {
  const s = stanoviste(i);
  return s ? `${s.letter} — ${s.miesto}` : '—';
}

// ---------------------------------------------------------------------------
// Vyhodnotenie skenu
// ---------------------------------------------------------------------------
// `postup` = koľko stanovíšť má dieťa už za sebou (0–10). Číslo kola, v ktorom
// dieťa práve je, je teda `postup` (0-based) resp. `postup + 1` pre človeka.
//
// Funkcia je ČISTÁ: nič neukladá, len povie, čo sa má stať. Zápis robí volajúci
// (api/index.js) — vďaka tomu sa dá celá hra odsimulovať bez databázy.
function vyhodnot(dieta, postup, stanovisteIdx) {
  const t = trasaDietata(dieta);

  if (postup >= POCET) {
    return {
      vysledok: 'hotovo',
      zapisat: false,
      nadpis: dieta.meno,
      hlaska: `🏁 Už má hru dokončenú — patrí do skupinky ${dieta.skupina} `
        + `(${popisStanovista(domovskeStanoviste(dieta.skupina))}).`,
      postup,
    };
  }

  const ocakavane = t[postup];
  if (ocakavane === stanovisteIdx) {
    const novy = postup + 1;
    const hotovo = novy >= POCET;
    if (hotovo) {
      return {
        vysledok: 'ciel',
        zapisat: true,
        postup: novy,
        nadpis: dieta.meno,
        hlaska: `🏁 SI DOMA — SKUPINKA ${dieta.skupina}`,
        dalsie: null,
        presun: false,
      };
    }
    // Krok +1 = ide so svojou skupinkou ďalej. Krok +2 = do tejto skupinky
    // nepatrí a prevádza sa do tej o stanovište ďalej. Tretia možnosť nie je.
    const presun = modulo(t[novy] - ocakavane, POCET) === 2;
    const novaSkupinka = skupinkaNaStanovisti(t[novy], novy);
    return {
      vysledok: presun ? 'presun' : 'ok',
      zapisat: true,
      postup: novy,
      nadpis: dieta.meno,
      hlaska: presun
        ? `⛔ SEM NEPATRÍŠ — IDEŠ DO ĎALŠEJ SKUPINKY: ${popisStanovista(t[novy])}`
        : `✅ PATRÍ SEM — IDE SO SKUPINKOU NA: ${popisStanovista(t[novy])}`,
      dalsie: t[novy],
      presun,
      skupinka_teraz: skupinkaNaStanovisti(ocakavane, postup),
      skupinka_potom: novaSkupinka,
    };
  }

  // Zlé stanovište. Animátor potrebuje hlavne vedieť, KAM dieťa poslať;
  // preto sa rozlišuje, či sa vrátilo, predbehlo, alebo je úplne inde.
  const uzBolo = t.slice(0, postup).indexOf(stanovisteIdx);
  const budeNeskor = t.indexOf(stanovisteIdx, postup + 1);
  let preco;
  if (uzBolo !== -1) {
    preco = `Tu už bolo (kolo ${uzBolo + 1}).`;
  } else if (budeNeskor !== -1) {
    preco = `Sem príde až v kole ${budeNeskor + 1}.`;
  } else {
    preco = 'Sem nepatrí.';
  }

  return {
    vysledok: 'zle_stanoviste',
    zapisat: false,
    postup,
    nadpis: dieta.meno,
    preco,
    hlaska: `⛔ ${preco} TERAZ MÁ ÍSŤ NA: ${popisStanovista(ocakavane)}`,
    ma_ist_na: ocakavane,
  };
}

// ---------------------------------------------------------------------------
// Odvodené prehľady (nič sa neukladá)
// ---------------------------------------------------------------------------

// Kto má byť na stanovišti `st` v kole `r` (0-based) — podklad pre papierový
// rozpis aj pre kontrolu v skeneri. Nezávisí od stavu, je to čistá matematika.
function ktoJeNaStanovisti(st, r) {
  return DETI.filter((d) => trasaDietata(d)[r] === st);
}

function prehladDietata(dieta, postup) {
  const t = trasaDietata(dieta);
  return {
    id: dieta.id,
    naramok: dieta.naramok,
    meno: dieta.meno,
    priezvisko: dieta.priezvisko,
    rocnik: dieta.rocnik,
    skupina: dieta.skupina,
    trasa: t,
    postup,
    hotovo: postup >= POCET,
    teraz_na: postup < POCET ? t[postup] : null,
  };
}

module.exports = {
  POCET,
  SABLONY,
  STANOVISTIA,
  DETI,
  ANIMATORI,
  STARTOVE_BLOKY: udaje.startove_bloky,
  trasa,
  trasaDietata,
  domovskeStanoviste,
  skupinkaStvrte,
  kdeJeSkupinka,
  skupinkaNaStanovisti,
  skupinkaDietata,
  jeVoSvojej,
  najdiDieta,
  stanoviste,
  popisStanovista,
  vyhodnot,
  ktoJeNaStanovisti,
  prehladDietata,
};
