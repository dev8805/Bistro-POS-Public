import React, { useEffect, useRef } from 'react';
import { Screen } from '../types';

interface LandingScreenProps {
    onNavigate: (screen: Screen) => void;
}

const MockupDashboard = () => (
    <div className="w-full bg-[#eef2f6] rounded-xl p-3 sm:p-4 space-y-3" style={{ fontFamily: 'DM Sans, sans-serif' }}>
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <div className="size-6 rounded bg-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary-text text-xs">point_of_sale</span>
                </div>
                <span className="text-xs font-bold text-gray-700">Dashboard</span>
            </div>
            <div className="flex gap-1">
                <div className="size-2 rounded-full bg-red-400" />
                <div className="size-2 rounded-full bg-yellow-400" />
                <div className="size-2 rounded-full bg-green-400" />
            </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-lg p-2.5 shadow-sm">
                <p className="text-[9px] text-gray-400 mb-0.5">Ventas Netas</p>
                <p className="text-sm font-bold text-gray-800">$1.2M</p>
                <span className="text-[8px] font-semibold text-emerald-600 bg-emerald-50 px-1 rounded">+12%</span>
            </div>
            <div className="bg-white rounded-lg p-2.5 shadow-sm">
                <p className="text-[9px] text-gray-400 mb-0.5">Utilidad Real</p>
                <p className="text-sm font-bold text-emerald-600">$480K</p>
                <span className="text-[8px] font-semibold text-emerald-600 bg-emerald-50 px-1 rounded">38.2%</span>
            </div>
            <div className="bg-white rounded-lg p-2.5 shadow-sm">
                <p className="text-[9px] text-gray-400 mb-0.5">Ticket Prom.</p>
                <p className="text-sm font-bold text-gray-800">$18.5K</p>
                <span className="text-[8px] font-semibold text-emerald-600 bg-emerald-50 px-1 rounded">+5%</span>
            </div>
        </div>
        <div className="bg-white rounded-lg p-2.5 shadow-sm">
            <p className="text-[9px] text-gray-400 mb-2">Ventas Totales</p>
            <div className="flex items-end gap-1 h-12">
                {[35, 50, 45, 65, 40, 70, 55, 80, 60, 75, 90, 85].map((h, i) => (
                    <div key={`bar-${i}`} className="flex-1 rounded-t" style={{ height: `${h}%`, backgroundColor: i === 11 ? '#fbbf24' : '#fffbeb' }} />
                ))}
            </div>
        </div>
    </div>
);

const MockupPOS = () => (
    <div className="w-full bg-white rounded-xl p-3 sm:p-4 shadow-lg space-y-2.5" style={{ fontFamily: 'DM Sans, sans-serif' }}>
        <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700">Orden Rápida</span>
            <div className="flex items-center gap-1 text-[9px] text-gray-400">
                <span className="material-symbols-outlined text-xs">search</span>
                Buscar producto
            </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
            {[
                { name: 'Arroz x lb', price: '$3,200', color: 'bg-amber-50 border-amber-200' },
                { name: 'Aceite 1L', price: '$12,500', color: 'bg-yellow-50 border-yellow-200' },
                { name: 'Leche x Lt', price: '$4,800', color: 'bg-sky-50 border-sky-200' },
                { name: 'Huevos x30', price: '$18,900', color: 'bg-orange-50 border-orange-200' },
                { name: 'Pan tajado', price: '$5,600', color: 'bg-rose-50 border-rose-200' },
                { name: 'Café 500g', price: '$15,200', color: 'bg-emerald-50 border-emerald-200' },
            ].map((p) => (
                <div key={p.name} className={`${p.color} border rounded-lg p-1.5 text-center`}>
                    <p className="text-[9px] font-medium text-gray-700 truncate">{p.name}</p>
                    <p className="text-[10px] font-bold text-gray-900">{p.price}</p>
                </div>
            ))}
        </div>
        <div className="bg-primary rounded-lg p-2 flex items-center justify-between">
            <div>
                <p className="text-[9px] text-primary-text/80">3 items</p>
                <p className="text-xs font-bold text-primary-text">$20,500</p>
            </div>
            <div className="bg-black/10 rounded px-2 py-1 text-[9px] font-bold text-primary-text">Cobrar →</div>
        </div>
    </div>
);

const MockupInventory = () => (
    <div className="w-full bg-white rounded-xl p-3 sm:p-4 shadow-lg space-y-2.5" style={{ fontFamily: 'DM Sans, sans-serif' }}>
        <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700">Inventario</span>
            <span className="text-[9px] text-gray-400">124 productos</span>
        </div>
        <div className="space-y-1.5">
            {[
                { name: 'Arroz Diana x lb', stock: 48, status: 'ok', cost: '$2,400' },
                { name: 'Aceite Girasol 1L', stock: 12, status: 'ok', cost: '$9,800' },
                { name: 'Azúcar x lb', stock: 3, status: 'low', cost: '$2,100' },
                { name: 'Harina PAN', stock: 0, status: 'out', cost: '$4,500' },
            ].map((p) => (
                <div key={p.name} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                    <div className="flex items-center gap-2">
                        <div className="size-6 bg-gray-100 rounded flex items-center justify-center">
                            <span className="material-symbols-outlined text-gray-400 text-xs">package_2</span>
                        </div>
                        <div>
                            <p className="text-[10px] font-medium text-gray-700">{p.name}</p>
                            <p className="text-[8px] text-gray-400">Costo: {p.cost}</p>
                        </div>
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${p.status === 'ok' ? 'bg-status-success text-white' : p.status === 'low' ? 'bg-status-warning text-white' : 'bg-status-error text-white'}`}>
                        {p.stock} uds
                    </span>
                </div>
            ))}
        </div>
    </div>
);

export const LandingScreen: React.FC<LandingScreenProps> = ({ onNavigate }) => {
    const benefitsRef = useRef<HTMLDivElement>(null);
    const pricingRef = useRef<HTMLDivElement>(null);

    const handleScrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
        ref.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleOpenLogin = () => {
        const url = `${window.location.origin}${window.location.pathname}#login`;
        window.open(url, '_blank');
    };

    const handleOpenRegister = () => {
        const url = `${window.location.origin}${window.location.pathname}#register`;
        window.open(url, '_blank');
    };

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('lnd-visible');
                    }
                });
            },
            { threshold: 0.1 }
        );
        const els = document.querySelectorAll('.lnd-anim');
        els.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    return (
        <div className="min-h-screen bg-white overflow-x-hidden">
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Outfit:wght@300;400;500;600;700;800&display=swap');
        .lnd-anim { opacity:0; transform:translateY(28px); transition:opacity .7s ease, transform .7s ease; }
        .lnd-visible { opacity:1; transform:translateY(0); }
        .lnd-d1{transition-delay:.1s} .lnd-d2{transition-delay:.2s} .lnd-d3{transition-delay:.3s}
        .lnd-d4{transition-delay:.4s} .lnd-d5{transition-delay:.5s} .lnd-d6{transition-delay:.6s}
      `}</style>

            {/* ── Navbar ── */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-100/80">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center">
                        <span style={{ fontFamily: 'Outfit, sans-serif' }} className="text-xl font-extrabold text-gray-900 tracking-tight">
                            Bistro<span className="text-primary">POS</span>
                        </span>
                    </div>
                    <div className="hidden sm:flex items-center gap-6">
                        <button onClick={() => handleScrollTo(benefitsRef)} className="text-sm font-medium text-gray-500 hover:text-primary-active transition-colors" style={{ fontFamily: 'DM Sans, sans-serif' }}>Beneficios</button>
                        <button onClick={() => handleScrollTo(pricingRef)} className="text-sm font-medium text-gray-500 hover:text-primary-active transition-colors" style={{ fontFamily: 'DM Sans, sans-serif' }}>Precio</button>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-2.5">
                        <button onClick={handleOpenLogin} className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-gray-600 hover:text-primary-active transition-colors border border-gray-200 rounded-lg hover:border-primary/30" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                            <span className="sm:hidden">Entrar</span>
                            <span className="hidden sm:inline">Iniciar Sesión</span>
                        </button>
                        <button onClick={handleOpenRegister} className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold text-primary-text bg-primary hover:bg-primary-hover rounded-lg transition-all shadow-sm hover:shadow-md" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                            Regístrate
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section className="relative pt-24 pb-8 sm:pt-32 sm:pb-16 overflow-hidden bg-gradient-to-br from-amber-50 via-white to-amber-50">
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/[0.04] rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />

                <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary-active rounded-full text-xs font-semibold mb-5" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                                <span className="material-symbols-outlined text-sm">verified</span>
                                7 días gratis · Sin tarjeta de crédito
                            </div>
                            <h1 style={{ fontFamily: 'Outfit, sans-serif' }} className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold text-gray-900 leading-[1.1] tracking-tight">
                                El punto de venta<br />
                                <span className="text-primary">que tu negocio necesita</span>
                            </h1>
                            <p style={{ fontFamily: 'DM Sans, sans-serif' }} className="mt-5 text-base sm:text-lg text-gray-500 leading-relaxed max-w-md">
                                Controla tus ventas, inventario, clientes y gastos desde cualquier dispositivo. Diseñado para negocios retail en Colombia.
                            </p>
                            <div className="mt-7 flex flex-col sm:flex-row gap-3">
                                <button onClick={handleOpenRegister} className="px-7 py-3.5 text-base font-bold text-primary-text bg-primary hover:bg-primary-hover rounded-xl transition-all shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 flex items-center justify-center gap-2" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                                    <span className="material-symbols-outlined text-xl">rocket_launch</span>
                                    Prueba Gratis 7 Días
                                </button>
                                <button onClick={handleOpenLogin} className="px-7 py-3.5 text-base font-semibold text-gray-600 bg-white hover:bg-gray-50 rounded-xl border border-gray-200 transition-all flex items-center justify-center gap-2" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                                    Ya tengo cuenta
                                </button>
                            </div>
                            <div className="mt-5 flex items-center gap-4 text-xs text-gray-400" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm text-primary">smartphone</span>Celular</span>
                                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm text-primary">tablet</span>Tablet</span>
                                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm text-primary">computer</span>PC</span>
                            </div>
                        </div>
                        <div className="relative lnd-anim lnd-visible">
                            <div className="relative z-10 transform rotate-1 hover:rotate-0 transition-transform duration-500">
                                <MockupDashboard />
                            </div>
                            <div className="absolute -bottom-4 -right-4 w-3/5 z-20 transform -rotate-2 hover:rotate-0 transition-transform duration-500 hidden sm:block">
                                <MockupPOS />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── ¿Qué es BistroPOS? ── */}
            <section className="py-16 sm:py-20 bg-white">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
                    <div className="lnd-anim">
                        <span className="material-symbols-outlined text-4xl text-primary mb-4 inline-block">help</span>
                        <h2 style={{ fontFamily: 'Outfit, sans-serif' }} className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-4">
                            ¿Qué es BistroPOS?
                        </h2>
                        <p style={{ fontFamily: 'DM Sans, sans-serif' }} className="text-base text-gray-500 max-w-2xl mx-auto leading-relaxed">
                            Es un <strong className="text-gray-700">sistema de punto de venta</strong> diseñado para tiendas, minimercados, papelerías y ferreterías en Colombia. Maneja todo lo que necesitas: ventas, inventario, clientes, empleados y reportes — desde tu celular o computador.
                        </p>
                    </div>
                    <div className="mt-8 lnd-anim lnd-d1">
                        <button onClick={handleOpenRegister} className="px-6 py-3 text-sm font-bold text-primary-text bg-primary hover:bg-primary-hover rounded-xl transition-all shadow-md" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                            Conocer BistroPOS →
                        </button>
                    </div>
                </div>
            </section>

            {/* ── Beneficios ── */}
            <section ref={benefitsRef} className="py-16 sm:py-24 bg-[#f8fafb]">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                    <div className="text-center mb-14">
                        <h2 style={{ fontFamily: 'Outfit, sans-serif' }} className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight lnd-anim">
                            Todo lo que necesitas para vender
                        </h2>
                        <p style={{ fontFamily: 'DM Sans, sans-serif' }} className="mt-3 text-gray-500 text-base max-w-md mx-auto lnd-anim lnd-d1">
                            Herramientas profesionales pensadas para tu día a día
                        </p>
                    </div>

                    {/* Feature Row 1: Ventas + Mockup */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12 items-center">
                        <div className="lnd-anim order-2 lg:order-1">
                            <MockupPOS />
                        </div>
                        <div className="lnd-anim lnd-d1 order-1 lg:order-2">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/20 text-text-main rounded-full text-xs font-semibold mb-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                                <span className="material-symbols-outlined text-sm">shopping_cart</span>
                                Ventas Rápidas
                            </div>
                            <h3 style={{ fontFamily: 'Outfit, sans-serif' }} className="text-2xl font-semibold text-gray-900 mb-3">
                                Cobra en segundos
                            </h3>
                            <p style={{ fontFamily: 'DM Sans, sans-serif' }} className="text-sm text-gray-500 leading-relaxed mb-4">
                                Orden rápida para el mostrador, gestión de mesas para restaurantes. Acepta efectivo, Nequi, Daviplata, tarjeta y transferencia. Recibos digitales al instante.
                            </p>
                            <ul style={{ fontFamily: 'DM Sans, sans-serif' }} className="space-y-2">
                                {['Múltiples métodos de pago', 'Búsqueda rápida de productos', 'Gestión de mesas'].map(f => (
                                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                                        <span className="material-symbols-outlined text-primary-active text-base">check_circle</span>{f}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Feature Row 2: Dashboard + Mockup */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12 items-center">
                        <div className="lnd-anim">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-50 text-violet-700 rounded-full text-xs font-semibold mb-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                                <span className="material-symbols-outlined text-sm">bar_chart</span>
                                Dashboard Inteligente
                            </div>
                            <h3 style={{ fontFamily: 'Outfit, sans-serif' }} className="text-2xl font-semibold text-gray-900 mb-3">
                                Conoce tu negocio en tiempo real
                            </h3>
                            <p style={{ fontFamily: 'DM Sans, sans-serif' }} className="text-sm text-gray-500 leading-relaxed mb-4">
                                Ventas netas, utilidad real, ticket promedio, productos estrella, análisis de rotación y diagnóstico financiero. Todo calculado automáticamente.
                            </p>
                            <ul style={{ fontFamily: 'DM Sans, sans-serif' }} className="space-y-2">
                                {['KPIs de negocio automáticos', 'Gráficas de ventas por período', 'Diagnóstico financiero con P&L'].map(f => (
                                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                                        <span className="material-symbols-outlined text-violet-600 text-base">check_circle</span>{f}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="lnd-anim lnd-d1">
                            <MockupDashboard />
                        </div>
                    </div>

                    {/* Feature Row 3: Inventario + Mockup */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                        <div className="lnd-anim order-2 lg:order-1">
                            <MockupInventory />
                        </div>
                        <div className="lnd-anim lnd-d1 order-1 lg:order-2">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-sky-50 text-sky-700 rounded-full text-xs font-semibold mb-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                                <span className="material-symbols-outlined text-sm">inventory_2</span>
                                Inventario
                            </div>
                            <h3 style={{ fontFamily: 'Outfit, sans-serif' }} className="text-2xl font-semibold text-gray-900 mb-3">
                                Controla tu stock sin esfuerzo
                            </h3>
                            <p style={{ fontFamily: 'DM Sans, sans-serif' }} className="text-sm text-gray-500 leading-relaxed mb-4">
                                Se actualiza automáticamente con cada venta. Alertas de stock bajo, análisis de rotación y valorización de inventario a costo y precio de venta.
                            </p>
                            <ul style={{ fontFamily: 'DM Sans, sans-serif' }} className="space-y-2">
                                {['Descuento automático por venta', 'Alertas de stock bajo', 'Valor del inventario en tiempo real'].map(f => (
                                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                                        <span className="material-symbols-outlined text-sky-600 text-base">check_circle</span>{f}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Más funcionalidades (cards) ── */}
            <section className="py-16 sm:py-20 bg-white">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                    <div className="text-center mb-12">
                        <h2 style={{ fontFamily: 'Outfit, sans-serif' }} className="text-2xl sm:text-3xl font-semibold text-gray-900 lnd-anim">
                            Y mucho más incluido
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
                        {[
                            { icon: 'groups', title: 'Clientes y Cuentas', desc: 'Registro de clientes, cuentas por cobrar, historial de compras y control de deudas.', color: '#c2410c', bg: 'bg-orange-50' },
                            { icon: 'badge', title: 'Empleados y Roles', desc: 'Cajero y administrador con permisos diferenciados. Controla quién ve qué.', color: '#0e7490', bg: 'bg-cyan-50' },
                        ].map((item, i) => (
                            <div key={item.title} className={`lnd-anim lnd-d${i + 1} p-6 rounded-2xl border border-gray-100 hover:border-[#047857]/20 hover:shadow-lg hover:shadow-[#047857]/5 transition-all duration-300`}>
                                <div className={`size-11 rounded-xl ${item.bg} flex items-center justify-center mb-4`}>
                                    <span className="material-symbols-outlined text-xl" style={{ color: item.color }}>{item.icon}</span>
                                </div>
                                <h3 style={{ fontFamily: 'Outfit, sans-serif' }} className="text-base font-semibold text-gray-900 mb-1.5">{item.title}</h3>
                                <p style={{ fontFamily: 'DM Sans, sans-serif' }} className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Tipos de Producto ── */}
            <section className="py-16 sm:py-20 bg-gradient-to-br from-gray-900 via-gray-900 to-[#022c22]">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                    <div className="text-center mb-12">
                        <h2 style={{ fontFamily: 'Outfit, sans-serif' }} className="text-3xl sm:text-4xl font-semibold text-white tracking-tight lnd-anim">
                            Tres tipos de producto, un solo sistema
                        </h2>
                        <p style={{ fontFamily: 'DM Sans, sans-serif' }} className="mt-3 text-gray-400 text-base max-w-md mx-auto lnd-anim lnd-d1">
                            Registra cualquier cosa que vendas
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        {[
                            { icon: 'storefront', title: 'Retail', desc: 'Productos de venta directa con control de stock. Ideal para tiendas y minimercados.', accent: '#10b981' },
                            { icon: 'menu_book', title: 'Recetas', desc: 'Productos elaborados con control de ingredientes y costos. Calcula precios automáticamente.', accent: '#a78bfa' },
                            { icon: 'home_repair_service', title: 'Servicios', desc: 'Servicios sin inventario físico. Perfecto para reparaciones, instalaciones y más.', accent: '#38bdf8' },
                        ].map((item, i) => (
                            <div key={item.title} className={`lnd-anim lnd-d${i + 1} p-7 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm text-center hover:bg-white/10 transition-all`}>
                                <div className="size-14 rounded-2xl mx-auto mb-5 flex items-center justify-center" style={{ backgroundColor: `${item.accent}20` }}>
                                    <span className="material-symbols-outlined text-2xl" style={{ color: item.accent }}>{item.icon}</span>
                                </div>
                                <h3 style={{ fontFamily: 'Outfit, sans-serif' }} className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                                <p style={{ fontFamily: 'DM Sans, sans-serif' }} className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Cómo Funciona ── */}
            <section className="py-16 sm:py-24 bg-[#f8fafb]">
                <div className="max-w-5xl mx-auto px-4 sm:px-6">
                    <div className="text-center mb-14">
                        <h2 style={{ fontFamily: 'Outfit, sans-serif' }} className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight lnd-anim">
                            Empieza en 3 pasos
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {[
                            { step: '1', title: 'Crea tu cuenta', desc: 'Regístrate en menos de 30 segundos. Sin tarjeta de crédito. Sin compromisos.', icon: 'person_add', color: '#047857' },
                            { step: '2', title: 'Configura productos', desc: 'Agrega tus productos, categorías y precios. Puedes empezar con solo uno.', icon: 'tune', color: '#7c3aed' },
                            { step: '3', title: 'Empieza a vender', desc: 'Tu punto de venta listo para facturar desde el primer día.', icon: 'rocket_launch', color: '#0369a1' },
                        ].map((item, i) => (
                            <div key={item.step} className={`lnd-anim lnd-d${i + 1} text-center bg-white rounded-2xl p-8 border border-gray-100 shadow-sm`}>
                                <div className="size-14 rounded-2xl mx-auto mb-5 flex items-center justify-center" style={{ backgroundColor: `${item.color}12` }}>
                                    <span className="material-symbols-outlined text-2xl" style={{ color: item.color }}>{item.icon}</span>
                                </div>
                                <div className="size-8 rounded-full bg-primary text-primary-text flex items-center justify-center mx-auto mb-3 text-sm font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                    {item.step}
                                </div>
                                <h3 style={{ fontFamily: 'Outfit, sans-serif' }} className="text-base font-semibold text-gray-900 mb-1.5">{item.title}</h3>
                                <p style={{ fontFamily: 'DM Sans, sans-serif' }} className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Pricing ── */}
            <section ref={pricingRef} className="py-16 sm:py-24 bg-white">
                <div className="max-w-xl mx-auto px-4 sm:px-6">
                    <div className="text-center mb-10">
                        <h2 style={{ fontFamily: 'Outfit, sans-serif' }} className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight lnd-anim">
                            Un solo plan, todo incluido
                        </h2>
                        <p style={{ fontFamily: 'DM Sans, sans-serif' }} className="mt-3 text-gray-500 text-base lnd-anim lnd-d1">
                            Sin sorpresas, sin letras pequeñas
                        </p>
                    </div>

                    <div className="lnd-anim lnd-d2 bg-white rounded-3xl border-2 border-primary/20 shadow-xl shadow-primary/10 overflow-hidden">
                        <div className="bg-primary px-6 py-3.5 text-center">
                            <span className="text-primary-text text-sm font-bold" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                                🎉 7 días gratis para que lo pruebes todo
                            </span>
                        </div>
                        <div className="p-8 sm:p-10 text-center">
                            <div className="flex items-baseline justify-center gap-1.5">
                                <span style={{ fontFamily: 'Outfit, sans-serif' }} className="text-5xl sm:text-6xl font-extrabold text-gray-900">$29,000</span>
                                <span style={{ fontFamily: 'DM Sans, sans-serif' }} className="text-gray-400 text-lg font-medium">COP/mes</span>
                            </div>
                            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-semibold" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                                <span className="material-symbols-outlined text-xs">loyalty</span>
                                Primer pago cubre 2 meses
                            </div>
                            <ul className="mt-8 space-y-3 text-left max-w-xs mx-auto" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                                {[
                                    'Ventas ilimitadas',
                                    'Inventario completo',
                                    'Dashboard y reportes',
                                    'Gestión de clientes',
                                    'Empleados y roles',
                                    'Productos retail, recetas y servicios',
                                    'Multi-dispositivo',
                                ].map((f) => (
                                    <li key={f} className="flex items-center gap-3 text-sm text-gray-600">
                                        <span className="material-symbols-outlined text-primary-active text-base flex-shrink-0">check_circle</span>
                                        {f}
                                    </li>
                                ))}
                            </ul>
                            <button
                                onClick={handleOpenRegister}
                                className="mt-8 w-full py-4 text-base font-bold text-primary-text bg-primary hover:bg-primary-hover rounded-xl transition-all shadow-lg shadow-primary/20 hover:shadow-xl flex items-center justify-center gap-2"
                                style={{ fontFamily: 'DM Sans, sans-serif' }}
                            >
                                <span className="material-symbols-outlined text-xl">rocket_launch</span>
                                Comenzar Prueba Gratis
                            </button>
                            <p className="mt-3 text-xs text-gray-400" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                                Sin contratos · Cancela cuando quieras
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Confianza ── */}
            <section className="py-14 bg-[#f8fafb] border-t border-gray-100">
                <div className="max-w-4xl mx-auto px-4 sm:px-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
                        {[
                            { icon: 'lock', title: 'Pagos Seguros', desc: 'Procesados por Wompi, plataforma certificada en Colombia' },
                            { icon: 'cloud_done', title: 'Datos en la Nube', desc: 'Tu información protegida y disponible desde cualquier lugar' },
                            { icon: 'devices', title: 'Multi-dispositivo', desc: 'Celular, tablet y computador siempre sincronizados' },
                        ].map((item, i) => (
                            <div key={item.title} className={`lnd-anim lnd-d${i + 1}`}>
                                <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                                    <span className="material-symbols-outlined text-xl text-primary-active">{item.icon}</span>
                                </div>
                                <h4 style={{ fontFamily: 'Outfit, sans-serif' }} className="text-sm font-semibold text-gray-900 mb-1">{item.title}</h4>
                                <p style={{ fontFamily: 'DM Sans, sans-serif' }} className="text-xs text-gray-500">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA Final ── */}
            <section className="py-16 sm:py-20 bg-gradient-to-r from-primary-active to-primary-hover">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
                    <h2 style={{ fontFamily: 'Outfit, sans-serif' }} className="text-3xl sm:text-4xl font-semibold text-white tracking-tight lnd-anim">
                        Empieza hoy, <span className="text-primary-light/80">gratis</span>
                    </h2>
                    <p style={{ fontFamily: 'DM Sans, sans-serif' }} className="mt-4 text-white/90 text-base max-w-md mx-auto lnd-anim lnd-d1">
                        7 días con acceso completo. Sin tarjeta. Sin compromisos.
                    </p>
                    <button
                        onClick={handleOpenRegister}
                        className="mt-8 px-10 py-4 text-base font-bold text-gray-900 bg-white hover:bg-gray-50 rounded-xl transition-all shadow-xl hover:shadow-2xl flex items-center justify-center gap-2 mx-auto lnd-anim lnd-d2"
                        style={{ fontFamily: 'DM Sans, sans-serif' }}
                    >
                        <span className="material-symbols-outlined text-xl">rocket_launch</span>
                        Crear Mi Cuenta Gratis
                    </button>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="py-8 bg-gray-900">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center">
                        <span style={{ fontFamily: 'Outfit, sans-serif' }} className="text-sm font-bold text-white">
                            Bistro<span className="text-primary">POS</span>
                        </span>
                    </div>
                    <p style={{ fontFamily: 'DM Sans, sans-serif' }} className="text-xs text-gray-500">
                        © {new Date().getFullYear()} BistroPOS. Todos los derechos reservados.
                    </p>
                </div>
            </footer>
        </div>
    );
};

export default LandingScreen;
