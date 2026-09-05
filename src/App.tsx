import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import {
  ConversationHarness,
  SmallestRealtimeProfile,
  type ConversationHarnessDependencies,
  type ReasoningInput,
} from './ai';
import { reducers, tables } from './module_bindings';
import type {
  ActivityEvent,
  AiState,
  ConversationEvent,
  Criterion,
  Item,
  Participant,
  Room,
} from './module_bindings/types';

type Route =
  | { kind: 'landing' }
  | { kind: 'room'; code: string }
  | { kind: 'join'; code: string };

type RoomData = {
  room?: Room;
  ready: boolean;
  participants: readonly Participant[];
  criteria: readonly Criterion[];
  points: readonly Item[];
  conversation: readonly ConversationEvent[];
  activity: readonly ActivityEvent[];
  aiState?: AiState;
};

function parseRoute(): Route {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] === 'room' && parts[1]) {
    return { kind: 'room', code: parts[1].toUpperCase() };
  }
  if (parts[0] === 'join' && parts[1]) {
    return { kind: 'join', code: parts[1].toUpperCase() };
  }
  return { kind: 'landing' };
}

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function useRoute() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const update = () => setRoute(parseRoute());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return route;
}

function useRoomData(code: string): RoomData {
  const [rooms, roomReady] = useTable(tables.room.where(row => row.code.eq(code)));
  const room = rooms[0];
  const roomId = room?.id ?? 0n;
  const enabled = room !== undefined;
  const [participants] = useTable(
    tables.participant.where(row => row.roomId.eq(roomId)),
    { enabled }
  );
  const [criteria] = useTable(
    tables.criterion.where(row => row.roomId.eq(roomId)),
    { enabled }
  );
  const [points] = useTable(tables.item.where(row => row.roomId.eq(roomId)), {
    enabled,
  });
  const [conversation] = useTable(
    tables.conversationEvent.where(row => row.roomId.eq(roomId)),
    { enabled }
  );
  const [activity] = useTable(
    tables.activityEvent.where(row => row.roomId.eq(roomId)),
    { enabled }
  );
  const [aiStates] = useTable(
    tables.aiState.where(row => row.roomId.eq(roomId)),
    { enabled }
  );
  return {
    room,
    ready: roomReady,
    participants,
    criteria,
    points,
    conversation,
    activity,
    aiState: aiStates[0],
  };
}

export default function App() {
  const route = useRoute();
  const { isActive, connectionError } = useSpacetimeDB();

  return (
    <div className="app-shell">
      {!isActive && (
        <div className="connection-banner" role="status">
          <span className="status-dot" />
          {connectionError ? 'Room connection lost. Reconnecting…' : 'Connecting…'}
        </div>
      )}
      {route.kind === 'landing' ? (
        <Landing connected={isActive} />
      ) : (
        <RoomRoute code={route.code} joining={route.kind === 'join'} connected={isActive} />
      )}
    </div>
  );
}

function Landing({ connected }: { connected: boolean }) {
  const [rooms] = useTable(tables.room);
  const createRoom = useReducer(reducers.createConversationRoom);
  const [hostName, setHostName] = useState('');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [reference, setReference] = useState('');
  const [criteria, setCriteria] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [pendingCode, setPendingCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (pendingCode && rooms.some(room => room.code === pendingCode)) {
      navigate(`/room/${pendingCode}`);
    }
  }, [pendingCode, rooms]);

  const recentRooms = useMemo(
    () =>
      [...rooms]
        .filter(room => room.templateKey === 'conversation')
        .sort((a, b) =>
          a.createdAt.microsSinceUnixEpoch > b.createdAt.microsSinceUnixEpoch ? -1 : 1
        )
        .slice(0, 4),
    [rooms]
  );

  const create = async () => {
    setError('');
    if (!hostName.trim() || !title.trim()) {
      setError('Add your name and a room name. Everything else is optional.');
      return;
    }
    const code = makeRoomCode(title);
    setPendingCode(code);
    try {
      await createRoom({
        code,
        title: title.trim(),
        hostName: hostName.trim(),
        topic: topic.trim(),
        reference: reference.trim(),
        criteria: criteria
          .split(/\n|,/)
          .map(value => value.trim())
          .filter(Boolean),
      });
    } catch (cause) {
      setPendingCode('');
      setError(errorMessage(cause));
    }
  };

  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <Brand />
        <span>Your decision facilitator</span>
      </nav>

      <section className="landing-hero">
        <div className="landing-copy">
          <h1>
            <span>5 leaders.</span>
            <span>3 urgent requests.</span>
            <span>1 available team.</span>
          </h1>
          <p>
            Ansel finds the disagreement blocking the decision and helps everyone
            leave with an answer they can execute.
          </p>

          <div className="create-room-panel">
            <div className="create-fields">
              <label>
                <span>Your name</span>
                <input
                  value={hostName}
                  onChange={event => setHostName(event.target.value)}
                  placeholder="Maya"
                  autoComplete="name"
                />
              </label>
              <label>
                <span>Room name</span>
                <input
                  value={title}
                  onChange={event => setTitle(event.target.value)}
                  placeholder="Team offsite"
                />
              </label>
            </div>
            <label>
              <span>What are you trying to align on? <em>Optional</em></span>
              <input
                value={topic}
                onChange={event => setTopic(event.target.value)}
                placeholder="Where and when should we meet?"
              />
            </label>

            <button
              className="context-toggle"
              type="button"
              onClick={() => setShowContext(value => !value)}
              aria-expanded={showContext}
            >
              {showContext ? 'Hide reference context' : 'Add OKRs or decision criteria'}
            </button>

            {showContext && (
              <div className="optional-context">
                <label>
                  <span>Reference or OKR <em>Optional</em></span>
                  <textarea
                    value={reference}
                    onChange={event => setReference(event.target.value)}
                    placeholder="Keep travel below ₹40,000 and maximise in-person time."
                    rows={3}
                  />
                </label>
                <label>
                  <span>Criteria <em>Optional, comma or line separated</em></span>
                  <input
                    value={criteria}
                    onChange={event => setCriteria(event.target.value)}
                    placeholder="Cost, accessibility, time together"
                  />
                </label>
              </div>
            )}

            <div className="create-action">
              <button
                className="primary-button"
                disabled={!connected || Boolean(pendingCode)}
                onClick={() => void create()}
              >
                {pendingCode ? 'Opening room…' : 'Create room'}
              </button>
              <span>No account or setup workflow.</span>
            </div>
            {error && <p className="inline-error">{error}</p>}
          </div>
        </div>

        <SimulatedRoom />
      </section>

      {recentRooms.length > 0 && (
        <section className="recent-rooms">
          <div>
            <h2>Your recent rooms</h2>
            <p>Every room has its own people, conversation and live alignment map.</p>
          </div>
          <div className="recent-room-list">
            {recentRooms.map(room => (
              <button key={String(room.id)} onClick={() => navigate(`/room/${room.code}`)}>
                <span>{room.title}</span>
                <small>{room.code}</small>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function SimulatedRoom() {
  return (
    <aside className="simulated-room" aria-label="Simulated room example">
      <div className="simulation-label"><span /> Ansel in a simulated live room</div>
      <header>
        <div>
          <p>Team offsite</p>
          <strong>Where and when should we meet?</strong>
        </div>
        <div className="demo-members" aria-label="Three people in the example room">
          <Avatar name="Maya" />
          <Avatar name="Dev" />
          <Avatar name="Leena" />
        </div>
      </header>

      <div className="simulation-listening">
        <VoiceOrb state="listening" />
        <div>
          <strong>Ansel is listening</strong>
          <span>“Friday gives us more time together, but flights are expensive…”</span>
        </div>
      </div>

      <div className="simulation-map">
        <section className="alignment-column">
          <h3><span /> Aligned</h3>
          <p>Meet in person, not remotely</p>
          <p>Keep the trip within the travel budget</p>
        </section>
        <section className="difference-column">
          <h3><span /> Still different</h3>
          <p>Friday in person or Tuesday remote</p>
        </section>
      </div>
      <footer>
        <span className="mini-wave"><i /><i /><i /><i /><i /></span>
        Ansel reshapes the map as the conversation moves.
      </footer>
    </aside>
  );
}

function RoomRoute({
  code,
  joining,
  connected,
}: {
  code: string;
  joining: boolean;
  connected: boolean;
}) {
  const data = useRoomData(code);
  const { identity } = useSpacetimeDB();
  if (!data.ready) return <LoadingRoom />;
  if (!data.room) return <MissingRoom code={code} />;

  const member = data.participants.find(
    participant => participant.identity.toHexString() === identity?.toHexString()
  );
  if (joining && !member) {
    return <JoinRoom data={data} connected={connected} />;
  }
  return <ConversationRoom data={data} member={member} />;
}

function JoinRoom({ data, connected }: { data: RoomData; connected: boolean }) {
  const room = data.room!;
  const joinRoom = useReducer(reducers.joinRoom);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  const join = async () => {
    if (!name.trim()) {
      setError('Add your name to join the room.');
      return;
    }
    setJoining(true);
    setError('');
    try {
      await joinRoom({ roomCode: room.code, displayName: name.trim(), roleLabel: role.trim() });
    } catch (cause) {
      setJoining(false);
      setError(errorMessage(cause));
    }
  };

  return (
    <main className="join-room-page">
      <button className="brand-button" onClick={() => navigate('/')}><Brand /></button>
      <section className="join-room-card">
        <div className="join-room-intro">
          <span>{data.participants.filter(person => person.connected).length} people here</span>
          <h1>{room.title}</h1>
          <p>{room.decisionQuestion}</p>
        </div>
        <div className="join-room-form">
          <h2>Join the conversation</h2>
          <label>
            <span>Your name</span>
            <input value={name} onChange={event => setName(event.target.value)} autoFocus />
          </label>
          <label>
            <span>Role <em>Optional</em></span>
            <input value={role} onChange={event => setRole(event.target.value)} />
          </label>
          <button
            className="primary-button"
            disabled={!connected || joining}
            onClick={() => void join()}
          >
            {joining ? 'Joining…' : 'Join room'}
          </button>
          {error && <p className="inline-error">{error}</p>}
        </div>
      </section>
    </main>
  );
}

function ConversationRoom({ data, member }: { data: RoomData; member?: Participant }) {
  const room = data.room!;
  const { identity } = useSpacetimeDB();
  const replacePoints = useReducer(reducers.replaceDiscussionPoints);
  const appendConversation = useReducer(reducers.appendConversationEvent);
  const setAiState = useReducer(reducers.setAiState);
  const setPresence = useReducer(reducers.setPresence);
  const [showQr, setShowQr] = useState(false);
  const [qrSrc, setQrSrc] = useState('');
  const [voiceRunning, setVoiceRunning] = useState(false);
  const [liveVoiceState, setLiveVoiceState] = useState('ready');
  const [error, setError] = useState('');
  const harnessRef = useRef<ConversationHarness | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const isHost = room.facilitatorIdentity.toHexString() === identity?.toHexString();
  const isConversationRoom = room.templateKey === 'conversation';

  useEffect(() => {
    if (!member || member.connected) return;
    void setPresence({ roomId: room.id, connected: true }).catch(() => undefined);
  }, [member, room.id, setPresence]);

  useEffect(
    () => () => {
      const harness = harnessRef.current;
      harnessRef.current = null;
      if (harness) void harness.stop().catch(() => undefined);
    },
    []
  );

  const createHarness = (
    adapters: Pick<
      ConversationHarnessDependencies,
      'meetingAudio' | 'speechInput' | 'reasoning' | 'realtimeVoice'
    >
  ) => {
    const harness = new ConversationHarness({
      ...adapters,
      createReasoningInput: request =>
        makeConversationInput(dataRef.current, request.transcript.text),
      executeToolCall: async event => {
        if (event.name !== 'sync_discussion_points') return;
        await replacePoints({
          roomId: room.id,
          agreements: [...event.arguments.agreements],
          differences: [...event.arguments.differences],
        });
      },
    });
    harness.onEvent(event => {
      if (event.type === 'agent_state') {
        setLiveVoiceState(event.state);
        void setAiState({
          roomId: room.id,
          state: event.state,
          detail: event.detail ?? voiceStateLabel(event.state),
        }).catch(() => undefined);
      }
      if (event.type === 'transcript' && event.phase === 'final' && event.text.trim()) {
        void appendConversation({
          roomId: room.id,
          speakerLabel: event.speakerLabel ?? 'Room',
          text: event.text,
          isFinal: true,
        }).catch(() => undefined);
      }
      if (event.type === 'harness_error') setError(event.message);
    });
    return harness;
  };

  const startVoice = async () => {
    setError('');
    try {
      const profile = new SmallestRealtimeProfile({
        roomTitle: room.title,
        topic: room.decisionQuestion,
        reference: room.objective || undefined,
        criteria: data.criteria.map(criterion => criterion.label),
      });
      const harness = createHarness({
        meetingAudio: profile.meetingAudio,
        speechInput: profile.speechInput,
        reasoning: profile.reasoning,
        realtimeVoice: profile.realtimeVoice,
      });
      await harness.start(String(room.id));
      harnessRef.current = harness;
      setVoiceRunning(true);
    } catch (cause) {
      setError(errorMessage(cause));
      setVoiceRunning(false);
    }
  };

  const stopVoice = async () => {
    const harness = harnessRef.current;
    harnessRef.current = null;
    setVoiceRunning(false);
    setLiveVoiceState('offline');
    if (harness) await harness.stop().catch(cause => setError(errorMessage(cause)));
  };

  const toggleQr = async () => {
    const next = !showQr;
    setShowQr(next);
    if (next && !qrSrc) {
      setQrSrc(
        await QRCode.toDataURL(`${window.location.origin}/join/${room.code}`, {
          width: 260,
          margin: 1,
          color: { dark: '#182033', light: '#ffffff' },
        })
      );
    }
  };

  if (!isConversationRoom) {
    return (
      <main className="state-page">
        <Brand />
        <h1>This is an earlier structured demo room.</h1>
        <p>Create a new conversation room to use the simplified experience.</p>
        <button className="primary-button" onClick={() => navigate('/')}>Create a room</button>
      </main>
    );
  }

  const agreements = data.points
    .filter(point => point.itemType === 'agreement' && point.status === 'active')
    .sort(compareIds);
  const differences = data.points
    .filter(point => point.itemType === 'difference' && point.status === 'active')
    .sort(compareIds);
  const latestConversation = [...data.conversation]
    .filter(event => event.isFinal)
    .sort((a, b) => (a.sequence < b.sequence ? 1 : -1))
    .slice(0, 3);
  const voiceState = voiceRunning ? liveVoiceState : data.aiState?.state ?? 'ready';

  return (
    <main className="conversation-room-page">
      <header className="conversation-topbar">
        <button className="brand-button" onClick={() => navigate('/')}><Brand compact /></button>
        <div className="room-identity">
          <strong>{room.title}</strong>
          <span>Room {room.code}</span>
        </div>
        <MemberStrip participants={data.participants} />
        <div className="invite-actions">
          <button className="quiet-button" onClick={() => void toggleQr()}>Invite</button>
          {showQr && (
            <div className="join-qr" role="dialog" aria-label="Join this room">
              {qrSrc ? <img src={qrSrc} alt={`QR code for room ${room.code}`} /> : <span>Preparing QR…</span>}
              <strong>Join {room.title}</strong>
              <p>Scan to enter the room. No account needed.</p>
              <button className="text-button" onClick={() => setShowQr(false)}>Close</button>
            </div>
          )}
        </div>
      </header>

      <section className="room-focus">
        <p>Today’s conversation</p>
        <h1>{room.decisionQuestion}</h1>
        {(room.objective || data.criteria.length > 0) && (
          <details className="room-reference">
            <summary>Reference context</summary>
            {room.objective && <p>{room.objective}</p>}
            <div>
              {data.criteria.map(criterion => (
                <span key={String(criterion.id)}>{criterion.label}</span>
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="voice-centre" aria-live="polite">
        <VoiceOrb state={voiceState} />
        <div>
          <strong>{voiceStateLabel(voiceState)}</strong>
          <p>
            {voiceRunning
              ? 'Ansel is in the conversation. No raw audio is stored here.'
              : isHost
                ? 'Start Ansel on the room device.'
                : 'The host controls when Ansel joins the conversation.'}
          </p>
        </div>
        {isHost && (
          <button
            className={voiceRunning ? 'quiet-button stop-voice' : 'primary-button'}
            onClick={() => void (voiceRunning ? stopVoice() : startVoice())}
          >
            {voiceRunning ? 'Stop Ansel' : 'Start Ansel'}
          </button>
        )}
      </section>
      {error && <p className="room-error">{error}</p>}

      <section className="live-alignment-map">
        <PointColumn
          kind="agreement"
          title="Aligned"
          subtitle="Shared ground the room appears to hold"
          points={agreements}
        />
        <PointColumn
          kind="difference"
          title="Still different"
          subtitle="The distinctions that still matter"
          points={differences}
        />
      </section>

      <footer className="room-footer">
        <div className="latest-heard">
          <span>Latest heard</span>
          {latestConversation.length === 0 ? (
            <p>The live map will begin after the room starts talking.</p>
          ) : (
            latestConversation.map(event => (
              <p key={String(event.id)}>{event.text}</p>
            ))
          )}
        </div>
        <span className="provider-note">Ansel speaks with Smallest.ai · Shared state by SpacetimeDB</span>
      </footer>
    </main>
  );
}

function PointColumn({
  kind,
  title,
  subtitle,
  points,
}: {
  kind: 'agreement' | 'difference';
  title: string;
  subtitle: string;
  points: readonly Item[];
}) {
  return (
    <article className={`point-column ${kind}`}>
      <header>
        <h2><span />{title}</h2>
        <p>{subtitle}</p>
      </header>
      <div className="point-list">
        {points.length === 0 ? (
          <div className="empty-point">
            <i />
            <p>{kind === 'agreement' ? 'No stable shared point yet.' : 'No meaningful difference surfaced yet.'}</p>
          </div>
        ) : (
          points.map((point, index) => (
            <div className="live-point" key={String(point.id)}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p>{point.title}</p>
              <small>Heard by AI</small>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function MemberStrip({ participants }: { participants: readonly Participant[] }) {
  const connected = participants.filter(person => person.connected);
  return (
    <div className="member-strip" aria-label={`${connected.length} people in the room`}>
      <div>
        {connected.slice(0, 5).map(person => (
          <Avatar key={String(person.id)} name={person.displayName} />
        ))}
      </div>
      <span>{connected.length} {connected.length === 1 ? 'person' : 'people'}</span>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return <span className="avatar" title={name}>{initials(name)}</span>;
}

function VoiceOrb({ state }: { state: string }) {
  return (
    <span className={`voice-orb state-${state}`} aria-hidden="true">
      <i /><i /><i /><i /><i />
    </span>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? 'compact' : ''}`}>
      <span className="brand-glyph"><i /><i /></span>
      <strong>Ansel</strong>
    </span>
  );
}

function LoadingRoom() {
  return (
    <main className="state-page">
      <VoiceOrb state="organising" />
      <h1>Opening the room…</h1>
    </main>
  );
}

function MissingRoom({ code }: { code: string }) {
  return (
    <main className="state-page">
      <Brand />
      <h1>Room {code} was not found.</h1>
      <p>Check the invitation or create a new room.</p>
      <button className="primary-button" onClick={() => navigate('/')}>Create a room</button>
    </main>
  );
}

function makeConversationInput(data: RoomData, transcript: string): ReasoningInput {
  const room = data.room!;
  return {
    requestId: crypto.randomUUID(),
    trigger: 'final_transcript',
    prompt: transcript,
    room: {
      roomId: String(room.id),
      contract: {
        version: Number(room.contractVersion),
        decisionQuestion: room.decisionQuestion,
        objective: room.objective,
        capacityTotal: room.capacityTotal,
        decisionRule: room.decisionRule,
        criteria: data.criteria.map(row => ({
          id: String(row.id),
          label: row.label,
          type: 'evaluation' as const,
        })),
      },
      participants: data.participants.map(row => ({
        id: String(row.id),
        displayName: row.displayName,
        roleLabel: row.roleLabel || undefined,
        connected: row.connected,
      })),
      items: data.points.map(row => ({
        id: String(row.id),
        title: row.title,
        description: row.description,
        effort: row.effort,
        status: row.status as 'active',
        createdBy: row.createdBy as 'facilitator' | 'participant' | 'ai',
        kind:
          row.itemType === 'agreement' || row.itemType === 'difference'
            ? row.itemType
            : 'topic',
      })),
      positions: [],
      evidence: [],
      relations: [],
      recentConversation: [...data.conversation]
        .sort((a, b) => (a.sequence > b.sequence ? 1 : -1))
        .slice(-16)
        .map(row => ({
          id: String(row.id),
          sequence: Number(row.sequence),
          text: row.text,
          isFinal: row.isFinal,
          speakerLabel: row.speakerLabel || undefined,
        })),
    },
  };
}

function makeRoomCode(title: string) {
  const prefix = title
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 5) || 'ROOM';
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  const suffix = [...bytes]
    .map(value => (value % 36).toString(36).toUpperCase())
    .join('');
  return `${prefix}-${suffix}`;
}

function compareIds(a: Item, b: Item) {
  return a.id < b.id ? -1 : 1;
}

function voiceStateLabel(state: string) {
  switch (state) {
    case 'listening': return 'Ansel is listening';
    case 'organising': return 'Ansel is finding the signal';
    case 'speaking': return 'Ansel is speaking';
    case 'suggestion_added': return 'Ansel updated the map';
    case 'needs_attention': return 'Ansel needs attention';
    case 'offline': return 'Ansel is off';
    default: return 'Ansel is ready';
  }
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
