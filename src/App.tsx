// src/App.tsx
import { useState, useEffect, ChangeEvent } from 'react';
import './App.css';
import ChatbotPage from './ChatbotPage';

// Define Message interface (includes timestamp)
export interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot' | 'loading';
  timestamp: number;
}

// Define allowed model types (keep if using model selector)
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-1.5-pro' | 'gemini-1.5-flash';

const CHAT_STORAGE_KEY = 'chatMessages';
const BETA_ACCEPTED_KEY = 'betaAccepted';
const MODEL_STORAGE_KEY = 'selectedApiModel';

function App() {
  // --- UPDATED: Messages State Initialization adds Welcome Message ---
  const [messages, setMessages] = useState<Message[]>(() => {
    const savedMessages = localStorage.getItem(CHAT_STORAGE_KEY);
    let initialMessages: Message[] = [];
    try {
      initialMessages = savedMessages && savedMessages !== '[]' ? JSON.parse(savedMessages) : [];
    } catch (e) {
      console.error("Failed to parse messages from localStorage", e);
      localStorage.removeItem(CHAT_STORAGE_KEY); // Clear bad data
      initialMessages = [];
    }

    // If no saved messages, add the welcome message
    if (initialMessages.length === 0) {
      const welcomeMessage: Message = {
        id: Date.now(), // Use current time for ID/timestamp
        text: "Welcome to the Project Theraphy Assistant! How can I help you plan your future, manage stress, or discuss college options today?", // Customize your welcome text
        sender: 'bot',
        timestamp: Date.now()
      };
      return [welcomeMessage]; // Start with only the welcome message
    } else {
      return initialMessages; // Otherwise, return the saved messages
    }
  });
  // --- End Update ---

  // Effect for saving messages (Unchanged)
  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  // Beta Notice State & Logic (Unchanged)
  const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);
  useEffect(() => { const accepted = localStorage.getItem(BETA_ACCEPTED_KEY); if (accepted !== 'true') { setShowBetaNotice(true); } }, []);
  const handleAcceptBeta = () => { localStorage.setItem(BETA_ACCEPTED_KEY, 'true'); setShowBetaNotice(false); };

  // Model Selection State & Persistence (Unchanged)
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(() => { /* ... */ });
  useEffect(() => { /* ... */ }, [selectedModel]);
  const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => { /* ... */ }

  // Function to clear chat (Unchanged)
  const handleClearChat = () => { /* ... */ };

  // JSX (Unchanged)
  return (
    <div className="App">
      {/* Beta Notice Modal */}
      {showBetaNotice && ( /* ... */ )}
      {/* Main App Content */}
      <header className="App-header">
        {/* Model Selector */}
         <div className="model-selector-container">{/* ... */}</div>
        <h1>Project Theraphy Dashboard</h1>
        {/* Clear Chat Button - Adjusted logic slightly to hide if only welcome message exists? Optional. */}
        {messages.length > 1 && (<button onClick={handleClearChat} className="clear-chat-button" title="Clear Chat">🗑️</button>)}
        {/* Or keep original: messages.length > 0 */}
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


// --- FULL STATE/EFFECT/HANDLER LOGIC if user needs full paste ---
function App_Full_Logic_Placeholder() {
    // Messages State (shows updated initial logic)
    const [messages, setMessages] = useState<Message[]>(() => { const savedMessages = localStorage.getItem(CHAT_STORAGE_KEY); let initialMessages: Message[] = []; try { initialMessages = savedMessages && savedMessages !== '[]' ? JSON.parse(savedMessages) : []; } catch (e) { console.error("Failed to parse messages from localStorage", e); localStorage.removeItem(CHAT_STORAGE_KEY); initialMessages = []; } if (initialMessages.length === 0) { const welcomeMessage: Message = { id: Date.now(), text: "Welcome! How can I help?", sender: 'bot', timestamp: Date.now() }; return [welcomeMessage]; } else { return initialMessages; } });
    // Save Effect
    useEffect(() => { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)); }, [messages]);
    // Beta Notice
    const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false); useEffect(() => { const accepted = localStorage.getItem(BETA_ACCEPTED_KEY); if (accepted !== 'true') { setShowBetaNotice(true); } }, []); const handleAcceptBeta = () => { localStorage.setItem(BETA_ACCEPTED_KEY, 'true'); setShowBetaNotice(false); };
    // Model Selector
    const [selectedModel, setSelectedModel] = useState<GeminiModel>(() => { const savedModel = localStorage.getItem(MODEL_STORAGE_KEY); if (savedModel === 'gemini-1.5-pro' || savedModel === 'gemini-2.0-flash' || savedModel === 'gemini-1.5-flash') { return savedModel; } return 'gemini-2.0-flash'; }); useEffect(() => { localStorage.setItem(MODEL_STORAGE_KEY, selectedModel); }, [selectedModel]); const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => { const newModel = event.target.value as GeminiModel; setSelectedModel(newModel); alert(`Model changed to ${newModel}. New chats will use this model.`); }
    // Clear Chat
    const handleClearChat = () => { if (window.confirm("Are you sure you want to clear the chat history?")) { setMessages([]); } };
     return ( <div className="App">{/* JSX as above */}</div> );
}