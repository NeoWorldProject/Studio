"""Package the current website and its referenced assets for GitHub Pages."""
from pathlib import Path
import base64
import gzip
import json
import shutil
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "site"
PAGE_FILES = ["index.html", "style.css", "viewer.css", "app.js", "scene-hero.js", "scene-explorer.js", "articulation.js", "lazy-media.js", "scene-video.js"]
VENDOR_FILES = ["three.min.js", "three.LICENSE", "anime.umd.min.js", "anime.LICENSE.md", "OBJLoader.js", "OrbitControls.js", "GLTFLoader.js", "DRACOLoader.js"]
ASSET_FILES = [
    "fusion-pixel-latin-subset.woff2",
    "studio/scenes/scene-01/scene-wireframe.bin",
    "studio/scenes/scene-01/scene-explorer-data.js",
    "studio/videos/scene-comparison.mp4",
    "studio/videos/sim2real.mp4",
    "studio/posters/scene-comparison.jpg",
    "studio/posters/sim2real.jpg",
    "architecture/target-mask-camera-v2.png",
    "architecture/target-depth-v3-transparent.png",
    "architecture/audit.gif",
    "architecture/place-render.gif",
    "architecture/fit.gif",
    "architecture/admit.gif",
    "architecture/retained.gif",
    "architecture/physics.gif",
    "architecture/scene-method/observation-wide.webp",
    "architecture/scene-method/observation-detail.webp",
    "architecture/scene-method/handoff-real.webp",
    "architecture/scene-method/handoff-sim.webp",
    "architecture/scene-method/object-real.webp",
    "architecture/scene-method/object-sim.webp",
    "architecture/scene-method/feedback-real.webp",
    "architecture/scene-method/feedback-sim.webp",
    "architecture/scene-method/scene-real.webp",
    "architecture/scene-method/scene-sim.webp",
    "architecture/scene-method/robot-scene.webp",
    "architecture/icons/camera.png",
    "architecture/icons/gear.png",
    "architecture/icons/robot.png",
    "architecture/icons/wrench.png",
    "architecture/icons/code-document.png",
    "architecture/icons/database.png",
    "architecture/icons/target.png",
    "architecture/icons/magnifier.png",
    "architecture/icons/transform.png",
    "architecture/icons/parameter-cube.png",
    "architecture/icons/check.png",
    "architecture/icons/bar-chart.png",
    "architecture/icons/checklist.png",
    "architecture/icons/layers.png",
    "architecture/icons/puzzle.png",
    "architecture/icons/physics-arm.png",
    "batch5_collision_references_image3/10449_image_3.png",
    "batch5_collision_references_image3/8994_image_3.png",
    "batch5_collision_references_image3/101917_image_3.png",
    "batch5_collision_references_image3/101463_image_3.png",
    "batch5_collision_references_image3/103967_image_3.png",
    "reference_image_3_5ids/reference_image_3/100520.png",
    "reference_image_3_5ids/reference_image_3/100842.png",
    "reference_image_3_5ids/reference_image_3/101052.png",
    "reference_image_3_5ids/reference_image_3/101220.png",
    "reference_image_3_5ids/reference_image_3/101284.png",
]
def copy(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
def build():
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()
    for name in PAGE_FILES:
        copy(ROOT / "preview" / name, OUTPUT / name)
    for name in VENDOR_FILES:
        copy(ROOT / "preview/vendor" / name, OUTPUT / "vendor" / name)
    for name in ["neoworld-nw-small.svg", "neoworld-favicon.svg"]:
        copy(ROOT / "preview/brand" / name, OUTPUT / "brand" / name)
    for name in ASSET_FILES:
        copy(ROOT / "assets" / name, OUTPUT / "assets" / name)
    index = OUTPUT / "index.html"
    index.write_text(index.read_text(encoding="utf-8").replace('name="asset-mode" content="source"', 'name="asset-mode" content="bundle"').replace('../assets/', './assets/'), encoding="utf-8")
    source = ROOT / "assets/batch5_collision_urdf_textured"
    for path in source.rglob("*"):
        if path.is_file():
            if path.suffix.lower() == ".png" and path.with_suffix(".webp").exists():
                continue
            target = OUTPUT / "assets/batch5_collision_urdf_textured" / path.relative_to(source)
            copy(path, target)
            if path.suffix.lower() == ".obj":
                target.with_suffix(target.suffix + ".gz").write_bytes(gzip.compress(path.read_bytes(), compresslevel=9, mtime=0))
    for folder in sorted(path for path in source.iterdir() if path.is_dir()):
        text_files, binary_files = {}, {}
        for path in folder.rglob("*"):
            if not path.is_file() or (path.suffix.lower() == ".png" and path.with_suffix(".webp").exists()):
                continue
            key = path.relative_to(folder).as_posix()
            if path.suffix.lower() in {".urdf", ".obj", ".mtl"}:
                text_files[key] = path.read_text(encoding="utf-8")
            elif path.suffix.lower() in {".png", ".webp"}:
                binary_files[key] = base64.b64encode(path.read_bytes()).decode("ascii")
        bundle = json.dumps({"text": text_files, "binary": binary_files}, separators=(",", ":")).encode()
        target = OUTPUT / "assets/batch5_collision_urdf_textured" / folder.name / f"{folder.name}.bundle.gz"
        target.write_bytes(gzip.compress(bundle, compresslevel=9, mtime=0))
    (OUTPUT / ".nojekyll").touch()
    files = [p for p in OUTPUT.rglob("*") if p.is_file()]
    print(f"GitHub Pages bundle: {len(files)} files, {sum(p.stat().st_size for p in files) / 1024 / 1024:.2f} MiB -> {OUTPUT}")
if __name__ == "__main__":
    build()
