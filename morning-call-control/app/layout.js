import './globals.css';

export const metadata = {
  title: 'GS Morning Call Control',
  description: 'Painel de controle do Morning Call GS'
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
