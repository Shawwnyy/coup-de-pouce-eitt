import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contrastRatio, readableOn, mix } from './contrast.ts'
import { checkCustom, customVars, DEFAULT_CUSTOM, sanitizeCustom } from './theme.ts'

test('rapports de contraste de référence', () => {
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01)
  assert.ok(Math.abs(contrastRatio('#777777', '#ffffff') - 4.48) < 0.05)
})

test('le thème EITT par défaut est lisible', () => {
  const c = checkCustom(DEFAULT_CUSTOM)
  assert.equal(c.ok, true)
  assert.ok(c.ratios.text > 12)
})

test('refuse un texte illisible', () => {
  const r = checkCustom({ ...DEFAULT_CUSTOM, text: '#0d1b2e' })
  assert.equal(r.ok, false)
  assert.ok(r.problems.length >= 1)
})

test('le texte des boutons s’adapte à la couleur principale', () => {
  assert.equal(readableOn('#00e0f8'), '#000000')
  assert.equal(readableOn('#1d4ed8'), '#ffffff')
  for (const p of ['#00e0f8', '#1d4ed8', '#ffcc00', '#ff0066', '#777777']) assert.ok(contrastRatio(p, readableOn(p)) >= 4.5, p)
})

test('les variables dérivées restent lisibles', () => {
  const v = customVars({ ...DEFAULT_CUSTOM, background: '#ffffff', card: '#f1f5f9', text: '#0b1b2b', primary: '#0369a1' })
  assert.ok(contrastRatio(v['--muted'], v['--card']) >= 4.5)
  assert.equal(v['--scheme'], 'light')
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080')
})

test('les valeurs non fiables sont nettoyées', () => {
  const s = sanitizeCustom({ primary: 'red; background:url(//evil)', text: '#ABCDEF', bgStyle: 'hack', card: 42 })
  assert.equal(s.primary, DEFAULT_CUSTOM.primary)
  assert.equal(s.text, '#abcdef')
  assert.equal(s.bgStyle, DEFAULT_CUSTOM.bgStyle)
  assert.equal(s.card, DEFAULT_CUSTOM.card)
})
