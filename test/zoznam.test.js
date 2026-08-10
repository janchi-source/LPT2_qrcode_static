// Kontrolný zoznam detí — nezávislý od Excelu aj od generátora.
//
// Prečo existuje: dáta appky vznikajú z Excelu, ktorý sa počas príprav mení.
// V auguste 2026 v ňom jedno dieťa chýbalo úplne (Sofia Soláriková) a jedno
// bolo vedené pod cudzím menom (Benjamin Bros ako druhá „Hana Jankeje").
// Tento súbor je preto ručne odsúhlasený zoznam — keď sa dáta rozídu s ním,
// test spadne a povie presne KTO pribudol alebo zmizol.
//
// Keď do tábora naozaj pribudne alebo odíde dieťa, opraví sa najprv Excel,
// potom sa spustí scripts/generuj-deti.py — a až potom sa doplní sem.
//
// Stav: 107 detí odsúhlasených 9. 8. 2026 + bratia Michalíkovci, ktorí pribudli
// až po vytlačení náramkov (dostali čísla 108 a 109).
const assert = require('assert');
const hra = require('../lib/hra');

let testov = 0;
function test(nazov, fn) { fn(); testov++; console.log('  ✓ ' + nazov); }

console.log('zoznam.test.js');

const ZOZNAM = [
  ['Jana', 'Argalášová'],
  ['Adam', 'Baláž'],
  ['Erik', 'Bolha'],
  ['Monika', 'Bou Ezzeddine'],
  ['Jakub', 'Brček'],
  ['Hana', 'Brčeková'],
  ['Benjamin', 'Bros'],
  ['Damian', 'Bros'],
  ['Adam', 'Bugri'],
  ['Šimon', 'Dobák'],
  ['Viliam', 'Dobák'],
  ['Hana', 'Dobáková'],
  ['Miriam', 'Dobáková'],
  ['Matúš', 'Ďurčík'],
  ['Katarina', 'FILIPOVA'],
  ['Timotej', 'Firický'],
  ['Gréta', 'Földešová'],
  ['Tamara', 'Földešová'],
  ['Nicol', 'Fusekova'],
  ['Adam', 'Gaštan'],
  ['Greta', 'Goliasova'],
  ['Lukáš', 'Gutten'],
  ['Veronika', 'Hečková'],
  ['Hermína', 'Hečková'],
  ['Cecília', 'Hečková'],
  ['Johanka', 'Hrnčířová'],
  ['Dávid', 'Hudec'],
  ['Samuel', 'Hudec'],
  ['Šimon', 'Hurbanič'],
  ['Alžbeta', 'Hurbaničová'],
  ['Tomáš', 'Husár'],
  ['Hanka', 'Husarova'],
  ['Dominika', 'Chovanová'],
  ['Terézia', 'Chovanová'],
  ['Michal', 'Chvála'],
  ['Oliver', 'ík'],
  ['Šimon', 'ík'],
  ['Pavol', 'Jakubec'],
  ['Adam', 'Jankeje'],
  ['Hana', 'Jankeje'],
  ['Ján', 'Jankeje'],
  ['Veronika', 'Jungová'],
  ['Klára', 'Kellová'],
  ['Michaela', 'Kósová'],
  ['Nina', 'Kósová'],
  ['Alexander', 'Kozák'],
  ['Nikola', 'Krnčanová'],
  ['Tamarka', 'Kubov'],
  ['Ondrej', 'Kullač'],
  ['Diana', 'Kurucová'],
  ['Dominika', 'Kuzmická'],
  ['Filip', 'Lendel'],
  ['Daniel', 'Lengyel'],
  ['Jakub', 'Likavčan'],
  ['Nina', 'Mackovičová'],
  ['Timotej', 'Maco'],
  ['Andrej', 'Maco'],
  ['Tatianka', 'Macová'],
  ['Paulína', 'Markovičová'],
  ['Petra', 'Martinkovičová'],
  ['Oliver', 'Michalík'],
  ['Šimon', 'Michalík'],
  ['Alexandra', 'Mihalenková'],
  ['Tobias', 'Moravek'],
  ['Isabelle', 'Mruk'],
  ['Lukáš', 'Noskovič'],
  ['Michal', 'Olík'],
  ['Karolina', 'Olveczka'],
  ['Daniel', 'Pálinkás'],
  ['Lýdia', 'Pálinkásová'],
  ['Milena', 'Patoprstá'],
  ['Andrej', 'Petrovits'],
  ['Filip', 'Petrovits'],
  ['Gloria', 'Podskocova'],
  ['Ema', 'Poláková'],
  ['Hana', 'Priklerová'],
  ['Vivien', 'Rajnincová'],
  ['Tomáš', 'Remenár'],
  ['Dominik', 'Renčko'],
  ['Kristínka', 'Renčková'],
  ['Dominik', 'Režňák'],
  ['Natália', 'Režňáková'],
  ['Viktória', 'Režňáková'],
  ['Šimon', 'Rim'],
  ['Jozef', 'Rim'],
  ['Lukáš', 'Sádovský'],
  ['Ivan', 'Serhiychuk'],
  ['Šimon', 'Smolen'],
  ['Sofia', 'Soláriková'],
  ['Liliana', 'Strnová'],
  ['Tomáš', 'Šabo'],
  ['Mária', 'Šoltésová'],
  ['Eliška', 'Šoltésová'],
  ['Lea', 'Ťichánska'],
  ['Šimon', 'Tichánsky'],
  ['Vilma', 'Timková'],
  ['Kristína', 'Tomčákovská'],
  ['Barbora', 'Tomová'],
  ['Laura', 'Trgová'],
  ['Ela Mária', 'Turočeková'],
  ['Sofia Anna', 'Turočeková'],
  ['Sofi', 'Tusinovschi'],
  ['Tomáš', 'Uličný'],
  ['Hana', 'Uváčková'],
  ['Lucia', 'Uváčková'],
  ['Vincent', 'Vanovčan'],
  ['Tereza', 'Vanyskova'],
  ['Max', 'Zimmermann'],
  ['Naďa', 'Zrubcová'],
];

// Porovnáva sa bez diakritiky, bez veľkých písmen a bez zdvojených medzier.
// V zozname aj v Exceli sú preklepy v diakritike („Olveczka" / „Olveczká",
// „FILIPOVA" / „Filipová") — to je to isté dieťa a nemá zmysel kvôli tomu
// zhadzovať test. Chýbajúce či nadbytočné dieťa je iná vec.
function kluc(meno, priezvisko) {
  return `${meno} ${priezvisko}`
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

const vZozname = ZOZNAM.map(([m, p]) => kluc(m, p));
const vAppke = hra.DETI.map((d) => kluc(d.meno, d.priezvisko));

function duplicity(zoznam) {
  const pocty = new Map();
  for (const k of zoznam) pocty.set(k, (pocty.get(k) || 0) + 1);
  return [...pocty].filter(([, n]) => n > 1).map(([k, n]) => `${k} (${n}×)`).sort();
}

test(`kontrolný zoznam má ${ZOZNAM.length} detí a žiadne meno v ňom nie je dvakrát`, () => {
  assert.deepStrictEqual(duplicity(vZozname), []);
});

test('appka má rovnaký počet detí ako kontrolný zoznam', () => {
  assert.strictEqual(hra.DETI.length, ZOZNAM.length,
    `appka má ${hra.DETI.length} detí, zoznam ${ZOZNAM.length}`);
});

test('nikto zo zoznamu v appke nechýba', () => {
  const chybaju = vZozname.filter((k) => !vAppke.includes(k)).sort();
  assert.deepStrictEqual(chybaju, [],
    `v appke chýbajú: ${chybaju.join(', ')}`);
});

test('appka nemá nikoho navyše', () => {
  const navyse = vAppke.filter((k) => !vZozname.includes(k)).sort();
  assert.deepStrictEqual(navyse, [],
    `v appke sú navyše: ${navyse.join(', ')}`);
});

test('žiadne dieťa nie je v appke dvakrát', () => {
  assert.deepStrictEqual(duplicity(vAppke), []);
});

test('každé dieťa zo zoznamu má práve jeden náramok a jednu skupinku', () => {
  for (const [m, p] of ZOZNAM) {
    const najdene = hra.DETI.filter((d) => kluc(d.meno, d.priezvisko) === kluc(m, p));
    assert.strictEqual(najdene.length, 1, `${m} ${p}: nájdených ${najdene.length}`);
    const d = najdene[0];
    assert.ok(d.naramok >= 1 && d.naramok <= hra.DETI.length, `${m} ${p}: náramok ${d.naramok}`);
    assert.ok(d.skupina >= 1 && d.skupina <= hra.POCET, `${m} ${p}: skupinka ${d.skupina}`);
  }
});

// Odlišný zápis toho istého mena test nezhodí, ale nech je vidno, kde je.
const inyZapis = [];
for (const [m, p] of ZOZNAM) {
  const d = hra.DETI.find((x) => kluc(x.meno, x.priezvisko) === kluc(m, p));
  const vAppkeZnenie = `${d.meno} ${d.priezvisko}`.replace(/\s+/g, ' ').trim();
  const vZoznameZnenie = `${m} ${p}`.replace(/\s+/g, ' ').trim();
  if (vAppkeZnenie !== vZoznameZnenie) inyZapis.push(`${vZoznameZnenie} → ${vAppkeZnenie}`);
}
if (inyZapis.length) {
  console.log(`  · ${inyZapis.length} mien má iný zápis (diakritika, veľké písmená) — to isté dieťa:`);
  for (const x of inyZapis) console.log('      ' + x);
}

console.log(`\n${testov} testov OK — zoznam sedí, nikto nechýba ani neprebýva.\n`);
