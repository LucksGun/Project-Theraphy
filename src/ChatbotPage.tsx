// src/ChatbotPage.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message } from './App'; // Import Message type from App.tsx

// Define the Worker URL
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';
const STORAGE_KEY = 'chatMessages';

// --- New Helper Function: Read File as Base64 ---
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result contains the Data URL string (e.g., "data:image/jpeg;base64,...")
      resolve(reader.result as string);
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsDataURL(file); // Read the file as Data URL (contains base64)
  });
}
// --- End Helper Function ---


// --- Updated: Function signature changed, but fetch logic still text-only for now ---
// It now accepts imageData object but only logs it, doesn't send yet.
async function getBotResponse(
    userInput: string,
    imageData: { type: string; dataUrl: string } | null // Changed to dataUrl
): Promise<string> {

  // We'll only send text until the worker is updated
  const promptToSend = userInput || (imageData ? "Describe this image." : "");

  if (!promptToSend) {
      return "Please type a message or upload an image.";
  }

  // Log if image data is present (for testing the base64 conversion)
  if (imageData) {
      console.log('Image ready to send (not sending yet):', {
          mimeType: imageData.type,
          // Optionally log a small part of the base64 to confirm it's there
          base64Preview: imageData.dataUrl.substring(0, 100) + '...'
      });
  }

  console.log('Sending text prompt to Worker:', promptToSend);
  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', },
      // Sending only text prompt for now - THIS WILL CHANGE LATER
      body: JSON.stringify({ prompt: promptToSend }),
    });
    // ... (rest of existing fetch logic remains the same) ...
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
// --- End Updated function ---


// Component definition starts (props interface, etc. - keep as before)
interface ChatbotPageProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

function ChatbotPage({ messages, setMessages }: ChatbotPageProps) {
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    setTimeout(scrollToBottom, 100);
  }, [messages, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);


  // --- Updated handleSend function ---
  const handleSend = async () => {
    if ((input.trim() === '' && !selectedImage) || isLoading) return;

    const userMessageText = input.trim();
    const imageToSend = selectedImage; // Capture image before clearing state
    let imageDataForApi: { type: string; dataUrl: string } | null = null; // Prepare structure

    // Add user message to UI first
    const newUserMessage: Message = {
        id: Date.now(),
        text: userMessageText + (imageToSend ? ' (+image)' : ''),
        sender: 'user'
    };
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);

    // Clear inputs now
    setInput('');
    setSelectedImage(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    setIsLoading(true);
    setMessages((prevMessages) => [...prevMessages, { id: Date.now() + 1, text: 'Bot is typing...', sender: 'loading' }]);

    // --- New: Convert image to base64 if it exists ---
    if (imageToSend) {
        try {
            const base64String = await readFileAsBase64(imageToSend);
            imageDataForApi = { type: imageToSend.type, dataUrl: base64String };
        } catch (error) {
            console.error("Error reading file:", error);
            // Handle error - maybe show error message in chat?
             setMessages((prevMessages) => [
               ...prevMessages.filter(msg => msg.sender !== 'loading'),
               { id: Date.now() + 2, text: "Error reading image file.", sender: 'bot' }
             ]);
             setIsLoading(false);
             return; // Stop processing if image reading fails
        }
    }
    // --- End New ---


    let botResponseText = '';
    try {
      // Call getBotResponse with text and potentially imageData object
      botResponseText = await getBotResponse(userMessageText, imageDataForApi);
    } catch (error) {
        console.error("Failed to get bot response:", error);
        if (error instanceof Error) { botResponseText = `Error: ${error.message}`; }
        else { botResponseText = "An unknown error occurred."; }
    } finally {
       const newBotMessage: Message = { id: Date.now() + 2, text: botResponseText, sender: 'bot' };
       setMessages((prevMessages) => [
           ...prevMessages.filter(msg => msg.sender !== 'loading'),
           newBotMessage
       ]);
       setIsLoading(false);
    }
  };
  // --- End Updated handleSend ---


  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) { // Basic check for image type
      setSelectedImage(file);
      if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); }
      setImagePreviewUrl(URL.createObjectURL(file));
    } else {
      setSelectedImage(null);
      setImagePreviewUrl(null);
      if(file) alert("Please select a valid image file."); // Optional user feedback
      if (fileInputRef.current) fileInputRef.current.value = ""; // Clear input if invalid
    }
  };

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const removeSelectedImage = () => {
      setSelectedImage(null);
      setImagePreviewUrl(null);
       if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // JSX remains largely the same as before
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

      {imagePreviewUrl && (
          <div className="image-preview-area">
              <img src={imagePreviewUrl} alt="Selected preview" style={{maxHeight: '50px', maxWidth: '50px', objectFit: 'cover', marginRight: '10px'}} />
              <button onClick={removeSelectedImage} title="Remove image" className="remove-image-button">X</button>
          </div>
      )}

      <div className="chatbot-input-area">
        <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageChange}
            accept="image/png, image/jpeg, image/gif, image/webp" // Be more specific with accepted types
            style={{ display: 'none' }}
        />
        <button onClick={handleImageUploadClick} className="upload-button" title="Upload Image" disabled={isLoading}>
            📎
        </button>
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder="Type your message or upload an image..."
          disabled={isLoading}
        />
        <button onClick={handleSend} disabled={isLoading || (!input.trim() && !selectedImage)}>
            {isLoading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

export default ChatbotPage;