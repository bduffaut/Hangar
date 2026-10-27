import { brand } from '@hangar/shared'
import { type MaybeRefOrGetter, toValue, watchEffect } from 'vue'

export function useDocumentTitle(title: MaybeRefOrGetter<string | null>) {
  watchEffect(() => {
    const value = toValue(title)
    document.title = value ? `${value} – ${brand.titleSuffix}` : brand.titleSuffix
  })
}
