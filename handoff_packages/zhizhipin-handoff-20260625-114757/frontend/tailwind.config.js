/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Cal.com design language ───────────────────────────────
        brand: {
          50: '#f5f5f5',
          100: '#ededed',
          200: '#e0e0e0',
          300: '#c4c4c4',
          400: '#8a8a8a',
          500: '#3f3f3f',
          600: '#111111',
          700: '#242424',
          800: '#1a1a1a',
          900: '#101010',
        },
        gray: {
          50: '#f8f9fa',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#898989',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111111',
        },
        // Semantic surface & text tokens
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
        'brand-accent': '#3b82f6',

        // ── Apple system accents ──────────────────────────────────
        'accent-blue': '#007AFF',
        'accent-green': '#34C759',
        'accent-orange': '#FF9500',
        'accent-pink': '#FF2D55',
        'accent-purple': '#AF52DE',
        'accent-teal': '#5AC8FA',
        'accent-indigo': '#5856D6',

        // ── Glass surface tokens ──────────────────────────────────
        'glass-bg': 'rgba(255, 255, 255, 0.72)',
        'glass-bg-strong': 'rgba(255, 255, 255, 0.85)',
        'glass-bg-subtle': 'rgba(255, 255, 255, 0.48)',
        'glass-border': 'rgba(0, 0, 0, 0.06)',

        // Badge pastels
        'badge-orange': '#fb923c',
        'badge-pink': '#ec4899',
        'badge-violet': '#8b5cf6',
        'badge-emerald': '#34d399',
        'badge-blue': '#60a5fa',
        'badge-teal': '#2dd4bf',
        'badge-rose': '#fb7185',

        // Semantic states
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
        sm: '6px',
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        apple: '16px',
        'apple-lg': '20px',
        'apple-xl': '24px',
      },
      letterSpacing: {
        display: '-0.02em',
        'display-tight': '-0.03em',
      },
      boxShadow: {
        // Cal.com originals
        card: '0 1px 2px 0 rgba(17, 17, 17, 0.04), 0 1px 3px 0 rgba(17, 17, 17, 0.06)',
        'card-hover': '0 4px 12px -2px rgba(17, 17, 17, 0.10), 0 2px 6px -2px rgba(17, 17, 17, 0.06)',
        'card-lg': '0 8px 24px -4px rgba(17, 17, 17, 0.12), 0 4px 8px -4px rgba(17, 17, 17, 0.06)',
        // Apple depth system
        'apple-xs': '0 0 0 1px rgba(0, 0, 0, 0.04)',
        'apple-sm': '0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.06)',
        'apple-md': '0 4px 8px rgba(0, 0, 0, 0.04), 0 2px 4px rgba(0, 0, 0, 0.05)',
        'apple-lg': '0 10px 20px rgba(0, 0, 0, 0.05), 0 4px 8px rgba(0, 0, 0, 0.04)',
        'apple-xl': '0 20px 40px rgba(0, 0, 0, 0.06), 0 8px 16px rgba(0, 0, 0, 0.04)',
        'apple-glass': '0 0 0 0.5px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.04), 0 8px 32px rgba(0, 0, 0, 0.03)',
        // Apple focus ring
        'apple-focus': '0 0 0 3px rgba(0, 122, 255, 0.15)',
      },
      animation: {
        shimmer: 'shimmer 2.5s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 2s cubic-bezier(0.16, 1, 0.3, 1) infinite',
        'slide-up': 'slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'fade-in': 'fadeIn 0.2s ease-out',
        float: 'float 4s cubic-bezier(0.16, 1, 0.3, 1) infinite',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.16, 1, 0.3, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
      },
      backdropBlur: {
        glass: '16px',
        'glass-strong': '20px',
        'glass-subtle': '12px',
      },
    },
  },
  plugins: [],
};