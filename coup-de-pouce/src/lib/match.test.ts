import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchRoute } from './match.ts'

test('routes statiques et paramétrées', () => {
  assert.deepEqual(matchRoute('/', '/'), {})
  assert.deepEqual(matchRoute('/regles', '/regles'), {})
  assert.equal(matchRoute('/regles', '/autre'), null)
  assert.deepEqual(matchRoute('/messages/:id', '/messages/abc'), { id: 'abc' })
  assert.equal(matchRoute('/messages/:id', '/messages'), null)
  assert.equal(matchRoute('/messages/:id', '/messages/a/b'), null)
})

test('paramètre optionnel', () => {
  assert.deepEqual(matchRoute('/parametres/:section?', '/parametres'), {})
  assert.deepEqual(matchRoute('/parametres/:section?', '/parametres/profil'), { section: 'profil' })
})

test('décodage et valeurs invalides', () => {
  assert.deepEqual(matchRoute('/u/:id', '/u/User%230001'), { id: 'User#0001' })
  assert.equal(matchRoute('/u/:id', '/u/%E0%A4%A'), null)
})
