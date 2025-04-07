// src/App.tsx - Added Theme Toggle & Persistence
import React, { useState, useEffect, ChangeEvent, useRef, useCallback } from 'react';
import ReactGA from 'react-ga4';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import './App.css';
import ChatbotPage from './ChatbotPage';
import AdminPage from './AdminPage';

// --- GA Initialization ---
const GA_MEASUREMENT_ID = "G-JX58QMMKZY";
if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" && GA_MEASUREMENT_ID !== "YOUR_GA_ID_HERE") { try { ReactGA.initialize(GA_MEASUREMENT_ID); console.log("GA Init:", GA_MEASUREMENT_ID); ReactGA.send({ hitType: "pageview", page: window.location.pathname + window.location.search, title: "Initial Load" }); } catch (e) { console.error("GA Init Err:", e); } } else { console.warn("GA ID missing/invalid. GA not initialized."); }

// --- Types & Interfaces (Exported) ---
export interface Message { id: number; text: string; sender: 'user' | 'bot' | 'loading'; timestamp: number; imageUrl?: string; modelUsed?: string; }
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-pro-exp-03-25' | 'gemini-2.0-flash-thinking-exp-01-21' | 'gemini-2.0-flash-exp-image-generation';
export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR';
export type Persona = 'normal' | 'therapist' | 'university_master';
interface KeyValidationStatus { isValid: boolean | null; username: string | null; loading: boolean; error?: string | null; }
export interface UserKeyInfo { key: string; username: string | null; status: 'active' | 'inactive'; created_at: string; }
export interface FeedbackItem { id: number; email: string | null; rating: number; comment: string; submitted_at: string; is_important: number; }
export type PersonaInstructionMap = { [key in Persona]?: string };
export type AppTheme = 'light' | 'dark';

// --- localStorage Keys ---
const CHAT_STORAGE_KEY = 'chatMessages';
const BETA_ACCEPTED_KEY = 'betaAccepted';
const MODEL_STORAGE_KEY = 'selectedApiModel';
const STT_LANG_STORAGE_KEY = 'selectedSttLang';
const ACCESS_KEY_STORAGE_KEY = 'userAccessKey';
const PERSONA_STORAGE_KEY = 'selectedPersona';
const THEME_STORAGE_KEY = 'selectedAppTheme';

// --- Configurations (Exported) ---
export interface ModelInfo { value: GeminiModel; label: string; restricted: boolean; }
export const ALL_AVAILABLE_MODELS_FRONTEND: ModelInfo[] = [ { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', restricted: false }, { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', restricted: false }, { value: 'gemini-2.0-flash-thinking-exp-01-21', label: 'Gemini 2.0 Flash Thinking Exp', restricted: true }, { value: 'gemini-2.0-flash-exp-image-generation', label: 'Gemini 2.0 Flash Image Gen Exp', restricted: true }, { value: 'gemini-2.5-pro-exp-03-25', label: 'Gemini 2.5 Pro Exp', restricted: true } ];
export const ALL_MODEL_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS_FRONTEND.map(m => m.value);
export interface PersonaInfo { value: Persona; label: string; emoji: string; restricted: boolean; }
export const AVAILABLE_PERSONAS: PersonaInfo[] = [ { value: 'university_master', label: 'University Master', emoji: '🎓', restricted: false }, { value: 'normal', label: 'Normal Bot', emoji: '🤖', restricted: true }, { value: 'therapist', label: 'Therapist', emoji: '🧠', restricted: true } ];
export const ALL_PERSONAS: Persona[] = AVAILABLE_PERSONAS.map(p => p.value);
export const DEFAULT_UNRESTRICTED_PERSONA: Persona = 'university_master';
export const RESTRICTED_MODELS_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS_FRONTEND.filter(m => m.restricted).map(m => m.value);
export const RESTRICTED_PERSONAS_VALUES: Persona[] = AVAILABLE_PERSONAS.filter(p => p.restricted).map(p => p.value);
export const DEFAULT_BASE_SYSTEM_INSTRUCTION = `You are a helpful AI assistant. Format responses using Markdown. Provide suggestions for general topics like [Suggestion: Suggestion Text]. Avoid this format for sensitive personal advice. Respond in Thai if user uses Thai. Offer inspirational quotes if user feels down. If input starts with "Field 1:", analyze for university advice based only on fields 1-5.`;
export const DEFAULT_PERSONA_INSTRUCTIONS = { normal: `Act as a general assistant. Use [Suggestion: ...] for follow-ups on general topics.`, therapist: `Roleplay as an empathetic therapist assistant. Use gentle, validating language. Do NOT give medical advice. Ask gentle questions or suggest coping mechanisms in PLAIN TEXT, not [Suggestion:...]. Prioritize inspirational quotes for distress.`, university_master: `Roleplay as an expert academic advisor. Focus on university/career topics. Use [Suggestion: ...] for general academic questions. Provide detailed recommendations for "Field 1-5" input.` };
export const ALL_PERSONA_KEYS = Object.keys(DEFAULT_PERSONA_INSTRUCTIONS);


// --- API ---
export const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/'; // Ensure this is correct
export interface ApiRequestBody { action: string; prompt?: string; model?: GeminiModel; persona?: Persona; imageMimeType?: string; imageDataUrl?: string; accessKey?: string; history?: any[]; staffKey?: string; key?: string; newStatus?: 'active' | 'inactive'; models?: GeminiModel[]; personas?: Persona[]; username?: string | null; newUsername?: string | null; email?: string | null; rating?: number; comment?: string; feedbackId?: number; isImportant?: boolean | number; baseInstruction?: string; personaInstructions?: PersonaInstructionMap; fileId?: string; }

// --- Constants ---
const VALIDATION_DEBOUNCE_MS = 600;

// --- Component for Protected Route ---
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => { const keyFromSession = sessionStorage.getItem('staffKey'); const location = useLocation(); if (!keyFromSession) { console.log("ProtectedRoute: No key, redirecting from", location.pathname); return <Navigate to="/" replace />; } return <>{children}</>; };

// --- Helper function to get initial theme ---
const getInitialTheme = (): AppTheme => {
    if (typeof window !== 'undefined') { // Ensure localStorage is available
        const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) as AppTheme | null;
        if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) {
            return storedTheme;
        }
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
    }
    return 'light'; // Default to light
};


function App() {
    // --- State ---
    const [messages, setMessages] = useState<Message[]>(() => { const stored = localStorage.getItem(CHAT_STORAGE_KEY); let initial: Message[] = []; try { initial = stored && stored !== '[]' ? JSON.parse(stored) : []; if (!Array.isArray(initial)) throw new Error("Bad format"); initial = initial.filter(m => m.sender !== 'loading'); } catch (e) { console.error("Bad stored msgs:", e); localStorage.removeItem(CHAT_STORAGE_KEY); initial = []; } if (initial.length === 0) { const ts = Date.now(); return [{ id: ts, text: "Welcome!", sender: 'bot', timestamp: ts }]; } else { return initial; } });
    const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);
    const [enteredKey, setEnteredKey] = useState<string>(() => localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '');
    const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.0-flash');
    const [sttLang, setSttLang] = useState<SpeechLanguage>(() => { const stored = localStorage.getItem(STT_LANG_STORAGE_KEY) as SpeechLanguage | null; if (stored && ['en-US', 'th-TH', 'es-ES', 'fr-FR'].includes(stored)) { return stored; } return 'en-US'; });
    const [selectedPersona, setSelectedPersona] = useState<Persona>(DEFAULT_UNRESTRICTED_PERSONA);
    const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
    const [keyStatus, setKeyStatus] = useState<KeyValidationStatus>({ isValid: null, username: null, loading: false, error: null });
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isStaffLoginModalVisible, setIsStaffLoginModalVisible] = useState<boolean>(false);
    const [enteredStaffKey, setEnteredStaffKey] = useState<string>('');
    const [isStaffLoginLoading, setIsStaffLoginLoading] = useState<boolean>(false);
    const [staffLoginError, setStaffLoginError] = useState<string | null>(null);
    const [isFeedbackModalVisible, setIsFeedbackModalVisible] = useState<boolean>(false);
    const [feedbackEmail, setFeedbackEmail] = useState<string>('');
    const [feedbackRating, setFeedbackRating] = useState<number>(0);
    const [feedbackComment, setFeedbackComment] = useState<string>('');
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState<boolean>(false);
    const [feedbackError, setFeedbackError] = useState<string | null>(null);
    const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
    const [currentTheme, setCurrentTheme] = useState<AppTheme>(getInitialTheme);

    const navigate = useNavigate();

    // --- Effects ---
    useEffect(() => { /* Debounced Key Validation */ const keyTrimmed=enteredKey.trim();if(debounceTimeoutRef.current)clearTimeout(debounceTimeoutRef.current);const cM=selectedModel;const cP=selectedPersona;if(!keyTrimmed){setKeyStatus({isValid:null,username:null,loading:false,error:null});if(RESTRICTED_MODELS_VALUES.includes(cM))setSelectedModel('gemini-2.0-flash');if(RESTRICTED_PERSONAS_VALUES.includes(cP))setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);return;}setKeyStatus(p=>({...p,loading:true,isValid:null,error:null,username:null})); debounceTimeoutRef.current=setTimeout(async()=>{ try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'validateKey',accessKey:keyTrimmed})});const d=await r.json().catch(()=>({error:`Invalid JSON`}));if(!r.ok)throw new Error(d?.error||`Validation failed: ${r.status}`);if(d.isValid){setKeyStatus({isValid:true,username:d.username||'User',loading:false,error:null});const sM=localStorage.getItem(MODEL_STORAGE_KEY)as GeminiModel|null;if(sM&&ALL_MODEL_VALUES.includes(sM))setSelectedModel(sM);else if(RESTRICTED_MODELS_VALUES.includes(cM))setSelectedModel(cM);else setSelectedModel(cM);const sP=localStorage.getItem(PERSONA_STORAGE_KEY)as Persona|null;if(sP&&ALL_PERSONAS.includes(sP))setSelectedPersona(sP);else if(RESTRICTED_PERSONAS_VALUES.includes(cP))setSelectedPersona(cP);else setSelectedPersona(cP);}else{setKeyStatus({isValid:false,username:null,loading:false,error:d?.error||'Invalid key.'});if(RESTRICTED_MODELS_VALUES.includes(cM))setSelectedModel('gemini-2.0-flash');if(RESTRICTED_PERSONAS_VALUES.includes(cP))setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);}}catch(e){const msg=e instanceof Error?e.message:"Validation network error.";setKeyStatus({isValid:false,username:null,loading:false,error:msg});if(RESTRICTED_MODELS_VALUES.includes(cM))setSelectedModel('gemini-2.0-flash');if(RESTRICTED_PERSONAS_VALUES.includes(cP))setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);}},VALIDATION_DEBOUNCE_MS); return()=>{if(debounceTimeoutRef.current)clearTimeout(debounceTimeoutRef.current);}; }, [enteredKey, selectedModel, selectedPersona]);
    useEffect(() => { /* Initial Load & Key Check */ const iK=localStorage.getItem(ACCESS_KEY_STORAGE_KEY)||'';const sM=localStorage.getItem(MODEL_STORAGE_KEY)as GeminiModel|null;const sP=localStorage.getItem(PERSONA_STORAGE_KEY)as Persona|null;let iM:GeminiModel='gemini-2.0-flash';if(sM&&ALL_MODEL_VALUES.includes(sM))iM=sM;setSelectedModel(iM);let iP:Persona=DEFAULT_UNRESTRICTED_PERSONA;if(sP&&ALL_PERSONAS.includes(sP))iP=sP;setSelectedPersona(iP);const acc=localStorage.getItem(BETA_ACCEPTED_KEY);if(acc!=='true')setShowBetaNotice(true);if(iK.trim()){const validateInitial=async(k:string,m:GeminiModel,p:Persona)=>{setKeyStatus(pr=>({...pr,loading:true}));try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'validateKey',accessKey:k})});const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(r.ok&&d.isValid){setKeyStatus({isValid:true,username:d.username||'User',loading:false,error:null});setSelectedModel(m);setSelectedPersona(p);}else{setKeyStatus({isValid:false,username:null,loading:false,error:d?.error||'Invalid key'});if(RESTRICTED_MODELS_VALUES.includes(m))setSelectedModel('gemini-2.0-flash');if(RESTRICTED_PERSONAS_VALUES.includes(p))setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);}}catch(e){setKeyStatus({isValid:false,username:null,loading:false,error:'Validation failed'});if(RESTRICTED_MODELS_VALUES.includes(m))setSelectedModel('gemini-2.0-flash');if(RESTRICTED_PERSONAS_VALUES.includes(p))setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);}};validateInitial(iK,iM,iP);}else{if(RESTRICTED_MODELS_VALUES.includes(iM))setSelectedModel('gemini-2.0-flash');if(RESTRICTED_PERSONAS_VALUES.includes(iP))setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);}},[]);
    useEffect(() => { /* Persistence */ const msgs=messages.filter(m=>m.sender!=='loading');if(msgs.length>1||(msgs.length===1&&msgs[0].sender!=='bot')){localStorage.setItem(CHAT_STORAGE_KEY,JSON.stringify(msgs));}else if(msgs.length===0){localStorage.setItem(CHAT_STORAGE_KEY,JSON.stringify([]));} }, [messages]);
    useEffect(()=>{localStorage.setItem(MODEL_STORAGE_KEY,selectedModel);},[selectedModel]);
    useEffect(()=>{localStorage.setItem(STT_LANG_STORAGE_KEY,sttLang);},[sttLang]);
    useEffect(()=>{localStorage.setItem(ACCESS_KEY_STORAGE_KEY,enteredKey);},[enteredKey]);
    useEffect(()=>{localStorage.setItem(PERSONA_STORAGE_KEY,selectedPersona);},[selectedPersona]);
    useEffect(() => { /* Theme Persistence and Application */ localStorage.setItem(THEME_STORAGE_KEY, currentTheme); document.documentElement.setAttribute('data-theme', currentTheme); }, [currentTheme]);
    useEffect(() => { /* Feedback Success Timer */ let timer: NodeJS.Timeout | null = null; if (feedbackSuccess) { timer = setTimeout(() => setFeedbackSuccess(null), 3000); } return () => { if (timer) clearTimeout(timer); }; }, [feedbackSuccess]);

    // --- Event Handlers ---
    const handleAcceptBeta=()=>{localStorage.setItem(BETA_ACCEPTED_KEY,'true');setShowBetaNotice(false);};
    const handleModelChange=(e:ChangeEvent<HTMLSelectElement>)=>{const m=e.target.value as GeminiModel;if(ALL_MODEL_VALUES.includes(m))setSelectedModel(m);};
    const handleSttLangChange=(e:ChangeEvent<HTMLSelectElement>)=>{setSttLang(e.target.value as SpeechLanguage);};
    const handlePersonaChange=(e:ChangeEvent<HTMLSelectElement>)=>{const p=e.target.value as Persona;if(ALL_PERSONAS.includes(p))setSelectedPersona(p);};
    const toggleSettings=()=>{ setIsSettingsOpen(p=>!p); setIsStaffLoginModalVisible(false); setIsFeedbackModalVisible(false); };
    const handleClearChat=()=>{if(window.confirm("Clear chat history? This cannot be undone.")){const ts=Date.now();const msg:Message={id:ts,text:"Chat cleared.",sender:'bot',timestamp:ts};setMessages([msg]);localStorage.removeItem(CHAT_STORAGE_KEY);setIsSettingsOpen(false);}};
    const handleAccessKeyChange=(e:ChangeEvent<HTMLInputElement>)=>{setEnteredKey(e.target.value);};
    const handleExportChat=()=>{const msgs=messages.filter(m=>m.sender!=='loading');if(msgs.length===0||(msgs.length===1&&msgs[0].sender==='bot'&&msgs[0].text==="Welcome!"))return alert("Chat is empty or only contains the welcome message.");let c=`Chat Export\nTimestamp: ${new Date().toLocaleString()}\nModel: ${selectedModel}\nPersona: ${selectedPersona}\nUser: ${keyStatus.isValid?keyStatus.username:'N/A (No valid key)'}\nTheme: ${currentTheme}\n----\n\n`;msgs.forEach(m=>{const t=new Date(m.timestamp).toLocaleString();c+=`[${t}] ${m.sender==='user'?'User':'Bot'}:\n${m.text}\n${m.imageUrl?`(Image Attachment: ${m.imageUrl})\n`:''}\n`;});try{const b=new Blob([c],{type:'text/plain;charset=utf-8'});const u=URL.createObjectURL(b);const a=document.createElement('a');const f=`theraphy-chat-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`;a.href=u;a.download=f;document.body.appendChild(a); a.click();document.body.removeChild(a); URL.revokeObjectURL(u);if(GA_MEASUREMENT_ID&&GA_MEASUREMENT_ID!=="G-JX58QMMKZY")ReactGA.event({category:"Chat",action:"Export",label:`Msg Count: ${msgs.length}`});setIsSettingsOpen(false);}catch(e){console.error("Export failed:",e);alert("Failed to export chat.");}};
    const toggleStaffLoginModal = () => { setIsStaffLoginModalVisible(prev => !prev); if (isStaffLoginModalVisible) { setEnteredStaffKey(''); setStaffLoginError(null); } setIsSettingsOpen(false); setIsFeedbackModalVisible(false); };
    const handleStaffKeyChange = (e: ChangeEvent<HTMLInputElement>) => { setEnteredStaffKey(e.target.value); setStaffLoginError(null);};
    const handleStaffLogin = async () => { if (!enteredStaffKey.trim()) { setStaffLoginError("Staff key is required."); return; } setIsStaffLoginLoading(true); setStaffLoginError(null); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'staffLogin', staffKey: enteredStaffKey }) }); const data = await res.json().catch(() => ({ error: 'Invalid JSON response from server.' })); if (!res.ok || !data.isValid) { throw new Error(data?.error || `Login Failed (Status: ${res.status})`); } sessionStorage.setItem('staffKey', enteredStaffKey); setIsStaffLoginModalVisible(false); setEnteredStaffKey(''); navigate('/admin'); } catch (e) { setStaffLoginError(e instanceof Error ? e.message : "Login failed due to an unknown error."); sessionStorage.removeItem('staffKey'); } finally { setIsStaffLoginLoading(false); } };
    const toggleFeedbackModal = () => { const closing = isFeedbackModalVisible; setIsFeedbackModalVisible(prev => !prev); if (closing) { setFeedbackEmail(''); setFeedbackRating(0); setFeedbackComment(''); setFeedbackError(null); setFeedbackSuccess(null); setIsSubmittingFeedback(false); } if (!closing) { setIsSettingsOpen(false); setIsStaffLoginModalVisible(false); } };
    const handleFeedbackSubmit = async (e: React.FormEvent) => { e.preventDefault(); if (feedbackRating === 0) { setFeedbackError("Please select a star rating."); return; } if (!feedbackComment.trim()) { setFeedbackError("Please provide a comment."); return; } if (feedbackComment.length > 2000) { setFeedbackError("Comment is too long (max 2000 characters)."); return; } setIsSubmittingFeedback(true); setFeedbackError(null); setFeedbackSuccess(null); const payload: ApiRequestBody = { action: 'submitFeedback', email: feedbackEmail.trim() || null, rating: feedbackRating, comment: feedbackComment.trim() }; try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await res.json().catch(() => ({ error: 'Invalid JSON response' })); if (!res.ok || !data.success) { throw new Error(data?.error || `Submit failed: ${res.statusText}`); } setFeedbackSuccess("Thank you! Your feedback has been submitted."); setFeedbackEmail(''); setFeedbackRating(0); setFeedbackComment(''); setTimeout(() => { toggleFeedbackModal(); }, 2500); if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY") { ReactGA.event({ category: "Feedback", action: "Submit", label: `Rating: ${feedbackRating}` }); } } catch (err) { setFeedbackError(err instanceof Error ? err.message : "Failed to submit feedback."); } finally { setIsSubmittingFeedback(false); } };
    const toggleTheme = useCallback(() => { setCurrentTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light')); }, []);

    // --- JSX ---
    return (
        <div className="App">
            {showBetaNotice && ( <div className="beta-notice-overlay"><div className="beta-notice-modal"><h2>⚠️ Beta Notice</h2><p>Welcome! This is a beta test version. Features may change or contain bugs.</p><p>Your feedback is valuable!</p><button onClick={handleAcceptBeta} className="beta-accept-button">✔️ Accept & Continue</button></div></div> )}

            {isSettingsOpen && (
                <div className="settings-menu" role="dialog" aria-labelledby="settings-title">
                    <h3 id="settings-title">Settings</h3>
                    <div className="settings-grid">
                        {/* Column 1: Key, Persona, Model */}
                        <div className="settings-column">
                             <div className="settings-option"> <label htmlFor="access-key-input">Access Key:</label> <input type="password" id="access-key-input" className="settings-input" placeholder="Enter access key" value={enteredKey} onChange={handleAccessKeyChange} autoComplete="off"/> <div className="settings-key-status">{keyStatus.loading?<span>Validating...</span>:keyStatus.isValid?<span>✅ Valid Key ({keyStatus.username || 'User'})</span>:keyStatus.error?<span>❌ {keyStatus.error}</span>:<span>Enter key for restricted features.</span>}</div> </div>
                             <div className="settings-option"> <label htmlFor="persona-select">Persona:</label> <select id="persona-select" value={selectedPersona} onChange={handlePersonaChange} className="settings-select" disabled={AVAILABLE_PERSONAS.find(p=>p.value===selectedPersona)?.restricted&&keyStatus.isValid!==true}>{AVAILABLE_PERSONAS.map((p)=>{const isDisabled=p.restricted&&keyStatus.isValid!==true;const style=isDisabled?{color:'#888',fontStyle:'italic'}:{};return(<option key={p.value} value={p.value} disabled={isDisabled} style={style}>{p.emoji} {p.label}{p.restricted?' (Key Req.) ':''}</option>);})}</select> </div>
                             <div className="settings-option"> <label htmlFor="model-select">AI Model:</label> <select id="model-select" value={selectedModel} onChange={handleModelChange} className="settings-select" disabled={ALL_AVAILABLE_MODELS_FRONTEND.find(m=>m.value===selectedModel)?.restricted&&keyStatus.isValid!==true}>{ALL_AVAILABLE_MODELS_FRONTEND.map((m)=>{const isDisabled=m.restricted&&keyStatus.isValid!==true;const style=isDisabled?{color:'#888',fontStyle:'italic'}:{};return(<option key={m.value} value={m.value} disabled={isDisabled} style={style}>{m.label}{m.restricted?' (Key Req.)':''}</option>);})}</select> {keyStatus.isValid!==true&&(RESTRICTED_PERSONAS_VALUES.length>0||RESTRICTED_MODELS_VALUES.length>0)&&(<p className="settings-helper-text">Enter valid key to unlock restricted options.</p>)} </div>
                         </div>
                        {/* Column 2: Language, Theme, Actions */}
                        <div className="settings-column">
                             <div className="settings-option"> <label htmlFor="stt-lang-select">Speech Input Lang:</label> <select id="stt-lang-select" value={sttLang} onChange={handleSttLangChange} className="settings-select"><option value="en-US">English (US)</option><option value="th-TH">ไทย (Thai)</option><option value="es-ES">Español (Spain)</option><option value="fr-FR">Français (France)</option></select> </div>
                             <div className="settings-option">
                                 <label htmlFor="theme-toggle">Appearance:</label>
                                 <button onClick={toggleTheme} id="theme-toggle" className="settings-action-button theme-toggle-button">
                                     {currentTheme === 'light' ? '🌙 Switch to Dark Mode' : '☀️ Switch to Light Mode'}
                                 </button>
                             </div>
                             <div className="settings-option"> <label>Chat Actions:</label> <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}><button onClick={handleExportChat} className="settings-action-button export-chat-settings-button">💾 Export Chat</button><button onClick={handleClearChat} className="settings-action-button clear-chat-settings-button">🗑️ Clear Chat History</button></div> </div>
                             <div className="settings-option"> <label>Admin Area:</label> <button onClick={toggleStaffLoginModal} className="settings-action-button staff-area-button">🔑 Staff Login</button> </div>
                         </div>
                    </div>
                    <hr className="settings-separator" />
                    <button onClick={toggleSettings} className="close-settings-button">Close Settings</button>
                </div>
            )}

            {isStaffLoginModalVisible && ( <div className="staff-panel-overlay"> <div className="staff-panel-modal" style={{ maxWidth: '400px' }}> <h3 id="staff-login-title">Staff Login</h3> <button onClick={toggleStaffLoginModal} className="close-staff-panel-button" title="Close Login">×</button> <form onSubmit={(e)=>{e.preventDefault(); handleStaffLogin();}} className="staff-login-section"> <div className="settings-option"> <label htmlFor="staff-key-modal-input">Staff Key:</label> <input type="password" id="staff-key-modal-input" className="settings-input" value={enteredStaffKey} onChange={handleStaffKeyChange} placeholder="Enter staff access key" disabled={isStaffLoginLoading} autoFocus required/> </div> <button type="submit" className="staff-login-button" disabled={isStaffLoginLoading || !enteredStaffKey.trim()}> {isStaffLoginLoading ? 'Verifying...' : 'Login & Enter Admin'} </button> {staffLoginError && <p className="staff-error">{staffLoginError}</p>} <p className="staff-security-warning">Enter key to access admin page.</p> </form> </div> </div> )}

            {isFeedbackModalVisible && ( <div className="feedback-modal-overlay"> <div className="feedback-modal"> <h3 id="feedback-title">Submit Feedback</h3> <button onClick={toggleFeedbackModal} className="close-feedback-button" title="Close Feedback">×</button> {feedbackSuccess && <p className="feedback-message success">{feedbackSuccess}</p>} {feedbackError && <p className="feedback-message error">{feedbackError}</p>} {!feedbackSuccess && ( <form onSubmit={handleFeedbackSubmit} className="feedback-form"> <div className="feedback-field"> <label htmlFor="feedback-email">Email (Optional):</label> <input type="email" id="feedback-email" className="settings-input" value={feedbackEmail} onChange={(e) => setFeedbackEmail(e.target.value)} placeholder="your.email@example.com" maxLength={250} disabled={isSubmittingFeedback} /> </div> <div className="feedback-field"> <label>Rating:<span style={{color:'red'}}>*</span></label> <div className="star-rating"> {[1, 2, 3, 4, 5].map(star => ( <button key={star} type="button" aria-pressed={star === feedbackRating} className={`star-button ${star <= feedbackRating ? 'selected' : ''}`} onClick={() => setFeedbackRating(star)} disabled={isSubmittingFeedback} aria-label={`Rate ${star}/5`}>★</button> ))} </div> </div> <div className="feedback-field"> <label htmlFor="feedback-comment">Comment:<span style={{color:'red'}}>*</span></label> <textarea id="feedback-comment" className="settings-input" rows={5} value={feedbackComment} onChange={(e) => setFeedbackComment(e.target.value)} placeholder="Tell us about your experience, suggestions, or any bugs..." maxLength={2000} required disabled={isSubmittingFeedback} /> </div> <div className="feedback-actions"> <button type="button" onClick={toggleFeedbackModal} className="cancel-feedback-button" disabled={isSubmittingFeedback}>Cancel</button> <button type="submit" className="submit-feedback-button" disabled={isSubmittingFeedback || feedbackRating === 0 || !feedbackComment.trim()}> {isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'} </button> </div> </form> )} </div> </div> )}

            {/* Main Routing */}
            <Routes>
                <Route path="/" element={
                    <>
                        <header className="App-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <button onClick={toggleSettings} className="settings-button" title="Settings">⚙️</button>
                                <button onClick={toggleFeedbackModal} className="settings-button" title="Submit Feedback">💬</button>
                            </div>
                            <h1>Project Theraphy</h1>
                            <div className="header-spacer-right"></div>
                        </header>
                        <ChatbotPage
                            messages={messages}
                            setMessages={setMessages}
                            selectedModel={selectedModel}
                            sttLang={sttLang}
                            selectedPersona={selectedPersona}
                            accessKey={enteredKey}
                        />
                    </>
                } />
                <Route path="/admin" element={
                    <ProtectedRoute>
                        <AdminPage />
                    </ProtectedRoute>
                } />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </div>
    );
}

export default App;