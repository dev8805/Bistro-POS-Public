import React, { useState } from 'react';
import { Screen } from '../types';

interface TrainingScreenProps {
    onNavigate: (screen: Screen) => void;
}

interface TrainingVideoResource {
    title: string;
    url: string;
    icon?: string;
}

interface TrainingVideo {
    id: string;
    title: string;
    description: string;
    videoUrl: string;
    duration: string;
    category: string;
    icon: string;
    hidden?: boolean;
    resources?: TrainingVideoResource[];
}

const TRAINING_CATEGORIES = [
    { id: 'all', label: 'Todos', icon: 'apps' },
    { id: 'inicio', label: 'Primeros Pasos', icon: 'rocket_launch' },
    { id: 'ventas', label: 'Punto de Venta', icon: 'payments' },
    { id: 'inventario', label: 'Inventario', icon: 'inventory' },
    { id: 'personal', label: 'Personal', icon: 'badge' },
    { id: 'reportes', label: 'Reportes', icon: 'bar_chart' },
];

// ⬇️ REEMPLAZA los videoUrl con tus videos reales (sube como "No listado" en YouTube / Cloudinary)
const TRAINING_VIDEOS: TrainingVideo[] = [
    {
        id: '1',
        title: 'Crear Productos',
        description: 'Aprende a registrar y organizar los productos o servicios de tu negocio paso a paso.',
        videoUrl: 'https://res.cloudinary.com/milenadelpilar/video/upload/v1774468972/Como_Crear_Productos_c6dqgf.mp4',
        duration: '3:00',
        category: 'inicio',
        icon: 'add_shopping_cart',
        hidden: true,
    },
    {
        id: '2',
        title: 'Registrar una Venta',
        description: 'Descubre cómo facturar, aplicar descuentos y cobrar a tus clientes rápidamente.',
        videoUrl: 'https://res.cloudinary.com/milenadelpilar/video/upload/v1774468970/Como_registrar_una_venta_sfyzrh.mp4',
        duration: '5:00',
        category: 'ventas',
        icon: 'point_of_sale',
        hidden: true,
    },
    {
        id: '3',
        title: 'Compra de Inventario',
        description: 'Mantén tu stock al día aprendiendo a registrar nuevas compras y proveedores.',
        videoUrl: 'https://res.cloudinary.com/milenadelpilar/video/upload/v1774468969/Compra_De_Inventario_nyaquc.mp4',
        duration: '4:00',
        category: 'inventario',
        icon: 'inventory_2',
        hidden: true,
    },
    {
        id: '4',
        title: 'Gastos y Mermas',
        description: 'Registra las salidas de dinero recurrentes y productos dañados para un cuadre exacto.',
        videoUrl: 'https://res.cloudinary.com/milenadelpilar/video/upload/v1774468972/Gastos_Y_Mermas_ikammk.mp4',
        duration: '3:00',
        category: 'inventario',
        icon: 'money_off',
        hidden: true,
    },
    {
        id: '5',
        title: 'Conectar Impresora',
        description: 'Configura tu impresora térmica en 3 pasos: instala QZ Tray, ejecuta el configurador de Bistro y elige tu impresora. Así imprimes sin avisos.',
        videoUrl: 'https://res.cloudinary.com/milenadelpilar/video/upload/v1774468970/Conectar_Impresora_ygaq86.mp4',
        duration: '5:00',
        category: 'ventas',
        icon: 'print',
        resources: [
            {
                title: '1. Descargar QZ Tray',
                url: 'https://qz.io/download/',
                icon: 'install_desktop'
            },
            {
                title: '2. Configurador Bistro (.zip)',
                url: 'https://hjjmwipqquynjopkswvu.supabase.co/storage/v1/object/public/Recursos/Configurador-Impresora-Bistro.zip',
                icon: 'download'
            }
        ]
    },
];

export const TrainingScreen: React.FC<TrainingScreenProps> = ({ onNavigate }) => {
    const [activeCategory, setActiveCategory] = useState('all');
    const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

    const getVideoThumbnail = (url: string): string => {
        if (url.includes('res.cloudinary.com')) {
            return url.replace('/video/upload/', '/video/upload/so_1,w_640,c_scale,f_auto,q_auto/').replace('.mp4', '.jpg');
        }
        return '';
    };

    const filteredVideos = (activeCategory === 'all'
        ? TRAINING_VIDEOS
        : TRAINING_VIDEOS.filter(v => v.category === activeCategory)
    ).filter(v => !v.hidden);

    const handlePlayVideo = (video: TrainingVideo) => {
        if (!video.videoUrl) return;
        setPlayingVideoId(video.id);
    };



    const activeCount = filteredVideos.filter(v => v.videoUrl).length;
    const totalCount = filteredVideos.length;

    return (
        <main className="flex-1 h-full overflow-hidden flex flex-col bg-background-light dark:bg-background-dark animate-fadeIn">
            {/* Header */}
            <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 bg-surface-light dark:bg-surface-dark px-4 sm:px-5 md:px-6 py-3 sm:py-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => onNavigate(Screen.SELL)}
                        className="p-2 rounded-xl text-text-secondary hover:text-text-main hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors md:hidden active:scale-95"
                        aria-label="Volver"
                        tabIndex={0}
                    >
                        <span className="material-symbols-outlined text-[22px]">arrow_back</span>
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-[22px] sm:text-[26px]">school</span>
                            Capacitación
                        </h1>
                        <p className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">
                            Aprende a usar Bistro POS con videos paso a paso
                        </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">
                        <span className="material-symbols-outlined text-[14px]">play_circle</span>
                        {activeCount}/{totalCount} disponibles
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-5xl mx-auto px-4 sm:px-5 md:px-6 py-4 sm:py-5 md:py-6">

                    {/* Category Filter — wrap en todas las pantallas */}
                    <div className="flex flex-wrap gap-2 pb-3 mb-4 sm:mb-6">
                        {TRAINING_CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all active:scale-95 ${activeCategory === cat.id
                                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                                    : 'bg-surface-light dark:bg-surface-dark border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                                    }`}
                                tabIndex={0}
                                aria-label={`Filtrar por ${cat.label}`}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Videos Grid: 1 col móvil → 2 col tablet/desktop */}
                    <div className="grid grid-cols-1 min-[430px]:grid-cols-2 gap-3 sm:gap-4 md:gap-5">
                        {filteredVideos.map((video, idx) => (
                            <div
                                key={`${activeCategory}-${video.id}`}
                                className="bg-surface-light dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 will-change-transform animate-cardEntry"
                                style={{ animationDelay: `${idx * 70}ms` }}
                            >
                                {/* Video Player / Thumbnail */}
                                <div className="relative aspect-video bg-gray-900 overflow-hidden">
                                    {playingVideoId === video.id && video.videoUrl ? (
                                        <video
                                            src={video.videoUrl}
                                            className="absolute inset-0 w-full h-full object-contain bg-black"
                                            controls
                                            autoPlay
                                            playsInline
                                        />
                                    ) : (
                                        <button
                                            onClick={() => handlePlayVideo(video)}
                                            className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-2 sm:gap-3 bg-gradient-to-br from-gray-800 via-gray-850 to-gray-900 cursor-pointer group/play active:scale-[0.98] transition-transform"
                                            disabled={!video.videoUrl}
                                            aria-label={`Reproducir ${video.title}`}
                                            tabIndex={0}
                                        >
                                            {video.videoUrl ? (
                                                <>
                                                    {getVideoThumbnail(video.videoUrl) && (
                                                        <img
                                                            src={getVideoThumbnail(video.videoUrl)}
                                                            alt={video.title}
                                                            className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover/play:opacity-90 transition-opacity duration-300"
                                                            loading="lazy"
                                                        />
                                                    )}
                                                    <div className="relative z-10 size-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-primary/90 rounded-full flex items-center justify-center shadow-xl group-hover/play:scale-110 transition-transform backdrop-blur-sm">
                                                        <span className="material-symbols-outlined text-white text-2xl sm:text-3xl ml-0.5">play_arrow</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="size-14 sm:w-16 sm:h-16 bg-gray-700/30 rounded-2xl flex items-center justify-center border border-gray-600/20">
                                                        <span className="material-symbols-outlined text-gray-500 text-2xl sm:text-3xl">{video.icon}</span>
                                                    </div>
                                                    <span className="text-gray-500 text-xs sm:text-sm font-medium">Próximamente</span>
                                                </>
                                            )}

                                            {/* Duration Badge */}
                                            <span className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-black/70 rounded-md text-white text-[10px] sm:text-xs font-medium backdrop-blur-sm">
                                                {video.duration}
                                            </span>
                                        </button>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="p-3 sm:p-4">
                                    <div className="flex items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base leading-tight truncate">
                                                {video.title}
                                            </h3>
                                            <p className="text-[11px] sm:text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 line-clamp-2">
                                                {video.description}
                                            </p>
                                            {video.resources && video.resources.length > 0 && (
                                                <div className="mt-2.5 flex flex-wrap gap-2">
                                                    {video.resources.map((resource, i) => (
                                                        <a
                                                            key={`resource-${i}`}
                                                            href={resource.url || '#'}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] sm:text-xs font-bold transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/40"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <span className="material-symbols-outlined text-[14px]">
                                                                {resource.icon || 'download'}
                                                            </span>
                                                            {resource.title}
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <span className={`shrink-0 mt-0.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wide ${video.videoUrl
                                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                                            : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                                            }`}>
                                            {video.videoUrl ? 'Listo' : 'Pronto'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {filteredVideos.length === 0 && (
                        <div className="text-center py-12 sm:py-16">
                            <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-5xl sm:text-6xl mb-3 sm:mb-4 block">video_library</span>
                            <p className="text-gray-500 dark:text-gray-400 font-medium text-sm sm:text-base">No hay videos en esta categoría</p>
                        </div>
                    )}

                    {/* Bottom safe area spacer for mobile nav */}
                    <div className="h-4 sm:h-0" />
                </div>
            </div>

        </main>
    );
};
