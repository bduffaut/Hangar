import { z } from 'zod'

// Values marked "encrypted" hold a sealed envelope, never plaintext.
export const settingsSchema = {
  lanIp: z.ipv4().nullable(),
  lanDomain: z.string().nullable(),
  publicDomain: z.string().nullable(),
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
  publicDomain: null,
  exposeTowerPublicly: false,
  githubToken: null,
  cloudflareTunnelToken: null,
  setupCodeHash: null,
}

export const SETTING_KEYS = Object.keys(settingsSchema) as SettingKey[]
