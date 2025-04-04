// src/App.tsx
import React, { useState, useEffect, ChangeEvent } from 'react';
import ReactGA from 'react-ga4';
import './App.css'; // Ensure this CSS file is linked
import ChatbotPage from './ChatbotPage'; // Assuming ChatbotPage component exists

// --- GA Measurement ID ---
const GA_MEASUREMENT_ID = "G-JX58QMMKZY"; // Replace with your actual ID

// --- Initialize GA & Send Initial Pageview ---
if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" && GA_MEASUREMENT_ID !== "G-JX58QMMKZY") {
  try { ReactGA.initialize(GA_MEASUREMENT_ID); console.log("GA Initialized:", GA_MEASUREMENT_ID); ReactGA.send({ hitType: "pageview", page: window.location.pathname + window.location.search, title: "Chatbot Initial Load" }); console.log("Initial Pageview Sent"); } catch (error) { console.error("Error initializing GA:", error); }
} else if (GA_MEASUREMENT_ID === "G-JX58QMMKZY") { console.warn("Using GA placeholder ID."); }
else { console.warn("GA ID missing/invalid."); }

// --- Message interface definition ---
export interface Message { id: number; text: string; sender: 'user' | 'bot' | 'loading'; timestamp: number; imageUrl?: string; }

// --- Types ---
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-pro-exp-03-25' | 'gemini-2.0-flash-thinking-exp-01-21' | 'gemini-2.0-flash-exp-image-generation';
export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR';
export type Persona = 'normal' | 'therapist' | 'university_master';

// --- localStorage Keys ---
const CHAT_STORAGE_KEY = 'chatMessages'; const BETA_ACCEPTED_KEY = 'betaAccepted'; const MODEL_STORAGE_KEY = 'selectedApiModel'; const STT_LANG_STORAGE_KEY = 'selectedSttLang'; const ACCESS_KEY_STORAGE_KEY = 'userAccessKey'; const PERSONA_STORAGE_KEY = 'selectedPersona';

// --- Configurations ---
interface ModelInfo { value: GeminiModel; label: string; restricted: boolean; }
const ALL_AVAILABLE_MODELS: ModelInfo[] = [ { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', restricted: false }, { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', restricted: false }, { value: 'gemini-2.0-flash-thinking-exp-01-21', label: 'Gemini 2.0 Flash Thinking Experimental', restricted: true }, { value: 'gemini-2.0-flash-exp-image-generation', label: 'Gemini 2.0 Flash Image Generation Experimental', restricted: true }, { value: 'gemini-2.5-pro-exp-03-25', label: 'Gemini 2.5 Pro Experimental', restricted: true } ];
const RESTRICTED_MODELS_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS.filter(m => m.restricted).map(m => m.value);

interface PersonaInfo { value: Persona; label: string; emoji: string; restricted: boolean; }
const AVAILABLE_PERSONAS: PersonaInfo[] = [ { value: 'university_master', label: 'University Master', emoji: '🎓', restricted: false }, { value: 'normal', label: 'Normal Bot', emoji: '🤖', restricted: true }, { value: 'therapist', label: 'Therapist', emoji: '🧠', restricted: true } ];
const RESTRICTED_PERSONAS_VALUES: Persona[] = AVAILABLE_PERSONAS.filter(p => p.restricted).map(p => p.value);
const DEFAULT_UNRESTRICTED_PERSONA: Persona = 'university_master';

// User Unique Key validation happens in the backend via D1

// --- API ---
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';
interface ApiRequestBody { prompt: string; model: GeminiModel; persona: Persona; imageMimeType?: string; imageDataUrl?: string; accessKey: string; }
async function getBotResponseForAnalysis( userInput: string, model: GeminiModel, persona: Persona, accessKey: string ): Promise<string> {
    const promptToSend = userInput; if (!promptToSend) { return "Error: No text provided for analysis."; }
    const requestBody: ApiRequestBody = { prompt: promptToSend, model: model, persona: persona, accessKey: accessKey };
    console.log(`Sending Analysis Request (Model: ${model}, Persona: ${persona}):`, { promptLength: promptToSend.length, model: requestBody.model, persona: requestBody.persona, accessKey: requestBody.accessKey ? 'present' : 'none' });
    try {
        const response = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify(requestBody), });
        if (!response.ok) { const errorData = await response.json().catch(() => ({ error: `HTTP error! Status: ${response.status} ${response.statusText}` })); throw new Error(errorData?.error || `HTTP error! Status: ${response.status} ${response.statusText}`); }
        const data = await response.json(); if (data.error) { throw new Error(data.error); } console.log('Received analysis reply:', data.reply); return data.reply || 'No reply.';
    } catch (error) { console.error('Error analysis:', error); if (error instanceof Error) { return `Error: ${error.message}`; } return 'Error fetching response.'; }
}

function App() {
  // --- State ---
  const [messages, setMessages] = useState<Message[]>(() => { const saved=localStorage.getItem(CHAT_STORAGE_KEY); let i:Message[]=[]; try{i=saved&&saved!=='[]'?JSON.parse(saved):[]; if(!Array.isArray(i))throw new Error("Bad fmt");}catch(e){console.error("Load fail",e);localStorage.removeItem(CHAT_STORAGE_KEY);i=[];} if(i.length===0){const t=Date.now();return[{id:t,text:"Welcome! Ask...",sender:'bot',timestamp:t}];}else{return i.filter(m=>m.sender!=='loading');} });
  const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);
  const [enteredKey, setEnteredKey] = useState<string>(() => localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '');
  const hasEnteredKey = !!enteredKey.trim();
  const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.0-flash'); // Initialize with a default
  const [sttLang, setSttLang] = useState<SpeechLanguage>(() => { const saved = localStorage.getItem(STT_LANG_STORAGE_KEY) as SpeechLanguage | null; if (saved && ['en-US','th-TH','es-ES','fr-FR'].includes(saved)) return saved; return 'en-US'; });
  const [selectedPersona, setSelectedPersona] = useState<Persona>(DEFAULT_UNRESTRICTED_PERSONA); // Initialize with a default
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAnalysisFormVisible, setIsAnalysisFormVisible] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [field1, setField1] = useState<string>(''); const [field2, setField2] = useState<string>(''); const [field3, setField3] = useState<string>(''); const [field4, setField4] = useState<string>(''); const [field5, setField5] = useState<string>('');
  const [validUsername, setValidUsername] = useState<string | null>(null);
  const [lastKeyError, setLastKeyError] = useState<string | null>(null);

  // --- Effects ---
  useEffect(() => { // Load initial settings based on key presence
    const savedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null;
    // ++ Declare initialModel with the correct Type and a default value ++
    let initialModel: GeminiModel = 'gemini-2.0-flash';
    if (savedModel && ALL_AVAILABLE_MODELS.some(m=>m.value===savedModel)) { if (!RESTRICTED_MODELS_VALUES.includes(savedModel) || hasEnteredKey) { initialModel = savedModel; } else { console.warn(`Saved model ${savedModel} restricted, no key. Fallback.`); } }
    setSelectedModel(initialModel); // Now the types match

    const savedPersona = localStorage.getItem(PERSONA_STORAGE_KEY) as Persona | null;
    // ++ Declare initialPersona with the correct Type and a default value ++
    let initialPersona: Persona = DEFAULT_UNRESTRICTED_PERSONA;
    if (savedPersona && AVAILABLE_PERSONAS.some(p=>p.value===savedPersona)) { if (!RESTRICTED_PERSONAS_VALUES.includes(savedPersona) || hasEnteredKey) { initialPersona = savedPersona; } else { console.warn(`Saved persona ${savedPersona} restricted, no key. Fallback.`); } }
    setSelectedPersona(initialPersona); // Types match

    // Reset validation status if key is removed/initially empty
    if (!hasEnteredKey) { setValidUsername(null); setLastKeyError(null); }
  }, [hasEnteredKey]); // Rerun when key presence changes

  // Persistence Effects
  useEffect(() => { const messagesToSave = messages.filter(msg => msg.sender !== 'loading'); if (messagesToSave.length > 1 || (messagesToSave.length === 1 && messagesToSave[0].sender !== 'bot')) { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messagesToSave)); } else if (messagesToSave.length === 0) { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messagesToSave)); } }, [messages]);
  useEffect(() => { const accepted = localStorage.getItem(BETA_ACCEPTED_KEY); if (accepted !== 'true') { setShowBetaNotice(true); } }, []);
  useEffect(() => { localStorage.setItem(MODEL_STORAGE_KEY, selectedModel); }, [selectedModel]);
  useEffect(() => { localStorage.setItem(STT_LANG_STORAGE_KEY, sttLang); }, [sttLang]);
  useEffect(() => { localStorage.setItem(ACCESS_KEY_STORAGE_KEY, enteredKey); }, [enteredKey]);
  useEffect(() => { localStorage.setItem(PERSONA_STORAGE_KEY, selectedPersona); }, [selectedPersona]);

  // --- Event Handlers ---
  const handleAcceptBeta = () => { localStorage.setItem(BETA_ACCEPTED_KEY, 'true'); setShowBetaNotice(false); };
  const handleModelChange = (e: ChangeEvent<HTMLSelectElement>) => { const m = e.target.value as GeminiModel; if (ALL_AVAILABLE_MODELS.some(i=>i.value===m)) setSelectedModel(m); };
  const handleSttLangChange = (e: ChangeEvent<HTMLSelectElement>) => { setSttLang(e.target.value as SpeechLanguage); };
  const handlePersonaChange = (e: ChangeEvent<HTMLSelectElement>) => { const p = e.target.value as Persona; if (AVAILABLE_PERSONAS.some(i=>i.value===p)) setSelectedPersona(p); };
  const toggleSettings = () => { setIsSettingsOpen(prev => !prev); };
  const handleClearChat = () => { if (window.confirm("Clear chat?")) { const ts=Date.now(); const msg:Message={id:ts, text:"Welcome! ...", sender:'bot', timestamp:ts}; setMessages([msg]); localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify([msg])); setIsSettingsOpen(false); } };
  const handleAccessKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
     setEnteredKey(event.target.value);
     setValidUsername(null); setLastKeyError(null); // Reset validation status immediately
  };
  const handleExportChat = () => {
    const msgs = messages.filter(m => m.sender !== 'loading'); if (msgs.length === 0 || (msgs.length === 1 && msgs[0].sender==='bot')) { alert("Empty chat."); return; }
    let content = `Chat Export\nAt: ${new Date().toLocaleString()}\nModel: ${selectedModel}\nPersona: ${selectedPersona}\n------------------------------------\n\n`;
    msgs.forEach(m => { const ts=new Date(m.timestamp).toLocaleString(); const sl = m.sender==='user' ? 'User' : 'Bot'; content += `[${ts}] ${sl}:\n${m.text}\n`; if (m.imageUrl) content += `(Image: ${m.imageUrl})\n`; content += `\n`; });
    try { const blob = new Blob([content], {type:'text/plain;charset=utf-8'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; const tf = new Date().toISOString().replace(/[:.]/g, '-'); a.download = `chat-${tf}.txt`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID!=="G-JX58QMMKZY" && GA_MEASUREMENT_ID!=="G-JX58QMMKZY") { ReactGA.event({ category: "Chat", action: "Export", label: `Count: ${msgs.length}` }); } } catch (e) { console.error("Export fail:", e); alert("Export failed."); }
  };
  const clearAnalysisForm = () => { setField1(''); setField2(''); setField3(''); setField4(''); setField5(''); };
  const toggleAnalysisForm = () => { setIsAnalysisFormVisible(prev => !prev); if (isAnalysisFormVisible) { clearAnalysisForm(); setIsAnalyzing(false); } };
  const handleAnalysisSubmit = async (event: React.FormEvent) => {
      event.preventDefault(); const v1=field1.trim(), v2=field2.trim(), v3=field3.trim(), v4=field4.trim(), v5=field5.trim(); if (!v1 || isAnalyzing) return; setIsAnalyzing(true); setIsAnalysisFormVisible(false);
      if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID!=="G-JX58QMMKZY" && GA_MEASUREMENT_ID!=="G-JX58QMMKZY") { try { ReactGA.event({ category:"Analysis", action:"Submit", label:`F1 Len: ${v1.length}` }); } catch (e) { console.error("GA fail:", e); } }
      let input = `Field 1: ${v1}\n`; if (v2) input+=`Field 2: ${v2}\n`; if (v3) input+=`Field 3: ${v3}\n`; if (v4) input+=`Field 4: ${v4}\n`; if (v5) input+=`Field 5: ${v5}\n`;
      const t0=Date.now(); const thinkMsg:Message={id:t0, text:`Analyzing (${v1.substring(0,40)}...)...`, sender:'loading', timestamp:t0}; setMessages(prev => [...prev, thinkMsg]); clearAnalysisForm();
      const result = await getBotResponseForAnalysis(input.trim(), selectedModel, selectedPersona, enteredKey);
      if (result.startsWith("Error: Access Key required") || result.startsWith("Error: Invalid or inactive")) { setLastKeyError("Invalid/missing key for analysis."); setValidUsername(null); } else if (result.startsWith("Error:")) { console.error("Analysis API fail:", result); setLastKeyError(null); } else { setLastKeyError(null); }
      const t1=Date.now()+1; const resultMsg:Message={id:t1, text:result, sender:'bot', timestamp:t1}; setMessages(prev => [ ...prev.filter(m => m.id !== t0), resultMsg ]); setIsAnalyzing(false);
  };

  // --- JSX ---
  return (
    <div className="App">
      {/* Settings Menu */}
      {isSettingsOpen && (
        <div className="settings-menu" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <h3 id="settings-title">Settings</h3>
          <div className="settings-grid">
            {/* Column 1 */}
            <div className="settings-column">
                <div className="settings-option">
                    <label htmlFor="access-key-input">Your Unique Access Key:</label>
                    <input type="password" id="access-key-input" className="settings-input" placeholder="Enter your assigned key" value={enteredKey} onChange={handleAccessKeyChange} />
                    <div className="settings-key-status"> {validUsername && ( <span className="key-valid">✅ Welcome, {validUsername}!</span> )} {lastKeyError && ( <span className="key-invalid">❌ {lastKeyError}</span> )} </div>
                </div>
                <div className="settings-option">
                    <label htmlFor="persona-select">Persona:</label>
                    <select id="persona-select" value={selectedPersona} onChange={handlePersonaChange} className="settings-select"> {AVAILABLE_PERSONAS.map((p) => { const dis=p.restricted && !hasEnteredKey; const sty=dis?{color:'#888',fontStyle:'italic'}:{}; return ( <option key={p.value} value={p.value} disabled={dis} style={sty}> {p.emoji} {p.label}{p.restricted?' (Restricted)':''} </option> ); })} </select>
                </div>
                <div className="settings-option">
                    <label htmlFor="model-select">AI Model:</label>
                    <select id="model-select" value={selectedModel} onChange={handleModelChange} className="settings-select"> {ALL_AVAILABLE_MODELS.map((m) => { const dis=m.restricted && !hasEnteredKey; const sty=dis?{color:'#888',fontStyle:'italic'}:{}; return ( <option key={m.value} value={m.value} disabled={dis} style={sty}> {m.label}{m.restricted?' (Restricted)':''} </option> ); })} </select>
                    {!hasEnteredKey && (RESTRICTED_PERSONAS_VALUES.length > 0 || RESTRICTED_MODELS_VALUES.length > 0) && ( <p className="settings-helper-text"> Enter your Access Key to enable restricted Personas and AI Models. </p> )}
                </div>
            </div>
            {/* Column 2 */}
            <div className="settings-column">
                <div className="settings-option">
                    <label htmlFor="stt-lang-select">Speak Language:</label>
                    <select id="stt-lang-select" value={sttLang} onChange={handleSttLangChange} className="settings-select"> <option value="en-US">English (US)</option> <option value="th-TH">ไทย (Thai)</option> <option value="es-ES">Español</option> <option value="fr-FR">Français</option> </select>
                </div>
                <div className="settings-option">
                    <label>Chat Actions:</label>
                    <button onClick={handleExportChat} className="settings-action-button export-chat-settings-button"> 💾 Export Chat History </button>
                </div>
                <div className="settings-option">
                    <button onClick={handleClearChat} className="settings-action-button clear-chat-settings-button"> 🗑️ Clear Chat History </button>
                </div>
            </div>
          </div> {/* End Grid */}
          <hr className="settings-separator" />
          <button onClick={toggleSettings} className="close-settings-button">Close</button>
        </div>
      )}

      {/* Analysis Form Modal */}
      {isAnalysisFormVisible && ( <div className="analysis-form-overlay"> <div className="analysis-form-modal"> <h3 id="analysis-title">Submit Details</h3> <form onSubmit={handleAnalysisSubmit}> <div className="settings-option" style={{marginBottom:'15px'}}> <label htmlFor="analysis-field1">Field 1 (Req):</label> <input type="text" id="analysis-field1" className="settings-input" value={field1} onChange={(e)=>setField1(e.target.value)} placeholder="Downside/Concern?" disabled={isAnalyzing} required /> </div> <div className="settings-option" style={{marginBottom:'15px'}}> <label htmlFor="analysis-field2">Field 2 (Req):</label> <input type="text" id="analysis-field2" className="settings-input" value={field2} onChange={(e)=>setField2(e.target.value)} placeholder="Enjoy spending time with?" disabled={isAnalyzing} required /> </div> <div className="settings-option" style={{marginBottom:'15px'}}> <label htmlFor="analysis-field3">Field 3 (Req):</label> <input type="text" id="analysis-field3" className="settings-input" value={field3} onChange={(e)=>setField3(e.target.value)} placeholder="Describe yourself?" disabled={isAnalyzing} required /> </div> <div className="settings-option" style={{marginBottom:'15px'}}> <label htmlFor="analysis-field4">Field 4 (Req):</label> <input type="text" id="analysis-field4" className="settings-input" value={field4} onChange={(e)=>setField4(e.target.value)} placeholder="Hate most when studying?" disabled={isAnalyzing} required /> </div> <div className="settings-option" style={{marginBottom:'15px'}}> <label htmlFor="analysis-field5">Field 5 (Req):</label> <input type="text" id="analysis-field5" className="settings-input" value={field5} onChange={(e)=>setField5(e.target.value)} placeholder="GPA?" disabled={isAnalyzing} required /> </div> <div className="analysis-form-actions"> <button type="button" onClick={toggleAnalysisForm} className="close-settings-button" disabled={isAnalyzing}>Cancel</button> <button type="submit" className="beta-accept-button" disabled={!field1.trim() || isAnalyzing}>{isAnalyzing ? 'Submitting...' : 'Submit Analysis'}</button> </div> </form> </div> </div> )}

      {/* Beta Notice Modal */}
      {showBetaNotice && ( <div className="beta-notice-overlay"> <div className="beta-notice-modal"> <h2>⚠️ Beta Version</h2> <p>Welcome! This chatbot is currently in beta. Features may change, errors might occur. Your feedback is valuable!</p> <button onClick={handleAcceptBeta} className="beta-accept-button">✔️ Accept & Continue</button> </div> </div> )}

      {/* Header */}
      <header className="App-header"> <div style={{ display: 'flex', alignItems: 'center' }}> <button onClick={toggleSettings} className="settings-button" title="Settings">⚙️</button> <button onClick={toggleAnalysisForm} className="settings-button analysis-button" title="Submit Details">📝</button> </div> <h1>Project Theraphy - Chatbot</h1> <div className="header-spacer-right"></div> </header>

      {/* Chatbot Page */}
      <ChatbotPage
        messages={messages}
        setMessages={setMessages}
        selectedModel={selectedModel}
        sttLang={sttLang}
        selectedPersona={selectedPersona}
        accessKey={enteredKey} // Pass the user's entered key
        // Pass state setters for validation feedback
        setValidUsername={setValidUsername}
        setLastKeyError={setLastKeyError}
       />
    </div>
  );
}

export default App;