// src/App.tsx
import { useState, useEffect, ChangeEvent } from 'react';
import './App.css';
import ChatbotPage from './ChatbotPage';

// Define Message interface (must match ChatbotPage usage)
export interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot' | 'loading';
  timestamp: number; // Timestamp is included
}

// Define Speech Language type
export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR'; // Add more as needed

// localStorage Keys
const CHAT_STORAGE_KEY = 'chatMessages';
const BETA_ACCEPTED_KEY = 'betaAccepted';
const STT_LANG_STORAGE_KEY = 'selectedSttLang';

function App() {
  // --- Messages State & Persistence ---
  const [messages, setMessages] = useState<Message[]>(() => {
    const savedMessages = localStorage.getItem(CHAT_STORAGE_KEY);
    let initialMessages: Message[] = [];
    try {
      initialMessages = savedMessages && savedMessages !== '[]' ? JSON.parse(savedMessages) : [];
       // Basic validation: ensure it's an array
       if (!Array.isArray(initialMessages)) {
         console.warn("Loaded messages not an array, resetting.");
         initialMessages = [];
         localStorage.removeItem(CHAT_STORAGE_KEY);
       }
    } catch (e) {
      console.error("Failed to parse messages from localStorage", e);
      localStorage.removeItem(CHAT_STORAGE_KEY);
      initialMessages = [];
    }
    // Add welcome message if history is empty after loading/parsing
    if (initialMessages.length === 0) {
      const welcomeTime = Date.now();
      const welcomeMessage: Message = {
        id: welcomeTime,
        text: "Welcome to the Project Theraphy Assistant! How can I help you plan your future, manage stress, or discuss college options today?",
        sender: 'bot',
        timestamp: welcomeTime
      };
      return [welcomeMessage];
    } else {
      return initialMessages;
    }
  });

  useEffect(() => {
    // Save messages whenever they change
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);
  // --- End Messages State ---


  // --- Beta Notice State & Logic ---
  const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);
  useEffect(() => {
    const accepted = localStorage.getItem(BETA_ACCEPTED_KEY);
    if (accepted !== 'true') {
      setShowBetaNotice(true);
    }
  }, []); // Runs once on mount
  const handleAcceptBeta = () => {
    localStorage.setItem(BETA_ACCEPTED_KEY, 'true');
    setShowBetaNotice(false);
  };
  // --- End Beta Notice ---


  // --- STT Language Selection State & Persistence ---
  const [sttLang, setSttLang] = useState<SpeechLanguage>(() => {
    const savedLang = localStorage.getItem(STT_LANG_STORAGE_KEY);
    // Add checks for all languages you support
    if (savedLang === 'th-TH' || savedLang === 'es-ES' || savedLang === 'fr-FR') {
        return savedLang;
    }
    return 'en-US'; // Default
  });

  useEffect(() => {
      localStorage.setItem(STT_LANG_STORAGE_KEY, sttLang);
  }, [sttLang]);

  const handleSttLangChange = (event: ChangeEvent<HTMLSelectElement>) => {
      setSttLang(event.target.value as SpeechLanguage);
      // Optionally provide feedback
      // alert(`Speech input language changed to ${event.target.value}`);
  }
  // --- End STT Language ---


  // Function to clear chat
  const handleClearChat = () => {
    if (window.confirm("Are you sure you want to clear the entire chat history?")) {
       setMessages([]); // Clear state (useEffect will clear localStorage)
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
         <div className="header-controls">
             {/* STT Language Selector */}
             <div className="stt-lang-selector-container">
                <label htmlFor="stt-lang-select">Speak:</label>
                <select id="stt-lang-select" value={sttLang} onChange={handleSttLangChange} className="header-select">
                    <option value="en-US">English (US)</option>
                    <option value="th-TH">ไทย (Thai)</option>
                    <option value="es-ES">Español (España)</option>
                    <option value="fr-FR">Français (France)</option>
                    {/* Add more supported languages here */}
                </select>
             </div>
         </div>

        <h1>Project Theraphy Dashboard</h1>

        {/* Clear Chat Button - Show only if more than just the welcome message exists */}
        {messages.length > 1 && (
           <button onClick={handleClearChat} className="clear-chat-button" title="Clear Chat">
              🗑️
           </button>
        )}
      </header>
      {/* Pass necessary state and functions down */}
      <ChatbotPage
        messages={messages}
        setMessages={setMessages}
        sttLang={sttLang} // Pass STT language
       />
    </div>
  );
}

export default App;