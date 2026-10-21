import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useProducts } from '../../hooks/useProducts';
import { useCashRegister } from '../../hooks/useCashRegister';
import { useDebts } from '../../hooks/useDebts';
import { useSuppliers } from '../../hooks/useSuppliers';
import { formatCurrency } from '../../lib/formatters';
import { useToast } from '../../context/ToastContext';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { useExpenses } from '../../hooks/useExpenses';
import { useBusinessSettings } from '../../context/BusinessSettingsContext';
import { AppButton } from '../ui/AppButton';
import { formatDateInTz } from '../../lib/timezone';
import { useImageUpload } from '../../hooks/useImageUpload';
import { EvidenceUploader } from '../EvidenceUploader';
import { CategoryPickerSheet } from './CategoryPickerSheet';
import { ObservationSheet } from './ObservationSheet';
import {
    ExpenseSubComponentProps,
    PaymentEntry,
    formatWithThousands,
    parseCleanNumber,
    getLocalDateValue,
    formatExpenseDateLabel,
} from './shared';
import { useEmployeesDirectory, Employee } from '../../hooks/useEmployeesDirectory';
import { EmployeeModal } from '../modals/EmployeeModal';
import { formatPaymentMethodLabel } from '../../lib/paymentMethods';
import { PayrollConceptDropdown } from '../payroll/PayrollConceptDropdown';

const InvoiceScanScreen = React.lazy(() => import('../../screens/InvoiceScanScreen'));

export const ExpenseRegister: React.FC<ExpenseSubComponentProps> = ({ onClose, onSave }) => {
    const { showToast } = useToast();
    const { confirmAction } = useConfirmDialog();
    const { activeShift, recordPurchase, reverseCashMovement, balances, expectedCash } = useCashRegister();
    const { createDebt } = useDebts();
    const { suppliers, createSupplier } = useSuppliers();
    const {
        categories,
        addCategory,
        expenses,
        expensesLoading,
        expensesLoadingMore,
        hasMoreExpenses,
        fetchExpenses,
        fetchMoreExpenses,
        updateExpense,
        deleteExpense,
    } = useExpenses();
    const { paymentMethods, timezone } = useBusinessSettings();
    const {
        employees,
        fetchEmployees: fetchEmployeesDirectory,
        fetchAdvances,
        createAdvance,
        settlePayrollPayment,
    } = useEmployeesDirectory();

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const dateInputRef = useRef<HTMLInputElement>(null);
    const dueDateInputRef = useRef<HTMLInputElement>(null);
    const employeeDropdownRef = useRef<HTMLDivElement>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
    const [showNewEmployeeModal, setShowNewEmployeeModal] = useState(false);
    const [expenseDate, setExpenseDate] = useState<string>(getLocalDateValue);
    const [expenseTab, setExpenseTab] = useState<'register' | 'history'>('register');
    const [expenseTarget, setExpenseTarget] = useState<'supplier' | 'payroll' | null>(null);
    const [showInvoiceScan, setShowInvoiceScan] = useState(false);

    // Estados para Pago a Personal
    const [payrollEmployee, setPayrollEmployee] = useState<Employee | null>(null);
    const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
    const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
    const [payrollConcept, setPayrollConcept] = useState<string>('');
    const [payrollAmount, setPayrollAmount] = useState<string>('');
    const [payrollNotes, setPayrollNotes] = useState<string>('');
    const [payrollDeductFromCash, setPayrollDeductFromCash] = useState<boolean | null>(null);
    const [payrollPaymentMethod, setPayrollPaymentMethod] = useState<string>('cash');
    const [isPayrollSplit, setIsPayrollSplit] = useState<boolean>(false);
    const [payrollSplitAmounts, setPayrollSplitAmounts] = useState<Record<string, string>>({});

    // Cerrar dropdown de colaboradores al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(e.target as Node)) {
                setShowEmployeeDropdown(false);
            }
        };
        if (showEmployeeDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showEmployeeDropdown]);

    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [showObservationSheet, setShowObservationSheet] = useState(false);

    // Form fields
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [isCredit, setIsCredit] = useState<boolean | null>(null);
    const [creditorName, setCreditorName] = useState('');
    const [dueDate, setDueDate] = useState<string>('');
    const [showCreditorList, setShowCreditorList] = useState(false);
    const [creditorSearchQuery, setCreditorSearchQuery] = useState('');
    const supplierSectionRef = useRef<HTMLDivElement>(null);
    const supplierSearchInputRef = useRef<HTMLInputElement>(null);
    const [supplierPaidAmount, setSupplierPaidAmount] = useState<string>('');
    const [supplierPaymentMethod, setSupplierPaymentMethod] = useState<string>('cash');
    const [isSupplierSplit, setIsSupplierSplit] = useState<boolean>(false);
    const [supplierSplitAmounts, setSupplierSplitAmounts] = useState<Record<string, string>>({});
    const [deductFromCashRegister, setDeductFromCashRegister] = useState<boolean | null>(null);

    const isLaborCategory = useMemo(() => {
        return ['SUELDOS', 'SALUD Y PARAFISCALES', 'HONORARIOS'].includes(selectedCategory.toUpperCase());
    }, [selectedCategory]);

    // Category management
    const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
    const [editAmount, setEditAmount] = useState('');
    const [editCategory, setEditCategory] = useState('');
    const [editDescription, setEditDescription] = useState('');

    const evidenceUpload = useImageUpload(null, 'debt-evidence');

    // Supplier form
    const [showNewSupplierForm, setShowNewSupplierForm] = useState(false);
    const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);
    const [newSupplierName, setNewSupplierName] = useState('');
    const [newSupplierNit, setNewSupplierNit] = useState('');
    const [newSupplierPhone, setNewSupplierPhone] = useState('');
    const [newSupplierAddress, setNewSupplierAddress] = useState('');

    const businessPaymentMethods = useMemo(() => {
        const stdMap: Record<string, string> = {
            'efectivo': 'cash', 'tarjeta': 'card', 'nequi': 'nequi',
            'daviplata': 'daviplata', 'transferencia': 'transfer', 'otro': 'other',
        };
        return paymentMethods.map(name => {
            const id = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
            const mappedId = stdMap[id] || id;
            return { id, label: name, mappedId, balance: balances[mappedId] || 0 };
        });
    }, [paymentMethods, balances]);

    const [payments, setPayments] = useState<PaymentEntry[]>([{ method: 'cash', amount: '' }]);

    useEffect(() => {
        if (businessPaymentMethods.length > 0) {
            setPayments([{ method: businessPaymentMethods[0].id, amount: '' }]);
        }
    }, [businessPaymentMethods]);

    useEffect(() => {
        if (expenseTab === 'history') fetchExpenses();
    }, [expenseTab, fetchExpenses]);

    const handleHistoryScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 100 && hasMoreExpenses && !expensesLoading && !expensesLoadingMore) {
            fetchMoreExpenses();
        }
    }, [hasMoreExpenses, expensesLoading, expensesLoadingMore, fetchMoreExpenses]);

    // Cerrar desplegable de proveedores/colaboradores al hacer click fuera
    useEffect(() => {
        if (!showCreditorList) return;
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            if (supplierSectionRef.current && !supplierSectionRef.current.contains(e.target as Node)) {
                setShowCreditorList(false);
                setCreditorSearchQuery('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [showCreditorList]);

    // Enfocar el buscador interno solo en desktop (en móvil evita abrir el teclado automáticamente)
    useEffect(() => {
        if (showCreditorList && window.innerWidth >= 768) {
            setTimeout(() => supplierSearchInputRef.current?.focus(), 80);
        }
    }, [showCreditorList]);

    const handleToggleCreditorList = () => {
        const nextState = !showCreditorList;
        setShowCreditorList(nextState);
        if (nextState) {
            setCreditorSearchQuery('');
            setTimeout(() => {
                if (supplierSectionRef.current) {
                    supplierSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 60);
        }
    };

    const totalPayments = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    // Al seleccionar colaborador, inicializar monto con base_rate si existe
    useEffect(() => {
        if (!payrollEmployee) {
            setPayrollAmount('');
            return;
        }
        if (payrollEmployee.base_rate && payrollEmployee.base_rate > 0) {
            setPayrollAmount(String(payrollEmployee.base_rate));
        }
    }, [payrollEmployee]);

    // Monto neto de pago directo
    const payrollNetAmount = useMemo(() => {
        return parseFloat(payrollAmount) || 0;
    }, [payrollAmount]);

    const parseNumericValue = (val: string | undefined | null): number => {
        if (!val) return 0;
        const clean = String(val).replace(/[^0-9]/g, '');
        return clean ? Number(clean) : 0;
    };

    const handlePayrollSplitAmountChange = (methodName: string, value: string) => {
        const raw = value.replace(/\D/g, '');
        if (!raw) {
            setPayrollSplitAmounts(prev => ({ ...prev, [methodName]: '' }));
            return;
        }
        setPayrollSplitAmounts(prev => ({
            ...prev,
            [methodName]: Number(raw).toLocaleString('es-ES')
        }));
    };

    const dismissKeyboard = () => {
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    };

    const payrollSplitTotal = useMemo((): number => {
        return (Object.values(payrollSplitAmounts) as string[]).reduce((sum, v) => sum + parseNumericValue(v), 0);
    }, [payrollSplitAmounts]);

    const payrollSplitRemaining: number = payrollNetAmount - payrollSplitTotal;

    const isSingleMethodCash = useMemo(() => {
        return payrollPaymentMethod.toLowerCase() === 'cash' || payrollPaymentMethod.toLowerCase().includes('efectivo');
    }, [payrollPaymentMethod]);

    // Efectivo exacto que saldrá físicamente de la caja registradora:
    // - Si es método único: solo si el método elegido es efectivo.
    // - Si es pago dividido: únicamente la porción asignada a 'Efectivo'.
    // Los demás métodos (Nequi, Tarjeta, etc.) NO descuentan de las ventas del turno.
    const payrollCashAmount = useMemo((): number => {
        if (!isPayrollSplit) {
            return isSingleMethodCash ? payrollNetAmount : 0;
        }
        const cashEntry = Object.entries(payrollSplitAmounts).find(([k]) =>
            k.toLowerCase().includes('efectivo') || k.toLowerCase() === 'cash'
        );
        return cashEntry ? parseNumericValue(cashEntry[1]) : 0;
    }, [isPayrollSplit, isSingleMethodCash, payrollNetAmount, payrollSplitAmounts]);

    // Validación estricta de saldo de caja: solo evalúa la salida física de efectivo con turno activo
    const availableCash = balances?.cash ?? expectedCash ?? 0;
    const isPayrollCashInsufficient = Boolean(activeShift && payrollDeductFromCash === true && payrollCashAmount > 0 && payrollCashAmount > availableCash);

    const handleOpenDueDatePicker = () => {
        if (dueDateInputRef.current) {
            try { (dueDateInputRef.current as any).showPicker(); }
            catch { dueDateInputRef.current.click(); }
        }
    };

    const supplierExpenseAmount = useMemo(() => {
        return parseFloat(amount) || 0;
    }, [amount]);

    const supplierPaidAmountNum = useMemo(() => {
        return parseFloat(supplierPaidAmount) || 0;
    }, [supplierPaidAmount]);

    const supplierTargetAmount = useMemo(() => {
        return isCredit ? supplierPaidAmountNum : supplierExpenseAmount;
    }, [isCredit, supplierPaidAmountNum, supplierExpenseAmount]);

    const supplierPendingBalance = useMemo(() => {
        return Math.max(0, supplierExpenseAmount - supplierPaidAmountNum);
    }, [supplierExpenseAmount, supplierPaidAmountNum]);

    const handleSupplierSplitAmountChange = (methodName: string, value: string) => {
        const raw = value.replace(/\D/g, '');
        if (!raw) {
            setSupplierSplitAmounts(prev => ({ ...prev, [methodName]: '' }));
            return;
        }
        setSupplierSplitAmounts(prev => ({
            ...prev,
            [methodName]: Number(raw).toLocaleString('es-ES')
        }));
    };

    const supplierSplitTotal = useMemo((): number => {
        return (Object.values(supplierSplitAmounts) as string[]).reduce((sum, v) => sum + parseNumericValue(v), 0);
    }, [supplierSplitAmounts]);

    const supplierSplitRemaining: number = supplierTargetAmount - supplierSplitTotal;

    const isSupplierSingleMethodCash = useMemo(() => {
        return supplierPaymentMethod.toLowerCase() === 'cash' || supplierPaymentMethod.toLowerCase().includes('efectivo');
    }, [supplierPaymentMethod]);

    const supplierCashAmount = useMemo((): number => {
        if (supplierTargetAmount <= 0) return 0;
        if (!isSupplierSplit) {
            return isSupplierSingleMethodCash ? supplierTargetAmount : 0;
        }
        const cashEntry = Object.entries(supplierSplitAmounts).find(([k]) =>
            k.toLowerCase().includes('efectivo') || k.toLowerCase() === 'cash'
        );
        return cashEntry ? parseNumericValue(cashEntry[1]) : 0;
    }, [supplierTargetAmount, isSupplierSplit, isSupplierSingleMethodCash, supplierSplitAmounts]);

    const isSupplierCashInsufficient = Boolean(
        activeShift &&
        deductFromCashRegister === true &&
        supplierCashAmount > 0 &&
        supplierCashAmount > availableCash
    );

    const filteredPayrollEmployees = useMemo(() => {
        if (!employeeSearchTerm.trim()) return employees;
        const term = employeeSearchTerm.toLowerCase();
        return employees.filter(e =>
            e.full_name.toLowerCase().includes(term) ||
            (e.job_title && e.job_title.toLowerCase().includes(term))
        );
    }, [employees, employeeSearchTerm]);

    const handleSavePayroll = async () => {
        if (isSubmitting || !payrollEmployee) return;

        if (!payrollConcept) {
            showToast('Selecciona un concepto de pago', 'warning');
            return;
        }

        if (payrollNetAmount <= 0) {
            showToast('Ingresa un monto válido para el pago', 'error');
            return;
        }

        if (activeShift && payrollDeductFromCash === null) {
            showToast('Selecciona si el dinero sale de caja o de fondos externos', 'warning');
            return;
        }

        if (isPayrollSplit && payrollSplitRemaining !== 0) {
            showToast(payrollSplitRemaining > 0
                ? `Faltan $${formatCurrency(payrollSplitRemaining)} COP por asignar en los métodos de pago`
                : `El monto dividido excede el total por $${formatCurrency(Math.abs(payrollSplitRemaining))} COP`,
                'warning'
            );
            return;
        }

        if (isPayrollCashInsufficient) {
            showToast(`Saldo insuficiente en caja. Efectivo a entregar: $${formatCurrency(payrollCashAmount)} COP | Disponible en caja: $${formatCurrency(availableCash)} COP`, 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            let finalMethod = payrollPaymentMethod;
            let finalNotes = payrollNotes || undefined;
            let splitDetailsList: { method: string; amount: number }[] | undefined = undefined;

            if (isPayrollSplit) {
                splitDetailsList = Object.entries(payrollSplitAmounts)
                    .map(([m, val]) => ({ method: m, amount: parseNumericValue(val) }))
                    .filter(item => item.amount > 0);

                finalMethod = 'Dividido';
                const splitSummary = splitDetailsList.map(d => `${d.method}: $${formatCurrency(d.amount)}`).join(', ');
                finalNotes = payrollNotes
                    ? `${payrollNotes} [Pago dividido: ${splitSummary}]`
                    : `[Pago dividido: ${splitSummary}]`;
            }

            await settlePayrollPayment({
                employee_id: payrollEmployee.id,
                concept: payrollConcept,
                gross_amount: payrollNetAmount,
                payment_method: finalMethod,
                deductFromCashRegister: activeShift ? (payrollDeductFromCash === true) : false,
                activeShiftId: activeShift?.id || null,
                notes: finalNotes,
                receipt_url: evidenceUpload.imageUrl || undefined,
                cash_amount: (activeShift && payrollDeductFromCash === true) ? payrollCashAmount : 0,
                split_details: splitDetailsList,
            });

            // Limpiar estado
            setPayrollEmployee(null);
            setPayrollConcept('');
            setPayrollAmount('');
            setPayrollNotes('');
            setPayrollDeductFromCash(null);
            setIsPayrollSplit(false);
            setPayrollSplitAmounts({});
            setExpenseTarget(null);
            evidenceUpload.markAsSaved();
            evidenceUpload.resetImage();
            showToast('Pago registrado correctamente', 'success');
            await fetchExpenses();
            await fetchEmployeesDirectory();
            if (onClose) onClose();
        } catch (err: any) {
            showToast(err.message || 'Error al procesar el pago', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Auto-rellenar monto con el valor del gasto al deducir de caja
    useEffect(() => {
        if (deductFromCashRegister && !isCredit && activeShift && payments.length === 1) {
            const numAmt = parseFloat(amount) || 0;
            const currentAmt = parseFloat(payments[0].amount) || 0;
            if (numAmt > 0 && currentAmt === 0) {
                setPayments(prev => [{
                    method: prev[0]?.method || businessPaymentMethods[0]?.id || 'cash',
                    amount: String(numAmt)
                }]);
            }
        }
    }, [deductFromCashRegister, isCredit, activeShift, amount, businessPaymentMethods]);

    const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    const formatExpenseDate = (dateStr: string): string => {
        if (!dateStr) return '';
        if (!dateStr.includes('T') && dateStr.includes('-')) {
            const [y, m, d] = dateStr.split('-');
            return `${parseInt(d, 10)} ${MONTHS_SHORT[parseInt(m, 10) - 1]} ${y}`;
        }
        const d = formatDateInTz(dateStr, timezone, { day: 'numeric', month: 'short', year: 'numeric' }).replace(/ de /gi, ' ').replace(/\./g, '');
        const t = new Date(dateStr).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone }).toLowerCase().replace(/\./g, '').replace(/\s/g, '');
        return `${d} · ${t}`;
    };

    const handleOpenDatePicker = () => {
        if (dateInputRef.current) {
            try { (dateInputRef.current as any).showPicker(); }
            catch { dateInputRef.current.click(); }
        }
    };

    const updatePayment = (index: number, field: 'method' | 'amount', value: string) => {
        const updated = [...payments];
        updated[index] = { ...updated[index], [field]: value };
        setPayments(updated);
    };

    const removePayment = (index: number) => {
        if (payments.length > 1) setPayments(payments.filter((_, i) => i !== index));
    };

    const handleStartEdit = (exp: typeof expenses[0]) => {
        setEditingExpenseId(exp.id);
        setEditAmount(String(exp.amount));
        setEditCategory(exp.category);
        setEditDescription(exp.description || '');
    };

    const handleSaveEdit = async () => {
        if (!editingExpenseId) return;
        try {
            await updateExpense(editingExpenseId, {
                amount: parseFloat(editAmount) || 0,
                category: editCategory,
                description: editDescription,
            });
            setEditingExpenseId(null);
            showToast('Gasto actualizado', 'success');
        } catch {
            showToast('Error al actualizar', 'error');
        }
    };

    const handleDeleteExpense = async (id: string) => {
        const confirmed = await confirmAction({
            title: '¿Eliminar este gasto?',
            message: 'Esta acción no se puede deshacer.',
            confirmText: 'Eliminar',
            variant: 'danger'
        });
        if (!confirmed) return;
        try {
            await deleteExpense(id);
            window.dispatchEvent(new CustomEvent('expense-deleted'));
            showToast('Gasto eliminado', 'success');
        } catch {
            showToast('Error al eliminar', 'error');
        }
    };

    const handleCreateCategory = async (name: string) => {
        try {
            await addCategory(name);
            setSelectedCategory(name.toUpperCase());
            showToast('Categoría creada', 'success');
        } catch {
            showToast('Error al crear categoría', 'error');
        }
    };

    const isSupplierFormValid = useMemo(() => {
        if (isSubmitting) return false;
        if (supplierExpenseAmount <= 0) return false;
        if (!selectedCategory) return false;
        if (!creditorName.trim()) return false;
        if (isCredit === null) return false;

        if (isCredit === true) {
            if (!dueDate) return false;
            if (supplierPaidAmountNum > supplierExpenseAmount) return false;
            if (supplierPaidAmountNum > 0) {
                if (activeShift && deductFromCashRegister === null) return false;
                if (isSupplierCashInsufficient) return false;
                if (isSupplierSplit && supplierSplitRemaining !== 0) return false;
            }
            return true;
        }

        // Contado
        if (activeShift && deductFromCashRegister === null) return false;
        if (isSupplierCashInsufficient) return false;
        if (isSupplierSplit && supplierSplitRemaining !== 0) return false;

        return true;
    }, [
        isSubmitting,
        supplierExpenseAmount,
        selectedCategory,
        creditorName,
        isCredit,
        dueDate,
        supplierPaidAmountNum,
        activeShift,
        deductFromCashRegister,
        isSupplierCashInsufficient,
        isSupplierSplit,
        supplierSplitRemaining,
    ]);

    const getSupplierButtonText = () => {
        if (isSubmitting) return 'Procesando...';
        if (supplierExpenseAmount <= 0) return 'Ingresa el valor del gasto';
        if (!selectedCategory) return 'Elige una categoría';
        if (!creditorName.trim()) return 'Elige o crea un proveedor';
        if (isCredit === null) return 'Elige Contado o Crédito';
        if (isCredit === true) {
            if (!dueDate) return 'Elige fecha de pago';
            if (supplierPaidAmountNum > supplierExpenseAmount) return 'El abono no puede superar el total';
            if (supplierPaidAmountNum > 0) {
                if (activeShift && deductFromCashRegister === null) return 'Elige si el abono sale de caja';
                if (isSupplierCashInsufficient) return 'Saldo insuficiente en caja';
                if (isSupplierSplit && supplierSplitRemaining !== 0) return 'Completa el monto dividido del abono';
                return `Confirmar Crédito y Abono ($${formatCurrency(supplierPaidAmountNum)})`;
            }
            return `Confirmar Crédito ($${formatCurrency(supplierExpenseAmount)})`;
        }
        // Contado
        if (activeShift && deductFromCashRegister === null) return 'Elige si el dinero sale de caja';
        if (isSupplierCashInsufficient) return 'Saldo insuficiente en caja';
        if (isSupplierSplit && supplierSplitRemaining !== 0) return 'Completa el monto dividido';
        return `Confirmar Pago ($${formatCurrency(supplierExpenseAmount)})`;
    };

    const handleSave = async () => {
        if (isSubmitting) return;

        if (supplierExpenseAmount <= 0) {
            showToast('Ingresa un valor válido para el gasto', 'warning');
            return;
        }
        if (!selectedCategory) {
            showToast('Selecciona una categoría', 'warning');
            return;
        }
        if (!creditorName.trim()) {
            showToast('Selecciona o crea un proveedor', 'warning');
            return;
        }
        if (isCredit === null) {
            showToast('Selecciona si la transacción es de Contado o Crédito', 'warning');
            return;
        }

        if (isCredit) {
            if (!dueDate) {
                showToast('Selecciona la fecha límite de pago', 'warning');
                return;
            }
            if (supplierPaidAmountNum > supplierExpenseAmount) {
                showToast('El abono inicial no puede superar el valor total del gasto', 'warning');
                return;
            }
            if (supplierPaidAmountNum > 0) {
                if (activeShift && deductFromCashRegister === null) {
                    showToast('Selecciona si el abono sale de caja o de fondos externos', 'warning');
                    return;
                }
                if (isSupplierSplit && supplierSplitRemaining !== 0) {
                    showToast(
                        supplierSplitRemaining > 0
                            ? `Faltan $${formatCurrency(supplierSplitRemaining)} COP por asignar en los métodos de pago`
                            : `El monto dividido excede el abono por $${formatCurrency(Math.abs(supplierSplitRemaining))} COP`,
                        'warning'
                    );
                    return;
                }
                if (isSupplierCashInsufficient) {
                    showToast(`Saldo insuficiente en caja. Efectivo a entregar: $${formatCurrency(supplierCashAmount)} COP | Disponible: $${formatCurrency(availableCash)} COP`, 'error');
                    return;
                }
            }
        } else {
            // Contado
            if (activeShift && deductFromCashRegister === null) {
                showToast('Selecciona si el dinero sale de caja o de fondos externos', 'warning');
                return;
            }
            if (isSupplierSplit && supplierSplitRemaining !== 0) {
                showToast(
                    supplierSplitRemaining > 0
                        ? `Faltan $${formatCurrency(supplierSplitRemaining)} COP por asignar en los métodos de pago`
                        : `El monto dividido excede el total por $${formatCurrency(Math.abs(supplierSplitRemaining))} COP`,
                    'warning'
                );
                return;
            }
            if (isSupplierCashInsufficient) {
                showToast(`Saldo insuficiente en caja. Efectivo a entregar: $${formatCurrency(supplierCashAmount)} COP | Disponible: $${formatCurrency(availableCash)} COP`, 'error');
                return;
            }
        }

        setIsSubmitting(true);
        try {
            const hasImmediatePayment = (!isCredit && supplierExpenseAmount > 0) || (isCredit && supplierPaidAmountNum > 0);
            let finalMethod = supplierPaymentMethod;
            let finalDescription = description.trim();
            let splitDetailsList: { method: string; amount: number }[] | undefined = undefined;

            if (hasImmediatePayment && isSupplierSplit) {
                splitDetailsList = Object.entries(supplierSplitAmounts)
                    .map(([m, val]) => ({ method: m, amount: parseNumericValue(val) }))
                    .filter(item => item.amount > 0);

                finalMethod = 'Dividido';
                const splitSummary = splitDetailsList.map(d => `${d.method}: $${formatCurrency(d.amount)}`).join(', ');
                finalDescription = finalDescription
                    ? `${finalDescription} [Pago dividido: ${splitSummary}]`
                    : `[Pago dividido: ${splitSummary}]`;
            }

            // 1. Trazabilidad en business_debts
            if (isCredit) {
                await createDebt({
                    type: 'supplier',
                    creditor_name: creditorName.trim(),
                    description: `Gasto a crédito: ${selectedCategory}${finalDescription ? ' - ' + finalDescription : ''}`.trim(),
                    total_amount: supplierExpenseAmount,
                    paid_amount: supplierPaidAmountNum,
                    status: supplierPaidAmountNum >= supplierExpenseAmount ? 'paid' : 'active',
                    due_date: dueDate || undefined,
                    document_date: expenseDate,
                    created_at: new Date(expenseDate + 'T12:00:00').toISOString(),
                    evidence_url: evidenceUpload.imageUrl,
                });

                if (supplierPaidAmountNum > 0) {
                    await createDebt({
                        type: 'supplier',
                        creditor_name: creditorName.trim(),
                        description: `Abono inicial al momento de compra: ${selectedCategory}${finalDescription ? ' - ' + finalDescription : ''}`.trim(),
                        total_amount: 0,
                        paid_amount: supplierPaidAmountNum,
                        status: 'paid',
                        payment_method: finalMethod,
                        payment_details: splitDetailsList,
                        document_date: expenseDate,
                        created_at: new Date(expenseDate + 'T12:00:00').toISOString(),
                        evidence_url: evidenceUpload.imageUrl,
                    });
                }
            } else if (!isLaborCategory) {
                await createDebt({
                    type: 'supplier',
                    creditor_name: creditorName.trim(),
                    description: `Gasto de contado: ${selectedCategory}${finalDescription ? ' - ' + finalDescription : ''}`.trim(),
                    total_amount: supplierExpenseAmount,
                    paid_amount: supplierExpenseAmount,
                    status: 'paid',
                    payment_method: finalMethod,
                    payment_details: splitDetailsList,
                    document_date: expenseDate,
                    created_at: new Date(expenseDate + 'T12:00:00').toISOString(),
                    evidence_url: evidenceUpload.imageUrl,
                });
            }

            // 2. Registro contable del gasto
            const shouldDeductCash = Boolean(activeShift && deductFromCashRegister === true && supplierCashAmount > 0);

            const matchingSupplier = suppliers.find(s => s.name.trim().toLowerCase() === creditorName.trim().toLowerCase());

            await onSave({
                type: 'expense',
                mode: 'manual',
                amount: supplierExpenseAmount,
                description: finalDescription,
                product: '',
                productId: undefined,
                quantity: 0,
                measureUnit: 'UNIDADES',
                category: selectedCategory,
                payment_method: isCredit && supplierPaidAmountNum === 0 ? 'Crédito' : finalMethod,
                deductFromCashRegister: shouldDeductCash,
                cashAmount: shouldDeductCash ? supplierCashAmount : 0,
                isCredit,
                creditorName: creditorName.trim() || undefined,
                supplier_name: creditorName.trim() || undefined,
                supplier_id: matchingSupplier?.id || undefined,
                employee_id: isLaborCategory ? (selectedEmployeeId || undefined) : undefined,
                date: new Date(expenseDate + 'T12:00:00').toISOString(),
                receipt_url: evidenceUpload.imageUrl,
            });

            // Limpieza de estado
            setAmount('');
            setDescription('');
            setSelectedCategory('');
            setIsCredit(null);
            setCreditorName('');
            setSelectedEmployeeId(null);
            setDueDate('');
            setSupplierPaidAmount('');
            setDeductFromCashRegister(null);
            setIsSupplierSplit(false);
            setSupplierSplitAmounts({});
            setSupplierPaymentMethod('cash');
            setExpenseTarget(null);
            evidenceUpload.markAsSaved();
            evidenceUpload.resetImage();
            scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            showToast('Gasto registrado con éxito', 'success');
            await fetchExpenses();
            if (onClose) onClose();
        } catch (err: any) {
            console.error('Error saving expense:', err);
            showToast(err.message || 'Error al registrar el gasto', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="relative w-full max-w-md h-full bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden flex flex-col animate-[slideInRight_0.4s_cubic-bezier(0.16,1,0.3,1)]">
            {/* Header */}
            <div className="px-8 pt-8 pb-4 flex justify-between items-center bg-surface-light dark:bg-surface-dark shrink-0">
                <div className="bg-gray-100 dark:bg-gray-800/80 px-5 py-2 rounded-full border border-gray-200/50 dark:border-gray-700/50">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400">
                        REGISTRO DE GASTO
                    </h2>
                </div>
                <button onClick={onClose} className="size-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-[#256c44] dark:text-primary transition-all active:scale-90">
                    <span className="material-symbols-outlined text-[28px] font-bold">close</span>
                </button>
            </div>

            {/* Tabs */}
            <div className="flex px-8 border-b border-border-light dark:border-border-dark">
                <button
                    onClick={() => setExpenseTab('register')}
                    className={`flex-1 py-4 flex items-center justify-center gap-2 font-bold text-sm relative transition-all ${expenseTab === 'register' ? 'text-text-main dark:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Registro
                    {expenseTab === 'register' && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-status-error rounded-t-full"></div>}
                </button>
                <button
                    onClick={() => setExpenseTab('history')}
                    className={`flex-1 py-4 flex items-center justify-center gap-2 font-bold text-sm relative transition-all ${expenseTab === 'history' ? 'text-text-main dark:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Historial
                    {expenseTab === 'history' && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-status-error rounded-t-full"></div>}
                </button>
            </div>

            <div
                ref={scrollContainerRef}
                onScroll={expenseTab === 'history' ? handleHistoryScroll : undefined}
                className={`flex-1 no-scrollbar bg-surface-light dark:bg-surface-dark custom-scrollbar ${expenseTab === 'history' ? 'overflow-hidden flex flex-col min-h-0' : 'overflow-y-auto'}`}
            >
                {/* History */}
                {expenseTab === 'history' && (
                    <div className="px-8 py-6 flex-1 flex flex-col overflow-hidden min-h-0">
                        {expensesLoading ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                <div className="animate-spin size-8 border-3 border-gray-300 border-t-status-error rounded-full" />
                                <p className="text-xs text-gray-400 font-bold">Cargando historial...</p>
                            </div>
                        ) : expenses.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                <span className="material-symbols-outlined text-4xl text-gray-300">receipt_long</span>
                                <p className="text-sm text-gray-400 font-bold">Sin gastos registrados</p>
                            </div>
                        ) : (
                            <div
                                onScroll={handleHistoryScroll}
                                className="flex-1 overflow-y-auto space-y-2 -mx-2 px-2 min-h-0"
                            >
                                {expenses.map(exp => (
                                    <div key={exp.id} className="bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-xl p-3 transition-all hover:shadow-sm">
                                        {editingExpenseId === exp.id ? (
                                            <div className="space-y-3">
                                                <div className="flex gap-2">
                                                    <div className="flex-1">
                                                        <label htmlFor={`edit-expense-amount-${exp.id}`} className="block text-[9px] font-black text-gray-400 mb-1 uppercase">Monto</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
                                                            <input id={`edit-expense-amount-${exp.id}`} type="text" inputMode="numeric" value={formatWithThousands(editAmount)} onChange={e => setEditAmount(parseCleanNumber(e.target.value))} className="w-full h-9 pl-7 pr-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-black outline-none focus:border-status-error" />
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <label htmlFor={`edit-expense-category-${exp.id}`} className="block text-[9px] font-black text-gray-400 mb-1 uppercase">Categoría</label>
                                                        <select id={`edit-expense-category-${exp.id}`} value={editCategory} onChange={e => setEditCategory(e.target.value)} className="w-full h-9 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold outline-none focus:border-status-error">
                                                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label htmlFor={`edit-expense-desc-${exp.id}`} className="block text-[9px] font-black text-gray-400 mb-1 uppercase">Observación</label>
                                                    <input id={`edit-expense-desc-${exp.id}`} type="text" value={editDescription} onChange={e => setEditDescription(e.target.value)} className="w-full h-9 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold outline-none focus:border-status-error" placeholder="Sin observación" />
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEditingExpenseId(null)} className="flex-1 h-8 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold">Cancelar</button>
                                                    <button onClick={handleSaveEdit} className="flex-1 h-8 bg-status-error text-white rounded-lg text-xs font-bold">Guardar</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-2">
                                                <div className="flex justify-between items-start gap-3">
                                                    <div className="flex-1 min-w-0 flex flex-col items-start gap-1">
                                                        <span className="text-[13px] font-black leading-tight text-text-main dark:text-white truncate w-full uppercase">{exp.category}</span>
                                                        {exp.description && (
                                                            <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate w-full">{exp.description}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col items-end shrink-0 gap-1">
                                                        <div className="flex flex-col items-end leading-tight">
                                                            <span className="text-[13px] font-black text-status-error">${formatWithThousands(String(Math.round(exp.amount)))}</span>
                                                            <span className="text-[9px] text-gray-400 font-bold">{formatExpenseDate(exp.expense_date || exp.created_at)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 mt-1">
                                                            <button onClick={() => handleStartEdit(exp)} className="size-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors" aria-label="Editar gasto" tabIndex={0}>
                                                                <span className="material-symbols-outlined text-[16px]">edit</span>
                                                            </button>
                                                            <button onClick={() => handleDeleteExpense(exp.id)} className="size-7 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors" aria-label="Eliminar gasto" tabIndex={0}>
                                                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {expensesLoadingMore && (
                                    <div className="py-3 flex items-center justify-center gap-2 text-gray-400 text-xs font-bold">
                                        <div className="size-4 border-2 border-status-error border-t-transparent rounded-full animate-spin" />
                                        <span>Cargando más gastos...</span>
                                    </div>
                                )}

                                {hasMoreExpenses && !expensesLoadingMore && (
                                    <div className="py-2 text-center">
                                        <button
                                            type="button"
                                            onClick={fetchMoreExpenses}
                                            className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 rounded-lg transition-all inline-flex items-center gap-1"
                                        >
                                            <span className="material-symbols-outlined text-sm">expand_more</span>
                                            Cargar 10 más
                                        </button>
                                    </div>
                                )}

                                {!hasMoreExpenses && expenses.length > 10 && (
                                    <div className="py-3 text-center text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                                        Fin del historial
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Register View — formulario manual */}
                {expenseTab === 'register' && (
                    <div className="px-8 py-6 flex-1 flex flex-col space-y-5">
                        {!expenseTarget ? (
                            /* ===== PANTALLA INICIAL DE SELECCIÓN (UNA DEBAJO DE LA OTRA) ===== */
                            <div className="flex-1 flex flex-col justify-center py-4 space-y-3.5 animate-fadeIn">
                                {/* Opción 1: Gasto Proveedor */}
                                <button
                                    type="button"
                                    onClick={() => setExpenseTarget('supplier')}
                                        className="w-full p-4 rounded-3xl border-2 border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-800/80 hover:border-amber-500 dark:hover:border-amber-500 hover:shadow-lg hover:shadow-amber-500/10 transition-all text-left flex items-center justify-between group active:scale-[0.98]"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="size-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                                <span className="material-symbols-outlined text-2xl">storefront</span>
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                                                    Gasto Proveedor
                                                </h4>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                                    Compras, facturas, insumos, servicios y proveedores.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="size-8 rounded-full bg-gray-100 dark:bg-gray-700 group-hover:bg-amber-500 group-hover:text-white text-gray-400 flex items-center justify-center transition-all shrink-0 ml-2">
                                            <span className="material-symbols-outlined text-lg group-hover:translate-x-0.5 transition-transform">chevron_right</span>
                                        </div>
                                    </button>

                                    {/* Opción 2: Pago a Personal */}
                                    <button
                                        type="button"
                                        onClick={() => setExpenseTarget('payroll')}
                                        className="w-full p-4 rounded-3xl border-2 border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-800/80 hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-500/10 transition-all text-left flex items-center justify-between group active:scale-[0.98]"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="size-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                                <span className="material-symbols-outlined text-2xl">badge</span>
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                                                    Pago a Personal
                                                </h4>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                                    Sueldos, turnos, vales, horas extra y colaboradores.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="size-8 rounded-full bg-gray-100 dark:bg-gray-700 group-hover:bg-emerald-500 group-hover:text-white text-gray-400 flex items-center justify-center transition-all shrink-0 ml-2">
                                            <span className="material-symbols-outlined text-lg group-hover:translate-x-0.5 transition-transform">chevron_right</span>
                                        </div>
                                    </button>
                                </div>
                        ) : (
                            <>
                                {/* Barra superior para cambiar tipo de egreso */}
                                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setExpenseTarget(null)}
                                        className="text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-1 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-base">arrow_back</span>
                                        <span>Cambiar tipo de gasto</span>
                                    </button>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                        expenseTarget === 'payroll'
                                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                    }`}>
                                        {expenseTarget === 'payroll' ? 'Pago a Personal' : 'Gasto Proveedor'}
                                    </span>
                                </div>

                                {/* Contenido condicional: Proveedor vs Nómina/Personal */}
                                {expenseTarget === 'payroll' ? (
                            /* ===== FORMULARIO PAGO A PERSONAL ===== */
                            <div className="space-y-5">
                                {/* 1. Evidencia fotográfica del vale o comprobante */}
                                <EvidenceUploader
                                    previewUrl={evidenceUpload.previewUrl}
                                    uploading={evidenceUpload.uploading}
                                    statusText={evidenceUpload.statusText}
                                    showCropper={evidenceUpload.showCropper}
                                    cropperImageSrc={evidenceUpload.cropperImageSrc}
                                    onCropComplete={evidenceUpload.onCropComplete}
                                    onCropCancel={evidenceUpload.onCropCancel}
                                    showInAppCamera={evidenceUpload.showInAppCamera}
                                    onCameraCapture={evidenceUpload.onCameraCapture}
                                    onCameraClose={evidenceUpload.onCameraClose}
                                    triggerCamera={evidenceUpload.triggerCamera}
                                    triggerGallery={evidenceUpload.triggerGallery}
                                    deleteImage={evidenceUpload.deleteImage}
                                    label="Foto del vale o comprobante firmado (opcional)"
                                />

                                {/* 2. Selector de Colaborador */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.12em]">
                                            COLABORADOR <span className="text-status-error">*</span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setShowNewEmployeeModal(true)}
                                            className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                                        >
                                            <span className="material-symbols-outlined text-sm">person_add</span>
                                            <span>Crear</span>
                                        </button>
                                    </div>

                                    {payrollEmployee ? (
                                        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="size-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                                    <span className="material-symbols-outlined text-xl">person</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="text-sm font-black text-gray-900 dark:text-white truncate">
                                                        {payrollEmployee.full_name}
                                                    </h4>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate block">
                                                        {payrollEmployee.job_title || 'Colaborador'} {payrollEmployee.document_number ? `· CC ${payrollEmployee.document_number}` : ''}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setPayrollEmployee(null)}
                                                className="size-8 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
                                                aria-label="Cambiar colaborador"
                                            >
                                                <span className="material-symbols-outlined text-base">close</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div ref={employeeDropdownRef} className="relative">
                                            <input
                                                type="text"
                                                value={employeeSearchTerm}
                                                onChange={e => {
                                                    setEmployeeSearchTerm(e.target.value);
                                                    setShowEmployeeDropdown(true);
                                                }}
                                                onFocus={() => setShowEmployeeDropdown(true)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Escape') setShowEmployeeDropdown(false);
                                                }}
                                                placeholder="Buscar colaborador por nombre o cargo..."
                                                className="w-full h-12 pl-4 pr-10 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs font-bold text-gray-800 dark:text-white outline-none focus:border-emerald-500 shadow-sm"
                                            />
                                            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none">
                                                search
                                            </span>

                                            {showEmployeeDropdown && (
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-30 max-h-48 overflow-y-auto custom-scrollbar p-1">
                                                    {filteredPayrollEmployees.length === 0 ? (
                                                        <div className="p-4 text-center text-xs text-gray-400">
                                                            No se encontraron colaboradores
                                                        </div>
                                                    ) : (
                                                        filteredPayrollEmployees.map(emp => (
                                                            <button
                                                                key={emp.id}
                                                                type="button"
                                                                onMouseDown={e => e.preventDefault()}
                                                                onClick={() => {
                                                                    setPayrollEmployee(emp);
                                                                    setShowEmployeeDropdown(false);
                                                                    setEmployeeSearchTerm('');
                                                                }}
                                                                className="w-full p-2.5 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-700/60 flex items-center justify-between gap-2 transition-colors"
                                                            >
                                                                <div className="min-w-0">
                                                                    <div className="text-xs font-bold text-gray-900 dark:text-white truncate">
                                                                        {emp.full_name}
                                                                    </div>
                                                                    <div className="text-[10px] text-gray-400">
                                                                        {emp.job_title || 'General'}
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* 3. Selector de Concepto (Dropdown editable con + Nuevo) */}
                                <PayrollConceptDropdown
                                    selectedConcept={payrollConcept}
                                    onSelectConcept={setPayrollConcept}
                                />

                                {/* 4. Monto a Pagar */}
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                                        VALOR A PAGAR ($) *
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">$</span>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={formatWithThousands(payrollAmount)}
                                            onChange={e => setPayrollAmount(parseCleanNumber(e.target.value))}
                                            placeholder="0"
                                            className="w-full h-12 pl-9 pr-4 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-2xl text-lg font-black text-gray-900 dark:text-white outline-none focus:border-emerald-500 tabular-nums shadow-sm"
                                        />
                                    </div>
                                </div>

                                {/* 5. Observaciones (Opcional) */}
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                                        OBSERVACIONES (OPCIONAL)
                                    </label>
                                    <input
                                        type="text"
                                        value={payrollNotes}
                                        onChange={e => setPayrollNotes(e.target.value)}
                                        placeholder="Ej: Turno fin de semana, propina, abono..."
                                        className="w-full h-11 px-4 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-emerald-500 shadow-sm"
                                    />
                                </div>

                                {/* 6. Control de Turno de Caja y Método de Pago */}
                                <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                                    {/* Detección de Turno Abierto y Selector Sí / No */}
                                    {activeShift ? (
                                        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 rounded-2xl space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                                    ¿EL DINERO SALE DE CAJA?
                                                </label>
                                                <div className="flex bg-gray-200/70 dark:bg-gray-900 p-1 rounded-xl gap-1">
                                                    <button
                                                        type="button"
                                                        onPointerDown={dismissKeyboard}
                                                        onClick={() => {
                                                            dismissKeyboard();
                                                            setPayrollDeductFromCash(true);
                                                        }}
                                                        className={`px-4 py-1.5 text-xs font-black tracking-wider uppercase rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                                                            payrollDeductFromCash === true
                                                                 ? 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                                                                 : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                                        }`}
                                                    >
                                                        {payrollDeductFromCash === true && <span className="material-symbols-outlined text-xs">check</span>}
                                                        Sí
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onPointerDown={dismissKeyboard}
                                                        onClick={() => {
                                                            dismissKeyboard();
                                                            setPayrollDeductFromCash(false);
                                                        }}
                                                        className={`px-4 py-1.5 text-xs font-black tracking-wider uppercase rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                                                            payrollDeductFromCash === false
                                                                 ? 'bg-white dark:bg-gray-700 text-rose-500 dark:text-rose-400 shadow-sm'
                                                                 : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                                        }`}
                                                    >
                                                        {payrollDeductFromCash === false && <span className="material-symbols-outlined text-xs">close</span>}
                                                        No
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                                {payrollDeductFromCash === true
                                                    ? `El egreso se descontará de "${activeShift.register?.name || 'Caja física'}" (únicamente en efectivo).`
                                                    : payrollDeductFromCash === false
                                                    ? 'Fondos externos: No se registrará en este turno ni afectará el arqueo de caja.'
                                                    : 'Indica si el dinero saldrá del efectivo de la caja o de fondos externos.'}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 flex items-center gap-3">
                                            <div className="size-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-center shrink-0">
                                                <span className="material-symbols-outlined text-lg">point_of_sale</span>
                                            </div>
                                            <div className="text-xs min-w-0 leading-snug">
                                                <span className="font-bold text-gray-900 dark:text-white">Sin caja abierta:</span>{' '}
                                                <span className="font-medium text-gray-500 dark:text-gray-400">
                                                    Este pago no se registrará en ningún turno ni afectará arqueos de caja.
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Mostrar métodos de pago únicamente tras elegir Sí o No (o si no hay turno) */}
                                    {(!activeShift || payrollDeductFromCash !== null) && (
                                        <>
                                            {/* Encabezado Método de pago y botón dividir */}
                                            <div className="flex items-center justify-between">
                                                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                                    MÉTODO DE PAGO
                                                </label>
                                                <button
                                                    type="button"
                                                    onPointerDown={dismissKeyboard}
                                                    onClick={() => {
                                                        dismissKeyboard();
                                                        setIsPayrollSplit(prev => {
                                                            const next = !prev;
                                                            if (next) {
                                                                const defaultMethod = paymentMethods.find(m => m.toLowerCase().includes('efectivo')) || paymentMethods[0] || 'Efectivo';
                                                                setPayrollSplitAmounts({ [defaultMethod]: payrollNetAmount > 0 ? payrollNetAmount.toLocaleString('es-ES') : '' });
                                                            } else {
                                                                setPayrollSplitAmounts({});
                                                            }
                                                            return next;
                                                        });
                                                    }}
                                                    className={`text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                                                        isPayrollSplit
                                                            ? 'text-amber-600 dark:text-amber-400 hover:underline'
                                                            : 'text-emerald-600 dark:text-emerald-400 hover:underline'
                                                    }`}
                                                >
                                                    <span className="material-symbols-outlined text-sm">
                                                        {isPayrollSplit ? 'arrow_back' : 'call_split'}
                                                    </span>
                                                    <span>{isPayrollSplit ? 'Método único' : 'Dividir pago'}</span>
                                                </button>
                                            </div>

                                            {!isPayrollSplit ? (
                                                /* Modo Método Único */
                                                <div>
                                                    <select
                                                        value={payrollPaymentMethod}
                                                        onChange={e => setPayrollPaymentMethod(e.target.value)}
                                                        className="w-full h-11 px-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold outline-none"
                                                    >
                                                        {paymentMethods.map(m => (
                                                            <option key={m} value={m.toLowerCase()}>{formatPaymentMethodLabel(m)}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ) : (
                                                /* Modo Pago Dividido */
                                                <div className="space-y-2.5 p-3 rounded-2xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-200/80 dark:border-gray-700/80 animate-fadeIn">
                                                    <span className="text-[10px] font-black uppercase text-gray-500 dark:text-gray-400 tracking-wider block">
                                                        Dividir valor entre métodos
                                                    </span>
                                                    <div className="space-y-2">
                                                        {paymentMethods.map(m => (
                                                            <div key={m} className="flex items-center gap-2.5">
                                                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-24 truncate shrink-0">
                                                                    {m}
                                                                </span>
                                                                <div className="relative flex-1">
                                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">$</span>
                                                                    <input
                                                                        type="text"
                                                                        inputMode="numeric"
                                                                        value={payrollSplitAmounts[m] || ''}
                                                                        onChange={e => handlePayrollSplitAmountChange(m, e.target.value)}
                                                                        placeholder="0"
                                                                        className="w-full h-10 pl-7 pr-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-emerald-500"
                                                                    />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Estado del monto dividido */}
                                                    <div className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                                                        payrollSplitRemaining === 0
                                                            ? 'border-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                                            : payrollSplitRemaining < 0
                                                            ? 'border-red-300 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                                                            : 'border-amber-300 bg-amber-50/80 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                                                    }`}>
                                                        <span>
                                                            {payrollSplitRemaining === 0 ? '✓ Monto completo' : payrollSplitRemaining < 0 ? 'Monto excedido' : 'Restante por asignar'}
                                                        </span>
                                                        <span className="font-black">
                                                            ${formatCurrency(Math.abs(payrollSplitRemaining))} COP
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Alerta de saldo insuficiente o indicador de disponibilidad de efectivo en caja */}
                                            {activeShift && payrollDeductFromCash === true ? (
                                                payrollCashAmount > 0 && (
                                                    isPayrollCashInsufficient ? (
                                                        <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center gap-2.5 text-xs text-red-700 dark:text-red-300">
                                                            <span className="material-symbols-outlined text-red-600 text-lg shrink-0">error</span>
                                                            <div>
                                                                <span className="font-bold">Efectivo insuficiente en caja.</span> Disponible: ${formatCurrency(availableCash)} COP. Faltan ${formatCurrency(payrollCashAmount - availableCash)} COP.
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/40 text-[11px] font-bold text-gray-500 dark:text-gray-400 flex items-center justify-between">
                                                            <span>Efectivo disponible en caja:</span>
                                                            <span className="font-black text-emerald-600 dark:text-emerald-400">${formatCurrency(availableCash)} COP</span>
                                                        </div>
                                                    )
                                                )
                                            ) : activeShift && payrollDeductFromCash === false ? (
                                                <div className="px-3 py-2.5 rounded-xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-200/60 dark:border-gray-700/60 text-[11px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-sm text-emerald-600 dark:text-emerald-400 shrink-0">info</span>
                                                    <span>Fondos externos: No se registrará en el turno actual ni afectará el arqueo de caja.</span>
                                                </div>
                                            ) : null}
                                        </>
                                    )}
                                </div>

                                {/* 7. Resumen Neto y Botón Guardar - Responsivo para móviles con texto más corto */}
                                <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-3">
                                    <div className="flex items-baseline justify-between gap-2 flex-wrap sm:flex-nowrap">
                                        <span className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 shrink-0">
                                            TOTAL A PAGAR:
                                        </span>
                                        <div className="text-right min-w-0">
                                            <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white whitespace-nowrap">
                                                ${formatCurrency(payrollNetAmount)}
                                            </span>
                                            <span className="text-xs sm:text-sm font-black text-gray-500 dark:text-gray-400 ml-1">
                                                COP
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleSavePayroll}
                                        disabled={
                                            isSubmitting ||
                                            !payrollEmployee ||
                                            !payrollConcept ||
                                            payrollNetAmount <= 0 ||
                                            (Boolean(activeShift) && payrollDeductFromCash === null) ||
                                            isPayrollCashInsufficient ||
                                            (isPayrollSplit && payrollSplitRemaining !== 0)
                                        }
                                        className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all text-base flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-2xl">
                                            payments
                                        </span>
                                        <span>
                                            {isSubmitting
                                                ? 'Procesando...'
                                                : (Boolean(activeShift) && payrollDeductFromCash === null)
                                                ? 'Elige si el dinero sale de caja'
                                                : isPayrollCashInsufficient
                                                ? 'Saldo insuficiente en caja'
                                                : isPayrollSplit && payrollSplitRemaining !== 0
                                                ? 'Completa el monto dividido'
                                                : `Confirmar Pago ($${formatCurrency(payrollNetAmount)})`}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* ===== FORMULARIO GASTO PROVEEDOR ===== */
                            <>
                                {/* 1. Evidencia (opcional) */}
                                <EvidenceUploader
                                    previewUrl={evidenceUpload.previewUrl}
                                    uploading={evidenceUpload.uploading}
                                    statusText={evidenceUpload.statusText}
                                    showCropper={evidenceUpload.showCropper}
                                    cropperImageSrc={evidenceUpload.cropperImageSrc}
                                    onCropComplete={evidenceUpload.onCropComplete}
                                    onCropCancel={evidenceUpload.onCropCancel}
                                    showInAppCamera={evidenceUpload.showInAppCamera}
                                    onCameraCapture={evidenceUpload.onCameraCapture}
                                    onCameraClose={evidenceUpload.onCameraClose}
                                    triggerCamera={evidenceUpload.triggerCamera}
                                    triggerGallery={evidenceUpload.triggerGallery}
                                    deleteImage={evidenceUpload.deleteImage}
                                    label="Evidencia (opcional)"
                                    onScanWithAI={() => setShowInvoiceScan(true)}
                                />

                        {/* 2. Campos editables */}
                        <div className="space-y-3">
                            {/* Date */}
                            <div
                                onClick={handleOpenDatePicker}
                                className="relative flex items-center justify-between h-11 px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[18px] text-gray-400">calendar_month</span>
                                    <span className={`text-sm font-bold ${expenseDate !== getLocalDateValue() ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}>
                                        {formatExpenseDateLabel(expenseDate)}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenDatePicker();
                                    }}
                                    className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                    Elegir
                                </button>
                                <input
                                    ref={dateInputRef}
                                    type="date"
                                    value={expenseDate}
                                    max={getLocalDateValue()}
                                    onChange={e => setExpenseDate(e.target.value)}
                                    className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
                                    tabIndex={-1}
                                />
                            </div>

                            {/* Amount + Category */}
                            <div className="flex items-end gap-3">
                                <div className="flex flex-col shrink-0">
                                    <label htmlFor="expense-amount" className="text-[10px] font-black text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-[0.15em]">VALOR</label>
                                    <div className="relative group">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg group-focus-within:text-red-500 transition-colors tabular-nums">$</span>
                                        <input id="expense-amount" type="text" inputMode="numeric" value={formatWithThousands(amount)} onChange={e => setAmount(parseCleanNumber(e.target.value))} className="w-36 h-12 pl-9 pr-3 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-2xl focus:outline-none focus:ring-0 focus:border-red-500 focus:bg-white transition-all font-black text-lg text-center text-gray-800 dark:text-white placeholder:text-gray-300 shadow-sm tabular-nums" placeholder="0" />
                                    </div>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.15em] mb-2">CATEGORÍA</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowCategoryPicker(true)}
                                        className={`w-full h-12 px-4 bg-white dark:bg-black/20 border rounded-2xl outline-none font-black text-xs uppercase tracking-wider text-left flex items-center justify-between shadow-sm transition-all border-gray-200 dark:border-gray-700 hover:border-gray-300 ${!selectedCategory ? 'text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-white'}`}
                                    >
                                        <span className="truncate">{selectedCategory || 'Elegir categoría'}</span>
                                        <span className="material-symbols-outlined shrink-0 text-gray-400">expand_more</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Observations */}
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="flex items-center justify-between mb-2">
                                <label htmlFor="expense-description" className="block text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.15em]">OBSERVACIONES / DETALLES</label>
                                <button type="button" onClick={() => setShowObservationSheet(true)} className="size-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-status-error hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Ampliar observación" tabIndex={0}>
                                    <span className="material-symbols-outlined text-[18px]">open_in_full</span>
                                </button>
                            </div>
                            <textarea id="expense-description" value={description} onChange={e => setDescription(e.target.value)} className="flex-1 w-full px-5 py-3 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-2xl focus:outline-none focus:ring-0 focus:border-red-500 transition-all font-bold text-sm resize-none placeholder:text-gray-400 shadow-sm" placeholder="Añade detalles relevantes..." />
                        </div>

                        {/* Transaction type + payment */}
                        <div className="flex flex-col gap-4 border-t border-gray-100 dark:border-gray-800 pt-4 mt-2">
                            {/* Proveedor o Colaborador según categoría */}
                            <div ref={supplierSectionRef} className="scroll-mt-4">
                                <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-[0.12em]">
                                    {isLaborCategory ? 'Colaborador / Empleado' : 'Proveedor'} <span className="text-status-error">*</span>
                                </label>
                                {(() => {
                                    if (isLaborCategory) {
                                        const selectedEmp = employees.find(e =>
                                            e.id === selectedEmployeeId ||
                                            e.full_name.trim().toLowerCase() === creditorName.trim().toLowerCase()
                                        );
                                        if (selectedEmp && creditorName.trim() !== '') {
                                            return (
                                                <div className="flex items-center gap-2 w-full h-12 pl-4 pr-2 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-500 rounded-2xl">
                                                    <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[20px] shrink-0">badge</span>
                                                    <span className="flex-1 min-w-0 truncate text-sm font-bold text-emerald-800 dark:text-emerald-200">
                                                        {selectedEmp.full_name} ({selectedEmp.job_title || 'Colaborador'})
                                                    </span>
                                                    <button type="button" onClick={() => { setCreditorName(''); setSelectedEmployeeId(null); setShowCreditorList(false); }} className="size-8 shrink-0 flex items-center justify-center rounded-full text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 active:scale-90 transition-all" aria-label="Cambiar colaborador">
                                                        <span className="material-symbols-outlined text-[20px]">close</span>
                                                    </button>
                                                </div>
                                            );
                                        }

                                        const filteredEmployees = creditorSearchQuery.trim()
                                            ? employees.filter(e => e.full_name.toLowerCase().includes(creditorSearchQuery.toLowerCase()) || (e.job_title && e.job_title.toLowerCase().includes(creditorSearchQuery.toLowerCase())))
                                            : employees;

                                        return (
                                            <div className={`relative ${showCreditorList ? 'z-30' : ''}`}>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleToggleCreditorList}
                                                        className="flex-1 min-w-0 h-12 px-4 bg-surface-light dark:bg-gray-800/30 border border-border-light dark:border-border-dark rounded-2xl flex items-center justify-between shadow-sm hover:border-gray-300 dark:hover:border-gray-600 transition-all text-left"
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="material-symbols-outlined text-gray-400 text-[20px] shrink-0">badge</span>
                                                            <span className="text-sm font-bold text-gray-400 dark:text-gray-500 truncate">
                                                                Elegir colaborador...
                                                            </span>
                                                        </div>
                                                        <span className={`material-symbols-outlined text-gray-400 text-[20px] shrink-0 transition-transform duration-200 ${showCreditorList ? 'rotate-180' : ''}`}>
                                                            expand_more
                                                        </span>
                                                    </button>
                                                    <button type="button" onClick={() => setShowNewEmployeeModal(true)} className="h-12 px-3 flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-2xl transition-colors border border-dashed border-gray-300 dark:border-gray-700 shrink-0" aria-label="Crear colaborador" tabIndex={0}>
                                                        <span className="material-symbols-outlined text-lg">person_add</span>
                                                        <span className="hidden min-[400px]:inline text-[10px] font-black uppercase tracking-wider">Crear</span>
                                                    </button>
                                                </div>

                                                {showCreditorList && (
                                                    <div className="absolute top-full -left-5 -right-5 mt-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl z-[70] overflow-hidden animate-[fadeIn_0.15s_ease-out]">
                                                        {/* Buscador interno dentro del selector */}
                                                        <div className="p-2.5 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
                                                            <div className="relative">
                                                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">search</span>
                                                                <input
                                                                    ref={supplierSearchInputRef}
                                                                    type="text"
                                                                    value={creditorSearchQuery}
                                                                    onChange={e => setCreditorSearchQuery(e.target.value)}
                                                                    placeholder="Buscar colaborador..."
                                                                    className="w-full h-10 pl-9 pr-8 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 dark:text-white placeholder:text-gray-400 font-medium"
                                                                />
                                                                {creditorSearchQuery && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setCreditorSearchQuery('')}
                                                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 size-5 flex items-center justify-center rounded-full"
                                                                    >
                                                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Lista de colaboradores */}
                                                        <div className="max-h-60 overflow-y-auto overscroll-contain custom-scrollbar p-1.5">
                                                            {filteredEmployees.length === 0 ? (
                                                                <div className="py-6 px-4 text-center">
                                                                    <p className="text-xs font-bold text-gray-400 dark:text-gray-500">
                                                                        No se encontró ningún colaborador
                                                                    </p>
                                                                </div>
                                                            ) : (
                                                                filteredEmployees.map((emp) => (
                                                                    <button
                                                                        key={emp.id}
                                                                        type="button"
                                                                        onPointerDown={(e) => e.preventDefault()}
                                                                        onClick={() => {
                                                                            setCreditorName(emp.full_name);
                                                                            setSelectedEmployeeId(emp.id);
                                                                            setShowCreditorList(false);
                                                                            setCreditorSearchQuery('');
                                                                        }}
                                                                        className="w-full p-2.5 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-700/60 flex items-center justify-between gap-3 transition-colors group cursor-pointer"
                                                                    >
                                                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                                            <span className="material-symbols-outlined text-[18px] text-gray-400 shrink-0">badge</span>
                                                                            <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate group-hover:text-primary transition-colors">{emp.full_name}</span>
                                                                        </div>
                                                                        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 font-medium bg-gray-100 dark:bg-gray-700/50 px-2 py-0.5 rounded-md">{emp.job_title || 'General'}</span>
                                                                    </button>
                                                                ))
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }

                                    // Flujo comercial habitual de proveedor
                                    const isSelected = suppliers.some(s => s.name.trim().toLowerCase() === creditorName.trim().toLowerCase()) && creditorName.trim() !== '';
                                    if (isSelected) {
                                        return (
                                            <div className="flex items-center gap-2 w-full h-12 pl-4 pr-2 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-500 rounded-2xl">
                                                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[20px] shrink-0">check_circle</span>
                                                <span className="flex-1 min-w-0 truncate text-sm font-bold text-emerald-800 dark:text-emerald-200">{creditorName}</span>
                                                <button type="button" onClick={() => { setCreditorName(''); setShowCreditorList(false); }} className="size-8 shrink-0 flex items-center justify-center rounded-full text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 active:scale-90 transition-all" aria-label="Cambiar proveedor">
                                                    <span className="material-symbols-outlined text-[20px]">close</span>
                                                </button>
                                            </div>
                                        );
                                    }

                                    const filteredSuppliers = creditorSearchQuery.trim()
                                        ? suppliers.filter(s => s.name.toLowerCase().includes(creditorSearchQuery.toLowerCase()) || (s.nit && s.nit.toLowerCase().includes(creditorSearchQuery.toLowerCase())))
                                        : suppliers;

                                    return (
                                        <div className={`relative ${showCreditorList ? 'z-30' : ''}`}>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleToggleCreditorList}
                                                    className="flex-1 min-w-0 h-12 px-4 bg-surface-light dark:bg-gray-800/30 border border-border-light dark:border-border-dark rounded-2xl flex items-center justify-between shadow-sm hover:border-gray-300 dark:hover:border-gray-600 transition-all text-left"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="material-symbols-outlined text-gray-400 text-[20px] shrink-0">storefront</span>
                                                        <span className="text-sm font-bold text-gray-400 dark:text-gray-500 truncate">
                                                            Elegir proveedor...
                                                        </span>
                                                    </div>
                                                    <span className={`material-symbols-outlined text-gray-400 text-[20px] shrink-0 transition-transform duration-200 ${showCreditorList ? 'rotate-180' : ''}`}>
                                                        expand_more
                                                    </span>
                                                </button>
                                                <button type="button" onClick={() => { setShowNewSupplierForm(true); setNewSupplierName(creditorSearchQuery.trim()); setNewSupplierNit(''); setNewSupplierPhone(''); setNewSupplierAddress(''); }} className="h-12 px-3 flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-2xl transition-colors border border-dashed border-gray-300 dark:border-gray-700 shrink-0" aria-label="Crear proveedor" tabIndex={0}>
                                                    <span className="material-symbols-outlined text-lg">person_add</span>
                                                    <span className="hidden min-[400px]:inline text-[10px] font-black uppercase tracking-wider">Crear</span>
                                                </button>
                                            </div>

                                            {showCreditorList && (
                                                <div className="absolute top-full -left-5 -right-5 mt-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl z-[70] overflow-hidden animate-[fadeIn_0.15s_ease-out]">
                                                    {/* Buscador interno dentro del selector */}
                                                    <div className="p-2.5 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
                                                        <div className="relative">
                                                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">search</span>
                                                            <input
                                                                ref={supplierSearchInputRef}
                                                                type="text"
                                                                value={creditorSearchQuery}
                                                                onChange={e => setCreditorSearchQuery(e.target.value)}
                                                                placeholder="Buscar proveedor..."
                                                                className="w-full h-10 pl-9 pr-8 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 dark:text-white placeholder:text-gray-400 font-medium"
                                                            />
                                                            {creditorSearchQuery && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCreditorSearchQuery('')}
                                                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 size-5 flex items-center justify-center rounded-full"
                                                                >
                                                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Lista con scrollbar custom */}
                                                    <div className="max-h-60 overflow-y-auto overscroll-contain custom-scrollbar p-1.5">
                                                        {filteredSuppliers.length === 0 ? (
                                                            <div className="py-6 px-4 text-center">
                                                                <p className="text-xs font-bold text-gray-400 dark:text-gray-500">
                                                                    No se encontró ningún proveedor
                                                                </p>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setShowNewSupplierForm(true);
                                                                        setNewSupplierName(creditorSearchQuery.trim());
                                                                        setShowCreditorList(false);
                                                                    }}
                                                                    className="mt-2 text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
                                                                >
                                                                    <span className="material-symbols-outlined text-[14px]">add</span>
                                                                    Crear "{creditorSearchQuery}"
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            filteredSuppliers.map((supplier) => (
                                                                <button
                                                                    key={supplier.id}
                                                                    type="button"
                                                                    onPointerDown={(e) => e.preventDefault()}
                                                                    onClick={() => {
                                                                        setCreditorName(supplier.name);
                                                                        setShowCreditorList(false);
                                                                        setCreditorSearchQuery('');
                                                                    }}
                                                                    className="w-full p-2.5 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-700/60 flex items-center justify-between gap-3 transition-colors group cursor-pointer"
                                                                >
                                                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                                        {supplier.color ? (
                                                                            <span
                                                                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                                                                style={{ backgroundColor: supplier.color }}
                                                                            />
                                                                        ) : (
                                                                            <span className="material-symbols-outlined text-[18px] text-gray-400 shrink-0">
                                                                                storefront
                                                                            </span>
                                                                        )}
                                                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate group-hover:text-primary transition-colors">{supplier.name}</span>
                                                                    </div>
                                                                </button>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                                {!creditorName.trim() && (
                                    <p className="text-[10px] text-orange-500 font-bold mt-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[12px]">warning</span>
                                        {isLaborCategory ? 'El colaborador es obligatorio' : 'El proveedor es obligatorio'}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-[0.12em]">Tipo de Transacción</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button type="button" onPointerDown={dismissKeyboard} onClick={() => { dismissKeyboard(); setIsCredit(false); }} className={`flex items-center justify-center py-4 rounded-2xl border-2 transition-all active:scale-[0.97] ${isCredit === false ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 shadow-lg shadow-emerald-500/10' : 'bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                                        <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isCredit === false ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-400'}`}>Contado</span>
                                    </button>
                                    <button type="button" onPointerDown={dismissKeyboard} onClick={() => { dismissKeyboard(); setIsCredit(true); }} className={`flex items-center justify-center py-4 rounded-2xl border-2 transition-all active:scale-[0.97] ${isCredit === true ? 'bg-primary/10 dark:bg-primary/15 border-primary shadow-lg shadow-primary/10' : 'bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                                        <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isCredit === true ? 'text-primary dark:text-primary' : 'text-gray-400'}`}>Crédito</span>
                                    </button>
                                </div>
                            </div>

                            {/* Fecha de Pago (Crédito) */}
                            {isCredit && (
                                <div className="animate-[fadeIn_0.2s_ease-out]">
                                    <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-[0.12em]">
                                        Fecha de Pago <span className="text-status-error">*</span>
                                    </label>
                                    <div
                                        onClick={handleOpenDueDatePicker}
                                        className="relative flex items-center justify-between h-12 px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <span className="material-symbols-outlined text-[18px] text-gray-400">calendar_month</span>
                                            <span className={`text-sm font-bold ${dueDate ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                                                {dueDate ? formatExpenseDateLabel(dueDate) : 'Elegir fecha de pago'}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenDueDatePicker();
                                            }}
                                            className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                        >
                                            Elegir
                                        </button>
                                        <input
                                            ref={dueDateInputRef}
                                            id="expense-due-date"
                                            type="date"
                                            value={dueDate}
                                            min={getLocalDateValue()}
                                            onChange={e => setDueDate(e.target.value)}
                                            className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
                                            tabIndex={-1}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Abono inicial (opcional) si es crédito */}
                            {isCredit && supplierExpenseAmount > 0 && (
                                <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800 animate-[fadeIn_0.2s_ease-out]">
                                    <div>
                                        <label htmlFor="expense-supplier-paid" className="block text-[10px] font-black text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-[0.12em]">
                                            Abono inicial (opcional)
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">$</span>
                                            <input
                                                id="expense-supplier-paid"
                                                type="text"
                                                inputMode="numeric"
                                                value={formatWithThousands(supplierPaidAmount)}
                                                onChange={e => setSupplierPaidAmount(parseCleanNumber(e.target.value))}
                                                placeholder="0"
                                                className="w-full h-12 pl-9 pr-4 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-2xl text-lg font-black text-gray-900 dark:text-white outline-none focus:border-red-500 tabular-nums shadow-sm"
                                            />
                                        </div>
                                    </div>

                                    {/* Resumen de deuda y saldo pendiente */}
                                    <div className="p-3 bg-gray-50/80 dark:bg-gray-800/40 border border-gray-200/80 dark:border-gray-700/80 rounded-2xl space-y-1.5 text-xs">
                                        <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
                                            <span>Total Factura:</span>
                                            <span className="font-bold text-gray-800 dark:text-gray-200">${formatCurrency(supplierExpenseAmount)} COP</span>
                                        </div>
                                        {supplierPaidAmountNum > 0 && (
                                            <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                                                <span>Abono inicial:</span>
                                                <span className="font-bold">-${formatCurrency(supplierPaidAmountNum)} COP</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center pt-1.5 border-t border-gray-200/60 dark:border-gray-700/60 font-black">
                                            <span className="text-gray-600 dark:text-gray-300 uppercase tracking-wider text-[10px]">Saldo pendiente:</span>
                                            <span className={`text-sm ${supplierPendingBalance > 0 ? 'text-status-error' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                ${formatCurrency(supplierPendingBalance)} COP
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Control de Turno de Caja y Método de Pago (Para Contado o Crédito con Abono) */}
                            {(!isCredit || (isCredit && supplierPaidAmountNum > 0)) && (
                                <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-800 animate-[fadeIn_0.2s_ease-out]">
                                    {/* Detección de Turno Abierto y Selector Sí / No */}
                                    {activeShift ? (
                                        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 rounded-2xl space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                                    {isCredit ? '¿EL DINERO DEL ABONO SALE DE CAJA?' : '¿EL DINERO SALE DE CAJA?'}
                                                </label>
                                                <div className="flex bg-gray-200/70 dark:bg-gray-900 p-1 rounded-xl gap-1">
                                                    <button
                                                        type="button"
                                                        onPointerDown={dismissKeyboard}
                                                        onClick={() => {
                                                            dismissKeyboard();
                                                            setDeductFromCashRegister(true);
                                                        }}
                                                        className={`px-4 py-1.5 text-xs font-black tracking-wider uppercase rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                                                            deductFromCashRegister === true
                                                                ? 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                                                                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                                        }`}
                                                    >
                                                        {deductFromCashRegister === true && <span className="material-symbols-outlined text-xs">check</span>}
                                                        Sí
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onPointerDown={dismissKeyboard}
                                                        onClick={() => {
                                                            dismissKeyboard();
                                                            setDeductFromCashRegister(false);
                                                        }}
                                                        className={`px-4 py-1.5 text-xs font-black tracking-wider uppercase rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                                                            deductFromCashRegister === false
                                                                ? 'bg-white dark:bg-gray-700 text-rose-500 dark:text-rose-400 shadow-sm'
                                                                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                                        }`}
                                                    >
                                                        {deductFromCashRegister === false && <span className="material-symbols-outlined text-xs">close</span>}
                                                        No
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                                {deductFromCashRegister === true
                                                    ? `El egreso se descontará de "${activeShift.register?.name || 'Caja física'}" (únicamente en efectivo).`
                                                    : deductFromCashRegister === false
                                                    ? 'Fondos externos: No se registrará en este turno ni afectará el arqueo de caja.'
                                                    : 'Indica si el dinero saldrá del efectivo de la caja o de fondos externos.'}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 flex items-center gap-3">
                                            <div className="size-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-center shrink-0">
                                                <span className="material-symbols-outlined text-lg">point_of_sale</span>
                                            </div>
                                            <div className="text-xs min-w-0 leading-snug">
                                                <span className="font-bold text-gray-900 dark:text-white">Sin caja abierta:</span>{' '}
                                                <span className="font-medium text-gray-500 dark:text-gray-400">
                                                    Este gasto no se registrará en ningún turno ni afectará arqueos de caja.
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Mostrar métodos de pago únicamente tras elegir Sí o No (o si no hay turno) */}
                                    {(!activeShift || deductFromCashRegister !== null) && (
                                        <>
                                            {/* Encabezado Método de pago y botón dividir */}
                                            <div className="flex items-center justify-between">
                                                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                                    {isCredit ? 'MÉTODO DE PAGO DEL ABONO' : 'MÉTODO DE PAGO'}
                                                </label>
                                                <button
                                                    type="button"
                                                    onPointerDown={dismissKeyboard}
                                                    onClick={() => {
                                                        dismissKeyboard();
                                                        setIsSupplierSplit(prev => {
                                                            const next = !prev;
                                                            if (next) {
                                                                const defaultMethod = paymentMethods.find(m => m.toLowerCase().includes('efectivo')) || paymentMethods[0] || 'Efectivo';
                                                                setSupplierSplitAmounts({ [defaultMethod]: supplierTargetAmount > 0 ? supplierTargetAmount.toLocaleString('es-ES') : '' });
                                                            } else {
                                                                setSupplierSplitAmounts({});
                                                            }
                                                            return next;
                                                        });
                                                    }}
                                                    className="text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer text-emerald-600 dark:text-emerald-400 hover:underline"
                                                >
                                                    <span className="material-symbols-outlined text-sm">
                                                        {isSupplierSplit ? 'arrow_back' : 'call_split'}
                                                    </span>
                                                    <span>{isSupplierSplit ? 'Método único' : 'Dividir pago'}</span>
                                                </button>
                                            </div>

                                            {!isSupplierSplit ? (
                                                /* Modo Método Único */
                                                <div>
                                                    <select
                                                        value={supplierPaymentMethod}
                                                        onChange={e => setSupplierPaymentMethod(e.target.value)}
                                                        className="w-full h-11 px-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold outline-none"
                                                    >
                                                        {paymentMethods.map(m => (
                                                            <option key={m} value={m.toLowerCase()}>{formatPaymentMethodLabel(m)}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ) : (
                                                /* Modo Pago Dividido */
                                                <div className="space-y-2.5 p-3 rounded-2xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-200/80 dark:border-gray-700/80 animate-fadeIn">
                                                    <span className="text-[10px] font-black uppercase text-gray-500 dark:text-gray-400 tracking-wider block">
                                                        Dividir valor entre métodos
                                                    </span>
                                                    <div className="space-y-2">
                                                        {paymentMethods.map(m => (
                                                            <div key={m} className="flex items-center gap-2.5">
                                                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-24 truncate shrink-0">
                                                                    {m}
                                                                </span>
                                                                <div className="relative flex-1">
                                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">$</span>
                                                                    <input
                                                                        type="text"
                                                                        inputMode="numeric"
                                                                        value={supplierSplitAmounts[m] || ''}
                                                                        onChange={e => handleSupplierSplitAmountChange(m, e.target.value)}
                                                                        placeholder="0"
                                                                        className="w-full h-10 pl-7 pr-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-red-500"
                                                                    />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Estado del monto dividido */}
                                                    <div className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                                                        supplierSplitRemaining === 0
                                                            ? 'border-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                                            : supplierSplitRemaining < 0
                                                            ? 'border-red-300 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                                                            : 'border-amber-300 bg-amber-50/80 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                                                    }`}>
                                                        <span>
                                                            {supplierSplitRemaining === 0 ? '✓ Monto completo' : supplierSplitRemaining < 0 ? 'Monto excedido' : 'Restante por asignar'}
                                                        </span>
                                                        <span className="font-black">
                                                            ${formatCurrency(Math.abs(supplierSplitRemaining))} COP
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Alerta de saldo insuficiente o indicador de disponibilidad de efectivo en caja */}
                                            {activeShift && deductFromCashRegister === true ? (
                                                supplierCashAmount > 0 && (
                                                    isSupplierCashInsufficient ? (
                                                        <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center gap-2.5 text-xs text-red-700 dark:text-red-300">
                                                            <span className="material-symbols-outlined text-red-600 text-lg shrink-0">error</span>
                                                            <div>
                                                                <span className="font-bold">Efectivo insuficiente en caja.</span> Disponible: ${formatCurrency(availableCash)} COP. Faltan ${formatCurrency(supplierCashAmount - availableCash)} COP.
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/40 text-[11px] font-bold text-gray-500 dark:text-gray-400 flex items-center justify-between">
                                                            <span>Efectivo disponible en caja:</span>
                                                            <span className="font-black text-emerald-600 dark:text-emerald-400">${formatCurrency(availableCash)} COP</span>
                                                        </div>
                                                    )
                                                )
                                            ) : activeShift && deductFromCashRegister === false ? (
                                                <div className="px-3 py-2.5 rounded-xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-200/60 dark:border-gray-700/60 text-[11px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-sm text-emerald-600 dark:text-emerald-400 shrink-0">info</span>
                                                    <span>Fondos externos: No se registrará en el turno actual ni afectará el arqueo de caja.</span>
                                                </div>
                                            ) : null}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="pt-4 lg:mt-auto space-y-3">
                            <div className="flex items-baseline justify-between gap-2 flex-wrap sm:flex-nowrap">
                                <span className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 shrink-0">
                                    {isCredit ? (supplierPaidAmountNum > 0 ? 'ABONO A PAGAR HOY:' : 'TOTAL CRÉDITO:') : 'TOTAL A PAGAR:'}
                                </span>
                                <div className="text-right min-w-0">
                                    <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white whitespace-nowrap">
                                        ${formatCurrency(isCredit ? (supplierPaidAmountNum > 0 ? supplierPaidAmountNum : supplierExpenseAmount) : supplierExpenseAmount)}
                                    </span>
                                    <span className="text-xs sm:text-sm font-black text-gray-500 dark:text-gray-400 ml-1">
                                        COP
                                    </span>
                                </div>
                            </div>

                            <AppButton
                                onClick={handleSave}
                                disabled={!isSupplierFormValid || isSubmitting}
                                isLoading={isSubmitting}
                                className="w-full h-14 bg-status-error hover:bg-red-600 text-white font-black rounded-2xl shadow-xl shadow-status-error/20 hover:shadow-status-error/30 transition-all text-base active:scale-[0.98]"
                            >
                                <span className="material-symbols-outlined text-2xl">check_circle</span>
                                {getSupplierButtonText()}
                            </AppButton>
                        </div>
                    </>
                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Supplier Modal */}
            {showNewSupplierForm && (
                <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center md:p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setShowNewSupplierForm(false)} onKeyDown={(e) => e.key === 'Escape' && setShowNewSupplierForm(false)} aria-label="Cerrar" />
                    <div className="relative bg-white dark:bg-surface-dark md:rounded-2xl rounded-t-3xl w-full max-w-md p-6 shadow-2xl border border-gray-200 dark:border-gray-700 animate-[slideUp_0.3s_ease-out] md:animate-none">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-xl">person_add</span>
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Nuevo Proveedor</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Solo el nombre es obligatorio</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div><label htmlFor="expense-new-supplier-name" className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">Nombre *</label><input id="expense-new-supplier-name" type="text" value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} className="w-full h-11 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="Ej: Distribuidora ABC" autoFocus /></div>
                            <div><label htmlFor="expense-new-supplier-nit" className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">NIT / Cédula</label><input id="expense-new-supplier-nit" type="text" value={newSupplierNit} onChange={e => setNewSupplierNit(e.target.value)} className="w-full h-11 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" /></div>
                            <div><label htmlFor="expense-new-supplier-phone" className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">Teléfono</label><input id="expense-new-supplier-phone" type="tel" value={newSupplierPhone} onChange={e => setNewSupplierPhone(e.target.value)} className="w-full h-11 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" /></div>
                            <div><label htmlFor="expense-new-supplier-address" className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">Dirección</label><input id="expense-new-supplier-address" type="text" value={newSupplierAddress} onChange={e => setNewSupplierAddress(e.target.value)} className="w-full h-11 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" /></div>
                        </div>
                        <div className="flex gap-3 mt-5">
                            <button onClick={() => setShowNewSupplierForm(false)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
                            <button onClick={async () => { if (!newSupplierName.trim() || isCreatingSupplier) return; setIsCreatingSupplier(true); try { await createSupplier({ name: newSupplierName, nit: newSupplierNit, phone: newSupplierPhone, address: newSupplierAddress }); setCreditorName(newSupplierName.trim()); setShowNewSupplierForm(false); } catch (err: any) { showToast(err.message || 'Error al crear proveedor', 'error'); } finally { setIsCreatingSupplier(false); } }} disabled={!newSupplierName.trim() || isCreatingSupplier} className="flex-1 py-3 bg-primary hover:bg-primary-hover text-[#102218] font-bold rounded-xl shadow-md shadow-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                {isCreatingSupplier ? (<><svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Creando...</>) : 'Crear'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Selector de categoría a pantalla completa */}
            {showCategoryPicker && (
                <CategoryPickerSheet
                    categories={categories}
                    selected={selectedCategory}
                    onSelect={(cat) => {
                        if (cat.trim().toUpperCase() === 'SUELDOS' || cat.trim().toUpperCase() === 'SUELDO') {
                            setExpenseTarget('payroll');
                            setShowCategoryPicker(false);
                            return;
                        }
                        setSelectedCategory(cat);
                    }}
                    onCreate={handleCreateCategory}
                    onClose={() => setShowCategoryPicker(false)}
                />
            )}

            {/* Observación a pantalla completa */}
            {showObservationSheet && (
                <ObservationSheet
                    initialValue={description}
                    onSave={setDescription}
                    onClose={() => setShowObservationSheet(false)}
                />
            )}
            {/* Modal para Crear Colaborador rápido */}
            <EmployeeModal
                isOpen={showNewEmployeeModal}
                onClose={() => setShowNewEmployeeModal(false)}
                onSuccess={async (newEmp) => {
                    await fetchEmployeesDirectory();
                    if (newEmp) {
                        if (expenseTarget === 'payroll') {
                            setPayrollEmployee(newEmp);
                            setShowEmployeeDropdown(false);
                            setEmployeeSearchTerm('');
                        } else {
                            setCreditorName(newEmp.full_name);
                            setSelectedEmployeeId(newEmp.id);
                            setShowCreditorList(false);
                            setCreditorSearchQuery('');
                        }
                    }
                }}
            />

            {/* Modal de Escaneo con IA directo a Gasto */}
            {showInvoiceScan && (
                <React.Suspense fallback={null}>
                    <InvoiceScanScreen
                        initialDestination="expense"
                        onClose={() => {
                            setShowInvoiceScan(false);
                            void fetchExpenses();
                        }}
                    />
                </React.Suspense>
            )}
        </div>
    );
};
