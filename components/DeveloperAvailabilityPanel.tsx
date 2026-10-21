import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'L' },
  { key: 'tue', label: 'M' },
  { key: 'wed', label: 'X' },
  { key: 'thu', label: 'J' },
  { key: 'fri', label: 'V' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'D' },
];

export const DeveloperAvailabilityPanel: React.FC = () => {
  const { profile } = useAuth();
  const devEmail = (import.meta.env.VITE_DEVELOPER_EMAIL as string | undefined)?.toLowerCase();
  const userEmail = profile?.email?.toLowerCase();
  const isDeveloper = !!devEmail && !!userEmail && devEmail === userEmail;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    days_available: ['mon', 'tue', 'wed', 'thu', 'fri'] as string[],
    hour_start: '09:00',
    hour_end: '18:00',
    out_of_hours_message: 'No estoy disponible ahora. Te responderé apenas vuelva al horario laboral.',
    timezone: 'America/Bogota',
  });

  const fetchAvailability = useCallback(async () => {
    if (!isDeveloper || !devEmail) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('developer_availability')
        .select('*')
        .eq('developer_email', devEmail)
        .maybeSingle();
      if (data) {
        setForm({
          days_available: data.days_available ?? ['mon', 'tue', 'wed', 'thu', 'fri'],
          hour_start: (data.hour_start as string).slice(0, 5),
          hour_end: (data.hour_end as string).slice(0, 5),
          out_of_hours_message: data.out_of_hours_message,
          timezone: data.timezone ?? 'America/Bogota',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [isDeveloper, devEmail]);

  useEffect(() => { fetchAvailability(); }, [fetchAvailability]);

  const toggleDay = (day: string) => {
    setForm(prev => ({
      ...prev,
      days_available: prev.days_available.includes(day)
        ? prev.days_available.filter(d => d !== day)
        : [...prev.days_available, day],
    }));
  };

  const handleSave = async () => {
    if (!devEmail) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const { error } = await supabase
        .from('developer_availability')
        .upsert({
          developer_email: devEmail,
          days_available: form.days_available,
          hour_start: form.hour_start,
          hour_end: form.hour_end,
          out_of_hours_message: form.out_of_hours_message,
          timezone: form.timezone,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'developer_email' });
      if (error) throw error;
      setSaveMessage('Guardado');
      setTimeout(() => setSaveMessage(null), 2500);
    } catch (e: any) {
      setSaveMessage(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isDeveloper) return null;
  if (loading) return null;

  return (
    <div className="space-y-4 rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-900/10 p-5">
      <div className="flex items-center gap-2.5">
        <div className="size-8 rounded-lg bg-amber-400 flex items-center justify-center text-amber-950">
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
        </div>
        <div>
          <h3 className="text-[14px] font-bold text-text-main dark:text-white leading-tight">Soporte humano (Dev)</h3>
          <p className="text-[10px] text-text-secondary uppercase tracking-wider font-medium leading-tight">Tu disponibilidad para responder</p>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-2">Días disponibles</label>
        <div className="flex gap-1.5">
          {DAYS.map(d => {
            const active = form.days_available.includes(d.key);
            return (
              <button
                key={d.key}
                onClick={() => toggleDay(d.key)}
                className={`flex-1 py-2.5 rounded-lg text-[13px] font-bold transition ${
                  active
                    ? 'bg-amber-400 text-amber-950'
                    : 'bg-white dark:bg-gray-800 text-text-secondary border border-border-light dark:border-border-dark hover:border-amber-300'
                }`}
                aria-label={`Día ${d.label}`}
              >{d.label}</button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Desde</label>
          <input
            type="time"
            value={form.hour_start}
            onChange={e => setForm(prev => ({ ...prev, hour_start: e.target.value }))}
            className="w-full px-3 py-2.5 rounded-lg border-2 border-border-light dark:border-gray-700 bg-white dark:bg-gray-800 text-[14px] font-bold text-text-main dark:text-white outline-none focus:border-amber-400 transition"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Hasta</label>
          <input
            type="time"
            value={form.hour_end}
            onChange={e => setForm(prev => ({ ...prev, hour_end: e.target.value }))}
            className="w-full px-3 py-2.5 rounded-lg border-2 border-border-light dark:border-gray-700 bg-white dark:bg-gray-800 text-[14px] font-bold text-text-main dark:text-white outline-none focus:border-amber-400 transition"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Mensaje fuera de horario</label>
        <textarea
          value={form.out_of_hours_message}
          onChange={e => setForm(prev => ({ ...prev, out_of_hours_message: e.target.value }))}
          rows={2}
          className="w-full px-3 py-2.5 rounded-lg border-2 border-border-light dark:border-gray-700 bg-white dark:bg-gray-800 text-[13px] text-text-main dark:text-white outline-none focus:border-amber-400 transition resize-none"
        />
        <p className="text-[10px] text-text-secondary mt-1">Se muestra al cliente cuando contacta al desarrollador fuera de tu horario.</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        {saveMessage && (
          <span className={`text-[11px] font-bold ${saveMessage.startsWith('Error') ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {saveMessage}
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto px-5 py-2.5 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-amber-950 text-[13px] font-bold rounded-lg transition active:scale-95"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
};
