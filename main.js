/* =============================
   Album Float — No-API Build
   (Local JSON + local covers/* only)
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
let isFloating = true;
let physicsRunning = true;
let lastBottom = 0; // gridde en alttaki kartın kaydı

/* === Yardımcılar === */
function slugify(s){ return String(s||"").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }
function albumHash(artist,title){ return `#/${slugify(artist)}/${slugify(title)}`; }

function computeParams(){
  SIZE = window.innerWidth / 6;

  // Küçük ekranlarda albüm boyutunu fazla küçültme
  if (window.innerWidth < 600) {
    SIZE = window.innerWidth / 4.5;  
  }

  HALF = SIZE / 2;
  document.documentElement.style.setProperty('--size', SIZE + 'px');

  // Normalde 3.2x ve 2.0x, küçük ekranda katsayıları büyüt
  if (window.innerWidth < 600) {
    SEPARATION_DIST = SIZE * 4.5;
    SPRING_REST     = SIZE * 3.2;
  } else {
    SEPARATION_DIST = SIZE * 3.2;
    SPRING_REST     = SIZE * 2.0;
  }

  EDGE_BAND      = 24 * (SIZE/104);
  MOUSE_RADIUS   = 330 * (SIZE/104);
  MOUSE_DEADZONE = 46  * (SIZE/104);
  MOUSE_FORCE    = 1.0;
}

const W = () => stage?.clientWidth  || window.innerWidth;
const H = () => stage?.clientHeight || window.innerHeight;

/* === Water field (su alanı) === */
function waterField(x,y,t){
  return {
    ax: WATER_STRENGTH * Math.sin((y + t*60*WATER_SPEED_X)/WATER_SCALE),
    ay: WATER_STRENGTH * Math.cos((x + t*60*WATER_SPEED_Y)/WATER_SCALE)
  };
}

/* =============================
   Panel open/close (yalnızca JSON verisiyle)
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
  panel.style.transform = "";
  panel.style.transition = "";
  document.getElementById("panelOverlay")?.classList.remove("open");
  document.body.classList.remove('no-scroll');
  if(location.hash) history.replaceState(null,"",location.pathname+location.search+"#/");  
  try{ if (window.innerWidth < 768) { __lastFocused?.focus?.({ preventScroll: true }); } }catch{}
}

/* === Renk çıkarma (isteğe bağlı; ColorThief varsa kullanılır) === */
function applyPanelBackground(img, panelEl) {
  try {
    if (typeof ColorThief === "undefined") return;
    const ct = new ColorThief();
    let palette = [];
    try { palette = ct.getPalette(img, 6) || []; } catch (_) {}
    let base = null;
    try { base = ct.getColor(img); } catch (_) { base = null; }

    const c1 = palette[0] || base || [34,34,34];
    const c2 = palette[1] || c1;
    const c3 = palette[2] || c2;

    const dim = (c) => {
      const [r,g,b] = c;
      const L = 0.2126*r + 0.7152*g + 0.0722*b;
      const k = L > 180 ? 0.75 : 0.9;
      return [Math.round(r*k), Math.round(g*k), Math.round(b*k)];
    };

    const d1 = dim(c1), d2 = dim(c2), d3 = dim(c3);
    panelEl.style.setProperty(
      "--panel-gradient",
      `linear-gradient(135deg,
        rgba(${d1[0]},${d1[1]},${d1[2]},0.95) 0%,
        rgba(${d2[0]},${d2[1]},${d2[2]},0.85) 60%,
        rgba(${d3[0]},${d3[1]},${d3[2]},0.75) 100%)`
    );
  } catch (e) {
    // sessiz geç
  }
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

  // Hover state (link, buton, albüm, play-button)
  function onOver(e){ if (e.target.closest(HOVER_SELECTOR)) cursor.classList.add('is-hover'); }
  function onOut(e){ if (e.target.closest(HOVER_SELECTOR)) cursor.classList.remove('is-hover'); }

  function loop(){
    cx += (x - cx) * CURSOR_EASE;
    cy += (y - cy) * CURSOR_EASE;
    cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%,-50%)`;
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

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cursor.style.transition = 'none';
  }
})();

/* === Görsel cache (opsiyonel) === */
const imageCache = new Map();
function cacheImage(url) {
  if (!url) return null;
  if (imageCache.has(url)) return imageCache.get(url);
  const im = new Image();
  im.src = url;
  imageCache.set(url, im);
  return im;
}

/* =============================
   JSON verisi ile panel açma
============================= */
function openPanelFromData(albumObj, cardEl){
  __lastFocused = document.activeElement;

  const panelEl   = document.getElementById("panel");
  const overlayEl = document.getElementById("panelOverlay");
  if (!albumObj || !panelEl || !panelContent || !panelTitle) return;

  // başlık + yıl
  panelTitle.textContent = `${albumObj.artist} — ${albumObj.title}`;
  const yearNode = ensureHeaderYearNode();
  if (yearNode) yearNode.textContent = albumObj.year ? String(albumObj.year) : "";

  // kapak URL
  const imgUrl = albumObj.cover || "";
  // platform linkleri (opsiyonel—yoksa arama sayfasına gider)
  const q = encodeURIComponent(`${albumObj.artist} ${albumObj.title}`);
  const spotifyUrl = albumObj.spotify || `https://open.spotify.com/search/${q}`;
  const ytmusicUrl = albumObj.ytmusic || albumObj.yt || `https://music.youtube.com/search?q=${q}`;
  const appleUrl   = albumObj.apple || `https://music.apple.com/search?term=${q}`;

  // Panelde tek <img id="panelCover"> kullan
  let coverImg = panelContent.querySelector("#panelCover");
  if (!coverImg) {
    coverImg = document.createElement("img");
    coverImg.id = "panelCover";
    coverImg.className = "album-cover";
    panelContent.prepend(coverImg);
  }

  // Skeleton
  coverImg.style.display = "none";
  let skeleton = panelContent.querySelector(".panel-skeleton");
  if (!skeleton) {
    skeleton = document.createElement("div");
    skeleton.className = "panel-skeleton";
    coverImg.insertAdjacentElement("beforebegin", skeleton);
  }

  const tracksHtml = Array.isArray(albumObj.tracks) && albumObj.tracks.length
    ? `<h4>Parçalar</h4><ol>${albumObj.tracks.map(t => `<li>${t}</li>`).join("")}</ol>`
    : "";

  const extraHtml = `
    <div class="play-buttons">
      <a href="${spotifyUrl}" target="_blank" class="play-button spotify" aria-label="Spotify"></a>
      <a href="${ytmusicUrl}" target="_blank" class="play-button yt" aria-label="YouTube Music"></a>
      <a href="${appleUrl}"   target="_blank" class="play-button apple" aria-label="Apple Music"></a>
    </div>
    ${albumObj.desc ? `<h4 style="margin-top:16px;">Açıklama</h4><p>${albumObj.desc}</p>` : ""}
    ${tracksHtml}
  `;
  const siblings = [...panelContent.children].filter(el => el.id !== "panelCover" && !el.classList.contains("panel-skeleton"));
  siblings.forEach(el => el.remove());
  coverImg.insertAdjacentHTML("afterend", extraHtml);

  coverImg.src = imgUrl;
  coverImg.alt = albumObj.title;

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

  // Paneli aç
  panelEl.classList.add("open");
  overlayEl?.classList.add("open");
  if (window.innerWidth <= 640) document.body.classList.add("no-scroll");
}

/* Stage yardımcıları */
function computeStageHeight() {
  const albums = document.querySelectorAll(".album");
  let maxBottom = 0;
  albums.forEach(el => {
    const bottom = el.offsetTop + el.offsetHeight;
    if (bottom > maxBottom) maxBottom = bottom;
  });
  return maxBottom + 120;
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
  const SAFE_TOP = EDGE_BAND - SIZE;
  const startY  = SAFE_TOP;
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
   Fizik döngü
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
  });

  renderLabels();
  requestAnimationFrame(step);
}

function step(){
  if (!physicsRunning) return;
  const w = W(), h = H(), t = performance.now() / 1000;

  // 1) ivmeleri sıfırla + su alanı
  nodes.forEach(n => {
    n.ax = 0; n.ay = 0;
    const f = waterField(n.x, n.y, t);
    n.ax += f.ax; n.ay += f.ay;
  });

  // 2) grup ve genel merkez çekimi
  nodes.forEach(n => {
    const gc = centers.get(n.artist);
    if (gc) {
      n.ax += (gc.x - (n.x + HALF)) * GROUP_K;
      n.ay += (gc.y - (n.y + HALF)) * GROUP_K;
    }
    const cx = w / 2, cy = Math.max(window.innerHeight, h) / 2;
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
  const MIN   = SIZE * 1.2;
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

  // 9) sayfa boyutu
  stage.style.height = computeStageHeight() + "px";
  
  requestAnimationFrame(step);
}

/* =============================
   Kart etkileşimleri / hash
============================= */
function allCards(){ return [...document.querySelectorAll(".album")]; }
function currentIndexFromHash(){
  const m = location.hash.match(/^#\/([^/]+)\/([^/]+)\/?$/); if(!m) return -1;
  const [_,a,t]=m; return allCards().findIndex(el => slugify(el.dataset.artist)===a && slugify(el.dataset.title)===t);
}

/* =============================
   Yerleşim ve tıklama davranışı
============================= */
function enableAlbumStacking() {
  let topZ = 10;
  document.querySelectorAll('.album').forEach(album => {
    album.addEventListener('mouseenter', () => {
      topZ++;
      album.style.zIndex = topZ;
    });
  });
}

function setupAlbums(albumIndex) {
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
  stage.addEventListener("click", (e) => {
    const card = e.target.closest(".album");
    if (!card) return;
    const key = albumHash(card.dataset.artist, card.dataset.title);
    const data = albumIndex.get(key);
    if (data) {
      history.pushState(null, "", key);
      openPanelFromData(data, card);
    }
  });

  // --- Enter ile panel açma ---
  stage.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const card = e.target.closest(".album");
    if (!card) return;
    const key = albumHash(card.dataset.artist, card.dataset.title);
    const data = albumIndex.get(key);
    if (data) {
      history.pushState(null, "", key);
      openPanelFromData(data, card);
    }
  });

  enableAlbumStacking();
}

/* =============================
   Scroll arrow + hero line
============================= */
function ensureScrollArrow(threshold = 0.25){  
  const header = document.getElementById("siteHeader");
  if (!header) return;

  let arrow = header.querySelector(".scroll-down");
  let line  = header.querySelector(".hero-line");

  if (!arrow) {
    arrow = document.createElement("div");
    arrow.className = "scroll-down";
    arrow.innerHTML = `<svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v14m0 0l-6-6m6 6l6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    header.appendChild(arrow);
  }
  if (!line) {
    line = document.createElement("div");
    line.className = "hero-line";
    header.appendChild(line);
  }

  arrow.addEventListener("click", () => {
    (document.getElementById("stage") || document.body)
      .scrollIntoView({ behavior: "smooth", block: "start" });
  });

  let lastActive = null;
  function tick(){
    const r  = header.getBoundingClientRect();
    const hh = Math.max(1, r.height);
    const topGone = Math.max(0, -r.top);
    const max = Math.min(hh * 0.6, 500);
    const sc  = Math.min(topGone, max);
    const t   = max ? (sc / max) : 0;

    const isActive = t > threshold;

    if (isActive !== lastActive) {
      // Çizgi
      line.classList.toggle("active", isActive);
      line.style.opacity = isActive ? "1" : "0";
      // Ok
      arrow.style.opacity = isActive ? "0" : "1";
      arrow.style.pointerEvents = isActive ? "none" : "auto";
      lastActive = isActive;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* =============================
   Hash'ten açma
============================= */
function openFromHash(albumIndex){
  const m = location.hash.match(/^#\/([^/]+)\/([^/]+)\/?$/);
  if(!m){ if(panel?.classList.contains("open")) closePanel(); return; }
  const [,a,t] = m;
  const key = `#/${a}/${t}`;
  const data = albumIndex.get(key);
  if(!data) return;
  const card = allCards().find(el => slugify(el.dataset.artist)===a && slugify(el.dataset.title)===t);
  openPanelFromData(data, card || null);
}

/* =============================
   Boot
============================= */
async function init() {
  computeParams();
  ensureScrollArrow(0.60);

  stage        = document.getElementById("stage");
  panel        = document.getElementById("panel");
  panelTitle   = document.getElementById("panelTitle");
  panelContent = document.getElementById("panelContent");
  panelCloseBtn= document.getElementById("panelClose");

  if (panelCloseBtn) panelCloseBtn.addEventListener("click", closePanel);
  panel?.addEventListener("click", (e) => { if (e.target === panel) closePanel(); });
  document.addEventListener("click", (e) => {
    if (!panel?.classList.contains("open")) return;
    const isAlbum = e.target.closest?.(".album");
    const isScroll= e.target.closest?.(".scroll-down, .hero-line");
    const isPanel = e.target.closest?.("#panel");
    if (!isAlbum && !isScroll && !isPanel) closePanel();
  });

  // === Mobilde paneli sürükleyerek kapatma (iOS-vari) ===
if (window.matchMedia("(max-width: 767px)").matches) {
  let startY = 0, currentY = 0, dragging = false, startedAtTop = false;

  const OPEN_Y = 0;
  const panelContent = document.getElementById("panelContent");
  const panelHeader  = document.querySelector("#panel header");
  const dragHandle   = document.querySelector(".drag-handle");

  function onStart(e){
    const target = e.target;

    // Eğer kullanıcı drag-handle veya header’dan başlarsa → her zaman izin ver
    const isHeaderDrag = panelHeader.contains(target) || dragHandle?.contains(target);

    // Yoksa içerik en üstte olmalı
    startedAtTop = isHeaderDrag || (panelContent.scrollTop <= 0);
    if (!startedAtTop) return;

    dragging = true;
    startY = e.touches[0].clientY;
    currentY = startY;

    panel.style.transition = "none";
  }

  function onMove(e){
    if (!dragging || !startedAtTop) return;
    currentY = e.touches[0].clientY;
    let deltaY = currentY - startY;

    if (deltaY < 0) deltaY = 0;
    panel.style.transform = `translateY(${deltaY}px)`;
  }

  function finishDrag(shouldClose){
    panel.style.transition = "transform 0.25s ease";

    if (shouldClose) {
      panel.style.transform = "translateY(100%)";
      const done = () => {
        panel.removeEventListener("transitionend", done);
        closePanel();
      };
      panel.addEventListener("transitionend", done, { once: true });
    } else {
      panel.style.transform = `translateY(${OPEN_Y}px)`;
      const back = () => {
        panel.removeEventListener("transitionend", back);
        panel.style.transform = "";
        panel.style.transition = "";
      };
      panel.addEventListener("transitionend", back, { once: true });
    }
  }

  function onEnd(){
    if (!dragging || !startedAtTop) return;
    dragging = false;

    const deltaY = Math.max(0, currentY - startY);
    const h = panel.getBoundingClientRect().height;
    const threshold = Math.min(160, h * 0.22);

    finishDrag(deltaY > threshold);
  }

  panel.addEventListener("touchstart", onStart, { passive: true });
  panel.addEventListener("touchmove",  onMove,  { passive: true });
  panel.addEventListener("touchend",   onEnd,   { passive: true });
  panel.addEventListener("touchcancel",onEnd,   { passive: true });
}


  stage.addEventListener("mousemove", e => {
    const rect = stage.getBoundingClientRect();
    mouse.x = e.clientX - rect.left + window.scrollX;
    mouse.y = e.clientY - rect.top  + window.scrollY;
  }, { passive: true });
  stage.addEventListener("mouseleave", () => { mouse.x = null; mouse.y = null; }, { passive: true });

  // === albums.json yükle (yerel dosya) ===
  const res = await fetch("albums.json");
  const albumsData = await res.json();

  // index: #/artist/title -> albumObj
  const albumIndex = new Map();

  const progressBar = document.getElementById("progress-bar");
  const loaderStage = document.getElementById("loader-stage");
  const total = albumsData.length;
  let loaded = 0;

  for (const d of albumsData) {
    const cover = d.cover;
    const im = cacheImage(cover);
    try { await im.decode?.(); } catch {}

    // Albüm kartı
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
      <img src="${cover}" alt="${d.title}">
      <div class="overlay"><strong>${d.title}</strong><div class="tag">${d.artist}</div></div>
    `;

    albumIndex.set(albumHash(d.artist, d.title), { ...d, cover });

    (loaderStage || stage).appendChild(el);

    const img = el.querySelector("img");
    img.onload = img.onerror = () => {
      loaded++;
      if (progressBar) progressBar.style.width = ((loaded / total) * 100) + "%";
      el.classList.add("show");

      if (loaded === total) {
        setTimeout(() => {
          if (loaderStage) {
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
            const x = Math.random() * Math.max(1, (W() - SIZE));
            const y = Math.random() * Math.max(1, (H() - SIZE));
            el.style.position = "absolute";
            el.style.left = x + "px";
            el.style.top  = y + "px";
          }

          setupAlbums(albumIndex); // grid yerleşimi + tıklama
          startPhysics();          // fizik motoru
          openFromHash(albumIndex);// deep-link
        }, 400);
      }
    };
  }

  // Toggle layout
  function recordGridBottom() {
    const albums = document.querySelectorAll(".album");
    let maxBottom = 0;
    albums.forEach(el => {
      const bottom = el.offsetTop + el.offsetHeight;
      if (bottom > maxBottom) maxBottom = bottom;
    });
    lastBottom = maxBottom + 120;
  }
  function stopPhysics(){ physicsRunning = false; }
  function startPhysicsLoop(){ physicsRunning = true; requestAnimationFrame(step); }

  document.getElementById("toggleLayout")?.addEventListener("click", ()=>{
    if (isFloating) {
      // FLOAT → GRID
      recordGridBottom();
      stage.classList.add("grid-mode");
      stopPhysics();
      document.querySelectorAll(".album").forEach((el, i)=>{
        el.style.left = "";
        el.style.top  = "";
        el.style.transform = "";
        el.style.animationDelay = `${i * 50}ms`;
      });
      stage.style.removeProperty("height");
    } else {
      // GRID → FLOAT
      stage.classList.remove("grid-mode");
      document.querySelectorAll(".album").forEach(el=>{ el.style.animationDelay = ""; });
      if (lastBottom > 0) stage.style.height = lastBottom + "px";
      startPhysicsLoop();
    }
    isFloating = !isFloating;
  });

  window.addEventListener("hashchange", ()=>openFromHash(albumIndex), { passive: true });
  window.addEventListener("resize", computeParams, { passive: true });
}

window.addEventListener('DOMContentLoaded', init);
