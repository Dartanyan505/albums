
/* Album Grid — Clean Stable Build */
"use strict";

/* =============================
   Config & Caches
============================= */
const API_KEY = "54a081b58d13ffae5583342c642053a0"; // Last.fm album.getinfo
const albumCache = new Map();   // Last.fm album info cache
const yearCache  = new Map();   // Apple/iTunes year cache

/* =============================
   DOM references
============================= */
const panel         = document.getElementById("panel");
const panelTitle    = document.getElementById("panelTitle");
const panelContent  = document.getElementById("panelContent");
const panelCloseBtn = document.getElementById("panelClose");

/* =============================
   Small helpers
============================= */
function isAbsHttp(u){ return typeof u==="string" && /^https?:\/\//i.test(u.trim()); }
function slugify(s){ return String(s||"").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }
function albumHash(artist,title){ return `#/${slugify(artist)}/${slugify(title)}`; }

/* =============================
   Last.fm: album info (tracks + images)
============================= */
async function fetchAlbumInfo(artist, album){
  const key = `${artist}|${album}`;
  if(albumCache.has(key)) return albumCache.get(key);
  const url=`https://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=${API_KEY}&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}&format=json`;
  try{
    const res = await fetch(url);
    if(!res.ok) return null;
    const data = await res.json();
    const out = data?.album || null;
    if(out) albumCache.set(key,out);
    return out;
  }catch{ return null; }
}

/* =============================
   Apple/iTunes: year lookup
============================= */
function parseAppleIdFromUrl(u){
  if(!u) return "";
  const m1 = u.match(/\/album\/[^/]+\/(\d+)/i); if(m1) return m1[1];
  const m2 = u.match(/\/id(\d+)/i); if(m2) return m2[1];
  return "";
}
function norm(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim(); }
async function fetchYearFromApple(artist,title,appleUrl){
  const key = `${artist}|${title}|${appleUrl||""}`;
  if(yearCache.has(key)) return yearCache.get(key);

  const id = parseAppleIdFromUrl(appleUrl||"");
  try{
    if(id){
      const r = await fetch(`https://itunes.apple.com/lookup?id=${id}`);
      if(r.ok){
        const j = await r.json();
        const yrs = (j.results||[]).map(x=>(x.releaseDate||"").slice(0,4)).filter(y=>/^\d{4}$/.test(y));
        if(yrs.length){ const y = yrs.sort()[0]; yearCache.set(key,y); return y; }
      }
    }
  }catch{}

  try{
    const term = encodeURIComponent(`${artist} ${title}`);
    const r = await fetch(`https://itunes.apple.com/search?term=${term}&entity=album&limit=5`);
    if(r.ok){
      const j = await r.json();
      const cand = j.results||[];
      const nt = norm(title), na = norm(artist);
      cand.sort((a,b)=>{
        const sa = (norm(a.collectionName).includes(nt)?1:0) + (norm(a.artistName).includes(na)?1:0);
        const sb = (norm(b.collectionName).includes(nt)?1:0) + (norm(b.artistName).includes(na)?1:0);
        return sb-sa;
      });
      for(const it of cand){
        const y = (it.releaseDate||"").slice(0,4);
        if(/^\d{4}$/.test(y)){ yearCache.set(key,y); return y; }
      }
    }
  }catch{}
  return "";
}

/* =============================
   Panel header: title + year (inside header, above border)
============================= */
function ensureHeaderYearNode(){
  const headerEl = panel?.querySelector("header");
  if(!headerEl) return null;

  // Create left column container
  let left = headerEl.querySelector(".head-left");
  const closeBtn = document.getElementById("panelClose");
  if(!left){
    left = document.createElement("div");
    left.className = "head-left";
    left.style.display = "flex";
    left.style.flexDirection = "column";
    left.style.gap = "2px";
    headerEl.insertBefore(left, closeBtn || null);
  }

  // Move title into left
  if(panelTitle && panelTitle.parentElement !== left){
    left.insertBefore(panelTitle, left.firstChild || null);
  }

  // Ensure year node
  let meta = document.getElementById("panelMetaLine");
  if(!meta){
    meta = document.createElement("div");
    meta.id = "panelMetaLine";
    meta.className = "meta-line";
    meta.style.margin = "2px 0 0 0";
    meta.style.fontSize = ".9rem";
    meta.style.opacity = ".7";
    left.appendChild(meta);
  }else if(meta.parentElement !== left){
    left.appendChild(meta);
  }
  return meta;
}

/* =============================
   Panel open/close
============================= */
let __lastFocused = null;

function closePanel(){
  if(!panel) return;
  panel.classList.remove("open");
  document.getElementById("panelOverlay")?.classList.remove("open"); // overlay'i kapat
  document.body.style.overflow = "";
  if(location.hash) history.replaceState(null,"",location.pathname+location.search+"#/");
  try{ __lastFocused?.focus?.(); }catch{}
}

function openPanel(album, opts={}){
  __lastFocused = document.activeElement;
  if(!album) return;

  const desc  = (typeof opts==="object"&&opts!==null) ? (opts.desc||"") : (opts||"");
  const links = (typeof opts==="object"&&opts!==null) ? (opts.links||{}) : {};
  const jsonYear = (typeof opts==="object"&&opts!==null && opts.year) ? String(opts.year) : "";

  // Title & year in header
  panelTitle.textContent = `${album.artist} — ${album.name}`;
  const yearNode = ensureHeaderYearNode();
  if(yearNode) yearNode.textContent = jsonYear || "";

  // Cover image
  let imgUrl = "";
  if(Array.isArray(album.image)){
    imgUrl = album.image.find(i=>i.size==="mega")?.["#text"] ||
             album.image.find(i=>i.size==="extralarge")?.["#text"] ||
             album.image[album.image.length-1]?.["#text"] || "";
    if(imgUrl.includes("300x300")) imgUrl = imgUrl.replace("300x300","600x600");
  }

  const q = encodeURIComponent(`${album.artist} ${album.name}`);
  const spotifyUrl = isAbsHttp(links.spotify) ? links.spotify : `https://open.spotify.com/search/${q}`;
  const ytmusicUrl = isAbsHttp(links.ytmusic) ? links.ytmusic : (isAbsHttp(links.yt) ? links.yt : `https://music.youtube.com/search?q=${q}`);
  const appleUrl   = isAbsHttp(links.apple)   ? links.apple   : `https://music.apple.com/search?term=${q}`;

  panelContent.innerHTML = `
    <img src="${imgUrl}" class="album-cover" alt="${album.name}">
    <div class="play-buttons">
      <a href="${spotifyUrl}" target="_blank" class="play-button spotify" aria-label="Spotify"></a>
      <a href="${ytmusicUrl}" target="_blank" class="play-button yt" aria-label="YouTube Music"></a>
      <a href="${appleUrl}" target="_blank" class="play-button apple" aria-label="Apple Music"></a>
    </div>
    <h4 style="margin-top:16px;">Açıklama</h4>
    <p>${desc || "Henüz açıklama eklenmedi."}</p>
    <h4>Parçalar</h4>
    <ol>${(album.tracks?.track || []).map(t=>`<li>${t.name}</li>`).join("")}</ol>
  `;

  // Dynamic year from Apple if JSON missing
  (async()=>{
    if(!jsonYear && yearNode){
      try{
        const y = await fetchYearFromApple(album.artist, album.name, (links.apple||""));
        if(y) yearNode.textContent = y;
      }catch{}
    }
  })();

  // Open panel + overlay
  panel.classList.add("open");
  document.getElementById("panelOverlay")?.classList.add("open");
  if (window.innerWidth <= 640) document.body.style.overflow = "hidden";

  // Focus trap...
  // (senin mevcut focus trap kodun burada aynı kalıyor)

  preloadNeighbors();
}

/* Close interactions */
panelCloseBtn?.addEventListener("click", closePanel);
panel?.addEventListener("click",(e)=>{ if(e.target===panel) closePanel(); });
document.addEventListener("keydown",(e)=>{ if(e.key==="Escape" && panel?.classList.contains("open")) closePanel(); },{passive:true});

// Overlay tıklayınca kapat
document.getElementById("panelOverlay")
  ?.addEventListener("click", closePanel);


/* =============================
   Swipe-down to close (mobile)
============================= */
let __swipeStartY=null, __swipeMoved=0;
panel?.addEventListener("touchstart",(e)=>{
  if(!panel.classList.contains("open")) return;
  __swipeStartY = e.touches[0].clientY; __swipeMoved=0;
},{passive:true});
panel?.addEventListener("touchmove",(e)=>{
  if(__swipeStartY==null || !panel.classList.contains("open")) return;
  __swipeMoved = e.touches[0].clientY - __swipeStartY;
  if(__swipeMoved>0 && panelContent){
    panelContent.style.transform = `translateY(${Math.min(__swipeMoved,140)}px)`;
  }
},{passive:true});
panel?.addEventListener("touchend",()=>{
  if(!panel.classList.contains("open")) return;
  if(panelContent) panelContent.style.transform = "";
  if(__swipeMoved>120) closePanel();
  __swipeStartY=null; __swipeMoved=0;
});

/* =============================
   Neighbor preloading & keyboard nav
============================= */
function allCards(){ return [...document.querySelectorAll(".album")]; }
function currentIndexFromHash(){
  const m = location.hash.match(/^#\/([^/]+)\/([^/]+)\/?$/); if(!m) return -1;
  const [_,a,t]=m; return allCards().findIndex(el => slugify(el.dataset.artist)===a && slugify(el.dataset.title)===t);
}
async function preloadImg(src){ try{ if(!src) return; const im=new Image(); im.src=src; await im.decode(); }catch{} }
async function preloadNeighbors(){
  const idx = currentIndexFromHash(); if(idx<0) return;
  const cards = allCards(); if(!cards.length) return;
  const L = (idx-1+cards.length)%cards.length;
  const R = (idx+1)%cards.length;
  preloadImg(cards[L].querySelector("img")?.src);
  preloadImg(cards[R].querySelector("img")?.src);
}
document.addEventListener("keydown",(e)=>{
  if(!panel?.classList.contains("open")) return;
  if(e.key!=="ArrowLeft" && e.key!=="ArrowRight") return;
  const cards = allCards(); if(!cards.length) return;
  let i = currentIndexFromHash(); if(i<0) return;
  i = e.key==="ArrowRight" ? (i+1)%cards.length : (i-1+cards.length)%cards.length;
  cards[i].click();
});

/* =============================
   Build grid & interactions
============================= */
function setupAlbums(){
  const stage = document.getElementById("stage");
  if(!stage) return;

  stage.addEventListener("click", async (e)=>{
    const card = e.target.closest(".album"); if(!card) return;
    const artist = card.dataset.artist, title = card.dataset.title, desc = card.dataset.desc || "";
    const overrides = { spotify:card.dataset.spotify||"", ytmusic:card.dataset.ytmusic||card.dataset.yt||"", yt:card.dataset.yt||"", apple:card.dataset.apple||"" };
    const info = await fetchAlbumInfo(artist,title);
    if(info){
      location.hash = albumHash(artist,title);
      openPanel(info, { desc, links: overrides, year: (card.dataset.year||"") });
    }
  });

  stage.addEventListener("keydown", async (e)=>{
    if(e.key!=="Enter") return;
    const card = e.target.closest(".album"); if(!card) return;
    const artist = card.dataset.artist, title = card.dataset.title, desc = card.dataset.desc || "";
    const overrides = { spotify:card.dataset.spotify||"", ytmusic:card.dataset.ytmusic||card.dataset.yt||"", yt:card.dataset.yt||"", apple:card.dataset.apple||"" };
    const info = await fetchAlbumInfo(artist,title);
    if(info){
      location.hash = albumHash(artist,title);
      openPanel(info, { desc, links: overrides, year: (card.dataset.year||"") });
    }
  });
}

/* =============================
   Deep-link open
============================= */
async function openFromHash(){
  const m = location.hash.match(/^#\/([^/]+)\/([^/]+)\/?$/);
  if(!m){ if(panel?.classList.contains("open")) closePanel(); return; }
  const [,a,t] = m;
  const card = allCards().find(el => slugify(el.dataset.artist)===a && slugify(el.dataset.title)===t);
  if(!card) return;
  const artist = card.dataset.artist, title = card.dataset.title, desc = card.dataset.desc || "";
  const overrides = { spotify:card.dataset.spotify||"", ytmusic:card.dataset.ytmusic||card.dataset.yt||"", yt:card.dataset.yt||"", apple:card.dataset.apple||"" };
  const info = await fetchAlbumInfo(artist,title);
  if(info) openPanel(info, { desc, links: overrides, year: (card.dataset.year||"") });
}
window.addEventListener("hashchange", openFromHash);

/* =============================
   Header arrow + hero line
============================= */
function ensureScrollArrow(){
  const header = document.getElementById("siteHeader");
  if(!header) return;

  // Use existing elements if present
  let arrow = header.querySelector(".scroll-down");
  let line  = header.querySelector(".hero-line");

  // If not present, create them
  if(!arrow){
    arrow = document.createElement("div");
    arrow.className = "scroll-down";
    arrow.innerHTML = `<span class="scroll-down-inner"><svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v14m0 0l-6-6m6 6l6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
    header.appendChild(arrow);
  } else if (!arrow.querySelector(".scroll-down-inner")) {
    const wrap = document.createElement("span");
    wrap.className = "scroll-down-inner";
    wrap.innerHTML = arrow.innerHTML;
    arrow.innerHTML = "";
    arrow.appendChild(wrap);
  }

  if(!line){
    line = document.createElement("div");
    line.className = "hero-line";
    header.appendChild(line);
  }

  // Click → smooth scroll
  arrow.addEventListener("click",(e)=>{
    const target = document.getElementById("stage") || document.querySelector("main") || document.body;
    target.scrollIntoView({behavior:"smooth", block:"start"});
  });

  // Scroll → animate line & fade arrow
  const onScroll = () => {
    const max = Math.min((window.innerHeight || 1) * 0.6, 500);
    const sc  = Math.min(window.scrollY, max);
    const t   = max ? (sc / max) : 0;
    line.classList.toggle("active", t > 0.05);
    line.style.transform = `translateX(-50%) scaleX(${Math.max(0.001, t).toFixed(3)})`;
    line.style.opacity = t > 0.05 ? "1" : "0";
    arrow.style.opacity = String(1 - t);
    arrow.style.pointerEvents = t > 0.95 ? "none" : "auto";
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

/* =============================
   Boot
============================= */
async function init(){
  try{ ensureScrollArrow(); }catch{}
  const stage = document.getElementById("stage");
  if(!stage) return;
  stage.innerHTML = "";

  // Load albums.json
  const res = await fetch("albums.json");
  const albums = await res.json();

  // Fetch info in parallel
  const infos = await Promise.all(albums.map(d=>fetchAlbumInfo(d.artist, d.title)));

  // Build grid
  const frag = document.createDocumentFragment();
  albums.forEach((d,i)=>{
    const info = infos[i];
    let imgUrl="";
    const candidates = info?.image?.filter(x=>x["#text"]);
    if(candidates?.length) imgUrl = candidates[candidates.length-1]["#text"];
    if(!imgUrl) imgUrl = `https://via.placeholder.com/400x400?text=${encodeURIComponent(d.title)}`;

    const el = document.createElement("div");
    el.className = "album";
    el.dataset.artist = d.artist;
    el.dataset.title  = d.title;
    el.dataset.desc   = d.desc || "";
    if(d.year)    el.dataset.year    = d.year;
    if(d.spotify) el.dataset.spotify = d.spotify;
    if(d.ytmusic) el.dataset.ytmusic = d.ytmusic;
    if(d.yt)      el.dataset.yt      = d.yt;
    if(d.apple)   el.dataset.apple   = d.apple;
    el.tabIndex = 0;
    el.style.animationDelay = (i*0.05) + "s";

    el.innerHTML = `
      <img src="${imgUrl}" alt="${d.title}" loading="lazy">
      <div class="overlay"><strong>${d.title}</strong></div>
    `;
    frag.appendChild(el);
  });
  stage.appendChild(frag);

  setupAlbums();
}



init().then(()=> openFromHash());
