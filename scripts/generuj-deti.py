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


def prezdravie(x):
    return x.strip() if isinstance(x, str) else ''


def nacitaj(cesta):
    """Prečíta deti z hárku „skupinky pre animátorov".

    Zdrojom pravdy je ZÁMERNE prehľadová tabuľka, nie hárky 1.skupinka…
    10.skupinka. Tie sa v praxi opravujú menej dôsledne — v auguste 2026 v nich
    chýbalo jedno dieťa a jedno bolo pod cudzím menom, kým tabuľka bola
    v poriadku. Hárky sa preto načítajú tiež, ale len na porovnanie: rozdiely
    sa vypíšu ako upozornenie, nech sa o nich vie.

    Tabuľka má tri stĺpcové bloky (1, 6, 11) a niekoľko pásiem riadkov.
    Pásmo sa začína riadkom „Animátori:", podľa ktorého sa pozná, o ktorú
    skupinku ide — dvojica animátorov je kľúč do hárkov po skupinkách.
    """
    wb = openpyxl.load_workbook(cesta, data_only=True)

    # 1) hárky po skupinkách: dvojica animátorov → číslo skupinky + zoznam detí
    animatori, harky = {}, {}
    podla_dvojice = {}
    for g in range(1, N + 1):
        nazov = f'{g}.skupinka'
        if nazov not in wb.sheetnames:
            sys.exit(f'V súbore chýba hárok „{nazov}".')
        rows = list(wb[nazov].iter_rows(values_only=True))
        dvojica = tuple(x for x in (prezdravie(rows[1][1]), prezdravie(rows[1][2])) if x)
        if len(dvojica) < 2:
            sys.exit(f'Hárok „{nazov}" nemá v druhom riadku dvojicu animátorov.')
        if dvojica in podla_dvojice:
            sys.exit(f'Dvojica animátorov {dvojica} je v súbore dvakrát — '
                     'podľa nej sa priraďujú bloky v prehľadovej tabuľke.')
        animatori[g] = list(dvojica)
        podla_dvojice[dvojica] = g
        harky[g] = [(prezdravie(r[1]), prezdravie(r[2])) for r in rows[2:] if prezdravie(r[1])]

    # 2) prehľadová tabuľka
    if 'skupinky pre animátorov' not in wb.sheetnames:
        sys.exit('V súbore chýba hárok „skupinky pre animátorov".')
    ws = wb['skupinky pre animátorov']
    tabulka = {}
    aktualna = {}
    for i, row in enumerate(ws.iter_rows(values_only=True), 1):
        for base in (1, 6, 11):
            b = [prezdravie(x) for x in (row[base:base + 4] + (None,) * 4)[:4]]
            if b[0] == 'Animátori:':
                dvojica = tuple(x for x in (b[1], b[2]) if x)
                g = podla_dvojice.get(dvojica)
                if g is None:
                    sys.exit(f'Riadok {i}, stĺpec {base + 1}: dvojica animátorov {dvojica} '
                             'nesedí so žiadnym hárkom po skupinkách. Skontroluj mená.')
                aktualna[base] = g
                tabulka.setdefault(g, [])
            elif b[0] and b[1] and aktualna.get(base):
                tabulka[aktualna[base]].append({'meno': b[0], 'priezvisko': b[1],
                                                'rocnik': b[2] or None})

    chyba = [g for g in range(1, N + 1) if g not in tabulka]
    if chyba:
        sys.exit(f'V prehľadovej tabuľke sa nenašli skupinky: {chyba}')

    # 3) kontroly, ktoré musia prejsť
    vsetky = [(g, (d['meno'], d['priezvisko'])) for g in tabulka for d in tabulka[g]]
    videne = {}
    for g, kluc in vsetky:
        if kluc in videne:
            sys.exit(f'Dieťa „{" ".join(kluc)}" je v tabuľke dvakrát '
                     f'(skupinka {videne[kluc]} aj {g}). Oprav to v Exceli.')
        videne[kluc] = g

    # 4) porovnanie s hárkami — len upozornenie
    rozdiely = []
    for g in range(1, N + 1):
        t = [(d['meno'], d['priezvisko']) for d in tabulka[g]]
        h = harky[g]
        chyba_v_harku = [x for x in t if x not in h]
        navyse_v_harku = [x for x in h if x not in t]
        if chyba_v_harku or navyse_v_harku:
            rozdiely.append((g, chyba_v_harku, navyse_v_harku))
    if rozdiely:
        print('⚠️  Prehľadová tabuľka a hárky po skupinkách sa nezhodujú.')
        print('    Použila sa TABUĽKA. Rozdiely (nech sa o nich vie):')
        for g, chyba_v, navyse in rozdiely:
            for x in chyba_v:
                print(f'      sk.{g}: „{" ".join(x)}" je v tabuľke, ale nie v hárku {g}.skupinka')
            for x in navyse:
                print(f'      sk.{g}: „{" ".join(x)}" je v hárku {g}.skupinka, ale nie v tabuľke')
        print()

    return [{'cislo': g, 'animatori': animatori[g], 'deti': tabulka[g]} for g in range(1, N + 1)]


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
