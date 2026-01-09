/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#F6F7FB',
        panel: '#F3F4F9',
        card: '#FFFFFF',
        'card-muted': '#FBFBFE',
        text: {
          primary: '#1B1E28',
          secondary: '#5B6173',
          tertiary: '#8B92A6',
          'on-primary': '#FFFFFF',
        },
        border: {
          subtle: 'rgba(27, 30, 40, 0.08)',
          divider: 'rgba(27, 30, 40, 0.06)',
        },
        primary: {
          DEFAULT: '#5B53FF',
          hover: '#5149FF',
          pressed: '#463DFF',
          soft: 'rgba(91, 83, 255, 0.14)',
        },
        neutral: {
          chip: '#F1F2F7',
          'chip-text': '#3B4255',
          icon: '#6B7184',
        },
        status: {
          success: '#16A34A',
          warning: '#F59E0B',
          danger: '#EF4444',
          info: '#2563EB',
        },
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        'display': ['22px', { lineHeight: '28px', letterSpacing: '-0.2px', fontWeight: '700' }],
        'h1': ['18px', { lineHeight: '24px', letterSpacing: '-0.1px', fontWeight: '700' }],
        'h2': ['16px', { lineHeight: '22px', letterSpacing: '-0.1px', fontWeight: '600' }],
        'title': ['14px', { lineHeight: '20px', letterSpacing: '-0.1px', fontWeight: '600' }],
        'body': ['13px', { lineHeight: '18px', letterSpacing: '0', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '16px', letterSpacing: '0', fontWeight: '400' }],
        'micro': ['11px', { lineHeight: '14px', letterSpacing: '0.2px', fontWeight: '500' }],
      },
      spacing: {
        'xs': '8px',
        'sm': '12px',
        'md': '16px',
        'lg': '20px',
        'xl': '24px',
        'xxl': '32px',
      },
      borderRadius: {
        'sm': '10px',
        'md': '14px',
        'lg': '18px',
        'xl': '22px',
        'pill': '999px',
      },
      boxShadow: {
        'elevation-1': '0 1px 1px rgba(16, 24, 40, 0.06), 0 2px 6px rgba(16, 24, 40, 0.06)',
        'elevation-2': '0 2px 3px rgba(16, 24, 40, 0.08), 0 8px 18px rgba(16, 24, 40, 0.08)',
        'elevation-3': '0 4px 6px rgba(16, 24, 40, 0.10), 0 14px 28px rgba(16, 24, 40, 0.10)',
      },
      transitionDuration: {
        'fast': '120ms',
        'base': '180ms',
        'slow': '240ms',
      },
      transitionTimingFunction: {
        'standard': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        'emphasized': 'cubic-bezier(0.2, 0.9, 0.1, 1)',
      },
      backgroundImage: {
        'gradient-cta': 'linear-gradient(180deg, #6B63FF 0%, #5B53FF 100%)',
        'gradient-brand': 'linear-gradient(135deg, #FF58C8 0%, #6B5BFF 52%, #39D1FF 100%)',
      },
    },
  },
  plugins: [],
}
