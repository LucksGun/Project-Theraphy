// src/ChatbotPage.tsx - FINAL CLEANED VERSION
import React, { useState, useRef, useEffect, useCallback } from 'react';
// Ensure types are correctly imported (adjust path if you moved them)
import { Message, GeminiModel, SpeechLanguage, Persona, WORKER_URL } from './App';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- Constants ---
const SEND_COOLDOWN_MS = 1500;
const MAX_HISTORY = 20;
const MAX_IMAGE_SIZE_MB = 3.8;

// History type expected by the worker
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

// Function to call the backend worker for chat
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

    const requestBody = { // Explicitly defining type not needed if using ApiRequestBody from App.tsx
        action: 'chat' as const, // Use 'as const' for literal type
        prompt: promptToSend,
        model: model,
        persona: persona,
        accessKey: accessKey || undefined,
        history: history,
        imageMimeType: imageData?.type,
        imageDataUrl: imageData?.dataUrl
    };

    console.log(`Sending Chat Req (Model: ${model}, Persona: ${persona}, History: ${history.length}, Img: ${!!imageData})`);

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });
        const responseData = await response.json().catch(() => ({ error: `Server error: Invalid response format (Status: ${response.status})` }));
        if (!response.ok) throw new Error(responseData?.error || `API Error: ${response.status} ${response.statusText}`);
        if (responseData.error) throw new Error(responseData.error); // Handle application errors

        console.log('Worker Response:', responseData);
        return {
            text: responseData.reply || '', // Default to empty string
            imageUrl: responseData.imageUrl || null,
            modelUsed: responseData.modelUsed,
            username: responseData.username,
        };
    } catch (error) {
        console.error('getBotResponse Error:', error);
        const errorMessage = error instanceof Error ? (error.message.startsWith('Error: ') ? error.message : `Error: ${error.message}`)
                           : 'Error: Unknown fetch error.';
        return { text: errorMessage, imageUrl: null };
    }
}

// Function to parse suggestions
function parseSuggestions(text: string): { mainText: string; suggestions: string[] } {
    if (!text) return { mainText: '', suggestions: [] };
    const suggestions: string[] = [];
    const suggestionRegex = /\[Suggestion:\s*([\s\S]*?)\s*\]/g; // Less greedy
    let lastIndex = 0; const textParts: string[] = []; let match;
    while ((match = suggestionRegex.exec(text)) !== null) {
        if (match.index > lastIndex) textParts.push(text.substring(lastIndex, match.index));
        if (match[1]) suggestions.push(match[1].trim());
        lastIndex = suggestionRegex.lastIndex;
    }
    if (lastIndex < text.length) textParts.push(text.substring(lastIndex));
    const mainText = textParts.join('').trim();
    return { mainText, suggestions };
}

// Function to format timestamp
function formatTime(timestamp: number): string {
    if (!timestamp || typeof timestamp !== 'number') return '';
    try { return new Date(timestamp).toLocaleTimeString(navigator.language || 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false }); }
    catch (e) { console.error("Timestamp format error:", e); return ''; }
}

// --- Speech Recognition Setup ---
const SpeechRecognitionImpl = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const recognitionAvailable = !!SpeechRecognitionImpl;
if (!recognitionAvailable) console.warn("Speech Recognition not supported.");

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
function ChatbotPage({ messages, setMessages, selectedModel, sttLang, selectedPersona, accessKey }: ChatbotPageProps) {
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
    const scrollToBottom = useCallback(() => { setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, 100); }, []);
    useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
    useEffect(() => { return () => { if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); }; }, [imagePreviewUrl]);
    useEffect(() => { return () => { if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current); }; }, []);
    useEffect(() => { // Speech Recognition Init/Cleanup
        if (!recognitionAvailable) return;
        if (!recognitionRef.current) {
            try {
                const recognition = new SpeechRecognitionImpl();
                recognition.continuous = false; recognition.interimResults = false;
                recognition.onresult = (event: SpeechRecognitionEvent) => { const transcript = event.results[event.results.length - 1]?.[0]?.transcript; if (transcript) setInput(prev => (prev ? prev + ' ' : '') + transcript); setIsRecording(false); };
                recognition.onerror = (event: SpeechRecognitionErrorEvent) => { console.error('Speech Rec Error:', event.error, event.message); let msg = `Speech error: ${event.error}`; if (event.error === 'no-speech') msg = "No speech detected."; else if (event.error === 'audio-capture') msg = "Mic error."; else if (event.error === 'not-allowed') msg = "Mic permission denied."; else msg += ` - ${event.message || 'Unknown'}`; alert(msg); setIsRecording(false); };
                recognition.onstart = () => setIsRecording(true); recognition.onend = () => setIsRecording(false);
                recognitionRef.current = recognition;
            } catch (err) { console.error("Speech rec init error:", err); recognitionRef.current = null; }
        }
        return () => { if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch(e) {/* ignore */} recognitionRef.current.onresult = null; recognitionRef.current.onerror = null; recognitionRef.current.onstart = null; recognitionRef.current.onend = null; } setIsRecording(false); };
    }, []);

    // --- Core Send Logic ---
    const sendMessage = useCallback(async (messageText: string, imageFile: File | null) => {
        const textTrimmed = messageText.trim();
        if ((!textTrimmed && !imageFile) || isLoading || isOnCooldown) return;

        const timestamp = Date.now(); const imageToSend = imageFile; let imageDataForApi: { type: string; dataUrl: string } | null = null;
        const historyToSend: HistoryItem[] = messages.filter(m => (m.sender === 'user' || m.sender === 'bot') && m.text && !m.text.startsWith('Error:')).slice(-MAX_HISTORY).map(m => ({ role: m.sender === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
        const userMsgText = textTrimmed || (imageToSend ? `(Image: ${imageToSend.name})` : ''); if (!userMsgText) return;
        const userMsg: Message = { id: timestamp, text: userMsgText, sender: 'user', timestamp: timestamp };
        setMessages(prev => [...prev, userMsg]);
        if (messageText === input) setInput(''); if (imageToSend && imageToSend === selectedImage) { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
        setIsLoading(true); setIsOnCooldown(true); if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current); cooldownTimerRef.current = setTimeout(() => setIsOnCooldown(false), SEND_COOLDOWN_MS);
        const loadingTimestamp = Date.now() + 1; const loadingMsg: Message = { id: loadingTimestamp, text: 'Bot is thinking...', sender: 'loading', timestamp: loadingTimestamp }; setMessages(prev => [...prev, loadingMsg]);

        if (imageToSend) { try { if (!imageToSend.type.startsWith('image/')) throw new Error("Invalid file type."); if (imageToSend.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) throw new Error(`Image size exceeds ${MAX_IMAGE_SIZE_MB}MB.`); imageDataForApi = { type: imageToSend.type, dataUrl: await readFileAsBase64(imageToSend) }; } catch (e) { console.error("Image processing error:", e); const errorMsgText = `Error: ${e instanceof Error ? e.message : 'Could not process image.'}`; const errorMsg: Message = { id: Date.now() + 2, text: errorMsgText, sender: 'bot', timestamp: Date.now() + 2 }; setMessages(prev => [...prev.filter(m => m.id !== loadingTimestamp), errorMsg]); setIsLoading(false); return; } }

        // Initialize botResponse with a default state
        let botResponse: { text: string; imageUrl: string | null; modelUsed?: string; username?: string; } = { text: 'Error: Failed to initialize response.', imageUrl: null };

        try {
            botResponse = await getBotResponse(textTrimmed, imageDataForApi, historyToSend, selectedModel, selectedPersona, accessKey);
        } catch (error) { // Catch critical errors during the fetch/await itself
            console.error("Critical sendMessage error:", error);
            botResponse.text = error instanceof Error ? `Error: ${error.message}` : "Error: Critical network error.";
            botResponse.imageUrl = null;
        } finally {
            setIsLoading(false);
            const botTimestamp = Date.now() + 2;
            if (botResponse.text || botResponse.imageUrl) { // Check if there's content (could be reply or formatted error)
                const newBotMessage: Message = { id: botTimestamp, text: botResponse.text, sender: 'bot', timestamp: botTimestamp, imageUrl: botResponse.imageUrl ?? undefined, modelUsed: botResponse.modelUsed, };
                setMessages(prev => [...prev.filter(m => m.id !== loadingTimestamp), newBotMessage]);
            } else { // Handle truly empty responses from backend
                console.warn("Received empty response (no text/image/error).");
                setMessages(prev => prev.filter(m => m.id !== loadingTimestamp)); // Just remove loading
            }
        }
    }, [messages, isLoading, isOnCooldown, input, selectedImage, setMessages, selectedModel, selectedPersona, accessKey, scrollToBottom]); // Keep dependencies

    // --- Event Handlers ---
    const handleSend = () => sendMessage(input, selectedImage);
    const handleSuggestionClick = useCallback((suggestionText: string) => sendMessage(suggestionText, null), [sendMessage]);
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value);
    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { if (!file.type.startsWith('image/')) { alert("Invalid file type."); if (fileInputRef.current) fileInputRef.current.value = ""; return; } if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) { alert(`Image too large. Max: ${MAX_IMAGE_SIZE_MB}MB.`); if (fileInputRef.current) fileInputRef.current.value = ""; return; } setSelectedImage(file); if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); setImagePreviewUrl(URL.createObjectURL(file)); } };
    const handleImageUploadClick = () => fileInputRef.current?.click();
    const removeSelectedImage = () => { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; };
    const handleMicClick = () => { if (!recognitionRef.current || !recognitionAvailable) return alert("Speech rec not available."); if (isLoading || isOnCooldown) return; if (isRecording) { try { recognitionRef.current.stop(); } catch (e) { console.warn("Error stopping mic:", e); setIsRecording(false); } } else { try { recognitionRef.current.lang = sttLang; recognitionRef.current.start(); } catch (e) { if (e instanceof DOMException && e.name === 'InvalidStateError') alert("Wait before starting mic again."); else { console.error("Error starting mic:", e); alert("Could not start mic."); } setIsRecording(false); } } };

    // --- JSX Rendering ---
    return (
        <div className="chatbot-container"> {/* Ensure this class matches App.css for layout */}
            <div className="chatbot-messages">
                {messages.map((message: Message) => {
                    let mainText = message.text; let suggestions: string[] = [];
                    let isErrorMessage = message.sender === 'bot' && message.text.startsWith('Error:');
                    if (message.sender === 'bot' && mainText && !isErrorMessage) { const parsed = parseSuggestions(mainText); mainText = parsed.mainText; suggestions = parsed.suggestions; }
                    return ( <div key={message.id} className={`message-wrapper message-wrapper-${message.sender}`}> <div className={`message ${message.sender}`}> {message.sender === 'bot' ? ( <> {isErrorMessage ? ( <p className="error-message">{message.text}</p> ) : mainText ? ( <ReactMarkdown remarkPlugins={[remarkGfm]} children={mainText} /> ) : null } {message.imageUrl && ( <img src={message.imageUrl} alt="Bot response" className="bot-image" style={{ maxWidth: '100%', maxHeight: '350px', display: 'block', marginTop: mainText ? '8px' : '0px', borderRadius: '8px', cursor: 'pointer' }} onClick={() => window.open(message.imageUrl, '_blank')} onError={(e) => { console.warn(`Failed image load: ${message.imageUrl}`); const imgElement = e.target as HTMLImageElement; imgElement.style.display = 'none'; const errorText = document.createElement('span'); errorText.textContent = '[Image failed]'; errorText.style.fontSize = '0.8em'; errorText.style.color = 'grey'; imgElement.parentNode?.insertBefore(errorText, imgElement.nextSibling); }}/> )} {!mainText && !message.imageUrl && !isErrorMessage && ( <i>[Empty Response]</i> )} </> ) : message.sender === 'loading' ? ( <i>{message.text}</i> ) : ( <p style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p> )} </div> {message.sender !== 'loading' && message.timestamp && ( <span className="message-timestamp">{formatTime(message.timestamp)}</span> )} {message.sender === 'bot' && !isErrorMessage && suggestions.length > 0 && ( <div className="suggestions-container"> {suggestions.map((s, i) => ( <button key={`${message.id}-s-${i}`} className="suggestion-button" onClick={() => handleSuggestionClick(s)} disabled={isLoading || isOnCooldown}>{s}</button> ))} </div> )} </div> );
                })}
                <div ref={messagesEndRef} style={{ height: '1px' }} />
            </div>

            {/* Input Area */}
            <div className="chatbot-input-area">
                 {imagePreviewUrl && ( <div className="image-preview-area"> <img src={imagePreviewUrl} alt="Preview" className="image-preview-thumbnail" /> <button onClick={removeSelectedImage} title="Remove image" className="remove-image-button">×</button> </div> )}
                 <div style={{ display: 'flex', alignItems: 'center', flexGrow: 1, gap: '6px' }}>
                     <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleImageChange}/>
                     <button onClick={handleImageUploadClick} className="input-button image-upload-button" title="Upload Image" disabled={isLoading || isOnCooldown}>📎</button>
                     <input type="text" className="chatbot-input" value={input} onChange={handleInputChange} onKeyPress={handleKeyPress} placeholder={isLoading ? "Waiting..." : (imagePreviewUrl ? "Add text or send..." : "Type message...")} disabled={isLoading || isOnCooldown} aria-label="Chat input" style={{ flexGrow: 1 }}/>
                      {recognitionAvailable && ( <button onClick={handleMicClick} className={`input-button mic-button ${isRecording ? 'recording' : ''}`} title={isRecording ? "Stop" : "Speak"} disabled={isLoading || isOnCooldown}> {isRecording ? '🛑' : '🎤'} </button> )}
                     <button onClick={handleSend} className="send-button" title="Send" disabled={(!input.trim() && !selectedImage) || isLoading || isOnCooldown}>➤</button>
                 </div>
            </div>
        </div> // End chatbot-container
    );
}

export default ChatbotPage;