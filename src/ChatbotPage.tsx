// src/ChatbotPage.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message, SpeechLanguage } from './App'; // Import types from App.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'; // Keep the import

// --- Type Declarations for Web Speech API (Assuming @types/dom-speech-recognition is installed) ---
// No need for declare global if the types package works as expected.
// We will rely on the installed types and explicit casting in handlers if needed.

// Define the Worker URL (Ensure this is your correct Worker URL)
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';

// --- Helper Functions defined ONCE outside the component ---

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { resolve(reader.result as string); };
    reader.onerror = (error) => { reject(error); };
    reader.readAsDataURL(file);
  });
}

async function getBotResponse(
    userInput: string,
    imageData: { type: string; dataUrl: string } | null
    // No model passed, worker defaults to flash
): Promise<string> {
  const promptToSend = userInput || (imageData ? "Describe this image." : "");
  if (!promptToSend && !imageData) { return "Please type a message or upload an image."; }

  const requestBody: { prompt: string; imageMimeType?: string; imageDataUrl?: string } = {
      prompt: promptToSend
  };
  if (imageData) {
      requestBody.imageMimeType = imageData.type;
      requestBody.imageDataUrl = imageData.dataUrl;
  }

  console.log('Sending to Worker:', { prompt: requestBody.prompt, imageMimeType: requestBody.imageMimeType });
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

function parseSuggestions(text: string): { mainText: string; suggestions: string[] } {
  const suggestions: string[] = [];
  const regex = /\[Suggestion:\s*([^\]]+?)\]/g;
  const mainText = text.replace(regex, (_match, suggestionText) => { // Use _match fix
    if (typeof suggestionText === 'string') { suggestions.push(suggestionText.trim()); }
    return '';
  }).trim();
  return { mainText, suggestions };
}

function formatTime(timestamp: number): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString(navigator.language || 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

// Check for SpeechRecognition API
const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognitionAvailable = !!SpeechRecognitionImpl;


// --- Component Definition ---
interface ChatbotPageProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  sttLang: SpeechLanguage;
}

const SEND_COOLDOWN_MS = 3000;

function ChatbotPage({ messages, setMessages, sttLang }: ChatbotPageProps) {
  // State
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isOnCooldown, setIsOnCooldown] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  // Refs
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null); // Rely on @types
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Effects
  const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, []);
  useEffect(() => { setTimeout(scrollToBottom, 100); }, [messages, scrollToBottom]);
  useEffect(() => { return () => { if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); } }; }, [imagePreviewUrl]);
  useEffect(() => { return () => { if (cooldownTimerRef.current) { clearTimeout(cooldownTimerRef.current); } }; }, []);

  // Speech Recognition Init Effect
  useEffect(() => {
      if (!recognitionAvailable) { console.warn("Speech Recognition not available"); return; }
      if (!recognitionRef.current) {
          try {
              recognitionRef.current = new SpeechRecognitionImpl();
              if (!recognitionRef.current) return;
              recognitionRef.current.continuous = false; recognitionRef.current.interimResults = false;

              recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => { // Use type from @types
                  const transcript = event.results[event.results.length - 1]?.[0]?.transcript;
                  if (transcript) { setInput(transcript); } setIsRecording(false);
              };
              recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => { // Use type from @types
                   console.error('Speech recognition error:', event.error, event.message);
                   alert(`Speech error: ${event.error} - ${event.message}`); setIsRecording(false);
              };
              recognitionRef.current.onstart = () => { setIsRecording(true); };
              recognitionRef.current.onend = () => { setIsRecording(false); };
          } catch (error) { console.error("Failed to initialize SpeechRecognition:", error); }
      }
       return () => { if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch(e){ console.warn("Error aborting speech recognition", e); }} }; // Add abort cleanup
  }, []);

  // Core Send Logic
  const sendMessage = useCallback(async (messageText: string, imageFile: File | null) => {
    if ((messageText.trim() === '' && !imageFile) || isLoading || isOnCooldown) return;
    const currentTime = Date.now();
    const userMessageText = messageText.trim();
    const imageToSend = imageFile;
    let imageDataForApi: { type: string; dataUrl: string } | null = null;
    const newUserMessage: Message = { id: currentTime, text: userMessageText + (imageToSend ? ' (+image)' : ''), sender: 'user', timestamp: currentTime };
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);
    if (imageToSend && imageToSend === selectedImage) { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
    if(messageText === input) { setInput(''); }
    setIsLoading(true); setIsOnCooldown(true);
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => { setIsOnCooldown(false); }, SEND_COOLDOWN_MS);
    const loadingTime = Date.now() + 1;
    setMessages((prevMessages) => [...prevMessages, { id: loadingTime, text: 'Bot is typing...', sender: 'loading', timestamp: loadingTime }]);
    if (imageToSend) {
        try { const base64String = await readFileAsBase64(imageToSend); imageDataForApi = { type: imageToSend.type, dataUrl: base64String }; }
        catch (error) { console.error("Error reading file:", error); const errorTime = Date.now() + 2; setMessages((prevMessages) => [ ...prevMessages.filter(msg => msg.sender !== 'loading'), { id: errorTime, text: "Error reading image file.", sender: 'bot', timestamp: errorTime } ]); setIsLoading(false); setIsOnCooldown(false); if(cooldownTimerRef.current){ clearTimeout(cooldownTimerRef.current);} return; }
    }
    let botResponseText = '';
    try { botResponseText = await getBotResponse(userMessageText, imageDataForApi); } // No model passed
    catch (error) { console.error("Failed to get bot response:", error); if (error instanceof Error) { botResponseText = `Error: ${error.message}`; } else { botResponseText = "An unknown error occurred."; } }
    finally { const botTime = Date.now() + 2; const newBotMessage: Message = { id: botTime, text: botResponseText, sender: 'bot', timestamp: botTime }; setMessages((prevMessages) => [ ...prevMessages.filter(msg => msg.sender !== 'loading'), newBotMessage ]); setIsLoading(false); }
  }, [isLoading, isOnCooldown, input, selectedImage, setMessages]); // Removed selectedModel

  // Event Handlers
  const handleSend = () => { sendMessage(input, selectedImage); }
  const handleSuggestionClick = useCallback((suggestionText: string) => { sendMessage(suggestionText, null); }, [sendMessage]);
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setInput(event.target.value); };
  const handleKeyPress = (event: React.KeyboardEvent) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } };
  // Includes _event fix
  const handleImageChange = (_event: React.ChangeEvent<HTMLInputElement>) => { const file = _event.target.files?.[0]; if (file && file.type.startsWith('image/')) { setSelectedImage(file); if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); } setImagePreviewUrl(URL.createObjectURL(file)); } else { setSelectedImage(null); setImagePreviewUrl(null); if(file) alert("Please select a valid image file."); if (fileInputRef.current) fileInputRef.current.value = ""; } };
  const handleImageUploadClick = () => { fileInputRef.current?.click(); };
  const removeSelectedImage = () => { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
  const handleMicClick = () => { if (!recognitionRef.current) { alert("Speech recognition not initialized or not available."); return; } if (isLoading || isOnCooldown || isRecording) { if(isRecording) { try {recognitionRef.current.stop();} catch(e){console.warn("Error stopping speech recognition", e); setIsRecording(false);}} return; } try { recognitionRef.current.lang = sttLang; recognitionRef.current.start(); } catch (e) { console.error("Error starting speech recognition:", e); alert("Could not start recognition. Allow microphone permission?"); setIsRecording(false); } };

  // --- JSX Rendering ---
  return (
     <div className="chatbot-container">
       <div className="chatbot-messages">
         {messages.map((message: Message) => {
             let mainText = message.text; let suggestions: string[] = [];
             if (message.sender === 'bot') { const parsed = parseSuggestions(message.text); mainText = parsed.mainText; suggestions = parsed.suggestions; }
             return (
               <div key={message.id} className={`message-wrapper message-wrapper-${message.sender}`}>
                  <div className={`message ${message.sender}`}>
                     {message.sender === 'bot' ? (
                        // Use explicit children prop AND include remarkGfm plugin
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            children={mainText || ''}
                        />
                     ) : message.sender === 'loading' ? ( <i>{mainText}</i> ) : ( <p>{mainText}</p> )}
                  </div>
                  {message.sender !== 'loading' && message.timestamp && ( <span className="message-timestamp"> {formatTime(message.timestamp)} </span> )}
                  {suggestions.length > 0 && ( <div className="suggestions-container"> {suggestions.map((suggestion, index) => ( <button key={index} className="suggestion-button" onClick={() => handleSuggestionClick(suggestion)} disabled={isLoading || isOnCooldown} > {suggestion} </button> ))} </div> )}
               </div> );
         })}
          <div ref={messagesEndRef} />
       </div>
       {imagePreviewUrl && ( <div className="image-preview-area"> <img src={imagePreviewUrl || ""} alt="Selected preview" style={{maxHeight: '50px', maxWidth: '50px', objectFit: 'cover', marginRight: '10px'}} /> <button onClick={removeSelectedImage} title="Remove image" className="remove-image-button">X</button> </div> )}
       <div className="chatbot-input-area">
          <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/png, image/jpeg, image/gif, image/webp" style={{ display: 'none' }} />
          <button onClick={handleImageUploadClick} className="upload-button" title="Upload Image" disabled={isLoading || isOnCooldown}>📎</button>
          <input type="text" value={input} onChange={handleInputChange} onKeyPress={handleKeyPress} placeholder="Type message or speak..." disabled={isLoading || isOnCooldown}/>
          {recognitionAvailable && ( <button onClick={handleMicClick} className={`mic-button ${isRecording ? 'recording' : ''}`} title={isRecording ? "Stop Recording" : `Start Recording (${sttLang})`} disabled={isLoading || isOnCooldown}> {isRecording ? '■' : '🎙️'} </button> )}
          <button onClick={handleSend} disabled={isLoading || isOnCooldown || (!input.trim() && !selectedImage)} title="Send"> {String.fromCharCode(10148)} </button>
       </div>
     </div>
  );
 }

 export default ChatbotPage;