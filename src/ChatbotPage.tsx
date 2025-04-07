// src/ChatbotPage.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
// Import necessary types (ensure ApiRequestBody is accessible)
import { Message, GeminiModel, SpeechLanguage, Persona, WORKER_URL, ApiRequestBody } from './App'; // Ensure ApiRequestBody is exported or defined here if needed elsewhere
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ReactGA from 'react-ga4';

// --- Constants ---
const SEND_COOLDOWN_MS = 1500;
const MAX_HISTORY = 20;
const MAX_IMAGE_SIZE_MB = 3.8;
const GA_MEASUREMENT_ID = "G-JX58QMMKZY"; // Assuming same GA ID

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

// Function to call the backend worker for standard chat
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

    const requestBody = {
        action: 'chat' as const,
        prompt: promptToSend, model: model, persona: persona,
        accessKey: accessKey || undefined, history: history,
        imageMimeType: imageData?.type, imageDataUrl: imageData?.dataUrl
    };

    console.log(`Sending Chat Req (Model: ${model}, Persona: ${persona}, History: ${history.length}, Img: ${!!imageData})`);

    try {
        const response = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
        const responseData = await response.json().catch(() => ({ error: `Server error: Invalid response (Status: ${response.status})` }));
        if (!response.ok) throw new Error(responseData?.error || `API Error: ${response.status}`);
        if (responseData.error) throw new Error(responseData.error);
        console.log('Worker Response:', responseData);
        return { text: responseData.reply || '', imageUrl: responseData.imageUrl || null, modelUsed: responseData.modelUsed, username: responseData.username };
    } catch (error) {
        console.error('getBotResponse Error:', error);
        const errorMessage = error instanceof Error ? (error.message.startsWith('Error: ') ? error.message : `Error: ${error.message}`) : 'Error: Unknown fetch error.';
        return { text: errorMessage, imageUrl: null };
    }
}

// Function to call backend specifically for the Analysis Form data
async function getBotResponseForAnalysis(
    userInput: string,
    model: GeminiModel,
    persona: Persona,
    accessKey: string
): Promise<string> {
    if (!userInput) return "Error: No analysis data provided.";
    const requestBody: ApiRequestBody = { action: 'chat', prompt: userInput, model: model, persona: persona, accessKey: accessKey };
    console.log(`Sending Analysis Request (Model: ${model}, Persona: ${persona})`);
    try {
        const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
        if (!res.ok) { const errData = await res.json().catch(() => ({ error: `HTTP Error ${res.status}` })); throw new Error(errData?.error || `HTTP Error ${res.status}`); }
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        return data.reply || 'No reply received for analysis.';
    } catch (e) {
        console.error('Analysis API Error:', e);
        if (e instanceof Error) { if (e.message.includes("Access Key required") || e.message.includes("Invalid")) return "Error: Invalid/Inactive Access Key for analysis."; return `Error: ${e.message}`; }
        return 'Error: Analysis submission failed.';
    }
}

// Function to parse suggestions
function parseSuggestions(text: string): { mainText: string; suggestions: string[] } { if (!text) return { mainText: '', suggestions: [] }; const suggestions: string[] = []; const suggestionRegex = /\[Suggestion:\s*([\s\S]*?)\s*\]/g; let lastIndex = 0; const textParts: string[] = []; let match; while ((match = suggestionRegex.exec(text)) !== null) { if (match.index > lastIndex) textParts.push(text.substring(lastIndex, match.index)); if (match[1]) suggestions.push(match[1].trim()); lastIndex = suggestionRegex.lastIndex; } if (lastIndex < text.length) textParts.push(text.substring(lastIndex)); const mainText = textParts.join('').trim(); return { mainText, suggestions }; }
// Function to format timestamp
function formatTime(timestamp: number): string { if (!timestamp || typeof timestamp !== 'number') return ''; try { return new Date(timestamp).toLocaleTimeString(navigator.language || 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { console.error("Timestamp format error:", e); return ''; } }

// --- Speech Recognition Setup ---
// Need to declare the type for the event if using specific properties like .error
// This is often available globally if the browser supports the API
declare var SpeechRecognitionErrorEvent: {
    prototype: SpeechRecognitionErrorEvent;
    new(type: string, eventInitDict: SpeechRecognitionErrorEventInit): SpeechRecognitionErrorEvent;
};
// Or use 'any' if the global type isn't reliably available in your TS setup
// declare var SpeechRecognitionErrorEvent: any;

const SpeechRecognitionImpl = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const recognitionAvailable = !!SpeechRecognitionImpl;
if (!recognitionAvailable) console.warn("Speech Recognition not supported.");

// --- Component Props Interface ---
interface ChatbotPageProps {
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    selectedModel: GeminiModel;
    sttLang: SpeechLanguage; // Keep sttLang for speech input
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
    const [isAnalysisFormVisible, setIsAnalysisFormVisible] = useState<boolean>(false);
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
    const [field1, setField1] = useState('');
    const [field2, setField2] = useState('');
    const [field3, setField3] = useState('');
    const [field4, setField4] = useState('');
    const [field5, setField5] = useState('');
    // --- State for TTS ---
    const [currentlySpeakingId, setCurrentlySpeakingId] = useState<number | null>(null);
    const isSpeechSynthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;


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
                recognition.continuous = false; recognition.interimResults = false;
                recognition.onresult = (event: SpeechRecognitionEvent) => { const transcript = event.results[event.results.length - 1]?.[0]?.transcript; if (transcript) setInput(prev => (prev ? prev + ' ' : '') + transcript); setIsRecording(false); };
                // --- FIX: Explicitly type the event parameter ---
                recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
                    console.error('Speech Rec Error:', event.error, event.message); let msg = `Speech error: ${event.error}`; if (event.error === 'no-speech') msg = "No speech detected."; else if (event.error === 'audio-capture') msg = "Mic error."; else if (event.error === 'not-allowed') msg = "Mic permission denied."; else msg += ` - ${event.message || 'Unknown'}`; alert(msg); setIsRecording(false);
                };
                // --- End Fix ---
                recognition.onstart = () => setIsRecording(true); recognition.onend = () => setIsRecording(false);
                recognitionRef.current = recognition;
            } catch (err) { console.error("Speech rec init error:", err); recognitionRef.current = null; }
        }
        return () => { if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch(e) {/* ignore */} recognitionRef.current.onresult = null; recognitionRef.current.onerror = null; recognitionRef.current.onstart = null; recognitionRef.current.onend = null; } setIsRecording(false); };
    }, []); // Removed recognitionAvailable dependency as it shouldn't change

    // --- Effect for TTS Cleanup ---
    useEffect(() => {
        // Cleanup speech synthesis on component unmount or if API becomes unavailable
        return () => {
            if (isSpeechSynthesisSupported && window.speechSynthesis.speaking) {
                // console.log("ChatbotPage unmounting, cancelling speech.");
                window.speechSynthesis.cancel();
                // No need to setCurrentlySpeakingId(null) here, state disappears with component
            }
        };
    }, [isSpeechSynthesisSupported]); // Rerun if support changes (unlikely but good practice)


    // --- Core Send Logic ---
    const sendMessage = useCallback(async (messageText: string, imageFile: File | null) => {
        // --- Cancel TTS if sending a new message ---
        if (isSpeechSynthesisSupported && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            setCurrentlySpeakingId(null);
        }

        const textTrimmed = messageText.trim();
        if ((!textTrimmed && !imageFile) || isLoading || isOnCooldown) return;
        const timestamp = Date.now();
        const imageToSend = imageFile;
        let imageDataForApi: { type: string; dataUrl: string } | null = null;
        const historyToSend: HistoryItem[] = messages.filter(m => (m.sender === 'user' || m.sender === 'bot') && m.text && !m.text.startsWith('Error:')).slice(-MAX_HISTORY).map(m => ({ role: m.sender === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
        const userMsgText = textTrimmed || (imageToSend ? `(Image: ${imageToSend.name})` : '');
        if (!userMsgText) return;
        const userMsg: Message = { id: timestamp, text: userMsgText, sender: 'user', timestamp: timestamp };
        setMessages(prev => [...prev, userMsg]);
        if (messageText === input) setInput('');
        if (imageToSend && imageToSend === selectedImage) { setSelectedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
        setIsLoading(true);
        setIsOnCooldown(true);
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
                const errorMsgText = `Error: ${e instanceof Error ? e.message : 'Img processing failed.'}`;
                const errorMsg: Message = { id: Date.now() + 2, text: errorMsgText, sender: 'bot', timestamp: Date.now() + 2 };
                setMessages(prev => [...prev.filter(m => m.id !== loadingTimestamp), errorMsg]);
                setIsLoading(false);
                return;
            }
        }
        let botResponse: { text: string; imageUrl: string | null; modelUsed?: string; username?: string; } = { text: 'Error: Init fail.', imageUrl: null };
        try {
            botResponse = await getBotResponse(textTrimmed, imageDataForApi, historyToSend, selectedModel, selectedPersona, accessKey);
        } catch (error) {
            console.error("Critical sendMessage error:", error);
            botResponse.text = error instanceof Error ? `Error: ${error.message}` : "Error: Critical network error.";
            botResponse.imageUrl = null;
        } finally {
            setIsLoading(false);
            const botTimestamp = Date.now() + 2;
            if (botResponse.text || botResponse.imageUrl) {
                const newBotMessage: Message = {
                    id: botTimestamp,
                    text: botResponse.text,
                    sender: 'bot',
                    timestamp: botTimestamp,
                    imageUrl: botResponse.imageUrl ?? undefined, // Use ?? instead of ||
                    modelUsed: botResponse.modelUsed,
                };
                setMessages(prev => [...prev.filter(m => m.id !== loadingTimestamp), newBotMessage]);
            } else {
                console.warn("Received empty response.");
                setMessages(prev => prev.filter(m => m.id !== loadingTimestamp));
            }
            // scrollToBottom(); // Already called by useEffect on messages change
        }
    }, [messages, isLoading, isOnCooldown, input, selectedImage, setMessages, selectedModel, selectedPersona, accessKey, scrollToBottom, isSpeechSynthesisSupported]); // Added isSpeechSynthesisSupported dependency


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
            if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); // Clean up previous preview URL
            setImagePreviewUrl(URL.createObjectURL(file));
        }
    };
    const handleImageUploadClick = () => fileInputRef.current?.click();
    const removeSelectedImage = () => {
        setSelectedImage(null);
        if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); // Clean up preview URL
        setImagePreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = ""; // Reset file input
    };
    const handleMicClick = () => {
        if (!recognitionRef.current || !recognitionAvailable) return alert("Speech recognition not available or not initialized.");
        if (isLoading || isOnCooldown) return;
        if (isRecording) {
            try {
                recognitionRef.current.stop();
            } catch (e) {
                console.warn("Error stopping mic:", e);
                setIsRecording(false); // Force state update if stop fails strangely
            }
        } else {
            try {
                recognitionRef.current.lang = sttLang;
                recognitionRef.current.start();
            } catch (e) {
                if (e instanceof DOMException && e.name === 'InvalidStateError') {
                    // This can happen if start() is called too quickly after stop()
                    alert("Please wait a moment before starting the microphone again.");
                } else {
                    console.error("Error starting mic:", e);
                    alert("Could not start microphone. Check permissions.");
                }
                setIsRecording(false); // Ensure state is correct on error
            }
        }
    };
    const clearAnalysisForm = () => { setField1(''); setField2(''); setField3(''); setField4(''); setField5(''); };
    const toggleAnalysisForm = () => { setIsAnalysisFormVisible(p => !p); if (isAnalysisFormVisible) { clearAnalysisForm(); setIsAnalyzing(false); } };
    const handleAnalysisSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const v1 = field1.trim();
        const v2 = field2.trim();
        const v3 = field3.trim();
        const v4 = field4.trim();
        const v5 = field5.trim();
        if (!v1 || !v2 || !v3 || !v4 || !v5) {
            alert("Please fill in all fields for analysis.");
            return;
        }
        if (isAnalyzing) return; // Prevent double submission
        setIsAnalyzing(true);
        if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" && GA_MEASUREMENT_ID !== "YOUR_GA_ID_HERE") {
             try { ReactGA.event({ category: "Chat", action: "Submit Analysis Form" }); } catch(gaErr) { console.error("GA Event Error:", gaErr); }
        }
        let analysisInput = `Analyze the following user details for university advice:\nField 1 (Concerns): ${v1}\nField 2 (Enjoy time with): ${v2}\nField 3 (Describe self): ${v3}\nField 4 (Dislike learning): ${v4}\nField 5 (GPA): ${v5}\nPlease provide suitable faculty recommendations, specific university suggestions, and preparation advice.`;
        const ts = Date.now();
        const loadMsg: Message = { id: ts, text: `Analyzing university advice details...`, sender: 'loading', timestamp: ts };
        setMessages(p => [...p, loadMsg]);
        toggleAnalysisForm(); // Close form after submission starts
        const result = await getBotResponseForAnalysis(analysisInput.trim(), selectedModel, selectedPersona, accessKey);
        setMessages(p => p.filter(m => m.id !== ts)); // Remove loading message
        const resultTimestamp = Date.now() + 1;
        const resultMsg: Message = { id: resultTimestamp, text: result, sender: 'bot', timestamp: resultTimestamp };
        setMessages(p => [...p, resultMsg]);
        setIsAnalyzing(false); // Re-enable form button if needed, though form is closed
    };

    // --- TTS Handler ---
    const handlePlayTTS = useCallback((messageId: number, textToSpeak: string) => {
        if (!isSpeechSynthesisSupported || !textToSpeak) {
             console.warn("TTS not supported or no text to speak for message:", messageId);
             return;
        }

        const synth = window.speechSynthesis;

        // Clean up text slightly (optional, e.g., remove markdown emphasis)
        const cleanText = textToSpeak
            .replace(/(\*\*|__)(.*?)\1/g, '$2') // Remove bold
            .replace(/(\*|_)(.*?)\1/g, '$2'); // Remove italic

        // If this message is the one currently speaking, stop it.
        if (currentlySpeakingId === messageId && (synth.speaking || synth.pending)) {
            // console.log(`TTS: Cancelling message ${messageId}`);
            synth.cancel(); // This should trigger the onend/onerror eventually if needed, but we set state immediately.
            setCurrentlySpeakingId(null);
            return;
        }

        // If another message is speaking, stop it before starting the new one.
        if (synth.speaking || synth.pending) {
            // console.log(`TTS: Cancelling previous speech`);
            synth.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(cleanText);

        // Optional: Language Setting (Enhance Later)
        // utterance.lang = 'en-US'; // Or detect from text?

        utterance.onend = () => {
            // console.log(`TTS: Speech finished for ${messageId}`);
            // Check if this utterance was the one we intended to be playing
            if (currentlySpeakingId === messageId) {
                setCurrentlySpeakingId(null);
            }
        };

        utterance.onerror = (event) => {
            console.error('SpeechSynthesisUtterance.onerror', event);
            alert(`Speech error: ${event.error || 'Unknown error'}`);
             // Check if this utterance was the one we intended to be playing
            if (currentlySpeakingId === messageId) {
                setCurrentlySpeakingId(null);
            }
        };

        // console.log(`TTS: Attempting to speak message ${messageId}`);
        synth.speak(utterance);
        setCurrentlySpeakingId(messageId); // Set this as the target speaking ID

    }, [currentlySpeakingId, isSpeechSynthesisSupported]); // Include dependencies

    // --- JSX Rendering ---
    return (
        <div className="chatbot-container">
            <div className="chatbot-messages">
                {messages.map((message: Message) => {
                    let mainText = message.text;
                    let suggestions: string[] = [];
                    let isErrorMessage = message.sender === 'bot' && message.text.startsWith('Error:');

                    if (message.sender === 'bot' && mainText && !isErrorMessage) {
                        const parsed = parseSuggestions(mainText);
                        mainText = parsed.mainText; // Use the text *without* suggestions for TTS
                        suggestions = parsed.suggestions;
                    }

                    return (
                        <div key={message.id} className={`message-wrapper message-wrapper-${message.sender}`}>
                            <div className={`message ${message.sender}`}>
                                {message.sender === 'bot' ? (
                                    <>
                                        {isErrorMessage ? (
                                            <p className="error-message">{message.text}</p>
                                        ) : mainText ? (
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} children={mainText} />
                                        ) : null}
                                        {message.imageUrl && (
                                             <img src={message.imageUrl} alt="Bot response" className="bot-image" style={{ maxWidth: '100%', maxHeight: '350px', display: 'block', marginTop: mainText ? '8px' : '0px', borderRadius: '8px', cursor: 'pointer' }} onClick={() => window.open(message.imageUrl, '_blank')} onError={(e) => { console.warn(`Failed image load: ${message.imageUrl}`); const imgElement = e.target as HTMLImageElement; imgElement.style.display = 'none'; const errorText = document.createElement('span'); errorText.textContent = '[Image failed to load]'; errorText.style.fontSize = '0.8em'; errorText.style.color = 'grey'; imgElement.parentNode?.insertBefore(errorText, imgElement.nextSibling); }}/>
                                        )}
                                        {!mainText && !message.imageUrl && !isErrorMessage && (<i>[Empty Response]</i>)}
                                    </>
                                ) : message.sender === 'loading' ? (
                                    <i>{message.text}</i>
                                ) : (
                                    <p style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p>
                                )}
                            </div>

                            {/* Timestamp and TTS Button Container */}
                            <div className="message-meta">
                                {message.sender !== 'loading' && message.timestamp > 0 && ( // Added check for timestamp > 0
                                    <span className="message-timestamp">{formatTime(message.timestamp)}</span>
                                )}

                                {/* --- TTS Button --- */}
                                {message.sender === 'bot' && mainText && !isErrorMessage && isSpeechSynthesisSupported && (
                                    <button
                                        className={`tts-button ${currentlySpeakingId === message.id ? 'speaking' : ''}`}
                                        onClick={() => handlePlayTTS(message.id, mainText)} // Pass the clean mainText
                                        title={currentlySpeakingId === message.id ? "Stop Speech" : "Read Aloud"}
                                        aria-label={currentlySpeakingId === message.id ? "Stop Speech" : "Read Aloud"}
                                    >
                                        {currentlySpeakingId === message.id ? '⏹️' : '🔊'}
                                    </button>
                                )}
                            </div>

                             {/* Suggestion Buttons */}
                            {message.sender === 'bot' && !isErrorMessage && suggestions.length > 0 && (
                                <div className="suggestions-container">
                                    {suggestions.map((s, i) => (
                                        <button key={`${message.id}-s-${i}`} className="suggestion-button" onClick={() => handleSuggestionClick(s)} disabled={isLoading || isOnCooldown}>{s}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
                <div ref={messagesEndRef} style={{ height: '1px' }} />
            </div>

             {/* Analysis Form Overlay */}
            {isAnalysisFormVisible && (
                <div className="analysis-form-overlay">
                    <div className="analysis-form-modal">
                        <h3 id="analysis-title">University Advice Form</h3>
                        <button onClick={toggleAnalysisForm} className="close-staff-panel-button" title="Close Form">×</button>
                        <p style={{fontSize:'0.9em', color:'#555', marginBottom:'15px'}}>Provide details for AI analysis.</p>
                        <form onSubmit={handleAnalysisSubmit}>
                             {/* Fields 1-5 */}
                             <div className="settings-option" style={{marginBottom:'15px'}}><label htmlFor="analysis-field1">1. Concerns about university?</label><input type="text" id="analysis-field1" className="settings-input" value={field1} onChange={(e)=>setField1(e.target.value)} placeholder="e.g., workload, social life, cost" disabled={isAnalyzing} required /></div>
                             <div className="settings-option" style={{marginBottom:'15px'}}><label htmlFor="analysis-field2">2. Who do you enjoy spending time with?</label><input type="text" id="analysis-field2" className="settings-input" value={field2} onChange={(e)=>setField2(e.target.value)} placeholder="e.g., close friends, family, alone" disabled={isAnalyzing} required /></div>
                             <div className="settings-option" style={{marginBottom:'15px'}}><label htmlFor="analysis-field3">3. Describe your personality?</label><input type="text" id="analysis-field3" className="settings-input" value={field3} onChange={(e)=>setField3(e.target.value)} placeholder="e.g., introverted, creative, analytical" disabled={isAnalyzing} required /></div>
                             <div className="settings-option" style={{marginBottom:'15px'}}><label htmlFor="analysis-field4">4. What learning methods do you dislike?</label><input type="text" id="analysis-field4" className="settings-input" value={field4} onChange={(e)=>setField4(e.target.value)} placeholder="e.g., memorization, group projects, exams" disabled={isAnalyzing} required /></div>
                             <div className="settings-option" style={{marginBottom:'15px'}}><label htmlFor="analysis-field5">5. Estimated GPA or academic level?</label><input type="text" id="analysis-field5" className="settings-input" value={field5} onChange={(e)=>setField5(e.target.value)} placeholder="e.g., 3.5, Good, Average" disabled={isAnalyzing} required /></div>
                            <div className="analysis-form-actions">
                                <button type="button" onClick={toggleAnalysisForm} className="close-settings-button" disabled={isAnalyzing}>Cancel</button>
                                <button type="submit" className="beta-accept-button" disabled={!field1.trim()||!field2.trim()||!field3.trim()||!field4.trim()||!field5.trim()||isAnalyzing}>{isAnalyzing?'Analyzing...':'Submit for Advice'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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
                     <button onClick={toggleAnalysisForm} className="input-button analysis-button" title="University Advice Form" disabled={isLoading || isOnCooldown}>📝</button>
                     <input type="text" className="chatbot-input" value={input} onChange={handleInputChange} onKeyPress={handleKeyPress} placeholder={isLoading ? "Waiting..." : (imagePreviewUrl ? "Add text or send image..." : "Type your message...")} disabled={isLoading || isOnCooldown} aria-label="Chat input" style={{ flexGrow: 1 }}/>
                     {recognitionAvailable && (
                        <button onClick={handleMicClick} className={`input-button mic-button ${isRecording ? 'recording' : ''}`} title={isRecording ? "Stop Recording" : "Start Speech Input"} disabled={isLoading || isOnCooldown}>
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