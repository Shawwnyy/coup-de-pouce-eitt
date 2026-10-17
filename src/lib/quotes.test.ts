import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QUOTES, quoteIndexFor, quoteOfTheDay, dayNumber } from './quotes.ts'

test('la citation reste la même toute la journée', () => {
  const morning = new Date(2026, 9, 17, 0, 1)
  const night = new Date(2026, 9, 17, 23, 59)
  assert.equal(quoteOfTheDay(morning), quoteOfTheDay(night))
})

test('la citation change le lendemain', () => {
  const d1 = new Date(2026, 9, 17, 12)
  const d2 = new Date(2026, 9, 18, 12)
  assert.notEqual(quoteIndexFor(d1), quoteIndexFor(d2))
})

test('toutes les citations sont vues avant qu’une se répète', () => {
  const seen = new Set<number>()
  for (let i = 0; i < QUOTES.length; i++) seen.add(quoteIndexFor(new Date(2026, 0, 1 + i)))
  assert.equal(seen.size, QUOTES.length)
})

test('le numéro de jour suit le calendrier local', () => {
  assert.equal(dayNumber(new Date(2026, 9, 18)) - dayNumber(new Date(2026, 9, 17)), 1)
})

test('aucune citation n’est attribuée à une personnalité', () => {
  for (const q of QUOTES) assert.doesNotMatch(q, /—|\bdit\b.*:|\bselon\b/i)
})

test('la citation change chaque minute et reste la même pendant la minute', async () => {
  const { quoteIndexForMinute, minuteNumber, quoteOfTheMinute } = await import('./quotes.ts')
  const a = new Date('2026-10-17T20:10:05Z')
  const b = new Date('2026-10-17T20:10:58Z')
  const c = new Date('2026-10-17T20:11:01Z')
  assert.equal(quoteOfTheMinute(a), quoteOfTheMinute(b))
  assert.notEqual(quoteOfTheMinute(b), quoteOfTheMinute(c))
  assert.equal(minuteNumber(c) - minuteNumber(a), 1)
  const seen = new Set<number>()
  for (let i = 0; i < QUOTES.length; i++) seen.add(quoteIndexForMinute(1000 + i))
  assert.equal(seen.size, QUOTES.length, 'toutes les citations passent avant qu’une se répète')
})

test('pas de doublon dans les citations', () => {
  assert.equal(new Set(QUOTES).size, QUOTES.length)
})
