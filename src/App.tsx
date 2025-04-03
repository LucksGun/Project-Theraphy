// src/App.tsx
import React, { useState, useEffect, ChangeEvent } from 'react';
import './App.css';
import ChatbotPage from './ChatbotPage';

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
const MODEL_STORAGE_KEY = 'selectedApiModel'; // Key for model choice
const STT_LANG_STORAGE_KEY = 'selectedSttLang'; // Key for STT language

function App() {
  // Messages State & Persistence
  const [messages, setMessages] = useState<Message[]>(() => {
    const savedMessages = localStorage.getItem(CHAT_STORAGE_KEY);
    let initialMessages: Message[] = [];
    try {
      initialMessages = savedMessages && savedMessages !== '[]' ? JSON.parse(savedMessages) : [];
      if (!Array.isArray(initialMessages)) { throw new Error("Parsed data not an array"); }
    } catch (e) {
      console.error("Failed to parse messages from localStorage", e);
      localStorage.removeItem(CHAT_STORAGE_KEY); initialMessages = [];
    }
    if (initialMessages.length === 0) {
      const welcomeTime = Date.now();
      const welcomeMessage: Message = { id: welcomeTime, text: "Welcome! How can I help you plan your future, manage stress, or discuss college options today?", sender: 'bot', timestamp: welcomeTime };
      return [welcomeMessage];
    } else { return initialMessages; }
  });
  useEffect(() => { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)); }, [messages]);

  // Beta Notice State & Logic
  const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);
  useEffect(() => { const accepted = localStorage.getItem(BETA_ACCEPTED_KEY); if (accepted !== 'true') { setShowBetaNotice(true); } }, []);
  const handleAcceptBeta = () => { localStorage.setItem(BETA_ACCEPTED_KEY, 'true'); setShowBetaNotice(false); };

  // --- RE-ADD: Model Selection State & Persistence ---
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(() => {
    const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
    if (savedModel === 'gemini-1.5-pro' || savedModel === 'gemini-2.0-flash' || savedModel === 'gemini-1.5-flash') {
        return savedModel;
    }
    return 'gemini-2.0-flash'; // Default
  });
  useEffect(() => { localStorage.setItem(MODEL_STORAGE_KEY, selectedModel); }, [selectedModel]);
  const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => {
      const newModel = event.target.value as GeminiModel;
      setSelectedModel(newModel);
      alert(`Model changed to ${newModel}. New chats will use this model.`);
  }
  // --- End Re-Add ---

  // STT Language Selection State & Persistence
  const [sttLang, setSttLang] = useState<SpeechLanguage>(() => {
    const savedLang = localStorage.getItem(STT_LANG_STORAGE_KEY);
    if (savedLang === 'th-TH' || savedLang === 'es-ES' || savedLang === 'fr-FR') { return savedLang; }
    return 'en-US';
  });
  useEffect(() => { localStorage.setItem(STT_LANG_STORAGE_KEY, sttLang); }, [sttLang]);
  const handleSttLangChange = (event: ChangeEvent<HTMLSelectElement>) => { setSttLang(event.target.value as SpeechLanguage); }

  // Function to clear chat
  const handleClearChat = () => { if (window.confirm("Are you sure you want to clear the entire chat history?")) { setMessages([]); } };

  return (
    <div className="App">
      {/* Beta Notice Modal */}
      {showBetaNotice && ( /* ... Modal JSX ... */ )}

      <header className="App-header">
         <div className="header-controls">
             {/* STT Language Selector */}
             <div className="stt-lang-selector-container">
                <label htmlFor="stt-lang-select">Speak:</label>
                <select id="stt-lang-select" value={sttLang} onChange={handleSttLangChange} className="header-select">
                    <option value="en-US">English (US)</option>
                    <option value="th-TH">ไทย (Thai)</option>
                    <option value="es-ES">Español (España)</option>
                    <option value="fr-FR">Français (France)</option>
                </select>
             </div>
             {/* --- RE-ADD: Model Selector --- */}
             <div className="model-selector-container">
                <label htmlFor="model-select">Model:</label>
                <select id="model-select" value={selectedModel} onChange={handleModelChange} className="header-select">
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                </select>
             </div>
             {/* --- End Re-Add --- */}
         </div>
        <h1>Project Theraphy Dashboard</h1>
        {messages.length > 1 && (<button onClick={handleClearChat} className="clear-chat-button" title="Clear Chat">🗑️</button>)}
      </header>
      {/* Pass selectedModel prop */}
      <ChatbotPage
        messages={messages}
        setMessages={setMessages}
        selectedModel={selectedModel}
        sttLang={sttLang}
       />
    </div>
  );
}
// Beta Modal JSX (ensure included)
// {showBetaNotice && ( <div className="beta-notice-overlay"><div className="beta-notice-modal"><h2>⚠️ Beta Version</h2><p>Welcome! ...</p><button onClick={handleAcceptBeta} ...>✔️ Accept & Continue</button></div></div>)}

export default App;