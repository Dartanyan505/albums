const API_KEY = "54a081b58d13ffae5583342c642053a0";
const albumCache = new Map();

// === Panel ===
const panel = document.getElementById('panel');
const panelTitle = document.getElementById('panelTitle');
const panelContent = document.getElementById('panelContent');

document.getElementById('panelClose').addEventListener('click', () => {
  panel.classList.remove('open');
  document.body.style.overflow = ""; // scroll geri aç
});

// Panel aç
function openPanel(album, customDesc) {
  panelTitle.textContent = `${album.artist} — ${album.name}`;

  // Albüm resmi (yüksek çözünürlük tercih et)
  let imgUrl = "";
  if (Array.isArray(album.image)) {
    imgUrl = album.image.find(i => i.size === "mega")?.["#text"]
          || album.image.find(i => i.size === "extralarge")?.["#text"]
          || album.image[album.image.length - 1]["#text"]
          || "";
    if (imgUrl.includes("300x300")) {
      imgUrl = imgUrl.replace("300x300", "600x600");
    }
  }

  // Servis linkleri
  const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(album.artist + " " + album.name)}`;
  const ytMusicUrl = `https://music.youtube.com/search?q=${encodeURIComponent(album.artist + " " + album.name)}`;
  const appleMusicUrl = `https://music.apple.com/search?term=${encodeURIComponent(album.artist + " " + album.name)}`;

  // Panel içeriği
  panelContent.innerHTML = `
    <img src="${imgUrl}" class="album-cover">

    <div class="play-buttons">
      <a href="${spotifyUrl}" target="_blank" class="play-button spotify" aria-label="Spotify"></a>
      <a href="${ytMusicUrl}" target="_blank" class="play-button yt" aria-label="YouTube Music"></a>
      <a href="${appleMusicUrl}" target="_blank" class="play-button apple" aria-label="Apple Music"></a>
    </div>

    <h4 style="margin-top:16px;">Açıklama</h4>
    <p>${customDesc || "Henüz açıklama eklenmedi."}</p>

    <h4>Parçalar</h4>
    <ol>${(album.tracks?.track || []).map(t => `<li>${t.name}</li>`).join('')}</ol>
  `;

  // Paneli aç
  panel.classList.add('open');

  // 🔑 sadece mobilde scroll kilitle
  if (window.innerWidth <= 640) {
    document.body.style.overflow = "hidden";
  }
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

function setupScrollDown() {
  const scrollDown = document.querySelector('.scroll-down');
  const hero = document.getElementById('siteHeader');
  const heroLine = document.querySelector('.hero-line');
  if (!scrollDown || !hero || !heroLine) return;

  const heroHeight = hero.offsetHeight;

  function showLine() {
    scrollDown.style.opacity = "0"; // ok fade-out
    scrollDown.style.pointerEvents = "none";
    heroLine.classList.add('active'); // aynı anda çizgi açılır
  }

  function hideLine() {
    scrollDown.style.opacity = "1"; // ok fade-in
    scrollDown.style.pointerEvents = "auto";
    heroLine.classList.remove('active'); // çizgi kapanır
  }

  // Tıklama
  scrollDown.addEventListener('click', () => {
    document.getElementById('stage').scrollIntoView({ behavior: 'smooth' });
    showLine();
  });

  // Scroll
  window.addEventListener('scroll', () => {
    if (window.scrollY > heroHeight * 0.3) {
      showLine();
    } else {
      hideLine();
    }
  });
}
function setupAlbums() {
  const albums = document.querySelectorAll('.album');

  albums.forEach(album => {
    // Orta overlay + info butonu oluştur
    const overlay = document.createElement('div');
    overlay.className = 'album-overlay';

    const infoBtn = document.createElement('button');
    infoBtn.innerHTML = 'ℹ'; // info işareti
    overlay.appendChild(infoBtn);
    album.appendChild(overlay);

    // Info butonu → panel açsın
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const artist = album.dataset.artist;
      const title = album.dataset.title;
      const desc = album.dataset.desc;
      fetchAlbumInfo(artist, title).then(info => {
        if (info) openPanel(info, desc);
      });
    });

    // Mobil: ilk tıklamada sadece hover efekti açılır (active class eklenir)
    album.addEventListener('click', (e) => {
      if (!album.classList.contains('active')) {
        e.preventDefault();
        albums.forEach(a => a.classList.remove('active')); // diğerlerini kapat
        album.classList.add('active'); // sadece bu aktif olsun
      }
    });
  });
}

setupAlbums();

setupScrollDown();
init();
wireScrollDown();
