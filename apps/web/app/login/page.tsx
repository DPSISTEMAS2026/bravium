'use client';

import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';

const features = [
    {
        icon: '📊',
        title: 'Conciliación bancaria',
        desc: 'Cruza automáticamente los datos de tus cartolas bancarias con los DTEs de tu empresa. Identifica qué documentos están pagados y al día, y detecta aquellos que podrían haber sido olvidados o que presentan diferencias.',
    },
    {
        icon: '📄',
        title: 'Gestión de DTEs y facturas',
        desc: 'Visualiza reportes y KPIs sobre la cantidad de DTEs y facturas que mantienen deuda o están al día. Obtén una panorámica clara del estado financiero de tu empresa en tiempo real.',
    },
    {
        icon: '🏦',
        title: 'Importación de cartolas bancarias',
        desc: 'Ingresa tu cartola y nuestra inteligencia artificial extrae los movimientos bancarios. Estos alimentan nuestro motor de matchs para conciliar movimientos de forma precisa y automática.',
    },
    {
        icon: '👥',
        title: 'Control de proveedores y pagos',
        desc: 'Resumen de saldos pendientes, cuándo y dónde se realizaron los pagos. ¿Tu proveedor pide un reporte? Con un botón exporta un documento resumen de su situación.',
    },
    {
        icon: '🔗',
        title: 'Sincronización con sistema de facturación',
        desc: 'Vía API, conectamos con tu servicio de facturación electrónica. Actualización al momento de documentos emitidos y recibidos, sin intervención manual.',
    },
];

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [focusedField, setFocusedField] = useState<string | null>(null);
    const [expandedFeature, setExpandedFeature] = useState<number | null>(null);
    const [showTerms, setShowTerms] = useState(false);
    const { login } = useAuth();
    const { branding } = useTenant();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);
        try {
            await login(email, password);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const orgName = branding?.name || null;

    return (
        <div className="login-page">
            {/* BG */}
            <div className="login-bg">
                <div className="login-bg-shape login-bg-shape-1" />
                <div className="login-bg-shape login-bg-shape-2" />
            </div>

            <div className="login-container">
                {/* ===== LEFT PANEL ===== */}
                <div className="login-left">
                    <div className="login-left-scroll">
                        {/* Logo */}
                        <div className="login-logo-area">
                            <img src="/logo-dp.png" alt="DP Sistemas" className="login-logo" />
                            <h2 className="login-brand-name">DP Sistemas</h2>
                            <p className="login-brand-tagline">Sistemas y Automatizaciones</p>
                        </div>

                        {/* Features */}
                        <div className="login-features">
                            <p className="login-features-title">¿Qué puedes hacer aquí?</p>
                            <div className="login-features-list">
                                {features.map((f, i) => (
                                    <div
                                        key={i}
                                        className={`login-feature-item ${expandedFeature === i ? 'expanded' : ''}`}
                                        onClick={() => setExpandedFeature(expandedFeature === i ? null : i)}
                                    >
                                        <div className="login-feature-header">
                                            <span className="login-feature-icon">{f.icon}</span>
                                            <span className="login-feature-title">{f.title}</span>
                                            <svg className="login-feature-chevron" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        </div>
                                        <div className="login-feature-desc">
                                            <p>{f.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Support */}
                        <div className="login-support">
                            <p className="login-support-title">¿Necesitas ayuda?</p>
                            <div className="login-support-buttons">
                                <a href="https://wa.me/56965524190" target="_blank" rel="noopener noreferrer" className="login-support-btn login-support-btn-wa">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                    </svg>
                                    <span>WhatsApp</span>
                                </a>
                                <a href="mailto:contacto@dpsistemas.cl" className="login-support-btn login-support-btn-email">
                                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                        <path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    <span>Correo</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ===== RIGHT PANEL ===== */}
                <div className="login-right">
                    <div className="login-form-wrapper">
                        {/* Mobile logo */}
                        <div className="login-mobile-logo">
                            <img src="/logo-dp.png" alt="DP" className="login-mobile-logo-img" />
                        </div>

                        <div className="login-header">
                            <h1 className="login-title">Iniciar sesión</h1>
                            <p className="login-subtitle">
                                {orgName
                                    ? `Ingresa tus credenciales de ${orgName}`
                                    : 'Ingresa tus credenciales para continuar'
                                }
                            </p>
                        </div>

                        {error && (
                            <div className="login-error">
                                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span>{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="login-form">
                            <div className={`login-field ${focusedField === 'email' ? 'focused' : ''}`}>
                                <label className="login-label" htmlFor="login-email">Correo electrónico</label>
                                <div className="login-input-wrap">
                                    <svg className="login-input-icon" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                        <path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    <input id="login-email" type="email" className="login-input" value={email} onChange={(e) => setEmail(e.target.value)} onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)} placeholder="tu@empresa.cl" required autoComplete="email" />
                                </div>
                            </div>

                            <div className={`login-field ${focusedField === 'password' ? 'focused' : ''}`}>
                                <label className="login-label" htmlFor="login-password">Contraseña</label>
                                <div className="login-input-wrap">
                                    <svg className="login-input-icon" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                        <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    <input id="login-password" type="password" className="login-input" value={password} onChange={(e) => setPassword(e.target.value)} onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)} placeholder="••••••••" required autoComplete="current-password" />
                                </div>
                            </div>

                            <button type="submit" className="login-submit" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <span className="login-spinner" />
                                ) : (
                                    <>
                                        <span>Iniciar sesión</span>
                                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="login-bottom">
                            <p className="login-footer-text">
                                Plataforma desarrollada por <strong>DP Sistemas</strong>
                            </p>
                            <button className="login-terms-link" onClick={() => setShowTerms(true)}>
                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                    <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span>Políticas de privacidad y términos</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== TERMS MODAL ===== */}
            {showTerms && (
                <div className="terms-overlay" onClick={() => setShowTerms(false)}>
                    <div className="terms-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="terms-modal-header">
                            <h2 className="terms-modal-title">
                                <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                    <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                Políticas de privacidad y términos de uso
                            </h2>
                            <button className="terms-close" onClick={() => setShowTerms(false)}>
                                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </button>
                        </div>
                        <div className="terms-modal-body">
                            <div className="terms-section">
                                <h3>🔒 Confidencialidad de la información</h3>
                                <p>Toda la información ingresada, procesada y almacenada en esta plataforma es estrictamente confidencial. Nos comprometemos a proteger los datos financieros, tributarios y operacionales de tu empresa con los más altos estándares de seguridad.</p>
                            </div>
                            <div className="terms-section">
                                <h3>🏢 Arquitectura Multi-Tenant segura</h3>
                                <p>Nuestra plataforma opera bajo una arquitectura multi-tenant con aislamiento total de datos. Esto significa que la información de cada organización está completamente separada y protegida. Ningún usuario o empresa puede acceder, visualizar o interactuar con datos de otra organización. El aislamiento se aplica a nivel de base de datos, APIs y sesiones de usuario.</p>
                            </div>
                            <div className="terms-section">
                                <h3>🛡️ Protección de datos</h3>
                                <p>No compartimos, vendemos ni transferimos tu información a terceros bajo ninguna circunstancia. Los datos se utilizan exclusivamente para proveer los servicios contratados: conciliación bancaria, gestión de DTEs y facturación electrónica.</p>
                            </div>
                            <div className="terms-section">
                                <h3>🔑 Control de acceso</h3>
                                <p>Cada cuenta está protegida con autenticación segura (JWT). Los accesos están restringidos mediante roles y permisos, garantizando que solo usuarios autorizados de tu organización puedan acceder a la información.</p>
                            </div>
                            <div className="terms-section">
                                <h3>📋 Términos del servicio</h3>
                                <p>El uso de esta plataforma está sujeto a la suscripción activa del servicio. DP Sistemas y Automatizaciones se reserva el derecho de suspender el acceso en caso de incumplimiento de pago o uso indebido de la plataforma. El servicio incluye soporte técnico, actualizaciones y mantenimiento continuo.</p>
                            </div>
                            <div className="terms-section">
                                <h3>📞 Contacto</h3>
                                <p>Para consultas sobre privacidad, términos o cualquier inquietud, contáctanos:</p>
                                <ul>
                                    <li><strong>WhatsApp:</strong> +56 9 6552 4190</li>
                                    <li><strong>Correo:</strong> contacto@dpsistemas.cl</li>
                                </ul>
                            </div>
                        </div>
                        <div className="terms-modal-footer">
                            <button className="terms-accept-btn" onClick={() => setShowTerms(false)}>Entendido</button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                /* ============ PAGE ============ */
                .login-page {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    overflow: hidden;
                    background: #f5f7fa;
                    padding: 1.5rem;
                    font-family: 'Inter', system-ui, -apple-system, sans-serif;
                }
                .login-bg { position: absolute; inset: 0; z-index: 0; overflow: hidden; }
                .login-bg-shape { position: absolute; border-radius: 50%; filter: blur(120px); }
                .login-bg-shape-1 { width: 500px; height: 500px; background: rgba(13,148,136,0.07); top: -15%; right: -8%; animation: shapeFloat 15s ease-in-out infinite alternate; }
                .login-bg-shape-2 { width: 400px; height: 400px; background: rgba(13,148,136,0.04); bottom: -10%; left: -5%; animation: shapeFloat 12s ease-in-out infinite alternate-reverse; }
                @keyframes shapeFloat { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(20px,-20px) scale(1.08); } }

                /* ============ CONTAINER ============ */
                .login-container {
                    position: relative; z-index: 1; display: flex; width: 100%; max-width: 1020px;
                    min-height: 640px; border-radius: 24px; overflow: hidden; background: #ffffff;
                    border: 1px solid #e5e9ef;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.03), 0 12px 40px rgba(0,0,0,0.06);
                    animation: containerEntry 0.7s cubic-bezier(0.16,1,0.3,1) forwards;
                    opacity: 0; transform: translateY(16px);
                }
                @keyframes containerEntry { to { opacity: 1; transform: translateY(0); } }

                /* ============ LEFT PANEL ============ */
                .login-left {
                    width: 440px; flex-shrink: 0;
                    background: linear-gradient(160deg, #f0fdfa 0%, #f0f9ff 50%, #f5f7fa 100%);
                    border-right: 1px solid #e8ecef;
                    overflow-y: auto;
                }
                .login-left-scroll {
                    padding: 2rem 2rem 1.5rem;
                    display: flex; flex-direction: column; min-height: 100%;
                }

                /* Logo */
                .login-logo-area { text-align: center; margin-bottom: 1.5rem; }
                .login-logo { height: 180px; width: 180px; object-fit: contain; margin: 0 auto; display: block; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.08)); }
                .login-brand-name { font-size: 1.2rem; font-weight: 700; color: #1a1a2e; margin: 0; letter-spacing: -0.02em; }
                .login-brand-tagline { font-size: 0.75rem; color: #8c95a6; margin: 0.1rem 0 0; }

                /* Features */
                .login-features { margin-bottom: 1.25rem; flex: 1; }
                .login-features-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #0d9488; margin: 0 0 0.6rem; }
                .login-features-list { display: flex; flex-direction: column; gap: 0.4rem; }
                .login-feature-item {
                    border-radius: 12px; background: rgba(255,255,255,0.7); border: 1px solid rgba(0,0,0,0.04);
                    cursor: pointer; transition: all 0.25s ease; overflow: hidden;
                }
                .login-feature-item:hover { background: #ffffff; border-color: rgba(13,148,136,0.15); }
                .login-feature-item.expanded { background: #ffffff; border-color: rgba(13,148,136,0.2); box-shadow: 0 2px 8px rgba(13,148,136,0.06); }
                .login-feature-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.55rem 0.75rem; }
                .login-feature-icon { font-size: 0.95rem; flex-shrink: 0; }
                .login-feature-title { font-size: 0.8rem; font-weight: 600; color: #374151; flex: 1; }
                .login-feature-chevron { color: #94a3b8; transition: transform 0.25s ease; flex-shrink: 0; }
                .login-feature-item.expanded .login-feature-chevron { transform: rotate(180deg); color: #0d9488; }
                .login-feature-desc {
                    max-height: 0; overflow: hidden; transition: max-height 0.3s ease, padding 0.3s ease;
                    padding: 0 0.75rem;
                }
                .login-feature-item.expanded .login-feature-desc {
                    max-height: 200px; padding: 0 0.75rem 0.65rem;
                }
                .login-feature-desc p { font-size: 0.75rem; color: #64748b; margin: 0; line-height: 1.55; }

                /* Support */
                .login-support { padding-top: 1rem; border-top: 1px solid rgba(0,0,0,0.06); }
                .login-support-title { font-size: 0.7rem; font-weight: 600; color: #64748b; margin: 0 0 0.5rem; }
                .login-support-buttons { display: flex; gap: 0.5rem; }
                .login-support-btn {
                    display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.85rem;
                    border-radius: 10px; font-size: 0.75rem; font-weight: 600; text-decoration: none;
                    transition: all 0.2s ease; flex: 1; justify-content: center;
                }
                .login-support-btn-wa { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
                .login-support-btn-wa:hover { background: #bbf7d0; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(34,197,94,0.15); }
                .login-support-btn-email { background: #f0fdfa; color: #0d9488; border: 1px solid #99f6e4; }
                .login-support-btn-email:hover { background: #ccfbf1; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(13,148,136,0.12); }

                /* ============ RIGHT PANEL ============ */
                .login-right { flex: 1; display: flex; align-items: center; justify-content: center; padding: 2.5rem; background: #ffffff; }
                .login-form-wrapper { width: 100%; max-width: 360px; }
                .login-mobile-logo { display: none; }
                .login-header { margin-bottom: 1.75rem; }
                .login-title { font-size: 1.5rem; font-weight: 700; color: #1a1a2e; margin: 0 0 0.35rem; letter-spacing: -0.02em; }
                .login-subtitle { font-size: 0.85rem; color: #8c95a6; margin: 0; }

                .login-error { display: flex; align-items: center; gap: 0.5rem; background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; font-size: 0.8rem; padding: 0.65rem 1rem; border-radius: 12px; margin-bottom: 1.25rem; animation: shakeError 0.4s ease; }
                @keyframes shakeError { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }

                .login-form { display: flex; flex-direction: column; gap: 1.1rem; }
                .login-field { display: flex; flex-direction: column; gap: 0.3rem; transition: transform 0.2s ease; }
                .login-field.focused { transform: translateY(-1px); }
                .login-label { font-size: 0.775rem; font-weight: 600; color: #4a5568; }
                .login-input-wrap { position: relative; }
                .login-input-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #b0b8c9; pointer-events: none; transition: color 0.2s; }
                .login-field.focused .login-input-icon { color: #0d9488; }
                .login-input { width: 100%; padding: 0.75rem 1rem 0.75rem 2.7rem; border: 1.5px solid #e2e7ed; border-radius: 12px; font-size: 0.9rem; color: #1a1a2e; background: #f8fafb; outline: none; transition: all 0.25s ease; box-sizing: border-box; font-family: inherit; }
                .login-input:focus { border-color: #0d9488; box-shadow: 0 0 0 3px rgba(13,148,136,0.1); background: #fff; }
                .login-input::placeholder { color: #b0b8c9; }

                .login-submit { width: 100%; padding: 0.8rem 1.5rem; border: none; border-radius: 12px; color: white; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.3s cubic-bezier(0.4,0,0.2,1); margin-top: 0.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; min-height: 48px; background: linear-gradient(135deg, #0d9488, #0f766e); font-family: inherit; position: relative; overflow: hidden; }
                .login-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(13,148,136,0.3); }
                .login-submit:active:not(:disabled) { transform: translateY(0); }
                .login-submit:disabled { opacity: 0.6; cursor: not-allowed; }
                .login-submit svg { transition: transform 0.2s; }
                .login-submit:hover:not(:disabled) svg { transform: translateX(3px); }
                .login-spinner { width: 22px; height: 22px; border: 2.5px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }

                /* Bottom */
                .login-bottom { margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid #f0f2f5; text-align: center; }
                .login-footer-text { font-size: 0.7rem; color: #a0a8b8; margin: 0 0 0.6rem; }
                .login-footer-text strong { color: #0d9488; font-weight: 600; }
                .login-terms-link {
                    display: inline-flex; align-items: center; gap: 0.35rem;
                    font-size: 0.7rem; color: #64748b; background: none; border: none;
                    cursor: pointer; padding: 0.35rem 0.75rem; border-radius: 8px;
                    transition: all 0.2s; font-family: inherit;
                }
                .login-terms-link:hover { color: #0d9488; background: #f0fdfa; }

                /* ============ TERMS MODAL ============ */
                .terms-overlay {
                    position: fixed; inset: 0; z-index: 9999;
                    background: rgba(0,0,0,0.4); backdrop-filter: blur(4px);
                    display: flex; align-items: center; justify-content: center;
                    padding: 1.5rem;
                    animation: overlayIn 0.2s ease;
                }
                @keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }
                .terms-modal {
                    width: 100%; max-width: 620px; max-height: 85vh;
                    background: #ffffff; border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.15);
                    display: flex; flex-direction: column;
                    animation: modalIn 0.3s cubic-bezier(0.16,1,0.3,1);
                    overflow: hidden;
                }
                @keyframes modalIn { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
                .terms-modal-header {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 1.25rem 1.5rem; border-bottom: 1px solid #f0f2f5;
                }
                .terms-modal-title { display: flex; align-items: center; gap: 0.5rem; font-size: 1rem; font-weight: 700; color: #1a1a2e; margin: 0; }
                .terms-modal-title svg { color: #0d9488; }
                .terms-close { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 0.35rem; border-radius: 8px; transition: all 0.2s; display: flex; }
                .terms-close:hover { background: #f1f5f9; color: #475569; }
                .terms-modal-body { padding: 1.5rem; overflow-y: auto; flex: 1; }
                .terms-section { margin-bottom: 1.25rem; }
                .terms-section:last-child { margin-bottom: 0; }
                .terms-section h3 { font-size: 0.875rem; font-weight: 700; color: #1e293b; margin: 0 0 0.4rem; }
                .terms-section p { font-size: 0.8rem; color: #64748b; margin: 0; line-height: 1.6; }
                .terms-section ul { margin: 0.5rem 0 0; padding-left: 1.25rem; }
                .terms-section li { font-size: 0.8rem; color: #64748b; margin-bottom: 0.25rem; }
                .terms-section li strong { color: #374151; }
                .terms-modal-footer { padding: 1rem 1.5rem; border-top: 1px solid #f0f2f5; display: flex; justify-content: flex-end; }
                .terms-accept-btn { padding: 0.6rem 1.5rem; border-radius: 10px; border: none; background: linear-gradient(135deg, #0d9488, #0f766e); color: white; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: inherit; }
                .terms-accept-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(13,148,136,0.25); }

                /* ============ RESPONSIVE ============ */
                @media (max-width: 768px) {
                    .login-container { flex-direction: column; max-width: 440px; min-height: auto; }
                    .login-left { display: none; }
                    .login-right { padding: 2rem 1.75rem; }
                    .login-mobile-logo { display: flex; justify-content: center; margin-bottom: 1.25rem; }
                    .login-mobile-logo-img { height: 100px; width: 100px; object-fit: contain; }
                }
            `}</style>
        </div>
    );
}
