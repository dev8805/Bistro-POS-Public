import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { todayDateStringInTz } from '../lib/timezone';
import { pushOfflineCashMovement } from '../lib/offlineCashCache';
import { formatPaymentMethodLabel } from '../lib/paymentMethods';

export interface Employee {
    id: string;
    business_id: string;
    full_name: string;
    document_type?: string;
    document_number?: string;
    phone?: string;
    job_title?: string;
    payment_type?: 'daily' | 'turn' | 'weekly' | 'biweekly' | 'monthly';
    base_rate?: number;
    profile_id?: string | null;
    is_active: boolean;
    notes?: string;
    created_at?: string;
    updated_at?: string;
    pending_advances_total?: number;
    pending_advances_count?: number;
}

export interface EmployeeAdvance {
    id: string;
    business_id: string;
    employee_id: string;
    amount: number;
    reason?: string;
    advance_date: string;
    status: 'pending' | 'settled' | 'cancelled';
    settled_at?: string;
    settled_by_expense_id?: string;
    cash_movement_id?: string;
    created_by?: string;
    created_at?: string;
    evidence_url?: string | null;
}

export interface PayrollPaymentHistoryItem {
    id: string;
    expense_date: string;
    amount: number;
    net_amount?: number;
    advance_deductions?: number;
    payroll_concept?: 'turn' | 'salary' | string | null;
    payment_method: string;
    description: string;
    receipt_url?: string | null;
    created_at: string;
    created_by?: string;
    created_by_name?: string | null;
    created_by_role?: string | null;
}

export interface CreateAdvanceParams {
    employee_id: string;
    amount: number;
    reason?: string;
    advance_date?: string;
    deductFromCashRegister?: boolean;
    activeShiftId?: string | null;
    paymentMethod?: string;
    evidence_url?: string;
}

export interface SettlePayrollParams {
    employee_id: string;
    concept: string;
    gross_amount: number;
    payment_method: string;
    deductFromCashRegister?: boolean;
    activeShiftId?: string | null;
    notes?: string;
    date?: string;
    receipt_url?: string;
    cash_amount?: number;
    split_details?: { method: string; amount: number }[];
}

export interface PayrollReceiptData {
    businessName: string;
    businessNit?: string;
    businessAddress?: string;
    businessPhone?: string;
    date: string;
    receiptNumber?: string;
    employeeName: string;
    employeeDocument?: string;
    employeeJobTitle?: string;
    payrollConcept: string;
    conceptDescription: string;
    grossAmount: number;
    advancesDeducted?: {
        id: string;
        date: string;
        reason?: string;
        amount: number;
    }[];
    totalDeductions?: number;
    netAmount: number;
    paymentMethod: string;
    notes?: string;
}

export function useEmployeesDirectory() {
    const { profile } = useAuth();
    const businessId = profile?.business_id;
    const userId = profile?.id;

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [advances, setAdvances] = useState<EmployeeAdvance[]>([]);
    const [loading, setLoading] = useState(true);
    const [advancesLoading, setAdvancesLoading] = useState(false);

    // Cargar colaboradores
    const fetchEmployees = useCallback(async () => {
        if (!businessId) return;
        const cacheKey = `bistro_employees_directory_${businessId}`;

        if (!navigator.onLine) {
            const cached = localStorage.getItem(cacheKey);
            if (cached) setEmployees(JSON.parse(cached));
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const [empRes, advRes] = await Promise.all([
                supabase
                    .from('employees')
                    .select('*')
                    .eq('business_id', businessId)
                    .eq('is_active', true)
                    .order('full_name', { ascending: true }),
                supabase
                    .from('employee_advances')
                    .select('employee_id, amount')
                    .eq('business_id', businessId)
                    .eq('status', 'pending')
            ]);

            if (empRes.error) throw empRes.error;

            // Calcular suma y cantidad de vales pendientes por colaborador
            const pendingMap: Record<string, number> = {};
            const pendingCountMap: Record<string, number> = {};
            (advRes.data || []).forEach(a => {
                pendingMap[a.employee_id] = (pendingMap[a.employee_id] || 0) + (Number(a.amount) || 0);
                pendingCountMap[a.employee_id] = (pendingCountMap[a.employee_id] || 0) + 1;
            });

            const enriched = (empRes.data || []).map(e => ({
                ...e,
                pending_advances_total: pendingMap[e.id] || 0,
                pending_advances_count: pendingCountMap[e.id] || 0
            }));

            setEmployees(enriched);
            localStorage.setItem(cacheKey, JSON.stringify(enriched));
        } catch (err) {
            console.error('Error fetching employees directory:', err);
            const cached = localStorage.getItem(cacheKey);
            if (cached) setEmployees(JSON.parse(cached));
        } finally {
            setLoading(false);
        }
    }, [businessId]);

    // Cargar vales / anticipos de un colaborador o de todo el negocio
    const fetchAdvances = useCallback(async (employeeId?: string) => {
        if (!businessId) return [];
        try {
            setAdvancesLoading(true);
            let query = supabase
                .from('employee_advances')
                .select('*')
                .eq('business_id', businessId)
                .order('created_at', { ascending: false });

            if (employeeId) {
                query = query.eq('employee_id', employeeId);
            }

            const { data, error } = await query;
            if (error) throw error;
            setAdvances(data || []);
            return data || [];
        } catch (err) {
            console.error('Error fetching advances:', err);
            return [];
        } finally {
            setAdvancesLoading(false);
        }
    }, [businessId]);

    useEffect(() => {
        if (businessId) {
            fetchEmployees();
        }
    }, [businessId, fetchEmployees]);

    // Crear colaborador
    const createEmployee = async (empData: Partial<Employee>) => {
        if (!businessId) throw new Error('Sin negocio asignado');
        const payload = {
            business_id: businessId,
            full_name: empData.full_name?.trim() || '',
            document_type: empData.document_type || 'CC',
            document_number: empData.document_number?.trim() || null,
            phone: empData.phone?.trim() || null,
            job_title: empData.job_title?.trim() || 'General',
            payment_type: empData.payment_type || 'turn',
            base_rate: Number(empData.base_rate) || 0,
            profile_id: empData.profile_id || null,
            notes: empData.notes?.trim() || null,
            is_active: true
        };

        const { data, error } = await supabase
            .from('employees')
            .insert(payload)
            .select()
            .single();

        if (error) throw error;
        await fetchEmployees();
        return data;
    };

    // Actualizar colaborador
    const updateEmployee = async (id: string, updates: Partial<Employee>) => {
        if (!businessId) return;
        const { error } = await supabase
            .from('employees')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('business_id', businessId);

        if (error) throw error;
        await fetchEmployees();
    };

    // Desactivar colaborador (soft delete)
    const deleteEmployee = async (id: string) => {
        if (!businessId) return;
        const { error } = await supabase
            .from('employees')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('business_id', businessId);

        if (error) throw error;
        await fetchEmployees();
    };

    // Registrar Vale / Adelanto
    const createAdvance = async (params: CreateAdvanceParams) => {
        if (!businessId || !userId) throw new Error('Usuario no autenticado');

        const employee = employees.find(e => e.id === params.employee_id);
        const empName = employee ? employee.full_name : 'Colaborador';
        const advDate = params.advance_date || todayDateStringInTz();

        let cashMovementId: string | null = null;

        // Si sale de caja y hay turno activo (solo si es en efectivo)
        const isCashAdvance = !params.paymentMethod || params.paymentMethod.toLowerCase() === 'cash' || params.paymentMethod.toLowerCase() === 'efectivo';
        if (params.deductFromCashRegister && params.activeShiftId && isCashAdvance) {
            const movPayload = {
                shift_id: params.activeShiftId,
                created_by: userId,
                type: 'expense' as const,
                amount: params.amount,
                description: `Vale / Anticipo: ${empName}${params.reason ? ` - ${params.reason}` : ''}`,
                reference_type: 'expense',
                payment_method: 'cash'
            };

            if (navigator.onLine) {
                const { data: movData, error: movErr } = await supabase
                    .from('cash_movements')
                    .insert(movPayload)
                    .select('id')
                    .single();
                if (!movErr && movData) {
                    cashMovementId = movData.id;
                }
            } else {
                pushOfflineCashMovement(businessId, movPayload);
            }
        }

        const advancePayload = {
            business_id: businessId,
            employee_id: params.employee_id,
            amount: params.amount,
            reason: params.reason?.trim() || 'Adelanto de nómina',
            advance_date: advDate,
            status: 'pending' as const,
            cash_movement_id: cashMovementId,
            created_by: userId,
            evidence_url: params.evidence_url || null
        };

        const { data, error } = await supabase
            .from('employee_advances')
            .insert(advancePayload)
            .select()
            .single();

        if (error) throw error;
        await fetchEmployees();
        return data;
    };

    // Saldar vale directamente (sin liquidación de nómina, ej. el colaborador devolvió el dinero)
    const settleAdvanceDirectly = async (advanceId: string) => {
        if (!businessId) return;
        const { error } = await supabase
            .from('employee_advances')
            .update({
                status: 'settled',
                settled_at: new Date().toISOString()
            })
            .eq('id', advanceId)
            .eq('business_id', businessId);

        if (error) throw error;
        await fetchEmployees();
        await fetchAdvances();
    };

    // Cancelar/Anular vale
    const cancelAdvance = async (advanceId: string) => {
        if (!businessId) return;
        const { error } = await supabase
            .from('employee_advances')
            .update({
                status: 'cancelled',
                updated_at: new Date().toISOString()
            })
            .eq('id', advanceId)
            .eq('business_id', businessId);

        if (error) throw error;
        await fetchEmployees();
        await fetchAdvances();
    };

    // Registrar Pago a Colaborador con Concepto Personalizado
    const settlePayrollPayment = async (params: SettlePayrollParams) => {
        if (!businessId || !userId) throw new Error('Usuario no autenticado');

        const employee = employees.find(e => e.id === params.employee_id);
        if (!employee) throw new Error('Colaborador no encontrado');

        const dateStr = params.date || todayDateStringInTz();
        const grossAmount = Number(params.gross_amount) || 0;
        const conceptLabel = params.concept?.trim() || 'Pago a personal';
        const expenseDesc = `Pago a ${employee.full_name} (${conceptLabel})${params.notes ? ` - ${params.notes}` : ''}`;

        // 1. Crear registro contable en expenses
        const expensePayload = {
            business_id: businessId,
            amount: grossAmount,
            description: expenseDesc,
            category: 'SUELDOS',
            payment_method: params.payment_method || 'cash',
            expense_date: dateStr,
            created_by: userId,
            employee_id: employee.id,
            advance_deductions: 0,
            net_amount: grossAmount,
            payroll_concept: conceptLabel,
            receipt_url: params.receipt_url || null
        };

        const { data: expenseData, error: expenseErr } = await supabase
            .from('expenses')
            .insert(expensePayload)
            .select()
            .single();

        if (expenseErr) throw expenseErr;

        // 2. Si sale de caja y hay turno activo:
        // REGLA: Únicamente el efectivo sale físicamente de la caja registradora del turno.
        // Los métodos digitales (Nequi, Tarjeta, etc.) NO afectan las ventas del turno.
        const isSingleMethodCash = params.payment_method?.toLowerCase() === 'cash' || params.payment_method?.toLowerCase() === 'efectivo';
        const cashToDeduct = params.cash_amount !== undefined
            ? Number(params.cash_amount) || 0
            : (isSingleMethodCash ? grossAmount : 0);

        if (params.deductFromCashRegister && cashToDeduct > 0 && params.activeShiftId) {
            const movDesc = `Pago a ${employee.full_name} (${conceptLabel})${params.notes ? ` · ${params.notes}` : ''}`;
            const movPayload = {
                shift_id: params.activeShiftId,
                created_by: userId,
                type: 'expense' as const,
                amount: cashToDeduct,
                description: movDesc,
                reference_id: expenseData.id,
                reference_type: 'expense',
                payment_method: 'cash'
            };

            if (navigator.onLine) {
                await supabase.from('cash_movements').insert(movPayload);
            } else {
                pushOfflineCashMovement(businessId, movPayload);
            }
        }

        // 3. Recargar colaboradores
        await fetchEmployees();

        // 4. Retornar datos del recibo para impresión/PDF inmediata
        const receiptData: PayrollReceiptData = {
            businessName: profile.business_name || 'Bistro POS',
            date: dateStr,
            receiptNumber: expenseData.id.slice(0, 8).toUpperCase(),
            employeeName: employee.full_name,
            employeeDocument: employee.document_number || undefined,
            employeeJobTitle: employee.job_title || undefined,
            payrollConcept: conceptLabel,
            conceptDescription: conceptLabel,
            grossAmount: grossAmount,
            totalDeductions: 0,
            netAmount: grossAmount,
            paymentMethod: formatPaymentMethodLabel(params.payment_method),
            notes: params.notes
        };

        return {
            expense: expenseData,
            receiptData
        };
    };

    // Consultar pagos de turnos y sueldos de un colaborador (de la tabla expenses)
    const fetchPayrollPayments = useCallback(async (
        employeeId: string,
        limit = 10,
        offset = 0
    ): Promise<PayrollPaymentHistoryItem[]> => {
        if (!businessId) return [];
        try {
            const { data, error } = await supabase
                .from('expenses')
                .select(`
                    id, 
                    expense_date, 
                    amount, 
                    net_amount, 
                    advance_deductions, 
                    payroll_concept, 
                    payment_method, 
                    description, 
                    receipt_url, 
                    created_at,
                    created_by,
                    created_by_profile:profiles!expenses_created_by_fkey(full_name, role)
                `)
                .eq('business_id', businessId)
                .eq('employee_id', employeeId)
                .order('expense_date', { ascending: false })
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            if (error) throw error;
            return (data || []).map((item: any) => ({
                id: item.id,
                expense_date: item.expense_date,
                amount: item.amount,
                net_amount: item.net_amount,
                advance_deductions: item.advance_deductions,
                payroll_concept: item.payroll_concept,
                payment_method: item.payment_method,
                description: item.description,
                receipt_url: item.receipt_url,
                created_at: item.created_at,
                created_by: item.created_by,
                created_by_name: item.created_by_profile?.full_name ?? null,
                created_by_role: item.created_by_profile?.role ?? null,
            })) as PayrollPaymentHistoryItem[];
        } catch (err) {
            console.error('Error fetching employee payroll payments:', err);
            return [];
        }
    }, [businessId]);

    // Actualizar evidencia de un vale
    const updateAdvanceEvidence = useCallback(async (advanceId: string, evidenceUrl: string | null) => {
        if (!businessId) return;
        const { error } = await supabase
            .from('employee_advances')
            .update({
                evidence_url: evidenceUrl,
                updated_at: new Date().toISOString()
            })
            .eq('id', advanceId)
            .eq('business_id', businessId);
        if (error) throw error;
    }, [businessId]);

    // Actualizar evidencia de un pago de turno o sueldo (expenses)
    const updatePayrollPaymentEvidence = useCallback(async (expenseId: string, receiptUrl: string | null) => {
        if (!businessId) return;
        const { error } = await supabase
            .from('expenses')
            .update({ receipt_url: receiptUrl })
            .eq('id', expenseId)
            .eq('business_id', businessId);
        if (error) throw error;
    }, [businessId]);

    return {
        employees,
        advances,
        loading,
        advancesLoading,
        fetchEmployees,
        fetchAdvances,
        fetchPayrollPayments,
        updateAdvanceEvidence,
        updatePayrollPaymentEvidence,
        createEmployee,
        updateEmployee,
        deleteEmployee,
        createAdvance,
        settleAdvanceDirectly,
        cancelAdvance,
        settlePayrollPayment
    };
}
