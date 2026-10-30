import { describe, expect, it } from 'vitest'
import {
  appHostname,
  checkProjectName,
  checkPublicHostname,
  isIpv4,
  joinPublicHostname,
  splitPublicHostname,
  sslipDomain,
  towerHostname,
} from './hostnames.ts'

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

describe('public addresses', () => {
  const domains = ['example.com', 'other.dev', 'shop.example.net']

  it('splits an address by the domain it falls under', () => {
    expect(splitPublicHostname('blog.example.com', domains)).toEqual({
      subdomain: 'blog',
      domain: 'example.com',
    })
    expect(splitPublicHostname('other.dev', domains)).toEqual({
      subdomain: '',
      domain: 'other.dev',
    })
    expect(splitPublicHostname('blog.unknown.org', domains)).toBeNull()
    expect(joinPublicHostname({ subdomain: '', domain: 'other.dev' })).toBe('other.dev')
    expect(joinPublicHostname({ subdomain: 'a', domain: 'other.dev' })).toBe('a.other.dev')
  })

  it('accepts a root domain or one name under it', () => {
    expect(checkPublicHostname('example.com', domains)).toBeNull()
    expect(checkPublicHostname('blog.example.com', domains)).toBeNull()
    expect(checkPublicHostname('www.other.dev', domains)).toBeNull()
    expect(checkPublicHostname('a.shop.example.net', domains)).toBeNull()
  })

  it('names what is wrong with other addresses', () => {
    expect(checkPublicHostname('https://example.com', domains)).toBe('invalid')
    expect(checkPublicHostname('blog.unknown.org', domains)).toBe('not_your_domain')
    expect(checkPublicHostname('example.net', domains)).toBe('not_your_domain')
    expect(checkPublicHostname('a.b.example.com', domains)).toBe('too_deep')
    expect(checkPublicHostname('tower.example.com', domains)).toBe('reserved')
    expect(checkPublicHostname('hooks.other.dev', domains)).toBe('reserved')
  })
})
