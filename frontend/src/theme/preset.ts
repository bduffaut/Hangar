import { definePreset, palette } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'
import { palettes } from './tokens.ts'

// The component library's theme, mapped onto our CSS variables. Both color schemes point at the
// same variables, which change with the dark class, so tokens.ts stays the only source of color.
const mix = (a: string, b: string, percent: number) => `color-mix(in srgb, ${a} ${percent}%, ${b})`

const scheme = {
  primary: {
    color: 'var(--hg-accent)',
    contrastColor: 'var(--hg-on-accent)',
    hoverColor: mix('var(--hg-accent)', 'var(--hg-ink)', 85),
    activeColor: mix('var(--hg-accent)', 'var(--hg-ink)', 75),
  },
  highlight: {
    background: mix('var(--hg-accent)', 'transparent', 16),
    focusBackground: mix('var(--hg-accent)', 'transparent', 24),
    color: 'var(--hg-ink)',
    focusColor: 'var(--hg-ink)',
  },
  mask: { background: 'var(--hg-scrim)', color: 'var(--hg-ink)' },
  formField: {
    background: 'var(--hg-raised)',
    disabledBackground: 'var(--hg-panel)',
    filledBackground: 'var(--hg-raised)',
    filledHoverBackground: 'var(--hg-raised)',
    filledFocusBackground: 'var(--hg-raised)',
    borderColor: 'var(--hg-line)',
    hoverBorderColor: 'var(--hg-ink-muted)',
    focusBorderColor: 'var(--hg-accent)',
    invalidBorderColor: 'var(--hg-danger)',
    color: 'var(--hg-ink)',
    disabledColor: 'var(--hg-ink-muted)',
    placeholderColor: 'var(--hg-ink-muted)',
    invalidPlaceholderColor: 'var(--hg-danger)',
    floatLabelColor: 'var(--hg-ink-muted)',
    floatLabelFocusColor: 'var(--hg-accent)',
    floatLabelActiveColor: 'var(--hg-ink-muted)',
    floatLabelInvalidColor: 'var(--hg-danger)',
    iconColor: 'var(--hg-ink-muted)',
    shadow: 'none',
  },
  text: {
    color: 'var(--hg-ink)',
    hoverColor: 'var(--hg-ink)',
    mutedColor: 'var(--hg-ink-muted)',
    hoverMutedColor: 'var(--hg-ink)',
  },
  content: {
    background: 'var(--hg-panel)',
    hoverBackground: 'var(--hg-raised)',
    borderColor: 'var(--hg-line)',
    color: 'var(--hg-ink)',
    hoverColor: 'var(--hg-ink)',
  },
  overlay: {
    select: {
      background: 'var(--hg-panel)',
      borderColor: 'var(--hg-line)',
      color: 'var(--hg-ink)',
    },
    popover: {
      background: 'var(--hg-panel)',
      borderColor: 'var(--hg-line)',
      color: 'var(--hg-ink)',
    },
    modal: { background: 'var(--hg-panel)', borderColor: 'var(--hg-line)', color: 'var(--hg-ink)' },
  },
  list: {
    option: {
      focusBackground: 'var(--hg-raised)',
      selectedBackground: mix('var(--hg-accent)', 'transparent', 16),
      selectedFocusBackground: mix('var(--hg-accent)', 'transparent', 24),
      color: 'var(--hg-ink)',
      focusColor: 'var(--hg-ink)',
      selectedColor: 'var(--hg-ink)',
      selectedFocusColor: 'var(--hg-ink)',
    },
  },
  navigation: {
    item: {
      focusBackground: 'var(--hg-raised)',
      activeBackground: 'var(--hg-raised)',
      color: 'var(--hg-ink)',
      focusColor: 'var(--hg-ink)',
      activeColor: 'var(--hg-ink)',
    },
  },
}

export const hangarPreset = definePreset(Aura, {
  primitive: {
    borderRadius: { none: '0', xs: '2px', sm: '4px', md: '8px', lg: '12px', xl: '16px' },
  },
  semantic: {
    // A full scale is still needed for the few places Aura reads primary.50 … primary.950.
    primary: palette(palettes.dark.accent),
    focusRing: {
      width: '2px',
      style: 'solid',
      color: 'var(--hg-accent)',
      offset: '2px',
      shadow: 'none',
    },
    colorScheme: { light: scheme, dark: scheme },
  },
})
