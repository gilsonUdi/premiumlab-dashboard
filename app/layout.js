import './globals.css'

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
    <html lang="pt-BR">
      <body className="portal-theme-root antialiased">
        {children}
      </body>
    </html>
  )
}
