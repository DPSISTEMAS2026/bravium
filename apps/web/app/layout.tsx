import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import './globals.css';

export const metadata = {
    title: 'Bravium | Conciliación Inteligente',
    description: 'Sistema financiero para empresas modernas',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es">
            <body className="bg-slate-50 text-slate-900 font-sans antialiased">
                <Sidebar />
                <Header />
                <main className="ml-64 mt-16 p-8 h-[calc(100vh-64px)] overflow-y-auto">
                    {children}
                </main>
            </body>
        </html>
    );
}
