import React, { useState, useRef, useEffect } from 'react';

interface Country {
    code: string;
    dial: string;
    flag: string;
    name: string;
}

const COUNTRIES: Country[] = [
    { code: 'CO', dial: '57',  flag: '🇨🇴', name: 'Colombia' },
    { code: 'MX', dial: '52',  flag: '🇲🇽', name: 'México' },
    { code: 'VE', dial: '58',  flag: '🇻🇪', name: 'Venezuela' },
    { code: 'EC', dial: '593', flag: '🇪🇨', name: 'Ecuador' },
    { code: 'PE', dial: '51',  flag: '🇵🇪', name: 'Perú' },
    { code: 'AR', dial: '54',  flag: '🇦🇷', name: 'Argentina' },
    { code: 'CL', dial: '56',  flag: '🇨🇱', name: 'Chile' },
    { code: 'BR', dial: '55',  flag: '🇧🇷', name: 'Brasil' },
    { code: 'US', dial: '1',   flag: '🇺🇸', name: 'Estados Unidos' },
    { code: 'ES', dial: '34',  flag: '🇪🇸', name: 'España' },
    { code: 'PA', dial: '507', flag: '🇵🇦', name: 'Panamá' },
    { code: 'CR', dial: '506', flag: '🇨🇷', name: 'Costa Rica' },
    { code: 'BO', dial: '591', flag: '🇧🇴', name: 'Bolivia' },
    { code: 'PY', dial: '595', flag: '🇵🇾', name: 'Paraguay' },
    { code: 'UY', dial: '598', flag: '🇺🇾', name: 'Uruguay' },
];

interface PhoneInputProps {
    name?: string;
    value?: string;
    onChange?: (fullNumber: string) => void;
    className?: string;
    defaultValue?: string;
    placeholder?: string;
    required?: boolean;
}

/** Extrae el indicativo y el número local de un número guardado (ej: "573120001234") */
const parseStoredPhone = (stored: string): { dialCode: string; local: string } => {
    const digits = stored.replace(/\D/g, '');
    for (const c of COUNTRIES) {
        if (digits.startsWith(c.dial)) {
            return { dialCode: c.dial, local: digits.slice(c.dial.length) };
        }
    }
    return { dialCode: '57', local: digits };
};

export const PhoneInput: React.FC<PhoneInputProps> = ({
    name,
    value,
    onChange,
    className = '',
    defaultValue,
    placeholder = '300 123 4567',
    required,
}) => {
    const initial = parseStoredPhone(value ?? defaultValue ?? '');
    const [selectedCountry, setSelectedCountry] = useState<Country>(
        COUNTRIES.find(c => c.dial === initial.dialCode) ?? COUNTRIES[0]
    );
    const [localNumber, setLocalNumber] = useState(initial.local);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fullNumber = `${selectedCountry.dial}${localNumber.replace(/\D/g, '')}`;

    const handleLocalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setLocalNumber(val);
        onChange?.(`${selectedCountry.dial}${val.replace(/\D/g, '')}`);
    };

    const handleCountrySelect = (c: Country) => {
        setSelectedCountry(c);
        setOpen(false);
        setSearch('');
        onChange?.(`${c.dial}${localNumber.replace(/\D/g, '')}`);
    };

    const filtered = COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) || c.dial.includes(search)
    );

    return (
        <div className={`flex items-center gap-0 relative ${className}`} ref={dropdownRef}>
            {/* Hidden input with full normalized number for form submission */}
            {name && (
                <input type="hidden" name={name} value={fullNumber} />
            )}

            {/* Country selector button */}
            <button
                type="button"
                onClick={() => setOpen(prev => !prev)}
                className="shrink-0 h-11 flex items-center gap-1.5 px-2.5 bg-white dark:bg-gray-900 border border-r-0 border-gray-300 dark:border-gray-600 rounded-l-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
                <span className="text-lg leading-none">{selectedCountry.flag}</span>
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">+{selectedCountry.dial}</span>
                <span className="material-symbols-outlined text-[14px] text-gray-400">{open ? 'expand_less' : 'expand_more'}</span>
            </button>

            {/* Number input */}
            <input
                type="tel"
                value={localNumber}
                onChange={handleLocalChange}
                placeholder={placeholder}
                required={required}
                className="flex-1 h-11 px-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-r-xl text-sm font-medium text-text-main dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none"
            />

            {/* Dropdown */}
            {open && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                        <input
                            type="text"
                            autoFocus
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar país..."
                            className="w-full h-8 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-text-main dark:text-white outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                        {filtered.map(c => (
                            <button
                                key={c.code}
                                type="button"
                                onClick={() => handleCountrySelect(c)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left ${selectedCountry.code === c.code ? 'bg-primary/10 dark:bg-primary/20' : ''}`}
                            >
                                <span className="text-lg shrink-0">{c.flag}</span>
                                <span className="text-sm font-medium text-text-main dark:text-white flex-1 truncate">{c.name}</span>
                                <span className="text-xs text-gray-400 shrink-0">+{c.dial}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
