const API_KEY = "54a081b58d13ffae5583342c642053a0";
const albumCache = new Map();

// === Panel ===
const panel = document.getElementById('panel');
const panelTitle = document.getElementById('panelTitle');
const panelContent = document.getElementById('panelContent');
document.getElementById('panelClose').addEventListener('click', () => {
  panel.classList.remove('open');
});

// Panel aç
function openPanel(album, customDesc) {
  panelTitle.textContent = `${album.artist} — ${album.name}`;

  // Albüm resmi seçimi
  let imgUrl = "";
  if (Array.isArray(album.image)) {
    // mega > extralarge > fallback
    imgUrl = album.image.find(i => i.size === "mega")?.["#text"]
          || album.image.find(i => i.size === "extralarge")?.["#text"]
          || album.image[album.image.length - 1]["#text"]
          || "";
    // çözünürlüğü büyütmeye çalış
    if (imgUrl.includes("300x300")) {
      imgUrl = imgUrl.replace("300x300", "600x600");
    }
  }

  panelContent.innerHTML = `
    <img src="${imgUrl}" style="width:100%; border-radius:8px; margin-bottom:8px;">

    <div class="play-buttons">
      <a href="https://open.spotify.com/search/${encodeURIComponent(album.artist + " " + album.name)}"
         target="_blank" class="play-button spotify" aria-label="Spotify"></a>
      <a href="https://music.youtube.com/search?q=${encodeURIComponent(album.artist + " " + album.name)}"
         target="_blank" class="play-button yt" aria-label="YouTube Music"></a>
      <a href="https://music.apple.com/search?term=${encodeURIComponent(album.artist + " " + album.name)}"
         target="_blank" class="play-button apple" aria-label="Apple Music"></a>
    </div>

    <h4 style="margin-top:16px;">Açıklama</h4>
    <p>${customDesc || "Henüz açıklama eklenmedi."}</p>
    <h4>Parçalar</h4>
    <ol>${(album.tracks?.track || []).map(t => `<li>${t.name}</li>`).join('')}</ol>
  `;
  panel.classList.add('open');
}


// API çağrısı
async function fetchAlbumInfo(artist, album) {
  const key = `${artist}|${album}`;
  if (albumCache.has(key)) return albumCache.get(key);

  const url = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=${API_KEY}&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const out = data.album || null;
  if (out) albumCache.set(key, out);
  return out;
}

// Albümleri yükle (grid)
async function init() {
  const res = await fetch('albums.json');
  const albumsData = await res.json();

  const stage = document.getElementById('stage');
  stage.innerHTML = "";

  for (let i = 0; i < albumsData.length; i++) {
    const d = albumsData[i];
    const info = await fetchAlbumInfo(d.artist, d.title);

    let imgUrl = "";
    if (info?.image) {
      const candidates = info.image.filter(i => i['#text']);
      if (candidates.length > 0) {
        imgUrl = candidates[candidates.length - 1]['#text'];
      }
    }
    if (!imgUrl) {
      imgUrl = `https://via.placeholder.com/400x400?text=${encodeURIComponent(d.title)}`;
    }

    const el = document.createElement('div');
    el.className = 'album';
    el.dataset.artist = d.artist;
    el.dataset.title = d.title;
    el.dataset.desc = d.desc || "";
    el.style.animationDelay = (i * 0.1) + "s";
    el.innerHTML = `
      <img src="${imgUrl}" alt="${d.title}">
      <div class="overlay">
        <strong>${d.title}</strong>
        <div class="tag">${d.artist}</div>
      </div>
    `;
    stage.appendChild(el);

    el.addEventListener('click', () => {
      if (info) openPanel(info, d.desc);
    });
  }
}

// Scroll down oku
function wireScrollDown() {
  const scrollDown = document.querySelector('.scroll-down');
  if (!scrollDown) return;

  scrollDown.addEventListener('click', () => {
    document.getElementById('stage').scrollIntoView({ behavior: 'smooth' });
  });

  const startBounce = () => scrollDown.classList.add('show-bounce');
  scrollDown.addEventListener('animationend', (e) => {
    if (e.animationName === 'fadeInUp') startBounce();
  });
  setTimeout(() => {
    if (getComputedStyle(scrollDown).opacity === '1' && !scrollDown.classList.contains('show-bounce')) {
      startBounce();
    }
  }, 2600);
}

init();
wireScrollDown();
