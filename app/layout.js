import './globals.css'

export const metadata = {
  title: 'GS Portal - Multi-tenant',
  description: 'Portal multi-tenant para dashboards e ferramentas das empresas atendidas pela GS Consultoria & Gestao',
}

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased" style={{ background: '#030b1a', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  )
}
