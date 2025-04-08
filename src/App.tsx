// src/App.tsx - Verified Full Version with Theme Toggle
import React, { useState, useEffect, ChangeEvent, useRef, useCallback } from 'react';
import ReactGA from 'react-ga4';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import './App.css'; // Ensure your CSS file is correctly imported
import ChatbotPage from './ChatbotPage'; // Ensure ChatbotPage component is correctly imported
import AdminPage from './AdminPage'; // Ensure AdminPage component is correctly imported

// --- GA Initialization ---
const GA_MEASUREMENT_ID = "G-JX58QMMKZY"; // Replace with your actual ID if different
if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" && GA_MEASUREMENT_ID !== "YOUR_GA_ID_HERE") {
    try {
        ReactGA.initialize(GA_MEASUREMENT_ID);
        console.log("GA Init:", GA_MEASUREMENT_ID);
        ReactGA.send({ hitType: "pageview", page: window.location.pathname + window.location.search, title: "Initial Load" });
    } catch (e) {
        console.error("GA Init Err:", e);
    }
} else {
    console.warn("GA ID missing/invalid. GA not initialized.");
}

// --- Types & Interfaces (Exported) ---
export interface Message {
    id: number;
    text: string;
    sender: 'user' | 'bot' | 'loading';
    timestamp: number;
    imageUrl?: string; // For displaying images sent/received
    modelUsed?: string; // Optional: Track which model generated the response
}
export type GeminiModel =
    | 'gemini-2.0-flash'
    | 'gemini-2.0-flash-lite'
    | 'gemini-2.5-pro-exp-03-25'
    | 'gemini-2.0-flash-thinking-exp-01-21'
    | 'gemini-2.0-flash-exp-image-generation'; // Example new model

export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR'; // Add more as needed
export type Persona = 'normal' | 'therapist' | 'university_master';
interface KeyValidationStatus {
    isValid: boolean | null;
    username: string | null;
    loading: boolean;
    error?: string | null;
}
export interface UserKeyInfo {
    key: string;
    username: string | null;
    status: 'active' | 'inactive';
    created_at: string; // Assuming ISO string format
}
export interface FeedbackItem {
    id: number;
    email: string | null;
    rating: number;
    comment: string;
    submitted_at: string; // Assuming ISO string format
    is_important: number; // 0 or 1
}
export type PersonaInstructionMap = { [key in Persona]?: string };
export type AppTheme = 'light' | 'dark';


// --- localStorage Keys ---
const CHAT_STORAGE_KEY = 'chatMessages';
const BETA_ACCEPTED_KEY = 'betaAccepted';
const MODEL_STORAGE_KEY = 'selectedApiModel';
const STT_LANG_STORAGE_KEY = 'selectedSttLang';
const ACCESS_KEY_STORAGE_KEY = 'userAccessKey';
const PERSONA_STORAGE_KEY = 'selectedPersona';
const THEME_STORAGE_KEY = 'selectedAppTheme';

// --- Configurations (Exported) ---
export interface ModelInfo { value: GeminiModel; label: string; restricted: boolean; }
export const ALL_AVAILABLE_MODELS_FRONTEND: ModelInfo[] = [
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', restricted: false },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', restricted: false },
    { value: 'gemini-2.0-flash-thinking-exp-01-21', label: 'Gemini 2.0 Flash Thinking Exp', restricted: true },
    { value: 'gemini-2.0-flash-exp-image-generation', label: 'Gemini 2.0 Flash Image Gen Exp', restricted: true },
    { value: 'gemini-2.5-pro-exp-03-25', label: 'Gemini 2.5 Pro Exp', restricted: true }
];
export const ALL_MODEL_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS_FRONTEND.map(m => m.value);

export interface PersonaInfo { value: Persona; label: string; emoji: string; restricted: boolean; }
export const AVAILABLE_PERSONAS: PersonaInfo[] = [
    { value: 'university_master', label: 'University Master', emoji: '🎓', restricted: false },
    { value: 'normal', label: 'Normal Bot', emoji: '🤖', restricted: true },
    { value: 'therapist', label: 'Therapist', emoji: '🧠', restricted: true }
];
export const ALL_PERSONAS: Persona[] = AVAILABLE_PERSONAS.map(p => p.value);
export const DEFAULT_UNRESTRICTED_PERSONA: Persona = 'university_master'; // Default accessible persona

// Identify restricted models/personas
export const RESTRICTED_MODELS_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS_FRONTEND.filter(m => m.restricted).map(m => m.value);
export const RESTRICTED_PERSONAS_VALUES: Persona[] = AVAILABLE_PERSONAS.filter(p => p.restricted).map(p => p.value);

// Default Instructions
export const DEFAULT_BASE_SYSTEM_INSTRUCTION = `You are a helpful AI assistant. Format responses using Markdown. Provide suggestions for general topics like [Suggestion: Suggestion Text]. Avoid this format for sensitive personal advice. Respond in Thai if user uses Thai. Offer inspirational quotes if user feels down. If input starts with "Field 1:", analyze for university advice based only on fields 1-5.`;
export const DEFAULT_PERSONA_INSTRUCTIONS: PersonaInstructionMap = {
    normal: `Act as a general assistant. Use [Suggestion: ...] for follow-ups on general topics.`,
    therapist: `Roleplay as an empathetic therapist assistant. Use gentle, validating language. Do NOT give medical advice. Ask gentle questions or suggest coping mechanisms in PLAIN TEXT, not [Suggestion:...]. Prioritize inspirational quotes for distress.`,
    university_master: `Roleplay as an expert academic advisor. Focus on university/career topics. Use [Suggestion: ...] for general academic questions. Provide detailed recommendations for "Field 1-5" input.`
};
export const ALL_PERSONA_KEYS = Object.keys(DEFAULT_PERSONA_INSTRUCTIONS);


// --- API ---
// Make sure this points to your deployed Cloudflare Worker or backend
export const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';
export interface ApiRequestBody {
    action: string;
    // For 'chat' action
    prompt?: string;
    model?: GeminiModel;
    persona?: Persona;
    imageMimeType?: string;
    imageDataUrl?: string; // Base64 data URL
    accessKey?: string;
    history?: any[]; // Define more specific type if possible
    // For 'staffLogin' action
    staffKey?: string;
    // For 'validateKey' action (accessKey already defined)
    // For Admin actions
    key?: string; // The key being managed
    newStatus?: 'active' | 'inactive';
    models?: GeminiModel[]; // Allowed models for the key
    personas?: Persona[]; // Allowed personas for the key
    username?: string | null; // Current username for update
    newUsername?: string | null; // New username
    // For Feedback actions
    email?: string | null;
    rating?: number;
    comment?: string;
    feedbackId?: number;
    isImportant?: boolean | number; // Accept boolean or 0/1
    // For fetching/updating config
    baseInstruction?: string;
    personaInstructions?: PersonaInstructionMap;
    // Future use?
    fileId?: string;
}

// --- Constants ---
const VALIDATION_DEBOUNCE_MS = 600;

// --- Component for Protected Route ---
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const keyFromSession = sessionStorage.getItem('staffKey');
    const location = useLocation();

    if (!keyFromSession) {
        console.log("ProtectedRoute: No key, redirecting from", location.pathname);
        return <Navigate to="/" replace />;
    }
    return <>{children}</>;
};

// --- Helper function to get initial theme ---
const getInitialTheme = (): AppTheme => {
    if (typeof window !== 'undefined') {
        const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) as AppTheme | null;
        if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) {
            return storedTheme;
        }
        // Check system preference if no theme is stored
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
    }
    return 'light'; // Default to light
};


// --- App Component ---
function App() {
    // --- State ---
    const [messages, setMessages] = useState<Message[]>(() => {
        const stored = localStorage.getItem(CHAT_STORAGE_KEY);
        let initial: Message[] = [];
        try {
            initial = stored && stored !== '[]' ? JSON.parse(stored) : [];
            if (!Array.isArray(initial)) throw new Error("Bad format");
            // Filter out any loading messages from previous sessions
            initial = initial.filter(m => m.sender !== 'loading');
        } catch (e) {
            console.error("Bad stored msgs:", e);
            localStorage.removeItem(CHAT_STORAGE_KEY);
            initial = [];
        }
        // Provide a welcome message if history is empty
        if (initial.length === 0) {
            const ts = Date.now();
            return [{ id: ts, text: "Welcome!", sender: 'bot', timestamp: ts }];
        } else {
            return initial;
        }
    });
    const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);
    const [enteredKey, setEnteredKey] = useState<string>(() => localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '');
    const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.0-flash'); // Default to a non-restricted model initially
    const [sttLang, setSttLang] = useState<SpeechLanguage>(() => {
        const stored = localStorage.getItem(STT_LANG_STORAGE_KEY) as SpeechLanguage | null;
        if (stored && ['en-US', 'th-TH', 'es-ES', 'fr-FR'].includes(stored)) {
            return stored;
        }
        return 'en-US'; // Default
    });
    const [selectedPersona, setSelectedPersona] = useState<Persona>(DEFAULT_UNRESTRICTED_PERSONA);
    const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
    const [keyStatus, setKeyStatus] = useState<KeyValidationStatus>({ isValid: null, username: null, loading: false, error: null });
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isStaffLoginModalVisible, setIsStaffLoginModalVisible] = useState<boolean>(false);
    const [enteredStaffKey, setEnteredStaffKey] = useState<string>('');
    const [isStaffLoginLoading, setIsStaffLoginLoading] = useState<boolean>(false);
    const [staffLoginError, setStaffLoginError] = useState<string | null>(null);
    const [isFeedbackModalVisible, setIsFeedbackModalVisible] = useState<boolean>(false);
    const [feedbackEmail, setFeedbackEmail] = useState<string>('');
    const [feedbackRating, setFeedbackRating] = useState<number>(0);
    const [feedbackComment, setFeedbackComment] = useState<string>('');
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState<boolean>(false);
    const [feedbackError, setFeedbackError] = useState<string | null>(null);
    const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
    const [currentTheme, setCurrentTheme] = useState<AppTheme>(getInitialTheme);


    const navigate = useNavigate();

    // --- Effects ---

    // Debounced Key Validation Effect
    useEffect(() => {
        const keyTrimmed = enteredKey.trim();
        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

        const currentModel = selectedModel;
        const currentPersona = selectedPersona;

        if (!keyTrimmed) {
            // No key entered, reset status and ensure non-restricted defaults
            setKeyStatus({ isValid: null, username: null, loading: false, error: null });
            if (RESTRICTED_MODELS_VALUES.includes(currentModel)) {
                setSelectedModel('gemini-2.0-flash'); // Revert to non-restricted model
            }
            if (RESTRICTED_PERSONAS_VALUES.includes(currentPersona)) {
                setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA); // Revert to non-restricted persona
            }
            return;
        }

        // Start loading state
        setKeyStatus(prev => ({ ...prev, loading: true, isValid: null, error: null, username: null }));

        debounceTimeoutRef.current = setTimeout(async () => {
            try {
                const response = await fetch(WORKER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'validateKey', accessKey: keyTrimmed })
                });
                const data = await response.json().catch(() => ({ error: `Invalid JSON` }));

                if (!response.ok) throw new Error(data?.error || `Validation failed: ${response.status}`);

                if (data.isValid) {
                    // Key is valid
                    setKeyStatus({ isValid: true, username: data.username || 'User', loading: false, error: null });
                    // Restore saved model/persona ONLY if they were loaded from localStorage initially
                    const savedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null;
                    if (savedModel && ALL_MODEL_VALUES.includes(savedModel)) {
                         setSelectedModel(savedModel);
                    } else {
                         setSelectedModel(currentModel); // Keep current if no saved pref or invalid
                    }
                    const savedPersona = localStorage.getItem(PERSONA_STORAGE_KEY) as Persona | null;
                     if (savedPersona && ALL_PERSONAS.includes(savedPersona)) {
                         setSelectedPersona(savedPersona);
                    } else {
                         setSelectedPersona(currentPersona); // Keep current if no saved pref or invalid
                     }

                } else {
                    // Key is invalid
                    setKeyStatus({ isValid: false, username: null, loading: false, error: data?.error || 'Invalid key.' });
                    // Force non-restricted model/persona if current ones require a key
                    if (RESTRICTED_MODELS_VALUES.includes(currentModel)) {
                        setSelectedModel('gemini-2.0-flash');
                    }
                    if (RESTRICTED_PERSONAS_VALUES.includes(currentPersona)) {
                        setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
                    }
                }
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : "Validation network error.";
                console.error("Key Validation API Error:", errorMessage);
                setKeyStatus({ isValid: false, username: null, loading: false, error: errorMessage });
                // Force non-restricted model/persona on error
                 if (RESTRICTED_MODELS_VALUES.includes(currentModel)) {
                     setSelectedModel('gemini-2.0-flash');
                 }
                 if (RESTRICTED_PERSONAS_VALUES.includes(currentPersona)) {
                     setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
                 }
            }
        }, VALIDATION_DEBOUNCE_MS);

        return () => { if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current); };
    }, [enteredKey, selectedModel, selectedPersona]); // Rerun when key, model, or persona changes

    // Initial Load Effect (check beta, stored settings, validate initial key)
    useEffect(() => {
        const initialKey = localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '';
        const storedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null;
        const storedPersona = localStorage.getItem(PERSONA_STORAGE_KEY) as Persona | null;

        // Set initial model/persona (prefer stored, then default)
        let initialModel: GeminiModel = 'gemini-2.0-flash'; // Start with non-restricted
        if (storedModel && ALL_MODEL_VALUES.includes(storedModel)) {
            initialModel = storedModel;
        }
        setSelectedModel(initialModel);

        let initialPersona: Persona = DEFAULT_UNRESTRICTED_PERSONA; // Start with non-restricted
        if (storedPersona && ALL_PERSONAS.includes(storedPersona)) {
            initialPersona = storedPersona;
        }
        setSelectedPersona(initialPersona);

        // Check Beta acceptance
        const accepted = localStorage.getItem(BETA_ACCEPTED_KEY);
        if (accepted !== 'true') {
            setShowBetaNotice(true);
        }

        // Validate the initial key from storage if it exists
        if (initialKey.trim()) {
            const validateInitialKey = async (key: string, model: GeminiModel, persona: Persona) => {
                setKeyStatus(prev => ({ ...prev, loading: true }));
                try {
                    const response = await fetch(WORKER_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'validateKey', accessKey: key })
                    });
                    const data = await response.json().catch(() => ({ error: 'Invalid JSON' }));

                    if (response.ok && data.isValid) {
                        setKeyStatus({ isValid: true, username: data.username || 'User', loading: false, error: null });
                         // Ensure loaded model/persona are kept
                         setSelectedModel(model);
                         setSelectedPersona(persona);
                    } else {
                        setKeyStatus({ isValid: false, username: null, loading: false, error: data?.error || 'Invalid key' });
                        // Revert to non-restricted if initial model/persona needed a key
                        if (RESTRICTED_MODELS_VALUES.includes(model)) {
                           setSelectedModel('gemini-2.0-flash');
                        }
                        if (RESTRICTED_PERSONAS_VALUES.includes(persona)) {
                           setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
                        }
                    }
                } catch (e) {
                    console.error("Initial Key Validation Error:", e);
                    setKeyStatus({ isValid: false, username: null, loading: false, error: 'Validation failed' });
                     // Revert to non-restricted on error
                     if (RESTRICTED_MODELS_VALUES.includes(model)) {
                        setSelectedModel('gemini-2.0-flash');
                     }
                     if (RESTRICTED_PERSONAS_VALUES.includes(persona)) {
                        setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
                     }
                }
            };
            validateInitialKey(initialKey, initialModel, initialPersona);
        } else {
             // No initial key, ensure model/persona are non-restricted
             if (RESTRICTED_MODELS_VALUES.includes(initialModel)) {
                 setSelectedModel('gemini-2.0-flash');
             }
             if (RESTRICTED_PERSONAS_VALUES.includes(initialPersona)) {
                 setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
             }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only once on mount

    // Persistence Effects
    useEffect(() => {
        // Persist messages, excluding loading and initial welcome if nothing else exists
        const messagesToSave = messages.filter(m => m.sender !== 'loading');
        if (messagesToSave.length > 1 || (messagesToSave.length === 1 && messagesToSave[0].sender !== 'bot')) {
             localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messagesToSave));
        } else if (messagesToSave.length === 0) {
             // Clear storage if chat becomes empty
             localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify([]));
        }
    }, [messages]);
    useEffect(() => { localStorage.setItem(MODEL_STORAGE_KEY, selectedModel); }, [selectedModel]);
    useEffect(() => { localStorage.setItem(STT_LANG_STORAGE_KEY, sttLang); }, [sttLang]);
    useEffect(() => { localStorage.setItem(ACCESS_KEY_STORAGE_KEY, enteredKey); }, [enteredKey]);
    useEffect(() => { localStorage.setItem(PERSONA_STORAGE_KEY, selectedPersona); }, [selectedPersona]);
    useEffect(() => {
        // Apply theme to HTML element and persist
        localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
        document.documentElement.setAttribute('data-theme', currentTheme);
    }, [currentTheme]);
    useEffect(() => {
        // Auto-hide feedback success message
        let timer: NodeJS.Timeout | null = null;
        if (feedbackSuccess) {
            timer = setTimeout(() => setFeedbackSuccess(null), 3000); // Hide after 3 seconds
        }
        return () => { if (timer) clearTimeout(timer); };
    }, [feedbackSuccess]);


    // --- Event Handlers ---
    const handleAcceptBeta = () => {
        localStorage.setItem(BETA_ACCEPTED_KEY, 'true');
        setShowBetaNotice(false);
    };
    const handleModelChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const model = e.target.value as GeminiModel;
        if (ALL_MODEL_VALUES.includes(model)) { // Basic validation
             setSelectedModel(model);
        }
    };
    const handleSttLangChange = (e: ChangeEvent<HTMLSelectElement>) => {
        setSttLang(e.target.value as SpeechLanguage);
    };
     const handlePersonaChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const persona = e.target.value as Persona;
         if (ALL_PERSONAS.includes(persona)) { // Basic validation
            setSelectedPersona(persona);
         }
    };
    const toggleSettings = () => {
        setIsSettingsOpen(prev => !prev);
        // Close other modals when opening settings
        if (!isSettingsOpen) {
             setIsStaffLoginModalVisible(false);
             setIsFeedbackModalVisible(false);
        }
    };
    const handleClearChat = () => {
        if (window.confirm("Are you sure you want to clear the chat history? This cannot be undone.")) {
            const timestamp = Date.now();
            const clearMessage: Message = { id: timestamp, text: "Chat cleared.", sender: 'bot', timestamp: timestamp };
            setMessages([clearMessage]); // Reset to just a "cleared" message
            localStorage.removeItem(CHAT_STORAGE_KEY); // Also clear storage explicitly
            setIsSettingsOpen(false); // Close settings after action
        }
    };
    const handleAccessKeyChange = (e: ChangeEvent<HTMLInputElement>) => {
        setEnteredKey(e.target.value);
    };
    const handleExportChat = () => {
         const messagesToExport = messages.filter(m => m.sender !== 'loading');
         if (messagesToExport.length === 0 || (messagesToExport.length === 1 && messagesToExport[0].sender === 'bot' && messagesToExport[0].text === "Welcome!")) {
             return alert("Chat is empty or only contains the welcome message.");
         }

        let content = `Chat Export\n`;
        content += `Timestamp: ${new Date().toLocaleString()}\n`;
        content += `Model Used: ${selectedModel}\n`;
        content += `Persona: ${selectedPersona}\n`;
        content += `User Key Status: ${keyStatus.isValid ? `Valid (${keyStatus.username || 'User'})` : 'N/A (No valid key)'}\n`;
        content += `Theme: ${currentTheme}\n`;
        content += `----\n\n`;

         messagesToExport.forEach(m => {
            const time = new Date(m.timestamp).toLocaleString();
            const senderLabel = m.sender === 'user' ? 'User' : 'Bot';
            content += `[${time}] ${senderLabel}:\n`;
            content += `${m.text}\n`;
            if (m.imageUrl) {
                 content += `(Image Attachment: ${m.imageUrl.substring(0, 50)}...)\n`; // Truncate long data URLs
            }
            content += `\n`; // Add space between messages
        });

        try {
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const filename = `theraphy-chat-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
             if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY") {
                ReactGA.event({ category: "Chat", action: "Export", label: `Msg Count: ${messagesToExport.length}` });
            }
            setIsSettingsOpen(false); // Close settings after export
        } catch (e) {
            console.error("Export failed:", e);
            alert("Failed to export chat.");
        }
    };
    const toggleStaffLoginModal = () => {
        setIsStaffLoginModalVisible(prev => !prev);
        // Reset fields if closing
        if (isStaffLoginModalVisible) {
            setEnteredStaffKey('');
            setStaffLoginError(null);
        }
        // Close other modals
        setIsSettingsOpen(false);
        setIsFeedbackModalVisible(false);
    };
    const handleStaffKeyChange = (e: ChangeEvent<HTMLInputElement>) => {
        setEnteredStaffKey(e.target.value);
        setStaffLoginError(null); // Clear error on typing
    };
    const handleStaffLogin = async () => {
        if (!enteredStaffKey.trim()) {
            setStaffLoginError("Staff key is required.");
            return;
        }
        setIsStaffLoginLoading(true);
        setStaffLoginError(null);
        try {
            const res = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'staffLogin', staffKey: enteredStaffKey })
            });
            const data = await res.json().catch(() => ({ error: 'Invalid JSON response from server.' }));

            if (!res.ok || !data.isValid) {
                throw new Error(data?.error || `Login Failed (Status: ${res.status})`);
            }
            // --- Store key in Session Storage for SPA session ---
            sessionStorage.setItem('staffKey', enteredStaffKey);
            setIsStaffLoginModalVisible(false);
            setEnteredStaffKey(''); // Clear key field
            navigate('/admin'); // Navigate to admin page on success

        } catch (e) {
            setStaffLoginError(e instanceof Error ? e.message : "Login failed due to an unknown error.");
            sessionStorage.removeItem('staffKey'); // Ensure key is removed on failure
        } finally {
            setIsStaffLoginLoading(false);
        }
    };
    const toggleFeedbackModal = () => {
        const closing = isFeedbackModalVisible;
        setIsFeedbackModalVisible(prev => !prev);
        // Reset form if closing
        if (closing) {
            setFeedbackEmail('');
            setFeedbackRating(0);
            setFeedbackComment('');
            setFeedbackError(null);
            setFeedbackSuccess(null);
            setIsSubmittingFeedback(false); // Ensure submit state is reset
        }
        // Close other modals when opening feedback
        if (!closing) {
             setIsSettingsOpen(false);
             setIsStaffLoginModalVisible(false);
        }
    };
    const handleFeedbackSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (feedbackRating === 0) {
            setFeedbackError("Please select a star rating.");
            return;
        }
        if (!feedbackComment.trim()) {
            setFeedbackError("Please provide a comment.");
            return;
        }
         if (feedbackComment.length > 2000) {
            setFeedbackError("Comment is too long (max 2000 characters).");
            return;
        }

        setIsSubmittingFeedback(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);

        const payload: ApiRequestBody = {
            action: 'submitFeedback',
            email: feedbackEmail.trim() || null, // Send null if empty
            rating: feedbackRating,
            comment: feedbackComment.trim()
        };

        try {
            const res = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({ error: 'Invalid JSON response' }));

            if (!res.ok || !data.success) {
                throw new Error(data?.error || `Submit failed: ${res.statusText}`);
            }

            setFeedbackSuccess("Thank you! Your feedback has been submitted.");
            // Clear form fields after successful submission
            setFeedbackEmail('');
            setFeedbackRating(0);
            setFeedbackComment('');
             // Auto-close modal after a short delay (uses useEffect for timer)
             if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY") {
                ReactGA.event({ category: "Feedback", action: "Submit", label: `Rating: ${feedbackRating}` });
            }

        } catch (err) {
            setFeedbackError(err instanceof Error ? err.message : "Failed to submit feedback.");
        } finally {
            setIsSubmittingFeedback(false);
        }
    };
    // Theme Toggle using useCallback
     const toggleTheme = useCallback(() => {
        setCurrentTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
    }, []);


    // --- JSX ---
    // The data-theme attribute is applied in the useEffect hook based on currentTheme state
    return (
        <div className="App"> {/* This div gets height: 100% and flex from CSS */}

            {/* Beta Notice Modal */}
            {showBetaNotice && (
                <div className="beta-notice-overlay">
                    <div className="beta-notice-modal">
                        <h2>⚠️ Beta Notice</h2>
                        <p>Welcome! This is a beta test version. Features may change or contain bugs.</p>
                        <p>Your feedback is valuable!</p>
                        <button onClick={handleAcceptBeta} className="beta-accept-button">✔️ Accept & Continue</button>
                    </div>
                </div>
            )}

             {/* Settings Menu Modal */}
             {isSettingsOpen && (
                <div className="settings-menu" role="dialog" aria-labelledby="settings-title">
                    <h3 id="settings-title">Settings</h3>
                    <div className="settings-grid">
                        {/* Column 1: Key, Persona, Model */}
                        <div className="settings-column">
                             <div className="settings-option">
                                <label htmlFor="access-key-input">Access Key:</label>
                                <input type="password" id="access-key-input" className="settings-input" placeholder="Enter access key" value={enteredKey} onChange={handleAccessKeyChange} autoComplete="off"/>
                                <div className="settings-key-status">
                                    {keyStatus.loading ? <span className="key-loading">Validating...</span> :
                                     keyStatus.isValid ? <span className="key-valid">✅ Valid Key ({keyStatus.username || 'User'})</span> :
                                     keyStatus.error ? <span className="key-invalid">❌ {keyStatus.error}</span> :
                                     <span>Enter key for restricted features.</span>}
                                </div>
                            </div>
                             <div className="settings-option">
                                <label htmlFor="persona-select">Persona:</label>
                                <select
                                    id="persona-select"
                                    value={selectedPersona}
                                    onChange={handlePersonaChange}
                                    className="settings-select"
                                    disabled={AVAILABLE_PERSONAS.find(p => p.value === selectedPersona)?.restricted && keyStatus.isValid !== true}
                                >
                                     {AVAILABLE_PERSONAS.map((p) => {
                                        const isDisabled = p.restricted && keyStatus.isValid !== true;
                                        const style = isDisabled ? { color: '#888', fontStyle: 'italic' } : {};
                                        return (
                                            <option key={p.value} value={p.value} disabled={isDisabled} style={style}>
                                                {p.emoji} {p.label}{p.restricted ? ' (Key Req.) ' : ''}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                             <div className="settings-option">
                                <label htmlFor="model-select">AI Model:</label>
                                <select
                                    id="model-select"
                                    value={selectedModel}
                                    onChange={handleModelChange}
                                    className="settings-select"
                                    disabled={ALL_AVAILABLE_MODELS_FRONTEND.find(m => m.value === selectedModel)?.restricted && keyStatus.isValid !== true}
                                >
                                    {ALL_AVAILABLE_MODELS_FRONTEND.map((m) => {
                                        const isDisabled = m.restricted && keyStatus.isValid !== true;
                                        const style = isDisabled ? { color: '#888', fontStyle: 'italic' } : {};
                                        return (
                                             <option key={m.value} value={m.value} disabled={isDisabled} style={style}>
                                                {m.label}{m.restricted ? ' (Key Req.)' : ''}
                                             </option>
                                        );
                                     })}
                                </select>
                                {keyStatus.isValid !== true && (RESTRICTED_PERSONAS_VALUES.length > 0 || RESTRICTED_MODELS_VALUES.length > 0) && (
                                     <p className="settings-helper-text">Enter valid key to unlock restricted options.</p>
                                )}
                            </div>
                        </div>
                         {/* Column 2: Language, Theme, Actions */}
                         <div className="settings-column">
                            <div className="settings-option">
                                <label htmlFor="stt-lang-select">Speech Input Lang:</label>
                                <select id="stt-lang-select" value={sttLang} onChange={handleSttLangChange} className="settings-select">
                                    <option value="en-US">English (US)</option>
                                    <option value="th-TH">ไทย (Thai)</option>
                                    <option value="es-ES">Español (Spain)</option>
                                    <option value="fr-FR">Français (France)</option>
                                </select>
                            </div>
                             <div className="settings-option">
                                <label htmlFor="theme-toggle">Appearance:</label>
                                <button onClick={toggleTheme} id="theme-toggle" className="settings-action-button theme-toggle-button">
                                    {currentTheme === 'light' ? '🌙 Switch to Dark Mode' : '☀️ Switch to Light Mode'}
                                </button>
                            </div>
                            <div className="settings-option">
                                <label>Chat Actions:</label>
                                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                                     <button onClick={handleExportChat} className="settings-action-button export-chat-settings-button">💾 Export Chat</button>
                                     <button onClick={handleClearChat} className="settings-action-button clear-chat-settings-button">🗑️ Clear Chat History</button>
                                </div>
                             </div>
                             <div className="settings-option">
                                <label>Admin Area:</label>
                                <button onClick={toggleStaffLoginModal} className="settings-action-button staff-area-button">🔑 Staff Login</button>
                             </div>
                        </div>
                    </div>
                    <hr className="settings-separator" />
                    <button onClick={toggleSettings} className="close-settings-button">Close Settings</button>
                </div>
            )}

            {/* Staff Login Modal */}
            {isStaffLoginModalVisible && (
                <div className="staff-panel-overlay">
                    <div className="staff-panel-modal" style={{ maxWidth: '400px' }}>
                        <h3 id="staff-login-title">Staff Login</h3>
                        <button onClick={toggleStaffLoginModal} className="close-staff-panel-button" title="Close Login">×</button>
                        <form onSubmit={(e) => { e.preventDefault(); handleStaffLogin(); }} className="staff-login-section">
                            <div className="settings-option">
                                <label htmlFor="staff-key-modal-input">Staff Key:</label>
                                <input
                                    type="password"
                                    id="staff-key-modal-input"
                                    className="settings-input"
                                    value={enteredStaffKey}
                                    onChange={handleStaffKeyChange}
                                    placeholder="Enter staff access key"
                                    disabled={isStaffLoginLoading}
                                    autoFocus
                                    required
                                />
                            </div>
                            <button type="submit" className="staff-login-button" disabled={isStaffLoginLoading || !enteredStaffKey.trim()}>
                                {isStaffLoginLoading ? 'Verifying...' : 'Login & Enter Admin'}
                            </button>
                            {staffLoginError && <p className="staff-error">{staffLoginError}</p>}
                            <p className="staff-security-warning">Enter key to access admin page.</p>
                        </form>
                    </div>
                </div>
            )}

             {/* Feedback Modal */}
             {isFeedbackModalVisible && (
                <div className="feedback-modal-overlay">
                    <div className="feedback-modal">
                        <h3 id="feedback-title">Submit Feedback</h3>
                        <button onClick={toggleFeedbackModal} className="close-feedback-button" title="Close Feedback">×</button>
                        {feedbackSuccess && <p className="feedback-message success">{feedbackSuccess}</p>}
                        {feedbackError && <p className="feedback-message error">{feedbackError}</p>}

                        {!feedbackSuccess && ( // Only show form if success message isn't displayed
                            <form onSubmit={handleFeedbackSubmit} className="feedback-form">
                                <div className="feedback-field">
                                    <label htmlFor="feedback-email">Email (Optional):</label>
                                    <input
                                        type="email" id="feedback-email" className="settings-input"
                                        value={feedbackEmail} onChange={(e) => setFeedbackEmail(e.target.value)}
                                        placeholder="your.email@example.com" maxLength={250} disabled={isSubmittingFeedback}
                                    />
                                </div>
                                <div className="feedback-field">
                                    <label>Rating:<span style={{ color: 'red' }}>*</span></label>
                                    <div className="star-rating">
                                        {[1, 2, 3, 4, 5].map(star => (
                                            <button
                                                key={star} type="button" aria-pressed={star === feedbackRating}
                                                className={`star-button ${star <= feedbackRating ? 'selected' : ''}`}
                                                onClick={() => setFeedbackRating(star)} disabled={isSubmittingFeedback}
                                                aria-label={`Rate ${star}/5`}
                                            >
                                                ★
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="feedback-field">
                                    <label htmlFor="feedback-comment">Comment:<span style={{ color: 'red' }}>*</span></label>
                                    <textarea
                                        id="feedback-comment" className="settings-input" rows={5}
                                        value={feedbackComment} onChange={(e) => setFeedbackComment(e.target.value)}
                                        placeholder="Tell us about your experience, suggestions, or any bugs..."
                                        maxLength={2000} required disabled={isSubmittingFeedback}
                                    />
                                </div>
                                <div className="feedback-actions">
                                    <button type="button" onClick={toggleFeedbackModal} className="cancel-feedback-button" disabled={isSubmittingFeedback}>Cancel</button>
                                    <button type="submit" className="submit-feedback-button" disabled={isSubmittingFeedback || feedbackRating === 0 || !feedbackComment.trim()}>
                                        {isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                                    </button>
                                </div>
                            </form>
                         )}
                    </div>
                </div>
            )}

            {/* Main Routing and Layout */}
            {/* This structure ensures Header and ChatbotPage are rendered for the main route */}
            <Routes>
                <Route path="/" element={
                    <>
                        <header className="App-header">
                             <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <button onClick={toggleSettings} className="settings-button" title="Settings">⚙️</button>
                                <button onClick={toggleFeedbackModal} className="settings-button" title="Submit Feedback">💬</button>
                             </div>
                             <h1>Project Theraphy</h1>
                             <div className="header-spacer-right"></div> {/* Keeps title centered */}
                        </header>
                         {/* ChatbotPage includes the message list AND the input area */}
                        <ChatbotPage
                            messages={messages}
                            setMessages={setMessages}
                            selectedModel={selectedModel}
                            sttLang={sttLang}
                            selectedPersona={selectedPersona}
                            accessKey={enteredKey}
                         />
                    </>
                } />
                <Route path="/admin" element={
                    <ProtectedRoute>
                        <AdminPage />
                    </ProtectedRoute>
                } />
                {/* Catch-all route to redirect unknown paths to home */}
                 <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>

        </div> // End div.App
    );
}

export default App;