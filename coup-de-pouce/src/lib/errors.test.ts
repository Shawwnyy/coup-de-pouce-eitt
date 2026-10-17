import { test } from 'node:test'
import assert from 'node:assert/strict'
import { friendlyError } from './errors.ts'
import { formatBytes, formatDayLabel, displayName, initials } from './format.ts'

test('messages d’erreur compréhensibles, sans détail technique', () => {
  assert.match(friendlyError({ message: 'rate_limited' }), /trop vite/)
  assert.match(friendlyError({ message: 'contact_unavailable' }), /ne peut pas être contactée/)
  assert.match(friendlyError(new TypeError('Failed to fetch')), /Connexion impossible/)
  assert.match(friendlyError({ message: 'Invalid login credentials' }), /incorrect/)
  assert.match(friendlyError({ message: 'new row violates row-level security policy for table "x"', code: '42501' }), /non autorisée/)
  const unknown = friendlyError({ message: 'relation "secret_table" does not exist at /var/lib/postgres' })
  assert.doesNotMatch(unknown, /secret_table|postgres/)
})

test('formats', () => {
  assert.equal(formatBytes(512), '512 o')
  assert.equal(formatBytes(2048), '2 Ko')
  assert.equal(formatBytes(5 * 1024 * 1024), '5,0 Mo')
  const now = new Date(2026, 9, 17, 12)
  assert.equal(formatDayLabel(new Date(2026, 9, 17, 8).toISOString(), now), 'Aujourd’hui')
  assert.equal(formatDayLabel(new Date(2026, 9, 16, 8).toISOString(), now), 'Hier')
  assert.equal(displayName({ display_name: null, public_id: 'User#0001' }), 'User#0001')
  assert.equal(displayName({ display_name: ' Alice ', public_id: 'User#0001' }), 'Alice')
  assert.equal(initials({ display_name: 'Alice Martin', public_id: 'User#0001' }), 'AM')
})
