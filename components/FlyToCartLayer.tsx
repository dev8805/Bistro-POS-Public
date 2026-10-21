
import React, { useEffect, useState } from 'react';

export interface FlyingItem {
  id: number;
  image: string;
  startRect: DOMRect;
}

interface FlyToCartLayerProps {
  items: FlyingItem[];
  onAnimationEnd: (id: number) => void;
}

export const FlyToCartLayer: React.FC<FlyToCartLayerProps> = ({ items, onAnimationEnd }) => {
  const [targetRect, setTargetRect] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const updateTarget = () => {
      const fab = document.getElementById('cart-fab');
      const desktopCart = document.getElementById('desktop-cart-container');
      
      let targetFound = false;

      // Try Mobile FAB first
      if (fab) {
          const rect = fab.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
              setTargetRect({
                  top: rect.top + (rect.height / 2),
                  left: rect.left + (rect.width / 2)
              });
              targetFound = true;
          }
      }
      
      // Try Desktop Sidebar Cart
      if (!targetFound && desktopCart) {
          const rect = desktopCart.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
              setTargetRect({
                  top: rect.top + Math.min(rect.height / 3, 180), 
                  left: rect.left + (rect.width / 2)
              });
              targetFound = true;
          }
      }

      // Fallback
      if (!targetFound) {
          setTargetRect({
            top: window.innerHeight - 80,
            left: window.innerWidth - 80
          });
      }
    };

    updateTarget();
    window.addEventListener('resize', updateTarget);
    return () => window.removeEventListener('resize', updateTarget);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden select-none">
      {items.map((item) => (
        <FlyItem 
          key={item.id} 
          item={item} 
          targetPos={targetRect} 
          onComplete={() => onAnimationEnd(item.id)} 
        />
      ))}
    </div>
  );
};

const FlyItem: React.FC<{ 
  item: FlyingItem; 
  targetPos: { top: number; left: number } | null; 
  onComplete: () => void 
}> = ({ item, targetPos, onComplete }) => {
  const initW = Math.min(Math.max(item.startRect.width || 80, 70), 110);
  const initH = Math.min(Math.max(item.startRect.height || 80, 70), 110);
  const initTop = item.startRect.top + ((item.startRect.height || initH) - initH) / 2;
  const initLeft = item.startRect.left + ((item.startRect.width || initW) - initW) / 2;

  const [style, setStyle] = useState<React.CSSProperties>({
    position: 'absolute',
    top: initTop,
    left: initLeft,
    width: `${initW}px`,
    height: `${initH}px`,
    opacity: 0.95,
    transform: 'scale(1)',
    transition: 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
    borderRadius: '1rem',
    backgroundImage: item.image ? `url('${item.image}')` : undefined,
    backgroundColor: item.image ? '#ffffff' : '#10b981',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    boxShadow: '0 12px 28px rgba(0,0,0,0.22)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none'
  });

  useEffect(() => {
    // Resolver destino si aún no está fijado en targetPos
    let dest = targetPos;
    if (!dest) {
      const desktopCart = document.getElementById('desktop-cart-container');
      const fab = document.getElementById('cart-fab');
      if (desktopCart) {
        const rect = desktopCart.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          dest = { top: rect.top + Math.min(rect.height / 3, 180), left: rect.left + (rect.width / 2) };
        }
      } else if (fab) {
        const rect = fab.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          dest = { top: rect.top + (rect.height / 2), left: rect.left + (rect.width / 2) };
        }
      }
      if (!dest) {
        dest = { top: window.innerHeight - 80, left: window.innerWidth - 80 };
      }
    }

    // Disparar animación en el siguiente frame
    const timer = requestAnimationFrame(() => {
      setStyle(prev => ({
        ...prev,
        top: dest!.top - 18,
        left: dest!.left - 18,
        width: '36px',
        height: '36px',
        opacity: 0.1,
        transform: 'scale(0.3) rotate(15deg)',
        borderRadius: '9999px'
      }));
    });

    const endTimer = setTimeout(onComplete, 520);

    return () => {
      cancelAnimationFrame(timer);
      clearTimeout(endTimer);
    };
  }, [targetPos, onComplete]);

  return (
    <div style={style}>
      {!item.image && (
        <span className="material-symbols-outlined text-[24px] text-white">restaurant</span>
      )}
    </div>
  );
};
