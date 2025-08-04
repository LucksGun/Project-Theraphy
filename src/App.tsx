/* src/App.tsx - FINAL COMPLETE Version with Combined Welcome Page, Knowledge Check, and Tutorial */

import React, { useState, useEffect, ChangeEvent, useRef, useCallback } from 'react';
import ReactGA from 'react-ga4';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import './App.css';
import ChatbotPage from './ChatbotPage';
import AdminPage from './AdminPage';
import ConfirmClearCupGame from './ConfirmClearCupGame';
import PersonaPlinkoGame from './PersonaPlinkoGame';
import InterviewMode from './InterviewMode';
import PresentationPage from './PresentationPage';
import InvoiceManagerPage from './InvoiceManagerPage';

// --- GA Initialization ---
const GA_MEASUREMENT_ID = "G-JX58QMMKZY";
if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" && GA_MEASUREMENT_ID !== "YOUR_GA_ID_HERE") { try { ReactGA.initialize(GA_MEASUREMENT_ID); console.log("GA Init:", GA_MEASUREMENT_ID); ReactGA.send({ hitType: "pageview", page: window.location.pathname + window.location.search, title: "Initial Load" }); } catch (e) { console.error("GA Init Err:", e); } } else { console.warn("GA ID missing/invalid. GA not initialized."); }

// --- Types & Interfaces ---
export interface Message { id: number; text: string; sender: 'user' | 'bot' | 'loading'; timestamp: number; imageUrl?: string; modelUsed?: string; }
export type GeminiModel = 'gemini-2.5-flash-preview-04-17' | 'gemini-2.5-pro-preview-03-25';
export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR';
export type Persona = 'normal' | 'therapist' | 'university_master';
export interface KeyValidationStatus { isValid: boolean | null; username: string | null; loading: boolean; error?: string | null; }
export interface UserKeyInfo { key: string; username: string | null; status: 'active' | 'inactive'; created_at: string; }
export interface FeedbackItem { id: number; email: string | null; rating: number; comment: string; submitted_at: string; is_important: number; }
export type PersonaInstructionMap = { [key in Persona]?: string };
export type AppTheme = 'light' | 'dark';

// --- localStorage Keys ---
const CHAT_STORAGE_KEY = 'chatMessages'; const MODEL_STORAGE_KEY = 'selectedApiModel'; const STT_LANG_STORAGE_KEY = 'selectedSttLang'; const ACCESS_KEY_STORAGE_KEY = 'userAccessKey'; const PERSONA_STORAGE_KEY = 'selectedPersona'; const THEME_STORAGE_KEY = 'selectedAppTheme'; const WELCOME_SEEN_KEY = 'welcomePageSeenV1'; // New key for combined welcome page

// --- Configurations ---
export interface ModelInfo { value: GeminiModel; label: string; restricted: boolean; }
export const ALL_AVAILABLE_MODELS_FRONTEND: ModelInfo[] = [ 
    { value: 'gemini-2.5-flash-preview-04-17', label: 'Gemini 2.5 Flash Preview', restricted: false }, 
    { value: 'gemini-2.5-pro-preview-03-25', label: 'Gemini 2.5 Pro Preview', restricted: true } ];
export const ALL_MODEL_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS_FRONTEND.map(m => m.value);
export interface PersonaInfo { value: Persona; label: string; emoji: string; restricted: boolean; }
export const AVAILABLE_PERSONAS: PersonaInfo[] = [ { value: 'university_master', label: 'University Master', emoji: '🎓', restricted: false }, { value: 'normal', label: 'Normal Bot', emoji: '🤖', restricted: true }, { value: 'therapist', label: 'Therapist', emoji: '🧠', restricted: true } ];
export const ALL_PERSONAS: Persona[] = AVAILABLE_PERSONAS.map(p => p.value);
export const DEFAULT_UNRESTRICTED_PERSONA: Persona = 'university_master';
export const RESTRICTED_MODELS_VALUES: GeminiModel[] = ALL_AVAILABLE_MODELS_FRONTEND.filter(m => m.restricted).map(m => m.value);
export const RESTRICTED_PERSONAS_VALUES: Persona[] = AVAILABLE_PERSONAS.filter(p => p.restricted).map(p => p.value);
export const DEFAULT_BASE_SYSTEM_INSTRUCTION = `You are a helpful AI assistant. Format responses using Markdown. Provide suggestions for general topics like [Suggestion: Suggestion Text]. Avoid this format for sensitive personal advice. Respond in Thai if user uses Thai. Offer inspirational quotes if user feels down. If input starts with "Field 1:", analyze for university advice based only on fields 1-5. Adopt a friendly and conversational tone. Avoid overly formal language. Respond like a helpful human assistant.`;
export const DEFAULT_PERSONA_INSTRUCTIONS: PersonaInstructionMap = { normal: `Act as a general assistant. Use [Suggestion: ...] for follow-ups on general topics.`, therapist: `Roleplay as an empathetic therapist assistant. Use gentle, validating language. Do NOT give medical advice. Ask gentle questions or suggest coping mechanisms in PLAIN TEXT, not [Suggestion:...]. Prioritize inspirational quotes for distress.`, university_master: `Roleplay as an expert academic advisor. Focus on university/career topics. Use [Suggestion: ...] for general academic questions. Provide detailed recommendations for "Field 1-5" input.` };
export const ALL_PERSONA_KEYS = Object.keys(DEFAULT_PERSONA_INSTRUCTIONS);

// --- API ---
export const WORKER_URL = 'https://project-theraphy-ai-proxy.luckgun99.workers.dev/';
export interface ApiRequestBody { action: string; prompt?: string; model?: GeminiModel; persona?: Persona; imageMimeType?: string; imageDataUrl?: string; accessKey?: string; history?: any[]; staffKey?: string; key?: string; newStatus?: 'active' | 'inactive'; models?: GeminiModel[]; personas?: Persona[]; username?: string | null; newUsername?: string | null; email?: string | null; rating?: number; comment?: string; feedbackId?: number; isImportant?: boolean | number; baseInstruction?: string; personaInstructions?: PersonaInstructionMap; fileId?: string; }

// --- Constants ---
const VALIDATION_DEBOUNCE_MS = 600;

// --- Component for Protected Route ---
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => { const keyFromSession = sessionStorage.getItem('staffKey'); const location = useLocation(); if (!keyFromSession) { console.log("ProtectedRoute: No key, redirecting from", location.pathname); return <Navigate to="/" replace />; } return <>{children}</>; };

// --- Helper function to get initial theme ---
const getInitialTheme = (): AppTheme => { if (typeof window !== 'undefined') { const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) as AppTheme | null; if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) { return storedTheme; } if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) { return 'dark'; } } return 'light'; };

// --- App Component ---
function App() {
    // --- State ---
    const [messages, setMessages] = useState<Message[]>(() => { const stored = localStorage.getItem(CHAT_STORAGE_KEY); let initial: Message[] = []; try { initial = stored && stored !== '[]' ? JSON.parse(stored) : []; if (!Array.isArray(initial)) throw new Error("Bad format"); initial = initial.filter(m => m.sender !== 'loading'); } catch (e) { console.error("Bad stored msgs:", e); localStorage.removeItem(CHAT_STORAGE_KEY); initial = []; } if (initial.length === 0) { const ts = Date.now(); return [{ id: ts, text: "Welcome!", sender: 'bot', timestamp: ts }]; } else { return initial; } });
    const [showWelcomePage, setShowWelcomePage] = useState<boolean>(false); // New state for combined welcome page
    const [showKnowledgeCheck, setShowKnowledgeCheck] = useState<boolean>(false); // New: for "Do you know?" page
    const [showLieDetector, setShowLieDetector] = useState<boolean>(false); // New: for lie detector image/beep
    const [showTutorial, setShowTutorial] = useState<boolean>(false); // New: for tutorial page
    const [tutorialBaitButtonPosition, setTutorialBaitButtonPosition] = useState<{ top: string; left: string }>({ top: '50%', left: '50%' }); // New: for runaway button
    const [enteredKey, setEnteredKey] = useState<string>(() => localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '');
    const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.5-flash-preview-04-17'); // Default to unrestricted
    const [sttLang, setSttLang] = useState<SpeechLanguage>(() => { const stored = localStorage.getItem(STT_LANG_STORAGE_KEY) as SpeechLanguage | null; if (stored && ['en-US', 'th-TH', 'es-ES', 'fr-FR'].includes(stored)) { return stored; } return 'en-US'; });
    const [selectedPersona, setSelectedPersona] = useState<Persona>(DEFAULT_UNRESTRICTED_PERSONA); // Default to unrestricted
    const [isInterviewModeOpen, setIsInterviewModeOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
    const openAdvancedSettingsFromMain = () => {
        console.log("STEP 1: openAdvancedSettingsFromMain CALLED");
        setIsSettingsOpen(false);
        console.log("STEP 2: Setting isAdvancedSettingsOpen to TRUE");
        setIsAdvancedSettingsOpen(true);
    };
    const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = useState<boolean>(false);
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
    const [isPersonaPlinkoVisible, setIsPersonaPlinkoVisible] = useState<boolean>(false);
    const [isClearCupGameVisible, setIsClearCupGameVisible] = useState(false);

    const navigate = useNavigate();

    // --- Calculate derived state ---
    const availablePersonasForGame = AVAILABLE_PERSONAS.filter(p => !p.restricted || keyStatus.isValid === true);
    const canChangePersona = keyStatus.isValid === true && availablePersonasForGame.length >= 1;
    const canAccessAdvanced = keyStatus.isValid === true;

    // --- Effects ---
    // Key Validation Effect
    useEffect(() => {
        const keyTrimmed = enteredKey.trim();
        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

        const currentModelBeforeValidation = selectedModel;
        const currentPersonaBeforeValidation = selectedPersona;

        if (!keyTrimmed) {
            setKeyStatus({ isValid: null, username: null, loading: false, error: null });
            if (RESTRICTED_MODELS_VALUES.includes(currentModelBeforeValidation)) setSelectedModel('gemini-2.5-flash-preview-04-17');
            if (RESTRICTED_PERSONAS_VALUES.includes(currentPersonaBeforeValidation)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
            return;
        }

        setKeyStatus(p => ({ ...p, loading: true, isValid: null, error: null, username: null }));
        debounceTimeoutRef.current = setTimeout(async () => {
            try {
                const r = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'validateKey', accessKey: keyTrimmed }) });
                const d = await r.json().catch(() => ({ error: `Invalid JSON` }));
                if (!r.ok) throw new Error(d?.error || `Validation failed: ${r.status}`);

                if (d.isValid) {
                    setKeyStatus({ isValid: true, username: d.username || 'User', loading: false, error: null });
                    setSelectedModel(currentModelBeforeValidation);
                    setSelectedPersona(currentPersonaBeforeValidation);
                } else {
                    setKeyStatus({ isValid: false, username: null, loading: false, error: d?.error || 'Invalid key.' });
                    if (RESTRICTED_MODELS_VALUES.includes(currentModelBeforeValidation)) setSelectedModel('gemini-2.5-flash-preview-04-17');
                    if (RESTRICTED_PERSONAS_VALUES.includes(currentPersonaBeforeValidation)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Validation network error.";
                setKeyStatus({ isValid: false, username: null, loading: false, error: msg });
                if (RESTRICTED_MODELS_VALUES.includes(currentModelBeforeValidation)) setSelectedModel('gemini-2.5-flash-preview-04-17');
                if (RESTRICTED_PERSONAS_VALUES.includes(currentPersonaBeforeValidation)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
            }
        }, VALIDATION_DEBOUNCE_MS);

        return () => { if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current); };
    }, [enteredKey]);

    // Initial Load Effect
    useEffect(() => {
        const welcomeSeen = localStorage.getItem(WELCOME_SEEN_KEY);
        if (welcomeSeen !== 'true') {
            setShowWelcomePage(true);
        }

        const initialKey = localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '';
        const storedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null;
        const storedPersona = localStorage.getItem(PERSONA_STORAGE_KEY) as Persona | null;
        let initialModel: GeminiModel = 'gemini-2.5-flash-preview-04-17';
        if (storedModel && ALL_MODEL_VALUES.includes(storedModel)) initialModel = storedModel;
        let initialPersona: Persona = DEFAULT_UNRESTRICTED_PERSONA;
        if (storedPersona && ALL_PERSONAS.includes(storedPersona)) initialPersona = storedPersona;

        setSelectedModel(initialModel);
        setSelectedPersona(initialPersona);

        if (initialKey.trim()) {
            const validateInitialKey = async (k: string, m: GeminiModel, p: Persona) => {
                setKeyStatus(pr => ({ ...pr, loading: true }));
                try {
                    const r = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'validateKey', accessKey: k }) });
                    const d = await r.json().catch(() => ({ error: 'Invalid JSON' }));
                    if (r.ok && d.isValid) {
                        setKeyStatus({ isValid: true, username: d.username || 'User', loading: false, error: null });
                        setSelectedModel(m);
                        setSelectedPersona(p);
                    } else {
                        setKeyStatus({ isValid: false, username: null, loading: false, error: d?.error || 'Invalid key' });
                        if (RESTRICTED_MODELS_VALUES.includes(m)) setSelectedModel('gemini-2.5-flash-preview-04-17');
                        if (RESTRICTED_PERSONAS_VALUES.includes(p)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
                    }
                } catch (e) {
                    setKeyStatus({ isValid: false, username: null, loading: false, error: 'Validation failed' });
                       if (RESTRICTED_MODELS_VALUES.includes(m)) setSelectedModel('gemini-2.5-flash-preview-04-17');
                       if (RESTRICTED_PERSONAS_VALUES.includes(p)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
                }
            };
            validateInitialKey(initialKey, initialModel, initialPersona);
        } else {
             if (RESTRICTED_MODELS_VALUES.includes(initialModel)) setSelectedModel('gemini-2.5-flash-preview-04-17');
             if (RESTRICTED_PERSONAS_VALUES.includes(initialPersona)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
        }
    }, []);

    // Message Saving Effect
    useEffect(() => { const messagesToSave = messages.filter(m => m.sender !== 'loading'); if (messagesToSave.length > 1 || (messagesToSave.length === 1 && messagesToSave[0].sender !== 'bot')) { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messagesToSave)); } else if (messagesToSave.length === 0 || (messagesToSave.length === 1 && messagesToSave[0].sender === 'bot' && messagesToSave[0].text === "Chat cleared.")) { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify([])); } }, [messages]);
    // Other LocalStorage Effects
    useEffect(() => { localStorage.setItem(MODEL_STORAGE_KEY, selectedModel); }, [selectedModel]);
    useEffect(() => { localStorage.setItem(STT_LANG_STORAGE_KEY, sttLang); }, [sttLang]);
    useEffect(() => { localStorage.setItem(ACCESS_KEY_STORAGE_KEY, enteredKey); }, [enteredKey]);
    useEffect(() => { localStorage.setItem(PERSONA_STORAGE_KEY, selectedPersona); }, [selectedPersona]);
    useEffect(() => { localStorage.setItem(THEME_STORAGE_KEY, currentTheme); document.documentElement.setAttribute('data-theme', currentTheme); }, [currentTheme]);
    // Feedback Success Timeout
    useEffect(() => { let timer: NodeJS.Timeout | null = null; if (feedbackSuccess) { timer = setTimeout(() => setFeedbackSuccess(null), 3000); } return () => { if (timer) clearTimeout(timer); }; }, [feedbackSuccess]);

    // --- Event Handlers ---

    // Close ALL modals helper
    const closeAllModals = () => {
        setIsSettingsOpen(false);
        setIsAdvancedSettingsOpen(false);
        setIsStaffLoginModalVisible(false);
        setIsFeedbackModalVisible(false);
        setIsClearCupGameVisible(false);
        setIsPersonaPlinkoVisible(false);
        setIsInterviewModeOpen(false);
        // Also close knowledge check and tutorial related modals
        setShowKnowledgeCheck(false);
        setShowLieDetector(false);
        setShowTutorial(false);
    };

    // Handle acceptance of the new combined welcome page
    const handleAcceptWelcome = () => {
        localStorage.setItem(WELCOME_SEEN_KEY, 'true');
        setShowWelcomePage(false);
        setShowKnowledgeCheck(true); // Navigate to knowledge check page
    };

    // Simple beep sound generator
    const playBeep = () => {
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            if (!audioContext) {
                console.warn("AudioContext not supported in this browser.");
                return;
            }
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.type = 'sine'; // Sine wave for a clean beep
            oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
            gainNode.gain.setValueAtTime(0.5, audioContext.currentTime); // Volume

            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.2); // Fade out quickly
            oscillator.stop(audioContext.currentTime + 0.2); // Stop after 0.2 seconds
        } catch (e) {
            console.error("Error playing beep:", e);
        }
    };

    const handleYesClick = () => {
        setShowLieDetector(true);
        playBeep();
        setTimeout(() => {
            setShowLieDetector(false);
            setShowKnowledgeCheck(false); // Hide knowledge check
            navigate('/'); // Redirect to chatbot page
        }, 2000); // Disappear after 2 seconds
    };

    const handleNoClick = () => {
        setShowKnowledgeCheck(false); // Hide knowledge check
        setShowTutorial(true); // Show tutorial
    };

    const handleTutorialBaitClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        const button = e.currentTarget;
        const parent = button.offsetParent as HTMLElement; // Get the parent container for positioning
        if (!parent) return;

        const parentRect = parent.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();

        // Calculate max possible top/left to keep button fully within parent
        const maxLeft = parentRect.width - buttonRect.width;
        const maxTop = parentRect.height - buttonRect.height;

        // Generate random positions
        const randomLeft = Math.random() * maxLeft;
        const randomTop = Math.random() * maxTop;

        setTutorialBaitButtonPosition({
            left: `${randomLeft}px`,
            top: `${randomTop}px`
        });
    };

    const handleHiddenRedirectClick = () => {
        setShowTutorial(false); // Hide tutorial
        navigate('/'); // Redirect to chatbot page
    };


    const handleSttLangChange=(e:ChangeEvent<HTMLSelectElement>)=>{setSttLang(e.target.value as SpeechLanguage);};

    // Settings Toggle
    const toggleSettings=()=>{
        const currentlyVisible = isSettingsOpen;
        closeAllModals();
        if (!currentlyVisible) {
            setIsSettingsOpen(true);
        }
    };

    // Advanced Settings Toggle
    const toggleAdvancedSettings = () => {
        const currentlyVisible = isAdvancedSettingsOpen;
        closeAllModals();
        // Only open if it was previously closed (no key check needed here, options inside will be disabled)
        if (!currentlyVisible) {
             setIsAdvancedSettingsOpen(true);
        }
    }

    // Direct handler for model selection change
    const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const newModel = event.target.value as GeminiModel;
        // No need to check restriction here because the effect that saves
        // the model to localStorage runs, and the key validation effect
        // will reset it later if the key becomes invalid.
        setSelectedModel(newModel);
    };


    const openInterviewMode = () => {
        closeAllModals();
        setIsInterviewModeOpen(true);
    };

    const closeInterviewMode = () => {
        setIsInterviewModeOpen(false);
    };
    const executeClearChat = () => { console.log("Executing clear chat logic after confirmation."); const timestamp = Date.now(); const clearMessage: Message = { id: timestamp, text: "Chat cleared.", sender: 'bot', timestamp: timestamp }; setMessages([clearMessage]); localStorage.removeItem(CHAT_STORAGE_KEY); closeAllModals(); };
    const handleAccessKeyChange=(e:ChangeEvent<HTMLInputElement>)=>{setEnteredKey(e.target.value);};
    const handleExportChat=()=>{ const msgs = messages.filter(m => m.sender !== 'loading'); if (msgs.length === 0 || (msgs.length === 1 && msgs[0].sender === 'bot' && msgs[0].text === "Welcome!")) { alert("Chat is empty or only contains the welcome message."); return; } let c = `Chat Export\nTimestamp: ${new Date().toLocaleString()}\nModel: ${selectedModel}\nPersona: ${selectedPersona}\nUser: ${keyStatus.isValid ? keyStatus.username : 'N/A (No valid key)'}\nTheme: ${currentTheme}\n----\n\n`; msgs.forEach(m => { const t = new Date(m.timestamp).toLocaleString(); c += `[${t}] ${m.sender === 'user' ? 'User' : 'Bot'}:\n${m.text}\n${m.imageUrl ? `(Image Attachment: ${m.imageUrl.substring(0,50)}...)\n` : ''}\n`; }); try { const b = new Blob([c], { type: 'text/plain;charset=utf-8' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); const f = `theraphy-chat-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`; a.href = u; a.download = f; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u); if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY") ReactGA.event({ category: "Chat", action: "Export", label: `Msg Count: ${msgs.length}` }); closeAllModals(); } catch (e) { console.error("Export failed:", e); alert("Failed to export chat."); } };

    // Staff Login Toggle
    const toggleStaffLoginModal = () => {
        const currentlyVisible = isStaffLoginModalVisible;
        closeAllModals();
        if (!currentlyVisible) { setIsStaffLoginModalVisible(true); }
        else { setEnteredStaffKey(''); setStaffLoginError(null); }
    };

    const handleStaffKeyChange = (e: ChangeEvent<HTMLInputElement>) => { setEnteredStaffKey(e.target.value); setStaffLoginError(null);};
    const handleStaffLogin = async () => { if (!enteredStaffKey.trim()) { setStaffLoginError("Staff key is required."); return; } setIsStaffLoginLoading(true); setStaffLoginError(null); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'staffLogin', staffKey: enteredStaffKey }) }); const data = await res.json().catch(() => ({ error: 'Invalid JSON response from server.' })); if (!res.ok || !data.isValid) { throw new Error(data?.error || `Login Failed (Status: ${res.status})`); } sessionStorage.setItem('staffKey', enteredStaffKey); closeAllModals(); setEnteredStaffKey(''); navigate('/admin'); } catch (e) { setStaffLoginError(e instanceof Error ? e.message : "Login failed due to an unknown error."); sessionStorage.removeItem('staffKey'); } finally { setIsStaffLoginLoading(false); } };

    // Feedback Modal Toggle
    const toggleFeedbackModal = () => {
        const currentlyVisible = isFeedbackModalVisible;
        closeAllModals();
        if (!currentlyVisible) { setIsFeedbackModalVisible(true); }
        else { setFeedbackEmail(''); setFeedbackRating(0); setFeedbackComment(''); setFeedbackError(null); setFeedbackSuccess(null); setIsSubmittingFeedback(false); }
    };

    const handleFeedbackSubmit = async (e: React.FormEvent) => { e.preventDefault(); if (feedbackRating === 0) { setFeedbackError("Please select a star rating."); return; } if (!feedbackComment.trim()) { setFeedbackError("Please provide a comment."); return; } if (feedbackComment.length > 2000) { setFeedbackError("Comment is too long (max 2000 characters)."); return; } setIsSubmittingFeedback(true); setFeedbackError(null); setFeedbackSuccess(null); const payload: ApiRequestBody = { action: 'submitFeedback', email: feedbackEmail.trim() || null, rating: feedbackRating, comment: feedbackComment.trim() }; try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await res.json().catch(() => ({ error: 'Invalid JSON response' })); if (!res.ok || !data.success) { throw new Error(data?.error || `Submit failed: ${res.statusText}`); } setFeedbackSuccess("Thank you! Your feedback has been submitted."); setFeedbackEmail(''); setFeedbackRating(0); setFeedbackComment(''); if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY") { ReactGA.event({ category: "Feedback", action: "Submit", label: `Rating: ${feedbackRating}` }); } } catch (err) { setFeedbackError(err instanceof Error ? err.message : "Failed to submit feedback."); } finally { setIsSubmittingFeedback(false); } };
    const toggleTheme = useCallback(() => { setCurrentTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light')); }, []);

    // Modified Game Modal Triggers
    const openPersonaPlinko = () => {
        if (!canAccessAdvanced) return;
        setIsAdvancedSettingsOpen(false);
        setIsPersonaPlinkoVisible(true);
    }
    const openClearCupGame = () => {
        setIsSettingsOpen(false);
        setIsClearCupGameVisible(true);
    }

    // Handler for Persona selected from Plinko game
    const handlePersonaSelectedFromPlinko = (persona: Persona) => { setSelectedPersona(persona); setIsPersonaPlinkoVisible(false); };


    // --- JSX ---
    return (
        <div className="App">
            {/* New Combined Welcome Page */}
            {showWelcomePage && (
                <div className="welcome-overlay">
                    <div className="welcome-modal">
                        <h1 className="welcome-title">Project Theraphy</h1>
                        <p className="welcome-subtitle">
                            Hi and welcome to Project Theraphy, <br />
                            a chatbot which guide you thru entrace and admission steps of your desired collage
                        </p>
                        <p className="welcome-instructions">
                            To get started, you accept our term of use/services by clicking button below.
                        </p>
                        <div className="welcome-button-container">
                            <button onClick={() => { /* Do nothing */ }} className="welcome-main-button">
                                NO
                            </button>
                        </div>
                        <p className="welcome-bottom-text">
                            Please click <span className="welcome-bottom-link" onClick={handleAcceptWelcome}>HERE</span> to Go to the next page
                        </p>
                    </div>
                </div>
            )}

            {/* Knowledge Check Page */}
            {!showWelcomePage && showKnowledgeCheck && (
                <div className="knowledge-check-overlay">
                    {!showLieDetector && !showTutorial && ( // Only show question if not showing lie detector or tutorial
                        <div className="knowledge-check-modal">
                            <h2>Do you know how to use this chatbot?</h2>
                            <div className="knowledge-check-buttons">
                                <button onClick={handleYesClick} className="knowledge-button yes">Yes</button>
                                <button onClick={handleNoClick} className="knowledge-button no">No</button>
                            </div>
                        </div>
                    )}

                    {showLieDetector && (
                        <div className="lie-detector-overlay">
                            <img src="https://storage.googleapis.com/gemini-generated-images/lie-detector-indicator-gauge-with-dial-showing-true-green-deceit-red_79145-1532.jpg" alt="Lie Detector" className="lie-detector-image" />
                        </div>
                    )}

                    {showTutorial && (
                        <div className="tutorial-modal-overlay">
                            <div className="tutorial-modal">
                                <h3>Chatbot Tutorial</h3>
                                <p>Welcome to the chatbot tutorial! This guide will help you understand how to interact with our AI assistant. We aim to make your experience as smooth and intuitive as possible.</p>

                                <h4>1. Sending Messages:</h4>
                                <p>To initiate a conversation or respond to the chatbot, simply type your question or statement into the text input field located at the very bottom of the screen. This is your primary way to communicate with the AI. Once you've finished typing, you can press the "Send" button (typically represented by a paper airplane or an arrow icon pointing right) or simply hit the Enter key on your keyboard. Your message will then appear in the chat history.</p>

                                <h4>2. Using Voice Input:</h4>
                                <p>For hands-free interaction, our chatbot supports voice input. Click the microphone icon (🎤) usually found near the text input field. If it's your first time, your browser might ask for permission to access your microphone; please grant it. Once activated, begin speaking clearly. The system is designed to detect when you've finished your thought, but you can also click the microphone icon again to manually stop recording. Always review the transcribed text before sending to ensure accuracy.</p>

                                <h4>3. Image Input:</h4>
                                <p>Our advanced chatbot can process and understand images, making your interactions richer! To send an image, click the paperclip icon (📎) or a similar attachment button. You'll typically have options to:
                                    <ul>
                                        <li>**Upload from Device:** Select an image file directly from your computer or phone.</li>
                                        <li>**Use Camera:** Capture a live photo using your device's camera.</li>
                                        <li>**Capture Screen:** Take a screenshot of your current screen (availability depends on browser and operating system).</li>
                                    </ul>
                                After selecting your image, you have the option to add a descriptive text message to provide context before sending it to the chatbot.</p>

                                <h4>4. Understanding Bot Responses:</h4>
                                <p>The chatbot will provide its responses in text format. These responses are designed to be informative and helpful. Sometimes, the chatbot might offer "suggestions" for follow-up questions or related topics, which will appear as clickable buttons below its message. This helps guide your conversation. Additionally, if you prefer to listen to the bot's responses, look for a speaker icon (🔊) next to its message. Clicking it will play an audio version of the response; clicking again will stop it.</p>

                                <h4>5. Advanced Features and Customization:</h4>
                                <p>To personalize your chatbot experience, explore the settings menu (⚙️ icon) usually located in the header. Here, you can find options such as:
                                    <ul>
                                        <li>Changing the chatbot's display language.</li>
                                        <li>Exporting your chat history for your records.</li>
                                        <li>Accessing advanced configurations, including selecting different AI models or personas. Please note that some advanced features may require a special access key for full functionality.</li>
                                    </ul>
                                </p>
                                <p>We encourage you to experiment with different types of queries and features to discover the full potential of Project Theraphy. Our goal is to provide a seamless and intelligent conversational experience tailored to your needs. If you're ready to dive in and <span className="hidden-redirect-link" onClick={handleHiddenRedirectClick}>start chatting now</span>, click the highlighted text!</p>

                                <button
                                    style={{ position: 'absolute', top: tutorialBaitButtonPosition.top, left: tutorialBaitButtonPosition.left, transition: 'all 0.3s ease-out' }}
                                    onClick={handleTutorialBaitClick}
                                    className="tutorial-bait-button"
                                >
                                    NO
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {!showWelcomePage && !showKnowledgeCheck && !showTutorial && ( /* Main App Routes JSX */
                <Routes>
                    <Route path="/" element={
                        <>
                            <header className="App-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <button onClick={toggleSettings} className="settings-button" title="Settings">⚙️</button>
                                    <button onClick={toggleFeedbackModal} className="settings-button" title="Submit Feedback">💬</button>
                                </div>
                                <h1>Project Theraphy</h1>
                                <div className="header-spacer-right"></div>
                            </header>
                            <ChatbotPage
                                messages={messages}
                                setMessages={setMessages}
                                selectedModel={selectedModel}
                                sttLang={sttLang}
                                selectedPersona={selectedPersona}
                                accessKey={enteredKey}
                                onTriggerInterview={openInterviewMode}
                            />
                        </>
                    } />
                    <Route path="/admin" element={
                        <ProtectedRoute>
                            <AdminPage />
                        </ProtectedRoute>
                    } />
                    <Route path="/present" element={<PresentationPage />} />
                    <Route path="/pay" element={<InvoiceManagerPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                    
                </Routes>
               )}

        </div>
    );
}

export default App;
