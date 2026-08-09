// Dôkaz, že hra vyjde. Nie „malo by to fungovať" — všetkých 106 trás sa tu
// prejde do posledného kola a overí sa každá podmienka zo zadania aj manuálu.
const assert = require('assert');
const hra = require('../lib/hra');

const N = hra.POCET;
let testov = 0;
function test(nazov, fn) { fn(); testov++; console.log('  ✓ ' + nazov); }

const kruh = (d) => { const x = ((d % N) + N) % N; return Math.min(x, N - x); };
const krok = (t, r) => ((t[r + 1] - t[r]) % N + N) % N;

console.log('trasy.test.js');

// --- 1. Šablóny a trasy ------------------------------------------------------

test('KAŽDÝ krok je len +1 (so skupinkou) alebo +2 (prevedenie) — nikdy dozadu', () => {
  for (const d of hra.DETI) {
    const t = hra.trasaDietata(d);
    for (let r = 0; r < N - 1; r++) {
      const k = krok(t, r);
      assert.ok(k === 1 || k === 2,
        `${d.meno} (${d.id}) ide v kole ${r + 1} z ${hra.popisStanovista(t[r])} `
        + `na ${hra.popisStanovista(t[r + 1])} — to je posun o ${k > 5 ? k - N : k}, `
        + 'manuál pozná len +1 a +2');
    }
  }
});

test('šablóny sú presne tie, ktoré pravidlá dovoľujú — nájdené hrubou silou', () => {
  // 512 možných postupností krokov {+1,+2}; ostanú len tie, po ktorých dieťa
  // prejde 10 rôznych stanovíšť. Toto je nezávislý dôkaz, že SABLONY sú úplné.
  const dovolene = [];
  for (let maska = 0; maska < (1 << (N - 1)); maska++) {
    const kroky = Array.from({ length: N - 1 }, (_, i) => ((maska >> i) & 1) + 1);
    const pos = [0];
    const videne = new Set([0]);
    let p = 0;
    let ok = true;
    for (const k of kroky) {
      p = (p + k) % N;
      if (videne.has(p)) { ok = false; break; }
      videne.add(p); pos.push(p);
    }
    if (ok) dovolene.push(pos.map((x) => (x - pos[N - 1] + N) % N).join());
  }
  assert.strictEqual(dovolene.length, 5, `pravidlá dovoľujú ${dovolene.length} trás, nie 5`);
  assert.deepStrictEqual(
    [...hra.SABLONY.map((s) => s.join())].sort(),
    [...dovolene].sort(),
    'SABLONY nie sú tá istá päťka, akú dáva hrubá sila');
});

test('každá šablóna prejde všetkých 10 stanovíšť práve raz a končí doma', () => {
  assert.strictEqual(hra.SABLONY.length, 5);
  for (const [i, s] of hra.SABLONY.entries()) {
    assert.deepStrictEqual([...s].sort((a, b) => a - b), [...Array(N).keys()], `šablóna ${i}: ${s}`);
    assert.strictEqual(s[N - 1], 0, `šablóna ${i} nekončí na domovskom stanovišti`);
  }
  assert.strictEqual(new Set(hra.SABLONY.map((s) => s.join())).size, 5, 'dve šablóny sú rovnaké');
});

test('každá trasa prejde všetkých 10 stanovíšť práve raz a končí v štvrti skupinky', () => {
  for (let g = 1; g <= N; g++) {
    for (let trieda = 0; trieda < hra.SABLONY.length; trieda++) {
      const t = hra.trasa(g, trieda);
      assert.deepStrictEqual([...t].sort((a, b) => a - b), [...Array(N).keys()], `sk. ${g}, trieda ${trieda}`);
      assert.strictEqual(t[N - 1], hra.domovskeStanoviste(g), `sk. ${g}, trieda ${trieda}`);
    }
  }
});

test('žiadne dieťa nezačína vo svojej štvrti', () => {
  for (const d of hra.DETI) {
    assert.notStrictEqual(hra.trasaDietata(d)[0], hra.domovskeStanoviste(d.skupina),
      `${d.meno} (${d.id}) štartuje rovno doma`);
  }
});

// --- 2. Zhoda s manuálom -----------------------------------------------------

// Tabuľka zo strany 4 manuálu, prepísaná ručne. Riadky = kolá 9:15 … 11:30,
// stĺpce = skupinky 1–10, hodnoty = miesta. Toto je zdroj pravdy pre to, kade
// chodia vezíri — appka sa mu musí podriadiť, nie naopak.
const MANUAL = [
  ['zasadačka', 'sála', 'čajovňa', 'oľga', 'tanečná', 'obývačka', 'skautská', 'Panna Mária', 'mantinely', 'záhrada'],
  ['záhrada', 'zasadačka', 'sála', 'čajovňa', 'oľga', 'tanečná', 'obývačka', 'skautská', 'Panna Mária', 'mantinely'],
  ['mantinely', 'záhrada', 'zasadačka', 'sála', 'čajovňa', 'oľga', 'tanečná', 'obývačka', 'skautská', 'Panna Mária'],
  ['Panna Mária', 'mantinely', 'záhrada', 'zasadačka', 'sála', 'čajovňa', 'oľga', 'tanečná', 'obývačka', 'skautská'],
  ['skautská', 'Panna Mária', 'mantinely', 'záhrada', 'zasadačka', 'sála', 'čajovňa', 'oľga', 'tanečná', 'obývačka'],
  ['obývačka', 'skautská', 'Panna Mária', 'mantinely', 'záhrada', 'zasadačka', 'sála', 'čajovňa', 'oľga', 'tanečná'],
  ['tanečná', 'obývačka', 'skautská', 'Panna Mária', 'mantinely', 'záhrada', 'zasadačka', 'sála', 'čajovňa', 'oľga'],
  ['oľga', 'tanečná', 'obývačka', 'skautská', 'Panna Mária', 'mantinely', 'záhrada', 'zasadačka', 'sála', 'čajovňa'],
  ['čajovňa', 'oľga', 'tanečná', 'obývačka', 'skautská', 'Panna Mária', 'mantinely', 'záhrada', 'zasadačka', 'sála'],
  ['sála', 'čajovňa', 'oľga', 'tanečná', 'obývačka', 'skautská', 'Panna Mária', 'mantinely', 'záhrada', 'zasadačka'],
];
// Skratky z manuálu → index stanovišťa v hernom kruhu.
const INDEX = {
  'zasadačka': 0, 'záhrada': 1, 'mantinely': 2, 'Panna Mária': 3, 'skautská': 4,
  'obývačka': 5, 'tanečná': 6, 'oľga': 7, 'čajovňa': 8, 'sála': 9,
};

test('kruh stanovíšť ide v poradí z manuálu (zasadačka → záhrada → mantinely → …)', () => {
  const podlaManualu = MANUAL[0].map((m) => INDEX[m]);
  assert.strictEqual(podlaManualu[0], 0);
  // Prvý stĺpec manuálu čítaný po kolách je práve poradie kruhu.
  const kruhZManualu = MANUAL.map((riadok) => INDEX[riadok[0]]);
  assert.deepStrictEqual(kruhZManualu, [...Array(N).keys()],
    'poradie stanovíšť v STANOVISTIA nesedí s krúžením v manuáli');
});

test('rozpis vezírov sedí s tabuľkou na s. 4 manuálu, políčko po políčku', () => {
  for (let r = 0; r < N; r++) {
    for (let g = 1; g <= N; g++) {
      assert.strictEqual(hra.kdeJeSkupinka(g, r), INDEX[MANUAL[r][g - 1]],
        `kolo ${r + 1}, skupinka ${g}: appka dáva ${hra.popisStanovista(hra.kdeJeSkupinka(g, r))}, `
        + `manuál ${MANUAL[r][g - 1]}`);
    }
  }
});

test('štvrť skupinky je tam, kde ju manuál necháva v poslednom kole', () => {
  for (let g = 1; g <= N; g++) {
    assert.strictEqual(hra.domovskeStanoviste(g), INDEX[MANUAL[N - 1][g - 1]], `skupinka ${g}`);
  }
});

// --- 3. Deti sedia s Excelom -------------------------------------------------

// Očakávané zloženie podľa hárku „skupinky pre animátorov" v súbore
// „skupilnky - vytlačiť (1).xlsx" (stav 9. 8. 2026). Keď sa Excel zmení,
// spustí sa scripts/generuj-deti.py a tieto čísla sa opravia sem — schválne
// natvrdo, nech zmena v dátach nikdy neprejde ticho.
const POCET_DETI = 107;
const VELKOSTI = [10, 11, 11, 11, 10, 11, 11, 10, 11, 11];

test(`${POCET_DETI} detí, čísla náramkov 1–${POCET_DETI} bez dier a duplicít`, () => {
  assert.strictEqual(hra.DETI.length, POCET_DETI);
  const cisla = hra.DETI.map((d) => d.naramok).sort((a, b) => a - b);
  assert.deepStrictEqual(cisla, Array.from({ length: POCET_DETI }, (_, i) => i + 1));
  assert.strictEqual(new Set(hra.DETI.map((d) => d.id)).size, POCET_DETI);
});

test('veľkosti skupiniek sedia s hárkom „skupinky pre animátorov"', () => {
  assert.strictEqual(VELKOSTI.reduce((a, b) => a + b, 0), POCET_DETI);
  for (let g = 1; g <= N; g++) {
    assert.strictEqual(hra.DETI.filter((d) => d.skupina === g).length, VELKOSTI[g - 1], `skupinka ${g}`);
  }
});

test('žiadne dieťa nie je v zozname dvakrát', () => {
  // Presne toto sa raz stalo: „Hana Jankeje" bola v hárkoch po skupinkách
  // v skupinke 1 aj 5, pričom tá prvá mala byť Benjamin Bros. Dve deti
  // s tým istým menom by animátor pri skene nerozlíšil.
  const pocty = new Map();
  for (const d of hra.DETI) {
    const kluc = `${d.meno} ${d.priezvisko}`.trim().toLocaleLowerCase('sk');
    pocty.set(kluc, (pocty.get(kluc) || 0) + 1);
  }
  const duplicitne = [...pocty].filter(([, n]) => n > 1).map(([k]) => k);
  assert.deepStrictEqual(duplicitne, [], `deti s rovnakým menom: ${duplicitne.join(', ')}`);
});

test('každé dieťa má meno, priezvisko a platnú skupinku', () => {
  for (const d of hra.DETI) {
    assert.ok(d.meno && d.meno.trim(), `${d.id} nemá meno`);
    assert.ok(d.priezvisko && d.priezvisko.trim(), `${d.id} (${d.meno}) nemá priezvisko`);
    assert.ok(Number.isInteger(d.skupina) && d.skupina >= 1 && d.skupina <= N,
      `${d.id} má skupinku ${d.skupina}`);
    assert.ok(Number.isInteger(d.trieda) && d.trieda >= 0 && d.trieda < hra.SABLONY.length,
      `${d.id} má triedu ${d.trieda}`);
  }
});

test('všetky skupinky delia deti medzi trasy rovnako (na tom stojí rovnováha)', () => {
  const profil = (g) => {
    const p = Array(hra.SABLONY.length).fill(0);
    for (const d of hra.DETI.filter((x) => x.skupina === g)) p[d.trieda]++;
    return p;
  };
  const zaklad = [1, 2, 2, 2, 3];
  for (let g = 1; g <= N; g++) {
    const p = profil(g);
    const rozdiel = p.map((x, i) => x - zaklad[i]);
    const navyse = rozdiel.filter((x) => x !== 0);
    assert.ok(navyse.length === 0 || (navyse.length === 1 && navyse[0] === 1),
      `skupinka ${g} má profil ${p}, čakalo sa ${zaklad} (prípadne +1 na jednej trase)`);
  }
  // ...a 11. dieťa ide u všetkých veľkých skupiniek tou istou trasou, inak by
  // sa dve mohli stretnúť na jednom stanovišti a bolo by tam 12 detí.
  const navyseTriedy = new Set();
  for (let g = 1; g <= N; g++) {
    const p = profil(g);
    p.forEach((x, i) => { if (x > zaklad[i]) navyseTriedy.add(i); });
  }
  assert.ok(navyseTriedy.size <= 1, `deti navyše idú rôznymi trasami: ${[...navyseTriedy]}`);
});

test('každá skupinka má priradených animátorov', () => {
  for (let g = 1; g <= N; g++) {
    assert.ok(Array.isArray(hra.ANIMATORI[g]) && hra.ANIMATORI[g].length >= 2, `skupinka ${g}`);
  }
});

// --- 4. Obsadenosť stanovíšť -------------------------------------------------

function obsadenost() {
  const o = Array.from({ length: N }, () => Array(N).fill(0));      // [kolo][stanovište]
  const skupinyTam = Array.from({ length: N }, () => Array.from({ length: N }, () => new Set()));
  for (const d of hra.DETI) {
    hra.trasaDietata(d).forEach((st, r) => { o[r][st]++; skupinyTam[r][st].add(d.skupina); });
  }
  return { o, skupinyTam };
}

test('na každom stanovišti je v každom kole 10 alebo 11 detí', () => {
  const { o } = obsadenost();
  for (let r = 0; r < N; r++) {
    for (let st = 0; st < N; st++) {
      assert.ok(o[r][st] === 10 || o[r][st] === 11, `kolo ${r + 1}, stanovište ${st}: ${o[r][st]} detí`);
    }
    assert.strictEqual(o[r].reduce((a, b) => a + b, 0), POCET_DETI);
  }
});

test('premiešanosť klesá: na začiatku veľa rôznych skupiniek, na konci jedna', () => {
  const { skupinyTam } = obsadenost();
  // Všetky stanovištia sú v danom kole premiešané rovnako — konštrukcia je
  // pre všetky skupinky tá istá, len pootočená.
  const pocty = Array.from({ length: N }, (_, r) => {
    const v = [];
    for (let st = 0; st < N; st++) v.push(skupinyTam[r][st].size);
    assert.strictEqual(Math.min(...v), Math.max(...v), `kolo ${r + 1}: stanovištia sú premiešané nerovnako`);
    return v[0];
  });
  // Päť je maximum: trás je päť, takže na stanovišti sa môže zísť najviac päť
  // rôznych domovských skupiniek. Viac sa pri pravidlách manuálu nedá.
  assert.strictEqual(pocty[0], hra.SABLONY.length,
    `1. kolo: na stanovišti je ${pocty[0]} rôznych skupiniek, malo by byť ${hra.SABLONY.length}`);
  // Priebeh nemusí byť striktne klesajúci (jedno kolo sa smie aj mierne vrátiť),
  // ale nikdy sa nesmie premiešať viac než na začiatku a musí sa to zavrieť.
  for (let r = 1; r < N; r++) {
    assert.ok(pocty[r] <= pocty[0], `kolo ${r + 1}: premiešanejšie než na začiatku`);
  }
  // Do predposledného kola musí premiešanosť klesnúť aspoň na polovicu — inak
  // sa netriedi. Nesmie však spadnúť skôr, lebo potom už nie je čo obmieňať.
  assert.ok(pocty[N - 2] <= pocty[0] / 2,
    `pred posledným kolom je na stanovišti ešte ${pocty[N - 2]} skupiniek z ${pocty[0]}`);
  assert.strictEqual(pocty[N - 1], 1, 'v poslednom kole je na stanovišti viac skupiniek');
});

test('v poslednom kole je na každom stanovišti presne jedna KOMPLETNÁ skupinka', () => {
  for (let st = 0; st < N; st++) {
    const tam = hra.ktoJeNaStanovisti(st, N - 1);
    const skupiny = new Set(tam.map((d) => d.skupina));
    assert.strictEqual(skupiny.size, 1, `stanovište ${st}`);
    const g = [...skupiny][0];
    assert.strictEqual(hra.domovskeStanoviste(g), st, `stanovište ${st} má patriť inej skupinke`);
    assert.strictEqual(tam.length, hra.DETI.filter((d) => d.skupina === g).length,
      `skupinka ${g} nie je kompletná`);
  }
});

// --- 5. Ako sa skupinka skladá ----------------------------------------------

test('dieťa je vždy v skupinke, ktorá na tom stanovišti podľa manuálu je', () => {
  for (const d of hra.DETI) {
    const t = hra.trasaDietata(d);
    for (let r = 0; r < N; r++) {
      const g = hra.skupinkaDietata(d, r);
      assert.ok(g >= 1 && g <= N);
      assert.strictEqual(hra.kdeJeSkupinka(g, r), t[r],
        `${d.id} v kole ${r + 1}: appka ho vidí v skupinke ${g}, tá je ale inde`);
    }
    assert.ok(hra.jeVoSvojej(d, N - 1), `${d.id} nekončí vo svojej skupinke`);
  }
});

test('prevedenie posunie dieťa presne o jednu skupinku, nikdy o viac', () => {
  for (const d of hra.DETI) {
    for (let r = 0; r < N - 1; r++) {
      const teraz = hra.skupinkaDietata(d, r);
      const potom = hra.skupinkaDietata(d, r + 1);
      const rozdiel = ((potom - teraz) % N + N) % N;
      assert.ok(rozdiel === 0 || rozdiel === N - 1,
        `${d.id} skočil v kole ${r + 1} zo skupinky ${teraz} do ${potom}`);
    }
  }
});

test('deti jednej skupinky sa ku koncu zlievajú a kompletné sú až posledným skenom', () => {
  for (let g = 1; g <= N; g++) {
    const deti = hra.DETI.filter((d) => d.skupina === g);
    // Najväčšie zoskupenie detí tej istej skupinky na jednom stanovišti.
    const kopa = Array.from({ length: N }, (_, r) => {
      const pocty = {};
      for (const d of deti) { const st = hra.trasaDietata(d)[r]; pocty[st] = (pocty[st] || 0) + 1; }
      return Math.max(...Object.values(pocty));
    });
    for (let r = 1; r < N; r++) {
      assert.ok(kopa[r] >= kopa[r - 1], `skupinka ${g}, kolo ${r + 1}: kopa sa zmenšila`);
    }
    assert.ok(kopa[N - 2] < deti.length, `skupinka ${g} je pohromade už pred posledným kolom`);
    assert.strictEqual(kopa[N - 1], deti.length, `skupinka ${g} nie je na konci pohromade`);
  }
});

test('vezíri sú v každom kole každý na inom stanovišti a všetky navštívia', () => {
  for (let g = 1; g <= N; g++) {
    const kde = Array.from({ length: N }, (_, r) => hra.kdeJeSkupinka(g, r));
    assert.deepStrictEqual([...kde].sort((a, b) => a - b), [...Array(N).keys()], `skupinka ${g}`);
  }
  for (let r = 0; r < N; r++) {
    const obsadene = new Set();
    for (let g = 1; g <= N; g++) obsadene.add(hra.kdeJeSkupinka(g, r));
    assert.strictEqual(obsadene.size, N, `kolo ${r + 1}: dve skupinky na tom istom stanovišti`);
  }
});

// --- 6. Koľko sa toho hýbe --------------------------------------------------

// Koľko detí sa na stanovišti v danom kole prevedie inam. Na každom stanovišti
// je v každom kole rovnaký profil trás, takže číslo platí pre všetky naraz.
function prevedenych(r) {
  const zaklad = [1, 2, 2, 2, 3];
  return hra.SABLONY.reduce((sucet, sab, i) =>
    sucet + (((sab[r + 1] - sab[r]) % N + N) % N === 2 ? zaklad[i] : 0), 0);
}

test('okrem 5. kola sa na stanovišti obmenia aspoň tri deti z desiatich', () => {
  const profil = Array.from({ length: N - 1 }, (_, r) => prevedenych(r));
  for (let r = 0; r < N - 1; r++) {
    if (r === 4) continue; // viď test nižšie — v tomto kole to pravidlá nedovoľujú
    assert.ok(profil[r] >= 3,
      `po kole ${r + 1} sa prevedú len ${profil[r]} deti — partia by pôsobila rovnako`);
  }
  assert.ok(profil[0] >= 6, `v 1. kole sa prevádza len ${profil[0]} z 10`);
  assert.deepStrictEqual(profil, [9, 7, 5, 3, 0, 3, 5, 7, 9]);
});

test('v 5. kole neprevedú nikoho — a nedá sa s tým nič robiť', () => {
  // Piaty krok je +1 vo VŠETKÝCH piatich dovolených trasách. Nie je to voľba,
  // je to dôsledok pravidiel: keby sa tam niekto previedol, jeho trasa by už
  // nemohla prejsť 10 rôznych stanovíšť. Test to drží zapísané, nech to
  // niekto neskôr nepovažuje za chybu.
  for (const [i, sab] of hra.SABLONY.entries()) {
    assert.strictEqual(((sab[5] - sab[4]) % N + N) % N, 1, `šablóna ${i}`);
  }
  assert.strictEqual(prevedenych(4), 0);
});

test('deti sa nesťahujú davovo: prevádza sa najviac 9 z 10 a nikdy všetci', () => {
  for (let r = 0; r < N - 1; r++) {
    assert.ok(prevedenych(r) <= 9, `v kole ${r + 1} by sa prevádzali všetci`);
  }
});

// --- 7. Štartové bloky náramkov ---------------------------------------------

test('čísla náramkov sú v súvislých blokoch podľa štartového stanovišťa', () => {
  for (const blok of hra.STARTOVE_BLOKY) {
    for (let n = blok.od; n <= blok.do; n++) {
      const d = hra.DETI.find((x) => x.naramok === n);
      assert.ok(d, `náramok ${n} neexistuje`);
      assert.strictEqual(hra.trasaDietata(d)[0], blok.stanoviste, `náramok ${n}`);
    }
  }
  assert.strictEqual(hra.STARTOVE_BLOKY.reduce((a, b) => a + (b.do - b.od + 1), 0), POCET_DETI);
});

// --- 8. Vyhľadávanie kódu ----------------------------------------------------

test('QR kód, číslo náramku aj číslo bez núl nájdu to isté dieťa', () => {
  const d = hra.DETI.find((x) => x.naramok === 7);
  assert.strictEqual(hra.najdiDieta('D007'), d);
  assert.strictEqual(hra.najdiDieta('d007'), d);
  assert.strictEqual(hra.najdiDieta('7'), d);
  assert.strictEqual(hra.najdiDieta('007'), d);
  assert.strictEqual(hra.najdiDieta('  D007 '), d);
  assert.strictEqual(hra.najdiDieta('D999'), null);
  assert.strictEqual(hra.najdiDieta(''), null);
  assert.strictEqual(hra.najdiDieta(null), null);
});

console.log(`\n${testov} testov OK — hra vyjde.\n`);
