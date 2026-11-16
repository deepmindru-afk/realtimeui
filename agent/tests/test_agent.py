"""Tests for the geolocation tool-forwarding half of the fieldwork assistant.

Everything runs against fakes (see conftest.py) — no LiveKit connection, no
credentials, no network.
"""

import asyncio
import json
import math
from typing import Any

import pytest
from livekit.agents.llm import ToolError

import agent as agent_module
from agent import (
    DEFAULT_RPC_TIMEOUT,
    HIGH_ACCURACY_RPC_TIMEOUT,
    USER_LOCATION_RPC_METHOD,
    FieldworkAssistant,
    get_user_location,
    request_user_location,
)
from conftest import (
    FakeLocalParticipant,
    FakeRemoteParticipant,
    FakeRoom,
    location_payload,
)

# The @function_tool decorator returns a FunctionTool wrapper whose `_func` is
# the raw async function. `_func` is the only way to invoke it directly:
# calling the wrapper returns the coroutine, which asyncio.run() also accepts.
run = asyncio.run


def call_tool(**kwargs: Any) -> Any:
    return run(get_user_location._func(None, **kwargs))


def tool_name(tool: Any) -> str | None:
    info = getattr(tool, "info", None)
    return info.name if info is not None else getattr(tool, "name", None)


def find_tool(tools: list[Any], name: str) -> Any | None:
    return next((t for t in tools if tool_name(t) == name), None)


# --- happy path -----------------------------------------------------------


def test_returns_parsed_coordinates(install_room, browser_room, local_participant):
    install_room(browser_room)

    result = run(request_user_location(high_accuracy=False))

    assert result == {"latitude": 47.6062, "longitude": -122.3321, "accuracy": 12.5}
    assert all(isinstance(v, float) for v in result.values())


def test_uses_the_frozen_rpc_method_name(install_room, browser_room, local_participant):
    install_room(browser_room)

    run(request_user_location(high_accuracy=False))

    assert local_participant.calls[0]["method"] == USER_LOCATION_RPC_METHOD
    assert USER_LOCATION_RPC_METHOD == "getUserLocation"


def test_addresses_the_visible_participant(install_room, local_participant):
    install_room(
        FakeRoom(
            participants=[FakeRemoteParticipant("browser-1")],
            local_participant=local_participant,
        )
    )

    run(request_user_location(high_accuracy=False))

    assert local_participant.calls[0]["destination_identity"] == "browser-1"


# --- outbound payload -----------------------------------------------------


@pytest.mark.parametrize(
    "high_accuracy, expected", [(True, True), (False, False)]
)
def test_outbound_payload_is_json_with_high_accuracy_flag(
    install_room, browser_room, local_participant, high_accuracy, expected
):
    install_room(browser_room)

    run(request_user_location(high_accuracy=high_accuracy))

    payload = local_participant.calls[0]["payload"]
    assert isinstance(payload, str)
    assert json.loads(payload) == {"highAccuracy": expected}


@pytest.mark.parametrize(
    "high_accuracy, expected_timeout",
    [
        (True, HIGH_ACCURACY_RPC_TIMEOUT),
        (False, DEFAULT_RPC_TIMEOUT),
    ],
)
def test_response_timeout_matches_accuracy(
    install_room, browser_room, local_participant, high_accuracy, expected_timeout
):
    install_room(browser_room)

    run(request_user_location(high_accuracy=high_accuracy))

    assert local_participant.calls[0]["response_timeout"] == expected_timeout


def test_timeout_constants_match_the_frozen_contract():
    assert HIGH_ACCURACY_RPC_TIMEOUT == 10.0
    assert DEFAULT_RPC_TIMEOUT == 5.0


# --- hidden participants --------------------------------------------------


def test_skips_hidden_participants_and_picks_first_visible(
    install_room, local_participant
):
    hidden = FakeRemoteParticipant("hidden-agent", hidden=True)
    visible = FakeRemoteParticipant("browser-1")
    also_visible = FakeRemoteParticipant("browser-2")
    room = FakeRoom(
        participants=[hidden, visible, also_visible],
        local_participant=local_participant,
    )
    install_room(room)

    run(request_user_location(high_accuracy=False))

    assert local_participant.calls[0]["destination_identity"] == "browser-1"
    assert len(local_participant.calls) == 1


def test_raises_when_only_hidden_participants_exist(install_room, local_participant):
    install_room(
        FakeRoom(
            participants=[FakeRemoteParticipant("hidden-1", hidden=True)],
            local_participant=local_participant,
        )
    )

    with pytest.raises(ToolError):
        run(request_user_location(high_accuracy=False))

    assert local_participant.calls == []


def test_raises_when_there_are_no_remote_participants(
    install_room, local_participant
):
    install_room(FakeRoom(participants=[], local_participant=local_participant))

    with pytest.raises(ToolError):
        run(request_user_location(high_accuracy=False))


# --- failure paths --------------------------------------------------------


def test_raises_tool_error_without_a_job_context(install_room):
    install_room(None)

    with pytest.raises(ToolError):
        run(request_user_location(high_accuracy=False))


def test_raises_tool_error_when_rpc_fails(install_room):
    boom = RuntimeError("internal detail: transport closed / secret token")
    room = FakeRoom(
        participants=[FakeRemoteParticipant("browser-1")],
        local_participant=FakeLocalParticipant(error=boom),
    )
    install_room(room)

    with pytest.raises(ToolError) as excinfo:
        run(request_user_location(high_accuracy=False))

    # The model sees only the tool message: no transport jargon, no cause.
    message = str(excinfo.value)
    assert "internal detail" not in message
    assert "secret token" not in message
    assert excinfo.value.__cause__ is None


def test_raises_tool_error_for_non_json_response(install_room):
    install_room(_room_with_response("not json at all"))

    with pytest.raises(ToolError):
        run(request_user_location(high_accuracy=False))


def test_raises_tool_error_when_response_is_not_an_object(install_room):
    install_room(_room_with_response(json.dumps([47.6, -122.3])))

    with pytest.raises(ToolError):
        run(request_user_location(high_accuracy=False))


def test_raises_tool_error_when_response_is_a_bare_string(install_room):
    install_room(_room_with_response("{}"))

    with pytest.raises(ToolError):
        run(request_user_location(high_accuracy=False))


@pytest.mark.parametrize(
    "body",
    [
        {"longitude": -122.3321, "accuracy": 10},  # latitude missing
        {"latitude": 47.6062, "accuracy": 10},  # longitude missing
        {"latitude": "47.6", "longitude": -122.3321},  # latitude not numeric
        {"latitude": 47.6062, "longitude": None},  # longitude null
        {"latitude": True, "longitude": -122.3321},  # bool is not a coordinate
        {"latitude": float("nan"), "longitude": -122.3321},  # NaN is not finite
        {"latitude": 47.6062, "longitude": float("inf")},  # inf is not finite
        {"latitude": 10**400, "longitude": -122.3321},  # overflows a float
    ],
)
def test_raises_tool_error_for_missing_or_invalid_coordinates(install_room, body):
    install_room(_room_with_response(json.dumps(body)))

    with pytest.raises(ToolError):
        run(request_user_location(high_accuracy=False))


@pytest.mark.parametrize(
    "accuracy", [None, "close", float("nan"), float("inf"), True, []]
)
def test_missing_or_invalid_accuracy_defaults_to_zero(install_room, accuracy):
    body = {"latitude": 47.6062, "longitude": -122.3321, "accuracy": accuracy}
    install_room(_room_with_response(json.dumps(body)))

    result = run(request_user_location(high_accuracy=False))

    assert result["accuracy"] == 0.0


def test_absent_accuracy_key_defaults_to_zero(install_room):
    install_room(_room_with_response(location_payload(accuracy=None)))

    result = run(request_user_location(high_accuracy=False))

    assert result["accuracy"] == 0.0


def test_every_tool_error_message_is_user_safe(install_room, local_participant):
    """No failure path leaks an internal exception, traceback, or repr."""
    rooms = [
        None,  # no job context
        _room_with_response("<html>error</html>"),
        _room_with_response(json.dumps({"latitude": "north", "longitude": "west"})),
        FakeRoom(
            participants=[FakeRemoteParticipant("hidden", hidden=True)],
            local_participant=local_participant,
        ),
        FakeRoom(
            participants=[FakeRemoteParticipant("browser-1")],
            local_participant=FakeLocalParticipant(
                error=RuntimeError("connection to redis://user:pw@internal failed")
            ),
        ),
    ]

    for room in rooms:
        install_room(room)
        with pytest.raises(ToolError) as excinfo:
            run(request_user_location(high_accuracy=True))
        message = str(excinfo.value)
        assert message
        assert "Traceback" not in message
        assert "redis" not in message
        assert "Exception" not in message
        assert message == message.strip()


# --- the @function_tool wrapper -------------------------------------------


def test_tool_is_registered_on_the_agent():
    tools = FieldworkAssistant().tools

    assert isinstance(tools, list)
    assert tools
    assert find_tool(tools, "get_user_location") is not None


def test_registered_tool_is_the_module_level_tool():
    tools = FieldworkAssistant().tools

    assert find_tool(tools, "get_user_location") is get_user_location


def test_tool_description_is_llm_ready():
    info = get_user_location.info

    assert info.name == "get_user_location"
    # The docstring body is the tool description the model sees; the Args:
    # section is stripped into the generated parameter schema instead.
    assert "location" in info.description.lower()
    assert "high_accuracy" not in info.description
    assert "never guess" in info.description.lower()


def test_generated_schema_documents_the_argument():
    from livekit.agents.llm import utils

    schema = utils.build_legacy_openai_schema(get_user_location, internally_tagged=True)

    assert schema["name"] == "get_user_location"
    assert set(schema["parameters"]["properties"]) == {"high_accuracy"}
    high_accuracy = schema["parameters"]["properties"]["high_accuracy"]
    assert high_accuracy["type"] == "boolean"
    assert high_accuracy["description"]
    assert schema["parameters"]["required"] == ["high_accuracy"]


def test_decorated_tool_delegates_to_the_helper(
    monkeypatch, install_room, browser_room, local_participant
):
    seen: list[bool] = []
    real_helper = agent_module.request_user_location

    async def spy(high_accuracy: bool) -> dict:
        seen.append(high_accuracy)
        return await real_helper(high_accuracy)

    monkeypatch.setattr(agent_module, "request_user_location", spy)
    install_room(browser_room)

    result = call_tool(high_accuracy=True)

    assert seen == [True]
    assert math.isclose(result["latitude"], 47.6062)
    assert local_participant.calls[0]["response_timeout"] == 10.0


def test_decorated_tool_propagates_tool_errors(
    monkeypatch, install_room, browser_room
):
    async def boom(high_accuracy: bool) -> dict:
        raise ToolError("no location for you")

    monkeypatch.setattr(agent_module, "request_user_location", boom)
    install_room(browser_room)

    with pytest.raises(ToolError, match="no location for you"):
        call_tool(high_accuracy=False)


# --- instructions ---------------------------------------------------------


def test_instructions_mention_location_without_licensing_guessing():
    instructions = FieldworkAssistant().instructions

    assert "current location" in instructions
    assert "never guess" in instructions.lower()


# --- helpers --------------------------------------------------------------


def _room_with_response(response: Any) -> FakeRoom:
    return FakeRoom(
        participants=[FakeRemoteParticipant("browser-1")],
        local_participant=FakeLocalParticipant(response=response),
    )
