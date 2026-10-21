import React from 'react';

interface ToastProps {
  message: string;
  visible: boolean;
}

export const Toast: React.FC<ToastProps> = ({ message, visible }) => {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(90px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        color: '#fff',
        padding: '12px 24px',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        zIndex: 9999,
        fontSize: '14px',
        fontWeight: 500,
        backdropFilter: 'blur(8px)',
        animation: 'fadeInUp 0.3s ease-out',
        maxWidth: 'calc(100% - 32px)',
        textAlign: 'center' as const,
        whiteSpace: 'nowrap' as const,
      }}
    >
      {message}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
