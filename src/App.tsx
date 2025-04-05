// src/App.tsx
import React, { useState, useEffect, ChangeEvent, useRef } from 'react';
import ReactGA from 'react-ga4';
import './App.css';
import ChatbotPage from './ChatbotPage';

// --- GA ---
const GA_MEASUREMENT_ID = "G-JX58QMMKZY"; // Replace
if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" && GA_MEASUREMENT_ID !== "G-JX58QMMKZY") { try { ReactGA.initialize(GA_MEASUREMENT_ID); console.log("GA Init:",GA_MEASUREMENT_ID); ReactGA.send({ hitType: "pageview", page: window.location.pathname+window.location.search, title: "Initial Load" }); } catch (e) { console.error("GA Err:", e); } } else console.warn("GA ID missing/invalid/placeholder.");

// --- Types & Interfaces ---
export interface Message { id: number; text: string; sender: 'user'|'bot'|'loading'; timestamp: number; imageUrl?: string; }
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-pro-exp-03-25' | 'gemini-2.0-flash-thinking-exp-01-21' | 'gemini-2.0-flash-exp-image-generation';
export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR';
export type Persona = 'normal' | 'therapist' | 'university_master';
interface KeyValidationStatus { isValid: boolean | null; username: string | null; loading: boolean; error?: string | null; }
interface UserKeyInfo { key: string; username: string | null; status: 'active' | 'inactive'; created_at: string; }

// --- localStorage Keys ---
const CHAT_STORAGE_KEY='chatMessages'; const BETA_ACCEPTED_KEY='betaAccepted'; const MODEL_STORAGE_KEY='selectedApiModel'; const STT_LANG_STORAGE_KEY='selectedSttLang'; const ACCESS_KEY_STORAGE_KEY='userAccessKey'; const PERSONA_STORAGE_KEY='selectedPersona';

// --- Configurations ---
interface ModelInfo { value: GeminiModel; label: string; restricted: boolean; }
const ALL_AVAILABLE_MODELS_FRONTEND: ModelInfo[] = [ {value:'gemini-2.0-flash-lite',label:'Gemini 2.0 Flash Lite',restricted:false}, {value:'gemini-2.0-flash',label:'Gemini 2.0 Flash',restricted:false}, {value:'gemini-2.0-flash-thinking-exp-01-21',label:'Gemini 2.0 Flash Thinking Exp',restricted:true}, {value:'gemini-2.0-flash-exp-image-generation',label:'Gemini 2.0 Flash Image Gen Exp',restricted:true}, {value:'gemini-2.5-pro-exp-03-25',label:'Gemini 2.5 Pro Exp',restricted:true} ];
const RESTRICTED_MODELS_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS_FRONTEND.filter(m=>m.restricted).map(m=>m.value); // Defined
const ALL_MODEL_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS_FRONTEND.map(m => m.value); // Defined

interface PersonaInfo { value: Persona; label: string; emoji: string; restricted: boolean; }
const AVAILABLE_PERSONAS: PersonaInfo[] = [ {value:'university_master',label:'University Master',emoji:'🎓',restricted:false}, {value:'normal',label:'Normal Bot',emoji:'🤖',restricted:true}, {value:'therapist',label:'Therapist',emoji:'🧠',restricted:true} ];
const RESTRICTED_PERSONAS_VALUES: Persona[] = AVAILABLE_PERSONAS.filter(p=>p.restricted).map(p=>p.value); // Defined
const ALL_PERSONAS: Persona[] = AVAILABLE_PERSONAS.map(p => p.value); // Defined
const DEFAULT_UNRESTRICTED_PERSONA: Persona = 'university_master';

// --- API ---
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';
interface ApiRequestBody { prompt?: string; model?: GeminiModel; persona?: Persona; imageMimeType?: string; imageDataUrl?: string; accessKey?: string; action: string;
                         staffKey?: string; key?: string; newStatus?: 'active' | 'inactive'; models?: GeminiModel[]; personas?: Persona[];
                        }
async function getBotResponseForAnalysis( userInput: string, model: GeminiModel, persona: Persona, accessKey: string ): Promise<string> {
    const promptToSend=userInput; if(!promptToSend) return "Error: No text.";
    const requestBody: ApiRequestBody={action:'chat', prompt:promptToSend, model:model, persona:persona, accessKey:accessKey};
    console.log(`Sending Analysis Req (M: ${model}, P: ${persona})`);
    try{ const res = await fetch(WORKER_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(requestBody)}); if(!res.ok){const errData=await res.json().catch(()=>({error:`HTTP ${res.status}`})); throw new Error(errData?.error||`HTTP ${res.status}`);} const data=await res.json(); if(data.error)throw new Error(data.error); return data.reply||'No reply.'; } catch(e){ console.error('Analysis Err:',e); if(e instanceof Error)return`Error: ${e.message}`; return 'Error fetching.'; }
}

const VALIDATION_DEBOUNCE_MS = 600;

function App() {
  // --- State ---
  const [messages, setMessages] = useState<Message[]>(() => { const s=localStorage.getItem(CHAT_STORAGE_KEY); let i:Message[]=[]; try{i=s&&s!=='[]'?JSON.parse(s):[];if(!Array.isArray(i))throw new Error();}catch(e){localStorage.removeItem(CHAT_STORAGE_KEY);i=[];} if(i.length===0){const t=Date.now();return[{id:t,text:"Welcome!...",sender:'bot',timestamp:t}];}else{return i.filter(m=>m.sender!=='loading');} });
  const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);
  const [enteredKey, setEnteredKey] = useState<string>(() => localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '');
  const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.0-flash');
  const [sttLang, setSttLang] = useState<SpeechLanguage>(() => { const s=localStorage.getItem(STT_LANG_STORAGE_KEY) as SpeechLanguage|null; if(s&&['en-US','th-TH','es-ES','fr-FR'].includes(s))return s; return 'en-US'; });
  const [selectedPersona, setSelectedPersona] = useState<Persona>(DEFAULT_UNRESTRICTED_PERSONA);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAnalysisFormVisible, setIsAnalysisFormVisible] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [field1, setField1]=useState(''); const [field2, setField2]=useState(''); const [field3, setField3]=useState(''); const [field4, setField4]=useState(''); const [field5, setField5]=useState('');
  const [keyStatus, setKeyStatus] = useState<KeyValidationStatus>({ isValid: null, username: null, loading: false, error: null });
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Staff Panel State
  const [isStaffPanelVisible, setIsStaffPanelVisible] = useState<boolean>(false);
  const [enteredStaffKey, setEnteredStaffKey] = useState<string>('');
  const [isStaffAuthenticated, setIsStaffAuthenticated] = useState<boolean>(false);
  const [adminUserKeysList, setAdminUserKeysList] = useState<UserKeyInfo[]>([]);
  const [adminRestrictedModelsList, setAdminRestrictedModelsList] = useState<GeminiModel[]>([]);
  const [isAdminLoading, setIsAdminLoading] = useState<boolean>(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  // --- Effects ---
  useEffect(() => { // Debounced User Key Validation
    const keyTrimmed = enteredKey.trim(); if (debounceTimeoutRef.current) { clearTimeout(debounceTimeoutRef.current); }
    if (!keyTrimmed) { setKeyStatus({ isValid: null, username: null, loading: false, error: null }); if(ALL_AVAILABLE_MODELS_FRONTEND.find(m=>m.value===selectedModel)?.restricted){ setSelectedModel('gemini-2.0-flash'); } if(AVAILABLE_PERSONAS.find(p=>p.value===selectedPersona)?.restricted){ setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA); } return; }
    setKeyStatus(prev => ({ ...prev, loading: true, isValid: null, error: null, username: null }));
    debounceTimeoutRef.current = setTimeout(async () => {
      console.log("Validating key:", keyTrimmed);
      try {
        const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'validateKey', accessKey: keyTrimmed }) });
        const data = await res.json().catch(()=>({ error: `Invalid JSON`})); if (!res.ok) throw new Error(data?.error || `Validation fail: ${res.status}`);
        if (data.isValid) {
          setKeyStatus({ isValid: true, username: data.username || 'User', loading: false, error: null });
          const savedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null; if (savedModel && ALL_MODEL_VALUES.includes(savedModel)) { setSelectedModel(savedModel); }
          const savedPersona = localStorage.getItem(PERSONA_STORAGE_KEY) as Persona | null; if (savedPersona && ALL_PERSONAS.includes(savedPersona)) { setSelectedPersona(savedPersona); }
        } else { setKeyStatus({ isValid: false, username: null, loading: false, error: 'Invalid/inactive key.' }); if(ALL_AVAILABLE_MODELS_FRONTEND.find(m=>m.value===selectedModel)?.restricted){ setSelectedModel('gemini-2.0-flash'); } if(AVAILABLE_PERSONAS.find(p=>p.value===selectedPersona)?.restricted){ setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA); } }
      } catch (error) { console.error("Key validation fail:", error); const msg = error instanceof Error ? error.message : "Validation request fail."; setKeyStatus({ isValid: false, username: null, loading: false, error: msg }); if(ALL_AVAILABLE_MODELS_FRONTEND.find(m=>m.value===selectedModel)?.restricted){ setSelectedModel('gemini-2.0-flash'); } if(AVAILABLE_PERSONAS.find(p=>p.value===selectedPersona)?.restricted){ setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA); } }
    }, VALIDATION_DEBOUNCE_MS);
    return () => { if (debounceTimeoutRef.current) { clearTimeout(debounceTimeoutRef.current); } };
  }, [enteredKey, selectedModel, selectedPersona]);

  useEffect(() => { // Initial Load
    const initialKey = localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '';
    const savedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null; const savedPersona = localStorage.getItem(PERSONA_STORAGE_KEY) as Persona | null;
    let initialModel: GeminiModel = 'gemini-2.0-flash'; if (savedModel && ALL_MODEL_VALUES.includes(savedModel)) { initialModel = savedModel; } setSelectedModel(initialModel);
    let initialPersona: Persona = DEFAULT_UNRESTRICTED_PERSONA; if (savedPersona && ALL_PERSONAS.includes(savedPersona)) { initialPersona = savedPersona; } setSelectedPersona(initialPersona);
    const accepted = localStorage.getItem(BETA_ACCEPTED_KEY); if (accepted !== 'true') { setShowBetaNotice(true); }
    if (initialKey.trim()) {
        const validateInitialKey = async (key: string) => {
             setKeyStatus(prev => ({ ...prev, loading: true })); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'validateKey', accessKey: key }) }); const data = await res.json().catch(()=>({error:'Invalid JSON'})); if (res.ok && data.isValid) { setKeyStatus({ isValid: true, username: data.username || 'User', loading: false, error: null }); if (ALL_AVAILABLE_MODELS_FRONTEND.find(m=>m.value===initialModel)?.restricted) setSelectedModel(initialModel); if (AVAILABLE_PERSONAS.find(p=>p.value===initialPersona)?.restricted) setSelectedPersona(initialPersona); } else { setKeyStatus({ isValid: false, username: null, loading: false, error: data?.error || 'Invalid Key on load' }); if(ALL_AVAILABLE_MODELS_FRONTEND.find(m=>m.value===initialModel)?.restricted){ setSelectedModel('gemini-2.0-flash'); } if(AVAILABLE_PERSONAS.find(p=>p.value===initialPersona)?.restricted){ setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA); } } }
             catch (error) { const msg = error instanceof Error ? error.message : 'Validation failed'; setKeyStatus({ isValid: false, username: null, loading: false, error: msg }); if(ALL_AVAILABLE_MODELS_FRONTEND.find(m=>m.value===initialModel)?.restricted){ setSelectedModel('gemini-2.0-flash'); } if(AVAILABLE_PERSONAS.find(p=>p.value===initialPersona)?.restricted){ setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA); } } };
        validateInitialKey(initialKey);
    }
  }, []);

  // Persistence Effects
  useEffect(() => { const messagesToSave = messages.filter(msg => msg.sender !== 'loading'); if (messagesToSave.length > 1 || (messagesToSave.length === 1 && messagesToSave[0].sender !== 'bot')) { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messagesToSave)); } else if (messagesToSave.length === 0) { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messagesToSave)); } }, [messages]);
  useEffect(() => { localStorage.setItem(MODEL_STORAGE_KEY, selectedModel); }, [selectedModel]);
  useEffect(() => { localStorage.setItem(STT_LANG_STORAGE_KEY, sttLang); }, [sttLang]);
  useEffect(() => { localStorage.setItem(ACCESS_KEY_STORAGE_KEY, enteredKey); }, [enteredKey]);
  useEffect(() => { localStorage.setItem(PERSONA_STORAGE_KEY, selectedPersona); }, [selectedPersona]);

  // --- Event Handlers ---
  const handleAcceptBeta = () => { localStorage.setItem(BETA_ACCEPTED_KEY, 'true'); setShowBetaNotice(false); };
  const handleModelChange = (e: ChangeEvent<HTMLSelectElement>) => { const m = e.target.value as GeminiModel; if (ALL_MODEL_VALUES.includes(m)) setSelectedModel(m); else console.error("Invalid model selected:", m); }; // Corrected Constant
  const handleSttLangChange = (e: ChangeEvent<HTMLSelectElement>) => { setSttLang(e.target.value as SpeechLanguage); };
  const handlePersonaChange = (e: ChangeEvent<HTMLSelectElement>) => { const p = e.target.value as Persona; if (ALL_PERSONAS.includes(p)) setSelectedPersona(p); else console.error("Invalid persona selected:", p); }; // Corrected Constant
  const toggleSettings = () => { setIsSettingsOpen(prev => !prev); if (isStaffPanelVisible) { setIsStaffPanelVisible(false); setIsStaffAuthenticated(false); setEnteredStaffKey(''); setAdminError(null);} };
  const handleClearChat = () => { if (window.confirm("Clear chat?")) { const ts=Date.now(); const msg:Message={id:ts, text:"Welcome! ...", sender:'bot', timestamp:ts}; setMessages([msg]); localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify([msg])); setIsSettingsOpen(false); } };
  const handleAccessKeyChange = (event: ChangeEvent<HTMLInputElement>) => { setEnteredKey(event.target.value); };
  const handleExportChat = () => { const msgs = messages.filter(m => m.sender !== 'loading'); if (msgs.length === 0 || (msgs.length === 1 && msgs[0].sender==='bot')) { alert("Empty chat."); return; } let content = `Chat Export\nAt: ${new Date().toLocaleString()}\nModel: ${selectedModel}\nPersona: ${selectedPersona}\n------------------------------------\n\n`; msgs.forEach(m => { const ts=new Date(m.timestamp).toLocaleString(); const sl = m.sender==='user' ? 'User' : 'Bot'; content += `[${ts}] ${sl}:\n${m.text}\n`; if (m.imageUrl) content += `(Image: ${m.imageUrl})\n`; content += `\n`; }); try { const blob = new Blob([content], {type:'text/plain;charset=utf-8'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; const tf = new Date().toISOString().replace(/[:.]/g, '-'); a.download = `chat-${tf}.txt`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID!=="G-JX58QMMKZY" && GA_MEASUREMENT_ID!=="G-JX58QMMKZY") { ReactGA.event({ category: "Chat", action: "Export", label: `Count: ${msgs.length}` }); } } catch (e) { console.error("Export fail:", e); alert("Export failed."); } };
  const clearAnalysisForm = () => { setField1(''); setField2(''); setField3(''); setField4(''); setField5(''); };
  const toggleAnalysisForm = () => { setIsAnalysisFormVisible(prev => !prev); if (isAnalysisFormVisible) { clearAnalysisForm(); setIsAnalyzing(false); } };
  const handleAnalysisSubmit = async (event: React.FormEvent) => { event.preventDefault(); const v1=field1.trim(), v2=field2.trim(), v3=field3.trim(), v4=field4.trim(), v5=field5.trim(); if (!v1 || isAnalyzing) return; setIsAnalyzing(true); setIsAnalysisFormVisible(false); if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID!=="G-JX58QMMKZY" && GA_MEASUREMENT_ID!=="G-JX58QMMKZY") { try { ReactGA.event({ category:"Analysis", action:"Submit", label:`F1 Len: ${v1.length}` }); } catch (e) { console.error("GA fail:", e); } } let input = `Field 1: ${v1}\n`; if (v2) input+=`Field 2: ${v2}\n`; if (v3) input+=`Field 3: ${v3}\n`; if (v4) input+=`Field 4: ${v4}\n`; if (v5) input+=`Field 5: ${v5}\n`; const t0=Date.now(); const thinkMsg:Message={id:t0, text:`Analyzing (${v1.substring(0,40)}...)...`, sender:'loading', timestamp:t0}; setMessages(prev => [...prev, thinkMsg]); clearAnalysisForm(); const result = await getBotResponseForAnalysis(input.trim(), selectedModel, selectedPersona, enteredKey); if (result.startsWith("Error: Access Key required") || result.startsWith("Error: Invalid or inactive")) { setKeyStatus({ isValid: false, username: null, loading: false, error: "Invalid/missing key." }); } else if (result.startsWith("Error:")) { setKeyStatus(prev => ({...prev, error: null})); } else { setKeyStatus(prev => ({...prev, error: null, isValid: true })); } const t1=Date.now()+1; const resultMsg:Message={id:t1, text:result, sender:'bot', timestamp:t1}; setMessages(prev => [ ...prev.filter(m => m.id !== t0), resultMsg ]); setIsAnalyzing(false); };

  // --- Staff Panel Handlers ---
  const toggleStaffPanel = () => { setIsStaffPanelVisible(prev => !prev); if (!isStaffPanelVisible) { setIsStaffAuthenticated(false); setEnteredStaffKey(''); setAdminError(null); setAdminUserKeysList([]); setAdminRestrictedModelsList([]); } else { setIsStaffAuthenticated(false); setEnteredStaffKey(''); setAdminError(null); setAdminUserKeysList([]); setAdminRestrictedModelsList([]);} };
  const handleStaffKeyChange = (e: ChangeEvent<HTMLInputElement>) => { setEnteredStaffKey(e.target.value); };
  const handleStaffLogin = async () => { if (!enteredStaffKey) { setAdminError("Staff Key empty."); return; } setIsAdminLoading(true); setAdminError(null); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'staffLogin', staffKey: enteredStaffKey }) }); const data = await res.json().catch(()=>({error: 'Invalid JSON'})); if (!res.ok || !data.isValid) { throw new Error(data?.error || `Staff Login Fail: ${res.status}`); } setIsStaffAuthenticated(true); setAdminError(null); fetchAdminData(); } catch (e) { console.error("Staff login fail:", e); setIsStaffAuthenticated(false); setAdminError(e instanceof Error ? e.message : "Staff login failed."); } finally { setIsAdminLoading(false); } };
  const fetchAdminData = async () => { setIsAdminLoading(true); setAdminError(null); try { const [keysRes, restrictRes] = await Promise.all([ fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminListKeys' }) }), fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminGetRestrictions' }) }) ]); const keysData = await keysRes.json().catch(()=>({error:'Invalid JSON'})); if (!keysRes.ok || !keysData.success) throw new Error(keysData?.error || 'Failed keys'); setAdminUserKeysList(keysData.keys || []); const restrictData = await restrictRes.json().catch(()=>({error:'Invalid JSON'})); if (!restrictRes.ok || !restrictData.success) throw new Error(restrictData?.error || 'Failed restrictions'); setAdminRestrictedModelsList(restrictData.restrictedModels || []); } catch (e) { console.error("Fetch admin err:", e); setAdminError(e instanceof Error ? e.message : "Load failed."); } finally { setIsAdminLoading(false); } };
  const handleToggleUserKeyStatus = async (key: string, currentStatus: 'active' | 'inactive') => { const newStatus = currentStatus === 'active' ? 'inactive' : 'active'; if (!window.confirm(`Set key "${key.substring(0,8)}..." to ${newStatus}?`)) return; setIsAdminLoading(true); setAdminError(null); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminUpdateKeyStatus', key: key, newStatus: newStatus }) }); const data = await res.json().catch(()=>({error: 'Invalid JSON'})); if (!res.ok || !data.success) throw new Error(data?.error || `Update fail: ${res.status}`); fetchAdminData(); /* Refresh list */ } catch (e) { console.error("Key update fail:", e); setAdminError(e instanceof Error ? e.message : "Update fail."); setIsAdminLoading(false); } };
  const handleToggleModelRestriction = async (modelValue: GeminiModel) => { const isCurrentlyRestricted = adminRestrictedModelsList.includes(modelValue); const optimisticNewList = isCurrentlyRestricted ? adminRestrictedModelsList.filter(m => m !== modelValue) : [...adminRestrictedModelsList, modelValue]; setAdminRestrictedModelsList(optimisticNewList); setIsAdminLoading(true); setAdminError(null); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminSetRestrictedModels', models: optimisticNewList }) }); const data = await res.json().catch(()=>({error: 'Invalid JSON'})); if (!res.ok || !data.success) { setAdminRestrictedModelsList(adminRestrictedModelsList); throw new Error(data?.error || `Save fail: ${res.status}`); } console.log("Restricted models updated."); fetchAdminData(); /* Refresh list */ } catch (error) { console.error("Save restrictions fail:", error); setAdminError(error instanceof Error ? error.message : "Save fail."); setAdminRestrictedModelsList(adminRestrictedModelsList); } finally { setIsAdminLoading(false); } };
  useEffect(() => { if (isStaffPanelVisible && isStaffAuthenticated) { fetchAdminData(); } }, [isStaffPanelVisible, isStaffAuthenticated]);

  // --- JSX ---
  return (
    <div className="App">
      {/* Settings Menu */}
      {isSettingsOpen && ( <div className="settings-menu"> <h3 id="settings-title">Settings</h3> <div className="settings-grid"> <div className="settings-column"> <div className="settings-option"> <label htmlFor="access-key-input">Your Key:</label> <input type="password" id="access-key-input" className="settings-input" placeholder="Enter key" value={enteredKey} onChange={handleAccessKeyChange} /> <div className="settings-key-status"> {keyStatus.loading && (<span className="key-loading">Validating...</span>)} {!keyStatus.loading&&keyStatus.isValid===true&&keyStatus.username&&(<span className="key-valid">✅ Welcome, {keyStatus.username}!</span>)} {!keyStatus.loading&&keyStatus.isValid===false&&(<span className="key-invalid">❌ {keyStatus.error||"Invalid"}</span>)} </div> </div> <div className="settings-option"> <label htmlFor="persona-select">Persona:</label> <select id="persona-select" value={selectedPersona} onChange={handlePersonaChange} className="settings-select"> {AVAILABLE_PERSONAS.map((p)=>{const dis=p.restricted&&keyStatus.isValid!==true; const sty=dis?{color:'#888',fontStyle:'italic'}:{}; return(<option key={p.value} value={p.value} disabled={dis} style={sty}>{p.emoji} {p.label}{p.restricted?' (R)':''}</option>);})} </select> </div> <div className="settings-option"> <label htmlFor="model-select">AI Model:</label> <select id="model-select" value={selectedModel} onChange={handleModelChange} className="settings-select"> {ALL_AVAILABLE_MODELS_FRONTEND.map((m)=>{const dis=m.restricted&&keyStatus.isValid!==true; const sty=dis?{color:'#888',fontStyle:'italic'}:{}; return(<option key={m.value} value={m.value} disabled={dis} style={sty}>{m.label}{m.restricted?' (R)':''}</option>);})} </select> {keyStatus.isValid!==true&&(RESTRICTED_PERSONAS_VALUES.length>0||RESTRICTED_MODELS_VALUES.length>0)&&(<p className="settings-helper-text">Enter valid Key for (R) features.</p>)} </div> </div> <div className="settings-column"> <div className="settings-option"> <label htmlFor="stt-lang-select">Speak Lang:</label> <select id="stt-lang-select" value={sttLang} onChange={handleSttLangChange} className="settings-select"> <option value="en-US">English</option> <option value="th-TH">ไทย</option> <option value="es-ES">Español</option> <option value="fr-FR">Français</option> </select> </div> <div className="settings-option"> <label>Chat Actions:</label> <button onClick={handleExportChat} className="settings-action-button export-chat-settings-button">💾 Export</button> </div> <div className="settings-option"> <button onClick={handleClearChat} className="settings-action-button clear-chat-settings-button">🗑️ Clear</button> </div> <div className="settings-option"> <button onClick={toggleStaffPanel} className="settings-action-button staff-area-button">🔑 Staff</button> </div> </div> </div> <hr className="settings-separator"/> <button onClick={toggleSettings} className="close-settings-button">Close</button> </div> )}
      {/* Staff Panel Modal */}
      {isStaffPanelVisible && ( <div className="staff-panel-overlay"> <div className="staff-panel-modal"> <h3 id="staff-panel-title">Staff Panel</h3> <button onClick={toggleStaffPanel} className="close-staff-panel-button">×</button> {!isStaffAuthenticated ? ( <div className="staff-login-section"> <div className="settings-option"> <label htmlFor="staff-key-input">Staff Key:</label> <input type="password" id="staff-key-input" className="settings-input" value={enteredStaffKey} onChange={handleStaffKeyChange} placeholder="Enter staff key" disabled={isAdminLoading} /> </div> <button onClick={handleStaffLogin} className="staff-login-button" disabled={isAdminLoading}> {isAdminLoading ? 'Logging In...' : 'Login'} </button> {adminError && <p className="staff-error">{adminError}</p>} <p className="staff-security-warning">Warn: Shared staff key is insecure.</p> </div> ) : ( <div className="staff-admin-section"> <h4>User Keys</h4> {isAdminLoading && <p>Loading Keys...</p>} {adminError && !isAdminLoading && <p className="staff-error">{adminError}</p>} <div className="user-keys-list"> {adminUserKeysList.length > 0 ? ( <table><thead><tr><th>Key(Start)</th><th>User</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody> {adminUserKeysList.map(k => (<tr key={k.key}><td>{k.key.substring(0, 8)}...</td><td>{k.username || '-'}</td><td>{k.status}</td><td>{new Date(k.created_at).toLocaleDateString()}</td><td> <button onClick={() => handleToggleUserKeyStatus(k.key, k.status)} className={`key-status-toggle-button ${k.status === 'active' ? 'deactivate' : 'activate'}`} disabled={isAdminLoading}> {k.status === 'active' ? 'Deact.' : 'Act.'} </button> </td></tr>))}</tbody></table> ) : ( !isAdminLoading && <p>No keys.</p> )} </div> <hr className="staff-separator" /> <h4>Manage Restricted Models</h4> {isAdminLoading && !adminUserKeysList.length && <p>Loading Models...</p>} {adminError && !isAdminLoading && <p className="staff-error">{adminError}</p>} <div className="restricted-models-list"> {ALL_MODEL_VALUES.map(modelValue => { const isRestricted = adminRestrictedModelsList.includes(modelValue as GeminiModel); return ( <div key={modelValue} className="restriction-item"> <span>{modelValue}</span> <button onClick={() => handleToggleModelRestriction(modelValue)} className={`restriction-toggle-button ${isRestricted ? 'deactivate' : 'activate'}`} disabled={isAdminLoading} title={isRestricted ? `Make Public` : `Make Restricted`}> {isRestricted ? 'Restricted (Deactivate)' : 'Public (Activate)'} </button> </div> ); })} </div> </div> )} </div> </div> )}
      {/* Analysis Form Modal */}
      {isAnalysisFormVisible && ( <div className="analysis-form-overlay"> <div className="analysis-form-modal"> <h3 id="analysis-title">Submit Details</h3> <form onSubmit={handleAnalysisSubmit}> <div className="settings-option" style={{marginBottom:'15px'}}> <label htmlFor="analysis-field1">Field 1 (Req):</label> <input type="text" id="analysis-field1" className="settings-input" value={field1} onChange={(e)=>setField1(e.target.value)} placeholder="Downside/Concern?" disabled={isAnalyzing} required /> </div> <div className="settings-option" style={{marginBottom:'15px'}}> <label htmlFor="analysis-field2">Field 2 (Req):</label> <input type="text" id="analysis-field2" className="settings-input" value={field2} onChange={(e)=>setField2(e.target.value)} placeholder="Enjoy spending time with?" disabled={isAnalyzing} required /> </div> <div className="settings-option" style={{marginBottom:'15px'}}> <label htmlFor="analysis-field3">Field 3 (Req):</label> <input type="text" id="analysis-field3" className="settings-input" value={field3} onChange={(e)=>setField3(e.target.value)} placeholder="Describe yourself?" disabled={isAnalyzing} required /> </div> <div className="settings-option" style={{marginBottom:'15px'}}> <label htmlFor="analysis-field4">Field 4 (Req):</label> <input type="text" id="analysis-field4" className="settings-input" value={field4} onChange={(e)=>setField4(e.target.value)} placeholder="Hate most when studying?" disabled={isAnalyzing} required /> </div> <div className="settings-option" style={{marginBottom:'15px'}}> <label htmlFor="analysis-field5">Field 5 (Req):</label> <input type="text" id="analysis-field5" className="settings-input" value={field5} onChange={(e)=>setField5(e.target.value)} placeholder="GPA?" disabled={isAnalyzing} required /> </div> <div className="analysis-form-actions"> <button type="button" onClick={toggleAnalysisForm} className="close-settings-button" disabled={isAnalyzing}>Cancel</button> <button type="submit" className="beta-accept-button" disabled={!field1.trim() || isAnalyzing}>{isAnalyzing ? 'Submitting...' : 'Submit Analysis'}</button> </div> </form> </div> </div> )}
      {/* Beta Notice Modal */}
      {showBetaNotice && ( <div className="beta-notice-overlay"> <div className="beta-notice-modal"> <h2>⚠️ Beta</h2> <p>Welcome! ...</p> <button onClick={handleAcceptBeta} className="beta-accept-button">✔️ Accept</button> </div> </div> )}
      {/* Header */}
      <header className="App-header"> <div style={{ display: 'flex', alignItems: 'center' }}> <button onClick={toggleSettings} className="settings-button" title="Settings">⚙️</button> <button onClick={toggleAnalysisForm} className="settings-button analysis-button" title="Submit Details">📝</button> </div> <h1>Project Theraphy</h1> <div className="header-spacer-right"></div> </header>
      {/* Chatbot Page */}
      <ChatbotPage messages={messages} setMessages={setMessages} selectedModel={selectedModel} sttLang={sttLang} selectedPersona={selectedPersona} accessKey={enteredKey} />
    </div>
  );
}

export default App;