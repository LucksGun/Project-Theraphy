// src/App.tsx - Copy Key & Edit Username in Staff Panel
import React, { useState, useEffect, ChangeEvent, useRef } from 'react';
import ReactGA from 'react-ga4';
import './App.css';
import ChatbotPage from './ChatbotPage';

// --- GA ---
const GA_MEASUREMENT_ID = "G-JX58QMMKZY";
if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" && GA_MEASUREMENT_ID !== "YOUR_GA_ID_HERE") { try { ReactGA.initialize(GA_MEASUREMENT_ID); console.log("GA Init:", GA_MEASUREMENT_ID); ReactGA.send({ hitType: "pageview", page: window.location.pathname + window.location.search, title: "Initial Load" }); } catch (e) { console.error("GA Init Err:", e); } } else { console.warn("GA ID missing/invalid. GA not initialized."); }

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
interface ApiRequestBody { prompt?: string; model?: GeminiModel; persona?: Persona; imageMimeType?: string; imageDataUrl?: string; accessKey?: string; action: string; staffKey?: string; key?: string; newStatus?: 'active' | 'inactive'; models?: GeminiModel[]; personas?: Persona[]; username?: string | null; newUsername?: string | null; } // Added newUsername
async function getBotResponseForAnalysis(userInput: string, model: GeminiModel, persona: Persona, accessKey: string): Promise<string> { const promptToSend = userInput; if (!promptToSend) return "Error: No text provided."; const requestBody: ApiRequestBody = { action: 'chat', prompt: promptToSend, model: model, persona: persona, accessKey: accessKey }; console.log(`Sending Analysis Request`); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) }); if (!res.ok) { const errData = await res.json().catch(() => ({ error: `HTTP Error ${res.status}` })); throw new Error(errData?.error || `HTTP Error ${res.status}`); } const data = await res.json(); if (data.error) throw new Error(data.error); return data.reply || 'No reply.'; } catch (e) { console.error('Analysis API Error:', e); if (e instanceof Error) { if (e.message.includes("Access Key required") || e.message.includes("Invalid")) return "Error: Invalid/Inactive Access Key."; return `Error: ${e.message}`; } return 'Error: Analysis failed.'; } }
const VALIDATION_DEBOUNCE_MS = 600;

function App() {
    // --- State ---
    const [messages, setMessages] = useState<Message[]>(() => { const stored = localStorage.getItem(CHAT_STORAGE_KEY); let initial: Message[] = []; try { initial = stored && stored !== '[]' ? JSON.parse(stored) : []; if (!Array.isArray(initial)) throw new Error("Bad format"); initial = initial.filter(m => m.sender !== 'loading'); } catch (e) { console.error("Bad stored msgs:", e); localStorage.removeItem(CHAT_STORAGE_KEY); initial = []; } if (initial.length === 0) { const ts = Date.now(); return [{ id: ts, text: "Welcome!", sender: 'bot', timestamp: ts }]; } else { return initial; } });
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
    // Staff Panel State
    const [isStaffPanelVisible, setIsStaffPanelVisible] = useState<boolean>(false);
    const [enteredStaffKey, setEnteredStaffKey] = useState<string>('');
    const [isStaffAuthenticated, setIsStaffAuthenticated] = useState<boolean>(false);
    const [adminUserKeysList, setAdminUserKeysList] = useState<UserKeyInfo[]>([]);
    const [adminRestrictedModelsList, setAdminRestrictedModelsList] = useState<GeminiModel[]>([]);
    const [adminRestrictedPersonasList, setAdminRestrictedPersonasList] = useState<Persona[]>([]);
    const [newKeyUsername, setNewKeyUsername] = useState<string>('');
    const [editingKey, setEditingKey] = useState<string | null>(null); // <-- State for inline editing key
    const [editUsernameValue, setEditUsernameValue] = useState<string>(''); // <-- State for inline editing value
    const [isAdminLoading, setIsAdminLoading] = useState<boolean>(false);
    const [adminError, setAdminError] = useState<string | null>(null);
    const [adminSuccess, setAdminSuccess] = useState<string | null>(null);

    // --- Effects ---
    useEffect(() => { /* Debounced Key Validation */ const keyTrimmed=enteredKey.trim();if(debounceTimeoutRef.current)clearTimeout(debounceTimeoutRef.current);const cM=selectedModel;const cP=selectedPersona;if(!keyTrimmed){setKeyStatus({isValid:null,username:null,loading:false,error:null});if(RESTRICTED_MODELS_VALUES.includes(cM))setSelectedModel('gemini-2.0-flash');if(RESTRICTED_PERSONAS_VALUES.includes(cP))setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);return;}setKeyStatus(p=>({...p,loading:true,isValid:null,error:null,username:null}));debounceTimeoutRef.current=setTimeout(async()=>{try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'validateKey',accessKey:keyTrimmed})});const d=await r.json().catch(()=>({error:`Invalid JSON`}));if(!r.ok)throw new Error(d?.error||`Validation failed: ${r.status}`);if(d.isValid){setKeyStatus({isValid:true,username:d.username||'User',loading:false,error:null});const sM=localStorage.getItem(MODEL_STORAGE_KEY)as GeminiModel|null;if(sM&&ALL_MODEL_VALUES.includes(sM))setSelectedModel(sM);else if(RESTRICTED_MODELS_VALUES.includes(cM))setSelectedModel(cM);else setSelectedModel(cM);const sP=localStorage.getItem(PERSONA_STORAGE_KEY)as Persona|null;if(sP&&ALL_PERSONAS.includes(sP))setSelectedPersona(sP);else if(RESTRICTED_PERSONAS_VALUES.includes(cP))setSelectedPersona(cP);else setSelectedPersona(cP);}else{setKeyStatus({isValid:false,username:null,loading:false,error:d?.error||'Invalid key.'});if(RESTRICTED_MODELS_VALUES.includes(cM))setSelectedModel('gemini-2.0-flash');if(RESTRICTED_PERSONAS_VALUES.includes(cP))setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);}}catch(e){const m=e instanceof Error?e.message:"Validation network error.";setKeyStatus({isValid:false,username:null,loading:false,error:m});if(RESTRICTED_MODELS_VALUES.includes(cM))setSelectedModel('gemini-2.0-flash');if(RESTRICTED_PERSONAS_VALUES.includes(cP))setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);}},VALIDATION_DEBOUNCE_MS);return()=>{if(debounceTimeoutRef.current)clearTimeout(debounceTimeoutRef.current);};},[enteredKey,selectedModel,selectedPersona]);
    useEffect(() => { /* Initial Load */ const iK=localStorage.getItem(ACCESS_KEY_STORAGE_KEY)||'';const sM=localStorage.getItem(MODEL_STORAGE_KEY)as GeminiModel|null;const sP=localStorage.getItem(PERSONA_STORAGE_KEY)as Persona|null;let iM:GeminiModel='gemini-2.0-flash';if(sM&&ALL_MODEL_VALUES.includes(sM))iM=sM;setSelectedModel(iM);let iP:Persona=DEFAULT_UNRESTRICTED_PERSONA;if(sP&&ALL_PERSONAS.includes(sP))iP=sP;setSelectedPersona(iP);const acc=localStorage.getItem(BETA_ACCEPTED_KEY);if(acc!=='true')setShowBetaNotice(true);if(iK.trim()){const valInit=async(k:string,m:GeminiModel,p:Persona)=>{setKeyStatus(pr=>({...pr,loading:true}));try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'validateKey',accessKey:k})});const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(r.ok&&d.isValid){setKeyStatus({isValid:true,username:d.username||'User',loading:false,error:null});setSelectedModel(m);setSelectedPersona(p);}else{setKeyStatus({isValid:false,username:null,loading:false,error:d?.error||'Invalid key'});if(RESTRICTED_MODELS_VALUES.includes(m))setSelectedModel('gemini-2.0-flash');if(RESTRICTED_PERSONAS_VALUES.includes(p))setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);}}catch(e){setKeyStatus({isValid:false,username:null,loading:false,error:'Validation failed'});if(RESTRICTED_MODELS_VALUES.includes(m))setSelectedModel('gemini-2.0-flash');if(RESTRICTED_PERSONAS_VALUES.includes(p))setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);}};valInit(iK,iM,iP);}else{if(RESTRICTED_MODELS_VALUES.includes(iM))setSelectedModel('gemini-2.0-flash');if(RESTRICTED_PERSONAS_VALUES.includes(iP))setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);}},[]);
    useEffect(() => { /* Persistence */ const msgs=messages.filter(m=>m.sender!=='loading');if(msgs.length>1||(msgs.length===1&&msgs[0].sender!=='bot')){localStorage.setItem(CHAT_STORAGE_KEY,JSON.stringify(msgs));}else if(msgs.length===0){localStorage.setItem(CHAT_STORAGE_KEY,JSON.stringify([]));}},[messages]); useEffect(()=>{localStorage.setItem(MODEL_STORAGE_KEY,selectedModel);},[selectedModel]);useEffect(()=>{localStorage.setItem(STT_LANG_STORAGE_KEY,sttLang);},[sttLang]);useEffect(()=>{localStorage.setItem(ACCESS_KEY_STORAGE_KEY,enteredKey);},[enteredKey]);useEffect(()=>{localStorage.setItem(PERSONA_STORAGE_KEY,selectedPersona);},[selectedPersona]);
    useEffect(() => { let timer:NodeJS.Timeout|null=null; if(adminSuccess){timer=setTimeout(()=>setAdminSuccess(null),3000);} return()=>{if(timer)clearTimeout(timer);}; },[adminSuccess]);

    // --- Event Handlers ---
    const handleAcceptBeta=()=>{localStorage.setItem(BETA_ACCEPTED_KEY,'true');setShowBetaNotice(false);}; const handleModelChange=(e:ChangeEvent<HTMLSelectElement>)=>{const m=e.target.value as GeminiModel;if(ALL_MODEL_VALUES.includes(m))setSelectedModel(m);}; const handleSttLangChange=(e:ChangeEvent<HTMLSelectElement>)=>{setSttLang(e.target.value as SpeechLanguage);}; const handlePersonaChange=(e:ChangeEvent<HTMLSelectElement>)=>{const p=e.target.value as Persona;if(ALL_PERSONAS.includes(p))setSelectedPersona(p);}; const toggleSettings=()=>{setIsSettingsOpen(p=>!p);if(isSettingsOpen&&isStaffPanelVisible){setIsStaffPanelVisible(false);setIsStaffAuthenticated(false);setEnteredStaffKey('');setAdminError(null);setAdminSuccess(null);}}; const handleClearChat=()=>{if(window.confirm("Clear chat?")){const ts=Date.now();const msg:Message={id:ts,text:"Chat cleared.",sender:'bot',timestamp:ts};setMessages([msg]);localStorage.removeItem(CHAT_STORAGE_KEY);setIsSettingsOpen(false);}}; const handleAccessKeyChange=(e:ChangeEvent<HTMLInputElement>)=>{setEnteredKey(e.target.value);}; const handleExportChat=()=>{const msgs=messages.filter(m=>m.sender!=='loading');if(msgs.length===0||(msgs.length===1&&msgs[0].sender==='bot'))return alert("Chat empty.");let c=`Chat Export\nAt: ${new Date().toLocaleString()}\nModel: ${selectedModel}\nPersona: ${selectedPersona}\nUser: ${keyStatus.isValid?keyStatus.username:'N/A'}\n----\n\n`;msgs.forEach(m=>{const t=new Date(m.timestamp).toLocaleString();c+=`[${t}] ${m.sender==='user'?'User':'Bot'}:\n${m.text}\n${m.imageUrl?`(Image: ${m.imageUrl})\n`:''}\n`;});try{const b=new Blob([c],{type:'text/plain;charset=utf-8'});const u=URL.createObjectURL(b);const a=document.createElement('a');const f=`theraphy-chat-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`;a.href=u;a.download=f;a.click();URL.revokeObjectURL(u);if(GA_MEASUREMENT_ID&&GA_MEASUREMENT_ID!=="G-JX58QMMKZY"&&GA_MEASUREMENT_ID!=="YOUR_GA_ID_HERE")ReactGA.event({category:"Chat",action:"Export",label:`Count: ${msgs.length}`});setIsSettingsOpen(false);}catch(e){console.error("Export failed:",e);alert("Export failed.");}};
    const clearAnalysisForm=()=>{setField1('');setField2('');setField3('');setField4('');setField5('');}; const toggleAnalysisForm=()=>{setIsAnalysisFormVisible(p=>!p);if(isAnalysisFormVisible){clearAnalysisForm();setIsAnalyzing(false);}}; const handleAnalysisSubmit=async(e:React.FormEvent)=>{e.preventDefault();const v1=field1.trim();const v2=field2.trim();const v3=field3.trim();const v4=field4.trim();const v5=field5.trim();if(!v1||!v2||!v3||!v4||!v5||isAnalyzing)return alert("Fill all fields.");setIsAnalyzing(true);if(GA_MEASUREMENT_ID&&GA_MEASUREMENT_ID!=="G-JX58QMMKZY"&&GA_MEASUREMENT_ID!=="YOUR_GA_ID_HERE"){try{ReactGA.event({category:"Analysis",action:"Submit",label:`F1 Len: ${v1.length}`});}catch(e){console.error("GA event fail:",e);}}let input=`Field 1: ${v1}\nField 2: ${v2}\nField 3: ${v3}\nField 4: ${v4}\nField 5: ${v5}\n`;const ts=Date.now();const loadMsg:Message={id:ts,text:`Analyzing...`,sender:'loading',timestamp:ts};setMessages(p=>[...p,loadMsg]);const result=await getBotResponseForAnalysis(input.trim(),selectedModel,selectedPersona,enteredKey);setMessages(p=>p.filter(m=>m.id!==ts));if(result.startsWith("Error: Access Key required")){setKeyStatus({isValid:false,username:null,loading:false,error:"Key required."});const et=Date.now()+1;const em:Message={id:et,text:result,sender:'bot',timestamp:et};setMessages(p=>[...p,em]);}else if(result.startsWith("Error:")){setKeyStatus(pr=>({...pr,error:result}));const et=Date.now()+1;const em:Message={id:et,text:result,sender:'bot',timestamp:et};setMessages(p=>[...p,em]);}else{setKeyStatus(pr=>({...pr,error:null}));const te=Date.now()+1;const rm:Message={id:te,text:result,sender:'bot',timestamp:te};setMessages(p=>[...p,rm]);clearAnalysisForm();setIsAnalysisFormVisible(false);}setIsAnalyzing(false);};

    // --- Staff Panel Handlers ---
    const toggleStaffPanel=()=>{setIsStaffPanelVisible(p=>!p);if(isStaffPanelVisible){setIsStaffAuthenticated(false);setEnteredStaffKey('');setAdminError(null);setAdminSuccess(null);setNewKeyUsername('');setEditingKey(null);setEditUsernameValue('');setAdminUserKeysList([]);setAdminRestrictedModelsList([]);setAdminRestrictedPersonasList([]);}};
    const handleStaffKeyChange=(e:ChangeEvent<HTMLInputElement>)=>{setEnteredStaffKey(e.target.value);};
    const handleNewKeyUsernameChange=(e:ChangeEvent<HTMLInputElement>)=>{setNewKeyUsername(e.target.value);};
    const handleEditUsernameChange=(e:ChangeEvent<HTMLInputElement>)=>{setEditUsernameValue(e.target.value);}; // <-- Handler for edit input
    const handleStaffLogin=async()=>{if(!enteredStaffKey.trim()){setAdminError("Staff Key required.");return;}setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null);try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'staffLogin',staffKey:enteredStaffKey})});const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.isValid)throw new Error(d?.error||`Login Failed: ${r.status}`);setIsStaffAuthenticated(true);setAdminError(null);}catch(e){setIsStaffAuthenticated(false);setAdminError(e instanceof Error?e.message:"Login failed.");}finally{setIsAdminLoading(false);}};
    const fetchAdminData=async()=>{if(!isStaffAuthenticated||!enteredStaffKey)return;setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null);setAdminUserKeysList([]);setAdminRestrictedModelsList([]);setAdminRestrictedPersonasList([]);try{const[kRes,rRes]=await Promise.all([fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'adminListKeys',staffKey:enteredStaffKey})}),fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'adminGetRestrictions',staffKey:enteredStaffKey})})]);const kData=await kRes.json().catch(()=>({error:'Invalid JSON keys'}));if(!kRes.ok||!kData.success)throw new Error(kData?.error||'Failed fetch keys.');setAdminUserKeysList(kData.keys||[]);const rData=await rRes.json().catch(()=>({error:'Invalid JSON restrictions'}));if(!rRes.ok||!rData.success)throw new Error(rData?.error||'Failed fetch restrictions.');setAdminRestrictedModelsList(rData.restrictedModels||[]);setAdminRestrictedPersonasList(rData.restrictedPersonas||[]);}catch(e){setAdminError(e instanceof Error?e.message:"Failed load admin data.");}finally{setIsAdminLoading(false);}};
    useEffect(()=>{if(isStaffPanelVisible&&isStaffAuthenticated)fetchAdminData();},[isStaffPanelVisible,isStaffAuthenticated]);

    const handleToggleUserKeyStatus=async(key:string,status:'active'|'inactive')=>{const nS=status==='active'?'inactive':'active';const kS=key.substring(0,8);if(!window.confirm(`Set key "${kS}..." to ${nS}?`))return;setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null);try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'adminUpdateKeyStatus',staffKey:enteredStaffKey,key:key,newStatus:nS})});const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Update failed: ${r.status}`);setAdminSuccess(d.message||"Status updated.");}catch(e){setAdminError(e instanceof Error?e.message:"Failed update.");}finally{fetchAdminData();}};
    const handleToggleModelRestriction=async(val:GeminiModel)=>{const isR=adminRestrictedModelsList.includes(val);const act=isR?"make public":"make restricted";if(!window.confirm(`Make model "${val}" ${act}?`))return;const nL=isR?adminRestrictedModelsList.filter(m=>m!==val):[...adminRestrictedModelsList,val];setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null);try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'adminSetRestrictedModels',staffKey:enteredStaffKey,models:nL})});const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Save failed: ${r.status}`);setAdminSuccess(d.message||"Models updated.");}catch(e){setAdminError(e instanceof Error?e.message:"Failed save.");}finally{fetchAdminData();}};
    const handleTogglePersonaRestriction=async(val:Persona)=>{const isR=adminRestrictedPersonasList.includes(val);const pI=AVAILABLE_PERSONAS.find(p=>p.value===val);const pL=pI?pI.label:val;const act=isR?"make public":"make restricted";if(!window.confirm(`Make persona "${pL}" ${act}?`))return;const nL=isR?adminRestrictedPersonasList.filter(p=>p!==val):[...adminRestrictedPersonasList,val];setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null);try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'adminSetRestrictedPersonas',staffKey:enteredStaffKey,personas:nL})});const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Save failed: ${r.status}`);setAdminSuccess(d.message||"Personas updated.");}catch(e){setAdminError(e instanceof Error?e.message:"Failed save.");}finally{fetchAdminData();}};
    const handleAddNewKey=async()=>{setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null);const uTS=newKeyUsername.trim()||null;try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'adminAddKey',staffKey:enteredStaffKey,username:uTS})});const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Add failed: ${r.status}`);setAdminSuccess(d.message||"Key added!");setNewKeyUsername('');}catch(e){setAdminError(e instanceof Error?e.message:"Failed add key.");}finally{fetchAdminData();}};
    const handleDeleteKey=async(keyToDelete:string)=>{const kS=keyToDelete.substring(0,8);if(!window.confirm(`DELETE key "${kS}..."? Cannot undo.`))return;setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null);try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'adminDeleteKey',staffKey:enteredStaffKey,key:keyToDelete})});const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Delete failed: ${r.status}`);setAdminSuccess(d.message||"Key deleted!");}catch(e){setAdminError(e instanceof Error?e.message:"Failed delete key.");}finally{fetchAdminData();}};
    const handleCopyKey=async(keyToCopy:string)=>{try{await navigator.clipboard.writeText(keyToCopy);setAdminSuccess(`Key copied!`);}catch(e){console.error("Copy failed:",e);setAdminError("Failed to copy key.");}};
    const handleStartEdit=(key:string,currentUsername:string|null)=>{setEditingKey(key);setEditUsernameValue(currentUsername||'');};
    const handleCancelEdit=()=>{setEditingKey(null);setEditUsernameValue('');};
    const handleSaveUsername=async()=>{if(editingKey===null)return;const keyToEdit=editingKey;const usernameToSend=editUsernameValue.trim()||null;setIsAdminLoading(true);setAdminError(null);setAdminSuccess(null);try{const r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'adminEditUsername',staffKey:enteredStaffKey,key:keyToEdit,newUsername:usernameToSend})});const d=await r.json().catch(()=>({error:'Invalid JSON'}));if(!r.ok||!d.success)throw new Error(d?.error||`Update username failed: ${r.status}`);setAdminSuccess(d.message||"Username updated!");setEditingKey(null);setEditUsernameValue('');}catch(e){setAdminError(e instanceof Error?e.message:"Failed update username.");}finally{fetchAdminData();}};


    // --- JSX ---
    return (
        <div className="App">
            {isSettingsOpen && ( <div className="settings-menu"> <h3 id="settings-title">Settings</h3> <div className="settings-grid"> <div className="settings-column"> <div className="settings-option"> <label htmlFor="access-key-input">Access Key:</label> <input type="password" id="access-key-input" className="settings-input" placeholder="Enter access key" value={enteredKey} onChange={handleAccessKeyChange} autoComplete="off"/> <div className="settings-key-status">{keyStatus.loading?<span>Validating...</span>:keyStatus.isValid===true&&keyStatus.username?<span>✅ Valid. Welcome, {keyStatus.username}!</span>:keyStatus.isValid===false?<span>❌ {keyStatus.error||"Invalid key."}</span>:!enteredKey.trim()?<span>Enter key for restricted features.</span>:<span>Validation pending...</span>}</div> </div> <div className="settings-option"> <label htmlFor="persona-select">Persona:</label> <select id="persona-select" value={selectedPersona} onChange={handlePersonaChange} className="settings-select" disabled={AVAILABLE_PERSONAS.find(p=>p.value===selectedPersona)?.restricted&&keyStatus.isValid!==true}>{AVAILABLE_PERSONAS.map((p)=>{const isDisabled=p.restricted&&keyStatus.isValid!==true;const style=isDisabled?{color:'#888',fontStyle:'italic'}:{};return(<option key={p.value} value={p.value} disabled={isDisabled} style={style}>{p.emoji} {p.label}{p.restricted?' (Key) ':''}</option>);})}</select> </div> <div className="settings-option"> <label htmlFor="model-select">AI Model:</label> <select id="model-select" value={selectedModel} onChange={handleModelChange} className="settings-select" disabled={ALL_AVAILABLE_MODELS_FRONTEND.find(m=>m.value===selectedModel)?.restricted&&keyStatus.isValid!==true}>{ALL_AVAILABLE_MODELS_FRONTEND.map((m)=>{const isDisabled=m.restricted&&keyStatus.isValid!==true;const style=isDisabled?{color:'#888',fontStyle:'italic'}:{};return(<option key={m.value} value={m.value} disabled={isDisabled} style={style}>{m.label}{m.restricted?' (Key)':''}</option>);})}</select> {keyStatus.isValid!==true&&(RESTRICTED_PERSONAS_VALUES.length>0||RESTRICTED_MODELS_VALUES.length>0)&&(<p className="settings-helper-text">Enter valid key for restricted options.</p>)} </div> </div> <div className="settings-column"> <div className="settings-option"> <label htmlFor="stt-lang-select">Speech Lang:</label> <select id="stt-lang-select" value={sttLang} onChange={handleSttLangChange} className="settings-select"><option value="en-US">English (US)</option><option value="th-TH">ไทย (Thai)</option><option value="es-ES">Español</option><option value="fr-FR">Français</option></select> </div> <div className="settings-option"> <label>Chat Actions:</label> <div><button onClick={handleExportChat} className="settings-action-button export-chat-settings-button">💾 Export Chat</button><button onClick={handleClearChat} className="settings-action-button clear-chat-settings-button">🗑️ Clear Chat</button></div> </div> <div className="settings-option"> <label>Admin Area:</label> <button onClick={toggleStaffPanel} className="settings-action-button staff-area-button">🔑 Staff Panel</button> </div> </div> </div> <hr className="settings-separator" /> <button onClick={toggleSettings} className="close-settings-button">Close</button> </div> )}

            {isStaffPanelVisible && (
                <div className="staff-panel-overlay">
                    <div className="staff-panel-modal">
                        <h3 id="staff-panel-title">Staff Panel</h3>
                        <button onClick={toggleStaffPanel} className="close-staff-panel-button" title="Close">×</button>
                        {!isStaffAuthenticated ? (
                            <div className="staff-login-section"> <div className="settings-option"> <label htmlFor="staff-key-input">Staff Key:</label> <input type="password" id="staff-key-input" className="settings-input" value={enteredStaffKey} onChange={handleStaffKeyChange} placeholder="Enter staff access key" disabled={isAdminLoading}/> </div> <button onClick={handleStaffLogin} className="staff-login-button" disabled={isAdminLoading||!enteredStaffKey.trim()}> {isAdminLoading ? 'Verifying...' : 'Login'} </button> {adminError && <p className="staff-error">{adminError}</p>} <p className="staff-security-warning">Authorized access only.</p> </div>
                        ) : (
                            <div className="staff-admin-section">
                                {adminSuccess && <p className="key-valid" style={{textAlign:'center', marginBottom:'15px', padding:'8px', backgroundColor: '#d1e7dd', borderRadius:'4px'}}>{adminSuccess}</p>}
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
                                                        <th>Key {/* Changed Header */}</th>
                                                        <th>Username</th>
                                                        <th>Status</th>
                                                        <th>Created</th>
                                                        <th style={{width: '200px'}}>Actions</th> {/* Wider Actions */}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {adminUserKeysList.map(k => (
                                                    <tr key={k.key}>
                                                        <td> {/* Display Full Key & Copy Button */}
                                                            <code style={{ marginRight: '5px', wordBreak: 'break-all' }}>{k.key}</code>
                                                            <button onClick={() => handleCopyKey(k.key)} title="Copy Key" style={{background:'none', border:'none', cursor:'pointer', fontSize:'0.9em', padding:'0 3px'}}>📋</button>
                                                        </td>
                                                        <td> {/* Editable Username */}
                                                            {editingKey === k.key ? (
                                                                <input
                                                                    type="text"
                                                                    value={editUsernameValue}
                                                                    onChange={handleEditUsernameChange}
                                                                    className="settings-input" // Reuse style
                                                                    style={{ padding: '4px 6px', fontSize: '0.9em', height: 'auto' }}
                                                                    autoFocus
                                                                    onKeyDown={(e) => { if(e.key==='Enter') handleSaveUsername(); else if (e.key==='Escape') handleCancelEdit(); }}
                                                                />
                                                            ) : (
                                                                k.username || <span style={{color:'#888'}}><em>(none)</em></span>
                                                            )}
                                                        </td>
                                                        <td><span style={{color: k.status==='active'?'var(--key-valid-color)':'var(--key-invalid-color)', fontWeight:500}}>{k.status}</span></td>
                                                        <td>{new Date(k.created_at).toLocaleDateString()}</td>
                                                        <td> {/* Actions Column */}
                                                            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                                                {editingKey === k.key ? (
                                                                    <>
                                                                        <button onClick={handleSaveUsername} className="key-status-toggle-button activate" disabled={isAdminLoading} style={{flexGrow:1}}>Save</button>
                                                                        <button onClick={handleCancelEdit} className="key-status-toggle-button deactivate" disabled={isAdminLoading} style={{flexGrow:1, backgroundColor: '#eee', borderColor:'#ccc', color:'#555'}}>Cancel</button>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <button onClick={()=>handleToggleUserKeyStatus(k.key,k.status)} className={`key-status-toggle-button ${k.status==='active'?'deactivate':'activate'}`} disabled={isAdminLoading || !!editingKey}>{k.status==='active'?'Deactivate':'Activate'}</button>
                                                                        <button onClick={()=>handleStartEdit(k.key, k.username)} className="key-status-toggle-button activate" style={{backgroundColor:'#e9ecef', borderColor:'#dee2e6', color:'#495057'}} disabled={isAdminLoading || !!editingKey}>✏️</button>
                                                                        <button onClick={()=>handleDeleteKey(k.key)} className="key-status-toggle-button deactivate" disabled={isAdminLoading || !!editingKey} title={`Delete key`} style={{ flexGrow: 0, padding: '4px 6px'}}>🗑️</button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
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
                                                    disabled={isAdminLoading || !!editingKey}
                                                />
                                            </div>
                                            <button
                                                onClick={handleAddNewKey}
                                                className="staff-login-button"
                                                disabled={isAdminLoading || !!editingKey}
                                                style={{ flexShrink: 0, height:'35px', alignSelf:'flex-end', marginBottom:'0px'}}
                                            >
                                                {isAdminLoading ? 'Adding...' : '+ Add Key'}
                                            </button>
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
                        )}
                    </div>
                </div>
            )}

            {isAnalysisFormVisible && ( <div className="analysis-form-overlay"><div className="analysis-form-modal"> <h3 id="analysis-title">Submit Details for University Advice</h3><p style={{fontSize:'0.9em', color:'#555', marginBottom:'15px'}}>Provide details for AI analysis (University Master persona).</p> <form onSubmit={handleAnalysisSubmit}> <div className="settings-option" style={{marginBottom:'15px'}}><label htmlFor="analysis-field1">1. Concerns?</label><input type="text" id="analysis-field1" className="settings-input" value={field1} onChange={(e)=>setField1(e.target.value)} placeholder="e.g., workload, cost" disabled={isAnalyzing} required /></div> <div className="settings-option" style={{marginBottom:'15px'}}><label htmlFor="analysis-field2">2. Enjoy time with?</label><input type="text" id="analysis-field2" className="settings-input" value={field2} onChange={(e)=>setField2(e.target.value)} placeholder="e.g., friends, family" disabled={isAnalyzing} required /></div> <div className="settings-option" style={{marginBottom:'15px'}}><label htmlFor="analysis-field3">3. Describe yourself?</label><input type="text" id="analysis-field3" className="settings-input" value={field3} onChange={(e)=>setField3(e.target.value)} placeholder="e.g., creative, quiet" disabled={isAnalyzing} required /></div> <div className="settings-option" style={{marginBottom:'15px'}}><label htmlFor="analysis-field4">4. Dislike learning?</label><input type="text" id="analysis-field4" className="settings-input" value={field4} onChange={(e)=>setField4(e.target.value)} placeholder="e.g., memorization, exams" disabled={isAnalyzing} required /></div> <div className="settings-option" style={{marginBottom:'15px'}}><label htmlFor="analysis-field5">5. GPA?</label><input type="text" id="analysis-field5" className="settings-input" value={field5} onChange={(e)=>setField5(e.target.value)} placeholder="e.g., 3.5, 2.8" disabled={isAnalyzing} required /></div> <div className="analysis-form-actions"><button type="button" onClick={toggleAnalysisForm} className="close-settings-button" disabled={isAnalyzing}>Cancel</button><button type="submit" className="beta-accept-button" disabled={!field1.trim()||!field2.trim()||!field3.trim()||!field4.trim()||!field5.trim()||isAnalyzing}>{isAnalyzing?'Analyzing...':'Submit'}</button></div> </form> </div></div> )}
            {showBetaNotice && ( <div className="beta-notice-overlay"><div className="beta-notice-modal"><h2>⚠️ Beta Notice</h2><p>Welcome! This is a beta test.</p><p>Features may change, bugs might occur.</p><p>Acknowledge to continue.</p><button onClick={handleAcceptBeta} className="beta-accept-button">✔️ Accept</button></div></div> )}

            <header className="App-header"> <div style={{ display: 'flex', alignItems: 'center' }}> <button onClick={toggleSettings} className="settings-button" title="Settings">⚙️</button> <button onClick={toggleAnalysisForm} className="settings-button analysis-button" title="University Advice Form">📝</button> </div> <h1>Project Theraphy</h1> <div className="header-spacer-right"></div> </header>

            <ChatbotPage messages={messages} setMessages={setMessages} selectedModel={selectedModel} sttLang={sttLang} selectedPersona={selectedPersona} accessKey={enteredKey} />
        </div>
    );
}

export default App;