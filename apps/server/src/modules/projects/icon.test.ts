import { describe, expect, it } from 'vitest'
import { iconLinks } from './icon.ts'

describe('icon links on an app page', () => {
  it('finds icon links, biggest first, in any quoting', () => {
    const html = `<head>
      <link rel="stylesheet" href="/app.css">
      <link rel='icon' type='image/png' sizes='16x16' href='/static/small.png'>
      <link href=/static/big.png rel="icon" sizes="192x192">
      <link rel="apple-touch-icon" href="/touch.png" sizes="180x180" />
      <link rel="shortcut icon" href="favicon.ico">
    </head>`
    expect(iconLinks(html)).toEqual([
      '/static/big.png',
      '/touch.png',
      '/static/small.png',
      'favicon.ico',
    ])
  })
  it('ignores links that are not icons, and pages without any', () => {
    expect(iconLinks('<link rel="manifest" href="/m.json"><p>hi</p>')).toEqual([])
    expect(iconLinks('')).toEqual([])
  })
})
