// src/App.tsx - Includes Add/Delete User Key Management in Staff Panel
import React, { useState, useEffect, ChangeEvent, useRef } from 'react';
import ReactGA from 'react-ga4';
import './App.css';
import ChatbotPage from './ChatbotPage';

// --- GA ---
const GA_MEASUREMENT_ID = "G-JX58QMMKZY"; // Replace with your actual Measurement ID
if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" && GA_MEASUREMENT_ID !== "YOUR_GA_ID_HERE") { try { ReactGA.initialize(GA_MEASUREMENT_ID); console.log("GA Init:", GA_MEASUREMENT_ID); ReactGA.send({ hitType: "pageview", page: window.location.pathname + window.location.search, title: "Initial Load" }); } catch (e) { console.error("GA Init Err:", e); } } else { console.warn("GA ID missing/invalid/placeholder. GA not initialized."); }

// --- Types & Interfaces ---
export interface Message { id: number; text: string; sender: 'user' | 'bot' | 'loading'; timestamp: number; imageUrl?: string; modelUsed?: string; }
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-pro-exp-03-25' | 'gemini-2.0-flash-thinking-exp-01-21' | 'gemini-2.0-flash-exp-image-generation';
export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR';
export type Persona = 'normal' | 'therapist' | 'university_master';
interface KeyValidationStatus { isValid: boolean | null; username: string | null; loading: boolean; error?: string | null; }
interface UserKeyInfo { key: string; username: string | null; status: 'active' | 'inactive'; created_at: string; }

// --- localStorage Keys ---
const CHAT_STORAGE_KEY = 'chatMessages'; const BETA_ACCEPTED_KEY = 'betaAccepted'; const MODEL_STORAGE_KEY = 'selectedApiModel'; const STT_LANG_STORAGE_KEY = 'selectedSttLang'; const ACCESS_KEY_STORAGE_KEY = 'userAccessKey'; const PERSONA_STORAGE_KEY = 'selectedPersona';

// --- Configurations ---
interface ModelInfo { value: GeminiModel; label: string; restricted: boolean; }
const ALL_AVAILABLE_MODELS_FRONTEND: ModelInfo[] = [ { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', restricted: false }, { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', restricted: false }, { value: 'gemini-2.0-flash-thinking-exp-01-21', label: 'Gemini 2.0 Flash Thinking Exp', restricted: true }, { value: 'gemini-2.0-flash-exp-image-generation', label: 'Gemini 2.0 Flash Image Gen Exp', restricted: true }, { value: 'gemini-2.5-pro-exp-03-25', label: 'Gemini 2.5 Pro Exp', restricted: true } ];
const ALL_MODEL_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS_FRONTEND.map(m => m.value);
interface PersonaInfo { value: Persona; label: string; emoji: string; restricted: boolean; }
const AVAILABLE_PERSONAS: PersonaInfo[] = [ { value: 'university_master', label: 'University Master', emoji: '🎓', restricted: false }, { value: 'normal', label: 'Normal Bot', emoji: '🤖', restricted: true }, { value: 'therapist', label: 'Therapist', emoji: '🧠', restricted: true } ];
const ALL_PERSONAS: Persona[] = AVAILABLE_PERSONAS.map(p => p.value);
const DEFAULT_UNRESTRICTED_PERSONA: Persona = 'university_master';
const RESTRICTED_MODELS_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS_FRONTEND.filter(m => m.restricted).map(m => m.value);
const RESTRICTED_PERSONAS_VALUES: Persona[] = AVAILABLE_PERSONAS.filter(p => p.restricted).map(p => p.value);

// --- API ---
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';
interface ApiRequestBody { prompt?: string; model?: GeminiModel; persona?: Persona; imageMimeType?: string; imageDataUrl?: string; accessKey?: string; action: string; staffKey?: string; key?: string; newStatus?: 'active' | 'inactive'; models?: GeminiModel[]; personas?: Persona[]; username?: string | null; } // Added username for AddKey
async function getBotResponseForAnalysis(userInput: string, model: GeminiModel, persona: Persona, accessKey: string): Promise<string> { const promptToSend = userInput; if (!promptToSend) return "Error: No text provided for analysis."; const requestBody: ApiRequestBody = { action: 'chat', prompt: promptToSend, model: model, persona: persona, accessKey: accessKey }; console.log(`Sending Analysis Request (Model: ${model}, Persona: ${persona})`); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) }); if (!res.ok) { const errData = await res.json().catch(() => ({ error: `HTTP Error ${res.status}: ${res.statusText}` })); throw new Error(errData?.error || `HTTP Error ${res.status}`); } const data = await res.json(); if (data.error) throw new Error(data.error); return data.reply || 'No reply received.'; } catch (e) { console.error('Analysis API Error:', e); if (e instanceof Error) { if (e.message.includes("Access Key required") || e.message.includes("Invalid or inactive")) return "Error: Access Key required or invalid/inactive."; return `Error: ${e.message}`; } return 'Error: Could not fetch analysis response.'; } }
const VALIDATION_DEBOUNCE_MS = 600;

function App() {
    // --- State ---
    const [messages, setMessages] = useState<Message[]>(() => { const stored = localStorage.getItem(CHAT_STORAGE_KEY); let initial: Message[] = []; try { initial = stored && stored !== '[]' ? JSON.parse(stored) : []; if (!Array.isArray(initial)) throw new Error("Bad format"); initial = initial.filter(m => m.sender !== 'loading'); } catch (e) { console.error("Bad stored messages:", e); localStorage.removeItem(CHAT_STORAGE_KEY); initial = []; } if (initial.length === 0) { const ts = Date.now(); return [{ id: ts, text: "Welcome! How can I assist you today?", sender: 'bot', timestamp: ts }]; } else { return initial; } });
    const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);
    const [enteredKey, setEnteredKey] = useState<string>(() => localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '');
    const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.0-flash');
    const [sttLang, setSttLang] = useState<SpeechLanguage>(() => { const stored = localStorage.getItem(STT_LANG_STORAGE_KEY) as SpeechLanguage | null; return (stored && ['en-US','th-TH','es-ES','fr-FR'].includes(stored)) ? stored : 'en-US'; });
    const [selectedPersona, setSelectedPersona] = useState<Persona>(DEFAULT_UNRESTRICTED_PERSONA);
    const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
    const [isAnalysisFormVisible, setIsAnalysisFormVisible] = useState<boolean>(false);
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
    const [field1, setField1] = useState(''); const [field2, setField2] = useState(''); const [field3, setField3] = useState(''); const [field4, setField4] = useState(''); const [field5, setField5] = useState('');
    const [keyStatus, setKeyStatus] = useState<KeyValidationStatus>({ isValid: null, username: null, loading: false, error: null });
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isStaffPanelVisible, setIsStaffPanelVisible] = useState<boolean>(false);
    const [enteredStaffKey, setEnteredStaffKey] = useState<string>('');
    const [isStaffAuthenticated, setIsStaffAuthenticated] = useState<boolean>(false);
    const [adminUserKeysList, setAdminUserKeysList] = useState<UserKeyInfo[]>([]);
    const [adminRestrictedModelsList, setAdminRestrictedModelsList] = useState<GeminiModel[]>([]);
    const [adminRestrictedPersonasList, setAdminRestrictedPersonasList] = useState<Persona[]>([]);
    const [newKeyUsername, setNewKeyUsername] = useState<string>(''); // <-- State for Add Key input
    const [isAdminLoading, setIsAdminLoading] = useState<boolean>(false);
    const [adminError, setAdminError] = useState<string | null>(null);
    const [adminSuccess, setAdminSuccess] = useState<string | null>(null); // <-- State for success messages

    // --- Effects ---
    useEffect(() => { /* Debounced Key Validation */ const keyTrimmed = enteredKey.trim(); if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current); const currentModel = selectedModel; const currentPersona = selectedPersona; if (!keyTrimmed) { setKeyStatus({ isValid: null, username: null, loading: false, error: null }); if (RESTRICTED_MODELS_VALUES.includes(currentModel)) setSelectedModel('gemini-2.0-flash'); if (RESTRICTED_PERSONAS_VALUES.includes(currentPersona)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA); return; } setKeyStatus(prev => ({ ...prev, loading: true, isValid: null, error: null, username: null })); debounceTimeoutRef.current = setTimeout(async () => { try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'validateKey', accessKey: keyTrimmed }) }); const data = await res.json().catch(() => ({ error: `Invalid JSON response.` })); if (!res.ok) throw new Error(data?.error || `Validation failed: HTTP ${res.status}`); if (data.isValid) { setKeyStatus({ isValid: true, username: data.username || 'User', loading: false, error: null }); const savedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null; if (savedModel && ALL_MODEL_VALUES.includes(savedModel)) setSelectedModel(savedModel); else if (RESTRICTED_MODELS_VALUES.includes(currentModel)) setSelectedModel(currentModel); else setSelectedModel(currentModel); const savedPersona = localStorage.getItem(PERSONA_STORAGE_KEY) as Persona | null; if (savedPersona && ALL_PERSONAS.includes(savedPersona)) setSelectedPersona(savedPersona); else if (RESTRICTED_PERSONAS_VALUES.includes(currentPersona)) setSelectedPersona(currentPersona); else setSelectedPersona(currentPersona); } else { setKeyStatus({ isValid: false, username: null, loading: false, error: data?.error || 'Invalid key.' }); if (RESTRICTED_MODELS_VALUES.includes(currentModel)) setSelectedModel('gemini-2.0-flash'); if (RESTRICTED_PERSONAS_VALUES.includes(currentPersona)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA); } } catch (error) { const msg = error instanceof Error ? error.message : "Validation network/server error."; setKeyStatus({ isValid: false, username: null, loading: false, error: msg }); if (RESTRICTED_MODELS_VALUES.includes(currentModel)) setSelectedModel('gemini-2.0-flash'); if (RESTRICTED_PERSONAS_VALUES.includes(currentPersona)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA); } }, VALIDATION_DEBOUNCE_MS); return () => { if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current); }; }, [enteredKey, selectedModel, selectedPersona]);
    useEffect(() => { /* Initial Load */ const initialKey = localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || ''; const savedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null; const savedPersona = localStorage.getItem(PERSONA_STORAGE_KEY) as Persona | null; let iModel: GeminiModel = 'gemini-2.0-flash'; if (savedModel && ALL_MODEL_VALUES.includes(savedModel)) iModel = savedModel; setSelectedModel(iModel); let iPersona: Persona = DEFAULT_UNRESTRICTED_PERSONA; if (savedPersona && ALL_PERSONAS.includes(savedPersona)) iPersona = savedPersona; setSelectedPersona(iPersona); const accepted = localStorage.getItem(BETA_ACCEPTED_KEY); if (accepted !== 'true') setShowBetaNotice(true); if (initialKey.trim()) { const validateInitial = async (key: string, model: GeminiModel, persona: Persona) => { setKeyStatus(prev => ({ ...prev, loading: true })); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'validateKey', accessKey: key }) }); const data = await res.json().catch(()=>({error:'Invalid JSON'})); if (res.ok && data.isValid) { setKeyStatus({ isValid: true, username: data.username || 'User', loading: false, error: null }); setSelectedModel(model); setSelectedPersona(persona); } else { setKeyStatus({ isValid: false, username: null, loading: false, error: data?.error || 'Invalid key' }); if(RESTRICTED_MODELS_VALUES.includes(model)) setSelectedModel('gemini-2.0-flash'); if(RESTRICTED_PERSONAS_VALUES.includes(persona)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA); } } catch (e) { setKeyStatus({ isValid: false, username: null, loading: false, error: 'Validation failed' }); if(RESTRICTED_MODELS_VALUES.includes(model)) setSelectedModel('gemini-2.0-flash'); if(RESTRICTED_PERSONAS_VALUES.includes(persona)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA); } }; validateInitial(initialKey, iModel, iPersona); } else { if(RESTRICTED_MODELS_VALUES.includes(iModel)) setSelectedModel('gemini-2.0-flash'); if(RESTRICTED_PERSONAS_VALUES.includes(iPersona)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA); } }, []);
    useEffect(() => { /* Persistence */ const messagesToSave = messages.filter(msg => msg.sender !== 'loading'); if (messagesToSave.length > 1 || (messagesToSave.length === 1 && messagesToSave[0].sender !== 'bot')) { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messagesToSave)); } else if (messagesToSave.length === 0) { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify([])); } }, [messages]); useEffect(() => { localStorage.setItem(MODEL_STORAGE_KEY, selectedModel); }, [selectedModel]); useEffect(() => { localStorage.setItem(STT_LANG_STORAGE_KEY, sttLang); }, [sttLang]); useEffect(() => { localStorage.setItem(ACCESS_KEY_STORAGE_KEY, enteredKey); }, [enteredKey]); useEffect(() => { localStorage.setItem(PERSONA_STORAGE_KEY, selectedPersona); }, [selectedPersona]);

    // Clear success message after a delay
    useEffect(() => {
        let timer: NodeJS.Timeout | null = null;
        if (adminSuccess) {
            timer = setTimeout(() => setAdminSuccess(null), 3000); // Clear after 3 seconds
        }
        return () => { if (timer) clearTimeout(timer); };
    }, [adminSuccess]);


    // --- Event Handlers ---
    const handleAcceptBeta = () => { localStorage.setItem(BETA_ACCEPTED_KEY, 'true'); setShowBetaNotice(false); };
    const handleModelChange = (e: ChangeEvent<HTMLSelectElement>) => { const m = e.target.value as GeminiModel; if (ALL_MODEL_VALUES.includes(m)) setSelectedModel(m); };
    const handleSttLangChange = (e: ChangeEvent<HTMLSelectElement>) => { setSttLang(e.target.value as SpeechLanguage); };
    const handlePersonaChange = (e: ChangeEvent<HTMLSelectElement>) => { const p = e.target.value as Persona; if (ALL_PERSONAS.includes(p)) setSelectedPersona(p); };
    const toggleSettings = () => { setIsSettingsOpen(prev => !prev); if (isSettingsOpen && isStaffPanelVisible) { setIsStaffPanelVisible(false); setIsStaffAuthenticated(false); setEnteredStaffKey(''); setAdminError(null); setAdminSuccess(null); } };
    const handleClearChat = () => { if (window.confirm("Clear chat?")) { const ts = Date.now(); const msg: Message = { id: ts, text: "Chat cleared.", sender: 'bot', timestamp: ts }; setMessages([msg]); localStorage.removeItem(CHAT_STORAGE_KEY); setIsSettingsOpen(false); } };
    const handleAccessKeyChange = (event: ChangeEvent<HTMLInputElement>) => { setEnteredKey(event.target.value); };
    const handleExportChat = () => { const messagesToExport = messages.filter(m => m.sender !== 'loading'); if (messagesToExport.length === 0 || (messagesToExport.length === 1 && messagesToExport[0].sender === 'bot')) return alert("Chat empty."); let content = `Chat Export\nAt: ${new Date().toLocaleString()}\nModel: ${selectedModel}\nPersona: ${selectedPersona}\nUser: ${keyStatus.isValid ? keyStatus.username : 'N/A'}\n----\n\n`; messagesToExport.forEach(m => { const time = new Date(m.timestamp).toLocaleString(); content += `[${time}] ${m.sender === 'user' ? 'User' : 'Bot'}:\n${m.text}\n${m.imageUrl ? `(Image: ${m.imageUrl})\n` : ''}\n`; }); try { const blob = new Blob([content], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); const fname = `theraphy-chat-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`; a.href = url; a.download = fname; a.click(); URL.revokeObjectURL(url); if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" && GA_MEASUREMENT_ID !== "YOUR_GA_ID_HERE") ReactGA.event({ category: "Chat", action: "Export", label: `Count: ${messagesToExport.length}` }); setIsSettingsOpen(false); } catch (e) { console.error("Export failed:", e); alert("Export failed."); } };

    // --- Analysis Form Handlers ---
    const clearAnalysisForm = () => { setField1(''); setField2(''); setField3(''); setField4(''); setField5(''); };
    const toggleAnalysisForm = () => { setIsAnalysisFormVisible(prev => !prev); if (isAnalysisFormVisible) { clearAnalysisForm(); setIsAnalyzing(false); } };
    const handleAnalysisSubmit = async (event: React.FormEvent) => { event.preventDefault(); const v1 = field1.trim(); const v2 = field2.trim(); const v3 = field3.trim(); const v4 = field4.trim(); const v5 = field5.trim(); if (!v1 || !v2 || !v3 || !v4 || !v5 || isAnalyzing) return alert("Please fill all fields."); setIsAnalyzing(true); if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" && GA_MEASUREMENT_ID !== "YOUR_GA_ID_HERE") { try { ReactGA.event({ category: "Analysis", action: "Submit", label: `F1 Len: ${v1.length}` }); } catch (e) { console.error("GA event fail:", e); } } let analysisInput = `Field 1: ${v1}\nField 2: ${v2}\nField 3: ${v3}\nField 4: ${v4}\nField 5: ${v5}\n`; const tsStart = Date.now(); const loadingMsg: Message = { id: tsStart, text: `Analyzing...`, sender: 'loading', timestamp: tsStart }; setMessages(prev => [...prev, loadingMsg]); const analysisResult = await getBotResponseForAnalysis(analysisInput.trim(), selectedModel, selectedPersona, enteredKey); setMessages(prev => prev.filter(m => m.id !== tsStart)); if (analysisResult.startsWith("Error: Access Key required")) { setKeyStatus({ isValid: false, username: null, loading: false, error: "Access Key required for analysis." }); const errTime = Date.now() + 1; const errorMsg: Message = { id: errTime, text: analysisResult, sender: 'bot', timestamp: errTime }; setMessages(prev => [...prev, errorMsg]); } else if (analysisResult.startsWith("Error:")) { setKeyStatus(prev => ({...prev, error: analysisResult })); const errTime = Date.now() + 1; const errorMsg: Message = { id: errTime, text: analysisResult, sender: 'bot', timestamp: errTime }; setMessages(prev => [...prev, errorMsg]); } else { setKeyStatus(prev => ({...prev, error: null })); const tsEnd = Date.now() + 1; const resultMsg: Message = { id: tsEnd, text: analysisResult, sender: 'bot', timestamp: tsEnd }; setMessages(prev => [...prev, resultMsg]); clearAnalysisForm(); setIsAnalysisFormVisible(false); } setIsAnalyzing(false); };

    // --- Staff Panel Handlers ---
    const toggleStaffPanel = () => { setIsStaffPanelVisible(prev => !prev); if (isStaffPanelVisible) { setIsStaffAuthenticated(false); setEnteredStaffKey(''); setAdminError(null); setAdminSuccess(null); setNewKeyUsername(''); setAdminUserKeysList([]); setAdminRestrictedModelsList([]); setAdminRestrictedPersonasList([]); } };
    const handleStaffKeyChange = (e: ChangeEvent<HTMLInputElement>) => { setEnteredStaffKey(e.target.value); };
    const handleNewKeyUsernameChange = (e: ChangeEvent<HTMLInputElement>) => { setNewKeyUsername(e.target.value); }; // <-- Handler for new username input
    const handleStaffLogin = async () => { if (!enteredStaffKey.trim()) { setAdminError("Staff Key cannot be empty."); return; } setIsAdminLoading(true); setAdminError(null); setAdminSuccess(null); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'staffLogin', staffKey: enteredStaffKey }) }); const data = await res.json().catch(() => ({ error: 'Invalid JSON from login' })); if (!res.ok || !data.isValid) { throw new Error(data?.error || `Staff Login Failed: ${res.status}`); } setIsStaffAuthenticated(true); setAdminError(null); } catch (e) { console.error("Staff login failed:", e); setIsStaffAuthenticated(false); setAdminError(e instanceof Error ? e.message : "Staff login failed."); } finally { setIsAdminLoading(false); } };
    const fetchAdminData = async () => { if (!isStaffAuthenticated || !enteredStaffKey) return; setIsAdminLoading(true); setAdminError(null); setAdminSuccess(null); setAdminUserKeysList([]); setAdminRestrictedModelsList([]); setAdminRestrictedPersonasList([]); try { const [keysRes, restrictRes] = await Promise.all([ fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminListKeys', staffKey: enteredStaffKey }) }), fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminGetRestrictions', staffKey: enteredStaffKey }) }) ]); const keysData = await keysRes.json().catch(() => ({ error: 'Invalid JSON keys' })); if (!keysRes.ok || !keysData.success) throw new Error(keysData?.error || 'Failed fetch keys.'); setAdminUserKeysList(keysData.keys || []); const restrictData = await restrictRes.json().catch(() => ({ error: 'Invalid JSON restrictions' })); if (!restrictRes.ok || !restrictData.success) throw new Error(restrictData?.error || 'Failed fetch restrictions.'); setAdminRestrictedModelsList(restrictData.restrictedModels || []); setAdminRestrictedPersonasList(restrictData.restrictedPersonas || []); } catch (e) { console.error("Fetch admin data error:", e); setAdminError(e instanceof Error ? e.message : "Failed load admin data."); } finally { setIsAdminLoading(false); } };
    useEffect(() => { if (isStaffPanelVisible && isStaffAuthenticated) fetchAdminData(); }, [isStaffPanelVisible, isStaffAuthenticated]);

    const handleToggleUserKeyStatus = async (key: string, currentStatus: 'active' | 'inactive') => { const newStatus = currentStatus === 'active' ? 'inactive' : 'active'; const keySnippet = key.substring(0, 8); if (!window.confirm(`Set key "${keySnippet}..." to ${newStatus}?`)) return; setIsAdminLoading(true); setAdminError(null); setAdminSuccess(null); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminUpdateKeyStatus', staffKey: enteredStaffKey, key: key, newStatus: newStatus }) }); const data = await res.json().catch(() => ({ error: 'Invalid JSON' })); if (!res.ok || !data.success) throw new Error(data?.error || `Update failed: ${res.status}`); setAdminSuccess(data.message || "Status updated."); } catch (e) { console.error("Key status update fail:", e); setAdminError(e instanceof Error ? e.message : "Failed update."); } finally { fetchAdminData(); } };
    const handleToggleModelRestriction = async (modelValue: GeminiModel) => { const isRestricted = adminRestrictedModelsList.includes(modelValue); const actionText = isRestricted ? "make public" : "make restricted"; if (!window.confirm(`Make model "${modelValue}" ${actionText}?`)) return; const newList = isRestricted ? adminRestrictedModelsList.filter(m => m !== modelValue) : [...adminRestrictedModelsList, modelValue]; setIsAdminLoading(true); setAdminError(null); setAdminSuccess(null); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminSetRestrictedModels', staffKey: enteredStaffKey, models: newList }) }); const data = await res.json().catch(() => ({ error: 'Invalid JSON' })); if (!res.ok || !data.success) throw new Error(data?.error || `Save failed: ${res.status}`); setAdminSuccess(data.message || "Model restrictions updated."); } catch (error) { console.error("Save model restrictions fail:", error); setAdminError(error instanceof Error ? error.message : "Failed save."); } finally { fetchAdminData(); } };
    const handleTogglePersonaRestriction = async (personaValue: Persona) => { const isRestricted = adminRestrictedPersonasList.includes(personaValue); const pInfo = AVAILABLE_PERSONAS.find(p => p.value === personaValue); const pLabel = pInfo ? pInfo.label : personaValue; const actionText = isRestricted ? "make public" : "make restricted"; if (!window.confirm(`Make persona "${pLabel}" ${actionText}?`)) return; const newList = isRestricted ? adminRestrictedPersonasList.filter(p => p !== personaValue) : [...adminRestrictedPersonasList, personaValue]; setIsAdminLoading(true); setAdminError(null); setAdminSuccess(null); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminSetRestrictedPersonas', staffKey: enteredStaffKey, personas: newList }) }); const data = await res.json().catch(() => ({ error: 'Invalid JSON' })); if (!res.ok || !data.success) throw new Error(data?.error || `Save failed: ${res.status}`); setAdminSuccess(data.message || "Persona restrictions updated."); } catch (error) { console.error("Save persona restrictions fail:", error); setAdminError(error instanceof Error ? error.message : "Failed save."); } finally { fetchAdminData(); } };

    // --- NEW: Add Key Handler ---
    const handleAddNewKey = async () => {
        setIsAdminLoading(true);
        setAdminError(null);
        setAdminSuccess(null);
        const usernameToSend = newKeyUsername.trim() || null; // Send null if empty

        try {
             const res = await fetch(WORKER_URL, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     action: 'adminAddKey',
                     staffKey: enteredStaffKey,
                     username: usernameToSend
                 })
             });
             const data = await res.json().catch(() => ({ error: 'Invalid JSON response from add key' }));
             if (!res.ok || !data.success) { // Check status code (like 201) and success flag
                 throw new Error(data?.error || `Failed to add key: ${res.status}`);
             }
             setAdminSuccess(data.message || "Key added successfully!");
             setNewKeyUsername(''); // Clear input on success
         } catch (e) {
             console.error("Add key failed:", e);
             setAdminError(e instanceof Error ? e.message : "Failed to add key.");
         } finally {
            // Always refresh the list after attempting to add
            fetchAdminData();
         }
    };

    // --- NEW: Delete Key Handler ---
    const handleDeleteKey = async (keyToDelete: string) => {
        const keySnippet = keyToDelete.substring(0, 8);
        if (!window.confirm(`DELETE key "${keySnippet}..."? This cannot be undone.`)) return;

        setIsAdminLoading(true);
        setAdminError(null);
        setAdminSuccess(null);
        try {
            const res = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'adminDeleteKey',
                    staffKey: enteredStaffKey,
                    key: keyToDelete
                })
            });
            const data = await res.json().catch(() => ({ error: 'Invalid JSON response from delete key' }));
             if (!res.ok || !data.success) {
                 throw new Error(data?.error || `Failed to delete key: ${res.status}`);
             }
             setAdminSuccess(data.message || "Key deleted successfully!");
         } catch (e) {
             console.error("Delete key failed:", e);
             setAdminError(e instanceof Error ? e.message : "Failed to delete key.");
         } finally {
            // Always refresh the list after attempting to delete
            fetchAdminData();
         }
    };


    // --- JSX ---
    return (
        <div className="App">
            {isSettingsOpen && ( <div className="settings-menu"> {/* ... Settings Menu JSX (no changes needed here) ... */} <h3 id="settings-title">Settings</h3> <div className="settings-grid"> <div className="settings-column"> <div className="settings-option"> <label htmlFor="access-key-input">Access Key:</label> <input type="password" id="access-key-input" className="settings-input" placeholder="Enter access key" value={enteredKey} onChange={handleAccessKeyChange} autoComplete="off"/> <div className="settings-key-status">{keyStatus.loading?<span>Validating...</span>:keyStatus.isValid===true&&keyStatus.username?<span>✅ Valid. Welcome, {keyStatus.username}!</span>:keyStatus.isValid===false?<span>❌ {keyStatus.error||"Invalid key."}</span>:!enteredKey.trim()?<span>Enter key for restricted features.</span>:<span>Validation pending...</span>}</div> </div> <div className="settings-option"> <label htmlFor="persona-select">Persona:</label> <select id="persona-select" value={selectedPersona} onChange={handlePersonaChange} className="settings-select" disabled={AVAILABLE_PERSONAS.find(p=>p.value===selectedPersona)?.restricted&&keyStatus.isValid!==true}>{AVAILABLE_PERSONAS.map((p)=>{const isDisabled=p.restricted&&keyStatus.isValid!==true;const style=isDisabled?{color:'#888',fontStyle:'italic'}:{};return(<option key={p.value} value={p.value} disabled={isDisabled} style={style}>{p.emoji} {p.label}{p.restricted?' (Key) ':''}</option>);})}</select> </div> <div className="settings-option"> <label htmlFor="model-select">AI Model:</label> <select id="model-select" value={selectedModel} onChange={handleModelChange} className="settings-select" disabled={ALL_AVAILABLE_MODELS_FRONTEND.find(m=>m.value===selectedModel)?.restricted&&keyStatus.isValid!==true}>{ALL_AVAILABLE_MODELS_FRONTEND.map((m)=>{const isDisabled=m.restricted&&keyStatus.isValid!==true;const style=isDisabled?{color:'#888',fontStyle:'italic'}:{};return(<option key={m.value} value={m.value} disabled={isDisabled} style={style}>{m.label}{m.restricted?' (Key)':''}</option>);})}</select> {keyStatus.isValid!==true&&(RESTRICTED_PERSONAS_VALUES.length>0||RESTRICTED_MODELS_VALUES.length>0)&&(<p className="settings-helper-text">Enter valid key for restricted options.</p>)} </div> </div> <div className="settings-column"> <div className="settings-option"> <label htmlFor="stt-lang-select">Speech Lang:</label> <select id="stt-lang-select" value={sttLang} onChange={handleSttLangChange} className="settings-select"><option value="en-US">English (US)</option><option value="th-TH">ไทย (Thai)</option><option value="es-ES">Español</option><option value="fr-FR">Français</option></select> </div> <div className="settings-option"> <label>Chat Actions:</label> <div><button onClick={handleExportChat} className="settings-action-button export-chat-settings-button">💾 Export Chat</button><button onClick={handleClearChat} className="settings-action-button clear-chat-settings-button">🗑️ Clear Chat</button></div> </div> <div className="settings-option"> <label>Admin Area:</label> <button onClick={toggleStaffPanel} className="settings-action-button staff-area-button">🔑 Staff Panel</button> </div> </div> </div> <hr className="settings-separator" /> <button onClick={toggleSettings} className="close-settings-button">Close</button> </div> )}

            {isStaffPanelVisible && (
                <div className="staff-panel-overlay">
                    <div className="staff-panel-modal">
                        <h3 id="staff-panel-title">Staff Panel</h3>
                        <button onClick={toggleStaffPanel} className="close-staff-panel-button" title="Close">×</button>
                        {!isStaffAuthenticated ? (
                            <div className="staff-login-section"> <div className="settings-option"> <label htmlFor="staff-key-input">Staff Key:</label> <input type="password" id="staff-key-input" className="settings-input" value={enteredStaffKey} onChange={handleStaffKeyChange} placeholder="Enter staff access key" disabled={isAdminLoading}/> </div> <button onClick={handleStaffLogin} className="staff-login-button" disabled={isAdminLoading||!enteredStaffKey.trim()}> {isAdminLoading ? 'Verifying...' : 'Login'} </button> {adminError && <p className="staff-error">{adminError}</p>} <p className="staff-security-warning">Authorized access only.</p> </div>
                        ) : (
                            <div className="staff-admin-section">
                                {adminSuccess && <p className="key-valid" style={{textAlign:'center', marginBottom:'15px'}}>{adminSuccess}</p>}
                                {adminError && !isAdminLoading && <p className="staff-error" style={{marginBottom:'15px'}}>{adminError}</p>}

                                <h4>Manage User Access Keys</h4>
                                <div className="admin-data-section">
                                    {isAdminLoading && !adminUserKeysList.length && <p>Loading keys...</p>}
                                    {!isAdminLoading && !adminError && adminUserKeysList.length === 0 && <p>No keys found.</p>}
                                    {!isAdminLoading && !adminError && adminUserKeysList.length > 0 && (
                                        <div className="user-keys-list">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>Key Prefix</th><th>Username</th><th>Status</th><th>Created</th>
                                                        <th style={{width: '150px'}}>Actions</th> {/* Wider Actions column */}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {adminUserKeysList.map(k => (
                                                    <tr key={k.key}>
                                                        <td><code>{k.key.substring(0, 8)}...</code></td>
                                                        <td>{k.username||'-'}</td>
                                                        <td><span style={{color: k.status==='active'?'var(--key-valid-color)':'var(--key-invalid-color)', fontWeight:500}}>{k.status}</span></td>
                                                        <td>{new Date(k.created_at).toLocaleDateString()}</td>
                                                        <td style={{ display: 'flex', gap: '5px' }}> {/* Flex for buttons */}
                                                            <button onClick={()=>handleToggleUserKeyStatus(k.key,k.status)} className={`key-status-toggle-button ${k.status==='active'?'deactivate':'activate'}`} disabled={isAdminLoading} style={{flexGrow: 1}}>{k.status==='active'?'Deactivate':'Activate'}</button>
                                                            {/* --- Added Delete Button --- */}
                                                            <button onClick={()=>handleDeleteKey(k.key)} className="key-status-toggle-button deactivate" disabled={isAdminLoading} title={`Delete key ${k.key.substring(0, 4)}...`} style={{ flexGrow: 0, padding: '4px 6px'}}>🗑️</button>
                                                        </td>
                                                    </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                     {/* --- Added Add Key Section --- */}
                                     <div className="add-key-section" style={{ marginTop: '20px', padding: '15px', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: '#fdfdfd'}}>
                                        <h5>Add New Key</h5>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                                            <div className="settings-option" style={{ flexGrow: 1 }}>
                                                <label htmlFor="new-key-username" style={{marginBottom:'2px'}}>Username (Optional):</label>
                                                <input
                                                    type="text"
                                                    id="new-key-username"
                                                    className="settings-input"
                                                    value={newKeyUsername}
                                                    onChange={handleNewKeyUsernameChange}
                                                    placeholder="Assign a username"
                                                    disabled={isAdminLoading}
                                                />
                                            </div>
                                            <button
                                                onClick={handleAddNewKey}
                                                className="staff-login-button" // Reuse button style
                                                disabled={isAdminLoading}
                                                style={{ flexShrink: 0, height:'35px', alignSelf:'flex-end', marginBottom:'0px'}} // Adjust height/alignment
                                            >
                                                {isAdminLoading ? 'Adding...' : '+ Add Key'}
                                            </button>
                                        </div>
                                    </div>
                                     {/* --- End Add Key Section --- */}
                                </div>

                                <hr className="staff-separator" />
                                <h4>Manage Restricted Models</h4>
                                <div className="admin-data-section">
                                    {isAdminLoading && !adminRestrictedModelsList.length && <p>Loading models...</p>}
                                    {!isAdminLoading && !adminError && ALL_AVAILABLE_MODELS_FRONTEND.length > 0 && ( <div className="restricted-models-list"> <p style={{fontSize: '0.9em', color: '#666', marginBottom: '10px', padding: '0 12px'}}>Toggle models requiring access key.</p> {ALL_AVAILABLE_MODELS_FRONTEND.map(mInfo => { const isRestricted = adminRestrictedModelsList.includes(mInfo.value); return ( <div key={mInfo.value} className="restriction-item"> <span>{mInfo.label} (<code>{mInfo.value}</code>)</span> <button onClick={()=>handleToggleModelRestriction(mInfo.value)} className={`restriction-toggle-button ${isRestricted?'deactivate':'activate'}`} disabled={isAdminLoading}>{isRestricted ? 'Restricted ✔':'Public'}</button> </div> ); })} </div> )}
                                </div>

                                <hr className="staff-separator" />
                                <h4>Manage Restricted Personas</h4>
                                <div className="admin-data-section">
                                    {isAdminLoading && !adminRestrictedPersonasList.length && <p>Loading personas...</p>}
                                    {!isAdminLoading && !adminError && AVAILABLE_PERSONAS.length > 0 && ( <div className="restricted-models-list"> <p style={{fontSize: '0.9em', color: '#666', marginBottom: '10px', padding: '0 12px'}}>Toggle personas requiring access key.</p> {AVAILABLE_PERSONAS.map(pInfo => { const isRestricted = adminRestrictedPersonasList.includes(pInfo.value); return ( <div key={pInfo.value} className="restriction-item"> <span>{pInfo.emoji} {pInfo.label} (<code>{pInfo.value}</code>)</span> <button onClick={()=>handleTogglePersonaRestriction(pInfo.value)} className={`restriction-toggle-button ${isRestricted ? 'deactivate' : 'activate'}`} disabled={isAdminLoading}>{isRestricted ? 'Restricted ✔' : 'Public'}</button> </div> ); })} </div> )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isAnalysisFormVisible && ( <div className="analysis-form-overlay"><div className="analysis-form-modal"> <h3 id="analysis-title">Submit Details for University Advice</h3><p style={{fontSize:'0.9em', color:'#555', marginBottom:'15px'}}>Provide details for AI analysis (University Master persona).</p> <form onSubmit={handleAnalysisSubmit}> <div className="settings-option" style={{marginBottom:'15px'}}><label htmlFor="analysis-field1">1. Concerns about university?</label><input type="text" id="analysis-field1" className="settings-input" value={field1} onChange={(e)=>setField1(e.target.value)} placeholder="e.g., workload, cost" disabled={isAnalyzing} required /></div> <div className="settings-option" style={{marginBottom:'15px'}}><label htmlFor="analysis-field2">2. Enjoy spending time with?</label><input type="text" id="analysis-field2" className="settings-input" value={field2} onChange={(e)=>setField2(e.target.value)} placeholder="e.g., friends, family" disabled={isAnalyzing} required /></div> <div className="settings-option" style={{marginBottom:'15px'}}><label htmlFor="analysis-field3">3. Describe yourself?</label><input type="text" id="analysis-field3" className="settings-input" value={field3} onChange={(e)=>setField3(e.target.value)} placeholder="e.g., creative, quiet" disabled={isAnalyzing} required /></div> <div className="settings-option" style={{marginBottom:'15px'}}><label htmlFor="analysis-field4">4. Dislike most when learning?</label><input type="text" id="analysis-field4" className="settings-input" value={field4} onChange={(e)=>setField4(e.target.value)} placeholder="e.g., memorization, exams" disabled={isAnalyzing} required /></div> <div className="settings-option" style={{marginBottom:'15px'}}><label htmlFor="analysis-field5">5. Current/Expected GPA?</label><input type="text" id="analysis-field5" className="settings-input" value={field5} onChange={(e)=>setField5(e.target.value)} placeholder="e.g., 3.5, 2.8" disabled={isAnalyzing} required /></div> <div className="analysis-form-actions"><button type="button" onClick={toggleAnalysisForm} className="close-settings-button" disabled={isAnalyzing}>Cancel</button><button type="submit" className="beta-accept-button" disabled={!field1.trim()||!field2.trim()||!field3.trim()||!field4.trim()||!field5.trim()||isAnalyzing}>{isAnalyzing?'Analyzing...':'Submit'}</button></div> </form> </div></div> )}
            {showBetaNotice && ( <div className="beta-notice-overlay"><div className="beta-notice-modal"><h2>⚠️ Beta Notice</h2><p>Welcome! This is a beta test.</p><p>Features may change, bugs might occur.</p><p>Acknowledge to continue.</p><button onClick={handleAcceptBeta} className="beta-accept-button">✔️ Accept</button></div></div> )}

            <header className="App-header"> <div style={{ display: 'flex', alignItems: 'center' }}> <button onClick={toggleSettings} className="settings-button" title="Settings">⚙️</button> <button onClick={toggleAnalysisForm} className="settings-button analysis-button" title="University Advice Form">📝</button> </div> <h1>Project Theraphy</h1> <div className="header-spacer-right"></div> </header>

            <ChatbotPage messages={messages} setMessages={setMessages} selectedModel={selectedModel} sttLang={sttLang} selectedPersona={selectedPersona} accessKey={enteredKey} />
        </div>
    );
}

export default App;