// Úložisko. Zámerne minimálne: hra je vopred vypočítaná, takže sa ukladá
// jediná vec — koľko stanovíšť má ktoré dieťa za sebou (0–10).
//
//   lpt2s_postup   id (text, PK) + kroky (0–10)      jeden riadok na dieťa
//   lpt2s_log      posledné skeny, len na náhľad     (na hru netreba)
//
// Backend sa vyberie sám:
//   • Supabase (Postgres cez PostgREST) — keď je nastavené SUPABASE_URL
//     + SUPABASE_SERVICE_ROLE_KEY
//   • JSON súbor v data/ — lokálny vývoj, keď nie je nastavené nič
//
// Prečo riadok na dieťa a nie jeden JSON dokument: skenuje 10 telefónov naraz.
// Každý sken sa dotkne len svojho riadku, takže si zápisy nemajú ako liezť do
// cesty. Posun je navyše `UPDATE ... WHERE kroky = <očakávané>` — porovnanie aj
// zápis robí databáza v jednej operácii, takže keď dvaja naskenujú to isté dieťa
// v tej istej sekunde, posunie sa práve raz.
//
// Prečo Supabase a nie Redis: atomický posun je obyčajný UPDATE s podmienkou,
// netreba naň Lua skript (EVAL), ktorý časť poskytovateľov Redisu zakazuje a
// ktorý sa prejaví až pri prvom súbežnom skene. Komunikuje sa bezstavovým
// HTTPS — odpadá držané TCP spojenie, ktoré sa v serverless prostredí stráca.

const fs = require('fs');
const path = require('path');

const ZAKLAD = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
// service_role kľúč obchádza Row Level Security. Appka beží celá na serveri
// (do prehliadača sa kľúč nikdy nedostane), takže je to správna voľba — anon
// kľúč by pri zapnutom RLS zápis odmietol.
const KLUC = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const T_POSTUP = process.env.LPT2S_TABULKA || 'lpt2s_postup';
const T_LOG = process.env.LPT2S_TABULKA_LOG || 'lpt2s_log';
const LIMIT_MS = Number(process.env.LPT2S_TIMEOUT_MS || 5000);
const MAX_LOG = 500;

const jeSupabase = !!(ZAKLAD && KLUC);
const SUBOR = process.env.LPT2S_DATA || path.join(__dirname, '..', 'data', 'stav.json');

const NAVOD_TABULKA =
  'Tabuľky v databáze neexistujú. Vytvor ich v Supabase (SQL Editor):\n'
  + `create table ${T_POSTUP} (\n`
  + '  id text primary key,\n'
  + '  kroky smallint not null default 0,\n'
  + '  zmenene timestamptz not null default now()\n'
  + ');\n'
  + `create table ${T_LOG} (\n`
  + '  id bigserial primary key,\n'
  + '  dieta text not null,\n'
  + '  naramok int,\n'
  + '  meno text,\n'
  + '  stanoviste smallint,\n'
  + '  kolo smallint,\n'
  + '  vysledok text,\n'
  + '  ts timestamptz not null default now()\n'
  + ');';

// --- Supabase (PostgREST) ---------------------------------------------------

async function ziadost(cesta, opts = {}) {
  let res;
  try {
    res = await fetch(`${ZAKLAD}/rest/v1/${cesta}`, {
      ...opts,
      headers: {
        apikey: KLUC,
        Authorization: `Bearer ${KLUC}`,
        'Content-Type': 'application/json',
        ...opts.headers,
      },
      signal: AbortSignal.timeout(LIMIT_MS),
    });
  } catch (e) {
    // Bez adresy sa to na hostingu ladí len hádaním. Kľúč sa do hlášky nikdy
    // nedostane — je v hlavičke, nie v URL.
    const preco = e && e.name === 'TimeoutError'
      ? `neodpovedala do ${LIMIT_MS} ms`
      : String((e && e.message) || e);
    throw new Error(`Supabase ${ZAKLAD}: ${preco}`);
  }

  const text = await res.text();
  if (!res.ok) {
    // PostgREST hlási chýbajúcu tabuľku kódom PGRST205 (staršie: 42P01).
    if (/PGRST205|42P01|does not exist/i.test(text)) throw new Error(NAVOD_TABULKA);
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Supabase: odpoveď sa nedá rozparsovať ako JSON');
  }
}

const kluc = (id) => encodeURIComponent(id);

// --- Súborový backend (lokálny vývoj) ---------------------------------------

function citajSubor() {
  try { return JSON.parse(fs.readFileSync(SUBOR, 'utf8')); } catch (e) { return { postupy: {}, log: [] }; }
}

function zapisSubor(stav) {
  fs.mkdirSync(path.dirname(SUBOR), { recursive: true });
  const tmp = SUBOR + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(stav, null, 1), 'utf8');
  fs.renameSync(tmp, SUBOR); // atomicky, aby pád procesu nenechal rozbitý súbor
}

// --- Verejné API ------------------------------------------------------------

async function postupy() {
  if (!jeSupabase) return citajSubor().postupy || {};
  const riadky = await ziadost(`${T_POSTUP}?select=id,kroky&limit=2000`, { method: 'GET' });
  const out = {};
  for (const r of riadky) out[r.id] = Number(r.kroky) || 0;
  return out;
}

async function postup(id) {
  if (!jeSupabase) return Number(citajSubor().postupy[id]) || 0;
  const riadky = await ziadost(`${T_POSTUP}?id=eq.${kluc(id)}&select=kroky`, { method: 'GET' });
  return riadky.length ? Number(riadky[0].kroky) || 0 : 0;
}

// Posun o krok. Vráti true, keď prešiel; false, keď medzitým postup zmenil
// niekto iný — vtedy volajúci sken zopakuje nad čerstvou hodnotou.
async function posun(id, zo, na) {
  if (!jeSupabase) {
    const stav = citajSubor();
    stav.postupy = stav.postupy || {};
    if ((Number(stav.postupy[id]) || 0) !== zo) return false;
    stav.postupy[id] = na;
    zapisSubor(stav);
    return true;
  }

  // Prvý sken dieťaťa: riadok ešte neexistuje. `ignore-duplicates` zariadi, že
  // keď ho medzitým založil niekto iný, nič sa neprepíše a vráti sa prázdne
  // pole — vtedy padáme na obyčajný podmienený UPDATE nižšie.
  if (zo === 0) {
    const vytvorene = await ziadost(T_POSTUP, {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ id, kroky: na }),
    });
    if (vytvorene.length > 0) return true;
  }

  // Podmienka `kroky=eq.<zo>` je súčasťou UPDATE-u, takže porovnanie aj zápis
  // robí databáza naraz. Prázdne pole = žiadny riadok nesedel, čiže konflikt.
  const zmenene = await ziadost(`${T_POSTUP}?id=eq.${kluc(id)}&kroky=eq.${Number(zo)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ kroky: na, zmenene: new Date().toISOString() }),
  });
  return zmenene.length > 0;
}

// Override: nastaví postup natvrdo (admin). Bez kontroly, o to práve ide.
async function nastav(id, hodnota) {
  if (!jeSupabase) {
    const stav = citajSubor();
    stav.postupy = stav.postupy || {};
    stav.postupy[id] = hodnota;
    zapisSubor(stav);
    return;
  }
  await ziadost(`${T_POSTUP}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id, kroky: hodnota, zmenene: new Date().toISOString() }),
  });
}

async function vynuluj() {
  if (!jeSupabase) { zapisSubor({ postupy: {}, log: [] }); return; }
  // PostgREST bez filtra mazať nedovolí (poistka proti omylom), preto podmienky,
  // ktoré platia pre všetky riadky.
  await ziadost(`${T_POSTUP}?kroky=gte.0`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  await ziadost(`${T_LOG}?id=gte.0`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

async function zapisDoLogu(zaznam) {
  if (!jeSupabase) {
    const stav = citajSubor();
    stav.log = [zaznam, ...(stav.log || [])].slice(0, MAX_LOG);
    zapisSubor(stav);
    return;
  }
  await ziadost(T_LOG, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      dieta: zaznam.id,
      naramok: zaznam.naramok,
      meno: zaznam.meno,
      stanoviste: zaznam.stanoviste,
      kolo: zaznam.kolo,
      vysledok: zaznam.vysledok,
      ts: zaznam.ts,
    }),
  });
}

async function log(kolko = 60) {
  if (!jeSupabase) return (citajSubor().log || []).slice(0, kolko);
  const riadky = await ziadost(
    `${T_LOG}?select=dieta,naramok,meno,stanoviste,kolo,vysledok,ts&order=ts.desc,id.desc&limit=${Number(kolko)}`,
    { method: 'GET' },
  );
  return riadky.map((r) => ({
    id: r.dieta, naramok: r.naramok, meno: r.meno,
    stanoviste: r.stanoviste, kolo: r.kolo, vysledok: r.vysledok, ts: r.ts,
  }));
}

// Diagnostika pre /api/db-test. Musí fungovať, aj keď databáza nejde — veď
// práve to má diagnostikovať. Neoveruje len spojenie, ale celý cyklus vrátane
// toho, že podmienený UPDATE naozaj ODMIETNE posun zo zlej hodnoty. Keby to
// nefungovalo, súbežné skeny by sa ticho strácali a prišlo by sa na to na tábore.
async function skuska() {
  if (!jeSupabase) {
    return {
      ok: true,
      rezim: 'subor',
      subor: SUBOR,
      poznamka: 'Lokálny režim. Na Verceli treba SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.',
    };
  }
  const t0 = Date.now();
  const kroky = {};
  const skusobny = '__skuska__';
  let krok = 'spojenie a tabuľky';

  const uprac = async () => {
    await ziadost(`${T_POSTUP}?id=eq.${kluc(skusobny)}`, {
      method: 'DELETE', headers: { Prefer: 'return=minimal' },
    }).catch(() => {});
    await ziadost(`${T_LOG}?dieta=eq.${kluc(skusobny)}`, {
      method: 'DELETE', headers: { Prefer: 'return=minimal' },
    }).catch(() => {});
  };

  try {
    await uprac(); // po prípadnej predošlej neúspešnej skúške
    kroky.spojenie = 'OK';

    krok = 'založenie riadku (INSERT)';
    if (!(await posun(skusobny, 0, 1))) throw new Error('riadok sa nepodarilo založiť');

    krok = 'čítanie (SELECT)';
    if ((await postup(skusobny)) !== 1) throw new Error('prečítalo sa niečo iné, než sa zapísalo');
    kroky.zapis_a_citanie = 'OK';

    krok = 'atomický posun (UPDATE ... WHERE kroky)';
    const preslo = await posun(skusobny, 1, 2);
    const zamietnute = await posun(skusobny, 1, 9);
    if (!preslo) throw new Error('posun neprešiel ani zo správnej hodnoty');
    if (zamietnute) throw new Error('posun prešiel aj zo starej hodnoty — súbežné skeny by sa strácali');
    kroky.atomicky_posun = 'OK';

    krok = 'zápis do logu (INSERT)';
    await zapisDoLogu({
      id: skusobny, naramok: 0, meno: 'skúška', stanoviste: null,
      kolo: 0, vysledok: 'skuska', ts: new Date().toISOString(),
    });
    kroky.log = 'OK';

    await uprac();
    return { ok: true, rezim: 'supabase', ms: Date.now() - t0, kroky };
  } catch (e) {
    await uprac();
    return {
      ok: false,
      rezim: 'supabase',
      ms: Date.now() - t0,
      zlyhalo_na: krok,
      kroky,
      chyba: String((e && e.message) || e),
    };
  }
}

module.exports = {
  jeSupabase,
  rezim: jeSupabase ? 'supabase' : 'subor',
  postupy, postup, posun, nastav, vynuluj, zapisDoLogu, log, skuska,
  NAVOD_TABULKA,
  _tabulky: { postup: T_POSTUP, log: T_LOG },
};
