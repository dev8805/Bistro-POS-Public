import React from 'react';

export const ScreenLoader: React.FC = () => (
    <div className="flex h-full w-full items-center justify-center bg-white/60 dark:bg-[#151e32]/60 backdrop-blur-sm">
        <div className="relative size-9">
            <div className="absolute inset-0 rounded-full border-2 border-slate-200 dark:border-slate-700" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-400 animate-spin" />
        </div>
    </div>
);
