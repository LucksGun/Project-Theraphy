// src/App.tsx - FINAL Version with Advanced Settings Modal

import React, { useState, useEffect, ChangeEvent, useRef, useCallback } from 'react';
import ReactGA from 'react-ga4';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import './App.css';
import ChatbotPage from './ChatbotPage';
import AdminPage from './AdminPage';
import ConfirmClearCupGame from './ConfirmClearCupGame';
import PersonaPlinkoGame from './PersonaPlinkoGame';
import ModelBuilderGame from './ModelBuilderGame';
import InterviewMode from './InterviewMode'; // <<< IMPORT the new component

// --- GA Initialization ---
const GA_MEASUREMENT_ID = "G-JX58QMMKZY";
if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY" && GA_MEASUREMENT_ID !== "YOUR_GA_ID_HERE") { try { ReactGA.initialize(GA_MEASUREMENT_ID); console.log("GA Init:", GA_MEASUREMENT_ID); ReactGA.send({ hitType: "pageview", page: window.location.pathname + window.location.search, title: "Initial Load" }); } catch (e) { console.error("GA Init Err:", e); } } else { console.warn("GA ID missing/invalid. GA not initialized."); }

// --- Types & Interfaces ---
export interface Message { id: number; text: string; sender: 'user' | 'bot' | 'loading'; timestamp: number; imageUrl?: string; modelUsed?: string; }
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-pro-exp-03-25' | 'gemini-2.0-flash-thinking-exp-01-21' | 'gemini-2.0-flash-exp-image-generation';
export type SpeechLanguage = 'en-US' | 'th-TH' | 'es-ES' | 'fr-FR';
export type Persona = 'normal' | 'therapist' | 'university_master';
export interface KeyValidationStatus { isValid: boolean | null; username: string | null; loading: boolean; error?: string | null; }
export interface UserKeyInfo { key: string; username: string | null; status: 'active' | 'inactive'; created_at: string; }
export interface FeedbackItem { id: number; email: string | null; rating: number; comment: string; submitted_at: string; is_important: number; }
export type PersonaInstructionMap = { [key in Persona]?: string };
export type AppTheme = 'light' | 'dark';

// --- localStorage Keys ---
const CHAT_STORAGE_KEY = 'chatMessages'; const BETA_ACCEPTED_KEY = 'betaAccepted'; const MODEL_STORAGE_KEY = 'selectedApiModel'; const STT_LANG_STORAGE_KEY = 'selectedSttLang'; const ACCESS_KEY_STORAGE_KEY = 'userAccessKey'; const PERSONA_STORAGE_KEY = 'selectedPersona'; const THEME_STORAGE_KEY = 'selectedAppTheme'; const INTRODUCTION_SEEN_KEY = 'introductionSeenV1';

// --- Configurations ---
export interface ModelInfo { value: GeminiModel; label: string; restricted: boolean; }
export const ALL_AVAILABLE_MODELS_FRONTEND: ModelInfo[] = [ { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', restricted: false }, { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', restricted: false }, { value: 'gemini-2.0-flash-thinking-exp-01-21', label: 'Gemini 2.0 Flash Thinking Exp', restricted: true }, { value: 'gemini-2.0-flash-exp-image-generation', label: 'Gemini 2.0 Flash Image Gen Exp', restricted: true }, { value: 'gemini-2.5-pro-exp-03-25', label: 'Gemini 2.5 Pro Exp', restricted: true } ];
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

// --- Define Introduction Sections ---
const introductionSections = [
 { key: 'textInput', title: 'การส่งข้อความ', text: 'พิมพ์คำถามหรือสิ่งที่คุณต้องการบอก ในช่องด้านล่างที่เขียนว่า "Type your message..."\nกดส่ง: กดปุ่มลูกศรชี้ขวา (➤) เพื่อส่งข้อความของคุณ' },
 { key: 'imageInput', title: 'การส่งรูปภาพ', text: 'คุณสามารถส่งรูปภาพได้ 3 วิธี:\n\n•\u00A0\u00A0\u00A0\u00A0**อัปโหลดรูป (📎):** กดปุ่มเครื่องหมายบวก (+) > เลือก "Upload Image" > เลือกรูป > พิมพ์ข้อความ (ไม่บังคับ) > กดส่ง (➤)\n•\u00A0\u00A0\u00A0\u00A0**ถ่ายรูปจากกล้อง (📷):** กดปุ่ม (+) > เลือก "Use Camera" > (อาจต้องอนุญาต) > กด "Capture Photo" (📸) > กดส่ง (➤)\n•\u00A0\u00A0\u00A0\u00A0**จับภาพหน้าจอ (🖥️):** กดปุ่ม (+) > เลือก "Capture Screen" > เลือกจอ > กด "Share" > กด "Capture Frame" (🖼️) > กดส่ง (➤)' }, // Updated instructions for plus menu
 { key: 'voiceInput', title: 'การใช้เสียงพูดแทนการพิมพ์', text: 'กดปุ่มไมค์ (🎤) > เริ่มพูด (อาจต้องอนุญาต) > ระบบอาจหยุดเองเมื่อพูดจบ หรือกดหยุด (🛑) > ตรวจสอบข้อความ > กดส่ง (➤)' },
 { key: 'ttsOutput', title: 'การฟังคำตอบของบอท', text: 'หากต้องการฟังเสียงอ่าน ให้มองหาปุ่มรูปลำโพง (🔊) ข้างข้อความบอทแล้วกด หากต้องการหยุด ให้กดปุ่มเดิมอีกครั้ง (อาจเปลี่ยนเป็น ⏹️)' },
 { key: 'uniForm', title: 'ฟอร์มแนะนำมหาวิทยาลัย', text: 'หากต้องการคำแนะนำเรื่องเรียนต่อ ให้กดปุ่มบวก (+) > เลือก "University Form" (📝) > กรอกข้อมูลในฟอร์ม > กด "Submit for Advice" เพื่อให้ AI วิเคราะห์' }, // Updated instructions for plus menu
 { key: 'suggestions', title: 'การใช้ข้อเสนอแนะ (Suggestions)', text: 'บางครั้ง บอทอาจแสดงปุ่มข้อแนะนำต่อท้ายคำตอบ คุณสามารถกดปุ่มนั้นเพื่อถามต่อได้ทันที' }
];
const initialAcknowledgementState = introductionSections.reduce((acc, section) => { acc[section.key] = false; return acc; }, {} as { [key: string]: boolean });


// --- App Component ---
function App() {
    // --- State ---
    const [messages, setMessages] = useState<Message[]>(() => { const stored = localStorage.getItem(CHAT_STORAGE_KEY); let initial: Message[] = []; try { initial = stored && stored !== '[]' ? JSON.parse(stored) : []; if (!Array.isArray(initial)) throw new Error("Bad format"); initial = initial.filter(m => m.sender !== 'loading'); } catch (e) { console.error("Bad stored msgs:", e); localStorage.removeItem(CHAT_STORAGE_KEY); initial = []; } if (initial.length === 0) { const ts = Date.now(); return [{ id: ts, text: "Welcome!", sender: 'bot', timestamp: ts }]; } else { return initial; } });
    const [showBetaNotice, setShowBetaNotice] = useState<boolean>(false);
    const [showIntroduction, setShowIntroduction] = useState<boolean>(false);
    const [introSectionsAcknowledged, setIntroSectionsAcknowledged] = useState<{ [key: string]: boolean }>(initialAcknowledgementState);
    const [continueButtonStyle, setContinueButtonStyle] = useState<React.CSSProperties>({});
    const [enteredKey, setEnteredKey] = useState<string>(() => localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '');
    const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.0-flash'); // Default to unrestricted
    const [sttLang, setSttLang] = useState<SpeechLanguage>(() => { const stored = localStorage.getItem(STT_LANG_STORAGE_KEY) as SpeechLanguage | null; if (stored && ['en-US', 'th-TH', 'es-ES', 'fr-FR'].includes(stored)) { return stored; } return 'en-US'; });
    const [selectedPersona, setSelectedPersona] = useState<Persona>(DEFAULT_UNRESTRICTED_PERSONA); // Default to unrestricted
    const [isInterviewModeOpen, setIsInterviewModeOpen] = useState(false); // <<< ADD State for Interview Mode
    const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
    const openAdvancedSettingsFromMain = () => {
        console.log("STEP 1: openAdvancedSettingsFromMain CALLED"); // <<< ADD THIS
        setIsSettingsOpen(false);
        console.log("STEP 2: Setting isAdvancedSettingsOpen to TRUE"); // <<< ADD THIS
        setIsAdvancedSettingsOpen(true);
    };
    // *** NEW STATE for Advanced Settings Modal ***
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
    const [isModelBuilderVisible, setIsModelBuilderVisible] = useState(false);

    const navigate = useNavigate();

    // --- Calculate derived state ---
    const allIntroSectionsAcknowledged = Object.values(introSectionsAcknowledged).every(status => status === true);
    const availablePersonasForGame = AVAILABLE_PERSONAS.filter(p => !p.restricted || keyStatus.isValid === true);
    const canChangePersona = keyStatus.isValid === true && availablePersonasForGame.length >= 1;
    const canAccessAdvanced = keyStatus.isValid === true; // Condition for advanced access

    // --- Effects ---
    // Key Validation Effect
    useEffect(() => {
        const keyTrimmed = enteredKey.trim();
        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

        // Store current restricted selections before validation potentially resets them
        const currentModelBeforeValidation = selectedModel;
        const currentPersonaBeforeValidation = selectedPersona;

        if (!keyTrimmed) {
            setKeyStatus({ isValid: null, username: null, loading: false, error: null });
            // Reset to defaults ONLY if current selection IS restricted
            if (RESTRICTED_MODELS_VALUES.includes(currentModelBeforeValidation)) setSelectedModel('gemini-2.0-flash');
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
                    // Keep previously selected model/persona if valid, otherwise restore from before validation
                    setSelectedModel(currentModelBeforeValidation);
                    setSelectedPersona(currentPersonaBeforeValidation);
                } else {
                    setKeyStatus({ isValid: false, username: null, loading: false, error: d?.error || 'Invalid key.' });
                    // Reset to defaults ONLY if current selection IS restricted
                    if (RESTRICTED_MODELS_VALUES.includes(currentModelBeforeValidation)) setSelectedModel('gemini-2.0-flash');
                    if (RESTRICTED_PERSONAS_VALUES.includes(currentPersonaBeforeValidation)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Validation network error.";
                setKeyStatus({ isValid: false, username: null, loading: false, error: msg });
                // Reset to defaults ONLY if current selection IS restricted
                if (RESTRICTED_MODELS_VALUES.includes(currentModelBeforeValidation)) setSelectedModel('gemini-2.0-flash');
                if (RESTRICTED_PERSONAS_VALUES.includes(currentPersonaBeforeValidation)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
            }
        }, VALIDATION_DEBOUNCE_MS);

        return () => { if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current); };
    }, [enteredKey]); // Removed selectedModel, selectedPersona dependency to avoid loops

    // Initial Load Effect
    useEffect(() => {
        const accepted = localStorage.getItem(BETA_ACCEPTED_KEY);
        if (accepted !== 'true') { setShowBetaNotice(true); }
        else { const introSeen = localStorage.getItem(INTRODUCTION_SEEN_KEY); if (introSeen !== 'true') { setShowIntroduction(true); setIntroSectionsAcknowledged(initialAcknowledgementState); } }

        const initialKey = localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '';
        const storedModel = localStorage.getItem(MODEL_STORAGE_KEY) as GeminiModel | null;
        const storedPersona = localStorage.getItem(PERSONA_STORAGE_KEY) as Persona | null;
        let initialModel: GeminiModel = 'gemini-2.0-flash';
        if (storedModel && ALL_MODEL_VALUES.includes(storedModel)) initialModel = storedModel;
        let initialPersona: Persona = DEFAULT_UNRESTRICTED_PERSONA;
        if (storedPersona && ALL_PERSONAS.includes(storedPersona)) initialPersona = storedPersona;

        // Apply initial model/persona state first
        setSelectedModel(initialModel);
        setSelectedPersona(initialPersona);

        // Then validate the key and potentially adjust model/persona if key invalid AND initial choice was restricted
        if (initialKey.trim()) {
            const validateInitialKey = async (k: string, m: GeminiModel, p: Persona) => {
                setKeyStatus(pr => ({ ...pr, loading: true }));
                try {
                    const r = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'validateKey', accessKey: k }) });
                    const d = await r.json().catch(() => ({ error: 'Invalid JSON' }));
                    if (r.ok && d.isValid) {
                        setKeyStatus({ isValid: true, username: d.username || 'User', loading: false, error: null });
                        // Key is valid, keep initial/stored model and persona
                        setSelectedModel(m);
                        setSelectedPersona(p);
                    } else {
                        setKeyStatus({ isValid: false, username: null, loading: false, error: d?.error || 'Invalid key' });
                        // Key is invalid, reset only if stored model/persona was restricted
                        if (RESTRICTED_MODELS_VALUES.includes(m)) setSelectedModel('gemini-2.0-flash');
                        if (RESTRICTED_PERSONAS_VALUES.includes(p)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
                    }
                } catch (e) {
                    setKeyStatus({ isValid: false, username: null, loading: false, error: 'Validation failed' });
                    // Network error, reset only if stored model/persona was restricted
                     if (RESTRICTED_MODELS_VALUES.includes(m)) setSelectedModel('gemini-2.0-flash');
                     if (RESTRICTED_PERSONAS_VALUES.includes(p)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
                }
            };
            validateInitialKey(initialKey, initialModel, initialPersona);
        } else {
             // No key stored, reset only if stored model/persona was restricted
             if (RESTRICTED_MODELS_VALUES.includes(initialModel)) setSelectedModel('gemini-2.0-flash');
             if (RESTRICTED_PERSONAS_VALUES.includes(initialPersona)) setSelectedPersona(DEFAULT_UNRESTRICTED_PERSONA);
        }
    }, []); // Run only on mount

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
    // Intro Button Style Effect
    useEffect(() => { if (showIntroduction && allIntroSectionsAcknowledged) { setContinueButtonStyle({}); } }, [allIntroSectionsAcknowledged, showIntroduction]);

    // --- Event Handlers ---

    // Close ALL modals helper
    const closeAllModals = () => {
        setIsSettingsOpen(false);
        setIsAdvancedSettingsOpen(false);
        setIsStaffLoginModalVisible(false);
        setIsFeedbackModalVisible(false);
        setIsClearCupGameVisible(false);
        setIsModelBuilderVisible(false);
        setIsPersonaPlinkoVisible(false);
        setIsInterviewModeOpen(false); // <<< ADD Interview Mode
    };

    const handleAcceptBeta = () => { localStorage.setItem(BETA_ACCEPTED_KEY, 'true'); setShowBetaNotice(false); const introSeen = localStorage.getItem(INTRODUCTION_SEEN_KEY); if (introSeen !== 'true') { setShowIntroduction(true); setIntroSectionsAcknowledged(initialAcknowledgementState); } };
    const handleSectionToggle = (sectionKey: string) => { setIntroSectionsAcknowledged(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] })); };
    const handleAcceptIntroduction = () => { if (!allIntroSectionsAcknowledged) return; localStorage.setItem(INTRODUCTION_SEEN_KEY, 'true'); setShowIntroduction(false); };
    const handleMoveButton = () => { const vw = window.innerWidth; const vh = window.innerHeight; const buttonWidth = 180; const buttonHeight = 45; const randomTop = Math.random() * (vh - buttonHeight); const randomLeft = Math.random() * (vw - buttonWidth); setContinueButtonStyle({ position: 'fixed', top: `${randomTop}px`, left: `${randomLeft}px`, zIndex: 1070 }); };
    const handleSttLangChange=(e:ChangeEvent<HTMLSelectElement>)=>{setSttLang(e.target.value as SpeechLanguage);};

    // *** MODIFIED Settings Toggle ***
    const toggleSettings=()=>{
        const currentlyVisible = isSettingsOpen;
        closeAllModals(); // Close everything else first
        if (!currentlyVisible) {
            setIsSettingsOpen(true); // Only open if it was closed
        }
    };

    // *** NEW Advanced Settings Toggle ***
    const toggleAdvancedSettings = () => {
        const currentlyVisible = isAdvancedSettingsOpen;
        closeAllModals(); // Close everything else first
         // Only open if key is valid and it was previously closed
        if (!currentlyVisible && canAccessAdvanced) {
             setIsAdvancedSettingsOpen(true);
        } else if (!canAccessAdvanced) {
            console.warn("Attempted to open advanced settings without valid key.");
        }
    }
    // *** NEW Handler to open Advanced Settings from Main Settings ***

    const openInterviewMode = () => {
        // Optional: Check if key is valid if you want to restrict entry
        // if (!keyStatus.isValid) {
        //    alert("Access Key required for Interview Mode.");
        //    return;
        // }
        closeAllModals(); // Close others
        setIsInterviewModeOpen(true); // Open it
    };

    const closeInterviewMode = () => {
        setIsInterviewModeOpen(false);
        // Add any necessary cleanup specific to stopping the interview if needed
    };
    const executeClearChat = () => { console.log("Executing clear chat logic after confirmation."); const timestamp = Date.now(); const clearMessage: Message = { id: timestamp, text: "Chat cleared.", sender: 'bot', timestamp: timestamp }; setMessages([clearMessage]); localStorage.removeItem(CHAT_STORAGE_KEY); closeAllModals(); };
    const handleAccessKeyChange=(e:ChangeEvent<HTMLInputElement>)=>{setEnteredKey(e.target.value);};
    const handleExportChat=()=>{ const msgs = messages.filter(m => m.sender !== 'loading'); if (msgs.length === 0 || (msgs.length === 1 && msgs[0].sender === 'bot' && msgs[0].text === "Welcome!")) { alert("Chat is empty or only contains the welcome message."); return; } let c = `Chat Export\nTimestamp: ${new Date().toLocaleString()}\nModel: ${selectedModel}\nPersona: ${selectedPersona}\nUser: ${keyStatus.isValid ? keyStatus.username : 'N/A (No valid key)'}\nTheme: ${currentTheme}\n----\n\n`; msgs.forEach(m => { const t = new Date(m.timestamp).toLocaleString(); c += `[${t}] ${m.sender === 'user' ? 'User' : 'Bot'}:\n${m.text}\n${m.imageUrl ? `(Image Attachment: ${m.imageUrl.substring(0,50)}...)\n` : ''}\n`; }); try { const b = new Blob([c], { type: 'text/plain;charset=utf-8' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); const f = `theraphy-chat-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`; a.href = u; a.download = f; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u); if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY") ReactGA.event({ category: "Chat", action: "Export", label: `Msg Count: ${msgs.length}` }); closeAllModals(); } catch (e) { console.error("Export failed:", e); alert("Failed to export chat."); } };

    // *** MODIFIED Staff Login Toggle ***
    const toggleStaffLoginModal = () => {
        const currentlyVisible = isStaffLoginModalVisible;
        closeAllModals();
        if (!currentlyVisible) { setIsStaffLoginModalVisible(true); }
        else { setEnteredStaffKey(''); setStaffLoginError(null); }
    };

    const handleStaffKeyChange = (e: ChangeEvent<HTMLInputElement>) => { setEnteredStaffKey(e.target.value); setStaffLoginError(null);};
    const handleStaffLogin = async () => { if (!enteredStaffKey.trim()) { setStaffLoginError("Staff key is required."); return; } setIsStaffLoginLoading(true); setStaffLoginError(null); try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'staffLogin', staffKey: enteredStaffKey }) }); const data = await res.json().catch(() => ({ error: 'Invalid JSON response from server.' })); if (!res.ok || !data.isValid) { throw new Error(data?.error || `Login Failed (Status: ${res.status})`); } sessionStorage.setItem('staffKey', enteredStaffKey); closeAllModals(); setEnteredStaffKey(''); navigate('/admin'); } catch (e) { setStaffLoginError(e instanceof Error ? e.message : "Login failed due to an unknown error."); sessionStorage.removeItem('staffKey'); } finally { setIsStaffLoginLoading(false); } };

    // *** MODIFIED Feedback Modal Toggle ***
    const toggleFeedbackModal = () => {
        const currentlyVisible = isFeedbackModalVisible;
        closeAllModals();
        if (!currentlyVisible) { setIsFeedbackModalVisible(true); }
        else { setFeedbackEmail(''); setFeedbackRating(0); setFeedbackComment(''); setFeedbackError(null); setFeedbackSuccess(null); setIsSubmittingFeedback(false); }
    };

    const handleFeedbackSubmit = async (e: React.FormEvent) => { e.preventDefault(); if (feedbackRating === 0) { setFeedbackError("Please select a star rating."); return; } if (!feedbackComment.trim()) { setFeedbackError("Please provide a comment."); return; } if (feedbackComment.length > 2000) { setFeedbackError("Comment is too long (max 2000 characters)."); return; } setIsSubmittingFeedback(true); setFeedbackError(null); setFeedbackSuccess(null); const payload: ApiRequestBody = { action: 'submitFeedback', email: feedbackEmail.trim() || null, rating: feedbackRating, comment: feedbackComment.trim() }; try { const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await res.json().catch(() => ({ error: 'Invalid JSON response' })); if (!res.ok || !data.success) { throw new Error(data?.error || `Submit failed: ${res.statusText}`); } setFeedbackSuccess("Thank you! Your feedback has been submitted."); setFeedbackEmail(''); setFeedbackRating(0); setFeedbackComment(''); if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-JX58QMMKZY") { ReactGA.event({ category: "Feedback", action: "Submit", label: `Rating: ${feedbackRating}` }); } } catch (err) { setFeedbackError(err instanceof Error ? err.message : "Failed to submit feedback."); } finally { setIsSubmittingFeedback(false); } };
    const toggleTheme = useCallback(() => { setCurrentTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light')); }, []);

    // *** MODIFIED Game Modal Triggers ***
    const openPersonaPlinko = () => {
        if (!canAccessAdvanced) return; // Should be disabled, but check anyway
        setIsAdvancedSettingsOpen(false); // Close advanced settings first
        setIsPersonaPlinkoVisible(true);
    }
    const openClearCupGame = () => {
        setIsSettingsOpen(false); // Close main settings first
        setIsClearCupGameVisible(true);
    }
    const openModelBuilder = () => {
         if (!canAccessAdvanced) return; // Also depends on key if called from advanced
        setIsAdvancedSettingsOpen(false); // Close advanced settings first
        setIsModelBuilderVisible(true);
    }

    // Handler for Persona selected from Plinko game
    const handlePersonaSelectedFromPlinko = (persona: Persona) => { setSelectedPersona(persona); setIsPersonaPlinkoVisible(false); }; // Game closes itself
    // Handler for Model selected from Builder game
    const handleModelSelectedFromBuilder = (model: GeminiModel) => { setSelectedModel(model); setIsModelBuilderVisible(false); }; // Game closes itself


    // --- JSX ---
    // --- JSX ---
    return (
        <div className="App">
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

            {/* Introduction Modal */}
            {showIntroduction && !showBetaNotice && (
                <div className="intro-notice-overlay">
                    <div className="intro-notice-modal" style={{ position: 'relative' }}>
                        <h2>วิธีใช้งาน Project Theraphy</h2>
                        {introductionSections.map(section => (
                            <div className="intro-section" key={section.key}>
                                <div className="intro-section-content">
                                    <h4>{section.title}</h4>
                                    <p style={{ whiteSpace: 'pre-wrap' }}>{section.text}</p>
                                </div>
                                <div className="intro-section-toggle">
                                    <label className="switch" title={`ยืนยันว่าอ่านหัวข้อ ${section.title}`}>
                                        <input type="checkbox" checked={introSectionsAcknowledged[section.key]} onChange={() => handleSectionToggle(section.key)} />
                                        <span className="slider round"></span>
                                    </label>
                                </div>
                            </div>
                        ))}
                        <div className="intro-button-container">
                            <button
                                style={continueButtonStyle}
                                onClick={allIntroSectionsAcknowledged ? handleAcceptIntroduction : handleMoveButton}
                                className={`intro-accept-button ${!allIntroSectionsAcknowledged ? 'button-runaway' : ''}`}
                                title={!allIntroSectionsAcknowledged ? "โปรดยืนยันทุกหัวข้อก่อน!" : "เริ่มแชท"}
                            >
                                {allIntroSectionsAcknowledged ? "เริ่มแชท" : "ยืนยันให้ครบก่อน"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Menu Modal (Main Settings) */}
            {isSettingsOpen && (
                <div className="settings-menu" role="dialog" aria-labelledby="settings-title">
                    <h3 id="settings-title">Settings</h3>
                    {/* Use single column layout now */}
                    <div className="settings-column" style={{gap: '20px'}}>

                        {/* Speech Input Lang */}
                        <div className="settings-option">
                            <label htmlFor="stt-lang-select">Speech Input Lang:</label>
                            <select id="stt-lang-select" value={sttLang} onChange={handleSttLangChange} className="settings-select">
                                <option value="en-US">English (US)</option>
                                <option value="th-TH">ไทย (Thai)</option>
                                <option value="es-ES">Español (Spain)</option>
                                <option value="fr-FR">Français (France)</option>
                            </select>
                        </div>
                        {/* Appearance */}
                        <div className="settings-option">
                            <label>Appearance:</label>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                                <button onClick={toggleTheme} id="theme-toggle" className="settings-action-button theme-toggle-button">
                                    {currentTheme === 'light' ? '🌙 Switch to Dark Mode' : '☀️ Switch to Light Mode'}
                                </button>
                            </div>
                        </div>
                        {/* Chat Actions */}
                        <div className="settings-option">
                            <label>Chat Actions:</label>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                                <button onClick={handleExportChat} className="settings-action-button export-chat-settings-button">💾 Export Chat</button>
                                <button onClick={openClearCupGame} className="settings-action-button clear-chat-settings-button">🗑️ Clear Chat History</button>
                             </div>
                        </div>

                        {/* Advanced Settings Button */}
                        <div className="settings-option">
                            <label>Advanced Configuration:</label>
                             <button
                                onClick={() => { console.log("CLICK: Advanced Settings Button"); openAdvancedSettingsFromMain(); }} // <<< ADD LOG TO onClick
                                className="settings-action-button advanced-settings-trigger-button" // Styled green via CSS
                                // No 'disabled' attribute here
                                title="Configure Model, Persona & Key"
                            >
                                🔑 Advanced Settings...
                            </button>
                             {/* No conditional helper text here */}
                        </div>

                        {/* Admin Area */}
                        <div className="settings-option">
                            <label>Admin Area:</label>
                            <button onClick={toggleStaffLoginModal} className="settings-action-button staff-area-button">🔑 Staff Login</button>
                        </div>
                    </div>
                    <hr className="settings-separator" />
                    <button onClick={toggleSettings} className="close-settings-button">Close Settings</button>
                </div>
            )}

            {/* Advanced Settings Modal */}
            {isAdvancedSettingsOpen && (
                 <div className="settings-menu advanced-settings-modal" role="dialog" aria-labelledby="advanced-settings-title">
                    <h3 id="advanced-settings-title">Advanced Settings</h3>
                     <div className="settings-column" style={{gap: '20px'}}>
                        {/* Access Key Input */}
                        <div className="settings-option">
                            <label htmlFor="access-key-input-adv">Access Key:</label>
                            <input
                                type="password"
                                id="access-key-input-adv"
                                className="settings-input"
                                placeholder="Enter access key"
                                value={enteredKey}
                                onChange={handleAccessKeyChange}
                                autoComplete="off"
                            />
                            <div className="settings-key-status">
                                {keyStatus.loading ? (<span>Validating...</span>)
                                : keyStatus.isValid ? (<span>✅ Valid Key ({keyStatus.username || 'User'})</span>)
                                : keyStatus.error ? (<span>❌ {keyStatus.error}</span>)
                                : (<span>Enter key for restricted features.</span>)}
                            </div>
                        </div>
                        {/* Persona Setting */}
                        <div className="settings-option">
                            <label>Persona:</label>
                            <p className="current-persona-display">
                                {AVAILABLE_PERSONAS.find(p => p.value === selectedPersona)?.emoji}
                                {' '}
                                {AVAILABLE_PERSONAS.find(p => p.value === selectedPersona)?.label || selectedPersona}
                            </p>
                            <button
                                onClick={openPersonaPlinko}
                                className="settings-action-button persona-change-button"
                                disabled={!canChangePersona}
                                title={!canChangePersona ? "Requires a valid Access Key..." : "Change Persona (Opens Game)"}
                            >
                                Change Persona
                            </button>
                            {!canChangePersona && (<p className="settings-helper-text">Enter key to change.</p>)}
                        </div>
                        {/* AI Model Setting */}
                        <div className="settings-option">
                            <label>AI Model:</label>
                            <p className="current-persona-display">
                                {ALL_AVAILABLE_MODELS_FRONTEND.find(m => m.value === selectedModel)?.label || selectedModel}
                            </p>
                             <button
                                onClick={openModelBuilder}
                                className="settings-action-button model-builder-trigger-button" // Keep this class for green styling
                                disabled={!canAccessAdvanced} // <<< ADD THIS restriction
                                title={!canAccessAdvanced ? "Requires a valid Access Key" : "Build custom model combination"} // <<< ADD conditional title
                            >
                                🔧 Build AI Model...
                            </button>
                            {/* <<< ADD conditional helper text >>> */}
                            {!canAccessAdvanced && (
                                <p className="settings-helper-text">Enter key to build models.</p>
                            )}
                         </div>
                     </div>
                    <hr className="settings-separator" />
                    <button onClick={toggleAdvancedSettings} className="close-settings-button">Close Advanced</button>
                </div>
            )}

            {/* Staff Login Modal */}
            {isStaffLoginModalVisible && (
                <div className="staff-panel-overlay">
                    <div className="staff-panel-modal" style={{ maxWidth: '400px' }}>
                        <h3 id="staff-login-title">Staff Login</h3>
                        <button onClick={toggleStaffLoginModal} className="close-staff-panel-button" title="Close Login">×</button>
                        <form onSubmit={(e)=>{e.preventDefault(); handleStaffLogin();}} className="staff-login-section">
                            <div className="settings-option">
                                <label htmlFor="staff-key-modal-input">Staff Key:</label>
                                <input type="password" id="staff-key-modal-input" className="settings-input" value={enteredStaffKey} onChange={handleStaffKeyChange} placeholder="Enter staff access key" disabled={isStaffLoginLoading} autoFocus required/>
                            </div>
                            <button type="submit" className="staff-login-button" disabled={isStaffLoginLoading || !enteredStaffKey.trim()}>{isStaffLoginLoading ? 'Verifying...' : 'Login & Enter Admin'}</button>
                            {staffLoginError && <p className="staff-error">{staffLoginError}</p>}
                            <p className="staff-security-warning">Enter key to access admin page.</p>
                        </form>
                    </div>
                </div>
            )}
            {isInterviewModeOpen && (
                <InterviewMode
                    isOpen={isInterviewModeOpen}
                    onClose={closeInterviewMode} // Pass the closing handler
                    selectedModel={selectedModel} // Pass relevant props
                    accessKey={enteredKey}
                    sttLang={sttLang}
                />
            )}
            {/* Feedback Modal */}
            {isFeedbackModalVisible && (
                <div className="feedback-modal-overlay">
                    <div className="feedback-modal">
                        <h3 id="feedback-title">Submit Feedback</h3>
                        <button onClick={toggleFeedbackModal} className="close-feedback-button" title="Close Feedback">×</button>
                        {feedbackSuccess && <p className="feedback-message success">{feedbackSuccess}</p>}
                        {feedbackError && <p className="feedback-message error">{feedbackError}</p>}
                        {!feedbackSuccess && (
                           <form onSubmit={handleFeedbackSubmit} className="feedback-form">
                                <div className="feedback-field">
                                    <label htmlFor="feedback-email">Email (Optional):</label>
                                    <input type="email" id="feedback-email" className="settings-input" value={feedbackEmail} onChange={(e) => setFeedbackEmail(e.target.value)} placeholder="your.email@example.com" maxLength={250} disabled={isSubmittingFeedback}/>
                                </div>
                                <div className="feedback-field">
                                    <label>Rating:<span style={{color:'red'}}>*</span></label>
                                    <div className="star-rating">
                                        {[1, 2, 3, 4, 5].map(star => (
                                            <button key={star} type="button" aria-pressed={star === feedbackRating} className={`star-button ${star <= feedbackRating ? 'selected' : ''}`} onClick={() => setFeedbackRating(star)} disabled={isSubmittingFeedback} aria-label={`Rate ${star}/5`}>★</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="feedback-field">
                                    <label htmlFor="feedback-comment">Comment:<span style={{color:'red'}}>*</span></label>
                                    <textarea id="feedback-comment" className="settings-input" rows={5} value={feedbackComment} onChange={(e) => setFeedbackComment(e.target.value)} placeholder="Tell us about your experience, suggestions, or any bugs..." maxLength={2000} required disabled={isSubmittingFeedback}/>
                                </div>
                                <div className="feedback-actions">
                                    <button type="button" onClick={toggleFeedbackModal} className="cancel-feedback-button" disabled={isSubmittingFeedback}>Cancel</button>
                                    <button type="submit" className="submit-feedback-button" disabled={isSubmittingFeedback || feedbackRating === 0 || !feedbackComment.trim()}>{isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'}</button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* --- Render Correct Game Modals --- */}
            {isPersonaPlinkoVisible && ( <PersonaPlinkoGame isOpen={isPersonaPlinkoVisible} onClose={() => setIsPersonaPlinkoVisible(false)} onPersonaSelected={handlePersonaSelectedFromPlinko} keyStatus={keyStatus} allPersonas={AVAILABLE_PERSONAS} /> )}
            {isClearCupGameVisible && ( <ConfirmClearCupGame isOpen={isClearCupGameVisible} onClose={() => setIsClearCupGameVisible(false)} onConfirm={executeClearChat} /> )}
            {isModelBuilderVisible && ( <ModelBuilderGame isOpen={isModelBuilderVisible} onClose={() => setIsModelBuilderVisible(false)} onModelSelected={handleModelSelectedFromBuilder} keyStatus={keyStatus} allModelsInfo={ALL_AVAILABLE_MODELS_FRONTEND} restrictedModels={RESTRICTED_MODELS_VALUES} /> )}

            {/* Main Routing and Layout */}
            {!showBetaNotice && !showIntroduction && (
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
                                onTriggerInterview={openInterviewMode} // <<< ADD PROP
                            />
                        </>
                    } />
                    <Route path="/admin" element={
                        <ProtectedRoute>
                            <AdminPage />
                        </ProtectedRoute>
                    } />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
             )}

        </div> // End div.App
    );
}

export default App;