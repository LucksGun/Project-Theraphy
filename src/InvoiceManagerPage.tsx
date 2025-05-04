// src/InvoiceManagerPage.tsx (with Print QR functionality - Fixed Render API)
import React, { useState, useEffect, ChangeEvent, FormEvent, useCallback } from 'react';
// import ReactDOM from 'react-dom'; // No longer need the main 'react-dom' import for this
import { createRoot } from 'react-dom/client'; // <<<--- IMPORT createRoot
import { QRCodeCanvas } from 'qrcode.react'; // Import QR Code component
import './InvoiceManagerPage.css'; // Make sure this CSS file exists and is styled

// --- Configuration ---
// <<< --- REPLACE with your actual Worker URL --- >>>
const WORKER_API_URL = 'YOUR_WORKER_URL_HERE';
// <<< --- REPLACE with the password set in Worker secrets --- >>>
const INVOICE_ACCESS_PASSWORD = 'YourStrongInvoicePassword!';

// --- Helper: Format Date for Input ---
const formatDateForInput = (isoDateString: string): string => {
    try {
        if (isoDateString && /^\d{4}-\d{2}-\d{2}$/.test(isoDateString)) {
            return isoDateString;
        }
        const date = new Date(isoDateString);
        if (isNaN(date.getTime())) {
             console.warn("Invalid date string received:", isoDateString);
             return '';
        }
        return date.toISOString().split('T')[0];
    } catch (e) {
        console.error("Error formatting date:", isoDateString, e);
        return '';
    }
};


// --- Data Structures ---
interface Invoice {
    id: string;
    customerName: string;
    amount: number;
    dueDate: string; // Storing as<x_bin_534>-MM-DD
    status: 'Pending' | 'Paid' | 'Overdue';
}

type InvoiceFormData = Omit<Invoice, 'id' | 'status'>;


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
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
    const initialFormData: InvoiceFormData = { customerName: '', amount: 0, dueDate: '' };
    const [formData, setFormData] = useState<InvoiceFormData>(initialFormData);
    const [statusPopupInvoiceId, setStatusPopupInvoiceId] = useState<string>('');
    const [statusPopupNewStatus, setStatusPopupNewStatus] = useState<Invoice['status']>('Pending');

    // --- Fetch Invoices ---
    const fetchInvoices = useCallback(async () => {
        if (!isAuthenticated) return;
        console.log("Fetching invoices...");
        setIsLoading(true);
        setApiError(null);
        try {
            const response = await fetch(WORKER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Invoice-Password': INVOICE_ACCESS_PASSWORD,
                },
                body: JSON.stringify({ action: 'invoiceGet' })
            });
            const responseBodyText = await response.text();
            console.log("Fetch response status:", response.status);
            // console.log("Fetch response body:", responseBodyText); // Less verbose logging
            if (!response.ok) {
                 let errorMsg = `API Error: ${response.status}`;
                 try { const errorData = JSON.parse(responseBodyText); errorMsg = errorData.error || errorMsg; }
                 catch (parseError) { errorMsg = `${errorMsg} ${responseBodyText}`; }
                 throw new Error(errorMsg);
            }
            const data = JSON.parse(responseBodyText);
            if (data.success && Array.isArray(data.invoices)) {
                setInvoices(data.invoices);
                console.log("Invoices loaded:", data.invoices.length);
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
    const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
        setEnteredPassword(event.target.value);
        setAuthError(null);
    };
    const handlePasswordSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (enteredPassword === INVOICE_ACCESS_PASSWORD) {
            setIsAuthenticated(true);
            setAuthError(null);
            setEnteredPassword('');
        } else {
            setAuthError('Incorrect password.');
            setIsAuthenticated(false);
        }
    };

    // --- Form Input Handler ---
     const handleFormChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = event.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? (value === '' ? 0 : parseFloat(value)) : value
        }));
    };

    // --- Invoice Action Handlers (API Calls) ---
    const handleCreateInvoiceSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setApiError(null);
        console.log("Submitting new invoice:", formData);
        try {
            const response = await fetch(WORKER_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, },
                body: JSON.stringify({ action: 'invoiceCreate', ...formData })
            });
            const data = await response.json();
            console.log("Create response:", data);
            if (!response.ok || !data.success) { throw new Error(data.error || `API Error: ${response.status}`); }
            if (data.invoice && data.invoice.id) { setInvoices(prev => [...prev, data.invoice]); }
            else { console.warn("Create successful, but invoice data missing. Refetching."); fetchInvoices(); }
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
        const updatedInvoiceData: Invoice = {
             id: editingInvoice.id,
             customerName: formData.customerName,
             amount: formData.amount,
             dueDate: formData.dueDate,
             status: editingInvoice.status, // Keep original status
        };
        console.log("Submitting updated invoice:", updatedInvoiceData);
        try {
            const response = await fetch(WORKER_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Invoice-Password': INVOICE_ACCESS_PASSWORD, },
                body: JSON.stringify({ action: 'invoiceUpdate', ...updatedInvoiceData })
            });
             const data = await response.json();
             console.log("Update response:", data);
             if (!response.ok || !data.success) { throw new Error(data.error || `API Error: ${response.status}`); }
             if (data.invoice && data.invoice.id) { setInvoices(prev => prev.map(inv => inv.id === data.invoice.id ? data.invoice : inv)); }
             else { console.warn("Update successful, but invoice data missing. Refetching."); fetchInvoices(); }
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

    // --- NEW: Print Invoice Handler ---
    const handlePrintInvoice = (invoice: Invoice) => {
        const printWindow = window.open('', '_blank', 'height=600,width=800');

        if (printWindow) {
            // Basic HTML structure for the print view
            const printContent = `
                <html>
                <head>
                    <title>Invoice ${invoice.id}</title>
                    <style>
                        body { font-family: sans-serif; margin: 20px; }
                        .invoice-details { margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 15px; }
                        .invoice-details p { margin: 5px 0; }
                        .qr-code-container { margin-top: 30px; text-align: center; }
                        h1, h2 { text-align: center; }
                        @media print {
                            body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } /* Ensure styles print */
                            .no-print { display: none; } /* Hide elements not for printing */
                        }
                    </style>
                </head>
                <body>
                    <h1>Invoice Details</h1>
                    <div class="invoice-details">
                        <p><strong>Invoice ID:</strong> ${invoice.id}</p>
                        <p><strong>Customer:</strong> ${invoice.customerName}</p>
                        <p><strong>Amount:</strong> $${invoice.amount.toFixed(2)}</p>
                        <p><strong>Due Date:</strong> ${invoice.dueDate}</p>
                        <p><strong>Status:</strong> ${invoice.status}</p>
                    </div>
                    <div class="qr-code-container">
                        <h2>Scan ID</h2>
                        <div id="qr-code-target"></div> {/* Placeholder for QR code */}
                         <p style="font-size: 0.8em; margin-top: 5px;">${invoice.id}</p>
                    </div>
                     {/* Add a Print button that's hidden when printing */}
                     <button class="no-print" onclick="window.print()" style="display:block; margin: 20px auto; padding: 10px 20px; cursor: pointer;">Print</button>
                </body>
                </html>
            `;

            printWindow.document.write(printContent);
            printWindow.document.close(); // Important for some browsers

            // Find the target div in the new window to render the QR code
            const qrTarget = printWindow.document.getElementById('qr-code-target');

            if (qrTarget) {
                // --- *** FIX: Use createRoot *** ---
                const root = createRoot(qrTarget); // Create a root attached to the target div
                root.render( // Render the QR code component using the root
                     <React.StrictMode> {/* Optional: Wrap in StrictMode */}
                        <QRCodeCanvas
                            value={invoice.id} // The data to encode (the invoice ID)
                            size={128}         // Size of the QR code
                            bgColor={"#ffffff"}
                            fgColor={"#000000"}
                            level={"L"}         // Error correction level
                            includeMargin={false}
                        />
                     </React.StrictMode>
                );

                // Use a small timeout to allow QR code rendering before printing
                setTimeout(() => {
                    printWindow.focus(); // Focus the new window
                    printWindow.print();
                    // Optional: close the window after printing attempt
                    // printWindow.close();
                }, 250); // Adjust timeout if needed

            } else {
                console.error("Could not find QR code target element in print window.");
                // Fallback print without QR code if target isn't found
                printWindow.print();
            }

        } else {
            alert("Could not open print window. Please check your browser's popup blocker settings.");
        }
    };


    // --- Modal Open/Close Handlers ---
    const openCreateModal = () => { setFormData(initialFormData); setIsCreateModalOpen(true); setApiError(null); };
    const openEditModal = (invoiceToEdit: Invoice) => {
        setEditingInvoice(invoiceToEdit);
        setFormData({ customerName: invoiceToEdit.customerName, amount: invoiceToEdit.amount, dueDate: formatDateForInput(invoiceToEdit.dueDate) });
        setIsEditModalOpen(true);
        setApiError(null);
    };
    const openStatusPopup = () => { setStatusPopupInvoiceId(''); setStatusPopupNewStatus('Pending'); setIsStatusPopupOpen(true); setApiError(null); };
    const closeModal = () => { setIsCreateModalOpen(false); setIsEditModalOpen(false); setIsStatusPopupOpen(false); setEditingInvoice(null); setFormData(initialFormData); setStatusPopupInvoiceId(''); setStatusPopupNewStatus('Pending'); setApiError(null); };


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
            <button onClick={() => { setIsAuthenticated(false); /* Clear other state if needed */ }} style={{ float: 'right', backgroundColor: '#6c757d', color: 'white', marginBottom: '10px' }} className="action-button"> Logout </button>
            <h1>Invoice Management</h1>
            <div className="invoice-actions">
                 <button onClick={openCreateModal} className="action-button create-button"> + Create New Invoice </button>
                 <button onClick={openStatusPopup} className="action-button status-button"> Edit Invoice Status by ID </button>
            </div>
            {isLoading && <p className="loading-message">Loading invoices...</p>}
            {/* Display general API errors outside modals */}
            {apiError && !isCreateModalOpen && !isEditModalOpen && !isStatusPopupOpen &&
                <p className="api-error-message" style={{ color: 'red', border: '1px solid red', padding: '10px', marginTop: '10px' }}>
                    Error: {apiError}
                </p>
            }
            {!isLoading && ( // Don't show table if loading
                <div className="invoice-list">
                    <h2>Invoices</h2>
                    {invoices.length === 0 && !apiError ? ( <p>No invoices found. Create one!</p> ) : invoices.length > 0 ? ( // Only show table if invoices exist
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Customer</th>
                                    <th>Amount</th>
                                    <th>Due Date</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map(invoice => (
                                    <tr key={invoice.id}>
                                        <td style={{ wordBreak: 'break-all', maxWidth: '250px' }}>{invoice.id}</td>
                                        <td>{invoice.customerName}</td>
                                        <td>${invoice.amount.toFixed(2)}</td>
                                        <td>{invoice.dueDate}</td>
                                        <td> <span className={`status-badge status-${invoice.status.toLowerCase()}`}> {invoice.status} </span> </td>
                                        <td>
                                            <button onClick={() => openEditModal(invoice)} className="table-button edit">Edit</button>
                                            <button onClick={() => handleDeleteInvoice(invoice.id)} className="table-button delete">Delete</button>
                                            <button onClick={() => handlePrintInvoice(invoice)} className="table-button print" style={{backgroundColor: '#0dcaf0', color: 'white'}}>Print</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : null /* Don't render table if error and no invoices */}
                </div>
            )}

            {/* --- Modals --- */}
            {isCreateModalOpen && (
                <div className="modal-overlay" onClick={closeModal}>
                     <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                         <h2>Create New Invoice</h2>
                         {/* Display API error specific to this modal */}
                         {apiError && <p className="api-error-message" style={{color: 'red', marginBottom: '15px'}}>{apiError}</p>}
                         <form onSubmit={handleCreateInvoiceSubmit}>
                             <div className="form-group"> <label htmlFor="customerName">Customer Name:</label> <input type="text" id="customerName" name="customerName" value={formData.customerName} onChange={handleFormChange} required /> </div>
                             <div className="form-group"> <label htmlFor="amount">Amount ($):</label> <input type="number" id="amount" name="amount" value={formData.amount} onChange={handleFormChange} required min="0.01" step="0.01" /> </div>
                             <div className="form-group"> <label htmlFor="dueDate">Due Date:</label> <input type="date" id="dueDate" name="dueDate" value={formData.dueDate} onChange={handleFormChange} required /> </div>
                             <div className="modal-actions"> <button type="submit" className="action-button create-button">Create Invoice</button> <button type="button" onClick={closeModal} style={{backgroundColor: '#6c757d', color: 'white'}}>Cancel</button> </div>
                         </form>
                     </div>
                </div>
            )}
             {isEditModalOpen && editingInvoice && (
                <div className="modal-overlay" onClick={closeModal}>
                     <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                         <h2>Edit Invoice (ID: {editingInvoice.id.substring(0,8)}...)</h2>
                         {apiError && <p className="api-error-message" style={{color: 'red', marginBottom: '15px'}}>{apiError}</p>}
                         <form onSubmit={handleEditInvoiceSubmit}>
                              <div className="form-group"> <label htmlFor="editCustomerName">Customer Name:</label> <input type="text" id="editCustomerName" name="customerName" value={formData.customerName} onChange={handleFormChange} required /> </div>
                              <div className="form-group"> <label htmlFor="editAmount">Amount ($):</label> <input type="number" id="editAmount" name="amount" value={formData.amount} onChange={handleFormChange} required min="0.01" step="0.01" /> </div>
                              <div className="form-group"> <label htmlFor="editDueDate">Due Date:</label> <input type="date" id="editDueDate" name="dueDate" value={formData.dueDate} onChange={handleFormChange} required /> </div>
                             <div className="modal-actions"> <button type="submit" className="action-button edit-button" style={{backgroundColor: '#17a2b8', color: 'white'}}>Save Changes</button> <button type="button" onClick={closeModal} style={{backgroundColor: '#6c757d', color: 'white'}}>Cancel</button> </div>
                         </form>
                     </div>
                </div>
            )}
            {isStatusPopupOpen && (
                 <div className="modal-overlay" onClick={closeModal}>
                     <div className="modal-content status-popup" onClick={(e) => e.stopPropagation()}>
                         <h2>Edit Invoice Status</h2>
                         {apiError && <p className="api-error-message" style={{color: 'red', marginBottom: '15px'}}>{apiError}</p>}
                         <form onSubmit={handleUpdateStatusSubmit}>
                             <div className="form-group"> <label htmlFor="status-invoice-id">Invoice ID:</label> <input type="text" id="status-invoice-id" value={statusPopupInvoiceId} onChange={(e) => setStatusPopupInvoiceId(e.target.value)} placeholder="Enter full ID to edit" required style={{marginBottom: '10px'}} /> </div>
                             <div className="form-group"> <label htmlFor="status-new-status">New Status:</label> <select id="status-new-status" value={statusPopupNewStatus} onChange={(e) => setStatusPopupNewStatus(e.target.value as Invoice['status'])} required > <option value="Pending">Pending</option> <option value="Paid">Paid</option> <option value="Overdue">Overdue</option> </select> </div>
                             <div className="popup-actions"> <button type="submit" className="action-button status-button"> Update Status </button> <button type="button" onClick={closeModal} style={{backgroundColor: '#6c757d', color: 'white'}}>Cancel</button> </div>
                         </form>
                     </div>
                 </div>
            )}
        </div> // End invoice-manager-container
    );
};

export default InvoiceManagerPage;

