export function Header() {
    return (
        <header className="p-3 mb-3 border-bottom bg-white sticky-top">
            <div className="container-fluid d-flex justify-content-between align-items-center">
                <span className="text-secondary fw-semibold">Sistema de Gestión Financiera</span>
                <div className="d-flex align-items-center">
                    <button className="btn btn-outline-secondary btn-sm me-2">
                        <span className="small">Notificaciones</span>
                    </button>
                    <span className="badge bg-primary rounded-pill">v1.0 Internal</span>
                </div>
            </div>
        </header>
    );
}
