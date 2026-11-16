"""Fakes and fixtures for the agent tests.

No test in this suite opens a LiveKit connection: the room, the local
participant and the remote participants are plain objects that expose only the
attributes agent.py actually touches.
"""

import json
from typing import Any

import pytest

import agent as agent_module


class FakePermissions:
    """Stand-in for the proto ParticipantPermission message."""

    def __init__(self, hidden: bool = False) -> None:
        self.hidden = hidden


class FakeRemoteParticipant:
    def __init__(self, identity: str, hidden: bool = False) -> None:
        self.identity = identity
        self.permissions = FakePermissions(hidden)


class FakeLocalParticipant:
    """Records perform_rpc calls and replays a canned result."""

    def __init__(
        self, response: Any = None, error: BaseException | None = None
    ) -> None:
        self._response = response
        self._error = error
        self.calls: list[dict[str, Any]] = []

    async def perform_rpc(
        self,
        *,
        destination_identity: str,
        method: str,
        payload: str,
        response_timeout: float | None = None,
        max_round_trip_latency: float | None = None,
    ) -> str:
        self.calls.append(
            {
                "destination_identity": destination_identity,
                "method": method,
                "payload": payload,
                "response_timeout": response_timeout,
                "max_round_trip_latency": max_round_trip_latency,
            }
        )
        if self._error is not None:
            raise self._error
        if callable(self._response):
            return self._response(**self.calls[-1])
        return self._response


class FakeRoom:
    def __init__(
        self,
        participants: list[FakeRemoteParticipant] | None = None,
        local_participant: FakeLocalParticipant | None = None,
    ) -> None:
        self._remote_participants = {p.identity: p for p in participants or []}
        self.local_participant = local_participant or FakeLocalParticipant()
        self.name = "fake-room"

    @property
    def remote_participants(self) -> dict[str, FakeRemoteParticipant]:
        return self._remote_participants


class FakeJobContext:
    def __init__(self, room: FakeRoom) -> None:
        self.room = room


def location_payload(
    latitude: float = 47.6062,
    longitude: float = -122.3321,
    accuracy: float | None = 12.5,
) -> str:
    """A browser-shaped RPC response string (the frozen JSON contract)."""
    body: dict[str, Any] = {"latitude": latitude, "longitude": longitude}
    if accuracy is not None:
        body["accuracy"] = accuracy
    return json.dumps(body)


@pytest.fixture
def local_participant() -> FakeLocalParticipant:
    return FakeLocalParticipant(response=location_payload())


@pytest.fixture
def install_room(monkeypatch: pytest.MonkeyPatch):
    """Point agent.get_job_context at a fake room; returns the job context."""

    def _install(room: FakeRoom | None) -> FakeJobContext | None:
        if room is None:
            monkeypatch.setattr(agent_module, "get_job_context", lambda **_: None)
            return None
        job_context = FakeJobContext(room)
        monkeypatch.setattr(
            agent_module, "get_job_context", lambda **_: job_context
        )
        return job_context

    return _install


@pytest.fixture
def browser_room(local_participant: FakeLocalParticipant) -> FakeRoom:
    """A room with one visible browser participant."""
    return FakeRoom(
        participants=[FakeRemoteParticipant("browser-1")],
        local_participant=local_participant,
    )
