import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

interface DeveloperAvailability {
  timezone: string;
  days_available: string[];
  hour_start: string;
  hour_end: string;
  out_of_hours_message: string;
}

export interface AvailabilityInfo {
  loading: boolean;
  availability: DeveloperAvailability | null;
  isAvailableNow: boolean;
  /** Texto legible de cuándo el dev vuelve a estar disponible. Null si ya está disponible. */
  nextAvailableLabel: string | null;
  /** Resumen del horario para mostrar al usuario. Vacío mientras carga. */
  scheduleLabel: string;
  /** Mensaje configurado por el dev para mostrar fuera de horario. */
  outOfHoursMessage: string | null;
}

const DAYS_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAYS_SHORT_ES: Record<string, string> = {
  sun: 'D', mon: 'L', tue: 'M', wed: 'X', thu: 'J', fri: 'V', sat: 'S',
};
const DAYS_LONG_ES: Record<string, string> = {
  sun: 'domingo', mon: 'lunes', tue: 'martes', wed: 'miércoles', thu: 'jueves', fri: 'viernes', sat: 'sábado',
};

function getTzParts(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase().slice(0, 3) ?? '';
  const hour = parts.find(p => p.type === 'hour')?.value ?? '00';
  const minute = parts.find(p => p.type === 'minute')?.value ?? '00';
  return { weekday, hour, minute };
}

function computeIsAvailableNow(av: DeveloperAvailability): boolean {
  const { weekday, hour, minute } = getTzParts(new Date(), av.timezone);
  if (!av.days_available.includes(weekday)) return false;
  const current = `${hour}:${minute}`;
  return current >= av.hour_start.slice(0, 5) && current <= av.hour_end.slice(0, 5);
}

function formatHour12(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  const hNum = parseInt(h, 10);
  const period = hNum >= 12 ? 'p. m.' : 'a. m.';
  const hour12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
  return m === '00' ? `${hour12} ${period}` : `${hour12}:${m} ${period}`;
}

function computeNextAvailable(av: DeveloperAvailability): string | null {
  const now = new Date();
  const tz = av.timezone;
  const hourStart = av.hour_start.slice(0, 5);
  const hourEnd = av.hour_end.slice(0, 5);

  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    const candidate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const { weekday, hour, minute } = getTzParts(candidate, tz);
    if (!av.days_available.includes(weekday)) continue;

    if (dayOffset === 0) {
      const currentTime = `${hour}:${minute}`;
      if (currentTime < hourStart) {
        return formatDateTimeLabel(candidate, hourStart, tz, dayOffset);
      }
      if (currentTime >= hourStart && currentTime <= hourEnd) {
        return null;
      }
      continue;
    }
    return formatDateTimeLabel(candidate, hourStart, tz, dayOffset);
  }
  return null;
}

function formatDateTimeLabel(d: Date, hourStart: string, tz: string, dayOffset: number): string {
  const { weekday } = getTzParts(d, tz);
  const dayName = DAYS_LONG_ES[weekday] ?? weekday;
  const dateFmt = new Intl.DateTimeFormat('es-CO', { timeZone: tz, day: 'numeric', month: 'short' });
  const datePart = dateFmt.format(d);
  const timeStr = formatHour12(hourStart);
  const prefix = dayOffset === 0 ? 'hoy' : dayOffset === 1 ? 'mañana' : dayName;
  return `${prefix} ${datePart} a las ${timeStr}`;
}

function computeScheduleLabel(av: DeveloperAvailability): string {
  const sortedDays = av.days_available.slice().sort(
    (a, b) => DAYS_ORDER.indexOf(a as typeof DAYS_ORDER[number]) - DAYS_ORDER.indexOf(b as typeof DAYS_ORDER[number]),
  );

  let daysLabel: string;
  if (sortedDays.length === 7) {
    daysLabel = 'Todos los días';
  } else if (sortedDays.length === 0) {
    daysLabel = 'Sin días configurados';
  } else {
    const idxs = sortedDays.map(d => DAYS_ORDER.indexOf(d as typeof DAYS_ORDER[number]));
    const isContinuous = idxs.every((idx, i) => i === 0 || idx === idxs[i - 1] + 1);
    daysLabel = isContinuous && sortedDays.length >= 2
      ? `${DAYS_SHORT_ES[sortedDays[0]]}-${DAYS_SHORT_ES[sortedDays[sortedDays.length - 1]]}`
      : sortedDays.map(d => DAYS_SHORT_ES[d]).join(', ');
  }
  return `${daysLabel}, ${formatHour12(av.hour_start)} – ${formatHour12(av.hour_end)} (hora Colombia)`;
}

export function useDeveloperAvailability(): AvailabilityInfo {
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState<DeveloperAvailability | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('developer_availability')
        .select('timezone, days_available, hour_start, hour_end, out_of_hours_message')
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      setAvailability(data as DeveloperAvailability | null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  return useMemo(() => {
    if (!availability) {
      return {
        loading,
        availability: null,
        isAvailableNow: false,
        nextAvailableLabel: null,
        scheduleLabel: '',
        outOfHoursMessage: null,
      };
    }
    return {
      loading,
      availability,
      isAvailableNow: computeIsAvailableNow(availability),
      nextAvailableLabel: computeNextAvailable(availability),
      scheduleLabel: computeScheduleLabel(availability),
      outOfHoursMessage: availability.out_of_hours_message,
    };
  }, [availability, loading]);
}
