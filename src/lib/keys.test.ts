import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSecretKey } from './keys.ts'

const jwt = (payload: object) =>
  ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'signature'].join('.')

test('une clé service_role est reconnue comme secrète', () => {
  assert.equal(isSecretKey(jwt({ role: 'service_role', iss: 'supabase' })), true)
  assert.equal(isSecretKey('sb_secret_abcdef'), true)
})

test('les clés publiques et les valeurs invalides ne sont pas bloquées à tort', () => {
  assert.equal(isSecretKey(jwt({ role: 'anon' })), false)
  assert.equal(isSecretKey('sb_publishable_abc'), false)
  assert.equal(isSecretKey('votre-cle-anon-publique'), false)
  assert.equal(isSecretKey('a.b.c'), false)
  assert.equal(isSecretKey(''), false)
})
