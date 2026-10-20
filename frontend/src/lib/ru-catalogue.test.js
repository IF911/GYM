import { describe, expect, test } from 'vitest'
import { EXDB } from './exercises-data.js'
import names from '../exercise-names/ru.js'
import instructions from '../instr/ru.js'
import descriptions from '../exercise-desc/ru.js'
import englishInstructions from '../instr/en.js'

// This fork promises a Russian explanation for every selectable exercise. A new
// upstream exercise must not silently turn its detail sheet back into English.
describe('complete Russian exercise library', () => {
  const ids = EXDB.map(ex => ex.id).sort()

  test('covers every canonical exercise in all three text packs', () => {
    for (const pack of [names, instructions, descriptions]) {
      expect(Object.keys(pack).sort()).toEqual(ids)
    }
  })

  test('has Russian names, descriptions and nonempty step-by-step technique', () => {
    const invalid = []
    for (const id of ids) {
      const steps = instructions[id]
      if (!Array.isArray(steps) || !steps.length) invalid.push(`${id}: no steps`)
      for (const [field, text] of [
        ['name', names[id]], ['description', descriptions[id]],
        ...(Array.isArray(steps) ? steps.map((s, i) => [`step ${i + 1}`, s]) : []),
      ]) {
        if (typeof text !== 'string' || !/[А-Яа-яЁё]/u.test(text)) invalid.push(`${id}: ${field}`)
      }
    }
    expect(invalid).toEqual([])
  })

  test('does not leave ordinary English instruction sentences inside Russian packs', () => {
    const leftovers = []
    const english = /\b(?:repeat|desired|starting|slowly|towards|your|shoulders|knees|feet|hands)\b/iu
    for (const id of ids) {
      for (const text of [names[id], descriptions[id], ...(instructions[id] || [])]) {
        if (english.test(text || '')) leftovers.push(`${id}: ${text}`)
      }
    }
    expect(leftovers).toEqual([])
  })

  test('keeps handheld equipment when translating generic weights', () => {
    const swapped = []
    for (const ex of EXDB) {
      const source = `${ex.n} ${(englishInstructions[ex.id] || []).join(' ')}`
      const translated = [names[ex.id], descriptions[ex.id], ...(instructions[ex.id] || [])].join(' ')
      if (['dumbbell', 'barbell', 'ez barbell'].includes(ex.eq) &&
          !/kettlebell/iu.test(source) && /(?:^|[^\p{L}])гир(?:я|и|ь|ю|ей|ями|ях|ям)(?=$|[^\p{L}])/iu.test(translated)) {
        swapped.push(`${ex.id}: kettlebell added`)
      }
      if (ex.eq === 'kettlebell' && !/dumbbell/iu.test(source) && /гантел/iu.test(translated)) {
        swapped.push(`${ex.id}: dumbbell substituted`)
      }
    }
    expect(swapped).toEqual([])
  })

  test('asks the lifter to bend their arms, not bend the bar or dumbbells', () => {
    const literalCurls = Object.entries(instructions)
      .filter(([, steps]) => steps.some(step => /(?:согните|согнуть)\s+(?:штанг|гантел|гир)/iu.test(step)))
      .map(([id]) => id)
    expect(literalCurls).toEqual([])
  })
})
