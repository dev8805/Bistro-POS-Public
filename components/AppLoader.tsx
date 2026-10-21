import React from 'react';

export const AppLoader: React.FC = () => (
  <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#f6f8f7]">
    <img
      src="/192px_fondoBlanco.png"
      alt="Bistro POS"
      className="size-16 mb-6 rounded-2xl shadow-sm"
    />
    <div className="relative size-8">
      <div className="absolute inset-0 rounded-full border-2 border-amber-200" />
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-400 animate-spin" />
    </div>
  </div>
);
