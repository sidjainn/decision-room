import assert from 'node:assert/strict';
import test from 'node:test';
import { moveDiscussionPoint } from '../src/ai/roomVoiceTools.ts';

const state = {
  agreements: ['Maintain a U.S. presence.'],
  differences: [
    'Choose between San Francisco, New York, and Texas.',
    'Decide whether engineers should remain remote.',
  ],
};

test('moves an exact point to aligned while preserving the rest of the map', () => {
  const result = moveDiscussionPoint(state, {
    point: 'Choose between San Francisco, New York, and Texas.',
    destination: 'aligned',
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.agreements, [
    'Maintain a U.S. presence.',
    'Choose between San Francisco, New York, and Texas.',
  ]);
  assert.deepEqual(result.differences, ['Decide whether engineers should remain remote.']);
});

test('accepts harmless case and punctuation differences', () => {
  const result = moveDiscussionPoint(state, {
    point: 'CHOOSE BETWEEN SAN FRANCISCO NEW YORK AND TEXAS',
    destination: 'aligned',
  });

  assert.equal(result.changed, true);
  assert.equal(result.movedPoint, 'Choose between San Francisco, New York, and Texas.');
});

test('does not duplicate a point already in the requested destination', () => {
  const result = moveDiscussionPoint(state, {
    point: 'Maintain a U.S. presence.',
    destination: 'aligned',
  });

  assert.equal(result.changed, false);
  assert.deepEqual(result.agreements, state.agreements);
});

test('refuses a vague or unmatched point instead of guessing', () => {
  assert.throws(
    () => moveDiscussionPoint(state, { point: 'the office issue', destination: 'aligned' }),
    /No exact room-map point matched/,
  );
});

test('refuses a duplicated point because its source side is ambiguous', () => {
  assert.throws(
    () => moveDiscussionPoint(
      {
        agreements: ['Use customer evidence.'],
        differences: ['Use customer evidence.'],
      },
      { point: 'Use customer evidence.', destination: 'aligned' },
    ),
    /More than one room-map point matched/,
  );
});
