// src/AdminPage.tsx - Fixed unused ApiRequestBody type
import { useState, useEffect, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';
// Import necessary types and constants from App.tsx or a shared types file
import {
    GeminiModel, Persona, UserKeyInfo, AVAILABLE_PERSONAS,
    ALL_AVAILABLE_MODELS_FRONTEND, WORKER_URL, ApiRequestBody // Ensure ApiRequestBody is imported
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
    const [isAdminLoading, setIsAdminLoading] = useState<boolean>(false);
    const [adminError, setAdminError] = useState<string | null>(null);
    const [adminSuccess, setAdminSuccess] = useState<string | null>(null);

    useEffect(() => {
        const keyFromSession = sessionStorage.getItem('staffKey');
        if (!keyFromSession) {
            console.error("AdminPage: No staff key found. Redirecting.");
            navigate('/');
        } else {
            setAuthenticatedStaffKey(keyFromSession);
        }
    }, [navigate]);

    const fetchAdminData = async () => {
        if (!authenticatedStaffKey) return;
        console.log("AdminPage: Fetching data...");
        setIsAdminLoading(true); setAdminError(null); setAdminSuccess(null);
        setAdminUserKeysList([]); setAdminRestrictedModelsList([]); setAdminRestrictedPersonasList([]);
        try {
            const listKeysBody: ApiRequestBody = { action: 'adminListKeys', staffKey: authenticatedStaffKey };
            const getRestrictionsBody: ApiRequestBody = { action: 'adminGetRestrictions', staffKey: authenticatedStaffKey };

            const [keysRes, restrictRes] = await Promise.all([
                fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(listKeysBody) }),
                fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getRestrictionsBody) })
            ]);
            const keysData = await keysRes.json().catch(() => ({ error: 'Invalid JSON keys' })); if (!keysRes.ok || !keysData.success) throw new Error(keysData?.error || 'Failed fetch keys.'); setAdminUserKeysList(keysData.keys || []);
            const restrictData = await restrictRes.json().catch(() => ({ error: 'Invalid JSON restrictions' })); if (!restrictRes.ok || !restrictData.success) throw new Error(restrictData?.error || 'Failed fetch restrictions.'); setAdminRestrictedModelsList(restrictData.restrictedModels || []); setAdminRestrictedPersonasList(restrictData.restrictedPersonas || []);
        } catch (e) { setAdminError(e instanceof Error ? e.message : "Failed load admin data."); } finally { setIsAdminLoading(false); }
    };

    useEffect(() => { if (authenticatedStaffKey) { fetchAdminData(); } }, [authenticatedStaffKey]);
    useEffect(() => { let timer: NodeJS.Timeout | null = null; if (adminSuccess) { timer = setTimeout(() => setAdminSuccess(null), 3000); } return () => { if (timer) clearTimeout(timer); }; }, [adminSuccess]);

    const handleToggleUserKeyStatus = async (key: string, status: 'active' | 'inactive') => {
        if (!authenticatedStaffKey) return; const nS=status==='active'?'inactive':'active'; const kS=key.substring(0,8); if(!window.confirm(`Set key "${kS}..." to ${nS}?`))return; setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null);
        const requestBody: ApiRequestBody = {action:'adminUpdateKeyStatus',staffKey:authenticatedStaffKey,key:key,newStatus:nS};
        try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)}); const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Update failed: ${r.status}`);setAdminSuccess(d.message||"Status updated.");}catch(e){setAdminError(e instanceof Error?e.message:"Failed update.");}finally{fetchAdminData();}
    };
    const handleToggleModelRestriction = async (val: GeminiModel) => {
        if (!authenticatedStaffKey) return; const isR=adminRestrictedModelsList.includes(val); const act=isR?"make public":"make restricted"; if(!window.confirm(`Make model "${val}" ${act}?`))return; const nL=isR?adminRestrictedModelsList.filter(m=>m!==val):[...adminRestrictedModelsList,val]; setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null);
        const requestBody: ApiRequestBody = {action:'adminSetRestrictedModels',staffKey:authenticatedStaffKey,models:nL};
        try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)}); const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Save failed: ${r.status}`);setAdminSuccess(d.message||"Models updated.");}catch(e){setAdminError(e instanceof Error?e.message:"Failed save.");}finally{fetchAdminData();}
    };
    const handleTogglePersonaRestriction = async (val: Persona) => {
        if (!authenticatedStaffKey) return; const isR=adminRestrictedPersonasList.includes(val); const pI=AVAILABLE_PERSONAS.find(p=>p.value===val); const pL=pI?pI.label:val; const act=isR?"make public":"make restricted"; if(!window.confirm(`Make persona "${pL}" ${act}?`))return; const nL=isR?adminRestrictedPersonasList.filter(p=>p!==val):[...adminRestrictedPersonasList,val]; setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null);
        const requestBody: ApiRequestBody = {action:'adminSetRestrictedPersonas',staffKey:authenticatedStaffKey,personas:nL};
        try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)}); const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Save failed: ${r.status}`);setAdminSuccess(d.message||"Personas updated.");}catch(e){setAdminError(e instanceof Error?e.message:"Failed save.");}finally{fetchAdminData();}
    };
    const handleAddNewKey = async () => {
        if (!authenticatedStaffKey) return; setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null); const uTS=newKeyUsername.trim()||null;
        const requestBody: ApiRequestBody = {action:'adminAddKey',staffKey:authenticatedStaffKey,username:uTS};
        try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)}); const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Add failed: ${r.status}`);setAdminSuccess(d.message||"Key added!");setNewKeyUsername('');}catch(e){setAdminError(e instanceof Error?e.message:"Failed add key.");}finally{fetchAdminData();}
    };
    const handleDeleteKey = async (keyToDelete: string) => {
        if (!authenticatedStaffKey) return; const kS=keyToDelete.substring(0,8); if(!window.confirm(`DELETE key "${kS}..."? Cannot undo.`))return; setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null);
        const requestBody: ApiRequestBody = {action:'adminDeleteKey',staffKey:authenticatedStaffKey,key:keyToDelete};
        try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)}); const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Delete failed: ${r.status}`);setAdminSuccess(d.message||"Key deleted!");}catch(e){setAdminError(e instanceof Error?e.message:"Failed delete key.");}finally{fetchAdminData();}
    };
    const handleCopyKey = async (keyToCopy: string) => { try{await navigator.clipboard.writeText(keyToCopy);setAdminSuccess(`Key copied!`);}catch(e){console.error("Copy failed:",e);setAdminError("Failed to copy key.");}};
    const handleStartEdit = (key: string, currentUsername: string | null) => { setEditingKey(key);setEditUsernameValue(currentUsername||'');};
    const handleCancelEdit = () => { setEditingKey(null);setEditUsernameValue('');};
    const handleSaveUsername = async () => {
        if(editingKey===null || !authenticatedStaffKey)return; const keyToEdit=editingKey;const usernameToSend=editUsernameValue.trim()||null;setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null);
        const requestBody: ApiRequestBody = {action:'adminEditUsername',staffKey:authenticatedStaffKey,key:keyToEdit,newUsername:usernameToSend};
        try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)});const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok) throw new Error(d?.error||`Update failed: ${r.status}`); setAdminSuccess(d.message||"Username updated!");setEditingKey(null);setEditUsernameValue('');}catch(e){setAdminError(e instanceof Error?e.message:"Failed update username.");}finally{fetchAdminData();}
    };
    const handleNewKeyUsernameChange = (e:ChangeEvent<HTMLInputElement>)=>{setNewKeyUsername(e.target.value);};
    const handleEditUsernameChange = (e:ChangeEvent<HTMLInputElement>)=>{setEditUsernameValue(e.target.value);};
    const handleLogout = () => { sessionStorage.removeItem('staffKey'); navigate('/'); };

    if (!authenticatedStaffKey) { return <div style={{ padding: '20px', textAlign: 'center' }}>Authenticating...</div>; }

    return (
        <div style={{ padding: '20px', maxWidth: '1100px', margin: '20px auto' }}>
             <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px'}}>
                <h1>Staff Admin Panel</h1>
                 <button onClick={handleLogout} className="close-settings-button" style={{width: 'auto', marginTop: 0, padding: '8px 15px'}}>Logout</button>
             </div>
             <div className="staff-admin-section">
                {adminSuccess && <p className="key-valid" style={{textAlign:'center', marginBottom:'15px', padding:'8px', backgroundColor: '#d1e7dd', borderRadius:'4px'}}>{adminSuccess}</p>}
                {adminError && <p className="staff-error" style={{marginBottom:'15px'}}>{adminError}</p>}

                <h4>Manage User Access Keys</h4>
                <div className="admin-data-section">
                    {isAdminLoading && !adminUserKeysList.length && <p>Loading keys...</p>}
                    {!isAdminLoading && !adminError && adminUserKeysList.length === 0 && <p>No keys found.</p>}
                    {adminUserKeysList.length > 0 && (
                         <div className="user-keys-list">
                            <table>
                                <thead><tr><th>Key</th><th>Username</th><th>Status</th><th>Created</th><th style={{width: '210px'}}>Actions</th></tr></thead>
                                <tbody>
                                    {adminUserKeysList.map(k => (
                                    <tr key={k.key}>
                                        <td> <div style={{display:'flex', alignItems:'center', gap:'5px'}}><code style={{ wordBreak: 'break-all' }}>{k.key}</code> <button onClick={() => handleCopyKey(k.key)} title="Copy Key" style={{background:'none', border:'none', cursor:'pointer', fontSize:'0.9em', padding:'0 3px'}}>📋</button> </div></td>
                                        <td> {editingKey === k.key ? ( <input type="text" value={editUsernameValue} onChange={handleEditUsernameChange} className="settings-input" style={{ padding: '4px 6px', fontSize: '0.9em', height: 'auto' }} autoFocus onKeyDown={(e) => { if(e.key==='Enter') handleSaveUsername(); else if (e.key==='Escape') handleCancelEdit(); }}/> ) : ( k.username || <span style={{color:'#888'}}><em>(none)</em></span> )} </td>
                                        <td><span style={{color: k.status==='active'?'var(--key-valid-color)':'var(--key-invalid-color)', fontWeight:500}}>{k.status}</span></td>
                                        <td>{new Date(k.created_at).toLocaleDateString()}</td>
                                        <td> <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}> {editingKey === k.key ? ( <> <button onClick={handleSaveUsername} className="key-status-toggle-button activate" disabled={isAdminLoading} style={{flexGrow:1}}>Save</button> <button onClick={handleCancelEdit} className="key-status-toggle-button deactivate" disabled={isAdminLoading} style={{flexGrow:1, backgroundColor: '#eee', borderColor:'#ccc', color:'#555'}}>Cancel</button> </> ) : ( <> <button onClick={()=>handleToggleUserKeyStatus(k.key,k.status)} className={`key-status-toggle-button ${k.status==='active'?'deactivate':'activate'}`} disabled={isAdminLoading || !!editingKey}>{k.status==='active'?'Deactivate':'Activate'}</button> <button onClick={()=>handleStartEdit(k.key, k.username)} className="key-status-toggle-button activate" style={{backgroundColor:'#e9ecef', borderColor:'#dee2e6', color:'#495057', padding:'4px 6px'}} disabled={isAdminLoading || !!editingKey}>✏️</button> <button onClick={()=>handleDeleteKey(k.key)} className="key-status-toggle-button deactivate" disabled={isAdminLoading || !!editingKey} title={`Delete key`} style={{ flexGrow: 0, padding: '4px 6px'}}>🗑️</button> </> )} </div> </td>
                                    </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                     <div className="add-key-section" style={{ marginTop: '20px', padding: '15px', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: '#fdfdfd'}}>
                        <h5>Add New Key</h5>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                            <div className="settings-option" style={{ flexGrow: 1 }}> <label htmlFor="new-key-username" style={{marginBottom:'2px'}}>Username (Optional):</label> <input type="text" id="new-key-username" className="settings-input" value={newKeyUsername} onChange={handleNewKeyUsernameChange} placeholder="Assign a username" disabled={isAdminLoading || !!editingKey}/> </div>
                            <button onClick={handleAddNewKey} className="staff-login-button" disabled={isAdminLoading || !!editingKey} style={{ flexShrink: 0, height:'35px', alignSelf:'flex-end', marginBottom:'0px'}}> {isAdminLoading ? 'Adding...' : '+ Add Key'} </button>
                        </div>
                    </div>
                </div>

                <hr className="staff-separator" />
                <h4>Manage Restricted Models</h4>
                <div className="admin-data-section">
                    {isAdminLoading && !adminRestrictedModelsList.length && <p>Loading models...</p>}
                    {!isAdminLoading && !adminError && AVAILABLE_PERSONAS.length > 0 && ( <div className="restricted-models-list"> <p style={{fontSize: '0.9em', color: '#666', marginBottom: '10px', padding: '0 12px'}}>Toggle models requiring access key.</p> {ALL_AVAILABLE_MODELS_FRONTEND.map(mInfo => { const isRestricted = adminRestrictedModelsList.includes(mInfo.value); return ( <div key={mInfo.value} className="restriction-item"> <span>{mInfo.label} (<code>{mInfo.value}</code>)</span> <button onClick={()=>handleToggleModelRestriction(mInfo.value)} className={`restriction-toggle-button ${isRestricted?'deactivate':'activate'}`} disabled={isAdminLoading || !!editingKey}>{isRestricted ? 'Restricted ✔':'Public'}</button> </div> ); })} </div> )}
                </div>

                <hr className="staff-separator" />
                <h4>Manage Restricted Personas</h4>
                <div className="admin-data-section">
                     {isAdminLoading && !adminRestrictedPersonasList.length && <p>Loading personas...</p>}
                     {!isAdminLoading && !adminError && AVAILABLE_PERSONAS.length > 0 && ( <div className="restricted-models-list"> <p style={{fontSize: '0.9em', color: '#666', marginBottom: '10px', padding: '0 12px'}}>Toggle personas requiring access key.</p> {AVAILABLE_PERSONAS.map(pInfo => { const isRestricted = adminRestrictedPersonasList.includes(pInfo.value); return ( <div key={pInfo.value} className="restriction-item"> <span>{pInfo.emoji} {pInfo.label} (<code>{pInfo.value}</code>)</span> <button onClick={()=>handleTogglePersonaRestriction(pInfo.value)} className={`restriction-toggle-button ${isRestricted ? 'deactivate' : 'activate'}`} disabled={isAdminLoading || !!editingKey}>{isRestricted ? 'Restricted ✔' : 'Public'}</button> </div> ); })} </div> )}
                </div>
             </div>
        </div>
    );
}

export default AdminPage;