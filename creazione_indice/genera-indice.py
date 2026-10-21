#!/usr/bin/env python3
"""
genera-indice.py
----------------------------------------------------------------------------
Rigenera resource/meta-tag-index.js, l'indice di ricerca usato dalla pagina
principale (meta-tag.html), leggendo le pagine di categoria del progetto.

Quando usarlo: ogni volta che aggiungi, rimuovi o modifichi una scheda
(nome, stato, contenuto, nota, categoria) in una pagina meta-tag-<categoria>.html.

Uso (da una qualsiasi cartella, serve solo Python 3, nessuna libreria esterna):
    python genera-indice.py            # rigenera il file
    python genera-indice.py --check    # controlla soltanto se è aggiornato
                                       # (esce con codice 1 se non lo è)

Cosa legge:
    meta-tag-*.html  (le pagine di categoria, nella stessa cartella dello script;
                      meta-tag.html, cioè l'hub, viene ignorato)
Cosa scrive:
    resource/meta-tag-index.js
----------------------------------------------------------------------------
"""
import glob
import html
import json
import os
import re
import sys

# Cartella del progetto = quella in cui si trova questo script.
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'resource', 'meta-tag-index.js')

# Commento che resta in cima al file generato.
INTESTAZIONE = """/*
 * meta-tag-index.js
 * Indice di ricerca generato automaticamente dalle schede: non modificare a mano.
 * Per rigenerarlo: python genera-indice.py
 * Struttura di window.MT_INDEX:
 *   meta.cats  -> { codiceCategoria: [etichetta, paginaDiCategoria] }
 *   meta.secs  -> { idSezione: paginaDiCategoria }   (usato per i redirect delle vecchie ancore)
 *   items      -> una riga per scheda:
 *                 [id, nome, stato(ok|old|ign|dead), categoria, essenziale(0|1), contenuto, nota]
 */
"""

# Una sezione = un gruppo (attivi / archivio) di una categoria, con il suo titolo e le sue schede.
RE_SEZIONE = re.compile(
    r"<section class='cs' id='(attivi|archivio)-([a-z0-9]+)'><h3>(.*?)</h3>"
    r"<p class='d'>.*?</p>(.*?)</section>", re.S)

# Una scheda: id, categoria, stato (ok/old/ign/dead), essenziale (0/1) e corpo HTML.
RE_SCHEDA = re.compile(
    r"<article class='[^']*' id='([^']*)' data-cat='([^']*)' "
    r"data-st='([^']*)' data-ess='(\d)'>(.*?)</article>", re.S)


def testo(h):
    """Toglie i tag HTML, decodifica le entità (&lt; -> <) e normalizza gli spazi."""
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', h))).strip()


def estrai(pattern, corpo):
    """Primo contenuto che corrisponde al pattern (come testo semplice), oppure ''."""
    m = re.search(pattern, corpo, re.S)
    return testo(m.group(1)) if m else ''


def costruisci():
    pagine = sorted(
        f for f in glob.glob(os.path.join(BASE, 'meta-tag-*.html')))
    if not pagine:
        sys.exit('Nessuna pagina meta-tag-*.html trovata in ' + BASE)

    cats, secs, items, visti = {}, {}, [], set()

    for percorso in pagine:
        pagina = os.path.basename(percorso)
        with open(percorso, encoding='utf-8') as f:
            contenuto = f.read()

        trovate = RE_SEZIONE.findall(contenuto)
        if not trovate:
            sys.exit('Nessuna sezione trovata in ' + pagina + ': struttura HTML cambiata?')

        for gruppo, cat, etichetta, schede in trovate:
            # categoria -> [etichetta leggibile, pagina]; sezione -> pagina
            cats[cat] = [html.unescape(etichetta), pagina]
            secs[gruppo + '-' + cat] = pagina

            for id_, cat_scheda, stato, ess, corpo in RE_SCHEDA.findall(schede):
                if id_ in visti:
                    sys.exit('Id scheda duplicato: ' + id_ + ' (' + pagina + ')')
                visti.add(id_)
                items.append([
                    id_,
                    estrai(r'<h4>(.*?)</h4>', corpo),                 # nome del tag
                    stato,
                    cat_scheda,
                    int(ess),
                    estrai(r"<div class='v'>(.*?)</div>", corpo),     # riga "Contenuto"
                    estrai(r"<div class='n'>(.*?)</div>", corpo),     # nota breve
                ])

    dati = {'meta': {'cats': cats, 'secs': secs}, 'items': items}
    # JavaScript (non JSON) così si carica con <script> anche aprendo i file da disco (file://).
    return (INTESTAZIONE + 'window.MT_INDEX=' +
            json.dumps(dati, ensure_ascii=False, separators=(',', ':')) + ';\n'), len(items), len(cats)


def main():
    nuovo, n_schede, n_cat = costruisci()

    if '--check' in sys.argv:
        try:
            with open(OUT, encoding='utf-8') as f:
                attuale = f.read()
        except FileNotFoundError:
            attuale = ''
        if attuale == nuovo:
            print('OK: l\'indice è aggiornato (%d schede, %d categorie).' % (n_schede, n_cat))
            return
        print('DA RIGENERARE: l\'indice non corrisponde alle pagine. Esegui: python genera-indice.py')
        sys.exit(1)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(nuovo)
    print('Scritto %s: %d schede, %d categorie.' % (os.path.relpath(OUT, BASE), n_schede, n_cat))


if __name__ == '__main__':
    main()
