// src/InvoiceManagerPage.tsx (with Line Items functionality)
import React, { useState, useEffect, ChangeEvent, FormEvent, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { QRCodeCanvas } from 'qrcode.react';
import './InvoiceManagerPage.css'; // Make sure this CSS file exists and is styled

// --- Configuration ---
// <<< --- REPLACE with your actual Worker URL --- >>>
const WORKER_API_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';
// <<< --- REPLACE with the password set in Worker secrets --- >>>
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
// Structure for individual line items
interface LineItem {
    id: string; // Temporary ID for React key, or persistent if needed
    description: string;
    amount: number;
}

// Updated Invoice structure
interface Invoice {
    id: string;
    customerName: string;
    dueDate: string; // Storing as YYYY-MM-DD
    status: 'Pending' | 'Paid' | 'Overdue';
    lineItems: LineItem[]; // Array of line items instead of single amount
}

// Updated Form Data structure
// Omit invoice ID and status (set automatically), lineItems handled separately
type InvoiceBaseFormData = Omit<Invoice, 'id' | 'status' | 'lineItems'>;


// --- Component ---
const InvoiceManagerPage: React.FC = () => {
    // --- State ---
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [enteredPassword, setEnteredPassword] = useState<string>('');
    const [authError, setAuthError] = useState<string | null>(null);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [apiError, setApiError] = useState<string | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
    const [isStatusPopupOpen, setIsStatusPopupOpen] = useState<boolean>(false);
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null); // Holds the full invoice being edited

    // Form state for base invoice details (customer, due date)
    const initialBaseFormData: InvoiceBaseFormData = { customerName: '', dueDate: '' };
    const [baseFormData, setBaseFormData] = useState<InvoiceBaseFormData>(initialBaseFormData);
    // Separate state for line items within the form modal
    const [formLineItems, setFormLineItems] = useState<LineItem[]>([]);

    // Status Popup State
    const [statusPopupInvoiceId, setStatusPopupInvoiceId] = useState<string>('');
    const [statusPopupNewStatus, setStatusPopupNewStatus] = useState<Invoice['status']>('Pending');

    // --- Calculate Total Amount (Helper) ---
    const calculateTotal = (items: LineItem[]): number => {
        return items.reduce((sum, item) => sum + (item.amount || 0), 0);
    };

    // Memoized total for the form items
    const formTotalAmount = useMemo(() => calculateTotal(formLineItems), [formLineItems]);

    // --- Fetch Invoices ---
    const fetchInvoices = useCallback(async () => {
        if (!isAuthenticated) return;
        console.log("Fetching invoices...");
        setIsLoading(true);
        setApiError(null);
        try {
            const response = await fetch(WORKER_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, },
                body: JSON.stringify({ action: 'invoiceGet' })
            });
            const responseBodyText = await response.text();
            console.log("Fetch response status:", response.status);
            if (!response.ok) {
                 let errorMsg = `API Error: ${response.status}`;
                 try { const errorData = JSON.parse(responseBodyText); errorMsg = errorData.error || errorMsg; }
                 catch (parseError) { errorMsg = `${errorMsg} ${responseBodyText}`; }
                 throw new Error(errorMsg);
            }
            const data = await response.json();
            if (data.success && Array.isArray(data.invoices)) {
                // IMPORTANT: Parse lineItems string from worker back into array
                const processedInvoices = data.invoices.map((inv: any) => ({
                    ...inv,
                    lineItems: typeof inv.lineItems === 'string' ? JSON.parse(inv.lineItems) : (inv.lineItems || []) // Handle parsing and potential null
                }));
                setInvoices(processedInvoices);
                console.log("Invoices loaded:", processedInvoices.length);
            } else { throw new Error(data.error || 'API response format incorrect'); }
        } catch (err: any) {
            console.error("Failed to fetch invoices:", err);
            setApiError(err.message);
            setInvoices([]);
        } finally { setIsLoading(false); }
    }, [isAuthenticated]);

    useEffect(() => {
        if (isAuthenticated) { fetchInvoices(); }
        else { setInvoices([]); }
    }, [isAuthenticated, fetchInvoices]);

    // --- Password Handlers ---
    const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => { setEnteredPassword(event.target.value); setAuthError(null); };
    const handlePasswordSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (enteredPassword === INVOICE_ACCESS_PASSWORD) { setIsAuthenticated(true); setAuthError(null); setEnteredPassword(''); }
        else { setAuthError('Incorrect password.'); setIsAuthenticated(false); }
    };

    // --- Form Input Handlers ---
     const handleBaseFormChange = (event: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setBaseFormData(prev => ({ ...prev, [name]: value }));
    };

    // Handle changes within a specific line item
    const handleLineItemChange = (index: number, field: keyof Omit<LineItem, 'id'>, value: string | number) => {
        setFormLineItems(prevItems => {
            const newItems = [...prevItems];
            // Ensure amount is stored as a number
            const processedValue = field === 'amount' ? (value === '' ? 0 : parseFloat(value as string)) : value;
            newItems[index] = { ...newItems[index], [field]: processedValue };
            return newItems;
        });
    };

    // Add a new blank line item to the form
    const addLineItem = () => {
        setFormLineItems(prevItems => [
            ...prevItems,
            { id: `temp-${Date.now()}`, description: '', amount: 0 } // Temporary ID for React key
        ]);
    };

    // Remove a line item from the form by index
    const removeLineItem = (index: number) => {
        setFormLineItems(prevItems => prevItems.filter((_, i) => i !== index));
    };


    // --- Invoice Action Handlers (API Calls) ---
    const handleCreateInvoiceSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setApiError(null);
        if (formLineItems.length === 0) {
             setApiError("Please add at least one line item.");
             return;
        }
        // Remove temporary IDs before sending
        const itemsToSend = formLineItems.map(({ id, ...rest }) => rest);

        console.log("Submitting new invoice:", baseFormData, itemsToSend);
        try {
            const response = await fetch(WORKER_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, },
                body: JSON.stringify({
                    action: 'invoiceCreate',
                    ...baseFormData, // customerName, dueDate
                    lineItems: itemsToSend // Send the array
                })
            });
            const data = await response.json();
            console.log("Create response:", data);
            if (!response.ok || !data.success) { throw new Error(data.error || `API Error: ${response.status}`); }
            // Assuming worker returns the full invoice with parsed lineItems
            if (data.invoice && data.invoice.id) {
                const newInvoice = {
                    ...data.invoice,
                    lineItems: typeof data.invoice.lineItems === 'string' ? JSON.parse(data.invoice.lineItems) : (data.invoice.lineItems || [])
                };
                setInvoices(prev => [...prev, newInvoice]);
            } else { console.warn("Create successful, but invoice data missing. Refetching."); fetchInvoices(); }
            closeModal();
        } catch (err: any) { console.error("Create Invoice Err:", err); setApiError(`Create failed: ${err.message}`); }
    };

    const handleDeleteInvoice = async (idToDelete: string) => {
        if (!window.confirm(`Are you sure you want to delete invoice ${idToDelete}?`)) return;
        setApiError(null);
        console.log("Deleting invoice:", idToDelete);
        try {
            const response = await fetch(WORKER_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, },
                body: JSON.stringify({ action: 'invoiceDelete', invoiceId: idToDelete })
            });
             const data = await response.json();
             console.log("Delete response:", data);
             if (!response.ok || !data.success) { throw new Error(data.error || `API Error: ${response.status}`); }
            setInvoices(prevInvoices => prevInvoices.filter(inv => inv.id !== idToDelete));
            console.log("Invoice deleted successfully from state.");
        } catch (err: any) { console.error("Failed to delete invoice:", err); setApiError(`Delete failed: ${err.message}`); }
    };

     const handleEditInvoiceSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingInvoice) { setApiError("Cannot save, no invoice selected."); return; }
        setApiError(null);
         if (formLineItems.length === 0) {
             setApiError("Please add at least one line item.");
             return;
         }
        // Remove temporary IDs before sending
        const itemsToSend = formLineItems.map(({ id, ...rest }) => rest);

        // Construct the full updated invoice object to send
        const updatedInvoiceData = {
             id: editingInvoice.id, // Include the ID
             customerName: baseFormData.customerName,
             dueDate: baseFormData.dueDate,
             status: editingInvoice.status, // Keep the original status unless changed elsewhere
             lineItems: itemsToSend // Send the updated line items array
        };
        console.log("Submitting updated invoice:", updatedInvoiceData);
        try {
            const response = await fetch(WORKER_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, },
                body: JSON.stringify({ action: 'invoiceUpdate', ...updatedInvoiceData }) // Send action and full data
            });
             const data = await response.json();
             console.log("Update response:", data);
             if (!response.ok || !data.success) { throw new Error(data.error || `API Error: ${response.status}`); }
             // Update local state with potentially modified data from worker
             if (data.invoice && data.invoice.id) {
                const updatedInvoice = {
                     ...data.invoice,
                     lineItems: typeof data.invoice.lineItems === 'string' ? JSON.parse(data.invoice.lineItems) : (data.invoice.lineItems || [])
                 };
                 setInvoices(prev => prev.map(inv => inv.id === updatedInvoice.id ? updatedInvoice : inv));
             } else { console.warn("Update successful, but invoice data missing. Refetching."); fetchInvoices(); }
             closeModal();
        } catch (err: any) { console.error("Update Invoice Err:", err); setApiError(`Update failed: ${err.message}`); }
    };

    const handleUpdateStatusSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!statusPopupInvoiceId) { setApiError("Please enter an Invoice ID."); return; }
         const invoiceExists = invoices.some(inv => inv.id === statusPopupInvoiceId);
         if (!invoiceExists) { setApiError(`Invoice with ID "${statusPopupInvoiceId}" not found locally.`); /* return; */ }
         setApiError(null);
         console.log(`Updating status for ${statusPopupInvoiceId} to ${statusPopupNewStatus}`);
         try {
             const response = await fetch(WORKER_API_URL, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, },
                 body: JSON.stringify({ action: 'invoiceUpdateStatus', invoiceId: statusPopupInvoiceId, newStatus: statusPopupNewStatus })
             });
             const data = await response.json();
             console.log("Update status response:", data);
             if (!response.ok || !data.success) { throw new Error(data.error || `API Error: ${response.status}`); }
             setInvoices(prev => prev.map(inv => inv.id === statusPopupInvoiceId ? { ...inv, status: statusPopupNewStatus } : inv));
             console.log(`Status updated locally for ${statusPopupInvoiceId}`);
             closeModal();
         } catch (err: any) { console.error("Update Status Err:", err); setApiError(`Status update failed: ${err.message}`); }
    };

    // --- UPDATED: Print Invoice Handler ---
    const handlePrintInvoice = (invoice: Invoice) => {
        const printWindow = window.open('', '_blank', 'height=800,width=800');
        if (!printWindow) { alert("Could not open print window. Check popup blockers."); return; }

        // Calculate total amount for printing
        const totalAmount = calculateTotal(invoice.lineItems);

        // Generate HTML rows for line items
        let itemRowsHtml = '';
        invoice.lineItems.forEach(item => {
            itemRowsHtml += `
                <tr>
                    <td>${item.description || '(No description)'}</td>
                    <td class="text-right">$${(item.amount || 0).toFixed(2)}</td>
                </tr>
            `;
        });

        const printContent = `
            <html> <head> <title>Invoice ${invoice.id}</title> <style> 
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; font-size: 12px; color: #333; }
                        .container { max-width: 750px; margin: 20px auto; padding: 30px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0,0,0,0.05); }
                        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 15px; border-bottom: 1px solid #eee;}
                        .header .logo { font-size: 1.5em; font-weight: bold; color: #555; /* Replace with <img> tag if you have a logo */ }
                        .header .company-details p { margin: 2px 0; font-size: 0.9em; text-align: right; color: #555; }
                        .invoice-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
                        .invoice-info .bill-to p { margin: 2px 0; }
                        .invoice-info .invoice-meta p { margin: 2px 0; text-align: right; }
                        .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                        .invoice-table th, .invoice-table td { border: 1px solid #eee; padding: 8px; text-align: left; }
                        .invoice-table th { background-color: #f8f9fa; font-weight: bold; }
                        .invoice-table .total-row td { font-weight: bold; border-top: 2px solid #aaa; }
                        .invoice-table .text-right { text-align: right; }
                        .payment-info { margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; font-size: 0.9em; color: #555; }
                        .payment-info h3 { margin-bottom: 10px; font-size: 1.1em; }
                        .qr-code-section { display: flex; align-items: center; justify-content: space-between; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;}
                        .qr-code-container { text-align: center; }
                        .qr-code-container p { font-size: 0.8em; margin-top: 5px; word-break: break-all; max-width: 150px; }
                        .notes { margin-top: 20px; font-size: 0.85em; color: #777; }
                        @media print {
                            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .container { border: none; box-shadow: none; margin: 0; max-width: 100%; padding: 10px; }
                            .no-print { display: none; }
                        }
                    </style>
                </head> 
            <body>
                <div class="container">
                    <div class="header">
                        <div class="logo">Your Company Name</div>
                        <div class="company-details"> <p>01 Sanambin Road</p> <p>Nai Mueng, Phitsanulok 65000</p> <p>0885551946</p> <p>thammalucka67@nu.ac.th</p> </div>
                    </div>
                    <div class="invoice-info">
                        <div class="bill-to"> <strong>Bill To:</strong><br> ${invoice.customerName} </div>
                        <div class="invoice-meta"> <p><strong>Invoice #:</strong> ${invoice.id}</p> <p><strong>Date Issued:</strong> ${new Date().toLocaleDateString()}</p> <p><strong>Due Date:</strong> ${invoice.dueDate}</p> <p><strong>Status:</strong> ${invoice.status}</p> </div>
                    </div>
                    <table class="invoice-table">
                        <thead> <tr> <th>Description</th> <th class="text-right">Amount</th> </tr> </thead>
                        <tbody>
                            ${itemRowsHtml} 
                            <tr class="total-row"> <td class="text-right"><strong>Total Due:</strong></td> <td class="text-right"><strong>$${totalAmount.toFixed(2)}</strong></td> </tr>
                        </tbody>
                    </table>
                    <div class="payment-info">
                       <h3>Payment Information</h3>
                       <p>Bank Name: Kasikorn Bank</p> <p>Account Name: ธรรมลักษณ์ อริยธรรมนิตย์</p> <p>Account Number: 153-2-86554-5</p> <p>Reference: Invoice ${invoice.id.substring(0, 8)}</p>
                    </div>
                    <div class="qr-code-section">
                        <div class="notes"> Thank you! </div>
                        <div class="qr-code-container"> <div id="qr-code-target"></div> <p>${invoice.id}</p> </div>
                    </div>
                </div>
                <button class="no-print" onclick="window.print()" style="position: fixed; bottom: 10px; right: 10px; padding: 10px 15px; cursor: pointer; background-color: #007bff; color: white; border: none; border-radius: 5px;">Print Invoice</button>
            </body> </html>
        `;

        printWindow.document.write(printContent);
        printWindow.document.close();
        const qrTarget = printWindow.document.getElementById('qr-code-target');
        if (qrTarget) {
            const root = createRoot(qrTarget);
            root.render(
                 <React.StrictMode>
                    <QRCodeCanvas value={invoice.id} size={100} bgColor={"#ffffff"} fgColor={"#000000"} level={"L"} includeMargin={true} />
                 </React.StrictMode>
            );
            setTimeout(() => { printWindow.focus(); printWindow.print(); }, 300);
        } else { console.error("Could not find QR target."); printWindow.print(); }
    };
    // --- End Print Handler ---


    // --- Modal Open/Close Handlers ---
    const openCreateModal = () => {
        setBaseFormData(initialBaseFormData); // Reset base form
        setFormLineItems([{ id: `temp-${Date.now()}`, description: '', amount: 0 }]); // Start with one blank line item
        setIsCreateModalOpen(true);
        setApiError(null);
    };

    const openEditModal = (invoiceToEdit: Invoice) => {
        setEditingInvoice(invoiceToEdit); // Store the full invoice
        // Pre-fill base form data
        setBaseFormData({
             customerName: invoiceToEdit.customerName,
             dueDate: formatDateForInput(invoiceToEdit.dueDate)
        });
        // Pre-fill line items (ensure they have temporary IDs for React keys if needed)
        setFormLineItems(invoiceToEdit.lineItems.map(item => ({ ...item, id: item.id || `temp-${Math.random()}` })));
        setIsEditModalOpen(true);
        setApiError(null);
    };

    const openStatusPopup = () => { setStatusPopupInvoiceId(''); setStatusPopupNewStatus('Pending'); setIsStatusPopupOpen(true); setApiError(null); };
    const closeModal = () => {
        setIsCreateModalOpen(false); setIsEditModalOpen(false); setIsStatusPopupOpen(false);
        setEditingInvoice(null); // Clear editing state
        setBaseFormData(initialBaseFormData); // Reset base form
        setFormLineItems([]); // Clear line items
        setStatusPopupInvoiceId(''); setStatusPopupNewStatus('Pending');
        setApiError(null);
    };


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
            <button onClick={() => setIsAuthenticated(false)} style={{ float: 'right', backgroundColor: '#6c757d', color: 'white', marginBottom: '10px' }} className="action-button"> Logout </button>
            <h1>Invoice Management</h1>
            <div className="invoice-actions">
                 <button onClick={openCreateModal} className="action-button create-button"> + Create New Invoice </button>
                 <button onClick={openStatusPopup} className="action-button status-button"> Edit Invoice Status by ID </button>
            </div>
            {isLoading && <p className="loading-message">Loading invoices...</p>}
            {apiError && !isCreateModalOpen && !isEditModalOpen && !isStatusPopupOpen &&
                <p className="api-error-message"> Error: {apiError} </p>
            }
            {!isLoading && (
                <div className="invoice-list">
                    <h2>Invoices</h2>
                    {invoices.length === 0 && !apiError ? ( <p>No invoices found. Create one!</p> ) : invoices.length > 0 ? (
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th> <th>Customer</th> <th>Total Amount</th> {/* Changed from Amount */}
                                    <th>Due Date</th> <th>Status</th> <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map(invoice => {
                                    // Calculate total for display in the table row
                                    const rowTotal = calculateTotal(invoice.lineItems);
                                    return (
                                        <tr key={invoice.id}>
                                            <td style={{ wordBreak: 'break-all', maxWidth: '150px' }}>{invoice.id}</td>
                                            <td>{invoice.customerName}</td>
                                            {/* Display calculated total */}
                                            <td>${rowTotal.toFixed(2)}</td>
                                            <td>{invoice.dueDate}</td>
                                            <td> <span className={`status-badge status-${invoice.status.toLowerCase()}`}> {invoice.status} </span> </td>
                                            <td>
                                                <button onClick={() => openEditModal(invoice)} className="table-button edit">Edit</button>
                                                <button onClick={() => handleDeleteInvoice(invoice.id)} className="table-button delete">Delete</button>
                                                <button onClick={() => handlePrintInvoice(invoice)} className="table-button print" style={{backgroundColor: '#0dcaf0', color: 'white'}}>Print</button>
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

            {/* Create/Edit Invoice Modal (Combined Logic) */}
            {(isCreateModalOpen || isEditModalOpen) && (
                <div className="modal-overlay" onClick={closeModal}>
                     <div className="modal-content wide-modal" onClick={(e) => e.stopPropagation()}>
                         <h2>{isEditModalOpen ? `Edit Invoice (ID: ${editingInvoice?.id.substring(0,8)}...)` : 'Create New Invoice'}</h2>
                         {apiError && <p className="api-error-message">{apiError}</p>}
                         {/* Use specific submit handler based on mode */}
                         <form onSubmit={isEditModalOpen ? handleEditInvoiceSubmit : handleCreateInvoiceSubmit}>
                            {/* Base Invoice Details */}
                            <div className="form-section">
                                 <div className="form-group">
                                     <label htmlFor="customerName">Customer Name:</label>
                                     <input type="text" id="customerName" name="customerName" value={baseFormData.customerName} onChange={handleBaseFormChange} required />
                                 </div>
                                 <div className="form-group">
                                     <label htmlFor="dueDate">Due Date:</label>
                                     <input type="date" id="dueDate" name="dueDate" value={baseFormData.dueDate} onChange={handleBaseFormChange} required />
                                 </div>
                             </div>

                             {/* Line Items Section */}
                             <div className="form-section line-items-section">
                                 <h3>Line Items</h3>
                                 {formLineItems.map((item, index) => (
                                     <div key={item.id} className="line-item-row">
                                         <input
                                             type="text"
                                             placeholder="Description"
                                             value={item.description}
                                             onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                                             required
                                             className="line-item-description"
                                         />
                                         <input
                                             type="number"
                                             placeholder="Amount"
                                             value={item.amount}
                                             onChange={(e) => handleLineItemChange(index, 'amount', e.target.value)}
                                             required
                                             min="0" // Allow 0 amount? Adjust if needed
                                             step="0.01"
                                             className="line-item-amount"
                                         />
                                         {/* Only show remove button if more than one item */}
                                         {formLineItems.length > 1 && (
                                             <button type="button" onClick={() => removeLineItem(index)} className="remove-line-item-btn"> 🗑️ </button>
                                         )}
                                     </div>
                                 ))}
                                 <button type="button" onClick={addLineItem} className="add-line-item-btn"> + Add Line Item </button>
                                 <div className="form-total">
                                     <strong>Total: ${formTotalAmount.toFixed(2)}</strong>
                                 </div>
                             </div>

                             <div className="modal-actions">
                                 <button type="submit" className={`action-button ${isEditModalOpen ? 'edit-button' : 'create-button'}`}>
                                     {isEditModalOpen ? 'Save Changes' : 'Create Invoice'}
                                 </button>
                                 <button type="button" onClick={closeModal} className="cancel-button">Cancel</button>
                             </div>
                         </form>
                     </div>
                </div>
            )}

            {/* Status Popup Modal */}
            {isStatusPopupOpen && (
                 <div className="modal-overlay" onClick={closeModal}>
                     <div className="modal-content status-popup" onClick={(e) => e.stopPropagation()}>
                         <h2>Edit Invoice Status</h2>
                         {apiError && <p className="api-error-message">{apiError}</p>}
                         <form onSubmit={handleUpdateStatusSubmit}>
                             <div className="form-group"> <label htmlFor="status-invoice-id">Invoice ID:</label> <input type="text" id="status-invoice-id" value={statusPopupInvoiceId} onChange={(e) => setStatusPopupInvoiceId(e.target.value)} placeholder="Enter full ID to edit" required /> </div>
                             <div className="form-group"> <label htmlFor="status-new-status">New Status:</label> <select id="status-new-status" value={statusPopupNewStatus} onChange={(e) => setStatusPopupNewStatus(e.target.value as Invoice['status'])} required > <option value="Pending">Pending</option> <option value="Paid">Paid</option> <option value="Overdue">Overdue</option> </select> </div>
                             <div className="popup-actions"> <button type="submit" className="action-button status-button"> Update Status </button> <button type="button" onClick={closeModal} className="cancel-button">Cancel</button> </div>
                         </form>
                     </div>
                 </div>
             )}

        </div> // End invoice-manager-container
    );
};

export default InvoiceManagerPage;
