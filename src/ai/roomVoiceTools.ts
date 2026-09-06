export type RoomMapDestination = 'aligned' | 'not_aligned';

export interface VoiceRoomState {
  readonly agreements: ReadonlyArray<string>;
  readonly differences: ReadonlyArray<string>;
}

export interface MoveDiscussionPointRequest {
  readonly point: string;
  readonly destination: RoomMapDestination;
}

export interface MoveDiscussionPointResult extends VoiceRoomState {
  readonly changed: boolean;
  readonly movedPoint: string;
  readonly destination: RoomMapDestination;
}

/**
 * Apply an explicit human correction without asking a model to reinterpret it.
 * The voice model must first read the room state and copy the exact point title.
 */
export function moveDiscussionPoint(
  state: VoiceRoomState,
  request: MoveDiscussionPointRequest,
): MoveDiscussionPointResult {
  const requested = normalizePoint(request.point);
  if (!requested) throw new Error('A discussion point is required.');

  const matches = [
    ...state.agreements.map(point => ({ point, source: 'aligned' as const })),
    ...state.differences.map(point => ({ point, source: 'not_aligned' as const })),
  ].filter(candidate => normalizePoint(candidate.point) === requested);

  if (matches.length === 0) {
    throw new Error(
      `No exact room-map point matched "${request.point}". Read the room state and use its exact point title.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `More than one room-map point matched "${request.point}". Ask the participant which one they mean.`,
    );
  }

  const match = matches[0]!;
  if (match.source === request.destination) {
    return {
      agreements: [...state.agreements],
      differences: [...state.differences],
      changed: false,
      movedPoint: match.point,
      destination: request.destination,
    };
  }

  const agreements = state.agreements.filter(point => point !== match.point);
  const differences = state.differences.filter(point => point !== match.point);
  if (request.destination === 'aligned') agreements.push(match.point);
  else differences.push(match.point);

  return {
    agreements,
    differences,
    changed: true,
    movedPoint: match.point,
    destination: request.destination,
  };
}

function normalizePoint(value: string): string {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
