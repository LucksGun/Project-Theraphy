// src/App.tsx - FINAL VERSION (Corrected)
import React, { useState, useEffect, ChangeEvent, useRef } from 'react';
import ReactGA from 'react-ga4';
import './App.css';
import ChatbotPage from './ChatbotPage'; // Ensure this path is correct

// --- GA ---
const GA_MEASUREMENT_ID = "G-JX58QMMKZY"; // Replace with your actual Measurement ID
// Corrected GA Initialization Check: Compare against the variable itself if it's a placeholder
if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" /* Replace placeholder */ && GA_MEASUREMENT_ID !== "YOUR_GA_ID_HERE" /* Add other potential placeholders */) {
   try {
       ReactGA.initialize(GA_MEASUREMENT_ID);
       console.log("GA Init:", GA_MEASUREMENT_ID);
       ReactGA.send({ hitType: "pageview", page: window.location.pathname + window.location.search, title: "Initial Load" });
   } catch (e) {
       console.error("GA Init Err:", e);
   }
} else {
   console.warn("GA ID missing/invalid/placeholder. GA not initialized.");
}

// --- Types & Interfaces ---
export interface Message {
   id: number;
   text: string;
   sender: 'user' | 'bot' | 'loading';
   timestamp: number;
   imageUrl?: string;
   modelUsed?: string; // Added optional field if needed from worker response
}
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-pro-exp-03-25' | 'gemini-2.0-flash-thinking-exp-01-21' | 'gemini-2.0-flash-exp-image-generation';
export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR';
export type Persona = 'normal' | 'therapist' | 'university_master';
interface KeyValidationStatus {
   isValid: boolean | null;
   username: string | null;
   loading: boolean;
   error?: string | null;
}
interface UserKeyInfo {
   key: string;
   username: string | null;
   status: 'active' | 'inactive';
   created_at: string;
}

// --- localStorage Keys ---
const CHAT_STORAGE_KEY = 'chatMessages';
const BETA_ACCEPTED_KEY = 'betaAccepted';
const MODEL_STORAGE_KEY = 'selectedApiModel';
const STT_LANG_STORAGE_KEY = 'selectedSttLang';
const ACCESS_KEY_STORAGE_KEY = 'userAccessKey';
const PERSONA_STORAGE_KEY = 'selectedPersona';

// --- Configurations ---
interface ModelInfo { value: GeminiModel; label: string; restricted: boolean; }
const ALL_AVAILABLE_MODELS_FRONTEND: ModelInfo[] = [
   { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', restricted: false },
   { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', restricted: false },
   { value: 'gemini-2.0-flash-thinking-exp-01-21', label: 'Gemini 2.0 Flash Thinking Exp', restricted: true },
   { value: 'gemini-2.0-flash-exp-image-generation', label: 'Gemini 2.0 Flash Image Gen Exp', restricted: true },
   { value: 'gemini-2.5-pro-exp-03-25', label: 'Gemini 2.5 Pro Exp', restricted: true }
];
const ALL_MODEL_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS_FRONTEND.map(m => m.value);

interface PersonaInfo { value: Persona; label: string; emoji: string; restricted: boolean; }
const AVAILABLE_PERSONAS: PersonaInfo[] = [
   { value: 'university_master', label: 'University Master', emoji: '🎓', restricted: false },
   { value: 'normal', label: 'Normal Bot', emoji: '🤖', restricted: true },
   { value: 'therapist', label: 'Therapist', emoji: '🧠', restricted: true }
];
const ALL_PERSONAS: Persona[] = AVAILABLE_PERSONAS.map(p => p.value);
const DEFAULT_UNRESTRICTED_PERSONA: Persona = 'university_master';

// Identify restricted values for easier checking
const RESTRICTED_MODELS_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS_FRONTEND.filter(m => m.restricted).map(m => m.value);
const RESTRICTED_PERSONAS_VALUES: Persona[] = AVAILABLE_PERSONAS.filter(p => p.restricted).map(p => p.value);

// --- API ---
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/'; // Replace if needed

interface ApiRequestBody {
   prompt?: string;
   model?: GeminiModel;
   persona?: Persona;
   imageMimeType?: string;
   imageDataUrl?: string;
   accessKey?: string;
   action: string; // 'chat', 'validateKey', 'staffLogin', etc.
   staffKey?: string;
   key?: string; // For admin actions targeting a specific user key
   newStatus?: 'active' | 'inactive'; // For admin actions
   models?: GeminiModel[]; // For admin actions
}

async function getBotResponseForAnalysis(
   userInput: string,
   model: GeminiModel,
   persona: Persona,
   accessKey: string
): Promise<string> {
   const promptToSend = userInput;
   if (!promptToSend) return "Error: No text provided for analysis.";

   const requestBody: ApiRequestBody = {
       action: 'chat', // Use the 'chat' action, the worker handles "Field 1:" prompts
       prompt: promptToSend,
       model: model,
       persona: persona, // Send current persona
       accessKey: accessKey
   };
   console.log(`Sending Analysis Request (Model: ${model}, Persona: ${persona})`);

   try {
       const res = await fetch(WORKER_URL, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(requestBody)
       });

       // Improved error handling for fetch response
       if (!res.ok) {
           const errData = await res.json().catch(() => ({ error: `HTTP Error ${res.status}: ${res.statusText}` }));
           throw new Error(errData?.error || `HTTP Error ${res.status}`);
       }

       const data = await res.json();
       if (data.error) throw new Error(data.error);
       return data.reply || 'No reply received from analysis.';
   } catch (e) {
       console.error('Analysis API Error:', e);
       // Provide more specific error feedback
       if (e instanceof Error) {
           if (e.message.includes("Access Key required") || e.message.includes("Invalid or inactive")) {
               return "Error: Access Key required or invalid/inactive for this operation.";
           }
           return `Error: ${e.message}`;
       }
       return 'Error: Could not fetch analysis response.';
   }
}

const VALIDATION_DEBOUNCE_MS = 600;

function App() {
   // --- State ---
   const [messages, setMessages] = useState<Message[]>(() => {
       const storedMessages = localStorage.getItem(CHAT_STORAGE_KEY);
       let initialMessages: Message[] = [];
       try {
           initialMessages = storedMessages && storedMessages !== '[]' ? JSON.parse(storedMessages) : [];
           if (!Array.isArray(initialMessages)) throw new Error("Stored messages not an array");
           // Filter out any potential loading messages from previous sessions
           initialMessages = initialMessages.filter(m => m.sender !== 'loading');
       } catch (e) {
           console.error("Error parsing stored chat messages:", e);
           localStorage.removeItem(CHAT_STORAGE_KEY);
           initialMessages = [];
       }
       // Add welcome message only if the chat is truly empty
       if (initialMessages.length === 0) {
           const timestamp = Date.now();
           return [{ id: timestamp, text: "Welcome! How can I assist you today?", sender: 'bot', timestamp: timestamp }];
       } else {
           return initialMessages;
       }
   });
   const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);
   const [enteredKey, setEnteredKey] = useState<string>(() => localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '');
   const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.0-flash'); // Default non-restricted
   const [sttLang, setSttLang] = useState<SpeechLanguage>(() => {
       const storedLang = localStorage.getItem(STT_LANG_STORAGE_KEY) as SpeechLanguage | null;
       if (storedLang && ['en-US', 'th-TH', 'es-ES', 'fr-FR'].includes(storedLang)) return storedLang;
       return 'en-US'; // Default language
   });
   const [selectedPersona, setSelectedPersona] = useState<Persona>(DEFAULT_UNRESTRICTED_PERSONA);
   const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
   const [isAnalysisFormVisible, setIsAnalysisFormVisible] = useState<boolean>(false);
   const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
   // Analysis form fields
   const [field1, setField1] = useState('');
   const [field2, setField2] = useState('');
   const [field3, setField3] = useState('');
   const [field4, setField4] = useState('');
   const [field5, setField5] = useState('');
   // Key Status
   const [keyStatus, setKeyStatus] = useState<KeyValidationStatus>({ isValid: null, username: null, loading: false, error: null });
   const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
   // Staff Panel State
   const [isStaffPanelVisible, setIsStaffPanelVisible] = useState<boolean>(false);
   const [enteredStaffKey, setEnteredStaffKey] = useState<string>('');
   const [isStaffAuthenticated, setIsStaffAuthenticated] = useState<boolean>(false);
   const [adminUserKeysList, setAdminUserKeysList] = useState<UserKeyInfo[]>([]);
   const [adminRestrictedModelsList, setAdminRestrictedModelsList] = useState<GeminiModel[]>([]); // Only models stored here now
   const [isAdminLoading, setIsAdminLoading] = useState<boolean>(false);
   const [adminError, setAdminError] = useState<string | null>(null);

   // --- Effects ---

   // Debounced User Key Validation Effect
   useEffect(() => {
       const keyTrimmed = enteredKey.trim();
       if (debounceTimeoutRef.current) {
           clearTimeout(debounceTimeoutRef.current);
       }

       // Store current model/persona *before* validation starts
       const currentModel = selectedModel;
       const currentPersona = selectedPersona;

       if (!keyTrimmed) {
           setKeyStatus({ isValid: null, username: null, loading: false, error: null });
           // Reset to defaults if the key is removed and current selection is restricted
           if (RESTRICTED_MODELS_VALUES.includes(currentModel)) {
               setSelectedModel('gemini-2.0-flash');
           }
           if (RESTRICTED_PERSONAS_VALUES.includes(currentPersona)) {
               setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
           }
           return;
       }

       setKeyStatus(prev => ({ ...prev, loading: true, isValid: null, error: null, username: null }));

       debounceTimeoutRef.current = setTimeout(async () => {
           console.log("Validating key:", keyTrimmed.substring(0, 4) + "..."); // Avoid logging full key
           try {
               const res = await fetch(WORKER_URL, {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ action: 'validateKey', accessKey: keyTrimmed })
               });
               const data = await res.json().catch(() => ({ error: `Invalid JSON response from server.` }));

               if (!res.ok) throw new Error(data?.error || `Validation failed: HTTP ${res.status}`);

               if (data.isValid) {
                   setKeyStatus({ isValid: true, username: data.username || 'User', loading: false, error: null });
                   // On successful validation, restore saved prefs IF THEY EXIST AND ARE VALID
                   // No need to reset here, user has access.
                   const savedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null;
                   if (savedModel && ALL_MODEL_VALUES.includes(savedModel)) {
                      setSelectedModel(savedModel); // Restore saved model if valid
                   } else if (RESTRICTED_MODELS_VALUES.includes(currentModel)) {
                      // If no saved model, but current is restricted, keep it (since key is valid)
                      setSelectedModel(currentModel);
                   } else {
                      // Otherwise, ensure a default non-restricted model or the current one if it's already non-restricted
                      setSelectedModel(currentModel); // Or 'gemini-2.0-flash' if you prefer a hard reset
                   }

                   const savedPersona = localStorage.getItem(PERSONA_STORAGE_KEY) as Persona | null;
                   if (savedPersona && ALL_PERSONAS.includes(savedPersona)) {
                      setSelectedPersona(savedPersona); // Restore saved persona if valid
                   } else if (RESTRICTED_PERSONAS_VALUES.includes(currentPersona)) {
                       // If no saved persona, but current is restricted, keep it
                       setSelectedPersona(currentPersona);
                   } else {
                        // Otherwise, ensure a default non-restricted persona or the current one
                       setSelectedPersona(currentPersona); // Or DEFAULT_UNRESTRICTED_PERSONA
                   }

               } else {
                   // Key is explicitly invalid or inactive according to the server
                   setKeyStatus({ isValid: false, username: null, loading: false, error: data?.error || 'Invalid or inactive key.' });
                   // Reset to defaults if validation fails
                   if (RESTRICTED_MODELS_VALUES.includes(currentModel)) {
                       setSelectedModel('gemini-2.0-flash');
                   }
                   if (RESTRICTED_PERSONAS_VALUES.includes(currentPersona)) {
                       setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
                   }
               }
           } catch (error) {
               console.error("Key validation request failed:", error);
               const msg = error instanceof Error ? error.message : "Validation request failed due to network or server error.";
               setKeyStatus({ isValid: false, username: null, loading: false, error: msg });
               // Reset to defaults on error
               if (RESTRICTED_MODELS_VALUES.includes(currentModel)) {
                   setSelectedModel('gemini-2.0-flash');
               }
               if (RESTRICTED_PERSONAS_VALUES.includes(currentPersona)) {
                   setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
               }
           }
       }, VALIDATION_DEBOUNCE_MS);

       // Cleanup function
       return () => {
           if (debounceTimeoutRef.current) {
               clearTimeout(debounceTimeoutRef.current);
           }
       };
   }, [enteredKey]); // Re-run only when enteredKey changes

   // Initial Load Effect
   useEffect(() => {
       const initialKey = localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '';
       const savedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null;
       const savedPersona = localStorage.getItem(PERSONA_STORAGE_KEY) as Persona | null;

       // Set initial model/persona based on storage, BEFORE key validation
       let initialModel: GeminiModel = 'gemini-2.0-flash'; // Default non-restricted
       if (savedModel && ALL_MODEL_VALUES.includes(savedModel)) {
           initialModel = savedModel;
       }
       setSelectedModel(initialModel);

       let initialPersona: Persona = DEFAULT_UNRESTRICTED_PERSONA;
       if (savedPersona && ALL_PERSONAS.includes(savedPersona)) {
           initialPersona = savedPersona;
       }
       setSelectedPersona(initialPersona);

       const accepted = localStorage.getItem(BETA_ACCEPTED_KEY);
       if (accepted !== 'true') {
           setShowBetaNotice(true);
       }

       // Validate the key from storage on load if it exists
       if (initialKey.trim()) {
            const validateInitialKey = async (key: string, currentModel: GeminiModel, currentPersona: Persona) => {
                setKeyStatus(prev => ({ ...prev, loading: true }));
                try {
                    const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'validateKey', accessKey: key }) });
                    const data = await res.json().catch(()=>({error:'Invalid JSON response'}));
                    if (res.ok && data.isValid) {
                        setKeyStatus({ isValid: true, username: data.username || 'User', loading: false, error: null });
                        // If key is valid, keep the potentially restricted model/persona loaded from storage
                        setSelectedModel(currentModel);
                        setSelectedPersona(currentPersona);
                    } else {
                        // Key invalid on load
                        setKeyStatus({ isValid: false, username: null, loading: false, error: data?.error || 'Invalid key found on load' });
                        // Reset to defaults if the loaded model/persona was restricted
                        if(RESTRICTED_MODELS_VALUES.includes(currentModel)){ setSelectedModel('gemini-2.0-flash'); }
                        if(RESTRICTED_PERSONAS_VALUES.includes(currentPersona)){ setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA); }
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : 'Validation failed on load';
                    setKeyStatus({ isValid: false, username: null, loading: false, error: msg });
                    // Reset to defaults on error
                    if(RESTRICTED_MODELS_VALUES.includes(currentModel)){ setSelectedModel('gemini-2.0-flash'); }
                    if(RESTRICTED_PERSONAS_VALUES.includes(currentPersona)){ setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA); }
                }
            };
           validateInitialKey(initialKey, initialModel, initialPersona);
       } else {
           // No key in storage, ensure defaults are set if loaded prefs were restricted
            if(RESTRICTED_MODELS_VALUES.includes(initialModel)){ setSelectedModel('gemini-2.0-flash'); }
            if(RESTRICTED_PERSONAS_VALUES.includes(initialPersona)){ setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA); }
       }
   }, []); // Run only once on mount

   // Persistence Effects
   useEffect(() => {
       // Save messages, excluding the initial welcome bot message if it's the only one
       const messagesToSave = messages.filter(msg => msg.sender !== 'loading');
       if (messagesToSave.length > 1 || (messagesToSave.length === 1 && messagesToSave[0].sender !== 'bot')) {
            // Save if more than 1 message OR if only 1 message and it's from the user
           localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messagesToSave));
       } else if (messagesToSave.length === 0) {
            // Save empty array if chat was cleared
           localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify([]));
       }
       // Don't save if only the initial welcome message remains
   }, [messages]);

   useEffect(() => { localStorage.setItem(MODEL_STORAGE_KEY, selectedModel); }, [selectedModel]);
   useEffect(() => { localStorage.setItem(STT_LANG_STORAGE_KEY, sttLang); }, [sttLang]);
   useEffect(() => { localStorage.setItem(ACCESS_KEY_STORAGE_KEY, enteredKey); }, [enteredKey]);
   useEffect(() => { localStorage.setItem(PERSONA_STORAGE_KEY, selectedPersona); }, [selectedPersona]);

   // --- Event Handlers ---
   const handleAcceptBeta = () => { localStorage.setItem(BETA_ACCEPTED_KEY, 'true'); setShowBetaNotice(false); };
   const handleModelChange = (e: ChangeEvent<HTMLSelectElement>) => { const m = e.target.value as GeminiModel; if (ALL_MODEL_VALUES.includes(m)) setSelectedModel(m); };
   const handleSttLangChange = (e: ChangeEvent<HTMLSelectElement>) => { setSttLang(e.target.value as SpeechLanguage); };
   const handlePersonaChange = (e: ChangeEvent<HTMLSelectElement>) => { const p = e.target.value as Persona; if (ALL_PERSONAS.includes(p)) setSelectedPersona(p); };
   const toggleSettings = () => {
       setIsSettingsOpen(prev => !prev);
       // Close staff panel if settings are closed
       if (isSettingsOpen && isStaffPanelVisible) { // Check if settings *was* open
            setIsStaffPanelVisible(false);
            setIsStaffAuthenticated(false);
            setEnteredStaffKey('');
            setAdminError(null);
       }
   };
   const handleClearChat = () => {
       if (window.confirm("Are you sure you want to clear the entire chat history? This cannot be undone.")) {
           const timestamp = Date.now();
           const welcomeMsg: Message = { id: timestamp, text: "Chat cleared. Welcome back!", sender: 'bot', timestamp: timestamp };
           setMessages([welcomeMsg]);
           localStorage.removeItem(CHAT_STORAGE_KEY); // Clear storage explicitly
            // Optionally clear analysis form fields if open?
            // clearAnalysisForm();
           setIsSettingsOpen(false); // Close settings after clearing
       }
   };
   const handleAccessKeyChange = (event: ChangeEvent<HTMLInputElement>) => { setEnteredKey(event.target.value); };
   const handleExportChat = () => {
       const messagesToExport = messages.filter(m => m.sender !== 'loading');
       if (messagesToExport.length === 0 || (messagesToExport.length === 1 && messagesToExport[0].sender === 'bot')) {
           alert("Chat is empty or contains only the initial welcome message. Nothing to export.");
           return;
       }
       let content = `Chat Export - Project Theraphy\nExported At: ${new Date().toLocaleString()}\n`;
       content += `Selected Model: ${selectedModel}\nSelected Persona: ${selectedPersona}\n`;
       content += `User: ${keyStatus.isValid ? keyStatus.username : 'N/A (Invalid/No Key)'}\n`;
       content += `------------------------------------\n\n`;

       messagesToExport.forEach(m => {
           const timestampStr = new Date(m.timestamp).toLocaleString();
           const senderLabel = m.sender === 'user' ? 'User' : 'Bot';
           content += `[${timestampStr}] ${senderLabel}:\n`;
           content += `${m.text}\n`;
           if (m.imageUrl) content += `(Image Attached: ${m.imageUrl})\n`;
           // if (m.modelUsed) content += `(Model: ${m.modelUsed})\n`; // Optionally include model used per message if tracked
           content += `\n`;
       });

       try {
           const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
           const url = URL.createObjectURL(blob);
           const a = document.createElement('a');
           a.href = url;
           const timestampFilename = new Date().toISOString().replace(/[:.]/g, '-');
           a.download = `project-theraphy-chat-${timestampFilename}.txt`;
           document.body.appendChild(a);
           a.click();
           document.body.removeChild(a);
           URL.revokeObjectURL(url);
            // Corrected GA Event Check
           if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" && GA_MEASUREMENT_ID !== "YOUR_GA_ID_HERE") {
               ReactGA.event({ category: "Chat", action: "Export", label: `Message Count: ${messagesToExport.length}` });
           }
           setIsSettingsOpen(false); // Close settings after export
       } catch (e) {
           console.error("Chat export failed:", e);
           alert("Failed to export chat. See console for details.");
       }
   };

   // --- Analysis Form Handlers ---
   const clearAnalysisForm = () => { setField1(''); setField2(''); setField3(''); setField4(''); setField5(''); };
   const toggleAnalysisForm = () => {
       setIsAnalysisFormVisible(prev => !prev);
       // If form is being closed, clear fields and reset loading state
       if (isAnalysisFormVisible) { // Check if it *was* visible
           clearAnalysisForm();
           setIsAnalyzing(false);
       }
   };
   const handleAnalysisSubmit = async (event: React.FormEvent) => {
       event.preventDefault();
       const v1 = field1.trim();
       const v2 = field2.trim();
       const v3 = field3.trim();
       const v4 = field4.trim();
       const v5 = field5.trim();

       // Corrected: Check all required fields
       if (!v1 || !v2 || !v3 || !v4 || !v5 || isAnalyzing) {
           alert("Please fill in all required fields before submitting.");
           return;
       }

       setIsAnalyzing(true);
       // Hide form immediately upon starting analysis? Or keep it open but disabled? Hiding is simpler.
       // setIsAnalysisFormVisible(false); // Hide form while processing

        // Corrected GA Event Check
       if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" && GA_MEASUREMENT_ID !== "YOUR_GA_ID_HERE") {
           try {
               ReactGA.event({ category: "Analysis", action: "Submit", label: `Field1 Length: ${v1.length}` });
           } catch (e) {
               console.error("GA event failed for analysis submit:", e);
           }
       }

       let analysisInput = `Field 1: ${v1}\n`; // Downside/Concern?
       analysisInput += `Field 2: ${v2}\n`; // Enjoy spending time with?
       analysisInput += `Field 3: ${v3}\n`; // Describe yourself?
       analysisInput += `Field 4: ${v4}\n`; // Hate most when studying?
       analysisInput += `Field 5: ${v5}\n`; // GPA?

       const timestampStart = Date.now();
       const loadingMsg: Message = { id: timestampStart, text: `Analyzing your details...`, sender: 'loading', timestamp: timestampStart };
       setMessages(prev => [...prev, loadingMsg]);

       // Clear form fields after submitting the data
       // clearAnalysisForm(); // Moved clearing inside toggle or upon success/failure

       const analysisResult = await getBotResponseForAnalysis(analysisInput.trim(), selectedModel, selectedPersona, enteredKey);

       // Remove loading message
       setMessages(prev => prev.filter(m => m.id !== timestampStart));

       // Handle potential errors from the analysis call
       if (analysisResult.startsWith("Error: Access Key required")) {
            setKeyStatus({ isValid: false, username: null, loading: false, error: "Access Key required for analysis." });
            // Add error message to chat
            const errTime = Date.now() + 1;
            const errorMsg: Message = { id: errTime, text: analysisResult, sender: 'bot', timestamp: errTime };
            setMessages(prev => [...prev, errorMsg]);
       } else if (analysisResult.startsWith("Error:")) {
            // Show specific error from backend in chat
            setKeyStatus(prev => ({...prev, error: analysisResult })); // Update key status with error, might not invalidate key itself
            const errTime = Date.now() + 1;
            const errorMsg: Message = { id: errTime, text: analysisResult, sender: 'bot', timestamp: errTime };
            setMessages(prev => [...prev, errorMsg]);
       } else {
           // Success: Add bot's analysis response to chat
           setKeyStatus(prev => ({...prev, error: null })); // Clear previous errors if successful
           const timestampEnd = Date.now() + 1;
           const resultMsg: Message = { id: timestampEnd, text: analysisResult, sender: 'bot', timestamp: timestampEnd };
           setMessages(prev => [...prev, resultMsg]);
           clearAnalysisForm(); // Clear form on success
           setIsAnalysisFormVisible(false); // Close form on success
       }

       setIsAnalyzing(false); // Reset loading state regardless of outcome
   };


   // --- Staff Panel Handlers ---
   const toggleStaffPanel = () => {
       setIsStaffPanelVisible(prev => !prev);
       // Reset state when opening or closing the panel
       if (isStaffPanelVisible) { // If closing
            setIsStaffAuthenticated(false);
            setEnteredStaffKey('');
            setAdminError(null);
            setAdminUserKeysList([]);
            setAdminRestrictedModelsList([]);
       }
       // No need to reset if opening, login flow handles that
   };
   const handleStaffKeyChange = (e: ChangeEvent<HTMLInputElement>) => { setEnteredStaffKey(e.target.value); };
   const handleStaffLogin = async () => {
       if (!enteredStaffKey.trim()) { setAdminError("Staff Key cannot be empty."); return; }
       setIsAdminLoading(true);
       setAdminError(null);
       try {
           const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'staffLogin', staffKey: enteredStaffKey }) });
           const data = await res.json().catch(() => ({ error: 'Invalid JSON response from staff login' }));
           if (!res.ok || !data.isValid) { throw new Error(data?.error || `Staff Login Failed: ${res.status}`); }
           setIsStaffAuthenticated(true); // Set authenticated state
           setAdminError(null);
           // fetchAdminData(); // Data fetching is now handled by useEffect dependent on isStaffAuthenticated
       } catch (e) {
           console.error("Staff login failed:", e);
           setIsStaffAuthenticated(false); // Ensure not authenticated on error
           setAdminError(e instanceof Error ? e.message : "Staff login failed.");
       } finally {
           setIsAdminLoading(false);
       }
   };

   // Fetch admin data (keys, restrictions) when authenticated
   const fetchAdminData = async () => {
       if (!isStaffAuthenticated) return; // Should not happen if called correctly, but safeguard
       setIsAdminLoading(true);
       setAdminError(null);
       setAdminUserKeysList([]); // Clear previous data before fetching
       setAdminRestrictedModelsList([]);
       try {
           // Fetch keys and restrictions simultaneously
           const [keysRes, restrictRes] = await Promise.all([
               fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminListKeys' }) }),
               fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminGetRestrictions' }) })
           ]);

           // Process Keys Response
           const keysData = await keysRes.json().catch(() => ({ error: 'Invalid JSON for keys list' }));
           if (!keysRes.ok || !keysData.success) throw new Error(keysData?.error || 'Failed to fetch user keys.');
           setAdminUserKeysList(keysData.keys || []);

           // Process Restrictions Response
           const restrictData = await restrictRes.json().catch(() => ({ error: 'Invalid JSON for restrictions' }));
           if (!restrictRes.ok || !restrictData.success) throw new Error(restrictData?.error || 'Failed to fetch restrictions.');
           // We only care about models in this panel now
           setAdminRestrictedModelsList(restrictData.restrictedModels || []);

       } catch (e) {
           console.error("Fetch admin data error:", e);
           setAdminError(e instanceof Error ? e.message : "Failed to load admin data.");
       } finally {
           setIsAdminLoading(false);
       }
   };

   // Effect to fetch data when panel opens and user is authenticated
   useEffect(() => {
       if (isStaffPanelVisible && isStaffAuthenticated) {
           fetchAdminData();
       }
   }, [isStaffPanelVisible, isStaffAuthenticated]); // Re-fetch if panel visibility or auth status changes


   const handleToggleUserKeyStatus = async (key: string, currentStatus: 'active' | 'inactive') => {
       const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
       const keySnippet = key.substring(0, 8); // For display in confirmation
       if (!window.confirm(`Are you sure you want to set the status of key "${keySnippet}..." to ${newStatus}?`)) return;

       setIsAdminLoading(true);
       setAdminError(null);
       try {
           const res = await fetch(WORKER_URL, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ action: 'adminUpdateKeyStatus', key: key, newStatus: newStatus })
           });
           const data = await res.json().catch(() => ({ error: 'Invalid JSON response from key status update' }));
           if (!res.ok || !data.success) {
               throw new Error(data?.error || `Failed to update key status: ${res.status}`);
           }
           // Refresh data on success
           fetchAdminData();
       } catch (e) {
           console.error("User key status update failed:", e);
           setAdminError(e instanceof Error ? e.message : "Failed to update key status.");
           setIsAdminLoading(false); // Ensure loading is stopped on error
       }
       // No finally block for loading state, fetchAdminData handles it
   };

   const handleToggleModelRestriction = async (modelValue: GeminiModel) => {
       const isCurrentlyRestricted = adminRestrictedModelsList.includes(modelValue);
       const actionText = isCurrentlyRestricted ? "make public (remove restriction)" : "make restricted";
       if (!window.confirm(`Are you sure you want to ${actionText} the model "${modelValue}"?`)) return;

       // Prepare the *new* list based on the intended action
       const newList = isCurrentlyRestricted
           ? adminRestrictedModelsList.filter(m => m !== modelValue)
           : [...adminRestrictedModelsList, modelValue];

       setIsAdminLoading(true);
       setAdminError(null);
       try {
           const res = await fetch(WORKER_URL, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               // Send the *entire* new list of restricted models
               body: JSON.stringify({ action: 'adminSetRestrictedModels', models: newList })
           });
           const data = await res.json().catch(() => ({ error: 'Invalid JSON response from restriction update' }));
           if (!res.ok || !data.success) {
               throw new Error(data?.error || `Failed to save model restrictions: ${res.status}`);
           }
           // Refresh the data from the server on success to ensure consistency
           fetchAdminData();
       } catch (error) {
           console.error("Save model restrictions failed:", error);
           setAdminError(error instanceof Error ? error.message : "Failed to save restrictions.");
            // Fetch data even on error to revert optimistic UI changes (if any were made)
            // or just ensure the UI reflects the actual server state.
            // fetchAdminData(); // fetchAdminData() is called by the success path, only set loading false here
            setIsAdminLoading(false);
       }
        // No finally block for loading state, fetchAdminData handles it on success
   };


   // --- JSX ---
   return (
       <div className="App">
           {/* Settings Menu */}
           {isSettingsOpen && (
               <div className="settings-menu">
                   <h3 id="settings-title">Settings</h3>
                   <div className="settings-grid">
                       {/* Column 1 */}
                       <div className="settings-column">
                           <div className="settings-option">
                               <label htmlFor="access-key-input">Access Key:</label>
                               <input
                                   type="password" // Keep as password for basic obfuscation
                                   id="access-key-input"
                                   className="settings-input"
                                   placeholder="Enter your access key"
                                   value={enteredKey}
                                   onChange={handleAccessKeyChange}
                                   autoComplete="off"
                               />
                               <div className="settings-key-status">
                                   {keyStatus.loading && (<span className="key-loading">Validating...</span>)}
                                   {!keyStatus.loading && keyStatus.isValid === true && keyStatus.username && (<span className="key-valid">✅ Valid Key. Welcome, {keyStatus.username}!</span>)}
                                   {!keyStatus.loading && keyStatus.isValid === false && (<span className="key-invalid">❌ {keyStatus.error || "Invalid or inactive key."}</span>)}
                                   {!keyStatus.loading && keyStatus.isValid === null && !enteredKey.trim() && (<span className="key-neutral">Enter key for restricted features.</span>) }
                                   {!keyStatus.loading && keyStatus.isValid === null && enteredKey.trim() && (<span className="key-neutral">Key entered, validation pending...</span>)}
                               </div>
                           </div>

                           <div className="settings-option">
                               <label htmlFor="persona-select">Persona:</label>
                               <select id="persona-select" value={selectedPersona} onChange={handlePersonaChange} className="settings-select" disabled={AVAILABLE_PERSONAS.find(p=>p.value===selectedPersona)?.restricted && keyStatus.isValid !== true}>
                                   {AVAILABLE_PERSONAS.map((p) => {
                                       const isDisabled = p.restricted && keyStatus.isValid !== true;
                                       const style = isDisabled ? { color: '#888', fontStyle: 'italic' } : {};
                                       return (<option key={p.value} value={p.value} disabled={isDisabled} style={style}>{p.emoji} {p.label}{p.restricted ? ' (Requires Key)' : ''}</option>);
                                   })}
                               </select>
                           </div>

                           <div className="settings-option">
                                <label htmlFor="model-select">AI Model:</label>
                                <select id="model-select" value={selectedModel} onChange={handleModelChange} className="settings-select" disabled={ALL_AVAILABLE_MODELS_FRONTEND.find(m=>m.value===selectedModel)?.restricted && keyStatus.isValid !== true}>
                                    {ALL_AVAILABLE_MODELS_FRONTEND.map((m) => {
                                        const isDisabled = m.restricted && keyStatus.isValid !== true;
                                        const style = isDisabled ? { color: '#888', fontStyle: 'italic' } : {};
                                        return (<option key={m.value} value={m.value} disabled={isDisabled} style={style}>{m.label}{m.restricted ? ' (Requires Key)' : ''}</option>);
                                    })}
                                </select>
                                {/* Helper text shown if restricted options exist and key is not valid */}
                                {keyStatus.isValid !== true && (RESTRICTED_PERSONAS_VALUES.length > 0 || RESTRICTED_MODELS_VALUES.length > 0) && (
                                   <p className="settings-helper-text">Enter a valid Access Key to use restricted Personas or Models.</p>
                                )}
                           </div>
                       </div>

                       {/* Column 2 */}
                       <div className="settings-column">
                            <div className="settings-option">
                                <label htmlFor="stt-lang-select">Speech Lang:</label>
                                <select id="stt-lang-select" value={sttLang} onChange={handleSttLangChange} className="settings-select">
                                    <option value="en-US">English (US)</option>
                                    <option value="th-TH">ไทย (Thai)</option>
                                    <option value="es-ES">Español (Spain)</option>
                                    <option value="fr-FR">Français (France)</option>
                                </select>
                            </div>
                            <div className="settings-option">
                               <label>Chat Actions:</label>
                               <div> {/* Wrap buttons for better layout if needed */}
                                   <button onClick={handleExportChat} className="settings-action-button export-chat-settings-button" title="Download chat history as a text file">💾 Export Chat</button>
                                   <button onClick={handleClearChat} className="settings-action-button clear-chat-settings-button" title="Delete all messages">🗑️ Clear Chat</button>
                               </div>
                           </div>
                           <div className="settings-option">
                               <label>Admin Area:</label>
                               <button onClick={toggleStaffPanel} className="settings-action-button staff-area-button" title="Access staff administrative panel">🔑 Staff Panel</button>
                           </div>
                       </div>
                   </div>
                   <hr className="settings-separator" />
                   <button onClick={toggleSettings} className="close-settings-button">Close Settings</button>
               </div>
           )}

           {/* Staff Panel Modal */}
           {isStaffPanelVisible && (
               <div className="staff-panel-overlay">
                   <div className="staff-panel-modal">
                       <h3 id="staff-panel-title">Staff Panel</h3>
                       <button onClick={toggleStaffPanel} className="close-staff-panel-button" title="Close Staff Panel">×</button>
                       {!isStaffAuthenticated ? (
                           <div className="staff-login-section">
                               <div className="settings-option"> {/* Reuse settings-option style */}
                                   <label htmlFor="staff-key-input">Staff Key:</label>
                                   <input
                                       type="password"
                                       id="staff-key-input"
                                       className="settings-input" // Reuse settings-input style
                                       value={enteredStaffKey}
                                       onChange={handleStaffKeyChange}
                                       placeholder="Enter staff access key"
                                       disabled={isAdminLoading}
                                   />
                               </div>
                               <button onClick={handleStaffLogin} className="staff-login-button" disabled={isAdminLoading || !enteredStaffKey.trim()}>
                                   {isAdminLoading ? 'Verifying...' : 'Login'}
                               </button>
                               {adminError && <p className="staff-error">{adminError}</p>}
                               <p className="staff-security-warning">Warning: Access to this panel modifies application settings. Ensure you are authorized.</p>
                           </div>
                       ) : (
                           <div className="staff-admin-section">
                               <h4>Manage User Access Keys</h4>
                               <div className="admin-data-section">
                                   {isAdminLoading && <p>Loading user keys...</p>}
                                   {adminError && !isAdminLoading && <p className="staff-error">{adminError}</p>} {/* Show error if loading finished with error */}
                                   {!isAdminLoading && !adminError && adminUserKeysList.length === 0 && <p>No user keys found.</p>}
                                   {!isAdminLoading && !adminError && adminUserKeysList.length > 0 && (
                                       <div className="user-keys-list">
                                           <table>
                                               <thead>
                                                   <tr><th>Key Prefix</th><th>Username</th><th>Status</th><th>Created</th><th>Action</th></tr>
                                               </thead>
                                               <tbody>
                                                   {adminUserKeysList.map(k => (
                                                       <tr key={k.key}>
                                                           <td><code>{k.key.substring(0, 8)}...</code></td>
                                                           <td>{k.username || '-'}</td>
                                                           <td><span className={`status-${k.status}`}>{k.status}</span></td>
                                                           <td>{new Date(k.created_at).toLocaleDateString()}</td>
                                                           <td>
                                                               <button
                                                                   onClick={() => handleToggleUserKeyStatus(k.key, k.status)}
                                                                   className={`key-status-toggle-button ${k.status === 'active' ? 'deactivate' : 'activate'}`}
                                                                   disabled={isAdminLoading}
                                                                   title={k.status === 'active' ? `Deactivate key ${k.key.substring(0, 4)}...` : `Activate key ${k.key.substring(0, 4)}...`}
                                                               >
                                                                   {k.status === 'active' ? 'Deactivate' : 'Activate'}
                                                               </button>
                                                           </td>
                                                       </tr>
                                                   ))}
                                               </tbody>
                                           </table>
                                       </div>
                                   )}
                               </div>
                               <hr className="staff-separator" />
                               <h4>Manage Restricted Models</h4>
                                <div className="admin-data-section">
                                    {isAdminLoading && <p>Loading model restrictions...</p>}
                                    {adminError && !isAdminLoading && <p className="staff-error">{adminError}</p>}
                                    {/* Use ALL_AVAILABLE_MODELS_FRONTEND which defines all possible models */}
                                    {!isAdminLoading && !adminError && ALL_AVAILABLE_MODELS_FRONTEND.length === 0 && <p>No models defined in the frontend configuration.</p>}
                                    {!isAdminLoading && !adminError && ALL_AVAILABLE_MODELS_FRONTEND.length > 0 && (
                                        <div className="restricted-models-list">
                                            <p style={{fontSize: '0.9em', color: '#666', marginBottom: '10px'}}>Toggle which AI models require a valid user access key.</p>
                                            {ALL_AVAILABLE_MODELS_FRONTEND.map(modelInfo => {
                                                // Check if this model's value is in the list fetched from the server
                                                const isRestricted = adminRestrictedModelsList.includes(modelInfo.value);
                                                return (
                                                    <div key={modelInfo.value} className="restriction-item">
                                                        <span>{modelInfo.label} (<code>{modelInfo.value}</code>)</span>
                                                        <button
                                                            onClick={() => handleToggleModelRestriction(modelInfo.value)}
                                                            className={`restriction-toggle-button ${isRestricted ? 'deactivate' : 'activate'}`} // Use activate/deactivate for clarity
                                                            disabled={isAdminLoading}
                                                            title={isRestricted ? `Make '${modelInfo.label}' public (available to all)` : `Make '${modelInfo.label}' restricted (requires key)`}
                                                        >
                                                            {isRestricted ? 'Restricted ✔' : 'Public'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                               {/* Add sections for managing restricted personas if needed, following the model pattern */}
                           </div>
                       )}
                   </div>
               </div>
           )}


           {/* Analysis Form Modal */}
           {isAnalysisFormVisible && (
               <div className="analysis-form-overlay">
                   <div className="analysis-form-modal">
                       <h3 id="analysis-title">Submit Details for University Advice</h3>
                        <p style={{fontSize:'0.9em', color:'#555', marginBottom:'15px'}}>Please provide the following details. The AI (in University Master persona) will analyze them to suggest potential faculties and universities.</p>
                       <form onSubmit={handleAnalysisSubmit}>
                           {/* Use settings-option for consistent styling */}
                           <div className="settings-option" style={{ marginBottom: '15px' }}>
                               <label htmlFor="analysis-field1">1. What's a potential downside or concern you have about university?</label>
                               <input type="text" id="analysis-field1" className="settings-input" value={field1} onChange={(e) => setField1(e.target.value)} placeholder="e.g., workload, cost, being far from home" disabled={isAnalyzing} required />
                           </div>
                           <div className="settings-option" style={{ marginBottom: '15px' }}>
                               <label htmlFor="analysis-field2">2. Who do you most enjoy spending time with?</label>
                               <input type="text" id="analysis-field2" className="settings-input" value={field2} onChange={(e) => setField2(e.target.value)} placeholder="e.g., friends, family, specific types of people" disabled={isAnalyzing} required />
                           </div>
                           <div className="settings-option" style={{ marginBottom: '15px' }}>
                               <label htmlFor="analysis-field3">3. How would you briefly describe yourself?</label>
                               <input type="text" id="analysis-field3" className="settings-input" value={field3} onChange={(e) => setField3(e.target.value)} placeholder="e.g., creative, analytical, quiet, outgoing" disabled={isAnalyzing} required />
                           </div>
                           <div className="settings-option" style={{ marginBottom: '15px' }}>
                               <label htmlFor="analysis-field4">4. What do you dislike most when studying or learning?</label>
                               <input type="text" id="analysis-field4" className="settings-input" value={field4} onChange={(e) => setField4(e.target.value)} placeholder="e.g., memorization, group projects, exams, long lectures" disabled={isAnalyzing} required />
                           </div>
                            <div className="settings-option" style={{ marginBottom: '15px' }}>
                                <label htmlFor="analysis-field5">5. What is your current or expected GPA (approximate)?</label>
                                <input type="text" id="analysis-field5" className="settings-input" value={field5} onChange={(e) => setField5(e.target.value)} placeholder="e.g., 3.5, 2.8, 4.0" disabled={isAnalyzing} required />
                            </div>
                           <div className="analysis-form-actions">
                               <button type="button" onClick={toggleAnalysisForm} className="close-settings-button" disabled={isAnalyzing}>Cancel</button>
                               {/* Corrected check for enabling submit button */}
                               <button type="submit" className="beta-accept-button" disabled={!field1.trim() || !field2.trim() || !field3.trim() || !field4.trim() || !field5.trim() || isAnalyzing}>
                                   {isAnalyzing ? 'Analyzing...' : 'Submit for Advice'}
                               </button>
                           </div>
                       </form>
                   </div>
               </div>
           )}

           {/* Beta Notice Modal */}
           {showBetaNotice && (
               <div className="beta-notice-overlay">
                   <div className="beta-notice-modal">
                       <h2>⚠️ Beta Version Notice</h2>
                       <p>Welcome to Project Theraphy! This application is currently in beta testing.</p>
                       <p>Features may change, and you might encounter bugs. Your feedback is valuable!</p>
                       <p>By clicking Accept, you acknowledge this is a beta version.</p>
                       <button onClick={handleAcceptBeta} className="beta-accept-button">✔️ Accept & Continue</button>
                   </div>
               </div>
           )}

           {/* Header */}
           <header className="App-header">
               <div style={{ display: 'flex', alignItems: 'center' }}>
                   <button onClick={toggleSettings} className="settings-button" title="Open Settings">⚙️</button>
                    {/* Button to open the analysis form */}
                   <button onClick={toggleAnalysisForm} className="settings-button analysis-button" title="Submit Details for University Advice">📝</button>
               </div>
               <h1>Project Theraphy</h1>
                {/* Spacer to push title left or center it depending on CSS */}
               <div className="header-spacer-right">
                   {/* You could add other header elements here if needed */}
               </div>
           </header>

           {/* Chatbot Page Component */}
           <ChatbotPage
               messages={messages}
               setMessages={setMessages}
               selectedModel={selectedModel}
               sttLang={sttLang}
               selectedPersona={selectedPersona}
               accessKey={enteredKey} // Pass the entered key down
               // No need to pass keyStatus down if ChatbotPage doesn't use it directly
           />

       </div>
   );
}

export default App;