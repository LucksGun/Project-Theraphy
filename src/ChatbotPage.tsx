// src/ChatbotPage.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Message } from './App'; // Import Message type from App.tsx

// Define the Worker URL
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';

// Define props interface for ChatbotPage
interface ChatbotPageProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

// Function to call the Cloudflare Worker (keep this the same)
async function getBotResponse(userInput: string): Promise<string> {
  console.log('Sending prompt to Worker:', userInput);
  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', },
      body: JSON.stringify({ prompt: userInput }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (data.error) { throw new Error(data.error); }
    console.log('Received reply from Worker:', data.reply);
    return data.reply || 'Sorry, I received an empty reply.';
  } catch (error) {
    console.error('Error fetching bot response:', error);
    if (error instanceof Error) { return `Error: ${error.message}`; }
    return 'Error: Could not fetch response.';
  }
}

// Accept props: messages, setMessages
function ChatbotPage({ messages, setMessages }: ChatbotPageProps) {
  // Remove local messages state - use props instead
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Effect for scrolling (keep this)
  useEffect(() => {
    setTimeout(scrollToBottom, 0);
  }, [messages]);

  // Remove localStorage effect - it's now in App.tsx

  const handleSend = async () => {
    if (input.trim() === '' || isLoading) return;

    const userMessageText = input.trim();
    const newUserMessage: Message = { id: Date.now(), text: userMessageText, sender: 'user' };

    // Update messages using the setMessages function from props
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);
    setInput('');
    setIsLoading(true);

    setMessages((prevMessages) => [...prevMessages, { id: Date.now() + 1, text: 'Bot is typing...', sender: 'loading' }]);

    let botResponseText = '';
    try {
      botResponseText = await getBotResponse(userMessageText);
    } catch (error) {
        console.error("Failed to get bot response:", error);
        if (error instanceof Error) { botResponseText = `Error: ${error.message}`; }
        else { botResponseText = "An unknown error occurred."; }
    } finally {
       const newBotMessage: Message = { id: Date.now() + 2, text: botResponseText, sender: 'bot' };
       // Update messages using the setMessages function from props
       setMessages((prevMessages) => [
           ...prevMessages.filter(msg => msg.sender !== 'loading'),
           newBotMessage
       ]);
       setIsLoading(false);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  };

   const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  // Render using messages from props
  return (
    <div className="chatbot-container">
      <div className="chatbot-messages">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.sender}`}>
             {message.sender === 'loading' ? ( <i>{message.text}</i> ) : ( <p>{message.text}</p> )}
          </div>
        ))}
         <div ref={messagesEndRef} />
      </div>
      <div className="chatbot-input-area">
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          disabled={isLoading}
        />
        <button onClick={handleSend} disabled={isLoading}>
            {isLoading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

export default ChatbotPage;