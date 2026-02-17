'use client';

export default function Header() {
    return (
        <header className="p-3 mb-3 border-bottom bg-white sticky-top shadow-sm">
            <div className="container-fluid d-flex justify-content-between align-items-center">
                <span className="text-secondary fw-semibold small">Bravium | Sistema de Gestión Financiera</span>
                <div className="d-flex align-items-center">
                    <div className="d-flex align-items-center me-3 px-2 py-1 bg-light rounded-pill border">
                        <div className="w-2 h-2 rounded-circle bg-success me-2 mx-1 shadow-sm" style={{ width: 8, height: 8 }}></div>
                        <span className="text-success fw-bold" style={{ fontSize: '10px' }}>Sistema Sincronizado</span>
                    </div>
                    <span className="badge bg-dark rounded-pill px-3 py-2" style={{ fontSize: '10px' }}>v1.0 Internal</span>
                </div>
            </div>
        </header>
    );
}
