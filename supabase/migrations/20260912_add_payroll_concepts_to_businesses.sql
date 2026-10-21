-- Migration: 20260912_add_payroll_concepts_to_businesses.sql
-- Conceptos de pago a personal personalizables por el negocio
ALTER TABLE public.businesses 
  ADD COLUMN IF NOT EXISTS payroll_concepts text[] DEFAULT ARRAY['Sueldo', 'Vale', 'Turno', 'Horas Extra']::text[];
