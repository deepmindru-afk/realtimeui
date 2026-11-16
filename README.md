# Fieldwork Assistant — LiveKit Cloud chat + voice app

A LiveKit Cloud app: a Next.js frontend plus a Python voice/text agent. Voice and text
share one conversation — the agent joins the same room, speaks, and replies to chat.

## Architecture

- The web app requests a token from `/api/token`, issuing an `AccessToken` whose
  `roomConfig` auto-dispatches the agent named `fieldwork-assistant` into the room.
- The web app connects to the room; the Python agent worker joins the same room.
- Text chat travels over the `lk.chat` text stream (plain text, built into
  `AgentSession` — no custom data handlers needed).
- Agent state is published on participant attribute `lk.agent.state`.
- Transcripts are published on `lk.transcription`.
- The agent exposes a `get_user_location` tool. A Python worker has no
  `navigator.geolocation`, so the tool is not answered locally: the agent
  fulfils it with an RPC call back to the browser, which reads the position and
  replies. See [Geolocation](#geolocation) below.
- The room, participant name, and identity can be named in the page URL. See
  [Choosing a connection](#choosing-a-connection) below.

## Choosing a connection

A page URL can name the room and the participant before the app connects:

```
/?room=alpha&user=Alice&identity=alice-1
```

| Param       | Names              | Effect when absent                      |
| ----------- | ------------------ | --------------------------------------- |
| `room`      | the room           | a fresh `va_room_*`, unique per page load |
| `user`      | the participant name | a random `user-<uuid>` name            |
| `identity`  | the participant identity | a random `user-<uuid>` identity   |

`name` is accepted as an alias for `user`; `user` wins if both are given. The
participant is fixed for the life of the page — `reset()` moves to a new room
without re-reading the URL, so a link cannot change who you are mid-session.
Room resolution lives in `src/lib/livekit/connection-params.ts`, shared by the
transport and the host component so the room joined and the room shown in the
session list cannot drift apart.

## Geolocation

The agent knows nothing about where the user is. When the model decides an
answer depends on the user's position, it calls the `get_user_location` tool
(`agent/agent.py`), and the agent fulfils that call by performing an RPC
request against the browser participant. The browser answers it with
`navigator.geolocation` (`src/lib/livekit/geolocation-rpc.ts`) and returns the
fix. This follows LiveKit's
[tool forwarding](https://docs.livekit.io/agents/logic/tools/forwarding/) pattern.

The assistant only calls this tool when location actually matters, and only
reports a coordinate it got back — it never guesses one. Browsers ask the user
for permission, and a refusal is reported to the model as a normal outcome
rather than an error.

## Autocompletion

The chat input completes what you are typing. It completes from three things —
the sample questions, the slash commands, and a model — and the first two come
from a service you point at with `AUTOCOMPLETE_API_URL`.

Both local corpora are fetched once per page load by `/api/autocomplete`, which
reads that variable on the server and proxies the answer, and one array feeds
both the empty-state chips and the suggestion list — so a starter you can click
is a starter you can also complete toward. `src/lib/completion/sources.ts` is the
shared contract: it validates whatever the service returned, and it is the one
place that decides what to do with anything it could not use.

The service is optional, and its absence is not a failure mode:

| Situation | What the composer completes from |
| --- | --- |
| `AUTOCOMPLETE_API_URL` unset | the bundled corpora in `src/lib/completion/` |
| service unreachable, slow, or not JSON | the bundled corpora |
| service sends samples but no commands | its samples, the bundled commands |
| an entry with no `question`, or a `key` that cannot be typed | that entry is dropped |

The route always answers `200` with both keys present and non-empty, so a
deployment with no service behaves exactly as it did before this existed. A
sample without a question is dropped because the question *is* the sample — it
is what gets written into the composer — and a command whose key `parseCommand`
could never match is dropped because it would be a menu entry that does nothing
when pressed.

The URL is a server-side variable on purpose. A `NEXT_PUBLIC_` name would be
readable by the browser and would freeze the answer into the bundle, making a
change of questions a rebuild — the same argument `feature-flags` makes about
`SHOW_FEEDBACK`. The indirection through the route also means the browser never
learns where the service lives.

`examples/` is a working service, in Python, that reads its corpora from a JSON
file and re-reads it per request: edit a question, reload the browser. It exists
to make the contract runnable before you trust it with real questions, and to show
which malformed entries the app drops silently.

Exactly one suggestion surface is ever live, and which one follows from what the
draft matched:

| Draft | Surface | Keys |
| --- | --- | --- |
| matches one suggestion that continues it | ghost text at the caret | `Tab` or `→` takes it, `Esc` dismisses |
| matches two or more suggestions | a list over the composer | `↑` `↓` move, `Enter` or `Tab` takes the row, `Esc` dismisses |
| matches nothing | a ghost from `/api/complete`, if one is configured | `Tab` or `→` takes it |

They never appear together, which is the point: two suggestions on one screen is
two answers to "what does `Tab` do", and a key that means different things
depending on which source answered last is a key nobody trusts. `Enter` only
takes a row while the list is up — with nothing suggested it sends, as it always
did.

### Commands

A draft that starts with `/` completes against the slash commands instead,
through the same surface and the same keys. `/` on its own opens the list;
`/summ` narrows it to one and puts the rest of the name at the caret.

The bundled set is six commands, all of them something `agent/agent.py` already
says it can do — a command the agent could not fulfil would be a menu of
promises:

| Command | Asks for |
| --- | --- |
| `/summary` | a short retelling of the notes |
| `/changes` | what the observations propose changing |
| `/evidence` | what the notes actually say, quoted |
| `/compare` | observations across the three projects, and where they differ |
| `/gaps` | what the notes do not cover |
| `/where` | your coordinates, which the agent asks the browser for |

A command is a prefix for a question, not a question: picking one writes
`/summary ` and leaves the sentence to you. Sent on its own, a bare command is
expanded into the question it stands for before it reaches the room — the agent
has never heard of a slash token, and a transcript reading `/summary` above an
answer to a sentence is a turn that does not match its own reply. A command
arriving from the service with no `prompt` is not expanded, because the send path
treats an empty question as nothing to send.

The slash is only a command at the very start of the draft. The `PromptBar`
reference under `beautiful-ui/original` matches a slash anywhere, which is safe
for a static demo and wrong here: mid-sentence a slash is far more often part of
a date, a ratio, a path, or a URL.

The first two sources need no model. The third is the only one that needs
configuration: set `AI_GATEWAY_API_KEY` and `/api/complete` fills the ghost for a
draft that is your own rather than one of the samples. Leave it unset and the
local corpora still complete, the route answers `503 { state: "off" }`, and the
composer falls back to no ghost — a completion is decoration on top of a feature
that already works, so nothing about it is fatal.

Suggestions stop while the agent is answering or a note is uploading, because
both make the send button unavailable, and a suggestion that offers to change the
draft at the moment it cannot be sent is one that appears to work and then does
not.

The wire contract is shared by both processes and must stay in sync:

| Direction | Value                                                        |
| --------- | ------------------------------------------------------------ |
| Method    | `getUserLocation`                                             |
| Request   | `{"highAccuracy": <bool>}` — JSON string                       |
| Response  | `{"latitude": <num>, "longitude": <num>, "accuracy": <num>}`  |
| Timeout   | 10s when high accuracy is requested, otherwise 5s              |

`useLiveKitChat` exposes the most recent fix as `lastLocation` so a UI layer can
show it. Nothing renders it yet.

## Tests

```bash
# browser RPC handler + geolocation logic
npm test

# agent tool: participant selection, payload, timeouts, failure paths
cd agent && python -m pytest
```

Both suites are pure unit tests — no LiveKit room is required. The agent suite
lives in `agent/tests/` and needs the dev extra:

```bash
cd agent
pip install -r requirements-dev.txt   # runtime deps + pytest
```

## Requirements

- Node.js 20+
- Python 3.11+
- A LiveKit Cloud project (https://cloud.livekit.io)

## Quickstart (web)

```bash
npm install
cp .env.example .env.local
# fill in LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET from cloud.livekit.io
npm run dev
```

## Running the agent locally

```bash
cd agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Set the same `LIVEKIT_*` env vars (or copy `.env.local` into `agent/` and let
`python-dotenv` load it — `agent.py` calls `load_dotenv()`, so a `.env.local` in the
`agent/` cwd works too). Then start the worker with your Python:

```bash
python agent.py
```

### Development with the LiveKit CLI

With the LiveKit CLI installed:

```bash
cd agent
lk agent dev
```

The CLI generates/uses `.env.local` in `agent/`.

### Production (Docker)

```bash
docker build -t fieldwork-agent agent
docker run --env-file <(grep '^LIVEKIT' .env.local) fieldwork-agent
```

## Environment variables

| Variable            | Required | Default             | Notes                                            |
| ------------------- | -------- | ------------------- | ------------------------------------------------ |
| `LIVEKIT_URL`       | yes      | —                   | `wss://<project>.livekit.cloud` from LiveKit Cloud |
| `LIVEKIT_API_KEY`   | yes      | —                   | LiveKit Cloud project API key                     |
| `LIVEKIT_API_SECRET`| yes      | —                   | LiveKit Cloud project API secret                  |
| `LIVEKIT_ROOM`      | no       | random `va_room_*`  | Pins the default room. Leave unset for a fresh room per page load |
| `LIVEKIT_AGENT_NAME`| no       | `fieldwork-assistant` | Agent worker name — must match what the web token dispatches |
| `AI_GATEWAY_API_KEY`| no      | —                     | Model key for the composer's ghost text. Unset leaves the local corpora working with no ghost for a draft of your own |
| `AUTOCOMPLETE_MODEL`| no       | `openai/gpt-4o-mini`  | Which model `/api/complete` calls, in `provider/model` form |
| `AUTOCOMPLETE_API_URL` | no    | bundled corpora       | http(s) URL serving the composer's sample questions and slash commands. Unset, unreachable or unusable leaves the bundled set in place |

**Note:** agent auto-dispatch happens when the web app creates the room. If your agent
registers under a different name, set `LIVEKIT_AGENT_NAME` accordingly so the worker
subscribes to the room that the token dispatches.