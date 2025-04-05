// src/ChatbotPage.tsx - Corrected with nextSibling fix and botResponse initialization
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message, GeminiModel, SpeechLanguage, Persona } from './App'; // Assuming App.tsx exports these types
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'; // For GitHub Flavored Markdown (tables, strikethrough, etc.)

// --- Constants ---
const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/'; // Make sure this matches App.tsx
const SEND_COOLDOWN_MS = 1500;
const MAX_HISTORY = 20;
const MAX_IMAGE_SIZE_MB = 3.8;

// Define the structure for history items sent to the worker
type HistoryItem = {
    role: 'user' | 'model';
    parts: { text: string }[];
}

// --- Helper Functions ---
function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}

// Function to call the backend worker
async function getBotResponse(
    userInput: string,
    imageData: { type: string; dataUrl: string } | null,
    history: HistoryItem[],
    model: GeminiModel,
    persona: Persona,
    accessKey: string
): Promise<{ text: string; imageUrl: string | null; modelUsed?: string; username?: string }> {

    const promptToSend = userInput || (imageData ? "Describe this image." : "");
    if (!promptToSend && !imageData) {
        return { text: "Error: Cannot send empty message.", imageUrl: null };
    }

    const requestBody: {
        action: 'chat';
        prompt: string;
        model: GeminiModel;
        persona: Persona;
        imageMimeType?: string;
        imageDataUrl?: string;
        accessKey?: string;
        history?: HistoryItem[];
    } = {
        action: 'chat',
        prompt: promptToSend,
        model: model,
        persona: persona,
        accessKey: accessKey || undefined,
        history: history,
    };

    if (imageData) {
        requestBody.imageMimeType = imageData.type;
        requestBody.imageDataUrl = imageData.dataUrl;
    }

    console.log(`Sending Chat Request (Model: ${model}, Persona: ${persona}, History: ${history.length}, Image: ${!!imageData})`);

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        const responseData = await response.json().catch(() => {
            console.error("Received non-JSON response status:", response.status, response.statusText);
            return { error: `Server error: Received invalid response format (Status: ${response.status})` };
        });

        if (!response.ok) {
            throw new Error(responseData?.error || `API Error: ${response.status} ${response.statusText}`);
        }

        if (responseData.error) { // Handle application-level errors even with 2xx status
            throw new Error(responseData.error);
        }

        console.log('Received response from Worker:', responseData);
        return {
            text: responseData.reply || '', // Return empty string if no reply
            imageUrl: responseData.imageUrl || null,
            modelUsed: responseData.modelUsed,
            username: responseData.username,
        };

    } catch (error) {
        console.error('Error fetching bot response:', error);
        const errorMessage = error instanceof Error ? (error.message.startsWith('Error: ') ? error.message : `Error: ${error.message}`)
                           : 'Error: An unknown error occurred while fetching the response.';
        return { text: errorMessage, imageUrl: null };
    }
}

// Function to parse suggestions
function parseSuggestions(text: string): { mainText: string; suggestions: string[] } {
    if (!text) return { mainText: '', suggestions: [] };
    const suggestions: string[] = [];
    const suggestionRegex = /\[Suggestion:\s*([\s\S]*?)\s*\]/g;
    let lastIndex = 0;
    const textParts: string[] = [];
    let match;

    while ((match = suggestionRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            textParts.push(text.substring(lastIndex, match.index));
        }
        if (match[1]) {
            suggestions.push(match[1].trim());
        }
        lastIndex = suggestionRegex.lastIndex;
    }

    if (lastIndex < text.length) {
        textParts.push(text.substring(lastIndex));
    }
    const mainText = textParts.join('').trim();

    return { mainText, suggestions };
}

// Function to format timestamp
function formatTime(timestamp: number): string {
    if (!timestamp || typeof timestamp !== 'number') return '';
    try {
        const date = new Date(timestamp);
        return date.toLocaleTimeString(navigator.language || 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) {
        console.error("Timestamp formatting error:", e);
        return '';
    }
}

// --- Speech Recognition Setup ---
const SpeechRecognitionImpl = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const recognitionAvailable = !!SpeechRecognitionImpl;
if (!recognitionAvailable) {
    console.warn("Browser does not support Speech Recognition.");
}

// --- Component Props Interface ---
interface ChatbotPageProps {
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    selectedModel: GeminiModel;
    sttLang: SpeechLanguage;
    selectedPersona: Persona;
    accessKey: string;
}

// --- ChatbotPage Component ---
function ChatbotPage({
    messages,
    setMessages,
    selectedModel,
    sttLang,
    selectedPersona,
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
    const scrollToBottom = useCallback(() => {
        setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, 100);
    }, []);
    useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
    useEffect(() => { return () => { if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); }; }, [imagePreviewUrl]);
    useEffect(() => { return () => { if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current); }; }, []);
    useEffect(() => { // Speech Recognition Init/Cleanup
        if (!recognitionAvailable) return;
        if (!recognitionRef.current) {
            try {
                const recognition = new SpeechRecognitionImpl();
                recognition.continuous = false;
                recognition.interimResults = false;
                recognition.onresult = (event: SpeechRecognitionEvent) => {
                    const transcript = event.results[event.results.length - 1]?.[0]?.transcript;
                    if (transcript) setInput(prev => (prev ? prev + ' ' : '') + transcript);
                    setIsRecording(false);
                };
                recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
                    console.error('Speech Recognition Error:', event.error, event.message);
                    let msg = `Speech error: ${event.error}`;
                    if (event.error === 'no-speech') msg = "No speech detected.";
                    else if (event.error === 'audio-capture') msg = "Microphone error.";
                    else if (event.error === 'not-allowed') msg = "Mic permission denied.";
                    else msg += ` - ${event.message || 'Unknown'}`;
                    alert(msg);
                    setIsRecording(false);
                };
                recognition.onstart = () => setIsRecording(true);
                recognition.onend = () => setIsRecording(false);
                recognitionRef.current = recognition;
            } catch (err) { console.error("Speech rec init error:", err); recognitionRef.current = null; }
        }
        return () => {
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch(e) {/* ignore */}
                recognitionRef.current.onresult = null; recognitionRef.current.onerror = null;
                recognitionRef.current.onstart = null; recognitionRef.current.onend = null;
            }
            setIsRecording(false);
        };
    }, []);

    // --- Core Send Logic ---
    const sendMessage = useCallback(async (messageText: string, imageFile: File | null) => {
        const textTrimmed = messageText.trim();
        if ((!textTrimmed && !imageFile) || isLoading || isOnCooldown) return;

        const timestamp = Date.now();
        const imageToSend = imageFile;
        let imageDataForApi: { type: string; dataUrl: string } | null = null;

        const historyToSend: HistoryItem[] = messages
            .filter(m => (m.sender === 'user' || m.sender === 'bot') && m.text && !m.text.startsWith('Error:'))
            .slice(-MAX_HISTORY).map(m => ({ role: m.sender === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));

        const userMsgText = textTrimmed || (imageToSend ? `(Image: ${imageToSend.name})` : '');
        if (!userMsgText) return; // Should not happen if initial check passed, but safeguard
        const userMsg: Message = { id: timestamp, text: userMsgText, sender: 'user', timestamp: timestamp };
        setMessages(prev => [...prev, userMsg]);

        if (messageText === input) setInput('');
        if (imageToSend && imageToSend === selectedImage) {
             setSelectedImage(null); setImagePreviewUrl(null);
             if (fileInputRef.current) fileInputRef.current.value = "";
        }

        setIsLoading(true); setIsOnCooldown(true);
        if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = setTimeout(() => setIsOnCooldown(false), SEND_COOLDOWN_MS);

        const loadingTimestamp = Date.now() + 1;
        const loadingMsg: Message = { id: loadingTimestamp, text: 'Bot is thinking...', sender: 'loading', timestamp: loadingTimestamp };
        setMessages(prev => [...prev, loadingMsg]);

        if (imageToSend) {
            try {
                if (!imageToSend.type.startsWith('image/')) throw new Error("Invalid file type.");
                if (imageToSend.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) throw new Error(`Image size exceeds ${MAX_IMAGE_SIZE_MB}MB.`);
                imageDataForApi = { type: imageToSend.type, dataUrl: await readFileAsBase64(imageToSend) };
            } catch (e) {
                console.error("Error processing image:", e);
                const errorMsgText = `Error: ${e instanceof Error ? e.message : 'Could not process image.'}`;
                const errorMsg: Message = { id: Date.now() + 2, text: errorMsgText, sender: 'bot', timestamp: Date.now() + 2 };
                setMessages(prev => [...prev.filter(m => m.id !== loadingTimestamp), errorMsg]);
                setIsLoading(false); return;
            }
        }

        // *** FIX APPLIED HERE: Initialize botResponse ***
        let botResponse: {
            text: string; imageUrl: string | null; modelUsed?: string; username?: string;
        } = {
            text: 'Error: Could not get response.', // Default fallback error
            imageUrl: null
        };

        try {
            botResponse = await getBotResponse(textTrimmed, imageDataForApi, historyToSend, selectedModel, selectedPersona, accessKey);
        } catch (error) {
            // This outer catch is for unexpected errors *during* the await getBotResponse call itself
            console.error("Critical error during API call execution:", error);
             // Update the initialized botResponse object
            botResponse.text = error instanceof Error ? `Error: ${error.message}` : "Error: A critical network error occurred.";
            botResponse.imageUrl = null;
            botResponse.modelUsed = undefined;
            botResponse.username = undefined;
        } finally {
            // This block now runs safely because botResponse is guaranteed to be initialized
            setIsLoading(false);

            const botTimestamp = Date.now() + 2;

            // Only add a bot message if there's actual text or an image URL
            if (botResponse.text || botResponse.imageUrl) {
                const newBotMessage: Message = {
                    id: botTimestamp,
                    text: botResponse.text, // This text could be a normal reply OR a formatted error
                    sender: 'bot',
                    timestamp: botTimestamp,
                    imageUrl: botResponse.imageUrl ?? undefined,
                    modelUsed: botResponse.modelUsed,
                };
                setMessages(prev => [...prev.filter(m => m.id !== loadingTimestamp), newBotMessage]);
            } else {
                // Handle genuinely empty responses (no text, no image, no error string)
                console.warn("Received empty response from bot (no text/image/error).");
                setMessages(prev => prev.filter(m => m.id !== loadingTimestamp)); // Just remove loading
            }
        }
    }, [messages, isLoading, isOnCooldown, input, selectedImage, setMessages, selectedModel, selectedPersona, accessKey, scrollToBottom]);

    // --- Event Handlers ---
    const handleSend = () => sendMessage(input, selectedImage);
    const handleSuggestionClick = useCallback((suggestionText: string) => sendMessage(suggestionText, null), [sendMessage]);
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value);
    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.type.startsWith('image/')) { alert("Invalid file type."); if (fileInputRef.current) fileInputRef.current.value = ""; return; }
            if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) { alert(`Image too large. Max: ${MAX_IMAGE_SIZE_MB}MB.`); if (fileInputRef.current) fileInputRef.current.value = ""; return; }
            setSelectedImage(file);
            if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
            setImagePreviewUrl(URL.createObjectURL(file));
        }
    };
    const handleImageUploadClick = () => fileInputRef.current?.click();
    const removeSelectedImage = () => { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; };
    const handleMicClick = () => {
        if (!recognitionRef.current || !recognitionAvailable) return alert("Speech rec not available.");
        if (isLoading || isOnCooldown) return;
        if (isRecording) { try { recognitionRef.current.stop(); } catch (e) { console.warn("Error stopping mic:", e); setIsRecording(false); } }
        else { try { recognitionRef.current.lang = sttLang; recognitionRef.current.start(); } catch (e) { if (e instanceof DOMException && e.name === 'InvalidStateError') alert("Wait before starting mic again."); else { console.error("Error starting mic:", e); alert("Could not start mic."); } setIsRecording(false); } }
    };

    // --- JSX Rendering ---
    return (
        <div className="chatbot-page">
            <div className="chatbot-messages">
                {messages.map((message: Message) => {
                    let mainText = message.text;
                    let suggestions: string[] = [];
                    let isErrorMessage = message.sender === 'bot' && message.text.startsWith('Error:');

                    if (message.sender === 'bot' && mainText && !isErrorMessage) {
                        const parsed = parseSuggestions(mainText);
                        mainText = parsed.mainText;
                        suggestions = parsed.suggestions;
                    }

                    return (
                        <div key={message.id} className={`message-wrapper message-wrapper-${message.sender}`}>
                            <div className={`message ${message.sender}`}>
                                {message.sender === 'bot' ? (
                                    <>
                                        {isErrorMessage ? ( <p className="error-message">{message.text}</p> )
                                         : mainText ? ( <ReactMarkdown remarkPlugins={[remarkGfm]} children={mainText} /> )
                                         : null }
                                        {message.imageUrl && (
                                            <img src={message.imageUrl} alt="Bot response" className="bot-image" style={{ maxWidth: '100%', maxHeight: '350px', display: 'block', marginTop: mainText ? '8px' : '0px', borderRadius: '8px', cursor: 'pointer' }} onClick={() => window.open(message.imageUrl, '_blank')}
                                                onError={(e) => { /* onError logic with nextSibling fix */
                                                    console.warn(`Failed to load image: ${message.imageUrl}`);
                                                    const imgElement = e.target as HTMLImageElement;
                                                    imgElement.style.display = 'none';
                                                    const errorText = document.createElement('span');
                                                    errorText.textContent = '[Image failed to load]';
                                                    errorText.style.fontSize = '0.8em'; errorText.style.color = 'grey';
                                                    imgElement.parentNode?.insertBefore(errorText, imgElement.nextSibling);
                                                }}/>
                                        )}
                                        {!mainText && !message.imageUrl && !isErrorMessage && ( <i>[Empty Response]</i> )}
                                    </>
                                ) : message.sender === 'loading' ? ( <i>{message.text}</i>
                                ) : ( <p style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p> )}
                            </div>
                            {message.sender !== 'loading' && message.timestamp && ( <span className="message-timestamp">{formatTime(message.timestamp)}</span> )}
                            {message.sender === 'bot' && !isErrorMessage && suggestions.length > 0 && (
                                <div className="suggestions-container">
                                    {suggestions.map((s, i) => ( <button key={`${message.id}-s-${i}`} className="suggestion-button" onClick={() => handleSuggestionClick(s)} disabled={isLoading || isOnCooldown}>{s}</button> ))}
                                </div>
                            )}
                        </div>
                    );
                })}
                <div ref={messagesEndRef} style={{ height: '1px' }} />
            </div>

             {/* Input Area */}
             <div className="chatbot-input-area">
                 {imagePreviewUrl && (
                     <div className="image-preview-area">
                         <img src={imagePreviewUrl} alt="Preview" className="image-preview-thumbnail" />
                         <button onClick={removeSelectedImage} title="Remove image" className="remove-image-button">×</button>
                     </div>
                 )}
                 <div style={{ display: 'flex', alignItems: 'center', flexGrow: 1, gap: '6px' }}>
                     <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleImageChange}/>
                     <button onClick={handleImageUploadClick} className="input-button image-upload-button" title="Upload Image" disabled={isLoading || isOnCooldown}>📎</button>
                     <input type="text" className="chatbot-input" value={input} onChange={handleInputChange} onKeyPress={handleKeyPress} placeholder={isLoading ? "Waiting..." : (imagePreviewUrl ? "Add text or send..." : "Type message...")} disabled={isLoading || isOnCooldown} aria-label="Chat input" style={{ flexGrow: 1 }}/>
                      {recognitionAvailable && (
                          <button onClick={handleMicClick} className={`input-button mic-button ${isRecording ? 'recording' : ''}`} title={isRecording ? "Stop" : "Speak"} disabled={isLoading || isOnCooldown}>
                              {isRecording ? '🛑' : '🎤'}
                          </button>
                      )}
                     <button onClick={handleSend} className="send-button" title="Send" disabled={(!input.trim() && !selectedImage) || isLoading || isOnCooldown}>➤</button>
                 </div>
             </div>
        </div>
    );
}

export default ChatbotPage;