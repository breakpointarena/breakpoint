import assert from 'node:assert/strict'
import { calculateSharedPlayShares, getSharedPlaySessions } from '../lib/bookings/sharedPlay'
import { liveSessionEstimate } from '../lib/bookings/liveSessionAmount'

const end = new Date('2026-10-11T11:00:00.000Z')
const start = '2026-10-11T10:00:00.000Z'
const middle = '2026-10-11T10:30:00.000Z'

const playSessions = getSharedPlaySessions(
  [
    { id: 'a-first', participant_id: 'a', started_at: start, ended_at: '2026-10-11T10:20:00.000Z' },
    { id: 'b-overlap', participant_id: 'b', started_at: '2026-10-11T10:05:00.000Z', ended_at: '2026-10-11T10:15:00.000Z' },
    { id: 'a-resume', participant_id: 'a', started_at: '2026-10-11T10:30:00.000Z', ended_at: null },
  ],
  end
)
assert.deepEqual(playSessions, [
  { participantIds: ['a'], startedAt: new Date(start).getTime(), endedAt: new Date('2026-10-11T10:05:00.000Z').getTime() },
  { participantIds: ['a', 'b'], startedAt: new Date('2026-10-11T10:05:00.000Z').getTime(), endedAt: new Date('2026-10-11T10:15:00.000Z').getTime() },
  { participantIds: ['a'], startedAt: new Date('2026-10-11T10:15:00.000Z').getTime(), endedAt: new Date('2026-10-11T10:20:00.000Z').getTime() },
  { participantIds: ['a'], startedAt: new Date('2026-10-11T10:30:00.000Z').getTime(), endedAt: end.getTime() },
])

const timedShares = calculateSharedPlayShares(
  [
    { id: 'a-first', participant_id: 'a', started_at: start, ended_at: null },
    { id: 'b-later', participant_id: 'b', started_at: middle, ended_at: null },
  ],
  600,
  0,
  4,
  600,
  end
)
assert.deepEqual(timedShares.shares, [
  { participantId: 'a', amount: 450 },
  { participantId: 'b', amount: 150 },
])
assert.deepEqual(timedShares.sessions.map(({ amount }) => amount), [300, 300])
assert.equal(timedShares.trackedHours, 1)

const pausedShares = calculateSharedPlayShares(
  [
    { id: 'a-first-period', participant_id: 'a', started_at: start, ended_at: '2026-10-11T10:10:00.000Z' },
    { id: 'a-second-period', participant_id: 'a', started_at: '2026-10-11T10:20:00.000Z', ended_at: '2026-10-11T10:30:00.000Z' },
  ],
  60,
  0,
  1,
  null,
  end
)
assert.equal(pausedShares.trackedHours, 1 / 3)
assert.deepEqual(pausedShares.shares, [{ participantId: 'a', amount: 20 }])
assert.equal(pausedShares.deviceCharges, 20)
assert.equal(
  pausedShares.shares.reduce((total, share) => total + share.amount, 0),
  pausedShares.deviceCharges + pausedShares.extraPlayersTotal
)

const extraPlayerShares = calculateSharedPlayShares(
  ['a', 'b', 'c'].map(participantId => ({
    id: participantId,
    participant_id: participantId,
    started_at: start,
    ended_at: middle,
  })),
  200,
  150,
  1,
  100,
  end
)
assert.equal(extraPlayerShares.extraPlayersTotal, 150)
assert.deepEqual(extraPlayerShares.shares, [
  { participantId: 'a', amount: 83.34 },
  { participantId: 'b', amount: 83.33 },
  { participantId: 'c', amount: 83.33 },
])
assert.equal(
  extraPlayerShares.shares.reduce((total, share) => total + share.amount, 0),
  250
)
assert.deepEqual(extraPlayerShares.sessions.map(({ amount }) => amount), [250])

const sharedLiveEstimate = liveSessionEstimate(
  {
    billed_on_actual_time: true,
    shared_play_enabled: true,
    status: 'checked_in',
    checked_in_at: start,
    food_subtotal: 50,
    booking_device_slots: [{
      hourly_rate: 60,
      player_count: 1,
      included_players: 1,
      extra_player_charge: 0,
    }],
    shared_play_participants: [{
      id: 'a',
      shared_play_periods: [
        { id: 'a-before-pause', participant_id: 'a', started_at: start, ended_at: '2026-10-11T10:10:00.000Z' },
        { id: 'a-after-pause', participant_id: 'a', started_at: '2026-10-11T10:20:00.000Z', ended_at: null },
      ],
    }],
  },
  new Date('2026-10-11T10:30:00.000Z')
)
assert.equal(sharedLiveEstimate?.playedMinutes, 20)
assert.equal(sharedLiveEstimate?.deviceSubtotal, 20)
assert.equal(sharedLiveEstimate?.totalAmount, 70)

console.log('Shared-play time split and extra-player charges passed.')
