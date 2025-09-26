# download_covers.py
import json, os, re, io, time
import requests
from unidecode import unidecode
from PIL import Image

ALBUMS_JSON = "albums.json"
COVERS_DIR  = "covers"
ITUNES_URL  = "https://itunes.apple.com/search"
MB_SEARCH   = "https://musicbrainz.org/ws/2/release-group/"
CAA_URL     = "https://coverartarchive.org/release-group/{mbid}/front"
HEADERS     = {"User-Agent": "AlbumCoverFetcher/1.0 (contact: you@example.com)"}

os.makedirs(COVERS_DIR, exist_ok=True)

def slugify(s: str) -> str:
    s = unidecode(s).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s

def target_filename(artist, title) -> str:
    return os.path.join(COVERS_DIR, f"{slugify(artist)}--{slugify(title)}.jpg")

def save_as_jpg(bytes_data: bytes, path: str):
    """Her resmi 600x600 JPEG olarak kaydet"""
    im = Image.open(io.BytesIO(bytes_data)).convert("RGB")
    im = im.resize((600, 600), Image.LANCZOS)
    im.save(path, format="JPEG", quality=90, optimize=True)

def find_on_itunes(artist: str, title: str) -> str | None:
    """iTunes Search API’den kapak URL’si bul"""
    q = f"{artist} {title}"
    params = {"term": q, "entity": "album", "limit": 5, "country": "us", "media": "music"}
    r = requests.get(ITUNES_URL, params=params, headers=HEADERS, timeout=15)
    r.raise_for_status()
    data = r.json()
    if not data.get("results"):
        return None

    A, T = slugify(artist), slugify(title)
    best = None
    for item in data["results"]:
        a = slugify(item.get("artistName",""))
        t = slugify(item.get("collectionName",""))
        score = (a == A) + (T in t or t in T)
        if best is None or score > best[0]:
            best = (score, item)
    if not best: 
        return None

    art = best[1].get("artworkUrl100")
    if not art:
        return None
    # 600x600 boyut
    return re.sub(r"/\d{2,4}x\d{2,4}(bb)?\.jpg", "/600x600bb.jpg", art)

def find_on_caa(artist: str, title: str) -> bytes | None:
    """MusicBrainz + Cover Art Archive ile kapak bul"""
    q = f'artist:"{artist}" AND release:"{title}"'
    params = {"query": q, "fmt": "json", "limit": 5}
    r = requests.get(MB_SEARCH, params=params, headers=HEADERS, timeout=20)
    r.raise_for_status()
    rgs = r.json().get("release-groups") or []
    if not rgs: return None
    rgs.sort(key=lambda rg: (rg.get("primary-type") == "Album", rg.get("first-release-date","")), reverse=True)
    mbid = rgs[0]["id"]

    r2 = requests.get(CAA_URL.format(mbid=mbid), headers=HEADERS, timeout=25)
    if r2.status_code == 404: return None
    r2.raise_for_status()
    return r2.content

def download_cover(album: dict):
    artist = album.get("artist","").strip()
    title  = album.get("title","").strip()
    out_path = target_filename(artist, title)

    if os.path.exists(out_path):
        print("✓ Var:", out_path)
        return

    # 1) iTunes
    try:
        url = find_on_itunes(artist, title)
        if url:
            r = requests.get(url, headers=HEADERS, timeout=25)
            r.raise_for_status()
            save_as_jpg(r.content, out_path)
            print("✓ iTunes:", out_path)
            return
    except Exception as e:
        print("iTunes hata:", artist, title, e)

    # 2) MusicBrainz/CAA
    try:
        img = find_on_caa(artist, title)
        if img:
            save_as_jpg(img, out_path)
            print("✓ CAA:", out_path)
            return
    except Exception as e:
        print("CAA hata:", artist, title, e)

    print("✗ Bulunamadı:", artist, "-", title)

def main():
    with open(ALBUMS_JSON, "r", encoding="utf-8") as f:
        albums = json.load(f)
    for i, album in enumerate(albums, 1):
        print(f"[{i}/{len(albums)}] {album.get('artist')} — {album.get('title')}")
        download_cover(album)
        time.sleep(1)  # rate-limit

if __name__ == "__main__":
    main()
