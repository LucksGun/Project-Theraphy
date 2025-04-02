// src/ChatbotPage.tsx
import React, { useState } from 'react'; // Import React and useState hook

// Define a simple interface for message objects (optional but good practice)
interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
}

function ChatbotPage() {
  // State to hold the user's current input
  const [input, setInput] = useState<string>('');
  // State to hold the list of chat messages (start empty)
  const [messages, setMessages] = useState<Message[]>([]);

  // Function to handle sending a message
  const handleSend = () => {
    if (input.trim() === '') return; // Don't send empty messages

    const newMessage: Message = {
      id: Date.now(), // Simple unique ID for now
      text: input,
      sender: 'user',
    };

    // Add the user's message to the messages array
    setMessages([...messages, newMessage]);

    // TODO: Add logic here later to get a bot response

    setInput(''); // Clear the input field
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
            <p>{message.text}</p>
          </div>
        ))}
         {/* TODO: Add auto-scrolling later */}
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