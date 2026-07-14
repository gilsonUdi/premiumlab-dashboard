import './globals.css'
import ThemeToggle from '@/components/ThemeToggle'

export const metadata = {
  title: 'GS Portal - Multi-tenant',
  description: 'Portal multi-tenant para dashboards e ferramentas das empresas atendidas pela GS Consultoria & Gestao',
  icons: {
    icon: '/site-icon.png',
    shortcut: '/site-icon.png',
    apple: '/site-icon.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var theme=localStorage.getItem('gs-portal-theme')||'light';if(theme!=='dark')theme='light';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme}catch(e){document.documentElement.dataset.theme='light'}})();`,
          }}
        />
      </head>
      <body className="portal-theme-root antialiased">
        {children}
        <ThemeToggle />
      </body>
    </html>
  )
}
