// src/ChatbotPage.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message } from './App'; // Import Message type from App.tsx
import ReactMarkdown from 'react-markdown'; // <--- Import ReactMarkdown
import remarkGfm from 'remark-gfm';         // <--- Import GFM plugin

// Define the Worker URL
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';

// Helper Function: Read File as Base64
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { resolve(reader.result as string); };
    reader.onerror = (error) => { reject(error); };
    reader.readAsDataURL(file);
  });
}

// Function to call the Cloudflare Worker
async function getBotResponse(
    userInput: string,
    imageData: { type: string; dataUrl: string } | null
): Promise<string> {
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

// Component definition using props
interface ChatbotPageProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

function ChatbotPage({ messages, setMessages }: ChatbotPageProps) {
  // State hooks
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Effects
  const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, []);
  useEffect(() => { setTimeout(scrollToBottom, 100); }, [messages, scrollToBottom]);
  useEffect(() => { return () => { if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); } }; }, [imagePreviewUrl]);

  // handleSend
  const handleSend = async () => {
     if ((input.trim() === '' && !selectedImage) || isLoading) return;
     const userMessageText = input.trim();
     const imageToSend = selectedImage;
     let imageDataForApi: { type: string; dataUrl: string } | null = null;
     const newUserMessage: Message = { id: Date.now(), text: userMessageText + (imageToSend ? ' (+image)' : ''), sender: 'user' };
     setMessages((prevMessages) => [...prevMessages, newUserMessage]);
     setInput(''); setSelectedImage(null); setImagePreviewUrl(null);
     if (fileInputRef.current) fileInputRef.current.value = "";
     setIsLoading(true);
     setMessages((prevMessages) => [...prevMessages, { id: Date.now() + 1, text: 'Bot is typing...', sender: 'loading' }]);
     if (imageToSend) {
         try {
             const base64String = await readFileAsBase64(imageToSend);
             imageDataForApi = { type: imageToSend.type, dataUrl: base64String };
         } catch (error) { /* ... error handling ... */
             console.error("Error reading file:", error);
              setMessages((prevMessages) => [ ...prevMessages.filter(msg => msg.sender !== 'loading'), { id: Date.now() + 2, text: "Error reading image file.", sender: 'bot' } ]);
              setIsLoading(false); return;
         }
     }
     let botResponseText = '';
     try { botResponseText = await getBotResponse(userMessageText, imageDataForApi); }
     catch (error) { /* ... error handling ... */
         console.error("Failed to get bot response:", error);
         if (error instanceof Error) { botResponseText = `Error: ${error.message}`; } else { botResponseText = "An unknown error occurred."; }
     } finally {
        const newBotMessage: Message = { id: Date.now() + 2, text: botResponseText, sender: 'bot' };
        setMessages((prevMessages) => [ ...prevMessages.filter(msg => msg.sender !== 'loading'), newBotMessage ]);
        setIsLoading(false);
     }
  };

  // Other handlers
   const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setInput(event.target.value); };
   const handleKeyPress = (event: React.KeyboardEvent) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } };
   const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
     const file = event.target.files?.[0];
     if (file && file.type.startsWith('image/')) { /* ... set image state ... */
         setSelectedImage(file); if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); } setImagePreviewUrl(URL.createObjectURL(file));
     } else { /* ... reset image state ... */
        setSelectedImage(null); setImagePreviewUrl(null); if(file) alert("Please select a valid image file."); if (fileInputRef.current) fileInputRef.current.value = "";
     }
   };
   const handleImageUploadClick = () => { fileInputRef.current?.click(); };
   const removeSelectedImage = () => { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; }

  // --- UPDATED JSX for rendering messages ---
  return (
     <div className="chatbot-container">
       <div className="chatbot-messages">
         {messages.map((message) => (
           <div key={message.id} className={`message ${message.sender}`}>
              {/* Use ReactMarkdown for bot messages, keep <p>/<i> for user/loading */}
              {message.sender === 'bot' ? (
                 <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.text}
                 </ReactMarkdown>
              ) : message.sender === 'loading' ? (
                 <i>{message.text}</i>
              ) : (
                 <p>{message.text}</p> // Keep user messages in <p>
              )}
           </div>
         ))}
          <div ref={messagesEndRef} />
       </div>
       {/* ... (Image Preview JSX unchanged) ... */}
       {imagePreviewUrl && ( <div className="image-preview-area"> <img src={imagePreviewUrl} alt="Selected preview" style={{maxHeight: '50px', maxWidth: '50px', objectFit: 'cover', marginRight: '10px'}} /> <button onClick={removeSelectedImage} title="Remove image" className="remove-image-button">X</button> </div> )}
       {/* ... (Input Area JSX unchanged) ... */}
       <div className="chatbot-input-area"> <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/png, image/jpeg, image/gif, image/webp" style={{ display: 'none' }} /> <button onClick={handleImageUploadClick} className="upload-button" title="Upload Image" disabled={isLoading}>📎</button> <input type="text" value={input} onChange={handleInputChange} onKeyPress={handleKeyPress} placeholder="Type your message or upload an image..." disabled={isLoading}/> <button onClick={handleSend} disabled={isLoading || (!input.trim() && !selectedImage)} title="Send"> ➢ </button> </div>
     </div>
  );
  // --- End UPDATED JSX ---
}

export default ChatbotPage;