// src/ChatbotPage.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message } from './App'; // Import Message type from App.tsx

// Define the Worker URL
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';

// Helper Function: Read File as Base64 (Unchanged)
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { resolve(reader.result as string); };
    reader.onerror = (error) => { reject(error); };
    reader.readAsDataURL(file);
  });
}

// --- FINAL VERSION: Sends text and image data to Worker ---
async function getBotResponse(
    userInput: string,
    imageData: { type: string; dataUrl: string } | null
): Promise<string> {

  const promptToSend = userInput || (imageData ? "Describe this image." : "");
  if (!promptToSend && !imageData) { // Need at least one
      return "Please type a message or upload an image.";
  }

  // --- Prepare request body dynamically ---
  const requestBody: { prompt: string; imageMimeType?: string; imageDataUrl?: string } = {
      prompt: promptToSend
  };

  if (imageData) {
      requestBody.imageMimeType = imageData.type;
      requestBody.imageDataUrl = imageData.dataUrl; // Send the full Data URL
      console.log('Sending image to Worker:', { mimeType: imageData.type, base64Preview: imageData.dataUrl.substring(0, 100) + '...' });
  }
  // --- End request body preparation ---


  console.log('Sending to Worker:', requestBody);
  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', },
      // --- Send the complete request body ---
      body: JSON.stringify(requestBody),
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
// --- End FINAL version ---


// Component definition starts (props interface, etc. - keep as before)
interface ChatbotPageProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

function ChatbotPage({ messages, setMessages }: ChatbotPageProps) {
  // State hooks remain the same
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // useEffect hooks remain the same
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  useEffect(() => {
    setTimeout(scrollToBottom, 100);
  }, [messages, scrollToBottom]);
  useEffect(() => {
    return () => { if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); } };
  }, [imagePreviewUrl]);

  // handleSend remains the same (it already prepares imageDataForApi)
  const handleSend = async () => {
     if ((input.trim() === '' && !selectedImage) || isLoading) return;
     const userMessageText = input.trim();
     const imageToSend = selectedImage;
     let imageDataForApi: { type: string; dataUrl: string } | null = null;
     const newUserMessage: Message = { id: Date.now(), text: userMessageText + (imageToSend ? ' (+image)' : ''), sender: 'user' };
     setMessages((prevMessages) => [...prevMessages, newUserMessage]);
     setInput('');
     setSelectedImage(null);
     setImagePreviewUrl(null);
     if (fileInputRef.current) fileInputRef.current.value = "";
     setIsLoading(true);
     setMessages((prevMessages) => [...prevMessages, { id: Date.now() + 1, text: 'Bot is typing...', sender: 'loading' }]);
     if (imageToSend) {
         try {
             const base64String = await readFileAsBase64(imageToSend);
             imageDataForApi = { type: imageToSend.type, dataUrl: base64String };
         } catch (error) {
             console.error("Error reading file:", error);
              setMessages((prevMessages) => [
                ...prevMessages.filter(msg => msg.sender !== 'loading'),
                { id: Date.now() + 2, text: "Error reading image file.", sender: 'bot' }
              ]);
              setIsLoading(false);
              return;
         }
     }
     let botResponseText = '';
     try {
       // This now passes the image data (if present) correctly
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

  // Other handlers remain the same
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setInput(event.target.value); };
  const handleKeyPress = (event: React.KeyboardEvent) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } };
  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);
      if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); }
      setImagePreviewUrl(URL.createObjectURL(file));
    } else { /* ... reset logic ... */
       setSelectedImage(null); setImagePreviewUrl(null);
       if(file) alert("Please select a valid image file.");
       if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  const handleImageUploadClick = () => { fileInputRef.current?.click(); };
  const removeSelectedImage = () => { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; }

  // JSX remains the same
  return (
     <div className="chatbot-container">
       {/* ... messages mapping ... */}
       <div className="chatbot-messages">
         {messages.map((message) => ( <div key={message.id} className={`message ${message.sender}`}> {message.sender === 'loading' ? ( <i>{message.text}</i> ) : ( <p>{message.text}</p> )} </div> ))}
          <div ref={messagesEndRef} />
       </div>
       {/* ... image preview ... */}
       {imagePreviewUrl && ( <div className="image-preview-area"> <img src={imagePreviewUrl} alt="Selected preview" style={{maxHeight: '50px', maxWidth: '50px', objectFit: 'cover', marginRight: '10px'}} /> <button onClick={removeSelectedImage} title="Remove image" className="remove-image-button">X</button> </div> )}
       {/* ... input area ... */}
       <div className="chatbot-input-area">
         <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/png, image/jpeg, image/gif, image/webp" style={{ display: 'none' }} />
         <button onClick={handleImageUploadClick} className="upload-button" title="Upload Image" disabled={isLoading}>📎</button>
         <input type="text" value={input} onChange={handleInputChange} onKeyPress={handleKeyPress} placeholder="Type your message or upload an image..." disabled={isLoading}/>
         <button onClick={handleSend} disabled={isLoading || (!input.trim() && !selectedImage)}> {isLoading ? '...' : 'Send'} </button>
       </div>
     </div>
  );
}

export default ChatbotPage;