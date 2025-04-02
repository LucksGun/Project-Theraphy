// src/ChatbotPage.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message } from './App';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Define the Worker URL
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';

// Helper Function: Read File as Base64
function readFileAsBase64(file: File): Promise<string> { /* ... unchanged ... */ }

// Function to call the Cloudflare Worker
async function getBotResponse(userInput: string, imageData: { type: string; dataUrl: string } | null ): Promise<string> { /* ... unchanged ... */ }

// Helper function to parse suggestions
function parseSuggestions(text: string): { mainText: string; suggestions: string[] } { /* ... unchanged, includes _match fix ... */ }

// Component definition using props
interface ChatbotPageProps { /* ... */ }

function ChatbotPage({ messages, setMessages }: ChatbotPageProps) {
  // State hooks
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Effects
  const scrollToBottom = useCallback(() => { /* ... */ }, []);
  useEffect(() => { /* ... */ }, [messages, scrollToBottom]);
  useEffect(() => { /* ... */ }, [imagePreviewUrl]);

  // sendMessage function
  const sendMessage = useCallback(async (messageText: string, imageFile: File | null) => { /* ... unchanged ... */ }, [isLoading, input, selectedImage, setMessages]); // Note: Re-added input dependency

  // handleSend wrapper
  const handleSend = () => { sendMessage(input, selectedImage); }

  // handleSuggestionClick
  const handleSuggestionClick = useCallback((suggestionText: string) => { sendMessage(suggestionText, null); }, [sendMessage]);

  // Other handlers
   const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setInput(event.target.value); };
   const handleKeyPress = (event: React.KeyboardEvent) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } };
   // --- FIXED: Renamed event to _event ---
   const handleImageChange = (_event: React.ChangeEvent<HTMLInputElement>) => {
     // Use _event.target - this is fine, just the 'event' variable itself wasn't used
     const file = _event.target.files?.[0];
     if (file && file.type.startsWith('image/')) { setSelectedImage(file); if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); } setImagePreviewUrl(URL.createObjectURL(file)); }
     else { setSelectedImage(null); setImagePreviewUrl(null); if(file) alert("Please select a valid image file."); if (fileInputRef.current) fileInputRef.current.value = ""; }
   };
   const handleImageUploadClick = () => { fileInputRef.current?.click(); };
   const removeSelectedImage = () => { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; }

  // JSX rendering
  return (
     <div className="chatbot-container">
       <div className="chatbot-messages">
         {messages.map((message) => {
             let mainText = message.text;
             let suggestions: string[] = [];
             if (message.sender === 'bot') { const parsed = parseSuggestions(message.text); mainText = parsed.mainText; suggestions = parsed.suggestions; }
             return (
               <div key={message.id} className={`message-wrapper message-wrapper-${message.sender}`}>
                  <div className={`message ${message.sender}`}>
                     {message.sender === 'bot' ? ( <ReactMarkdown remarkPlugins={[remarkGfm]}> {mainText || (suggestions.length > 0 ? '' : ' ')} </ReactMarkdown> )
                      : message.sender === 'loading' ? ( <i>{mainText}</i> )
                      : ( <p>{mainText}</p> )}
                  </div>
                  {suggestions.length > 0 && ( <div className="suggestions-container"> {suggestions.map((suggestion, index) => ( <button key={index} className="suggestion-button" onClick={() => handleSuggestionClick(suggestion)} disabled={isLoading} > {suggestion} </button> ))} </div> )}
               </div>
             );
         })}
          <div ref={messagesEndRef} />
       </div>
       {imagePreviewUrl && (
           <div className="image-preview-area">
               {/* --- FIXED: Ensure src is always a string --- */}
               <img src={imagePreviewUrl || ""} alt="Selected preview" style={{maxHeight: '50px', maxWidth: '50px', objectFit: 'cover', marginRight: '10px'}} />
               <button onClick={removeSelectedImage} title="Remove image" className="remove-image-button">X</button>
           </div>
       )}
       <div className="chatbot-input-area">
          {/* Input elements unchanged */}
          <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/png, image/jpeg, image/gif, image/webp" style={{ display: 'none' }} />
          <button onClick={handleImageUploadClick} className="upload-button" title="Upload Image" disabled={isLoading}>📎</button>
          <input type="text" value={input} onChange={handleInputChange} onKeyPress={handleKeyPress} placeholder="Type your message or upload an image..." disabled={isLoading}/>
          <button onClick={handleSend} disabled={isLoading || (!input.trim() && !selectedImage)} title="Send"> ➢ </button>
       </div>
     </div>
  );
 }

 // --- Make sure full functions are included ---
 async function getBotResponse(userInput: string, imageData: { type: string; dataUrl: string } | null ): Promise<string> { /* copy full function from previous responses */ }
 function readFileAsBase64(file: File): Promise<string> { /* copy full function from previous responses */ }


 export default ChatbotPage;

 // --- FULL FUNCTIONS NEEDED FOR COMPLETENESS ---
async function getBotResponse(userInput: string, imageData: { type: string; dataUrl: string } | null ): Promise<string> {
  const promptToSend = userInput || (imageData ? "Describe this image." : "");
  if (!promptToSend && !imageData) { return "Please type a message or upload an image."; }
  const requestBody: { prompt: string; imageMimeType?: string; imageDataUrl?: string } = { prompt: promptToSend };
  if (imageData) { requestBody.imageMimeType = imageData.type; requestBody.imageDataUrl = imageData.dataUrl; console.log('Sending image to Worker:', { mimeType: imageData.type, base64Preview: imageData.dataUrl.substring(0, 100) + '...' }); }
  console.log('Sending to Worker:', requestBody);
  try {
    const response = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify(requestBody), });
     if (!response.ok) { const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` })); throw new Error(errorData.error || `HTTP error! status: ${response.status}`); }
    const data = await response.json();
    if (data.error) { throw new Error(data.error); }
    console.log('Received reply from Worker:', data.reply);
    return data.reply || 'Sorry, I received an empty reply.';
  } catch (error) { console.error('Error fetching bot response:', error); if (error instanceof Error) { return `Error: ${error.message}`; } return 'Error: Could not fetch response.'; }
}
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { resolve(reader.result as string); };
    reader.onerror = (error) => { reject(error); };
    reader.readAsDataURL(file);
  });
}