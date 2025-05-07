// src/InvoiceManagerPage.tsx (Full Code with Line Items, Print, Copy, Scroll, Refetch, Payment Details, Vouchers - Hoisting Fix)
import React, { useState, useEffect, ChangeEvent, FormEvent, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { QRCodeCanvas } from 'qrcode.react';
import './InvoiceManagerPage.css'; // Make sure this CSS file exists and is styled

// --- Configuration ---
const WORKER_API_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';
const INVOICE_ACCESS_PASSWORD = '1234';

// --- Helper: Format Date for Input ---
const formatDateForInput = (isoDateString: string): string => {
    try {
        if (isoDateString && /^\d{4}-\d{2}-\d{2}$/.test(isoDateString)) { return isoDateString; }
        const date = new Date(isoDateString);
        if (isNaN(date.getTime())) { console.warn("Invalid date string:", isoDateString); return ''; }
        return date.toISOString().split('T')[0];
    } catch (e) { console.error("Error formatting date:", isoDateString, e); return ''; }
};

// --- Data Structures ---
interface LineItem { id: string; description: string; amount: number; }
interface Invoice {
    id: string; customerName: string; dueDate: string;
    status: 'Pending' | 'Paid' | 'Overdue'; lineItems: LineItem[];
    paymentMethod?: 'cash' | 'bank' | null; paymentReference?: string | null;
}
type InvoiceBaseFormData = Omit<Invoice, 'id' | 'status' | 'lineItems' | 'paymentMethod' | 'paymentReference'>;

interface PaymentVoucher {
    id: string; voucherDate: string; payeeName: string; description: string; amount: number;
    paymentMethod?: string | null; referenceNo?: string | null; createdTimestamp?: string;
}
type PaymentVoucherFormData = Omit<PaymentVoucher, 'id' | 'createdTimestamp'>;

interface ReceiveVoucher {
    id: string; voucherDate: string; payerName: string; description: string; amountReceived: number;
    paymentMethod?: string | null; referenceNo?: string | null; relatedInvoiceId?: string | null; createdTimestamp?: string;
}
type ReceiveVoucherFormData = Omit<ReceiveVoucher, 'id' | 'createdTimestamp'>;


// --- Component ---
const InvoiceManagerPage: React.FC = () => {
    // --- State ---
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [enteredPassword, setEnteredPassword] = useState<string>('');
    const [authError, setAuthError] = useState<string | null>(null);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [paymentVouchers, setPaymentVouchers] = useState<PaymentVoucher[]>([]);
    const [receiveVouchers, setReceiveVouchers] = useState<ReceiveVoucher[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [apiError, setApiError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
    const [isStatusPopupOpen, setIsStatusPopupOpen] = useState<boolean>(false);
    const [isCreatePaymentVoucherModalOpen, setIsCreatePaymentVoucherModalOpen] = useState<boolean>(false);
    const [isCreateReceiveVoucherModalOpen, setIsCreateReceiveVoucherModalOpen] = useState<boolean>(false);
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
    const initialBaseFormData: InvoiceBaseFormData = useMemo(() => ({ customerName: '', dueDate: '' }), []); // useMemo for stability if passed to deps
    const [baseFormData, setBaseFormData] = useState<InvoiceBaseFormData>(initialBaseFormData);
    const [formLineItems, setFormLineItems] = useState<LineItem[]>([]);
    const [statusPopupInvoiceId, setStatusPopupInvoiceId] = useState<string>('');
    const [statusPopupNewStatus, setStatusPopupNewStatus] = useState<Invoice['status']>('Pending');
    const [statusPopupPaymentMethod, setStatusPopupPaymentMethod] = useState<'cash' | 'bank' | ''>('');
    const [statusPopupPaymentReference, setStatusPopupPaymentReference] = useState<string>('');
    const initialPaymentVoucherFormData: PaymentVoucherFormData = useMemo(() => ({ voucherDate: formatDateForInput(new Date().toISOString()), payeeName: '', description: '', amount: 0, paymentMethod: '', referenceNo: '' }), []);
    const [paymentVoucherFormData, setPaymentVoucherFormData] = useState<PaymentVoucherFormData>(initialPaymentVoucherFormData);
    const initialReceiveVoucherFormData: ReceiveVoucherFormData = useMemo(() => ({ voucherDate: formatDateForInput(new Date().toISOString()), payerName: '', description: '', amountReceived: 0, paymentMethod: '', referenceNo: '', relatedInvoiceId: '' }), []);
    const [receiveVoucherFormData, setReceiveVoucherFormData] = useState<ReceiveVoucherFormData>(initialReceiveVoucherFormData);

    // --- Calculate Total Amount ---
    const calculateTotal = (items: LineItem[]): number => items.reduce((sum, item) => sum + (item.amount || 0), 0);
    const formTotalAmount = useMemo(() => calculateTotal(formLineItems), [formLineItems]);

    // --- Modal Close Handler (Defined early) ---
    const closeModal = useCallback(() => {
        setIsCreateModalOpen(false); setIsEditModalOpen(false); setIsStatusPopupOpen(false);
        setIsCreatePaymentVoucherModalOpen(false); setIsCreateReceiveVoucherModalOpen(false);
        setEditingInvoice(null);
        setBaseFormData(initialBaseFormData);
        setFormLineItems([]);
        setStatusPopupInvoiceId(''); setStatusPopupNewStatus('Pending'); setStatusPopupPaymentMethod(''); setStatusPopupPaymentReference('');
        setPaymentVoucherFormData(initialPaymentVoucherFormData);
        setReceiveVoucherFormData(initialReceiveVoucherFormData);
        setApiError(null); // Clear API error when closing modal
    }, [initialBaseFormData, initialPaymentVoucherFormData, initialReceiveVoucherFormData]); // Dependencies for closeModal

    // --- Modal Open Handlers ---
    const openCreateModal = () => { setBaseFormData(initialBaseFormData); setFormLineItems([{ id: `temp-${Date.now()}`, description: '', amount: 0 }]); setIsCreateModalOpen(true); setApiError(null); setSuccessMessage(null); };
    const openEditModal = (invoiceToEdit: Invoice) => { setEditingInvoice(invoiceToEdit); setBaseFormData({ customerName: invoiceToEdit.customerName, dueDate: formatDateForInput(invoiceToEdit.dueDate) }); setFormLineItems(invoiceToEdit.lineItems.map(item => ({ ...item, id: item.id || `temp-${Math.random()}` }))); setIsEditModalOpen(true); setApiError(null); setSuccessMessage(null); };
    const openStatusPopup = () => { setStatusPopupInvoiceId(''); setStatusPopupNewStatus('Pending'); setStatusPopupPaymentMethod(''); setStatusPopupPaymentReference(''); setIsStatusPopupOpen(true); setApiError(null); setSuccessMessage(null); };
    const openCreatePaymentVoucherModal = () => { setPaymentVoucherFormData(initialPaymentVoucherFormData); setIsCreatePaymentVoucherModalOpen(true); setApiError(null); setSuccessMessage(null); };
    const openCreateReceiveVoucherModal = () => { setReceiveVoucherFormData(initialReceiveVoucherFormData); setIsCreateReceiveVoucherModalOpen(true); setApiError(null); setSuccessMessage(null); };


    // --- Fetch Data Callbacks ---
    const fetchInvoices = useCallback(async () => {
        console.log("Fetching invoices..."); setIsLoading(true); setApiError(null); let response: Response | null = null;
        try {
            response = await fetch(WORKER_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, }, body: JSON.stringify({ action: 'invoiceGet' }) });
            console.log("Fetch invoices response status:", response.status); const data = await response.json();
            if (!response.ok) { throw new Error(data?.error || `API Error: ${response.status} ${response.statusText}`); }
            if (data.success && Array.isArray(data.invoices)) { const processedInvoices = data.invoices.map((inv: any) => ({ ...inv, lineItems: typeof inv.lineItems === 'string' ? JSON.parse(inv.lineItems) : (Array.isArray(inv.lineItems) ? inv.lineItems : []) })); setInvoices(processedInvoices); console.log("Invoices loaded:", processedInvoices.length); }
            else { throw new Error(data.error || 'API response format incorrect for invoices'); }
        } catch (err: any) { console.error("Failed to fetch invoices:", err); let errorMsg = err.message; if (response && !response.ok && !errorMsg.startsWith('API Error')) { errorMsg = `API Error: ${response.status} ${response.statusText}. ${errorMsg}`; } setApiError(errorMsg || 'An unknown error occurred while fetching invoices.'); setInvoices([]); }
        finally { setIsLoading(false); }
    }, []);

    const fetchPaymentVouchers = useCallback(async () => {
        console.log("Fetching payment vouchers..."); setIsLoading(true); setApiError(null);
        try {
            const response = await fetch(WORKER_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD }, body: JSON.stringify({ action: 'voucherPaymentGet' }) });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Failed to fetch payment vouchers');
            setPaymentVouchers(data.vouchers || []); console.log("Payment vouchers loaded:", (data.vouchers || []).length);
        } catch (err: any) { console.error("Failed to fetch payment vouchers:",err); setApiError(err.message); setPaymentVouchers([]); }
        finally { setIsLoading(false); }
    }, []);

    const fetchReceiveVouchers = useCallback(async () => {
        console.log("Fetching receive vouchers..."); setIsLoading(true); setApiError(null);
        try {
            const response = await fetch(WORKER_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD }, body: JSON.stringify({ action: 'voucherReceiveGet' }) });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Failed to fetch receive vouchers');
            setReceiveVouchers(data.vouchers || []); console.log("Receive vouchers loaded:", (data.vouchers || []).length);
        } catch (err: any) { console.error("Failed to fetch receive vouchers:", err); setApiError(err.message); setReceiveVouchers([]); }
        finally { setIsLoading(false); }
    }, []);

    // --- Invoice & Voucher Action Handlers ---
    const handleCreateInvoiceSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setApiError(null); setSuccessMessage(null); setIsSubmitting(true); if (formLineItems.length === 0) { setApiError("Please add at least one line item."); setIsSubmitting(false); return; } const itemsToSend = formLineItems.map(({ id, ...rest }) => rest); console.log("Submitting new invoice:", baseFormData, itemsToSend); try { const response = await fetch(WORKER_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, }, body: JSON.stringify({ action: 'invoiceCreate', ...baseFormData, lineItems: itemsToSend }) }); const data = await response.json(); console.log("Create response:", data); if (!response.ok || !data.success) { throw new Error(data.error || `API Error: ${response.status}`); } setSuccessMessage("Invoice created successfully!"); closeModal(); } catch (err: any) { console.error("Create Invoice Err:", err); setApiError(`Create failed: ${err.message}`); } finally { setIsSubmitting(false); if (isAuthenticated) fetchInvoices(); } }, [baseFormData, formLineItems, fetchInvoices, isAuthenticated, closeModal]);
    const handleDeleteInvoice = useCallback(async (idToDelete: string) => { if (!window.confirm(`Are you sure you want to delete invoice ${idToDelete}?`)) return; setApiError(null); setSuccessMessage(null); setIsSubmitting(true); console.log("Deleting invoice:", idToDelete); try { const response = await fetch(WORKER_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, }, body: JSON.stringify({ action: 'invoiceDelete', invoiceId: idToDelete }) }); const data = await response.json(); console.log("Delete response:", data); if (!response.ok || !data.success) { throw new Error(data.error || `API Error: ${response.status}`); } setSuccessMessage("Invoice deleted successfully!"); console.log("Invoice delete API call successful."); } catch (err: any) { console.error("Failed to delete invoice:", err); setApiError(`Delete failed: ${err.message}`); } finally { setIsSubmitting(false); if (isAuthenticated) fetchInvoices(); } }, [fetchInvoices, isAuthenticated]);
    const handleEditInvoiceSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!editingInvoice) { setApiError("Cannot save, no invoice selected."); return; } setApiError(null); setSuccessMessage(null); setIsSubmitting(true); if (formLineItems.length === 0) { setApiError("Please add at least one line item."); setIsSubmitting(false); return; } const itemsToSend = formLineItems.map(({ id, ...rest }) => rest); const updatedInvoiceData = { id: editingInvoice.id, customerName: baseFormData.customerName, dueDate: baseFormData.dueDate, status: editingInvoice.status, lineItems: itemsToSend }; console.log("Submitting updated invoice:", updatedInvoiceData); try { const response = await fetch(WORKER_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, }, body: JSON.stringify({ action: 'invoiceUpdate', ...updatedInvoiceData }) }); const data = await response.json(); console.log("Update response:", data); if (!response.ok || !data.success) { throw new Error(data.error || `API Error: ${response.status}`); } setSuccessMessage("Invoice updated successfully!"); closeModal(); } catch (err: any) { console.error("Update Invoice Err:", err); setApiError(`Update failed: ${err.message}`); } finally { setIsSubmitting(false); if (isAuthenticated) fetchInvoices(); } }, [editingInvoice, baseFormData, formLineItems, fetchInvoices, isAuthenticated, closeModal]);
    const handleUpdateStatusSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!statusPopupInvoiceId) { setApiError("Please enter an Invoice ID."); return; } setApiError(null); setSuccessMessage(null); setIsSubmitting(true); let action = ''; let payload: any = { invoiceId: statusPopupInvoiceId }; try { if (statusPopupNewStatus === 'Paid') { action = 'invoiceUpdateStatus'; if (!statusPopupPaymentMethod) { throw new Error("Payment method required for Paid status."); } payload.newStatus = 'Paid'; payload.paymentMethod = statusPopupPaymentMethod; if (statusPopupPaymentMethod === 'bank') { if (!statusPopupPaymentReference.trim()) { throw new Error("Reference number required for bank transfer."); } payload.paymentReference = statusPopupPaymentReference.trim(); } else { payload.paymentReference = null; } console.log(`Marking Paid: ID='${payload.invoiceId}', Method='${payload.paymentMethod}', Ref='${payload.paymentReference}'`); } else if (statusPopupNewStatus === 'Overdue') { action = 'invoiceMarkOverdue'; console.log(`Marking Overdue: ID='${payload.invoiceId}'`); } else { action = 'invoiceUpdateStatus'; payload.newStatus = 'Pending'; payload.paymentMethod = null; payload.paymentReference = null; console.log(`Setting Pending: ID='${payload.invoiceId}'`); } const response = await fetch(WORKER_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, }, body: JSON.stringify({ action: action, ...payload }) }); const data = await response.json(); console.log(`Update status response for ${action}:`, data); if (!response.ok || !data.success) { throw new Error(data.error || `API Error: ${response.status}`); } setSuccessMessage(data.message || "Status updated!"); closeModal(); console.log(`Status update API call successful for ${statusPopupInvoiceId}`); } catch (err: any) { console.error("Update Status Err:", err); setApiError(`Status update failed: ${err.message}`); } finally { setIsSubmitting(false); if (isAuthenticated) fetchInvoices(); } }, [statusPopupInvoiceId, statusPopupNewStatus, statusPopupPaymentMethod, statusPopupPaymentReference, fetchInvoices, isAuthenticated, closeModal]);
    const handleCreatePaymentVoucherSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setApiError(null); setSuccessMessage(null); setIsSubmitting(true); try { const response = await fetch(WORKER_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD }, body: JSON.stringify({ action: 'voucherPaymentCreate', ...paymentVoucherFormData }) }); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Failed to create payment voucher'); setSuccessMessage("Payment Voucher created successfully!"); closeModal(); } catch (err: any) { console.error(err); setApiError(err.message); } finally { setIsSubmitting(false); if (isAuthenticated) fetchPaymentVouchers(); } }, [paymentVoucherFormData, fetchPaymentVouchers, isAuthenticated, closeModal]);
    const handleCreateReceiveVoucherSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setApiError(null); setSuccessMessage(null); setIsSubmitting(true); try { const response = await fetch(WORKER_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD }, body: JSON.stringify({ action: 'voucherReceiveCreate', ...receiveVoucherFormData }) }); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Failed to create receive voucher'); setSuccessMessage("Receive Voucher created successfully!"); closeModal(); } catch (err: any) { console.error(err); setApiError(err.message); } finally { setIsSubmitting(false); if (isAuthenticated) fetchReceiveVouchers(); } }, [receiveVoucherFormData, fetchReceiveVouchers, isAuthenticated, closeModal]);


    // Effect to fetch data when authentication changes
    useEffect(() => {
        if (isAuthenticated) { fetchInvoices(); fetchPaymentVouchers(); fetchReceiveVouchers(); }
        else { setInvoices([]); setPaymentVouchers([]); setReceiveVouchers([]); }
    }, [isAuthenticated, fetchInvoices, fetchPaymentVouchers, fetchReceiveVouchers]);

    // Effect to clear success message after a delay
    useEffect(() => {
        let timer: NodeJS.Timeout | null = null;
        if (successMessage) {
            timer = setTimeout(() => setSuccessMessage(null), 3500);
        }
        return () => { if (timer) clearTimeout(timer); };
    }, [successMessage]);

    // --- Password Handlers ---
    const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => { setEnteredPassword(event.target.value); setAuthError(null); };
    const handlePasswordSubmit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (enteredPassword === INVOICE_ACCESS_PASSWORD) { setIsAuthenticated(true); setAuthError(null); setEnteredPassword(''); } else { setAuthError('Incorrect password.'); setIsAuthenticated(false); } };

    // --- Form Input Handlers ---
    const handleBaseFormChange = (event: ChangeEvent<HTMLInputElement>) => { const { name, value } = event.target; setBaseFormData(prev => ({ ...prev, [name]: value })); };
    const handleLineItemChange = (index: number, field: keyof Omit<LineItem, 'id'>, value: string | number) => { setFormLineItems(prevItems => { const newItems = [...prevItems]; const processedValue = field === 'amount' ? (value === '' ? 0 : parseFloat(value as string)) : value; newItems[index] = { ...newItems[index], [field]: processedValue }; return newItems; }); };
    const addLineItem = () => { setFormLineItems(prevItems => [ ...prevItems, { id: `temp-${Date.now()}`, description: '', amount: 0 } ]); };
    const removeLineItem = (index: number) => { setFormLineItems(prevItems => prevItems.filter((_, i) => i !== index)); };
    const handlePaymentVoucherFormChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { const { name, value, type } = event.target; setPaymentVoucherFormData(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value })); };
    const handleReceiveVoucherFormChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { const { name, value, type } = event.target; setReceiveVoucherFormData(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value })); };

    // --- Copy ID Handler ---
    const handleCopyId = async (idToCopy: string) => { try { await navigator.clipboard.writeText(idToCopy); setSuccessMessage(`ID copied!`); } catch (err) { console.error('Failed to copy ID: ', err); setApiError('Could not copy ID.'); } };

    // --- Print Handlers ---
    const handlePrintInvoice = useCallback((invoice: Invoice) => {
        const printWindow = window.open('', '_blank', 'height=800,width=800');
        if (!printWindow) { alert("Could not open print window. Check popup blockers."); return; }
        const totalAmount = calculateTotal(invoice.lineItems);
        let itemRowsHtml = '';
        invoice.lineItems.forEach(item => { itemRowsHtml += `<tr><td>${item.description || '(No description)'}</td><td class="text-right">$${(item.amount || 0).toFixed(2)}</td></tr>`; });
        const printContent = `<html> <head> <title>Invoice ${invoice.id}</title> <style> body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; font-size: 12px; color: #333; } .container { max-width: 750px; margin: 20px auto; padding: 30px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0,0,0,0.05); } .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 15px; border-bottom: 1px solid #eee;} .header .logo { font-size: 1.5em; font-weight: bold; color: #555; } .header .company-details p { margin: 2px 0; font-size: 0.9em; text-align: right; color: #555; } .invoice-info { display: flex; justify-content: space-between; margin-bottom: 30px; } .invoice-info .bill-to p { margin: 2px 0; } .invoice-info .invoice-meta p { margin: 2px 0; text-align: right; } .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; } .invoice-table th, .invoice-table td { border: 1px solid #eee; padding: 8px; text-align: left; } .invoice-table th { background-color: #f8f9fa; font-weight: bold; } .invoice-table .total-row td { font-weight: bold; border-top: 2px solid #aaa; } .invoice-table .text-right { text-align: right; } .payment-info { margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; font-size: 0.9em; color: #555; } .payment-info h3 { margin-bottom: 10px; font-size: 1.1em; } .qr-code-section { display: flex; align-items: center; justify-content: space-between; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;} .qr-code-container { text-align: center; } .qr-code-container p { font-size: 0.8em; margin-top: 5px; word-break: break-all; max-width: 150px; } .notes { margin-top: 20px; font-size: 0.85em; color: #777; } @media print { body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .container { border: none; box-shadow: none; margin: 0; max-width: 100%; padding: 10px; } .no-print { display: none; } } </style> </head> <body> <div class="container"> <h1 style="text-align: center; margin-bottom: 20px; color: #333;">INVOICE</h1> <div class="header"> <div class="logo">Project Theraphy</div> <div class="company-details"> <p>01 Sanambin Road</p> <p>Nai Mueng, Phitsanulok 65000</p> <p>088-555-1946</p> <p>thammalucka67@nu.ac.th</p> </div> </div> <div class="invoice-info"> <div class="bill-to"> <strong>Bill To:</strong><br> ${invoice.customerName} </div> <div class="invoice-meta"> <p><strong>Invoice #:</strong> ${invoice.id}</p> <p><strong>Date Issued:</strong> ${new Date().toLocaleDateString()}</p> <p><strong>Due Date:</strong> ${invoice.dueDate}</p> <p><strong>Status:</strong> ${invoice.status}</p> </div> </div> <table class="invoice-table"> <thead> <tr> <th>Description</th> <th class="text-right">Amount</th> </tr> </thead> <tbody> ${itemRowsHtml} <tr class="total-row"> <td class="text-right"><strong>Total Due:</strong></td> <td class="text-right"><strong>$${totalAmount.toFixed(2)}</strong></td> </tr> </tbody> </table> <div class="payment-info"> <h3>Payment Information</h3> <p>Please make payment to the following account:</p> <p>Bank Name: Kasikorn Bank</p> <p>Account Name: ธรรมลักษณ์ อริยธรรมนิตย์</p> <p>Account Number: 153-2-86554-5</p> <p>Reference: Invoice ${invoice.id.substring(0, 8)}</p> </div> <div class="qr-code-section"> <div class="notes"> Pay before due date, If there is any question regarding the innovice please let Thammalucks know! </div> <div class="qr-code-container"> <div id="qr-code-target-invoice"></div> <p>${invoice.id}</p> </div> </div> </div> <button class="no-print" onclick="window.print()" style="position: fixed; bottom: 10px; right: 10px; padding: 10px 15px; cursor: pointer; background-color: #007bff; color: white; border: none; border-radius: 5px;">Print Invoice</button> </body> </html>`;
        printWindow.document.write(printContent);
        printWindow.document.close();
        const qrTargetInvoice = printWindow.document.getElementById('qr-code-target-invoice');
        if (qrTargetInvoice) {
            const root = createRoot(qrTargetInvoice);
            root.render(
                <React.StrictMode>
                    <QRCodeCanvas value={invoice.id} size={100} bgColor={"#ffffff"} fgColor={"#000000"} level={"L"} includeMargin={true} />
                </React.StrictMode>
            );
            setTimeout(() => { printWindow.focus(); printWindow.print(); }, 300);
        } else { console.error("Could not find QR target for invoice."); printWindow.print(); }
    }, [calculateTotal]);

    const handlePrintReceipt = useCallback((invoice: Invoice) => {
        const printWindow = window.open('', '_blank', 'height=650,width=900');
        if (!printWindow) {
            alert("Could not open print window. Check popup blockers.");
            return;
        }
        const totalAmount = calculateTotal(invoice.lineItems);
        let itemRowsHtml = '';

        // Define your desired column width percentages here
        const descriptionColWidth = "60%"; // E.g., "60%", "50%", "70%"
        const amountColWidth = "40%";     // E.g., "40%", "50%", "30%"

        // Debug background colors (set to 'transparent' or remove when done)
        const descBgColor = "lightblue"; // or 'transparent'
        const amountBgColor = "lightpink"; // or 'transparent'

        const lineItemsToPrint = invoice.lineItems.length > 0
            ? invoice.lineItems
            : [{ id: 'placeholder-item', description: '(No items)', amount: 0 }];

        lineItemsToPrint.forEach(item => {
            const descriptionText = item.description || (item.id === 'placeholder-item' ? item.description : 'N/A');
            itemRowsHtml += `<tr>
                                <td style="width: ${descriptionColWidth} !important; max-width: ${descriptionColWidth} !important; overflow: hidden !important; text-overflow: ellipsis !important; background-color: ${descBgColor} !important; word-break: break-all !important; white-space: normal !important; vertical-align: top !important; padding: 2px 3px !important;">${descriptionText}</td>
                                <td style="width: ${amountColWidth} !important; max-width: ${amountColWidth} !important; text-align: right !important; background-color: ${amountBgColor} !important; white-space: nowrap !important; vertical-align: top !important; padding: 2px 3px !important;">$${(item.amount || 0).toFixed(2)}</td>
                             </tr>`;
        });
        const formattedTotalAmount = totalAmount.toFixed(2);

        let paymentDetailsHtml = '<p>Payment Method: Not Specified</p>';
        if (invoice.paymentMethod === 'cash') {
            paymentDetailsHtml = '<p>Payment Method: Cash</p>';
        } else if (invoice.paymentMethod === 'bank') {
            paymentDetailsHtml = `<p>Payment Method: Bank Transfer</p><p>Reference: ${invoice.paymentReference || 'N/A'}</p>`;
        }

        const receiptSectionHtml = (type: 'ORIGINAL' | 'COPY', qrTargetId: string) => `
            <div class="receipt-section">
                <div class="receipt-header-title">
                    <h1 style="text-align: center; margin-bottom: 2px; color: #198754; font-size: 1.3em;">PAYMENT RECEIPT</h1>
                    <p class="receipt-copy-type">${type}</p>
                </div>
                <div class="header">
                    <div class="logo">Project Theraphy</div>
                    <div class="company-details">
                        <p>01 Sanambin Road, Nai Mueng, Phitsanulok 65000</p>
                        <p>088-555-1946 | thammalucka67@nu.ac.th</p>
                    </div>
                </div>
                <div class="receipt-info">
                    <div class="bill-to">
                        <strong>Received From:</strong><br>
                        ${invoice.customerName || 'N/A'}
                    </div>
                    <div class="receipt-meta">
                        <p><strong>Receipt #:</strong> ${invoice.id.substring(0,10)}...</p>
                        <p><strong>Payment Date:</strong> ${new Date().toLocaleDateString()}</p>
                        <p><strong>Status:</strong> <strong style="color: #198754;">${invoice.status}</strong></p>
                    </div>
                </div>

                <table class="receipt-table-final">
                    <thead>
                        <tr>
                            <th style="width: ${descriptionColWidth} !important; background-color: ${descBgColor} !important; text-align: left !important; white-space: nowrap !important; vertical-align: top !important; padding: 2px 3px !important;">Description</th>
                            <th style="width: ${amountColWidth} !important; background-color: ${amountBgColor} !important; text-align: right !important; white-space: nowrap !important; vertical-align: top !important; padding: 2px 3px !important;">Amount Paid</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemRowsHtml}
                        <tr class="total-row">
                            <td style="width: ${descriptionColWidth} !important; text-align: right !important; font-weight: bold !important; background-color: ${descBgColor} !important; vertical-align: top !important; padding: 2px 3px !important; padding-right: 5px !important;">Total Paid:</td>
                            <td style="width: ${amountColWidth} !important; text-align: right !important; font-weight: bold !important; background-color: ${amountBgColor} !important; vertical-align: top !important; padding: 2px 3px !important;">$${formattedTotalAmount}</td>
                        </tr>
                    </tbody>
                </table>
                <div class="receipt-footer">
                    <div class="payment-details-box">
                        <h3>Payment Details</h3>
                        ${paymentDetailsHtml}
                    </div>
                    <div class="qr-code-section">
                        <div class="notes">
                            Thank you for your payment!
                        </div>
                        <div class="qr-code-container">
                            <div id="${qrTargetId}"></div>
                            <p style="font-size: 0.5em; max-width: 50px; margin-top: 1px;">${invoice.id}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const printContent = `
            <html>
            <head>
                <title>Receipt ${invoice.id}</title>
                <style>
                    @page {
                        size: A4 landscape;
                        margin: 6mm;
                    }
                    body {
                        font-family: 'Arial', sans-serif; 
                        margin: 0; padding: 0; font-size: 7.5pt; /* Slightly increased base font */
                        color: #000; background-color: #fff; width: 297mm; height: 210mm;
                        box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact;
                    }
                    .receipt-page-container {
                        display: flex; flex-direction: row; justify-content: space-between;
                        align-items: stretch; width: 100%; height: 100%;
                        box-sizing: border-box; padding: 0;
                    }
                    .receipt-section {
                        width: calc(50% - 3mm); height: 100%; box-sizing: border-box;
                        padding: 4mm; border: 1px solid #000; 
                        display: flex; flex-direction: column;
                        overflow: hidden !important; 
                    }
                    .receipt-header-title { text-align: center; margin-bottom: 5px; flex-shrink: 0; font-size: 1.2em;}
                    .receipt-copy-type { font-size: 0.7em; color: #555; margin-top: -5px;}
                    .header { display: flex; justify-content: space-between; margin-bottom: 5px; padding-bottom: 3px; border-bottom: 1px solid #ccc; flex-shrink: 0; font-size: 0.85em;} /* Increased font */
                    .header .logo { font-weight: bold; }
                    .header .company-details p { margin: 0; font-size: 0.85em;} /* Increased font */
                    .receipt-info { display: flex; justify-content: space-between; margin-bottom: 5px; flex-shrink: 0; font-size: 0.85em;} /* Increased font */
                    .receipt-footer { flex-shrink: 0; margin-top: auto; font-size: 0.85em; } /* Increased font */
                    .payment-details-box { padding: 3px; border: 1px dashed #ccc; margin-bottom: 3px;}
                    .payment-details-box h3 { margin:0 0 2px 0; font-size: 0.9em;}
                    .qr-code-section { display: flex; align-items: flex-end; justify-content: space-between; padding-top: 3px; border-top: 1px solid #ccc;}
                    .notes { max-width: 50%;}
                    .qr-code-container p { font-size: 0.7em;}

                    .receipt-table-final { /* Renamed class */
                        width: 100% !important;
                        table-layout: fixed !important;
                        border-collapse: collapse !important;
                        border-spacing: 0 !important;
                        flex-grow: 1; 
                        min-height: 0; 
                        overflow: hidden !important; 
                        /* border: 1px solid transparent !important; /* Remove red border */
                    }

                    .receipt-table-final th,
                    .receipt-table-final td {
                        border: 1px solid #ccc !important; /* Keep a light border */
                        /* Padding, vertical-align, overflow, word-break etc. are now handled by INLINE styles for this test's purpose */
                        /* font-size: 0.95em; /* Increased table font slightly relative to body */
                    }
                     .receipt-table-final .total-row td {
                        border-top: 1px solid #555 !important; /* Make total row border more visible */
                    }


                    @media print {
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="receipt-page-container">
                    ${receiptSectionHtml('ORIGINAL', 'qr-code-target-original')}
                    ${receiptSectionHtml('COPY', 'qr-code-target-copy')}
                </div>
                <button class="no-print" onclick="window.print()" style="position: fixed; bottom: 10px; right: 10px; padding: 10px 15px;">Print</button>
            </body>
            </html>
        `;
        printWindow.document.write(printContent);
        printWindow.document.close();

        const renderQRCode = (targetId: string, invoiceId: string) => {
            const qrTarget = printWindow.document.getElementById(targetId);
            if (qrTarget) {
                const root = createRoot(qrTarget);
                root.render(
                    <React.StrictMode>
                        <QRCodeCanvas value={invoiceId} size={40} bgColor={"#ffffff"} fgColor={"#000000"} level={"L"} includeMargin={false} />
                    </React.StrictMode>
                );
            } else { console.error(`Could not find QR code target element: ${targetId}`); }
        };

        renderQRCode('qr-code-target-original', invoice.id);
        renderQRCode('qr-code-target-copy', invoice.id);

        setTimeout(() => {
            printWindow.focus();
            printWindow.print(); // Re-enable print for testing the look
        }, 800);
    }, [calculateTotal]);

    const handlePrintPaymentVoucher = useCallback((voucher: PaymentVoucher) => {
        const printWindow = window.open('', '_blank', 'height=800,width=800'); // Window size, not print size
        if (!printWindow) { alert("Could not open print window."); return; }
        const printContent = `
            <html>
            <head>
                <title>Payment Voucher ${voucher.id}</title>
                <style>
                    @page {
                        size: A4 portrait;
                        margin: 10mm; /* Standard A4 margins, adjust as needed */
                    }
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        margin: 0; /* Body margin should be 0, @page handles print margins */
                        padding: 0;
                        font-size: 10pt; /* Base font size for voucher */
                        color: #333;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .voucher-container {
                        /* A4 width is 210mm. With 10mm margins each side, usable is 190mm.
                           Let's make the container slightly less to be safe, or ensure content within fits 190mm.
                           If content is still cut off, reduce this further (e.g., to 185mm or 180mm)
                           AND ensure @page margins allow for it.
                        */
                        width: 100%; /* Let it fill the @page area minus margins */
                        max-width: 190mm; /* Theoretical max based on 10mm margins */
                        min-height: 120mm; /* Keep a min height if desired */
                        margin: 0 auto; /* Center on screen, print margins handled by @page */
                        padding: 0; /* Padding was 8mm, now relying more on @page margins and internal spacing */
                        /* border: 1px solid #ccc; /* Optional for screen debugging, remove for cleaner print if not desired */
                        /* box-shadow: 0 0 5px rgba(0,0,0,0.1); /* Screen only */
                        position: relative;
                        box-sizing: border-box;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 15px; /* Reduced margin */
                    }
                    .header .logo {
                        font-size: 1.4em; /* Slightly reduced */
                        font-weight: bold;
                        color: #333;
                        margin-bottom: 4px;
                    }
                    .header .company-details p {
                        margin: 1px 0;
                        font-size: 0.75em; /* Slightly reduced */
                        color: #555;
                    }
                    .voucher-title {
                        font-size: 1.6em; /* Slightly reduced */
                        font-weight: bold;
                        text-align: center;
                        margin-bottom: 20px;
                        padding-bottom: 4px;
                        border-bottom: 2px solid #333;
                    }
                    .voucher-meta {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 15px; /* Reduced margin */
                        font-size: 0.85em; /* Slightly reduced */
                        padding: 0 5mm; /* Add some padding if container padding was removed */
                    }
                     .voucher-meta div { /* Ensure these don't cause overflow */
                        white-space: nowrap; /* Prevent wrapping that might make it taller if too narrow */
                    }
                    .details {
                        padding: 0 5mm; /* Add some padding if container padding was removed */
                    }
                    .details table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 15px; /* Reduced margin */
                    }
                    .details th, .details td {
                        padding: 7px 0; /* Reduced padding */
                        text-align: left;
                        vertical-align: top;
                        font-size: 0.9em; /* Slightly reduced */
                    }
                    .details th {
                        width: 130px; /* Slightly reduced */
                        font-weight: 600;
                        color: #555;
                        padding-right: 5px; /* Add some space */
                    }
                    .details td {
                        border-bottom: 1px dotted #ccc;
                    }
                    .details tr:last-child td {
                        border-bottom: none;
                    }
                    .amount-section {
                        margin-top: 20px; /* Reduced margin */
                        padding-top: 10px; /* Reduced padding */
                        border-top: 1px solid #eee;
                        padding: 0 5mm; /* Add some padding */
                    }
                    .amount-section .total-amount {
                        font-size: 1.1em; /* Slightly reduced */
                        font-weight: bold;
                        text-align: right;
                    }
                    .signatures {
                        display: flex;
                        justify-content: space-between; /* This might need to be space-around or widths adjusted */
                        margin-top: 40px; /* Reduced margin */
                        padding-top: 15px;
                        border-top: 1px solid #eee;
                        font-size: 0.85em; /* Slightly reduced */
                        padding: 0 5mm; /* Add some padding */
                    }
                    .signatures div {
                        width: 30%; /* Ensure this doesn't cause overflow with padding/margins */
                        text-align: center;
                        min-width: 0; /* for flex shrinking */
                    }
                    .signatures div p {
                        margin-top: 30px; /* Reduced */
                        border-top: 1px solid #888;
                        padding-top: 4px;
                    }
                    .qr-code-print {
                        text-align: right;
                        margin-top: 15px; /* Reduced */
                        padding-right: 5mm; /* Align with other padded content */
                    }
                    .qr-code-print div { /* The div containing QRCodeCanvas */
                        display: inline-block; /* To allow text-align:right to work on its parent */
                    }
                    .qr-code-print p {
                        font-size: 0.65em; /* Reduced */
                        margin-top: 1px;
                        color: #777;
                    }
                    @media print {
                        /* .voucher-container border and shadow are implicitly removed as they are not here */
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="voucher-container">
                    <div class="header">
                        <div class="logo">Project Theraphy</div>
                        <div class="company-details">
                            <p>01 Sanambin Road, Nai Mueng, Phitsanulok 65000</p>
                            <p>Tel: 088-555-1946 | Email: thammalucka67@nu.ac.th</p>
                        </div>
                    </div>
                    <div class="voucher-title">ใบสำคัญจ่าย (Payment Voucher)</div>
                    <div class="voucher-meta">
                        <div><strong>Voucher No.:</strong> ${voucher.id}</div>
                        <div><strong>Date:</strong> ${voucher.voucherDate}</div>
                    </div>
                    <div class="details">
                        <table>
                            <tr><th>Pay To (จ่ายให้):</th><td>${voucher.payeeName}</td></tr>
                            <tr><th>Description (รายการ):</th><td>${voucher.description}</td></tr>
                            <tr><th>Payment Method:</th><td>${voucher.paymentMethod || 'N/A'}</td></tr>
                            ${voucher.referenceNo ? `<tr><th>Reference:</th><td>${voucher.referenceNo}</td></tr>` : ''}
                        </table>
                    </div>
                    <div class="amount-section">
                        <p class="total-amount">Amount (จำนวนเงิน): $${voucher.amount.toFixed(2)}</p>
                    </div>
                    <div class="signatures">
                        <div><p>Approved By (ผู้อนุมัติ)</p></div>
                        <div><p>Paid By (ผู้จ่ายเงิน)</p></div>
                        <div><p>Received By (ผู้รับเงิน)</p></div>
                    </div>
                    <div class="qr-code-print">
                        <div id="qr-pv-${voucher.id}"></div>
                        <p>${voucher.id}</p>
                    </div>
                </div>
                <button class="no-print" onclick="window.print()" style="position:fixed; bottom:10px; right:10px; padding:8px 15px;">Print</button>
            </body>
            </html>`;
        printWindow.document.write(printContent);
        printWindow.document.close();
        const qrTarget = printWindow.document.getElementById(`qr-pv-${voucher.id}`);
        if (qrTarget) {
            const root = createRoot(qrTarget);
            // QR code size might also need adjustment if it's part of the overflow
            root.render(<QRCodeCanvas value={voucher.id} size={70} level="M" />); // Slightly smaller QR
        }
        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
        }, 300);
    }, []);

    const handlePrintReceiveVoucher = useCallback((voucher: ReceiveVoucher) => {
        const printWindow = window.open('', '_blank', 'height=800,width=800');
        if (!printWindow) { alert("Could not open print window."); return; }
        const printContent = `<html><head><title>Receive Voucher ${voucher.id}</title><style> body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; font-size: 11pt; color: #333; } .voucher-container { width: 190mm; min-height: 120mm; margin: 10mm auto; padding: 8mm; border: 1px solid #ccc; box-shadow: 0 0 5px rgba(0,0,0,0.1); position: relative; } .header { text-align: center; margin-bottom: 20px; } .header .logo { font-size: 1.5em; font-weight: bold; color: #333; margin-bottom: 5px; } .header .company-details p { margin: 2px 0; font-size: 0.8em; color: #555; } .voucher-title { font-size: 1.8em; font-weight: bold; text-align: center; margin-bottom: 25px; padding-bottom: 5px; border-bottom: 2px solid #333; color: #28a745; } .voucher-meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 0.9em; } .details table { width: 100%; border-collapse: collapse; margin-bottom: 20px; } .details th, .details td { padding: 8px 0; text-align: left; vertical-align: top; } .details th { width: 150px; font-weight: 600; color: #555; } .details td { border-bottom: 1px dotted #ccc; } .details tr:last-child td { border-bottom: none; } .amount-section { margin-top: 25px; padding-top: 15px; border-top: 1px solid #eee; } .amount-section .total-amount { font-size: 1.2em; font-weight: bold; text-align: right; } .signatures { display: flex; justify-content: space-around; margin-top: 50px; padding-top: 20px; border-top: 1px solid #eee; font-size: 0.9em; } .signatures div { width: 40%; text-align: center; } .signatures div p { margin-top: 40px; border-top: 1px solid #888; padding-top: 5px; } .qr-code-print { text-align: right; margin-top: 10px; } .qr-code-print p {font-size: 0.7em; margin-top: 2px; color: #777;} @media print { body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .voucher-container { border: none; box-shadow: none; margin: 0 auto; width: 100%; height: 100%; } .no-print { display: none; } } </style></head><body><div class="voucher-container"> <div class="header"> <div class="logo">Project Theraphy</div> <div class="company-details"><p>01 Sanambin Road, Nai Mueng, Phitsanulok 65000</p><p>Tel: 088-555-1946 | Email: thammalucka67@nu.ac.th</p></div> </div> <div class="voucher-title">ใบสำคัญรับ (Receive Voucher)</div> <div class="voucher-meta"> <div><strong>Voucher No.:</strong> ${voucher.id}</div> <div><strong>Date:</strong> ${voucher.voucherDate}</div> </div> <div class="details"> <table> <tr><th>Received From (รับจาก):</th><td>${voucher.payerName}</td></tr> <tr><th>Description (รายการ):</th><td>${voucher.description}</td></tr> <tr><th>Payment Method:</th><td>${voucher.paymentMethod || 'N/A'}</td></tr> ${voucher.referenceNo ? `<tr><th>Reference:</th><td>${voucher.referenceNo}</td></tr>` : ''} ${voucher.relatedInvoiceId ? `<tr><th>For Invoice #:</th><td>${voucher.relatedInvoiceId}</td></tr>` : ''} </table> </div> <div class="amount-section"> <p class="total-amount">Amount Received (จำนวนเงิน): $${voucher.amountReceived.toFixed(2)}</p> </div> <div class="signatures"> <div><p>Approved By (ผู้อนุมัติ)</p></div> <div><p>Received By (ผู้รับเงิน)</p></div> </div> <div class="qr-code-print"><div id="qr-rv-${voucher.id}"></div><p>${voucher.id}</p></div> </div><button class="no-print" onclick="window.print()" style="position:fixed; bottom:10px; right:10px; padding:8px 15px;">Print</button></body></html>`;
        printWindow.document.write(printContent); printWindow.document.close();
        const qrTarget = printWindow.document.getElementById(`qr-rv-${voucher.id}`);
        if (qrTarget) { const root = createRoot(qrTarget); root.render(<QRCodeCanvas value={voucher.id} size={80} level="M" />); }
        setTimeout(() => { printWindow.focus(); printWindow.print(); }, 300);
    }, []);

    // --- Render Password Prompt ---
    if (!isAuthenticated) { return ( <div className="invoice-manager-password-container"> <div className="invoice-manager-password-box"> <h2>Invoice Manager Access</h2> <form onSubmit={handlePasswordSubmit}> <div className="form-group"> <label htmlFor="invoice-manager-password">Password:</label> <input type="password" id="invoice-manager-password" value={enteredPassword} onChange={handlePasswordChange} required autoFocus /> </div> {authError && <p className="password-error">{authError}</p>} <button type="submit" className="submit-password-button"> Enter </button> </form> <p className="password-note">Restricted Area.</p> </div> </div> ); }

    // --- Render Invoice Manager UI ---
    return (
        <div className="invoice-manager-container">
            <div className="invoice-manager-header"> <h1>Invoice Management</h1> <button onClick={() => setIsAuthenticated(false)} className="logout-button" disabled={isSubmitting}> Logout </button> </div>
            <div className="invoice-actions"> <button onClick={openCreateModal} className="action-button create-button" disabled={isSubmitting}> + Create New Invoice </button> <button onClick={openStatusPopup} className="action-button status-button" disabled={isSubmitting}> Edit Invoice Status by ID </button> <button onClick={openCreatePaymentVoucherModal} className="action-button payment-voucher-button" disabled={isSubmitting}> + Create Payment Voucher </button> <button onClick={openCreateReceiveVoucherModal} className="action-button receive-voucher-button" disabled={isSubmitting}> + Create Receive Voucher </button> </div>
                <div className="status-messages"> {isLoading && <p className="loading-message">Loading data...</p>} {apiError && !isLoading && !successMessage && <p className="api-error-message"> Error: {apiError} </p> } {successMessage && <p className="api-success-message"> {successMessage} </p> } </div>

            {/* Invoice List Table */}
            {!isLoading && ( <div className="invoice-list"> <h2>Invoices</h2> {invoices.length === 0 && !apiError ? ( <p>No invoices found. Create one!</p> ) : invoices.length > 0 ? ( <table> <thead> <tr> <th>ID</th> <th>Customer</th> <th>Total Amount</th> <th>Due Date</th> <th>Status</th> <th>Actions</th> </tr> </thead> <tbody> {invoices.map(invoice => { const rowTotal = calculateTotal(invoice.lineItems); const isPaid = invoice.status === 'Paid'; return ( <tr key={invoice.id}> <td style={{ maxWidth: '150px' }}> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 }} title={invoice.id}> {invoice.id} </span> <button onClick={() => handleCopyId(invoice.id)} className="copy-id-button" title="Copy ID" disabled={isSubmitting}> 📋 </button> </td> <td>{invoice.customerName}</td> <td>${rowTotal.toFixed(2)}</td> <td>{invoice.dueDate}</td> <td> <span className={`status-badge status-${invoice.status.toLowerCase()}`}> {invoice.status} </span> </td> <td> <button onClick={() => openEditModal(invoice)} className="table-button edit" disabled={isSubmitting}>Edit</button> <button onClick={() => handleDeleteInvoice(invoice.id)} className="table-button delete" disabled={isSubmitting}>Delete</button> <button onClick={() => handlePrintInvoice(invoice)} className="table-button print-invoice" disabled={isSubmitting}>Invoice</button> <button onClick={() => handlePrintReceipt(invoice)} className="table-button print-receipt" disabled={isSubmitting || !isPaid} title={isPaid ? "Print Receipt" : "Mark as Paid to print receipt"}>Receipt</button> </td> </tr> ); })} </tbody> </table> ) : null } </div> )}

            {/* Payment Vouchers List */}
            {!isLoading && ( <div className="voucher-list payment-voucher-list"> <h2>Payment Vouchers (ใบสำคัญจ่าย)</h2> {paymentVouchers.length === 0 && !apiError ? (<p>No payment vouchers found.</p>) : paymentVouchers.length > 0 ? ( <table> <thead><tr><th>ID</th><th>Date</th><th>Payee</th><th>Description</th><th>Amount</th><th>Actions</th></tr></thead> <tbody> {paymentVouchers.map(pv => ( <tr key={pv.id}> <td title={pv.id} style={{ maxWidth: '120px' }}>{pv.id.substring(0,8)}... <button onClick={() => handleCopyId(pv.id)} className="copy-id-button" title="Copy ID" disabled={isSubmitting}>📋</button></td> <td>{pv.voucherDate}</td><td>{pv.payeeName}</td><td>{pv.description}</td> <td>${pv.amount.toFixed(2)}</td> <td><button onClick={() => handlePrintPaymentVoucher(pv)} className="table-button print-receipt" disabled={isSubmitting}>Print</button></td> </tr> ))} </tbody> </table> ) : null} </div> )}

            {/* Receive Vouchers List */}
            {!isLoading && ( <div className="voucher-list receive-voucher-list"> <h2>Receive Vouchers (ใบสำคัญรับ)</h2> {receiveVouchers.length === 0 && !apiError ? (<p>No receive vouchers found.</p>) : receiveVouchers.length > 0 ? ( <table> <thead><tr><th>ID</th><th>Date</th><th>Payer</th><th>Description</th><th>Amount</th><th>Invoice ID</th><th>Actions</th></tr></thead> <tbody> {receiveVouchers.map(rv => ( <tr key={rv.id}> <td title={rv.id} style={{ maxWidth: '120px' }}>{rv.id.substring(0,8)}... <button onClick={() => handleCopyId(rv.id)} className="copy-id-button" title="Copy ID" disabled={isSubmitting}>📋</button></td> <td>{rv.voucherDate}</td><td>{rv.payerName}</td><td>{rv.description}</td> <td>${rv.amountReceived.toFixed(2)}</td> <td style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} title={rv.relatedInvoiceId || ''}>{rv.relatedInvoiceId || 'N/A'}</td> <td><button onClick={() => handlePrintReceiveVoucher(rv)} className="table-button print-receipt" disabled={isSubmitting}>Print</button></td> </tr> ))} </tbody> </table> ) : null} </div> )}


            {/* --- Modals --- */}
            {(isCreateModalOpen || isEditModalOpen) && ( <div className="modal-overlay" onClick={closeModal}> <div className="modal-content wide-modal" onClick={(e) => e.stopPropagation()}> <h2>{isEditModalOpen ? `Edit Invoice (ID: ${editingInvoice?.id.substring(0,8)}...)` : 'Create New Invoice'}</h2> {apiError && <p className="api-error-message">{apiError}</p>} <form onSubmit={isEditModalOpen ? handleEditInvoiceSubmit : handleCreateInvoiceSubmit}> <div className="form-scroll-area"> <div className="form-section"> <div className="form-group"> <label htmlFor="customerName">Customer Name:</label> <input type="text" id="customerName" name="customerName" value={baseFormData.customerName} onChange={handleBaseFormChange} required disabled={isSubmitting} /> </div> <div className="form-group"> <label htmlFor="dueDate">Due Date:</label> <input type="date" id="dueDate" name="dueDate" value={baseFormData.dueDate} onChange={handleBaseFormChange} required disabled={isSubmitting} /> </div> </div> <div className="form-section line-items-section"> <h3>Line Items</h3> <div className="line-item-row line-item-header"> <label className="line-item-description-label">Description</label> <label className="line-item-amount-label">Amount ($)</label> <div className="line-item-action-label">Action</div> </div> <div className="line-items-container"> {formLineItems.map((item, index) => ( <div key={item.id} className="line-item-row"> <input type="text" placeholder="Description" value={item.description} onChange={(e) => handleLineItemChange(index, 'description', e.target.value)} required className="line-item-description" disabled={isSubmitting} /> <input type="number" placeholder="Amount" value={item.amount} onChange={(e) => handleLineItemChange(index, 'amount', e.target.value)} required min="0" step="0.01" className="line-item-amount" disabled={isSubmitting} /> <div className="line-item-action"> {formLineItems.length > 1 && ( <button type="button" onClick={() => removeLineItem(index)} className="remove-line-item-btn" disabled={isSubmitting} title="Remove Item"> 🗑️ </button> )} </div> </div> ))} </div> <button type="button" onClick={addLineItem} className="add-line-item-btn" disabled={isSubmitting}> + Add Line Item </button> <div className="form-total"> <strong>Total: ${formTotalAmount.toFixed(2)}</strong> </div> </div> </div> <div className="modal-actions"> <button type="submit" className={`action-button ${isEditModalOpen ? 'edit-button' : 'create-button'}`} disabled={isSubmitting}> {isSubmitting ? 'Saving...' : (isEditModalOpen ? 'Save Changes' : 'Create Invoice')} </button> <button type="button" onClick={closeModal} className="cancel-button" disabled={isSubmitting}>Cancel</button> </div> </form> </div> </div> )}
            {isStatusPopupOpen && ( <div className="modal-overlay" onClick={closeModal}> <div className="modal-content status-popup" onClick={(e) => e.stopPropagation()}> <h2>Edit Invoice Status</h2> {apiError && <p className="api-error-message">{apiError}</p>} <form onSubmit={handleUpdateStatusSubmit}> <div className="form-group"> <label htmlFor="status-invoice-id">Invoice ID:</label> <input type="text" id="status-invoice-id" value={statusPopupInvoiceId} onChange={(e) => setStatusPopupInvoiceId(e.target.value)} placeholder="Enter full ID to edit" required disabled={isSubmitting}/> </div> <div className="form-group"> <label htmlFor="status-new-status">New Status:</label> <select id="status-new-status" value={statusPopupNewStatus} onChange={(e) => { setStatusPopupNewStatus(e.target.value as Invoice['status']); setStatusPopupPaymentMethod(''); setStatusPopupPaymentReference(''); }} required disabled={isSubmitting}> <option value="Pending">Pending</option> <option value="Paid">Paid</option> <option value="Overdue">Overdue</option> </select> </div> {statusPopupNewStatus === 'Paid' && ( <div className="payment-details-section"> <div className="form-group"> <label htmlFor="status-payment-method">Payment Method:</label> <select id="status-payment-method" value={statusPopupPaymentMethod} onChange={(e) => setStatusPopupPaymentMethod(e.target.value as 'cash' | 'bank' | '')} required disabled={isSubmitting} > <option value="" disabled>-- Select Method --</option> <option value="cash">Cash</option> <option value="bank">Bank Transfer</option> </select> </div> {statusPopupPaymentMethod === 'bank' && ( <div className="form-group"> <label htmlFor="status-payment-ref">Reference No:</label> <input type="text" id="status-payment-ref" value={statusPopupPaymentReference} onChange={(e) => setStatusPopupPaymentReference(e.target.value)} placeholder="Enter bank reference" required disabled={isSubmitting} /> </div> )} </div> )} {statusPopupNewStatus === 'Overdue' && ( <p className="overdue-notice">Note: Marking as Overdue will likely involve backend logic for fees.</p> )} <div className="popup-actions"> <button type="submit" className="action-button status-button" disabled={isSubmitting}> {isSubmitting ? 'Updating...' : 'Update Status'} </button> <button type="button" onClick={closeModal} className="cancel-button" disabled={isSubmitting}>Cancel</button> </div> </form> </div> </div> )}
            {isCreatePaymentVoucherModalOpen && ( <div className="modal-overlay" onClick={closeModal}> <div className="modal-content wide-modal" onClick={(e) => e.stopPropagation()}> <h2>Create Payment Voucher (ใบสำคัญจ่าย)</h2> {apiError && <p className="api-error-message">{apiError}</p>} <form onSubmit={handleCreatePaymentVoucherSubmit}> <div className="form-scroll-area"> <div className="form-group"> <label htmlFor="pv_voucherDate">Date:</label> <input type="date" id="pv_voucherDate" name="voucherDate" value={paymentVoucherFormData.voucherDate} onChange={handlePaymentVoucherFormChange} required disabled={isSubmitting} /> </div> <div className="form-group"> <label htmlFor="pv_payeeName">Payee Name:</label> <input type="text" id="pv_payeeName" name="payeeName" value={paymentVoucherFormData.payeeName} onChange={handlePaymentVoucherFormChange} required disabled={isSubmitting} /> </div> <div className="form-group"> <label htmlFor="pv_description">Description:</label> <textarea id="pv_description" name="description" value={paymentVoucherFormData.description} onChange={handlePaymentVoucherFormChange} required disabled={isSubmitting} rows={3}></textarea> </div> <div className="form-group"> <label htmlFor="pv_amount">Amount ($):</label> <input type="number" id="pv_amount" name="amount" value={paymentVoucherFormData.amount} onChange={handlePaymentVoucherFormChange} required min="0.01" step="0.01" disabled={isSubmitting} /> </div> <div className="form-group"> <label htmlFor="pv_paymentMethod">Payment Method:</label> <input type="text" id="pv_paymentMethod" name="paymentMethod" value={paymentVoucherFormData.paymentMethod || ''} onChange={handlePaymentVoucherFormChange} placeholder="e.g., Cash, Bank Transfer" disabled={isSubmitting} /> </div> <div className="form-group"> <label htmlFor="pv_referenceNo">Reference No. (Optional):</label> <input type="text" id="pv_referenceNo" name="referenceNo" value={paymentVoucherFormData.referenceNo || ''} onChange={handlePaymentVoucherFormChange} disabled={isSubmitting} /> </div> </div> <div className="modal-actions"> <button type="submit" className="action-button create-button" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Create Payment Voucher'}</button> <button type="button" onClick={closeModal} className="cancel-button" disabled={isSubmitting}>Cancel</button> </div> </form> </div> </div> )}
            {isCreateReceiveVoucherModalOpen && ( <div className="modal-overlay" onClick={closeModal}> <div className="modal-content wide-modal" onClick={(e) => e.stopPropagation()}> <h2>Create Receive Voucher (ใบสำคัญรับ)</h2> {apiError && <p className="api-error-message">{apiError}</p>} <form onSubmit={handleCreateReceiveVoucherSubmit}> <div className="form-scroll-area"> <div className="form-group"> <label htmlFor="rv_voucherDate">Date:</label> <input type="date" id="rv_voucherDate" name="voucherDate" value={receiveVoucherFormData.voucherDate} onChange={handleReceiveVoucherFormChange} required disabled={isSubmitting} /> </div> <div className="form-group"> <label htmlFor="rv_payerName">Payer Name:</label> <input type="text" id="rv_payerName" name="payerName" value={receiveVoucherFormData.payerName} onChange={handleReceiveVoucherFormChange} required disabled={isSubmitting} /> </div> <div className="form-group"> <label htmlFor="rv_description">Description:</label> <textarea id="rv_description" name="description" value={receiveVoucherFormData.description} onChange={handleReceiveVoucherFormChange} required disabled={isSubmitting} rows={3}></textarea> </div> <div className="form-group"> <label htmlFor="rv_amountReceived">Amount Received ($):</label> <input type="number" id="rv_amountReceived" name="amountReceived" value={receiveVoucherFormData.amountReceived} onChange={handleReceiveVoucherFormChange} required min="0.01" step="0.01" disabled={isSubmitting} /> </div> <div className="form-group"> <label htmlFor="rv_paymentMethod">Payment Method:</label> <input type="text" id="rv_paymentMethod" name="paymentMethod" value={receiveVoucherFormData.paymentMethod || ''} onChange={handleReceiveVoucherFormChange} placeholder="e.g., Cash, Bank Transfer" disabled={isSubmitting} /> </div> <div className="form-group"> <label htmlFor="rv_referenceNo">Reference No. (Optional):</label> <input type="text" id="rv_referenceNo" name="referenceNo" value={receiveVoucherFormData.referenceNo || ''} onChange={handleReceiveVoucherFormChange} disabled={isSubmitting} /> </div> <div className="form-group"> <label htmlFor="rv_relatedInvoiceId">Related Invoice ID (Optional):</label> <input type="text" id="rv_relatedInvoiceId" name="relatedInvoiceId" value={receiveVoucherFormData.relatedInvoiceId || ''} onChange={handleReceiveVoucherFormChange} disabled={isSubmitting} /> </div> </div> <div className="modal-actions"> <button type="submit" className="action-button create-button" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Create Receive Voucher'}</button> <button type="button" onClick={closeModal} className="cancel-button" disabled={isSubmitting}>Cancel</button> </div> </form> </div> </div> )}

        </div> // End invoice-manager-container
    );
};

export default InvoiceManagerPage;