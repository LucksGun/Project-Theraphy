// src/ChatbotPage.tsx
// Final version with history sending (last 20 messages) and typo fix

import React, { useState, useRef, useEffect, useCallback } from 'react';
// Ensure this import is correct (adjust path if needed)
import { Message, GeminiModel, SpeechLanguage } from './App'; // Assuming types are exported from App.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Define the Worker URL
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/'; // Replace if needed

// +++ Helper type for simplified history structure +++
type HistoryItem = {
  sender: 'user' | 'bot';
  text: string;
}

// --- Helper Functions ---

// Reads file as Base64
function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => { resolve(reader.result as string); };
        reader.onerror = (error) => { reject(error); };
        reader.readAsDataURL(file);
    });
}

// +++ Calls the Cloudflare Worker (MODIFIED for History) +++
async function getBotResponse(
    userInput: string,
    imageData: { type: string; dataUrl: string } | null,
    history: HistoryItem[], // Added history parameter
    model: GeminiModel,
    accessKey: string
): Promise<string> {
    const promptToSend = userInput || (imageData ? "Describe this image." : "");
    if (!promptToSend && !imageData) {
        return "Please type a message or upload an image.";
    }

    // Modified request body to include history
    const requestBody: {
        prompt: string;
        model: GeminiModel;
        imageMimeType?: string;
        imageDataUrl?: string;
        accessKey?: string;
        history?: HistoryItem[]; // Added history field
    } = {
        prompt: promptToSend,
        model: model,
        accessKey: accessKey,
        history: history // Pass the history array
    };

    if (imageData) {
        requestBody.imageMimeType = imageData.type;
        requestBody.imageDataUrl = imageData.dataUrl;
    }

    console.log(`Sending Chat Request to Worker (Using Model: ${model}, History: ${history.length} items):`, {
        prompt: requestBody.prompt ? requestBody.prompt.substring(0, 50) + '...' : 'None',
        image: requestBody.imageMimeType ? 'present' : 'none',
        historyLength: history.length,
        model: requestBody.model,
        accessKey: requestBody.accessKey ? 'present' : 'none'
    });

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify(requestBody), // Send the body including history
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({
                error: `HTTP error! Status: ${response.status} ${response.statusText}`
            }));
            throw new Error(errorData?.error || `HTTP error! Status: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }

        console.log('Received reply from Worker:', data.reply ? data.reply.substring(0, 100) + '...' : 'Empty Reply');
        return data.reply || 'Sorry, I received an empty reply.';

    } catch (error) {
        console.error('Error fetching bot response:', error);
        if (error instanceof Error) {
            return `Error: ${error.message}`;
        }
        return 'Error: Could not fetch response.';
    }
}

// Parses suggestions from text
function parseSuggestions(text: string): { mainText: string; suggestions: string[] } {
    const suggestions: string[] = [];
    const regex = /\[Suggestion:\s*([^\]]+?)\]/g;
    const mainText = text.replace(regex, (_match, suggestionText) => {
        if (typeof suggestionText === 'string') { suggestions.push(suggestionText.trim()); }
        return '';
    }).trim();
    return { mainText, suggestions };
}

// Formats timestamp
function formatTime(timestamp: number): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString(navigator.language || 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// --- Speech Recognition Setup ---
const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognitionAvailable = !!SpeechRecognitionImpl;


// --- Component Definition ---
interface ChatbotPageProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  selectedModel: GeminiModel;
  sttLang: SpeechLanguage;
  accessKey: string; // Accept accessKey prop
}

const SEND_COOLDOWN_MS = 3000; // Cooldown between sending messages

function ChatbotPage({ messages, setMessages, selectedModel, sttLang, accessKey }: ChatbotPageProps) {
  // --- State ---
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isOnCooldown, setIsOnCooldown] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  // --- Refs ---
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, []);
  useEffect(() => { const timer = setTimeout(scrollToBottom, 100); return () => clearTimeout(timer); }, [messages, scrollToBottom]);
  useEffect(() => { return () => { if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); } }; }, [imagePreviewUrl]);
  useEffect(() => { return () => { if (cooldownTimerRef.current) { clearTimeout(cooldownTimerRef.current); } }; }, []);
  useEffect(() => {
    // Speech Recognition Initialization Logic (kept concise)
    if (!recognitionAvailable) { console.warn("Speech Recognition not available."); return; }
    if (!recognitionRef.current) {
      try {
        recognitionRef.current = new SpeechRecognitionImpl();
        if (!recognitionRef.current) return;
        recognitionRef.current.continuous = false; recognitionRef.current.interimResults = false;
        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => { const transcript = event.results[event.results.length - 1]?.[0]?.transcript; if (transcript) setInput(transcript); setIsRecording(false); };
        recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => { console.error('Speech error:', event.error, event.message); alert(`Speech error: ${event.error}`); setIsRecording(false); };
        recognitionRef.current.onstart = () => { setIsRecording(true); };
        recognitionRef.current.onend = () => { setIsRecording(false); };
      } catch (error) { console.error("Failed to initialize SpeechRecognition:", error); }
    }
    return () => { if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch(e){ console.warn("Error aborting speech on cleanup", e); } } };
  }, []); // Init speech recognition once


  // +++ Core Send Logic (MODIFIED for History & Corrected Finally Block) +++
  const sendMessage = useCallback(async (messageText: string, imageFile: File | null) => {
    const textTrimmed = messageText.trim();
    if ((textTrimmed === '' && !imageFile) || isLoading || isOnCooldown) return;

    const currentTime = Date.now();
    const imageToSend = imageFile;
    let imageDataForApi: { type: string; dataUrl: string } | null = null;

    // +++ Prepare History +++
    const MAX_HISTORY_MESSAGES = 20; // <<< Set history length here
    const relevantHistory = messages
        .filter(msg => msg.sender === 'user' || msg.sender === 'bot') // Exclude 'loading' messages
        .slice(-MAX_HISTORY_MESSAGES); // Get the last N messages

    const historyToSend: HistoryItem[] = relevantHistory.map(msg => ({
        sender: msg.sender as 'user' | 'bot',
        text: msg.text
    }));
    // +++ End Prepare History +++

    const newUserMessage: Message = {
      id: currentTime, text: textTrimmed + (imageToSend ? ' (+image)' : ''),
      sender: 'user', timestamp: currentTime
    };
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);

    // Clear inputs / state
    if (imageToSend && imageToSend === selectedImage) { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
    if(messageText === input) { setInput(''); }

    // Set loading/cooldown
    setIsLoading(true); setIsOnCooldown(true);
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => { setIsOnCooldown(false); }, SEND_COOLDOWN_MS);

    // Add loading message
    const loadingTime = Date.now() + 1;
    setMessages((prevMessages) => [...prevMessages, { id: loadingTime, text: 'Bot is typing...', sender: 'loading', timestamp: loadingTime }]);

    // Process image
    if (imageToSend) {
      try {
        const base64String = await readFileAsBase64(imageToSend);
        imageDataForApi = { type: imageToSend.type, dataUrl: base64String };
      } catch (error) {
        console.error("Error reading file:", error);
        const errorTime = Date.now() + 2;
        setMessages((prevMessages) => [ ...prevMessages.filter(msg => msg.sender !== 'loading'), { id: errorTime, text: "Error reading image file.", sender: 'bot', timestamp: errorTime } ]);
        setIsLoading(false); setIsOnCooldown(false);
        if(cooldownTimerRef.current){ clearTimeout(cooldownTimerRef.current); }
        return;
      }
    }

    // Get bot response
    let botResponseText = '';
    try {
      // +++ Pass historyToSend to the API call function +++
      botResponseText = await getBotResponse(textTrimmed, imageDataForApi, historyToSend, selectedModel, accessKey);
    } catch (error) {
      console.error("Failed to get bot response:", error);
      botResponseText = error instanceof Error ? `Error: ${error.message}` : "An unknown error occurred.";
    } finally {
      const botTime = Date.now() + 2;
      const newBotMessage: Message = { id: botTime, text: botResponseText, sender: 'bot', timestamp: botTime };
      // Corrected typo in this setMessages call
      setMessages((prevMessages) => [
        ...prevMessages.filter(msg => msg.sender !== 'loading'), // Use 'prevMessages' here
        newBotMessage
      ]);
      setIsLoading(false); // Reset loading state
    }
  // Dependency array includes messages now
  }, [messages, isLoading, isOnCooldown, input, selectedImage, setMessages, selectedModel, accessKey]);


  // --- Event Handlers ---
  const handleSend = () => { sendMessage(input, selectedImage); }
  const handleSuggestionClick = useCallback((suggestionText: string) => { sendMessage(suggestionText, null); }, [sendMessage]); // sendMessage dependency handles updates
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setInput(event.target.value); };
  const handleKeyPress = (event: React.KeyboardEvent) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } };
  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file && file.type.startsWith('image/')) { setSelectedImage(file); if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); setImagePreviewUrl(URL.createObjectURL(file)); } else { setSelectedImage(null); setImagePreviewUrl(null); if(file) alert("Please select a valid image file."); if (fileInputRef.current) fileInputRef.current.value = ""; } };
  const handleImageUploadClick = () => { fileInputRef.current?.click(); };
  const removeSelectedImage = () => { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
  const handleMicClick = () => { if (!recognitionRef.current || !recognitionAvailable) return alert("Speech recognition not available."); if (isLoading || isOnCooldown || isRecording) { if(isRecording) try { recognitionRef.current.stop(); } catch(e){ setIsRecording(false); } return; } try { recognitionRef.current.lang = sttLang; recognitionRef.current.start(); } catch (e) { console.error("Error starting speech:", e); alert("Could not start recognition."); setIsRecording(false); } };


  // --- JSX Rendering ---
  return (
       <div className="chatbot-container">
         <div className="chatbot-messages">
           {messages.map((message: Message) => {
               let mainText = message.text;
               let suggestions: string[] = [];
               if (message.sender === 'bot' && !mainText.startsWith('Error:')) {
                 const parsed = parseSuggestions(message.text);
                 mainText = parsed.mainText;
                 suggestions = parsed.suggestions;
               }
               return (
                 <div key={message.id} className={`message-wrapper message-wrapper-${message.sender}`}>
                   <div className={`message ${message.sender}`}>
                     {message.sender === 'bot' ? (
                       <ReactMarkdown remarkPlugins={[remarkGfm]} children={mainText || ''}/>
                     ) : message.sender === 'loading' ? (
                       <i>{mainText}</i>
                     ) : (
                       // Render user text within a <p> tag for consistent paragraph spacing controlled by CSS
                       <p>{mainText}</p>
                     )}
                   </div>
                   {message.sender !== 'loading' && message.timestamp && (
                     <span className="message-timestamp">{formatTime(message.timestamp)}</span>
                   )}
                   {suggestions.length > 0 && (
                     <div className="suggestions-container">
                       {suggestions.map((suggestion, index) => (
                         <button
                           key={index} className="suggestion-button"
                           onClick={() => handleSuggestionClick(suggestion)}
                           disabled={isLoading || isOnCooldown}
                         > {suggestion} </button>
                       ))}
                     </div>
                   )}
                 </div>
               );
           })}
            <div ref={messagesEndRef} /> {/* For auto-scrolling */}
         </div>

         {/* Image Preview Area */}
         {imagePreviewUrl && (
           <div className="image-preview-area">
             <img src={imagePreviewUrl} alt="Preview" style={{maxHeight: '50px', maxWidth: '50px', objectFit: 'cover', marginRight: '10px', borderRadius: '4px'}} />
             <button onClick={removeSelectedImage} title="Remove image" className="remove-image-button">X</button>
           </div>
         )}

         {/* Input Area */}
         <div className="chatbot-input-area">
            <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/png, image/jpeg, image/gif, image/webp" style={{ display: 'none' }} />
            <button onClick={handleImageUploadClick} className="upload-button" title="Upload Image" disabled={isLoading || isOnCooldown}>📎</button>
            <input type="text" value={input} onChange={handleInputChange} onKeyPress={handleKeyPress} placeholder="Type message or speak..." disabled={isLoading || isOnCooldown}/>
            {recognitionAvailable && (
              <button onClick={handleMicClick} className={`mic-button ${isRecording ? 'recording' : ''}`} title={isRecording ? "Stop Recording" : `Start Recording (${sttLang})`} disabled={isLoading || isOnCooldown}>
                {isRecording ? '■' : '🎙️'}
              </button>
            )}
            <button onClick={handleSend} disabled={isLoading || isOnCooldown || (!input.trim() && !selectedImage)} title="Send">
               {/* Send icon (Plane) */}
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="1.2em" height="1.2em"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /></svg>
            </button>
         </div>
       </div>
   );
}

export default ChatbotPage;