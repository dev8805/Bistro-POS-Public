import React, { useState, useRef, useEffect } from 'react';

interface SupplierPickerProps {
  suppliers: Array<{ id: string; name: string; color?: string }>;
  selectedSupplierId: string | null;
  onSelect: (supplierId: string | null) => void;
  loading?: boolean;
}

export const SupplierPicker: React.FC<SupplierPickerProps> = ({
  suppliers,
  selectedSupplierId,
  onSelect,
  loading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [maxListHeight, setMaxListHeight] = useState<number | null>(null);
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click (mouse or touch)
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Adjust dropdown height and direction dynamically based on visible viewport
  useEffect(() => {
    if (!isOpen) return;

    const handleUpdateLayout = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const isMobile = window.innerWidth < 768;
      // En móvil reservamos espacio para la MobileNavBar (fija abajo con altura ~64px + safe area) + margen de holgura.
      const bottomOffset = isMobile ? 96 : 24;
      const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;

      const spaceBelow = viewportHeight - rect.bottom - bottomOffset;
      const spaceAbove = rect.top - 24;

      const shouldDropUp = spaceBelow < 160 && spaceAbove > spaceBelow;
      setDropUp(shouldDropUp);

      const availableHeight = shouldDropUp ? spaceAbove : spaceBelow;
      const searchBoxHeight = 49;
      // Altura máxima para la lista con scroll: nunca excede el espacio disponible ni 360px
      const calculatedMax = Math.max(120, Math.min(360, availableHeight - searchBoxHeight));
      setMaxListHeight(calculatedMax);
    };

    handleUpdateLayout();

    window.addEventListener('resize', handleUpdateLayout);
    window.addEventListener('scroll', handleUpdateLayout, true);
    window.visualViewport?.addEventListener('resize', handleUpdateLayout);
    window.visualViewport?.addEventListener('scroll', handleUpdateLayout);

    return () => {
      window.removeEventListener('resize', handleUpdateLayout);
      window.removeEventListener('scroll', handleUpdateLayout, true);
      window.visualViewport?.removeEventListener('resize', handleUpdateLayout);
      window.visualViewport?.removeEventListener('scroll', handleUpdateLayout);
    };
  }, [isOpen]);

  // Focus input when opened (only on desktop/tablet to prevent mobile keyboard popup)
  useEffect(() => {
    if (isOpen) {
      if (window.innerWidth >= 768) {
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }
  }, [isOpen]);

  if (loading) {
    return (
      <div className="h-9 w-full rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0" />
    );
  }

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);
  const filtered = search
    ? suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : suppliers;

  const handleSelect = (id: string | null) => {
    onSelect(id);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div className={`relative shrink-0 ${isOpen ? 'z-50' : ''}`} ref={containerRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full h-9 pl-3 pr-8 rounded-lg border text-xs font-bold shadow-sm outline-none truncate flex items-center gap-1.5 transition-all cursor-pointer ${
          selectedSupplierId
            ? 'text-gray-900 dark:text-white border-gray-400 dark:border-gray-500 bg-gray-50 dark:bg-gray-800'
            : 'text-text-main dark:text-white border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
        }`}
        aria-label="Filtrar por proveedor"
        aria-expanded={isOpen}
      >
        {selectedSupplier?.color && (
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selectedSupplier.color }} />
        )}
        <span className="truncate">{selectedSupplier?.name || 'Proveedor...'}</span>
      </button>
      <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none text-sm leading-none">
        expand_more
      </span>

      {/* Dropdown panel */}
      {isOpen && (
        <div className={`absolute ${dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} left-0 w-60 sm:w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-[fadeIn_0.1s_ease-out]`}>
          {/* Search input */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[16px]">search</span>
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar proveedor..."
                className="w-full h-8 pl-8 pr-3 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 dark:text-white placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Options list */}
          <div
            style={{ maxHeight: maxListHeight ? `${maxListHeight}px` : undefined }}
            className="max-h-[min(360px,calc(100dvh-260px))] overflow-y-auto overscroll-contain custom-scrollbar pb-3 touch-pan-y"
          >
            {/* Clear option / Todas */}
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={`w-full px-3 py-2.5 text-left text-xs font-medium hover:bg-amber-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors ${
                !selectedSupplierId
                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
                  : 'text-gray-700 dark:text-gray-200'
              }`}
            >
              <span className="line-clamp-2 flex-1 leading-snug">Todas</span>
              {!selectedSupplierId && (
                <span className="material-symbols-outlined text-amber-500 text-[14px] ml-auto shrink-0">check</span>
              )}
            </button>

            {filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-gray-400 text-center">No encontrado</p>
            )}

            {filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelect(s.id)}
                className={`w-full px-3 py-2.5 text-left text-xs font-medium hover:bg-amber-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors ${
                  s.id === selectedSupplierId
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
                    : 'text-gray-700 dark:text-gray-200'
                }`}
              >
                {s.color && (
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                )}
                <span className="line-clamp-2 flex-1 leading-snug">{s.name}</span>
                {s.id === selectedSupplierId && (
                  <span className="material-symbols-outlined text-amber-500 text-[14px] ml-auto shrink-0">check</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
