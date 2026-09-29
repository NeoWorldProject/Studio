"""Derive web-optimized copies of the heavier source assets for the v2 page.

Sources in ../assets stay untouched; outputs go to preview-v2/optimized/.

    python preview-v2/tools/optimize-assets.py

- icons/*.webp          96 px WebP (the figure shows them at 30-44 CSS px)
- references/{id}.webp  512 px WebP reference photos for the object viewer
- posters/*.webp        video posters, resized for the article column
- scene-wireframe.nwf2(.gz)
      Deduplicated, uint16-quantized, indexed version of scene-wireframe.bin.
      Segments are ordered bottom-up so the hero can "draw" the scene in by
      growing the index range.
- videos/*.mp4          H.264 re-encodes (needs ffmpeg on PATH or `pip install imageio-ffmpeg`;
                        skipped with --skip-video)

NWF2 layout (little endian unless noted):
    0   uint32 BE  magic 0x4e574632 ("NWF2")
    4   uint32     vertex count
    8   uint32     accent index count
    12  uint32     structure index count
    16  float32[6] quantization bounds min xyz, max xyz (= scene bounds)
    40  float32[6] accent (focus) bounds min xyz, max xyz
    64  uint16[vertexCount*3] quantized positions, padded to 4 bytes
    ... uint16|uint32 indices (uint16 when vertexCount < 65536), accent first
"""
import gzip
import shutil
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

V2 = Path(__file__).resolve().parents[1]
ROOT = V2.parent
ASSETS = ROOT / 'assets'
OUT = V2 / 'optimized'

ICONS = ['camera', 'target', 'gear', 'robot', 'wrench', 'database', 'checklist', 'layers', 'physics-arm']
REFERENCES = {
    **{i: f'batch5_collision_references_image3/{i}_image_3.png' for i in ['10449', '8994', '101917', '101463', '103967']},
    **{i: f'reference_image_3_5ids/reference_image_3/{i}.png' for i in ['100520', '100842', '101052', '101220', '101284']},
}
POSTERS = {'scene-comparison': 1600, 'sim2real': 1000}


def report(label, source, target):
    before, after = source.stat().st_size, target.stat().st_size
    print(f'  {label:<34} {before / 1024:8.1f} KB -> {after / 1024:7.1f} KB')
    return before, after


def images():
    totals = [0, 0]
    (OUT / 'icons').mkdir(parents=True, exist_ok=True)
    (OUT / 'references').mkdir(parents=True, exist_ok=True)
    (OUT / 'posters').mkdir(parents=True, exist_ok=True)
    print('icons')
    for name in ICONS:
        source = ASSETS / 'architecture/icons' / f'{name}.png'
        target = OUT / 'icons' / f'{name}.webp'
        Image.open(source).convert('RGBA').resize((96, 96), Image.LANCZOS).save(target, 'WEBP', quality=88, method=6)
        totals = [a + b for a, b in zip(totals, report(name, source, target))]
    print('references')
    for key, path in REFERENCES.items():
        source = ASSETS / path
        target = OUT / 'references' / f'{key}.webp'
        Image.open(source).convert('RGB').save(target, 'WEBP', quality=86, method=6)
        totals = [a + b for a, b in zip(totals, report(key, source, target))]
    print('posters')
    for name, width in POSTERS.items():
        source = ASSETS / 'studio/posters' / f'{name}.jpg'
        target = OUT / 'posters' / f'{name}.webp'
        image = Image.open(source).convert('RGB')
        height = round(image.height * width / image.width)
        image.resize((width, height), Image.LANCZOS).save(target, 'WEBP', quality=80, method=6)
        totals = [a + b for a, b in zip(totals, report(f'{name} ({width}x{height})', source, target))]
    return totals


def wireframe():
    source = ASSETS / 'studio/scenes/scene-01/scene-wireframe.bin'
    data = source.read_bytes()
    if struct.unpack('>I', data[:4])[0] != 0x4E574631:
        raise SystemExit('unexpected wireframe header')
    accent_count, structure_count = struct.unpack('<II', data[4:12])
    positions = np.frombuffer(data, dtype='<f4', offset=12, count=(accent_count + structure_count) * 3).reshape(-1, 3)
    lo, hi = positions.min(0), positions.max(0)
    accent = positions[:accent_count]
    accent_lo, accent_hi = (accent.min(0), accent.max(0)) if accent_count else (lo, hi)

    span = np.where(hi - lo > 0, hi - lo, 1)
    quantized = np.round((positions - lo) / span * 65535).astype('<u2')
    unique, inverse = np.unique(quantized, axis=0, return_inverse=True)
    inverse = inverse.reshape(-1)

    def ordered(first, count):
        # Draw-on order: bottom-up by segment midpoint height, then outward from the centre.
        segments = inverse[first:first + count].reshape(-1, 2)
        points = unique[segments].astype(np.float64) / 65535 * span + lo
        mid = points.mean(1)
        centre = (accent_lo + accent_hi) / 2
        key = (mid[:, 1] - lo[1]) + 0.18 * np.hypot(mid[:, 0] - centre[0], mid[:, 2] - centre[2])
        return segments[np.argsort(key, kind='stable')].reshape(-1)

    accent_indices = ordered(0, accent_count)
    structure_indices = ordered(accent_count, structure_count)
    index_type = '<u2' if len(unique) < 65536 else '<u4'
    header = struct.pack('>I', 0x4E574632) + struct.pack('<III', len(unique), len(accent_indices), len(structure_indices))
    header += struct.pack('<6f', *lo, *hi) + struct.pack('<6f', *accent_lo, *accent_hi)
    body = unique.tobytes()
    body += b'\0' * (-len(body) % 4)
    body += np.concatenate([accent_indices, structure_indices]).astype(index_type).tobytes()
    target = OUT / 'scene-wireframe.nwf2'
    target.write_bytes(header + body)
    target.with_suffix('.nwf2.gz').write_bytes(gzip.compress(header + body, compresslevel=9, mtime=0))
    print('wireframe')
    print(f'  vertices {accent_count + structure_count} -> {len(unique)} unique, max quantization error {float((span / 65535 / 2).max()):.2e}')
    report('scene-wireframe.nwf2', source, target)
    return report('scene-wireframe.nwf2.gz', source, target.with_suffix('.nwf2.gz'))


def find_ffmpeg():
    found = shutil.which('ffmpeg')
    if found:
        return found
    try:
        import imageio_ffmpeg  # pip install imageio-ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return None


def videos():
    # H.264 High / yuv420p / faststart plays everywhere. The original sim2real clip is HEVC and
    # smaller; the page lists it first and uses this H.264 file as the fallback source.
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print('videos: ffmpeg not found (pip install imageio-ffmpeg); keeping original files')
        return
    (OUT / 'videos').mkdir(exist_ok=True)
    print('videos')
    for name, width, fps, crf in [('scene-comparison', 1600, 30, 22), ('sim2real', 1000, None, 28)]:
        source = ASSETS / 'studio/videos' / f'{name}.mp4'
        target = OUT / 'videos' / f'{name}.mp4'
        scale = f'scale={width}:-2:flags=lanczos' + (f',fps={fps}' if fps else '')
        subprocess.run([
            ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
            '-vf', scale, '-c:v', 'libx264', '-preset', 'slow',
            '-crf', str(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', str(target),
        ], check=True)
        report(name, source, target)


def main():
    OUT.mkdir(exist_ok=True)
    before, after = images()
    wireframe()
    print(f'images total {before / 1024:.0f} KB -> {after / 1024:.0f} KB')
    if '--skip-video' not in sys.argv:
        videos()


if __name__ == '__main__':
    main()
