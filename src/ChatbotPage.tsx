import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import ReactGA from 'react-ga4';
// Import necessary types and the useAuth hook
import { Message, GeminiModel, SpeechLanguage, Persona, WORKER_URL, ApiRequestBody, useAuth } from './App';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { prism } from 'react-syntax-highlighter/dist/esm/styles/prism';
import MediaCaptureModal from './MediaCaptureModal';
import { FaUserTie, FaPlus, FaPaperclip, FaCamera, FaDesktop, FaEdit, FaMicrophone, FaPaperPlane, FaStopCircle } from 'react-icons/fa';
import { User } from 'firebase/auth'; // Import User type

// --- Constants ---
const SEND_COOLDOWN_MS = 1500;
const MAX_HISTORY = 30;
const MAX_IMAGE_SIZE_MB = 3.8;
const GA_MEASUREMENT_ID = "G-JX58QMMKZY";

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

async function getBotResponse(
    userInput: string, 
    imageData: { type: string; dataUrl: string } | null, 
    history: HistoryItem[], 
    model: GeminiModel, 
    persona: Persona, 
    firebaseUser: User | null // <-- MODIFIED: Pass the user object
): Promise<{ text: string; imageUrl: string | null; modelUsed?: string; username?: string }> {
    const promptToSend = userInput || (imageData ? "Describe this image." : "");
    if (!promptToSend && !imageData) {
        return { text: "Error: Cannot send empty message.", imageUrl: null };
    }

    // <-- MODIFIED: Get token if user exists
    let userToken: string | null = null;
    if (firebaseUser) {
        try {
            userToken = await firebaseUser.getIdToken();
        } catch (error) {
            console.error("Failed to get Firebase ID token:", error);
        }
    }

    const requestBody: ApiRequestBody = {
        action: 'chat',
        prompt: promptToSend,
        model: model,
        persona: persona,
        history: history,
        imageMimeType: imageData?.type,
        imageDataUrl: imageData?.dataUrl,
        token: userToken // <-- MODIFIED: Include token in the request
    };

    console.log(`Sending Chat Req (Model: ${model}, Persona: ${persona}, History: ${history.length}, Img: ${!!imageData}, Token: ${!!userToken})`);
    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        const responseData = await response.json().catch(() => ({ error: `Server error: Invalid response (Status: ${response.status})` }));
        if (!response.ok) throw new Error(responseData?.error || `API Error: ${response.status}`);
        if (responseData.error) throw new Error(responseData.error);
        return {
            text: responseData.reply || '',
            imageUrl: responseData.imageUrl || null,
            modelUsed: responseData.modelUsed,
            username: responseData.username
        };
    } catch (error) {
        console.error('getBotResponse Error:', error);
        const errorMessage = error instanceof Error ? (error.message.startsWith('Error: ') ? error.message : `Error: ${error.message}`) : 'Error: Unknown fetch error.';
        return { text: errorMessage, imageUrl: null };
    }
}

async function getBotResponseForAnalysis(
    userInput: string, 
    model: GeminiModel, 
    persona: Persona, 
    firebaseUser: User | null // <-- MODIFIED: Pass the user object
): Promise<string> {
    if (!userInput) return "Error: No analysis data provided.";
    
    // <-- MODIFIED: Get token if user exists
    let userToken: string | null = null;
    if (firebaseUser) {
        try {
            userToken = await firebaseUser.getIdToken();
        } catch (error) {
            console.error("Failed to get Firebase ID token for analysis:", error);
        }
    }
    
    const requestBody: ApiRequestBody = {
        action: 'chat',
        prompt: userInput,
        model: model,
        persona: persona,
        token: userToken 
    };

    console.log(`Sending Analysis Request (Model: ${model}, Persona: ${persona}, Token: ${!!userToken})`);
    try {
        const res = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({ error: `HTTP Error ${res.status}` }));
            throw new Error(errData?.error || `HTTP Error ${res.status}`);
        }
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        return data.reply || 'No reply received for analysis.';
    } catch (e) {
        console.error('Analysis API Error:', e);
        if (e instanceof Error) {
            if (e.message.includes("Access Key required") || e.message.includes("Invalid")) {
                return "Error: Invalid/Inactive Access Key for analysis.";
            }
            return `Error: ${e.message}`;
        }
        return 'Error: Analysis submission failed.';
    }
}

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

function formatTime(timestamp: number): string {
    if (!timestamp || typeof timestamp !== 'number') return '';
    try {
        return new Date(timestamp).toLocaleTimeString(navigator.language || 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    } catch (e) {
        console.error("Timestamp format error:", e);
        return '';
    }
}

// --- Speech Recognition Setup ---
declare var SpeechRecognitionErrorEvent: { prototype: SpeechRecognitionErrorEvent; new(type: string, eventInitDict: SpeechRecognitionErrorEventInit): SpeechRecognitionErrorEvent; };
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
    onTriggerInterview: () => void;
}

// --- ChatbotPage Component ---
function ChatbotPage({ messages, setMessages, selectedModel, sttLang, selectedPersona, onTriggerInterview }: ChatbotPageProps) {
    // --- State ---
    const [input, setInput] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    const [isOnCooldown, setIsOnCooldown] = useState<boolean>(false);
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [isAnalysisFormVisible, setIsAnalysisFormVisible] = useState<boolean>(false);
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
    const [field1, setField1] = useState(''); const [field2, setField2] = useState(''); const [field3, setField3] = useState(''); const [field4, setField4] = useState(''); const [field5, setField5] = useState('');
    const [currentlySpeakingId, setCurrentlySpeakingId] = useState<number | null>(null);
    const isSpeechSynthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    const [isCaptureModalOpen, setIsCaptureModalOpen] = useState<boolean>(false);
    const [captureMode, setCaptureMode] = useState<'camera' | 'screen' | null>(null);
    const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
    const [capturedImageDataUrl, setCapturedImageDataUrl] = useState<string | null>(null);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState<boolean>(false);
    const [showInDevelopmentPopup, setShowInDevelopmentPopup] = useState<boolean>(false);
    const handleMenuInterviewClick = () => {
        setShowInDevelopmentPopup(true);
        setIsActionMenuOpen(false);
    };

    // --- Refs ---
    const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const menuToggleRef = useRef<HTMLButtonElement>(null);
    
    // <-- MODIFIED: Get user from auth context
    const { user } = useAuth();

    // --- Effects ---
    const scrollToBottom = useCallback(() => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }, 100);
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

    useEffect(() => {
        return () => { if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); };
    }, [imagePreviewUrl]);

    useEffect(() => {
        return () => { if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current); };
    }, []);

    useEffect(() => {
        if (!recognitionAvailable) return;
        if (!recognitionRef.current) {
            try {
                const recognition = new SpeechRecognitionImpl();
                recognition.continuous = false;
                recognition.interimResults = false;

                recognition.onresult = (event: SpeechRecognitionEvent) => {
                    const transcript = event.results[event.results.length - 1]?.[0]?.transcript;
                    if (transcript) {
                        setInput(prev => (prev ? prev + ' ' : '') + transcript);
                    }
                    setIsRecording(false);
                };
                recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
                    console.error('Speech Rec Error:', event.error, event.message);
                    let msg = `Speech error: ${event.error}`;
                    if (event.error === 'no-speech') msg = "No speech detected.";
                    else if (event.error === 'audio-capture') msg = "Microphone error.";
                    else if (event.error === 'not-allowed') msg = "Microphone permission denied.";
                    else msg += ` - ${event.message || 'Unknown'}`;
                    alert(msg);
                    setIsRecording(false);
                };
                recognition.onstart = () => setIsRecording(true);
                recognition.onend = () => setIsRecording(false);
                recognitionRef.current = recognition;
            } catch (err) { console.error("Speech rec init error:", err); }
        }
        return () => {
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch (e) {}
                recognitionRef.current.onresult = null;
                recognitionRef.current.onerror = null;
                recognitionRef.current.onstart = null;
                recognitionRef.current.onend = null;
            }
            setIsRecording(false);
        };
    }, []);

    useEffect(() => {
        return () => { if (isSpeechSynthesisSupported && window.speechSynthesis.speaking) window.speechSynthesis.cancel(); };
    }, [isSpeechSynthesisSupported]);

    useEffect(() => { }, [capturedImageDataUrl]);

    useEffect(() => {
        return () => { if (activeStream) { activeStream.getTracks().forEach(track => track.stop()); setActiveStream(null); } };
    }, [activeStream]);

     useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if ( menuRef.current && !menuRef.current.contains(event.target as Node) &&
                 menuToggleRef.current && !menuToggleRef.current.contains(event.target as Node) ) {
                setIsActionMenuOpen(false);
            }
        }
        if (isActionMenuOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        } else {
            document.removeEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isActionMenuOpen]);

    // --- Helper Functions ---
    const stopActiveStream = useCallback(() => {
        if (activeStream) {
            activeStream.getTracks().forEach(track => track.stop());
            setActiveStream(null);
            setCaptureMode(null);
            setIsCaptureModalOpen(false);
        }
    }, [activeStream]);

    const removeSelectedImage = useCallback(() => {
        setSelectedImage(null);
        if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
        setImagePreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [imagePreviewUrl]);

    const removeCapturedImage = useCallback(() => {
        setCapturedImageDataUrl(null);
    }, []);

    // --- Core Send Logic ---
    const sendMessage = useCallback(async (messageText: string, imageFile: File | null, capturedImage: string | null = null) => {
        if (isSpeechSynthesisSupported && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            setCurrentlySpeakingId(null);
        }

        const textTrimmed = messageText.trim();
        if ((!textTrimmed && !imageFile && !capturedImage) || isLoading || isOnCooldown) return;

        const timestamp = Date.now();
        let imageDataForApi: { type: string; dataUrl: string } | null = null;
        const historyToSend: HistoryItem[] = messages
            .filter(m => (m.sender === 'user' || m.sender === 'bot') && m.text && !m.text.startsWith('Error:'))
            .slice(-MAX_HISTORY)
            .map(m => ({
                role: m.sender === 'user' ? 'user' : 'model',
                parts: [{ text: m.text }]
            }));

        let userMsgText = textTrimmed;
        let userMsgImageUrl: string | undefined = undefined;

        if (capturedImage && imageFile) {
            console.warn("Both captured image and file upload exist, prioritizing captured image.");
            removeSelectedImage();
            imageFile = null;
        }

        if (capturedImage) {
            try {
                if (!capturedImage.startsWith('data:image/jpeg;base64,')) throw new Error("Invalid captured image data format.");
                imageDataForApi = { type: 'image/jpeg', dataUrl: capturedImage };
                userMsgText = textTrimmed || "(Captured Image)";
                userMsgImageUrl = capturedImage;
            } catch (e) {
                alert(`Error preparing captured image: ${(e as Error).message}`);
                console.error("Capture Prep Error:", e);
                removeCapturedImage();
                return;
            }
        } else if (imageFile) {
            try {
                if (!imageFile.type.startsWith('image/')) throw new Error("Invalid file type.");
                if (imageFile.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) throw new Error(`Image size exceeds ${MAX_IMAGE_SIZE_MB}MB.`);
                const dataUrl = await readFileAsBase64(imageFile);
                imageDataForApi = { type: imageFile.type, dataUrl: dataUrl };
                userMsgText = textTrimmed || `(Image: ${imageFile.name})`;
                userMsgImageUrl = dataUrl;
            } catch (e) {
                alert(`Error preparing uploaded image: ${(e as Error).message}`);
                removeSelectedImage();
                return;
            }
        }

        if (!userMsgText && !imageDataForApi) return;

        const userMsg: Message = { id: timestamp, text: userMsgText, sender: 'user', timestamp: timestamp, imageUrl: userMsgImageUrl };
        setMessages(prev => [...prev, userMsg]);

        if (messageText === input) setInput('');
        if (imageFile) removeSelectedImage();
        if (capturedImage) removeCapturedImage();

        setIsLoading(true);
        setIsOnCooldown(true);
        if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = setTimeout(() => setIsOnCooldown(false), SEND_COOLDOWN_MS);

        const loadingTimestamp = Date.now() + 1;
        const loadingMsg: Message = { id: loadingTimestamp, text: 'Loading...', sender: 'loading', timestamp: loadingTimestamp };
        setMessages(prev => [...prev, loadingMsg]);
        scrollToBottom();

        let botResponse: { text: string; imageUrl: string | null; modelUsed?: string; username?: string; } = { text: 'Error: Request failed.', imageUrl: null };
        try {
            // <-- MODIFIED: Pass the user object to the API call
            botResponse = await getBotResponse(textTrimmed, imageDataForApi, historyToSend, selectedModel, selectedPersona, user);
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
                    imageUrl: botResponse.imageUrl ?? undefined,
                    modelUsed: botResponse.modelUsed,
                };
                setMessages(prev => [...prev.filter(m => m.id !== loadingTimestamp), newBotMessage]);
            } else {
                console.warn("Received empty response from bot.");
                setMessages(prev => prev.filter(m => m.id !== loadingTimestamp));
            }
        }
    }, [messages, isLoading, isOnCooldown, input, selectedImage, capturedImageDataUrl, setMessages, selectedModel, selectedPersona, scrollToBottom, isSpeechSynthesisSupported, removeSelectedImage, removeCapturedImage, user]); // <-- MODIFIED: Add user to dependency array

    // --- Event Handlers ---
    const handleSend = () => sendMessage(input, selectedImage, capturedImageDataUrl);
    const handleSuggestionClick = useCallback((suggestionText: string) => sendMessage(suggestionText, null, null), [sendMessage]);
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value);
    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
             if (!file.type.startsWith('image/')) { alert("Invalid file type."); if (fileInputRef.current) fileInputRef.current.value = ""; return; }
             if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) { alert(`Image too large. Max: ${MAX_IMAGE_SIZE_MB}MB.`); if (fileInputRef.current) fileInputRef.current.value = ""; return; }
            removeCapturedImage();
            setSelectedImage(file);
            if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
            setImagePreviewUrl(URL.createObjectURL(file));
        } else {
            removeSelectedImage();
        }
    };
    const handleImageUploadClick = () => fileInputRef.current?.click();
    const handleMicClick = () => {
        if (!recognitionRef.current || !recognitionAvailable) return alert("Speech recognition not available or not initialized.");
        if (isLoading || isOnCooldown) return;
        if (isRecording) {
            try { recognitionRef.current.stop(); }
            catch (e) { console.warn("Error stopping mic:", e); setIsRecording(false); }
        } else {
            try {
                recognitionRef.current.lang = sttLang;
                recognitionRef.current.start();
            } catch (e) {
                 if (e instanceof DOMException && e.name === 'InvalidStateError') { alert("Please wait a moment before starting the microphone again."); }
                 else { console.error("Error starting mic:", e); alert("Could not start microphone. Check permissions."); }
                 setIsRecording(false);
            }
        }
    };
    const clearAnalysisForm = () => { setField1(''); setField2(''); setField3(''); setField4(''); setField5(''); };
    const toggleAnalysisForm = () => {
        setIsAnalysisFormVisible(p => !p);
        if (isAnalysisFormVisible) {
            clearAnalysisForm();
            setIsAnalyzing(false);
        }
    };
    const handleAnalysisSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const v1 = field1.trim(); const v2 = field2.trim(); const v3 = field3.trim(); const v4 = field4.trim(); const v5 = field5.trim();
        if (!v1 || !v2 || !v3 || !v4 || !v5) { alert("Please fill in all fields for analysis."); return; }
        if (isAnalyzing) return;
        setIsAnalyzing(true);

        if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY") {
            try { ReactGA.event({ category: "Chat", action: "Submit Analysis Form" }); }
            catch (gaErr) { console.error("GA Error", gaErr); }
        }

        let analysisInput = `Analyze the following user details for university advice:\nField 1 (Concerns): ${v1}\nField 2 (Enjoy time with): ${v2}\nField 3 (Describe self): ${v3}\nField 4 (Dislike learning): ${v4}\nField 5 (GPA): ${v5}\nPlease provide suitable faculty recommendations, specific university suggestions, and preparation advice.`;

        const ts = Date.now();
        const loadMsg: Message = { id: ts, text: `Analyzing...`, sender: 'loading', timestamp: ts };
        setMessages(p => [...p, loadMsg]);
        toggleAnalysisForm();

        // <-- MODIFIED: Pass the user object to the analysis API call
        const result = await getBotResponseForAnalysis(analysisInput.trim(), selectedModel, selectedPersona, user);

        setMessages(p => p.filter(m => m.id !== ts));
        const resultTimestamp = Date.now() + 1;
        const resultMsg: Message = { id: resultTimestamp, text: result, sender: 'bot', timestamp: resultTimestamp };
        setMessages(p => [...p, resultMsg]);
        setIsAnalyzing(false);
    };
    const handlePlayTTS = useCallback((messageId: number, textToSpeak: string) => {
        if (!isSpeechSynthesisSupported || !textToSpeak) return;
        const synth = window.speechSynthesis;
        const cleanText = textToSpeak
            .replace(/(\*\*|__)(.*?)\1/g, '$2')
            .replace(/(\*|_)(.*?)\1/g, '$2');

        if (currentlySpeakingId === messageId && (synth.speaking || synth.pending)) {
            synth.cancel();
            setCurrentlySpeakingId(null);
            return;
        }
        if (synth.speaking || synth.pending) {
            synth.cancel();
        }
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.onend = () => { if (currentlySpeakingId === messageId) { setCurrentlySpeakingId(null); } };
        utterance.onerror = (event) => { console.error('SpeechSynthesisUtterance.onerror', event); alert(`Speech error: ${event.error || 'Unknown error'}`); if (currentlySpeakingId === messageId) { setCurrentlySpeakingId(null); } };
        synth.speak(utterance);
        setCurrentlySpeakingId(messageId);
    }, [currentlySpeakingId, isSpeechSynthesisSupported]);

     const startMediaCapture = async (type: 'camera' | 'screen') => {
        console.log(`Attempting to start ${type} capture...`);
        removeCapturedImage();
        removeSelectedImage();
        stopActiveStream();

        try {
            let stream: MediaStream;
            if (type === 'camera') {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Camera access (getUserMedia) is not supported.");
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            } else {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error("Screen capture (getDisplayMedia) is not supported.");
                stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
                 if (stream.getVideoTracks().length > 0) {
                    stream.getVideoTracks()[0].onended = () => {
                        console.log("Screen sharing stopped via browser UI.");
                        stopActiveStream();
                    };
                 }
            }
            console.log("Media stream obtained:", stream);
            setActiveStream(stream);
            setCaptureMode(type);
            setIsCaptureModalOpen(true);
        } catch (err) {
            console.error(`Error starting ${type} capture:`, err);
            alert(`Could not start ${type === 'camera' ? 'camera' : 'screen sharing'}. Permission denied or no device found?\nError: ${(err as Error).message}`);
            stopActiveStream();
        }
    };
    const handleCaptureComplete = (imageDataUrl: string) => {
        console.log("Image captured successfully.");
        removeSelectedImage();
        setCapturedImageDataUrl(imageDataUrl);
        stopActiveStream();
    };
    const handleCaptureModalClose = () => {
        console.log("Capture modal closed by user.");
        stopActiveStream();
    };

    // --- Action Menu Handlers ---
    const toggleActionMenu = () => {
        setIsActionMenuOpen(prev => !prev);
    };
    const handleMenuUploadClick = () => {
        handleImageUploadClick();
        setIsActionMenuOpen(false);
    };
    const handleMenuCameraClick = () => {
        startMediaCapture('camera');
        setIsActionMenuOpen(false);
    };
    const handleMenuScreenClick = () => {
        startMediaCapture('screen');
        setIsActionMenuOpen(false);
    };
    const handleMenuAnalysisClick = () => {
        toggleAnalysisForm();
        setIsActionMenuOpen(false);
    };

    // --- Custom Code Renderer for ReactMarkdown ---
    const CodeRenderer = memo(({ node, inline, className, children, ...props }: any) => {
        const match = /language-(\w+)/.exec(className || '');
        const codeText = String(children).replace(/\n$/, '');
        return !inline && match ? (
            <SyntaxHighlighter
                style={prism}
                language={match[1]}
                PreTag="div"
                {...props}
            >
                {codeText}
            </SyntaxHighlighter>
        ) : (
            <code className={inline ? undefined : className} {...props}>
                {children}
            </code>
        );
    });
    CodeRenderer.displayName = 'CodeRenderer';

    // --- JSX Rendering ---
    return (
        <div className="chatbot-container">
            {showInDevelopmentPopup && (
                <div className="popup-overlay">
                    <div className="popup">
                        <h3>In Development</h3>
                        <button onClick={() => setShowInDevelopmentPopup(false)}>Close</button>
                    </div>
                </div>
            )}
            <div className="chatbot-messages">
                {messages.map((message: Message) => {
                    let mainText = message.text; let suggestions: string[] = []; let isErrorMessage = message.sender === 'bot' && message.text.startsWith('Error:');
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
                                        {isErrorMessage ? (
                                            <p className="error-message">{message.text}</p>
                                        ) : mainText ? (
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} children={mainText} components={{ code: CodeRenderer }} />
                                        ) : null}
                                        {message.imageUrl && (
                                            <img src={message.imageUrl} alt="Bot response" className="bot-image" onClick={() => window.open(message.imageUrl, '_blank')} onError={(e) => { console.warn(`Failed image load: ${message.imageUrl}`); const imgElement = e.target as HTMLImageElement; imgElement.style.display = 'none'; const errorText = document.createElement('span'); errorText.textContent = '[Image failed to load]'; errorText.style.fontSize = '0.8em'; errorText.style.color = 'grey'; imgElement.parentNode?.insertBefore(errorText, imgElement.nextSibling); }} />
                                        )}
                                        {!mainText && !message.imageUrl && !isErrorMessage && (<i>[Empty Response]</i>)}
                                    </>
                                ) : message.sender === 'loading' ? (
                                    <div className="loading-indicator"><span></span><span></span><span></span></div>
                                ) : (
                                    <p style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p>
                                )}
                            </div>
                            <div className="message-meta">
                                {message.sender !== 'loading' && message.timestamp > 0 && (
                                    <span className="message-timestamp">{formatTime(message.timestamp)}</span>
                                )}
                                {message.sender === 'bot' && mainText && !isErrorMessage && isSpeechSynthesisSupported && (
                                    <button
                                        className={`tts-button ${currentlySpeakingId === message.id ? 'speaking' : ''}`}
                                        onClick={() => handlePlayTTS(message.id, mainText)}
                                        title={currentlySpeakingId === message.id ? "Stop Speech" : "Read Aloud"}
                                        aria-label={currentlySpeakingId === message.id ? "Stop Speech" : "Read Aloud"}
                                    >
                                        {currentlySpeakingId === message.id ? '⏹️' : '🔊'}
                                    </button>
                                )}
                            </div>
                            {message.sender === 'bot' && !isErrorMessage && (
            <>
                {suggestions.length > 0 && (
                    <div className="suggestions-container">
                        {suggestions.map((s, i) => (
                            <button key={`${message.id}-s-${i}`} className="suggestion-button" onClick={() => handleSuggestionClick(s)} disabled={isLoading || isOnCooldown}>{s}</button>
                        ))}
                    </div>
                )}
                
                {/* This is the new part for web search results */}
                {message.sources && message.sources.length > 0 && (
                    <div className="message-sources">
                        <strong>Sources:</strong>
                        <ul>
                            {message.sources.map((url, index) => (
                                <li key={index}>
                                    <a href={url} target="_blank" rel="noopener noreferrer">
                                        {new URL(url).hostname}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </>
        )}
    </div>
);
                })}
                <div ref={messagesEndRef} style={{ height: '1px' }} />
            </div>

            {isAnalysisFormVisible && (
                <div className="analysis-form-overlay">
                    <div className="analysis-form-modal">
                        <h3 id="analysis-title">University Advice Form</h3>
                        <button onClick={toggleAnalysisForm} className="close-staff-panel-button" title="Close Form">×</button>
                        <p style={{fontSize:'0.9em', color:'var(--text-secondary)', marginBottom:'15px'}}>Provide details for AI analysis.</p>
                        <form onSubmit={handleAnalysisSubmit}>
                             <div className="settings-option" style={{marginBottom:'15px'}}> <label htmlFor="analysis-field1">1. Concerns about university?</label> <input type="text" id="analysis-field1" className="settings-input" value={field1} onChange={(e)=>setField1(e.target.value)} placeholder="e.g., workload, social life, cost" disabled={isAnalyzing} required /> </div>
                             <div className="settings-option" style={{marginBottom:'15px'}}> <label htmlFor="analysis-field2">2. Who do you enjoy spending time with?</label> <input type="text" id="analysis-field2" className="settings-input" value={field2} onChange={(e)=>setField2(e.target.value)} placeholder="e.g., close friends, family, alone" disabled={isAnalyzing} required /> </div>
                             <div className="settings-option" style={{marginBottom:'15px'}}> <label htmlFor="analysis-field3">3. Describe your personality?</label> <input type="text" id="analysis-field3" className="settings-input" value={field3} onChange={(e)=>setField3(e.target.value)} placeholder="e.g., introverted, creative, analytical" disabled={isAnalyzing} required /> </div>
                             <div className="settings-option" style={{marginBottom:'15px'}}> <label htmlFor="analysis-field4">4. What learning methods do you dislike?</label> <input type="text" id="analysis-field4" className="settings-input" value={field4} onChange={(e)=>setField4(e.target.value)} placeholder="e.g., memorization, group projects, exams" disabled={isAnalyzing} required /> </div>
                             <div className="settings-option" style={{marginBottom:'15px'}}> <label htmlFor="analysis-field5">5. Estimated GPA or academic level?</label> <input type="text" id="analysis-field5" className="settings-input" value={field5} onChange={(e)=>setField5(e.target.value)} placeholder="e.g., 3.5, Good, Average" disabled={isAnalyzing} required /> </div>
                            <div className="analysis-form-actions">
                                <button type="button" onClick={toggleAnalysisForm} className="close-settings-button" disabled={isAnalyzing}>Cancel</button>
                                <button type="submit" className="beta-accept-button" disabled={!field1.trim()||!field2.trim()||!field3.trim()||!field4.trim()||!field5.trim()||isAnalyzing}>{isAnalyzing?'Analyzing...':'Submit for Advice'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isCaptureModalOpen && captureMode && (
                <MediaCaptureModal
                    stream={activeStream}
                    onCapture={handleCaptureComplete}
                    onClose={handleCaptureModalClose}
                    captureType={captureMode}
                />
            )}

            <div className="chatbot-input-area">
                 {imagePreviewUrl && selectedImage && (
                    <div className="image-preview-area">
                        <img src={imagePreviewUrl} alt={selectedImage.name} className="image-preview-thumbnail" />
                        <span>{selectedImage.name}</span>
                        <button onClick={removeSelectedImage} title="Remove uploaded image" className="remove-image-button">×</button>
                    </div>
                )}
                {capturedImageDataUrl && !selectedImage && (
                    <div className="image-preview-area" style={{ backgroundColor: 'var(--bot-bubble-bg)'}}>
                        <img src={capturedImageDataUrl} alt="Captured Frame" className="image-preview-thumbnail" />
                        <span>{captureMode === 'camera' ? 'Camera Capture' : 'Screen Capture'}</span>
                        <button onClick={removeCapturedImage} title="Remove captured image" className="remove-image-button">×</button>
                    </div>
                )}

                <div style={{ position: 'relative', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexGrow: 1, gap: '10px' }}>
                        <button
                            ref={menuToggleRef}
                            onClick={toggleActionMenu}
                            className="input-button action-menu-toggle-button"
                            title="More Actions"
                            disabled={isLoading || isOnCooldown}
                            aria-haspopup="true"
                            aria-expanded={isActionMenuOpen}
                            style={{ marginLeft: '15px' }}
                        >
                           <FaPlus />
                        </button>

                        <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleImageChange}/>

                        <input
                            type="text"
                            className="chatbot-input"
                            value={input}
                            onChange={handleInputChange}
                            onKeyPress={handleKeyPress}
                            placeholder={isLoading ? "Waiting..." : (imagePreviewUrl || capturedImageDataUrl ? "Add text or send image..." : "Type your message...")}
                            disabled={isLoading || isOnCooldown}
                            aria-label="Chat input"
                            style={{ flexGrow: 1 }}
                        />

                        {recognitionAvailable && (
                            <button
                                onClick={handleMicClick}
                                className={`input-button mic-button ${isRecording ? 'recording' : ''}`}
                                title={isRecording ? "Stop Recording" : "Start Speech Input"}
                                disabled={isLoading || isOnCooldown}
                            >
                                {isRecording ? <FaStopCircle/> : <FaMicrophone />}
                            </button>
                        )}

                        <button
                            onClick={handleSend}
                            className="send-button"
                            title="Send"
                            disabled={(!input.trim() && !selectedImage && !capturedImageDataUrl) || isLoading || isOnCooldown}
                        >
                            <FaPaperPlane/>
                        </button>
                    </div>

                    {isActionMenuOpen && (
                        <div className="action-menu-popup" ref={menuRef}>
                            <button onClick={handleMenuUploadClick} className="action-menu-item" disabled={isLoading || isOnCooldown}>
                                <FaPaperclip /> Upload Image
                            </button>
                            <button onClick={handleMenuCameraClick} className="action-menu-item" disabled={isLoading || isOnCooldown}>
                                <FaCamera /> Use Camera
                            </button>
                            <button onClick={handleMenuScreenClick} className="action-menu-item" disabled={isLoading || isOnCooldown}>
                                <FaDesktop /> Capture Screen
                            </button>
                            <button onClick={handleMenuAnalysisClick} className="action-menu-item" disabled={isLoading || isOnCooldown}>
                                <FaEdit /> University Form
                            </button>
                            <button onClick={handleMenuInterviewClick} className="action-menu-item" disabled={isLoading || isOnCooldown}>
                                <FaUserTie /> Start Interview
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ChatbotPage;