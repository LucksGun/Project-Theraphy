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

const STORAGE_KEY = 'chatMessages';

function App() {
  // State lives in App
  const [messages, setMessages] = useState<Message[]>(() => {
    const savedMessages = localStorage.getItem(STORAGE_KEY);
    try {
      return savedMessages ? JSON.parse(savedMessages) : [];
    } catch (e) {
      console.error("Failed to parse messages from localStorage", e);
      return [];
    }
  });

  // Effect for saving lives in App
  useEffect(() => {
    if (messages.length > 0 || localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
     if (messages.length === 0 && localStorage.getItem(STORAGE_KEY)) {
        localStorage.removeItem(STORAGE_KEY);
     }
  }, [messages]);

  // Function to clear chat lives in App
  const handleClearChat = () => {
    if (window.confirm("Are you sure you want to clear the chat history?")) {
       setMessages([]);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Project Theraphy Dashboard</h1>
        {messages.length > 0 && (
           /* --- UPDATED: Use emoji and add title --- */
           <button onClick={handleClearChat} className="clear-chat-button" title="Clear Chat">
              🗑️
           </button>
        )}
      </header>
      {/* Pass messages and setMessages down as props */}
      <ChatbotPage messages={messages} setMessages={setMessages} />
    </div>
  );
}

export default App;