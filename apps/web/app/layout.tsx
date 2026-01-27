import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '../contexts/AuthContext';
import { Shell } from '../components/layout/Shell';

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Bravium Internal System',
  description: 'Sistema de Gestión Financiera',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <AuthProvider>
          <Shell>
            {children}
          </Shell>
        </AuthProvider>
      </body>
    </html>
  )
}
