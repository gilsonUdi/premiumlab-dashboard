import './globals.css'

export const metadata = {
  title: 'Premium Lab — Dashboard de Produção',
  description: 'Dashboard de linha de produção do Laboratório Óptico Premium',
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
