import React from 'react';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

/**
 * ErrorBoundary - Captura errores en componentes hijos y muestra un fallback
 * Evita que un error en un componente crashee toda la aplicación
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }
    }

    handleRetry = (): void => {
        this.setState({ hasError: false, error: null });
    };

    render(): React.ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // Default fallback UI
            return (
                <div className="flex flex-col items-center justify-center h-full min-h-[200px] p-6 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                    <span className="material-symbols-outlined text-5xl text-red-500 dark:text-red-400 mb-4">
                        error
                    </span>
                    <h2 className="text-lg font-semibold text-red-700 dark:text-red-300 mb-2">
                        Algo salió mal
                    </h2>
                    <p className="text-sm text-red-600 dark:text-red-400 text-center mb-4 max-w-md">
                        {this.state.error?.message || 'Ha ocurrido un error inesperado'}
                    </p>
                    <button
                        onClick={this.handleRetry}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-[18px]">refresh</span>
                        Reintentar
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

/**
 * ScreenErrorBoundary - Versión específica para pantallas completas
 */
interface ScreenErrorBoundaryProps {
    children: React.ReactNode;
    screenName?: string;
    onNavigateHome?: () => void;
}

export class ScreenErrorBoundary extends React.Component<ScreenErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ScreenErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        console.error(`Error in ${this.props.screenName || 'screen'}:`, error, errorInfo);
    }

    handleRetry = (): void => {
        this.setState({ hasError: false, error: null });
    };

    render(): React.ReactNode {
        if (this.state.hasError) {
            return (
                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background-light dark:bg-background-dark">
                    <div className="max-w-md w-full bg-white dark:bg-surface-dark rounded-2xl shadow-xl p-8 text-center">
                        <div className="size-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-6">
                            <span className="material-symbols-outlined text-5xl text-red-500 dark:text-red-400">
                                error_outline
                            </span>
                        </div>

                        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                            Error en {this.props.screenName || 'la pantalla'}
                        </h1>

                        <p className="text-gray-500 dark:text-gray-400 mb-6">
                            {this.state.error?.message || 'Ha ocurrido un error inesperado.'}
                        </p>

                        <div className="flex gap-3 justify-center">
                            {this.props.onNavigateHome && (
                                <button
                                    onClick={this.props.onNavigateHome}
                                    className="px-5 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Ir al Inicio
                                </button>
                            )}
                            <button
                                onClick={this.handleRetry}
                                className="px-5 py-2.5 bg-primary text-[#102218] rounded-xl font-bold hover:bg-primary-hover transition-colors flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-[18px]">refresh</span>
                                Reintentar
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

/**
 * Loading Fallback para Suspense
 */
export const LoadingFallback: React.FC<{ message?: string }> = ({ message = 'Cargando...' }) => (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background-light dark:bg-background-dark">
        <div className="animate-spin size-12 border-4 border-primary border-t-transparent rounded-full mb-4"></div>
        <p className="text-gray-500 dark:text-gray-400 font-medium">{message}</p>
    </div>
);
