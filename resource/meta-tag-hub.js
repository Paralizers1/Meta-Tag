/*
 * meta-tag-hub.js  (versione 20261021b)
 * ----------------------------------------------------------------------------
 * Script della pagina "hub" (meta-tag.html). Fa due cose:
 *   1) reindirizza i vecchi link con #ancora (es. meta-tag.html#charset)
 *      alla nuova pagina di categoria che contiene quella scheda;
 *   2) gestisce la ricerca globale su tutte le schede, con filtro per stato.
 *
 * Dipende da meta-tag-index.js, che definisce window.MT_INDEX:
 *   {
 *     meta:  { cats: { codice: [etichetta, pagina] }, secs: { idSezione: pagina } },
 *     items: [ [id, nome, stato, categoria, essenziale(0/1), contenuto, nota], ... ]
 *   }
 * ----------------------------------------------------------------------------
 */
(function () {
  'use strict';

  // Indice di ricerca: se manca (script non caricato) non facciamo nulla.
  var D = window.MT_INDEX;
  if (!D) return;
  var META = D.meta, ITEMS = D.items;

  /* ------------------------------------------------------------------------
   * 1) Redirect dei vecchi link con #ancora
   *    Prima tutte le schede stavano in un'unica pagina: un link come
   *    meta-tag.html#charset ora deve puntare alla pagina della categoria.
   * ---------------------------------------------------------------------- */
  var hash = decodeURIComponent((location.hash || '').slice(1));
  if (hash) {
    // Prima cerchiamo tra gli id delle sezioni (es. "attivi-seo")...
    var target = META.secs[hash];
    if (!target) {
      // ...poi tra gli id delle singole schede (es. "charset").
      for (var i = 0; i < ITEMS.length; i++) {
        if (ITEMS[i][0] === hash) { target = META.cats[ITEMS[i][3]][1]; break; }
      }
    }
    // replace() evita di lasciare il vecchio indirizzo nella cronologia.
    // Con target vuoto (es. #attivi, #out) restiamo sull'hub.
    if (target) { location.replace(target + '#' + hash); return; }
  }

  /* ------------------------------------------------------------------------
   * 2) Ricerca globale
   * ---------------------------------------------------------------------- */

  // Scorciatoia per prendere un elemento tramite id.
  var $ = function (id) { return document.getElementById(id); };

  // Elementi della pagina usati dalla ricerca.
  var q = $('q'),          // campo di testo
      hf = $('hf'),        // select del filtro per stato
      out = $('out'),      // contenitore dei risultati
      cnt = $('cnt'),      // contatore visibile ("8 schede trovate")
      none = $('none'),    // messaggio "Nessun risultato"
      rs = $('rs'),        // pulsante "Azzera"
      live = $('live'),    // area aria-live per i lettori di schermo
      up = $('up');        // pulsante "Torna su"
  // Se manca la barra di ricerca o il contenitore, non c'è nulla da fare.
  if (!q || !out) return;

  // Etichette leggibili per i codici di stato usati nei dati.
  var STL = { ok: 'Attivo', old: 'Obsoleto', ign: 'Ignorato', dead: 'Dismesso' };

  // Peso di ogni stato nell'ordine dei risultati: gli attivi vengono prima degli
  // obsoleti, poi gli ignorati e per ultimi i dismessi (+50 se il tag è ⭐ essenziale).
  var W = { ok: 30, old: 20, ign: 10, dead: 0 };

  var results = [];   // risultati dell'ultima ricerca, già ordinati

  // Normalizza il testo per confrontarlo: minuscolo e senza accenti,
  // così "àpple" trova "apple" e viceversa.
  function norm(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // Precalcoliamo una sola volta, per ogni scheda, il nome normalizzato e
  // un "pagliaio" di testo (nome + contenuto + nota + categoria) su cui cercare.
  var pre = ITEMS.map(function (r) {
    return { r: r, name: norm(r[1]), note: norm(r[6]), hay: norm([r[1], r[5], r[6], META.cats[r[3]][0]].join(' ')) };
  });

  // Esegue la ricerca in base a testo e stato scelti, poi disegna i risultati.
  // Senza testo e con "Tutti gli stati" mostra tutti i tag, in ordine di priorità:
  // essenziali, attivi, obsoleti, ignorati, dismessi. "silent" evita l'annuncio
  // per gli screen reader alla prima visualizzazione.
  function run(silent) {
    var terms = norm(q.value).split(/\s+/).filter(Boolean), st = hf.value;
    var filtered = terms.length || st;   // c'è almeno un filtro attivo?
    rs.hidden = !filtered;               // "Azzera" serve solo se c'è qualcosa da azzerare

    results = [];
    pre.forEach(function (p) {
      // Filtro per stato: "ess" = solo i tag ⭐ essenziali, altrimenti il codice dello stato.
      if (st === 'ess' ? !p.r[4] : (st && p.r[2] !== st)) return;

      // Punteggio di partenza = priorità (essenziale + stato).
      var score = (p.r[4] ? 50 : 0) + W[p.r[2]];

      for (var i = 0; i < terms.length; i++) {
        var t = terms[i];
        if (p.hay.indexOf(t) < 0) return;               // ogni parola deve comparire (AND)
        // Rilevanza del testo cercato: pesa di più una corrispondenza sul nome del tag.
        if (p.name === t) score += 1000;                // nome identico
        else if (p.name.indexOf(t) === 0) score += 800; // il nome inizia così
        else if (p.name.indexOf(t) > -1) score += 600;  // il nome contiene la parola
        else if (p.note.indexOf(t) > -1) score += 300;  // trovata nella nota breve
        else score += 100;                              // trovata altrove nella scheda
      }
      results.push({ r: p.r, s: score });
    });

    // Ordine: punteggio decrescente, a parità ordine alfabetico per nome.
    results.sort(function (a, b) { return b.s - a.s || a.r[1].localeCompare(b.r[1]); });

    out.textContent = ''; out.hidden = false;
    render();

    // Contatore e annuncio per gli screen reader.
    var n = results.length;
    var msg = n + (n === 1 ? ' scheda' : ' schede') + (filtered ? (n === 1 ? ' trovata' : ' trovate') : '');
    cnt.textContent = msg;
    if (!silent) live.textContent = msg;
    none.hidden = n > 0;
  }

  // Crea un elemento con classe e testo opzionali.
  // Usiamo textContent (mai innerHTML) per evitare di interpretare HTML nei dati.
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Disegna tutti i risultati (sono al massimo 242 schede compatte, quindi niente paginazione).
  function render() {
    for (var k = 0; k < results.length; k++) {
      var r = results[k].r;
      var href = META.cats[r[3]][1] + '#' + r[0];   // pagina di categoria + ancora della scheda

      // Scheda compatta: stesse classi della pagina completa, così usa lo stesso CSS.
      var a = el('article', 'c ' + r[2] + (r[4] ? ' ess' : ''));

      // Intestazione: nome (link alla scheda) + badge di stato, essenziale e categoria.
      var h = el('div', 'h'), h4 = el('h4'), link = el('a'), code = el('code', null, r[1]);
      link.href = href; link.appendChild(code); h4.appendChild(link); h.appendChild(h4);
      h.appendChild(el('span', 'b s-' + r[2], STL[r[2]]));
      if (r[4]) h.appendChild(el('span', 'b s-ok', '⭐ Essenziale'));
      h.appendChild(el('span', 'b t', META.cats[r[3]][0]));
      a.appendChild(h);

      // Riga "Contenuto": togliamo l'etichetta già presente nel testo per non duplicarla.
      if (r[5]) {
        var v = el('div', 'v');
        v.appendChild(el('b', null, 'Contenuto: '));
        v.appendChild(document.createTextNode(r[5].replace(/^(Contenuto|Content):\s*/, '')));
        a.appendChild(v);
      }
      // Nota breve.
      if (r[6]) a.appendChild(el('div', 'n', r[6]));

      // Riquadro "Dettagli e spiegazione completa": all'inizio è vuoto, il contenuto
      // vero viene caricato dalla pagina di categoria alla prima apertura (vedi loadDetails).
      var det = el('details', 'lz');
      det.setAttribute('data-page', META.cats[r[3]][1]);   // pagina da cui prelevare i dettagli
      det.setAttribute('data-id', r[0]);                   // id della scheda in quella pagina
      det.appendChild(el('summary', null, 'Dettagli e spiegazione completa'));
      a.appendChild(det);

      out.appendChild(a);
    }
  }

  /* ---- Eventi ---- */

  // Debounce: aspettiamo 120 ms dall'ultimo tasto prima di cercare,
  // per non rifare la ricerca a ogni singola lettera digitata.
  var t;
  q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(run, 120); });
  hf.addEventListener('change', function () { run(); });

  // "Azzera": svuota testo e filtro, aggiorna i pulsanti e rimette il focus sul campo.
  rs.addEventListener('click', function () {
    q.value = ''; hf.value = ''; syncStats(); run(); q.focus();
  });

  /* ---- Dettagli completi dei risultati ----
   * Le schede dell'hub sono solo un'anteprima: i dettagli completi stanno nelle
   * pagine di categoria. Alla prima apertura li preleviamo da lì e li inseriamo
   * nella scheda, così si espande sul posto come nella pagina unica. */
  var cache = {};   // pagina -> promessa con il documento già scaricato (si scarica una sola volta)

  // Percorso 1 - fetch (funziona su http/https): scarica una pagina di categoria e
  // la interpreta come documento. Ogni pagina viene scaricata una sola volta.
  function getPage(url) {
    if (!cache[url]) {
      cache[url] = fetch(url).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      }).then(function (html) {
        return new DOMParser().parseFromString(html, 'text/html');
      });
    }
    return cache[url];
  }

  // Restituisce (tramite promessa) i nodi dei dettagli della scheda, copiati dalla
  // pagina scaricata; il <summary> è escluso perché il nostro riquadro ha già il suo.
  function detailsByFetch(page, id) {
    return getPage(page).then(function (doc) {
      var art = doc.getElementById(id), src = art && art.querySelector('details');
      if (!src) throw new Error('scheda non trovata');
      return Array.prototype.filter.call(src.children, function (n) {
        return n.tagName !== 'SUMMARY';
      }).map(function (n) { return document.importNode(n, true); });
    });
  }

  // Percorso 2 - iframe + postMessage (ripiego): serve quando fetch è bloccato,
  // ad esempio aprendo i file direttamente dal disco (file://). Carichiamo la pagina
  // di categoria in un iframe nascosto e le chiediamo i dettagli con un messaggio
  // (vedi la modalità "incorporata" in meta-tag.js).
  var frames = {};    // pagina -> promessa dell'iframe già caricato
  var pending = {};   // id scheda -> funzione che completa la richiesta in corso

  function getFrame(page) {
    if (!frames[page]) {
      frames[page] = new Promise(function (resolve, reject) {
        var f = document.createElement('iframe');
        f.src = page;
        f.title = 'Caricamento dettagli';
        f.setAttribute('aria-hidden', 'true');
        f.tabIndex = -1;
        f.setAttribute('sandbox', 'allow-scripts');   // la pagina può eseguire il suo script ma non toccare l'hub
        f.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
        f.onload = function () { resolve(f); };
        f.onerror = reject;
        document.body.appendChild(f);
      });
    }
    return frames[page];
  }

  // Un solo ascoltatore per tutte le risposte: associa il messaggio alla richiesta
  // che ha lo stesso id scheda.
  window.addEventListener('message', function (e) {
    var m = e.data;
    if (m && m.type === 'mt-details' && pending[m.id]) pending[m.id](m.html);
  });

  function detailsByFrame(page, id) {
    return new Promise(function (resolve, reject) {
      // Il timeout parte subito e copre anche il caricamento dell'iframe: se la pagina
      // non risponde entro 6 secondi rinunciamo (e permettiamo un nuovo tentativo).
      var timer = setTimeout(function () {
        delete pending[id]; delete frames[page];
        reject(new Error('timeout'));
      }, 6000);

      getFrame(page).then(function (f) {
        pending[id] = function (html) {
          clearTimeout(timer); delete pending[id];
          if (!html) return reject(new Error('scheda non trovata'));
          // L'HTML arriva come testo: lo trasformiamo in nodi con un <template>.
          var tpl = document.createElement('template');
          tpl.innerHTML = html;
          var sum = tpl.content.querySelector('summary');   // togliamo il <summary> duplicato
          if (sum) sum.parentNode.removeChild(sum);
          resolve(Array.prototype.slice.call(tpl.content.childNodes));
        };
        f.contentWindow.postMessage({ type: 'mt-get', id: id }, '*');
      }, function (err) { clearTimeout(timer); reject(err); });
    });
  }

  // Prova prima fetch; se fallisce (es. file://) passa all'iframe.
  // Se falliscono entrambi, l'errore riporta il motivo di ciascun tentativo
  // (utile per capire cosa non va: lo mostriamo nel messaggio e in console).
  function getDetails(page, id) {
    var why = [];
    var viaFetch;
    try { viaFetch = detailsByFetch(page, id); } catch (x) { viaFetch = Promise.reject(x); }
    return viaFetch.catch(function (e) {
      why.push('fetch: ' + (e && e.message || e));
      return detailsByFrame(page, id);
    }).catch(function (e) {
      why.push('iframe: ' + (e && e.message || e));
      var err = new Error(why.join(' | '));
      err.why = err.message;
      throw err;
    });
  }

  // Riempie il riquadro "det" con i dettagli della scheda corrispondente.
  function loadDetails(det) {
    if (det.getAttribute('data-loaded')) return;           // già caricato
    det.setAttribute('data-loaded', '1');
    var page = det.getAttribute('data-page'), id = det.getAttribute('data-id');
    var wait = el('p', 'e', 'Caricamento…');
    det.appendChild(wait);

    getDetails(page, id).then(function (nodes) {
      det.removeChild(wait);
      nodes.forEach(function (n) { det.appendChild(n); });
    }).catch(function (err) {
      // Se entrambi i percorsi falliscono offriamo il link alla pagina di categoria
      // e riportiamo il motivo (anche in console) per facilitare la diagnosi.
      if (window.console) console.warn('Dettagli non caricati [hub 20261021b]:', page, id, err && err.why);
      det.removeChild(wait);
      det.removeAttribute('data-loaded');
      var p = el('p', 'e', 'Impossibile caricare i dettagli qui. ');
      var l = el('a', null, 'Apri la scheda completa');
      l.href = page + '#' + id;
      p.appendChild(l);
      p.appendChild(el('small', null, ' (hub 20261021b - ' + (err && err.why || 'errore sconosciuto') + ')'));
      det.appendChild(p);
    });
  }

  // "toggle" non risale (non fa bubbling): lo ascoltiamo in fase di cattura.
  out.addEventListener('toggle', function (e) {
    var d = e.target;
    if (d.classList && d.classList.contains('lz') && d.open) loadDetails(d);
  }, true);

  // Un clic su una zona vuota della scheda apre/chiude i dettagli
  // (ignorato se si clicca su un link, un pulsante o dentro i dettagli).
  out.addEventListener('click', function (e) {
    var c = e.target.closest('.c');
    if (!c || e.target.closest('details,a,button')) return;
    var d = c.querySelector('details');
    if (d) d.open = !d.open;
  });

  // Pulsanti "Copia esempio" dei dettagli caricati: copiano il testo del <pre> vicino.
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.cp');
    if (!b) return;
    var text = b.parentNode.querySelector('pre').textContent;
    var done = function () {
      var old = b.getAttribute('data-l') || b.innerHTML;
      b.setAttribute('data-l', old);
      b.textContent = 'Copiato ✓'; live.textContent = 'Copiato negli appunti';
      clearTimeout(b._t);
      b._t = setTimeout(function () { b.innerHTML = old; live.textContent = ''; }, 1800);
    };
    // API moderna se disponibile, altrimenti un <textarea> temporaneo.
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else fallbackCopy(text, done);
  });
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (x) {}
    document.body.removeChild(ta);
    if (ok) done();
  }

  /* ---- Pulsanti-statistica nell'intestazione (● 126 attivi, ...) ---- */
  // Filtrano per stato: cliccando di nuovo lo stesso pulsante il filtro si toglie.
  var sb = document.querySelectorAll('.stats button');

  // Allinea lo stato "premuto" dei pulsanti al valore del select.
  function syncStats() {
    Array.prototype.forEach.call(sb, function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-st') === hf.value));
    });
  }
  Array.prototype.forEach.call(sb, function (b) {
    b.addEventListener('click', function () {
      hf.value = hf.value === b.getAttribute('data-st') ? '' : b.getAttribute('data-st');
      syncStats(); run();
      // Portiamo in vista i risultati solo quando il filtro è stato attivato.
      if (hf.value) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  // Tiene sincronizzati i pulsanti anche quando si cambia stato dal select.
  hf.addEventListener('change', syncStats);

  /* ---- Parametro ?q=parola ---- */
  // Permette di aprire l'hub con la ricerca già compilata (es. meta-tag.html?q=robots).
  var m = /[?&]q=([^&]*)/.exec(location.search);
  if (m) q.value = decodeURIComponent(m[1].replace(/\+/g, ' '));

  // Prima visualizzazione: mostra subito tutti i tag (o quelli del ?q=) in ordine di priorità.
  run(true);

  /* ---- Menu "Indice: Vai a…" ---- */
  // Si costruisce dai link dell'indice per categoria (nav.toc), mantenendo i due
  // gruppi "Tag ancora in uso" e "Obsoleti, ignorati e dismessi".
  // Ogni voce porta alla pagina di categoria (con l'ancora della sezione).
  var go = $('go');
  if (go) {
    var first = document.createElement('option');
    first.value = ''; first.textContent = 'Vai a…';
    go.appendChild(first);

    var group;
    Array.prototype.forEach.call(document.querySelectorAll('.toc details > p.tg, .toc details > ul'), function (n) {
      if (n.className === 'tg') {
        // Titolo del gruppo -> <optgroup>
        group = document.createElement('optgroup');
        group.label = n.textContent;
        go.appendChild(group);
      } else {
        // Elenco di link -> una <option> per link (testo = nome categoria, senza il contatore)
        Array.prototype.forEach.call(n.querySelectorAll('a'), function (a) {
          var o = document.createElement('option');
          o.value = a.getAttribute('href');
          o.textContent = a.firstChild.textContent;
          group.appendChild(o);
        });
      }
    });

    // Alla scelta apriamo la pagina; subito dopo il menu torna su "Vai a…".
    go.addEventListener('change', function () {
      var v = go.value;
      go.selectedIndex = 0;
      if (v) location.href = v;
    });
  }

  /* ---- Pulsante "Torna su" ---- */
  // Compare dopo 600 px di scorrimento; il listener è passive per non rallentare lo scroll.
  if (up) {
    window.addEventListener('scroll', function () { up.hidden = window.scrollY < 600; }, { passive: true });
    up.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }
})();
