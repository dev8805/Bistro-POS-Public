import React, { ButtonHTMLAttributes } from 'react';

interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    isLoading?: boolean;
    variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
    fullWidth?: boolean;
    children: React.ReactNode;
}

export const AppButton: React.FC<AppButtonProps> = ({
    isLoading = false,
    variant = 'primary',
    fullWidth = false,
    className = '',
    children,
    disabled,
    ...props
}) => {
    const baseStyles = "relative inline-flex items-center justify-center font-bold transition-all transform active:scale-[0.98] focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100";

    // Default variations - can be overridden by className
    const variants = {
        primary: "bg-primary hover:bg-primary-hover text-text-onPrimary shadow-lg shadow-primary/20 dark:shadow-none",
        secondary: "bg-gray-100 hover:bg-gray-200 text-text-main dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white",
        danger: "bg-status-error hover:bg-red-600 text-white shadow-lg shadow-status-error/20 dark:shadow-none",
        outline: "border-2 border-border-light dark:border-border-dark text-text-secondary dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-background-light dark:hover:bg-gray-800",
        ghost: "text-text-secondary hover:text-text-main dark:text-gray-400 dark:hover:text-gray-200 hover:bg-background-light dark:hover:bg-gray-800/50"
    };

    const widthClass = fullWidth ? "w-full" : "";

    // Combine defaults with custom className
    // Note: If className provides bg/text colors, they will override these defaults due to Tailwind CSS precedence (if compiled that way) or order.
    // Ideally use 'tailwind-merge' but trying to keep dependencies low for now.

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${widthClass} ${className}`}
            disabled={isLoading || disabled}
            {...props}
        >
            {isLoading && (
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <svg className="animate-spin size-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                </span>
            )}

            <span className={`flex items-center gap-2 ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
                {children}
            </span>
        </button>
    );
};
