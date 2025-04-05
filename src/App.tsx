// src/App.tsx - SIMPLIFIED for debugging fetch issues

import React, { useState, useEffect, ChangeEvent } from 'react';
import './App.css'; // Keep basic CSS
import ChatbotPage from './ChatbotPage'; // Keep ChatbotPage

// --- Types --- (Keep necessary ones)
export interface Message { id: number; text: string; sender: 'user' | 'bot' | 'loading'; timestamp: number; imageUrl?: string; modelUsed?: string; username?: string; } // Add modelUsed/username for simplified response
export type GeminiModel = string; // Use generic string for model type in simplified version
export type Persona = string; // Use generic string
export type SpeechLanguage = string; // Use generic string

const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';

function App() {
  // --- Basic State ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false); // Add loading state

  // Add initial welcome message
  useEffect(() => {
      setMessages([{ id: Date.now(), text: "Welcome! (Simplified Debug Mode)", sender: 'bot', timestamp: Date.now() }]);
  }, []);


  // --- Simplified Send Function (Now inside App) ---
  const handleSendMessage = async (userInput: string) => {
    if (!userInput.trim() || isLoading) return;

    const userTimestamp = Date.now();
    const userMessage: Message = { id: userTimestamp, text: userInput, sender: 'user', timestamp: userTimestamp };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const loadingTimestamp = Date.now() + 1;
    const loadingMessage: Message = { id: loadingTimestamp, text: '...', sender: 'loading', timestamp: loadingTimestamp };
    setMessages(prev => [...prev, loadingMessage]);

    let botText = "Error: Failed to get response."; // Default error
    let modelUsed = undefined;
    let username = undefined;

    try {
      console.log(`Sending simple request with prompt: ${userInput}`);
      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send minimal data for this test
        body: JSON.stringify({ prompt: userInput, action: 'chat' })
      });

      const data = await response.json().catch(() => { throw new Error(`Invalid JSON Response Status: ${response.status}`)});

      if (!response.ok) {
        throw new Error(data?.error || `HTTP Error: ${response.status}`);
      }

      botText = data.reply || "No reply content.";
      modelUsed = data.modelUsed; // Get from simplified worker response
      username = data.username; // Get from simplified worker response

    } catch (error) {
      console.error("handleSendMessage Error:", error);
      botText = error instanceof Error ? `Error: ${error.message}` : "An unknown error occurred.";
    } finally {
      setIsLoading(false);
      const botTimestamp = Date.now() + 2;
      const botMessage: Message = {
        id: botTimestamp,
        text: botText,
        sender: 'bot',
        timestamp: botTimestamp,
        modelUsed: modelUsed, // Add extra info if needed
        username: username
      };
       // Use functional update to ensure correct state based on previous
      setMessages(prev => [...prev.filter(m => m.id !== loadingTimestamp), botMessage]);
    }
  };


  // --- Simplified JSX ---
  return (
    <div className="App">
      {/* Removed all modals and complex settings for now */}
      <header className="App-header">
        <h1>Project Theraphy (Debug Mode)</h1>
      </header>

      {/* Use ChatbotPage but pass the simplified handler */}
      {/* Note: ChatbotPage might show warnings about unused props now */}
      <ChatbotPage
        messages={messages}
        setMessages={setMessages}
        // Pass dummy values or handle simplification within ChatbotPage if needed
        selectedModel={"debug-model" as GeminiModel}
        sttLang={"en-US" as SpeechLanguage}
        selectedPersona={"debug-persona" as Persona}
        accessKey={"debug-key"}
        // We need to pass the send function differently or modify ChatbotPage
        // For now, let's assume ChatbotPage has an onSendMessage prop (needs modification)
        // OR we move the input handling here temporarily
      />

      {/* Temporary Input Area Here for Simplicity */}
      <TempInputArea onSend={handleSendMessage} isLoading={isLoading} />

    </div>
  );
}

// Temporary Input Component directly in App.tsx
function TempInputArea({ onSend, isLoading }: { onSend: (text: string) => void, isLoading: boolean }) {
    const [input, setInput] = useState('');

    const handleSendClick = () => {
        if (input.trim()) {
            onSend(input.trim());
            setInput('');
        }
    };

    const handleKeyPress = (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendClick();
      }
    };

    return (
        <div className="chatbot-input-area">
           <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type message..."
                disabled={isLoading}
                aria-label="Chat input"
            />
             <button
                onClick={handleSendClick}
                disabled={isLoading || !input.trim()}
                title="Send message"
                aria-label="Send message"
             >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="1.2em" height="1.2em" aria-hidden="true">
                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                </svg>
            </button>
        </div>
    );
}


export default App;