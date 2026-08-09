#!/usr/bin/env python3
"""Vygeneruje data/deti.json zo súboru „skupinky - vytlačiť.xlsx".

Spustí sa RAZ, keď sa zmení zoznam detí alebo zloženie skupiniek:

    pip3 install openpyxl
    python3 scripts/generuj-deti.py ~/Downloads/'skupinky - vytlačiť.xlsx'
    npm test          # overí, že hra s novými dátami stále vyjde

Čo súbor obsahuje a prečo:

  skupina  — číslo skupinky z Excelu (1–10). Určuje, kde dieťa skončí.
  trieda   — ktorá z piatich možných trás (0–4, podľa počtu prevedení
             0/2/4/6/8). Šablóny sú v lib/hra.js; samotná trasa sa
             z (skupina, trieda) dopočíta tam, tu sa neukladá.
  naramok  — číslo náramku. Čísla sa prideľujú v BLOKOCH podľa štartového
             stanovišťa, aby sa deti dali na začiatku rozdeliť podľa čísel
             (manuál, s. 2), a vnútri bloku sú zamiešané seedom, aby sa
             skupinka nedala uhádnuť z čísla.

Každá skupinka rozdelí deti medzi trasy rovnako (POCTY nižšie). Vďaka tomu je
na každom stanovišti v každom kole presne 10 alebo 11 detí — overuje
test/trasy.test.js.
"""
import json
import random
import sys
from pathlib import Path

import openpyxl

N = 10
TRIEDA_NAVYSE = 10        # šablóna pre 11. dieťa v skupinke
SEED_TRIED = 1000         # poradie tried vnútri skupinky
SEED_NARAMKOV = 20260810  # zamiešanie čísel vnútri štartového bloku

KOREN = Path(__file__).resolve().parent.parent

# Musí sedieť so SABLONY v lib/hra.js — test/trasy.test.js to porovná.
# Päť trás, ktoré pravidlá manuálu dovoľujú (0, 2, 4, 6 a 8 prevedení).
SABLONY = [
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 0],
    [9, 1, 2, 3, 4, 5, 6, 7, 8, 0],
    [7, 9, 1, 2, 3, 4, 5, 6, 8, 0],
    [5, 7, 9, 1, 2, 3, 4, 6, 8, 0],
    [3, 5, 7, 9, 1, 2, 4, 6, 8, 0],
]

# Koľko detí v skupinke ide ktorou trasou. Súčet = 10; skupinka s 11 deťmi
# pridá jedno navyše na trasu TRIEDA_NAVYSE.
#
# Toto je jediné, čo sa pri trasách dá voliť — a určuje, koľko detí sa
# v ktorom kole na stanovišti obmení:
#
#   kolo      1  2  3  4  5  6  7  8  9
#   obmení sa 9  7  5  3  0  3  5  7  9   detí z 10
#
# Nula v 5. kole je vlastnosť pravidiel, nie tohto nastavenia: piaty krok je
# +1 vo všetkých piatich trasách (viď lib/hra.js).
POCTY = [1, 2, 2, 2, 3]
TRIEDA_NAVYSE = 2


def domovske(skupina):
    """Štvrť skupinky — tam, kde ju manuál (s. 4) necháva v poslednom kole."""
    return (N - skupina) % N


def trasa(skupina, trieda):
    H = domovske(skupina)
    return [(H + p) % N for p in SABLONY[trieda]]


def nacitaj(cesta):
    wb = openpyxl.load_workbook(cesta, data_only=True)

    # Ročníky sú len v prehľadovom hárku, kľúčované menom + priezviskom.
    rocniky = {}
    ws = wb['skupinky pre animátorov']
    for row in ws.iter_rows(values_only=True):
        for base in (1, 6, 11, 16, 21):
            bunky = (row[base:base + 4] + (None,) * 4)[:4]
            meno, prie, rocnik = bunky[0], bunky[1], bunky[2]
            if isinstance(meno, str) and isinstance(prie, str) \
                    and meno.strip() and meno.strip() != 'Animátori:':
                if isinstance(rocnik, str) and rocnik.strip():
                    rocniky[(meno.strip(), prie.strip())] = rocnik.strip()

    skupiny = []
    for g in range(1, N + 1):
        rows = list(wb[f'{g}.skupinka'].iter_rows(values_only=True))
        hlavicka = rows[1]
        animatori = [x.strip() for x in (hlavicka[1], hlavicka[2])
                     if isinstance(x, str) and x.strip()]
        deti = []
        for r in rows[2:]:
            meno, prie = r[1], r[2]
            if not (isinstance(meno, str) and meno.strip()):
                continue
            kluc = (meno.strip(), (prie or '').strip())
            deti.append({'meno': meno.strip(), 'priezvisko': (prie or '').strip(),
                         'rocnik': rocniky.get(kluc)})
        skupiny.append({'cislo': g, 'animatori': animatori, 'deti': deti})
    return skupiny


def main():
    cesta = sys.argv[1] if len(sys.argv) > 1 else None
    if not cesta:
        sys.exit('Použitie: python3 scripts/generuj-deti.py <cesta k xlsx>')
    skupiny = nacitaj(cesta)

    zaznamy = []
    for s in skupiny:
        triedy = [t for t, kolko in enumerate(POCTY) for _ in range(kolko)]
        if len(s['deti']) == sum(POCTY) + 1:
            triedy.append(TRIEDA_NAVYSE)
        if len(triedy) != len(s['deti']):
            sys.exit(f"Skupinka {s['cislo']} má {len(s['deti'])} detí — podporené je "
                     f'{sum(POCTY)} alebo {sum(POCTY) + 1}. Pri inom počte treba upraviť '
                     'POCTY a znova spustiť npm test.')
        random.Random(SEED_TRIED + s['cislo']).shuffle(triedy)
        for dieta, trieda in zip(s['deti'], triedy):
            zaznamy.append({**dieta, 'skupina': s['cislo'], 'trieda': trieda,
                            'start': trasa(s['cislo'], trieda)[0]})

    rng = random.Random(SEED_NARAMKOV)
    cislo = 1
    bloky = []
    for st in range(N):
        v_bloku = [z for z in zaznamy if z['start'] == st]
        rng.shuffle(v_bloku)
        od = cislo
        for z in v_bloku:
            z['naramok'] = cislo
            cislo += 1
        bloky.append({'stanoviste': st, 'od': od, 'do': cislo - 1})

    zaznamy.sort(key=lambda z: z['naramok'])
    vystup = {
        'deti': [{'id': 'D%03d' % z['naramok'], 'naramok': z['naramok'],
                  'meno': z['meno'], 'priezvisko': z['priezvisko'], 'rocnik': z['rocnik'],
                  'skupina': z['skupina'], 'trieda': z['trieda']} for z in zaznamy],
        'animatori': {str(s['cislo']): s['animatori'] for s in skupiny},
        'startove_bloky': bloky,
    }
    cielovy = KOREN / 'data' / 'deti.json'
    cielovy.write_text(json.dumps(vystup, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{len(zaznamy)} detí → {cielovy}')
    for b in bloky:
        print(f"  náramky {b['od']:>3}–{b['do']:<3} → stanovište {b['stanoviste']} "
              f"({b['do'] - b['od'] + 1} detí)")
    print('\nTeraz spusti `npm test` — overí, že hra s novými dátami vyjde.')


if __name__ == '__main__':
    main()
