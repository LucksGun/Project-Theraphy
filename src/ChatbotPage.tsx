// src/ChatbotPage.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
// Ensure this import is correct
import { Message, GeminiModel, SpeechLanguage } from './App';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Define the Worker URL
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/'; // Replace if needed

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

// Calls the Cloudflare Worker
async function getBotResponse(
    userInput: string,
    imageData: { type: string; dataUrl: string } | null,
    model: GeminiModel,
    accessKey: string // Accept accessKey
): Promise<string> {
    const promptToSend = userInput || (imageData ? "Describe this image." : "");
    if (!promptToSend && !imageData) {
        return "Please type a message or upload an image.";
    }

    const requestBody: {
        prompt: string;
        model: GeminiModel;
        imageMimeType?: string;
        imageDataUrl?: string;
        accessKey?: string; // Include accessKey field
    } = {
        prompt: promptToSend,
        model: model,
        accessKey: accessKey // Pass the key from parameter
    };

    if (imageData) {
        requestBody.imageMimeType = imageData.type;
        requestBody.imageDataUrl = imageData.dataUrl;
    }

    console.log(`Sending to Worker (Using Model: ${model}):`, {
        prompt: requestBody.prompt,
        imageMimeType: requestBody.imageMimeType ? 'present' : 'none',
        model: requestBody.model,
        accessKey: requestBody.accessKey ? 'present' : 'none' // Avoid logging key value
    });

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({
                error: `HTTP error! Status: ${response.status} ${response.statusText}`
            }));
            // Use error message from response body if available
            throw new Error(errorData?.error || `HTTP error! Status: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error); // Throw error sent back from worker (like 403)
        }

        console.log('Received reply from Worker:', data.reply);
        return data.reply || 'Sorry, I received an empty reply.';

    } catch (error) {
        console.error('Error fetching bot response:', error);
        // Ensure error message is propagated
        if (error instanceof Error) {
            return `Error: ${error.message}`;
        }
        return 'Error: Could not fetch response.';
    }
}

// Parses suggestions from text
function parseSuggestions(text: string): { mainText: string; suggestions: string[] } {
    const suggestions: string[] = [];
    // Regex to find [Suggestion: Text]
    const regex = /\[Suggestion:\s*([^\]]+?)\]/g;
    // Replace suggestions in text and collect them
    const mainText = text.replace(regex, (_match, suggestionText) => {
        if (typeof suggestionText === 'string') {
            suggestions.push(suggestionText.trim());
        }
        return ''; // Remove the suggestion tag from main text
    }).trim(); // Trim whitespace
    return { mainText, suggestions };
}

// Formats timestamp
function formatTime(timestamp: number): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString(navigator.language || 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false // Use 24-hour format
    });
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
  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  useEffect(() => {
    // Timeout gives time for render
    const timer = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timer);
  }, [messages, scrollToBottom]);

  // Image preview cleanup
  useEffect(() => {
    // Cleanup function to revoke object URL when component unmounts or preview changes
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  // Cooldown timer cleanup
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  // Speech Recognition Initialization
  useEffect(() => {
    if (!recognitionAvailable) {
      console.warn("Speech Recognition not available in this browser.");
      return;
    }
    // Initialize only once
    if (!recognitionRef.current) {
      try {
        recognitionRef.current = new SpeechRecognitionImpl();
        if (!recognitionRef.current) return; // Check if constructor failed

        recognitionRef.current.continuous = false; // Only process final result
        recognitionRef.current.interimResults = false;

        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = event.results[event.results.length - 1]?.[0]?.transcript;
          if (transcript) {
            setInput(transcript); // Set input field with transcript
          }
          setIsRecording(false); // Turn off recording state
        };

        recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error, event.message);
          alert(`Speech error: ${event.error} - ${event.message}`);
          setIsRecording(false); // Turn off recording state
        };

        recognitionRef.current.onstart = () => { setIsRecording(true); };
        recognitionRef.current.onend = () => { setIsRecording(false); }; // Ensure recording state is off

      } catch (error) {
        console.error("Failed to initialize SpeechRecognition:", error);
        // recognitionAvailable = false; // Mark as unavailable if init fails
      }
    }

    // Cleanup on unmount
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } // Stop any active recognition
        catch(e){ console.warn("Error aborting speech recognition on cleanup", e); }
      }
    };
  }, []); // Empty dependency array ensures this runs only once

  // --- Core Send Logic ---
  const sendMessage = useCallback(async (messageText: string, imageFile: File | null) => {
    const textTrimmed = messageText.trim();
    if ((textTrimmed === '' && !imageFile) || isLoading || isOnCooldown) return; // Prevent empty/spam sends

    const currentTime = Date.now();
    const imageToSend = imageFile; // Use the file passed in
    let imageDataForApi: { type: string; dataUrl: string } | null = null;

    // Create user message object adhering to the interface
    const newUserMessage: Message = {
      id: currentTime,
      text: textTrimmed + (imageToSend ? ' (+image)' : ''), // Indicate if image was sent
      sender: 'user',
      timestamp: currentTime
    };
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);

    // Clear states after adding message to list
    if (imageToSend && imageToSend === selectedImage) {
      setSelectedImage(null);
      setImagePreviewUrl(null); // Revoke handled by effect cleanup
      if (fileInputRef.current) fileInputRef.current.value = ""; // Reset file input
    }
    if(messageText === input) { // Only clear input if it came from the input field
      setInput('');
    }

    // Set loading and cooldown states
    setIsLoading(true);
    setIsOnCooldown(true);
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current); // Clear existing timer
    cooldownTimerRef.current = setTimeout(() => { setIsOnCooldown(false); }, SEND_COOLDOWN_MS); // Set new timer

    // Add loading indicator message
    const loadingTime = Date.now() + 1; // Ensure unique ID
    setMessages((prevMessages) => [...prevMessages, { id: loadingTime, text: 'Bot is typing...', sender: 'loading', timestamp: loadingTime }]);

    // Process image if present
    if (imageToSend) {
      try {
        const base64String = await readFileAsBase64(imageToSend);
        imageDataForApi = { type: imageToSend.type, dataUrl: base64String };
      } catch (error) {
        console.error("Error reading file:", error);
        const errorTime = Date.now() + 2;
        setMessages((prevMessages) => [
          ...prevMessages.filter(msg => msg.sender !== 'loading'), // Remove loading message
          { id: errorTime, text: "Error reading image file.", sender: 'bot', timestamp: errorTime }
        ]);
        setIsLoading(false);
        setIsOnCooldown(false); // Reset cooldown on file error
        if(cooldownTimerRef.current){ clearTimeout(cooldownTimerRef.current); }
        return; // Stop processing
      }
    }

    // Get bot response
    let botResponseText = '';
    try {
      // Pass necessary data including accessKey
      botResponseText = await getBotResponse(textTrimmed, imageDataForApi, selectedModel, accessKey);
    } catch (error) {
      console.error("Failed to get bot response:", error);
      botResponseText = error instanceof Error ? `Error: ${error.message}` : "An unknown error occurred.";
    } finally {
      const botTime = Date.now() + 2; // Ensure unique ID
      // Create bot message object adhering to the interface
      const newBotMessage: Message = {
        id: botTime,
        text: botResponseText,
        sender: 'bot',
        timestamp: botTime
      };
      // Replace loading message with the actual response
      setMessages((prevMessages) => [
        ...prevMessages.filter(msg => msg.sender !== 'loading'),
        newBotMessage
      ]);
      setIsLoading(false); // Reset loading state
    }
  }, [isLoading, isOnCooldown, input, selectedImage, setMessages, selectedModel, accessKey]); // Include accessKey dependency

  // --- Event Handlers ---
  const handleSend = () => { sendMessage(input, selectedImage); }
  const handleSuggestionClick = useCallback((suggestionText: string) => { sendMessage(suggestionText, null); }, [sendMessage]);
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setInput(event.target.value); };
  const handleKeyPress = (event: React.KeyboardEvent) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } };
  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file && file.type.startsWith('image/')) { setSelectedImage(file); if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); } setImagePreviewUrl(URL.createObjectURL(file)); } else { setSelectedImage(null); setImagePreviewUrl(null); if(file) alert("Please select a valid image file."); if (fileInputRef.current) fileInputRef.current.value = ""; } };
  const handleImageUploadClick = () => { fileInputRef.current?.click(); };
  const removeSelectedImage = () => { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
  const handleMicClick = () => { if (!recognitionRef.current || !recognitionAvailable) { alert("Speech recognition not initialized or not available."); return; } if (isLoading || isOnCooldown || isRecording) { if(isRecording) { try { recognitionRef.current.stop(); } catch(e){ console.warn("Error stopping speech recognition", e); setIsRecording(false);}} return; } try { recognitionRef.current.lang = sttLang; recognitionRef.current.start(); } catch (e) { console.error("Error starting speech recognition:", e); alert("Could not start recognition. Please allow microphone permission."); setIsRecording(false); } };


  // --- JSX Rendering ---
  return (
       <div className="chatbot-container">
         <div className="chatbot-messages">
           {messages.map((message: Message) => {
               let mainText = message.text;
               let suggestions: string[] = [];
               // Parse suggestions only for actual bot messages (not loading/error messages)
               if (message.sender === 'bot' && !mainText.startsWith('Error:')) {
                 const parsed = parseSuggestions(message.text);
                 mainText = parsed.mainText;
                 suggestions = parsed.suggestions;
               }
               return (
                 <div key={message.id} className={`message-wrapper message-wrapper-${message.sender}`}>
                   <div className={`message ${message.sender}`}>
                     {message.sender === 'bot' ? (
                       // Render markdown for bot, handle empty string
                       <ReactMarkdown remarkPlugins={[remarkGfm]} children={mainText || ''}/>
                     ) : message.sender === 'loading' ? (
                       <i>{mainText}</i> // Italicize loading text
                     ) : (
                       // Plain text for user messages
                       <p>{mainText}</p>
                     )}
                   </div>
                   {/* Show timestamp for non-loading messages */}
                   {message.sender !== 'loading' && message.timestamp && (
                     <span className="message-timestamp">{formatTime(message.timestamp)}</span>
                   )}
                   {/* Show suggestion buttons if any were parsed */}
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
            <div ref={messagesEndRef} /> {/* Element to scroll to */}
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
                 {isRecording ? '■' : '🎙️'} {/* Square for stop, Mic for start */}
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