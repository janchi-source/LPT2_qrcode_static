#!/usr/bin/env python3
"""Porovná data/deti.json s Excelom. Nezávisle od generátora.

    python3 scripts/over-deti.py ~/Downloads/'skupilnky - vytlačiť (1).xlsx'

Prečo zvlášť a nie ako súčasť generátora: generátor Excel číta, takže si vlastnú
chybu v čítaní nemá ako všimnúť. Tento skript ide na to z druhej strany —
vezme hotový výsledok a spýta sa, či v ňom je presne to, čo je v tabuľke.
Dá sa spustiť kedykoľvek, aj bez pregenerovania.

Návratový kód 0 = všetko sedí, 1 = našiel rozdiel.
"""
import json
import sys
import unicodedata
from collections import Counter
from pathlib import Path

import openpyxl

N = 10
KOREN = Path(__file__).resolve().parent.parent
chyby = []
varovania = []


def txt(x):
    return x.strip() if isinstance(x, str) else ''


def zjednodus(s):
    """Na porovnávanie mien: bez diakritiky, malé písmená, jedna medzera.

    Rozdiel „Šimon Ík" vs „Šimon ík" je preklep v Exceli, nie iné dieťa —
    nemá zmysel kvôli nemu hlásiť chybu, ale ani ho ticho prehltnúť.
    """
    s = unicodedata.normalize('NFKD', s.lower())
    return ' '.join(''.join(c for c in s if not unicodedata.combining(c)).split())


def nacitaj_excel(cesta):
    wb = openpyxl.load_workbook(cesta, data_only=True)
    podla_dvojice, harky, animatori = {}, {}, {}
    for g in range(1, N + 1):
        rows = list(wb[f'{g}.skupinka'].iter_rows(values_only=True))
        dvojica = tuple(x for x in (txt(rows[1][1]), txt(rows[1][2])) if x)
        podla_dvojice[dvojica] = g
        animatori[g] = list(dvojica)
        harky[g] = [(txt(r[1]), txt(r[2])) for r in rows[2:] if txt(r[1])]

    ws = wb['skupinky pre animátorov']
    tabulka, akt = {}, {}
    for i, row in enumerate(ws.iter_rows(values_only=True), 1):
        for base in (1, 6, 11):
            b = [txt(x) for x in (row[base:base + 4] + (None,) * 4)[:4]]
            if b[0] == 'Animátori:':
                g = podla_dvojice.get(tuple(x for x in (b[1], b[2]) if x))
                if g is None:
                    chyby.append(f'riadok {i}, stĺpec {base + 1}: neznáma dvojica animátorov')
                akt[base] = g
                if g:
                    tabulka.setdefault(g, [])
            elif b[0] and b[1] and akt.get(base):
                tabulka[akt[base]].append((b[0], b[1]))
    return tabulka, harky, animatori


def main():
    if len(sys.argv) < 2:
        sys.exit('Použitie: python3 scripts/over-deti.py <cesta k xlsx>')
    tabulka, harky, animatori = nacitaj_excel(sys.argv[1])
    data = json.loads((KOREN / 'data' / 'deti.json').read_text(encoding='utf-8'))
    deti = data['deti']

    print(f'Excel (tabuľka): {sum(len(v) for v in tabulka.values())} detí')
    print(f'data/deti.json : {len(deti)} detí\n')

    # --- 1. dieťa po dieťati, skupinka po skupinke --------------------------
    for g in range(1, N + 1):
        v_tabulke = sorted(tabulka.get(g, []), key=lambda x: (zjednodus(x[1]), zjednodus(x[0])))
        v_datach = sorted(((d['meno'], d['priezvisko']) for d in deti if d['skupina'] == g),
                          key=lambda x: (zjednodus(x[1]), zjednodus(x[0])))
        if len(v_tabulke) != len(v_datach):
            chyby.append(f'sk.{g}: tabuľka má {len(v_tabulke)} detí, dáta {len(v_datach)}')
        t = [zjednodus(' '.join(x)) for x in v_tabulke]
        d = [zjednodus(' '.join(x)) for x in v_datach]
        for x in set(t) - set(d):
            chyby.append(f'sk.{g}: „{x}" je v Exceli, ale nie v dátach')
        for x in set(d) - set(t):
            chyby.append(f'sk.{g}: „{x}" je v dátach, ale nie v Exceli')
        # presné znenie mena (diakritika, veľké písmená)
        for a, b in zip(v_tabulke, v_datach):
            if a != b and zjednodus(' '.join(a)) == zjednodus(' '.join(b)):
                varovania.append(f'sk.{g}: „{" ".join(b)}" v dátach vs „{" ".join(a)}" v Exceli')

    # --- 2. animátori --------------------------------------------------------
    for g in range(1, N + 1):
        if data['animatori'].get(str(g)) != animatori[g]:
            chyby.append(f'sk.{g}: animátori {data["animatori"].get(str(g))} != {animatori[g]}')

    # --- 3. duplicity a úplnosť ---------------------------------------------
    mena = Counter(zjednodus(f'{d["meno"]} {d["priezvisko"]}') for d in deti)
    for m, n in mena.items():
        if n > 1:
            chyby.append(f'dieťa „{m}" je v dátach {n}×')

    naramky = sorted(d['naramok'] for d in deti)
    if naramky != list(range(1, len(deti) + 1)):
        chyby.append('čísla náramkov nie sú súvislý rad od 1')
    if len({d['id'] for d in deti}) != len(deti):
        chyby.append('duplicitné ID (QR kódy)')

    # --- 4. rozdiel medzi tabuľkou a hárkami (len na vedomie) ---------------
    for g in range(1, N + 1):
        t = {zjednodus(' '.join(x)) for x in tabulka.get(g, [])}
        h = {zjednodus(' '.join(x)) for x in harky[g]}
        for x in t - h:
            varovania.append(f'sk.{g}: „{x}" je v tabuľke, ale nie v hárku {g}.skupinka')
        for x in h - t:
            varovania.append(f'sk.{g}: „{x}" je v hárku {g}.skupinka, ale nie v tabuľke')

    # --- výsledok ------------------------------------------------------------
    if varovania:
        print('⚠️  Na vedomie (nie je to chyba dát appky):')
        for v in varovania:
            print('   ', v)
        print()
    if chyby:
        print('❌ NESEDÍ:')
        for c in chyby:
            print('   ', c)
        sys.exit(1)

    print('✅ Všetkých %d detí sedí s Excelom — mená, skupinky aj animátori.' % len(deti))
    print('   Veľkosti skupiniek:', [len(tabulka[g]) for g in range(1, N + 1)])


if __name__ == '__main__':
    main()
