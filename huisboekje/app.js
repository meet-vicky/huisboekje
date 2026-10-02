(() => {
"use strict";
/* ============ Instellingen & hulpfuncties ============ */
const CFG = window.HB_CONFIG || {};
const CLOUD = !!(CFG.firebase && CFG.firebase.apiKey && window.FB);
const DEFAULTS = {
  categorieen: ["Boodschappen","Uit eten & uitstap","Wonen","Energie & water","Telecom & abonnementen","Verzekeringen","Auto & vervoer","Gezondheid","Kleding","Vrije tijd","Cadeaus","Huisdieren","Belastingen","Overig"],
  betaalmiddelen: ["KBC","BNP Paribas Fortis","Cash","Payconiq","Kredietkaart","Maaltijdcheques","Domiciliëring"],
  personen: ["Vicky","Tom","Samen"]
};
const PALETTE = ["#1d6a4e","#2f6fb3","#b5651d","#8a4fb0","#c0392b","#2a9d8f","#9a7b00","#5b6a62","#d1497b","#3d5a80","#6a994e","#e07a5f","#7f5539","#577590"];
const MAANDEN = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
const MK = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];

const $ = s => document.querySelector(s);
const today = () => new Date().toLocaleDateString("sv-SE");
const nowIso = () => new Date().toISOString();
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const eur = new Intl.NumberFormat("nl-BE",{style:"currency",currency:"EUR"});
const money = n => eur.format(n || 0);
const parseAmount = s => { const v = parseFloat(String(s||"").replace(/[€\s]/g,"").replace(/\.(?=\d{3}(\D|$))/g,"").replace(",", ".")); return isFinite(v) ? Math.round(v*100)/100 : NaN; };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
const clone = o => JSON.parse(JSON.stringify(o));
const LS = {
  get(k,d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch{ return d; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{ toast("Het geheugen van de browser is vol."); } },
  del(k){ try{ localStorage.removeItem(k); }catch{} }
};
const now = new Date();
function fmtDate(iso){ if(!iso) return ""; const [y,m,d] = iso.split("-").map(Number); const s = `${d} ${MK[m-1]}`; return y === now.getFullYear() ? s : `${s} ${y}`; }
function daysUntil(iso){ return Math.round((new Date(iso+"T00:00:00") - new Date(today()+"T00:00:00"))/864e5); }
function addPeriod(iso, h){
  const n = h==="maand"?1:h==="kwartaal"?3:h==="jaar"?12:0; if(!iso || !n) return iso;
  const [y,m,d] = iso.split("-").map(Number); const t = new Date(y, m-1+n, 1);
  t.setDate(Math.min(d, new Date(t.getFullYear(), t.getMonth()+1, 0).getDate())); return t.toLocaleDateString("sv-SE");
}
function toast(msg){ const t = document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), 3200); }
function medDigits(s){ return String(s||"").replace(/\D/g,""); }
function medValid(s){ const d = medDigits(s); if(d.length!==12) return false; let c = Number(d.slice(0,10)) % 97; if(c===0) c=97; return c === Number(d.slice(10)); }
function medFormat(s){ const d = medDigits(s); return `+++${d.slice(0,3)}/${d.slice(3,7)}/${d.slice(7,12)}+++`; }

/* ============ Opslag: Firebase (gedeeld, werkt offline) of alleen dit toestel ============ */
const K = { items:"hb-items", settings:"hb-settings", user:"hb-user" };
let itemsMap = CLOUD ? {} : LS.get(K.items, {});
const state = {
  items: [], settings: { ...clone(DEFAULTS), ...LS.get(K.settings, {}) }, view: "home",
  rep: { mode:"maand", y: now.getFullYear(), m: now.getMonth() },
  filter: { q:"", status:"alle", cat:"" }, openPay: null,
  user: CLOUD ? LS.get(K.user, null) : null, sync: { status: CLOUD ? "idle" : "local", error: null, pending: false }
};
function refreshItems(){ state.items = Object.values(itemsMap); }
refreshItems();
const clean = o => { const r = {}; for(const [k,v] of Object.entries(o)) if(k !== "id") r[k] = v === undefined ? null : v; return r; };
function saveLocal(){ LS.set(K.items, itemsMap); refreshItems(); render(); }

let fs = null, auth = null, unsubs = [], olderLoaded = false;
const CUTOFF = (() => { const t = new Date(); t.setDate(1); t.setMonth(t.getMonth() - 13); return t.toLocaleDateString("sv-SE"); })();
function fail(e){
  console.error(e);
  state.sync.status = "fout";
  state.sync.error = e?.code === "permission-denied" ? "Geen toegang. Staat je e-mailadres in de Firestore-regels?" : (e?.message || String(e));
  render();
}
function write(p){ p.catch(fail); }
const ref = id => FB.doc(fs, "uitgaven", id);
const store = {
  add(data){ const id = uuid(); const it = { ...data, aangemaakt: data.aangemaakt || nowIso(), gewijzigd: nowIso() };
    if(fs) write(FB.setDoc(ref(id), clean(it))); else { itemsMap[id] = { id, ...it }; saveLocal(); } return id; },
  set(id, data){ const it = { ...data, gewijzigd: nowIso() };
    if(fs) write(FB.setDoc(ref(id), clean(it))); else { itemsMap[id] = { id, ...it }; saveLocal(); } },
  update(id, data){ const p = { ...data, gewijzigd: nowIso() };
    if(fs) write(FB.updateDoc(ref(id), clean(p))); else { Object.assign(itemsMap[id], p); saveLocal(); } },
  remove(id){ if(fs) write(FB.deleteDoc(ref(id))); else { delete itemsMap[id]; saveLocal(); } },
  saveSettings(s){ state.settings = s; LS.set(K.settings, s); if(fs) write(FB.setDoc(FB.doc(fs, "instellingen", "algemeen"), s)); render(); }
};

const parts = { recent:{}, open:{}, older:{} }, meta = {};
function updateStatus(){
  const m = Object.values(meta);
  state.sync.pending = m.some(x => x.pending);
  if(state.sync.status === "fout" && !state.sync.pending) return;
  state.sync.status = !navigator.onLine ? "offline" : (state.sync.pending || m.some(x => x.cache)) ? "bezig" : "ok";
  if(state.sync.status === "ok") state.sync.error = null;
}
function subscribe(key, q){
  unsubs.push(FB.onSnapshot(q, { includeMetadataChanges:true }, snap => {
    const o = {}; snap.forEach(d => o[d.id] = { id: d.id, ...d.data() }); parts[key] = o;
    meta[key] = { pending: snap.metadata.hasPendingWrites, cache: snap.metadata.fromCache };
    itemsMap = { ...parts.older, ...parts.recent, ...parts.open };
    updateStatus(); refreshItems(); render();
  }, fail));
}
function listen(){
  const col = FB.collection(fs, "uitgaven");
  subscribe("recent", FB.query(col, FB.where("datum", ">=", CUTOFF)));
  subscribe("open", FB.query(col, FB.where("status", "==", "te_betalen")));
  unsubs.push(FB.onSnapshot(FB.doc(fs, "instellingen", "algemeen"), s => {
    if(s.exists()){ state.settings = { ...clone(DEFAULTS), ...s.data() }; LS.set(K.settings, state.settings); render(); }
  }, () => {}));
}
function loadOlder(){
  if(!fs || olderLoaded) return; olderLoaded = true;
  subscribe("older", FB.query(FB.collection(fs, "uitgaven"), FB.where("datum", "<", CUTOFF)));
}
function initCloud(){
  if(!CLOUD) return;
  try{
    const app = FB.initializeApp(CFG.firebase);
    auth = FB.getAuth(app);
    fs = FB.initializeFirestore(app, { localCache: FB.persistentLocalCache({ tabManager: FB.persistentMultipleTabManager() }) });
  }catch(e){ fail(e); return; }
  FB.onAuthStateChanged(auth, u => {
    if(u){ state.user = u.email; LS.set(K.user, u.email); if(!unsubs.length) listen(); }
    else { unsubs.forEach(f => f()); unsubs = []; state.user = null; LS.del(K.user); itemsMap = {}; refreshItems(); }
    render();
  });
  const net = () => { updateStatus(); renderPill(); };
  window.addEventListener("online", net); window.addEventListener("offline", net);
}

/* ============ Afgeleide gegevens ============ */
const paid = () => state.items.filter(i => i.status === "betaald");
const open = () => state.items.filter(i => i.status === "te_betalen").sort((a,b) => (a.vervaldatum||"9999").localeCompare(b.vervaldatum||"9999"));
const inMonth = (i, y, m) => (i.datum||"").startsWith(`${y}-${String(m+1).padStart(2,"0")}`);
const sum = arr => arr.reduce((s,i) => s + (i.bedrag||0), 0);
function byFreq(list, key){ const c = {}; state.items.forEach(i => i[key] && (c[i[key]] = (c[i[key]]||0)+1)); return [...list].sort((a,b) => (c[b]||0)-(c[a]||0)); }
const catColor = c => { const i = state.settings.categorieen.indexOf(c); return PALETTE[(i<0?7:i) % PALETTE.length]; };
function lastByOms(oms){ const k = oms.trim().toLowerCase(); return state.items.filter(i => (i.omschrijving||"").toLowerCase()===k).sort((a,b)=>(b.datum||"").localeCompare(a.datum||""))[0]; }
function topOms(){ const c = {}; state.items.forEach(i => { const o = (i.omschrijving||"").trim(); if(o) c[o]=(c[o]||0)+1; }); return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,8).map(e=>e[0]); }

/* ============ Weergave ============ */
function dueChip(i){
  if(!i.vervaldatum) return `<span class="chip-due ok">geen vervaldatum</span>`;
  const d = daysUntil(i.vervaldatum);
  if(d < 0) return `<span class="chip-due late">${-d} d te laat</span>`;
  if(d === 0) return `<span class="chip-due late">vandaag</span>`;
  if(d <= 7) return `<span class="chip-due soon">over ${d} d</span>`;
  return `<span class="chip-due ok">${fmtDate(i.vervaldatum)}</span>`;
}
function rowHTML(i, withPay){
  const sub = i.status === "te_betalen"
    ? `${dueChip(i)}${esc(i.categorie||"")}`
    : `${esc(i.categorie||"")}${i.betaalmiddel ? " · " + esc(i.betaalmiddel) : ""}${i.tags?.length ? " · " + esc(i.tags.join(", ")) : ""}`;
  const right = withPay
    ? `<div class="a">${money(i.bedrag)}<small><button type="button" class="btn-pay" data-act="paymenu" data-id="${i.id}">Betaald</button></small></div>`
    : `<div class="a">${money(i.bedrag)}<small>${fmtDate(i.datum)}</small></div>`;
  const pay = withPay ? `<div class="payline" ${state.openPay===i.id?"":"hidden"}>${byFreq(state.settings.betaalmiddelen,"betaalmiddel").map(m=>`<button type="button" class="paybtn" data-act="pay" data-id="${i.id}" data-pmet="${esc(m)}">${esc(m)}</button>`).join("")}</div>` : "";
  return `<div class="rowwrap"><div class="row" role="button" tabindex="0" data-act="edit" data-id="${i.id}">
    <span class="dot" style="background:${catColor(i.categorie)}"></span>
    <div style="min-width:0"><div class="t">${esc(i.omschrijving || i.categorie || "Uitgave")}${i.herhaling && i.herhaling!=="geen" ? ' <span class="muted" title="Komt terug">↻</span>' : ""}</div><div class="s">${sub}</div></div>
    ${right}</div>${pay}</div>`;
}
function pillHTML(){
  const s = state.sync.status, wait = state.sync.pending ? " · nog niet alles verstuurd" : "";
  const map = { local:["Alleen dit toestel",""], idle:["Verbinden…",""], bezig:["Synchroniseren…",""], ok:["● Gesynchroniseerd","ok"], offline:[`Offline${wait}`,"warn"], fout:["Probleem met opslaan","bad"] };
  const [t, c] = map[s] || map.idle;
  return `<button type="button" class="store-pill ${c}" data-act="sync" title="${esc(state.sync.error || "")}">${esc(t)}</button>`;
}
function renderPill(){ const p = $("#pill"); if(p) p.innerHTML = pillHTML(); }

function renderHome(){
  const y = now.getFullYear(), m = now.getMonth();
  const month = paid().filter(i => inMonth(i,y,m));
  const op = open(); const late = op.filter(i => i.vervaldatum && daysUntil(i.vervaldatum) < 0).length;
  const recent = [...paid()].sort((a,b)=>(b.datum||"").localeCompare(a.datum||"") || (b.aangemaakt||"").localeCompare(a.aangemaakt||"")).slice(0,8);
  const ex = state.items.filter(i=>i.voorbeeld).length;
  const banner = ex ? `<div class="banner"><span>Er staan ${ex} voorbeelden in om te tonen hoe het werkt.</span><button type="button" data-act="clear-examples">Voorbeelden wissen</button></div>` : "";
  const firstTime = !state.items.length ? `<div class="card" style="display:grid;gap:10px;margin-top:8px"><h2 style="font-size:18px">Welkom in je huisboekje</h2><p style="margin:0" class="muted">Tik op de groene + om je eerste uitgave in te geven. Wil je eerst zien hoe het eruitziet? Laad dan een paar voorbeelden; je wist ze daarna met één knop.</p><button type="button" class="btn-pay" style="justify-self:start;padding:9px 14px" data-act="load-examples">Toon voorbeelden</button></div>` : "";
  return `${banner}
  <div class="hero"><span class="label">Uitgegeven in ${MAANDEN[m]}</span><div class="big num">${money(sum(month))}</div>
    <div class="hero-row"><span class="stat ${op.length?"due":""}">Nog te betalen <b class="num">${money(sum(op))}</b> (${op.length})</span>${late?`<span class="stat due"><b>${late}</b> te laat</span>`:""}<span class="stat">${month.length} uitgaven deze maand</span></div></div>
  ${firstTime}
  <section><div class="sec-head"><h2>Te betalen</h2>${op.length>5?`<button class="link" data-act="goto-open">Alles (${op.length})</button>`:""}</div>
    <div class="list">${op.length ? op.slice(0,5).map(i=>rowHTML(i,true)).join("") : `<div class="empty">Niets openstaand. Facturen die je als "Nog te betalen" ingeeft, komen hier met hun vervaldatum.</div>`}</div></section>
  <section><div class="sec-head"><h2>Laatst ingegeven</h2><button class="link" data-nav="lijst">Alles</button></div>
    <div class="list">${recent.length ? recent.map(i=>rowHTML(i,false)).join("") : `<div class="empty">Nog niets betaald ingegeven.</div>`}</div></section>`;
}

function renderList(){
  const f = state.filter, q = f.q.trim().toLowerCase();
  const items = state.items.filter(i =>
    (f.status==="alle" || i.status===f.status) && (!f.cat || i.categorie===f.cat) &&
    (!q || [i.omschrijving,i.categorie,i.betaalmiddel,i.notitie,(i.tags||[]).join(" ")].join(" ").toLowerCase().includes(q)))
    .sort((a,b)=>(b.datum||"").localeCompare(a.datum||""));
  const groups = {}; items.forEach(i => (groups[(i.datum||"????-??").slice(0,7)] ||= []).push(i));
  const body = Object.entries(groups).map(([k,arr]) => { const [y,m] = k.split("-").map(Number);
    return `<div class="month-head"><span>${MAANDEN[m-1]||"?"} ${y||""}</span><span class="num">${money(sum(arr))}</span></div><div class="list">${arr.map(i=>rowHTML(i, i.status==="te_betalen")).join("")}</div>`; }).join("");
  return `<div class="top" style="padding-top:0"><h1 style="font-size:24px">Alle uitgaven</h1><span class="muted num">${items.length} · ${money(sum(items))}</span></div>
  <div class="filters">
    <input class="in" id="flt-q" type="search" placeholder="Zoek op winkel, tag, notitie…" value="${esc(f.q)}">
    <select class="in" id="flt-cat" style="flex:0 1 190px"><option value="">Alle categorieën</option>${state.settings.categorieen.map(c=>`<option ${c===f.cat?"selected":""}>${esc(c)}</option>`).join("")}</select>
  </div>
  <div class="chips" style="margin-bottom:4px">${[["alle","Alles"],["betaald","Betaald"],["te_betalen","Nog te betalen"]].map(([v,l])=>`<button type="button" class="chip" data-fstatus="${v}" aria-pressed="${f.status===v}">${l}</button>`).join("")}</div>
  ${body || `<div class="empty">Geen uitgaven gevonden.</div>`}
  ${CLOUD && !olderLoaded ? `<div style="text-align:center;margin-top:14px"><button type="button" class="link" data-act="older">Uitgaven ouder dan ${fmtDate(CUTOFF)} laden</button></div>` : ""}`;
}

function barsHTML(map, colorFn){
  const e = Object.entries(map).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
  if(!e.length) return `<div class="empty">Nog geen betaalde uitgaven in deze periode.</div>`;
  const max = e[0][1];
  return `<div class="bars">${e.map(([k,v])=>`<div class="bar"><span>${esc(k)}</span><span class="v">${money(v)}</span><div class="track"><div class="fill" style="width:${Math.max(2,v/max*100)}%;background:${colorFn(k)}"></div></div></div>`).join("")}</div>`;
}
function renderReport(){
  const r = state.rep;
  const sel = paid().filter(i => r.mode==="maand" ? inMonth(i,r.y,r.m) : (i.datum||"").startsWith(String(r.y)));
  const prev = paid().filter(i => r.mode==="maand" ? inMonth(i, r.m===0?r.y-1:r.y, (r.m+11)%12) : (i.datum||"").startsWith(String(r.y-1)));
  const tot = sum(sel), prevTot = sum(prev), diff = tot - prevTot;
  const by = k => { const o = {}; sel.forEach(i => { const key = i[k] || "Onbekend"; o[key] = (o[key]||0)+(i.bedrag||0); }); return o; };
  const tags = {}; sel.forEach(i => (i.tags||[]).forEach(t => tags[t]=(tags[t]||0)+(i.bedrag||0)));
  const months = Array.from({length:12},(_,m)=>sum(paid().filter(i=>inMonth(i,r.y,m)))); const mmax = Math.max(1,...months);
  const vast = {}; state.items.filter(i=>i.herhaling && i.herhaling!=="geen").forEach(i=>{ const k=(i.omschrijving||i.categorie||"").trim(); if(!vast[k] || (i.datum||"")>(vast[k].datum||"")) vast[k]=i; });
  const fac = {maand:12,kwartaal:4,jaar:1};
  const vastRows = Object.values(vast).map(i=>({n:i.omschrijving||i.categorie,h:i.herhaling,b:i.bedrag,j:(i.bedrag||0)*fac[i.herhaling]})).sort((a,b)=>b.j-a.j);
  return `<div class="period"><button class="arrow" data-act="rep-prev" aria-label="Vorige">‹</button>
    <div style="text-align:center"><h1>${r.mode==="maand" ? `${MAANDEN[r.m]} ${r.y}` : r.y}</h1><div class="seg" style="margin-top:6px;width:200px"><button type="button" data-rmode="maand" aria-pressed="${r.mode==="maand"}">Maand</button><button type="button" data-rmode="jaar" aria-pressed="${r.mode==="jaar"}">Jaar</button></div></div>
    <button class="arrow" data-act="rep-next" aria-label="Volgende">›</button></div>
  <div class="hero" style="text-align:center;justify-items:center"><div class="big num">${money(tot)}</div>
    <span class="muted">${prevTot ? `${diff>=0?"+":"−"}${money(Math.abs(diff))} t.o.v. ${r.mode==="maand"?MAANDEN[(r.m+11)%12]:r.y-1}` : `${sel.length} betaalde uitgaven`}</span></div>
  ${r.mode==="jaar" ? `<section><div class="card"><span class="label">Per maand</span><div class="months">${months.map((v,m)=>`<button type="button" class="mcol ${m===r.m?"cur":""}" data-month="${m}" title="${MAANDEN[m]}: ${money(v)}"><div class="b" style="height:${v/mmax*100}%"></div>${MK[m]}</button>`).join("")}</div></div></section>`:""}
  <section><div class="card"><div class="sec-head"><span class="label">Per categorie</span></div>${barsHTML(by("categorie"), catColor)}</div></section>
  <section class="grid2">
    <div class="card"><div class="sec-head"><span class="label">Per betaalmiddel</span></div>${barsHTML(by("betaalmiddel"), ()=>"var(--accent)")}</div>
    <div class="card"><div class="sec-head"><span class="label">Wie betaalde</span></div>${barsHTML(by("wie"), ()=>"var(--muted)")}</div>
  </section>
  ${Object.keys(tags).length?`<section><div class="card"><div class="sec-head"><span class="label">Per tag (uitstappen, projecten)</span></div>${barsHTML(tags, ()=>"var(--warn)")}</div></section>`:""}
  <section><div class="card"><div class="sec-head"><span class="label">Vaste kosten per jaar</span><b class="num">${money(vastRows.reduce((s,x)=>s+x.j,0))}</b></div>
    ${vastRows.length ? `<div class="bars">${vastRows.map(x=>`<div class="bar"><span>${esc(x.n)} <span class="muted">· ${money(x.b)} per ${x.h}</span></span><span class="v">${money(x.j)}</span></div>`).join("")}</div>` : `<div class="empty">Zet bij een uitgave "Komt terug" op maand, kwartaal of jaar. Dan zie je hier je vaste kosten per jaar.</div>`}
  </div></section>
  <section><button class="primary" style="width:100%" data-act="export">Exporteer naar Excel (CSV)</button></section>`;
}

function renderSettings(){
  const s = state.settings;
  let koppeling;
  if(!CLOUD) koppeling = `<p style="margin:0">Je gegevens staan alleen in deze browser. Vul <b>config.js</b> in met je Firebase-gegevens om gsm en laptop te koppelen (zie LEESMIJ).</p>`;
  else koppeling = `<p style="margin:0">Aangemeld als <b>${esc(state.user)}</b>.</p>
    <p class="muted" style="margin:0">${navigator.onLine ? (state.sync.pending ? "Wijzigingen worden verstuurd…" : "Alles is gesynchroniseerd.") : "Je bent offline. Wat je ingeeft wordt verstuurd zodra je weer verbinding hebt."}</p>
    ${state.sync.error ? `<p class="hint bad" style="margin:0">${esc(state.sync.error)}</p>` : ""}
    ${!olderLoaded ? `<p class="muted" style="margin:0">Uitgaven ouder dan 13 maanden worden pas geladen als je ze opvraagt (bespaart gratis verbruik).</p>` : ""}
    <div style="display:flex;gap:8px;flex-wrap:wrap">${!olderLoaded ? `<button type="button" class="btn-pay" data-act="older">Oudere uitgaven laden</button>` : ""}<button type="button" class="paybtn" data-act="logout">Afmelden op dit toestel</button></div>`;
  return `<h1 style="font-size:24px;margin-bottom:6px">Instellingen</h1>
  <div class="settings grid2" style="margin-top:12px">
    <div class="card"><label class="label" for="s-cat">Categorieën (één per regel)</label><textarea class="in" id="s-cat">${esc(s.categorieen.join("\n"))}</textarea></div>
    <div class="card"><label class="label" for="s-met">Betaalmiddelen (één per regel)</label><textarea class="in" id="s-met">${esc(s.betaalmiddelen.join("\n"))}</textarea>
      <label class="label" for="s-wie" style="margin-top:6px">Personen</label><textarea class="in" id="s-wie" style="min-height:90px">${esc(s.personen.join("\n"))}</textarea></div>
  </div>
  <section><button class="primary" style="width:100%" data-act="save-settings">Instellingen bewaren</button></section>
  <section class="card" style="display:grid;gap:8px"><span class="label">Koppeling gsm en laptop</span>${koppeling}</section>`;
}

function renderLogin(){
  return `<div class="login card">
    <div class="brand" style="font-size:24px">Huisboekje</div>
    <p class="muted" style="margin:0">Meld je aan met het account dat je in Firebase hebt aangemaakt. Op dit toestel blijf je daarna aangemeld, ook zonder internet.</p>
    <form id="login-form" style="display:grid;gap:10px" novalidate>
      <div class="field" style="margin:0"><label for="l-mail">E-mail</label><input class="in" id="l-mail" type="email" autocomplete="username" required></div>
      <div class="field" style="margin:0"><label for="l-pw">Wachtwoord</label><input class="in" id="l-pw" type="password" autocomplete="current-password" required></div>
      <p class="hint bad" id="l-err" style="margin:0"></p>
      <button class="primary" type="submit" id="l-btn">Aanmelden</button>
    </form></div>`;
}

function render(){
  const needLogin = CLOUD && !state.user;
  document.body.classList.toggle("no-nav", needLogin);
  if(needLogin){ if(!$("#login-form")) $("#app").innerHTML = renderLogin(); return; }
  const v = state.view;
  const top = `<div class="top"><div class="brand">Huisboekje<small>${new Date().toLocaleDateString("nl-BE",{weekday:"long",day:"numeric",month:"long"})}</small></div><span id="pill">${pillHTML()}</span></div>`;
  const a = document.activeElement, focusId = a?.id, caret = a?.selectionStart;
  // instellingen niet overschrijven terwijl je typt
  if(v==="instellingen" && /^s-/.test(focusId||"")){ renderPill(); return; }
  $("#app").innerHTML = top + (v==="home"?renderHome():v==="lijst"?renderList():v==="rapport"?renderReport():renderSettings());
  document.querySelectorAll(".nav [data-nav]").forEach(b => b.setAttribute("aria-current", b.dataset.nav===v ? "page" : "false"));
  if(focusId && $("#"+focusId) && !$("#sheet").contains($("#"+focusId))){ const el = $("#"+focusId); el.focus(); try{ if(caret!=null) el.setSelectionRange(caret,caret); }catch{} }
}

/* ============ Formulier ============ */
const form = { id:null, cat:"", met:"", wie:"", status:"betaald", touched:{}, delArmed:false, orig:null };
function chipRow(el, list, cur, attr){ el.innerHTML = list.map(x=>`<button type="button" class="chip" data-${attr}="${esc(x)}" aria-pressed="${x===cur}">${attr==="cat"?`<span class="dot" style="background:${catColor(x)}"></span>`:""}${esc(x)}</button>`).join(""); }
function paintForm(){
  chipRow($("#c-cat"), byFreq(state.settings.categorieen,"categorie"), form.cat, "cat");
  chipRow($("#c-met"), byFreq(state.settings.betaalmiddelen,"betaalmiddel"), form.met, "met");
  chipRow($("#c-wie"), state.settings.personen, form.wie, "wie");
  document.querySelectorAll("#seg-status button").forEach(b => b.setAttribute("aria-pressed", b.dataset.status===form.status));
  $("#lbl-met").textContent = form.status==="betaald" ? "Betaald met" : "Wordt betaald met (mag leeg)";
  const med = $("#f-med").value.trim(), h = $("#med-hint");
  if(medDigits(med).length===12 && /^\+*\d{3}\/?\d{4}\/?\d{5}\+*$/.test(med.replace(/\s/g,""))){ const ok = medValid(med); h.textContent = ok ? "Geldige gestructureerde mededeling" : "Let op: deze gestructureerde mededeling klopt niet (controlegetal)"; h.className = "hint" + (ok ? "" : " bad"); }
  else h.textContent = "";
}
function openForm(item){
  $("#form").reset();
  Object.assign(form, { id:item?.id||null, cat:item?.categorie||"", met:item?.betaalmiddel||"", wie:item?.wie||"", status:item?.status||"betaald", touched:{}, delArmed:false, orig:item||null });
  $("#f-title").textContent = item ? "Uitgave aanpassen" : "Nieuwe uitgave";
  $("#f-bedrag").value = item ? String(item.bedrag).replace(".", ",") : "";
  $("#f-oms").value = item?.omschrijving || "";
  $("#f-datum").value = item?.datum || today();
  $("#f-verval").value = item?.vervaldatum || "";
  $("#f-herh").value = item?.herhaling || "geen";
  $("#f-tags").value = (item?.tags||[]).join(", ");
  $("#f-iban").value = item?.iban || ""; $("#f-med").value = item?.mededeling || ""; $("#f-notitie").value = item?.notitie || "";
  $("#more").open = !!(item && (item.iban || item.mededeling || item.notitie || (item.tags||[]).length || (item.herhaling && item.herhaling!=="geen")));
  $("#btn-del").hidden = !item; $("#btn-del").textContent = "Verwijder";
  $("#dl-oms").innerHTML = [...new Set(state.items.map(i=>i.omschrijving).filter(Boolean))].map(o=>`<option value="${esc(o)}">`).join("");
  const q = topOms(); $("#quick-field").hidden = !!item || !q.length;
  $("#quick").innerHTML = q.map(o=>`<button type="button" class="chip" data-quick="${esc(o)}">${esc(o)}</button>`).join("");
  paintForm();
  $("#sheet").hidden = false; document.body.style.overflow = "hidden";
  if(!item) setTimeout(() => $("#f-bedrag").focus(), 60);
}
function closeForm(){ $("#sheet").hidden = true; document.body.style.overflow = ""; }
function applyRemembered(oms){
  const last = lastByOms(oms); if(!last) return;
  if(!form.touched.cat && last.categorie) form.cat = last.categorie;
  if(!form.touched.met && last.betaalmiddel) form.met = last.betaalmiddel;
  if(!form.touched.wie && last.wie) form.wie = last.wie;
  paintForm();
}
function saveForm(e){
  e.preventDefault();
  const bedrag = parseAmount($("#f-bedrag").value);
  if(!(bedrag > 0)){ toast("Vul een bedrag in."); $("#f-bedrag").focus(); return; }
  const oms = $("#f-oms").value.trim();
  if(!oms && !form.cat){ toast("Kies een categorie of vul in waar het was."); return; }
  let med = $("#f-med").value.trim(); if(medDigits(med).length===12 && /^[+\d\/\s]+$/.test(med)) med = medFormat(med);
  const o = form.orig || {}, wasPaid = o.status === "betaald";
  const data = {
    omschrijving: oms, bedrag, categorie: form.cat || "Overig", betaalmiddel: form.met || null, status: form.status,
    datum: $("#f-datum").value || today(), vervaldatum: $("#f-verval").value || null,
    betaald_op: form.status==="betaald" ? (wasPaid ? (o.betaald_op || today()) : today()) : null,
    herhaling: $("#f-herh").value, wie: form.wie || null,
    tags: $("#f-tags").value.split(",").map(t=>t.trim()).filter(Boolean),
    iban: $("#f-iban").value.replace(/\s+/g," ").trim() || null, mededeling: med || null, notitie: $("#f-notitie").value.trim() || null,
    volgende: !!o.volgende, voorbeeld: false, aangemaakt: o.aangemaakt || nowIso()
  };
  if(form.id){ store.set(form.id, data); if(data.status==="betaald" && !wasPaid) makeNext({ id: form.id, ...data }); }
  else store.add(data);
  closeForm(); toast(form.id ? "Aangepast" : "Opgeslagen");
}
function makeNext(item){
  if(!item.herhaling || item.herhaling==="geen" || item.volgende) return;
  const next = { ...item }; delete next.id;
  Object.assign(next, { status:"te_betalen", betaalmiddel: item.betaalmiddel==="Domiciliëring" ? item.betaalmiddel : null,
    datum: addPeriod(item.datum, item.herhaling), vervaldatum: addPeriod(item.vervaldatum || item.datum, item.herhaling),
    betaald_op:null, volgende:false, aangemaakt: nowIso() });
  store.update(item.id, { volgende:true });
  store.add(next);
  toast(`Volgende ${item.omschrijving || "betaling"} klaargezet voor ${fmtDate(next.vervaldatum)}`);
}
function markPaid(id, met){
  const item = itemsMap[id]; if(!item) return;
  state.openPay = null;
  store.update(id, { status:"betaald", betaalmiddel:met, betaald_op:today() });
  toast(`${item.omschrijving || "Factuur"} betaald met ${met}`);
  makeNext({ ...item, betaalmiddel: met });
}

/* ============ Voorbeelden & export ============ */
function loadExamples(){
  const d = n => { const t = new Date(); t.setDate(t.getDate()+n); return t.toLocaleDateString("sv-SE"); };
  const base = { tags:[], iban:null, mededeling:null, notitie:null, volgende:false, voorbeeld:true, vervaldatum:null };
  [
    { omschrijving:"Colruyt", bedrag:84.37, categorie:"Boodschappen", betaalmiddel:"KBC", status:"betaald", datum:d(-1), betaald_op:d(-1), herhaling:"geen", wie:"Vicky" },
    { omschrijving:"Bakker", bedrag:6.8, categorie:"Boodschappen", betaalmiddel:"Payconiq", status:"betaald", datum:d(0), betaald_op:d(0), herhaling:"geen", wie:"Tom" },
    { omschrijving:"Pannenkoekenhuis", bedrag:42.5, categorie:"Uit eten & uitstap", betaalmiddel:"Cash", status:"betaald", datum:d(-5), betaald_op:d(-5), herhaling:"geen", wie:"Samen", tags:["Ardennen"] },
    { omschrijving:"Tankstation", bedrag:71.2, categorie:"Auto & vervoer", betaalmiddel:"BNP Paribas Fortis", status:"betaald", datum:d(-6), betaald_op:d(-6), herhaling:"geen", wie:"Tom", tags:["Ardennen"] },
    { omschrijving:"Energie voorschot", bedrag:128, categorie:"Energie & water", betaalmiddel:"Domiciliëring", status:"te_betalen", datum:d(-1), vervaldatum:d(13), herhaling:"maand", wie:"Samen", mededeling:"+++123/4567/89002+++" },
    { omschrijving:"Autoverzekering", bedrag:486.9, categorie:"Verzekeringen", betaalmiddel:null, status:"te_betalen", datum:d(-12), vervaldatum:d(3), herhaling:"jaar", wie:null },
    { omschrijving:"Internet & gsm", bedrag:79, categorie:"Telecom & abonnementen", betaalmiddel:"KBC", status:"betaald", datum:d(-27), vervaldatum:d(-12), betaald_op:d(-14), herhaling:"maand", wie:"Samen" }
  ].forEach(x => store.add({ ...base, ...x, betaald_op: x.betaald_op || null }));
}
function exportCSV(){
  const cols = ["datum","omschrijving","bedrag","categorie","status","betaalmiddel","vervaldatum","betaald_op","herhaling","wie","tags","iban","mededeling","notitie"];
  const cell = v => { const s = Array.isArray(v) ? v.join(", ") : typeof v==="number" ? String(v).replace(".", ",") : String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
  const rows = [...state.items].sort((a,b)=>(a.datum||"").localeCompare(b.datum||"")).map(i => cols.map(c=>cell(i[c])).join(";"));
  const blob = new Blob(["﻿" + cols.join(";") + "\n" + rows.join("\n")], { type:"text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `huisboekje-${today()}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ============ Gebeurtenissen ============ */
document.addEventListener("click", async e => {
  const t = e.target.closest("[data-act],[data-nav],[data-cat],[data-met],[data-wie],[data-status],[data-quick],[data-fstatus],[data-rmode],[data-month],[data-copy]");
  if(!t) return;
  const d = t.dataset;
  if(d.nav){ state.view = d.nav; render(); window.scrollTo(0,0); return; }
  if(d.cat !== undefined){ form.cat = form.cat===d.cat ? "" : d.cat; form.touched.cat = true; paintForm(); return; }
  if(d.met !== undefined){ form.met = form.met===d.met ? "" : d.met; form.touched.met = true; paintForm(); return; }
  if(d.wie !== undefined){ form.wie = form.wie===d.wie ? "" : d.wie; form.touched.wie = true; paintForm(); return; }
  if(d.status){ form.status = d.status; paintForm(); if(d.status==="te_betalen") $("#f-verval").focus(); return; }
  if(d.quick){ $("#f-oms").value = d.quick; applyRemembered(d.quick); $("#f-bedrag").focus(); return; }
  if(d.fstatus){ state.filter.status = d.fstatus; render(); return; }
  if(d.rmode){ state.rep.mode = d.rmode; render(); return; }
  if(d.month){ state.rep.m = Number(d.month); state.rep.mode = "maand"; render(); return; }
  if(d.copy){ const el = $("#"+d.copy); try{ await navigator.clipboard.writeText(el.value); toast("Gekopieerd"); }catch{ el.select(); toast("Selecteer en kopieer zelf"); } return; }
  switch(d.act){
    case "new": openForm(null); break;
    case "close": closeForm(); break;
    case "edit": { const it = itemsMap[d.id]; if(it) openForm(it); break; }
    case "paymenu": e.stopPropagation(); state.openPay = state.openPay===d.id ? null : d.id; render(); break;
    case "pay": e.stopPropagation(); markPaid(d.id, d.pmet); break;
    case "goto-open": state.view="lijst"; state.filter.status="te_betalen"; render(); break;
    case "delete":
      if(!form.delArmed){ form.delArmed = true; t.textContent = "Zeker? Tik nogmaals"; setTimeout(()=>{ form.delArmed=false; t.textContent="Verwijder"; }, 3500); break; }
      store.remove(form.id); closeForm(); toast("Verwijderd"); break;
    case "load-examples": loadExamples(); break;
    case "clear-examples": state.items.filter(i=>i.voorbeeld).forEach(i => store.remove(i.id)); break;
    case "older": loadOlder(); toast("Oudere uitgaven worden geladen"); break;
    case "rep-prev": { const r=state.rep; if(r.mode==="jaar") r.y--; else if(r.m===0){ r.m=11; r.y--; } else r.m--;
      if(`${r.y}-${String((r.mode==="jaar"?11:r.m)+1).padStart(2,"0")}-31` < CUTOFF || (r.mode==="jaar" && `${r.y}-01-01` < CUTOFF)) loadOlder(); render(); break; }
    case "rep-next": { const r=state.rep; if(r.mode==="jaar") r.y++; else if(r.m===11){ r.m=0; r.y++; } else r.m++; render(); break; }
    case "export": exportCSV(); break;
    case "sync": if(state.sync.error) toast(state.sync.error); break;
    case "logout":
      if(state.sync.pending && !navigator.onLine){ toast("Er zijn nog wijzigingen die niet verstuurd zijn. Wacht tot je weer verbinding hebt."); break; }
      try{ await FB.signOut(auth); }catch{}
      break;
    case "save-settings": {
      const lines = id => $("#"+id).value.split("\n").map(s=>s.trim()).filter(Boolean);
      const s = { categorieen: lines("s-cat"), betaalmiddelen: lines("s-met"), personen: lines("s-wie") };
      if(!s.categorieen.length || !s.betaalmiddelen.length){ toast("Hou minstens één categorie en één betaalmiddel."); break; }
      document.activeElement?.blur(); store.saveSettings(s); toast("Instellingen bewaard"); break; }
  }
});
document.addEventListener("submit", async e => {
  if(e.target.id === "form") return saveForm(e);
  if(e.target.id !== "login-form") return;
  e.preventDefault();
  const btn = $("#l-btn"), err = $("#l-err"); err.textContent = "";
  const email = $("#l-mail").value.trim(), password = $("#l-pw").value;
  if(!email || !password){ err.textContent = "Vul je e-mail en wachtwoord in."; return; }
  if(!navigator.onLine){ err.textContent = "Je hebt internet nodig om de eerste keer aan te melden."; return; }
  btn.disabled = true; btn.textContent = "Aanmelden…";
  try{
    await FB.signInWithEmailAndPassword(auth, email, password);
    $("#app").innerHTML = ""; render();
  }catch(e2){
    const c = e2?.code || "";
    err.textContent = /invalid-credential|wrong-password|user-not-found|invalid-email/.test(c) ? "E-mail of wachtwoord klopt niet."
      : c === "auth/too-many-requests" ? "Te veel pogingen. Wacht even en probeer opnieuw."
      : c === "auth/network-request-failed" ? "Geen verbinding met Firebase. Controleer je internet."
      : /api-key|invalid-api-key|configuration-not-found/.test(c) ? "De gegevens in config.js kloppen niet, of e-mail/wachtwoord staat niet aan in Firebase."
      : (e2?.message || "Aanmelden lukte niet.");
  }finally{ btn.disabled = false; btn.textContent = "Aanmelden"; }
});
document.addEventListener("keydown", e => {
  if(e.key==="Escape" && !$("#sheet").hidden) closeForm();
  if((e.key==="Enter"||e.key===" ") && e.target.matches?.(".row[data-act]")){ e.preventDefault(); e.target.click(); }
});
$("#sheet").addEventListener("click", e => { if(e.target.id==="sheet") closeForm(); });
$("#f-oms").addEventListener("change", e => applyRemembered(e.target.value));
$("#f-med").addEventListener("input", paintForm);
document.addEventListener("input", e => { if(e.target.id==="flt-q"){ state.filter.q = e.target.value; render(); } });
document.addEventListener("change", e => { if(e.target.id==="flt-cat"){ state.filter.cat = e.target.value; render(); } });

if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(()=>{});
render();
initCloud();
})();
