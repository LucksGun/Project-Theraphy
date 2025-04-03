// src/App.tsx
import React, { useState, useEffect, ChangeEvent } from 'react';
import './App.css'; // Assuming you have this CSS file
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
      localStorage.removeItem(CHAT_STORAGE_KEY);
      initialMessages = [];
    }
    // Set initial welcome message only if chat is truly empty after loading/parsing
    if (initialMessages.length === 0) {
      const welcomeTime = Date.now();
      const welcomeMessage: Message = { id: welcomeTime, text: "Welcome! How can I help you plan your future, manage stress, or discuss college options today?", sender: 'bot', timestamp: welcomeTime };
      return [welcomeMessage];
    } else {
      return initialMessages;
    }
  });
  useEffect(() => {
    // Avoid saving the initial state if it's just the welcome message and nothing else has happened yet
    if (messages.length > 1 || (messages.length === 1 && messages[0].sender !== 'bot')) {
         localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } else if (messages.length === 0) {
         localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)); // Save empty state if cleared
    }
  }, [messages]);

  // Beta Notice State & Logic
  const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);
  useEffect(() => {
    const accepted = localStorage.getItem(BETA_ACCEPTED_KEY);
    if (accepted !== 'true') {
      setShowBetaNotice(true);
    }
  }, []);
  const handleAcceptBeta = () => {
    localStorage.setItem(BETA_ACCEPTED_KEY, 'true');
    setShowBetaNotice(false);
  };

  // Model Selection State & Persistence
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(() => {
    const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
    // Explicitly check for allowed values
    if (savedModel === 'gemini-1.5-pro' || savedModel === 'gemini-2.0-flash' || savedModel === 'gemini-1.5-flash') {
        return savedModel;
    }
    return 'gemini-2.0-flash'; // Default model
  });
  useEffect(() => {
    localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);
  const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => {
      const newModel = event.target.value as GeminiModel;
      setSelectedModel(newModel);
      // Consider if an alert is the best UX, maybe just update state
      // alert(`Model changed to ${newModel}. New chats will use this model.`);
  }

  // STT Language Selection State & Persistence
  const [sttLang, setSttLang] = useState<SpeechLanguage>(() => {
    const savedLang = localStorage.getItem(STT_LANG_STORAGE_KEY);
    // Explicitly check for allowed values
    if (savedLang === 'th-TH' || savedLang === 'es-ES' || savedLang === 'fr-FR') {
        return savedLang;
    }
    return 'en-US'; // Default language
  });
  useEffect(() => {
    localStorage.setItem(STT_LANG_STORAGE_KEY, sttLang);
  }, [sttLang]);
  const handleSttLangChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSttLang(event.target.value as SpeechLanguage);
  }

  // Function to clear chat
  const handleClearChat = () => {
    if (window.confirm("Are you sure you want to clear the entire chat history? This cannot be undone.")) {
      // Clear state which triggers useEffect to clear localStorage
      setMessages([]);
      // Optionally reset to the welcome message immediately
      const welcomeTime = Date.now();
      const welcomeMessage: Message = { id: welcomeTime, text: "Welcome! How can I help you plan your future, manage stress, or discuss college options today?", sender: 'bot', timestamp: welcomeTime };
      setMessages([welcomeMessage]);
      // Clear localStorage directly as well just in case (though useEffect should handle it)
      localStorage.removeItem(CHAT_STORAGE_KEY);
    }
  };

  return (
    <div className="App">
      {/* --- CORRECTED: Beta Notice Modal --- */}
      {showBetaNotice && (
        <div className="beta-notice-overlay">
          <div className="beta-notice-modal">
            <h2>⚠️ Beta Version</h2>
            <p>Welcome! This chatbot is currently in beta. Features may change, and occasional errors might occur. Your feedback is valuable!</p>
            {/* Add a class for styling the button if needed */}
            <button onClick={handleAcceptBeta} className="accept-beta-button">✔️ Accept & Continue</button>
          </div>
        </div>
      )}

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
              {/* Model Selector */}
              <div className="model-selector-container">
                <label htmlFor="model-select">Model:</label>
                <select id="model-select" value={selectedModel} onChange={handleModelChange} className="header-select">
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                </select>
              </div>
          </div>
        <h1>Project Theraphy Dashboard</h1>
        {/* Show clear button only if there are user messages or more than the initial bot message */}
        {(messages.length > 1 || (messages.length === 1 && messages[0].sender === 'user')) && (
          <button onClick={handleClearChat} className="clear-chat-button" title="Clear Chat History">🗑️</button>
        )}
      </header>

      {/* Pass state and setters to ChatbotPage */}
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