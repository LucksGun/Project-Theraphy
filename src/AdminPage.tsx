// src/AdminPage.tsx - Pass staffKey to fetchAdminData calls
import { useState, useEffect, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import './admin.css';
import {
    GeminiModel, Persona, UserKeyInfo, AVAILABLE_PERSONAS,
    ALL_AVAILABLE_MODELS_FRONTEND, WORKER_URL, ApiRequestBody
} from './App';

function AdminPage() {
    const navigate = useNavigate();
    const [authenticatedStaffKey, setAuthenticatedStaffKey] = useState<string | null>(null);
    const [adminUserKeysList, setAdminUserKeysList] = useState<UserKeyInfo[]>([]);
    const [adminRestrictedModelsList, setAdminRestrictedModelsList] = useState<GeminiModel[]>([]);
    const [adminRestrictedPersonasList, setAdminRestrictedPersonasList] = useState<Persona[]>([]);
    const [newKeyUsername, setNewKeyUsername] = useState<string>('');
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editUsernameValue, setEditUsernameValue] = useState<string>('');
    const [isAdminLoading, setIsAdminLoading] = useState<boolean>(true);
    const [adminError, setAdminError] = useState<string | null>(null);
    const [adminSuccess, setAdminSuccess] = useState<string | null>(null);

    // Fetch Admin Data Function
    const fetchAdminData = async (staffKey: string | null) => { // Accepts key
        if (!staffKey) return;
        console.log("AdminPage: Fetching data...");
        setIsAdminLoading(true); setAdminError(null); setAdminSuccess(null);
        try {
            const listKeysBody: ApiRequestBody = { action: 'adminListKeys', staffKey: staffKey };
            const getRestrictionsBody: ApiRequestBody = { action: 'adminGetRestrictions', staffKey: staffKey };
            const [keysRes, restrictRes] = await Promise.all([
                fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(listKeysBody) }),
                fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getRestrictionsBody) })
            ]);
            const keysData = await keysRes.json().catch(() => ({ error: 'Invalid JSON keys' })); if (!keysRes.ok || !keysData.success) throw new Error(keysData?.error || 'Failed fetch keys.'); setAdminUserKeysList(keysData.keys || []);
            const restrictData = await restrictRes.json().catch(() => ({ error: 'Invalid JSON restrictions' })); if (!restrictRes.ok || !restrictData.success) throw new Error(restrictData?.error || 'Failed fetch restrictions.'); setAdminRestrictedModelsList(restrictData.restrictedModels || []); setAdminRestrictedPersonasList(restrictData.restrictedPersonas || []);
            setAdminError(null);
        } catch (e) { setAdminError(e instanceof Error ? e.message : "Failed load admin data."); setAdminUserKeysList([]); setAdminRestrictedModelsList([]); setAdminRestrictedPersonasList([]); } finally { setIsAdminLoading(false); }
    };

    // Get Key & Initial Fetch
    useEffect(() => {
        const keyFromSession = sessionStorage.getItem('staffKey');
        if (!keyFromSession) { navigate('/'); } else { setAuthenticatedStaffKey(keyFromSession); fetchAdminData(keyFromSession); } // Fetch immediately
    }, [navigate]); // Removed dependency on authenticatedStaffKey to prevent potential loop if fetch fails

    // Success Message Timer
    useEffect(() => { let timer: NodeJS.Timeout | null = null; if (adminSuccess) { timer = setTimeout(() => setAdminSuccess(null), 3500); } return () => { if (timer) clearTimeout(timer); }; }, [adminSuccess]);

    // --- Handlers ---
    const handleToggleUserKeyStatus = async (key: string, status: 'active' | 'inactive') => { if (!authenticatedStaffKey) return; const nS=status==='active'?'inactive':'active'; const kS=key.substring(0,8); if(!window.confirm(`Set key "${kS}..." to ${nS}?`))return; setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null); const requestBody: ApiRequestBody = {action:'adminUpdateKeyStatus',staffKey:authenticatedStaffKey,key:key,newStatus:nS}; try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)}); const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Update failed: ${r.status}`);setAdminSuccess(d.message||"Status updated.");}catch(e){setAdminError(e instanceof Error?e.message:"Failed update.");}finally{ fetchAdminData(authenticatedStaffKey); } }; // Pass key
    const handleToggleModelRestriction = async (val: GeminiModel) => { if (!authenticatedStaffKey) return; const isR=adminRestrictedModelsList.includes(val); const act=isR?"make public":"make restricted"; if(!window.confirm(`Make model "${val}" ${act}?`))return; const nL=isR?adminRestrictedModelsList.filter(m=>m!==val):[...adminRestrictedModelsList,val]; setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null); const requestBody: ApiRequestBody = {action:'adminSetRestrictedModels',staffKey:authenticatedStaffKey,models:nL}; try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)}); const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Save failed: ${r.status}`);setAdminSuccess(d.message||"Models updated.");}catch(e){setAdminError(e instanceof Error?e.message:"Failed save.");}finally{ fetchAdminData(authenticatedStaffKey); } }; // Pass key
    const handleTogglePersonaRestriction = async (val: Persona) => { if (!authenticatedStaffKey) return; const isR=adminRestrictedPersonasList.includes(val); const pI=AVAILABLE_PERSONAS.find(p=>p.value===val); const pL=pI?pI.label:val; const act=isR?"make public":"make restricted"; if(!window.confirm(`Make persona "${pL}" ${act}?`))return; const nL=isR?adminRestrictedPersonasList.filter(p=>p!==val):[...adminRestrictedPersonasList,val]; setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null); const requestBody: ApiRequestBody = {action:'adminSetRestrictedPersonas',staffKey:authenticatedStaffKey,personas:nL}; try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)}); const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Save failed: ${r.status}`);setAdminSuccess(d.message||"Personas updated.");}catch(e){setAdminError(e instanceof Error?e.message:"Failed save.");}finally{ fetchAdminData(authenticatedStaffKey); } }; // Pass key
    const handleAddNewKey = async () => { if (!authenticatedStaffKey) return; setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null); const uTS=newKeyUsername.trim()||null; const requestBody: ApiRequestBody = {action:'adminAddKey',staffKey:authenticatedStaffKey,username:uTS}; try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)}); const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Add failed: ${r.status}`);setAdminSuccess(d.message||"Key added!");setNewKeyUsername('');}catch(e){setAdminError(e instanceof Error?e.message:"Failed add key.");}finally{ fetchAdminData(authenticatedStaffKey); } }; // Pass key
    const handleDeleteKey = async (keyToDelete: string) => { if (!authenticatedStaffKey) return; const kS=keyToDelete.substring(0,8); if(!window.confirm(`DELETE key "${kS}..."? Cannot undo.`))return; setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null); const requestBody: ApiRequestBody = {action:'adminDeleteKey',staffKey:authenticatedStaffKey,key:keyToDelete}; try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)}); const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Delete failed: ${r.status}`);setAdminSuccess(d.message||"Key deleted!");}catch(e){setAdminError(e instanceof Error?e.message:"Failed delete key.");}finally{ fetchAdminData(authenticatedStaffKey); } }; // Pass key
    const handleCopyKey = async (keyToCopy: string) => { try{await navigator.clipboard.writeText(keyToCopy);setAdminSuccess(`Key copied!`);}catch(e){console.error("Copy failed:",e);setAdminError("Failed to copy key.");}};
    const handleStartEdit = (key: string, currentUsername: string | null) => { setEditingKey(key);setEditUsernameValue(currentUsername||'');};
    const handleCancelEdit = () => { setEditingKey(null);setEditUsernameValue('');};
    const handleSaveUsername = async () => { if(editingKey===null || !authenticatedStaffKey)return; const keyToEdit=editingKey;const usernameToSend=editUsernameValue.trim()||null;setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null); const requestBody: ApiRequestBody = {action:'adminEditUsername',staffKey:authenticatedStaffKey,key:keyToEdit,newUsername:usernameToSend}; try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)});const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok) throw new Error(d?.error||`Update failed: ${r.status}`); setAdminSuccess(d.message||"Username updated!");setEditingKey(null);setEditUsernameValue('');}catch(e){setAdminError(e instanceof Error?e.message:"Failed update username.");}finally{ fetchAdminData(authenticatedStaffKey); } }; // Pass key
    const handleNewKeyUsernameChange = (e:ChangeEvent<HTMLInputElement>)=>{setNewKeyUsername(e.target.value);};
    const handleEditUsernameChange = (e:ChangeEvent<HTMLInputElement>)=>{setEditUsernameValue(e.target.value);};
    const handleLogout = () => { sessionStorage.removeItem('staffKey'); navigate('/'); };

    // --- Render Logic ---
    if (isAdminLoading && !adminUserKeysList.length && !adminRestrictedModelsList.length && !adminRestrictedPersonasList.length && !adminError) { return <div style={{ padding: '40px', textAlign: 'center', fontSize: '1.2em', color: '#666' }}>Loading Admin Data...</div>; }
    if (!authenticatedStaffKey && !isAdminLoading) { return <div style={{ padding: '40px', textAlign: 'center', color: 'red' }}>Error: Not authenticated. Please log in again via the main page settings.</div>; }


    return (
        <div className="admin-page-container">
             <div className="admin-page-header">
                <h1>Staff Admin Panel</h1>
                 <button onClick={handleLogout} className="admin-logout-button">Logout</button>
             </div>

             <div className="staff-admin-section">
                {/* Feedback Area */}
                <div style={{minHeight: '40px'}}>
                    {adminSuccess && <p className="admin-feedback success">{adminSuccess}</p>}
                    {adminError && <p className="admin-feedback error">{adminError}</p>}
                </div>

                <h4>Manage User Access Keys</h4>
                <div className="admin-data-section">
                    {(isAdminLoading && !adminUserKeysList.length && !adminError) && <p className="admin-loading-text">Loading keys...</p>}
                    {(!adminUserKeysList.length && !isAdminLoading && !adminError) && <p>No keys found.</p>}
                    {/* Render table only if there's data OR if it's not loading and no error */}
                    {(adminUserKeysList.length > 0 || (!isAdminLoading && !adminError)) && (
                         <div className="user-keys-list">
                            <table>
                                <thead><tr><th>Key</th><th>Username</th><th>Status</th><th>Created</th><th className="actions-column">Actions</th></tr></thead>
                                <tbody>
                                    {adminUserKeysList.map(k => (
                                    <tr key={k.key} className={editingKey === k.key ? 'editing-row' : ''}>
                                        <td> <div className="key-cell-content"><code>{k.key}</code> <button onClick={() => handleCopyKey(k.key)} className="copy-button" title="Copy Key">📋</button> </div></td>
                                        <td> {editingKey === k.key ? ( <input type="text" value={editUsernameValue} onChange={handleEditUsernameChange} className="settings-input inline-edit-input" autoFocus onKeyDown={(e) => { if(e.key==='Enter') handleSaveUsername(); else if (e.key==='Escape') handleCancelEdit(); }}/> ) : ( k.username || <span className="no-username"><em>(none)</em></span> )} </td>
                                        <td><span className={`status-${k.status}`}>{k.status}</span></td>
                                        <td>{new Date(k.created_at).toLocaleDateString()}</td>
                                        <td> <div className="action-buttons-cell"> {editingKey === k.key ? ( <> <button onClick={handleSaveUsername} className="save-button" disabled={isAdminLoading}>✔️ Save</button> <button onClick={handleCancelEdit} className="cancel-button" disabled={isAdminLoading}>❌ Cancel</button> </> ) : ( <> <button onClick={()=>handleToggleUserKeyStatus(k.key,k.status)} className={`key-status-toggle-button ${k.status==='active'?'deactivate':'activate'}`} disabled={isAdminLoading || !!editingKey}>{k.status==='active'?'Deactivate':'Activate'}</button> <button onClick={()=>handleStartEdit(k.key, k.username)} className="edit-button" disabled={isAdminLoading || !!editingKey}>✏️</button> <button onClick={()=>handleDeleteKey(k.key)} className="delete-button" disabled={isAdminLoading || !!editingKey} title={`Delete key`}>🗑️</button> </> )} </div> </td>
                                    </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                     <div className="add-key-section">
                        <h5>Add New Key</h5>
                        <div className="add-key-form">
                            <div className="settings-option" style={{ flexGrow: 1 }}> <label htmlFor="new-key-username">Username (Optional):</label> <input type="text" id="new-key-username" className="settings-input" value={newKeyUsername} onChange={handleNewKeyUsernameChange} placeholder="Assign username (optional)" disabled={isAdminLoading || !!editingKey}/> </div>
                            <button onClick={handleAddNewKey} className="add-key-button" disabled={isAdminLoading || !!editingKey}> {isAdminLoading ? 'Adding...' : '+ Add Key'} </button>
                        </div>
                    </div>
                </div>

                <hr className="staff-separator" />
                <h4>Manage Restricted Models</h4>
                <div className="admin-data-section">
                     {(isAdminLoading && !adminRestrictedModelsList.length && !adminError) && <p className="admin-loading-text">Loading models...</p>}
                    {(!isAdminLoading && !adminError) && ( <div className="restricted-items-list"> <p className="restriction-description">Toggle models requiring access key.</p> {ALL_AVAILABLE_MODELS_FRONTEND.map(mInfo => { const isRestricted = adminRestrictedModelsList.includes(mInfo.value); return ( <div key={mInfo.value} className="restriction-item"> <span>{mInfo.label} (<code>{mInfo.value}</code>)</span> <button onClick={()=>handleToggleModelRestriction(mInfo.value)} className={`restriction-toggle-button ${isRestricted?'deactivate':'activate'}`} disabled={isAdminLoading || !!editingKey}>{isRestricted ? 'Restricted ✔':'Public'}</button> </div> ); })} </div> )}
                </div>

                <hr className="staff-separator" />
                <h4>Manage Restricted Personas</h4>
                <div className="admin-data-section">
                     {(isAdminLoading && !adminRestrictedPersonasList.length && !adminError) && <p className="admin-loading-text">Loading personas...</p>}
                     {(!isAdminLoading && !adminError) && ( <div className="restricted-items-list"> <p className="restriction-description">Toggle personas requiring access key.</p> {AVAILABLE_PERSONAS.map(pInfo => { const isRestricted = adminRestrictedPersonasList.includes(pInfo.value); return ( <div key={pInfo.value} className="restriction-item"> <span>{pInfo.emoji} {pInfo.label} (<code>{pInfo.value}</code>)</span> <button onClick={()=>handleTogglePersonaRestriction(pInfo.value)} className={`restriction-toggle-button ${isRestricted ? 'deactivate' : 'activate'}`} disabled={isAdminLoading || !!editingKey}>{isRestricted ? 'Restricted ✔' : 'Public'}</button> </div> ); })} </div> )}
                </div>
             </div>
        </div>
    );
}

export default AdminPage;