/* =============================
   Album Grid — No-API Build
   (Local JSON + local covers/* only)
   → Float fiziği yok, sadece grid + mobilde sürükleyerek kapama.
============================= */
"use strict";

/* === Global DOM refs === */
let stage, panel, panelTitle, panelContent, panelCloseBtn;

/* === Yardımcılar === */
function slugify(s){
  return String(s||"").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}
function albumHash(artist,title){ return `#/${slugify(artist)}/${slugify(title)}`; }

/* =============================
   Panel open/close
============================= */
let __lastFocused = null;

function ensureHeaderYearNode(){
  const headerEl = panel?.querySelector("header");
  if(!headerEl) return null;

  // Sol sütun oluştur
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
  // Başlığı sola taşı
  if(panelTitle && panelTitle.parentElement !== left){
    left.insertBefore(panelTitle, left.firstChild || null);
  }
  // Yıl satırı
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

/* === Kapaktan renk çıkarma (ColorThief varsa) === */
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
  } catch (_) {}
}

/* =============================
   Custom Cursor (masaüstü) — opsiyonel
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
   Paneli JSON verisiyle aç
============================= */
function openPanelFromData(albumObj, cardEl){
  __lastFocused = document.activeElement;

  const panelEl   = document.getElementById("panel");
  const overlayEl = document.getElementById("panelOverlay");
  if (!albumObj || !panelEl || !panelContent || !panelTitle) return;

  // Başlık + yıl
  panelTitle.textContent = `${albumObj.artist} — ${albumObj.title}`;
  const yearNode = ensureHeaderYearNode();
  if (yearNode) yearNode.textContent = albumObj.year ? String(albumObj.year) : "";

  // Kapak & platform linkleri
  const imgUrl = albumObj.cover || "";
  const q = encodeURIComponent(`${albumObj.artist} ${albumObj.title}`);
  const spotifyUrl = albumObj.spotify || `https://open.spotify.com/search/${q}`;
  const ytmusicUrl = albumObj.ytmusic || albumObj.yt || `https://music.youtube.com/search?q=${q}`;
  const appleUrl   = albumObj.apple || `https://music.apple.com/search?term=${q}`;

  // Tek <img id="panelCover">
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
      <a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" class="play-button spotify" aria-label="Spotify"></a>
      <a href="${ytmusicUrl}" target="_blank" rel="noopener noreferrer" class="play-button yt" aria-label="YouTube Music"></a>
      <a href="${appleUrl}"   target="_blank" rel="noopener noreferrer" class="play-button apple" aria-label="Apple Music"></a>
      <button class="play-button share" id="panelShare" title="Paylaş"></button>
    </div>
    ${albumObj.desc ? `<h4 style="margin-top:16px;">Açıklama</h4><p>${albumObj.desc}</p>` : ""}
    ${tracksHtml}
  `;

  // Eski içerikleri temizle ve yeni içeriği yerleştir
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

  // === PAYLAŞ (PNG) — Tam panel + istenmeyen butonları çıkar, köşeleri keskin yap, numaraları güvenli yaz, alt yazı ekle ===
  const shareBtn = document.getElementById("panelShare");
  if (shareBtn) {
    shareBtn.onclick = async () => {
      const panelEl = document.getElementById("panel");
      const contentEl = document.getElementById("panelContent");
      if (!panelEl || !contentEl) return;

      const panelRect = panelEl.getBoundingClientRect();
      const panelWidthPx = `${Math.round(panelRect.width)}px`;

      try {
        const canvas = await html2canvas(panelEl, {
          backgroundColor: "#0a0a0a",
          scale: 2,
          useCORS: true,
          scrollX: 0,
          scrollY: 0,
          onclone: (doc) => {
            const p = doc.getElementById("panel");
            const c = doc.getElementById("panelContent");

            // — Paneli tam boy ve köşeli yap
            if (p) {
              p.style.position  = "static";
              p.style.transform = "none";
              p.style.height    = "auto";
              p.style.maxHeight = "none";
              p.style.width     = panelWidthPx;
              p.style.boxShadow = "none";
              p.style.borderRadius = "0";
              p.style.borderTopLeftRadius  = "0";
              p.style.borderTopRightRadius = "0";
            }
            if (c) {
              c.style.height    = "auto";
              c.style.maxHeight = "none";
              c.style.overflow  = "visible";
            }

            // — Görselde istemediklerini kaldır
            doc.getElementById("panelClose")?.remove();
            doc.querySelector(".drag-handle")?.remove();
            doc.querySelector(".play-buttons")?.remove();
            doc.getElementById("panelOverlay")?.remove();

            // — SAĞLAM SAYILANDIRMA: listelerde gerçek numara span'ı oluştur
            doc.querySelectorAll("#panelContent ol").forEach((ol) => {
              ol.style.listStyle = "none";
              ol.style.margin = "0";
              ol.style.padding = "0";

              Array.from(ol.querySelectorAll("li")).forEach((li, idx) => {
                // Li içeriğini iki sütuna böl: numara + metin
                const num = doc.createElement("span");
                num.textContent = `${idx + 1}.`;
                Object.assign(num.style, {
                  display: "inline-block",
                  width: "2.2ch",
                  textAlign: "right",
                  marginRight: ".6ch",
                  fontVariantNumeric: "tabular-nums",
                  opacity: "0.9"
                });

                const text = doc.createElement("span");
                text.innerHTML = li.innerHTML;

                li.innerHTML = "";
                Object.assign(li.style, {
                  display: "flex",
                  alignItems: "baseline",
                  lineHeight: "1.35",
                  margin: ".2rem 0"
                });
                li.appendChild(num);
                li.appendChild(text);
              });
            });
          },
        });

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
        if (!blob) return;

        const file = new File([blob], "album.jpg", { type: "image/jpeg" });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "Albüm" });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = "album.jpg"; a.click();
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.error("Paylaşım hatası:", err);
      }
    };
  }
}

/* =============================
   Scroll arrow + hero line
============================= */
function ensureScrollArrow(threshold = 0.60){  
  const arrowEl = document.querySelector('#siteHeader .scroll-down');
  if (arrowEl && window.scrollY < 32) {
    arrowEl.classList.add('intro');
    arrowEl.addEventListener('animationend', () => {
      arrowEl.classList.remove('intro');
    }, { once: true });
  }

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
      line.classList.toggle("active", isActive);
      line.style.opacity = isActive ? "1" : "0";
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
function allCards(){ return [...document.querySelectorAll(".album")]; }
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

// === Aşağı ok intro: çizgi aktifse/scroll varsa asla çalışmasın ===
function setupArrowIntro({ delay = 600, scrollThreshold = 16 } = {}) {
  const arrowEl = document.querySelector('#siteHeader .scroll-down');
  const lineEl  = document.querySelector('#siteHeader .hero-line');
  if (!arrowEl || !lineEl) return;

  // zaten scroll olduysa ya da çizgi aktifse intro planlama
  if (window.scrollY >= scrollThreshold || lineEl.classList.contains('active')) return;

  let cancelled = false;
  let timer = null;
  let mo = null;

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    if (timer) clearTimeout(timer);
    mo?.disconnect?.();
    window.removeEventListener('scroll', onScroll);
    arrowEl.classList.remove('intro');
  };

  function onScroll() {
    if (window.scrollY >= scrollThreshold) cancel();
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // Çizgi class'ı değişirse anında iptal
  mo = new MutationObserver(() => {
    if (lineEl.classList.contains('active')) cancel();
  });
  mo.observe(lineEl, { attributes: true, attributeFilter: ['class'] });

  // Gecikmeden sonra son kez kontrol edip fade başlat
  timer = setTimeout(() => {
    if (cancelled) return;
    if (window.scrollY >= scrollThreshold || lineEl.classList.contains('active')) {
      cancel(); return;
    }
    arrowEl.classList.add('intro');
    arrowEl.addEventListener('animationend', () => {
      // animasyon biter bitmez izleyicileri kapat
      arrowEl.classList.remove('intro');
      cancel();
    }, { once: true });
  }, delay);
}

/* =============================
   Boot (Grid only)
============================= */
async function init() {
  ensureScrollArrow(0.60);
  setupArrowIntro();

  stage        = document.getElementById("stage");
  panel        = document.getElementById("panel");
  panelTitle   = document.getElementById("panelTitle");
  panelContent = document.getElementById("panelContent");
  panelCloseBtn= document.getElementById("panelClose");

  // Kalıcı GRID modu
  stage.classList.add("grid-mode");

  // Panel kapatma davranışları
  if (panelCloseBtn) panelCloseBtn.addEventListener("click", closePanel);
  panel?.addEventListener("click", (e) => { if (e.target === panel) closePanel(); });
  document.addEventListener("click", (e) => {
    if (!panel?.classList.contains("open")) return;
    const isAlbum = e.target.closest?.(".album");
    const isScroll= e.target.closest?.(".scroll-down, .hero-line");
    const isPanel = e.target.closest?.("#panel");
    if (!isAlbum && !isScroll && !isPanel) closePanel();
  });

  /* === Mobilde paneli sürükleyerek kapatma (iOS-vari) — geri eklendi === */
  /* === Mobilde paneli sürükleyerek kapatma (modern overlay) === */
if (window.matchMedia("(max-width: 767px)").matches) {
  let startY = 0, currentY = 0, dragging = false, startedAtTop = false;

  const OPEN_Y = 0;
  const MAX_BLUR_PX = 6; // overlay blur maksimumu
  const panelContentEl = document.getElementById("panelContent");
  const panelHeader  = document.querySelector("#panel header");
  const dragHandle   = document.querySelector(".drag-handle");
  const overlayEl    = document.getElementById("panelOverlay");

  function setOverlayProgress(p){ // 0..1 (1 = tamamen aşağı çekilmiş)
    const inv = Math.max(0, 1 - p);
    // opaklığı çok kesmeyelim; 0.1 taban kalsın → daha “premium” durur
    overlayEl.style.opacity = (0.1 + 0.9 * inv).toString();
    const blur = (MAX_BLUR_PX * inv);
    overlayEl.style.backdropFilter = `blur(${blur}px)`;
    overlayEl.style.webkitBackdropFilter = `blur(${blur}px)`;
  }

  function onStart(e){
    const target = e.target;
    const isHeaderDrag = panelHeader.contains(target) || dragHandle?.contains(target);

    // İçerik en üstteyse ya da header/handle’dan başladıysa sürüklemeye izin ver
    startedAtTop = isHeaderDrag || (panelContentEl.scrollTop <= 0);
    if (!startedAtTop) return;

    dragging = true;
    startY = e.touches[0].clientY;
    currentY = startY;

    // Animasyonları kaldır, direkt takip etsin
    panel.style.transition = "none";
    overlayEl.style.transition = "none";

    // Drag başlarken overlay tam aktif kalsın
    setOverlayProgress(0);

    document.body.classList.add("panel-dragging");
  }

  function onMove(e){
    if (!dragging || !startedAtTop) return;
    currentY = e.touches[0].clientY;
    let deltaY = currentY - startY;
    if (deltaY < 0) deltaY = 0;

    panel.style.transform = `translateY(${deltaY}px)`;

    // İlerlemeye göre overlay’i canlı güncelle
    const h = panel.getBoundingClientRect().height;
    const threshold = h * 0.65;
    const p = Math.min(1, deltaY / threshold);
    setOverlayProgress(p);
  }

  function finishDrag(shouldClose){
    // Geçişleri geri aç
    panel.style.transition    = "transform 250ms ease";
    overlayEl.style.transition = "opacity 250ms ease, backdrop-filter 250ms ease";

    if (shouldClose) {
      // Panel kapanırken overlay de akıcı şekilde sönsün
      panel.style.transform = "translateY(100%)";
      overlayEl.style.opacity = "0";
      overlayEl.style.backdropFilter = "blur(0px)";
      overlayEl.style.webkitBackdropFilter = "blur(0px)";

      const done = () => {
        panel.removeEventListener("transitionend", done);
        // inline stilleri temizle
        panel.style.transform   = "";
        panel.style.transition  = "";
        overlayEl.style.transition = "";
        overlayEl.style.opacity = "";
        overlayEl.style.backdropFilter = "";
        overlayEl.style.webkitBackdropFilter = "";
        document.body.classList.remove("panel-dragging");
        closePanel();
      };
      panel.addEventListener("transitionend", done, { once: true });

    } else {
      // Kapatma eşiğini geçmediyse geri eski haline dönsün
      panel.style.transform = `translateY(${OPEN_Y}px)`;
      overlayEl.style.opacity = "1";
      overlayEl.style.backdropFilter = `blur(${MAX_BLUR_PX}px)`;
      overlayEl.style.webkitBackdropFilter = `blur(${MAX_BLUR_PX}px)`;

      const back = () => {
        panel.removeEventListener("transitionend", back);
        // inline stilleri temizle
        panel.style.transform   = "";
        panel.style.transition  = "";
        overlayEl.style.transition = "";
        overlayEl.style.opacity = "";
        overlayEl.style.backdropFilter = "";
        overlayEl.style.webkitBackdropFilter = "";
        document.body.classList.remove("panel-dragging");
      };
      panel.addEventListener("transitionend", back, { once: true });
    }
  }

  function onEnd(){
    if (!dragging || !startedAtTop) return;
    dragging = false;

    const deltaY = Math.max(0, currentY - startY);
    const h = panel.getBoundingClientRect().height;
    const threshold = Math.min(160, h * 0.27);

    finishDrag(deltaY > threshold);
  }

  panel.addEventListener("touchstart", onStart,   { passive: true });
  panel.addEventListener("touchmove",  onMove,    { passive: true });
  panel.addEventListener("touchend",   onEnd,     { passive: true });
  panel.addEventListener("touchcancel",onEnd,     { passive: true });
}

  // Mobilde panel açıkken pull-to-refresh’i engelle
  document.addEventListener('touchmove', (e) => {
    if (document.body.classList.contains('no-scroll')) {
      const panelContent = document.getElementById('panelContent');
      // e.target panelin içindeyse (veya onun çocuklarından birindeyse) kaydırmaya izin ver
      if (panelContent && panelContent.contains(e.target)) {
        return;
      }
      // aksi halde pull-to-refresh’i engelle
      e.preventDefault();
    }
  }, { passive: false });

  // JSON yükle
  let albumsData = [];
try {
  const res = await fetch("albums.json");
  if (!res.ok) throw new Error(res.statusText);
  albumsData = await res.json();
} catch(err) {
  console.error("albums.json yüklenemedi:", err);
  document.getElementById("loader")?.insertAdjacentHTML("afterend", 
    `<p class="error" role="alert">Albüm listesi yüklenemedi. Lütfen bağlantınızı kontrol edin.</p>`);
}
try {
  if ("serviceWorker" in navigator) {
    const urls = (albumsData || []).map(a => a.cover).filter(Boolean);
    if (urls.length) {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "PRECACHE_COVERS", urls });
      } else {
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          navigator.serviceWorker.controller?.postMessage({ type: "PRECACHE_COVERS", urls });
        }, { once: true });
      }
    }
  }
} catch(e) {}


  const albumIndex = new Map();
  const loader = document.getElementById("loader");

  let loaded = 0;
  const total = albumsData.length;

  for (const d of albumsData) {
    // Önden cache (opsiyonel)
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
      <img src="${cover}" alt="${d.title}" loading="lazy" decoding="async" width="220" height="220">
      <div class="overlay">
        <strong class="title">${d.title}</strong>
        <div class="artist">${d.artist}</div>
      </div>
    `;

    albumIndex.set(albumHash(d.artist, d.title), { ...d, cover });

    // Doğrudan grid'e ekle
    stage.appendChild(el);

    const img = el.querySelector("img");
    img.onload = img.onerror = () => {
      loaded++;
      el.classList.add("show");
      if (loaded === total) {
        // Tüm görseller geldiyse loader'ı gizle
        loader?.style?.setProperty("display","none");
      }
    };
  }

  // Tıklama / Enter ile panel açma (delegation)
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

  // Deep-link desteği
  window.addEventListener("hashchange", ()=>openFromHash(albumIndex), { passive: true });
  openFromHash(albumIndex);

  function getGridCols(){
    const cards = [...document.querySelectorAll(".album")];
    if (cards.length <= 1) return 1;
    const firstTop = cards[0].offsetTop;
    let cols = 0;
    for (const el of cards) {
      if (el.offsetTop !== firstTop) break;
      cols++;
    }
    return cols || 1;
  }

  function enableKeyboardNavigation() {
  const cards = () => [...document.querySelectorAll(".album")];
  
  document.addEventListener("keydown", (e) => {
    const focusEl = document.activeElement;
    if (!focusEl.classList.contains("album")) return;

    const list = cards();
    const index = list.indexOf(focusEl);
    if (index === -1) return;

    // Grid sütun sayısını hesapla
    const cols =  getGridCols();

    let nextIndex = null;
    switch (e.key) {
      case "ArrowRight":
        nextIndex = index + 1;
        break;
      case "ArrowLeft":
        nextIndex = index - 1;
        break;
      case "ArrowDown":
        nextIndex = index + cols;
        break;
      case "ArrowUp":
        nextIndex = index - cols;
        break;
      case "Enter":
      case " ":
        focusEl.click();
        e.preventDefault();
        return;
      case "Escape":
        closePanel();
        return;
    }

    if (nextIndex !== null && list[nextIndex]) {
      e.preventDefault();
      list[nextIndex].focus();
    }
  });
}
  enableKeyboardNavigation();
}

// === Panel Blur Dinamik FPS Tabanlı Optimizasyon (Aç/Kapat) ===
(function(){
  const panel = document.querySelector('.panel');
  const overlay = document.getElementById('panelOverlay');
  if (!panel || !overlay) return;

  let frames = 0;
  let lastTime = performance.now();
  let fps = 60;
  let blurDisabled = false;

  function disableBlur(){
    panel.style.backdropFilter = 'none';
    panel.style.webkitBackdropFilter = 'none';
    overlay.style.backdropFilter = 'none';
    overlay.style.webkitBackdropFilter = 'none';
    overlay.style.background = 'rgba(0,0,0,0.65)';
    blurDisabled = true;
  }

  function enableBlur(){
    panel.style.backdropFilter = 'blur(12px)';
    panel.style.webkitBackdropFilter = 'blur(12px)';
    overlay.style.backdropFilter = 'blur(6px)';
    overlay.style.webkitBackdropFilter = 'blur(6px)';
    overlay.style.background = 'rgba(0,0,0,0.4)';
    blurDisabled = false;
  }

  function checkFPS(){
    const now = performance.now();
    frames++;
    if (now - lastTime >= 1000) {
      fps = frames;
      frames = 0;
      lastTime = now;

      if (fps < 15 && !blurDisabled) {
        disableBlur();
      } else if (fps >= 25 && blurDisabled) {
        enableBlur();
      }
    }
    requestAnimationFrame(checkFPS);
  }
  requestAnimationFrame(checkFPS);
})();

window.addEventListener('DOMContentLoaded', init);

// --- Service Worker Register (PWA) ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}
