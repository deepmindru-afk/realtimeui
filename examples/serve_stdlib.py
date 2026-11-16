"""The autocompletions service, on the standard library. No install step.

    python examples/serve_stdlib.py
    # → http://127.0.0.1:8787/completions

Then point the app at it:

    AUTOCOMPLETE_API_URL=http://127.0.0.1:8787/completions npm run dev

The whole service is this file plus `completions.py` and `completions.json`, and
that is the point: the contract is small enough to read in full before you install
anything, and `serve_fastapi.py` is the same two functions behind an ASGI app for
when you want one that is actually deployable.

`http.server` is not a production server, and this is not meant to be — it is here
so the JSON contract can be seen and run without a dependency. Reach for
`serve_fastapi.py` or a real WSGI/ASGI host for anything exposed to a network.

What this deliberately does not do is send CORS headers. The browser never calls
this service: the app's own `/api/autocomplete` route does, server-side, because
`AUTOCOMPLETE_API_URL` is a server-side variable. Nothing here is reachable from
page JavaScript, so there is no origin to allow.
"""

from __future__ import annotations

import json
import logging
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from completions import DEFAULT_PATH, build_payload, read_source

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("completions")

HOST = "127.0.0.1"
PORT = 8787


class Handler(BaseHTTPRequestHandler):
    """One GET, and one path. Everything else is a 404.

    The 404 is deliberate rather than a catch-all 200: a service that answers
    anything at any path is a service that can be pointed at by accident, and the
    app appends nothing to the configured URL — it fetches it exactly as written,
    so `/completions` has to be the whole story.
    """

    def do_GET(self) -> None:  # noqa: N802 - the name is BaseHTTPRequestHandler's
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path == "/":
            self._send(
                HTTPStatus.OK,
                {"service": "completions", "try": "/completions"},
            )
            return
        if path != "/completions":
            self._send(HTTPStatus.NOT_FOUND, {"error": f"no route for {path}"})
            return
        self._completions()

    def _completions(self) -> None:
        try:
            # Re-read per request, so editing `completions.json` and reloading the
            # browser is the entire deployment story. That is the reason the
            # corpora left the bundle: the menu is data, and data that only
            # changes on release is a menu nobody can correct.
            payload = build_payload(read_source())
        except FileNotFoundError:
            self._send(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "completions.json is missing"})
            return
        except (ValueError, json.JSONDecodeError) as error:
            # A malformed file is the one failure this service must not absorb.
            # Serving the last good payload would mean the app shows a menu that
            # no longer matches the file anyone is editing, and the mismatch is
            # invisible from the browser.
            logger.error("completions.json is not readable: %s", error)
            self._send(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})
            return
        self._send(HTTPStatus.OK, payload)

    def _send(self, status: HTTPStatus, body: dict) -> None:
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        # Cyrillic questions are the point, so the body is UTF-8 and says so —
        # a client that falls back to latin-1 gets mojibake rather than an error.
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, fmt: str, *args) -> None:
        """Route the access log through `logging`, so both streams interleave."""
        logger.info("%s %s", self.address_string(), fmt % args)


if __name__ == "__main__":
    logger.info("serving %s", DEFAULT_PATH)
    logger.info("point the app at it: AUTOCOMPLETE_API_URL=http://%s:%d/completions", HOST, PORT)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
