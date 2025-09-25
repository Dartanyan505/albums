/* =============================
   Album Float — Clean Stable Build
   (drop-in replacement for main.js)
============================= */
"use strict";

/* === Fizik/Alan Parametreleri === */
let SIZE, HALF, SEPARATION_DIST, SPRING_REST, EDGE_BAND, MOUSE_RADIUS, MOUSE_DEADZONE, MOUSE_FORCE;
const SPRING_K=0.003, SPRING_DAMP=0.1;
const CENTER_K=0.0010, GROUP_K=0.0022, WALL_K=0.018;
const EDGE_FRICTION=0.92;
const WATER_STRENGTH=0.04 * 4, WATER_SCALE=100, WATER_SPEED_X=0.45 * 2, WATER_SPEED_Y=0.65;
const DAMPING=0.98, MAX_SPEED=3.5;
const MOUSE_STRENGTH=0.36, MOUSE_PROPAGATION=0.15;

/* === Global DOM refs (DOMContentLoaded içinde atanacak) === */
let stage, panel, panelTitle, panelContent, panelCloseBtn;

/* === Caches & API === */
const API_KEY = "54a081b58d13ffae5583342c642053a0"; // Last.fm album.getinfo
const albumCache = new Map();   // Last.fm album info cache
const yearCache  = new Map();   // Apple/iTunes year cache

/* === Yardımcılar === */
function isAbsHttp(u){ return typeof u==="string" && /^https?:\/\//i.test(u?.trim?.()||""); }
function slugify(s){ return String(s||"").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }
function albumHash(artist,title){ return `#/${slugify(artist)}/${slugify(title)}`; }

function computeParams(){
  SIZE = window.innerWidth / 6;
  HALF = SIZE/2;
  document.documentElement.style.setProperty('--size', SIZE + 'px');
  SEPARATION_DIST = SIZE * 3.2;
  SPRING_REST     = SIZE * 2.0;
  EDGE_BAND       = 24 * (SIZE/104);
  MOUSE_RADIUS    = 330 * (SIZE/104);
  MOUSE_DEADZONE  = 46  * (SIZE/104);
  MOUSE_FORCE = 1.0
}
const W = () => stage?.clientWidth  || window.innerWidth;
const H = () => stage?.clientHeight || window.innerHeight;

function upscaleImage(url) {
  if (!url) return url;
  return url.replace(/300x300/g, "600x600");
}

// === Blob URL cache (ağ isteklerini 1 defaya düşürür) ===
const blobUrlCache = new Map();      // orijinalURL -> blobURL (veya fallback orijinalURL)
const inflightBlob = new Map();      // single-flight: aynı URL için tek fetch

function upscaleImage(url) { // varsa 300x300 -> 600x600
  if (!url) return url;
  return url.replace(/300x300/g, "600x600");
}

async function getCoverSrc(url) {
  if (!url) return "";
  url = upscaleImage(url);

  if (blobUrlCache.has(url)) return blobUrlCache.get(url);
  if (inflightBlob.has(url)) return inflightBlob.get(url);

  // Tek uçuş: aynı anda gelen istekleri birleştir
  const p = (async () => {
    try {
      const res = await fetch(url, { mode: "cors", cache: "force-cache" });
      if (!res.ok) throw new Error("fetch failed: " + res.status);
      const blob = await res.blob();
      const obj  = URL.createObjectURL(blob);
      blobUrlCache.set(url, obj);
      return obj;
    } catch (e) {
      // CORS engeli veya hata varsa, orijinal URL'yi kullan (yeniden doğrulama olabilir)
      blobUrlCache.set(url, url);
      return url;
    } finally {
      inflightBlob.delete(url);
    }
  })();

  inflightBlob.set(url, p);
  return p;
}

// Sayfa kapanırken blob URL'leri temizlemek isterseniz:
window.addEventListener("beforeunload", () => {
  for (const u of blobUrlCache.values()) {
    if (typeof u === "string" && u.startsWith("blob:")) URL.revokeObjectURL(u);
  }
});


/* === Water field (su alanı) === */
function waterField(x,y,t){
  return {
    ax: WATER_STRENGTH * Math.sin((y + t*60*WATER_SPEED_X)/WATER_SCALE),
    ay: WATER_STRENGTH * Math.cos((x + t*60*WATER_SPEED_Y)/WATER_SCALE)
  };
}

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
   Apple/iTunes: release year lookup
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
   Panel open/close
============================= */
let __lastFocused = null;

function ensureHeaderYearNode(){
  const headerEl = panel?.querySelector("header");
  if(!headerEl) return null;

  // left column
  let left = headerEl.querySelector(".head-left");
  const closeBtn = panel.querySelector("#panelClose");
  if(!left){
    left = document.createElement("div");
    left.className = "head-left";
    left.style.display = "flex";
    left.style.flexDirection = "column";
    left.style.gap = "2px";
    headerEl.insertBefore(left, closeBtn || null);
  }
  // move title
  if(panelTitle && panelTitle.parentElement !== left){
    left.insertBefore(panelTitle, left.firstChild || null);
  }
  // ensure year line
  let meta = document.getElementById("panelMetaLine");
  if(!meta){
    meta = document.createElement("div");
    meta.id = "panelMetaLine";
    meta.className = "meta-line";
    meta.style.margin = "2px 0 0 0";
    meta.style.fontSize = ".9rem";
    meta.style.opacity  = ".7";
    left.appendChild(meta);
  }else if(meta.parentElement !== left){
    left.appendChild(meta);
  }
  return meta;
}

function closePanel(){
  if(!panel) return;
  panel.classList.remove("open");
  document.getElementById("panelOverlay")?.classList.remove("open");
  document.body.classList.remove('no-scroll');
  if(location.hash) history.replaceState(null,"",location.pathname+location.search+"#/");

  try{
    if (window.innerWidth < 768) {
      __lastFocused?.focus?.({ preventScroll: true });
    }
  }catch{}
}


function applyPanelBackground(img, panelEl) {
  try {
    const ct = new ColorThief();
    let palette = [];
    try {
      palette = ct.getPalette(img, 5) || [];
    } catch (_) {}

    let base = null;
    try {
      base = ct.getColor(img);
    } catch (_) {
      base = null;
    }

    const c1 = palette[0] || base || [34, 34, 34];
    const c2 = palette[2] || palette[1] || c1;

    // Luminans kontrolü ile parlaklığı biraz azalt
    const dim = (c) => {
      const [r, g, b] = c;
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b; // perceived luminance
      const k = L > 180 ? 0.75 : 0.9;
      return [Math.round(r * k), Math.round(g * k), Math.round(b * k)];
    };

    const d1 = dim(c1),
      d2 = dim(c2);

    // CSS değişkenlerini ayarla
    panelEl.style.setProperty(
      "--panel-bg1",
      `rgba(${d1[0]},${d1[1]},${d1[2]},0.92)`
    );
    panelEl.style.setProperty(
      "--panel-bg2",
      `rgba(${d2[0]},${d2[1]},${d2[2]},0.85)`
    );
  } catch (e) {
    console.warn("Renk çıkarılamadı:", e);
    // Hata durumunda varsayılan değerler kalır
  }
}


// === Görsel cache ===
const imageCache = new Map();

function cacheImage(url) {
  if (!url) return null;
  if (imageCache.has(url)) return imageCache.get(url);

  const im = new Image();
  im.src = url;
  imageCache.set(url, im);
  return im;
}

async function openPanel(album, opts = {}) {
  __lastFocused = document.activeElement;

  const panelEl   = document.getElementById("panel");
  const overlayEl = document.getElementById("panelOverlay");
  if (!album || !panelEl || !panelContent || !panelTitle) return;

  // opts
  const isObj    = (typeof opts === "object" && opts !== null);
  const desc     = isObj ? (opts.desc || "") : (opts || "");
  const links    = isObj ? (opts.links || {}) : {};
  const jsonYear = isObj && opts.year ? String(opts.year) : "";

  // başlık + yıl
  panelTitle.textContent = `${album.artist} — ${album.name}`;
  const yearNode = ensureHeaderYearNode();
  if (yearNode) yearNode.textContent = jsonYear || "";

  // kapak URL (Last.fm image array)
  let imgUrl = "";
  if (Array.isArray(album.image)) {
    imgUrl =
      album.image.find(i => i.size === "mega" && i["#text"])?.["#text"] ||
      album.image.find(i => i.size === "extralarge" && i["#text"])?.["#text"] ||
      album.image[album.image.length - 1]?.["#text"] || "";
  }
  const coverSrc = await getCoverSrc(imgUrl); // blob veya fallback URL

  // platform linkleri
  const q = encodeURIComponent(`${album.artist} ${album.name}`);
  const spotifyUrl = isAbsHttp(links.spotify) ? links.spotify : `https://open.spotify.com/search/${q}`;
  const ytmusicUrl = isAbsHttp(links.ytmusic) ? links.ytmusic : (isAbsHttp(links.yt) ? links.yt : `https://music.youtube.com/search?q=${q}`);
  const appleUrl   = isAbsHttp(links.apple)   ? links.apple   : `https://music.apple.com/search?term=${q}`;

  // Panelde tek <img id="panelCover"> kullan
  let coverImg = panelContent.querySelector("#panelCover");
  if (!coverImg) {
    coverImg = document.createElement("img");
    coverImg.id = "panelCover";
    coverImg.className = "album-cover";
    coverImg.crossOrigin = "anonymous";
    panelContent.prepend(coverImg);
  }

  // Skeleton göster (kapak yüklenene kadar)
  coverImg.style.display = "none";
  let skeleton = panelContent.querySelector(".panel-skeleton");
  if (!skeleton) {
    skeleton = document.createElement("div");
    skeleton.className = "panel-skeleton";
    coverImg.insertAdjacentElement("beforebegin", skeleton);
  }

  // Kapak dışındaki içerikleri güncelle
  const extraHtml = `
    <div class="play-buttons">
      <a href="${spotifyUrl}" target="_blank" class="play-button spotify" aria-label="Spotify"></a>
      <a href="${ytmusicUrl}" target="_blank" class="play-button yt" aria-label="YouTube Music"></a>
      <a href="${appleUrl}"   target="_blank" class="play-button apple" aria-label="Apple Music"></a>
    </div>
    <h4 style="margin-top:16px;">Açıklama</h4>
    <p>${desc || "Henüz açıklama eklenmedi."}</p>
    <h4>Parçalar</h4>
    <ol>${(album.tracks?.track || []).map(t => `<li>${t.name}</li>`).join("")}</ol>
  `;
  const siblings = [...panelContent.children].filter(el => el.id !== "panelCover" && !el.classList.contains("panel-skeleton"));
  siblings.forEach(el => el.remove());
  coverImg.insertAdjacentHTML("afterend", extraHtml);

  // Kaynak ve alt yazı
  coverImg.src = coverSrc;
  coverImg.alt = album.name;

  // Yüklendiğinde skeleton'u kaldır + arka plan uygula
  const onReady = () => {
    skeleton?.remove();
    coverImg.style.display = "block";
    applyPanelBackground(coverImg, panelEl);
  };
  if ("decode" in coverImg) {
    coverImg.decode().then(onReady).catch(() => coverImg.onload = onReady);
  } else {
    if (coverImg.complete && coverImg.naturalWidth) onReady();
    else coverImg.onload = onReady;
  }

  // Yıl fallback (Apple)
  (async () => {
    if (!jsonYear && yearNode) {
      try {
        const y = await fetchYearFromApple(album.artist, album.name, (links.apple || ""));
        if (y) yearNode.textContent = y;
      } catch {}
    }
  })();

  // Paneli aç
  panelEl.classList.add("open");
  overlayEl?.classList.add("open");
  if (window.innerWidth <= 640) document.body.classList.add("no-scroll");
}


/* Stage yardımcıları */
function computeStageHeight(artistCount){
  const rowHeight = 560 * (SIZE/104);
  return Math.max(window.innerHeight, artistCount * rowHeight);
}

/* =============================
   Etiketler & Merkezler
============================= */
let nodes=[], artists=[], centers=new Map(), byArtist=new Map(), links=[];
const labels=new Map(), smoothLabelPos=new Map();
let mouse={x:null,y:null};

function artistCentersZigzag(w,h,artists){
  const leftX  = Math.max(SIZE + 120, w * 0.18);
  const rightX = Math.min(w - SIZE - 120, w * 0.82);
  const startY = SIZE * -5;
  const stepY  = SIZE * 2.8;
  const jitterX = SIZE * 0.07, jitterY = SIZE * 0.07;
  const map=new Map();
  artists.forEach((name,i)=>{
    const isLeft=(i%2===0);
    const cx=(isLeft?leftX:rightX)+(Math.random()-0.5)*2*jitterX;
    const cy=startY+i*stepY+(Math.random()-0.5)*2*jitterY;
    map.set(name,{x:cx,y:cy});
  });
  return map;
}

function renderLabels(){
  labels.forEach(el=>el.remove()); labels.clear();
  artists.forEach(name=>{
    const p=centers.get(name);
    const div=document.createElement('div');
    div.className='label'; div.style.left=p.x+'px'; div.style.top=p.y+'px';
    div.textContent=name; stage.appendChild(div); labels.set(name,div);
  });
}
function lerp(a,b,t){ return a+(b-a)*t; }
function updateLabelsToCentroids(){
  byArtist.forEach((arr,name)=>{
    if(!arr.length) return;
    let sx=0, sy=0; arr.forEach(n=>{ sx+=n.x+HALF; sy+=n.y+HALF; });
    const tx=sx/arr.length, ty=sy/arr.length;
    const prev=smoothLabelPos.get(name)||{x:tx,y:ty};
    const nx=lerp(prev.x,tx,0.15), ny=lerp(prev.y,ty,0.15);
    smoothLabelPos.set(name,{x:nx,y:ny});
    const div=labels.get(name); if(div){ div.style.left=nx+'px'; div.style.top=ny+'px'; }
  });
}

/* =============================
   Fizik dongü
============================= */
function startPhysics(){
  const elAlbums=Array.from(stage.querySelectorAll('.album'));
  nodes=elAlbums.map(el=>{
    const x=parseFloat(el.style.left)||Math.random()*(W()-SIZE);
    const y=parseFloat(el.style.top )||Math.random()*(H()-SIZE);
    return { el, artist:el.dataset.artist, title:el.dataset.title, desc:el.dataset.desc,
      x, y, vx:(Math.random()-0.5)*0.6, vy:(Math.random()-0.5)*0.6, hovered:false, ax:0, ay:0 };
  });
  artists=Array.from(new Set(nodes.map(n=>n.artist)));
  stage.style.height=computeStageHeight(artists.length)+'px';
  centers=artistCentersZigzag(W(),H(),artists);

  byArtist=new Map();
  nodes.forEach(n=>{ if(!byArtist.has(n.artist)) byArtist.set(n.artist,[]); byArtist.get(n.artist).push(n); });
  byArtist.forEach(arr=>arr.sort((a,b)=>(a.title||'').localeCompare(b.title||'')));
  links=[]; byArtist.forEach(arr=>{ for(let i=0;i<arr.length-1;i++) links.push({a:arr[i], b:arr[i+1]}); });

  nodes.forEach(n=>{
    n.el.addEventListener('mouseenter', ()=>{ n.hovered=true; n.el.classList.add('on-top'); }, {passive:true});
    n.el.addEventListener('mouseleave', ()=>{ n.hovered=false; n.el.classList.remove('on-top'); }, {passive:true});
    n.el.addEventListener('click', async ()=> {
      const info = await fetchAlbumInfo(n.artist, n.title);
      if(info){
        history.pushState(null, "", albumHash(n.artist, n.title));
        const overrides = {
          spotify:n.el.dataset.spotify||"",
          ytmusic:n.el.dataset.ytmusic||n.el.dataset.yt||"",
          yt:n.el.dataset.yt||"",
          apple:n.el.dataset.apple||""
        };
        openPanel(info, { desc: n.desc, links: overrides, year: (n.el.dataset.year||"") });
      }
    });
  });

  renderLabels();
  requestAnimationFrame(step);
}

let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;

document.addEventListener("mousemove", e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

function step(){
  const w = W(), h = H(), t = performance.now() / 1000;

  // 1) ivmeleri sıfırla + su alanı
  nodes.forEach(n => {
    n.ax = 0; 
    n.ay = 0;
    const f = waterField(n.x, n.y, t);
    n.ax += f.ax; 
    n.ay += f.ay;
  });



  // 2) grup ve genel merkez çekimi
  nodes.forEach(n => {
    const gc = centers.get(n.artist);
    if (gc) {
      n.ax += (gc.x - (n.x + HALF)) * GROUP_K;
      n.ay += (gc.y - (n.y + HALF)) * GROUP_K;
    }
    const cx = w / 2, cy = h / 2;
    n.ax += (cx - (n.x + HALF)) * CENTER_K;
    n.ay += (cy - (n.y + HALF)) * CENTER_K;
  });

  // 3) sınırdan geri itme
  nodes.forEach(n => {
    if (n.x < EDGE_BAND)            n.ax += WALL_K * (EDGE_BAND - n.x);
    if (n.y < EDGE_BAND)            n.ay += WALL_K * (EDGE_BAND - n.y);
    if (n.x + SIZE > w - EDGE_BAND) n.ax -= WALL_K * ((n.x + SIZE) - (w - EDGE_BAND));
    if (n.y + SIZE > h - EDGE_BAND) n.ay -= WALL_K * ((n.y + SIZE) - (h - EDGE_BAND));
  });

  // 4) ayrılma kuvveti
  const MIN   = SIZE * 0.98;
  const MIN2  = MIN * MIN;
  const SEP_K = 0.08;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const ax = a.x + HALF, ay = a.y + HALF;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const bx = b.x + HALF, by = b.y + HALF;
      let dx = bx - ax, dy = by - ay;
      const d2 = dx*dx + dy*dy;
      if (d2 < MIN2) {
        const d  = Math.sqrt(d2) || 0.0001;
        const nx = dx / d, ny = dy / d;
        const overlap = (MIN - d) / MIN;
        const f = SEP_K * overlap;
        a.ax -= nx * f; a.ay -= ny * f;
        b.ax += nx * f; b.ay += ny * f;
      }
    }
  }

  // 5) hız/konum entegrasyonu
  nodes.forEach(n => {
    n.vx = (n.vx + n.ax) * DAMPING;
    n.vy = (n.vy + n.ay) * DAMPING;
    const sp = Math.hypot(n.vx, n.vy);
    if (sp > MAX_SPEED) {
      n.vx = n.vx / sp * MAX_SPEED; 
      n.vy = n.vy / sp * MAX_SPEED;
    }
    n.x += n.vx; 
    n.y += n.vy;
  });

  // 6) projection
  const PROJ = 0.55;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const ax = a.x + HALF, ay = a.y + HALF;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const bx = b.x + HALF, by = b.y + HALF;
      let dx = bx - ax, dy = by - ay;
      let d = Math.hypot(dx, dy) || 0.0001;
      if (d < MIN) {
        const nx = dx / d, ny = dy / d;
        const push = (MIN - d) * 0.5 * PROJ;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }

  // 7) sınırda kal + DOM'a yaz
  nodes.forEach(n => {
    if (n.x < 0) n.x = 0;
    if (n.y < 0) n.y = 0;
    if (n.x + SIZE > w) n.x = w - SIZE;
    if (n.y + SIZE > h) n.y = h - SIZE;
    n.el.style.left = n.x + 'px';
    n.el.style.top  = n.y + 'px';
  });

  // 8) etiketler
  updateLabelsToCentroids();

  requestAnimationFrame(step);
}



/* =============================
   Kart etkileşimleri / hash / preload
============================= */
function allCards(){ return [...document.querySelectorAll(".album")]; }
function currentIndexFromHash(){
  const m = location.hash.match(/^#\/([^/]+)\/([^/]+)\/?$/); if(!m) return -1;
  const [_,a,t]=m; return allCards().findIndex(el => slugify(el.dataset.artist)===a && slugify(el.dataset.title)===t);
}
async function preloadAllAlbums(albums) {
  for (const a of albums) {
    let url = a.cover || "";

    // Eğer JSON'da cover yoksa Last.fm'den çek
    if (!url) {
      const info = await fetchAlbumInfo(a.artist, a.title);
      if (info?.image) {
        url =
          info.image.find(i => i.size === "mega" && i["#text"])?.["#text"] ||
          info.image.find(i => i.size === "extralarge" && i["#text"])?.["#text"] ||
          info.image[info.image.length - 1]?.["#text"] || "";
        url = upscaleImage(url);
      }
    } else {
      url = upscaleImage(url);
    }

    // Görseli cache'e al
    if (url) {
      const im = cacheImage(url);
      try { 
        await im.decode(); // preload tamamlanana kadar bekle
      } catch {
        // decode hata verirse önemsiz, cache yine de saklanır
      }
    }
  }
}


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

/* =============================
   Header arrow + hero line
============================= */
function ensureScrollArrow(){
  const header = document.getElementById("siteHeader");
  if(!header) return;

  let arrow = header.querySelector(".scroll-down");
  let line  = header.querySelector(".hero-line");

  if(!arrow){
    arrow = document.createElement("div");
    arrow.className = "scroll-down";
    arrow.innerHTML = `<span class="scroll-down-inner"><svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v14m0 0l-6-6m6 6l6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
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

  arrow.addEventListener("click",()=>{
    const target = document.getElementById("stage") || document.querySelector("main") || document.body;
    target.scrollIntoView({behavior:"smooth", block:"start"});
  });

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

let topZ = 10; // başlangıç z-index

function enableAlbumStacking() {
  document.querySelectorAll('.album').forEach(album => {
    album.addEventListener('mouseenter', () => {
      topZ++;
      album.style.zIndex = topZ; // sadece z-index kalıcı olacak
    });
  });
}


/* =============================
   Setup: kart açma (click/enter)
============================= */
function setupAlbums() {
  const albums = stage.querySelectorAll(".album");

  // Mobil eşiği: 640px ve altı
  const IS_MOBILE = window.matchMedia("(max-width: 640px)").matches;

  // CSS değişkeninden kapak boyutu (fallback 160)
  const rootStyles = getComputedStyle(document.documentElement);
  const SIZE = parseFloat(rootStyles.getPropertyValue("--size")) || 160;

  if (IS_MOBILE) {
    // === MOBİL: tek sütun, yukarıdan aşağı; zigzag YOK ===
    const gapY = Math.round(SIZE * 1.35); // düşey aralık
    // sahne genişliğine göre kapağı yatayda ortaya al
    const x = Math.max(8, Math.round((stage.clientWidth - SIZE) / 2));

    albums.forEach((album, i) => {
      album.style.left = x + "px";
      album.style.top  = (i * gapY) + "px";
    });
  } else {
    // === MASAÜSTÜ: mevcut zigzag davranışın ===
    const gridSize = 360; // senin ayarın
    const cols = 2;

    albums.forEach((album, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);

      // Zigzag için satıra göre offset
      const xOffset = (row % 2 === 0) ? 0 : gridSize * 3;
      const randomOffset = Math.random() * 40 - 20;

      album.style.left = (col * gridSize + xOffset + randomOffset) + "px";
      album.style.top  = (row * gridSize + randomOffset) + "px";
    });
  }

  // --- Tıklama ile panel açma ---
  stage.addEventListener("click", async (e) => {
    const card = e.target.closest(".album");
    if (!card) return;
    const artist = card.dataset.artist, title = card.dataset.title, desc = card.dataset.desc || "";
    const overrides = { 
      spotify: card.dataset.spotify||"", 
      ytmusic: card.dataset.ytmusic||card.dataset.yt||"", 
      yt: card.dataset.yt||"", 
      apple: card.dataset.apple||"" 
    };
    const info = await fetchAlbumInfo(artist, title);
    if (info) {
      history.pushState(null, "", albumHash(artist, title));
      openPanel(info, { desc, links: overrides, year: (card.dataset.year||"") });
    }
  });

  // --- Enter ile panel açma ---
  stage.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const card = e.target.closest(".album"); 
    if (!card) return;
    const artist = card.dataset.artist, title = card.dataset.title, desc = card.dataset.desc || "";
    const overrides = { 
      spotify: card.dataset.spotify||"", 
      ytmusic: card.dataset.ytmusic||card.dataset.yt||"", 
      yt: card.dataset.yt||"", 
      apple: card.dataset.apple||"" 
    };
    const info = await fetchAlbumInfo(artist, title);
    if (info) {
      history.pushState(null, "", albumHash(artist, title));
      openPanel(info, { desc, links: overrides, year: (card.dataset.year||"") });
    }
  });

  // stacking davranışı
  enableAlbumStacking();
}


/* =============================
   Custom Cursor (masaüstü)
============================= */
(function(){
  const isDesktopPointer = window.matchMedia('(pointer: fine)').matches;
  if (!isDesktopPointer) return;

  const cursor = document.getElementById('cursor');
  if (!cursor) return;

  document.body.classList.add('cursor-hide');

  let x = window.innerWidth / 2, y = window.innerHeight / 2;
  let cx = x, cy = y;
  const CURSOR_EASE = 0.25;
  const OFFSET_X = 0, OFFSET_Y = 0;

  const HOVER_SELECTOR = 'a, button, .album, [role="button"], .play-button';

  function onMouseMove(e){ x = e.clientX; y = e.clientY; cursor.classList.add('is-visible'); cursor.classList.remove('is-hidden'); }
  function onMouseEnter(){ cursor.classList.add('is-visible'); cursor.classList.remove('is-hidden'); }
  function onMouseLeave(){ cursor.classList.remove('is-visible'); cursor.classList.add('is-hidden'); }
  function onMouseDown(){ cursor.classList.add('is-down'); }
  function onMouseUp(){ cursor.classList.remove('is-down'); }

  function toggleForTextTarget(e){
    const el = e.target;
    const isText = el.matches?.('input, textarea, select, [contenteditable="true"]') || el.closest?.('[contenteditable="true"]');
    if (isText) { cursor.classList.add('is-hidden'); document.body.classList.remove('cursor-hide'); }
    else        { cursor.classList.remove('is-hidden'); document.body.classList.add('cursor-hide'); }
  }

  // aim state (kart hedefleme) — loop DIŞINDA
  let aimedCard = null;
  function enterAim(card){ card.classList.add('is-aim'); cursor.classList.add('is-hover'); aimedCard = card; }
  function leaveAim(){ aimedCard?.classList.remove('is-aim'); cursor.classList.remove('is-hover'); aimedCard = null; }
  document.addEventListener('mouseover', (e)=>{
    const card = e.target.closest?.('.album');
    if (card && card !== aimedCard) enterAim(card);
    else if (!card && aimedCard) leaveAim();
  }, { passive: true });
  document.addEventListener('mouseout', (e)=>{
    const toCard = e.relatedTarget?.closest?.('.album');
    if (!toCard && aimedCard) leaveAim();
  }, { passive: true });
  window.addEventListener('blur', leaveAim);

  function loop(){
    cx += (x - cx) * CURSOR_EASE;
    cy += (y - cy) * CURSOR_EASE;
    cursor.style.transform = `translate3d(${cx + OFFSET_X}px, ${cy + OFFSET_Y}px, 0) translate(-50%,-50%)`;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('mouseenter', onMouseEnter, { passive: true });
  window.addEventListener('mouseleave', onMouseLeave, { passive: true });
  window.addEventListener('mousedown', onMouseDown, { passive: true });
  window.addEventListener('mouseup', onMouseUp, { passive: true });
  document.addEventListener('mouseover', onOver, { passive: true });
  document.addEventListener('mouseout', onOut, { passive: true });
  document.addEventListener('pointerdown', toggleForTextTarget, { passive: true });
  document.addEventListener('pointermove', toggleForTextTarget, { passive: true });

  function onOver(e){ if (e.target.closest(HOVER_SELECTOR)) cursor.classList.add('is-hover'); }
  function onOut(e){ if (e.target.closest(HOVER_SELECTOR)) cursor.classList.remove('is-hover'); }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cursor.style.transition = 'none';
  }
})();

/* =============================
   Boot
============================= */
/* Renk çıkarma (ColorThief) */
function applyPanelBackground(img, panelEl) {
  try {
    const ct = new ColorThief();
    let palette = [];
    try { palette = ct.getPalette(img, 6) || []; } catch (_) {}
    let base = null;
    try { base = ct.getColor(img); } catch (_) { base = null; }

    const c1 = palette[0] || base || [34,34,34];
    const c2 = palette[1] || c1;
    const c3 = palette[2] || c2;

    // Luminans kontrolü ile parlaklığı biraz azalt
    const dim = (c) => {
      const [r,g,b] = c;
      const L = 0.2126*r + 0.7152*g + 0.0722*b;
      const k = L > 180 ? 0.75 : 0.9;
      return [Math.round(r*k), Math.round(g*k), Math.round(b*k)];
    };

    const d1 = dim(c1), d2 = dim(c2), d3 = dim(c3);

    // CSS değişkenini ayarla (3 renk + çapraz açı)
    panelEl.style.setProperty(
      "--panel-gradient",
      `linear-gradient(135deg,
        rgba(${d1[0]},${d1[1]},${d1[2]},0.95) 0%,
        rgba(${d2[0]},${d2[1]},${d2[2]},0.85) 60%,
        rgba(${d3[0]},${d3[1]},${d3[2]},0.75) 100%)`
    );
  } catch (e) {
    console.warn("Renk çıkarılamadı:", e);
  }
}

/* =============================
   Setup: kart açma (click/enter)
============================= */
function setupAlbums() {
  const albums = stage.querySelectorAll(".album");
  const gridSize = 360; // senin ayarın
  const cols = 2;

  albums.forEach((album, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    // Zigzag için satıra göre offset
    const xOffset = (row % 2 === 0) ? 0 : gridSize * 3;
    const randomOffset = Math.random() * 40 - 20;

    album.style.left = (col * gridSize + xOffset + randomOffset) + "px";
    album.style.top  = (row * gridSize + randomOffset) + "px";
  });

  // --- Tıklama ile panel açma ---
  stage.addEventListener("click", async (e) => {
    const card = e.target.closest(".album");
    if (!card) return;
    const artist = card.dataset.artist, title = card.dataset.title, desc = card.dataset.desc || "";
    const overrides = { 
      spotify: card.dataset.spotify||"", 
      ytmusic: card.dataset.ytmusic||card.dataset.yt||"", 
      yt: card.dataset.yt||"", 
      apple: card.dataset.apple||"" 
    };
    const info = await fetchAlbumInfo(artist, title);
    if (info) {
      history.pushState(null, "", albumHash(artist, title));
      openPanel(info, { desc, links: overrides, year: (card.dataset.year||"") });
    }
  });

  // --- Enter ile panel açma ---
  stage.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const card = e.target.closest(".album"); 
    if (!card) return;
    const artist = card.dataset.artist, title = card.dataset.title, desc = card.dataset.desc || "";
    const overrides = { 
      spotify: card.dataset.spotify||"", 
      ytmusic: card.dataset.ytmusic||card.dataset.yt||"", 
      yt: card.dataset.yt||"", 
      apple: card.dataset.apple||"" 
    };
    const info = await fetchAlbumInfo(artist, title);
    if (info) {
      history.pushState(null, "", albumHash(artist, title));
      openPanel(info, { desc, links: overrides, year: (card.dataset.year||"") });
    }
  });

  // stacking davranışı
  enableAlbumStacking();
}

/* =============================
   Boot
============================= */
async function init() {
  computeParams();
  ensureScrollArrow();

  stage        = document.getElementById("stage");
  panel        = document.getElementById("panel");
  panelTitle   = document.getElementById("panelTitle");
  panelContent = document.getElementById("panelContent");
  panelCloseBtn= document.getElementById("panelClose");

  if (panelCloseBtn) {
    panelCloseBtn.addEventListener("click", closePanel);
  }

  // panel boşluğa tıkla → kapat
  panel?.addEventListener("click", (e) => { if (e.target === panel) closePanel(); });

  // sahne dışına tıkla → panel kapat
  document.addEventListener("click", (e) => {
    if (!panel?.classList.contains("open")) return;
    const isAlbum = e.target.closest?.(".album");
    const isScroll= e.target.closest?.(".scroll-down, .hero-line");
    const isPanel = e.target.closest?.("#panel");
    if (!isAlbum && !isScroll && !isPanel) closePanel();
  });

  // mouse alanı
  stage.addEventListener("mousemove", e => {
    const rect = stage.getBoundingClientRect();
    mouse.x = e.clientX - rect.left + window.scrollX;
    mouse.y = e.clientY - rect.top  + window.scrollY;
  }, { passive: true });
  stage.addEventListener("mouseleave", () => { mouse.x = null; mouse.y = null; }, { passive: true });

  // albums.json yükle
  const res        = await fetch("albums.json");
  const albumsData = await res.json();

  const progressBar = document.getElementById("progress-bar");
  const loaderStage = document.getElementById("loader-stage");
  const total = albumsData.length;
  let loaded = 0;

  for (const d of albumsData) {
    // Last.fm info (cache'li)
    const info = await fetchAlbumInfo(d.artist, d.title);

    // Görsel URL bul
    let imgUrl = d.cover || "";
    if (!imgUrl && info?.image) {
      const c = info.image.filter(i => i["#text"]);
      if (c.length > 0) imgUrl = c[c.length - 1]["#text"];
    }
    if (!imgUrl) {
      imgUrl = "https://via.placeholder.com/600x600?text=" + encodeURIComponent(d.title);
    }

    // Kart görseli için blob/fallback URL
    const cardSrc = await getCoverSrc(imgUrl);

    // Albüm kartını oluştur
    const el = document.createElement("div");
    el.className = "album";
    el.dataset.artist = d.artist;
    el.dataset.title  = d.title;
    el.dataset.desc   = d.desc || "";
    if (d.year)    el.dataset.year    = d.year;
    if (d.spotify) el.dataset.spotify = d.spotify;
    if (d.ytmusic) el.dataset.ytmusic = d.ytmusic;
    if (d.yt)      el.dataset.yt      = d.yt;
    if (d.apple)   el.dataset.apple   = d.apple;
    el.setAttribute("role","button");
    el.setAttribute("tabindex","0");
    el.setAttribute("aria-label", `${d.artist} — ${d.title} albümünü aç`);
    el.innerHTML = `
      <img src="${cardSrc}" alt="${d.title}">
      <div class="overlay"><strong>${d.title}</strong><div class="tag">${d.artist}</div></div>
    `;

    (loaderStage || stage).appendChild(el);

    const img = el.querySelector("img");
    img.onload = img.onerror = () => {
      loaded++;
      if (progressBar) progressBar.style.width = ((loaded / total) * 100) + "%";
      el.classList.add("show");

      if (loaded === total) {
        setTimeout(() => {
          if (loaderStage) {
            // loader'dan stage'e taşı
            const loaderAlbums = Array.from(loaderStage.children);
            const stageRect = stage.getBoundingClientRect();
            loaderAlbums.forEach(a => {
              const rect = a.getBoundingClientRect();
              const x = rect.left - stageRect.left;
              const y = rect.top  - stageRect.top;
              stage.appendChild(a);
              a.style.position = "absolute";
              a.style.left = x + "px";
              a.style.top  = y + "px";
              a.classList.add("to-stage");
            });
            document.getElementById("loader")?.style?.setProperty("display","none");
          } else {
            // loader yoksa rastgele yerleştir
            const x = Math.random() * Math.max(1, (W() - SIZE));
            const y = Math.random() * Math.max(1, (H() - SIZE));
            el.style.position = "absolute";
            el.style.left = x + "px";
            el.style.top  = y + "px";
          }

          setupAlbums();      // grid yerleşimi (zigzag)
          startPhysics();     // fizik motoru
          openFromHash();     // deep-link
          // preloadAllAlbums(albumsData); // Artık gerekli değil; getCoverSrc zaten blob cache yapıyor
        }, 400);
      }
    };
  }

  window.addEventListener("hashchange", openFromHash, { passive: true });
  window.addEventListener("resize", computeParams, { passive: true });
}


window.addEventListener('DOMContentLoaded', init);
