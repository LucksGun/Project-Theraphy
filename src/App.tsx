// src/App.tsx
import { useState, useEffect } from 'react'; // Import hooks
import './App.css';
import ChatbotPage from './ChatbotPage';

// Define Message interface here (or import from a types file)
export interface Message { // Export it if ChatbotPage needs it directly for props
  id: number;
  text: string;
  sender: 'user' | 'bot' | 'loading';
}

const STORAGE_KEY = 'chatMessages'; // Key for localStorage

function App() {
  // --- State moved from ChatbotPage to App ---
  const [messages, setMessages] = useState<Message[]>(() => {
    const savedMessages = localStorage.getItem(STORAGE_KEY);
    try {
      return savedMessages ? JSON.parse(savedMessages) : [];
    } catch (e) {
      console.error("Failed to parse messages from localStorage", e);
      return [];
    }
  });
  // --- End moved state ---

  // --- Effect moved from ChatbotPage to App ---
  useEffect(() => {
    if (messages.length > 0 || localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
     // If messages are cleared, remove from storage too
     if (messages.length === 0 && localStorage.getItem(STORAGE_KEY)) {
        localStorage.removeItem(STORAGE_KEY);
     }
  }, [messages]);
  // --- End moved effect ---

  // Function to clear chat
  const handleClearChat = () => {
    if (window.confirm("Are you sure you want to clear the chat history?")) {
       setMessages([]); // Clear the messages state
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Project Theraphy Dashboard</h1>
        {/* Add Clear Chat button here */}
        {messages.length > 0 && ( // Only show button if there are messages
           <button onClick={handleClearChat} className="clear-chat-button">
              Clear Chat
           </button>
        )}
      </header>
      {/* Pass messages and setMessages down as props */}
      <ChatbotPage messages={messages} setMessages={setMessages} />
    </div>
  );
}

export default App;