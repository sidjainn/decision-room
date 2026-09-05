import {
  schema,
  table,
  t,
  SenderError,
  type InferSchema,
  type ReducerCtx,
} from 'spacetimedb/server';

const room = table(
  { name: 'room', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    code: t.string().unique(),
    template_key: t.string(),
    title: t.string(),
    decision_question: t.string(),
    objective: t.string(),
    decision_rule: t.string(),
    capacity_total: t.u32(),
    status: t.string(),
    contract_version: t.u64(),
    proposal_version: t.u64(),
    facilitator_identity: t.identity(),
    created_at: t.timestamp(),
    decided_at: t.option(t.timestamp()),
  }
);

const participant = table(
  {
    name: 'participant',
    public: true,
    indexes: [
      {
        accessor: 'by_room_identity',
        algorithm: 'btree',
        columns: ['room_id', 'identity'],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    room_id: t.u64().index('btree'),
    identity: t.identity(),
    display_name: t.string(),
    role_label: t.string(),
    connected: t.bool(),
    contract_accepted_version: t.u64(),
    joined_at: t.timestamp(),
  }
);

const criterion = table(
  { name: 'criterion', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    room_id: t.u64().index('btree'),
    label: t.string(),
    criterion_type: t.string(),
    status: t.string(),
    created_by: t.string(),
  }
);

const item = table(
  { name: 'item', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    room_id: t.u64().index('btree'),
    title: t.string(),
    description: t.string(),
    item_type: t.string(),
    effort: t.u32(),
    status: t.string(),
    created_by: t.string(),
    source_event_id: t.option(t.u64()),
  }
);

const position = table(
  {
    name: 'position',
    public: true,
    indexes: [
      {
        accessor: 'by_participant_item',
        algorithm: 'btree',
        columns: ['participant_id', 'item_id'],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    room_id: t.u64().index('btree'),
    participant_id: t.u64(),
    item_id: t.u64(),
    stance: t.string(),
    note: t.option(t.string()),
    updated_at: t.timestamp(),
  }
);

const evidence = table(
  { name: 'evidence', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    room_id: t.u64().index('btree'),
    item_id: t.option(t.u64()),
    criterion_id: t.option(t.u64()),
    text: t.string(),
    evidence_type: t.string(),
    status: t.string(),
    created_by: t.string(),
    source_event_id: t.option(t.u64()),
  }
);

const relation = table(
  { name: 'relation', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    room_id: t.u64().index('btree'),
    from_item_id: t.u64(),
    to_item_id: t.u64(),
    relation_type: t.string(),
    status: t.string(),
    created_by: t.string(),
    source_event_id: t.option(t.u64()),
  }
);

const proposal_item = table(
  {
    name: 'proposal_item',
    public: true,
    indexes: [
      {
        accessor: 'by_room_version',
        algorithm: 'btree',
        columns: ['room_id', 'proposal_version'],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    room_id: t.u64().index('btree'),
    proposal_version: t.u64(),
    item_id: t.u64(),
    disposition: t.string(),
    order_index: t.u32(),
    effort_committed: t.u32(),
  }
);

const approval = table(
  {
    name: 'approval',
    public: true,
    indexes: [
      {
        accessor: 'by_room_version',
        algorithm: 'btree',
        columns: ['room_id', 'proposal_version'],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    room_id: t.u64().index('btree'),
    proposal_version: t.u64(),
    participant_id: t.u64(),
    state: t.string(),
    updated_at: t.timestamp(),
  }
);

const conversation_event = table(
  {
    name: 'conversation_event',
    public: true,
    indexes: [
      {
        accessor: 'by_room_sequence',
        algorithm: 'btree',
        columns: ['room_id', 'sequence'],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    room_id: t.u64().index('btree'),
    sequence: t.u64(),
    speaker_label: t.option(t.string()),
    text: t.string(),
    is_final: t.bool(),
    created_at: t.timestamp(),
  }
);

const activity_event = table(
  {
    name: 'activity_event',
    public: true,
    indexes: [
      {
        accessor: 'by_room_sequence',
        algorithm: 'btree',
        columns: ['room_id', 'sequence'],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    room_id: t.u64().index('btree'),
    sequence: t.u64(),
    actor_type: t.string(),
    actor_id: t.option(t.u64()),
    event_type: t.string(),
    display_text: t.string(),
    created_at: t.timestamp(),
  }
);

const ai_state = table(
  { name: 'ai_state', public: true },
  {
    room_id: t.u64().primaryKey(),
    state: t.string(),
    detail: t.string(),
    updated_at: t.timestamp(),
  }
);

const spacetimedb = schema({
  room,
  participant,
  criterion,
  item,
  position,
  evidence,
  relation,
  proposal_item,
  approval,
  conversation_event,
  activity_event,
  ai_state,
});

export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

const ProposalItemInput = t.object('ProposalItemInput', {
  itemId: t.u64(),
  disposition: t.string(),
  orderIndex: t.u32(),
});

const ROOM_STATUSES = new Set([
  'configuring',
  'contract_review',
  'active',
  'proposal',
  'decided',
]);
const STANCES = new Set(['support', 'concern', 'neutral']);
const CRITERION_TYPES = new Set(['objective', 'constraint', 'evaluation']);
const DISCUSSION_POINT_KINDS = new Set(['agreement', 'difference']);
const EVIDENCE_TYPES = new Set([
  'data',
  'customer',
  'assumption',
  'dependency',
  'risk',
]);
const RELATION_TYPES = new Set([
  'depends_on',
  'duplicates',
  'alternative_to',
  'enables',
  'blocks',
]);
const DISPOSITIONS = new Set(['include', 'defer', 'test']);
const REVIEW_DECISIONS = new Set(['confirm', 'reject']);
const AI_STATES = new Set([
  'ready',
  'listening',
  'organising',
  'suggestion_added',
  'speaking',
  'needs_attention',
  'offline',
]);

function cleanText(value: string, label: string, maxLength = 500): string {
  const cleaned = value.trim();
  if (!cleaned) throw new SenderError(`${label} is required`);
  if (cleaned.length > maxLength) {
    throw new SenderError(`${label} must be ${maxLength} characters or fewer`);
  }
  return cleaned;
}

function optionalText(value: string | undefined, maxLength = 500): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = value.trim();
  if (!cleaned) return undefined;
  if (cleaned.length > maxLength) {
    throw new SenderError(`Text must be ${maxLength} characters or fewer`);
  }
  return cleaned;
}

function expectOneOf(value: string, allowed: Set<string>, label: string): string {
  if (!allowed.has(value)) throw new SenderError(`Invalid ${label}: ${value}`);
  return value;
}

function requireRoom(ctx: Ctx, roomId: bigint) {
  const found = ctx.db.room.id.find(roomId);
  if (!found) throw new SenderError('Room not found');
  return found;
}

function requireItem(ctx: Ctx, roomId: bigint, itemId: bigint) {
  const found = ctx.db.item.id.find(itemId);
  if (!found || found.room_id !== roomId) throw new SenderError('Item not found in room');
  return found;
}

function requireCriterion(ctx: Ctx, roomId: bigint, criterionId: bigint) {
  const found = ctx.db.criterion.id.find(criterionId);
  if (!found || found.room_id !== roomId) {
    throw new SenderError('Criterion not found in room');
  }
  return found;
}

function validateSourceEvent(ctx: Ctx, roomId: bigint, sourceEventId: bigint | undefined) {
  if (sourceEventId === undefined) return;
  const event = ctx.db.conversation_event.id.find(sourceEventId);
  if (!event || event.room_id !== roomId) {
    throw new SenderError('Source event not found in room');
  }
}

function participantForSender(ctx: Ctx, roomId: bigint) {
  for (const member of ctx.db.participant.by_room_identity.filter([
    roomId,
    ctx.sender,
  ])) {
    return member;
  }
  return undefined;
}

function requireParticipant(ctx: Ctx, roomId: bigint) {
  requireRoom(ctx, roomId);
  const member = participantForSender(ctx, roomId);
  if (!member) throw new SenderError('Join this room before taking that action');
  return member;
}

function requireAcceptedParticipant(ctx: Ctx, roomId: bigint) {
  const currentRoom = requireRoom(ctx, roomId);
  const member = requireParticipant(ctx, roomId);
  if (member.contract_accepted_version !== currentRoom.contract_version) {
    throw new SenderError('Accept the current Decision Contract first');
  }
  return member;
}

function requireRoomActor(ctx: Ctx, roomId: bigint) {
  const currentRoom = requireRoom(ctx, roomId);
  const member = participantForSender(ctx, roomId);
  if (!member && !currentRoom.facilitator_identity.equals(ctx.sender)) {
    throw new SenderError('Only the facilitator or a room participant may do that');
  }
  return { currentRoom, member };
}

function requireAiWriter(ctx: Ctx, roomId: bigint) {
  const actor = requireRoomActor(ctx, roomId);
  if (
    actor.currentRoom.template_key === 'conversation' &&
    !actor.currentRoom.facilitator_identity.equals(ctx.sender)
  ) {
    throw new SenderError('Only the room host may publish AI-originated room state');
  }
  return actor;
}

function nextActivitySequence(ctx: Ctx, roomId: bigint): bigint {
  let next = 1n;
  for (const event of ctx.db.activity_event.room_id.filter(roomId)) {
    if (event.sequence >= next) next = event.sequence + 1n;
  }
  return next;
}

function recordActivity(
  ctx: Ctx,
  roomId: bigint,
  actorType: string,
  actorId: bigint | undefined,
  eventType: string,
  displayText: string
) {
  ctx.db.activity_event.insert({
    id: 0n,
    room_id: roomId,
    sequence: nextActivitySequence(ctx, roomId),
    actor_type: actorType,
    actor_id: actorId,
    event_type: cleanText(eventType, 'Event type', 80),
    display_text: cleanText(displayText, 'Display text', 500),
    created_at: ctx.timestamp,
  });
}

function allConnectedParticipantsAccepted(ctx: Ctx, roomId: bigint, version: bigint) {
  let hasParticipant = false;
  for (const member of ctx.db.participant.room_id.filter(roomId)) {
    if (!member.connected) continue;
    hasParticipant = true;
    if (member.contract_accepted_version !== version) return false;
  }
  return hasParticipant;
}

function currentProposalRows(ctx: Ctx, roomId: bigint, version: bigint) {
  return [...ctx.db.proposal_item.by_room_version.filter([roomId, version])];
}

function proposalIsCapacityValid(ctx: Ctx, roomId: bigint, version: bigint) {
  const currentRoom = requireRoom(ctx, roomId);
  let total = 0;
  for (const proposal of currentProposalRows(ctx, roomId, version)) {
    if (proposal.disposition !== 'defer') total += proposal.effort_committed;
  }
  return total <= currentRoom.capacity_total;
}

function proposalHasUnresolvedBlocker(ctx: Ctx, roomId: bigint, version: bigint) {
  const selected = new Set(
    currentProposalRows(ctx, roomId, version)
      .filter(row => row.disposition !== 'defer')
      .map(row => row.item_id)
  );

  for (const link of ctx.db.relation.room_id.filter(roomId)) {
    if (link.status !== 'confirmed') continue;
    if (
      link.relation_type === 'depends_on' &&
      selected.has(link.from_item_id) &&
      !selected.has(link.to_item_id)
    ) {
      return true;
    }
    if (
      link.relation_type === 'blocks' &&
      selected.has(link.to_item_id) &&
      !selected.has(link.from_item_id)
    ) {
      return true;
    }
  }
  return false;
}

function allConnectedParticipantsApproved(ctx: Ctx, roomId: bigint, version: bigint) {
  let hasParticipant = false;
  for (const member of ctx.db.participant.room_id.filter(roomId)) {
    if (!member.connected) continue;
    hasParticipant = true;
    let approved = false;
    for (const vote of ctx.db.approval.by_room_version.filter([roomId, version])) {
      if (vote.participant_id === member.id && vote.state === 'approved') {
        approved = true;
        break;
      }
    }
    if (!approved) return false;
  }
  return hasParticipant;
}

function recomputeRoomStatus(ctx: Ctx, roomId: bigint) {
  const currentRoom = requireRoom(ctx, roomId);
  let connectedCount = 0;
  for (const member of ctx.db.participant.room_id.filter(roomId)) {
    if (member.connected) connectedCount += 1;
  }
  // Presence going to zero should not erase an already-reached decision or
  // turn an inactive room into a new workflow state.
  if (connectedCount === 0) return;

  // Conversation rooms are deliberately lighter than structured decision
  // templates. Their state is the live agreement map, not a contract or vote.
  if (currentRoom.template_key === 'conversation') {
    if (currentRoom.status !== 'active') {
      ctx.db.room.id.update({ ...currentRoom, status: 'active', decided_at: undefined });
    }
    return;
  }

  let status = currentRoom.status;
  let decidedAt = currentRoom.decided_at;

  if (!allConnectedParticipantsAccepted(ctx, roomId, currentRoom.contract_version)) {
    status = 'contract_review';
    decidedAt = undefined;
  } else if (currentRoom.proposal_version === 0n) {
    status = 'active';
    decidedAt = undefined;
  } else {
    const valid =
      proposalIsCapacityValid(ctx, roomId, currentRoom.proposal_version) &&
      !proposalHasUnresolvedBlocker(ctx, roomId, currentRoom.proposal_version);
    const approved = allConnectedParticipantsApproved(
      ctx,
      roomId,
      currentRoom.proposal_version
    );
    status = valid && approved ? 'decided' : 'proposal';
    decidedAt = status === 'decided' ? currentRoom.decided_at ?? ctx.timestamp : undefined;
  }

  if (!ROOM_STATUSES.has(status)) throw new SenderError('Invalid room status');
  ctx.db.room.id.update({ ...currentRoom, status, decided_at: decidedAt });
}

function clearContractAcceptances(ctx: Ctx, roomId: bigint) {
  for (const member of ctx.db.participant.room_id.filter(roomId)) {
    ctx.db.participant.id.update({ ...member, contract_accepted_version: 0n });
  }
}

function clearCurrentApprovals(ctx: Ctx, roomId: bigint, proposalVersion: bigint) {
  for (const vote of ctx.db.approval.by_room_version.filter([roomId, proposalVersion])) {
    ctx.db.approval.id.delete(vote.id);
  }
}

function invalidateContract(ctx: Ctx, roomId: bigint) {
  const currentRoom = requireRoom(ctx, roomId);
  clearContractAcceptances(ctx, roomId);
  clearCurrentApprovals(ctx, roomId, currentRoom.proposal_version);
  ctx.db.room.id.update({
    ...currentRoom,
    contract_version: currentRoom.contract_version + 1n,
    status: 'contract_review',
    decided_at: undefined,
  });
}

function upsertApproval(ctx: Ctx, roomId: bigint, participantId: bigint, state: string) {
  const currentRoom = requireRoom(ctx, roomId);
  for (const vote of ctx.db.approval.by_room_version.filter([
    roomId,
    currentRoom.proposal_version,
  ])) {
    if (vote.participant_id === participantId) {
      ctx.db.approval.id.update({ ...vote, state, updated_at: ctx.timestamp });
      return;
    }
  }
  ctx.db.approval.insert({
    id: 0n,
    room_id: roomId,
    proposal_version: currentRoom.proposal_version,
    participant_id: participantId,
    state,
    updated_at: ctx.timestamp,
  });
}

type ProposalInput = {
  itemId: bigint;
  disposition: string;
  orderIndex: number;
};

function replaceProposal(
  ctx: Ctx,
  roomId: bigint,
  items: readonly ProposalInput[],
  activityText: string,
  actorType = 'participant'
) {
  const actor = requireRoomActor(ctx, roomId);
  if (actor.currentRoom.template_key === 'conversation') {
    throw new SenderError('Structured proposals are not available in conversation rooms');
  }
  if (
    actor.member &&
    actor.member.contract_accepted_version !== actor.currentRoom.contract_version
  ) {
    throw new SenderError('Accept the current Decision Contract first');
  }
  if (items.length === 0) throw new SenderError('A proposal needs at least one item');
  if (items.length > 100) throw new SenderError('A proposal may contain at most 100 items');

  const seenItems = new Set<bigint>();
  const seenOrder = new Set<number>();
  const validated = items.map(candidate => {
    if (seenItems.has(candidate.itemId)) {
      throw new SenderError('An item may appear only once in a proposal');
    }
    if (seenOrder.has(candidate.orderIndex)) {
      throw new SenderError('Proposal order values must be unique');
    }
    seenItems.add(candidate.itemId);
    seenOrder.add(candidate.orderIndex);
    const disposition = expectOneOf(
      candidate.disposition,
      DISPOSITIONS,
      'proposal disposition'
    );
    const proposalItem = requireItem(ctx, roomId, candidate.itemId);
    if (proposalItem.status === 'suggested' || proposalItem.status === 'rejected') {
      throw new SenderError('Only confirmed items may enter a proposal');
    }
    return { proposalItem, disposition, orderIndex: candidate.orderIndex };
  });

  const newVersion = actor.currentRoom.proposal_version + 1n;
  for (const roomItem of ctx.db.item.room_id.filter(roomId)) {
    if (roomItem.status === 'included' || roomItem.status === 'deferred') {
      ctx.db.item.id.update({ ...roomItem, status: 'active' });
    }
  }

  for (const candidate of validated) {
    const committed = candidate.disposition === 'defer' ? 0 : candidate.proposalItem.effort;
    ctx.db.proposal_item.insert({
      id: 0n,
      room_id: roomId,
      proposal_version: newVersion,
      item_id: candidate.proposalItem.id,
      disposition: candidate.disposition,
      order_index: candidate.orderIndex,
      effort_committed: committed,
    });
    ctx.db.item.id.update({
      ...candidate.proposalItem,
      status: candidate.disposition === 'defer' ? 'deferred' : 'included',
    });
  }

  ctx.db.room.id.update({
    ...actor.currentRoom,
    proposal_version: newVersion,
    status: 'proposal',
    decided_at: undefined,
  });
  recordActivity(
    ctx,
    roomId,
    actorType,
    actor.member?.id,
    'proposal_published',
    activityText
  );
  recomputeRoomStatus(ctx, roomId);
}

function insertPmDemo(ctx: Ctx) {
  const existing = ctx.db.room.code.find('PM-DEMO');
  if (existing) return existing;

  const created = ctx.db.room.insert({
    id: 0n,
    code: 'PM-DEMO',
    template_key: 'backlog_prioritisation',
    title: 'Choose the next sprint backlog',
    decision_question: 'What enters the next two-week sprint?',
    objective: 'Improve new-user activation from 42% toward 50%',
    decision_rule: 'Both PMs approve one capacity-valid proposal',
    capacity_total: 12,
    status: 'contract_review',
    contract_version: 1n,
    proposal_version: 0n,
    facilitator_identity: ctx.sender,
    created_at: ctx.timestamp,
    decided_at: undefined,
  });

  const demoCriteria = [
    ['Expected activation impact', 'objective'],
    ['Evidence confidence', 'evaluation'],
    ['Effort', 'constraint'],
    ['Dependency risk', 'evaluation'],
  ] as const;
  for (const [label, criterionType] of demoCriteria) {
    ctx.db.criterion.insert({
      id: 0n,
      room_id: created.id,
      label,
      criterion_type: criterionType,
      status: 'active',
      created_by: 'facilitator',
    });
  }

  const demoItems = [
    ['Signup reliability fixes', 'Support data suggests signup failures affect activation.', 5],
    ['Guided onboarding redesign', 'Potentially high impact, with weak validation so far.', 8],
    ['Activation instrumentation', 'Enables measurement of subsequent activation experiments.', 2],
    ['Team-invite experiment', 'Moderate evidence and a clear success metric.', 3],
    ['Dashboard filters', 'A customer request with a weak link to the agreed objective.', 4],
  ] as const;
  for (const [title, description, effort] of demoItems) {
    ctx.db.item.insert({
      id: 0n,
      room_id: created.id,
      title,
      description,
      item_type: 'backlog_item',
      effort,
      status: 'active',
      created_by: 'facilitator',
      source_event_id: undefined,
    });
  }

  ctx.db.ai_state.insert({
    room_id: created.id,
    state: 'ready',
    detail: 'AI facilitator ready',
    updated_at: ctx.timestamp,
  });
  recordActivity(
    ctx,
    created.id,
    'facilitator',
    undefined,
    'room_created',
    'PM backlog prioritisation room loaded'
  );
  return created;
}

export const init = spacetimedb.init(_ctx => {
  // Rooms are created explicitly so the module can be published without demo data.
});

export const onConnect = spacetimedb.clientConnected(_ctx => {
  // Joining a room, rather than opening a socket, establishes presence.
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const affectedRooms = new Set<bigint>();
  for (const member of ctx.db.participant.iter()) {
    if (member.connected && member.identity.equals(ctx.sender)) {
      ctx.db.participant.id.update({ ...member, connected: false });
      affectedRooms.add(member.room_id);
    }
  }
  for (const roomId of affectedRooms) recomputeRoomStatus(ctx, roomId);
});

export const loadPmDemo = spacetimedb.reducer(ctx => {
  insertPmDemo(ctx);
});

export const createRoom = spacetimedb.reducer(
  {
    code: t.string(),
    title: t.string(),
    decisionQuestion: t.string(),
    objective: t.string(),
    decisionRule: t.string(),
    capacityTotal: t.u32(),
  },
  (ctx, { code, title, decisionQuestion, objective, decisionRule, capacityTotal }) => {
    const normalizedCode = cleanText(code, 'Room code', 24).toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(normalizedCode)) {
      throw new SenderError('Room code may contain only letters, numbers, and hyphens');
    }
    if (ctx.db.room.code.find(normalizedCode)) throw new SenderError('Room code already exists');
    if (capacityTotal === 0) throw new SenderError('Capacity must be greater than zero');

    const created = ctx.db.room.insert({
      id: 0n,
      code: normalizedCode,
      template_key: 'backlog_prioritisation',
      title: cleanText(title, 'Title', 120),
      decision_question: cleanText(decisionQuestion, 'Decision question', 240),
      objective: cleanText(objective, 'Objective', 240),
      decision_rule: cleanText(decisionRule, 'Decision rule', 240),
      capacity_total: capacityTotal,
      status: 'contract_review',
      contract_version: 1n,
      proposal_version: 0n,
      facilitator_identity: ctx.sender,
      created_at: ctx.timestamp,
      decided_at: undefined,
    });
    ctx.db.ai_state.insert({
      room_id: created.id,
      state: 'ready',
      detail: 'AI facilitator ready',
      updated_at: ctx.timestamp,
    });
    recordActivity(ctx, created.id, 'facilitator', undefined, 'room_created', 'Room created');
  }
);

export const createConversationRoom = spacetimedb.reducer(
  {
    code: t.string(),
    title: t.string(),
    hostName: t.string(),
    topic: t.string(),
    reference: t.string(),
    criteria: t.array(t.string()),
  },
  (ctx, { code, title, hostName, topic, reference, criteria }) => {
    const normalizedCode = cleanText(code, 'Room code', 24).toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(normalizedCode)) {
      throw new SenderError('Room code may contain only letters, numbers, and hyphens');
    }
    if (ctx.db.room.code.find(normalizedCode)) throw new SenderError('Room code already exists');
    if (criteria.length > 12) throw new SenderError('A room may have at most 12 reference points');

    const cleanTopic = topic.trim().slice(0, 240) || 'What would you like to align on?';
    const cleanReference = reference.trim().slice(0, 1000);
    const created = ctx.db.room.insert({
      id: 0n,
      code: normalizedCode,
      template_key: 'conversation',
      title: cleanText(title, 'Room name', 120),
      decision_question: cleanTopic,
      objective: cleanReference,
      decision_rule: 'Surface alignment, clarify differences, and help the group find common ground',
      capacity_total: 0,
      status: 'active',
      contract_version: 0n,
      proposal_version: 0n,
      facilitator_identity: ctx.sender,
      created_at: ctx.timestamp,
      decided_at: undefined,
    });

    const host = ctx.db.participant.insert({
      id: 0n,
      room_id: created.id,
      identity: ctx.sender,
      display_name: cleanText(hostName, 'Your name', 60),
      role_label: 'Host',
      connected: true,
      contract_accepted_version: 0n,
      joined_at: ctx.timestamp,
    });

    for (const rawLabel of criteria) {
      const label = rawLabel.trim();
      if (!label) continue;
      ctx.db.criterion.insert({
        id: 0n,
        room_id: created.id,
        label: cleanText(label, 'Reference point', 160),
        criterion_type: 'context',
        status: 'active',
        created_by: 'facilitator',
      });
    }

    ctx.db.ai_state.insert({
      room_id: created.id,
      state: 'ready',
      detail: 'Voice facilitator ready',
      updated_at: ctx.timestamp,
    });
    recordActivity(ctx, created.id, 'facilitator', host.id, 'room_created', 'Conversation room created');
  }
);

export const joinRoom = spacetimedb.reducer(
  { roomCode: t.string(), displayName: t.string(), roleLabel: t.string() },
  (ctx, { roomCode, displayName, roleLabel }) => {
    const code = cleanText(roomCode, 'Room code', 24).toUpperCase();
    const currentRoom = ctx.db.room.code.find(code);
    if (!currentRoom) throw new SenderError('Room not found');
    const name = cleanText(displayName, 'Display name', 60);
    const role = roleLabel.trim().slice(0, 80);
    const existing = participantForSender(ctx, currentRoom.id);

    let member;
    if (existing) {
      member = { ...existing, display_name: name, role_label: role, connected: true };
      ctx.db.participant.id.update(member);
    } else {
      member = ctx.db.participant.insert({
        id: 0n,
        room_id: currentRoom.id,
        identity: ctx.sender,
        display_name: name,
        role_label: role,
        connected: true,
        contract_accepted_version:
          currentRoom.template_key === 'conversation' ? currentRoom.contract_version : 0n,
        joined_at: ctx.timestamp,
      });
      recordActivity(
        ctx,
        currentRoom.id,
        'participant',
        member.id,
        'participant_joined',
        `${name} joined the room`
      );
    }
    recomputeRoomStatus(ctx, currentRoom.id);
  }
);

export const replaceDiscussionPoints = spacetimedb.reducer(
  {
    roomId: t.u64(),
    agreements: t.array(t.string()),
    differences: t.array(t.string()),
  },
  (ctx, { roomId, agreements, differences }) => {
    const actor = requireRoomActor(ctx, roomId);
    if (actor.currentRoom.template_key !== 'conversation') {
      throw new SenderError('Discussion points belong to conversation rooms');
    }
    if (!actor.currentRoom.facilitator_identity.equals(ctx.sender)) {
      throw new SenderError('Only the room host may update the live discussion map');
    }
    if (agreements.length > 8 || differences.length > 8) {
      throw new SenderError('Keep the room map to eight points per side');
    }

    const replacedIds = new Set<bigint>();
    for (const existing of ctx.db.item.room_id.filter(roomId)) {
      if (
        existing.item_type === 'agreement' ||
        existing.item_type === 'difference'
      ) {
        replacedIds.add(existing.id);
      }
    }

    for (const row of ctx.db.position.room_id.filter(roomId)) {
      if (replacedIds.has(row.item_id)) ctx.db.position.id.delete(row.id);
    }
    for (const row of ctx.db.evidence.room_id.filter(roomId)) {
      if (row.item_id !== undefined && replacedIds.has(row.item_id)) {
        ctx.db.evidence.id.delete(row.id);
      }
    }
    for (const row of ctx.db.relation.room_id.filter(roomId)) {
      if (replacedIds.has(row.from_item_id) || replacedIds.has(row.to_item_id)) {
        ctx.db.relation.id.delete(row.id);
      }
    }
    for (const row of ctx.db.proposal_item.room_id.filter(roomId)) {
      if (replacedIds.has(row.item_id)) ctx.db.proposal_item.id.delete(row.id);
    }
    for (const itemId of replacedIds) ctx.db.item.id.delete(itemId);

    const insertPoints = (values: readonly string[], kind: string) => {
      expectOneOf(kind, DISCUSSION_POINT_KINDS, 'discussion point kind');
      for (const rawText of values) {
        const text = rawText.trim();
        if (!text) continue;
        ctx.db.item.insert({
          id: 0n,
          room_id: roomId,
          title: cleanText(text, 'Discussion point', 220),
          description: '',
          item_type: kind,
          effort: 0,
          status: 'active',
          created_by: 'ai',
          source_event_id: undefined,
        });
      }
    };

    insertPoints(agreements, 'agreement');
    insertPoints(differences, 'difference');
    recordActivity(
      ctx,
      roomId,
      'ai',
      undefined,
      'room_map_updated',
      'Voice facilitator refreshed the agreement map'
    );
  }
);

export const setPresence = spacetimedb.reducer(
  { roomId: t.u64(), connected: t.bool() },
  (ctx, { roomId, connected }) => {
    const member = requireParticipant(ctx, roomId);
    ctx.db.participant.id.update({ ...member, connected });
    recomputeRoomStatus(ctx, roomId);
  }
);

export const updateDecisionContract = spacetimedb.reducer(
  {
    roomId: t.u64(),
    title: t.string(),
    decisionQuestion: t.string(),
    objective: t.string(),
    decisionRule: t.string(),
    capacityTotal: t.u32(),
  },
  (ctx, { roomId, title, decisionQuestion, objective, decisionRule, capacityTotal }) => {
    const currentRoom = requireRoom(ctx, roomId);
    if (currentRoom.template_key === 'conversation') {
      throw new SenderError('Conversation rooms do not use a Decision Contract');
    }
    if (!currentRoom.facilitator_identity.equals(ctx.sender)) {
      throw new SenderError('Only the facilitator may update the Decision Contract');
    }
    if (capacityTotal === 0) throw new SenderError('Capacity must be greater than zero');
    ctx.db.room.id.update({
      ...currentRoom,
      title: cleanText(title, 'Title', 120),
      decision_question: cleanText(decisionQuestion, 'Decision question', 240),
      objective: cleanText(objective, 'Objective', 240),
      decision_rule: cleanText(decisionRule, 'Decision rule', 240),
      capacity_total: capacityTotal,
    });
    invalidateContract(ctx, roomId);
    recordActivity(
      ctx,
      roomId,
      'facilitator',
      undefined,
      'contract_updated',
      'The Decision Contract changed and needs fresh acceptance'
    );
  }
);

export const acceptDecisionContract = spacetimedb.reducer(
  { roomId: t.u64() },
  (ctx, { roomId }) => {
    const currentRoom = requireRoom(ctx, roomId);
    const member = requireParticipant(ctx, roomId);
    ctx.db.participant.id.update({
      ...member,
      contract_accepted_version: currentRoom.contract_version,
    });
    recordActivity(
      ctx,
      roomId,
      'participant',
      member.id,
      'contract_accepted',
      `${member.display_name} accepted the Decision Contract`
    );
    recomputeRoomStatus(ctx, roomId);
  }
);

export const setPosition = spacetimedb.reducer(
  { roomId: t.u64(), itemId: t.u64(), stance: t.string(), note: t.option(t.string()) },
  (ctx, { roomId, itemId, stance, note }) => {
    const member = requireAcceptedParticipant(ctx, roomId);
    requireItem(ctx, roomId, itemId);
    const validStance = expectOneOf(stance, STANCES, 'stance');
    const cleanedNote = optionalText(note, 280);

    for (const existing of ctx.db.position.by_participant_item.filter([
      member.id,
      itemId,
    ])) {
      ctx.db.position.id.update({
        ...existing,
        stance: validStance,
        note: cleanedNote,
        updated_at: ctx.timestamp,
      });
      recordActivity(
        ctx,
        roomId,
        'participant',
        member.id,
        'position_changed',
        `${member.display_name} marked an item ${validStance}`
      );
      return;
    }

    ctx.db.position.insert({
      id: 0n,
      room_id: roomId,
      participant_id: member.id,
      item_id: itemId,
      stance: validStance,
      note: cleanedNote,
      updated_at: ctx.timestamp,
    });
    recordActivity(
      ctx,
      roomId,
      'participant',
      member.id,
      'position_changed',
      `${member.display_name} marked an item ${validStance}`
    );
  }
);

export const addEvidence = spacetimedb.reducer(
  {
    roomId: t.u64(),
    itemId: t.option(t.u64()),
    criterionId: t.option(t.u64()),
    evidenceType: t.string(),
    text: t.string(),
  },
  (ctx, { roomId, itemId, criterionId, evidenceType, text }) => {
    const member = requireAcceptedParticipant(ctx, roomId);
    if (itemId !== undefined) requireItem(ctx, roomId, itemId);
    if (criterionId !== undefined) requireCriterion(ctx, roomId, criterionId);
    ctx.db.evidence.insert({
      id: 0n,
      room_id: roomId,
      item_id: itemId,
      criterion_id: criterionId,
      text: cleanText(text, 'Evidence', 1200),
      evidence_type: expectOneOf(evidenceType, EVIDENCE_TYPES, 'evidence type'),
      status: 'confirmed',
      created_by: 'participant',
      source_event_id: undefined,
    });
    recordActivity(
      ctx,
      roomId,
      'participant',
      member.id,
      'evidence_added',
      `${member.display_name} added evidence`
    );
  }
);

export const suggestEvidence = spacetimedb.reducer(
  {
    roomId: t.u64(),
    itemId: t.option(t.u64()),
    criterionId: t.option(t.u64()),
    evidenceType: t.string(),
    text: t.string(),
    sourceEventId: t.option(t.u64()),
  },
  (ctx, { roomId, itemId, criterionId, evidenceType, text, sourceEventId }) => {
    requireAiWriter(ctx, roomId);
    if (itemId !== undefined) requireItem(ctx, roomId, itemId);
    if (criterionId !== undefined) requireCriterion(ctx, roomId, criterionId);
    validateSourceEvent(ctx, roomId, sourceEventId);
    ctx.db.evidence.insert({
      id: 0n,
      room_id: roomId,
      item_id: itemId,
      criterion_id: criterionId,
      text: cleanText(text, 'Evidence', 1200),
      evidence_type: expectOneOf(evidenceType, EVIDENCE_TYPES, 'evidence type'),
      status: 'suggested',
      created_by: 'ai',
      source_event_id: sourceEventId,
    });
    recordActivity(
      ctx,
      roomId,
      'ai',
      undefined,
      'evidence_suggested',
      'AI suggested evidence for review'
    );
  }
);

export const reviewEvidence = spacetimedb.reducer(
  { roomId: t.u64(), evidenceId: t.u64(), decision: t.string(), editedText: t.string() },
  (ctx, { roomId, evidenceId, decision, editedText }) => {
    const member = requireAcceptedParticipant(ctx, roomId);
    const row = ctx.db.evidence.id.find(evidenceId);
    if (!row || row.room_id !== roomId || row.status !== 'suggested') {
      throw new SenderError('Suggested evidence not found');
    }
    const outcome = expectOneOf(decision, REVIEW_DECISIONS, 'review decision');
    ctx.db.evidence.id.update({
      ...row,
      text: cleanText(editedText, 'Evidence', 1200),
      status: outcome === 'confirm' ? 'confirmed' : 'rejected',
    });
    recordActivity(
      ctx,
      roomId,
      'participant',
      member.id,
      `evidence_${outcome === 'confirm' ? 'confirmed' : 'rejected'}`,
      `${member.display_name} ${outcome === 'confirm' ? 'confirmed' : 'rejected'} AI evidence`
    );
  }
);

export const suggestItem = spacetimedb.reducer(
  {
    roomId: t.u64(),
    title: t.string(),
    description: t.string(),
    effort: t.u32(),
    sourceEventId: t.option(t.u64()),
  },
  (ctx, { roomId, title, description, effort, sourceEventId }) => {
    requireAiWriter(ctx, roomId);
    validateSourceEvent(ctx, roomId, sourceEventId);
    ctx.db.item.insert({
      id: 0n,
      room_id: roomId,
      title: cleanText(title, 'Item title', 160),
      description: cleanText(description, 'Item description', 1200),
      item_type: 'backlog_item',
      effort,
      status: 'suggested',
      created_by: 'ai',
      source_event_id: sourceEventId,
    });
    recordActivity(
      ctx,
      roomId,
      'ai',
      undefined,
      'item_suggested',
      'AI suggested a smaller experiment'
    );
  }
);

export const reviewItem = spacetimedb.reducer(
  {
    roomId: t.u64(),
    itemId: t.u64(),
    decision: t.string(),
    title: t.string(),
    description: t.string(),
    effort: t.u32(),
  },
  (ctx, { roomId, itemId, decision, title, description, effort }) => {
    const member = requireAcceptedParticipant(ctx, roomId);
    const row = requireItem(ctx, roomId, itemId);
    if (row.status !== 'suggested') throw new SenderError('Suggested item not found');
    const outcome = expectOneOf(decision, REVIEW_DECISIONS, 'review decision');
    ctx.db.item.id.update({
      ...row,
      title: cleanText(title, 'Item title', 160),
      description: cleanText(description, 'Item description', 1200),
      effort,
      status: outcome === 'confirm' ? 'active' : 'rejected',
    });
    recordActivity(
      ctx,
      roomId,
      'participant',
      member.id,
      `item_${outcome === 'confirm' ? 'confirmed' : 'rejected'}`,
      `${member.display_name} ${outcome === 'confirm' ? 'confirmed' : 'rejected'} the AI suggestion`
    );
  }
);

export const suggestCriterion = spacetimedb.reducer(
  { roomId: t.u64(), label: t.string(), criterionType: t.string() },
  (ctx, { roomId, label, criterionType }) => {
    requireAiWriter(ctx, roomId);
    ctx.db.criterion.insert({
      id: 0n,
      room_id: roomId,
      label: cleanText(label, 'Criterion', 160),
      criterion_type: expectOneOf(criterionType, CRITERION_TYPES, 'criterion type'),
      status: 'suggested',
      created_by: 'ai',
    });
    recordActivity(
      ctx,
      roomId,
      'ai',
      undefined,
      'criterion_suggested',
      'AI suggested a Decision Contract criterion'
    );
  }
);

export const reviewCriterion = spacetimedb.reducer(
  { roomId: t.u64(), criterionId: t.u64(), decision: t.string(), editedLabel: t.string() },
  (ctx, { roomId, criterionId, decision, editedLabel }) => {
    const currentRoom = requireRoom(ctx, roomId);
    if (currentRoom.template_key === 'conversation') {
      throw new SenderError('Conversation context is not part of a Decision Contract');
    }
    const member = requireAcceptedParticipant(ctx, roomId);
    const row = requireCriterion(ctx, roomId, criterionId);
    if (row.status !== 'suggested') throw new SenderError('Suggested criterion not found');
    const outcome = expectOneOf(decision, REVIEW_DECISIONS, 'review decision');
    ctx.db.criterion.id.update({
      ...row,
      label: cleanText(editedLabel, 'Criterion', 160),
      status: outcome === 'confirm' ? 'active' : 'rejected',
    });
    if (outcome === 'confirm') invalidateContract(ctx, roomId);
    recordActivity(
      ctx,
      roomId,
      'participant',
      member.id,
      `criterion_${outcome === 'confirm' ? 'confirmed' : 'rejected'}`,
      `${member.display_name} ${outcome === 'confirm' ? 'confirmed' : 'rejected'} the criterion suggestion`
    );
  }
);

export const suggestRelation = spacetimedb.reducer(
  {
    roomId: t.u64(),
    fromItemId: t.u64(),
    toItemId: t.u64(),
    relationType: t.string(),
    sourceEventId: t.option(t.u64()),
  },
  (ctx, { roomId, fromItemId, toItemId, relationType, sourceEventId }) => {
    requireAiWriter(ctx, roomId);
    if (fromItemId === toItemId) throw new SenderError('A relation needs two different items');
    requireItem(ctx, roomId, fromItemId);
    requireItem(ctx, roomId, toItemId);
    validateSourceEvent(ctx, roomId, sourceEventId);
    ctx.db.relation.insert({
      id: 0n,
      room_id: roomId,
      from_item_id: fromItemId,
      to_item_id: toItemId,
      relation_type: expectOneOf(relationType, RELATION_TYPES, 'relation type'),
      status: 'suggested',
      created_by: 'ai',
      source_event_id: sourceEventId,
    });
    recordActivity(
      ctx,
      roomId,
      'ai',
      undefined,
      'relation_suggested',
      'AI suggested a relationship between items'
    );
  }
);

export const reviewRelation = spacetimedb.reducer(
  { roomId: t.u64(), relationId: t.u64(), decision: t.string() },
  (ctx, { roomId, relationId, decision }) => {
    const member = requireAcceptedParticipant(ctx, roomId);
    const row = ctx.db.relation.id.find(relationId);
    if (!row || row.room_id !== roomId || row.status !== 'suggested') {
      throw new SenderError('Suggested relation not found');
    }
    const outcome = expectOneOf(decision, REVIEW_DECISIONS, 'review decision');
    ctx.db.relation.id.update({
      ...row,
      status: outcome === 'confirm' ? 'confirmed' : 'rejected',
    });
    recordActivity(
      ctx,
      roomId,
      'participant',
      member.id,
      `relation_${outcome === 'confirm' ? 'confirmed' : 'rejected'}`,
      `${member.display_name} ${outcome === 'confirm' ? 'confirmed' : 'rejected'} the relation suggestion`
    );
    recomputeRoomStatus(ctx, roomId);
  }
);

export const setProposalItems = spacetimedb.reducer(
  { roomId: t.u64(), items: t.array(ProposalItemInput) },
  (ctx, { roomId, items }) => {
    replaceProposal(ctx, roomId, items, 'The current proposal changed');
  }
);

export const publishProposal = spacetimedb.reducer(
  { roomId: t.u64(), items: t.array(ProposalItemInput) },
  (ctx, { roomId, items }) => {
    replaceProposal(ctx, roomId, items, 'A proposal was published');
  }
);

export const publishCandidateProposal = spacetimedb.reducer(
  { roomId: t.u64(), items: t.array(ProposalItemInput), explanation: t.string() },
  (ctx, { roomId, items, explanation }) => {
    replaceProposal(
      ctx,
      roomId,
      items,
      `AI candidate proposal: ${cleanText(explanation, 'Explanation', 360)}`,
      'ai'
    );
  }
);

export const approveProposal = spacetimedb.reducer(
  { roomId: t.u64() },
  (ctx, { roomId }) => {
    const currentRoom = requireRoom(ctx, roomId);
    const member = requireAcceptedParticipant(ctx, roomId);
    if (currentRoom.proposal_version === 0n) throw new SenderError('No proposal to approve');
    upsertApproval(ctx, roomId, member.id, 'approved');
    recordActivity(
      ctx,
      roomId,
      'participant',
      member.id,
      'proposal_approved',
      `${member.display_name} approved proposal v${currentRoom.proposal_version}`
    );
    recomputeRoomStatus(ctx, roomId);
  }
);

export const requestProposalChange = spacetimedb.reducer(
  { roomId: t.u64() },
  (ctx, { roomId }) => {
    const currentRoom = requireRoom(ctx, roomId);
    const member = requireAcceptedParticipant(ctx, roomId);
    if (currentRoom.proposal_version === 0n) throw new SenderError('No proposal to review');
    upsertApproval(ctx, roomId, member.id, 'change_requested');
    recordActivity(
      ctx,
      roomId,
      'participant',
      member.id,
      'proposal_change_requested',
      `${member.display_name} requested a proposal change`
    );
    recomputeRoomStatus(ctx, roomId);
  }
);

export const appendConversationEvent = spacetimedb.reducer(
  { roomId: t.u64(), speakerLabel: t.string(), text: t.string(), isFinal: t.bool() },
  (ctx, { roomId, speakerLabel, text, isFinal }) => {
    const actor = requireRoomActor(ctx, roomId);
    if (
      actor.currentRoom.template_key === 'conversation' &&
      !actor.currentRoom.facilitator_identity.equals(ctx.sender)
    ) {
      throw new SenderError('Only the room host may publish the live transcript');
    }
    let sequence = 1n;
    for (const event of ctx.db.conversation_event.room_id.filter(roomId)) {
      if (event.sequence >= sequence) sequence = event.sequence + 1n;
    }
    ctx.db.conversation_event.insert({
      id: 0n,
      room_id: roomId,
      sequence,
      speaker_label: optionalText(speakerLabel, 80) ?? 'Room',
      text: cleanText(text, 'Transcript text', 4000),
      is_final: isFinal,
      created_at: ctx.timestamp,
    });
  }
);

export const appendActivityEvent = spacetimedb.reducer(
  { roomId: t.u64(), eventType: t.string(), displayText: t.string() },
  (ctx, { roomId, eventType, displayText }) => {
    const member = requireParticipant(ctx, roomId);
    recordActivity(ctx, roomId, 'participant', member.id, eventType, displayText);
  }
);

export const setAiState = spacetimedb.reducer(
  { roomId: t.u64(), state: t.string(), detail: t.string() },
  (ctx, { roomId, state, detail }) => {
    const actor = requireRoomActor(ctx, roomId);
    if (
      actor.currentRoom.template_key === 'conversation' &&
      !actor.currentRoom.facilitator_identity.equals(ctx.sender)
    ) {
      throw new SenderError('Only the room host may update the voice facilitator');
    }
    const validState = expectOneOf(state, AI_STATES, 'AI state');
    const existing = ctx.db.ai_state.room_id.find(roomId);
    const row = {
      room_id: roomId,
      state: validState,
      detail: detail.trim().slice(0, 240),
      updated_at: ctx.timestamp,
    };
    if (existing) ctx.db.ai_state.room_id.update(row);
    else ctx.db.ai_state.insert(row);
  }
);
