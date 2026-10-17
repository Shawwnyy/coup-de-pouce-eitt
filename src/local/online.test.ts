import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanPublicKey, decryptText, deriveChannel, encryptText, genKeyPair, mailboxTopic, normalizeRelay, verificationCode } from './online.ts'

test('adresse du relais : https obligatoire, http seulement pour localhost', () => {
  assert.equal(normalizeRelay('https://ntfy.sh'), 'https://ntfy.sh')
  assert.equal(normalizeRelay('  https://ntfy.sh/  '), 'https://ntfy.sh')
  assert.equal(normalizeRelay('https://exemple.org/relais/'), 'https://exemple.org/relais')
  assert.equal(normalizeRelay('http://127.0.0.1:8080'), 'http://127.0.0.1:8080')
  assert.equal(normalizeRelay('http://localhost:9'), 'http://localhost:9')
  assert.equal(normalizeRelay('http://exemple.org'), null)
  assert.equal(normalizeRelay('https://user:pass@exemple.org'), null)
  assert.equal(normalizeRelay('https://exemple.org/?a=1'), null)
  assert.equal(normalizeRelay('javascript:alert(1)'), null)
  assert.equal(normalizeRelay('ntfy.sh'), null)
})

test('la boîte de demandes se calcule à partir du numéro, sans tenir compte de la casse', async () => {
  const a = await mailboxTopic('User#0042')
  assert.equal(a, await mailboxTopic('user#0042'))
  assert.notEqual(a, await mailboxTopic('User#0043'))
  assert.match(a, /^cdp1-in-[0-9a-f]{32}$/)
})

test('les deux côtés calculent le même canal, sans rien s’envoyer de secret', async () => {
  const alice = await genKeyPair()
  const bob = await genKeyPair()
  const ab = await deriveChannel(alice.priv, bob.pub, 'id-alice-0001', 'id-bob-00002')
  const ba = await deriveChannel(bob.priv, alice.pub, 'id-bob-00002', 'id-alice-0001')
  assert.deepEqual(ab, ba)
  assert.match(ab.topic, /^cdp1-c-[0-9a-f]{32}$/)
  const eve = await genKeyPair()
  const ae = await deriveChannel(alice.priv, eve.pub, 'id-alice-0001', 'id-bob-00002')
  assert.notEqual(ae.topic, ab.topic)
  assert.equal(await verificationCode(ab), await verificationCode(ba))
  assert.match(await verificationCode(ab), /^\d{4}-\d{4}$/)
})

test('chiffrement : aller-retour, altération détectée, mauvais sujet refusé', async () => {
  const a = await genKeyPair()
  const b = await genKeyPair()
  const ch = await deriveChannel(a.priv, b.pub, 'id-a-000001', 'id-b-000002')
  const msg = await encryptText(ch.key, ch.topic, 'Bonjour é à ü 😀')
  assert.equal(await decryptText(ch.key, ch.topic, msg.iv, msg.ct), 'Bonjour é à ü 😀')
  assert.ok(!msg.ct.includes('Bonjour'))
  const second = await encryptText(ch.key, ch.topic, 'Bonjour é à ü 😀')
  assert.notEqual(second.ct, msg.ct, 'IV aléatoire : deux chiffrements du même texte diffèrent')
  await assert.rejects(() => decryptText(ch.key, 'cdp1-c-autre', msg.iv, msg.ct))
  const bytes = Buffer.from(msg.ct, 'base64')
  bytes[0] ^= 1
  await assert.rejects(() => decryptText(ch.key, ch.topic, msg.iv, bytes.toString('base64')))
})

test('clé publique reçue : seuls les champs attendus sont gardés', async () => {
  const k = await genKeyPair()
  assert.deepEqual(cleanPublicKey({ ...k.pub, d: 'secret', extra: 1 }), { kty: 'EC', crv: 'P-256', x: k.pub.x, y: k.pub.y })
  assert.equal(cleanPublicKey({ kty: 'RSA', n: 'x', e: 'y' }), null)
  assert.equal(cleanPublicKey(null), null)
  assert.equal(cleanPublicKey({ kty: 'EC', crv: 'P-256', x: 'court', y: 'court' }), null)
  await assert.rejects(() => deriveChannel(k.priv, { kty: 'EC', crv: 'P-256', x: 'a'.repeat(43), y: 'a'.repeat(43) }, 'id-a-000001', 'id-b-000002'))
})
