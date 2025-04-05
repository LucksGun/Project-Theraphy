// src/AdminPage.tsx - Fixed unused handleDeleteFeedback handler
import { useState, useEffect, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import './admin.css';
import {
    GeminiModel, Persona, UserKeyInfo, AVAILABLE_PERSONAS,
    ALL_AVAILABLE_MODELS_FRONTEND, WORKER_URL, ApiRequestBody, FeedbackItem,
    DEFAULT_BASE_SYSTEM_INSTRUCTION, DEFAULT_PERSONA_INSTRUCTIONS,
    ALL_PERSONA_KEYS
} from './App';

type PersonaInstructionMap = { [key in Persona]?: string };

function AdminPage() {
    const navigate = useNavigate();
    const [authenticatedStaffKey, setAuthenticatedStaffKey] = useState<string | null>(null);
    // --- State ---
    const [adminUserKeysList, setAdminUserKeysList] = useState<UserKeyInfo[]>([]);
    const [adminRestrictedModelsList, setAdminRestrictedModelsList] = useState<GeminiModel[]>([]);
    const [adminRestrictedPersonasList, setAdminRestrictedPersonasList] = useState<Persona[]>([]);
    const [adminFeedbackList, setAdminFeedbackList] = useState<FeedbackItem[]>([]);
    const [newKeyUsername, setNewKeyUsername] = useState<string>('');
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editUsernameValue, setEditUsernameValue] = useState<string>('');
    const [isAdminLoading, setIsAdminLoading] = useState<boolean>(true);
    const [adminError, setAdminError] = useState<string | null>(null);
    const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
    const [basePrompt, setBasePrompt] = useState<string>('');
    const [personaPrompts, setPersonaPrompts] = useState<PersonaInstructionMap>({});
    const [initialBasePrompt, setInitialBasePrompt] = useState<string>('');
    const [initialPersonaPrompts, setInitialPersonaPrompts] = useState<PersonaInstructionMap>({});

    // --- Effects ---
    useEffect(() => {
        const keyFromSession = sessionStorage.getItem('staffKey');
        if (!keyFromSession) { navigate('/'); } else { setAuthenticatedStaffKey(keyFromSession); fetchAdminData(keyFromSession); }
    }, [navigate]);

    const fetchAdminData = async (staffKey: string | null) => {
        if (!staffKey) return; console.log("AdminPage: Fetching data..."); setIsAdminLoading(true); setAdminError(null); setAdminSuccess(null);
        try {
            const listKeysBody: ApiRequestBody = { action: 'adminListKeys', staffKey: staffKey };
            const getRestrictionsBody: ApiRequestBody = { action: 'adminGetRestrictions', staffKey: staffKey };
            const listFeedbackBody: ApiRequestBody = { action: 'adminListFeedback', staffKey: staffKey };
            const getPromptsBody: ApiRequestBody = { action: 'adminGetPrompts', staffKey: staffKey };
            const [keysRes, restrictRes, feedbackRes, promptsRes] = await Promise.all([
                fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(listKeysBody) }),
                fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getRestrictionsBody) }),
                fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(listFeedbackBody) }),
                fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getPromptsBody) })
            ]);
            const keysData = await keysRes.json().catch(() => ({ error: 'Invalid JSON keys' })); if (!keysRes.ok || !keysData.success) throw new Error(keysData?.error || 'Failed fetch keys.'); setAdminUserKeysList(keysData.keys || []);
            const restrictData = await restrictRes.json().catch(() => ({ error: 'Invalid JSON restrictions' })); if (!restrictRes.ok || !restrictData.success) throw new Error(restrictData?.error || 'Failed fetch restrictions.'); setAdminRestrictedModelsList(restrictData.restrictedModels || []); setAdminRestrictedPersonasList(restrictData.restrictedPersonas || []);
            const feedbackData = await feedbackRes.json().catch(() => ({ error: 'Invalid JSON feedback' })); if (!feedbackRes.ok || !feedbackData.success) throw new Error(feedbackData?.error || 'Failed fetch feedback.'); setAdminFeedbackList(feedbackData.feedback || []);
            const promptsData = await promptsRes.json().catch(() => ({ error: 'Invalid JSON prompts' })); if (!promptsRes.ok || !promptsData.success) throw new Error(promptsData?.error || 'Failed fetch prompts.');
            const fetchedBase = promptsData.baseInstruction || DEFAULT_BASE_SYSTEM_INSTRUCTION; const fetchedPersonas = promptsData.personaInstructions || DEFAULT_PERSONA_INSTRUCTIONS; setBasePrompt(fetchedBase); setInitialBasePrompt(fetchedBase); setPersonaPrompts(fetchedPersonas); setInitialPersonaPrompts(fetchedPersonas);
            setAdminError(null);
        } catch (e) { setAdminError(e instanceof Error ? e.message : "Failed load admin data."); setAdminUserKeysList([]); setAdminRestrictedModelsList([]); setAdminRestrictedPersonasList([]); setAdminFeedbackList([]); setBasePrompt(DEFAULT_BASE_SYSTEM_INSTRUCTION); setPersonaPrompts(DEFAULT_PERSONA_INSTRUCTIONS); setInitialBasePrompt(DEFAULT_BASE_SYSTEM_INSTRUCTION); setInitialPersonaPrompts(DEFAULT_PERSONA_INSTRUCTIONS); } finally { setIsAdminLoading(false); }
    };
    useEffect(() => { let timer: NodeJS.Timeout | null = null; if (adminSuccess) { timer = setTimeout(() => setAdminSuccess(null), 3500); } return () => { if (timer) clearTimeout(timer); }; }, [adminSuccess]);

    // --- Handlers ---
    const handleToggleUserKeyStatus = async (key: string, status: 'active' | 'inactive') => { if (!authenticatedStaffKey) return; const nS=status==='active'?'inactive':'active'; const kS=key.substring(0,8); if(!window.confirm(`Set key "${kS}..." to ${nS}?`))return; setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null); const requestBody: ApiRequestBody = {action:'adminUpdateKeyStatus',staffKey:authenticatedStaffKey,key:key,newStatus:nS}; try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)}); const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Update failed: ${r.status}`);setAdminSuccess(d.message||"Status updated.");}catch(e){setAdminError(e instanceof Error?e.message:"Failed update.");}finally{ fetchAdminData(authenticatedStaffKey); } };
    const handleToggleModelRestriction = async (val: GeminiModel) => { if (!authenticatedStaffKey) return; const isR=adminRestrictedModelsList.includes(val); const act=isR?"make public":"make restricted"; if(!window.confirm(`Make model "${val}" ${act}?`))return; const nL=isR?adminRestrictedModelsList.filter(m=>m!==val):[...adminRestrictedModelsList,val]; setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null); const requestBody: ApiRequestBody = {action:'adminSetRestrictedModels',staffKey:authenticatedStaffKey,models:nL}; try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)}); const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Save failed: ${r.status}`);setAdminSuccess(d.message||"Models updated.");}catch(e){setAdminError(e instanceof Error?e.message:"Failed save.");}finally{ fetchAdminData(authenticatedStaffKey); } };
    const handleTogglePersonaRestriction = async (val: Persona) => { if (!authenticatedStaffKey) return; const isR=adminRestrictedPersonasList.includes(val); const pI=AVAILABLE_PERSONAS.find(p=>p.value===val); const pL=pI?pI.label:val; const act=isR?"make public":"make restricted"; if(!window.confirm(`Make persona "${pL}" ${act}?`))return; const nL=isR?adminRestrictedPersonasList.filter(p=>p!==val):[...adminRestrictedPersonasList,val]; setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null); const requestBody: ApiRequestBody = {action:'adminSetRestrictedPersonas',staffKey:authenticatedStaffKey,personas:nL}; try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)}); const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Save failed: ${r.status}`);setAdminSuccess(d.message||"Personas updated.");}catch(e){setAdminError(e instanceof Error?e.message:"Failed save.");}finally{ fetchAdminData(authenticatedStaffKey); } };
    const handleAddNewKey = async () => { if (!authenticatedStaffKey) return; setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null); const uTS=newKeyUsername.trim()||null; const requestBody: ApiRequestBody = {action:'adminAddKey',staffKey:authenticatedStaffKey,username:uTS}; try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)}); const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Add failed: ${r.status}`);setAdminSuccess(d.message||"Key added!");setNewKeyUsername('');}catch(e){setAdminError(e instanceof Error?e.message:"Failed add key.");}finally{ fetchAdminData(authenticatedStaffKey); } };
    const handleDeleteKey = async (keyToDelete: string) => { if (!authenticatedStaffKey) return; const kS=keyToDelete.substring(0,8); if(!window.confirm(`DELETE key "${kS}..."? Cannot undo.`))return; setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null); const requestBody: ApiRequestBody = {action:'adminDeleteKey',staffKey:authenticatedStaffKey,key:keyToDelete}; try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)}); const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Delete failed: ${r.status}`);setAdminSuccess(d.message||"Key deleted!");}catch(e){setAdminError(e instanceof Error?e.message:"Failed delete key.");}finally{ fetchAdminData(authenticatedStaffKey); } };
    const handleCopyKey = async (keyToCopy: string) => { try{await navigator.clipboard.writeText(keyToCopy);setAdminSuccess(`Key copied!`);}catch(e){console.error("Copy failed:",e);setAdminError("Failed to copy key.");}};
    const handleStartEdit = (key: string, currentUsername: string | null) => { setEditingKey(key);setEditUsernameValue(currentUsername||'');};
    const handleCancelEdit = () => { setEditingKey(null);setEditUsernameValue('');};
    const handleSaveUsername = async () => { if(editingKey===null || !authenticatedStaffKey)return; const keyToEdit=editingKey;const usernameToSend=editUsernameValue.trim()||null;setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null); const requestBody: ApiRequestBody = {action:'adminEditUsername',staffKey:authenticatedStaffKey,key:keyToEdit,newUsername:usernameToSend}; try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)});const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok) throw new Error(d?.error||`Update failed: ${r.status}`); setAdminSuccess(d.message||"Username updated!");setEditingKey(null);setEditUsernameValue('');}catch(e){setAdminError(e instanceof Error?e.message:"Failed update username.");}finally{ fetchAdminData(authenticatedStaffKey); } };
    const handleNewKeyUsernameChange = (e:ChangeEvent<HTMLInputElement>)=>{setNewKeyUsername(e.target.value);};
    const handleEditUsernameChange = (e:ChangeEvent<HTMLInputElement>)=>{setEditUsernameValue(e.target.value);};
    const handleLogout = () => { sessionStorage.removeItem('staffKey'); navigate('/'); };
    const handleMarkImportant = async (feedbackId: number, currentIsImportant: number) => { if (!authenticatedStaffKey) return; const makeImportant = !currentIsImportant; setIsAdminLoading(true); setAdminError(null); setAdminSuccess(null); const requestBody: ApiRequestBody = { action: 'adminMarkFeedbackImportant', staffKey: authenticatedStaffKey, feedbackId: feedbackId, isImportant: makeImportant ? 1 : 0 }; try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) }); const data = await res.json().catch(() => ({ error: 'Invalid JSON' })); if (!res.ok || !data.success) throw new Error(data?.error || `Update importance failed: ${res.status}`); setAdminSuccess(data.message || "Feedback importance updated."); } catch (e) { setAdminError(e instanceof Error ? e.message : "Failed update importance."); } finally { fetchAdminData(authenticatedStaffKey); } };
    // This handler should now be used
    const handleDeleteFeedback = async (feedbackId: number) => { if (!authenticatedStaffKey) return; if (!window.confirm(`DELETE feedback entry #${feedbackId}?`)) return; setIsAdminLoading(true); setAdminError(null); setAdminSuccess(null); const requestBody: ApiRequestBody = { action: 'adminDeleteFeedback', staffKey: authenticatedStaffKey, feedbackId: feedbackId }; try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) }); const data = await res.json().catch(() => ({ error: 'Invalid JSON' })); if (!res.ok || !data.success) throw new Error(data?.error || `Delete failed: ${res.status}`); setAdminSuccess(data.message || "Feedback deleted."); } catch (e) { setAdminError(e instanceof Error ? e.message : "Failed delete feedback."); } finally { fetchAdminData(authenticatedStaffKey); } };
    const handleBasePromptChange = (e: ChangeEvent<HTMLTextAreaElement>) => { setBasePrompt(e.target.value); setAdminError(null); setAdminSuccess(null); };
    const handlePersonaPromptChange = (personaKey: string, value: string) => { setPersonaPrompts(prev => ({ ...prev, [personaKey]: value })); setAdminError(null); setAdminSuccess(null); };
    const handleRevertPromptChanges = () => { if (window.confirm("Revert unsaved prompt changes?")) { setBasePrompt(initialBasePrompt); setPersonaPrompts(initialPersonaPrompts); setAdminError(null); setAdminSuccess("Changes reverted."); } };
    const handleSaveChanges = async () => { if (!authenticatedStaffKey) return; const baseChanged = basePrompt !== initialBasePrompt; const personasChanged = JSON.stringify(personaPrompts) !== JSON.stringify(initialPersonaPrompts); if (!baseChanged && !personasChanged) { setAdminError("No changes to save."); return; } if (!window.confirm("Save prompt changes?")) return; setIsAdminLoading(true); setAdminError(null); setAdminSuccess(null); const requestBody: ApiRequestBody = { action: 'adminSetPrompts', staffKey: authenticatedStaffKey, baseInstruction: basePrompt, personaInstructions: personaPrompts }; try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) }); const data = await res.json().catch(() => ({ error: 'Invalid JSON' })); if (!res.ok || !data.success) { throw new Error(data?.error || `Save failed: ${res.status}`); } setAdminSuccess(data.message || "Prompts saved!"); setInitialBasePrompt(basePrompt); setInitialPersonaPrompts(personaPrompts); } catch (e) { setAdminError(e instanceof Error ? e.message : "Failed save prompts."); } finally { setIsAdminLoading(false); } };
    const hasPromptChanges = basePrompt !== initialBasePrompt || JSON.stringify(personaPrompts) !== JSON.stringify(initialPersonaPrompts);


    // --- Render Logic ---
    if (isAdminLoading && !initialBasePrompt && !adminUserKeysList.length && !adminFeedbackList.length) { return <div style={{ padding: '40px', textAlign: 'center', fontSize: '1.2em', color: '#666' }}>Loading Admin Data...</div>; }
    if (!authenticatedStaffKey && !isAdminLoading) { return <div style={{ padding: '40px', textAlign: 'center', color: 'red' }}>Error: Not authenticated. Please log in again.</div>; }

    const renderStars = (rating: number) => { const stars = []; for (let i = 1; i <= 5; i++) { stars.push(<span key={i} className={i <= rating ? 'star-filled' : 'star-empty'}>★</span>); } return <div className="rating-stars-display">{stars}</div>; };

    return (
        <div className="admin-page-container">
            <div className="admin-page-header"> <h1>Staff Admin Panel</h1> <button onClick={handleLogout} className="admin-logout-button">Logout</button> </div>
            <div className="staff-admin-section">
                <div style={{ minHeight: '40px' }}> {adminSuccess && <p className="admin-feedback success">{adminSuccess}</p>} {adminError && <p className="admin-feedback error">{adminError}</p>} </div>

                <h4>Manage User Access Keys</h4>
                <div className="admin-data-section">
                    {(isAdminLoading && !adminUserKeysList.length && !adminError) && <p className="admin-loading-text">Loading keys...</p>}
                    {(!adminUserKeysList.length && !isAdminLoading && !adminError) && <p>No keys found.</p>}
                    {(adminUserKeysList.length > 0 || (!isAdminLoading && !adminError)) && (
                        <div className="user-keys-list">
                            <table><thead><tr><th>Key</th><th>Username</th><th>Status</th><th>Created</th><th className="actions-column">Actions</th></tr></thead><tbody>{adminUserKeysList.map(k=>(<tr key={k.key} className={editingKey===k.key?'editing-row':''}><td><div className="key-cell-content"><code>{k.key}</code><button onClick={()=>handleCopyKey(k.key)} className="copy-button" title="Copy Key">📋</button></div></td><td>{editingKey===k.key?(<input type="text" value={editUsernameValue} onChange={handleEditUsernameChange} className="settings-input inline-edit-input" autoFocus onKeyDown={(e)=>{if(e.key==='Enter')handleSaveUsername();else if(e.key==='Escape')handleCancelEdit();}}/>):(k.username||<span className="no-username"><em>(none)</em></span>)}</td><td><span className={`status-${k.status}`}>{k.status}</span></td><td>{new Date(k.created_at).toLocaleDateString()}</td><td><div className="action-buttons-cell">{editingKey===k.key?(<><button onClick={handleSaveUsername} className="save-button" disabled={isAdminLoading}>✔️ Save</button><button onClick={handleCancelEdit} className="cancel-button" disabled={isAdminLoading}>❌ Cancel</button></>):(<> <button onClick={()=>handleToggleUserKeyStatus(k.key,k.status)} className={`key-status-toggle-button ${k.status==='active'?'deactivate':'activate'}`} disabled={isAdminLoading||!!editingKey}>{k.status==='active'?'Deactivate':'Activate'}</button><button onClick={()=>handleStartEdit(k.key, k.username)} className="edit-button" disabled={isAdminLoading||!!editingKey}>✏️</button><button onClick={()=>handleDeleteKey(k.key)} className="delete-button" disabled={isAdminLoading||!!editingKey} title={`Delete key`}>🗑️</button></>)}</div></td></tr>))}</tbody></table>
                        </div>
                    )}
                    <div className="add-key-section"><h5>Add New Key</h5><div className="add-key-form"><div className="settings-option" style={{flexGrow: 1}}><label htmlFor="new-key-username">Username (Optional):</label><input type="text" id="new-key-username" className="settings-input" value={newKeyUsername} onChange={handleNewKeyUsernameChange} placeholder="Assign username (optional)" disabled={isAdminLoading||!!editingKey}/></div><button onClick={handleAddNewKey} className="add-key-button" disabled={isAdminLoading||!!editingKey}>{isAdminLoading?'Adding...':'+ Add Key'}</button></div></div>
                </div>

                <hr className="staff-separator" />
                <h4>Manage User Feedback</h4>
                <div className="admin-data-section">
                    {(isAdminLoading && !adminFeedbackList.length && !adminError) && <p className="admin-loading-text">Loading feedback...</p>}
                    {(!adminFeedbackList.length && !isAdminLoading && !adminError) && <p>No feedback submitted yet.</p>}
                    {(adminFeedbackList.length > 0 || (!isAdminLoading && !adminError)) && (
                        <div className="feedback-list">
                             <table><thead><tr><th style={{width:"140px"}}>Submitted</th><th>Email</th><th style={{width:"90px"}}>Rating</th><th style={{width:"40%"}}>Comment</th><th className="actions-column" style={{width:"200px"}}>Actions</th></tr></thead><tbody>{adminFeedbackList.map(fb=>(<tr key={fb.id} className={`feedback-item ${fb.is_important?'important-feedback':''}`}><td>{new Date(fb.submitted_at).toLocaleString()}</td><td>{fb.email||<span className="no-username"><em>(none)</em></span>}</td><td>{renderStars(fb.rating)}</td><td className="feedback-comment-cell">{fb.comment}</td><td><div className="action-buttons-cell"><button onClick={()=>handleMarkImportant(fb.id,fb.is_important)} className={`feedback-action-button ${fb.is_important?'unmark-important':'mark-important'}`} disabled={isAdminLoading||!!editingKey}>{fb.is_important?'★ Unmark':'☆ Mark Imp'}</button><button onClick={()=>handleDeleteFeedback(fb.id)} className="delete-button feedback-delete-button" disabled={isAdminLoading||!!editingKey}>🗑️ Delete</button></div></td></tr>))}</tbody></table>
                         </div>
                    )}
                </div>

                <hr className="staff-separator" />
                <h4>Manage AI Prompts</h4>
                 <div className="admin-prompt-warning">⚠️ **Caution:** Editing prompts directly affects AI behavior. Incorrect formatting can break functionality.</div>
                <div className="admin-data-section prompt-editing-section">
                     {isAdminLoading && !initialBasePrompt && <p className="admin-loading-text">Loading prompts...</p>}
                     {(!isAdminLoading && !adminError) && (<><div className="prompt-edit-area"><label htmlFor="base-prompt-edit">Base System Instruction:</label><textarea id="base-prompt-edit" className="prompt-textarea" value={basePrompt} onChange={handleBasePromptChange} rows={10} disabled={isAdminLoading||!!editingKey}/></div><h5>Persona Instructions:</h5>{ALL_PERSONA_KEYS.map(key=>(<div className="prompt-edit-area" key={key}><label htmlFor={`persona-prompt-${key}`}>{key.charAt(0).toUpperCase()+key.slice(1)}:</label><textarea id={`persona-prompt-${key}`} className="prompt-textarea persona-textarea" value={personaPrompts[key as Persona]||''} onChange={(e)=>handlePersonaPromptChange(key,e.target.value)} rows={6} disabled={isAdminLoading||!!editingKey}/></div>))}{/* Prompt Actions */} <div className="prompt-actions"><button onClick={handleSaveChanges} className="save-button" disabled={!hasPromptChanges||isAdminLoading||!!editingKey} title={!hasPromptChanges?"No changes":"Save changes"}>{isAdminLoading?'Saving...':'💾 Save Prompt Changes'}</button><button onClick={handleRevertPromptChanges} className="cancel-button" disabled={!hasPromptChanges||isAdminLoading||!!editingKey} title="Discard changes">↩️ Revert Changes</button></div></>)}
                </div>

                <hr className="staff-separator" />
                <h4>Manage Restricted Models</h4>
                <div className="admin-data-section">{ (isAdminLoading && !adminRestrictedModelsList.length && !adminError) && <p className="admin-loading-text">Loading models...</p>} {(!isAdminLoading && !adminError) && ( <div className="restricted-items-list"> <p className="restriction-description">Toggle models requiring access key.</p> {ALL_AVAILABLE_MODELS_FRONTEND.map(mInfo => { const isRestricted = adminRestrictedModelsList.includes(mInfo.value); return ( <div key={mInfo.value} className="restriction-item"> <span>{mInfo.label} (<code>{mInfo.value}</code>)</span> <button onClick={()=>handleToggleModelRestriction(mInfo.value)} className={`restriction-toggle-button ${isRestricted?'deactivate':'activate'}`} disabled={isAdminLoading || !!editingKey}>{isRestricted ? 'Restricted ✔':'Public'}</button> </div> ); })} </div> )}</div>
                <hr className="staff-separator" />
                <h4>Manage Restricted Personas</h4>
                <div className="admin-data-section">{ (isAdminLoading && !adminRestrictedPersonasList.length && !adminError) && <p className="admin-loading-text">Loading personas...</p>} {(!isAdminLoading && !adminError) && ( <div className="restricted-items-list"> <p className="restriction-description">Toggle personas requiring access key.</p> {AVAILABLE_PERSONAS.map(pInfo => { const isRestricted = adminRestrictedPersonasList.includes(pInfo.value); return ( <div key={pInfo.value} className="restriction-item"> <span>{pInfo.emoji} {pInfo.label} (<code>{pInfo.value}</code>)</span> <button onClick={()=>handleTogglePersonaRestriction(pInfo.value)} className={`restriction-toggle-button ${isRestricted ? 'deactivate' : 'activate'}`} disabled={isAdminLoading || !!editingKey}>{isRestricted ? 'Restricted ✔' : 'Public'}</button> </div> ); })} </div> )}</div>

             </div>
        </div>
    );
}

export default AdminPage;