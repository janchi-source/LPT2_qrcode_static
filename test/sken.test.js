// Vyhodnotenie skenu — čistá logika, bez databázy.
const assert = require('assert');
const hra = require('../lib/hra');

let testov = 0;
function test(nazov, fn) { fn(); testov++; console.log('  ✓ ' + nazov); }

console.log('sken.test.js');

const dieta = hra.DETI[0];
const t = hra.trasaDietata(dieta);

test('sken na správnom stanovišti posunie dieťa o kolo ďalej', () => {
  const v = hra.vyhodnot(dieta, 0, t[0]);
  assert.ok(v.vysledok === 'ok' || v.vysledok === 'presun');
  assert.strictEqual(v.zapisat, true);
  assert.strictEqual(v.postup, 1);
  assert.strictEqual(v.dalsie, t[1]);
});

test('krok +1 hlási „patrí sem", krok +2 hlási „SEM NEPATRÍŠ"', () => {
  for (const d of hra.DETI) {
    const trasa = hra.trasaDietata(d);
    for (let r = 0; r < hra.POCET - 1; r++) {
      const v = hra.vyhodnot(d, r, trasa[r]);
      const posun = ((trasa[r + 1] - trasa[r]) % hra.POCET + hra.POCET) % hra.POCET;
      if (posun === 1) {
        assert.strictEqual(v.vysledok, 'ok', `${d.id} kolo ${r + 1}`);
        assert.strictEqual(v.presun, false);
        assert.ok(v.hlaska.includes('PATRÍ SEM'), v.hlaska);
        assert.ok(v.hlaska.includes('SO SKUPINKOU'), v.hlaska);
      } else {
        assert.strictEqual(posun, 2, `${d.id} kolo ${r + 1}: posun ${posun}`);
        assert.strictEqual(v.vysledok, 'presun', `${d.id} kolo ${r + 1}`);
        assert.strictEqual(v.presun, true);
        assert.ok(v.hlaska.includes('SEM NEPATRÍŠ'), v.hlaska);
        assert.ok(v.hlaska.includes('ĎALŠEJ SKUPINKY'), v.hlaska);
      }
      assert.ok(v.hlaska.includes(hra.popisStanovista(trasa[r + 1])), v.hlaska);
    }
  }
});

test('pri prevedení appka povie aj číslo novej skupinky', () => {
  const presun = hra.DETI.map((d) => {
    const trasa = hra.trasaDietata(d);
    for (let r = 0; r < hra.POCET - 1; r++) {
      if (((trasa[r + 1] - trasa[r]) % hra.POCET + hra.POCET) % hra.POCET === 2) {
        return hra.vyhodnot(d, r, trasa[r]);
      }
    }
    return null;
  }).find(Boolean);
  assert.ok(presun, 'nenašlo sa žiadne prevedenie');
  assert.notStrictEqual(presun.skupinka_potom, presun.skupinka_teraz);
  const rozdiel = ((presun.skupinka_potom - presun.skupinka_teraz) % 10 + 10) % 10;
  assert.strictEqual(rozdiel, 9, 'prevedenie musí byť o jednu skupinku');
});

test('posledný sken hlási cieľ a nič ďalšie neponúka', () => {
  const v = hra.vyhodnot(dieta, hra.POCET - 1, t[hra.POCET - 1]);
  assert.strictEqual(v.vysledok, 'ciel');
  assert.strictEqual(v.zapisat, true);
  assert.strictEqual(v.postup, hra.POCET);
  assert.strictEqual(v.dalsie, null);
  assert.match(v.hlaska, new RegExp('SKUPINKA ' + dieta.skupina));
});

test('sken na zlom stanovišti nič nezapíše a povie, kam má dieťa ísť', () => {
  const zle = (t[0] + 3) % hra.POCET;
  const v = hra.vyhodnot(dieta, 0, zle);
  assert.strictEqual(v.vysledok, 'zle_stanoviste');
  assert.strictEqual(v.zapisat, false);
  assert.strictEqual(v.postup, 0);
  assert.strictEqual(v.ma_ist_na, t[0]);
  assert.ok(v.hlaska.includes(hra.popisStanovista(t[0])));
});

test('druhý sken na tom istom stanovišti povie „tu už bolo"', () => {
  const v = hra.vyhodnot(dieta, 1, t[0]);
  assert.strictEqual(v.vysledok, 'zle_stanoviste');
  assert.ok(v.hlaska.includes('Tu už bolo (kolo 1)'), v.hlaska);
});

test('sken na stanovišti, ktoré dieťa ešte len čaká, povie v ktorom kole', () => {
  const v = hra.vyhodnot(dieta, 0, t[4]);
  assert.strictEqual(v.vysledok, 'zle_stanoviste');
  assert.ok(v.hlaska.includes('kole 5'), v.hlaska);
});

test('dieťa, ktoré má hru dokončenú, sa už neposúva', () => {
  const v = hra.vyhodnot(dieta, hra.POCET, t[0]);
  assert.strictEqual(v.vysledok, 'hotovo');
  assert.strictEqual(v.zapisat, false);
  assert.strictEqual(v.postup, hra.POCET);
});

test('každé dieťa prejde svoju trasu skenmi od začiatku do konca', () => {
  for (const d of hra.DETI) {
    const trasa = hra.trasaDietata(d);
    let postup = 0;
    for (let r = 0; r < hra.POCET; r++) {
      const v = hra.vyhodnot(d, postup, trasa[r]);
      assert.strictEqual(v.zapisat, true, `${d.id} kolo ${r + 1}: ${v.hlaska}`);
      postup = v.postup;
    }
    assert.strictEqual(postup, hra.POCET, d.id);
  }
});

test('žiadne dieťa sa nedá posunúť skenom na inom než očakávanom stanovišti', () => {
  for (const d of hra.DETI) {
    const trasa = hra.trasaDietata(d);
    for (let postup = 0; postup < hra.POCET; postup++) {
      for (let st = 0; st < hra.POCET; st++) {
        const v = hra.vyhodnot(d, postup, st);
        assert.strictEqual(v.zapisat, st === trasa[postup], `${d.id} postup ${postup} stanovište ${st}`);
      }
    }
  }
});

console.log(`\n${testov} testov OK.\n`);
