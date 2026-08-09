// Supabase backend bez Supabase: `fetch` je podvrhnutý, takže sa dá overiť
// presne to, čo sa inak zistí až na tábore — aké požiadavky idú do PostgRESTu.
//
// Kontroluje sa hlavne podmienený UPDATE (`kroky=eq.<očakávané>`), na ktorom
// stojí to, že sa dieťa pri dvoch súbežných skenoch neposunie dvakrát.
const assert = require('assert');

process.env.SUPABASE_URL = 'https://priklad.supabase.co/';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'tajny-kluc';
delete require.cache[require.resolve('../lib/ulozisko')];
const db = require('../lib/ulozisko');

let testov = 0;
let poziadavky = [];
let odpovede = [];

// Podvrhnutý fetch: zaznamená požiadavku a vráti pripravenú odpoveď.
globalThis.fetch = async (url, opts) => {
  poziadavky.push({
    url: String(url),
    metoda: opts.method,
    prefer: (opts.headers || {}).Prefer || null,
    apikey: (opts.headers || {}).apikey || null,
    telo: opts.body ? JSON.parse(opts.body) : null,
  });
  const d = odpovede.shift() || { ok: true, telo: [] };
  return { ok: d.ok !== false, status: d.status || 200, text: async () => JSON.stringify(d.telo ?? []) };
};

async function test(nazov, fn) {
  poziadavky = []; odpovede = [];
  await fn();
  testov++;
  console.log('  ✓ ' + nazov);
}

(async () => {
  console.log('supabase.test.js');

  await test('backend sa zapne podľa premenných prostredia', async () => {
    assert.strictEqual(db.jeSupabase, true);
    assert.strictEqual(db.rezim, 'supabase');
  });

  await test('kľúč ide v hlavičke, nie v adrese', async () => {
    odpovede = [{ telo: [{ kroky: 3 }] }];
    await db.postup('D007');
    assert.strictEqual(poziadavky[0].apikey, 'tajny-kluc');
    assert.ok(!poziadavky[0].url.includes('tajny-kluc'), 'kľúč sa dostal do URL');
  });

  await test('čítanie postupu jedného dieťaťa', async () => {
    odpovede = [{ telo: [{ kroky: 3 }] }];
    assert.strictEqual(await db.postup('D007'), 3);
    assert.strictEqual(poziadavky[0].metoda, 'GET');
    assert.ok(poziadavky[0].url.endsWith('/rest/v1/lpt2s_postup?id=eq.D007&select=kroky'), poziadavky[0].url);
  });

  await test('dieťa bez riadku má postup 0', async () => {
    odpovede = [{ telo: [] }];
    assert.strictEqual(await db.postup('D007'), 0);
  });

  await test('čítanie všetkých postupov vráti mapu', async () => {
    odpovede = [{ telo: [{ id: 'D001', kroky: 2 }, { id: 'D002', kroky: 0 }] }];
    assert.deepStrictEqual(await db.postupy(), { D001: 2, D002: 0 });
  });

  await test('prvý sken založí riadok jedinou požiadavkou', async () => {
    odpovede = [{ telo: [{ id: 'D007', kroky: 1 }] }];
    assert.strictEqual(await db.posun('D007', 0, 1), true);
    assert.strictEqual(poziadavky.length, 1);
    assert.strictEqual(poziadavky[0].metoda, 'POST');
    assert.ok(poziadavky[0].prefer.includes('ignore-duplicates'));
    assert.deepStrictEqual(poziadavky[0].telo, { id: 'D007', kroky: 1 });
  });

  await test('keď riadok už existuje, prvý sken padne na podmienený UPDATE', async () => {
    odpovede = [{ telo: [] }, { telo: [{ id: 'D007', kroky: 1 }] }];
    assert.strictEqual(await db.posun('D007', 0, 1), true);
    assert.strictEqual(poziadavky.length, 2);
    assert.strictEqual(poziadavky[1].metoda, 'PATCH');
    assert.ok(poziadavky[1].url.includes('kroky=eq.0'), poziadavky[1].url);
  });

  await test('ďalší posun je podmienený UPDATE s očakávanou hodnotou', async () => {
    odpovede = [{ telo: [{ id: 'D007', kroky: 4 }] }];
    assert.strictEqual(await db.posun('D007', 3, 4), true);
    assert.strictEqual(poziadavky.length, 1);
    assert.strictEqual(poziadavky[0].metoda, 'PATCH');
    assert.ok(poziadavky[0].url.includes('id=eq.D007'), poziadavky[0].url);
    assert.ok(poziadavky[0].url.includes('kroky=eq.3'), poziadavky[0].url);
    assert.strictEqual(poziadavky[0].telo.kroky, 4);
  });

  await test('súbežný sken: prázdna odpoveď = konflikt, posun neprešiel', async () => {
    odpovede = [{ telo: [] }];
    assert.strictEqual(await db.posun('D007', 3, 4), false);
  });

  await test('override je upsert cez on_conflict', async () => {
    odpovede = [{ telo: [] }];
    await db.nastav('D007', 6);
    assert.strictEqual(poziadavky[0].metoda, 'POST');
    assert.ok(poziadavky[0].url.includes('on_conflict=id'), poziadavky[0].url);
    assert.ok(poziadavky[0].prefer.includes('merge-duplicates'));
    assert.strictEqual(poziadavky[0].telo.kroky, 6);
  });

  await test('reset zmaže obe tabuľky (PostgREST vyžaduje filter)', async () => {
    odpovede = [{ telo: [] }, { telo: [] }];
    await db.vynuluj();
    assert.strictEqual(poziadavky.length, 2);
    for (const p of poziadavky) {
      assert.strictEqual(p.metoda, 'DELETE');
      assert.ok(p.url.includes('?'), 'mazanie bez filtra by PostgREST odmietol: ' + p.url);
    }
  });

  await test('log sa zapisuje pod stĺpcom `dieta` a číta späť ako `id`', async () => {
    odpovede = [{ telo: [] }];
    await db.zapisDoLogu({ id: 'D007', naramok: 7, meno: 'Test Testovský', stanoviste: 2, kolo: 3, vysledok: 'ok', ts: '2026-08-10T09:00:00.000Z' });
    assert.strictEqual(poziadavky[0].telo.dieta, 'D007');

    poziadavky = [];
    odpovede = [{ telo: [{ dieta: 'D007', naramok: 7, meno: 'Test Testovský', stanoviste: 2, kolo: 3, vysledok: 'ok', ts: '2026-08-10T09:00:00.000Z' }] }];
    const z = await db.log(5);
    assert.strictEqual(z[0].id, 'D007');
    assert.ok(poziadavky[0].url.includes('order=ts.desc'), poziadavky[0].url);
    assert.ok(poziadavky[0].url.includes('limit=5'), poziadavky[0].url);
  });

  await test('chýbajúca tabuľka vráti návod so SQL, nie surovú chybu', async () => {
    odpovede = [{ ok: false, status: 404, telo: { code: 'PGRST205', message: 'relation does not exist' } }];
    await assert.rejects(() => db.postup('D007'), (e) => {
      assert.ok(e.message.includes('create table lpt2s_postup'), e.message);
      return true;
    });
  });

  await test('/api/db-test overí aj to, že posun zo starej hodnoty NEPREJDE', async () => {
    odpovede = [
      { telo: [] }, { telo: [] },                       // upratanie (postup + log)
      { telo: [{ id: '__skuska__', kroky: 1 }] },       // posun 0 → 1 (INSERT)
      { telo: [{ kroky: 1 }] },                         // čítanie
      { telo: [{ id: '__skuska__', kroky: 2 }] },       // posun 1 → 2 prejde
      { telo: [] },                                     // posun 1 → 9 neprejde
      { telo: [] },                                     // zápis do logu
      { telo: [] }, { telo: [] },                       // upratanie
    ];
    const r = await db.skuska();
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.rezim, 'supabase');
    assert.strictEqual(r.kroky.atomicky_posun, 'OK');
  });

  await test('db-test ohlási, keď podmienený UPDATE prepustí starú hodnotu', async () => {
    odpovede = [
      { telo: [] }, { telo: [] },
      { telo: [{ id: '__skuska__', kroky: 1 }] },
      { telo: [{ kroky: 1 }] },
      { telo: [{ id: '__skuska__', kroky: 2 }] },
      { telo: [{ id: '__skuska__', kroky: 9 }] },       // chybne prešlo
      { telo: [] }, { telo: [] },
    ];
    const r = await db.skuska();
    assert.strictEqual(r.ok, false);
    assert.ok(r.chyba.includes('starej hodnoty'), r.chyba);
  });

  console.log(`\n${testov} testov OK.\n`);
})().catch((e) => { console.error(e); process.exit(1); });
