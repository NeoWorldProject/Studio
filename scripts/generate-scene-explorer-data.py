"""Build the lazy Scene 01 browser payload used by the file:// preview.

The browser cannot fetch a GLB or JSON beside a local HTML file, so the
interactive viewer loads this generated JavaScript asset on demand instead.
"""

from base64 import b64encode
from json import dumps, loads
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCENE = ROOT / "assets/studio/scenes/scene-01/scene.glb"
RECORD = ROOT / "assets/studio/scenes/scene-01/scene-record.json"
DRACO_WRAPPER = ROOT / "preview/vendor/draco/draco_wasm_wrapper.js"
DRACO_WASM = ROOT / "preview/vendor/draco/draco_decoder.wasm"
OUTPUT = ROOT / "assets/studio/scenes/scene-01/scene-explorer-data.js"


def encode(path: Path) -> str:
    return b64encode(path.read_bytes()).decode("ascii")


def build() -> None:
    payload = {
        "glbBase64": encode(SCENE),
        "record": loads(RECORD.read_text(encoding="utf-8")),
        "dracoWrapper": DRACO_WRAPPER.read_text(encoding="utf-8"),
        "dracoWasmBase64": encode(DRACO_WASM),
    }
    OUTPUT.write_text(
        "window.NW_SCENE01_DATA="
        + dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Scene explorer payload: {OUTPUT.stat().st_size / 1024 / 1024:.2f} MiB -> {OUTPUT}")


if __name__ == "__main__":
    build()
