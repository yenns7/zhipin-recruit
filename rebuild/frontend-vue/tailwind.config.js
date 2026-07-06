/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#111111', 50: '#f5f5f5', 100: '#e5e5e5', 200: '#d4d4d4', 300: '#a3a3a3', 400: '#737373', 500: '#525252', 600: '#111111', 700: '#242424', 800: '#1a1a1a', 900: '#0a0a0a' },
        canvas: '#ffffff',
        'surface-soft': '#f8f9fa',
        'surface-card': '#f5f5f5',
        'surface-strong': '#e5e7eb',
        'surface-dark': '#101010',
        body: '#374151',
        muted: '#6b7280',
        'muted-soft': '#898989',
        hairline: '#e5e7eb',
        'hairline-soft': '#f3f4f6',
        brand: { DEFAULT: '#111111', 50: '#f5f5f5', 100: '#e5e5e5', 200: '#d4d4d4', 300: '#a3a3a3', 400: '#737373', 500: '#525252', 600: '#111111', 700: '#242424' },
        success: { DEFAULT: '#10b981', 50: '#ecfdf5', 100: '#d1fae5' },
        warning: { DEFAULT: '#f59e0b', 50: '#fffbeb', 100: '#fef3c7' },
        danger: { DEFAULT: '#ef4444', 50: '#fef2f2', 100: '#fee2e2' },
        'badge-orange': '#fb923c',
        'badge-pink': '#ec4899',
        'badge-violet': '#8b5cf6',
        'badge-emerald': '#34d399',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl: '16px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.05)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08)',
      },
      letterSpacing: {
        display: '-0.02em',
      },
    },
  },
  plugins: [],
}
