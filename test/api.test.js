// Celá hra cez HTTP, tak ako ju v nedeľu odohrajú telefóny animátorov.
// Beží nad súborovým úložiskom v dočasnom priečinku, ostré dáta neohrozí.
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const assert = require('assert');

const docasny = fs.mkdtempSync(path.join(os.tmpdir(), 'lpt2s-'));
process.env.LPT2S_DATA = path.join(docasny, 'stav.json');

const hra = require('../lib/hra');
const { handler } = require('../lib/handler');

let testov = 0;
const server = http.createServer(handler);

function volaj(cesta, metoda = 'GET', telo = null) {
  const port = server.address().port;
  return fetch(`http://127.0.0.1:${port}/api/${cesta}`, {
    method: metoda,
    headers: telo ? { 'Content-Type': 'application/json' } : {},
    body: telo ? JSON.stringify(telo) : undefined,
  }).then((r) => r.json());
}

const sken = (kod, stanoviste) => volaj('sken', 'POST', { kod, stanoviste });
const HESLO = 'sex';

async function test(nazov, fn) { await fn(); testov++; console.log('  ✓ ' + nazov); }

(async () => {
  console.log('api.test.js');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  await test('/api/info vráti 10 stanovíšť a všetky deti', async () => {
    const i = await volaj('info');
    assert.strictEqual(i.stanovistia.length, 10);
    assert.strictEqual(i.pocet_deti, hra.DETI.length);
    assert.strictEqual(i.rezim_db, 'subor');
  });

  await test('neznámy kód sa nikam nezapíše', async () => {
    const r = await sken('D999', 0);
    assert.strictEqual(r.vysledok, 'neznamy');
  });

  const d = hra.DETI.find((x) => x.naramok === 42);
  const t = hra.trasaDietata(d);

  await test('sken na zlom stanovišti neposunie a povie správne miesto', async () => {
    const zle = (t[0] + 5) % 10;
    const r = await sken(d.id, zle);
    assert.strictEqual(r.vysledok, 'zle_stanoviste');
    assert.strictEqual(r.ma_ist_na, t[0]);
    assert.strictEqual(r.kolo, 0, 'zlý sken nesmie nič zapísať');
  });

  await test('sken na správnom stanovišti posunie o kolo', async () => {
    const r = await sken(String(d.naramok), t[0]);
    assert.ok(r.vysledok === 'ok' || r.vysledok === 'presun', r.hlaska);
    assert.strictEqual(r.kolo, 1);
    assert.strictEqual(r.dalsie, t[1]);
    assert.ok(r.skupinka_teraz >= 1 && r.skupinka_teraz <= 10);
  });

  await test('opakovaný sken toho istého kódu na tom istom mieste už neposúva', async () => {
    const r = await sken(d.id, t[0]);
    assert.strictEqual(r.vysledok, 'zle_stanoviste');
    assert.ok(r.hlaska.includes('Tu už bolo'));
    const stav = await volaj('stav');
    assert.strictEqual(stav.deti.find((x) => x.id === d.id).postup, 1);
  });

  await test('override, reset ani simulácia neprejdú bez hesla', async () => {
    const povodny = (await volaj('stav')).deti.find((x) => x.id === d.id).postup;
    for (const [cesta, telo] of [
      ['override', { id: d.id, postup: 9 }],
      ['override', { id: d.id, postup: 9, heslo: 'zle' }],
      ['override', { id: d.id, postup: 9, heslo: 'SEX' }],
      ['override', { id: d.id, postup: 9, heslo: '' }],
      ['simulacia', { kod: d.id }],
      ['simulacia', { kod: d.id, heslo: 'zle' }],
      ['reset', { potvrdenie: 'ZMAZAT' }],
      ['reset', { potvrdenie: 'ZMAZAT', heslo: 'zle' }],
    ]) {
      const r = await volaj(cesta, 'POST', telo);
      assert.ok(r.error, `${cesta} prešlo bez hesla: ${JSON.stringify(telo)}`);
      assert.strictEqual(r.treba_heslo, true, cesta);
    }
    // ...a naozaj sa nič nezmenilo
    const stav = await volaj('stav');
    assert.strictEqual(stav.deti.find((x) => x.id === d.id).postup, povodny);
    assert.ok(stav.deti.some((x) => x.postup > 0), 'reset bez hesla predsa len prešiel');
  });

  await test('heslo sa toleruje s medzerami okolo, nie s inou veľkosťou písmen', async () => {
    const r = await volaj('override', 'POST', { id: d.id, postup: 1, heslo: `  ${HESLO}  ` });
    assert.ok(r.ok, JSON.stringify(r));
    const zle = await volaj('override', 'POST', { id: d.id, postup: 1, heslo: HESLO.toUpperCase() });
    assert.strictEqual(zle.treba_heslo, true);
  });

  await test('override nastaví postup natvrdo (aj dozadu)', async () => {
    let r = await volaj('override', 'POST', { id: d.id, postup: 5, heslo: HESLO });
    assert.strictEqual(r.dieta.postup, 5);
    // sken teraz musí sedieť s 6. stanovišťom trasy, nie s druhým
    const zly = await sken(d.id, t[1]);
    assert.strictEqual(zly.vysledok, 'zle_stanoviste');
    const dobry = await sken(d.id, t[5]);
    assert.ok(dobry.vysledok === 'ok' || dobry.vysledok === 'presun', dobry.hlaska);
    r = await volaj('override', 'POST', { id: d.id, postup: 0, heslo: HESLO });
    assert.strictEqual(r.dieta.postup, 0);
  });

  await test('override odmietne nezmyselnú hodnotu', async () => {
    const r = await volaj('override', 'POST', { id: d.id, postup: 11, heslo: HESLO });
    assert.ok(r.error);
    assert.ok(!r.treba_heslo, 'zlá hodnota sa nemá tváriť ako zlé heslo');
  });

  await test('jeden QR kód prejde všetkých 10 stanovíšť sám, bez ostatných detí', async () => {
    const r = await volaj('simulacia', 'POST', { kod: d.id, heslo: HESLO });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.kroky.length, 10);
    assert.strictEqual(r.dieta.postup, 10);
    assert.deepStrictEqual(r.kroky.map((k) => k.stanoviste), t);
    // ostatné deti sa nepohli
    const stav = await volaj('stav');
    assert.strictEqual(stav.hotovo, 1);
    assert.strictEqual(stav.deti.filter((x) => x.postup > 0).length, 1);
  });

  await test('reset vyžaduje potvrdenie a potom vynuluje všetko', async () => {
    assert.ok((await volaj('reset', 'POST', { heslo: HESLO })).error);
    assert.ok((await volaj('reset', 'POST', { potvrdenie: 'ZMAZAT', heslo: HESLO })).ok);
    const stav = await volaj('stav');
    assert.strictEqual(stav.deti.filter((x) => x.postup > 0).length, 0);
  });

  await test('rozpis pre stanovište a kolo sedí s trasami', async () => {
    for (let st = 0; st < 10; st++) {
      for (let kolo = 1; kolo <= 10; kolo++) {
        const r = await volaj(`rozpis?stanoviste=${st}&kolo=${kolo}`);
        const ocakavane = hra.ktoJeNaStanovisti(st, kolo - 1).map((x) => x.id).sort();
        assert.deepStrictEqual(r.deti.map((x) => x.id).sort(), ocakavane, `stanovište ${st}, kolo ${kolo}`);
      }
    }
  });

  await test(`CELÁ HRA: ${hra.DETI.length} detí × 10 kôl prejde bez jediného zlého skenu`, async () => {
    let skenov = 0;
    let presunov = 0;
    for (let r = 0; r < 10; r++) {
      for (let st = 0; st < 10; st++) {
        const tam = hra.ktoJeNaStanovisti(st, r);
        assert.ok(tam.length === 10 || tam.length === 11, `kolo ${r + 1}, stanovište ${st}: ${tam.length} detí`);
        for (const dieta of tam) {
          const odp = await sken(dieta.id, st);
          assert.ok(['ok', 'presun', 'ciel'].includes(odp.vysledok),
            `${dieta.meno} v kole ${r + 1} na stanovišti ${st}: ${odp.hlaska}`);
          assert.strictEqual(odp.kolo, r + 1);
          if (odp.vysledok === 'presun') presunov++;
          skenov++;
        }
      }
    }
    assert.strictEqual(skenov, hra.DETI.length * 10);
    // Podľa profilu trás: 9+7+5+3+0+3+5+7+9 = 48 prevedení na stanovište a hru,
    // z toho 10 stanovíšť ⇒ 480, plus prevedenia jedenástych detí.
    assert.ok(presunov >= 480 && presunov <= 560, `prevedení bolo ${presunov}`);

    const stav = await volaj('stav');
    assert.strictEqual(stav.hotovo, hra.DETI.length);
    // a deti naozaj skončili tam, kde majú
    for (const dieta of stav.deti) {
      assert.strictEqual(dieta.postup, 10);
      assert.strictEqual(dieta.trasa[9], hra.domovskeStanoviste(dieta.skupina));
    }
  });

  await test('po dohratí sa už dieťa neposúva ďalej', async () => {
    const r = await sken(d.id, 0);
    assert.strictEqual(r.vysledok, 'hotovo');
  });

  await test('log si pamätá posledné skeny', async () => {
    const r = await volaj('log');
    assert.ok(r.log.length > 0);
    assert.ok(r.log[0].meno);
  });

  server.close();
  fs.rmSync(docasny, { recursive: true, force: true });
  console.log(`\n${testov} testov OK.\n`);
})().catch((e) => {
  server.close();
  console.error(e);
  process.exit(1);
});
