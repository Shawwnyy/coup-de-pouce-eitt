import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sniffType, validateFile, type FilePolicy } from './files.ts'

const bytes = (...n: number[]) => new Uint8Array(n)
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]
const GIF = [...ascii('GIF89a'), 1, 0, 1, 0]
const WEBP = [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')]
const MP4 = [0, 0, 0, 24, ...ascii('ftypisom'), 0, 0, 2, 0]
const WEBM = [0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84, ...ascii('webm')]
const MOV = [0, 0, 0, 20, ...ascii('ftypqt  '), 0, 0, 0, 0]
const EXE = [...ascii('MZ'), 0x90, 0, 3, 0]
const SVG = ascii('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')

const policy: FilePolicy = {
  allow: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
  maxBytes: { image: 5 * 1024 * 1024, gif: 5 * 1024 * 1024, video: 20 * 1024 * 1024 },
}
const file = (data: number[], type = '', pad = 0) => new File([new Uint8Array(data), new Uint8Array(pad)], 'x', { type })

test('reconnaît les formats autorisés par leur signature', () => {
  assert.equal(sniffType(bytes(...PNG))?.mime, 'image/png')
  assert.equal(sniffType(bytes(...JPG))?.mime, 'image/jpeg')
  assert.equal(sniffType(bytes(...GIF))?.kind, 'gif')
  assert.equal(sniffType(bytes(...WEBP))?.mime, 'image/webp')
  assert.equal(sniffType(bytes(...MP4))?.mime, 'video/mp4')
  assert.equal(sniffType(bytes(...WEBM))?.mime, 'video/webm')
})

test('refuse exécutables, SVG, HTML et QuickTime', () => {
  for (const d of [EXE, SVG, ascii('<html><script>1</script></html>'), MOV]) assert.equal(sniffType(bytes(...d)), null)
})

test('accepte une image valide', async () => {
  const r = await validateFile(file(PNG, 'image/png'), policy)
  assert.equal(r.ok, true)
})

test('refuse un exécutable renommé en .png', async () => {
  const r = await validateFile(file(EXE, 'image/png'), policy)
  assert.equal(r.ok, false)
})

test('refuse un fichier dont le contenu contredit le type annoncé', async () => {
  const r = await validateFile(file(JPG, 'image/png'), policy)
  assert.equal(r.ok, false)
})

test('refuse les fichiers trop volumineux, selon le format', async () => {
  const bigImage = await validateFile(file(PNG, 'image/png', 6 * 1024 * 1024), policy)
  assert.equal(bigImage.ok, false)
  const okVideo = await validateFile(file(MP4, 'video/mp4', 15 * 1024 * 1024), policy)
  assert.equal(okVideo.ok, true)
  const bigVideo = await validateFile(file(MP4, 'video/mp4', 21 * 1024 * 1024), policy)
  assert.equal(bigVideo.ok, false)
  if (!bigVideo.ok) assert.match(bigVideo.error, /trop volumineux/)
})

test('refuse un fichier vide et respecte la liste autorisée', async () => {
  assert.equal((await validateFile(new File([], 'x'), policy)).ok, false)
  const avatarOnly: FilePolicy = { allow: ['image/png'], maxBytes: { image: 1024, gif: 0, video: 0 } }
  assert.equal((await validateFile(file(GIF, 'image/gif'), avatarOnly)).ok, false)
})
