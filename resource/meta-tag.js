/*
 * meta-tag.js
 * ----------------------------------------------------------------------------
 * Script delle pagine di categoria (meta-tag-<categoria>.html).
 * Gestisce: ricerca, filtri per categoria e stato, ordinamento, "espandi tutto",
 * copia degli esempi, link condivisibile della vista filtrata, indice "Vai a…",
 * barra di ricerca fissa durante lo scroll, "Torna su" e il testo introduttivo
 * comprimibile.
 *
 * Il codice è volutamente compatto (stile originale): i commenti spiegano i
 * blocchi principali. Le parti adattate alla divisione in più pagine sono
 * segnate con la parola "MODIFICA".
 * ----------------------------------------------------------------------------
 */
(function(){

/* ===== Modalità "incorporata" (usata dall'hub aprendo i file in locale) =====
 * Quando l'hub non può usare fetch (file://), carica questa pagina in un iframe
 * nascosto e le chiede, con postMessage, i dettagli di una scheda.
 * Qui rispondiamo con l'HTML del riquadro "Dettagli" (che sono contenuti pubblici).
 * Funziona anche da file://, dove l'accesso diretto al documento è bloccato. */
if(window.parent!==window){window.addEventListener('message',function(e){var m=e.data;if(!m||m.type!=='mt-get'||typeof m.id!=='string')return;var a=document.getElementById(m.id),d=a&&a.querySelector('details');window.parent.postMessage({type:'mt-details',id:m.id,html:d?d.innerHTML:null},'*')})}

/* ===== Riferimenti agli elementi della pagina ===== */
// out = contenitore di tutte le schede, q = campo di ricerca, cc/sc = chip di
// categoria/stato, cnt = contatore, none = "nessun risultato", ord = ordinamento,
// ex = "Espandi tutto", up = "Torna su", live = area aria-live per gli screen reader,
// sh = "Copia link", rs = "Azzera filtri".
var out=document.getElementById('out'),q=document.getElementById('q'),cc=document.getElementById('cc'),sc=document.getElementById('sc'),cnt=document.getElementById('cnt'),none=document.getElementById('none'),ord=document.getElementById('ord'),ex=document.getElementById('ex'),up=document.getElementById('up'),live=document.getElementById('live'),sh=document.getElementById('sh'),rs=document.getElementById('rs');

/* ===== Stato dei filtri =====
 * cat / st = insiemi di categorie e stati selezionati (vuoto = nessun filtro),
 * term = testo cercato (minuscolo), opened = stato di "Espandi tutto",
 * W = peso di ogni stato nel calcolo della rilevanza (attivi prima, dismessi ultimi). */
var cat=new Set(),st=new Set(),term='',opened=false,W={ok:30,old:20,ign:10,dead:0};

/* ===== Elenchi per i chip =====
 * CATS = [codice, etichetta] delle categorie; STS = idem per gli stati
 * ("ess" = solo i tag ⭐ essenziali). "all" significa "nessun filtro". */
var CATS=[["all","Tutte le categorie"],["doc","Documento e rendering"],["seo","Motori di ricerca"],["social","Social / Open Graph"],["geo","Geo e contatti"],["browser","Browser e PWA"],["apple","Apple / iOS"],["ms","Microsoft / Internet Explorer"],["http","http-equiv, cache e sicurezza"],["verify","Verifica proprietà sito"],["custom","Custom e framework"],["link","Link tag (link)"],["ogx","Open Graph: tipi di oggetto e proprietà extra"],["tw","X / Twitter Cards"]],STS=[['all','Tutti gli stati'],['ess','⭐ Essenziali'],['ok','Attivi'],['old','Obsoleti'],['dead','Dismessi'],['ign','Ignorati']];

// Sezioni (una per categoria e gruppo) presenti nella pagina.
var secs=[].slice.call(out.querySelectorAll('.cs'));

// MODIFICA (pagine divise): ogni pagina contiene solo le schede della propria
// categoria, quindi teniamo nei chip solo le categorie realmente presenti
// (altrimenti cliccare le altre darebbe sempre zero risultati).
CATS=CATS.filter(function(c){return c[0]==='all'||out.querySelector('.c[data-cat="'+c[0]+'"]')});

// Salviamo la posizione originale di schede e sezioni (_o) per l'ordine "Originale"
// e per mantenere un ordine stabile a parità di punteggio.
out.querySelectorAll('.c').forEach(function(a,i){a._o=i});secs.forEach(function(s,i){s._o=i});

/* ===== Chip di filtro =====
 * Crea i pulsanti la prima volta, poi a ogni chiamata ne aggiorna lo stato
 * (aria-pressed + classe "on"). "all" risulta attivo quando non c'è nessun filtro. */
function chips(el,items,cur,fn){if(!el.firstChild)items.forEach(function(i){var b=document.createElement('button');b.type='button';b.textContent=i[1];b._v=i[0];b.onclick=function(){fn(i[0])};el.appendChild(b)});[].forEach.call(el.children,function(b){var on=b._v==='all'?!cur.size:cur.has(b._v);b.setAttribute('aria-pressed',String(on));b.className=on?'on':''})}

// Attiva/disattiva un valore in un insieme di filtri ("all" li azzera tutti).
function tog(S,v){if(v==='all')S.clear();else if(S.has(v))S.delete(v);else S.add(v)}

// Ridisegna i chip di categoria e stato; a ogni clic aggiorna il filtro e rifà la ricerca.
function drawChips(){chips(cc,CATS,cat,function(v){tog(cat,v);drawChips();apply()});chips(sc,STS,st,function(v){tog(st,v);drawChips();apply()})}

/* ===== Stato <-> indirizzo (query string) ===== */
// Legge una lista separata da virgole dall'URL, tenendo solo i valori ammessi.
function pick(v,L){return new Set((v||'').split(',').filter(function(x){return x!=='all'&&L.some(function(i){return i[0]===x})}))}

// Costruisce la query string della vista corrente (?q=…&cat=…&st=…&ord=…).
function qs(){var p=new URLSearchParams();if(term)p.set('q',q.value.trim());if(cat.size)p.set('cat',Array.from(cat).join(','));if(st.size)p.set('st',Array.from(st).join(','));if(ord.value!=='rel')p.set('ord',ord.value);return p.toString()}

// Ripristina ricerca, filtri e ordinamento dai parametri dell'URL (link condivisi).
function load(){var p=new URLSearchParams(location.search);q.value=(p.get('q')||'').trim();term=q.value.toLowerCase();cat=pick(p.get('cat'),CATS);st=pick(p.get('st'),STS);var o=p.get('ord');if(o&&[].some.call(ord.options,function(x){return x.value===o}))ord.value=o}

/* ===== Testo e punteggio di ogni scheda ===== */
// Testo completo della scheda in minuscolo, calcolato una volta e poi tenuto in cache (_s).
function txt(a){return a._s||(a._s=a.textContent.toLowerCase())}
// Nome del tag in minuscolo (cache in _n).
function nm(a){return a._n||(a._n=a.querySelector('h4 code').textContent.toLowerCase())}

// Rilevanza: bonus per gli essenziali, peso dello stato e, se si sta cercando,
// un punteggio che premia nome identico > nome che inizia così > nome che contiene
// > trovato nella nota breve > trovato altrove nella scheda.
function score(a){var s=(a.dataset.ess==='1'?50:0)+W[a.dataset.st];if(term){var n=nm(a);s+=n===term?1000:n.indexOf(term)===0?800:n.indexOf(term)>-1?600:(a._t||(a._t=a.querySelector('.n').textContent.toLowerCase())).indexOf(term)>-1?300:100}return s}

// Funzione di confronto in base all'ordinamento scelto: A–Z, originale o rilevanza.
function byOrd(a,b){var o=ord.value;return o==='az'?nm(a).localeCompare(nm(b),'it'):o==='orig'?a._o-b._o:score(b)-score(a)||a._o-b._o}

// Riordina le schede dentro ogni sezione e poi le sezioni dentro ogni gruppo.
// Con la rilevanza, le sezioni con il risultato migliore salgono in alto (_r).
function sortAll(){secs.forEach(function(s){var l=[].slice.call(s.querySelectorAll('.c'));l.sort(byOrd);l.forEach(function(a){s.appendChild(a)});var v=l.filter(function(a){return !a.hidden});s._r=v.length&&term&&ord.value==='rel'?Math.max.apply(null,v.map(score)):0});
out.querySelectorAll('.grp').forEach(function(g){var l=[].slice.call(g.querySelectorAll('.cs'));l.sort(function(a,b){return b._r-a._r||a._o-b._o});l.forEach(function(s){g.appendChild(s)})})}

/* ===== Applicazione dei filtri =====
 * 1) mostra/nasconde ogni scheda in base a categoria, stato e testo cercato;
 * 2) riordina; 3) nasconde sezioni e gruppi rimasti vuoti e aggiorna i conteggi;
 * 4) aggiorna contatore, pulsanti "Azzera"/badge e l'indirizzo della pagina. */
function apply(){var n=0;
out.querySelectorAll('.c').forEach(function(a){var ok=(!cat.size||cat.has(a.dataset.cat))&&(!st.size||st.has(a.dataset.st)||(st.has('ess')&&a.dataset.ess==='1'))&&(!term||txt(a).indexOf(term)>-1);a.hidden=!ok;if(ok)n++});
sortAll();
out.querySelectorAll('.cs').forEach(function(s){var v=s.querySelectorAll('.c:not([hidden])').length;s.hidden=!v;s.querySelector('.cn').textContent=v+(v===1?' scheda':' schede')});
out.querySelectorAll('.grp').forEach(function(g){g.hidden=!g.querySelector('.c:not([hidden])')});
none.hidden=n>0;cnt.innerHTML=n+(n===1?' scheda':' schede')+'<span class="dm"> mostrat'+(n===1?'a':'e')+'</span>';rs.hidden=!(term||cat.size||st.size);fb.hidden=!(cat.size+st.size);fb.textContent=cat.size+st.size;
// Aggiorna l'URL senza ricaricare né riempire la cronologia (così il link è condivisibile).
try{var x=qs();history.replaceState(null,'',location.pathname+(x?'?'+x:'')+location.hash)}catch(e){}syncStats()}

/* ===== Apertura di una scheda da #ancora =====
 * Se la scheda è nascosta da un filtro, azzera i filtri; poi apre i dettagli
 * e scorre fino all'elemento. */
function openHash(){var id='';try{id=decodeURIComponent(location.hash.slice(1))}catch(e){}
var el=id&&document.getElementById(id);if(!el)return;
if(el.closest('[hidden]')){cat.clear();st.clear();term='';q.value='';drawChips();apply()}
var d=el.classList.contains('c')&&el.querySelector('details');if(d)d.open=true;el.scrollIntoView()}

/* ===== Copia negli appunti =====
 * Copia il testo dell'esempio (<pre>) oppure quello passato in "t" (usato dal link
 * condiviso). Usa l'API moderna e, se non disponibile, un <textarea> temporaneo
 * con execCommand. Il pulsante mostra per 1,8 s "Copiato ✓" o "Copia non riuscita". */
function copy(b,t){t=t||b.parentNode.querySelector('pre').textContent;
// Conferma visiva dopo una copia riuscita; ripristina l'etichetta originale dopo 1,8 s.
function ok(){var o=b.dataset.l||(b.dataset.l=b.innerHTML);b.textContent='Copiato ✓';b.classList.add('done');live.textContent='Copiato negli appunti';clearTimeout(b._t);b._t=setTimeout(function(){b.innerHTML=o;b.classList.remove('done');live.textContent=''},1800)}
// Metodo di riserva per browser vecchi o contesti non sicuri (http).
function fb(){var ta=document.createElement('textarea');ta.value=t;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;opacity:0';document.body.appendChild(ta);ta.select();var r=false;try{r=document.execCommand('copy')}catch(x){}document.body.removeChild(ta);if(r)ok();else{var o=b.dataset.l||(b.dataset.l=b.innerHTML);b.textContent='Copia non riuscita';clearTimeout(b._t);b._t=setTimeout(function(){b.innerHTML=o},1800)}}
if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(t).then(ok,fb);else fb()}

/* ===== Eventi principali ===== */
// Ricerca a ogni tasto e cambio di ordinamento.
q.addEventListener('input',function(){term=q.value.trim().toLowerCase();apply()});
ord.addEventListener('change',apply);

// "Espandi/Comprimi tutto": apre o chiude i dettagli delle sole schede visibili.
ex.addEventListener('click',function(){opened=!opened;out.querySelectorAll('.c:not([hidden]) details').forEach(function(d){d.open=opened});ex.setAttribute('aria-pressed',String(opened));ex.textContent=opened?'Comprimi tutto':'Espandi tutto'});

// Delegazione: un solo ascoltatore gestisce tutti i pulsanti "Copia".
document.addEventListener('click',function(e){var b=e.target.closest('.cp');if(b)copy(b)});

// Un clic su una zona vuota della scheda apre/chiude i dettagli
// (ignorato se si clicca su un link, un pulsante o i dettagli stessi).
out.addEventListener('click',function(e){var c=e.target.closest('.c');if(!c||e.target.closest('details,a,button'))return;var d=c.querySelector('details');if(d)d.open=!d.open});

// "Torna su": compare dopo 500 px di scroll. requestAnimationFrame limita i
// controlli a uno per frame; rispetta "riduci movimento" del sistema.
var tick=false;window.addEventListener('scroll',function(){if(tick)return;tick=true;requestAnimationFrame(function(){up.hidden=window.pageYOffset<500;tick=false})},{passive:true});
up.addEventListener('click',function(){window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})});

// Se cambia l'#ancora (es. clic su un link interno) apre la scheda corrispondente.
window.addEventListener('hashchange',openHash);

/* ===== Testi adattati al telefono =====
 * Sotto i 700 px usa etichette più corte per l'ordinamento e per il segnaposto. */
var mq=window.matchMedia('(max-width:699px)');function ph(){var t=mq.matches?['Rilevanza','A–Z','Originale']:['Ordina: rilevanza','Ordina: A–Z','Ordina: originale'];[].forEach.call(ord.options,function(o,i){o.textContent=t[i]});q.placeholder=mq.matches?'Cerca un tag…':'Cerca un tag o una parola (es. og:, apple, cache…)'}ph();if(mq.addEventListener)mq.addEventListener('change',ph);else mq.addListener(ph);

// "Copia link": copia l'indirizzo della vista filtrata corrente.
sh.addEventListener('click',function(){var x=qs();copy(sh,location.origin+location.pathname+(x?'?'+x:''))});
// "Azzera filtri": riporta tutto allo stato iniziale.
rs.addEventListener('click',function(){cat.clear();st.clear();term='';q.value='';ord.value='rel';drawChips();apply()});

/* ===== Pulsanti-statistica in alto (● N attivi, …) =====
 * Cliccandoli si filtra per quello stato (un secondo clic toglie il filtro);
 * syncStats evidenzia il pulsante quando il filtro attivo è esattamente quello. */
var sb=document.querySelectorAll('.stats button'),go=document.getElementById('go');
function syncStats(){[].forEach.call(sb,function(b){b.setAttribute('aria-pressed',String(st.size===1&&st.has(b.dataset.st)))})}
[].forEach.call(sb,function(b){b.addEventListener('click',function(){var v=b.dataset.st,only=st.size===1&&st.has(v);st.clear();if(!only)st.add(v);drawChips();apply();if(!only)document.querySelector('.list').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})})});

/* ===== Menu "Vai a…" =====
 * Si costruisce leggendo i link dell'indice (nav.toc), raggruppati per titolo.
 * MODIFICA (pagine divise): il valore resta l'href completo, perché i link
 * dell'indice ora possono puntare ad altre pagine oltre che a #ancore. */
(function(){var o=document.createElement('option'),g;o.value='';o.textContent='Vai a…';go.appendChild(o);
[].forEach.call(document.querySelectorAll('.toc details > p.tg, .toc details > ul, .toc .tp > p.tg, .toc .tp > ul'),function(n){if(n.className==='tg'){g=document.createElement('optgroup');g.label=n.textContent;go.appendChild(g)}else[].forEach.call(n.querySelectorAll('a'),function(a){var x=document.createElement('option');x.value=a.getAttribute('href');x.textContent=a.firstChild.textContent;g.appendChild(x)})})})();
// Alla scelta: riporta il menu su "Vai a…"; se il valore è un'#ancora scorre alla scheda,
// altrimenti (MODIFICA) apre l'altra pagina.
go.addEventListener('change',function(){var v=go.value;go.selectedIndex=0;if(!v)return;if(v.charAt(0)!=='#'){location.href=v;return}v=v.slice(1);if(location.hash==='#'+v)openHash();else location.hash=v});

/* ===== Barra di ricerca "appiccicosa" =====
 * Quando si scorre oltre la barra (segnaposto #bs) le si aggiunge la classe "st"
 * (versione compatta) e si chiude il pannello dei filtri; tornando su si riapre.
 * Il margine inferiore compensa la differenza di altezza per evitare "salti" di pagina.
 * L'isteresi (16 px / -1 px) evita sfarfallii a cavallo della soglia. */
var fb=document.getElementById('fb'),bar=document.querySelector('.bar'),bs=document.getElementById('bs'),fdd=document.getElementById('fd'),isS=false,t2=false;
function stuck(){var t=bs.getBoundingClientRect().top,s=isS?t<16:t<-1;if(s===isS)return;isS=s;
if(s){var h0=bar.getBoundingClientRect().height;bar.classList.add('st');fdd.open=false;bar.style.marginBottom=Math.max(0,h0-bar.getBoundingClientRect().height)+'px'}
else{bar.classList.remove('st');bar.style.marginBottom='';fdd.open=true}}
window.addEventListener('scroll',function(){if(t2)return;t2=true;requestAnimationFrame(function(){stuck();t2=false})},{passive:true});window.addEventListener('resize',stuck);window.addEventListener('load',stuck);stuck();

/* ===== Indice rapido dentro la barra =====
 * Sposta l'indice (nav.toc) nella riga del contatore e ne raggruppa il contenuto
 * in un div ".tp" (pannello a comparsa). Poi gestisce: un solo pannello aperto
 * alla volta quando la barra è compatta, chiusura al clic su un link, al clic
 * fuori e con il tasto Esc. */
var toc=document.querySelector('nav.toc'),td=toc&&toc.querySelector('details'),crr=document.querySelector('.cr');
if(td&&crr){var tp=document.createElement('div');tp.className='tp';[].slice.call(td.children).forEach(function(n){if(n.tagName!=='SUMMARY')tp.appendChild(n)});td.appendChild(tp);crr.insertBefore(toc,crr.firstChild);
td.addEventListener('toggle',function(){if(td.open&&bar.classList.contains('st'))fdd.open=false});
fdd.addEventListener('toggle',function(){if(fdd.open&&bar.classList.contains('st'))td.open=false});
tp.addEventListener('click',function(e){if(e.target.closest('a'))td.open=false});
document.addEventListener('click',function(e){if(td.open&&!td.contains(e.target))td.open=false;if(bar.classList.contains('st')&&fdd.open&&!bar.contains(e.target))fdd.open=false});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){td.open=false;if(bar.classList.contains('st'))fdd.open=false}})}
// Quando il pannello filtri si apre/chiude l'altezza della barra cambia: riverifica la posizione.
document.getElementById('fd').addEventListener('toggle',function(){window.dispatchEvent(new Event('resize'))});

/* ===== Testo introduttivo comprimibile =====
 * "chk" verifica se il testo (#sub) è troncato dal CSS: in tal caso mostra il
 * pulsante "Leggi tutto", che lo espande/comprime. */
var sub=document.getElementById('sub'),sm=document.getElementById('sm');
function chk(){var o=sub.classList.contains('open'),ov=!o&&sub.scrollHeight>sub.clientHeight+1;sub.classList.toggle('cl',ov);sm.hidden=!(o||ov)}
sm.addEventListener('click',function(){var o=sub.classList.toggle('open');sm.setAttribute('aria-expanded',String(o));sm.textContent=o?'Mostra meno':'Leggi tutto';chk()});
window.addEventListener('resize',chk);window.addEventListener('load',chk);chk();

/* ===== Righe di chip scorrevoli =====
 * Ogni riga di chip viene avvolta in un div ".fw"; le classi "sl"/"sr" indicano
 * se c'è altro contenuto a sinistra/destra (frecce ‹ › via CSS). */
[cc,sc].forEach(function(el){var w=document.createElement('div');w.className='fw';el.parentNode.insertBefore(w,el);w.appendChild(el);
function h(){w.classList.toggle('sl',el.scrollLeft>2);w.classList.toggle('sr',el.scrollLeft<el.scrollWidth-el.clientWidth-2)}
el.addEventListener('scroll',h,{passive:true});window.addEventListener('resize',h);window.addEventListener('load',h);if(window.ResizeObserver)new ResizeObserver(h).observe(el);h()});

// MODIFICA (pagine divise): se la pagina ha una sola categoria (restano solo
// "Tutte le categorie" + 1) la riga dei chip di categoria sarebbe inutile: la nascondiamo.
if(CATS.length<=2)cc.parentNode.hidden=true;

/* ===== Scorrimento automatico dei chip col mouse =====
 * Sul desktop, avvicinando il puntatore ai bordi di una riga di chip troppo
 * lunga, questa scorre da sola (più veloce vicino al bordo, fino a 12 px per frame). */
[cc,sc].forEach(function(el){var dir=0,raf=0;
function step(){if(!dir){raf=0;return}el.scrollLeft+=dir;raf=requestAnimationFrame(step)}
function go(d){dir=d;if(d&&!raf)raf=requestAnimationFrame(step)}
el.addEventListener('pointermove',function(e){if(e.pointerType!=='mouse'||el.scrollWidth<=el.clientWidth){go(0);return}var r=el.getBoundingClientRect(),p=(e.clientX-r.left)/r.width,z=.3;go(p>1-z?Math.ceil((p-1+z)/z*12):p<z?-Math.ceil((z-p)/z*12):0)});
el.addEventListener('pointerleave',function(){go(0)})});

/* ===== Avvio =====
 * Ripristina i filtri dall'URL, disegna i chip, applica i filtri e, se c'è
 * un'#ancora, apre la scheda corrispondente. */
load();drawChips();apply();openHash();
})();
