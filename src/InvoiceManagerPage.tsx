// src/InvoiceManagerPage.tsx (Print Receipt for Paid Invoices)
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
    id: string;
    customerName: string;
    dueDate: string;
    status: 'Pending' | 'Paid' | 'Overdue';
    lineItems: LineItem[];
    paymentMethod?: 'cash' | 'bank' | null; // Optional
    paymentReference?: string | null;      // Optional
}
type InvoiceBaseFormData = Omit<Invoice, 'id' | 'status' | 'lineItems' | 'paymentMethod' | 'paymentReference'>;


// --- Component ---
const InvoiceManagerPage: React.FC = () => {
    // --- State ---
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [enteredPassword, setEnteredPassword] = useState<string>('');
    const [authError, setAuthError] = useState<string | null>(null);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [apiError, setApiError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
    const [isStatusPopupOpen, setIsStatusPopupOpen] = useState<boolean>(false);
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
    const initialBaseFormData: InvoiceBaseFormData = { customerName: '', dueDate: '' };
    const [baseFormData, setBaseFormData] = useState<InvoiceBaseFormData>(initialBaseFormData);
    const [formLineItems, setFormLineItems] = useState<LineItem[]>([]);
    const [statusPopupInvoiceId, setStatusPopupInvoiceId] = useState<string>('');
    const [statusPopupNewStatus, setStatusPopupNewStatus] = useState<Invoice['status']>('Pending');
    const [statusPopupPaymentMethod, setStatusPopupPaymentMethod] = useState<'cash' | 'bank' | ''>('');
    const [statusPopupPaymentReference, setStatusPopupPaymentReference] = useState<string>('');

    // --- Calculate Total Amount ---
    const calculateTotal = (items: LineItem[]): number => items.reduce((sum, item) => sum + (item.amount || 0), 0);
    const formTotalAmount = useMemo(() => calculateTotal(formLineItems), [formLineItems]);

    // --- Fetch Invoices (Stable with useCallback) ---
    const fetchInvoices = useCallback(async () => {
        console.log("Fetching invoices..."); setIsLoading(true); setApiError(null); let response: Response | null = null;
        try {
            response = await fetch(WORKER_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, }, body: JSON.stringify({ action: 'invoiceGet' }) });
            console.log("Fetch response status:", response.status); const data = await response.json();
            if (!response.ok) { throw new Error(data?.error || `API Error: ${response.status} ${response.statusText}`); }
            if (data.success && Array.isArray(data.invoices)) {
                const processedInvoices = data.invoices.map((inv: any) => ({ ...inv, lineItems: typeof inv.lineItems === 'string' ? JSON.parse(inv.lineItems) : (Array.isArray(inv.lineItems) ? inv.lineItems : []) }));
                setInvoices(processedInvoices); console.log("Invoices loaded:", processedInvoices.length);
            } else { throw new Error(data.error || 'API response format incorrect'); }
        } catch (err: any) {
            console.error("Failed to fetch invoices:", err); let errorMsg = err.message;
            if (response && !response.ok && !errorMsg.startsWith('API Error')) { errorMsg = `API Error: ${response.status} ${response.statusText}. ${errorMsg}`; }
            setApiError(errorMsg || 'An unknown error occurred while fetching invoices.'); setInvoices([]);
        } finally { setIsLoading(false); }
    }, []);

    useEffect(() => { if (isAuthenticated) { fetchInvoices(); } else { setInvoices([]); } }, [isAuthenticated, fetchInvoices]);
    useEffect(() => { let timer: NodeJS.Timeout | null = null; if (successMessage) { timer = setTimeout(() => setSuccessMessage(null), 3500); } return () => { if (timer) clearTimeout(timer); }; }, [successMessage]);

    // --- Password Handlers ---
    const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => { setEnteredPassword(event.target.value); setAuthError(null); };
    const handlePasswordSubmit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (enteredPassword === INVOICE_ACCESS_PASSWORD) { setIsAuthenticated(true); setAuthError(null); setEnteredPassword(''); } else { setAuthError('Incorrect password.'); setIsAuthenticated(false); } };

    // --- Form Input Handlers ---
     const handleBaseFormChange = (event: ChangeEvent<HTMLInputElement>) => { const { name, value } = event.target; setBaseFormData(prev => ({ ...prev, [name]: value })); };
    const handleLineItemChange = (index: number, field: keyof Omit<LineItem, 'id'>, value: string | number) => { setFormLineItems(prevItems => { const newItems = [...prevItems]; const processedValue = field === 'amount' ? (value === '' ? 0 : parseFloat(value as string)) : value; newItems[index] = { ...newItems[index], [field]: processedValue }; return newItems; }); };
    const addLineItem = () => { setFormLineItems(prevItems => [ ...prevItems, { id: `temp-${Date.now()}`, description: '', amount: 0 } ]); };
    const removeLineItem = (index: number) => { setFormLineItems(prevItems => prevItems.filter((_, i) => i !== index)); };

    // --- Copy ID Handler ---
    const handleCopyId = async (idToCopy: string) => { try { await navigator.clipboard.writeText(idToCopy); setSuccessMessage(`Invoice ID copied!`); } catch (err) { console.error('Failed to copy invoice ID: ', err); setApiError('Could not copy ID to clipboard.'); } };

    // --- Invoice Action Handlers (API Calls - Refetch in Finally) ---
    const handleCreateInvoiceSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
         event.preventDefault(); setApiError(null); setSuccessMessage(null); setIsSubmitting(true);
         if (formLineItems.length === 0) { setApiError("Please add at least one line item."); setIsSubmitting(false); return; }
         const itemsToSend = formLineItems.map(({ id, ...rest }) => rest); console.log("Submitting new invoice:", baseFormData, itemsToSend);
         try {
             const response = await fetch(WORKER_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, }, body: JSON.stringify({ action: 'invoiceCreate', ...baseFormData, lineItems: itemsToSend }) });
             const data = await response.json(); console.log("Create response:", data);
             if (!response.ok || !data.success) { throw new Error(data.error || `API Error: ${response.status}`); }
             setSuccessMessage("Invoice created successfully!"); closeModal();
         } catch (err: any) { console.error("Create Invoice Err:", err); setApiError(`Create failed: ${err.message}`); }
         finally { setIsSubmitting(false); if (isAuthenticated) fetchInvoices(); }
     }, [baseFormData, formLineItems, fetchInvoices, isAuthenticated]);

    const handleDeleteInvoice = useCallback(async (idToDelete: string) => {
         if (!window.confirm(`Are you sure you want to delete invoice ${idToDelete}?`)) return;
         setApiError(null); setSuccessMessage(null); setIsSubmitting(true); console.log("Deleting invoice:", idToDelete);
         try {
             const response = await fetch(WORKER_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, }, body: JSON.stringify({ action: 'invoiceDelete', invoiceId: idToDelete }) });
              const data = await response.json(); console.log("Delete response:", data);
              if (!response.ok || !data.success) { throw new Error(data.error || `API Error: ${response.status}`); }
             setSuccessMessage("Invoice deleted successfully!"); console.log("Invoice delete API call successful.");
         } catch (err: any) { console.error("Failed to delete invoice:", err); setApiError(`Delete failed: ${err.message}`); }
         finally { setIsSubmitting(false); if (isAuthenticated) fetchInvoices(); }
     }, [fetchInvoices, isAuthenticated]);

     const handleEditInvoiceSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
         event.preventDefault(); if (!editingInvoice) { setApiError("Cannot save, no invoice selected."); return; }
         setApiError(null); setSuccessMessage(null); setIsSubmitting(true);
          if (formLineItems.length === 0) { setApiError("Please add at least one line item."); setIsSubmitting(false); return; }
         const itemsToSend = formLineItems.map(({ id, ...rest }) => rest);
         const updatedInvoiceData = { id: editingInvoice.id, customerName: baseFormData.customerName, dueDate: baseFormData.dueDate, status: editingInvoice.status, lineItems: itemsToSend };
         console.log("Submitting updated invoice:", updatedInvoiceData);
         try {
             const response = await fetch(WORKER_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, }, body: JSON.stringify({ action: 'invoiceUpdate', ...updatedInvoiceData }) });
              const data = await response.json(); console.log("Update response:", data);
              if (!response.ok || !data.success) { throw new Error(data.error || `API Error: ${response.status}`); }
              setSuccessMessage("Invoice updated successfully!"); closeModal();
         } catch (err: any) { console.error("Update Invoice Err:", err); setApiError(`Update failed: ${err.message}`); }
         finally { setIsSubmitting(false); if (isAuthenticated) fetchInvoices(); }
     }, [editingInvoice, baseFormData, formLineItems, fetchInvoices, isAuthenticated]);

    const handleUpdateStatusSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
         event.preventDefault(); if (!statusPopupInvoiceId) { setApiError("Please enter an Invoice ID."); return; }
          setApiError(null); setSuccessMessage(null); setIsSubmitting(true);
          let action = ''; let payload: any = { invoiceId: statusPopupInvoiceId };
          try {
              if (statusPopupNewStatus === 'Paid') {
                  action = 'invoiceUpdateStatus'; if (!statusPopupPaymentMethod) { throw new Error("Payment method required for Paid status."); }
                  payload.newStatus = 'Paid'; payload.paymentMethod = statusPopupPaymentMethod;
                  if (statusPopupPaymentMethod === 'bank') { if (!statusPopupPaymentReference.trim()) { throw new Error("Reference number required for bank transfer."); } payload.paymentReference = statusPopupPaymentReference.trim(); }
                  else { payload.paymentReference = null; }
                  console.log(`Marking Paid: ID='${payload.invoiceId}', Method='${payload.paymentMethod}', Ref='${payload.paymentReference}'`);
              } else if (statusPopupNewStatus === 'Overdue') {
                  action = 'invoiceMarkOverdue'; console.log(`Marking Overdue: ID='${payload.invoiceId}'`);
              } else {
                  action = 'invoiceUpdateStatus'; payload.newStatus = 'Pending'; payload.paymentMethod = null; payload.paymentReference = null;
                  console.log(`Setting Pending: ID='${payload.invoiceId}'`);
              }
              const response = await fetch(WORKER_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, }, body: JSON.stringify({ action: action, ...payload }) });
              const data = await response.json(); console.log(`Update status response for ${action}:`, data);
              if (!response.ok || !data.success) { throw new Error(data.error || `API Error: ${response.status}`); }
              setSuccessMessage(data.message || "Status updated!"); closeModal();
              console.log(`Status update API call successful for ${statusPopupInvoiceId}`);
          } catch (err: any) { console.error("Update Status Err:", err); setApiError(`Status update failed: ${err.message}`); }
          finally { setIsSubmitting(false); if (isAuthenticated) fetchInvoices(); }
     }, [statusPopupInvoiceId, statusPopupNewStatus, statusPopupPaymentMethod, statusPopupPaymentReference, fetchInvoices, isAuthenticated]);

    // --- UPDATED Print Receipt Handler ---
    const handlePrintReceipt = useCallback((invoice: Invoice) => {
        // Ensure it's actually paid before printing a receipt
        if (invoice.status !== 'Paid') {
            alert("Cannot print receipt for non-paid invoice.");
            return;
        }

        const printWindow = window.open('', '_blank', 'height=800,width=800');
        if (!printWindow) { alert("Could not open print window. Check popup blockers."); return; }
        const totalAmount = calculateTotal(invoice.lineItems);
        let itemRowsHtml = '';
        invoice.lineItems.forEach(item => { itemRowsHtml += `<tr><td>${item.description || '(No description)'}</td><td class="text-right">$${(item.amount || 0).toFixed(2)}</td></tr>`; });

        // --- Receipt Specific Content ---
        let paymentDetailsHtml = '<p>Payment Method: Not specified</p>';
        if (invoice.paymentMethod === 'cash') {
            paymentDetailsHtml = '<p>Payment Method: Cash</p>';
        } else if (invoice.paymentMethod === 'bank') {
            paymentDetailsHtml = `<p>Payment Method: Bank Transfer</p><p>Reference: ${invoice.paymentReference || 'N/A'}</p>`;
        }

        const printContent = `
            <html> <head> <title>Receipt for Invoice ${invoice.id}</title> <style> body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; font-size: 12px; color: #333; } .container { max-width: 750px; margin: 20px auto; padding: 30px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0,0,0,0.05); } .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 15px; border-bottom: 1px solid #eee;} .header .logo { font-size: 1.5em; font-weight: bold; color: #555; } .header .company-details p { margin: 2px 0; font-size: 0.9em; text-align: right; color: #555; } .receipt-info { display: flex; justify-content: space-between; margin-bottom: 30px; } .receipt-info .bill-to p { margin: 2px 0; } .receipt-info .receipt-meta p { margin: 2px 0; text-align: right; } .receipt-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; } .receipt-table th, .receipt-table td { border: 1px solid #eee; padding: 8px; text-align: left; } .receipt-table th { background-color: #f8f9fa; font-weight: bold; } .receipt-table .total-row td { font-weight: bold; border-top: 2px solid #aaa; } .receipt-table .text-right { text-align: right; } .payment-details { margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; font-size: 0.9em; } .payment-details h3 { margin-bottom: 5px; font-size: 1.1em; } .qr-code-section { display: flex; align-items: center; justify-content: space-between; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;} .qr-code-container { text-align: center; } .qr-code-container p { font-size: 0.8em; margin-top: 5px; word-break: break-all; max-width: 150px; } .notes { margin-top: 20px; font-size: 0.85em; color: #777; } @media print { body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .container { border: none; box-shadow: none; margin: 0; max-width: 100%; padding: 10px; } .no-print { display: none; } } </style> </head>
            <body>
                <div class="container">
                    <div class="header"> <div class="logo">Project Theraphy</div> <div class="company-details"> <p>01 Sanambin Road</p> <p>Nai Mueng, Phitsanulok 65000</p> <p>088-555-1946</p> <p>thammalucka67@nu.ac.th</p> </div> </div>
                    <h2>Payment Receipt</h2>
                    <div class="receipt-info">
                        <div class="bill-to"> <strong>Received From:</strong><br> ${invoice.customerName} </div>
                        <div class="receipt-meta">
                            <p><strong>Original Invoice #:</strong> ${invoice.id}</p>
                            <p><strong>Payment Date:</strong> ${new Date().toLocaleDateString()}</p> {/* Use current date as payment date */}
                            <p><strong>Status:</strong> ${invoice.status}</p>
                         </div>
                    </div>
                    <table class="receipt-table">
                        <thead> <tr> <th>Description</th> <th class="text-right">Amount</th> </tr> </thead>
                        <tbody> ${itemRowsHtml} <tr class="total-row"> <td class="text-right"><strong>Total Paid:</strong></td> <td class="text-right"><strong>$${totalAmount.toFixed(2)}</strong></td> </tr> </tbody>
                    </table>
                    <div class="payment-details">
                       <h3>Payment Details</h3>
                       ${paymentDetailsHtml} {/* Insert payment method details */}
                    </div>
                    <div class="qr-code-section">
                        <div class="notes"> Thank you for your payment! </div>
                        <div class="qr-code-container"> <div id="qr-code-target"></div> <p>${invoice.id}</p> </div>
                    </div>
                </div>
                <button class="no-print" onclick="window.print()" style="position: fixed; bottom: 10px; right: 10px; padding: 10px 15px; cursor: pointer; background-color: #007bff; color: white; border: none; border-radius: 5px;">Print Receipt</button>
            </body> </html>
        `;
        printWindow.document.write(printContent);
        printWindow.document.close();
        const qrTarget = printWindow.document.getElementById('qr-code-target');
        if (qrTarget) {
            const root = createRoot(qrTarget);
            root.render( <React.StrictMode> <QRCodeCanvas value={invoice.id} size={100} bgColor={"#ffffff"} fgColor={"#000000"} level={"L"} includeMargin={true} /> </React.StrictMode> );
            setTimeout(() => { printWindow.focus(); printWindow.print(); }, 300);
        } else { console.error("Could not find QR target."); printWindow.print(); }
    }, []); // Empty dependency array as it only depends on the invoice passed in

    // --- Modal Open/Close Handlers ---
    const openCreateModal = () => { setBaseFormData(initialBaseFormData); setFormLineItems([{ id: `temp-${Date.now()}`, description: '', amount: 0 }]); setIsCreateModalOpen(true); setApiError(null); setSuccessMessage(null); };
    const openEditModal = (invoiceToEdit: Invoice) => { setEditingInvoice(invoiceToEdit); setBaseFormData({ customerName: invoiceToEdit.customerName, dueDate: formatDateForInput(invoiceToEdit.dueDate) }); setFormLineItems(invoiceToEdit.lineItems.map(item => ({ ...item, id: item.id || `temp-${Math.random()}` }))); setIsEditModalOpen(true); setApiError(null); setSuccessMessage(null); };
    const openStatusPopup = () => { setStatusPopupInvoiceId(''); setStatusPopupNewStatus('Pending'); setStatusPopupPaymentMethod(''); setStatusPopupPaymentReference(''); setIsStatusPopupOpen(true); setApiError(null); setSuccessMessage(null); };
    const closeModal = () => { setIsCreateModalOpen(false); setIsEditModalOpen(false); setIsStatusPopupOpen(false); setEditingInvoice(null); setBaseFormData(initialBaseFormData); setFormLineItems([]); setStatusPopupInvoiceId(''); setStatusPopupNewStatus('Pending'); setStatusPopupPaymentMethod(''); setStatusPopupPaymentReference(''); setApiError(null); /* Keep success message */ };


    // --- Render Password Prompt ---
    if (!isAuthenticated) {
         return (
             <div className="invoice-manager-password-container">
                 <div className="invoice-manager-password-box">
                     <h2>Invoice Manager Access</h2>
                     <form onSubmit={handlePasswordSubmit}>
                         <div className="form-group"> <label htmlFor="invoice-manager-password">Password:</label> <input type="password" id="invoice-manager-password" value={enteredPassword} onChange={handlePasswordChange} required autoFocus /> </div>
                         {authError && <p className="password-error">{authError}</p>}
                         <button type="submit" className="submit-password-button"> Enter </button>
                     </form>
                      <p className="password-note">Restricted Area.</p>
                 </div>
             </div>
         );
      }

    // --- Render Invoice Manager UI ---
    return (
        <div className="invoice-manager-container">
            <div className="invoice-manager-header"> <h1>Invoice Management</h1> <button onClick={() => setIsAuthenticated(false)} className="logout-button" disabled={isSubmitting}> Logout </button> </div>
            <div className="invoice-actions"> <button onClick={openCreateModal} className="action-button create-button" disabled={isSubmitting}> + Create New Invoice </button> <button onClick={openStatusPopup} className="action-button status-button" disabled={isSubmitting}> Edit Invoice Status by ID </button> </div>
            <div className="status-messages"> {isLoading && <p className="loading-message">Loading invoices...</p>} {apiError && !isLoading && !successMessage && <p className="api-error-message"> Error: {apiError} </p> } {successMessage && <p className="api-success-message"> {successMessage} </p> } </div>
            {!isLoading && (
                <div className="invoice-list">
                    <h2>Invoices</h2>
                    {invoices.length === 0 && !apiError ? ( <p>No invoices found. Create one!</p> ) : invoices.length > 0 ? (
                        <table>
                            <thead> <tr> <th>ID</th> <th>Customer</th> <th>Total Amount</th> <th>Due Date</th> <th>Status</th> <th>Actions</th> </tr> </thead>
                            <tbody>
                                {invoices.map(invoice => {
                                    const rowTotal = calculateTotal(invoice.lineItems);
                                    return (
                                        <tr key={invoice.id}>
                                            <td style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '200px' }}> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 }} title={invoice.id}> {invoice.id} </span> <button onClick={() => handleCopyId(invoice.id)} className="copy-id-button" title="Copy ID" disabled={isSubmitting}> 📋 </button> </td>
                                            <td>{invoice.customerName}</td> <td>${rowTotal.toFixed(2)}</td> <td>{invoice.dueDate}</td>
                                            <td> <span className={`status-badge status-${invoice.status.toLowerCase()}`}> {invoice.status} </span> </td>
                                            <td>
                                                <button onClick={() => openEditModal(invoice)} className="table-button edit" disabled={isSubmitting}>Edit</button>
                                                <button onClick={() => handleDeleteInvoice(invoice.id)} className="table-button delete" disabled={isSubmitting}>Delete</button>
                                                {/* --- Conditionally render Print Receipt button --- */}
                                                {invoice.status === 'Paid' && (
                                                    <button onClick={() => handlePrintReceipt(invoice)} className="table-button print-receipt" style={{backgroundColor: '#6f42c1', color: 'white'}} disabled={isSubmitting}>Receipt</button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : null }
                </div>
            )}

            {/* --- Modals --- */}
            {(isCreateModalOpen || isEditModalOpen) && (
                <div className="modal-overlay" onClick={closeModal}>
                     <div className="modal-content wide-modal" onClick={(e) => e.stopPropagation()}>
                         <h2>{isEditModalOpen ? `Edit Invoice (ID: ${editingInvoice?.id.substring(0,8)}...)` : 'Create New Invoice'}</h2>
                         {apiError && <p className="api-error-message">{apiError}</p>}
                         <form onSubmit={isEditModalOpen ? handleEditInvoiceSubmit : handleCreateInvoiceSubmit}>
                            <div className="form-scroll-area">
                                <div className="form-section"> <div className="form-group"> <label htmlFor="customerName">Customer Name:</label> <input type="text" id="customerName" name="customerName" value={baseFormData.customerName} onChange={handleBaseFormChange} required disabled={isSubmitting} /> </div> <div className="form-group"> <label htmlFor="dueDate">Due Date:</label> <input type="date" id="dueDate" name="dueDate" value={baseFormData.dueDate} onChange={handleBaseFormChange} required disabled={isSubmitting} /> </div> </div>
                                 <div className="form-section line-items-section"> <h3>Line Items</h3> <div className="line-item-row line-item-header"> <label className="line-item-description-label">Description</label> <label className="line-item-amount-label">Amount ($)</label> <div className="line-item-action-label">Action</div> </div> <div className="line-items-container"> {formLineItems.map((item, index) => ( <div key={item.id} className="line-item-row"> <input type="text" placeholder="Description" value={item.description} onChange={(e) => handleLineItemChange(index, 'description', e.target.value)} required className="line-item-description" disabled={isSubmitting} /> <input type="number" placeholder="Amount" value={item.amount} onChange={(e) => handleLineItemChange(index, 'amount', e.target.value)} required min="0" step="0.01" className="line-item-amount" disabled={isSubmitting} /> <div className="line-item-action"> {formLineItems.length > 1 && ( <button type="button" onClick={() => removeLineItem(index)} className="remove-line-item-btn" disabled={isSubmitting} title="Remove Item"> 🗑️ </button> )} </div> </div> ))} </div> <button type="button" onClick={addLineItem} className="add-line-item-btn" disabled={isSubmitting}> + Add Line Item </button> <div className="form-total"> <strong>Total: ${formTotalAmount.toFixed(2)}</strong> </div> </div>
                             </div>
                             <div className="modal-actions"> <button type="submit" className={`action-button ${isEditModalOpen ? 'edit-button' : 'create-button'}`} disabled={isSubmitting}> {isSubmitting ? 'Saving...' : (isEditModalOpen ? 'Save Changes' : 'Create Invoice')} </button> <button type="button" onClick={closeModal} className="cancel-button" disabled={isSubmitting}>Cancel</button> </div>
                         </form>
                     </div>
                </div>
            )}
            {isStatusPopupOpen && (
                 <div className="modal-overlay" onClick={closeModal}>
                     <div className="modal-content status-popup" onClick={(e) => e.stopPropagation()}>
                         <h2>Edit Invoice Status</h2>
                         {apiError && <p className="api-error-message">{apiError}</p>}
                         <form onSubmit={handleUpdateStatusSubmit}>
                             <div className="form-group"> <label htmlFor="status-invoice-id">Invoice ID:</label> <input type="text" id="status-invoice-id" value={statusPopupInvoiceId} onChange={(e) => setStatusPopupInvoiceId(e.target.value)} placeholder="Enter full ID to edit" required disabled={isSubmitting}/> </div>
                             <div className="form-group"> <label htmlFor="status-new-status">New Status:</label> <select id="status-new-status" value={statusPopupNewStatus} onChange={(e) => { setStatusPopupNewStatus(e.target.value as Invoice['status']); setStatusPopupPaymentMethod(''); setStatusPopupPaymentReference(''); }} required disabled={isSubmitting}> <option value="Pending">Pending</option> <option value="Paid">Paid</option> <option value="Overdue">Overdue</option> </select> </div>
                             {statusPopupNewStatus === 'Paid' && ( <div className="payment-details-section"> <div className="form-group"> <label htmlFor="status-payment-method">Payment Method:</label> <select id="status-payment-method" value={statusPopupPaymentMethod} onChange={(e) => setStatusPopupPaymentMethod(e.target.value as 'cash' | 'bank' | '')} required disabled={isSubmitting} > <option value="" disabled>-- Select Method --</option> <option value="cash">Cash</option> <option value="bank">Bank Transfer</option> </select> </div> {statusPopupPaymentMethod === 'bank' && ( <div className="form-group"> <label htmlFor="status-payment-ref">Reference No:</label> <input type="text" id="status-payment-ref" value={statusPopupPaymentReference} onChange={(e) => setStatusPopupPaymentReference(e.target.value)} placeholder="Enter bank reference" required disabled={isSubmitting} /> </div> )} </div> )}
                             {statusPopupNewStatus === 'Overdue' && ( <p className="overdue-notice">Note: Marking as Overdue will add a $10.00 fee line item.</p> )}
                             <div className="popup-actions"> <button type="submit" className="action-button status-button" disabled={isSubmitting}> {isSubmitting ? 'Updating...' : 'Update Status'} </button> <button type="button" onClick={closeModal} className="cancel-button" disabled={isSubmitting}>Cancel</button> </div>
                         </form>
                     </div>
                 </div>
             )}
        </div> // End invoice-manager-container
    );
};

export default InvoiceManagerPage;
