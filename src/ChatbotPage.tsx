// src/ChatbotPage.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message, GeminiModel } from './App'; // Import types from App.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Define the Worker URL (Make sure this is your correct Worker URL)
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';

// --- Helper Functions defined ONCE outside the component ---

// Read File as Base64
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { resolve(reader.result as string); };
    reader.onerror = (error) => { reject(error); };
    reader.readAsDataURL(file);
  });
}

// Call the Cloudflare Worker (Sends model choice)
async function getBotResponse(
    userInput: string,
    imageData: { type: string; dataUrl: string } | null,
    model: GeminiModel // Accepts model choice
): Promise<string> {
  const promptToSend = userInput || (imageData ? "Describe this image." : "");
  if (!promptToSend && !imageData) { return "Please type a message or upload an image."; }

  const requestBody: { prompt: string; model: GeminiModel; imageMimeType?: string; imageDataUrl?: string } = {
      prompt: promptToSend,
      model: model // Include the selected model
  };

  if (imageData) {
      requestBody.imageMimeType = imageData.type;
      requestBody.imageDataUrl = imageData.dataUrl; // Send the full Data URL
  }

  console.log(`Sending to Worker (Using Model: ${model}):`, { prompt: requestBody.prompt, imageMimeType: requestBody.imageMimeType });
  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', },
      body: JSON.stringify(requestBody),
    });
     if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status} ${response.statusText}` }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status} ${response.statusText}`);
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

// Parse Suggestions (includes _match fix)
function parseSuggestions(text: string): { mainText: string; suggestions: string[] } {
  const suggestions: string[] = [];
  const regex = /\[Suggestion:\s*([^\]]+?)\]/g;
  const mainText = text.replace(regex, (_match, suggestionText) => { // Use _match
    // Ensure suggestionText is treated as string before trim()
    if (typeof suggestionText === 'string') {
       suggestions.push(suggestionText.trim());
    }
    return '';
  }).trim();
  return { mainText, suggestions };
}

// Format Timestamp
function formatTime(timestamp: number): string {
    if (!timestamp) return ''; // Handle cases where timestamp might be missing
    const date = new Date(timestamp);
    return date.toLocaleTimeString(navigator.language || 'en-US', { // Fallback locale
        hour: '2-digit',
        minute: '2-digit',
        hour12: false // Use 24-hour format
    });
}

// --- Component Definition ---
interface ChatbotPageProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  selectedModel: GeminiModel;
}

const SEND_COOLDOWN_MS = 3000; // Cooldown period in milliseconds (3 seconds)

function ChatbotPage({ messages, setMessages, selectedModel }: ChatbotPageProps) {
  // --- State ---
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isOnCooldown, setIsOnCooldown] = useState<boolean>(false);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Refs ---
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  const scrollToBottom = useCallback(() => {
    // Optional: Add check if ref exists
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    // Scroll after messages update
    setTimeout(scrollToBottom, 100); // Timeout helps ensure DOM is updated
  }, [messages, scrollToBottom]);

  useEffect(() => {
    // Clean up object URLs for image preview
    return () => { if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); } };
  }, [imagePreviewUrl]);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
      return () => { if (cooldownTimerRef.current) { clearTimeout(cooldownTimerRef.current); } };
  }, []);


  // --- Core Send Logic ---
  const sendMessage = useCallback(async (messageText: string, imageFile: File | null) => {
    // Prevent sending if loading, on cooldown, or no content
    if ((messageText.trim() === '' && !imageFile) || isLoading || isOnCooldown) return;

    const currentTime = Date.now();
    const userMessageText = messageText.trim();
    const imageToSend = imageFile;
    let imageDataForApi: { type: string; dataUrl: string } | null = null;

    // Add user message to state immediately
    const newUserMessage: Message = {
        id: currentTime,
        text: userMessageText + (imageToSend ? ' (+image)' : ''),
        sender: 'user',
        timestamp: currentTime
    };
    setMessages((prevMessages) => [...prevMessages, newUserMessage]); // Use prop

    // Clear inputs associated with this send action
    if (imageToSend && imageToSend === selectedImage) {
        setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = "";
    }
     // Only clear text input if the text being sent *is* the current input value
    if(messageText === input) {
        setInput('');
    }

    // Set loading and cooldown states
    setIsLoading(true);
    setIsOnCooldown(true);
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current); // Clear previous timer
    cooldownTimerRef.current = setTimeout(() => { setIsOnCooldown(false); }, SEND_COOLDOWN_MS);

    // Add placeholder loading message
    const loadingTime = Date.now() + 1; // Ensure unique ID
    setMessages((prevMessages) => [...prevMessages, { id: loadingTime, text: 'Bot is typing...', sender: 'loading', timestamp: loadingTime }]);

    // Process image if exists
    if (imageToSend) {
        try {
            const base64String = await readFileAsBase64(imageToSend);
            imageDataForApi = { type: imageToSend.type, dataUrl: base64String };
        } catch (error) {
            console.error("Error reading file:", error);
            const errorTime = Date.now() + 2;
            // Replace loading msg with error msg
            setMessages((prevMessages) => [ ...prevMessages.filter(msg => msg.sender !== 'loading'), { id: errorTime, text: "Error reading image file.", sender: 'bot', timestamp: errorTime } ]); // Use prop
            setIsLoading(false);
             // Reset cooldown state immediately on local error too
             setIsOnCooldown(false);
             if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
            return; // Stop processing
        }
    }

    // Get bot response
    let botResponseText = '';
    try {
      botResponseText = await getBotResponse(userMessageText, imageDataForApi, selectedModel);
    } catch (error) {
        console.error("Failed to get bot response:", error);
        if (error instanceof Error) { botResponseText = `Error: ${error.message}`; } else { botResponseText = "An unknown error occurred."; }
    } finally {
       const botTime = Date.now() + 2; // Ensure unique ID from potential error message or successful response
       const newBotMessage: Message = { id: botTime, text: botResponseText, sender: 'bot', timestamp: botTime };
       // Replace loading message with final bot message/error
       setMessages((prevMessages) => [ ...prevMessages.filter(msg => msg.sender !== 'loading'), newBotMessage ]); // Use prop
       setIsLoading(false); // Clear loading state (cooldown timer runs independently)
    }
  }, [isLoading, isOnCooldown, input, selectedImage, setMessages, selectedModel]); // Dependencies


  // --- Event Handlers ---
  const handleSend = () => {
    // Trigger send using current input state
    sendMessage(input, selectedImage);
  }

  const handleSuggestionClick = useCallback((suggestionText: string) => {
    // Trigger send using suggestion text (no image)
    sendMessage(suggestionText, null);
  }, [sendMessage]); // Depends on sendMessage

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

   // Includes _event fix for unused parameter rule
  const handleImageChange = (_event: React.ChangeEvent<HTMLInputElement>) => {
     const file = _event.target.files?.[0];
     if (file && file.type.startsWith('image/')) {
       setSelectedImage(file);
       if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); } // Clean up previous
       setImagePreviewUrl(URL.createObjectURL(file));
     } else {
        setSelectedImage(null); setImagePreviewUrl(null);
        if(file) alert("Please select a valid image file."); // Alert if a file was selected but wasn't an image
        if (fileInputRef.current) fileInputRef.current.value = ""; // Clear the file input
     }
   };

   const handleImageUploadClick = () => {
     fileInputRef.current?.click();
   };

   const removeSelectedImage = () => {
      setSelectedImage(null); setImagePreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = ""; // Clear the file input
   }

  // --- JSX Rendering ---
  return (
     <div className="chatbot-container">
       <div className="chatbot-messages">
         {messages.map((message: Message) => { // Explicit type
             let mainText = message.text;
             let suggestions: string[] = [];
             if (message.sender === 'bot') { const parsed = parseSuggestions(message.text); mainText = parsed.mainText; suggestions = parsed.suggestions; }
             return (
               <div key={message.id} className={`message-wrapper message-wrapper-${message.sender}`}>
                  <div className={`message ${message.sender}`}>
                     {message.sender === 'bot' ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                           {/* Ensure children is always a string, even if empty */}
                           {mainText || ''}
                        </ReactMarkdown>
                     ) : message.sender === 'loading' ? (
                        <i>{mainText}</i>
                     ) : (
                        <p>{mainText}</p>
                     )}
                  </div>
                  {/* Timestamp rendering */}
                  {message.sender !== 'loading' && message.timestamp && (
                      <span className="message-timestamp"> {formatTime(message.timestamp)} </span>
                  )}
                  {/* Suggestion buttons rendering */}
                  {suggestions.length > 0 && (
                     <div className="suggestions-container">
                        {suggestions.map((suggestion, index) => (
                           <button
                              key={index}
                              className="suggestion-button"
                              onClick={() => handleSuggestionClick(suggestion)}
                              // Disable suggestions during cooldown too
                              disabled={isLoading || isOnCooldown} >
                                {suggestion}
                           </button>
                        ))}
                     </div>
                   )}
               </div>
             );
         })}
          <div ref={messagesEndRef} />
       </div>

       {/* Image Preview Area */}
       {imagePreviewUrl && (
           <div className="image-preview-area">
               {/* Fixed src attribute */}
               <img src={imagePreviewUrl || ""} alt="Selected preview" style={{maxHeight: '50px', maxWidth: '50px', objectFit: 'cover', marginRight: '10px'}} />
               <button onClick={removeSelectedImage} title="Remove image" className="remove-image-button">X</button>
           </div>
       )}

       {/* Input Area */}
       <div className="chatbot-input-area">
          <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/png, image/jpeg, image/gif, image/webp" style={{ display: 'none' }} />
          <button onClick={handleImageUploadClick} className="upload-button" title="Upload Image" disabled={isLoading || isOnCooldown}>📎</button>
          <input type="text" value={input} onChange={handleInputChange} onKeyPress={handleKeyPress} placeholder="Type your message or upload an image..." disabled={isLoading || isOnCooldown}/>
          {/* Fixed Send button icon using char code */}
          <button onClick={handleSend} disabled={isLoading || isOnCooldown || (!input.trim() && !selectedImage)} title="Send">
             {String.fromCharCode(10148)}
          </button>
       </div>
     </div>
  );
 }

 export default ChatbotPage;