import { z } from 'zod'

// Values marked "encrypted" hold a sealed envelope, never plaintext.
export const settingsSchema = {
  lanIp: z.ipv4().nullable(),
  lanDomain: z.string().nullable(),
  /** The owner's domains for public access. The first is the default (see `defaultDomain`). */
  publicDomains: z.array(z.string()),
  exposeTowerPublicly: z.boolean(),
  githubToken: z.string().nullable(), // encrypted
  cloudflareTunnelToken: z.string().nullable(), // encrypted
  setupCodeHash: z.string().nullable(),
}

export type SettingKey = keyof typeof settingsSchema
export type Settings = { [K in SettingKey]: z.infer<(typeof settingsSchema)[K]> }

export const SETTING_DEFAULTS: Settings = {
  lanIp: null,
  lanDomain: null,
  publicDomains: [],
  exposeTowerPublicly: false,
  githubToken: null,
  cloudflareTunnelToken: null,
  setupCodeHash: null,
}

export const SETTING_KEYS = Object.keys(settingsSchema) as SettingKey[]

/**
 * The default public domain: suggested for new projects, and home of the webhook address
 * (hooks.<domain>) and, when exposed, the public Control Tower (tower.<domain>).
 */
export const defaultDomain = (settings: Pick<Settings, 'publicDomains'>): string | null =>
  settings.publicDomains[0] ?? null
