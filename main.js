const API_KEY = "54a081b58d13ffae5583342c642053a0";

let SIZE, HALF, SEPARATION_DIST, SPRING_REST, EDGE_BAND, MOUSE_RADIUS, MOUSE_DEADZONE;
const SPRING_K = 0.003, SPRING_DAMP = 0.1;
const CENTER_K = 0.0010, GROUP_K  = 0.0022, WALL_K = 0.018;
const EDGE_FRICTION = 0.92;
const WATER_STRENGTH = 0.04, WATER_SCALE = 600, WATER_SPEED_X = 0.45, WATER_SPEED_Y = 0.65;
const DAMPING = 0.98, MAX_SPEED = 3.5;
const albumCache = new Map();
const MOUSE_STRENGTH = 0.36, MOUSE_PROPAGATION = 0.15;

function computeParams(){
  SIZE = window.innerWidth / 6;
  HALF = SIZE/2;
  document.documentElement.style.setProperty('--size', SIZE + 'px');
  SEPARATION_DIST = SIZE * 3.2;
  SPRING_REST     = SIZE * 2.0;
  EDGE_BAND       = 24 * (SIZE/104);
  MOUSE_RADIUS    = 330 * (SIZE/104);
  MOUSE_DEADZONE  = 46  * (SIZE/104);
}

const stage = document.getElementById('stage');
const W = () => stage.clientWidth, H = () => stage.clientHeight;

function computeStageHeight(artistCount){
  const rowHeight = 560 * (SIZE/104);
  return Math.max(window.innerHeight, artistCount * rowHeight);
}

function waterField(x,y,t){
  return {
    ax: WATER_STRENGTH * Math.sin((y + t*60*WATER_SPEED_X)/WATER_SCALE),
    ay: WATER_STRENGTH * Math.cos((x + t*60*WATER_SPEED_Y)/WATER_SCALE)
  };
}

let nodes=[], artists=[], centers=new Map(), byArtist=new Map(), links=[];
const labels = new Map(), smoothLabelPos=new Map();
let mouse = {x:null, y:null};

// === Zigzag yerleşim ===
function artistCentersZigzag(w,h,artists){
  const leftX  = Math.max(SIZE + 120, w * 0.18);
  const rightX = Math.min(w - SIZE - 120, w * 0.82);
  const startY = SIZE * -5;
  const stepY  = SIZE * 2.8;
  const jitterX = SIZE * 0.07, jitterY = SIZE * 0.07;
  const map = new Map();
  artists.forEach((name, i)=>{
    const isLeft = (i % 2 === 0);
    const cx = (isLeft ? leftX : rightX) + (Math.random()-0.5)*2*jitterX;
    const cy = startY + i * stepY + (Math.random()-0.5)*2*jitterY;
    map.set(name, {x: cx, y: cy});
  });
  return map;
}

// === Etiketler ===
function renderLabels(){
  labels.forEach(el=> el.remove()); labels.clear();
  artists.forEach(name=>{
    const p = centers.get(name);
    const div = document.createElement('div');
    div.className = 'label';
    div.style.left = p.x + 'px'; div.style.top  = p.y + 'px';
    div.textContent = name;
    stage.appendChild(div); labels.set(name, div);
  });
}

function lerp(a,b,t){ return a + (b-a)*t; }
function updateLabelsToCentroids(){
  byArtist.forEach((arr, name)=>{
    if(!arr.length) return;
    let sx=0, sy=0;
    arr.forEach(n=>{ sx += n.x + HALF; sy += n.y + HALF; });
    const tx = sx/arr.length, ty = sy/arr.length;
    const prev = smoothLabelPos.get(name) || {x: tx, y: ty};
    const nx = lerp(prev.x, tx, 0.15), ny = lerp(prev.y, ty, 0.15);
    smoothLabelPos.set(name, {x: nx, y: ny});
    const div = labels.get(name); if(div){ div.style.left = nx+'px'; div.style.top=ny+'px'; }
  });
}

// === Fizik motoru ===
function step(){
  const w=W(), h=H(), t = performance.now()/1000;
  nodes.forEach(n=>{ n.ax=0; n.ay=0; });
  nodes.forEach(n=>{ const f = waterField(n.x, n.y, t); n.ax+=f.ax; n.ay+=f.ay; });
  nodes.forEach(n=>{
    const gc = centers.get(n.artist);
    if(gc){ n.ax += (gc.x - (n.x+HALF)) * GROUP_K; n.ay += (gc.y - (n.y+HALF)) * GROUP_K; }
    const cx=w/2, cy=h/2;
    n.ax += (cx-(n.x+HALF))*CENTER_K; n.ay += (cy-(n.y+HALF))*CENTER_K;
  });

  // separation
  for(let i=0;i<nodes.length;i++){
    for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i], b=nodes[j];
      const dx=a.x-b.x, dy=a.y-b.y, dist=Math.hypot(dx,dy)||0.0001;
      if(dist<SEPARATION_DIST){
        const overlap=(SEPARATION_DIST-dist)/SEPARATION_DIST;
        const s=(2600*overlap)/(dist*dist);
        const ux=dx/dist, uy=dy/dist;
        a.ax+=ux*s; a.ay+=uy*s; b.ax-=ux*s; b.ay-=uy*s;
      }
    }
  }
  // collision min
  const COLLISION_MIN=SIZE*1.05;
  for(let i=0;i<nodes.length;i++){
    for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i], b=nodes[j];
      const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||0.0001;
      if(d<COLLISION_MIN){
        const push=(COLLISION_MIN-d)*0.015;
        const ux=dx/d, uy=dy/d;
        a.ax-=ux*push; a.ay-=uy*push; b.ax+=ux*push; b.ay+=uy*push;
      }
    }
  }
  // spring
  links.forEach(L=>{
    const a=L.a,b=L.b,dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||0.0001;
    const ux=dx/d, uy=dy/d, stretch=d-SPRING_REST;
    const fs=SPRING_K*stretch;
    const rvx=b.vx-a.vx,rvy=b.vy-a.vy;
    const damp=SPRING_DAMP*(rvx*ux+rvy*uy);
    const f=fs+damp;
    a.ax+=f*ux; a.ay+=f*uy; b.ax-=f*ux; b.ay-=f*uy;
  });
  // mouse
  if(mouse.x!==null){
    nodes.forEach(n=>{
      if(n.hovered) return;
      const dx=n.x+HALF-mouse.x, dy=n.y+HALF-mouse.y, dist=Math.hypot(dx,dy);
      if(dist<MOUSE_RADIUS && dist>MOUSE_DEADZONE){
        const amt=(dist-MOUSE_DEADZONE)/(MOUSE_RADIUS-MOUSE_DEADZONE);
        const k=(1-amt)*MOUSE_STRENGTH;
        const ux=dx/dist, uy=dy/dist, fx=ux*k, fy=uy*k;
        n.ax+=fx; n.ay+=fy;
        links.forEach(L=>{
          if(L.a===n){L.b.ax+=fx*MOUSE_PROPAGATION; L.b.ay+=fy*MOUSE_PROPAGATION;}
          else if(L.b===n){L.a.ax+=fx*MOUSE_PROPAGATION; L.a.ay+=fy*MOUSE_PROPAGATION;}
        });
      }
    });
  }
  // walls
  nodes.forEach(n=>{
    const minX=10,minY=10,maxX=w-SIZE-10,maxY=h-SIZE-10;
    if(n.x<minX) n.ax+=(minX-n.x)*WALL_K;
    if(n.x>maxX) n.ax-=(n.x-maxX)*WALL_K;
    if(n.y<minY) n.ay+=(minY-n.y)*WALL_K;
    if(n.y>maxY) n.ay-=(n.y-maxY)*WALL_K;
    if(n.x-minX<EDGE_BAND||maxX-n.x<EDGE_BAND) n.vx*=EDGE_FRICTION;
    if(n.y-minY<EDGE_BAND||maxY-n.y<EDGE_BAND) n.vy*=EDGE_FRICTION;
  });
  // integration
  nodes.forEach(n=>{
    n.vx=(n.vx+n.ax)*DAMPING; n.vy=(n.vy+n.ay)*DAMPING;
    const sp=Math.hypot(n.vx,n.vy);
    if(sp>MAX_SPEED){n.vx=n.vx/sp*MAX_SPEED; n.vy=n.vy/sp*MAX_SPEED;}
    n.x+=n.vx; n.y+=n.vy; n.el.style.left=n.x+'px'; n.el.style.top=n.y+'px';
  });

  updateLabelsToCentroids();
  requestAnimationFrame(step);
}

// === Mouse ===
stage.addEventListener('mousemove', e=>{
  const rect=stage.getBoundingClientRect();
  mouse.x=e.clientX-rect.left+window.scrollX; mouse.y=e.clientY-rect.top+window.scrollY;
});
stage.addEventListener('mouseleave', ()=>{ mouse.x=null; mouse.y=null; });

// === Panel ===
const panel=document.getElementById('panel'), panelTitle=document.getElementById('panelTitle'), panelContent=document.getElementById('panelContent');
document.getElementById('panelClose').addEventListener('click', ()=> { panel.classList.remove('open'); document.body.classList.remove('no-scroll'); });
function openPanel(album, customDesc){
  panelTitle.textContent = `${album.artist} — ${album.name}`;
  const imgUrl = (Array.isArray(album.image) ? (album.image[album.image.length-1] && album.image[album.image.length-1]['#text']) : '') || '';
  panelContent.innerHTML = `
    <img src="${imgUrl}" style="width:100%; border-radius:8px; margin-bottom:12px;">
    <h4>Açıklama</h4>
    <p>${customDesc || "Henüz açıklama eklenmedi."}</p>
    <h4>Parçalar</h4>
    <ol>${(album.tracks?.track||[]).map(t=>`<li>${t.name}</li>`).join('')}</ol>
  `;
  panel.classList.add('open');
  document.body.classList.add('no-scroll');
}

// === API çağrısı ===
async function fetchAlbumInfo(artist, album){
  const key = `${artist}|${album}`;
  if(albumCache.has(key)) return albumCache.get(key);
  const url = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=${API_KEY}&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}&format=json`;
  const res = await fetch(url);
  if(!res.ok) return null;
  const data = await res.json();
  const out = data.album || null;
  if(out) albumCache.set(key, out);
  return out;
}

// === Scroll-down oku hazırla ===// === Scroll-down oku hazırla ===
function wireScrollDown(){
  const scrollDown = document.querySelector('.scroll-down');
  if(!scrollDown) return;

  // tıklayınca sahneye kay
  scrollDown.addEventListener('click', () => {
    stage.scrollIntoView({ behavior: 'smooth' });
  });

  // fadeInUp bitince bounce başlasın
  const startBounce = () => scrollDown.classList.add('show-bounce');

  scrollDown.addEventListener('animationend', (e) => {
    if(e.animationName === 'fadeInUp'){ startBounce(); }
  });

  // fallback: olayı kaçırırsa ~2.6s sonra bounce başlasın
  setTimeout(()=>{
    if(getComputedStyle(scrollDown).opacity === '1' && !scrollDown.classList.contains('show-bounce')){
      startBounce();
    }
  }, 2600);
}

// === Init ===
async function init(){
  computeParams();
  wireScrollDown();

  const res = await fetch('albums.json'); 
  const albumsData = await res.json();

  const total = albumsData.length;
  let loaded = 0;
  const progressBar = document.getElementById('progress-bar');
  const loaderStage = document.getElementById('loader-stage');

  for(const d of albumsData){
    const info = await fetchAlbumInfo(d.artist, d.title);

    let imgUrl = d.cover || "https://via.placeholder.com/400x400?text=" + encodeURIComponent(d.title);
    if(!d.cover && info?.image){
      const candidates = info.image.filter(i => i['#text']);
      if(candidates.length > 0){
        imgUrl = candidates[candidates.length-1]['#text'];
      }
    }

    const el = document.createElement('div');
    el.className = 'album';
    el.dataset.artist = d.artist;
    el.dataset.title = d.title;
    el.dataset.desc = d.desc || "";
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    el.setAttribute('aria-label', `${d.artist} — ${d.title} albümünü aç`);
    el.innerHTML = `
      <img src="${imgUrl}" alt="${d.title}">
      <div class="overlay"><strong>${d.title}</strong><div class="tag">${d.artist}</div></div>
    `;
    loaderStage.appendChild(el);

    const img = el.querySelector("img");
    img.onload = img.onerror = () => {
      loaded++;
      progressBar.style.width = ((loaded/total)*100) + "%";
      el.classList.add("show");

      if(loaded === total){
        setTimeout(()=>{
          const loaderAlbums = Array.from(loaderStage.children);
          const stageRect = stage.getBoundingClientRect();

          loaderAlbums.forEach(a => {
            const rect = a.getBoundingClientRect();
            const x = rect.left - stageRect.left;
            const y = rect.top - stageRect.top;
            stage.appendChild(a);
            a.style.position = "absolute";
            a.style.left = x + "px";
            a.style.top  = y + "px";
            a.classList.add("to-stage");
          });

          document.getElementById('loader').style.display = 'none';
          startPhysics();
        }, 500);
      }
    };
  }
}

function startPhysics(){
  const elAlbums = Array.from(stage.querySelectorAll('.album'));

  nodes = elAlbums.map(el => {
    const x = parseFloat(el.style.left);
    const y = parseFloat(el.style.top);

    return {
      el,
      artist: el.dataset.artist,
      title: el.dataset.title,
      desc: el.dataset.desc,
      x, y,
      vx:(Math.random()-0.5)*0.6,
      vy:(Math.random()-0.5)*0.6,
      hovered:false,
      ax:0, ay:0
    };
  });

  artists = Array.from(new Set(nodes.map(n => n.artist)));
  stage.style.height = computeStageHeight(artists.length) + 'px';
  centers = artistCentersZigzag(W(), H(), artists);

  byArtist = new Map();
  nodes.forEach(n=>{
    if(!byArtist.has(n.artist)) byArtist.set(n.artist,[]);
    byArtist.get(n.artist).push(n);
  });
  byArtist.forEach(arr=>arr.sort((a,b)=>(a.title||'').localeCompare(b.title||'')));

  links = [];
  byArtist.forEach(arr=>{
    for(let i=0;i<arr.length-1;i++) links.push({a:arr[i], b:arr[i+1]});
  });

  nodes.forEach(n=>{
    n.el.addEventListener('mouseenter', ()=>{n.hovered=true; n.el.classList.add('on-top');});
    n.el.addEventListener('mouseleave', ()=>{n.hovered=false; n.el.classList.remove('on-top');});
    n.el.addEventListener('click', ()=> fetchAlbumInfo(n.artist, n.title).then(info => info && openPanel(info, n.desc)));
  });

  renderLabels();
  step();
}

init();
window.addEventListener('resize', ()=>{ computeParams(); stage.style.height=computeStageHeight(artists.length)+'px'; centers=artistCentersZigzag(W(),H(),artists); renderLabels(); });
