// HTTP rozhranie. Používa ho aj Vercel (api/index.js), aj lokálny server.js.
//
// Endpointy:
//   GET  /api/info        stanovištia, skupinky, animátori, režim databázy
//   GET  /api/stav        všetky deti + ich postup (admin)
//   GET  /api/rozpis      kto má byť na ktorom stanovišti v ktorom kole
//   GET  /api/log         posledné skeny
//   GET  /api/db-test     diagnostika databázy
//   POST /api/sken        { kod, stanoviste }
//   POST /api/override    { id, postup }        ručná oprava
//   POST /api/simulacia   { kod }               prežene jeden QR celou hrou
//   POST /api/reset       { potvrdenie: 'ZMAZAT' }
const hra = require('./hra');
const db = require('./ulozisko');

function json(res, kod, telo) {
  res.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(telo));
}

function precitajTelo(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

// Cestu dáva Vercel cez ?cesta=... (rewrite vo vercel.json). Keď tam nie je,
// vezme sa z URL — tak to funguje lokálne aj keby rewrite neplatil.
function zistiCestu(req) {
  const u = new URL(req.url, 'http://x');
  const zParametra = u.searchParams.get('cesta');
  const cesta = zParametra != null ? zParametra : u.pathname.replace(/^\/api\/?/, '');
  return { cesta: cesta.replace(/^\/+|\/+$/g, ''), q: u.searchParams };
}

function stanovisteZoVstupu(hodnota) {
  const i = parseInt(hodnota, 10);
  return Number.isInteger(i) && i >= 0 && i < hra.POCET ? i : null;
}

async function handler(req, res) {
  const { cesta, q } = zistiCestu(req);
  const telo = req.method === 'POST' ? await precitajTelo(req) : {};

  try {
    // --- info ---------------------------------------------------------------
    if (cesta === 'info') {
      return json(res, 200, {
        stanovistia: hra.STANOVISTIA,
        // ktorej skupinke patrí štvrť na ktorom stanovišti (index = stanovište)
        stvrte: hra.STANOVISTIA.map((s) => hra.skupinkaStvrte(s.i)),
        pocet_kol: hra.POCET,
        pocet_deti: hra.DETI.length,
        animatori: hra.ANIMATORI,
        startove_bloky: hra.STARTOVE_BLOKY,
        rezim_db: db.rezim,
      });
    }

    if (cesta === 'db-test') return json(res, 200, await db.skuska());

    // --- stav (admin) -------------------------------------------------------
    if (cesta === 'stav') {
      const p = await db.postupy();
      const deti = hra.DETI.map((d) => hra.prehladDietata(d, Number(p[d.id]) || 0));
      const hotovo = deti.filter((d) => d.hotovo).length;
      // Obsadenosť „naživo": kde ktoré dieťa práve stojí podľa svojho postupu.
      const naStanovisti = Array.from({ length: hra.POCET }, () => 0);
      for (const d of deti) if (!d.hotovo) naStanovisti[d.teraz_na]++;
      return json(res, 200, {
        stanovistia: hra.STANOVISTIA,
        deti,
        hotovo,
        spolu: deti.length,
        na_stanovisti: naStanovisti,
        rezim_db: db.rezim,
      });
    }

    // --- rozpis -------------------------------------------------------------
    if (cesta === 'rozpis') {
      const st = stanovisteZoVstupu(q.get('stanoviste'));
      const kolo = parseInt(q.get('kolo'), 10);
      if (st == null) return json(res, 400, { error: 'chýba alebo je neplatné `stanoviste` (0–9)' });
      if (!(kolo >= 1 && kolo <= hra.POCET)) return json(res, 400, { error: 'chýba alebo je neplatné `kolo` (1–10)' });
      const r = kolo - 1;
      const deti = hra.ktoJeNaStanovisti(st, r).map((d) => {
        const t = hra.trasaDietata(d);
        return {
          id: d.id, naramok: d.naramok, meno: d.meno, priezvisko: d.priezvisko,
          skupina: d.skupina,
          dalsie: r + 1 < hra.POCET ? t[r + 1] : null,
        };
      });
      return json(res, 200, { stanoviste: st, kolo, deti });
    }

    if (cesta === 'log') return json(res, 200, { log: await db.log(80) });

    // --- sken ---------------------------------------------------------------
    if (cesta === 'sken' && req.method === 'POST') {
      const st = stanovisteZoVstupu(telo.stanoviste);
      if (st == null) return json(res, 400, { error: 'Nie je vybrané stanovište.' });
      const dieta = hra.najdiDieta(telo.kod);
      if (!dieta) {
        return json(res, 200, {
          vysledok: 'neznamy', nadpis: 'Neznámy kód',
          hlaska: `⛔ Kód „${String(telo.kod || '').slice(0, 24)}" nie je v zozname detí.`,
        });
      }

      // Compare-and-set: keď medzi načítaním a zápisom stihol dieťa naskenovať
      // niekto iný, posun neprejde a sken sa vyhodnotí znova nad čerstvým
      // postupom. Dieťa sa tak nikdy neposunie o dve stanovištia naraz.
      let odpoved = null;
      for (let pokus = 0; pokus < 3; pokus++) {
        const p = await db.postup(dieta.id);
        const v = hra.vyhodnot(dieta, p, st);
        if (!v.zapisat) { odpoved = v; break; }
        if (await db.posun(dieta.id, p, v.postup)) { odpoved = v; break; }
      }
      if (!odpoved) return json(res, 200, { vysledok: 'chyba', nadpis: 'Skús znova', hlaska: '⚠️ Dieťa práve skenoval niekto iný — zopakuj sken.' });

      await db.zapisDoLogu({
        id: dieta.id, naramok: dieta.naramok, meno: `${dieta.meno} ${dieta.priezvisko}`.trim(),
        stanoviste: st, kolo: odpoved.postup, vysledok: odpoved.vysledok, ts: new Date().toISOString(),
      }).catch(() => { /* log je len náhľad, sken nesmie zhodiť */ });

      return json(res, 200, {
        ...odpoved,
        id: dieta.id,
        naramok: dieta.naramok,
        priezvisko: dieta.priezvisko,
        skupina: dieta.skupina,
        kolo: odpoved.postup,
        pocet_kol: hra.POCET,
      });
    }

    // --- override -----------------------------------------------------------
    if (cesta === 'override' && req.method === 'POST') {
      const dieta = hra.najdiDieta(telo.id || telo.kod);
      const hodnota = parseInt(telo.postup, 10);
      if (!dieta) return json(res, 400, { error: 'Dieťa sa nenašlo.' });
      if (!(hodnota >= 0 && hodnota <= hra.POCET)) return json(res, 400, { error: `Postup musí byť 0–${hra.POCET}.` });
      await db.nastav(dieta.id, hodnota);
      await db.zapisDoLogu({
        id: dieta.id, naramok: dieta.naramok, meno: `${dieta.meno} ${dieta.priezvisko}`.trim(),
        stanoviste: null, kolo: hodnota, vysledok: 'override', ts: new Date().toISOString(),
      }).catch(() => {});
      return json(res, 200, { ok: true, dieta: hra.prehladDietata(dieta, hodnota) });
    }

    // --- simulácia ----------------------------------------------------------
    // Prežene jeden QR kód celou trasou. Overuje, že kód je od ostatných detí
    // nezávislý — nič nečaká na ostatných a nikto ho neblokuje.
    if (cesta === 'simulacia' && req.method === 'POST') {
      const dieta = hra.najdiDieta(telo.kod);
      if (!dieta) return json(res, 400, { error: 'Dieťa sa nenašlo.' });
      const kroky = [];
      const t = hra.trasaDietata(dieta);
      for (let r = await db.postup(dieta.id); r < hra.POCET; r++) {
        const v = hra.vyhodnot(dieta, r, t[r]);
        if (!v.zapisat) break;
        if (!(await db.posun(dieta.id, r, v.postup))) break;
        kroky.push({ kolo: r + 1, stanoviste: t[r], popis: hra.popisStanovista(t[r]) });
      }
      const konecny = await db.postup(dieta.id);
      return json(res, 200, {
        ok: konecny === hra.POCET,
        dieta: hra.prehladDietata(dieta, konecny),
        kroky,
      });
    }

    // --- reset --------------------------------------------------------------
    if (cesta === 'reset' && req.method === 'POST') {
      if (telo.potvrdenie !== 'ZMAZAT') return json(res, 400, { error: 'Reset vyžaduje potvrdenie.' });
      await db.vynuluj();
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'Neznámy endpoint: ' + cesta });
  } catch (e) {
    return json(res, 500, { error: String((e && e.message) || e) });
  }
}

module.exports = { handler };
