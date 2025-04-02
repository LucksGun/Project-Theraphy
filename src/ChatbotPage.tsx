// src/ChatbotPage.tsx
import React, { useState, useRef, useEffect } from 'react';

// Define interface for message objects
interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot' | 'loading'; // Add 'loading' type
}

// Define the Worker URL - Using the one you provided
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';

// --- NEW: Function to call the Cloudflare Worker ---
async function getBotResponse(userInput: string): Promise<string> {
  console.log('Sending prompt to Worker:', userInput);
  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: userInput }), // Send prompt in correct format
    });

    if (!response.ok) {
      // Try to get error message from worker response body
      const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      // Handle errors returned by the worker/API
      throw new Error(data.error);
    }

    console.log('Received reply from Worker:', data.reply);
    return data.reply || 'Sorry, I received an empty reply.'; // Return the reply

  } catch (error) {
    console.error('Error fetching bot response:', error);
    // Re-throw the error or return a specific error message
    if (error instanceof Error) {
      return `Error: ${error.message}`;
    }
    return 'Error: Could not fetch response.';
  }
}
// --- End NEW function ---


function ChatbotPage() {
  const [input, setInput] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false); // Add loading state
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (input.trim() === '' || isLoading) return; // Prevent sending empty or while loading

    const userMessageText = input.trim();

    const newUserMessage: Message = {
      id: Date.now(),
      text: userMessageText,
      sender: 'user',
    };

    // Add user message and a temporary loading message
    setMessages((prevMessages) => [
        ...prevMessages,
        newUserMessage,
        { id: Date.now() + 1, text: 'Bot is typing...', sender: 'loading' } // Add loading indicator
    ]);
    setInput(''); // Clear input field
    setIsLoading(true); // Set loading state

    let botResponseText = '';
    try {
      // Get response from the Cloudflare worker
      botResponseText = await getBotResponse(userMessageText);
    } catch (error) {
        console.error("Failed to get bot response:", error);
        if (error instanceof Error) {
           botResponseText = `Error: ${error.message}`;
        } else {
           botResponseText = "An unknown error occurred.";
        }
    } finally {
       // Create the final bot message (either response or error)
       const newBotMessage: Message = {
          id: Date.now() + 2, // Ensure unique ID
          text: botResponseText,
          sender: 'bot', // Mark as bot even if it's an error message for styling
       };

       // Remove the loading message and add the final bot message
       setMessages((prevMessages) => [
           ...prevMessages.filter(msg => msg.sender !== 'loading'), // Remove loading message
           newBotMessage
       ]);
       setIsLoading(false); // Clear loading state
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  };

   const handleKeyPress = (event: React.KeyboardEvent) => {
    // Prevent sending if Shift+Enter is pressed (allow newlines)
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); // Prevent newline in input
      handleSend();
    }
  };

  return (
    <div className="chatbot-container">
      <div className="chatbot-messages">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.sender}`}>
             {/* Style the loading message differently if needed */}
             {message.sender === 'loading' ? (
                <i>{message.text}</i>
             ) : (
                <p>{message.text}</p>
             )}
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
          disabled={isLoading} // Disable input while loading
        />
        <button onClick={handleSend} disabled={isLoading}> {/* Disable button while loading */}
            {isLoading ? '...' : 'Send'} {/* Change button text while loading */}
        </button>
      </div>
    </div>
  );
}

export default ChatbotPage;