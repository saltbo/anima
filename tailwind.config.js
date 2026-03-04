/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
  	extend: {
  		colors: {
  			status: {
  				sleeping: '#888888',
  				checking: '#f59e0b',
  				awake: '#10b981',
  				paused: '#ef4444',
  				'rate-limited': '#f97316'
  			},
  			'app-sidebar': 'hsl(var(--app-sidebar))',
  			'app-accent': 'hsl(var(--app-accent))',
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'slide-in-from-right': {
  				from: { transform: 'translateX(100%)' },
  				to: { transform: 'translateX(0)' }
  			},
  			'slide-out-to-right': {
  				from: { transform: 'translateX(0)' },
  				to: { transform: 'translateX(100%)' }
  			},
  			'overlay-in': {
  				from: { opacity: '0' },
  				to: { opacity: '1' }
  			},
  			'overlay-out': {
  				from: { opacity: '1' },
  				to: { opacity: '0' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'slide-in-from-right': 'slide-in-from-right 0.3s ease-out',
  			'slide-out-to-right': 'slide-out-to-right 0.2s ease-in',
  			'overlay-in': 'overlay-in 0.3s ease-out',
  			'overlay-out': 'overlay-out 0.2s ease-in'
  		}
  	}
  },
  plugins: [],
}
