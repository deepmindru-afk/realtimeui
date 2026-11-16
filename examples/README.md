# Autocompletions service

A working example of the service behind `AUTOCOMPLETE_API_URL` — the thing the
chat input completes from. The app's own corpora used to be arrays in the bundle,
which meant changing a question was a commit and a release. They are now data, and
this is a data source you can edit.

```
completions.py      the contract, and the file loader — no dependencies
serve_stdlib.py     the service, on the standard library — no install
serve_fastapi.py    the same service as an ASGI app, for something deployable
completions.json    the questions and commands; this is the file you edit
```

## Run it

The standard library version needs nothing installed:

```bash
python examples/serve_stdlib.py
# → http://127.0.0.1:8787/completions
```

Or the ASGI version:

```bash
pip install -r examples/requirements.txt
uvicorn serve_fastapi:app --app-dir examples --port 8787
```

Then point the app at it and start it:

```bash
AUTOCOMPLETE_API_URL=http://127.0.0.1:8787/completions npm run dev
```

Now edit `examples/completions.json` and reload the browser. No restart, no
rebuild, no redeploy — which is the whole reason the corpora moved.

Leave `AUTOCOMPLETE_API_URL` unset and the app uses the corpora bundled in
`src/lib/completion/` instead. The two sets are identical, so pointing the service
at the file as shipped changes nothing you can see; that is deliberate, so you can
verify the wiring before you trust it with real questions.

## The contract

One `GET`, returning both arrays:

```json
{
  "samples": [
    { "id": "handoff", "title": "Передача исследования",
      "subtitle": "Продуктовая команда · бриф",
      "question": "Что должно войти в передачу?" }
  ],
  "commands": [
    { "key": "gaps", "hint": "Чего в заметках нет", "prompt": "Чего не хватает?" }
  ]
}
```

A bare JSON array is also read, as a list of samples — so a service whose entire
job is "these are the questions" does not have to know this app's field names.

| Field | Required | Notes |
| --- | --- | --- |
| `samples[].question` | yes | What gets written into the composer. No question, no sample. |
| `samples[].id` | no | The list's React key. Made up from the row's position if absent. |
| `samples[].title` / `.subtitle` | no | The labels shown beside the question. |
| `commands[].key` | yes | The token without its slash. A leading `/` is stripped and it is lowercased. |
| `commands[].hint` | no | One line: what picking it asks for. |
| `commands[].prompt` | no | What a bare `/key` expands into at send time. |

The browser never calls this service. `GET /api/autocomplete` in the Next app
reads `AUTOCOMPLETE_API_URL`, proxies this, and validates the answer — so the URL
stays a server-side secret, and nothing here is reachable from page JavaScript.
That is also why there are no CORS headers: there is no origin to allow.

## What the app drops, and why you want to know

The app is forgiving by design — a bad entry is skipped rather than failing the
request, so one typo cannot take the menu down. The cost is that a service which
has been wrong for a week looks exactly like a service that is working. So
`completions.py` applies the same rules and logs whatever it would drop:

```
WARNING completions: dropped a command (`пробелы` is not typeable as a command name): {...}
WARNING completions: dropped a sample (no `question`): {'title': 'no question'}
```

| Situation | What happens |
| --- | --- |
| sample with no `question` | dropped — a row that writes nothing is a row that lies about what picking it does |
| `key` that cannot be typed | dropped — the parser only recognises `/([\w-]*)`, so it is a menu entry that does nothing when pressed |
| `key` in Cyrillic | dropped, and this surprises people: the questions are Russian but JavaScript's `\w` is ASCII-only, so `пробелы` is not a usable command name. Python's `\w` is *not* ASCII-only, which is why `re.ASCII` is set on that pattern — without it this service would accept a command the app silently discards. |
| two samples with the same question | the second is dropped — it offers the same thing and takes the same splice to accept |
| more than 200 samples / 60 commands | cut at the cap — this is a bound on a menu, not on data: `matchSamples` re-runs over every sample on every keystroke |
| a corpus the service omits | the bundled one is used — so an endpoint that only knows about questions does not delete the command menu |
| anything else: unreachable, slow, not JSON | the bundled corpora, and the app's route still answers 200 |

Two limits worth watching, because they are the only ones that are not per-entry:

- **4 second timeout** on the app's fetch, then bundled corpora.
- **64KB** on the response body, and that one is all-or-nothing: past it the app
  does not take the first N samples, it rejects the response outright. A service
  that grows past the limit keeps serving happily and the menu quietly stops
  changing. `completions.py` warns at that boundary.

## Serving something real

`read_source()` is the only I/O in the example, and it is one `json.loads` of one
file. Swapping it for a database, a CMS, or a per-tenant lookup is the whole
change — the response shape, the cleaning, and the linter are already
framework-independent, and both runners call the same two functions so there is
one definition of the contract rather than two that drift.

Two things to keep if you do:

- **Re-read per request, or cache deliberately.** The app sends
  `Cache-Control: no-store` downstream, so anything this service holds has to be
  refreshed on its own terms or the menu goes stale with no visible cause.
- **Answer 200 with both keys present.** The app treats anything else as a failed
  request and quietly uses its bundled corpora, which means a deployment that
  looks fine and never picks up your questions.
