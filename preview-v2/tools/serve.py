"""Local preview server for the v2 redesign.

Serves preview-v2/ at / and maps /assets/ to the project-level assets/
directory (same layout as scripts/preview-server.py, different port so the
original preview on 8765 can run side by side).

    python preview-v2/tools/serve.py            # http://127.0.0.1:8766/
    python preview-v2/tools/serve.py --port 9000
"""
import argparse
import functools
import http.server
import mimetypes
import posixpath
import urllib.parse
from pathlib import Path

V2 = Path(__file__).resolve().parents[1]
ROOT = V2.parent
ASSETS = ROOT / 'assets'

mimetypes.add_type('application/wasm', '.wasm')
mimetypes.add_type('model/gltf-binary', '.glb')
mimetypes.add_type('font/woff2', '.woff2')
mimetypes.add_type('image/webp', '.webp')


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = urllib.parse.unquote(urllib.parse.urlsplit(path).path)
        parts = [p for p in posixpath.normpath(path).split('/') if p and p not in ('.', '..')]
        if parts and parts[0] == 'assets':
            return str(ASSETS.joinpath(*parts[1:]))
        return str(V2.joinpath(*parts))

    def end_headers(self):
        # No caching while iterating on the redesign.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), functools.partial(Handler, directory=str(V2)))
    print(f'NeoWorld v2 preview: http://127.0.0.1:{args.port}/')
    server.serve_forever()


if __name__ == '__main__':
    main()
