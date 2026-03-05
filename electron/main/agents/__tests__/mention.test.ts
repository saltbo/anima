import { describe, it, expect } from 'vitest'
import { parseMentions } from '../mention'

describe('parseMentions', () => {
  it('extracts single mention', () => {
    expect(parseMentions('@reviewer please review')).toEqual(['reviewer'])
  })

  it('extracts multiple mentions', () => {
    expect(parseMentions('@developer and @reviewer')).toEqual(['developer', 'reviewer'])
  })

  it('deduplicates mentions', () => {
    expect(parseMentions('@developer @developer fix this')).toEqual(['developer'])
  })

  it('returns empty array when no mentions', () => {
    expect(parseMentions('no mentions here')).toEqual([])
  })

  it('extracts @human mention', () => {
    expect(parseMentions('need @human help')).toEqual(['human'])
  })

  it('handles mentions at start of line', () => {
    expect(parseMentions('@developer fix the bug')).toEqual(['developer'])
  })

  it('handles mentions in middle of text', () => {
    expect(parseMentions('Hey @reviewer, please check this')).toEqual(['reviewer'])
  })
})
