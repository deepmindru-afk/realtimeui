"""The autocompletions service as an ASGI app — the deployable version.

    pip install -r examples/requirements.txt
    uvicorn serve_fastapi:app --app-dir examples --port 8787

Identical behaviour to `serve_stdlib.py`: both call `read_source()` and
`build_payload()` from `completions.py`, so there is exactly one definition of the
contract and exactly one place that decides what to do with a bad entry. Swapping
runtimes changes how the bytes get out, not what they contain.

What the framework buys, and what it does not
---------------------------------------------

Routing, JSON serialisation and content negotiation are the reason to use it —
none of which the app cares about, because the app sends a bare `GET` and reads
`{samples, commands}`. Everything that *is* load-bearing for the app is in
`completions.py` and has nothing to do with the web framework, which is the
useful thing to notice when you point this at a real service.

Caching headers are set explicitly even though the app already sends
`Cache-Control: no-store` on the response it forwards. The app's header protects
the browser from its own cache; this one protects an intermediary in front of
this service from answering with last week's questions. Two hops, two headers.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse

from completions import build_payload, read_source

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("completions")

app = FastAPI(
    title="Portal autocompletions",
    version="1.0.0",
    description=(
        "Serves the composer's sample questions and slash commands. Read by the "
        "web app's /api/autocomplete route, which reads AUTOCOMPLETE_API_URL and "
        "proxies this."
    ),
)

NO_STORE = {"Cache-Control": "no-store"}


@app.get("/", include_in_schema=False)
def index() -> dict[str, str]:
    return {"service": "completions", "try": "/completions"}


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict[str, Any]:
    """Whether the file parses, which the menu depends on and a 200 alone does not.

    Worth having as its own path: a service that starts and then cannot read its
    data is up, and the only symptom from the browser is a menu that stopped
    changing.
    """
    try:
        payload = build_payload(read_source())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "error": str(error)},
            headers=NO_STORE,
        )
    return {"ok": True, "samples": len(payload["samples"]), "commands": len(payload["commands"])}


@app.get("/completions")
def completions(response: Response) -> dict[str, list[dict[str, str]]]:
    """The two corpora, re-read from `completions.json` on every request."""
    response.headers.update(NO_STORE)
    # Raises on a missing or malformed file rather than answering with the last
    # good payload. See the same branch in `serve_stdlib.py` for why: a silent
    # stale menu is worse than a visible failure.
    return build_payload(read_source())
