// src/ChatbotPage.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
// Ensure Message, GeminiModel, SpeechLanguage, and Persona are exported from App.tsx
import { Message, GeminiModel, SpeechLanguage, Persona } from './App';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Define the Worker URL - Make sure this is correct
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';

// Helper type for history formatting
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

// Calls the Cloudflare Worker (Handles History, Image Response, and Persona)
async function getBotResponse(
    userInput: string,
    imageData: { type: string; dataUrl: string } | null,
    history: HistoryItem[],
    model: GeminiModel,
    persona: Persona, // Added persona
    accessKey: string
): Promise<{ text: string; imageUrl: string | null }> {
    const promptToSend = userInput || (imageData ? "Describe this image." : "");
    if (!promptToSend && !imageData) {
        return { text: "Please type a message or upload an image.", imageUrl: null };
    }

    const requestBody: {
        prompt: string;
        model: GeminiModel;
        persona: Persona; // Added persona
        imageMimeType?: string;
        imageDataUrl?: string;
        accessKey?: string;
        history?: HistoryItem[];
    } = {
        prompt: promptToSend,
        model: model,
        persona: persona, // Added persona
        accessKey: accessKey,
        history: history
    };

    if (imageData) {
        requestBody.imageMimeType = imageData.type;
        requestBody.imageDataUrl = imageData.dataUrl;
    }

    console.log(`Sending Chat Request to Worker (Model: ${model}, Persona: ${persona}, History: ${history.length})`);

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP error! Status: ${response.status}` }));
            throw new Error(errorData?.error || `HTTP error! Status: ${response.status} ${response.statusText}`);
        }

        const data = await response.json(); // Expects { reply: string, imageUrl?: string | null }
        if (data.error) { throw new Error(data.error); }

        console.log('Received reply object from Worker:', data);
        // Return object, ensuring imageUrl is explicitly null if missing/falsy
        return {
            text: data.reply || 'Sorry, I received an empty reply.',
            imageUrl: data.imageUrl || null
        };

    } catch (error) {
        console.error('Error fetching bot response:', error);
        const errorMsg = error instanceof Error ? `Error: ${error.message}` : 'Error: Could not fetch response.';
        return { text: errorMsg, imageUrl: null }; // Return object structure on error
    }
}

// Parses suggestions like [Suggestion: Text] from text
function parseSuggestions(text: string): { mainText: string; suggestions: string[] } {
    const suggestions: string[] = [];
    const regex = /\[Suggestion:\s*([^\]]+?)\]/g;
    // Replace matches and collect suggestions
    const mainText = text.replace(regex, (_match, suggestionText) => {
        if (typeof suggestionText === 'string') {
            suggestions.push(suggestionText.trim());
        }
        return ''; // Remove the tag from the main text
    }).trim();
    return { mainText, suggestions };
}

// Formats timestamp e.g., "16:37"
function formatTime(timestamp: number): string {
    if (!timestamp || typeof timestamp !== 'number') return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString(navigator.language || 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false // Use 24-hour format
      });
    } catch (e) {
      console.error("Error formatting time:", e);
      return '';
    }
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
  selectedPersona: Persona; // Receive selected persona
  accessKey: string;
}

const SEND_COOLDOWN_MS = 3000; // 3 seconds

function ChatbotPage({
    messages,
    setMessages,
    selectedModel,
    sttLang,
    selectedPersona, // Use selected persona
    accessKey
}: ChatbotPageProps) {
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
  // Auto-scroll effect
  const scrollToBottom = useCallback(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  useEffect(() => {
      const timer = setTimeout(scrollToBottom, 100); // Timeout helps ensure DOM is updated
      return () => clearTimeout(timer);
  }, [messages, scrollToBottom]);

  // Image preview URL cleanup effect
  useEffect(() => {
      return () => { if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); } };
  }, [imagePreviewUrl]);

  // Cooldown timer cleanup effect
  useEffect(() => {
      return () => { if (cooldownTimerRef.current) { clearTimeout(cooldownTimerRef.current); } };
  }, []);

  // Speech recognition initialization effect
  useEffect(() => {
      if (!recognitionAvailable) { console.warn("Speech Recognition not available."); return; }
      if (!recognitionRef.current) {
          try {
              recognitionRef.current = new SpeechRecognitionImpl();
              if (!recognitionRef.current) return;

              recognitionRef.current.continuous = false;
              recognitionRef.current.interimResults = false;

              recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
                  const transcript = event.results[event.results.length - 1]?.[0]?.transcript;
                  if (transcript) { setInput(transcript); }
                  setIsRecording(false);
              };
              recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
                  console.error('Speech recognition error:', event.error, event.message);
                  alert(`Speech error: ${event.error} - ${event.message || 'Unknown error'}`);
                  setIsRecording(false);
              };
              recognitionRef.current.onstart = () => { setIsRecording(true); };
              recognitionRef.current.onend = () => { setIsRecording(false); };

          } catch (error) { console.error("Failed to initialize SpeechRecognition:", error); }
      }
      return () => { if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch(e){ /* ignore */ } } };
  }, []); // Empty dependency array


  // --- Core Send Logic ---
  const sendMessage = useCallback(async (messageText: string, imageFile: File | null) => {
    const textTrimmed = messageText.trim();
    if ((!textTrimmed && !imageFile) || isLoading || isOnCooldown) return;

    const currentTime = Date.now();
    const imageToSend = imageFile;
    let imageDataForApi: { type: string; dataUrl: string } | null = null;

    // --- Prepare History ---
    const MAX_HISTORY_MESSAGES = 30;
    const relevantHistory = messages
        .filter(msg => (msg.sender === 'user' || msg.sender === 'bot') && msg.text) // Ensure text exists
        .slice(-MAX_HISTORY_MESSAGES);

    const historyToSend: HistoryItem[] = relevantHistory.map(msg => ({
        sender: msg.sender as 'user' | 'bot',
        text: msg.text
    }));

    // Create and add the user's message
    const newUserMessage: Message = {
      id: currentTime,
      text: textTrimmed + (imageToSend ? ' (+image)' : ''),
      sender: 'user',
      timestamp: currentTime,
      imageUrl: undefined
    };
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);

    // --- Clear relevant state after adding user message ---
    if (imageToSend && imageToSend === selectedImage) {
        setSelectedImage(null);
        setImagePreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }
    if (messageText === input) {
        setInput('');
    }

    // --- Set loading/cooldown state ---
    setIsLoading(true);
    setIsOnCooldown(true);
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => { setIsOnCooldown(false); }, SEND_COOLDOWN_MS);

    // --- Add visual loading indicator ---
    const loadingTime = Date.now() + 1;
    setMessages((prevMessages) => [...prevMessages, { id: loadingTime, text: 'Bot is typing...', sender: 'loading', timestamp: loadingTime }]);

    // --- Process image if sending one ---
    if (imageToSend) {
      try {
        const base64String = await readFileAsBase64(imageToSend);
        imageDataForApi = { type: imageToSend.type, dataUrl: base64String };
      } catch (error) {
        console.error("Error reading image file:", error);
        const errorTime = Date.now() + 2;
        setMessages((prevMessages) => [ ...prevMessages.filter(msg => msg.sender !== 'loading'), { id: errorTime, text: "Error reading image file.", sender: 'bot', timestamp: errorTime }]);
        setIsLoading(false); setIsOnCooldown(false);
        if(cooldownTimerRef.current){ clearTimeout(cooldownTimerRef.current); }
        return;
      }
    }

    // --- Get bot response ---
    let botResponse: { text: string; imageUrl: string | null } = { text: '', imageUrl: null };
    try {
      // Pass selectedPersona to the API call function
      botResponse = await getBotResponse(
          textTrimmed,
          imageDataForApi,
          historyToSend,
          selectedModel,
          selectedPersona, // Pass persona
          accessKey
      );
    } catch (error) {
      console.error("Error occurred during getBotResponse call:", error);
      const errorMsg = error instanceof Error ? `Error: ${error.message}` : "An unknown error occurred.";
      botResponse = { text: errorMsg, imageUrl: null };
    } finally {
      const botTime = Date.now() + 2;
      const newBotMessage: Message = {
          id: botTime,
          text: botResponse.text,
          sender: 'bot',
          timestamp: botTime,
          imageUrl: botResponse.imageUrl ?? undefined
      };
      setMessages((prevMessages) => [
        ...prevMessages.filter(msg => msg.sender !== 'loading'),
        newBotMessage
      ]);
      setIsLoading(false);
    }
  // Add selectedPersona to dependency array
  }, [messages, isLoading, isOnCooldown, input, selectedImage, setMessages, selectedModel, selectedPersona, accessKey]);


  // --- Event Handlers ---
  const handleSend = () => { sendMessage(input, selectedImage); }
  const handleSuggestionClick = useCallback((suggestionText: string) => {
      sendMessage(suggestionText, null); // Pass null for imageFile
  }, [sendMessage]); // Depends only on sendMessage
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setInput(event.target.value); };
  const handleKeyPress = (event: React.KeyboardEvent) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } };
  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file && file.type.startsWith('image/')) {
          setSelectedImage(file);
          if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
          setImagePreviewUrl(URL.createObjectURL(file));
      } else {
          setSelectedImage(null);
          setImagePreviewUrl(null);
          if (file) alert("Please select a valid image file (PNG, JPG, GIF, WEBP).");
          if (fileInputRef.current) fileInputRef.current.value = "";
      }
  };
  const handleImageUploadClick = () => { fileInputRef.current?.click(); };
  const removeSelectedImage = () => {
      setSelectedImage(null);
      setImagePreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
  }
  const handleMicClick = () => {
      if (!recognitionRef.current || !recognitionAvailable) { return alert("Speech recognition not initialized or not available."); }
      if (isLoading || isOnCooldown || isRecording) {
          if (isRecording) {
              try { recognitionRef.current.stop(); } catch(e){ console.warn("Error stopping speech recognition", e); setIsRecording(false); }
          }
          return;
      }
      try {
          recognitionRef.current.lang = sttLang; // Set language from state
          recognitionRef.current.start();
          setIsRecording(true);
      } catch (e) {
          console.error("Error starting speech recognition:", e);
          alert("Could not start recognition. Please check microphone permissions.");
          setIsRecording(false);
      }
  };


  // --- JSX Rendering ---
  return (
       <div className="chatbot-container">
         {/* Messages Area */}
         <div className="chatbot-messages">
           {messages.map((message: Message) => {
               let mainText = message.text;
               let suggestions: string[] = [];
               if (message.sender === 'bot' && mainText && !mainText.startsWith('Error:')) {
                 const parsed = parseSuggestions(mainText);
                 mainText = parsed.mainText;
                 suggestions = parsed.suggestions;
               }

               return (
                 <div key={message.id} className={`message-wrapper message-wrapper-${message.sender}`}>
                   <div className={`message ${message.sender}`}>
                     {/* Bot Message Content */}
                     {message.sender === 'bot' ? (
                        <>
                          {/* Render Text */}
                          {mainText && mainText.trim() !== '' && !mainText.startsWith('Error:') && (
                             <ReactMarkdown remarkPlugins={[remarkGfm]} children={mainText}/>
                          )}
                          {/* Render Image */}
                          {message.imageUrl && (
                            <img src={message.imageUrl} alt="Bot response" style={{ maxWidth: '100%', maxHeight: '350px', display: 'block', marginTop: mainText && mainText.trim() !== '' ? '8px' : '0px', borderRadius: '8px', cursor:'pointer' }} onClick={() => window.open(message.imageUrl, '_blank')} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                          )}
                           {/* Handle empty valid response */}
                           {!(mainText && mainText.trim() !== '') && !message.imageUrl && !(message.text && message.text.startsWith('Error:')) && ( <i>[Empty response]</i> )}
                           {/* Display errors */}
                           {message.text && message.text.startsWith('Error:') && ( <p style={{color: 'var(--remove-button-bg, red)'}}>{message.text}</p> )}
                        </>
                     ) : message.sender === 'loading' ? (
                       <i>{message.text}</i> // Loading Indicator
                     ) : (
                       <p>{message.text}</p> // User Message
                     )}
                   </div>
                   {/* Timestamp */}
                   {message.sender !== 'loading' && message.timestamp && (
                     <span className="message-timestamp">{formatTime(message.timestamp)}</span>
                   )}
                   {/* Suggestions */}
                   {suggestions.length > 0 && (
                     <div className="suggestions-container">
                       {suggestions.map((suggestion, index) => (
                         <button key={index} className="suggestion-button" onClick={() => handleSuggestionClick(suggestion)} disabled={isLoading || isOnCooldown}>
                            {suggestion}
                         </button>
                       ))}
                     </div>
                   )}
                 </div>
               );
           })}
            <div ref={messagesEndRef} /> {/* For scrolling */}
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
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="1.2em" height="1.2em"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /></svg>
            </button>
         </div>
       </div>
   );
}

export default ChatbotPage;