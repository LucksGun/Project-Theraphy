// src/App.tsx
import { useState, useEffect, ChangeEvent } from 'react';
import './App.css'; // Ensure this CSS file is linked
import ChatbotPage from './ChatbotPage'; // Assuming ChatbotPage component exists

// Define Message interface
export interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot' | 'loading';
  timestamp: number;
}

// Define allowed model types
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-1.5-pro' | 'gemini-1.5-flash';
// Define Speech Language type
export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR'; // Add more as needed

// localStorage Keys
const CHAT_STORAGE_KEY = 'chatMessages';
const BETA_ACCEPTED_KEY = 'betaAccepted';
const MODEL_STORAGE_KEY = 'selectedApiModel';
const STT_LANG_STORAGE_KEY = 'selectedSttLang';

// REMOVED: const currentDate = new Date().toLocaleDateString('en-CA');

function App() {
  // --- State Variables ---

  // Messages State & Persistence (Full Logic)
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

  // Model Selection State & Persistence (Full Corrected Logic)
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(() => {
    const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
    if (savedModel === 'gemini-1.5-pro' || savedModel === 'gemini-2.0-flash' || savedModel === 'gemini-1.5-flash') {
        return savedModel; // Return the valid saved model
    }
    return 'gemini-2.0-flash'; // Default model
  });

  // STT Language Selection State & Persistence (Full Corrected Logic)
  const [sttLang, setSttLang] = useState<SpeechLanguage>(() => {
    const savedLang = localStorage.getItem(STT_LANG_STORAGE_KEY);
    // Check against all defined types
    if (savedLang === 'th-TH' || savedLang === 'es-ES' || savedLang === 'fr-FR' || savedLang === 'en-US') {
        return savedLang; // Return the valid saved language
    }
    return 'en-US'; // Default language
  });

  // Settings Menu State
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // --- Effects for Persistence and Setup ---

  // Message Persistence Effect
  useEffect(() => {
    // Avoid saving initial welcome message immediately
    if (messages.length > 1 || (messages.length === 1 && messages[0].sender !== 'bot')) {
         localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } else if (messages.length === 0) { // Save if explicitly cleared
         localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  // Beta Notice Effect
  useEffect(() => {
    const accepted = localStorage.getItem(BETA_ACCEPTED_KEY);
    if (accepted !== 'true') {
      setShowBetaNotice(true);
    }
  }, []);

  // Model Persistence Effect
  useEffect(() => {
    localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  // STT Language Persistence Effect
  useEffect(() => {
    localStorage.setItem(STT_LANG_STORAGE_KEY, sttLang);
  }, [sttLang]);

  // --- Event Handlers (Full Definitions) ---

  const handleAcceptBeta = () => {
    localStorage.setItem(BETA_ACCEPTED_KEY, 'true');
    setShowBetaNotice(false);
  };

  const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => {
      const newModel = event.target.value as GeminiModel;
      setSelectedModel(newModel);
  };

  const handleSttLangChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSttLang(event.target.value as SpeechLanguage);
  };

  const toggleSettings = () => {
    setIsSettingsOpen(prev => !prev); // Toggle the settings menu visibility
  };

  const handleClearChat = () => {
    // Confirmation dialog
    if (window.confirm("Are you sure you want to clear the entire chat history? This cannot be undone.")) {
      const welcomeTime = Date.now();
      const welcomeMessage: Message = { id: welcomeTime, text: "Welcome! How can I help you plan your future, manage stress, or discuss college options today?", sender: 'bot', timestamp: welcomeTime };
      setMessages([welcomeMessage]);
      localStorage.removeItem(CHAT_STORAGE_KEY);
      // Close settings menu after clearing
      setIsSettingsOpen(false);
    }
  };

  // --- JSX Return ---
  return (
    <div className="App">
      {/* --- Settings Button Now Inside Header --- */}
      {/* (Button is rendered inside the header below) */}

      {/* --- Settings Menu (Conditionally Rendered, still uses fixed position) --- */}
      {isSettingsOpen && (
        <div className="settings-menu" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <h3 id="settings-title">Settings</h3>

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
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
            </select>
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

      {/* --- Beta Notice Modal (Unchanged) --- */}
      {showBetaNotice && (
        <div className="beta-notice-overlay">
           <div className="beta-notice-modal">
             <h2>⚠️ Beta Version</h2>
             <p>Welcome! This chatbot is currently in beta. Features may change, and occasional errors might occur. Your feedback is valuable!</p>
             <button onClick={handleAcceptBeta} className="beta-accept-button">✔️ Accept & Continue</button>
           </div>
        </div>
      )}

      {/* --- Header (Settings button added inside) --- */}
      <header className="App-header">
        {/* Settings Button Now Inside Header */}
        <button
          onClick={toggleSettings}
          className="settings-button" // Apply NEW styles via CSS
          title="Settings"
          aria-label="Open settings menu"
          aria-expanded={isSettingsOpen}
        >
          ⚙️ {/* Consider SVG Icon Here */}
        </button>

        {/* Header Title */}
        <h1>Project Theraphy Dashboard</h1>

        {/* Spacer Div to balance the layout if using space-between */}
        <div className="header-spacer-right"></div>
      </header>

      {/* --- Chatbot Page --- */}
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