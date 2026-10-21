import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Screen } from '../types';
import { useBusinessSettings } from '../hooks/useBusinessSettings';

interface ContingencyDocScreenProps {
  onNavigate: (screen: Screen) => void;
}

const ROWS_PER_TICKET = 10;

const TicketBlock: React.FC<{ paymentMethods: string[] }> = ({ paymentMethods }) => (
  <div className="ticket-block">
    <table>
      <thead>
        <tr>
          <th className="col-cant">CANT.</th>
          <th className="col-prod">PRODUCTO / DETALLE</th>
          <th className="col-val">VALOR&nbsp;($)</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: ROWS_PER_TICKET }).map((_, i) => (
          <tr key={`row-${i}`}>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div className="ticket-footer">
      <div className="payment-row">
        {paymentMethods.map((m) => (
          <span key={m} className="method-item">
            <span className="checkbox-box" /> {m.length > 12 ? m.substring(0, 10) + '.' : m}
          </span>
        ))}
      </div>
      <div className="client-row">
        <strong>Cliente:</strong>
        <span className="write-line" />
      </div>
      <div className="total-row">
        <strong>TOTAL APROX $:</strong>
        <span className="write-line" />
      </div>
    </div>
  </div>
);

export const ContingencyDocScreen: React.FC<ContingencyDocScreenProps> = ({ onNavigate }) => {
  const { paymentMethods } = useBusinessSettings();
  const printRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Calcular escala para ajustar al ancho de pantalla
  useEffect(() => {
    const calculateScale = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        // 210mm * 3.78px/mm ≈ 794px (ancho base A4)
        const a4Width = 794;
        const padding = 32; // 16px padding each side

        // En desktop (container > a4) escala es 1, en móvil ajustamos
        const newScale = Math.min(1, (containerWidth - padding) / a4Width);
        setScale(newScale);
      }
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = useCallback(async () => {
    if (!printRef.current) return;

    const originalElement = printRef.current;
    const clonedElement = originalElement.cloneNode(true) as HTMLElement;

    // Apply styles to the cloned element to render it off-screen
    clonedElement.style.position = 'absolute';
    clonedElement.style.left = '-9999px';
    clonedElement.style.top = '-9999px';
    clonedElement.style.transform = 'scale(1)'; // Ensure it's rendered at 1:1 scale for capture
    clonedElement.style.marginBottom = '0px'; // Remove any margin adjustments
    clonedElement.style.zIndex = '-1'; // Ensure it doesn't interfere with visible content

    // Append the cloned element to the body
    document.body.appendChild(clonedElement);

    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(clonedElement, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `comanda_contingencia_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 'image/png', 1.0);
    } finally {
      // Clean up: remove the cloned element from the DOM
      document.body.removeChild(clonedElement);
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-background-dark">
      {/* Header Responsivo */}
      <header className="shrink-0 bg-white dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 px-3 sm:px-4 py-3 flex items-center justify-between gap-2 sm:gap-3 print:hidden sticky top-0 z-10">
        <div className="flex items-center gap-2 sm:gap-3 flex-1">
          <button
            onClick={() => onNavigate(Screen.SELL)}
            className="size-9 sm:size-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-white transition-all active:scale-95 shrink-0"
            aria-label="Volver"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[22px]">arrow_back</span>
          </button>
          <div>
            <h1 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-white leading-tight">Comanda Contingencia</h1>
            <p className="text-[10px] md:text-xs text-xs text-gray-500 hidden sm:block">Formato manual offline</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDownloadPdf}
            className="flex items-center justify-center gap-2 size-9 sm:w-auto sm:h-auto sm:px-4 sm:py-2 bg-emerald-600 dark:bg-emerald-500 text-white rounded-full font-bold text-sm hover:opacity-90 active:scale-95 transition-all shadow-md shrink-0 whitespace-nowrap"
            aria-label="Descargar PDF"
          >
            <span className="material-symbols-outlined text-[18px] sm:text-[20px]">download</span>
            <span className="hidden sm:inline">Descargar</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 size-9 sm:w-auto sm:h-auto sm:px-4 sm:py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-full font-bold text-sm hover:opacity-90 active:scale-95 transition-all shadow-md shrink-0 whitespace-nowrap"
            aria-label="Imprimir"
          >
            <span className="material-symbols-outlined text-[18px] sm:text-[20px]">print</span>
            <span className="hidden sm:inline">Imprimir</span>
          </button>
        </div>
      </header>

      {/* Print Area Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col items-center bg-gray-100/50 dark:bg-black/20 p-4 md:p-8 custom-scrollbar"
      >
        {/* Documento Escalable */}
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            marginBottom: `-${(1 - scale) * 1123}px`
          }}
          className="contingency-scale-wrapper transition-transform duration-200 ease-out"
        >
          <div ref={printRef} className="contingency-page relative">
            <div className="contingency-grid">
              <TicketBlock paymentMethods={paymentMethods} />
              <TicketBlock paymentMethods={paymentMethods} />
              <TicketBlock paymentMethods={paymentMethods} />
              <TicketBlock paymentMethods={paymentMethods} />
            </div>

            {/* Watermark/Info solo visible en pantalla */}
            <div className="absolute -bottom-8 left-0 right-0 text-center text-gray-400 text-xs print:hidden">
              Vista previa • Formato A4
            </div>
          </div>
        </div>
      </div>

      {/* Print-only styles */}
      <style>{`
        .contingency-page {
          width: 794px;
          height: 1123px;
          padding: 20px;
          background: white;
          border: 1px solid #d3d3d3;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          box-sizing: border-box;
          color: black;
        }

        .contingency-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 20px;
          height: 100%;
        }

        .ticket-block {
          border: 1px dashed #999;
          padding: 10px;
          display: flex;
          flex-direction: column;
          border-radius: 6px;
          position: relative;
          background: white;
          overflow: hidden;
        }

        .ticket-block::before {
          content: "✂";
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: white;
          padding: 0 5px;
          font-size: 14px;
          color: #999;
        }

        .ticket-block table {
          width: 100%;
          border-collapse: collapse;
          flex: 1;
        }

        .ticket-block th {
          border-bottom: 2px solid #000;
          text-align: left;
          padding: 3px 4px;
          font-size: 11px;
          font-family: 'Inter', Arial, sans-serif;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .ticket-block td {
          border-bottom: 1px solid #ddd;
          padding: 6px 4px;
          font-size: 12px;
          vertical-align: bottom;
        }

        .col-cant { width: 12%; text-align: center; }
        .col-prod { width: 63%; }
        .col-val { width: 25%; text-align: right; white-space: nowrap; }

        .ticket-footer {
          margin-top: 8px;
          border-top: 2px solid #000;
          padding-top: 6px;
        }

        .payment-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 6px;
          font-size: 10px;
          font-family: 'Inter', Arial, sans-serif;
          color: #000;
          font-weight: 600;
        }

        .method-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .checkbox-box {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 1.5px solid #000;
          border-radius: 2px;
        }

        .client-row {
          display: flex;
          align-items: flex-end;
          margin-top: 4px;
          font-size: 11px;
          font-family: 'Inter', Arial, sans-serif;
          gap: 6px;
          font-weight: 600;
        }

        .total-row {
          display: flex;
          align-items: center;
          margin-top: 6px;
          font-size: 12px;
          font-family: 'Inter', Arial, sans-serif;
          gap: 6px;
          font-weight: 800;
        }

        .write-line {
          border-bottom: 1px solid #000;
          flex-grow: 1;
          height: 14px;
        }

        @media print {
          @page {
            margin: 0;
            size: A4;
          }

          body * {
            visibility: hidden !important;
          }

          .contingency-page,
          .contingency-page * {
            visibility: visible !important;
          }

          .contingency-scale-wrapper {
            transform: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .contingency-page {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            padding: 4mm !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            transform: none !important;
            border-radius: 0 !important;
            z-index: 99999 !important;
            background: white !important;
          }

          .contingency-grid {
            width: 100% !important;
            height: calc(297mm - 8mm) !important;
            gap: 5mm !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            grid-template-rows: 1fr 1fr !important;
          }

          .ticket-block {
            border: 1px dashed #555 !important;
            border-radius: 4px !important;
            page-break-inside: avoid;
            overflow: visible !important;
          }

          .ticket-block::before {
            color: #555;
          }
        }
      `}</style>
    </div>
  );
};
