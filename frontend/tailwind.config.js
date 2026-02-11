/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    bg: '#0f172a',
                    surface: '#1e293b',
                    primary: '#3b82f6',
                    accent: '#8b5cf6',
                    success: '#10b981',
                    danger: '#ef4444',
                    warning: '#f59e0b',
                    text: '#f8fafc',
                    muted: '#94a3b8'
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
