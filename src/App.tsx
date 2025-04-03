// src/App.tsx
import React, { useState, useEffect, ChangeEvent } from 'react';
import './App.css';
import ChatbotPage from './ChatbotPage';

// Define Message interface here
export interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot' | 'loading';
  timestamp: number; // Keep timestamp
}

// Define allowed model types
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-1.5-pro';

const CHAT_STORAGE_KEY = 'chatMessages'; // Key for chat localStorage
const BETA_ACCEPTED_KEY = 'betaAccepted'; // Key for beta notice localStorage
const MODEL_STORAGE_KEY = 'selectedApiModel'; // Key for model choice localStorage

function App() {
  // --- Messages State & Persistence ---
  const [messages, setMessages] = useState<Message[]>(() => {
    const savedMessages = localStorage.getItem(CHAT_STORAGE_KEY);
    try {
      return savedMessages && savedMessages !== '[]' ? JSON.parse(savedMessages) : [];
    } catch (e) {
      console.error("Failed to parse messages from localStorage", e);
      localStorage.removeItem(CHAT_STORAGE_KEY); // Clear bad data
      return [];
    }
  });

  useEffect(() => {
    // Save messages whenever they change
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);
  // --- End Messages State & Persistence ---


  // --- Beta Notice State & Logic ---
  const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);

  useEffect(() => {
    // Check if user has already accepted the beta notice on initial load
    const accepted = localStorage.getItem(BETA_ACCEPTED_KEY);
    if (accepted !== 'true') {
      setShowBetaNotice(true); // If not accepted, show the notice
    }
  }, []); // Runs once on mount

  const handleAcceptBeta = () => {
    localStorage.setItem(BETA_ACCEPTED_KEY, 'true');
    setShowBetaNotice(false);
  };
  // --- End Beta Notice Logic ---


  // --- Model Selection State & Persistence ---
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(() => {
    const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
    if (savedModel === 'gemini-1.5-pro' || savedModel === 'gemini-2.0-flash') {
        return savedModel; // Return saved valid model
    }
    return 'gemini-2.0-flash'; // Default to flash
  });

  useEffect(() => {
      // Save model choice whenever it changes
      localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => {
      const newModel = event.target.value as GeminiModel;
      setSelectedModel(newModel);
      // Optional: Provide feedback or clear chat
      alert(`Model changed to ${newModel}. New chats will use this model.`);
      // setMessages([]); // Uncomment to clear chat on model switch
  }
  // --- End Model Selection ---


  // Function to clear chat
  const handleClearChat = () => {
    if (window.confirm("Are you sure you want to clear the chat history?")) {
       setMessages([]);
    }
  };


  return (
    <div className="App">
      {/* Beta Notice Modal */}
      {showBetaNotice && (
        <div className="beta-notice-overlay">
          <div className="beta-notice-modal">
            <h2>⚠️ Beta Version</h2>
            <p>Welcome! This is an early version of Project Theraphy.</p>
            <p>You may encounter bugs or incomplete features. Your patience and feedback are appreciated!</p>
            <button onClick={handleAcceptBeta} className="beta-accept-button">
              ✔️ Accept & Continue
            </button>
          </div>
        </div>
      )}

      {/* Main App Content */}
      <header className="App-header">
        {/* Model Selector */}
         <div className="model-selector-container">
            <label htmlFor="model-select">Model: </label>
            <select id="model-select" value={selectedModel} onChange={handleModelChange} className="model-select">
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
            </select>
         </div>
        <h1>Project Theraphy Dashboard</h1>
        {/* Clear Chat Button */}
        {messages.length > 0 && (
           <button onClick={handleClearChat} className="clear-chat-button" title="Clear Chat">
              🗑️
           </button>
        )}
      </header>
      {/* Chatbot Page Component */}
      <ChatbotPage
        messages={messages}
        setMessages={setMessages}
        selectedModel={selectedModel} // Pass down selected model
       />
    </div>
  );
}

export default App;