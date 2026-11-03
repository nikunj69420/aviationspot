"""Local dev server that tells the browser never to cache, so edits always show up.

Run from the project folder: python tools/serve.py   (then open http://localhost:5173)
"""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    http.server.ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
