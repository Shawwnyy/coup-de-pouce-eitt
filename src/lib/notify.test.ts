import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_NOTIFICATION_PREFS, mergePrefs } from './notify.ts'

test('par défaut : push, e-mail, sons et alertes désactivés', () => {
  const p = mergePrefs(undefined)
  assert.equal(p.browser, false)
  assert.equal(p.email, false)
  assert.equal(p.sound, false)
  assert.equal(p.visual_alerts, false)
  assert.equal(p.inapp_indicator, true, 'indicateur discret possible, désactivable')
  assert.deepEqual(p, DEFAULT_NOTIFICATION_PREFS)
})

test('les choix de l’utilisateur sont respectés', () => {
  const p = mergePrefs({ sound: true, inapp_indicator: false, event_help_requests: true })
  assert.equal(p.sound, true)
  assert.equal(p.inapp_indicator, false)
  assert.equal(p.event_help_requests, true)
})

test('les valeurs inattendues sont ignorées et l’e-mail reste désactivé', () => {
  const p = mergePrefs({ browser: 'oui' as unknown as boolean, email: true, inconnu: true } as never)
  assert.equal(p.browser, false)
  assert.equal(p.email, false)
  assert.equal('inconnu' in p, false)
})
