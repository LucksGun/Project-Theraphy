// src/ChatbotPage.tsx
import React, { useState, useRef, useEffect } from 'react'; // Import useRef and useEffect

// Define a simple interface for message objects
interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
}

// Simulates fetching a response from a bot backend
async function getBotResponse(userInput: string): Promise<string> {
  console.log('Simulating bot response for:', userInput);
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 750)); // Wait 750ms

  // Simple echo logic for now - replace with real logic later
  return `You told me: "${userInput}"`;
}


function ChatbotPage() {
  // State to hold the user's current input
  const [input, setInput] = useState<string>('');
  // State to hold the list of chat messages
  const [messages, setMessages] = useState<Message[]>([]);
  // Ref for the messages container end div
  const messagesEndRef = useRef<HTMLDivElement>(null); // Add this ref

  // Function to scroll to the bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); // Use smooth scrolling
  };

  // useEffect hook to scroll down when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]); // Dependency array includes messages

  // Function to handle sending a message
  const handleSend = async () => { // Make the function async
    if (input.trim() === '') return;

    const userMessageText = input.trim(); // Store user text before clearing input

    const newUserMessage: Message = {
      id: Date.now(),
      text: userMessageText,
      sender: 'user',
    };

    // Add user message to state immediately
    // Use functional update to ensure we have the latest state if updates batch
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);
    setInput(''); // Clear input field

    // --- Simulate getting a bot response ---
    try {
      // Get a response from our placeholder function (can be replaced later)
      const botResponseText = await getBotResponse(userMessageText);

      const newBotMessage: Message = {
        id: Date.now() + 1, // Ensure unique ID
        text: botResponseText,
        sender: 'bot',
      };

      // Add bot message to state after a short delay (handled in getBotResponse)
      setMessages((prevMessages) => [...prevMessages, newBotMessage]);

    } catch (error) {
        console.error("Error getting bot response:", error);
        // Optionally add an error message to the chat
        const errorMessage: Message = {
             id: Date.now() + 1,
             text: "Sorry, I encountered an error.",
             sender: 'bot',
        }
         setMessages((prevMessages) => [...prevMessages, errorMessage]);
    }
    // --- End simulation ---
  };

  // Function to update the input state as the user types
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  };

   // Allow sending with Enter key
   const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="chatbot-container">
      <div className="chatbot-messages">
        {/* Display messages here */}
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.sender}`}>
            {/* Wrap text in a paragraph or span for better structure if needed */}
            <p>{message.text}</p>
          </div>
        ))}
         {/* Add this empty div at the end for the ref */}
         <div ref={messagesEndRef} />
      </div>
      <div className="chatbot-input-area">
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress} // Send on Enter
          placeholder="Type your message..."
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}

export default ChatbotPage;