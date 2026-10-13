import { defineTheme } from '@astryxdesign/core/theme';

export const fileTabsTheme = defineTheme({
  name: 'file-tabs',
  components: {
    stack: {
      base: {
        backgroundColor: 'var(--color-background-muted)',
      },
    },
    'tab-strip': { base: { gap: 'var(--spacing-1)' } },
    tab: {
      base: {
        borderRadius: '10px 10px 0 0',
        color: 'var(--color-text-secondary)',
        fontSize: '13px',
        justifyContent: 'flex-start',
        '::after': {
          content: '""',
          position: 'absolute',
          insetInlineEnd: '0',
          insetBlockStart: '10px',
          width: '1px',
          height: '16px',
          backgroundColor: 'var(--color-border)',
          pointerEvents: 'none',
        },
        ':hover': {
          backgroundColor: 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)',
        },
        ':where(.file-tab:hover > *, .file-tab:focus-within > *)': {
          backgroundColor: 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)',
        },
        ':where(.file-tab:hover > *, .file-tab:focus-within > *)::after': {
          display: 'none',
        },
        ':where(*) > span[aria-hidden="true"]:first-child': {
          backgroundImage: 'none',
          borderRadius: 'inherit',
        },
      },
      'selected:selected': {
        backgroundColor: 'var(--color-background-surface)',
        color: 'var(--color-text-primary)',
        fontWeight: 'var(--font-weight-medium)',
        '::after': { display: 'none' },
        ':hover': { backgroundColor: 'var(--color-background-surface)' },
        ':where(.file-tab:hover > *, .file-tab:focus-within > *)': {
          backgroundColor: 'var(--color-background-surface)',
        },
      },
    },
    'tab-indicator': { base: { display: 'none' } },
  },
});
