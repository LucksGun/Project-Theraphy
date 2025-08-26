import { useState, useEffect, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import './admin.css';

// =================================================================
// --- 1. Dependencies & Constants ---
// =================================================================

export const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';

// --- Types & Interfaces ---
export type GeminiModel = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.5-flash-lite';
export type Persona = 'normal' | 'therapist' | 'university_master' | 'interviewer';
export interface UserKeyInfo { key: string; username: string | null; status: 'active' | 'inactive'; created_at: string; }
export interface FeedbackItem { id: number; email: string | null; rating: number; comment: string; submitted_at: string; is_important: number; }
export type PersonaInstructionMap = { [key in Persona]?: string };
export interface ApiRequestBody { action: string; staffKey?: string; userId?: string; [key: string]: any; }
export interface PersonaInfo { value: Persona; label: string; emoji: string; restricted: boolean; }
export interface ModelInfo { value: GeminiModel; label: string; restricted: boolean; }
export interface UserWithHistory {
    id: string;
    username: string;
    email: string | null;
    last_updated: string;
    history_size_bytes: number;
}

// --- Configurations & Constants ---
export const ALL_AVAILABLE_MODELS_FRONTEND: ModelInfo[] = [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', restricted: false },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', restricted: false },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', restricted: true }
];
export const AVAILABLE_PERSONAS: PersonaInfo[] = [
    { value: 'university_master', label: 'University Master', emoji: '🎓', restricted: false },
    { value: 'normal', label: 'Normal Bot', emoji: '🤖', restricted: true },
    { value: 'therapist', label: 'Therapist', emoji: '🧠', restricted: true },
    { value: 'interviewer', label: 'Interviewer', emoji: '👔', restricted: true },
];
export const DEFAULT_BASE_SYSTEM_INSTRUCTION = `
You are a helpful AI assistant for Project Theraphy.
Please format your response using markdown where appropriate. Use bullet points (-) or numbered lists (1.) for lists or steps. Bold text using **text**.
When asking a question with clear choices or suggesting concise next steps FOR GENERAL TOPICS, provide the options enclosed in square brackets like this: [Suggestion: Choice Text]. Make sure if there are multiple suggestions, each is in its own bracket.
Example: [Suggestion: Tell me more about oranges] [Suggestion: What other fruits are common?]
HOWEVER, if the user is asking for advice on potentially sensitive personal topics (like "my kid is naughty", "I feel stressed", "I'm worried about X"), provide suggestions or follow-up questions as normal text within your response, NOT using the [Suggestion: ...] format.
When user types in Thai, respond in Thai, even if the message contains only a few Thai words, unless explicitly asked to answer in English.
If asked about your current AI model, state the model name you are configured to use.
If the user expresses feeling bad or hopeless, offer an inspirational quote. REMEMBER TO OFFER AN INSPIRATIONAL QUOTE IN THIS SITUATION.
If you receive input clearly identified as starting with "Field 1:", "Field 2:", etc., this is from a special form submission about the user. Analyze this input specifically for college/university advice. Based *only* on the provided field inputs, recommend suitable faculties, specific universities (mentioning potential locations if relevant), and general advice on how to prepare for or get into those paths. Structure this advice clearly (e.g., using headings or bullet points).
`;
export const DEFAULT_PERSONA_INSTRUCTIONS: PersonaInstructionMap = {
    normal: `\nYou are currently in 'Normal Bot' persona mode. Act as a general-purpose assistant. Respond helpfully to a wide range of queries. If the topic is suitable (not sensitive personal advice), suggest follow-up questions using the [Suggestion: ...] format based on common interests or logical next steps.`,
    therapist: `\nYou are currently roleplaying as a supportive and empathetic therapist assistant in 'Therapist' persona mode. Your primary goal is to offer a safe, non-judgmental space for users to discuss feelings, stress, and future planning concerns. Use gentle, understanding, and validating language. Acknowledge the user's feelings (e.g., "It sounds like that's really challenging," "It's understandable to feel that way."). DO NOT give direct medical advice, diagnoses, or claim to be a real therapist. You can suggest seeking professional help if appropriate. Guide users towards healthy coping mechanisms, self-reflection, or reframing thoughts in a constructive way. When suggesting next steps related to emotional well-being or coping strategies, present them as gentle questions or suggestions in PLAIN TEXT, not using the [Suggestion: ...] format. Example: "Perhaps exploring mindfulness techniques could be helpful for managing stress. Is that something you'd be open to discussing?" or "Would you like to explore what might be triggering these feelings?" Prioritize offering inspirational quotes when the user expresses distress or hopelessness.`,
    interviewer: `You are a demanding university admissions interviewer assessing a candidate's suitability. Speak in lanuage config. ntroduce yourself, ask 4-5 challenging questions with a formal, strict tone, and do not use [Suggestion: ...]. End the interview if the user indicates they are finished (e.g., 'thank you') or if a developer uses the command 'ยกเลิก 123'. Your final response MUST provide a 1-2 sentence summary in Thai, followed by a new line with the untranslated English phrase 'Conclusion: Pass' or 'Conclusion: Fail'. Please do not make it so long like harsh is good but if they response stypid u may skip that question and js go make a feedback later bc interviewer doesn't usually focus with thesse people. Just a reminder that don't make the interview scoring long and doesnt end in 10 mins.`,
    university_master: `\nYou are currently roleplaying as an expert academic advisor in 'University Master' persona mode. Focus your responses on topics related to college/university planning, choosing majors/faculties, understanding university life, developing effective study habits, and exploring career paths related to academic degrees. When the user asks general questions about college or careers, suggest specific areas to explore using the [Suggestion: ...] format. Example: [Suggestion: What subjects are you most interested in studying?] [Suggestion: What are your long-term career goals?] [Suggestion: Tell me about your preferred learning style or environment] If you receive the structured "Field 1-5" input, provide detailed college/faculty/university recommendations as described in the base instructions. Maintain a knowledgeable, encouraging, and advisory tone. Avoid overly emotional or therapeutic language.`
};
export const ALL_PERSONA_KEYS = Object.keys(DEFAULT_PERSONA_INSTRUCTIONS);


// =================================================================
// --- 2. AdminPage Component ---
// =================================================================

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
    const [viewingHistory, setViewingHistory] = useState<any[] | null>(null);
    const [viewingUserId, setViewingUserId] = useState<string | null>(null);
    const [, setHistoryError] = useState<string | null>(null);
    const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(false);
    const [usersWithHistory, setUsersWithHistory] = useState<UserWithHistory[]>([]);
    const [totalStorageBytes, setTotalStorageBytes] = useState<number>(0);

    // --- Effects ---
    useEffect(() => {
        const keyFromSession = sessionStorage.getItem('staffKey');
        if (!keyFromSession) {
            navigate('/');
        } else {
            setAuthenticatedStaffKey(keyFromSession);
            fetchAdminData(keyFromSession);
        }
    }, [navigate]);

    const fetchAdminData = async (staffKey: string | null) => {
        if (!staffKey) return;
        setIsAdminLoading(true);
        setAdminError(null);
        setAdminSuccess(null);
        try {
            const listKeysBody: ApiRequestBody = { action: 'adminListKeys', staffKey };
            const getRestrictionsBody: ApiRequestBody = { action: 'adminGetRestrictions', staffKey };
            const listFeedbackBody: ApiRequestBody = { action: 'adminListFeedback', staffKey };
            const getPromptsBody: ApiRequestBody = { action: 'adminGetPrompts', staffKey };
            const listUsersWithHistoryBody: ApiRequestBody = { action: 'adminListUsersWithHistory', staffKey };

            const [keysRes, restrictRes, feedbackRes, promptsRes, usersWithHistoryRes] = await Promise.all([
                fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(listKeysBody) }),
                fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getRestrictionsBody) }),
                fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(listFeedbackBody) }),
                fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getPromptsBody) }),
                fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(listUsersWithHistoryBody) })
            ]);

            const keysData = await keysRes.json();
            if (!keysRes.ok || !keysData.success) throw new Error(keysData?.error || 'Failed to fetch keys.');
            setAdminUserKeysList(keysData.keys || []);

            const restrictData = await restrictRes.json();
            if (!restrictRes.ok || !restrictData.success) throw new Error(restrictData?.error || 'Failed to fetch restrictions.');
            setAdminRestrictedModelsList(restrictData.restrictedModels || []);
            setAdminRestrictedPersonasList(restrictData.restrictedPersonas || []);

            const feedbackData = await feedbackRes.json();
            if (!feedbackRes.ok || !feedbackData.success) throw new Error(feedbackData?.error || 'Failed to fetch feedback.');
            setAdminFeedbackList(feedbackData.feedback || []);

            const promptsData = await promptsRes.json();
            if (!promptsRes.ok || !promptsData.success) throw new Error(promptsData?.error || 'Failed to fetch prompts.');
            const fetchedBase = promptsData.baseInstruction || DEFAULT_BASE_SYSTEM_INSTRUCTION;
            const fetchedPersonas = promptsData.personaInstructions || DEFAULT_PERSONA_INSTRUCTIONS;
            setBasePrompt(fetchedBase); setInitialBasePrompt(fetchedBase); setPersonaPrompts(fetchedPersonas); setInitialPersonaPrompts(fetchedPersonas);

            const usersWithHistoryData = await usersWithHistoryRes.json();
            if (!usersWithHistoryRes.ok || !usersWithHistoryData.success) throw new Error(usersWithHistoryData?.error || 'Failed to fetch user history list.');
            setUsersWithHistory(usersWithHistoryData.users || []);
            setTotalStorageBytes(usersWithHistoryData.total_storage_bytes || 0);
            
            setAdminError(null);
        } catch (e) {
            setAdminError(e instanceof Error ? e.message : "Failed to load admin data.");
            setAdminUserKeysList([]); setAdminRestrictedModelsList([]); setAdminRestrictedPersonasList([]); setAdminFeedbackList([]); setUsersWithHistory([]); setTotalStorageBytes(0);
            setBasePrompt(DEFAULT_BASE_SYSTEM_INSTRUCTION); setPersonaPrompts(DEFAULT_PERSONA_INSTRUCTIONS); setInitialBasePrompt(DEFAULT_BASE_SYSTEM_INSTRUCTION); setInitialPersonaPrompts(DEFAULT_PERSONA_INSTRUCTIONS);
        } finally {
            setIsAdminLoading(false);
        }
    };

    useEffect(() => {
        let timer: NodeJS.Timeout | null = null;
        if (adminSuccess) {
            timer = setTimeout(() => setAdminSuccess(null), 3500);
        }
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [adminSuccess]);

    // --- Handlers ---
    const formatBytes = (bytes: number, decimals = 2) => { if (bytes === 0) return '0 Bytes'; const k = 1024; const dm = decimals < 0 ? 0 : decimals; const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]; };
    const handleLogout = () => { sessionStorage.removeItem('staffKey'); navigate('/'); };
    const handleToggleUserKeyStatus = async (key: string, status: 'active' | 'inactive') => { if (!authenticatedStaffKey) return; const newStatus = status === 'active' ? 'inactive' : 'active'; const keyShort = key.substring(0, 8); if (!window.confirm(`Are you sure you want to set key "${keyShort}..." to ${newStatus}?`)) return; setIsAdminLoading(true); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminUpdateKeyStatus', staffKey: authenticatedStaffKey, key, newStatus }) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data?.error || 'Failed to update key status.'); setAdminSuccess(data.message || "Status updated."); } catch (e) { setAdminError(e instanceof Error ? e.message : "Failed to update status."); } finally { fetchAdminData(authenticatedStaffKey); } };
    const handleToggleModelRestriction = async (model: GeminiModel) => { if (!authenticatedStaffKey) return; const isRestricted = adminRestrictedModelsList.includes(model); const actionText = isRestricted ? "make public" : "make restricted"; if (!window.confirm(`Are you sure you want to ${actionText} the model "${model}"?`)) return; const newModels = isRestricted ? adminRestrictedModelsList.filter(m => m !== model) : [...adminRestrictedModelsList, model]; setIsAdminLoading(true); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminSetRestrictedModels', staffKey: authenticatedStaffKey, models: newModels }) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data?.error || 'Failed to update model restrictions.'); setAdminSuccess(data.message || "Model restrictions updated."); } catch (e) { setAdminError(e instanceof Error ? e.message : "Failed to save changes."); } finally { fetchAdminData(authenticatedStaffKey); } };
    const handleTogglePersonaRestriction = async (persona: Persona) => { if (!authenticatedStaffKey) return; const isRestricted = adminRestrictedPersonasList.includes(persona); const actionText = isRestricted ? "make public" : "make restricted"; if (!window.confirm(`Are you sure you want to ${actionText} the persona "${persona}"?`)) return; const newPersonas = isRestricted ? adminRestrictedPersonasList.filter(p => p !== persona) : [...adminRestrictedPersonasList, persona]; setIsAdminLoading(true); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminSetRestrictedPersonas', staffKey: authenticatedStaffKey, personas: newPersonas }) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data?.error || 'Failed to update persona restrictions.'); setAdminSuccess(data.message || "Persona restrictions updated."); } catch (e) { setAdminError(e instanceof Error ? e.message : "Failed to save changes."); } finally { fetchAdminData(authenticatedStaffKey); } };
    const handleAddNewKey = async () => { if (!authenticatedStaffKey) return; setIsAdminLoading(true); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminAddKey', staffKey: authenticatedStaffKey, username: newKeyUsername.trim() || null }) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data?.error || 'Failed to add key.'); setAdminSuccess(data.message || "Key added successfully!"); setNewKeyUsername(''); } catch (e) { setAdminError(e instanceof Error ? e.message : "Failed to add new key."); } finally { fetchAdminData(authenticatedStaffKey); } };
    const handleDeleteKey = async (keyToDelete: string) => { if (!authenticatedStaffKey) return; if (!window.confirm(`Are you sure you want to permanently delete the key "${keyToDelete.substring(0, 8)}..."? This cannot be undone.`)) return; setIsAdminLoading(true); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminDeleteKey', staffKey: authenticatedStaffKey, key: keyToDelete }) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data?.error || 'Failed to delete key.'); setAdminSuccess(data.message || "Key deleted successfully."); } catch (e) { setAdminError(e instanceof Error ? e.message : "Failed to delete key."); } finally { fetchAdminData(authenticatedStaffKey); } };
    const handleCopyKey = async (keyToCopy: string) => { try { await navigator.clipboard.writeText(keyToCopy); setAdminSuccess(`Key "${keyToCopy.substring(0, 8)}..." copied!`); } catch (err) { setAdminError("Failed to copy key."); } };
    const handleStartEdit = (key: string, currentUsername: string | null) => { setEditingKey(key); setEditUsernameValue(currentUsername || ''); };
    const handleCancelEdit = () => { setEditingKey(null); setEditUsernameValue(''); };
    const handleSaveUsername = async () => { if (!editingKey || !authenticatedStaffKey) return; setIsAdminLoading(true); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminEditUsername', staffKey: authenticatedStaffKey, key: editingKey, newUsername: editUsernameValue.trim() || null }) }); const data = await res.json(); if (!res.ok) throw new Error(data?.error || 'Server error updating username.'); setAdminSuccess(data.message || "Username updated."); setEditingKey(null); } catch (e) { setAdminError(e instanceof Error ? e.message : "Failed to update username."); } finally { fetchAdminData(authenticatedStaffKey); } };
    const handleNewKeyUsernameChange = (e: ChangeEvent<HTMLInputElement>) => { setNewKeyUsername(e.target.value); };
    const handleEditUsernameChange = (e: ChangeEvent<HTMLInputElement>) => { setEditUsernameValue(e.target.value); };
    const handleMarkImportant = async (feedbackId: number, currentIsImportant: number) => { if (!authenticatedStaffKey) return; setIsAdminLoading(true); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminMarkFeedbackImportant', staffKey: authenticatedStaffKey, feedbackId, isImportant: !currentIsImportant }) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data?.error || 'Failed to update feedback.'); setAdminSuccess(data.message || "Feedback updated."); } catch (e) { setAdminError(e instanceof Error ? e.message : "Failed to update feedback."); } finally { fetchAdminData(authenticatedStaffKey); } };
    const handleDeleteFeedback = async (feedbackId: number) => { if (!authenticatedStaffKey) return; if (!window.confirm(`Are you sure you want to delete feedback entry #${feedbackId}?`)) return; setIsAdminLoading(true); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminDeleteFeedback', staffKey: authenticatedStaffKey, feedbackId }) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data?.error || 'Failed to delete feedback.'); setAdminSuccess(data.message || "Feedback deleted."); } catch (e) { setAdminError(e instanceof Error ? e.message : "Failed to delete feedback."); } finally { fetchAdminData(authenticatedStaffKey); } };
    const handleBasePromptChange = (e: ChangeEvent<HTMLTextAreaElement>) => setBasePrompt(e.target.value);
    const handlePersonaPromptChange = (personaKey: string, value: string) => setPersonaPrompts(prev => ({ ...prev, [personaKey]: value }));
    const handleRevertPromptChanges = () => { if (window.confirm("Are you sure you want to discard your unsaved prompt changes?")) { setBasePrompt(initialBasePrompt); setPersonaPrompts(initialPersonaPrompts); setAdminSuccess("Changes reverted."); } };
    const handleSaveChanges = async () => { if (!authenticatedStaffKey) return; if (!window.confirm("Are you sure you want to save the new prompt configurations?")) return; setIsAdminLoading(true); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminSetPrompts', staffKey: authenticatedStaffKey, baseInstruction: basePrompt, personaInstructions: personaPrompts }) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data?.error || 'Failed to save prompts.'); setAdminSuccess(data.message || "Prompts saved successfully!"); setInitialBasePrompt(basePrompt); setInitialPersonaPrompts(personaPrompts); } catch (e) { setAdminError(e instanceof Error ? e.message : "Failed to save prompts."); } finally { setIsAdminLoading(false); } };
    const hasPromptChanges = basePrompt !== initialBasePrompt || JSON.stringify(personaPrompts) !== JSON.stringify(initialPersonaPrompts);
    const handleFetchHistory = async (userIdToSearch: string) => { if (!authenticatedStaffKey) return; setIsHistoryLoading(true); setHistoryError(null); setViewingHistory(null); setViewingUserId(userIdToSearch); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminGetChatHistory', staffKey: authenticatedStaffKey, userId: userIdToSearch.trim() }) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data?.error || "Failed to fetch history."); setViewingHistory(data.history); if (data.history.length === 0) { setHistoryError("No chat history found for this user."); } } catch (e) { setHistoryError(e instanceof Error ? e.message : "An unknown error occurred."); } finally { setIsHistoryLoading(false); } };
    const handleClearUserHistory = async (userIdToClear: string | null) => { if (!authenticatedStaffKey || !userIdToClear) return; if (!window.confirm(`Are you sure you want to permanently delete all chat history for user ID "${userIdToClear}"?`)) return; setIsAdminLoading(true); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminClearUserHistory', staffKey: authenticatedStaffKey, userId: userIdToClear }) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data?.error || "Failed to clear history."); setAdminSuccess(data.message || "History cleared successfully."); setViewingHistory(null); setViewingUserId(null); fetchAdminData(authenticatedStaffKey); } catch (e) { setAdminError(e instanceof Error ? e.message : "An unknown error occurred while clearing history."); setIsAdminLoading(false); } };
    const handleCloseHistoryView = () => { setViewingHistory(null); setViewingUserId(null); setHistoryError(null); };

    // --- Render Logic ---
    if (isAdminLoading && !usersWithHistory.length && !adminUserKeysList.length) { return <div className="admin-loading-text">Loading Admin Data...</div>; }
    if (!authenticatedStaffKey && !isAdminLoading) { return <div className="admin-feedback error">Error: Not authenticated. Please log in again.</div>; }

    const renderStars = (rating: number) => Array.from({ length: 5 }, (_, i) => <span key={i} className={i < rating ? '' : 'star-empty'}>★</span>);

    return (
        <div className="admin-page-container">
            <div className="admin-page-header"> <h1>Staff Admin Panel</h1> <button onClick={handleLogout} className="admin-logout-button">Logout</button> </div>
            <div className="staff-admin-section">
                <div style={{ minHeight: '40px' }}> {adminSuccess && <p className="admin-feedback success">{adminSuccess}</p>} {adminError && <p className="admin-feedback error">{adminError}</p>} </div>

                <h4>Manage Chat Histories</h4>
                <div className="admin-data-section">
                    <div className="restriction-description" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>View or clear chat histories for registered users.</span>
                        <strong>Total Data Stored: {formatBytes(totalStorageBytes)}</strong>
                    </div>
                    {isAdminLoading && !usersWithHistory.length ? (
                        <p className="admin-loading-text">Loading user histories...</p>
                    ) : usersWithHistory.length > 0 ? (
                        <div className="user-keys-list">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Username</th>
                                        <th>Email</th>
                                        <th>Last Updated</th>
                                        <th>Data Used</th>
                                        <th className="actions-column">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {usersWithHistory.map(user => (
                                        <tr key={user.id}>
                                            <td>{user.username}</td>
                                            <td>{user.email || <span className="no-username"><em>(none)</em></span>}</td>
                                            <td>{new Date(user.last_updated).toLocaleString()}</td>
                                            <td>{formatBytes(user.history_size_bytes)}</td>
                                            <td>
                                                <div className="action-buttons-cell">
                                                    <button onClick={() => handleFetchHistory(user.id)} className="add-key-button" disabled={isHistoryLoading}>
                                                        {isHistoryLoading && viewingUserId === user.id ? 'Loading...' : '👁️ View History'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p>No users with chat histories found.</p>
                    )}
                </div>

                {viewingHistory && viewingUserId && (
                    <div className="chat-history-overlay">
                        <div className="chat-history-modal">
                            <div className="chat-history-header"><h3>Chat History for:</h3><code>{viewingUserId}</code><button onClick={handleCloseHistoryView} className="close-history-button">×</button></div>
                            <div className="chat-history-content">{viewingHistory.length > 0 ? viewingHistory.map((msg, index) => (<div key={index} className={`chat-history-message ${msg.role}`}><span className="chat-history-role">{msg.role}</span><div className="chat-history-text">{msg.parts.map((part: any, pIndex: number) => <p key={pIndex}>{part.text}</p>)}</div></div>)) : <p>No messages in this history.</p>}</div>
                            <div className="chat-history-actions"><button onClick={() => handleClearUserHistory(viewingUserId)} className="delete-button" disabled={isAdminLoading}>🗑️ Clear This User's History</button></div>
                        </div>
                    </div>
                )}

                <hr className="staff-separator" />
                
                <h4>Manage User Access Keys</h4>
                <div className="admin-data-section">
                    <div className="user-keys-list">
                        <table>
                            <thead><tr><th>Key</th><th>Username</th><th>Status</th><th>Created</th><th className="actions-column">Actions</th></tr></thead>
                            <tbody>{adminUserKeysList.map(k => (<tr key={k.key} className={editingKey === k.key ? 'editing-row' : ''}><td><div className="key-cell-content"><code>{k.key}</code><button onClick={() => handleCopyKey(k.key)} className="copy-button" title="Copy Key">📋</button></div></td><td>{editingKey === k.key ? (<input type="text" value={editUsernameValue} onChange={handleEditUsernameChange} className="settings-input inline-edit-input" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSaveUsername(); else if (e.key === 'Escape') handleCancelEdit(); }} />) : (k.username || <span className="no-username"><em>(none)</em></span>)}</td><td><span className={`status-${k.status}`}>{k.status}</span></td><td>{new Date(k.created_at).toLocaleDateString()}</td><td><div className="action-buttons-cell">{editingKey === k.key ? (<><button onClick={handleSaveUsername} className="save-button" disabled={isAdminLoading}>✔️ Save</button><button onClick={handleCancelEdit} className="cancel-button" disabled={isAdminLoading}>❌ Cancel</button></>) : (<><button onClick={() => handleToggleUserKeyStatus(k.key, k.status)} className={`key-status-toggle-button ${k.status === 'active' ? 'deactivate' : 'activate'}`} disabled={isAdminLoading || !!editingKey}>{k.status === 'active' ? 'Deactivate' : 'Activate'}</button><button onClick={() => handleStartEdit(k.key, k.username)} className="edit-button" disabled={isAdminLoading || !!editingKey}>✏️</button><button onClick={() => handleDeleteKey(k.key)} className="delete-button" disabled={isAdminLoading || !!editingKey} title={`Delete key`}>🗑️</button></>)}</div></td></tr>))}</tbody>
                        </table>
                    </div>
                    <div className="add-key-section"><h5>Add New Key</h5><div className="add-key-form"><div className="settings-option" style={{ flexGrow: 1 }}><label htmlFor="new-key-username">Username (Optional):</label><input type="text" id="new-key-username" className="settings-input" value={newKeyUsername} onChange={handleNewKeyUsernameChange} placeholder="Assign username (optional)" disabled={isAdminLoading || !!editingKey} /></div><button onClick={handleAddNewKey} className="add-key-button" disabled={isAdminLoading || !!editingKey}>{isAdminLoading ? 'Adding...' : '+ Add Key'}</button></div></div>
                </div>

                <hr className="staff-separator" />
                <h4>Manage User Feedback</h4>
                <div className="admin-data-section">
                    {adminFeedbackList.length > 0 ? (
                        <div className="feedback-list">
                            <table>
                                <thead><tr><th>Submitted</th><th>Email</th><th>Rating</th><th style={{ width: "40%" }}>Comment</th><th className="actions-column">Actions</th></tr></thead>
                                <tbody>{adminFeedbackList.map(fb => (<tr key={fb.id} className={`feedback-item ${fb.is_important ? 'important-feedback' : ''}`}><td>{new Date(fb.submitted_at).toLocaleString()}</td><td>{fb.email || <span className="no-username"><em>(none)</em></span>}</td><td><div className="rating-stars-display">{renderStars(fb.rating)}</div></td><td className="feedback-comment-cell">{fb.comment}</td><td><div className="action-buttons-cell"><button onClick={() => handleMarkImportant(fb.id, fb.is_important)} className={`feedback-action-button ${fb.is_important ? 'unmark-important' : 'mark-important'}`} disabled={isAdminLoading || !!editingKey}>{fb.is_important ? '★ Unmark' : '☆ Mark Imp'}</button><button onClick={() => handleDeleteFeedback(fb.id)} className="delete-button feedback-delete-button" disabled={isAdminLoading || !!editingKey}>🗑️ Delete</button></div></td></tr>))}</tbody>
                            </table>
                        </div>
                    ) : (<p>No feedback submitted yet.</p>)}
                </div>

                <hr className="staff-separator" />
                <h4>Manage AI Prompts</h4>
                <div className="admin-prompt-warning">⚠️ **Caution:** Editing prompts directly affects AI behavior. Incorrect formatting can break functionality.</div>
                <div className="admin-data-section prompt-editing-section">
                    <div className="prompt-edit-area"><label htmlFor="base-prompt-edit">Base System Instruction:</label><textarea id="base-prompt-edit" className="prompt-textarea" value={basePrompt} onChange={handleBasePromptChange} rows={10} disabled={isAdminLoading || !!editingKey} /></div>
                    <h5>Persona Instructions:</h5>
                    {ALL_PERSONA_KEYS.map(key => (<div className="prompt-edit-area" key={key}><label htmlFor={`persona-prompt-${key}`}>{key.charAt(0).toUpperCase() + key.slice(1)}:</label><textarea id={`persona-prompt-${key}`} className="prompt-textarea persona-textarea" value={personaPrompts[key as Persona] || ''} onChange={(e) => handlePersonaPromptChange(key, e.target.value)} rows={6} disabled={isAdminLoading || !!editingKey} /></div>))}
                    <div className="prompt-actions"><button onClick={handleSaveChanges} className="save-button" disabled={!hasPromptChanges || isAdminLoading || !!editingKey} title={!hasPromptChanges ? "No changes to save" : "Save changes"}>{isAdminLoading ? 'Saving...' : '💾 Save Prompt Changes'}</button><button onClick={handleRevertPromptChanges} className="cancel-button" disabled={!hasPromptChanges || isAdminLoading || !!editingKey} title="Discard unsaved changes">↩️ Revert Changes</button></div>
                </div>

                <hr className="staff-separator" />
                <h4>Manage Restricted Models</h4>
                <div className="admin-data-section">
                    <div className="restricted-items-list">
                        <p className="restriction-description">Toggle which models require a user access key.</p>
                        {ALL_AVAILABLE_MODELS_FRONTEND.map(mInfo => { const isRestricted = adminRestrictedModelsList.includes(mInfo.value); return (<div key={mInfo.value} className="restriction-item"><span>{mInfo.label} (<code>{mInfo.value}</code>)</span><button onClick={() => handleToggleModelRestriction(mInfo.value)} className={`restriction-toggle-button ${isRestricted ? 'deactivate' : 'activate'}`} disabled={isAdminLoading || !!editingKey}>{isRestricted ? 'Restricted ✔' : 'Public'}</button></div>); })}
                    </div>
                </div>

                <hr className="staff-separator" />
                <h4>Manage Restricted Personas</h4>
                <div className="admin-data-section">
                    <div className="restricted-items-list">
                        <p className="restriction-description">Toggle which personas require a user access key.</p>
                        {AVAILABLE_PERSONAS.map(pInfo => { const isRestricted = adminRestrictedPersonasList.includes(pInfo.value); return (<div key={pInfo.value} className="restriction-item"><span>{pInfo.emoji} {pInfo.label} (<code>{pInfo.value}</code>)</span><button onClick={() => handleTogglePersonaRestriction(pInfo.value)} className={`restriction-toggle-button ${isRestricted ? 'deactivate' : 'activate'}`} disabled={isAdminLoading || !!editingKey}>{isRestricted ? 'Restricted ✔' : 'Public'}</button></div>); })}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AdminPage;