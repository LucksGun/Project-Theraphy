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
// UPDATE: This function now expects the worker response to potentially include 'modelUsed'
async function getBotResponse(
    userInput: string,
    imageData: { type: string; dataUrl: string } | null,
    history: HistoryItem[],
    model: GeminiModel,
    persona: Persona, // Added persona
    accessKey: string
): Promise<{ text: string; imageUrl: string | null; modelUsed?: string }> { // Added modelUsed to return type
    const promptToSend = userInput || (imageData ? "Describe this image." : "");
    if (!promptToSend && !imageData) {
        // Ensure return type matches Promise signature even on early exit
        return { text: "Please type a message or upload an image.", imageUrl: null, modelUsed: undefined };
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
        accessKey: accessKey, // Pass the unique key entered by user
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

        // Handle non-OK responses (like 401, 403 from key validation, or 500)
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP error! Status: ${response.status}` }));
            // Use detailed error from worker if available
            const errorMessage = errorData?.error || `HTTP error! Status: ${response.status} ${response.statusText}`;
            // Throw specific error to be caught below
            throw new Error(errorMessage);
        }

        const data = await response.json(); // Expects { reply: string, imageUrl?: string | null, modelUsed?: string }
        // Check for application-level errors returned even with 200 OK
        if (data.error) { throw new Error(data.error); }

        console.log('Received reply object from Worker:', data);
        // Return object, ensuring imageUrl is explicitly null if missing/falsy
        return {
            text: data.reply || 'Sorry, I received an empty reply.',
            imageUrl: data.imageUrl || null,
            modelUsed: data.modelUsed // Pass through the modelUsed field from worker
        };

    } catch (error) {
        console.error('Error fetching bot response:', error);
        const errorMsg = error instanceof Error ? `Error: ${error.message}` : 'Error: Could not fetch response.';
        // Ensure return type matches Promise signature on error
        return { text: errorMsg, imageUrl: null, modelUsed: undefined };
    }
}

// Parses suggestions like [Suggestion: Text] from text
function parseSuggestions(text: string): { mainText: string; suggestions: string[] } {
    const suggestions: string[] = [];
    // Improved regex to handle potential variations in spacing
    const regex = /\[Suggestion:\s*([\s\S]+?)\s*\]/g;
    let lastIndex = 0;
    const parts: string[] = [];

    let match;
    while ((match = regex.exec(text)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index));
        }
        // Add the suggestion
        if (match[1]) {
            suggestions.push(match[1].trim());
        }
        // Update last index
        lastIndex = regex.lastIndex;
    }

    // Add any remaining text after the last match
    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }

    // Join the non-suggestion parts back together
    const mainText = parts.join('').trim();

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
          hour12: false // Use 24-hour format consistently
      });
    } catch (e) {
      console.error("Error formatting time:", e);
      return '';
    }
}

// --- Speech Recognition Setup ---
const SpeechRecognitionImpl = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
const recognitionAvailable = !!SpeechRecognitionImpl;


// --- Component Definition ---
interface ChatbotPageProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  selectedModel: GeminiModel;
  sttLang: SpeechLanguage;
  selectedPersona: Persona; // Receive selected persona
  accessKey: string; // Receive the unique key entered by user
}

const SEND_COOLDOWN_MS = 3000; // 3 seconds

function ChatbotPage({
    messages,
    setMessages,
    selectedModel,
    sttLang,
    selectedPersona, // Use selected persona
    accessKey // Use the unique key
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
  const scrollToBottom = useCallback(() => {
      setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, 100);
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => { return () => { if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); } }; }, [imagePreviewUrl]);
  useEffect(() => { return () => { if (cooldownTimerRef.current) { clearTimeout(cooldownTimerRef.current); } }; }, []);
  useEffect(() => {
      if (!recognitionAvailable) { console.warn("Speech Recognition not available."); return; }
      if (!recognitionRef.current) {
          try {
              recognitionRef.current = new SpeechRecognitionImpl(); if (!recognitionRef.current) return;
              recognitionRef.current.continuous = false; recognitionRef.current.interimResults = false;
              recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => { const transcript = event.results[event.results.length - 1]?.[0]?.transcript; if (transcript) { setInput(transcript); } setIsRecording(false); };
              recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => { console.error('Speech recognition error:', event.error, event.message); let errorMessage = `Speech error: ${event.error}`; if (event.error === 'no-speech') { errorMessage = "No speech detected."; } else if (event.error === 'audio-capture') { errorMessage = "Microphone error."; } else if (event.error === 'not-allowed') { errorMessage = "Microphone permission denied."; } else { errorMessage += ` - ${event.message || 'Unknown'}`; } alert(errorMessage); setIsRecording(false); };
              recognitionRef.current.onstart = () => { setIsRecording(true); }; recognitionRef.current.onend = () => { setIsRecording(false); }; console.log("Speech Recognition Initialized");
          } catch (error) { console.error("Failed to initialize SpeechRecognition:", error); recognitionRef.current = null; }
      }
      return () => { if (recognitionRef.current && recognitionRef.current.onstart) { try { recognitionRef.current.abort(); console.log("Aborted speech recognition cleanup."); } catch(e){ console.warn("Error aborting speech", e); } } setIsRecording(false); };
  }, []);

  // --- Core Send Logic ---
  const sendMessage = useCallback(async (messageText: string, imageFile: File | null) => {
    const textTrimmed = messageText.trim();
    if ((!textTrimmed && !imageFile) || isLoading || isOnCooldown) { console.log("Send blocked:", {isLoading, isOnCooldown, textTrimmed: !!textTrimmed, imageFile: !!imageFile}); return; }
    const currentTime = Date.now(); const imageToSend = imageFile; let imageDataForApi: { type: string; dataUrl: string } | null = null;
    const MAX_HISTORY_MESSAGES = 30; const relevantHistory = messages .filter(msg => (msg.sender === 'user' || msg.sender === 'bot') && msg.text) .slice(-MAX_HISTORY_MESSAGES);
    const historyToSend: HistoryItem[] = relevantHistory.map(msg => ({ sender: msg.sender as 'user' | 'bot', text: msg.text }));
    const newUserMessage: Message = { id: currentTime, text: textTrimmed + (imageToSend ? ' (+image)' : ''), sender: 'user', timestamp: currentTime, imageUrl: undefined }; setMessages((prevMessages) => [...prevMessages, newUserMessage]);
    if (imageToSend && imageToSend === selectedImage) { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; } if (messageText === input) { setInput(''); }
    setIsLoading(true); setIsOnCooldown(true); if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current); cooldownTimerRef.current = setTimeout(() => { setIsOnCooldown(false); }, SEND_COOLDOWN_MS);
    const loadingTime = Date.now() + 1; const loadingMessage: Message = { id: loadingTime, text: 'Bot is typing...', sender: 'loading', timestamp: loadingTime }; setMessages((prevMessages) => [...prevMessages, loadingMessage]);
    if (imageToSend) { try { if (!imageToSend.type.startsWith('image/')) { throw new Error("Invalid file type."); } const base64String = await readFileAsBase64(imageToSend); imageDataForApi = { type: imageToSend.type, dataUrl: base64String }; } catch (error) { console.error("Error reading image file:", error); const errorTime = Date.now() + 2; setMessages((prevMessages) => [ ...prevMessages.filter(msg => msg.id !== loadingTime), { id: errorTime, text: `Error reading image file: ${error instanceof Error ? error.message : 'Unknown Error'}`, sender: 'bot', timestamp: errorTime }]); setIsLoading(false); setIsOnCooldown(false); if(cooldownTimerRef.current){ clearTimeout(cooldownTimerRef.current); } return; } }
    let botResponse: { text: string; imageUrl: string | null; modelUsed?: string } = { text: '', imageUrl: null, modelUsed: undefined };
    try { botResponse = await getBotResponse(textTrimmed, imageDataForApi, historyToSend, selectedModel, selectedPersona, accessKey); } // Pass unique user key
    catch (error) { console.error("Error during getBotResponse call:", error); const errorMsg = error instanceof Error ? `Error: ${error.message}` : "Unknown error fetching response."; botResponse = { text: errorMsg, imageUrl: null, modelUsed: undefined }; }
    finally {
      setIsLoading(false); // Reset loading here
      const botTime = Date.now() + 2;
      // Add modelUsed to message if available - FOR DEBUGGING, you might display this
      // console.log("Bot response included modelUsed:", botResponse.modelUsed);
      const newBotMessage: Message = { id: botTime, text: botResponse.text, sender: 'bot', timestamp: botTime, imageUrl: botResponse.imageUrl ?? undefined /*, modelUsed: botResponse.modelUsed */ }; // Add modelUsed here if extending Message interface
      setMessages((prevMessages) => [ ...prevMessages.filter(msg => msg.id !== loadingTime), newBotMessage ]);
    }
  }, [messages, isLoading, isOnCooldown, input, selectedImage, setMessages, selectedModel, selectedPersona, accessKey]); // Added accessKey dependency

  // --- Event Handlers ---
  const handleSend = () => { sendMessage(input, selectedImage); };
  const handleSuggestionClick = useCallback((suggestionText: string) => { sendMessage(suggestionText, null); }, [sendMessage]);
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setInput(event.target.value); };
  const handleKeyPress = (event: React.KeyboardEvent) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } };
  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file && file.type.startsWith('image/')) { const MAX_SIZE_MB = 3.8; if (file.size > MAX_SIZE_MB * 1024 * 1024) { alert(`Image too large (Max ${MAX_SIZE_MB} MB).`); if (fileInputRef.current) fileInputRef.current.value = ""; return; } setSelectedImage(file); if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); setImagePreviewUrl(URL.createObjectURL(file)); }
      else { setSelectedImage(null); setImagePreviewUrl(null); if (file) alert("Invalid image file type."); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };
  const handleImageUploadClick = () => { fileInputRef.current?.click(); };
  const removeSelectedImage = () => { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; };
  const handleMicClick = () => {
      if (!recognitionRef.current || !recognitionAvailable) { return alert("Speech recognition not available."); } if (isLoading || isOnCooldown) { console.log("Mic blocked: loading/cooldown"); return; }
      if (isRecording) { try { recognitionRef.current.stop(); console.log("Speech recognition stopped."); } catch(e){ console.warn("Error stopping speech", e); } }
      else { try { recognitionRef.current.lang = sttLang; recognitionRef.current.start(); console.log("Speech recognition started:", sttLang); } catch (e) { if (e instanceof DOMException && e.name === 'InvalidStateError') { alert("Wait before starting recognition again."); } else { console.error("Error starting speech:", e); alert("Cannot start recognition. Check permissions/mic."); } setIsRecording(false); } }
  };

  // --- JSX Rendering ---
  return (
      <div className="chatbot-container">
        {/* Messages Area */}
        <div className="chatbot-messages">
          {messages.map((message: Message) => {
              let mainText = message.text; let suggestions: string[] = [];
              if (message.sender === 'bot' && mainText && !mainText.startsWith('Error:')) { const parsed = parseSuggestions(mainText); mainText = parsed.mainText; suggestions = parsed.suggestions; }
              return (
                <div key={message.id} className={`message-wrapper message-wrapper-${message.sender}`}>
                  <div className={`message ${message.sender}`}>
                    {message.sender === 'bot' ? (
                      <>
                        {mainText && mainText.trim() !== '' && !mainText.startsWith('Error:') && ( <ReactMarkdown remarkPlugins={[remarkGfm]} children={mainText}/> )}
                        {message.imageUrl && ( <img src={message.imageUrl} alt="Bot response" style={{ maxWidth: '100%', maxHeight: '350px', display: 'block', marginTop: mainText && mainText.trim() !== '' ? '8px' : '0px', borderRadius: '8px', cursor:'pointer' }} onClick={() => window.open(message.imageUrl, '_blank')} onError={(e) => { console.warn("Image load fail:", message.imageUrl); e.currentTarget.style.display = 'none'; }} /> )}
                        {!(mainText && mainText.trim() !== '') && !message.imageUrl && !(message.text && message.text.startsWith('Error:')) && ( <i>[Empty response]</i> )}
                        {message.text && message.text.startsWith('Error:') && ( <p style={{color: 'var(--remove-button-bg, red)'}}>{message.text}</p> )}
                      </>
                    ) : message.sender === 'loading' ? ( <i>{message.text}</i> ) : ( <p style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p> )}
                  </div>
                  {message.sender !== 'loading' && message.timestamp && ( <span className="message-timestamp">{formatTime(message.timestamp)}</span> )}
                  {suggestions.length > 0 && (
                    <div className="suggestions-container">
                      {suggestions.map((suggestion, index) => ( <button key={`${message.id}-sugg-${index}`} className="suggestion-button" onClick={() => handleSuggestionClick(suggestion)} disabled={isLoading || isOnCooldown}> {suggestion} </button> ))}
                    </div>
                  )}
                </div>
              );
          })}
          <div ref={messagesEndRef} style={{ height: '1px' }} />
        </div>

        {/* Image Preview Area */}
        {imagePreviewUrl && ( <div className="image-preview-area"> <img src={imagePreviewUrl} alt="Preview" style={{maxHeight: '50px', maxWidth: '50px', objectFit: 'cover', marginRight: '10px', borderRadius: '4px'}} /> <button onClick={removeSelectedImage} title="Remove image" className="remove-image-button">X</button> </div> )}

        {/* Input Area */}
        <div className="chatbot-input-area">
          <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/png, image/jpeg, image/gif, image/webp" style={{ display: 'none' }} />
          <button onClick={handleImageUploadClick} className="upload-button" title="Upload Image" disabled={isLoading || isOnCooldown} aria-label="Upload image"> 📎 </button>
          <input type="text" value={input} onChange={handleInputChange} onKeyPress={handleKeyPress} placeholder="Type message or speak..." disabled={isLoading || isOnCooldown} aria-label="Chat input" />
          {recognitionAvailable && ( <button onClick={handleMicClick} className={`mic-button ${isRecording ? 'recording' : ''}`} title={isRecording ? "Stop Recording" : `Start Recording (${sttLang})`} disabled={isLoading || isOnCooldown} aria-label={isRecording ? "Stop voice recording" : "Start voice recording"}> {isRecording ? '■' : '🎙️'} </button> )}
          <button onClick={handleSend} disabled={isLoading || isOnCooldown || (!input.trim() && !selectedImage)} title="Send message" aria-label="Send message"> <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="1.2em" height="1.2em" aria-hidden="true"> <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /> </svg> </button>
        </div>
      </div>
    );
}

export default ChatbotPage;