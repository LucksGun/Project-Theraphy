// src/InvoiceManagerPage.tsx
import React, { useState, useEffect, ChangeEvent, FormEvent, useCallback } from 'react';
import './InvoiceManagerPage.css'; // Make sure this CSS file exists and is styled

// --- Configuration ---
// <<< --- REPLACE with your actual Worker URL --- >>>
const WORKER_API_URL = 'YOUR_WORKER_URL_HERE';
// <<< --- REPLACE with the password set in Worker secrets --- >>>
const INVOICE_ACCESS_PASSWORD = 'YourStrongInvoicePassword!';

// --- Helper: Format Date for Input ---
const formatDateForInput = (isoDateString: string): string => {
    try {
        // Check if the string is already in YYYY-MM-DD format
        if (isoDateString && /^\d{4}-\d{2}-\d{2}$/.test(isoDateString)) {
            return isoDateString;
        }
        // Otherwise, try to parse and format
        const date = new Date(isoDateString);
        if (isNaN(date.getTime())) { // Check if date is valid
             console.warn("Invalid date string received:", isoDateString);
             return ''; // Return empty for invalid date
        }
        return date.toISOString().split('T')[0];
    } catch (e) {
        console.error("Error formatting date:", isoDateString, e);
        return ''; // Return empty on error
    }
};


// --- Data Structures ---
interface Invoice {
    id: string;
    customerName: string;
    amount: number;
    dueDate: string; // Storing as YYYY-MM-DD
    status: 'Pending' | 'Paid' | 'Overdue';
}

// Type for form data (omit id as it's generated on create)
type InvoiceFormData = Omit<Invoice, 'id' | 'status'>; // Status is set initially


// --- Component ---
const InvoiceManagerPage: React.FC = () => {
    // --- Password Auth State ---
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [enteredPassword, setEnteredPassword] = useState<string>('');
    const [authError, setAuthError] = useState<string | null>(null);

    // --- Invoice Data State ---
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [apiError, setApiError] = useState<string | null>(null);

    // --- Modal/Popup State ---
    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
    const [isStatusPopupOpen, setIsStatusPopupOpen] = useState<boolean>(false);
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null); // Holds the full invoice being edited

    // --- Form State (used for both Create and Edit) ---
    const initialFormData: InvoiceFormData = { customerName: '', amount: 0, dueDate: '' };
    const [formData, setFormData] = useState<InvoiceFormData>(initialFormData);

    // --- Status Popup State ---
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
                body: JSON.stringify({ action: 'invoiceGet' }) // Send action in body
            });

            const responseBodyText = await response.text(); // Read body once
            console.log("Fetch response status:", response.status);
            console.log("Fetch response body:", responseBodyText);


            if (!response.ok) {
                // Try to parse error from body, otherwise use status text
                 let errorMsg = `API Error: ${response.status}`;
                 try {
                     const errorData = JSON.parse(responseBodyText);
                     errorMsg = errorData.error || errorMsg;
                 } catch (parseError) {
                     errorMsg = `${errorMsg} ${responseBodyText}`; // Append raw text if JSON parse fails
                 }
                 throw new Error(errorMsg);
            }

            const data = JSON.parse(responseBodyText); // Parse the text we already read

            if (data.success && Array.isArray(data.invoices)) {
                setInvoices(data.invoices);
                console.log("Invoices loaded:", data.invoices.length);
            } else {
                throw new Error(data.error || 'API response format incorrect');
            }
        } catch (err: any) {
            console.error("Failed to fetch invoices:", err);
            setApiError(err.message);
            setInvoices([]); // Clear invoices on error
        } finally {
            setIsLoading(false);
        }
    }, [isAuthenticated]); // Dependency: only refetch if auth status changes

    // --- Initial Fetch on Authentication ---
    useEffect(() => {
        if (isAuthenticated) {
            fetchInvoices();
        } else {
            setInvoices([]); // Clear data if logged out
        }
    }, [isAuthenticated, fetchInvoices]);

    // --- Password Handlers ---
    const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
        setEnteredPassword(event.target.value);
        setAuthError(null);
    };

    const handlePasswordSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        // This comparison should ideally happen server-side via a login action
        if (enteredPassword === INVOICE_ACCESS_PASSWORD) {
            setIsAuthenticated(true);
            setAuthError(null);
            setEnteredPassword(''); // Clear password field
        } else {
            setAuthError('Incorrect password.');
            setIsAuthenticated(false);
        }
    };

    // --- Form Input Handler ---
     const handleFormChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = event.target;
        // Use a callback with setFormData to ensure we're working with the latest state
        setFormData(prev => ({
            ...prev,
            // Handle number input specifically, ensuring it's stored as number
            [name]: type === 'number' ? (value === '' ? 0 : parseFloat(value)) : value
        }));
    };


    // --- Invoice Action Handlers (API Calls) ---
    const handleCreateInvoiceSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setApiError(null);
        // Consider adding a specific loading state for the form submission
        console.log("Submitting new invoice:", formData);

        try {
            const response = await fetch(WORKER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Invoice-Password': INVOICE_ACCESS_PASSWORD,
                },
                // Send action and form data
                body: JSON.stringify({ action: 'invoiceCreate', ...formData })
            });

            const data = await response.json(); // Assume response is JSON
            console.log("Create response:", data);


            if (!response.ok || !data.success) {
                throw new Error(data.error || `API Error: ${response.status}`);
            }

            // Add the newly created invoice (returned from API) to the state
            // Ensure the returned invoice structure matches the Invoice interface
            if (data.invoice && data.invoice.id) {
                 setInvoices(prev => [...prev, data.invoice]);
            } else {
                 console.warn("Create successful, but invoice data missing in response. Refetching list.");
                 fetchInvoices(); // Refetch the list if create didn't return the object
            }

            closeModal(); // Close modal on success

        } catch (err: any) {
            console.error("Create Invoice Err:", err);
            setApiError(`Create failed: ${err.message}`);
            // Keep modal open on error so user can see the message/retry
        } finally {
             // Turn off specific loading state if used
        }
    };

    const handleDeleteInvoice = async (idToDelete: string) => {
        if (!window.confirm(`Are you sure you want to delete invoice ${idToDelete}?`)) {
            return;
        }
        setApiError(null);
        console.log("Deleting invoice:", idToDelete);

        try {
            const response = await fetch(WORKER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Invoice-Password': INVOICE_ACCESS_PASSWORD,
                },
                body: JSON.stringify({ action: 'invoiceDelete', invoiceId: idToDelete })
            });

             const data = await response.json();
             console.log("Delete response:", data);


             if (!response.ok || !data.success) {
                 throw new Error(data.error || `API Error: ${response.status}`);
             }

            // Remove from local state on success
            setInvoices(prevInvoices => prevInvoices.filter(inv => inv.id !== idToDelete));
            console.log("Invoice deleted successfully from state.");


        } catch (err: any) {
             console.error("Failed to delete invoice:", err);
             setApiError(`Delete failed: ${err.message}`);
        }
    };

     const handleEditInvoiceSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingInvoice) {
             console.error("Attempted to submit edit form without an editingInvoice set.");
             setApiError("Cannot save, no invoice selected for editing.");
             return;
        }

        setApiError(null);
        // Add specific form loading state if desired

        // Construct the full updated invoice object to send
        const updatedInvoiceData: Invoice = {
             id: editingInvoice.id, // Crucial: Include the ID
             customerName: formData.customerName,
             amount: formData.amount,
             dueDate: formData.dueDate,
             status: editingInvoice.status, // Keep the original status unless changed elsewhere
        };
        console.log("Submitting updated invoice:", updatedInvoiceData);


        try {
            const response = await fetch(WORKER_API_URL, {
                method: 'POST', // Using POST with action 'invoiceUpdate'
                headers: {
                    'Content-Type': 'application/json',
                    'X-Invoice-Password': INVOICE_ACCESS_PASSWORD,
                },
                // Send the action and the complete updated invoice object
                body: JSON.stringify({ action: 'invoiceUpdate', ...updatedInvoiceData })
            });

             const data = await response.json();
             console.log("Update response:", data);


             if (!response.ok || !data.success) {
                 throw new Error(data.error || `API Error: ${response.status}`);
             }

             // Update the invoice in the local state using data from API response
             if (data.invoice && data.invoice.id) {
                  setInvoices(prevInvoices =>
                      prevInvoices.map(inv =>
                         inv.id === data.invoice.id ? data.invoice : inv
                      )
                  );
             } else {
                 console.warn("Update successful, but updated invoice data missing. Refetching list.");
                 fetchInvoices(); // Refetch if needed
             }

             closeModal(); // Close modal on success

        } catch (err: any) {
            console.error("Update Invoice Err:", err);
            setApiError(`Update failed: ${err.message}`);
            // Keep modal open on error
        } finally {
             // Turn off specific loading state
        }
    };

    const handleUpdateStatusSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!statusPopupInvoiceId) {
             setApiError("Please enter an Invoice ID.");
             return;
        }
         // Optional: Check if ID exists locally first
         const invoiceExists = invoices.some(inv => inv.id === statusPopupInvoiceId);
         if (!invoiceExists) {
             setApiError(`Invoice with ID "${statusPopupInvoiceId}" not found locally.`);
             // You might still allow the API call, or stop here
             // return;
         }

         setApiError(null);
         console.log(`Updating status for ${statusPopupInvoiceId} to ${statusPopupNewStatus}`);


         try {
             const response = await fetch(WORKER_API_URL, {
                 method: 'POST',
                 headers: {
                     'Content-Type': 'application/json',
                     'X-Invoice-Password': INVOICE_ACCESS_PASSWORD,
                 },
                 body: JSON.stringify({
                     action: 'invoiceUpdateStatus',
                     invoiceId: statusPopupInvoiceId,
                     newStatus: statusPopupNewStatus // Send selected status
                 })
             });

             const data = await response.json();
             console.log("Update status response:", data);


             if (!response.ok || !data.success) {
                 throw new Error(data.error || `API Error: ${response.status}`);
             }

             // Update status in local state on success
             setInvoices(prevInvoices =>
                 prevInvoices.map(inv =>
                     inv.id === statusPopupInvoiceId ? { ...inv, status: statusPopupNewStatus } : inv
                 )
             );
             console.log(`Status updated locally for ${statusPopupInvoiceId}`);

             closeModal(); // Close popup on success

         } catch (err: any) {
              console.error("Update Status Err:", err);
              setApiError(`Status update failed: ${err.message}`);
              // Keep popup open on error
         }
    };


    // --- Modal Open/Close Handlers ---
    const openCreateModal = () => {
        setFormData(initialFormData); // Reset form when opening
        setIsCreateModalOpen(true);
        setApiError(null);
    };

     const openEditModal = (invoiceToEdit: Invoice) => {
        setEditingInvoice(invoiceToEdit); // Store the full invoice being edited
        // Pre-fill form data from the invoice being edited
        setFormData({
             customerName: invoiceToEdit.customerName,
             amount: invoiceToEdit.amount,
             // Ensure date is formatted correctly for the input type="date"
             dueDate: formatDateForInput(invoiceToEdit.dueDate)
        });
        setIsEditModalOpen(true);
        setApiError(null);
    };

    const openStatusPopup = () => {
        setStatusPopupInvoiceId(''); // Reset fields when opening
        setStatusPopupNewStatus('Pending');
        setIsStatusPopupOpen(true);
        setApiError(null);
    };

     const closeModal = () => {
         setIsCreateModalOpen(false);
         setIsEditModalOpen(false);
         setIsStatusPopupOpen(false);
         setEditingInvoice(null); // Clear the invoice being edited
         setFormData(initialFormData); // Reset the form
         setStatusPopupInvoiceId(''); // Reset status popup fields
         setStatusPopupNewStatus('Pending');
         setApiError(null); // Clear API errors when closing modals
     };


    // --- Render Password Prompt ---
    if (!isAuthenticated) {
        return (
            <div className="invoice-manager-password-container">
                <div className="invoice-manager-password-box">
                    <h2>Invoice Manager Access</h2>
                    <form onSubmit={handlePasswordSubmit}>
                        <div className="form-group">
                            <label htmlFor="invoice-manager-password">Password:</label>
                            <input
                                type="password"
                                id="invoice-manager-password"
                                value={enteredPassword}
                                onChange={handlePasswordChange}
                                required
                                autoFocus
                            />
                        </div>
                        {authError && <p className="password-error">{authError}</p>}
                        <button type="submit" className="submit-password-button">
                            Enter
                        </button>
                    </form>
                     <p className="password-note">Restricted Area.</p>
                </div>
            </div>
        );
    }

    // --- Render Invoice Manager UI ---
    return (
        <div className="invoice-manager-container">
            {/* Logout Button */}
            <button
                onClick={() => {
                    setIsAuthenticated(false);
                    // Optionally clear other sensitive state if needed
                }}
                style={{ float: 'right', backgroundColor: '#6c757d', color: 'white', marginBottom: '10px' }}
                className="action-button"
            >
                Logout
            </button>

            <h1>Invoice Management</h1>


            {/* Action Buttons */}
            <div className="invoice-actions">
                 <button onClick={openCreateModal} className="action-button create-button">
                    + Create New Invoice
                </button>
                 <button onClick={openStatusPopup} className="action-button status-button">
                    Edit Invoice Status by ID
                </button>
            </div>

             {/* Display Loading / API Errors */}
             {isLoading && <p className="loading-message">Loading invoices...</p>}
             {apiError && <p className="api-error-message">Error: {apiError}</p>}

            {/* Invoice List Table */}
            {!isLoading && !apiError && (
                <div className="invoice-list">
                    <h2>Invoices</h2>
                    {invoices.length === 0 ? (
                        <p>No invoices found. Create one!</p>
                    ) : (
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
                                        {/* Shorten ID display if too long, show full on hover */}
                                        <td title={invoice.id}>{invoice.id.substring(0, 8)}...</td>
                                        <td>{invoice.customerName}</td>
                                        {/* Format currency */}
                                        <td>${invoice.amount.toFixed(2)}</td>
                                        <td>{invoice.dueDate}</td>
                                        <td>
                                            {/* Add a class for styling based on status */}
                                            <span className={`status-badge status-${invoice.status.toLowerCase()}`}>
                                                {invoice.status}
                                            </span>
                                        </td>
                                        <td>
                                            <button onClick={() => openEditModal(invoice)} className="table-button edit">Edit</button>
                                            <button onClick={() => handleDeleteInvoice(invoice.id)} className="table-button delete">Delete</button>
                                            {/* TODO: Add Log Payment button/functionality if needed */}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* --- Modals --- */}

            {/* Create Invoice Modal */}
            {isCreateModalOpen && (
                <div className="modal-overlay" onClick={closeModal}> {/* Close on overlay click */}
                     <div className="modal-content" onClick={(e) => e.stopPropagation()}> {/* Prevent closing when clicking inside modal */}
                         <h2>Create New Invoice</h2>
                         {/* Display API error specific to this modal */}
                         {apiError && <p className="api-error-message" style={{color: 'red', marginBottom: '15px'}}>{apiError}</p>}
                         <form onSubmit={handleCreateInvoiceSubmit}> {/* Use specific submit handler */}
                             <div className="form-group">
                                 <label htmlFor="customerName">Customer Name:</label>
                                 <input type="text" id="customerName" name="customerName" value={formData.customerName} onChange={handleFormChange} required />
                             </div>
                             <div className="form-group">
                                 <label htmlFor="amount">Amount ($):</label>
                                 <input type="number" id="amount" name="amount" value={formData.amount} onChange={handleFormChange} required min="0.01" step="0.01" />
                             </div>
                             <div className="form-group">
                                 <label htmlFor="dueDate">Due Date:</label>
                                 <input type="date" id="dueDate" name="dueDate" value={formData.dueDate} onChange={handleFormChange} required />
                             </div>
                             <div className="modal-actions">
                                 <button type="submit" className="action-button create-button">Create Invoice</button>
                                 <button type="button" onClick={closeModal} style={{backgroundColor: '#6c757d', color: 'white'}}>Cancel</button>
                             </div>
                         </form>
                     </div>
                </div>
            )}

             {/* Edit Invoice Modal */}
             {isEditModalOpen && editingInvoice && (
                <div className="modal-overlay" onClick={closeModal}>
                     <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                         <h2>Edit Invoice (ID: {editingInvoice.id.substring(0,8)}...)</h2>
                         {apiError && <p className="api-error-message" style={{color: 'red', marginBottom: '15px'}}>{apiError}</p>}
                         {/* Use specific submit handler */}
                         <form onSubmit={handleEditInvoiceSubmit}>
                              <div className="form-group">
                                 <label htmlFor="editCustomerName">Customer Name:</label>
                                 {/* Use formData state which is pre-filled on open */}
                                 <input type="text" id="editCustomerName" name="customerName" value={formData.customerName} onChange={handleFormChange} required />
                             </div>
                             <div className="form-group">
                                 <label htmlFor="editAmount">Amount ($):</label>
                                 <input type="number" id="editAmount" name="amount" value={formData.amount} onChange={handleFormChange} required min="0.01" step="0.01" />
                             </div>
                             <div className="form-group">
                                 <label htmlFor="editDueDate">Due Date:</label>
                                 <input type="date" id="editDueDate" name="dueDate" value={formData.dueDate} onChange={handleFormChange} required />
                             </div>
                             {/* Note: Status is not edited in this form, use the status popup */}
                             <div className="modal-actions">
                                 <button type="submit" className="action-button edit-button" style={{backgroundColor: '#17a2b8', color: 'white'}}>Save Changes</button>
                                 <button type="button" onClick={closeModal} style={{backgroundColor: '#6c757d', color: 'white'}}>Cancel</button>
                             </div>
                         </form>
                     </div>
                </div>
            )}


            {/* Edit Status Popup */}
            {isStatusPopupOpen && (
                 <div className="modal-overlay" onClick={closeModal}>
                     <div className="modal-content status-popup" onClick={(e) => e.stopPropagation()}>
                         <h2>Edit Invoice Status</h2>
                         {apiError && <p className="api-error-message" style={{color: 'red', marginBottom: '15px'}}>{apiError}</p>}
                         {/* Use specific submit handler */}
                         <form onSubmit={handleUpdateStatusSubmit}>
                             <div className="form-group">
                                <label htmlFor="status-invoice-id">Invoice ID:</label>
                                <input
                                    type="text"
                                    id="status-invoice-id"
                                    value={statusPopupInvoiceId}
                                    onChange={(e) => setStatusPopupInvoiceId(e.target.value)}
                                    placeholder="Enter full ID to edit"
                                    required
                                    style={{marginBottom: '10px'}} // Add spacing
                                 />
                             </div>
                             <div className="form-group">
                                <label htmlFor="status-new-status">New Status:</label>
                                <select
                                    id="status-new-status"
                                    value={statusPopupNewStatus}
                                    onChange={(e) => setStatusPopupNewStatus(e.target.value as Invoice['status'])}
                                    required
                                >
                                    <option value="Pending">Pending</option>
                                    <option value="Paid">Paid</option>
                                    <option value="Overdue">Overdue</option>
                                </select>
                             </div>
                             <div className="popup-actions">
                                <button type="submit" className="action-button status-button"> Update Status </button>
                                <button type="button" onClick={closeModal} style={{backgroundColor: '#6c757d', color: 'white'}}>Cancel</button>
                            </div>
                         </form>
                     </div>
                 </div>
            )}

        </div> // End invoice-manager-container
    );
};

export default InvoiceManagerPage;
