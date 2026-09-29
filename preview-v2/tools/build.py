"""Package the v2 page and the assets it references into a static site.

Same output layout as scripts/build-pages.py (so it can be published the same way), written to
site-v2/ instead of site/. Run optimize-assets.py first if preview-v2/optimized/ is missing.

    python preview-v2/tools/build.py
    python -m http.server 8767 --directory site-v2    # check the bundle locally
"""
import base64
import gzip
import json
import shutil
import subprocess
from pathlib import Path

V2 = Path(__file__).resolve().parents[1]
ROOT = V2.parent
ASSETS = ROOT / 'assets'
OUTPUT = ROOT / 'site-v2'

PAGE_FILES = ['index.html', 'style.css', 'viewer.css', 'app.js', 'scene-hero.js', 'scene-explorer.js',
              'articulation.js', 'lazy-media.js', 'scene-video.js']
VENDOR_FILES = ['three.min.js', 'three.LICENSE', 'OBJLoader.js', 'OrbitControls.js', 'GLTFLoader.js', 'DRACOLoader.js']
BRAND_FILES = ['neoworld-nw-small.svg', 'neoworld-favicon.svg']
# Only what the v2 page still reads from the shared assets/ folder. Icons, reference photos,
# posters, the hero wireframe and the re-encoded videos come from preview-v2/optimized/.
ASSET_FILES = [
    'fusion-pixel-latin-subset.woff2',
    'studio/scenes/scene-01/scene.glb',
    'studio/scenes/scene-01/scene-record.json',
    'studio/scenes/scene-01/scene-explorer-data.js',  # explorer fallback if the GLB path fails
    'studio/videos/sim2real.mp4',  # original HEVC, offered first to browsers that can play it
    *(f'architecture/scene-method/{name}.webp' for name in [
        'observation-wide', 'observation-detail', 'handoff-real', 'handoff-sim', 'object-real', 'object-sim',
        'feedback-real', 'feedback-sim', 'scene-real', 'scene-sim', 'robot-scene']),
]
OBJECTS = ASSETS / 'batch5_collision_urdf_textured'


def copy(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def published(folder):
    """Files a clean checkout contains, so untracked work in progress never ends up in the bundle."""
    try:
        listed = subprocess.run(['git', 'ls-files', '-z', '--', folder.relative_to(ROOT).as_posix()],
                                cwd=ROOT, capture_output=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return sorted(path for path in folder.rglob('*') if path.is_file())
    return sorted(path for path in (ROOT / name for name in listed.decode('utf-8').split('\0') if name) if path.is_file())


def skipped(path):
    # The object viewer prefers a WebP texture over a PNG with the same name.
    return path.suffix.lower() == '.png' and path.with_suffix('.webp').exists()


def build():
    if not (V2 / 'optimized').is_dir():
        raise SystemExit('preview-v2/optimized/ is missing: run preview-v2/tools/optimize-assets.py first.')
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()
    for name in PAGE_FILES:
        copy(V2 / name, OUTPUT / name)
    for name in VENDOR_FILES:
        copy(V2 / 'vendor' / name, OUTPUT / 'vendor' / name)
    shutil.copytree(V2 / 'vendor/draco', OUTPUT / 'vendor/draco')
    for name in BRAND_FILES:
        copy(V2 / 'brand' / name, OUTPUT / 'brand' / name)
    shutil.copytree(V2 / 'optimized', OUTPUT / 'optimized')
    for name in ASSET_FILES:
        copy(ASSETS / name, OUTPUT / 'assets' / name)

    index = OUTPUT / 'index.html'
    html = index.read_text(encoding='utf-8')
    if 'name="asset-mode" content="source"' not in html:
        raise SystemExit('index.html no longer declares asset-mode "source"; update build.py.')
    html = html.replace('name="asset-mode" content="source"', 'name="asset-mode" content="bundle"').replace('../assets/', './assets/')
    index.write_text(html, encoding='utf-8')

    # Articulated objects: plain files, gzipped OBJs, and one gzipped JSON bundle per object
    # (the viewer fetches only the bundle when the browser has DecompressionStream).
    files = [path for path in published(OBJECTS) if not skipped(path)]
    for path in files:
        target = OUTPUT / 'assets/batch5_collision_urdf_textured' / path.relative_to(OBJECTS)
        copy(path, target)
        if path.suffix.lower() == '.obj':
            target.with_suffix(target.suffix + '.gz').write_bytes(gzip.compress(path.read_bytes(), compresslevel=9, mtime=0))
    for folder in sorted({path.relative_to(OBJECTS).parts[0] for path in files if len(path.relative_to(OBJECTS).parts) > 1}):
        text_files, binary_files = {}, {}
        for path in files:
            if path.relative_to(OBJECTS).parts[0] != folder:
                continue
            key = path.relative_to(OBJECTS / folder).as_posix()
            if path.suffix.lower() in {'.urdf', '.obj', '.mtl'}:
                text_files[key] = path.read_text(encoding='utf-8')
            elif path.suffix.lower() in {'.png', '.webp'}:
                binary_files[key] = base64.b64encode(path.read_bytes()).decode('ascii')
        bundle = json.dumps({'text': text_files, 'binary': binary_files}, separators=(',', ':')).encode()
        target = OUTPUT / 'assets/batch5_collision_urdf_textured' / folder / f'{folder}.bundle.gz'
        target.write_bytes(gzip.compress(bundle, compresslevel=9, mtime=0))

    (OUTPUT / '.nojekyll').touch()
    output = [path for path in OUTPUT.rglob('*') if path.is_file()]
    print(f'v2 static bundle: {len(output)} files, {sum(p.stat().st_size for p in output) / 1024 / 1024:.2f} MiB -> {OUTPUT}')


if __name__ == '__main__':
    build()
