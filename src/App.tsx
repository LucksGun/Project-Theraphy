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

// Define allowed model types
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-pro-exp' | 'gemini-1.5-pro' | 'gemini-1.5-flash';

// Define Speech Language type
export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR'; // Add more as needed

// localStorage Keys - Ensure these are USED below
const CHAT_STORAGE_KEY = 'chatMessages';
const BETA_ACCEPTED_KEY = 'betaAccepted';
const MODEL_STORAGE_KEY = 'selectedApiModel';
const STT_LANG_STORAGE_KEY = 'selectedSttLang';


function App() {
  // --- State Variables ---

  // Messages State & Persistence (Full Logic)
  const [messages, setMessages] = useState<Message[]>(() => {
    // Use CHAT_STORAGE_KEY here
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
      // Ensure welcome message matches Message interface
      const welcomeMessage: Message = { id: welcomeTime, text: "Welcome! How can I help you plan your future, manage stress, or discuss college options today?", sender: 'bot', timestamp: welcomeTime };
      return [welcomeMessage];
    } else {
      return initialMessages;
    }
  });

  // Beta Notice State
  const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);

  // Model Selection State & Persistence (Full Corrected Logic)
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(() => {
    // Use MODEL_STORAGE_KEY here
    const savedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null;
    if (savedModel && ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-pro-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'].includes(savedModel) ) {
      return savedModel;
    }
    return 'gemini-2.0-flash'; // Default model
  });

  // STT Language Selection State & Persistence (Full Corrected Logic)
  const [sttLang, setSttLang] = useState<SpeechLanguage>(() => {
    // Use STT_LANG_STORAGE_KEY here
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
  }, []); // Removed setShowBetaNotice from dependency array as it's stable

  // Model Persistence Effect (Use MODEL_STORAGE_KEY)
  useEffect(() => {
    localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  // STT Language Persistence Effect (Use STT_LANG_STORAGE_KEY)
  useEffect(() => {
    localStorage.setItem(STT_LANG_STORAGE_KEY, sttLang);
  }, [sttLang]);

  // --- Event Handlers (Full Definitions) ---

  // Use BETA_ACCEPTED_KEY and setShowBetaNotice
  const handleAcceptBeta = () => {
    localStorage.setItem(BETA_ACCEPTED_KEY, 'true');
    setShowBetaNotice(false); // Use setShowBetaNotice
  };

  const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => {
      const newModel = event.target.value as GeminiModel;
      setSelectedModel(newModel);
  };

  // Use setSttLang
  const handleSttLangChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSttLang(event.target.value as SpeechLanguage); // Use setSttLang
  };

  const toggleSettings = () => {
    setIsSettingsOpen(prev => !prev);
  };

  // Use setMessages and CHAT_STORAGE_KEY
  const handleClearChat = () => {
    if (window.confirm("Are you sure you want to clear the entire chat history? This cannot be undone.")) {
      const welcomeTime = Date.now();
      const welcomeMessage: Message = { id: welcomeTime, text: "Welcome! How can I help you plan your future, manage stress, or discuss college options today?", sender: 'bot', timestamp: welcomeTime };
      setMessages([welcomeMessage]); // Use setMessages
      localStorage.removeItem(CHAT_STORAGE_KEY); // Use CHAT_STORAGE_KEY
      setIsSettingsOpen(false);
    }
  };

  // --- Configuration for Model Display (Copied from previous example) ---
    interface ModelInfo { value: GeminiModel; label: string; restricted: boolean; }
    const ALL_AVAILABLE_MODELS: ModelInfo[] = [
        { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', restricted: false },
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', restricted: false },
        { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', restricted: false },
        { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', restricted: true }, // Restricted
        { value: 'gemini-2.5-pro-exp', label: 'Gemini 2.5 Pro Exp', restricted: true } // Restricted
    ];
    const RESTRICTED_MODELS_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS.filter(m => m.restricted).map(m => m.value);
    const USER_PROVIDED_ACCESS_KEY = "super_secret_password_123"; // Example - Insecure
    const REQUIRED_ACCESS_KEY = "super_secret_password_123";
    const userHasAccessToRestricted = USER_PROVIDED_ACCESS_KEY === REQUIRED_ACCESS_KEY;


  // --- JSX Return ---
  return (
    <div className="App">
      {/* Settings Button */}
      {/* (Rendered in header) */}

      {/* --- Settings Menu --- */}
      {isSettingsOpen && (
        <div className="settings-menu" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <h3 id="settings-title">Settings</h3>

          {/* STT Language Selector (Use handleSttLangChange) */}
          <div className="settings-option">
            <label htmlFor="stt-lang-select">Speak Language:</label>
            {/* Connect value and onChange */}
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
             {/* Connect value and onChange */}
             <select id="model-select" value={selectedModel} onChange={handleModelChange} className="settings-select">
                 {ALL_AVAILABLE_MODELS.map((modelInfo) => {
                     if (!modelInfo.restricted || userHasAccessToRestricted) {
                         return (<option key={modelInfo.value} value={modelInfo.value}>{modelInfo.label}{modelInfo.restricted ? ' (Restricted)' : ''}</option>);
                     } return null;
                 })}
             </select>
              {/* ... Optional restricted message ... */}
          </div>

          {/* Clear Chat History Button (Use handleClearChat) */}
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

      {/* --- Beta Notice Modal (Use handleAcceptBeta) --- */}
      {/* Ensure this full block is present */}
      {showBetaNotice && (
        <div className="beta-notice-overlay">
           <div className="beta-notice-modal">
             <h2>⚠️ Beta Version</h2>
             <p>Welcome! This chatbot is currently in beta. Features may change, and occasional errors might occur. Your feedback is valuable!</p>
             {/* Connect onClick */}
             <button onClick={handleAcceptBeta} className="beta-accept-button">✔️ Accept & Continue</button>
           </div>
        </div>
      )}

      {/* --- Header --- */}
      <header className="App-header">
        {/* Settings Button */}
        <button onClick={toggleSettings} className="settings-button" title="Settings" aria-label="Open settings menu" aria-expanded={isSettingsOpen}>⚙️</button>
        {/* Header Title */}
        <h1>Project Theraphy Dashboard</h1>
        {/* Spacer Div */}
        <div className="header-spacer-right"></div>
      </header>

      {/* --- Chatbot Page --- */}
      {/* Ensure props are passed correctly */}
      <ChatbotPage
        messages={messages}
        setMessages={setMessages}
        selectedModel={selectedModel}
        sttLang={sttLang}
       />
    </div>
  );
}

export default App;