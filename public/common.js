// Spoločné helpery pre všetky stránky.
async function api(cesta, metoda = 'GET', telo = null) {
  const opts = { method: metoda, headers: {} };
  if (telo) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(telo);
  }
  let res;
  try {
    res = await fetch(cesta, opts);
  } catch (e) {
    return { error: 'Server neodpovedá — skontroluj pripojenie na sieť.' };
  }
  const text = await res.text().catch(() => '');
  try {
    const data = text ? JSON.parse(text) : {};
    if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
    return data;
  } catch (e) {
    // Neprišiel JSON — takmer vždy chybová stránka hostingu. Bez útržku textu
    // sa to ladí len hádaním.
    const utrzok = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
    return { error: `Server vrátil chybu HTTP ${res.status}. Skús /api/db-test.` + (utrzok ? ` [${utrzok}]` : '') };
  }
}

function el(id) { return document.getElementById(id); }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// „A — zasadačka" (krátke, do roletky a do hlavičky)
function stanovisteKratko(st) { return `${st.letter} — ${st.miesto}`; }
// „A — Vymenia sa všetci tí (zasadačka)" (dlhé, do rozpisu)
function stanovisteDlho(st) { return `${st.letter} — ${st.nazov} (${st.miesto})`; }
