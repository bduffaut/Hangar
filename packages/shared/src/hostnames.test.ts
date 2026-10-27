import { describe, expect, it } from 'vitest'
import { appHostname, checkProjectName, isIpv4, sslipDomain, towerHostname } from './hostnames.ts'

describe('checkProjectName', () => {
  it.each(['blog', 'my-app', 'a', 'app2', 'x'.repeat(40)])('accepts %s', (name) => {
    expect(checkProjectName(name)).toBeNull()
  })

  it.each([
    ['', 'empty'],
    ['x'.repeat(41), 'too_long'],
    ['Blog', 'invalid_characters'],
    ['-blog', 'invalid_characters'],
    ['blog-', 'invalid_characters'],
    ['my_app', 'invalid_characters'],
    ['my.app', 'invalid_characters'],
    ['tower', 'reserved'],
    ['hooks', 'reserved'],
  ])('rejects %j as %s', (name, problem) => {
    expect(checkProjectName(name)).toBe(problem)
  })
})

describe('sslipDomain', () => {
  it('turns an IP into an sslip.io domain', () => {
    expect(sslipDomain('192.168.1.50')).toBe('192-168-1-50.sslip.io')
  })

  it('rejects anything that is not an IPv4 address', () => {
    expect(() => sslipDomain('256.1.1.1')).toThrow()
    expect(() => sslipDomain('example.com')).toThrow()
  })
})

describe('hostnames', () => {
  it('builds tower and app hostnames', () => {
    expect(towerHostname('192-168-1-50.sslip.io')).toBe('tower.192-168-1-50.sslip.io')
    expect(appHostname('blog', 'example.com')).toBe('blog.example.com')
  })

  it('validates IPv4', () => {
    expect(isIpv4('10.0.0.1')).toBe(true)
    expect(isIpv4('10.0.0')).toBe(false)
    expect(isIpv4('01.0.0.1')).toBe(false)
  })
})
