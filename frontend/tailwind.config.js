/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Cal.com design language ───────────────────────────────
        // `brand` is intentionally remapped to a near-black grayscale ramp.
        // The whole app already uses bg-brand-600 / text-brand-700 / bg-brand-50
        // for primary actions and active states; remapping the ramp turns every
        // one of those into Cal.com's monochrome "near-black primary + light-gray
        // active" look without rewriting class names. Cal.com is monochrome at the
        // action layer — the accent blue lives in `brand-accent`, used sparingly.
        brand: {
          50: '#f5f5f5', // active-state / selected background (surface-card)
          100: '#ededed',
          200: '#e0e0e0',
          300: '#c4c4c4',
          400: '#8a8a8a',
          500: '#3f3f3f', // focus ring (neutral, not blue)
          600: '#111111', // PRIMARY — near-black CTA
          700: '#242424', // primary pressed / active text
          800: '#1a1a1a',
          900: '#101010',
        },
        // Neutral gray scale aligned to the doc's hairline/ink/muted tones.
        gray: {
          50: '#f8f9fa', // surface-soft
          100: '#f3f4f6', // hairline-soft
          200: '#e5e7eb', // hairline / surface-strong
          300: '#d1d5db',
          400: '#898989', // muted-soft (tertiary text)
          500: '#6b7280', // muted (secondary text)
          600: '#4b5563',
          700: '#374151', // body text
          800: '#1f2937',
          900: '#111111', // ink (headlines / primary text)
        },
        // Semantic surface & text tokens (Cal.com named tokens).
        ink: '#111111',
        body: '#374151',
        muted: '#6b7280',
        'muted-soft': '#898989',
        canvas: '#ffffff',
        'surface-soft': '#f8f9fa',
        'surface-card': '#f5f5f5',
        'surface-strong': '#e5e7eb',
        'surface-dark': '#101010',
        'surface-dark-elevated': '#1a1a1a',
        hairline: '#e5e7eb',
        'hairline-soft': '#f3f4f6',
        'on-primary': '#ffffff',
        'on-dark': '#ffffff',
        'on-dark-soft': '#a1a1aa',
        'brand-accent': '#3b82f6', // used sparingly, never on primary CTAs
        // Badge pastels — only on avatars / small accent moments.
        'badge-orange': '#fb923c',
        'badge-pink': '#ec4899',
        'badge-violet': '#8b5cf6',
        'badge-emerald': '#34d399',
        // Semantic states (doc values; ramps kept for existing usages).
        success: {
          50: '#ecfdf5',
          100: '#d1fae5',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      borderRadius: {
        // Hierarchical radius per the doc.
        sm: '6px',
        DEFAULT: '8px',
        md: '8px', // buttons, inputs, tabs
        lg: '12px', // content cards
        xl: '16px', // marquee / hero-scale cards
      },
      letterSpacing: {
        // Cal Sans signature: negative tracking on display sizes.
        display: '-0.02em',
        'display-tight': '-0.03em',
      },
      boxShadow: {
        // Soft and modern — layered low-opacity shadows for refined depth.
        card: '0 1px 2px 0 rgba(17, 17, 17, 0.04), 0 1px 3px 0 rgba(17, 17, 17, 0.06)',
        'card-hover': '0 4px 12px -2px rgba(17, 17, 17, 0.10), 0 2px 6px -2px rgba(17, 17, 17, 0.06)',
        'card-lg': '0 8px 24px -4px rgba(17, 17, 17, 0.12), 0 4px 8px -4px rgba(17, 17, 17, 0.06)',
      },
    },
  },
  plugins: [],
};
