import { NextResponse } from 'next/server';
import {
  AccessToken,
  RoomAgentDispatch,
  RoomConfiguration,
  type AccessTokenOptions,
  type VideoGrant,
} from 'livekit-server-sdk';

type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
  participantMetadata?: string;
  participantAttributes?: Record<string, string>;
};

// NOTE: you are expected to define the following environment variables in `.env.local`:
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

// don't cache the results
export const revalidate = 0;

/**
 * POST /api/token — issues a LiveKit room join token from a JSON body.
 *
 * Body: room_name, participant_identity, participant_name,
 *       participant_metadata?, participant_attributes?, room_config?
 *
 * Requires LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.
 */
export async function POST(req: Request) {
  try {
    if (process.env.NODE_ENV !== 'development') {
      console.warn(
        'THIS API ROUTE IS INSECURE. DO NOT USE THIS ROUTE IN PRODUCTION WITHOUT AN AUTHENTICATION LAYER.'
      );
    }

    if (LIVEKIT_URL === undefined) {
      throw new Error('LIVEKIT_URL is not defined');
    }
    if (API_KEY === undefined) {
      throw new Error('LIVEKIT_API_KEY is not defined');
    }
    if (API_SECRET === undefined) {
      throw new Error('LIVEKIT_API_SECRET is not defined');
    }

    const body = await req.json();
    const roomConfig = body?.room_config
      ? RoomConfiguration.fromJson(body.room_config, { ignoreUnknownFields: true })
      : undefined;

    const roomName: string = body?.room_name;
    const participantIdentity: string = body?.participant_identity;
    const participantName: string = body?.participant_name;
    const participantMetadata: string | undefined = body?.participant_metadata;
    const participantAttributes: Record<string, string> | undefined = body?.participant_attributes;

    const participantToken = await createParticipantToken(
      {
        identity: participantIdentity,
        name: participantName,
        metadata: participantMetadata,
        attributes: participantAttributes,
      },
      roomName,
      roomConfig
    );

    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantName,
      participantToken,
      participantMetadata,
      participantAttributes,
    };
    const headers = new Headers({
      'Cache-Control': 'no-store',
    });
    return NextResponse.json(data, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('POST /api/token failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/token — issues a LiveKit room join token for the web client.
 *
 * Query params: `room` (defaults to LIVEKIT_ROOM or a random `va_room_*`),
 * `identity` and `name` are optional, and `agent` names the agent worker to
 * dispatch (defaults to LIVEKIT_AGENT_NAME).
 *
 * The token auto-dispatches the `fieldwork-assistant` agent into the room
 * (override the worker name with `?agent=`, or with LIVEKIT_AGENT_NAME as the
 * default for requests that do not ask for one). The resolved worker is echoed
 * back as `agent` so a client can show which one the room will dispatch —
 * `agent` is absent from the response when neither source named one.
 */
export async function GET(request: Request) {
  const url = process.env.LIVEKIT_URL;
  if (!url || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
    return Response.json(
      {
        state: 'error',
        message:
          'Портал не настроен. Задайте PORTAL_URL, API_KEY и API_SECRET.',
      },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const room = searchParams.get('room') ?? process.env.LIVEKIT_ROOM ?? `va_room_${Math.floor(Math.random() * 10_000)}`;
  const identity =
    searchParams.get('identity') ?? `user-${crypto.randomUUID().slice(0, 8)}`;
  const name = searchParams.get('name') ?? `user-${crypto.randomUUID().slice(0, 8)}`;

  const at = new AccessToken(undefined, undefined, { identity, name, ttl: '1h' });
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  // Per-request worker name, falling back to the deployment's. Read last so the
  // reads here stay in the order `buildTokenQuery` emits them, and read with `??`
  // like the params above: only a missing key falls back, because a client that
  // has no agent to ask for omits the param rather than sending it blank.
  const agent = searchParams.get('agent') ?? process.env.LIVEKIT_AGENT_NAME ?? undefined;
  at.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: agent })],
  });

  const token = await at.toJwt();
  return Response.json({ state: 'ok', token, url, room, identity, name, agent });
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  roomConfig?: RoomConfiguration
): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: '15m',
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);

  if (roomConfig) {
    at.roomConfig = roomConfig;
  }

  return at.toJwt();
}
