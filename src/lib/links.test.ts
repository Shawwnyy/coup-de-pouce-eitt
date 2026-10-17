import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeUrl, splitText } from './links.ts'

test('refuse les protocoles dangereux', () => {
  for (const u of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'ftp://x.fr', 'vbscript:x', 'not a url']) {
    assert.equal(analyzeUrl(u), null, u)
  }
})

test('affiche le vrai domaine', () => {
  const i = analyzeUrl('https://www.service-public.fr/particuliers/vosdroits/F1?x=1')!
  assert.equal(i.host, 'www.service-public.fr')
  assert.equal(i.secure, true)
  assert.deepEqual(i.warnings, [])
  assert.equal(i.kind, 'page')
})

test('repère un domaine qui en imite un autre (userinfo)', () => {
  const i = analyzeUrl('https://www.impots.gouv.fr@evil.example.com/login')!
  assert.equal(i.host, 'evil.example.com')
  assert.ok(i.warnings.some((w) => /identifiant avant le nom/.test(w)))
})

test('signale http, IP, punycode, raccourcisseur', () => {
  assert.ok(analyzeUrl('http://exemple.fr')!.warnings.some((w) => /chiffré/.test(w)))
  assert.ok(analyzeUrl('https://192.168.0.1/a')!.warnings.some((w) => /numérique/.test(w)))
  assert.ok(analyzeUrl('https://xn--pypal-4ve.com')!.warnings.some((w) => /caractères spéciaux/.test(w)))
  assert.ok(analyzeUrl('https://bit.ly/abc')!.warnings.some((w) => /raccourci/.test(w)))
})

test('classe images, vidéos et plateformes sans rien charger', () => {
  assert.equal(analyzeUrl('https://exemple.fr/a/chat.GIF')!.kind, 'image')
  assert.equal(analyzeUrl('https://exemple.fr/clip.mp4')!.kind, 'video-file')
  const yt = analyzeUrl('https://www.youtube.com/watch?v=abc')!
  assert.equal(yt.kind, 'video-platform')
  assert.equal(yt.platform, 'YouTube')
  assert.equal(analyzeUrl('https://exemple.fr/logo.svg')!.kind, 'page', 'SVG jamais traité comme une image affichable')
})

test('découpe le texte et retire la ponctuation finale', () => {
  const s = splitText('Regarde https://exemple.fr/aide, puis (https://exemple.org/x). Merci !')
  const links = s.filter((x) => x.type === 'link')
  assert.equal(links.length, 2)
  assert.equal((links[0] as { raw: string }).raw, 'https://exemple.fr/aide')
  assert.equal((links[1] as { raw: string }).raw, 'https://exemple.org/x')
  assert.equal(s.map((x) => (x.type === 'text' ? x.text : x.raw)).join(''), 'Regarde https://exemple.fr/aide, puis (https://exemple.org/x). Merci !')
})

test('parenthèse finale conservée si elle fait partie de l’adresse', () => {
  const s = splitText('https://fr.wikipedia.org/wiki/Aide_(informatique)')
  assert.equal((s[0] as { raw: string }).raw, 'https://fr.wikipedia.org/wiki/Aide_(informatique)')
})

test('le HTML dans un message reste du texte', () => {
  const s = splitText('<img src=x onerror=alert(1)> <script>alert(1)</script>')
  assert.equal(s.length, 1)
  assert.equal(s[0].type, 'text')
})
