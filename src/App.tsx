// src/App.tsx
import React, { useState, useEffect, ChangeEvent } from 'react';
import ReactGA from 'react-ga4';
import './App.css'; // Ensure this CSS file is linked
import ChatbotPage from './ChatbotPage'; // Assuming ChatbotPage component exists

// --- GA Measurement ID ---
// IMPORTANT: Replace "G-JX58QMMKZY" with your actual Google Analytics Measurement ID
const GA_MEASUREMENT_ID = "G-JX58QMMKZY";

// --- Initialize GA & Send Initial Pageview ---
// Basic check to prevent initializing with the placeholder ID
if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" && GA_MEASUREMENT_ID !== "G-JX58QMMKZY") {
  try {
     ReactGA.initialize(GA_MEASUREMENT_ID);
     console.log("Google Analytics Initialized with ID:", GA_MEASUREMENT_ID);
     // Send initial pageview right after initialization
     ReactGA.send({ hitType: "pageview", page: window.location.pathname + window.location.search, title: "Chatbot Initial Load" });
     console.log("Initial Pageview Sent:", window.location.pathname + window.location.search);
  } catch (error) {
     console.error("Error initializing Google Analytics:", error)
  }
} else if (GA_MEASUREMENT_ID === "G-JX58QMMKZY") {
    console.warn("Google Analytics is using the placeholder ID (G-JX58QMMKZY). Please replace it with your actual Measurement ID.");
}
else {
  console.warn("Google Analytics Measurement ID not set or invalid. Tracking disabled.");
}

// --- Message interface definition ---
export interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot' | 'loading';
  timestamp: number;
  imageUrl?: string;
}

// Define allowed model types
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-pro-exp-03-25' | 'gemini-2.0-flash-thinking-exp-01-21' | 'gemini-2.0-flash-exp-image-generation';

// Define Speech Language type
export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR'; // Add more as needed

// Define Persona Type
export type Persona = 'normal' | 'therapist' | 'university_master';

// localStorage Keys
const CHAT_STORAGE_KEY = 'chatMessages';
const BETA_ACCEPTED_KEY = 'betaAccepted';
const MODEL_STORAGE_KEY = 'selectedApiModel';
const STT_LANG_STORAGE_KEY = 'selectedSttLang';
const ACCESS_KEY_STORAGE_KEY = 'userAccessKey';
const PERSONA_STORAGE_KEY = 'selectedPersona'; // Key for storing persona

// --- Model Configuration ---
interface ModelInfo { value: GeminiModel; label: string; restricted: boolean; }

const ALL_AVAILABLE_MODELS: ModelInfo[] = [
  { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', restricted: false },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', restricted: false },
  { value: 'gemini-2.0-flash-thinking-exp-01-21', label: 'Gemini 2.0 Flash Thinking Experimental', restricted: true }, // Restricted
  { value: 'gemini-2.0-flash-exp-image-generation', label: 'Gemini 2.0 Flash Image Generation Experimental', restricted: true }, // Restricted
  { value: 'gemini-2.5-pro-exp-03-25', label: 'Gemini 2.5 Pro Experimental', restricted: true } // Restricted
];

const RESTRICTED_MODELS_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS
  .filter(m => m.restricted)
  .map(m => m.value);

// The actual secret key required (should match worker env.ACCESS_KEY)
// IMPORTANT: Replace with your actual secure key and manage it securely (e.g., environment variables)
const REQUIRED_ACCESS_KEY = "super_secret_password_321";

// --- Persona Configuration (with Emojis) ---
interface PersonaInfo { value: Persona; label: string; emoji: string; }
const AVAILABLE_PERSONAS: PersonaInfo[] = [
    { value: 'normal', label: 'Normal Bot', emoji: '🤖' },
    { value: 'therapist', label: 'Therapist', emoji: '🧠' }, // Or '🛋️'
    { value: 'university_master', label: 'University Master', emoji: '🎓' }, // Or '🧑‍🏫'
];


// --- API Call Logic (Kept inside App.tsx for Analysis Form) ---
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';

// Define interface for API request body
interface ApiRequestBody {
    prompt: string;
    model: GeminiModel;
    persona: Persona; // Added persona
    imageMimeType?: string;
    imageDataUrl?: string;
    accessKey: string;
}

// Note: This version is simplified for text-only analysis form usage
async function getBotResponseForAnalysis(
    userInput: string,
    model: GeminiModel,
    persona: Persona, // Added persona
    accessKey: string
): Promise<string> {
    const promptToSend = userInput;
    if (!promptToSend) { return "Error: No text provided for analysis."; }

    const requestBody: ApiRequestBody = {
        prompt: promptToSend,
        model: model,
        persona: persona, // Added persona
        accessKey: accessKey
    };

    console.log(`Sending Analysis Request (Model: ${model}, Persona: ${persona}):`, {
         promptLength: promptToSend.length,
         model: requestBody.model,
        persona: requestBody.persona,
         accessKey: requestBody.accessKey ? 'present' : 'none'
    });

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP error! Status: ${response.status} ${response.statusText}` }));
            throw new Error(errorData?.error || `HTTP error! Status: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (data.error) { throw new Error(data.error); }
        console.log('Received analysis reply from Worker:', data.reply);
        return data.reply || 'Sorry, I received an empty reply.';
    } catch (error) {
        console.error('Error fetching bot response for analysis:', error);
        if (error instanceof Error) { return `Error: ${error.message}`; }
        return 'Error: Could not fetch response.';
    }
}
// --- End API Call Logic ---


function App() {
  // --- State Variables ---
  // Messages State & Persistence
  const [messages, setMessages] = useState<Message[]>(() => {
    const savedMessages = localStorage.getItem(CHAT_STORAGE_KEY);
    let initialMessages: Message[] = [];
    try {
      initialMessages = savedMessages && savedMessages !== '[]' ? JSON.parse(savedMessages) : [];
      if (!Array.isArray(initialMessages)) { throw new Error("Parsed data not an array"); }
    } catch (e) {
      console.error("Failed to parse messages from localStorage", e);
      localStorage.removeItem(CHAT_STORAGE_KEY);
      initialMessages = [];
    }
    if (initialMessages.length === 0) {
      const welcomeTime = Date.now();
      const welcomeMessage: Message = { id: welcomeTime, text: "Welcome! How can I help you plan your future, manage stress, or discuss college options today?", sender: 'bot', timestamp: welcomeTime };
      return [welcomeMessage];
    } else {
      return initialMessages;
    }
  });

  // Beta Notice State
  const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);

  // Entered Access Key State
  const [enteredKey, setEnteredKey] = useState<string>(() => {
      return localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '';
  });
  const userHasAccessToRestricted = enteredKey === REQUIRED_ACCESS_KEY;

  // Model Selection State & Persistence
  const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.0-flash'); // Default set by useEffect

  // STT Language Selection State & Persistence
  const [sttLang, setSttLang] = useState<SpeechLanguage>(() => {
    const savedLang = localStorage.getItem(STT_LANG_STORAGE_KEY) as SpeechLanguage | null;
    if (savedLang && ['en-US', 'th-TH', 'es-ES', 'fr-FR'].includes(savedLang) ) {
        return savedLang;
    }
    return 'en-US';
  });

   // Persona Selection State & Persistence
  const [selectedPersona, setSelectedPersona] = useState<Persona>(() => {
    const savedPersona = localStorage.getItem(PERSONA_STORAGE_KEY) as Persona | null;
    if (savedPersona && AVAILABLE_PERSONAS.some(p => p.value === savedPersona)) {
      return savedPersona;
    }
    return 'normal'; // Default persona
  });

  // Settings Menu State
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // --- State for Analysis Form ---
  const [isAnalysisFormVisible, setIsAnalysisFormVisible] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [field1, setField1] = useState<string>('');
  const [field2, setField2] = useState<string>('');
  const [field3, setField3] = useState<string>('');
  const [field4, setField4] = useState<string>('');
  const [field5, setField5] = useState<string>('');


  // --- Effects ---

  // Effect to set initial or saved model based on key access
  useEffect(() => {
      const savedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null;
      let initialModel: GeminiModel = 'gemini-2.0-flash'; // Default public model

      const currentAccess = enteredKey === REQUIRED_ACCESS_KEY;

      if (savedModel && ALL_AVAILABLE_MODELS.some(m => m.value === savedModel)) {
          if (RESTRICTED_MODELS_VALUES.includes(savedModel)) {
              if (currentAccess) {
                  initialModel = savedModel;
              } else {
                  console.warn(`Saved model ${savedModel} is restricted, access denied. Falling back to default.`);
                  // Fallback handled below
              }
          } else {
              initialModel = savedModel; // Not restricted, safe to load
          }
      }

       // Ensure the determined initialModel isn't restricted if access is denied
       if (RESTRICTED_MODELS_VALUES.includes(initialModel) && !currentAccess) {
           initialModel = 'gemini-2.0-flash'; // Fallback to default public
       }

      setSelectedModel(initialModel);

       // Also check if the *currently* selected model becomes invalid due to key change
       setSelectedModel(currentModel => {
           if (RESTRICTED_MODELS_VALUES.includes(currentModel) && !currentAccess) {
               console.warn(`Current model ${currentModel} is restricted, access denied. Falling back.`);
               return 'gemini-2.0-flash'; // Fallback if current restricted model loses access
           }
           // If the calculated initialModel is different, set it. Otherwise, keep current.
           return currentModel === initialModel ? currentModel : initialModel;
       });

  }, [enteredKey]); // Re-run when access key changes


  // Persistence Effects
  useEffect(() => {
    // Only save if there are messages beyond the initial welcome, or if explicitly cleared to empty
    if (messages.length > 1 || (messages.length === 1 && messages[0].sender !== 'bot')) {
         localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } else if (messages.length === 0) {
         localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)); // Save empty array if cleared
    }
  }, [messages]);

  useEffect(() => {
    const accepted = localStorage.getItem(BETA_ACCEPTED_KEY);
    if (accepted !== 'true') { setShowBetaNotice(true); }
  }, []);

  useEffect(() => { localStorage.setItem(MODEL_STORAGE_KEY, selectedModel); }, [selectedModel]);
  useEffect(() => { localStorage.setItem(STT_LANG_STORAGE_KEY, sttLang); }, [sttLang]);
  useEffect(() => { localStorage.setItem(ACCESS_KEY_STORAGE_KEY, enteredKey); }, [enteredKey]);
  useEffect(() => { localStorage.setItem(PERSONA_STORAGE_KEY, selectedPersona); }, [selectedPersona]); // Persist persona


  // --- Event Handlers ---
  const handleAcceptBeta = () => {
    localStorage.setItem(BETA_ACCEPTED_KEY, 'true');
    setShowBetaNotice(false);
  };

  const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => {
      const newModel = event.target.value as GeminiModel;
      if (ALL_AVAILABLE_MODELS.some(m => m.value === newModel)) {
          setSelectedModel(newModel);
      } else { console.error(`Attempted to select invalid model: ${newModel}`); }
  };

  const handleSttLangChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSttLang(event.target.value as SpeechLanguage);
  };

  const handlePersonaChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedPersona(event.target.value as Persona);
  };

  const toggleSettings = () => { setIsSettingsOpen(prev => !prev); };

  const handleClearChat = () => {
    if (window.confirm("Are you sure you want to clear the entire chat history? This cannot be undone.")) {
      const welcomeTime = Date.now();
      const welcomeMessage: Message = { id: welcomeTime, text: "Welcome! How can I help you plan your future, manage stress, or discuss college options today?", sender: 'bot', timestamp: welcomeTime };
      setMessages([welcomeMessage]);
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify([welcomeMessage]));
      setIsSettingsOpen(false);
    }
  };

  const handleAccessKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
      setEnteredKey(event.target.value);
  };


  // --- Handlers for Analysis Form ---
  const clearAnalysisForm = () => {
    setField1(''); setField2(''); setField3(''); setField4(''); setField5('');
  };

  const toggleAnalysisForm = () => {
      setIsAnalysisFormVisible(prev => !prev);
      if (isAnalysisFormVisible) { // If closing
          clearAnalysisForm();
          setIsAnalyzing(false);
      }
  };

  const handleAnalysisSubmit = async (event: React.FormEvent) => {
      event.preventDefault();

      const val1 = field1.trim();
      const val2 = field2.trim();
      const val3 = field3.trim();
      const val4 = field4.trim();
      const val5 = field5.trim();

      if (!val1 || isAnalyzing) return;

      setIsAnalyzing(true);
      setIsAnalysisFormVisible(false);

      // Track GA Event on Submit
      if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" && GA_MEASUREMENT_ID !== "G-JX58QMMKZY") {
        try {
            ReactGA.event({
              category: "Analysis Form",
              action: "Submit_Analysis_Request",
              label: `Field 1 Length: ${val1.length}`
            });
            console.log("GA Event Sent: Submit_Analysis_Request");
        } catch (error) {
            console.error("Error sending GA Event:", error);
        }
      }

      // Construct the prompt string
      let combinedInput = `Field 1: ${val1}\n`;
      if (val2) combinedInput += `Field 2: ${val2}\n`;
      if (val3) combinedInput += `Field 3: ${val3}\n`;
      if (val4) combinedInput += `Field 4: ${val4}\n`;
      if (val5) combinedInput += `Field 5: ${val5}\n`;

      // Add a "Thinking..." message
      const thinkingTime = Date.now();
      const thinkingMessage: Message = { id: thinkingTime, text: `Analyzing Input (Field 1-5: "${val1.substring(0, 40)}...")...`, sender: 'loading', timestamp: thinkingTime };
      setMessages(prev => [...prev, thinkingMessage]);
      clearAnalysisForm(); // Clear form fields in state

      // Call the bot for analysis (passing persona)
      const analysisResult = await getBotResponseForAnalysis(
        combinedInput.trim(),
        selectedModel,
        selectedPersona, // Pass selected persona
        enteredKey
      );

      // Replace thinking message with the result
      const resultTime = Date.now() + 1;
      const resultMessage: Message = { id: resultTime, text: analysisResult, sender: 'bot', timestamp: resultTime };

      setMessages(prev => [
          ...prev.filter(msg => msg.id !== thinkingTime),
          resultMessage
      ]);
      setIsAnalyzing(false);
  };


  // --- JSX Return Statement ---
  return (
    <div className="App">
      {/* --- Settings Menu (Conditional) --- */}
      {isSettingsOpen && (
        <div className="settings-menu" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <h3 id="settings-title">Settings</h3>

           {/* Access Key Input */}
           <div className="settings-option">
            <label htmlFor="access-key-input">Access Key:</label>
            <input
              type="password"
              id="access-key-input"
              className="settings-input"
              placeholder="Enter key for restricted models"
              value={enteredKey}
              onChange={handleAccessKeyChange}
            />
            {enteredKey && ( <span style={{ fontSize: '0.8em', marginLeft: '5px' }}>{userHasAccessToRestricted ? '✅' : '❌'}</span> )}
           </div>

          {/* Persona Selector (with Emojis) */}
          <div className="settings-option">
             <label htmlFor="persona-select">Persona:</label>
             <select id="persona-select" value={selectedPersona} onChange={handlePersonaChange} className="settings-select">
                 {AVAILABLE_PERSONAS.map((personaInfo) => (
                     <option key={personaInfo.value} value={personaInfo.value}>
                         {personaInfo.emoji} {personaInfo.label}
                     </option>
                 ))}
             </select>
          </div>

          {/* STT Language Selector */}
           <div className="settings-option">
            <label htmlFor="stt-lang-select">Speak Language:</label>
            <select id="stt-lang-select" value={sttLang} onChange={handleSttLangChange} className="settings-select">
                <option value="en-US">English (US)</option>
                <option value="th-TH">ไทย (Thai)</option>
                <option value="es-ES">Español (España)</option>
                <option value="fr-FR">Français (France)</option>
            </select>
           </div>

          {/* Model Selector */}
           <div className="settings-option">
             <label htmlFor="model-select">AI Model:</label>
             <select id="model-select" value={selectedModel} onChange={handleModelChange} className="settings-select">
                 {ALL_AVAILABLE_MODELS.map((modelInfo) => {
                     const isDisabled = modelInfo.restricted && !userHasAccessToRestricted;
                     const style = isDisabled ? { color: '#888', fontStyle: 'italic' } : {};
                     return (
                         <option key={modelInfo.value} value={modelInfo.value} disabled={isDisabled} style={style}>
                             {modelInfo.label}{modelInfo.restricted ? ' (Restricted)' : ''}
                         </option>
                     );
                 })}
             </select>
             {!userHasAccessToRestricted && RESTRICTED_MODELS_VALUES.length > 0 && (
                <p style={{fontSize: '0.8em', color: 'var(--text-secondary)', marginTop: '5px'}}>
                   Models marked (Restricted) require the correct Access Key.
                </p>
             )}
           </div>

          {/* Clear Chat History Button */}
           <div className="settings-option">
             <button onClick={handleClearChat} className="clear-chat-settings-button">
                🗑️ Clear Chat History
             </button>
           </div>

          {/* Separator Line */}
           <hr className="settings-separator" />

          {/* Close Button */}
           <button onClick={toggleSettings} className="close-settings-button">Close</button>
        </div>
      )}

      {/* --- Analysis Form Modal --- */}
      {isAnalysisFormVisible && (
          <div className="analysis-form-overlay">
              <div className="analysis-form-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-title">
                  <h3 id="analysis-title">Submit Details for Analysis</h3>
                  <form onSubmit={handleAnalysisSubmit}>
                    {/* Field 1 */}
                      <div className="settings-option" style={{ marginBottom: '15px' }}>
                        <label htmlFor="analysis-field1">Field 1 (Required):</label>
                        <input type="text" id="analysis-field1" className="settings-input" value={field1} onChange={(e) => setField1(e.target.value)} placeholder="Do you have any downside or concern? คุณมีปมด้อยหรือความกังวลอะไรไหม" disabled={isAnalyzing} required />
                    </div>
                    {/* Field 2 */}
                    <div className="settings-option" style={{ marginBottom: '15px' }}>
                        <label htmlFor="analysis-field2">Field 2 (Required):</label>
                        <input type="text" id="analysis-field2" className="settings-input" value={field2} onChange={(e) => setField2(e.target.value)} placeholder="What thing you enjoy spending time with? คูณมีความสุขใช้เวลาไปกับสิ่งอะไรมากที่สุด" disabled={isAnalyzing} required />
                    </div>
                    {/* Field 3 */}
                     <div className="settings-option" style={{ marginBottom: '15px' }}>
                        <label htmlFor="analysis-field3">Field 3 (Required):</label>
                        <input type="text" id="analysis-field3" className="settings-input" value={field3} onChange={(e) => setField3(e.target.value)} placeholder="How would you describe yourself? คุณอธิบายตัวคุณได้ดีที่สุดว่าเป็นอย่างไร" disabled={isAnalyzing} required />
                    </div>
                    {/* Field 4 */}
                    <div className="settings-option" style={{ marginBottom: '15px' }}>
                        <label htmlFor="analysis-field4">Field 4 (Required):</label>
                        <input type="text" id="analysis-field4" className="settings-input" value={field4} onChange={(e) => setField4(e.target.value)} placeholder="What do you hate most when you study? คุณเกลียดอะไรมากที่สุดตอนเรียน" disabled={isAnalyzing} required />
                    </div>
                    {/* Field 5 */}
                    <div className="settings-option" style={{ marginBottom: '15px' }}>
                        <label htmlFor="analysis-field5">Field 5 (Required):</label>
                        <input type="text" id="analysis-field5" className="settings-input" value={field5} onChange={(e) => setField5(e.target.value)} placeholder="GPA? เกรดเฉลี่ย" disabled={isAnalyzing} required />
                    </div>

                      {/* Form Actions */}
                      <div className="analysis-form-actions">
                           <button type="button" onClick={toggleAnalysisForm} className="close-settings-button" disabled={isAnalyzing}>Cancel</button>
                          <button type="submit" className="beta-accept-button" disabled={!field1.trim() || isAnalyzing}>{isAnalyzing ? 'Submitting...' : 'Submit Analysis'}</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* --- Beta Notice Modal --- */}
      {showBetaNotice && (
         <div className="beta-notice-overlay">
            <div className="beta-notice-modal">
              <h2>⚠️ Beta Version</h2>
              <p>Welcome! This chatbot is currently in beta. Features may change, and occasional errors might occur. Your feedback is valuable!</p>
              <button onClick={handleAcceptBeta} className="beta-accept-button">✔️ Accept & Continue</button>
            </div>
         </div>
      )}

      {/* --- Header --- */}
      <header className="App-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
            <button onClick={toggleSettings} className="settings-button" title="Settings" aria-label="Open settings menu" aria-expanded={isSettingsOpen}>⚙️</button>
            <button onClick={toggleAnalysisForm} className="settings-button analysis-button" title="Submit Details for Analysis" aria-label="Open analysis form" aria-expanded={isAnalysisFormVisible}>📝</button>
        </div>
        <h1>Project Theraphy - Chatbot</h1>
        <div className="header-spacer-right"></div> {/* Keeps title centered */}
      </header>

      {/* --- Chatbot Page (Pass props down) --- */}
      <ChatbotPage
        messages={messages}
        setMessages={setMessages}
        selectedModel={selectedModel}
        sttLang={sttLang}
        selectedPersona={selectedPersona} // Pass selected persona
        accessKey={enteredKey}
       />
    </div>
  );

}

export default App;