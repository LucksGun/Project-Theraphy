// src/App.tsx
import { useState, useEffect } from 'react';
import './App.css';
import ChatbotPage from './ChatbotPage';

// Define Message interface here
export interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot' | 'loading';
}

const CHAT_STORAGE_KEY = 'chatMessages'; // Key for chat localStorage
const BETA_ACCEPTED_KEY = 'betaAccepted'; // Key for beta notice localStorage

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
      // If not accepted, show the notice
      setShowBetaNotice(true);
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  const handleAcceptBeta = () => {
    localStorage.setItem(BETA_ACCEPTED_KEY, 'true'); // Remember acceptance
    setShowBetaNotice(false); // Hide the modal
  };
  // --- End Beta Notice Logic ---


  // Function to clear chat
  const handleClearChat = () => {
    if (window.confirm("Are you sure you want to clear the chat history?")) {
       setMessages([]); // Clear the messages state (useEffect handles storage update)
    }
  };


  return (
    <div className="App">
      {/* --- Beta Notice Modal (Renders conditionally) --- */}
      {showBetaNotice && (
        <div className="beta-notice-overlay">
          <div className="beta-notice-modal">
            <h2>⚠️ Beta Version</h2> {/* Added warning emoji */}
            <p>Welcome! This is an early version of Project Theraphy.</p>
            <p>You may encounter bugs or incomplete features. Your patience and feedback are appreciated!</p>
            <button onClick={handleAcceptBeta} className="beta-accept-button">
              ✔️ Accept & Continue
            </button>
          </div>
        </div>
      )}
      {/* --- End Beta Notice --- */}

      {/* Main App Content (Only rendered visually 'behind' the modal if shown) */}
      <header className="App-header">
        <h1>Project Theraphy Dashboard</h1>
        {messages.length > 0 && (
           <button onClick={handleClearChat} className="clear-chat-button" title="Clear Chat">
              🗑️
           </button>
        )}
      </header>
      <ChatbotPage messages={messages} setMessages={setMessages} />
    </div>
  );
}

export default App;