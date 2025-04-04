// src/ChatbotPage.tsx
// Final consolidated version with History Sending, Image Handling, and Type Fixes

import React, { useState, useRef, useEffect, useCallback } from 'react';
// Ensure this import path is correct and App.tsx exports these types
import { Message, GeminiModel, SpeechLanguage } from './App';
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

// Calls the Cloudflare Worker (Handles History & Image Response)
async function getBotResponse(
    userInput: string,
    imageData: { type: string; dataUrl: string } | null,
    history: HistoryItem[],
    model: GeminiModel,
    accessKey: string
// Returns object with text and optional imageUrl (can be null from worker)
): Promise<{ text: string; imageUrl: string | null }> {
    const promptToSend = userInput || (imageData ? "Describe this image." : "");
    if (!promptToSend && !imageData) {
        return { text: "Please type a message or upload an image.", imageUrl: null };
    }

    const requestBody: {
        prompt: string; model: GeminiModel; imageMimeType?: string; imageDataUrl?: string;
        accessKey?: string; history?: HistoryItem[];
    } = { prompt: promptToSend, model: model, accessKey: accessKey, history: history };

    if (imageData) {
        requestBody.imageMimeType = imageData.type;
        requestBody.imageDataUrl = imageData.dataUrl;
    }

    console.log(`Sending Chat Request to Worker (Model: ${model}, History: ${history.length})`);

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

// Formats timestamp e.g., "14:35"
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
  // Ensure Message type imported from App.tsx includes `imageUrl?: string;`
  // If not, the assignment in sendMessage might cause type errors.
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  selectedModel: GeminiModel;
  sttLang: SpeechLanguage;
  accessKey: string;
}

const SEND_COOLDOWN_MS = 3000;

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
              if (!recognitionRef.current) return; // Check instance creation

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
              recognitionRef.current.onend = () => { setIsRecording(false); }; // Ensure state is reset

          } catch (error) { console.error("Failed to initialize SpeechRecognition:", error); }
      }
      // Cleanup function
      return () => { if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch(e){ /* ignore */ } } };
  }, []); // Empty dependency array ensures this runs only once


  // --- Core Send Logic ---
  const sendMessage = useCallback(async (messageText: string, imageFile: File | null) => {
    const textTrimmed = messageText.trim();
    // Prevent sending if loading, on cooldown, or empty input without an image
    if ((!textTrimmed && !imageFile) || isLoading || isOnCooldown) return;

    const currentTime = Date.now();
    const imageToSend = imageFile; // Use the passed argument
    let imageDataForApi: { type: string; dataUrl: string } | null = null;

    // --- Prepare History ---
    const MAX_HISTORY_MESSAGES = 30; // Set history length
    const relevantHistory = messages
        .filter(msg => msg.sender === 'user' || msg.sender === 'bot') // Exclude loading messages
        .slice(-MAX_HISTORY_MESSAGES); // Get the last N messages

    const historyToSend: HistoryItem[] = relevantHistory.map(msg => ({
        sender: msg.sender as 'user' | 'bot',
        text: msg.text // Include original text for context
    }));
    // --- End Prepare History ---

    // Create and add the user's message to the state immediately
    const newUserMessage: Message = {
      id: currentTime,
      text: textTrimmed + (imageToSend ? ' (+image)' : ''), // Add notation if image sent
      sender: 'user',
      timestamp: currentTime,
      imageUrl: undefined // User messages don't have images from the bot
    };
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);

    // --- Clear relevant state after sending ---
    if (imageToSend && imageToSend === selectedImage) {
        setSelectedImage(null);
        setImagePreviewUrl(null); // Existing effect handles revokeObjectURL
        if (fileInputRef.current) fileInputRef.current.value = ""; // Reset file input
    }
    if (messageText === input) { // Clear input only if it was the source
        setInput('');
    }

    // --- Set loading/cooldown state ---
    setIsLoading(true);
    setIsOnCooldown(true);
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => { setIsOnCooldown(false); }, SEND_COOLDOWN_MS);

    // --- Add visual loading indicator ---
    const loadingTime = Date.now() + 1; // Ensure unique ID
    setMessages((prevMessages) => [...prevMessages, { id: loadingTime, text: 'Bot is typing...', sender: 'loading', timestamp: loadingTime }]);

    // --- Process image if sending one ---
    if (imageToSend) {
      try {
        const base64String = await readFileAsBase64(imageToSend);
        imageDataForApi = { type: imageToSend.type, dataUrl: base64String };
      } catch (error) {
        console.error("Error reading image file:", error);
        const errorTime = Date.now() + 2;
        // Replace loading message with error
        setMessages((prevMessages) => [ ...prevMessages.filter(msg => msg.sender !== 'loading'), { id: errorTime, text: "Error reading image file.", sender: 'bot', timestamp: errorTime }]);
        setIsLoading(false); setIsOnCooldown(false);
        if(cooldownTimerRef.current){ clearTimeout(cooldownTimerRef.current); }
        return; // Stop if image processing failed
      }
    }

    // --- Get bot response ---
    let botResponse: { text: string; imageUrl: string | null } = { text: '', imageUrl: null };
    try {
      // Pass history and other necessary data to the API call function
      botResponse = await getBotResponse(textTrimmed, imageDataForApi, historyToSend, selectedModel, accessKey);
    } catch (error) {
      // Catch errors from getBotResponse itself (though it handles internally)
      console.error("Error occurred during getBotResponse call:", error);
      const errorMsg = error instanceof Error ? `Error: ${error.message}` : "An unknown error occurred.";
      botResponse = { text: errorMsg, imageUrl: null };
    } finally {
      const botTime = Date.now() + 2;
      // Create the final bot message object using the response
      const newBotMessage: Message = {
          id: botTime,
          text: botResponse.text,
          sender: 'bot',
          timestamp: botTime,
          // Ensure type compatibility: assign null/string to string | undefined
          // Use nullish coalescing: if botResponse.imageUrl is null, assign undefined
          imageUrl: botResponse.imageUrl ?? undefined
      };
      // Replace loading message with the final bot message
      // Correction for typo was made here previously
      setMessages((prevMessages) => [
        ...prevMessages.filter(msg => msg.sender !== 'loading'),
        newBotMessage
      ]);
      setIsLoading(false); // Reset loading state
    }
  }, [messages, isLoading, isOnCooldown, input, selectedImage, setMessages, selectedModel, accessKey]); // Dependencies for useCallback


  // --- Event Handlers ---
  const handleSend = () => { sendMessage(input, selectedImage); }
  // Use sendMessage directly in useCallback for suggestion click
  const handleSuggestionClick = useCallback((suggestionText: string) => {
      sendMessage(suggestionText, null); // Pass null for imageFile
  }, [sendMessage]); // Depends only on sendMessage
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setInput(event.target.value); };
  const handleKeyPress = (event: React.KeyboardEvent) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } };
  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file && file.type.startsWith('image/')) {
          setSelectedImage(file);
          // Create object URL for preview
          if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); // Clean up previous
          setImagePreviewUrl(URL.createObjectURL(file));
      } else {
          setSelectedImage(null);
          setImagePreviewUrl(null);
          if (file) alert("Please select a valid image file (PNG, JPG, GIF, WEBP).");
          if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input value
      }
  };
  const handleImageUploadClick = () => { fileInputRef.current?.click(); };
  const removeSelectedImage = () => {
      setSelectedImage(null);
      setImagePreviewUrl(null); // Effect hook will revoke URL
      if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input value
  }
  const handleMicClick = () => {
      if (!recognitionRef.current || !recognitionAvailable) { return alert("Speech recognition not initialized or not available."); }
      if (isLoading || isOnCooldown || isRecording) {
          if (isRecording) {
              try { recognitionRef.current.stop(); } catch(e){ console.warn("Error stopping speech recognition", e); setIsRecording(false); }
          }
          return; // Don't start if busy or already recording
      }
      // Start recognition
      try {
          recognitionRef.current.lang = sttLang; // Set language
          recognitionRef.current.start();
          setIsRecording(true); // Set recording state explicitly
      } catch (e) {
          console.error("Error starting speech recognition:", e);
          alert("Could not start recognition. Please check microphone permissions.");
          setIsRecording(false); // Reset state on error
      }
  };


  // --- JSX Rendering ---
  return (
       <div className="chatbot-container">
         {/* Messages Area */}
         <div className="chatbot-messages">
           {messages.map((message: Message) => { // Use Message type from import
               let mainText = message.text;
               let suggestions: string[] = [];
               // Parse suggestions only for actual bot messages (that are not errors)
               if (message.sender === 'bot' && mainText && !mainText.startsWith('Error:')) {
                 const parsed = parseSuggestions(mainText);
                 mainText = parsed.mainText; // Use text without suggestion tags for Markdown
                 suggestions = parsed.suggestions;
               }

               return (
                 <div key={message.id} className={`message-wrapper message-wrapper-${message.sender}`}>
                   {/* Message Bubble */}
                   <div className={`message ${message.sender}`}>
                     {/* Bot Message Content */}
                     {message.sender === 'bot' ? (
                        <>
                          {/* Render Text if it exists and is not just whitespace or an error */}
                          {mainText && mainText.trim() !== '' && !mainText.startsWith('Error:') && (
                             <ReactMarkdown remarkPlugins={[remarkGfm]} children={mainText}/>
                          )}
                          {/* Render Image if imageUrl exists */}
                          {message.imageUrl && (
                            <img
                              src={message.imageUrl}
                              alt="Bot response"
                              style={{ maxWidth: '100%', maxHeight: '350px', display: 'block', marginTop: mainText && mainText.trim() !== '' ? '8px' : '0px', borderRadius: '8px', cursor:'pointer' }}
                              onClick={() => window.open(message.imageUrl, '_blank')}
                              onError={(e) => { e.currentTarget.style.display = 'none'; /* Hide broken image */ }}
                            />
                          )}
                           {/* Handle case where bot response is valid but genuinely empty */}
                          {!(mainText && mainText.trim() !== '') && !message.imageUrl && !(message.text && message.text.startsWith('Error:')) && (
                             <i>[Empty response]</i>
                          )}
                          {/* Display error messages directly */}
                           {message.text && message.text.startsWith('Error:') && (
                             <p style={{color: 'var(--remove-button-bg, red)'}}>{message.text}</p> // Use error color
                           )}
                        </>
                     ) : message.sender === 'loading' ? (
                       // Loading Indicator
                       <i>{message.text}</i>
                     ) : (
                       // User Message
                       <p>{message.text}</p>
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
                         <button
                           key={index}
                           className="suggestion-button"
                           onClick={() => handleSuggestionClick(suggestion)}
                           disabled={isLoading || isOnCooldown}
                         >
                            {suggestion}
                         </button>
                       ))}
                     </div>
                   )}
                 </div>
               );
           })}
            {/* Div for scrolling into view */}
            <div ref={messagesEndRef} />
         </div>

         {/* Image Preview Area (when user selects image to send) */}
         {imagePreviewUrl && (
           <div className="image-preview-area">
             <img src={imagePreviewUrl} alt="Preview" style={{maxHeight: '50px', maxWidth: '50px', objectFit: 'cover', marginRight: '10px', borderRadius: '4px'}} />
             <button onClick={removeSelectedImage} title="Remove image" className="remove-image-button">X</button>
           </div>
         )}

         {/* Input Area */}
         <div className="chatbot-input-area">
            {/* Hidden file input */}
            <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/png, image/jpeg, image/gif, image/webp" style={{ display: 'none' }} />
            {/* Upload Button */}
            <button onClick={handleImageUploadClick} className="upload-button" title="Upload Image" disabled={isLoading || isOnCooldown}>📎</button>
            {/* Text Input */}
            <input type="text" value={input} onChange={handleInputChange} onKeyPress={handleKeyPress} placeholder="Type message or speak..." disabled={isLoading || isOnCooldown}/>
            {/* Mic Button */}
            {recognitionAvailable && (
              <button onClick={handleMicClick} className={`mic-button ${isRecording ? 'recording' : ''}`} title={isRecording ? "Stop Recording" : `Start Recording (${sttLang})`} disabled={isLoading || isOnCooldown}>
                {isRecording ? '■' : '🎙️'}
              </button>
            )}
            {/* Send Button */}
            <button onClick={handleSend} disabled={isLoading || isOnCooldown || (!input.trim() && !selectedImage)} title="Send">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="1.2em" height="1.2em"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /></svg>
            </button>
         </div>
       </div>
   );
}

export default ChatbotPage;