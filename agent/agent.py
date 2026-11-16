"""Fieldwork assistant — LiveKit agent worker (livekit-agents v1.x).

Joins a LiveKit Cloud room (auto-dispatched by the web token's roomConfig),
handles voice (STT -> LLM -> TTS) and text chat (lk.chat text stream) in one
AgentSession, grounded in the embedded field research notes.
"""

import json
import logging
import math
import os
from typing import Any

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    RunContext,
    TurnHandlingOptions,
    function_tool,
    get_job_context,
    inference,
    room_io,
)
from livekit.agents.llm import ToolError

load_dotenv()  # reads .env / .env.local / .env.local in the agent/ cwd

AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "fieldwork-assistant")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("fieldwork-assistant")

# Field research notes embedded from src/components/examples/research-workflow.ts
RESEARCH_CONTEXT = """
Research notes (grounding context — summarize these, never invent findings):

PROJECT: West dock interviews — "What is slowing down the handoff?"
- Operator interviews: Four of five operators enter the same shipment identifier twice:
  first on paper, then on a shared tablet. The tablet often arrives after the paper sheet.
- Shift-change observation: At both observed shift changes, operators checked the
  clipboard and tablet before confirming which shipment record was current.
- Workflow map: Paper, radio, and tablet steps each copy the shipment identifier.
  No step owns the canonical record. The team proposed confirming one record at
  intake and showing its sync status.

PROJECT: Wayfinding audit — "What should change in the station signs?"
- Arrival walk-through: Three visitors paused before the platform turn. Transfer signs
  compete with advertising at the decision point, and the destination label changes
  between signs.
- Signage review: Repeat the same destination label at eye level before each turn.
  Keep arrows together with the label and validate the route with first-time visitors.

PROJECT: Research handoff — "What needs to be in the handoff?"
- Team review: The product team needs observed behavior, interpretation, and open
  questions separated. Every finding should include a field-note reference and a
  named owner for validation.
- Next research round: Test the intake confirmation with two operators during one
  shift. Compare duplicate-entry frequency and ask each operator to identify the
  current shipment record.
"""

# Frozen contract shared with the web client. The browser registers an RPC method
# under exactly this name and answers with a JSON string; changing either side
# silently breaks location requests.
USER_LOCATION_RPC_METHOD = "getUserLocation"

# A high-accuracy fix asks the device to spin up its GPS receiver, which takes
# noticeably longer than a cached network fix, so it gets the longer budget.
HIGH_ACCURACY_RPC_TIMEOUT = 10.0
DEFAULT_RPC_TIMEOUT = 5.0


def _is_hidden(participant: Any) -> bool:
    """True when the participant must never be picked for an RPC.

    A participant with `permissions.hidden` is invisible to the rest of the
    room, so it cannot be addressed — and never answers RPC — even though the
    server still lists it in `room.remote_participants`.
    """
    return bool(getattr(getattr(participant, "permissions", None), "hidden", False))


def _pick_remote_participant(room: Any) -> Any | None:
    """First remote participant that can answer a location request."""
    participants = getattr(room, "remote_participants", None) or {}
    for participant in participants.values():
        if not _is_hidden(participant):
            return participant
    return None


def _finite_number(value: Any) -> float | None:
    """Coerce a decoded JSON value to a finite float, or None if it is not one.

    bool is rejected explicitly because it subclasses int: a `true` latitude is
    a malformed answer, not the coordinate 1.0.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        number = float(value)
    except (OverflowError, TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


async def request_user_location(high_accuracy: bool) -> dict:
    """Ask the browser participant for a geolocation fix and return it.

    The worker has no way to know where the user is; only the browser can read
    `navigator.geolocation`. Kept as a plain async helper so the logic is
    testable without going through the @function_tool decorator.

    Every failure is reported as a ToolError carrying a short, user-safe message:
    the model relays that text, so an internal exception must never reach it.
    """
    job_context = get_job_context(required=False)
    if job_context is None:
        raise ToolError(
            "There is no active session, so the user's location cannot be read. "
            "Ask them to try again once the session is live."
        )

    room = job_context.room
    participant = _pick_remote_participant(room)
    # An addressable identity is what perform_rpc routes on, so it doubles as
    # the eligibility check.
    identity = getattr(participant, "identity", None) if participant else None
    if not isinstance(identity, str) or not identity:
        raise ToolError(
            "No one in the session can share a location. Ask the user to grant "
            "location access and try again."
        )

    try:
        raw_response = await room.local_participant.perform_rpc(
            destination_identity=identity,
            method=USER_LOCATION_RPC_METHOD,
            payload=json.dumps({"highAccuracy": bool(high_accuracy)}),
            response_timeout=(
                HIGH_ACCURACY_RPC_TIMEOUT if high_accuracy else DEFAULT_RPC_TIMEOUT
            ),
        )
    except Exception:
        # perform_rpc raises on timeout, an unregistered method, or a
        # participant that has left; none of that is useful to the model.
        logger.warning("Location RPC to %s failed", identity, exc_info=True)
        raise ToolError(
            "The user did not share a location in time. They may have declined "
            "the permission prompt, or their device could not get a fix."
        ) from None

    try:
        response = json.loads(raw_response)
        if not isinstance(response, dict):
            raise ValueError("payload is not a JSON object")
    except (TypeError, ValueError):
        logger.warning("Location RPC from %s returned an unusable payload", identity)
        raise ToolError(
            "The browser returned an unreadable location response."
        ) from None

    latitude = _finite_number(response.get("latitude"))
    longitude = _finite_number(response.get("longitude"))
    if latitude is None or longitude is None:
        raise ToolError(
            "The location response did not include usable coordinates. Ask the "
            "user to confirm location access and try again."
        )

    accuracy = _finite_number(response.get("accuracy"))
    return {
        "latitude": latitude,
        "longitude": longitude,
        # The Geolocation API may omit accuracy; 0.0 is its value for "unknown".
        "accuracy": 0.0 if accuracy is None else accuracy,
    }


@function_tool()
async def get_user_location(context: RunContext, high_accuracy: bool) -> dict:
    """Get the user's current physical location from their own device.

    Call this when the answer depends on where the user physically is, for
    example "which entrance am I standing at?". The fix comes from the user's
    device via their browser, so it exists only while the user is in the
    session and has granted location access. If this fails, relay the reported
    problem and ask them to allow the location prompt — never guess or state a
    location that was not returned here.

    Args:
        high_accuracy: Set to true only when a precise fix matters (metres,
            not a city block). It asks the device to turn on GPS and can take
            several seconds, so prefer false for a quick approximate answer.
    """
    # The return value is a dict with `latitude` and `longitude` in decimal
    # degrees plus `accuracy` in metres (0.0 when the device did not say).
    return await request_user_location(high_accuracy)


class FieldworkAssistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are a fieldwork assistant. You help people work from field "
                "research notes about a dock operations study, a station wayfinding "
                "audit, and a research handoff.\n\n"
                + RESEARCH_CONTEXT
                + "\n\nGuidelines:\n"
                "- Be concise and friendly; keep replies brief.\n"
                "- Ground every answer in the notes above. If you do not know or the "
                "notes do not cover it, say so instead of inventing findings.\n"
                "- You can summarize the dock interviews, propose changes based on the "
                "observations, discuss the signage audit, and outline what the research "
                "handoff should contain.\n"
                "- When the answer depends on where the user is, you can ask them for "
                "their current location. Only ever state a location you have actually "
                "retrieved; never guess or recall one.\n"
                "- Invite the user to ask you about the field notes."
            ),
            tools=[get_user_location],
        )


server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def fieldwork_session(ctx: agents.JobContext) -> None:
    """Handle one room session. Failures are logged, not fatal to the worker."""
    session = AgentSession(
        stt=inference.STT(model="assemblyai/universal-3-5-pro", language="en"),
        llm=inference.LLM(model="google/gemma-4-31b-it"),
        tts=inference.TTS(
            model="fishaudio/s2.1-pro", voice="fa4c9eb3dccc4806b382b40d61c6b10a"
        ),
        turn_handling=TurnHandlingOptions(turn_detection=inference.TurnDetector()),
    )
    try:
        await session.start(
            room=ctx.room,
            agent=FieldworkAssistant(),
            room_options=room_io.RoomOptions(),
        )
        await session.generate_reply(
            instructions=(
                "Say a short, friendly greeting and offer to help with the field notes."
            )
        )
    except Exception:
        logger.exception("Room job failed for room %s", ctx.room.name)


if __name__ == "__main__":
    agents.cli.run_app(server)