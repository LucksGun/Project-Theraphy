// src/App.tsx
import { useState, useEffect, ChangeEvent } from 'react'; // Keep specific hooks
// import React from 'react'; // REMOVED this line
import './App.css';
import ChatbotPage from './ChatbotPage';

// Define Message interface here
export interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot' | 'loading';
  timestamp: number;
}

// Define allowed model types
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-1.5-pro';

const CHAT_STORAGE_KEY = 'chatMessages';
const BETA_ACCEPTED_KEY = 'betaAccepted';
const MODEL_STORAGE_KEY = 'selectedApiModel';

function App() {
  // Messages State & Persistence
  const [messages, setMessages] = useState<Message[]>(() => {
    const savedMessages = localStorage.getItem(CHAT_STORAGE_KEY);
    try {
      return savedMessages && savedMessages !== '[]' ? JSON.parse(savedMessages) : [];
    } catch (e) {
      console.error("Failed to parse messages from localStorage", e);
      localStorage.removeItem(CHAT_STORAGE_KEY);
      return [];
    }
  });
  useEffect(() => { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)); }, [messages]);

  // Beta Notice State & Logic
  const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);
  useEffect(() => { const accepted = localStorage.getItem(BETA_ACCEPTED_KEY); if (accepted !== 'true') { setShowBetaNotice(true); } }, []);
  const handleAcceptBeta = () => { localStorage.setItem(BETA_ACCEPTED_KEY, 'true'); setShowBetaNotice(false); };

  // Model Selection State & Persistence
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(() => {
    const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
    if (savedModel === 'gemini-1.5-pro' || savedModel === 'gemini-2.0-flash') { return savedModel; }
    return 'gemini-2.0-flash';
  });
  useEffect(() => { localStorage.setItem(MODEL_STORAGE_KEY, selectedModel); }, [selectedModel]);
  const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => {
      const newModel = event.target.value as GeminiModel;
      setSelectedModel(newModel);
      alert(`Model changed to ${newModel}. New chats will use this model.`);
  }

  // Function to clear chat
  const handleClearChat = () => { if (window.confirm("Are you sure you want to clear the chat history?")) { setMessages([]); } };

  return (
    <div className="App">
      {/* Beta Notice Modal */}
      {showBetaNotice && ( <div className="beta-notice-overlay"><div className="beta-notice-modal"><h2>⚠️ Beta Version</h2><p>Welcome! This is an early version of Project Theraphy.</p><p>You may encounter bugs or incomplete features. Your patience and feedback are appreciated!</p><button onClick={handleAcceptBeta} className="beta-accept-button">✔️ Accept & Continue</button></div></div>)}
      {/* Main App Content */}
      <header className="App-header">
        <div className="model-selector-container">
            <label htmlFor="model-select">Model: </label>
            <select id="model-select" value={selectedModel} onChange={handleModelChange} className="model-select">
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
            </select>
         </div>
        <h1>Project Theraphy Dashboard</h1>
        {messages.length > 0 && (<button onClick={handleClearChat} className="clear-chat-button" title="Clear Chat">🗑️</button>)}
      </header>
      <ChatbotPage
        messages={messages}
        setMessages={setMessages}
        selectedModel={selectedModel}
       />
    </div>
  );
}

export default App;