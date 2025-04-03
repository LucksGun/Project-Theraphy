// src/App.tsx
import { useState, useEffect, ChangeEvent } from 'react';
import './App.css'; // Ensure this CSS file is linked
import ChatbotPage from './ChatbotPage'; // Assuming ChatbotPage component exists

// --- CORRECT Message interface definition ---
export interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot' | 'loading';
  timestamp: number;
}

// Define allowed model types (All possible models)
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-pro-exp' | 'gemini-1.5-pro' | 'gemini-1.5-flash';

// Define Speech Language type
export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR'; // Add more as needed

// localStorage Keys - Ensure these are USED below
const CHAT_STORAGE_KEY = 'chatMessages';
const BETA_ACCEPTED_KEY = 'betaAccepted';
const MODEL_STORAGE_KEY = 'selectedApiModel';
const STT_LANG_STORAGE_KEY = 'selectedSttLang';


// --- Configuration for Model Display ---
interface ModelInfo {
  value: GeminiModel;
  label: string;
  restricted: boolean;
}

// Define all models available in the UI and if they are restricted
const ALL_AVAILABLE_MODELS: ModelInfo[] = [
  { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', restricted: false },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', restricted: false },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', restricted: false },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', restricted: true }, // Restricted
  { value: 'gemini-2.5-pro-exp', label: 'Gemini 2.5 Pro Exp', restricted: true } // Restricted
];

// Create a list of just the restricted model values for easier checking
const RESTRICTED_MODELS_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS
  .filter(m => m.restricted)
  .map(m => m.value);

// !! IMPORTANT: Storing/using secrets directly in frontend code is insecure !!
// This logic is for demonstrating frontend filtering based on a hypothetical key.
// Replace with your actual access control method if needed.
const USER_PROVIDED_ACCESS_KEY = "super_secret_password_123"; // Example - How does the frontend get this?
const REQUIRED_ACCESS_KEY = "super_secret_password_123"; // This ideally matches the worker env.ACCESS_KEY value


function App() {
  // --- State Variables ---

  // Messages State & Persistence (Use CHAT_STORAGE_KEY)
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

  // Determine if the user has the 'key' to see restricted models
  const userHasAccessToRestricted = USER_PROVIDED_ACCESS_KEY === REQUIRED_ACCESS_KEY;

  // Model Selection State & Persistence (Use MODEL_STORAGE_KEY and RESTRICTED_MODELS_VALUES)
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(() => {
    const savedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null;
    // Check if saved model is valid *and* potentially restricted
    if (savedModel && ALL_AVAILABLE_MODELS.some(m => m.value === savedModel)) {
        // Is it restricted? Now using the constant.
        if (RESTRICTED_MODELS_VALUES.includes(savedModel)) {
             // Only allow loading this saved model if user has access
             if (userHasAccessToRestricted) {
                 return savedModel;
             } else {
                 // User doesn't have access to the saved restricted model, fallback
                 console.warn(`Saved model ${savedModel} is restricted, falling back to default.`);
                 return 'gemini-2.0-flash'; // Default non-restricted
             }
        } else {
            // Not restricted, allow it
            return savedModel;
        }
    }
    // If no valid/allowed saved model found, return default
    return 'gemini-2.0-flash';
  });

  // STT Language Selection State & Persistence (Use STT_LANG_STORAGE_KEY)
  const [sttLang, setSttLang] = useState<SpeechLanguage>(() => {
    const savedLang = localStorage.getItem(STT_LANG_STORAGE_KEY) as SpeechLanguage | null;
    if (savedLang && ['en-US', 'th-TH', 'es-ES', 'fr-FR'].includes(savedLang) ) {
        return savedLang;
    }
    return 'en-US'; // Default language
  });

  // Settings Menu State
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // --- Effects for Persistence and Setup ---

  // Message Persistence Effect (Use CHAT_STORAGE_KEY)
  useEffect(() => {
    if (messages.length > 1 || (messages.length === 1 && messages[0].sender !== 'bot')) {
         localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } else if (messages.length === 0) {
         localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  // Beta Notice Effect (Use BETA_ACCEPTED_KEY)
  useEffect(() => {
    const accepted = localStorage.getItem(BETA_ACCEPTED_KEY);
    if (accepted !== 'true') {
      setShowBetaNotice(true); // Use setShowBetaNotice
    }
  }, []); // Dependency array should be empty if effect only runs on mount

  // Model Persistence Effect (Use MODEL_STORAGE_KEY)
  useEffect(() => {
    localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  // STT Language Persistence Effect (Use STT_LANG_STORAGE_KEY)
  useEffect(() => {
    localStorage.setItem(STT_LANG_STORAGE_KEY, sttLang);
  }, [sttLang]);

  // --- Event Handlers (Full Definitions & Usage) ---

  // Use BETA_ACCEPTED_KEY and setShowBetaNotice
  const handleAcceptBeta = () => {
    localStorage.setItem(BETA_ACCEPTED_KEY, 'true');
    setShowBetaNotice(false); // Use setShowBetaNotice
  };

  // Use setSelectedModel
  const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => {
      const newModel = event.target.value as GeminiModel;
      if (ALL_AVAILABLE_MODELS.some(m => m.value === newModel)) {
          setSelectedModel(newModel); // Use setSelectedModel
      } else {
          console.error(`Attempted to select invalid model: ${newModel}`);
      }
  };

  // Use setSttLang
  const handleSttLangChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSttLang(event.target.value as SpeechLanguage); // Use setSttLang
  };

  // Use setIsSettingsOpen
  const toggleSettings = () => {
    setIsSettingsOpen(prev => !prev); // Use setIsSettingsOpen
  };

  // Use setMessages and CHAT_STORAGE_KEY
  const handleClearChat = () => {
    if (window.confirm("Are you sure you want to clear the entire chat history? This cannot be undone.")) {
      const welcomeTime = Date.now();
      const welcomeMessage: Message = { id: welcomeTime, text: "Welcome! How can I help you plan your future, manage stress, or discuss college options today?", sender: 'bot', timestamp: welcomeTime };
      setMessages([welcomeMessage]); // Use setMessages
      localStorage.removeItem(CHAT_STORAGE_KEY); // Use CHAT_STORAGE_KEY
      setIsSettingsOpen(false); // Close settings menu
    }
  };

  // --- JSX Return ---
  return (
    <div className="App">
      {/* --- Settings Button (Inside Header) --- */}
      {/* (Rendered in header below) */}

      {/* --- Settings Menu (Conditional, Handlers Connected) --- */}
      {isSettingsOpen && (
        <div className="settings-menu" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <h3 id="settings-title">Settings</h3>

          {/* STT Language Selector (Connected) */}
          <div className="settings-option">
            <label htmlFor="stt-lang-select">Speak Language:</label>
            <select id="stt-lang-select" value={sttLang} onChange={handleSttLangChange} className="settings-select">
                <option value="en-US">English (US)</option>
                <option value="th-TH">ไทย (Thai)</option>
                <option value="es-ES">Español (España)</option>
                <option value="fr-FR">Français (France)</option>
            </select>
          </div>

          {/* Model Selector (Connected & Filtered) */}
          <div className="settings-option">
             <label htmlFor="model-select">AI Model:</label>
             <select id="model-select" value={selectedModel} onChange={handleModelChange} className="settings-select">
                 {ALL_AVAILABLE_MODELS.map((modelInfo) => {
                     if (!modelInfo.restricted || userHasAccessToRestricted) {
                         return (<option key={modelInfo.value} value={modelInfo.value}>{modelInfo.label}{modelInfo.restricted ? ' (Restricted)' : ''}</option>);
                     } return null;
                 })}
             </select>
             {!userHasAccessToRestricted && RESTRICTED_MODELS_VALUES.length > 0 && (
                <p style={{fontSize: '0.8em', color: 'var(--text-secondary)', marginTop: '5px'}}>
                    Some models require special access.
                </p>
             )}
          </div>

          {/* Clear Chat History Button (Connected) */}
          <div className="settings-option">
             <button onClick={handleClearChat} className="clear-chat-settings-button">
               🗑️ Clear Chat History
             </button>
          </div>

          {/* Separator Line */}
          <hr className="settings-separator" />

          {/* Close Button (Connected) */}
          <button onClick={toggleSettings} className="close-settings-button">Close</button>
        </div>
      )}

      {/* --- Beta Notice Modal (Correct JSX & Connected) --- */}
      {showBetaNotice && (
        <div className="beta-notice-overlay">
           <div className="beta-notice-modal">
             <h2>⚠️ Beta Version</h2>
             <p>Welcome! This chatbot is currently in beta. Features may change, and occasional errors might occur. Your feedback is valuable!</p>
             <button onClick={handleAcceptBeta} className="beta-accept-button">✔️ Accept & Continue</button>
           </div>
        </div>
      )}

      {/* --- Header (Structure Correct) --- */}
      <header className="App-header">
        {/* Settings Button */}
        <button onClick={toggleSettings} className="settings-button" title="Settings" aria-label="Open settings menu" aria-expanded={isSettingsOpen}>⚙️</button>
        {/* Header Title */}
        <h1>Project Theraphy Dashboard</h1>
        {/* Spacer Div */}
        <div className="header-spacer-right"></div>
      </header>

      {/* --- Chatbot Page (Props Passed) --- */}
      <ChatbotPage
        messages={messages}
        setMessages={setMessages}
        selectedModel={selectedModel}
        sttLang={sttLang}
        // Pass access key down if needed by ChatbotPage's fetch call
        // accessKey={USER_PROVIDED_ACCESS_KEY}
       />
    </div>
  );
}

export default App;