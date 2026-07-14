import './globals.css';

export const metadata = {
  title: 'Axis Morning Call Control',
  description: 'Painel de controle do Morning Call Axis'
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
