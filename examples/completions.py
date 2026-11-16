"""The autocompletions contract, and the one function that produces a valid answer.

The web app points `AUTOCOMPLETE_API_URL` at a service like this one. The browser
never calls it: `GET /api/autocomplete` in the Next app reads the variable,
proxies this, validates what comes back, and hands the composer two arrays. So
everything here is about producing a body that survives that validation.

The two arrays
--------------

`samples` are the starter questions. A suggestion is a question to ask, not a
body of evidence to paste, so a sample is a question and two labels:

    {"id": "handoff", "question": "Что должно войти в передачу?",
     "title": "Передача исследования", "subtitle": "Продуктовая команда · бриф"}

Only `question` is required — it is what gets written into the composer, and a
sample without one is dropped by the app, because a row that writes nothing is a
row that lies about what picking it does. `title` and `subtitle` are the two
labels shown beside the question; omit them and the row is shorter, not missing.

`commands` are the slash commands:

    {"key": "gaps", "hint": "Чего в заметках нет", "prompt": "Чего не хватает?"}

`key` is required and must be typeable: the app's parser only recognises
`/([\\w-]*)`, so a key containing a space, a dot or a Cyrillic character is
dropped as a menu entry that can never be reached by keyboard. A leading slash is
stripped and the key lowercased before that check, so `"/Gaps"` is fine. Note the
Cyrillic: the questions here are Russian, but JavaScript's `\\w` is ASCII-only, so
`"пробелы"` is not a usable command name even though Python would say otherwise.
`prompt` is what a bare `/gaps` expands into at send time — omit it and the
command is not expanded, because the send path reads an empty question as nothing
to send.

The envelope
------------

`{"samples": [...], "commands": [...]}` is the documented shape and the only one
that can carry both. A bare JSON array is also read, as a list of samples, so a
service whose entire job is "these are the questions" does not have to know this
app's field names.

`completions.json` is the source of truth and is re-read on every request, so
editing a question and reloading the browser is the whole deployment story. That
is the reason the corpora moved off the bundle at all.

Why the linter
--------------

`build_payload` applies the same rules the app applies and logs anything it would
drop, because every one of those drops is otherwise silent. The app is
deliberately forgiving — a malformed entry is skipped rather than failing the
request, so a typo cannot take the menu down — which means a service that has
been wrong for a week looks exactly like a service that is working. A service
that says so on startup is the difference between a five-second fix and an
afternoon.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

logger = logging.getLogger("completions")

#: The file this service serves, re-read per request. Edit it, reload the page.
DEFAULT_PATH = Path(__file__).with_name("completions.json")

# `parseCommand`'s own character class, copied rather than loosened. `re.ASCII`
# is load-bearing: without it Python's `\w` matches Cyrillic and the app's does
# not — JavaScript's `\w` is always `[A-Za-z0-9_]` — so a command keyed `пробелы`
# would pass here, be accepted by this service, and then be silently dropped by
# the app as a name the parser can never match. That is the one divergence worth
# being paranoid about, because it is invisible from the browser: the command
# simply does not appear in the menu, and the service looks healthy.
TYPABLE_KEY = re.compile(r"^[\w-]+$", re.ASCII)

# The app's own ceilings, mirrored. These are a bound on a menu, not on data:
# `matchSamples` re-runs over every sample on every keystroke and the suggestion
# list renders whatever survives, so a service that returns ten thousand questions
# gets a composer that stops responding rather than an error.
MAX_SAMPLES = 200
MAX_COMMANDS = 60

# The app reads at most 64KB of this body, and the read is all-or-nothing: an
# oversized response is not truncated, it is rejected outright. So this is the one
# limit worth failing loudly on rather than trimming to fit.
MAX_BYTES = 64 * 1024


def read_source(path: Path = DEFAULT_PATH) -> Any:
    """The file's contents, as parsed JSON.

    Raises rather than returning a sentinel: this is the example's one piece of
    genuine I/O, and a handler that swallowed a missing file or a comma would
    serve an empty menu and look like a working service.
    """
    return json.loads(path.read_text(encoding="utf-8"))


def build_payload(raw: Any) -> dict[str, list[dict[str, str]]]:
    """A response body the app will accept, and nothing else.

    Liberal about the envelope, strict about the contents — the same split the app
    makes. A bare array is read as samples. Entries that cannot work are dropped
    with a warning, duplicates by what the operator would see, and anything past
    the caps is cut. The result always has both keys.
    """
    if isinstance(raw, list):
        raw = {"samples": raw}
    if not isinstance(raw, dict):
        raise ValueError(
            f"expected an object with `samples` and/or `commands`, or a bare array; "
            f"got {type(raw).__name__}"
        )

    samples = _clean(
        raw.get("samples"),
        _clean_sample,
        MAX_SAMPLES,
        "sample",
        fingerprint=lambda s: s["question"],
    )
    commands = _clean(
        raw.get("commands"),
        _clean_command,
        MAX_COMMANDS,
        "command",
        fingerprint=lambda c: c["key"],
    )

    payload = {"samples": samples, "commands": commands}
    _check_size(payload)
    return payload


def _clean_sample(row: Any, index: int) -> dict[str, str] | None:
    """One sample, or None if the app would drop it.

    The id is the list's React key and nothing else — matching is by text — so a
    missing one is made up rather than rejected, and the title and subtitle are
    decoration that may be absent. The stand-in is the row's position rather than
    a hash of its text: `hash()` is salted per process, so a hashed id changes on
    every restart and React rebuilds the whole list for no reason.
    """
    if not isinstance(row, dict):
        _drop("sample", row, "not an object")
        return None
    question = _text(row.get("question"))
    if not question:
        _drop("sample", row, "no `question`")
        return None
    return {
        "id": _text(row.get("id")) or f"sample-{index}",
        "question": question,
        "title": _text(row.get("title")),
        "subtitle": _text(row.get("subtitle")),
    }


def _clean_command(row: Any, index: int) -> dict[str, str] | None:
    """One command, or None if the app would drop it."""
    if not isinstance(row, dict):
        _drop("command", row, "not an object")
        return None
    # The slash and the case are stripped before the check, not after: the app
    # lowercases a candidate against a lowercased draft, so `"/Summary"` would
    # otherwise be a command it can never match.
    key = _text(row.get("key")).lstrip("/").lower()
    if not TYPABLE_KEY.match(key):
        _drop("command", row, f"`{key}` is not typeable as a command name")
        return None
    return {
        "key": key,
        "hint": _text(row.get("hint")),
        # A command with no prompt is still a menu entry: the operator gets the
        # name and the space and writes the sentence themselves. It is simply not
        # expandable, which the app accounts for.
        "prompt": _text(row.get("prompt")),
    }


def _clean(
    rows: Any,
    build: Callable[[Any, int], dict[str, str] | None],
    limit: int,
    label: str,
    fingerprint: Callable[[dict[str, str]], str],
) -> list[dict[str, str]]:
    """`rows` through `build`, dropping what it rejects, duplicates and overflow."""
    if rows is None:
        return []
    if not isinstance(rows, list):
        logger.warning("%r was a %s, not a list; ignored", label, type(rows).__name__)
        return []

    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for index, row in enumerate(rows):
        built = build(row, index)
        if built is None:
            continue
        # Deduplicated on what the operator would see, not on the id: two rows
        # with the same question offer the same thing twice and take the same
        # splice to accept, so the second is noise.
        key = fingerprint(built)
        if key in seen:
            logger.warning("dropped a duplicate %s %r", label, key)
            continue
        seen.add(key)
        out.append(built)

    if len(out) > limit:
        logger.warning(
            "%d %ss sent, %d kept: the app caps a menu at %d and would cut the rest",
            len(out),
            label,
            limit,
            limit,
        )
        out = out[:limit]
    return out


def _check_size(payload: dict[str, list[dict[str, str]]]) -> None:
    """Warn when the body is over what the app will read at all.

    The one check that is genuinely dangerous, because the app's read is
    all-or-nothing: past 64KB it does not take the first N samples, it rejects
    the response and falls back to its bundled corpora. So a service that grew
    past the limit keeps serving and the menu quietly stops changing.
    """
    size = len(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    if size > MAX_BYTES:
        logger.error(
            "response is %d bytes, over the app's %d limit: it will be rejected "
            "outright and the bundled corpora used instead",
            size,
            MAX_BYTES,
        )


def _text(value: Any) -> str:
    """A trimmed string, or `""` for anything that is not one."""
    return value.strip() if isinstance(value, str) else ""


def _drop(label: str, row: Any, why: str) -> None:
    """Say what the app would have dropped, and why.

    On the server's log rather than in the response, on purpose: the app treats
    every one of these as a reason to skip an entry rather than to fail the
    request, which is what keeps a typo from taking the whole menu down — and
    which also means a bad entry is invisible to whoever is using it. Someone
    watching this log is the only way it gets noticed.
    """
    logger.warning("dropped a %s (%s): %r", label, why, row)
